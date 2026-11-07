/* GILT math harness — proves the odds are what the signs say they are.
   node test/math.js */
'use strict';
const path = require('path');
const Engine = require(path.join(__dirname, '..', 'js', 'engine.js'));
const G = require(path.join(__dirname, '..', 'js', 'games.js'));

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg); }
}
function approx(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ' (got ' + a.toFixed(5) + ', want ' + b + ' ±' + tol + ')'); }
function section(name) { console.log('— ' + name); }

const rng = Engine.mulberry32(0xC0FFEE);

// ---------- engine ----------
section('engine: clock, money, night');
ok(Engine.clockLabel(0) === '9:00 PM', 'clock at 0');
ok(Engine.clockLabel(180) === '12:00 AM', 'clock at midnight');
ok(Engine.clockLabel(539) === '5:59 AM', 'clock at 5:59');
ok(Engine.clockLabel(540) === '6:00 AM', 'clock at dawn');
ok(Engine.dawnAmount(400) === 0, 'no dawn at 3:40 AM');
ok(Engine.dawnAmount(540) === 1, 'full dawn at 6');
ok(Engine.dollars(12000) === '$12,000', 'dollar format');
ok(Engine.dollars(-350) === '-$350', 'negative dollars');
{
  const n = Engine.newNight(1);
  ok(n.cash === 500 && n.debt === 12000, 'opening stake and the number');
  Engine.takeMarker(n);
  ok(n.cash === 1500 && n.debt === 13300, 'marker adds juice to the number');
  Engine.takeMarker(n);
  ok(!Engine.takeMarker(n), 'Sal only writes two');
  n.cash = 0;
  ok(Engine.checkBust(n) && n.ending === 'bust', 'broke and out of paper is bust');
  const m = Engine.newNight(2);
  m.t = 540; m.cash = 30000; Engine.settleNight(m);
  ok(m.ending === 'gilt', 'double the number is the gilt ending');
  const m2 = Engine.newNight(3); m2.cash = 12000; Engine.settleNight(m2);
  ok(m2.ending === 'paid', 'paid in full');
  const m3 = Engine.newNight(4); m3.cash = 6000; Engine.settleNight(m3);
  ok(m3.ending === 'half', 'half buys a month');
  const m4 = Engine.newNight(5); m4.cash = 900; Engine.settleNight(m4);
  ok(m4.ending === 'scraps', 'scraps at dawn');
}
{
  // heat: flat bets never draw Cole; spreading with the count does
  const n = Engine.newNight(6);
  let tripped = false;
  for (let i = 0; i < 30; i++) tripped = Engine.noteBlackjackBet(n, 25, 3) || tripped;
  ok(!tripped, 'flat betting stays cool');
  for (let i = 0; i < 10; i++) Engine.noteBlackjackBet(n, 25, 0);
  for (let i = 0; i < 12; i++) tripped = Engine.noteBlackjackBet(n, 400, 4) || tripped;
  ok(tripped, 'an 16x spread on a hot count gets the tap');
  ok(!Engine.blackjackOpen(n), 'table cools after the tap');
  n.t += 46;
  ok(Engine.blackjackOpen(n), 'and reopens later');
}
{
  // save round trip
  const store = (() => { let m = {}; return { getItem: k => m[k] || null, setItem: (k, v) => { m[k] = v; } }; })();
  const s = Engine.loadSave(store);
  ok(Engine.learn(s, 'wheel'), 'learning writes the notebook');
  ok(!Engine.learn(s, 'wheel'), 'no duplicate pages');
  const n = Engine.newNight(7); n.cash = 25000; n.t = 540; Engine.settleNight(n);
  Engine.absorbNight(s, n);
  Engine.writeSave(store, s);
  const s2 = Engine.loadSave(store);
  ok(s2.notebook.wheel && s2.nights === 1 && s2.bestEnding === 'gilt' && s2.highroller, 'save survives the round trip');
}

