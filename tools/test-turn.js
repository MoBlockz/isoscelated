// Checks which free TURN relay servers actually hand out relay candidates (what makes cross-network play work).
const { launch, newTab, sleep } = require('./cdp');
const SERVERS = [
  { urls: 'turn:eu-0.turn.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' },
  { urls: 'turn:us-0.turn.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:freeturn.net:3478', username: 'free', credential: 'free' },
  { urls: 'turns:freeturn.tel:5349', username: 'free', credential: 'free' },
];
(async () => {
  const b = await launch(9330); const a = await newTab(b, 'http://localhost:8792/', 400, 300); await sleep(2000);
  for (const s of SERVERS) {
    const r = await a.eval(`new Promise(res => { const pc = new RTCPeerConnection({ iceServers: [${JSON.stringify(s)}], iceTransportPolicy: 'relay' }); const got = [];
      pc.onicecandidate = e => { if (e.candidate && e.candidate.candidate) got.push(e.candidate.candidate.split(' ')[4]); };
      pc.createDataChannel('x'); pc.createOffer().then(o => pc.setLocalDescription(o));
      setTimeout(() => { pc.close(); res(got.length ? 'RELAY OK ' + got[0] : 'no relay'); }, 6000); })`);
    console.log(s.urls.padEnd(48), r);
  }
  b.kill(); process.exit(0);
})();
