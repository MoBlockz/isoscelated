// needs: node tools/serve.js running, Microsoft Edge. End-of-game highlights for a Hexagoner win and a Shapes win.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9520); const a = await newTab(b, 'http://localhost:8792/', 800, 480); await sleep(2500);
  await a.eval(`UI.prof.name='ME'; Game.practice(); UI.sayClear(); 1`); await sleep(800);
  const mk = `(winner) => { const L = () => G.randomLook(); const P = (name, role, alive, type) => ({ id: name, name, look: L(), role, type: type || null, alive, left: false, stats: { hexes: 2, framed: 1, shifts: 0, tasks: 4, votes: 1 } });
    return { winner, reason: winner === 'hex' ? 'The Hexagoners took over the workshop!' : 'All the Hexagoners were voted out!', t: 3, t0: performance.now() - 3000,
      players: [P('HEXY', 'hex', winner === 'hex', 'plant'), P('SHIFTY', 'hex', winner === 'hex', 'shift'), P('BLOB', 'shape', true), P('ZIGZAG', 'shape', winner !== 'hex'), P('POINTY', 'shape', false), P('ROUNDY', 'shape', false), P('CUBY', 'shape', winner !== 'hex'), P('PIP', 'shape', true)] }; }`;
  await a.eval(`Game.C().over = (${mk})('hex'); 1`); await sleep(700); await a.shot('shots/podium_hex.png');
  await a.eval(`Game.C().over = (${mk})('shapes'); 1`); await sleep(700); await a.shot('shots/podium_shapes.png');
  console.log(a.logs.filter(x => /EXC|rror/.test(x)).slice(0, 5).join('\n'));
  b.kill(); process.exit(0);
})();
