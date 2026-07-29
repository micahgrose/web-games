'use strict';
// SOUND TESTING — deep analysis: the things the first pass did NOT measure.
//
// Round 4 matched the references on every gross statistic (duration, slip rate,
// band energy, centroid) and still didn't sound like a creak. So the difference
// is in structure the first pass never looked at. This measures six things:
//
//  1. THE SLIP PULSE ITSELF — pitch-synchronous average of one release cycle.
//     Everything so far assumed a linear load ramp and a fast fall. This shows
//     what one actual release looks like: where the peak sits, how long the
//     load takes, whether it rings afterwards.
//  2. CREST FACTOR — peak over RMS. How impulsive the sound really is. A pulse
//     train of sharp releases is spiky; a continuous buzz is not.
//  3. MODULATION DEPTH — how far the amplitude falls BETWEEN releases. This is
//     the difference between hearing separate slips and hearing a tone.
//  4. MODULATION SPECTRUM — the spectrum of the envelope below 60Hz: the rate
//     of the surges and shudders, which is a different quantity from the slip
//     rate and one I have only ever set by taste.
//  5. INTERVAL STATISTICS — are slip intervals independent (my uniform jitter)
//     or correlated, and is the distribution symmetric or skewed?
//  6. PERIODICITY STRENGTH OVER TIME — not "is it periodic" but "how strongly",
//     across the sound. Real friction may firm up and fall apart repeatedly.
//
//   node test/deep.js                  references
//   node test/deep.js --compare        references + my candidates
//   node test/deep.js r4a              specific candidates
var fs = require('fs'), path = require('path');
var D = require('./dsp.js');
var WAA = D.loadWAA();
if (!WAA) { console.log('needs node-web-audio-api'); process.exit(0); }

var REFDIR = path.join(__dirname, '..', 'reference');
var AUDIO = /\.(wav|mp3|flac|ogg|m4a|aac|aiff?|opus)$/i;
var args = process.argv.slice(2);
var COMPARE = args.indexOf('--compare') >= 0;
var ids = args.filter(function (a) { return /^r\d/.test(a); });

// ---------- slip instant detection ----------
// A release is the only sharp event in a creak, so differentiate, rectify and
// smooth: releases become peaks. Minimum separation comes from the measured
// local period so a body-mode ring can't be counted as a second slip.
function slipInstants(s, sr, period) {
  var sharp = new Float32Array(s.length), i;
  var e = 0, a = 1 - Math.exp(-2 * Math.PI * 1200 / sr);
  for (i = 1; i < s.length; i++) {
    var d = Math.abs(s[i] - s[i - 1]);
    e += a * (d - e);
    sharp[i] = e;
  }
  var minSep = Math.max(3, Math.round(period * sr * 0.62));
  var out = [], last = -1e9;
  var mx = 0;
  for (i = 0; i < sharp.length; i++) if (sharp[i] > mx) mx = sharp[i];
  for (i = 1; i < sharp.length - 1; i++) {
    if (sharp[i] > sharp[i - 1] && sharp[i] >= sharp[i + 1] && sharp[i] > mx * 0.12 && i - last >= minSep) {
      out.push(i); last = i;
    }
  }
  return out;
}

// Pitch-synchronous average: align one period at every release and average.
// Random body ringing and noise average away; whatever is locked to the release
// survives. This is the excitation shape, seen through the body.
function pulseShape(s, sr, instants, period) {
  var W = Math.round(period * sr);
  if (W < 8 || instants.length < 6) return null;
  var pre = Math.round(W * 0.35), n = W + pre;
  var acc = new Float64Array(n), used = 0;
  instants.forEach(function (p) {
    if (p - pre < 0 || p - pre + n >= s.length) return;
    var pk = 0, j;
    for (j = 0; j < n; j++) pk = Math.max(pk, Math.abs(s[p - pre + j]));
    if (pk < 1e-6) return;
    // normalize each cycle, else the loudest few dominate the average
    var sign = s[p] >= 0 ? 1 : -1;
    for (j = 0; j < n; j++) acc[j] += sign * s[p - pre + j] / pk;
    used++;
  });
  if (used < 6) return null;
  var pk2 = 0, k;
  for (k = 0; k < n; k++) { acc[k] /= used; pk2 = Math.max(pk2, Math.abs(acc[k])); }
  if (pk2 > 0) for (k = 0; k < n; k++) acc[k] /= pk2;
  return { w: acc, pre: pre, period: W, used: used };
}

