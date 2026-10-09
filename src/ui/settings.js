// Player settings, persisted in localStorage and published as G.settings.
//   G.settings.mouseSens   multiplier for look speed (1 = default). The camera rig should multiply by it.
//   G.settings.invertY     boolean
//   G.settings.subScale    subtitle size multiplier (0.85 / 1 / 1.2)
// Volumes live on G.audio.volumes ({ master, music, sfx, ambience }); we only persist and re-apply them.
import { store } from './dom.js';

const num = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

export const VOLUME_KEYS = [['master', 'Master'], ['music', 'Music'], ['sfx', 'Effects'], ['ambience', 'Ambience']];

export class Settings {
  constructor(G) {
    this.G = G;
    this.mouseSens = num(store.get('marzena.mouseSens'), 1);
    this.invertY = store.get('marzena.invertY') === '1';
    this.subScale = num(store.get('marzena.subScale'), 1);
    this.savedVolumes = {};
    for (const [k] of VOLUME_KEYS) {
      const v = store.get(`marzena.vol.${k}`);
      if (v != null) this.savedVolumes[k] = num(v, 0.8);
    }
    G.settings = this;
    this._applyCss();
  }

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

  setMouseSens(v) {
    this.mouseSens = Math.max(0.2, Math.min(3, v));
    store.set('marzena.mouseSens', this.mouseSens.toFixed(2));
  }

  setSubScale(v) {
    this.subScale = v;
    store.set('marzena.subScale', v);
    this._applyCss();
  }

  setInvertY(on) {
    this.invertY = !!on;
    store.set('marzena.invertY', on ? '1' : '0');
  }

  // Quality changes need a fresh renderer: reload with ?quality=.
  reloadWithQuality(q) {
    try { this.G.state?.save?.(); } catch { /* ignore */ }
    const u = new URL(location.href);
    u.searchParams.set('quality', q);
    location.href = u.toString();
  }
}
