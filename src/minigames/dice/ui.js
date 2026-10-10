// The dice game's screen: stake, round score, hand names, the opponent's remarks and the question being asked
// (raise or keep, call or fold, which dice to roll again). It opens as a modal screen of the UI (G.uiImpl.openScreen),
// so G.input.context is 'ui', the clock is held and pad buttons arrive as key events.
//
//   const ui = new DiceUI(G, { opp, stage })        ui.open() -> the screen; ui.close()
//   ui.header({ round, wins, need, coins, purse, pot })     ui.hands({ player: 'Pair of fives', opp: null }, { winner })
//   ui.say(name, text)  ui.note(text)  ui.banner(title, sub, tone)  ui.clearBanner()
//   await ui.askStake({ min, max, coins, purse })  -> number | null | LEAVE
//   await ui.askBet({ amount, pot, canRaise })      -> 'raise' | 'hold' | LEAVE
//   await ui.askRespond({ amount, pot, canCall })   -> 'call' | 'fold' | LEAVE
//   await ui.askReroll(dice)                        -> [bool x 5] (true: roll that die again) | LEAVE
//   await ui.askNext({ last })                      -> 'next' | 'done' | LEAVE
//   LEAVE                                           what an ask returns when the player gets up from the table
//
// Controls (all three work at all times; the footer shows the ones for the device in hand):
//   keyboard   1 to 5 pick a die, A and D or the arrows move the cursor, E picks the die under it, Space or Enter rolls,
//              R raises, W and S or the arrows move in a list, Enter or E chooses, Esc leaves the table
//   mouse      click a die to pick it, click a button
//   pad        D-pad or left stick moves, A picks, X or Start rolls, Y raises, B leaves
// The three actions dice_pick, dice_roll and dice_raise are rebindable (Controls screen, group Dice); the number
// keys are fixed. Pad buttons reach this screen as key events: padKey() turns them into the keyboard code of the same
// action (or a spare F-key code if that action has no key), so the same handler serves both.
import { h, svg, clear } from '../../ui/dom.js';
import { ICON } from '../../ui/icons.js';
import { actionGlyph, codeGlyph, navGlyph } from '../../ui/glyphs.js';
import { PAD_BINDINGS } from '../../core/Input.js';
import './dice.css';

export const LEAVE = Symbol('leave the table');
const PAD_CODE = { dice_pick: 'F15', dice_roll: 'F13', dice_raise: 'F14' };
const DIGITS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4 };
const word = (n) => ['no', 'one', 'two', 'three', 'four', 'five'][n] ?? String(n);
const grosze = (n) => `${n} grosze`;

export class DiceUI {
  constructor(G, { opp, stage }) {
    this.G = G;
    this.opp = opp;
    this.stage = stage;
    this.mode = 'none'; // none | stake | bet | respond | reroll | next | leave
    this.pending = null; // { resolve }
    this.items = [];
    this.sel = 0;
    this.focus = 2; // the die the cursor is on
    this.picked = [false, false, false, false, false];
    this.stakeValue = 1;
    this.stakeRange = [1, 1];
    this.scr = null;
    this.leaveWanted = false;
    this._back = null; // the ask a leave prompt interrupted
    this._barkT = 0;
    this._bannerT = 0;
    this._noteT = 0;
    this._hand = { player: null, opp: null };
    this._seenHint = { dice_pick: false, dice_raise: false };
    this._off = [];
  }

