# Voice acting

Every spoken line in MARZENA (dialogue, cutscene, ambient bark) is voiced by an open text-to-speech
model run **offline on the developer's machine**, then shipped as a small MP3. British accents, in the
spirit of The Witcher 3's English cast. Nothing here calls a web service at build time or at runtime.

This page is the design and the cast sheet. Commands and setup are in
[scripts/voice/README.md](../scripts/voice/README.md). **No voice has been auditioned yet**: the
container this was built in has no models, so the settings below are informed starting points for a
first listening pass, not verified results. Plan to adjust the blends and pitches after hearing them.

## How it fits together

```
src/story/content/dialogues/*.js   --\
src/story/content/cutscenes/*.js   ---+-- node scripts/voice/extract.mjs --> scripts/voice/lines.json
src/gameplay/npcs/barks.js, STORY.md section 5 --/                                 |
                                                                                     v
scripts/voice/cast.json (who sounds like what)  --> python scripts/voice/generate.py --> public/voice/<speaker>/<hash>.mp3
scripts/voice/lexicon.json (name spellings)                                        \-> public/voice/manifest.json
                                                                                          |
                          game: src/audio/voice.js (G.voice)  <---------------------------/
                          hooks: Dialogue.js, Cutscene.js, NPC.bark, settings (Voice volume)
```

### Line identity and the manifest

A line is identified by `lineHash(speaker, text)` (`src/audio/voiceKey.js`, shared by the game and the
extractor): 40 bits of a hash over `speaker|normalized text`, written as 10 hex characters. Normalizing
straightens curly quotes, turns the ellipsis character into `...`, drops the `*italic*` markers, collapses
whitespace and lower-cases the speaker id (`player` is `vesna`, `wiesia_ghost` is `wiesia`). Case and
punctuation are kept on purpose because they change how a line is acted. **Edit a line and its hash changes:
the line is simply unvoiced** until the clip is regenerated, and `node scripts/voice/extract.mjs --report`
lists it (and lists the old clip as STALE). Nothing else needs touching.

`public/voice/manifest.json`:

```json
{ "4a936eced0": { "file": "voice/vesna/4a936eced0.mp3", "dur": 1.42, "speaker": "vesna", "text": "Kasza. Don't." } }
```

Audio: mono MP3, 24 kHz, 40 kbps (about 5 KB per second of speech; plays everywhere including Safari),
trimmed of leading and trailing silence, loudness-normalized by ffmpeg `loudnorm` in two passes to
**-18 LUFS integrated** with a **-2 dBTP** ceiling (so the lossy encode stays under -1 dBTP).

### What gets voiced

- **Dialogues**: every node with a text and a speaker other than `narrator`. Narrator nodes (the italic
  stage directions) are not voiced. `t` functions (`pick(...)`, flag-dependent text) are evaluated
  against a mock state across every flag value they mention, so all variants are found.
  A **picked choice is not spoken** by the dialogue runner; writers repeat the line as the next Vesna node,
  and that node is what gets voiced (same hash, so it is not rendered twice).
- **Cutscenes**: `d.say(speaker, text)` and `d.sub(text, dur, { voice: 'speaker_id' })` with literal text,
  found by parsing (acorn) the files, never running them. Speakers resolve through
  `const x = d.actor('id') | d.player() | d.horse()`, string constants, `+` concatenation and thin
  helpers such as `const say = (w, t) => d.say(w, t)`. Anything the parser cannot resolve is printed as
  **UNRESOLVED** with file and line, and `--strict` makes it a failing exit code. A script can list lines by
  hand: `export const voiceLines = [['hanka', 'Text.']]`. A `d.sub` with no `voice` is narration and is not voiced.
- **Barks**: the arrays in `src/gameplay/npcs/barks.js` (pool to voice mapping in `cast.json` `barkPools`),
  `barks: [...]` in NPC definitions, and Vesna's exploration barks in `docs/STORY.md` section 5.
  Generic pools are rendered in four villager voices (two men, two women); fishermen and the smith use the
  old man; children get a girl and a boy. At runtime a villager keeps one stable voice (a hash of its id) and
  falls back to another voice of the same group if that one has no clip for the line.

