/* headless.js — run with `node test/headless.js` from the MapTap folder.
 *
 * Covers the parts a browser would only show me by being played: the geometry,
 * the scoring curve, round construction, the stats ledger, and — since I cannot
 * click anything — a static check that every element the UI script reaches for
 * actually exists in index.html.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const topo = require(path.join(ROOT, 'js/world-data.js'));
const Geo = require(path.join(ROOT, 'js/geo.js'));
const LOCATIONS = require(path.join(ROOT, 'js/locations.js'));
const Game = require(path.join(ROOT, 'js/game.js'));

let checks = 0, failures = [];
function ok(cond, msg) {
  checks++;
  if (!cond) failures.push(msg);
}
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', want ' + b + '±' + tol + ')'); }
function section(name) { process.stdout.write('\n  ' + name + '\n'); }

const world = Geo.world(topo);

/* ------------------------------------------------------------------- geo */
section('geometry');

eq(world.countries.length, 241, 'country polygons decoded');
ok(world.land.length > 1000, 'land rings decoded: ' + world.land.length);

near(Geo.distanceKm(-0.1276, 51.5072, 2.3522, 48.8566), 344, 4, 'London to Paris');
near(Geo.distanceKm(-74.006, 40.7128, 139.6917, 35.6895), 10850, 40, 'New York to Tokyo');
near(Geo.distanceKm(0, 0, 0, 90), 10007, 20, 'equator to north pole');
eq(Math.round(Geo.distanceKm(10, 10, 10, 10)), 0, 'zero distance');
near(Geo.distanceKm(179.9, 0, -179.9, 0), 22.2, 1, 'distance across the antimeridian');

// Projection must be exactly invertible for any visible point, at any camera.
{
  let worst = 0, tested = 0;
  const cams = [{ lon: 0, lat: 0, scale: 300 }, { lon: 150, lat: -62, scale: 900 },
                { lon: -70, lat: 40, scale: 2400 }, { lon: 179, lat: 89, scale: 400 }];
  for (const cam of cams) {
    for (let i = 0; i < 500; i++) {
      const lon = Math.random() * 360 - 180;
      const lat = Math.asin(Math.random() * 2 - 1) * 180 / Math.PI;
      const p = Geo.project(lon, lat, cam, 400, 300);
      if (!p.visible) continue;
      const q = Geo.unproject(p.x, p.y, cam, 400, 300);
      worst = Math.max(worst, Geo.distanceKm(lon, lat, q.lon, q.lat));
      tested++;
    }
  }
  ok(tested > 500, 'projection roundtrip sampled ' + tested + ' visible points');
  ok(worst < 0.001, 'projection roundtrip error stays sub-metre (' + worst.toExponential(2) + ' km)');
}

// Taps outside the disc must report nothing rather than an invented coordinate.
{
  const cam = { lon: 0, lat: 0, scale: 100 };
  eq(Geo.unproject(400, 300, cam, 400, 300).lon, 0, 'centre tap unprojects to camera longitude');
  eq(Geo.unproject(600, 300, cam, 400, 300), null, 'tap beyond the limb returns null');
  // At the limb you are looking edge-on, so a tap there reads close to a quarter
  // turn away from the camera — it approaches 90° but never quite reaches it.
  const edge = Geo.unproject(400 + 99.9, 300, cam, 400, 300);
  ok(edge && edge.lon > 85 && edge.lon <= 90, 'tap near the limb reads ~90° away (got ' + (edge && edge.lon.toFixed(1)) + ')');
}

// Great circles start and end where they should.
{
  const gc = Geo.greatCircle(-0.1276, 51.5072, 2.3522, 48.8566, 32);
  eq(gc.length, 33, 'great circle point count');
  near(gc[0][0], -0.1276, 1e-6, 'great circle starts at origin');
  near(gc[gc.length - 1][1], 48.8566, 1e-6, 'great circle ends at destination');
  const long = Geo.greatCircle(139.69, 35.69, -74.0, 40.71, 40);
  let maxStep = 0;
  for (let i = 1; i < long.length; i++) {
    maxStep = Math.max(maxStep, Geo.distanceKm(long[i - 1][0], long[i - 1][1], long[i][0], long[i][1]));
  }
  ok(maxStep < 400, 'great circle steps stay small across the Pacific (' + Math.round(maxStep) + ' km)');
}

// destination() must actually land the requested distance away.
{
  for (const brg of [0, 45, 137, 271, 359]) {
    const d = Geo.destination(12, 40, brg, 250);
    near(Geo.distanceKm(12, 40, d.lon, d.lat), 250, 0.5, 'destination bearing ' + brg + ' lands 250 km out');
  }
}

section('country lookup');
const COUNTRY_CASES = [
  ['Paris', 2.3522, 48.8566, 'France'], ['Tokyo', 139.6917, 35.6895, 'Japan'],
  ['La Paz', -68.15, -16.5, 'Bolivia'], ['Nome', -165.4, 64.5, 'United States of America'],
  ['Anadyr', 177.5, 64.73, 'Russia'], ['Suva', 178.44, -18.14, 'Fiji'],
  ['Chatham Islands', -176.55, -43.95, 'New Zealand'], ['Maseru', 27.48, -29.32, 'Lesotho'],
  ['South Pole', 0, -89.9, 'Antarctica'], ['Longyearbyen', 15.63, 78.22, 'Norway']
];
for (const [name, lon, lat, want] of COUNTRY_CASES) {
  eq(Geo.countryNear(lon, lat, world), want, 'country at ' + name);
}
for (const [name, lon, lat] of [['mid Atlantic', -30, -40], ['mid Pacific', -140, 0],
                                ['Indian Ocean', 80, -30], ['Arctic Ocean', 0, 88]]) {
  eq(Geo.countryNear(lon, lat, world), null, name + ' is open water');
}

/* -------------------------------------------------------------- location data */
section('location data (' + LOCATIONS.length + ' places)');

ok(LOCATIONS.length >= 350, 'at least 350 locations, have ' + LOCATIONS.length);

const REGIONS = ['Europe', 'Asia', 'Middle East', 'Africa', 'N America', 'S America', 'Oceania', 'Polar'];
const countryNames = new Set(world.countries.map(c => c.name));
const seenNames = new Set();
let dataProblems = 0;

