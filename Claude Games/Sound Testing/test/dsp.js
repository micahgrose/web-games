'use strict';
// SOUND TESTING — shared DSP.
//
// Both consumers use this so a real recording and a synthesized candidate go
// through byte-identical analysis: test/measure.js (my candidates) and
// test/reference.js (audio files the user drops in). If the two used different
// code, every comparison between them would be worthless.
var fs = require('fs'), path = require('path');

function loadWAA() {
  var WAA = null;
  ['node-web-audio-api',
   path.join(__dirname, '..', 'node_modules', 'node-web-audio-api'),
   path.join(__dirname, '..', '..', 'Lampblack', 'node_modules', 'node-web-audio-api')
  ].some(function (p) { try { WAA = require(p); return true; } catch (e) { return false; } });
  return WAA;
}

// ---------- FFT ----------
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

// ---------- slip rate ----------
// Normalized autocorrelation, peak-picked AFTER the first zero crossing. Taking
// the global max is wrong and silently returns the minimum lag for anything
// low-pitched: correlation is ~1 for tiny lags on any smooth signal, so a 110Hz
// groan reads as SR/minLag. Skipping the first lobe forces a real period.
//
// Spectral centroid is NOT a proxy for this. The body resonance — not the
// source — sets the spectral shape, which is the entire design premise of a
// stick-slip sound, so the period has to be measured directly.
function f0(s, sr, from, to, minHz, maxHz) {
  var minLag = Math.floor(sr / (maxHz || 2600)), maxLag = Math.floor(sr / (minHz || 40));
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
  while (start <= maxLag && corr[start] > 0) start++;
  var best = 0, bestLag = 0;
  for (var l = start; l <= maxLag; l++) if (corr[l] > best) { best = corr[l]; bestLag = l; }
  return (bestLag && best > 0.25) ? sr / bestLag : 0;
}

// The end drop is a fast glide, and a single window landing on it can
// octave-lock (one read a collapse to 68 as a rise to 281). Take the LOWEST of
// several overlapping windows: the question is whether the rate gets
// substantially lower than the body, and one bad window shouldn't answer it.
function tailF0(s, sr, from, to) {
  var best = 0, w = (to - from) / 2;
  for (var k = 0; k < 3; k++) {
    var v = f0(s, sr, from + k * w / 2, from + k * w / 2 + w);
    if (v && (!best || v < best)) best = v;
  }
  return best;
}

// Decimate for the contour: autocorrelation over dozens of windows at full rate
// is minutes of work, and nothing above ~1.2kHz matters for a slip rate.
function decimate(s, sr, factor) {
  var a = 1 - Math.exp(-2 * Math.PI * (sr / factor / 2.4) / sr), y = 0;
  var lp = new Float32Array(s.length), i;
  for (i = 0; i < s.length; i++) { y += a * (s[i] - y); lp[i] = y; }
  var n = Math.floor(s.length / factor), out = new Float32Array(n);
  for (i = 0; i < n; i++) out[i] = lp[i * factor];
  return { s: out, sr: sr / factor };
}

// The whole slip-rate contour, not three samples of it. This is what says
// whether a real creak climbs linearly, geometrically, in jumps, or not at all.
function slipContour(mono, sr, winS, hopS) {
  var d = decimate(mono, sr, 4);
  winS = winS || 0.12; hopS = hopS || 0.04;
  var win = Math.round(winS * d.sr), hop = Math.round(hopS * d.sr), out = [];
  for (var i = 0; i + win <= d.s.length; i += hop) {
    out.push({ t: i / d.sr, hz: f0(d.s, d.sr, i, i + win, 30, 900) });
  }
  // Octave-error cleanup. A single window can lock onto half or double the true
  // period — especially during a fast glide — and one bad point is enough to
  // destroy a curve fit over a short contour. If a point disagrees with BOTH
  // neighbours by more than a fifth, replace it with their median.
  for (i = 1; i < out.length - 1; i++) {
    var p = out[i - 1].hz, c = out[i].hz, n = out[i + 1].hz;
    if (!c || !p || !n) continue;
    var offP = c / p, offN = c / n;
    if ((offP > 1.5 || offP < 0.67) && (offN > 1.5 || offN < 0.67)) out[i].hz = (p + n) / 2;
  }
  return out;
}

