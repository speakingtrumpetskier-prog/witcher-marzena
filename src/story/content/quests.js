// Quest definitions (source: docs/STORY.md section 2). Journal lines are Vesna's notebook,
// verbatim from the script; lines marked "draft" were written to fill gaps and are the
// writers' to replace.
//
// Quest: { title, kind: 'main' | 'side', next: questId started on completion, stages: [...] }
// Stage fields (all optional except id):
//   objective  HUD / compass text (string or (S) => string)
//   marker     LOC id | [x, z] | (S, G) => either | null
//   journal    logged when the stage begins          log  logged when the stage is completed
//   objectives parallel sub-objectives [{ id, text, marker, done(S, G), log }]; the stage
//              completes when all are done (or when its own `done` is true)
//   done(S, G) completes the stage automatically when true (checked on flag, time, inventory)
//   reach      LOC id | { x, z, r }: completes the stage when the player gets there
//   next       stage id to go to (default: the next in the list; after the last, the quest completes)
//   sets       flags that are true once this stage is done (G.story.debugStart uses them)
//   give       inventory implied once this stage is done, e.g. { coins: 61, ring: 1 }
//   debug      { day, time, weather, at: [x, z, yaw] } where ?start=quest:stage puts the player
//   enter(S, G) / exit(S, G) hooks
import { SPAWN } from '../../world/layout.js';

export const MAIN_ORDER = ['main_pass', 'main_ice', 'main_straw', 'main_bell', 'main_hanka', 'main_rite'];

