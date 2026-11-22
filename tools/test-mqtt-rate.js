// needs: node tools/serve.js running, internet, Microsoft Edge. Raw broker throughput/loss test using js/relay.js's MQTT client.
const { launch, newTab, sleep } = require('./cdp');
(async () => {
  const b = await launch(9342); const a = await newTab(b, 'http://localhost:8792/', 400, 300); await sleep(2500);
  for (const url of (process.argv[2] ? [process.argv[2]] : ['wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt'])) for (const [rate, size] of (process.argv[3] ? JSON.parse(process.argv[3]) : [[10, 300], [30, 1500], [60, 1500]])) {
    const r = await a.eval(`(async () => {
      const A = new Relay.Mqtt(${JSON.stringify(url)}), B = new Relay.Mqtt(${JSON.stringify(url)}); await A.ready; await B.ready;
      const topic = 'isoscelated/v1/ratetest' + Math.random().toString(36).slice(2, 8); let got = 0; B.onmsg = () => got++; B.sub(topic); await new Promise(r => setTimeout(r, 800));
      const payload = 'x'.repeat(${size}); const n = ${rate} * 4;
      for (let i = 0; i < n; i++) { A.pub(topic, payload + i); await new Promise(r => setTimeout(r, 1000 / ${rate})); }
      await new Promise(r => setTimeout(r, 1500)); A.close(); B.close(); return got + '/' + n; })()`);
    console.log(url.slice(6, 24).padEnd(20), rate + '/s', size + 'B', '->', r);
  }
  b.kill(); process.exit(0);
})();
