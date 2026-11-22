// needs: node tools/serve.js running, internet (PeerJS), Microsoft Edge. Host + 7 AI players play a whole game on their own.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9380); const h = await newTab(b, 'http://localhost:8792/', 800, 480); await sleep(3000);
  await h.eval(`UI.prof.name='HOSTY'; Game.create()`); let code = null; for (let i = 0; i < 40 && !code; i++) { await sleep(300); code = await h.eval('Game.C()&&Game.C().connected?Game.C().code:null'); }
  for (let i = 0; i < 7; i++) await h.eval('Server.addBot()');
  await sleep(500); await h.shot('shots/ai_lobby.png');
  console.log('lobby players', await h.eval('Game.C().roster.length'), 'AI', await h.eval('Game.C().roster.filter(e=>e.bot).length'));
  await h.eval(`Server.setSetting('hexCount',2); Server.setSetting('tasks',3); Server.setSetting('discuss',15); Server.setSetting('vote',30); Server.setSetting('speed',1.5); Server.start_game(); 1`);
  // keep the human host out of the way, in a corner of the dock
  const t0 = Date.now(); let lastPhase = '', shotMeeting = false;
  while (Date.now() - t0 < 240000) {
    await sleep(3000);
    const s = JSON.parse(await h.eval(`(()=>{const st=Server.state(); if(!st) return '{}'; const ps=[...st.players.values()];
      return JSON.stringify({ph: st.phase, stage: st.meeting && st.meeting.stage, t: Math.round(st.t), alive: ps.filter(p=>p.alive).length, hexAlive: ps.filter(p=>p.alive&&p.role==='hex').length,
        bar: Math.round(ps.filter(p=>p.role==='shape').reduce((a,p)=>a+p.tasks.filter(t=>t.done).length,0) / Math.max(1, ps.filter(p=>p.role==='shape').reduce((a,p)=>a+p.tasks.length,0)) * 100), sab: st.sab.k, bodies: st.bodies.length,
        suspects: ps.filter(p=>p.suspect).map(p=>p.name+'->'+(st.players.get(p.suspect)||{}).name), over: st.over && st.over.winner + ': ' + st.over.reason,
        hexes: ps.filter(p=>p.role==='hex').map(p=>p.name+'('+p.type+')') });})()`));
    const line = `${s.t}s ${s.ph}${s.stage ? '/' + s.stage : ''} alive=${s.alive} hexAlive=${s.hexAlive} chores=${s.bar}% sab=${s.sab} pieces=${s.bodies} suspects=${JSON.stringify(s.suspects)}`;
    console.log(line);
    if (s.ph === 'meeting' && s.stage === 'vote' && !shotMeeting) { shotMeeting = true; await h.shot('shots/ai_meeting.png'); console.log('meeting chat:', await h.eval('JSON.stringify(Game.C().chat.slice(-8).map(m=>Game.nameOf(m.from)+": "+m.text))')); }
    if (s.ph === 'meeting' && s.stage === 'result') console.log('  result:', await h.eval('Game.C().eject && Game.C().eject.text'));
    if (s.ph === 'over') { console.log('GAME OVER:', s.over, '| hexagoners were', s.hexes.join(', ')); await sleep(2500); await h.shot('shots/ai_over.png'); break; }
  }
  console.log(h.logs.filter(x => /EXC|rror/.test(x)).slice(0, 5).join('\n'));
  b.kill(); process.exit(0);
})();
