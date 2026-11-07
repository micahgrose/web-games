/* GILT audio lab — renders every cue and every ambient bed offline and
   measures it against the intended MIX, not just "does it make noise":
   loudness bands per cue, spectral centroid (real FFT), duration, headroom,
   and the relationships the room depends on — chips carry the table, the
   drop beats the orbit, the jackpot dwarfs every other win.

   The ears still belong to the user. This proves the balance before it
   reaches them.  node test/audio.js */
'use strict';
const path = require('path');
const wa = require(path.join(__dirname, '..', '..', 'Lampblack', 'node_modules', 'node-web-audio-api'));
const AudioMod = require(path.join(__dirname, '..', 'js', 'audio.js'));

const { OfflineAudioContext } = wa;
const SR = 44100;
let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error('  FAIL: ' + msg); }
}

// ---------- radix-2 FFT, in place ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

// ---------- measurement ----------
function measure(buf) {
  const d = buf.getChannelData(0);
  let peak = 0, sum = 0, firstIdx = -1, lastIdx = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    sum += d[i] * d[i];
    if (a > 1e-4) { if (firstIdx < 0) firstIdx = i; lastIdx = i; }
  }
  const activeLen = firstIdx < 0 ? 0 : (lastIdx - firstIdx);
  // rms over the ACTIVE region — a long tail of silence must not flatter or
  // punish a cue, since the render window is arbitrary
  let asum = 0;
  for (let i = Math.max(0, firstIdx); i <= lastIdx; i++) asum += d[i] * d[i];
  const activeRms = activeLen > 0 ? Math.sqrt(asum / activeLen) : 0;

  // Loudest 50 ms — how hard the thing HITS. Average rms can't compare a
  // single card slip against seven decaying dice bounces; this can.
  const win = Math.floor(SR * 0.05);
  let loudest50 = 0;
  if (d.length > win) {
    let run = 0;
    for (let i = 0; i < win; i++) run += d[i] * d[i];
    loudest50 = run;
    for (let i = win; i < d.length; i++) {
      run += d[i] * d[i] - d[i - win] * d[i - win];
      if (run > loudest50) loudest50 = run;
    }
    loudest50 = Math.sqrt(loudest50 / win);
  } else loudest50 = activeRms;

  // Spectral centroid: Hann-windowed average over the active region. The
  // window shrinks for short cues — a 40 ms click is shorter than 2048
  // samples, and reporting 0 Hz for it would hide whatever it sounds like.
  let N = 2048;
  while (N > 128 && activeLen < N) N >>= 1;
  let magSum = new Float64Array(N / 2);
  let frames = 0;
  for (let start = Math.max(0, firstIdx); start + N <= lastIdx + 1; start += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
      re[i] = d[start + i] * w;
    }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) magSum[k] += Math.hypot(re[k], im[k]);
    frames++;
  }
  let centroid = 0;
  if (frames > 0) {
    let num = 0, den = 0;
    for (let k = 1; k < N / 2; k++) {
      const f = k * SR / N;
      num += f * magSum[k]; den += magSum[k];
    }
    centroid = den > 0 ? num / den : 0;
  }
  return { peak, rms: Math.sqrt(sum / d.length), activeRms, loudest50, activeDur: activeLen / SR, centroid };
}

async function renderCue(name, seconds) {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
  const buf = AudioMod.noiseBuffer(ctx, 1.2);
  AudioMod.CUES[name](ctx, ctx.destination, 0.05, buf);
  return measure(await ctx.startRendering());
}
async function renderBed(name, seconds) {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
  const buf = AudioMod.noiseBuffer(ctx, 1.2);
  const bed = AudioMod.bedNodes(ctx, ctx.destination, name, buf);
  bed.gain.gain.setValueAtTime(1, 0);
  return measure(await ctx.startRendering());
}