for (const L of LOCATIONS) {
  const tag = L && L.n ? L.n : '(unnamed)';
  let bad = null;
  if (!L.n || typeof L.n !== 'string') bad = 'missing name';
  else if (seenNames.has(L.n)) bad = 'duplicate name';
  else if (!(typeof L.lat === 'number' && L.lat >= -90 && L.lat <= 90)) bad = 'bad latitude';
  else if (!(typeof L.lon === 'number' && L.lon >= -180 && L.lon <= 180)) bad = 'bad longitude';
  else if (!(L.d >= 1 && L.d <= 5)) bad = 'bad difficulty';
  else if (REGIONS.indexOf(L.r) === -1) bad = 'unknown region ' + L.r;
  else if (!L.q || L.q.length < 25) bad = 'hook too short';
  else if (!L.s || L.s.length < 40) bad = 'story too short';
  else if (L.c !== null && !countryNames.has(L.c) && !L.x) bad = 'country name not in Natural Earth: ' + L.c;
  else {
    const poly = Geo.countryNear(L.lon, L.lat, world);
    if (L.c === null && poly !== null) bad = 'declared open water but sits in ' + poly;
    else if (L.c !== null && poly !== L.c && !L.x) bad = 'coordinate lands in ' + poly;
    else if (L.x && poly === L.c) bad = 'stale x flag — polygon agrees now';
  }
  seenNames.add(L.n);
  if (bad) { dataProblems++; if (dataProblems <= 10) console.log('      ' + tag + ': ' + bad); }
}
eq(dataProblems, 0, 'every location is internally consistent');

// Every difficulty band a tier can ask for must have enough entries to fill rounds.
{
  const byD = {};
  LOCATIONS.forEach(L => { byD[L.d] = (byD[L.d] || 0) + 1; });
  for (let d = 1; d <= 5; d++) ok((byD[d] || 0) >= 20, 'difficulty ' + d + ' has ' + (byD[d] || 0) + ' locations');
  const byR = {};
  LOCATIONS.forEach(L => { byR[L.r] = (byR[L.r] || 0) + 1; });
  for (const r of REGIONS) ok((byR[r] || 0) >= 5, 'region ' + r + ' has ' + (byR[r] || 0) + ' locations');
}

