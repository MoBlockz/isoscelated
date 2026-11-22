// needs: node tools/serve.js running, internet, Microsoft Edge. Screenshots go to tools/shots/
// Multiplayer feature test: planter, spirits, chats, sabotage, chutes, tasks, disconnect, bell, voting, shapeshifter.
const { launch, newTab, sleep } = require('./cdp');
const N = 5;
const out = (...a) => console.log(...a);
(async () => {
  const b = await launch(9304);
  const tabs = []; for (let i = 0; i < N + 1; i++) tabs.push(await newTab(b, 'http://localhost:8792/', 800, 480));
  await sleep(3500);
  const names = ['HOSTY', 'BLOB', 'ZIGZAG', 'POINTY', 'ROUNDY', 'LATEJO'];
  for (let i = 0; i < tabs.length; i++) await tabs[i].eval(`UI.prof.name=${JSON.stringify(names[i])}; UI.prof.look.shape=${i}; UI.prof.look.color=${i * 2}; 1`);
  await tabs[0].eval('Game.create()');
  let code = null; for (let i = 0; i < 40 && !code; i++) { await sleep(300); code = await tabs[0].eval('Game.C() && Game.C().connected ? Game.C().code : null'); }
  for (let i = 1; i < N; i++) await tabs[i].eval(`Game.join(${JSON.stringify(code)})`);
  await sleep(6000);
  for (let i = 1; i < N; i++) await tabs[i].eval(`window.__msgs=[]; Game.C().conn.on('data', m=>window.__msgs.push(m)); 1`);
  const ids = []; for (let i = 0; i < N; i++) ids.push(await tabs[i].eval('Game.C().id'));
  const T = id => tabs[ids.indexOf(id)];
  const S = js => tabs[0].eval(`(()=>{const st=Server.state(); ${js}})()`);
  const put = (id, x, y) => S(`const p=st.players.get('${id}'); p.x=${x}; p.y=${y}; p.tpSeq++;`);
  const posOf = async id => JSON.parse(await S(`const p=st.players.get('${id}'); return JSON.stringify([p.x,p.y])`));
  const station = async (kind, k, v) => JSON.parse(await S(`const s=st.map.stations.find(s=>s.kind==='${kind}' && (${k ? `s.${k}===${JSON.stringify(v)}` : 'true'})); return JSON.stringify([s.x,s.y])`));
  await tabs[0].eval(`Server.setSetting('types','custom'); Server.setSetting('allowed',{classic:false,shift:false,plant:true}); Server.setSetting('hexCount',1); Server.setSetting('matchTime',0); 1`);
  out('start:', await tabs[0].eval('Server.start_game()'));
  await sleep(1000);
  await tabs[5].eval(`Game.join(${JSON.stringify(code)})`); await sleep(5000);
  out('late join ->', await tabs[5].eval('Game.screen'));
  await tabs[5].shot('shots/t4_latejoin.png');
  await sleep(1000);
  const roles = JSON.parse(await S(`return JSON.stringify([...st.players.values()].map(p=>[p.id,p.role,p.type]))`));
  out('roles', JSON.stringify(roles));
  const P = roles.find(r => r[1] === 'hex')[0], sh = roles.filter(r => r[1] === 'shape').map(r => r[0]);
  const [S1, S2, S3, S4] = sh;
  // --- plant ---
  const base = await posOf(S1);
  await put(P, base[0] + 10, base[1]); await S(`st.players.get('${P}').plantCd=0;`);
  for (const s of [S2, S3, S4]) await put(s, base[0] + 160, base[1] - 60);
  await sleep(500); await T(P).eval(`Game.act('plant')`); await sleep(400);
  out('marks', await S('return JSON.stringify(st.marks)'));
  await sleep(500);
  out('planter sees marked:', await T(P).eval(`JSON.stringify([...Game.C().others].filter(([id,o])=>o.fl&4).map(([id])=>id))`), 'S1=', S1);
  for (const s of sh) if (s !== 'h') out('non-hex', s, 'raw msgs leak hex/mark info?', await T(s).eval(`(()=>{const s=JSON.stringify(window.__msgs); return JSON.stringify([s.includes('"hex"'), s.includes('"type":"plant"'), window.__msgs.filter(m=>m.t==='s').some(m=>m.p.some(r=>r[6]&6))])})()`));
  await sleep(1200);
  const p1 = await posOf(S1); await put(S2, p1[0] + 12, p1[1]); await sleep(800);
  out('S2 alive after walking near marked S1:', await S(`return st.players.get('${S2}').alive`), 'planter stats', await S(`return JSON.stringify(st.players.get('${P}').stats)`));
  // --- spirit & chats ---
  const [pid, px, py] = JSON.parse(await S(`const p=st.map.props.find(p=>p.k==='plant'); return JSON.stringify([p.id,p.x*16+8,p.y*16+8])`));
  await put(S2, px, py + 12); await sleep(400);
  await T(S2).eval(`Game.act('rattle',{prop:${pid}})`); await sleep(300);
  out('rattled', await S(`return st.players.get('${S2}').rattled`));
  await T(S2).eval(`Game.send({t:'c',ch:'spirit',text:'boo from the spirit world'})`); await sleep(1200);
  await T(P).eval(`Game.send({t:'c',ch:'hex',text:'secret hex plans'})`); await sleep(1200);
  for (const id of [S2, S3, P]) out('chat seen by', id, await T(id).eval('JSON.stringify(Game.C().chat.map(m=>m.ch+":"+m.text))'));
  await T(S3).eval(`Game.send({t:'c',ch:'all',text:'can shapes chat in play?'})`); await sleep(1100);
  out('S3 chat during play blocked:', !(await T(P).eval('Game.C().chat.some(m=>m.text.includes("shapes chat"))')));
  // --- sabotage lights ---
  await S(`st.sabCd=0;`); await T(P).eval(`Game.act('sab',{k:'lights'})`); await sleep(600);
  out('sab', await S('return JSON.stringify(st.sab)'));
  await sleep(1500); await T(S3).shot('shots/t4_lights.png');
  const sw0 = await station('switch', 'sw', 0), sw1 = await station('switch', 'sw', 1);
  await put(S3, sw0[0], sw0[1]); await put(S4, sw1[0], sw1[1]); await sleep(500);
  await T(S3).eval(`Game.act('switch',{sw:0})`); await T(S4).eval(`Game.act('switch',{sw:1})`); await sleep(500);
  out('after switches sab=', await S('return JSON.stringify(st.sab)+" cd="+st.sabCd'));
  // --- meltdown ---
  await S(`st.sabCd=0;`); await T(P).eval(`Game.act('sab',{k:'melt'})`); await sleep(500);
  const b0 = await station('melt', 'btn', 0), b1 = await station('melt', 'btn', 1);
  await put(S3, b0[0], b0[1]); await put(S4, b1[0], b1[1]); await sleep(2500);
  await T(S3).shot('shots/t4_melt.png');
  await T(S3).eval(`Game.act('hold',{on:1,btn:0})`); await T(S4).eval(`Game.act('hold',{on:1,btn:1})`); await sleep(500);
  out('after melt holds sab=', await S('return JSON.stringify(st.sab)'));
  // --- jam ---
  await S(`st.sabCd=0;`); await T(P).eval(`Game.act('sab',{k:'jam',room:2})`); await sleep(500); out('jam', await S('return JSON.stringify(st.sab)'));
  // --- chute ---
  const c0 = JSON.parse(await S('return JSON.stringify([st.map.chutes[0].x, st.map.chutes[0].y])'));
  await put(P, c0[0], c0[1]); await sleep(500); await T(P).eval(`Game.act('chute',{to:3})`); await sleep(400);
  out('P after chute', JSON.stringify(await posOf(P)), 'chute3', await S('return JSON.stringify([st.map.chutes[3].x,st.map.chutes[3].y])'));
  // --- task ---
  const tk = JSON.parse(await S(`return JSON.stringify(st.players.get('${S3}').tasks[0])`));
  const ts = await station('task', 'task', tk.k); await put(S3, ts[0], ts[1]); await sleep(500);
  await T(S3).eval(`Game.act('task',{i:0})`); await sleep(500);
  out('task done', await S(`return st.players.get('${S3}').tasks[0].done`), 'bar', await T(S3).eval('Game.C().snap.bar'));
  await T(S3).eval(`Tasks.open('${tk.k}', ()=>{})`); await sleep(400); await T(S3).shot('shots/t4_task.png'); await T(S3).eval('Tasks.close()');
  await T(S3).eval(`Game.C().overlay='map'`); await sleep(300); await T(S3).shot('shots/t4_map.png'); await T(S3).eval(`Game.C().overlay=null`);
  await T(S3).eval(`Game.C().overlay='cams'`); await sleep(300); await T(S3).shot('shots/t4_cams.png'); await T(S3).eval(`Game.C().overlay=null`);
  // --- disconnect S4 ---
  await T(S4).eval('Game.leave()'); await sleep(3000);
  out('S4 left?', await S(`const p=st.players.get('${S4}'); return p && JSON.stringify([p.left,p.alive])`), 'bodies', await S('return JSON.stringify(st.bodies.map(b=>[b.id,b.rep]))'));
  // --- bell ---
  await S('st.bellCd=0'); const bell = await station('bell'); await put(S3, bell[0], bell[1] - 10); await sleep(500);
  await T(S3).eval(`Game.act('bell')`); await sleep(600);
  out('meeting', await S('return st.phase+" "+(st.meeting&&st.meeting.reason)'));
  await S('st.meeting.t=0.05'); await sleep(400); await S('st.meeting.t=0.05'); await sleep(400);
  await T(S3).eval(`Game.send({t:'c',ch:'all',text:'I think it was POINTY'})`); await sleep(1200);
  await T(P).eval(`Game.send({t:'c',ch:'all',text:'my number is 0 7 7 0 0 9 0 0 1 2 3'})`); await sleep(500);
  out('meeting chat at S1:', await T(S1).eval('JSON.stringify(Game.C().chat.map(m=>m.text))'));
  await sleep(1500); await T(S2).shot('shots/t4_meeting_spirit.png'); await T(S1).shot('shots/t4_meeting.png');
  for (const id of [S1, S3, P]) await T(id).eval(`Game.act('vote',{target:'skip'})`);
  await sleep(1500); await T(S1).shot('shots/t4_meeting_result.png');
  await sleep(8500);
  out('after skip vote phase', await S('return st.phase'), 'alive', await S('return JSON.stringify([...st.players.values()].map(p=>p.id+":"+p.alive))'));
  // --- final hex ---
  const p3 = await posOf(S3); await put(P, p3[0] + 10, p3[1]); await S(`st.players.get('${P}').hexCd=0`); await sleep(500);
  await T(P).eval(`Game.act('hex')`); await sleep(800);
  out('end', await S('return st.phase+" "+(st.over&&st.over.winner+" / "+st.over.reason)'));
  await sleep(2500); await T(P).shot('shots/t4_over_hex.png');
  // --- round 2: shapeshifter ---
  await tabs[0].eval('Server.backToLobby()'); await sleep(1500);
  await tabs[0].eval(`Server.setSetting('allowed',{classic:false,shift:true,plant:false}); Server.setSetting('hexCount',1); 1`);
  out('n players', await S('return st.players.size'));
  out('start2:', await tabs[0].eval('Server.start_game()'));
  await sleep(7000);
  const roles2 = JSON.parse(await S(`return JSON.stringify([...st.players.values()].map(p=>[p.id,p.role,p.type]))`));
  const X = roles2.find(r => r[1] === 'hex')[0], sh2 = roles2.filter(r => r[1] === 'shape').map(r => r[0]);
  await S(`st.players.get('${X}').shiftCd=0`); await T(X).eval(`Game.act('shift',{target:'${sh2[0]}'})`); await sleep(800);
  const xp = await posOf(X); await put(sh2[0], xp[0] - 300, xp[1]); await put(sh2[1], xp[0] + 30, xp[1]); await sleep(800);
  out('witness sees X as', await T(sh2[1]).eval(`(()=>{const o=Game.C().others.get('${X}'); return o && o.disp})()`), 'target', sh2[0]);
  await T(sh2[1]).shot('shots/t5_shift_witness.png');
  await T(X).eval(`Game.C().overlay='shift'`); await sleep(300); await T(X).shot('shots/t5_shiftmenu.png'); await T(X).eval(`Game.C().overlay=null`);
  await put(X, xp[0] + 18, xp[1]); await S(`st.players.get('${X}').hexCd=0`); await sleep(500);
  await T(X).eval(`Game.act('hex')`); await sleep(200); await T(sh2[1]).shot('shots/t5_zap.png');
  out('victim', sh2[1], 'alive', await S(`return st.players.get('${sh2[1]}').alive`));
  for (let i = 0; i < tabs.length; i++) { const l = tabs[i].logs.filter(x => /EXCEPTION|rror/.test(x)); if (l.length) out('LOGS', i, l.slice(0, 6).join('\n')); }
  b.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
