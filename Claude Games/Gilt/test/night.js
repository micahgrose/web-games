/* GILT night sims — three players walk in with $500.
   The bots are probes, not judges: they exist to prove the night's
   machinery holds and that knowledge moves the odds, not to set difficulty.
   node test/night.js */
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', 'js', 'engine.js'));
const G = require(path.join(__dirname, '..', 'js', 'games.js'));

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error('  FAIL: ' + msg); }
}

function invariant(n, tPrev) {
  if (!(isFinite(n.cash) && n.cash >= -1e-6)) return 'cash went bad: ' + n.cash;
  if (!(n.t >= tPrev)) return 'clock ran backward';
  if (!(isFinite(n.progressive) && n.progressive >= 0)) return 'meter went bad';
  return null;
}

// ---------- shared play helpers (engine-level, same calls the scenes make) ----------
function playBlackjackRound(n, rng, shoeBox, bet) {
  if (!shoeBox.shoe || G.Blackjack.needsShuffle(shoeBox.shoe)) shoeBox.shoe = G.Blackjack.newShoe(rng);
  const shoe = shoeBox.shoe;
  bet = Math.min(bet, n.cash, 500);
  if (bet < 10) return null;
  const tc = G.Blackjack.trueCount(shoe);
  const tripped = E.noteBlackjackBet(n, bet, tc);
  let escrow = bet;
  n.cash -= bet;
  const round = G.Blackjack.start(shoe, bet);
  while (round.phase === 'player') {
    const acts = G.Blackjack.actions(round);
    const h = round.hands[round.active];
    let a = G.Blackjack.basicAction(h, round.up, {
      canDouble: acts.indexOf('double') >= 0 && n.cash >= round.bet,
      canSplit: acts.indexOf('split') >= 0 && n.cash >= round.bet
    });
    if ((a === 'double' || a === 'split')) {
      if (n.cash >= round.bet) { n.cash -= round.bet; escrow += round.bet; }
      else a = a === 'double' ? 'hit' : 'stand';
    }
    if (acts.indexOf(a) < 0) a = 'stand';
    G.Blackjack.act(round, shoe, a);
  }
  const fin = G.Blackjack.finish(round, shoe);
  n.cash += fin.returned;
  E.recordBet(n, 'blackjack', escrow, fin.returned);
  E.spendTime(n, 2);
  E.checkBust(n);
  return { net: fin.returned - escrow, tc, tripped };
}

function playRoulette26(n, rng, amt) {
  amt = Math.min(amt, n.cash, 100);
  if (amt < 5) return null;
  n.cash -= amt;
  const pocket = G.Roulette.spin(rng, true);
  const ret = G.Roulette.payout({ type: 'straight', sel: '26', amt }, pocket);
  n.cash += ret;
  E.recordBet(n, 'roulette', amt, ret);
  E.spendTime(n, 4);
  E.checkBust(n);
  return { net: ret - amt };
}

function playKeno(n, rng, amt) {
  amt = Math.min(amt, n.cash, 20);
  if (amt < 1) return null;
  n.cash -= amt;
  const picks = [];
  while (picks.length < 8) {
    const p = 1 + rng.int(80);
    if (picks.indexOf(p) < 0) picks.push(p);
  }
  const drawn = G.Keno.drawBalls(rng);
  const res = G.Keno.settle(picks, drawn, amt);
  n.cash += res.returned;
  E.recordBet(n, 'keno', amt, res.returned);
  E.spendTime(n, 2);
  E.checkBust(n);
  return { net: res.returned - amt };
}

function playBigSix(n, rng, amt) {
  amt = Math.min(amt, n.cash, 100);
  if (amt < 5) return null;
  n.cash -= amt;
  const idx = G.BigSix.spin(rng);
  const ret = G.BigSix.settle('5', amt, idx);
  n.cash += ret;
  E.recordBet(n, 'bigsix', amt, ret);
  E.spendTime(n, 1);
  E.checkBust(n);
  return { net: ret - amt };
}

