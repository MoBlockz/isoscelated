// needs: node tools/serve.js running, internet (PeerJS), Microsoft Edge. Fair role picks + Squareff powers.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9410);
  const h = await newTab(b, 'http://localhost:8792/', 800, 480); await sleep(2500);
  await h.eval(`UI.prof.name='HOSTY'; Game.create()`); await sleep(4000);
  for (let i = 0; i < 7; i++) await h.eval('Server.addBot()');
  console.log(await h.eval(`(()=>{ const st=Server.state(); const hexN={}, sqN={}, types={};
    for (let k=0;k<10;k++){ st.phase='lobby'; Server.setSetting('hexCount',1); Server.start_game();
      for (const p of st.players.values()) { if(p.role==='hex'){ hexN[p.name]=(hexN[p.name]||0)+1; types[p.type]=(types[p.type]||0)+1; } if(p.sq) sqN[p.name]=(sqN[p.name]||0)+1; } }
    const f = o => Object.entries(o).map(([k,v])=>k+':'+v).join(' ');
    return 'HEXAGONER picks per player (expect ~500 each): '+f(hexN)+'\\nSQUAREFF picks (expect ~571 each of the 7 Shapes): '+f(sqN)+'\\nTYPES: '+f(types); })()`));
  // Squareff powers in a real game: make the host the Squareff, a bot a shapeshifter (disguised) and mark another
  await h.eval(`(()=>{ const st=Server.state(); st.phase='lobby'; Server.setSetting('hexCount',1); Server.start_game(); })()`); await sleep(6500);
  await h.eval(`(()=>{ const st=Server.state(); const ps=[...st.players.values()]; ps.forEach(p=>{p.role='shape';p.type=null;p.sq=false;p.shiftAs=null;}); const me=st.players.get('h'); me.sq=true;
    const bots=ps.filter(p=>p.bot); const X=bots[0], Y=bots[1], Z=bots[2]; X.role='hex'; X.type='shift'; X.shiftAs=Y.id; X.shiftT=99; Z.role='hex'; Z.type='plant'; st.marks=[{by:Z.id,target:Y.id,t:0}];
    for (const [i,p] of [X,Y,Z].entries()) { p.ai=false; p.x=me.x+40+i*40; p.y=me.y+10; p.wait=999; p.goal=null; p.going=false; p.hexCd=999; } Game.C().mySq=true; st.sab={k:'lights',sw:[false,false]}; setTimeout(()=>{st.sab={k:null};},900); window.__ids=[X.id,Y.id]; })()`);
  await sleep(1200);
  console.log('Squareff sees: disguised flag on X =', await h.eval(`!!(Game.C().others.get(__ids[0]).fl & 8)`), '| marked flag on Y =', await h.eval(`!!(Game.C().others.get(__ids[1]).fl & 4)`), '| vision during lights out =', await h.eval(`Math.round(Game.C().vis)`), '(normal Shapes get 38)');
  await h.shot('shots/squareff.png');
  b.kill(); process.exit(0);
})();
