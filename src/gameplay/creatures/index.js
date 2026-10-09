// Creatures: G.creatures (docs/ARCHITECTURE.md "Combat and creatures").
//
//   G.creatures.spawnWolves(x, z, count = 3, { alpha, engaged, yaw, spread, aggro }) -> [wolf]   (array has .pack)
//   G.creatures.spawnEffigy(x, z, { dormant, yaw, scale, hpMul }) -> effigy       rises from a snow drift unless dormant
//   G.creatures.spawnEffigyRing(x, z, count, radius, opts) -> [effigy]            a ring of dormant ones (the ice camp)
//   G.creatures.spawnBear(x, z, { sleeping = true, yaw }) -> bear
//   G.creatures.spawnBoss(x, z, { emerge, passive, phase, yaw, hpMul }) -> boss   (see boss.js)
//   G.creatures.wolves / effigies / bears / boss      live lists
//   G.creatures.all()    every creature      G.creatures.clear()    dispose them all      G.creatures.remove(c)
// Every creature registers itself with G.combat. Per frame: ORDER.ai updates AI and animation.
import { G, ORDER } from '../../core/G.js';
import { Wolf, WolfPack } from './wolf.js';
import { Effigy } from './effigy.js';
import { Bear } from './bear.js';
import { Boss } from './boss.js';

class Creatures {
  constructor() {
    this.wolves = [];
    this.packs = [];
    this.effigies = [];
    this.bears = [];
    this.boss = null;
    this._errored = new Set();
  }

  all() {
    return [...this.wolves, ...this.effigies, ...this.bears, ...(this.boss ? [this.boss] : [])];
  }

  _add(c) {
    G.combat?.register?.(c);
    return c;
  }

  spawnWolves(x, z, count = 3, opts = {}) {
    const out = [];
    const spread = opts.spread ?? 3.2;
    const yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.6;
      const r = i === 0 ? 0 : spread * (0.55 + Math.random() * 0.6);
      const w = new Wolf(x + Math.sin(a) * r, z + Math.cos(a) * r, { yaw: yaw + (Math.random() - 0.5) * 1.2, aggro: opts.aggro, sleepy: opts.sleepy });
      G.scene.add(w.root);
      this._add(w);
      this.wolves.push(w);
      out.push(w);
    }
    if (opts.alpha) {
      const a = new Wolf(x + Math.sin(yaw) * spread * 1.2, z + Math.cos(yaw) * spread * 1.2, { alpha: true, yaw, aggro: opts.aggro });
      G.scene.add(a.root);
      this._add(a);
      this.wolves.push(a);
      out.push(a);
    }
    const pack = new WolfPack(out);
    this.packs.push(pack);
    out.pack = pack;
    if (opts.engaged) for (const w of out) w.engage();
    return out;
  }

  spawnEffigy(x, z, opts = {}) {
    const e = new Effigy(x, z, opts);
    G.scene.add(e.root);
    if (!opts.dormant) this._add(e);
    this.effigies.push(e);
    return e;
  }

  spawnEffigyRing(x, z, count = 5, radius = 9, opts = {}) {
    const out = [];
    const a0 = opts.angle ?? Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = a0 + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const r = radius * (0.9 + Math.random() * 0.2);
      out.push(this.spawnEffigy(x + Math.sin(a) * r, z + Math.cos(a) * r, { dormant: true, yaw: a + Math.PI, ...opts }));
    }
    return out;
  }

  spawnBear(x, z, opts = {}) {
    const b = new Bear(x, z, opts);
    G.scene.add(b.root);
    this._add(b);
    this.bears.push(b);
    return b;
  }

  spawnBoss(x, z, opts = {}) {
    if (this.boss) this.boss.dispose();
    const b = new Boss(x, z, opts);
    this.boss = b;
    this._add(b);
    G.combat?.setBoss?.(b);
    if (opts.phase && opts.phase > 1) b.setPhase(opts.phase);
    if (opts.emerge) b.emerge();
    return b;
  }

  remove(c) {
    for (const list of [this.wolves, this.effigies, this.bears]) {
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
    }
    if (this.boss === c) this.boss = null;
    c.dispose();
  }

  clear() {
    for (const c of this.all()) c.dispose();
    this.wolves.length = 0; this.effigies.length = 0; this.bears.length = 0; this.packs.length = 0;
    this.boss = null;
  }

  // ---- frame -----------------------------------------------------------------------------------------------------
  _safe(fn, who) {
    try { fn(); } catch (e) {
      if (!this._errored.has(who)) { this._errored.add(who); console.error(`[creatures ${who}]`, e); G.errors.push(`creatures ${who}: ${e.message}`); }
    }
  }

  update(dt) {
    for (const p of this.packs) this._safe(() => p.update(dt), 'pack');
    for (const w of this.wolves) this._safe(() => w.update(dt), 'wolf');
    for (const e of this.effigies) this._safe(() => e.update(dt), 'effigy');
    for (const b of this.bears) this._safe(() => b.update(dt), 'bear');
    if (this.boss) this._safe(() => { this.boss.update(dt); this.boss.fxUpdate(dt); }, 'boss');
    // Drop what disposed itself (corpses that finished fading).
    this.wolves = this.wolves.filter((w) => !w.disposed);
    this.effigies = this.effigies.filter((e) => !e.disposed);
    this.bears = this.bears.filter((b) => !b.disposed);
    if (this.boss?.disposed) this.boss = null;
    if (this.packs.length > 8) this.packs = this.packs.filter((p) => p.wolves.some((w) => !w.disposed));
  }

}

export async function init(G_) {
  const C = new Creatures();
  G_.creatures = C;
  G_.addSystem('creatures', (dt) => C.update(dt), ORDER.ai);
}

export { Wolf, WolfPack, Effigy, Bear, Boss };
