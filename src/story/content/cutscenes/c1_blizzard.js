// C1 Blizzard Road (docs/STORY.md): the opening, about 50 s. A lone rider in a white-out reaches the
// wreck of a family's cart; the father is frozen looking back over his shoulder.
// Trigger: Flow.newGame() plays it with the player at the pass. Sets c1_seen. Ends with Vesna on foot at
// the father, Kasza ten meters up the road, the wolves about to come (the combat tutorial follows).
import { kit, passSite, seat, unseat, moveAlong, off, ground, V3, jolt, disposeProp, hold } from './_cine.js';
import * as THREE from 'three';

export default async function c1(d) {
  const G = d.G, K = kit(d);
  try {
    if (G.horse?.mounted) G.horse.dismount?.({ instant: true });
    const S = passSite(G);
    d.setup({ time: 14.5, weather: 'blizzard', music: 'pass' });
    d.fade(1, 0);
    const vesna = d.player();
    const kasza = d.horse();
    const y = S.yawF;
    const along = (s) => S.along(s);
    const pt = (s, right = 0, h = 0) => { const a = along(s); const [x, z] = off(a.x, a.z, y, right, 0); return ground(G, x, z, h); };

    // Rider and mare start well down the road, already walking while the screen is still black.
    const s0 = along(-46), sStop = along(S.stop);
    d.place(kasza, s0.x, s0.z, y);
    seat(d, vesna, kasza);
    const ride = moveAlong(d, kasza, [[s0.x, s0.z], [sStop.x, sStop.z]], { speed: 1.9, brake: 0.08, turn: 2 });
    const eye = () => vesna.eye(V3(0, 0, 0));
    const lookRider = () => eye().add(V3(0, -0.3, 0));
    const hdWorld = () => { const b = kasza.c.bones?.head; return b ? b.getWorldPosition(V3(0, 0, 0)) : kasza.at(0.9, V3(0, 0, 0)); };

    // 1. BLACK. Wind. A horse's breath.
    d.cut({ pos: pt(-35, 15, 0.7), look: pt(-34, -1, 3.4), fov: 52 });
    d.sfx('horse_snort', null, { volume: 0.35 });
    await d.wait(2.4);

    // 2. EXTREME WIDE, low, through blowing snow: the rider small on the road, the walls vanishing upward.
    d.fade(0, 2.2);
    await d.shot({ from: pt(-35, 15, 0.7), to: pt(-34, 14.2, 0.9), look: pt(-34, -1, 3.4), fov: 52, dur: 6.6, ease: 'linear', shake: 0.3 });

    // 3. MEDIUM, tracking alongside on her scarred side, head down into the wind. VESNA (low, to the horse): where they
    //    are going and why (the contract from the toll house, docs/STORY.md Q1).
    const track = d.follow(kasza, [-3.3, 1.9, 0.6], lookRider, 5.6, { lag: 2.4, fov: 36, shake: 0.35, frame: [0.16, -0.02] });
    await d.wait(1.3);
    d.say(vesna, "Keep on, girl. There's work on the other side.", 3.2);
    await track;

    // 4. CLOSE on Kasza's eye and flattened ear. She stops dead. Snorts.
    const headPos = (k) => () => { const h = hdWorld(); const yy = kasza.yaw; const L = V3(Math.cos(yy), 0, -Math.sin(yy)); const Fw = V3(Math.sin(yy), 0, Math.cos(yy)); return h.addScaledVector(L, k.l).addScaledVector(Fw, k.f).add(V3(0, k.u, 0)); };
    const closeShot = d.shot({
      from: headPos({ l: 1.0, f: 0.5, u: 0.12 }), to: headPos({ l: 0.9, f: 0.42, u: 0.12 }),
      look: headPos({ l: 0.1, f: 0.12, u: 0.07 }), fov: 27, dur: 3.4, ease: 'linear', shake: 0.25,
    });
    await ride;
    d.sfx('horse_snort');
    d.anim(kasza, 'snort');
    await closeShot;

    // 5. OVER THE SHOULDER: ahead, a dark shape in the snow. An overturned cart, a dead mule half-buried.
    const wreck = S.cart.clone().add(V3(0, 0.5, 0));
    const shoulder = () => eye().addScaledVector(V3(Math.sin(kasza.yaw), 0, Math.cos(kasza.yaw)), -2.0).addScaledVector(V3(-Math.cos(kasza.yaw), 0, Math.sin(kasza.yaw)), 0.7).add(V3(0.0, 0.5, 0));
    const shoulderTo = () => shoulder().addScaledVector(V3(Math.sin(kasza.yaw), 0, Math.cos(kasza.yaw)), 0.6);
    await d.shot({ from: shoulder, to: shoulderTo, look: wreck, fov: 38, frame: [0.16, 0.0], dur: 4.4, ease: 'sine', shake: 0.4 });

    // 6. Vesna dismounts and walks to the cart. Tracking from behind, then LOW past a frozen hand.
    const spot = V3(0, 0, 0);
    const dismount = unseat(d, vesna, kasza);
    d.cut({ pos: () => ground(G, kasza.c.root.position.x, kasza.c.root.position.z, 1.4).add(V3(Math.cos(kasza.yaw) * 5.2, 0, -Math.sin(kasza.yaw) * 5.2)).addScaledVector(V3(Math.sin(kasza.yaw), 0, Math.cos(kasza.yaw)), 1.5), look: () => kasza.at(0.75, spot), fov: 36 });
    await dismount;
    kasza.play('snort');
    vesna.c.stop?.(0.1);
    d.face(vesna, S.father, { instant: true });
    // Round the overturned cart, not through it: when it sits on her line, off its far side and in
    // along the outside of the family; the low camera waits ahead on that path, the family in the
    // foreground as she comes round.
    const route = routeAround(S, vesna.pos(V3(0, 0, 0)));
    const walk = (async () => { for (const p of route.points) await d.walk(vesna, p.x, p.z, { speed: 1.35 }); })();
    d.follow(vesna, [-1.4, 1.75, -3.6], () => vesna.at(0.78, V3(0, 0, 0)), 0, { lag: 2.2, fov: 38, shake: 0.3 });
    await d.wait(3.6);
    const low = route.low ? ground(G, route.low.x, route.low.z, 0.3) : S.lowCam;
    d.shot({ from: low, to: low.clone().add(V3(0.1, 0.04, 0.12)), look: () => vesna.at(0.8, V3(0, 0, 0)), fov: 34, frame: [0.0, 0.1], dur: route.low ? 4.2 : 3.4, ease: 'linear', shake: 0.15 });
    await walk;

    // 7. CLOSE: the father, frozen, twisted at the waist, looking back over his shoulder up the road.
    d.face(vesna, S.father);
    d.anim(vesna, 'crouch_examine', { loop: true });
    const face = S.fatherHead.clone();
    await d.shot({ from: S.faceCam, to: S.faceCam.clone().lerp(face, 0.12), look: face, fov: 26, frame: [-0.1, 0.06], dur: 5.2, ease: 'sine', shake: 0.1 });

    // 8. Vesna closes his eyes with two fingers, checks inside his coat, finds a folded letter, puts it away.
    const here = vesna.pos(V3(0, 0, 0));
    // Side-on to the two of them, 2.6 m out, on the side away from the cart.
    const mid = here.clone().lerp(S.father, 0.5).add(V3(0, 0.75, 0));
    let px = -(S.father.z - here.z), pz = S.father.x - here.x;
    const pl = Math.hypot(px, pz) || 1;
    px /= pl; pz /= pl;
    if (S.cart && (S.cart.x - mid.x) * px + (S.cart.z - mid.z) * pz > 0) { px = -px; pz = -pz; }
    const cam8 = ground(G, mid.x + px * 2.6, mid.z + pz * 2.6, 1.35);
    d.cut({ pos: cam8, look: mid, fov: 34, frame: [0, 0.04] });
    d.shot({ from: cam8, to: cam8.clone().lerp(mid, 0.1), look: mid, fov: 34, frame: [0, 0.04], dur: 6.5, ease: 'sine', shake: 0.2 });
    await d.wait(2.4);
    const letter = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.14), new THREE.MeshStandardMaterial({ color: 0xcfc3a6, roughness: 0.9 }));
    try { vesna.c.attach('handR', letter); letter.position.set(0, 0.02, 0.03); K.add(() => disposeProp(letter)); } catch { /* optional */ }
    await d.wait(2.6);
    letter.visible = false;
    await d.wait(1.2);

    // 9. Kasza snorts and sidesteps. VESNA (low, to the horse): "Easy. I know."
    d.anim(vesna, 'idle');
    const kp = along(-8.5);
    d.place(kasza, kp.x, kp.z, y + Math.PI * 0.92);
    d.face(vesna, kasza, { instant: true });
    const vp = vesna.pos(V3(0, 0, 0));
    const c9 = off(vp.x, vp.z, vesna.yaw, 0.7, 2.3);
    hold(d, { pos: ground(G, c9[0], c9[1], 1.45), look: () => vesna.eye(V3(0, 0, 0)).add(V3(0, -0.04, 0)), fov: 32, frame: [0.12, 0.05] });
    d.sfx('horse_snort', kasza);
    kasza.play('snort');
    const side = off(kp.x, kp.z, kasza.yaw, 0.9, 0);
    d.tween(kasza.c.root.position, 'x', side[0], 1.0, 'out');
    d.tween(kasza.c.root.position, 'z', side[1], 1.0, 'out');
    await d.wait(1.2);
    d.lookAt(vesna, kasza);
    await d.say(vesna, 'Easy. I know.', 2.2);
    await d.wait(1.0);

    // 10. Distant wolf howl. Then another, closer. Her head turns.
    d.sfx('wolf_howl', V3(vp.x - 70, vp.y + 4, vp.z + 40), { volume: 0.7 });
    await d.wait(2.6);
    d.lookAt(vesna, pt(-60, -20, 1.6));
    d.sfx('wolf_howl', V3(vp.x - 38, vp.y + 3, vp.z + 22), { volume: 0.95 });
    d.shot({ to: V3(c9[0], vp.y + 1.5, c9[1]).lerp(vesna.eye(V3(0, 0, 0)), 0.14), look: () => vesna.eye(V3(0, 0, 0)).add(V3(0, -0.04, 0)), dur: 3.4, ease: 'sine', shake: 0.2 });
    await d.wait(3.4);

    d.flag('c1_seen');
    const vf = vesna.pos(V3(0, 0, 0));
    d.end({ player: { x: vf.x, z: vf.z, yaw: vesna.yaw }, fadeIn: 0.6 });
    const kf = kasza.c.root.position;
    G.horse?.teleport?.(kf.x, kf.z, kasza.yaw);
    void jolt;
  } finally {
    K.run();
    if (d.G.story) { try { await unseat(d, d.player(), d.horse(), { instant: true }); } catch { /* already on foot */ } }
  }
}

