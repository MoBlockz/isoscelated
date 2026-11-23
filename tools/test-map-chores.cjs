const {launch,newTab,sleep}=require('./cdp'); const assert=require('assert'); const fs=require('fs');
(async()=>{const b=await launch(9575);try{const h=await newTab(b,'http://localhost:8792/',1000,640);await sleep(1500);await h.eval('Game.practice();UI.sayClear()');await sleep(1200);
console.log(await h.eval(`(()=>{for(const id of World.MAP_IDS){const m=World.buildMap(id);if(!m.taskKeys.length||new Set(m.taskKeys).size!==m.taskKeys.length)throw Error('pool '+id);for(const k of m.taskKeys)if(!Tasks.GAMES[k])throw Error(k);if(id!=='workshop'&&m.taskKeys.some(k=>!k.startsWith(id+'_')))throw Error('shared chore');}return 'PASS: separate map pools and registered minigames';})()`));
console.log(await h.eval(`(()=>{const old=UI.button;const ptr=UI.ptr;try{for(const [map,names] of Object.entries(World.MAP_CHORES))for(let i=0;i<names.length;i++){const game=Tasks.GAMES[map+'_'+i],s={};game.init(s);UI.button=()=>{};game.draw(s,10,10,240,145,.1);}return 'PASS: all 36 chore variants draw';}finally{UI.button=old;}})()`));
console.log(await h.eval(`(()=>{const c=Game.C();c.chat=[{text:'old round'}];c.bubbles={h:{q:0,t:4}};c.inbox.push({t:'e',k:'over',winner:'shapes',reason:'test',players:[],mode:'hex'});Game.pump();if(c.chat.length||Object.keys(c.bubbles).length)throw Error('old chat');c.chat=[{text:'old lobby'}];c.inbox.push(Object.assign({},c.snap,{t:'s',ph:'lobby'}));Game.pump();if(c.chat.length)throw Error('lobby chat');return 'PASS: round and lobby clear chat and bubbles';})()`));
await h.eval(`Game.practice();UI.sayClear()`);await sleep(600);await h.eval(`Game.C().overlay='quick';Game.C().qTab='question'`);await h.shot('shots/questions-new.png');
for(const [map,kind] of [['castle','castle_0'],['palace','palace_0'],['jurassic','jurassic_0']]){await h.eval(`Game.C().overlay=null;Game.C().map=World.buildMap('${map}');Tasks.open('${kind}',()=>{});`);await sleep(300);await h.shot('shots/chore-'+map+'.png');}
console.log(await h.eval(`(()=>{
 const old=UI.button,ptr={...UI.ptr};let controls=[]; UI.button=(x,y,w,h,label,fn)=>controls.push({label,fn});
 try{for(const map of ['castle','palace','jurassic'])for(let type=0;type<4;type++){
 const g=Tasks.GAMES[map+'_'+type*3],st={};g.init(st);let done=false;
 const draw=(dt=0)=>{controls=[];done=g.draw(st,10,10,240,145,dt);};
 const press=label=>{const c=controls.find(c=>c.label===label);if(!c)throw Error(label);c.fn();draw();};draw();
 if(map==='castle'){
 if(type===0)for(let i=0;i<18;i++)press(st.side===0?'LEFT':'RIGHT');
 if(type===1)for(const i of st.order.slice())press(String(i+1));
 if(type===2)for(let i=0;i<4;i++)while(st.rot[i]){controls[i].fn();draw();}
 if(type===3)for(let j=0;j<3;j++){for(let i=0;i<30;i++){const error=(30+st.power*200)-(55+st.goal*170);if(Math.abs(error)<10)break;press(error>0?'-':'+');}press('FIRE');}
 }else if(map==='palace'){
 if(type===0)for(let i=0;i<3;i++){controls[i].fn();draw(st.goal[i]/.15);controls[i].fn();draw();}
 if(type===1)for(let i=0;i<24;i++)if(!st.rocks.has(i)){UI.ptr.down=true;UI.ptr.x=10+10+(i%8)*220/8+10;UI.ptr.y=10+35+Math.floor(i/8)*25+10;draw();}UI.ptr.down=false;
 if(type===2)for(let i=1;i<=4;i++)press(String(i));
 if(type===3)for(const i of st.score.slice())press(String(i+1));
 }else{
 if(type===0)for(let i=0;i<48;i++){UI.ptr.justDown=true;UI.ptr.x=20+(i%12)*220/12+1;UI.ptr.y=42+Math.floor(i/12)*20+1;for(let j=0;j<4;j++)draw();}UI.ptr.justDown=false;
 if(type===1)for(let t=0;t<2000&&!done;t++){st.heat=st.temp<.52;draw(.02);}
 if(type===2)for(const [u,v] of st.path){UI.ptr.justDown=true;UI.ptr.x=10+u*240;UI.ptr.y=10+v*120+20;draw();}UI.ptr.justDown=false;
 if(type===3)for(let i=0;i<3;i++){UI.ptr.justDown=true;UI.ptr.x=130+Math.sin(st.t*1.4+st.seed)*92;UI.ptr.y=75+Math.cos(st.t*1.9)*20;draw();UI.ptr.justDown=false;draw(.5);}
 }
 if(!done)throw Error('Cannot finish '+map+' type '+type);
 }return 'PASS: all 12 distinct mechanics can be completed';}finally{UI.button=old;Object.assign(UI.ptr,ptr);}})()`));
const blimp=await h.eval(`World.propSprite({k:'blimp',w:14,h:3}).toDataURL('image/png').split(',')[1]`);fs.writeFileSync('shots/blimp-redrawn.png',Buffer.from(blimp,'base64'));
console.log(await h.eval(`(()=>{for(const map of World.MAP_IDS){const st=Server.state();st.phase='lobby';st.settings.map=map;const err=Server.start_game();if(err)throw Error(err);for(const p of st.players.values())if(p.tasks.length!==8||p.tasks.some(t=>!st.map.taskKeys.includes(t.k)))throw Error('assignment '+map);}return 'PASS: server assigns eight valid chores on every map';})()`));
await h.eval(`(async()=>{Game.practice();UI.sayClear();await new Promise(r=>setTimeout(r,150));Game.pump();const c=Game.C();c.chat=[];Server.state().players.get('h').lastChat=-99999;const q=World.QUICK.findIndex(e=>e.c==='question'&&e.t.includes('{N}'));Game.quick(q,'b1');})()`);await sleep(300);console.log(await h.eval(`(()=>{const m=Game.C().chat.find(m=>m.text.includes('ring the bell'));if(!m||m.text.includes('???')||m.text.includes('{N}'))throw Error('question delivery '+JSON.stringify({chat:Game.C().chat,keys:[...Server.state().players.keys()],q:World.QUICK.findIndex(e=>e.c==='question'&&e.t.includes('{N}')),log:Server.state().players.get('h').chatLog}));return 'PASS: named question delivered through server';})()`));
const errors=h.logs.filter(x=>/EXCEPTION|error:/.test(x));assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: no browser exceptions');}finally{b.kill();}process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
