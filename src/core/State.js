// Persistent game state: flags, quests, inventory, discoveries. Saved to localStorage.
//
//   G.state.flag('met_hanka')          -> value or undefined
//   G.state.set('met_hanka', true)     emits 'flag' { key, value }
//   G.state.inc('coins', 61)
//   G.state.has('item:thaw', 1)
//   G.state.give('thaw', 1) / G.state.take('thaw', 1)
//   G.state.save() / G.state.load() / G.state.reset()

const SAVE_KEY = 'marzena-save-v1';

function fresh() {
  return {
    version: 1,
    flags: {},
    quests: {}, // questId -> { stage, done, failed, log: [entries] }
    inventory: { coins: 0, thaw: 2 },
    notes: [], // note ids read
    discovered: [], // location ids
    player: null, // { x, y, z, yaw }
    clock: null, // { day, hours }
    weather: null,
    stats: { kills: 0 },
    fish: { basket: [], log: {}, caught: 0, sold: 0, line: 'normal' }, // gameplay/fishing
  };
}

export class State {
  constructor(events) {
    this.events = events;
    this.data = fresh();
  }
  flag(key) { return this.data.flags[key]; }
  set(key, value = true) {
    const old = this.data.flags[key];
    this.data.flags[key] = value;
    if (old !== value) this.events.emit('flag', { key, value, old });
  }
  inc(key, n = 1) { this.set(key, (this.data.flags[key] || 0) + n); }

  count(item) { return this.data.inventory[item] || 0; }
  has(item, n = 1) { return this.count(item) >= n; }
  give(item, n = 1) {
    this.data.inventory[item] = this.count(item) + n;
    this.events.emit('inventory', { item, n, total: this.data.inventory[item] });
  }
  take(item, n = 1) {
    if (!this.has(item, n)) return false;
    this.data.inventory[item] -= n;
    this.events.emit('inventory', { item, n: -n, total: this.data.inventory[item] });
    return true;
  }

  readNote(id) {
    if (!this.data.notes.includes(id)) {
      this.data.notes.push(id);
      this.events.emit('note', { id });
    }
  }
  discover(id) {
    if (!this.data.discovered.includes(id)) {
      this.data.discovered.push(id);
      this.events.emit('discover', { id });
      return true;
    }
    return false;
  }

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }
  save(extra = {}) {
    Object.assign(this.data, extra);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      this.events.emit('saved', {});
      return true;
    } catch { return false; }
  }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      this.data = Object.assign(fresh(), JSON.parse(raw));
      this.events.emit('loaded', {});
      return true;
    } catch { return false; }
  }
  reset() {
    this.data = fresh();
    this.events.emit('reset', {});
  }
  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
}
