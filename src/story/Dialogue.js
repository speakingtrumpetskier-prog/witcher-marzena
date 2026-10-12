// Dialogue runner (G.dialogue). Data files: src/story/content/dialogues/<id>.js (format in
// docs/ARCHITECTURE.md "Dialogue"; the sample is content/dialogues/_sample.js).
//
//   const { end, picks } = await G.dialogue.start('hanka_first', opts)
//   opts: { actors: { id: Character | Actor }, start: nodeId, noStage, walkIn, speed, autopick,
//           camera: false (leave the camera alone), letterbox: false }
//   G.dialogue.active       true while one runs        G.dialogue.current -> { id, node }
//   G.dialogue.has(id)      a content file exists       G.dialogue.ids() -> [ids]
//   G.dialogue.autopick     debug: [indexes] | 'first' | (node, items) => index, used when set
//   G.dialogue.speed        debug playback speed (2 = lines twice as fast)
//
// Node extensions beyond the contract (all optional): `t` may be a function (S) => text;
// `next` may be a function (S) => nodeId; `do(S, D)` gets D = { actor(id), G } so effects can
// animate cast members; `italic` renders the line in italics (Wiesia); `wait` holds a silent
// beat of n seconds before the line; `react: { id: clip }` makes listeners act on this line.
//
// Presentation: letterbox, player control off, camera owner 'cutscene'. The camera director
// opens on an establishing two-shot, then covers the speaker over the listener's shoulder,
// keeps the 180-degree line, cuts to close-ups on charged lines (short, '!', '?', '...',
// decisive beats), inserts reaction shots on the listener after strong lines, drifts slowly
// on long lines, and blends instead of cutting when the new angle is under 30 degrees from
// the old one on the same subject. Speakers talk and gesture, listeners look, nod, glance.
// Voice-over (G.voice, src/audio/voice.js): a line with a clip in voice/manifest.json is spoken, its
// subtitle lasts as long as the audio plus a short tail, and Space still skips it. No clip, no change.
import * as THREE from 'three';
import { Actor, displayName } from './director/Actors.js';
import { Coverage } from './director/Coverage.js';
import { rng, hashString } from '../core/util.js';
import { VOICE_TAIL } from '../audio/voice.js';

const CONTENT = import.meta.glob('./content/dialogues/*.js');
const CHARS_PER_SEC = 14;
const MIN_LINE = 1.6;

function pathFor(id) { return `./content/dialogues/${id}.js`; }

export class Dialogue {
  constructor(G, story) {
    this.G = G;
    this.story = story; // { ui, cam, sched, stage, defs }
    this.active = false;
    this.current = null;
    this.autopick = null;
    this.speed = 1;
    this.defs = new Map();
    this._queue = Promise.resolve();
    this._advance = false;
    this._lineT = 0;
  }

  ids() { return Object.keys(CONTENT).map((p) => p.replace(/^.*\/(.+)\.js$/, '$1')); }
  has(id) { return this.defs.has(id) || !!CONTENT[pathFor(id)]; }

  register(def) { if (def?.id) this.defs.set(def.id, def); return def; }

  async load(id) {
    if (typeof id === 'object' && id?.nodes) return id;
    if (this.defs.has(id)) return this.defs.get(id);
    const loader = CONTENT[pathFor(id)];
    if (!loader) throw new Error(`dialogue "${id}" not found`);
    const mod = await loader();
    const def = mod.default || mod.dialogue;
    if (!def.id) def.id = id;
    this.defs.set(id, def);
    return def;
  }

  start(id, opts = {}) {
    const run = () => this._run(id, opts).catch((e) => {
      console.error(`[dialogue ${typeof id === 'string' ? id : id?.id}]`, e);
      this.G.errors?.push?.(`dialogue ${id}: ${e.message}`);
      return { end: null, picks: [], error: e };
    });
    const p = this._queue.then(run);
    this._queue = p.catch(() => {});
    return p;
  }

