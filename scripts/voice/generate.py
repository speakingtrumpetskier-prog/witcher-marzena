#!/usr/bin/env python3
"""Offline voice generation for MARZENA.

Reads scripts/voice/lines.json (from `node scripts/voice/extract.mjs`) and scripts/voice/cast.json,
renders every line with an open text-to-speech model on this machine, loudness-normalizes it with
ffmpeg, writes mono MP3 files to public/voice/<speaker>/<hash>.mp3 and keeps public/voice/manifest.json
up to date. Resumable: a line whose file already exists is skipped (use --force to redo it).

Run from the repo root (any directory works, paths are resolved from this file):

    python scripts/voice/generate.py --engine kokoro --only vesna --limit 5     # a spread of 5 lines to listen to
    python scripts/voice/generate.py --engine kokoro                            # everything, stage 1
    python scripts/voice/generate.py --engine chatterbox --only hanka --force   # stage 2 for one character
    python scripts/voice/generate.py --engine auto                              # each character's "engine" in cast.json
    python scripts/voice/generate.py --dry-run                                  # plan + full file/manifest/ffmpeg logic with
                                                                                #   tones, no models, output in a temp dir

Engines
    kokoro      Kokoro-82M (Apache-2.0), British English ('b'), weighted voice blends, speed, light pitch shift.
    chatterbox  Chatterbox (MIT) zero-shot cloning from a reference clip that Kokoro renders from the
                character's own blend (scripts/voice/refs/<speaker>.wav; never a real person's recording).
    auto        per character: cast.json "engine" (falls back to kokoro when chatterbox is not installed).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

if sys.version_info < (3, 10):
    sys.exit("generate.py needs Python 3.10 or newer (3.11 recommended).")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEFAULT_OUT = ROOT / "public"
SR = 24000                      # both Kokoro and Chatterbox render at 24 kHz
TARGET_LUFS = -18.0
TARGET_TP = -2.0                # leaves headroom so the MP3 stays under -1 dBTP after encoding
HEADER = "\033[1m"
END = "\033[0m"


# ------------------------------------------------------------------------------------------------
# small helpers

def log(msg: str = "") -> None:
    print(msg, flush=True)


def warn(msg: str) -> None:
    print(f"WARN  {msg}", file=sys.stderr, flush=True)


def die(msg: str, code: int = 2) -> None:
    print(f"\nERROR {msg}\n", file=sys.stderr, flush=True)
    sys.exit(code)


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        die(f"{path} not found. Run `node scripts/voice/extract.mjs` first." if path.name == "lines.json" else f"{path} not found.")
    except json.JSONDecodeError as e:
        die(f"{path} is not valid JSON: {e}")


def fmt_time(s: float) -> str:
    s = int(max(0, s))
    h, r = divmod(s, 3600)
    m, sec = divmod(r, 60)
    return f"{h}h{m:02d}m" if h else (f"{m}m{sec:02d}s" if m else f"{sec}s")


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def deep_merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in (over or {}).items():
        out[k] = deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


# ------------------------------------------------------------------------------------------------
# environment checks

def check_ffmpeg() -> None:
    missing = [t for t in ("ffmpeg", "ffprobe") if shutil.which(t) is None]
    if missing:
        die(
            f"{' and '.join(missing)} not found on PATH.\n"
            "  macOS:   brew install ffmpeg\n"
            "  Ubuntu:  sudo apt-get install ffmpeg\n"
            "  Windows: winget install Gyan.FFmpeg"
        )
    enc = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    if "libmp3lame" not in enc:
        die("this ffmpeg was built without libmp3lame (MP3 encoder). Install a full build (brew install ffmpeg).")
    flt = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    if "loudnorm" not in flt:
        die("this ffmpeg has no loudnorm filter (needs ffmpeg 3.1 or newer).")


def check_espeak() -> None:
    """Kokoro's English fallback phonemizer needs espeak-ng (a system binary, or the espeakng_loader wheel)."""
    if shutil.which("espeak-ng") or shutil.which("espeak"):
        return
    try:
        import espeakng_loader  # noqa: F401  (ships the library inside the wheel)
        return
    except ImportError:
        pass
    die(
        "espeak-ng not found (Kokoro needs it to pronounce words it does not know).\n"
        "  macOS:   brew install espeak-ng\n"
        "  Ubuntu:  sudo apt-get install espeak-ng\n"
        "  or:      pip install espeakng-loader\n"
        "Then run this script again."
    )


