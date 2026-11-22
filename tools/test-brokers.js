// Which public MQTT-over-WebSocket brokers can a browser reach?
const { launch, newTab, sleep } = require('./cdp');
const B = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt', 'wss://public.mqtthq.com:8084/mqtt'];
(async () => {
  const b = await launch(9332); const a = await newTab(b, 'http://localhost:8792/', 400, 300); await sleep(1500);
  for (const u of B) {
    const r = await a.eval(`new Promise(res => { const t0 = performance.now(); let ws; try { ws = new WebSocket(${JSON.stringify(u)}, 'mqtt'); } catch (e) { res('throw ' + e); return; }
      ws.binaryType = 'arraybuffer'; const id = 'isotest' + Math.random().toString(36).slice(2, 8);
      ws.onopen = () => { const enc = new TextEncoder().encode(id); const vh = [0,4,77,81,84,84,4,2,0,30, 0, enc.length, ...enc]; ws.send(new Uint8Array([0x10, vh.length, ...vh])); };
      ws.onmessage = e => { const d = new Uint8Array(e.data); res('CONNACK rc=' + d[3] + ' in ' + Math.round(performance.now() - t0) + 'ms'); ws.close(); };
      ws.onerror = () => res('error'); setTimeout(() => res('timeout'), 6000); })`);
    console.log(u.padEnd(42), r);
  }
  b.kill(); process.exit(0);
})();
