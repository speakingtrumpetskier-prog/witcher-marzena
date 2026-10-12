// The fishing HUD (DOM, built once, mutated only when a value changes).
//
//   const hud = new FishHud(G);
//   hud.show(true | false)                     the whole layer
//   hud.gauge(true, { water, depth, nib, bite })  the depth gauge: the ice at the top, the floor at the bottom, the jig between
//   hud.fight(true, { T, Fn, tell, dist, maxDist })   the tension bar, the fish's pull as a white tick, the line out
//   hud.keys(true, { fight })                  the four keys of the session, device aware
//   hud.strike(true | false)                   the key to strike with while the bite window is open
//   hud.msg(text, 'bad' | '', seconds)         one plain line
//   hud.card({ id, name, pl, kg, remark })     the notebook page for a catch
import './fishing.css';
import { h, setText, setStyle, toggle, clear } from '../../ui/dom.js';
import { actionGlyph } from '../../ui/glyphs.js';
import { paperCanvas } from '../../ui/paper.js';
import { drawSketch } from '../../ui/sketch.js';
import { SPECIES } from './species.js';

const KEYS = [['fishJig', 'Jig and strike'], ['fishReel', 'Reel in'], ['fishSlack', 'Let line out'], ['fishLeave', 'Stand up']];

export class FishHud {
  constructor(G) {
    this.G = G;
    const root = G.uiImpl?.root || document.getElementById('ui-root') || document.body;
    this.layer = h('div', { class: 'mz-layer mz-fishlayer' });
    // depth gauge
    this.dTrack = h('div', { class: 'fz-track' });
    this.dFloorCap = h('div', { class: 'fz-cap' });
    this.dIceCap = h('div', { class: 'fz-cap', style: { top: '0%' } }, 'Ice');
    this.dJig = h('div', { class: 'fz-jig' });
    this.dRead = h('div', { class: 'fz-read' });
    this.dTicks = h('div');
    this.dEndTop = h('div', { class: 'fz-end', style: { top: '0%' } });
    this.dEndBot = h('div', { class: 'fz-end', style: { top: '100%' } });
    this.depth = h('div', { class: 'fz-depth' }, this.dTrack, this.dTicks, this.dEndTop, this.dEndBot, this.dIceCap, this.dFloorCap, this.dJig, this.dRead);
    // fight
    this.fCapL = h('span', null, 'Tension');
    this.fCapR = h('b', null, '');
    this.fFill = h('i', { class: 'fill' });
    this.fPull = h('i', { class: 'pull' });
    this.fBar = h('div', { class: 'fz-bar' }, h('i', { class: 'zone z1' }), h('i', { class: 'zone z2' }), h('i', { class: 'zone z3' }), this.fFill, this.fPull);
    this.fFish = h('i', { class: 'fish' });
    this.fLine = h('div', { class: 'fz-line' }, h('i', { class: 'land' }), this.fFish);
    this.fight_ = h('div', { class: 'fz-fight' }, h('div', { class: 'fz-caps' }, this.fCapL, this.fCapR), this.fBar, this.fLine);
    // keys, strike prompt, line of text, card
    this.keysEl = h('div', { class: 'fz-keys' });
    this.keyItems = {};
    for (const [a, label] of KEYS) {
      const it = h('span', { class: 'it' }, actionGlyph(G, a), h('span', null, label));
      this.keyItems[a] = it;
      this.keysEl.appendChild(it);
    }
    this.strikeEl = h('div', { class: 'fz-strike' }, actionGlyph(G, 'fishJig'), h('span', null, 'Strike'));
    this.msgEl = h('div', { class: 'fz-msg' });
    this.cardEl = h('div', { class: 'fz-card' });
    this.layer.append(this.depth, this.fight_, this.keysEl, this.strikeEl, this.msgEl, this.cardEl);
    root.appendChild(this.layer);
    this._msgT = 0;
    this._cardT = 0;
    this._water = -1;
    this._on = false;
  }

  show(on) {
    this._on = on;
    toggle(this.layer, 'on', on);
    if (!on) { this.gauge(false); this.fight(false); this.keys(false); this.strike(false); this.msgEl.classList.remove('on'); this.cardEl.classList.remove('on'); }
  }