  // ---- building ------------------------------------------------------------------------------------------------
  open() {
    const G = this.G, ui = G.uiImpl;
    const mark = (cls) => svg(ICON.diamond, `dc-mark ${cls}`);
    this.markFn = mark;
    this.elOppName = h('div', { class: 'nm' }, this.opp.name);
    this.elOppScore = h('div', { class: 'sc' });
    this.elOppPurse = h('div', { class: 'pu' });
    this.elYouScore = h('div', { class: 'sc' });
    this.elYouPurse = h('div', { class: 'pu' });
    this.elRound = h('div', { class: 'rd' });
    this.elPot = h('div', { class: 'dc-pot' });
    this.elHead = h('div', { class: 'dc-head' },
      h('div', { class: 'dc-side opp' }, this.elOppName, this.elOppScore, this.elOppPurse),
      h('div', { class: 'dc-mid' }, this.elRound),
      h('div', { class: 'dc-side you' }, h('div', { class: 'nm' }, 'You'), this.elYouScore, this.elYouPurse));
    this.elBarkName = h('div', { class: 'bn' });
    this.elBarkText = h('div', { class: 'bt' });
    this.elBark = h('div', { class: 'dc-bark' }, this.elBarkName, this.elBarkText);
    this.elNote = h('div', { class: 'dc-note' });
    this.elBannerT = h('div', { class: 'bt' });
    this.elBannerS = h('div', { class: 'bs' });
    this.elBanner = h('div', { class: 'dc-banner' }, this.elBannerT, this.elBannerS);
    this.elHandOpp = h('div', { class: 'dc-hand opp' });
    this.elHandYou = h('div', { class: 'dc-hand you' });
    this.elNums = Array.from({ length: 5 }, (_, i) => h('div', { class: 'dc-num' }, String(i + 1)));
    this.elTtl = h('div', { class: 'ttl' });
    this.elSub = h('div', { class: 'sub' });
    this.elOpts = h('div', { class: 'opts' });
    this.elBar = h('div', { class: 'bar mz-hintbar' });
    this.elPanel = h('div', { class: 'dc-panel' }, h('i', { class: 'thread' }), this.elTtl, this.elSub, h('div', { class: 'foot' }, this.elOpts, this.elBar));
    this.el = h('div', { class: 'mz-dice' },
      h('div', { class: 'dc-vig' }), this.elHead, this.elBark, this.elNote, this.elBanner, this.elPot, this.elHandOpp, this.elHandYou, ...this.elNums, this.elPanel);
    this.scr = ui.openScreen({
      name: 'dice', el: this.el, swallow: true, onKey: (e) => this._key(e), onClose: () => this._closed(),
    });
    this.scr.padKey = (btn) => this._padKey(btn);
    ui.root.classList.add('dice-open');
    // The mouse: hover moves the cursor, a click picks.
    this.el.addEventListener('mousemove', (e) => this._hover(e));
    this.el.addEventListener('mousedown', (e) => { if (e.button === 0) this._click(e); });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this._off.push(G.events.on('input:device', () => this._bar()));
    this._off.push(G.events.on('input:bindings', () => this._bar()));
    this.setPanel(null);
    return this.scr;
  }

  close() {
    this.mode = 'none';
    if (this.pending) { const p = this.pending; this.pending = null; p.resolve(LEAVE); }
    for (const off of this._off) { try { off?.(); } catch { /* ignore */ } }
    this._off.length = 0;
    this.G.uiImpl?.root?.classList.remove('dice-open');
    this.scr?.close();
  }

  _closed() { /* the screen is gone; the session handles the rest */ }

  // ---- the header and the marks on the table ------------------------------------------------------------------------
  header({ round, wins, need = 2, coins, purse, pot, ante }) {
    const marks = (n) => Array.from({ length: need }, (_, i) => this.markFn(i < n ? 'on' : 'off'));
    clear(this.elOppScore); this.elOppScore.append(...marks(wins.opp));
    clear(this.elYouScore); this.elYouScore.append(...marks(wins.player));
    this.elOppPurse.textContent = `${purse} grosze`;
    this.elYouPurse.textContent = `${coins} grosze`;
    this.elRound.textContent = round ? `Round ${round}` : 'Dice';
    this.elPot.textContent = pot ? `Pot ${pot}` : '';
    this.elPot.classList.toggle('on', !!pot);
    this._ante = ante;
  }

  // The names of the two hands, over their rows. winner: 'player' | 'opp' | 'draw' | null styles the pair at the showdown.
  hands({ player, opp }, { winner = null } = {}) {
    this._hand = { player, opp };
    this.elHandYou.textContent = player || '';
    this.elHandOpp.textContent = opp || '';
    for (const [el, who] of [[this.elHandYou, 'player'], [this.elHandOpp, 'opp']]) {
      el.classList.toggle('on', !!(who === 'player' ? player : opp));
      el.classList.toggle('won', winner === who);
      el.classList.toggle('lost', !!winner && winner !== 'draw' && winner !== who);
    }
  }

