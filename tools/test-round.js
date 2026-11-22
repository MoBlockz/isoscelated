// Full round over real PeerJS with N tabs: node tools/test-round.js 4   (needs: node tools/serve.js running, internet, Microsoft Edge)
const { launch, newTab, sleep } = require('./cdp');
const N = +process.argv[2] || 4;
(async () => {
  const b = await launch(9302);
  const tabs = [];
  for (let i = 0; i < N; i++) { tabs.push(await newTab(b, 'http://localhost:8792/', 800, 480)); }
  await sleep(3500);
  const names = ['HOSTY', 'BLOB', 'ZIGZAG', 'POINTY', 'ROUNDY', 'SQUAREO'];
  for (let i = 0; i < N; i++) await tabs[i].eval(`UI.prof.name=${JSON.stringify(names[i])}; UI.prof.look.color=${i * 3}; UI.prof.look.shape=${i}; 1`);
  await tabs[0].eval('Game.create()');
  let code = null; for (let i = 0; i < 40 && !code; i++) { await sleep(300); code = await tabs[0].eval('Game.C() && Game.C().connected ? Game.C().code : null'); }
  console.log('code', code);
  if (!code) { console.log(tabs[0].logs.join('\n')); b.kill(); process.exit(1); }
  // wrong code first
  await tabs[1].eval(`Game.join('ZZZZZ')`); await sleep(6000);
  console.log('wrong code screen:', await tabs[1].eval('Game.screen'));
  await tabs[1].shot('shots/mp_wrongcode.png');
  await tabs[1].eval('UI.sayClear()');
  for (let i = 1; i < N; i++) await tabs[i].eval(`Game.join(${JSON.stringify(code)})`);
  await sleep(6000);
  for (let i = 0; i < N; i++) console.log('tab', i, await tabs[i].eval('Game.screen + " id=" + (Game.C()&&Game.C().id) + " roster=" + (Game.C()&&Game.C().roster.length)'));
  // chat test
  await tabs[1].eval(`Game.send({t:'c', ch:'all', text:'hello friends'})`); await sleep(1200);
  await tabs[2].eval(`Game.send({t:'c', ch:'all', text:'you are st.u.p.i.d'})`); await sleep(800);
  console.log('host chat:', await tabs[0].eval('JSON.stringify(Game.C().chat.map(m=>m.text))'));
  await tabs[0].shot('shots/mp_lobby_host.png'); await tabs[1].shot('shots/mp_lobby_join.png');
  // start
  console.log('start:', await tabs[0].eval('Server.start_game()'));
  await sleep(1500); await tabs[1].shot('shots/mp_reveal.png');
  await sleep(5000);
  const roles = await tabs[0].eval('JSON.stringify([...Server.state().players.values()].map(p=>[p.id,p.name,p.role,p.type]))');
  console.log('roles', roles);
  for (let i = 0; i < N; i++) console.log('tab', i, 'myRole', await tabs[i].eval('Game.C().myRole+"/"+Game.C().myType+" phase="+Game.C().phase+" hexflags="+Game.C().roster.filter(e=>e.hex).length'));
  await tabs[0].shot('shots/mp_play_host.png'); await tabs[2].shot('shots/mp_play_2.png');
  // force a hex: move hex next to a shape (server side)
  const R = JSON.parse(roles); const hex = R.find(r => r[2] === 'hex'), shapes = R.filter(r => r[2] === 'shape');
  const tabOf = id => id === 'h' ? 0 : tabs.findIndex((t, i) => i > 0 && false);
  const ids = []; for (let i = 0; i < N; i++) ids.push(await tabs[i].eval('Game.C().id'));
  const hexTab = tabs[ids.indexOf(hex[0])], victim = shapes[0], victimTab = tabs[ids.indexOf(victim[0])];
  await tabs[0].eval(`(()=>{const st=Server.state(); const h=st.players.get('${hex[0]}'), v=st.players.get('${victim[0]}'); h.hexCd=0; h.x=v.x+12; h.y=v.y; h.tpSeq++; })()`);
  await sleep(800);
  await hexTab.eval(`Game.act('hex')`); await sleep(1500);
  console.log('victim alive (server):', await tabs[0].eval(`Server.state().players.get('${victim[0]}').alive`), 'bodies', await tabs[0].eval('Server.state().bodies.length'));
  await victimTab.shot('shots/mp_victim.png'); await hexTab.shot('shots/mp_hexer.png');
  // reporter: another shape
  const rep = shapes[1]; const repTab = tabs[ids.indexOf(rep[0])];
  await tabs[0].eval(`(()=>{const st=Server.state(); const r=st.players.get('${rep[0]}'), b=st.bodies[0]; r.x=b.x+10; r.y=b.y; r.tpSeq++; })()`);
  await sleep(800); await repTab.eval(`Game.act('report')`); await sleep(1200);
  await repTab.shot('shots/mp_meeting_intro.png');
  console.log('phase', await tabs[0].eval('Server.state().phase+" "+Server.state().meeting.stage'));
  await tabs[0].eval(`Server.state().meeting.t=0.1`); await sleep(1500);
  await tabs[0].eval(`Server.state().meeting.t=0.1`); await sleep(1000);
  console.log('stage', await tabs[0].eval('Server.state().meeting && Server.state().meeting.stage'));
  // living vote the hex
  for (let i = 0; i < N; i++) await tabs[i].eval(`Game.act('vote',{target:'${hex[0]}'})`);
  await sleep(1200); await repTab.shot('shots/mp_meeting_vote.png');
  await sleep(3500); await repTab.shot('shots/mp_eject.png');
  await sleep(6000);
  console.log('phase after', await tabs[0].eval('Server.state().phase'), await tabs[1].eval('JSON.stringify(Game.C().over && [Game.C().over.winner, Game.C().over.reason])'));
  await tabs[1].shot('shots/mp_over.png');
  await tabs[0].eval('Server.backToLobby()'); await sleep(1500);
  for (let i = 0; i < N; i++) console.log('tab', i, await tabs[i].eval('Game.C().phase + " code=" + Game.C().code'));
  for (let i = 0; i < N; i++) { const l = tabs[i].logs.filter(x => /EXCEPTION|error/i.test(x)); if (l.length) console.log('LOGS', i, l.slice(0, 8).join('\n')); }
  // host leaves
  await tabs[0].eval('Game.toMenu()'); await sleep(3000);
  console.log('after host left:', await tabs[1].eval('Game.screen'));
  await tabs[1].shot('shots/mp_hostleft.png');
  b.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