const QUESTS = {
  // Q1
  main_pass: {
    title: 'The Hollow Pass', kind: 'main', next: 'main_ice',
    stages: [
      {
        id: 'pass', objective: 'Get through the pass', marker: 'passStart',
        journal: 'Hollow Pass. Snowing hard. Lost the road twice.',
        done: (S) => !!S.flag('pass_arrived'), sets: ['pass_arrived'],
        debug: { day: 1, time: 14.5, weather: 'blizzard', at: [SPAWN.prologue.x, SPAWN.prologue.z, SPAWN.prologue.yaw] },
      },
      {
        id: 'wreck', objective: 'Examine the wreck', marker: [-556, 514],
        log: 'Cart on the pass road. A man, a woman, a small girl, all frozen. Letter on the man, to his brother.',
        done: (S) => !!S.flag('letter_read'), sets: ['cart_examined', 'letter_read'],
        debug: { day: 1, time: 14.7, weather: 'blizzard', at: [-551, 511, 2.4] },
      },
      {
        id: 'wolves', objective: 'Survive the wolves',
        log: 'Three wolves on the road. Starving, all ribs.',
        done: (S) => !!S.flag('wolves_prologue_done'), sets: ['wolves_prologue_done'],
        debug: { day: 1, time: 14.9, weather: 'blizzard', at: [-548, 506, 2.4] },
      },
      {
        id: 'watchtower', objective: 'Ride on to the watchtower', marker: 'watchtower',
        done: (S) => !!S.flag('prologue_done'), sets: ['prologue_done'],
        debug: { day: 1, time: 15.4, weather: 'snow', at: [-400, 372, 2.3] },
      },
    ],
  },

  // Q2
  main_ice: {
    title: 'Something Walks the Ice', kind: 'main', next: 'main_straw',
    stages: [
      {
        id: 'ride', objective: 'Ride into Marzena', marker: 'westGate',
        done: (S) => !!S.flag('song_heard'), sets: ['song_heard', 'met_ola'],
        debug: { day: 1, time: 16.2, weather: 'clear', at: [-120, 146, 2.1] },
      },
      {
        id: 'board', objective: 'Read the notice board', marker: [9, 113],
        log: 'Contract on the board in the square: something walks the ice at night. Three fishermen missing. Signed only "H."',
        done: (S) => !!S.flag('contract_taken'), sets: ['contract_taken'],
        debug: { day: 1, time: 16.6, weather: 'clear', at: [SPAWN.square.x, SPAWN.square.z, SPAWN.square.yaw] },
      },
      {
        id: 'ask', objective: 'Ask around the village',
        objectives: [
          {
            id: 'tavern', text: 'Ask at the Drowned Bell', marker: 'tavern', done: (S) => !!S.flag('met_zbyszek'),
            log: "Zbyszek at the tavern: the missing men are Stach, Bolek and the younger Wrona. Their rite is tomorrow night. Says the hand on the contract is Hanka's.",
          },
          {
            id: 'reeve', text: 'See the reeve', marker: 'longhouse', done: (S) => !!S.flag('met_bogdan'),
            log: (S) => (S.flag('took_reeve_money')
              ? 'The reeve, Bogdan Kral, paid me 100 grosze to leave. Took it. He wants me off the lake.'
              : "The reeve, Bogdan Kral, offered 100 grosze to leave. Didn't take it. He wants me off the lake."),
          },
        ],
        sets: ['met_zbyszek', 'knows_fair_hand', 'met_bogdan', 'refused_reeve_money'],
        debug: { day: 1, time: 17, weather: 'clear', at: [-8, 112, 3.14] },
      },
      {
        id: 'hanka', objective: 'Find Hanka', marker: 'hanka',
        log: 'Hanka posted it. They have picked her daughter Ola for the rite. Paid 61 grosze and her wedding ring. Wants it done before tomorrow night.',
        done: (S) => !!S.flag('hanka_hired'), sets: ['met_hanka', 'hanka_hired'], give: { coins: 61, ring: 1 },
        debug: { day: 1, time: 17.6, weather: 'clear', at: [70, 76, 1.9] },
      },
    ],
  },

  // Q3
  main_straw: {
    title: 'Straw and Ice', kind: 'main', next: 'main_bell',
    stages: [
      {
        id: 'night', objective: 'Wait for nightfall', marker: null,
        journal: 'They say it comes out at night. Wait for dark.',
        done: (S) => !!S.flag('night1'), sets: ['night1'],
        debug: { day: 1, time: 18.2, weather: 'clear', at: [70, 76, 1.9] },
      },
      {
        id: 'camp', objective: 'Search the ice-fishing camp', marker: 'iceCamp',
        log: 'Ice camp: the stools are gone. Drag marks going north, loose straw, one mitten.',
        done: (S) => !!S.flag('trail_found'), sets: ['trail_found'],
        debug: { day: 1, time: 21, weather: 'clear', at: [-66, 18, 3.3] },
      },
      {
        id: 'trail', objective: 'Follow the trail', marker: 'ritual',
        log: 'Straw figures moving on the ice. Fire works on them. Red thread tied at every neck.',
        done: (S) => !!S.flag('effigies_fought'), sets: ['effigies_fought'],
        debug: { day: 1, time: 21.4, weather: 'clear', at: [-60, 2, 2.0] },
      },
      {
        id: 'echo', objective: 'Examine the ritual site', marker: 'ritual',
        log: 'At the poles: three years ago a girl went through the ice with the effigy. Nobody went back for her. Hanka turned round, then kept walking.',
        done: (S) => !!S.flag('echo_seen'), sets: ['echo_seen'],
        debug: { day: 1, time: 22, weather: 'clear', at: [4, -18, 2.8] },
      },
      {
        id: 'tower', objective: 'Follow the drag marks to the tower', marker: 'bellTower',
        reach: { x: 120, z: -150, r: 16 },
        debug: { day: 1, time: 22.5, weather: 'clear', at: [20, -40, 2.2] },
      },
    ],
  },

  // Q4
  main_bell: {
    title: 'The Bell Under the Ice', kind: 'main', next: 'main_hanka',
    stages: [
      {
        id: 'climb', objective: 'Climb the drowned tower', marker: 'bellTower',
        journal: 'The old church tower in the ice. Stairs inside, rotten.',
        reach: { x: 120, z: -150, r: 5 }, done: (S) => !!S.flag('lair_seen'),
        debug: { day: 1, time: 23, weather: 'clear', at: [112, -138, 2.6] },
      },
      {
        id: 'belfry', objective: 'Reach the belfry', marker: 'bellTower',
        log: "Belfry: seventeen effigies sat round a table, frozen bread, a music box. The three fishermen are under the ice by the tower. A girl's voice asked if her mother sent me.",
        done: (S) => !!S.flag('lair_seen'), sets: ['lair_seen', 'wiesia_spoke'],
        debug: { day: 1, time: 23.3, weather: 'clear', at: [118, -147, 2.6] },
      },
      {
        id: 'dawn', objective: 'Return to the village at dawn', marker: 'fishingHuts',
        done: (S) => !!S.flag('dawn_done'), sets: ['dawn_done'],
        debug: { day: 1, time: 23.8, weather: 'clear', at: [114, -140, 2.6] },
      },
    ],
  },

  // Q5
  main_hanka: {
    title: 'What Hanka Saw', kind: 'main', next: 'main_rite',
    stages: [
      {
        id: 'dobra', objective: 'Ask Dobra about the rite', marker: 'dobra',
        log: 'Dobra, the effigy maker. Says the old carvings on the island show real girls, before the straw. Kept looking at the knot on my chain.',
        done: (S) => !!S.flag('met_dobra'), sets: ['met_dobra', 'dobra_knot_noticed'],
        debug: { day: 2, time: 7.5, weather: 'fog', at: [-15, 66, 3.14] },
      },
      {
        id: 'confront', objective: 'Confront Hanka', marker: 'hanka',
        log: (S) => (S.flag('hanka_blamed')
          ? "Told Hanka what I saw, and what I think of it. She'll be on the ice tonight."
          : "Told Hanka what I saw. She'll be on the ice tonight."),
        done: (S) => !!S.flag('hanka_confronted'), sets: ['hanka_confronted', 'hanka_comforted'],
        debug: { day: 2, time: 10, weather: 'overcast', at: [70, 76, 1.9] },
      },
      {
        id: 'wait', objective: 'Wait for the equinox night', marker: null,
        journal: 'The rite is tonight, after dark.',
        done: (S, G) => (G.time?.day ?? 0) >= 2 && G.time.hours >= 19.5,
        debug: { day: 2, time: 12, weather: 'overcast', at: [SPAWN.square.x, SPAWN.square.z, SPAWN.square.yaw] },
      },
    ],
  },

  // Q6
  main_rite: {
    title: 'The Drowning of Marzanna', kind: 'main',
    stages: [
      {
        id: 'site', objective: 'Go to the ritual site', marker: 'ritual',
        done: (S) => !!S.flag('rite_started'), sets: ['rite_started'],
        debug: { day: 2, time: 19.8, weather: 'snow', at: [-10, 58, 3.0] },
      },
      {
        id: 'survive', objective: 'Survive', marker: null, sets: ['boss_started', 'boss_yielded'],
        done: (S) => !!S.flag('boss_yielded'),
        debug: { day: 2, time: 20.5, weather: 'blizzard', at: [6, -20, 3.14] },
      },
      {
        id: 'choose', objective: 'Choose', marker: null,
        done: (S) => !!S.flag('ending'),
        debug: { day: 2, time: 20.8, weather: 'blizzard', at: [6, -22, 3.14] },
      },
      {
        id: 'epilogue', objective: "Dobra's Knot", marker: 'westGate',
        debug: { day: 3, time: 8, weather: 'clear', at: [-84, 128, -1.5] },
      },
    ],
  },

  // Side quests
  side_bird: {
    title: 'A Bird for Wiesia', kind: 'side',
    stages: [
      {
        id: 'bring', objective: 'Leave the bird on the belfry table', marker: 'bellTower',
        journal: 'Jarek, a fisherman, carved a bird for Wiesia and never gave it to her. Wants me to take it out there.',
        log: 'Left the bird on the table in the belfry.',
        done: (S) => !!S.flag('bird_given'), sets: ['jarek_met', 'bird_taken', 'bird_given'],
      },
    ],
  },

  side_ledger: {
    title: "The Reeve's Ledger", kind: 'side',
    stages: [
      {
        id: 'find', objective: 'Search under the longhouse', marker: 'longhouse',
        log: "Reeve's ledger, in the cellar. He has been giving his own ration away. His son's name is crossed out.",
        done: (S) => !!S.flag('ledger_found'), sets: ['ledger_found'],
      },
      {
        id: 'tell', objective: (S) => (S.flag('echo_seen') ? 'Tell Bogdan the truth' : 'Learn what happened at the rite'),
        marker: (S) => (S.flag('echo_seen') ? 'longhouse' : null),
        done: (S) => !!S.flag('reeve_told'), sets: ['reeve_told'],
      },
    ],
  },

  side_wisps: {
    title: 'Lights in the Reeds', kind: 'side',
    stages: [
      {
        id: 'follow', objective: 'Follow the lights in the reeds', marker: 'marsh',
        journal: 'Pale lights in the west marsh. They drift off when I come close.',
        log: 'A smuggler, frozen in the reeds. A key in his coat. Third kiln at the burners\' camp.',
        done: (S) => !!S.flag('smuggler_key'), sets: ['wisps_done', 'smuggler_key'],
      },
      {
        id: 'stash', objective: 'Open the stash in the third kiln', marker: 'charcoal',
        log: 'Thirty-five grosze and two Thaw draughts in the third kiln.',
        done: (S) => !!S.flag('stash_opened'), sets: ['stash_opened'], give: { coins: 35, thaw: 2 },
      },
    ],
  },

  side_wolves: {
    title: 'Wolves at the Mill', kind: 'side',
    stages: [
      {
        id: 'mill', objective: 'Talk to Gniewko at the mill', marker: 'mill',
        journal: 'Gniewko, the miller. Wolves took his dog and near took his boy. He pays what he has.',
        reach: { x: 362, z: -58, r: 10 },
      },
      {
        id: 'den', objective: 'Find the den below the frozen falls', marker: [432, -70],
        log: 'Four wolves and a scarred old one. Thin, all of them.',
        done: (S) => !!S.flag('wolves_mill_done'), sets: ['wolves_mill_done'],
      },
      {
        id: 'reward', objective: 'Return to Gniewko', marker: 'mill',
        log: 'Warm water comes up near the poles, the miller says. His father never let anyone fish there.',
        done: (S) => !!S.flag('miller_warm_water'), sets: ['miller_warm_water'], give: { coins: 40 },
      },
    ],
  },

  // Optional. Bozena, the miller's wife, wants her father-in-law's hand-bell rung at the ritual ring at dusk.
  // Nothing in the main story reads these flags (src/story/controller/side.js, miller_wife.js).
  side_handbell: {
    title: 'The Hand-Bell', kind: 'side',
    stages: [
      {
        id: 'find', objective: 'Find the hand-bell at the ritual ring', marker: 'ritual',
        journal: "Bożena, the miller's wife, wants her father-in-law's hand-bell rung at the ritual ring at dusk, three times, the way it was done against the hail. He left it tied to one of the poles. Pays 20 grosze.",
        log: 'Took the bell off its pole. Rag round the clapper.',
        done: (S) => !!S.flag('handbell_taken'), sets: ['handbell_asked', 'handbell_taken'],
      },
      {
        id: 'ring', objective: 'Ring the bell inside the ring at dusk', marker: 'ritual',
        log: 'Rang it three times at dusk. A handful of them came down over the ice and stayed a while, then went back up. Tied the bell back on its pole.',
        done: (S) => !!S.flag('handbell_rung'), sets: ['handbell_rung'],
      },
      {
        id: 'tell', objective: 'Tell Bożena at the mill', marker: 'mill',
        log: 'Bożena paid 20 grosze and said to leave the bell where it is.',
        done: (S) => !!S.flag('handbell_paid'), sets: ['handbell_paid'], give: { coins: 20 },
      },
    ],
  },

  // Optional. The hanged man at the crossroads (src/story/controller/side.js and clues.js).
  side_hanged: {
    title: 'Three Loaves', kind: 'side',
    stages: [
      {
        id: 'cut', objective: 'Cut the hanged man down at the crossroads', marker: 'crossroads',
        journal: 'A man hanged at the crossroads for taking three loaves. His sister, Agnieszka, pinned a note to his coat asking for someone to cut him down. She could not reach.',
        log: 'Cut the rope and laid him beside the tree with his coat over his face. The ground is too hard to dig.',
        done: (S) => !!S.flag('hanged_cut'), sets: ['hanged_read', 'hanged_cut'],
      },
    ],
  },

  // Optional. Kosci, the dice poker in the Drowned Bell (src/minigames/dice, src/story/controller/dice.js): beat Zbyszek, Wojtek
  // and Halina at a full match each, then tell Zbyszek. Nothing in the main story reads these flags.
  side_dice: {
    title: 'Dice at the Drowned Bell', kind: 'side',
    stages: [
      {
        id: 'play', objective: 'Beat the three who play dice',
        journal: 'Zbyszek keeps the dice behind the bar. He plays across the counter for small stakes, and Wojtek and Halina sit at the middle table from noon. Best of three rounds.',
        objectives: [
          { id: 'zbyszek', text: 'Beat Zbyszek across the bar', marker: 'tavern', done: (S) => !!S.flag('dice_beat_zbyszek'), log: 'Beat Zbyszek across the bar. He never goes above three grosze.' },
          { id: 'wojtek', text: 'Beat Wojtek at the middle table', marker: 'tavern', done: (S) => !!S.flag('dice_beat_wojtek'), log: 'Beat Wojtek, the woodcutter. He raises on almost anything and rolls most of his dice again.' },
          { id: 'halina', text: 'Beat Halina at the middle table', marker: 'tavern', done: (S) => !!S.flag('dice_beat_halina'), log: 'Beat Halina. She goes up on nothing now and then.' },
        ],
        sets: ['dice_beat_zbyszek', 'dice_beat_wojtek', 'dice_beat_halina'],
      },
      {
        id: 'tell', objective: 'Tell Zbyszek', marker: 'tavern',
        log: "Zbyszek gave me his father's bone dice. Says he never won with them.",
        done: (S) => !!S.flag('dice_bone_set'), sets: ['dice_bone_set'],
      },
    ],
  },

  // Optional. Bogdan wants the pike under the bell tower on a table; he lends his father's line (src/story/content/dialogues/
  // bogdan_fish.js, src/story/controller/side.js, src/gameplay/fishing). Nothing in the main story reads these flags.
  side_oldone: {
    title: 'The Old One', kind: 'side',
    stages: [
      {
        id: 'cut', objective: 'Cut a hole at the thin ice by the bell tower', marker: 'bellTower',
        journal: "Bogdan, the reeve, wants the old pike out from under the bell tower. It has broken every line put down there for years. His father's line, waxed horsehair and flax, is in my pack. The ice is thin by the tower where a rag is tied to a stake. Cut a hole there, no wider than a bucket. Go at night.",
        log: 'Cut a hole at the thin place by the tower. About as wide as a bucket.',
        done: (S) => !!S.flag('oldone_hole'), sets: ['oldone_heard', 'oldone_asked', 'oldone_hole'], give: { strong_line: 1 },
        debug: { day: 1, time: 23, weather: 'clear', at: [108, -142, 2.6] },
      },
      {
        id: 'wait', objective: 'Fish the hole at night, with the jig on the bottom', marker: 'bellTower',
        log: 'Landed it. A pike nearly as long as I am tall, three old hooks in its jaw, one with red wool still tied to it.',
        done: (S) => !!S.flag('oldone_landed'), sets: ['oldone_landed'],
        debug: { day: 1, time: 23.5, weather: 'clear', at: [112, -150, 2.6] },
      },
      {
        id: 'bring', objective: 'Take the pike to Bogdan', marker: 'longhouse',
        log: "Bogdan weighed it on the grain scale and paid by the kilo. The first of it goes to Pawlak's house. The red wool was Stach's.",
        done: (S) => !!S.flag('oldone_paid'), sets: ['oldone_paid'], give: { coins: 66 },
        debug: { day: 2, time: 9, weather: 'overcast', at: [5, 104, 3.14] },
      },
    ],
  },

  // Optional roadside encounters (src/story/controller/roadside/*.js, docs/STORY.md section 9). Nothing in the main
  // story reads any of these flags. The small ones are started and settled quietly (a journal toast, no fanfare).
  side_tinker: {
    title: "The Tinker's Sledge", kind: 'side',
    stages: [
      {
        id: 'lift', objective: 'Hold up the tinker\'s sledge', marker: (S, G) => G.storyCtl?.roadside?.tinker?.site,
        journal: 'A tinker on the pass road, his sledge down on one runner. He needs the corner held up while he lashes the split.',
        log: 'Held the sledge up while he lashed the runner. He sells Thaw draughts for eight grosze, four under the tavern, and says he will be at the stalls in the square.',
        done: (S) => !!S.flag('tinker_helped'), sets: ['tinker_met', 'tinker_helped'],
      },
    ],
  },

  side_goat: {
    title: 'The Strayed Goat', kind: 'side',
    stages: [
      {
        id: 'find', objective: 'Find the goat in the twisted pines', marker: (S, G) => G.storyCtl?.roadside?.goat?.grove,
        journal: (S) => (S.flag('goat_asked')
          ? 'Zofia, outside the west gate, has lost a white goat with a folded ear. Out since yesterday. She thinks it went for the grass under the twisted pines past the marsh.'
          : 'A white goat with a folded ear, loose in the twisted pines past the marsh, a rope trailing from her neck. Someone in the village will be missing her.'),
        log: 'Found her under the twisted pines. She comes along on the rope.',
        done: (S) => !!S.flag('goat_tied'), sets: ['goat_asked', 'goat_tied'],
      },
      {
        id: 'return', objective: 'Bring the goat to Zofia at the west gate', marker: 'westGate',
        log: 'Brought her to Zofia at the west gate. She paid in eggs, three.',
        done: (S) => !!S.flag('goat_home'), sets: ['goat_home'],
      },
    ],
  },

  side_scarf: {
    title: "Jasiek's Scarf", kind: 'side',
    stages: [
      {
        id: 'look', objective: 'Look for the boy on the pass road', marker: (S, G) => G.storyCtl?.roadside?.scarf?.site,
        journal: "At the wayside shrine on the pass road an old woman is asking after her son, Jasiek, sixteen, who took a sledge up the pass for wood four days ago. A grey scarf with a red stripe, too long for him. I passed a sledge with firewood on it below the watchtower, and nobody with it.",
        log: 'His scarf, in the drift beside the road above the sledge. Frozen stiff. Nothing else there.',
        done: (S) => !!S.flag('scarf_found'), sets: ['scarf_asked', 'scarf_found'],
      },
      {
        id: 'return', objective: "Take the scarf to Jasiek's mother", marker: (S, G) => G.storyCtl?.roadside?.scarf?.shrine,
        log: 'Gave her the scarf. She hung it on the shrine post and gave me eight grosze out of her jar. I took it.',
        done: (S) => !!S.flag('scarf_returned'), sets: ['scarf_returned'],
      },
    ],
  },

  side_sled: {
    title: 'A Sled on the Bank', kind: 'side',
    stages: [
      {
        id: 'push', objective: 'Push the boy\'s sled off the bank',
        journal: 'A boy on the river bank by the mill, hauling firewood on a sled that has jammed a runner. He has been at it a while.',
        log: 'Pushed it up out of the rut. He gave me a grosz and I took it.',
        done: (S) => !!S.flag('sled_freed'), sets: ['sled_met', 'sled_freed'],
      },
    ],
  },

  side_poacher: {
    title: 'A Lantern in the Forest', kind: 'side',
    stages: [
      {
        id: 'note', objective: 'See what the poacher left behind',
        journal: 'A lantern moving among the trees off the forest track at night. Somebody is setting snares.',
        log: 'He ran. He left snares, a hare, and a satchel with a tally in it: hares, and who got them. "Not a word to B."',
        done: (S) => !!S.flag('poacher_note'), sets: ['poacher_chased', 'poacher_note'],
      },
    ],
  },

  side_fishers: {
    title: 'Whose Hole', kind: 'side',
    stages: [
      {
        id: 'settle', objective: 'Two fishermen are quarrelling over a hole at the river mouth',
        journal: 'Two fishermen at the river mouth, Wacław and Franek, each saying the hole in the ice is his.',
        log: (S) => {
          const r = S.flag('fishers_settled');
          if (r === 'old') return "Told them it was Wacław's, since he cut it. Franek packed up and went. Wacław paid me four grosze.";
          if (r === 'young') return "Told them it was Franek's for the day, since he was there first. Wacław went off without a word. Franek paid me four grosze.";
          if (r === 'both') return 'Told them there was ice for two. They cut a second hole a few paces over and fish side by side, not speaking.';
          return 'Left them to it.';
        },
        done: (S) => !!S.flag('fishers_settled'), sets: ['fishers_settled'],
      },
    ],
  },

  side_carcass: {
    title: 'Wolves on the Forest Track', kind: 'side',
    stages: [
      {
        id: 'clear', objective: 'Wolves at a kill off the forest track', marker: (S, G) => G.storyCtl?.roadside?.carcass?.spot,
        journal: 'Three wolves at a fresh kill, a roe deer, a little off the forest track at dusk. They have not noticed me.',
        log: 'Killed the three at the roe deer. There were crows on it before I had walked off.',
        done: (S) => !!S.flag('carcass_wolves_dead'), sets: ['carcass_seen', 'carcass_wolves_dead'],
      },
    ],
  },

  side_snow: {
    title: 'Snow Fight', kind: 'side',
    stages: [
      {
        id: 'fight', objective: 'Snow fight on the sledding hill', marker: 'sledHill',
        journal: 'Ola and two other children, with snowballs.',
        log: (S) => (S.flag('ola_lie')
          ? 'Ola asked if drowning hurts. Told her it would not happen.'
          : 'Ola asked if drowning hurts. Told her the truth.'),
        done: (S) => !!(S.flag('ola_truth') || S.flag('ola_lie')), sets: ['snowfight_done', 'ola_truth'],
      },
    ],
  },
};

export default QUESTS;
