const { launch, newTab, sleep } = require('./cdp'); const fs = require('fs');
(async () => {
  const b = await launch(9311); const a = await newTab(b, 'http://localhost:8792/', 400, 300); await sleep(3000);
  for (const [S, n] of [[180, 30], [512, 32]]) {
    const data = await a.eval(`(()=>{const n=${n}; const [c,x]=G.mk(n,n); x.fillStyle='#2b2140'; x.fillRect(0,0,n,n); x.fillStyle='#33284c'; for(let i=0;i<n;i+=4)for(let j=0;j<n;j+=4)if(((i+j)/4)%2===0)x.fillRect(i,j,4,4);
      G.drawLogo(n/2,n/2,0,1,x);
      const [o,ox]=G.mk(${S},${S}); ox.imageSmoothingEnabled=false; ox.drawImage(c,0,0,${S},${S}); return o.toDataURL('image/png');})()`);
    fs.writeFileSync(S === 180 ? '../assets/icon.png' : '../assets/icon-512.png', Buffer.from(data.split(',')[1], 'base64'));
  }
  b.kill(); process.exit(0);
})();
