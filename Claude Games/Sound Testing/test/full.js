'use strict';
// SOUND TESTING — the everything pass.
//
// Round 5 was built on ONE statistic (interval CV) that turned out to be
// unvalidated: the slip detector found 16 releases in creak2 where that file's
// own measured rate implies ~60, so the "heavy-tailed intervals" it was aiming
// at may have been detection dropouts. Round 5 sounds nothing like a creak.
//
// So: measure everything, print it all, and let the comparison say which
// differences are real instead of picking one number and trusting it.
//
//   node test/full.js                 references
//   node test/full.js --compare       references + every candidate
//   node test/full.js r4a r5b         specific candidates
var fs = require('fs'), path = require('path');
var D = require('./dsp.js');
var WAA = D.loadWAA();
if (!WAA) { console.log('needs node-web-audio-api'); process.exit(0); }

var REFDIR = path.join(__dirname, '..', 'reference');
var AUDIO = /\.(wav|mp3|flac|ogg|m4a|aac|aiff?|opus)$/i;
var args = process.argv.slice(2);
var COMPARE = args.indexOf('--compare') >= 0;
var ids = args.filter(function (a) { return /^r\d/.test(a); });

var N = 1024, HOP = 256;
var HANN = new Float32Array(N);
for (var h = 0; h < N; h++) HANN[h] = 0.5 - 0.5 * Math.cos(2 * Math.PI * h / (N - 1));

function spectra(s, sr) {
  var out = [];
  for (var i = 0; i + N < s.length; i += HOP) {
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var k = 0; k < N; k++) re[k] = s[i + k] * HANN[k];
    D.fft(re, im);
    var mag = new Float64Array(N / 2);
    for (var b = 1; b < N / 2; b++) mag[b] = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
    out.push({ t: i / sr, mag: mag });
  }
  return out;
}

// ---------- spectral shape ----------
function shape(mag, sr) {
  var tot = 0, c = 0, i;
  for (i = 1; i < mag.length; i++) { tot += mag[i]; c += (i * sr / N) * mag[i]; }
  if (tot < 1e-12) return null;
  c /= tot;
  var v = 0, s3 = 0, s4 = 0;
  for (i = 1; i < mag.length; i++) {
    var f = i * sr / N, d = f - c;
    v += d * d * mag[i]; s3 += d * d * d * mag[i]; s4 += d * d * d * d * mag[i];
  }
  v /= tot; s3 /= tot; s4 /= tot;
  var sd = Math.sqrt(v);
  var acc = 0, r85 = 0, r95 = 0;
  for (i = 1; i < mag.length; i++) {
    acc += mag[i];
    if (!r85 && acc >= tot * 0.85) r85 = i * sr / N;
    if (!r95 && acc >= tot * 0.95) r95 = i * sr / N;
  }
  // spectral slope in dB per octave, least squares on log-log
  var sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (i = 2; i < mag.length; i++) {
    if (mag[i] < 1e-12) continue;
    var lx = Math.log2(i * sr / N), ly = 20 * Math.log10(mag[i]);
    sx += lx; sy += ly; sxx += lx * lx; sxy += lx * ly; n++;
  }
  var slope = n > 2 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0;
  return { centroid: c, spread: sd, skew: sd > 0 ? s3 / (sd * sd * sd) : 0,
    kurt: sd > 0 ? s4 / (sd * sd * sd * sd) : 0, r85: r85, r95: r95, slope: slope };
}

// ---------- per-band envelopes, modulation, and depth ----------
// The key question this answers: is the HIGH-FREQUENCY content chopped up by
// the slips (bound to the events) or does it run continuously underneath? Two
// sounds with identical spectra differ completely on this.
var BANDS = [[60, 250], [250, 700], [700, 2000], [2000, 6000], [6000, 16000]];
var BANDNAME = ['60-250', '250-700', '0.7-2k', '2-6k', '6-16k'];

function bandAnalysis(s, sr) {
  var sp = spectra(s, sr);
  if (!sp.length) return [];
  return BANDS.map(function (bd) {
    var lo = Math.max(1, Math.round(bd[0] * N / sr)), hi = Math.min(N / 2 - 1, Math.round(bd[1] * N / sr));
    var env = sp.map(function (f) {
      var e = 0;
      for (var b = lo; b <= hi; b++) e += f.mag[b] * f.mag[b];
      return Math.sqrt(e);
    });
    var mx = Math.max.apply(null, env);
    if (mx < 1e-12) return { name: '', energy: 0, depth: 0, modHz: 0, crest: 0 };
    var act = env.filter(function (v) { return v > mx * 0.05; });
    var mean = act.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, act.length);
    // modulation depth: sd/mean of the band envelope where the band is active
    var sd = Math.sqrt(act.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / Math.max(1, act.length));
    // dominant modulation rate of this band's envelope
    var esr = sr / HOP, M = 256;
    var e2 = env.slice(0, M);
    while (e2.length < M) e2.push(0);
    var m2 = e2.reduce(function (a, b) { return a + b; }, 0) / M;
    var re = new Float64Array(M), im = new Float64Array(M);
    for (var i = 0; i < M; i++) re[i] = (e2[i] - m2) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (M - 1)));
    D.fft(re, im);
    var best = 0, bestHz = 0;
    for (var bq = 2; bq < M / 2; bq++) {
      var hz = bq * esr / M;
      if (hz > 80) break;
      var mg = Math.sqrt(re[bq] * re[bq] + im[bq] * im[bq]);
      if (mg > best) { best = mg; bestHz = hz; }
    }
    var tot = env.reduce(function (a, b) { return a + b * b; }, 0);
    return { energy: tot, depth: sd / (mean || 1), modHz: bestHz };
  });
}

