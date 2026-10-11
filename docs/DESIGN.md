# MARZENA: Design Bible

> A compressed open-world monster-hunter game in the spirit of The Witcher 3 and the
> announced direction of The Witcher 4. Not a replica: an original valley, an original
> hunter, an original tale. Built entirely from code in the browser (three.js + WebAudio).

Writing rule for every file, string and line of dialogue in this project: **never use em dashes.**
Use commas, colons, periods or parentheses instead.

---

## 0. North Star

What made Witcher 3 special, and how Marzena captures each in compressed form:

| Witcher 3 strength | What it really is | Marzena's version (our twist) |
|---|---|---|
| Bloody Baron | A monster contract that turns out to be a family tragedy, where every choice costs something and consequences land later | "Something Walks the Ice": a contract that becomes a drowned girl, a mother who looked back, and a village about to drown a second daughter |
| Velen, Skellige vistas | Grand, painterly landscapes with landmarks visible from far away, golden low light, weather rolling in | A frozen mountain lake valley with a drowned bell tower jutting from the ice, a four-faced stone idol on a hill, a frozen waterfall, aurora at night |
| Lived-in villages | NPCs working, gossiping, kids playing, dogs, chickens, ambient barks, crafted clutter | Marzena village: 20+ log houses, fishermen at ice holes, effigy makers, a forge, a steaming bathhouse, sledding kids, goats on roofs |
| Question marks and nooks | Every hill hides a vignette: a corpse with a letter, a cave, a stash | 12+ handcrafted nooks, each a tiny story told through props and one or two notes, many feeding the main mystery |
| Witcher senses | Investigation as play: follow trails, reconstruct events | Hunter senses with a twist: on the ice, senses reveal **echoes**, ghostly reenactments of what happened at that spot |
| Weather and time of day | Storms, fog, sunsets that change the mood of the same place | **Weather is the antagonist.** Winter has not ended for three years. The ending can literally turn the whole world from winter to spring |
| Music (Percival) | Slavic folk: female voice, hurdy-gurdy, fiddle, frame drums, adaptive | A procession song ("Marzanno") that is the main theme, sung by the villagers, hummed by the hero, broken in the boss fight, resolved in the ending |
| Life and humor in the dark | Realism, not quips: the Baron drunk and honest, peasants arguing over a goat | People who talk like people: a tavern keeper defensive about thin beer, a girl unimpressed by a hunter's eyes ("They're just yellow"), an old woman bossing everyone |
| Cinematic dialogue | Shot / reverse shot, characters act, timed choices | A cutscene director with real camera work, letterbox, acted gestures, and choices that branch the ending |
| Personal stakes | Ciri, Yennefer: the contract touches the hero | Vesna was born here and doesn't know it. The tune she has hummed all her life is this village's death song |

**Theme: what we don't look back at.** The Marzanna rite forbids looking back at the drowned
effigy. Communities survive by not looking at what they sacrifice. Hunters survive by never
looking back. A mother walked away from her daughter twice. The final input of the game is a
choice to look back.

Target length: 50 to 80 minutes for the main path with light exploration; 2 hours for a completionist.

---

## 1. The Hunter

**Vesna of the Lynx**, 38. A mutated monster hunter of the Order of the Lynx (one of several
hunter orders; in this world they are simply called *hunters*; frightened villagers call a
female hunter *wiedźma*, witch, which she has stopped correcting).

- Bought as an infant "for a sack of salt in some northern valley" during a famine. She never
  knew where. She has hummed a tune all her life without knowing its origin.
- Amber cat eyes (mutation), ash-blond braid with a grey streak, a pale scar from left cheekbone to jaw.
- Charcoal-blue wool greatcoat to the knee with a sheepskin collar, leather harness,
  two swords crossed on the back (steel and silver), fur-lined hood usually down, wrapped boots,
  a lynx medallion **with a small red-thread knot tied to its chain** (she doesn't know why;
  it was on her when she was bought).
- Voice: a working professional. Practical, observant, quiet. She asks what she needs to know,
  haggles, says plain kind things sometimes, and often says nothing. She is not a wit and not a
  philosopher, and she never comments on the meaning of what she sees. Under pressure she gets
  quieter. See the "Writing voice" rules at the top of docs/STORY.md; they bind every line.

Sample lines (tone reference, not final script):
- (at the tavern) "Is there anything hot?"
- (to the reeve) "Who wrote the contract?"
- (to Ola, who says mutants eat snow) "Does she."
- (examining a frozen body) "Two days. Maybe three."
- (to Kasza, who balks at the ice) "All right. All right, we'll go round."

Her horse: **Kasza** (Polish: groats, porridge). A shaggy dun mare who hates ice.

---