// The hook should set up the place without printing the answer in it.
{
  let leaks = 0;
  for (const L of LOCATIONS) {
    const bare = L.n.replace(/[’'`]/g, '').toLowerCase();
    if (bare.length >= 5 && L.q.replace(/[’'`]/g, '').toLowerCase().includes(bare)) {
      leaks++;
      if (leaks <= 5) console.log('      hook names the answer: ' + L.n);
    }
  }
  eq(leaks, 0, 'no hook gives away its own answer');
}

/* ---------------------------------------------------------------- scoring */
section('scoring');

eq(Game.MULTIPLIERS.reduce((a, b) => a + b, 0), 10, 'multipliers sum to ten');
eq(Game.maxScore(), 1000, 'a flawless round is exactly 1000');
eq(Game.MULTIPLIERS.length, 5, 'five questions');

eq(Game.scoreGuess(0, 'France', ['France'], 0).unit, 100, 'exact hit scores 100');
eq(Game.scoreGuess(24, 'France', ['France'], 0).unit, 100, 'inside the bullseye radius scores 100');
ok(Game.scoreGuess(24, 'France', ['France'], 0).perfect, '24 km counts as a bullseye');
ok(!Game.scoreGuess(26, 'France', ['France'], 0).perfect, '26 km does not');

// The curve must fall away, never rise, and never go negative.
{
  let prev = 101, monotone = true;
  for (let km = 0; km <= 20000; km += 25) {
    const s = Game.distanceScore(km);
    if (s > prev + 1e-9) monotone = false;
    if (s < 0) monotone = false;
    prev = s;
  }
  ok(monotone, 'distance score decreases monotonically to zero');
  near(Math.round(Game.distanceScore(250)), 85, 2, '250 km scores about 85');
  near(Math.round(Game.distanceScore(1000)), 50, 3, '1000 km scores about 50');
  near(Math.round(Game.distanceScore(3000)), 12, 3, '3000 km scores about 12');
  ok(Game.distanceScore(15000) < 1, 'the other side of the world scores under 1');
}

// Country bonus behaviour.
{
  const hit = Game.scoreGuess(300, 'France', ['France'], 0);
  const miss = Game.scoreGuess(300, 'Belgium', ['France'], 0);
  eq(hit.bonus, 10, 'right country pays 10');
  eq(miss.bonus, 0, 'wrong country pays nothing');
  eq(hit.unit - miss.unit, 10, 'the bonus is the only difference');
  eq(Game.scoreGuess(5, 'France', ['France'], 0).unit, 100, 'bonus cannot push a bullseye past 100');
  eq(Game.scoreGuess(5, 'France', ['France'], 0).bonus, 0, 'and reports no bonus when capped out');

  const border = Game.scoreGuess(200, 'China', ['China', 'Nepal'], 0);
  const border2 = Game.scoreGuess(200, 'Nepal', ['China', 'Nepal'], 0);
  eq(border.bonus, 10, 'either side of a border summit earns the bonus');
  eq(border2.bonus, 10, 'and so does the other side');

  // Specks too small for the country polygons fall back to proximity. Inside that
  // radius you are already scoring in the nineties, so the bonus is usually
  // clipped by the 100 cap — what matters is that it fires at all.
  const isleNear = Game.scoreGuess(100, null, [], 0);
  const isleFar = Game.scoreGuess(400, null, [], 0);
  ok(isleNear.countryHit, 'no polygon: close enough counts as the right place');
  eq(isleNear.unit, 100, 'and that lifts a near miss to a full 100');
  ok(!isleFar.countryHit, 'no polygon: far away does not count');
  eq(isleFar.bonus, 0, 'and earns nothing');
  ok(Game.scoreGuess(Game.ISLAND_BONUS_KM + 1, null, [], 0).countryHit === false, 'the island radius has a hard edge');
}

// Multipliers apply to the right questions and produce whole numbers.
{
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const r = Game.scoreGuess(0, 'France', ['France'], i);
    eq(r.multiplier, Game.MULTIPLIERS[i], 'question ' + (i + 1) + ' multiplier');
    eq(r.points, 100 * Game.MULTIPLIERS[i], 'question ' + (i + 1) + ' points');
    ok(Number.isInteger(r.points), 'points are whole numbers');
    total += r.points;
  }
  eq(total, 1000, 'five bullseyes make exactly 1000');
}

// A wild guess must not produce a negative or NaN score.
{
  const r = Game.scoreGuess(19800, null, ['Chile'], 4);
  ok(r.points >= 0 && Number.isFinite(r.points), 'antipodal guess scores a finite non-negative number');
}

/* --------------------------------------------------------- round building */
section('round building');

{
  let rounds = 0, tooCloseCount = 0, dupCount = 0, wrongLength = 0, rampBreaks = 0, offBand = 0;
  for (const tier of Game.TIER_ORDER) {
    const bands = Game.TIERS[tier].bands;
    for (let seed = 1; seed <= 300; seed++) {
      const rng = Game.makeRng(seed * 7919);
      const round = Game.buildRound(LOCATIONS, tier, [], rng);
      rounds++;
      if (round.length !== 5) wrongLength++;
      const names = new Set(round.map(L => L.n));
      if (names.size !== round.length) dupCount++;
      for (let i = 0; i < round.length; i++) {
        for (let j = i + 1; j < round.length; j++) {
          if (Geo.distanceKm(round[i].lon, round[i].lat, round[j].lon, round[j].lat) < Game.MIN_SEPARATION_KM) tooCloseCount++;
        }
        if (Math.abs(round[i].d - bands[i]) > 2) offBand++;
      }
      for (let i = 1; i < round.length; i++) if (round[i].d < round[i - 1].d - 2) rampBreaks++;
    }
  }
  eq(rounds, 900, 'built 900 rounds across all tiers');
  eq(wrongLength, 0, 'every round has five questions');
  eq(dupCount, 0, 'no round repeats a location');
  eq(tooCloseCount, 0, 'no two answers in a round are within 200 km');
  eq(offBand, 0, 'every pick sits within the tier band');
  eq(rampBreaks, 0, 'difficulty never collapses mid-round');
}

// Tiers must actually differ in difficulty, or the selector is decoration.
{
  const avg = {};
  for (const tier of Game.TIER_ORDER) {
    let sum = 0, n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      Game.buildRound(LOCATIONS, tier, [], Game.makeRng(seed * 104729)).forEach(L => { sum += L.d; n++; });
    }
    avg[tier] = sum / n;
  }
  ok(avg.tourist < avg.explorer - 0.4, 'Tourist is easier than Explorer (' + avg.tourist.toFixed(2) + ' vs ' + avg.explorer.toFixed(2) + ')');
  ok(avg.explorer < avg.cartographer - 0.4, 'Explorer is easier than Cartographer (' + avg.explorer.toFixed(2) + ' vs ' + avg.cartographer.toFixed(2) + ')');
}

// The recent list is what keeps back-to-back rounds fresh.
{
  const recent = LOCATIONS.filter(L => L.d <= 3).slice(0, 60).map(L => L.n);
  let reused = 0;
  for (let seed = 1; seed <= 200; seed++) {
    Game.buildRound(LOCATIONS, 'explorer', recent, Game.makeRng(seed * 31337))
      .forEach(L => { if (recent.indexOf(L.n) !== -1) reused++; });
  }
  eq(reused, 0, 'recently seen locations are skipped while alternatives exist');
}

// Playing many rounds in a row — the thing this build exists for — must keep varying.
{
  const stats = Game.blankStats();
  const seen = {};
  const rng = Game.makeRng(20260817);
  for (let r = 0; r < 40; r++) {
    const round = Game.buildRound(LOCATIONS, 'explorer', stats.recent, rng);
    round.forEach(L => { seen[L.n] = (seen[L.n] || 0) + 1; });
    Game.recordRound(stats, 'explorer', round.map((L, i) => Game.scoreGuess(500, L.c, [L.c], i)).map((res, i) => {
      res.location = round[i]; return res;
    }));
  }
  const distinct = Object.keys(seen).length;
  ok(distinct >= 150, '40 back-to-back rounds drew ' + distinct + ' distinct places');
  const worst = Math.max(...Object.values(seen));
  ok(worst <= 4, 'no location appeared more than 4 times in 40 rounds (worst ' + worst + ')');
}

// Every location must be reachable by some tier, or content is being wasted.
{
  const reachable = new Set();
  for (const tier of Game.TIER_ORDER) {
    for (let seed = 1; seed <= 900; seed++) {
      Game.buildRound(LOCATIONS, tier, [], Game.makeRng(seed * 6151)).forEach(L => reachable.add(L.n));
    }
  }
  const missing = LOCATIONS.filter(L => !reachable.has(L.n)).map(L => L.n);
  if (missing.length) console.log('      unreachable: ' + missing.slice(0, 8).join(', '));
  ok(missing.length === 0, 'every location can appear in some round');
}

section('weak spots');
{
  eq(Game.weakSpotReady([]), false, 'weak spots stay locked with no history');
  eq(Game.weakSpotReady([1, 2, 3, 4]), false, 'still locked at four misses');
  ok(Game.weakSpotReady([1, 2, 3, 4, 5]), 'unlocked at five');

  const misses = [
    { name: 'Bukhara', unit: 12 }, { name: 'Asmara', unit: 4 }, { name: 'Yakutsk', unit: 31 },
    { name: 'Meroë', unit: 22 }, { name: 'Funafuti', unit: 8 }, { name: 'Sofia', unit: 55 }
  ];
  const round = Game.buildWeakSpotRound(LOCATIONS, misses, [], Game.makeRng(11));
  eq(round.length, 5, 'weak spot round has five questions');
  const names = round.map(L => L.n);
  ok(names.indexOf('Asmara') !== -1 && names.indexOf('Funafuti') !== -1, 'the worst misses are included');
  ok(names.indexOf('Sofia') === -1, 'the mildest miss is dropped when five worse ones exist');
  for (let i = 1; i < round.length; i++) ok(round[i].d >= round[i - 1].d, 'weak spot round still ramps');

  const thin = Game.buildWeakSpotRound(LOCATIONS, [{ name: 'Bukhara', unit: 3 }], [], Game.makeRng(5));
  eq(thin.length, 5, 'a short miss list is topped up to five');
  eq(new Set(thin.map(L => L.n)).size, 5, 'and the filler does not duplicate');

  const junk = Game.buildWeakSpotRound(LOCATIONS, [{ name: 'Atlantis', unit: 0 }], [], Game.makeRng(9));
  eq(junk.length, 5, 'an unknown name in the miss list is ignored rather than crashing');
}

/* ------------------------------------------------------------------ stats */
section('stats ledger');

function fakeStorage() {
  const map = {};
  return {
    getItem: k => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    _map: map
  };
}

function resultFor(loc, km, index, countryHit) {
  const r = Game.scoreGuess(km, countryHit ? loc.c : 'Nowhere', [loc.c], index);
  r.location = loc;
  return r;
}

{
  const stats = Game.blankStats();
  const picks = Game.buildRound(LOCATIONS, 'explorer', [], Game.makeRng(3));
  const results = picks.map((L, i) => resultFor(L, 10, i, true));
  const total = Game.recordRound(stats, 'explorer', results);
  eq(total, 1000, 'five bullseyes record as 1000');
  eq(stats.played, 1, 'round counted');
  eq(stats.best, 1000, 'best updated');
  eq(stats.perfects, 5, 'bullseyes counted');
  eq(stats.taps, 5, 'taps counted');
  eq(Game.averageScore(stats), 1000, 'average of one round');
  eq(stats.misses.length, 0, 'perfect play leaves no weak spots');
  eq(stats.recent.length, 5, 'recent list grew');

  const bad = picks.map((L, i) => resultFor(L, 4000, i, false));
  Game.recordRound(stats, 'explorer', bad);
  eq(stats.played, 2, 'second round counted');
  eq(stats.best, 1000, 'best is not lowered by a bad round');
  eq(stats.misses.length, 5, 'bad taps become weak spots');
  ok(Game.averageScore(stats) < 600, 'average dropped after a bad round');

  // Redeeming a place should clear it from the weak spot list.
  Game.recordRound(stats, 'explorer', picks.map((L, i) => resultFor(L, 8, i, true)));
  eq(stats.misses.length, 0, 'places you later nail stop being weak spots');

  const regions = Game.regionAccuracy(stats);
  ok(regions.length > 0, 'region accuracy is reported');
  ok(regions.every(r => r.avg >= 0 && r.avg <= 100), 'region averages stay in range');
}

// Persistence roundtrip, including a corrupted payload.
{
  const store = fakeStorage();
  const stats = Game.blankStats();
  const picks = Game.buildRound(LOCATIONS, 'tourist', [], Game.makeRng(77));
  Game.recordRound(stats, 'tourist', picks.map((L, i) => resultFor(L, 120, i, true)));
  Game.saveStats(stats, store);
  const back = Game.loadStats(store);
  eq(back.played, 1, 'saved round survives a reload');
  eq(back.best, stats.best, 'best survives a reload');
  eq(back.recent.length, 5, 'recent list survives a reload');

  store.setItem(Game.STORE_KEY, '{ this is not json');
  const recovered = Game.loadStats(store);
  eq(recovered.played, 0, 'corrupt storage falls back to a blank ledger');

  store.setItem(Game.STORE_KEY, JSON.stringify({ played: 3 }));
  const partial = Game.loadStats(store);
  eq(partial.played, 3, 'an old partial record keeps its data');
  ok(Array.isArray(partial.misses) && Array.isArray(partial.recent), 'and gains any missing fields');
}

// The ledger must not grow without bound over a long session.
{
  const stats = Game.blankStats();
  const rng = Game.makeRng(4242);
  for (let i = 0; i < 400; i++) {
    const picks = Game.buildRound(LOCATIONS, 'cartographer', stats.recent, rng);
    Game.recordRound(stats, 'cartographer', picks.map((L, q) => resultFor(L, 3000, q, false)));
  }
  eq(stats.played, 400, '400 rounds recorded');
  ok(stats.rounds.length <= 250, 'round history is capped (' + stats.rounds.length + ')');
  ok(stats.misses.length <= 120, 'weak spot list is capped (' + stats.misses.length + ')');
  ok(stats.recent.length <= 90, 'recent list is capped (' + stats.recent.length + ')');
  ok(JSON.stringify(stats).length < 60000, 'saved payload stays small (' + JSON.stringify(stats).length + ' bytes)');
}

/* ---------------------------------------------------------------- sharing */
section('summary text');
{
  const picks = Game.buildRound(LOCATIONS, 'explorer', [], Game.makeRng(101));
  const results = picks.map((L, i) => resultFor(L, [8, 240, 900, 3000, 60][i], i, i % 2 === 0));
  const total = results.reduce((a, r) => a + r.points, 0);
  const text = Game.summaryText('explorer', results, total);
  const lines = text.split('\n');
  eq(lines.length, 6, 'summary is a header plus five lines');
  ok(lines[0].indexOf('Explorer') !== -1, 'summary names the tier');
  ok(lines[0].indexOf(String(total)) !== -1, 'summary shows the total');
  picks.forEach(L => ok(text.indexOf(L.n) !== -1, 'summary lists ' + L.n));
  ok(/PERFECT/.test(lines[1]), 'a bullseye is called out');
  eq(Game.bar(100).length, 5, 'score bar is five blocks');
  eq(Game.bar(0).length, 5, 'empty score bar is still five blocks');

  eq(Game.formatKm(0.4), '400 m', 'sub-kilometre distances read in metres');
  eq(Game.formatKm(12.34), '12.3 km', 'short distances keep a decimal');
  eq(Game.formatKm(1234.5), '1,235 km', 'long distances are rounded and grouped');
}

/* ---------------------------------------------------------- earth texture */
section('earth texture');
{
  const tex = require(path.join(ROOT, 'js/earth-texture.js'));
  eq(typeof tex, 'string', 'the texture is a string');
  ok(tex.indexOf('data:image/jpeg;base64,') === 0, 'it is a base64 JPEG data URI');
  const bytes = Buffer.from(tex.split(',')[1], 'base64');
  ok(bytes.length > 400000, 'the payload is a real image (' + Math.round(bytes.length / 1024) + ' KB)');
  // A truncated embed would still parse as JS and still look like a data URI —
  // only the end-of-image marker proves the whole file made it in.
  eq(bytes[0], 0xff, 'JPEG start marker byte 1');
  eq(bytes[1], 0xd8, 'JPEG start marker byte 2');
  eq(bytes[bytes.length - 2], 0xff, 'JPEG end marker byte 1');
  eq(bytes[bytes.length - 1], 0xd9, 'JPEG end marker byte 2');

  // Dimensions must be equirectangular 2:1, or the sphere mapping is wrong.
  let w = 0, h = 0;
  for (let i = 2; i < bytes.length - 9;) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      h = bytes.readUInt16BE(i + 5);
      w = bytes.readUInt16BE(i + 7);
      break;
    }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  eq(w, 4096, 'texture width');
  eq(h, 2048, 'texture height');
  eq(w / h, 2, 'the texture is 2:1 equirectangular');
}

/* ----------------------------------------------------------- shader math */
section('shader agrees with hit testing');
{
  // The fragment shader unprojects pixels to sample the texture; geo.js
  // unprojects the same pixels to decide what you clicked on. If those two ever
  // disagree the globe you see is not the globe you are tapping — and nothing
  // else in this suite would notice. So: replicate the shader's arithmetic
  // exactly, including the y-flip, and compare.
  const glsrc = fs.readFileSync(path.join(ROOT, 'js/render-gl.js'), 'utf8');
  ok(/this\.u\.center,\s*this\.cx \* dpr,\s*this\.canvas\.height - this\.cy \* dpr/.test(glsrc),
    'the GL centre uniform still flips y for gl_FragCoord');
  ok(/this\.u\.radius,\s*this\.cam\.scale \* dpr/.test(glsrc), 'the GL radius uniform is in device pixels');

  function shaderSample(sx, sy, cam, cx, cy, dpr, canvasH) {
    // gl_FragCoord: device pixels, origin bottom-left.
    const px = sx * dpr, py = canvasH - sy * dpr;
    const ux = (px - cx * dpr) / (cam.scale * dpr);
    const uy = (py - (canvasH - cy * dpr)) / (cam.scale * dpr);
    if (ux * ux + uy * uy > 1) return null;
    const w = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
    const b = Geo.basis(cam);
    const x = b.east[0] * ux + b.north[0] * uy + b.view[0] * w;
    const y = b.east[1] * ux + b.north[1] * uy + b.view[1] * w;
    const z = b.east[2] * ux + b.north[2] * uy + b.view[2] * w;
    const len = Math.hypot(x, y, z);
    return {
      lon: Math.atan2(y / len, x / len) * 180 / Math.PI,
      lat: Math.asin(Math.max(-1, Math.min(1, z / len))) * 180 / Math.PI
    };
  }

  let worst = 0, compared = 0;
  const rng = Game.makeRng(8675309);   // fixed, so the check count never drifts
  for (const dpr of [1, 2, 2.5]) {
    for (const cam of [{ lon: 0, lat: 0, scale: 300 }, { lon: 137, lat: -48, scale: 1100 },
                       { lon: -22, lat: 71, scale: 4000 }]) {
      const cssW = 1000, cssH = 700, cx = cssW / 2, cy = cssH / 2;
      const canvasH = Math.round(cssH * dpr);
      for (let i = 0; i < 200; i++) {
        const sx = rng() * cssW, sy = rng() * cssH;
        const mine = Geo.unproject(sx, sy, cam, cx, cy);
        const theirs = shaderSample(sx, sy, cam, cx, cy, dpr, canvasH);
        if (!mine || !theirs) { ok(!mine === !theirs, 'both agree the pixel misses the globe'); continue; }
        worst = Math.max(worst, Geo.distanceKm(mine.lon, mine.lat, theirs.lon, theirs.lat));
        compared++;
      }
    }
  }
  ok(compared > 1000, 'compared ' + compared + ' pixels between shader and hit test');
  ok(worst < 0.01, 'what you see and what you tap agree to within ' + worst.toExponential(2) + ' km');
}

/* ------------------------------------------------------- streaming detail */
section('tile maths');
{
  const Tiles = require(path.join(ROOT, 'js/tiles.js'));

  // The level table must match the GIBS EPSG:4326 "500m" matrix set exactly, or
  // every tile request is off by a factor of two and the globe goes wrong.
  eq(Tiles.LEVELS.length, 5, 'five usable levels');
  eq(Tiles.TILE_PX, 512, 'GIBS 4326 tiles are 512 px');
  const expected = [[3, 10, 5], [4, 20, 10], [5, 40, 20], [6, 80, 40], [7, 160, 80]];
  Tiles.LEVELS.forEach((L, i) => {
    eq(L.z, expected[i][0], 'level ' + i + ' z');
    eq(L.cols, expected[i][1], 'level ' + i + ' matrix width');
    eq(L.rows, expected[i][2], 'level ' + i + ' matrix height');
    eq(L.cols * L.span, 360, 'level ' + L.z + ' tiles wrap the globe exactly');
    eq(L.rows * L.span, 180, 'level ' + L.z + ' tiles cover pole to pole exactly');
  });
  near(Tiles.LEVELS[4].degPerPx * 111319, 489, 2, 'finest level is ~489 m per pixel');
  ok(Tiles.LEVELS[0].degPerPx < Tiles.BASE_DEG_PER_PX,
    'the coarsest streamed level still beats the embedded texture');

  // The URL has to be exactly the template GIBS advertises.
  eq(Tiles.tileUrl(7, 12, 34),
    'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/500m/7/12/34.jpeg',
    'tile URL matches the WMTS ResourceURL template');

  // Level selection: coarse views must not stream at all, close views must.
  eq(Tiles.pickLevel(Tiles.BASE_DEG_PER_PX * 2), null, 'a world view streams nothing');
  eq(Tiles.pickLevel(Tiles.BASE_DEG_PER_PX), null, 'matching the embedded texture streams nothing');
  ok(Tiles.pickLevel(Tiles.BASE_DEG_PER_PX * 0.9) !== null, 'just past it, streaming starts');
  eq(Tiles.pickLevel(0.0000001).z, 7, 'extreme zoom asks for the finest level');
  for (const L of Tiles.LEVELS) {
    const picked = Tiles.pickLevel(L.degPerPx);
    ok(picked.degPerPx <= L.degPerPx, 'level for ' + L.z + ' is at least as sharp as asked');
  }

  // Resolution maths against the real camera, at the zoom limits the game uses.
  {
    const minDim = 800, fit = minDim * 0.42;
    const wide = Tiles.degreesPerPixel(fit, minDim);
    const deep = Tiles.degreesPerPixel(fit * 34, minDim);
    ok(wide > Tiles.BASE_DEG_PER_PX, 'at fit zoom the embedded texture is enough');
    ok(deep < Tiles.LEVELS[4].degPerPx * 1.6, 'at max zoom the finest level is roughly matched');
    eq(Tiles.pickLevel(deep).z, 7, 'max zoom selects the finest level');
    ok(Tiles.degreesPerPixel(fit * 2, minDim) < wide, 'zooming in lowers degrees per pixel');
  }

  // Coverage: never more than the tile budget, and always actually covering the view.
  {
    let worstTiles = 0, checked = 0;
    for (const zoom of [1.5, 2, 3, 5, 8, 13, 21, 34]) {
      for (const lat of [0, 35, -52, 78, -85]) {
        for (const lon of [0, 179.4, -176, 63]) {
          const cam = { lon, lat, scale: 800 * 0.42 * zoom };
          const dpp = Tiles.degreesPerPixel(cam.scale, 800);
          const level = Tiles.pickLevel(dpp);
          if (!level) continue;
          const rect = Tiles.viewRect(cam, 1000, 800);
          const cov = Tiles.coverage(rect, level);
          ok(cov, 'coverage exists at zoom ' + zoom + ' lat ' + lat);
          ok(cov.tiles.length <= Tiles.MAX_TILES,
            'tile budget respected (' + cov.tiles.length + ') at zoom ' + zoom + ' lat ' + lat);
          worstTiles = Math.max(worstTiles, cov.tiles.length);
          checked++;
          // Rows must be inside the matrix, columns wrapped into it.
          cov.tiles.forEach(t => {
            ok(t.row >= 0 && t.row < cov.level.rows, 'row ' + t.row + ' is inside the matrix');
            ok(t.col >= 0 && t.col < cov.level.cols, 'col ' + t.col + ' is inside the matrix');
          });
          // The composite must actually contain the point being looked at.
          const relLon = ((cam.lon - cov.lonMin) % 360 + 360) % 360;
          ok(relLon <= cov.lonSpan + 1e-9, 'the camera longitude falls inside the composite');
          const clampedLat = Math.max(-90, Math.min(90, cam.lat));
          ok(clampedLat <= cov.latMax + 1e-9 && clampedLat >= cov.latMax - cov.latSpan - 1e-9,
            'the camera latitude falls inside the composite');
        }
      }
    }
    ok(checked > 40, 'checked ' + checked + ' camera positions');
    ok(worstTiles <= 16, 'worst case was ' + worstTiles + ' tiles');
  }

  // A view straddling the antimeridian must stay one contiguous grid.
  {
    const cam = { lon: 179.6, lat: 4, scale: 800 * 0.42 * 12 };
    const cov = Tiles.coverage(Tiles.viewRect(cam, 1000, 800), Tiles.pickLevel(Tiles.degreesPerPixel(cam.scale, 800)));
    ok(cov.tiles.length > 1, 'the seam view needs several tiles');
    const cols = [...new Set(cov.tiles.map(t => t.col))];
    ok(cols.some(c => c > cov.level.cols - 3) && cols.some(c => c < 3),
      'tiles are taken from both sides of the antimeridian');
    cov.tiles.forEach(t => ok(t.col >= 0 && t.col < cov.level.cols, 'wrapped column stays valid'));
  }

  // Polar views must not ask for rows that do not exist.
  {
    for (const lat of [89.9, -89.9]) {
      const cam = { lon: 0, lat, scale: 800 * 0.42 * 9 };
      const cov = Tiles.coverage(Tiles.viewRect(cam, 1000, 800), Tiles.pickLevel(Tiles.degreesPerPixel(cam.scale, 800)));
      cov.tiles.forEach(t => ok(t.row >= 0 && t.row < cov.level.rows, 'polar row ' + t.row + ' is valid'));
    }
  }
}

section('tile streaming');
{
  const Tiles = require(path.join(ROOT, 'js/tiles.js'));

  // Fake Image + canvas so the stream can be driven without a network or a DOM.
  const loads = [];
  class FakeImage {
    constructor() { this.onload = null; this.onerror = null; this.crossOrigin = null; }
    set src(v) { this._src = v; loads.push(this); }
    get src() { return this._src; }
  }
  const drawn = [];
  globalThis.Image = FakeImage;
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ clearRect() {}, drawImage(...a) { drawn.push(a.length); } })
    })
  };

  function settle(ok) {
    const batch = loads.splice(0, loads.length);
    batch.forEach(img => { if (ok) { if (img.onload) img.onload(); } else if (img.onerror) img.onerror(); });
    return batch.length;
  }

  const cam = { lon: 12, lat: 45, scale: 800 * 0.42 * 10 };
  {
    let changes = 0, statuses = [];
    const s = new Tiles.TileStream({
      onchange: () => changes++,
      onstatus: st => statuses.push(st)
    });

    eq(s.update({ lon: 0, lat: 0, scale: 800 * 0.42 }, 1000, 800), false, 'a world view requests nothing');
    eq(s.requests, 0, 'and issues no network requests at all');

    ok(s.update(cam, 1000, 800), 'a zoomed view requests tiles');
    ok(s.requests > 0, 'tiles were actually requested (' + s.requests + ')');
    ok(statuses.some(st => st.loading), 'loading status was reported');
    ok(loads.every(i => i.crossOrigin === 'anonymous'), 'every request is CORS-enabled for WebGL');
    ok(loads.every(i => i.src.indexOf('https://gibs.earthdata.nasa.gov/') === 0), 'every request goes to GIBS');

    const n = settle(true);
    eq(changes, 1, 'one composite was produced from ' + n + ' tiles');
    ok(s.rect && s.rect.length === 4, 'the composite reports its lon/lat rectangle');
    ok(s.rect[2] > 0 && s.rect[3] > 0, 'the rectangle has positive extent');
    ok(drawn.length >= n, 'every tile was drawn into the canvas');
    eq(s.version, 1, 'version bumped once');

    // Asking again from the same place must not re-request anything.
    const before = s.requests;
    eq(s.update(cam, 1000, 800), false, 'the same view is not re-fetched');
    eq(s.requests, before, 'no extra requests');

    // A nearby view reusing the same tiles must hit the cache.
    s.update({ lon: cam.lon + 0.05, lat: cam.lat, scale: cam.scale }, 1000, 800);
    eq(s.requests, before, 'cached tiles are reused rather than re-fetched');

    // Zooming back out drops the detail so the base texture shows through.
    const versionBefore = s.version;
    s.update({ lon: 0, lat: 0, scale: 800 * 0.42 }, 1000, 800);
    eq(s.rect, null, 'zooming out clears the detail rectangle');
    ok(s.version > versionBefore, 'and tells the renderer to update');
  }

  // Being offline must degrade quietly, then stop trying.
  {
    let changes = 0, unavailable = false;
    const s = new Tiles.TileStream({
      onchange: () => changes++,
      onstatus: st => { if (st.unavailable) unavailable = true; }
    });
    for (let i = 0; i < 4 && !unavailable; i++) {
      s.update({ lon: i * 30, lat: 10, scale: 800 * 0.42 * (9 + i) }, 1000, 800);
      settle(false);
    }
    eq(changes, 0, 'failed tiles never produce a composite');
    ok(unavailable, 'the stream reports itself unavailable after repeated failures');
    ok(s.disabledByFailure, 'and stops trying');
    const before = s.requests;
    s.update({ lon: 100, lat: 0, scale: 800 * 0.42 * 20 }, 1000, 800);
    eq(s.requests, before, 'no further requests once disabled');
  }

  // A partial grid must be discarded rather than composited with black holes.
  {
    let changes = 0;
    const s = new Tiles.TileStream({ onchange: () => changes++ });
    s.update(cam, 1000, 800);
    const batch = loads.splice(0, loads.length);
    batch.forEach((img, i) => { if (i === 0) { if (img.onerror) img.onerror(); } else if (img.onload) img.onload(); });
    eq(changes, 0, 'a grid with a missing tile is thrown away');
    ok(s.currentKey === null, 'and will be retried rather than remembered');
  }

  // Switching it off must silence the network entirely.
  {
    const s = new Tiles.TileStream({ enabled: false });
    eq(s.update(cam, 1000, 800), false, 'a disabled stream does nothing');
    eq(s.requests, 0, 'and makes no requests');
    s.setEnabled(true);
    ok(s.update(cam, 1000, 800), 're-enabling brings it back');
  }

  // The cache must not grow without bound over a long session.
  {
    const s = new Tiles.TileStream({ cacheMax: 8 });
    for (let i = 0; i < 40; i++) s._remember('u' + i, { i });
    ok(s.cacheOrder.length <= 8, 'cache order list is capped');
    eq(Object.keys(s.cache).length, 8, 'cache itself is capped');
    ok(!s.cache['u0'], 'the oldest entry was evicted');
    ok(!!s.cache['u39'], 'the newest entry is kept');
  }

  delete globalThis.Image;
  delete globalThis.document;
  loads.length = 0;
}

