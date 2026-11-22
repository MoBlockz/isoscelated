// needs: node tools/serve.js running, Microsoft Edge. Renders every chess piece and tests pawn -> piece in practice.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9321); const a = await newTab(b, 'http://localhost:8792/', 800, 480); await sleep(3000);
  // sheet: 6 pieces x 5 looks, drawn 3x on the menu canvas
  await a.eval(`(()=>{ window.__sheet = () => { const ctx=G.ctx; ctx.fillStyle='#e9d9c4'; ctx.fillRect(0,0,G.W,G.H);
    const looks=[{shape:0,color:0,pattern:0,hair:0,hairColor:0,hat:0,eyes:0,extra:1},{shape:1,color:7,pattern:1,hair:2,hairColor:3,hat:1,eyes:4,extra:2},
      {shape:2,color:3,pattern:2,hair:4,hairColor:2,hat:7,eyes:3,extra:6},{shape:3,color:10,pattern:3,hair:8,hairColor:0,hat:3,eyes:2,extra:4},{shape:4,color:17,pattern:0,hair:9,hairColor:6,hat:8,eyes:6,extra:3}];
    looks.forEach((l,r)=>{ for(let p=0;p<6;p++){ const c=G.bodySprite(p,l); ctx.drawImage(c, 6+p*64, 2+r*47, c.width*1.5|0, c.height*1.5|0);} }); }; })()`);
  await a.eval(`Game.screen='none'; (function loop(){ if(Game.screen==='none'){ __sheet(); G.present(); requestAnimationFrame(loop);} })()`);
  await sleep(500); await a.shot('shots/pieces_sheet.png');
  // practice: hex a dummy -> pawn, then fast-forward its age -> another piece
  await a.eval(`Game.screen='menu'; UI.prof.name='ME'; Game.practice(); UI.sayClear(); Game.practiceRole('classic'); UI.sayClear(); 1`); await sleep(800);
  await a.eval(`(()=>{const st=Server.state(); const me=st.players.get('h'); const d=[...st.players.values()].find(p=>p.bot); d.x=me.x+14; d.y=me.y; d.wait=99; d.goal=null; d.going=false;})()`); await sleep(400);
  await a.eval(`Game.act('hex'); UI.sayClear(); 1`); await sleep(1500);
  console.log('after hex:', await a.eval('JSON.stringify(Game.C().bodies)'));
  await a.shot('shots/pieces_pawn.png');
  await a.eval(`Server.state().bodies[0].age = 29.8`); await sleep(1500);
  console.log('after 30s:', await a.eval('JSON.stringify(Game.C().bodies)'), G => 0);
  await a.shot('shots/pieces_later.png');
  console.log(a.logs.filter(x => /EXC|rror/.test(x)).join('\n'));
  b.kill(); process.exit(0);
})();
