# MARZENA: notes for every Claude session (cloud or local)

A Witcher-3-inspired browser game: a snowy Slavic valley, a drowned bell, a straw goddess. Vite +
vanilla ES modules + three.js, everything procedural (no art assets), WebAudio music and sound,
voice clips generated offline. Work happens on the branch `claude/optimistic-bohr-1pcwao`.

## Read first
- `docs/PROGRESS.md`: what is built, what is merged, the polish list. This is the project's memory;
  keep it current when you finish something.
- `docs/DESIGN.md` (art direction, cast), `docs/STORY.md` (script, flags, the "Writing voice" rules),
  `docs/ARCHITECTURE.md` (module contracts, G, systems), `docs/VOICES.md` (cast voices).

## Rules the user has set
- Never use em dashes anywhere: game text, code comments, docs, commit messages, chat.
- Writing is naturalistic and lived in (STORY.md "Writing voice"): people talk about what is in front
  of them; no aphorisms, quips, theme statements or meta-observations.
- Be conservative with tokens: high quality without redundancy. At most one reviewer (usually the lead
  session itself); no workflow fleets or parallel review agents unless the user asks.
- The lead reviews builders' output directly and fixes what it finds.

## Working practice
- The user is not a programmer: handle git for them. At the start of every session, cloud or local,
  run `git fetch origin` and bring the working branch up to date (`git checkout claude/optimistic-bohr-1pcwao`
  then `git pull --ff-only`), and say in one line what came in. At the end of every piece of work,
  commit and push, and tell the user it is pushed. Never leave work only on one machine.
- Commit and push after every meaningful step (the user moves between cloud and local sessions;
  only pushed work exists on the other side). End commit messages with the session's attribution lines.
- Builders (subagents) work in git worktrees (`isolation: "worktree"`), commit early and often in
  their own branch, never push; the lead merges. An interrupt can stop background builders: their
  worktrees keep the work, commit it before relaunching.
- Before pushing a change: `npx eslint <files>`; for gameplay or story changes also run the
  logic playthrough (below); for anything shipped run `npm run build`.

## Seeing the game (scripts/shot.mjs)
- `node scripts/shot.mjs --q "<url params>" --out shots/x.png` renders one frame headless and prints
  errors. `--eval "js"` runs code first; `--seq N --every ms` makes a contact sheet.
- Locally on a machine with a GPU, set `MZ_GPU=1` (seconds per frame). If the renderer line still
  says SwiftShader, add `MZ_HEADED=1`. The cloud container has no GPU: software frames take minutes.
- Under load, pass `--timeout 1500000`, run long renders in the background and wait on the process
  exit (or its OK/FAIL line), never on an image appearing. Builders may use their own capture scripts.
- Useful views: `?scene=<name>` debug scenes in `src/debug/scenes/` (arena, cinematics, characters,
  spirits, ui, dialogues, playthrough); `cam=x,y,z&look=x,y,z&hour=15.5&weather=clear` for any shot.
- Full-story logic test (no rendering, about a minute):
  `node scripts/shot.mjs --w 480 --h 270 --timeout 1500000 --q "scene=playthrough&lite=1&choice=strike&quality=low" --eval "await window.__playthrough.promise; console.warn('SUMMARY', window.__playthrough.pass, window.__playthrough.fail)" --out shots/pt.png`
  (also `choice=call` and `choice=step`); expect zero fails and zero errors.
- `node scripts/gpu-demo.mjs` times one frame on the local GPU against software.
- `node scripts/inputtest.mjs [input|lock|menus|hints|defs]` drives the arena and the Controls screen
  with a mocked gamepad (122 checks, about 4 minutes); run it after touching input, camera, menus or hints.
- Pure-logic tests (Node, seconds): `node scripts/dicetest.mjs` (Kosci rules, AI, roll paths) and
  `node scripts/fishtest.mjs` (fishing model). `node scripts/dicedrive.mjs` (MZ_CHROME=1) plays a dice
  match with real keys, mouse and a mocked pad.
- `node scripts/phototest.mjs [--out dir]` plays into photo mode (own Vite server, installed Chrome; 24
  checks, about 2 minutes): held world, flying camera, click focus, filters, crops, borders, a saved
  PNG at full resolution, clean exit.
- Fighting on the move: `node scripts/strafetest.mjs` (Node, seconds, 113 checks: foot slide of the lock-on clips and blends)
  and `node scripts/combatmove.mjs [strafe|ride|fall]` (MZ_CHROME=1, 46 checks, about 2 minutes: lock-on strafing, swings from the
  saddle, being thrown, the whistle); run both after touching Player, Horse, moves, the animator or the clips. The characters scene
  has `&strafe=l&speed=2.4&sword=1` and `&turn=1.8` stages with `window.__gal.sheet` frame sheets; the arena takes `&mounted=1&site=-10,70`.
- Throwaway harness scripts go under `node_modules/.mz-tmp/` (they resolve the project's packages and
  Vite does not watch there). A file created and deleted under `scripts/` or `src/` while `npm run dev`
  runs can crash its watcher on Windows (EBUSY).
- `node scripts/perf.mjs boot|flicker|cost` (with MZ_CHROME=1 or MZ_GPU=1): boot milestones and title
  frame times; per-frame brightness with single-frame spike and step detection plus a change log of
  uniforms and lights (`--run 1` lets the clock run); per-group frame cost by hiding scene groups.
  The `[boot]` console line reports module, shader warm-up, first-frame and title warm-up times.

## Voices
- `node scripts/voice/extract.mjs` refreshes `scripts/voice/lines.json` after dialogue or cutscene edits.
- `scripts/voice/fetch_onnx.sh` fetches Kokoro-82M (ONNX) and the British voices from Hugging Face;
  `pip install kokoro-onnx soundfile`; `python scripts/voice/generate.py --engine kokoro-onnx`
  renders only lines without a clip into `public/voice/` (commit those MP3s and the manifest).

## Environments
- Cloud sessions: network access is limited (Hugging Face was allowed for the voice model); the
  setup script runs `npm install`. Playwright and Chromium are preinstalled in the container.
- Local sessions: `npm install`, then `npm install --no-save playwright` and
  `npx playwright install chromium` for the screenshot harness. `npm run dev` to play at
  http://localhost:5173/witcher-marzena/. On a machine with Google Chrome (the user's Windows
  laptop: Intel integrated GPU, 16 GB RAM, Node 24 via winget, PowerShell blocks npm.ps1 so use
  `npm.cmd` / `npx.cmd`), install only `npm install --no-save playwright-core` and set `MZ_CHROME=1`:
  shot.mjs then drives the installed Chrome on the GPU. Keep to one headless browser at a time there.
- The in-app browser pane and background Chrome tabs pause or throttle requestAnimationFrame when
  hidden, so never time frames there; use the headless harness.
