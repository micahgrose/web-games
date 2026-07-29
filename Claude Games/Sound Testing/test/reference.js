'use strict';
// SOUND TESTING — analyze REAL recordings and turn them into synth targets.
//
// Drop audio files in reference/ and run this. It answers the questions I have
// been guessing at from first principles: how fast does a real creak actually
// slip, does its rate climb linearly or geometrically or in jumps, where are
// the body resonances, how many times does the effort surge, how long is it.
//
// The payoff is the resonance extraction. In a stick-slip sound the source rate
// sweeps while the body stays put, so the long-term average spectrum smears the
// harmonics into a floor and leaves the fixed modes standing — which means a
// real creak's wood can be read off and pasted into js/creaks.js.
//
//   node test/reference.js                 analyze everything in reference/
//   node test/reference.js path/to/a.wav   analyze specific files
//   node test/reference.js --split         treat each file as several events
//   node test/reference.js --compare       also print my candidates alongside
var fs = require('fs'), path = require('path');
var D = require('./dsp.js');

var WAA = D.loadWAA();
if (!WAA) { console.log('needs a WebAudio implementation:  npm install node-web-audio-api'); process.exit(0); }

var REFDIR = path.join(__dirname, '..', 'reference');
var AUDIO = /\.(wav|mp3|flac|ogg|m4a|aac|aiff?|opus)$/i;

var args = process.argv.slice(2);
var SPLIT = args.indexOf('--split') >= 0;
var COMPARE = args.indexOf('--compare') >= 0;
var files = args.filter(function (a) { return a[0] !== '-'; });
if (!files.length) {
  if (!fs.existsSync(REFDIR)) fs.mkdirSync(REFDIR, { recursive: true });
  files = fs.readdirSync(REFDIR).filter(function (f) { return AUDIO.test(f); })
    .map(function (f) { return path.join(REFDIR, f); });
}
if (!files.length) {
  console.log('\nNo audio found. Drop creak recordings into:\n  ' + REFDIR +
    '\n(wav / mp3 / flac / ogg / m4a — anything, any sample rate, mono or stereo.)\n');
  process.exit(0);
}

// ---------- decode ----------
async function load(file) {
  var buf = fs.readFileSync(file);
  var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  var ctx = new WAA.OfflineAudioContext(1, 128, 44100);
  var audio = await ctx.decodeAudioData(ab);
  var n = audio.length, mono = new Float32Array(n);
  for (var c = 0; c < audio.numberOfChannels; c++) {
    var d = audio.getChannelData(c);
    for (var i = 0; i < n; i++) mono[i] += d[i] / audio.numberOfChannels;
  }
  // Normalize. A quiet recording and a loud one should profile identically —
  // everything below is about shape, not about how hot it was tracked.
  var pk = 0;
  for (i = 0; i < n; i++) if (Math.abs(mono[i]) > pk) pk = Math.abs(mono[i]);
  if (pk > 1e-6) for (i = 0; i < n; i++) mono[i] /= pk;
  return { s: mono, sr: audio.sampleRate };
}

// ---------- report ----------
function sparkline(vals, lo, hi) {
  var chars = '▁▂▃▄▅▆▇█';
  return vals.map(function (v) {
    if (!v) return ' ';
    var u = (v - lo) / Math.max(1e-9, hi - lo);
    return chars[Math.max(0, Math.min(7, Math.round(u * 7)))];
  }).join('');
}

// Does the climb fit a straight line in Hz or a straight line in log Hz? This
// is the exact question round 3 is asking the user's ear, answered by data.
function fitShape(pts) {
  var v = pts.filter(function (p) { return p.hz > 0; });
  if (v.length < 6) return null;
  // Fit the CLIMB only. The end drop is a different gesture and including it
  // fits a line through two opposing trends, which describes neither.
  var tEnd = v[v.length - 1].t, t0 = v[0].t;
  var body = v.filter(function (p) { return p.t <= t0 + (tEnd - t0) * 0.78; });
  if (body.length < 4) body = v.slice(0, Math.max(4, Math.round(v.length * 0.78)));
  function r2(ys) {
    var n = body.length, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    body.forEach(function (p, i) {
      var x = p.t, y = ys(p.hz);
      sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
    });
    var num = n * sxy - sx * sy;
    var den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    return den < 1e-12 ? 0 : Math.pow(num / den, 2);
  }
  var lin = r2(function (h) { return h; }), geo = r2(function (h) { return Math.log(h); });
  var slope = (body[body.length - 1].hz - body[0].hz) / Math.max(1e-6, body[body.length - 1].t - body[0].t);
  return { lin: lin, geo: geo, slope: slope,
    verdict: Math.abs(lin - geo) < 0.02 ? 'indistinguishable' : (lin > geo ? 'LINEAR in Hz' : 'GEOMETRIC (linear to the ear)') };
}

