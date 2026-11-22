// needs: node tools/serve.js running, Microsoft Edge. The ▶ in the song lists only marks the selected (playing) song.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9450); const a = await newTab(b, 'http://localhost:8792/', 800, 480); await sleep(2500);
  await a.eval(`Game.screen='settings'`); await sleep(400); await a.shot('shots/juke_0.png');
  // click the 2nd song (internal 400x240 at 2x: songs start around y=~95)
  const y2 = await a.eval(`(()=>{ return 0; })()`);
  for (let i = 0; i < 30; i++) { const want = await a.eval(`Snd.TRACKS[1].id`); await a.click(400, 2 * (34 + 15 * 3 + 6 + 12 + 17 * 1 + 7)); await sleep(150); if (await a.eval(`Snd.current`) === want) break; }
  await sleep(300); await a.shot('shots/juke_1.png'); console.log('after click playing:', await a.eval('Snd.current'));
  await a.press('ArrowDown', 'ArrowDown'); await sleep(400); await a.shot('shots/juke_2.png'); console.log('after Down playing:', await a.eval('Snd.current'));
  await a.press('ArrowDown', 'ArrowDown'); await sleep(400); console.log('after Down playing:', await a.eval('Snd.current'));
  await a.shot('shots/juke_3.png');
  b.kill(); process.exit(0);
})();
