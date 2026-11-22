// needs: node tools/serve.js running, Microsoft Edge.
// For every map: (1) every doorway can be walked through, (2) a walker can go from the start to every station
// using the real movement + collision code, without getting stuck. Also checks seats/chute exits aren't inside things.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9530); const a = await newTab(b, 'http://localhost:8792/', 800, 480); await sleep(2500);
  const out = await a.eval(`(() => {
    const T = 16, res = [];
    for (const id of World.MAP_IDS.concat(['maze:12345', 'lobby'])) {
      const m = id === 'lobby' ? World.buildLobby() : World.buildMap(id), probs = [];
      // 1) doorways: the room tile right inside every door must be standable
      for (const r in m.doors) for (const k of m.doors[r]) { const x = k % m.w, y = (k / m.w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nk = (y + dy) * m.w + x + dx; if (m.room[nk] == r && World.hit(m, (x + dx) * T + 8, (y + dy) * T + 10, null)) probs.push('door blocked: ' + m.rooms[r].name + ' at ' + (x + dx) + ',' + (y + dy)); } }
      // 2) seats + chute exits + spawn must not be inside anything
      (m.seats || []).forEach((s, i) => { if (World.hit(m, s[0], s[1], null)) probs.push('meeting seat ' + i + ' is inside something'); });
      (m.chutes || []).forEach(c => { if (World.hit(m, c.x, c.y, null)) probs.push('chute exit ' + c.i + ' is inside something'); });
      if (World.hit(m, m.spawn[0], m.spawn[1], null)) probs.push('spawn inside something');
      // 3) walk from the spawn to every station with the real movement code (tile path + World.move)
      const flow = (tx, ty) => { const d = new Int16Array(m.w * m.h).fill(-1), q = [ty * m.w + tx]; d[q[0]] = 0; while (q.length) { const k = q.shift(), x = k % m.w, y = (k / m.w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, nk = ny * m.w + nx; if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || d[nk] >= 0 || !m.tiles[nk]) continue; if (m.solid[nk] && World.hit(m, nx * T + 8, ny * T + 10, null)) continue; d[nk] = d[k] + 1; q.push(nk); } } return d; };
      let stuckN = 0;
      for (const s of (m.stations || [])) {
        const e = { x: m.spawn[0], y: m.spawn[1] }, fl = flow(Math.floor(s.x / T), Math.floor(s.y / T)); let stuck = 0, ok = false;
        for (let step = 0; step < 6000; step++) {
          if (Math.hypot(e.x - s.x, e.y - s.y) < 22) { ok = true; break; }
          const tx = Math.floor(e.x / T), ty = Math.floor((e.y - 2) / T), here = fl[ty * m.w + tx]; let gx = s.x, gy = s.y;
          if (here > 1) { let best = null, bv = here; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = fl[(ty + dy) * m.w + tx + dx]; if (v >= 0 && v < bv) { bv = v; best = [dx, dy]; } } if (best) { gx = (tx + best[0]) * T + 8; gy = (ty + best[1]) * T + 10; } }
          const sp = 2, dx = Math.sign(gx - e.x) * Math.min(sp, Math.abs(gx - e.x)), dy = Math.sign(gy - e.y) * Math.min(sp, Math.abs(gy - e.y)), ox = e.x, oy = e.y;
          World.move(m, e, dx, dy, false, null);
          if (Math.abs(e.x - ox) + Math.abs(e.y - oy) < 0.01) { if (++stuck > 60) break; } else stuck = 0;
        }
        if (!ok) { stuckN++; probs.push('walker got stuck going to ' + s.kind + (s.task ? ':' + s.task : '') + ' near ' + Math.round(s.x / T) + ',' + Math.round(s.y / T)); }
      }
      res.push(id + ': ' + (probs.length ? probs.length + ' PROBLEMS\\n   ' + probs.slice(0, 12).join('\\n   ') : 'OK (' + (m.stations || []).length + ' stations walked to)'));
    }
    return res.join('\\n'); })()`);
  console.log(out);
  b.kill(); process.exit(0);
})();
