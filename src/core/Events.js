// Minimal event bus. Event names are documented in docs/ARCHITECTURE.md.
export class Events {
  constructor() {
    this.map = new Map();
  }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (...a) => { off(); fn(...a); });
    return off;
  }
  off(name, fn) {
    this.map.get(name)?.delete(fn);
  }
  emit(name, payload) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (e) { console.error(`[events] handler for "${name}" failed`, e); }
    }
  }
  // Promise that resolves the next time the event fires (optionally matching a predicate).
  wait(name, pred) {
    return new Promise((resolve) => {
      const off = this.on(name, (p) => {
        if (!pred || pred(p)) { off(); resolve(p); }
      });
    });
  }
}
