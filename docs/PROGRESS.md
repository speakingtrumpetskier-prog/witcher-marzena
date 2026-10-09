# Progress (live)

Process (updated at the user's request, to save tokens): builder subagents build each area; the
lead reviews every result directly (screenshots, frame sheets, code) against the Witcher 3 bar,
catches issues, and fixes them or sends a targeted fix back to the builder. No critic subagents.

| Phase | Area | Builder | Status | Review rounds | Notes |
|---|---|---|---|---|---|
| 0 | Design bible, story script, village plan, architecture, engine skeleton, harness | lead | done | n/a | docs/DESIGN.md, docs/STORY.md, docs/VILLAGE.md, docs/ARCHITECTURE.md |
| 1 | Terrain, ice, water, rocks | opus | done, reviewed | 1 | worker-built 1025 + far grids, single instanced LOD terrain, horn-peak ranges with a sunset notch, black ice with depth, frozen river and falls, 3.8k rocks, full thaw |
| 1 | Atmosphere, sky, weather, post | opus | done, reviewed | 1 | real sun/moon paths, 15 palettes, near+far shadows, sky with aurora, 3-layer fog, 5 weathers with snowfall, MSAA/bloom/god rays/grade, senses/echo/frost, markClue |
| 1 | Characters, animation, horse | opus | done, reviewed | 2 | hair volume and Vesna's braid, grim resting faces, skin tone and scar, beard cards, sculpted dun horse with mane and feathering |
| 1 | Audio and music | opus | done, reviewed | 1 | 12 moods, 7 stingers, 68 SFX, auto ambience; no clipping, loudness on target; needs human ears |
| 1 | Vegetation | sonnet | done, reviewed | 2 | needle-card spruce and pine tufts, Bayer LOD dither, coherent far canopy, marsh reeds, spring leaves |
| 1 | Architecture kit | sonnet | done, reviewed | 1 | full catalog incl. enterable tavern, longhouse+cellar, Hanka's house, workshop, walkable bell tower; placeBuilding with foundations, colliders, doors, lights, walk floors |
| 1 | Props kit and FX | sonnet | done, reviewed | 1 | 74 props, pooled FX (fire, smoke, steam, sparks, wisps, breath), PropBatch merging; lead fixed the Collision yaw convention both kits worked around |
| 2 | Player, camera, horse riding, player moveset | sonnet (worktree) | done, merged | 1 | locomotion with ice slide, moveset events, stats and warmth, W3 camera with lock-on, Kasza call/mount/gallop/ice refusal/road assist |
| 2 | UI | sonnet | done, reviewed | 1 | HUD, compass, subtitles, barks, choices, journal, parchment map, notes, pause, settings, title, credits |
| 2 | Dialogue, cutscene director, quests, interaction, senses, flow | opus (single agent) | done, reviewed | 1 | TV-director coverage, skippable cutscenes, all quests, senses trails and echoes, title/new game/continue/rest |
| 2 | NPCs and animals | sonnet (worktree) | done, merged | 1 | schedules, A* paths over colliders, pairs chatting, head turns, barks, indoors at night and in blizzards; dogs, hens, goat on a roof, cat, ravens |
| 2 | Combat, creatures, signs, boss mechanics | sonnet (worktree) | building | 0 | |
| 3 | Village composition | sonnet (worktree) | done, merged | 1 | 28 houses + heroes + 11 outbuildings, palisade and gates, stilted huts, boardwalk, graveyard, ~440 props, 177 NPC stations, fires, light pool, smoke, interiors, doors, discovery tracker, story anchors |
| 3 | Lake set pieces and wilderness nooks | sonnet (worktree) | building | 0 | |
| 3 | Dialogue scenes (writer) | sonnet (worktree) | building | 0 | under the STORY.md voice rules |
| 3 | Cutscenes, endings, the thaw (cinematics) | sonnet (worktree) | building | 0 | |
| 3 | Story controller: triggers, clues, quests, boss integration, endings, playthrough | sonnet | pending | | after wilderness and combat merge |

Model policy (user request): Part Two and later run on Sonnet 5.5, except a single long-running builder may stay on Opus (the story systems builder).

## Polish list (lead, integration pass)
- UI: distant barks low contrast over grey trees (strengthen shadow/scrim for barks).
- UI: map lake label BELLMERE collides with the Stone Circle Isle label.
- UI: retune the title camera path once the village and locations exist.
- Props: 128 px textures tile at close range; effigies read a little doll-like (bigger straw silhouette, rougher hem).
- Audio: needs a human listen (voice synthesis is the risk).
- Architecture: idol faces too blocky (tiki read); sculpt deeper relief, weather it, keep the silhouette.
- Architecture: bell tower should lean a few degrees and look drowned (ice line stains, broken boards, frost); stone texture cartoonish up close.
- Terrain: noon snow blown out and no distance haze (sent to atmosphere builder); ice wind streaks too regular; talus boulders read as scattered teeth; marsh pool edges look cut; bear den needs a cave opening in the escarpment (locations builder; terrain left a pattern at the falls).
- Done: Senses routes echo clues through G.postfx.markClue in turquoise.
- Fixed (lead): striped shadow acne on low-sun snow (near shadow normalBias); snow micro-normals now fade with pixel footprint.
- Integration: 'Multiple instances of Three.js being imported' warning in the playground scene; find the stray import.
- Gameplay: no strafe or turn-in-place clips for lock-on; mount clip has an 8 cm seat pop; no mounted combat.
- Fixed (lead): village LOD proxies read orange at golden hour; walls darkened to match log albedo.
- Village: busiest views sit at the budget (~450 calls, 2.5M tris; the full street vista from the west is 2.9M); square foreground bare until NPCs; Hanka's milk shelf is a flat disc; south road and sled hill lightly dressed.
- NPCs: the cat is small and weak at distance; goat is pale with stick legs; net mender and well tool poses unconfirmed.
- Characters: Ola's bangs read as a sawtooth up close; Bogdan's cheek beard edge slab-like at extreme close-up; braid stretches on extreme head turns. Main cast now 11k to 14k tris and 0.3 to 0.6 s to build: NPCs must spread creation over frames.
- Vegetation: LOD1/LOD2 spruce (30 to 100 m) still read as stylized tiered cones; consider needle fringe at LOD1.
- Integration: windows and fires need emissive about 3 to 6 x uWindowLight to bloom at night (architecture, props).
- Integration: some unnamed mesh has NaN positions (atmosphere report); find and fix.
- Integration: move the six extra fog uniforms from fogChunk.js into Uniforms.js.
- Architecture: large buildings 21k to 42k tris; drop log segments 10 to 8 if the village view is over budget.
