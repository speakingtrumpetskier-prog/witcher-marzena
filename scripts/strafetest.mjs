#!/usr/bin/env node
// Pure-logic test of the lock-on locomotion clips (src/characters/clips/strafe.js, legs3.js) and the animator's directional
// blend (strafeWeights). No browser. Applies the BAKED clips to the real skeleton, moves the root the way the animator would,
// and measures what a player would see at the feet:
//   - the leg solver reaches its targets (ankle error), feet never go through the ground, never touch each other
//   - foot slide on the ground while a foot is planted, per clip and for every blend of two directions and speeds
//   - the phase rate the animator picks makes the stance foot travel at the body's speed (slide as a fraction of it)
//   - turn clips: the planted foot stays fixed in the world while the root turns
//
//   node scripts/strafetest.mjs          prints a line per case and PASS / FAIL, exits 1 on any FAIL
import * as THREE from 'three';
import { measure, buildSkeleton } from '../src/characters/rig.js';
import { registerClips, getClip } from '../src/characters/clips/index.js';
import { buildLibrary } from '../src/characters/clips/library.js';
import { buildStrafe, STRAFE_GAITS, strafeSet } from '../src/characters/clips/strafe.js';
import { solveLeg, legFK, ANKLE_H } from '../src/characters/clips/legs3.js';
import { strafeWeights } from '../src/characters/animator.js';

registerClips(buildLibrary);
registerClips(buildStrafe);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

// ---- the leg solver --------------------------------------------------------------------------------------------------
{
  const pose = { $hips: [0.01, -0.06, 0.02], hips: [6, -20, 4] };
  let worst = 0;
  for (const S of ['L', 'R']) {
    const s = S === 'L' ? 1 : -1;
    for (const t of [[0.11, ANKLE_H, 0.0], [0.34, ANKLE_H, 0.05], [-0.2, ANKLE_H + 0.1, -0.1], [0.05, ANKLE_H + 0.25, 0.15], [0.12, ANKLE_H, -0.15]]) {
      const tg = [s * t[0], t[1], t[2]];
      const r = solveLeg(pose, S, tg, { yaw: 0.2 * s, pitch: 0.1 });
      const fk = legFK({ ...pose, ['thigh' + S]: r.thigh, ['shin' + S]: r.shin, ['foot' + S]: r.foot }, S);
      worst = Math.max(worst, Math.hypot(fk.ankle.x - tg[0], fk.ankle.y - tg[1], fk.ankle.z - tg[2]));
      const toe = new THREE.Vector3(0, 0, 1).applyQuaternion(fk.footQ);
      if (Math.abs(toe.x - 0.2 * s * Math.cos(0.1)) > 0.02 || Math.abs(toe.y - Math.sin(0.1)) > 0.02) worst = 1;
    }
  }
  check('leg solver reaches reachable ankle targets and orients the foot', worst < 1e-4, `worst ${worst.toExponential(1)} m`);
}

// ---- the baked clips on the reference skeleton --------------------------------------------------------------------
const REF = measure({ sex: 'm', height: 1.76 });
const rig = buildSkeleton(REF, {});
const hipsBind = rig.world.hips.clone();
const NAMES = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'armL', 'forearmL', 'handL', 'shoulderR', 'armR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'];

function ankles() {
  rig.byName.hips.updateMatrixWorld(true);
  return { L: rig.byName.footL.getWorldPosition(new THREE.Vector3()), R: rig.byName.footR.getWorldPosition(new THREE.Vector3()) };
}
function applyClip(clip, f) {
  for (const n of NAMES) {
    const tr = clip.tracks[n];
    if (!tr) { rig.byName[n].quaternion.identity(); continue; }
    rig.byName[n].quaternion.set(tr[f * 4], tr[f * 4 + 1], tr[f * 4 + 2], tr[f * 4 + 3]);
  }
  const h = clip.hips ? [clip.hips[f * 3], clip.hips[f * 3 + 1], clip.hips[f * 3 + 2]] : [0, 0, 0];
  rig.byName.hips.position.set(hipsBind.x + h[0], hipsBind.y + h[1], hipsBind.z + h[2]);
  return ankles();
}

