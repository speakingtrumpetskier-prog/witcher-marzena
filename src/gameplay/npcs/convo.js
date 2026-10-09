// Conversations between pairs at `talk` stations: both face each other, take turns talking
// (mouth, upper-body gestures), the listener nods now and then, and when Vesna passes close the
// pair may trade a short exchange of barks.
//
//   const cv = new Convos(sys)
//   cv.claimSlot(station, npc) -> 0 | 1      cv.releaseSlot(npc)
//   cv.join(npc, S)                          npc has arrived: start talking if the partner is there
//   cv.leave(npc)                            stop (either one leaving ends the talk)
//   cv.update(dt, S)
import { chooseExchange } from './barks.js';

const TALK = ['talk_1', 'talk_2', 'talk_3'];

export class Convos {
  constructor(sys) {
    this.sys = sys;
    this.slots = new Map(); // station id -> [npc|null, npc|null]
    this.active = new Set();
  }

  claimSlot(st, npc) {
    let s = this.slots.get(st.id);
    if (!s) { s = [null, null]; this.slots.set(st.id, s); }
    for (let i = 0; i < 2; i++) if (s[i] === npc) return i;
    const i = s[0] === null ? 0 : s[1] === null ? 1 : 0;
    s[i] = npc;
    npc._slotKey = st.id;
    return i;
  }

  releaseSlot(npc) {
    const k = npc._slotKey;
    if (!k) return;
    const s = this.slots.get(k);
    if (s) for (let i = 0; i < 2; i++) if (s[i] === npc) s[i] = null;
    npc._slotKey = null;
  }

  partnerOf(npc) {
    const s = this.slots.get(npc._slotKey);
    if (!s) return null;
    return s[0] === npc ? s[1] : s[0];
  }

  join(npc, S) {
    const o = this.partnerOf(npc);
    if (!o || o.state !== 'station' || !o._c || o.convo || npc.convo) return;
    if (o.station !== npc.station) return;
    const cv = { a: o, b: npc, speaker: this.sys.rand() < 0.5 ? 0 : 1, t: 0.5, script: null, st: 0, nodT: 2 };
    o.convo = cv; npc.convo = cv;
    this.active.add(cv);
    o._c.lookAt(npc._c.bones.head);
    npc._c.lookAt(o._c.bones.head);
    void S;
  }

  leave(npc) {
    const cv = npc.convo;
    if (!cv) return;
    this.active.delete(cv);
    for (const n of [cv.a, cv.b]) {
      n.convo = null;
      if (n._c) { n._c.talk(false); if (n !== npc && !n.lookOn) n._c.lookAt(null); }
    }
  }

  update(dt, S) {
    for (const cv of this.active) {
      const a = cv.a, b = cv.b;
      if (a.disposed || b.disposed || a.paused || b.paused || a.frozen || b.frozen || a.state !== 'station' || b.state !== 'station') { this.leave(a); continue; }
      if (a.d2 > 60 * 60) continue;
      // scripted exchange (barks) takes over the turns
      if (cv.script) {
        cv.st -= dt;
        if (cv.st <= 0) {
          const line = cv.script.shift();
          if (!line) { cv.script = null; } else {
            const who = line.who === 0 ? a : b;
            who.bark(line.text);
            cv.st = 1.5 + line.text.length * 0.07;
            cv.speaker = line.who;
            this._turn(cv, true);
          }
        }
        continue;
      }
      cv.t -= dt;
      if (cv.t <= 0) {
        cv.speaker = 1 - cv.speaker;
        cv.t = 2.8 + this.sys.rand() * 3.4;
        this._turn(cv, true);
      }
      cv.nodT -= dt;
      if (cv.nodT <= 0) {
        cv.nodT = 3 + this.sys.rand() * 5;
        const l = cv.speaker === 0 ? b : a;
        if (l.d2 < 30 * 30) l._c.gesture('nod');
      }
      // Vesna walks by: trade a line or two
      if (S.barkOK && a.d2 < 22 * 22) {
        const px = a.position.x - S.player.x, pz = a.position.z - S.player.z;
        if (px * px + pz * pz < 5.5 * 5.5 && a.barkCD <= 0 && b.barkCD <= 0) {
          a.barkCD = b.barkCD = 50 + this.sys.rand() * 60;
          if (this.sys.rand() < 0.7) {
            const lines = chooseExchange(this.sys.G, a, b, this.sys.rand);
            if (lines) {
              cv.script = lines.map((text, i) => ({ who: i % 2, text }));
              cv.st = 0;
              this.sys.noteBark();
            }
          }
        }
      }
    }
  }

  _turn(cv, gesture) {
    const sp = cv.speaker === 0 ? cv.a : cv.b, li = cv.speaker === 0 ? cv.b : cv.a;
    if (sp._c) {
      sp._c.talk(true);
      if (gesture && sp.d2 < 40 * 40) sp._c.playUpper(TALK[Math.floor(this.sys.rand() * 3)], { loop: false, fade: 0.3 });
    }
    if (li._c) li._c.talk(false);
  }
}
