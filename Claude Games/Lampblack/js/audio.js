'use strict';
// LAMPBLACK — WebAudio (DESIGN §4.5): all procedural, no assets. Init on first
// gesture; guarded when AudioContext is absent. Every recipe is addressable by
// name so the soundboard harness can audition each one ("user reports by name").
//
// SYNTHESIS NOTES (audit pass 3 — foundations, not parameters):
//  * Everything schedules on the AudioContext clock with a `when` offset. No
//    setTimeout anywhere in a recipe: under a busy game loop setTimeout smears
//    multi-part sounds, which is what made grainy sounds land unevenly.
//  * Textures (scrape, rustle, jangle, splinter) are DENSE SHORT micro-impacts
//    (10-30ms). Long grains smear into a wash and stop reading as texture.
//  * Voices (scream, barks, murmur) run a glottal saw through formant bandpasses.
//    A bare sawtooth can only sound like a synth.
//  * Whistles are noise in a high-Q resonator — that is physically what a whistle
//    is — not a square wave.
//  * Roughness/growl is proper AM: the modulator stays POSITIVE (base + LFO),
//    so it grinds instead of ring-modulating into electronic buzz.
var LB = (typeof LB !== 'undefined') ? LB : (typeof module !== 'undefined' ? require('./core.js') : {});