function plotPulse(p, sr) {
  var rows = 9, cols = 62, out = [];
  var step = p.w.length / cols;
  var grid = [];
  for (var r = 0; r < rows; r++) grid.push(new Array(cols).fill(' '));
  for (var c = 0; c < cols; c++) {
    var a = 0, n = 0;
    for (var j = Math.floor(c * step); j < Math.floor((c + 1) * step) && j < p.w.length; j++) { a += p.w[j]; n++; }
    var v = n ? a / n : 0;
    var row = Math.round((1 - v) / 2 * (rows - 1));
    grid[Math.max(0, Math.min(rows - 1, row))][c] = '█';
  }
  var mark = Math.round(p.pre / p.w.length * cols);
  grid.forEach(function (g, r) {
    out.push('      ' + (r === Math.floor(rows / 2) ? '─' : ' ') + g.join(''));
  });
  var axis = new Array(cols).fill(' ');
  axis[mark] = '^';
  out.push('       ' + axis.join('') + '   ^ = the release');
  return out.join('\n');
}

function stats(xs) {
  var n = xs.length;
  if (!n) return { mean: 0, cv: 0, skew: 0, lag1: 0 };
  var m = xs.reduce(function (a, b) { return a + b; }, 0) / n;
  var v = xs.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / n;
  var sd = Math.sqrt(v);
  var sk = sd > 0 ? xs.reduce(function (a, b) { return a + Math.pow((b - m) / sd, 3); }, 0) / n : 0;
  var num = 0, den = 0;
  for (var i = 1; i < n; i++) num += (xs[i] - m) * (xs[i - 1] - m);
  for (i = 0; i < n; i++) den += (xs[i] - m) * (xs[i] - m);
  return { mean: m, cv: sd / (m || 1), skew: sk, lag1: den > 0 ? num / den : 0 };
}