## 2. The World

### 2.1 Region
A remote valley in the northern mountains. One road in, over the **Hollow Pass**. In the middle
lies **Bellmere** (locals: *Dzwonne*), a mountain lake frozen solid for three years. On its
southern shore, the village of **Marzena**, named after the goddess of winter and death.

Sixty years ago the lake rose (a landslide dammed the outflow) and drowned **Old Marzena**. Its
church bell tower still juts from the ice. Locals say the bell rings under the ice on the night
of the spring equinox.

### 2.2 Coordinates
Units are meters. +X is east, -Z is north, +Y is up. The playable area is X,Z in [-640, 640].
Mountains extend to about 4 km for the horizon. The low winter sun arcs across the **south**
sky, so views looking south are backlit and golden. All canonical positions live in
`src/world/layout.js`; this table is the design intent.

| Location | Center (x, z) | Notes |
|---|---|---|
| Bellmere (lake) | (40, -120), radii 270 x 170, irregular shore | Ice surface at y = 0 |
| Marzena village | (0, 115), radius ~95 | On the south shore, plateau y = 2 to 6 |
| Village square and well | (0, 118) | Notice board, market stalls |
| Reeve's longhouse | (5, 92) | Biggest building, carved gables, faces the square |
| Tavern "The Drowned Bell" | (-30, 120) | West side of square |
| Smithy | (32, 128) | Forge glow, anvil, quench barrel |
| Shrine (chram) | (-5, 165) | Ring of carved posts, offering fire |
| Dobra's hut + effigy workshop | (-72, 150) | Straw piles, half-made effigies hung from beams |
| Hanka's house | (78, 70) | Apart, on the shore, east. Bowls of milk left on the ice |
| Banya (bathhouse) | (-48, 72) | Steam, near shore |
| Fishing huts on stilts | shore, x -95 to 65, z 48 to 62 | Boats frozen in the ice, net racks, fish drying |
| Ice-fishing camp | (-70, 5) on the ice | Holes, stools, a windbreak, a small fire |
| Ritual site | (10, -30) on the ice | Ring of birch poles with red ribbons, a cut hole |
| Drowned bell tower | (120, -150) in the ice | Climbable stairs inside, Wiesia's lair in the belfry |
| Stone circle island | (-120, -190), r 28 | Place of power, ancient carvings of the first rite |
| West marsh | (-260, -80) | Reeds through ice, will-o-wisps at night |
| Hot spring + ruined bathhouse | (-90, -340) | North shore. Steam, green moss in winter, carved initials |
| Bear den cave | (150, -360) | North cliffs |
| Hunter's cabin (abandoned) | (-400, -200) | NW forest, trapper's diary |
| Charcoal burners' camp | (-330, 20) | West forest, cold kilns, madness on the walls |
| Crossroads + hanged man's tree | (-230, 230) | Grain thief, sister's note |
| Watchtower ruin (vista) | (-360, 340), on a ridge ~60 m | **The reveal** of the whole valley |
| Prologue start (the pass) | (-560, 520), ~110 m | Blizzard, frozen cart |
| Idol hill | (200, 230), peak ~50 m | Four-faced stone idol, 10 m tall, visible from everywhere |
| Graveyard | (95, 165) | Carved wooden grave posts, Wiesia's empty grave |
| Sledding hill | (-40, 205) | Kids |
| Mill | (360, -40) | Frozen waterwheel, miller's family |
| Frozen waterfall + ice cave | (440, -80) | 25 m frozen fall, cave of blue crystal behind |
| River | from east mountains into the lake at (310, -80) | Frozen |

Roads (dirt under packed snow, wheel ruts):
- **Pass road:** prologue start, down past the watchtower, to the crossroads, to the village west gate (-85, 128), to the square.
- **Forest track:** crossroads north to the charcoal camp and the hunter's cabin.
- **Mill road:** square east, along the shore, to the mill.
- **Idol path:** village east edge, past the graveyard, up to the idol.

### 2.3 Landmarks and sightlines
Grandeur comes from scale cues and things you can see from far away:
1. **The idol** on its hill: a dark vertical silhouette against the sky, visible from the whole lake.
2. **The bell tower** in the ice: a lonely spire in a white plain, the most iconic image in the game.
3. **The frozen waterfall:** a pale blue scar in the eastern cliffs.
4. **Smoke columns** from village chimneys: vertical lines that say "people live here".
5. **The mountains:** a ring of snow peaks, 600 to 1200 m, layered by atmospheric perspective into 3 to 4 value bands.

Every major location should be visible from at least two others. Vista points where the
camera can sit and breathe: watchtower, idol hill, bell tower belfry, waterfall top, island.

