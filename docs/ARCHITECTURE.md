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
| `G.cameraOwner` | whoever drives the camera | `'rig'` gameplay, `'cutscene'`, `'debug'`, `'shot'`, `'title'`, `'dice'` (the dice table). Only the owner writes the camera |
| `G.uniforms` | render/Uniforms.js | shared shader uniforms (see below) |
| `G.events` | core/Events.js | `on(name, fn)`, `once`, `off`, `emit(name, payload)`, `wait(name, pred) -> Promise` |
| `G.state` | core/State.js | flags, inventory, notes, discoveries, save/load |
| `G.time` | core/Time.js | `hours` (0..24), `day`, `scale`, `setHours(h)`, `advanceTo(h)`, `isNight`, `sunAltitude` |
| `G.input` | core/Input.js | `down/pressed/released(action)`, `move {x,y}`, `look {dx,dy}`, `lookPad {x,y}`, `device` ('kbm' or 'pad'), `context`, `requestLock()`, rebinding (see "Input, controls and hints") |
| `G.settings` | ui/settings.js | persisted player settings: camera, look, controller, hints, subtitles, volumes (see "Input, controls and hints") |
| `G.hints` | ui/hints.js | first-use hint cards, `show(id)`, `prompt(items)`, `reset()` |
| `G.dice` | minigames/dice/index.js | the tavern dice game, created by the story controller on first use: `play(id)`, `canPlay(id)`, `purse(id)`, `record()`, `active` (see "Kosci") |
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
- Extra species beyond spruce, pine, birch and snags (see the header of `src/world/trees/placement.js` and `rare.js`):
  common larch (golden, tall and wind-bent), rowan (red berries), veteran broken-top spruce and krummholz
  (dwarf pine on the treeline); rare odd trees (corkscrew pine, hollow oak with a red ribbon, weeping birch,
  bottle tree, knot tree, ice tree, gate tree). `G.vegetation.rare` lists them: `{ heroes: [{ id, species, x, z, y,
  yaw, note }], counts, removed }`. Odd trees are ordinary vegetation kinds with their own glades, so other builders
  can treat them like any tree (`treeAt`, `clearArea`). Kinds with several trunks publish `kind.colliders`.

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
G.audio.duck(amount, seconds)          // lower music under dialogue (no seconds: hold until duck(0)); automatic on dialogue:start/end
G.audio.volumes = { master, music, sfx, ambience }   // persisted
G.audio.setEnvironment('hall' | 'room' | 'cave')     // reverb: call 'room' in interiors, 'cave' in the ice cave, 'hall' outdoors
G.audio.loop(name, { pos, volume, follow })          // follow: an Object3D the source tracks
G.audio.mood, G.audio.ready, G.audio.info()
// Events: 'music:mood' { mood }, 'music:lyric' { mood, line, text } (subtitle lyrics during 'procession')
```
Name lists live in `src/audio/sfxNames.js` (`MOODS`, `STINGERS`, `SFX_NAMES`, `SFX_GROUPS`, `LOOP_NAMES`).
Audition page: `?scene=audio`. Offline renders: `node scripts/render-audio.mjs [--only moods,sfx] [--mood x]`.
Gameplay plays footsteps per footfall (by `G.world.surfaceAt`) and hooves per strike; locations create
`loop('fire_crackle', { pos })` per hearth or brazier.
Ambience is automatic from `G.time`, `G.weather`, the camera position, and location (near the
village: murmur, dogs, forge; on the ice: groans; forest: wind in pines). SFX names: see the
list in `src/audio/sfxNames.js` (audio builder creates it; others use those names).

## Phase 2 contracts (gameplay, story systems, UI, NPCs)

### Player (`G.player`, gameplay core builder; src/gameplay/Player.js)
```js
G.player.character            // the 'vesna' Character
G.player.position, G.player.yaw, G.player.velocity
G.player.health, maxHealth, stamina, maxStamina, warmth (0..1), signEnergy (0..1), sign ('ember'|'gale'|'ward')
G.player.state                // 'explore' | 'combat' | 'mounted' | 'scripted' | 'dead'
G.player.swordDrawn
G.player.setControl(bool)     // false while dialogue/cutscenes run (the director does this)
G.player.teleport(x, z, yaw)
G.player.mount(), dismount()  // with Kasza (G.horse)
G.player.damage(amount, { from, knockback }), heal(n)
```
Writes `G.uniforms.uPlayerPos` and `G.atmosphere.shadowFocus` each frame. Footstep SFX by
`G.world.surfaceAt`. Warmth drains outdoors at night and in snow/blizzard, refills near fire
anchors (`G.world.fires`, a list of {x, z, r} registered by locations), indoors, in the banya.

### Camera rig (`G.cameraRig`; src/gameplay/CameraRig.js)
Third person over the right shoulder (or the left: `G.settings.shoulder`, swapped by the `shoulder` action with an
eased slide, `cameraRig.sideK`); modes 'explore' | 'combat' (lock-on framing) | 'mounted' | 'interior' (closer);
`shake(intensity, seconds)`; `setTarget(object|null)`; only writes the camera when `G.cameraOwner === 'rig'`.
- Look: mouse pixels times `mouseSensX/Y`, right stick (`G.input.lookPad`) integrated with dt times `padSensX/Y` with a
  ramp for a held full push (`padRamp`); `invertX/Y` apply to both. `fovOffset` (degrees) and `camDist` (a multiplier of
  each mode's distance; the wheel zooms around it) are read every frame.
- Recenter (`recenter`: 'auto' | 'off' | 'gentle' | 'strong'; auto is gentle with a pad, off with a mouse): after a
  short delay with no look input the camera swings behind the direction of travel, never while she runs toward the lens.
- Lock-on: a quick sideways mouse flick or right-stick push hands the lock to the next target on that side
  (`lock.js stepTarget`); emits `camera:retarget`.
- Collision: a sphere (0.26 m) is marched from the head pivot to the lens against `G.physics` colliders and the terrain;
  pulls in at once, eases out after a short hold; the lens keeps 0.4 m above the highest terrain point around it.

### Horse (`G.horse`; src/gameplay/Horse.js) wraps `createHorse('kasza')`: call (the `horse` action, X) to trot to the
player from off-screen, mount/dismount, gaits, refuses lake ice, road-follow assist.

### Combat (`G.combat`; src/gameplay/combat/*) and creatures (`G.creatures`; src/gameplay/creatures/*)
```js
G.combat.register(enemy)   // enemy: { root, position, radius, height, health, maxHealth, alive, faction, takeHit(hit), ... }
G.combat.enemies           // live list; G.combat.inCombat (bool), emits combat:start / combat:end / enemy:death
G.creatures.spawnWolves(x, z, count, opts) -> [wolf]
G.creatures.spawnEffigy(x, z, opts) -> effigy      // straw marzanny, weak to Ember
G.creatures.spawnBoss(x, z, opts) -> boss          // phase 3 builder fills it in
```
Signs: Ember (fire cone, ignites effigies), Gale (force wave, knockback, breaks ice armor), Ward
(shield bubble). Hit-stop, shake, particles, sword trails.

### Interaction (`G.interact`; src/gameplay/Interact.js, story systems builder)
```js
const id = G.interact.add({
  id: 'notice_board', pos: Vector3 | (() => Vector3), radius: 2.2,
  label: 'Notice Board', verb: 'Read',      // Talk | Examine | Read | Take | Rest | Sit | Open | Climb | Use | Leave
  enabled: () => true, facing: true, sensesOnly: false,
  onUse: async () => {},                    // may run dialogue or a cutscene
});
G.interact.remove(id)
```
Shows `G.ui.prompt('[E] Read  Notice Board')` for the best candidate (distance + facing). The `[E]` names the default key of the
`interact` action; the prompt draws the player's real binding (a rebound key, or the pad button).

### Hunter senses (`G.senses`; src/gameplay/Senses.js, story systems builder)
```js
G.senses.addClue({ id, pos, radius: 1.5, kind: 'clue' | 'echo', object, label, enabled, once: true, onExamine: async () => {} })
G.senses.addTrail({ id, points: [[x, z], ...], kind: 'footprints' | 'drag' | 'scent', enabled })
G.senses.active
```
Hold the `senses` action (RMB, or LT on a pad; sword sheathed) to activate: ramps `uSenses`, highlights clue objects (via the PostFX
highlight API), draws trails as glowing decals/particles, clues become interactable.

### Dialogue (`G.dialogue`; src/story/Dialogue.js, story systems builder)
Data files: `src/story/content/dialogues/<id>.js` exporting default:
```js
export default {
  id: 'hanka_first',
  cast: ['hanka'],                       // NPC ids (G.npcs) or presets; 'vesna' is always the player
  start: 'n1',
  nodes: {
    n1: { s: 'hanka', t: "You're slower than I hoped.", a: 'cross_arms', next: 'n2' },
    n2: { s: 'vesna', t: 'Somebody had to be.', next: 'hub' },
    hub: { choices: [
      { t: 'Ask about Ola', next: 'ola', once: true, if: (S) => !S.flag('x'), do: (S) => S.set('y') },
      { t: 'Leave', next: 'bye', exit: true },
    ] },
    decide: { decisive: true, timer: 12, timeout: 'blame', choices: [ ... ] },
    bye: { s: 'hanka', t: 'Go on, then.', end: true, do: (S) => S.set('met_hanka') },
  },
};
```
Node fields: `s` speaker id ('vesna', NPC id, or 'narrator'), `t` text, `a` animation or
gesture for the speaker, `cam` ('auto' | 'wide' | 'close' | 'ots'), `look` target id, `dur`
seconds override, `do(S)` effect (S = G.state), `if(S)` condition (false: jump to `else`),
`next`, `choices`, `end`. Choice fields: `t`, `next`, `if`, `do`, `once`, `exit`, `decisive`.
`await G.dialogue.start(id, opts)` runs it: letterbox, player control off, automatic
shot/reverse-shot framing, speaker gestures, listener reactions, subtitles, choice UI, then restores.

### Cutscenes (`G.cutscenes`; src/story/Cutscene.js, story systems builder)
Scripts: `src/story/content/cutscenes/<id>.js` exporting `default async function (d) {}`.
Director `d`: `setup({ time, weather, music, letterbox })`, `actor(id, { preset, at: [x, z], yaw })`,
`player()`, `horse()`, `place(actor, x, z, yaw)`, `shot({ from, to, look, lookTo, fov, fovTo, dur, ease })`
(camera move, resolves at end), `cut({ pos, look, fov })`, `follow(actor, offset, look, dur)`,
`orbit(center, radius, height, fromAngle, toAngle, dur)`, `say(speaker, text, dur?)`, `sub(text, dur)`,
`wait(s)`, `fade(to, s)`, `letterbox(on)`, `titleCard(title, sub)`, `music(mood)`, `sfx(name, pos)`,
`weather(state, s)`, `time(h)`, `anim(actor, clip, opts)`, `walk(actor, x, z, opts)`,
`lookAt(actor, target)`, `choice(options, { timer, default })`, `tween(obj, prop, to, s, ease)`,
`uniform(name, to, s)`, `postfx(prop, to, s)`, `parallel(...promises)`, `skipping`, `end({ player: { x, z, yaw } })`.
Holding Space skips: timed awaits resolve instantly and shots jump, so the script runs to its
end state; skipping stops at `choice()`.

#### Story systems as built (additions to the contracts above)
- `G.dialogue.start(id, opts)` returns `{ end, picks: [{ node, i, t }] }`. Options: `actors`, `start` (node), `noStage`, `walkIn`, `camera: false`, `letterbox: false`. Node extras: `t`, `next`, `else` may be functions; `do(S, D)` with `D.actor(id)`; `italic`, `wait`, `react: { id: clip }`. Emits `dialogue:line`. Picked `once` choices persist in `G.state.data.dlg`.
- `G.cutscenes.play(id | fn, { actors, skippable, letterbox })` returns `{ skipped, picks }`; also `register`, `skip`, `has`. Clock frozen and `weather.auto` off during a cutscene. Point formats: `[x, y, z]`, `{ x, z, h }` (h above ground), an actor, `d.rel(actor, [right, up, forward])`, or a function. Orbit angle 0 is south (+Z). `d.follow(..., 0)` follows until the next camera call. Extras: `d.two`, `d.ots`, `d.close`, `d.single` (dialogue framings), `d.face`, `d.flag`, `d.ghost` (pale turquoise echo look), `d.dialogue`, `d.atmosphere`, `d.end({ player, camera, fadeIn, weatherAuto })`. `d.titleCard(title, sub, dur = 5)`.
- Quest stage fields: `objective`, `marker`, `journal` (logged on stage start), `log` (logged on completion), parallel `objectives`, `done(S, G)`, `reach`, `sets`, `give`, `debug`. Methods add `next`, `list`, `quiet`.
- `G.interact.use(id)`, `priority`. `G.senses.force(v)`, `pulse()`; clues take `cutscene` and `line`; emits `clue:examine`, `clue:reveal`.
- `G.story`: `zone`, `removeZone`, `rest`, `save`, `load`, `newGame`, `continueGame`, `debugStart`, `place`, `busy`. URL: `start=quest:stage`, `sspeed`, `dspeed`, `autopick`, `nostory`.
- Player contract from the story side: while `setControl(false)` the player must not move the character root; the story copies the actor's position and yaw into `G.player` during scenes and calls `teleport(x, z, yaw)` at scene end.

#### Writer cookbook
- Dialogue: follow `content/dialogues/_sample.js`; set `cast`; let the camera choose shots and only set `cam: 'close'` for a beat that must be close; decisive nodes use `decisive: true, timer: 12, timeout: '<node>'`.
- Cutscene: `d.setup({ time, weather, music })`, then `const v = d.player(), h = d.actor('hanka', { at, yaw })`; `d.face` people before close-ups; `d.cut(d.ots(h, v)); await d.say(h, '...')`; walks: `const w = d.walk(...)`, `d.follow(..., 0)`, `await w`; set flags with `d.flag` so a skip reaches the same end state.
- Echo clue: `G.senses.addClue({ kind: 'echo', pos, cutscene: 'c4_echo' })`.

### Quests (`G.quests`; src/story/Quests.js, story systems builder)
Definitions in `src/story/content/quests.js`. API: `start(id, stage?)`, `advance(id, stage)`,
`complete(id)`, `fail(id)`, `stage(id)`, `isActive(id)`, `track(id)`, `objectives()` (for the
compass and map: `{ questId, text, marker: [x, z] | null }`), journal entries appended per stage
(emits `quest:update`, `G.ui.notify`).

### Triggers and flow (`G.story`; src/story/index.js)
`G.story.zone({ id, x, z, r, enabled, once, onEnter, onLeave })`, `G.story.rest(toHour)` (fade,
advance time, heal, autosave), game flow: title screen, New Game (prologue), Continue (load).

### NPCs (`G.npcs`; src/gameplay/npcs/*, NPC builder)
```js
G.npcs.spawn({ id: 'hanka', preset: 'hanka', name: 'Hanka', schedule: [{ from: 6, to: 20, at: 'hanka_loom' }, { from: 20, to: 6, at: 'hanka_bed', hidden: true }],
  barks: 'villager' | [...lines], talk: 'hanka_hub' | (() => Promise) })
