// Transient screen overlays: subtitles, barks, notifications, interaction prompt, letterbox,
// full-screen fade and the big title card. Each is a DOM element built once and toggled by
// class, so none of it costs layout per frame (barks use transforms only).
//
// Public (re-exported on G.ui by UI.js): subtitle, bark, notify, prompt, letterbox, fade, titleCard.
import * as THREE from 'three';
import { h, svg, markup, clear, wait, raf2, clamp01 } from './dom.js';
import { ICON } from './icons.js';
import { displayName } from './content.js';

const THREAD_PATH = 'M2 7 C 38 2, 84 10, 140 5 S 232 3, 298 6';

const NOTIFY_ICON = {
  journal: ICON.quill, quest: ICON.quill, location: ICON.diamond, coin: ICON.coin, item: ICON.flask,
  note: ICON.scroll, save: ICON.knot, info: ICON.info,
};

export class Overlays {
  constructor(G, root) {
    this.G = G;
    this.root = root;
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this._tmp = new THREE.Vector3();
    this.lbOn = false;
    this._build();
    G.events.on('resize', ({ w, h: hh }) => { this.vw = w; this.vh = hh; });
  }

  _build() {
    const L = (cls) => h('div', { class: `mz-layer ${cls}` });
    // Order here is stacking order (later = above).
    this.lbLayer = L('mz-lb');
    this.lbTop = h('div', { class: 'mz-lb-bar top' });
    this.lbBot = h('div', { class: 'mz-lb-bar bot' });
    this.lbLayer.append(this.lbTop, this.lbBot);

    // One soft bottom gradient shared by everything that sits at the bottom (subtitles, hold prompt,
    // choices) so white snow never swallows white text.
    this.scrimLayer = L('mz-scrimlayer');
    this.scrimEl = h('div', { class: 'mz-scrim' });
    this.scrimLayer.append(this.scrimEl);
    this._scrimKeys = new Set();
    this.barkLayer = L('mz-barks');
    this.subLayer = L('mz-sublayer');
    this.subName = h('div', { class: 'mz-sub-name' });
    this.subText = h('div', { class: 'mz-sub-text' });
    this.sub = h('div', { class: 'mz-sub' }, this.subName, this.subText);
    this.subLayer.append(this.sub);

    this.promptLayer = L('mz-promptlayer');
    this.promptEl = h('div', { class: 'mz-prompt' });
    this.promptLayer.append(this.promptEl);

    this.noteLayer = L('mz-notify');
    this.fadeLayer = L('mz-fade');
    this.fadeBlack = h('div', { class: 'mz-fade-c black' });
    this.fadeWhite = h('div', { class: 'mz-fade-c white' });
    this.fadeLayer.append(this.fadeBlack, this.fadeWhite);

    this.cardLayer = L('mz-card');
    this.cardTitle = h('div', { class: 'mz-card-title' });
    this.cardThread = svg(`<svg viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true"><path d="${THREAD_PATH}" pathLength="1"/></svg>`, 'mz-card-thread');
    this.cardKnot = svg(ICON.knot, 'mz-card-knot');
    this.cardSub = h('div', { class: 'mz-card-sub' });
    this.cardBox = h('div', { class: 'mz-card-box' }, this.cardTitle, h('div', { class: 'mz-card-line' }, this.cardThread, this.cardKnot), this.cardSub);
    this.cardLayer.append(this.cardBox);

    this.root.append(this.lbLayer, this.scrimLayer, this.barkLayer, this.subLayer, this.promptLayer, this.noteLayer, this.fadeLayer, this.cardLayer);

    this.barks = [];
    this._subToken = 0;
    this._subTimer = 0;
    this._lastNotify = new Map();
    this._promptKey = null;
    this._fadeTimer = 0;
  }

  // ---- Subtitles -------------------------------------------------------------------------
  // subtitle(speaker, text, seconds) or subtitle(text). subtitle(null) hides. Returns a Promise
  // that resolves when the line has gone (timeout or replaced).
  subtitle(speaker, text, seconds) {
    if (arguments.length === 1 && speaker != null) { text = speaker; speaker = null; }
    if (text == null || text === '') { this.hideSubtitle(); return Promise.resolve(); }
    const token = ++this._subToken;
    clearTimeout(this._subTimer);
    const name = displayName(speaker);
    this.subName.textContent = name;
    this.sub.classList.toggle('has-name', !!name);
    clear(this.subText).appendChild(markup(text));
    // Replay the small entrance animation on every new line.
    this.sub.classList.remove('on', 'pulse');
    void this.sub.offsetWidth;
    this.sub.classList.add('on', 'pulse');
    this.scrim('sub', true);
    const dur = seconds === 0 || seconds == null
      ? Math.min(9, Math.max(2.4, 1.5 + String(text).length * 0.055))
      : seconds;
    return new Promise((resolve) => {
      this._subResolve?.();
      this._subResolve = resolve;
      if (Number.isFinite(dur)) {
        this._subTimer = setTimeout(() => { if (token === this._subToken) this.hideSubtitle(); }, dur * 1000);
      }
    });
  }

