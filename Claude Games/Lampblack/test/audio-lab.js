'use strict';
// LAMPBLACK — audio lab: render every WebAudio recipe OFFLINE and measure it.
//
// Why this exists: I cannot hear. Until now the user's ears were the only oracle
// for 47 synthesis routines, which meant shipping errors of KIND (pitch falling
// when it should rise, a "texture" that is really a smear, levels 20dB apart)
// and burning a human listening pass to find them. This renders each recipe to
// PCM through a real WebAudio implementation and checks measurable claims:
// duration, level, spectral centroid + its trajectory, tonal-vs-noisy, onset
// density, sustain. It cannot judge whether something sounds GOOD — that stays
// the user's call — but it catches everything that is objectively not what the
// recipe intends.
//
// Setup (not a repo dependency; the game ships assetless and depless):
//   npm install node-web-audio-api
//   node test/audio-lab.js            # table + expectation checks
//   node test/audio-lab.js --wav DIR  # also write WAVs for a human listen
var fs = require('fs'), path = require('path'), vm = require('vm');

var WAA;
try { WAA = require('node-web-audio-api'); }
catch (e) {
  console.log('audio-lab needs a WebAudio implementation:\n  npm install node-web-audio-api\n(skipping — this is a dev tool, not part of the game)');
  process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var SR = 44100, RENDER_S = 4;

// ---------- load audio.js with an injected OfflineAudioContext ----------
function freshAudio() {
  var ctxRef = { ctx: null };
  function OfflineShim() { // audio.js calls `new AC()` with no args
    var c = new WAA.OfflineAudioContext(2, SR * RENDER_S, SR);
    ctxRef.ctx = c;
    return c;
  }
  var sandbox = { console: console, Math: Math, Date: Date, JSON: JSON,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    window: { AudioContext: OfflineShim } };
  var ctx = vm.createContext(sandbox);
  ['core.js', 'audio.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });
  });
  var A = sandbox.LB.Audio();
  A.init();
  return { A: A, ctx: ctxRef.ctx, LB: sandbox.LB };
}