// ---------- periodicity strength (HNR-ish) over time ----------
function periodicityTrace(s, sr) {
  var d = (function () {
    var a = 1 - Math.exp(-2 * Math.PI * 1400 / sr), y = 0;
    var lp = new Float32Array(s.length), i;
    for (i = 0; i < s.length; i++) { y += a * (s[i] - y); lp[i] = y; }
    var f = 4, n = Math.floor(s.length / f), o = new Float32Array(n);
    for (i = 0; i < n; i++) o[i] = lp[i * f];
    return { s: o, sr: sr / f };
  })();
  var win = Math.round(0.05 * d.sr), hop = Math.round(0.02 * d.sr);
  var minLag = Math.floor(d.sr / 400), maxLag = Math.floor(d.sr / 30);
  var out = [];
  for (var i = 0; i + win + maxLag < d.s.length; i += hop) {
    var mean = 0, j;
    for (j = i; j < i + win; j++) mean += d.s[j];
    mean /= win;
    var best = 0;
    for (var lag = minLag; lag <= maxLag; lag++) {
      var num = 0, a1 = 0, a2 = 0;
      for (j = i; j < i + win; j++) {
        var x = d.s[j] - mean, y = d.s[j + lag] - mean;
        num += x * y; a1 += x * x; a2 += y * y;
      }
      var c = num / Math.sqrt(a1 * a2 + 1e-12);
      if (c > best) best = c;
    }
    out.push(Math.max(0, best));
  }
  return out;
}

// ---------- decay after the last excitation ----------
function decayTime(s, sr) {
  var env = D.envelope(s, sr, 0.005);
  var mx = 0, mi = 0;
  env.forEach(function (e, i) { if (e.rms > mx) { mx = e.rms; mi = i; } });
  // find the last frame above -6dB of peak, then time to -40dB
  var last = mi;
  for (var i = mi; i < env.length; i++) if (env[i].rms > mx * 0.5) last = i;
  var target = mx * 0.01;
  for (i = last; i < env.length; i++) if (env[i].rms < target) return (i - last) * 0.005;
  return (env.length - last) * 0.005;
}

function sparkline(vals, lo, hi) {
  var chars = '▁▂▃▄▅▆▇█';
  return vals.map(function (v) {
    if (v === 0) return ' ';
    var u = (v - lo) / Math.max(1e-9, hi - lo);
    return chars[Math.max(0, Math.min(7, Math.round(u * 7)))];
  }).join('');
}