  // Called every frame by the story system.
  update(dt) {
    if (!this.active) return;
    this._lineT += dt;
    const inp = this.G.input;
    if (inp && this._lineT > 0.3 && (inp.pressed('advance') || inp.pressed('interact'))) this._advance = true;
  }

  async _run(id, opts) {
    const G = this.G;
    const { ui, cam, sched } = this.story;
    const def = await this.load(id);
    if (G.voice?.ready) { await G.voice.warm(); G.voice.prefetchNodes(def, opts.start || def.start || Object.keys(def.nodes)[0], { self: true }); }
    const S = G.state;
    const nested = !!G.cutscenes?.active;
    const stage = nested ? G.cutscenes.stage : this.story.newStage();
    const R = rng(hashString(def.id || 'dlg'));
    const speed = opts.speed || this.speed || 1;
    const picks = [];
    const prevContext = G.input?.context;

    // Cast.
    const actors = new Map();
    const getActor = (aid) => {
      if (!aid || aid === 'narrator') return null;
      if (actors.has(aid)) return actors.get(aid);
      const given = opts.actors?.[aid];
      let a = null;
      if (given) a = given instanceof Actor ? given : stage.get(aid, { character: given });
      else {
        const fresh = !stage.has(aid);
        a = stage.get(aid, { at: opts.spawnAt?.[aid] });
        // Somebody we had to conjure (no NPC of that id): put them in front of Vesna.
        const v = actors.get('vesna');
        if (a && fresh && a.owned && !opts.spawnAt?.[aid] && v) {
          const p = v.pos(new THREE.Vector3()).addScaledVector(v.forward(new THREE.Vector3()), 1.4 + actors.size * 0.3);
          a.setPosition(p.x, p.z);
          a.face(v, { instant: true });
        }
      }
      if (a) actors.set(aid, a);
      return a;
    };
    const vesna = getActor('vesna');
    for (const cid of def.cast || []) getActor(cid);
    const npcs = [...actors.values()].filter((a) => a !== vesna);
    let primary = npcs[0] || vesna;

    this.active = true;
    this.current = { id: def.id, node: null };
    G.events.emit('dialogue:start', { id: def.id });
    const useCam = opts.camera !== false;

    // Take control.
    G.player?.setControl?.(false);
    if (G.input) G.input.context = 'cutscene';
    if (!nested) {
      if (opts.letterbox !== false) ui.letterbox(true);
      ui.hud(false);
      ui.prompt(null);
    }
    if (useCam) cam.take();

    // Staging: keep people where they stand, nudge to a conversational distance, face each other.
    if (!opts.noStage && vesna && primary !== vesna) this._stage(vesna, primary, npcs, !!opts.walkIn);
    const cov = new Coverage(G, ui);
    if (vesna && primary !== vesna) cov.setup(vesna, primary);
    else if (npcs.length >= 2) cov.setup(npcs[0], npcs[1]);
    else if (vesna) cov.setup(vesna, vesna);

    const D = { G, actor: (aid) => getActor(aid), coverage: cov, def };
    const dir = { cov, lineIndex: 0, last: null, sinceClose: 9, sinceReact: 9, sinceWide: 0, gestureAt: new Map() };

    let nodeId = opts.start || def.start || Object.keys(def.nodes)[0];
    let endNode = null;
    let guard = 0;
    try {
      // Let the turn-to-face settle a moment under the establishing shot.
      if (useCam && cov.a !== cov.b) {
        const est = cov.two({ wide: true });
        const dr = cov.drift(est, 5, 'push');
        cam.shot({ from: est.pos, to: dr.to, look: est.look, lookTo: dr.lookTo, fov: est.fov, fovTo: est.fov * 0.93, frame: est.frame, dur: 6, ease: 'sine', label: est.label });
        dir.last = est;
        dir.sinceWide = 0;
      }
      await sched.wait(opts.leadIn ?? 0.45);

      while (nodeId && guard++ < 400) {
        const node = def.nodes[nodeId];
        if (!node) { console.warn(`[dialogue ${def.id}] missing node ${nodeId}`); break; }
        this.current.node = nodeId;
        endNode = nodeId;
        if (node.if && !node.if(S, D)) { nodeId = typeof node.else === 'function' ? node.else(S, D) : node.else; continue; }
        if (node.do) { try { node.do(S, D); } catch (e) { console.error(`[dialogue ${def.id}:${nodeId}] do`, e); } }
        if (node.wait) await sched.wait(node.wait / speed);

        const text = typeof node.t === 'function' ? node.t(S, D) : node.t;
        if (text) {
          const spk = node.s === 'narrator' ? null : getActor(node.s);
          // The person Vesna talks to becomes the anchor of the line of action.
          if (spk && spk !== vesna && spk !== primary && vesna) {
            primary = spk;
            if (useCam) cov.setup(vesna, primary, { keepScreen: true });
            dir.axisChanged = true;
          }
          await this._line(node, text, spk, { actors, vesna, primary, cov, dir, R, speed, useCam, def, nodeId });
        }

        if (node.end) break;
        if (node.choices) {
          const res = await this._choose(node, nodeId, def, { cov, primary, vesna, useCam, picks, opts, dir, D });
          if (res == null) break;
          nodeId = res;
          continue;
        }
        nodeId = typeof node.next === 'function' ? node.next(S, D) : node.next;
      }
    } finally {
      ui.clearSubtitle();
      G.voice?.stopAll?.();
      for (const a of actors.values()) { a.talk(false); a.lookAt(null); a.relax(); }
      // Player keeps where she ended up.
      if (vesna?.isPlayer && !nested) this.story.syncPlayer(vesna);
      if (!nested) {
        stage.releaseAll();
        if (useCam) cam.release();
        if (opts.letterbox !== false) ui.letterbox(false);
        ui.hud(true);
        G.player?.setControl?.(true);
        if (G.input) G.input.context = prevContext === 'cutscene' ? 'game' : prevContext || 'game';
      }
      this.active = false;
      this.current = null;
      G.events.emit('dialogue:end', { id: def.id, end: endNode, picks });
    }
    return { end: endNode, picks };
  }