At the time of writing: 579 unique lines (473 spoken dialogue lines in 15 dialogue files, the rest
barks), about 22 minutes of speech. The cutscenes arrive with their own branch; re-run `extract.mjs` after the merge.

### Directions

`lines.json` carries a short `direction` per line plus numbers: `exaggeration` (Chatterbox, restrained by
default at about 0.33), `pace` (a multiplier on speed) and `level` (dB relative to -18 LUFS, so a whispered or
broken line stays quieter than a plain one instead of being normalized up). They come from scene rules in `extract.mjs`
(for example `hanka_confront`: "quiet, unsteady, stops and restarts", exaggeration 0.22, pace 0.9; the
decisive "Yes." is quieter and slower still) plus punctuation nudges (`!` a little more, `...` slower,
short lines quieter, a held beat before the line slower). Kokoro uses only `pace` (and `level`); it has no emotion control.
The `direction` text is for humans (and for tuning); change the rules table in `extract.mjs` to taste.
One clip serves every occurrence of the same speaker and text, so a line repeated in several scenes
("Yes.") is acted once, with the direction of the first scene that lists it (files are read in alphabetical
order). To get a different performance, change the text slightly (punctuation counts).

### Pronunciation

`scripts/voice/lexicon.json` respells Polish names for an English model: `Zbyszek` is sent as `Zbishek`,
`Wiesia` as `Veesha`, `grosze` as `grosheh`, and so on. Only the text sent to the model changes; subtitles
and hashes do not. When a clip mispronounces a name, fix the spelling there and regenerate that speaker.

## Cast sheet

All engine settings live in `scripts/voice/cast.json`. "Blend" is a weighted average of Kokoro voice
tensors (percent); `speed` multiplies Kokoro's speed; `pitch` is a resample pitch shift in semitones
applied by ffmpeg (formants move with the pitch). Everyone starts on Kokoro (stage 1).

| Speaker | Who | Age | Kokoro blend | Speed | Pitch | Engine |
| --- | --- | --- | --- | --- | --- | --- |
| `vesna` | Vesna | mid thirties | bf_emma 80, bf_isabella 20 | 0.97 | -1 | kokoro |
| `hanka` | Hanka | about forty | bf_isabella 70, bf_emma 30 | 0.9 | 0 | kokoro |
| `bogdan` | Bogdan Kral | sixties | bm_george 75, bm_fable 25 | 0.9 | -1.5 | kokoro |
| `zbyszek` | Zbyszek | fifties | bm_lewis 60, bm_george 40 | 1.04 | -0.5 | kokoro |
| `dobra` | Dobra | seventies | bf_emma 60, bf_isabella 25, bm_fable 15 | 1.02 | -2 | kokoro |
| `jarek` | Jarek | early thirties | bm_daniel 60, bm_lewis 40 | 0.9 | 0 | kokoro |
| `ola` | Ola | eleven | bf_lily 60, bf_alice 40 | 1.08 | +3.5 | kokoro |
| `wiesia` | Wiesia (ghost) | fourteen at death | bf_lily 70, bf_alice 30, light echo | 0.88 | +2 | kokoro |
| `miller` | Gniewko | forties | bm_fable 50, bm_george 50 | 0.97 | -0.5 | kokoro |
| `miller_wife` | Bozena | forties | bf_alice 50, bf_isabella 50 | 1.02 | +0.5 | kokoro |
| `villager_m1` | villager (man) | 30s to 40s | bm_lewis 70, bm_daniel 30 | 1.0 | +0.5 | kokoro |
| `villager_m2` | villager (man) | 40s to 50s | bm_fable 60, bm_daniel 40 | 0.98 | -0.5 | kokoro |
| `villager_m3` | old man (fishermen, smith, porch elders) | sixties | bm_george 100 | 0.9 | -2.5 | kokoro |
| `villager_f1` | villager (woman), sellers | 20s to 30s | bf_emma 50, bf_alice 50 | 1.0 | +0.5 | kokoro |
| `villager_f2` | villager (woman), older | fifties | bf_isabella 80, bf_emma 20 | 0.94 | -1 | kokoro |
| `child_f1` | child (girl) | 8 to 10 | bf_lily 50, bf_alice 50 | 1.1 | +3 | kokoro |
| `child_m1` | child (boy) | 8 to 10 | bm_daniel 80, bf_lily 20 | 1.1 | +4.5 | kokoro |

