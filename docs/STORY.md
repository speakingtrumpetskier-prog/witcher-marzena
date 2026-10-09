# MARZENA: Story Script, Quests, and Director's Shot Lists

Companion to DESIGN.md section 3. This is the source of truth for quest flow, flags, notes,
barks, and cutscenes. Writers expand the dialogue beats into full scenes. **No em dashes anywhere.**

## Writing voice (read this before writing a single line)

The bar is The Witcher 3 at its best: the Bloody Baron drunk in his own hall, Velen peasants
arguing over a goat, Keira Metz complaining about her hut. What makes those scenes work is not
wit. It is realism: people talk the way people talk, about what is in front of them, and the
meaning arrives through what they do and what they avoid saying.

**Do**
- Write what this person would actually say, right now, to this person, knowing what they know.
- Let people talk about practical things: the price of bread, firewood, a dress that is too
  long, a dog, the cold, money owed, the reeve. The big thing sits underneath, unspoken.
- Let them be imperfect: they repeat themselves, trail off, answer a different question,
  change the subject, get small facts wrong, ask for something, interrupt.
- Let behavior carry emotion: hands that stop working, not looking up, refilling a cup, a long
  pause. Stage directions are part of the writing and should be plain physical actions.
- Humor comes from character and situation (a child unimpressed by a hunter's eyes, a tavern
  keeper defensive about his beer, an old woman bossing everyone around), never from a quip.
- Vesna is a working professional. She asks practical questions, haggles, notices things, is
  sometimes kind in plain words, and often says nothing at all.
- Every scene changes something: a fact learned, a flag set, a relationship moved.

**Do not**
- No aphorisms, no lines that would look good on a poster.
- No character summarizing the theme, the scene, or someone else's psychology.
- No one-liner to cap an exchange or a scene. Scenes may end on something ordinary.
- No staccato triplets ("Stupid. Beautiful. Mostly stupid."), no parallel-structure flourishes.
- No meta-observations, no characters remarking on irony, no winks at the player.
- Nobody is more articulate than they would be. A grieving mother is not eloquent. A child talks like a child.
- Nobody explains the rite's symbolism. People in Marzena do the rite because their mothers did,
  and they talk about it like a chore and a fear, not a metaphor.

Test every line: would a cold, hungry, frightened person in this valley say this out loud? If it
reads like writing, cut it or make it plainer.

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

Journal voice: Vesna's working notes. Who, what, where, what it pays, what she saw. Plain and short. Feeling shows only in what she chooses to write down, never in commentary.

### Q1 `main_pass` "The Hollow Pass"
1. **Get through the pass.** Journal: *Hollow Pass. Snowing hard. Lost the road twice.*
2. **Examine the wreck** (cart, senses). *Cart on the pass road. A man, a woman, a small girl, all frozen. Letter on the man, to his brother.*
3. **Wolves.** *Three wolves on the road. Starving, all ribs.*
4. **Ride on to the watchtower** (marker watchtower). Completes with C2.

### Q2 `main_ice` "Something Walks the Ice"
1. **Ride into Marzena** (marker west gate). C3 at the workshop on the way in.
2. **Read the notice board** (square). *Contract on the board in the square: something walks the ice at night. Three fishermen missing. Signed only "H."*
3. Parallel: **Ask at the Drowned Bell** and **See the reeve**.
   - After Zbyszek: *Zbyszek at the tavern: the missing men are Stach, Bolek and the younger Wrona. Their rite is tomorrow night. Says the hand on the contract is Hanka's.*
   - After Bogdan: (took) *The reeve, Bogdan Kral, paid me 100 grosze to leave. Took it. He wants me off the lake.* (refused) *The reeve, Bogdan Kral, offered 100 grosze to leave. Didn't take it. He wants me off the lake.*
4. **Find Hanka** (house on the shore, east). *Hanka posted it. They have picked her daughter Ola for the rite. Paid 61 grosze and her wedding ring. Wants it done before tomorrow night.*
5. Completes, starts Q3.