/* ------------------------------------------------------------------ audio */
section('audio');

// A recording stand-in for WebAudio: every node type the synth reaches for,
// remembering what was scheduled on it.
function fakeAudio() {
  const made = { osc: [], gain: [], filter: [], buffer: [], source: [] };
  function Param(v) { this.value = v; this.calls = []; }
  Param.prototype.setValueAtTime = function (v, t) { this.calls.push(['set', v, t]); return this; };
  Param.prototype.exponentialRampToValueAtTime = function (v, t) { this.calls.push(['exp', v, t]); return this; };
  Param.prototype.linearRampToValueAtTime = function (v, t) { this.calls.push(['lin', v, t]); return this; };
  Param.prototype.setTargetAtTime = function (v, t, c) { this.calls.push(['target', v, t, c]); return this; };

  const ctx = {
    currentTime: 0, sampleRate: 48000, state: 'running', destination: {},
    createOscillator() {
      const o = { type: 'sine', frequency: new Param(440), connect() {}, start(t) { o.started = t; }, stop(t) { o.stopped = t; } };
      made.osc.push(o); return o;
    },
    createGain() { const g = { gain: new Param(1), connect() {} }; made.gain.push(g); return g; },
    createBiquadFilter() {
      const f = { type: 'lowpass', frequency: new Param(1000), Q: { value: 1 }, connect() {} };
      made.filter.push(f); return f;
    },
    createBuffer(ch, len) {
      const b = { length: len, numberOfChannels: ch, getChannelData: () => new Float32Array(len) };
      made.buffer.push(b); return b;
    },
    createBufferSource() {
      const s = { buffer: null, connect() {}, start(t) { s.started = t; }, stop(t) { s.stopped = t; } };
      made.source.push(s); return s;
    },
    resume() { ctx.state = 'running'; }
  };
  return { ctx, made };
}

