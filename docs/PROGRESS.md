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
| 1 | Audio and music | opus | building | 0 | |
| 1 | Vegetation | sonnet | building | 0 | |
| 1 | Architecture kit | sonnet | building | 0 | |
| 1 | Props kit and FX | sonnet | building | 0 | |
| 2 | Player, camera, horse riding | sonnet | waits for characters | | |
| 2 | UI | sonnet | building | 0 | started early, no dependencies |
| 2 | Dialogue, cutscene director, quests, interaction, senses, flow | opus (single agent, resumed) | building | 0 | critics on Sonnet after it reports |
| 2 | NPCs and animals | sonnet | waits for characters | | |
| 2 | Combat and creatures | sonnet | waits for characters | | |
| 3 | Village and wilderness locations | | pending | | |
| 3 | Writing and cutscene scripts | | pending | | |

Model policy (user request): Part Two and later run on Sonnet 5.5, except a single long-running builder may stay on Opus (the story systems builder).