// ---------- blackjack ----------
section('blackjack: rules');
const BJ = G.Blackjack;
ok(BJ.value([{ r: 14 }, { r: 14 }]).total === 12, 'A,A is twelve');
ok(BJ.value([{ r: 14 }, { r: 7 }]).total === 18 && BJ.value([{ r: 14 }, { r: 7 }]).soft, 'A,7 is soft 18');
ok(BJ.value([{ r: 14 }, { r: 7 }, { r: 10 }]).total === 18, 'A,7,T is hard 18');
ok(BJ.value([{ r: 10 }, { r: 13 }]).total === 20, 'T,K is twenty');
ok(BJ.isBlackjack([{ r: 14 }, { r: 13 }]), 'A,K is blackjack');
ok(!BJ.isBlackjack([{ r: 14 }, { r: 7 }, { r: 3 }]), 'three-card 21 is not blackjack');
{
  // split aces: one card each, no more
  const shoe = BJ.newShoe(Engine.mulberry32(42));
  // stack the top of the shoe: player A,A then dealer up/hole, then two draw cards
  shoe.cards.push({ r: 9, s: 0 }, { r: 5, s: 1 }, { r: 6, s: 2 }, { r: 10, s: 0 }, { r: 14, s: 1 }, { r: 14, s: 0 });
  // pops from the end: player gets A,A? order: draw p1, p2, up, hole
  // pushed [9,5,6,10,A,A] -> pops A, A, 10, 6, then 5/9 as split cards
  const round = BJ.start(shoe, 100);
  ok(round.hands[0].cards[0].r === 14 && round.hands[0].cards[1].r === 14, 'stacked aces arrive');
  ok(BJ.actions(round).indexOf('split') >= 0, 'aces can split');
  BJ.act(round, shoe, 'split');
  ok(round.hands.length === 2, 'two hands after the split');
  ok(round.hands[0].cards.length === 2 && round.hands[1].cards.length === 2, 'one card each on split aces');
  ok(round.phase === 'dealer', 'split aces play themselves');
}
{
  // dealer stands on soft 17
  const shoe = BJ.newShoe(Engine.mulberry32(7));
  shoe.cards.push({ r: 6, s: 0 }, { r: 14, s: 1 }, { r: 10, s: 2 }, { r: 9, s: 3 });
  // pops: p1=9, p2=10 (player 19), up=A, hole=6 -> dealer soft 17, must stand
  const round = BJ.start(shoe, 50);
  BJ.act(round, shoe, 'stand');
  const fin = BJ.finish(round, shoe);
  ok(fin.dealer.length === 2, 'dealer stands on soft 17');
  ok(fin.results[0] === 'win' && fin.returned === 100, 'nineteen beats soft seventeen');
}

section('blackjack: monte carlo, basic strategy + the count');
{
  const mcrng = Engine.mulberry32(1234);
  let staked = 0, returned = 0, rounds = 0;
  const byTC = {}; // bucket -> {net, n} measured per initial bet
  let shoe = BJ.newShoe(mcrng);
  const N = 400000;
  for (let i = 0; i < N; i++) {
    if (BJ.needsShuffle(shoe)) shoe = BJ.newShoe(mcrng);
    const tc = Math.max(-6, Math.min(6, Math.round(BJ.trueCount(shoe))));
    const round = BJ.start(shoe, 1);
    while (round.phase === 'player') {
      const acts = BJ.actions(round);
      const h = round.hands[round.active];
      const a = BJ.basicAction(h, round.up, {
        canDouble: acts.indexOf('double') >= 0,
        canSplit: acts.indexOf('split') >= 0
      });
      BJ.act(round, shoe, acts.indexOf(a) >= 0 ? a : (a === 'double' ? 'hit' : 'stand'));
    }
    const st = BJ.totalStaked(round);
    const fin = BJ.finish(round, shoe);
    staked += st; returned += fin.returned; rounds++;
    const b = byTC[tc] || (byTC[tc] = { net: 0, n: 0 });
    b.net += fin.returned - st; b.n++;
  }
  const rtp = returned / staked;
  console.log('  blackjack basic-strategy RTP: ' + (rtp * 100).toFixed(2) + '% over ' + rounds + ' rounds');
  ok(rtp > 0.985 && rtp < 1.0, 'basic strategy loses about half a percent, no more');
  let hotNet = 0, hotN = 0, coldNet = 0, coldN = 0;
  for (const k in byTC) {
    const tc = +k;
    if (tc >= 3) { hotNet += byTC[k].net; hotN += byTC[k].n; }
    if (tc <= -1) { coldNet += byTC[k].net; coldN += byTC[k].n; }
  }
  const hotEV = hotNet / hotN, coldEV = coldNet / coldN;
  console.log('  EV per unit at TC>=+3: ' + (hotEV * 100).toFixed(2) + '% (' + hotN + ' hands); at TC<=-1: ' + (coldEV * 100).toFixed(2) + '%');
  ok(hotN > 5000, 'hot counts actually occur');
  ok(hotEV > 0, 'the count is real: rich shoes pay the player');
  ok(hotEV > coldEV + 0.005, 'rich shoes beat poor shoes clearly');
}

