/* GILT — engine: rng, clock, bankroll, night state, notebook, persistence.
   Everything in here is DOM-free so the node harness can drive it raw. */
(function (root) {
  'use strict';

  // ---------- rng ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.fork = function () { return mulberry32((f() * 4294967296) >>> 0); };
    f.int = function (n) { return Math.floor(f() * n); };
    f.pick = function (arr) { return arr[f.int(arr.length)]; };
    f.shuffle = function (arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = f.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    // weighted index pick: weights = [w0, w1, ...]
    f.weighted = function (weights) {
      let total = 0;
      for (let i = 0; i < weights.length; i++) total += weights[i];
      let r = f() * total;
      for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
      return weights.length - 1;
    };
    return f;
  }

  // Non-repeating line pool: hands back every entry once before any repeats.
  function LinePool(rng) {
    const bags = new Map();
    return {
      draw(key, lines) {
        if (!lines || !lines.length) return '';
        let bag = bags.get(key);
        if (!bag || !bag.length || bag.source !== lines) {
          bag = rng.shuffle(lines.map((_, i) => i));
          bag.source = lines;
          bags.set(key, bag);
        }
        return lines[bag.pop()];
      }
    };
  }

  // ---------- clock ----------
  // The night runs 9:00 PM to 6:00 AM = 540 minutes. t is minutes since 9 PM.
  const NIGHT_MINUTES = 540;
  function clockLabel(t) {
    const abs = (21 * 60 + Math.floor(t)) % (24 * 60);
    let h = Math.floor(abs / 60); const m = abs % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + String(m).padStart(2, '0') + ' ' + ampm;
  }
  // 0 before 4 AM, then eases to 1 at 6 AM — drives the palette warming.
  function dawnAmount(t) {
    const start = 7 * 60; // 4:00 AM
    if (t <= start) return 0;
    const x = Math.min(1, (t - start) / (NIGHT_MINUTES - start));
    return x * x * (3 - 2 * x);
  }

  // ---------- money ----------
  function dollars(n) {
    const neg = n < 0; n = Math.abs(Math.round(n));
    let s = String(n);
    let out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    out = s + out;
    return (neg ? '-$' : '$') + out;
  }

  // ---------- night state ----------
  const START_CASH = 500;
  const DEBT = 12000;
  const MARKER_SIZE = 1000;
  const MARKER_JUICE = 0.30;
  const MARKER_MAX = 2;

  function newNight(seed) {
    return {
      seed: seed >>> 0,
      t: 0,                       // minutes since 9 PM
      cash: START_CASH,
      debt: DEBT,
      markers: 0,
      over: false,
      ending: null,               // 'bust' | 'scraps' | 'half' | 'paid' | 'gilt'
      freeplay: false,
      // running stats for the tale at dawn
      stats: { wagered: 0, won: 0, rounds: 0, biggestWin: 0, biggestLoss: 0, games: {} },
      // pit boss attention (blackjack back-off)
      heat: 0, bjLockedUntil: -1, backedOff: 0,
      // the progressive meter (posted on the glass, grows with the floor)
      progressive: 2500,
      // per-night flags (scripted beats fire once)
      flags: {}
    };
  }

  function newFreeplay(seed) {
    const n = newNight(seed);
    n.freeplay = true;
    n.cash = 1000;
    n.debt = 0;
    return n;
  }

  function spendTime(night, minutes) {
    if (night.freeplay) {
      // the clock still turns in free play, but dawn never calls it
      night.t = (night.t + minutes) % NIGHT_MINUTES;
      return;
    }
    night.t = Math.min(NIGHT_MINUTES, night.t + minutes);
    // the floor feeds the progressive while you play (~$170/hr) plus a little drift
    night.progressive += minutes * 2.8;
    if (night.t >= NIGHT_MINUTES) settleNight(night);
  }

  function recordBet(night, game, staked, returned) {
    const net = returned - staked;
    night.stats.wagered += staked;
    night.stats.won += Math.max(0, net);
    night.stats.rounds++;
    if (net > night.stats.biggestWin) night.stats.biggestWin = net;
    if (net < night.stats.biggestLoss) night.stats.biggestLoss = net;
    const g = night.stats.games[game] || (night.stats.games[game] = { rounds: 0, net: 0 });
    g.rounds++; g.net += net;
  }

  function takeMarker(night) {
    if (night.freeplay) return false;
    if (night.markers >= MARKER_MAX) return false;
    night.markers++;
    night.cash += MARKER_SIZE;
    night.debt += Math.round(MARKER_SIZE * (1 + MARKER_JUICE));
    return true;
  }

  // Broke means broke: no cash, no paper left to sign.
  function checkBust(night) {
    if (night.freeplay || night.over) return false;
    if (night.cash < 1 && night.markers >= MARKER_MAX) {
      night.over = true; night.ending = 'bust';
      return true;
    }
    return false;
  }

  function settleNight(night) {
    if (night.over) return;
    night.over = true;
    const c = night.cash;
    if (c >= night.debt * 2) night.ending = 'gilt';
    else if (c >= night.debt) night.ending = 'paid';
    else if (c >= night.debt * 0.5) night.ending = 'half';
    else night.ending = 'scraps';
  }

  // ---------- pit boss heat (blackjack) ----------
  // Spreading big with the count while winning is what draws Cole over.
  // betHistory: we keep the last 20 bets to know what "your usual" is.
  function noteBlackjackBet(night, bet, trueCount) {
    if (!night._bjBets) night._bjBets = [];
    night._bjBets.push(bet);
    if (night._bjBets.length > 30) night._bjBets.shift();
    // Cole reads the spread off your small bet, the way pit bosses actually do
    const minBet = Math.min.apply(null, night._bjBets);
    if (trueCount >= 2 && bet >= minBet * 6 && night._bjBets.length >= 6) {
      night.heat += (bet / Math.max(1, minBet)) * 0.45;
    } else {
      // attention fades slowly; Cole remembers a big spread for a while
      night.heat = Math.max(0, night.heat - 0.08);
    }
    if (night.heat >= 14 && !night.freeplay) {
      night.heat = 0;
      night.bjLockedUntil = night.t + 45;
      night.backedOff++;
      return true; // Cole steps in
    }
    return false;
  }
  function blackjackOpen(night) { return night.t >= night.bjLockedUntil; }

  // ---------- notebook (knowledge that survives the night) ----------
  // Keys are discovery ids; the copy layer owns what they say.
  const NOTEBOOK_KEYS = [
    'count',        // Herb taught you the running count
    'wheel',        // Vern's four words about pocket 26
    'goodmachine',  // the 9/6 video poker by the door
    'progressive',  // where the math flips on the big jackpot
    'odds',         // free odds at craps carry no edge
    'fingers',      // the tout's number
    'cover',        // spread small when the man's watching
    'keno'          // what keno actually keeps
  ];

  // ---------- persistence ----------
  const SAVE_KEY = 'gilt_save_v1';
  function blankSave() {
    return {
      nights: 0, bestEnding: null, endingsSeen: {},
      notebook: {}, highroller: false,
      lifetime: { wagered: 0, won: 0, rounds: 0 },
      seenIntro: false, visited: {}
    };
  }
  const ENDING_RANK = { bust: 0, scraps: 1, half: 2, paid: 3, gilt: 4 };
  function loadSave(storage) {
    try {
      const raw = storage && storage.getItem(SAVE_KEY);
      if (!raw) return blankSave();
      const s = JSON.parse(raw);
      return Object.assign(blankSave(), s);
    } catch (e) { return blankSave(); }
  }
  function writeSave(storage, save) {
    try { storage && storage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode etc. */ }
  }
  function learn(save, key) {
    if (NOTEBOOK_KEYS.indexOf(key) < 0) return false;
    if (save.notebook[key]) return false;
    save.notebook[key] = Date.now();
    return true;
  }
  function absorbNight(save, night) {
    save.nights++;
    if (night.ending) {
      save.endingsSeen[night.ending] = (save.endingsSeen[night.ending] || 0) + 1;
      if (!save.bestEnding || ENDING_RANK[night.ending] > ENDING_RANK[save.bestEnding]) {
        save.bestEnding = night.ending;
      }
      if (night.ending === 'gilt') save.highroller = true;
    }
    save.lifetime.wagered += night.stats.wagered;
    save.lifetime.won += night.stats.won;
    save.lifetime.rounds += night.stats.rounds;
  }

  const Engine = {
    mulberry32, LinePool,
    NIGHT_MINUTES, clockLabel, dawnAmount, dollars,
    START_CASH, DEBT, MARKER_SIZE, MARKER_JUICE, MARKER_MAX,
    newNight, newFreeplay, spendTime, recordBet, takeMarker, checkBust, settleNight,
    noteBlackjackBet, blackjackOpen,
    NOTEBOOK_KEYS, SAVE_KEY, blankSave, loadSave, writeSave, learn, absorbNight, ENDING_RANK
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  root.GiltEngine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