def pick_device(pref: str) -> str:
    try:
        import torch  # imported lazily: --dry-run never gets here
    except ImportError:
        die(
            "PyTorch is not installed in this Python environment.\n"
            "  Activate the venv (`source .venv/bin/activate`) and run `pip install -r scripts/voice/requirements.txt`,\n"
            "  or use --dry-run to test the file pipeline without models."
        )
    if pref != "auto":
        return pref
    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"


# ------------------------------------------------------------------------------------------------
# text preparation

class Lexicon:
    def __init__(self, path: Path):
        words = {}
        if path.exists():
            words = load_json(path).get("words", {})
        self.words = words
        self.rx = None
        if words:
            alt = "|".join(re.escape(w) for w in sorted(words, key=len, reverse=True))
            self.rx = re.compile(rf"\b({alt})\b")

    def apply(self, text: str) -> str:
        text = (
            text.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
            .replace("\u2026", "...").replace("\u2014", ", ").replace("\u2013", ", ").replace("*", "")
        )
        text = re.sub(r"\s+", " ", text).strip()
        if self.rx:
            text = self.rx.sub(lambda m: self.words[m.group(1)], text)
        return text


# ------------------------------------------------------------------------------------------------
# audio files

def write_wav(path: Path, samples, sr: int) -> None:
    """Float samples in [-1, 1] (numpy array or list) to a 16-bit mono WAV."""
    try:
        import numpy as np

        a = np.clip(np.asarray(samples, dtype="float32"), -1.0, 1.0)
        data = (a * 32767.0).astype("<i2").tobytes()
    except ImportError:  # dry-run without numpy
        data = b"".join(struct.pack("<h", int(clamp(float(s), -1.0, 1.0) * 32767)) for s in samples)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data)


def run_ffmpeg(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", *args], capture_output=True, text=True)


def pre_filters(post: dict, sr: int) -> list[str]:
    """Pitch shift (resample, then restore duration), optional echo, silence trim."""
    f: list[str] = []
    semis = float(post.get("pitch", 0) or 0)
    if abs(semis) > 0.01:
        r = 2 ** (semis / 12.0)
        f += [f"asetrate={sr * r:.3f}", f"aresample={sr}", f"atempo={1.0 / r:.6f}"]
    if post.get("echo"):
        f += ["apad=pad_dur=0.3", f"aecho={post['echo']}"]
    trim = "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-48dB:start_silence=0.03"
    f += [trim, "areverse", trim, "afade=t=in:d=0.025", "areverse", "afade=t=in:d=0.006"]
    return f


def encode_mp3(src_wav: Path, dst_mp3: Path, post: dict, sr: int, bitrate: str, mp3_rate: int, level_db: float = 0.0) -> None:
    """Two-pass loudnorm to -18 LUFS integrated (plus the line's own level offset: quiet lines stay quiet) / -2 dBTP, then mono MP3."""
    pre = ",".join(pre_filters(post, sr))
    ln = f"loudnorm=I={TARGET_LUFS + clamp(level_db, -9.0, 3.0):.1f}:TP={TARGET_TP}:LRA=11"
    p1 = run_ffmpeg(["-i", str(src_wav), "-af", f"{pre},{ln}:print_format=json", "-f", "null", "-"])
    if p1.returncode != 0:
        raise RuntimeError(f"ffmpeg (measure) failed: {p1.stderr.strip().splitlines()[-1] if p1.stderr.strip() else p1.returncode}")
    stats = None
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p1.stderr, re.S)
    if m:
        try:
            stats = json.loads(m.group(0))
            for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset"):
                v = float(stats[k])
                if math.isinf(v) or math.isnan(v):
                    stats = None
                    break
        except (ValueError, KeyError, json.JSONDecodeError):
            stats = None
    if stats:
        ln2 = (
            f"{ln}:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}"
            f":measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
        )
    else:  # very short or silent clip: single pass
        ln2 = ln
    dst_mp3.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst_mp3.with_name(dst_mp3.name + ".part")
    p2 = run_ffmpeg([
        "-i", str(src_wav), "-af", f"{pre},{ln2}", "-ac", "1", "-ar", str(mp3_rate),
        "-c:a", "libmp3lame", "-b:a", bitrate, "-map_metadata", "-1", "-fflags", "+bitexact", "-f", "mp3", str(tmp),
    ])
    if p2.returncode != 0 or not tmp.exists():
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"ffmpeg (encode) failed: {p2.stderr.strip().splitlines()[-1] if p2.stderr.strip() else p2.returncode}")
    os.replace(tmp, dst_mp3)


