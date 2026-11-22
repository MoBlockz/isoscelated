// needs: node tools/serve.js running, internet (PeerJS), Microsoft Edge.
// Minotaur Maze with a joined player: measures how evenly the OTHER players glide on the joiner's screen
// (stalls = frames where a running player didn't move, jerk = how much the per-frame step changes).
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9560);
  const h = await newTab(b, 'http://localhost:8792/?relay=' + (process.env.RELAY ? 1 : 0), 800, 480); await sleep(2500);
  await h.eval(`UI.prof.name='HOSTY'; Game.create()`);
  let code = null; for (let i = 0; i < 40 && !code; i++) { await sleep(300); code = await h.eval('Game.C() && Game.C().connected ? Game.C().code : null'); }
  const j = await newTab(b, 'http://localhost:8792/?relay=' + (process.env.RELAY ? 1 : 0), 800, 480); await sleep(2500);
  await j.eval(`UI.prof.name='JOINY'; Game.join(${JSON.stringify(code)})`); await sleep(process.env.RELAY ? 12000 : 5000);
  for (let i = 0; i < 3; i++) await h.eval('Server.addBot()');
  await h.eval(`Server.setSetting('mode','maze'); 1`); console.log('start:', await h.eval('Server.start_game()'));
  await sleep(17000);
  await j.eval(`(() => { window.__st = { frames: 0, stall: 0, jerk: 0, n: 0, cam: new Set() }; const last = new Map();
    (function f() { const C = Game.C(); if (!C) return; for (const [id, o] of C.others) { if (!o.vis) continue; const l = last.get(id);
      if (l && o.mv && l.mv) { const st = Math.hypot(o.x - l.x, o.y - l.y); if (st < 0.05) __st.stall++; if (l.st != null) __st.jerk += Math.abs(st - l.st); __st.n++; last.set(id, { x: o.x, y: o.y, mv: o.mv, st }); } else last.set(id, { x: o.x, y: o.y, mv: o.mv }); }
      __st.frames++; requestAnimationFrame(f); })(); })()`);
  await sleep(2000); console.log(await j.eval(`JSON.stringify([...Game.C().others.entries()].map(([id,o])=>[id,o.vis,o.mv,Math.round(o.x),o.buf.length,o.buf.slice(-2).map(b=>[Math.round(b[0]-performance.now()),b[1],b[4]])]))+' late '+Game.C().late+' off '+Game.C().clockOff`));
  console.log('joiner:', await j.eval(`(() => { const s = __st; return 'frames ' + s.frames + ' | samples ' + s.n + ' | stalls ' + (100 * s.stall / Math.max(1, s.n)).toFixed(1) + '% | avg step change ' + (s.jerk / Math.max(1, s.n)).toFixed(3) + 'px | interpDelay ' + Math.round(Game.C().interpDelay) + ' jit ' + Math.round(Game.C().jit || 0); })()`));
  b.kill(); process.exit(0);
})();