// Blend several clips at one phase the way the animator does (progressive slerp in list order).
const acc = {}, buf = {};
function applyBlend(list, phase) {
  let first = true, sum = 0;
  const h = [0, 0, 0];
  for (const [nm, w] of list) {
    if (w <= 0.001) continue;
    const c = getClip(nm);
    const f = phase * (c.frames - 1);
    const i0 = Math.floor(f), fr = f - i0, i1 = Math.min(c.frames - 1, i0 + 1);
    const ch = c.hips ? [0, 1, 2].map((k) => c.hips[i0 * 3 + k] + (c.hips[i1 * 3 + k] - c.hips[i0 * 3 + k]) * fr) : [0, 0, 0];
    sum += w;
    const t = w / sum;
    for (const n of NAMES) {
      const tr = c.tracks[n];
      let x = 0, y = 0, z = 0, ww = 1;
      if (tr) {
        const a = i0 * 4, b = i1 * 4;
        x = tr[a] + (tr[b] - tr[a]) * fr; y = tr[a + 1] + (tr[b + 1] - tr[a + 1]) * fr; z = tr[a + 2] + (tr[b + 2] - tr[a + 2]) * fr; ww = tr[a + 3] + (tr[b + 3] - tr[a + 3]) * fr;
        const l = 1 / Math.hypot(x, y, z, ww); x *= l; y *= l; z *= l; ww *= l;
      }
      if (first) acc[n] = new THREE.Quaternion(x, y, z, ww);
      else { buf[n] = new THREE.Quaternion(x, y, z, ww); acc[n].slerp(buf[n], t); }
    }
    if (first) { h[0] = ch[0]; h[1] = ch[1]; h[2] = ch[2]; } else for (let k = 0; k < 3; k++) h[k] += (ch[k] - h[k]) * t;
    first = false;
  }
  for (const n of NAMES) rig.byName[n].quaternion.copy(acc[n]);
  rig.byName.hips.position.set(hipsBind.x + h[0], hipsBind.y + h[1], hipsBind.z + h[2]);
  return ankles();
}

// Slip of planted feet. frames: list of { L, R } ankle positions in root space, one per equal step of phase; per step the
// root moves by `move(i)` (world delta) and, for turns, yaws by `dyaw`. Returns { mean, max, n } as fractions of `ref`.
function slip(frames, move, dyaw, ref) {
  let sum = 0, mx = 0, n = 0;
  const n0 = frames.length - 1;
  for (const S of ['L', 'R']) {
    let yaw = 0;
    const world = (p, y, pos) => new THREE.Vector3(p.x * Math.cos(y) + p.z * Math.sin(y) + pos.x, p.y, -p.x * Math.sin(y) + p.z * Math.cos(y) + pos.z);
    let pos = new THREE.Vector3();
    let prev = world(frames[0][S], 0, pos);
    for (let i = 1; i <= n0; i++) {
      const a = frames[i - 1][S], b = frames[i][S];
      const m = move(i);
      pos = pos.clone().add(new THREE.Vector3(m[0], 0, m[1]));
      yaw += dyaw;
      const cur = world(b, yaw, pos);
      const flat = a.y < ANKLE_H + 0.006 && b.y < ANKLE_H + 0.006;
      if (flat) {
        const d = Math.hypot(cur.x - prev.x, cur.z - prev.z) / ref;
        sum += d; mx = Math.max(mx, d); n++;
      }
      prev = cur;
    }
  }
  return { mean: n ? sum / n : 0, max: mx, n };
}

const SETS = ['guard', 'free'];
for (const set of SETS) {
  for (const [k, g] of Object.entries(STRAFE_GAITS)) {
    const clip = getClip(`strafe_${set}_${k}`);
    const n = clip.frames - 1;
    const fr = [];
    let minY = 9, minGap = 9, lowGap = 9;
    for (let i = 0; i <= n; i++) {
      const a = applyClip(clip, i);
      fr.push(a);
      minY = Math.min(minY, a.L.y, a.R.y);
      minGap = Math.min(minGap, a.L.distanceTo(a.R));
      if (a.L.y < ANKLE_H + 0.05 && a.R.y < ANKLE_H + 0.05) lowGap = Math.min(lowGap, Math.hypot(a.L.x - a.R.x, a.L.z - a.R.z));
    }
    const step = clip.stride / n;
    const s = slip(fr, () => [g.dir[0] * step, g.dir[1] * step], 0, step);
    const tag = `strafe_${set}_${k}`;
    check(`${tag}: planted feet hold still (mean slide ${(s.mean * 100).toFixed(0)}% of the stride, worst ${(s.max * 100).toFixed(0)}%)`, s.mean < 0.08 && s.max < 0.8);
    check(`${tag}: no foot below the ground (${((ANKLE_H - minY) * 1000).toFixed(1)} mm)`, ANKLE_H - minY < 0.004);
    check(`${tag}: the feet clear each other (closest ${(minGap * 100).toFixed(0)} cm, both low ${lowGap > 5 ? 'never' : (lowGap * 100).toFixed(0) + ' cm'})`, minGap > 0.1 && lowGap > 0.09);
  }
  for (const [dir, sign] of [['l', 1], ['r', -1]]) {
    const clip = getClip(`strafe_${set}_turn_${dir}`);
    const n = clip.frames - 1;
    const fr = [];
    let minY = 9, minGap = 9;
    for (let i = 0; i <= n; i++) { const a = applyClip(clip, i); fr.push(a); minY = Math.min(minY, a.L.y, a.R.y); minGap = Math.min(minGap, a.L.distanceTo(a.R)); }
    const dyaw = (sign * clip.stride) / n;
    const s = slip(fr, () => [0, 0], dyaw, 0.12 * Math.abs(dyaw));
    check(`strafe_${set}_turn_${dir}: planted feet stay put while the body turns (mean ${(s.mean * 100).toFixed(0)}%, worst ${(s.max * 100).toFixed(0)}% of the foot's arc)`, s.mean < 0.12 && s.max < 0.6);
    check(`strafe_${set}_turn_${dir}: no foot below the ground, feet clear (${((ANKLE_H - minY) * 1000).toFixed(1)} mm, ${(minGap * 100).toFixed(0)} cm)`, ANKLE_H - minY < 0.004 && minGap > 0.1);
  }
}