  // Under the opening cut, snap Vesna to a conversational distance and turn both to face each
  // other (the cut hides the adjustment). opts.walkIn walks her there instead.
  _stage(vesna, npc, npcs, walkIn = false) {
    const G = this.G;
    const vp = vesna.pos(new THREE.Vector3()), np = npc.pos(new THREE.Vector3());
    const d = Math.hypot(vp.x - np.x, vp.z - np.z);
    if (d < 1.05 || d > 1.9) {
      const dx = d > 1e-3 ? (vp.x - np.x) / d : 0, dz = d > 1e-3 ? (vp.z - np.z) / d : 1;
      const target = new THREE.Vector3(np.x + dx * 1.4, vp.y, np.z + dz * 1.4);
      G.physics?.resolve?.(target, 0.35);
      if (walkIn && d < 6 && typeof vesna.c.walkTo === 'function') {
        vesna.walkTo(target.x, target.z, { speed: 1.3 }).then(() => vesna.face(npc));
      } else vesna.setPosition(target.x, target.z);
    }
    vesna.face(npc, { instant: !walkIn });
    npc.face(vesna, { instant: !walkIn });
    for (const o of npcs) if (o !== npc) o.face(vesna);
    for (const a of [vesna, ...npcs]) a.lookAt(a === vesna ? npc : vesna);
  }