// ---------- roulette ----------
section('roulette');
const R = G.Roulette;
ok(R.WHEEL_ORDER.length === 38, 'thirty-eight pockets');
ok(new Set(R.WHEEL_ORDER).size === 38, 'no pocket twice');
ok(R.color('0') === 'green' && R.color('00') === 'green', 'greens');
ok(R.color('17') === 'black' && R.color('32') === 'red', 'wheel colors match the felt');
{
  // exact EV per bet type by enumerating every pocket, fair wheel
  const evOf = bet => {
    let ret = 0;
    for (const p of R.WHEEL_ORDER) ret += R.payout(Object.assign({ amt: 1 }, bet), p);
    return ret / 38 - 1;
  };
  approx(evOf({ type: 'straight', sel: '17' }), -2 / 38, 1e-9, 'straight-up edge');
  approx(evOf({ type: 'red' }), -2 / 38, 1e-9, 'red edge');
  approx(evOf({ type: 'dozen', sel: 1 }), -2 / 38, 1e-9, 'dozen edge');
  approx(evOf({ type: 'column', sel: 2 }), -2 / 38, 1e-9, 'column edge');
  approx(evOf({ type: 'split', sel: ['17', '20'] }), -2 / 38, 1e-9, 'split edge');
  approx(evOf({ type: 'street', sel: 4 }), -2 / 38, 1e-9, 'street edge');
  approx(evOf({ type: 'corner', sel: ['16', '17', '19', '20'] }), -2 / 38, 1e-9, 'corner edge');
  approx(evOf({ type: 'six', sel: 3 }), -2 / 38, 1e-9, 'six-line edge');
  approx(evOf({ type: 'five' }), -3 / 38, 1e-9, 'the five-number bet is the worst on the felt');
  approx(evOf({ type: 'high' }), -2 / 38, 1e-9, 'high edge');
}
{
  // the worn pocket: detectable at scale, pays at the table
  const brng = Engine.mulberry32(555);
  const N = 200000;
  let hits26 = 0, other = 0;
  for (let i = 0; i < N; i++) {
    const p = R.spin(brng, true);
    if (p === '26') hits26++; else other++;
  }
  const p26 = hits26 / N;
  const fair = 1 / 38;
  console.log('  biased wheel: pocket 26 at ' + (p26 * 100).toFixed(3) + '% vs fair ' + (fair * 100).toFixed(3) + '%');
  const expect = R.BIAS_WEIGHT / (37 + R.BIAS_WEIGHT);
  approx(p26, expect, 0.0012, 'bias lands where it was built');
  const ev26 = 36 * p26 - 1;
  console.log('  straight-up on 26: EV ' + (ev26 * 100).toFixed(2) + '%');
  ok(ev26 > 0.01, 'the worn pocket beats the house');
  // z-score of the deviation: the harness can see it; a patron watching one night cannot
  const z = (hits26 - N * fair) / Math.sqrt(N * fair * (1 - fair));
  ok(z > 5, 'bias unmistakable at 200k spins (z=' + z.toFixed(1) + ')');
}