  // ---- depth ----------------------------------------------------------------------------------------------------------
  gauge(on, s = {}) {
    toggle(this.depth, 'on', on);
    if (!on) return;
    if (s.water !== this._water) {
      this._water = s.water;
      clear(this.dTicks);
      const n = Math.floor(s.water);
      for (let m = 1; m <= n; m++) if (s.water - m > 0.25) this.dTicks.appendChild(h('div', { class: 'fz-tick', style: { top: `${(m / s.water) * 100}%` } }));
      setText(this.dFloorCap, `Floor ${s.water.toFixed(1)} m`);
      setStyle(this.dFloorCap, 'top', '100%');
    }
    const k = Math.min(1, Math.max(0, s.depth / s.water));
    setStyle(this.dJig, 'top', `${(k * 100).toFixed(2)}%`);
    setStyle(this.dRead, 'top', `${(k * 100).toFixed(2)}%`);
    // the reading sits to the left of the marker; keep it clear of the floor caption
    setStyle(this.dRead, 'marginTop', k > 0.9 ? '-22px' : k < 0.06 ? '20px' : '0px');
    setText(this.dRead, `${s.depth.toFixed(1)} m`);
    toggle(this.dJig, 'bite', !!s.bite);
    toggle(this.dJig, 'floor', k > 0.985);
    if (s.nib) { this.dJig.classList.remove('nib'); void this.dJig.offsetWidth; this.dJig.classList.add('nib'); }
  }

  // ---- the fight --------------------------------------------------------------------------------------------------------
  fight(on, s = {}) {
    toggle(this.fight_, 'on', on);
    if (!on) return;
    const T = Math.min(1.15, Math.max(0, s.T));
    setStyle(this.fFill, 'transform', `scaleX(${Math.min(1, T).toFixed(3)})`);
    setStyle(this.fPull, 'left', `${(Math.min(1.08, Math.max(0, s.Fn)) * 100).toFixed(1)}%`);
    toggle(this.fBar, 'warn', T > 0.62 && T <= 0.86);
    toggle(this.fBar, 'danger', T > 0.86);
    toggle(this.fBar, 'tell', !!s.tell);
    const d = Math.max(0, s.dist);
    setText(this.fCapR, `${d.toFixed(1)} m of line out`);
    setStyle(this.fFish, 'left', `${(Math.min(1, d / s.maxDist) * 100).toFixed(1)}%`);
  }

  // ---- keys and prompts ---------------------------------------------------------------------------------------------------
  keys(on, s = {}) {
    toggle(this.keysEl, 'on', on);
    if (!on) return;
    toggle(this.keyItems.fishJig, 'dim', !!s.fight);
  }

  strike(on) { toggle(this.strikeEl, 'on', on); }

  msg(text, kind = '', seconds = 2.2) {
    setText(this.msgEl, text);
    this.msgEl.className = `fz-msg on${kind ? ` ${kind}` : ''}`;
    this._msgT = seconds;
  }

  // The notebook page for a catch: Vesna's sketch of the species, the name, the weight.
  card({ id, name, pl, kg, remark, seed = 3, seconds = 4 }) {
    const sp = SPECIES[id];
    const W = 330, H = 290;
    const paper = paperCanvas(W, H, { seed: 11 + (seed % 7), edge: 0.8, stain: 0.7 });
    paper.className = 'paper';
    const sk = h('canvas', { class: 'sk', width: 640, height: 440 });
    drawSketch(sk, sp?.sketch || 'perch', seed);
    clear(this.cardEl);
    this.cardEl.append(paper, h('div', { class: 'in' }, sk, h('div', { class: 'nm' }, name), pl ? h('div', { class: 'pl' }, pl) : null, h('div', { class: 'wt' }, kg), remark ? h('div', { class: 'rm' }, remark) : null));
    void this.cardEl.offsetWidth;
    this.cardEl.classList.add('on');
    this._cardT = seconds;
  }

  hideCard() { this._cardT = 0; this.cardEl.classList.remove('on'); }

  update(dt) {
    if (this._msgT > 0) {
      this._msgT -= dt;
      if (this._msgT <= 0) this.msgEl.classList.remove('on');
    }
    if (this._cardT > 0) {
      this._cardT -= dt;
      if (this._cardT <= 0) this.cardEl.classList.remove('on');
    }
  }

  dispose() { this.layer.remove(); }
}
