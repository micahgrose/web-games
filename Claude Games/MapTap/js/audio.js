/* audio.js — every sound is synthesised on the spot; no files, no libraries.
 *
 * The context is created lazily on the first gesture, because browsers refuse to
 * start one before the user has touched the page. Everything is quiet by design:
 * this is a game you play while thinking.
 */
(function (root) {
  'use strict';

  var MUTE_KEY = 'maptap.muted.v1';

  var Sfx = {
    ctx: null,
    master: null,
    muted: false,
    volume: 0.5,
    _failed: false
  };

  function storage() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }

  Sfx.loadPref = function () {
    var s = storage();
    if (s) {
      try { this.muted = s.getItem(MUTE_KEY) === '1'; } catch (e) { /* private mode */ }
    }
    return this.muted;
  };

  Sfx.setMuted = function (m) {
    this.muted = !!m;
    var s = storage();
    if (s) { try { s.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch (e) {} }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  };

  Sfx.toggle = function () { return this.setMuted(!this.muted); };

  // Safe to call as often as you like; only the first call does anything.
  Sfx.init = function () {
    if (this.ctx || this._failed) return this.ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) { this._failed = true; return null; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this._failed = true;
      this.ctx = null;
    }
    return this.ctx;
  };

  Sfx.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
  };

  /* ------------------------------------------------------------- primitives */

  // One shaped oscillator note. `to` bends the pitch over the note's life.
  function tone(o) {
    var ctx = Sfx.ctx;
    if (!ctx) return;
    var t0 = ctx.currentTime + (o.delay || 0);
    var dur = o.dur || 0.12;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to && o.to !== o.freq) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);

    var peak = (o.gain === undefined ? 0.22 : o.gain);
    var atk = o.attack === undefined ? 0.006 : o.attack;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    var tail = g;
    if (o.cutoff) {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.cutoff, t0);
      g.connect(f);
      tail = f;
    }
    tail.connect(Sfx.master);
    osc.connect(g);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Filtered noise, for anything airy: taps, sweeps, the arc being drawn.
  function noise(o) {
    var ctx = Sfx.ctx;
    if (!ctx) return;
    var t0 = ctx.currentTime + (o.delay || 0);
    var dur = o.dur || 0.15;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.Q.value = o.q === undefined ? 1.2 : o.q;
    f.frequency.setValueAtTime(o.from || 1200, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);

    var g = ctx.createGain();
    var peak = o.gain === undefined ? 0.12 : o.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(f); f.connect(g); g.connect(Sfx.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /* ------------------------------------------------------------------ voices */

  var VOICES = {
    // Dropping a pin on the globe: a small wooden tick with a bit of air.
    tap: function () {
      tone({ freq: 620, to: 880, type: 'triangle', dur: 0.09, gain: 0.16, attack: 0.004 });
      noise({ from: 2600, to: 1400, dur: 0.06, gain: 0.05, q: 0.9 });
    },
    // Tapping empty space: a dull, unrewarding thud.
    deny: function () {
      tone({ freq: 180, to: 120, type: 'sine', dur: 0.13, gain: 0.11 });
    },
    // Committing to a guess.
    lock: function () {
      tone({ freq: 392, to: 392, type: 'triangle', dur: 0.10, gain: 0.15 });
      tone({ freq: 587.33, to: 587.33, type: 'triangle', dur: 0.16, gain: 0.13, delay: 0.06 });
    },
    // The great-circle line racing out to the answer.
    sweep: function () {
      noise({ from: 500, to: 3600, dur: 0.42, gain: 0.055, q: 2.2, filter: 'bandpass', attack: 0.10 });
    },
    // The true location landing on the globe.
    land: function () {
      tone({ freq: 300, to: 190, type: 'sine', dur: 0.16, gain: 0.17 });
      noise({ from: 900, to: 300, dur: 0.10, gain: 0.05, q: 0.8 });
    },
    // Within 25 km — the good one.
    bullseye: function () {
      [784, 1046.5, 1318.5, 1568].forEach(function (f, i) {
        tone({ freq: f, type: 'sine', dur: 0.30 - i * 0.03, gain: 0.13, delay: i * 0.055 });
      });
      noise({ from: 4000, to: 8000, dur: 0.35, gain: 0.03, q: 3, delay: 0.02 });
    },
    // Right country, wrong spot.
    bonus: function () {
      tone({ freq: 1174.7, type: 'sine', dur: 0.16, gain: 0.10 });
      tone({ freq: 1567.9, type: 'sine', dur: 0.14, gain: 0.07, delay: 0.05 });
    },
    // Nowhere near it.
    miss: function () {
      tone({ freq: 260, to: 196, type: 'triangle', dur: 0.24, gain: 0.10, cutoff: 900 });
    },
    ui: function () {
      tone({ freq: 880, to: 990, type: 'square', dur: 0.035, gain: 0.045, attack: 0.002, cutoff: 2600 });
    },
    next: function () {
      tone({ freq: 523.25, to: 659.25, type: 'triangle', dur: 0.09, gain: 0.10 });
    },
    start: function () {
      [261.6, 392, 523.25].forEach(function (f, i) {
        tone({ freq: f, type: 'triangle', dur: 0.34, gain: 0.10, delay: i * 0.07 });
      });
    }
  };

  /* The end-of-round chord leans major and bright for a good score, and sags
   * into a minor with the top note missing for a bad one. */
  function finish(score, max) {
    var frac = Math.max(0, Math.min(1, score / (max || 1000)));
    var root0 = 261.63;
    var third = frac >= 0.62 ? root0 * 1.26 : root0 * 1.19;    // major vs minor third
    var notes = [root0, third, root0 * 1.5];
    if (frac >= 0.85) notes.push(root0 * 2);
    notes.forEach(function (f, i) {
      tone({ freq: f, type: 'triangle', dur: 0.85 + i * 0.12, gain: 0.085 + frac * 0.045, delay: i * 0.075 });
    });
    if (frac >= 0.95) {
      noise({ from: 5000, to: 9000, dur: 0.6, gain: 0.028, q: 3, delay: 0.15 });
    }
  }

  Sfx.play = function (name, arg) {
    if (this.muted) return false;
    if (!this.ctx) { this.init(); }
    if (!this.ctx) return false;
    this.resume();
    if (name === 'finish') { finish(arg || 0, 1000); return true; }
    var v = VOICES[name];
    if (!v) return false;
    v();
    return true;
  };

  Sfx.has = function (name) { return name === 'finish' || !!VOICES[name]; };
  Sfx.voiceNames = function () { return Object.keys(VOICES).concat(['finish']); };

  root.Sfx = Sfx;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sfx;
})(typeof window !== 'undefined' ? window : globalThis);