G.npcs.get(id)  // { id, character, def, pause(bool), goTo(stationId|{x,z}), bark(text) }
G.npcs.populate()  // ambient villagers, children and animals from stations
```
Stations: `G.world.stations[id] = { x, z, yaw, anim, kind: 'work' | 'sit' | 'talk' | 'bed' | 'wander', indoor }`.
Ambient life: walking between stations along roads and paths, pairs chatting, children playing,
heads turning toward Vesna, barks on proximity (`G.ui.bark(name, text, pos)`), indoors at night
and in blizzards. Animals: dogs, chickens, goats (one on a roof), a cat, ravens and crows that flee.

### UI (`G.ui`; src/ui/*, UI builder)
`subtitle(speaker, text, seconds)`, `bark(name, text, worldPos)`, `notify(text, kind)`,
`prompt(text | null)`, `letterbox(on)`, `fade(to, seconds) -> Promise`, `titleCard(title, sub)`,
`choices(list, { timer, decisive }) -> Promise<index>`, `readNote(note)`, `hold(text, seconds, window) -> Promise<bool>`,
`openJournal()`, `openMap()`, `openPause()`, `openSettings()`, `openControls({ tab })`, `title() -> Promise<'new' | 'continue'>`,
`credits()`, `hud.show()/hide()`. `hint([[key, label]], seconds)` shows a story card through `G.hints` (the key names a default
key and draws the player's binding). HUD reads `G.player` and `G.quests.objectives()` each frame. Compass at
the top center with objective markers and discovered location icons. Map: parchment rendered
from `G.world` heights with LOC labels and markers.

## Input, controls and hints

### Input (`G.input`; src/core/Input.js, src/core/bindings.js)
- Actions are names read with `down/pressed/released(action)`; each maps to codes: keyboard `KeyW`, mouse `Mouse0` (left)
  `Mouse1` (middle) `Mouse2` (right), pad `PadA` `PadB` `PadX` `PadY` `PadLB` `PadRB` `PadLT` `PadRT` `PadBack` `PadStart`
  `PadL3` `PadR3` `PadUp` `PadDown` `PadLeft` `PadRight` (Gamepad API standard mapping). Pad buttons live in the same sets as keys.
  Actions: forward back left right sprint walk dodge attack heavy senses draw sign sign1 sign2 sign3 lock shoulder parry
  interact horse potion journal map pause skip advance, and dice_pick dice_roll dice_raise dice_hands (the dice game, context `'dice'`; defaults and the table the Controls screen is built from: bindings.js).
- `G.input.move` is digital from the keys and analog from the left stick (radial dead zone, curve), so its length picks walk or
  run. `G.input.lookPad` is the right stick in [-1, 1] (the camera integrates it with dt). The sprint button latches while the stick is held.
- `G.input.device` is `'kbm'` or `'pad'`, switched by the last meaningful input; `input:device` announces it. `padConnected`, `padName`, `padStyle` ('xbox' or 'playstation').
- Rebinding: `bind(action, kind, slot, code, mode)` (kind 'kbm' or 'pad', two slots), `unbind`, `reset(action?, kind?)`, `findConflicts`,
  `codesFor(action, kind)`, `matches(action, code)`. Two actions clash only if they share a code and a context (game or scene) and are not
  the intentional pair (heavy attack drawn, senses sheathed). Reserved: Esc, F1 and Start. Persisted as differences in `marzena.bindings`; `input:bindings` fires on change.
- Menus: while `G.input.nav.active()` (the UI sets it: a screen or choice list is open) pad buttons and the left stick become real `KeyboardEvent`s
  marked `__pad`, so every key handler works with a pad. A button the UI consumed is hidden from the game until released. `nav.key(button)` lets a screen remap one.
- `capturePad(cb)` hands the next pad button to cb (the Controls screen uses it). `rumble(strong, weak, ms)` honours `G.settings.rumble`.
- Code that reads keys should go through actions (`G.input.pressed('interact')`, `G.input.matches('journal', e.code)`), never a literal key.

### Settings (`G.settings`; src/ui/settings.js)
`set(key, value)` validates, persists (`marzena.<key>`) and emits `settings` { key, value }. Keys: mouseSensX mouseSensY padSensX padSensY invertX invertY
fovOffset camDist shoulder recenter padRamp padDeadzone rumble padStyle hints subScale (limits and defaults in `SCHEMA`).

### Controls screen and glyphs (src/ui/controls.js, glyphs.js, setrows.js)
`G.ui.openControls({ tab: 'bindings' | 'camera' | 'controller' })`, from Settings (title and pause) and from the pause menu. Glyphs are drawn in
SVG and CSS: `actionGlyph(G, action)` shows the binding for the device in hand and redraws itself when the device, bindings or button style change.

### Hints (`G.hints`; src/ui/hints.js, hintDefs.js)
One card at a time the first time a mechanic becomes relevant (move and look, sprint, walk, interact, senses, journal, map, whistle, mount, gallop,
dismount, draw, attack, dodge, parry, lock-on and switching, each sign, potion, skipping a scene, pause). Rows tick when the player does the thing;
never during cutscenes, dialogue, menus, the title; shown once per profile (`marzena.hints.seen`); `G.settings.hints = false` silences them.
`G.hints.show(id, { force })`, `prompt(items, seconds)` (story cards), `reset()`. Add one by appending to `HINTS` in hintDefs.js. In shot mode they are off unless the URL has `&hints`.

## Kosci, the tavern dice game (`src/minigames/dice/`)
Dice poker for two, played in the Drowned Bell against Zbyszek (across the bar) and the two regulars Wojtek and Halina
(middle table). Rules, AI and match logic are pure (no DOM, no three.js) and tested by `scripts/dicetest.mjs`; the table, the
screen and the story hooks sit on top.

```js
G.dice.play('zbyszek' | 'wojtek' | 'halina', { seed?, speed?, drive? })  // -> Promise<result>; loads on demand (story/controller/dice.js)
// result: { played: false, reason: 'player_short' | 'opp_short' | 'declined' | 'busy' | 'no_table' }
//       | { played: true, verdict: 'player' | 'opp' | 'draw' | 'left', ante, net, wins, rounds, best, opp, reason }
G.dice.canPlay(id) -> { ok, reason }     G.dice.purse(id)     G.dice.record()     G.dice.active     G.dice.last     G.dice.session
```
- **Rules** (`rules.js`): five dice each, best of three rounds (drawn rounds replayed, five at most). Hands low to high: nothing,
  pair, two pairs, three, small straight (1 to 5), big straight (2 to 6), full house, four, five. Ties go to the values that
  make the hand (higher pair first, the triple before the pair), then the remaining dice from the top; straights have nothing
  to compare. `evaluate(dice)`, `compare(a, b)`, `scoreOf`, `distribution`, `evaluateRerolls`.
- **Round** (`match.js`, a state machine: `beginRound`, `rollFirst`, `playerBet`, `aiBet`, `playerRespond`, `setPlayerReroll`,
  `aiReroll`, `rollSecond`, `settle`, `leave`): both stake the ante; both roll five; the player may raise once by the ante
  (the opponent calls or folds) or hold, in which case the opponent may raise and the player calls or folds; each side picks
  any dice and rolls them again once; the better hand takes the pot. A side needs twice the ante (stake and one raise) to
  start a round; the match ends when one cannot.
- **Opponents** (`opponents.js`, `ai.js`): `zbyszek` (cautious, stakes 1 to 3, purse 24), `wojtek` (bold, 3 to 10, purse 70),
  `halina` (bluffer, 2 to 6, purse 45); purses refill each day and are kept in `G.state.data.dice.purse`. The AI scores each of
  the 32 ways to roll again by the average chance of beating a sensible rival (exact, by enumeration) and a personality tilts
  the choice (spread of outcomes), the raise and call thresholds, a bluff rate and a slip rate. Barks per situation (roll, good,
  bad, raise, call, fold, win, lose, broke), three to four each, are unvoiced and read by `scripts/voice/extract.mjs`.
- **Table** (`stage.js`, `dieModel.js`, `roll.js`, `sites.js`): dice are rounded cubes with carved pips (one shared geometry, a
  painted colour and normal atlas per style: house, bone, walnut, horn, redbone). A roll is a scripted path ending on the
  chosen face (shake in a hand, a flight, two bounces, tumbles over the leading edge). Coins, a woollen cloth, contact shadows.
  The frame is placed on the tavern's own table or bar (`barTop` and `tableTop2` anchors in `architecture/buildings/tavern.js`).
  While it is up it owns the camera: `G.cameraOwner = 'dice'` (restored after, with the fov); Vesna is hidden and put at
  the table, the opponent's NPC is paused, the HUD is hidden and the screen is a modal (`G.input.context = 'ui'`, clock held).
  `G.story.busy` is true while `G.dice.active`.
- **Screen and controls** (`ui.js`, `dice.css`): stake, round score, hand names, the question. Keyboard: 1 to 5 pick a die, arrows or A and D
  move the cursor, E picks the die under it, Space or Enter rolls, R raises, Esc leaves (asks first). Mouse: click a die. Pad:
  D-pad or left stick moves, A picks, X or Start rolls, Y raises, B leaves. H (Back on the pad) shows or hides the list of hands on the
  left of the screen, best first, with an example of each; the rows she and the opponent hold are marked (filled and hollow diamonds)
  and the choice is kept in `localStorage` (`marzena.dice.hands`). The actions `dice_pick`, `dice_roll`, `dice_raise`, `dice_hands`
  (bindings.js, context `'dice'`, group Dice on the Controls screen) are rebindable; the screen reads key events, and a pad button
  is turned into the key of the same action by `scr.padKey(button)` (a hook of `ui.openScreen`'s return value, used by `UI._padNavKey`).
  First-use hints `dice_pick` and `dice_raise` (hintDefs.js) are shown with `G.hints.show(id, { force: true })`.
- **Story** (`story/controller/dice.js`, dialogues `dice_wojtek`, `dice_halina`, `zbyszek_hub`): each talk ends at the node `dice_go` and
  the controller starts the match. Flags `dice_known`, `dice_zbyszek_met`, `dice_met_<id>`, `dice_beat_<id>` (a whole match won),
  `dice_all_beaten`, `dice_bone_set`; side quest `side_dice`; notes `note_dice_rules`, `item_bone_dice`. Details in STORY.md.
- **Save**: `G.state.data.dice = { matches: { won, lost, drawn, left }, rounds, grosze: { won, lost }, best, by: { <id>: {...} }, purse }`.
- **Events**: `dice:start`, `dice:phase { phase }` (stake, roll1, bet, respond, reroll, roll2, showdown, next, end), `dice:round`, `dice:match`;
  `dice:pick`, `dice:roll`, `dice:raise` for the hints. `G.state.give/take(item, n, quiet)` skips the pickup toast.
- **Sounds** (`audio/sfx/recipes/dice.js`): `dice_land`, `dice_rattle`, `dice_tumble`, `dice_tick`, `coin_pile`, `coin_slide`.
- **NPCs and stations**: `wojtek` and `halina` are in `gameplay/npcs/cast.js` (presets `villager_m_8`, `villager_f_7`, kept out of the
  ambient crowd) with stations `wojtek_seat`, `halina_seat` on the far bench of table 2; `life.js` also registers the stations the
  cast table already named for the keeper (`tavern_bar`, `zbyszek_bed`, `tavern_porch`), which did not exist before (he stood at a
  random spot in the tavern, under the floor).
- **Tests and tools**: `node scripts/dicetest.mjs` (rules, tie breaks, AI, matches, rolls: 159 checks, no browser);
  `MZ_CHROME=1 node scripts/dicedrive.mjs [match|pad|leave]` (the real screen from keys, the mouse and a mocked pad, with pictures in
  `shots/dice/`); `?scene=dice` (`src/debug/scenes/dice.js`: `__dice.start`, `until(phase)`, `press(code)`); the logic playthrough plays four
  seeded matches and the quest (`side: dice`); `scripts/inputtest.mjs` still passes with the new actions.

## Event names
`flag`, `inventory`, `note`, `discover`, `saved`, `loaded`, `reset`, `time:hour`, `time:day`,
`time:jump`, `weather:change`, `resize`, `game:ready`, `player:hit`, `player:death`,
`enemy:death`, `combat:start`, `combat:end`, `quest:update`, `dialogue:start`, `dialogue:end`,
`cutscene:start`, `cutscene:end`, `senses:on`, `senses:off`, `location:enter`, `location:leave`,
`input:device`, `input:pad`, `input:bindings`, `settings`, `camera:retarget`, `camera:shoulder`, `dice:start`, `dice:phase`, `dice:round`, `dice:match`.

## Test hooks and the screenshot harness
`window.__G` is the context. `window.__MZ_READY` turns true when loaded. `window.__MZ_STATS`
holds `{ fps, calls, triangles }`. `window.__MZ_ERRORS` lists module init errors.

URL params: `shot` (deterministic, frozen clock, no title/audio), `cam=x,y,z`, `look=x,y,z`,
`fov`, `hour`, `weather`, `only=a,b`, `skip=a,b`, `scene=name` (loads
`src/debug/scenes/<name>.js`, which exports `init(G)` and optionally `modules = [...]` and
`needsWorld = true`), `frames=N`, `fps=N` (shot mode caps rendering at 6 fps after load; raise it for animation sheets), `quality`, `gridRes`, `debug` (F1 fly camera, P logs camera params).

```bash
node scripts/shot.mjs --q "cam=-380,75,360&look=0,0,0&hour=15.5&weather=clear" --out shots/terrain/reveal.png
node scripts/shot.mjs --q "scene=characters&cam=0,1.6,5&look=0,1,0" --out shots/chars/sheet.png --seq 12 --every 120 --cols 4
node scripts/shot.mjs --batch shots/terrain/plan.json
```
Rendering is software (SwiftShader) by default, so FPS in the harness is meaningless; draw calls and
triangles are real. On a machine with a GPU, `MZ_GPU=1 node scripts/shot.mjs ...` renders on the GPU
(add `MZ_HEADED=1` if headless falls back to software); the harness prints the renderer it got. A shot takes 5 to 30 s. Put your shots under `shots/<your-area>/` (gitignored).
Each builder should add a gallery scene in `src/debug/scenes/` for its area.

Input, camera, menus and hints have a functional test with a mocked gamepad: `MZ_CHROME=1 node scripts/inputtest.mjs [input|lock|menus|hints|defs]`
(114 checks, about 4 minutes). UI screens for screenshots: `?scene=ui&show=controls&tab=camera&device=pad`, `show=hint&hint=senses` (see the header of `src/debug/scenes/ui.js`).

## Collaboration rules (several builders work in this tree at once)
- **Only edit files you own** (listed in your brief). Read anything.
- Do not run git commands that change state (no commit, checkout, stash, reset). The lead commits.
- Do not run `npm run build` into `dist/` concurrently; use the shot harness (it runs a dev
  server) and `npx eslint <your files>` to validate.
- If another module is broken and blocks you, use `skip=` and report it; do not fix their files.
- Your final report: what you built, the public API (exact), known gaps, requests for other owners, and the screenshot paths that best show your work.
