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

/* --------------------------------------------------- UI wiring (static) */
section('ui wiring');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  // Every script the page loads must exist on disk.
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  ok(srcs.length === 5, 'five script files are loaded');
  for (const s of srcs) ok(fs.existsSync(path.join(ROOT, s)), 'script exists: ' + s);
  // ...and in an order where each file's dependencies are already defined.
  eq(srcs.indexOf('js/world-data.js') < srcs.indexOf('js/geo.js'), true, 'world data loads before geo');
  eq(srcs.indexOf('js/geo.js') < srcs.indexOf('js/game.js'), true, 'geo loads before game');
  eq(srcs.indexOf('js/geo.js') < srcs.indexOf('js/render.js'), true, 'geo loads before render');

  // Every id the script reaches for must exist in the markup. This is the class of
  // bug a headless run would otherwise never see.
  const declaredIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const usedIds = new Set([...html.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
  const missing = [...usedIds].filter(id => !declaredIds.has(id));
  if (missing.length) console.log('      missing elements: ' + missing.join(', '));
  eq(missing.length, 0, 'every element the script looks up exists (' + usedIds.size + ' ids used)');

  // Buttons that must be wired, or the player gets stuck on a screen.
  for (const id of ['actionBtn', 'quitBtn', 'againBtn', 'menuBtn', 'statsBtn', 'statsBack',
                    'howBtn', 'howBack', 'copyBtn', 'resetBtn', 'weakBtn']) {
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