### 2.4 Density
"Vista but dense" means: walk 30 meters anywhere near people and something is happening or
someone made something. Walk 80 meters in the wild and find a small story.
- **Village:** clutter on every porch (firewood, buckets, sleds, skis, snow shovels, hanging
  fish, lanterns, carved shutters, laundry frozen stiff on lines), paths trampled through snow
  between doors, fences, pens, goats, chickens, dogs, a cat on a roof.
- **Wilderness:** fallen logs, boulders with snow caps, animal tracks, birch groves among pines,
  frozen streams, wayside shrines, abandoned sledges, ravens on dead trees.
- **Odd trees (folk-fantasy, rare):** the valley's wood has a little strangeness in it, always made of
  wood, snow and ice and always a landmark you can read from 50 m away. Common variety: golden larch
  groves on the cold slopes, red-berried rowan on forest edges, veteran broken-top spruce, dwarf mountain
  pine creeping over the treeline. Rare, a handful each: corkscrew pines wrung like cloth, a hollow oak
  split by lightning with a doorway and a red ribbon at its mouth (votive strips on its lintel), a weeping
  birch whose whips make a dome you walk into, bottle trees with a fountain of red-ochre whips, knot trees
  whose branches curl into the story's red-knot rings, a tree glazed in clear ice, and a gate tree (two
  trunks crossed overhead, the forest track runs through it). Heroes stand at memorable spots: a corkscrew
  grove on the marsh edge, the oak on the rise south of the crossroads, the weeping birch by the hot
  spring, the ice tree on the south-east lake shore. They never sit on roads, buildings or set pieces.

---

## 3. Story

### 3.1 Backstory (the truth, revealed in layers)
- **The rite.** Every spring equinox, Marzena drowns **Marzanna**: a straw effigy dressed in white,
  made by old **Dobra**, carried across the ice by a girl of the village in procession, set alight,
  and pushed through a hole in the ice. The procession walks back singing and **nobody looks
  back**, or death follows you home. (The island's carvings show the oldest truth: the
  ancestors once drowned real girls. The straw effigy was a mercy invented to end that.)
- **Three years ago,** 14-year-old **Wiesia** (Wiesława) carried the effigy. The ice at the
  site was thin (a warm spring runs under that part of the lake). She went through with it.
  The procession, singing, did not look back. Nobody heard her over the song.
  **One person did look back:** her mother **Hanka**. She saw Wiesia's hands on the ice edge.
  She froze, the rule, the song, the people around her, and she turned forward again and kept
  walking. By the time she broke and ran back, the hole had closed with slush.
- **Since then winter has not ended.** Wiesia's drowned spirit became a *marzanna*, a winter
  spirit. She is not vengeful. She is a terrified child. As long as the lake is frozen she
  stays near the surface, near her mother. If spring comes and the ice melts, she will sink
  down to drowned Old Marzena and the dead, forever. So she holds the winter. She does not
  know she is starving the village.
- Every year since, the village drowned a new effigy hoping to end the winter. The effigies came
  to her. She animates them: they are the only "girls" who ever come. She keeps them in the
  belfry of the bell tower like a family. At night they walk the ice. When fishermen came near,
  she grabbed them to make them look at her. They drowned. Three are frozen under the ice
  below the tower, faces up.
- **This year,** starving, the reeve **Bogdan** and the elders decided the goddess wants a real
  maiden, as in the oldest times. They chose **Ola**, 11, Wiesia's younger sister ("the goddess
  took one from that house; she wants the pair"). The rite is tomorrow night.
- **Hanka** secretly posted a contract on the notice board with her last savings, signed only
  "H.": *Something walks the ice at night. Kill it before the equinox.*
- **Vesna's secret.** Thirty-eight years ago, in the Hunger Winter, a Lynx hunter killed the
  wolves eating the village's dead. There was nothing to pay with. **Dobra** gave him her
  infant daughter and walked away without looking back. She tied her signature knot of red
  thread to the baby's blanket, the same knot she ties on every effigy. That baby is Vesna.
  The tune Vesna hums is the Marzanna song, which in Marzena mothers also sing as a lullaby.

