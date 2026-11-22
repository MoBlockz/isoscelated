// ISOSCELATED - the player's client: connects to the host, predicts own movement, smooths others,
// draws the world, HUD, meetings, overlays. Also the session lifecycle (create / join / practice).
'use strict';
const Game = {};
(function () {
  const P = G.P, T = World.T;
  const QUICK = World.QUICK;
  const quickText = (q, who) => World.quickText(q, who ? nameOf(who) : null);
  const TYPE_NAME = { classic: 'CLASSIC', shift: 'SHAPESHIFTER', plant: 'PLANTER' };
  const TYPE_INFO = {
    classic: 'No special power, but a shorter Hex cooldown and a bigger vision circle.',
    shift: 'SHIFT (F): copy any player\'s full look for a while. Hex in disguise to fool witnesses!',
    plant: 'PLANT (F): secretly curse a Shape. The next Shape they get close to is zapped FROM them!'
  };
  Game.TYPE_NAME = TYPE_NAME; Game.TYPE_INFO = TYPE_INFO;
  const SQ_INFO = 'You are a Shape with super sight: you see who is marked (tagged), a red hexagon over disguised Shapeshifters, and you keep your vision in Lights Out.';
  Game.SQ_INFO = SQ_INFO;
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
      onStatus: txt => { if (C === sess) Game.connMsg = txt; },
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
    C.roster = m.list; C.byId = {}; for (const e of m.list) C.byId[e.id] = e; C.settings = m.settings; C.code = m.code; C.mapId = m.mapId; C.gmode = m.mode;
    if (m.phase !== C.phase) setPhase(m.phase);
  }
  function setPhase(ph) {
    const old = C.phase; C.phase = ph;
    if (ph === 'lobby') { C.map = World.buildLobby(); C.over = null; C.eject = null; C.meetFx = null; C.reveal = null; C.bodies = []; C.others.clear(); C.overlay = null; C.seenBodies.clear(); C.chatCh = 'all'; }
    else if (old === 'lobby' && ph !== 'lobby') { C.map = World.buildMap(C.mapId); C.others.clear(); C.overlay = null; Tasks.close(); if (UI.askOpen()) UI.askClose(null); C.chat = C.chat.slice(-3); }
    if (ph === 'meeting') { Tasks.close(); C.overlay = null; C.holding = false; if (UI.askOpen()) UI.askClose(null); }
    if (ph === 'play' && old === 'meeting') { C.chatOpen = false; if (UI.askOpen()) UI.askClose(null); }
  }
  function onSnap(s) {
    if (s.ph !== C.phase) setPhase(s.ph);
    C.snap = s; const mine = s.me; C.mine = mine;
    if (s.mz && C.map) C.map.gateOpen = !!s.mz.open;
    if (mine.tp[0] !== C.me.tpSeq) { C.me.tpSeq = mine.tp[0]; C.me.x = mine.tp[1]; C.me.y = mine.tp[2]; }
    const now = performance.now(), seen = new Set();
    // Stamp positions with the HOST's clock (mapped onto ours), so uneven internet arrival times don't make others stutter.
    let at = now;
    if (s.st != null) {
      const off = now - s.st;
      if (C.clockOff == null || off < C.clockOff || off - C.clockOff > 1000) C.clockOff = off; else C.clockOff += 0.3; // follow the fastest delivery, drift up slowly
      at = s.st + C.clockOff;
    }
    for (const r of s.p) {
      const [id, x, y, d, mv, disp, fl] = r; if (id === C.id) { C.me.fl = fl; C.me.disp = disp; continue; }
      seen.add(id); let o = C.others.get(id);
      if (!o || now - o.last > 400) { o = { buf: [], x, y, dir: d, mv, disp, fl, last: now, anim: Math.random() * 3 }; C.others.set(id, o); }
      o.disp = disp; o.fl = fl; o.last = now; o.vis = true;
      // place each position at the moment it was TRUE (the mover's own time), skipping repeats with no new info
      const key = s.st != null ? s.st + (r[7] || 0) : now; if (r[7] && o.lastKey === key) continue; o.lastKey = key;
      const stamp = at + (r[7] || 0), prev = o.buf.length ? o.buf[o.buf.length - 1][0] : -1e9;
      C.late = Math.max(now - stamp, (C.late || 0) * 0.995); // how far behind the freshest news can be
      o.buf.push([Math.max(stamp, prev + 1), x, y, d, mv]); if (o.buf.length > 12) o.buf.shift();
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
        C.mySq = !!e.sq;
        if (e.quiet) { UI.say(e.role === 'hex' ? 'You are now a HEXAGONER: ' + TYPE_NAME[e.type] + '. ' + TYPE_INFO[e.type] : e.sq ? 'You are now the SQUAREFF! ' + SQ_INFO : 'You are now a SHAPE.', { auto: 3 }); C.myRole = e.role; C.myType = e.type; break; }
        C.reveal = { role: e.role, type: e.type, mates: e.mates, maze: e.mode === 'maze', t: 0, t0: performance.now() }; C.myRole = e.role; C.myType = e.type; C.chat = []; Snd.sfx('reveal'); C.heartT = 0;
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
      case 'meeting': C.meetFx = { t: 0, t0: performance.now(), reason: e.reason, by: e.by, body: e.body, obj: e.obj, q: e.q }; C.meetCount++; Snd.sfx(e.reason === 'bell' ? 'bell' : 'report'); Snd.sfx('reveal'); Tasks.close(); C.overlay = null; C.card = null; C.chatCh = (C.mine.alive ? 'all' : 'spirit'); break;
      case 'eject': C.eject = { id: e.id, text: e.text, counts: e.counts, skips: e.skips, as: e.as, piece: e.piece, t: 0, t0: performance.now(), look: e.id ? lookOf(e.id) : null }; break;
      case 'resume': C.eject = null; C.meetFx = null; C.chatOpen = false; break;
      case 'over': C.over = Object.assign({ t: 0, t0: performance.now() }, e); C.eject = null; C.meetFx = null; Tasks.close(); C.overlay = null; Snd.sfx(e.mode === 'maze' ? ((e.winner === 'runners') === (C.myRole === 'runner') ? 'fanfare' : 'sad') : e.winner === 'shapes' ? (C.myRole === 'shape' ? 'fanfare' : 'sad') : (C.myRole === 'hex' ? 'fanfare' : 'sad')); break;
      case 'lobby': C.over = null; break;
      case 'chat': if (C.muted.has(e.from)) break; C.chat.push({ ch: e.ch, from: e.from, text: e.text, t: performance.now() }); if (C.chat.length > 60) C.chat.shift(); C.chatFlash = 6; Snd.sfx('chat'); break;
      case 'quick': {
        if (C.muted.has(e.from)) break; C.bubbles[e.from] = { q: e.q, who: e.who, t: 4 };
        const qe = QUICK[e.q]; C.chat.push({ ch: e.ch === 'all' ? 'quick' : e.ch, from: e.from, text: qe && qe.e ? '(' + qe.e + ')' : quickText(e.q, e.who), emote: qe && qe.e, t: performance.now() }); if (C.chat.length > 60) C.chat.shift();
        Snd.sfx('chat'); break;
      }
      case 'reportlog': UI.say('REPORT about ' + e.name + ' (from ' + e.by + '). Last messages: ' + (e.msgs.length ? e.msgs.map(s => '"' + s + '"').join(' ') : '(none)') + '  You can kick them from the player list.'); break;
      case 'taskok': Snd.sfx('task'); break;
      case 'caught': G.smoke(e.x, e.y, P.glow, 16); Snd.sfx('caught'); if (e.id === C.id) UI.say('Caught by the Minotaur! You are a Spirit now: float around and cheer the others on.', { auto: 3 }); else toast(nameOf(e.id) + ' was caught!'); break;
      case 'key': Snd.sfx('key'); toast((e.id === C.id ? 'You' : nameOf(e.id)) + ' found a golden key! (' + e.n + '/3)', P.yellow); break;
      case 'gate': Snd.sfx('gate'); if (C.map) C.map.gateOpen = true; UI.say('All 3 keys found! The EXIT GATE is open. RUN!', { auto: 2.5, top: true, col: '#e8ffd6' }); break;
      case 'escaped': Snd.sfx('fanfare'); if (e.id === C.id) UI.say('You ESCAPED the maze! Well done!', { auto: 3 }); else toast(nameOf(e.id) + ' escaped!', P.lime); break;
      case 'snd': Snd.sfx(e.s); break;
    }
  }
  function oops() { C && (C.oopsT = performance.now()); UI.say("Oops! That message wasn't sent. Please keep chat kind.", { auto: 2.5, col: '#ffe8e8' }); Snd.sfx('error'); }

  // ---------- chat sending ----------
  Game.openChat = function () { if (C) { C.overlay = 'quick'; UI.eat('chat'); UI.eat('key:Enter'); UI.eat('ok'); } };
  Game._oldTypedChat = function () {
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
  Game.quick = function (q, who) { send({ t: 'q', q, who: who || null, team: C.qTeam && C.myRole === 'hex' ? 1 : 0 }); C.overlay = null; };

  // ---------- local movement ----------
  function speedMul() { return (C.settings && C.settings.speed) || 1; }
  function canMove() { return C.phase === 'lobby' || C.phase === 'play' || C.phase === 'over' && !C.over; }
  function updateMe(dt) {
    const me = C.me;
    let dx = 0, dy = 0;
    const block = Tasks.active() || UI.sayBlocking() || (C.overlay && C.overlay !== 'quick') || !canMove() || C.reveal || UI.typing() || (C.snap && C.snap.mz && C.myRole === 'mino' && C.snap.mz.head > 0 && C.phase === 'play');
    if (!block) {
      if (UI.held('left')) dx -= 1; if (UI.held('right')) dx += 1; if (UI.held('up')) dy -= 1; if (UI.held('down')) dy += 1;
      if (UI.dpad.id !== null) { dx = UI.dpad.dx; dy = UI.dpad.dy; }
    }
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    const ghost = C.phase === 'play' && !C.mine.alive;
    const sp = (ghost ? 88 : 70) * speedMul() * (C.myRole === 'mino' && C.gmode === 'maze' && !ghost ? 1.08 : 1);
    me.mv = l > 0.15 ? 1 : 0;
    if (me.mv) {
      if (Math.abs(dx) > Math.abs(dy)) me.dir = dx < 0 ? 2 : 3; else me.dir = dy < 0 ? 1 : 0;
      const jam = C.snap && C.snap.sab && C.snap.sab.k === 'jam' ? C.snap.sab.room : null;
      World.move(C.map, me, dx * sp * dt, dy * sp * dt, ghost, jam);
      me.anim += dt * 8; me.stepT -= dt; if (me.stepT <= 0 && !ghost) { me.stepT = 0.3; Snd.sfx('step'); }
    }
    C.sendT -= dt;
    if (C.sendT <= 0 && C.connected) { C.sendT = 1 / 15; send({ t: 'm', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, d: me.dir, v: me.mv, s: me.tpSeq, ts: Math.round(performance.now()) }); }
  }
  function interp(o, now) {
    const rt = now - Math.max(100, Math.min(500, (C.late || 0) + 80)), b = o.buf; if (!b.length) return;
    let a = b[0], c = b[b.length - 1], px, py;
    for (let i = 0; i < b.length - 1; i++) if (b[i][0] <= rt && b[i + 1][0] >= rt) { a = b[i]; c = b[i + 1]; break; }
    if (rt >= c[0]) { px = c[1]; py = c[2]; o.dir = c[3]; o.mv = c[4]; }
    else if (rt <= a[0]) { px = a[1]; py = a[2]; o.dir = a[3]; o.mv = a[4]; }
    else { const k = (rt - a[0]) / Math.max(1, c[0] - a[0]); px = a[1] + (c[1] - a[1]) * k; py = a[2] + (c[2] - a[2]) * k; o.dir = c[3]; o.mv = c[4]; }
    o.x = px; o.y = py;
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
    const target = C.myRole === 'hex' ? (C.myType === 'classic' ? 122 : 108) : (sabK === 'lights' && !C.mySq ? 38 : 92);
    C.vis += (target - C.vis) * Math.min(1, dt * 3);

    drawWorld(dt, t);
    if (C.phase === 'lobby') drawLobbyHud(dt, t);
    else if ((C.phase === 'play' || C.phase === 'reveal') && C.gmode === 'maze') drawMazeHud(dt, t);
    else if (C.phase === 'play' || C.phase === 'reveal') drawPlayHud(dt, t);
    if (C.phase === 'meeting') drawMeeting(dt, t);
    if (C.reveal) drawReveal(dt, t);
    if (C.over) drawOver(dt, t);
    drawOverlay(dt, t);
    drawToasts();
  };

  // ---------- world drawing ----------
  let camx = 0, camy = 0, camGlide = false;
  const redSil = new WeakMap();
  function redOutline(c) { let r = redSil.get(c); if (!r) { const [cv, x] = G.mk(c.width, c.height); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = P.hexred; x.fillRect(0, 0, c.width, c.height); r = cv; redSil.set(c, r); } return r; }
  function drawPlayer(look, name, x, y, dir, anim, mv, opts) {
    opts = opts || {}; const ctx = G.ctx; const sx = Math.round(x - camx), sy = Math.round(y - camy);
    if (sx < -30 || sy < -40 || sx > G.W + 30 || sy > G.H + 40) return;
    const frame = mv ? 1 + (Math.floor(anim) % 2) : 0;
    // shadow
    ctx.fillStyle = 'rgba(20,10,30,0.28)'; ctx.fillRect(sx - 7, sy - 1, 14, 3); ctx.fillRect(sx - 5, sy - 2, 10, 5);
    if (opts.hexmate) { const c = G.charSprite(look, dir === 2 ? 3 : dir, frame), r = redOutline(c); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { if (dir === 2) { ctx.save(); ctx.translate(sx + 14 + dx, 0); ctx.scale(-1, 1); ctx.drawImage(r, 0, sy - 33 + dy); ctx.restore(); } else ctx.drawImage(r, sx - 14 + dx, sy - 33 + dy); } }
    let alpha = null; if (opts.spirit) alpha = 0.45 + 0.25 * (Math.sin(performance.now() / 90 + x) > 0.6 ? 0 : 1);
    // Spirits FLY: no walking, they float up and down with a wavy ghost tail
    const bob = opts.spirit ? Math.round(Math.sin(performance.now() / 260 + x * 0.1) * 3) - 7 : 0;
    if (opts.mino && !opts.spirit) { G.drawMinotaur(look, dir, frame, sx, sy); if (name) G.tiny(name + ' (MINOTAUR)', sx, sy - 64, P.orange, 'c'); return; }
    if (opts.spirit) G.drawGhost(look, dir, sx, sy + bob, alpha, performance.now() / 1000 + x * 0.01);
    else G.drawChar(look, dir, frame, sx, sy + bob, alpha);
    let ty = sy - 40 + bob; if (look.hat === 2 || look.hair === 1 || look.hair === 3) ty -= 3;
    if (opts.hexmate) { G.tiny('HEX', sx, ty - 7, P.hexred, 'c'); }
    if (opts.marked) { const by = ty - 9 + Math.round(Math.sin(performance.now() / 200) * 1.5); const c = (performance.now() / 150 | 0) % 2 ? P.glow : P.purple; G.rect(sx - 2, by, 5, 5, c); G.rect(sx - 3, by + 1, 7, 3, c); G.rect(sx - 1, by + 1, 3, 3, '#fff'); G.rect(sx, by + 2, 1, 1, P.dpurple); }
    if (opts.disguised) { // the Squareff sees a bold red hexagon over a disguised Shapeshifter
      const hy = ty - 14 + Math.round(Math.sin(performance.now() / 180) * 1.5), rows = [3, 5, 7, 9, 9, 7, 5, 3]; rows.forEach((w, i) => { G.rect(sx - Math.ceil(w / 2) - 1, hy + i, w + 2, 1, P.ink); }); rows.forEach((w, i) => { if (i > 0 && i < 7) G.rect(sx - Math.ceil(w / 2) + 1, hy + i, w - 2, 1, P.hexred); }); G.rect(sx - 1, hy + 2, 1, 1, '#fff'); }
    if (name) G.tiny(name, sx, ty, opts.spirit ? '#bcd7ff' : (opts.me ? P.yellow : P.white), 'c');
  }
  function drawBubble(id, x, y) {
    const b = C.bubbles[id]; if (!b) return; const sx = Math.round(x - camx), sy = Math.round(y - camy) - 50;
    const q = QUICK[b.q]; if (!q) return;
    if (q.e) { G.box(sx - 11, sy - 8, 22, 20, P.white); G.ctx.drawImage(G.emote(q.e), sx - 8, sy - 5, 16, 16); }
    else { const lines = G.wrap(quickText(b.q, b.who), 20), w = Math.max(...lines.map(l => l.length)) * 8 + 10, h = lines.length * 10 + 6, top = sy + 12 - h;
      G.box(sx - w / 2, top, w, h, P.white); lines.forEach((l, i) => G.text(l, sx, top + 4 + i * 10, P.ink, { al: 'c' })); }
  }
  function drawWorld(dt, t) {
    const me = C.me;
    // Camera: locked to the player on whole pixels, so you never wobble against the floor/hedges.
    // Only big jumps (teleports, chutes) glide; very big ones snap.
    const tx = Math.round(me.x) - (G.W >> 1), ty = Math.round(me.y) - 12 - (G.H >> 1), far = Math.max(Math.abs(tx - camx), Math.abs(ty - camy));
    if (far > 24 && far <= 200) camGlide = true;
    if (camGlide && far > 1 && far <= 200) { const k = Math.min(1, dt * 12), st = (a, b) => { const d = (b - a) * k; return a + (Math.abs(d) < 1 ? Math.sign(b - a) : Math.round(d)); }; camx = st(camx, tx); camy = st(camy, ty); }
    else { camGlide = false; camx = tx; camy = ty; }
    const m = C.map, sab = C.snap && C.snap.sab;
    const mapW = m.w * T, mapH = m.h * T;
    if (mapW < G.W) camx = Math.round((mapW - G.W) / 2); if (mapH < G.H) camy = Math.round((mapH - G.H) / 2);
    World.draw(m, camx, camy, { t, rattle: C.rattle, chuteWobble: C.wobble, jam: sab && sab.k === 'jam' ? sab.room : null, switches: sab && sab.k === 'lights', lights: sab && sab.sw, melt: sab && sab.k === 'melt' });
    // drawables sorted by y
    const list = [];
    if (m.kind === 'maze' && C.snap && C.snap.mz) {
      for (const k of C.snap.mz.keys) if (!k[2]) list.push({ y: k[1] - 20, f: () => G.drawKey(k[0] - camx, k[1] - camy, t) });
      const ex = m.exit, gx = ex.x - camx, gy = ex.y - camy, open = C.snap.mz.open;
      list.push({ y: ex.y - 30, f: () => { G.rect(gx - 18, gy - 26, 36, 6, P.ink); G.rect(gx - 17, gy - 25, 34, 4, open ? P.lime : P.gold); for (let i = -14; i <= 14; i += 7) G.rect(gx + i, gy - 20 + (open ? -14 : 0), 3, open ? 4 : 20, open ? P.lime : '#6b6f8a'); G.text(open ? 'EXIT OPEN' : 'EXIT', gx, gy - 38, open ? P.lime : P.yellow, { al: 'c', ol: P.ink }); } });
    }
    for (const b of C.bodies) list.push({ y: b[3], f: () => drawBody(b, dt) });
    const iAmSpirit = C.phase === 'play' && !C.mine.alive;
    for (const [id, o] of C.others) {
      if (!o.vis) continue; const spirit = !!(o.fl & 1) && C.phase !== 'lobby';
      list.push({ y: o.y, f: () => { drawPlayer(lookOf(o.disp), nameOf(o.disp), o.x, o.y, o.dir, o.anim, o.mv, { spirit, hexmate: !!(o.fl & 2), marked: !!(o.fl & 4), disguised: !!(o.fl & 8), mino: !!(o.fl & 16) }); } });
    }
    const myDisp = C.mine.shiftAs || C.id;
    list.push({ y: me.y, f: () => drawPlayer(lookOf(myDisp), nameOf(myDisp), me.x, me.y, me.dir, me.anim, me.mv, { me: true, spirit: iAmSpirit, mino: C.gmode === 'maze' && C.myRole === 'mino' && C.phase !== 'lobby' }) });
    list.sort((a, b) => a.y - b.y); for (const d of list) d.f();
    drawStationHints(t);
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
    if (C.roomT > 0 && C.phase === 'play' && rn !== 'Hallway') { C.roomT -= dt; G.text(rn, G.W / 2, G.H - (UI.isTouch ? 112 : 70), P.white, { al: 'c', ol: P.ink }); }
  }
  // ---------- station hints: what is this thing, and is it one of MY jobs? ----------
  function stationInfo(s) {
    const mine = C.mine || {}, sab = C.snap && C.snap.sab, alive = !!mine.alive;
    switch (s.kind) {
      case 'task': { const todo = C.phase === 'play' && (mine.tasks || []).some(t => t[0] === s.task && !t[1]); return { name: World.questName(C.map, s.task), todo, col: P.yellow }; }
      case 'switch': return { name: 'Light switch', todo: alive && sab && sab.k === 'lights' && !sab.sw[s.sw], col: P.red };
      case 'melt': return { name: 'Meltdown button', todo: alive && sab && sab.k === 'melt', col: P.red };
      case 'cams': return { name: 'Security cameras', todo: false };
      case 'bell': return { name: 'Meeting bell', todo: false };
      case 'chute': return C.myRole === 'hex' && alive ? { name: 'Toy chute', todo: false, col: P.pink } : null;
      case 'jukebox': return { name: 'Music box (jukebox)', todo: true, col: P.pink };
      case 'mirror': return { name: 'Mirror (change look)', todo: true, col: P.sky };
    }
    return null;
  }
  function drawStationHints(t) {
    const me = C.me, bob = Math.round(Math.abs(Math.sin(t * 4)) * 3), use = context().use;
    for (const s of C.map.stations) {
      const info = stationInfo(s); if (!info) continue;
      const sx = Math.round(s.x - camx), sy = Math.round(s.y - camy) - 22; // label sits above the station's prop
      if (sx < -60 || sy < -20 || sx > G.W + 60 || sy > G.H + 20) continue;
      const d = Math.hypot(me.x - s.x, me.y - s.y), close = d < 90;
      if (info.todo) { G.text('!', sx - 4, sy - 14 - bob, info.col || P.yellow, { ol: P.ink }); }
      if (info.todo || close) G.tiny(info.name, sx, sy - 2, info.todo ? (info.col || P.yellow) : P.white, 'c');
      if (use === s) { // pulsing brackets around the thing you can use right now
        const k = (t * 3 | 0) % 2, x0 = sx - 12, y0 = sy + 2, x1 = sx + 11, y1 = sy + 24, c = k ? P.yellow : P.white;
        for (const [x, y, ax, ay] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { G.rect(Math.min(x, x + ax * 4), y, 5, 1, c); G.rect(x, Math.min(y, y + ay * 4), 1, 5, c); }
      }
    }
  }
  function usePrompt(cx) { // big readable "E: do this" banner above the buttons
    if (!cx.use) return; const info = stationInfo(cx.use); if (!info) return;
    const verb = cx.use.kind === 'melt' ? 'HOLD' : cx.use.kind === 'switch' ? 'FLIP' : cx.use.kind === 'bell' ? 'RING' : 'USE';
    const left = UI.isTouch ? 90 : 4, right = G.W - (C.phase === 'play' ? 150 : 60), maxc = Math.max(6, Math.floor((right - left - 12) / 8));
    let txt = (UI.isTouch ? verb + ': ' : 'E: ') + info.name; if (txt.length > maxc) txt = txt.slice(0, maxc - 1) + '.';
    const w = txt.length * 8 + 12, x = Math.round(Math.max(left, (left + right) / 2 - w / 2)), y = G.H - (UI.isTouch ? 26 : 22);
    G.box(x, y, w, 18, '#fff6c8'); G.text(txt, x + 6, y + 5, P.ink);
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
  function drawToasts() { if (C.over || C.reveal) return; C.toasts.forEach((t, i) => { const y = 40 + i * 12; const w = t.text.length * 8 + 8; G.rect(G.W / 2 - w / 2, y - 2, w, 11, 'rgba(20,14,32,0.8)'); G.text(t.text, G.W / 2, y, t.col || P.white, { al: 'c' }); }); }

  // ---------- LOBBY HUD ----------
  function drawLobbyHud(dt, t) {
    const host = C.mode === 'host', n = C.roster.length, ready = C.roster.filter(e => e.ready).length;
    // code in huge letters
    const sc = G.W > 360 ? 3 : 2, cw = 5 * 8 * sc + 20;
    G.box(G.W / 2 - cw / 2, 4, cw, 8 * sc + 22, P.white);
    G.text('LOBBY CODE', G.W / 2, 8, P.mid, { al: 'c' });
    G.text(C.code, G.W / 2, 18, P.dblue, { al: 'c', sc });
    G.text(n + '/20 players  ' + ready + ' ready', G.W / 2, 8 * sc + 30, P.white, { al: 'c', ol: P.ink });
    if (C.mode === 'join' && C.link && C.link.mode) G.tiny(C.link.mode === 'relay' ? 'CONNECTED VIA RELAY' : 'CONNECTED DIRECTLY', G.W / 2, 8 * sc + 41, C.link.mode === 'relay' ? P.yellow : P.lime, 'c');
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
      const S = C.settings, maze = S.mode === 'maze', okHex = maze || Server.hexValid(S.hexCount, n), can = (maze ? n >= 2 : n >= 4) && okHex;
      UI.button(bx, by, bw, 22, 'START', () => { const err = Server.start_game(); if (err) UI.say(err); }, { nav: false, col: can ? P.yellow : P.grey, disabled: !can, onDisabled: () => UI.say(n < (maze ? 2 : 4) ? 'You need at least ' + (maze ? 2 : 4) + ' players to start. Share the code or add AI!' : 'Too many Hexagoners for this many players. Change it in SETTINGS.') }); by += 26;
      if (!can) G.text(n < (maze ? 2 : 4) ? 'Need ' + (maze ? 2 : 4) + '+' : 'Too many HEX', bx + bw / 2, by, P.yellow, { al: 'c', ol: P.ink });
      const bots = C.roster.filter(e => e.bot).length;
      UI.button(bx, by + 10, 40, 16, '+AI', () => Server.addBot(), { nav: false, col: '#cfe0ff', disabled: n >= 20 });
      UI.button(bx + 44, by + 10, 40, 16, '-AI', () => Server.removeBot(), { nav: false, col: '#cfe0ff', disabled: !bots });
      G.tiny(bots + ' AI PLAYER' + (bots === 1 ? '' : 'S'), bx + bw / 2, by + 29, P.white, 'c');
    } else G.text('Waiting for host', bx + bw / 2, by + 2, P.white, { al: 'c', ol: P.ink });
    // chat
    const cwid = Math.min(G.W - bw - 30 - (UI.isTouch ? 0 : 0), 300), ch = 56;
    const cx = UI.isTouch ? Math.max(100, G.W - bw - 12 - cwid) : 4;
    drawChatLog(cx, G.H - ch - 22, cwid, ch, 5, { empty: C.settings.chat === 'off' ? 'Chat is off.' : 'Press QUICK CHAT to talk!' });
    smallBtn(cx, G.H - 20, 'QUICK CHAT', () => { C.overlay = 'quick'; }, { disabled: C.settings.chat === 'off' });
    // use prompt
    const cx2 = context();
    if (cx2.use) { UI.action(G.W - 34, G.H - 34, 22, 'USE', () => doUse(cx2), { col: P.green, key: 'E' }); usePrompt(cx2); }
    if (!C.overlay && !UI.typing()) { if (UI.hit('use') && cx2.use) doUse(cx2); if (UI.hit('chat') || UI.hit('key:Enter')) Game.openChat(); if (UI.hit('quick')) openOv('quick', 'quick'); if (UI.hit('back')) openOv('pause', 'back'); }
    drawDpad();
  }
  function confirmLeave() { C.overlay = 'leave'; }
  function openOv(name, key) { C.overlay = name; UI.eat(key); UI.eat('use'); }

  // ---------- PLAY HUD ----------
  function drawPlayHud(dt, t) {
    const s = C.snap; if (!s) return; const mine = C.mine, hex = C.myRole === 'hex', alive = !!mine.alive;
    // ---- role badge (top-left) ----
    const sq = C.mySq && !hex, roleTxt = !alive ? 'SPIRIT' : hex ? 'HEXAGONER' : sq ? 'SQUAREFF' : 'SHAPE', roleCol = !alive ? '#5d7fd0' : hex ? P.dred : sq ? '#b8860b' : P.blue;
    const goal = !alive ? 'Keep doing chores! Chat with Spirits.' : hex ? (TYPE_NAME[C.myType] || '') + ': hex Shapes, don\'t get caught' : sq ? 'You see marks + disguises' : 'Do chores. Find the Hexagoners!';
    const rw = roleTxt.length * 8 + 12; G.rect(3, 3, rw + 2, 15, P.ink); G.rect(4, 4, rw, 13, roleCol); G.text(roleTxt, 10, 7, P.white);
    // ---- chore bar (top-centre) ----
    const bw = Math.max(90, Math.min(200, G.W - rw - 150)), bx = Math.floor(Math.max(rw + 12, G.W / 2 - bw / 2));
    G.rect(bx - 2, 3, bw + 4, 15, P.ink); G.rect(bx, 5, bw, 11, P.dgreen); G.rect(bx, 5, Math.round(bw * s.bar), 11, P.lime);
    for (let i = 10; i < bw; i += 10) G.rect(bx + i, 5, 1, 11, 'rgba(0,0,0,0.18)');
    G.text('CHORES ' + Math.floor(s.bar * 100) + '%', bx + bw / 2, 7, P.white, { al: 'c', ol: P.dgreen });
    if (s.mt >= 0) { const tx = bx + bw + 6, tt = UI.fmtT(s.mt); G.rect(tx, 3, tt.length * 8 + 8, 15, P.ink); G.text(tt, tx + 4, 7, s.mt < 60 && (t * 2 | 0) % 2 ? P.red : P.white); }
    G.tiny(goal, 5, 21, hex ? P.pink : '#cfe0ff');
    // ---- sabotage alarm: big dark-red box, right of the chore panel ----
    const panelW = Math.min(G.W * 0.42, 150);
    if (s.sab) {
      const fl = (t * 3 | 0) % 2; let l1 = '', l2 = '';
      if (s.sab.k === 'lights') { l1 = 'LIGHTS OUT!'; l2 = 'Flip BOTH switches: Gear Room + Candy Kitchen (' + s.sab.sw.filter(Boolean).length + '/2 done)'; }
      if (s.sab.k === 'melt') { l1 = 'MELTDOWN ' + s.sab.t + 's!'; l2 = 'Two players HOLD the buttons in Boiler Room AND Library (' + (s.sab.hold ? s.sab.hold.filter(Boolean).length : 0) + '/2)'; }
      if (s.sab.k === 'jam') { l1 = 'DOORS JAMMED ' + s.sab.t + 's'; l2 = C.map.rooms[s.sab.room].name + ' is locked shut'; }
      const x = Math.round(panelW + 10), w = G.W - x - 4, big = w > l1.length * 16 + 10, lines = G.wrap(l2, Math.floor((w - 10) / 4)), h = (big ? 22 : 14) + lines.length * 7 + 4;
      G.box(x, 40, w, h, fl ? '#7a1426' : '#4a0c18', P.ink);
      G.text(l1, x + w / 2, 45, fl ? P.yellow : P.white, { al: 'c', sc: big ? 2 : 1 });
      lines.forEach((l, i) => G.tiny(l, x + w / 2, 45 + (big ? 19 : 11) + i * 7, P.white, 'c'));
    }
    // ---- chore list panel (left), tap the header to fold it ----
    let y = 30; const tl = mine.tasks || [], doneN = tl.filter(x => x[1]).length;
    const head = (hex ? 'FAKE CHORES' : 'MY CHORES') + ' ' + doneN + '/' + tl.length + (C.showTasks === false ? ' ▶' : ' ▼');
    const pw = panelW, showRoom = G.H >= 250, rowH = showRoom ? 16 : 11;
    G.rect(3, y, pw, 12, 'rgba(14,10,24,0.82)'); G.text(head, 7, y + 2, hex ? P.pink : P.yellow);
    UI.area(3, y, pw, 12, () => { C.showTasks = C.showTasks === false; }, { silent: false }); y += 12;
    if (C.showTasks !== false && tl.length) {
      const rows = tl.length; G.rect(3, y, pw, rows * rowH + 3, 'rgba(14,10,24,0.62)');
      if (hex) { /* hexagoners: tasks are only for blending in */ }
      tl.forEach(tk => {
        const st = C.map.stations.find(s2 => s2.task === tk[0]); const room = st ? C.map.rooms[st.room].name : '';
        const nm = World.questName(C.map, tk[0]), maxc = Math.floor((pw - 18) / 8);
        G.text(tk[1] ? '✔' : '▶', 6, y + 2, tk[1] ? P.lime : P.yellow); G.text(nm.length > maxc ? nm.slice(0, maxc - 1) + '.' : nm, 15, y + 2, tk[1] ? '#8fbf7a' : P.white);
        if (showRoom) G.tiny(room, 15, y + 11, tk[1] ? P.mid : P.grey); y += rowH;
      });
      if (hex) { G.tiny('BAR NEVER MOVES FOR YOU', 6, y + 2, P.pink); y += 8; }
    }
    // ---- top-right buttons ----
    let rx = G.W - 4; rx -= 50; smallBtn(rx, 22, 'MENU', () => { C.overlay = 'pause'; });
    rx -= 42; smallBtn(rx, 22, 'MAP', () => { C.overlay = 'map'; });
    rx -= 58; smallBtn(rx, 22, 'QUICK', () => { C.overlay = 'quick'; });
    const ch = chatChannel();
    // recent hex/spirit chat
    if (C.chat.length && (hex || !alive)) { const last = C.chat.slice(-3).filter(m => performance.now() - m.t < 8000); if (last.length || C.chatOpen) { const saved = C.chat; C.chat = C.chatOpen ? saved : last; drawChatLog(4, G.H - (UI.isTouch ? 130 : 66), Math.min(260, G.W - 120), C.chatOpen ? 60 : last.length * 10 + 10, 3); C.chat = saved; } }
    // action buttons (bottom-right)
    if (C.phase !== 'play') { drawDpad(); return; }
    const cx = context(); const R = Math.min(24, Math.floor(G.H / 9)); usePrompt(cx);
    const ax = G.W - R - 8, ay = G.H - R - 14;
    const useLbl = cx.use ? ({ task: 'USE', switch: 'FLIP', melt: 'HOLD', cams: 'CAMS', bell: 'BELL', chute: 'CHUTE' }[cx.use.kind] || 'USE') : 'USE';
    const useBtn = UI.action(ax, ay, R, useLbl, () => { if (cx.use && cx.use.kind !== 'melt') doUse(cx); }, { col: P.green, disabled: !cx.use, key: 'E', cap: cx.use ? useLbl : 'USE' });
    // meltdown hold
    const holdNow = cx.use && cx.use.kind === 'melt' && ((UI.held('use') && !UI.typing()) || UI.anyHeldIn(useBtn.x, useBtn.y, useBtn.w, useBtn.h));
    if (holdNow && !C.holding) { C.holding = true; Game.act('hold', { on: 1, btn: cx.use.btn }); }
    if (!holdNow && C.holding) { C.holding = false; Game.act('hold', { on: 0 }); }
    if (cx.use && cx.use.kind === 'melt' && C.holding) G.text('HOLDING!', ax, ay - R - 12, P.yellow, { al: 'c', ol: P.ink });
    if (alive) UI.action(ax - R * 2 - 10, ay, R, 'RPT', () => Game.act('report'), { col: P.orange, disabled: !cx.report, key: 'R', cap: 'REPORT' });
    if (alive && hex) {
      UI.action(ax, ay - R * 2 - 14, R, 'HEX', () => Game.act('hex'), { col: P.purple, disabled: !cx.hex || mine.hexCd > 0, cd: mine.hexCd, key: 'Q', cap: 'HEX' });
      if (C.myType === 'shift') UI.action(ax - R * 2 - 10, ay - R * 2 - 14, R, mine.shiftT > 0 ? 'ON' : 'SHFT', () => { if (mine.shiftT <= 0 && mine.shiftCd <= 0) C.overlay = 'shift'; }, { col: P.teal, disabled: mine.shiftT > 0 || mine.shiftCd > 0, cd: mine.shiftT > 0 ? mine.shiftT : mine.shiftCd, key: 'F', cap: mine.shiftT > 0 ? 'DISGUISED' : 'SHIFT' });
      if (C.myType === 'plant') UI.action(ax - R * 2 - 10, ay - R * 2 - 14, R, 'PLNT', () => Game.act('plant'), { col: P.pink, disabled: !cx.plant || mine.plantCd > 0 || mine.marking, cd: mine.marking ? 0 : mine.plantCd, key: 'F', cap: 'PLANT' });
      UI.action(ax - R * 4 - 20, ay - R * 2 - 14, R, 'SAB', () => { C.overlay = 'sab'; }, { col: P.dred, disabled: !!(s.sab) || mine.sabCd > 0, cd: s.sab ? 0 : mine.sabCd, key: 'X', cap: 'SABOTAGE' });
      if (mine.marking) G.tiny('MARK ACTIVE', ax - R * 2 - 10, ay - R * 3 - 22, P.glow, 'c');
    }
    if (!alive && cx.rattle) UI.action(ax - R * 2 - 10, ay, R, 'RTL', () => Game.act('rattle', { prop: cx.rattle.id }), { col: P.sky, key: 'F', cap: 'RATTLE' });
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
      if (UI.hit('chat') || UI.hit('key:Enter')) Game.openChat();
      if (UI.hit('back')) openOv('pause', 'back');
      if (UI.hit('tab')) C.showTasks = C.showTasks === false;
    }
    drawDpad();
  }

  // ---------- MINOTAUR MAZE HUD ----------
  function drawMazeHud(dt, t) {
    const s = C.snap; if (!s || !s.mz) return; const Z = s.mz, mino = C.myRole === 'mino', alive = !!C.mine.alive;
    const roleTxt = !alive ? 'SPIRIT' : mino ? 'MINOTAUR' : 'RUNNER', rw = roleTxt.length * 8 + 12;
    G.rect(3, 3, rw + 2, 15, P.ink); G.rect(4, 4, rw, 13, !alive ? '#5d7fd0' : mino ? '#8a5a3b' : P.green); G.text(roleTxt, 10, 7, P.white);
    G.tiny(!alive ? 'WATCH AND CHEER!' : mino ? 'CATCH EVERY SHAPE BEFORE THEY ESCAPE!' : 'FIND 3 KEYS, THEN RUN FOR THE EXIT!', 5, 21, P.cream);
    // keys
    let kx = rw + 12; for (let i = 0; i < 3; i++) { const got = Z.keys.filter(k => k[2]).length > i; G.rect(kx + i * 16, 4, 14, 13, P.ink); G.rect(kx + i * 16 + 1, 5, 12, 11, got ? P.gold : '#4a3d63'); G.text(got ? '✔' : '?', kx + i * 16 + 3, 7, got ? P.ink : P.grey); }
    kx += 52; const info = 'ESCAPED ' + Z.esc + '  CAUGHT ' + Z.caught + '  LEFT ' + Z.left; G.tiny(info, kx, 8, P.white);
    const tt = UI.fmtT(Z.time); G.rect(G.W - tt.length * 8 - 12, 3, tt.length * 8 + 8, 15, P.ink); G.text(tt, G.W - tt.length * 8 - 8, 7, Z.time < 30 && (t * 2 | 0) % 2 ? P.red : P.white);
    if (Z.head > 0 && C.phase === 'play') { const msg = mino ? 'WAIT... ' + Z.head : 'HEAD START! ' + Z.head; G.box(G.W / 2 - msg.length * 8 - 10, 40, msg.length * 16 + 20, 28, mino ? '#ffe0c2' : '#e2ffd0'); G.text(msg, G.W / 2, 46, mino ? P.dbrown : P.dgreen, { al: 'c', sc: 2 }); }
    if (Z.open && !mino && alive) G.text('EXIT IS OPEN! RUN!', G.W / 2, 40, (t * 3 | 0) % 2 ? P.lime : P.yellow, { al: 'c', ol: P.ink });
    let rx = G.W - 4; rx -= 50; smallBtn(rx, 22, 'MENU', () => { C.overlay = 'pause'; }); rx -= 42; smallBtn(rx, 22, 'MAP', () => { C.overlay = 'map'; }); rx -= 58; smallBtn(rx, 22, 'QUICK', () => { C.overlay = 'quick'; });
    if (C.chat.length && !alive) { const last = C.chat.slice(-3).filter(m => performance.now() - m.t < 8000); if (last.length) { const saved = C.chat; C.chat = last; drawChatLog(4, G.H - (UI.isTouch ? 130 : 66), Math.min(260, G.W - 120), last.length * 10 + 10, 3); C.chat = saved; } }
    if (!C.overlay && !UI.typing() && !UI.sayBlocking()) { if (UI.hit('map')) openOv('map', 'map'); if (UI.hit('quick') || UI.hit('key:Enter') || UI.hit('chat')) Game.openChat(); if (UI.hit('back')) openOv('pause', 'back'); }
    // heartbeat: the closer the Minotaur, the faster it thumps (friendly, not scary)
    if (!mino && alive && C.mine.md != null && C.mine.md < 260 && C.phase === 'play' && Z.head <= 0) {
      C.heartT = (C.heartT || 0) - dt; if (C.heartT <= 0) { Snd.sfx('heart'); C.heartT = 0.38 + C.mine.md / 260 * 1.0; C.heartPulse = 0.25; }
    }
    if (C.heartPulse > 0) { C.heartPulse -= dt; G.ctx.fillStyle = 'rgba(255,60,90,' + (C.heartPulse * 0.5).toFixed(2) + ')'; G.ctx.fillRect(0, 0, G.W, 3); G.ctx.fillRect(0, G.H - 3, G.W, 3); G.ctx.fillRect(0, 0, 3, G.H); G.ctx.fillRect(G.W - 3, 0, 3, G.H); }
    drawDpad();
  }

  // ---------- MEETING ----------
  function cardLayout() {
    const n = C.roster.length, cols = Math.max(2, Math.min(5, Math.floor((G.W - 8) / 78))), rows = Math.ceil(n / cols);
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
      if (C.muted.has(e.id)) G.tiny('MUTED', cx + w - 26, cy + 4, P.red); else if (e.bot) G.tiny('AI', cx + w - 12, cy + 4, P.blue);
      if (M.st === 'vote' && e.voted) { G.rect(cx + w - 30, cy + h - 12, 28, 10, P.yellow); G.tiny('VOTED', cx + w - 27, cy + h - 10, P.ink); }
      if (M.st === 'result' && C.eject && C.eject.counts) { const n = C.eject.counts[e.id] || 0; if (n) { G.rect(cx + w - 18, cy + 3, 16, 12, P.red); G.text(String(n), cx + w - 14, cy + 5, P.white); } }
      if (M.myVote === e.id) G.text('✔', cx + w - 11, cy + h - 11, P.green);
      if (C.meetFx && C.meetFx.by === e.id && M.st !== 'result') G.tiny(C.meetFx.reason === 'bell' ? 'RANG BELL' : 'REPORTER', cx + 30, cy + h - 9, P.orange);
      UI.area(cx, cy, w, h, () => { C.card = e.id; C.overlay = 'card'; }, { nav: true });
    });
    // bottom: chat + buttons
    const by = G.H - L.chatH - 4; const bwid = 76;
    drawChatLog(4, by, G.W - bwid - 14, L.chatH, 6, { empty: myAlive ? 'Use QUICK CHAT: who is the Hexagoner?' : 'Spirit chat (only Spirits see this)' });
    let yy = by; const bx = G.W - bwid - 6;
    const ch = chatChannel();

    UI.button(bx, yy, bwid, 30, '', () => { C.overlay = 'quick'; }, { nav: true, col: P.yellow, icon: (x, y) => { G.text('QUICK', x + bwid / 2, y + 5, P.ink, { al: 'c' }); G.text('CHAT', x + bwid / 2, y + 16, P.ink, { al: 'c' }); } }); yy += 34;
    if (M.st === 'vote' && myAlive && M.myVote == null) UI.button(bx, yy, bwid, 16, 'SKIP', () => Game.act('vote', { target: 'skip' }), { nav: true, col: P.light });
    else if (M.myVote === 'skip') G.text('SKIPPED', bx + bwid / 2, yy + 4, P.yellow, { al: 'c' });
    if (M.st === 'result' && C.eject) G.text('Skips: ' + (C.eject.skips || 0), bx + bwid / 2, yy + 4, P.white, { al: 'c' });
    if (!UI.typing() && !C.overlay && (UI.hit('key:Enter') || UI.hit('chat'))) Game.openChat();
    // dramatic encounter intro
    if (C.meetFx) C.meetFx.t = (performance.now() - C.meetFx.t0) / 1000;
    if (C.meetFx && C.meetFx.t < 2.6) { encounter(C.meetFx.t, C.meetFx.reason === 'bell' ? (C.meetFx.q || 'WHY?') : 'PIECE REPORTED!', C.meetFx.reason === 'bell' ? P.yellow : P.orange, C.meetFx); }
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
      else if (fx) { G.drawChar(lookOf(fx.by), 0, 0, G.W / 2, G.H / 2 + 50); G.text(nameOf(fx.by) + ' rang the meeting bell!', G.W / 2, G.H / 2 + 56, P.white, { al: 'c' }); }
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
      const ft = Math.min(tt, 1.3) + Math.max(0, Math.min(tt, 4.5) - 1.3) * 0.35, px = bx + 118 + ft * 90, py = by + 15 - ft * 40 + ft * ft * 14;
      if (tt < 0.4) { G.smoke(bx + 120 + camx, by + 15 + camy, '#fff', 3); }
      const morphed = E.as && tt > 1.3; // after a moment in the air they transform
      if (E.as && tt > 1.3 && !E.flashed) { E.flashed = true; Snd.sfx('hex'); G.smoke(px + camx, py + camy, E.as === 'hex' ? P.hexred : P.glow, 26); G.sparkle(px + camx, py + camy, P.yellow, 12); }
      let c = morphed ? (E.as === 'hex' ? G.hexagonSprite(E.look) : G.bodySprite(E.piece || 0, E.look)) : G.charSprite(E.look, 0, 0);
      const spin = morphed ? 0 : Math.floor(tt * 6) * Math.PI / 2, sc = morphed ? (E.as === 'hex' ? 2 : 3) : 1;
      if (E.as && tt > 1.2 && tt < 1.45) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(px) - 20, Math.round(py) - 26, 40, 44); }
      else { ctx.save(); ctx.translate(Math.round(px), Math.round(py)); ctx.rotate(spin);
        if (morphed && E.as === 'hex') { const r = redOutline(c); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(r, -c.width * sc / 2 + dx * sc, -c.height * sc / 2 + dy * sc, c.width * sc, c.height * sc); }
        ctx.drawImage(c, -c.width * sc / 2, -c.height * sc / 2, c.width * sc, c.height * sc); ctx.restore(); }
      if (morphed) G.text(E.as === 'hex' ? 'A HEXAGON!' : 'A ' + G.PIECES[E.piece || 0].toUpperCase() + '!', Math.round(px), Math.round(py) - 44, E.as === 'hex' ? P.hexred : P.white, { al: 'c', ol: P.ink });
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
    G.text(R.maze && R.role === 'mino' ? 'You are the' : 'You are a', tx, 30, P.white);
    if (R.maze) {
      const mino = R.role === 'mino'; G.text(mino ? 'MINOTAUR' : 'RUNNER', tx, 44, mino ? P.orange : P.lime, { sc: 2, ol: P.ink }); let y2 = 70;
      G.wrap(mino ? 'Wait 10 seconds while the Shapes get a head start... then catch them all before they find the 3 golden keys and escape through the exit!' : 'You get a 10 second head start! Find the 3 golden keys hidden in the hedge maze, then run out of the EXIT before the Minotaur catches you. Listen for the heartbeat!', maxc).forEach(l => { G.text(l, tx, y2, P.white); y2 += 10; });
      return;
    }
    G.text(hex ? 'HEXAGONER' : 'SHAPE', tx, 44, hex ? P.hexred : P.sky, { sc: 2, ol: P.ink });
    let y = 70;
    if (hex) {
      G.text('TYPE: ' + TYPE_NAME[R.type], tx, y, P.yellow); y += 14;
      G.wrap(TYPE_INFO[R.type], maxc).forEach(l => { G.text(l, tx, y, P.white); y += 10; }); y += 4;
      if (R.mates.length) { G.text('Your team:', tx, y, P.pink); y += 11; R.mates.forEach(m => { G.text(nameOf(m.id) + ' - ' + TYPE_NAME[m.type], tx, y, P.hexred); y += 10; }); }
      else { G.text('You are the only Hexagoner!', tx, y, P.pink); }
    } else {
      if (C.mySq) { G.text('SPECIAL: THE SQUAREFF', tx, y, P.yellow); y += 13; G.wrap(SQ_INFO, maxc).forEach(l => { G.text(l, tx, y, P.white); y += 10; }); y += 2; }
      else G.wrap((C.map.goal || 'Finish your chores to power the escape blimp.') + ' Find the Hexagoners and vote them out!', maxc).forEach(l => { G.text(l, tx, y, P.white); y += 10; });
      const nh = C.settings.hexCount; y += 6; G.text(nh + ' Hexagoner' + (nh > 1 ? 's are' : ' is') + ' among us...', tx, y, P.hexred);
    }
  }

  // ---------- GAME OVER ----------
  function drawOver(dt, t) {
    const O = C.over; O.t = (performance.now() - O.t0) / 1000; const ctx = G.ctx; UI.group('over'); UI.blocker();
    const sh = O.winner === 'shapes' || O.winner === 'runners';
    ctx.fillStyle = sh ? '#12306a' : '#3a0a1c'; ctx.fillRect(0, 0, G.W, G.H);
    if (sh) for (let i = 0; i < 40; i++) { const x = (i * 53 + Math.sin(t + i) * 20) % G.W, y = ((i * 31 + t * (20 + i % 5 * 10)) % G.H); G.rect(x, G.H - y, 2, 2, [P.yellow, P.pink, P.lime, P.sky][i % 4]); }
    const mz = O.mode === 'maze'; G.title(mz ? (O.winner === 'runners' ? 'SHAPES ESCAPED!' : 'MINOTAUR WINS!') : sh ? 'SHAPES WIN!' : 'HEXAGONERS WIN!', G.W / 2, 8, G.W > 380 ? 3 : 2, t);
    G.text(O.reason, G.W / 2, 40, P.white, { al: 'c' });
    if (sh && O.t < 6 && O.reason.indexOf('blimp') >= 0) { const bx = -60 + O.t * 70; ctx.fillStyle = P.ink; ctx.beginPath(); ctx.ellipse(bx, 70, 32, 14, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#e8c56a'; ctx.beginPath(); ctx.ellipse(bx, 69, 30, 12, 0, 0, 7); ctx.fill(); }
    if (mz) { // Minotaur Maze keeps the simple list
      const cols = Math.max(1, Math.floor((G.W - 8) / 128)), cw = Math.floor((G.W - 8) / cols), chh = Math.min(26, Math.floor((G.H - 84) / Math.ceil(O.players.length / cols)));
      O.players.forEach((p, i) => {
        const x = 4 + (i % cols) * cw, y = 54 + Math.floor(i / cols) * chh;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, 22, chh - 1); ctx.clip(); ctx.drawImage(G.charSprite(p.look, 0, 0), x - 3, y - 8); ctx.restore();
        G.text(p.name, x + 24, y + 1, P.sky);
        G.tiny(p.role === 'mino' ? 'MINOTAUR' : p.escaped ? 'ESCAPED!' : 'CAUGHT', x + 24, y + 10, p.role === 'mino' ? P.orange : p.escaped ? P.lime : P.pink); G.tiny(p.role === 'mino' ? 'CAUGHT ' + (p.stats.caught || 0) : 'KEYS ' + (p.stats.keys || 0), x + 24, y + 17, P.light);
      });
    } else drawPodium(O, t);
    const host = C.mode === 'host';
    if (O.t > 2) {
      if (host) UI.button(G.W / 2 - 70, G.H - 24, 140, 20, 'BACK TO LOBBY', () => Server.backToLobby(), { col: P.yellow });
      else G.text('Waiting for the host... (' + (C.snap && C.snap.tm || 0) + 's)', G.W / 2, G.H - 18, P.white, { al: 'c' });
      UI.button(4, G.H - 22, 60, 18, 'LEAVE', () => Game.toMenu(), { nav: false });
    }
  }

  // ---------- END-OF-GAME HIGHLIGHTS ----------
  // Hexagoners win: the Hexagoners (as angry HEXAGONS) stand big in the centre.
  // Shapes win: the survivors stand big in the centre, the Hexagoners (as hexagons) on the left.
  // Everyone who was turned into a piece floats on the right as a ghost.
  function drawPodium(O, t) {
    const ctx = G.ctx, hexWin = O.winner === 'hex', ps = O.players;
    const hexes = ps.filter(p => p.role === 'hex'), shapes = ps.filter(p => p.role !== 'hex');
    const survivors = shapes.filter(p => p.alive && !p.left), fallen = shapes.filter(p => !p.alive || p.left);
    const centre = hexWin ? hexes : survivors, left = hexWin ? survivors : hexes;
    const top = 52, bottom = G.H - 30, lw = Math.floor(G.W * 0.27), rx = Math.floor(G.W * 0.73), cx0 = lw, cw = rx - lw;
    const head = (txt, x, col) => G.tiny(txt, x, top - 1, col, 'c');
    const stat = p => p.role === 'hex' ? TYPE_NAME[p.type] + ' - HEXES ' + p.stats.hexes : (p.sq ? 'SQUAREFF - ' : '') + 'TASKS ' + p.stats.tasks + ' - VOTES ' + p.stats.votes;
    // floor glow under the winners
    ctx.fillStyle = hexWin ? 'rgba(255,51,85,0.18)' : 'rgba(246,207,87,0.18)'; ctx.fillRect(cx0 + 6, bottom - 18, cw - 12, 10);
    // ---- centre: the winners, big ----
    head(hexWin ? 'THE HEXAGONERS' : 'THE SURVIVORS', cx0 + cw / 2, hexWin ? P.hexred : P.yellow);
    if (centre.length) { // pick the biggest size that fits, then centre the group vertically
      const sw = hexWin ? 34 : 30, sh = hexWin ? 30 : 36, availH = bottom - top - 10;
      let sc = 1, perRow = 1, rows = 1; for (const k of [3, 2, 1]) { perRow = Math.max(1, Math.floor(cw / (sw * k + 8))); rows = Math.ceil(centre.length / perRow); if (rows * (sh * k * 0.8 + (k > 1 && rows === 1 ? 26 : 10)) <= availH || k === 1) { sc = k; break; } }
      const cellW = sw * sc + 8, cellH = Math.min(sh * sc + (sc > 1 && rows === 1 ? 26 : 14), availH / rows), y0 = top + 6 + Math.max(0, (availH - rows * cellH) / 2);
      centre.forEach((p, i) => {
        const row = Math.floor(i / perRow), inRow = Math.min(perRow, centre.length - row * perRow), col = i % perRow;
        const x = Math.round(cx0 + cw / 2 + (col - (inRow - 1) / 2) * cellW), y = Math.round(y0 + row * cellH + sh * sc), bob = Math.round(Math.sin(t * 3 + i) * 2);
        const spr = hexWin ? G.hexagonSprite(p.look) : G.charSprite(p.look, 0, 1 + (Math.floor(t * 4 + i) % 2));
        ctx.drawImage(spr, x - spr.width * sc / 2, y - spr.height * sc + bob, spr.width * sc, spr.height * sc);
        G.tiny(p.name, x, y + 3, hexWin ? P.pink : P.white, 'c');
        if (sc > 1 && rows === 1) { G.tiny(p.role === 'hex' ? TYPE_NAME[p.type] : (p.sq ? 'SQUAREFF' : 'SHAPE'), x, y + 10, P.light, 'c'); G.tiny(p.role === 'hex' ? p.stats.hexes + ' HEXED' : p.stats.tasks + ' CHORES', x, y + 17, P.grey, 'c'); }
      });
    } else G.text('Nobody!', cx0 + cw / 2, (top + bottom) / 2, P.grey, { al: 'c' });
    // ---- left: the losing side ----
    head(hexWin ? 'SURVIVING SHAPES' : 'HEXAGONERS', lw / 2, hexWin ? '#bcd7ff' : P.hexred);
    const grid = (list, x0, w, draw) => { const per = Math.max(1, Math.floor(w / 36)), rowsN = Math.max(1, Math.ceil(list.length / per)), cell = Math.min(40, (bottom - top - 6) / rowsN), y0 = top + 6 + Math.max(0, (bottom - top - 6 - rowsN * cell) / 2); list.forEach((p, i) => { const inRow = Math.min(per, list.length - Math.floor(i / per) * per), x = x0 + w / 2 + ((i % per) - (inRow - 1) / 2) * (w / per), y = y0 + (Math.floor(i / per) + 1) * cell - 6; draw(p, Math.round(x), Math.round(y), i); }); };
    grid(left, 6, lw - 10, (p, x, y, i) => {
      if (hexWin) G.drawChar(p.look, 0, 0, x, y - 4); else { const s2 = G.hexagonSprite(p.look); ctx.drawImage(s2, x - s2.width / 2, y - s2.height - 2); }
      G.tiny(p.name, x, y - 1, hexWin ? '#bcd7ff' : P.pink, 'c');
    });
    if (!left.length) G.tiny('NONE', lw / 2, (top + bottom) / 2, P.grey, 'c');
    // ---- right: ghosts of everyone who was turned into a piece ----
    head('SPIRITS', rx + (G.W - rx) / 2, '#bcd7ff');
    grid(fallen, rx + 2, G.W - rx - 4, (p, x, y, i) => {
      G.drawGhost(p.look, 0, x, y - 6 + Math.round(Math.sin(t * 2.5 + i) * 3), 0.7, t + i);
      G.tiny(p.name, x, y - 1, '#bcd7ff', 'c');
    });
    if (!fallen.length) G.tiny('NONE', rx + (G.W - rx) / 2, (top + bottom) / 2, P.grey, 'c');
    // dividers
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(lw, top + 4, 1, bottom - top - 4); ctx.fillRect(rx, top + 4, 1, bottom - top - 4);
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
    if (o === 'quick') return drawQuick(t);
    if (o === 'pickwho') return drawPickWho(t);
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
      Snd.TRACKS.forEach((tr, i) => { const sel = C.jukebox === tr.id, by = b.y + 24 + i * 21; const bt = UI.button(b.x + 10, by, b.w - 20, 18, tr.name, () => { C.jukebox = tr.id; }, { col: sel ? P.yellow : P.white, noCursor: true }); if (sel) G.text('▶', b.x + 1, by + 5, P.yellow, { ol: P.ink }); if (!sel && UI.isFocused(bt) && performance.now() - (UI.navMoved || 0) < 150) C.jukebox = tr.id; });
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
    if (o === 'pause') return Game.drawPause(panel(240, C.practice ? 250 : 150, C.practice ? 'PRACTICE MENU' : 'MENU'));
  }
  // ---------- QUICK CHAT panel ----------
  const QTABS = [['say', 'SAY'], ['agree', 'AGREE'], ['deny', 'DISAGREE'], ['who', 'WHO?'], ['emote', ':)']];
  function drawQuick(t) {
    const b = panel(Math.min(G.W - 8, 400), Math.min(G.H - 4, 196), 'QUICK CHAT');
    const tab = C.qTab || 'say'; let x = b.x + 8;
    QTABS.forEach(([k, lbl]) => { const w = lbl.length * 8 + 10; UI.button(x, b.y + 20, w, 16, lbl, () => { C.qTab = k; }, { nav: false, col: tab === k ? (k === 'agree' ? P.lime : k === 'deny' ? P.pink : P.yellow) : P.light }); x += w + 4; });
    const items = QUICK.map((e, i) => [e, i]).filter(([e]) => e.c === tab), top = b.y + 42;
    if (tab === 'emote') items.forEach(([e, i], k) => UI.button(b.x + 8 + k * 40, top, 34, 28, '', () => Game.quick(i), { icon: (bx, by) => G.ctx.drawImage(G.emote(e.e), bx + 9, by + 6, 16, 16) }));
    else {
      const two = tab === 'say' || tab === 'who', rows = two ? Math.ceil(items.length / 2) : items.length, rh = Math.min(two ? 19 : 26, Math.floor((b.y + b.h - top - (C.myRole === 'hex' ? 22 : 4)) / rows)), cw = two ? (b.w - 20) / 2 : b.w - 16;
      items.forEach(([e, i], k) => {
        const col = two ? k % 2 : 0, row = two ? k >> 1 : k, label = e.t.replace('{N}', '___'), maxc = Math.floor((cw - 8) / 8);
        const wl = G.wrap(label, maxc), fit = wl.length === 1 || (wl.length === 2 && rh >= 23);
        UI.button(b.x + 8 + col * (cw + 4), top + row * rh, cw, rh - 3, '', () => {
          if (e.c === 'who') { C.qWho = i; C.whoFilter = ''; C.overlay = 'pickwho'; } else Game.quick(i);
        }, { col: tab === 'agree' ? '#e6ffd6' : tab === 'deny' ? '#ffe3ee' : P.white, icon: (bx, by) => { const ls = fit ? wl : [label.slice(0, maxc - 1) + '.']; const ty = by + Math.max(4, Math.floor((rh - 3 - ls.length * 9) / 2) + 1); ls.forEach((l, n) => G.text(l, bx + cw / 2, ty + n * 9, P.ink, { al: 'c' })); } });
      });
    }
    const live = C.phase === 'play' || C.phase === 'meeting';
    if (live && C.myRole === 'hex' && C.mine.alive) UI.button(b.x + 8, b.y + b.h - 20, b.w - 16, 16, C.qTeam ? 'SEND TO: HEX TEAM ONLY' : 'SEND TO: EVERYONE', () => { C.qTeam = !C.qTeam; }, { nav: false, col: C.qTeam ? P.pink : P.light });
    else if (live && !C.mine.alive) G.tiny('ONLY OTHER SPIRITS SEE THIS', b.x + b.w / 2, b.y + b.h - 10, P.dpurple, 'c');
    if (UI.hit('quick')) closeOverlay();
  }
  // pick a player for "It's ___!" - tap a name, or type to search (only real players can be chosen)
  function drawPickWho(t) {
    const e = QUICK[C.qWho]; if (!e) { C.overlay = null; return; }
    for (const k of UI.pressed) if (k.startsWith('key:') && k.length === 5 && /[a-z0-9 _.-]/i.test(k[4]) && (C.whoFilter || '').length < 12) C.whoFilter = (C.whoFilter || '') + k[4];
    if (UI.hit('bksp')) C.whoFilter = (C.whoFilter || '').slice(0, -1);
    const f = (C.whoFilter || '').toLowerCase(), list = C.roster.filter(p => !f || p.name.toLowerCase().includes(f));
    const cols = Math.max(1, Math.floor((Math.min(G.W - 8, 400) - 16) / 96)), rows = Math.max(1, Math.ceil(list.length / cols));
    const b = panel(cols * 96 + 16, Math.min(G.H - 4, rows * 20 + 62), e.t.replace('{N}', '___'));
    G.text('Name: ' + (C.whoFilter || '') + ((t * 2 | 0) % 2 ? '_' : ''), b.x + 10, b.y + 22, P.dblue);
    UI.button(b.x + b.w - 70, b.y + 18, 60, 14, 'TYPE', () => UI.ask('NAME:', C.whoFilter || '', 12, v => { if (v == null || !C) return; C.whoFilter = v; const m = C.roster.filter(p => p.name.toLowerCase().includes(v.toLowerCase())); if (m.length === 1) Game.quick(C.qWho, m[0].id); }), { nav: false });
    list.forEach((p, i) => UI.button(b.x + 8 + (i % cols) * 96, b.y + 38 + Math.floor(i / cols) * 20, 92, 18, '', () => Game.quick(C.qWho, p.id), { icon: (x, y) => { miniFace(p.look, x + 4, y + 6); G.text(p.name.slice(0, 9), x + 16, y + 5, p.dead ? P.mid : P.ink); } }));
    if (!list.length) G.text('No player with that name.', b.x + 10, b.y + 40, P.red);
    if (UI.hit('key:Enter') && list.length === 1) Game.quick(C.qWho, list[0].id);
  }
  function drawPlayers() {
    const cols = Math.max(1, Math.floor((Math.min(G.W - 8, 400) - 16) / 120)), list = C.roster, rows = Math.ceil(list.length / cols);
    const b = panel(cols * 120 + 16, Math.min(G.H, rows * 22 + 40), 'PLAYERS ' + list.length + '/20');
    list.forEach((e, i) => {
      const x = b.x + 8 + (i % cols) * 120, y = b.y + 24 + Math.floor(i / cols) * 22;
      UI.button(x, y, 116, 20, '', () => { C.card = e.id; C.overlay = 'card'; }, { icon: (bx, by) => { miniFace(e.look, bx + 4, by + 7); G.text(e.name, bx + 16, by + 6, e.id === C.id ? P.dblue : P.ink); if (e.host) G.tiny('HOST', bx + 100, by + 3, P.orange); else if (e.bot) G.tiny('AI', bx + 104, by + 3, P.blue); else if (e.ready) G.text('✔', bx + 104, by + 6, P.green); if (C.muted.has(e.id)) G.tiny('MUTE', bx + 98, by + 12, P.red); } });
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
    if (m.kind === 'maze' && C.snap && C.snap.mz) { for (const k of C.snap.mz.keys) if (!k[2]) G.rect(x0 + k[0] * f - 2, y0 + k[1] * f - 2, 5, 5, P.gold); G.rect(x0 + m.exit.x * f - 3, y0 + m.exit.y * f - 3, 7, 7, C.snap.mz.open ? P.lime : P.red); }
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
      else if (ph === 'play' && C.gmode === 'maze') style = C.snap && C.snap.mz && C.snap.mz.open ? 'showdown' : 'treachery';
      else if (ph === 'play') { jz = 'jazz_workshop'; if ((C.snap && C.snap.sab && C.snap.sab.k === 'melt') || (C.snap && C.snap.sd)) style = 'showdown'; }
    }
    if (mode === 'jazz') return jz; if (mode === 'treachery') return 'treachery'; if (mode === 'showdown') return 'showdown';
    return style === 'jazz' ? jz : style;
  };
  Game.practiceRole = t => Server.practiceRole(t);
  Game.pump = function () { const was = C && C.phase; processInbox(); if (C && was === 'lobby' && C.phase !== 'lobby') Game.screen = 'session'; if (!C && Game.screen !== 'menu' && Game.customizeFromLobby) Game.screen = 'menu'; };
})();