LB.Audio = function () {
  var A = { ctx: null, ok: false, buses: {}, master: null, tells: {}, music: null };
  var LEIT = LB.C.LEITMOTIF; // [D5 F5 E5 A4 D5] — D minor, lazy swing. THE theme.

  A.init = function () {
    if (A.ok) return true;
    var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    A.ctx = new AC();
    A.master = A.ctx.createGain();
    A.master.gain.value = 0.8;
    var comp = A.ctx.createDynamicsCompressor();
    A.master.connect(comp); comp.connect(A.ctx.destination);
    ['music', 'ambience', 'foley', 'tells', 'ui'].forEach(function (b) {
      var g = A.ctx.createGain(); g.connect(A.master); A.buses[b] = g;
    });
    A.buses.tells.gain.value = 0.9;
    A.ok = true;
    return true;
  };
  A.resume = function () { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); };

  // ---------- primitives ----------
  var _noiseCache = null;
  function noiseBuf(dur) { // one long shared buffer, read from a random offset
    if (!_noiseCache) {
      var n = Math.floor(A.ctx.sampleRate * 2);
      _noiseCache = A.ctx.createBuffer(1, n, A.ctx.sampleRate);
      var d = _noiseCache.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return _noiseCache;
  }
  // sp: {pan(-1..1), gain(0..1), cutoff(Hz lowpass; 0 = none), bus}
  function out(sp) {
    sp = sp || {};
    var g = A.ctx.createGain();
    g.gain.value = sp.gain !== undefined ? sp.gain : 1;
    var tail = g;
    if (sp.cutoff) {
      var lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = sp.cutoff;
      g.connect(lp); tail = lp;
    }
    if (A.ctx.createStereoPanner) {
      var p = A.ctx.createStereoPanner(); p.pan.value = sp.pan || 0;
      tail.connect(p); tail = p;
    }
    tail.connect(A.buses[sp.bus || 'foley']);
    return g;
  }
  function now(at) { return A.ctx.currentTime + (at || 0); }
  function decayTo(param, t, dur, peak, attack) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + (attack || 0.004));
    param.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  // Sustained shape: attack, HOLD, then release. A pure exponential decay makes
  // every "long" sound audibly much shorter than its nominal duration (the lab
  // measured a 0.7s whistle as 0.40s of audible sound) and nothing can hold a
  // steady note — wrong for whistles, screams, alarms.
  function holdTo(param, t, dur, peak, attack, releaseFrac) {
    var rel = dur * (releaseFrac || 0.25);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + (attack || 0.02));
    param.setValueAtTime(peak, t + Math.max(attack || 0.02, dur - rel));
    param.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // Filtered noise burst. at = seconds from now (sample-accurate).
  function noiseHit(sp, dur, type, freq, q, attack, at) {
    if (!A.ok) return;
    var t = now(at);
    var src = A.ctx.createBufferSource();
    src.buffer = noiseBuf(); src.loop = true;
    var f = A.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    var e = A.ctx.createGain();
    decayTo(e.gain, t, dur, 1, attack);
    src.connect(f); f.connect(e); e.connect(out(sp));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  }
  // Oscillator with optional glide + vibrato.
  function tone(sp, dur, type, f0, f1, vibrato, at, attack) {
    if (!A.ok) return null;
    var t = now(at);
    var o = A.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    var e = A.ctx.createGain();
    decayTo(e.gain, t, dur, 1, attack || 0.008);
    if (vibrato) {
      var lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
      lfo.frequency.value = vibrato.rate; lg.gain.value = vibrato.depth;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur);
    }
    o.connect(e); e.connect(out(sp));
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  function fmPing(sp, dur, carrier, ratio, index, at) {
    if (!A.ok) return;
    var t = now(at);
    var c = A.ctx.createOscillator(); c.frequency.value = carrier;
    var m = A.ctx.createOscillator(); m.frequency.value = carrier * (ratio || 3.7);
    var mg = A.ctx.createGain(); mg.gain.setValueAtTime(carrier * (index || 2), t);
    mg.gain.exponentialRampToValueAtTime(1, t + dur);
    m.connect(mg); mg.connect(c.frequency);
    var e = A.ctx.createGain();
    e.gain.setValueAtTime(1, t); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    c.connect(e); e.connect(out(sp));
    c.start(t); c.stop(t + dur); m.start(t); m.stop(t + dur);
  }
  // A resonant impact: bright transient + a body that rings briefly at `hz`.
  function knock(sp, hz, dur, bright, at) {
    noiseHit(sp2(sp, 0.55), 0.012, 'bandpass', bright || hz * 4, 2.5, 0.001, at);
    tone(sp2(sp, 0.9), dur, 'sine', hz, hz * 0.72, null, at, 0.002);
    tone(sp2(sp, 0.3), dur * 0.6, 'triangle', hz * 2.4, hz * 1.9, null, at, 0.002);
  }
  // Dense micro-impact texture: scrape / rustle / jangle / splinter.
  // o: {count, spread(s), grain(s), f0, f1, Q, gain, jitter}
  function grains(sp, o) {
    if (!A.ok) return;
    for (var i = 0; i < o.count; i++) {
      var at = (o.at || 0) + o.spread * (i / o.count) + (Math.random() - 0.5) * (o.jitter || 0.01);
      var fq = o.f0 + Math.random() * (o.f1 - o.f0);
      noiseHit(sp2(sp, o.gain * (0.45 + Math.random() * 0.75)), o.grain * (0.6 + Math.random() * 0.8),
        'bandpass', fq, o.Q || 6, 0.001, Math.max(0, at));
    }
  }
  // Guttural roughness. Modulator is base+LFO and stays POSITIVE — grinds,
  // never flips sign (the r2 bug: negative gain = ring mod = electronic buzz).
  function growl(sp, g, dur, f0, rate, at) {
    if (!A.ok) return;
    var t = now(at);
    var o = A.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 0.78, t + dur);
    var lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 1.2;
    var depth = 0.42;
    var am = A.ctx.createGain(); am.gain.value = 1 - depth;
    var lfo = A.ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = rate || 31;
    var lg = A.ctx.createGain(); lg.gain.value = depth;
    lfo.connect(lg); lg.connect(am.gain);
    var e = A.ctx.createGain();
    decayTo(e.gain, t, dur, g, 0.01);
    o.connect(lp); lp.connect(am); am.connect(e); e.connect(out(sp2(sp, 1)));
    o.start(t); o.stop(t + dur + 0.02); lfo.start(t); lfo.stop(t + dur + 0.02);
  }
  // A voice: glottal saw through formant bandpasses (+ optional breath).
  // o: {dur, f0, f1, formants[3], gain, vib, breath, at}
  function voice(sp, o) {
    if (!A.ok) return;
    var t = now(o.at), dur = o.dur;
    var src = A.ctx.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(o.f0, t);
    if (o.f1) src.frequency.linearRampToValueAtTime(o.f1, t + dur);
    if (o.vib) {
      var lfo = A.ctx.createOscillator(); lfo.frequency.value = o.vib.rate;
      var lg = A.ctx.createGain(); lg.gain.value = o.vib.depth;
      lfo.connect(lg); lg.connect(src.frequency); lfo.start(t); lfo.stop(t + dur);
    }
    var e = A.ctx.createGain();
    if (o.hold) holdTo(e.gain, t, dur, o.gain === undefined ? 1 : o.gain, o.attack || 0.012, 0.35);
    else decayTo(e.gain, t, dur, o.gain === undefined ? 1 : o.gain, o.attack || 0.012);
    var amps = [1, 0.55, 0.25];
    (o.formants || [720, 1180, 2600]).forEach(function (fq, i) {
      var bp = A.ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = fq; bp.Q.value = o.Q || 7;
      var g = A.ctx.createGain(); g.gain.value = amps[i] || 0.2;
      src.connect(bp); bp.connect(g); g.connect(e);
    });
    e.connect(out(sp));
    src.start(t); src.stop(t + dur + 0.02);
    if (o.breath) noiseHit(sp2(sp, o.breath), dur, 'bandpass', (o.formants || [720])[1] || 1200, 1.6, 0.02, o.at);
  }
  // Stick-slip friction: ONE continuous tone whose pitch ratchets in micro-steps
  // while its amplitude is scrubbed per step. This is what a creak actually is —
  // discrete grains (r1/r2) smeared into a buzz instead.
  function stickSlip(sp, o) {
    if (!A.ok) return;
    var t = now(o.at), dur = o.dur, steps = o.steps || 16, g = o.gain === undefined ? 1 : o.gain;
    var osc = A.ctx.createOscillator(); osc.type = 'sawtooth';
    var bp = A.ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = o.band || 1500; bp.Q.value = 1.1;
    var e = A.ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    var body = dur * 0.82, sd = body / steps;
    for (var i = 0; i < steps; i++) {
      var frac = i / (steps - 1);
      var hz = o.f0 + (o.f1 - o.f0) * frac + (Math.random() - 0.5) * (o.jitter || 70);
      osc.frequency.setValueAtTime(Math.max(60, hz), t + i * sd);
      // each slip = a little burst, each stick = near-silence (the "breaks")
      e.gain.setValueAtTime(g * (0.3 + Math.random() * 0.7), t + i * sd);
      e.gain.linearRampToValueAtTime(g * 0.06, t + (i + 0.85) * sd);
    }
    // the end: drop a LOT
    osc.frequency.setValueAtTime(o.f1, t + body);
    osc.frequency.exponentialRampToValueAtTime(Math.max(50, o.fEnd || o.f0 * 0.35), t + dur);
    e.gain.setValueAtTime(g * 0.95, t + body);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(bp); bp.connect(e); e.connect(out(sp));
    osc.start(t); osc.stop(t + dur + 0.03);
    // low undertone breaks poking through
    if (o.under !== false) for (var k = 0; k < 3; k++)
      tone(sp2(sp, g * 0.16), 0.045, 'square', 165 + Math.random() * 45, 150, null,
        (o.at || 0) + body * (0.2 + k * 0.3) + Math.random() * 0.04);
  }
  // Breathy whistle: noise in a high-Q resonator (physically what a whistle is)
  // plus a pure core and a little breath. Airy, but the LAB caught the balance —
  // a highpassed air layer swamped the tone (spectral flatness 0.66 = mostly
  // hiss, so it read as noise rather than a pitch). Air is now band-limited
  // around the note and much quieter, and the whistle HOLDS instead of decaying.
  function airWhistle(sp, hz, dur, g, vibRate, vibDepth, at) {
    if (!A.ok) return;
    var t = now(at);
    var src = A.ctx.createBufferSource(); src.buffer = noiseBuf(); src.loop = true;
    var bp = A.ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(hz, t); bp.Q.value = 30;
    if (vibRate) {
      var lfo = A.ctx.createOscillator(); lfo.frequency.value = vibRate;
      var lg = A.ctx.createGain(); lg.gain.value = vibDepth || hz * 0.012;
      lfo.connect(lg); lg.connect(bp.frequency); lfo.start(t); lfo.stop(t + dur);
    }
    var e = A.ctx.createGain();
    holdTo(e.gain, t, dur, g * 6, 0.02, 0.22); // high-Q bandpass loses a lot of level
    src.connect(bp); bp.connect(e); e.connect(out(sp));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
    // pure core, held — this is what carries the PITCH
    if (A.ok) {
      var o = A.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(hz, t);
      if (vibRate) {
        var l2 = A.ctx.createOscillator(); l2.frequency.value = vibRate;
        var g2 = A.ctx.createGain(); g2.gain.value = vibDepth || hz * 0.012;
        l2.connect(g2); g2.connect(o.frequency); l2.start(t); l2.stop(t + dur);
      }
      var e2 = A.ctx.createGain();
      holdTo(e2.gain, t, dur, g * 0.75, 0.02, 0.22);
      o.connect(e2); e2.connect(out(sp2(sp, 1)));
      o.start(t); o.stop(t + dur + 0.02);
    }
    // breath, coloured by the note rather than broadband hiss
    if (A.ok) {
      var ns = A.ctx.createBufferSource(); ns.buffer = noiseBuf(); ns.loop = true;
      var nb = A.ctx.createBiquadFilter(); nb.type = 'bandpass';
      nb.frequency.value = hz * 2; nb.Q.value = 1.3;
      var ne = A.ctx.createGain();
      holdTo(ne.gain, t, dur, g * 0.5, 0.03, 0.22);
      ns.connect(nb); nb.connect(ne); ne.connect(out(sp2(sp, 1)));
      ns.start(t, Math.random() * 1.5); ns.stop(t + dur + 0.02);
    }
  }
  function sp2(sp, gain, bus) {
    sp = sp || {};
    return { pan: sp.pan || 0, gain: (sp.gain !== undefined ? sp.gain : 1) * gain, cutoff: sp.cutoff, bus: bus || sp.bus || 'foley' };
  }

  // ---------- foley recipes (§4.5) — each named, each soundboard-addressable ----------
  A.recipes = {
    // ----- footsteps by material -----
    step_carpet: function (sp) { noiseHit(sp2(sp, 0.35), 0.06, 'bandpass', 200, 1); },
    step_wood: function (sp) { // narrow mid knock — the highs were what killed it
      noiseHit(sp2(sp, 0.5), 0.05, 'bandpass', 420, 4.5);
      tone(sp2(sp, 0.45), 0.07, 'sine', 165, 120, null, 0, 0.002);
    },
    step_marble: function (sp) { // one hard clack: bright snap + tiny stone body
      noiseHit(sp2(sp, 0.85), 0.014, 'bandpass', 2400, 1.8, 0.001);
      noiseHit(sp2(sp, 0.4), 0.035, 'bandpass', 780, 3);
      tone(sp2(sp, 0.18), 0.03, 'sine', 300, 240, null, 0, 0.002);
    },
    step_glass: function (sp) { // tinkle - crunch - tinkle
      fmPing(sp2(sp, 0.3), 0.09, 3600 + Math.random() * 700, 3.1, 2, 0);
      grains(sp, { count: 7, spread: 0.07, grain: 0.016, f0: 900, f1: 2600, Q: 5, gain: 0.5, at: 0.055 });
      fmPing(sp2(sp, 0.24), 0.1, 4300 + Math.random() * 900, 2.7, 2, 0.15);
    },
    creak: function (sp) { stickSlip(sp, { dur: 0.62, f0: 620, f1: 1180, fEnd: 230, gain: 0.75, band: 1500, steps: 17 }); },

    // ----- the signature verb -----
    snuff_fwip: function (sp) { noiseHit(sp2(sp, 0.5), 0.15, 'lowpass', 400, 1, 0.06); tone(sp2(sp, 0.2), 0.25, 'sine', 90, 70, { rate: 9, depth: 12 }); },
    relight_foomp: function (sp) { noiseHit(sp2(sp, 0.09), 0.15, 'lowpass', 400, 1, 0.06); tone(sp2(sp, 0.04), 0.25, 'sine', 90, 70, { rate: 9, depth: 12 }); },

    // ----- hands -----
    pick_tick: function (sp) { noiseHit(sp2(sp, 1.0), 0.028, 'bandpass', 1150, 7, 0.001); tone(sp2(sp, 0.4), 0.02, 'square', 1700, 1500, null, 0, 0.001); },
    pick_success: function (sp) { fmPing(sp2(sp, 0.5), 0.25, 2400, 2.1, 1.5, 0); },
    // Lab finding: raising a high-Q bandpass's gain barely raises its LEVEL —
    // dial_tick measured 14dB under pick_tick despite similar gain numbers, and
    // the "subtle" thunk measured 8dB LOUDER than the tick it hides between.
    // The tick now carries a tonal layer; the thunk is genuinely under it.
    dial_tick: function (sp) { noiseHit(sp2(sp, 0.9), 0.022, 'bandpass', 1350, 8, 0.001); tone(sp2(sp, 0.5), 0.018, 'square', 1500, 1350, null, 0, 0.001); },
    dial_stop_thunk: function (sp) { tone(sp2(sp, 0.14), 0.07, 'sine', 315, 285, null, 0, 0.004); }, // subtle — you LISTEN for it
    drill: function (sp) { // quiet high whine, sustained ~2.5s
      if (!A.ok) return;
      var t = now(0), dur = 2.5;
      var o = A.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(2850, t);
      var v = A.ctx.createOscillator(); v.frequency.value = 24;
      var vg = A.ctx.createGain(); vg.gain.value = 55;
      v.connect(vg); vg.connect(o.frequency);
      var f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 2.2;
      var e = A.ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(0.34, t + 0.18);
      e.gain.setValueAtTime(0.34, t + dur - 0.3);
      e.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(f); f.connect(e); e.connect(out(sp2(sp, 1)));
      o.start(t); o.stop(t + dur); v.start(t); v.stop(t + dur);
      noiseHit(sp2(sp, 0.07), dur, 'highpass', 4200, 1, 0.25);
    },
    glass_cut: function (sp) { // scratch: dense short abrasive grains
      grains(sp, { count: 22, spread: 0.42, grain: 0.02, f0: 2100, f1: 3600, Q: 9, gain: 0.42, jitter: 0.012 });
    },
    glass_smash: function (sp) { // CRACK (splitting) — KSHHHH — light tinkling
      noiseHit(sp2(sp, 1.0), 0.02, 'bandpass', 2000, 3, 0.001);          // the split
      tone(sp2(sp, 0.5), 0.05, 'sawtooth', 1400, 320, null, 0, 0.001);   // the fracture chirp
      grains(sp, { count: 9, spread: 0.09, grain: 0.014, f0: 1200, f1: 3200, Q: 7, gain: 0.55, at: 0.02 }); // splintering
      noiseHit(sp2(sp, 0.75), 0.38, 'highpass', 2100, 1, 0.01, 0.05);    // KSHHHH
      for (var i = 0; i < 6; i++) fmPing(sp2(sp, 0.13 + Math.random() * 0.1), 0.12, 3000 + Math.random() * 3000, 3.7, 2, 0.26 + i * 0.09 + Math.random() * 0.05);
    },
    door_force: function (sp) { // heavy thump + splintering crack
      tone(sp2(sp, 1.4), 0.17, 'sine', 68, 38, null, 0, 0.003);
      noiseHit(sp2(sp, 0.95), 0.025, 'bandpass', 620, 2, 0.001);
      noiseHit(sp2(sp, 0.7), 0.2, 'lowpass', 380, 1, 0.008);
      grains(sp, { count: 6, spread: 0.1, grain: 0.02, f0: 700, f1: 1800, Q: 6, gain: 0.5, at: 0.02 });
    },
    door_creakopen: function (sp) { stickSlip(sp, { dur: 1.05, f0: 480, f1: 980, fEnd: 190, gain: 0.62, band: 1250, steps: 24 }); },
    bell_trap: function (sp) { for (var i = 0; i < 4; i++) fmPing(sp2(sp, 0.6), 0.4, 2800, 1.4, 3, i * 0.13); },

    // ----- rough work -----
    blackjack_thump: function (sp) { tone(sp2(sp, 0.9), 0.1, 'sine', 90, 60, null, 0, 0.003); noiseHit(sp2(sp, 0.4), 0.09, 'lowpass', 600, 1); },
    body_drag: function (sp) { // SCRAPE: fast micro-impacts over a faint low bed
      // (lab: measured 18dB under the median — a dragged body should be audible)
      grains(sp, { count: 34, spread: 1.05, grain: 0.018, f0: 900, f1: 2200, Q: 5, gain: 0.85, jitter: 0.014 });
      noiseHit(sp2(sp, 0.3), 1.1, 'lowpass', 240, 1, 0.25);
    },
    oil_slip: function (sp) { noiseHit(sp2(sp, 0.7), 0.35, 'highpass', 3200, 1, 0.01); }, // "ssssst"
    smoke_burst: function (sp) { noiseHit(sp2(sp, 0.7), 0.4, 'lowpass', 500, 1, 0.01); },
    gas_hiss: function (sp) { noiseHit(sp2(sp, 0.5), 1.8, 'highpass', 2500, 1, 0.2); },
    dumbwaiter_clunk: function (sp) { tone(sp2(sp, 0.7), 0.1, 'sine', 140, 90, null, 0, 0.003); noiseHit(sp2(sp, 0.3), 0.2, 'lowpass', 350, 1); },

    // ----- lures -----
    coin_lure: function (sp) { for (var i = 0; i < 3; i++) fmPing(sp2(sp, 0.4), 0.15, 4200 + Math.random() * 800, 3.7, 2, i * 0.07); },
    songbird: function (sp) { for (var i = 0; i < 3; i++) tone(sp2(sp, 0.35), 0.07, 'sine', 2600 + i * 300, 3100 + i * 200, null, i * 0.11); },

    // ----- alarm class -----
    whistle_blast: function (sp) { // shrill resonator alarm, one pitch, guttural low under it
      airWhistle(sp, 2650, 0.7, 0.55, 12, 55, 0);
      growl(sp, 0.34, 0.7, 74, 27, 0);
    },
    scream: function (sp) { // a VOICE: formants + rasp + guttural chest, HELD
      voice(sp, { dur: 0.8, f0: 880, f1: 1080, formants: [900, 1500, 3000], gain: 0.85,
        vib: { rate: 9, depth: 85 }, breath: 0.3, Q: 6, attack: 0.03, hold: true });
      growl(sp, 0.3, 0.7, 88, 29, 0.01);
    },

    // ----- tells -----
    whistle_note: function (sp, hz) { airWhistle(sp, hz || 587, 0.3, 0.34, 5.5, (hz || 587) * 0.01, 0); },
    snore_in: function (sp) { // rattling inhale (30Hz roughness) + low low clicks
      if (A.ok) {
        var t = now(0), dur = 0.75;
        var src = A.ctx.createBufferSource(); src.buffer = noiseBuf(); src.loop = true;
        var lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;
        var depth = 0.4;
        var am = A.ctx.createGain(); am.gain.value = 1 - depth;
        var lfo = A.ctx.createOscillator(); lfo.frequency.value = 30;
        var lg = A.ctx.createGain(); lg.gain.value = depth;
        lfo.connect(lg); lg.connect(am.gain);
        var e = A.ctx.createGain(); decayTo(e.gain, t, dur, 0.5, 0.3);
        src.connect(lp); lp.connect(am); am.connect(e); e.connect(out(sp2(sp, 1)));
        src.start(t, Math.random()); src.stop(t + dur + 0.02); lfo.start(t); lfo.stop(t + dur + 0.02);
      }
      for (var i = 0; i < 4; i++) tone(sp2(sp, 0.22), 0.028, 'sine', 60, 52, null, 0.08 + i * 0.15 + Math.random() * 0.04, 0.002);
    },
    snore_out: function (sp) { noiseHit(sp2(sp, 0.25), 0.5, 'lowpass', 250, 1, 0.05); },
    key_jangle: function (sp) { // clattering keys: short clacks + a faint ring
      grains(sp, { count: 9, spread: 0.16, grain: 0.012, f0: 2700, f1: 3500, Q: 12, gain: 0.4, jitter: 0.014 });
      fmPing(sp2(sp, 0.12), 0.16, 3200, 1.6, 1.2, 0.03);
    },
    dog_pant: function (sp) { noiseHit(sp2(sp, 0.35), 0.12, 'lowpass', 900, 1, 0.03); }, // short high snore_out
    dog_snuffle: function (sp) { for (var i = 0; i < 2; i++) noiseHit(sp2(sp, 0.8), 0.06, 'bandpass', 500, 3, 0.006, i * 0.09); },
    dog_bark: function (sp) { // chesty: growl + formant voice + snuffle tail
      growl(sp, 0.55, 0.2, 105, 34, 0);
      voice(sp, { dur: 0.16, f0: 330, f1: 165, formants: [520, 1250, 2400], gain: 0.7, Q: 5, attack: 0.006 });
      noiseHit(sp2(sp, 0.45), 0.1, 'bandpass', 750, 2, 0.003);
      noiseHit(sp2(sp, 0.3), 0.07, 'bandpass', 480, 3, 0.01, 0.16);
    },
    order_bark: function (sp) { // a man shouting an order
      growl(sp, 0.3, 0.26, 92, 26, 0);
      voice(sp, { dur: 0.24, f0: 175, f1: 130, formants: [680, 1150, 2500], gain: 0.75, breath: 0.2, Q: 6 });
    },
    rifle_cock: function (sp) { // loud mechanical double-clack + metallic ring
      // (lab: the first ping's ring overlapped the second clack, so the DOUBLE
      // read as one event — widened the gap and shortened the first ring)
      noiseHit(sp2(sp, 1.35), 0.02, 'bandpass', 2300, 8, 0.001);
      fmPing(sp2(sp, 0.5), 0.04, 2600, 3.7, 2, 0);
      noiseHit(sp2(sp, 1.35), 0.028, 'bandpass', 1650, 8, 0.001, 0.125);
      fmPing(sp2(sp, 0.42), 0.08, 1900, 3.7, 2, 0.125);
    },
    tough_hum: function (sp) { // breathy, tuneless, off-key
      var notes = [196, 233, 175, 220];
      var hz = notes[Math.floor(Math.random() * 4)] * (0.99 + Math.random() * 0.03);
      voice(sp, { dur: 0.42, f0: hz, formants: [400, 900, 2100], gain: 0.3, breath: 0.22, Q: 5, attack: 0.06 });
    },
    civ_murmur: function (sp) { // mumbled conversation, no words
      for (var i = 0; i < 3; i++) voice(sp, { dur: 0.13, f0: 150 + Math.random() * 60, f1: 130 + Math.random() * 50,
        formants: [560, 1100, 2400], gain: 0.16, Q: 6, at: i * 0.15 });
    },
    gasp: function (sp) { noiseHit(sp2(sp, 0.5), 0.15, 'highpass', 900, 1, 0.1); },

    // ----- OLD COPPER -----
    copper_boot_heavy: function (sp) { knock(sp2(sp, 1.0), 58, 0.14, 320, 0); noiseHit(sp2(sp, 0.3), 0.05, 'lowpass', 700, 1); },
    copper_boot_light: function (sp) { knock(sp2(sp, 0.55), 74, 0.1, 380, 0); },
    shk_clack: function (sp) { // shutter: metal slide then the CLACK
      noiseHit(sp2(sp, 0.6), 0.03, 'highpass', 3200, 1, 0.002);
      noiseHit(sp2(sp, 0.9), 0.014, 'bandpass', 1900, 9, 0.001, 0.022);
      fmPing(sp2(sp, 0.35), 0.07, 2100, 2.4, 2, 0.022);
    },

    // ----- UI -----
    ui_coin: function (sp) { fmPing(sp2(sp, 0.4, 'ui'), 0.14, 4300, 3.7, 2, 0); },
    paper_rustle: function (sp) { // crinkle, not a wash
      grains(sp2(sp, 1, 'ui'), { count: 14, spread: 0.22, grain: 0.012, f0: 2400, f1: 5200, Q: 5, gain: 0.3, jitter: 0.012 });
    },
    jackdaw_chirp: function (sp) { fmPing(sp2(sp, 0.25, 'ui'), 0.045, 2800, 2.3, 3, 0); },
    stinger_brass: function (sp) { // muted-brass stab (stage-up)
      if (!A.ok) return;
      var t = now(0);
      [146.8, 147.6].forEach(function (hz, i) {
        var o = A.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz;
        var f = A.ctx.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(1800, t + 0.15);
        f.frequency.exponentialRampToValueAtTime(250, t + 0.7);
        var e = A.ctx.createGain();
        e.gain.setValueAtTime(i ? 0.35 : 0.6, t); e.gain.exponentialRampToValueAtTime(0.0005, t + 0.8);
        o.connect(f); f.connect(e); e.connect(out(sp2(sp, 0.8, 'music')));
        o.start(t); o.stop(t + 0.85);
      });
    },
    leitmotif: function (sp, minor) { A.playLeitmotif(sp, minor); }
  };
  A.play = function (name, sp) { if (A.ok && A.recipes[name]) A.recipes[name](sp || {}); };

  // The theme, lazy swing: long-short pairing at 84bpm. Scheduled on the audio
  // clock so the phrasing holds even when the game loop is busy.
  A.playLeitmotif = function (sp, minorSting) {
    if (!A.ok) return;
    var beat = 60 / LB.C.MUSIC_BPM;
    var offs = [0, beat * 0.66, beat * 1.33, beat * 2.0, beat * 3.0];
    LEIT.forEach(function (n, i) { airWhistle(sp || {}, LB.noteHz(n), 0.32, 0.34, 5.5, LB.noteHz(n) * 0.01, offs[i]); });
    if (minorSting) {
      tone(sp2(sp || {}, 0.4, 'music'), 1.2, 'triangle', LB.noteHz('D4'), undefined, null, offs[4] + 0.3);
      tone(sp2(sp || {}, 0.3, 'music'), 1.2, 'triangle', LB.noteHz('F4'), undefined, null, offs[4] + 0.3);
    }
  };

  // ---------- guard tell loops (audio fires ON animation frames — main drives) ----------
  A.tellHandle = function (guardId) {
    var h = A.tells[guardId];
    if (!h) h = A.tells[guardId] = { pan: 0, gain: 0, cutoff: 8000, lastGain: 0 };
    return h;
  };
  A.setTellSpatial = function (guardId, pan, gain, cutoff) {
    var h = A.tellHandle(guardId);
    h.pan = pan; h.gain = gain; h.cutoff = cutoff;
  };
  A.playTell = function (guardId, recipe, extra) {
    var h = A.tellHandle(guardId);
    if (h.gain <= 0.02) return;
    var sp = { pan: h.pan, gain: h.gain, cutoff: h.cutoff < 7500 ? h.cutoff : 0, bus: 'tells' };
    if (A.recipes[recipe]) A.recipes[recipe](sp, extra);
  };

  // ---------- music: 4 alertness layers, one 84bpm scheduler, ALL always running ----------
  A.startMusic = function () {
    if (!A.ok || A.music) return;
    var ctx = A.ctx, beat = 60 / LB.C.MUSIC_BPM;
    var layers = {};
    ['calm', 'wary', 'alarmed', 'lockdown'].forEach(function (n, i) {
      var g = ctx.createGain(); g.gain.value = i === 0 ? 1 : 0; g.connect(A.buses.music); layers[n] = g;
    });
    var m = { layers: layers, stage: 0, step: 0, nextT: ctx.currentTime + 0.1, chase: false, timer: null };
    // room-tone pad: 2 detuned triangles D2+A2 (always on)
    [73.42, 110].forEach(function (hz, i) {
      var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz * (i ? 1.002 : 0.998);
      var g = ctx.createGain(); g.gain.value = 0.032;
      o.connect(g); g.connect(layers.calm); o.start();
      m['pad' + i] = o;
    });
    // thin A5 pedal whine (lockdown)
    var whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 880;
    var wg = ctx.createGain(); wg.gain.value = 0.028;
    whine.connect(wg); wg.connect(layers.lockdown); whine.start();
    // tremolo strings (alarmed)
    var tremGain = ctx.createGain(); tremGain.gain.value = 0.1;
    var tlp = ctx.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 1200;
    tremGain.connect(tlp); tlp.connect(layers.alarmed);
    [146.83, 174.61, 220].forEach(function (hz) {
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz;
      var g = ctx.createGain(); g.gain.value = 0.33; o.connect(g); g.connect(tremGain); o.start();
    });
    var tlfo = ctx.createOscillator(); tlfo.frequency.value = 7;
    var tlg = ctx.createGain(); tlg.gain.value = 0.06;
    tlfo.connect(tlg); tlg.connect(tremGain.gain); tlfo.start();
    m.tremGain = tremGain;
    var pizzLine = ['D2', 'F2', 'A2', 'C3'];
    function schedule() {
      if (!A.ok) return;
      while (m.nextT < ctx.currentTime + 0.12) {
        var t = m.nextT, eighth = m.step % 8, bar = Math.floor(m.step / 8);
        if (Math.random() < 0.06) crackleAt(t, layers.calm);
        if (m.step % 128 === 17 && Math.random() < 0.7) bellAt(t, layers.calm);
        if (eighth % 2 === 0 || Math.random() < 0.3) hatAt(t, layers.wary, eighth === 0 ? 0.09 : 0.05);
        if (eighth === 0 && bar % 2 === 0) pizzAt(t, layers.wary, LB.noteHz(pizzLine[bar % 4]) / 2);
        if (eighth === 0) { thumpAt(t, layers.lockdown, 1); thumpAt(t + beat * 0.35, layers.lockdown, 0.6); }
        m.step++; m.nextT += beat / 2;
      }
      m.timer = setTimeout(schedule, 40);
    }
    function crackleAt(t, dest) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf(); src.loop = false;
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 2;
      var g = ctx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.02);
      src.connect(f); f.connect(g); g.connect(dest); src.start(t, Math.random() * 1.5); src.stop(t + 0.03);
    }
    function bellAt(t, dest) {
      var o = ctx.createOscillator(); o.frequency.value = LB.noteHz('D3');
      var mo = ctx.createOscillator(); mo.frequency.value = LB.noteHz('D3') * 2.4;
      var mg = ctx.createGain(); mg.gain.value = 120;
      mo.connect(mg); mg.connect(o.frequency);
      var g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 3);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 3); mo.start(t); mo.stop(t + 3);
    }
    function hatAt(t, dest, v) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf();
      var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 4000;
      var g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
      src.connect(f); f.connect(g); g.connect(dest); src.start(t, Math.random() * 1.5); src.stop(t + 0.08);
    }
    function pizzAt(t, dest, hz) {
      var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
      var g = ctx.createGain(); g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.3);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.35);
    }
    function thumpAt(t, dest, v) {
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
      var g = ctx.createGain(); g.gain.setValueAtTime(0.22 * v, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.25);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.3);
    }
    schedule();
    A.music = m;
  };
  A.setStage = function (stage) {
    if (!A.ok || !A.music) return;
    if (stage === A.music.stage) return;
    if (stage > A.music.stage) A.play('stinger_brass', {});
    A.music.stage = stage;
    ['calm', 'wary', 'alarmed', 'lockdown'].forEach(function (n, i) {
      A.music.layers[n].gain.setTargetAtTime(i <= stage ? 1 : 0, A.ctx.currentTime, LB.C.MUSIC_XFADE_S / 3);
    });
  };
  A.setChase = function (on) {
    if (!A.ok || !A.music || A.music.chase === on) return;
    A.music.chase = on;
    A.music.tremGain.gain.setTargetAtTime(on ? 0.2 : 0.1, A.ctx.currentTime, 0.3);
  };
  A.stopMusic = function () {
    if (A.music && A.music.timer) clearTimeout(A.music.timer);
    A.music = null;
  };

  return A;
};

if (typeof module !== 'undefined') module.exports = LB;
