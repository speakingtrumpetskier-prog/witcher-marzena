// UI facade for the story systems. Calls the real G.ui (UI builder) when it provides a method,
// otherwise draws a minimal fallback overlay of its own so dialogue, cutscenes and the title
// flow stay usable and testable before (or without) the UI module.
//
//   const ui = createStoryUI(G)
//   ui.letterbox(on)                 ui.subtitle(name, text, seconds)   ui.clearSubtitle()
//   await ui.fade(to, seconds)       await ui.titleCard(title, sub, seconds)
//   await ui.choices(items, { timer, decisive }) -> index (or -1 on timeout)
//        items: [{ text, decisive, exit, seen }]
//   ui.prompt(text | null)           ui.notify(text, kind)        ui.skipRing(0..1 | null)
//   await ui.title() -> 'new' | 'continue'      ui.hud(show)
//   ui.cinemaFrac()                  visible fraction of the frame height inside the letterbox
//
// The letterbox targets a 2.35:1 picture; dialogue framing (Coverage.js) relies on that.

export const CINE_ASPECT = 2.35;

const CSS = `
.mzs-bar{position:fixed;left:0;right:0;height:0;background:#000;z-index:40;pointer-events:none;transition:height .7s cubic-bezier(.4,0,.2,1)}
.mzs-bar.top{top:0}.mzs-bar.bot{bottom:0}
.mzs-fade{position:fixed;inset:0;background:#000;opacity:0;z-index:60;pointer-events:none}
.mzs-sub{position:fixed;left:50%;bottom:3.4vh;transform:translateX(-50%);width:min(1000px,84vw);text-align:center;z-index:45;pointer-events:none;
 color:var(--mz-bone,#ece6da);font-family:var(--mz-body,Georgia,serif);font-size:clamp(16px,1.55vw,24px);line-height:1.35;
 text-shadow:0 1px 2px #000,0 0 14px #000c;opacity:0;transition:opacity .22s ease}
.mzs-sub.on{opacity:1}
.mzs-sub .who{font-family:var(--mz-serif,Georgia,serif);font-variant:small-caps;letter-spacing:.09em;color:#cf5a45;margin-right:.55em;font-weight:600}
.mzs-sub .it{font-style:italic;color:#c9f6ff}
.mzs-card{position:fixed;left:0;right:0;top:40%;transform:translateY(-50%);text-align:center;z-index:55;pointer-events:none;opacity:0;transition:opacity 1.1s ease}
.mzs-card.on{opacity:1}
.mzs-card .t{font-family:var(--mz-serif,Georgia,serif);font-size:clamp(34px,5.4vw,78px);letter-spacing:.42em;padding-left:.42em;color:var(--mz-bone,#ece6da);text-shadow:0 2px 20px #000a}
.mzs-card .th{height:1px;width:72px;margin:16px auto 14px;background:var(--mz-red,#9a2e22)}
.mzs-card .s{font-family:var(--mz-body,Georgia,serif);font-style:italic;font-size:clamp(15px,1.4vw,21px);color:#d9d2c4;letter-spacing:.05em;text-shadow:0 1px 8px #000}
.mzs-ch{position:fixed;right:6vw;bottom:17vh;z-index:50;min-width:300px;max-width:min(560px,46vw);font-family:var(--mz-body,Georgia,serif)}
.mzs-ch .opt{display:flex;align-items:baseline;gap:.7em;padding:.38em .8em;margin:.18em 0;color:#e9e2d4;font-size:clamp(15px,1.3vw,20px);
 background:linear-gradient(90deg,#0000,#0008 30%,#000a);border-left:2px solid #0000;cursor:pointer;text-shadow:0 1px 2px #000}
.mzs-ch .opt:hover,.mzs-ch .opt.sel{border-left-color:#cf5a45;color:#fff}
.mzs-ch .opt.seen{color:#a59d8e}
.mzs-ch .n{font-family:var(--mz-serif,Georgia,serif);color:#cf5a45;min-width:1em}
.mzs-ch .knot{display:inline-block;width:.62em;height:.62em;border:2px solid #cf5a45;transform:rotate(45deg);margin-right:.2em;flex:none}
.mzs-ch .timer{height:2px;background:#cf5a45;margin:.5em .8em 0;transform-origin:left;transition:transform linear}
.mzs-prompt{position:fixed;left:50%;bottom:20vh;transform:translateX(-50%);z-index:44;pointer-events:none;font-family:var(--mz-body,Georgia,serif);
 color:#efe8da;font-size:18px;text-shadow:0 1px 3px #000;opacity:0;transition:opacity .2s}
.mzs-prompt.on{opacity:1}
.mzs-prompt b{font-family:var(--mz-serif,Georgia,serif);color:#ffcf96;border:1px solid #ffcf9677;padding:0 .35em;margin-right:.5em;font-weight:600}
.mzs-note{position:fixed;right:28px;top:26px;z-index:46;pointer-events:none;display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.mzs-note div{font-family:var(--mz-serif,Georgia,serif);color:#efe8da;font-size:19px;letter-spacing:.04em;padding:6px 14px;background:linear-gradient(90deg,#0000,#000a);
 border-right:2px solid #cf5a45;text-shadow:0 1px 2px #000;transition:opacity .6s}
.mzs-skip{position:fixed;right:34px;bottom:30px;z-index:58;display:flex;align-items:center;gap:10px;font-family:var(--mz-body,Georgia,serif);
 color:#d8d1c3;font-size:15px;letter-spacing:.06em;opacity:0;transition:opacity .25s;pointer-events:none}
.mzs-skip.on{opacity:1}
.mzs-title{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;
 background:radial-gradient(ellipse at 50% 60%,#0000 0%,#0006 60%,#000c 100%);transition:opacity 1.2s}
.mzs-title .t{font-family:var(--mz-serif,Georgia,serif);font-size:clamp(46px,8vw,120px);letter-spacing:.45em;padding-left:.45em;color:#efe8da;text-shadow:0 3px 30px #000}
.mzs-title .th{height:1px;width:90px;margin:14px auto 46px;background:#9a2e22}
.mzs-title button{display:block;margin:6px auto;background:none;border:none;color:#e6dfd1;font-family:var(--mz-serif,Georgia,serif);font-size:24px;
 letter-spacing:.18em;cursor:pointer;padding:6px 18px;text-shadow:0 1px 6px #000}
.mzs-title button:hover{color:#fff;text-decoration:underline;text-decoration-color:#9a2e22;text-underline-offset:6px}
.mzs-title button:disabled{color:#776f63;cursor:default;text-decoration:none}
`;

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function createStoryUI(G) {
  let dom = null;
  let lbOn = false;
  let subTimer = 0;
  let fadeLevel = 0;

  const real = (name) => !!(G.ui && !G.ui.stub && typeof G.ui[name] === 'function');

  function root() {
    if (dom) return dom;
    const host = document.getElementById('ui-root') || document.body;
    const style = el('style', null, document.head);
    style.textContent = CSS;
    dom = {};
    dom.top = el('div', 'mzs-bar top', host);
    dom.bot = el('div', 'mzs-bar bot', host);
    dom.sub = el('div', 'mzs-sub', host);
    dom.card = el('div', 'mzs-card', host);
    dom.prompt = el('div', 'mzs-prompt', host);
    dom.note = el('div', 'mzs-note', host);
    dom.skip = el('div', 'mzs-skip', host,
      '<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="13" fill="none" stroke="#ffffff30" stroke-width="2"/>'
      + '<circle class="arc" cx="17" cy="17" r="13" fill="none" stroke="#cf5a45" stroke-width="2.5" stroke-dasharray="81.7" stroke-dashoffset="81.7" transform="rotate(-90 17 17)"/></svg><span>Skip</span>');
    dom.fade = el('div', 'mzs-fade', host);
    return dom;
  }

  // Fraction of the frame height visible inside the letterbox (1 when the bars are off).
  // The real UI sizes its bars with the CSS variable --mz-lb-size (vh or px per bar).
  function cinemaFrac() {
    if (!lbOn) return 1;
    const h = G.renderer?.domElement?.clientHeight || window.innerHeight;
    if (real('letterbox')) {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--mz-lb-size').trim();
      const n = parseFloat(v);
      if (Number.isFinite(n)) return Math.max(0.5, 1 - 2 * (v.endsWith('px') ? n / h : n / 100));
      return 0.78;
    }
    const w = G.renderer?.domElement?.clientWidth || window.innerWidth;
    return Math.min(1, (w / h) / CINE_ASPECT);
  }

  const api = {
    real,
    cinemaFrac,
    get letterboxed() { return lbOn; },
    get fadeLevel() { return fadeLevel; },

    letterbox(on) {
      lbOn = !!on;
      if (real('letterbox')) { G.ui.letterbox(lbOn); return; }
      const d = root();
      const frac = cinemaFrac();
      const pct = lbOn ? ((1 - frac) / 2) * 100 : 0;
      d.top.style.height = d.bot.style.height = `${pct}vh`;
    },

    // opts.italic: render the line in italics (Wiesia, songs).
    subtitle(name, text, seconds = 3, opts = {}) {
      // The real UI renders *text* in italics.
      if (real('subtitle')) { G.ui.subtitle(name || '', opts.italic ? `*${text}*` : text, seconds); return; }
      const d = root();
      const body = opts.italic ? `<span class="it">${esc(text)}</span>` : esc(text);
      d.sub.innerHTML = (name ? `<span class="who">${esc(name)}</span>` : '') + body;
      d.sub.classList.add('on');
      clearTimeout(subTimer);
      if (seconds > 0) subTimer = setTimeout(() => d.sub.classList.remove('on'), seconds * 1000);
    },

    clearSubtitle() {
      if (real('subtitle')) {
        if (typeof G.ui.clearSubtitle === 'function') G.ui.clearSubtitle();
        else G.ui.subtitle('', '', 0);
        return;
      }
      if (!dom) return;
      clearTimeout(subTimer);
      dom.sub.classList.remove('on');
    },

    // to: 1 = black, 0 = clear.
    fade(to, seconds = 1) {
      fadeLevel = to;
      if (real('fade')) return Promise.resolve(G.ui.fade(to, seconds));
      const d = root();
      d.fade.style.transition = seconds > 0 ? `opacity ${seconds}s ease` : 'none';
      // Force a style flush so the transition starts from the current value.
      void d.fade.offsetWidth;
      d.fade.style.opacity = String(to);
      return new Promise((r) => (seconds > 0 ? setTimeout(r, seconds * 1000) : r()));
    },

    titleCard(title, sub, seconds = 4.5) {
      if (real('titleCard')) {
        // The real card spends about 3.8 s fading in and out around its hold.
        G.ui.titleCard(title, sub, { hold: Math.max(0.8, seconds - 3.8) });
        return;
      }
      const d = root();
      d.card.innerHTML = `<div class="t">${esc(title)}</div><div class="th"></div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}`;
      d.card.classList.add('on');
      clearTimeout(d.card._t);
      d.card._t = setTimeout(() => d.card.classList.remove('on'), Math.max(0.5, seconds - 1.1) * 1000);
    },

    hideTitleCard() {
      if (real('titleCard')) { G.ui.hideTitleCard?.(); return; }
      if (dom) { clearTimeout(dom.card._t); dom.card.classList.remove('on'); }
    },

    choices(items, opts = {}) {
      if (real('choices')) {
        return Promise.resolve(G.ui.choices(items, opts)).then((i) => (Number.isInteger(i) ? i : -1));
      }
      return fallbackChoices(items, opts);
    },

    prompt(text) {
      if (real('prompt')) { G.ui.prompt(text || null); return; }
      const d = root();
      if (!text) { d.prompt.classList.remove('on'); return; }
      const m = /^\[(\w+)\]\s*(.*)$/.exec(text);
      d.prompt.innerHTML = m ? `<b>${esc(m[1])}</b>${esc(m[2])}` : esc(text);
      d.prompt.classList.add('on');
    },

    notify(text, kind = 'info') {
      if (real('notify')) { G.ui.notify(text, kind); return; }
      const d = root();
      const n = el('div', null, d.note, esc(text));
      setTimeout(() => { n.style.opacity = '0'; }, 3600);
      setTimeout(() => n.remove(), 4300);
    },

    // Progress 0..1 of the hold-to-skip ring, or null to hide it.
    skipRing(p) {
      if (real('skipRing')) { G.ui.skipRing(p); return; }
      const d = root();
      if (p == null) { d.skip.classList.remove('on'); return; }
      d.skip.classList.add('on');
      d.skip.querySelector('.arc').setAttribute('stroke-dashoffset', String(81.7 * (1 - Math.min(1, p))));
    },

    hud(show) {
      const h = G.ui?.hud;
      if (!h) return;
      if (show) h.show?.(); else h.hide?.();
    },

    title() {
      if (real('title')) return Promise.resolve(G.ui.title());
      return fallbackTitle();
    },
  };

  function fallbackChoices(items, { timer = 0, decisive = false } = {}) {
    const d = root();
    return new Promise((resolve) => {
      const box = el('div', 'mzs-ch', document.getElementById('ui-root') || document.body);
      let sel = 0;
      const rows = items.map((it, i) => {
        const row = el('div', `opt${it.seen ? ' seen' : ''}${i === 0 ? ' sel' : ''}`, box,
          `<span class="n">${i + 1}</span>${(it.decisive || decisive) ? '<span class="knot"></span>' : ''}<span>${esc(it.text)}</span>`);
        row.addEventListener('mousedown', (e) => { e.stopPropagation(); finish(i); });
        row.addEventListener('mouseenter', () => setSel(i));
        return row;
      });
      let bar = null;
      let tid = 0;
      if (timer > 0) {
        bar = el('div', 'timer', box);
        bar.style.transform = 'scaleX(1)';
        void bar.offsetWidth;
        bar.style.transitionDuration = `${timer}s`;
        bar.style.transform = 'scaleX(0)';
        tid = setTimeout(() => finish(-1), timer * 1000);
      }
      function setSel(i) {
        rows[sel]?.classList.remove('sel');
        sel = (i + rows.length) % rows.length;
        rows[sel]?.classList.add('sel');
      }
      function onKey(e) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= items.length) finish(n - 1);
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') setSel(sel + 1);
        else if (e.code === 'ArrowUp' || e.code === 'KeyW') setSel(sel - 1);
        else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') finish(sel);
      }
      window.addEventListener('keydown', onKey, true);
      let done = false;
      function finish(i) {
        if (done) return;
        done = true;
        clearTimeout(tid);
        window.removeEventListener('keydown', onKey, true);
        box.remove();
        resolve(i);
      }
      api._cancelChoices = () => finish(-1);
      // The harness and debug tools can answer for the player.
      api._pickChoice = (i) => finish(i);
      void d;
    });
  }

  function fallbackTitle() {
    root();
    return new Promise((resolve) => {
      const hasSave = !!G.state?.hasSave?.();
      const box = el('div', 'mzs-title', document.getElementById('ui-root') || document.body,
        '<div class="t">MARZENA</div><div class="th"></div>');
      const bNew = el('button', null, box, 'New Game');
      const bCont = el('button', null, box, 'Continue');
      bCont.disabled = !hasSave;
      const pick = (v) => {
        box.style.opacity = '0';
        setTimeout(() => box.remove(), 1200);
        resolve(v);
      };
      bNew.addEventListener('click', () => pick('new'));
      bCont.addEventListener('click', () => { if (hasSave) pick('continue'); });
    });
  }

  return api;
}