  hideSubtitle() {
    clearTimeout(this._subTimer);
    this.sub.classList.remove('on', 'pulse');
    this.scrim('sub', false);
    this._subResolve?.();
    this._subResolve = null;
  }

  scrim(key, on) {
    if (on) this._scrimKeys.add(key); else this._scrimKeys.delete(key);
    this.scrimEl.classList.toggle('on', this._scrimKeys.size > 0);
  }

  // ---- Barks (floating name + line near a world position) ---------------------------------
  // pos: Vector3 | {x,y,z} | Object3D (a Character root gets +height) | () => Vector3.
  bark(name, text, pos) {
    if (!text) return;
    const el = h('div', { class: 'mz-bark' },
      name ? h('div', { class: 'mz-bark-name' }, displayName(name)) : null,
      h('div', { class: 'mz-bark-text' }, markup(text)));
    this.barkLayer.appendChild(el);
    const life = Math.min(7, Math.max(2.4, 1.4 + String(text).length * 0.06));
    const b = { el, pos, age: 0, life, x: -9999, y: -9999, vis: 0, opacity: -1 };
    this.barks.push(b);
    while (this.barks.length > 5) this._dropBark(this.barks[0]);
  }

  _dropBark(b) {
    b.el.remove();
    const i = this.barks.indexOf(b);
    if (i >= 0) this.barks.splice(i, 1);
  }

  _resolveBark(p, out) {
    if (!p) return null;
    if (typeof p === 'function') p = p();
    if (!p) return null;
    if (p.isObject3D) {
      p.getWorldPosition(out);
      out.y += p.userData?.barkHeight ?? p.userData?.height ?? 1.95;
      return out;
    }
    if (p.root?.isObject3D) {
      p.root.getWorldPosition(out);
      out.y += p.height ?? 1.95;
      return out;
    }
    if (p.isVector3) return out.copy(p);
    if (typeof p.x === 'number') return out.set(p.x, p.y ?? 0, p.z ?? 0);
    return null;
  }

  updateBarks(dt) {
    if (!this.barks.length) return;
    const cam = this.G.camera;
    cam.updateMatrixWorld();
    const hw = this.vw / 2, hh = this.vh / 2;
    for (let i = this.barks.length - 1; i >= 0; i--) {
      const b = this.barks[i];
      b.age += dt;
      if (b.age > b.life + 0.5) { this._dropBark(b); continue; }
      const p = this._resolveBark(b.pos, this._tmp);
      let op = Math.min(1, b.age / 0.25) * Math.min(1, (b.life - b.age) / 0.45 + 0.0001);
      if (!p) op = 0;
      else {
        const dist = cam.position.distanceTo(p);
        p.project(cam);
        const behind = p.z > 1 || p.z < -1;
        op *= behind ? 0 : 1 - clamp01((dist - 16) / 14);
        if (!behind) {
          const x = Math.round((p.x * hw + hw) * 2) / 2;
          const y = Math.round((-p.y * hh + hh) * 2) / 2;
          if (x !== b.x || y !== b.y) {
            b.x = x; b.y = y;
            b.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
          }
        }
      }
      op = Math.max(0, Math.min(1, op));
      if (Math.abs(op - b.opacity) > 0.01) { b.opacity = op; b.el.style.opacity = op.toFixed(2); }
    }
  }

  // ---- Notifications (top right) ----------------------------------------------------------
  notify(text, kind = 'info') {
    if (!text) return;
    const now = performance.now();
    const last = this._lastNotify.get(text);
    if (last && now - last < 2500) return; // duplicate sources (quests, events) collapse
    this._lastNotify.set(text, now);
    if (this._lastNotify.size > 24) this._lastNotify.delete(this._lastNotify.keys().next().value);
    const icon = svg(NOTIFY_ICON[kind] || NOTIFY_ICON.info, 'mz-note-ico');
    const el = h('div', { class: `mz-note k-${kind}` }, h('span', { class: 'mz-note-text' }, text), icon, h('i', { class: 'mz-note-thread' }));
    this.noteLayer.appendChild(el);
    while (this.noteLayer.children.length > 4) this.noteLayer.firstChild.remove();
    raf2().then(() => el.classList.add('on'));
    setTimeout(() => {
      el.classList.remove('on');
      el.classList.add('off');
      setTimeout(() => el.remove(), 900);
    }, 4200);
  }