// ---------- body resonances ----------
// The long-term average spectrum IS the body. In a stick-slip sound the source
// rate sweeps while the resonances stay put, so averaging over the whole event
// smears the harmonics into a floor and leaves the fixed modes standing. This
// is how a real creak's wood can be copied into a synth.
function resonances(mono, sr, count) {
  var N = 4096, HOP = 1024;
  var w = new Float32Array(N);
  for (var i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  var avg = new Float64Array(N / 2), frames = 0;
  for (var s = 0; s + N < mono.length; s += HOP) {
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var k = 0; k < N; k++) re[k] = mono[s + k] * w[k];
    fft(re, im);
    for (var b = 1; b < N / 2; b++) avg[b] += Math.sqrt(re[b] * re[b] + im[b] * im[b]);
    frames++;
  }
  if (!frames) return [];
  for (i = 0; i < avg.length; i++) avg[i] /= frames;
  // Smooth on a log axis (constant-Q-ish) so a wide low mode and a narrow high
  // one are judged on the same terms.
  var sm = new Float64Array(avg.length);
  for (i = 1; i < avg.length; i++) {
    var half = Math.max(1, Math.round(i * 0.015)), a = 0, n = 0;
    for (var j = Math.max(1, i - half); j <= Math.min(avg.length - 1, i + half); j++) { a += avg[j]; n++; }
    sm[i] = a / n;
  }
  var peaks = [], max = 0;
  for (i = 0; i < sm.length; i++) if (sm[i] > max) max = sm[i];
  for (i = 2; i < sm.length - 2; i++) {
    if (sm[i] > sm[i - 1] && sm[i] > sm[i + 1] && sm[i] > sm[i - 2] && sm[i] > sm[i + 2] && sm[i] > max * 0.035) {
      // -3dB width gives Q, which is what a biquad wants
      var lo = i, hi = i;
      while (lo > 1 && sm[lo] > sm[i] * 0.707) lo--;
      while (hi < sm.length - 1 && sm[hi] > sm[i] * 0.707) hi++;
      var hz = i * sr / N, bw = Math.max(1, (hi - lo)) * sr / N;
      peaks.push({ hz: hz, rel: sm[i] / max, q: hz / bw });
    }
  }
  peaks.sort(function (a, b) { return b.rel - a.rel; });
  // keep the strongest, but not two peaks inside a third of an octave
  var kept = [];
  peaks.forEach(function (p) {
    if (kept.length >= (count || 6)) return;
    if (kept.every(function (k) { return Math.abs(Math.log2(p.hz / k.hz)) > 0.33; })) kept.push(p);
  });
  return kept.sort(function (a, b) { return a.hz - b.hz; });
}

// ---------- envelope ----------
function envelope(mono, sr, hopS) {
  var hop = Math.round((hopS || 0.01) * sr), out = [];
  for (var i = 0; i + hop <= mono.length; i += hop) {
    var e = 0;
    for (var j = i; j < i + hop; j++) e += mono[j] * mono[j];
    out.push({ t: i / sr, rms: Math.sqrt(e / hop) });
  }
  return out;
}

// How many times does the effort swell? A machine is steady; something being
// forced against friction is not.
function countSwells(env) {
  var max = 0; env.forEach(function (e) { if (e.rms > max) max = e.rms; });
  if (max <= 0) return 0;
  var sm = env.map(function (e, i) {
    var a = 0, n = 0;
    for (var j = Math.max(0, i - 4); j <= Math.min(env.length - 1, i + 4); j++) { a += env[j].rms; n++; }
    return a / n;
  });
  var n = 0, rising = false, lastPeak = -1;
  for (var i = 1; i < sm.length; i++) {
    if (sm[i] > sm[i - 1]) rising = true;
    else if (rising && sm[i - 1] > max * 0.25 && (lastPeak < 0 || i - lastPeak > 6)) {
      n++; rising = false; lastPeak = i;
    }
  }
  return n;
}

