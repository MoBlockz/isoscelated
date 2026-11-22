// needs: node tools/serve.js running, internet (PeerJS), Microsoft Edge.
// Walks the host and a joined player around a Minotaur Maze, holding random directions (lots of wall sliding),
// and counts how often the host server rejected their own movement and snapped them back (= jitter).
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9540);
  const h = await newTab(b, 'http://localhost:8792/?relay=0', 800, 480); await sleep(2500);
  await h.eval(`UI.prof.name='HOSTY'; Game.create()`); await sleep(4000);
  const code = await h.eval('Game.C().code');
  const j = await newTab(b, 'http://localhost:8792/?relay=0', 800, 480); await sleep(2500);
  await j.eval(`UI.prof.name='JOINY'; Game.join(${JSON.stringify(code)})`); await sleep(5000);
  await h.eval('Server.addBot()');
  await h.eval(`Server.setSetting('mode','maze'); 1`);
  console.log('start:', await h.eval('Server.start_game()'));
  await sleep(5500 + 10500); // reveal + head start
  const walk = `(() => { window.__tp = 0; window.__snap = 0; let last = Game.C().me.tpSeq, lx = Game.C().me.x, ly = Game.C().me.y;
    const dirs = ['left','right','up','down']; let k = 'right';
    window.__iv = setInterval(() => { UI.keys = {}; if (Math.random() < 0.3) k = dirs[(Math.random() * 4) | 0]; UI.keys[k] = true; if (Math.random() < 0.3) UI.keys[dirs[(Math.random() * 4) | 0]] = true; }, 400);
    window.__iv2 = setInterval(() => { const me = Game.C().me; if (me.tpSeq !== last) { window.__tp++; if (Math.hypot(me.x - lx, me.y - ly) > 1.5) window.__snap++; last = me.tpSeq; } lx = me.x; ly = me.y; }, 5); })()`;
  await h.eval(walk); await j.eval(walk);
  await sleep(20000);
  for (const [n, t] of [['host', h], ['joiner', j]]) console.log(n, 'role', await t.eval('Game.C().myRole'), '| server snap-backs in 20s:', await t.eval('window.__tp'), '| visible jumps:', await t.eval('window.__snap'), '| phase', await t.eval('Game.C().phase'));
  b.kill(); process.exit(0);
})();
