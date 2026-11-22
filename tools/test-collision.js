// needs: node tools/serve.js running, Microsoft Edge. Pixel-accurate collision: reachability + props block only where drawn.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9370); const a = await newTab(b, 'http://localhost:8792/', 800, 480); await sleep(2500);
  const r = await a.eval(`(() => {
    const out = [];
    for (const kind of World.MAP_IDS.concat(['lobby'])) {
      const m = kind === 'lobby' ? World.buildLobby() : World.buildMap(kind); const ok = (x, y) => !World.hit(m, x, y, null);
      // flood fill in 2px steps from spawn
      const key = (x, y) => (x >> 1) * 4096 + (y >> 1), seen = new Set(), q = [[m.spawn[0] | 0, m.spawn[1] | 0]]; seen.add(key(...q[0]));
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (!seen.has(k) && ok(nx, ny)) { seen.add(k); q.push([nx, ny]); } } }
      const near = s => { for (let dx = -14; dx <= 14; dx += 2) for (let dy = -14; dy <= 14; dy += 2) if (seen.has(key((s.x + dx) | 0, (s.y + dy) | 0))) return true; return false; };
      const unreach = m.stations.filter(s => !near(s)).map(s => s.kind + ':' + (s.task || ''));
      // every solid prop must still block at the middle of its drawn pixels
      const leaky = [];
      for (const p of m.props) { if (!p.solid) continue; let cx = 0, cy = 0, n = 0; const sp = World.propSprite(p), d = sp.getContext('2d').getImageData(0, 0, sp.width, sp.height).data;
        for (let y = 0; y < sp.height; y++) for (let x = 0; x < sp.width; x++) if (d[(y * sp.width + x) * 4 + 3] > 40 && y < p.h * 16 && x < p.w * 16 + 2) { cx += x; cy += y; n++; }
        if (!n) continue; const wx = p.x * 16 - 1 + cx / n, wy = p.y * 16 - (p.k === 'blimp' ? 6 : 0) + cy / n; if (!World.blocked(m, wx, wy, null)) leaky.push(p.k); }
      // how much floor used to be invisible wall?
      let freed = 0; for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) { const k = ty * m.w + tx; if (!m.solid[k]) continue; for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) if (!World.blocked(m, tx * 16 + x, ty * 16 + y, null)) freed++; }
      const T = m.props.find(p => p.k === 'table' || p.k === 'roundtable');
      const corner = T ? [ok(T.x * 16 + 4, T.y * 16 + 4), ok(T.x * 16 + T.w * 16 - 4, T.y * 16 + T.h * 16 - 2)] : null;
      out.push(kind + ': unreachable stations ' + JSON.stringify(unreach) + ' | props that no longer block their middle ' + JSON.stringify(leaky) + ' | freed ' + (freed * 4) + ' px² of invisible wall | table corners walkable ' + JSON.stringify(corner));
    }
    return out.join('\\n'); })()`);
  console.log(r);
  b.kill(); process.exit(0);
})();
