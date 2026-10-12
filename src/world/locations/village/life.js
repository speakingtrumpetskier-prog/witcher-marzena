// Life support: NPC stations, warm spots, chimney smoke, steam, forge sparks, hearth flames, light
// descriptors for fires and lanterns, and positional fire loops. See docs/ARCHITECTURE.md (NPCs, Audio).
import * as THREE from 'three';
import { ORDER } from '../../../core/G.js';
import { frame, seeded, inRect } from './util.js';
import { ROADS } from '../../layout.js';
import { SLED } from './plan.js';

const PI = Math.PI;

export async function buildLife(V) {
  const { G, fx } = V;
  const st = G.world.stations;
  const rec = (id) => V.byId[id];
  const A = (id, key) => rec(id)?.p.anchors[key];
  const quality = G.quality;

  // ---------------------------------------------------------------- stations
  const station = (id, x, z, yaw, anim, kind, extra = {}) => {
    let y = G.world.heightAt(x, z);
    // Indoor stations stand on the building floor, not on the terrain under it.
    if (extra.indoor) {
      const b = V.placed.find((r) => !r.meta.prop && inRect(x, z, r.x, r.z, r.fp.hw, r.fp.hd, r.yaw, 0.3));
      if (b) y = b.p.y + 0.05;
    }
    st[id] = { id, x, z, y, yaw, anim, kind, indoor: false, ...extra };
    return st[id];
  };

  // wood chopping: two yards
  {
    const blocks = V.dress.handles.filter((h) => h.name === 'choppingBlock' && h.built).slice(0, 4);
    blocks.forEach((h, i) => {
      if (i >= 2) return;
      // stand 0.9 m from the block toward the nearest house
      let best = null, bd = 1e9;
      for (const r of V.placed) {
        if (!r.meta.house) continue;
        const d = Math.hypot(r.x - h.x, r.z - h.z);
        if (d < bd) { bd = d; best = r; }
      }
      const ang = best ? Math.atan2(best.x - h.x, best.z - h.z) : 0;
      station(`chop_${i + 1}`, h.x + Math.sin(ang) * 0.95, h.z + Math.cos(ang) * 0.95, ang + PI, 'chop_wood', 'work');
    });
  }
  // forge
  {
    const sm = rec('smithy');
    const f = frame(sm.x, sm.z, sm.yaw);
    const an = A('smithy', 'anvil');
    const [x, z] = f.at(-0.2, 1.3);
    station('forge_smith', x, z, sm.yaw + PI, 'hammer', 'work');
    void an;
    station('smithy_apprentice', ...f.at(1.9, 1.0), sm.yaw + PI - 0.6, 'sweep', 'work');
  }
  // well
  {
    const w = V.byId.well;
    station('well_draw', w.x + 0.2, w.z + 1.7, PI, 'carry_bucket', 'work');
    station('well_talk_1', w.x - 2.8, w.z - 0.4, PI / 2 + 0.3, 'talk_1', 'talk');
    station('well_talk_2', w.x - 1.6, w.z - 0.9, -PI / 2 - 0.3, 'talk_2', 'talk');
  }
  // market stalls (vendors stand behind the counter, facing the customers)
  for (const id of ['stall_fish', 'stall_spoons', 'stall_dolls', 'stall_bread']) {
    const r = rec(id);
    const f = frame(r.x, r.z, r.yaw);
    const [x, z] = f.at(0, 0.0);
    station(`${id}_seller`, x, z, r.yaw, id === 'stall_bread' ? 'idle_cold' : 'talk_3', 'work');
    const [cx, cz] = f.at(-0.8, 1.9);
    station(`${id}_customer`, cx, cz, r.yaw + PI, 'idle_cold', 'talk');
  }
  // tavern
  {
    const t = rec('tavern');
    const f = frame(t.x, t.z, t.yaw);
    const keeper = A('tavern', 'keeper');
    station('tavern_keeper', keeper.x, keeper.z, t.yaw, 'stir', 'work', { indoor: true });
    [1, 2, 3, 4].forEach((i) => {
      const la = t.b.anchors[`table${i}`];
      const sg = i % 2 ? 1 : -1;
      const p = t.p.localToWorld(la.x + (i === 4 ? 0.7 : -0.7), 0.05, la.z + sg * 0.78);
      station(`tavern_table${i}`, p.x, p.z, t.yaw + (sg > 0 ? PI : 0), i === 2 ? 'drink' : 'sit_bench', 'sit', { indoor: true });
    });
    const [cx, cz] = f.at(-3.7, 4.4);
    station('tavern_corner_jarek', cx, cz, t.yaw + PI / 2, 'drink', 'sit', { indoor: true, night: true });
    const [bx, bz] = f.at(-3.7, 2.2);
    station('tavern_bed', bx, bz, t.yaw + PI / 2, 'lie_dead', 'bed', { indoor: true });
    const door = t.p.doors[0];
    station('tavern_door', door.x, door.z, door.yaw, 'idle', 'wander');
    // The people who live in the tavern: Zbyszek behind the bar (the dice are played across the counter), the two
    // regulars on the far bench of the middle table (src/minigames/dice). These ids are named in cast.js.
    const out = { x: door.x, z: door.z };
    station('tavern_bar', ...f.at(-1.0, -4.2), t.yaw, 'hands_hips', 'work', { indoor: true, tag: 'bar', door: out }); // across from the dice spot, clear of the mugs
    station('zbyszek_bed', ...f.at(-3.7, 2.2), t.yaw + PI / 2, 'lie_dead', 'bed', { indoor: true });
    station('tavern_porch', ...f.at(1.9, 6.15), t.yaw, 'lean_wall', 'work');
    station('wojtek_seat', ...f.at(0.2, -0.08), t.yaw, 'sit_bench', 'sit', { indoor: true, door: out });
    station('halina_seat', ...f.at(1.0, -0.08), t.yaw, 'sit_bench', 'sit', { indoor: true, door: out });
    const [o1x, o1z] = f.at(-5.2, 3.0);
    station('tavern_bench_out1', o1x, o1z, t.yaw, 'sit_bench', 'sit');
    const [o2x, o2z] = f.at(-7.0, 2.3);
    station('tavern_bench_out2', o2x, o2z, t.yaw, 'sit_bench', 'sit');
    const [dx, dz] = f.at(7.0, -1.2);
    station('drunk_snow', dx, dz, t.yaw + 0.8, 'sit_ground', 'sit');
  }
  // longhouse: the reeve at his table, the high seat, the desk
  {
    const l = rec('longhouse');
    const f = frame(l.x, l.z, l.yaw);
    station('reeve_table', ...f.at(-2.2, 2.3), l.yaw - PI / 2, 'sit_bench', 'sit', { indoor: true });
    station('reeve_chair', ...f.at(0, -1.3), l.yaw, 'sit_bench', 'sit', { indoor: true });
    station('reeve_desk', ...f.at(0.6, -l.fp.hd + 2.3), l.yaw, 'stir', 'work', { indoor: true });
    station('reeve_porch', ...f.at(-2.4, l.fp.hd + 1.6), l.yaw, 'cross_arms', 'talk');
    station('reeve_bed', ...f.at(3.9, -4.2), l.yaw, 'lie_dead', 'bed', { indoor: true });
    const lg = A('longhouse', 'ledger');
    station('ledger_desk', lg.x, lg.z + 0.7, 0, 'stir', 'work', { indoor: true });
  }
  // Hanka
  {
    const h = rec('hanka');
    const f = frame(h.x, h.z, h.yaw);
    station('hanka_loom', ...f.at(-0.9, 0.45), h.yaw, 'stir', 'work', { indoor: true });
    station('hanka_table', ...f.at(-0.9, 0.3), h.yaw, 'sit_bench', 'sit', { indoor: true });
    station('hanka_bed', ...f.at(-h.fp.hw + 0.7, 1.2), h.yaw + PI / 2, 'lie_dead', 'bed', { indoor: true });
    station('ola_bed', ...f.at(-h.fp.hw + 0.7, -h.fp.hd + 1.4), h.yaw + PI / 2, 'lie_dead', 'bed', { indoor: true });
    const d = h.p.doors[0];
    station('hanka_door', d.x, d.z, d.yaw, 'idle', 'wander');
    const m = A('hanka', 'milk');
    station('hanka_milk', m.x, m.z - 4.2, h.yaw + PI, 'kneel_idle', 'work');
    station('hanka_laundry', ...f.at(-4.6, 3.0), h.yaw, 'stir', 'work');
  }
  // Dobra's workshop
  {
    const w = rec('workshop');
    const f = frame(w.x, w.z, w.yaw);
    const bench = A('workshop', 'bench');
    station('dobra_work', bench.x, bench.z, w.yaw + PI / 2, 'stir', 'work', { indoor: true });
    station('dobra_doorway', ...f.at(0, w.fp.hd - 0.6), w.yaw, 'cross_arms', 'talk');
    const y = V.yard;
    for (let i = 0; i < 4; i++) {
      const a = (i / 7) * PI * 2 + 0.4 + 0.5;
      const x = y.x + Math.cos(a) * 2.3, z = y.z + Math.sin(a) * 2.3;
      station(`dobra_child${i + 1}`, x, z, Math.atan2(y.x - x, y.z - z), i === 0 ? 'child_play' : 'sit_ground', 'sit');
    }
    station('workshop_loft', ...f.at(0, -w.fp.hd + 1.6), w.yaw, 'idle', 'wander', { indoor: true });
  }
  // shrine
  {
    const s = rec('shrine');
    const f = frame(s.x, s.z, s.yaw);
    station('shrine_pray', ...f.at(0, -1.55), s.yaw + PI, 'pray', 'work');
    station('shrine_gate', ...f.at(0, 7.4), s.yaw, 'idle', 'wander');
  }
  // banya
  {
    const b = rec('banya');
    const f = frame(b.x, b.z, b.yaw);
    station('banya_bench', ...f.at(b.fp.hw - 0.9, -0.6), b.yaw - PI / 2, 'sit_bench', 'sit', { indoor: true });
    const d = b.p.doors[0];
    station('banya_door', d.x, d.z, d.yaw, 'idle', 'wander');
  }
  // porch benches for the elders
  for (const r of V.placed) {
    if (!r.meta.house || !r.meta.o?.porch) continue;
    const d = r.p.doors.find((q) => q.id === 'front') || r.p.doors[0];
    const f = frame(d.x, d.z, d.yaw);
    const sg = r.id.length % 2 ? 1 : -1;
    const [x, z] = f.at(sg * 1.2, 0.9);
    station(`porch_bench_${r.id}`, x, z, d.yaw, 'sit_bench', 'sit');
  }
  // snow shoveling at two doorsteps, beds in every house, doors to wander to
  {
    let n = 0;
    for (const r of V.placed) {
      if (!r.meta.house) continue;
      const d = r.p.doors.find((q) => q.id === 'front') || r.p.doors[0];
      const f = frame(d.x, d.z, d.yaw);
      station(`bed_${r.id}`, r.x, r.z, r.yaw, 'lie_dead', 'bed', { indoor: true, hidden: true });
      station(`door_${r.id}`, d.x, d.z, d.yaw, 'idle', 'wander');
      if (n < 3 && (r.id.charCodeAt(1) % 3 === 0)) { station(`shovel_${++n}`, ...f.at(-1.6, 2.4), d.yaw + 0.8, 'sweep', 'work'); }
    }
  }
  // laundry lines
  {
    const lines = V.dress.handles.filter((h) => h.name === 'laundryLine' && h.built).slice(0, 2);
    lines.forEach((h, i) => station(`laundry_${i + 1}`, h.x, h.z + 1.1, PI, 'stir', 'work'));
  }
  // fish racks and nets
  {
    const racks = V.dress.handles.filter((h) => h.name === 'dryingRack' && h.built && h.z < 80).slice(0, 3);
    racks.forEach((h, i) => station(`fishrack_${i + 1}`, h.x + 1.1, h.z + 1.0, Math.atan2(-1.1, -1.0), 'stir', 'work'));
    const nets = V.dress.handles.filter((h) => h.name === 'net' && h.o.opts?.variant === 'heap' && h.built).slice(0, 3);
    // the third heap is Jarek's (cast.js), the other two go to the ambient net menders
    nets.forEach((h, i) => station(i === 2 ? 'jarek_net' : `net_mend_${i + 1}`, h.x + 0.6, h.z - 0.9, 0.6, 'mend_net', 'work'));
    const stools = V.dress.handles.filter((h) => h.name === 'fishingStool' && h.built && h.o.snap !== false).slice(0, 4);
    stools.forEach((h, i) => station(`hut_stool_${i + 1}`, h.x, h.z, PI, 'fish_ice', 'work'));
  }
  // animals and the horse
  {
    const gs = rec('goat_shed');
    const f = frame(gs.x, gs.z, gs.yaw);
    const roof = gs.b.info?.roof?.ridgeY ?? 2.6;
    station('goat_roof', gs.x, gs.z, gs.yaw, 'idle', 'wander', { animal: 'goat', y: gs.p.y + roof + 0.25, roof: true });
    station('goat_pen', ...f.at(1.2, 3.8), gs.yaw + 1, 'idle', 'wander', { animal: 'goat' });
    station('goat_pen2', ...f.at(-2.4, 4.8), gs.yaw - 1, 'idle', 'wander', { animal: 'goat' });
    const coop = V.dress.handles.find((h) => h.name === 'chickenCoop' && h.built);
    station('chicken_coop', coop ? coop.x + 1.2 : -49, coop ? coop.z + 1.2 : 153, 0, 'idle', 'wander', { animal: 'chicken' });
    const kennel = V.dress.handles.find((h) => h.name === 'dogKennel' && h.built);
    if (kennel) station('dog_kennel', kennel.x + 1.0, kennel.z + 0.8, 0, 'idle', 'wander', { animal: 'dog' });
    const hs = rec('s3');
    station('cat_roof', hs.x, hs.z, hs.yaw, 'idle', 'wander', { animal: 'cat', y: hs.p.y + (hs.b.info?.roof?.ridgeY ?? 4) + 0.15, roof: true });
    const stb = rec('stable');
    const sf = frame(stb.x, stb.z, stb.yaw);
    station('stable_kasza', ...sf.at(stb.fp.hw + 2.6, 0), stb.yaw + PI / 2, 'idle', 'wander', { animal: 'horse' });
    station('stable_hitch', ...sf.at(stb.fp.hw + 1.4, 3.2), stb.yaw + PI / 2, 'lean_wall', 'work');
  }
  // gate and street life
  {
    const g = rec('gate_west');
    const gf = frame(g.x, g.z, g.yaw);
    station('gate_guard', ...gf.at(-3.1, -1.6), g.yaw, 'lean_wall', 'work');
    station('gate_outside', ...gf.at(0, 6.5), g.yaw + PI, 'idle', 'wander');
    const sq = frame(0, 118, 0);
    [[-4, 6, 'talk_1'], [-3, 7.2, 'talk_2'], [14, -3, 'talk_2'], [13, -4.2, 'talk_1']].forEach(([lx, lz, a], i) => {
      const [x, z] = sq.at(lx, lz);
      station(`square_talk_${i + 1}`, x, z, i % 2 ? PI / 2 : -PI / 2, a, 'talk');
    });
  }
  // sledding hill and the fort
  {
    const [tx, tz] = SLED.top, [bx, bz] = SLED.bottom;
    for (let i = 0; i < 4; i++) station(`sled_kid${i + 1}`, tx + (bx - tx) * (0.08 + i * 0.1) + i * 1.1, tz + (bz - tz) * (0.08 + i * 0.1), Math.atan2(bx - tx, bz - tz), 'child_play', 'work');
    station('sled_watch', bx + 6.2, bz - 1.2, -PI / 2, 'warm_hands', 'sit');
    const fort = V.shore.fort;
    station('kids_fort', fort.x, fort.z + 0.2, PI, 'sit_ground', 'sit');
  }
  // the named people's own places (cast.js). Without these NPC.js made a spot up near the person's anchor, and
  // Dobra ate her lunch sitting on thin air beside her workshop.
  {
    const alias = (id, from, extra = {}) => { if (st[from]) st[id] = { ...st[from], id, ...extra }; };
    // The nearest point to (x, z) with no prop within r and no collider: barrels, sacks and buckets have no
    // collision, so a person stood on the raw spot would stand in them.
    const clearOf = (x, z, r = 1.0) => {
      const props = V.dress.handles.filter((h) => h.built && Math.abs(h.x - x) < 6 && Math.abs(h.z - z) < 6);
      const v = new THREE.Vector3();
      const ok = (px, pz) => {
        if (!props.every((h) => Math.hypot(h.x - px, h.z - pz) >= r)) return false;
        v.set(px, G.world.heightAt(px, pz), pz);
        G.physics?.resolve(v, 0.35);
        return Math.hypot(v.x - px, v.z - pz) < 0.02;
      };
      if (ok(x, z)) return [x, z];
      for (let d = 0.5; d <= 3; d += 0.5) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
          if (ok(px, pz)) return [px, pz];
        }
      }
      return [x, z];
    };
    const front = (id) => {
      const r = rec(id);
      const d = r && (r.p.doors.find((q) => q.id === 'front') || r.p.doors[0]);
      return d ? frame(d.x, d.z, d.yaw) : null;
    };
    // Hanka on her step first thing; Ola plays in front of the house
    const hf = front('hanka');
    if (hf) {
      station('hanka_porch', ...clearOf(...hf.at(-0.9, 1.2), 0.8), hf.yaw, 'warm_hands', 'work');
      station('ola_porch', ...clearOf(...hf.at(1.7, 2.8)), hf.yaw + PI, 'child_play', 'work');
    }
    // Bogdan: his table and bed in the longhouse, a look over the square, the notice board after his dinner
    alias('bogdan_table', 'reeve_table');
    alias('bogdan_bed', 'reeve_bed', { kind: 'bed', hidden: true });
    const w = rec('well');
    const [sx, sz] = clearOf(w.x + 3.2, w.z + 2.6);
    station('bogdan_square', sx, sz, Math.atan2(w.x - sx, w.z - sz), 'hands_hips', 'work');
    const nb = rec('noticeBoard');
    if (nb) {
      const [bx, bz] = clearOf(...frame(nb.x, nb.z, nb.yaw).at(2.0, 2.1));
      station('notice_board', bx, bz, Math.atan2(nb.x - bx, nb.z - bz), 'cross_arms', 'work');
    }
    // Dobra sleeps in her hut and takes her midday break on its step
    alias('dobra_bed', 'bed_dobra_hut', { kind: 'bed', hidden: true });
    const df = front('dobra_hut');
    if (df) station('dobra_porch', ...clearOf(...df.at(0, 2.0), 0.8), df.yaw, 'warm_hands', 'work');
    // Jarek: the third net heap (above), a stool on the boardwalk in the afternoon, the tavern corner at night,
    // and the tavern's spare bed when he has had enough
    const stool = V.dress.handles.filter((h) => h.name === 'fishingStool' && h.built && h.o.snap === false).sort((a, b) => b.x - a.x)[0];
    if (stool) station('jarek_dock', stool.x, stool.z, PI, 'sit_bench', 'sit');
    alias('tavern_corner', 'tavern_corner_jarek');
    alias('jarek_bed', 'tavern_bed', { kind: 'bed', hidden: true });
  }

  // wander nodes along the roads so ambient villagers can walk between stations
  {
    const rng = seeded('wander');
    let n = 0;
    for (const r of ROADS) {
      if (!['pass', 'mill', 'village_north', 'village_south', 'village_west', 'shore'].includes(r.id)) continue;
      for (const [x, z] of r.pts) {
        if (Math.hypot(x, z - 115) > 100 || z < 50) continue;
        station(`wander_${n++}`, x + (rng() - 0.5) * 1.0, z + (rng() - 0.5) * 1.0, rng() * 6, 'idle', 'wander');
      }
    }
  }

  // ---------------------------------------------------------------- warm spots
  const warm = (x, z, r, extra = {}) => { G.world.fires.push({ x, z, r, ...extra }); };
  {
    const hearth = (id, key, r, extra) => { const a = A(id, key); if (a) warm(a.x, a.z, r, extra); };
    hearth('tavern', 'hearth', 5.5, { id: 'tavern_hearth' });
    hearth('longhouse', 'hearth', 5, { id: 'longhouse_hearth' });
    hearth('smithy', 'forge', 4.5, { id: 'forge' });
    hearth('banya', 'hearth', 5, { id: 'banya_hearth', hot: true });
    hearth('shrine', 'fire', 5, { id: 'shrine_fire' });
    // interiors count as warm (out of the wind)
    for (const rm of V.rooms) warm(rm.x, rm.z, Math.min(rm.hw, rm.hd) * 0.9, { id: `room_${rm.id}`, indoor: true });
    for (const fp of V.fireProps) {
      if (fp.h.built) warm(fp.h.x, fp.h.z, fp.r, { id: fp.id });
    }
  }

  // ---------------------------------------------------------------- light descriptors for props
  for (const h of V.dress.lanterns || []) {
    const a = h.anchors?.light;
    if (!a) continue;
    V.lightHandles.push(V.lights.add({ x: a.x, y: a.y, z: a.z, color: 0xffb060, intensity: 0.85, radius: 7.5, kind: 'lantern' }));
  }
  for (const fp of V.fireProps) {
    const a = fp.h.anchors?.fire || fp.h.anchors?.flame;
    if (!a) continue;
    V.lightHandles.push(V.lights.add({ x: a.x, y: a.y + 0.4, z: a.z, color: 0xff9040, intensity: fp.big ? 2.2 : fp.torch ? 0.9 : 1.6, radius: fp.big ? 12 : fp.torch ? 7 : 9, kind: 'fire', importance: 1.2 }));
  }

  // ---------------------------------------------------------------- smoke, steam, sparks, hearth flames
  if (fx) {
    const q = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
    let n = 0;
    const live = [];
    for (const r of V.placed) {
      if (!r.meta.inhabited) continue;
      const a = r.p.anchors[r.meta.smokeKey || 'smoke'];
      if (!a) continue;
      if (q < 1 && r.meta.house && (n++ % (quality === 'low' ? 2 : 4)) === 3) continue;
      const rate = (r.meta.smokeRate ?? 1.4) * (0.8 + (r.x * 0.013 % 0.4));
      const sm = G.world.addSmoke([a.x, a.y, a.z], { height: r.meta.hero ? 26 : 22, rate: rate * 0.9, size: 1.0, opacity: r.id === 'smithy' ? 0.44 : 0.34, color: r.id === 'smithy' ? [0.34, 0.33, 0.35] : undefined });
      if (!sm) continue;
      V.emitters.push(sm.emitter);
      live.push(sm);
    }
    V.smoke = live;
    // smithy: hot forge flames and sparks at the anvil
    const sm = rec('smithy');
    const forge = sm.p.anchors.forge, anvil = sm.p.anchors.anvil;
    V.emitters.push(fx.fire({ position: [forge.x, forge.y - 0.05, forge.z], parent: G.scene, scale: 0.55, radius: 0.5, height: 0.8, smoke: false, light: false }));
    V.emitters.push(fx.sparks({ position: [anvil.x, anvil.y + 0.1, anvil.z], parent: G.scene, every: [1.2, 3.0], count: 16 }));
    // hearth flames: tavern, banya, shrine fire pit, longhouse (low, the reeve saves wood)
    const flame = (id, key, o) => {
      const a = A(id, key);
      if (!a) return;
      V.emitters.push(fx.fire({ position: [a.x, a.y + 0.05, a.z], parent: G.scene, smoke: false, light: false, ...o }));
    };
    flame('tavern', 'hearth', { scale: 0.62, radius: 0.5, height: 0.9 });
    flame('banya', 'hearth', { scale: 0.35, radius: 0.3, height: 0.5 });
    flame('shrine', 'fire', { scale: 1.3, radius: 0.5, height: 1.0, smoke: true });
    flame('longhouse', 'hearth', { scale: 0.28, radius: 0.35, height: 0.4 });
    // banya steam: from the door and the roof vent
    const b = rec('banya');
    V.emitters.push(fx.steam({ position: [b.p.anchors.steam.x, b.p.anchors.steam.y, b.p.anchors.steam.z], parent: G.scene, height: 5, rate: 5, spread: 0.45 }));
    V.emitters.push(fx.steam({ position: [b.p.anchors.steamRoof.x, b.p.anchors.steamRoof.y, b.p.anchors.steamRoof.z], parent: G.scene, height: 9, rate: 4, spread: 0.5, size: 1.4 }));
    // the plunge tub steams a little too
    const tub = V.dress.named.plunge_tub;
    if (tub?.built) V.emitters.push(fx.steam({ position: [tub.x, tub.y + 0.75, tub.z], parent: G.scene, height: 2.5, rate: 2.5, spread: 0.25, opacity: 0.25 }));
  }

  // ---------------------------------------------------------------- fire loops (audio comes up after locations load)
  if (!G.shot) {
    const spots = [];
    const hearthLoop = (id, key, vol) => { const a = A(id, key); if (a) spots.push({ pos: new THREE.Vector3(a.x, a.y, a.z), vol }); };
    hearthLoop('tavern', 'hearth', 0.8);
    hearthLoop('longhouse', 'hearth', 0.35);
    hearthLoop('smithy', 'forge', 0.9);
    hearthLoop('banya', 'hearth', 0.7);
    hearthLoop('shrine', 'fire', 0.9);
    for (const fp of V.fireProps) if (fp.h.anchors?.fire) spots.push({ pos: fp.h.anchors.fire.clone(), vol: fp.big ? 0.9 : 0.6 });
    const tav = rec('tavern');
    const murmur = { pos: new THREE.Vector3(tav.x, tav.p.y + 1.4, tav.z), vol: 0.5, name: 'crowd_murmur' };
    V.audioSpots = [...spots, murmur];
    let done = false;
    G.addSystem('village-audio', () => {
      if (done || !G.audio?.loop) return;
      done = true;
      V.loops = V.audioSpots.map((s) => G.audio.loop(s.name || 'fire_crackle', { pos: s.pos, volume: s.vol }));
    }, ORDER.late);
  }
}
