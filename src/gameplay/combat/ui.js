// Enemy UI: a thin health bar over the locked target (or the enemy you last struck), and one
// bar at the top of the screen for a boss, with her name. DOM overlay on #ui-root, no per-frame
// layout work beyond two transforms. Restrained like the rest of the HUD: hairlines, bone-white
// type with a dark halo, folk red only for health.
//
//   const ui = new EnemyUi(combat);   ui.update(dt) each frame after the camera
//   ui.boss(enemy | null)             show / hide the boss bar (enemy.name, health, maxHealth, yieldAt)
//   ui.dispose()
import * as THREE from 'three';
import { G } from '../../core/G.js';
import { centerOf, isLive, posOf } from './geom.js';

const CSS = `
.mzc-layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 11; }
.mzc-tag { position: absolute; left: 0; top: 0; width: 96px; margin-left: -48px; opacity: 0; transition: opacity 0.25s ease; will-change: transform; text-align: center; }
.mzc-tag.on { opacity: 1; }
.mzc-name { font: 600 10px/12px var(--mz-body, Georgia, serif); letter-spacing: 0.18em; text-transform: uppercase; color: rgba(246, 241, 230, 0.86); text-shadow: 0 1px 2px rgba(4,6,10,0.95), 0 0 6px rgba(4,6,10,0.85); margin-bottom: 3px; white-space: nowrap; }
.mzc-bar { position: relative; height: 3px; background: rgba(6, 8, 12, 0.55); box-shadow: 0 0 0 1px rgba(4, 6, 10, 0.5), 0 0 8px rgba(4, 6, 10, 0.45); }
.mzc-bar > i { position: absolute; inset: 0; transform-origin: left center; will-change: transform; }
.mzc-bar .fill { background: linear-gradient(90deg, #8c2a1e, #c4402f); transition: transform 0.14s ease-out; }
.mzc-bar .ghost { background: rgba(240, 226, 206, 0.7); transition: transform 0.7s ease-out 0.45s; }
.mzc-tag.burn .fill { background: linear-gradient(90deg, #a2501c, #e08a38); }
.mzc-boss { position: absolute; left: 50%; top: 74px; width: min(520px, 54vw); transform: translateX(-50%); opacity: 0; transition: opacity 0.9s ease; text-align: center; }
.mzc-boss.on { opacity: 1; }
.mzc-boss .mzc-name { font: 600 17px/20px var(--mz-serif, Georgia, serif); letter-spacing: 0.42em; padding-left: 0.42em; color: rgba(236, 246, 250, 0.92); margin-bottom: 7px; text-shadow: 0 1px 2px rgba(4,6,10,0.95), 0 0 10px rgba(120, 220, 235, 0.35), 0 0 18px rgba(4,6,10,0.8); }
.mzc-boss .mzc-bar { height: 4px; }
.mzc-boss .mzc-bar .fill { background: linear-gradient(90deg, #86c6d6, #cfeff5); }
.mzc-boss .mzc-bar .tick { position: absolute; top: -2px; bottom: -2px; width: 1px; background: rgba(236, 230, 218, 0.4); }
.mzc-boss.armor .mzc-bar { box-shadow: 0 0 0 1px rgba(150, 220, 240, 0.55), 0 0 10px rgba(110, 210, 235, 0.45); }
`;

const _v = new THREE.Vector3();

export class EnemyUi {
  constructor(combat) {
    this.combat = combat;
    this.root = document.getElementById('ui-root') || document.body;
    this.layer = document.createElement('div');
    this.layer.className = 'mz-layer mzc-layer';
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.root.appendChild(this.layer);

    this.tag = this._makeTag();
    this.tagTarget = null;
    this.tagHold = 0; // seconds the last-struck enemy stays shown
    this.lastHit = null;
    this.tagShown = false;
    this.tagLast = { x: -999, y: -999, fill: -1, ghost: -1 };

    this.bossEl = document.createElement('div');
    this.bossEl.className = 'mzc-boss';
    this.bossName = document.createElement('div');
    this.bossName.className = 'mzc-name';
    this.bossBar = document.createElement('div');
    this.bossBar.className = 'mzc-bar';
    this.bossGhost = document.createElement('i');
    this.bossGhost.className = 'ghost';
    this.bossFill = document.createElement('i');
    this.bossFill.className = 'fill';
    this.bossBar.append(this.bossGhost, this.bossFill);
    this.bossEl.append(this.bossName, this.bossBar);
    this.layer.appendChild(this.bossEl);
    this.bossE = null;
    this.bossLast = { fill: -1, armor: null };
    this.offs = [];
  }