function profile(name, s, sr) {
  s = D.trim(s, sr); // dead air wrecks the contour and the curve fit
  var a = D.analyze(s, sr);
  if (!a) { console.log('\n' + name + ': no analyzable audio'); return null; }
  var contour = D.slipContour(s, sr);
  var voiced = contour.filter(function (p) { return p.hz > 0; });
  var env = D.envelope(s, sr, 0.01);
  var res = D.resonances(s, sr, 6);
  var shape = fitShape(contour);

  console.log('\n' + '═'.repeat(78));
  console.log(name + '   ' + sr + 'Hz   ' + a.dur.toFixed(2) + 's');
  console.log('═'.repeat(78));
  console.log('  centroid   ' + Math.round(a.centroid) + 'Hz  (' +
    Math.round(a.centroidStart) + ' → ' + Math.round(a.centroidEnd) + ')' +
    '        flatness ' + a.flatness.toFixed(2) + '  (0 tonal … 1 noise)');
  console.log('  swells     ' + D.countSwells(env) + '        onsets ' + a.onsets +
    '        onset irregularity ' + a.ioiCv.toFixed(2));

  if (voiced.length) {
    var hzs = voiced.map(function (p) { return p.hz; });
    var lo = Math.min.apply(null, hzs), hi = Math.max.apply(null, hzs);
    console.log('\n  SLIP RATE   ' + Math.round(lo) + ' – ' + Math.round(hi) + ' Hz' +
      '   (' + Math.round(voiced[0].hz) + ' → ' + Math.round(voiced[voiced.length - 1].hz) + ')');
    console.log('  contour     ' + sparkline(contour.map(function (p) { return p.hz; }), lo, hi));
    console.log('              ' + contour.map(function (p, i) { return i % 5 === 0 ? '|' : ' '; }).join('') +
      '   (each mark = ' + (5 * 0.04).toFixed(1) + 's)');
    if (shape) {
      console.log('  climb fits  ' + shape.verdict + '   (linear R²=' + shape.lin.toFixed(2) +
        ', geometric R²=' + shape.geo.toFixed(2) + ')   ' +
        (shape.slope > 0 ? '+' : '') + Math.round(shape.slope) + ' Hz/s');
    }
    var tail = voiced.slice(-3).reduce(function (x, p) { return x + p.hz; }, 0) / Math.min(3, voiced.length);
    var body = Math.max.apply(null, hzs);
    console.log('  end drop    ' + (tail < body * 0.85
      ? 'YES — falls to ' + Math.round(tail) + 'Hz from a peak of ' + Math.round(body)
      : 'no — ends at ' + Math.round(tail) + 'Hz against a peak of ' + Math.round(body)));
  } else {
    console.log('\n  SLIP RATE   no stable period found — this is noise-driven, not a pulse train');
  }

  console.log('\n  BODY RESONANCES (the long-term average spectrum = the material)');
  res.forEach(function (p) {
    var bar = '█'.repeat(Math.max(1, Math.round(p.rel * 34)));
    console.log('    ' + String(Math.round(p.hz)).padStart(6) + 'Hz  Q≈' +
      p.q.toFixed(1).padStart(5) + '  ' + bar + ' ' + (p.rel * 100).toFixed(0) + '%');
  });
  console.log('\n    → as a WOOD table for js/creaks.js:');
  console.log('      [' + res.map(function (p) {
    return '[' + Math.round(p.hz) + ', ' + p.rel.toFixed(2) + ', ' + Math.max(1, Math.round(p.q)) + ']';
  }).join(', ') + ']');
  return a;
}

(async function () {
  console.log('\nSOUND TESTING — reference profiles');
  var all = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i], au;
    try { au = await load(f); }
    catch (e) { console.log('\n' + path.basename(f) + ': could not decode (' + e.message + ')'); continue; }
    if (SPLIT) {
      var segs = D.splitEvents(au.s, au.sr);
      console.log('\n' + path.basename(f) + ': ' + segs.length + ' event(s) detected');
      segs.forEach(function (sg, k) {
        var a = profile(path.basename(f) + ' #' + (k + 1) + ' @' + sg.start.toFixed(2) + 's', sg.s, au.sr);
        if (a) all.push(a);
      });
    } else {
      var a2 = profile(path.basename(f), au.s, au.sr);
      if (a2) all.push(a2);
    }
  }

  if (all.length > 1) {
    var avg = function (k) { return all.reduce(function (x, a) { return x + a[k]; }, 0) / all.length; };
    console.log('\n' + '═'.repeat(78));
    console.log('ACROSS ' + all.length + ' REFERENCES — what a creak is, on average');
    console.log('═'.repeat(78));
    console.log('  duration ' + avg('dur').toFixed(2) + 's   centroid ' + Math.round(avg('centroid')) +
      'Hz   flatness ' + avg('flatness').toFixed(2) + '   onset irregularity ' + avg('ioiCv').toFixed(2));
  }

  if (COMPARE) {
    var Creaks = require(path.join(__dirname, '..', 'js', 'creaks.js'));
    console.log('\n' + '═'.repeat(78));
    console.log('MY CANDIDATES, same analysis');
    console.log('═'.repeat(78));
    for (var c = 0; c < Creaks.CATALOG.length; c++) {
      var id = Creaks.CATALOG[c].id;
      var ctx = new WAA.OfflineAudioContext(1, 44100 * 3, 44100);
      var lab = Creaks.Lab(ctx, ctx.destination);
      lab[id](1, 0);
      var buf = await ctx.startRendering();
      var ch = buf.getChannelData(0), m = new Float32Array(ch.length);
      m.set(ch);
      profile(id + '  (' + Creaks.CATALOG[c].label + ')', m, 44100);
    }
  }
  console.log('');
})();