// ---------- craps ----------
section('craps');
const CR = G.Craps;
{
  const crng = Engine.mulberry32(99);
  // pass line
  let staked = 0, ret = 0;
  for (let i = 0; i < 300000; i++) {
    const tab = CR.newTable();
    tab.bets.pass = 1; staked += 1;
    while (tab.bets.pass > 0) {
      const r = CR.resolve(tab, CR.roll(crng));
      ret += r.returned;
      if (tab.phase === 'comeout' && tab.bets.pass > 0 && r.events.some(e => e === 'sevenout' || e === 'pointmade')) break;
    }
  }
  const ev = ret / staked - 1;
  console.log('  pass line EV: ' + (ev * 100).toFixed(2) + '%');
  approx(ev, -0.01414, 0.006, 'pass line pays 251 to 244 against');
}
{
  // pass + full 3-4-5 odds: the odds themselves carry no edge
  const crng = Engine.mulberry32(101);
  let oddsStaked = 0, oddsRet = 0;
  for (let i = 0; i < 300000; i++) {
    const tab = CR.newTable();
    tab.bets.pass = 1;
    let r = CR.resolve(tab, CR.roll(crng));
    if (tab.phase !== 'point') continue; // decided on the comeout, no odds possible
    const odds = CR.maxOdds(tab.point, 1);
    tab.bets.odds = odds; oddsStaked += odds;
    const point = tab.point;
    while (tab.phase === 'point') {
      r = CR.resolve(tab, CR.roll(crng));
      for (const e of r.events) {
        if (e === 'oddswin') oddsRet += odds + CR.oddsPays(point, odds);
        // oddslose returns nothing
      }
    }
  }
  const oddsEV = oddsRet / oddsStaked - 1;
  console.log('  free odds EV: ' + (oddsEV * 100).toFixed(2) + '%');
  approx(oddsEV, 0, 0.008, 'free odds are exactly free');
}
{
  // field, place six, hard six — resolved-bet EVs
  const crng = Engine.mulberry32(103);
  let fieldRet = 0, fieldN = 200000;
  for (let i = 0; i < fieldN; i++) {
    const tab = CR.newTable();
    tab.bets.field = 1;
    fieldRet += CR.resolve(tab, CR.roll(crng)).returned;
  }
  approx(fieldRet / fieldN - 1, -1 / 36, 0.006, 'field with 2x/3x on the ends');
  let p6Net = 0, p6N = 0;
  for (let i = 0; i < 150000; i++) {
    const tab = CR.newTable();
    tab.phase = 'point'; tab.point = 4;
    tab.bets.place6 = 6;
    while (true) {
      const r = CR.resolve(tab, CR.roll(crng));
      if (r.events.indexOf('place6win') >= 0) { p6Net += 7; p6N++; break; }
      if (r.events.indexOf('place6lose') >= 0) { p6Net -= 6; p6N++; break; }
    }
  }
  approx(p6Net / (p6N * 6), -1 / 66, 0.006, 'place six keeps a buck-fifty of a hundred');
  let h6Net = 0, h6N = 0;
  for (let i = 0; i < 150000; i++) {
    const tab = CR.newTable();
    tab.phase = 'point'; tab.point = 4;
    tab.bets.hard6 = 1;
    while (tab.bets.hard6 > 0) {
      const r = CR.resolve(tab, CR.roll(crng));
      if (r.events.indexOf('hardwin6') >= 0) { h6Net += 9; h6N++; }
      else if (r.events.indexOf('hardlose6') >= 0) { h6Net -= 1; h6N++; }
    }
  }
  approx(h6Net / h6N, -1 / 11, 0.01, 'hard six is a sucker bet and pays like one');
}
{
  // dice are dice
  const crng = Engine.mulberry32(107);
  const counts = new Array(13).fill(0);
  const N = 360000;
  for (let i = 0; i < N; i++) counts[CR.roll(crng).reduce((a, b) => a + b)]++;
  approx(counts[7] / N, 6 / 36, 0.004, 'seven is the center of the world');
  approx(counts[2] / N, 1 / 36, 0.002, 'snake eyes at one in thirty-six');
}

