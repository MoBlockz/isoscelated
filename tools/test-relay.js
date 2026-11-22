// needs: node tools/serve.js running, internet, Microsoft Edge. One host + relayed joiners: counts message delivery.
const { launch, newTab, sleep } = require('./cdp');
const N = +process.argv[2] || 1;
(async () => {
  const b = await launch(9341);
  const h = await newTab(b, 'http://localhost:8792/', 800, 480); const js = [];
  for (let i = 0; i < N; i++) js.push(await newTab(b, 'http://localhost:8792/?relay=1', 800, 480));
  await sleep(3000);
  await h.eval(`UI.prof.name='HOST'; Game.create()`); let code = null; for (let i = 0; i < 40 && !code; i++) { await sleep(300); code = await h.eval('Game.C()&&Game.C().connected?Game.C().code:null'); }
  // count what each joiner receives
  for (const [i, j] of js.entries()) await j.eval(`UI.prof.name='RELAY${i}'; window.__n={}; const RJ=Relay.join; Relay.join=(c,cb)=>RJ(c,Object.assign({},cb,{onMsg:m=>{const k=m.t+(m.k?':'+m.k:''); __n[k]=(__n[k]||0)+1; cb.onMsg(m);}})); Game.join('${code}'); 1`);
  const t0 = Date.now(); for (let i = 0; i < 40; i++) { await sleep(500); if (await js[N - 1].eval('Game.screen') === 'session') break; }
  console.log('joined in', (Date.now() - t0) / 1000, 's; mode', await js[0].eval('Game.C().link.mode'));
  await sleep(3000); console.log('start', await h.eval('Server.start_game()')); await sleep(8000);
  for (const j of js) console.log('joiner got', await j.eval('JSON.stringify(__n)'), 'roster', await j.eval('Game.C().roster.length'), 'role', await j.eval('Game.C().myRole'));
  console.log('host sees', await h.eval('Game.C().roster.length'), 'players');
  b.kill(); process.exit(0);
})();
