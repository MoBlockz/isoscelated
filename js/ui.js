// ISOSCELATED - input, immediate-mode retro UI widgets, text boxes, saved profile.
'use strict';
const UI = {};
(function () {
  const P = G.P;
  // ---------- saved profile (localStorage) ----------
  const LS = 'isoscelated.profile.v1';
  UI.prof = (function () {
    let p = null; try { p = JSON.parse(localStorage.getItem(LS)); } catch (e) { }
    const d = { name: '', look: G.randomLook(), music: 'auto', musicVol: 0.6, sfxVol: 0.8, token: Math.random().toString(36).slice(2) + Date.now().toString(36), seenHelp: false };
    return Object.assign(d, p || {});
  })();
  UI.save = function () { try { localStorage.setItem(LS, JSON.stringify(UI.prof)); } catch (e) { } };
  UI.save();

  // ---------- input ----------
  UI.keys = {}; UI.pressed = []; UI.taps = []; UI.ptrs = new Map(); UI.ptr = { x: 0, y: 0, down: false, id: null, justDown: false, justUp: false };
  UI.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  UI.dpad = { id: null, x: 0, y: 0, cx: 0, cy: 0, r: 0, on: false, dx: 0, dy: 0 };
  UI.typing = () => document.activeElement && document.activeElement.id === 'askin';
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Enter: 'ok', Space: 'ok', NumpadEnter: 'ok', Escape: 'back', Backspace: 'bksp', KeyE: 'use', KeyQ: 'hex', KeyF: 'special', KeyR: 'report', KeyM: 'map', KeyC: 'quick', KeyT: 'chat', KeyX: 'sab', Tab: 'tab', ShiftLeft: 'special', ShiftRight: 'special' };
  window.addEventListener('keydown', e => {
    if (UI.typing()) { if (e.key === 'Escape') { UI.askClose(null); } return; }
    const k = KEYMAP[e.code]; if (k) { if (!UI.keys[k]) UI.pressed.push(k); UI.keys[k] = true; }
    UI.pressed.push('key:' + e.key);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace'].includes(e.code)) e.preventDefault();
    Snd.init();
  });
  window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) UI.keys[k] = false; });
  window.addEventListener('blur', () => { UI.keys = {}; });
  UI.hit = k => UI.pressed.includes(k);
  UI.held = k => !!UI.keys[k];
  UI.eat = k => { let i; while ((i = UI.pressed.indexOf(k)) >= 0) UI.pressed.splice(i, 1); };
  const cv = G.disp;
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); Snd.init(); if (UI.typing() && UI.askMode !== 'chat') document.activeElement.blur();
    const [x, y] = G.toInternal(e.clientX, e.clientY);
    if (e.pointerType === 'touch') UI.isTouch = true;
    try { cv.setPointerCapture(e.pointerId); } catch (x) { }
    if (UI.dpad.on && UI.dpad.id === null && Math.hypot(x - UI.dpad.cx, y - UI.dpad.cy) < UI.dpad.r * 1.5) { UI.dpad.id = e.pointerId; setDpad(x, y); return; }
    UI.ptrs.set(e.pointerId, { x, y }); UI.taps.push({ x, y });
    if (UI.ptr.id === null) { UI.ptr.id = e.pointerId; UI.ptr.x = x; UI.ptr.y = y; UI.ptr.down = true; UI.ptr.justDown = true; }
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = G.toInternal(e.clientX, e.clientY);
    if (e.pointerId === UI.dpad.id) { setDpad(x, y); return; }
    if (UI.ptrs.has(e.pointerId)) UI.ptrs.set(e.pointerId, { x, y });
    if (UI.ptr.id === e.pointerId || (UI.ptr.id === null && e.pointerType === 'mouse')) { UI.ptr.x = x; UI.ptr.y = y; }
  });
  const up = e => {
    if (e.pointerId === UI.dpad.id) { UI.dpad.id = null; UI.dpad.dx = UI.dpad.dy = 0; return; }
    UI.ptrs.delete(e.pointerId);
    if (UI.ptr.id === e.pointerId) { UI.ptr.id = null; UI.ptr.down = false; UI.ptr.justUp = true; }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  function setDpad(x, y) { const dx = x - UI.dpad.cx, dy = y - UI.dpad.cy, d = Math.hypot(dx, dy); if (d < 4) { UI.dpad.dx = UI.dpad.dy = 0; return; } const k = Math.min(1, d / UI.dpad.r); UI.dpad.dx = dx / d * k; UI.dpad.dy = dy / d * k; }
  UI.anyHeldIn = function (x, y, w, h) { for (const p of UI.ptrs.values()) if (p.x >= x && p.y >= y && p.x < x + w && p.y < y + h) return true; return false; };
  UI.endInput = function () { UI.pressed.length = 0; UI.taps.length = 0; UI.ptr.justDown = false; UI.ptr.justUp = false; };

  // ---------- immediate-mode buttons with keyboard focus groups ----------
  let btns = [], groupOrder = [], curGroup = 'base';
  UI.focus = {};
  UI.group = g => { curGroup = g; if (!groupOrder.includes(g)) groupOrder.push(g); };
  UI.beginFrame = () => { btns = []; groupOrder = []; curGroup = 'base'; };
  // register a clickable area; opts: {cb, nav, lr(delta), hold}
  UI.area = function (x, y, w, h, cb, opts) { const b = Object.assign({ x, y, w, h, cb, g: curGroup, i: btns.length }, opts || {}); btns.push(b); return b; };
  UI.blocker = function (cb) { UI.area(0, 0, G.W, G.H, cb || (() => { }), { block: true }); };
  function navButtons(g) { return btns.filter(b => b.g === g && b.nav); }
  UI.isFocused = function (b) { const nb = navButtons(b.g), f = UI.focus[b.g] | 0; return UI.navGroup() === b.g && nb[Math.min(f, nb.length - 1)] === b; };
  UI.navGroup = function () { for (let i = groupOrder.length - 1; i >= 0; i--) if (navButtons(groupOrder[i]).length) return groupOrder[i]; return null; };
  UI.endFrame = function () {
    // taps: last registered (top-most) wins
    for (const t of UI.taps) {
      for (let i = btns.length - 1; i >= 0; i--) { const b = btns[i]; if (t.x >= b.x && t.y >= b.y && t.x < b.x + b.w && t.y < b.y + b.h) { if (b.nav) { const nb = navButtons(b.g); UI.focus[b.g] = nb.indexOf(b); } if (b.cb) { b.cb(t); if (!b.silent) Snd.sfx('click'); } break; } }
    }
    // keyboard navigation in the top-most group
    const g = UI.navGroup(); if (!g || UI.sayBlocking()) return;
    const nb = navButtons(g); let f = Math.min(UI.focus[g] | 0, nb.length - 1); const cur = nb[f];
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    for (const k of ['up', 'down', 'left', 'right']) if (UI.hit(k)) {
      if ((k === 'left' || k === 'right') && cur && cur.lr) { cur.lr(k === 'left' ? -1 : 1); Snd.sfx('click'); continue; }
      const [dx, dy] = dirs[k]; let best = -1, bs = 1e9; const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
      nb.forEach((b, i) => { if (b === cur) return; const bx = b.x + b.w / 2 - cx, by = b.y + b.h / 2 - cy; const along = bx * dx + by * dy; if (along <= 2) return; const across = Math.abs(bx * dy) + Math.abs(by * dx); const s = along + across * 2.5; if (s < bs) { bs = s; best = i; } });
      if (best < 0 && (k === 'up' || k === 'down')) best = (f + (k === 'down' ? 1 : nb.length - 1)) % nb.length; // wrap
      if (best >= 0) { f = best; Snd.sfx('click'); }
    }
    UI.focus[g] = f;
    if (UI.hit('ok') && nb[f] && nb[f].cb) { Snd.sfx('select'); nb[f].cb({ key: true }); }
  };

  // drawn button. style: 'big' | 'small' | 'round'
  UI.button = function (x, y, w, h, label, cb, opts) {
    opts = opts || {}; x = Math.round(x); y = Math.round(y);
    const b = UI.area(x, y, w, h, opts.disabled ? (opts.onDisabled || null) : cb, { nav: opts.nav !== false, lr: opts.lr, silent: opts.silent });
    const foc = UI.isFocused(b), pressed = UI.anyHeldIn(x, y, w, h);
    const col = opts.disabled ? P.grey : (opts.col || P.white), py = pressed ? 1 : 0;
    G.rect(x + 1, y + 2, w - 1, h - 1, P.ink);
    G.box(x, y + py, w - 1, h - 1, col, P.ink);
    if (opts.icon) opts.icon(x, y + py);
    const tc = opts.tc || (opts.disabled ? P.mid : P.ink);
    if (label) { const sc = opts.sc || 1; G.text(label, x + w / 2 + (opts.icon ? 6 : 0), y + py + Math.floor((h - 8 * sc) / 2), tc, { al: 'c', sc }); }
    if (foc && !opts.noCursor) { G.text('▶', x - 9, y + Math.floor((h - 8) / 2) + py, (performance.now() / 300 | 0) % 2 ? P.white : P.yellow, { ol: P.ink }); }
    return b;
  };
  // round action button for gameplay (A/B style)
  UI.action = function (x, y, r, label, cb, opts) {
    opts = opts || {}; const ctx = G.ctx; x = Math.round(x); y = Math.round(y);
    const b = UI.area(x - r, y - r, r * 2, r * 2, opts.disabled ? null : cb, { nav: false, hold: opts.hold, silent: true });
    const pressed = UI.anyHeldIn(x - r, y - r, r * 2, r * 2) && !opts.disabled;
    const col = opts.disabled ? '#7d7690' : (opts.col || P.red);
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(x, y + 2, r, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y + (pressed ? 2 : 0), r - 1, 0, 7); ctx.fill();
    ctx.fillStyle = G.shade(col, 1.25); ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35 + (pressed ? 2 : 0), r * 0.3, 0, 7); ctx.fill();
    G.text(label, x, y - 4 + (pressed ? 2 : 0), P.white, { al: 'c', ol: P.ink });
    if (opts.key && !UI.isTouch) G.tiny(opts.key, x + r - 5, y - r - 2, P.yellow);
    if (opts.cd > 0) { G.text(String(Math.ceil(opts.cd)), x, y + 6, P.yellow, { al: 'c', ol: P.ink }); }
    return b;
  };

  // ---------- RPG text box (typewriter) ----------
  const sayQ = [];
  UI.say = function (text, opts) { sayQ.push(Object.assign({ text: String(text), n: 0, t: 0 }, opts || {})); };
  UI.sayClear = () => { sayQ.length = 0; };
  UI.sayActive = () => sayQ.length > 0;
  UI.sayBlocking = () => sayQ.length > 0 && !sayQ[0].auto;
  UI.drawSay = function (dt) {
    if (!sayQ.length) return;
    const s = sayQ[0]; s.t += dt;
    const before = Math.floor(s.n); s.n = Math.min(s.text.length, s.n + dt * 45); if (Math.floor(s.n) > before && s.text[Math.floor(s.n) - 1] !== ' ') Snd.sfx('blip');
    const w = Math.min(G.W - 8, 360), maxc = Math.floor((w - 20) / 8);
    const lines = G.wrap(s.text.slice(0, Math.floor(s.n)), maxc), all = G.wrap(s.text, maxc);
    const h = all.length * 11 + 16, x = Math.floor((G.W - w) / 2), y = s.top ? 6 : G.H - h - 6;
    G.box(x, y, w, h, s.col || P.white);
    lines.forEach((l, i) => G.text(l, x + 10, y + 9 + i * 11, s.tc || P.ink));
    const done = s.n >= s.text.length;
    if (!s.auto) {
      if (done && (performance.now() / 350 | 0) % 2) G.text('▼', x + w - 16, y + h - 12, P.ink);
      UI.area(0, 0, G.W, G.H, () => adv(), { block: true, silent: true });
      if (UI.hit('ok') || UI.hit('use')) { adv(); UI.eat('ok'); UI.eat('use'); }
    } else if (done && s.t > s.text.length / 45 + s.auto) { sayQ.shift(); }
    function adv() { if (s.n < s.text.length) s.n = s.text.length; else { sayQ.shift(); Snd.sfx('select'); if (s.cb) s.cb(); } }
  };

  // ---------- DOM text input (needed for phone/iPad keyboards) ----------
  const bar = document.getElementById('askbar'), inp = document.getElementById('askin'), lbl = document.getElementById('asklbl');
  let askCb = null; UI.askMode = null;
  UI.ask = function (prompt, value, max, cb, mode) {
    askCb = cb; UI.askMode = mode || 'text'; lbl.textContent = prompt; inp.value = value || ''; inp.maxLength = max || 100;
    bar.style.display = 'flex'; setTimeout(() => { inp.focus(); inp.select && mode !== 'chat' && inp.select(); }, 30);
  };
  UI.askOpen = () => bar.style.display === 'flex';
  UI.askClose = function (val) { bar.style.display = 'none'; inp.blur(); const cb = askCb; askCb = null; UI.askMode = null; if (cb) cb(val); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = inp.value; if (UI.askMode === 'chat') { inp.value = ''; if (askCb) askCb(v, true); } else UI.askClose(v); } });
  document.getElementById('askok').addEventListener('click', () => { const v = inp.value; if (UI.askMode === 'chat') { inp.value = ''; if (askCb) askCb(v, true); inp.focus(); } else UI.askClose(v); });
  document.getElementById('askx').addEventListener('click', () => UI.askClose(null));

  // ---------- misc drawing helpers ----------
  UI.bg = function (t, c1, c2) { // scrolling checker background
    const ctx = G.ctx; ctx.fillStyle = c1 || '#2b2140'; ctx.fillRect(0, 0, G.W, G.H); ctx.fillStyle = c2 || '#33284c';
    const o = (t * 10) % 32; for (let y = -32; y < G.H + 32; y += 16) for (let x = -32; x < G.W + 32; x += 16) if (((x + y) / 16) % 2 === 0) ctx.fillRect(Math.round(x + o), Math.round(y + o), 16, 16);
  };
  // value row: label  ◀ value ▶
  UI.valueRow = function (x, y, w, label, val, lr, opts) {
    opts = opts || {};
    const b = UI.area(x, y, w, 12, () => { }, { nav: true, lr: opts.disabled ? null : lr, silent: true });
    const foc = UI.isFocused(b);
    if (foc) G.rect(x - 2, y - 2, w + 4, 13, opts.dark ? '#4a3d63' : P.light);
    if (foc) G.text('▶', x - 10, y, opts.dark ? P.yellow : P.ink);
    const c = opts.disabled ? P.mid : (opts.dark ? P.white : P.ink);
    G.text(label, x + 2, y, c);
    const vx = x + w - 2; G.text(String(val), vx - 12, y, opts.warn ? P.red : (opts.dark ? P.yellow : P.dblue), { al: 'r' });
    if (!opts.disabled) {
      const tw = String(val).length * 8;
      UI.area(vx - tw - 26, y - 2, 12, 12, () => lr(-1), { silent: false }); G.text('◀', vx - tw - 24, y, c);
      UI.area(vx - 11, y - 2, 12, 12, () => lr(1)); G.text('▶', vx - 10, y, c);
    }
    return b;
  };
  UI.fmtT = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
})();
