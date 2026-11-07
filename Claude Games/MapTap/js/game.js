/* game.js — rules, scoring, round construction, stats.
 *
 * Deliberately free of DOM: index.html draws whatever this says, and
 * test/headless.js drives it directly.
 */
(function (root) {
  'use strict';

  var Geo = root.Geo || (typeof require !== 'undefined' ? require('./geo.js') : null);

  /* ------------------------------------------------------------------ rules */

  // Five questions, multipliers summing to ten, so a flawless round is exactly 1000.
  var MULTIPLIERS = [1, 1, 2, 3, 3];

  // Within this many km counts as a bullseye — cities are not points.
  var PERFECT_KM = 25;
  // Exponential falloff constant. 250 km ≈ 85, 1000 km ≈ 50, 3000 km ≈ 12.
  var DECAY_KM = 1400;
  // Getting the country right is worth this much, but never lifts you past 100.
  var COUNTRY_BONUS = 10;
  // When the answer is too small for the country polygons, being this close counts instead.
  var ISLAND_BONUS_KM = 150;

  var TIERS = {
    tourist: { key: 'tourist', name: 'Tourist', blurb: 'Capitals and landmarks you have seen a hundred times.', bands: [1, 1, 2, 2, 3] },
    explorer: { key: 'explorer', name: 'Explorer', blurb: 'You know the names. Now place them.', bands: [2, 3, 3, 4, 4] },
    cartographer: { key: 'cartographer', name: 'Cartographer', blurb: 'Obscure, remote, and unforgiving.', bands: [3, 4, 5, 5, 5] }
  };
  var TIER_ORDER = ['tourist', 'explorer', 'cartographer'];

  function distanceScore(km) {
    if (km <= PERFECT_KM) return 100;
    return 100 * Math.exp(-(km - PERFECT_KM) / DECAY_KM);
  }

  // One guess, fully resolved. `answerCountries` is what counts as "right country" —
  // usually one name, two for a border summit, none for a speck in the ocean.
  function scoreGuess(km, guessCountry, answerCountries, questionIndex) {
    var base = Math.round(distanceScore(km));
    var countryHit = false;
    if (answerCountries && answerCountries.length && guessCountry) {
      for (var i = 0; i < answerCountries.length; i++) {
        if (answerCountries[i] === guessCountry) { countryHit = true; break; }
      }
    } else if (!answerCountries || !answerCountries.length) {
      countryHit = km <= ISLAND_BONUS_KM;   // no polygon to match, so use proximity
    }
    var withBonus = Math.min(100, base + (countryHit ? COUNTRY_BONUS : 0));
    var mult = MULTIPLIERS[questionIndex] || 1;
    return {
      km: km,
      base: base,
      countryHit: countryHit,
      bonus: withBonus - base,
      unit: withBonus,
      multiplier: mult,
      points: withBonus * mult,
      perfect: km <= PERFECT_KM
    };
  }

  // Which country names count as correct for a given location.
  function answerCountries(loc, world) {
    var out = [];
    var poly = Geo.countryNear(loc.lon, loc.lat, world);
    if (poly) out.push(poly);
    if (loc.c && out.indexOf(loc.c) === -1) out.push(loc.c);
    return out;
  }

  function maxScore() {
    var t = 0;
    for (var i = 0; i < MULTIPLIERS.length; i++) t += 100 * MULTIPLIERS[i];
    return t;
  }

  /* -------------------------------------------------------- round building */

  function makeRng(seed) {
    if (seed === undefined || seed === null) return Math.random;
    var s = seed >>> 0;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function pickOne(list, rng) { return list[Math.floor(rng() * list.length)]; }

  // Two answers in the same round should not be within sight of each other.
  var MIN_SEPARATION_KM = 200;

  function tooClose(loc, chosen) {
    for (var i = 0; i < chosen.length; i++) {
      if (Geo.distanceKm(loc.lon, loc.lat, chosen[i].lon, chosen[i].lat) < MIN_SEPARATION_KM) return true;
    }
    return false;
  }

  /* Builds five questions for a tier, easiest first.
   * `recent` is a list of names to avoid so back-to-back rounds feel fresh; it is
   * relaxed automatically if a difficulty band has nothing left. */
  function buildRound(locations, tierKey, recent, rng) {
    rng = rng || Math.random;
    var tier = TIERS[tierKey] || TIERS.explorer;
    var recentSet = {};
    (recent || []).forEach(function (n) { recentSet[n] = true; });

    var chosen = [];
    for (var q = 0; q < tier.bands.length; q++) {
      var band = tier.bands[q];
      var picked = null;
      // Widen the search in stages: exact band, then ±1, then ±2, and only then
      // start allowing recently-seen locations back in.
      var attempts = [
        { spread: 0, allowRecent: false }, { spread: 1, allowRecent: false },
        { spread: 2, allowRecent: false }, { spread: 2, allowRecent: true },
        { spread: 4, allowRecent: true }
      ];
      for (var a = 0; a < attempts.length && !picked; a++) {
        var pool = [];
        for (var i = 0; i < locations.length; i++) {
          var L = locations[i];
          if (Math.abs(L.d - band) > attempts[a].spread) continue;
          if (!attempts[a].allowRecent && recentSet[L.n]) continue;
          if (chosen.indexOf(L) !== -1) continue;
          if (tooClose(L, chosen)) continue;
          pool.push(L);
        }
        if (pool.length) picked = pickOne(pool, rng);
      }
      if (picked) chosen.push(picked);
    }
    return chosen;
  }

  /* A round assembled from the places this player has personally missed.
   * Worst misses first by score, then re-sorted easiest-to-hardest so the ramp
   * still feels like a round rather than a punishment. */
  function buildWeakSpotRound(locations, misses, recent, rng) {
    rng = rng || Math.random;
    var byName = {};
    locations.forEach(function (L) { byName[L.n] = L; });

    var worst = (misses || []).slice().sort(function (a, b) { return a.unit - b.unit; });
    var chosen = [];
    for (var i = 0; i < worst.length && chosen.length < 5; i++) {
      var L = byName[worst[i].name];
      if (!L || chosen.indexOf(L) !== -1 || tooClose(L, chosen)) continue;
      chosen.push(L);
    }
    if (chosen.length < 5) {
      // Not enough history yet — top it up with a normal Explorer draw.
      var filler = buildRound(locations, 'explorer', recent, rng);
      for (var f = 0; f < filler.length && chosen.length < 5; f++) {
        if (chosen.indexOf(filler[f]) === -1 && !tooClose(filler[f], chosen)) chosen.push(filler[f]);
      }
    }
    chosen.sort(function (a, b) { return a.d - b.d; });
    return chosen;
  }

  function weakSpotReady(misses) { return (misses || []).length >= 5; }

  /* ------------------------------------------------------------------ stats */

  var STORE_KEY = 'maptap.endless.v1';
  var MAX_HISTORY = 250;
  var MAX_MISSES = 120;
  var RECENT_MEMORY = 90;

  function blankStats() {
    return {
      rounds: [],        // { score, tier, ts }
      best: 0,
      played: 0,
      perfects: 0,
      taps: 0,
      totalScore: 0,
      byRegion: {},      // region -> { n, sum }
      misses: [],        // { name, unit, ts }
      recent: []         // names, most recent last
    };
  }

  function loadStats(storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!storage) return blankStats();
    try {
      var raw = storage.getItem(STORE_KEY);
      if (!raw) return blankStats();
      var s = JSON.parse(raw);
      var base = blankStats();
      for (var k in base) if (!(k in s)) s[k] = base[k];
      return s;
    } catch (e) {
      return blankStats();
    }
  }

  function saveStats(stats, storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!storage) return;
    try { storage.setItem(STORE_KEY, JSON.stringify(stats)); } catch (e) { /* private mode */ }
  }

  // Fold a finished round into the running record.
  function recordRound(stats, tierKey, results) {
    var total = 0;
    results.forEach(function (r) {
      total += r.points;
      stats.taps++;
      if (r.perfect) stats.perfects++;

      var reg = r.location.r;
      if (!stats.byRegion[reg]) stats.byRegion[reg] = { n: 0, sum: 0 };
      stats.byRegion[reg].n++;
      stats.byRegion[reg].sum += r.unit;

      if (r.unit < 60) {
        stats.misses = stats.misses.filter(function (m) { return m.name !== r.location.n; });
        stats.misses.push({ name: r.location.n, unit: r.unit, ts: Date.now() });
      } else {
        // Redeemed it — stop putting it in weak-spot rounds.
        stats.misses = stats.misses.filter(function (m) { return m.name !== r.location.n; });
      }
      stats.recent.push(r.location.n);
    });

    if (stats.misses.length > MAX_MISSES) stats.misses = stats.misses.slice(-MAX_MISSES);
    if (stats.recent.length > RECENT_MEMORY) stats.recent = stats.recent.slice(-RECENT_MEMORY);

    stats.played++;
    stats.totalScore += total;
    if (total > stats.best) stats.best = total;
    stats.rounds.push({ score: total, tier: tierKey, ts: Date.now() });
    if (stats.rounds.length > MAX_HISTORY) stats.rounds = stats.rounds.slice(-MAX_HISTORY);
    return total;
  }

  function averageScore(stats) {
    return stats.played ? Math.round(stats.totalScore / stats.played) : 0;
  }

  function regionAccuracy(stats) {
    var out = [];
    for (var r in stats.byRegion) {
      var e = stats.byRegion[r];
      if (e.n) out.push({ region: r, n: e.n, avg: Math.round(e.sum / e.n) });
    }
    out.sort(function (a, b) { return b.avg - a.avg; });
    return out;
  }

  /* ---------------------------------------------------------------- sharing */

  function formatKm(km) {
    if (km < 1) return Math.round(km * 1000) + ' m';
    if (km < 100) return km.toFixed(1) + ' km';
    return Math.round(km).toLocaleString('en-US') + ' km';
  }

  // Five blocks per question, filled in proportion to the unit score.
  function bar(unit) {
    var filled = Math.round(unit / 20);
    return new Array(filled + 1).join('▰') + new Array(6 - filled).join('▱');
  }

  function summaryText(tierKey, results, total) {
    var tier = TIERS[tierKey];
    var lines = ['MapTap Endless — ' + (tier ? tier.name : tierKey) + ' — ' + total + '/' + maxScore()];
    results.forEach(function (r, i) {
      lines.push(bar(r.unit) + '  ' + r.location.n + ' · ' + formatKm(r.km) +
        ' · ' + r.unit + (r.multiplier > 1 ? '×' + r.multiplier : '') +
        (r.perfect ? ' · PERFECT' : ''));
    });
    return lines.join('\n');
  }

  var API = {
    MULTIPLIERS: MULTIPLIERS,
    PERFECT_KM: PERFECT_KM,
    DECAY_KM: DECAY_KM,
    COUNTRY_BONUS: COUNTRY_BONUS,
    ISLAND_BONUS_KM: ISLAND_BONUS_KM,
    MIN_SEPARATION_KM: MIN_SEPARATION_KM,
    TIERS: TIERS,
    TIER_ORDER: TIER_ORDER,
    STORE_KEY: STORE_KEY,
    distanceScore: distanceScore,
    scoreGuess: scoreGuess,
    answerCountries: answerCountries,
    maxScore: maxScore,
    makeRng: makeRng,
    buildRound: buildRound,
    buildWeakSpotRound: buildWeakSpotRound,
    weakSpotReady: weakSpotReady,
    blankStats: blankStats,
    loadStats: loadStats,
    saveStats: saveStats,
    recordRound: recordRound,
    averageScore: averageScore,
    regionAccuracy: regionAccuracy,
    formatKm: formatKm,
    bar: bar,
    summaryText: summaryText
  };

  root.Game = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