  // How charged a line is, for close-ups and reactions.
  _charge(node, text, ctx) {
    if (node.cam === 'close') return 3;
    let s = 0;
    const t = text.trim();
    if (/!/.test(t)) s += 1.0;
    if (/\?$/.test(t)) s += 0.45;
    if (/\.\.\.|…/.test(t)) s += 0.8;
    if (t.length < 26) s += 0.55;
    if (t.length < 12) s += 0.3;
    if (node.a && !/^talk/.test(node.a)) s += 0.3;
    // The last line of a scene is its button.
    if (node.end) s += 0.5;
    const def = ctx.def, nx = typeof node.next === 'string' ? def.nodes[node.next] : null;
    if (nx?.decisive || node.decisive || ctx.dir.afterDecisive) s += 1.4;
    return s;
  }

  async _line(node, text, spk, ctx) {
    const G = this.G;
    const { ui, sched } = this.story;
    const { actors, vesna, cov, dir, R, speed, useCam } = ctx;
    const name = node.s === 'narrator' ? '' : (node.name || displayName(G, node.s));
    // Voiced line: lasts as long as its audio plus a tail (a longer node.dur still holds the beat).
    // Debug speed-ups and skipping play the line unvoiced.
    let vl = null;
    if (node.s !== 'narrator' && speed === 1 && !sched.instant && (this.story.timeScale || 1) === 1 && G.voice?.canVoice?.(node.s, text)) {
      vl = await G.voice.prepare(node.s, text);
    }
    const dur = vl ? Math.max(vl.dur + VOICE_TAIL, node.dur ?? 0) : (node.dur ?? Math.max(MIN_LINE, text.length / CHARS_PER_SEC + 0.35)) / speed;
    const listeners = [...actors.values()].filter((a) => a !== spk);
    const mainListener = spk === vesna ? ctx.primary : vesna;
    const charge = this._charge(node, text, ctx);
    const strong = charge >= 1.25;
    dir.afterDecisive = false;
    dir.lineIndex++;

    // Who looks where.
    if (spk) {
      const lookT = node.look ? actors.get(node.look) : mainListener;
      if (lookT && lookT !== spk) { spk.lookAt(lookT); spk.face(lookT); }
      for (const l of listeners) if (l !== spk) l.lookAt(spk);
    }

    // Camera plan.
    let reactAt = -1, reactShot = null;
    if (useCam && spk) {
      const want = node.cam || 'auto';
      let shot = null;
      const sameSubject = dir.last?.subject === spk;
      if (want === 'wide') shot = cov.two({ wide: false, favor: spk });
      else if (want === 'close') shot = cov.close(spk, mainListener);
      else if (want === 'ots') shot = cov.ots(spk);
      else {
        const last = dir.last;
        if (dir.axisChanged) { shot = cov.two({ wide: false }); dir.axisChanged = false; }
        // Let the establishing shot carry the first line.
        else if (dir.lineIndex === 1 && last?.size === 0) shot = last;
        // A charged line on a face we are already close on: stay there.
        else if (strong && sameSubject && last?.size === 4) shot = last;
        else if (strong && dir.lineIndex > 1 && (dir.sinceClose >= 2 || charge >= 2.4)) shot = cov.close(spk, mainListener);
        // Every so often, breathe with a two-shot on a long, calm line.
        else if (dir.sinceWide >= 7 && dur > 3 && !strong) shot = cov.two({ wide: false, favor: spk });
        // Same speaker again: hold the setup, or move to a clean single for a longer line.
        else if (sameSubject && last?.size === 2) shot = dur > 3.2 ? cov.single(spk, mainListener) : last;
        else if (sameSubject && last?.size === 3) shot = last;
        else shot = cov.ots(spk);
      }
      this._applyShot(shot, dur, dir);
      // Reaction: let the listener answer with their face after a strong line.
      if (strong && mainListener && dir.sinceReact >= 2 && spk !== mainListener && node.cam !== 'close') {
        reactShot = cov.single(mainListener, spk);
        reactAt = dur >= 2.6 ? dur * 0.6 : dur;
      }
    }

    // Acting.
    if (spk) {
      spk.talk(true);
      if (node.a) {
        spk.play(node.a);
        dir.gestureAt.set(spk.id, dir.lineIndex);
      } else {
        const lastG = dir.gestureAt.get(spk.id) ?? -9;
        if (text.length > 28 && dir.lineIndex - lastG >= 2 && R() < 0.55) {
          spk.talkGesture(R);
          dir.gestureAt.set(spk.id, dir.lineIndex);
        } else if (spk.loopPose && dir.lineIndex - lastG >= 2) spk.relax();
      }
    }
    if (node.react) {
      for (const [rid, clip] of Object.entries(node.react)) actors.get(rid)?.play(clip);
    }
    const nodder = mainListener && mainListener !== spk ? mainListener : null;
    const nodAt = nodder && !strong && text.length > 26 && !/\?$/.test(text.trim()) && R() < 0.35 ? dur * (0.55 + R() * 0.2) : -1;
    const glanceAt = nodder && dur > 3.4 && R() < 0.3 ? dur * 0.35 : -1;

    const subTok = ui.subtitle(name, text, Infinity, { italic: !!node.italic || node.s === 'wiesia' || node.s === 'wiesia_ghost' });
    if (vl) {
      vl.play({ character: spk?.c });
      G.voice.prefetchNodes(ctx.def, ctx.nodeId);
    } else G.audio?.duck?.(0.35, dur + 0.3);
    G.events.emit('dialogue:line', { id: ctx.def.id, node: ctx.nodeId, s: node.s, t: text, dur, voiced: !!vl });

    // Wait for the line, a skip press, or the end of the reaction beat.
    this._advance = false;
    this._lineT = 0;
    const t0 = sched.time;
    let t = 0;
    let reacted = false, nodded = false, glanced = false;
    while (t < dur && !this._advance && !sched.instant) {
      await sched.wait(1e-4);
      t = sched.time - t0;
      if (reactShot && !reacted && t >= reactAt && t < dur - 0.4) {
        reacted = true;
        this._applyShot(reactShot, dur - t + 1.2, dir, true);
        if (nodder && R() < 0.5) nodder.play(/\?$/.test(text.trim()) ? 'shrug' : 'nod');
      }
      if (!nodded && nodAt > 0 && t >= nodAt) { nodded = true; nodder.play('nod'); }
      if (!glanced && glanceAt > 0 && t >= glanceAt) {
        glanced = true;
        const away = nodder.eye(new THREE.Vector3()).addScaledVector(nodder.forward(new THREE.Vector3()), 3);
        away.x += (R() - 0.5) * 3; away.y -= 0.6;
        nodder.lookAt(away.toArray());
        sched.wait(0.9).then(() => { if (this.active) nodder.lookAt(spk); });
      }
    }
    spk?.talk(false);
    vl?.stop(0.12); // a skipped line fades out; a finished one is already done
    // Short strong line: hold a beat on the listener before moving on.
    if (reactShot && !reacted && useCam && !this._advance) {
      this._applyShot(reactShot, 1.6, dir, true);
      if (nodder && R() < 0.6) nodder.play('nod');
      await sched.wait(0.85 / speed);
    }
    ui.clearSubtitle(subTok);
  }