// Spectrum of the amplitude envelope below 60Hz — the rate of surges, which is
// not the slip rate and which I have only ever set by taste.
function modSpectrum(s, sr) {
  var a = 1 - Math.exp(-2 * Math.PI * 90 / sr), e = 0;
  var env = [];
  var dec = Math.round(sr / 400);
  for (var i = 0; i < s.length; i++) {
    e += a * (Math.abs(s[i]) - e);
    if (i % dec === 0) env.push(e);
  }
  var esr = sr / dec;
  var N = 512;
  while (env.length < N) env.push(0);
  var m = env.slice(0, N).reduce(function (x, y) { return x + y; }, 0) / N;
  var re = new Float64Array(N), im = new Float64Array(N);
  for (i = 0; i < N; i++) re[i] = (env[i] - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  D.fft(re, im);
  var peaks = [];
  for (var b = 2; b < N / 2; b++) {
    var hz = b * esr / N;
    if (hz > 60) break;
    peaks.push({ hz: hz, mag: Math.sqrt(re[b] * re[b] + im[b] * im[b]) });
  }
  peaks.sort(function (x, y) { return y.mag - x.mag; });
  var top = [], mx = peaks.length ? peaks[0].mag : 1;
  peaks.forEach(function (p) {
    if (top.length >= 3) return;
    if (top.every(function (t) { return Math.abs(t.hz - p.hz) > 1.5; })) top.push({ hz: p.hz, rel: p.mag / mx });
  });
  return top;
}

function deep(name, s, sr) {
  s = D.trim(s, sr);
  var contour = D.slipContour(s, sr).filter(function (p) { return p.hz > 0; });
  if (!contour.length) { console.log('\n' + name + ': no periodic content'); return; }
  var hzs = contour.map(function (p) { return p.hz; }).sort(function (a, b) { return a - b; });
  var medHz = hzs[Math.floor(hzs.length / 2)];
  var period = 1 / medHz;

  var peak = 0, sumSq = 0, i;
  for (i = 0; i < s.length; i++) { var m = Math.abs(s[i]); if (m > peak) peak = m; sumSq += s[i] * s[i]; }
  var rms = Math.sqrt(sumSq / s.length);
  var crest = 20 * Math.log10(peak / (rms || 1e-9));

  var inst = slipInstants(s, sr, period);
  var iv = [];
  for (i = 1; i < inst.length; i++) iv.push((inst[i] - inst[i - 1]) / sr);
  var st = stats(iv);

  // modulation depth at the slip timescale: how far the envelope falls between
  // releases, measured as trough/peak inside each period
  var depth = 0, dn = 0;
  var w = Math.round(period * sr);
  for (i = 0; i + w < s.length; i += w) {
    var hi = 0, lo = 1e9;
    for (var j = i; j < i + w; j++) { var v = Math.abs(s[j]); if (v > hi) hi = v; if (v < lo) lo = v; }
    if (hi > peak * 0.1) { depth += 1 - lo / hi; dn++; }
  }
  depth = dn ? depth / dn : 0;

  console.log('\n' + '═'.repeat(72));
  console.log(name);
  console.log('═'.repeat(72));
  console.log('  crest factor      ' + crest.toFixed(1) + ' dB   (impulsive >18 … buzzy <12)');
  console.log('  modulation depth  ' + (depth * 100).toFixed(0) + '%   (how far it falls between slips)');
  var ms = modSpectrum(s, sr);
  console.log('  surge rates       ' + (ms.length ? ms.map(function (p) {
    return p.hz.toFixed(1) + 'Hz(' + (p.rel * 100).toFixed(0) + '%)';
  }).join('  ') : '—'));
  console.log('  slip intervals    ' + inst.length + ' releases   CV ' + st.cv.toFixed(2) +
    '   skew ' + st.skew.toFixed(2) + '   lag-1 corr ' + st.lag1.toFixed(2));
  console.log('                    (CV = jitter; skew>0 = occasional long gaps;');
  console.log('                     lag-1 = does a short interval follow a short one)');
  var first = contour[0].hz, last = contour[contour.length - 1].hz;
  var maxI = 0;
  contour.forEach(function (p, k) { if (p.hz > contour[maxI].hz) maxI = k; });
  console.log('  rate direction    ' + Math.round(first) + ' → ' + Math.round(last) + 'Hz, peak at ' +
    Math.round(100 * maxI / Math.max(1, contour.length - 1)) + '% through   ' +
    (last < first * 0.85 ? '*** FALLS ***' : last > first * 1.15 ? 'rises' : 'flat'));

  var p = pulseShape(s, sr, inst, period);
  if (p) {
    console.log('\n  ONE SLIP CYCLE, averaged over ' + p.used + ' releases (' +
      (period * 1000).toFixed(1) + 'ms):');
    console.log(plotPulse(p, sr));
    // where the energy sits inside the cycle
    var half = Math.round(p.w.length * 0.5), eA = 0, eB = 0;
    for (i = 0; i < p.w.length; i++) (i < half ? (eA += p.w[i] * p.w[i]) : (eB += p.w[i] * p.w[i]));
    console.log('      energy: first half ' + Math.round(100 * eA / (eA + eB + 1e-9)) +
      '%, second half ' + Math.round(100 * eB / (eA + eB + 1e-9)) + '%');
  } else {
    console.log('\n  (not enough clean releases to average a pulse shape)');
  }
}

(async function () {
  async function loadFile(f) {
    var buf = fs.readFileSync(f);
    var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    var ctx = new WAA.OfflineAudioContext(1, 128, 44100);
    var au = await ctx.decodeAudioData(ab);
    var n = au.length, mono = new Float32Array(n);
    for (var c = 0; c < au.numberOfChannels; c++) {
      var d = au.getChannelData(c);
      for (var i = 0; i < n; i++) mono[i] += d[i] / au.numberOfChannels;
    }
    var pk = 0;
    for (i = 0; i < n; i++) pk = Math.max(pk, Math.abs(mono[i]));
    if (pk > 1e-6) for (i = 0; i < n; i++) mono[i] /= pk;
    return { s: mono, sr: au.sampleRate };
  }

  if (!ids.length) {
    var files = fs.existsSync(REFDIR) ? fs.readdirSync(REFDIR).filter(function (f) { return AUDIO.test(f); }) : [];
    for (var i = 0; i < files.length; i++) {
      var au = await loadFile(path.join(REFDIR, files[i]));
      deep('REFERENCE  ' + files[i], au.s, au.sr);
    }
  }
  if (COMPARE || ids.length) {
    var Creaks = require(path.join(__dirname, '..', 'js', 'creaks.js'));
    var list = ids.length ? ids : Creaks.CATALOG.map(function (c) { return c.id; });
    for (var k = 0; k < list.length; k++) {
      var ctx = new WAA.OfflineAudioContext(1, 44100 * 3, 44100);
      var lab = Creaks.Lab(ctx, ctx.destination);
      if (!lab[list[k]]) continue;
      lab[list[k]](1, 0);
      var b = await ctx.startRendering();
      var ch = b.getChannelData(0), m = new Float32Array(ch.length);
      m.set(ch);
      deep('MINE  ' + list[k], m, 44100);
    }
  }
  console.log('');
})();
