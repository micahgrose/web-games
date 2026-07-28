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
//   node test/measure.js              table + sanity checks
//   node test/measure.js --wav DIR    also dump WAVs
var fs = require('fs'), path = require('path');

var WAA = null;
['node-web-audio-api',
 path.join(__dirname, '..', 'node_modules', 'node-web-audio-api'),
 path.join(__dirname, '..', '..', 'Lampblack', 'node_modules', 'node-web-audio-api')
].some(function (p) { try { WAA = require(p); return true; } catch (e) { return false; } });
if (!WAA) {
  console.log('needs a WebAudio implementation:  npm install node-web-audio-api');
  process.exit(0);
}

var Creaks = require(path.join(__dirname, '..', 'js', 'creaks.js'));
var SR = 44100, RENDER_S = 3;

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
    var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
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
var N = 1024, HOP = 256, HANN = new Float32Array(N);
for (var h = 0; h < N; h++) HANN[h] = 0.5 - 0.5 * Math.cos(2 * Math.PI * h / (N - 1));

// Autocorrelation f0. Spectral centroid is NOT a proxy for the slip rate: the
// body resonance — not the source — sets the spectral shape, which is the whole
// design premise. Measure the period itself.
// Normalized autocorrelation, peak-picked AFTER the first zero crossing.
// Taking the global max over all lags is wrong and silently returns the minimum
// lag for anything low-pitched: correlation is ~1 for tiny lags on any smooth
// signal, so a 110Hz groan reads as 2756Hz (= SR/minLag). Skipping past the
// first negative lobe forces the search onto a real period.
function f0(s, from, to) {
  var minLag = Math.floor(SR / 2600), maxLag = Math.floor(SR / 40);
  from = Math.max(0, Math.floor(from)); to = Math.min(s.length, Math.floor(to));
  if (to - from < maxLag * 2) return 0;
  var mean = 0, i;
  for (i = from; i < to; i++) mean += s[i];
  mean /= (to - from);
  var corr = new Float64Array(maxLag + 1);
  for (var lag = minLag; lag <= maxLag; lag++) {
    var num = 0, d1 = 0, d2 = 0;
    for (i = from; i + lag < to; i++) {
      var a = s[i] - mean, b = s[i + lag] - mean;
      num += a * b; d1 += a * a; d2 += b * b;
    }
    corr[lag] = num / Math.sqrt(d1 * d2 + 1e-12);
  }
  var start = minLag;
  while (start <= maxLag && corr[start] > 0) start++;   // past the first lobe
  var best = 0, bestLag = 0;
  for (var l = start; l <= maxLag; l++) if (corr[l] > best) { best = corr[l]; bestLag = l; }
  return (bestLag && best > 0.25) ? SR / bestLag : 0;
}

function analyze(mono) {
  var peak = 0, sumSq = 0, i;
  for (i = 0; i < mono.length; i++) { var a = Math.abs(mono[i]); if (a > peak) peak = a; sumSq += mono[i] * mono[i]; }
  var frames = [];
  for (var s = 0; s + N < mono.length; s += HOP) {
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var k = 0; k < N; k++) re[k] = mono[s + k] * HANN[k];
    fft(re, im);
    var mag = new Float64Array(N / 2), e = 0, wsum = 0, arith = 0, logSum = 0;
    for (var b = 1; b < N / 2; b++) {
      var m = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      mag[b] = m; e += m * m;
      wsum += (b * SR / N) * m; arith += m; logSum += Math.log(m + 1e-12);
    }
    frames.push({ t: s / SR, energy: Math.sqrt(e),
      centroid: arith > 1e-9 ? wsum / arith : 0,
      flatness: arith > 1e-9 ? Math.exp(logSum / (N / 2 - 1)) / (arith / (N / 2 - 1)) : 1,
      mag: mag });
  }
  if (!frames.length) return null;
  var maxE = 0; frames.forEach(function (f) { if (f.energy > maxE) maxE = f.energy; });
  var active = frames.filter(function (f) { return f.energy > maxE * 0.01; });
  if (!active.length) active = frames;
  var first = active[0].t, last = active[active.length - 1].t + N / SR;
  var third = Math.max(1, Math.floor(active.length / 3));
  var mean = function (arr, key) { return arr.reduce(function (x, f) { return x + f[key]; }, 0) / arr.length; };

  // Onsets by spectral flux over a LOCAL median (so quiet events after a loud
  // transient still register), seeded from silence so the attack counts.
  var flux = [], prev = { mag: new Float64Array(N / 2) };
  frames.forEach(function (f) {
    var d = 0;
    for (var b2 = 1; b2 < N / 2; b2++) { var df = f.mag[b2] - prev.mag[b2]; if (df > 0) d += df; }
    flux.push({ t: f.t, v: d }); prev = f;
  });
  var gmax = 0; flux.forEach(function (f) { if (f.v > gmax) gmax = f.v; });
  var times = [], lastOn = -1, W = 12;
  for (var q = 0; q < flux.length; q++) {
    var lo = Math.max(0, q - W), hi = Math.min(flux.length, q + W + 1);
    var win = flux.slice(lo, hi).map(function (f) { return f.v; }).sort(function (x, y) { return x - y; });
    var med = win[Math.floor(win.length / 2)];
    var pv = q > 0 ? flux[q - 1].v : 0, nx = q < flux.length - 1 ? flux[q + 1].v : 0;
    if (flux[q].v > med * 1.7 + gmax * 0.02 && flux[q].v >= pv && flux[q].v > nx &&
        (lastOn < 0 || flux[q].t - lastOn > 0.018)) { times.push(flux[q].t); lastOn = flux[q].t; }
  }
  // Irregularity of the surge pattern: sd/mean of inter-onset intervals. A
  // machine is regular (near 0); effort against friction is not.
  var iois = [];
  for (i = 1; i < times.length; i++) iois.push(times[i] - times[i - 1]);
  var ioiMean = iois.length ? iois.reduce(function (x, y) { return x + y; }, 0) / iois.length : 0;
  var ioiCv = iois.length > 1 ? Math.sqrt(iois.reduce(function (x, y) { return x + Math.pow(y - ioiMean, 2); }, 0) / iois.length) / ioiMean : 0;

  var sFrom = first * SR, span = (last - first) * SR;
  return {
    peakDb: 20 * Math.log10(peak + 1e-9),
    rmsDb: 20 * Math.log10(Math.sqrt(sumSq / mono.length) + 1e-9),
    dur: last - first,
    centroid: mean(active, 'centroid'),
    centroidStart: mean(active.slice(0, third), 'centroid'),
    centroidEnd: mean(active.slice(-third), 'centroid'),
    flatness: mean(active, 'flatness'),
    onsets: times.length,
    ioiCv: ioiCv,
    f0Early: f0(mono, sFrom + span * 0.10, sFrom + span * 0.32),
    f0Late: f0(mono, sFrom + span * 0.58, sFrom + span * 0.80),
    f0Tail: f0(mono, sFrom + span * 0.86, sFrom + span * 1.0)
  };
}

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
    pad('cent s>e', 12) + pad('flat', 7) + pad('onsets', 8) + pad('ioiCV', 7) + 'f0  early>late>tail');
  console.log('-'.repeat(106));
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
    if (r.c.poly) return;
    if (a.f0Early && a.f0Late && a.f0Late < a.f0Early * 1.05)
      problems.push(id + ': slip rate does not rise (' + Math.round(a.f0Early) + ' > ' + Math.round(a.f0Late) + 'Hz)');
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
