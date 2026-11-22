// ISOSCELATED - networking: PeerJS (WebRTC). The host's browser runs the game; the lobby code is the room id.
'use strict';
const Net = {};
(function () {
  Net.CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no O/0, I/1/L, no digits at all
  Net.PREFIX = 'isoscelated-v1-';
  Net.newCode = function () { let s = ''; for (let i = 0; i < 5; i++) s += Net.CODE_CHARS[Math.floor(Math.random() * Net.CODE_CHARS.length)]; return s; };
  Net.available = function () { return typeof Peer !== 'undefined'; };
  const PEER_OPTS = { debug: 0 };

  // HOST: open a peer whose id is the lobby code. cb.onReady(code), cb.onConn(conn), cb.onError(msg)
  Net.host = function (cb, tries) {
    tries = tries || 0;
    if (!Net.available()) { cb.onError('Could not load the network library. Check your internet connection.'); return null; }
    const code = Net.newCode();
    const peer = new Peer(Net.PREFIX + code, PEER_OPTS);
    let opened = false;
    const to = setTimeout(() => { if (!opened) { try { peer.destroy(); } catch (e) { } cb.onError('Could not reach the lobby server. Check your internet and try again.'); } }, 12000);
    peer.on('open', () => { opened = true; clearTimeout(to); cb.onReady(code, peer); });
    peer.on('connection', conn => cb.onConn(conn));
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tries < 6) { clearTimeout(to); opened = true; try { peer.destroy(); } catch (x) { } Net.host(cb, tries + 1); return; }
      if (!opened) { clearTimeout(to); opened = true; cb.onError('Could not create a lobby (' + (e.type || 'error') + '). Try again.'); }
      else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') { /* signalling lost; existing games keep working */ }
    });
    peer.on('disconnected', () => { if (!peer.destroyed && !peer._noReconnect) setTimeout(() => { try { if (!peer.destroyed && !peer._noReconnect) peer.reconnect(); } catch (e) { } }, 1500); });
    return peer;
  };

  // CLIENT: join a code. cb.onOpen(conn), cb.onMsg(msg), cb.onClose(), cb.onError(msg)
  Net.join = function (code, cb) {
    if (!Net.available()) { cb.onError('Could not load the network library. Check your internet connection.'); return null; }
    const peer = new Peer(PEER_OPTS);
    let done = false, conn = null;
    const fail = m => { if (done) return; done = true; clearTimeout(to); try { peer.destroy(); } catch (e) { } cb.onError(m); };
    const to = setTimeout(() => fail('Could not connect. Check the code and your internet, then try again.'), 15000);
    peer.on('open', () => {
      conn = peer.connect(Net.PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => { if (done) return; done = true; clearTimeout(to); cb.onOpen(conn); });
      conn.on('data', d => cb.onMsg(d));
      conn.on('close', () => { if (done) cb.onClose(); });
      conn.on('error', () => { });
    });
    peer.on('error', e => {
      if (e.type === 'peer-unavailable') fail('No lobby with that code.');
      else if (!done) fail('Could not connect (' + (e.type || 'error') + '). Try again.');
    });
    // watchdog: if the host vanishes without a close event
    return { peer, close() { done = true; clearTimeout(to); try { conn && conn.close(); } catch (e) { } try { peer.destroy(); } catch (e) { } } };
  };
})();
