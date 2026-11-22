// needs: node tools/serve.js running, internet (PeerJS), Microsoft Edge.
// Bug check: players who died / were ejected last game must be alive and votable next game.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9460);
  const h = await newTab(b, 'http://localhost:8792/?relay=0', 800, 480), j = await newTab(b, 'http://localhost:8792/?relay=0', 800, 480); await sleep(2500);
  await h.eval(`UI.prof.name='HOSTY'; Game.create()`); let code = null; for (let i = 0; i < 40 && !code; i++) { await sleep(300); code = await h.eval('Game.C()&&Game.C().connected?Game.C().code:null'); }
  await j.eval(`UI.prof.name='JOE'; Game.join('${code}')`); await sleep(7000);
  for (let i = 0; i < 4; i++) await h.eval('Server.addBot()');
  const S = js => h.eval(`(()=>{const st=Server.state(); ${js}})()`);
  // ---- game 1: hex one player, then eject another ----
  await h.eval(`Server.setSetting('hexCount',1); Server.setSetting('discuss',0); Server.start_game(); 1`); await sleep(6500);
  await S(`for (const p of st.players.values()) { if (p.bot) { p.ai=false; p.wait=999; } p.hexCd=999; }`);
  const ids = JSON.parse(await S(`const ps=[...st.players.values()]; const hex=ps.find(p=>p.role==='hex'); const shapes=ps.filter(p=>p.role==='shape' && p.id!=='h'); return JSON.stringify({hex: hex.id, victim: shapes.find(p=>p.id!=='p1').id, ejectMe: 'p1'})`));
  await S(`const v=st.players.get('${ids.victim}'); v.alive=false; st.bodies.push({id:v.id,obj:0,later:1,age:0,x:v.x,y:v.y,rep:true}); st.rosterDirty=true;`); // hexed
  await S(`st.bellCd=0; const me=st.players.get('h'); me.role==='hex' ? 0 : 0;`);
  await S(`const r=[...st.players.values()].find(p=>p.alive && p.id!=='p1'); const s=st.map.stations.find(s=>s.kind==='bell'); r.bells=1; r.x=s.x; r.y=s.y-10; r.tpSeq++; window.__r=r.id;`); await sleep(400);
  await S(`const r=st.players.get(__r); st.bellCd=0;`); await h.eval(`(()=>{ const st=Server.state(); const r=st.players.get(__r); })()`);
  await h.eval(`(()=>{ const st=Server.state(); const r=st.players.get(__r); st.phase==='play' && (()=>{ const m={t:'a',a:'bell'}; })(); })()`);
  // ring the bell as that player directly through the host's rules
  await S(`const r=st.players.get(__r); r.bells=1; st.bellCd=0;`);
  await h.eval(`(()=>{ const st=Server.state(); const r=st.players.get(__r); for (const p of st.players.values()) if (p!==r) {} })()`);
  if (await S(`return __r`) === 'h') await h.eval(`Game.act('bell')`); else if (await S(`return __r`) === 'p1') await j.eval(`Game.act('bell')`); else await S(`const r=st.players.get(__r); r.bot=false;`);
  await sleep(600);
  if (await S(`return st.phase`) !== 'meeting') { await S(`const me=st.players.get('h'); const s=st.map.stations.find(s=>s.kind==='bell'); me.alive=true; me.bells=1; me.x=s.x; me.y=s.y-10; me.tpSeq++; st.bellCd=0;`); await sleep(500); await h.eval(`Game.act('bell')`); await sleep(600); }
  console.log('game 1 meeting:', await S(`return st.phase + ' ' + (st.meeting && st.meeting.stage)`));
  await S(`st.meeting.t=0.05`); await sleep(400); // -> vote
  await S(`for (const p of st.players.values()) if (p.alive) p.vote='p1'; st.meeting.t=0.05;`); await sleep(1500); // everyone votes JOE out
  console.log('game 1: JOE ejected =', await S(`return st.players.get('p1').ejected`), '| victim hexed =', await S(`return !st.players.get('${ids.victim}').alive`));
  await S(`st.phase='over'`); await h.eval('Server.backToLobby()'); await sleep(1500);
  // ---- game 2: nobody should be dead ----
  await h.eval(`Server.start_game()`); await sleep(6500);
  await S(`for (const p of st.players.values()) { if (p.bot) { p.ai=false; p.wait=999; } p.hexCd=999; } const me=st.players.get('h'); const s=st.map.stations.find(s=>s.kind==='bell'); me.bells=1; me.x=s.x; me.y=s.y-10; me.tpSeq++; st.bellCd=0;`); await sleep(500);
  await h.eval(`Game.act('bell')`); await sleep(800);
  console.log('game 2 phase after bell:', await S(`return st.phase + ' over=' + (st.over && st.over.reason)`));
  if (await S(`return st.phase`) !== 'meeting') { b.kill(); process.exit(0); }
  await S(`st.meeting.t=0.05`); await sleep(600);
  console.log('game 2 stage:', await S(`return st.meeting && st.meeting.stage`));
  console.log('game 2 roster "dead" (host view):', await h.eval(`JSON.stringify(Game.C().roster.filter(e=>e.dead).map(e=>e.name))`), '| (JOE view):', await j.eval(`JSON.stringify(Game.C().roster.filter(e=>e.dead).map(e=>e.name))`));
  console.log('game 2 everyone alive on host:', await S(`return [...st.players.values()].every(p=>p.alive)`));
  await h.eval(`Game.act('vote',{target:'p1'})`); await sleep(500);
  console.log('game 2 host vote for JOE accepted:', await S(`return st.players.get('h').vote`));
  await j.eval(`Game.act('vote',{target:'${ids.victim}'})`); await sleep(800);
  console.log('game 2 JOE vote for last game\'s hexed player accepted:', await S(`return st.players.get('p1').vote`));
  await h.shot('shots/rematch_meeting.png');
  b.kill(); process.exit(0);
})();
