// ISOSCELATED - screens (main menu, customize, join, how to play, settings) and the main loop.
'use strict';
(function () {
  const P = G.P;
  Game.screen = 'menu';
  let t = 0, last = performance.now();
  const MUSIC_MODES = [['auto', 'Auto'], ['jazz', 'Smooth Jazz only'], ['treachery', 'Treachery Jazz only'], ['showdown', 'Golden Showdown only'], ['off', 'Off']];
  const cyc = (v, n, d) => (v + d + n) % n;

  function needName(then) {
    if (UI.prof.name && ChatFilter.checkName(UI.prof.name).ok) { then(); return; }
    UI.say('First, pick a name for your shape!', { cb: () => askName(then) });
  }
  function askName(then) {
    UI.ask('NAME (max 12):', UI.prof.name, 12, v => {
      if (v == null) return; const r = ChatFilter.checkName(v);
      if (!r.ok) { UI.say(r.reason === 'bad' || r.reason === 'personal' ? "That name isn't allowed. Please pick another name." : 'Names can be 1-12 letters or numbers.', { cb: () => askName(then) }); return; }
      UI.prof.name = r.name; UI.save(); then && then();
    });
  }

  // ---------- MAIN MENU ----------
  const walkers = []; for (let i = 0; i < 7; i++) walkers.push({ look: G.randomLook(), x: Math.random() * 600, sp: 14 + Math.random() * 20, d: Math.random() < .5 ? 2 : 3 });
  function drawMenu(dt) {
    UI.bg(t);
    const ctx = G.ctx;
    // floor strip with waddling shapes
    G.rect(0, G.H - 36, G.W, 36, '#3e2f58'); G.rect(0, G.H - 36, G.W, 2, '#54437a');
    for (const w of walkers) { w.x += (w.d === 3 ? 1 : -1) * w.sp * dt; if (w.x > G.W + 30) w.x = -30; if (w.x < -30) w.x = G.W + 30; G.drawChar(w.look, w.d, 1 + (Math.floor(t * 6 + w.sp) % 2), w.x, G.H - 8); }
    const sc = G.W >= 420 ? 4 : G.W >= 330 ? 3 : 2;
    const ty = Math.max(6, Math.floor(G.H * 0.06));
    G.drawLogo(G.W / 2, ty + 26, t, sc >= 3 ? 2 : 1);
    G.title('ISOSCELATED', G.W / 2, ty + 58, sc, t);
    const y0 = ty + 58 + 8 * sc + 14;
    const bw = Math.min(150, (G.W - 30) / 2), bh = 30;
    UI.group('menu');
    UI.button(G.W / 2 - bw - 4, y0, bw, bh, 'CREATE LOBBY', () => needName(() => Game.create()), { col: P.yellow });
    UI.button(G.W / 2 + 4, y0, bw, bh, 'JOIN LOBBY', () => needName(() => { joinCode = ''; Game.screen = 'join'; }), { col: P.sky });
    const y1 = y0 + bh + 8;
    const sm = [['CUSTOMIZE', () => { Game.customizeFromLobby = false; Game.screen = 'customize'; }], ['PRACTICE', () => Game.practice()], ['HOW TO PLAY', () => { help = 0; Game.screen = 'howto'; }], ['SETTINGS', () => { Game.screen = 'settings'; }]];
    const lab = s => (G.W < 420 && s === 'HOW TO PLAY') ? 'HELP' : s, ws = sm.map(s => lab(s[0]).length * 8 + 12), tot = ws.reduce((a, b) => a + b, 0) + 6 * (sm.length - 1);
    let sx = G.W / 2 - tot / 2; sm.forEach((s, i) => { UI.button(sx, y1, ws[i], 18, lab(s[0]), s[1]); sx += ws[i] + 6; });
    G.tiny('ONLY PLAY WITH PEOPLE WHO HAVE YOUR CODE', G.W / 2, y1 + 24, P.grey, 'c');
    if (UI.prof.name) { G.text('Hi, ' + UI.prof.name + '!', 6, 6, P.white); }
    G.ctx.drawImage(G.charSprite(UI.prof.look, 0, Math.floor(t * 3) % 3), G.W - 34, 2);
  }

  // ---------- CUSTOMIZE ----------
  let cdir = 0, cdirT = 0;
  function drawCustomize(dt) {
    UI.bg(t, '#1f2a44', '#253252');
    const L = UI.prof.look; cdirT += dt; if (cdirT > 1.3) { cdirT = 0; cdir = [0, 3, 1, 2][([0, 3, 1, 2].indexOf(cdir) + 1) % 4]; }
    const sc = Math.max(2, Math.min(5, Math.floor((G.H - 50) / 36))), spr = G.charSprite(L, cdir === 2 ? 3 : cdir, 1 + Math.floor(t * 5) % 2);
    const pw = Math.floor(G.W * 0.38), px = Math.floor(pw / 2) + 4, py = Math.floor(G.H / 2) + 8;
    G.ctx.fillStyle = '#3a4a70'; G.ctx.beginPath(); G.ctx.ellipse(px, py + spr.height * sc / 2 - 4, 16 * sc / 2, 4 * sc / 2, 0, 0, 7); G.ctx.fill();
    G.ctx.save(); if (cdir === 2) { G.ctx.translate(px * 2, 0); G.ctx.scale(-1, 1); }
    G.ctx.drawImage(spr, px - spr.width * sc / 2, py - spr.height * sc / 2, spr.width * sc, spr.height * sc); G.ctx.restore();
    G.text(UI.prof.name || '(no name)', px, 8, P.yellow, { al: 'c', ol: P.ink });
    G.text('CUSTOMIZE', px, G.H - 14, P.white, { al: 'c' });
    const x = pw + 14, w = Math.min(G.W - x - 10, 260);
    G.darkBox(x - 6, 4, w + 12, G.H - 8);
    UI.group('cust');
    const rows = [
      ['Shape', G.SHAPES[L.shape], d => L.shape = cyc(L.shape, G.SHAPES.length, d)],
      ['Color', G.BODY_COLORS[L.color][0], d => L.color = cyc(L.color, 18, d)],
      ['Pattern', G.PATTERNS[L.pattern], d => L.pattern = cyc(L.pattern, 4, d)],
      ['Hair', G.HAIRS[L.hair], d => L.hair = cyc(L.hair, 10, d)],
      ['Hair color', G.HAIR_COLORS[L.hairColor][0], d => L.hairColor = cyc(L.hairColor, 10, d)],
      ['Hat', G.HATS[L.hat], d => L.hat = cyc(L.hat, 9, d)],
      ['Eyes', G.EYES[L.eyes], d => L.eyes = cyc(L.eyes, G.EYES.length, d)],
      ['Extra', G.EXTRAS[L.extra], d => L.extra = cyc(L.extra, G.EXTRAS.length, d)],
      ['Extra color', G.BODY_COLORS[(L.acc | 0) % 18][0], d => L.acc = cyc(L.acc | 0, 18, d)],
    ];
    const rh = Math.min(16, Math.floor((G.H - 70) / 10));
    const maxv = Math.floor((w - 60) / 8);
    rows.forEach((r, i) => { UI.valueRow(x, 12 + i * rh, w, r[0], String(r[1]).slice(0, Math.max(6, maxv - r[0].length)), d => { r[2](d); UI.save(); }, { dark: true }); });
    let y = 12 + rows.length * rh + 4; const bw = Math.floor((w - 6) / 2);
    UI.button(x, y, bw, 18, 'NAME', () => askName(), {}); UI.button(x + bw + 6, y, bw, 18, 'RANDOMIZE', () => { UI.prof.look = G.randomLook(); UI.save(); Snd.sfx('puff'); });
    y += 22; UI.button(x, y, w, 20, 'DONE', () => doneCustomize(), { col: P.yellow });
    if (UI.hit('back')) doneCustomize();
  }
  function doneCustomize() {
    if (!UI.prof.name) { askName(() => doneCustomize()); return; }
    UI.save();
    if (Game.customizeFromLobby && Game.inSession()) { Game.send({ t: 'look', look: UI.prof.look, name: UI.prof.name }); Game.screen = 'session'; }
    else Game.screen = 'menu';
  }

  // ---------- JOIN ----------
  let joinCode = '';
  function drawJoin(dt) {
    UI.bg(t, '#1e3040', '#24394c'); UI.group('join');
    G.text('ENTER LOBBY CODE', G.W / 2, 8, P.white, { al: 'c' });
    const bs = Math.min(36, Math.floor((G.W - 40) / 6)); const x0 = G.W / 2 - (bs + 6) * 2.5;
    for (let i = 0; i < 5; i++) { G.box(x0 + i * (bs + 6), 22, bs, bs, P.white); G.text(joinCode[i] || ((t * 2 | 0) % 2 && i === joinCode.length ? '_' : ''), x0 + i * (bs + 6) + bs / 2, 22 + bs / 2 - 8, P.dblue, { al: 'c', sc: 2 }); }
    const keys = Net.CODE_CHARS.split(''); const cols = 8, kw = Math.min(30, Math.floor((G.W - 20) / cols) - 4), kh = Math.min(22, Math.floor((G.H - bs - 90) / 4) - 3);
    const kx0 = G.W / 2 - (cols * (kw + 4)) / 2, ky0 = 30 + bs;
    keys.forEach((k, i) => UI.button(kx0 + (i % cols) * (kw + 4), ky0 + Math.floor(i / cols) * (kh + 3), kw, kh, k, () => { if (joinCode.length < 5) joinCode += k; }));
    const r = ky0 + 3 * (kh + 3);
    UI.button(kx0 + 7 * (kw + 4), ky0 + 2 * (kh + 3), kw, kh, '◀', () => { joinCode = joinCode.slice(0, -1); }, { col: P.pink });
    UI.button(G.W / 2 - 100, r + 4, 90, 22, 'BACK', () => { Game.screen = 'menu'; });
    UI.button(G.W / 2 + 10, r + 4, 90, 22, 'JOIN!', () => tryJoin(), { col: joinCode.length === 5 ? P.yellow : P.grey });
    for (const p of UI.pressed) if (p.startsWith('key:') && p.length === 5) { const ch = p[4].toUpperCase(); if (Net.CODE_CHARS.includes(ch) && joinCode.length < 5) { joinCode += ch; Snd.sfx('click'); } }
    if (UI.hit('bksp')) joinCode = joinCode.slice(0, -1);
    if (UI.hit('key:Enter') && joinCode.length === 5) tryJoin();
    if (UI.hit('back')) Game.screen = 'menu';
  }
  function tryJoin() { if (joinCode.length !== 5) { UI.say('Codes have 5 letters.'); return; } Game.join(joinCode); }

  function drawConnecting(dt) {
    UI.bg(t, '#1e1a30', '#251f3a'); UI.group('conn');
    G.drawLogo(G.W / 2, G.H / 2 - 30, t * 2, 2);
    G.box(G.W / 2 - 110, G.H / 2, 220, 30, P.white); G.text((Game.connMsg || 'Connecting') + '.'.repeat(1 + (t * 3 | 0) % 3), G.W / 2 - 96, G.H / 2 + 11, P.ink);
    UI.button(G.W / 2 - 45, G.H / 2 + 40, 90, 20, 'CANCEL', () => Game.toMenu());
  }

  // ---------- SETTINGS (shared with pause) ----------
  function settingsRows(x, y, w, dark) {
    const pr = UI.prof; const mi = MUSIC_MODES.findIndex(m => m[0] === pr.music);
    UI.valueRow(x, y, w, 'Music', MUSIC_MODES[Math.max(0, mi)][1], d => { pr.music = MUSIC_MODES[cyc(Math.max(0, mi), 5, d)][0]; UI.save(); }, { dark }); y += 15;
    UI.valueRow(x, y, w, 'Music vol', Math.round(pr.musicVol * 10) + '/10', d => { pr.musicVol = Math.max(0, Math.min(1, Math.round(pr.musicVol * 10 + d) / 10)); Snd.setMusicVolume(pr.musicVol); UI.save(); }, { dark }); y += 15;
    UI.valueRow(x, y, w, 'Sound FX', Math.round(pr.sfxVol * 10) + '/10', d => { pr.sfxVol = Math.max(0, Math.min(1, Math.round(pr.sfxVol * 10 + d) / 10)); Snd.setSfxVolume(pr.sfxVol); Snd.sfx('vote'); UI.save(); }, { dark }); y += 15;
    return y;
  }
  let jukeSel = null;
  function drawSettings(dt) {
    UI.bg(t, '#2a2040', '#31264a'); UI.group('set');
    const w = Math.min(300, G.W - 30), x = G.W / 2 - w / 2; G.box(x - 10, 8, w + 20, G.H - 16, P.white); G.text('SETTINGS', G.W / 2, 16, P.dblue, { al: 'c' });
    let y = settingsRows(x, 34, w, false) + 6;
    G.text('LISTEN TO THE MUSIC:', x, y, P.mid); y += 12;
    Snd.TRACKS.forEach(tr => { const sel = jukeSel === tr.id; const b = UI.button(x, y, w, 15, tr.name, () => { jukeSel = sel ? null : tr.id; }, { col: sel ? P.yellow : P.white, noCursor: true }); if (sel) G.text('▶', x - 9, y + 3, P.yellow, { ol: P.ink }); if (!sel && UI.isFocused(b) && performance.now() - (UI.navMoved || 0) < 150) jukeSel = tr.id; y += 17; });
    UI.button(G.W / 2 - 45, Math.min(y + 4, G.H - 32), 90, 18, 'BACK', () => { jukeSel = null; Game.screen = 'menu'; });
    if (UI.hit('back')) { jukeSel = null; Game.screen = 'menu'; }
  }
  Game.drawPause = function (b) {
    const C = Game.C(); let y = settingsRows(b.x + 18, b.y + 26, b.w - 36, false) + 2;
    const bw = b.w - 36, x = b.x + 18;
    if (C.practice) {
      const row = (lbl, f, col) => { UI.button(x, y, bw, 15, lbl, f, { col }); y += 17; };
      row('BE A SHAPE', () => { Game.practiceRole(null); Game.closeOverlay(); });
      row('BE CLASSIC HEXAGONER', () => { Game.practiceRole('classic'); Game.closeOverlay(); }, '#ffd6dc');
      row('BE SHAPESHIFTER', () => { Game.practiceRole('shift'); Game.closeOverlay(); }, '#ffd6dc');
      row('BE PLANTER', () => { Game.practiceRole('plant'); Game.closeOverlay(); }, '#ffd6dc');
      row('BE THE SQUAREFF', () => { Game.practiceRole('squareff'); Game.closeOverlay(); }, '#fff2b8');
      row('REVIVE DUMMIES', () => { Server.practiceReset(); Game.closeOverlay(); });
      row('MUSIC BOX JUKEBOX', () => { C.overlay = 'jukebox'; });
    }
    UI.button(x, y, bw / 2 - 2, 16, 'HELP', () => { help = 0; helpBack = 'session'; Game.screen = 'howto'; Game.closeOverlay(); });
    UI.button(x + bw / 2 + 2, y, bw / 2 - 2, 16, 'LEAVE', () => { C.overlay = 'leave'; }, { col: P.pink }); y += 19;
    UI.button(x, y, bw, 16, 'RESUME', () => Game.closeOverlay(), { col: P.yellow });
  };

  // ---------- HOST SETTINGS ----------
  Game.drawHostSettings = function (b) {
    const C = Game.C(), S = C.settings, host = C.mode === 'host' && C.phase === 'lobby', n = C.roster.length;
    const set = (k, v) => { if (host) Server.setSetting(k, v); };
    const rng = (k, lo, hi, step) => d => set(k, Math.max(lo, Math.min(hi, S[k] + d * step)));
    const typeModes = ['random', 'classic', 'custom'], typeNames = { random: 'Random each round', classic: 'Classic only', custom: 'Pick types' };
    const mt = [0, 5, 8, 10, 15], sp = [0.75, 1, 1.25, 1.5], rv = ['off', 'hex', 'full'], rvN = { off: 'Off', hex: 'Hex or not', full: 'Full + type' }, chm = ['quick', 'off'], chN = { quick: 'Quick Chat', off: 'Off' };
    const rows = [
      ['Hexagoners', S.hexCount + (Server.hexValid(S.hexCount, n) ? '' : ' !'), d => set('hexCount', Math.max(1, Math.min(4, S.hexCount + d))), { warn: !Server.hexValid(S.hexCount, n) }],
      ['Hexagoner Types', typeNames[S.types], d => set('types', typeModes[cyc(typeModes.indexOf(S.types), 3, d)])],
    ];
    if (S.types === 'custom') for (const k of ['classic', 'shift', 'plant']) rows.push(['  ' + Game.TYPE_NAME[k], S.allowed[k] ? '✔ yes' : 'no', () => set('allowed', { [k]: !S.allowed[k] })]);
    rows.push(['Hex cooldown', S.hexCd + 's', rng('hexCd', 15, 60, 5)], ['Plant cooldown', S.plantCd + 's', rng('plantCd', 15, 60, 5)], ['Mark fade time', S.markFade + 's', rng('markFade', 30, 120, 10)],
      ['Shift duration', S.shiftDur + 's', rng('shiftDur', 10, 40, 5)], ['Shift cooldown', S.shiftCd + 's', rng('shiftCd', 15, 60, 5)], ['Discussion', S.discuss + 's', rng('discuss', 0, 120, 15)],
      ['Voting', S.vote + 's', rng('vote', 15, 180, 15)], ['Meeting Bells', String(S.bells), rng('bells', 0, 3, 1)], ['Match timer', S.matchTime ? S.matchTime + ' min' : 'Off', d => set('matchTime', mt[cyc(mt.indexOf(S.matchTime), 5, d)])],
      ['Player speed', S.speed + 'x', d => set('speed', sp[cyc(sp.indexOf(S.speed), 4, d)])], ['Tasks each', String(S.tasks), rng('tasks', 3, 8, 1)],
      ['Mode', S.mode === 'maze' ? 'Minotaur Maze' : 'Hexagoners', () => set('mode', S.mode === 'maze' ? 'hex' : 'maze')],
      ['Map', S.map === 'random' ? 'Random' : (World.MAPS[S.map] || World.MAPS.workshop).name, d => { const ids = World.MAP_IDS.concat(['random']); set('map', ids[cyc(Math.max(0, ids.indexOf(S.map)), ids.length, d)]); }],
      ['Squareff', S.squareff ? 'On (1 Shape)' : 'Off', () => set('squareff', S.squareff ? 0 : 1)],
      ['Reveal on eject', rvN[S.reveal], d => set('reveal', rv[cyc(rv.indexOf(S.reveal), 3, d)])], ['Chat', chN[S.chat] || 'Quick Chat', d => set('chat', chm[cyc(Math.max(0, chm.indexOf(S.chat)), 2, d)])]);
    const top = b.y + 22, vis = Math.floor((b.h - 50) / 14);
    const nb = UI.focus['ov'] | 0; let sc = Math.max(0, Math.min(rows.length - vis, nb - Math.floor(vis / 2)));
    if (C.scrollTo != null) sc = C.scrollTo;
    rows.forEach((r, i) => { const yy = top + (i - sc) * 14; if (i < sc || i >= sc + vis) { UI.area(-100, -100, 1, 1, null, { nav: true, lr: host ? r[2] : null }); return; } UI.valueRow(b.x + 14, yy, b.w - 28, r[0], r[1], host ? r[2] : () => { }, Object.assign({ disabled: !host }, r[3] || {})); });
    if (rows.length > vis) { G.text('▲', b.x + b.w - 12, top, sc > 0 ? P.ink : P.light); G.text('▼', b.x + b.w - 12, top + (vis - 1) * 14, sc < rows.length - vis ? P.ink : P.light); UI.area(b.x + b.w - 14, top - 2, 12, 12, () => { C.scrollTo = Math.max(0, sc - 3); }); UI.area(b.x + b.w - 14, top + (vis - 1) * 14 - 2, 12, 12, () => { C.scrollTo = Math.min(rows.length - vis, sc + 3); }); }
    if (UI.pressed.some(k => k === 'up' || k === 'down')) C.scrollTo = null;
    const fy = b.y + b.h - 24;
    if (!Server.hexValid(S.hexCount, n)) G.text('Too many Hexagoners for this many players', b.x + b.w / 2, fy - 10, P.red, { al: 'c' });
    else G.text(host ? 'Suggested: ' + Server.suggestHex(n) + ' Hexagoner(s) for ' + n + ' players' : 'Only the host can change these.', b.x + b.w / 2, fy - 10, P.mid, { al: 'c' });
    UI.button(b.x + b.w / 2 - 40, fy + 2, 80, 16, 'OK', () => Game.closeOverlay(), { col: P.yellow });
  };

  // ---------- HOW TO PLAY ----------
  let help = 0, helpBack = 'menu';
  const DUMMY = [{ shape: 1, color: 6, pattern: 0, hair: 2, hairColor: 0, hat: 0, eyes: 0, extra: 2 }, { shape: 2, color: 10, pattern: 2, hair: 4, hairColor: 2, hat: 0, eyes: 3, extra: 0 }, { shape: 9, color: 3, pattern: 0, hair: 0, hairColor: 0, hat: 0, eyes: 2, extra: 1 }, { shape: 0, color: 0, pattern: 1, hair: 3, hairColor: 4, hat: 1, eyes: 0, extra: 4 }];
  const PAGES = [
    ['WELCOME!', 'You are a living shape trapped in a giant floating Toy Workshop. Finish your chores to power the escape BLIMP! But watch out... some players are secretly HEXAGONERS.', 'intro'],
    ['SHAPES', 'Walk to the yellow ! on your MAP and press USE to do chores. Found a chess piece wearing a hat or hair? It was a player! Press REPORT. Or ring the MEETING BELL in the Blimp Dock.', 'tasks'],
    ['MEETINGS', 'Everyone meets at the table. First you DISCUSS, then you VOTE by tapping a player. The player with the most votes is shot out of the blimp cannon! A tie means nobody goes.', 'vote'],
    ['HEXAGONERS', 'Hexagoners HEX nearby Shapes, turning them into chess pieces! A new victim is a PAWN; after a while it becomes another piece. They can SABOTAGE (lights out, boiler meltdown, jam doors) and sneak through secret TOY CHUTES.', 'hex'],
    ['CLASSIC', 'The CLASSIC Hexagoner has no special power, but can Hex more often (5s shorter cooldown) and sees a bit further in the dark.', 'classic'],
    ['SHAPESHIFTER', 'SHIFT copies another player\'s whole look AND name for 20s. Hex in disguise and witnesses blame the wrong shape! Shifting makes a puff of smoke, so be careful who is watching.', 'shift'],
    ['PLANTER', 'PLANT secretly curses a Shape (a purple mark only Hexagoners can see). The next Shape they walk near gets zapped... FROM the marked player! Now everyone thinks they did it.', 'plant'],
    ['SQUAREFF', 'One random Shape may be the SQUAREFF. They see who is marked by a Planter, a red hexagon over a disguised Shapeshifter, and keep their vision in Lights Out. Help your team without giving yourself away!', 'squareff'],
    ['MINOTAUR MAZE', 'A second game mode! One player is the MINOTAUR (your own character on a bull body). Everyone else gets a 10 second head start to find 3 golden keys and escape the hedge maze. Hear a heartbeat? The Minotaur is near!', 'maze'],
    ['SPIRITS', 'Turned into a chess piece? You become a Spirit! Float through walls, keep doing chores to help, chat with other Spirits, and RATTLE one object once per game as a hint.', 'spirit'],
    ['HOW TO WIN', 'SHAPES win by filling the chore bar or voting out every Hexagoner. HEXAGONERS win when they equal the Shapes, if the boiler melts down, or if the match timer runs out.', 'win'],
    ['CONTROLS', 'Move: WASD/arrows or the D-pad. E = Use, Q = Hex, F = Special, R = Report, X = Sabotage, M = Map, C = Quick Chat, C or Enter = Quick Chat, Esc = Menu.', 'keys'],
    ['QUICK CHAT', 'Talk with QUICK CHAT (C or Enter): SAY, smart AGREE and DISAGREE comebacks, and WHO? to name a player, like "It\'s BLOB!". Nobody can type, so chat stays kind. Tap a player to mute or report them.', 'kind'],
  ];
  function drawHowto(dt) {
    UI.bg(t, '#1d2b3a', '#223447'); UI.group('help');
    const pg = PAGES[help]; const w = Math.min(G.W - 16, 380), x = G.W / 2 - w / 2;
    G.box(x, 6, w, G.H - 36, P.white);
    G.text(pg[0], G.W / 2, 14, P.dblue, { al: 'c', sc: G.W > 340 ? 2 : 1 });
    const ah = Math.min(80, G.H - 160); demo(pg[2], G.W / 2, 34 + ah, ah);
    G.wrap(pg[1], Math.floor((w - 20) / 8)).forEach((l, i) => G.text(l, x + 10, 42 + ah + i * 10, P.ink));
    G.text((help + 1) + '/' + PAGES.length, G.W / 2, G.H - 24, P.white, { al: 'c' });
    const by = G.H - 26;
    UI.button(x, by + 4, 60, 18, '◀', () => { help = (help + PAGES.length - 1) % PAGES.length; });
    UI.button(x + w - 60, by + 4, 60, 18, '▶', () => { help = (help + 1) % PAGES.length; });
    UI.button(G.W / 2 + 30, by + 4, 70, 18, 'DONE', () => { Game.screen = helpBack; helpBack = 'menu'; }, { col: P.yellow });
    if (UI.hit('back')) { Game.screen = helpBack; helpBack = 'menu'; }
  }
  // little pixel animations for each page
  function demo(kind, cx, gy, h) {
    const ctx = G.ctx, k = (t % 4) / 4; ctx.save(); ctx.beginPath(); ctx.rect(cx - 150, gy - h, 300, h + 4); ctx.clip();
    G.rect(cx - 150, gy - 2, 300, 6, '#e4d6bb');
    const ch = (lk, x, d, f) => G.drawChar(lk, d == null ? 3 : d, f == null ? 1 + (Math.floor(t * 6) % 2) : f, x, gy);
    if (kind === 'intro') { G.drawLogo(cx, gy - h / 2, t, 2); ch(DUMMY[0], cx - 70 + Math.sin(t) * 10); ch(DUMMY[1], cx + 70 - Math.sin(t) * 10, 2); }
    else if (kind === 'tasks') { const p = World.propSprite({ k: 'gears', w: 4, h: 2 }); ctx.drawImage(p, cx + 10, gy - 34); const x = cx - 90 + Math.min(1, k * 2) * 90; ch(DUMMY[0], x, 3, k < .5 ? null : 0); if (k > .6) { G.rect(cx - 40, gy - 50, 60 * Math.min(1, (k - .6) * 3), 6, P.lime); G.text('!', cx + 4, gy - 64, P.yellow, { ol: P.ink }); } }
    else if (kind === 'vote') { for (let i = 0; i < 3; i++) ch(DUMMY[i], cx - 60 + i * 60, 0, 0); if (k > .3) G.text('✔', cx - 64, gy - 48, P.green); if (k > .5) G.text('✔', cx - 4, gy - 48, P.green); if (k > .7) { G.rect(cx + 44, gy - 50, 30, 10, P.yellow); G.tiny('VOTED', cx + 47, gy - 48, P.ink); } }
    else if (kind === 'hex' || kind === 'classic') {
      const hx = DUMMY[3]; ch(hx, cx - 40, 3, 0);
      if (k < .35) ch(DUMMY[1], cx + 20, 2, 0); else if (k < .45) { G.line && (ctx.fillStyle = P.glow); G.line(cx - 30, gy - 16, cx + 20, gy - 12); G.rect(cx + 8, gy - 30, 24, 30, '#fff'); }
      else { const c = G.bodySprite(k < .75 ? 0 : 4, DUMMY[1]); ctx.drawImage(c, cx + 7, gy - c.height + 2); }
      if (kind === 'classic') { G.text('COOLDOWN: ' + (k < .45 ? 25 : Math.ceil(25 - (k - .45) * 40)), cx, gy - h + 6, P.purple, { al: 'c' }); }
    }
    else if (kind === 'shift') { if (k < .4) ch(DUMMY[3], cx - 40, 3, 0); else ch(DUMMY[2], cx - 40, 3, 0); if (k > .37 && k < .5) for (let i = 0; i < 12; i++) G.rect(cx - 50 + ((i * 37 + t * 60) % 20), gy - 30 + ((i * 13) % 26), 3, 3, P.grey); ch(DUMMY[2], cx + 50, 2, 0); G.tiny(k < .4 ? 'HEXAGONER' : 'COPY!', cx - 40, gy - 44, P.hexred, 'c'); G.tiny('REAL', cx + 50, gy - 44, P.white, 'c'); }
    else if (kind === 'plant') {
      const mx = cx - 80 + Math.min(1, k * 1.6) * 100; ch(DUMMY[0], mx, 3); if (k < .62) { const by = gy - 46; G.rect(mx - 2, by, 5, 5, P.glow); G.rect(mx - 1, by + 1, 3, 3, '#fff'); }
      if (k < .62) ch(DUMMY[1], cx + 40, 2, 0); else if (k < .7) { ctx.fillStyle = P.glow; G.line(mx, gy - 16, cx + 40, gy - 12); } else ctx.drawImage(G.bodySprite(0, DUMMY[1]), cx + 27, gy - 32);
      G.tiny('MARKED (CAN\'T TELL!)', mx, gy - 54, P.glow, 'c');
    }
    else if (kind === 'squareff') { ch(DUMMY[0], cx - 50, 3, 0); ch(DUMMY[2], cx + 40, 2, 0); const hy = gy - 52 + Math.round(Math.sin(t * 5) * 1.5); for (const [a, b2, w, h] of [[-2, 0, 5, 1], [-3, 1, 1, 1], [3, 1, 1, 1], [-4, 2, 1, 3], [4, 2, 1, 3], [-3, 5, 1, 1], [3, 5, 1, 1], [-2, 6, 5, 1]]) G.rect(cx + 40 + a, hy + b2, w, h, P.hexred); G.tiny('SQUAREFF', cx - 50, gy - 44, P.yellow, 'c'); G.tiny('DISGUISED!', cx + 40, gy - 60, P.hexred, 'c'); }
    else if (kind === 'maze') { const mx = cx + 60 - k * 140; G.drawMinotaur(DUMMY[3], 2, 1 + (Math.floor(t * 6) % 2), mx, gy); ch(DUMMY[1], cx - 20 - k * 120, 2); G.drawKey(cx - 100, gy - 10, t); }
    else if (kind === 'spirit') { ctx.drawImage(G.bodySprite(3, DUMMY[0]), cx - 60, gy - 32); G.drawChar(DUMMY[0], 3, 0, cx + Math.sin(t) * 30, gy - 10 + Math.sin(t * 3) * 3, 0.5); }
    else if (kind === 'win') { const bx = cx - 100 + k * 200; ctx.fillStyle = P.ink; ctx.beginPath(); ctx.ellipse(bx, gy - h / 2, 32, 14, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#e8c56a'; ctx.beginPath(); ctx.ellipse(bx, gy - h / 2 - 1, 30, 12, 0, 0, 7); ctx.fill(); }
    else if (kind === 'keys') { ['W', 'A', 'S', 'D'].forEach((c, i) => { const x = cx - 60 + [1, 0, 1, 2][i] * 18, y = gy - 40 + [0, 1, 1, 1][i] * 18; G.box(x, y, 16, 16, P.white); G.text(c, x + 4, y + 4, P.ink); }); ['E', 'Q', 'F', 'R'].forEach((c, i) => { G.box(cx + 10 + i * 20, gy - 22, 16, 16, P.yellow); G.text(c, cx + 14 + i * 20, gy - 18, P.ink); }); }
    else if (kind === 'kind') { ch(DUMMY[0], cx - 30, 3, 0); ch(DUMMY[1], cx + 30, 2, 0); G.text('♥', cx - 4, gy - 50 - Math.abs(Math.sin(t * 3)) * 6, P.red); }
    ctx.restore();
  }

  // ---------- main loop ----------
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
    UI.beginFrame();
    try {
      switch (Game.screen) {
        case 'menu': drawMenu(dt); break;
        case 'customize': drawCustomize(dt); break;
        case 'join': drawJoin(dt); break;
        case 'connecting': Game.frame(dt, t); if (Game.screen === 'connecting') { UI.beginFrame(); drawConnecting(dt); } break;
        case 'settings': drawSettings(dt); break;
        case 'howto': drawHowto(dt); break;
        case 'session': if (!Game.inSession()) { Game.screen = 'menu'; break; } Game.frame(dt, t); break;
      }
      if (Game.screen === 'session' && Game.inSession()) Tasks.draw(dt);
      // keep the session alive (messages, roster) while the player is in Customize / How to Play
      if (Game.inSession() && (Game.screen === 'customize' || Game.screen === 'howto')) Game.pump();
      UI.drawSay(dt);
      UI.endFrame();
    } catch (e) { console.error(e); }
    G.present(); UI.endInput();
    // music
    const want = Game.screen === 'settings' ? (jukeSel || Game.wantedTrack()) : Game.wantedTrack();
    if (want !== Snd.current) Snd.play(want);
    requestAnimationFrame(frame);
  }
  function boot() {
    G.resize(); G.buildFont();
    window.addEventListener('resize', () => { G.resize(); });
    window.addEventListener('orientationchange', () => setTimeout(() => G.resize(), 300));
    Snd.setMusicVolume(UI.prof.musicVol); Snd.setSfxVolume(UI.prof.sfxVol);
    // tap-to-start (needed so browsers allow sound)
    requestAnimationFrame(frame);
    window.__iso = { Game, Server, UI, G, World, Tasks }; // handy for debugging / automated tests
  }
  const fontReady = document.fonts && document.fonts.load ? Promise.race([document.fonts.load('8px "Press Start 2P"'), new Promise(r => setTimeout(r, 2500))]) : Promise.resolve();
  fontReady.then(boot, boot);
})();
