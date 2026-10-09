// HUD: thin health / stamina / warmth lines, sign selector, Thaw draught count, and the compass
// strip with objective and discovered-place markers.
//
// Reads G.player (health, maxHealth, stamina, maxStamina, warmth, signEnergy, sign, swordDrawn,
// state, position), G.combat?.inCombat, G.state (inventory thaw, discovered) and
// G.quests?.objectives(). Every read is defensive: with no player the stat lines stay hidden.
//
// Performance: DOM nodes are created once. Per frame only transforms and opacity are written, and
// only when the value actually changed (see setStyle/setText in dom.js). The compass tape is one
// element moved with translate3d; markers are pooled.
import * as THREE from 'three';
import { h, svg, setText, setStyle, toggle, clamp01 } from './dom.js';
import { ICON, OBJ_MARK, locIconName } from './icons.js';
import { LOC } from '../world/layout.js';

const PX = 4; // compass pixels per degree
const TURN = 360 * PX;
const SIGNS = [['ember', 'Ember'], ['gale', 'Gale'], ['ward', 'Ward']];
const CALM_AFTER = 4.5; // seconds at full stats before the stat lines fade (W3-like)

const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

export class Hud {
  constructor(G, root, ui) {
    this.G = G;
    this.ui = ui;
    this.enabled = true;
    this.lastChange = -99;
    this.last = { hp: -1, st: -1, wm: -1, en: -1, sign: '', thaw: -1 };
    this._dir = new THREE.Vector3();
    this._objTimer = 0;
    this._objectives = [];
    this._objText = '';
    this._objShownAt = -99;
    this._discoveredN = -1;
    this._markers = new Map();
    this._capKey = '';
    this._build(root);
    this._rebuildLocs();
  }

