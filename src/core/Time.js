// The game clock. 1 in-game hour = 60 real seconds by default (scale = 60).
//
//   G.time.hours       float 0..24
//   G.time.day         integer: 0 is the prologue (the pass, the night at the watchtower), 1 the day she
//                      comes down into the valley, 2 the equinox night. A new game starts at 0; the morning
//                      after the shelter sets 1. The default here (1) is for debug scenes and shots.
//   G.time.scale       game seconds per real second (60 = 1 hour per minute; 0 freezes)
//   G.time.setHours(h, { advanceDay })  jump the clock (emits 'time:jump')
//   G.time.isNight     true between ~18:30 and ~6:00
//   G.time.sunAltitude computed by Atmosphere, cached here for others to read

export class Time {
  constructor(events) {
    this.events = events;
    this.hours = 15.5;
    this.day = 1;
    this.scale = 60;
    this.frozen = false;
    this.sunAltitude = 0.2;
  }
  get isNight() { return this.hours > 18.5 || this.hours < 6.0; }
  get totalHours() { return this.day * 24 + this.hours; }

  update(dt) {
    if (this.frozen || this.scale === 0) return;
    const prevHour = Math.floor(this.hours);
    this.hours += (dt * this.scale) / 3600;
    if (this.hours >= 24) {
      this.hours -= 24;
      this.day += 1;
      this.events.emit('time:day', { day: this.day });
    }
    if (Math.floor(this.hours) !== prevHour) this.events.emit('time:hour', { hours: this.hours, day: this.day });
  }

  setHours(h, { advanceDay = false } = {}) {
    if (advanceDay || h < this.hours) {
      if (advanceDay) this.day += 1;
    }
    this.hours = ((h % 24) + 24) % 24;
    this.events.emit('time:jump', { hours: this.hours, day: this.day });
  }

  // Advance forward to the next occurrence of hour h (used by resting).
  advanceTo(h) {
    if (h <= this.hours) this.day += 1;
    this.hours = h;
    this.events.emit('time:jump', { hours: this.hours, day: this.day });
  }
}