  say(name, text, seconds = 3.2) {
    this.elBarkName.textContent = name;
    this.elBarkText.textContent = text;
    this.elBark.classList.add('on');
    this._barkT = seconds;
  }

  note(text, seconds = 2.2) {
    this.elNote.textContent = text;
    this.elNote.classList.add('on');
    this._noteT = seconds;
  }

  banner(title, sub = '', tone = 'plain', seconds = 0) {
    this.elBannerT.textContent = title;
    this.elBannerS.textContent = sub;
    this.elBanner.dataset.tone = tone;
    this.elBanner.classList.add('on');
    this._bannerT = seconds;
  }

  clearBanner() { this.elBanner.classList.remove('on'); }

  // Per frame: fade the remarks, and put the labels on the table where the camera sees it.
  update(dt) {
    if (this._barkT > 0 && (this._barkT -= dt) <= 0) this.elBark.classList.remove('on');
    if (this._noteT > 0 && (this._noteT -= dt) <= 0) this.elNote.classList.remove('on');
    if (this._bannerT > 0 && (this._bannerT -= dt) <= 0) this.clearBanner();
    const st = this.stage;
    if (!st || !this.el?.isConnected) return;
    const place = (el, p) => { el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`; };
    place(this.elPot, st.screenOfPoint(-0.3, 0, 0.085));
    if (this._hand.player) place(this.elHandYou, st.screenOfPoint(0, 0, 0.075));
    if (this._hand.opp) place(this.elHandOpp, st.screenOfPoint(0, 0, -0.275));
    const show = this.mode === 'reroll';
    this.elNums.forEach((el, i) => {
      el.classList.toggle('on', show);
      el.classList.toggle('pick', show && this.picked[i]);
      el.classList.toggle('cur', show && this.focus === i);
      if (show) place(el, st.screenOfPoint((i - 2) * 0.085, 0, 0.22));
    });
  }

  // ---- the panel: a title, a line, a list of choices ------------------------------------------------------------------
  setPanel(title, sub = '', items = [], sel = 0) {
    this.elPanel.classList.toggle('on', !!title);
    this.elOpts.classList.toggle('row', this.mode !== 'stake');
    this.elTtl.textContent = title || '';
    this.elSub.textContent = sub;
    this.items = items;
    this.sel = Math.max(0, Math.min(items.length - 1, sel));
    this._renderItems();
    this._bar();
  }

  _renderItems() {
    clear(this.elOpts);
    this.items.forEach((it, i) => {
      const b = h('button', { class: `opt${it.disabled ? ' dis' : ''}${i === this.sel ? ' sel' : ''}`, type: 'button', tabindex: '-1' },
        svg(ICON.knot, 'mk'), h('span', { class: 'lab' }, it.label), it.detail ? h('span', { class: 'det' }, it.detail) : null);
      b.addEventListener('mouseenter', () => { if (this.sel !== i && !it.disabled) { this.sel = i; this._paintItems(); this._sfx('ui_hover', 0.25); } });
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      b.addEventListener('click', (e) => { e.stopPropagation(); if (!it.disabled) { this.sel = i; this._choose(); } });
      this.elOpts.appendChild(b);
    });
  }

  _paintItems() {
    [...this.elOpts.children].forEach((b, i) => b.classList.toggle('sel', i === this.sel));
  }

  _bar() {
    if (!this.elBar) return;
    const G = this.G;
    clear(this.elBar);
    const it = (glyph, label) => h('span', { class: 'it' }, glyph, h('span', { class: 'lab' }, label));
    const nums = h('span', { class: 'mz-caps' }, ...['1', '2', '3', '4', '5'].map((n) => codeGlyph(`Digit${n}`)));
    const pad = G.input?.device === 'pad';
    const nav = (kind) => navGlyph(G, kind);
    const leave = it(nav('back'), 'Leave');
    switch (this.mode) {
      case 'reroll':
        this.elBar.append(
          pad ? it(nav('leftright'), 'Move') : it(nums, 'Pick a die'),
          it(actionGlyph(G, 'dice_pick'), pad ? 'Pick' : 'Pick this one'),
          it(actionGlyph(G, 'dice_roll', { all: !pad }), 'Roll'), leave);
        break;
      case 'bet':
        this.elBar.append(it(nav('updown'), 'Choose'), it(actionGlyph(G, 'dice_raise'), 'Raise'), it(nav('confirm'), 'Select'), leave);
        break;
      case 'stake':
        this.elBar.append(it(nav('leftright'), 'Change the stake'), it(nav('updown'), 'Choose'), it(nav('confirm'), 'Select'), leave);
        break;
      case 'respond': case 'next': case 'leave':
        this.elBar.append(it(nav('updown'), 'Choose'), it(nav('confirm'), 'Select'));
        break;
      default: break;
    }
  }

  _sfx(name, volume = 0.5) { try { this.G.audio?.sfx?.(name, { volume }); } catch { /* optional */ } }

  _ask(mode) {
    this.mode = mode;
    this._bar();
    return new Promise((resolve) => { this.pending = { resolve }; });
  }

  _done(value) {
    const p = this.pending;
    this.pending = null;
    this.mode = 'none';
    this.setPanel(null);
    this.stage?.setFocus(-1);
    this.stage?.setSelected(null);
    p?.resolve(value);
  }

  // ---- the questions -------------------------------------------------------------------------------------------------
  askStake({ min, max, coins, purse }) {
    this.stakeRange = [min, max];
    this.stakeValue = Math.min(max, Math.max(min, this.stakeValue || min));
    this._stakeInfo = { coins, purse };
    this._renderStake();
    return this._ask('stake');
  }

  _renderStake() {
    const { coins, purse } = this._stakeInfo;
    const [min, max] = this.stakeRange;
    const v = this.stakeValue;
    this.elPanel.classList.add('on');
    this.elOpts.classList.remove('row');
    this.elTtl.textContent = 'What will you stake?';
    this.elSub.textContent = `Each round you both put in ${grosze(v)}. A raise adds the same again. First to win two rounds takes the match. You have ${coins}, ${this.opp.name} has ${purse}.`;
    this.items = [
      { id: 'amount', label: `Stake ${grosze(v)}`, detail: `${min} to ${max}`, amount: true },
      { id: 'play', label: 'Sit down and play' },
      { id: 'no', label: 'Not now' },
    ];
    this.sel = Math.min(this.sel, 2);
    this._renderItems();
    const amt = this.elOpts.children[0];
    if (amt) {
      const lt = h('span', { class: 'arr l' }, svg('<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'));
      const rt = h('span', { class: 'arr r' }, svg('<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'));
      lt.addEventListener('click', (e) => { e.stopPropagation(); this._stake(-1); });
      rt.addEventListener('click', (e) => { e.stopPropagation(); this._stake(1); });
      amt.append(lt, rt);
    }
    this._bar();
  }

  _stake(d) {
    const [min, max] = this.stakeRange;
    const v = Math.max(min, Math.min(max, this.stakeValue + d));
    if (v === this.stakeValue) { this._sfx('ui_hover', 0.15); return; }
    this.stakeValue = v;
    this._sfx('dice_tick', 0.5);
    this._renderStake();
  }

  askBet({ amount, pot, canRaise }) {
    this._betAmount = amount;
    this.setPanel('Raise, or keep the stake?', `The pot is ${grosze(pot)}. A raise puts ${amount} more in from each of you, and the other side may fold.`, [
      { id: 'raise', label: `Raise by ${amount}`, disabled: !canRaise, detail: canRaise ? '' : 'not enough' },
      { id: 'hold', label: 'Keep the stake' },
    ], canRaise ? 1 : 1);
    this._hint('dice_raise');
    return this._ask('bet');
  }

  askRespond({ amount, pot, canCall }) {
    this.setPanel(`${this.opp.name} raises by ${amount}`, `The pot is ${grosze(pot)}. Call to put ${amount} in, or fold and lose your stake.`, [
      { id: 'call', label: `Call, ${amount} more`, disabled: !canCall },
      { id: 'fold', label: 'Fold' },
    ], canCall ? 0 : 1);
    return this._ask('respond');
  }

  askReroll(dice) {
    this.picked = [false, false, false, false, false];
    this.focus = 2;
    this._rerollDice = dice;
    this._renderReroll();
    this._hint('dice_pick');
    this.stage.setFocus(this.focus);
    this.stage.setSelected(this.picked);
    this.stage.lift('player', this.picked);
    return this._ask('reroll');
  }

  _renderReroll() {
    const n = this.picked.filter(Boolean).length;
    const label = n === 0 ? 'Keep all five' : `Roll ${word(n)} ${n === 1 ? 'die' : 'dice'} again`;
    this.setPanel('Which dice will you roll again?', n === 0 ? 'Pick none to keep what you have. You roll once more.' : `You keep ${word(5 - n)}.`, [{ id: 'roll', label }], 0);
    this.mode = 'reroll';
    this._bar();
  }

  askNext({ last = false } = {}) {
    this.setPanel(null);
    if (last) this.setPanel('The match is over', '', [{ id: 'done', label: 'Get up from the table' }], 0);
    else this.setPanel('Another round', '', [{ id: 'next', label: 'Next round' }, { id: 'done', label: 'Leave the table' }], 0);
    return this._ask('next');
  }

  // ---- hints ------------------------------------------------------------------------------------------------------------
  _hint(id) {
    const H = this.G.hints;
    if (!H || this._seenHint[id] || !H.enabled || H.seen(id)) return;
    this._seenHint[id] = true;
    H.show(id, { force: true });
  }

  // ---- choosing ------------------------------------------------------------------------------------------------------------
  _choose() {
    const it = this.items[this.sel];
    if (!it || it.disabled) { this._sfx('ui_hover', 0.2); return; }
    switch (this.mode) {
      case 'stake':
        if (it.id === 'no') { this._sfx('ui_close', 0.4); this._done(null); } else { this._sfx('ui_select', 0.5); this._done(this.stakeValue); }
        break;
      case 'bet':
        if (it.id === 'raise') this._emit('dice:raise');
        this._sfx('ui_select', 0.5);
        this._done(it.id);
        break;
      case 'respond':
        this._sfx('ui_select', 0.5);
        this._done(it.id);
        break;
      case 'reroll':
        this._emit('dice:roll');
        this._sfx('ui_select', 0.4);
        this._done([...this.picked]);
        break;
      case 'next':
        this._sfx('ui_select', 0.5);
        this._done(it.id);
        break;
      case 'leave': {
        const ok = it.id === 'leave';
        this._sfx('ui_select', 0.5);
        this._leaveAnswer(ok);
        break;
      }
      default: break;
    }
  }

  _emit(name) { this.G.events.emit(name, {}); }

  _toggle(i) {
    if (this.mode !== 'reroll' || i < 0 || i > 4) return;
    this.picked[i] = !this.picked[i];
    this.focus = i;
    this._emit('dice:pick');
    this._sfx('dice_tick', 0.7);
    this.stage.setFocus(i);
    this.stage.setSelected(this.picked);
    this.stage.lift('player', this.picked);
    this._renderReroll();
  }

  _move(d) {
    if (this.mode === 'reroll') {
      this.focus = (this.focus + d + 5) % 5;
      this.stage.setFocus(this.focus);
      this._sfx('ui_hover', 0.2);
      return;
    }
    const n = this.items.length;
    if (!n) return;
    let i = this.sel;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!this.items[i].disabled) break; }
    if (i !== this.sel) { this.sel = i; this._paintItems(); this._sfx('ui_hover', 0.25); }
  }

  // ---- leaving ---------------------------------------------------------------------------------------------------------------
  _askLeave() {
    if (this.mode === 'leave') return;
    this._back = { mode: this.mode, items: this.items, sel: this.sel, ttl: this.elTtl.textContent, sub: this.elSub.textContent, stake: this.mode === 'stake' };
    this.mode = 'leave';
    this.setPanel('Leave the table?', this._back.mode === 'next' ? '' : 'The round in play is lost, and what you have staked in it.', [{ id: 'stay', label: 'Stay' }, { id: 'leave', label: 'Leave' }], 0);
    this._bar();
  }

  _leaveAnswer(leave) {
    const b = this._back;
    this._back = null;
    if (leave) {
      this.mode = 'none';
      const p = this.pending;
      this.pending = null;
      this.setPanel(null);
      p?.resolve(LEAVE);
      return;
    }
    if (!b) { this.mode = 'none'; return; }
    this.mode = b.mode;
    if (b.stake) { this.sel = b.sel; this._renderStake(); return; }
    this.setPanel(b.ttl, b.sub, b.items, b.sel);
    if (b.mode === 'reroll') this._renderReroll();
    this._bar();
  }

  // For the session between asks: Esc pressed while nothing is being asked.
  takeLeaveRequest() { const w = this.leaveWanted; this.leaveWanted = false; return w; }

  async confirmLeave() {
    // Ask now, with nothing else pending.
    this._back = { mode: 'none', items: [], sel: 0, ttl: '', sub: '' };
    this.mode = 'leave';
    this.setPanel('Leave the table?', 'The round in play is lost, and what you have staked in it.', [{ id: 'stay', label: 'Stay' }, { id: 'leave', label: 'Leave' }], 0);
    this._bar();
    const r = await new Promise((resolve) => { this.pending = { resolve }; });
    return r === LEAVE;
  }

  // ---- keys and pointer --------------------------------------------------------------------------------------------------------
  _is(action, e) {
    return this.G.input.matches(action, e.code) || e.code === PAD_CODE[action];
  }

  _key(e) {
    if (e.repeat && !/Arrow|Key[ADWS]/.test(e.code)) return true;
    const code = e.code;
    if (code === 'Escape') {
      if (this.mode === 'leave') { this._leaveAnswer(false); return true; }
      if (this.mode === 'none') { this.leaveWanted = true; return true; }
      this._askLeave();
      return true;
    }
    if (this.mode === 'none') return true;
    const left = code === 'ArrowLeft' || code === 'KeyA', right = code === 'ArrowRight' || code === 'KeyD';
    const up = code === 'ArrowUp' || code === 'KeyW', down = code === 'ArrowDown' || code === 'KeyS';
    if (this.mode === 'reroll') {
      if (code in DIGITS) { this._toggle(DIGITS[code]); return true; }
      if (left) { this._move(-1); return true; }
      if (right) { this._move(1); return true; }
      if (this._is('dice_pick', e)) { this._toggle(this.focus); return true; }
      if (this._is('dice_roll', e) || code === 'Enter' || code === 'NumpadEnter') { this._choose(); return true; }
      return true;
    }
    if (this.mode === 'stake') {
      if (left) { this._stake(-1); return true; }
      if (right) { this._stake(1); return true; }
    }
    if (up || (left && this.mode !== 'stake')) { this._move(-1); return true; }
    if (down || (right && this.mode !== 'stake')) { this._move(1); return true; }
    if (this.mode === 'bet' && this._is('dice_raise', e)) {
      const i = this.items.findIndex((x) => x.id === 'raise');
      if (i >= 0 && !this.items[i].disabled) { this.sel = i; this._paintItems(); this._choose(); }
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || this._is('dice_roll', e) || this._is('dice_pick', e)) { this._choose(); return true; }
    return true;
  }

  // Which key stands for a pad button on this screen (the Input class turns the button into a key event of that code).
  _padKey(btn) {
    for (const action of ['dice_roll', 'dice_raise', 'dice_pick']) {
      if (!(PAD_BINDINGS[action] || []).includes(btn)) continue;
      if (action === 'dice_pick' && this.mode !== 'reroll') return 'Enter';
      return PAD_CODE[action];
    }
    return undefined; // the defaults: the D-pad is the arrows, B is Escape
  }

  _dieAt(e) { return this.mode === 'reroll' ? this.stage.pick(e.clientX, e.clientY) : -1; }

  _hover(e) {
    const i = this._dieAt(e);
    this.el.classList.toggle('over', i >= 0);
    if (i >= 0 && i !== this.focus) { this.focus = i; this.stage.setFocus(i); }
  }

  _click(e) {
    const i = this._dieAt(e);
    if (i >= 0) this._toggle(i);
  }
}