function playSlots(n, rng, machine) {
  const bet = G.Slots.MACHINES[machine].bet;
  if (n.cash < bet) return null;
  n.cash -= bet;
  const res = G.Slots.spin(machine, rng);
  let ret = 0;
  if (res.jackpot) { ret = Math.floor(n.progressive); n.progressive = G.Slots.PROGRESSIVE_RESET; }
  else ret = res.mult * bet;
  n.cash += ret;
  E.recordBet(n, 'slots', bet, ret);
  E.spendTime(n, 1);
  E.checkBust(n);
  return { net: ret - bet, jackpot: res.jackpot };
}

function playHorseRace(n, rng, useTout, amt) {
  const race = G.Horses.newRace(rng);
  let fee = 0, pick;
  if (useTout && n.cash > amt + G.Horses.TOUT_FEE) {
    fee = G.Horses.TOUT_FEE;
    n.cash -= fee;
    pick = G.Horses.tout(race, rng).pick;
  } else {
    pick = rng.int(race.n);
  }
  amt = Math.min(amt, n.cash, 1000);
  if (amt < 10) { E.spendTime(n, 8); return null; }
  n.cash -= amt;
  G.Horses.run(race, rng);
  const ret = G.Horses.settleWin(race, pick, amt);
  n.cash += ret;
  E.recordBet(n, 'horses', amt + fee, ret);
  E.spendTime(n, 8);
  E.checkBust(n);
  return { net: ret - amt - fee };
}

// ---------- the three policies ----------
function grinderNight(rng) {
  const n = E.newNight(rng.int(1e9));
  const shoeBox = {};
  let tPrev = 0;
  while (!n.over) {
    const err = invariant(n, tPrev); if (err) return { err };
    tPrev = n.t;
    if (n.cash >= n.debt) { E.settleNight(n); break; } // even a grinder walks when it's paid
    if (n.cash < 25 && n.markers < E.MARKER_MAX) E.takeMarker(n);
    const r = playBlackjackRound(n, rng, shoeBox, 25);
    if (!r) { E.settleNight(n); break; }
  }
  return { n };
}

function degenerateNight(rng) {
  const n = E.newNight(rng.int(1e9));
  let tPrev = 0;
  while (!n.over) {
    const err = invariant(n, tPrev); if (err) return { err };
    tPrev = n.t;
    if (n.cash >= n.debt) { E.settleNight(n); break; }
    if (n.cash < 20 && n.markers < E.MARKER_MAX) E.takeMarker(n);
    const roll = rng();
    let r;
    if (roll < 0.4) r = playKeno(n, rng, 20);
    else if (roll < 0.7) r = playBigSix(n, rng, 50);
    else r = playSlots(n, rng, rng() < 0.5 ? 'pete' : 'kate');
    if (!r) { E.settleNight(n); break; }
  }
  return { n };
}

// The edge player plays BOLD: the target is $12k by dawn, not log growth.
// Signs both markers up front for ammunition, bootstraps on the worn pocket
// and the count, leans hard on tipped overlays once the roll can carry the
// fee, plays the meter when it's past the flip — and WALKS the moment it's paid.
function edgeNight(rng) {
  const n = E.newNight(rng.int(1e9));
  E.takeMarker(n); E.takeMarker(n); // ammunition; the juice is the price of a real shot
  const shoeBox = {};
  let tPrev = 0;
  while (!n.over) {
    const err = invariant(n, tPrev); if (err) return { err };
    tPrev = n.t;
    if (n.cash >= n.debt) { E.settleNight(n); break; } // paid is paid — the door
    if (n.cash < 10) { E.settleNight(n); break; }
    // the meter first: past the flip point it's the best bet in the building
    if (n.progressive > 4200 && n.cash > 60) {
      playSlots(n, rng, 'motherlode');
      continue;
    }
    // tipped overlays once the roll can carry Fingers' fee: the big vehicle
    if (n.cash > 1200) {
      playHorseRace(n, rng, true, Math.min(1500, Math.floor(n.cash * 0.42)));
      continue;
    }
    // bootstrap: the worn pocket is the cheapest 35-to-1 in the building
    if (rng() < 0.55) {
      playRoulette26(n, rng, Math.max(15, Math.min(100, Math.floor(n.cash * 0.05))));
      continue;
    }
    // otherwise: the count — stretched hard; a talk with Cole costs 45 minutes, not the night
    if (E.blackjackOpen(n)) {
      const shoe = shoeBox.shoe;
      const tc = shoe ? G.Blackjack.trueCount(shoe) : 0;
      let bet = 25;
      if (tc >= 3) bet = Math.max(150, Math.floor(n.cash * 0.25));
      else if (tc >= 2) bet = Math.max(75, Math.floor(n.cash * 0.1));
      playBlackjackRound(n, rng, shoeBox, Math.min(bet, 500));
    } else {
      // Cole cooled the table; kill time at the craps odds
      const amt = Math.min(25, n.cash);
      n.cash -= amt;
      const tab = G.Craps.newTable();
      tab.bets.pass = amt;
      let ret = 0;
      while (tab.bets.pass > 0 && !n.over) {
        const res = G.Craps.resolve(tab, G.Craps.roll(rng));
        ret += res.returned;
        if (tab.bets.pass === 0) break;
        if (tab.phase === 'point' && tab.bets.odds === 0 && n.cash >= amt) {
          const o = Math.min(G.Craps.maxOdds(tab.point, amt), n.cash);
          n.cash -= o; tab.bets.odds = o;
        }
      }
      n.cash += ret;
      E.recordBet(n, 'craps', amt, ret);
      E.spendTime(n, 3);
      E.checkBust(n);
    }
  }
  return { n };
}

