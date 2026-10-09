# MARZENA: Story Script, Quests, and Director's Shot Lists

Companion to DESIGN.md section 3. This is the source of truth for quest flow, flags, notes,
barks, and cutscenes. Writers expand the dialogue beats into full scenes in Vesna's voice and
each character's voice (DESIGN 3.2). **No em dashes anywhere.** Dialogue rules:
- Short lines. People in this valley are cold, hungry, and tired. They do not make speeches.
- Subtext over statement. Nobody says "I feel guilty". Hanka says "The milk freezes by morning. I bring more."
- Concrete nouns: grosze, sacks, ice holes, straw, ribbons, rope, rye, herring, tallow, birch.
- Humor survives in the dark: Zbyszek, Ola, Dobra, and Vesna's deadpan. One laugh per scene, at most.
- Every scene changes something: a fact learned, a flag set, a relationship moved.
- Vesna rarely asks two questions in a row. She looks, then says one thing.

---

## 1. Flags

| Flag | Set when |
|---|---|
| `prologue_done` | Reveal cutscene ends |
| `song_heard` | C3 plays at the workshop |
| `met_ola` | First Ola exchange |
| `contract_taken` | Notice board read |
| `met_zbyszek` | Tavern first talk |
| `met_bogdan` | Longhouse first talk |
| `took_reeve_money` / `refused_reeve_money` | Bogdan's offer |
| `knows_fair_hand` | Zbyszek mentions Hanka's handwriting |
| `met_hanka`, `hanka_hired` | Hanka's house |
| `night1` | Player rested or waited past 20:00 with `hanka_hired` |
| `trail_found` | Senses clue at the ice camp |
| `effigies_fought` | First marzanny wave defeated |
| `echo_seen` | C4 Echo plays |
| `lair_seen` | C5 Lair plays |
| `wiesia_spoke` | Wiesia's voice in the belfry |
| `met_dobra`, `dobra_knot_noticed` | Dobra talk (morning of day 2) |
| `hanka_confronted` + `hanka_comforted` or `hanka_blamed` | Decisive choice |
| `ledger_found` | Read the ledger in the longhouse cellar |
| `reeve_told` | Told Bogdan the truth after `echo_seen` AND `ledger_found` |
| `jarek_met`, `bird_taken`, `bird_given` | Side quest |
| `snowfight_done`, `ola_truth` / `ola_lie` | Snow Fight and its question |
| `wisps_done`, `smuggler_key`, `stash_opened` | Lights in the Reeds |
| `wolves_mill_done`, `miller_warm_water` | Wolves at the Mill |
| `island_power` | Place of power at the stone circle (Ember empowered) |
| `wit_sword` | Silver sword from the bear den |
| `rite_started`, `boss_started`, `ending` = 'thaw' / 'looking_back' / 'nothing_changes' | Finale |
| `looked_back` | Epilogue final input |

---

## 2. Quests and journal (Vesna's terse notes)

Journal voice: Vesna's own notebook. Present tense, clipped, dry, occasionally a crack of feeling.

### Q1 `main_pass` "The Hollow Pass"
1. **Get through the pass.** Journal: *Hollow Pass in a blizzard. Kasza hates me. Fair.*
2. **Examine the wreck** (cart, senses). *A family. Tried to leave the valley. The father died looking back over his shoulder.*
3. **Wolves.** *Three wolves. Thin. Hungry things do stupid things. So do I.*
4. **Ride on to the watchtower** (marker watchtower). Completes with C2.

