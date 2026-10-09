# Progress (live)

Process (updated at the user's request, to save tokens): builder subagents build each area; the
lead reviews every result directly (screenshots, frame sheets, code) against the Witcher 3 bar,
catches issues, and fixes them or sends a targeted fix back to the builder. No critic subagents.

| Phase | Area | Builder | Status | Review rounds | Notes |
|---|---|---|---|---|---|
| 0 | Design bible, story script, village plan, architecture, engine skeleton, harness | lead | done | n/a | docs/DESIGN.md, docs/STORY.md, docs/VILLAGE.md, docs/ARCHITECTURE.md |
| 1 | Terrain, ice, water, rocks | opus | building | 0 | |
| 1 | Atmosphere, sky, weather, post | opus | building | 0 | |
| 1 | Characters, animation, horse | opus | building | 0 | |
| 1 | Audio and music | opus | done, reviewed | 1 | 12 moods, 7 stingers, 68 SFX, auto ambience; no clipping, loudness on target; needs human ears |
| 1 | Vegetation | sonnet | building | 0 | |
| 1 | Architecture kit | sonnet | building | 0 | |
| 1 | Props kit and FX | sonnet | done, reviewed | 1 | 74 props, pooled FX (fire, smoke, steam, sparks, wisps, breath), PropBatch merging; lead fixed the Collision yaw convention both kits worked around |
| 2 | Player, camera, horse riding | sonnet | waits for characters | | |
| 2 | UI | sonnet | done, reviewed | 1 | HUD, compass, subtitles, barks, choices, journal, parchment map, notes, pause, settings, title, credits |
| 2 | Dialogue, cutscene director, quests, interaction, senses, flow | opus (single agent, resumed) | building | 0 | critics on Sonnet after it reports |
| 2 | NPCs and animals | sonnet | waits for characters | | |
| 2 | Combat and creatures | sonnet | waits for characters | | |
| 3 | Village and wilderness locations | | pending | | |
| 3 | Writing and cutscene scripts | | pending | | |

Model policy (user request): Part Two and later run on Sonnet 5.5, except a single long-running builder may stay on Opus (the story systems builder).

## Polish list (lead, integration pass)
- UI: distant barks low contrast over grey trees (strengthen shadow/scrim for barks).
- UI: map lake label BELLMERE collides with the Stone Circle Isle label.
- UI: retune the title camera path once the village and locations exist.
- Props: 128 px textures tile at close range; effigies read a little doll-like (bigger straw silhouette, rougher hem).
- Audio: needs a human listen (voice synthesis is the risk).
