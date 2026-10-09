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
        journal: 'Hollow Pass in a blizzard. Kasza hates me. Fair.',
        debug: { day: 1, time: 14.5, weather: 'blizzard', at: [SPAWN.prologue.x, SPAWN.prologue.z, SPAWN.prologue.yaw] },
      },
      {
        id: 'wreck', objective: 'Examine the wreck', marker: [-556, 514],
        log: 'A family. Tried to leave the valley. The father died looking back over his shoulder.',
        debug: { day: 1, time: 14.7, weather: 'blizzard', at: [-551, 511, 2.4] },
      },
      {
        id: 'wolves', objective: 'Survive the wolves',
        log: 'Three wolves. Thin. Hungry things do stupid things. So do I.',
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
        log: '"Something walks the ice at night." Signed H. A careful hand. Somebody practiced that letter.',
        done: (S) => !!S.flag('contract_taken'), sets: ['contract_taken'],
        debug: { day: 1, time: 16.6, weather: 'clear', at: [SPAWN.square.x, SPAWN.square.z, SPAWN.square.yaw] },
      },
      {
        id: 'ask', objective: 'Ask around the village',
        objectives: [
          {
            id: 'tavern', text: 'Ask at the Drowned Bell', marker: 'tavern', done: (S) => !!S.flag('met_zbyszek'),
            log: 'Three fishermen gone. Bread at three grosze. The rite is tomorrow night. The barman says only Hanka writes that fair.',
          },
          {
            id: 'reeve', text: 'See the reeve', marker: 'longhouse', done: (S) => !!S.flag('met_bogdan'),
            log: (S) => 'The reeve does not want me here. He offered me money to leave. '
              + (S.flag('took_reeve_money') ? 'I took it. Money is money.' : "I didn't take it. He looked relieved and angry at once."),
          },
        ],
        sets: ['met_zbyszek', 'knows_fair_hand', 'met_bogdan', 'refused_reeve_money'],
        debug: { day: 1, time: 17, weather: 'clear', at: [-8, 112, 3.14] },
      },
      {
        id: 'hanka', objective: 'Find Hanka', marker: 'hanka',
        log: "Hanka posted the contract. Her daughter Ola is the maiden they mean to drown. Pay: sixty-one grosze and a wedding ring. I've worked for less. Not often.",
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
        journal: "Whatever walks the ice walks at night. So I'll walk the ice at night.",
        done: (S) => !!S.flag('night1'), sets: ['night1'],
        debug: { day: 1, time: 18.2, weather: 'clear', at: [70, 76, 1.9] },
      },
      {
        id: 'camp', objective: 'Search the ice-fishing camp', marker: 'iceCamp',
        log: 'Drag marks. Straw. A mitten with a hand-darned thumb.',
        done: (S) => !!S.flag('trail_found'), sets: ['trail_found'],
        debug: { day: 1, time: 21, weather: 'clear', at: [-66, 18, 3.3] },
      },
      {
        id: 'trail', objective: 'Follow the trail', marker: 'ritual',
        log: 'Straw dolls, walking. Fire takes them. Each one had a red knot tied at the neck.',
        done: (S) => !!S.flag('effigies_fought'), sets: ['effigies_fought'],
        debug: { day: 1, time: 21.4, weather: 'clear', at: [-60, 2, 2.0] },
      },
      {
        id: 'echo', objective: 'Examine the ritual site', marker: 'ritual',
        log: "Three years ago. A girl went under the ice with the effigy. They kept singing. They didn't look back. One did.",
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
        journal: 'The bell tower of Old Marzena. Stairs inside, rotten, iced.',
        reach: { x: 120, z: -150, r: 5 },
        debug: { day: 1, time: 23, weather: 'clear', at: [112, -138, 2.6] },
      },
      {
        id: 'belfry', objective: 'Reach the belfry', marker: 'bellTower',
        log: "Seventeen straw girls around a table. Frozen bread. A music box. Three men under the ice, faces up. She wasn't hunting. She was keeping house.",
        done: (S) => !!S.flag('lair_seen'), sets: ['lair_seen', 'wiesia_spoke'],
        debug: { day: 1, time: 23.3, weather: 'clear', at: [118, -147, 2.6] },
      },
      {
        id: 'dawn', objective: 'Return to the village at dawn', marker: 'fishingHuts',
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
        log: 'The effigy maker. Hands like roots. She told me the rite was a mercy once. She looked at my medallion for too long.',
        done: (S) => !!S.flag('met_dobra'), sets: ['met_dobra', 'dobra_knot_noticed'],
        debug: { day: 2, time: 7.5, weather: 'fog', at: [-15, 66, 3.14] },
      },
      {
        id: 'confront', objective: 'Confront Hanka', marker: 'hanka',
        log: (S) => (S.flag('hanka_blamed')
          ? "I told her the truth. She'll come onto the ice. I don't know what else she'll do."
          : "I told her Ola needs her to look now. She'll come onto the ice."),
        done: (S) => !!S.flag('hanka_confronted'), sets: ['hanka_confronted', 'hanka_comforted'],
        debug: { day: 2, time: 10, weather: 'overcast', at: [70, 76, 1.9] },
      },
      {
        id: 'wait', objective: 'Wait for the equinox night', marker: null,
        journal: 'Tonight they drown Marzanna. Tonight they mean to drown Ola.',
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
        id: 'survive', objective: 'Survive', marker: null, sets: ['boss_started'],
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
        journal: "He asks me to take it to her. To the ice. I said I'd see.",
        log: 'I left the bird on her table.',
        done: (S) => !!S.flag('bird_given'), sets: ['jarek_met', 'bird_taken', 'bird_given'],
      },
    ],
  },

  side_ledger: {
    title: "The Reeve's Ledger", kind: 'side',
    stages: [
      {
        id: 'find', objective: 'Search under the longhouse', marker: 'longhouse',
        log: "The reeve gave his own share away. To the Nowak children. To widow Pawlak. His son's name is crossed out.",
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
        journal: 'Pale lights in the west marsh. They drift off when I come close.', // draft
        log: 'A smuggler, frozen in the reeds. A key in his coat. Third kiln at the burners\' camp.', // draft
        done: (S) => !!S.flag('smuggler_key'), sets: ['wisps_done', 'smuggler_key'],
      },
      {
        id: 'stash', objective: 'Open the stash in the third kiln', marker: 'charcoal',
        log: "Thirty-five grosze and two Thaw draughts. He won't be back for them.", // draft
        done: (S) => !!S.flag('stash_opened'), sets: ['stash_opened'], give: { coins: 35, thaw: 2 },
      },
    ],
  },

  side_wolves: {
    title: 'Wolves at the Mill', kind: 'side',
    stages: [
      {
        id: 'mill', objective: 'Talk to Gniewko at the mill', marker: 'mill',
        journal: 'Gniewko, the miller. Wolves took his dog and near took his boy. He pays what he has.', // draft
        reach: { x: 362, z: -58, r: 10 },
      },
      {
        id: 'den', objective: 'Find the den below the frozen falls', marker: [432, -70],
        log: 'Four wolves and a scarred old one. Thin, all of them.', // draft
        done: (S) => !!S.flag('wolves_mill_done'), sets: ['wolves_mill_done'],
      },
      {
        id: 'reward', objective: 'Return to Gniewko', marker: 'mill',
        log: 'Warm water comes up near the poles, the miller says. His father never let anyone fish there.', // draft
        done: (S) => !!S.flag('miller_warm_water'), sets: ['miller_warm_water'], give: { coins: 40 },
      },
    ],
  },

  side_snow: {
    title: 'Snow Fight', kind: 'side',
    stages: [
      {
        id: 'fight', objective: 'Snow fight on the sledding hill', marker: 'sledHill',
        journal: 'Ola and two others with snowballs. I am Marzanna, apparently.', // draft
        log: (S) => (S.flag('ola_lie')
          ? "She asked if drowning hurts. I told her it won't happen. She knew." // draft
          : 'She asked if drowning hurts. I told her the truth.'), // draft
        done: (S) => !!(S.flag('ola_truth') || S.flag('ola_lie')), sets: ['snowfight_done', 'ola_truth'],
      },
    ],
  },
};

export default QUESTS;
