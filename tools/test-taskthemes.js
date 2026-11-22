// needs: node tools/serve.js running, internet (PeerJS), Microsoft Edge. The same chore on every map + several chores on one map.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9490); const h = await newTab(b, 'http://localhost:8792/?relay=0', 800, 480); await sleep(2500);
  await h.eval(`UI.prof.name='HOSTY'; Game.create()`); await sleep(4000); for (let i = 0; i < 4; i++) await h.eval('Server.addBot()');
  for (const id of ['workshop', 'castle', 'palace', 'jurassic']) {
    await h.eval(`Server.setSetting('map','${id}'); Server.setSetting('hexCount',1); Server.start_game(); 1`); await sleep(6500);
    await h.eval(`(()=>{ const st=Server.state(); for (const p of st.players.values()) { p.hexCd=999; if (p.bot) { p.ai=false; p.wait=999; } } })()`);
    for (const k of id === 'castle' ? ['pipes', 'sort', 'gauge', 'candy'] : ['pipes']) { await h.eval(`Tasks.open('${k}', ()=>{})`); await sleep(300); await h.shot(`shots/tt_${id}_${k}.png`); await h.eval('Tasks.close()'); }
    await h.eval(`(()=>{ const st=Server.state(); const me=st.players.get('h'); const s=st.map.stations.find(s=>s.kind==='bell'); me.x=s.x+60; me.y=s.y-40; me.tpSeq++; })()`); await sleep(900); await h.shot(`shots/tt_${id}_world.png`);
    await h.eval(`Server.state().phase='over'; Server.backToLobby(); 1`); await sleep(1200);
  }
  console.log(h.logs.filter(x => /EXC|rror/.test(x)).slice(0, 5).join('\n'));
  b.kill(); process.exit(0);
})();
