// ISOSCELATED - networking. The host's browser runs the game; the lobby code is the room id.
// Two ways to connect, tried automatically:
//   1. Direct (PeerJS / WebRTC) - fastest, works when both routers allow it.
//   2. Relay (js/relay.js) - encrypted messages through free public MQTT brokers; works from any network.
'use strict';
const Net = {};
(function () {
  Net.CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no O/0, I/1/L, no digits at all
  Net.PREFIX = 'isoscelated-v1-';
  Net.newCode = function () { let s = ''; for (let i = 0; i < 5; i++) s += Net.CODE_CHARS[Math.floor(Math.random() * Net.CODE_CHARS.length)]; return s; };
  Net.peerAvailable = () => typeof Peer !== 'undefined';
  const q = new URLSearchParams(location.search);
  Net.forceRelay = q.get('relay') === '1';   // testing: skip direct connections
  Net.noRelay = q.get('relay') === '0';      // testing: direct only
  const PEER_OPTS = { debug: 0 };

  // ---------- HOST ----------
  // cb.onReady(code), cb.onConn(conn, code), cb.onError(msg). Returns a link {code, newCode(cb), close()}
  Net.host = function (cb) {
    const L = { code: null, peers: [], relay: null, closed: false };
    let readyFired = false;
    const ready = code => { if (readyFired || L.closed) return; readyFired = true; L.code = code; cb.onReady(code); };
    function startPeer(code, tries, onOk, onFail) {
      if (!Net.peerAvailable() || Net.forceRelay) { onFail('nopeer'); return; }
      const peer = new Peer(Net.PREFIX + code, PEER_OPTS); let settled = false;
      const to = setTimeout(() => { if (!settled) { settled = true; onFail('timeout'); } }, 9000);
      peer.on('open', () => { if (settled) return; settled = true; clearTimeout(to); L.peers.push(peer); onOk(code, peer); });
      peer.on('connection', conn => conn.on('open', () => cb.onConn(conn, code)));
      peer.on('error', e => {
        if (e.type === 'unavailable-id' && !settled) { settled = true; clearTimeout(to); try { peer.destroy(); } catch (x) { } onFail('taken'); return; }
        if (!settled) { settled = true; clearTimeout(to); onFail(e.type || 'error'); }
      });
      peer.on('disconnected', () => { if (!peer.destroyed && !peer._noReconnect && !L.closed) setTimeout(() => { try { if (!peer.destroyed && !peer._noReconnect) peer.reconnect(); } catch (e) { } }, 1500); });
    }
    function begin(tries) {
      const code = Net.newCode();
      if (!Net.noRelay) { if (!L.relay) L.relay = Relay.host(code, (conn, c) => cb.onConn(conn, c)); else L.relay.addCode(code); }
      startPeer(code, tries, c => ready(c), why => {
        if (why === 'taken' && tries < 6) { begin(tries + 1); return; }
        // direct hosting failed (network blocks it?) - carry on with the relay only
        if (L.relay) L.relay.ready.then(ok => ok ? ready(code) : cb.onError('Could not create a lobby. Check your internet and try again.'));
        else cb.onError('Could not create a lobby. Check your internet and try again.');
      });
    }
    begin(0);
    L.newCode = function (onDone) {
      // keep current players connected, but stop the old code from accepting anyone new
      for (const p of L.peers) { p._noReconnect = true; try { p.disconnect(); } catch (e) { } }
      const code = Net.newCode(); if (L.relay) L.relay.addCode(code);
      startPeer(code, 0, c => { L.code = c; onDone(c); }, () => { L.code = code; onDone(code); });
    };
    L.close = function () { L.closed = true; for (const p of L.peers) { try { p._noReconnect = true; p.destroy(); } catch (e) { } } if (L.relay) L.relay.close(); };
    return L;
  };

  // ---------- CLIENT ----------
  // cb.onOpen(conn), cb.onMsg(msg), cb.onClose(), cb.onError(msg), cb.onStatus(text)
  Net.join = function (code, cb) {
    let cur = null, finished = false, cancelled = false;
    const L = { close() { cancelled = true; if (cur) cur.close(); } };
    const viaRelay = (unavailable) => {
      if (cancelled || Net.noRelay) { if (!cancelled) cb.onError(unavailable ? 'No lobby with that code.' : 'Could not connect. Check the code and your internet, then try again.'); return; }
      cb.onStatus && cb.onStatus('Connecting through the relay');
      cur = Relay.join(code, { onOpen: c => { L.mode = 'relay'; cb.onOpen(c); }, onMsg: cb.onMsg, onClose: cb.onClose, onError: cb.onError });
    };
    if (!Net.peerAvailable() || Net.forceRelay) { viaRelay(false); return L; }
    // 1) try a direct connection first
    const peer = new Peer(PEER_OPTS); let opened = false, conn = null, given = false;
    const giveUp = unavailable => { if (given) return; given = true; clearTimeout(to); try { peer.destroy(); } catch (e) { } viaRelay(unavailable); };
    const to = setTimeout(() => giveUp(false), 8000);
    peer.on('open', () => {
      conn = peer.connect(Net.PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => { if (given || cancelled) return; given = true; opened = true; clearTimeout(to); L.mode = 'direct'; cb.onOpen(conn); });
      conn.on('data', d => cb.onMsg(d));
      conn.on('close', () => { if (opened && !cancelled) cb.onClose(); });
      conn.on('error', () => { });
    });
    peer.on('error', e => { if (!opened) giveUp(e.type === 'peer-unavailable'); });
    cur = { close() { try { conn && conn.close(); } catch (e) { } try { peer.destroy(); } catch (e) { } } };
    return L;
  };
})();