// ---------- the mix spec ----------
// win: render window. lo/hi: active-region rms band. minDur: seconds of sound.
// Bands come from design intent — chips and payoffs carry, texture sits under.
const SPEC = {
  // UI + texture: present, never intrusive
  click: { win: 0.7, lo: 0.010, hi: 0.10, minDur: 0.02 },
  tick: { win: 0.5, lo: 0.010, hi: 0.10, minDur: 0.02 },
  murmur: { win: 0.5, lo: 0.004, hi: 0.06, minDur: 0.02 },
  reels: { win: 2.8, lo: 0.004, hi: 0.05, minDur: 1.5 },
  ballspin: { win: 4.9, lo: 0.004, hi: 0.05, minDur: 3.0 },
  crowd: { win: 2.0, lo: 0.008, hi: 0.06, minDur: 0.8 },
  // table action: the working sounds of the felt
  chip: { win: 0.8, lo: 0.030, hi: 0.20, minDur: 0.05 },
  chips: { win: 1.1, lo: 0.030, hi: 0.20, minDur: 0.15 },
  card: { win: 1.0, lo: 0.012, hi: 0.09, minDur: 0.08 },
  dice: { win: 1.6, lo: 0.025, hi: 0.16, minDur: 0.4 },
  balldrop: { win: 1.6, lo: 0.025, hi: 0.16, minDur: 0.4 },
  lever: { win: 1.1, lo: 0.020, hi: 0.14, minDur: 0.1 },
  reelstop: { win: 1.0, lo: 0.020, hi: 0.14, minDur: 0.08 },
  pop: { win: 0.7, lo: 0.015, hi: 0.12, minDur: 0.04 },
  scratch: { win: 0.7, lo: 0.010, hi: 0.10, minDur: 0.04 },
  foil: { win: 1.0, lo: 0.015, hi: 0.12, minDur: 0.08 },
  paper: { win: 1.0, lo: 0.015, hi: 0.12, minDur: 0.08 },
  pencil: { win: 1.0, lo: 0.015, hi: 0.12, minDur: 0.08 },
  steps: { win: 1.4, lo: 0.015, hi: 0.14, minDur: 0.25 },
  hooves: { win: 9.5, lo: 0.015, hi: 0.14, minDur: 6.5 },
  trumpet: { win: 2.4, lo: 0.020, hi: 0.14, minDur: 1.0 },
  // payoffs: these are allowed to own the room
  coins: { win: 1.4, lo: 0.020, hi: 0.16, minDur: 0.3 },
  winSmall: { win: 1.6, lo: 0.030, hi: 0.20, minDur: 0.4 },
  winBig: { win: 2.2, lo: 0.035, hi: 0.24, minDur: 0.7 },
  jackpot: { win: 3.4, lo: 0.045, hi: 0.30, minDur: 1.4 }
};