### 3.2 Cast
| Character | Role | Look | Voice |
|---|---|---|---|
| **Vesna** | Hunter, protagonist | see section 1 | see section 1 |
| **Ola** (11) | Chosen maiden, Wiesia's sister | Too-big sheepskin coat, red knitted cap, two short braids, missing tooth | Direct, curious, talks like an eleven-year-old, deflects fear by being busy or rude; pretends she doesn't care |
| **Hanka** (40) | Wiesia's and Ola's mother, posted the contract | Thin, grey headscarf, dark shawl, red-raw hands | Few words, flat affect, sudden cracks |
| **Bogdan Kral** (50) | The reeve | Big, bearded, bear-fur mantle, a ledger always | Plain and tired; talks about sacks, wood and numbers, not ideas. Not a villain: his son died of fever last winter, and he gave his own grain ration away |
| **Dobra** (62) | Effigy maker, Vesna's mother | Small, stooped, sharp eyes, straw in her hair, red thread on her wrist | Earthy, bossy, warm; talks about the work in front of her; her hands never stop working |
| **Zbyszek** (45) | Tavern keeper of The Drowned Bell | Round, apron, bald with a fringe | Gossip, complains, cowardly-kind; funny because he is defensive, not because he jokes |
| **Jarek** (19) | Young fisherman who loved Wiesia | Lanky, thin beard, fisherman's oilskin | Broken, drunk, tender |
| **Wiesia** (14, dead) | The marzanna | Under-ice pale, long dark hair floating as if underwater, white ritual dress with red embroidery, a crown of frozen straw | Speaks rarely, like the frightened fourteen-year-old she is. Text in italics |
| **Miller Gniewko + wife Bożena + 2 kids** | Mill family | Flour-dusted, practical | Side quest |
| Villagers | 25 to 30 ambient | Sheepskins, wool, linen with red embroidery, headscarves, fur hats | Barks |

### 3.3 Main quest (journal titles in quotes)

**Prologue: "The Hollow Pass"** (about 5 min)
1. *Cutscene C1, Blizzard Road.* White-out on the pass. Vesna rides Kasza head-down into the
   wind. Kasza balks. A shape in the snow: an overturned cart, a dead mule, a family of three
   frozen. The father's body is twisted, **looking back over his shoulder**. Vesna dismounts,
   closes his eyes. Wolves howl. Gameplay begins.
2. Examine the cart with senses (tutorial): a letter. *"Hollow Pass is the only way out. The
   snow here doesn't melt, even in what should be summer. We have to try."*
3. Wolves (3) attack: combat tutorial (light, heavy, dodge, Ember sign).
4. Ride down to the watchtower ruin in the blizzard. The snow is too thick to go on: at the
   hearth in the ruin's lee she shelters for the night (a short scene by the fire, then black).
5. *Cutscene C2, The Valley.* Morning: the storm has blown itself out. Fresh snow, a cold low
   sun. She rides out to the crest and the camera rises past Vesna and Kasza and sweeps over
   the valley: the frozen lake, the bell tower in the ice, the village smoke, the idol on the
   hill, the frozen waterfall. The main theme swells (voice and hurdy-gurdy). Title card: **MARZENA**.

**Act I: "Something Walks the Ice"** (about 15 min)
6. Ride to the village (west gate). Ambient life. At the effigy workshop, children sing the
   Marzanna song while stuffing a small straw doll. *Cutscene C3, The Song (short, in-engine):*
   Vesna stops. She knows this tune. A camera push-in on her face; the music box motif plays
   once. Ola: "Are you a witch? Mama says mutants eat snow." (the joke exchange).
7. Notice board in the square: the contract signed "H.". Vesna takes it.
8. **The Drowned Bell** tavern, Zbyszek: three fishermen gone this month, walking straw on the
   ice, three years of winter, bread at three grosze, the rite tomorrow, "the reeve chose the
   maiden" (won't say who). Only Hanka "writes a hand that fair."
9. **The reeve's longhouse**, Bogdan: doesn't want her. "The goddess will have her due tomorrow,
   and it will be settled." Offers 100 grosze to leave. Choice: take the money (sets flag
   `took_reeve_money`, you can still continue) or refuse. He forbids her the ice.
10. **Hanka's house.** Cold hearth. She admits posting the contract. The chosen maiden is Ola.
    "Kill it before tomorrow night. Please. Then they'll have no reason." Gives her savings:
    a purse with 61 grosze and a wedding ring. Objective: investigate the ice at night.
    (Vesna can rest by a fire / bed to pass time to night.)

**Act II: "Straw and Ice"** (about 20 to 25 min)
11. **Night on the ice** (aurora, cold). The ice-fishing camp: senses show drag marks, straw, a
    fisherman's mitten. Follow the trail toward the bell tower. First **marzanny** (animated
    effigies of straw and ice) rise. Fire (Ember) burns them. They collapse into wet straw
    and each leaves a red knot.
12. **The ritual site.** Senses reveal an **Echo**. *Cutscene C4, The Echo:* ghostly blue
    figures reenact the rite three years ago. Wiesia carrying the effigy. The crack. The fall.
    The procession singing, walking away. One figure turns: Hanka. Sees the hands. Turns
    forward again. Keeps walking. The hands slip under. Silence. Vesna, very quietly: "She looked."
