// Clip library registry. Clips are baked lazily on first use and shared by all characters.
// getClip(name) -> baked clip | undefined, clipNames() -> list.
import { buildLocomotion } from './locomotion.js';

let lib = null;
const lazy = {}; // clip name -> block builder (bakes on first request)
const builders = [buildLocomotion];
export function registerClips(fn) {
  builders.push(fn);
  if (lib) fn(lib, lazy);
}
function build() {
  lib = {};
  for (const b of builders) {
    try { b(lib, lazy); } catch (e) { console.error('[characters] clip build failed', e); }
  }
}
export function getClip(name) {
  if (!lib) build();
  if (!lib[name] && lazy[name]) {
    const fn = lazy[name];
    for (const k in lazy) if (lazy[k] === fn) delete lazy[k];
    try { fn(); } catch (e) { console.error(`[characters] clip block for ${name} failed`, e); }
  }
  return lib[name];
}
export function clipNames() {
  if (!lib) build();
  return [...new Set([...Object.keys(lib), ...Object.keys(lazy)])];
}
// Bake everything now (tools, galleries).
export function bakeAll() {
  for (const n of clipNames()) getClip(n);
}
