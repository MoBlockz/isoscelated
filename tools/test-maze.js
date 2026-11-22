// needs: node tools/serve.js running, internet (PeerJS), Microsoft Edge. Host + AI play a full Minotaur Maze game.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9430); const h = await newTab(b, 'http://localhost:8792/?relay=0', 800, 480); await sleep(2500);
  await h.eval(`UI.prof.name='HOSTY'; Game.create()`); await sleep(4000);
  for (let i = 0; i < 4; i++) await h.eval('Server.addBot()');
  await h.eval(`Server.setSetting('mode','maze'); 1`); await h.eval(`Game.C().overlay='hostset'`); await sleep(400); await h.shot('shots/maze_settings.png'); await h.eval(`Game.C().overlay=null`);
  console.log('start:', await h.eval('Server.start_game()'));
  await sleep(1500); await h.shot('shots/maze_reveal.png');
  await sleep(5000);
  await h.eval(`(()=>{ const st=Server.state(); window.__ev=[]; const me=st.players.get('h'); })()`);
  console.log('my role:', await h.eval('Game.C().myRole'), '| minotaur:', await h.eval(`Server.state().maze.mino`));
  await h.shot('shots/maze_headstart.png');
  // follow the Minotaur with the host camera if the host is a runner: just watch from the host view
  const t0 = Date.now(); let shotMino = false, shotMap = false;
  while (Date.now() - t0 < 200000) {
    await sleep(3000);
    const s = JSON.parse(await h.eval(`(()=>{ const st=Server.state(); if(!st) return '{}'; const Z=st.maze; return JSON.stringify({ph: st.phase, t: Z ? Math.round(Z.time) : 0, head: Z ? Math.ceil(Z.head) : 0, keys: Z ? Z.keys.filter(k=>k.got).length : 0, open: Z && Z.open, alive: [...st.players.values()].filter(p=>p.role==='runner'&&p.alive).length, esc: [...st.players.values()].filter(p=>p.escaped).length, over: st.over && (st.over.winner + ': ' + st.over.reason)}); })()`));
    console.log(`time ${s.t} ${s.ph} head=${s.head} keys=${s.keys} open=${s.open} runnersLeft=${s.alive} escaped=${s.esc}`);
    if (!shotMino && s.head === 0) { shotMino = true; await sleep(1500); await h.shot('shots/maze_mino.png'); }
    if (!shotMap && s.keys >= 1) { shotMap = true; await h.eval(`Game.C().overlay='map'`); await sleep(400); await h.shot('shots/maze_map.png'); await h.eval(`Game.C().overlay=null`); }
    if (s.ph === 'over') { console.log('GAME OVER:', s.over); await sleep(3000); await h.shot('shots/maze_over.png'); break; }
  }
  console.log(h.logs.filter(x => /EXC|rror/.test(x)).slice(0, 5).join('\n'));
  b.kill(); process.exit(0);
})();
