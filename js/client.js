// ISOSCELATED - the player's client: connects to the host, predicts own movement, smooths others,
// draws the world, HUD, meetings, overlays. Also the session lifecycle (create / join / practice).
'use strict';
const Game = {};
(function () {
  const P = G.P, T = World.T;
  const QUICK = ['Where are you?', 'Follow me!', "I'm doing tasks", 'Help!', 'Nice!', 'Over here!', 'Stick together!', 'I saw something!', '@thumbs', '@question', '@heart', '@laugh', '@shocked'];
  Game.QUICK = QUICK;
  const TYPE_NAME = { classic: 'CLASSIC', shift: 'SHAPESHIFTER', plant: 'PLANTER' };
  const TYPE_INFO = {
    classic: 'No special power, but a shorter Hex cooldown and a bigger vision circle.',
    shift: 'SHIFT (F): copy any player\'s full look for a while. Hex in disguise to fool witnesses!',
    plant: 'PLANT (F): secretly curse a Shape. The next Shape they get close to is zapped FROM them!'
  };
  Game.TYPE_NAME = TYPE_NAME; Game.TYPE_INFO = TYPE_INFO;
  let C = null; Game.C = () => C;
  Game.inSession = () => !!C;

  // ---------- session lifecycle ----------
  function newSession(mode) {
    return {
      mode, id: mode === 'join' ? null : 'h', code: '', phase: 'lobby', roster: [], byId: {}, settings: Object.assign({}, Server.DEF), inbox: [],
      me: { x: 12 * T, y: 8 * T, dir: 0, mv: 0, anim: 0, tpSeq: 0, stepT: 0 }, mine: { alive: 1, tasks: [] }, others: new Map(), bodies: [], snap: null,
      chat: [], bubbles: {}, toasts: [], overlay: null, reveal: null, meetFx: null, eject: null, over: null, muted: new Set(), oopsT: 0,
      sendT: 0, map: World.buildLobby(), rattle: {}, wobble: {}, vis: 92, lastRoom: '', roomT: 0, holding: false, card: null, chatOpen: false, chatCh: 'all',
      seenBodies: new Set(), jukebox: null, connected: false, scroll: 0, practice: mode === 'practice', lastChatSent: 0, hexedT: -1, meetCount: 0
    };
  }
  Game.create = function () {
    C = newSession('host'); Game.screen = 'connecting'; Game.connMsg = 'Creating lobby';
    const bots = +(new URLSearchParams(location.search).get('bots') || 0);
    Server.start({
      me: { name: UI.prof.name, look: UI.prof.look, token: UI.prof.token }, bots,
      deliver: m => C && C.inbox.push(m),
      onReady: code => { if (!C) return; C.code = code; C.connected = true; Game.screen = 'session'; },
      onError: m => { Game.toMenu(m); }
    });
  };
  Game.practice = function () {
    C = newSession('practice'); Game.screen = 'session';
    Server.start({ practice: true, me: { name: UI.prof.name || 'YOU', look: UI.prof.look, token: UI.prof.token }, deliver: m => C && C.inbox.push(m), onReady: () => { C.connected = true; }, onError: m => Game.toMenu(m) });
    UI.say('PRACTICE MODE! Walk around, try the chores, and open the MENU (or press Esc) to become a Hexagoner and test powers on the dummies.');
  };
  Game.join = function (code) {
    C = newSession('join'); Game.screen = 'connecting'; Game.connMsg = 'Connecting';
    const sess = C;
    C.link = Net.join(code, {
      onOpen: conn => { if (C !== sess) return; C.conn = conn; C.code = code; conn.send({ t: 'hello', name: UI.prof.name, look: UI.prof.look, token: UI.prof.token }); },
      onMsg: m => { if (C === sess) C.inbox.push(m); },
      onClose: () => { if (C === sess && !C.leaving) Game.toMenu(C.errMsg || 'Host left the lobby.'); },
      onError: m => { if (C === sess) Game.toMenu(m); }
    });
  };
  Game.leave = function () { if (!C) return; C.leaving = true; if (C.mode === 'join') C.link && C.link.close(); else Server.stop(); C = null; UI.askClose(null); Tasks.close(); };
  Game.toMenu = function (msg, toCustomize) {
    const wasBadName = toCustomize;
    if (C) { C.leaving = true; if (C.mode === 'join') C.link && C.link.close(); else Server.stop(); }
    C = null; Tasks.close(); if (UI.askOpen()) UI.askClose(null); UI.sayClear();
    Game.screen = wasBadName ? 'customize' : 'menu';
    if (msg) UI.say(msg);
  };
  function send(m) { if (!C) return; if (C.mode === 'join') { if (C.conn && C.conn.open) try { C.conn.send(m); } catch (e) { } } else Server.localMsg(m); }
  Game.send = send;
  Game.act = (a, extra) => send(Object.assign({ t: 'a', a }, extra || {}));

  // ---------- incoming ----------
  function processInbox() {
    if (!C) return; const box = C.inbox; C.inbox = [];
    for (const m of box) { try { onMsg(m); } catch (e) { console.error(e); } if (!C) return; }
  }
  function onMsg(m) {
    switch (m.t) {
      case 'welcome': C.id = m.id; C.code = m.code; C.connected = true; Game.screen = 'session'; Snd.sfx('select'); break;
      case 'err': C.errMsg = m.m; Game.toMenu(m.m, m.badName); break;
      case 'r': onRoster(m); break;
      case 's': onSnap(m); break;
      case 'e': onEvent(m); break;
    }
  }
  function onRoster(m) {
    C.roster = m.list; C.byId = {}; for (const e of m.list) C.byId[e.id] = e; C.settings = m.settings; C.code = m.code;
    if (m.phase !== C.phase) setPhase(m.phase);
  }
  function setPhase(ph) {
    const old = C.phase; C.phase = ph;
    if (ph === 'lobby') { C.map = World.buildLobby(); C.over = null; C.eject = null; C.meetFx = null; C.reveal = null; C.bodies = []; C.others.clear(); C.overlay = null; C.seenBodies.clear(); C.chatCh = 'all'; }
    else if (old === 'lobby' && ph !== 'lobby') { C.map = World.buildWorkshop(); C.others.clear(); C.overlay = null; Tasks.close(); if (UI.askOpen()) UI.askClose(null); C.chat = C.chat.slice(-3); }
    if (ph === 'meeting') { Tasks.close(); C.overlay = null; C.holding = false; if (UI.askOpen()) UI.askClose(null); }
    if (ph === 'play' && old === 'meeting') { C.chatOpen = false; if (UI.askOpen()) UI.askClose(null); }
  }
  function onSnap(s) {
    if (s.ph !== C.phase) setPhase(s.ph);
    C.snap = s; const mine = s.me; C.mine = mine;
    if (mine.tp[0] !== C.me.tpSeq) { C.me.tpSeq = mine.tp[0]; C.me.x = mine.tp[1]; C.me.y = mine.tp[2]; }
    const now = performance.now(), seen = new Set();
    for (const r of s.p) {
      const [id, x, y, d, mv, disp, fl] = r; if (id === C.id) { C.me.fl = fl; C.me.disp = disp; continue; }
      seen.add(id); let o = C.others.get(id);
      if (!o || now - o.last > 400) { o = { buf: [], x, y, dir: d, mv, disp, fl, last: now, anim: Math.random() * 3 }; C.others.set(id, o); }
      o.buf.push([now, x, y, d, mv]); if (o.buf.length > 8) o.buf.shift(); o.disp = disp; o.fl = fl; o.last = now; o.vis = true;
    }
    for (const [id, o] of C.others) if (!seen.has(id)) o.vis = false;
    for (const b of s.b) if (!C.seenBodies.has(b[0])) { C.seenBodies.add(b[0]); C.popT = C.popT || {}; C.popT[b[0]] = 0; }
    C.lastPiece = C.lastPiece || {};
    for (const b of s.b) { const lp = C.lastPiece[b[0]]; if (lp != null && lp !== b[1]) { C.popT = C.popT || {}; C.popT[b[0]] = 0.25; G.smoke(b[2], b[3], P.glow, 12); G.sparkle(b[2], b[3], P.yellow, 6); Snd.sfx('puff'); } C.lastPiece[b[0]] = b[1]; }
    C.bodies = s.b;
    if (s.rt) for (const id of s.rt) if (!(C.rattle[id] > 0)) C.rattle[id] = 3;
  }
  function lookOf(id) { const e = C.byId[id]; return e ? e.look : { shape: 0, color: 15, pattern: 0, hair: 8, hairColor: 0, hat: 0, eyes: 0, extra: 0 }; }
  function nameOf(id) { const e = C.byId[id]; return e ? e.name : '???'; }
  Game.lookOf = id => lookOf(id); Game.nameOf = id => nameOf(id);
  function toast(text, col) { C.toasts.push({ text, t: 5, col }); if (C.toasts.length > 4) C.toasts.shift(); }
  function onEvent(e) {
    const me = C.me;
    switch (e.k) {
      case 'notice': toast(e.text, e.host ? P.yellow : null); if (e.host) Snd.sfx('chat'); break;
      case 'oops': if (performance.now() - C.oopsT > 2500) oops(); break;
      case 'reveal':
        if (e.quiet) { UI.say(e.role === 'hex' ? 'You are now a HEXAGONER: ' + TYPE_NAME[e.type] + '. ' + TYPE_INFO[e.type] : 'You are now a SHAPE.', { auto: 3 }); C.myRole = e.role; C.myType = e.type; break; }
        C.reveal = { role: e.role, type: e.type, mates: e.mates, t: 0, t0: performance.now() }; C.myRole = e.role; C.myType = e.type; C.chat = []; Snd.sfx('reveal');
        if (e.practice) C.reveal = null;
        break;
      case 'zap': {
        G.addFx({ k: 'zap', x: e.x, y: e.y - 14, x2: e.x2, y2: e.y2 - 10, life: .45 }); G.addFx({ k: 'flash', x: e.x2, y: e.y2, life: .35 });
        const o = C.others.get(e.id); const lk = e.id === C.id ? lookOf(C.me.disp || C.id) : lookOf(o ? o.disp : e.id);
        G.addFx({ k: 'shrink', x: e.x2, y: e.y2, look: lk, life: .5 }); G.smoke(e.x2, e.y2, null, 22); G.sparkle(e.x2, e.y2, P.glow, 10);
        Snd.sfx('hex'); if (o) o.vis = false; break;
      }
      case 'poof': G.smoke(e.x, e.y, P.grey, 14); break;
      case 'hexed': C.hexedT = 0; Tasks.close(); C.overlay = null; C.holding = false;
        UI.say('ZAP! You were turned into a chess PAWN! You are now a Spirit. Float through walls, keep doing chores, chat with other Spirits, and use RATTLE once to drop a hint.'); break;
      case 'puff': G.smoke(e.x, e.y, '#d8d2e0', 16); G.smoke(e.x, e.y, P.grey, 8); Snd.sfx('puff'); break;
      case 'plant': G.sparkle(e.x, e.y, P.glow, 10); Snd.sfx('plant'); break;
      case 'wobble': C.wobble[e.i] = 1.2; Snd.sfx('chute'); break;
      case 'rattle': C.rattle[e.prop] = 3; if (Math.hypot(e.x - me.x, e.y - me.y) < 260) Snd.sfx('rattle'); break;
      case 'sab':
        Snd.sfx(e.s === 'jam' ? 'door' : 'alarm');
        UI.say(e.s === 'lights' ? 'LIGHTS OUT! Flip the 2 switches (Gear Room + Candy Kitchen)!' : e.s === 'melt' ? 'BOILER MELTDOWN! Two players must hold the buttons in the Boiler Room AND the Library at the same time!' : 'The ' + e.room + ' doors are jammed!', { auto: 2.5, top: true, col: '#ffe0e0' }); break;
      case 'sabfix': if (e.text) UI.say(e.text, { auto: 1.5, top: true }); Snd.sfx('task'); C.holding = false; break;
      case 'meeting': C.meetFx = { t: 0, t0: performance.now(), reason: e.reason, by: e.by, body: e.body, obj: e.obj }; C.meetCount++; Snd.sfx(e.reason === 'bell' ? 'bell' : 'report'); Snd.sfx('reveal'); Tasks.close(); C.overlay = null; C.card = null; C.chatCh = (C.mine.alive ? 'all' : 'spirit'); break;
      case 'eject': C.eject = { id: e.id, text: e.text, counts: e.counts, skips: e.skips, t: 0, t0: performance.now(), look: e.id ? lookOf(e.id) : null }; break;
      case 'resume': C.eject = null; C.meetFx = null; C.chatOpen = false; break;
      case 'over': C.over = Object.assign({ t: 0, t0: performance.now() }, e); C.eject = null; C.meetFx = null; Tasks.close(); C.overlay = null; Snd.sfx(e.winner === 'shapes' ? (C.myRole === 'shape' ? 'fanfare' : 'sad') : (C.myRole === 'hex' ? 'fanfare' : 'sad')); break;
      case 'lobby': C.over = null; break;
      case 'chat': if (C.muted.has(e.from)) break; C.chat.push({ ch: e.ch, from: e.from, text: e.text, t: performance.now() }); if (C.chat.length > 60) C.chat.shift(); C.chatFlash = 6; Snd.sfx('chat'); break;
      case 'quick':
        if (C.muted.has(e.from)) break; C.bubbles[e.from] = { q: e.q, t: 3.5 };
        if (C.phase !== 'play') { C.chat.push({ ch: 'quick', from: e.from, text: QUICK[e.q], t: performance.now() }); }
        Snd.sfx('chat'); break;
      case 'reportlog': UI.say('REPORT about ' + e.name + ' (from ' + e.by + '). Last messages: ' + (e.msgs.length ? e.msgs.map(s => '"' + s + '"').join(' ') : '(none)') + '  You can kick them from the player list.'); break;
      case 'taskok': Snd.sfx('task'); break;
      case 'snd': Snd.sfx(e.s); break;
    }
  }
  function oops() { C && (C.oopsT = performance.now()); UI.say("Oops! That message wasn't sent. Please keep chat kind.", { auto: 2.5, col: '#ffe8e8' }); Snd.sfx('error'); }

  // ---------- chat sending ----------
  Game.openChat = function () {
    if (!C) return; const ch = chatChannel(); if (!ch) return;
    if (C.settings.chat !== 'full') { toast(C.settings.chat === 'off' ? 'Chat is off in this lobby.' : 'Quick Chat only in this lobby.'); return; }
    C.chatOpen = true;
    UI.ask(ch === 'hex' ? 'HEX TEAM:' : ch === 'spirit' ? 'SPIRITS:' : 'SAY:', '', 100, (v, keep) => {
      if (v == null) { if (C) C.chatOpen = false; return; }
      sendChat(v); if (!keep && C) C.chatOpen = false;
    }, 'chat');
  };
  function chatChannel() {
    if (C.phase === 'lobby' || C.phase === 'over') return 'all';
    if (!C.mine.alive) return 'spirit';
    if (C.phase === 'meeting') return C.chatCh === 'hex' && C.myRole === 'hex' ? 'hex' : 'all';
    if (C.phase === 'play' && C.myRole === 'hex') return 'hex';
    return null;
  }
  function sendChat(text) {
    if (!C) return; text = String(text || '').trim(); if (!text) return;
    const ch = chatChannel(); if (!ch) return;
    const now = performance.now(); if (now - C.lastChatSent < 1000) { toast('Slow down! One message per second.'); return; }
    C.lastChatSent = now;
    const f = ChatFilter.check(text); if (!f.ok && f.reason !== 'empty') oops(); // instant feedback; the host checks again and counts the strike
    send({ t: 'c', ch, text: text.slice(0, 100) });
  }
  Game.quick = function (q) { send({ t: 'q', q }); C.overlay = null; };

  // ---------- local movement ----------
  function speedMul() { return (C.settings && C.settings.speed) || 1; }
  function canMove() { return C.phase === 'lobby' || C.phase === 'play' || C.phase === 'over' && !C.over; }
  function updateMe(dt) {
    const me = C.me;
    let dx = 0, dy = 0;
    const block = Tasks.active() || UI.sayBlocking() || (C.overlay && C.overlay !== 'quick') || !canMove() || C.reveal || UI.typing();
    if (!block) {
      if (UI.held('left')) dx -= 1; if (UI.held('right')) dx += 1; if (UI.held('up')) dy -= 1; if (UI.held('down')) dy += 1;
      if (UI.dpad.id !== null) { dx = UI.dpad.dx; dy = UI.dpad.dy; }
    }
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    const ghost = C.phase === 'play' && !C.mine.alive;
    const sp = (ghost ? 88 : 70) * speedMul();
    me.mv = l > 0.15 ? 1 : 0;
    if (me.mv) {
      if (Math.abs(dx) > Math.abs(dy)) me.dir = dx < 0 ? 2 : 3; else me.dir = dy < 0 ? 1 : 0;
      const jam = C.snap && C.snap.sab && C.snap.sab.k === 'jam' ? C.snap.sab.room : null;
      World.move(C.map, me, dx * sp * dt, dy * sp * dt, ghost, jam);
      me.anim += dt * 8; me.stepT -= dt; if (me.stepT <= 0 && !ghost) { me.stepT = 0.3; Snd.sfx('step'); }
    }
    C.sendT -= dt;
    if (C.sendT <= 0 && C.connected) { C.sendT = 1 / 15; send({ t: 'm', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, d: me.dir, v: me.mv, s: me.tpSeq }); }
  }
  function interp(o, now) {
    const rt = now - 110, b = o.buf; if (!b.length) return;
    let a = b[0], c = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++) if (b[i][0] <= rt && b[i + 1][0] >= rt) { a = b[i]; c = b[i + 1]; break; }
    if (rt >= c[0]) { o.x = c[1]; o.y = c[2]; o.dir = c[3]; o.mv = c[4]; return; }
    if (rt <= a[0]) { o.x = a[1]; o.y = a[2]; o.dir = a[3]; o.mv = a[4]; return; }
    const k = (rt - a[0]) / Math.max(1, c[0] - a[0]); o.x = a[1] + (c[1] - a[1]) * k; o.y = a[2] + (c[2] - a[2]) * k; o.dir = c[3]; o.mv = c[4];
  }

  // ---------- what can I do right now? ----------
  function nearStation(kinds, range) {
    let best = null, bd = range || 26; const me = C.me;
    for (const s of C.map.stations) { if (!kinds.includes(s.kind)) continue; const r = s.kind === 'bell' ? 44 : (range || 26); const d = Math.hypot(me.x - s.x, me.y - s.y); if (d < r && (!best || d < bd)) { best = s; bd = d; } }
    return best;
  }
  function context() {
    const ctx = { use: null, report: false, hex: false, plant: false, rattle: null };
    if (!C || !C.snap) return ctx;
    const me = C.me, mine = C.mine, alive = !!mine.alive;
    if (C.phase === 'lobby') { const s = nearStation(['jukebox', 'mirror']); if (s) ctx.use = s; return ctx; }
    if (C.phase !== 'play') return ctx;
    const sab = C.snap.sab;
    // stations
    let best = null, bd = 1e9;
    for (const s of C.map.stations) {
      let ok = false;
      if (s.kind === 'task') ok = (mine.tasks || []).some(t => t[0] === s.task && !t[1]);
      else if (!alive) ok = false;
      else if (s.kind === 'switch') ok = sab && sab.k === 'lights' && !sab.sw[s.sw];
      else if (s.kind === 'melt') ok = sab && sab.k === 'melt';
      else if (s.kind === 'cams') ok = true;
      else if (s.kind === 'bell') ok = mine.bells > 0 && !(C.myRole === 'hex' && sab && sab.k === 'melt');
      else if (s.kind === 'chute') ok = C.myRole === 'hex';
      if (!ok) continue; const r = s.kind === 'bell' ? 44 : 26; const d = Math.hypot(me.x - s.x, me.y - s.y); if (d < r && d < bd) { bd = d; best = s; }
    }
    ctx.use = best;
    if (alive) {
      ctx.report = C.bodies.some(b => b[4] && Math.hypot(b[2] - me.x, b[3] - me.y) < 34);
      if (C.myRole === 'hex') {
        for (const [id, o] of C.others) { if (!o.vis || (o.fl & 1) || (o.fl & 2)) continue; const d = Math.hypot(o.x - me.x, o.y - me.y); if (d < 26) ctx.hex = true; if (d < 30) ctx.plant = true; }
      }
    } else if (!mine.rattled) {
      let bp = null, bdd = 64; for (const p of C.map.props) { const d = Math.hypot(p.x * T + p.w * 8 - me.x, p.y * T + p.h * 8 - me.y); if (d < bdd) { bdd = d; bp = p; } } ctx.rattle = bp;
    }
    return ctx;
  }
  function doUse(ctx) {
    const s = ctx.use; if (!s) return;
    if (s.kind === 'jukebox') { openOv('jukebox', 'use'); return; }
    if (s.kind === 'mirror') { Game.screen = 'customize'; Game.customizeFromLobby = true; return; }
    if (s.kind === 'task') {
      const i = C.mine.tasks.findIndex(t => t[0] === s.task && !t[1]);
      Tasks.open(s.task, () => { if (C && C.myRole !== 'hex') Game.act('task', { i }); else if (C && !C.mine.alive) Game.act('task', { i }); }); return;
    }
    if (s.kind === 'switch') { Game.act('switch', { sw: s.sw }); Snd.sfx('click'); return; }
    if (s.kind === 'cams') { openOv('cams', 'use'); Game.act('cams', { on: 1 }); return; }
    if (s.kind === 'bell') { Game.act('bell'); return; }
    if (s.kind === 'chute') { openOv('chute', 'use'); C.chuteFrom = s.chute; return; }
  }

  // ---------- session frame ----------
  Game.frame = function (dt, t) {
    processInbox(); if (!C) return;
    const now = performance.now();
    if (C.phase === 'lobby' || C.phase === 'play' || C.phase === 'over' || C.phase === 'reveal' || C.phase === 'meeting') updateMe(dt);
    for (const o of C.others.values()) { interp(o, now); if (o.mv) o.anim += dt * 8; }
    for (const k in C.rattle) { C.rattle[k] -= dt; if (C.rattle[k] <= 0) delete C.rattle[k]; }
    for (const k in C.wobble) { C.wobble[k] -= dt; if (C.wobble[k] <= 0) delete C.wobble[k]; }
    for (const k in C.bubbles) { C.bubbles[k].t -= dt; if (C.bubbles[k].t <= 0) delete C.bubbles[k]; }
    C.toasts.forEach(x => x.t -= dt); C.toasts = C.toasts.filter(x => x.t > 0);
    // vision radius (animated)
    const sabK = C.snap && C.snap.sab && C.snap.sab.k;
    const target = C.myRole === 'hex' ? (C.myType === 'classic' ? 122 : 108) : (sabK === 'lights' ? 38 : 92);
    C.vis += (target - C.vis) * Math.min(1, dt * 3);

    drawWorld(dt, t);
    if (C.phase === 'lobby') drawLobbyHud(dt, t);
    else if (C.phase === 'play' || C.phase === 'reveal') drawPlayHud(dt, t);
    if (C.phase === 'meeting') drawMeeting(dt, t);
    if (C.reveal) drawReveal(dt, t);
    if (C.over) drawOver(dt, t);
    drawOverlay(dt, t);
    drawToasts();
  };

  // ---------- world drawing ----------
  let camx = 0, camy = 0;
  const redSil = new WeakMap();
  function redOutline(c) { let r = redSil.get(c); if (!r) { const [cv, x] = G.mk(c.width, c.height); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = P.hexred; x.fillRect(0, 0, c.width, c.height); r = cv; redSil.set(c, r); } return r; }
  function drawPlayer(look, name, x, y, dir, anim, mv, opts) {
    opts = opts || {}; const ctx = G.ctx; const sx = Math.round(x - camx), sy = Math.round(y - camy);
    if (sx < -30 || sy < -40 || sx > G.W + 30 || sy > G.H + 40) return;
    const frame = mv ? 1 + (Math.floor(anim) % 2) : 0;
    // shadow
    ctx.fillStyle = 'rgba(20,10,30,0.28)'; ctx.fillRect(sx - 7, sy - 1, 14, 3); ctx.fillRect(sx - 5, sy - 2, 10, 5);
    if (opts.hexmate) { const c = G.charSprite(look, dir === 2 ? 3 : dir, frame), r = redOutline(c); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { if (dir === 2) { ctx.save(); ctx.translate(sx + 14 + dx, 0); ctx.scale(-1, 1); ctx.drawImage(r, 0, sy - 33 + dy); ctx.restore(); } else ctx.drawImage(r, sx - 14 + dx, sy - 33 + dy); } }
    let alpha = null; if (opts.spirit) alpha = 0.35 + 0.25 * (Math.sin(performance.now() / 90 + x) > 0.6 ? 0 : 1);
    const bob = opts.spirit ? Math.round(Math.sin(performance.now() / 300 + x) * 2) - 3 : 0;
    G.drawChar(look, dir, frame, sx, sy + bob, alpha);
    let ty = sy - 40 + bob; if (look.hat === 2 || look.hair === 1 || look.hair === 3) ty -= 3;
    if (opts.hexmate) { G.tiny('HEX', sx, ty - 7, P.hexred, 'c'); }
    if (opts.marked) { const by = ty - 9 + Math.round(Math.sin(performance.now() / 200) * 1.5); const c = (performance.now() / 150 | 0) % 2 ? P.glow : P.purple; G.rect(sx - 2, by, 5, 5, c); G.rect(sx - 3, by + 1, 7, 3, c); G.rect(sx - 1, by + 1, 3, 3, '#fff'); G.rect(sx, by + 2, 1, 1, P.dpurple); }
    if (name) G.tiny(name, sx, ty, opts.spirit ? '#bcd7ff' : (opts.me ? P.yellow : P.white), 'c');
  }
  function drawBubble(id, x, y) {
    const b = C.bubbles[id]; if (!b) return; const sx = Math.round(x - camx), sy = Math.round(y - camy) - 50;
    const q = QUICK[b.q]; if (!q) return;
    if (q[0] === '@') { G.box(sx - 11, sy - 8, 22, 20, P.white); G.ctx.drawImage(G.emote(q.slice(1)), sx - 8, sy - 5, 16, 16); }
    else { const w = q.length * 8 + 10; G.box(sx - w / 2, sy - 4, w, 16, P.white); G.text(q, sx, sy + 1, P.ink, { al: 'c' }); }
  }
  function drawWorld(dt, t) {
    const me = C.me;
    camx += (me.x - G.W / 2 - camx) * Math.min(1, dt * 10); camy += (me.y - 12 - G.H / 2 - camy) * Math.min(1, dt * 10);
    if (Math.abs(me.x - G.W / 2 - camx) > 200 || Math.abs(me.y - 12 - G.H / 2 - camy) > 200) { camx = me.x - G.W / 2; camy = me.y - 12 - G.H / 2; }
    const m = C.map, sab = C.snap && C.snap.sab;
    const mapW = m.w * T, mapH = m.h * T;
    if (mapW < G.W) camx = (mapW - G.W) / 2; if (mapH < G.H) camy = (mapH - G.H) / 2;
    World.draw(m, camx, camy, { t, rattle: C.rattle, chuteWobble: C.wobble, jam: sab && sab.k === 'jam' ? sab.room : null, switches: sab && sab.k === 'lights', lights: sab && sab.sw, melt: sab && sab.k === 'melt' });
    // drawables sorted by y
    const list = [];
    for (const b of C.bodies) list.push({ y: b[3], f: () => drawBody(b, dt) });
    const iAmSpirit = C.phase === 'play' && !C.mine.alive;
    for (const [id, o] of C.others) {
      if (!o.vis) continue; const spirit = !!(o.fl & 1) && C.phase !== 'lobby';
      list.push({ y: o.y, f: () => { drawPlayer(lookOf(o.disp), nameOf(o.disp), o.x, o.y, o.dir, o.anim, o.mv, { spirit, hexmate: !!(o.fl & 2), marked: !!(o.fl & 4) }); } });
    }
    const myDisp = C.mine.shiftAs || C.id;
    list.push({ y: me.y, f: () => drawPlayer(lookOf(myDisp), nameOf(myDisp), me.x, me.y, me.dir, me.anim, me.mv, { me: true, spirit: iAmSpirit }) });
    list.sort((a, b) => a.y - b.y); for (const d of list) d.f();
    G.updateFx(dt, camx, camy);
    // bubbles
    for (const [id, o] of C.others) if (o.vis && C.bubbles[id]) drawBubble(id, o.x, o.y);
    if (C.bubbles[C.id]) drawBubble(C.id, me.x, me.y);
    // darkness
    if (C.phase === 'play' && C.mine.alive) G.drawVision(me.x - camx, me.y - 10 - camy, C.vis);
    if (iAmSpirit) { G.ctx.fillStyle = 'rgba(60,90,180,0.12)'; G.ctx.fillRect(0, 0, G.W, G.H); }
    // room name popup
    const rn = World.roomName(m, me.x, me.y);
    if (rn !== C.lastRoom) { C.lastRoom = rn; C.roomT = 2; }
    if (C.roomT > 0 && C.phase === 'play' && rn !== 'Hallway') { C.roomT -= dt; G.text(rn, G.W / 2, G.H - 70, P.white, { al: 'c', ol: P.ink }); }
  }
  function drawBody(b, dt) {
    const [id, obj, x, y, rep] = b; const sx = Math.round(x - camx), sy = Math.round(y - camy);
    if (sx < -30 || sy < -40 || sx > G.W + 30 || sy > G.H + 40) return;
    let k = 1; if (C.popT && C.popT[id] != null) { C.popT[id] += dt; const tt = C.popT[id]; k = tt < .25 ? 0 : tt < .45 ? 1.4 : tt < .6 ? 0.9 : 1; if (tt > 1) delete C.popT[id]; }
    if (!k) return;
    const c = G.bodySprite(obj, lookOf(id)); const w = Math.round(c.width * k), h = Math.round(c.height * k);
    G.ctx.fillStyle = 'rgba(20,10,30,0.28)'; G.ctx.fillRect(sx - 8, sy - 1, 16, 3);
    G.ctx.drawImage(c, sx - Math.round(w / 2), sy - h + 2, w, h);
    if (!rep) G.tiny('LEFT', sx, sy - h - 4, P.grey, 'c');
  }

  // ---------- HUD helpers ----------
  function smallBtn(x, y, label, cb, opts) { const w = label.length * 8 + 10; UI.button(x, y, w, 16, label, cb, Object.assign({ nav: false }, opts || {})); return w; }
  function drawDpad() {
    if (!UI.isTouch) { UI.dpad.on = false; return; }
    const r = Math.min(34, Math.floor(G.H / 7)), cx = r + 14, cy = G.H - r - 14; UI.dpad.on = true; UI.dpad.cx = cx; UI.dpad.cy = cy; UI.dpad.r = r;
    const ctx = G.ctx; ctx.globalAlpha = 0.75;
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, 7); ctx.fill(); ctx.fillStyle = '#4a3d63'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    const a = Math.round(r * 0.32); G.rect(cx - a, cy - r + 4, a * 2, r * 2 - 8, P.dark); G.rect(cx - r + 4, cy - a, r * 2 - 8, a * 2, P.dark);
    G.text('▲', cx - 4, cy - r + 6, P.light); G.text('▼', cx - 4, cy + r - 13, P.light); G.text('◀', cx - r + 5, cy - 4, P.light); G.text('▶', cx + r - 12, cy - 4, P.light);
    const kx = cx + UI.dpad.dx * r * 0.6, ky = cy + UI.dpad.dy * r * 0.6; ctx.fillStyle = P.grey; ctx.beginPath(); ctx.arc(kx, ky, a, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function drawChatLog(x, y, w, h, n, opts) {
    opts = opts || {};
    G.box(x, y, w, h, opts.fill || 'rgba(251,248,242,0.92)');
    const maxc = Math.floor((w - 22) / 8), lines = [];
    for (const m of C.chat) {
      const e = C.byId[m.from], nm = e ? e.name : '?', tag = m.ch === 'hex' ? '[HEX] ' : m.ch === 'spirit' ? '[SPIRIT] ' : '';
      const wrapped = G.wrap(tag + nm + ': ' + m.text, maxc);
      wrapped.forEach((l, i) => lines.push({ l, first: i === 0, m, nm, tag, look: e ? e.look : null }));
    }
    const rows = Math.max(1, Math.floor((h - 8) / 10)), vis = lines.slice(-rows);
    vis.forEach((L, i) => {
      const yy = y + 5 + i * 10;
      if (L.first && L.look) { miniFace(L.look, x + 4, yy); }
      const col = L.m.ch === 'hex' ? P.dred : L.m.ch === 'spirit' ? P.dpurple : P.ink;
      if (L.first) { const pre = L.tag + L.nm + ':'; G.text(L.tag, x + 16, yy, col); G.text(L.nm + ':', x + 16 + L.tag.length * 8, yy, G.shade(G.BODY_COLORS[L.look ? L.look.color : 0][1], 0.75)); G.text(L.l.slice(pre.length), x + 16 + pre.length * 8, yy, col); }
      else G.text(L.l, x + 16, yy, col);
    });
    if (!lines.length && opts.empty) G.text(opts.empty, x + 8, y + 6, P.mid);
  }
  const miniCache = {};
  function miniFace(look, x, y) {
    const key = look.shape + ',' + look.color; let c = miniCache[key];
    if (!c) {
      const [cv, cx] = G.mk(10, 10); const m = G.masks[look.shape], col = G.BODY_COLORS[look.color][1];
      for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) { const mu = Math.floor(u * 14 / 8), mv = Math.floor(v * 14 / 8); if (m[mv * 14 + mu]) { cx.fillStyle = col; cx.fillRect(u + 1, v + 1, 1, 1); } }
      cx.fillStyle = '#fff'; cx.fillRect(3, 4, 1, 2); cx.fillRect(6, 4, 1, 2); c = miniCache[key] = G.outline(cv, P.ink);
    }
    G.ctx.drawImage(c, x, y - 2);
  }
  function drawToasts() { C.toasts.forEach((t, i) => { const y = 40 + i * 12; const w = t.text.length * 8 + 8; G.rect(G.W / 2 - w / 2, y - 2, w, 11, 'rgba(20,14,32,0.8)'); G.text(t.text, G.W / 2, y, t.col || P.white, { al: 'c' }); }); }

  // ---------- LOBBY HUD ----------
  function drawLobbyHud(dt, t) {
    const host = C.mode === 'host', n = C.roster.length, ready = C.roster.filter(e => e.ready).length;
    // code in huge letters
    const sc = G.W > 360 ? 3 : 2, cw = 5 * 8 * sc + 20;
    G.box(G.W / 2 - cw / 2, 4, cw, 8 * sc + 22, P.white);
    G.text('LOBBY CODE', G.W / 2, 8, P.mid, { al: 'c' });
    G.text(C.code, G.W / 2, 18, P.dblue, { al: 'c', sc });
    G.text(n + '/20 players  ' + ready + ' ready', G.W / 2, 8 * sc + 30, P.white, { al: 'c', ol: P.ink });
    // left column
    let y = 6; smallBtn(4, y, 'LEAVE', () => confirmLeave()); y += 20;
    if (host) { smallBtn(4, y, 'NEW CODE', () => { Server.newCode(); }); y += 20; }
    smallBtn(4, y, 'LOOK', () => { Game.screen = 'customize'; Game.customizeFromLobby = true; }); y += 20;
    smallBtn(4, y, 'MENU', () => { C.overlay = 'pause'; });
    // right column
    const bw = 84, bx = G.W - bw - 4; let by = 6;
    const meE = C.byId[C.id];
    UI.button(bx, by, bw, 18, meE && meE.ready ? '✔ READY' : 'READY?', () => Game.act('ready', { v: !(meE && meE.ready) }), { nav: false, col: meE && meE.ready ? P.lime : P.white }); by += 22;
    UI.button(bx, by, bw, 18, 'PLAYERS', () => { C.overlay = 'players'; }, { nav: false }); by += 22;
    UI.button(bx, by, bw, 18, host ? 'SETTINGS' : 'RULES', () => { C.overlay = 'hostset'; C.scroll = 0; }, { nav: false }); by += 22;
    if (host) {
      const S = C.settings, okHex = Server.hexValid(S.hexCount, n), can = n >= 4 && okHex;
      UI.button(bx, by, bw, 22, 'START', () => { const err = Server.start_game(); if (err) UI.say(err); }, { nav: false, col: can ? P.yellow : P.grey, disabled: !can, onDisabled: () => UI.say(n < 4 ? 'You need at least 4 players to start. Share the code!' : 'Too many Hexagoners for this many players. Change it in SETTINGS.') }); by += 26;
      if (!can) G.text(n < 4 ? 'Need 4+' : 'Too many HEX', bx + bw / 2, by, P.yellow, { al: 'c', ol: P.ink });
      if (new URLSearchParams(location.search).get('bots')) { smallBtn(bx, by + 12, '+BOT', () => Server.addBot()); }
    } else G.text('Waiting for host', bx + bw / 2, by + 2, P.white, { al: 'c', ol: P.ink });
    // chat
    const cwid = Math.min(G.W - bw - 30 - (UI.isTouch ? 0 : 0), 300), ch = 56;
    const cx = UI.isTouch ? Math.max(100, G.W - bw - 12 - cwid) : 4;
    drawChatLog(cx, G.H - ch - 22, cwid, ch, 5, { empty: C.settings.chat === 'off' ? 'Chat is off.' : 'Say hi!' });
    let qx = cx; qx += smallBtn(qx, G.H - 20, 'CHAT', () => Game.openChat(), { disabled: C.settings.chat !== 'full' }) + 4;
    smallBtn(qx, G.H - 20, 'QUICK', () => { C.overlay = 'quick'; });
    // use prompt
    const cx2 = context();
    if (cx2.use) { const lbl = cx2.use.kind === 'jukebox' ? 'MUSIC BOX' : 'MIRROR'; UI.action(G.W - 34, G.H - 34, 22, 'USE', () => doUse(cx2), { col: P.green, key: 'E' }); G.text(lbl, G.W - 34, G.H - 66, P.white, { al: 'c', ol: P.ink }); }
    if (!C.overlay && !UI.typing()) { if (UI.hit('use') && cx2.use) doUse(cx2); if (UI.hit('chat') || UI.hit('key:Enter')) Game.openChat(); if (UI.hit('quick')) openOv('quick', 'quick'); if (UI.hit('back')) openOv('pause', 'back'); }
    drawDpad();
  }
  function confirmLeave() { C.overlay = 'leave'; }
  function openOv(name, key) { C.overlay = name; UI.eat(key); UI.eat('use'); }

  // ---------- PLAY HUD ----------
  function drawPlayHud(dt, t) {
    const s = C.snap; if (!s) return; const mine = C.mine, hex = C.myRole === 'hex', alive = !!mine.alive;
    // task bar
    const bw = Math.min(180, G.W - 170), bx = Math.floor(G.W / 2 - bw / 2);
    G.rect(bx - 2, 3, bw + 4, 12, P.ink); G.rect(bx, 5, bw, 8, P.dgreen); G.rect(bx, 5, Math.round(bw * s.bar), 8, P.lime);
    for (let i = 0; i < bw; i += 10) G.rect(bx + i, 5, 1, 8, 'rgba(0,0,0,0.15)');
    G.text('CHORES', bx + bw / 2, 5, P.white, { al: 'c', ol: P.dgreen });
    if (s.mt >= 0) { G.text(UI.fmtT(s.mt), bx + bw + 8, 5, s.mt < 60 ? P.red : P.white, { ol: P.ink }); }
    // sabotage banner
    if (s.sab) {
      const fl = (t * 3 | 0) % 2; let txt = '';
      if (s.sab.k === 'lights') txt = 'LIGHTS OUT! Switches ' + s.sab.sw.filter(Boolean).length + '/2';
      if (s.sab.k === 'melt') txt = 'MELTDOWN ' + s.sab.t + 's! Hold BOTH buttons ' + (s.sab.hold ? s.sab.hold.filter(Boolean).length : 0) + '/2';
      if (s.sab.k === 'jam') txt = C.map.rooms[s.sab.room].name + ' doors jammed ' + s.sab.t + 's';
      G.text(txt, G.W / 2, 19, fl ? P.red : P.yellow, { al: 'c', ol: P.ink });
    }
    // role + tasks (top-left)
    let y = 20;
    if (!alive) { G.text('SPIRIT', 4, y, '#bcd7ff', { ol: P.ink }); y += 10; }
    if (hex) { G.text('HEXAGONER', 4, 4, P.hexred, { ol: P.ink }); G.tiny(TYPE_NAME[C.myType] || '', 4, 13, P.pink); }
    else G.text('SHAPE', 4, 4, P.sky, { ol: P.ink });
    if (C.showTasks !== false) {
      const tl = mine.tasks || []; if (hex) { G.tiny('FAKE TASKS (BAR NEVER MOVES):', 4, y, P.pink); y += 7; }
      tl.forEach(tk => { const st = C.map.stations.find(s2 => s2.task === tk[0]); const room = st ? C.map.rooms[st.room].name : ''; G.tiny((tk[1] ? '* ' : '- ') + World.TASKS[tk[0]] + ' (' + room + ')', 4, y, tk[1] ? P.lime : P.white); y += 7; });
    }
    // top right small buttons
    let rx = G.W - 4; rx -= 50; smallBtn(rx, 20, 'MENU', () => { C.overlay = 'pause'; });
    rx -= 42; smallBtn(rx, 20, 'MAP', () => { C.overlay = 'map'; });
    rx -= 58; smallBtn(rx, 20, 'QUICK', () => { C.overlay = 'quick'; });
    const ch = chatChannel(); if (ch && C.settings.chat === 'full') { rx -= 50; smallBtn(rx, 20, 'CHAT', () => Game.openChat(), { col: ch === 'hex' ? P.pink : '#cfe0ff' }); }
    // recent hex/spirit chat
    if (C.chat.length && (hex || !alive)) { const last = C.chat.slice(-3).filter(m => performance.now() - m.t < 8000); if (last.length || C.chatOpen) { const saved = C.chat; C.chat = C.chatOpen ? saved : last; drawChatLog(4, G.H - (UI.isTouch ? 130 : 66), Math.min(260, G.W - 120), C.chatOpen ? 60 : last.length * 10 + 10, 3); C.chat = saved; } }
    // action buttons (bottom-right)
    if (C.phase !== 'play') { drawDpad(); return; }
    const cx = context(); const R = Math.min(22, Math.floor(G.H / 11));
    const ax = G.W - R - 8, ay = G.H - R - 8;
    const useLbl = cx.use ? ({ task: 'USE', switch: 'FLIP', melt: 'HOLD', cams: 'CAMS', bell: 'BELL', chute: 'CHUTE' }[cx.use.kind] || 'USE') : 'USE';
    const useBtn = UI.action(ax, ay, R, useLbl, () => { if (cx.use && cx.use.kind !== 'melt') doUse(cx); }, { col: P.green, disabled: !cx.use, key: 'E' });
    // meltdown hold
    const holdNow = cx.use && cx.use.kind === 'melt' && ((UI.held('use') && !UI.typing()) || UI.anyHeldIn(useBtn.x, useBtn.y, useBtn.w, useBtn.h));
    if (holdNow && !C.holding) { C.holding = true; Game.act('hold', { on: 1, btn: cx.use.btn }); }
    if (!holdNow && C.holding) { C.holding = false; Game.act('hold', { on: 0 }); }
    if (cx.use && cx.use.kind === 'melt' && C.holding) G.text('HOLDING!', ax, ay - R - 12, P.yellow, { al: 'c', ol: P.ink });
    if (alive) UI.action(ax - R * 2 - 6, ay, R, 'RPT', () => Game.act('report'), { col: P.orange, disabled: !cx.report, key: 'R' });
    if (alive && hex) {
      UI.action(ax, ay - R * 2 - 6, R, 'HEX', () => Game.act('hex'), { col: P.purple, disabled: !cx.hex || mine.hexCd > 0, cd: mine.hexCd, key: 'Q' });
      if (C.myType === 'shift') UI.action(ax - R * 2 - 6, ay - R * 2 - 6, R, mine.shiftT > 0 ? 'ON' : 'SHFT', () => { if (mine.shiftT <= 0 && mine.shiftCd <= 0) C.overlay = 'shift'; }, { col: P.teal, disabled: mine.shiftT > 0 || mine.shiftCd > 0, cd: mine.shiftT > 0 ? mine.shiftT : mine.shiftCd, key: 'F' });
      if (C.myType === 'plant') UI.action(ax - R * 2 - 6, ay - R * 2 - 6, R, 'PLNT', () => Game.act('plant'), { col: P.pink, disabled: !cx.plant || mine.plantCd > 0 || mine.marking, cd: mine.marking ? 0 : mine.plantCd, key: 'F' });
      UI.action(ax - R * 4 - 12, ay - R * 2 - 6, R, 'SAB', () => { C.overlay = 'sab'; }, { col: P.dred, disabled: !!(s.sab) || mine.sabCd > 0, cd: s.sab ? 0 : mine.sabCd, key: 'X' });
      if (mine.marking) G.tiny('MARK ACTIVE', ax - R * 2 - 6, ay - R * 3 - 14, P.glow, 'c');
    }
    if (!alive && cx.rattle) UI.action(ax - R * 2 - 6, ay, R, 'RTL', () => Game.act('rattle', { prop: cx.rattle.id }), { col: P.sky, key: 'F' });
    if (!alive && mine.rattled) G.tiny('RATTLE USED', ax - R * 2 - 6, ay + R + 1, P.grey, 'c');
    if (alive && cx.use && cx.use.kind === 'bell') G.tiny('BELLS LEFT: ' + mine.bells + (s.bell > 0 ? ' (WAIT ' + s.bell + 'S)' : ''), ax, ay - R - 8 - (hex ? R * 2 + 6 : 0), P.yellow, 'c');
    // keys
    if (!C.overlay && !Tasks.active() && !UI.typing() && !UI.sayBlocking()) {
      if (UI.hit('use') && cx.use && cx.use.kind !== 'melt') doUse(cx);
      if (UI.hit('report') && cx.report) Game.act('report');
      if (UI.hit('hex') && hex && alive) Game.act('hex');
      if (UI.hit('special') && hex && alive) { if (C.myType === 'shift' && mine.shiftT <= 0 && mine.shiftCd <= 0) openOv('shift', 'special'); if (C.myType === 'plant') Game.act('plant'); }
      if (UI.hit('special') && !alive && cx.rattle) Game.act('rattle', { prop: cx.rattle.id });
      if (UI.hit('sab') && hex && alive) openOv('sab', 'sab');
      if (UI.hit('map')) openOv('map', 'map');
      if (UI.hit('quick')) openOv('quick', 'quick');
      if ((UI.hit('chat') || UI.hit('key:Enter')) && ch) Game.openChat();
      if (UI.hit('back')) openOv('pause', 'back');
      if (UI.hit('tab')) C.showTasks = C.showTasks === false;
    }
    drawDpad();
  }

  // ---------- MEETING ----------
  function cardLayout() {
    const n = C.roster.length, cols = Math.max(2, Math.min(5, Math.floor((G.W - 8) / 86))), rows = Math.ceil(n / cols);
    const top = 24, chatH = Math.max(40, Math.min(70, G.H - top - rows * 30 - 30)), ch = Math.min(30, Math.floor((G.H - top - chatH - 30) / rows));
    const cw = Math.floor((G.W - 8) / cols);
    return { cols, rows, cw, ch, top, chatH };
  }
  function drawMeeting(dt, t) {
    const s = C.snap, M = s && s.m; if (!M) return;
    const ctx = G.ctx; UI.group('meeting'); UI.blocker();
    UI.bg(t, '#2a1d3a', '#31233f');
    const stageTxt = M.st === 'intro' ? 'MEETING!' : M.st === 'discuss' ? 'DISCUSS! (no voting yet) ' + M.t + 's' : M.st === 'vote' ? 'VOTE! ' + M.t + 's' : 'RESULTS';
    G.rect(0, 0, G.W, 20, P.ink); G.text(stageTxt, G.W / 2, 6, M.st === 'vote' ? P.yellow : P.white, { al: 'c' });
    const L = cardLayout(), myAlive = !!C.mine.alive;
    C.roster.forEach((e, i) => {
      const cx = 4 + (i % L.cols) * L.cw, cy = L.top + Math.floor(i / L.cols) * L.ch, w = L.cw - 3, h = L.ch - 3;
      const dead = e.dead || e.left, isMe = e.id === C.id;
      G.box(cx, cy, w, h, dead ? '#8e879a' : isMe ? '#fff4c2' : P.white);
      ctx.save(); ctx.beginPath(); ctx.rect(cx + 3, cy + 3, 24, h - 6); ctx.clip();
      const spr = G.charSprite(e.look, 0, 0); ctx.globalAlpha = dead ? 0.45 : 1; ctx.drawImage(spr, cx + 1, cy + 3 - 12 + Math.max(0, h - 26)); ctx.globalAlpha = 1; ctx.restore();
      G.text(e.name.slice(0, Math.floor((w - 32) / 8)), cx + 30, cy + 5, dead ? P.dark : P.ink);
      if (e.hex) G.tiny('HEX' + (e.type ? ' ' + TYPE_NAME[e.type] : ''), cx + 30, cy + 15, P.dred);
      if (dead) { G.tiny(e.left ? 'LEFT' : 'PIECE', cx + 30, cy + h - 9, P.dark); G.rect(cx + 4, cy + h / 2, 22, 2, P.red); }
      if (C.muted.has(e.id)) G.tiny('MUTED', cx + w - 26, cy + 4, P.red);
      if (M.st === 'vote' && e.voted) { G.rect(cx + w - 30, cy + h - 12, 28, 10, P.yellow); G.tiny('VOTED', cx + w - 27, cy + h - 10, P.ink); }
      if (M.st === 'result' && C.eject && C.eject.counts) { const n = C.eject.counts[e.id] || 0; if (n) { G.rect(cx + w - 18, cy + 3, 16, 12, P.red); G.text(String(n), cx + w - 14, cy + 5, P.white); } }
      if (M.myVote === e.id) G.text('✔', cx + w - 11, cy + h - 11, P.green);
      if (C.meetFx && C.meetFx.by === e.id && M.st !== 'result') G.tiny(C.meetFx.reason === 'bell' ? 'RANG BELL' : 'REPORTER', cx + 30, cy + h - 9, P.orange);
      UI.area(cx, cy, w, h, () => { C.card = e.id; C.overlay = 'card'; }, { nav: true });
    });
    // bottom: chat + buttons
    const by = G.H - L.chatH - 4; const bwid = 76;
    drawChatLog(4, by, G.W - bwid - 14, L.chatH, 6, { empty: myAlive ? 'Talk it over! Who is the Hexagoner?' : 'Spirit chat (only Spirits see this)' });
    let yy = by; const bx = G.W - bwid - 6;
    const ch = chatChannel();
    UI.button(bx, yy, bwid, 16, 'CHAT', () => Game.openChat(), { nav: true, disabled: !ch || C.settings.chat !== 'full' }); yy += 19;
    if (myAlive && C.myRole === 'hex') { UI.button(bx, yy, bwid, 16, C.chatCh === 'hex' ? 'TO: HEX' : 'TO: ALL', () => { C.chatCh = C.chatCh === 'hex' ? 'all' : 'hex'; }, { nav: true, col: C.chatCh === 'hex' ? P.pink : P.white }); yy += 19; }
    UI.button(bx, yy, bwid, 16, 'QUICK', () => { C.overlay = 'quick'; }, { nav: true }); yy += 19;
    if (M.st === 'vote' && myAlive && M.myVote == null) UI.button(bx, yy, bwid, 16, 'SKIP', () => Game.act('vote', { target: 'skip' }), { nav: true, col: P.light });
    else if (M.myVote === 'skip') G.text('SKIPPED', bx + bwid / 2, yy + 4, P.yellow, { al: 'c' });
    if (M.st === 'result' && C.eject) G.text('Skips: ' + (C.eject.skips || 0), bx + bwid / 2, yy + 4, P.white, { al: 'c' });
    if (!UI.typing() && !C.overlay && UI.hit('key:Enter') && ch) Game.openChat();
    // dramatic encounter intro
    if (C.meetFx) C.meetFx.t = (performance.now() - C.meetFx.t0) / 1000;
    if (C.meetFx && C.meetFx.t < 2.6) { encounter(C.meetFx.t, C.meetFx.reason === 'bell' ? 'MEETING BELL!' : 'PIECE REPORTED!', C.meetFx.reason === 'bell' ? P.yellow : P.orange, C.meetFx); }
    // eject cutscene
    if (C.eject && M.st === 'result') drawEject(dt, t);
  }
  function encounter(tt, title, col, fx) {
    const ctx = G.ctx;
    if (tt < 0.45) { ctx.fillStyle = ((tt * 14) | 0) % 2 ? '#fff' : '#000'; ctx.fillRect(0, 0, G.W, G.H); return; }
    const k = Math.min(1, (tt - 0.45) / 0.35), k2 = tt > 2.1 ? (tt - 2.1) / 0.5 : 0;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 12; i++) { const y = i * G.H / 12, w = G.W * (1 - k2) * Math.min(1, k * 2 - i * 0.05); if (w > 0) ctx.fillRect(i % 2 ? G.W - w : 0, Math.floor(y), Math.ceil(w), Math.ceil(G.H / 12) + 1); }
    if (k >= 1 && k2 < 0.5) {
      G.title(title, G.W / 2, G.H / 2 - 20, 2, tt);
      if (fx && fx.body) { const c = G.bodySprite(fx.obj, lookOf(fx.body)); ctx.drawImage(c, G.W / 2 - 26, G.H / 2 + 2, c.width * 2, c.height * 2); G.text(nameOf(fx.body), G.W / 2, G.H / 2 + 70, P.white, { al: 'c' }); }
      else if (fx) { G.drawChar(lookOf(fx.by), 0, 0, G.W / 2, G.H / 2 + 50); G.text(nameOf(fx.by) + ' rang the bell!', G.W / 2, G.H / 2 + 56, P.white, { al: 'c' }); }
    }
  }
  function drawEject(dt, t) {
    const E = C.eject; E.t = (performance.now() - E.t0) / 1000; if (E.t < 2) return;
    const tt = E.t - 2, ctx = G.ctx;
    if (tt < 0.05) Snd.sfx('eject');
    // sky
    ctx.fillStyle = '#7fc3ef'; ctx.fillRect(0, 0, G.W, G.H); ctx.fillStyle = '#a9dcf7'; ctx.fillRect(0, G.H * 0.6, G.W, G.H * 0.4);
    for (let i = 0; i < 6; i++) { const cx = ((i * 97 - tt * 30 * (1 + i % 3)) % (G.W + 80) + G.W + 80) % (G.W + 80) - 40, cy = 20 + (i * 53) % (G.H - 80); G.rect(cx, cy, 40, 8, '#fff'); G.rect(cx + 8, cy - 5, 22, 6, '#fff'); }
    // blimp + cannon
    const bx = 30, by = G.H / 2 - 30; ctx.fillStyle = P.ink; ctx.beginPath(); ctx.ellipse(bx + 50, by + 20, 62, 26, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#e8c56a'; ctx.beginPath(); ctx.ellipse(bx + 50, by + 19, 60, 24, 0, 0, 7); ctx.fill();
    G.rect(bx + 20, by + 42, 60, 12, P.brown); G.rect(bx + 100, by + 10, 18, 10, P.dark); G.rect(bx + 112, by + 7, 6, 16, P.ink);
    if (E.id && E.look) {
      const ft = Math.min(tt, 4), px = bx + 118 + ft * 90, py = by + 15 - ft * 40 + ft * ft * 14;
      if (tt < 0.4) { G.smoke(bx + 120 + camx, by + 15 + camy, '#fff', 3); }
      ctx.save(); ctx.translate(Math.round(px), Math.round(py)); ctx.rotate(Math.floor(tt * 6) * Math.PI / 2); const c = G.charSprite(E.look, 0, 0); ctx.drawImage(c, -14, -18); ctx.restore();
    }
    G.updateFx(0, camx, camy);
    // text box (types out)
    const n = Math.min(E.text.length, Math.floor(tt * 40)); if (n > (E.n || 0) && E.text[n - 1] !== ' ') Snd.sfx('blip'); E.n = n;
    const w = Math.min(G.W - 8, 360), maxc = Math.floor((w - 20) / 8), lines = G.wrap(E.text.slice(0, n), maxc), all = G.wrap(E.text, maxc);
    const h = all.length * 11 + 16, x = (G.W - w) / 2, y = G.H - h - 6; G.box(x, y, w, h, P.white); lines.forEach((l, i) => G.text(l, x + 10, y + 9 + i * 11, P.ink));
  }

  // ---------- REVEAL ----------
  function drawReveal(dt, t) {
    const R = C.reveal; R.t = (performance.now() - R.t0) / 1000; const ctx = G.ctx; UI.group('reveal'); UI.blocker();
    if (R.t > 5.5 || (C.phase === 'play' && R.t > 1.5 && C.snap && C.snap.ph === 'play' && R.t > 5)) { C.reveal = null; return; }
    if (R.t < 0.9) { encounter(R.t, '', P.white); if (R.t < 0.45) return; }
    const hex = R.role === 'hex', k = Math.min(1, Math.max(0, (R.t - 0.8) / 0.35));
    ctx.fillStyle = hex ? '#2a0d18' : '#0d1a3a'; ctx.fillRect(0, 0, G.W, G.H);
    for (let i = 0; i < 16; i++) G.rect(((i * 61 + t * 80) % (G.W + 40)) - 20, (i * 37) % G.H, 20, 2, hex ? '#4a1428' : '#1d3266');
    const ox = Math.round((1 - k) * G.W);
    const look = lookOf(C.id); const sc = 3; const spr = G.charSprite(look, 0, Math.floor(t * 4) % 3);
    ctx.drawImage(spr, ox + G.W * 0.18 - spr.width * sc / 2, G.H / 2 - spr.height * sc / 2, spr.width * sc, spr.height * sc);
    const tx = ox + G.W * 0.35, maxc = Math.floor((G.W * 0.62) / 8);
    G.text('You are a', tx, 30, P.white);
    G.text(hex ? 'HEXAGONER' : 'SHAPE', tx, 44, hex ? P.hexred : P.sky, { sc: 2, ol: P.ink });
    let y = 70;
    if (hex) {
      G.text('TYPE: ' + TYPE_NAME[R.type], tx, y, P.yellow); y += 14;
      G.wrap(TYPE_INFO[R.type], maxc).forEach(l => { G.text(l, tx, y, P.white); y += 10; }); y += 4;
      if (R.mates.length) { G.text('Your team:', tx, y, P.pink); y += 11; R.mates.forEach(m => { G.text(nameOf(m.id) + ' - ' + TYPE_NAME[m.type], tx, y, P.hexred); y += 10; }); }
      else { G.text('You are the only Hexagoner!', tx, y, P.pink); }
    } else {
      G.wrap('Finish your chores to power the escape blimp. Find the Hexagoners and vote them out!', maxc).forEach(l => { G.text(l, tx, y, P.white); y += 10; });
      const nh = C.settings.hexCount; y += 6; G.text(nh + ' Hexagoner' + (nh > 1 ? 's are' : ' is') + ' among us...', tx, y, P.hexred);
    }
  }

  // ---------- GAME OVER ----------
  function drawOver(dt, t) {
    const O = C.over; O.t = (performance.now() - O.t0) / 1000; const ctx = G.ctx; UI.group('over'); UI.blocker();
    const sh = O.winner === 'shapes';
    ctx.fillStyle = sh ? '#12306a' : '#3a0a1c'; ctx.fillRect(0, 0, G.W, G.H);
    if (sh) for (let i = 0; i < 40; i++) { const x = (i * 53 + Math.sin(t + i) * 20) % G.W, y = ((i * 31 + t * (20 + i % 5 * 10)) % G.H); G.rect(x, G.H - y, 2, 2, [P.yellow, P.pink, P.lime, P.sky][i % 4]); }
    G.title(sh ? 'SHAPES WIN!' : 'HEXAGONERS WIN!', G.W / 2, 8, G.W > 380 ? 3 : 2, t);
    G.text(O.reason, G.W / 2, 40, P.white, { al: 'c' });
    if (sh && O.t < 6 && O.reason.indexOf('blimp') >= 0) { const bx = -60 + O.t * 70; ctx.fillStyle = P.ink; ctx.beginPath(); ctx.ellipse(bx, 70, 32, 14, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#e8c56a'; ctx.beginPath(); ctx.ellipse(bx, 69, 30, 12, 0, 0, 7); ctx.fill(); }
    const cols = Math.max(1, Math.floor((G.W - 8) / 128)), cw = Math.floor((G.W - 8) / cols), chh = Math.min(26, Math.floor((G.H - 84) / Math.ceil(O.players.length / cols)));
    O.players.forEach((p, i) => {
      const x = 4 + (i % cols) * cw, y = 54 + Math.floor(i / cols) * chh;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, 22, chh - 1); ctx.clip(); ctx.drawImage(G.charSprite(p.look, 0, 0), x - 3, y - 8); ctx.restore();
      G.text(p.name, x + 24, y + 1, p.role === 'hex' ? P.hexred : P.sky);
      G.tiny(p.role === 'hex' ? 'HEX: ' + TYPE_NAME[p.type] : 'SHAPE', x + 24, y + 10, p.role === 'hex' ? P.pink : '#bcd7ff');
      const st = p.stats; G.tiny((p.role === 'hex' ? 'HEX ' + st.hexes + ' FRAME ' + st.framed + ' SHIFT ' + st.shifts : 'TASKS ' + st.tasks) + ' GOOD VOTES ' + st.votes, x + 24, y + 17, P.light);
    });
    const host = C.mode === 'host';
    if (O.t > 2) {
      if (host) UI.button(G.W / 2 - 70, G.H - 24, 140, 20, 'BACK TO LOBBY', () => Server.backToLobby(), { col: P.yellow });
      else G.text('Waiting for the host... (' + (C.snap && C.snap.tm || 0) + 's)', G.W / 2, G.H - 18, P.white, { al: 'c' });
      UI.button(4, G.H - 22, 60, 18, 'LEAVE', () => Game.toMenu(), { nav: false });
    }
  }

  // ---------- OVERLAYS ----------
  function panel(w, h, title) {
    UI.group('ov'); UI.blocker(() => { });
    G.ctx.fillStyle = 'rgba(8,4,16,0.55)'; G.ctx.fillRect(0, 0, G.W, G.H);
    w = Math.min(w, G.W - 8); h = Math.min(h, G.H - 8); const x = Math.floor((G.W - w) / 2), y = Math.floor((G.H - h) / 2);
    G.box(x, y, w, h, P.white); if (title) G.text(title, x + 10, y + 8, P.dblue);
    UI.button(x + w - 22, y + 4, 18, 16, 'X', () => closeOverlay(), { nav: false, col: P.pink });
    if (UI.hit('back')) closeOverlay();
    return { x, y, w, h };
  }
  function closeOverlay() { if (C.overlay === 'cams') Game.act('cams', { on: 0 }); if (C.overlay === 'jukebox') C.jukebox = null; C.overlay = null; }
  Game.closeOverlay = closeOverlay;
  function drawOverlay(dt, t) {
    const o = C.overlay; if (!o) return;
    if (o === 'map') return drawMinimap(t);
    if (o === 'cams') return drawCams(t);
    if (o === 'quick') {
      const b = panel(300, 140, 'QUICK CHAT');
      QUICK.forEach((q, i) => {
        if (i < 8) { const col = i % 2, row = i >> 1; UI.button(b.x + 8 + col * (b.w - 16) / 2, b.y + 22 + row * 19, (b.w - 20) / 2, 16, q, () => Game.quick(i), { col: P.white }); }
        else { const k = i - 8, bw = 30; UI.button(b.x + 8 + k * (bw + 6), b.y + b.h - 26, bw, 22, '', () => Game.quick(i), { icon: (x, y) => G.ctx.drawImage(G.emote(q.slice(1)), x + 7, y + 3, 16, 16) }); }
      });
      if (UI.hit('quick')) closeOverlay(); return;
    }
    if (o === 'sab') {
      const b = panel(240, 150, 'SABOTAGE'); const s = C.snap, cd = C.mine.sabCd || 0, busy = !!(s && s.sab);
      if (busy || cd > 0) G.text(busy ? 'A sabotage is already happening!' : 'Ready in ' + Math.ceil(cd) + 's', b.x + 10, b.y + 22, P.red);
      const dis = busy || cd > 0; let y = b.y + 36;
      UI.button(b.x + 10, y, b.w - 20, 18, 'LIGHTS OUT', () => { Game.act('sab', { k: 'lights' }); closeOverlay(); }, { disabled: dis }); y += 22;
      UI.button(b.x + 10, y, b.w - 20, 18, 'BOILER MELTDOWN', () => { Game.act('sab', { k: 'melt' }); closeOverlay(); }, { disabled: dis }); y += 22;
      UI.button(b.x + 10, y, b.w - 20, 18, 'JAM THE DOORS...', () => { C.overlay = 'jam'; }, { disabled: dis });
      if (UI.hit('sab')) closeOverlay(); return;
    }
    if (o === 'jam') {
      const b = panel(260, 190, 'JAM WHICH ROOM?');
      C.map.rooms.forEach((r, i) => { UI.button(b.x + 8 + (i % 2) * (b.w - 16) / 2, b.y + 24 + (i >> 1) * 19, (b.w - 20) / 2, 16, r.name.split(' ')[0].toUpperCase().slice(0, 13), () => { Game.act('sab', { k: 'jam', room: i }); closeOverlay(); }); });
      return;
    }
    if (o === 'shift') {
      const list = C.roster.filter(e => e.id !== C.id && !e.dead && !e.left);
      const cols = Math.max(2, Math.floor((Math.min(G.W - 8, 380) - 16) / 70)), rows = Math.ceil(list.length / cols);
      const b = panel(cols * 70 + 16, rows * 40 + 34, 'SHIFT INTO WHO?');
      list.forEach((e, i) => { const x = b.x + 8 + (i % cols) * 70, y = b.y + 24 + Math.floor(i / cols) * 40; UI.button(x, y, 66, 38, '', () => { Game.act('shift', { target: e.id }); closeOverlay(); }, { icon: (bx, by) => { G.ctx.save(); G.ctx.beginPath(); G.ctx.rect(bx + 3, by + 3, 60, 24); G.ctx.clip(); G.ctx.drawImage(G.charSprite(e.look, 0, 0), bx + 20, by - 6); G.ctx.restore(); G.tiny(e.name, bx + 33, by + 29, P.ink, 'c'); } }); });
      return;
    }
    if (o === 'chute') {
      const b = panel(220, 160, 'TOY CHUTE TO...');
      C.map.chutes.forEach((c, i) => { if (i === C.chuteFrom) return; const y = b.y + 24 + (i - (i > C.chuteFrom ? 1 : 0)) * 21; UI.button(b.x + 10, y, b.w - 20, 18, C.map.rooms[c.room].name, () => { Game.act('chute', { to: i }); closeOverlay(); }); });
      return;
    }
    if (o === 'jukebox') {
      const b = panel(260, 40 + Snd.TRACKS.length * 21 + 24, 'MUSIC BOX JUKEBOX');
      Snd.TRACKS.forEach((tr, i) => { UI.button(b.x + 10, b.y + 24 + i * 21, b.w - 20, 18, (C.jukebox === tr.id ? '♥ ' : '') + tr.name, () => { C.jukebox = tr.id; }, { col: C.jukebox === tr.id ? P.yellow : P.white }); });
      UI.button(b.x + 10, b.y + 24 + Snd.TRACKS.length * 21, b.w - 20, 18, 'STOP PREVIEW', () => closeOverlay(), { col: P.light });
      return;
    }
    if (o === 'players') return drawPlayers();
    if (o === 'card') return drawCard();
    if (o === 'hostset') return Game.drawHostSettings(panel(340, G.H, C.mode === 'host' ? 'LOBBY SETTINGS' : 'RULES (host decides)'));
    if (o === 'leave') {
      const b = panel(220, 80, 'LEAVE?'); G.text(C.mode === 'host' ? 'Everyone will be sent home.' : 'Leave this lobby?', b.x + 10, b.y + 26, P.ink);
      UI.button(b.x + 10, b.y + 48, 90, 20, 'LEAVE', () => Game.toMenu(), { col: P.pink }); UI.button(b.x + b.w - 100, b.y + 48, 90, 20, 'STAY', () => closeOverlay()); return;
    }
    if (o === 'pause') return Game.drawPause(panel(240, C.practice ? 230 : 150, C.practice ? 'PRACTICE MENU' : 'MENU'));
  }
  function drawPlayers() {
    const cols = Math.max(1, Math.floor((Math.min(G.W - 8, 400) - 16) / 120)), list = C.roster, rows = Math.ceil(list.length / cols);
    const b = panel(cols * 120 + 16, Math.min(G.H, rows * 22 + 40), 'PLAYERS ' + list.length + '/20');
    list.forEach((e, i) => {
      const x = b.x + 8 + (i % cols) * 120, y = b.y + 24 + Math.floor(i / cols) * 22;
      UI.button(x, y, 116, 20, '', () => { C.card = e.id; C.overlay = 'card'; }, { icon: (bx, by) => { miniFace(e.look, bx + 4, by + 7); G.text(e.name, bx + 16, by + 6, e.id === C.id ? P.dblue : P.ink); if (e.host) G.tiny('HOST', bx + 100, by + 3, P.orange); else if (e.ready) G.text('✔', bx + 104, by + 6, P.green); if (C.muted.has(e.id)) G.tiny('MUTE', bx + 98, by + 12, P.red); } });
    });
  }
  function drawCard() {
    const e = C.byId[C.card]; if (!e) { C.overlay = null; return; }
    const M = C.snap && C.snap.m; const canVote = C.phase === 'meeting' && M && M.st === 'vote' && C.mine.alive && M.myVote == null && !e.dead && !e.left;
    const b = panel(200, 120 + (canVote ? 22 : 0), e.name);
    G.ctx.drawImage(G.charSprite(e.look, 0, Math.floor(performance.now() / 300) % 3), b.x + 10, b.y + 24);
    let y = b.y + 26; const bx = b.x + 50, bw = b.w - 60;
    if (canVote) { UI.button(bx, y, bw, 18, 'VOTE ' + e.name.slice(0, 8), () => { Game.act('vote', { target: e.id }); closeOverlay(); }, { col: P.yellow }); y += 22; }
    if (e.id !== C.id) {
      UI.button(bx, y, bw, 18, C.muted.has(e.id) ? 'UNMUTE' : 'MUTE', () => { if (C.muted.has(e.id)) C.muted.delete(e.id); else C.muted.add(e.id); closeOverlay(); }); y += 22;
      UI.button(bx, y, bw, 18, 'REPORT', () => { send({ t: 'rp', id: e.id }); toast('Report sent to the host.'); closeOverlay(); }); y += 22;
      if (C.mode === 'host' && C.phase === 'lobby') { UI.button(bx, y, bw, 18, 'KICK', () => { Server.kick(e.id); closeOverlay(); }, { col: P.pink }); y += 22; }
    } else G.text("That's you!", bx, y + 4, P.ink);
  }
  function drawMinimap(t) {
    UI.group('ov'); UI.blocker(() => closeOverlay());
    const m = C.map, ctx = G.ctx; if (!m.bg) World.prerender(m);
    const f = Math.min((G.W - 16) / (m.w * T), (G.H - 30) / (m.h * T)), w = Math.floor(m.w * T * f), h = Math.floor(m.h * T * f), x0 = Math.floor((G.W - w) / 2), y0 = Math.floor((G.H - h) / 2) + 6;
    ctx.fillStyle = 'rgba(8,4,16,0.85)'; ctx.fillRect(0, 0, G.W, G.H);
    G.text('MAP', G.W / 2, 4, P.white, { al: 'c' });
    ctx.drawImage(m.bg, x0, y0, w, h);
    for (const r of m.rooms) G.tiny(r.name, x0 + (r.x + r.w / 2) * T * f, y0 + (r.y + r.h / 2) * T * f - 2, P.white, 'c');
    const bl = (t * 3 | 0) % 2;
    for (const tk of (C.mine.tasks || [])) { if (tk[1]) continue; const s = m.stations.find(s2 => s2.task === tk[0]); if (s) G.text('!', x0 + s.x * f - 4, y0 + s.y * f - 8, P.yellow, { ol: P.ink }); }
    const sab = C.snap && C.snap.sab;
    if (sab) for (const s of m.stations) { if ((sab.k === 'lights' && s.kind === 'switch' && !sab.sw[s.sw]) || (sab.k === 'melt' && s.kind === 'melt')) if (bl) G.text('!', x0 + s.x * f - 4, y0 + s.y * f - 8, P.red, { ol: P.ink }); }
    if (C.myRole === 'hex' && C.mine.alive) for (const c of m.chutes) G.rect(x0 + c.x * f - 2, y0 + c.y * f - 4, 4, 4, P.blue);
    if (bl) { G.rect(x0 + C.me.x * f - 2, y0 + C.me.y * f - 3, 5, 5, P.ink); G.rect(x0 + C.me.x * f - 1, y0 + C.me.y * f - 2, 3, 3, P.red); }
    G.text('Tap or press M to close', G.W / 2, G.H - 10, P.grey, { al: 'c' });
    if (UI.hit('map') || UI.hit('back')) closeOverlay();
  }
  function drawCams(t) {
    UI.group('ov'); UI.blocker(() => { });
    const ctx = G.ctx; ctx.fillStyle = '#0d1414'; ctx.fillRect(0, 0, G.W, G.H);
    const m = C.map, fw = Math.floor((G.W - 12) / 2), fh = Math.floor((G.H - 36) / 2);
    m.cams.forEach((cam, i) => {
      const fx = 4 + (i % 2) * (fw + 4), fy = 24 + Math.floor(i / 2) * (fh + 4), cx = cam.x - fw / 2, cy = cam.y - fh / 2;
      ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
      ctx.drawImage(m.bg, cx, cy, fw, fh, fx, fy, fw, fh);
      const ents = [];
      for (const b of C.bodies) ents.push([b[3], () => { const c = G.bodySprite(b[1], lookOf(b[0])); ctx.drawImage(c, fx + b[2] - cx - 13, fy + b[3] - cy - c.height + 2); }]);
      for (const [id, o] of C.others) if (o.vis && !(o.fl & 1)) ents.push([o.y, () => G.drawChar(lookOf(o.disp), o.dir, o.mv ? 1 + (Math.floor(o.anim) % 2) : 0, fx + o.x - cx, fy + o.y - cy)]);
      ents.push([C.me.y, () => G.drawChar(lookOf(C.mine.shiftAs || C.id), C.me.dir, 0, fx + C.me.x - cx, fy + C.me.y - cy)]);
      ents.sort((a, b) => a[0] - b[0]).forEach(e => e[1]());
      ctx.fillStyle = 'rgba(40,120,90,0.18)'; ctx.fillRect(fx, fy, fw, fh);
      for (let y = fy; y < fy + fh; y += 3) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(fx, y, fw, 1); }
      ctx.restore(); G.rect(fx, fy, fw, 1, P.lime); G.tiny(cam.name, fx + 3, fy + 3, P.lime); if ((t * 2 | 0) % 2) { G.rect(fx + fw - 18, fy + 4, 4, 4, P.red); G.tiny('REC', fx + fw - 13, fy + 3, P.red); }
    });
    G.text('SECURITY CAMERAS', 8, 8, P.lime);
    UI.button(G.W - 60, 4, 56, 16, 'CLOSE', () => closeOverlay(), { nav: false });
    if (UI.hit('back') || UI.hit('use')) closeOverlay();
    if (C.phase !== 'play' || !C.mine.alive) closeOverlay();
  }

  // ---------- music choice ----------
  Game.wantedTrack = function () {
    const mode = UI.prof.music; if (mode === 'off') return null;
    if (C && C.jukebox) return C.jukebox;
    const scr = Game.screen; let style = 'jazz', jz = 'jazz_lobby';
    if (scr === 'customize') jz = 'jazz_custom';
    if (C && scr === 'session') {
      const ph = C.phase;
      if (C.over) style = C.over.winner === 'shapes' ? 'showdown' : 'treachery';
      else if (C.reveal) { style = C.reveal.role === 'hex' ? 'treachery' : 'jazz'; jz = 'jazz_workshop'; }
      else if (ph === 'meeting') style = 'treachery';
      else if (ph === 'play') { jz = 'jazz_workshop'; if ((C.snap && C.snap.sab && C.snap.sab.k === 'melt') || (C.snap && C.snap.sd)) style = 'showdown'; }
    }
    if (mode === 'jazz') return jz; if (mode === 'treachery') return 'treachery'; if (mode === 'showdown') return 'showdown';
    return style === 'jazz' ? jz : style;
  };
  Game.practiceRole = t => Server.practiceRole(t);
  Game.pump = function () { const was = C && C.phase; processInbox(); if (C && was === 'lobby' && C.phase !== 'lobby') Game.screen = 'session'; if (!C && Game.screen !== 'menu' && Game.customizeFromLobby) Game.screen = 'menu'; };
})();
