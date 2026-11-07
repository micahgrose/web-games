/* GILT — audio: everything you hear is synthesized on the spot.
   Chips clack, cards slip, the wheel ticks itself tired, and the floor
   murmurs in D minor. Every cue renders into any BaseAudioContext so
   the offline harness can measure what the room sounds like. */
(function (root) {
  'use strict';

  function noiseBuffer(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * (seconds || 1));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 22222;
    for (let i = 0; i < len; i++) {
      s = (s * 16807) % 2147483647;
      d[i] = (s / 2147483647) * 2 - 1;
    }
    return buf;
  }

  function env(ctx, param, t0, pts) {
    // pts: [[dt, value], ...] linear ramps from t0
    param.setValueAtTime(pts[0][1], t0);
    let t = t0;
    for (let i = 1; i < pts.length; i++) {
      t = t0 + pts[i][0];
      param.linearRampToValueAtTime(pts[i][1], t);
    }
    return t;
  }

  function burst(ctx, dest, t0, opts) {
    // filtered noise hit: the workhorse for chips/cards/foil/steps.
    // opts.cap chains a lowpass so a highpass can't leave bare hiss up at
    // Nyquist — paper and felt have a top end, tape noise doesn't.
    const src = ctx.createBufferSource();
    src.buffer = opts.buf;
    src.playbackRate.value = opts.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = opts.type || 'bandpass';
    f.frequency.value = opts.freq || 2000;
    f.Q.value = opts.q == null ? 1 : opts.q;
    const g = ctx.createGain();
    const dur = opts.dur || 0.08;
    env(ctx, g.gain, t0, [[0, 0], [opts.attack || 0.004, opts.vol || 0.4], [dur, 0.0001]]);
    let tail = f;
    if (opts.cap) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = opts.cap;
      lp.Q.value = 0.7;
      f.connect(lp); tail = lp;
    }
    src.connect(f); tail.connect(g); g.connect(dest);
    src.start(t0); src.stop(t0 + dur + 0.05);
    return t0 + dur;
  }

  function tone(ctx, dest, t0, opts) {
    const o = ctx.createOscillator();
    o.type = opts.wave || 'sine';
    o.frequency.setValueAtTime(opts.f0 || 440, t0);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(opts.f1, t0 + (opts.dur || 0.2));
    const g = ctx.createGain();
    const dur = opts.dur || 0.2;
    env(ctx, g.gain, t0, [[0, 0], [opts.attack || 0.005, opts.vol || 0.2], [dur, 0.0001]]);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return t0 + dur;
  }

  // a small brass-ish hit for win stingers: detuned partials
  function brassHit(ctx, dest, t0, f, dur, vol) {
    for (const [mult, v] of [[1, 1], [2.01, 0.4], [2.99, 0.22], [4.02, 0.1]]) {
      tone(ctx, dest, t0, { f0: f * mult, dur, vol: vol * v, wave: 'sine' });
    }
  }

  // Every cue: (ctx, dest, t0, buf) → endTime. Pure, renderable offline.
  const CUES = {
    click(ctx, dest, t0, buf) { return burst(ctx, dest, t0, { buf, freq: 2600, q: 2, dur: 0.04, vol: 0.3 }); },
    // Chips are the sound of a casino floor — clay on clay, bright and dry.
    // They carry the table mix, so they sit above the cards, not under them.
    chip(ctx, dest, t0, buf) {
      burst(ctx, dest, t0, { buf, freq: 3400, q: 2.5, dur: 0.05, vol: 1.0 });
      burst(ctx, dest, t0, { buf, freq: 1200, q: 1.2, dur: 0.04, vol: 0.35 });
      return burst(ctx, dest, t0 + 0.028, { buf, freq: 2900, q: 2.5, dur: 0.05, vol: 0.6 });
    },
    chips(ctx, dest, t0, buf) {
      let t = t0;
      for (let i = 0; i < 5; i++) {
        t = burst(ctx, dest, t0 + i * 0.035, { buf, freq: 2800 + (i % 3) * 500, q: 2.5, dur: 0.05, vol: 0.8 - i * 0.09 });
        burst(ctx, dest, t0 + i * 0.035, { buf, freq: 1100, q: 1.2, dur: 0.035, vol: 0.24 - i * 0.03 });
      }
      return t;
    },
    // A card off the shoe onto felt: a papery mid-band slip, then the tap as
    // it lands. Bounded top — pasteboard has no 11 kHz in it.
    card(ctx, dest, t0, buf) {
      burst(ctx, dest, t0, { buf, type: 'highpass', freq: 1300, cap: 3600, dur: 0.09, vol: 0.26, attack: 0.02 });
      return burst(ctx, dest, t0 + 0.07, { buf, freq: 900, q: 1.4, dur: 0.03, vol: 0.16 });
    },
    // Two dice off the rail: hard clacks with wood under them, tumbling closer.
    dice(ctx, dest, t0, buf) {
      let t = t0;
      for (let i = 0; i < 7; i++) {
        const at = t0 + i * 0.07 + (i * i * 0.008);
        t = burst(ctx, dest, at, { buf, freq: 1900 + (i * 631) % 900, q: 2.5, dur: 0.045, vol: 0.95 - i * 0.08 });
        burst(ctx, dest, at, { buf, type: 'lowpass', freq: 420, dur: 0.05, vol: 0.5 - i * 0.05 });
        tone(ctx, dest, at, { f0: 150 - i * 6, f1: 90, dur: 0.05, vol: 0.16 - i * 0.015, wave: 'triangle' });
      }
      return t;
    },
    ballspin(ctx, dest, t0, buf) {
      // the long orbital hiss
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 3;
      env(ctx, f.frequency, t0, [[0, 4200], [3.5, 1400]]);
      const g = ctx.createGain();
      env(ctx, g.gain, t0, [[0, 0], [0.2, 0.1], [3.0, 0.06], [3.9, 0.0001]]);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(t0); src.stop(t0 + 4);
      return t0 + 4;
    },
    // The ball leaves the track, clips the frets, and drops. The payoff moment
    // at the wheel, so it lands harder than anything else Vern's table does.
    balldrop(ctx, dest, t0, buf) {
      let t = t0;
      for (let i = 0; i < 6; i++) {
        const at = t0 + i * 0.085 + i * i * 0.014;
        t = burst(ctx, dest, at, { buf, freq: 3200 - i * 320, q: 3, dur: 0.04, vol: 1.0 - i * 0.14 });
        tone(ctx, dest, at, { f0: 640 - i * 60, f1: 380, dur: 0.05, vol: 0.2 - i * 0.028, wave: 'sine' });
      }
      return t;
    },
    // Fires once per peg crossing, hundreds of times in a spin — the density
    // is the loudness, so each one stays a tap.
    tick(ctx, dest, t0, buf) {
      burst(ctx, dest, t0, { buf, freq: 2100, q: 4, dur: 0.03, vol: 0.3 });
      return tone(ctx, dest, t0, { f0: 900, f1: 620, dur: 0.025, vol: 0.06, wave: 'square' });
    },
    lever(ctx, dest, t0, buf) {
      tone(ctx, dest, t0, { f0: 130, f1: 70, dur: 0.16, vol: 0.16, wave: 'triangle' });
      return burst(ctx, dest, t0 + 0.12, { buf, freq: 700, q: 2, dur: 0.07, vol: 0.2 });
    },
    reels(ctx, dest, t0, buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
      const g = ctx.createGain();
      env(ctx, g.gain, t0, [[0, 0], [0.1, 0.07], [1.6, 0.05], [1.9, 0.0001]]);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 22;
      const lg = ctx.createGain(); lg.gain.value = 0.04;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(t0); src.stop(t0 + 2); lfo.start(t0); lfo.stop(t0 + 2);
      return t0 + 2;
    },
    reelstop(ctx, dest, t0, buf) {
      burst(ctx, dest, t0, { buf, freq: 500, q: 2, dur: 0.06, vol: 0.3 });
      return tone(ctx, dest, t0, { f0: 180, f1: 120, dur: 0.09, vol: 0.14, wave: 'square' });
    },
    coins(ctx, dest, t0, buf) {
      let t = t0;
      for (let i = 0; i < 8; i++) {
        t = tone(ctx, dest, t0 + i * 0.05, { f0: 2500 + (i * 977) % 1400, dur: 0.08, vol: 0.1, wave: 'triangle' });
      }
      return t;
    },
    winSmall(ctx, dest, t0) {
      brassHit(ctx, dest, t0, 392, 0.3, 0.12);       // G
      brassHit(ctx, dest, t0 + 0.12, 523.25, 0.5, 0.12); // C
      return t0 + 0.7;
    },
    winBig(ctx, dest, t0) {
      brassHit(ctx, dest, t0, 349.23, 0.3, 0.13);      // F
      brassHit(ctx, dest, t0 + 0.11, 440, 0.3, 0.13);  // A
      brassHit(ctx, dest, t0 + 0.22, 523.25, 0.7, 0.15); // C
      return t0 + 1.0;
    },
    // The full tray. Has to dwarf every other win in the building, because it
    // is the only time the house hands back everything at once.
    jackpot(ctx, dest, t0, buf) {
      brassHit(ctx, dest, t0, 261.63, 0.5, 0.17);
      brassHit(ctx, dest, t0 + 0.15, 392, 0.5, 0.17);
      brassHit(ctx, dest, t0 + 0.3, 523.25, 1.3, 0.2);
      // the bell on top of the cabinet, struck twice
      for (const bt of [0, 0.42]) {
        tone(ctx, dest, t0 + bt, { f0: 1046.5, dur: 1.1, vol: 0.1, wave: 'sine', attack: 0.002 });
        tone(ctx, dest, t0 + bt, { f0: 1568, dur: 0.8, vol: 0.05, wave: 'sine', attack: 0.002 });
      }
      // coins into the tray, thirty of them, with the metal pan underneath
      let t = t0;
      for (let i = 0; i < 30; i++) {
        const at = t0 + 0.3 + i * 0.065;
        t = tone(ctx, dest, at, { f0: 2200 + (i * 977) % 1800, dur: 0.09, vol: 0.11, wave: 'triangle' });
        if (i % 3 === 0) burst(ctx, dest, at, { buf, freq: 520, q: 1.5, dur: 0.06, vol: 0.16 });
      }
      return t + 0.3;
    },
    crowd(ctx, dest, t0, buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.7;
      const g = ctx.createGain();
      env(ctx, g.gain, t0, [[0, 0], [0.12, 0.22], [0.5, 0.1], [1.1, 0.0001]]);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(t0); src.stop(t0 + 1.2);
      return t0 + 1.2;
    },
    pop(ctx, dest, t0) { return tone(ctx, dest, t0, { f0: 900, f1: 500, dur: 0.06, vol: 0.1, wave: 'sine' }); },
    scratch(ctx, dest, t0, buf) { return burst(ctx, dest, t0, { buf, type: 'highpass', freq: 2000, cap: 6500, dur: 0.06, vol: 0.18, rate: 0.8 }); },
    foil(ctx, dest, t0, buf) { return burst(ctx, dest, t0, { buf, type: 'highpass', freq: 1500, cap: 5200, dur: 0.14, vol: 0.2, attack: 0.03 }); },
    paper(ctx, dest, t0, buf) { return burst(ctx, dest, t0, { buf, type: 'highpass', freq: 1200, cap: 4200, dur: 0.12, vol: 0.26, attack: 0.04 }); },
    pencil(ctx, dest, t0, buf) {
      burst(ctx, dest, t0, { buf, freq: 1800, q: 1.6, dur: 0.05, vol: 0.42 });
      return burst(ctx, dest, t0 + 0.09, { buf, freq: 1500, q: 1.6, dur: 0.07, vol: 0.36 });
    },
    steps(ctx, dest, t0, buf) {
      let t = t0;
      for (let i = 0; i < 3; i++) {
        const at = t0 + i * 0.16;
        t = burst(ctx, dest, at, { buf, type: 'lowpass', freq: 380, cap: 700, dur: 0.07, vol: 0.62 });
        burst(ctx, dest, at, { buf, freq: 1600, q: 3, dur: 0.03, vol: 0.025 }); // shoe leather on carpet
      }
      return t;
    },
    trumpet(ctx, dest, t0) {
      // call to post, close enough for a payphone parlor
      const notes = [[0, 392], [0.18, 523.25], [0.36, 659.25], [0.54, 523.25], [0.72, 659.25], [0.95, 783.99]];
      let t = t0;
      for (const [dt, f] of notes) {
        t = tone(ctx, dest, t0 + dt, { f0: f, dur: dt > 0.9 ? 0.5 : 0.16, vol: 0.11, wave: 'sawtooth', attack: 0.02 });
      }
      return t;
    },
    // A four-beat gallop that runs the whole race and swells down the stretch.
    // Six horses on dirt, three time zones away, through a parlor speaker.
    hooves(ctx, dest, t0, buf) {
      let t = t0, at = t0;
      const cycles = 19;
      for (let c = 0; c < cycles; c++) {
        const swell = 0.4 + 0.6 * (c / (cycles - 1));
        for (let b = 0; b < 4; b++) {
          const jitter = ((c * 7 + b * 13) % 5) * 0.006;
          const beatAt = at + b * 0.075 + jitter;
          burst(ctx, dest, beatAt, { buf, type: 'lowpass', freq: 300 + b * 40, dur: 0.06, vol: 0.62 * swell });
          tone(ctx, dest, beatAt, { f0: 120 - b * 8, f1: 70, dur: 0.07, vol: 0.13 * swell, wave: 'triangle' });
          t = beatAt + 0.07;
        }
        at += 0.42;
      }
      return t;
    },
    murmur(ctx, dest, t0) { return tone(ctx, dest, t0, { f0: 220, f1: 190, dur: 0.05, vol: 0.03, wave: 'sine' }); }
  };

  // ---------- ambient beds ----------
  // Each returns a stop() and renders continuous sound into dest.
  const PIANO_POOL = [146.83, 174.61, 220, 261.63, 293.66, 349.23, 440]; // D minor 9 territory
  function bedNodes(ctx, dest, name, buf) {
    const nodes = [];
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(dest);
    const add = n => { nodes.push(n); return n; };
    // Base murmur: noise band-passed to where human voices live, then capped.
    // Without the cap it reads as tape hiss instead of a roomful of people;
    // each room gets its own ceiling — plush lounge dark, slot row brighter.
    const murmurLevels = { exterior: 0.03, floor: 0.12, table: 0.085, craps: 0.15, slots: 0.10, bar: 0.07, lounge: 0.055, parlor: 0.075 };
    const roomTone = {
      exterior: { mid: 170, cap: 460 },   // traffic and a tired transformer
      floor: { mid: 430, cap: 1250 },
      table: { mid: 420, cap: 1150 },
      craps: { mid: 460, cap: 1500 },   // the loudest room, people shouting
      slots: { mid: 480, cap: 1750 },   // machines ring higher than people
      bar: { mid: 400, cap: 1050 },
      lounge: { mid: 380, cap: 900 },    // deep carpet eats the top
      parlor: { mid: 410, cap: 1100 }
    };
    const tn = roomTone[name] || roomTone.floor;
    const src = add(ctx.createBufferSource());
    src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = tn.mid;
    f.Q.value = 1.0;
    const cap = ctx.createBiquadFilter();
    cap.type = 'lowpass';
    cap.frequency.value = tn.cap;
    cap.Q.value = 0.7;
    const mg = ctx.createGain();
    mg.gain.value = murmurLevels[name] || 0.08;
    // slow swell
    const lfo = add(ctx.createOscillator());
    lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = (murmurLevels[name] || 0.08) * 0.4;
    lfo.connect(lg); lg.connect(mg.gain);
    src.connect(f); f.connect(cap); cap.connect(mg); mg.connect(g);
    src.start(); lfo.start();
    // neon hum outside; fluorescent-ish hum by the machines
    if (name === 'exterior' || name === 'slots') {
      const hum = add(ctx.createOscillator());
      hum.type = 'sawtooth'; hum.frequency.value = 60;
      const hf = ctx.createBiquadFilter();
      hf.type = 'lowpass'; hf.frequency.value = 140;
      const hg = ctx.createGain(); hg.gain.value = name === 'exterior' ? 0.012 : 0.008;
      hum.connect(hf); hf.connect(hg); hg.connect(g);
      hum.start();
    }
    return {
      gain: g, nodes,
      stop() {
        try { for (const n of nodes) { if (n.stop) n.stop(); } } catch (e) { }
        try { g.disconnect(); } catch (e) { }
      }
    };
  }

  function GiltAudio() {
    let ctx = null, master = null, buf = null, bed = null, bedName = null;
    let pianoTimer = 0;
    const api = {
      get ctx() { return ctx; },
      unlock() {
        if (ctx || typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
          if (ctx && ctx.state === 'suspended') ctx.resume();
          return;
        }
        try {
          const AC = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext;
          ctx = new AC();
          master = ctx.createDynamicsCompressor();
          const mg = ctx.createGain();
          mg.gain.value = 0.9;
          master.connect(mg); mg.connect(ctx.destination);
          buf = noiseBuffer(ctx, 1.2);
          if (bedName) api.ambient(bedName, true);
        } catch (e) { ctx = null; }
      },
      play(name, delay) {
        if (!ctx || !CUES[name]) return;
        try { CUES[name](ctx, master, ctx.currentTime + (delay || 0), buf); } catch (e) { }
      },
      ambient(name, force) {
        if (bedName === name && !force) return;
        bedName = name;
        if (!ctx) return;
        try {
          if (bed) {
            const old = bed;
            old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
            setTimeout(() => old.stop(), 1000);
          }
          bed = bedNodes(ctx, master, name, buf);
          bed.gain.gain.setValueAtTime(0, ctx.currentTime);
          bed.gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
        } catch (e) { }
      },
      // an occasional piano phrase drifting over the floor
      tick(dt) {
        if (!ctx || !bedName || bedName === 'exterior') return;
        pianoTimer -= dt;
        if (pianoTimer <= 0) {
          pianoTimer = 7 + Math.random() * 9;
          const t0 = ctx.currentTime + 0.1;
          let t = t0;
          const notes = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < notes; i++) {
            const f = PIANO_POOL[Math.floor(Math.random() * PIANO_POOL.length)];
            try {
              tone(ctx, master, t, { f0: f, dur: 0.9, vol: 0.028, wave: 'triangle', attack: 0.005 });
              tone(ctx, master, t, { f0: f * 2, dur: 0.7, vol: 0.012, wave: 'sine', attack: 0.005 });
            } catch (e) { }
            t += 0.35 + Math.random() * 0.5;
          }
        }
      }
    };
    return api;
  }

  const Audio = { GiltAudio, CUES, bedNodes, noiseBuffer, PIANO_POOL };
  if (typeof module !== 'undefined' && module.exports) module.exports = Audio;
  root.GiltAudio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
