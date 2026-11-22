// ISOSCELATED - the Toy Workshop map (tiles, rooms, props, stations), collision and map drawing.
'use strict';
const World = {};
(function () {
  const T = 16; World.T = T;
  const P = G.P;
  // task kinds (mini-games) with their station room/prop
  World.TASKS = {
    pipes: 'Connect pipes', gears: 'Match gears', code: 'Blueprint code', yarn: 'Untangle yarn', sort: 'Sort blocks',
    cupcake: 'Frost cupcake', compass: 'Aim compass', windbox: 'Wind music box', keycard: 'Swipe keycard', rings: 'Stack rings',
    matchtoys: 'Match 3 toys', gauge: 'Fill boiler', candy: 'Refill candy'
  };
  World.TASK_KEYS = Object.keys(World.TASKS);

  function makeMap(w, h) { return { w, h, tiles: new Uint8Array(w * h), room: new Int8Array(w * h).fill(-1), solid: new Uint8Array(w * h), rooms: [], props: [], stations: [], doors: {}, chutes: [], cams: [], seats: [] }; }
  function carve(m, x, y, w, h, roomIdx) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { m.tiles[j * m.w + i] = 1; if (roomIdx != null) m.room[j * m.w + i] = roomIdx; } }
  function prop(m, k, x, y, w, h, solid, extra) { const p = Object.assign({ id: m.props.length, k, x, y, w: w || 1, h: h || 1, solid: solid !== false }, extra || {}); m.props.push(p); if (p.solid) for (let j = y; j < y + p.h; j++) for (let i = x; i < x + p.w; i++) m.solid[j * m.w + i] = 1; return p; }
  function station(m, kind, tx, ty, extra) { const s = Object.assign({ kind, x: tx * T + 8, y: ty * T + 8, room: m.room[ty * m.w + tx] }, extra || {}); m.stations.push(s); return s; }

  World.ROOM_DEFS = [
    // name, x, y, w, h, floor colors [a,b], wall face color, floor style
    ['Paint Shop', 2, 2, 14, 10, ['#e9d9c4', '#dfcbb2'], '#c96b5c', 'plank'],
    ['Gear Room', 22, 2, 14, 10, ['#b9b8c4', '#a9a8b6'], '#6b6f8a', 'plate'],
    ['Library of Blueprints', 42, 2, 14, 10, ['#9fb6d6', '#91a9cc'], '#3e5a8f', 'carpet'],
    ['Storage Attic', 62, 2, 14, 10, ['#c9a77c', '#bb986d'], '#7d5638', 'plank'],
    ['Candy Kitchen', 2, 20, 14, 12, ['#f7d2e0', '#fbe6ee'], '#d0679a', 'check'],
    ['Blimp Dock', 22, 18, 20, 16, ['#cfe3b8', '#c3d9a9'], '#5c8f5a', 'tile'],
    ['Music Box Hall', 48, 20, 14, 12, ['#d8c3ea', '#ccb3e2'], '#7a52a6', 'carpet'],
    ['Security Booth', 66, 22, 10, 8, ['#a8c9c4', '#9bbdb8'], '#3f7d78', 'plate'],
    ['Toy Testing Lab', 2, 42, 16, 11, ['#f2e6a8', '#ead994'], '#c4973a', 'check'],
    ['Boiler Room', 24, 42, 16, 11, ['#c4a49a', '#b8968b'], '#8a4a3c', 'plate'],
  ];
  const HALL = [[16, 5, 6, 3], [36, 5, 6, 3], [56, 5, 6, 3], [7, 12, 3, 8], [23, 12, 3, 6], [16, 24, 6, 3], [42, 24, 6, 3], [62, 24, 4, 3], [69, 12, 3, 10], [8, 32, 3, 10], [30, 34, 3, 8], [18, 46, 6, 3], [40, 46, 13, 3], [53, 32, 3, 17], [53, 12, 3, 8]];

  World.buildWorkshop = function () {
    const m = makeMap(78, 56); m.kind = 'workshop'; m.hallFloor = ['#d6cfc0', '#cdc5b4']; m.hallWall = '#8b8174';
    World.ROOM_DEFS.forEach((d, i) => { m.rooms.push({ i, name: d[0], x: d[1], y: d[2], w: d[3], h: d[4], floor: d[5], wall: d[6], style: d[7] }); carve(m, d[1], d[2], d[3], d[4], i); });
    HALL.forEach(h => carve(m, h[0], h[1], h[2], h[3], null));
    // door cells = hallway cells touching a room
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const k = y * m.w + x; if (!m.tiles[k] || m.room[k] >= 0) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r = m.room[(y + dy) * m.w + x + dx]; if (r >= 0) { (m.doors[r] = m.doors[r] || []).push(k); break; } }
    }
    // --- props & stations ---
    // Paint Shop
    prop(m, 'paintcans', 3, 2, 3, 1); prop(m, 'pipes', 7, 2, 3, 1); station(m, 'task', 8, 3, { task: 'pipes' });
    prop(m, 'easel', 12, 2, 2, 2); prop(m, 'paintcans', 3, 10, 2, 1); prop(m, 'toybox', 14, 10, 1, 1, true, { chute: 0 });
    // Gear Room
    prop(m, 'gears', 24, 2, 4, 2); station(m, 'task', 26, 4, { task: 'gears' }); prop(m, 'lever', 33, 2, 1, 1); station(m, 'switch', 33, 3, { sw: 0 });
    prop(m, 'conveyor', 23, 9, 6, 1); prop(m, 'crate', 34, 10, 1, 1);
    // Library
    prop(m, 'shelf', 43, 2, 4, 1); prop(m, 'shelf', 49, 2, 4, 1); prop(m, 'desk', 47, 6, 3, 1); station(m, 'task', 48, 7, { task: 'code' });
    prop(m, 'button', 55, 2, 1, 1); station(m, 'melt', 55, 3, { btn: 1 }); prop(m, 'toybox', 43, 10, 1, 1, true, { chute: 1 }); prop(m, 'plant', 42, 2, 1, 1);
    // Storage Attic
    prop(m, 'crate', 63, 2, 2, 2); prop(m, 'yarnbasket', 68, 2, 2, 1); station(m, 'task', 69, 3, { task: 'yarn' });
    prop(m, 'blockbin', 72, 2, 2, 1); station(m, 'task', 73, 3, { task: 'sort' }); prop(m, 'crate', 73, 9, 2, 2); prop(m, 'toybox', 63, 10, 1, 1, true, { chute: 2 });
    // Candy Kitchen
    prop(m, 'oven', 3, 20, 2, 1); station(m, 'task', 4, 21, { task: 'cupcake' }); prop(m, 'candymachine', 11, 20, 2, 2); station(m, 'task', 12, 22, { task: 'candy' });
    prop(m, 'lever', 14, 20, 1, 1); station(m, 'switch', 14, 21, { sw: 1 }); prop(m, 'toybox', 3, 30, 1, 1, true, { chute: 3 }); prop(m, 'counter', 7, 28, 4, 1);
    // Blimp Dock
    prop(m, 'blimp', 26, 18, 14, 3); prop(m, 'compass', 40, 18, 1, 1); station(m, 'task', 40, 19, { task: 'compass' });
    prop(m, 'table', 30, 25, 4, 3); station(m, 'bell', 32, 28.5); prop(m, 'plant', 22, 18, 1, 1); prop(m, 'plant', 22, 33, 1, 1); prop(m, 'plant', 41, 33, 1, 1);
    // Music Box Hall
    prop(m, 'musicbox', 50, 20, 2, 1); station(m, 'task', 51, 21, { task: 'windbox' }); prop(m, 'piano', 56, 20, 3, 2); prop(m, 'drum', 49, 29, 1, 1); prop(m, 'drum', 60, 29, 1, 1);
    // Security Booth
    prop(m, 'console', 66, 22, 3, 1); station(m, 'cams', 67, 23); prop(m, 'reader', 74, 22, 1, 1); station(m, 'task', 74, 23, { task: 'keycard' });
    // Toy Testing Lab
    prop(m, 'ringpeg', 4, 42, 1, 1); station(m, 'task', 4, 43, { task: 'rings' }); prop(m, 'toyshelf', 12, 42, 3, 1); station(m, 'task', 13, 43, { task: 'matchtoys' });
    prop(m, 'toybox', 16, 51, 1, 1, true, { chute: 4 }); prop(m, 'conveyor', 3, 49, 6, 1);
    // Boiler Room
    prop(m, 'boiler', 34, 42, 4, 2); station(m, 'task', 36, 44, { task: 'gauge' }); prop(m, 'button', 25, 42, 1, 1); station(m, 'melt', 25, 43, { btn: 0 });
    prop(m, 'pipesv', 26, 43, 2, 1); prop(m, 'toybox', 38, 51, 1, 1, true, { chute: 5 });
    // chutes stations
    m.props.filter(p => p.chute != null).sort((a, b) => a.chute - b.chute).forEach(p => { m.chutes.push({ x: p.x * T + 8, y: p.y * T + 8 + 14, prop: p.id, room: m.room[p.y * m.w + p.x], i: p.chute }); });
    m.chutes.forEach(c => station(m, 'chute', 0, 0, { x: c.x, y: c.y, chute: c.i, room: c.room }));
    // cameras: 4 feeds (centre points)
    m.cams = [{ name: 'Blimp Dock', x: 32 * T, y: 30 * T }, { name: 'Gear Hall', x: 24 * T, y: 14 * T }, { name: 'Candy Hall', x: 19 * T, y: 25.5 * T }, { name: 'Boiler Hall', x: 46 * T, y: 47.5 * T }];
    // meeting seats around the table (pixel coords)
    const cx = 32 * T, cy = 26.5 * T;
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; m.seats.push([Math.round(cx + Math.cos(a) * 66), Math.round(cy + Math.sin(a) * 50)]); }
    m.spawn = [cx, cy + 50];
    return m;
  };

  World.buildLobby = function () {
    const m = makeMap(24, 14); m.kind = 'lobby'; m.hallFloor = ['#e9d9c4', '#dfcbb2']; m.hallWall = '#8b8174';
    m.rooms.push({ i: 0, name: 'Lobby', x: 2, y: 2, w: 20, h: 10, floor: ['#f1dfb8', '#e7d1a2'], wall: '#b0603e', style: 'plank' }); carve(m, 2, 2, 20, 10, 0);
    prop(m, 'jukebox', 4, 2, 2, 1); station(m, 'jukebox', 5, 3);
    prop(m, 'mirror', 18, 2, 2, 1); station(m, 'mirror', 19, 3);
    prop(m, 'plant', 2, 2, 1, 1); prop(m, 'plant', 21, 2, 1, 1); prop(m, 'rug', 9, 5, 6, 4, false); prop(m, 'crate', 2, 11, 1, 1); prop(m, 'toybox', 21, 11, 1, 1);
    prop(m, 'shelf', 9, 2, 6, 1);
    m.spawn = [12 * T, 8 * T]; m.seats = []; for (let i = 0; i < 20; i++) m.seats.push([(5 + (i % 10) * 1.6) * T, (7 + Math.floor(i / 10) * 2) * T]);
    return m;
  };

  // ---------- collision ----------
  World.blocked = function (m, px, py, jam) {
    const tx = Math.floor(px / T), ty = Math.floor(py / T);
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return true;
    const k = ty * m.w + tx; if (!m.tiles[k] || m.solid[k]) return true;
    if (jam != null && m.doors[jam] && m.doors[jam].indexOf(k) >= 0) return true;
    return false;
  };
  // feet box ~10x5
  World.hit = function (m, x, y, jam) { return World.blocked(m, x - 5, y - 4, jam) || World.blocked(m, x + 5, y - 4, jam) || World.blocked(m, x - 5, y + 1, jam) || World.blocked(m, x + 5, y + 1, jam); };
  World.move = function (m, e, dx, dy, ghost, jam) {
    if (ghost) { e.x = Math.max(8, Math.min(m.w * T - 8, e.x + dx)); e.y = Math.max(16, Math.min(m.h * T - 4, e.y + dy)); return; }
    if (World.hit(m, e.x, e.y, jam)) { // stuck inside something? pop out to the nearest free spot
      for (let r = 2; r <= 40; r += 2) for (let a = 0; a < 16; a++) { const nx = e.x + Math.cos(a / 8 * Math.PI) * r, ny = e.y + Math.sin(a / 8 * Math.PI) * r; if (!World.hit(m, nx, ny, jam)) { e.x = nx; e.y = ny; return; } }
      return;
    }
    if (dx && !World.hit(m, e.x + dx, e.y, jam)) e.x += dx; else if (dx) { // slide around corners
      for (const s of [3, -3]) if (!World.hit(m, e.x + dx, e.y + s, jam) && !World.hit(m, e.x, e.y + s, jam)) { e.y += Math.sign(s) * Math.min(Math.abs(dx), 1); break; }
    }
    if (dy && !World.hit(m, e.x, e.y + dy, jam)) e.y += dy; else if (dy) {
      for (const s of [3, -3]) if (!World.hit(m, e.x + s, e.y + dy, jam) && !World.hit(m, e.x + s, e.y, jam)) { e.x += Math.sign(s) * Math.min(Math.abs(dy), 1); break; }
    }
  };
  World.roomAt = function (m, x, y) { const tx = Math.floor(x / T), ty = Math.floor(y / T); if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return -1; return m.room[ty * m.w + tx]; };
  World.roomName = function (m, x, y) { const r = World.roomAt(m, x, y); return r >= 0 ? m.rooms[r].name : 'Hallway'; };

  // ---------- rendering: prerender floor+walls ----------
  function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }
  World.prerender = function (m) {
    const [c, x] = G.mk(m.w * T, m.h * T);
    x.fillStyle = '#100c18'; x.fillRect(0, 0, c.width, c.height);
    for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) {
      const k = ty * m.w + tx, X = tx * T, Y = ty * T;
      if (m.tiles[k]) {
        const r = m.room[k] >= 0 ? m.rooms[m.room[k]] : null; const f = r ? r.floor : m.hallFloor, st = r ? r.style : 'tile';
        const a = f[0], b = f[1];
        if (st === 'check') { x.fillStyle = (tx + ty) % 2 ? a : b; x.fillRect(X, Y, T, T); }
        else if (st === 'plank') { x.fillStyle = a; x.fillRect(X, Y, T, T); x.fillStyle = b; x.fillRect(X, Y + 7, T, 1); x.fillRect(X, Y + 15, T, 1); x.fillRect(X + ((ty % 2) ? 4 : 11), Y, 1, 7); x.fillRect(X + ((ty % 2) ? 12 : 2), Y + 8, 1, 7); }
        else if (st === 'carpet') { x.fillStyle = a; x.fillRect(X, Y, T, T); x.fillStyle = b; for (let i = 0; i < 6; i++) x.fillRect(X + ((hash(tx * 7 + i, ty) * 16) | 0), Y + ((hash(tx, ty * 5 + i) * 16) | 0), 1, 1); }
        else if (st === 'plate') { x.fillStyle = a; x.fillRect(X, Y, T, T); x.fillStyle = b; x.fillRect(X, Y, T, 1); x.fillRect(X, Y, 1, T); x.fillStyle = G.shade(a, 1.12); x.fillRect(X + 2, Y + 2, 1, 1); x.fillRect(X + 13, Y + 13, 1, 1); }
        else { x.fillStyle = a; x.fillRect(X, Y, T, T); x.fillStyle = b; x.fillRect(X + 15, Y, 1, T); x.fillRect(X, Y + 15, T, 1); }
        // shadow under the wall above
        if (ty > 0 && !m.tiles[k - m.w]) { x.fillStyle = 'rgba(30,20,40,0.22)'; x.fillRect(X, Y, T, 4); }
      } else {
        const below = ty + 1 < m.h && m.tiles[k + m.w];
        // find owning wall colour from neighbours
        let wc = m.hallWall; for (const d of [m.w, -m.w, 1, -1, m.w + 1, m.w - 1]) { const r = m.room[k + d]; if (r >= 0) { wc = m.rooms[r].wall; break; } }
        if (below) { // wall face
          x.fillStyle = wc; x.fillRect(X, Y, T, T); x.fillStyle = G.shade(wc, 1.18); x.fillRect(X, Y, T, 3); x.fillStyle = G.shade(wc, 0.78); x.fillRect(X, Y + 14, T, 2);
          x.fillStyle = G.shade(wc, 0.9); if (tx % 2) x.fillRect(X + 3, Y + 6, 10, 1); else x.fillRect(X + 7, Y + 4, 1, 8);
        } else {
          let near = false; for (const d of [1, -1, m.w, -m.w, m.w + 1, m.w - 1, -m.w + 1, -m.w - 1]) if (m.tiles[k + d]) near = true;
          if (near) { x.fillStyle = '#2a2236'; x.fillRect(X, Y, T, T); x.fillStyle = '#3a3049'; x.fillRect(X + 1, Y + 1, T - 2, T - 2); }
        }
      }
    }
    m.bg = c; return c;
  };

  // ---------- prop sprites ----------
  const propCache = {};
  function R(x, a, b, w, h, c) { x.fillStyle = c; x.fillRect(a, b, w, h); }
  function drawPropSprite(p) {
    const key = p.k + p.w + 'x' + p.h; if (propCache[key]) return propCache[key];
    const W = p.w * T, H = p.h * T + (p.k === 'blimp' ? 8 : 0); const [c, x] = G.mk(W + 2, H + 10);
    const o = 1; // offset for outline
    switch (p.k) {
      case 'paintcans': for (let i = 0; i < p.w * 2; i++) { const cc = [P.red, P.blue, P.yellow, P.green, P.purple, P.orange][i % 6]; R(x, o + 1 + i * 8, 6, 7, 9, P.grey); R(x, o + 1 + i * 8, 6, 7, 3, cc); R(x, o + 2 + i * 8, 9, 1, 5, P.light); } break;
      case 'pipes': R(x, o, 2, W, 12, P.mid); for (let i = 0; i < 3; i++) { const cc = [P.red, P.blue, P.yellow][i]; R(x, o + 4 + i * 15, 0, 6, 14, cc); R(x, o + 3 + i * 15, 10, 8, 3, G.shade(cc, .7)); } break;
      case 'easel': R(x, o + 4, 0, 24, 18, P.brown); R(x, o + 6, 2, 20, 14, P.white); R(x, o + 9, 5, 6, 6, P.sky); R(x, o + 14, 8, 5, 5, P.pink); R(x, o + 8, 18, 2, 12, P.dbrown); R(x, o + 22, 18, 2, 12, P.dbrown); break;
      case 'gears': for (const [gx, gy, r, cc] of [[12, 14, 10, P.grey], [32, 10, 7, P.gold], [46, 18, 9, P.mid]]) { x.fillStyle = cc; for (let a = 0; a < 8; a++) { const an = a / 8 * Math.PI * 2; x.fillRect(o + gx + Math.cos(an) * r - 2, gy + Math.sin(an) * r - 2, 4, 4); } x.beginPath(); x.arc(o + gx, gy, r - 1, 0, 7); x.fill(); R(x, o + gx - 2, gy - 2, 4, 4, P.dark); } break;
      case 'lever': R(x, o + 3, 6, 10, 8, P.mid); R(x, o + 5, 8, 6, 4, P.dark); break;
      case 'conveyor': R(x, o, 4, W, 10, P.dark); for (let i = 0; i < W; i += 6) R(x, o + i, 5, 3, 8, P.mid); R(x, o, 4, W, 1, P.grey); break;
      case 'crate': R(x, o, 0, W, H, P.tan); R(x, o + 1, 1, W - 2, H - 2, P.brown); R(x, o + 2, 2, W - 4, H - 4, P.tan); for (let i = 0; i < W; i += 4) R(x, o + i, i * H / W, 2, 2, P.brown); break;
      case 'shelf': R(x, o, 0, W, 16, P.dbrown); for (let row = 0; row < 2; row++) for (let i = 1; i < W - 2; i += 3) R(x, o + i, 1 + row * 8, 2, 6, [P.red, P.blue, P.green, P.yellow, P.purple, P.sky][((i * 7 + row) % 6)]); R(x, o, 7, W, 1, P.brown); break;
      case 'desk': R(x, o, 4, W, 10, P.brown); R(x, o, 4, W, 2, P.tan); R(x, o + 6, 1, 18, 5, P.sky); R(x, o + 8, 2, 14, 1, P.white); R(x, o + 8, 4, 10, 1, P.white); break;
      case 'button': R(x, o + 2, 4, 12, 10, P.grey); R(x, o + 4, 3, 8, 6, P.red); R(x, o + 5, 3, 3, 2, '#ff9a9a'); break;
      case 'plant': R(x, o + 4, 9, 8, 7, P.orange); R(x, o + 3, 9, 10, 2, G.shade(P.orange, .8)); x.fillStyle = P.green; for (const [a, b] of [[6, 0], [2, 3], [10, 2], [5, 5], [9, 6]]) x.fillRect(o + a, b, 4, 4); break;
      case 'yarnbasket': R(x, o + 2, 6, W - 4, 9, P.tan); for (let i = 0; i < 3; i++) { x.fillStyle = [P.red, P.sky, P.lime][i]; x.beginPath(); x.arc(o + 9 + i * 7, 6, 4, 0, 7); x.fill(); } break;
      case 'blockbin': R(x, o + 1, 4, W - 2, 11, P.dbrown); for (let i = 0; i < 6; i++) R(x, o + 3 + i * 5, 2 + (i % 2) * 2, 4, 4, [P.red, P.blue, P.yellow][i % 3]); break;
      case 'oven': R(x, o, 0, W, 15, P.grey); R(x, o + 3, 4, W - 6, 8, P.dark); R(x, o + 5, 6, W - 10, 4, P.orange); R(x, o + 4, 1, 4, 2, P.red); R(x, o + 24, 1, 4, 2, P.red); break;
      case 'candymachine': R(x, o + 4, 0, 24, 18, P.pink); R(x, o + 7, 2, 18, 12, P.light); for (let i = 0; i < 9; i++) R(x, o + 8 + (i % 3) * 6, 3 + Math.floor(i / 3) * 4, 3, 3, [P.red, P.yellow, P.sky, P.lime][i % 4]); R(x, o + 8, 18, 16, 12, G.shade(P.pink, .8)); R(x, o + 14, 22, 4, 4, P.dark); break;
      case 'counter': R(x, o, 2, W, 12, P.white); R(x, o, 2, W, 3, P.pink); for (let i = 4; i < W; i += 14) { R(x, o + i, 6, 8, 6, P.cream); R(x, o + i + 1, 4, 6, 3, P.pink); } break;
      case 'blimp': {
        x.fillStyle = P.ink; x.beginPath(); x.ellipse(o + W / 2, 22, W / 2 - 4, 19, 0, 0, 7); x.fill();
        x.fillStyle = '#e8c56a'; x.beginPath(); x.ellipse(o + W / 2, 21, W / 2 - 6, 17, 0, 0, 7); x.fill();
        x.fillStyle = '#f4dc94'; x.beginPath(); x.ellipse(o + W / 2 - 10, 15, W / 2 - 30, 8, 0, 0, 7); x.fill();
        for (let i = 1; i < 6; i++) R(x, o + 8 + i * (W - 16) / 6, 6, 1, 32, '#c9a24a');
        R(x, o + W / 2 - 30, 38, 60, 12, P.brown); R(x, o + W / 2 - 28, 40, 56, 6, P.dbrown); for (let i = 0; i < 6; i++) R(x, o + W / 2 - 26 + i * 9, 41, 5, 4, P.sky);
        R(x, o + W - 18, 10, 12, 24, P.red); R(x, o + 8, 20, 6, 4, P.dark); // fin + cannon
        G.ctx; break;
      }
      case 'compass': R(x, o + 2, 2, 12, 12, P.gold); R(x, o + 4, 4, 8, 8, P.white); R(x, o + 7, 5, 2, 3, P.red); R(x, o + 7, 8, 2, 3, P.blue); break;
      case 'table': x.fillStyle = P.ink; x.beginPath(); x.ellipse(o + W / 2, H / 2 + 2, W / 2, H / 2 - 2, 0, 0, 7); x.fill(); x.fillStyle = P.brown; x.beginPath(); x.ellipse(o + W / 2, H / 2, W / 2 - 1, H / 2 - 4, 0, 0, 7); x.fill(); x.fillStyle = P.tan; x.beginPath(); x.ellipse(o + W / 2, H / 2 - 2, W / 2 - 5, H / 2 - 8, 0, 0, 7); x.fill(); break;
      case 'musicbox': R(x, o + 2, 2, W - 4, 13, P.purple); R(x, o + 4, 4, W - 8, 7, P.pink); R(x, o + W - 4, 6, 4, 2, P.gold); R(x, o + 12, 0, 8, 3, P.gold); break;
      case 'piano': R(x, o, 0, W, 22, P.ink); R(x, o + 2, 14, W - 4, 6, P.white); for (let i = 4; i < W - 4; i += 4) R(x, o + i, 14, 1, 6, P.ink), (i % 8 === 4 && R(x, o + i + 1, 14, 2, 3, P.ink)); R(x, o + 4, 2, W - 8, 10, P.dark); break;
      case 'drum': R(x, o + 2, 4, 12, 10, P.red); R(x, o + 2, 3, 12, 3, P.white); for (let i = 3; i < 14; i += 3) R(x, o + i, 7, 1, 6, P.gold); break;
      case 'console': R(x, o, 4, W, 11, P.dark); for (let i = 0; i < 4; i++) { R(x, o + 3 + i * 15, 0, 12, 9, P.ink); R(x, o + 4 + i * 15, 1, 10, 7, '#3f8f6a'); } for (let i = 2; i < W; i += 5) R(x, o + i, 11, 2, 2, [P.red, P.yellow, P.lime][i % 3]); break;
      case 'reader': R(x, o + 4, 2, 8, 12, P.grey); R(x, o + 5, 4, 6, 3, P.lime); R(x, o + 4, 9, 8, 1, P.ink); break;
      case 'ringpeg': R(x, o + 7, 0, 2, 14, P.brown); R(x, o + 2, 12, 12, 3, P.dbrown); R(x, o + 4, 9, 8, 3, P.red); R(x, o + 5, 6, 6, 3, P.yellow); break;
      case 'toyshelf': R(x, o, 0, W, 15, P.tan); R(x, o + 1, 1, W - 2, 6, P.dbrown); R(x, o + 1, 8, W - 2, 6, P.dbrown); for (let i = 0; i < 8; i++) R(x, o + 3 + i * 5, 2 + (i % 2) * 7, 3, 4, [P.red, P.sky, P.yellow, P.lime, P.pink][i % 5]); break;
      case 'boiler': R(x, o + 4, 0, W - 8, H, P.dred); R(x, o + 6, 2, W - 12, H - 4, P.red); for (let i = 8; i < H; i += 8) R(x, o + 4, i, W - 8, 1, P.dred); R(x, o + W / 2 - 6, 8, 12, 12, P.white); R(x, o + W / 2 - 1, 10, 2, 6, P.ink); R(x, o + W / 2 - 4, H - 8, 8, 6, P.orange); break;
      case 'pipesv': R(x, o + 4, 0, 6, 16, P.grey); R(x, o + 18, 0, 6, 16, P.grey); R(x, o + 2, 10, 24, 4, P.mid); break;
      case 'toybox': R(x, o + 1, 6, 14, 9, P.blue); R(x, o + 2, 8, 12, 2, P.yellow); R(x, o, 3, 16, 4, P.dblue); R(x, o + 6, 10, 4, 3, P.red); break;
      case 'jukebox': R(x, o + 2, 0, W - 4, 16, P.purple); x.fillStyle = P.pink; x.beginPath(); x.arc(o + W / 2, 6, 12, Math.PI, 0); x.fill(); R(x, o + 8, 4, W - 16, 8, P.yellow); for (let i = 10; i < W - 10; i += 3) R(x, o + i, 5, 1, 6, P.orange); R(x, o + 6, 13, W - 12, 2, P.gold); break;
      case 'mirror': R(x, o + 4, 0, W - 8, 16, P.gold); R(x, o + 6, 2, W - 12, 12, P.sky); R(x, o + 8, 3, 3, 8, P.white); break;
      case 'rug': R(x, o, 0, W, H, P.dred); R(x, o + 3, 3, W - 6, H - 6, P.red); R(x, o + 6, 6, W - 12, H - 12, P.orange); R(x, o + 10, 10, W - 20, H - 20, P.yellow); break;
      default: R(x, o, 0, W, H, P.mid);
    }
    let cv = c; if (p.k !== 'rug') cv = G.outline(c, P.ink);
    propCache[key] = cv; return cv;
  }
  World.propSprite = drawPropSprite;

  // draw visible map (bg + props); state: {t, rattle:{propId:t}, chuteWobble:{i:t}, jam, lights, switches, melt, me}
  World.draw = function (m, camx, camy, st) {
    const ctx = G.ctx; camx = Math.round(camx); camy = Math.round(camy);
    if (!m.bg) World.prerender(m);
    ctx.fillStyle = '#100c18'; ctx.fillRect(0, 0, G.W, G.H);
    ctx.drawImage(m.bg, camx, camy, G.W, G.H, 0, 0, G.W, G.H);
    // jammed doors
    if (st.jam != null && m.doors[st.jam]) for (const k of m.doors[st.jam]) {
      const X = (k % m.w) * T - camx, Y = Math.floor(k / m.w) * T - camy; if (X < -T || Y < -T || X > G.W || Y > G.H) continue;
      G.rect(X, Y, T, T, P.dark); G.rect(X + 1, Y + 1, T - 2, T - 2, (((st.t * 4) | 0) % 2) ? P.yellow : P.ink); for (let i = 0; i < T; i += 4) G.rect(X + i, Y + 6, 2, 4, P.ink);
    }
    for (const p of m.props) {
      const s = drawPropSprite(p); let X = p.x * T - 1 - camx, Y = p.y * T - camy - (p.k === 'blimp' ? 6 : 0);
      if (X > G.W || Y > G.H || X + s.width < 0 || Y + s.height < 0) continue;
      const rt = st.rattle && st.rattle[p.id]; if (rt && rt > 0) { X += Math.round(Math.sin(st.t * 60) * 2); Y += Math.round(Math.cos(st.t * 47)); }
      if (p.k === 'blimp') Y += Math.round(Math.sin(st.t * 1.5) * 1.5);
      if (p.k === 'toybox' && p.chute != null && st.chuteWobble && st.chuteWobble[p.chute] > 0) { Y -= Math.round(Math.abs(Math.sin(st.t * 30)) * 2); }
      ctx.drawImage(s, X, Y);
      if (p.k === 'lever') { const sw = st.switches && st.lights; const on = !sw || sw[p.sw != null ? p.sw : (p.x < 20 ? 1 : 0)]; G.rect(X + 7, Y + (on ? 1 : 7), 3, 7, on ? P.lime : P.red); }
      if (p.k === 'button' && st.melt) { if (((st.t * 3) | 0) % 2) G.rect(X + 4, Y + 3, 9, 7, '#ffeb3b'); }
      if (p.k === 'table' && m.kind === 'workshop') { // meeting bell on top
        const bx = X + s.width / 2, by = Y + 10; G.rect(bx - 5, by + 2, 11, 8, P.gold); G.rect(bx - 6, by + 9, 13, 2, P.ink); G.rect(bx - 3, by, 7, 3, P.gold); G.rect(bx - 1, by - 2, 3, 2, P.ink); G.rect(bx - 3, by + 3, 2, 4, P.yellow);
      }
      if (p.k === 'jukebox') { if (((st.t * 2) | 0) % 2) G.text('♥', X + p.w * T - 2, Y - 8 + Math.round(Math.sin(st.t * 4) * 2), P.pink); }
    }
  };
})();