def probe_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return round(float(r.stdout.strip()), 2)
    except ValueError:
        return 0.0


# ------------------------------------------------------------------------------------------------
# manifest

class Manifest:
    def __init__(self, path: Path):
        self.path = path
        self.data: dict = {}
        if path.exists():
            try:
                self.data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                backup = path.with_suffix(".json.bad")
                shutil.copy(path, backup)
                warn(f"{path} was not valid JSON; copied to {backup.name} and starting a new manifest")
        self._dirty = False

    def set(self, h: str, file: str, dur: float, speaker: str, text: str) -> None:
        self.data[h] = {"file": file, "dur": dur, "speaker": speaker, "text": text}
        self._dirty = True

    def remove(self, h: str) -> None:
        if self.data.pop(h, None) is not None:
            self._dirty = True

    def save(self, force: bool = False) -> None:
        if not (self._dirty or force):
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        rows = [f"{json.dumps(k)}:{json.dumps(v, ensure_ascii=False, separators=(',', ':'))}" for k, v in sorted(self.data.items())]
        tmp = self.path.with_name(self.path.name + ".part")
        tmp.write_text("{\n" + ",\n".join(rows) + "\n}\n", encoding="utf-8")
        os.replace(tmp, self.path)
        self._dirty = False


# ------------------------------------------------------------------------------------------------
# engines

class EngineUnavailable(Exception):
    """The engine's package is not installed (the caller decides whether that is fatal)."""


class DryEngine:
    """Stands in for a model: a soft voiced tone with a syllable rhythm, so durations scale with the text."""

    name = "dry"
    sr = SR

    def synth(self, text: str, speaker: str, cfg: dict, line: dict):
        pace = float(line.get("pace", 1.0)) * float(cfg.get("speed", 1.0))
        dur = clamp(0.4 + len(text) * 0.062 / max(0.5, pace), 0.5, 14.0)
        base = 110 + (sum(map(ord, speaker)) % 90)
        n = int(dur * SR)
        out = []
        for i in range(n):
            t = i / SR
            env = 0.5 + 0.5 * math.sin(2 * math.pi * 4.2 * t)
            edge = min(1.0, t / 0.03, (dur - t) / 0.06)
            v = math.sin(2 * math.pi * base * t) + 0.5 * math.sin(2 * math.pi * base * 2 * t) + 0.25 * math.sin(2 * math.pi * base * 3 * t)
            out.append(0.25 * v * (0.35 + 0.65 * env) * max(0.0, edge))
        return out, SR


class KokoroEngine:
    name = "kokoro"
    sr = SR

    def __init__(self, device: str):
        try:
            import numpy  # noqa: F401
            import torch
            from kokoro import KPipeline
        except ImportError as e:
            raise EngineUnavailable(f"Kokoro is not installed ({e}). In the venv: pip install -r scripts/voice/requirements.txt") from e
        self.torch = torch
        self.device = device
        log(f"loading Kokoro-82M (British 'b') on {device} ...")
        pipe = None
        for kwargs in (
            {"lang_code": "b", "repo_id": "hexgrad/Kokoro-82M", "device": device},
            {"lang_code": "b", "device": device},
            {"lang_code": "b", "repo_id": "hexgrad/Kokoro-82M"},
            {"lang_code": "b"},
        ):
            try:
                pipe = KPipeline(**kwargs)
                break
            except TypeError:
                continue
            except RuntimeError as e:
                if device != "cpu" and "device" in kwargs:
                    warn(f"Kokoro on {device} failed ({e}); trying CPU")
                    device = "cpu"
                    continue
                raise
        if pipe is None:
            raise EngineUnavailable("could not construct kokoro.KPipeline(lang_code='b'); check the installed kokoro version")
        self.pipe = pipe
        self._voices: dict[str, object] = {}

    def voice(self, blend: dict):
        key = json.dumps(blend, sort_keys=True)
        if key in self._voices:
            return self._voices[key]
        names = list(blend)
        total = float(sum(blend.values())) or 1.0
        if len(names) == 1:
            v = names[0]
        else:
            tensors = [self.pipe.load_voice(n) for n in names]
            v = sum(t * (float(blend[n]) / total) for n, t in zip(names, tensors))
        self._voices[key] = v
        return v

    def synth(self, text: str, speaker: str, cfg: dict, line: dict):
        import numpy as np

        speed = clamp(float(cfg.get("speed", 1.0)) * float(line.get("pace", 1.0)), 0.6, 1.4)
        voice = self.voice(cfg["voice"])
        chunks = []
        for result in self.pipe(text, voice=voice, speed=speed, split_pattern=r"\n+"):
            audio = getattr(result, "audio", None)
            if audio is None and isinstance(result, (tuple, list)) and len(result) >= 3:
                audio = result[2]
            if audio is None:
                continue
            a = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
            chunks.append(a.astype("float32").reshape(-1))
        if not chunks:
            raise RuntimeError("Kokoro returned no audio")
        gap = np.zeros(int(0.14 * SR), dtype="float32")
        out = chunks[0]
        for c in chunks[1:]:
            out = np.concatenate([out, gap, c])
        return out, SR


