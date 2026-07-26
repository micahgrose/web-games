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

  // ---------- foley recipes (§4.5) — each named, each soundboard-addressable ----------
  A.recipes = {
    // footsteps by material
    step_carpet: function (sp) { envNoise(sp2(sp, 0.35), 0.06, 'bandpass', 200, 1); },
    step_wood: function (sp) { envNoise(sp2(sp, 0.5), 0.08, 'bandpass', 400, 1.5); },
    step_marble: function (sp) {
      envNoise(sp2(sp, 0.5), 0.05, 'bandpass', 900, 4);
      setTimeout(function () { if (A.ok) envNoise(sp2(sp, 0.2), 0.05, 'bandpass', 900, 4); }, 90); // slap-back
    },
    step_glass: function (sp) { for (var i = 0; i < 3; i++) envNoise(sp2(sp, 0.3), 0.03, 'bandpass', 1600 + Math.random() * 900, 5); },
    creak: function (sp) { tone(sp2(sp, 0.45), 0.12, 'sawtooth', 300, 180); },
    // the signature verb
    snuff_fwip: function (sp) { envNoise(sp2(sp, 0.6), 0.08, 'highpass', 1200, 1); tone(sp2(sp, 0.4), 0.1, 'sine', 800, 200); },
    relight_foomp: function (sp) { envNoise(sp2(sp, 0.5), 0.15, 'lowpass', 400, 1, 0.06); tone(sp2(sp, 0.2), 0.25, 'sine', 90, 70, { rate: 9, depth: 12 }); },
    // hands
    pick_tick: function (sp) { envNoise(sp2(sp, 0.4), 0.025, 'bandpass', 900, 8); },
    pick_success: function (sp) { fmPing(sp2(sp, 0.5), 0.25, 2400, 2.1, 1.5); },
    dial_tick: function (sp) { envNoise(sp2(sp, 0.3), 0.02, 'bandpass', 1100, 8); },
    dial_stop_thunk: function (sp) { tone(sp2(sp, 0.7), 0.09, 'sine', 350, 320); }, // the felt-click — the audio IS the interface
    drill: function (sp) { tone(sp2(sp, 0.4), 0.5, 'sawtooth', 120, 120); envNoise(sp2(sp, 0.25), 0.5, 'bandpass', 800, 1); },
    glass_cut: function (sp) { envNoise(sp2(sp, 0.3), 0.4, 'highpass', 3000, 2, 0.1); },
    glass_smash: function (sp) { for (var i = 0; i < 8; i++) setTimeout(function () { if (A.ok) envNoise(sp2(sp, 0.5), 0.06, 'bandpass', 1500 + Math.random() * 2500, 6); }, i * 25); },
    door_force: function (sp) { tone(sp2(sp, 0.9), 0.12, 'sine', 80, 50); envNoise(sp2(sp, 0.6), 0.15, 'lowpass', 500, 1); },
    door_creakopen: function (sp) { tone(sp2(sp, 0.25), 0.3, 'sawtooth', 220, 260); },
    bell_trap: function (sp) { for (var i = 0; i < 4; i++) setTimeout(function () { if (A.ok) fmPing(sp2(sp, 0.6), 0.4, 2800, 1.4, 3); }, i * 130); },
    blackjack_thump: function (sp) { tone(sp2(sp, 0.9), 0.1, 'sine', 90, 60); envNoise(sp2(sp, 0.4), 0.09, 'lowpass', 600, 1); },
    body_drag: function (sp) { envNoise(sp2(sp, 0.35), 0.3, 'lowpass', 300, 1, 0.1); },
    coin_lure: function (sp) { for (var i = 0; i < 3; i++) setTimeout(function () { if (A.ok) fmPing(sp2(sp, 0.4), 0.15, 4200 + Math.random() * 800, 3.7, 2); }, i * 70); },
    songbird: function (sp) { for (var i = 0; i < 3; i++) setTimeout(function () { if (A.ok) tone(sp2(sp, 0.35), 0.07, 'sine', 2600 + i * 300, 3100 + i * 200); }, i * 110); },
    smoke_burst: function (sp) { envNoise(sp2(sp, 0.7), 0.4, 'lowpass', 500, 1, 0.01); },
    gas_hiss: function (sp) { envNoise(sp2(sp, 0.5), 1.8, 'highpass', 2500, 1, 0.2); },
    oil_slip: function (sp) { tone(sp2(sp, 0.5), 0.3, 'sine', 300, 60); envNoise(sp2(sp, 0.5), 0.2, 'lowpass', 400, 1); },
    dumbwaiter_clunk: function (sp) { tone(sp2(sp, 0.7), 0.1, 'sine', 140, 90); envNoise(sp2(sp, 0.3), 0.2, 'lowpass', 350, 1); },
    // alarm class
    whistle_blast: function (sp) { tone(sp2(sp, 0.8), 0.3, 'square', 2400, 2900); envNoise(sp2(sp, 0.3), 0.3, 'highpass', 2000, 1); },
    scream: function (sp) { envNoise(sp2(sp, 0.4), 0.08, 'highpass', 1200, 1); tone(sp2(sp, 0.6), 0.5, 'square', 800, 1200, { rate: 8, depth: 60 }); },
    // tells (loops assembled from these one-shots)
    whistle_note: function (sp, hz) { tone(sp2(sp, 0.35), 0.28, 'triangle', hz || 587, hz || 587, { rate: 5.5, depth: 6 }); },
    snore_in: function (sp) { envNoise(sp2(sp, 0.4), 0.7, 'lowpass', 350, 1, 0.3); },
    snore_out: function (sp) { envNoise(sp2(sp, 0.25), 0.5, 'lowpass', 250, 1, 0.05); },
    key_jangle: function (sp) { var n = 4 + Math.floor(Math.random() * 3); for (var i = 0; i < n; i++) setTimeout(function () { if (A.ok) fmPing(sp2(sp, 0.3), 0.08, 2000 + Math.random() * 2000, 3.7, 2); }, i * 30); },
    dog_pant: function (sp) { envNoise(sp2(sp, 0.4), 0.09, 'bandpass', 800, 2); },
    dog_snuffle: function (sp) { for (var i = 0; i < 2; i++) setTimeout(function () { if (A.ok) envNoise(sp2(sp, 0.4), 0.06, 'bandpass', 500, 3); }, i * 90); },
    dog_bark: function (sp) { tone(sp2(sp, 0.9), 0.15, 'sawtooth', 300, 180); envNoise(sp2(sp, 0.4), 0.12, 'bandpass', 600, 2); },
    order_bark: function (sp) { tone(sp2(sp, 0.7), 0.18, 'square', 220, 160); envNoise(sp2(sp, 0.3), 0.15, 'bandpass', 900, 1); },
    rifle_cock: function (sp) { envNoise(sp2(sp, 0.6), 0.02, 'bandpass', 2200, 8); setTimeout(function () { if (A.ok) envNoise(sp2(sp, 0.6), 0.03, 'bandpass', 1600, 8); }, 80); },
    tough_hum: function (sp) { var notes = [196, 233, 175, 220]; tone(sp2(sp, 0.25), 0.4, 'triangle', notes[Math.floor(Math.random() * 4)]); },
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
