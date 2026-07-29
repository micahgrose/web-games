'use strict';
// SOUND TESTING — offline measurement for the creak lab.
//
// Renders every candidate in js/creaks.js through a real WebAudio
// implementation and reports what it objectively IS. I cannot hear; this keeps
// me from shipping errors of KIND (pitch falling when it should rise, a
// "texture" that is really a smear, two candidates 15dB apart so the loud one
// wins for the wrong reason). It cannot tell us which creak is BEST — that is
// the user's ear, and the user's ear overrules this file every time.
//
// The DSP lives in dsp.js, shared with test/reference.js, so a synthesized
// candidate and a real recording are measured by identical code — otherwise
// every comparison between the two would be meaningless.
//
//   node test/measure.js              table + sanity checks
//   node test/measure.js --reps 15    more renders (these sounds are stochastic)
//   node test/measure.js --wav DIR    also dump WAVs
var fs = require('fs'), path = require('path');
var D = require('./dsp.js');

var WAA = D.loadWAA();
if (!WAA) { console.log('needs a WebAudio implementation:  npm install node-web-audio-api'); process.exit(0); }

var Creaks = require(path.join(__dirname, '..', 'js', 'creaks.js'));
var SR = 44100, RENDER_S = 3;

function analyze(mono) { return D.analyze(mono, SR); }
function writeWav(file, mono) { D.writeWav(file, mono, SR); }

function render(id) {
  var ctx = new WAA.OfflineAudioContext(1, SR * RENDER_S, SR);
  var lab = Creaks.Lab(ctx, ctx.destination);
  lab[id](1, 0);
  return ctx.startRendering().then(function (buf) {
    var c = buf.getChannelData(0), mono = new Float32Array(c.length);
    mono.set(c);
    return { id: id, a: analyze(mono), mono: mono };
  });
}