  // ---- Interaction prompt -----------------------------------------------------------------
  // prompt('[E] Read  Notice Board') or prompt({ key, verb, label }) or prompt(null).
  prompt(spec) {
    let key = null, verb = '', label = '';
    if (spec && typeof spec === 'object') ({ key = 'E', verb = '', label = '' } = spec);
    else if (typeof spec === 'string' && spec) {
      const m = /^\[([^\]]+)\]\s*(.*)$/.exec(spec);
      let rest = spec;
      if (m) { key = m[1]; rest = m[2]; } else key = 'E';
      const parts = rest.split(/\s{2,}/);
      if (parts.length >= 2) { verb = parts[0]; label = parts.slice(1).join(' '); }
      else {
        const sp = rest.indexOf(' ');
        if (sp > 0 && /^[A-Z][a-z]+$/.test(rest.slice(0, sp))) { verb = rest.slice(0, sp); label = rest.slice(sp + 1); } else label = rest;
      }
    }
    const sig = key == null ? null : `${key}|${verb}|${label}`;
    if (sig === this._promptKey) return;
    this._promptKey = sig;
    if (sig == null) { this.promptEl.classList.remove('on'); return; }
    clear(this.promptEl);
    this.promptEl.append(
      h('span', { class: 'mz-key' + (/hold/i.test(key) ? ' wide' : '') }, key),
      verb ? h('span', { class: 'mz-verb' }, verb) : null,
      label ? h('span', { class: 'mz-lbl' }, label) : null,
    );
    this.promptEl.classList.add('on');
  }

  // ---- Letterbox --------------------------------------------------------------------------
  letterbox(on = true, seconds = 0.9) {
    on = !!on;
    this.lbOn = on;
    this.lbLayer.style.setProperty('--mz-lb-dur', `${seconds}s`);
    document.documentElement.style.setProperty('--mz-lb', on ? 'var(--mz-lb-size)' : '0px');
    this.lbLayer.classList.toggle('on', on);
    this.root.classList.toggle('lb-on', on);
    return wait(seconds * 1000);
  }

  // ---- Fade -------------------------------------------------------------------------------
  // fade('black' | 'white' | 'clear', seconds). Also accepts 0/false/'in' (clear) and 1/true/'out' (black).
  fade(to = 'black', seconds = 1) {
    let layer = 'black', alpha = 1;
    if (to === 'white') layer = 'white';
    else if (to === 'black' || to === 'out' || to === true || to === 1) layer = 'black';
    else if (to === 'clear' || to === 'in' || to === 'none' || to == null || to === false || to === 0) alpha = 0;
    else if (typeof to === 'number') alpha = clamp01(to);
    const dur = Math.max(0, Number(seconds) || 0);
    const set = (c, a) => {
      c.style.transitionDuration = `${dur}s`;
      c.style.opacity = String(a);
    };
    if (alpha === 0) { set(this.fadeBlack, 0); set(this.fadeWhite, 0); }
    else if (layer === 'white') { set(this.fadeWhite, alpha); set(this.fadeBlack, 0); }
    else { set(this.fadeBlack, alpha); set(this.fadeWhite, 0); }
    this.faded = alpha > 0.5;
    return dur > 0 ? wait(dur * 1000) : raf2();
  }

  // ---- Title card -------------------------------------------------------------------------
  // titleCard(title, sub) -> Promise resolved when it has faded out.
  async titleCard(title, sub = '', opts = {}) {
    const hold = opts.hold ?? 3.4;
    this.cardTitle.textContent = title;
    this.cardSub.textContent = sub || '';
    this.cardBox.classList.toggle('no-sub', !sub);
    this.cardLayer.classList.remove('on', 'draw', 'off');
    void this.cardLayer.offsetWidth;
    this.cardLayer.classList.add('on');
    await wait(500);
    this.cardLayer.classList.add('draw');
    await wait((1.6 + hold) * 1000);
    this.cardLayer.classList.add('off');
    await wait(1700);
    this.cardLayer.classList.remove('on', 'draw', 'off');
  }
}
