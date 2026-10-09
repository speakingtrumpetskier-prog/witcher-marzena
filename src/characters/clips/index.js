// Clip library registry. Clips are baked lazily on first use and shared by all characters.
// getClip(name) -> baked clip | undefined, clipNames() -> list.
import { buildLocomotion } from './locomotion.js';

let lib = null;
const builders = [buildLocomotion];
export function registerClips(fn) {
  builders.push(fn);
  if (lib) fn(lib);
}
function build() {
  lib = {};
  for (const b of builders) {
    try { b(lib); } catch (e) { console.error('[characters] clip build failed', e); }
  }
}
export function getClip(name) {
  if (!lib) build();
  return lib[name];
}
export function clipNames() {
  if (!lib) build();
  return Object.keys(lib);
}