class ChatterboxEngine:
    name = "chatterbox"

    def __init__(self, device: str):
        try:
            import torch
            from chatterbox.tts import ChatterboxTTS
        except ImportError as e:
            raise EngineUnavailable(
                f"Chatterbox is not installed ({e}).\n"
                "  Use a second venv for it (its pinned dependencies can clash with Kokoro's):\n"
                "  python3.11 -m venv .venv-cb && . .venv-cb/bin/activate && pip install chatterbox-tts soundfile numpy\n"
                "  Reference clips come from Kokoro: run `python scripts/voice/generate.py --make-refs` in the Kokoro venv first."
            ) from e
        self.torch = torch
        self.device = device
        if device != "cuda":
            # The published checkpoints were saved on CUDA; load them onto this device instead.
            orig = torch.load
            target = torch.device(device)

            def patched(*a, **k):
                k.setdefault("map_location", target)
                return orig(*a, **k)

            torch.load = patched
        log(f"loading Chatterbox on {device} (the first run downloads about 3 GB) ...")
        self.model = ChatterboxTTS.from_pretrained(device=device)
        self.sr = int(self.model.sr)

    def synth(self, text: str, speaker: str, cfg: dict, line: dict):
        ref = cfg["ref"]
        exag = clamp(float(line.get("exaggeration", 0.33)) * float(cfg.get("exag_scale", 1.0)), 0.15, 0.8)
        pace = float(line.get("pace", 1.0))
        cfgw = clamp(float(cfg.get("cfg_weight", 0.45)) * (1.0 + (pace - 1.0) * 2.0), 0.2, 0.7)
        self.torch.manual_seed(int(line["hash"], 16) % (2 ** 31))
        wav = self.model.generate(text, audio_prompt_path=str(ref), exaggeration=exag, cfg_weight=cfgw)
        a = wav.detach().cpu().numpy() if hasattr(wav, "detach") else wav
        return a.reshape(-1), self.sr


# ------------------------------------------------------------------------------------------------
# main

