/* Lumen — tiny procedural sound. No assets; everything is synthesised.
   Created lazily on the first user gesture so autoplay policies stay happy. */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
      return false;
    }
    return true;
  }

  // a single shaped oscillator voice
  function blip(opts) {
    if (muted || !ensure()) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    var now = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(opts.f0, now);
    if (opts.f1 && opts.f1 !== opts.f0) {
      o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f1), now + opts.dur);
    }
    var peak = opts.gain == null ? 0.3 : opts.gain;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + (opts.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, now + opts.dur);
    o.connect(g);
    g.connect(master);
    o.start(now);
    o.stop(now + opts.dur + 0.02);
  }

  // soft filtered-noise burst (for impacts / nova)
  function noise(dur, gain, cutoff) {
    if (muted || !ensure()) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    var now = ctx.currentTime;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff || 1200;
    var g = ctx.createGain();
    g.gain.value = gain == null ? 0.25 : gain;
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(now);
  }

  var Sound = {
    unlock: function () {
      if (ensure() && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    },
    // pickup pitch rises with the streak count for a satisfying ladder
    pickup: function (step) {
      var s = Math.min(step || 0, 16);
      var base = 520 * Math.pow(2, s / 12);
      blip({ type: 'triangle', f0: base, f1: base * 1.5, dur: 0.16, gain: 0.22, attack: 0.004 });
    },
    power: function () {
      blip({ type: 'sine', f0: 440, f1: 880, dur: 0.28, gain: 0.26 });
      blip({ type: 'sine', f0: 660, f1: 1320, dur: 0.3, gain: 0.16 });
    },
    hit: function () {
      blip({ type: 'sawtooth', f0: 220, f1: 60, dur: 0.4, gain: 0.3 });
      noise(0.35, 0.3, 900);
    },
    nova: function () {
      blip({ type: 'sine', f0: 180, f1: 720, dur: 0.5, gain: 0.28 });
      noise(0.5, 0.35, 2400);
    },
    over: function () {
      blip({ type: 'sine', f0: 300, f1: 90, dur: 0.9, gain: 0.3 });
      blip({ type: 'triangle', f0: 200, f1: 70, dur: 1.0, gain: 0.18 });
    },
    start: function () {
      blip({ type: 'triangle', f0: 330, f1: 660, dur: 0.22, gain: 0.22 });
    },
    setMuted: function (m) { muted = !!m; },
    isMuted: function () { return muted; }
  };

  global.Sound = Sound;
})(window);
