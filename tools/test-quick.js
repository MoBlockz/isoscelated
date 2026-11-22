// needs: node tools/serve.js running, internet, Microsoft Edge. Quick Chat: tabs, smart lines, "It's <name>!" picker with typing.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9360);
  const h = await newTab(b, 'http://localhost:8792/?bots=3', 800, 480), j = await newTab(b, 'http://localhost:8792/', 800, 480); await sleep(3000);
  await h.eval(`UI.prof.name='HOSTY'; Game.create()`); let code = null; for (let i = 0; i < 40 && !code; i++) { await sleep(300); code = await h.eval('Game.C()&&Game.C().connected?Game.C().code:null'); }
  await j.eval(`UI.prof.name='BLOB'; Game.join('${code}')`); await sleep(6000);
  console.log('code', code, 'joiner screen', await j.eval('Game.screen'), 'say', await j.eval('UI.sayActive()'), j.logs.slice(0, 8).join(' / '), h.logs.slice(0, 8).join(' / '));
  // typed chat is gone: Enter opens Quick Chat
  await j.press('Enter', 'Enter'); await sleep(300); console.log('Enter opens:', await j.eval('Game.C().overlay'));
  await j.eval(`Game.C().qTab='agree'`); await sleep(300); await j.shot('shots/q_agree.png');
  await j.eval(`Game.C().qTab='deny'`); await sleep(300); await j.shot('shots/q_deny.png');
  const deny = await j.eval(`World.QUICK.findIndex(e=>e.t&&e.t.includes('Pythagoras'))`); await j.eval(`Game.quick(${deny})`); await sleep(1200);
  // WHO? -> type "hos" -> Enter
  await j.eval(`Game.C().overlay='quick'; Game.C().qTab='who'`); await sleep(300); await j.shot('shots/q_who.png');
  await j.eval(`Game.C().qWho=World.QUICK.findIndex(e=>e.t==="It's {N}!"); Game.C().whoFilter=''; Game.C().overlay='pickwho'`); await sleep(300);
  for (const ch of 'hos') await j.press('Key' + ch.toUpperCase(), ch); await sleep(300); await j.shot('shots/q_pick.png');
  await j.press('Enter', 'Enter'); await sleep(1200);
  console.log('host chat log:', await h.eval('JSON.stringify(Game.C().chat.map(m=>m.text))'));
  // typed chat attempt is refused by the host
  await j.eval(`Game.send({t:'c',ch:'all',text:'hello'})`); await sleep(800);
  console.log('typed msg reached host?', await h.eval('Game.C().chat.some(m=>m.text==="hello")'));
  await h.shot('shots/q_lobby_host.png');
  console.log(j.logs.concat(h.logs).filter(x => /EXC|rror/.test(x)).slice(0, 5).join('\n'));
  b.kill(); process.exit(0);
})();