### Q3 `main_straw` "Straw and Ice"
1. **Wait for nightfall** (rest at the tavern bed, the banya, or any campfire; or wait). *They say it comes out at night. Wait for dark.*
2. **Search the ice-fishing camp** (iceCamp). *Ice camp: the stools are gone. Drag marks going north, loose straw, one mitten.*
3. **Follow the trail** (senses trail to the ritual site; marzanny attack). *Straw figures moving on the ice. Fire works on them. Red thread tied at every neck.*
4. **Examine the ritual site** (echo spot): C4. *At the poles: three years ago a girl went through the ice with the effigy. Nobody went back for her. Hanka turned round, then kept walking.*
5. **Follow the drag marks to the tower** (bell tower). Starts Q4.

### Q4 `main_bell` "The Bell Under the Ice"
1. **Climb the drowned tower.** *The old church tower in the ice. Stairs inside, rotten.*
2. **The belfry** (C5). *Belfry: seventeen effigies sat round a table, frozen bread, a music box. The three fishermen are under the ice by the tower. A girl's voice asked if her mother sent me.*
3. **Return to the village at dawn.** Leaving the tower triggers a fade: "Dawn." Morning fog on the lake. Starts Q5.

### Q5 `main_hanka` "What Hanka Saw"
1. **Ask Dobra about the rite** (workshop). *Dobra, the effigy maker. Says the old carvings on the island show real girls, before the straw. Kept looking at the knot on my chain.*
2. **Confront Hanka.** Decisive choice. (comforted) *Told Hanka what I saw. She'll be on the ice tonight.* (blamed) *Told Hanka what I saw, and what I think of it. She'll be on the ice tonight.*
3. **Wait for the equinox night** (rest until evening; the side quests live here). *The rite is tonight, after dark.*

### Q6 `main_rite` "The Drowning of Marzanna"
1. **Go to the ritual site** (procession starts at 20:00 from the shore; C6).
2. **Survive** (boss).
3. **Choose** (decisive).
4. Ending cutscene, then Epilogue "Dobra's Knot".

### Side quests
- `side_bird` **A Bird for Wiesia.** Jarek drinks at the Drowned Bell after dark and mends nets at the fishing huts by day. He carved a waxwing for Wiesia and never gave it. *Jarek, a fisherman, carved a bird for Wiesia and never gave it to her. Wants me to take it out there.* Place it on the belfry table (interact). *Left the bird on the table in the belfry.* Payoff in endings A and B.
- `side_ledger` **The Reeve's Ledger.** Trapdoor in the longhouse floor behind the hearth. *Reeve's ledger, in the cellar. He has been giving his own ration away. His son's name is crossed out.* Unlocks the persuasion line that sets `reeve_told` (needs `echo_seen`).
- `side_wisps` **Lights in the Reeds.** At night in the west marsh, three pale lights drift away when approached; follow them to a smuggler frozen in the reeds with a note and a key. The stash is in the third charcoal kiln. Reward: 35 grosze, 2 Thaw draughts.
- `side_wolves` **Wolves at the Mill.** Second paper on the notice board. Miller Gniewko: wolves took his dog. Track them to a den at the foot of the frozen falls; 4 wolves and a scarred alpha. Reward: 40 grosze, and Gniewko says his father never let anyone fish near the poles: "Warm water comes up there. The ice is never as thick as it looks." (`miller_warm_water`; Vesna can use it with Bogdan.)
- `side_snow` **Snow Fight.** Day 2 morning, sledding hill. Ola and two kids ambush Vesna. 60-second snowball fight. Afterward, sitting on the sled, Ola asks: "Does it hurt? Drowning?" Choice: *the truth* ("For a bit. Then it doesn't.") or *a lie* ("It won't happen.") (`ola_truth` / `ola_lie`). Ola's last line in ending C changes with it.

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
8. Vesna crouches (`crouch_examine`), closes his eyes with two fingers, checks inside his coat, finds a folded letter, puts it away. No line.
9. Kasza snorts and sidesteps. VESNA (low, to the horse): "Easy. I know."
10. Distant wolf howl. Then another, closer. Vesna's head turns. Cut to gameplay.