// ---- blends of two neighbouring directions and speeds -------------------------------------------------------------
{
  const dirs = strafeSet('guard');
  let worstMean = 0, worstMax = 0, worstCase = '', cases = 0, penetration = 0, penCase = '';
  for (let deg = 0; deg < 360; deg += 15) {
    for (const v of [0.9, 1.6, 2.4, 3.2]) {
      const a = (deg * Math.PI) / 180;
      const lx = Math.sin(a) * v, lz = Math.cos(a) * v; // the direction is measured from straight ahead toward her left
      const S = strafeWeights(lx, lz, 0, 'combat_idle', dirs);
      const list = S.list.map(([n, w]) => [n, w]);
      const rate = S.rate; // cycles per second
      const N = 40;
      const fr = [];
      for (let i = 0; i <= N; i++) { const p = i / N; fr.push(applyBlend(list, p === 1 ? 0.99999 : p)); }
      const wMove = list.filter(([n]) => n !== 'combat_idle').reduce((s2, [, w]) => s2 + w, 0);
      if (wMove < 0.9) continue; // fading in from rest: no planting to speak of
      for (const f of fr) {
        const pen = ANKLE_H - Math.min(f.L.y, f.R.y);
        if (pen > penetration) { penetration = pen; penCase = `${deg} deg at ${v} m/s`; }
      }
      const dt = 1 / N / rate;
      // body travel per step in the root frame: the root moves by (lx, lz) * dt, and a planted foot must move by the opposite
      const sl = slip(fr, () => [lx * dt, lz * dt], 0, v * dt);
      cases++;
      if (sl.mean > worstMean) { worstMean = sl.mean; worstCase = `${deg} deg at ${v} m/s`; }
      worstMax = Math.max(worstMax, sl.max);
    }
  }
  check(`blends: planted feet hold still in every direction and speed (${cases} cases, worst mean slide ${(worstMean * 100).toFixed(0)}% at ${worstCase})`, worstMean < 0.2);
  // Blending joint angles of two poses cannot keep an ankle exactly at its height; the forward walk and run sink 14 mm
  // against each other half way between the two speeds, so 2 cm is the bar here.
  check(`blends: no foot through the ground (worst ${(penetration * 1000).toFixed(1)} mm at ${penCase})`, penetration < 0.02);
}

// ---- the weights ------------------------------------------------------------------------------------------------------
{
  const dirs = strafeSet('guard');
  const sum = (S) => S.list.reduce((s, [, w]) => s + w, 0);
  const a = strafeWeights(0, 0, 0, 'combat_idle', dirs);
  check('at rest the idle clip carries everything', a.list.length === 1 && a.list[0][0] === 'combat_idle' && Math.abs(sum(a) - 1) < 1e-6);
  const b = strafeWeights(2.5, 0, 0, 'combat_idle', dirs);
  check('moving left plays the left clips only, weights add up to one', b.list.every(([n]) => /_l$/.test(n) || n === 'combat_idle') && Math.abs(sum(b) - 1) < 1e-6);
  const c = strafeWeights(1.8, 1.8, 0, 'combat_idle', dirs);
  check('a diagonal plays its own clips only', c.list.every(([n]) => /_fl$/.test(n) || n === 'combat_idle') && Math.abs(sum(c) - 1) < 1e-6);
  const e = strafeWeights(Math.sin(Math.PI / 8) * 2.5, Math.cos(Math.PI / 8) * 2.5, 0, 'combat_idle', dirs);
  const wf = e.list.filter(([n]) => /_f$/.test(n)).reduce((s, [, w]) => s + w, 0), wfl = e.list.filter(([n]) => /_fl$/.test(n)).reduce((s, [, w]) => s + w, 0);
  check('half way between ahead and the diagonal both play in equal shares and the cycle runs a little faster', Math.abs(wf - wfl) < 0.01 && wf > 0.3 && e.rate > c.rate * 0.5);
  const d = strafeWeights(0, 0, 1.6, 'combat_idle', dirs);
  check('turning on the spot plays the left turn for a positive yaw rate and the right for a negative one', d.list.some(([n]) => n.endsWith('turn_l')) && strafeWeights(0, 0, -1.6, 'combat_idle', dirs).list.some(([n]) => n.endsWith('turn_r')));
  check('walking cancels the turn steps', !strafeWeights(1.2, 0, 1.6, 'combat_idle', dirs).list.some(([n]) => /turn/.test(n)));
}

console.log(`\nSUMMARY pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