function report(name, raw, sr) {
  var s = D.trim(raw, sr);
  console.log('\n' + '█'.repeat(76));
  console.log(name + '    ' + sr + 'Hz');
  console.log('█'.repeat(76));

  // ---- 1. GROSS STRUCTURE: is this one sound or several? ----
  var evs = D.splitEvents(s, sr, { threshold: 0.06, gapS: 0.05, minS: 0.02 });
  var env = D.envelope(s, sr, 0.005);
  var mx = 0; env.forEach(function (e) { if (e.rms > mx) mx = e.rms; });
  var quiet = env.filter(function (e) { return e.rms < mx * 0.05; }).length / env.length;
  console.log('\n1. STRUCTURE');
  console.log('   length ' + (s.length / sr).toFixed(2) + 's    sub-events ' + evs.length +
    '    quiet ' + (quiet * 100).toFixed(0) + '% of the time');
  if (evs.length > 1 && evs.length <= 24) {
    console.log('   events: ' + evs.map(function (e) {
      return e.start.toFixed(2) + 's/' + (e.dur * 1000).toFixed(0) + 'ms';
    }).join('  '));
    var gaps = [];
    for (var i = 1; i < evs.length; i++) gaps.push(evs[i].start - (evs[i - 1].start + evs[i - 1].dur));
    var gm = gaps.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, gaps.length);
    console.log('   mean sub-event ' + (evs.reduce(function (a, e) { return a + e.dur; }, 0) / evs.length * 1000).toFixed(0) +
      'ms   mean gap ' + (gm * 1000).toFixed(0) + 'ms');
  }
  console.log('   envelope    ' + sparkline(env.map(function (e) { return e.rms; }), 0, mx));

  // ---- 2. ENVELOPE SHAPE ----
  var third = Math.floor(env.length / 3);
  var e3 = [0, 0, 0];
  env.forEach(function (e, i) { e3[Math.min(2, Math.floor(i / Math.max(1, third)))] += e.rms * e.rms; });
  var et = e3[0] + e3[1] + e3[2];
  var pk = 0, pki = 0;
  env.forEach(function (e, i) { if (e.rms > pk) { pk = e.rms; pki = i; } });
  console.log('\n2. ENVELOPE');
  console.log('   energy by third   ' + e3.map(function (v) { return Math.round(100 * v / (et || 1)) + '%'; }).join('  ') +
    '      peak at ' + Math.round(100 * pki / env.length) + '% through');
  console.log('   decay to -40dB    ' + decayTime(s, sr).toFixed(3) + 's after the last loud moment');
  console.log('   swells ' + D.countSwells(env));

  // ---- 3. SPECTRUM ----
  var sp = spectra(s, sr);
  var avg = new Float64Array(N / 2);
  sp.forEach(function (f) { for (var b = 1; b < N / 2; b++) avg[b] += f.mag[b]; });
  for (var b2 = 0; b2 < avg.length; b2++) avg[b2] /= Math.max(1, sp.length);
  var sh = shape(avg, sr);
  console.log('\n3. SPECTRUM');
  if (sh) {
    console.log('   centroid ' + Math.round(sh.centroid) + 'Hz   spread ' + Math.round(sh.spread) +
      'Hz   skew ' + sh.skew.toFixed(2) + '   kurtosis ' + sh.kurt.toFixed(1));
    console.log('   rolloff  85% below ' + Math.round(sh.r85) + 'Hz   95% below ' + Math.round(sh.r95) + 'Hz');
    console.log('   slope    ' + sh.slope.toFixed(1) + ' dB/octave');
  }
  // how much does the spectrum MOVE? a static filter sweep vs a living sound
  var cents = sp.map(function (f) { var x = shape(f.mag, sr); return x ? x.centroid : 0; }).filter(function (v) { return v > 0; });
  if (cents.length > 2) {
    var cm = cents.reduce(function (a, c) { return a + c; }, 0) / cents.length;
    var csd = Math.sqrt(cents.reduce(function (a, c) { return a + (c - cm) * (c - cm); }, 0) / cents.length);
    console.log('   centroid wobble  ±' + Math.round(csd) + 'Hz (' + Math.round(100 * csd / cm) + '% of mean) — how much the timbre MOVES');
  }

  // ---- 4. BANDS: energy, how deeply each is chopped, and at what rate ----
  var ba = bandAnalysis(s, sr);
  var btot = ba.reduce(function (a, x) { return a + x.energy; }, 0) || 1;
  console.log('\n4. BANDS   (depth = how deeply the slips chop that band; 0 = a steady bed)');
  ba.forEach(function (x, i) {
    console.log('   ' + BANDNAME[i].padStart(7) + 'Hz   energy ' + String(Math.round(100 * x.energy / btot)).padStart(3) +
      '%   depth ' + x.depth.toFixed(2) + '   modulated at ' + x.modHz.toFixed(1) + 'Hz');
  });

  // ---- 5. PERIODICITY OVER TIME ----
  var pt = periodicityTrace(s, sr);
  var pm = pt.reduce(function (a, v) { return a + v; }, 0) / Math.max(1, pt.length);
  console.log('\n5. PERIODICITY   mean strength ' + pm.toFixed(2) +
    '   strong(>0.7) ' + Math.round(100 * pt.filter(function (v) { return v > 0.7; }).length / Math.max(1, pt.length)) + '% of frames');
  console.log('   trace  ' + sparkline(pt, 0, 1));

  // ---- 6. SLIP RATE ----
  var c2 = D.slipContour(s, sr).filter(function (p) { return p.hz > 0; });
  if (c2.length) {
    var hz = c2.map(function (p) { return p.hz; });
    console.log('\n6. SLIP RATE   ' + Math.round(Math.min.apply(null, hz)) + '-' + Math.round(Math.max.apply(null, hz)) +
      'Hz   ' + Math.round(c2[0].hz) + ' → ' + Math.round(c2[c2.length - 1].hz));
  }

  // ---- 7. IMPULSIVENESS ----
  var peak = 0, ss = 0;
  for (var i2 = 0; i2 < s.length; i2++) { var m = Math.abs(s[i2]); if (m > peak) peak = m; ss += s[i2] * s[i2]; }
  var zc = 0;
  for (i2 = 1; i2 < s.length; i2++) if ((s[i2] >= 0) !== (s[i2 - 1] >= 0)) zc++;
  console.log('\n7. IMPULSIVENESS   crest ' + (20 * Math.log10(peak / (Math.sqrt(ss / s.length) || 1e-9))).toFixed(1) +
    'dB   zero-crossing rate ' + Math.round(zc / (s.length / sr)) + '/s');
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
      report('REFERENCE   ' + files[i], au.s, au.sr);
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
      var bf = await ctx.startRendering();
      var ch = bf.getChannelData(0), m = new Float32Array(ch.length);
      m.set(ch);
      report('MINE   ' + list[k], m, 44100);
    }
  }
  console.log('');
})();