### Q2 `main_ice` "Something Walks the Ice"
1. **Ride into Marzena** (marker west gate). C3 at the workshop on the way in.
2. **Read the notice board** (square). *"Something walks the ice at night." Signed H. A careful hand. Somebody practiced that letter.*
3. Parallel: **Ask at the Drowned Bell** and **See the reeve**.
   - After Zbyszek: *Three fishermen gone. Bread at three grosze. The rite is tomorrow night. The barman says only Hanka writes that fair.*
   - After Bogdan: *The reeve does not want me here. He offered me money to leave. (took: I took it. Money is money.) (refused: I didn't take it. He looked relieved and angry at once.)*
4. **Find Hanka** (house on the shore, east). *Hanka posted the contract. Her daughter Ola is the maiden they mean to drown. Pay: sixty-one grosze and a wedding ring. I've worked for less. Not often.*
5. Completes, starts Q3.

### Q3 `main_straw` "Straw and Ice"
1. **Wait for nightfall** (rest at the tavern bed, the banya, or any campfire; or wait). *Whatever walks the ice walks at night. So I'll walk the ice at night.*
2. **Search the ice-fishing camp** (iceCamp). *Drag marks. Straw. A mitten with a hand-darned thumb.*
3. **Follow the trail** (senses trail to the ritual site; marzanny attack). *Straw dolls, walking. Fire takes them. Each one had a red knot tied at the neck.*
4. **Examine the ritual site** (echo spot): C4. *Three years ago. A girl went under the ice with the effigy. They kept singing. They didn't look back. One did.*
5. **Follow the drag marks to the tower** (bell tower). Starts Q4.

### Q4 `main_bell` "The Bell Under the Ice"
1. **Climb the drowned tower.** *The bell tower of Old Marzena. Stairs inside, rotten, iced.*
2. **The belfry** (C5). *Seventeen straw girls around a table. Frozen bread. A music box. Three men under the ice, faces up. She wasn't hunting. She was keeping house.*
3. **Return to the village at dawn.** Leaving the tower triggers a fade: "Dawn." Morning fog on the lake. Starts Q5.

### Q5 `main_hanka` "What Hanka Saw"
1. **Ask Dobra about the rite** (workshop). *The effigy maker. Hands like roots. She told me the rite was a mercy once. She looked at my medallion for too long.*
2. **Confront Hanka.** Decisive choice. (comforted) *I told her Ola needs her to look now. She'll come onto the ice.* (blamed) *I told her the truth. She'll come onto the ice. I don't know what else she'll do.*
3. **Wait for the equinox night** (rest until evening; the side quests live here). *Tonight they drown Marzanna. Tonight they mean to drown Ola.*

### Q6 `main_rite` "The Drowning of Marzanna"
1. **Go to the ritual site** (procession starts at 20:00 from the shore; C6).
2. **Survive** (boss).
3. **Choose** (decisive).
4. Ending cutscene, then Epilogue "Dobra's Knot".

### Side quests
- `side_bird` **A Bird for Wiesia.** Jarek drinks at the Drowned Bell after dark and mends nets at the fishing huts by day. He carved a waxwing for Wiesia and never gave it. *He asks me to take it to her. To the ice. I said I'd see.* Place it on the belfry table (interact). *I left the bird on her table.* Payoff in endings A and B.
- `side_ledger` **The Reeve's Ledger.** Trapdoor in the longhouse floor behind the hearth. *The reeve gave his own share away. To the Nowak children. To widow Pawlak. His son's name is crossed out.* Unlocks the persuasion line that sets `reeve_told` (needs `echo_seen`).
- `side_wisps` **Lights in the Reeds.** At night in the west marsh, three pale lights drift away when approached; follow them to a smuggler frozen in the reeds with a note and a key. The stash is in the third charcoal kiln. Reward: 35 grosze, 2 Thaw draughts.
- `side_wolves` **Wolves at the Mill.** Second paper on the notice board. Miller Gniewko: wolves took his dog. Track them to a den at the foot of the frozen falls; 4 wolves and a scarred alpha. Reward: 40 grosze, and Gniewko says his father never let anyone fish near the poles: "Warm water comes up there. The ice is never as thick as it looks." (`miller_warm_water`; Vesna can use it with Bogdan.)
- `side_snow` **Snow Fight.** Day 2 morning, sledding hill. Ola and two kids ambush Vesna. 60-second snowball fight. Afterward, sitting on the sled, Ola asks: "Does it hurt? Drowning?" Choice: *the truth* ("For a little while. Then it doesn't.") or *a lie* ("I won't let it happen.") (`ola_truth` / `ola_lie`). Ola's last line in ending C changes with it.

---

## 3. Scenes (beats and key lines)

Each scene lists: place, time, weather, cast, beats, choices, flags. Key lines are canonical;
writers fill around them.

### C1 Blizzard Road (cutscene, prologue opener) about 50 s
Place: pass road near SPAWN.prologue. Time 14:30. Weather blizzard. Music: `pass`.
Shot list:
1. BLACK. Wind. A horse's breath. Fade up.
2. EXTREME WIDE, low, through blowing snow: a lone rider, small, on the switchback road, mountain walls vanishing upward into white.
3. MEDIUM, tracking alongside: Vesna, hood up, scarf over her mouth, head down into the wind. Kasza's mane whipping.
4. CLOSE on Kasza's eye and flattened ear. She stops dead. Snorts.
5. OVER THE SHOULDER of Vesna: ahead, a dark shape in the snow. An overturned cart, a dead mule half-buried.
6. Vesna dismounts (anim `dismount`), walks to the cart. LOW ANGLE past a frozen hand in the snow.
7. CLOSE: the father, frozen, twisted at the waist, **looking back over his shoulder** up the road toward the valley. Snow in his eyelashes.
8. Vesna crouches (`crouch_examine`), closes his eyes with two fingers. VESNA: "Looked back. Last thing you ever did."
9. Distant wolf howl. Then another, closer. Vesna's head turns. Cut to gameplay.

### C2 The Valley (cutscene, the reveal) about 35 s
Place: watchtower ridge. Time 15:40 (golden). Weather blizzard to clear in 8 s. Music: `reveal`, title stinger.
1. Gameplay ends as Vesna reaches the ridge crest; cut to MEDIUM from behind: she and Kasza in white-out.
2. The wind drops. The snow thins (weather to clear, fast). Light breaks gold across her shoulders.
3. CRANE UP and over her: the valley opens below. Hold on the frozen lake glowing, the bell tower in the ice, chimney smoke rising straight from the village, the idol on its hill against the sun, the frozen falls in the east.
4. SLOW PUSH toward the bell tower. The theme swells (white voice).
5. CUT to CLOSE on Vesna, eyes narrowing. VESNA (quiet): "Huh." (she has hummed this tune before; she doesn't notice yet).
6. WIDE, the camera drifting down toward the village. Title card: **MARZENA**, then fade to gameplay at the watchtower.
Sets `prologue_done`. Weather auto stays clear, time continues.

### C3 The Song (short in-engine) about 20 s, triggers entering the village by the west gate
Place: Dobra's workshop yard (LOC.dobra). Time ~16:30. Cast: 4 children incl. Ola, Dobra in the doorway (not introduced).
Beats: Children sit on straw bales stuffing a small straw doll, singing the Marzanno song in thin voices. Vesna slows. CLOSE on Vesna. Music box motif once, soft. She mouths the last bar without knowing it. Ola notices her.
- OLA: "Are you a witch?"
- VESNA: "Hunter."
- OLA: "Mama says mutants eat snow."
- VESNA: "Too cold. We eat children. Only in season."
- (The other kids scatter shrieking. Ola does not move. She grins: missing tooth.)
- OLA: "It's not the season."
- VESNA: "Then you're safe." (beat) "For now."
- Dobra, from the doorway, watching Vesna, says nothing. Sets `song_heard`, `met_ola`.

### Notice board (interaction)
Reads `note_contract`. Second paper `note_wolves_contract`. Sets `contract_taken`.

### Zbyszek, the Drowned Bell (dialogue hub)
Beats: Zbyszek complains about the cold, the beer ("I water it by the season. Winter's a long season."), then gossip:
- Three fishermen gone this month: "Stach, Bolek, and the younger Wrona. Went to their holes at dusk and the holes were empty in the morning. Not even the stools."
- "Straw walks out there. I've seen it from the shore. Like girls dancing. Slow."
- "The rite is tomorrow night. Equinox. We drown Marzanna and the winter goes. That's how it's supposed to work." (beat) "It's been three years of supposed to."
- About the contract hand: "H.? Only Hanka writes that fair. Her man was the scribe before the fever took him. She keeps to herself. House on the shore, east, past the huts."
- About the maiden: he won't say. "Ask the reeve. It's his arithmetic."
- Shop: Thaw draughts (12 grosze), a bowl of fish soup (restores warmth, 2 grosze).
- Rest: a bed upstairs (pass time).
Sets `met_zbyszek`, `knows_fair_hand`.

### Bogdan, the longhouse (dialogue)
Beats: Bogdan at the long table with his ledger, a cold hearth to save wood.
- BOGDAN: "We didn't send for a hunter."
- VESNA: "Somebody did."
- He counts. "Forty-one sacks. A hundred and eighty-six mouths. Do you know what that is? It's counting how many of my neighbors will be alive at the thaw."
- About the rite: "Tomorrow the goddess has her due, and it will be settled."
- VESNA: "Her due."
- BOGDAN: "Don't. You don't live here."
- He slides a purse: 100 grosze. "For your trouble. The pass is open enough for one rider."
- Choice: **Take the money** ("Money's money.") / **Leave it** ("Keep it. You'll need it for bread.")
- He forbids the ice: "Stay off the lake. That's not a request."
Sets `met_bogdan`, `took_reeve_money` or `refused_reeve_money`.
Later (after `echo_seen`): option "Three years ago. Wiesia didn't fall alone." If `ledger_found` also: VESNA: "You gave your bread to the Nowak children. You're not a man who drowns girls for arithmetic." He breaks; `reeve_told`. Without the ledger: he throws her out: "Get out of my hall."

### Hanka's house (dialogue)
Beats: cold hearth, a bowl of milk by the door with a skin of ice on it. Hanka mending a white dress (Ola's rite dress). She does not stand.
- VESNA lays the contract on the table.
- HANKA: "You're slower than I hoped."
- She explains in few words: "They chose Ola. My youngest. The goddess took one from this house, so she wants the pair. That's what they say."
- "Kill whatever walks the ice before tomorrow night. Then they'll have no reason."
- She pays up front: a purse, sixty-one grosze, and a wedding ring on a string. VESNA: "Keep the ring." HANKA: "Take it. I won't need it."
- Ola comes in from the cold, sees Vesna: "The witch!" Hanka: "Hunter." (a flicker of a smile between Ola and Vesna). Ola puts snow in the milk bowl "for Wiesia." Hanka goes very still.
- If asked about Wiesia: HANKA: "She drowned. Three years ago. At the rite." Nothing more. "The milk freezes by morning. I bring more."
Sets `met_hanka`, `hanka_hired`. Inventory: coins +61, item `ring`.

### Night 1: the ice camp (gameplay + senses)
Aurora, clear, cold (warmth drains). The camp: three holes, empty stools gone, a windbreak flapping. Senses: drag marks (two lines, like heels), straw, the darned mitten. Trail goes north toward the ritual poles. Marzanny rise out of the snow drifts in a ring: 3, then 2 more. Vesna (bark on first sight): "Straw. Walking. Wonderful." On burn: "Burn well enough."

### C4 The Echo (cutscene) about 60 s
Place: ritual site. Night 1. Postfx echo look. Music `night` to silence, then `sorrow` thread.
1. Vesna kneels at the old hole (frozen over, a faint circle). Senses pulse. The world drains to blue.
2. WIDE: ghost figures fade in, pale turquoise, translucent: a procession of women in white with torches (the flames also pale), singing (the song, distant, as if through water).
3. MEDIUM: Wiesia (14, ghost-blue) carrying the straw Marzanna on its pole, solemn, proud, her mother walking behind her.
4. The effigy is set alight (pale fire), pushed into the hole. Wiesia steps back. The ice under her foot cracks.
5. CLOSE on her feet. A web of cracks. She goes through with a short sound swallowed by the song.
6. WIDE: the procession has already turned, walking back toward the shore, singing, not looking back.
7. CLOSE on the ice: two small hands on the broken edge.
8. MEDIUM on Hanka (ghost): she turns her head. Her face. She sees. She stops walking for one heartbeat.
9. The woman beside her takes her arm, still singing. Hanka **turns forward again** and keeps walking.
10. CLOSE: the hands slip under. Slush closes. Silence.
11. The ghosts fade. Back to night colors. Vesna, still kneeling. VESNA (very quiet): "She looked."
Sets `echo_seen`.

### The bell tower climb (gameplay)
Ice-level broken window into the flooded nave; ice floor; rotten stairs spiraling up inside the stone tower; creaks, the bell above, wind whistling. Two effigies on the stairs (one sitting, it turns its head as she passes, does not attack: unsettling).

### C5 The Lair (cutscene) about 45 s
Place: belfry. Night 1. Frost on every surface, glittering.
1. Vesna rises through the trapdoor. HANDHELD-feel slow push.
2. WIDE: the belfry made into a room. A table of ice planks. Frozen bread. Seventeen straw effigies seated around it in their white rags, heads tilted, like a family at supper. Red knots at every neck.
3. CLOSE: a small music box on the table. Vesna touches it. It plays the motif (A A G F, the fall to D). She stops it. She knows the tune.
4. Insert: a red ribbon tied to the bell rope.
5. Vesna looks down through a gap in the floor: below, under the clear ice beside the tower, three men frozen, faces up, eyes open, as if looking at someone above.
6. A girl's voice, close, wet, small: WIESIA: *"Did Mama send you?"*
7. Vesna turns: nothing. Under the ice, a pale shape slides away, trailing hair.
8. VESNA (to herself): "Not a hunter. A child keeping house."
Sets `lair_seen`, `wiesia_spoke`. If `bird_taken` and not `bird_given`: an interact on the table "Leave the bird".

### Dawn transition
Leaving the tower after C5 fades: "Dawn." Day 2, 7:30, weather fog. Vesna stands on the shore by the huts.

### Dobra, the workshop (dialogue)
Beats: Dobra twisting straw into a new Marzanna for tonight, hands never stop. Earthy, funny, sharp.
- DOBRA: "Hunter. You're staring at my girls."
- On the rite: "We dress a straw girl as death and drown her so death goes home. You don't look back, or it follows you. Stupid. Beautiful. Mostly stupid."
- Island lore: "Out on the isle there are stones older than the church. Go look. Once it wasn't straw we drowned. The straw was the mercy. Bogdan has forgotten that. Fear makes men into their great-grandfathers."
- On Wiesia: "She was my apprentice for a season. Clever hands. Tied a better knot than me by the end." (beat) "Don't tell her mother I said that."
- The knot: Dobra's eyes go to the red-thread knot on Vesna's medallion chain. She stops working for the first time. "Where did you get that?" VESNA: "Had it as long as I've had anything." DOBRA, after a long beat: "Hm." She goes back to work too fast. "Hum something for me, hunter." VESNA: "No." DOBRA: "No. Of course not." (`dobra_knot_noticed`)
- On the marzanna: "If the girl is holding the winter, she's not doing it out of spite. Children don't spite. They hold on."
Sets `met_dobra`.

### Hanka confronted (dialogue, DECISIVE)
Place: Hanka's house, day 2. Hanka is stitching red embroidery into Ola's dress.
- VESNA: "I was on the ice last night. At the poles."
- HANKA keeps stitching.
- VESNA: "I saw it. The rite. Three years ago."
- HANKA's needle stops.
- VESNA: "You turned around."
- Long silence. HANKA: "Everyone was singing." (beat) "You don't look back. You don't. Your feet keep walking and the song keeps going and you think, I saw nothing, I saw the ice, I saw the light on the ice." (beat) "By the time I ran back it had closed."
- HANKA: "Every night I put milk on the ice. Every morning it's frozen. She doesn't drink it." (beat) "She wants me to look. Doesn't she."
- **Choice (decisive, red knot icon, 12 s timer):**
  - **"Ola needs you to look now. Not at the ice. At her."** HANKA (after a long time): "Yes." (`hanka_comforted`)
  - **"You watched her die and kept singing."** HANKA: "Yes." She goes back to stitching. Her hands shake. (`hanka_blamed`)
  - (timer runs out: treated as blame, Vesna says nothing, Hanka: "You don't have to say it.")
- HANKA, either way: "Tonight I'll walk out there. Whatever you're going to do, I'll be on the ice."
Sets `hanka_confronted`.

### Jarek (side, dialogue)
At the Drowned Bell after dark or at the huts by day, mending nets with numb fingers.
- "You're going out there. To her." He takes out a carved wooden waxwing. "I made this. For the rite. For after. I was going to give it to her after." (beat) "I was drunk. I was drunk the night they cut the hole. Maybe I cut it in the wrong place. Maybe the ice was thin because of me." (Vesna can tell him about the warm water if `miller_warm_water`: "It wasn't you. Warm water comes up under the poles." He cries.)
- "Give it to her. Please."

### Snow Fight (side)
Ola: "Hunter! You're Marzanna!" (snowball). Minigame. After, sitting on a sled:
- OLA: "Mama's sewing my dress. It's very white." (beat) "Does it hurt? Drowning?"
- Choice: truth / lie (see Q list).
- OLA (to truth): "Thanks for not lying. Grown-ups lie." (to lie): "Okay." (she knows).

### C6 The Procession (cutscene) about 70 s
Place: shore to ritual site. Day 2, 20:00. Weather snow rising to blizzard. Music `procession` (the villagers' choir).
1. WIDE from the ice looking back at the shore: a line of torches leaving the village, winding down past the huts onto the ice.
2. TRACKING: women in white headscarves and shawls, singing; men behind with torches; children holding hands.
3. Dobra's effigy, tall on its pole, white dress, red knot, carried by two men.
4. Beside it: Ola, in the white dress Hanka sewed, wrists tied with red ribbon, chin up, terrified, singing anyway.
5. Hanka walks at the edge of the procession, not singing.
6. Bogdan in front, ledger left behind, a torch in his fist.
7. At the poles: the hole has been cut. Black water steams in the cold.
8. CLOSE: Bogdan. If `reeve_told`: he stops. The song falters. BOGDAN: "Enough." He cuts Ola's ribbon himself. The crowd murmurs. Otherwise: Vesna walks out of the snow into the torchlight. VESNA: "Let her go." BOGDAN: "Stay out of this, hunter." Vesna cuts the ribbon with one stroke; the crowd falls back from her drawn sword.
9. A sound under the ice: the bell. Deep, muffled, from everywhere. Everyone stops singing.
10. The ice groans. Cracks race outward from the hole. Torches tremble.
Sets `rite_started`.

### C7 Emergence (cutscene) about 25 s
1. LOW ANGLE on the ice: a pale glow spreads beneath like a lantern rising through deep water.
2. Effigies burst up out of the snow drifts around the ring, ice cracking off them.
3. The hole erupts. The marzanna rises: 4 m tall, white cloth and ice, long dark hair floating as if underwater, crown of frozen straw, a girl's face stretched too long, eyes shining turquoise.
4. Villagers scatter. Hanka does not move.
5. WIESIA (her voice layered with a howl): *"Don't go. Don't go. Don't go."*
6. Vesna draws her silver sword (anim). Boss fight begins (`boss` mood).
Sets `boss_started`.

### The choice at 25% (decisive, 15 s timer)
The marzanna shatters; Wiesia kneels on the ice as a girl, ghost-pale, crying, holding herself. If `bird_given`, she holds the wooden bird.
- WIESIA: *"It's cold down there. It's so dark. If the ice goes I'll go down and nobody will see me."*
- Options:
  - **Strike.** (Vesna raises the silver sword.)
  - **"Hanka. Look at her."**
  - **"Not my contract."** (only if `took_reeve_money`)
- Timer runs out: Vesna lowers the sword and says "Hanka." (defaults to ending B).

### Ending A: The Thaw (strike) about 80 s
1. Silver goes in. Wiesia gasps, surprised, almost relieved. "Oh." She comes apart into snow on the wind.
2. Silence. Then a crack like the world breaking. The ice shatters outward in a ring from the hole.
3. The bell tower groans, leans, and slowly sinks into the black water, bell tolling once as it goes under.
4. Dawn time-lapse (uSnowCover 1 to 0, then uSpring 0 to 1): snow slides off roofs, the lake opens into dark water reflecting a gold sky, birch leaves appear, grass greens the slopes, birds return. Music `thaw`.
5. The village on the shore cheers. Then the cheering stops when they look at Vesna. Nobody comes near her.
6. Hanka kneels at the waterline alone, hand in the water.
7. Ola, freed, stands beside her mother but looks at Vesna. If `bird_given`: the waxwing floats in to the shore at Hanka's knees.
8. Fade.

### Ending B: Looking Back (call Hanka) about 90 s
1. Vesna lowers her sword. VESNA: "Hanka. Look at her."
2. Hanka walks out alone across the cracked ice. She stops in front of her daughter. **She turns to face her fully.** Close on Hanka's face, the thing she did not do.
3. HANKA: "I saw you. I saw your hands." (beat) "I'm sorry I kept walking."
4. WIESIA: *"You looked."* HANKA: "I'm looking."
5. Wiesia lets go. She sinks gently, lit from below, hair spreading, looking up at her mother until she is a small light, then gone. If `bird_given`, the waxwing stays on the ice.
6. Snow stops. The ice softens. A slow, quiet dawn. Spring comes gently (slower time-lapse). Music `thaw`, softer.
7. If `hanka_comforted`: Hanka walks back across the ice to Ola. They hold each other. Ola looks over her mother's shoulder at Vesna and nods, like an adult.
   If `hanka_blamed`: Hanka steps toward the open water where Wiesia went down. Ola calls "Mama!" Hanka does not turn around. She steps in. Vesna catches Ola before she can follow and holds her as she screams. Long shot: the two of them on the ice, the open water still.
8. Fade.

### Ending C: Nothing Changes (step back) about 70 s
1. VESNA: "Not my contract." She steps back. Sheathes.
2. The marzanna, without a fight, sinks back under. The villagers, shaking, re-form the procession. They tie Ola's wrists again.
3. Hanka screams at them. Two women hold her.
4. They walk Ola to the hole, singing. Wide: Vesna stands apart, watching.
5. Ola (if `ola_truth`): "You said it stops hurting." (if `ola_lie`): "You said." She goes into the water.
6. They turn their backs and walk away singing. Nobody looks back.
7. The snow keeps falling. Winter does not break.
8. Final shot (later, day): children stuffing next year's effigy in Dobra's yard, singing.
9. Fade.

### Epilogue: Dobra's Knot (all endings) about 90 s
Morning. Vesna saddles Kasza at the west gate. Weather matches the ending (spring sun for A and B, grey snowfall for C).
1. Dobra comes down the path with a tiny straw doll, the size of a hand, a red knot at its neck.
2. DOBRA: "Thirty-eight winters ago, the Hunger Winter, a hunter of the Lynx killed the wolves that were eating our dead. We had nothing. I had a daughter I couldn't feed." (beat) "I tied this knot on her blanket. You have it on your chain."
3. Long beat. Choice:
   - **"You should have looked back."** DOBRA: "Yes." (she holds out the doll; Vesna takes it or not, the player's next input decides: E to take)
   - **"I know the song. I've always known it."** DOBRA's face breaks. She hums two bars. Vesna, almost, joins on the fall.
   - **Silence.** Dobra nods, as if that is answer enough.
   - If `wit_sword`: extra line before the choice. VESNA: "His name was Wit. He told me he found me in a ditch." DOBRA: "He came back once. Years later. Asked if I wanted to know where you were. I said no." (beat) "I said no."
4. Vesna mounts and rides down the road east (toward the pass road, which loops; staging is free). WIDE: rider small on the road.
5. Prompt fades in: **[Hold E] Look back.** (5 s window)
   - Held: the camera turns past Vesna's shoulder: Dobra on the rise by the gate, holding up the little doll. If Ola is alive she runs to the fence and waves both arms. Vesna lifts a hand. (`looked_back`)
   - Not held: the road, the snow or the green, Kasza's ears, onward.
6. Credits over the full Marzanno song (the lullaby version, solo voice, then the ensemble).

---

## 4. Notes and readable text (final copy)

- **note_cart_family** (frozen cart): "Brother. If this finds you, we did not make it over. Three winters and the snow up here has not gone soft once, not even at midsummer. The old women in Marzena say the lake will not let anyone leave until it gets what it wants. I say a man can walk. Mira says I am a fool. Zosia asked me if the goddess is angry with her. I told her goddesses do not know her name. Tomasz."
- **note_contract** (notice board): "Something walks the ice at night. It has taken three men from the fishing holes. Kill it before the equinox. Payment: all I have. Ask at the shore. H."
- **note_wolves_contract** (notice board): "WOLVES at the mill. Took my dog and near took my boy. Will pay what I have, which is not much but is honest. Gniewko, miller."
- **note_tally** (watchtower wall, examine): "Rows of tally marks scratched into the stone, hundreds of them. Beneath: COLD. WOLVES. COLD. BORED. KAZIMIERZ WAS HERE AND IS BETTER AT DICE THAN YOU."
- **note_hanged** (pinned to the hanged man's coat): "He took three loaves for my children. The reeve wept when he gave the order. I will not weep for the reeve. If you mean to hang me too, find a better rope. This one is frayed, and we have no other. Agnieszka."
- **note_burner** (charcoal camp, examine boards): "THE LAKE SINGS. THE LAKE SINGS. she sings it backwards at night. THE LAKE SINGS. do not answer. THE LAKE"
- **note_trapper** (trapper's cabin, diary): "Day 9. Wolves down from the pass in daylight. They do not hunt. They run. As if there is something in the high snow worse than hunger. Day 12. Set the big trap by the door. Day 14. Heard the bell from the lake tonight, clear as a feast day. There has been no bell in Marzena since the water came. Day 15. Going down to look."
- **note_island** (stone circle carvings, examine): "Carvings older than the church. Women on the ice with a girl between them. A hole. The girl going down. The next stone: a straw girl going down instead, and the women dancing. Somebody, a long time ago, decided this was better."
- **note_ledger** (longhouse cellar): "Sacks: 41. Mouths: 186. Ration: half a measure. Kral household: Bogdan. Mateusz (crossed out). Kral ration given to the Nowak children. Given to widow Pawlak. Given to the Wrona girl. Sacks at the thaw, if the thaw comes: 0. If it does not come: 0."
- **note_drawing** (kids' fort under the boardwalk): a child's charcoal drawing of a tall pale lady under wavy lines. Caption: "the ice lady. she is lonly. she wants her mama."
- **note_smuggler** (marsh corpse): "Key to the burners' kilns, third mound. Do not drink it all before I'm back. B."
- **note_wit** (bear den, inscription on the silver sword): "For Wit of the Lynx. Paid in full." (Vesna, examining: "Wit. You old liar. You said you found me in a ditch.")
- **item_ring**: "A thin wedding ring on a string. Hanka's."
- **item_bird**: "A waxwing carved from birch, the crest done with care. Never given."
- **item_music_box**: "A tin music box with a crank. It plays four notes and a fall."
- **item_ribbon**: "A red ribbon, stiff with frost, tied in Dobra's knot."
- **item_straw_doll**: "A straw doll the size of a hand. Red thread at the neck."

---

## 5. Ambient barks

Villagers (day, near Vesna): "Don't look at her eyes." / "Is that a witch?" "Hush, she'll hear you." "She heard." / "Bread's three grosze. Three!" / "My grandmother saw a spring once. Said it smelled like mud. I'd like mud." / "Hunter. We've nothing to pay you with." / "The lake sang again last night." / "Tomorrow it ends. One way or another." / "Mind the goat. The goat bites."
Villagers (night): "Get indoors, it's past dusk." / "Don't go past the poles." / "Hear that? No. Nothing. Go on."
Villagers (day 2, before the rite): "They say the Wrona girl was chosen. No. Hanka's." "Hanka's? Again?" / "I won't go. I'll go. Everyone goes."
Fishermen: "Not past the poles. Never past the poles." / "Herring's thin this year. Like everything." / "Ice is thick here. Thick as my head."
Children: "You're Marzanna!" "No, you are!" / "Witch! Do your eyes glow?" / (to each other) "If you look back she gets you!"
Zbyszek: "Wipe your boots. Or don't. Nobody does." / "Beer's fine. Fine-ish."
Dobra: "Straw, straw, straw." / "Hands, girl. Use your hands."
Vesna (exploration): "Nice view. Cold view." / "Kasza. Don't." / (finding a corpse) "Not long ago." / (low warmth) "Need a fire." / (on the ice) "Ice is talking."

---

## 6. Staging notes for builders
- Cutscene actors are spawned by the script if not present, and despawned or returned to schedule after.
- All cutscenes are skippable (hold Space). Skipping must land the world in the scene's end state (flags, time, weather, positions).
- Decisive choices pause nothing in the world except the choice timer; the camera holds on faces.
- Time and weather beats: C1 blizzard 14:30, C2 clear 15:40, C3 ~16:30, night 1 aurora (rest to 21:00), dawn fog 7:30 day 2, the rite at 20:00 day 2 rising blizzard, endings at dawn.
