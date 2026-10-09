# MARZENA: Architecture and Contracts

Read `docs/DESIGN.md` first (the creative bible). This file is the technical contract every
builder codes against. **If you need an API that is not here, do not invent a cross-module
dependency silently: implement what you own, and list the request in your final report.**

## Stack and rules
- Vite + vanilla ES modules + three.js r183 (`three`, `three/addons/...`). No React, no TypeScript.
- **Everything procedural.** No downloaded models, textures, or audio files. Textures are drawn
  with canvas 2D or generated in shaders. Audio is synthesized with WebAudio.
- Runtime network: only Google Fonts (with Georgia fallback). Everything else ships in the bundle.
- No em dashes in any text, comment, string, or doc. Ever.
- Match the code style around you: 2-space indent, semicolons, single quotes, short header
  comment per file explaining what it owns and its public API. Comments explain why, not what.
- Performance budget (target 60 fps on a mid laptop GPU at 1080p, quality=high):
  under ~900 draw calls and ~2.5M triangles in the busiest view (village at dusk). Use
  InstancedMesh for repetition, merge static geometry (`BufferGeometryUtils.mergeGeometries`)
  per material, avoid per-frame allocations, avoid more than ~8 shadow-casting dynamic lights
  (prefer emissive + bloom; at most a few PointLights near the camera).
- `G.quality` ('low' | 'medium' | 'high') must scale your expensive features (density, shadow casting, resolution).
- Dispose of what you create if you replace it at runtime.

## Coordinates
Meters. +X east, -Z north, +Y up. Lake ice is y = 0. Canonical positions: `src/world/layout.js`
(`LOC`, `ROADS`, `LAKE`, `RIVER`, `FLAT_PADS`, `SPAWN`). Character "forward" is +Z in local
space; `yaw` rotates around +Y (three.js convention: `object.rotation.y = yaw`).

## The global context: `G` (`src/core/G.js`)
Import with `import { G, ORDER } from '../core/G.js'`. Modules export `async function init(G)`
and register per-frame work with `G.addSystem(name, (dt, t) => {}, order)`.

Order constants (`ORDER`): input -100, time -90, logic 0, ai 10, characters 50, camera 80,
atmosphere 90, late 100. The engine calls `G.postfx.render(dt)` (or a plain render) after systems.

