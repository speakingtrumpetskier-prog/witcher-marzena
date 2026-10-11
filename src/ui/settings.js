// Player settings, persisted in localStorage ('marzena.<key>') and published as G.settings.
//
// Camera and look (read by gameplay/CameraRig.js every frame):
//   mouseSensX / mouseSensY    look speed multipliers for the mouse (1 = default), padSensX / padSensY for the right stick
//   invertX / invertY          boolean, both devices
//   fovOffset                  degrees added to every mode's field of view (-10 .. 15)
//   camDist                    preferred follow distance as a multiplier of each mode's own (0.75 .. 1.4); the wheel zooms around it
//   shoulder                   'right' | 'left' (swapped by the 'shoulder' action)
//   recenter                   'auto' | 'off' | 'gentle' | 'strong': swing behind the player while moving with no look input.
//                              'auto' is gentle with a pad and off with a mouse
//   padRamp                    full stick deflection turns faster the longer it is held
// Controller: padDeadzone (0.05 .. 0.35), rumble (bool), padStyle ('auto' | 'xbox' | 'playstation')
// Hints: hints (bool). Which ones were shown lives in G.hints.
// Other: subScale (0.85 / 1 / 1.2). set(key, value) validates, persists and emits 'settings' { key, value }.
// Volumes live on G.audio.volumes ({ master, music, sfx, ambience, voice }); we only persist and re-apply them.
import { store } from './dom.js';

const num = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

export const VOLUME_KEYS = [['master', 'Master'], ['music', 'Music'], ['sfx', 'Effects'], ['ambience', 'Ambience'], ['voice', 'Voice']];

// Defaults and limits. A value with `values` is a choice, a boolean default is a toggle, the rest are numbers.
export const SCHEMA = {
  mouseSensX: { def: 1, min: 0.2, max: 3 },
  mouseSensY: { def: 1, min: 0.2, max: 3 },
  padSensX: { def: 1, min: 0.3, max: 2.5 },
  padSensY: { def: 1, min: 0.3, max: 2.5 },
  invertX: { def: false },
  invertY: { def: false },
  fovOffset: { def: 0, min: -10, max: 15 },
  camDist: { def: 1, min: 0.75, max: 1.4 },
  shoulder: { def: 'right', values: ['right', 'left'] },
  recenter: { def: 'auto', values: ['auto', 'off', 'gentle', 'strong'] },
  padRamp: { def: true },
  padDeadzone: { def: 0.18, min: 0.05, max: 0.35 },
  rumble: { def: true },
  padStyle: { def: 'auto', values: ['auto', 'xbox', 'playstation'] },
  hints: { def: true },
  subScale: { def: 1, values: [0.85, 1, 1.2] },
};
export const CAMERA_KEYS = ['mouseSensX', 'mouseSensY', 'padSensX', 'padSensY', 'invertX', 'invertY', 'fovOffset', 'camDist', 'shoulder', 'recenter', 'padRamp'];

export class Settings {
  constructor(G) {
    this.G = G;
    const legacySens = store.get('marzena.mouseSens');
    for (const [key, s] of Object.entries(SCHEMA)) {
      let raw = store.get(`marzena.${key}`);
      if (raw == null && legacySens != null && (key === 'mouseSensX' || key === 'mouseSensY')) raw = legacySens;
      this[key] = this._parse(key, s, raw);
    }
    this.savedVolumes = {};
    for (const [k] of VOLUME_KEYS) {
      const v = store.get(`marzena.vol.${k}`);
      if (v != null) this.savedVolumes[k] = num(v, 0.8);
    }
    G.settings = this;
    this._applyCss();
  }

  _parse(key, s, raw) {
    if (raw == null) return s.def;
    if (typeof s.def === 'boolean') return raw === '1';
    if (s.values) {
      const v = typeof s.def === 'number' ? num(raw, s.def) : raw;
      return s.values.includes(v) ? v : s.def;
    }
    return Math.max(s.min, Math.min(s.max, num(raw, s.def)));
  }

  // Validate, store and announce one setting. Returns the value that stuck.
  set(key, value) {
    const s = SCHEMA[key];
    if (!s) return undefined;
    let v = value;
    if (typeof s.def === 'boolean') v = !!value;
    else if (s.values) v = s.values.includes(value) ? value : s.def;
    else v = Math.max(s.min, Math.min(s.max, num(value, s.def)));
    this[key] = v;
    store.set(`marzena.${key}`, typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? v.toFixed(2) : v);
    if (key === 'subScale') this._applyCss();
    this.G.events.emit('settings', { key, value: v });
    return v;
  }

  isDefault(keys) { return keys.every((k) => this[k] === SCHEMA[k].def); }
  reset(keys) { for (const k of keys) this.set(k, SCHEMA[k].def); }

  _applyCss() {
    document.documentElement.style.setProperty('--mz-sub-scale', String(this.subScale));
  }

  // Called when the audio module exists (game:ready) and whenever a volume changes.
  apply() {
    const vols = this.G.audio?.volumes;
    if (vols) for (const k of Object.keys(this.savedVolumes)) vols[k] = this.savedVolumes[k];
    this._applyCss();
  }

  getVolume(key) {
    return this.G.audio?.volumes?.[key] ?? this.savedVolumes[key] ?? 0.8;
  }

  setVolume(key, v) {
    v = Math.max(0, Math.min(1, v));
    this.savedVolumes[key] = v;
    store.set(`marzena.vol.${key}`, v.toFixed(2));
    const a = this.G.audio;
    if (a?.volumes) a.volumes[key] = v;
    try { a?.setVolume?.(key, v); } catch { /* optional */ }
  }

  // The older single mouse speed: the mean of both axes, and setting it sets both.
  get mouseSens() { return (this.mouseSensX + this.mouseSensY) / 2; }
  setMouseSens(v) { this.set('mouseSensX', v); this.set('mouseSensY', v); }
  setSubScale(v) { this.set('subScale', v); }
  setInvertY(on) { this.set('invertY', on); }

  // Quality changes need a fresh renderer: reload with ?quality=.
  reloadWithQuality(q) {
    try { this.G.state?.save?.(); } catch { /* ignore */ }
    const u = new URL(location.href);
    u.searchParams.set('quality', q);
    location.href = u.toString();
  }
}
