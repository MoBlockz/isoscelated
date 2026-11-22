// ISOSCELATED - graphics: crisp pixel screen, pixel font, palette, all sprites drawn in code.
'use strict';
const G = {};
(function () {
  // ---------- screen ----------
  const disp = document.getElementById('screen');
  const dctx = disp.getContext('2d');
  const buf = document.createElement('canvas');
  const ctx = buf.getContext('2d');
  G.ctx = ctx; G.buf = buf; G.disp = disp;
  G.W = 400; G.H = 240; G.scale = 2;
  G.resize = function () {
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.floor(window.innerWidth * dpr), ph = Math.floor(window.innerHeight * dpr);
    let s = Math.max(1, Math.min(Math.floor(pw / 360), Math.floor(ph / 210)));
    G.scale = s; G.W = Math.floor(pw / s); G.H = Math.floor(ph / s);
    buf.width = G.W; buf.height = G.H;
    disp.width = G.W * s; disp.height = G.H * s;
    disp.style.width = (G.W * s / dpr) + 'px'; disp.style.height = (G.H * s / dpr) + 'px';
    ctx.imageSmoothingEnabled = false; dctx.imageSmoothingEnabled = false;
  };
  G.present = function () {
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(buf, 0, 0, G.W * G.scale, G.H * G.scale);
  };
  G.toInternal = function (cx, cy) {
    const r = disp.getBoundingClientRect();
    return [(cx - r.left) / r.width * G.W, (cy - r.top) / r.height * G.H];
  };

  // ---------- palette (soft retro) ----------
  const P = G.P = {
    ink: '#1b1726', dark: '#3a3049', mid: '#6b5f7c', grey: '#a79fb3', light: '#e4dfe9', white: '#fbf8f2',
    red: '#e0504c', dred: '#9c2f3a', orange: '#f08a3c', yellow: '#f6cf57', lime: '#a3d955', green: '#4fae5a', dgreen: '#2f6e48',
    teal: '#3cb3a7', sky: '#6ec3f0', blue: '#4471d9', dblue: '#2c3f8f', purple: '#8b55c9', dpurple: '#55307e', pink: '#f08bbf',
    brown: '#8a5a3b', dbrown: '#573626', tan: '#d8a86c', cream: '#f4e3b8', gold: '#f4b93c', hexred: '#ff3355', glow: '#c77dff'
  };
  G.BODY_COLORS = [
    ['Red', '#e0504c'], ['Orange', '#f08a3c'], ['Yellow', '#f6cf57'], ['Lime', '#a3d955'], ['Green', '#4fae5a'], ['Teal', '#3cb3a7'],
    ['Sky', '#6ec3f0'], ['Blue', '#4471d9'], ['Navy', '#2c3f8f'], ['Purple', '#8b55c9'], ['Pink', '#f08bbf'], ['Rose', '#c94f7c'],
    ['Brown', '#8a5a3b'], ['Tan', '#d8a86c'], ['White', '#f2eee8'], ['Grey', '#8f8a99'], ['Black', '#3a3346'], ['Gold', '#f4b93c']];
  G.HAIR_COLORS = [['Black', '#2a2433'], ['Brown', '#6b4130'], ['Blond', '#f2d06b'], ['Ginger', '#d8612f'], ['White', '#eeeeee'], ['Blue', '#4b7be6'], ['Pink', '#f07fb8'], ['Green', '#53b85d'], ['Purple', '#9358d6'], ['Red', '#d8333f']];
  G.SHAPES = ['Isosceles Triangle', 'Square', 'Circle', 'Pyramid', 'Cylinder', 'Cone', 'Donut', 'Diamond', 'Star', 'Hexagon', 'Capsule'];
  G.PATTERNS = ['Solid', 'Stripes', 'Polka dots', 'Checker'];
  G.HAIRS = ['Elvis pompadour', 'Mohawk', 'Afro', 'Spiky anime', 'Pigtails', 'Mullet', 'Curly mop', 'Man-bun', 'Bald + shine', 'Long flowing'];
  G.HATS = ['None', 'Crown', 'Top hat', 'Cowboy hat', 'Beanie', 'Chef hat', 'Propeller cap', 'Party hat', 'Viking helmet'];
  G.EYES = ['Normal', 'Sleepy', 'Angry brows', 'Sparkly', 'Sunglasses', 'Monocle', 'Cyclops'];
  G.EXTRAS = ['None', 'Mustache', 'Bow tie', 'Cape', 'Scarf', 'Backpack', 'Gold chain'];
  G.OBJECTS = ['teapot', 'lamp', 'rubber duck', 'traffic cone', 'toaster', 'chair', 'alarm clock', 'potted plant', 'boot', 'trophy'];

  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgb2hex(r, g, b) { return '#' + ((1 << 24) | (Math.max(0, Math.min(255, r | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, b | 0))).toString(16).slice(1); }
  G.shade = function (h, f) { const [r, g, b] = hex2rgb(h); return f < 1 ? rgb2hex(r * f, g * f, b * f) : rgb2hex(r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1)); };
  G.mk = function (w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };

  // ---------- pixel font: Press Start 2P rasterised + thresholded to a 1-bit atlas ----------
  const FW = 8;
  let atlas = null; const tinted = {};
  G.CHW = 8; // char advance
  G.buildFont = function () {
    // render at 2x and sample each pixel centre -> perfectly crisp 1-bit glyphs
    const [big, bx] = G.mk(32 * FW, 12 * FW);
    bx.fillStyle = '#fff'; bx.textBaseline = 'top';
    const ok = document.fonts && document.fonts.check && document.fonts.check('16px "Press Start 2P"');
    bx.font = ok ? '16px "Press Start 2P"' : 'bold 15px monospace';
    for (let i = 32; i < 128; i++) { const k = i - 32; bx.fillText(String.fromCharCode(i), (k % 16) * FW * 2, Math.floor(k / 16) * FW * 2); }
    const bd = bx.getImageData(0, 0, big.width, big.height).data;
    const [c, x] = G.mk(16 * FW, 6 * FW);
    const id = x.createImageData(c.width, c.height), d = id.data;
    for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
      const on = bd[((yy * 2 + 1) * big.width + xx * 2 + 1) * 4 + 3] > 120; const i = (yy * c.width + xx) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = on ? 255 : 0;
    }
    x.putImageData(id, 0, 0);
    // custom glyphs: 127 = ▶, 126 kept '~'; we map ▶ ▼ ◀ ♥ ✔ to slots 0-4 of an extra row
    atlas = c; for (const k in tinted) delete tinted[k];
    const [e, ex] = G.mk(8 * FW, FW); ex.fillStyle = '#fff';
    const glyphs = [
      ['..#.....', '..##....', '..###...', '..####..', '..###...', '..##....', '..#.....', '........'], // ▶
      ['........', '#######.', '.#####..', '..###...', '...#....', '........', '........', '........'], // ▼
      ['.....#..', '....##..', '...###..', '..####..', '...###..', '....##..', '.....#..', '........'], // ◀
      ['.##.##..', '#######.', '#######.', '.#####..', '..###...', '...#....', '........', '........'], // ♥
      ['......#.', '.....##.', '#...##..', '##.##...', '.###....', '..#.....', '........', '........'], // ✔
      ['...#....', '..###...', '.#####..', '#######.', '........', '........', '........', '........'], // ▲
    ];
    glyphs.forEach((g, gi) => g.forEach((row, y) => { for (let xx = 0; xx < 8; xx++) if (row[xx] === '#') ex.fillRect(gi * 8 + xx, y, 1, 1); }));
    G.extra = e;
  };
  const SPECIAL = { '▶': 0, '▼': 1, '◀': 2, '♥': 3, '✔': 4, '▲': 5 };
  function tint(col) {
    if (tinted[col]) return tinted[col];
    const [c, x] = G.mk(atlas.width, atlas.height + FW);
    x.drawImage(atlas, 0, 0); x.drawImage(G.extra, 0, atlas.height);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    tinted[col] = c; return c;
  }
  // draw text; opts: {col, sh (shadow color), sc (integer scale), al ('l','c','r')}
  G.text = function (s, x, y, col, opts) {
    if (!atlas) return; s = String(s); opts = opts || {};
    const sc = opts.sc || 1, w = s.length * FW * sc;
    if (opts.al === 'c') x -= Math.floor(w / 2); else if (opts.al === 'r') x -= w;
    x = Math.round(x); y = Math.round(y);
    if (opts.sh) G.text(s, x + sc, y + sc, opts.sh, { sc });
    if (opts.ol) { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) G.text(s, x + dx * sc, y + dy * sc, opts.ol, { sc }); }
    const t = tint(col || P.ink);
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]; let sx, sy;
      if (SPECIAL[ch] !== undefined) { sx = SPECIAL[ch] * FW; sy = atlas.height; }
      else { let k = ch.charCodeAt(0) - 32; if (k < 0 || k > 95) k = 31; sx = (k % 16) * FW; sy = Math.floor(k / 16) * FW; }
      ctx.drawImage(t, sx, sy, FW, FW, x + i * FW * sc, y, FW * sc, FW * sc);
    }
    return w;
  };
  // word-wrap to max chars
  G.wrap = function (s, maxc) {
    const out = []; for (const para of String(s).split('\n')) {
      let line = ''; for (const w of para.split(' ')) {
        if (!line.length) line = w; else if ((line + ' ' + w).length <= maxc) line += ' ' + w; else { out.push(line); line = w; }
        while (line.length > maxc) { out.push(line.slice(0, maxc)); line = line.slice(maxc); }
      } out.push(line);
    } return out;
  };
  // tiny 3x5 font for name tags (uppercase, digits, a few symbols)
  const T3 = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
    0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
    ' ': '000000000000000', '.': '000000000000010', '-': '000000111000000', '_': '000000000000111', '!': '010010010000010', '?': '110001010000010', "'": '010010000000000', '/': '001001010100100', ':': '000010000010000', '(': '010100100100010', ')': '010001001001010', ',': '000000000010100', '*': '000101010101000', '+': '000010111010000', '#': '101111101111101', '&': '010101010101011'
  };
  const tinyCache = {};
  G.tiny = function (s, x, y, col, al) {
    s = String(s).toUpperCase(); const w = s.length * 4 - 1;
    if (al === 'c') x -= Math.floor(w / 2);
    const key = s + '|' + col; let c = tinyCache[key];
    if (!c) {
      const [cv, cx] = G.mk(w + 2, 7);
      for (let pass = 0; pass < 2; pass++) {
        cx.fillStyle = pass ? col : 'rgba(20,16,30,0.85)';
        for (let i = 0; i < s.length; i++) {
          const g = T3[s[i]] || T3['?'];
          for (let k = 0; k < 15; k++) if (g[k] === '1') {
            const px = 1 + i * 4 + (k % 3), py = 1 + Math.floor(k / 3);
            if (pass) cx.fillRect(px, py, 1, 1); else cx.fillRect(px - 1, py - 1, 3, 3);
          }
        }
      }
      c = tinyCache[key] = cv; if (Object.keys(tinyCache).length > 400) for (const k in tinyCache) delete tinyCache[k];
    }
    ctx.drawImage(c, Math.round(x) - 1, Math.round(y) - 1);
    return w;
  };

  // ---------- boxes ----------
  G.rect = function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  G.box = function (x, y, w, h, fill, border) { // classic RPG text box: thick dark border, white fill
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    G.rect(x + 1, y, w - 2, h, border || P.ink); G.rect(x, y + 1, w, h - 2, border || P.ink);
    G.rect(x + 2, y + 2, w - 4, h - 4, P.grey); G.rect(x + 3, y + 3, w - 6, h - 6, fill || P.white);
  };
  G.darkBox = function (x, y, w, h) { G.box(x, y, w, h, '#2a2238', '#0e0b14'); };

  // ---------- simple grid sprite helper ----------
  function fromGrid(rows, pal) {
    const h = rows.length, w = rows[0].length; const [c, x] = G.mk(w, h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const k = rows[yy][xx]; if (k !== '.' && pal[k]) { x.fillStyle = pal[k]; x.fillRect(xx, yy, 1, 1); } }
    return c;
  }
  G.fromGrid = fromGrid;
  // add 1px dark outline around opaque pixels of a canvas
  function outline(src, col) {
    const w = src.width + 2, h = src.height + 2; const [c, x] = G.mk(w, h);
    const sd = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    const op = (xx, yy) => xx >= 0 && yy >= 0 && xx < src.width && yy < src.height && sd[(yy * src.width + xx) * 4 + 3] > 0;
    x.fillStyle = col || P.ink;
    for (let yy = -1; yy <= src.height; yy++) for (let xx = -1; xx <= src.width; xx++) if (!op(xx, yy) && (op(xx - 1, yy) || op(xx + 1, yy) || op(xx, yy - 1) || op(xx, yy + 1))) x.fillRect(xx + 1, yy + 1, 1, 1);
    x.drawImage(src, 1, 1); return c;
  }
  G.outline = outline;

  // ---------- character sprites ----------
  // look = {shape, color, pattern, hair, hairColor, hat, eyes, extra}  (all indices)
  const BW = 14; // body grid
  function inPoly(px, py, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c; } return c; }
  const starPts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.2 : 7.6; starPts.push([7 + Math.cos(a) * r, 7.8 + Math.sin(a) * r]); }
  const hexPts = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; hexPts.push([7 + Math.cos(a) * 7.4, 7 + Math.sin(a) * 6.8]); }
  // mask functions (u,v pixel coords 0..13, test pixel centre)
  const MASK = [
    (u, v) => Math.abs(u + .5 - 7) <= 0.6 + v * 0.5, // isosceles triangle
    (u, v) => u >= 1 && u <= 12 && v >= 1 && !((u === 1 || u === 12) && (v === 1 || v === 13)), // square
    (u, v) => (u + .5 - 7) ** 2 + (v + .5 - 7) ** 2 <= 46, // circle
    (u, v) => v >= 3 && Math.abs(u + .5 - 7) <= (v - 2) * 0.66, // pyramid (squat)
    (u, v) => u >= 2 && u <= 11 && ((v >= 2 && v <= 11) || ((u + .5 - 7) ** 2 / 25 + (v + .5 - 2) ** 2 / 4 <= 1) || ((u + .5 - 7) ** 2 / 25 + (v + .5 - 11.5) ** 2 / 4 <= 1)), // cylinder
    (u, v) => (v <= 11 && Math.abs(u + .5 - 7) <= 0.5 + v * 0.55) || ((u + .5 - 7) ** 2 / 42 + (v + .5 - 11.5) ** 2 / 4 <= 1), // cone
    (u, v) => { const d = (u + .5 - 7) ** 2 + (v + .5 - 7) ** 2; return d <= 46 && d >= 6; }, // donut
    (u, v) => Math.abs(u + .5 - 7) + Math.abs(v + .5 - 7) * 1.0 <= 7.3, // diamond
    (u, v) => inPoly(u + .5, v + .5, starPts), // star
    (u, v) => inPoly(u + .5, v + .5, hexPts), // hexagon
    (u, v) => { if (u < 2 || u > 11) return false; if (v >= 5 && v <= 9) return true; const cy = v < 5 ? 5 : 9; return (u + .5 - 7) ** 2 + (v + .5 - cy) ** 2 <= 25.5; } // capsule
  ];
  const EYE_Y = [9, 5, 6, 8, 6, 8, 4, 6, 7, 6, 5];
  const TOP_Y = [0, 1, 0, 3, 1, 0, 0, 0, 0, 0, 0]; // first body row
  const HEAD_W = [3, 12, 10, 4, 10, 3, 10, 4, 4, 10, 10];
  const masks = MASK.map(f => { const m = []; for (let v = 0; v < BW; v++) for (let u = 0; u < BW; u++) m.push(f(u, v)); return m; });
  G.masks = masks;
  // sprite canvas layout: 26 wide x 34 tall; body at (6, 16); feet at y 30..31
  const SW = 26, SH = 34, BX = 6, BY = 16;
  G.SPR = { w: SW, h: SH, ox: 13, oy: 31 }; // origin = between feet
  function pset(x, c, X, Y) { x.fillStyle = c; x.fillRect(X, Y, 1, 1); }
  function drawHair(x, look, dir, hx, hy, hw) {
    const hc = G.HAIR_COLORS[look.hairColor % G.HAIR_COLORS.length][1], hd = G.shade(hc, 0.7), hl = G.shade(hc, 1.35);
    const cx = 13; const R = (a, b, w, h, c) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
    const back = dir === 1, side = dir === 2 || dir === 3, fl = dir === 2 ? -1 : 1; // dir: 0 down,1 up,2 left,3 right
    switch (look.hair) {
      case 0: // Elvis pompadour: tall shiny swoop + sideburns
        R(cx - 4, hy - 4, 8, 4, hc); R(cx - 3, hy - 6, 8, 2, hc); R(cx - 1, hy - 7, 6, 1, hc); R(cx + 3 * (side ? fl : 1), hy - 7, 2, 2, hc);
        R(cx - 2, hy - 6, 3, 1, hl); R(cx - 1, hy - 5, 1, 1, '#fff');
        if (!back) { R(cx - hw / 2 - 1, hy, 1, 4, hd); R(cx + hw / 2, hy, 1, 4, hd); }
        R(cx - 4, hy - 1, 8, 1, hd); break;
      case 1: // mohawk
        for (let i = 0; i < 4; i++) R(cx - 1, hy - 3 - i * 2, 2, 2, i % 2 ? hl : hc); R(cx - 1, hy - 1, 2, 2, hd); break;
      case 2: // afro
        R(cx - 6, hy - 6, 12, 7, hc); R(cx - 5, hy - 8, 10, 2, hc); R(cx - 7, hy - 4, 14, 4, hc); R(cx - 3, hy - 7, 3, 1, hl); R(cx - 5, hy - 5, 1, 1, hd); R(cx + 3, hy - 3, 1, 1, hd); R(cx, hy - 2, 1, 1, hd); break;
      case 3: // spiky anime
        R(cx - 5, hy - 3, 10, 3, hc);
        [[-6, -6], [-3, -9], [0, -10], [3, -8], [5, -5]].forEach(([dx, dy], i) => { R(cx + dx, hy + dy, 2, -dy - 2, hc); R(cx + dx, hy + dy, 1, 2, hl); });
        if (!back) R(cx - 2, hy, 3, 2, hc); break;
      case 4: // pigtails
        R(cx - 4, hy - 3, 8, 3, hc); R(cx - 3, hy - 4, 6, 1, hc); R(cx - 2, hy - 3, 2, 1, hl);
        R(cx - 8, hy - 2, 3, 5, hc); R(cx + 5, hy - 2, 3, 5, hc); R(cx - 8, hy + 2, 2, 2, hd); R(cx + 6, hy + 2, 2, 2, hd);
        R(cx - 5, hy - 1, 1, 1, P.red); R(cx + 4, hy - 1, 1, 1, P.red); break;
      case 5: // mullet
        R(cx - 4, hy - 3, 8, 3, hc); R(cx - 3, hy - 4, 6, 1, hl);
        if (back || side) R(cx - 4 + (side ? fl * 2 : 0), hy - 1, 8, 7, hc); else { R(cx - hw / 2 - 1, hy, 2, 6, hd); R(cx + hw / 2 - 1, hy, 2, 6, hd); } break;
      case 6: // curly mop
        for (let i = -5; i <= 4; i += 2) for (let j = -5; j <= -1; j += 2) { R(cx + i, hy + j, 2, 2, (i + j) & 2 ? hc : hd); }
        R(cx - 3, hy - 6, 6, 1, hc); R(cx - 1, hy - 5, 1, 1, hl); break;
      case 7: // man-bun
        R(cx - 4, hy - 2, 8, 2, hc); R(cx - 3, hy - 3, 6, 1, hc); R(cx - 2, hy - 7, 4, 4, hc); R(cx - 1, hy - 7, 2, 1, hl); R(cx - 2, hy - 4, 4, 1, hd); break;
      case 8: // bald with shine
        R(cx - 3 + (side ? fl : 0), hy + 1, 2, 1, '#fff'); R(cx - 2 + (side ? fl : 0), hy + 2, 1, 1, '#fff');
        R(cx + 2, hy - 2, 1, 1, '#fff'); R(cx + 1, hy - 1, 3, 1, P.yellow); R(cx + 2, hy - 3, 1, 3, P.yellow); break;
      case 9: // long flowing
        R(cx - 5, hy - 3, 10, 4, hc); R(cx - 4, hy - 4, 8, 1, hc); R(cx - 3, hy - 3, 3, 1, hl);
        if (back) R(cx - 5, hy, 10, 10, hc); else { R(cx - 6, hy, 3, 10, hc); R(cx + 3, hy, 3, 10, hc); R(cx - 6, hy + 9, 2, 1, hd); R(cx + 4, hy + 9, 2, 1, hd); } break;
    }
  }
  function hairTop(h) { return [7, 9, 8, 10, 4, 4, 6, 7, 0, 4][h] || 4; }
  function drawHat(x, look, dir, hy) {
    const R = (a, b, w, h, c) => { x.fillStyle = c; x.fillRect(a, b, w, h); }; const cx = 13;
    switch (look.hat) {
      case 1: R(cx - 4, hy - 3, 8, 3, P.gold); R(cx - 4, hy - 5, 2, 2, P.gold); R(cx - 1, hy - 6, 2, 3, P.gold); R(cx + 2, hy - 5, 2, 2, P.gold); R(cx - 1, hy - 2, 2, 1, P.red); R(cx - 3, hy - 2, 1, 1, P.sky); R(cx + 2, hy - 2, 1, 1, P.green); break;
      case 2: R(cx - 6, hy - 1, 12, 2, P.ink); R(cx - 4, hy - 9, 8, 8, '#2b2535'); R(cx - 4, hy - 3, 8, 1, P.red); R(cx - 3, hy - 8, 1, 4, '#4a4058'); break;
      case 3: R(cx - 8, hy - 1, 16, 2, P.brown); R(cx - 8, hy - 2, 2, 1, P.brown); R(cx + 6, hy - 2, 2, 1, P.brown); R(cx - 4, hy - 6, 8, 5, P.brown); R(cx - 1, hy - 6, 2, 1, P.dbrown); R(cx - 4, hy - 2, 8, 1, P.dbrown); break;
      case 4: R(cx - 5, hy - 4, 10, 5, P.blue); R(cx - 5, hy, 10, 2, P.sky); R(cx - 1, hy - 6, 2, 2, P.white); for (let i = -4; i < 5; i += 2) R(cx + i, hy - 3, 1, 3, P.dblue); break;
      case 5: R(cx - 4, hy - 3, 8, 4, P.white); R(cx - 6, hy - 8, 12, 5, P.white); R(cx - 4, hy - 9, 8, 1, P.white); R(cx - 3, hy - 7, 1, 3, P.light); R(cx + 2, hy - 7, 1, 3, P.light); R(cx - 4, hy, 8, 1, P.light); break;
      case 6: R(cx - 5, hy - 3, 10, 4, P.red); R(cx - 1, hy - 3, 2, 4, P.yellow); R(cx + (dir === 2 ? -9 : 4), hy, 5, 1, P.red); R(cx, hy - 5, 1, 2, P.ink); R(cx - 4, hy - 6, 9, 1, P.sky); R(cx - 4, hy - 7, 2, 1, P.yellow); break;
      case 7: for (let i = 0; i < 8; i++) R(cx - 4 + i / 2, hy - i, 8 - i, 1, i % 3 === 1 ? P.yellow : P.pink); R(cx - 1, hy - 10, 2, 2, P.yellow); break;
      case 8: R(cx - 5, hy - 4, 10, 5, P.grey); R(cx - 4, hy - 5, 8, 1, P.grey); R(cx - 5, hy, 10, 1, P.mid); R(cx - 3, hy - 4, 2, 2, P.light);
        R(cx - 8, hy - 6, 2, 4, P.cream); R(cx - 7, hy - 3, 2, 2, P.cream); R(cx + 6, hy - 6, 2, 4, P.cream); R(cx + 5, hy - 3, 2, 2, P.cream); break;
    }
  }
  function patternAt(p, u, v) { if (p === 1) return (v % 4) < 2; if (p === 2) return ((u + (Math.floor(v / 4) % 2) * 2) % 4 === 1) && (v % 4 === 1); if (p === 3) return ((Math.floor(u / 3) + Math.floor(v / 3)) % 2) === 0; return false; }
  function drawEyes(x, look, dir, ex, ey) {
    if (dir === 1) return; // back: no face
    const R = (a, b, w, h, c) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
    const side = dir === 2 || dir === 3, s = dir === 2 ? -1 : 1;
    const eyes = side ? [ex + s * 3] : [ex - 3, ex + 2];
    const e = look.eyes;
    if (e === 6) { const c = side ? ex + s * 2 : ex - 1; R(c - 1, ey - 1, 4, 4, P.white); R(c, ey, 2, 2, P.ink); R(c, ey, 1, 1, '#fff'); R(c - 1, ey - 1, 4, 1, P.ink); return; }
    if (e === 4) { const a = side ? ex + s * 1 : ex - 5, w = side ? 5 : 10; R(a, ey, w, 2, P.ink); R(a + 1, ey, 1, 1, P.sky); if (!side) R(ex - 4, ey, 3, 3, P.ink), R(ex + 1, ey, 3, 3, P.ink); return; }
    for (const cx of eyes) {
      if (e === 1) { R(cx, ey + 1, 2, 1, P.ink); R(cx, ey + 2, 2, 1, '#fff'); continue; }
      R(cx, ey, 2, 3, '#fff'); R(cx + (side ? (s > 0 ? 1 : 0) : 0), ey + 1, 1, 2, P.ink);
      if (e === 3) { R(cx + 1, ey, 1, 1, P.yellow); R(cx - 1, ey - 1, 1, 1, P.yellow); }
      if (e === 2) { R(cx - (cx < ex ? 0 : 1), ey - 2 + (cx < ex ? 0 : 0), 3, 1, P.ink); R(cx + (cx < ex ? 2 : -1), ey - 1, 1, 1, P.ink); }
    }
    if (e === 5) { const m = eyes[eyes.length - 1]; R(m - 1, ey - 1, 4, 1, P.gold); R(m - 1, ey + 3, 4, 1, P.gold); R(m - 1, ey - 1, 1, 5, P.gold); R(m + 2, ey - 1, 1, 5, P.gold); R(m + 2, ey + 4, 1, 3, P.gold); }
  }
  const sprCache = new Map();
  // returns canvas for look/dir/frame (frame 0 idle, 1..2 walk)
  G.charSprite = function (look, dir, frame) {
    const key = look.shape + ',' + look.color + ',' + look.pattern + ',' + look.hair + ',' + look.hairColor + ',' + look.hat + ',' + look.eyes + ',' + look.extra + '|' + dir + '|' + frame;
    let c = sprCache.get(key); if (c) return c;
    const [cv, x] = G.mk(SW, SH);
    const col = G.BODY_COLORS[look.color % 18][1], dk = G.shade(col, 0.72), lt = G.shade(col, 1.3), pc = G.shade(col, look.color === 14 ? 0.82 : 1.45);
    const m = masks[look.shape], bob = frame === 1 ? -1 : 0, side = dir === 2 || dir === 3, s = dir === 2 ? -1 : 1;
    const by = BY + bob;
    // cape behind body
    if (look.extra === 3 && dir !== 0) { x.fillStyle = P.red; x.fillRect(BX + 2 - (side ? s * 3 : 0), by + 4, 10, 11); x.fillStyle = P.dred; x.fillRect(BX + 2 - (side ? s * 3 : 0), by + 13, 10, 2); }
    // feet
    const fy = BY + 14; x.fillStyle = P.ink;
    const fo = frame === 1 ? [-1, 1] : frame === 2 ? [1, -1] : [0, 0];
    if (side) { x.fillRect(11 + fo[0] * 2, fy + 0, 4, 2); x.fillRect(12 + fo[1] * 2, fy + 1, 3, 2); }
    else { x.fillRect(8, fy + (fo[0] > 0 ? -1 : 0), 4, 2); x.fillRect(14, fy + (fo[1] > 0 ? -1 : 0), 4, 2); x.fillStyle = P.dark; x.fillRect(8, fy + 1 + (fo[0] > 0 ? -1 : 0), 4, 1); x.fillRect(14, fy + 1 + (fo[1] > 0 ? -1 : 0), 4, 1); }
    // body with outline & shading
    const ins = (u, v) => u >= 0 && v >= 0 && u < BW && v < BW && m[v * BW + u];
    for (let v = 0; v < BW; v++) for (let u = 0; u < BW; u++) {
      if (!ins(u, v)) { if (ins(u - 1, v) || ins(u + 1, v) || ins(u, v - 1) || ins(u, v + 1)) pset(x, P.ink, BX + u, by + v); continue; }
      let c = col;
      if (patternAt(look.pattern, u, v)) c = pc;
      if (!ins(u + 1, v) || !ins(u, v + 1)) c = dk; else if (!ins(u - 1, v) || !ins(u, v - 1)) c = lt;
      if (look.shape === 3 && u >= 7 && c !== dk) c = G.shade(c, 0.85); // pyramid second face
      if (look.shape === 4 && v <= 3 && c !== dk) c = G.shade(c, 1.15); // cylinder top
      pset(x, c, BX + u, by + v);
    }
    // outline corners left out: diagonals
    for (let v = -1; v <= BW; v++) for (let u = -1; u <= BW; u++) if (!ins(u, v) && !(ins(u - 1, v) || ins(u + 1, v) || ins(u, v - 1) || ins(u, v + 1)) && false) pset(x, P.ink, BX + u, by + v);
    // extras front
    const ey = by + EYE_Y[look.shape], ex = 13;
    const R = (a, b, w, h, c) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
    if (look.extra === 5) { if (dir === 1) { R(8, by + 5, 10, 8, P.brown); R(9, by + 7, 8, 2, P.tan); R(12, by + 10, 2, 2, P.gold); } else if (side) R(13 - s * 7 - (s > 0 ? 1 : 0), by + 5, 3, 8, P.brown); else { R(8, by + 5, 1, 6, P.dbrown); R(17, by + 5, 1, 6, P.dbrown); } }
    drawEyes(x, look, dir, ex, ey);
    if (dir !== 1) {
      if (look.extra === 1) { const mx = side ? ex + s * 3 - 2 : ex - 3; R(mx, ey + 4, side ? 4 : 6, 1, P.dbrown); R(mx - 1, ey + 5, 1, 1, P.dbrown); R(mx + (side ? 4 : 6), ey + 5, 1, 1, P.dbrown); }
      else if (look.eyes !== 6 && look.eyes !== 4) { const mx = side ? ex + s * 3 : ex - 1; R(mx, ey + 5, 2, 1, P.ink); }
      if (look.extra === 2) { R(ex - 3, by + 12, 2, 3, P.red); R(ex + 1, by + 12, 2, 3, P.red); R(ex - 1, by + 13, 2, 1, P.dred); }
      if (look.extra === 6) { for (let i = -3; i <= 3; i++) R(ex + i - (i < 0 ? 0 : 1), by + 10 + Math.abs(i) * -0.5 + 2, 1, 1, i % 2 ? P.gold : P.yellow); R(ex - 1, by + 13, 2, 2, P.gold); }
      if (look.extra === 3 && dir === 0) { R(BX + 1, by + 9, 1, 5, P.red); R(BX + 12, by + 9, 1, 5, P.red); }
    }
    if (look.extra === 4) { R(BX + 2, by + 9, 10, 2, P.teal); R(BX + 2, by + 10, 10, 1, G.shade(P.teal, .7)); if (dir !== 1) R(ex + 2, by + 11, 2, 4, P.teal); }
    // hair + hat
    const hy = by + TOP_Y[look.shape] + (look.shape === 0 || look.shape === 5 ? 2 : 0);
    drawHair(x, look, dir, 13, hy, HEAD_W[look.shape]);
    if (look.hat) drawHat(x, look, dir, hy - hairTop(look.hair) + (look.hair === 8 ? 0 : 2));
    // outline hair/hat region with ink via second pass: simple approach -> outline whole sprite
    c = outline(cv, P.ink);
    if (sprCache.size > 3000) sprCache.clear();
    sprCache.set(key, c); return c;
  };
  // draw character at world pos (feet) on ctx
  G.drawChar = function (look, dir, frame, sx, sy, alpha) {
    const c = G.charSprite(look, dir, frame);
    if (dir === 2) { // left = mirrored right
      const c2 = G.charSprite(look, 3, frame);
      ctx.save(); if (alpha != null) ctx.globalAlpha = alpha; ctx.translate(Math.round(sx) + 14, 0); ctx.scale(-1, 1); ctx.drawImage(c2, 0, Math.round(sy) - SH + 1); ctx.restore(); return;
    }
    if (alpha != null) { ctx.globalAlpha = alpha; }
    ctx.drawImage(c, Math.round(sx) - 14, Math.round(sy) - SH + 1);
    ctx.globalAlpha = 1;
  };
  // portrait (front, idle) scaled
  G.portrait = function (look, x, y, sc) { const c = G.charSprite(look, 0, 0); ctx.drawImage(c, x, y, c.width * (sc || 1), c.height * (sc || 1)); };
  G.randomLook = function () { const r = n => Math.floor(Math.random() * n); return { shape: r(11), color: r(18), pattern: Math.random() < .6 ? 0 : r(4), hair: r(10), hairColor: r(10), hat: Math.random() < .4 ? 0 : r(9), eyes: r(7), extra: Math.random() < .3 ? 0 : r(7) }; };

  // ---------- object sprites (the "bodies") ----------
  const OP = { k: P.ink, w: P.white, l: P.light, g: P.grey, m: P.mid, r: P.red, R: P.dred, o: P.orange, y: P.yellow, Y: P.gold, b: P.blue, B: P.dblue, s: P.sky, n: P.brown, N: P.dbrown, t: P.tan, c: P.cream, e: P.green, E: P.dgreen, p: P.pink, u: P.purple, d: P.dark };
  const OBJ_GRIDS = [
    [ // teapot
      '......kk......', '.....kyyk.....', '...kkkkkkkk...', '..kssssssssk..', 'kkksswssssssk.k', 'k.kswsssssssskk', 'k.kssssssssssk.', '.kksssssssssk..', '..kssssssssk...', '..kBBBBBBBBk...', '...kkkkkkkk....'].map(r => r.slice(0, 14).padEnd(14, '.')),
    [ // lamp
      '....kkkkkk....', '...kyyyyyyk...', '..kyywyyyyyk..', '.kyyyyyyyyyyk.', 'kkkkkkkkkkkkkk', '......kk......', '......kk......', '......kk......', '......kk......', '....kkkkkk....', '...knnnnnnk...', '...kkkkkkkk...'],
    [ // rubber duck
      '...kkkk.......', '..kyyyyk......', '.kyykyyyk.....', '.kyyyyyykkk...', '..kyyyyokoo...', '...kyyyykkk...', 'kk.kyyyyyk....', 'kykkyyyyyykk..', 'kyyyyyyyyyyyk.', '.kyyyyyywyyyk.', '..kYyyyyyyyk..', '...kkkkkkkk...'],
    [ // traffic cone
      '......kk......', '.....kook.....', '.....kook.....', '....kwwwwk....', '....kwwwwk....', '...koooooook...', '...koooooook..', '..kwwwwwwwwk..', '..kwwwwwwwwk..', '.koooooooooook', 'kkkkkkkkkkkkkk', 'kddddddddddddk'].map(r => r.slice(0, 14).padEnd(14, '.')),
    [ // toaster
      '..k.k...k.k...', '..knk...knk...', '.kkkkkkkkkkkk.', 'kglllllllllggk', 'kglkkkklkkkkgk', 'kglllllllllggk', 'kglllllllllggk', 'kgllllllllgggk', 'kggggggggggggk', 'kkkkkkkkkkkkkk', '.kk........kk.'],
    [ // chair
      '..kkkkkkkk....', '..knnnnnnk....', '..kntttnnk....', '..knnnnnnk....', '..knk..knk....', '..knk..knk....', 'kkkkkkkkkkkk..', 'knnnnnnnnnnk..', 'kkkkkkkkkkkk..', '.knk.....knk..', '.knk.....knk..', '.kkk.....kkk..'],
    [ // alarm clock
      '.kk.......kk..', 'kYYk.....kYYk.', '.kkkkkkkkkk...', '.krrrrrrrrrrk.', 'krwwwwkwwwwrk.', 'krwwwwkwwwwrk.', 'krwwwwkkkwwrk.', 'krwwwwwwwwwrk.', 'krwwwwwwwwwrk.', '.krrrrrrrrrk..', '.kk.kkkkk.kk..', '.kk.......kk..'],
    [ // potted plant
      '....k.kk.k....', '...kekeekek...', '..keeEekeEek..', '.keEekeeekEek.', '..keekEeEeek..', '...kkekkekk...', '.....kEk......', '...kkkkkkkk...', '...koooooook..', '....knnnnnk...', '....koooook...', '.....kkkkk....'].map(r => r.slice(0, 14).padEnd(14, '.')),
    [ // boot
      '...kkkkk......', '...knnnnk.....', '...kntnnk.....', '...knnnnk.....', '...knnnnk.....', '...knntnk.....', '...knnnnkkkk..', '..knnnnnnnnnk.', '..knnnnnnnnnnk', '..kNNNNNNNNNNk', '..kkkkkkkkkkkk'],
    [ // trophy
      '..kkkkkkkkkk..', 'kkkYYYYYYYYkkk', 'kYkYwYYYYYYkYk', 'kYkYwYYYYYYkYk', '.kkYYYYYYYYkk.', '...kYYYYYYk...', '....kYYYYk....', '.....kYYk.....', '.....kYYk.....', '...kkkkkkkk...', '...knnnnnnk...', '...kkkkkkkk...'],
  ];
  const objCache = {};
  G.objectSprite = function (i) { if (!objCache[i]) objCache[i] = fromGrid(OBJ_GRIDS[i], OP); return objCache[i]; };
  // object body wearing the player's hat/hair (so others can recognise who it was)
  const bodyCache = new Map();
  G.bodySprite = function (objIdx, look) {
    const key = objIdx + '|' + (look ? look.hair + ',' + look.hairColor + ',' + look.hat : '-');
    let c = bodyCache.get(key); if (c) return c;
    const [cv, x] = G.mk(26, 32);
    const o = G.objectSprite(objIdx); x.drawImage(o, 13 - 7, 31 - o.height);
    if (look) { const hy = 31 - o.height + 2; drawHair(x, look, 0, 13, hy, 8); if (look.hat) drawHat(x, look, 0, hy - hairTop(look.hair) + (look.hair === 8 ? 0 : 2)); }
    c = outline(cv, P.ink); bodyCache.set(key, c); return c;
  };

  // ---------- dithered vision mask ----------
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const visCache = {};
  G.visionMask = function (r) {
    r = Math.max(8, Math.round(r)); if (visCache[r]) return visCache[r];
    const s = r * 2 + 4; const [c, x] = G.mk(s, s); const id = x.createImageData(s, s), d = id.data;
    const edge = Math.max(6, r * 0.22);
    for (let y = 0; y < s; y++) for (let xx = 0; xx < s; xx++) {
      const dd = Math.hypot(xx - s / 2 + .5, y - s / 2 + .5); let a;
      if (dd <= r - edge) a = 0; else if (dd >= r) a = 1; else { const t = (dd - (r - edge)) / edge; a = (t * 16 > BAYER[(y & 3) * 4 + (xx & 3)]) ? 1 : 0; }
      const i = (y * s + xx) * 4; d[i] = 8; d[i + 1] = 6; d[i + 2] = 14; d[i + 3] = a ? 255 : 0;
    }
    x.putImageData(id, 0, 0); visCache[r] = c; if (Object.keys(visCache).length > 120) for (const k in visCache) delete visCache[k];
    return c;
  };
  G.drawVision = function (sx, sy, r) {
    const m = G.visionMask(r), s = m.width, x0 = Math.round(sx - s / 2), y0 = Math.round(sy - s / 2);
    ctx.drawImage(m, x0, y0); ctx.fillStyle = '#08060e';
    ctx.fillRect(0, 0, G.W, Math.max(0, y0)); ctx.fillRect(0, y0 + s, G.W, G.H - y0 - s);
    ctx.fillRect(0, y0, Math.max(0, x0), s); ctx.fillRect(x0 + s, y0, G.W - x0 - s, s);
  };

  // ---------- particles / effects (local only, purely visual) ----------
  G.fx = [];
  G.addFx = function (f) { f.t = 0; G.fx.push(f); };
  G.smoke = function (x, y, col, n) { for (let i = 0; i < (n || 14); i++) G.addFx({ k: 'p', x: x + (Math.random() - .5) * 10, y: y - 8 + (Math.random() - .5) * 10, vx: (Math.random() - .5) * 40, vy: -10 - Math.random() * 30, life: .6 + Math.random() * .5, c: col || (Math.random() < .5 ? P.purple : P.glow), s: 1 + (Math.random() * 3 | 0) }); };
  G.sparkle = function (x, y, col, n) { for (let i = 0; i < (n || 8); i++) G.addFx({ k: 's', x: x + (Math.random() - .5) * 14, y: y - 10 + (Math.random() - .5) * 14, vx: 0, vy: -8, life: .5 + Math.random() * .4, c: col || P.glow }); };
  G.updateFx = function (dt, camx, camy) {
    for (let i = G.fx.length - 1; i >= 0; i--) {
      const f = G.fx[i]; f.t += dt; if (f.t > f.life) { G.fx.splice(i, 1); continue; }
      const sx = Math.round(f.x - camx), sy = Math.round(f.y - camy);
      if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= .95; const s = Math.max(1, Math.round(f.s * (1 - f.t / f.life) + 1)); G.rect(sx, sy, s, s, f.c); }
      else if (f.k === 's') { f.y += f.vy * dt; const on = ((f.t * 12) | 0) % 2; ctx.fillStyle = f.c; ctx.fillRect(sx, sy - 1, 1, 3); ctx.fillRect(sx - 1, sy, 3, 1); if (on) ctx.fillRect(sx, sy, 1, 1); }
      else if (f.k === 'zap') { // lightning from a to b
        ctx.fillStyle = f.t % .1 < .05 ? P.glow : '#fff'; let px = f.x, py = f.y; const n = 8;
        for (let k = 1; k <= n; k++) { const tx = f.x + (f.x2 - f.x) * k / n + (k < n ? (Math.random() - .5) * 8 : 0), ty = f.y + (f.y2 - f.y) * k / n + (k < n ? (Math.random() - .5) * 8 : 0); line(px - camx, py - camy, tx - camx, ty - camy); px = tx; py = ty; }
      }
      else if (f.k === 'flash') { ctx.globalAlpha = 1 - f.t / f.life; G.rect(sx - 16, sy - 30, 32, 34, '#fff'); ctx.globalAlpha = 1; }
      else if (f.k === 'shrink') { const k = 1 - f.t / f.life; const c = G.charSprite(f.look, 0, 0); const w = c.width * k, h = c.height * k; ctx.drawImage(c, sx - w / 2, sy - h, w, h); }
      else if (f.k === 'bubble') { // quick chat bubble follows nothing (static)
      }
    }
  };
  function line(x0, y0, x1, y1) { x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy, n = 0; while (n++ < 400) { ctx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
  G.line = line;

  // ---------- emotes (pixel icons 8x8) ----------
  const EMO = {
    thumbs: ['...kk...', '..kyk...', '..kyk...', 'kkkyykk.', 'kyyyyyyk', 'kyyyyyyk', 'kyyyyyk.', '.kkkkk..'],
    question: ['..kkkk..', '.kwwwwk.', '.kwkkwk.', '...kwwk.', '...kwk..', '...kk...', '...kwk..', '...kk...'],
    heart: ['.kk.kk..', 'krrkrrk.', 'krrrrrk.', 'krrrrrk.', '.krrrk..', '..krk...', '...k....', '........'],
    laugh: ['.kkkkk..', 'kyyyyyk.', 'kykykyk.', 'kyyyyyk.', 'kkkkkkk.', 'kwrrrwk.', '.kkkkk..', '........'],
    shocked: ['.kkkkk..', 'kyyyyyk.', 'kwkykwk.', 'kyyyyyk.', 'kyykyyk.', 'kykkkyk.', '.kkkkk..', '........'],
  };
  const emoCache = {};
  G.emote = function (n) { if (!emoCache[n]) emoCache[n] = fromGrid(EMO[n], OP); return emoCache[n]; };

  // ---------- logo: spinning isosceles triangle ----------
  let logoTri = null;
  G.drawLogo = function (cx, cy, t, sc, target) {
    if (!logoTri) {
      const rows = []; for (let y = 0; y < 20; y++) { let r = ''; for (let x = 0; x < 16; x++) { const hw = 0.6 + y * 0.4; const ins = Math.abs(x + .5 - 8) <= hw; const edge = ins && (Math.abs(x + .5 - 8) > hw - 1.2 || y === 19); r += ins ? (edge ? 'k' : (x < 8 - y * 0.15 ? 'y' : 'o')) : '.'; } rows.push(r); }
      logoTri = [fromGrid(rows, { k: P.ink, y: P.yellow, o: P.orange }), fromGrid(rows, { k: P.ink, y: P.pink, o: P.purple })];
    }
    const k = Math.cos(t * 2), front = k >= 0 ? 0 : 1, w = Math.max(1, Math.round(16 * Math.abs(k))) * sc;
    (target || ctx).drawImage(logoTri[front], Math.round(cx - w / 2), Math.round(cy - 10 * sc), w, 20 * sc);
  };
  // chunky title
  G.title = function (s, cx, y, sc, t) {
    const w = s.length * 8 * sc; let x = Math.round(cx - w / 2);
    for (let i = 0; i < s.length; i++) {
      const by = Math.round(Math.sin(t * 3 + i * .5) * 1.5) * (sc > 2 ? 1 : 0);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [2, 2], [-1, 1], [1, -1], [-1, -1]]) G.text(s[i], x + i * 8 * sc + dx * Math.ceil(sc / 2), y + by + dy * Math.ceil(sc / 2), dx === 2 ? P.dpurple : P.ink, { sc });
      G.text(s[i], x + i * 8 * sc, y + by, i % 2 ? P.yellow : P.gold, { sc });
    }
  };
})();
