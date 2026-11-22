// needs: node tools/serve.js running, Microsoft Edge. Renders every shape with fitted hair, cape (back view), cane, anime eyes, and ghosts.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9400); const a = await newTab(b, 'http://localhost:8792/', 400, 240, 5); await sleep(2500);
  await a.eval(`Game.screen='none'; (function loop(){ if(Game.screen!=='none') return; const ctx=G.ctx; ctx.fillStyle='#e9d9c4'; ctx.fillRect(0,0,G.W,G.H);
    const n=G.SHAPES.length; for(let i=0;i<n;i++){ const look={shape:i,color:(i*5)%18,pattern:0,hair:[4,9,0,2,4,9,5,4,9,0,4,9,4,9,4,9,2][i],hairColor:(i*3)%10,hat:0,eyes:i%3?7:0,extra:[0,7,3,0,7,3,0,7,3,0,7,3,0,7,3,0,7][i],acc:(i*7)%18};
      const x=14+(i%9)*42, y=40+Math.floor(i/9)*52; G.drawChar(look,0,0,x,y); G.drawChar(look,1,0,x+18,y); G.tiny(G.SHAPES[i].split(' ')[0],x+6,y+3,'#333','c'); }
    for(let i=0;i<4;i++){ const look={shape:i*4,color:i*4,pattern:0,hair:4,hairColor:2,hat:i?1:0,eyes:7,extra:3,acc:i+2}; G.drawGhost(look,[0,1,2,3][i],30+i*40,G.H-10-Math.round(Math.sin(performance.now()/260+i)*3)-7,0.7,performance.now()/1000+i); }
    G.present(); requestAnimationFrame(loop); })()`);
  await sleep(600); await a.shot('shots/looks.png');
  console.log(a.logs.filter(x => /EXC|rror/.test(x)).join('\n'), await a.eval('G.W+"x"+G.H'));
  b.kill(); process.exit(0);
})();