| Field | Owner (file) | What |
|---|---|---|
| `G.renderer`, `G.scene`, `G.camera` | core/Engine.js | single renderer, scene, perspective camera |
| `G.cameraOwner` | whoever drives the camera | `'rig'` gameplay, `'cutscene'`, `'debug'`, `'shot'`, `'title'`. Only the owner writes the camera |
| `G.uniforms` | render/Uniforms.js | shared shader uniforms (see below) |
| `G.events` | core/Events.js | `on(name, fn)`, `once`, `off`, `emit(name, payload)`, `wait(name, pred) -> Promise` |
| `G.state` | core/State.js | flags, inventory, notes, discoveries, save/load |
| `G.time` | core/Time.js | `hours` (0..24), `day`, `scale`, `setHours(h)`, `advanceTo(h)`, `isNight`, `sunAltitude` |
| `G.input` | core/Input.js | `down/pressed/released(action)`, `move {x,y}`, `look {dx,dy}`, `context`, `requestLock()` |
| `G.world` | world/World.js | `heightAt`, `terrainAt`, `normalAt`, `isLake`, `surfaceAt`, `lakeSDF`, `stations`, `thawed` |
| `G.physics` | core/Collision.js | `addCircle`, `addBox`, `remove`, `resolve(pos, r)`, `raycast`, `query` |
| `G.atmosphere` | world/Atmosphere.js | lights, time-of-day look, `shadowFocus` |
| `G.sky` | world/Sky.js | dome, sun, moon, stars, clouds, aurora |
| `G.weather` | world/Weather.js | weather state machine, snowfall particles, wind |
| `G.postfx` | render/PostFX.js | composer and screen effects |
| `G.terrain`, `G.water`, `G.rocks` | world/Terrain.js, world/Water.js, world/Rocks.js | terrain meshes, lake ice and water, boulders and cliff outcrops |
| `G.vegetation` | world/Vegetation.js | trees, bushes, grass, reeds |
| `G.characters` | characters/index.js | character factory and update system |
| `G.audio` | audio/Audio.js | music director, SFX, ambience |
| `G.ui` | ui/UI.js | HUD, subtitles, menus, journal, map |
| `G.player`, `G.cameraRig`, `G.horse`, `G.combat`, `G.senses`, `G.interact` | gameplay/* | phase 2 |
| `G.creatures`, `G.npcs` | gameplay/creatures, gameplay/npcs | phase 2 |
| `G.dialogue`, `G.quests`, `G.cutscenes`, `G.story` | story/* | phase 2 and 3 |

### Shared uniforms (`src/render/Uniforms.js`)
`uTime`, `uSnowCover` (1 winter .. 0 thawed), `uSpring` (0 .. 1 greening), `uWind` (vec4:
dir.xy, strength, gust), `uSunDir`, `uSunColor`, `uFogColor`, `uFogSunColor`, `uFogDensity`,
`uFogHeightFalloff`, `uFogBaseHeight`, `uFogSunPower`, `uSenses` (0..1), `uPlayerPos`, `uSnowfall`,
`uWindowLight` (0..1, lit windows and lanterns, dusk to dawn), `uNight` (0..1).
Atmosphere writes sun and fog values every frame. Weather writes wind and snowfall. Story
endings animate `uSnowCover` then `uSpring`. **Everything that is snowy in winter must respond
to `uSnowCover`, and anything that should be green in spring to `uSpring`.**

### Material patches (`src/render/Materials.js`)
Installed globally before anything compiles. Every built-in material with `fog: true` gets the
custom height fog. Opt-in features via `material.userData`:
- `userData.snow = { amount, threshold, color }` snow on upward faces (lit materials only).
- `userData.wind = { type: 'tree' | 'grass' | 'cloth', strength, height }` vertex sway.
- `addCompileHook(mat, key, fn)` for additional shader edits. **Never assign `onBeforeCompile` directly.**
- `windDepthMaterial(wind)` for wind-correct shadows.
Chunk files: `fogChunk.js` (atmosphere builder), `snowChunk.js` (terrain builder),
`windChunk.js` (vegetation builder). Exported names must stay stable.

Custom `ShaderMaterial`s that want the fog should include the same functions from `fogChunk.js`
(use `FOG_PARS_FRAGMENT` and call `mzApplyFog(color, worldPos)` with `fog: true`, and pass the
uniforms from `G.uniforms`).

## World layer (phase 1)

### Terrain (`G.terrain`, terrain builder)
- Builds the walkable terrain from `G.world` grid and a far ring to `WORLD.farHalf` using `computeHeight`.
- Terrain mesh triangulation must split each grid cell along the (i+1, j) to (i, j+1) diagonal
  so feet match `World.terrainAt` (or update `terrainAt` to match your mesh).
- Grid generation must take **under ~1.5 s** of main thread at load (use a Web Worker,
  `World.setGrid`, or a build-time bake). `World.build` is the slow reference implementation.
- Terrain shader: snow, rock on steep slopes, exposed dirt and grass patches, road ruts and
  packed snow along `ROADS`, footprint-ready detail, responds to `uSnowCover` / `uSpring`.
- `G.terrain.setRoadMask` is internal; roads come from layout.

### Water and ice (`G.water`, terrain builder)
- `G.water.addHole(x, z, r)` returns id: a dark open-water hole in the ice (ice-fishing holes, ritual hole).
- `G.water.setUnderGlow(x, z, radius, intensity, color?)` pale light under the ice (Wiesia).
- `G.water.setCracks(x, z, radius, amount)` crack network on the ice (boss arena), animatable.
- `G.water.setThaw(t)` 0 = frozen, 1 = open water with reflections (ending). Also sets `G.world.thawed` when t > 0.5.

### Atmosphere, sky, weather, post (atmosphere builder)
- `G.atmosphere.sun` (DirectionalLight casting shadows), `G.atmosphere.moon`, `G.atmosphere.hemi`.
- `G.atmosphere.shadowFocus` (Vector3) the shadow camera follows; the player rig sets it each frame.
- `G.atmosphere.override = { exposure, tint, fogMul, ... } | null` cutscene look overrides (echo, boss).
- `G.sky.aurora` 0..1 (auto at clear nights unless `G.sky.auroraOverride` is a number).
- `G.weather.set(state, seconds = 60)`, states `'clear' | 'overcast' | 'snow' | 'blizzard' | 'fog'`.
  `G.weather.state`, `G.weather.params` (current blended numbers), emits `'weather:change'`.
  In shot mode the `weather` URL param sets the state instantly. Weather changes randomly in
  free roam only if `G.weather.auto` is true (default true; story sets it false at beats).
- `G.postfx.render(dt)`; properties `G.postfx.frost` (0..1 screen-edge frost), `G.postfx.echo`
  (0..1 cold blue reconstruction tint), `G.postfx.flash(color, seconds)`; reads `uSenses`.

### Vegetation (`G.vegetation`, vegetation builder)
- Places forests, birch groves, bushes, dead trees, grass tufts through snow, reeds in the marsh.
- Excludes: lake, roads (plus margin), every `LOC` footprint (`r`), and extra circles in
  `src/world/exclusions.js` (locations builders append there).
- `G.vegetation.clearArea(x, z, r)` hides instances at runtime.
- Registers tree trunk colliders with `G.physics.addCircle`.
- Exposes `G.vegetation.treeAt(x, z, r)` for placement checks by other builders.

### Architecture kit (`src/world/architecture/`, architecture builder)
Pure builders that return groups at the origin plus metadata; they do not add to the scene:
```js
import { buildings } from '../world/architecture/index.js';
const b = buildings.logHouse({ w: 7, d: 5, floors: 1, porch: true, seed: 12, style: {...} });
// b = { group, colliders: [{type:'box', x, z, hw, hd, yaw} | {type:'circle', x, z, r}],
//       doors: [{ x, z, yaw }], anchors: { chimney: Vector3, porch: Vector3, ... },
//       lights: [{ x, y, z, color, intensity }], interior: bool }
import { placeBuilding } from '../world/architecture/place.js';
placeBuilding(G, b, x, z, yaw, { foundation: true }) // adds to scene, snaps to terrain,
// extends foundations down to the lowest terrain point, registers colliders, returns world-space anchors
```
Catalog (each with seeded variation): `logHouse`, `longhouse`, `tavern` (enterable),
`smithy` (open forge side), `shrine` (ring of carved posts + roofed altar), `granary` (on posts),
`barn`, `shed`, `banya` (bathhouse + steam anchor), `fishingHut` (on stilts), `boathouse`,
`mill` (with waterwheel object to animate or freeze), `watchtowerRuin`, `bellTower` (drowned
church spire with walkable interior stairs to the belfry), `workshop` (Dobra's open barn),
`hankaHouse` (enterable), `longhouseInterior` with cellar, `stable`, `palisade`, `gate`,
`fence` (wattle and split-rail, along a polyline), `boardwalk`, `well`, `outhouse`,
`marketStall`, `noticeBoard`, `waysideShrine`, `bridge`, `stoneCircle`, `idol` (four-faced),
`gravePost`, `trapperCabin` (ruined), `charcoalKiln`, `ruinedBathhouse`.
Style: Slavic and Nordic log construction (see DESIGN 5.3). Materials use `userData.snow`.

### Props kit (`src/world/props/`, props builder)
```js
import { props, PropBatch } from '../world/props/index.js';
const obj = props.barrel({ seed: 3 });             // single Object3D at origin
const batch = new PropBatch(G, 'village');         // merges static props per material / instanced
batch.add('barrel', x, z, { yaw, scale, y, seed, snap: true, collide: true });
batch.build();                                      // adds to scene
```
Catalog includes: barrel, crate, sack, firewoodStack, choppingBlock (with axe), cart, sled,
skis, snowShovel, bucket, washTub, laundryLine, dryingRack (fish), fishBasket, net (hanging),
boat (frozen in ice), lantern (emissive, optional light anchor), brazier (fire anchor), campfire,
bench, table, stool, anvil, quenchBarrel, grindstone, hayBale, haystack, woodpile, ladder,
effigy (straw Marzanna with white dress and red knot; standing, hung, half-made variants),
effigyHead, strawPile, ribbonPole (birch with red ribbons), iceFishingHole, fishingStool,
windbreak, tent, signpost, gravePostSmall, offering (bowl, bread, candle), bones, skull,
dogKennel, chickenCoop, beehive (snowed), cartWheel, pot, cauldron, shelf, bed, chest, rug,
tapestry (folk pattern), barrelStack, crateStack, logs, stump, rockSmall, music box, bird carving.
Fire, smoke and steam emitters: `props.fx.fire(opts)`, `props.fx.smoke(opts)`, `props.fx.steam(opts)` (cheap particle or billboard systems, one shared update).

### Locations (phase 3, `src/world/locations/`)
`index.js` builds `village.js` and one file per wilderness location using the kits, and
registers NPC stations `G.world.stations[id] = { x, z, yaw, anim, props }`.

## Characters (`G.characters`, characters builder)
```js
import { createCharacter } from '../characters/index.js';
const c = createCharacter('hanka');            // preset id, or a spec object (see characters/presets.js)
G.scene.add(c.root);                           // root at the feet; +Z forward
c.setPosition(x, z)                            // snaps to G.world.heightAt
c.yaw = 1.2                                    // facing
c.play('cross_arms', { loop: true, fade: 0.3, speed: 1 })     // returns Promise for one-shots
c.playUpper('carry_torch', { loop: true })     // upper-body layer over locomotion
c.stopUpper()
c.setLocomotion(speed)                         // m/s: blends idle, walk, run, sprint
await c.walkTo(x, z, { run: false, speed })    // straight line or [{x,z},...], turns, blends, snaps
c.lookAt(targetVector3OrObject3D | null)       // head and eyes track (clamped)
c.talk(true | false)                           // mouth flap and subtle gestures
c.gesture('point' | 'shrug' | 'nod' | 'shake_head' | 'wave' | 'beckon' | ...)
c.attach('handR' | 'handL' | 'back' | 'hip', object3D)
c.setVisible(bool); c.dispose()
c.bones  // named joints: hips, spine, chest, neck, head, shoulderL/R, armL/R, forearmL/R, handL/R, thighL/R, shinL/R, footL/R
c.height // standing height in meters
```
Registered characters update automatically (a single system at ORDER.characters).
Presets (DESIGN 3.2): `vesna`, `ola`, `hanka`, `bogdan`, `dobra`, `zbyszek`, `jarek`,
`wiesia_ghost`, `miller`, `miller_wife`, `child_a..f`, `villager_m_1..12`, `villager_f_1..12`,
`elder_m`, `elder_f`, `fisherman_1..4`.
Clip names (all presets support all generic clips; combat clips at least on `vesna`):
`idle, idle_cold, walk, walk_cold, run, sprint, talk_1, talk_2, talk_3, point, shrug, nod,
shake_head, cross_arms, hands_hips, beckon, wave, kneel, kneel_idle, stand_up, sit_bench,
sit_ground, lie_dead, crouch_examine, look_back, carry_torch, carry_pole, hug, cry, warm_hands,
chop_wood, hammer, sweep, stir, fish_ice, mend_net, carry_bucket, throw_snowball, child_play,
drink, eat, lean_wall, pray, fall_through_ice, drown_reach, combat_idle, draw_sword,
sheathe_sword, attack_1, attack_2, attack_3, heavy_attack, dodge_left, dodge_right, dodge_back,
roll, parry, block_idle, hit_react, stagger, death, cast_sign, senses, drink_potion, mount,
dismount, ride_idle, ride_trot, ride_gallop`.
Horse: `createHorse('kasza')` with `setGait(speed)`, clips `idle, walk, trot, gallop, rear, snort`, a `saddle` anchor.

## Audio (`G.audio`, audio builder)
```js
G.audio.unlock()                       // call from the first user gesture
G.audio.setMood(name, { fade: 3 })     // DESIGN 6.2 moods; 'silence' stops music
G.audio.stinger(name)                  // 'discover' | 'quest' | 'echo' | 'danger' | 'choice' | 'death' | 'reveal'
G.audio.sfx(name, { pos, volume, pitch })        // one-shot, positional if pos given
const h = G.audio.loop(name, { pos, volume })    // looping source; h.setPos(v), h.setVolume(v), h.stop()
G.audio.duck(amount, seconds)          // lower music under dialogue
G.audio.volumes = { master, music, sfx, ambience }
```
Ambience is automatic from `G.time`, `G.weather`, the camera position, and location (near the
village: murmur, dogs, forge; on the ice: groans; forest: wind in pines). SFX names: see the
list in `src/audio/sfxNames.js` (audio builder creates it; others use those names).

## Phase 2 contracts (gameplay and story; detailed when those builders start)
- `G.interact.add({ id, pos, radius, label, verb, enabled(), onUse() })` interactables with prompts.
- `G.senses.addClue({ id, pos, radius, kind: 'clue' | 'trail' | 'echo', object, enabled(), onExamine() })`.
- `G.dialogue.start(id, { actors }) -> Promise<result>`; dialogue data in `story/content/dialogues/*.js`.
- `G.cutscenes.play(id) -> Promise`; scripts are async functions over a director API in `story/content/cutscenes/*.js`.
- `G.quests` stages, objectives, map and compass markers, journal entries.
- `G.npcs.spawn(def)` with schedules using `G.world.stations`.
- `G.ui.subtitle(speaker, text, seconds)`, `G.ui.notify(text)`, `G.ui.prompt(text|null)`,
  `G.ui.letterbox(on)`, `G.ui.fade(to, seconds) -> Promise`, `G.ui.titleCard(title, sub)`,
  `G.ui.choices(list, { timer }) -> Promise<index>`, `G.ui.readNote(note)`.

## Event names
`flag`, `inventory`, `note`, `discover`, `saved`, `loaded`, `reset`, `time:hour`, `time:day`,
`time:jump`, `weather:change`, `resize`, `game:ready`, `player:hit`, `player:death`,
`enemy:death`, `combat:start`, `combat:end`, `quest:update`, `dialogue:start`, `dialogue:end`,
`cutscene:start`, `cutscene:end`, `senses:on`, `senses:off`, `location:enter`, `location:leave`.

## Test hooks and the screenshot harness
`window.__G` is the context. `window.__MZ_READY` turns true when loaded. `window.__MZ_STATS`
holds `{ fps, calls, triangles }`. `window.__MZ_ERRORS` lists module init errors.

URL params: `shot` (deterministic, frozen clock, no title/audio), `cam=x,y,z`, `look=x,y,z`,
`fov`, `hour`, `weather`, `only=a,b`, `skip=a,b`, `scene=name` (loads
`src/debug/scenes/<name>.js`, which exports `init(G)` and optionally `modules = [...]` and
`needsWorld = true`), `frames=N`, `quality`, `gridRes`, `debug` (F1 fly camera, P logs camera params).

```bash
node scripts/shot.mjs --q "cam=-380,75,360&look=0,0,0&hour=15.5&weather=clear" --out shots/terrain/reveal.png
node scripts/shot.mjs --q "scene=characters&cam=0,1.6,5&look=0,1,0" --out shots/chars/sheet.png --seq 12 --every 120 --cols 4
node scripts/shot.mjs --batch shots/terrain/plan.json
```
Rendering is software (SwiftShader), so FPS in the harness is meaningless; draw calls and
triangles are real. A shot takes 5 to 30 s. Put your shots under `shots/<your-area>/` (gitignored).
Each builder should add a gallery scene in `src/debug/scenes/` for its area.

## Collaboration rules (several builders work in this tree at once)
- **Only edit files you own** (listed in your brief). Read anything.
- Do not run git commands that change state (no commit, checkout, stash, reset). The lead commits.
- Do not run `npm run build` into `dist/` concurrently; use the shot harness (it runs a dev
  server) and `npx eslint <your files>` to validate.
- If another module is broken and blocks you, use `skip=` and report it; do not fix their files.
- Your final report: what you built, the public API (exact), known gaps, requests for other owners, and the screenshot paths that best show your work.