  _build(root) {
    const bar = (cls, withGhost) => {
      const fill = h('i', { class: 'fill' });
      const ghost = withGhost ? h('i', { class: 'ghost' }) : null;
      return { el: h('div', { class: `mz-bar ${cls}` }, ghost, fill), fill, ghost };
    };
    this.hp = bar('hp', true);
    this.st = bar('st');
    this.wm = bar('wm');
    this.signEls = SIGNS.map(([id, name]) => {
      const en = h('i', { class: 'en' });
      const el = h('div', { class: 'mz-sign', title: name }, svg(ICON[id]), en);
      return { id, el, en };
    });
    this.thawNum = h('span', { class: 'n' }, '0');
    this.thaw = h('div', { class: 'mz-draught' }, svg(ICON.flask), this.thawNum);
    this.stats = h('div', { class: 'mz-stats' },
      this.hp.el, this.st.el, this.wm.el,
      h('div', { class: 'mz-signs' }, ...this.signEls.map((s) => s.el), this.thaw));

    // Compass: a masked strip containing a wide tape, plus a pool of markers.
    this.tape = h('div', { class: 'mz-tape' });
    for (let turn = 0; turn < 3; turn++) {
      [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([l, d]) => {
        const s = h('span', { class: 'mz-card-l' + (l === 'N' ? ' n' : '') }, l);
        s.style.left = `${(turn * 360 + d) * PX}px`;
        this.tape.appendChild(s);
      });
      [45, 135, 225, 315].forEach((d) => {
        const s = h('span', { class: 'mz-card-l minor' }, { 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' }[d]);
        s.style.left = `${(turn * 360 + d) * PX}px`;
        this.tape.appendChild(s);
      });
    }
    this.markLayer = h('div', { class: 'mz-cm-layer' });
    this.strip = h('div', { class: 'mz-strip' }, this.tape, this.markLayer);
    this.caret = h('div', { class: 'mz-caret' });
    this.caption = h('div', { class: 'mz-ccap' });
    this.compass = h('div', { class: 'mz-compass' }, this.strip, this.caret, this.caption);

    this.root = h('div', { class: 'mz-layer mz-hud' }, this.stats, this.compass);
    root.appendChild(this.root);
  }

  show() { this.enabled = true; }
  hide() { this.enabled = false; }

  // ---- compass markers ---------------------------------------------------------------------
  _marker(key, kind, icon) {
    let m = this._markers.get(key);
    if (m) return m;
    const dist = kind === 'obj' ? h('span', { class: 'd' }) : null;
    const ico = kind === 'obj' ? svg(OBJ_MARK) : svg(ICON[icon] || ICON.diamond);
    const el = h('div', { class: `mz-cm ${kind}` }, h('div', { class: 'in' }, ico, dist));
    this.markLayer.appendChild(el);
    m = { el, dist, kind, x: 0, z: 0, name: '', op: -1, tx: 1e9, id: key };
    this._markers.set(key, m);
    return m;
  }

  _rebuildLocs() {
    const list = this.G.state?.data?.discovered || [];
    this._discoveredN = list.length;
    const want = new Set();
    for (const id of list) {
      const loc = LOC[id];
      if (!loc || !loc.map) continue;
      const key = `loc:${id}`;
      want.add(key);
      const m = this._marker(key, 'loc', locIconName(id));
      m.x = loc.x; m.z = loc.z; m.name = loc.name;
    }
    for (const [key, m] of this._markers) {
      if (key.startsWith('loc:') && !want.has(key)) { m.el.remove(); this._markers.delete(key); }
    }
  }

  _syncObjectives() {
    let list = [];
    try { list = this.G.quests?.objectives?.() || []; } catch { list = []; }
    this._objectives = list;
    const want = new Set();
    list.forEach((o, i) => {
      const mk = o.marker;
      const x = Array.isArray(mk) ? mk[0] : mk?.x;
      const z = Array.isArray(mk) ? mk[1] : mk?.z;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const key = `obj:${o.questId ?? ''}:${i}`;
      want.add(key);
      const m = this._marker(key, 'obj');
      m.x = x; m.z = z; m.name = o.text || '';
      toggle(m.el, 'primary', i === 0);
    });
    for (const [key, m] of this._markers) {
      if (key.startsWith('obj:') && !want.has(key)) { m.el.remove(); this._markers.delete(key); }
    }
    const first = list[0]?.text || '';
    if (first !== this._objText) {
      this._objText = first;
      if (first) this._objShownAt = this.G.clock.elapsed;
    }
  }

  // ---- per frame ---------------------------------------------------------------------------
  update(dt) {
    const G = this.G;
    const ui = this.ui;
    const on = this.enabled && G.input?.context === 'game' && !ui.overlays.lbOn && G.cameraOwner !== 'title' && !ui.menuOpen;
    toggle(this.root, 'on', on);
    if (!on) return;
    const now = G.clock.elapsed;
    this._stats(now);
    this._compass(dt, now);
  }

  _stats(now) {
    const G = this.G;
    const p = G.player;
    const has = !!p;
    if (!has) { toggle(this.stats, 'show', false); return; }
    const n = (v, d = 1) => (Number.isFinite(v) ? v : d);
    const hp = clamp01(n(p.health) / (n(p.maxHealth) || 1));
    const st = clamp01(n(p.stamina) / (n(p.maxStamina) || 1));
    const wm = clamp01(n(p.warmth));
    const en = clamp01(n(p.signEnergy));
    const sign = p.sign || 'ember';
    const thaw = G.state?.count?.('thaw') ?? 0;
    const L = this.last;

    const changed = Math.abs(hp - L.hp) > 0.002 || Math.abs(st - L.st) > 0.002 || Math.abs(wm - L.wm) > 0.002 ||
      Math.abs(en - L.en) > 0.002 || sign !== L.sign || thaw !== L.thaw;
    if (changed) this.lastChange = now;

    if (Math.abs(hp - L.hp) > 0.002) {
      const up = hp > L.hp;
      this.hp.fill.style.transform = `scaleX(${hp.toFixed(3)})`;
      if (this.hp.ghost) {
        this.hp.ghost.style.transitionDelay = up ? '0s' : '0.5s';
        this.hp.ghost.style.transform = `scaleX(${hp.toFixed(3)})`;
      }
      toggle(this.hp.el, 'low', hp < 0.3);
    }
    if (Math.abs(st - L.st) > 0.002) this.st.fill.style.transform = `scaleX(${st.toFixed(3)})`;
    if (Math.abs(wm - L.wm) > 0.002) {
      this.wm.fill.style.transform = `scaleX(${wm.toFixed(3)})`;
      toggle(this.wm.el, 'low', wm < 0.3);
      toggle(this.wm.el, 'crit', wm < 0.14);
    }
    if (sign !== L.sign) this.signEls.forEach((s) => toggle(s.el, 'active', s.id === sign));
    if (sign !== L.sign || Math.abs(en - L.en) > 0.002) {
      const act = this.signEls.find((s) => s.id === sign);
      if (act) act.en.style.transform = `scaleX(${en.toFixed(3)})`;
    }
    if (thaw !== L.thaw) {
      setText(this.thawNum, String(thaw));
      toggle(this.thaw, 'none', thaw <= 0);
    }
    L.hp = hp; L.st = st; L.wm = wm; L.en = en; L.sign = sign; L.thaw = thaw;

    const inCombat = !!(G.combat?.inCombat || p.state === 'combat');
    const calm = !inCombat && !p.swordDrawn && hp > 0.995 && st > 0.995 && wm > 0.92 && en > 0.995;
    toggle(this.stats, 'show', !calm || now - this.lastChange < CALM_AFTER);
  }

  _compass(dt, now) {
    const G = this.G;
    const cam = G.camera;
    if (!cam) return;
    const st = G.state?.data?.discovered;
    if (st && st.length !== this._discoveredN) this._rebuildLocs();
    this._objTimer -= dt;
    if (this._objTimer <= 0) { this._objTimer = 0.25; this._syncObjectives(); }

    cam.getWorldDirection(this._dir);
    const heading = (((Math.atan2(this._dir.x, -this._dir.z) * 180) / Math.PI) % 360 + 360) % 360;
    setStyle(this.tape, 'transform', `translate3d(${(-(TURN + heading * PX)).toFixed(1)}px,0,0)`);

    const pp = G.player?.position || cam.position;
    const half = (this.strip.clientWidth || 560) / 2;
    let best = null, bestAbs = 1e9;
    for (const m of this._markers.values()) {
      const dx = m.x - pp.x, dz = m.z - pp.z;
      const dist = Math.hypot(dx, dz);
      const delta = wrap180((Math.atan2(dx, -dz) * 180) / Math.PI - heading);
      let x = delta * PX;
      let op;
      if (m.kind === 'obj') {
        const lim = half - 14;
        const edge = Math.abs(x) > lim;
        x = Math.max(-lim, Math.min(lim, x));
        op = dist < 8 ? 0 : (edge ? 0.7 : 1) * (m.el.classList.contains('primary') ? 1 : 0.7);
        setText(m.dist, dist < 8 ? '' : `${Math.round(dist / 10) * 10}`);
      } else {
        op = Math.abs(x) > half + 20 ? 0 : (dist < 14 ? 0 : 0.85 - 0.55 * clamp01(dist / 800));
        if (Math.abs(delta) < 6 && dist > 14 && Math.abs(delta) < bestAbs) { best = m; bestAbs = Math.abs(delta); }
      }
      const tx = Math.round(x * 2) / 2;
      if (tx !== m.tx) { m.tx = tx; m.el.style.transform = `translate3d(${tx}px,0,0)`; }
      const o = Math.round(op * 50) / 50;
      if (o !== m.op) { m.op = o; m.el.style.opacity = o; }
    }

    // Caption: the new objective for a few seconds, otherwise the place under the caret.
    let cap = '', kind = '';
    if (this._objText && now - this._objShownAt < 7) { cap = this._objText; kind = 'obj'; } else if (best) { cap = best.name; kind = 'loc'; }
    const key = `${kind}|${cap}`;
    if (key !== this._capKey) {
      this._capKey = key;
      this.caption.textContent = cap;
      this.caption.dataset.kind = kind;
      toggle(this.caption, 'on', !!cap);
    }
  }
}