{
  const audio = fakeAudio();
  const memStore = (() => {
    const m = {};
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m };
  })();
  globalThis.AudioContext = function () { return audio.ctx; };
  globalThis.localStorage = memStore;

  const Sfx = require(path.join(ROOT, 'js/audio.js'));

  eq(Sfx.loadPref(), false, 'sound starts on');
  ok(!!Sfx.init(), 'audio context is created');
  eq(Sfx.init(), audio.ctx, 'init is idempotent');

  // Every voice must actually synthesise something, and none may throw.
  const names = Sfx.voiceNames();
  ok(names.length >= 10, 'there are ' + names.length + ' voices');
  for (const name of names) {
    const before = audio.made.osc.length + audio.made.source.length;
    let threw = null;
    try { Sfx.play(name, 880); } catch (e) { threw = e; }
    eq(threw, null, 'voice "' + name + '" plays without throwing' + (threw ? ': ' + threw.message : ''));
    ok(audio.made.osc.length + audio.made.source.length > before, 'voice "' + name + '" makes sound');
  }
  eq(Sfx.play('no-such-sound'), false, 'an unknown voice is refused, not crashed on');
  eq(Sfx.has('bullseye'), true, 'has() finds a real voice');
  eq(Sfx.has('nonsense'), false, 'has() rejects a fake one');

  // Everything must start and stop; a note that never stops is a stuck drone.
  ok(audio.made.osc.every(o => o.started !== undefined), 'every oscillator was started');
  ok(audio.made.osc.every(o => o.stopped !== undefined && o.stopped > o.started), 'every oscillator was scheduled to stop');
  ok(audio.made.source.every(s => s.stopped !== undefined), 'every noise burst was scheduled to stop');

  // Nothing should be loud enough to hurt: peaks stay well under unity.
  let loudest = 0;
  audio.made.gain.forEach(g => g.gain.calls.forEach(c => {
    if (c[0] === 'exp' || c[0] === 'set') loudest = Math.max(loudest, c[1]);
  }));
  ok(loudest <= 0.3, 'no envelope peaks above 0.3 (loudest ' + loudest.toFixed(3) + ')');
  // Exponential ramps to exactly zero are a silent WebAudio no-op; guard against it.
  let zeroRamp = 0;
  audio.made.gain.forEach(g => g.gain.calls.forEach(c => { if (c[0] === 'exp' && c[1] <= 0) zeroRamp++; }));
  eq(zeroRamp, 0, 'no exponential ramp targets zero');

  // A good round should sound richer than a bad one.
  const countBefore = audio.made.osc.length;
  Sfx.play('finish', 380);
  const poor = audio.made.osc.length - countBefore;
  const midCount = audio.made.osc.length;
  Sfx.play('finish', 980);
  const great = audio.made.osc.length - midCount;
  ok(great > poor, 'a great round plays a fuller chord than a poor one (' + great + ' vs ' + poor + ')');

  // Muting must be total, and must persist.
  Sfx.setMuted(true);
  const silentFrom = audio.made.osc.length + audio.made.source.length;
  eq(Sfx.play('tap'), false, 'muted play is refused');
  Sfx.play('bullseye');
  Sfx.play('finish', 900);
  eq(audio.made.osc.length + audio.made.source.length, silentFrom, 'muted really means silent');
  eq(memStore.getItem('maptap.muted.v1'), '1', 'mute preference is stored');
  eq(Sfx.toggle(), false, 'toggle turns it back on');
  eq(memStore.getItem('maptap.muted.v1'), '0', 'and stores that too');
  ok(Sfx.play('tap'), 'sound works again after unmuting');

  // Every sound the page asks for must exist in the synth.
  const pageHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const used = [...pageHtml.matchAll(/sfx\('([a-z]+)'/g)].map(m => m[1]);
  ok(used.length >= 8, 'the page triggers ' + used.length + ' sounds');
  [...new Set(used)].forEach(n => ok(Sfx.has(n), 'page sound "' + n + '" exists in the synth'));
  // ...and the important moments must actually be wired.
  for (const n of ['tap', 'lock', 'sweep', 'bullseye', 'finish', 'ui', 'deny']) {
    ok(used.indexOf(n) !== -1, 'the page plays "' + n + '"');
  }
}