(async () => {
  const M = {};
  console.log('— cues (rms over the active region, centroid in Hz)');
  const names = Object.keys(AudioMod.CUES);
  ok(names.every(n => SPEC[n]), 'every cue has a mix spec' +
    (names.filter(n => !SPEC[n]).length ? ' — missing: ' + names.filter(n => !SPEC[n]).join(', ') : ''));

  for (const name of names) {
    const s = SPEC[name] || { win: 2, lo: 0, hi: 1, minDur: 0 };
    const m = await renderCue(name, s.win);
    M[name] = m;
    console.log('  ' + name.padEnd(9) +
      ' rms ' + m.activeRms.toFixed(4) +
      '  hit ' + m.loudest50.toFixed(4) +
      '  peak ' + m.peak.toFixed(3) +
      '  dur ' + m.activeDur.toFixed(2) + 's' +
      '  centroid ' + Math.round(m.centroid) + 'Hz');
    ok(m.activeRms >= s.lo, name + ' is loud enough to hear (' + m.activeRms.toFixed(4) + ' < ' + s.lo + ')');
    ok(m.activeRms <= s.hi, name + ' does not shout over the room (' + m.activeRms.toFixed(4) + ' > ' + s.hi + ')');
    ok(m.activeDur >= s.minDur, name + ' lasts as long as it should (' + m.activeDur.toFixed(2) + 's < ' + s.minDur + 's)');
    // headroom: cues overlap constantly, so each keeps room under the compressor
    ok(m.peak < 0.7, name + ' leaves headroom for overlap (peak ' + m.peak.toFixed(3) + ')');
  }

  console.log('— the relationships the room depends on');
  // Impact comparisons use the loudest 50 ms, so a long decaying clatter is
  // judged on how hard it lands rather than penalised for its own tail.
  ok(M.chip.loudest50 > M.card.loudest50, 'chips carry the table over the cards');
  ok(M.chips.loudest50 > M.card.loudest50, 'a handful of chips too');
  ok(M.dice.loudest50 > M.card.loudest50, 'dice off the rail beat a card slip');
  ok(M.balldrop.loudest50 > M.ballspin.loudest50 * 1.5, 'the drop beats the orbit');
  ok(M.winBig.activeRms > M.winSmall.activeRms, 'a big win rings louder than a small one');
  ok(M.jackpot.activeRms > M.winBig.activeRms * 1.05 &&
    M.jackpot.activeDur > M.winBig.activeDur * 1.2, 'the jackpot dwarfs every other win');
  ok(M.tick.activeRms < M.chip.activeRms, 'the clacker is a tap — density does the work');
  ok(M.winBig.activeDur > M.click.activeDur * 3, 'a payoff outlasts a button press');
  ok(M.hooves.activeDur > 6.5, 'the gallop runs the whole race, not a moment of it');
  ok(M.ballspin.activeDur > 3.0, 'the ball orbits for seconds');
  ok(M.trumpet.activeDur > 1.0, 'the call to post gets its phrase out');

  // The loudness hierarchy, locked. Money is the loudest thing in the
  // building; nothing incidental — a footstep, a scratched ticket, a keno
  // ball — is allowed to rival being paid.
  const INCIDENTAL = ['click', 'tick', 'murmur', 'steps', 'pencil', 'paper',
    'foil', 'scratch', 'pop', 'crowd', 'reels', 'ballspin'];
  for (const n of INCIDENTAL) {
    ok(M[n].loudest50 < M.winSmall.loudest50, n + ' never rivals being paid (' +
      M[n].loudest50.toFixed(4) + ' vs ' + M.winSmall.loudest50.toFixed(4) + ')');
  }
  const loudest = Object.keys(M).reduce((a, b) => M[a].loudest50 > M[b].loudest50 ? a : b);
  ok(loudest === 'jackpot', 'the jackpot is the loudest thing in the building (loudest was ' + loudest + ')');
  // Cues that fire in bursts must stay quiet enough that density doesn't roar:
  // the Big Six clacker crosses ~270 pegs in one spin.
  const REPEATS = { tick: 270, pop: 20, scratch: 25, reelstop: 3, card: 8, chip: 4 };
  for (const n in REPEATS) {
    const budget = M[n].loudest50 * Math.sqrt(REPEATS[n]);
    ok(budget < 0.6, n + ' stays civil when it repeats ' + REPEATS[n] + 'x (budget ' + budget.toFixed(3) + ')');
  }

  console.log('— where each sound sits in the spectrum');
  ok(M.chip.centroid > 1200, 'chips are bright, clay on clay (' + Math.round(M.chip.centroid) + 'Hz)');
  ok(M.hooves.centroid < 900, 'hooves are low, dirt under weight (' + Math.round(M.hooves.centroid) + 'Hz)');
  ok(M.steps.centroid < 1200, 'footfalls are low (' + Math.round(M.steps.centroid) + 'Hz)');
  ok(M.chip.centroid > M.dice.centroid, 'chips ring higher than dice');
  ok(M.foil.centroid > 1200, 'foil is a bright rasp (' + Math.round(M.foil.centroid) + 'Hz)');
  ok(M.balldrop.centroid > 800, 'the ball is hard and bright on the frets');
  // Paper and felt have a top end; bare highpassed noise does not, and it
  // reads as tape hiss. Nothing in this building is allowed to hiss.
  for (const n of ['card', 'foil', 'paper', 'scratch', 'chip', 'dice']) {
    ok(M[n].centroid < 8000, n + ' is a material, not hiss (' + Math.round(M[n].centroid) + 'Hz)');
  }
  ok(M.winSmall.centroid < 2000 && M.winBig.centroid < 2000, 'the win stingers are brass, not cymbals');

  console.log('— ambient beds');
  const beds = {};
  for (const bed of ['exterior', 'floor', 'table', 'craps', 'slots', 'bar', 'lounge', 'parlor']) {
    const m = await renderBed(bed, 2.0);
    beds[bed] = m;
    console.log('  ' + bed.padEnd(9) + ' rms ' + m.activeRms.toFixed(4) + '  peak ' + m.peak.toFixed(3) + '  centroid ' + Math.round(m.centroid) + 'Hz');
    ok(m.activeRms > 0.001, bed + ' bed breathes');
    ok(m.activeRms < 0.03, bed + ' bed stays under the conversation');
    ok(m.peak < 0.5, bed + ' bed never spikes');
    // A room of people, not a wall of noise: voices live under ~2 kHz
    ok(m.centroid < 2000, bed + ' sounds like a room, not static (' + Math.round(m.centroid) + 'Hz)');
  }
  ok(beds.floor.activeRms > beds.exterior.activeRms, 'inside is louder than the street');
  ok(beds.craps.activeRms > beds.lounge.activeRms, 'the dice pit is the loudest room; the keno lounge the quietest');
  ok(beds.craps.activeRms > beds.table.activeRms, 'craps beats a card table for noise');
  // no bed may compete with a payoff — the win must always cut through
  for (const b in beds) {
    ok(M.winSmall.activeRms > beds[b].activeRms * 2, 'a win cuts through the ' + b + ' bed');
  }
  ok(beds.exterior.centroid < 900, 'the street is low — traffic and a tired transformer');
  ok(beds.slots.centroid > beds.lounge.centroid, 'the slot row rings higher than the plush lounge');

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