Acting direction for every one of them is the same at the root, because the writing is plain and
naturalistic (see the voice rules at the top of `STORY.md`): **restrained, never theatrical**. Nobody
shouts, whispers for effect, sobs or does a "character voice". Sharp lines get quieter, not louder.
Per-character notes (character, delivery, weak spots) are in `cast.json` and summarized here:

- **Vesna**: low, level, dry. Questions flat, not rising. Warmth only in the plainest words.
- **Hanka**: flat, tired, a little slow. In `hanka_confront` almost under her breath, unsteady from pace and
  short phrases, not from tears.
- **Bogdan**: heavy, even, as if every word costs something. A sharp line is quieter.
- **Zbyszek**: brisk and put upon, drops to nearly nothing when he will not say a thing.
- **Dobra**: brisk, dry, gravelly, speaks over her work. Slow only when her hands stop.
- **Jarek**: low, thick, a little slurred, breaks off mid-phrase.
- **Ola**: matter of fact, quick, a little too loud for the room; no cute sing-song. Quiet only when she asks about drowning.
- **Wiesia**: small, close, slow; a question, not a threat. The game may layer its own howl and water filter.
- **Gniewko and Bozena**: plain and anxious; easier once the wolves are dead.

### Be honest about the weak spots

Neither Kokoro nor Chatterbox has a real child voice or a real elderly voice, and neither can crack,
slur, whisper-sob or tremble on cue.

- **Ola, Wiesia and the children** are the weakest. They are young-woman voices (bf_lily, bf_alice) pushed up
  3 to 4.5 semitones and sped up a little. The result reads as "a small adult", which the plain, short writing
  tolerates. Do not push pitch past +4.5 (chipmunk). Wiesia's light echo helps her unearthly role.
- **Dobra** (seventies) and **Bogdan** (sixties) are the next weakest: age comes from slower speed, a pitch drop
  and, for Dobra, a 15 percent bm_fable blend for grain. Experimental: if Dobra sounds like a man in a shawl,
  delete the bm_fable entry and use pitch -1.5.
- **Hanka's confrontation** wants an unsteady, nearly broken voice. Kokoro gives a slow flat one. Chatterbox at
  low exaggeration (about 0.25) is the best available route, and still will not cry.
- **Kokoro voice quality is uneven.** Its model card grades the British voices unevenly (as remembered: bf_emma
  and bf_isabella best, bm_george and bm_fable decent, bf_alice, bf_lily, bm_lewis and bm_daniel weaker). The
  child and villager voices lean on the weaker ones, which is acceptable for one-line barks. Audition before
  trusting any of this.
- **Mixing male and female tensors** (Dobra, the boy) is an unproven trick; treat those two as the most likely to need changes.
- **Pitch shifting** by resampling moves the formants with the pitch. That is wanted for a child and a compromise
  for an adult; keep shifts within about 2.5 semitones for adults.

### What to try first after listening

1. Vesna too bright or too young: raise the `bf_emma` weight, pitch -1.5, speed 0.95.
2. Hanka not tired enough: speed 0.85. Villagers too alike: change `speed` and `pitch` before changing blends;
   they separate people more than the blend does.
3. A name wrong: `lexicon.json`. A line wrong: render it again (`--force --hash`).
4. Leads feel flat: promote Vesna, Hanka and Bogdan to Chatterbox (below), keep the rest on Kokoro.

## Engines

