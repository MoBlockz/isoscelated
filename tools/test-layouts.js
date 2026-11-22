// needs: node tools/serve.js running, Microsoft Edge. Every map has every station; draws the generated floor plans side by side.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9480); const a = await newTab(b, 'http://localhost:8792/', 800, 480); await sleep(2500);
  const rows = await a.eval(`JSON.stringify(World.MAP_IDS.map(id => { const m = World.buildMap(id), st = m.stations, tasks = new Set(st.filter(s => s.kind === 'task').map(s => s.task));
    return id + ': ' + m.w + 'x' + m.h + ' tasks ' + tasks.size + '/13, switches ' + st.filter(s => s.kind === 'switch').length + ', meltdown buttons ' + st.filter(s => s.kind === 'melt').length + ', cams ' + st.filter(s => s.kind === 'cams').length + ', bell ' + st.filter(s => s.kind === 'bell').length + ', chutes ' + m.chutes.length + ', missing ' + JSON.stringify(World.TASK_KEYS.filter(k => !tasks.has(k))); }))`);
  for (const r of JSON.parse(rows)) console.log(r);
  await a.eval(`Game.screen = 'none'; window.__maps = ['workshop', 'castle', 'palace', 'jurassic'].map(id => { const m = World.buildMap(id); World.prerender(m); return m; });
    (function loop() { if (Game.screen !== 'none') return; const ctx = G.ctx; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.W, G.H);
      __maps.forEach((m, i) => { const cw = G.W / 2, ch = G.H / 2, f = Math.min((cw - 6) / (m.w * 16), (ch - 14) / (m.h * 16)); const x = (i % 2) * cw + 3, y = Math.floor(i / 2) * ch + 10; ctx.drawImage(m.bg, x, y, m.w * 16 * f, m.h * 16 * f); G.tiny(m.title, x + 2, y - 8, '#fff'); });
      G.present(); requestAnimationFrame(loop); })()`);
  await sleep(600); await a.shot('shots/layouts.png');
  b.kill(); process.exit(0);
})();