// ---------- the main profile ----------
function analyze(mono, sr) {
  var N = 1024, HOP = 256, HANN = new Float32Array(N), i;
  for (i = 0; i < N; i++) HANN[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  var peak = 0, sumSq = 0;
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
      wsum += (b * sr / N) * m; arith += m; logSum += Math.log(m + 1e-12);
    }
    frames.push({ t: s / sr, energy: Math.sqrt(e),
      centroid: arith > 1e-9 ? wsum / arith : 0,
      flatness: arith > 1e-9 ? Math.exp(logSum / (N / 2 - 1)) / (arith / (N / 2 - 1)) : 1,
      mag: mag });
  }
  if (!frames.length) return null;
  var maxE = 0; frames.forEach(function (f) { if (f.energy > maxE) maxE = f.energy; });
  var active = frames.filter(function (f) { return f.energy > maxE * 0.01; });
  if (!active.length) active = frames;
  var first = active[0].t, last = active[active.length - 1].t + N / sr;
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
  var iois = [];
  for (i = 1; i < times.length; i++) iois.push(times[i] - times[i - 1]);
  var ioiMean = iois.length ? iois.reduce(function (x, y) { return x + y; }, 0) / iois.length : 0;
  var ioiCv = iois.length > 1 ? Math.sqrt(iois.reduce(function (x, y) { return x + Math.pow(y - ioiMean, 2); }, 0) / iois.length) / ioiMean : 0;

  // Where the energy actually sits. Centroid alone is a single number that a
  // little hiss can drag anywhere; the band split says whether a sound is dark
  // because its body is low or dark because its excitation has no high content.
  var bands = [0, 0, 0, 0], btot = 0;
  active.forEach(function (f) {
    for (var b3 = 1; b3 < N / 2; b3++) {
      var hz = b3 * sr / N, m2 = f.mag[b3];
      bands[hz < 500 ? 0 : hz < 2000 ? 1 : hz < 8000 ? 2 : 3] += m2;
      btot += m2;
    }
  });
  if (btot > 0) for (i = 0; i < 4; i++) bands[i] /= btot;

  var sFrom = first * sr, span = (last - first) * sr;
  // RMS over the ACTIVE region only. Measured across the whole render buffer it
  // is really a duration measurement in disguise: a 0.5s candidate sitting in a
  // 3s buffer reads several dB quieter than a 1.8s one at identical loudness,
  // which made the level-match check fail on candidates that were in fact
  // correctly matched.
  var aFrom = Math.max(0, Math.floor(sFrom)), aTo = Math.min(mono.length, Math.ceil(last * sr));
  var aSum = 0;
  for (i = aFrom; i < aTo; i++) aSum += mono[i] * mono[i];
  return {
    bands: bands,
    peakDb: 20 * Math.log10(peak + 1e-9),
    rmsDb: 20 * Math.log10(Math.sqrt(aSum / Math.max(1, aTo - aFrom)) + 1e-9),
    dur: last - first,
    centroid: mean(active, 'centroid'),
    centroidStart: mean(active.slice(0, third), 'centroid'),
    centroidEnd: mean(active.slice(-third), 'centroid'),
    flatness: mean(active, 'flatness'),
    onsets: times.length,
    ioiCv: ioiCv,
    f0Early: f0(mono, sr, sFrom + span * 0.10, sFrom + span * 0.32),
    f0Late: f0(mono, sr, sFrom + span * 0.58, sFrom + span * 0.80),
    f0Tail: tailF0(mono, sr, sFrom + span * 0.84, sFrom + span * 1.0)
  };
}

// ---------- files ----------
function writeWav(file, mono, sr) {
  var n = mono.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (var i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mono[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

// Trim leading/trailing silence. Without this the contour, the curve fit and
// the slip-rate range all get computed over the dead air around the event —
// a 1.0s creak inside a 3s buffer fitted its climb to two seconds of noise
// floor and reported R²=0.06 for a contour that is actually a clean ramp.
function trim(mono, sr, floorFrac) {
  var env = envelope(mono, sr, 0.005);
  var max = 0; env.forEach(function (e) { if (e.rms > max) max = e.rms; });
  if (max <= 0) return mono;
  var th = max * (floorFrac || 0.012);
  var a = 0, b = env.length - 1;
  while (a < env.length && env[a].rms < th) a++;
  while (b > a && env[b].rms < th) b--;
  var pad = Math.round(0.01 * sr);
  return mono.subarray(Math.max(0, Math.round(a * 0.005 * sr) - pad),
                       Math.min(mono.length, Math.round((b + 1) * 0.005 * sr) + pad));
}

// Split a recording into separate events, so one file can hold several creaks.
// Threshold is relative to the file's own peak, with a generous gap so the quiet
// middle of a creak never splits it in two.
function splitEvents(mono, sr, opt) {
  opt = opt || {};
  var env = envelope(mono, sr, 0.01);
  var max = 0; env.forEach(function (e) { if (e.rms > max) max = e.rms; });
  var th = max * (opt.threshold || 0.04);
  var gap = Math.round((opt.gapS || 0.22) / 0.01);
  var pad = Math.round((opt.padS || 0.03) * sr);
  var segs = [], run = null, quiet = 0;
  env.forEach(function (e, i) {
    if (e.rms > th) {
      if (!run) run = { a: i, b: i };
      run.b = i; quiet = 0;
    } else if (run && ++quiet > gap) { segs.push(run); run = null; }
  });
  if (run) segs.push(run);
  return segs.map(function (r) {
    var a = Math.max(0, Math.round(r.a * 0.01 * sr) - pad);
    var b = Math.min(mono.length, Math.round((r.b + 1) * 0.01 * sr) + pad);
    return { start: a / sr, dur: (b - a) / sr, s: mono.subarray(a, b) };
  }).filter(function (s) { return s.dur > (opt.minS || 0.06); });
}

module.exports = {
  loadWAA: loadWAA, fft: fft, f0: f0, tailF0: tailF0, analyze: analyze,
  slipContour: slipContour, resonances: resonances, envelope: envelope,
  countSwells: countSwells, writeWav: writeWav, splitEvents: splitEvents, trim: trim
};