13. **"The Bell Under the Ice."** The drowned bell tower. Climb the inner stairs (exploration,
    vertical, creaking). Belfry: *Cutscene C5, The Lair:* a frost-made room. A table set with
    frozen bread. Seventeen effigies seated around it like a family. A music box (the motif). A
    ribbon. Under the ice below, three fishermen frozen, faces up. Wiesia's voice, near: *"Did
    Mama send you?"* She flees as a pale shape beneath the ice. Vesna understands: not a hunter. A child keeping house.
14. **Dobra** (next morning, fog on the lake). The lore of the rite and the island's carvings
    (optional visit). She notices the red knot on Vesna's medallion and goes quiet. She asks
    Vesna to hum. Vesna doesn't. (Seed only; reveal in the epilogue.)
15. **"What Hanka Saw."** Confront Hanka. She breaks. Decisive choice:
    - **Comfort:** "Ola needs you to look now. Not at the ice. At her." (`hanka_comforted`)
    - **Blame:** "You watched her die and kept singing." (`hanka_blamed`)
    Either way Hanka agrees to come onto the ice at the rite.
16. **The reeve (optional confront).** The ledger in his cellar (side quest "The Reeve's
    Ledger") shows he gave his own grain away and his son is in the graveyard. Choice: expose the
    truth of Wiesia's death to him (`reeve_told`), which makes him hesitate during the rite.

**Act III: "The Drowning of Marzanna"** (about 15 min)
17. *Cutscene C6, The Procession* (equinox night, rising blizzard). Torches, women in white,
    the song. The effigy on a pole and Ola beside it in a white dress, hands tied with red
    ribbon. Vesna walks in from the shore. Depending on flags: if `reeve_told`, Bogdan stops the
    procession himself; otherwise Vesna cuts Ola's ribbon and the crowd falls back.
18. The ice groans. The bell rings **under the ice**. Effigies burst up. *Cutscene C7,
    Emergence:* the marzanna rises, 4 m tall, white cloth and ice, hair floating, crown of
    frozen straw. **Boss fight** on cracking ice in a blizzard (see 4.6).
19. At 25% health she shatters into a 14-year-old girl kneeling on the ice, crying. Decisive choice:
    - **Strike** (ending A, "The Thaw")
    - **"Hanka. Look at her."** (ending B, "Looking Back"); always available because Hanka is on the ice
    - **Step back and let the village finish its rite** (ending C, "Nothing Changes"); only if
      `took_reeve_money`; Vesna says "Not my contract."

### 3.4 Endings (all cinematic)
- **A. The Thaw.** Silver through the frost. Wiesia gasps, almost relieved, and comes apart into
  snow. The ice explodes outward in a ring; the bell tower cracks and slowly sinks. Dawn
  time-lapse: the world thaws (snow coverage animates to zero, grass grows, lake becomes water,
  birds return, the music resolves into the major-key theme). The village cheers, then
  doesn't look at Vesna. Hanka kneels at the shore, alone. Ola is alive.
- **B. Looking Back.** Hanka walks onto the ice alone and **turns to face** her daughter, the
  thing she didn't do. She speaks (short, plain, devastating). Wiesia lets go and sinks gently,
  lit from below. Spring comes slowly with a soft dawn. If `hanka_comforted`: Hanka walks back
  to Ola and they hold each other. If `hanka_blamed`: Hanka steps into the water after Wiesia,
  and Ola watches from the shore, held by Vesna. (W3-style delayed consequence.)
- **C. Nothing Changes.** Vesna steps back. The village drowns Ola. They walk away singing,
  not looking back. The winter does not break; Wiesia did not want another girl, she wanted
  her mother. Snow keeps falling. Final shot: children stuffing next year's effigy.

**Epilogue, "Dobra's Knot"** (all endings). Morning. Vesna saddles Kasza. Dobra brings a tiny
straw doll tied with her red knot. "Thirty-eight winters ago I gave a baby to a hunter for
wolves. I tied this knot on her blanket. You have it on your chain." Dialogue choice:
acknowledge her ("You should have looked back.") / ("I know. I've always known the song.") /
silence. Vesna rides out down the road. A prompt appears: **[Hold E] Look back.** If held, the
camera turns: Dobra on the hill, holding up the little doll; Ola waving (if alive). If not, the
road and the snow. Credits over the full song.

### 3.5 Side content
- **"A Bird for Wiesia"** (Jarek at the shore / tavern, drunk). He carved a wooden bird for
  Wiesia and never gave it. Bring it to the belfry. Payoff: in endings A and B, Wiesia holds the bird.
- **"The Reeve's Ledger"** (cellar under the longhouse). Reveals Bogdan rationed himself to nothing; his son's name crossed out.
- **"Lights in the Reeds"** (west marsh, night). Will-o-wisps lead to a drowned smuggler with a
  key to a stash in the charcoal camp.
- **"Wolves at the Mill"** (contract on the board). Wolf den near the frozen waterfall; the
  miller's kids can't fetch water. Reward and gratitude; the miller shares that warm water rises
  near the ritual site ("my father never let us fish there").
- **"Snow Fight"** (Ola, act II morning). A short snowball fight. Pure warmth before the dark.

### 3.6 Nooks (environmental stories)
Each nook = a composed little scene + 0 to 2 readable notes + sometimes loot. Ordered roughly by discovery:
1. **Frozen cart** (pass): family who tried to leave. Letter.
2. **Watchtower ruin:** a soldier's tally marks on the wall, a stash under a loose stone, the vista.
3. **Hanged man's tree** (crossroads): a grain thief. His sister's note pinned to the trunk.
4. **Charcoal camp:** cold kilns, a burner who scratched "THE LAKE SINGS" over every board.
5. **Hunter's cabin:** a trapper's diary about wolves coming down from the pass "as if pushed".
6. **Hot spring:** steam, moss, a ruined bathhouse; initials "J + W" carved in a beam.
7. **Bear den:** a sleeping bear (do not wake it); an old Lynx hunter's silver sword in the bones.
8. **Island stone circle:** carvings of the first, real drownings. Place of power (Ember empowered).
9. **Mill and ice cave:** blue crystal cave behind the frozen waterfall, a stash.
10. **Marsh:** will-o-wisps, a drowned shrine, the smuggler.
11. **Idol hill:** offerings at the idol's feet, the best sunset view; you can sit.
12. **Graveyard:** Wiesia's empty grave with flowers made of red thread; the reeve's son's grave post.
13. **Village nooks:** the kids' fort under the boardwalk with charcoal drawings of "the ice
    lady"; the tavern's watered beer barrel; a drunk asleep in the snow; a goat on a roof; the
    banya (rest here to pass time); Dobra's loft of effigy heads.

### 3.7 Notes and letters
Short, specific, human, in period voice, no em dashes. Each reveals a fact. Examples:
- Family letter (pass). Hanged man's sister ("He stole for my children. Hang me next to him if you like.").
- Burner's scrawl. Trapper's diary. Island carvings (described). The reeve's ledger.
- Hanka's contract text. A child's drawing of the ice lady with the caption "she is lonly".

### 3.8 Ambient barks (examples)
- "Don't look at her eyes."  "Bread's three grosze. Three!"  "My grandmother saw a spring once."
- "The lake sang again last night."  "Is that a witch?" "Hush, she'll hear you." "She heard."
- Kids: "You're Marzanna! No, you are!"  Fishermen: "Not past the poles. Never past the poles."

---

## 4. Gameplay

### 4.1 Controls (keyboard and mouse)
| Input | Action |
|---|---|
| WASD | Move (camera relative) |
| Mouse | Camera (pointer lock) |
| Shift (hold) | Sprint (stamina). On horse: gallop |
| Space | Dodge (short sidestep in the move direction). Double-tap: roll |
| LMB | Light attack (sword drawn) |
| RMB | Heavy attack (sword drawn); **hunter senses** (hold, sword sheathed) |
| R | Draw / sheathe sword |
| Q | Cast selected sign |
| 1 / 2 / 3 | Select sign: Ember / Gale / Ward |
| Middle mouse or T | Lock on target |
| F | Parry (hold for block, tap at hit for parry) |
| E | Interact (talk, examine, read, pick up, sit, rest) |
| X | Call horse / mount / dismount |
| H | Drink "Thaw" draught (heal + warmth) |
| J / M / Esc | Journal / map / pause |

### 4.2 Movement and camera
Third-person, over-the-right-shoulder, W3 framing (character left of center, horizon around
upper third). Smooth acceleration, turn-in-place, footstep crunch on snow, deeper snow slows
you slightly, ice is slippery (more inertia). Camera collision against terrain and buildings.
Lock-on frames both you and the target. On horseback the camera pulls back and lowers FOV
change for speed.

### 4.3 Horse (Kasza)
Walk, trot, gallop (stamina), road-follow assist (on a road, holding forward follows it
gently). Call with X: she trots to you from off-screen. Refuses to step on lake ice (stops and
snorts), a character beat and a gameplay boundary.

### 4.4 Hunter senses
Hold RMB with sword sheathed. World desaturates to cold grey, with a slow radial pulse. Clues
glow orange-red, trails appear as glowing footprints and drag lines, scent as drifting red
motes. Examining a clue gives a Vesna line and updates the journal. **Echo spots** (blue glow)
play a ghostly reconstruction cutscene of past events at that place.

### 4.5 Combat
- Light attack combo (3 hits), heavy attack (slow, staggers), dodge with brief invulnerability,
  parry window, lock-on strafing.
- Hit-stop (60 ms), camera shake, sparks or straw/ice particles, sword trail, stagger reactions.
- Signs (cost a sign-energy bar that recharges):
  - **Ember** (fire cone): burns effigies (very effective), scares wolves.
  - **Gale** (force wave): knocks back, breaks the boss's ice armor.
  - **Ward** (shield bubble): absorbs one hit.
- **Warmth** meter (twist on the setting): drains slowly outdoors at night and in blizzards;
  low warmth slows stamina regen and blurs the screen edges with frost. Restore by fires,
  being indoors, the banya, or the Thaw draught.
- No damage numbers. Health shown as a thin line.

### 4.6 Enemies
- **Wolves** (prologue, forest, mill den): packs of 3 to 4, circle, feint, lunge, flee at low health.
- **Marzanny** (animated effigies, night on the ice): straw bodies with ice crust and a white
  rag dress, a pale wooden face. Lurching walk, heavy overhead swing, grab. Ember sets them
  alight; they burn and collapse.
- **The Marzanna (boss, Wiesia):** 4 m, floating, white cloth and ice, hair floating as if
  underwater, crown of frozen straw. Phase 1: ice armor (Gale breaks it), sweeping claw, ice
  spikes erupting in lines from the ice. Phase 2 (66%): summons 3 effigies, blizzard gusts push
  you, cracks spread across the arena. Phase 3 (33%): she dives under the ice and grabs at
  you from below (telegraphed by a pale glow under your feet), surfaces to scream (stun cone,
  Ward blocks it). At 25%: the choice.

### 4.7 Interaction, economy, progression
- Currency: grosze. Coins come from contracts, stashes. Spend at Zbyszek (Thaw draughts) and the smith.
- Items: Thaw draught (max 3), quest items, notes.
- Progression is light: the island's place of power empowers Ember; the bear den sword deals more damage.
- Resting (bed, banya, campfire) passes time to: evening, night, morning.

### 4.8 Time and weather
- Clock: 1 in-game hour = 60 real seconds while free-roaming. Story sets time at beats.
- Weather states: `clear`, `overcast`, `snow`, `blizzard`, `fog`. Smooth transitions over
  30 to 90 seconds. Wind affects snow particles, trees, grass, cloth, and the wind sound.
- Story schedule: pass = blizzard (day 0), through the night at the watchtower. Valley arrival =
  clear, early morning of day 1. Night 1 = clear
  with aurora. Morning 2 = lake fog. Afternoon 2 = overcast, light snow. Equinox night = blizzard.
  Ending dawn = clear (A, B: spring) or snow (C).

---

## 5. Art Direction: "Frost and Ember"

The cold world is blue and white. The human world is amber. The dead are pale turquoise.
Spring, when it comes, is a shock of green and gold.

### 5.1 Palette
| Use | Color |
|---|---|
| Lit snow (day) | #F3F1EC, warm toward sunset #FFD8B0 |
| Snow in shadow | #8FA6C4 (cyan-blue, never grey) |
| Ice | #A9C6D6 with deep #3D6A80 in cracks |
| Weathered wood | #6B5A4A, dark logs #3B2E25 |
| Folk red (embroidery, ribbons, carved paint) | #9A2E22 |
| Painted shutters | #3E5A78 |
| Window and fire light | #FFB060 |
| Night sky | #141A33; aurora #5CFFB0 to #9E7BFF |
| Wiesia / echoes | #9FF5FF |
| Spring | grass #6FA84A, birch leaf #9CC85A, sun #FFE2A0 |

### 5.2 Light and atmosphere
- Low winter sun: long shadows, warm key, cool sky fill. Golden hour is the hero time.
- **Aerial perspective is everything:** height fog plus distance fog that brightens and warms
  toward the sun direction. Mountains read in 3 to 4 value bands.
- Smoke, steam, blowing snow, sun shafts through pines, the glow of windows at dusk.
- Night is never black: moonlight and snow reflectance, aurora green on the snow.
- Post: bloom (gentle), color grade per time of day and weather, vignette, very subtle grain.

### 5.3 Shapes and materials
- Architecture: Slavic and Nordic log construction: notched log corners, steep shingle roofs
  heavy with snow, carved gable boards and crossed-horse-head roof finials, painted shutters,
  raised granaries on posts, stilted fishing huts, wooden boardwalks. Every building slightly
  irregular (no perfect boxes): sagging ridges, leaning posts, uneven logs.
- Snow accumulates on every upward surface (roofs, branches, rocks, fences, barrels) through a
  shared shader, so the thaw ending can melt it all at once.
- Characters: readable silhouettes, layered clothing (coats, shawls, aprons, fur collars,
  hoods), folk red embroidery accents, no plastic look.

### 5.4 Composition rules for builders
- Every view has foreground, midground, background.
- Vertical accents (smoke, idol, tower, pines) break horizontals.
- Warm against cold: put a lit window or fire in cold scenes.
- Avoid uniform distributions: cluster, then leave negative space.

---

## 6. Music and Sound

All synthesized with WebAudio. Instruments: hurdy-gurdy (drone + melody + buzz), fiddle
(bowed, vibrato), female "white voice" (formant synthesis, open-throat Slavic style with
slides), low male drone, frame drum and big drum, wooden flute, plucked zither (Karplus-Strong),
music box (Wiesia's motif). Convolution reverb from generated impulses.

### 6.1 The Marzanno song (main theme), D Dorian, 3/4
```
A:  A4 A4 G4 | F4 E4 D4 | F4 G4 A4 | E4 -  -  |
A': A4 A4 C5 | B4 A4 G4 | F4 E4 F4 | D4 -  -  |
B:  D5 -  C5 | A4 -  G4 | A4 C5 D5 | A4 -  -  |
B': G4 A4 F4 | E4 D4 C4 | D4 E4 F4 | E4 -  D4 (with "the fall": a sung slide F4 down to D4)
```
Lyrics (shown as subtitles when the procession sings):
> Marzanno, Marzanno, white bride of the frost,
> we carry you, we carry you, to the water deep.
> Do not follow, do not follow, we will not look back.
> Go down, go down, and let the green come back.

**Motif** (music box, Wiesia): A4 A4 G4 F4, then the fall to D4.

### 6.2 Adaptive moods
| Mood | Where | Character |
|---|---|---|
| `pass` | prologue | wind, low drone, sparse voice |
| `reveal` | valley cinematic | full theme: voice + gurdy + drums swell |
| `wild` | wilderness day | flute phrases, drone, long silences |
| `village` | village day | zither + fiddle, a subdued dance, hungry not merry |
| `night` | night outdoors | white voice far away, music box fragments, low drone |
| `tense` | investigations | pulses, bowed scrapes |
| `combat` | fights | frame drums in 7/8, gurdy riffs, D Phrygian |
| `boss` | finale | combat + choir + the theme distorted |
| `procession` | the rite | the villagers' song (choir) with drum on beat 1 |
| `thaw` | endings A, B | the theme in D major, full ensemble, birdsong |
| `sorrow` | ending C, sad beats | solo voice, theme slowed |
| `lullaby` | Vesna's hum, Dobra | solo voice, theme very slow |

Crossfades over 2 to 4 seconds at bar lines where possible.

### 6.3 Sound effects and ambience
Wind (by weather), snow footsteps (crunch), ice footsteps (hollow click, occasional deep crack
groan from the lake), wood creaks, fire crackle, forge hammer, village murmur, dogs, crows,
ravens, horse hooves and snorts, sword whooshes and impacts, sign casts, effigy burning, bell
under ice (muffled, low-passed), the boss scream.

---

## 7. UI

Restrained, period-flavored. Fonts: Cormorant Garamond (titles, speakers), Alegreya or EB Garamond (body), Georgia fallback.
- **HUD:** top-left thin health / stamina / warmth lines and a sign icon; top-center compass
  strip with objective and discovered-location markers; bottom-center subtitles (speaker name in
  folk red small caps); interaction prompt; top-right notifications ("Journal updated").
- **Dialogue:** letterbox bars, subtitles, choice list bottom-right; decisive choices marked
  with a red knot icon; optional timer bar on decisive choices in cutscenes.
- **Journal:** parchment page, Vesna's terse notes per quest; notes and letters readable.
- **Map:** painted parchment generated from the heightmap, with discovered locations, roads, markers.
- **Title screen:** the 3D valley at dusk behind, slow camera drift; "MARZENA" in a wide serif
  with a red thread underline; New Game / Continue / Settings.

---

## 8. Quality bar (the Gauntlet)

Builders build; the lead reviews every result directly (screenshots, frame sequences, scripts)
against The Witcher 3 at comparable framing and against the best browser WebGL games. Honest target: a browser game made
from code will not beat a AAA engine on raw fidelity; it must win on composition, light,
atmosphere, density, story and coherence, and have zero glaring artifacts (floating objects,
z-fighting, clipping, popping, black frames, broken animations).

Review rubric per area (1 to 10): composition, light and atmosphere, palette cohesion,
density, scale and grandeur, material readability, silhouettes, animation, technical
cleanliness, and "would a player screenshot this and share it".