/* --------------------------------------------------- UI wiring (static) */
section('ui wiring');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  // Every script the page loads must exist on disk.
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  eq(srcs.length, 9, 'nine script files are loaded');
  eq(srcs.indexOf('js/tiles.js') !== -1, true, 'the tile streamer is loaded');
  for (const s of srcs) ok(fs.existsSync(path.join(ROOT, s)), 'script exists: ' + s);
  // ...and in an order where each file's dependencies are already defined.
  eq(srcs.indexOf('js/world-data.js') < srcs.indexOf('js/geo.js'), true, 'world data loads before geo');
  eq(srcs.indexOf('js/geo.js') < srcs.indexOf('js/game.js'), true, 'geo loads before game');
  eq(srcs.indexOf('js/geo.js') < srcs.indexOf('js/render.js'), true, 'geo loads before render');
  // render-gl borrows methods off Globe.prototype at load time, so order matters.
  eq(srcs.indexOf('js/render.js') < srcs.indexOf('js/render-gl.js'), true, 'vector renderer loads before the GL one');
  eq(srcs.indexOf('js/earth-texture.js') < srcs.indexOf('js/render-gl.js'), true, 'texture loads before the GL renderer');

  // Both canvases must exist: WebGL cannot share a canvas with a 2D context.
  ok(/<canvas id="globe">/.test(html), 'the GL canvas is in the page');
  ok(/<canvas id="overlay">/.test(html), 'the 2D overlay canvas is in the page');
  ok(/#overlay\{[^}]*pointer-events:none/.test(html), 'the overlay does not swallow pointer events');

  // Every id the script reaches for must exist in the markup. This is the class of
  // bug a headless run would otherwise never see.
  const declaredIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const usedIds = new Set([...html.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
  const missing = [...usedIds].filter(id => !declaredIds.has(id));
  if (missing.length) console.log('      missing elements: ' + missing.join(', '));
  eq(missing.length, 0, 'every element the script looks up exists (' + usedIds.size + ' ids used)');

  // Buttons that must be wired, or the player gets stuck on a screen.
  for (const id of ['actionBtn', 'quitBtn', 'againBtn', 'menuBtn', 'statsBtn', 'statsBack',
                    'howBtn', 'howBack', 'copyBtn', 'resetBtn', 'weakBtn', 'muteBtn', 'muteBtn2']) {
    ok(new RegExp('\\$\\(\'' + id + '\'\\)\\.addEventListener').test(html), id + ' has a click handler');
  }
  // Every tier button in the markup must carry a tier the game knows.
  const tierAttrs = [...html.matchAll(/data-tier="([^"]+)"/g)].map(m => m[1]);
  eq(tierAttrs.length, 3, 'three tier buttons');
  for (const t of tierAttrs) ok(!!Game.TIERS[t], 'tier button "' + t + '" is a real tier');
  for (const t of Game.TIER_ORDER) ok(tierAttrs.indexOf(t) !== -1, 'tier ' + t + ' has a button');

  // Globals the page depends on being defined by the loaded scripts.
  for (const g of ['LOCATIONS', 'Geo', 'Game', 'Globe']) {
    ok(new RegExp('\\b' + g + '\\b').test(html), 'page references ' + g);
  }
  ok(/pointerdown/.test(html) && /pointerup/.test(html), 'pointer input is wired');
  ok(/wheel/.test(html), 'wheel zoom is wired');
  ok(/touchmove/.test(html), 'pinch zoom is wired');
  ok(/keydown/.test(html), 'keyboard input is wired');
  ok(/requestAnimationFrame/.test(html), 'render loop is started');
}

/* ------------------------------------------------ a whole round, end to end */
section('full round simulation');
{
  const stats = Game.blankStats();
  const rng = Game.makeRng(999);
  const round = Game.buildRound(LOCATIONS, 'explorer', stats.recent, rng);
  const results = [];
  let total = 0;

  round.forEach((loc, i) => {
    // Guess 180 km north-east of the truth, as a merely decent player might.
    const guess = Geo.destination(loc.lon, loc.lat, 45, 180);
    const km = Geo.distanceKm(guess.lon, guess.lat, loc.lon, loc.lat);
    const gc = Geo.countryNear(guess.lon, guess.lat, world);
    const res = Game.scoreGuess(km, gc, Game.answerCountries(loc, world), i);
    res.location = loc;
    results.push(res);
    total += res.points;
    near(km, 180, 1, 'simulated guess for ' + loc.n + ' is 180 km out');
    ok(res.unit >= 80 && res.unit <= 100, 'a 180 km guess scores 80–100 (' + res.unit + ' for ' + loc.n + ')');
  });

  eq(Game.recordRound(stats, 'explorer', results), total, 'recorded total matches the running total');
  ok(total > 800 && total < 1000, 'a consistently decent round lands between 800 and 1000 (' + total + ')');
  eq(stats.misses.length, 0, 'decent play produces no weak spots');
  ok(Game.summaryText('explorer', results, total).split('\n').length === 6, 'summary generated for the round');
}

/* ------------------------------------------------------------------ report */
console.log('\n' + '-'.repeat(58));
if (failures.length) {
  console.log('FAILURES (' + failures.length + '):');
  failures.forEach(f => console.log('  ✗ ' + f));
  console.log('-'.repeat(58));
  console.log(checks + ' checks, ' + failures.length + ' failed');
  process.exit(1);
} else {
  console.log('all ' + checks + ' checks passed');
  process.exit(0);
}
