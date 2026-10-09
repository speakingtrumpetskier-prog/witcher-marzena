// Snow Fight (side_snow, docs/STORY.md "Snow Fight"): the morning after the tower, Ola and two other
// children ambush Vesna on the sledding hill. A short, forgiving snowball game, then Ola on a sled
// asking whether drowning hurts (ola_snowfight_after).
//
//   Staging     on the dawn, Ola walks to the hill and two more children (temporary NPCs with a day schedule at
//               the sled stations) are put there; they are real NPCs, paused only while the fight runs.
//   The fight   LMB throws (aim assist toward the kid nearest the camera's line); a throw is a clip with a
//               release event and a ball on a short arc (G.npcs.snow); the children throw back with a visible
//               wind-up (the clip) and a call, aimed at where she stands, so moving or dodging makes them miss.
//   Score       first to 6 hits, or 60 seconds. Nobody loses anything.
//   After       Ola sits on the sled at the foot of the hill and asks; truth or lie sets ola_truth / ola_lie.
//   G.storyCtl.snowfight  { active, score, start(), end(), throwBall(), kids } for tests and scripts
import * as THREE from 'three';
import { makeSnowball } from '../../gameplay/npcs/tools.js';

const HIT_TO_WIN = 6;
const FIGHT_SECS = 60;
const KID_LINES = ["You're Marzanna!", "No, you are!", 'Witch! Do your eyes glow?', 'If you look back she gets you!'];
const HIT_LINES = ['Got you!', 'Ow!', 'Again!', 'Marzanna!'];

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export function install(C) {
  const { G } = C;
  const hill = C.V.sledHill;
  if (!hill) return;
  const BOTTOM = { x: -43.5, z: 210.5 };

  const SF = {
    active: false, kids: [], ola: null, temp: [], score: { vesna: 0, kids: 0 }, t: 0, cool: 0,
    staged: false, ball: null, started: false,
    stats: { released: 0, launched: 0, landed: 0, kidReleased: 0, kidLanded: 0 },
  };
  C.snowfight = SF;

  const rand = (a, b) => a + Math.random() * (b - a);
  const eligible = () => C.has('dawn_done') && C.has('lair_seen') && C.day() >= 2 && C.hour() >= 7.4 && C.hour() < 18.5
    && !C.has('snowfight_done') && !C.has('rite_started') && !C.busy() && !SF.active;

  // ---- staging ---------------------------------------------------------------------------------
  function stage() {
    if (SF.staged || !G.npcs) return;
    SF.staged = true;
    const kid = (id, preset, at) => {
      if (G.npcs.get(id)) return G.npcs.get(id);
      return G.npcs.spawn({
        id, preset, name: 'Child', child: true, hardy: 0.5,
        schedule: [
          { from: 18.5, to: 7.4, at: 'bed_s6', hidden: true },
          { from: 7.4, to: 18.5, at },
        ],
      });
    };
    // Two more children, playing near the foot of the hill (inline stations: a spot, a pose).
    const play = (x, z, yaw) => ({ kind: 'work', x, z, yaw, anim: 'child_play' });
    SF.temp = [kid('sf_kid_1', 'child_c', play(BOTTOM.x - 5.5, BOTTOM.z + 3, 1.2)), kid('sf_kid_2', 'child_d', play(BOTTOM.x + 1.5, BOTTOM.z + 7, 2.6))];
    const ola = G.npcs.get('ola');
    if (ola) ola.goTo({ x: hill.x - 5, z: hill.z + 4, yaw: 1.2, anim: 'child_play' });
  }
  C.watch('dawn_done', () => C.later(3, stage));
  C.restore(() => { if (C.has('dawn_done') && !C.has('snowfight_done') && C.day() >= 2) C.later(3, stage); });
  // Ola goes home when the day's play is over (or the save she was staged for is gone).
  function unstage() {
    const ola = G.npcs?.get('ola');
    if (ola && !SF.active && !ola.paused) ola.release();
    SF.staged = false;
  }
  let ut = 0;
  G.addSystem('ctl-snowfight-evening', (dt) => {
    ut += dt;
    if (ut < 3) return;
    ut = 0;
    if (SF.staged && !SF.active && (C.hour() >= 18.5 || C.has('rite_started'))) unstage();
  }, 20);

  // ---- the fight --------------------------------------------------------------------------------
  const kidChar = (k) => k.npc.character;
  const kidPos = (k, out = _v) => out.copy(kidChar(k).root.position);

  function facePlayer(k) {
    const p = C.ppos(), c = kidChar(k);
    c.yaw = Math.atan2(p.x - c.root.position.x, p.z - c.root.position.z);
  }

  function say(k, text) {
    k.npc.bark(text);
  }

  function groundOk(x, z) {
    if (G.world.isLake?.(x, z)) return false;
    return !(G.physics?.query?.(x, z, 0.8)?.length);
  }

  // Three places about 10 m from the player, on open ground, spread across the hill side.
  function slots() {
    const p = C.ppos();
    const base = Math.atan2(hill.x - p.x, hill.z - p.z);
    const out = [];
    for (const off of [-0.8, 0.1, 0.9]) {
      for (let tries = 0; tries < 8; tries++) {
        const a = base + off + (tries ? rand(-0.5, 0.5) : 0), r = rand(8.5, 12) + tries * 0.4;
        const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
        if (groundOk(x, z)) { out.push({ x, z }); break; }
      }
    }
    while (out.length < 3) out.push({ x: p.x + (out.length - 1) * 5, z: p.z + 9 });
    return out;
  }

  async function start() {
    if (SF.active || SF.started) return;
    if (G.player?.mounted) G.player.dismountInstant?.();
    SF.started = true;
    stage();
    const ola = G.npcs.get('ola');
    const npcs = [ola, ...SF.temp].filter(Boolean);
    if (!G.quests.rec('side_snow')) G.quests.start('side_snow');
    // Sheathe, and let the children get near if they are still on their way.
    G.player?.moves?.toggleSword?.(false);
    await C.until(() => npcs.every((n) => n._c && Math.hypot(n.position.x - hill.x, n.position.z - hill.z) < 40), 6);
    const spots = slots();
    SF.kids = npcs.map((n, i) => ({ npc: n, anchor: spots[i], next: rand(1.2, 2.4) + i * 0.6, move: rand(1.5, 3), busy: false, vx: 0, vz: 0 }));
    for (const [i, k] of SF.kids.entries()) {
      k.npc.pause(true);
      const c = kidChar(k);
      // Anyone still far from the hill is brought to their spot at the edge of her sight; the rest run to theirs.
      const far = Math.hypot(c.root.position.x - k.anchor.x, c.root.position.z - k.anchor.z);
      if (far > 30) c.setPosition(k.anchor.x, k.anchor.z);
      else if (far > 4) { c.walkTo(k.anchor.x, k.anchor.z, { run: true }); k.move = far / 3.4 + 1; }
      else c.play('child_play', { loop: true, fade: 0.3 });
      k.spawnedAt = i;
    }
    SF.score = { vesna: 0, kids: 0 };
    SF.t = 0;
    SF.cool = 0;
    SF.active = true;
    C.running.add('snowfight');
    C.notify('Snow fight', 'info');
    C.hint([['LMB', 'Throw'], ['Move', 'Dodge']], 12);
    const first = SF.kids[0];
    if (first) { facePlayer(first); say(first, 'Hunter! You\'re Marzanna!'); throwAtPlayer(first); }
  }

  function chestOf(k, out) {
    const c = kidChar(k);
    return out.copy(c.root.position).setY(c.root.position.y + c.height * 0.62);
  }

  function launch(from, to, onLand) {
    return G.npcs?.snow?.launch?.(from, to, onLand);
  }

  // ---- the children throw ---------------------------------------------------------------------
  function throwAtPlayer(k) {
    const c = kidChar(k);
    if (k.busy) return;
    k.busy = true;
    facePlayer(k);
    const ball = makeSnowball();
    c.attach('handR', ball);
    const done = () => { c.detach(ball); k.busy = false; };
    let released = false;
    c.play('throw_snowball', {
      loop: false, fade: 0.12,
      onEvent: (ev) => {
        if (ev !== 'release' || released) return;
        released = true;
        SF.stats.kidReleased++;
        c.detach(ball);
        facePlayer(k);
        const P = G.player;
        const from = c.sockets.handR.getWorldPosition(_v).clone();
        // Where she stands now, a little off: standing still gets hit, moving gets a miss.
        const to = new THREE.Vector3(P.position.x + rand(-0.5, 0.5), P.position.y + 1.1, P.position.z + rand(-0.5, 0.5));
        launch(from, to, (land) => {
          if (!SF.active) return;
          SF.stats.kidLanded++;
          const dx = P.position.x - land.x, dz = P.position.z - land.z;
          // Only a dodge or a roll saves her: snowballs do not hurt, so god mode does not count.
          const act = P.moves?.act;
          const rolled = !!(act && act.i && act.t >= act.i[0] && act.t <= act.i[1]);
          if (Math.hypot(dx, dz) < 1.1 && !rolled) {
            SF.score.kids++;
            G.postfx?.flash?.(0xe8f2ff, 0.14);
            G.cameraRig?.shake?.(0.08, 0.15);
            C.sfx('snowball_hit', { volume: 0.7 });
            C.notify(`Hit. ${SF.score.vesna} to ${SF.score.kids}`, 'info');
            say(k, HIT_LINES[Math.floor(rand(0, HIT_LINES.length))]);
            C.sfx('child_laugh', { volume: 0.5 });
          }
        });
      },
    }).then(() => {
      if (!released) { c.detach(ball); }
      done();
      if (SF.active) c.play('child_play', { loop: true, fade: 0.3 });
    });
    if (Math.random() < 0.5) say(k, KID_LINES[Math.floor(rand(0, KID_LINES.length))]);
  }

  // ---- Vesna throws ---------------------------------------------------------------------------------
  // throwBall({ target }) throws at a given child (tests, scripts); by hand the child nearest the camera's
  // line within about 45 degrees is taken, otherwise the ball goes straight ahead.
  function throwBall(opts = {}) {
    const P = G.player;
    if (!SF.active || !P || SF.cool > 0) return false;
    SF.cool = 0.8;
    const c = P.character;
    const camYaw = G.cameraRig ? G.cameraRig.yaw : P.yaw;
    let best = opts.target || null, bestScore = 1e9;
    if (!best) {
      for (const k of SF.kids) {
        kidPos(k, _w);
        const dx = _w.x - P.position.x, dz = _w.z - P.position.z, d = Math.hypot(dx, dz);
        let ang = Math.atan2(dx, dz) - camYaw;
        ang = Math.atan2(Math.sin(ang), Math.cos(ang));
        if (Math.abs(ang) > 0.8 || d > 28) continue;
        const score = Math.abs(ang) * 9 + d * 0.15;
        if (score < bestScore) { bestScore = score; best = k; }
      }
    }
    const aim = best ? (kidPos(best, _w), Math.atan2(_w.x - P.position.x, _w.z - P.position.z)) : camYaw;
    P.yaw = aim;
    const ball = makeSnowball();
    c.attach('handR', ball);
    let released = false;
    c.playUpper('throw_snowball', {
      loop: false, fade: 0.1,
      onEvent: (ev) => {
        if (ev !== 'release' || released) return;
        released = true;
        SF.stats.released++;
        c.detach(ball);
        const from = c.sockets.handR.getWorldPosition(new THREE.Vector3());
        let to;
        if (best) {
          chestOf(best, _w);
          // Lead a moving child by the time the ball takes (the arc in Snowballs.launch: distance / 9, at least 0.35 s).
          const T = Math.max(0.35, from.distanceTo(_w) / 9);
          to = _w.clone().add(_v.set(rand(-0.3, 0.3) + (best.vx || 0) * T, rand(-0.1, 0.15), rand(-0.3, 0.3) + (best.vz || 0) * T));
        } else {
          to = new THREE.Vector3(P.position.x + Math.sin(aim) * 9, P.position.y + 0.1, P.position.z + Math.cos(aim) * 9);
        }
        // Children dodge about a quarter of the time: they see it coming.
        if (best && Math.random() < 0.25 && !best.busy) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const c2 = kidChar(best);
          c2.walkTo(c2.root.position.x + Math.cos(aim) * 1.8 * side, c2.root.position.z - Math.sin(aim) * 1.8 * side, { run: true });
        }
        if (launch(from, to, (land) => {
          if (!SF.active) return;
          SF.stats.landed++;
          for (const k of SF.kids) {
            kidPos(k, _w);
            if (Math.hypot(_w.x - land.x, _w.z - land.z) < 1.15) {
              SF.score.vesna++;
              kidChar(k).gesture('hit_flinch');
              C.sfx('snowball_hit', { volume: 0.6 });
              C.sfx('child_laugh', { volume: 0.55 });
              C.notify(`Hit! ${SF.score.vesna} to ${SF.score.kids}`, 'info');
              say(k, HIT_LINES[Math.floor(rand(0, HIT_LINES.length))]);
              break;
            }
          }
        })) SF.stats.launched++;
      },
    });
    setTimeout(() => { if (!released) c.detach(ball); }, 1800);
    return true;
  }

  // ---- the loop ----------------------------------------------------------------------------------
  G.addSystem('ctl-snowfight', (dt) => {
    if (!SF.active) return;
    const P = G.player;
    if (G.input?.context === 'game' && G.input.pressed('attack') && P) { P._swallow = true; throwBall(); }
    SF.t += dt;
    SF.cool = Math.max(0, SF.cool - dt);
    for (const k of SF.kids) {
      const c = kidChar(k);
      // Velocity for aiming ahead of a moving child.
      const cp = c.root.position;
      if (k.px != null && dt > 0) { k.vx += ((cp.x - k.px) / dt - k.vx) * Math.min(1, dt * 8); k.vz += ((cp.z - k.pz) / dt - k.vz) * Math.min(1, dt * 8); }
      k.px = cp.x; k.pz = cp.z;
      if (!k.busy) {
        k.next -= dt;
        k.move -= dt;
        if (k.next <= 0) { k.next = rand(2.0, 3.6); throwAtPlayer(k); }
        else if (k.move <= 0) {
          k.move = rand(2, 3.6);
          const tx = k.anchor.x + rand(-3, 3), tz = k.anchor.z + rand(-3, 3);
          if (groundOk(tx, tz)) c.walkTo(tx, tz, { run: true });
        }
      }
      if (!k.busy && c.speed < 0.3) facePlayer(k);
    }
    const far = C.dist(hill.x, hill.z) > 75;
    if (SF.score.vesna >= HIT_TO_WIN || SF.score.kids >= HIT_TO_WIN || SF.t >= FIGHT_SECS || far) {
      end(far).catch((e) => { console.error('[snowfight]', e); G.errors.push(`snowfight: ${e.message}`); SF.active = false; });
    }
  }, -1);

  async function end(aborted = false) {
    if (!SF.active) return;
    SF.active = false;
    const kids = SF.kids;
    const olaNpc = G.npcs.get('ola');
    if (aborted) {
      for (const k of kids) { k.npc.pause(false); k.npc.release(); }
      SF.kids = [];
      SF.started = false;
      C.running.delete('snowfight');
      return;
    }
    C.sfx('child_laugh', { volume: 0.7 });
    for (const k of kids) { k.busy = false; kidChar(k).play('child_play', { loop: true, fade: 0.3 }); }
    G.ui?.hint?.(null);
    await C.sleep(1.4);
    // Ola goes and sits on the sled at the foot of the hill; the others go back to their game.
    const oc = olaNpc.character;
    for (const k of kids) if (k.npc !== olaNpc) { k.npc.pause(false); k.npc.release(); }
    await Promise.race([oc.walkTo(BOTTOM.x, BOTTOM.z, { run: true }), C.sleep(7)]);
    oc.setPosition(BOTTOM.x, BOTTOM.z);
    oc.yaw = 1.57;
    oc.play('sit_ground', { loop: true, fade: 0.4 });
    await C.sleep(0.6);
    C.running.delete('snowfight');
    // The dialogue stages the two of them.
    await C.talk('ola_snowfight_after', { actors: { ola: oc } });
    if (!C.has('ola_truth') && !C.has('ola_lie')) C.set('ola_truth');
    C.set('snowfight_done');
    olaNpc.pause(false);
    olaNpc.release();
    SF.kids = [];
  }

  // The ambush: she comes down by the sledding hill in the daytime after the tower.
  C.zone({
    id: 'snowfight', x: BOTTOM.x, z: BOTTOM.z, r: 20,
    enabled: eligible,
    onEnter: () => { start().catch((e) => { console.error('[snowfight]', e); G.errors.push(`snowfight: ${e.message}`); SF.started = false; SF.active = false; }); },
  });
  // Left unfinished (she walked off, died, reloaded): the children go back to what they were doing.
  C.on('player:respawn', () => { if (SF.active) end(true); });
  C.on('loaded', () => { if (SF.active) end(true); SF.started = false; unstage(); });

  SF.start = start;
  SF.end = end;
  SF.throwBall = throwBall;
  SF.eligible = eligible;
}
