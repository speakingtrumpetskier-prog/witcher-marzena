// Interaction (G.interact): things Vesna can use with E. Picks the best candidate each frame by
// distance and facing, shows the prompt, runs its onUse (which may start a dialogue or a cutscene).
//
//   const id = G.interact.add({
//     id: 'notice_board', pos: Vector3 | [x, y, z] | [x, z] | (() => Vector3), radius: 2.2,
//     label: 'Notice Board', verb: 'Read',   // Talk | Examine | Read | Take | Rest | Sit | Open | Climb | Use | Leave
//     enabled: () => true, facing: true, sensesOnly: false, priority: 0,
//     onUse: async () => {},
//   })
//   G.interact.remove(id)      G.interact.get(id)      G.interact.current -> entry | null
//   G.interact.use(id)         run an entry's onUse from code (tests, scripts)
//   G.interact.enabled = false disables prompts and input (the story does this while busy)
// Prompt text: `[E] ${verb}  ${label}` through G.ui.prompt (or the story fallback overlay).
import * as THREE from 'three';
import { ORDER } from '../core/G.js';

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _f = new THREE.Vector3();

export async function init(G) {
  if (G.interact && !G.interact.stub) return;
  const items = new Map();
  let nextId = 1;
  let current = null;
  let shown = null;
  let running = false;

  const prompt = (text) => {
    if (G.story?.ui) G.story.ui.prompt(text);
    else G.ui?.prompt?.(text);
  };

  function posOf(it, out) {
    const p = typeof it.pos === 'function' ? it.pos() : it.pos;
    if (!p) return null;
    if (p.isVector3) return out.copy(p);
    if (Array.isArray(p)) {
      if (p.length === 2) return out.set(p[0], (G.world?.heightAt?.(p[0], p[1]) ?? 0) + 1, p[1]);
      return out.set(p[0], p[1], p[2]);
    }
    if (p.x != null) return out.set(p.x, p.y ?? (G.world?.heightAt?.(p.x, p.z) ?? 0) + 1, p.z);
    return null;
  }

  function viewer() {
    const P = G.player;
    if (P?.position) {
      const yaw = P.yaw ?? P.character?.yaw ?? 0;
      return { pos: _q.copy(P.position), fwd: _f.set(Math.sin(yaw), 0, Math.cos(yaw)) };
    }
    G.camera.getWorldDirection(_f).setY(0).normalize();
    return { pos: _q.copy(G.camera.position), fwd: _f };
  }

  const api = {
    enabled: true,
    get current() { return current; },
    get busy() { return running; },
    items,

    add(def) {
      const id = def.id ?? `it${nextId++}`;
      items.set(id, { radius: 2.2, verb: 'Use', label: '', facing: true, sensesOnly: false, priority: 0, ...def, id });
      return id;
    },
    remove(id) {
      if (current?.id === id) { current = null; }
      items.delete(id);
    },
    get(id) { return items.get(id) || null; },

    async use(id) {
      const it = typeof id === 'string' || typeof id === 'number' ? items.get(id) : id;
      if (!it || running) return false;
      running = true;
      prompt(null);
      shown = null;
      try { await it.onUse?.(it); } catch (e) {
        console.error(`[interact ${it.id}]`, e);
        G.errors?.push?.(`interact ${it.id}: ${e.message}`);
      } finally {
        running = false;
      }
      G.events.emit('interact:use', { id: it.id });
      return true;
    },

    update() {
      const busy = running || G.story?.busy || !api.enabled || (G.input && G.input.context !== 'game')
        || G.player?.state === 'dead' || G.player?.state === 'scripted';
      if (busy) {
        if (shown) { prompt(null); shown = null; }
        current = null;
        return;
      }
      const v = viewer();
      const sensesOn = !!G.senses?.active;
      let best = null, bestScore = Infinity;
      for (const it of items.values()) {
        if (it.sensesOnly && !sensesOn) continue;
        if (it.enabled) { let ok = false; try { ok = !!it.enabled(); } catch { ok = false; } if (!ok) continue; }
        const p = posOf(it, _p);
        if (!p) continue;
        const dx = p.x - v.pos.x, dz = p.z - v.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > it.radius) continue;
        // Height check keeps upstairs items out of reach from below.
        if (G.player && Math.abs(p.y - (v.pos.y + 1)) > Math.max(2.5, it.radius + 1)) continue;
        let score = d / it.radius;
        if (it.facing && d > 0.4) {
          const dot = (dx * v.fwd.x + dz * v.fwd.z) / d;
          if (dot < -0.1) continue;
          score += (1 - dot) * 0.9;
        }
        score -= it.priority * 0.5;
        if (score < bestScore) { bestScore = score; best = it; }
      }
      current = best;
      const text = best ? `[E] ${best.verb}  ${typeof best.label === 'function' ? best.label() : best.label}`.trim() : null;
      if (text !== shown) { prompt(text); shown = text; }
      if (best && G.input?.pressed('interact')) api.use(best);
    },
  };

  G.interact = api;
  G.addSystem('interact', () => api.update(), ORDER.logic + 2);
}
