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
      // Optional second excitation track carrying ONLY the strong slips, for
      // driving a squeal that bursts instead of sustaining. See o.exc below.
      var excD = null;
      if (o.exc) { o.exc.buffer = ctx.createBuffer(1, n, SR); excD = o.exc.buffer.getChannelData(0); }
      var relS = Math.max(2, Math.round((o.release === undefined ? 0.0007 : o.release) * SR));
      var jit = o.jitter === undefined ? 0.08 : o.jitter;
      var ajit = o.ampJitter === undefined ? 0.45 : o.ampJitter;
      var i = 0, wander = 0, mult = 1, chaos = 0;
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
        // Real creaks are EPISODIC: 43-86% of a reference recording has a stable
        // slip period and the rest is chatter with no period at all. o.chaos =
        // chance per cycle of falling into a scrape for a stretch of cycles.
        if (o.chaos && chaos <= 0 && Math.random() < o.chaos) chaos = Math.round(rnd(5, 18));
        var j2 = chaos > 0 ? Math.max(jit, 0.1) * 6 : jit;
        if (chaos > 0) chaos--;
        // INTERVAL DISTRIBUTION. Uniform ±10% jitter gives interval CV ~0.15 and
        // lag-1 correlation ~0.85 — a metronome that drifts. Real creaks measure
        // CV 0.53-0.96, skew +1.6 to +6.4, lag-1 0.06-0.39: many short intervals
        // with occasional long gaps, each drawn INDEPENDENTLY of the last. The
        // slip rate is the mean of a random point process, not a frequency.
        // o.cv = lognormal spread (skewed by construction, independent draws).
        // o.pause = chance of a long stall, which is what makes the skew big.
        var jf;
        if (o.cv) {
          var sig = Math.sqrt(Math.log(1 + o.cv * o.cv));
          var u1 = Math.max(1e-9, Math.random()), u2 = Math.random();
          var gs = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          jf = Math.exp(sig * gs - sig * sig / 2);
          if (o.pause && Math.random() < o.pause) jf *= rnd(3, 9);
          jf = Math.max(0.25, Math.min(12, jf));
        } else jf = 1 + rnd(-j2, j2);
        var per = Math.max(relS + 4, Math.round(SR / rate * mult * jf));
        var amp = 1 - Math.random() * ajit;
        // A harder release lets go faster, so brightness varies slip to slip.
        // The references' spectral centroid wobbles ±28-34% of its mean; a fixed
        // release gave 17%, a timbre that barely moves.
        var relC = o.relVar ? Math.max(2, Math.round(relS * (1.9 - amp))) : relS;
        var load = per - relC;
        // In a scrape there is no coherent release at all — the contact is
        // grinding continuously. Jittering the period alone was not enough:
        // autocorrelation still found a mean period, and the candidate measured
        // 100% periodic against references at 43-86%. The WAVEFORM has to stop
        // being a load-and-release for those stretches.
        if (chaos > 0) {
          var pv = 0;
          for (var k2 = 0; k2 < per && i < n; k2++, i++) {
            var w3 = Math.random() * 2 - 1;
            d[i] = amp * 0.8 * (w3 + pv * 1.4) * 0.42;
            pv = w3;
          }
        } else
        // The LOAD curve. Linear was an assumption from round 1 that six rounds
        // never questioned: elastic loading against a stiffening contact is not
        // necessarily a straight line. >1 = slow build then a rush into the
        // release; <1 = grabs immediately then eases.
        for (var k = 0; k < per && i < n; k++, i++) {
          d[i] = amp * (k < load
            ? (o.loadCurve ? Math.pow(k / load, o.loadCurve) : k / load) * 2 - 1
            : 1 - ((k - load) / relC) * 2);
        }
        // GRIT: noise at the moment of release, scaled by how hard that slip
        // was — the contact point shattering as it lets go. Broadband energy
        // BOUND to the event, which is the distinction round 1 taught: a
        // free-running noise bed detaches and becomes a whoosh.
        // Shaped, not white: a two-sample average rolls it off above ~5kHz.
        // Raw white grit measured 20% of total energy above 8kHz where the
        // references sit at 5-19% and mostly nearer the bottom of that — it
        // read as digital fizz sitting on top of the wood.
        if (o.grit) {
          var prevG = 0;
          for (var q = relC + 2; q >= 1 && i - q >= 0; q--) {
            var w2 = Math.random() * 2 - 1;
            d[i - q] += amp * o.grit * (w2 + prevG) * 0.5;
            prevG = w2;
          }
        }
        // SQUEAL EXCITATION — only the STRONG slips. Driving a high-Q resonator
        // from every slip cannot produce bursts: its ring time integrates across
        // several of them, smoothing away the very amplitude crackle that makes
        // the low part sound bursty, and at 100+ slips/sec the modulation is far
        // above the ~20Hz where the ear still hears separate events. Weighting
        // by amp^p (p≈4-8) means only the hardest releases set the squeal
        // ringing, so it speaks in bursts at a rate the ear can follow — and
        // those bursts land on the loud moments of the low part, because they
        // are the same slips.
        if (excD) {
          var wgt = Math.pow(amp, o.excPow || 4), len = relC + 3;
          for (var e2 = 0; e2 < len && i - 1 - e2 >= 0; e2++)
            excD[i - 1 - e2] += wgt * (1 - e2 / len);
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

    // ================================================================
    // ROUND 4 — the first round aimed at MEASURED targets instead of at my
    // intuition. Three real creak recordings profiled in reference/ say:
    //
    //   energy      <500Hz 17-29%   0.5-2k 24-33%   2-8k 33-44%   >8k 5-19%
    //   mine were   <500Hz 74-78%   0.5-2k 19-23%   2-8k   2-3%   >8k    0%
    //
    //   slip rate   30-150Hz, rising then collapsing to ~30% of peak
    //   mine were   32-160Hz  <- already correct
    //
    //   periodic    43-86% of the sound
    //   mine were   91-100%
    //
    // So the slip rate was never the problem. "It needs a higher pitch" was the
    // ear reporting a MISSING TOP END: real creaks put a third to a half of
    // their energy above 2kHz and mine put 3%. Round 1 confounded these — r1a
    // was bright (38% above 2k) but slipped far too fast, r1b had the right
    // rate and no top end, and "B won" was read as "go low" when only the RATE
    // needed to be low. This round separates them for the first time.
    // ================================================================

    // Read off creak3.mp3 by test/reference.js — a real thing's actual modes.
    // Note what is NOT here: nothing above 1.5kHz. The references' 2-8k energy
    // is broadband, not resonant, so it cannot come from the body at all — it
    // has to come from the excitation and reach the ear unfiltered.
    // Two adjustments to what was read off the file, both deliberate:
    //  * the low pair is pulled down. A straight copy measured 59% of energy
    //    below 500Hz against the references' 17-29% — the modes are right, the
    //    BALANCE in a recording is not something a resonance table carries.
    //  * the 861/1421 modes are widened from Q16/Q15. At that Q they pass almost
    //    no energy, and the references want 24-33% in the 0.5-2k band.
    var WOOD4 = [[129, 0.3, 1], [172, 0.62, 4], [323, 0.68, 4], [484, 0.55, 2],
                 [861, 0.62, 6], [1421, 0.6, 6], [2300, 0.34, 5]];

    // The direct path: the contact radiating straight out, not through the
    // wood. body() alone throws away everything that isn't near a mode, which
    // is exactly why my creaks measured 3% above 2kHz.
    function bright(input, g, hz) {
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = hz || 1300; hp.Q.value = 0.7;
      var lp = ctx.createBiquadFilter(); // no real object radiates flat to 20k
      lp.type = 'lowpass'; lp.frequency.value = 8500; lp.Q.value = 0.7;
      var gn = ctx.createGain(); gn.gain.value = g;
      input.connect(hp); hp.connect(lp); lp.connect(gn); gn.connect(dest);
    }

    function creak4(t, dur, g, o) {
      var src = ctx.createBufferSource();
      src.buffer = slipBuffer(dur, rate3(false),
        { jitter: 0.10, ampJitter: 0.6, wander: 0, release: o.rel, grit: o.grit,
          chaos: o.chaos, regime: 0.012, regimeSet: [0.72, 1, 1, 1.38] });
      var env = ctx.createGain();
      surge(env.gain, t, dur, g * 0.55, o.swells || 6, 0.05, 0.97);
      src.connect(env);
      body(env, WOOD4, dest);
      bright(env, o.bright, o.brightHz);
      src.start(t); src.stop(t + dur + 0.02);
      loadThump(t, 72, g * 0.4);
      loadThump(t + dur * 0.95, 62, g * 0.22);
    }

    // R4-A "SHARP RELEASE" — brightness from release time alone. 0.4ms → 0.08ms
    // moves the excitation's rolloff from ~1.2kHz to ~6kHz. The cleanest test of
    // the hypothesis that release sharpness IS the material's hardness.
    L.r4a = function (g, at) {
      creak4(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 0.83,
        { rel: 0.00008, bright: 0.5 });
    };

    // R4-B "PER-SLIP GRIT" — moderate release, but every release throws a burst
    // of noise scaled to how hard that slip was. Same top end, arrived at by
    // event-bound noise rather than by a sharper edge.
    L.r4b = function (g, at) {
      creak4(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 0.72,
        { rel: 0.0004, grit: 0.95, bright: 0.7 });
    };

    // R4-C "EPISODIC" — R4-B plus the intermittency the references show:
    // stretches where the joint stops slipping cleanly and just chatters. The
    // references run 43-86% periodic; every candidate I have built runs ~100%.
    L.r4c = function (g, at) {
      creak4(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 0.83,
        { rel: 0.0004, grit: 0.95, bright: 0.7, chaos: 0.045, swells: 8 });
    };

    // ================================================================
    // ROUND 5 — round 4's A and B were closest but "still not quite creaks",
    // and the rate needs to work DOWN, not up. Deep analysis (test/deep.js)
    // found where mine and real actually diverge, and it is not the spectrum:
    //
    //                       real            mine (r3/r4)
    //   interval CV         0.53 - 0.96     0.13 - 0.22
    //   interval skew       +1.6 - +6.4     +0.7 - +1.9
    //   lag-1 correlation   0.06 - 0.39     0.30 - 0.87
    //   crest factor        15.6 - 17.9dB   12.7 - 15.7dB
    //
    // A real creak is not a pulse train at frequency f. It is a BURST PROCESS:
    // clusters of quick slips broken by irregular stalls, each interval drawn
    // independently of the last. Uniform ±10% jitter around a gliding rate
    // produces a metronome by comparison — which is why every candidate so far
    // reads as a buzzing tone with a pitch rather than as discrete crackling.
    // ================================================================

    // Falls. creak1 runs 143→44Hz across its whole length and creak3 ends at
    // 44Hz — the joint is losing its grip, not winding up. Everything before
    // round 5 climbed, on an assumption I never checked against the recordings.
    function rate5(u) {
      var p = L.pitch;
      if (u < 0.08) return p * (112 + 44 * (u / 0.08));      // the initial catch
      var x = (u - 0.08) / 0.92;
      return p * (156 - 112 * Math.pow(x, 0.75));            // and then it lets go
    }

    function creak5(t, dur, g, o) {
      var src = ctx.createBufferSource();
      src.buffer = slipBuffer(dur, rate5,
        { ampJitter: o.ampJitter || 0.6, wander: 0, release: 0.00008,
          cv: o.cv, pause: o.pause, grit: o.grit, regime: 0.012, regimeSet: [0.72, 1, 1, 1.38] });
      var env = ctx.createGain();
      // 1.6-2.3Hz is the dominant surge rate in all three references — one or
      // two big swells per second, not the 4-8 I had been using.
      surge(env.gain, t, dur, g * 0.55, o.swells || 2, 0.05, 0.97);
      src.connect(env);
      body(env, WOOD4, dest);
      bright(env, o.bright === undefined ? 0.5 : o.bright);
      src.start(t); src.stop(t + dur + 0.02);
      loadThump(t, 72, g * 0.4);
      loadThump(t + dur * 0.95, 62, g * 0.22);
    }

    // R5-A "HEAVY-TAILED" — intervals drawn from a lognormal at CV 0.7, each
    // independent of the last. Same mean rate, same spectrum, but the timing
    // statistics of a real joint instead of a jittered metronome.
    L.r5a = function (g, at) {
      creak5(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 0.384, { cv: 0.7 });
    };

    // R5-B "BURSTS AND STALLS" — tighter clusters (CV 0.35) but a 7% chance per
    // slip of stalling for 3-9× the interval. This is the +5 skew made explicit:
    // mostly quick slipping, punctuated by the joint catching and holding.
    L.r5b = function (g, at) {
      creak5(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 0.451,
        { cv: 0.35, pause: 0.07 });
    };

    // R5-C "SPARSE AND HARD" — fewer, harder, better separated releases, aimed
    // at the references' 16-18dB crest factor. Closer to discrete crackling
    // than to a tone: the slips are events you can almost count.
    L.r5c = function (g, at) {
      creak5(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 0.527,
        { cv: 0.85, pause: 0.05, ampJitter: 0.85, bright: 0.62 });
    };

    // ================================================================
    // ROUND 6 — "these sound NOTHING like a creak", so measure everything.
    // test/full.js profiles structure, envelope shape, spectral moments, per-
    // band modulation, periodicity, decay and impulsiveness. Three gaps, none
    // of which any previous round had looked at, and all three are large:
    //
    //                        real            mine (r4a/r5b)
    //   decay to -40dB       0.25 - 0.32s    0.03 - 0.05s     ~10x too short
    //   0.7-2kHz energy      19 - 38%        4 - 6%           the big hole
    //   60-250Hz energy      27 - 39%        67 - 75%         far too bass-heavy
    //   zero crossings       1845 - 3708/s   328 - 587/s
    //   envelope peak at     30 - 52%        0%               mine front-load
    //
    // The decay is the interesting one. 250-300ms of tail is not wood ringing —
    // no plausible Q on a 1kHz mode holds that long — it is the ROOM the
    // recording was made in. Every candidate so far has been bone dry, and a
    // bone dry sound reads as synthetic no matter how right its spectrum is.
    // ================================================================

    // Rebalanced hard toward the mids. The mode FREQUENCIES still come from the
    // recordings; the gains are set to hit the measured band energies, because
    // a resonance table carries frequencies and not balance.
    var WOOD6 = [[129, 0.09, 2], [172, 0.16, 4], [323, 0.26, 4], [484, 0.4, 3],
                 [861, 0.95, 5], [1180, 1.0, 5], [1560, 0.95, 5], [2300, 0.66, 4]];

    // A room, built procedurally: exponentially decaying noise, damped so the
    // tail is darker than the source. This is what the reference recordings have
    // that every candidate of mine has lacked.
    var _ir = {};
    function roomIR(dur, decay, damp) {
      var key = dur + '/' + decay + '/' + damp;
      if (_ir[key]) return _ir[key];
      var n = Math.round(dur * SR), b = ctx.createBuffer(2, n, SR);
      for (var c = 0; c < 2; c++) {
        var d = b.getChannelData(c), lp = 0;
        for (var i = 0; i < n; i++) {
          var e = Math.pow(1 - i / n, decay);
          lp += damp * ((Math.random() * 2 - 1) * e - lp);
          d[i] = lp;
        }
      }
      _ir[key] = b;
      return b;
    }
    function room(input, wet, dur, decay, damp) {
      var cv = ctx.createConvolver();
      cv.buffer = roomIR(dur, decay, damp); cv.normalize = true;
      var g = ctx.createGain(); g.gain.value = wet;
      input.connect(cv); cv.connect(g); g.connect(dest);
    }

    // An ARCH, not a front-loaded decay. Every reference peaks 30-52% of the way
    // through; mine all peaked at 0% because the contact thump and the envelope
    // attack both landed at t=0. Random humps ride on top of the arch so it
    // still surges.
    function arch(param, t, dur, peak, humps, peakAt) {
      peakAt = peakAt || 0.45;
      param.setValueAtTime(0.0001, t);
      var steps = Math.max(4, humps * 2);
      for (var i = 1; i <= steps; i++) {
        var u = i / steps;
        var a = u < peakAt ? Math.pow(u / peakAt, 0.85)
                           : Math.pow(1 - (u - peakAt) / (1 - peakAt), 0.75);
        param.linearRampToValueAtTime(Math.max(peak * 0.04, peak * a * rnd(0.5, 1.0)), t + dur * 0.97 * u);
      }
      param.exponentialRampToValueAtTime(0.0001, t + dur);
    }

    function creak6(t, dur, g, o) {
      var src = ctx.createBufferSource();
      src.buffer = slipBuffer(dur, rate5,
        { ampJitter: 0.55, jitter: 0.16, wander: 0.01, release: 0.00012,
          grit: 0.35, relVar: 1, regime: 0.012, regimeSet: [0.72, 1, 1, 1.38] });
      var env = ctx.createGain();
      arch(env.gain, t, dur, g * 0.55, 4, 0.45);
      src.connect(env);
      body(env, WOOD6, dest);
      bright(env, 0.5, 1500);
      // FRICTION BED. Round 1 taught that a free-running noise layer detaches
      // into a whoosh — but that layer sat at 3.1kHz, in a spectral region of
      // its own. The references cross zero 1845-3708 times/sec where a pure
      // impulse train manages 600, and no amount of EQ closes that: there is
      // continuous broadband contact noise BETWEEN the slips. Kept inside the
      // body's own mid region so it colours the wood instead of floating over it.
      if (o.friction) {
        var ns = ctx.createBufferSource(); ns.buffer = noiseBuf(); ns.loop = true;
        var nf = ctx.createBiquadFilter(); nf.type = 'bandpass';
        nf.frequency.value = 1250; nf.Q.value = 0.8;
        var ne = ctx.createGain();
        arch(ne.gain, t, dur, g * o.friction, 4, 0.45);
        ns.connect(nf); nf.connect(ne); ne.connect(dest);
        if (o.room) room(ne, o.room * 0.8, o.roomDur || 0.26, o.roomDecay || 3, o.roomDamp || 0.35);
        ns.start(at0(t), Math.random() * 1.5); ns.stop(t + dur + 0.02);
      }
      if (o.room) room(env, o.room, o.roomDur || 0.26, o.roomDecay || 3, o.roomDamp || 0.35);
      src.start(t); src.stop(t + dur + 0.02);
      // much quieter contact than before, and no settle thump: both were putting
      // the envelope peak at 0% where the references put it near the middle
      loadThump(t, 72, g * 0.12);
    }

    // R6-A "MID-FORWARD, DRY" — the EQ fix alone. 0.7-2kHz brought up from 4-6%
    // toward the references' 19-38%, bass pulled down from 67-75% toward 27-39%,
    // envelope arched to peak in the middle. No room, so this isolates whether
    // the spectrum and the gesture were the problem.
    L.r6a = function (g, at) {
      creak6(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 0.72, {});
    };

    // R6-B "IN A ROOM" — A plus the 0.3s tail every reference has and no
    // candidate of mine ever had. If dryness is what has been reading as
    // synthetic, this is where it stops.
    L.r6b = function (g, at) {
      creak6(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 0.72,
        { room: 0.5, roomDur: 0.26, roomDecay: 3, roomDamp: 0.35 });
    };

    // R6-C "ROOM + MOVING TIMBRE" — B, plus the release sharpness of each slip
    // scaling with how hard that slip is, so harder releases are brighter. The
    // references' centroid wobbles ±28-34% of its mean; r4a managed 17%, i.e.
    // its timbre barely moves. Physically this is just: a harder release lets go
    // faster.
    L.r6c = function (g, at) {
      creak6(ctx.currentTime + (at || 0), 1.0, (g === undefined ? 1 : g) * 0.63,
        { room: 0.5, roomDur: 0.26, roomDecay: 3, roomDamp: 0.35, friction: 0.13 });
    };

    // ================================================================
    // ROUND 7 — A and B are close; C's friction bed is out. Ten variations on
    // the A/B base, varying things one at a time INCLUDING several I had frozen
    // since round 2 and never questioned: the duration, the slip-rate range,
    // the shape of the load ramp, and what the body is made of.
    //
    // v1 and v2 are the unchanged controls, so anything that improves has to
    // beat them and not just differ from them.
    // ================================================================

    // creak1.mp3's body instead of creak3.mp3's — a different object entirely,
    // rebalanced the same way (a resonance table carries frequencies, not levels).
    var WOOD7B = [[43, 0.12, 1], [129, 0.16, 2], [205, 0.3, 4], [301, 0.34, 2],
                  [1023, 1.0, 8], [1550, 0.85, 6], [2400, 0.5, 5]];

    function creak7(t, o) {
      var dur = o.dur || 1.0;
      var g = (o.g === undefined ? 1 : o.g) * (o.trim || 1);
      var lo = o.rateLo === undefined ? 44 : o.rateLo;
      var hi = o.rateHi === undefined ? 156 : o.rateHi;
      var rate = function (u) {
        var p = L.pitch;
        if (u < 0.08) return p * (lo + (hi - lo) * 0.72 * (u / 0.08));
        return p * (hi - (hi - lo) * Math.pow((u - 0.08) / 0.92, 0.75));
      };
      var src = ctx.createBufferSource();
      var exc = o.squealBurst ? {} : null;
      src.buffer = slipBuffer(dur, rate,
        { ampJitter: o.ampJitter || 0.55, jitter: 0.16, wander: 0.01,
          release: o.release || 0.00012, grit: o.grit === undefined ? 0.35 : o.grit,
          relVar: 1, loadCurve: o.loadCurve, regime: 0.012, regimeSet: [0.72, 1, 1, 1.38],
          exc: exc, excPow: o.squealBurst });
      var env = ctx.createGain();
      arch(env.gain, t, dur, g * 0.55, o.humps || 4, o.peakAt || 0.45);
      src.connect(env);
      var wood = (o.wood || WOOD6).map(function (f) {
        return o.qMul ? [f[0], f[1], f[2] * o.qMul] : f;
      });
      body(env, wood, dest);
      bright(env, o.bright === undefined ? 0.5 : o.bright, 1500);
      // THE SQUEAL. One very high-Q resonance driven by the SAME slip source,
      // gliding down with the gesture. Deliberately not a separate voice layered
      // over the top: round 1 established that an independent layer detaches and
      // becomes its own object (a whoosh then, a scream when it was high and
      // sustained). Excited by the slips, it is a squeaky mode OF the joint.
      // The small random walk on its frequency is what makes it read as a fault
      // rather than as a performance — an LFO here would sound like vibrato.
      if (o.squeal) {
        var hz = o.squealHz || [2300, 1350];
        var addSqueal = function (ratio, gain) {
          var sq = ctx.createBiquadFilter();
          sq.type = 'bandpass'; sq.Q.value = o.squealQ || 26;
          var w = 0;
          for (var st = 0; st <= dur; st += 0.012) {
            var u = st / dur;
            w = w * 0.75 + rnd(-1, 1) * 0.045;
            // TRACK THE SLIPS. Given its own glide the squeal fell 1.7x while
            // the joint under it fell 3.5x, on a different curve — so it read as
            // a separate tone laid over the creak instead of the same joint
            // heard higher up. Following the slip contour makes it slip too:
            // same shape, same catch, same collapse, an octave and a half up.
            var f = o.squealTrack
              ? hz[0] * Math.pow(rate(u) / rate(0.08), o.squealTrack)
              : hz[0] * Math.pow(hz[1] / hz[0], u);
            sq.frequency.setValueAtTime(Math.max(300, f * ratio * (1 + w)), at0(t + st));
          }
          var sg = ctx.createGain(); sg.gain.value = g * gain;
          if (exc) {
            // Driven by the strong-slip track, with the same arch over it so it
            // still belongs to the gesture.
            var es = ctx.createBufferSource(); es.buffer = exc.buffer;
            var ee = ctx.createGain();
            arch(ee.gain, t, dur, 1, o.humps || 4, o.peakAt || 0.45);
            es.connect(ee); ee.connect(sq);
            es.start(t); es.stop(t + dur + 0.02);
          } else env.connect(sq);
          sq.connect(sg); sg.connect(dest);
          if (o.room) room(sg, o.room * 0.9, o.roomDur || 0.26, o.roomDecay || 3, o.roomDamp || 0.35);
        };
        addSqueal(1, o.squeal);
        // A second mode. One narrow resonance turned up far enough starts to
        // read as a sine sitting in the mix; a real squeaking joint has more
        // than one squeaking mode, and 1.5x is inharmonic enough not to fuse
        // into a musical interval.
        if (o.squeal2) addSqueal(o.squeal2Ratio || 1.5, o.squeal2);
      }
      if (o.room) room(env, o.room, o.roomDur || 0.26, o.roomDecay || 3, o.roomDamp || 0.35);
      src.start(t); src.stop(t + dur + 0.02);
      if (o.thump !== 0) loadThump(t, 72, g * (o.thump === undefined ? 0.12 : o.thump));
    }
    function v(o, trim) {
      return function (g, at) {
        o.g = (g === undefined ? 1 : g); o.trim = trim;
        creak7(ctx.currentTime + (at || 0), o);
      };
    }

    L.v1  = v({ }, 0.953);                                        // control, dry
    L.v2  = v({ room: 0.5 }, 0.993);                              // control, room
    L.v3  = v({ room: 0.5, dur: 0.5 }, 0.974);                    // half as long
    L.v4  = v({ room: 0.5, dur: 1.8, humps: 6 }, 0.945);          // nearly twice as long
    L.v5  = v({ room: 0.5, rateLo: 22, rateHi: 70 }, 1.268);      // much slower slipping
    L.v6  = v({ room: 0.5, rateLo: 95, rateHi: 300 }, 0.755);     // much faster slipping
    L.v7  = v({ room: 0.5, loadCurve: 2.2 }, 0.934);              // elastic load curve
    L.v8  = v({ room: 0.22, qMul: 4 }, 1.855);                     // the WOOD rings, less room
    L.v9  = v({ room: 0.5, wood: WOOD7B }, 1.089);                // a different object
    L.v10 = v({ room: 0.5, peakAt: 0.2, humps: 1, thump: 0 }, 0.966); // one early swell, no contact

    // ---------- ROUND 8 — v8 + v9 ----------
    // A body that RINGS (Q ×4, little room) built from creak1.mp3's
    // 1023Hz-dominant object instead of creak3's 172Hz one. v6's fast slipping
    // is OUT: the rate is back to the base 156→44/sec, which is where the
    // references actually sit.
    //
    // So the one thing this still walks back from the measurements is where the
    // tail comes from — the object rather than the room. That is the live
    // question in this round, and v12/v13 bracket it.
    //
    // v11 is the combination as asked. v12-v14 sit around it, because a single
    // sound with nothing beside it is hard to judge.
    var COMBO = { wood: WOOD7B, qMul: 4, room: 0.22 };
    function combo(over, trim) {
      var o = {};
      Object.keys(COMBO).forEach(function (k) { o[k] = COMBO[k]; });
      Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
      return v(o, trim);
    }
    L.v11 = combo({}, 1.813);                            // exactly v8 + v9
    L.v12 = combo({ room: 0.5 }, 1.630);                 // ... with v9's fuller room back
    L.v13 = combo({ qMul: 8, room: 0.1 }, 2.199);        // ... ringing harder, nearly no room
    L.v14 = combo({ rateLo: 32, rateHi: 110 }, 2.060);   // ... slower than base, since fast is out

    // ---------- ROUND 9 — v7 + v9 + v10 ----------
    // The elastic load curve (the stick phase builds on a curve, rushing into
    // the release), creak1's 1023Hz-dominant object, and the single early swell
    // with no contact thump — something giving way at once rather than being
    // worked. Room stays at v7/v9/v10's level; the body does not ring.
    //
    // v16/v17 bracket the load curve, since it is the newest axis and the one
    // with the least evidence behind it — it was added last round and has only
    // ever been heard at a single value. v18 bridges to the round-8 combination
    // by adding v8's ringing body on top.
    var COMBO2 = { room: 0.5, loadCurve: 2.2, wood: WOOD7B, peakAt: 0.2, humps: 1, thump: 0 };
    function combo2(over, trim) {
      var o = {};
      Object.keys(COMBO2).forEach(function (k) { o[k] = COMBO2[k]; });
      Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
      return v(o, trim);
    }
    L.v15 = combo2({}, 1.076);                              // exactly v7 + v9 + v10
    L.v16 = combo2({ loadCurve: 3.6 }, 1.079);              // ... load curve much stronger
    L.v17 = combo2({ loadCurve: 1.4 }, 1.150);              // ... load curve much milder
    L.v18 = combo2({ qMul: 4, room: 0.22 }, 1.953);         // ... plus v8's ringing body

    // ---------- ROUND 10 — v17 as the base, + squeal, + v14 ----------
    // v17 won round 9, so the load curve STAYS at 1.4 — not pushed further
    // toward straight. "Don't amplify what it did best" is the opposite of what
    // I did in earlier rounds, where a winning axis got pushed until it broke
    // (round 2's brightness, round 5's interval spread), and it is the better
    // instinct: a value that wins a bracket is evidence about that value, not a
    // direction to keep travelling in.
    //
    // Two new ingredients, crossed with each other:
    //   SQUEAL  a high-Q joint mode driven by the slips, gliding 2300→1350Hz
    //   v14     its slower rate (110→32) AND its ringing body (Q ×4, less room),
    //           tried separately as well as together — v14 was two changes at
    //           once and there is no evidence yet about which of them mattered
    var V17 = { room: 0.5, loadCurve: 1.4, wood: WOOD7B, peakAt: 0.2, humps: 1, thump: 0 };
    var SLOW = { rateLo: 32, rateHi: 110 };            // v14's rate
    var RING = { qMul: 4, room: 0.22 };                // v14's body
    function mix() {
      var o = {}, i, a;
      for (i = 0; i < arguments.length; i++) {
        a = arguments[i];
        Object.keys(a).forEach(function (k) { o[k] = a[k]; });
      }
      return o;
    }
    function base17(over, trim) { return v(mix(V17, over || {}), trim); }

    L.v19 = base17({}, 1.044);                                   // control = v17
    L.v20 = base17({ squeal: 0.5 }, 1.049);                      // + light squeal
    L.v21 = base17({ squeal: 1.1 }, 1.053);                      // + stronger squeal
    L.v22 = base17(SLOW, 1.224);                                 // + v14's rate only
    L.v23 = base17(mix(SLOW, { squeal: 0.7 }), 1.165);           // + v14's rate + squeal
    L.v24 = base17(RING, 1.954);                                 // + v14's body only
    L.v25 = base17(mix(SLOW, RING), 2.545);                      // + all of v14
    L.v26 = base17(mix(SLOW, RING, { squeal: 0.7 }), 2.482);     // + all of v14 + squeal

    // ---------- ROUND 11 — the squeal slips, and a bit of v13 ----------
    // squealTrack ties the squeal's frequency to the slip contour instead of
    // giving it a glide of its own, so it grabs and lets go with the joint
    // rather than singing over it.
    //
    // v13's contribution is its BODY: resonances twice as narrow again (Q ×8)
    // with the room almost gone. v26 already carries v14's Q ×4 / room 0.22, so
    // "a bit of v13" is the step between them, and v31 goes all the way for the
    // bracket.
    var TRACK = { squeal: 0.7, squealTrack: 1, squealHz: [2300] };
    var V13BODY = { qMul: 8, room: 0.1 };
    var HALF13  = { qMul: 6, room: 0.16 };

    L.v27 = base17(mix(TRACK, { squeal: 0.5 }), 1.07);            // slipping squeal, no v14
    L.v28 = base17(mix(SLOW, RING, TRACK), 2.005);                 // v26 with the squeal fixed
    L.v29 = base17(mix(SLOW, RING, TRACK, HALF13), 2.189);         // ... + a bit of v13
    L.v30 = base17(mix(SLOW, RING, TRACK, V13BODY), 2.278);        // ... + all of v13's body
    L.v31 = base17(mix(SLOW, RING, TRACK, HALF13, { squeal: 1.2 }), 1.826); // ... squeal pushed

    // ---------- ROUND 12 — v27, squeal much louder ----------
    // v27 had it at 0.5. These run 2.4x, 5x and 9x that, bracketed rather than
    // guessed at a single value, because "much louder" has a wide range and
    // round 1 found this register has a ceiling somewhere — though it found it
    // with a squeal that SUSTAINED, and this one stops and starts with the
    // joint, so the ceiling may well sit somewhere else entirely.
    //
    // Everything stays level-matched, which is the point: turning the squeal up
    // pushes the low part DOWN in the mix, and that trade is exactly what is
    // being judged. An unmatched version would just be a louder sound.
    var V27 = mix(TRACK, {});
    L.v32 = base17(mix(V27, { squeal: 1.2 }), 1.073);   // 2.4x v27
    L.v33 = base17(mix(V27, { squeal: 2.5 }), 1.01);   // 5x
    L.v34 = base17(mix(V27, { squeal: 4.5 }), 0.855);   // 9x
    L.v35 = base17(mix(V27, { squeal: 2.5, squeal2: 1.4 }), 0.91); // 5x + a second mode
    // Tracking the slips FULLY means the squeal falls 3.5x as well — 2300Hz down
    // to about 650, which is out of squeal register and inside the body. The lab
    // caught it: at nine times the level the spectral centroid did not move,
    // because the squeal spends most of its life below 1kHz. Inaudible at v27's
    // level; the loudest thing in the sound at five times that. Half-tracking
    // keeps it slipping with the joint — same shape, same catch, same collapse —
    // while it stays up where a squeal lives, bottoming out near 1200Hz.
    L.v36 = base17(mix(V27, { squeal: 2.5, squealTrack: 0.55 }), 0.929);

    // ---------- ROUND 13 — the squeal BURSTS ----------
    // Every squeal so far was driven by every slip, which cannot burst: a Q=26
    // resonator rings across several slips and smooths away the amplitude
    // crackle that makes the low part sound bursty, and at 100+ slips/sec that
    // modulation sits far above the ~20Hz where the ear still hears separate
    // events. So it fused into a tone no matter how it was tracked or tuned.
    //
    // Now the squeal is driven by a separate excitation carrying ONLY the strong
    // slips (weighted amp^p), so it speaks in bursts at a rate the ear can
    // follow — and those bursts land on the loud moments of the low part,
    // because they are literally the same slips.
    // Burst drive is a short impulse per STRONG slip, so it hands the resonator
    // far less energy than the continuous slip stream did. At gain 2.5 it
    // measured 27% of energy in the squeal band — exactly what v27 measured with
    // the squeal barely present — while the sustained version at ×5 reached 42%.
    // Burst gains are therefore several times larger for the same audible
    // presence, and these numbers are NOT comparable to the sustained rounds'.
    var BURST = mix(V27, { squeal: 8, squealBurst: 4 });
    L.v37 = base17(BURST, 0.943);                                          // bursting squeal
    L.v38 = base17(mix(BURST, { squealBurst: 9 }), 1.034);                 // sparser, only the hardest
    L.v39 = base17(mix(BURST, { squealQ: 45 }), 1.033);                    // each burst rings longer
    L.v40 = base17(mix(BURST, { squeal: 16 }), 0.683);                      // bursts twice as loud
    L.v41 = base17(mix(BURST, { squealTrack: 0.55 }), 0.877);              // bursts + v36's half-track

    // ---------- ROUND 14 — twelve variations on v27 ----------
    // One clean change each, across axes that have never been varied ON v27:
    // where the squeal sits and how narrow it is, how much grit, how sharp the
    // release, how uneven the slips are, how far the rate falls (as opposed to
    // where it starts), the room, and the gesture. v27 itself is the control,
    // already on the page in round 11.
    var V27FULL = mix(V17, TRACK, { squeal: 0.5 });

    L.v42 = base17(mix(V27FULL, { squealHz: [3200] }), 1.082);        // squeal sits higher
    L.v43 = base17(mix(V27FULL, { squealHz: [1600] }), 1.074);        // squeal sits lower
    L.v44 = base17(mix(V27FULL, { squealQ: 12 }), 1.09);             // squeal broader, more airy
    L.v45 = base17(mix(V27FULL, { squealQ: 45 }), 1.05);             // squeal narrower, more pure
    L.v46 = base17(mix(V27FULL, { grit: 0 }), 1.137);                 // no per-slip grit at all
    L.v47 = base17(mix(V27FULL, { grit: 0.85 }), 1.039);              // heavy grit
    L.v48 = base17(mix(V27FULL, { release: 0.0005 }), 1.289);         // blunter release (softer material)
    L.v49 = base17(mix(V27FULL, { ampJitter: 0.85 }), 1.294);         // very uneven slip strengths
    L.v50 = base17(mix(V27FULL, { rateLo: 30, rateHi: 200 }), 1.041); // the rate falls much further
    L.v51 = base17(mix(V27FULL, { rateLo: 65, rateHi: 120 }), 1.124); // ... and much less far
    L.v52 = base17(mix(V27FULL, { room: 0 }), 1.162);                 // bone dry
    L.v53 = base17(mix(V27FULL, { peakAt: 0.45, humps: 4, thump: 0.12 }), 1.029); // worked, not given way

    // ---------- ROUND 15 — v47 compacted to 0.5s ----------
    // "Compact into 0.5s" has two readings and they do not sound alike. The rate
    // contour is defined over the sound's own length, so halving the duration
    // COMPRESSES it: the same 156→44 fall happens twice as fast. The other
    // reading is TRUNCATION — the joint falls at the rate it always did and the
    // sound simply stops early, ending around 78 instead of 44.
    //
    // And one thing that does not scale by itself: the room. A 0.26s tail on a
    // 1.0s sound is a quarter of it; on a 0.5s sound it is half, so the shorter
    // version is proportionally far wetter unless the room is shortened too.
    var V47 = mix(V27FULL, { grit: 0.85 });
    L.v54 = base17(mix(V47, { dur: 0.5 }), 1.149);                                  // compressed
    L.v55 = base17(mix(V47, { dur: 0.5, rateLo: 78 }), 1.038);                      // truncated
    L.v56 = base17(mix(V47, { dur: 0.5, roomDur: 0.14 }), 1.038);                   // compressed + room scaled
    L.v57 = base17(mix(V47, { dur: 0.5, roomDur: 0.14, rateLo: 60, rateHi: 200 }), 1.066); // ... and quicker slipping

    // ---------- ROUND 16 — v46 compacted to 0.5s ----------
    // Same four treatments as round 15, on the grit-free version. Worth its own
    // set rather than assuming round 15's answer carries over: v46 and v47 sit
    // at opposite ends of the grit axis, and grit is broadband energy at the
    // moment of release — the part of the sound most affected by having half as
    // long to happen in.
    var V46 = mix(V27FULL, { grit: 0 });
    L.v58 = base17(mix(V46, { dur: 0.5 }), 1.121);                                  // compressed
    L.v59 = base17(mix(V46, { dur: 0.5, rateLo: 78 }), 1.053);                      // truncated
    L.v60 = base17(mix(V46, { dur: 0.5, roomDur: 0.14 }), 1.111);                   // compressed + room scaled
    L.v61 = base17(mix(V46, { dur: 0.5, roomDur: 0.14, rateLo: 60, rateHi: 200 }), 0.958); // ... and quicker slipping

    // ---------- ROUND 17 — a two-part gesture ----------
    // v60 slowed down, with a shorter, higher, squealier creak in front of it.
    // First time anything here has been more than a single event: the same joint
    // catching once high and quick, then again low and slow. Duration is free
    // this round, so the parts are placed by what the gesture wants.
    //
    // The variable that actually matters is the GAP. Above roughly 150ms the ear
    // hears two separate events; below about 50ms they fuse into one gesture
    // with a squeal at its front. That boundary is perceptual, not physical, and
    // it is the thing these variations bracket.
    function seq(parts, trim) {
      return function (g, at) {
        var t = ctx.currentTime + (at || 0);
        parts.forEach(function (p) {
          var o = mix(p.o, {});
          o.g = (g === undefined ? 1 : g) * (p.gain === undefined ? 1 : p.gain);
          o.trim = trim;
          creak7(at0(t + p.at), o);
        });
      };
    }
    var SLOWMAIN = mix(V46, { dur: 0.5, roomDur: 0.14, rateLo: 30, rateHi: 100 });
    var PRE      = mix(V46, { dur: 0.3, roomDur: 0.14, rateLo: 150, rateHi: 320,
                              squealHz: [3600], squeal: 0.7, peakAt: 0.3 });
    var PREHIGH  = mix(PRE, { rateLo: 200, rateHi: 420, squealHz: [4800], squeal: 0.9 });

    // All five share ONE trim instead of being normalised individually. The
    // variable this round is the LEAD-IN — its gap, its pitch, its level — so
    // the main creak has to be identical across them. Normalising each variant
    // to the same total would have raised v66's main part by ~3dB to make up for
    // its quieter lead-in, which is exactly the comparison being run.
    L.v62 = seq([{ at: 0, o: PRE }, { at: 0.36, o: SLOWMAIN }], 1.088);              // small gap
    L.v63 = seq([{ at: 0, o: PRE }, { at: 0.50, o: SLOWMAIN }], 1.088);              // clearly two events
    L.v64 = seq([{ at: 0, o: PRE }, { at: 0.25, o: SLOWMAIN }], 1.088);              // overlapping, one gesture
    L.v65 = seq([{ at: 0, o: PREHIGH }, { at: 0.36, o: SLOWMAIN }], 1.088);          // pre much higher
    L.v66 = seq([{ at: 0, o: PRE, gain: 0.55 }, { at: 0.36, o: SLOWMAIN }], 1.088);  // pre only a hint

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
      blurb: 'Linear in Hz like A, but one long swell instead of four surges. If A still feels compound, the envelope re-attacking at ever-higher pitch was the culprit, not the curve.' },

    { id: 'r4a', round: 4, label: 'A — SHARP RELEASE', dur: 1.0, pitchable: true,
      blurb: 'Real creaks put 33-44% of their energy above 2kHz; mine put 3%. Here the top end comes from the release edge alone — 0.4ms sharpened to 0.08ms, which moves the excitation rolloff from 1.2kHz to 6kHz. Body modes read off a real recording.' },
    { id: 'r4b', round: 4, label: 'B — PER-SLIP GRIT', dur: 1.0, pitchable: true,
      blurb: 'Same top end reached differently: every release throws a burst of noise scaled to how hard that slip was — the contact shattering as it lets go. Noise bound to the events, never a free-running layer.' },
    { id: 'r4c', round: 4, label: 'C — EPISODIC', dur: 1.0, pitchable: true,
      blurb: 'B plus the intermittency the recordings show: stretches where the joint stops slipping cleanly and just chatters. References run 43-86% periodic; every candidate before this ran ~100%.' },

    { id: 'r5a', round: 5, falls: true, label: 'A — HEAVY-TAILED', dur: 1.0, pitchable: true,
      blurb: 'The rate now FALLS (156→44), and intervals are drawn from a lognormal at CV 0.7, each independent of the last. Real creaks measure CV 0.53-0.96; every candidate before this measured 0.13-0.22 — a metronome by comparison.' },
    { id: 'r5b', round: 5, falls: true, label: 'B — BURSTS AND STALLS', dur: 1.0, pitchable: true,
      blurb: 'Tighter clusters, but a 7% chance per slip of the joint catching and holding for 3-9× the interval. This is the references\' +5 skew made explicit: quick slipping, punctuated by stalls.' },
    { id: 'r5c', round: 5, falls: true, irregular: true, label: 'C — SPARSE AND HARD', dur: 1.0, pitchable: true,
      blurb: 'Fewer, harder, better-separated releases, aimed at the references\' 16-18dB crest factor against my 12-15. Closer to discrete crackling than to a tone — slips you can almost count.' },

    { id: 'r6a', round: 6, falls: true, label: 'A — MID-FORWARD, DRY', dur: 1.0, pitchable: true,
      blurb: 'The EQ and gesture fix alone. 0.7-2kHz raised from 4-6% to 38% (references: 19-38%), bass cut from 67-75% to 30% (references: 27-39%), and the envelope arched to peak halfway through instead of at the very start. Still bone dry.' },
    { id: 'r6b', round: 6, falls: true, label: 'B — IN A ROOM', dur: 1.0, pitchable: true,
      blurb: 'A plus the 0.3s decay tail every reference has and no candidate of mine ever had. 250-300ms is far too long for wood to ring — it is the room the recording was made in, and being bone dry may be what has read as synthetic all along.' },
    { id: 'r6c', round: 6, falls: true, label: 'C — ROOM + FRICTION BED', dur: 1.0, pitchable: true,
      blurb: 'B plus continuous contact noise between the slips, sitting inside the body\'s own mid region. Real creaks cross zero 1845-3708 times/sec; a pure impulse train manages 600 and no EQ closes that gap. This one measures 2890.' },

    { id: 'v1',  round: 7, falls: true, label: 'v1 — CONTROL, DRY', dur: 1.0, pitchable: true,
      blurb: 'Round 6 A unchanged. The control: anything below has to beat this, not merely differ from it.' },
    { id: 'v2',  round: 7, falls: true, label: 'v2 — CONTROL, ROOM', dur: 1.0, pitchable: true,
      blurb: 'Round 6 B unchanged. The other control.' },
    { id: 'v3',  round: 7, falls: true, label: 'v3 — HALF AS LONG', dur: 0.5, pitchable: true,
      blurb: 'Duration has been frozen at 1.0s since round 2 purely because the references averaged 1.04s. 0.5s.' },
    { id: 'v4',  round: 7, falls: true, label: 'v4 — NEARLY TWICE AS LONG', dur: 1.8, pitchable: true,
      blurb: 'The other end of the same frozen axis: 1.8s, with more swells to fill it.' },
    { id: 'v5',  round: 7, falls: true, label: 'v5 — MUCH SLOWER SLIPPING', dur: 1.0, pitchable: true,
      blurb: '70→22 slips/sec instead of 156→44. Below everything the references measured — worth knowing which side of them is better.' },
    { id: 'v6',  round: 7, falls: true, label: 'v6 — MUCH FASTER SLIPPING', dur: 1.0, pitchable: true,
      blurb: '300→95 slips/sec. Above everything the references measured, and close to round 1\'s A, which you said had the wrong material but was otherwise interesting.' },
    { id: 'v7',  round: 7, falls: true, label: 'v7 — ELASTIC LOAD CURVE', dur: 1.0, pitchable: true,
      blurb: 'The stick phase builds on a curve instead of a straight line — slow at first, rushing into the release. This is the shape of the excitation itself, assumed linear in round 1 and never questioned since.' },
    { id: 'v8',  round: 7, falls: true, label: 'v8 — THE WOOD RINGS', dur: 1.0, pitchable: true,
      blurb: 'Body resonances 4× narrower so the material itself rings, with much less room. Tests whether the tail wants to come from the object rather than the space.' },
    { id: 'v9',  round: 7, falls: true, label: 'v9 — A DIFFERENT OBJECT', dur: 1.0, pitchable: true,
      blurb: 'Body modes read off creak1.mp3 instead of creak3.mp3 — a 1023Hz-dominant object rather than a 172Hz-dominant one. Same mechanism, different thing creaking.' },
    { id: 'v10', round: 7, falls: true, label: 'v10 — ONE EARLY SWELL', dur: 1.0, pitchable: true,
      blurb: 'One swell peaking a fifth of the way in instead of four peaking halfway, and no contact thump at all. A different gesture: something that gives way at once rather than being worked.' },

    { id: 'v11', round: 8, falls: true, label: 'v11 — v6 + v8 + v9', dur: 1.0, pitchable: true,
      blurb: 'The combination exactly as asked: fast slipping (300→95/sec), a body that rings rather than a room that does, and creak1\'s 1023Hz-dominant object. Note this walks back two things the three-file average had pushed me toward.' },
    { id: 'v12', round: 8, falls: true, label: 'v12 — combo, fuller room', dur: 1.0, pitchable: true,
      blurb: 'v11 with v9\'s room level restored. Ring and room together instead of ring instead of room.' },
    { id: 'v13', round: 8, falls: true, label: 'v13 — combo, ringing harder', dur: 1.0, pitchable: true,
      blurb: 'v11 pushed further the same direction: resonances twice as narrow again, room almost gone. All tail from the object.' },
    { id: 'v14', round: 8, falls: true, label: 'v14 — combo, rate pulled back', dur: 1.0, pitchable: true,
      blurb: 'v11 at 110→32/sec — SLOWER than the base rather than faster, now that fast is out. Worth knowing whether the rate wants to move the other way.' },

    { id: 'v15', round: 9, falls: true, label: 'v15 — v7 + v9 + v10', dur: 1.0, pitchable: true,
      blurb: 'The elastic load curve, creak1\'s 1023Hz object, and the single early swell with no contact thump — something giving way at once rather than being worked. Room as in all three; the body does not ring.' },
    { id: 'v16', round: 9, falls: true, label: 'v16 — stronger load curve', dur: 1.0, pitchable: true,
      blurb: 'v15 with the stick phase building much more steeply into the release. The load curve is the newest axis and has only ever been heard at one value.' },
    { id: 'v17', round: 9, falls: true, label: 'v17 — milder load curve', dur: 1.0, pitchable: true,
      blurb: 'v15 with the curve nearly straight again — the other side of the same bracket, close to the linear ramp every round before 7 assumed.' },
    { id: 'v18', round: 9, falls: true, label: 'v18 — plus a ringing body', dur: 1.0, pitchable: true,
      blurb: 'v15 with v8\'s narrow resonances and reduced room added on top, bridging this combination to the round-8 one.' },

    { id: 'v19', round: 10, falls: true, label: 'v19 — v17 (control)', dur: 1.0, pitchable: true,
      blurb: 'v17 unchanged. The load curve stays at 1.4 rather than being pushed further toward straight — a value that wins a bracket is evidence about that value, not a direction to keep travelling in.' },
    { id: 'v20', round: 10, falls: true, poly: true, label: 'v20 — + light squeal', dur: 1.0, pitchable: true,
      blurb: 'A high-Q joint mode driven by the same slips, gliding 2300→1350Hz with a small random walk. Driven by the slips rather than layered over them, because an independent high layer detaches and becomes its own object.' },
    { id: 'v21', round: 10, falls: true, poly: true, label: 'v21 — + stronger squeal', dur: 1.0, pitchable: true,
      blurb: 'The same squeal, roughly twice as present. Round 1 found that this register turns into a scream when it gets loud and sustained, so this is the upper bracket.' },
    { id: 'v22', round: 10, falls: true, label: 'v22 — + v14\'s rate', dur: 1.0, pitchable: true,
      blurb: 'v19 slowed to 110→32 slips/sec. v14 changed two things at once; this isolates the rate.' },
    { id: 'v23', round: 10, falls: true, poly: true, label: 'v23 — + v14\'s rate + squeal', dur: 1.0, pitchable: true,
      blurb: 'v22 with the squeal. A slower slip rate leaves more room between releases for a resonance to sing through.' },
    { id: 'v24', round: 10, falls: true, label: 'v24 — + v14\'s body', dur: 1.0, pitchable: true,
      blurb: 'v19 with v14\'s other half: resonances 4× narrower and much less room, so the tail comes from the object. No squeal, no rate change.' },
    { id: 'v25', round: 10, falls: true, label: 'v25 — + all of v14', dur: 1.0, pitchable: true,
      blurb: 'Both halves of v14 together on the v17 base, no squeal.' },
    { id: 'v26', round: 10, falls: true, poly: true, label: 'v26 — + all of v14 + squeal', dur: 1.0, pitchable: true,
      blurb: 'Everything: v17\'s gesture and load curve, v14\'s slower rate and ringing body, and the squeal.' },

    { id: 'v27', round: 11, falls: true, poly: true, label: 'v27 — slipping squeal, no v14', dur: 1.0, pitchable: true,
      blurb: 'The squeal now follows the slip contour instead of gliding on its own schedule — same shape, same catch, same collapse, an octave and a half up. Isolated on the v17 base so the fix can be heard by itself.' },
    { id: 'v28', round: 11, falls: true, poly: true, label: 'v28 — v26 with the squeal fixed', dur: 1.0, pitchable: true,
      blurb: 'v26 exactly, but the squeal slips. Given its own glide it fell 1.7× while the joint under it fell 3.5×, which is why it sat on top of the creak rather than inside it.' },
    { id: 'v29', round: 11, falls: true, poly: true, label: 'v29 — + a bit of v13', dur: 1.0, pitchable: true,
      blurb: 'v28 with the body stepped partway toward v13: resonances narrower again and less room. v26 already carried v14\'s Q×4; this is the step between that and v13.' },
    { id: 'v30', round: 11, falls: true, poly: true, label: 'v30 — + all of v13\'s body', dur: 1.0, pitchable: true,
      blurb: 'v28 with v13\'s body in full — Q×8, room almost gone. The far end of the same bracket, so v29 has something to be measured against.' },
    { id: 'v31', round: 11, falls: true, poly: true, label: 'v31 — v29, squeal pushed', dur: 1.0, pitchable: true,
      blurb: 'v29 with the squeal noticeably louder. Round 1 found this register turns into a scream when it gets too present, so this is where that ceiling gets tested with a squeal that slips.' },

    { id: 'v32', round: 12, falls: true, poly: true, label: 'v32 — squeal ×2.4', dur: 1.0, pitchable: true,
      blurb: 'v27 with the squeal at 2.4× its level there. Everything stays level-matched, so turning the squeal up pushes the low part down in the mix — that trade is the thing being judged.' },
    { id: 'v33', round: 12, falls: true, poly: true, label: 'v33 — squeal ×5', dur: 1.0, pitchable: true,
      blurb: 'The same, five times v27\'s squeal. Around here it stops being a colour on the creak and becomes the loudest thing in it.' },
    { id: 'v34', round: 12, falls: true, poly: true, label: 'v34 — squeal ×9', dur: 1.0, pitchable: true,
      blurb: 'Nine times. Deliberately past where I would have stopped: round 1\'s ceiling was found with a squeal that SUSTAINED, and this one stops and starts with the joint, so that ceiling may not apply.' },
    { id: 'v35', round: 12, falls: true, poly: true, label: 'v35 — ×5, two modes', dur: 1.0, pitchable: true,
      blurb: 'v33 plus a second squealing mode at 1.5× — inharmonic, so it does not fuse into a musical interval. One narrow resonance turned up far enough starts to read as a sine in the mix; a real squeaking joint has more than one mode.' },
    { id: 'v36', round: 12, falls: true, poly: true, label: 'v36 — ×5, half-tracking', dur: 1.0, pitchable: true,
      blurb: 'Tracking the slips fully makes the squeal fall 3.5× too — 2300Hz down to ~650, out of squeal register and into the body. Inaudible at v27\'s level; at ×5 it is the loudest thing in the sound doing it. This one still slips with the joint but bottoms out near 1200Hz.' },

    { id: 'v37', round: 13, falls: true, poly: true, label: 'v37 — the squeal BURSTS', dur: 1.0, pitchable: true,
      blurb: 'Driven by only the STRONG slips instead of every one. A resonator fed by every slip cannot burst — it rings across several of them and smooths away the crackle, and at 100+ slips/sec that modulation is above the ~20Hz where the ear still hears separate events.' },
    { id: 'v38', round: 13, falls: true, poly: true, label: 'v38 — sparser bursts', dur: 1.0, pitchable: true,
      blurb: 'Only the very hardest releases set it ringing, so the bursts are fewer and further apart.' },
    { id: 'v39', round: 13, falls: true, poly: true, label: 'v39 — each burst rings longer', dur: 1.0, pitchable: true,
      blurb: 'Same bursts, but a much narrower resonance so each one sings after it is struck instead of just chirping.' },
    { id: 'v40', round: 13, falls: true, poly: true, label: 'v40 — bursts twice as loud', dur: 1.0, pitchable: true,
      blurb: 'v37 with the squeal at twice the level, since bursts spend less time sounding than a sustain did and may need more to read as present.' },
    { id: 'v41', round: 13, falls: true, poly: true, label: 'v41 — bursts + half-tracking', dur: 1.0, pitchable: true,
      blurb: 'v37 with v36\'s correction as well, so the bursts stay up in squeal register instead of descending into the body.' },

    { id: 'v42', round: 14, falls: true, poly: true, label: 'v42 — squeal higher (3200Hz)', dur: 1.0, pitchable: true,
      blurb: 'v27 with the squeal starting higher. Where the squeal sits has been fixed at 2300Hz since it was invented, on no evidence at all.' },
    { id: 'v43', round: 14, falls: true, poly: true, label: 'v43 — squeal lower (1600Hz)', dur: 1.0, pitchable: true,
      blurb: 'The other side of that bracket.' },
    { id: 'v44', round: 14, falls: true, poly: true, label: 'v44 — squeal broader', dur: 1.0, pitchable: true,
      blurb: 'A much wider resonance: airier and less pure, closer to a hiss with a pitch in it than a tone.' },
    { id: 'v45', round: 14, falls: true, poly: true, label: 'v45 — squeal narrower', dur: 1.0, pitchable: true,
      blurb: 'A much narrower one: purer, more singing, and it rings for longer after each slip.' },
    { id: 'v46', round: 14, falls: true, poly: true, label: 'v46 — no grit', dur: 1.0, pitchable: true,
      blurb: 'The noise burst at each release removed entirely. Grit has been on at roughly the same amount since round 4 without ever being questioned.' },
    { id: 'v47', round: 14, falls: true, poly: true, label: 'v47 — heavy grit', dur: 1.0, pitchable: true,
      blurb: 'Two and a half times the grit — much more shattering at the contact point.' },
    { id: 'v48', round: 14, falls: true, poly: true, label: 'v48 — blunter release', dur: 1.0, pitchable: true,
      blurb: 'The joint lets go four times more slowly. Release time is the brightness control, so this is a softer, less brittle material.' },
    { id: 'v49', round: 14, falls: true, poly: true, label: 'v49 — very uneven slips', dur: 1.0, pitchable: true,
      blurb: 'Slip strengths vary far more from one release to the next — more lurching, less even.' },
    { id: 'v50', round: 14, falls: true, poly: true, label: 'v50 — rate falls much further', dur: 1.0, pitchable: true,
      blurb: '200→30 instead of 156→44. How FAR the rate falls has never been varied — only where it starts.' },
    { id: 'v51', round: 14, falls: true, poly: true, label: 'v51 — rate barely falls', dur: 1.0, pitchable: true,
      blurb: '120→65: the same gesture with much less collapse in it.' },
    { id: 'v52', round: 14, falls: true, poly: true, label: 'v52 — bone dry', dur: 1.0, pitchable: true,
      blurb: 'No room at all. Round 6 found that dryness was reading as synthetic, but that was before the body and the squeal were what they are now.' },
    { id: 'v53', round: 14, falls: true, poly: true, label: 'v53 — worked, not given way', dur: 1.0, pitchable: true,
      blurb: 'Four swells peaking halfway with the contact thump back, instead of one early swell. v10\'s gesture reversed — something being worked rather than something giving way at once.' },

    { id: 'v54', round: 15, falls: true, poly: true, label: 'v54 — v47 compressed to 0.5s', dur: 0.5, pitchable: true,
      blurb: 'The whole gesture at half length: the same 156→44 fall now happens twice as fast, so the joint lets go at twice the speed.' },
    { id: 'v55', round: 15, falls: true, poly: true, label: 'v55 — v47 truncated to 0.5s', dur: 0.5, pitchable: true,
      blurb: 'The other reading of "compact". The joint falls at the rate it always did and the sound simply stops early, ending near 78 instead of 44 — a shorter creak rather than a faster one.' },
    { id: 'v56', round: 15, falls: true, poly: true, label: 'v56 — compressed, room scaled', dur: 0.5, pitchable: true,
      blurb: 'v54 with the room shortened to match. A 0.26s tail is a quarter of a 1.0s sound but half of a 0.5s one, so without this the short version is proportionally far wetter.' },
    { id: 'v57', round: 15, falls: true, poly: true, label: 'v57 — compressed, quicker slipping', dur: 0.5, pitchable: true,
      blurb: 'v56 at 200→60 slips/sec. A shorter creak usually comes from something lighter or smaller, which slips faster as well as for less long.' },

    { id: 'v58', round: 16, falls: true, poly: true, label: 'v58 — v46 compressed to 0.5s', dur: 0.5, pitchable: true,
      blurb: 'The grit-free version at half length: the same 156→44 fall happening twice as fast.' },
    { id: 'v59', round: 16, falls: true, poly: true, label: 'v59 — v46 truncated to 0.5s', dur: 0.5, pitchable: true,
      blurb: 'The joint falls at its usual rate and the sound stops early, ending near 78 — shorter rather than faster.' },
    { id: 'v60', round: 16, falls: true, poly: true, label: 'v60 — compressed, room scaled', dur: 0.5, pitchable: true,
      blurb: 'v58 with the tail shortened to match, so the wet/dry balance stays where v46 had it instead of doubling by accident.' },
    { id: 'v61', round: 16, falls: true, poly: true, label: 'v61 — compressed, quicker slipping', dur: 0.5, pitchable: true,
      blurb: 'v60 at 200→60 slips/sec — something lighter, slipping faster as well as for less long.' },

    { id: 'v62', round: 17, falls: true, poly: true, fixedMix: true, label: 'v62 — squeal-creak, then the slow one', dur: 0.95,
      blurb: 'v60 slowed to 100→30, with a shorter higher squealier creak (320→150, squeal at 3600Hz) in front of it. The same joint catching once high and quick, then again low and slow.' },
    { id: 'v63', round: 17, falls: true, poly: true, fixedMix: true, label: 'v63 — a longer gap', dur: 1.1,
      blurb: 'The same two parts further apart. Past roughly 150ms the ear stops hearing one gesture and starts hearing two events — this is the far side of that line.' },
    { id: 'v64', round: 17, falls: true, poly: true, fixedMix: true, label: 'v64 — overlapping', dur: 0.8,
      blurb: 'The second creak begins before the first has finished, so they fuse into a single gesture that starts squealing and settles into a groan.' },
    { id: 'v65', round: 17, falls: true, poly: true, fixedMix: true, label: 'v65 — much higher first part', dur: 0.95,
      blurb: 'The lead-in pitched far higher (420→200, squeal at 4800Hz), so it reads as a different, smaller part of the same object rather than as the same joint twice.' },
    { id: 'v66', round: 17, falls: true, poly: true, fixedMix: true, label: 'v66 — first part only a hint', dur: 0.95,
      blurb: 'The lead-in at just over half the level: something that catches briefly before the real movement, rather than an event in its own right.' }
  ];

  return { Lab: Lab, CATALOG: CATALOG };
}));
