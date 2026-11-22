/* Isoscelated — audio engine.
 * Web Audio only. All music is original and generated procedurally with a
 * lookahead scheduler; SFX are small chiptune-style synth blips.
 * Global API: window.Snd (see bottom of file).
 */
(function () {
  'use strict';

  var W = typeof window !== 'undefined' ? window : {};
  var AC = W.AudioContext || W.webkitAudioContext || null;

  var ctx = null, master, musicGain, sfxGain, musicRev, sfxRev, convolver, noiseBuf;
  var musicVol = 0.6, sfxVol = 0.8;
  var MUSIC_LVL = 0.8, SFX_LVL = 0.75;
  var FADE = 1.5, LOOK = 0.2, TICK_MS = 25;
  var timer = null, mp3Checked = false;

  /* ------------------------------------------------------------ helpers */
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function acc(c) { return c === '#' ? 1 : c === 'b' ? -1 : 0; }
  function nm(s) {
    var m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    if (!m) throw new Error('bad note ' + s);
    return PCN[m[1]] + acc(m[2]) + 12 * (+m[3] + 1);
  }
  function pcOf(s) { return (PCN[s.charAt(0)] + acc(s.charAt(1)) + 12) % 12; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hm() { return (Math.random() - 0.5) * 0.012; }

  var CT = {
    '': [0, 4, 7], m: [0, 3, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 14],
    maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], 'maj7#11': [0, 4, 7, 11, 14, 18],
    6: [0, 4, 7, 9], 69: [0, 4, 9, 14], m6: [0, 3, 7, 9],
    m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
    mM7: [0, 3, 7, 11], mM9: [0, 3, 7, 11, 14],
    7: [0, 4, 7, 10], 9: [0, 4, 10, 14], 13: [0, 4, 10, 14, 21],
    '7b9': [0, 4, 10, 13], '7#9': [0, 4, 10, 15], '7sus': [0, 5, 10, 14]
  };
  function parseChord(sym) {
    var parts = sym.split('/');
    var m = /^([A-G][#b]?)(.*)$/.exec(parts[0]);
    var iv = CT[m[2]];
    if (!iv) throw new Error('bad chord ' + sym);
    var root = pcOf(m[1]);
    return { sym: sym, root: root, iv: iv, bass: parts[1] ? pcOf(parts[1]) : root };
  }
  function has(a, x) { return a.indexOf(x) >= 0; }
  function third(c) { return has(c.iv, 4) ? 4 : has(c.iv, 3) ? 3 : 5; }
  function fifth(c) { return has(c.iv, 6) && !has(c.iv, 7) ? 6 : 7; }
  function seventh(c) { return has(c.iv, 10) ? 10 : has(c.iv, 11) ? 11 : has(c.iv, 9) ? 9 : 12; }

  // rootless-ish voicing with lowest note in [lo, lo+12)
  function voicing(c, lo) {
    lo = lo || 52;
    var iv = c.iv.filter(function (x) { return x !== 0; });
    if (iv.length >= 4 && has(iv, 7)) iv.splice(iv.indexOf(7), 1);
    if (iv.length < 3) iv = c.iv.slice();
    var ns = iv.map(function (i) { return c.root + 48 + i; }).sort(function (a, b) { return a - b; });
    while (ns[0] < lo) ns = ns.map(function (n) { return n + 12; });
    while (ns[0] >= lo + 12) ns = ns.map(function (n) { return n - 12; });
    return ns;
  }
  // simple triad (+octave) voicing for the showdown
  function triad(c, lo) {
    var b = c.root + 48;
    while (b < lo) b += 12;
    while (b >= lo + 12) b -= 12;
    return [b, b + third(c), b + fifth(c), b + 12];
  }
  function parseMel(s) {
    if (!s) return [];
    return s.trim().split(/\s+/).map(function (tok) {
      var p = tok.split(':');
      return [+p[0], nm(p[1]), +p[2]];
    });
  }
  function swingT(p, s) {
    var b = Math.floor(p), f = p - b;
    return b + (f < 0.5 ? f * (s / 0.5) : s + (f - 0.5) * ((1 - s) / 0.5));
  }

  /* ------------------------------------------------------------ core nodes */
  function makeIR() {
    var rate = ctx.sampleRate, len = Math.floor(rate * 2.3);
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), lp = 0;
      for (var i = 0; i < len; i++) {
        var x = i / len;
        var k = 0.55 + 0.4 * x;                    // gets darker as it decays
        lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
        var pre = i < rate * 0.012 ? i / (rate * 0.012) : 1;
        d[i] = lp * Math.pow(1 - x, 2.2) * Math.exp(-x * 2.5) * pre * 2.2;
      }
    }
    return buf;
  }
  function makeNoise() {
    var len = Math.floor(ctx.sampleRate * 2);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function setupGraph() {
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 3;
    comp.attack.value = 0.01; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = 1;
    master.connect(comp); comp.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = musicVol * MUSIC_LVL; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxVol * SFX_LVL; sfxGain.connect(master);
    convolver = ctx.createConvolver(); convolver.buffer = makeIR(); convolver.connect(master);
    musicRev = ctx.createGain(); musicRev.gain.value = musicVol * MUSIC_LVL; musicRev.connect(convolver);
    sfxRev = ctx.createGain(); sfxRev.gain.value = sfxVol * SFX_LVL * 0.35; sfxRev.connect(convolver);
    noiseBuf = makeNoise();
  }

  function nz(t, dur) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }
  function filt(type, f, q) {
    var b = ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f;
    if (q != null) b.Q.value = q;
    return b;
  }
  function gn(v) { var g = ctx.createGain(); g.gain.value = v == null ? 1 : v; return g; }
  function osc(type, f) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  // route a voice into a track: wet 0 = dry, 1 = a little reverb, 2 = more
  function out(node, tr, wet) {
    node.connect(tr.dry);
    if (wet === 1) node.connect(tr.lo); else if (wet === 2) node.connect(tr.hi);
  }

  /* ------------------------------------------------------------ instruments */
  function iBass(tr, t, m, dur, vel, cut) {
    var f = mtof(m), end = t + dur;
    var o1 = osc('triangle', f), o2 = osc('sawtooth', f), g2 = gn(0.32);
    var lp = filt('lowpass', 900, 1.4), g = gn(0);
    cut = cut || 900;
    o2.connect(g2); g2.connect(lp); o1.connect(lp); lp.connect(g);
    lp.frequency.setValueAtTime(cut * 1.7, t);
    lp.frequency.exponentialRampToValueAtTime(cut * 0.4, t + 0.16);
    var dk = Math.min(0.2, dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.007);
    g.gain.exponentialRampToValueAtTime(vel * 0.5, t + dk);
    g.gain.exponentialRampToValueAtTime(vel * 0.3, end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.07);
    o1.start(t); o2.start(t); o1.stop(end + 0.1); o2.stop(end + 0.1);
    out(g, tr, 0);
  }

  // warm electric-piano style chord tone
  function iEP(tr, t, m, dur, vel) {
    var f = mtof(m), end = t + dur;
    var o1 = osc('sine', f), o2 = osc('sine', f * 4), g2 = gn(0), g = gn(0);
    o2.connect(g2); g2.connect(g); o1.connect(g);
    g2.gain.setValueAtTime(0.28, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(vel * 0.45, t + Math.min(0.5, dur));
    g.gain.setValueAtTime(vel * 0.45, end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.25);
    o1.start(t); o2.start(t); o1.stop(end + 0.3); o2.stop(t + 0.15);
    out(g, tr, 1);
  }

  var SAX = { cut: 1500, att: 0.05, bright: false, breath: true, vib: 0.008 };
  var DARKSAX = { cut: 1050, att: 0.07, bright: false, breath: true, vib: 0.009 };
  var BRASS = { cut: 2700, att: 0.03, bright: true, breath: false, vib: 0.006 };
  function iLead(tr, t, m, dur, vel, P) {
    var f = mtof(m), end = t + dur;
    var o1 = osc('sawtooth', f), o2 = osc(P.bright ? 'square' : 'sawtooth', f);
    o2.detune.value = 7;
    var mix = gn(P.bright ? 0.6 : 0.7), lp = filt('lowpass', P.cut, P.bright ? 1.2 : 2.2), g = gn(0);
    o1.connect(mix); o2.connect(mix); mix.connect(lp); lp.connect(g);
    // little scoop into the pitch
    o1.frequency.setValueAtTime(f * 0.975, t); o1.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o2.frequency.setValueAtTime(f * 0.975, t); o2.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    lp.frequency.setValueAtTime(P.cut * 0.4, t);
    lp.frequency.exponentialRampToValueAtTime(P.cut * 1.25, t + P.att + 0.03);
    lp.frequency.exponentialRampToValueAtTime(P.cut, t + 0.3);
    var lfo = null;
    if (dur > 0.45) {
      lfo = osc('sine', 5.2); var lg = gn(0);
      lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
      lg.gain.setValueAtTime(0, t + 0.2);
      lg.gain.linearRampToValueAtTime(f * P.vib, t + Math.min(0.7, dur));
      lfo.start(t); lfo.stop(end + 0.15);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + P.att);
    g.gain.linearRampToValueAtTime(vel * 0.8, t + Math.max(P.att + 0.01, Math.min(0.25, dur)));
    g.gain.setValueAtTime(vel * 0.8, end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
    o1.start(t); o2.start(t); o1.stop(end + 0.15); o2.stop(end + 0.15);
    out(g, tr, 2);
    if (P.breath) {
      var n = nz(t, 0.15), bp = filt('bandpass', 1900, 1.2), ng = gn(0);
      n.connect(bp); bp.connect(ng);
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(vel * 0.1, t + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      out(ng, tr, 1);
    }
  }

  function iVibe(tr, t, m, vel) {
    var f = mtof(m), len = 1.5;
    var o1 = osc('sine', f), o2 = osc('sine', f * 4), g2 = gn(0);
    var tm = gn(0.75), lfo = osc('sine', 5.5), lg = gn(0.25), g = gn(0);
    o2.connect(g2); g2.connect(g); o1.connect(g); g.connect(tm);
    lfo.connect(lg); lg.connect(tm.gain);
    g2.gain.setValueAtTime(0.18, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o1.start(t); o2.start(t); lfo.start(t);
    o1.stop(t + len + 0.05); o2.stop(t + 0.12); lfo.stop(t + len + 0.05);
    out(tm, tr, 2);
  }

  function iPlink(tr, t, m, vel) {
    var f = mtof(m), o1 = osc('sine', f), o2 = osc('sine', f * 2.76), g2 = gn(0.25), g = gn(0);
    o2.connect(g2); g2.connect(g); o1.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o1.start(t); o2.start(t); o1.stop(t + 1.65); o2.stop(t + 0.6);
    out(g, tr, 2);
  }

  // bright piano for the showdown
  function iPno(tr, t, m, dur, vel) {
    var f = mtof(m), o1 = osc('triangle', f), o2 = osc('square', f), g2 = gn(0.13);
    var lp = filt('lowpass', 4200, 0.7), g = gn(0), len = Math.min(dur + 0.25, 1.2);
    o2.connect(g2); g2.connect(lp); o1.connect(lp); lp.connect(g);
    lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o1.start(t); o2.start(t); o1.stop(t + len + 0.02); o2.stop(t + len + 0.02);
    out(g, tr, 1);
  }

  var VOW = {
    oo: [[310, 7, 1.6], [870, 9, 0.5], [2250, 10, 0.15]],
    oh: [[520, 7, 1.5], [850, 8, 0.7], [2400, 10, 0.2]],
    ah: [[720, 6, 1.5], [1100, 7, 0.9], [2550, 9, 0.35]]
  };
  function iChoir(tr, t, notes, dur, vowel, vol, att, rel) {
    att = att || 0.5; rel = rel || 0.8;
    var end = t + dur, mix = gn(1 / notes.length), env = gn(0);
    var lfo = osc('sine', 4.7), lg = gn(11);
    lfo.connect(lg);
    notes.forEach(function (m) {
      [-9, 9].forEach(function (dt) {
        var o = osc('sawtooth', mtof(m));
        o.detune.value = dt + rnd(-3, 3);
        lg.connect(o.detune);
        o.connect(mix);
        o.start(t); o.stop(end + rel + 0.05);
      });
    });
    (VOW[vowel] || VOW.ah).forEach(function (fm) {
      var bp = filt('bandpass', fm[0], fm[1]), bg = gn(fm[2] * 3);
      mix.connect(bp); bp.connect(bg); bg.connect(env);
    });
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + att);
    env.gain.setValueAtTime(vol, end);
    env.gain.exponentialRampToValueAtTime(0.0001, end + rel);
    lfo.start(t); lfo.stop(end + rel + 0.05);
    out(env, tr, 2);
  }

  function iStrings(tr, t, notes, dur, vol, att, cut, rel) {
    rel = rel == null ? 0.5 : rel;
    var end = t + dur, mix = gn(0.5 / notes.length), lp = filt('lowpass', cut || 2200, 0.6), env = gn(0);
    var lfo = osc('sine', 5.6), lg = gn(6);
    lfo.connect(lg);
    notes.forEach(function (m) {
      [-10, 10].forEach(function (dt) {
        var o = osc('sawtooth', mtof(m));
        o.detune.value = dt + rnd(-2, 2);
        lg.connect(o.detune);
        o.connect(mix);
        o.start(t); o.stop(end + rel + 0.05);
      });
    });
    mix.connect(lp); lp.connect(env);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + att);
    env.gain.setValueAtTime(vol, Math.max(end, t + att));
    env.gain.exponentialRampToValueAtTime(0.0001, Math.max(end, t + att) + rel);
    lfo.start(t); lfo.stop(end + rel + 0.05);
    out(env, tr, 2);
  }

  /* drums */
  function nHit(tr, t, len, vol, ftype, f, q, wet, att) {
    var n = nz(t, len), fl = filt(ftype, f, q), g = gn(0);
    n.connect(fl); fl.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (att || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    out(g, tr, wet);
    return fl;
  }
  function dBrush(tr, t, len, vol) { nHit(tr, t, len, vol, 'bandpass', 3800, 0.6, 1, len * 0.35); }
  function dRide(tr, t, vol) {
    nHit(tr, t, 0.5, vol, 'highpass', 6800, 0.5, 1);
    var o = osc('square', 5150), g = gn(0), hp = filt('highpass', 4000);
    o.connect(hp); hp.connect(g);
    g.gain.setValueAtTime(vol * 0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.start(t); o.stop(t + 0.36);
    out(g, tr, 1);
  }
  function dHat(tr, t, vol, len) { nHit(tr, t, len || 0.05, vol, 'highpass', 8000, 0.7, 0); }
  function dKick(tr, t, vol, f0) {
    var o = osc('sine', f0 || 110), g = gn(0);
    o.frequency.setValueAtTime(f0 || 110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.start(t); o.stop(t + 0.4);
    out(g, tr, 0);
  }
  function dSnare(tr, t, vol) {
    nHit(tr, t, 0.2, vol, 'bandpass', 2100, 0.7, 1);
    var o = osc('triangle', 210), g = gn(0);
    o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    o.connect(g);
    g.gain.setValueAtTime(vol * 0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.start(t); o.stop(t + 0.12);
    out(g, tr, 1);
  }
  function dRim(tr, t, vol) {
    var o = osc('triangle', 1650), g = gn(0);
    o.connect(g);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.start(t); o.stop(t + 0.05);
    out(g, tr, 1);
    nHit(tr, t, 0.035, vol * 0.6, 'bandpass', 3000, 1.5, 1);
  }
  function dCrash(tr, t, vol) { nHit(tr, t, 1.9, vol, 'highpass', 4500, 0.5, 1); }
  function dTom(tr, t, f, vol) {
    var o = osc('sine', f * 1.4), g = gn(0);
    o.frequency.setValueAtTime(f * 1.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    o.connect(g);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.start(t); o.stop(t + 0.36);
    out(g, tr, 1);
  }
  function dRiser(tr, t, dur, vol) {
    var n = nz(t, dur), bp = filt('bandpass', 400, 2.5), g = gn(0);
    n.connect(bp); bp.connect(g);
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    out(g, tr, 2);
  }

  /* ------------------------------------------------------------ bass walking */
  function nearNote(pc, ref, lo, hi) {
    var best = null;
    for (var m = lo; m <= hi; m++) {
      if ((m % 12 + 12) % 12 === pc && (best === null || Math.abs(m - ref) < Math.abs(best - ref))) best = m;
    }
    return best;
  }
  function fitB(m) { while (m > 52) m -= 12; while (m < 31) m += 12; return m; }
  function walkBass(tr, chs, nextPc, bi) {
    var c = chs[0], r = nearNote(c.bass, tr.lastBass + (bi % 2 ? 3 : -2), 31, 50), w;
    if (chs.length === 1) {
      var v = bi % 3;
      if (v === 0) w = [r, r + third(c), r + fifth(c), 0];
      else if (v === 1) w = [r, r + 2, r + third(c), 0];
      else w = [r, r + fifth(c), r + seventh(c), 0];
    } else {
      var c2 = chs[1];
      w = [r, r + (bi % 2 ? fifth(c) : third(c)), nearNote(c2.bass, r + third(c), 31, 50), 0];
    }
    var n = nearNote(nextPc, w[2], 31, 50);
    w[3] = n === w[2] ? n + 7 : (w[2] > n ? n + 1 : n - 1);
    w = w.map(fitB);
    tr.lastBass = w[3];
    return w;
  }

  /* ------------------------------------------------------------ track definitions */
  function mk(o) {
    o.bars = o.ch.map(function (b) { return { ch: b.split(' ').map(parseChord) }; });
    o.mel = (o.mel || []).map(parseMel);
    while (o.mel.length < o.bars.length) o.mel.push([]);
    o.barDur = 240 / o.bpm;
    return o;
  }

  var DEFS = {};
  DEFS.jazz_lobby = mk({
    id: 'jazz_lobby', name: 'Lobby Lounge', style: 'jazz', render: renderJazz,
    bpm: 100, swing: 0.63, seed: 0, lead: 'sax', vlo: 52,
    ch: ['Fmaj9', 'Dm9', 'Gm9', 'C13', 'Am7 D7b9', 'Gm7 C9', 'Fmaj7 Bb9', 'Am7 D7b9',
      'Gm9', 'C13', 'Am7', 'D7b9', 'Gm7', 'C7b9', 'F69 D7b9', 'Gm7 C13'],
    mel: [
      '0.5:C5:0.5 1:E5:0.5 1.5:G5:1.5 3.5:F5:0.5',
      '0:E5:1 1:D5:0.5 1.5:C5:1 3:A4:1',
      '0.5:Bb4:0.5 1:D5:0.5 1.5:F5:0.5 2:A5:1.5',
      '0:G5:0.5 0.5:F5:0.5 1:E5:2 3.5:D5:0.5',
      '0:C5:1 1:E5:0.5 1.5:G5:0.5 2:F#5:1 3:Eb5:1',
      '0:D5:1.5 1.5:Bb4:0.5 2:E5:1 3:D5:0.5 3.5:C5:0.5',
      '0:A4:2 2.5:Ab4:0.5 3:C5:1',
      '0:G4:0.5 0.5:A4:0.5 1:C5:0.5 1.5:E5:1 3:F#5:0.5 3.5:A5:0.5',
      '0:A5:1.5 1.5:G5:0.5 2:F5:0.5 2.5:D5:1.5',
      '0.5:E5:0.5 1:G5:0.5 1.5:Bb5:1 2.5:A5:1.5',
      '0:G5:1 1:E5:0.5 1.5:C5:1.5 3.5:B4:0.5',
      '0:C5:0.5 0.5:A4:0.5 1:F#4:1 2:Eb5:1 3:D5:1',
      '0.5:Bb4:0.5 1:D5:0.5 1.5:F5:0.5 2:Bb5:1 3:A5:0.5 3.5:G5:0.5',
      '0:E5:1.5 1.5:Db5:0.5 2:Bb4:1 3:G4:1',
      '0:A4:1.5 1.5:G4:0.5 2:F#4:1 3:A4:1',
      '0:Bb4:0.5 0.5:A4:0.5 1:G4:1 2:E4:1'
    ]
  });
  DEFS.jazz_workshop = mk({
    id: 'jazz_workshop', name: 'Workshop Groove', style: 'jazz', render: renderJazz,
    bpm: 116, swing: 0.6, seed: 2, lead: 'sax', vlo: 53,
    ch: ['Bbmaj7 G7b9', 'Cm7 F7', 'Dm7 G7', 'Cm7 F7', 'Fm7 Bb7', 'Ebmaj7 Ab9', 'Dm7 G7b9', 'Cm7 F13',
      'Bbmaj7 G7b9', 'Cm7 F7', 'Dm7 Db7', 'Cm7 F7', 'Fm7 Bb7', 'Ebmaj7 Edim7', 'Dm7 G7', 'Cm7 F7'],
    mel: [
      '0:D5:0.5 0.5:F5:0.5 1:G5:0.5 1.5:F5:1 2.5:D5:0.5 3:B4:1',
      '0:C5:0.5 0.5:Eb5:0.5 1:G5:1 2:F5:0.5 2.5:Eb5:0.5 3:A4:1',
      '0:F5:0.5 0.5:A5:0.5 1:C6:0.5 1.5:A5:1 2.5:F5:0.5 3:B4:1',
      '0:Bb4:1.5 1.5:C5:0.5 2:Eb5:0.5 2.5:D5:0.5 3:C5:1',
      '0:Ab4:0.5 0.5:C5:0.5 1:Eb5:0.5 1.5:F5:1 2.5:D5:0.5 3:Ab5:1',
      '0:G5:1.5 1.5:Eb5:0.5 2:C5:1 3:Gb5:1',
      '0:F5:1 1:D5:0.5 1.5:C5:0.5 2:B4:0.5 2.5:D5:0.5 3:F5:0.5 3.5:Ab5:0.5',
      '0:G5:2 2.5:F5:0.5 3:Eb5:1',
      '0:D5:0.5 0.5:F5:0.5 1:G5:0.5 1.5:Bb5:1 2.5:G5:0.5 3:Ab5:1',
      '0:G5:0.5 0.5:Eb5:0.5 1:C5:1 2:A4:0.5 2.5:C5:0.5 3:Eb5:1',
      '0:F5:1 1:C5:0.5 1.5:D5:0.5 2:F5:0.5 2.5:Ab5:0.5 3:B4:1',
      '0:Bb4:0.5 0.5:C5:0.5 1:Eb5:1 2:A4:1.5',
      '0:C5:0.5 0.5:Eb5:0.5 1:F5:0.5 1.5:Ab5:1 2.5:F5:0.5 3:D5:1',
      '0:Eb5:1.5 1.5:G5:0.5 2:E5:1 3:Db5:1',
      '0:D5:1 1:C5:0.5 1.5:A4:0.5 2:B4:1 3:D5:0.5 3.5:F5:0.5',
      '0:Eb5:2 2:C5:0.5 2.5:A4:0.5 3:F4:1'
    ]
  });
  DEFS.jazz_custom = mk({
    id: 'jazz_custom', name: 'Dressing Room Swing', style: 'jazz', render: renderJazz,
    bpm: 108, swing: 0.65, seed: 4, lead: 'saxvibe', vlo: 52,
    ch: ['G13', 'C9', 'G13', 'Dm7 G7b9', 'C9', 'C#dim7', 'G13 E7b9', 'Am7 D7',
      'Bm7 E7b9', 'Am7 D7b9', 'G6 E7b9', 'Am7 D7b9'],
    mel: [
      '0.5:D5:0.5 1:F5:0.5 1.5:F#5:0.5 2:G5:1 3:D5:1',
      '0:E5:0.5 0.5:Eb5:0.5 1:D5:0.5 1.5:Bb4:1.5 3:G4:1',
      '0.5:D5:0.5 1:F5:0.5 1.5:F#5:0.5 2:A5:1 3:G5:0.5 3.5:E5:0.5',
      '0:F5:1 1:D5:0.5 1.5:B4:0.5 2:Ab4:1 3:F4:1',
      '0.5:E5:0.5 1:G5:0.5 1.5:Bb5:1 2.5:A5:0.5 3:G5:1',
      '0:E5:1.5 1.5:C#5:0.5 2:Bb4:1 3:G4:1',
      '0:D5:0.5 0.5:B4:0.5 1:G4:1 2:G#4:0.5 2.5:B4:0.5 3:D5:0.5 3.5:F5:0.5',
      '0:E5:1.5 1.5:C5:0.5 2:F#5:1 3:A5:1',
      '0:D5:0.5 0.5:F#5:0.5 1:A5:1 2:G#5:1 3:F5:1',
      '0:E5:0.5 0.5:C5:0.5 1:A4:1 2:F#4:0.5 2.5:A4:0.5 3:Eb5:1',
      '0:D5:1.5 1.5:B4:0.5 2:G#4:1 3:B4:1',
      '0:C5:1 1:A4:0.5 1.5:E4:0.5 2:F#4:1'
    ]
  });
  DEFS.treachery = mk({
    id: 'treachery', name: 'Treachery Jazz', style: 'treachery', render: renderTreachery,
    bpm: 80, swing: 0.66,
    ch: ['CmM9', 'CmM9', 'Abmaj7#11', 'G7b9', 'FmM7', 'Dm7b5 G7b9', 'CmM7', 'Ebdim7',
      'CmM9', 'CmM9', 'Abmaj7#11', 'G7b9', 'FmM7', 'Dm7b5 G7b9', 'CmM7', 'Ebdim7'],
    mel: [
      '0.5:G4:0.5 1:Ab4:0.5 1.5:G4:1.5',
      '0.5:B4:0.5 1:C5:0.5 1.5:Eb5:0.5 2:D5:2',
      '0.5:C5:0.5 1:Eb5:0.5 1.5:G5:1 2.5:D5:1.5',
      '0:Ab5:1 1:F5:0.5 1.5:D5:0.5 2:B4:1.5',
      '0.5:C5:0.5 1:Ab4:0.5 1.5:E5:1.5 3:Eb5:1',
      '0:D5:0.5 0.5:F5:0.5 1:Ab5:1 2:G5:0.5 2.5:F5:0.5 3:B4:1',
      '0:C5:3',
      '0.5:Gb4:0.5 1:A4:0.5 1.5:C5:0.5 2:Eb5:0.5 2.5:D5:1.5',
      '',
      '0.5:G5:0.5 1:F#5:0.5 1.5:G5:0.5 2:Eb5:2',
      '0:D5:1 1:C5:0.5 1.5:G4:2.5',
      '0:Ab4:0.5 0.5:B4:0.5 1:D5:0.5 1.5:F5:0.5 2:Ab5:1.5',
      '0:G5:1 1:E5:1.5 2.5:C5:0.5 3:Ab4:1',
      '0:F4:0.5 0.5:Ab4:0.5 1:C5:0.5 1.5:D5:0.5 2:Db5:1 3:B4:1',
      '0:C5:1.5 1.5:B4:0.5 2:C5:2',
      ''
    ]
  });
  DEFS.showdown = mk({
    id: 'showdown', name: 'Golden Showdown', style: 'showdown', render: renderShowdown,
    bpm: 150, swing: 0.5,
    ch: ['Bm', 'G', 'Em7', 'Asus4 A', 'D', 'A/C#', 'Bm', 'G A',
      'G', 'A', 'F#m', 'Bm', 'G', 'A', 'D', 'G A'],
    mel: [
      '', '', '', '',
      '0:F#5:1.5 1.5:A5:0.5 2:D6:2',
      '0:C#6:1 1:B5:0.5 1.5:A5:0.5 2:E5:2',
      '0:F#5:1.5 1.5:G5:0.5 2:A5:1 3:B5:1',
      '0:D6:1.5 1.5:B5:0.5 2:C#6:2',
      '0:B5:1 1:A5:0.5 1.5:G5:0.5 2:D5:1.5 3.5:G5:0.5',
      '0:A5:1 1:B5:0.5 1.5:C#6:0.5 2:E6:2',
      '0:C#6:1.5 1.5:B5:0.5 2:A5:1 3:F#5:1',
      '0:F#5:0.5 0.5:A5:0.5 1:B5:1 2:D6:1 3:F#6:1',
      '0:D6:2 2:B5:1 3:D6:1',
      '0:E6:2 2:C#6:1 3:E6:1',
      '0:F#6:3 3:E6:0.5 3.5:D6:0.5',
      '0:D6:1 1:B5:1 2:C#6:2'
    ]
  });

  /* ------------------------------------------------------------ renderers */
  var COMP1 = [
    [[0, 1.4], [2.5, 0.45]],
    [[1.5, 0.45], [3, 0.9]],
    [[0.5, 1.0], [2.5, 0.45], [3.5, 0.4]],
    [[0, 0.45], [1.5, 1.8]],
    [[2, 1.2], [3.5, 0.4]],
    [[0, 0.9], [1.5, 0.45], [3, 0.8]]
  ];
  var COMP2 = [
    [[0, 0.9, 0], [2, 0.9, 1], [3.5, 0.4, 1]],
    [[0.5, 0.9, 0], [1.5, 0.45, 0], [2.5, 1.2, 1]],
    [[0, 1.4, 0], [2.5, 1.0, 1]],
    [[1.5, 0.45, 0], [2, 1.4, 1]]
  ];

  function renderJazz(tr, bi, t0) {
    var d = tr.def, spb = 60 / d.bpm, bar = d.bars[bi], nb = d.bars[(bi + 1) % d.bars.length];
    function T(p) { return t0 + swingT(p, d.swing) * spb; }
    // walking bass
    var w = walkBass(tr, bar.ch, nb.ch[0].bass, bi);
    for (var i = 0; i < 4; i++) {
      var short = (bi % 4 === 3 && i === 2);
      iBass(tr, T(i) + hm(), w[i], spb * (short ? 0.55 : 0.92), i === 0 ? 0.42 : 0.36, 850);
    }
    if (bi % 4 === 3) iBass(tr, T(2.5), w[2], spb * 0.3, 0.2, 700);
    // piano comping
    var pats = bar.ch.length > 1 ? COMP2 : COMP1;
    var pat = pats[(bi * 5 + d.seed) % pats.length];
    pat.forEach(function (h) {
      var v = voicing(bar.ch[h[2] || 0], d.vlo), vel = rnd(0.06, 0.08), t = T(h[0]) + hm();
      var dur = T(h[0] + h[1]) - T(h[0]);
      v.forEach(function (m, k) { iEP(tr, t + k * 0.006, m, dur, vel * (k === v.length - 1 ? 1.1 : 1)); });
    });
    // melody
    d.mel[bi].forEach(function (n) {
      var t = T(n[0]) + hm(), dur = (T(n[0] + n[2]) - T(n[0])) * 0.94;
      var vel = n[2] >= 1 ? 0.17 : 0.15;
      if (d.lead === 'sax' || d.lead === 'saxvibe') iLead(tr, t, n[1], dur, vel, SAX);
      if (d.lead === 'saxvibe') iVibe(tr, t, n[1] + 12, 0.05);
    });
    // brushed kit
    for (var b = 0; b < 4; b++) {
      dBrush(tr, T(b), spb * 0.9, 0.045);
      dRide(tr, T(b), b % 2 ? 0.04 : 0.03);
    }
    dRide(tr, T(1.5), 0.02); dRide(tr, T(3.5), 0.02);
    dHat(tr, T(1), 0.035); dHat(tr, T(3), 0.035);
    dKick(tr, T(0), 0.2);
    if (bi % 4 === 3) dKick(tr, T(2.5), 0.13);
    if (bi % 8 === 7) { dBrush(tr, T(3.5), spb * 0.4, 0.06); dRim(tr, T(3.5), 0.03); }
  }

  function renderTreachery(tr, bi, t0) {
    var d = tr.def, spb = 60 / d.bpm, bar = d.bars[bi], nb = d.bars[(bi + 1) % d.bars.length];
    function T(p) { return t0 + swingT(p, d.swing) * spb; }
    var chs = bar.ch, two = chs.length > 1, half = two ? 2 : 4;
    // plucked bass: tiptoe pattern
    var c0 = chs[0], r = nearNote(c0.bass, 36, 31, 43);
    var nextR = nearNote(nb.ch[0].bass, r, 31, 45);
    var appr = nextR === r ? r - 1 : (nextR > r ? nextR - 1 : nextR + 1);
    if (two) {
      var r2 = nearNote(chs[1].bass, r, 31, 45);
      iBass(tr, T(0), r, spb * 1.1, 0.42, 650);
      iBass(tr, T(1.5), r, spb * 0.35, 0.25, 650);
      iBass(tr, T(2), r2, spb * 1.1, 0.4, 650);
      iBass(tr, T(3.5), appr, spb * 0.35, 0.28, 650);
    } else {
      iBass(tr, T(0), r, spb * 1.2, 0.42, 650);
      iBass(tr, T(1.5), r, spb * 0.35, 0.25, 650);
      iBass(tr, T(2), r + fifth(c0), spb * 1.0, 0.36, 650);
      iBass(tr, T(3.5), appr, spb * 0.35, 0.28, 650);
    }
    // eerie choir pad
    var vowel = bi < 8 ? 'oo' : 'ah';
    chs.forEach(function (c, k) {
      var v = voicing(c, 55).slice(0, 4);
      iChoir(tr, t0 + k * half * spb, v, half * spb, vowel, bi < 8 ? 0.11 : 0.13, 0.6, 0.9);
    });
    // sparse dark piano
    chs.forEach(function (c, k) {
      var v = voicing(c, 50), t = T(k * half + (bi % 2 ? 0.5 : 0));
      v.forEach(function (m, j) { iEP(tr, t + j * 0.01, m, spb * 1.5, 0.055); });
    });
    // melody (dark sax)
    d.mel[bi].forEach(function (n) {
      var t = T(n[0]) + hm(), dur = (T(n[0] + n[2]) - T(n[0])) * 0.92;
      iLead(tr, t, n[1], dur, 0.15, DARKSAX);
    });
    // creepy music-box plinks in the second half
    if (bi >= 8) {
      var v2 = voicing(chs[0], 76);
      iPlink(tr, T(1.5), v2[bi % v2.length], 0.05);
      iPlink(tr, T(3), v2[(bi + 2) % v2.length], 0.04);
    }
    // dramatic stabs
    function stab(t, c, vol) {
      var v = voicing(c, 48);
      iStrings(tr, t, v.concat([v[0] + 12]), 0.22, vol, 0.006, 1700, 0.35);
      v.forEach(function (m) { iEP(tr, t, m, 0.5, 0.1); });
      iBass(tr, t, nearNote(c.bass, 33, 28, 40), 0.6, 0.45, 600);
      dKick(tr, t, 0.32, 90);
    }
    if (bi % 4 === 3) stab(T(3.5), chs[chs.length - 1], 0.16);
    if (bi === 15) { stab(T(0), chs[0], 0.18); stab(T(2.5), chs[0], 0.2); dCrash(tr, T(0), 0.05); }
    // slow swung brushes
    for (var b = 0; b < 4; b++) {
      dBrush(tr, T(b), spb * 0.85, 0.035);
      dRide(tr, T(b), 0.022);
    }
    dRide(tr, T(1.5), 0.014); dRide(tr, T(3.5), 0.014);
    dRim(tr, T(3), 0.035);
    dHat(tr, T(1), 0.03);
    dKick(tr, T(0), 0.18);
    if (bi % 2) dKick(tr, T(2.5), 0.12);
  }

  function renderShowdown(tr, bi, t0) {
    var d = tr.def, spb = 60 / d.bpm, s16 = spb / 4, bar = d.bars[bi];
    var chs = bar.ch, two = chs.length > 1;
    var build = bi < 4, peak = bi >= 12;
    function chAt(step) { return two && step >= 8 ? chs[1] : chs[0]; }
    // piano arpeggios (16ths; 8ths at the very start of the build)
    var P = [0, 1, 2, 3, 4, 5, 4, 3, 1, 2, 3, 4, 5, 4, 3, 2];
    var pvel = build ? 0.045 + bi * 0.012 : peak ? 0.09 : 0.08;
    for (var s = 0; s < 16; s++) {
      if (bi === 0 && s % 2) continue;
      var c = chAt(s), b = c.root + 60;
      while (b > 66) b -= 12;
      while (b < 57) b += 12;
      var tones = [b, b + third(c), b + fifth(c), b + 12, b + 12 + third(c), b + 12 + fifth(c)];
      iPno(tr, t0 + s * s16, tones[P[s]], s16 * 1.5, pvel * (s % 4 === 0 ? 1.25 : 1));
    }
    if (peak) { // octave hammering on the beats
      for (var q = 0; q < 4; q++) {
        var cq = chAt(q * 4), rq = nearNote(cq.root, 74, 70, 82);
        iPno(tr, t0 + q * spb, rq, spb, 0.07); iPno(tr, t0 + q * spb, rq - 12, spb, 0.06);
      }
    }
    // strings
    chs.forEach(function (c, k) {
      var len = (two ? 2 : 4) * spb, t = t0 + k * len;
      var cut = build ? 1000 + bi * 450 : peak ? 3200 : 2400;
      var vol = build ? 0.05 + bi * 0.012 : 0.09;
      iStrings(tr, t, triad(c, 54), len, vol, build ? len * 0.8 : 0.08, cut, 0.3);
    });
    // driving bass
    for (var e = 0; e < 8; e++) {
      var cb = chAt(e * 2), rb = nearNote(cb.bass, 40, 35, 46);
      if (bi < 2) { if (e % 4 === 0) iBass(tr, t0 + e * 2 * s16, rb, spb * 1.9, 0.38, 1100); continue; }
      var oct = peak && e % 2 === 1 ? 12 : 0;
      iBass(tr, t0 + e * 2 * s16, rb + oct, spb * 0.42, bi < 4 ? 0.26 : 0.34, 1400);
    }
    // lead melody: brass + octave-below double
    d.mel[bi].forEach(function (n) {
      var t = t0 + n[0] * spb, dur = n[2] * spb * 0.95;
      iLead(tr, t, n[1], dur, 0.13, BRASS);
      iLead(tr, t, n[1] - 12, dur, 0.06, BRASS);
    });
    // triumphant choir at the peak
    if (peak) chs.forEach(function (c, k) {
      var len = (two ? 2 : 4) * spb;
      iChoir(tr, t0 + k * len, triad(c, 62).slice(0, 3), len, 'ah', 0.15, 0.15, 0.4);
    });
    // drums
    if (bi === 4 || bi === 8 || bi === 12) { dCrash(tr, t0, 0.09); dKick(tr, t0, 0.5); }
    if (bi < 2) {
      dKick(tr, t0, 0.35);
      if (bi === 1) dTom(tr, t0 + 3 * spb, 110, 0.25);
    } else if (bi < 4) {
      for (var k2 = 0; k2 < 4; k2++) dKick(tr, t0 + k2 * spb, 0.32);
      if (bi === 3) {
        for (var sr = 0; sr < 16; sr++) {
          if (sr < 8 && sr % 2) continue;
          dSnare(tr, t0 + sr * s16, 0.05 + 0.2 * sr / 15);
        }
        dRiser(tr, t0, spb * 4, 0.12);
      } else for (var h = 0; h < 8; h++) dHat(tr, t0 + h * 2 * s16, 0.03);
    } else {
      var four = peak;
      for (var k3 = 0; k3 < 4; k3++) {
        if (four || k3 % 2 === 0) dKick(tr, t0 + k3 * spb, 0.45);
        if (k3 % 2 === 1) dSnare(tr, t0 + k3 * spb, 0.26);
      }
      if (!four && bi % 2) dKick(tr, t0 + 2.5 * spb, 0.35);
      for (var h2 = 0; h2 < 8; h2++) {
        var open = h2 % 2 === 1 && peak;
        dHat(tr, t0 + h2 * 2 * s16, h2 % 2 ? 0.045 : 0.03, open ? 0.18 : 0.05);
      }
      if (bi === 15) { // tom fill back into the build
        for (var tf = 8; tf < 16; tf++) dTom(tr, t0 + tf * s16, 200 - (tf - 8) * 14, 0.25);
      }
    }
  }

  /* ------------------------------------------------------------ sources & crossfade */
  var sources = [];
  var activeKey = null;
  var mp3ok = {}, mp3 = {};

  function SynthSrc(def) {
    this.def = def; this.key = 'syn:' + def.id;
    this.dry = gn(0); this.wet = gn(0);
    this.lo = gn(0.16); this.hi = gn(0.42);
    this.lo.connect(this.wet); this.hi.connect(this.wet);
    this.dry.connect(musicGain); this.wet.connect(musicRev);
    this.next = ctx.currentTime + 0.08; this.bar = 0; this.lastBass = 41;
    this.dying = 0;
  }
  SynthSrc.prototype.fade = function (to, dur) {
    var now = ctx.currentTime;
    [this.dry.gain, this.wet.gain].forEach(function (p) {
      var v = p.value;
      p.cancelScheduledValues(now);
      p.setValueAtTime(v, now);
      p.linearRampToValueAtTime(to, now + dur);
    });
  };
  SynthSrc.prototype.fadeIn = function () { this.fade(1, FADE); };
  SynthSrc.prototype.fadeOut = function () {
    if (this.dying) return;
    this.fade(0, FADE);
    this.dying = ctx.currentTime + FADE + 0.05;
  };
  SynthSrc.prototype.tick = function (now) {
    if (this.dying) {
      if (now > this.dying) {
        var self = this;
        setTimeout(function () { try { self.dry.disconnect(); self.wet.disconnect(); } catch (e) { } }, 3000);
        return false;
      }
    }
    var n = this.def.bars.length, guard = 0;
    while (this.next < now + LOOK && guard++ < 4) {
      if (this.next < now - 0.1) this.next = now + 0.05;   // fell behind (tab throttled)
      try { this.def.render(this, this.bar, this.next); } catch (e) { if (W.console) console.warn('Snd render', e); }
      this.next += this.def.barDur;
      this.bar = (this.bar + 1) % n;
    }
    return true;
  };

  function getMp3(style) {
    if (mp3[style]) return mp3[style];
    var el = new Audio('music/' + style + '.mp3');
    el.loop = true; el.preload = 'auto';
    try { el.crossOrigin = 'anonymous'; } catch (e) { }
    var g = gn(0), node = null;
    try { node = ctx.createMediaElementSource(el); node.connect(g); } catch (e) { node = null; }
    g.connect(musicGain);
    return (mp3[style] = { el: el, gain: g, node: node, token: 0, pending: false, want: false });
  }
  function Mp3Src(style) { this.m = getMp3(style); this.key = 'mp3:' + style; this.dying = 0; }
  Mp3Src.prototype.fadeIn = function () {
    var m = this.m, now = ctx.currentTime, p = m.gain.gain, v = p.value;
    m.token++; m.want = true;
    p.cancelScheduledValues(now); p.setValueAtTime(v, now); p.linearRampToValueAtTime(m.node ? 0.85 : 0, now + FADE);
    if (!m.node) { m.el.volume = musicVol; }
    tryPlay(m);
  };
  Mp3Src.prototype.fadeOut = function () {
    if (this.dying) return;
    var m = this.m, now = ctx.currentTime, p = m.gain.gain, v = p.value, tok = ++m.token;
    p.cancelScheduledValues(now); p.setValueAtTime(v, now); p.linearRampToValueAtTime(0, now + FADE);
    m.want = false;
    this.dying = now + FADE + 0.05;
    setTimeout(function () { if (m.token === tok) { try { m.el.pause(); } catch (e) { } } }, FADE * 1000 + 150);
  };
  Mp3Src.prototype.tick = function (now) { return !(this.dying && now > this.dying); };
  function tryPlay(m) {
    try {
      var pr = m.el.play();
      m.pending = false;
      if (pr && pr.catch) pr.catch(function () { m.pending = true; });
    } catch (e) { m.pending = true; }
  }

  function startCurrent() {
    if (!ctx) return;
    var id = Snd.current, def = id ? DEFS[id] : null;
    var key = def ? (mp3ok[def.style] ? 'mp3:' + def.style : 'syn:' + id) : null;
    if (key === activeKey) return;
    sources.forEach(function (s) { s.fadeOut(); });
    activeKey = key;
    if (!key) return;
    var s;
    try {
      s = mp3ok[def.style] ? new Mp3Src(def.style) : new SynthSrc(def);
    } catch (e) { return; }
    s.fadeIn();
    sources.push(s);
  }

  function tick() {
    if (!ctx || ctx.state === 'suspended' || ctx.state === 'closed') return;
    var now = ctx.currentTime;
    sources = sources.filter(function (s) { return s.tick(now); });
  }

  function checkMp3s() {
    if (mp3Checked) return;
    mp3Checked = true;
    if (typeof fetch !== 'function') return;
    ['jazz', 'treachery', 'showdown'].forEach(function (style) {
      try {
        fetch('music/' + style + '.mp3', { method: 'HEAD', cache: 'no-store' }).then(function (r) {
          var ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
          if (r.ok && ct.indexOf('text/html') < 0) {
            mp3ok[style] = true;
            var def = Snd.current && DEFS[Snd.current];
            if (def && def.style === style) startCurrent();
          }
        }).catch(function () { });
      } catch (e) { }
    });
  }

  /* ------------------------------------------------------------ SFX */
  function sT(type, f0, f1, t, dur, vol, att, wet) {
    var o = osc(type, f0), g = gn(0);
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (att || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxGain);
    if (wet) g.connect(sfxRev);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  function sN(t, dur, vol, ftype, f0, f1, q, att, wet) {
    var n = nz(t, dur), fl = filt(ftype, f0, q == null ? 0.8 : q), g = gn(0);
    fl.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    n.connect(fl); fl.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (att || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(sfxGain);
    if (wet) g.connect(sfxRev);
  }
  function seq(notes, t, type, vol, gap, len, wet) {
    notes.forEach(function (n, i) { sT(type, mtof(nm(n)), 0, t + i * gap, len, vol, 0.004, wet); });
  }

  var lastStep = 0, lastBlip = 0;
  var SFX = {
    step: function (t) {
      if (t - lastStep < 0.07) return; lastStep = t;
      sT('triangle', rnd(200, 240), 130, t, 0.035, 0.07);
    },
    blip: function (t) {
      if (t - lastBlip < 0.045) return; lastBlip = t;
      sT('square', rnd(780, 860), 0, t, 0.028, 0.03);
    },
    click: function (t) { sT('square', 1000, 0, t, 0.03, 0.06); },
    select: function (t) {
      sT('square', 784, 0, t, 0.06, 0.07);
      sT('square', 1175, 0, t + 0.06, 0.1, 0.07);
    },
    back: function (t) {
      sT('square', 700, 0, t, 0.05, 0.06);
      sT('square', 466, 0, t + 0.05, 0.08, 0.06);
    },
    task: function (t) {
      seq(['C6', 'E6', 'G6'], t, 'square', 0.06, 0.07, 0.1);
      sT('square', mtof(84), 0, t + 0.21, 0.4, 0.07, 0.004, true);
      seq(['C5', 'E5', 'G5', 'C6'], t, 'triangle', 0.1, 0.07, 0.35);
      for (var i = 0; i < 3; i++) sT('triangle', rnd(2500, 3800), 0, t + 0.3 + i * 0.06, 0.08, 0.03);
    },
    hex: function (t) {
      sT('sawtooth', 1800, 90, t, 0.28, 0.1);
      sN(t, 0.15, 0.1, 'highpass', 3000);
      var b = t + 0.22, o = osc('triangle', 160), g = gn(0), lfo = osc('sine', 22), lg = gn(40);
      o.frequency.setValueAtTime(160, b);
      o.frequency.exponentialRampToValueAtTime(480, b + 0.1);
      o.frequency.exponentialRampToValueAtTime(140, b + 0.5);
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(sfxGain);
      g.gain.setValueAtTime(0.0001, b); g.gain.linearRampToValueAtTime(0.22, b + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, b + 0.55);
      o.start(b); lfo.start(b); o.stop(b + 0.56); lfo.stop(b + 0.56);
    },
    thunder: function (t) { // lightning CRASH: a sharp crack, then a rolling rumble
      sN(t, 0.09, 0.32, 'highpass', 2200, 0, 0.7, 0.001);
      sN(t + 0.01, 0.25, 0.28, 'bandpass', 1400, 300, 0.9, 0.002, 1);
      sT('square', 120, 45, t, 0.18, 0.12);
      sN(t + 0.06, 1.6, 0.34, 'lowpass', 600, 70, 1.2, 0.05, 2);
      sN(t + 0.35, 1.2, 0.2, 'lowpass', 300, 60, 1.5, 0.15, 2);
    },
    puff: function (t) {
      sN(t, 0.45, 0.22, 'lowpass', 2500, 250, 0.7, 0.02);
      sN(t + 0.04, 0.3, 0.08, 'bandpass', 900, 300, 1);
    },
    plant: function (t) {
      for (var i = 0; i < 4; i++) sT('triangle', rnd(2200, 3600), 0, t + i * 0.05, 0.09, 0.025, 0.003, true);
    },
    alarm: function (t) {
      var o = osc('square', 880), o2 = osc('sawtooth', 440), lp = filt('lowpass', 2800, 0.7), g = gn(0);
      for (var i = 0; i < 6; i++) {
        var tt = t + i * 0.25, f = i % 2 ? 620 : 880;
        o.frequency.setValueAtTime(f, tt); o.frequency.linearRampToValueAtTime(f * 1.06, tt + 0.24);
        o2.frequency.setValueAtTime(f / 2, tt); o2.frequency.linearRampToValueAtTime(f * 0.53, tt + 0.24);
      }
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfxGain);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08, t + 0.02);
      g.gain.setValueAtTime(0.08, t + 1.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      o.start(t); o2.start(t); o.stop(t + 1.52); o2.stop(t + 1.52);
    },
    bell: function (t) {
      var parts = [[1, 0.2, 2.6], [2, 0.1, 1.8], [2.4, 0.07, 1.4], [3, 0.05, 1.1], [4.5, 0.035, 0.7], [5.4, 0.025, 0.5]];
      [0, 0.55].forEach(function (off) {
        parts.forEach(function (p) { sT('sine', 660 * p[0], 0, t + off, p[2], p[1], 0.002, true); });
      });
    },
    eject: function (t) {
      sN(t, 0.6, 0.18, 'bandpass', 300, 3000, 1.5, 0.4);
      var b = t + 0.55;
      sT('sine', 110, 30, b, 0.9, 0.5, 0.003, true);
      sN(b, 0.7, 0.3, 'lowpass', 1400, 90, 0.7, 0.003, true);
    },
    fanfare: function (t) {
      var L = [['G4', 0, 0.11], ['C5', 0.12, 0.11], ['E5', 0.24, 0.11], ['G5', 0.36, 0.3],
        ['E5', 0.72, 0.13], ['G5', 0.88, 0.14], ['C6', 1.06, 0.9]];
      L.forEach(function (n) {
        sT('square', mtof(nm(n[0])), 0, t + n[1], n[2] + 0.05, 0.07, 0.005, true);
      });
      ['C5', 'E5', 'G5'].forEach(function (n) { sT('triangle', mtof(nm(n)), 0, t + 1.06, 0.95, 0.07, 0.01, true); });
      [['C3', 0], ['G3', 0.36], ['C3', 0.72], ['C3', 1.06]].forEach(function (n) {
        sT('triangle', mtof(nm(n[0])), 0, t + n[1], n[0] === 'C3' && n[1] > 1 ? 0.95 : 0.3, 0.16);
      });
      sN(t + 1.06, 0.8, 0.04, 'highpass', 6000, 0, 0.7, 0.003, true);
    },
    sad: function (t) {
      seq(['G4', 'F#4', 'F4'], t, 'square', 0.06, 0.32, 0.3);
      var o = osc('square', mtof(64)), g = gn(0), lfo = osc('sine', 6), lg = gn(18), b = t + 0.96;
      lfo.connect(lg); lg.connect(o.detune); o.connect(g); g.connect(sfxGain);
      g.gain.setValueAtTime(0.0001, b); g.gain.linearRampToValueAtTime(0.06, b + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, b + 1.0);
      o.start(b); lfo.start(b); o.stop(b + 1.02); lfo.stop(b + 1.02);
      seq(['C4', 'B3', 'Bb3', 'A3'], t, 'triangle', 0.1, 0.32, 0.3);
    },
    error: function (t) {
      sT('square', 180, 0, t, 0.12, 0.07); sT('sawtooth', 186, 0, t, 0.12, 0.04);
      sT('square', 135, 0, t + 0.13, 0.2, 0.07); sT('sawtooth', 140, 0, t + 0.13, 0.2, 0.04);
    },
    vote: function (t) {
      sT('sine', 300, 1400, t, 0.08, 0.22);
      sN(t, 0.03, 0.08, 'highpass', 2000);
      sT('square', 1400, 0, t + 0.06, 0.05, 0.035);
    },
    rattle: function (t) {
      for (var k = 0; k < 18; k++) {
        var tk = t + k * 0.055, e = 0.5 + 0.5 * Math.abs(Math.sin(k * 0.7));
        sN(tk, 0.04, 0.07 * e, 'highpass', 5000);
        sT('square', rnd(2400, 4000), 0, tk + 0.005, 0.03, 0.015 * e);
      }
    },
    report: function (t) {
      var notes = [48, 51, 54, 57, 60], lp = filt('lowpass', 2200, 0.8), g = gn(0);
      lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 1.2);
      notes.forEach(function (m) {
        [-8, 8].forEach(function (dt) {
          var o = osc('sawtooth', mtof(m)); o.detune.value = dt; o.connect(lp);
          o.start(t); o.stop(t + 1.3);
        });
      });
      lp.connect(g); g.connect(sfxGain); g.connect(sfxRev);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
      sT('sine', 95, 48, t, 1.0, 0.5, 0.003, true);
      sN(t, 0.9, 0.12, 'highpass', 3500, 0, 0.6, 0.003, true);
    },
    door: function (t) {
      sT('sine', 140, 55, t, 0.18, 0.32);
      sN(t, 0.06, 0.16, 'lowpass', 1500);
      sT('square', 300, 200, t + 0.12, 0.05, 0.05);
      sN(t + 0.12, 0.04, 0.08, 'bandpass', 2000, 0, 2);
    },
    chute: function (t) {
      var o = osc('sine', 1600), g = gn(0), lfo = osc('sine', 7), lg = gn(25);
      o.frequency.setValueAtTime(1600, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.8);
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(sfxGain);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14, t + 0.03);
      g.gain.setValueAtTime(0.14, t + 0.65); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      o.start(t); lfo.start(t); o.stop(t + 0.86); lfo.stop(t + 0.86);
    },
    reveal: function (t) {
      sN(t, 0.5, 0.18, 'bandpass', 300, 5000, 1.2, 0.35);
      sT('sawtooth', 200, 800, t, 0.45, 0.04);
      var h = t + 0.45;
      [64, 67, 71, 76].forEach(function (m) { sT('square', mtof(m), 0, h, 0.5, 0.04, 0.003, true); });
      sT('sine', 120, 45, h, 0.5, 0.35);
      sN(h, 0.8, 0.08, 'highpass', 4000, 0, 0.6, 0.003, true);
    },
    heart: function (t) { // friendly "thump-thump" when the Minotaur is near
      sT('sine', 78, 44, t, 0.16, 0.6); sN(t, 0.05, 0.05, 'lowpass', 300);
      sT('sine', 70, 40, t + 0.2, 0.13, 0.42);
    },
    key: function (t) { sT('square', 988, 0, t, 0.07, 0.07); sT('square', 1319, 0, t + 0.07, 0.07, 0.07); sT('square', 1976, 0, t + 0.14, 0.16, 0.07); },
    gate: function (t) { sT('sawtooth', 120, 240, t, 0.5, 0.12); sT('square', 523, 0, t + 0.45, 0.12, 0.08); sT('square', 784, 0, t + 0.58, 0.25, 0.08); },
    caught: function (t) { sT('square', 600, 150, t, 0.3, 0.1); sT('sine', 220, 110, t + 0.05, 0.3, 0.2); },
    chat: function (t) {
      sT('sine', 1320, 0, t, 0.08, 0.07);
      sT('sine', 1760, 0, t + 0.07, 0.14, 0.07);
    }
  };
  SFX.kill = SFX.hex;

  /* ------------------------------------------------------------ public API */
  var Snd = {
    current: null,
    TRACKS: ['jazz_lobby', 'jazz_workshop', 'jazz_custom', 'treachery', 'showdown'].map(function (id) {
      return { id: id, name: DEFS[id].name, style: DEFS[id].style };
    }),
    init: function () {
      if (!AC) return;
      try {
        if (!ctx) {
          ctx = new AC();
          setupGraph();
          timer = setInterval(tick, TICK_MS);
          if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('visibilitychange', function () {
              if (!document.hidden) resume();
            });
          }
        }
        resume();
        // iOS unlock: play a silent buffer inside the gesture
        var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
        checkMp3s();
        startCurrent();
        for (var k in mp3) if (mp3[k].want && (mp3[k].pending || mp3[k].el.paused)) tryPlay(mp3[k]);
      } catch (e) { if (W.console) console.warn('Snd.init', e); }
    },
    setMusicVolume: function (v) {
      musicVol = Math.max(0, Math.min(1, +v || 0));
      if (!ctx) return;
      var now = ctx.currentTime;
      musicGain.gain.setTargetAtTime(musicVol * MUSIC_LVL, now, 0.03);
      musicRev.gain.setTargetAtTime(musicVol * MUSIC_LVL, now, 0.03);
      for (var k in mp3) if (!mp3[k].node) mp3[k].el.volume = musicVol;
    },
    setSfxVolume: function (v) {
      sfxVol = Math.max(0, Math.min(1, +v || 0));
      if (!ctx) return;
      var now = ctx.currentTime;
      sfxGain.gain.setTargetAtTime(sfxVol * SFX_LVL, now, 0.03);
      sfxRev.gain.setTargetAtTime(sfxVol * SFX_LVL * 0.35, now, 0.03);
    },
    play: function (id) {
      if (id === 'off' || id === undefined || id === '') id = null;
      if (id !== null && !DEFS[id]) return;
      if (id === Snd.current) return;
      Snd.current = id;
      try { startCurrent(); } catch (e) { }
    },
    sfx: function (name) {
      if (!ctx || ctx.state === 'closed') return;
      var f = SFX[name];
      if (!f || !Object.prototype.hasOwnProperty.call(SFX, name)) return;
      try { f(ctx.currentTime + 0.005); } catch (e) { }
    }
  };
  function resume() {
    if (ctx && ctx.state !== 'running' && ctx.resume) {
      try { var p = ctx.resume(); if (p && p.catch) p.catch(function () { }); } catch (e) { }
    }
  }

  W.Snd = Snd;
})();
