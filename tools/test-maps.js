// needs: node tools/serve.js running, internet (PeerJS), Microsoft Edge. Screenshot every map (meeting room + map view + a quest).
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9420); const h = await newTab(b, 'http://localhost:8792/?relay=0', 800, 480); await sleep(2500);
  await h.eval(`UI.prof.name='HOSTY'; Game.create()`); await sleep(4000);
  for (let i = 0; i < 4; i++) await h.eval('Server.addBot()');
  for (const id of ['castle', 'palace', 'jurassic']) {
    await h.eval(`Server.setSetting('map','${id}'); Server.setSetting('hexCount',1); Server.start_game(); 1`); await sleep(6500);
    await h.eval(`(()=>{ const st=Server.state(); for (const p of st.players.values()) { p.hexCd=999; if (p.bot) { p.ai=false; p.wait=999; } } const s=st.map.stations.find(s=>s.kind==='bell'); const me=st.players.get('h'); me.x=s.x; me.y=s.y+20; me.tpSeq++; })()`); await sleep(900);
    await h.shot(`shots/map_${id}_hall.png`);
    await h.eval(`Game.C().overlay='map'`); await sleep(400); await h.shot(`shots/map_${id}_map.png`); await h.eval(`Game.C().overlay=null`);
    await h.eval(`(()=>{ const st=Server.state(); const me=st.players.get('h'); const s=st.map.stations.find(s=>s.task===me.tasks[0].k); me.x=s.x; me.y=s.y+4; me.tpSeq++; })()`); await sleep(900);
    await h.shot(`shots/map_${id}_room.png`);
    await h.eval(`Tasks.open(Server.state().players.get('h').tasks[0].k, ()=>{})`); await sleep(300); await h.shot(`shots/map_${id}_quest.png`); await h.eval('Tasks.close()');
    await h.eval(`(()=>{ const st=Server.state(); st.phase='over'; })(); Server.backToLobby(); 1`); await sleep(1200);
  }
  console.log(h.logs.filter(x => /EXC|rror/.test(x)).slice(0, 5).join('\n'));
  b.kill(); process.exit(0);
})();
