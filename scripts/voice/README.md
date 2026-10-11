# MARZENA voice pipeline

Voice acting for every spoken line, rendered **offline on your own machine** by open text-to-speech
models and shipped as small MP3 files. British accents. Design notes, the cast sheet and the honest
limits of the models are in [docs/VOICES.md](../../docs/VOICES.md).

```
node scripts/voice/extract.mjs        every spoken line -> scripts/voice/lines.json   (already committed; re-run after writing)
python scripts/voice/generate.py      lines.json + cast.json -> public/voice/<speaker>/<hash>.mp3 + public/voice/manifest.json
node scripts/voice/extract.mjs --report    which lines have no audio yet
```

The game finds a clip by `hash(speaker + normalized text)`. Change a line and it simply becomes
unvoiced until you generate again; nothing breaks without audio.

## One-time setup (macOS, Apple Silicon)

```sh
brew install python@3.11 ffmpeg espeak-ng
python3.11 -m venv ~/.venvs/marzena-voice
source ~/.venvs/marzena-voice/bin/activate
cd /path/to/witcher-marzena
pip install --upgrade pip
pip install -r scripts/voice/requirements.txt
```

The first generation run downloads Kokoro-82M (about 350 MB, from Hugging Face into `~/.cache/huggingface`) and a
small spaCy English model that Kokoro's text front end installs itself; it needs internet once, then works offline.
Python 3.10 to 3.12 works; 3.11 is the safe choice. On an NVIDIA box install the CUDA build of PyTorch
from pytorch.org before the `pip install -r` line. Device is picked automatically (cuda, then mps, then cpu);
force one with `--device cpu` if MPS misbehaves.

## Listen to a sample before generating everything

```sh
source ~/.venvs/marzena-voice/bin/activate
python scripts/voice/generate.py --engine kokoro --only vesna --limit 5 --play
```

`--limit 5` renders 5 lines per speaker spread across that speaker's lines (not just the first 5);
`--play` plays them with `afplay`. The files are in `public/voice/vesna/`. Do the same for each hard
voice: `--only ola,dobra,hanka,bogdan`.

Unhappy with a voice? Edit `scripts/voice/cast.json` (the blend weights, `speed`, `post.pitch`), then
`--only <speaker> --limit 5 --force` and listen again. A mispronounced name goes in `lexicon.json`.

## Full run

```sh
python scripts/voice/generate.py --engine kokoro
```

Resumable: kill it any time and run the same command again, it skips every line whose file exists.
Add `--force` to redo lines, `--only vesna,hanka` to limit speakers, `--kind bark` to limit to barks,
`--hash 4a936eced0` for single lines, `--prune` to delete clips of lines that no longer exist.

Expected time on an M-series Mac: Kokoro renders several times faster than real time, and ffmpeg
(two loudness passes and the MP3 encode) adds about 0.3 s per line. Budget **10 to 30 minutes** for
the whole script (about 600 lines today, around 1000 once the cutscenes are merged). Output is about
5 KB per second of speech, so roughly **10 to 15 MB** in total. It prints progress and an ETA per line.

Then commit `public/voice/` (the MP3s and `manifest.json`) and run the game; the **Voice** slider is in
Settings. `?novoice` turns voices off, `?voicelog` logs lines that have no clip.

## Stage 2: Chatterbox for the leads (optional)

Chatterbox acts a line with more life than Kokoro and takes a per-line exaggeration, but it is much
slower and only worth it for the characters who carry scenes (Hanka's confrontation, Vesna, Bogdan).
Its dependencies clash with Kokoro's, so use a second venv:

```sh
# 1. reference clips, made by Kokoro from each character's own blend (never a real person's recording)
source ~/.venvs/marzena-voice/bin/activate
python scripts/voice/generate.py --make-refs --only hanka,vesna,bogdan

# 2. Chatterbox in its own venv (about 3 GB download on first use)
python3.11 -m venv ~/.venvs/marzena-voice-cb && source ~/.venvs/marzena-voice-cb/bin/activate
pip install -r scripts/voice/requirements-chatterbox.txt
python scripts/voice/generate.py --engine chatterbox --only hanka --limit 5 --force --play
```

If you like it, run the character for real with `--force`, or set `"engine": "chatterbox"` for them in
`cast.json` and use `--engine auto` (each character uses its own setting; Chatterbox characters fall back
to Kokoro with a warning when it is not installed). Expect several seconds per line on Apple Silicon.
Per-line `exaggeration` and `cfg_weight` come from `lines.json` and `cast.json` (restrained by default).

## When the story changes

```sh
node scripts/voice/extract.mjs --report      # new lines are listed under "without audio", changed ones as STALE
python scripts/voice/generate.py             # renders only what is missing (add --prune to drop stale clips)
```

Cutscenes are read with a parser, not run. `d.say('hanka', 'literal text')` and `d.sub(text, dur, { voice: 'wiesia' })`
with literal text are found automatically; anything computed is listed as UNRESOLVED. A cutscene file can list
such lines itself: `export const voiceLines = [['hanka', 'Text.'], ...]`.

## lines.json

One entry per unique (speaker, text): `hash`, `speaker`, `text`, `kind` (dialogue, cutscene, bark), `source` and
`node` (file and node id, or `line N` in a cutscene), `direction` (a short note for humans), `exaggeration`
(Chatterbox, 0.18 to 0.55), `pace` (speed multiplier), `level` (dB relative to -18 LUFS, only when not 0) and `also`
(other places with the identical line, which share the clip). Edit the rules table in `extract.mjs` to change directions.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `ffmpeg and ffprobe not found` | `brew install ffmpeg` (needs libmp3lame, the Homebrew build has it) |
| `espeak-ng not found` | `brew install espeak-ng` (or `pip install espeakng-loader`) |
| MPS errors, crashes or noise | `--device cpu` (Kokoro is small; CPU is fine) |
| A name is said wrongly | add it to `lexicon.json`, then `--only <speaker> --force --hash <hash>` |
| A line sounds off | `--force --hash <hash>` renders it again (Chatterbox is seeded per line; change the text slightly or the cast) |
| Test the file logic without models | `python scripts/voice/generate.py --dry-run` (tones, written to a temp folder, never to `public/`) |

Licences: Kokoro-82M is Apache-2.0, Chatterbox is MIT (it embeds an inaudible Perth watermark in its output).

## Fastest route: Kokoro through ONNX (any CPU, no PyTorch)

This is how the shipped clips were made (about 16 minutes for all 612 lines on 4 CPU cores):

```
pip install kokoro-onnx soundfile          # in a venv; ffmpeg must be on the PATH
scripts/voice/fetch_onnx.sh                # official onnx-community Kokoro-82M v1.0 + the 8 British voices
node scripts/voice/extract.mjs             # refresh lines.json after editing dialogue or cutscenes
python scripts/voice/generate.py --engine kokoro-onnx   # renders only lines without a clip
```
The voices, blends and speeds come from cast.json exactly as in the PyTorch route.