// ---------- slots ----------
section('slots');
const SL = G.Slots;
{
  for (const m of ['pete', 'kate', 'motherlode']) {
    const { rtp, pJack } = SL.exactRTP(m, null);
    console.log('  ' + m + ' base RTP (exact): ' + (rtp * 100).toFixed(2) + '%' + (pJack ? ', jackpot odds 1 in ' + Math.round(1 / pJack) : ''));
  }
  const pete = SL.exactRTP('pete', null);
  ok(pete.rtp > 0.86 && pete.rtp < 0.96, 'Pete pays around ninety cents');
  const kate = SL.exactRTP('kate', null);
  ok(kate.rtp > 0.86 && kate.rtp < 0.96, 'Kate too');
  const ml0 = SL.exactRTP('motherlode', SL.PROGRESSIVE_RESET);
  console.log('  motherlode at reset meter: ' + (ml0.rtp * 100).toFixed(2) + '%');
  ok(ml0.rtp > 0.80 && ml0.rtp < 0.97, 'the Motherlode opens stingy');
  // where the math flips
  const m = SL.MACHINES.motherlode;
  const base = SL.exactRTP('motherlode', null);
  const breakeven = (1 - base.rtp) * m.bet / base.pJack;
  console.log('  motherlode break-even meter: $' + breakeven.toFixed(0));
  ok(breakeven > 3000 && breakeven < 8000, 'the flip point is findable during one long night');
  const hot = SL.exactRTP('motherlode', breakeven + 500);
  ok(hot.rtp > 1.0, 'past the line, the only fair bet in the building');
  // monte carlo agrees with the enumeration
  const srng = Engine.mulberry32(2024);
  let net = 0; const N = 400000;
  for (let i = 0; i < N; i++) net += SL.spin('pete', srng).mult;
  approx(net / N, pete.rtp, 0.01, 'spinning matches the arithmetic');
}

// ---------- video poker ----------
section('video poker');
const VP = G.VideoPoker;
{
  const c = (r, s) => ({ r, s });
  ok(VP.classify([c(10, 0), c(11, 0), c(12, 0), c(13, 0), c(14, 0)]) === 'royal', 'royal flush');
  ok(VP.classify([c(5, 1), c(6, 1), c(7, 1), c(8, 1), c(9, 1)]) === 'sf', 'straight flush');
  ok(VP.classify([c(14, 0), c(2, 0), c(3, 0), c(4, 0), c(5, 0)]) === 'sf', 'the wheel, suited');
  ok(VP.classify([c(9, 0), c(9, 1), c(9, 2), c(9, 3), c(2, 0)]) === 'quads', 'four nines');
  ok(VP.classify([c(9, 0), c(9, 1), c(9, 2), c(4, 3), c(4, 0)]) === 'full', 'nines full');
  ok(VP.classify([c(2, 2), c(5, 2), c(9, 2), c(11, 2), c(13, 2)]) === 'flush', 'flush');
  ok(VP.classify([c(7, 0), c(8, 1), c(9, 2), c(10, 3), c(11, 0)]) === 'straight', 'straight');
  ok(VP.classify([c(14, 0), c(2, 1), c(3, 2), c(4, 3), c(5, 0)]) === 'straight', 'the wheel, offsuit');
  ok(VP.classify([c(6, 0), c(6, 1), c(6, 2), c(9, 3), c(13, 0)]) === 'trips', 'trips');
  ok(VP.classify([c(6, 0), c(6, 1), c(9, 2), c(9, 3), c(13, 0)]) === 'twopair', 'two pair');
  ok(VP.classify([c(11, 0), c(11, 1), c(4, 2), c(7, 3), c(2, 0)]) === 'jacks', 'jacks or better');
  ok(VP.classify([c(10, 0), c(10, 1), c(4, 2), c(7, 3), c(2, 0)]) === 'nothing', 'tens pay nothing');
  const vrng = Engine.mulberry32(31);
  let net = { good: 0, bad: 0 };
  const N = 250000;
  // same hands through both machines — the paytable is the only difference
  for (let i = 0; i < N; i++) {
    const st = VP.deal(vrng);
    const holds = VP.strategyHolds(st.hand);
    VP.drawReplace(st, holds);
    const cls = VP.classify(st.hand);
    net.good += VP.payout(cls, 'good', 1);
    net.bad += VP.payout(cls, 'bad', 1);
  }
  const rtpGood = net.good / N, rtpBad = net.bad / N;
  console.log('  9/6 machine RTP: ' + (rtpGood * 100).toFixed(2) + '%, 8/5 machine: ' + (rtpBad * 100).toFixed(2) + '%');
  ok(rtpGood > 0.982 && rtpGood < 1.0, 'the good machine, played sensibly, nearly breaks even');
  ok(rtpGood - rtpBad > 0.015, 'reading the glass is worth two full points');
}

