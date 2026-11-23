// ISOSCELATED - the Toy Workshop map (tiles, rooms, props, stations), collision and map drawing.
'use strict';
const World = {};
(function () {
  const T = 16; World.T = T;
  const CENTRES = ['blimp', 'drawbridge', 'dragonboat', 'timemachine'];
  const P = G.P;
  // task kinds (mini-games) with their station room/prop
  World.TASKS = {
    pipes: 'Connect pipes', gears: 'Match gears', code: 'Blueprint code', yarn: 'Untangle yarn', sort: 'Sort blocks',
    cupcake: 'Frost cupcake', compass: 'Aim compass', windbox: 'Wind music box', keycard: 'Swipe keycard', rings: 'Stack rings',
    matchtoys: 'Match 3 toys', gauge: 'Fill boiler', candy: 'Refill candy', memory: 'Memory relay', sequence: 'Number circuit'
  };
  World.TASK_KEYS = Object.keys(World.TASKS);
  // ---------- QUICK CHAT: the only way to talk (no typing = nothing mean can be typed) ----------
  // c: tab. {N} = a player's name the sender picks (only real players in the lobby can be chosen).
  World.QUICK = [
    { c: 'say', t: 'Where are you?' }, { c: 'say', t: 'Follow me!' }, { c: 'say', t: "I'm doing chores" }, { c: 'say', t: 'Help!' },
    { c: 'say', t: 'Over here!' }, { c: 'say', t: 'Stick together!' }, { c: 'say', t: 'I saw something!' }, { c: 'say', t: 'Nice!' },
    { c: 'say', t: 'Skip the vote?' }, { c: 'say', t: 'I need more proof.' },
    // approval: smart geometry comebacks
    { c: 'agree', t: 'Your argument fits inside the equal angles of a square!' },
    { c: 'agree', t: 'That adds up to a perfect 180 degrees!' },
    { c: 'agree', t: "Right angle! You're right!" },
    { c: 'agree', t: "That's parallel with my thinking!" },
    { c: 'agree', t: 'Your logic checks out from every vertex!' },
    { c: 'agree', t: 'Perfectly symmetrical reasoning!' },
    // denial: smart geometry comebacks
    { c: 'deny', t: "That does not fit inside Pythagoras's theorem!" },
    { c: 'deny', t: "Your angles don't add up!" },
    { c: 'deny', t: 'That story has more holes than a donut!' },
    { c: 'deny', t: "That's not even a little bit congruent!" },
    { c: 'deny', t: 'Sounds pretty obtuse to me!' },
    { c: 'deny', t: "That's as pointless as a circle!" },
    // who: pick (or type) a player's name
    { c: 'who', t: "It's {N}!" }, { c: 'who', t: '{N} is sus!' }, { c: 'who', t: 'I trust {N}.' }, { c: 'who', t: 'Vote {N}!' },
    { c: 'who', t: 'Where is {N}?' }, { c: 'who', t: 'I was with {N}.' }, { c: 'who', t: 'I saw {N} near the piece!' },
    // pixel emotes
    { c: 'emote', e: 'thumbs' }, { c: 'emote', e: 'question' }, { c: 'emote', e: 'heart' }, { c: 'emote', e: 'laugh' }, { c: 'emote', e: 'shocked' },
  ];
  World.quickText = (q, name) => { const e = World.QUICK[q]; if (!e) return ''; return e.e ? '' : e.t.replace('{N}', name || '???'); };

  function makeMap(w, h) { return { w, h, tiles: new Uint8Array(w * h), room: new Int8Array(w * h).fill(-1), solid: new Uint16Array(w * h), rooms: [], props: [], stations: [], doors: {}, chutes: [], cams: [], seats: [] }; }
  function carve(m, x, y, w, h, roomIdx) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { m.tiles[j * m.w + i] = 1; if (roomIdx != null) m.room[j * m.w + i] = roomIdx; } }
  function prop(m, k, x, y, w, h, solid, extra) { const p = Object.assign({ id: m.props.length, k, x, y, w: w || 1, h: h || 1, solid: solid !== false }, extra || {}); m.props.push(p); if (p.solid) for (let j = y; j < y + p.h; j++) for (let i = x; i < x + p.w; i++) m.solid[j * m.w + i] = p.id + 1; return p; } // solid = which prop (id+1)
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

  // ===================== MAP THEMES =====================
  // Every map is the same proven floor plan, flipped (so routes differ), with its own rooms, colours, props and quests.
  World.MAPS = {
    workshop: {
      name: 'Toy Workshape', flip: [0, 0],
      names: ['Paint Shape Shop', 'Gear Square', 'Library of Blue-prisms', 'Storage Atti-cube', 'Candy Cone Kitchen', 'Blimp Dock-agon', 'Music Cube Hall', 'Security Square', 'Toy Triangle Lab', 'Boiler Cylinder'], goal: 'Finish your chores to power the escape BLIMP.', win: 'The blimp launched! All chores done!', centre: 'blimp',
      hall: [['#d6cfc0', '#cdc5b4'], '#8b8174'], props: {}, quests: null, cams: ['Blimp Dock', 'Gear Hall', 'Candy Hall', 'Boiler Hall']
    },
    castle: {
      name: 'Cube-a-lot Castle', flip: [1, 0], layout: { seed: 1171, cols: 4, rows: 3, empty: [0, 3], meet: 5, loops: 0.35 }, // a keep with towers
      names: ['Banner Hexhall', 'Blacksphere Smithy', 'Library Tri-tower', 'Trapezoid Treasury', 'Great Kite-chen', 'Throne Rhombus', 'Minstrel Oval', 'Watch Prism', 'Royal Stable-gon', 'Dun-cone'], goal: 'Finish your quests to lower the DRAWBRIDGE and escape.', win: 'The drawbridge came down! Everyone escaped!', centre: 'drawbridge',
      hall: [['#a9a39a', '#9c958b'], '#5e5a63'],
      rooms: [['Banner Hall', ['#b7a58a', '#a99678'], '#7a3b3b', 'plank'], ['Blacksmith', ['#8e8a86', '#827d79'], '#4d4a52', 'plate'], ['Library Tower', ['#9b8366', '#8e775b'], '#5b4636', 'carpet'],
        ['Treasury', ['#d9c17a', '#cdb46a'], '#7d6327', 'check'], ['Great Kitchen', ['#c7b49a', '#bba68a'], '#7a5a3c', 'tile'], ['Throne Room', ['#b03a46', '#a2323d'], '#55505f', 'carpet'],
        ['Minstrel Hall', ['#a7927e', '#9a8571'], '#5a3d55', 'plank'], ['Watchtower', ['#9a9a9a', '#8d8d8d'], '#4a4a55', 'plate'], ['Royal Stables', ['#c4a55f', '#b89752'], '#6b5530', 'plank'], ['Dungeon', ['#6d6a72', '#625f67'], '#2f2d35', 'plate']],
      props: { plant: 'torch', shelf: 'banner', crate: 'barrel', drum: 'armor', piano: 'throne', conveyor: 'tapestry', easel: 'shieldrack', toybox: 'chest', counter: 'longtable', table: 'roundtable' },
      quests: { pipes: 'Tie the banners', gears: 'Fix drawbridge', code: 'Crack vault lock', yarn: 'Mend tapestry', sort: 'Sort the armour', cupcake: 'Ice royal cake', compass: 'Aim catapult', windbox: 'Ring the bells', keycard: 'Slide gate key', rings: 'Stack shields', matchtoys: 'Match 3 goblets', gauge: 'Fill the moat', candy: 'Stock larder' },
      cams: ['Throne Room', 'Smithy Hall', 'Kitchen Hall', 'Dungeon Hall']
    },
    palace: {
      name: 'Pentagoda Palace', flip: [0, 1], layout: { seed: 5150, cols: 5, rows: 3, empty: [0, 4, 10, 12, 14], meet: 7, loops: 0.25 }, // long and wide
      names: ['Koi Circle Garden', 'Water Wheel Ring', 'Scroll Cylibrary', 'Treasure Cube Vault', 'Tea-rapezoid Room', 'Great Hexa-hall', 'Taiko Cylinder', 'Pagoda Prism', 'Dojo-decagon', 'Bath Oval'], goal: 'Finish your tasks to launch the DRAGON BOAT and sail away.', win: 'The dragon boat set sail! Everyone escaped!', centre: 'dragonboat',
      hall: [['#d8c9a0', '#cdbd92'], '#7a2e2e'],
      rooms: [['Koi Garden', ['#a9d18e', '#9cc481'], '#3f6b3a', 'carpet'], ['Water Wheel Room', ['#c9b48d', '#bea880'], '#6b3a2a', 'plank'], ['Scroll Library', ['#d9c7a0', '#cdbb92'], '#7a2e2e', 'plank'],
        ['Treasure Vault', ['#d8b65a', '#cca94d'], '#5c2a2a', 'check'], ['Tea Kitchen', ['#cfdcb0', '#c3d1a3'], '#6b3a2a', 'tile'], ['Great Hall', ['#d6cfa2', '#cac294'], '#a3303a', 'tile'],
        ['Taiko Hall', ['#c99a7a', '#bd8e6e'], '#7a2e2e', 'plank'], ['Watch Tower', ['#b9b0a0', '#ada493'], '#4a3a3a', 'plate'], ['Dojo', ['#d8cf9a', '#ccc28c'], '#6b3a2a', 'tile'], ['Bath House', ['#a8cfd8', '#9bc3cc'], '#3a6b78', 'check']],
      props: { plant: 'bonsai', shelf: 'scrolls', crate: 'lacquerbox', drum: 'taiko', piano: 'koto', conveyor: 'bamboo', easel: 'foldscreen', toybox: 'basket', counter: 'lowtable', table: 'roundtable', paintcans: 'lanterns' },
      quests: { pipes: 'Bamboo pipes', gears: 'Fix water wheel', code: 'Open puzzle box', yarn: 'Untangle kite', sort: 'Sort the mochi', cupcake: 'Paint the fan', compass: 'Point the compass', windbox: 'Play the taiko', keycard: 'Slide shoji door', rings: 'Stack lanterns', matchtoys: 'Match 3 dolls', gauge: 'Fill the bath', candy: 'Fill rice bowls' },
      cams: ['Great Hall', 'Wheel Hall', 'Tea Hall', 'Bath Hall']
    },
    jurassic: {
      name: 'Tri-ceratops Manor', flip: [1, 1], layout: { seed: 3003, cols: 4, rows: 4, empty: [1, 3, 8, 11, 12, 15], meet: 10, loops: 0.4 }, // sprawling
      names: ['Fossil Polygon Lab', 'Crane Cube', 'Map Parallelogram', 'Egg-lipse Nursery', 'Dino Kite-chen', 'Grand Hexa-hall', 'Music Rhombus', 'Look-octagon', 'Trophy Trapezoid', 'Volcan-cone Cellar'], goal: 'Finish your jobs to power the TIME MACHINE and escape.', win: 'The time machine fired up! Everyone escaped!', centre: 'timemachine',
      hall: [['#a7b58a', '#9aa87d'], '#4d3b2a'],
      rooms: [['Fossil Lab', ['#d8c7a0', '#ccbb92'], '#5c4630', 'tile'], ['Crane Room', ['#a39a8a', '#978e7e'], '#4a4035', 'plate'], ['Map Room', ['#b99a72', '#ad8e66'], '#4d3b2a', 'carpet'],
        ['Egg Nursery', ['#e8d9a8', '#ddcd9a'], '#7a5a2a', 'check'], ['Dino Kitchen', ['#c7d1a3', '#bbc596'], '#4d5a2a', 'tile'], ['Grand Hall', ['#8fb37a', '#83a76e'], '#3e5a2e', 'carpet'],
        ['Music Room', ['#b59ac2', '#a98eb6'], '#4d3b5a', 'plank'], ['Lookout', ['#a6a6a0', '#9a9a93'], '#3e3e38', 'plate'], ['Trophy Room', ['#c9a06a', '#bd945e'], '#5c3a1e', 'plank'], ['Volcano Cellar', ['#9a6a5a', '#8e5e4e'], '#4a1e1e', 'plate']],
      props: { plant: 'fern', shelf: 'fossilshelf', crate: 'eggnest', drum: 'bones', piano: 'skull', conveyor: 'vines', easel: 'dinomap', toybox: 'log', counter: 'longtable', table: 'roundtable' },
      quests: { pipes: 'Sprinkler pipes', gears: 'Fix fossil crane', code: 'Unlock egg vault', yarn: 'Untangle vines', sort: 'Sort dino eggs', cupcake: 'Trace the fossil', compass: 'Aim telescope', windbox: 'Calm the raptor', keycard: 'Swipe gate pass', rings: 'Stack the bones', matchtoys: 'Match footprints', gauge: 'Fill cooling tank', candy: 'Feed baby dinos' },
      cams: ['Grand Hall', 'Crane Hall', 'Kitchen Hall', 'Cellar Hall']
    },
  };
  World.MAP_IDS = Object.keys(World.MAPS);
  World.questName = (m, k) => (m && m.quests && m.quests[k]) || World.TASKS[k];
  // flip a finished map left-right and/or top-bottom (keeps everything reachable, changes every route)
  function flipMap(m, fx, fy) {
    if (!fx && !fy) return m;
    const stationRoom = s => { s.room = m.room[Math.floor(s.y / T) * m.w + Math.floor(s.x / T)]; };
    const W = m.w, H = m.h, mapI = k => { const x = k % W, y = (k / W) | 0; return (fy ? H - 1 - y : y) * W + (fx ? W - 1 - x : x); };
    for (const key of ['tiles', 'room', 'solid']) { const a = m[key], b = new a.constructor(a.length); for (let k = 0; k < a.length; k++) b[mapI(k)] = a[k]; m[key] = b; }
    const R = r => { if (fx) r.x = W - r.x - r.w; if (fy) r.y = H - r.y - r.h; };
    const Pt = o => { if (fx) o.x = W * T - o.x; if (fy) o.y = H * T - o.y; };
    m.rooms.forEach(R); m.props.forEach(R); m.stations.forEach(Pt); m.chutes.forEach(Pt); m.cams.forEach(Pt);
    m.seats = m.seats.map(([x, y]) => [fx ? W * T - x : x, fy ? H * T - y : y]); m.spawn = [fx ? W * T - m.spawn[0] : m.spawn[0], fy ? H * T - m.spawn[1] : m.spawn[1]];
    const nd = {}; for (const r in m.doors) nd[r] = m.doors[r].map(mapI); m.doors = nd;
    m.stations.forEach(stationRoom); m.chutes.forEach(stationRoom);
    return m;
  }
  // ---------- MINOTAUR MAZE: a friendly garden hedge maze (seeded, so every player builds the same one) ----------
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  World.buildMaze = function (seed) {
    const R = mulberry(seed | 0), CW = 17, CH = 11, w = CW * 3 + 1, h = CH * 3 + 1;
    const m = makeMap(w, h); m.kind = 'maze'; m.theme = 'maze'; m.title = 'The Octa-maze'; m.hedge = true;
    m.hallFloor = ['#9ccf6a', '#90c45e']; m.hallWall = '#2f7a3a';
    m.rooms.push({ i: 0, name: 'Hedge-agon Maze', x: 0, y: 0, w, h, floor: ['#a6d673', '#9acb66'], wall: '#2f7a3a', style: 'check' });
    const cellX = c => 1 + c * 3, open = (x, y, ww, hh) => carve(m, x, y, ww, hh, 0);
    const seen = new Uint8Array(CW * CH), stack = [], cx0 = CW >> 1, cy0 = CH >> 1, links = [];
    const link = (a, b) => { links.push([a, b]); const ax = a % CW, ay = (a / CW) | 0, bx = b % CW, by = (b / CW) | 0; open(Math.min(cellX(ax), cellX(bx)), Math.min(cellX(ay), cellX(by)), Math.abs(ax - bx) * 3 + 2, Math.abs(ay - by) * 3 + 2); };
    for (let c = 0; c < CW * CH; c++) open(cellX(c % CW), cellX((c / CW) | 0), 2, 2);
    // carve a perfect maze (recursive backtracker) from the centre
    let cur = cy0 * CW + cx0; seen[cur] = 1; stack.push(cur);
    while (stack.length) {
      cur = stack[stack.length - 1]; const x = cur % CW, y = (cur / CW) | 0, nb = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < CW && ny < CH && !seen[ny * CW + nx]) nb.push(ny * CW + nx); }
      if (!nb.length) { stack.pop(); continue; }
      const n = nb[Math.floor(R() * nb.length)]; seen[n] = 1; link(cur, n); stack.push(n);
    }
    // extra openings make loops, so runners can circle around the Minotaur
    for (let i = 0; i < CW * CH * 0.14; i++) { const x = Math.floor(R() * (CW - 1)), y = Math.floor(R() * (CH - 1)), a = y * CW + x; link(a, R() < 0.5 ? a + 1 : a + CW); }
    // the open plaza in the middle (where everyone starts and the Minotaur waits)
    open(cellX(cx0 - 1), cellX(cy0 - 1), 8, 8);
    // distances from the centre (for keys + exit far away)
    const adj = Array.from({ length: CW * CH }, () => []); for (const [a, b] of links) { adj[a].push(b); adj[b].push(a); }
    for (let y = cy0 - 1; y <= cy0 + 1; y++) for (let x = cx0 - 1; x <= cx0 + 1; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) if (x + dx <= cx0 + 1 && y + dy <= cy0 + 1) { adj[y * CW + x].push((y + dy) * CW + x + dx); adj[(y + dy) * CW + x + dx].push(y * CW + x); }
    const dist = new Int16Array(CW * CH).fill(-1), q = [cy0 * CW + cx0]; dist[q[0]] = 0;
    while (q.length) { const c = q.shift(); for (const n of adj[c]) if (dist[n] < 0) { dist[n] = dist[c] + 1; q.push(n); } }
    const centre = c => [(cellX(c % CW) + 1) * T, (cellX((c / CW) | 0) + 1) * T + 4];
    // exit: the farthest cell on the outer edge, with a gate through the hedge
    let ex = -1; for (let c = 0; c < CW * CH; c++) { const x = c % CW, y = (c / CW) | 0; if (x === 0 || y === 0 || x === CW - 1 || y === CH - 1) if (ex < 0 || dist[c] > dist[ex]) ex = c; }
    const exX = ex % CW, exY = (ex / CW) | 0; let gx, gy, gw = 2, gh = 2;
    if (exX === 0) { gx = 0; gy = cellX(exY); gw = 1; } else if (exX === CW - 1) { gx = w - 1; gy = cellX(exY); gw = 1; } else if (exY === 0) { gx = cellX(exX); gy = 0; gh = 1; } else { gx = cellX(exX); gy = h - 1; gh = 1; }
    open(gx, gy, gw, gh); m.gate = []; for (let j = gy; j < gy + gh; j++) for (let i = gx; i < gx + gw; i++) m.gate.push(j * w + i);
    m.exit = { x: (gx + gw / 2) * T, y: (gy + gh / 2) * T + 4 }; m.gateOpen = false;
    // 3 golden keys at far-apart dead ends
    const ends = []; for (let c = 0; c < CW * CH; c++) if (adj[c].length === 1 && c !== ex) ends.push(c);
    ends.sort((a, b) => dist[b] - dist[a]); const keys = [];
    for (const c of ends) { if (keys.length >= 3) break; const [x, y] = centre(c); if (keys.every(k => Math.hypot(k.x - x, k.y - y) > 9 * T) && Math.hypot(x - m.exit.x, y - m.exit.y) > 6 * T) keys.push({ x, y }); }
    for (const c of ends) { if (keys.length >= 3) break; const [x, y] = centre(c); if (!keys.some(k => k.x === x && k.y === y)) keys.push({ x, y }); }
    m.keys = keys;
    m.spawn = centre(cy0 * CW + cx0); m.seats = [];
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; m.seats.push([Math.round(m.spawn[0] + Math.cos(a) * 52), Math.round(m.spawn[1] + Math.sin(a) * 44)]); }
    m.minoStart = [m.spawn[0], m.spawn[1]];
    // a few flower pots in the plaza
    m.cams = []; m.chutes = [];
    return m;
  };

  // ---------- generated layouts: every themed map gets its OWN floor plan ----------
  // Room roles follow the Workshape (index = role): 0 pipes+chute, 1 gears+switch, 2 code+meltdown btn+chute, 3 yarn+sort+chute,
  // 4 cupcake+candy+switch+chute, 5 MEETING (centrepiece, table, bell, compass), 6 music box, 7 cameras+keycard, 8 rings+toys+chute, 9 gauge+meltdown btn+chute.
  const ROLE_ITEMS = [
    [['pipes', 3, 'task', 'pipes'], ['paintcans', 2], ['easel', 2]],
    [['gears', 4, 'task', 'gears'], ['lever', 1, 'switch', 0], ['conveyor', 4]],
    [['desk', 3, 'task', 'code'], ['button', 1, 'melt', 1], ['shelf', 4], ['plant', 1]],
    [['yarnbasket', 2, 'task', 'yarn'], ['blockbin', 2, 'task', 'sort'], ['crate', 2]],
    [['oven', 2, 'task', 'cupcake'], ['candymachine', 2, 'task', 'candy'], ['lever', 1, 'switch', 1], ['counter', 4]],
    null,
    [['musicbox', 2, 'task', 'windbox'], ['piano', 3], ['drum', 1], ['drum', 1]],
    [['console', 3, 'cams'], ['reader', 1, 'task', 'keycard']],
    [['ringpeg', 1, 'task', 'rings'], ['toyshelf', 3, 'task', 'matchtoys'], ['conveyor', 4]],
    [['boiler', 4, 'task', 'gauge'], ['button', 1, 'melt', 0], ['pipesv', 2]],
  ];
  const CHUTE_ROOMS = [0, 2, 3, 4, 8, 9];
  World.genLayout = function (L) {
    const R = mulberry(L.seed), SW = 19, SH = 17, w = L.cols * SW + 4, h = L.rows * SH + 4;
    const m = makeMap(w, h); m.kind = 'workshop'; m.generated = true;
    const slots = []; for (let i = 0; i < L.cols * L.rows; i++) if (!L.empty.includes(i)) slots.push(i);
    if (slots.length !== 10) throw new Error('layout needs exactly 10 rooms');
    // which room goes in which slot: the meeting hall in its slot, the rest shuffled by the seed
    const roles = [0, 1, 2, 3, 4, 6, 7, 8, 9]; for (let i = roles.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [roles[i], roles[j]] = [roles[j], roles[i]]; }
    const slotOf = {}; let ri = 0; for (const sl of slots) slotOf[sl === L.meet ? 5 : roles[ri++]] = sl;
    for (let role = 0; role < 10; role++) {
      const sl = slotOf[role], cx = sl % L.cols, cy = Math.floor(sl / L.cols), big = role === 5;
      const rw = big ? SW - 2 : 11 + Math.floor(R() * 5), rh = big ? SH - 2 : 9 + Math.floor(R() * 4);
      const x = 2 + cx * SW + Math.floor((SW - rw) / 2) + (big ? 0 : Math.floor((R() - 0.5) * (SW - rw - 2))), y = 2 + cy * SH + Math.floor((SH - rh) / 2) + (big ? 0 : Math.floor((R() - 0.5) * (SH - rh - 2)));
      m.rooms[role] = { i: role, name: '', x, y, w: rw, h: rh, floor: ['#ccc', '#bbb'], wall: '#777', style: 'tile' };
    }
    m.rooms.forEach((r, i) => carve(m, r.x, r.y, r.w, r.h, i));
    // corridors between neighbouring rooms: a random spanning tree + a few extra loops
    const bySlot = {}; for (let role = 0; role < 10; role++) bySlot[slotOf[role]] = role;
    const edges = []; for (const sl of slots) { const cx = sl % L.cols, cy = Math.floor(sl / L.cols); if (cx + 1 < L.cols && bySlot[sl + 1] != null) edges.push([bySlot[sl], bySlot[sl + 1], 'h']); if (cy + 1 < L.rows && bySlot[sl + L.cols] != null) edges.push([bySlot[sl], bySlot[sl + L.cols], 'v']); }
    for (let i = edges.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [edges[i], edges[j]] = [edges[j], edges[i]]; }
    const par = [...Array(10).keys()], find = a => par[a] === a ? a : (par[a] = find(par[a]));
    const used = []; for (const e of edges) { if (find(e[0]) !== find(e[1])) { par[find(e[0])] = find(e[1]); used.push(e); } else if (R() < L.loops) used.push(e); }
    const corridor = (a, b, dir) => {
      const A = m.rooms[a], B = m.rooms[b];
      if (dir === 'h') { // A is left of B
        const lo = Math.max(A.y, B.y), hi = Math.min(A.y + A.h, B.y + B.h) - 3;
        if (hi >= lo) { const y = lo + Math.floor(R() * (hi - lo + 1)); carve(m, A.x + A.w, y, B.x - (A.x + A.w), 3); }
        else { const ay = A.y + Math.floor(A.h / 2) - 1, by = B.y + Math.floor(B.h / 2) - 1, mx = Math.floor((A.x + A.w + B.x) / 2) - 1; carve(m, A.x + A.w, ay, mx - (A.x + A.w) + 3, 3); carve(m, mx, Math.min(ay, by), 3, Math.abs(ay - by) + 3); carve(m, mx, by, B.x - mx, 3); }
      } else { // A is above B
        const lo = Math.max(A.x, B.x), hi = Math.min(A.x + A.w, B.x + B.w) - 3;
        if (hi >= lo) { const x = lo + Math.floor(R() * (hi - lo + 1)); carve(m, x, A.y + A.h, 3, B.y - (A.y + A.h)); }
        else { const ax = A.x + Math.floor(A.w / 2) - 1, bx = B.x + Math.floor(B.w / 2) - 1, my = Math.floor((A.y + A.h + B.y) / 2) - 1; carve(m, ax, A.y + A.h, 3, my - (A.y + A.h) + 3); carve(m, Math.min(ax, bx), my, Math.abs(ax - bx) + 3, 3); carve(m, bx, my, 3, B.y - my); }
      }
    };
    if (new Set([...Array(10).keys()].map(find)).size !== 1) throw new Error('layout rooms are not all connected');
    for (const e of used) corridor(e[0], e[1], e[2]);
    // door cells
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const k = y * m.w + x; if (!m.tiles[k] || m.room[k] >= 0) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r = m.room[(y + dy) * m.w + x + dx]; if (r >= 0) { (m.doors[r] = m.doors[r] || []).push(k); break; } } }
    // keep props away from doorways (2 tiles)
    const reserved = new Uint8Array(m.w * m.h);
    for (const r in m.doors) for (const k of m.doors[r]) { const dx0 = k % m.w, dy0 = (k / m.w) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) reserved[(dy0 + dy) * m.w + dx0 + dx] = 1; }
    const free = (x, y, ww, hh, r) => { for (let j = y; j < y + hh; j++) for (let i = x; i < x + ww; i++) { const k = j * m.w + i; if (i < r.x || j < r.y || i >= r.x + r.w || j >= r.y + r.h || reserved[k] || m.solid[k]) return false; } return true; };
    const block = (x, y, ww, hh) => { for (let j = y - 1; j <= y + hh; j++) for (let i = x - 1; i <= x + ww; i++) reserved[j * m.w + i] = 1; };
    const place = (r, item) => { // top row first (stand below), then bottom row (stand above)
      const [k, ww, kind, val] = item, hh = 1;
      for (const row of ['top', 'bottom']) {
        const y = row === 'top' ? r.y : r.y + r.h - 1, sy = row === 'top' ? y + 1 : y - 1;
        const xs = []; for (let x = r.x; x + ww <= r.x + r.w; x++) xs.push(x); xs.sort(() => R() - 0.5);
        for (const x of xs) {
          if (!free(x, y, ww, hh, r)) continue; if (kind && !free(x + (ww >> 1), sy, 1, 1, r)) continue;
          const p = prop(m, k, x, y, ww, hh); block(x, y, ww, hh);
          if (kind) { const extra = kind === 'task' ? { task: val } : kind === 'switch' ? { sw: val } : kind === 'melt' ? { btn: val } : {}; station(m, kind, x + (ww >> 1), sy, extra); reserved[sy * m.w + x + (ww >> 1)] = 1; }
          return p;
        }
      }
      return null;
    };
    for (let role = 0; role < 10; role++) {
      const r = m.rooms[role];
      if (role === 5) { // meeting hall: centrepiece, table + bell, compass, plants
        // centrepiece: top wall if it doesn't cover a doorway, otherwise the bottom wall, otherwise left out
        let cp = null; const order = []; for (let d = 0; d <= r.w - 14; d++) { const x1 = r.x + Math.floor((r.w - 14) / 2) + (d % 2 ? (d + 1) / 2 : -d / 2); if (x1 >= r.x && x1 + 14 <= r.x + r.w) order.push(x1); }
        for (const yy of [r.y, r.y + r.h - 3]) { for (const x1 of order) if (free(x1, yy, 14, 3, r) && free(x1, yy === r.y ? yy + 3 : yy - 1, 14, 1, r)) { cp = [x1, yy]; break; } if (cp) break; }
        if (cp) { prop(m, 'blimp', cp[0], cp[1], 14, 3); block(cp[0], cp[1], 14, 3); }
        let tx = r.x + Math.floor(r.w / 2) - 2, ty = r.y + Math.floor(r.h / 2);
        if (cp && cp[1] !== r.y) ty = r.y + Math.floor(r.h / 2) - 3; // centrepiece at the bottom: table a bit higher
        for (const [ox, oy] of [[0, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) if (free(tx + ox - 1, ty + oy - 1, 6, 6, r)) { tx += ox; ty += oy; break; }
        prop(m, 'table', tx, ty, 4, 3); block(tx - 4, ty - 3, 12, 9); station(m, 'bell', tx + 2, ty + 3.5);
        place(r, ['compass', 1, 'task', 'compass']); place(r, ['plant', 1]); place(r, ['plant', 1]);
        const cx = (tx + 2) * T, cy = (ty + 1.5) * T; m.spawn = [cx, cy + 50];
        for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; m.seats.push([Math.round(cx + Math.cos(a) * 66), Math.round(cy + Math.sin(a) * 50)]); }
        continue;
      }
      for (const item of ROLE_ITEMS[role]) place(r, item);
      const ci = CHUTE_ROOMS.indexOf(role);
      if (ci >= 0) { // toy chute near the bottom, standing spot just below it
        let done = false; // try the bottom rows first, then any free spot in the room
        for (let y = r.y + r.h - 2; y > r.y && !done; y--) for (let x = r.x + 1; x < r.x + r.w - 1 && !done; x++) if (free(x, y, 1, 2, r)) { prop(m, 'toybox', x, y, 1, 1, true, { chute: ci }); block(x, y, 1, 1); done = true; }
        if (!done) throw new Error('no room for a toy chute in room ' + role);
      }
    }
    // chute stations + cameras at corridor middles
    m.props.filter(p => p.chute != null).sort((a, b) => a.chute - b.chute).forEach(p => m.chutes.push({ x: p.x * T + 8, y: p.y * T + 8 + 14, prop: p.id, room: m.room[p.y * m.w + p.x], i: p.chute }));
    m.chutes.forEach(c => station(m, 'chute', 0, 0, { x: c.x, y: c.y, chute: c.i, room: c.room }));
    const hallTiles = []; for (let k = 0; k < m.w * m.h; k++) if (m.tiles[k] && m.room[k] < 0) hallTiles.push(k);
    m.cams = [{ name: '', x: m.spawn[0], y: m.spawn[1] }]; for (let i = 1; i < 4 && hallTiles.length; i++) { const k = hallTiles[Math.floor(hallTiles.length * i / 4)]; m.cams.push({ name: '', x: (k % m.w) * T + 8, y: Math.floor(k / m.w) * T + 8 }); }
    return m;
  };

  World.buildMap = function (id) {
    if (String(id).startsWith('maze:')) return World.buildMaze(+String(id).slice(5));
    const T2 = World.MAPS[id] ? id : 'workshop', th = World.MAPS[T2];
    const m = th.layout ? World.genLayout(th.layout) : flipMap(World.buildWorkshop(), th.flip[0], th.flip[1]);
    m.theme = T2; m.title = th.name; m.goal = th.goal; m.winText = th.win; m.quests = th.quests;
    m.hallFloor = th.hall[0]; m.hallWall = th.hall[1];
    if (th.rooms) th.rooms.forEach((r, i) => { Object.assign(m.rooms[i], { name: r[0], floor: r[1], wall: r[2], style: r[3] }); });
    if (th.names) th.names.forEach((n, i) => { m.rooms[i].name = n; }); // shape-pun room names
    for (const p of m.props) { if (p.k === 'blimp') p.k = th.centre; else if (th.props[p.k]) p.k = th.props[p.k]; }
    m.cams.forEach((c, i) => c.name = th.cams[i] || c.name);
    ['memory','sequence'].forEach((task,i) => { const base=m.stations.find(s=>s.task===(i?'code':'windbox')); m.stations.push(Object.assign({},base,{task,x:base.x+12})); });
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
    const k = ty * m.w + tx; if (!m.tiles[k]) return true;
    if (m.gate && !m.gateOpen && m.gate.indexOf(k) >= 0) return true;
    if (m.solid[k] && propPixel(m.props[m.solid[k] - 1], px, py)) return true; // only where the prop is actually drawn
    if (jam != null && m.doors[jam] && m.doors[jam].indexOf(k) >= 0) return true;
    return false;
  };
  // Pixel-accurate prop collision: a prop only blocks where its sprite has visible pixels,
  // so empty corners (round table, gears, boiler, desk...) are no longer invisible walls.
  function propMask(p) {
    if (p.mask !== undefined) return p.mask;
    p.mask = null;
    try {
      const sp = World.propSprite(p), w = sp.width, h = sp.height, d = sp.getContext('2d').getImageData(0, 0, w, h).data;
      const mk = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) mk[i] = d[i * 4 + 3] > 40 ? 1 : 0;
      p.mask = { w, h, ox: p.x * T - 1, oy: p.y * T - (CENTRES.includes(p.k) ? 6 : 0), d: mk };
    } catch (e) { p.mask = null; } // no canvas (e.g. tests in Node): fall back to the whole tile being solid
    return p.mask;
  }
  function propPixel(p, px, py) {
    if (!p) return true; const m = propMask(p); if (!m) return true;
    const x = Math.floor(px - m.ox), y = Math.floor(py - m.oy);
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
    return !!m.d[y * m.w + x];
  }
  // feet box ~10x5
  const HX = [-5, -2.5, 0, 2.5, 5], HY = [-4, -1.5, 1];
  World.hit = function (m, x, y, jam) { for (const dy of HY) for (const dx of HX) if (World.blocked(m, x + dx, y + dy, jam)) return true; return false; };
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
  // ---------- the space between rooms: a themed backdrop plus air ducts and vent grilles ----------
  const BACKDROPS = {
    workshop: { base: '#141a33', dots: ['#2a3466', '#f6e7a8'], cloud: '#1f2850', duct: '#5d6578', ductD: '#3a4050', ductL: '#8a93a8' },
    castle: { base: '#1d1a22', brick: '#2a2630', mortar: '#151218', duct: '#6b5a48', ductD: '#43382c', ductL: '#8f7b63' },
    palace: { base: '#14122a', dots: ['#3a2f5a', '#f2a6c8'], cloud: '#1f1a3a', duct: '#7a3b34', ductD: '#4d2420', ductL: '#a85a4c' },
    jurassic: { base: '#0f1d12', leaf: ['#16301b', '#1d3d22', '#24502b'], duct: '#5a5a40', ductD: '#3a3a28', ductL: '#7e7e5c' },
    lobby: { base: '#1a1420', brick: '#241c2a', mortar: '#120e16', duct: '#5d6578', ductD: '#3a4050', ductL: '#8a93a8' },
    maze: { base: '#10200f', leaf: ['#1a3a1b', '#214a23', '#2b5a2c'], duct: '#4a5a40', ductD: '#2e3a28', ductL: '#6e7e5c' },
  };
  function drawBackdrop(m, x) {
    const B = BACKDROPS[m.theme || (m.kind === 'lobby' ? 'lobby' : 'workshop')] || BACKDROPS.workshop, W = m.w * T, H = m.h * T;
    x.fillStyle = B.base; x.fillRect(0, 0, W, H);
    if (B.brick) { for (let y = 0; y < H; y += 8) for (let i = 0; i < W; i += 16) { x.fillStyle = B.brick; x.fillRect(i + ((y / 8) % 2 ? 8 : 0), y, 15, 7); } }
    if (B.cloud) for (let i = 0; i < m.w * m.h / 40; i++) { const cx = hash(i, 7) * W, cy = hash(3, i) * H; x.fillStyle = B.cloud; x.fillRect(cx, cy, 40 + hash(i, i) * 40, 8); x.fillRect(cx + 10, cy - 5, 24, 6); }
    if (B.dots) for (let i = 0; i < m.w * m.h / 6; i++) { x.fillStyle = hash(i, 1) < 0.85 ? B.dots[0] : B.dots[1]; x.fillRect((hash(i, 2) * W) | 0, (hash(5, i) * H) | 0, 1, 1); }
    if (B.leaf) for (let i = 0; i < m.w * m.h / 2; i++) { x.fillStyle = B.leaf[i % 3]; const lx = (hash(i, 9) * W) | 0, ly = (hash(11, i) * H) | 0; x.fillRect(lx, ly, 5, 2); x.fillRect(lx + 1, ly - 1, 3, 4); }
    // ducts: horizontal + vertical runs through empty space, with vent grilles along them
    const empty = (tx, ty) => tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && !m.tiles[ty * m.w + tx] && !nearFloor(m, tx, ty);
    const duct = (px, py, horiz, len) => {
      const w = horiz ? len : 8, h = horiz ? 8 : len;
      x.fillStyle = B.ductD; x.fillRect(px, py, w, h); x.fillStyle = B.duct; x.fillRect(px + (horiz ? 0 : 1), py + (horiz ? 1 : 0), horiz ? w : 6, horiz ? 6 : h);
      x.fillStyle = B.ductL; x.fillRect(px + (horiz ? 0 : 2), py + (horiz ? 2 : 0), horiz ? w : 1, horiz ? 1 : h);
      for (let k = 6; k < len; k += 18) { x.fillStyle = B.ductD; horiz ? x.fillRect(px + k, py, 1, 8) : x.fillRect(px, py + k, 8, 1); }
    };
    const grille = (gx, gy) => { x.fillStyle = B.ductD; x.fillRect(gx - 1, gy - 1, 12, 10); x.fillStyle = '#0a0a10'; x.fillRect(gx, gy, 10, 8); x.fillStyle = B.ductL; for (let k = 1; k < 8; k += 2) x.fillRect(gx + 1, gy + k, 8, 1); x.fillStyle = B.duct; x.fillRect(gx, gy, 1, 1); x.fillRect(gx + 9, gy, 1, 1); x.fillRect(gx, gy + 7, 1, 1); x.fillRect(gx + 9, gy + 7, 1, 1); };
    for (let ty = 1; ty < m.h - 1; ty += 6) { let run = 0; for (let tx = 0; tx <= m.w; tx++) { if (tx < m.w && empty(tx, ty)) { run++; continue; } if (run >= 5) { const sx = (tx - run) * T + 4, len = run * T - 8; duct(sx, ty * T + 4, true, len); for (let k = 24; k < len - 12; k += 56) grille(sx + k, ty * T + 3); } run = 0; } }
    for (let tx = 3; tx < m.w - 1; tx += 9) { let run = 0; for (let ty = 0; ty <= m.h; ty++) { if (ty < m.h && empty(tx, ty)) { run++; continue; } if (run >= 5) { const sy = (ty - run) * T + 4, len = run * T - 8; duct(tx * T + 4, sy, false, len); for (let k = 30; k < len - 12; k += 64) grille(tx * T + 3, sy + k); } run = 0; } }
  }
  function nearFloor(m, tx, ty) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x]) return true; } return false; }
  World.prerender = function (m) {
    const [c, x] = G.mk(m.w * T, m.h * T);
    x.fillStyle = '#100c18'; x.fillRect(0, 0, c.width, c.height);
    drawBackdrop(m, x); // themed background + vents in the empty space between rooms
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
        if (below && m.hedge) { x.fillStyle = '#2f7a3a'; x.fillRect(X, Y, T, T); x.fillStyle = '#45994d'; x.fillRect(X, Y, T, 4); x.fillStyle = '#25602d'; x.fillRect(X, Y + 13, T, 3); x.fillStyle = '#3d8a45'; for (let i = 0; i < 5; i++) x.fillRect(X + ((hash(tx * 5 + i, ty) * 14) | 0), Y + 4 + ((hash(tx, ty * 3 + i) * 8) | 0), 2, 2); }
        else if (below) { // wall face
          x.fillStyle = wc; x.fillRect(X, Y, T, T); x.fillStyle = G.shade(wc, 1.18); x.fillRect(X, Y, T, 3); x.fillStyle = G.shade(wc, 0.78); x.fillRect(X, Y + 14, T, 2);
          x.fillStyle = G.shade(wc, 0.9); if (tx % 2) x.fillRect(X + 3, Y + 6, 10, 1); else x.fillRect(X + 7, Y + 4, 1, 8);
        } else {
          let near = false; for (const d of [1, -1, m.w, -m.w, m.w + 1, m.w - 1, -m.w + 1, -m.w - 1]) if (m.tiles[k + d]) near = true;
          if (near && m.hedge) { x.fillStyle = '#2d6b34'; x.fillRect(X, Y, T, T); x.fillStyle = '#3d8a45'; for (let i = 0; i < 7; i++) x.fillRect(X + ((hash(tx * 3 + i, ty) * 14) | 0), Y + ((hash(tx, ty * 7 + i) * 14) | 0), 2, 2); if (hash(tx, ty) < 0.15) { x.fillStyle = hash(ty, tx) < 0.5 ? P.pink : P.yellow; x.fillRect(X + 6, Y + 6, 3, 3); } }
          else if (near) { x.fillStyle = '#2a2236'; x.fillRect(X, Y, T, T); x.fillStyle = '#3a3049'; x.fillRect(X + 1, Y + 1, T - 2, T - 2); }
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
    const W = p.w * T, H = p.h * T + (CENTRES.includes(p.k) ? 8 : 0); const [c, x] = G.mk(W + 2, H + 10);
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
      // ===== Medieval Castle =====
      case 'drawbridge': R(x, o + 10, 0, W - 20, 44, '#5e5a63'); for (let i = 0; i < W - 20; i += 12) R(x, o + 10 + i, 0, 10, 6, '#77727e'); R(x, o + 30, 10, W - 60, 34, '#3b2a20'); for (let i = 0; i < W - 64; i += 8) R(x, o + 32 + i, 12, 6, 32, P.brown); R(x, o + 32, 24, W - 64, 2, P.dbrown); R(x, o + 18, 8, 2, 36, '#9a9aa5'); R(x, o + W - 20, 8, 2, 36, '#9a9aa5'); R(x, o + W / 2 - 6, 2, 12, 6, P.gold); break;
      case 'torch': R(x, o + 7, 5, 2, 10, P.dbrown); R(x, o + 5, 4, 6, 2, P.grey); R(x, o + 6, 0, 4, 4, P.orange); R(x, o + 7, -0, 2, 2, P.yellow); break;
      case 'banner': for (let i = 0; i < W; i += 16) { R(x, o + i + 2, 0, 12, 2, P.gold); R(x, o + i + 3, 2, 10, 12, i % 32 ? P.dblue : P.dred); R(x, o + i + 6, 5, 4, 4, P.gold); R(x, o + i + 3, 14, 3, 2, i % 32 ? P.dblue : P.dred); R(x, o + i + 10, 14, 3, 2, i % 32 ? P.dblue : P.dred); } break;
      case 'barrel': for (let i = 0; i < W; i += 16) for (let j = 0; j < H; j += 16) { R(x, o + i + 2, j + 1, 12, 14, P.brown); R(x, o + i + 2, j + 3, 12, 1, P.grey); R(x, o + i + 2, j + 11, 12, 1, P.grey); R(x, o + i + 4, j + 1, 2, 14, P.tan); } break;
      case 'armor': R(x, o + 4, 0, 8, 6, P.grey); R(x, o + 5, 2, 6, 1, P.ink); R(x, o + 3, 6, 10, 7, P.light); R(x, o + 5, 13, 2, 3, P.grey); R(x, o + 9, 13, 2, 3, P.grey); R(x, o + 13, 2, 1, 12, P.mid); break;
      case 'throne': R(x, o + W / 2 - 10, 0, 20, H - 4, P.gold); R(x, o + W / 2 - 7, 4, 14, H - 12, P.dred); R(x, o + W / 2 - 13, H - 12, 26, 8, P.gold); R(x, o + W / 2 - 2, 1, 4, 3, P.sky); break;
      case 'tapestry': R(x, o, 2, W, 12, P.dpurple); for (let i = 3; i < W - 3; i += 6) R(x, o + i, 5, 3, 6, i % 12 ? P.gold : P.pink); R(x, o, 2, W, 2, P.gold); break;
      case 'shieldrack': R(x, o + 2, 4, W - 4, 2, P.dbrown); for (let i = 0; i < 3; i++) { R(x, o + 4 + i * 9, 6, 8, 10, [P.red, P.blue, P.green][i]); R(x, o + 7 + i * 9, 6, 2, 10, P.gold); } break;
      case 'chest': R(x, o + 1, 5, 14, 10, P.brown); R(x, o + 1, 3, 14, 4, P.dbrown); R(x, o + 1, 7, 14, 1, P.gold); R(x, o + 7, 6, 2, 3, P.gold); break;
      case 'longtable': R(x, o, 4, W, 10, P.brown); R(x, o, 4, W, 2, P.tan); for (let i = 6; i < W; i += 14) { R(x, o + i, 6, 6, 4, P.light); R(x, o + i + 1, 5, 4, 2, P.orange); } break;
      // ===== Sakura Palace =====
      case 'dragonboat': R(x, o + 20, 24, W - 40, 14, P.red); R(x, o + 24, 22, W - 48, 3, P.gold); R(x, o + 22, 36, W - 44, 4, P.dred); R(x, o + W - 30, 4, 10, 24, P.green); R(x, o + W - 26, 2, 12, 8, P.green); R(x, o + W - 18, 4, 2, 2, P.yellow); R(x, o + W - 22, 10, 4, 2, P.red); R(x, o + 24, 14, 6, 12, P.green); R(x, o + W / 2 - 1, 0, 2, 24, P.dbrown); R(x, o + W / 2 + 1, 2, 22, 16, P.cream); R(x, o + W / 2 + 8, 6, 8, 8, P.red); for (let i = 34; i < W - 36; i += 10) R(x, o + i, 30, 2, 8, P.tan); break;
      case 'bonsai': R(x, o + 3, 10, 10, 5, P.dbrown); R(x, o + 7, 5, 2, 6, P.brown); R(x, o + 2, 2, 7, 4, P.pink); R(x, o + 8, 0, 6, 4, P.pink); R(x, o + 4, 3, 2, 1, '#fff'); break;
      case 'scrolls': R(x, o, 0, W, 16, P.dbrown); for (let i = 1; i < W - 2; i += 4) { R(x, o + i, 2, 3, 5, P.cream); R(x, o + i, 9, 3, 5, P.cream); R(x, o + i + 1, 3, 1, 3, P.dred); } break;
      case 'lacquerbox': for (let i = 0; i < W; i += 16) for (let j = 0; j < H; j += 16) { R(x, o + i + 1, j + 3, 14, 12, P.dred); R(x, o + i + 1, j + 3, 14, 2, P.ink); R(x, o + i + 6, j + 8, 4, 3, P.gold); } break;
      case 'taiko': R(x, o + 2, 3, 12, 11, P.brown); R(x, o + 2, 2, 12, 3, P.cream); for (let i = 3; i < 14; i += 3) R(x, o + i, 7, 1, 1, P.gold); R(x, o + 1, 12, 14, 2, P.dbrown); break;
      case 'koto': R(x, o, 8, W, 6, P.tan); R(x, o, 8, W, 1, P.brown); for (let i = 2; i < W - 2; i += 3) R(x, o + i, 9, 1, 4, P.cream); R(x, o + 4, 4, 10, 4, P.dred); break;
      case 'bamboo': for (let i = 0; i < W; i += 5) { R(x, o + i, 0, 3, 15, P.lime); R(x, o + i, 4, 3, 1, P.dgreen); R(x, o + i, 10, 3, 1, P.dgreen); } break;
      case 'foldscreen': for (let i = 0; i < 4; i++) { R(x, o + i * 8, 0, 7, H - 2, P.cream); R(x, o + i * 8, 0, 7, 2, P.dbrown); R(x, o + i * 8 + 2, 8, 3, 6, P.pink); } break;
      case 'basket': R(x, o + 2, 6, 12, 9, P.tan); for (let i = 3; i < 14; i += 3) R(x, o + i, 6, 1, 9, P.brown); R(x, o + 4, 2, 8, 2, P.brown); break;
      case 'lowtable': R(x, o, 8, W, 5, P.dred); R(x, o, 8, W, 1, P.red); for (let i = 6; i < W; i += 14) { R(x, o + i, 5, 6, 3, P.white); R(x, o + i + 1, 4, 4, 1, P.green); } break;
      case 'lanterns': for (let i = 0; i < p.w * 2; i++) { R(x, o + 2 + i * 8, 4, 6, 9, P.red); R(x, o + 3 + i * 8, 6, 4, 5, P.orange); R(x, o + 4 + i * 8, 2, 2, 2, P.ink); } break;
      // ===== Jurassic Manor =====
      case 'timemachine': R(x, o + 24, 4, W - 48, 34, P.grey); R(x, o + 28, 8, W - 56, 26, '#3a4a5a'); R(x, o + 34, 12, W - 68, 18, '#7ff0ff'); R(x, o + 38, 16, W - 76, 10, '#c9ffff'); for (let i = 0; i < 5; i++) R(x, o + 30 + i * 10, 40, 6, 6, [P.red, P.yellow, P.lime, P.sky, P.pink][i]); R(x, o + 20, 44, W - 40, 6, P.dark); break;
      case 'fern': R(x, o + 4, 11, 8, 5, P.dbrown); x.fillStyle = P.green; for (const [a, b2] of [[2, 2], [9, 1], [5, 5], [11, 6], [1, 7]]) x.fillRect(o + a, b2, 4, 2); R(x, o + 7, 3, 2, 9, P.dgreen); break;
      case 'fossilshelf': R(x, o, 0, W, 16, P.dbrown); for (let i = 2; i < W - 6; i += 9) { R(x, o + i, 3, 6, 4, P.cream); R(x, o + i + 1, 10, 5, 3, P.light); R(x, o + i + 2, 4, 1, 2, P.dbrown); } break;
      case 'eggnest': for (let i = 0; i < W; i += 16) for (let j = 0; j < H; j += 16) { R(x, o + i + 1, j + 10, 14, 5, P.tan); for (let k = 0; k < 3; k++) { R(x, o + i + 2 + k * 4, j + 4, 4, 7, k === 1 ? '#9fe0a8' : P.cream); R(x, o + i + 3 + k * 4, j + 6, 1, 1, P.green); } } break;
      case 'bones': R(x, o + 1, 9, 14, 3, P.cream); R(x, o, 8, 3, 5, P.light); R(x, o + 13, 8, 3, 5, P.light); R(x, o + 4, 3, 8, 3, P.cream); R(x, o + 3, 2, 3, 5, P.light); break;
      case 'skull': R(x, o + 4, 2, W - 8, H - 6, P.cream); R(x, o + 8, 6, 6, 6, P.ink); R(x, o + W - 16, H - 14, W - 20, 6, P.light); for (let i = 16; i < W - 8; i += 4) R(x, o + i, H - 9, 2, 4, P.white); break;
      case 'vines': for (let i = 0; i < W; i += 4) { R(x, o + i, 4 + (i % 8 ? 2 : 0), 3, 9, P.green); R(x, o + i + 1, 6 + (i % 8 ? 2 : 0), 1, 2, P.lime); } break;
      case 'dinomap': R(x, o + 2, 0, W - 4, H - 4, P.cream); R(x, o + 5, 4, 8, 6, P.green); R(x, o + 15, 10, 8, 8, P.tan); R(x, o + 9, 18, 3, 3, P.red); R(x, o + 6, H - 4, 2, 4, P.dbrown); R(x, o + W - 8, H - 4, 2, 4, P.dbrown); break;
      case 'log': R(x, o, 5, 16, 10, P.brown); R(x, o, 5, 4, 10, P.tan); R(x, o + 1, 8, 2, 4, P.dbrown); R(x, o + 8, 3, 4, 3, P.green); break;
      case 'roundtable': x.fillStyle = P.ink; x.beginPath(); x.ellipse(o + W / 2, H / 2 + 2, W / 2, H / 2 - 2, 0, 0, 7); x.fill(); x.fillStyle = P.dbrown; x.beginPath(); x.ellipse(o + W / 2, H / 2, W / 2 - 1, H / 2 - 4, 0, 0, 7); x.fill(); x.fillStyle = P.brown; x.beginPath(); x.ellipse(o + W / 2, H / 2 - 2, W / 2 - 5, H / 2 - 8, 0, 0, 7); x.fill(); break;
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
      const s = drawPropSprite(p); let X = p.x * T - 1 - camx, Y = p.y * T - camy - (CENTRES.includes(p.k) ? 6 : 0);
      if (X > G.W || Y > G.H || X + s.width < 0 || Y + s.height < 0) continue;
      const rt = st.rattle && st.rattle[p.id]; if (rt && rt > 0) { X += Math.round(Math.sin(st.t * 60) * 2); Y += Math.round(Math.cos(st.t * 47)); }
      if (p.k === 'blimp') Y += Math.round(Math.sin(st.t * 1.5) * 1.5);
      if (p.k === 'toybox' && p.chute != null && st.chuteWobble && st.chuteWobble[p.chute] > 0) { Y -= Math.round(Math.abs(Math.sin(st.t * 30)) * 2); }
      ctx.drawImage(s, X, Y);
      if (p.k === 'lever') { const sw = st.switches && st.lights; const on = !sw || sw[p.sw != null ? p.sw : (p.x < 20 ? 1 : 0)]; G.rect(X + 7, Y + (on ? 1 : 7), 3, 7, on ? P.lime : P.red); }
      if (p.k === 'button' && st.melt) { if (((st.t * 3) | 0) % 2) G.rect(X + 4, Y + 3, 9, 7, '#ffeb3b'); }
      if ((p.k === 'table' || p.k === 'roundtable') && m.kind === 'workshop') { // meeting bell on top
        const bx = X + s.width / 2, by = Y + 10; G.rect(bx - 5, by + 2, 11, 8, P.gold); G.rect(bx - 6, by + 9, 13, 2, P.ink); G.rect(bx - 3, by, 7, 3, P.gold); G.rect(bx - 1, by - 2, 3, 2, P.ink); G.rect(bx - 3, by + 3, 2, 4, P.yellow);
      }
      if (p.k === 'jukebox') { if (((st.t * 2) | 0) % 2) G.text('♥', X + p.w * T - 2, Y - 8 + Math.round(Math.sin(st.t * 4) * 2), P.pink); }
    }
  };
})();
