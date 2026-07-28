'use strict';
// SOUND TESTING — CREAK LAB
//
// One file, two consumers: index.html auditions these in a browser, and
// test/measure.js renders the SAME code offline through node-web-audio-api and
// measures it. So every claim about a creak is either (a) something the user
// heard or (b) something the analyzer measured — never something I assumed.
//
// METHOD: each round proposes candidates that differ in MECHANISM, not in
// parameters. Parameter tweaks teach you nothing about why a sound works;
// swapping the physics does.
//
// WHAT A CREAK PHYSICALLY IS: a relaxation oscillator. Two dry surfaces under
// load stick, elastic energy builds, the joint releases in a snap, and it
// repeats. The RELEASE RATE is the pitch you hear; the wood/metal around it is
// a fixed resonance that colours every release the same way regardless of that
// rate. That split — a moving source through a stationary body — is the whole
// game. Anything that moves both together sounds like a synth sweep.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Creaks = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  function Lab(ctx, dest) {
    var SR = ctx.sampleRate;
    var L = {};
    function rnd(a, b) { return a + Math.random() * (b - a); }

    // ---------- primitives ----------
    var _noise = null;
    function noiseBuf() {
      if (!_noise) {
        var n = Math.floor(SR * 2);
        _noise = ctx.createBuffer(1, n, SR);
        var d = _noise.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      return _noise;
    }

    // THE stick-slip source. Written sample-by-sample into a buffer rather than
    // scheduled as oscillator ramps, because per-CYCLE control is the point:
    // every individual slip can differ in length and in strength. That
    // cycle-to-cycle irregularity is the grit. A sawtooth oscillator with
    // stepped setValueAtTime pitch gives you a ratchet — regular within each
    // step — which is a different, more mechanical sound.
    //
    // Each cycle: a linear LOAD ramp (the stick, elastic energy building) and
    // then a fast RELEASE. The release is deliberately finite (~0.7ms) rather
    // than instantaneous: a true discontinuity aliases into digital fizz, and
    // real joints release in finite time anyway.
    function slipBuffer(dur, rateAt, o) {
      o = o || {};
      var n = Math.ceil(dur * SR), buf = ctx.createBuffer(1, n, SR), d = buf.getChannelData(0);
      var relS = Math.max(2, Math.round((o.release === undefined ? 0.0007 : o.release) * SR));
      var jit = o.jitter === undefined ? 0.08 : o.jitter;
      var ajit = o.ampJitter === undefined ? 0.45 : o.ampJitter;
      var i = 0, wander = 0, mult = 1;
      while (i < n) {
        wander = wander * 0.9 + rnd(-1, 1) * (o.wander || 0);
        // Real stick-slip is a NONLINEAR oscillator: under changing load a joint
        // jumps between release regimes rather than gliding smoothly, usually by
        // halving or doubling its rate. o.regime = chance per cycle of a jump.
        if (o.regime && Math.random() < o.regime) {
          var set = o.regimeSet || [0.5, 1, 1, 2];
          mult = set[Math.floor(Math.random() * set.length)];
        }
        var rate = Math.max(18, rateAt(i / n) * (1 + wander));
        var per = Math.max(relS + 3, Math.round(SR / rate * mult * (1 + rnd(-jit, jit))));
        var amp = 1 - Math.random() * ajit;
        var load = per - relS;
        for (var k = 0; k < per && i < n; k++, i++) {
          d[i] = amp * (k < load ? (k / load) * 2 - 1 : 1 - ((k - load) / relS) * 2);
        }
      }
      return buf;
    }

    // The body: fixed parallel resonances the source is heard THROUGH.
    // f = [hz, gain, Q]
    function body(input, formants, output) {
      formants.forEach(function (f) {
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f[0]; bp.Q.value = f[2] === undefined ? 6 : f[2];
        var g = ctx.createGain(); g.gain.value = f[1];
        input.connect(bp); bp.connect(g); g.connect(output);
      });
    }

    // Creaks SURGE. A flat envelope reads as a machine; real load shifting on a
    // joint makes 2-4 swells inside one creak, and the quiet moments between
    // them are what make the loud moments read as effort.
    function surge(param, t, dur, peak, humps, attack, bodyFrac) {
      var a = attack === undefined ? 0.012 : attack;
      param.setValueAtTime(0.0001, t);
      param.linearRampToValueAtTime(peak, t + a);
      var bodyT = dur * (bodyFrac || 0.88), seg = (bodyT - a) / humps;
      for (var i = 1; i <= humps; i++) param.linearRampToValueAtTime(peak * rnd(0.28, 1.0), t + a + seg * i);
      param.linearRampToValueAtTime(peak * 0.55, t + bodyT);
      param.exponentialRampToValueAtTime(0.0001, t + dur);
    }

    // Offline renders start at currentTime 0, so any negative jitter on a
    // scheduled time throws. Clamp once here rather than at every call site.
    function at0(t) { return Math.max(ctx.currentTime, t); }

    function tone(t, dur, type, f0, f1, g, atk) {
      t = at0(t);
      var o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      var e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(g, t + (atk || 0.004));
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(e); e.connect(dest);
      o.start(t); o.stop(t + dur + 0.02);
    }

    function noiseHit(t, dur, type, hz, q, g, atk) {
      t = at0(t);
      var s = ctx.createBufferSource(); s.buffer = noiseBuf(); s.loop = true;
      var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q || 1;
      var e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(g, t + (atk || 0.003));
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(e); e.connect(dest);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
    }

    // Contact + settle. A creak is something being MOVED — it needs a moment of
    // weight arriving and a moment of it stopping, or it floats free of any
    // object. Kept quiet so the round is really comparing friction voices.
    function loadThump(t, hz, g) {
      tone(t, 0.09, 'sine', hz, hz * 0.7, g, 0.003);
      noiseHit(t, 0.045, 'bandpass', hz * 3.4, 2.2, g * 0.5, 0.002);
    }

    // ================================================================
    // ROUND 1 — three mechanisms, three registers.
    // ================================================================

    // R1-A "FLOORBOARD" — stick-slip pulse train, mid register.
    // The literal physics: ~180-340 releases/sec through dry wood formants.
    // TRIM: per-candidate level match. A round that isn't level-matched measures
    // loudness instead of timbre — the loud one "wins" and we learn nothing.
    // These come from the offline peak measurements, not from guessing.
    L.r1a = function (g, at) {
      var t = ctx.currentTime + (at || 0), dur = 0.52;
      g = (g === undefined ? 1 : g) * 1.38;
      var buf = slipBuffer(dur, function (u) {
        // load rolls forward: rate climbs; then the joint lets go and collapses
        return u < 0.82 ? 175 + 165 * Math.pow(u / 0.82, 0.8)
                        : 340 - 200 * ((u - 0.82) / 0.18);
      }, { jitter: 0.09, ampJitter: 0.55, wander: 0.02 });
      var src = ctx.createBufferSource(); src.buffer = buf;
      var env = ctx.createGain();
      surge(env.gain, t, dur, g * 0.5, 3, 0.02);
      var bus = ctx.createGain(); bus.gain.value = 1;
      src.connect(env); env.connect(bus);
      body(bus, [[380, 1.0, 7], [1250, 0.5, 9], [2700, 0.16, 6]], dest);
      src.start(t); src.stop(t + dur + 0.02);
      // dry friction hiss riding the same effort
      var ns = ctx.createBufferSource(); ns.buffer = noiseBuf(); ns.loop = true;
      var nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3100; nf.Q.value = 1.1;
      var ne = ctx.createGain();
      surge(ne.gain, t, dur, g * 0.09, 3, 0.03);
      ns.connect(nf); nf.connect(ne); ne.connect(dest);
      ns.start(t, Math.random() * 1.5); ns.stop(t + dur + 0.02);
      loadThump(t, 95, g * 0.28);
      loadThump(t + dur * 0.93, 78, g * 0.16);
    };

    // R1-B "DOOR GROAN" — same relaxation oscillator, but so slow (55-95Hz)
    // that you hear the individual slips fusing into a low growl, through a
    // heavy low body. Tests whether "creak" wants the LOW complaint of the
    // material rather than the high complaint of the joint.
    L.r1b = function (g, at) {
      var t = ctx.currentTime + (at || 0), dur = 1.0;
      g = (g === undefined ? 1 : g) * 0.96;
      var buf = slipBuffer(dur, function (u) {
        return u < 0.85 ? 54 + 44 * Math.pow(u / 0.85, 0.7)
                        : 98 - 46 * ((u - 0.85) / 0.15);
      }, { jitter: 0.13, ampJitter: 0.6, wander: 0.035, release: 0.0016 });
      var src = ctx.createBufferSource(); src.buffer = buf;
      var env = ctx.createGain();
      surge(env.gain, t, dur, g * 0.55, 4, 0.06);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900;
      src.connect(env); env.connect(lp);
      body(lp, [[118, 1.0, 5], [255, 0.75, 7], [690, 0.28, 5], [1580, 0.07, 4]], dest);
      src.start(t); src.stop(t + dur + 0.02);
      // A little dry surface under it. The lab measured spectral flatness 0.00 —
      // pure tone, no noise at all — which is what a synth bass measures like.
      // Wood grinding on wood always has broadband content.
      var ns = ctx.createBufferSource(); ns.buffer = noiseBuf(); ns.loop = true;
      var nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 480; nf.Q.value = 1.6;
      var ne = ctx.createGain();
      surge(ne.gain, t, dur, g * 0.03, 4, 0.06);
      ns.connect(nf); nf.connect(ne); ne.connect(dest);
      ns.start(t, Math.random() * 1.5); ns.stop(t + dur + 0.02);
      loadThump(t, 72, g * 0.4);
      loadThump(t + dur * 0.95, 62, g * 0.22);
    };

    // R1-C "RUSTY HINGE" — a different mechanism entirely: no pulse train.
    // Noise driven through a swept high-Q resonator (whistle physics) with an
    // irregular random-walk waver, plus a thin harmonic core. Short, high, ugly.
    L.r1c = function (g, at) {
      var t = ctx.currentTime + (at || 0), dur = 0.42;
      g = (g === undefined ? 1 : g) * 0.92;
      var src = ctx.createBufferSource(); src.buffer = noiseBuf(); src.loop = true;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 24;
      var o = ctx.createOscillator(); o.type = 'triangle';
      // one shared waver: base sweep 1300->2050 + random walk, re-stepped every
      // 11ms. The walk (not an LFO) is what makes it sound sick rather than
      // musical — a vibrato is a performance, a random walk is a fault.
      // The end smear gets a fifth of the sound (0.80->1.0), not a fourteenth:
      // the lab measured no falling f0 at all when the drop was crammed into
      // 60ms under a decaying envelope — the resonance was still ringing at the
      // old pitch, so the drop happened entirely inside the tail.
      var w = 0, step = 0.011;
      for (var s = 0; s <= dur; s += step) {
        var u = s / dur;
        var base = u < 0.80 ? 1300 + 760 * Math.pow(u / 0.80, 0.75)
                            : 2060 - 1290 * ((u - 0.80) / 0.20);
        w = w * 0.72 + rnd(-1, 1) * 0.075;
        var hz = Math.max(300, base * (1 + w));
        bp.frequency.setValueAtTime(hz, t + s);
        o.frequency.setValueAtTime(hz, t + s);
      }
      var e = ctx.createGain();
      // bodyFrac 0.96: the sound must stay at level THROUGH the falling smear,
      // or the drop happens below the noise floor and reads as simply stopping.
      surge(e.gain, t, dur, g * 2.6, 3, 0.015, 0.96); // high-Q bandpass throws away level
      src.connect(bp); bp.connect(e); e.connect(dest);
      src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
      var e2 = ctx.createGain();
      surge(e2.gain, t, dur, g * 0.2, 3, 0.015, 0.96);
      o.connect(e2); e2.connect(dest);
      o.start(t); o.stop(t + dur + 0.02);
      // dry scrape underneath so it has a surface, not just a tone
      for (var k = 0; k < 14; k++)
        noiseHit(t + dur * (k / 14) + rnd(-0.008, 0.008), 0.018, 'bandpass', rnd(700, 2400), 6, g * 0.06, 0.001);
      loadThump(t, 88, g * 0.22);
    };

    // ================================================================
    // ROUND 2 — B won. All three keep its low register, and NONE of them has a
    // free-running noise layer: round 1 proved that a noise bed sharing only an
    // envelope still detaches into its own object (A's whoosh). Any brightness
    // here is a resonance excited by the slips themselves.
    // ================================================================

    // The low slip contour B won with, shared so the round varies one thing.
    function groanRate(u) {
      return u < 0.85 ? 54 + 44 * Math.pow(u / 0.85, 0.7) : 98 - 46 * ((u - 0.85) / 0.15);
    }
    // RELEASE TIME IS THE BRIGHTNESS CONTROL. The lab caught this: R2-A first
    // measured a LOWER centroid than the sound it was supposed to brighten
    // (233Hz vs 453Hz) despite adding modes up to 2.4kHz. A 1.6ms release rolls
    // the excitation off above ~1/(2·1.6ms) ≈ 300Hz, so the high modes were
    // being handed nothing to ring with. Round 1's "surface" was coming entirely
    // from its noise bed, not from the wood. 0.4ms = a drier, stiffer joint,
    // with real energy up past 1kHz. All of round 2 shares it.
    var REL = 0.0004;
    var WOOD = [[118, 1.0, 5], [255, 0.85, 8], [685, 0.62, 7], [1430, 0.52, 9], [2395, 0.34, 10]];

    // R2-A "BOUND BRIGHTNESS" — question: does wood get its material from
    // RESONANCE rather than from hiss? Same slips, same low body, but the
    // resonance stack now reaches up to 2.4kHz with high Q, and the 1.9kHz
    // lowpass that was capping B is gone. Every bright thing you hear is a
    // wooden mode ringing from a slip, not an added layer.
    L.r2a = function (g, at) {
      var t = ctx.currentTime + (at || 0), dur = 1.0;
      g = (g === undefined ? 1 : g) * 1.0;
      var src = ctx.createBufferSource();
      src.buffer = slipBuffer(dur, groanRate, { jitter: 0.13, ampJitter: 0.6, wander: 0.035, release: REL });
      var env = ctx.createGain();
      surge(env.gain, t, dur, g * 0.55, 4, 0.06);
      src.connect(env);
      // WOOD's mode ratios are inharmonic (1 : 2.16 : 5.8 : 12.1 : 20.3) — a
      // board is a plate, not a string, so its modes are NOT integer multiples.
      // Integer ratios fuse into one pitched note and sound like an instrument.
      body(env, WOOD, dest);
      src.start(t); src.stop(t + dur + 0.02);
      loadThump(t, 72, g * 0.4);
      loadThump(t + dur * 0.95, 62, g * 0.22);
    };

    // R2-B "UNSTABLE REGIME" — question: is a creak's identity in INSTABILITY
    // rather than in a smooth rise? The joint jumps between release regimes
    // (rate halving and doubling) instead of gliding, which is what a real
    // nonlinear stick-slip oscillator does under changing load. Same body as
    // R2-A so the only variable is the behaviour of the slip rate.
    L.r2b = function (g, at) {
      var t = ctx.currentTime + (at || 0), dur = 1.0;
      g = (g === undefined ? 1 : g) * 1.0;
      var src = ctx.createBufferSource();
      src.buffer = slipBuffer(dur, groanRate,
        { jitter: 0.10, ampJitter: 0.6, wander: 0.02, release: REL, regime: 0.045 });
      var env = ctx.createGain();
      surge(env.gain, t, dur, g * 0.55, 4, 0.06);
      src.connect(env);
      body(env, WOOD, dest);
      src.start(t); src.stop(t + dur + 0.02);
      loadThump(t, 72, g * 0.4);
      loadThump(t + dur * 0.95, 62, g * 0.22);
    };

    // R2-C "MULTI-CONTACT" — question: does thickness come from MULTIPLE slip
    // sources? A floorboard is not one joint: several contacts along the board
    // creak at once at slightly different rates, beating against each other.
    // Three generators at inharmonic rate scalings through one shared body.
    L.r2c = function (g, at) {
      var t = ctx.currentTime + (at || 0), dur = 1.0;
      g = (g === undefined ? 1 : g) * 1.0;
      var bus = ctx.createGain(); bus.gain.value = 1;
      [[1.0, 0.0, 1.0], [1.27, 0.03, 0.62], [0.79, 0.07, 0.5]].forEach(function (v) {
        var s = ctx.createBufferSource();
        s.buffer = slipBuffer(dur, function (u) { return groanRate(u) * v[0]; },
          { jitter: 0.14, ampJitter: 0.65, wander: 0.04, release: REL });
        var e = ctx.createGain();
        surge(e.gain, t, dur, g * 0.34 * v[2], 4, 0.06); // each contact surges on its own schedule
        s.connect(e); e.connect(bus);
        s.start(at0(t + v[1])); s.stop(t + dur + 0.02);
      });
      body(bus, WOOD, dest);
      loadThump(t, 72, g * 0.4);
      loadThump(t + dur * 0.95, 62, g * 0.22);
    };

    // ================================================================
    // ROUND 3 — B won, A close, C (multi-contact) too unnatural. Two notes
    // drive this round: it needs a HIGHER pitch, and the rise reads as a
    // "compound raise" when it should be linear with a drop at the end.
    //
    // Everything here keeps r2b's regime jumps and the WOOD body. The pitch
    // BAND is up (92-172 slips/sec, from 54-98) and is live on L.pitch so the
    // height can be dialled in by ear instead of guessed a round at a time.
    // ================================================================

    L.pitch = 1; // page slider multiplies every round-3 slip rate

    // Round 2 climbed on a pow(0.7) curve — fast early, flattening — which is
    // the shape being heard as "compound". Two honest readings of "linear",
    // and they do not sound the same: pitch perception is logarithmic, so a
    // straight line in Hz decelerates to the ear, and a line that sounds
    // straight to the ear is a geometric climb in Hz. Only the ear can pick.
    function rate3(geo) {
      var lo = 92, hi = 172, end = 68, top = 0.90;
      return function (u) {
        var p = L.pitch;
        if (u < top) {
          var x = u / top;
          return p * (geo ? lo * Math.pow(hi / lo, x) : lo + (hi - lo) * x);
        }
        var y = (u - top) / (1 - top); // the drop: last tenth, and it goes BELOW where it started
        return p * (geo ? hi * Math.pow(end / hi, y) : hi - (hi - end) * y);
      };
    }

    // One long swell instead of 3-4 separate ones. Round 2's envelope re-attacked
    // several times across a rising pitch, which is a second candidate cause of
    // the "compound" feel — each surge restarts higher than the last.
    function swell(param, t, dur, peak, attack) {
      param.setValueAtTime(0.0001, t);
      param.linearRampToValueAtTime(peak * 0.42, t + (attack || 0.06));
      param.linearRampToValueAtTime(peak, t + dur * 0.55);
      param.linearRampToValueAtTime(peak * 0.74, t + dur * 0.97);
      param.exponentialRampToValueAtTime(0.0001, t + dur);
    }

    // Shared spine so each candidate differs in exactly one way.
    function creak3(t, dur, g, o) {
      var src = ctx.createBufferSource();
      // REGIME JUMPS ARE THE "COMPOUND RAISE". r2b's ±octave jumps didn't just
      // colour the climb, they CANCELLED it: the lab measured the rate falling
      // 108→93 across a contour built to rise 92→172, because half-rate and
      // double-rate stretches average out the trend. Sudden octave leaps are
      // exactly what "compound" describes. Kept, because r2b beat the smooth
      // r2a, but rarer (4.5%→1.2%) and much milder (±2× → ±~40%), so the climb
      // survives them.
      src.buffer = slipBuffer(dur, rate3(o.geo),
        { jitter: 0.10, ampJitter: 0.6, wander: o.wander, release: REL,
          regime: 0.012, regimeSet: [0.72, 1, 1, 1.38] });
      var env = ctx.createGain();
      // bodyFrac 0.97: hold level THROUGH the end drop. At round 1/2's 0.88 the
      // whole drop happened inside the release ramp — the lab can't even find a
      // slip rate down there, which means the ear can't hear the drop either.
      if (o.swell) swell(env.gain, t, dur, g * 0.55, 0.06);
      else surge(env.gain, t, dur, g * 0.55, 4, 0.06, 0.97);
      src.connect(env);
      body(env, WOOD, dest);
      src.start(t); src.stop(t + dur + 0.02);
      loadThump(t, 72, g * 0.4);
      loadThump(t + dur * 0.95, 62, g * 0.22);
    }

    // R3-A "STRAIGHT CLIMB" — linear in Hz, and the random wander is GONE.
    // The plainest possible reading of the note.
    L.r3a = function (g, at) {
      creak3(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 1.0, { geo: false, wander: 0 });
    };

    // R3-B "LINEAR TO THE EAR" — geometric in Hz, constant semitones/sec, so
    // the climb sounds even rather than measuring even.
    L.r3b = function (g, at) {
      creak3(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 1.0, { geo: true, wander: 0 });
    };

    // R3-C "STEADY EFFORT" — linear in Hz like A, but one long swell instead of
    // four. If A still feels compound, the envelope was the culprit, not the curve.
    L.r3c = function (g, at) {
      creak3(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 1.0, { geo: false, wander: 0, swell: true });
    };

    return L;
  }

  // Registry the page and the measure script both read, so they can never
  // disagree about what "round 1 candidate B" is.
  var CATALOG = [
    { id: 'r1a', round: 1, label: 'A — FLOORBOARD', dur: 0.52,
      blurb: 'Stick-slip pulse train, mid register (175-340 slips/sec) through dry wood resonances. The literal physics, played straight.' },
    { id: 'r1b', round: 1, label: 'B — DOOR GROAN', dur: 1.0,
      blurb: 'Same relaxation oscillator run so slowly (54-98/sec) you hear the individual slips fuse into a low growl. The material complaining, not the joint.' },
    { id: 'r1c', round: 1, label: 'C — RUSTY HINGE', dur: 0.42,
      blurb: 'No pulse train at all: noise through a swept high-Q resonator with a random-walk waver. Short, high, thin, unpleasant. VERDICT: reads as a scream — kept as the seed for scream work.' },

    { id: 'r2a', round: 2, label: 'A — BOUND BRIGHTNESS', dur: 1.0,
      blurb: 'Round 1\'s winner with its 1.9kHz lid taken off: five inharmonic wooden modes up to 2.4kHz, all rung by the slips themselves. No noise layer anywhere. Does "material" come from resonance rather than hiss?' },
    { id: 'r2b', round: 2, label: 'B — UNSTABLE REGIME', dur: 1.0,
      blurb: 'The joint JUMPS between release regimes — rate halving and doubling mid-creak — instead of gliding up. What a real nonlinear stick-slip oscillator does under load. Is the identity in the instability?' },
    { id: 'r2c', round: 2, label: 'C — MULTI-CONTACT', dur: 1.0, poly: true,
      blurb: 'Three slip generators at inharmonic rates, each surging on its own schedule, through one shared body. A board is not one joint. Does thickness come from several contacts beating?' },

    { id: 'r3a', round: 3, label: 'A — STRAIGHT CLIMB', dur: 1.0, pitchable: true,
      blurb: 'Linear in Hz, 92→172 slips/sec, random wander removed, then a hard drop below where it started. The plainest reading of "linear with a drop at the end".' },
    { id: 'r3b', round: 3, label: 'B — LINEAR TO THE EAR', dur: 1.0, pitchable: true,
      blurb: 'Same climb but geometric — constant semitones/sec. Pitch perception is logarithmic, so a straight line in Hz decelerates to the ear; this one SOUNDS even instead of measuring even.' },
    { id: 'r3c', round: 3, label: 'C — STEADY EFFORT', dur: 1.0, pitchable: true,
      blurb: 'Linear in Hz like A, but one long swell instead of four surges. If A still feels compound, the envelope re-attacking at ever-higher pitch was the culprit, not the curve.' }
  ];

  return { Lab: Lab, CATALOG: CATALOG };
}));