  // Cut or blend to a setup, then drift through the line.
  _applyShot(shot, dur, dir, isReaction = false) {
    const { cam } = this.story;
    if (!shot) return;
    const prev = dir.last;
    const keep = prev === shot;
    const dr = dir.cov.drift(shot, dur + 1);
    if (keep) {
      // Same setup: keep drifting from wherever the camera is.
      cam.shot({ to: dr.to, lookTo: dr.lookTo, fovTo: dr.fovTo, dur: dur + 1, ease: 'sine', label: shot.label });
    } else {
      const sameSubject = prev && prev.subject && prev.subject === shot.subject;
      const pushIn = prev && shot.size > prev.size && Coverage.angleBetween(prev, shot) < 30;
      if (sameSubject && pushIn && !isReaction) {
        // A cut under 30 degrees on the same face jumps; pushing in reads as intent.
        // Pulling back (and anything else) cuts.
        cam.shot({
          to: shot.pos, look: cam.look.clone(), lookTo: shot.look, fov: cam.fov, fovTo: shot.fov,
          frame: [...cam.frame], frameTo: shot.frame, dur: Math.min(1.6, dur), ease: 'inOut', label: `${shot.label} (dolly)`,
        });
      } else {
        cam.shot({ from: shot.pos, to: dr.to, look: shot.look, lookTo: dr.lookTo, fov: shot.fov, fovTo: dr.fovTo, frame: shot.frame, dur: dur + 1, ease: 'sine', shake: shot.size >= 4 ? 0.12 : 0, label: shot.label });
      }
    }
    dir.last = shot;
    dir.sinceClose = shot.size >= 4 ? 0 : dir.sinceClose + 1;
    dir.sinceReact = isReaction ? 0 : dir.sinceReact + 1;
    dir.sinceWide = shot.size <= 1 ? 0 : dir.sinceWide + 1;
  }

