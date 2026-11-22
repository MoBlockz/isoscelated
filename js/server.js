// ISOSCELATED - the HOST's authoritative game. Runs only in the host's browser (or locally for Practice).
// It decides roles, types, positions, transformations, marks, votes and timers, filters chat,
// and sends each player ONLY what they are allowed to know.
'use strict';
const Server = {};
(function () {
  const T = World.T;
  const DEF = {
    hexCount: 1, types: 'random', allowed: { classic: true, shift: true, plant: true }, hexCd: 30, plantCd: 30, markFade: 60, shiftDur: 20, shiftCd: 30,
    discuss: 45, vote: 60, bells: 1, matchTime: 10, speed: 1, tasks: 5, reveal: 'hex', chat: 'quick', squareff: 1, map: 'workshop', mode: 'hex'
  };
  Server.DEF = DEF;
  // Fair Fisher-Yates shuffle with crypto randomness: every player has exactly the same chance.
  function rnd(n) { if (window.crypto && crypto.getRandomValues) { const a = new Uint32Array(1), lim = Math.floor(0x100000000 / n) * n; let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim); return x % n; } return Math.floor(Math.random() * n); }
  function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  Server._shuffle = shuffle;
  Server.suggestHex = n => n <= 6 ? 1 : n <= 11 ? 2 : n <= 16 ? 3 : 4;
  Server.hexValid = (h, n) => h * 2 < n;
  const PIECE_AGE = 30; // seconds before a pawn becomes a different piece
  const HEX_RANGE = 26, REPORT_RANGE = 34, USE_RANGE = 26, MARK_RANGE = 22, ARM_TIME = 1.5;
  const VIS = { shape: 92, hex: 108, dark: 38 }; // vision radius in pixels
  let st = null, timer = null, link = null;
  Server.active = () => !!st;
  Server.state = () => st;

  // ---------- lifecycle ----------
  // opts: {practice, me:{name,look,token}, deliver(msg) -> local client, onReady(code), onError(msg), bots}
  Server.start = function (opts) {
    Server.stop();
    st = {
      practice: !!opts.practice, code: '-----', phase: 'lobby', settings: JSON.parse(JSON.stringify(DEF)), hexManual: false,
      players: new Map(), order: [], nextId: 1, banned: new Set(), bodies: [], marks: [], sab: { k: null }, sabCd: 0,
      meeting: null, matchT: 0, phaseT: 0, t: 0, tick: 0, rosterDirty: true, deliver: opts.deliver, over: null, map: World.buildLobby(), rattle: {}, quick: []
    };
    const me = addPlayer('h', opts.me.name, opts.me.look, opts.me.token, null); me.host = true;
    if (opts.practice) {
      st.code = 'SOLO'; st.settings.hexCd = 15; st.settings.plantCd = 15; st.settings.shiftCd = 15; st.settings.shiftDur = 12; st.settings.markFade = 30; st.settings.matchTime = 0;
      for (let i = 0; i < 7; i++) addBot();
      startGame(true); opts.onReady('SOLO');
    } else {
      const nb = opts.bots | 0; for (let i = 0; i < nb; i++) addBot();
      link = Net.host({
        onReady: code => { st && (st.code = code, st.rosterDirty = true); opts.onReady(code); },
        onConn: (conn, code) => handleConn(conn, code),
        onError: m => { Server.stop(); opts.onError(m); }
      });
    }
    let last = performance.now();
    // fixed sub-steps so game time stays correct even if the browser throttles a background host tab
    timer = setInterval(() => {
      const now = performance.now(); let dt = Math.min(3, (now - last) / 1000); last = now;
      while (dt > 0.0001 && st) { const s = Math.min(0.1, dt); dt -= s; tick(s, dt > 0.0001); }
    }, 33);
  };
  Server.stop = function () {
    if (timer) clearInterval(timer); timer = null;
    if (st) for (const p of st.players.values()) if (p.conn) { try { p.conn.close(); } catch (e) { } }
    if (link) link.close(); link = null; st = null;
  };
  Server.newCode = function () {
    if (!st || st.practice || st.phase !== 'lobby') return;
    if (!link) return; st.code = '.....'; st.rosterDirty = true;
    link.newCode(code => { if (st) { st.code = code; st.rosterDirty = true; notice('h', 'New code: ' + code); } });
  };

  function handleConn(conn, viaCode) {
    let pid = null;
    conn.on('data', msg => {
      if (!st) return;
      if (!pid) {
        if (!msg || msg.t !== 'hello') return;
        if (viaCode !== st.code) { conn.send({ t: 'err', m: 'No lobby with that code.' }); setTimeout(() => conn.close(), 300); return; }
        if (st.banned.has(msg.token)) { conn.send({ t: 'err', m: 'You were removed from this lobby.' }); setTimeout(() => conn.close(), 300); return; }
        if (st.phase !== 'lobby') { conn.send({ t: 'err', m: 'Game in progress, wait for the next round.' }); setTimeout(() => conn.close(), 300); return; }
        if (st.players.size >= 20) { conn.send({ t: 'err', m: 'Lobby full.' }); setTimeout(() => conn.close(), 300); return; }
        const nm = ChatFilter.checkName(String(msg.name || ''));
        if (!nm.ok) { conn.send({ t: 'err', m: 'Please pick a different name.', badName: true }); setTimeout(() => conn.close(), 300); return; }
        pid = 'p' + (st.nextId++);
        const p = addPlayer(pid, nm.name, sanitizeLook(msg.look), String(msg.token || ''), conn);
        conn.send({ t: 'welcome', id: pid, code: st.code });
        notice(null, p.name + ' joined.');
        return;
      }
      try { onMsg(pid, msg); } catch (e) { console.error(e); }
    });
    conn.on('close', () => { if (pid) dropPlayer(pid); });
    conn.on('error', () => { });
  }

  function sanitizeLook(l) {
    l = l || {}; const c = (v, n) => Math.max(0, Math.min(n - 1, v | 0));
    return { shape: c(l.shape, G.SHAPES.length), color: c(l.color, 18), pattern: c(l.pattern, 4), hair: c(l.hair, 10), hairColor: c(l.hairColor, 10), hat: c(l.hat, 9), eyes: c(l.eyes, G.EYES.length), extra: c(l.extra, G.EXTRAS.length), acc: c(l.acc, 18) };
  }
  function uniqueLook(p) { // no two players share exact colour AND shape
    const clash = () => { for (const q of st.players.values()) if (q !== p && q.look.shape === p.look.shape && q.look.color === p.look.color) return true; return false; };
    let n = 0; while (clash() && n++ < 18) p.look.color = (p.look.color + 1) % 18;
  }
  const BOT_NAMES = ['DUMMY', 'BLOCKY', 'ROLLO', 'POINTY', 'WOBBLE', 'TWIRL', 'BOING', 'CUBY', 'ZIGGY', 'PIP', 'NUBBS', 'TOOT', 'SQUISH', 'DOTTY', 'BEEP', 'KNOB', 'MOCHI', 'TINK', 'BOLT'];
  function addBot(ai) {
    const id = 'b' + (st.nextId++), used = new Set([...st.players.values()].map(q => q.name));
    const name = BOT_NAMES.find(n => !used.has(n)) || ('AI ' + st.nextId);
    const p = addPlayer(id, name, G.randomLook(), 'bot' + id, null); p.bot = true; p.ai = ai !== false && !st.practice; p.ready = true; return p;
  }
  function addPlayer(id, name, look, token, conn) {
    const sp = st.map.seats[st.players.size % st.map.seats.length];
    const p = {
      id, name, look, token, conn, bot: false, host: false, ready: false, x: sp[0], y: sp[1], dir: 0, mv: 0, tpSeq: 1, alive: true, left: false, role: 'shape', type: null,
      hexCd: 0, plantCd: 0, shiftCd: 0, shiftT: 0, shiftAs: null, bells: 0, tasks: [], rattled: false, vote: null, camOn: false, hold: -1, stats: z(),
      strikes: 0, muteUntil: 0, muteMatch: false, chatLog: [], lastChat: 0, lastText: '', repeatN: 0, knownDead: false, lastMove: performance.now(), bubble: null
    };
    st.players.set(id, p); st.order.push(id); uniqueLook(p);
    if (!st.hexManual) st.settings.hexCount = Server.suggestHex(st.players.size);
    st.rosterDirty = true; return p;
  }
  function z() { return { hexes: 0, framed: 0, shifts: 0, tasks: 0, votes: 0 }; }
  function dropPlayer(id) {
    const p = st && st.players.get(id); if (!p) return;
    if (st.phase === 'lobby' || st.phase === 'over') { st.players.delete(id); st.order = st.order.filter(x => x !== id); if (!st.hexManual) st.settings.hexCount = Server.suggestHex(st.players.size); }
    else {
      p.left = true; p.conn = null;
      if (p.alive) { transform(p, null, null, false); }
      p.tasks.forEach(t => t.done = true); p.knownDead = true;
      checkWin();
    }
    notice(null, p.name + ' left.'); st.rosterDirty = true;
  }
  Server.kick = function (id) {
    const p = st && st.players.get(id); if (!p || p.host) return;
    st.banned.add(p.token);
    if (p.conn) { try { p.conn.send({ t: 'err', m: 'The host removed you from the lobby.' }); } catch (e) { } setTimeout(() => { try { p.conn && p.conn.close(); } catch (e) { } }, 300); }
    dropPlayer(id); notice('h', p.name + ' was kicked.');
  };
  Server.addBot = () => { if (st && st.phase === 'lobby' && st.players.size < 20) { const p = addBot(true); notice(null, p.name + ' (AI) joined.'); } };
  Server.removeBot = () => { if (!st || st.phase !== 'lobby') return; const b = [...st.players.values()].filter(p => p.bot).pop(); if (!b) return; st.players.delete(b.id); st.order = st.order.filter(x => x !== b.id); if (!st.hexManual) st.settings.hexCount = Server.suggestHex(st.players.size); st.rosterDirty = true; notice(null, b.name + ' (AI) left.'); };
  Server.setSetting = function (k, v) {
    if (!st || st.phase !== 'lobby') return; if (k === 'hexCount') st.hexManual = true;
    if (k === 'allowed') st.settings.allowed = Object.assign({}, st.settings.allowed, v); else st.settings[k] = v; st.rosterDirty = true;
  };

  // ---------- sending ----------
  function send(id, msg) {
    const p = st.players.get(id); if (!p || p.left) return;
    if (id === 'h') { st.deliver(msg); return; }
    if (p.conn && p.conn.open) { try { p.conn.send(msg); } catch (e) { } }
  }
  function sendAll(msg, filt) { for (const p of st.players.values()) if (!filt || filt(p)) send(p.id, msg); }
  function notice(id, text) { if (id) send(id, { t: 'e', k: 'notice', text }); else sendAll({ t: 'e', k: 'notice', text }); }
  function hostNotice(text) { send('h', { t: 'e', k: 'notice', text, host: 1 }); }

  // ---------- helpers ----------
  const alive = () => [...st.players.values()].filter(p => p.alive && !p.left);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function visionOf(p) {
    if (!p.alive) return 9999; if (st.phase !== 'play') return 9999;
    if (st.mode === 'maze') return p.role === 'mino' ? MAZE.vis.mino : MAZE.vis.runner;
    if (p.role === 'hex') return VIS.hex + (p.type === 'classic' ? 14 : 0);
    if (p.sq) return VIS.shape; // the Squareff isn't affected by Lights Out
    return st.sab.k === 'lights' ? VIS.dark : VIS.shape;
  }
  function canSee(viewer, x, y, extra) {
    if (!viewer.alive) return true;
    return Math.hypot(viewer.x - x, viewer.y - y) <= visionOf(viewer) + (extra || 30);
  }
  function teleport(p, x, y) { p.x = x; p.y = y; p.tpSeq++; }
  function hexCdFor(p) { return Math.max(5, st.settings.hexCd - (p.type === 'classic' ? 5 : 0)); }
  function stationNear(p, kind, filt) { let best = null, bd = 1e9; for (const s of st.map.stations) if (s.kind === kind && (!filt || filt(s))) { const d = Math.hypot(p.x - s.x, p.y - s.y); if (d < bd) { bd = d; best = s; } } return [best, bd]; }

  // ---------- game start ----------
  Server.start_game = function () { if (st && st.phase === 'lobby') return startGame(false); };
  function startGame(practice) {
    const ps = [...st.players.values()].filter(p => !p.left);
    const n = ps.length, S = st.settings;
    if (!practice && S.mode === 'maze') return startMaze(ps);
    st.mode = 'hex';
    if (!practice) { if (n < 4) return 'Need at least 4 players.'; if (!Server.hexValid(S.hexCount, n)) return 'Too many Hexagoners for this many players.'; }
    st.mapId = st.settings.map === 'random' ? World.MAP_IDS[rnd(World.MAP_IDS.length)] : st.settings.map; st.map = World.buildMap(st.mapId);
    st.bodies = []; st.marks = []; st.sab = { k: null }; st.sabCd = 15; st.meeting = null; st.over = null; st.rattle = {}; st.matchT = S.matchTime * 60; st.bellCd = 15;
    // roles: completely random each round
    const sh = shuffle(ps);
    const hexIds = new Set(practice ? [] : sh.slice(0, S.hexCount).map(p => p.id));
    let pool = ['classic', 'shift', 'plant'];
    if (S.types === 'classic') pool = ['classic']; else if (S.types === 'custom') { pool = pool.filter(k => S.allowed[k]); if (!pool.length) pool = ['classic']; }
    const bag = shuffle(pool); // random, but different types first
    const shapesOnly = sh.filter(p => !hexIds.has(p.id)), sqId = !practice && S.squareff && shapesOnly.length >= 2 ? shapesOnly[rnd(shapesOnly.length)].id : null;
    ps.forEach((p, i) => {
      p.sq = p.id === sqId;
      p.alive = true; p.left = false; p.knownDead = false; p.role = hexIds.has(p.id) ? 'hex' : 'shape';
      p.type = p.role === 'hex' ? (bag.length ? bag.pop() : pool[rnd(pool.length)]) : null;
      p.hexCd = 15; p.plantCd = 15; p.shiftCd = 15; p.shiftT = 0; p.shiftAs = null; p.bells = S.bells; p.rattled = false; p.vote = null; p.camOn = false; p.hold = -1;
      p.suspect = null; p.sawAt = 0; p.goal = null; p.aiBtn = null; p.aiSaid = 0;
      p.stats = z(); p.muteMatch = p.strikes >= 6 ? p.muteMatch : false; p.ready = false;
      const keys = shuffle(World.TASK_KEYS).slice(0, Math.min(S.tasks, World.TASK_KEYS.length));
      p.tasks = keys.map(k => ({ k, done: false }));
      const seat = st.map.seats[i % 20]; teleport(p, seat[0], seat[1]);
    });
    if (practice) { const me = st.players.get('h'); st.phase = 'play'; st.phaseT = 0; }
    else { st.phase = 'reveal'; st.phaseT = 5.5; }
    st.rosterDirty = true;
    for (const p of ps) {
      const mates = p.role === 'hex' ? ps.filter(q => q.role === 'hex' && q !== p).map(q => ({ id: q.id, type: q.type })) : [];
      send(p.id, { t: 'e', k: 'reveal', role: p.role, type: p.type, sq: p.sq ? 1 : 0, mates, practice: !!practice });
    }
    return null;
  }
  // ===================== MINOTAUR MAZE =====================
  const MAZE = { head: 10, time: 240, catchR: 13, keyR: 16, exitR: 20, vis: { runner: 110, mino: 135 } };
  function startMaze(ps) {
    if (ps.length < 2) return 'You need at least 2 players for the Minotaur Maze.';
    st.mode = 'maze'; const seed = 1 + rnd(2000000000); st.mapId = 'maze:' + seed; st.map = World.buildMaze(seed);
    st.bodies = []; st.marks = []; st.sab = { k: null }; st.meeting = null; st.over = null; st.rattle = {};
    const order = shuffle(ps), mino = order[0];
    st.maze = { mino: mino.id, head: MAZE.head, time: MAZE.time, keys: st.map.keys.map(k => ({ x: k.x, y: k.y, got: null })), open: false };
    ps.forEach((p, i) => {
      p.alive = true; p.left = false; p.knownDead = false; p.role = p === mino ? 'mino' : 'runner'; p.type = null; p.sq = false; p.escaped = false; p.caught = false; p.shiftAs = null;
      p.tasks = []; p.stats = z(); p.stats.keys = 0; p.stats.caught = 0; p.vote = null; p.hold = -1; p.camOn = false; p.goal = null; p.ready = false;
      const s = p === mino ? st.map.minoStart : st.map.seats[i % 20]; teleport(p, s[0], s[1]);
    });
    st.phase = 'reveal'; st.phaseT = 5.5; st.rosterDirty = true;
    for (const p of ps) send(p.id, { t: 'e', k: 'reveal', mode: 'maze', role: p.role, mates: [] });
    return null;
  }
  function mazeTick(dt) {
    const Z = st.maze, mino = st.players.get(Z.mino);
    if (!mino || mino.left) { gameOver('runners', 'The Minotaur left the maze!'); return; }
    Z.head = Math.max(0, Z.head - dt); Z.time -= dt;
    const runners = [...st.players.values()].filter(p => p.role === 'runner' && !p.left);
    for (const p of runners) {
      if (!p.alive) continue;
      if (Z.head <= 0 && Math.hypot(p.x - mino.x, p.y - mino.y) < MAZE.catchR) { p.alive = false; p.caught = true; mino.stats.caught++; sendAll({ t: 'e', k: 'caught', id: p.id, x: p.x, y: p.y }); continue; }
      for (const k of Z.keys) if (!k.got && Math.hypot(p.x - k.x, p.y - k.y) < MAZE.keyR) { k.got = p.id; p.stats.keys++; sendAll({ t: 'e', k: 'key', id: p.id, n: Z.keys.filter(q => q.got).length }); }
      if (!Z.open && Z.keys.every(k => k.got)) { Z.open = true; st.map.gateOpen = true; sendAll({ t: 'e', k: 'gate' }); }
      if (Z.open && Math.hypot(p.x - st.map.exit.x, p.y - st.map.exit.y) < MAZE.exitR) { p.alive = false; p.escaped = true; sendAll({ t: 'e', k: 'escaped', id: p.id }); }
    }
    const active = runners.filter(p => p.alive), esc = runners.filter(p => p.escaped).length;
    if (!active.length || Z.time <= 0) {
      if (esc > 0) gameOver('runners', esc + ' of ' + runners.length + ' shape' + (runners.length === 1 ? '' : 's') + ' escaped the maze!');
      else gameOver('mino', Z.time <= 0 ? 'Time ran out! Nobody escaped the maze.' : 'The Minotaur caught everyone!');
    }
  }
  // maze AI: runners grab keys, flee when the Minotaur is close, then run for the exit. The Minotaur hunts.
  function mazeAi(p, dt) {
    if (st.phase !== 'play' || !p.alive) { p.mv = 0; return; }
    const Z = st.maze, mino = st.players.get(Z.mino);
    if (p.role === 'mino') {
      if (Z.head > 0) { p.mv = 0; return; }
      const prey = [...st.players.values()].filter(q => q.role === 'runner' && q.alive).sort((a, b) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(p.x - b.x, p.y - b.y))[0];
      if (prey) goTo(p, prey.x, prey.y, dt * 1.04); return;
    }
    const dm = mino ? Math.hypot(p.x - mino.x, p.y - mino.y) : 999;
    if (mino && dm < 130 && Z.head <= 0) { // run away: step to the neighbouring tile farthest from the Minotaur
      const m = st.map, tx = Math.floor(p.x / T), ty = Math.floor((p.y - 2) / T); let best = null, bd = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (ty + dy) * m.w + tx + dx; if (!m.tiles[k]) continue; const d = Math.hypot((tx + dx) * T + 8 - mino.x, (ty + dy) * T + 10 - mino.y); if (d > bd) { bd = d; best = [(tx + dx) * T + 8, (ty + dy) * T + 10]; } }
      if (best) { goTo(p, best[0], best[1], dt); return; }
    }
    if (Z.open) { goTo(p, st.map.exit.x, st.map.exit.y, dt); return; }
    // each AI runner hunts a DIFFERENT key (so they don't travel in one easy-to-catch pack)
    const open = Z.keys.filter(k => !k.got), runners = [...st.players.values()].filter(q => q.role === 'runner' && q.alive), idx = runners.indexOf(p);
    const key = open.length ? open[(idx < 0 ? 0 : idx) % open.length] : null;
    if (key) goTo(p, key.x, key.y, dt); else p.mv = 0;
  }

  Server.practiceRole = function (type) { // practice: become a Shape, the Squareff or a Hexagoner type
    if (!st || !st.practice) return; const p = st.players.get('h'); p.sq = type === 'squareff'; if (p.sq) type = null;
    if (!p.alive) { p.alive = true; st.bodies = st.bodies.filter(b => b.id !== 'h'); }
    p.role = type ? 'hex' : 'shape'; p.type = type || null; p.hexCd = 0; p.plantCd = 0; p.shiftCd = 0; p.shiftT = 0; p.shiftAs = null; st.marks = [];
    send('h', { t: 'e', k: 'reveal', role: p.role, type: p.type, sq: p.sq ? 1 : 0, mates: [], practice: true, quiet: true });
  };
  Server.practiceReset = function () { // revive dummies
    if (!st || !st.practice) return; st.bodies = []; st.marks = []; st.sab = { k: null }; st.sabCd = 0;
    for (const p of st.players.values()) { p.alive = true; p.shiftAs = null; p.shiftT = 0; }
  };

  // ---------- messages from clients ----------
  function onMsg(id, msg) {
    const p = st.players.get(id); if (!p || !msg) return;
    switch (msg.t) {
      case 'm': { // movement (client-predicted, validated here)
        if (msg.s !== p.tpSeq) return; // stale after teleport
        if (st.mode === 'maze' && p.role === 'mino' && st.maze && st.maze.head > 0 && st.phase === 'play') { p.tpSeq++; return; } // the Minotaur waits for the head start
        if (st.phase === 'meeting' || st.phase === 'reveal') return;
        const x = +msg.x, y = +msg.y; if (!isFinite(x) || !isFinite(y)) return;
        const now = performance.now(), dt = Math.min(1, (now - p.lastMove) / 1000); p.lastMove = now;
        const maxd = 95 * st.settings.speed * (p.alive ? 1 : 1.3) * (p.role === 'mino' ? 1.08 : 1) * Math.max(dt, 0.07) + 12;
        const ghost = !p.alive;
        if (Math.hypot(x - p.x, y - p.y) > maxd || (!ghost && World.hit(st.map, x, y, st.sab.k === 'jam' ? st.sab.room : null) && !World.hit(st.map, p.x, p.y))) { p.tpSeq++; return; }
        p.x = x; p.y = y; p.dir = msg.d & 3; p.mv = msg.v ? 1 : 0;
        if (p.hold >= 0) { const [s, d] = stationNear(p, 'melt', s => s.btn === p.hold); if (d > USE_RANGE + 8) p.hold = -1; }
        break;
      }
      case 'a': action(p, msg); break;
      case 'c': chat(p, msg.ch, String(msg.text || '')); break;
      case 'q': quick(p, msg.q | 0, msg.who, !!msg.team); break;
      case 'look': {
        if (st.phase !== 'lobby') return; p.look = sanitizeLook(msg.look); uniqueLook(p);
        if (msg.name != null) { const nm = ChatFilter.checkName(String(msg.name)); if (nm.ok) p.name = nm.name; else send(id, { t: 'e', k: 'oops', text: 'That name is not allowed. Please pick another name.' }); }
        st.rosterDirty = true; break;
      }
      case 'rp': { const q = st.players.get(msg.id); if (q) send('h', { t: 'e', k: 'reportlog', name: q.name, id: q.id, by: p.name, msgs: q.chatLog.slice(-5) }); if (id !== 'h') notice(id, 'Thanks! The host will take a look.'); break; }
    }
  }
  Server.localMsg = msg => { if (st) try { onMsg('h', msg); } catch (e) { console.error(e); } };

  function action(p, m) {
    const S = st.settings, a = m.a;
    if (a === 'ready' && st.phase === 'lobby') { p.ready = !!m.v; st.rosterDirty = true; return; }
    if (a === 'lobby' && p.host && st.phase === 'over') { backToLobby(); return; }
    if (st.phase === 'meeting') { if (a === 'vote') vote(p, m.target); return; }
    if (st.phase !== 'play') return;
    if (a === 'task') { // task finished (validate station distance)
      const t = p.tasks[m.i | 0]; if (!t || t.done) return;
      const [s, d] = stationNear(p, 'task', s => s.task === t.k); if (!s || d > USE_RANGE + 20) return;
      t.done = true; if (p.role === 'shape') p.stats.tasks++; send(p.id, { t: 'e', k: 'taskok' }); checkWin(); return;
    }
    if (a === 'rattle') {
      if (p.alive || p.rattled) return; const pr = st.map.props[m.prop | 0]; if (!pr) return;
      if (Math.hypot(pr.x * T + pr.w * 8 - p.x, pr.y * T + pr.h * 8 - p.y) > 64) return;
      p.rattled = true; st.rattle[pr.id] = 3; sendAll({ t: 'e', k: 'rattle', prop: pr.id, x: pr.x * T + pr.w * 8, y: pr.y * T + pr.h * 8 }); return;
    }
    if (!p.alive) return;
    if (a === 'cams') { const [s, d] = stationNear(p, 'cams'); p.camOn = !!m.on && d < USE_RANGE + 10; return; }
    if (a === 'switch') {
      if (st.sab.k !== 'lights') return; const [s, d] = stationNear(p, 'switch', s => s.sw === (m.sw | 0)); if (!s || d > USE_RANGE + 10) return;
      st.sab.sw[s.sw] = true; sendAll({ t: 'e', k: 'snd', s: 'click' }, q => Math.hypot(q.x - s.x, q.y - s.y) < 150);
      if (st.sab.sw[0] && st.sab.sw[1]) endSab('Lights are back on!'); return;
    }
    if (a === 'hold') { if (st.sab.k !== 'melt') return; if (!m.on) { p.hold = -1; return; } const [s, d] = stationNear(p, 'melt', s => s.btn === (m.btn | 0)); if (s && d < USE_RANGE + 10) p.hold = s.btn; return; }
    if (a === 'report') {
      let best = null, bd = REPORT_RANGE; for (const b of st.bodies) { if (!b.rep) continue; const d = dist(p, b); if (d < bd) { bd = d; best = b; } }
      if (best) startMeeting(p, 'report', best); return;
    }
    if (a === 'bell') {
      if (p.bells <= 0 || st.bellCd > 0) return; if (p.role === 'hex' && st.sab.k === 'melt') return;
      const [s, d] = stationNear(p, 'bell'); if (!s || d > 44) return; p.bells--; startMeeting(p, 'bell', null); return;
    }
    // ---- Hexagoner powers ----
    if (p.role !== 'hex') return;
    if (a === 'hex') {
      if (p.hexCd > 0) return; let best = null, bd = HEX_RANGE;
      for (const q of st.players.values()) { if (!q.alive || q.left || q.role === 'hex' || q === p) continue; const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
      if (!best) return; p.hexCd = hexCdFor(p); p.stats.hexes++; transform(best, p, p.id, true); return;
    }
    if (a === 'shift' && p.type === 'shift') {
      if (m.target === null || m.target === undefined) return;
      if (p.shiftT > 0 || p.shiftCd > 0) return; const q = st.players.get(m.target); if (!q || !q.alive || q.left || q === p) return;
      p.shiftAs = q.id; p.shiftT = S.shiftDur; p.stats.shifts++; puff(p); return;
    }
    if (a === 'plant' && p.type === 'plant') {
      if (p.plantCd > 0 || st.marks.some(k => k.by === p.id)) return; let best = null, bd = HEX_RANGE + 4;
      for (const q of st.players.values()) { if (!q.alive || q.left || q.role === 'hex') continue; const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
      if (!best) return; st.marks.push({ by: p.id, target: best.id, t: 0 }); send(p.id, { t: 'e', k: 'plant', x: best.x, y: best.y }); return;
    }
    if (a === 'sab') {
      if (st.sab.k || st.sabCd > 0) return;
      if (m.k === 'lights') { st.sab = { k: 'lights', sw: [false, false] }; sendAll({ t: 'e', k: 'sab', s: 'lights' }); }
      else if (m.k === 'melt') { st.sab = { k: 'melt', t: 45 }; sendAll({ t: 'e', k: 'sab', s: 'melt' }); }
      else if (m.k === 'jam') { const r = m.room | 0; if (!st.map.rooms[r]) return; st.sab = { k: 'jam', room: r, t: 10 }; sendAll({ t: 'e', k: 'sab', s: 'jam', room: st.map.rooms[r].name }); }
      return;
    }
    if (a === 'chute') {
      const ch = st.map.chutes; let from = null; for (const c of ch) if (Math.hypot(p.x - c.x, p.y - c.y) < USE_RANGE + 6) from = c;
      const to = ch[m.to | 0]; if (!from || !to || to === from) return;
      wobble(from); teleport(p, to.x, to.y); wobble(to); return;
    }
  }
  function wobble(c) { sendAll({ t: 'e', k: 'wobble', i: c.i }, q => canSee(q, c.x, c.y)); }
  function puff(p) { sendAll({ t: 'e', k: 'puff', x: p.x, y: p.y }, q => canSee(q, p.x, p.y)); }
  function endSab(msg) { st.sab = { k: null }; st.sabCd = 40; for (const p of st.players.values()) p.hold = -1; sendAll({ t: 'e', k: 'sabfix', text: msg }); }

  // turn a player into an object
  function transform(v, from, byId, reportable) {
    if (!v.alive) return; v.alive = false;
    if (v.shiftAs) { v.shiftAs = null; v.shiftT = 0; }
    v.hold = -1; v.camOn = false;
    const obj = 0; // everyone starts as a PAWN, then later becomes another chess piece
    st.bodies.push({ id: v.id, obj, later: 1 + Math.floor(Math.random() * 5), age: 0, x: Math.round(v.x), y: Math.round(v.y), rep: !!reportable });
    // marks on the victim fade, marks by the victim vanish
    st.marks = st.marks.filter(k => { if (k.target === v.id) { const pl = st.players.get(k.by); if (pl) pl.plantCd = st.settings.plantCd; return false; } return k.by !== v.id; });
    if (from) for (const q of st.players.values()) if (q.ai && q.alive && q !== v && q.role === 'shape' && canSee(q, from.x, from.y, 0)) { q.suspect = from.shiftAs || from.id; q.sawAt = st.t; }
    if (from) sendAll({ t: 'e', k: 'zap', x: from.x, y: from.y, x2: v.x, y2: v.y, id: v.id, obj }, q => q === v || canSee(q, v.x, v.y) || canSee(q, from.x, from.y));
    else sendAll({ t: 'e', k: 'poof', x: v.x, y: v.y, id: v.id, obj }, q => canSee(q, v.x, v.y));
    if (reportable) send(v.id, { t: 'e', k: 'hexed', obj, by: byId === v.id ? null : 1 });
    st.rosterDirty = true; checkWin();
  }

  // ---------- meetings ----------
  function startMeeting(caller, reason, body) {
    const owner = body ? st.players.get(body.id) : null;
    st.phase = 'meeting'; st.meeting = { stage: 'intro', t: 3, caller: caller.id, reason, body: owner ? owner.id : null, bodyObj: body ? body.obj : null, result: null };
    st.marks = []; st.sab = { k: null }; st.bodies = []; st.accuse = {};
    for (const q of st.players.values()) { q.aiSaid = 0; q.aiVoteAt = null; q.goal = null; q.aiTaskT = 0; }
    let i = 0;
    for (const p of st.players.values()) {
      if (p.shiftAs) { p.shiftAs = null; p.shiftT = 0; } p.vote = null; p.camOn = false; p.hold = -1;
      if (!p.alive) p.knownDead = true;
      if (p.alive && !p.left) { const s = st.map.seats[(i++ * 7) % 20]; teleport(p, s[0], s[1]); }
    }
    st.rosterDirty = true;
    sendAll({ t: 'e', k: 'meeting', reason, by: caller.id, body: owner ? owner.id : null, obj: body ? body.obj : null });
  }
  function vote(p, target) {
    const M = st.meeting; if (!M || M.stage !== 'vote' || !p.alive || p.left || p.vote !== null) return;
    if (target !== 'skip') { const q = st.players.get(target); if (!q || !q.alive || q.left) return; }
    p.vote = target; st.rosterDirty = true; sendAll({ t: 'e', k: 'snd', s: 'vote' });
    if (alive().every(q => q.vote !== null)) M.t = Math.min(M.t, 1);
  }
  function tallyVotes() {
    const M = st.meeting, counts = {}; let skips = 0;
    for (const p of alive()) { if (p.vote === null || p.vote === 'skip') { if (p.vote === 'skip') skips++; continue; } counts[p.vote] = (counts[p.vote] || 0) + 1; }
    let top = null, tc = 0, tie = false; for (const k in counts) { if (counts[k] > tc) { tc = counts[k]; top = k; tie = false; } else if (counts[k] === tc) tie = true; }
    for (const p of alive()) { if (p.vote && p.vote !== 'skip') { const q = st.players.get(p.vote); if (q && q.role === 'hex') p.stats.votes++; } }
    let ej = null; if (top && !tie && tc > skips) ej = st.players.get(top);
    let text;
    if (!ej) text = tie ? 'It was a tie. Nobody was ejected.' : 'Nobody was ejected.';
    else {
      text = ej.name + ' was ejected out of the blimp cannon!';
      const R = st.settings.reveal;
      if (R === 'hex') text += ej.role === 'hex' ? ' ' + ej.name + ' was a Hexagoner.' : ' ' + ej.name + ' was not a Hexagoner.';
      else if (R === 'full') text += ej.role === 'hex' ? ' ' + ej.name + ' was a Hexagoner: ' + typeName(ej.type) + '.' : ' ' + ej.name + ' was a Shape' + (ej.sq ? ': the SQUAREFF!' : '.');
      if (R !== 'off') { const h = alive().filter(q => q.role === 'hex' && q !== ej).length; text += ' ' + h + ' Hexagoner' + (h === 1 ? '' : 's') + ' remain' + (h === 1 ? 's.' : '.'); }
    }
    const tally = {}; for (const p of alive()) tally[p.id] = p.vote; // revealed after time is up
    M.result = { id: ej ? ej.id : null, text, counts, skips }; M.stage = 'result'; M.t = 8;
    // what they turn into while flying: a HEXAGON if they were a Hexagoner, otherwise a chess piece.
    // (Only shown when the host's 'Reveal role on eject' setting is on, so it never leaks a secret.)
    const as = ej && st.settings.reveal !== 'off' && ej.role === 'hex' ? 'hex' : null; // Hexagoners become a hexagon; Shapes stay as themselves
    sendAll({ t: 'e', k: 'eject', id: ej ? ej.id : null, text, counts, skips, as, piece: 0 }); // an ejected Shape becomes a PAWN
    if (ej) { ej.alive = false; ej.knownDead = true; ej.ejected = true; }
  }
  function endMeeting() {
    st.phase = 'play'; st.meeting = null; const S = st.settings;
    for (const p of st.players.values()) { p.hexCd = hexCdFor(p); p.plantCd = S.plantCd; p.shiftCd = S.shiftCd; p.vote = null; }
    st.sabCd = 40; st.bellCd = 10; st.rosterDirty = true;
    sendAll({ t: 'e', k: 'resume' });
    checkWin();
  }
  function typeName(t) { return { classic: 'CLASSIC', shift: 'SHAPESHIFTER', plant: 'PLANTER' }[t] || ''; }

  // ---------- win ----------
  function taskBar() { let tot = 0, done = 0; for (const p of st.players.values()) if (p.role === 'shape') for (const t of p.tasks) { tot++; if (t.done) done++; } return tot ? done / tot : 0; }
  function checkWin() {
    if (!st || st.practice || st.phase === 'over' || st.phase === 'lobby') return;
    const al = alive(), h = al.filter(p => p.role === 'hex').length, s = al.length - h;
    if (taskBar() >= 1) return gameOver('shapes', st.map.winText || 'The blimp launched! All chores done!');
    if (h === 0) return gameOver('shapes', 'All the Hexagoners were voted out!');
    if (h >= s && st.phase !== 'meeting') return gameOver('hex', 'The Hexagoners took over the workshop!');
    if (h >= s && st.phase === 'meeting' && st.meeting.stage === 'result') return gameOver('hex', 'The Hexagoners took over the workshop!');
  }
  function gameOver(winner, reason) {
    st.phase = 'over'; st.phaseT = 60; st.meeting = null;
    const players = [...st.players.values()].map(p => ({ id: p.id, name: p.name, look: p.look, role: p.role, type: p.type, sq: p.sq ? 1 : 0, escaped: p.escaped ? 1 : 0, caught: p.caught ? 1 : 0, alive: p.alive, left: p.left, stats: p.stats }));
    st.over = { winner, reason, players }; st.rosterDirty = true;
    sendAll({ t: 'e', k: 'over', winner, reason, players, mode: st.mode });
  }
  function backToLobby() {
    st.phase = 'lobby'; st.mode = 'hex'; st.maze = null; st.map = World.buildLobby(); st.bodies = []; st.marks = []; st.sab = { k: null }; st.meeting = null; st.over = null;
    let i = 0; for (const id of [...st.players.keys()]) { const p = st.players.get(id); if (p.left) { st.players.delete(id); continue; } p.alive = true; p.role = 'shape'; p.type = null; p.shiftAs = null; p.ready = p.bot; p.muteMatch = false; p.tasks = []; const s = st.map.seats[i++ % 20]; teleport(p, s[0], s[1]); }
    st.order = st.order.filter(id => st.players.has(id)); if (!st.hexManual) st.settings.hexCount = Server.suggestHex(st.players.size);
    st.rosterDirty = true; sendAll({ t: 'e', k: 'lobby' });
  }
  Server.backToLobby = () => { if (st && st.phase === 'over') backToLobby(); };

  // ---------- chat (the HOST filters, so nobody can bypass it) ----------
  const ALLOWED_CH = (p, ch) => {
    if (ch === 'all') return st.phase === 'lobby' || st.phase === 'over' || (st.phase === 'meeting' && p.alive);
    if (ch === 'hex') return p.role === 'hex' && p.alive && (st.phase === 'play' || st.phase === 'meeting');
    if (ch === 'spirit') return !p.alive && (st.phase === 'play' || st.phase === 'meeting');
    return false;
  };
  function recipients(p, ch) {
    if (ch === 'all') return q => (st.phase === 'meeting' ? true : true);
    if (ch === 'hex') return q => q.role === 'hex' && q.alive; // fellow hexagoners only
    if (ch === 'spirit') return q => !q.alive; // spirits only
    return () => false;
  }
  function chat(p, ch, text) {
    const now = performance.now();
    send(p.id, { t: 'e', k: 'notice', text: 'Typing is turned off. Use Quick Chat!' }); return; // typed chat removed: Quick Chat only
    if (!ALLOWED_CH(p, ch)) return;
    if (p.muteMatch) { send(p.id, { t: 'e', k: 'notice', text: 'You are muted for the rest of this match. You can still use Quick Chat.' }); return; }
    if (now < p.muteUntil) { send(p.id, { t: 'e', k: 'notice', text: "You're muted for " + Math.ceil((p.muteUntil - now) / 1000) + 's.' }); return; }
    if (now - p.lastChat < 1000) { send(p.id, { t: 'e', k: 'notice', text: 'Slow down! One message per second.' }); return; }
    const f = ChatFilter.check(text.slice(0, 200));
    if (!f.ok) {
      if (f.reason === 'empty') return;
      p.strikes++;
      send(p.id, { t: 'e', k: 'oops' });
      if (p.strikes >= 6) { p.muteMatch = true; send(p.id, { t: 'e', k: 'notice', text: "You've been muted for the rest of the match." }); hostNotice(p.name + ' was auto-muted.'); }
      else if (p.strikes % 3 === 0) { p.muteUntil = now + 60000; send(p.id, { t: 'e', k: 'notice', text: "You've been muted for 60s." }); hostNotice(p.name + ' was auto-muted.'); }
      return;
    }
    const clean = f.text;
    if (clean.toLowerCase() === p.lastText) { p.repeatN++; if (p.repeatN >= 2) { send(p.id, { t: 'e', k: 'notice', text: 'Try saying something new!' }); return; } } else { p.repeatN = 0; p.lastText = clean.toLowerCase(); }
    p.lastChat = now; p.chatLog.push(clean); if (p.chatLog.length > 5) p.chatLog.shift();
    const msg = { t: 'e', k: 'chat', ch, from: p.id, text: clean };
    sendAll(msg, recipients(p, ch));
  }
  function quick(p, q, who, team) {
    const now = performance.now(), e = World.QUICK[q]; if (!e || now - p.lastChat < 900) return;
    if (st.settings.chat === 'off') { send(p.id, { t: 'e', k: 'notice', text: 'Chat is turned off in this lobby.' }); return; }
    if (p.muteMatch || now < p.muteUntil) { send(p.id, { t: 'e', k: 'notice', text: 'You are muted right now.' }); return; }
    let whoId = null;
    if (e.t && e.t.includes('{N}')) { const w = st.players.get(String(who)); if (!w) return; whoId = w.id; }
    p.lastChat = now; p.chatLog.push(e.e ? '(' + e.e + ')' : World.quickText(q, whoId && st.players.get(whoId).name)); if (p.chatLog.length > 5) p.chatLog.shift();
    const live = st.phase === 'play' || st.phase === 'meeting';
    const msg = { t: 'e', k: 'quick', from: p.id, q, who: whoId, ch: 'all' };
    if (st.phase === 'meeting' && whoId && /It's|sus|Vote/.test(e.t)) { st.accuse = st.accuse || {}; st.accuse[whoId] = (st.accuse[whoId] || 0) + 1; }
    if (st.phase === 'meeting' && whoId && /trust/.test(e.t)) { st.accuse = st.accuse || {}; st.accuse[whoId] = (st.accuse[whoId] || 0) - 1; }
    if (live && team && p.role === 'hex' && p.alive) { msg.ch = 'hex'; sendAll(msg, x => x.role === 'hex' && x.alive); return; } // Hexagoner team only
    if (live && !p.alive) { msg.ch = 'spirit'; sendAll(msg, x => !x.alive || (x.sq && x.alive)); return; } // Spirits (+ the Squareff can listen)
    if (st.phase !== 'play') { sendAll(msg); return; }
    sendAll(msg, x => !x.alive || x === p || canSee(x, p.x, p.y)); // in play: only people who can see you
  }

  // ---------- bots (practice dummies / debug ?bots=N) ----------
  const flowCache = {};
  function flowTo(tx, ty) {
    const m = st.map, key = (m.kind === 'lobby' ? 'lobby' : (st.mapId || m.kind)) + tx + ',' + ty; if (flowCache[key]) return flowCache[key];
    const dist = new Int16Array(m.w * m.h).fill(-1), q = [ty * m.w + tx]; dist[q[0]] = 0;
    while (q.length) { const k = q.shift(), x = k % m.w, y = (k / m.w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, nk = ny * m.w + nx; if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || dist[nk] >= 0 || !m.tiles[nk] || m.solid[nk]) continue; dist[nk] = dist[k] + 1; q.push(nk); } }
    return flowCache[key] = dist;
  }
  function botTick(p, dt) {
    if (st.phase === 'meeting') { const M = st.meeting; if (M.stage === 'vote' && p.alive && p.vote === null && Math.random() < dt * 0.4) { const c = alive().filter(q => q !== p); vote(p, Math.random() < .5 || !c.length ? 'skip' : c[Math.floor(Math.random() * c.length)].id); } return; }
    if (st.phase !== 'play' && st.phase !== 'lobby') return;
    if (st.practice && p.idle === undefined) p.idle = 0;
    p.wait = (p.wait || 0) - dt;
    if (!p.goal || p.wait > 0 && !p.going) {
      if (p.wait > 0) { p.mv = 0; return; }
      const ss = st.map.stations; const s = ss[Math.floor(Math.random() * ss.length)];
      p.goal = [Math.floor(s.x / T), Math.floor(s.y / T)]; p.going = true;
    }
    const m = st.map, fl = flowTo(p.goal[0], p.goal[1]); const tx = Math.floor(p.x / T), ty = Math.floor((p.y - 2) / T);
    const here = fl[ty * m.w + tx];
    if (here <= 0) { p.going = false; p.goal = null; p.wait = 2 + Math.random() * 5; p.mv = 0; return; }
    let best = null, bv = here; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = fl[(ty + dy) * m.w + tx + dx]; if (v >= 0 && v < bv) { bv = v; best = [dx, dy]; } }
    if (!best) { p.goal = null; return; }
    const cx = (tx + best[0]) * T + 8, cy = (ty + best[1]) * T + 10, sp = 60 * st.settings.speed * dt;
    const dx = Math.sign(cx - p.x) * Math.min(sp, Math.abs(cx - p.x)), dy = Math.sign(cy - p.y) * Math.min(sp, Math.abs(cy - p.y));
    const ox = p.x, oy = p.y; World.move(m, p, dx, dy, !p.alive, null);
    if (Math.abs(p.x - ox) + Math.abs(p.y - oy) < 0.01) { p.stuck = (p.stuck || 0) + dt; if (p.stuck > 1) { p.goal = null; p.stuck = 0; } } else p.stuck = 0;
    p.mv = 1; p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
    if (!st.practice && st.phase === 'play' && p.alive && p.role === 'shape' && Math.random() < dt * 0.05) { const t = p.tasks.find(t => !t.done); if (t) { t.done = true; checkWin(); } }
    if (!st.practice && st.phase === 'play' && p.alive && p.role === 'hex' && p.hexCd <= 0 && Math.random() < dt * 0.5) action(p, { a: 'hex' });
  }

  // ---------- AI players (added by the host in the lobby) ----------
  const QI = t => World.QUICK.findIndex(e => e.t === t);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function goTo(p, x, y, dt) { // walk (or float, for Spirits) towards a point. true = arrived
    const m = st.map, sp = 66 * st.settings.speed * dt;
    if (Math.hypot(p.x - x, p.y - y) < 8) { p.mv = 0; return true; }
    let tx2, ty2;
    if (!p.alive) { tx2 = x; ty2 = y; }
    else {
      const fl = flowTo(Math.floor(x / T), Math.floor(y / T)), tx = Math.floor(p.x / T), ty = Math.floor((p.y - 2) / T), here = fl[ty * m.w + tx];
      if (here <= 1) { tx2 = x; ty2 = y; }
      else { let best = null, bv = here; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = fl[(ty + dy) * m.w + tx + dx]; if (v >= 0 && v < bv) { bv = v; best = [dx, dy]; } } if (!best) { p.goal = null; return false; } tx2 = (tx + best[0]) * T + 8; ty2 = (ty + best[1]) * T + 10; }
    }
    const dx = Math.sign(tx2 - p.x) * Math.min(sp, Math.abs(tx2 - p.x)), dy = Math.sign(ty2 - p.y) * Math.min(sp, Math.abs(ty2 - p.y));
    const ox = p.x, oy = p.y; World.move(m, p, dx, dy, !p.alive, st.sab.k === 'jam' ? st.sab.room : null);
    if (Math.abs(p.x - ox) + Math.abs(p.y - oy) < 0.01) { p.stuck = (p.stuck || 0) + dt; if (p.stuck > 1.5) { p.goal = null; p.stuck = 0; } } else p.stuck = 0;
    p.mv = 1; p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
    return false;
  }
  const randomStation = () => { const ss = st.map.stations.filter(s => s.kind === 'task'); const s = pick(ss); return [s.x, s.y]; };
  function aiTick(p, dt) {
    if (st.phase === 'meeting') return aiMeeting(p, dt);
    if (st.phase !== 'play') { p.mv = 0; return; }
    const S = st.settings, hex = p.role === 'hex';
    p.think = (p.think || 0) - dt;
    if (p.alive && !hex) {
      // 1) fix sabotage
      if (st.sab.k === 'lights') { const s = st.map.stations.filter(s => s.kind === 'switch' && !st.sab.sw[s.sw]).sort((a, b) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(p.x - b.x, p.y - b.y))[0]; if (s) { if (goTo(p, s.x, s.y, dt)) action(p, { a: 'switch', sw: s.sw }); return; } }
      if (st.sab.k === 'melt') {
        if (p.aiBtn == null) { const n = [0, 0]; for (const q of st.players.values()) if (q !== p && q.aiBtn != null) n[q.aiBtn]++; p.aiBtn = n[0] <= n[1] ? 0 : 1; }
        const s = st.map.stations.find(s => s.kind === 'melt' && s.btn === p.aiBtn); if (goTo(p, s.x, s.y, dt)) p.hold = s.btn; return;
      } else p.aiBtn = null;
      // 2) report a piece I can see
      const vis = visionOf(p); const body = st.bodies.find(b => b.rep && Math.hypot(b.x - p.x, b.y - p.y) < vis);
      if (body) { if (Math.hypot(body.x - p.x, body.y - p.y) < REPORT_RANGE - 4) { action(p, { a: 'report' }); return; } goTo(p, body.x, body.y, dt); return; }
      // 3) saw a zap but nobody reported? ring the bell
      if (p.suspect && p.bells > 0 && st.bellCd <= 0 && st.t - (p.sawAt || 0) > 12) { const b = st.map.stations.find(s => s.kind === 'bell'); if (Math.hypot(p.x - b.x, p.y - b.y) < 40) { action(p, { a: 'bell' }); return; } goTo(p, b.x, b.y - 8, dt); return; }
    }
    if (p.alive && hex) {
      const vis = visionOf(p), shapes = alive().filter(q => q.role === 'shape');
      // hex someone when nobody else is watching
      // stalk a victim, and strike when nobody else is close enough to see
      if (p.hexCd <= 0 && shapes.length) {
        let prey = st.players.get(p.prey); if (!prey || !prey.alive || st.t - (p.preyT || 0) > 25) { prey = pick(shapes); p.prey = prey.id; p.preyT = st.t; }
        const d = Math.hypot(prey.x - p.x, prey.y - p.y), watched = shapes.some(w => w !== prey && (Math.hypot(w.x - p.x, w.y - p.y) < 80 || Math.hypot(w.x - prey.x, w.y - prey.y) < 80));
        if (!watched && d < HEX_RANGE - 4) { action(p, { a: 'hex' }); p.prey = null; p.goal = randomStation(); return; }
        if (!watched || d > 60) { goTo(p, prey.x, prey.y, dt); return; } // follow at a distance while others are around
      }
      if (p.type === 'plant' && p.plantCd <= 0 && !st.marks.some(k => k.by === p.id)) { const near = shapes.find(q => Math.hypot(q.x - p.x, q.y - p.y) < HEX_RANGE); if (near && Math.random() < dt * 0.8) action(p, { a: 'plant' }); }
      if (p.type === 'shift' && p.shiftCd <= 0 && p.shiftT <= 0 && Math.random() < dt * 0.05) { const others = alive().filter(q => q !== p); if (others.length) action(p, { a: 'shift', target: pick(others).id }); }
      if (!st.sab.k && st.sabCd <= 0 && Math.random() < dt * 0.04) action(p, { a: 'sab', k: Math.random() < 0.15 ? 'melt' : Math.random() < 0.5 ? 'lights' : 'jam', room: Math.floor(Math.random() * st.map.rooms.length) });
    }
    // chores (Shapes, alive or Spirit) / pretend chores (Hexagoners)
    if (!p.goal) {
      const todo = p.tasks.filter(t => !t.done).map(t => st.map.stations.find(s => s.task === t.k)).filter(Boolean);
      if (!hex && todo.length) { const s = todo.sort((a, b) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(p.x - b.x, p.y - b.y))[0]; p.goal = [s.x, s.y]; p.goalTask = s.task; }
      else { p.goal = randomStation(); p.goalTask = null; }
      p.aiTaskT = 6 + Math.random() * 6; // AI chores take a human-ish amount of time
      if (!hex && Math.random() < 0.3) { p.goal = randomStation(); p.goalTask = null; p.aiTaskT = 1 + Math.random() * 3; } // sometimes just wander
    }
    if (goTo(p, p.goal[0], p.goal[1], dt)) {
      p.aiTaskT -= dt;
      if (p.aiTaskT <= 0) {
        if (p.goalTask && !hex) { const t = p.tasks.find(t => t.k === p.goalTask && !t.done); if (t) { t.done = true; p.stats.tasks++; checkWin(); if (!st || st.phase !== 'play') return; } }
        p.goal = null;
      }
    }
  }
  function aiMeeting(p, dt) {
    const M = st.meeting; if (!M || !p.alive) return;
    if (p.suspect && !(st.players.get(p.suspect) || {}).alive) p.suspect = null;
    p.aiSay = (p.aiSay || 0) - dt;
    if ((M.stage === 'discuss' || M.stage === 'vote') && p.aiSay <= 0 && (p.aiSaid || 0) < 2) {
      p.aiSay = 2 + Math.random() * 5; p.aiSaid = (p.aiSaid || 0) + 1;
      const acc = Object.entries(st.accuse || {}).sort((a, b) => b[1] - a[1])[0];
      if (p.role === 'shape' && p.suspect) quick(p, QI("It's {N}!"), p.suspect, false);
      else if (p.role === 'hex' && Math.random() < 0.5) { const sh = alive().filter(q => q.role === 'shape' && q !== p); if (sh.length) quick(p, QI('{N} is sus!'), pick(sh).id, false); }
      else if (acc && acc[1] > 0) { const agree = p.role === 'shape' ? (p.suspect ? p.suspect === acc[0] : Math.random() < 0.6) : (st.players.get(acc[0]) || {}).role !== 'hex'; quick(p, pick(World.QUICK.map((e, i) => [e, i]).filter(([e]) => e.c === (agree ? 'agree' : 'deny')))[1], null, false); }
      else quick(p, pick([QI('I need more proof.'), QI('Skip the vote?'), QI('Where are you?')]), null, false);
    }
    if (M.stage === 'vote' && p.vote === null) {
      if (p.aiVoteAt == null) p.aiVoteAt = M.t - (3 + Math.random() * Math.min(12, Math.max(1, M.t - 4)));
      if (M.t > p.aiVoteAt) return;
      const acc = Object.entries(st.accuse || {}).filter(([id, n]) => n > 0 && (st.players.get(id) || {}).alive && id !== p.id).sort((a, b) => b[1] - a[1])[0];
      let target = 'skip';
      if (p.role === 'shape') { if (p.suspect && p.suspect !== p.id) target = p.suspect; else if (acc && Math.random() < 0.55) target = acc[0]; }
      else { const safe = acc && (st.players.get(acc[0]) || {}).role !== 'hex' ? acc[0] : null; if (safe) target = safe; else if (Math.random() < 0.3) { const sh = alive().filter(q => q.role === 'shape'); if (sh.length) target = pick(sh).id; } }
      vote(p, target);
    }
  }

  // ---------- main tick ----------
  function tick(dt, catchingUp) {
    if (!st) return; st.t += dt; st.tick++;
    const S = st.settings;
    for (const p of st.players.values()) if (p.bot) { if (st.mode === 'maze' && st.phase !== 'lobby') mazeAi(p, dt); else if (p.ai && !st.practice && st.phase !== 'lobby') aiTick(p, dt); else botTick(p, dt); }
    for (const k in st.rattle) { st.rattle[k] -= dt; if (st.rattle[k] <= 0) delete st.rattle[k]; }
    if (st.phase === 'reveal') { st.phaseT -= dt; if (st.phaseT <= 0) { st.phase = 'play'; st.rosterDirty = true; } }
    else if (st.phase === 'play' && st.mode === 'maze') { mazeTick(dt); if (!st || st.phase !== 'play') return; }
    else if (st.phase === 'play') {
      if (S.matchTime && !st.practice) { st.matchT -= dt; if (st.matchT <= 0) { gameOver('hex', 'The blimp never launched!'); return; } }
      st.bellCd = Math.max(0, st.bellCd - dt);
      if (!st.sab.k) st.sabCd = Math.max(0, st.sabCd - dt);
      for (const p of st.players.values()) {
        if (!p.alive || p.role !== 'hex') continue;
        p.hexCd = Math.max(0, p.hexCd - dt); p.shiftCd = Math.max(0, p.shiftCd - (p.shiftT > 0 ? 0 : dt));
        if (!st.marks.some(k => k.by === p.id)) p.plantCd = Math.max(0, p.plantCd - dt);
        if (p.shiftT > 0) { p.shiftT -= dt; const tgt = st.players.get(p.shiftAs); if (p.shiftT <= 0 || !tgt) { p.shiftT = 0; p.shiftAs = null; p.shiftCd = S.shiftCd; puff(p); } }
      }
      // pieces: a pawn turns into another chess piece after a while
      for (const b of st.bodies) { b.age += dt; if (b.obj === 0 && b.age >= PIECE_AGE) b.obj = b.later; }
      // planter marks
      for (let i = st.marks.length - 1; i >= 0; i--) {
        const k = st.marks[i]; k.t += dt; const tg = st.players.get(k.target), pl = st.players.get(k.by);
        if (!tg || !tg.alive || !pl || !pl.alive || k.t > S.markFade) { st.marks.splice(i, 1); if (pl) pl.plantCd = S.plantCd; continue; }
        if (k.t < ARM_TIME) continue;
        let v = null, bd = MARK_RANGE; for (const q of st.players.values()) { if (q === tg || !q.alive || q.left || q.role === 'hex') continue; const d = dist(q, tg); if (d < bd) { bd = d; v = q; } }
        if (v) { st.marks.splice(i, 1); pl.plantCd = S.plantCd; pl.stats.hexes++; pl.stats.framed++; transform(v, tg, tg.id, true); if (!st || st.phase !== 'play') return; }
      }
      // sabotage
      if (st.sab.k === 'melt') {
        st.sab.t -= dt; const h = [null, null];
        for (const p of alive()) if (p.hold >= 0) { const [s, d] = stationNear(p, 'melt', s => s.btn === p.hold); if (d < USE_RANGE + 10) h[p.hold] = p.id; else p.hold = -1; }
        st.sab.hold = h;
        if (h[0] && h[1] && h[0] !== h[1]) endSab('Meltdown stopped! Phew!');
        else if (st.sab.t <= 0) { if (st.practice) { endSab('KABOOM! (In a real game the Hexagoners would win now.)'); } else { gameOver('hex', 'The boiler melted down!'); return; } }
      } else if (st.sab.k === 'jam') { st.sab.t -= dt; if (st.sab.t <= 0) endSab(null); }
      checkWin(); if (!st || st.phase !== 'play') return;
    } else if (st.phase === 'meeting') {
      const M = st.meeting; M.t -= dt;
      if (M.t <= 0) {
        if (M.stage === 'intro') { if (S.discuss > 0) { M.stage = 'discuss'; M.t = S.discuss; } else { M.stage = 'vote'; M.t = S.vote; } }
        else if (M.stage === 'discuss') { M.stage = 'vote'; M.t = S.vote; }
        else if (M.stage === 'vote') tallyVotes();
        else if (M.stage === 'result') { checkWin(); if (st.phase === 'meeting') endMeeting(); }
        st.rosterDirty = true;
      }
    } else if (st.phase === 'over') { st.phaseT -= dt; if (st.phaseT <= 0) backToLobby(); }
    if (!catchingUp && (st.tick % 2 === 0 || st.t - (st.lastSnap || 0) > 0.06)) { st.lastSnap = st.t; snapshots(); }
  }

  // ---------- roster + snapshots (personalised, secret-safe) ----------
  function rosterFor(viewer) {
    const list = [];
    for (const id of st.order) {
      const p = st.players.get(id); if (!p) continue;
      const e = { id, name: p.name, look: p.look, host: p.host ? 1 : 0, ready: p.ready ? 1 : 0, bot: p.bot ? 1 : 0 };
      if (st.mode === 'maze' && p.role === 'mino' && st.phase !== 'lobby') e.mino = 1;
      if (st.phase !== 'lobby') {
        e.dead = (p.knownDead || (!viewer.alive && !p.alive) || p.id === viewer.id && !p.alive) ? 1 : 0; e.left = p.left ? 1 : 0;
        if (p.ejected) e.dead = 1;
        if (viewer.role === 'hex' && p.role === 'hex') { e.hex = 1; e.type = p.type; }
        if (st.phase === 'meeting') e.voted = p.vote !== null ? 1 : 0;
      }
      list.push(e);
    }
    return { t: 'r', code: st.code, phase: st.phase, settings: st.settings, list, practice: st.practice, mapId: st.mapId || 'workshop', mode: st.mode || 'hex' };
  }
  function snapshots() {
    st.snapN = (st.snapN || 0) + 1;
    const S = st.settings, bar = taskBar();
    const al = alive(), livingShapes = al.filter(p => p.role === 'shape').length;
    const markOf = {}; for (const k of st.marks) markOf[k.target] = 1;
    for (const v of st.players.values()) {
      if (v.bot || v.left) continue;
      if (st.rosterDirty) send(v.id, rosterFor(v));
      const vr = visionOf(v), ps = [];
      for (const p of st.players.values()) {
        if (p.left) continue;
        if (!p.alive && v.alive && st.phase !== 'lobby' && st.phase !== 'over') continue; // the living can't see spirits
        let ok = p === v || st.phase !== 'play' || !v.alive || Math.hypot(p.x - v.x, p.y - v.y) <= vr + 30;
        if (!ok && v.camOn) for (const c of st.map.cams) if (Math.hypot(p.x - c.x, p.y - c.y) < 110) { ok = true; break; }
        if (!ok) continue;
        let fl = p.alive ? 0 : 1;
        if (v.role === 'hex' && p.role === 'hex' && p !== v && st.phase === 'play') fl |= 2;
        if ((v.role === 'hex' || v.sq) && markOf[p.id] && st.phase === 'play') fl |= 4; // marks: Hexagoners + Squareff
        if (v.sq && p.shiftAs && st.phase === 'play') fl |= 8;
        if (st.mode === 'maze' && p.role === 'mino') fl |= 16; // the Squareff sees a hexagon over disguised Shapeshifters
        ps.push([p.id, Math.round(p.x), Math.round(p.y), p.dir, p.mv, p.shiftAs || p.id, fl]);
      }
      const bodies = st.bodies.filter(b => !v.alive || st.phase !== 'play' || Math.hypot(b.x - v.x, b.y - v.y) <= vr + 30 || (v.camOn && st.map.cams.some(c => Math.hypot(b.x - c.x, b.y - c.y) < 110))).map(b => [b.id, b.obj, b.x, b.y, b.rep ? 1 : 0]);
      const me = { sq: v.sq ? 1 : 0, tp: [v.tpSeq, Math.round(v.x), Math.round(v.y)], alive: v.alive ? 1 : 0, tasks: v.tasks.map(t => [t.k, t.done ? 1 : 0]), bells: v.bells, rattled: v.rattled ? 1 : 0, cam: v.camOn ? 1 : 0 };
      if (v.role === 'hex') { me.role = 'hex'; me.type = v.type; me.hexCd = +v.hexCd.toFixed(1); me.plantCd = +v.plantCd.toFixed(1); me.shiftCd = +v.shiftCd.toFixed(1); me.shiftT = +v.shiftT.toFixed(1); me.shiftAs = v.shiftAs; me.sabCd = +st.sabCd.toFixed(1); me.marking = st.marks.some(k => k.by === v.id) ? 1 : 0; }
      const snap = { t: 's', ph: st.phase, p: ps, b: bodies, me, bar: +bar.toFixed(3), mt: S.matchTime && !st.practice ? Math.max(0, Math.ceil(st.matchT)) : -1, bell: Math.ceil(st.bellCd || 0), sd: (st.phase === 'play' && livingShapes <= 3 && !st.practice) ? 1 : 0 };
      if (st.sab.k) snap.sab = { k: st.sab.k, t: st.sab.t != null ? Math.ceil(st.sab.t) : 0, sw: st.sab.sw, hold: st.sab.hold ? st.sab.hold.map(x => x ? 1 : 0) : null, room: st.sab.room };
      if (st.phase === 'meeting') snap.m = { st: st.meeting.stage, t: Math.ceil(st.meeting.t), myVote: v.vote };
      if (st.phase === 'reveal') snap.tm = Math.ceil(st.phaseT);
      if (st.mode === 'maze' && st.maze) {
        const Z = st.maze, mino = st.players.get(Z.mino), rs = [...st.players.values()].filter(p => p.role === 'runner' && !p.left);
        snap.mz = { keys: Z.keys.map(k => [k.x, k.y, k.got ? 1 : 0]), open: Z.open ? 1 : 0, head: Math.ceil(Z.head), time: Math.max(0, Math.ceil(Z.time)), esc: rs.filter(p => p.escaped).length, caught: rs.filter(p => p.caught).length, left: rs.filter(p => p.alive).length, mino: Z.mino };
        if (v.role === 'runner' && v.alive && mino) me.md = Math.round(Math.hypot(v.x - mino.x, v.y - mino.y) / 10) * 10; // for the heartbeat
        me.role = v.role;
      }
      if (st.phase === 'over') snap.tm = Math.ceil(st.phaseT);
      const rt = Object.keys(st.rattle); if (rt.length) snap.rt = rt.map(Number);
      // relayed players get 10 updates a second (2 of every 3) to go easy on the free relay
      if (!(v.conn && v.conn.relay && st.snapN % 3 === 2)) send(v.id, snap);
    }
    st.rosterDirty = false;
  }
})();
