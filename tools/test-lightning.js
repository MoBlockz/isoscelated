// needs: node tools/serve.js running, Microsoft Edge. Practice mode: hex a dummy and screenshot the lightning crash + area flash.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9570); const h = await newTab(b, 'http://localhost:8792/', 800, 480); await sleep(2500);
  await h.eval('Game.practice()'); await sleep(7000);
  await h.eval(`Game.practiceRole('classic'); Game.C().reveal = null; 1`); await sleep(500);
  // stand next to a dummy
  const r = await h.eval(`(() => { const st = Server.state(), me = st.players.get('h'); const d = [...st.players.values()].find(p => p.bot && p.alive); me.x = d.x + 14; me.y = d.y; me.tpSeq++; me.hexCd = 0; return d.id; })()`);
  await sleep(600);
  await h.eval(`Game.act('hex'); 1`);
  for (const [ms, n] of [[20, 'a'], [100, 'b'], [100, 'c'], [300, 'd']]) { await sleep(n === 'a' ? ms : ms - 30); await h.shot('shots/lightning_' + n + '.png'); }
  console.log('hexed', r, 'alive?', await h.eval(`Server.state().players.get(${JSON.stringify(r)}).alive`), h.logs.filter(x => /EXC|rror/.test(x)).slice(0, 3).join('\n'));
  b.kill(); process.exit(0);
})();