### C2 The Valley (cutscene, the reveal) about 35 s
Place: watchtower ridge. Time 15:40 (golden). Weather blizzard to clear in 8 s. Music: `reveal`, title stinger.
1. Gameplay ends as Vesna reaches the ridge crest; cut to MEDIUM from behind: she and Kasza in white-out.
2. The wind drops. The snow thins (weather to clear, fast). Light breaks gold across her shoulders.
3. CRANE UP and over her: the valley opens below. Hold on the frozen lake glowing, the bell tower in the ice, chimney smoke rising straight from the village, the idol on its hill against the sun, the frozen falls in the east.
4. SLOW PUSH toward the bell tower. The theme swells (white voice).
5. CUT to CLOSE on Vesna, squinting into the light. She lowers her scarf and breathes out. No line.
6. WIDE, the camera drifting down toward the village. Title card: **MARZENA**, then fade to gameplay at the watchtower.
Sets `prologue_done`. Weather auto stays clear, time continues.

### C3 The Song (short in-engine) about 20 s, triggers entering the village by the west gate
Place: Dobra's workshop yard (LOC.dobra). Time ~16:30. Cast: 4 children incl. Ola, Dobra in the doorway (not introduced).
Beats: Children sit on straw bales stuffing a small straw doll, singing the Marzanno song in thin voices. Vesna slows. CLOSE on Vesna. Music box motif once, soft. She mouths the last bar without knowing it. Ola notices her.
- OLA: "Are you a witch?"
- VESNA: "No."
- OLA: "Mama says mutants eat snow."
- VESNA: "Does she."
- OLA: "And that you've got cat's eyes." (Vesna crouches to her level and lets her look. Ola studies her face very seriously.)
- OLA: "They're just yellow."
- A BOY (from behind the bales): "Ola, come away!" (Ola doesn't.)
- OLA: "Are you here for the ice lady?"
- VESNA: "Who's the ice lady?"
- DOBRA (from the doorway, not to Vesna): "Ola. Straw." (Ola goes straight back to the bales.)
- Dobra keeps looking at Vesna a moment longer, then goes inside. Sets `song_heard`, `met_ola`.

### Notice board (interaction)
Reads `note_contract`. Second paper `note_wolves_contract`. Sets `contract_taken`.

### Zbyszek, the Drowned Bell (dialogue hub)
Beats: Zbyszek puts a mug in front of her before she asks. "It's thin. I know it's thin. You try brewing with what we've got." Then gossip:
- Three fishermen gone this month: "Stach, Bolek, and the younger Wrona. Went to their holes at dusk and the holes were empty in the morning. Not even the stools."
- "Something's out there at night. I've seen it from the shore. Like people walking, but wrong. Slow."
- "The rite's tomorrow night. Equinox. We drown Marzanna and the winter goes." (beat) "We've done it three years running. Look outside."
- About the contract hand: "H.? Only Hanka writes that fair. Her man was the scribe before the fever took him. She keeps to herself. House on the shore, east, past the huts."
- About the maiden: he won't say. "Ask the reeve. It's not my business and I'm not saying it."
- Shop: Thaw draughts (12 grosze), a bowl of fish soup (restores warmth, 2 grosze).
- Rest: a bed upstairs (pass time).
Sets `met_zbyszek`, `knows_fair_hand`.

### Bogdan, the longhouse (dialogue)
Beats: Bogdan at the long table with his ledger, a cold hearth to save wood.
- BOGDAN (doesn't look up from the ledger): "We didn't send for anyone."
- VESNA: "Someone did."
- BOGDAN: "Then someone can pay you." (He finishes the column he is adding before he looks at her.)
- On the village: "We went into the winter with ninety sacks of rye. There's forty-one. There's a hundred and eighty-six of us. You can do sums."
- About the rite: "Tomorrow night we do the rite, and that's the end of it."
- VESNA: "And the girl?"
- BOGDAN (stops writing): "You've been talking to people."
- He puts a purse on the table: 100 grosze. "The pass will take one rider, if she's careful."
- Choice: **Take the money** ("All right.") / **Leave it** ("Keep it.")
- As she goes: "And stay off the lake. People go through it."
Sets `met_bogdan`, `took_reeve_money` or `refused_reeve_money`.
Later (after `echo_seen`): option "About the rite three years ago." VESNA: "Wiesia didn't just fall in. Her mother saw her in the water, and everyone kept walking." BOGDAN: "Who told you that?" If `ledger_found`: VESNA: "I was in your cellar. You've been giving your own ration to the Nowak children." (He looks at her a long time.) "Ola's eleven." He sits down, and doesn't say anything else; `reeve_told`. Without the ledger: "Get out of my house."

### Hanka's house (dialogue)
Beats: cold hearth, a bowl of milk by the door with a skin of ice on it. Hanka mending a white dress (Ola's rite dress). She does not stand.
- VESNA lays the contract on the table.
- HANKA (looks at the paper, not at her): "I didn't think anyone would come."
- She explains in few words: "They've picked Ola. My youngest. They say the goddess took one from this house, so she'll want the other. That's what they're saying."
- "If whatever's out there is dead before tomorrow night, they'll have no reason."
- She pays up front: a purse, sixty-one grosze, and a wedding ring on a string. VESNA: "Keep the ring." HANKA: "Take it. It's what I've got."
- Ola comes in stamping snow off her boots, sees Vesna: "It's the witch." HANKA: "Ola." OLA: "She said she isn't one." Ola drops a handful of snow into the bowl by the door. Hanka goes very still and says nothing.
- If asked about the bowl: HANKA: "It's nothing. It freezes by morning anyway."
- If asked about Wiesia: HANKA: "She drowned. Three years ago. At the rite." She picks the dress back up. That's all.
Sets `met_hanka`, `hanka_hired`. Inventory: coins +61, item `ring`.

### Night 1: the ice camp (gameplay + senses)
Aurora, clear, cold (warmth drains). The camp: three holes, empty stools gone, a windbreak flapping. Senses: drag marks (two lines, like heels), straw, the darned mitten. Trail goes north toward the ritual poles. Marzanny rise out of the snow drifts in a ring: 3, then 2 more. Vesna has no lines here; let the effort grunts and the fire carry it.

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
11. The ghosts fade. Back to night colors. Vesna stays kneeling a moment, then stands and looks toward the shore, where one window in Hanka's house is still lit. No line.
Sets `echo_seen`.

### The bell tower climb (gameplay)
Ice-level broken window into the flooded nave; ice floor; rotten stairs spiraling up inside the stone tower; creaks, the bell above, wind whistling. Two effigies on the stairs (one sitting, it turns its head as she passes, does not attack: unsettling).

### C5 The Lair (cutscene) about 45 s
Place: belfry. Night 1. Frost on every surface, glittering.
1. Vesna rises through the trapdoor. HANDHELD-feel slow push.
2. WIDE: the belfry made into a room. A table of ice planks. Frozen bread. Seventeen straw effigies seated around it in their white rags, heads tilted, like a family at supper. Red knots at every neck.
3. CLOSE: a small music box on the table. Vesna turns the crank. It plays the motif (A A G F, the fall to D). She lets it play to the end.
4. Insert: a red ribbon tied to the bell rope.
5. Vesna looks down through a gap in the floor: below, under the clear ice beside the tower, three men frozen, faces up, eyes open, as if looking at someone above.
6. A girl's voice, close, wet, small: WIESIA: *"Did Mama send you?"*
7. Vesna turns: nothing. Under the ice, a pale shape slides away, trailing hair.
8. Vesna puts the music box back exactly where it was. No line.
Sets `lair_seen`, `wiesia_spoke`. If `bird_taken` and not `bird_given`: an interact on the table "Leave the bird".

### Dawn transition
Leaving the tower after C5 fades: "Dawn." Day 2, 7:30, weather fog. Vesna stands on the shore by the huts.

### Dobra, the workshop (dialogue)
Beats: Dobra twisting straw into a new Marzanna for tonight, hands never stop. Earthy, funny, sharp.
- DOBRA (without looking up): "Mind your feet, that's tonight's."  (Vesna is standing on the straw for the new effigy.)
- On the rite: "Every year I make her and every year they drown her. My mother made them before me." (beat) "You walk her out, you burn her, in she goes, you walk back singing. You don't turn round. That's all there is to it." If asked why not: "Because you don't. My mother didn't. Her mother didn't."
- Island lore: "There's old stones out on the island with pictures cut in them. My grandmother used to say it was real girls once, before the straw. I don't know. She said a lot of things." (beat) "Bogdan's been out to look at those stones. Twice this winter."
- On Wiesia: "She helped me one winter. Good hands. Tied a better knot than me by the end. Don't tell her mother I said that."
- The knot: Dobra's eyes go to the red-thread knot on Vesna's medallion chain. Her hands stop for the first time. "Where did you get that?" VESNA: "I've always had it." DOBRA: "Hm." She goes back to work, fast. A little later, without looking up: "Do you sing, hunter?" VESNA: "No." DOBRA: "No." (`dobra_knot_noticed`)
- On the marzanna, if Vesna describes the belfry: Dobra is quiet a while. "My boy, when he was little, he'd get under the bed when it thundered. You couldn't pull him out. You had to sit on the floor and wait." (She ties off a knot.) "Took half the night, some nights."
Sets `met_dobra`.

### Hanka confronted (dialogue, DECISIVE)
Place: Hanka's house, day 2. Hanka is stitching red embroidery into Ola's dress.
- VESNA: "I was out at the poles last night."
- HANKA keeps stitching.
- VESNA: "I saw what happened. Three years ago."
- HANKA's needle stops.
- VESNA: "You turned round."
- Long silence. HANKA: "Everyone was singing." (beat) "Marta had my arm. I thought it was the torches. You look at torches and then you see things on the ice. Spots." (beat) "By the time I got back there was just slush."
- Her hands start on the stitching again, badly. HANKA: "I take milk down every night. She liked it warm. I can't get it out there warm."
- **Choice (decisive, red knot icon, 12 s timer):**
  - **"Ola's still here. She needs you tonight."** HANKA, after a long time: "Yes." (`hanka_comforted`)
  - **"You saw her, and you kept walking."** HANKA: "Yes." She goes back to stitching. Her hands shake. (`hanka_blamed`)
  - (timer runs out: Vesna says nothing. HANKA: "Go on. Say it." Vesna doesn't. Counts as `hanka_blamed`.)
- HANKA, either way: "I'll be on the ice tonight. Whatever you do."
Sets `hanka_confronted`.

### Jarek (side, dialogue)
At the Drowned Bell after dark or at the huts by day, mending nets with numb fingers.
- "You're going out there. To her." He takes out a carved wooden waxwing. "I made this. For the rite. For after. I was going to give it to her after." (beat) "I was drunk. I was drunk the night they cut the hole. Maybe I cut it in the wrong place. Maybe the ice was thin because of me." (Vesna can tell him about the warm water if `miller_warm_water`: "It wasn't you. Warm water comes up under the poles." He cries.)
- "Give it to her. Please."

### Snow Fight (side)
Ola: "Hunter! You're Marzanna!" (snowball). Minigame. After, sitting on a sled:
- OLA: "Mama's sewing my dress. It's very white." (beat) "Does it hurt? Drowning?"
- Choice: truth / lie (see Q list).
- (truth) Ola nods as if she expected that, then shoves a handful of snow down Vesna's collar and runs. (lie) OLA: "Okay." She doesn't look at Vesna. She picks at the sled's runner.

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
- WIESIA: *"I don't want to go down there. It's dark down there."* (She looks past Vesna at the shore.) *"Mama?"*
- Options:
  - **Strike.** (Vesna raises the silver sword.)
  - **"Hanka."** (Vesna calls her over.)
  - **(Step back. Let them finish it.)** (only if `took_reeve_money`)
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
1. Vesna lowers her sword. VESNA (over her shoulder): "Hanka."
2. Hanka walks out alone across the cracked ice. She stops in front of her daughter and kneels so they are level. **She does not look away.** Close on Hanka's face.
3. HANKA: "Wiesiu." (beat) "Wiesiu, I'm here. I'm sorry. I'm here."
4. WIESIA: *"Mama, it's cold."* HANKA: "I know. I know it is." She keeps her eyes on her daughter the whole time.
5. Wiesia lets go. She sinks gently, lit from below, hair spreading, looking up at her mother until she is a small light, then gone. If `bird_given`, the waxwing stays on the ice.
6. Snow stops. The ice softens. A slow, quiet dawn. Spring comes gently (slower time-lapse). Music `thaw`, softer.
7. If `hanka_comforted`: Hanka walks back across the ice to Ola. They hold each other. Ola looks over her mother's shoulder at Vesna and nods, like an adult.
   If `hanka_blamed`: Hanka steps toward the open water where Wiesia went down. Ola calls "Mama!" Hanka does not turn around. She steps in. Vesna catches Ola before she can follow and holds her as she screams. Long shot: the two of them on the ice, the open water still.
8. Fade.

### Ending C: Nothing Changes (step back) about 70 s
1. Vesna sheathes her sword and steps back out of the torchlight. She says nothing.
2. The marzanna, without a fight, sinks back under. The villagers, shaking, re-form the procession. They tie Ola's wrists again.
3. Hanka screams at them. Two women hold her.
4. They walk Ola to the hole, singing. Wide: Vesna stands apart, watching.
5. Ola (if `ola_truth`) looks at Vesna once and says nothing. (if `ola_lie`) OLA: "You said it wouldn't." She goes into the water.
6. They turn their backs and walk away singing. Nobody looks back.
7. The snow keeps falling. Winter does not break.
8. Final shot (later, day): children stuffing next year's effigy in Dobra's yard, singing.
9. Fade.

### Epilogue: Dobra's Knot (all endings) about 90 s
Morning. Vesna saddles Kasza at the west gate. Weather matches the ending (spring sun for A and B, grey snowfall for C).
1. Dobra comes down the path with a tiny straw doll, the size of a hand, a red knot at its neck.
2. DOBRA (out of breath from the walk down): "Wait. Wait, I'm old." (She gets her breath.) "There was a winter, before you'd remember anything. We were boiling bark. The wolves came down and got into the graves." (beat) "A hunter came through. One of yours. Lynx. We had nothing to give him." (beat) "I had a baby I couldn't feed."
   She reaches out and touches the knot on Vesna's chain without asking. "I tie it the same way every time. I can't do it any other way."
3. Long beat. Choice:
   - **"Why didn't you come looking?"** DOBRA: "Where would I have looked?" (She holds out the doll. E to take it.)
   - **"I know that song. I never knew where from."** Dobra's face goes. She hums the first bar, badly, and has to stop.
   - **(Say nothing.)** Dobra nods. She presses the doll into Vesna's hand anyway.
   - If `wit_sword`: before the choice. VESNA: "His name was Wit. He told me he found me in a ditch." DOBRA: "He came back. Years after. Asked did I want to know where you were." (beat) "I said no." She doesn't explain.
4. Vesna mounts and rides down the road east (toward the pass road, which loops; staging is free). WIDE: rider small on the road.
5. Prompt fades in: **[Hold E] Look back.** (5 s window)
   - Held: the camera turns past Vesna's shoulder: Dobra on the rise by the gate, holding up the little doll. If Ola is alive she runs to the fence and waves both arms. Vesna lifts a hand. (`looked_back`)
   - Not held: the road, the snow or the green, Kasza's ears, onward.
6. Credits over the full Marzanno song (the lullaby version, solo voice, then the ensemble).

---

## 4. Notes and readable text (final copy)

- **note_cart_family** (frozen cart): "Brother. If this finds you, we did not make it over. Three winters and the snow up here has not gone soft once, not even at midsummer. The old women in Marzena say the lake will not let anyone leave until it gets what it wants. I say a man can walk. Mira says I am a fool. Zosia's cough is worse. We go tomorrow if it stops snowing, and the day after if it does not. Tomasz."
- **note_contract** (notice board): "Something walks the ice at night. It has taken three men from the fishing holes. Kill it before the equinox. Payment: all I have. Ask at the shore. H."
- **note_wolves_contract** (notice board): "WOLVES at the mill. Took my dog and near took my boy. Will pay what I have, which is not much but is honest. Gniewko, miller."
- **note_tally** (watchtower wall, examine): "Rows of tally marks scratched into the stone, hundreds of them. Beneath: COLD. WOLVES. COLD. BORED. KAZIMIERZ WAS HERE AND IS BETTER AT DICE THAN YOU."
- **note_hanged** (pinned to the hanged man's coat): "He took three loaves for my children. The reeve cried when he gave the order, as if that helps anyone. Cut him down if you can, I can't reach. Agnieszka."
- **note_burner** (charcoal camp, examine boards): "THE LAKE SINGS. THE LAKE SINGS. she sings it backwards at night. THE LAKE SINGS. do not answer. THE LAKE"
- **note_trapper** (trapper's cabin, diary): "Day 9. Wolves down from the pass in daylight. They do not hunt. They run. As if there is something in the high snow worse than hunger. Day 12. Set the big trap by the door. Day 14. Heard the bell from the lake tonight, clear as a feast day. There has been no bell in Marzena since the water came. Day 15. Going down to look."
- **note_island** (stone circle carvings, examine): "Carvings older than the church. Women on the ice with a girl between them. A hole. The girl going down. The next stone: a straw girl going down instead, and the women dancing. The stones are worn smooth where people have touched them."
- **note_ledger** (longhouse cellar): "Sacks: 41. Mouths: 186. Ration: half a measure. Kral household: Bogdan. Mateusz (crossed out). Kral ration given to the Nowak children. Given to widow Pawlak. Given to the Wrona girl. Weeks left at this ration: 5."
- **note_drawing** (kids' fort under the boardwalk): a child's charcoal drawing of a tall pale lady under wavy lines. Caption: "the ice lady. she is lonly. she wants her mama."
- **note_smuggler** (marsh corpse): "Key to the burners' kilns, third mound. Do not drink it all before I'm back. B."
- **note_wit** (bear den, inscription on the silver sword): "For Wit of the Lynx. Paid in full." (Vesna, examining it, quietly: "Wit." Nothing else.)
- **item_ring**: "A thin wedding ring on a string. Hanka's."
- **item_bird**: "A waxwing carved from birch, the crest done with care. Never given."
- **item_music_box**: "A tin music box with a crank. It plays one tune."
- **item_ribbon**: "A red ribbon, stiff with frost, tied in Dobra's knot."
- **item_straw_doll**: "A straw doll the size of a hand. Red thread at the neck."

---

## 5. Ambient barks

Villagers (day, near Vesna): "Don't look at her eyes." / "Is that a witch?" "Hush. Walk." / "Bread's three grosze now. Three!" / "When did you last see grass?" "Don't." / "Hunter. We've nothing to pay you with, you know." / "Did you hear it last night? Out on the lake?" / "Have you got any tallow? I'll give you eggs. Well. One egg." / "Mind the goat, she bites."
Villagers (night): "Get indoors, it's past dusk." / "Don't go past the poles." / "Hear that? No. Nothing. Go on."
Villagers (day 2, before the rite): "Is it the Wrona girl?" "No. Hanka's." "Hanka's? Her other one?" / "Are you going tonight?" "Course I'm going. Everyone's going."
Fishermen: "Not past the poles. Never past the poles." / "Herring's thin this year." / "You're standing on my line." / "Ice is thick here. Thick as my head."
Children: "You're Marzanna!" "No, you are!" / "Witch! Do your eyes glow?" / (to each other) "If you look back she gets you!"
Zbyszek: "Shut the door, you're letting the heat out." / "Wipe your boots."
Dobra: "Straw, straw, straw." / "Hands, girl. Use your hands."
Vesna (exploration, rare and short): "Kasza. Don't." / (finding a corpse) "Not long ago." / (low warmth) "Need a fire." / (on the horse, uphill) "Come on, girl."

---

## 6. Staging notes for builders
- Cutscene actors are spawned by the script if not present, and despawned or returned to schedule after.
- All cutscenes are skippable (hold Space). Skipping must land the world in the scene's end state (flags, time, weather, positions).
- Decisive choices pause nothing in the world except the choice timer; the camera holds on faces.
- Time and weather beats: C1 blizzard 14:30, C2 clear 15:40, C3 ~16:30, night 1 aurora (rest to 21:00), dawn fog 7:30 day 2, the rite at 20:00 day 2 rising blizzard, endings at dawn.