// ---------- baccarat ----------
section('baccarat');
const BA = G.Baccarat;
{
  const brng = Engine.mulberry32(88);
  let shoe = BA.newShoe(brng);
  const N = 400000;
  let pw = 0, bw = 0, tie = 0;
  for (let i = 0; i < N; i++) {
    if (BA.needsShuffle(shoe)) shoe = BA.newShoe(brng);
    const h = BA.playHand(shoe);
    if (h.outcome === 'player') pw++; else if (h.outcome === 'banker') bw++; else tie++;
  }
  approx(bw / N, 0.4586, 0.004, 'banker share of the tableau');
  approx(pw / N, 0.4462, 0.004, 'player share');
  approx(tie / N, 0.0952, 0.003, 'tie share');
  const evBanker = (bw * 1.95 + tie * 1) / N - 1;
  const evPlayer = (pw * 2 + tie * 1) / N - 1;
  const evTie = (tie * 9) / N - 1;
  console.log('  EVs — banker: ' + (evBanker * 100).toFixed(2) + '%, player: ' + (evPlayer * 100).toFixed(2) + '%, tie: ' + (evTie * 100).toFixed(2) + '%');
  ok(evBanker > -0.02 && evBanker < 0, 'banker keeps its famous point-and-change');
  ok(evPlayer > -0.022 && evPlayer < 0, 'player a touch worse');
  ok(evTie < -0.10, 'the tie is for tourists');
}

// ---------- three-card ----------
section('three-card poker');
const TC = G.ThreeCard;
{
  const c = (r, s) => ({ r, s });
  ok(TC.rank([c(14, 0), c(13, 0), c(12, 0)]).cls === 5, 'ace-high straight flush');
  ok(TC.rank([c(14, 0), c(2, 1), c(3, 2)]).cls === 3, 'ace plays low in A-2-3');
  ok(TC.compare([c(6, 0), c(7, 1), c(8, 2)], [c(2, 0), c(9, 0), c(13, 0)]) > 0, 'a straight outranks a flush here');
  ok(TC.compare([c(2, 0), c(2, 1), c(2, 2)], [c(14, 0), c(13, 0), c(12, 1)]) > 0, 'trip deuces beat the big slick');
  ok(TC.dealerQualifies([c(12, 0), c(5, 1), c(8, 2)]), 'queen high opens');
  ok(!TC.dealerQualifies([c(11, 0), c(5, 1), c(8, 2)]), 'jack high does not');
  // Q-6-4 monte carlo
  const trng = Engine.mulberry32(64);
  let anteNet = 0, anteStaked = 0, ppNet = 0, ppN = 200000;
  const q64 = h => {
    const r = TC.rank(h);
    if (r.cls > 0) return true;
    const rs = h.map(x => x.r).sort((a, b) => b - a);
    return rs[0] > 12 || (rs[0] === 12 && (rs[1] > 6 || (rs[1] === 6 && rs[2] >= 4)));
  };
  for (let i = 0; i < ppN; i++) {
    const deck = trng.shuffle(G.makeDeck());
    const ph = deck.slice(0, 3), dh = deck.slice(3, 6);
    const play = q64(ph);
    const res = TC.settle(ph, dh, 1, play, 0);
    anteStaked += play ? 2 : 1;
    anteNet += res.returned - (play ? 2 : 1);
    const res2 = TC.settle(ph, dh, 0, false, 1);
    ppNet += res2.returned - 1;
  }
  const anteEdge = anteNet / ppN; // per ante, the standard quote
  console.log('  ante+play edge per ante: ' + (anteEdge * 100).toFixed(2) + '%, pair plus: ' + (ppNet / ppN * 100).toFixed(2) + '%');
  ok(anteEdge > -0.045 && anteEdge < -0.02, 'ante game near the book number');
  ok(ppNet / ppN > -0.10 && ppNet / ppN < -0.04, 'pair plus keeps its seven points');
}

