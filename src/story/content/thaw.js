// The thaw: a reusable world transformation for the endings (docs/STORY.md endings A and B).
//
//   await thaw(G, d, { speed = 1, gentle = false, tower = true, birds = true, hours = 7.6, startHour, water = true })
//   await shatterIce(G, d, { x, z, radius })       the ring of cracks racing out from a point (ending A)
//   sinkTower(G, d, { dur })                       the drowned bell tower leans and goes under (ending A)
//
// thaw() animates uSnowCover 1 to 0, then uSpring 0 to 1, G.water.setThaw 0 to 1, weather to clear,
// the clock on through dawn (the day rolls over), birdsong at intervals and the 'thaw' music.
// gentle (ending B) is slower and quieter: a long soft dawn, the music ducked, no bell tower sinking.
// Everything goes through the story scheduler, so a cutscene skip jumps it to the end state:
// snow gone, spring in, open water, clear weather, the clock at `hours`.
// Resolves when the transformation is done (the caller usually runs it in parallel with its shots).
import * as THREE from 'three';
import { LOC } from '../../world/layout.js';

const rand = (a, b) => a + Math.random() * (b - a);

export async function thaw(G, d, { speed = 1, gentle = false, tower = true, birds = true, hours = 7.6, startHour = null, water: openWater = true } = {}) {
  const S = G.story.sched;
  const k = gentle ? 1.7 : 1;
  const T = (secs) => (secs * k) / speed;
  const U = G.uniforms;

  // The sky first: the storm lets go.
  G.weather?.set?.('clear', d.skipping ? 0 : T(10));
  if (G.weather && 'auto' in G.weather) G.weather.auto = false;
  d.music('thaw', { fade: gentle ? 6 : 3 });
  if (gentle) G.audio?.duck?.(0.4, T(30));

  // The clock runs through the rest of the night to the morning after (the day rolls over once).
  // The clock may jump to the small hours first, so the time-lapse spends its seconds on the dawn.
  if (startHour != null) {
    if (startHour < G.time.hours) G.time.day += 1;
    G.time.hours = startHour;
  }
  const h0 = G.time.hours, day0 = G.time.day;
  const target = hours < h0 ? hours + 24 : hours;
  const span = target - h0;
  const clock = S.tween({
    dur: T(gentle ? 34 : 24), ease: 'sine',
    step: (u) => {
      const h = h0 + span * u;
      G.time.hours = h % 24;
      G.time.day = day0 + Math.floor(h / 24);
    },
  }).then(() => { G.time.setHours(hours % 24); G.time.day = day0 + (target >= 24 ? 1 : 0); });

  // Snow slides off, then the green; the lake opens in between.
  const snow = d.uniform('uSnowCover', 0, T(14), 'inOut');
  const spring = d.wait(T(9)).then(() => d.uniform('uSpring', 1, T(14), 'inOut'));
  // openWater false keeps the lake frozen (people still stand on it); the caller opens it later.
  const water = openWater ? d.wait(T(5)).then(() => S.tween({ dur: T(16), ease: 'inOut', step: (u) => G.water?.setThaw?.(u) })) : Promise.resolve();

  // Birds come back with the light.
  const song = birds ? birdsong(G, d, T(34), gentle) : Promise.resolve();
  const sink = tower && !gentle ? sinkTower(G, d, { dur: T(10) }) : Promise.resolve();

  await Promise.all([clock, snow, spring, water, song, sink]);
  if (openWater) G.water?.setThaw?.(1);
  U.uSnowCover.value = 0;
  U.uSpring.value = 1;
}

async function birdsong(G, d, total, gentle) {
  const cam = G.camera;
  let t = 0;
  await d.wait(total * 0.25);
  while (t < total * 0.75 && !d.skipping) {
    const gap = rand(gentle ? 1.6 : 0.9, gentle ? 3.4 : 2.2);
    await d.wait(gap);
    t += gap;
    d.sfx('bird', () => cam.position.clone().add(new THREE.Vector3(rand(-22, 22), rand(3, 10), rand(-22, 22))), { volume: gentle ? 0.5 : 0.75 });
  }
}

// ---- the ring of cracks (ending A) ------------------------------------------------------------------
export async function shatterIce(G, d, { x, z, radius = 70, dur = 3.2 } = {}) {
  const S = G.story.sched;
  d.sfx('ice_crack', { x, y: 0, z });
  G.postfx?.flash?.(0xdff6ff, 0.5);
  await S.tween({
    dur, ease: 'out',
    step: (u) => G.water?.setCracks?.(x, z, 6 + radius * u, Math.min(1, 0.3 + u * 0.8)),
  });
}

// ---- the bell tower goes under (ending A) --------------------------------------------------------------
// Collects the kit tower and the dressing the wilderness builder placed around it, then leans and sinks it.
export function towerParts(G) {
  const parts = new Set();
  const A = G.world?.locations?.bellTower;
  if (A?.placed?.root) parts.add(A.placed.root);
  if (A?.stairs?.seated?.group) parts.add(A.stairs.seated.group);
  if (A?.stairs?.standing?.group) parts.add(A.stairs.standing.group);
  for (const o of G.scene.children) {
    if (/bell ?tower|wild:bellTower/i.test(o.name || '') && !/crack|drowned/i.test(o.name)) parts.add(o);
  }
  return [...parts];
}

export function sinkTower(G, d, { dur = 10, depth = 24 } = {}) {
  const S = G.story.sched;
  const parts = towerParts(G);
  if (!parts.length) return Promise.resolve();
  const L = LOC.bellTower;
  const start = parts.map((p) => ({ y: p.position.y, rz: p.rotation.z, rx: p.rotation.x }));
  const leanAxis = new THREE.Vector3(L.x - LOC.village.x, 0, L.z - LOC.village.z).normalize();
  let rang = false;
  return S.tween({
    dur, ease: 'inOut',
    step: (u) => {
      const sink = u * u * depth;
      parts.forEach((p, i) => {
        p.position.y = start[i].y - sink;
        // The whole tower leans away from the village as it goes; baked groups rotate about the origin,
        // so they only get the sink (the lean would swing them across the lake).
        if (p === parts[0]) { p.rotation.z = start[i].rz + leanAxis.x * 0.16 * u; p.rotation.x = start[i].rx - leanAxis.z * 0.16 * u; }
      });
      if (!rang && u > 0.55) { rang = true; d.sfx('bell_under_ice', { x: L.x, y: 2, z: L.z }); }
    },
    done: () => parts.forEach((p) => { p.visible = false; }),
  });
}