  _makeTag() {
    const el = document.createElement('div');
    el.className = 'mzc-tag';
    const name = document.createElement('div');
    name.className = 'mzc-name';
    const bar = document.createElement('div');
    bar.className = 'mzc-bar';
    const ghost = document.createElement('i');
    ghost.className = 'ghost';
    const fill = document.createElement('i');
    fill.className = 'fill';
    bar.append(ghost, fill);
    el.append(name, bar);
    this.layer.appendChild(el);
    return { el, name, bar, ghost, fill };
  }

  // The combat module tells us who was struck so the bar appears even without a lock.
  noteHit(e) {
    this.lastHit = e;
    this.tagHold = 2.6;
  }

  boss(e) {
    this.bossE = e || null;
    if (e) {
      this.bossName.textContent = e.name || 'Wiesia';
      this.bossShown = false;
      // Threshold ticks: where the phases change and where she yields.
      for (const old of this.bossBar.querySelectorAll('.tick')) old.remove();
      for (const f of [0.66, 0.33, e.yieldAt ?? 0.25]) {
        const t = document.createElement('span');
        t.className = 'tick';
        t.style.left = `${f * 100}%`;
        this.bossBar.appendChild(t);
      }
    } else { this.bossEl.classList.remove('on'); this.bossShown = false; }
  }

  update(dt) {
    const P = G.player;
    // Boss bar.
    const B = this.bossE;
    if (B) {
      const show = !!(B.engaged && !B.yielded && B.alive !== false);
      if (show !== this.bossShown) { this.bossShown = show; this.bossEl.classList.toggle('on', show); }
      const f = Math.max(0, Math.min(1, B.health / B.maxHealth));
      if (Math.abs(f - this.bossLast.fill) > 0.0005) {
        this.bossLast.fill = f;
        this.bossFill.style.transform = `scaleX(${f.toFixed(4)})`;
        this.bossGhost.style.transform = `scaleX(${f.toFixed(4)})`;
      }
      const armor = !!B.armored;
      if (armor !== this.bossLast.armor) {
        this.bossLast.armor = armor;
        this.bossEl.classList.toggle('armor', armor);
      }
    }

    // Floating tag: locked target first, then the last enemy struck.
    let target = P?.target && isLive(P.target) ? P.target : null;
    if (target?.isBoss) target = null; // the boss has her own bar
    if (!target && this.tagHold > 0 && isLive(this.lastHit) && !this.lastHit.isBoss) target = this.lastHit;
    this.tagHold = Math.max(0, this.tagHold - dt);
    const tg = this.tag;
    if (!target || !G.camera) {
      if (this.tagShown) { tg.el.classList.remove('on'); this.tagShown = false; }
      this.tagTarget = null;
      return;
    }
    if (target !== this.tagTarget) {
      this.tagTarget = target;
      tg.name.textContent = target.name || '';
      tg.name.style.display = target.name ? '' : 'none';
      this.tagLast.fill = -1;
    }
    // Project the head.
    const c = centerOf(target, _v);
    const top = posOf(target).y + (target.height ?? 1.2) + 0.28;
    c.y = top;
    c.project(G.camera);
    const onScreen = c.z < 1 && Math.abs(c.x) < 1.05 && Math.abs(c.y) < 1.05;
    if (!onScreen) { if (this.tagShown) { tg.el.classList.remove('on'); this.tagShown = false; } return; }
    const w = window.innerWidth, h = window.innerHeight;
    const x = Math.round((c.x * 0.5 + 0.5) * w), y = Math.round((-c.y * 0.5 + 0.5) * h);
    if (x !== this.tagLast.x || y !== this.tagLast.y) {
      this.tagLast.x = x; this.tagLast.y = y;
      tg.el.style.transform = `translate3d(${x}px, ${y - 24}px, 0)`;
    }
    const f = Math.max(0, Math.min(1, target.health / (target.maxHealth || 1)));
    if (Math.abs(f - this.tagLast.fill) > 0.001) {
      this.tagLast.fill = f;
      tg.fill.style.transform = `scaleX(${f.toFixed(4)})`;
      tg.ghost.style.transform = `scaleX(${f.toFixed(4)})`;
    }
    tg.el.classList.toggle('burn', !!target.burning);
    if (!this.tagShown) { tg.el.classList.add('on'); this.tagShown = true; }
  }

  dispose() {
    for (const off of this.offs) off();
    this.layer.remove();
    this.style.remove();
  }
}