**Stage 1, Kokoro-82M** (Apache-2.0). `KPipeline(lang_code='b')` (British English), preset voices
`bf_emma bf_isabella bf_alice bf_lily bm_george bm_lewis bm_daniel bm_fable`. A character's voice is a
weighted average of voice tensors (`pipeline.load_voice(name)` for each, then a weighted sum), which gives
a new voice from the presets. `speed` and the ffmpeg pitch shift separate people further. 82M parameters:
fast on a laptop CPU or Apple GPU, no per-line emotion control. Output 24 kHz.

**Stage 2, Chatterbox** (MIT, Resemble AI, `chatterbox-tts`), optional per character. It clones a voice from a
reference clip. The reference is **generated, never recorded**: `generate.py` renders about ten seconds of
neutral text with the character's own Kokoro blend and pitch into `scripts/voice/refs/<speaker>.wav`, so a
Chatterbox character is a more expressive rendition of the same imagined voice. No real person's recording is
used or needed. `exaggeration` (per line, from `lines.json` times the character's `exag_scale`) and `cfg_weight`
(lower is slower and more deliberate) give restrained acting; defaults sit around 0.2 to 0.4. Chatterbox
watermarks its output with an inaudible Perth signature. Much slower than Kokoro.

Pick per character with `"engine": "kokoro" | "chatterbox"` in `cast.json` and run `--engine auto`, or force with
`--engine kokoro` / `--engine chatterbox`. Credit both projects in the credits screen if the voices ship.

## In the game

`src/audio/voice.js` creates `G.voice` (also `G.audio.voice`) at audio init. It loads `voice/manifest.json`
lazily and fetches and decodes a clip on demand, with an LRU of about 150 seconds of decoded audio; the
dialogue runner prefetches the next few lines (`prefetchNodes`). A clip that is missing, slow (over 1.5 s),
undecodable, or any error at all means that line is **unvoiced and plays exactly as it did before**.

- **Dialogue** (`Dialogue._line`): a voiced line's duration is `max(audio + 0.45 s, node.dur)`; the subtitle
  stays up that long; Space/E still skips (the audio fades out in 0.12 s). Narrator nodes and the debug
  `dspeed`/`sspeed` speeds are never voiced.
- **Cutscenes** (`d.say`, and `d.sub(text, dur, { voice })`): the same rule; `dur` is a minimum. Skipping (hold
  Space) stops the audio.
- **Barks** (`NPC.bark` -> `G.voice.bark`): positional (panner, distance rolloff, air-absorption lowpass, a small
  send to the environment reverb), no ducking, silent while a dialogue or cutscene runs.
- **Mix**: clips go through a `voice` bus (trim 0.75) into master, so the existing limiter applies. While a spoken line
  plays the music ducks by 45 percent (`mixer.duck`) and the ambience bed to 50 percent (`mixer.ambIn` and `ambVerbIn`
  gains); both recover after the subtitle's tail. A **Voice** volume slider is in Settings (`G.audio.volumes.voice`).
- **Lip movement**: while a line plays, an `AnalyserNode` on its output drives the speaker's jaw by writing
  `character.anim.talkS.target` each frame (and holding off the animator's random flap), so the mouth follows
  the loudness of the real audio. Characters without a jaw bone are unaffected.
- **Debug**: `?novoice` disables it, `?voicelog` logs every line without a clip, `?voicebase=/path/` loads
  `voice/manifest.json` and the clips from another folder laid out like `public/`. `__G.voice.report()` shows
  counts and the missing lines seen so far.

Tuning constants are at the top of `voice.js` (`VOICE_TRIM`, `DUCK_MUSIC`, `DUCK_AMB`, `VOICE_TAIL`). The balance
between voice, music and effects has not been set by ear.

## Writing lines so they get voiced

Nothing special: write dialogue as before. For cutscenes keep `d.say('speaker', 'literal text')`; wrap a repeated
call in a thin helper if you like. If a script builds text at run time, add the lines to `export const voiceLines`.
Unknown speaker ids are reported with the fix (add a `cast.json` entry or an alias in `src/audio/voiceKey.js`).
