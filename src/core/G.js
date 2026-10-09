// The global game context. Every module imports G and reads or registers itself here.
// Fields are filled in by modules during init (see docs/ARCHITECTURE.md for the owner of each).
import * as THREE from 'three';
import { Events } from './Events.js';
import { State } from './State.js';
import { Time } from './Time.js';
import { U } from '../render/Uniforms.js';

const params = new URLSearchParams(location.search);

export const G = {
  THREE,
  params,
  // Test / screenshot mode: deterministic, no title screen, no audio, frozen clock.
  shot: params.has('shot'),
  debug: params.has('debug'),

  renderer: null,
  scene: null,
  camera: null,
  // Who drives the camera this frame: 'rig' (gameplay), 'cutscene', 'debug', 'shot', 'title'.
  cameraOwner: 'rig',

  uniforms: U,
  events: new Events(),
  clock: { elapsed: 0, delta: 0, frame: 0 },
  quality: params.get('quality') || 'high', // 'low' | 'medium' | 'high'

  // Filled by modules:
  world: null, // World (core, src/world/World.js)
  physics: null, // gameplay/Collision.js
  input: null, // core/Input.js
  time: null, // core/Time.js
  state: null, // core/State.js
  atmosphere: null, sky: null, weather: null, terrain: null, water: null, vegetation: null,
  postfx: null, audio: null, ui: null,
  player: null, cameraRig: null, horse: null, combat: null, senses: null, interact: null,
  characters: null, npcs: null, creatures: null,
  dialogue: null, quests: null, cutscenes: null, story: null,

  systems: [],
  // Register a per-frame update. Lower order runs first. Returns an unregister function.
  addSystem(name, update, order = 0) {
    const sys = { name, update, order };
    this.systems.push(sys);
    this.systems.sort((a, b) => a.order - b.order);
    return () => { this.systems = this.systems.filter((s) => s !== sys); };
  },

  // Module init errors, shown in the loading screen and in shot mode output.
  errors: [],
};

G.state = new State(G.events);
G.time = new Time(G.events);

// System order conventions (lower runs first):
//   -100 input / time     0 gameplay logic     50 characters & animation
//    80 camera            90 atmosphere/weather/uniforms     100 audio, UI
export const ORDER = { input: -100, time: -90, logic: 0, ai: 10, characters: 50, camera: 80, atmosphere: 90, late: 100 };

if (typeof window !== 'undefined') window.__G = G;