// ---------- run them ----------
function runPolicy(name, fn, nights, seed) {
  const rng = E.mulberry32(seed);
  const endings = { bust: 0, scraps: 0, half: 0, paid: 0, gilt: 0 };
  let errs = 0, totalRounds = 0, backoffs = 0, peakSum = 0;
  for (let i = 0; i < nights; i++) {
    const res = fn(rng);
    if (res.err) { errs++; if (errs === 1) console.error('  INVARIANT: ' + res.err); continue; }
    const n = res.n;
    if (!n.over || !n.ending) { errs++; continue; }
    endings[n.ending]++;
    totalRounds += n.stats.rounds;
    backoffs += n.backedOff;
  }
  const winRate = (endings.paid + endings.gilt) / nights;
  console.log('  ' + name + ': ' + JSON.stringify(endings) +
    ' | win ' + (winRate * 100).toFixed(1) + '% | avg rounds ' + (totalRounds / nights).toFixed(0) +
    (backoffs ? ' | backoffs ' + (backoffs / nights).toFixed(2) + '/night' : ''));
  return { endings, winRate, errs, avgRounds: totalRounds / nights, backoffs: backoffs / nights };
}

console.log('— the three players, 400 nights each');
const gr = runPolicy('grinder   ', grinderNight, 400, 111);
const de = runPolicy('degenerate', degenerateNight, 400, 222);
const ed = runPolicy('edge      ', edgeNight, 400, 333);

ok(gr.errs === 0 && de.errs === 0 && ed.errs === 0, 'no invariant violations in 1200 nights');
ok(gr.winRate <= 0.02, 'flat-betting the minimum cannot pay Sal (' + (gr.winRate * 100).toFixed(1) + '%)');
ok(de.winRate <= 0.05, 'the fast trash does not pay Sal either');
ok(ed.winRate >= 0.08 && ed.winRate <= 0.45, 'knowledge gives a real shot (' + (ed.winRate * 100).toFixed(1) + '%)');
ok(ed.winRate > gr.winRate + 0.06 && ed.winRate > de.winRate + 0.06, 'the edges are worth materially more than grinding');
ok(de.endings.bust > gr.endings.bust, 'the trash busts more than the grind');
{
  const all = ['bust', 'scraps', 'half', 'paid', 'gilt'];
  const seen = all.filter(e => gr.endings[e] + de.endings[e] + ed.endings[e] > 0);
  ok(seen.length === 5, 'every ending is reachable (saw: ' + seen.join(', ') + ')');
}
ok(ed.backoffs > 0.02, 'Cole exists: spreading draws attention sometimes');
ok(gr.avgRounds > 150, 'a night of blackjack is a few hundred hands');

// clock sanity: nothing plays past dawn
{
  const rng = E.mulberry32(444);
  let bad = 0;
  for (let i = 0; i < 50; i++) {
    const res = edgeNight(rng);
    if (res.n && res.n.t > E.NIGHT_MINUTES) bad++;
  }
  ok(bad === 0, 'dawn is dawn — nobody plays past 6');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
