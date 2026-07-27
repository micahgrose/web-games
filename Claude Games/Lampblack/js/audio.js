'use strict';
// LAMPBLACK — WebAudio (DESIGN §4.5): all procedural, no assets. Init on first
// gesture; guarded when AudioContext is absent. Every recipe is addressable by
// name so the soundboard harness can audition each one ("user reports by name").
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
  function noiseBuf(dur) {
    var n = Math.floor(A.ctx.sampleRate * dur), b = A.ctx.createBuffer(1, n, A.ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  // sp: {pan(-1..1), gain(0..1), cutoff(Hz lowpass; 0 = none), bus}
  function out(sp, dur) {
    sp = sp || {};
    var g = A.ctx.createGain();
    g.gain.value = sp.gain !== undefined ? sp.gain : 1;
    var node = g, tail = g;
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
  function envNoise(sp, dur, filter, freq, q, attack) {
    if (!A.ok) return;
    var t = A.ctx.currentTime;
    var src = A.ctx.createBufferSource(); src.buffer = noiseBuf(dur + 0.05);
    var f = A.ctx.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q || 1;
    var g = out(sp, dur);
    var e = A.ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(1, t + (attack || 0.005));
    e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(e); e.connect(g);
    src.start(t); src.stop(t + dur + 0.05);
  }
  function tone(sp, dur, type, f0, f1, vibrato) {
    if (!A.ok) return null;
    var t = A.ctx.currentTime;
    var o = A.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    var e = A.ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(1, t + 0.008);
    e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    var g = out(sp, dur);
    if (vibrato) {
      var lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
      lfo.frequency.value = vibrato.rate; lg.gain.value = vibrato.depth;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur);
    }
    o.connect(e); e.connect(g);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  function fmPing(sp, dur, carrier, ratio, index) {
    if (!A.ok) return;
    var t = A.ctx.currentTime;
    var c = A.ctx.createOscillator(); c.frequency.value = carrier;
    var m = A.ctx.createOscillator(); m.frequency.value = carrier * (ratio || 3.7);
    var mg = A.ctx.createGain(); mg.gain.setValueAtTime(carrier * (index || 2), t);
    mg.gain.exponentialRampToValueAtTime(1, t + dur);
    m.connect(mg); mg.connect(c.frequency);
    var e = A.ctx.createGain();
    e.gain.setValueAtTime(1, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    c.connect(e); e.connect(out(sp, dur));
    c.start(t); c.stop(t + dur); m.start(t); m.stop(t + dur);
  }

  // A creak is not a note (user audit r1+r2): many FAST high squeaky grains
  // RISING in pitch, undertone breaks between, and a big drop at the very end.
  function creakGrains(sp, g, stretch) {
    var t = 0, n = 7 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      (function (i, t, last) {
        setTimeout(function () {
          if (!A.ok) return;
          if (last) { tone(sp2(sp, g * 0.8), 0.09, 'sawtooth', 520, 230); return; } // the end: drop a LOT
          var f0 = 680 + (i / n) * 520 + Math.random() * 60; // rising
          tone(sp2(sp, g * (0.45 + Math.random() * 0.4)), 0.035 + Math.random() * 0.02, 'sawtooth', f0, f0 + 60);
          if (i % 3 === 2) tone(sp2(sp, g * 0.2), 0.03, 'square', 180 + Math.random() * 40, 165);
        }, t * 1000);
      })(i, t, i === n - 1);
      t += (0.028 + Math.random() * 0.022) * stretch;
    }
  }
  // Guttural undertone: low saw roughened by ~28Hz amplitude modulation.
  function growl(sp, g, dur, f0) {
    if (!A.ok) return;
    var t = A.ctx.currentTime;
    var o = A.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
    var f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 350;
    var e = A.ctx.createGain();
    e.gain.setValueAtTime(g, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    var am = A.ctx.createOscillator(); am.frequency.value = 28;
    var ag = A.ctx.createGain(); ag.gain.value = g * 0.6;
    am.connect(ag); ag.connect(e.gain);
    o.connect(f); f.connect(e); e.connect(out(sp2(sp, 1), dur));
    o.start(t); o.stop(t + dur); am.start(t); am.stop(t + dur);
  }

  // ---------- foley recipes (§4.5) — each named, each soundboard-addressable ----------
  A.recipes = {
    // footsteps by material
    step_carpet: function (sp) { envNoise(sp2(sp, 0.35), 0.06, 'bandpass', 200, 1); },
    step_wood: function (sp) { // dark knock, not mid-noise (audit: "only wood when muffled")
      envNoise(sp2(sp, 0.55), 0.07, 'lowpass', 260, 1);
      tone(sp2(sp, 0.3), 0.06, 'sine', 95, 70);
    },
    step_marble: function (sp) { // single clack, no slap-back double
      envNoise(sp2(sp, 0.6), 0.03, 'bandpass', 1900, 9);
      tone(sp2(sp, 0.15), 0.03, 'sine', 620, 540);
    },
    step_glass: function (sp) { // tinkle - crunch - tinkle
      fmPing(sp2(sp, 0.25), 0.08, 3800 + Math.random() * 600, 3.1, 2);
      setTimeout(function () { if (A.ok) envNoise(sp2(sp, 0.5), 0.08, 'highpass', 1400, 1); }, 60);
      setTimeout(function () { if (A.ok) fmPing(sp2(sp, 0.2), 0.09, 4400 + Math.random() * 800, 2.7, 2); }, 150);
    },
    creak: function (sp) { creakGrains(sp, 0.9, 1.0); },
    // the signature verb — snuff is the soft foomp; relight is the same, EXTRA quiet
    snuff_fwip: function (sp) { envNoise(sp2(sp, 0.5), 0.15, 'lowpass', 400, 1, 0.06); tone(sp2(sp, 0.2), 0.25, 'sine', 90, 70, { rate: 9, depth: 12 }); },
    relight_foomp: function (sp) { envNoise(sp2(sp, 0.09), 0.15, 'lowpass', 400, 1, 0.06); tone(sp2(sp, 0.04), 0.25, 'sine', 90, 70, { rate: 9, depth: 12 }); },
    // hands
    pick_tick: function (sp) { envNoise(sp2(sp, 1.0), 0.03, 'bandpass', 1100, 7); tone(sp2(sp, 0.5), 0.02, 'square', 1600, 1500); },
    pick_success: function (sp) { fmPing(sp2(sp, 0.5), 0.25, 2400, 2.1, 1.5); },
    dial_tick: function (sp) { envNoise(sp2(sp, 0.85), 0.025, 'bandpass', 1300, 8); },
    dial_stop_thunk: function (sp) { tone(sp2(sp, 0.22), 0.07, 'sine', 320, 290); }, // the felt-click — subtle, you LISTEN for it
    drill: function (sp) { // quiet high whine, sustained (~2.5s), not a half-second buzz
      if (!A.ok) return;
      var t = A.ctx.currentTime, dur = 2.5;
      var o = A.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(2900, t);
      var v = A.ctx.createOscillator(); v.frequency.value = 26;
      var vg = A.ctx.createGain(); vg.gain.value = 60;
      v.connect(vg); vg.connect(o.frequency);
      var f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 2;
      var e = A.ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(0.32, t + 0.15);
      e.gain.setValueAtTime(0.32, t + dur - 0.25);
      e.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f); f.connect(e); e.connect(out(sp2(sp, 1), dur));
      o.start(t); o.stop(t + dur); v.start(t); v.stop(t + dur);
      envNoise(sp2(sp, 0.06), dur, 'highpass', 4000, 1, 0.2);
    },
    glass_cut: function (sp) { // scratching grains, not a whoosh
      for (var i = 0; i < 6; i++) setTimeout(function () {
        if (A.ok) envNoise(sp2(sp, 0.35 + Math.random() * 0.25), 0.04 + Math.random() * 0.05, 'bandpass', 2400 + Math.random() * 900, 12);
      }, i * 70 + Math.random() * 30);
    },
    glass_smash: function (sp) { // CRACK (splitting, not slapping) — KSHHHH — light tinkling
      envNoise(sp2(sp, 1.0), 0.012, 'bandpass', 1800, 6);
      setTimeout(function () { if (A.ok) envNoise(sp2(sp, 0.7), 0.02, 'bandpass', 1400, 5); }, 22);
      tone(sp2(sp, 0.25), 0.05, 'sine', 160, 90);
      setTimeout(function () { if (A.ok) envNoise(sp2(sp, 0.8), 0.35, 'highpass', 2000, 1); }, 45);
      for (var i = 0; i < 6; i++) setTimeout(function () {
        if (A.ok) fmPing(sp2(sp, 0.12 + Math.random() * 0.1), 0.12, 3000 + Math.random() * 3000, 3.7, 2);
      }, 250 + i * 90 + Math.random() * 60);
    },
    door_force: function (sp) { // the thump, LOUD, with a crack in it
      tone(sp2(sp, 1.4), 0.16, 'sine', 70, 40);
      envNoise(sp2(sp, 0.9), 0.03, 'bandpass', 500, 2);
      envNoise(sp2(sp, 0.8), 0.18, 'lowpass', 400, 1);
    },
    door_creakopen: function (sp) { creakGrains(sp, 0.7, 1.8); },
    bell_trap: function (sp) { for (var i = 0; i < 4; i++) setTimeout(function () { if (A.ok) fmPing(sp2(sp, 0.6), 0.4, 2800, 1.4, 3); }, i * 130); },
    blackjack_thump: function (sp) { tone(sp2(sp, 0.9), 0.1, 'sine', 90, 60); envNoise(sp2(sp, 0.4), 0.09, 'lowpass', 600, 1); },
    body_drag: function (sp) { // SCRAPE over whoosh: mid-high scratchy grains on a quiet low bed
      for (var i = 0; i < 6; i++) setTimeout(function () {
        if (A.ok) envNoise(sp2(sp, 0.3 + Math.random() * 0.15), 0.22, 'bandpass', 1200 + Math.random() * 600, 4, 0.05);
      }, i * 175 + Math.random() * 40);
      envNoise(sp2(sp, 0.15), 1.1, 'lowpass', 250, 1, 0.25);
    },
    coin_lure: function (sp) { for (var i = 0; i < 3; i++) setTimeout(function () { if (A.ok) fmPing(sp2(sp, 0.4), 0.15, 4200 + Math.random() * 800, 3.7, 2); }, i * 70); },
    songbird: function (sp) { for (var i = 0; i < 3; i++) setTimeout(function () { if (A.ok) tone(sp2(sp, 0.35), 0.07, 'sine', 2600 + i * 300, 3100 + i * 200); }, i * 110); },
    smoke_burst: function (sp) { envNoise(sp2(sp, 0.7), 0.4, 'lowpass', 500, 1, 0.01); },
    gas_hiss: function (sp) { envNoise(sp2(sp, 0.5), 1.8, 'highpass', 2500, 1, 0.2); },
    oil_slip: function (sp) { envNoise(sp2(sp, 0.7), 0.35, 'highpass', 3200, 1, 0.01); }, // "ssssst"
    dumbwaiter_clunk: function (sp) { tone(sp2(sp, 0.7), 0.1, 'sine', 140, 90); envNoise(sp2(sp, 0.3), 0.2, 'lowpass', 350, 1); },
    // alarm class
    whistle_blast: function (sp) { // shrill single-pitch waver + LOW GUTTURAL undertone
      tone(sp2(sp, 0.9), 0.65, 'square', 2600, 2600, { rate: 11, depth: 40 });
      growl(sp, 0.3, 0.65, 80);
    },
    scream: function (sp) { // wavering wail + breath rasp + guttural low
      tone(sp2(sp, 0.8), 0.55, 'sawtooth', 950, 1150, { rate: 9, depth: 90 });
      envNoise(sp2(sp, 0.35), 0.5, 'bandpass', 1400, 1, 0.02);
      growl(sp, 0.28, 0.5, 90);
    },
    // tells (loops assembled from these one-shots)
    whistle_note: function (sp, hz) { // much airier: breath noise rides the pitch
      tone(sp2(sp, 0.26), 0.28, 'triangle', hz || 587, hz || 587, { rate: 5.5, depth: 6 });
      envNoise(sp2(sp, 0.24), 0.28, 'bandpass', (hz || 587) * 4, 3, 0.05);
    },
    snore_in: function (sp) { // inhale + low low clicks underneath
      envNoise(sp2(sp, 0.4), 0.7, 'lowpass', 350, 1, 0.3);
      for (var i = 0; i < 4; i++) setTimeout(function () { if (A.ok) tone(sp2(sp, 0.2), 0.025, 'sine', 62, 55); }, 80 + i * 150 + Math.random() * 40);
    },
    snore_out: function (sp) { envNoise(sp2(sp, 0.25), 0.5, 'lowpass', 250, 1, 0.05); },
    key_jangle: function (sp) { // clacking tinkle, one pitch region — not a xylophone
      var base = 3100 + Math.random() * 200;
      var n = 5 + Math.floor(Math.random() * 3);
      for (var i = 0; i < n; i++) setTimeout(function () {
        if (A.ok) envNoise(sp2(sp, 0.35), 0.025, 'bandpass', base + Math.random() * 250 - 125, 14);
      }, i * 28 + Math.random() * 12);
    },
    dog_pant: function (sp) { envNoise(sp2(sp, 0.35), 0.13, 'lowpass', 850, 1, 0.03); }, // short high snore_out
    dog_snuffle: function (sp) { for (var i = 0; i < 2; i++) setTimeout(function () { if (A.ok) envNoise(sp2(sp, 0.8), 0.06, 'bandpass', 500, 3); }, i * 90); },
    dog_bark: function (sp) { // depth + growling snuffleness, not one note
      growl(sp, 0.5, 0.22, 110);
      tone(sp2(sp, 0.8), 0.14, 'sawtooth', 340, 170);
      envNoise(sp2(sp, 0.5), 0.12, 'bandpass', 700, 2);
      setTimeout(function () { if (A.ok) envNoise(sp2(sp, 0.3), 0.07, 'bandpass', 500, 3); }, 150);
    },
    order_bark: function (sp) { // chesty shout: growl under the voice
      growl(sp, 0.35, 0.25, 95);
      tone(sp2(sp, 0.7), 0.2, 'square', 230, 150);
      envNoise(sp2(sp, 0.35), 0.18, 'bandpass', 1100, 1);
    },
    rifle_cock: function (sp) { // LOUD mechanical double-clack + metallic ring
      envNoise(sp2(sp, 1.3), 0.022, 'bandpass', 2200, 8);
      fmPing(sp2(sp, 0.5), 0.06, 2600, 3.7, 2);
      setTimeout(function () { if (A.ok) { envNoise(sp2(sp, 1.3), 0.03, 'bandpass', 1600, 8); fmPing(sp2(sp, 0.4), 0.07, 1900, 3.7, 2); } }, 85);
    },
    tough_hum: function (sp) { // breathy, like the whistle
      var notes = [196, 233, 175, 220];
      var hz = notes[Math.floor(Math.random() * 4)];
      tone(sp2(sp, 0.2), 0.4, 'triangle', hz);
      envNoise(sp2(sp, 0.18), 0.4, 'bandpass', hz * 4, 3, 0.08);
    },
    civ_murmur: function (sp) { for (var i = 0; i < 3; i++) setTimeout(function () { if (A.ok) tone(sp2(sp, 0.12), 0.12, 'sine', 200 + Math.random() * 150); }, i * 140); },
    gasp: function (sp) { envNoise(sp2(sp, 0.5), 0.15, 'highpass', 900, 1, 0.1); },
    // OLD COPPER: heavy/light boot + the shutter
    copper_boot_heavy: function (sp) { tone(sp2(sp, 1), 0.12, 'sine', 60, 45); },
    copper_boot_light: function (sp) { tone(sp2(sp, 0.6), 0.09, 'sine', 75, 55); },
    shk_clack: function (sp) { envNoise(sp2(sp, 0.6), 0.015, 'highpass', 3000, 1); setTimeout(function () { if (A.ok) tone(sp2(sp, 0.8), 0.03, 'square', 1800, 1800); }, 18); },
    // UI
    ui_coin: function (sp) { fmPing(sp2(sp, 0.4, 'ui'), 0.12, 5000, 3.7, 2); },
    paper_rustle: function (sp) { envNoise(sp2(sp, 0.35, 'ui'), 0.2, 'lowpass', 3000, 1, 0.04); },
    jackdaw_chirp: function (sp) { fmPing(sp2(sp, 0.25, 'ui'), 0.04, 2800, 2.3, 3); },
    stinger_brass: function (sp) { // stage-up: muted-brass stab
      if (!A.ok) return;
      var t = A.ctx.currentTime;
      var o = A.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 146.8; // D3
      var f = A.ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.15);
      f.frequency.exponentialRampToValueAtTime(250, t + 0.7);
      var e = A.ctx.createGain(); e.gain.setValueAtTime(0.8, t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      o.connect(f); f.connect(e); e.connect(out(sp2(sp, 0.8, 'music'), 0.8));
      o.start(t); o.stop(t + 0.85);
    },
    leitmotif: function (sp, minor) { A.playLeitmotif(sp, minor); }
  };
  function sp2(sp, gain, bus) {
    sp = sp || {};
    return { pan: sp.pan || 0, gain: (sp.gain !== undefined ? sp.gain : 1) * gain, cutoff: sp.cutoff, bus: bus || sp.bus || 'foley' };
  }
  A.play = function (name, sp) { if (A.ok && A.recipes[name]) A.recipes[name](sp || {}); };

  // The theme, lazy swing: long-short pairing at 84bpm.
  A.playLeitmotif = function (sp, minorSting) {
    if (!A.ok) return;
    var beat = 60 / LB.C.MUSIC_BPM;
    var delays = [0, beat * 0.66, beat * 1.33, beat * 2.0, beat * 3.0];
    LEIT.forEach(function (n, i) {
      setTimeout(function () { if (A.ok) A.recipes.whistle_note(sp, LB.noteHz(n)); }, delays[i] * 1000);
    });
    if (minorSting) setTimeout(function () { if (A.ok) { tone(sp2(sp || {}, 0.4, 'music'), 1.2, 'triangle', LB.noteHz('D4')); tone(sp2(sp || {}, 0.3, 'music'), 1.2, 'triangle', LB.noteHz('F4')); } }, delays[4] * 1000 + 300);
  };

  // ---------- guard tell loops (audio fires ON animation frames — main drives) ----------
  // Handle-based: main updates spatial params at 4Hz with the door-graph BFS values.
  A.tellHandle = function (guardId) {
    var h = A.tells[guardId];
    if (!h) { h = A.tells[guardId] = { pan: 0, gain: 0, cutoff: 8000, lastGain: 0 }; }
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
    // room-tone pad: 2 detuned triangles D2+A2, −30dB (always on, calm layer)
    [73.42, 110].forEach(function (hz, i) {
      var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz * (i ? 1.002 : 0.998);
      var g = ctx.createGain(); g.gain.value = 0.032;
      o.connect(g); g.connect(layers.calm); o.start();
      m['pad' + i] = o;
    });
    // thin A5 pedal whine (lockdown)
    var whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 880;
    var wg = ctx.createGain(); wg.gain.value = 0.03;
    whine.connect(wg); wg.connect(layers.lockdown); whine.start();
    // tremolo strings: 3 saws on Dm, 7Hz gain LFO, lp 1.2k (alarmed)
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
    // step scheduler (8ths), 0.1s lookahead
    var pizzLine = ['D2', 'F2', 'A2', 'C3'];
    function schedule() {
      if (!A.ok) return;
      while (m.nextT < ctx.currentTime + 0.12) {
        var t = m.nextT, eighth = m.step % 8, bar = Math.floor(m.step / 8);
        // CALM: vinyl crackle pops (sparse) + harbor bell (random 25–45s feel: every ~64 eighths w/ jitter)
        if (Math.random() < 0.06) crackleAt(t, layers.calm);
        if (m.step % 128 === 17 && Math.random() < 0.7) bellAt(t, layers.calm);
        // WARY: brushed-hat swing 8ths + sparse pizzicato
        if (eighth % 2 === 0 || Math.random() < 0.3) hatAt(t, layers.wary, eighth === 0 ? 0.09 : 0.05);
        if (eighth === 0 && bar % 2 === 0) pizzAt(t, layers.wary, LB.noteHz(pizzLine[bar % 4]) / 2);
        // LOCKDOWN: timpani heartbeat lub-dub each bar
        if (eighth === 0) { thumpAt(t, layers.lockdown, 1); thumpAt(t + beat * 0.35, layers.lockdown, 0.6); }
        m.step++; m.nextT += beat / 2;
      }
      m.timer = setTimeout(schedule, 40);
    }
    function crackleAt(t, dest) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf(0.02);
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 2;
      var g = ctx.createGain(); g.gain.value = 0.05;
      src.connect(f); f.connect(g); g.connect(dest); src.start(t);
    }
    function bellAt(t, dest) {
      var o = ctx.createOscillator(); o.frequency.value = LB.noteHz('D3');
      var mo = ctx.createOscillator(); mo.frequency.value = LB.noteHz('D3') * 2.4;
      var mg = ctx.createGain(); mg.gain.value = 120;
      mo.connect(mg); mg.connect(o.frequency);
      var g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 3);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 3); mo.start(t); mo.stop(t + 3);
    }
    function hatAt(t, dest, v) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf(0.05);
      var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 4000;
      var g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      src.connect(f); f.connect(g); g.connect(dest); src.start(t);
    }
    function pizzAt(t, dest, hz) {
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
      var g = ctx.createGain(); g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.4);
    }
    function thumpAt(t, dest, v) {
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
      var g = ctx.createGain(); g.gain.setValueAtTime(0.22 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.3);
    }
    schedule();
    A.music = m;
  };
  // gains crossfade 3s on stage change — layers never restart, stay phase-aligned
  A.setStage = function (stage) {
    if (!A.ok || !A.music) return;
    if (stage === A.music.stage) return;
    if (stage > A.music.stage) A.play('stinger_brass', {});
    A.music.stage = stage;
    var names = ['calm', 'wary', 'alarmed', 'lockdown'];
    names.forEach(function (n, i) {
      var target = i <= stage ? 1 : 0;
      A.music.layers[n].gain.setTargetAtTime(target, A.ctx.currentTime, LB.C.MUSIC_XFADE_S / 3);
    });
  };
  A.setChase = function (on) {
    if (!A.ok || !A.music || A.music.chase === on) return;
    A.music.chase = on;
    A.music.tremGain.gain.setTargetAtTime(on ? 0.2 : 0.1, A.ctx.currentTime, 0.3); // +6dB while chased
  };
  A.stopMusic = function () {
    if (A.music && A.music.timer) clearTimeout(A.music.timer);
    A.music = null;
  };

  return A;
};

if (typeof module !== 'undefined') module.exports = LB;