// ---------- hi-lo ----------
section('hi-lo');
const HL = G.HiLo;
{
  const o = HL.odds(2);
  ok(o.pL === 0 && o.mH === 1.05, 'off a deuce, high is the only call');
  const o8 = HL.odds(8);
  approx(o8.mH, 2.1, 0.01, 'even money card pays 2.1 the fair 2.17');
  const hrng = Engine.mulberry32(77);
  let net = 0; const N = 300000; const STAKE = 100;
  let ties = 0;
  for (let i = 0; i < N; i++) {
    const run = HL.newRun(hrng, STAKE);
    const dir = run.card <= 8 ? 'high' : 'low';
    const r = HL.guess(run, hrng, dir);
    if (r.outcome === 'tie') ties++;
    net += (r.outcome === 'win' ? HL.cashout(run) : 0) - STAKE;
  }
  ok(ties > N / 13 * 0.9 && ties < N / 13 * 1.1, 'ties at one in thirteen, all to the house');
  const ev = net / (N * STAKE);
  console.log('  one-rung EV: ' + (ev * 100).toFixed(2) + '%');
  ok(ev > -0.05 && ev < -0.015, 'Len keeps his three cents');
}

// ---------- keno ----------
section('keno');
const KE = G.Keno;
{
  for (let k = 1; k <= 10; k++) {
    const rtp = KE.exactRTP(k);
    console.log('  pick ' + k + ': exact RTP ' + (rtp * 100).toFixed(2) + '%');
    ok(rtp > 0.62 && rtp < 0.80, 'pick ' + k + ' keeps a fat quarter');
  }
  const krng = Engine.mulberry32(20);
  const drawn = KE.drawBalls(krng);
  ok(drawn.length === 20 && new Set(drawn).size === 20, 'twenty balls, no repeats');
  ok(drawn.every(b => b >= 1 && b <= 80), 'balls in range');
  const res = KE.settle([1, 2, 3, 4, 5], drawn, 1);
  ok(res.hits >= 0 && res.hits <= 5, 'hits counted');
}

// ---------- big six ----------
section('big six');
const B6 = G.BigSix;
{
  const counts = {};
  for (const s of B6.SEGMENTS) counts[s] = (counts[s] || 0) + 1;
  ok(B6.SEGMENTS.length === 54, 'fifty-four pegs');
  ok(counts['1'] === 24 && counts['2'] === 15 && counts['5'] === 7 && counts['10'] === 4 && counts['20'] === 2 && counts['joker'] === 1 && counts['crest'] === 1, 'authentic peg spread');
  let adjacentSame = 0;
  for (let i = 0; i < 54; i++) if (B6.SEGMENTS[i] === B6.SEGMENTS[(i + 1) % 54]) adjacentSame++;
  ok(adjacentSame === 0, 'no two alike side by side');
  const ev = bet => {
    let r = 0;
    for (let i = 0; i < 54; i++) r += B6.settle(bet, 1, i);
    return r / 54 - 1;
  };
  approx(ev('1'), -6 / 54, 1e-9, 'the dollar bet');
  approx(ev('2'), -9 / 54, 1e-9, 'the two');
  approx(ev('5'), -12 / 54, 1e-9, 'the five');
  approx(ev('10'), -10 / 54, 1e-9, 'the ten');
  approx(ev('20'), -12 / 54, 1e-9, 'the twenty');
  approx(ev('joker'), -13 / 54, 1e-9, 'the joker');
}

