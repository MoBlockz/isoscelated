// needs: node tools/serve.js running, internet, Microsoft Edge. Screenshots go to tools/shots/
// Lobby features: settings UI, players list, lobby full, kick/ban, secrecy of roles, all mini-games, how-to pages.
const { launch, newTab, sleep } = require('./cdp');
const out = (...a) => console.log(...a);
(async () => {
  const b = await launch(9305);
  const host = await newTab(b, 'http://localhost:8792/?bots=18', 800, 480);
  const j1 = await newTab(b, 'http://localhost:8792/', 800, 480);
  const j2 = await newTab(b, 'http://localhost:8792/', 800, 480);
  await sleep(3500);
  await host.eval(`UI.prof.name='HOSTY'; Game.create()`);
  let code = null; for (let i = 0; i < 40 && !code; i++) { await sleep(300); code = await host.eval('Game.C() && Game.C().connected ? Game.C().code : null'); }
  await j1.eval(`UI.prof.name='JOINY'; UI.prof.look.shape=0; UI.prof.look.color=0; Game.join('${code}')`); await sleep(5000);
  out('j1', await j1.eval('Game.screen'), 'roster', await host.eval('Game.C().roster.length'));
  await j2.eval(`UI.prof.name='EXTRA'; Game.join('${code}')`); await sleep(5000);
  out('j2 (21st) ->', await j2.eval('Game.screen'));
  await j2.shot('shots/t5_full.png');
  // settings + players overlays
  await host.eval(`Game.C().overlay='hostset'`); await sleep(400); await host.shot('shots/t5_hostset.png');
  await host.eval(`Server.setSetting('hexCount',4); Server.setSetting('types','custom'); 1`); await sleep(300); await host.shot('shots/t5_hostset2.png');
  await j1.eval(`Game.C().overlay='hostset'`); await sleep(400); await j1.shot('shots/t5_rules_join.png');
  await host.eval(`Game.C().overlay='players'`); await sleep(400); await host.shot('shots/t5_players.png');
  await host.eval(`Game.C().overlay=null`);
  // kick j1, then rejoin
  const jid = await j1.eval('Game.C().id');
  await host.eval(`Server.kick('${jid}')`); await sleep(1500);
  out('kicked j1 screen', await j1.eval('Game.screen'));
  await j1.eval(`UI.sayClear(); Game.join('${code}')`); await sleep(5000);
  out('rejoin after kick ->', await j1.eval('Game.screen'));
  await j1.shot('shots/t5_kicked.png');
  // too many hex validity
  await host.eval(`[...Server.state().players.values()].filter(p=>p.bot).slice(0,15).forEach(p=>Server.kick(p.id)); 1`); await sleep(500);
  out('players now', await host.eval('Server.state().players.size'), 'hexCount', await host.eval('Server.state().settings.hexCount'));
  await host.eval(`Server.setSetting('hexCount',3)`); await sleep(300);
  out('start with 3 hex/4 players:', await host.eval('Server.start_game()'));
  await host.shot('shots/t5_toomany.png');
  // new code
  await host.eval('Server.newCode()'); await sleep(4000);
  const code2 = await host.eval('Game.C().code'); out('new code', code, '->', code2);
  await j2.eval(`UI.sayClear(); UI.prof.name='EXTRA'; Game.join('${code}')`); await sleep(6000); out('old code join ->', await j2.eval('Game.screen'));
  await j2.eval(`UI.sayClear(); Game.join('${code2}')`); await sleep(6000); out('new code join ->', await j2.eval('Game.screen'), await host.eval('Game.C().roster.length'));
  // secrecy: start a game with 2 hex among 5 (host + 3 bots + j2) and inspect j2 raw traffic
  await j2.eval(`window.__msgs=[]; Game.C().conn.on('data', m=>window.__msgs.push(m)); 1`);
  await host.eval(`Server.setSetting('hexCount',2); Server.setSetting('types','random'); 1`);
  out('start', await host.eval('Server.start_game()')); await sleep(9000);
  const role = await j2.eval('Game.C().myRole');
  out('j2 role', role, 'leak check:', await j2.eval(`(()=>{const ms=window.__msgs; const ros=ms.filter(m=>m.t==='r'); const snaps=ms.filter(m=>m.t==='s');
     return JSON.stringify({rosterHex: ros.some(r=>r.list.some(e=>e.hex && e.id!==Game.C().id)), snapFlags: snaps.some(s=>s.p.some(r=>r[6]&6)), meRoleInSnap: snaps.some(s=>s.me.role), revealMates: ms.filter(m=>m.k==='reveal').map(m=>m.mates.length)});})()`));
  await host.eval('Game.toMenu()'); await sleep(500);
  // mini-games
  const kinds = await host.eval('JSON.stringify(Object.keys(Tasks.GAMES))');
  for (const k of JSON.parse(kinds)) { await host.eval(`Tasks.open('${k}', ()=>{})`); await sleep(250); await host.shot(`shots/task_${k}.png`); await host.eval('Tasks.close()'); }
  // how to play pages
  await host.eval(`UI.sayClear(); Game.screen='howto'`);
  for (let i = 0; i < 11; i++) { await sleep(300); if (i === 4 || i === 5 || i === 6) await host.shot(`shots/help_${i}.png`); await host.press('ArrowRight', 'ArrowRight'); await host.press('Enter', 'Enter'); }
  for (const t of [host, j1, j2]) { const l = t.logs.filter(x => /EXCEPTION|rror/.test(x)); if (l.length) out('LOGS', l.slice(0, 6).join('\n')); }
  b.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
