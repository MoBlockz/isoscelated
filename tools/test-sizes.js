// needs: node tools/serve.js running, internet (PeerJS) and Microsoft Edge. Screenshots of every screen on phone / iPad / desktop sizes.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9340);
  const sizes = [['phoneL', 844, 390, 3], ['phoneP', 390, 844, 3], ['ipad', 1024, 768, 2], ['desk', 1280, 720, 0]];
  for (const [nm, w, h, d] of sizes) {
    const a = await newTab(b, 'http://localhost:8792/?bots=11', w, h, d); await sleep(3000);
    if (d) await a.eval('UI.isTouch=true; 1');
    console.log(nm, await a.eval('G.W+"x"+G.H+" scale "+G.scale+" rot "+G.rot'));
    await a.shot(`shots/sz_${nm}_1menu.png`);
    await a.eval(`Game.screen='customize'`); await sleep(400); await a.shot(`shots/sz_${nm}_2custom.png`);
    await a.eval(`UI.prof.name='PHONEY'; Game.create()`); await sleep(4000); await a.shot(`shots/sz_${nm}_3lobby.png`);
    await a.eval(`Server.setSetting('hexCount',2); Server.start_game(); 1`); await sleep(7500);
    await a.eval(`(()=>{const st=Server.state(); const me=st.players.get('h'); const t=me.tasks[0]; const s=st.map.stations.find(s=>s.task===t.k); me.x=s.x; me.y=s.y+6; me.tpSeq++;})()`); await sleep(800);
    await a.shot(`shots/sz_${nm}_4play.png`);
    await a.eval(`(()=>{const st=Server.state(); st.bellCd=0; const s=st.map.stations.find(s=>s.kind==='bell'); const me=st.players.get('h'); me.x=s.x; me.y=s.y-10; me.tpSeq++;})()`); await sleep(500);
    await a.eval(`Game.act('bell')`); await sleep(5000); await a.shot(`shots/sz_${nm}_5meeting.png`);
    console.log(a.logs.filter(x => /EXC|rror/.test(x)).slice(0, 5).join('\n'));
    await a.eval('Game.toMenu()');
  }
  b.kill(); process.exit(0);
})();