def parse_args():
    ap = argparse.ArgumentParser(description="Generate MARZENA voice lines offline.", formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("--engine", choices=["kokoro", "chatterbox", "auto"], default="auto")
    ap.add_argument("--only", default="", help="comma separated speaker ids (vesna,hanka,...)")
    ap.add_argument("--kind", default="", help="comma separated: dialogue,cutscene,bark")
    ap.add_argument("--hash", default="", help="comma separated line hashes to (re)generate")
    ap.add_argument("--limit", type=int, default=0, help="per speaker: only N lines, spread evenly across the list (for listening tests)")
    ap.add_argument("--force", action="store_true", help="regenerate lines that already have a file")
    ap.add_argument("--dry-run", action="store_true", help="plan and exercise all file, ffmpeg and manifest logic with tones; no models; writes to a temp dir")
    ap.add_argument("--device", choices=["auto", "cuda", "mps", "cpu"], default="auto")
    ap.add_argument("--out", default="", help="output root, like public/ (default: public; dry-run: a temp dir)")
    ap.add_argument("--lines", default=str(HERE / "lines.json"))
    ap.add_argument("--cast", default=str(HERE / "cast.json"))
    ap.add_argument("--lexicon", default=str(HERE / "lexicon.json"))
    ap.add_argument("--refs-dir", default=str(HERE / "refs"))
    ap.add_argument("--bitrate", default="40k")
    ap.add_argument("--mp3-rate", type=int, default=24000, help="MP3 sample rate (24000 is fine in every browser including Safari)")
    ap.add_argument("--keep-wav", action="store_true", help="keep the raw model output next to the temp files and print where")
    ap.add_argument("--prune", action="store_true", help="delete clips and manifest entries whose line no longer exists in lines.json")
    ap.add_argument("--make-refs", action="store_true", help="only render the Chatterbox reference clips with Kokoro (add --force to redo them) and exit")
    ap.add_argument("--play", action="store_true", help="play each generated clip afterwards (afplay on macOS, ffplay elsewhere)")
    ap.add_argument("--no-espeak-check", action="store_true")
    return ap.parse_args()


def spread(items: list, k: int) -> list:
    n = len(items)
    if k <= 0 or k >= n:
        return items
    if k == 1:
        return [items[n // 2]]
    return [items[round(i * (n - 1) / (k - 1))] for i in range(k)]


def speaker_cfg(cast: dict, speaker: str) -> dict:
    return deep_merge(cast.get("defaults", {}), cast["speakers"][speaker])


def make_reference(kokoro: KokoroEngine, cfg: dict, speaker: str, refs_dir: Path, force: bool = False) -> Path:
    """A ~10 s neutral clip in the character's own Kokoro voice, with the character's pitch, as the cloning target."""
    refs_dir.mkdir(parents=True, exist_ok=True)
    out = refs_dir / f"{speaker}.wav"
    if out.exists() and not force:
        return out
    text = cfg.get("chatterbox", {}).get("ref_text") or cast_default_ref(cfg)
    audio, sr = kokoro.synth(text, speaker, cfg["kokoro"], {"pace": 1.0})
    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "ref_raw.wav"
        write_wav(raw, audio, sr)
        post = {"pitch": cfg.get("post", {}).get("pitch", 0)}
        flt = [f for f in pre_filters(post, sr) if "afade" not in f and "silenceremove" not in f and f != "areverse"]
        args = ["-i", str(raw)] + (["-af", ",".join(flt)] if flt else []) + ["-ac", "1", "-ar", str(SR), str(out)]
        p = run_ffmpeg(args)
        if p.returncode != 0:
            raise RuntimeError(f"ffmpeg (reference) failed: {p.stderr.strip()[-200:]}")
    log(f"  reference clip: {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}")
    return out


def cast_default_ref(cfg: dict) -> str:
    return cfg.get("chatterbox", {}).get("ref_text") or "The road was longer than anyone had said, and the wind did not stop for any of us."


def main() -> int:
    args = parse_args()
    t_start = time.time()
    lines_doc = load_json(Path(args.lines))
    cast = load_json(Path(args.cast))
    lexicon = Lexicon(Path(args.lexicon))
    all_lines = lines_doc["lines"]
    known = set(cast["speakers"])

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    bad = only - known
    if bad:
        die(f"unknown speaker(s) in --only: {', '.join(sorted(bad))}. Known: {', '.join(sorted(known))}")
    kinds = {s.strip() for s in args.kind.split(",") if s.strip()}
    hashes = {s.strip() for s in args.hash.split(",") if s.strip()}

    # Output locations.
    tmp_root = None
    if args.dry_run:
        if args.out and Path(args.out).resolve() == DEFAULT_OUT.resolve():
            die("--dry-run writes tones; it will not write into public/. Omit --out or point it at a scratch directory.")
        tmp_root = Path(args.out) if args.out else Path(tempfile.mkdtemp(prefix="marzena-voice-dry-"))
        out_root = tmp_root
    else:
        out_root = Path(args.out) if args.out else DEFAULT_OUT
    voice_dir = out_root / "voice"
    manifest = Manifest(voice_dir / "manifest.json")

    # Environment checks.
    have_ffmpeg = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
    if args.dry_run and not have_ffmpeg:
        warn("ffmpeg not found: the dry run will plan and write the WAV step only, no MP3 or durations")
    else:
        check_ffmpeg()

    # Selection.
    unknown_speakers: dict[str, int] = {}
    selected = []
    for ln in all_lines:
        sp = ln["speaker"]
        if sp not in known:
            unknown_speakers[sp] = unknown_speakers.get(sp, 0) + 1
            continue
        if only and sp not in only:
            continue
        if kinds and ln.get("kind") not in kinds:
            continue
        if hashes and ln["hash"] not in hashes:
            continue
        selected.append(ln)
    for sp, n in sorted(unknown_speakers.items()):
        warn(f"speaker '{sp}' ({n} lines) is not in cast.json: skipped. Add a cast entry to voice it.")
    if args.limit:
        by: dict[str, list] = {}
        for ln in selected:
            by.setdefault(ln["speaker"], []).append(ln)
        selected = [ln for sp in by for ln in spread(by[sp], args.limit)]

    def path_for(ln: dict) -> tuple[str, Path]:
        rel = f"voice/{ln['speaker']}/{ln['hash']}.mp3"
        return rel, out_root / rel

    # Resume: skip finished lines; adopt orphan files (encoded but not yet in the manifest).
    todo = []
    adopted = skipped = 0
    for ln in selected:
        rel, p = path_for(ln)
        done = p.exists() and not args.force
        if done:
            if ln["hash"] not in manifest.data or manifest.data[ln["hash"]].get("text") != ln["text"]:
                if have_ffmpeg:
                    manifest.set(ln["hash"], rel, probe_duration(p), ln["speaker"], ln["text"])
                    adopted += 1
            skipped += 1
            continue
        todo.append(ln)

    # Prune.
    if args.prune:
        live = {ln["hash"] for ln in all_lines}
        stale = [h for h in manifest.data if h not in live]
        for h in stale:
            f = out_root / manifest.data[h]["file"]
            if not args.dry_run:
                f.unlink(missing_ok=True)
            manifest.remove(h)
        log(f"pruned {len(stale)} stale clip(s)")

    # Engine plan per speaker.
    def engine_for(sp: str) -> str:
        if args.engine != "auto":
            return args.engine
        return speaker_cfg(cast, sp).get("engine", "kokoro")

    log(f"{HEADER}MARZENA voice generation{END}")
    log(f"  lines.json: {len(all_lines)} lines; selected {len(selected)}; already done {skipped}; to render {len(todo)}")
    log(f"  output: {out_root / 'voice'}{'   (dry run: tones, not speech)' if args.dry_run else ''}")
    plan: dict[str, int] = {}
    for ln in todo:
        key = f"{ln['speaker']}:{'dry' if args.dry_run else engine_for(ln['speaker'])}"
        plan[key] = plan.get(key, 0) + 1
    for k, n in sorted(plan.items()):
        log(f"    {k:<28}{n:>5} lines")
    if adopted:
        log(f"  adopted {adopted} existing file(s) into the manifest")
    if not todo and not args.make_refs:
        manifest.save(force=args.prune or adopted > 0)
        log("nothing to do.")
        return 0

    # Engines (lazy).
    engines: dict[str, object] = {}
    device = "dry"
    if not args.dry_run:
        refs_missing = any(not (Path(args.refs_dir) / f"{sp}.wav").exists() for sp in {ln["speaker"] for ln in todo})
        if (args.engine != "chatterbox" or refs_missing or args.make_refs) and not args.no_espeak_check:
            check_espeak()
        if args.device in ("auto", "mps"):
            os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        device = pick_device(args.device)
        log(f"  device: {device}")

    def get_engine(name: str):
        """Engines are loaded on first use. A missing package is fatal when the engine was asked for by
        name, and a one-time warning (falling back to Kokoro) in --engine auto."""
        if args.dry_run:
            return engines.setdefault("dry", DryEngine())
        if name not in engines:
            try:
                engines[name] = KokoroEngine(device) if name == "kokoro" else ChatterboxEngine(device)
            except EngineUnavailable as e:
                if name == "chatterbox" and args.engine == "auto":
                    warn(f"{e}\n  Falling back to Kokoro for the characters set to chatterbox.")
                    engines[name] = None
                else:
                    die(str(e))
        return engines[name]

    refs_dir = Path(args.refs_dir)
    if args.make_refs:
        if args.dry_run:
            die("--make-refs needs Kokoro; it cannot be a dry run")
        kok = get_engine("kokoro")
        who = sorted(only) if only else sorted(known)
        for sp in who:
            cfg = speaker_cfg(cast, sp)
            if not cfg.get("kokoro"):
                continue
            make_reference(kok, cfg, sp, refs_dir, force=args.force)
        log("reference clips done.")
        return 0

    # Render.
    work = Path(tempfile.mkdtemp(prefix="marzena-voice-"))
    total_chars = sum(len(ln["text"]) for ln in todo)
    done_chars = 0
    t0 = time.time()
    failures: list[tuple[str, str]] = []
    made: list[Path] = []
    audio_sec = 0.0
    try:
        for i, ln in enumerate(todo, 1):
            sp, h, text = ln["speaker"], ln["hash"], ln["text"]
            cfg_all = speaker_cfg(cast, sp)
            eng_name = engine_for(sp)
            try:
                if args.dry_run:
                    eng = get_engine("dry")
                    cfg = cfg_all.get("kokoro", {})
                    post = dict(cfg_all.get("post", {}))
                else:
                    if eng_name == "chatterbox" and get_engine("chatterbox") is None:
                        eng_name = "kokoro"  # auto mode and Chatterbox is not installed
                    if eng_name == "chatterbox":
                        eng = get_engine("chatterbox")
                        ref = refs_dir / f"{sp}.wav"
                        if not ref.exists():
                            make_reference(get_engine("kokoro"), cfg_all, sp, refs_dir)
                        cfg = {**cfg_all.get("chatterbox", {}), "ref": ref}
                        post = {k: v for k, v in cfg_all.get("post", {}).items() if k != "pitch"}  # the clone already carries the pitch
                    else:
                        eng = get_engine("kokoro")
                        cfg = cfg_all["kokoro"]
                        post = dict(cfg_all.get("post", {}))
                tts_text = lexicon.apply(text)
                t_line = time.time()
                audio, sr = eng.synth(tts_text, sp, cfg, ln)
                wav = work / f"{h}.wav"
                write_wav(wav, audio, sr)
                rel, dst = path_for(ln)
                if have_ffmpeg:
                    encode_mp3(wav, dst, post, sr, args.bitrate, args.mp3_rate, float(ln.get("level", 0)))
                    dur = probe_duration(dst)
                    manifest.set(h, rel, dur, sp, text)
                    made.append(dst)
                else:  # dry run without ffmpeg: nothing to encode
                    dur = round(len(audio) / sr, 2)
                audio_sec += dur
                if not args.keep_wav:
                    wav.unlink(missing_ok=True)
                done_chars += len(text)
                elapsed = time.time() - t0
                rate = elapsed / max(1, done_chars)
                eta = rate * (total_chars - done_chars)
                shown = text if len(text) <= 46 else text[:43] + "..."
                log(f"[{i:>4}/{len(todo)}] {sp:<12} {h}  {dur:>5.1f}s  {time.time() - t_line:>5.1f}s wall  ETA {fmt_time(eta):>7}  {shown}")
                if i % 10 == 0:
                    manifest.save()
            except KeyboardInterrupt:
                raise
            except Exception as e:  # noqa: BLE001  keep going: one bad line must not lose the run
                failures.append((h, f"{sp}: {text[:40]}: {e}"))
                warn(f"line {h} ({sp}) failed: {e}")
    except KeyboardInterrupt:
        log("\ninterrupted: saving the manifest. Run the same command again to resume.")
    finally:
        manifest.save(force=True)
        if args.keep_wav:
            log(f"raw WAVs kept in {work}")
        else:
            shutil.rmtree(work, ignore_errors=True)

    size = sum(p.stat().st_size for p in made if p.exists())
    log(f"\ndone: {len(made)} clip(s), {audio_sec / 60:.1f} min of audio, {size / 1e6:.1f} MB, in {fmt_time(time.time() - t_start)}")
    log(f"manifest: {manifest.path}  ({len(manifest.data)} entries)")
    if args.dry_run:
        log(f"dry run output (tones, safe to delete): {out_root}")
    if failures:
        log(f"{len(failures)} line(s) failed:")
        for h, why in failures[:20]:
            log(f"  {h}  {why}")
    if args.play and made:
        player = ["afplay"] if shutil.which("afplay") else (["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet"] if shutil.which("ffplay") else None)
        if player:
            for p in made[:20]:
                subprocess.run([*player, str(p)])
        else:
            warn("--play: no afplay or ffplay found")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