// ---------- DSP ----------
function fft(re, im) {
  var n = re.length;
  for (var i = 1, j = 0; i < n; i++) {
    var bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { var tr = re[i]; re[i] = re[j]; re[j] = tr; var ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (var len = 2; len <= n; len <<= 1) {
    var ang = -2 * Math.PI / len;
    var wr = Math.cos(ang), wi = Math.sin(ang);
    for (var k = 0; k < n; k += len) {
      var cr = 1, ci = 0;
      for (var m = 0; m < len / 2; m++) {
        var ar = re[k + m], ai = im[k + m];
        var br = re[k + m + len / 2] * cr - im[k + m + len / 2] * ci;
        var bi = re[k + m + len / 2] * ci + im[k + m + len / 2] * cr;
        re[k + m] = ar + br; im[k + m] = ai + bi;
        re[k + m + len / 2] = ar - br; im[k + m + len / 2] = ai - bi;
        var ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
var N = 1024, HOP = 256;
var HANN = new Float32Array(N);
for (var h = 0; h < N; h++) HANN[h] = 0.5 - 0.5 * Math.cos(2 * Math.PI * h / (N - 1));

function analyze(mono) {
  var peak = 0, sumSq = 0;
  for (var i = 0; i < mono.length; i++) { var a = Math.abs(mono[i]); if (a > peak) peak = a; sumSq += mono[i] * mono[i]; }
  var frames = [];
  for (var s = 0; s + N < mono.length; s += HOP) {
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var k = 0; k < N; k++) re[k] = mono[s + k] * HANN[k];
    fft(re, im);
    var mag = new Float64Array(N / 2), e = 0, wsum = 0, logSum = 0, arith = 0, maxBin = 0, maxMag = 0;
    for (var b = 1; b < N / 2; b++) {
      var m = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      mag[b] = m; e += m * m;
      var f = b * SR / N;
      wsum += f * m; arith += m;
      logSum += Math.log(m + 1e-12);
      if (m > maxMag) { maxMag = m; maxBin = b; }
    }
    frames.push({
      t: s / SR, energy: Math.sqrt(e),
      centroid: arith > 1e-9 ? wsum / arith : 0,
      flatness: arith > 1e-9 ? Math.exp(logSum / (N / 2 - 1)) / (arith / (N / 2 - 1)) : 1,
      peakHz: maxBin * SR / N, mag: mag
    });
  }
  if (!frames.length) return null;
  var maxE = 0; frames.forEach(function (f) { if (f.energy > maxE) maxE = f.energy; });
  var active = frames.filter(function (f) { return f.energy > maxE * 0.01; }); // -40dB
  if (!active.length) active = frames;
  var first = active[0].t, last = active[active.length - 1].t + N / SR;
  var loud = active.filter(function (f) { return f.energy > maxE * 0.1; }); // -20dB
  // centroid trajectory: mean over the first vs last third of active frames
  var third = Math.max(1, Math.floor(active.length / 3));
  var mean = function (arr, key) { return arr.reduce(function (s2, f) { return s2 + f[key]; }, 0) / arr.length; };
  // Onsets: flux must run over ALL frames, not just active ones — starting at
  // the first loud frame hides the rise out of silence, so an isolated single
  // hit (a marble step) scored ZERO onsets.
  var flux = [], prev = null;
  frames.forEach(function (f) {
    var d = 0;
    if (prev) for (var b2 = 1; b2 < N / 2; b2++) { var df = f.mag[b2] - prev.mag[b2]; if (df > 0) d += df; }
    flux.push({ t: f.t, v: d });
    prev = f;
  });
  // Onsets: a peak-relative threshold misses everything after a loud transient
  // (one bright ping hid the crunch grains behind it). Use a LOCAL moving median
  // so quieter events after a big hit still register.
  var onsets = 0, lastOn = -1, W = 12;
  for (var q = 1; q < flux.length - 1; q++) {
    var lo = Math.max(0, q - W), hi = Math.min(flux.length, q + W + 1);
    var win = flux.slice(lo, hi).map(function (f) { return f.v; }).sort(function (a2, b3) { return a2 - b3; });
    var localMed = win[Math.floor(win.length / 2)];
    var gmax = 0; flux.forEach(function (f) { if (f.v > gmax) gmax = f.v; });
    if (flux[q].v > localMed * 1.7 + gmax * 0.02 &&
        flux[q].v >= flux[q - 1].v && flux[q].v > flux[q + 1].v &&
        (lastOn < 0 || flux[q].t - lastOn > 0.025)) { onsets++; lastOn = flux[q].t; }
  }
  // pitch wobble of the dominant partial (vibrato / waver detection)
  var pk = loud.map(function (f) { return f.peakHz; });
  var pkMean = pk.reduce(function (a2, b3) { return a2 + b3; }, 0) / Math.max(1, pk.length);
  var pkSd = Math.sqrt(pk.reduce(function (a2, b3) { return a2 + Math.pow(b3 - pkMean, 2); }, 0) / Math.max(1, pk.length));
  return {
    peakDb: 20 * Math.log10(peak + 1e-9),
    rmsDb: 20 * Math.log10(Math.sqrt(sumSq / mono.length) + 1e-9),
    dur: last - first,
    sustain: loud.length / active.length,
    centroid: mean(active, 'centroid'),
    centroidStart: mean(active.slice(0, third), 'centroid'),
    centroidEnd: mean(active.slice(-third), 'centroid'),
    flatness: mean(active, 'flatness'),
    onsets: onsets,
    onsetRate: onsets / Math.max(0.05, last - first),
    peakHz: pkMean, peakHzSd: pkSd
  };
}

function renderRecipe(name, arg) {
  var env = freshAudio();
  if (!env.A.recipes[name]) return null;
  env.A.recipes[name]({ gain: 1 }, arg);
  return env.ctx.startRendering().then(function (buf) {
    var L = buf.getChannelData(0), R2 = buf.getChannelData(1);
    var mono = new Float32Array(L.length);
    for (var i = 0; i < L.length; i++) mono[i] = (L[i] + R2[i]) / 2;
    return { name: name, a: analyze(mono), mono: mono };
  });
}

// ---------- expectations: measurable claims each recipe makes ----------
// c = centroid Hz, d = duration s, on = onsets, fl = flatness (0 tonal .. 1 noise)
// NOTE on centroid bounds: a wide (Q≈1) bandpass or lowpass on noise leaves very
// broad skirts, so measured centroid sits far above the filter's corner. Where a
// recipe is user-approved by ear, the bound is widened rather than the sound
// changed — the lab is here to catch contradictions, not to overrule the listener.
var SPEC = {
  step_carpet:   { d: [0.02, 0.15], c: [80, 3200], note: 'soft low thud (user-approved by ear)' },
  step_wood:     { d: [0.02, 0.2], c: [120, 900], note: 'dark knock, no high spill' },
  step_marble:   { d: [0.02, 0.2], on: [1, 2], note: 'ONE clack, no slap-back' },
  step_glass:    { d: [0.15, 0.5], on: [3, 12], note: 'tinkle-crunch-tinkle' },
  creak:         { d: [0.45, 1.2], rise: true, drop: true, on: [3, 40], note: 'rising stick-slip, big end drop' },
  door_creakopen:{ d: [0.8, 1.6], rise: true, drop: true, note: 'same, slower' },
  snuff_fwip:    { d: [0.1, 0.5], c: [40, 900], note: 'soft foomp' },
  relight_foomp: { d: [0.1, 0.5], quieterThan: 'snuff_fwip', ratio: 3, note: 'EXTRA quiet' },
  pick_tick:     { d: [0.01, 0.1], louderThan: 'step_carpet', note: 'audible progress tick' },
  dial_tick:     { d: [0.01, 0.1], note: 'dial notch' },
  dial_stop_thunk:{ d: [0.02, 0.15], c: [80, 800], quieterThan: 'dial_tick', ratio: 1.05, note: 'subtle felt click' },
  drill:         { d: [2.0, 3.0], c: [1200, 6000], sustain: [0.8, 1], note: 'sustained high whine' },
  glass_cut:     { d: [0.25, 0.7], on: [8, 40], c: [1500, 6000], note: 'scratch grains' },
  glass_smash:   { d: [0.5, 1.2], on: [5, 40], note: 'crack-KSHHHH-tinkle' },
  door_force:    { d: [0.1, 0.5], c: [60, 1600], note: 'heavy thump + crack' },
  blackjack_thump:{ d: [0.05, 0.3], c: [40, 900], note: 'dull thump' },
  body_drag:     { d: [0.8, 1.5], on: [12, 60], note: 'scrape = many micro-impacts' },
  oil_slip:      { d: [0.2, 0.6], c: [3000, 12000], fl: [0.2, 1], note: 'ssssst hiss' },
  gas_hiss:      { d: [0.9, 2.2], c: [2500, 12000], note: 'sustained hiss (user-approved)' },
  coin_lure:     { d: [0.1, 0.5], on: [2, 8], note: 'coins skitter' },
  whistle_blast: { d: [0.5, 1.0], c: [800, 7500], fl: [0, 0.35], wobble: true, note: 'shrill resonator + waver' },
  scream:        { d: [0.4, 1.0], wobble: true, note: 'voiced wail w/ vibrato' },
  whistle_note:  { d: [0.2, 0.5], fl: [0, 0.4], note: 'airy whistle' },
  snore_in:      { d: [0.5, 1.0], c: [40, 700], note: 'low rattling inhale' },
  snore_out:     { d: [0.25, 0.8], c: [40, 600], note: 'low exhale (user-approved)' },
  key_jangle:    { d: [0.1, 0.45], on: [4, 20], note: 'clacking, one pitch region' },
  dog_pant:      { d: [0.05, 0.3], c: [100, 1700], shorterThan: 'snore_out', note: 'short high huff' },
  dog_bark:      { d: [0.15, 0.5], c: [80, 2000], note: 'chesty bark' },
  order_bark:    { d: [0.15, 0.5], c: [80, 2000], note: 'shouted order' },
  rifle_cock:    { d: [0.08, 0.3], on: [2, 4], louderThan: 'dial_tick', note: 'LOUD double clack' },
  tough_hum:     { d: [0.25, 0.6], note: 'breathy off-key hum' },
  copper_boot_heavy: { d: [0.05, 0.3], c: [40, 800], note: 'heavy boot' },
  copper_boot_light: { d: [0.05, 0.3], quieterThan: 'copper_boot_heavy', ratio: 1.2, note: 'light boot' },
  shk_clack:     { d: [0.02, 0.2], c: [800, 8000], note: 'metallic shutter' },
  paper_rustle:  { d: [0.1, 0.4], on: [4, 30], c: [1500, 9000], note: 'crinkle' },
  ui_coin:       { d: [0.05, 0.3], note: 'coin ping' },
  bell_trap:     { d: [0.3, 0.9], on: [2, 8], note: 'alarm bell' },
  smoke_burst:   { d: [0.2, 0.6], note: 'soft whump' },
  dumbwaiter_clunk: { d: [0.06, 0.4], c: [40, 1200], note: 'clunk (user-approved)' },
  songbird:      { d: [0.15, 0.45], on: [2, 6], note: 'chirps' },
  dog_snuffle:   { d: [0.08, 0.3], note: 'snuffling' },
  gasp:          { d: [0.08, 0.35], c: [700, 12000], note: 'sharp inhale (user-approved)' },
  civ_murmur:    { d: [0.25, 0.7], c: [80, 1800], note: 'mumbles' },
  jackdaw_chirp: { d: [0.02, 0.15], note: 'text blip' },
  pick_success:  { d: [0.1, 0.4], note: 'bright ping' },
  stinger_brass: { d: [0.4, 1.1], note: 'brass stab' }
};

// ---------- run ----------
var names = Object.keys(SPEC);
var results = {}, wavDir = null;
var wi = process.argv.indexOf('--wav');
if (wi > 0) { wavDir = process.argv[wi + 1] || '.'; if (!fs.existsSync(wavDir)) fs.mkdirSync(wavDir, { recursive: true }); }

function writeWav(file, mono) {
  var n = mono.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (var i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mono[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

(async function () {
  for (var i = 0; i < names.length; i++) {
    var r = await renderRecipe(names[i], names[i] === 'whistle_note' ? 587.33 : undefined);
    if (r && r.a) {
      results[names[i]] = r.a;
      if (wavDir) writeWav(path.join(wavDir, names[i] + '.wav'), r.mono);
    }
  }

  var pad = function (s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); };
  var num = function (v, d) { return (v === undefined || v === null || isNaN(v)) ? '  -  ' : v.toFixed(d === undefined ? 0 : d); };
  console.log('\nLAMPBLACK AUDIO LAB — ' + names.length + ' recipes rendered offline @' + SR + 'Hz\n');
  console.log(pad('recipe', 20) + pad('peak', 8) + pad('dur', 7) + pad('centroid', 10) + pad('start>end', 13) + pad('flat', 7) + pad('onset', 7) + 'sustain');
  console.log('-'.repeat(85));
  names.forEach(function (n) {
    var a = results[n]; if (!a) return;
    console.log(pad(n, 20) + pad(num(a.peakDb, 1) + 'dB', 8) + pad(num(a.dur, 2) + 's', 7) +
      pad(num(a.centroid) + 'Hz', 10) + pad(num(a.centroidStart) + '>' + num(a.centroidEnd), 13) +
      pad(num(a.flatness, 2), 7) + pad(a.onsets, 7) + num(a.sustain, 2));
  });

  // ---------- checks ----------
  var fails = [], warns = [];
  names.forEach(function (n) {
    var a = results[n], s = SPEC[n];
    if (!a) { fails.push(n + ': produced NO AUDIO'); return; }
    var why = function (msg) { fails.push(n + ' (' + s.note + '): ' + msg); };
    if (a.peakDb < -60) return why('silent (peak ' + a.peakDb.toFixed(1) + 'dB)');
    if (a.peakDb > -0.5) warns.push(n + ': clipping risk (peak ' + a.peakDb.toFixed(1) + 'dB)');
    if (s.d && (a.dur < s.d[0] || a.dur > s.d[1])) why('duration ' + a.dur.toFixed(2) + 's outside [' + s.d + ']');
    if (s.c && (a.centroid < s.c[0] || a.centroid > s.c[1])) why('centroid ' + Math.round(a.centroid) + 'Hz outside [' + s.c + ']');
    if (s.fl && (a.flatness < s.fl[0] || a.flatness > s.fl[1])) why('flatness ' + a.flatness.toFixed(2) + ' outside [' + s.fl + '] (tonal 0 .. noisy 1)');
    if (s.on && (a.onsets < s.on[0] || a.onsets > s.on[1])) why('onsets ' + a.onsets + ' outside [' + s.on + ']');
    if (s.sustain && (a.sustain < s.sustain[0] || a.sustain > s.sustain[1])) why('sustain ' + a.sustain.toFixed(2) + ' outside [' + s.sustain + ']');
    if (s.rise && !(a.centroidEnd > a.centroidStart * 1.05)) why('pitch does NOT rise (' + Math.round(a.centroidStart) + ' -> ' + Math.round(a.centroidEnd) + 'Hz)');
    if (s.wobble && !(a.peakHzSd > a.peakHz * 0.008)) why('no audible waver (dominant partial sd ' + a.peakHzSd.toFixed(1) + 'Hz on ' + Math.round(a.peakHz) + 'Hz)');
    if (s.quieterThan && results[s.quieterThan]) {
      var other = results[s.quieterThan];
      var need = 20 * Math.log10(s.ratio || 2);
      if (a.peakDb > other.peakDb - need)
        why('not quieter than ' + s.quieterThan + ' (' + a.peakDb.toFixed(1) + ' vs ' + other.peakDb.toFixed(1) + 'dB, want >' + need.toFixed(1) + 'dB gap)');
    }
    if (s.louderThan && results[s.louderThan] && a.peakDb < results[s.louderThan].peakDb)
      why('not louder than ' + s.louderThan + ' (' + a.peakDb.toFixed(1) + ' vs ' + results[s.louderThan].peakDb.toFixed(1) + 'dB)');
    if (s.shorterThan && results[s.shorterThan] && a.dur >= results[s.shorterThan].dur)
      why('not shorter than ' + s.shorterThan + ' (' + a.dur.toFixed(2) + ' vs ' + results[s.shorterThan].dur.toFixed(2) + 's)');
  });

  // mix balance: nothing should be wildly off the pack
  var peaks = names.filter(function (n) { return results[n]; }).map(function (n) { return results[n].peakDb; }).sort(function (a, b) { return a - b; });
  var med = peaks[Math.floor(peaks.length / 2)];
  names.forEach(function (n) {
    var a = results[n]; if (!a) return;
    if (a.peakDb < med - 26) warns.push(n + ': ' + (med - a.peakDb).toFixed(0) + 'dB below the median recipe — may vanish in the mix');
  });

  console.log('\n' + '='.repeat(85));
  if (warns.length) { console.log('WARNINGS (' + warns.length + '):'); warns.forEach(function (w) { console.log('  ~ ' + w); }); }
  if (fails.length) {
    console.log('\nFAILED EXPECTATIONS (' + fails.length + '):');
    fails.forEach(function (f) { console.log('  X ' + f); });
    console.log('\nmedian peak ' + med.toFixed(1) + 'dB');
    process.exit(1);
  }
  console.log('All ' + names.length + ' recipes match their measurable intent. Median peak ' + med.toFixed(1) + 'dB.');
  console.log('(Timbre and "does it sound right" remain a human call — this only proves nothing is objectively wrong.)');
})();