  async _choose(node, nodeId, def, { cov, primary, vesna, useCam, picks, opts, dir, D }) {
    const G = this.G;
    const S = G.state;
    const { ui, cam, sched } = this.story;
    const seen = (S.data.dlg ||= {});
    const avail = [];
    node.choices.forEach((c, i) => {
      const key = `${def.id}:${nodeId}:${i}`;
      if (c.once && seen[key]) return;
      if (c.if && !c.if(S)) return;
      avail.push({ c, i, key, text: typeof c.t === 'function' ? c.t(S) : c.t, decisive: !!(c.decisive || node.decisive), exit: !!c.exit, seen: !!seen[key] });
    });
    if (!avail.length) return null;
    ui.clearSubtitle();
    // Inside a cutscene a skip stops at a choice, and cannot start while one is open.
    const cs = G.cutscenes;
    if (cs?.skipping) cs._stopSkip();
    if (cs?.active) cs._choiceOpen = true;

    // Hold on the other face while Vesna decides (decisive: a slow push into a close-up).
    if (useCam && primary && primary !== vesna) {
      const shot = node.decisive ? cov.close(primary, vesna) : cov.ots(primary);
      const push = cov.drift(shot, 12, 'push');
      cam.shot({ from: shot.pos, to: push.to, look: shot.look, lookTo: push.lookTo, fov: shot.fov, fovTo: shot.fov * (node.decisive ? 0.9 : 0.97), frame: shot.frame, dur: node.timer || 14, ease: 'sine', label: `${node.decisive ? 'decisive' : 'choice'} ${primary.id}` });
      dir.last = shot;
      primary.lookAt(vesna);
    }
    if (node.decisive) G.audio?.stinger?.('choice');

    let index;
    const ap = opts.autopick ?? this.autopick;
    if (ap != null) {
      await sched.wait(1.1);
      if (Array.isArray(ap)) index = ap.length ? ap.shift() : 0;
      else if (typeof ap === 'function') index = ap(node, avail);
      else index = 0;
      if (index >= avail.length) index = avail.length - 1;
      if (index < 0 && !node.timeout) index = 0;
    } else {
      const items = avail.map((a) => ({ text: a.text, t: a.text, decisive: a.decisive, exit: a.exit, seen: a.seen }));
      index = await ui.choices(items, { timer: node.timer || 0, decisive: !!node.decisive });
    }
    if (cs?.active) cs._choiceOpen = false;
    dir.afterDecisive = !!node.decisive;

    if (index == null || index < 0 || index >= avail.length) {
      picks.push({ node: nodeId, i: -1, timeout: true });
      return node.timeout || null;
    }
    const pick = avail[index];
    seen[pick.key] = true;
    picks.push({ node: nodeId, i: pick.i, t: pick.text });
    if (pick.c.do) { try { pick.c.do(S, D); } catch (e) { console.error(e); } }
    return typeof pick.c.next === 'function' ? pick.c.next(S) : pick.c.next || null;
  }
}