// Walk points from P to Vesna's mark that keep clear of the cart, and a low camera ahead on the last
// leg. A straight walk (and the default low camera) when the cart is not on the line.
function routeAround(S, P) {
  const E = S.vesna;
  if (!S.cart) return { points: [E], low: null };
  const L = Math.hypot(E.x - P.x, E.z - P.z) || 1;
  const dx = (E.x - P.x) / L, dz = (E.z - P.z) / L, px = -dz, pz = dx;
  const t = (S.cart.x - P.x) * dx + (S.cart.z - P.z) * dz;
  const side = (S.cart.x - P.x) * px + (S.cart.z - P.z) * pz;
  if (t < 0 || t > L || Math.abs(side) > 2.6) return { points: [E], low: null };
  // Come in on the family's outer side, so the last leg never crosses them.
  const fam = [S.father, S.mother].filter(Boolean);
  const fx = fam.reduce((a, v) => a + v.x, 0) / fam.length, fz = fam.reduce((a, v) => a + v.z, 0) / fam.length;
  const sgn = (fx - P.x) * px + (fz - P.z) * pz >= 0 ? 1 : -1;
  const w1 = { x: S.cart.x + px * sgn * 3.2, z: S.cart.z + pz * sgn * 3.2 };
  const w2 = { x: E.x + px * sgn * 1.6, z: E.z + pz * sgn * 1.6 };
  const lx = w2.x - w1.x, lz = w2.z - w1.z, ll = Math.hypot(lx, lz) || 1;
  return { points: [w1, w2, E], low: { x: w2.x + (lx / ll) * 3.0, z: w2.z + (lz / ll) * 3.0 } };
}