// ---------- horses ----------
section('the simulcast');
const HO = G.Horses;
{
  const hrng = Engine.mulberry32(404);
  const N = 30000;
  let overround = 0, randomNet = 0, toutNet = 0, honestNet = 0, favNet = 0;
  let toutSpend = 0;
  for (let i = 0; i < N; i++) {
    const race = HO.newRace(hrng);
    overround += race.posted.reduce((a, o) => a + 1 / (1 + o), 0);
    const rand = hrng.int(race.n);
    const tip = HO.tout(race, hrng);
    const edges = race.truePs.map((p, j) => HO.edge(race, j));
    const best = edges.indexOf(Math.max.apply(null, edges));
    const fav = race.posted.indexOf(Math.min.apply(null, race.posted));
    HO.run(race, hrng);
    randomNet += HO.settleWin(race, rand, 1) - 1;
    toutNet += HO.settleWin(race, tip.pick, 1) - 1;
    honestNet += HO.settleWin(race, best, 1) - 1;
    favNet += HO.settleWin(race, fav, 1) - 1;
    toutSpend++;
  }
  console.log('  average overround: ' + (overround / N).toFixed(3));
  console.log('  EV per $1 — random: ' + (randomNet / N * 100).toFixed(1) + '%, favorite: ' + (favNet / N * 100).toFixed(1) + '%, tout pick: ' + (toutNet / N * 100).toFixed(1) + '%, best edge (oracle): ' + (honestNet / N * 100).toFixed(1) + '%');
  ok(overround / N > 1.05 && overround / N < 1.35, 'the board carries the take');
  // the noisy book prices longshots generously sometimes, so blind-random loses less
  // than the takeout — but it still loses, and the chalk player loses worst of all
  ok(randomNet / N < -0.03, 'betting blind still loses');
  ok(favNet / N < -0.12, 'the chalk is priced for tourists');
  ok(toutNet / N > 0.03, 'Fingers is worth his two hundred, most nights');
  ok(honestNet / N > toutNet / N - 0.02, 'the oracle beats the skim');
  // winner frequencies actually follow form
  const race = HO.newRace(hrng);
  const wins = new Array(race.n).fill(0);
  const M = 200000;
  for (let i = 0; i < M; i++) { const rc = { n: race.n, truePs: race.truePs }; HO.run(rc, hrng); wins[rc.winner]++; }
  for (let h = 0; h < race.n; h++) approx(wins[h] / M, race.truePs[h], 0.006, 'horse ' + h + ' wins to form');
}

// ---------- scratchers ----------
section('scratchers');
const SC = G.Scratch;
{
  const rtp = SC.exactRTP();
  console.log('  exact RTP: ' + (rtp * 100).toFixed(2) + '%');
  ok(rtp > 0.55 && rtp < 0.72, 'the cage keeps a third');
  const srng = Engine.mulberry32(66);
  let wins = 0;
  for (let i = 0; i < 60000; i++) {
    const t = SC.buy(srng);
    const counts = {};
    for (const v of t.spots) counts[v] = (counts[v] || 0) + 1;
    const triples = Object.keys(counts).filter(v => counts[v] >= 3);
    if (t.prize > 0) {
      if (!(triples.length === 1 && +triples[0] === t.prize && counts[t.prize] === 3)) { ok(false, 'winning card shows exactly three of the prize'); break; }
      wins++;
    } else if (triples.length !== 0) { ok(false, 'losing card never shows three alike'); break; }
  }
  ok(wins > 60000 * 0.25 && wins < 60000 * 0.36, 'about three tickets in ten pay something');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