(async function () {
  var only = process.argv.filter(function (a) { return /^r\d/.test(a); });
  var list = Creaks.CATALOG.filter(function (c) { return !only.length || only.indexOf(c.id) >= 0; });
  var wi = process.argv.indexOf('--wav');
  var wavDir = wi > 0 ? (process.argv[wi + 1] || '.') : null;
  if (wavDir && !fs.existsSync(wavDir)) fs.mkdirSync(wavDir, { recursive: true });

  var pad = function (s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); };
  var num = function (v, d) { return (v === undefined || v === null || isNaN(v) || !v) ? '  -' : v.toFixed(d === undefined ? 0 : d); };
  // These recipes are stochastic by design (per-slip jitter, random surge
  // humps, a random-walk waver), so ONE render is not a measurement — the first
  // level-match pass chased a 5dB swing that was just the dice. Render each
  // candidate several times and take the median of every metric.
  var ri = process.argv.indexOf('--reps');
  var REPS = ri > 0 ? +process.argv[ri + 1] : 7;
  var median = function (xs) {
    var v = xs.filter(function (x) { return x && !isNaN(x); }).sort(function (a, b) { return a - b; });
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  };
  var rows = [];
  for (var i = 0; i < list.length; i++) {
    var takes = [];
    for (var rep = 0; rep < REPS; rep++) {
      var r = await render(list[i].id);
      takes.push(r.a);
      if (wavDir && rep === 0) writeWav(path.join(wavDir, list[i].id + '.wav'), r.mono);
    }
    var agg = {};
    Object.keys(takes[0]).forEach(function (k) {
      agg[k] = median(takes.map(function (t) { return t[k]; }));
    });
    agg.peakSpread = Math.max.apply(null, takes.map(function (t) { return t.peakDb; })) -
                     Math.min.apply(null, takes.map(function (t) { return t.peakDb; }));
    rows.push({ c: list[i], a: agg });
  }

  console.log('\nCREAK LAB — ' + rows.length + ' candidates, median of ' + REPS + ' renders @' + SR + 'Hz\n');
  console.log(pad('id', 6) + pad('peak', 9) + pad('±', 6) + pad('dur', 8) + pad('centroid', 10) +
    pad('cent s>e', 12) + pad('flat', 7) + pad('onsets', 8) + pad('ioiCV', 7) +
    'slip rate (Hz)  early > late > tail');
  console.log('-'.repeat(124));
  rows.forEach(function (r) {
    var a = r.a;
    console.log(pad(r.c.id, 6) + pad(num(a.peakDb, 1) + 'dB', 9) + pad(num(a.peakSpread, 1), 6) + pad(num(a.dur, 2) + 's', 8) +
      pad(num(a.centroid) + 'Hz', 10) + pad(num(a.centroidStart) + '>' + num(a.centroidEnd), 12) +
      pad(num(a.flatness, 2), 7) + pad(a.onsets, 8) + pad(num(a.ioiCv, 2), 7) +
      num(a.f0Early) + ' > ' + num(a.f0Late) + ' > ' + num(a.f0Tail));
  });

  // ---------- sanity checks (not taste) ----------
  var problems = [];
  rows.forEach(function (r) {
    var a = r.a, id = r.c.id;
    if (a.peakDb < -60) return problems.push(id + ': silent');
    if (a.peakDb > -0.5) problems.push(id + ': clipping risk (peak ' + a.peakDb.toFixed(1) + 'dB)');
    if (Math.abs(a.dur - r.c.dur) > r.c.dur * 0.35)
      problems.push(id + ': measured ' + a.dur.toFixed(2) + 's vs intended ' + r.c.dur + 's');
    // Autocorrelation assumes ONE period. On a candidate with several
    // simultaneous slip generators it locks onto whichever source happens to
    // dominate a window and reports nonsense trajectories, so skip the f0
    // checks there rather than pretend the number means something.
    // A candidate built with interval CV 0.85 has no stable period BY DESIGN —
    // that is the mechanism under test. Autocorrelation reports something, but
    // whatever it reports is not a rate, so no direction check can apply.
    if (r.c.poly || r.c.irregular) return;
    // Direction is per-candidate, not universal. Round 5 is built to FALL
    // throughout (creak1.mp3 runs 143→44Hz), so asserting a rise there would be
    // the test contradicting the design rather than checking it.
    if (r.c.falls) {
      if (a.f0Early && a.f0Late && a.f0Late > a.f0Early * 0.95)
        problems.push(id + ': rate does not fall (' + Math.round(a.f0Early) + ' > ' + Math.round(a.f0Late) + 'Hz)');
      return;
    }
    if (a.f0Early && a.f0Late && a.f0Late < a.f0Early * 1.05)
      problems.push(id + ': rate does not rise (' + Math.round(a.f0Early) + ' > ' + Math.round(a.f0Late) + 'Hz)');
    if (a.f0Late && a.f0Tail && a.f0Tail > a.f0Late * 0.92)
      problems.push(id + ': no release/collapse at the end (' + Math.round(a.f0Late) + ' > ' + Math.round(a.f0Tail) + 'Hz)');
  });
  // Candidates in the same round must be LEVEL-MATCHED, or the round measures
  // loudness instead of timbre and the comparison is worthless.
  var byRound = {};
  rows.forEach(function (r) { (byRound[r.c.round] = byRound[r.c.round] || []).push(r); });
  Object.keys(byRound).forEach(function (k) {
    var ps = byRound[k].map(function (r) { return r.a.peakDb; });
    var spread = Math.max.apply(null, ps) - Math.min.apply(null, ps);
    if (spread > 4) problems.push('round ' + k + ': peaks span ' + spread.toFixed(1) + 'dB — level-match before asking anyone to compare timbre');
  });

  console.log('\n' + '='.repeat(100));
  if (problems.length) { console.log('CHECK (' + problems.length + '):'); problems.forEach(function (p) { console.log('  ! ' + p); }); }
  else console.log('All candidates match their measurable intent and are level-matched.');
  console.log('(Whether any of them sounds like a creak is the ear\'s call, not this file\'s.)');
})();
