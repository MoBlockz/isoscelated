// ISOSCELATED - 13 pixel-art chore mini-games (5-15 seconds each). Mouse, touch and keyboard friendly.
'use strict';
const Tasks = {};
(function () {
  const P = G.P;
  let cur = null; // {kind, st, onDone, t, doneT}
  Tasks.active = () => !!cur;
  Tasks.kind = () => cur && cur.kind;
  Tasks.open = function (kind, onDone) { cur = { kind, st: {}, onDone, t: 0, doneT: -1 }; GAMES[kind].init(cur.st); Snd.sfx('select'); UI.eat('use'); UI.eat('ok'); };
  Tasks.close = function () { cur = null; };
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1);[a[i], a[j]] = [a[j], a[i]]; } return a; };
  const inR = (x, y, r) => UI.ptr.x >= r.x && UI.ptr.y >= r.y && UI.ptr.x < r.x + r.w && UI.ptr.y < r.y + r.h;
  const near = (x, y, d) => Math.hypot(UI.ptr.x - x, UI.ptr.y - y) < d;
  const ctxc = () => G.ctx;
  function circle(x, y, r, c) { const ctx = G.ctx; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), r, 0, 7); ctx.fill(); }
  function ring(x, y, r, c, w) { const ctx = G.ctx; ctx.strokeStyle = c; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.arc(Math.round(x) + .5, Math.round(y) + .5, r, 0, 7); ctx.stroke(); }
  function thick(x0, y0, x1, y1, c, w) { const ctx = G.ctx; ctx.fillStyle = c; const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))); for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n - w / 2), Math.round(y0 + (y1 - y0) * i / n - w / 2), w, w); }
  function gear(x, y, r, c) { const ctx = G.ctx; ctx.fillStyle = c; for (let a = 0; a < 8; a++) { const an = a / 8 * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(an) * r - 2), Math.round(y + Math.sin(an) * r - 2), 4, 4); } circle(x, y, r - 1, c); circle(x, y, 2, P.dark); }
  function msg(st, m) { st.msg = m; st.msgT = 1.2; }

  // generic drag & drop helper: items [{x,y,r,id}], targets [{x,y,r,accept(item)}]
  function dragUpdate(st, items, onDrop) {
    const p = UI.ptr;
    if (p.justDown && !st.drag) { for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (!it.placed && Math.hypot(p.x - it.x, p.y - it.y) < it.r + 4) { st.drag = it; st.ox = it.x - p.x; st.oy = it.y - p.y; it.hx = it.x; it.hy = it.y; break; } } }
    if (st.drag && p.down) { st.drag.x = p.x + st.ox; st.drag.y = p.y + st.oy; }
    if (st.drag && !p.down) { const it = st.drag; st.drag = null; if (!onDrop(it)) { it.x = it.hx; it.y = it.hy; Snd.sfx('error'); } else Snd.sfx('vote'); }
  }

  const GAMES = {
    pipes: {
      title: 'Connect the paint pipes!',
      init(s) { s.cols = [P.red, P.blue, P.yellow]; s.right = shuffle([0, 1, 2]); s.done = [false, false, false]; s.drag = -1; },
      draw(s, x, y, w, h) {
        const lx = x + 20, rx = x + w - 20; const yy = i => y + 30 + i * (h - 50) / 2;
        G.rect(x + 8, y + 20, 14, h - 30, P.mid); G.rect(x + w - 22, y + 20, 14, h - 30, P.mid);
        for (let i = 0; i < 3; i++) {
          G.rect(lx - 12, yy(i) - 4, 14, 8, s.cols[i]); G.rect(rx - 2, yy(s.right.indexOf(i)) - 4, 14, 8, s.cols[i]);
          if (s.done[i]) thick(lx + 2, yy(i), rx - 2, yy(s.right.indexOf(i)), s.cols[i], 5);
        }
        const p = UI.ptr;
        if (p.justDown) for (let i = 0; i < 3; i++) if (!s.done[i] && near(lx, yy(i), 12)) s.drag = i;
        if (s.drag >= 0) { thick(lx + 2, yy(s.drag), p.x, p.y, s.cols[s.drag], 5); if (!p.down) { const j = s.drag; s.drag = -1; if (near(rx + 4, yy(s.right.indexOf(j)), 14)) { s.done[j] = true; Snd.sfx('vote'); } else Snd.sfx('error'); } }
        return s.done.every(Boolean);
      }
    },
    gears: {
      title: 'Put each gear in its matching slot!',
      init(s) { const sizes = [6, 9, 12, 15]; s.slots = shuffle(sizes.slice()).map((r, i) => ({ r, i })); s.items = shuffle(sizes.slice()).map((r, i) => ({ r, i, x: 0, y: 0, placed: false, init: false })); },
      draw(s, x, y, w, h) {
        const n = 4, sx = i => x + 30 + i * (w - 60) / 3;
        s.slots.forEach((sl, i) => { sl.x = sx(i); sl.y = y + 45; ring(sl.x, sl.y, sl.r, P.mid, 2); });
        s.items.forEach((it, i) => { if (!it.init) { it.x = sx(i); it.y = y + h - 30; it.init = true; } });
        dragUpdate(s, s.items.map(it => Object.assign(it, { r: it.r })), it => { const sl = s.slots.find(sl => Math.hypot(sl.x - it.x, sl.y - it.y) < 14 && sl.r === it.r && !sl.full); if (!sl) return false; sl.full = true; it.placed = true; it.x = sl.x; it.y = sl.y; return true; });
        s.items.forEach(it => gear(it.x, it.y, it.r, it.placed ? P.gold : P.grey));
        return s.items.every(it => it.placed);
      }
    },
    code: {
      title: 'Type the blueprint code!',
      init(s) { s.code = String(1000 + rnd(9000)); s.in = ''; },
      draw(s, x, y, w, h) {
        G.rect(x + 10, y + 22, 70, 40, '#2f5da8'); G.text('CODE', x + 18, y + 28, P.white); G.text(s.code, x + 18, y + 44, P.yellow);
        G.box(x + 10, y + 70, 70, 20, P.white); G.text(s.in.padEnd(4, '_'), x + 24, y + 77, P.ink);
        const kx = x + w - 104; const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
        const press = k => { if (k === 'C') s.in = ''; else if (k === 'OK') { if (s.in === s.code) s.ok = true; else { s.in = ''; Snd.sfx('error'); msg(s, 'Wrong code!'); } } else if (s.in.length < 4) { s.in += k; Snd.sfx('blip'); } };
        keys.forEach((k, i) => { const bx = kx + (i % 3) * 32, by = y + 20 + Math.floor(i / 3) * 24; UI.button(bx, by, 28, 20, k, () => press(k), { nav: false, silent: true }); });
        for (let d = 0; d <= 9; d++) if (UI.hit('key:' + d)) press(String(d));
        if (UI.hit('key:Enter')) press('OK'); if (UI.hit('key:Backspace')) s.in = s.in.slice(0, -1);
        return !!s.ok;
      }
    },
    yarn: {
      title: 'Tap the knots to untangle the yarn!',
      init(s) { s.k = []; for (let i = 0; i < 6; i++) s.k.push({ u: .15 + Math.random() * .7, v: .2 + Math.random() * .6, on: true }); s.seed = Math.random() * 9; },
      draw(s, x, y, w, h) {
        const ctx = G.ctx; ctx.fillStyle = P.red;
        for (let i = 0; i < 300; i++) { const a = i * 0.21 + s.seed, rr = 20 + 30 * Math.sin(i * 0.13 + s.seed); const px = x + w / 2 + Math.cos(a) * rr * 1.6, py = y + h / 2 + 6 + Math.sin(a * 1.3) * rr * 0.8; ctx.fillRect(Math.round(px), Math.round(py), 2, 2); }
        s.k.forEach(k => { if (!k.on) return; const kx = x + k.u * w, ky = y + 10 + k.v * (h - 10); circle(kx, ky, 5, P.dred); circle(kx - 1, ky - 1, 2, P.pink); if (UI.ptr.justDown && near(kx, ky, 10)) { k.on = false; Snd.sfx('vote'); G.sparkle; } });
        return s.k.every(k => !k.on);
      }
    },
    sort: {
      title: 'Drag each block into its matching bin!',
      init(s) { s.items = shuffle([0, 0, 1, 1, 2, 2]).map((c, i) => ({ c, i, init: false, placed: false, r: 6 })); s.cnt = [0, 0, 0]; },
      draw(s, x, y, w, h) {
        const cols = [P.red, P.blue, P.yellow], bins = [0, 1, 2].map(i => ({ x: x + 25 + i * (w - 50) / 2, y: y + 40 }));
        bins.forEach((b, i) => { G.rect(b.x - 18, b.y - 14, 36, 28, P.dbrown); G.rect(b.x - 16, b.y - 12, 32, 6, cols[i]); for (let k = 0; k < s.cnt[i]; k++) G.rect(b.x - 14 + k * 14, b.y - 2, 12, 12, cols[i]); });
        s.items.forEach((it, i) => { if (!it.init) { it.x = x + 20 + i * (w - 40) / 5; it.y = y + h - 26; it.init = true; } });
        dragUpdate(s, s.items, it => { const bi = bins.findIndex(b => Math.abs(b.x - it.x) < 22 && Math.abs(b.y - it.y) < 20); if (bi !== it.c) return false; it.placed = true; s.cnt[bi]++; return true; });
        s.items.forEach(it => { if (it.placed) return; G.rect(it.x - 7, it.y - 7, 14, 14, P.ink); G.rect(it.x - 6, it.y - 6, 12, 12, cols[it.c]); G.rect(it.x - 5, it.y - 5, 4, 2, '#fff'); });
        return s.items.every(it => it.placed);
      }
    },
    cupcake: {
      title: 'Hold and trace the dots to frost the cupcake!',
      init(s) { s.n = 0; s.pts = []; for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 3.2, r = 30 - i * 2.6; s.pts.push([Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.55 - i * 2]); } },
      draw(s, x, y, w, h) {
        const cx = x + w / 2, cy = y + h / 2 + 14;
        G.rect(cx - 30, cy + 4, 60, 26, P.tan); for (let i = -28; i < 30; i += 6) G.rect(cx + i, cy + 6, 2, 24, P.brown);
        G.rect(cx - 36, cy - 4, 72, 10, P.cream);
        for (let i = 0; i < s.pts.length; i++) { const [px, py] = s.pts[i]; if (i < s.n) { circle(cx + px, cy + py, 7, P.pink); circle(cx + px - 2, cy + py - 2, 2, '#fff'); } else { circle(cx + px, cy + py, i === s.n ? 4 : 3, P.ink); circle(cx + px, cy + py, i === s.n ? 3 : 2, i === s.n ? ((performance.now() / 200 | 0) % 2 ? P.red : P.yellow) : P.white); } }
        if (UI.ptr.down && s.n < s.pts.length && near(cx + s.pts[s.n][0], cy + s.pts[s.n][1], 10)) { s.n++; Snd.sfx('blip'); }
        if (s.n === s.pts.length) circle(cx, cy - 26, 4, P.red);
        return s.n >= s.pts.length;
      }
    },
    compass: {
      title: 'Turn the needle to the star and hold it!',
      init(s) { s.target = Math.random() * Math.PI * 2; s.a = s.target + Math.PI * (0.6 + Math.random()); s.hold = 0; },
      draw(s, x, y, w, h, dt) {
        const cx = x + w / 2, cy = y + h / 2 + 8, r = Math.min(w, h) / 2 - 18;
        circle(cx, cy, r + 4, P.gold); circle(cx, cy, r, P.white); ring(cx, cy, r - 6, P.light);
        const tx = cx + Math.cos(s.target) * (r - 4), ty = cy + Math.sin(s.target) * (r - 4); G.text('♥', tx - 4, ty - 4, P.red);
        if (UI.ptr.down && near(cx, cy, r + 20)) s.a = Math.atan2(UI.ptr.y - cy, UI.ptr.x - cx);
        if (UI.held('left')) s.a -= dt * 2; if (UI.held('right')) s.a += dt * 2;
        thick(cx, cy, cx + Math.cos(s.a) * (r - 8), cy + Math.sin(s.a) * (r - 8), P.red, 3); circle(cx, cy, 3, P.ink);
        let d = Math.abs(((s.a - s.target) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (d < 0.14) { s.hold += dt; G.rect(cx - 30, cy + r + 6, 60 * Math.min(1, s.hold / 0.8), 4, P.green); } else s.hold = 0;
        return s.hold >= 0.8;
      }
    },
    windbox: {
      title: 'Tap (or press A) when the note is in the green!',
      init(s) { s.t = 0; s.hits = 0; s.zone = 0.4 + Math.random() * 0.3; s.cool = 0; },
      draw(s, x, y, w, h, dt) {
        s.t += dt; s.cool -= dt; const bx = x + 20, bw = w - 40, by = y + 50;
        const pos = (Math.sin(s.t * 3.2) + 1) / 2;
        G.rect(bx, by, bw, 14, P.dark); G.rect(bx + bw * (s.zone - 0.09), by, bw * 0.18, 14, P.green);
        G.rect(bx + bw * pos - 2, by - 4, 5, 22, P.yellow); G.text('♥', bx + bw * pos - 4, by - 14, P.pink);
        for (let i = 0; i < 4; i++) G.rect(x + w / 2 - 34 + i * 18, y + h - 30, 14, 14, i < s.hits ? P.gold : P.mid);
        const tapped = (UI.ptr.justDown && UI.ptr.y > y + 16) || UI.hit('ok') || UI.hit('use');
        if (tapped && s.cool <= 0) { s.cool = 0.25; if (Math.abs(pos - s.zone) < 0.1) { s.hits++; Snd.sfx('vote'); s.zone = 0.15 + Math.random() * 0.7; } else { s.hits = Math.max(0, s.hits - 1); Snd.sfx('error'); } }
        return s.hits >= 4;
      }
    },
    keycard: {
      title: 'Swipe the keycard through the reader!',
      init(s) { s.cx = 0; s.t0 = 0; s.drag = false; s.init = false; },
      draw(s, x, y, w, h) {
        const ry = y + h / 2, x0 = x + 24, x1 = x + w - 30;
        if (!s.init) { s.cx = x0; s.init = true; }
        G.rect(x + 10, ry - 10, w - 20, 30, P.grey); G.rect(x + 10, ry + 4, w - 20, 4, P.ink);
        G.rect(x + w - 30, ry - 24, 20, 14, s.ok ? P.lime : (s.bad ? P.red : P.dark));
        const p = UI.ptr;
        if (p.justDown && Math.abs(p.x - s.cx) < 22 && Math.abs(p.y - ry) < 30) { s.drag = true; s.t0 = performance.now(); s.ox = s.cx - p.x; s.bad = false; }
        if (s.drag) { s.cx = Math.max(x0, Math.min(x1, p.x + s.ox)); if (!p.down) { s.drag = false; if (s.cx >= x1 - 2) { const dt = (performance.now() - s.t0) / 1000; if (dt < 0.35) { msg(s, 'Too fast! Try again.'); s.bad = true; Snd.sfx('error'); } else if (dt > 1.4) { msg(s, 'Too slow! Try again.'); s.bad = true; Snd.sfx('error'); } else s.ok = true; } s.cx = s.ok ? x1 : x0; } }
        G.rect(s.cx - 18, ry - 8, 36, 22, P.ink); G.rect(s.cx - 17, ry - 7, 34, 20, P.sky); G.rect(s.cx - 14, ry - 4, 10, 10, P.white); G.rect(s.cx - 1, ry - 3, 14, 2, P.dblue); G.rect(s.cx - 1, ry + 2, 10, 2, P.dblue);
        return !!s.ok;
      }
    },
    rings: {
      title: 'Stack the rings: biggest first!',
      init(s) { s.r = shuffle([0, 1, 2, 3]).map((k, i) => ({ k, i, on: false })); s.next = 0; },
      draw(s, x, y, w, h) {
        const cols = [P.red, P.orange, P.yellow, P.lime], pw = [44, 36, 28, 20];
        const px = x + w * 0.72, py = y + h - 24; G.rect(px - 2, py - 70, 4, 70, P.brown); G.rect(px - 26, py, 52, 6, P.dbrown);
        let stack = 0; s.r.filter(r => r.on).sort((a, b) => a.k - b.k).forEach(r => { G.rect(px - pw[r.k] / 2, py - 10 - stack * 10, pw[r.k], 9, cols[r.k]); G.rect(px - pw[r.k] / 2 + 2, py - 9 - stack * 10, 6, 2, '#fff'); stack++; });
        s.r.forEach((r, i) => { if (r.on) return; const rx = x + 20 + (i % 2) * 60, ry = y + 34 + Math.floor(i / 2) * 40; G.rect(rx, ry, pw[r.k], 9, cols[r.k]); if (UI.ptr.justDown && UI.ptr.x >= rx - 2 && UI.ptr.x < rx + pw[r.k] + 2 && UI.ptr.y >= ry - 6 && UI.ptr.y < ry + 15) { if (r.k === s.next) { r.on = true; s.next++; Snd.sfx('vote'); } else { Snd.sfx('error'); msg(s, 'Biggest ring first!'); } } });
        return s.next >= 4;
      }
    },
    matchtoys: {
      title: 'Find the 3 matching toys!',
      init(s) { const odd = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); const m = odd[0]; const g = [m, m, m].concat(odd.slice(1, 7)); s.g = shuffle(g); s.m = m; s.sel = []; },
      draw(s, x, y, w, h) {
        const cw = 34, ox = x + w / 2 - cw * 1.5, oy = y + 20;
        s.g.forEach((o, i) => {
          const cx = ox + (i % 3) * cw, cy = oy + Math.floor(i / 3) * cw; const sel = s.sel.includes(i);
          G.box(cx, cy, cw - 2, cw - 2, sel ? P.yellow : P.white); G.ctx.drawImage(G.objectSprite(o), cx + 9, cy + 9);
          if (UI.ptr.justDown && UI.ptr.x >= cx && UI.ptr.y >= cy && UI.ptr.x < cx + cw - 2 && UI.ptr.y < cy + cw - 2 && !sel) { if (o === s.m) { s.sel.push(i); Snd.sfx('vote'); } else { s.sel = []; Snd.sfx('error'); msg(s, 'Not a match!'); } }
        });
        return s.sel.length >= 3;
      }
    },
    gauge: {
      title: 'Hold to fill the boiler gauge. Let go at the line!',
      init(s) { s.v = 0; s.line = 0.5 + Math.random() * 0.35; s.holding = false; },
      draw(s, x, y, w, h, dt) {
        const gx = x + 30, gy = y + 24, gh = h - 40; G.rect(gx - 2, gy - 2, 24, gh + 4, P.ink); G.rect(gx, gy, 20, gh, P.dark);
        G.rect(gx, gy + gh * (1 - s.v), 20, gh * s.v, s.v > s.line + 0.06 ? P.red : P.orange);
        G.rect(gx - 6, gy + gh * (1 - s.line), 32, 2, P.lime); G.text('◀', gx + 26, gy + gh * (1 - s.line) - 3, P.lime);
        const b = { x: x + w - 90, y: y + h / 2 - 20, w: 70, h: 40 };
        const hold = (UI.ptr.down && inR(0, 0, b)) || UI.held('ok') || UI.held('use');
        UI.button(b.x, b.y + (hold ? 1 : 0), b.w, b.h, hold ? 'FILL!' : 'HOLD', null, { nav: false, col: P.yellow });
        if (hold) { s.holding = true; s.v = Math.min(1, s.v + dt * 0.45); }
        else if (s.holding) { s.holding = false; if (Math.abs(s.v - s.line) <= 0.06) s.ok = true; else { msg(s, s.v < s.line ? 'Not enough! Try again.' : 'Too much! Try again.'); Snd.sfx('error'); s.v = 0; } }
        return !!s.ok;
      }
    },
    candy: {
      title: 'Tap the jars to refill them with candy!',
      init(s) { s.j = [0, 0, 0]; },
      draw(s, x, y, w, h) {
        const cols = [P.red, P.lime, P.sky];
        for (let i = 0; i < 3; i++) {
          const jx = x + 20 + i * (w - 40) / 3 + 6, jy = y + 30, jw = (w - 40) / 3 - 12, jh = h - 50;
          G.rect(jx, jy, jw, jh, P.ink); G.rect(jx + 1, jy + 1, jw - 2, jh - 2, '#cfe8ff'); G.rect(jx + 3, jy - 4, jw - 6, 5, P.pink);
          const f = s.j[i] / 5; for (let k = 0; k < Math.floor(f * 12); k++) circle(jx + 5 + (k % 3) * (jw - 10) / 2, jy + jh - 5 - Math.floor(k / 3) * 6, 3, cols[(k + i) % 3]);
          if (UI.ptr.justDown && UI.ptr.x >= jx && UI.ptr.x < jx + jw && UI.ptr.y >= jy - 6 && UI.ptr.y < jy + jh && s.j[i] < 5) { s.j[i]++; Snd.sfx('blip'); }
        }
        return s.j.every(v => v >= 5);
      }
    }
  };
  Tasks.GAMES = GAMES;

  Tasks.draw = function (dt) {
    if (!cur) return;
    const g = GAMES[cur.kind];
    UI.group('task'); UI.blocker();
    const ctx = G.ctx; ctx.fillStyle = 'rgba(10,6,20,0.6)'; ctx.fillRect(0, 0, G.W, G.H);
    const w = Math.min(G.W - 16, 260), h = Math.min(G.H - 16, 180), x = Math.floor((G.W - w) / 2), y = Math.floor((G.H - h) / 2);
    G.box(x, y, w, h, '#f3ead8');
    const lines = G.wrap(g.title, Math.floor((w - 36) / 8)); lines.forEach((l, i) => G.text(l, x + 8, y + 7 + i * 9, P.ink));
    const top = y + lines.length * 9 + 2;
    cur.t += dt;
    let done = cur.doneT >= 0;
    if (!done) { if (g.draw(cur.st, x + 4, top, w - 8, h - (top - y) - 4, dt)) { cur.doneT = 0; Snd.sfx('task'); } }
    else { g.draw(cur.st, x + 4, top, w - 8, h - (top - y) - 4, 0); }
    if (cur.st.msgT > 0) { cur.st.msgT -= dt; G.text(cur.st.msg, x + w / 2, y + h - 14, P.red, { al: 'c', ol: P.white }); }
    UI.button(x + w - 22, y + 3, 18, 16, 'X', () => Tasks.close(), { nav: false, col: P.pink });
    if (UI.hit('back')) Tasks.close();
    if (cur && cur.doneT >= 0) {
      cur.doneT += dt; G.text('DONE!', x + w / 2, y + h / 2 - 8, P.green, { al: 'c', sc: 2, ol: P.ink });
      if (cur.doneT > 0.8) { const cb = cur.onDone; cur = null; cb && cb(); }
    }
  };
})();
