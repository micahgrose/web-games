/* GILT — games: all twelve ways to lose money, with the real rules and the real odds.
   Pure logic, no DOM. The harness proves the math; the scenes just draw it. */
(function (root) {
  'use strict';

  // ---------- shared cards ----------
  // rank: 2..14 (11=J 12=Q 13=K 14=A), suit: 0 spades 1 hearts 2 clubs 3 diamonds
  function makeDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
    return d;
  }
  const RANK_CH = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

  // ---------- registry: pace + limits ----------
  const TABLE = {
    blackjack: { pace: 2, min: 10, max: 500 },
    roulette: { pace: 4, min: 5, max: 500, straightMax: 100 },
    craps: { pace: 3, min: 10, max: 500 },
    slots: { pace: 1 },
    vpoker: { pace: 2, bet: 5 },
    baccarat: { pace: 3, min: 25, max: 1000 },
    threecard: { pace: 2, min: 10, max: 200 },
    hilo: { pace: 1, min: 5, max: 200 },
    keno: { pace: 2, min: 1, max: 20 },
    bigsix: { pace: 1, min: 5, max: 100 },
    horses: { pace: 8, min: 10, max: 1500 },
    scratch: { pace: 1, price: 5 }
  };

  // =========================================================
  // 1. BLACKJACK — Ruth's table. 4 decks, S17, 3:2, double any
  // two, split once (aces get one card), no surrender.
  // The shoe is real, so the count is real.
  // =========================================================
  const Blackjack = {
    newShoe(rng, decks) {
      decks = decks || 4;
      const cards = [];
      for (let d = 0; d < decks; d++) cards.push.apply(cards, makeDeck());
      rng.shuffle(cards);
      return { cards, decks, rc: 0, dealt: 0, cut: Math.floor(cards.length * 0.25) }; // reshuffle at 75% penetration
    },
    needsShuffle(shoe) { return shoe.cards.length <= shoe.cut; },
    countTag(card) { return card.r <= 6 ? 1 : (card.r >= 10 ? -1 : 0); },
    draw(shoe, faceUp) {
      const c = shoe.cards.pop();
      shoe.dealt++;
      if (faceUp !== false) shoe.rc += Blackjack.countTag(c);
      return c;
    },
    reveal(shoe, card) { shoe.rc += Blackjack.countTag(card); },
    trueCount(shoe) {
      const decksLeft = Math.max(0.5, shoe.cards.length / 52);
      return shoe.rc / decksLeft;
    },
    value(cards) {
      let total = 0, aces = 0;
      for (const c of cards) {
        if (c.r === 14) { total += 11; aces++; }
        else total += Math.min(10, c.r);
      }
      while (total > 21 && aces > 0) { total -= 10; aces--; }
      return { total, soft: aces > 0 };
    },
    isBlackjack(cards) { return cards.length === 2 && Blackjack.value(cards).total === 21; },
    start(shoe, bet) {
      const p = [Blackjack.draw(shoe), Blackjack.draw(shoe)];
      const up = Blackjack.draw(shoe);
      const hole = Blackjack.draw(shoe, false); // hole card counts when it flips
      const round = {
        hands: [{ cards: p, bet, done: false, busted: false, doubled: false, fromSplit: false }],
        active: 0, up, hole, phase: 'player', bet
      };
      if (Blackjack.isBlackjack(p)) { round.hands[0].done = true; round.phase = 'dealer'; }
      return round;
    },
    actions(round) {
      if (round.phase !== 'player') return [];
      const h = round.hands[round.active];
      const acts = ['hit', 'stand'];
      if (h.cards.length === 2 && !h.fromSplitAces) acts.push('double');
      if (h.cards.length === 2 && !h.fromSplit && round.hands.length === 1 &&
        Math.min(10, h.cards[0].r) === Math.min(10, h.cards[1].r)) acts.push('split');
      return acts;
    },
    _advance(round) {
      const h = round.hands[round.active];
      h.done = true;
      if (round.active + 1 < round.hands.length) {
        round.active++;
        const nh = round.hands[round.active];
        if (nh.fromSplitAces) nh.done = true; // split aces take one card only
        if (nh.done) Blackjack._advance(round);
      } else {
        round.phase = 'dealer';
      }
    },
    act(round, shoe, action) {
      const h = round.hands[round.active];
      if (action === 'hit') {
        h.cards.push(Blackjack.draw(shoe));
        const v = Blackjack.value(h.cards);
        if (v.total >= 21) { h.busted = v.total > 21; Blackjack._advance(round); }
      } else if (action === 'stand') {
        Blackjack._advance(round);
      } else if (action === 'double') {
        h.doubled = true; h.bet *= 2;
        h.cards.push(Blackjack.draw(shoe));
        h.busted = Blackjack.value(h.cards).total > 21;
        Blackjack._advance(round);
      } else if (action === 'split') {
        const aces = h.cards[0].r === 14;
        const c2 = h.cards.pop();
        const h2 = { cards: [c2], bet: round.bet, done: false, busted: false, doubled: false, fromSplit: true, fromSplitAces: aces };
        h.fromSplit = true; h.fromSplitAces = aces;
        round.hands.push(h2);
        h.cards.push(Blackjack.draw(shoe));
        h2.cards.push(Blackjack.draw(shoe));
        if (aces) { h.done = true; Blackjack._advance(round); }
        else if (Blackjack.value(h.cards).total === 21) Blackjack._advance(round);
      }
      return round;
    },
    // Dealer plays out, hands settle. Returns total money back to the player.
    finish(round, shoe) {
      Blackjack.reveal(shoe, round.hole);
      const dealer = [round.up, round.hole];
      const playerBJ = round.hands.length === 1 && !round.hands[0].fromSplit && Blackjack.isBlackjack(round.hands[0].cards);
      const dealerBJ = Blackjack.isBlackjack(dealer);
      const anyLive = round.hands.some(h => !h.busted);
      if (!dealerBJ && anyLive && !playerBJ) {
        while (true) {
          const v = Blackjack.value(dealer);
          if (v.total >= 17) break; // S17: stand on all 17s
          dealer.push(Blackjack.draw(shoe));
        }
      }
      const dv = Blackjack.value(dealer);
      let returned = 0;
      const results = [];
      for (const h of round.hands) {
        const pv = Blackjack.value(h.cards);
        let res;
        if (playerBJ && !h.fromSplit) {
          if (dealerBJ) { res = 'push'; returned += h.bet; }
          else { res = 'blackjack'; returned += h.bet * 2.5; }
        } else if (dealerBJ) {
          res = 'lose';
        } else if (h.busted) {
          res = 'bust';
        } else if (dv.total > 21 || pv.total > dv.total) {
          res = 'win'; returned += h.bet * 2;
        } else if (pv.total === dv.total) {
          res = 'push'; returned += h.bet;
        } else {
          res = 'lose';
        }
        results.push(res);
      }
      round.phase = 'done';
      return { returned, results, dealer, dealerBJ, playerBJ };
    },
    totalStaked(round) { return round.hands.reduce((a, h) => a + h.bet, 0); },
    // S17 basic strategy — the bots use this; Ruth would approve.
    basicAction(hand, up, opts) {
      const canDouble = opts && opts.canDouble, canSplit = opts && opts.canSplit;
      const u = Math.min(10, up.r === 14 ? 11 : up.r); // 11 marks the ace
      const uA = up.r === 14;
      const v = Blackjack.value(hand.cards);
      if (canSplit) {
        const r = Math.min(10, hand.cards[0].r);
        const pr = hand.cards[0].r;
        if (pr === 14) return 'split';
        if (r === 10) { /* stand via hard logic */ }
        else if (pr === 9) { if (!uA && u >= 2 && u <= 9 && u !== 7) return 'split'; }
        else if (pr === 8) return 'split';
        else if (pr === 7) { if (!uA && u >= 2 && u <= 7) return 'split'; }
        else if (pr === 6) { if (!uA && u >= 2 && u <= 6) return 'split'; }
        else if (pr === 4) { if (!uA && (u === 5 || u === 6)) return 'split'; }
        else if (pr === 3 || pr === 2) { if (!uA && u >= 2 && u <= 7) return 'split'; }
      }
      if (v.soft) {
        const t = v.total;
        if (t >= 19) return 'stand';
        if (t === 18) {
          if (!uA && u >= 3 && u <= 6 && canDouble) return 'double';
          if (!uA && (u === 2 || u === 7 || u === 8)) return 'stand';
          return 'hit';
        }
        if (t === 17) { if (!uA && u >= 3 && u <= 6 && canDouble) return 'double'; return 'hit'; }
        if (t === 16 || t === 15) { if (!uA && u >= 4 && u <= 6 && canDouble) return 'double'; return 'hit'; }
        return (!uA && (u === 5 || u === 6) && canDouble) ? 'double' : 'hit';
      }
      const t = v.total;
      if (t >= 17) return 'stand';
      if (t >= 13) return (!uA && u <= 6) ? 'stand' : 'hit';
      if (t === 12) return (!uA && u >= 4 && u <= 6) ? 'stand' : 'hit';
      if (t === 11) return (canDouble && !uA) ? 'double' : 'hit';
      if (t === 10) return (canDouble && !uA && u <= 9) ? 'double' : 'hit';
      if (t === 9) return (canDouble && !uA && u >= 3 && u <= 6) ? 'double' : 'hit';
      return 'hit';
    }
  };

  // =========================================================
  // 2. ROULETTE — Vern's wheel. American double-zero, true
  // pocket order. The wheel is old; pocket 26 sits a hair low.
  // =========================================================
  const WHEEL_ORDER = ['0', '28', '9', '26', '30', '11', '7', '20', '32', '17', '5', '22', '34', '15', '3', '24', '36', '13', '1', '00', '27', '10', '25', '29', '12', '8', '19', '31', '18', '6', '21', '33', '16', '4', '23', '35', '14', '2'];
  const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const Roulette = {
    WHEEL_ORDER, REDS,
    BIAS_POCKET: '26', BIAS_WEIGHT: 1.13,
    spin(rng, biased) {
      const weights = WHEEL_ORDER.map(p => (biased && p === Roulette.BIAS_POCKET) ? Roulette.BIAS_WEIGHT : 1);
      return WHEEL_ORDER[rng.weighted(weights)];
    },
    color(pocket) {
      if (pocket === '0' || pocket === '00') return 'green';
      return REDS.has(parseInt(pocket, 10)) ? 'red' : 'black';
    },
    // bet: {type, sel, amt} -> money returned (stake included on a win)
    payout(bet, pocket) {
      const n = (pocket === '0' || pocket === '00') ? -1 : parseInt(pocket, 10);
      const amt = bet.amt;
      const win = mult => amt * (mult + 1);
      switch (bet.type) {
        case 'straight': return bet.sel === pocket ? win(35) : 0;
        case 'split': return bet.sel.indexOf(pocket) >= 0 ? win(17) : 0;
        case 'street': return (n > 0 && Math.ceil(n / 3) - 1 === bet.sel) ? win(11) : 0;
        case 'corner': return bet.sel.indexOf(pocket) >= 0 ? win(8) : 0;
        case 'five': return ['0', '00', '1', '2', '3'].indexOf(pocket) >= 0 ? win(6) : 0;
        case 'six': return (n > 0 && (Math.ceil(n / 3) - 1 === bet.sel || Math.ceil(n / 3) - 1 === bet.sel + 1)) ? win(5) : 0;
        case 'dozen': return (n > 0 && Math.floor((n - 1) / 12) === bet.sel) ? win(2) : 0;
        case 'column': return (n > 0 && (n - 1) % 3 === bet.sel) ? win(2) : 0;
        case 'red': return (n > 0 && REDS.has(n)) ? win(1) : 0;
        case 'black': return (n > 0 && !REDS.has(n)) ? win(1) : 0;
        case 'odd': return (n > 0 && n % 2 === 1) ? win(1) : 0;
        case 'even': return (n > 0 && n % 2 === 0) ? win(1) : 0;
        case 'low': return (n >= 1 && n <= 18) ? win(1) : 0;
        case 'high': return (n >= 19 && n <= 36) ? win(1) : 0;
        default: return 0;
      }
    }
  };

  // =========================================================
  // 3. CRAPS — Eddie's table. Pass and don't, 3-4-5x odds
  // (the only fair bet in the building), field, place 6/8,
  // hardways for the believers.
  // =========================================================
  const Craps = {
    newTable() {
      return { phase: 'comeout', point: 0, bets: { pass: 0, dpass: 0, odds: 0, field: 0, place6: 0, place8: 0, hard4: 0, hard6: 0, hard8: 0, hard10: 0 } };
    },
    maxOdds(point, passBet) {
      if (point === 4 || point === 10) return passBet * 3;
      if (point === 5 || point === 9) return passBet * 4;
      return passBet * 5; // 6, 8
    },
    oddsPays(point, amt) {
      if (point === 4 || point === 10) return amt * 2;      // 2:1
      if (point === 5 || point === 9) return amt * 1.5;     // 3:2
      return amt * 1.2;                                     // 6:5
    },
    roll(rng) { return [1 + rng.int(6), 1 + rng.int(6)]; },
    // resolve mutates the table and returns {returned, events:[...]}
    resolve(tab, dice) {
      const sum = dice[0] + dice[1];
      const hard = dice[0] === dice[1];
      const b = tab.bets;
      let returned = 0;
      const ev = [];
      // one-roll field bet
      if (b.field > 0) {
        if (sum === 2) { returned += b.field * 3; ev.push('field2'); }
        else if (sum === 12) { returned += b.field * 4; ev.push('field12'); }
        else if ([3, 4, 9, 10, 11].indexOf(sum) >= 0) { returned += b.field * 2; ev.push('fieldwin'); }
        else ev.push('fieldlose');
        b.field = 0;
      }
      // hardways: working any time they're up
      for (const pt of [4, 6, 8, 10]) {
        const key = 'hard' + pt;
        if (b[key] > 0) {
          if (sum === pt && hard) {
            const mult = (pt === 4 || pt === 10) ? 7 : 9;
            returned += b[key] * (mult + 1); ev.push('hardwin' + pt); b[key] = 0;
          } else if (sum === 7 || (sum === pt && !hard)) {
            ev.push('hardlose' + pt); b[key] = 0;
          }
        }
      }
      if (tab.phase === 'comeout') {
        if (sum === 7 || sum === 11) {
          if (b.pass > 0) { returned += b.pass * 2; ev.push('passwin'); b.pass = 0; }
          if (b.dpass > 0) { ev.push('dpasslose'); b.dpass = 0; }
        } else if (sum === 2 || sum === 3 || sum === 12) {
          if (b.pass > 0) { ev.push('passlose'); b.pass = 0; }
          if (b.dpass > 0) {
            if (sum === 12) { returned += b.dpass; ev.push('dpassbar'); } // bar the twelve
            else { returned += b.dpass * 2; ev.push('dpasswin'); }
            b.dpass = 0;
          }
        } else {
          tab.phase = 'point'; tab.point = sum; ev.push('point' + sum);
        }
      } else {
        // place bets work while the point is on; wins pay 7:6 and the bet stays up
        if (sum === 6 && b.place6 > 0) { returned += b.place6 * (7 / 6); ev.push('place6win'); }
        if (sum === 8 && b.place8 > 0) { returned += b.place8 * (7 / 6); ev.push('place8win'); }
        if (sum === tab.point) {
          if (b.pass > 0) { returned += b.pass * 2; ev.push('passwin'); b.pass = 0; }
          if (b.odds > 0) { returned += b.odds + Craps.oddsPays(tab.point, b.odds); ev.push('oddswin'); b.odds = 0; }
          if (b.dpass > 0) { ev.push('dpasslose'); b.dpass = 0; }
          tab.phase = 'comeout'; tab.point = 0; ev.push('pointmade');
        } else if (sum === 7) {
          if (b.pass > 0) { ev.push('passlose'); b.pass = 0; }
          if (b.odds > 0) { ev.push('oddslose'); b.odds = 0; }
          if (b.dpass > 0) { returned += b.dpass * 2; ev.push('dpasswin'); b.dpass = 0; }
          if (b.place6 > 0) { ev.push('place6lose'); b.place6 = 0; }
          if (b.place8 > 0) { ev.push('place8lose'); b.place8 = 0; }
          tab.phase = 'comeout'; tab.point = 0; ev.push('sevenout');
        }
      }
      return { returned, events: ev, sum, hard };
    }
  };

  // =========================================================
  // 4. SLOTS — Pete's row. Two straight machines and The
  // Motherlode, whose meter grows all night. Past a certain
  // number on that glass, the math flips. Nobody posts which.
  // =========================================================
  // symbols: CH LM OR PL BE BA BB SV CR
  const SLOT_MACHINES = {
    pete: { // "Prospector Pete" — $1, friendliest glass in the row
      bet: 1,
      weights: { CH: 5, LM: 5, OR: 4, PL: 4, BE: 3, BA: 3, BB: 2, SV: 1, CR: 1 }, // 28/reel
      pays: [ // checked top-down, first match pays
        { kind: 'triple', sym: 'CR', mult: 500 },
        { kind: 'triple', sym: 'SV', mult: 180 },
        { kind: 'triple', sym: 'BB', mult: 50 },
        { kind: 'triple', sym: 'BA', mult: 25 },
        { kind: 'anybar', mult: 10 },
        { kind: 'triple', sym: 'BE', mult: 20 },
        { kind: 'triple', sym: 'PL', mult: 14 },
        { kind: 'triple', sym: 'OR', mult: 12 },
        { kind: 'triple', sym: 'LM', mult: 10 },
        { kind: 'triple', sym: 'CH', mult: 8 },
        { kind: 'cherries', count: 2, mult: 3 },
        { kind: 'cherries', count: 1, mult: 1 }
      ],
      jackpotSym: null
    },
    kate: { // "Klondike Kate" — $5, heavier top end
      bet: 5,
      weights: { CH: 5, LM: 5, OR: 4, PL: 4, BE: 3, BA: 3, BB: 2, SV: 1, CR: 1 },
      pays: [
        { kind: 'triple', sym: 'CR', mult: 600 },
        { kind: 'triple', sym: 'SV', mult: 200 },
        { kind: 'triple', sym: 'BB', mult: 60 },
        { kind: 'triple', sym: 'BA', mult: 25 },
        { kind: 'anybar', mult: 10 },
        { kind: 'triple', sym: 'BE', mult: 20 },
        { kind: 'triple', sym: 'PL', mult: 14 },
        { kind: 'triple', sym: 'OR', mult: 12 },
        { kind: 'triple', sym: 'LM', mult: 9 },
        { kind: 'triple', sym: 'CH', mult: 7 },
        { kind: 'cherries', count: 2, mult: 3 },
        { kind: 'cherries', count: 1, mult: 1 }
      ],
      jackpotSym: null
    },
    motherlode: { // progressive — $5, stingy glass, the meter is the point
      bet: 5,
      weights: { CH: 5, LM: 5, OR: 5, PL: 4, BE: 4, BA: 3, BB: 2, SV: 2, CR: 2 }, // 32/reel
      pays: [
        { kind: 'triple', sym: 'CR', mult: 0, jackpot: true },
        { kind: 'triple', sym: 'SV', mult: 150 },
        { kind: 'triple', sym: 'BB', mult: 50 },
        { kind: 'triple', sym: 'BA', mult: 25 },
        { kind: 'anybar', mult: 8 },
        { kind: 'triple', sym: 'BE', mult: 14 },
        { kind: 'triple', sym: 'PL', mult: 10 },
        { kind: 'triple', sym: 'OR', mult: 8 },
        { kind: 'triple', sym: 'LM', mult: 8 },
        { kind: 'triple', sym: 'CH', mult: 8 },
        { kind: 'cherries', count: 2, mult: 4 },
        { kind: 'cherries', count: 1, mult: 1 }
      ],
      jackpotSym: 'CR'
    }
  };
  const SLOT_SYMS = ['CH', 'LM', 'OR', 'PL', 'BE', 'BA', 'BB', 'SV', 'CR'];
  const Slots = {
    MACHINES: SLOT_MACHINES, SYMS: SLOT_SYMS,
    PROGRESSIVE_RESET: 2500,
    reelPick(machine, rng) {
      const w = SLOT_MACHINES[machine].weights;
      return SLOT_SYMS[rng.weighted(SLOT_SYMS.map(s => w[s]))];
    },
    evalLine(machine, syms) {
      const m = SLOT_MACHINES[machine];
      const bars = syms.filter(s => s === 'BA' || s === 'BB').length;
      const cherries = syms.filter(s => s === 'CH').length;
      for (const p of m.pays) {
        if (p.kind === 'triple' && syms[0] === p.sym && syms[1] === p.sym && syms[2] === p.sym) {
          return { mult: p.mult, jackpot: !!p.jackpot, line: p };
        }
        if (p.kind === 'anybar' && bars === 3) return { mult: p.mult, jackpot: false, line: p };
        if (p.kind === 'cherries' && cherries === p.count) return { mult: p.mult, jackpot: false, line: p };
      }
      return { mult: 0, jackpot: false, line: null };
    },
    spin(machine, rng) {
      const syms = [Slots.reelPick(machine, rng), Slots.reelPick(machine, rng), Slots.reelPick(machine, rng)];
      const res = Slots.evalLine(machine, syms);
      return { syms, mult: res.mult, jackpot: res.jackpot };
    },
    // exact RTP by enumeration; jackpot machines get meter/bet added at p(jackpot)
    exactRTP(machine, meter) {
      const m = SLOT_MACHINES[machine];
      const w = m.weights;
      const total = SLOT_SYMS.reduce((a, s) => a + w[s], 0);
      let rtp = 0, pJack = 0;
      for (const a of SLOT_SYMS) for (const b of SLOT_SYMS) for (const c of SLOT_SYMS) {
        const p = (w[a] / total) * (w[b] / total) * (w[c] / total);
        const res = Slots.evalLine(machine, [a, b, c]);
        rtp += p * res.mult;
        if (res.jackpot) pJack += p;
      }
      if (m.jackpotSym && meter != null) rtp += pJack * (meter / m.bet);
      return { rtp, pJack };
    }
  };

  // =========================================================
  // 5. VIDEO POKER — two machines by the lounge. The one by
  // the door pays 9 on the full house and 6 on the flush.
  // Reading the glass is the whole trick.
  // =========================================================
  const VP_PAYS = {
    good: { name: '9/6', royal: 800, sf: 50, quads: 25, full: 9, flush: 6, straight: 4, trips: 3, twopair: 2, jacks: 1 },
    bad: { name: '8/5', royal: 800, sf: 50, quads: 25, full: 8, flush: 5, straight: 4, trips: 3, twopair: 2, jacks: 1 }
  };
  const VideoPoker = {
    PAYS: VP_PAYS,
    deal(rng) {
      const deck = rng.shuffle(makeDeck());
      return { deck, hand: deck.splice(0, 5), phase: 'hold' };
    },
    drawReplace(state, holds) {
      for (let i = 0; i < 5; i++) if (!holds[i]) state.hand[i] = state.deck.pop();
      state.phase = 'done';
      return state.hand;
    },
    classify(hand) {
      const rs = hand.map(c => c.r).sort((a, b) => a - b);
      const flush = hand.every(c => c.s === hand[0].s);
      let straight = rs.every((r, i) => i === 0 || r === rs[i - 1] + 1);
      let hi = rs[4];
      if (!straight && rs[0] === 2 && rs[1] === 3 && rs[2] === 4 && rs[3] === 5 && rs[4] === 14) { straight = true; hi = 5; }
      const counts = {};
      for (const r of rs) counts[r] = (counts[r] || 0) + 1;
      const shape = Object.values(counts).sort((a, b) => b - a);
      if (straight && flush) return (hi === 14 && rs[0] === 10) ? 'royal' : 'sf';
      if (shape[0] === 4) return 'quads';
      if (shape[0] === 3 && shape[1] === 2) return 'full';
      if (flush) return 'flush';
      if (straight) return 'straight';
      if (shape[0] === 3) return 'trips';
      if (shape[0] === 2 && shape[1] === 2) return 'twopair';
      if (shape[0] === 2) {
        const pr = +Object.keys(counts).find(r => counts[r] === 2);
        if (pr >= 11) return 'jacks';
      }
      return 'nothing';
    },
    payout(cls, machine, bet) {
      const p = VP_PAYS[machine][cls];
      return p ? bet * p : 0;
    },
    // A solid simplified hold strategy — not perfect, honest to ~99.2 on the 9/6.
    strategyHolds(hand) {
      const H = hand;
      const idx = [0, 1, 2, 3, 4];
      const byRank = {};
      idx.forEach(i => { (byRank[H[i].r] = byRank[H[i].r] || []).push(i); });
      const bySuit = {};
      idx.forEach(i => { (bySuit[H[i].s] = bySuit[H[i].s] || []).push(i); });
      const cls = VideoPoker.classify(H);
      const holdAll = [true, true, true, true, true];
      const mask = arr => idx.map(i => arr.indexOf(i) >= 0);
      if (cls === 'royal' || cls === 'sf' || cls === 'quads' || cls === 'full') return holdAll;
      // 4 to a royal
      for (const s in bySuit) {
        const royals = bySuit[s].filter(i => H[i].r >= 10);
        if (royals.length === 4) return mask(royals);
      }
      if (cls === 'flush' || cls === 'straight') return holdAll;
      if (cls === 'trips') { for (const r in byRank) if (byRank[r].length === 3) return mask(byRank[r]); }
      if (cls === 'twopair') {
        const keep = [];
        for (const r in byRank) if (byRank[r].length === 2) keep.push.apply(keep, byRank[r]);
        return mask(keep);
      }
      // 4 to a straight flush
      for (const s in bySuit) {
        if (bySuit[s].length >= 4) {
          const cand = bySuit[s].map(i => H[i].r).sort((a, b) => a - b);
          for (let lo = 2; lo <= 10; lo++) {
            const need = [lo, lo + 1, lo + 2, lo + 3, lo + 4];
            const have = bySuit[s].filter(i => need.indexOf(H[i].r) >= 0);
            if (have.length === 4) return mask(have);
          }
        }
      }
      // high pair
      for (const r in byRank) if (byRank[r].length === 2 && +r >= 11) return mask(byRank[r]);
      // 3 to a royal
      for (const s in bySuit) {
        const royals = bySuit[s].filter(i => H[i].r >= 10);
        if (royals.length === 3) return mask(royals);
      }
      // 4 to a flush
      for (const s in bySuit) if (bySuit[s].length === 4) return mask(bySuit[s]);
      // low pair
      for (const r in byRank) if (byRank[r].length === 2) return mask(byRank[r]);
      // 4 to an outside straight
      {
        const uniq = Object.keys(byRank).map(Number).sort((a, b) => a - b);
        if (uniq.length >= 4) {
          for (let i = 0; i + 3 < uniq.length; i++) {
            if (uniq[i + 3] - uniq[i] === 3 && uniq[i] >= 2 && uniq[i + 3] <= 13) {
              const keep = [];
              for (let k = i; k <= i + 3; k++) keep.push(byRank[uniq[k]][0]);
              return mask(keep);
            }
          }
        }
      }
      // 2 suited high cards
      for (const s in bySuit) {
        const highs = bySuit[s].filter(i => H[i].r >= 11);
        if (highs.length >= 2) return mask(highs.slice(0, 2));
      }
      // 3 to a straight flush (any)
      for (const s in bySuit) {
        if (bySuit[s].length >= 3) {
          const rsIdx = bySuit[s].slice().sort((a, b) => H[a].r - H[b].r);
          for (let i = 0; i + 2 < rsIdx.length; i++) {
            if (H[rsIdx[i + 2]].r - H[rsIdx[i]].r <= 4) return mask([rsIdx[i], rsIdx[i + 1], rsIdx[i + 2]]);
          }
        }
      }
      // two unsuited highs (keep the lowest two — closer to correct than keeping three)
      {
        const highs = idx.filter(i => H[i].r >= 11).sort((a, b) => H[a].r - H[b].r);
        if (highs.length >= 2) return mask(highs.slice(0, 2));
        if (highs.length === 1) return mask(highs);
      }
      return [false, false, false, false, false];
    }
  };

  // =========================================================
  // 6. BACCARAT — Dot's table. Punto banco, the full tableau,
  // five percent off the banker. Dot does the crossword
  // between shoes and never once looks surprised.
  // =========================================================
  const Baccarat = {
    newShoe(rng) {
      const cards = [];
      for (let d = 0; d < 6; d++) cards.push.apply(cards, makeDeck());
      rng.shuffle(cards);
      return { cards, cut: 52 };
    },
    needsShuffle(shoe) { return shoe.cards.length <= shoe.cut; },
    pip(c) { return c.r === 14 ? 1 : (c.r >= 10 ? 0 : c.r); },
    total(cards) { return cards.reduce((a, c) => a + Baccarat.pip(c), 0) % 10; },
    playHand(shoe) {
      const draw = () => shoe.cards.pop();
      const player = [draw(), draw()];
      const banker = [draw(), draw()];
      const pt0 = Baccarat.total(player), bt0 = Baccarat.total(banker);
      let playerThird = null;
      if (pt0 <= 7 && bt0 <= 7) { // no natural
        if (pt0 <= 5) { playerThird = draw(); player.push(playerThird); }
        const bt = Baccarat.total(banker);
        let bankerDraws;
        if (playerThird === null) {
          bankerDraws = bt <= 5;
        } else {
          const t = Baccarat.pip(playerThird);
          if (bt <= 2) bankerDraws = true;
          else if (bt === 3) bankerDraws = t !== 8;
          else if (bt === 4) bankerDraws = t >= 2 && t <= 7;
          else if (bt === 5) bankerDraws = t >= 4 && t <= 7;
          else if (bt === 6) bankerDraws = t === 6 || t === 7;
          else bankerDraws = false;
        }
        if (bankerDraws) banker.push(draw());
      }
      const pt = Baccarat.total(player), bt = Baccarat.total(banker);
      const outcome = pt > bt ? 'player' : (bt > pt ? 'banker' : 'tie');
      return { player, banker, pt, bt, outcome, natural: pt0 >= 8 || bt0 >= 8 };
    },
    payout(betOn, amt, outcome) {
      if (outcome === 'tie') {
        if (betOn === 'tie') return amt * 9;      // 8:1
        return amt;                                // player/banker push on tie
      }
      if (betOn === outcome) return betOn === 'banker' ? amt + amt * 0.95 : amt * 2;
      return 0;
    }
  };

  // =========================================================
  // 7. THREE-CARD POKER — Marla's table. Ante and play,
  // dealer needs a queen to open. A straight outranks a
  // flush here; the rules card says so and nobody believes it.
  // =========================================================
  const ThreeCard = {
    rank(cards) {
      const rs = cards.map(c => c.r).sort((a, b) => b - a);
      const flush = cards.every(c => c.s === cards[0].s);
      let straight = rs[0] - rs[1] === 1 && rs[1] - rs[2] === 1;
      let kick = rs.slice();
      if (rs[0] === 14 && rs[1] === 3 && rs[2] === 2) { straight = true; kick = [3, 2, 1]; } // A-2-3, ace plays low
      const trips = rs[0] === rs[1] && rs[1] === rs[2];
      let pairRank = 0, kicker = 0;
      if (rs[0] === rs[1]) { pairRank = rs[0]; kicker = rs[2]; }
      else if (rs[1] === rs[2]) { pairRank = rs[1]; kicker = rs[0]; }
      let cls;
      if (straight && flush) cls = 5;
      else if (trips) cls = 4;
      else if (straight) cls = 3;
      else if (flush) cls = 2;
      else if (pairRank) cls = 1;
      else cls = 0;
      const tie = cls === 1 ? [pairRank, kicker, 0] : kick;
      return { cls, tie };
    },
    compare(a, b) {
      const ra = ThreeCard.rank(a), rb = ThreeCard.rank(b);
      if (ra.cls !== rb.cls) return ra.cls > rb.cls ? 1 : -1;
      for (let i = 0; i < 3; i++) {
        if (ra.tie[i] !== rb.tie[i]) return ra.tie[i] > rb.tie[i] ? 1 : -1;
      }
      return 0;
    },
    dealerQualifies(cards) {
      const r = ThreeCard.rank(cards);
      return r.cls > 0 || cards.some(c => c.r >= 12);
    },
    PAIR_PLUS: { 5: 40, 4: 30, 3: 6, 2: 3, 1: 1 },
    ANTE_BONUS: { 5: 5, 4: 4, 3: 1 },
    // player has seen their hand; fold or play (ante again)
    settle(player, dealer, ante, played, pairplus) {
      const pr = ThreeCard.rank(player);
      let returned = 0;
      const ev = [];
      if (pairplus > 0) {
        const m = ThreeCard.PAIR_PLUS[pr.cls] || 0;
        if (m > 0) { returned += pairplus * (m + 1); ev.push('pairplus'); }
      }
      const bonus = ThreeCard.ANTE_BONUS[pr.cls] || 0;
      if (!played) return { returned, ev: ev.concat('fold') }; // folded: ante and pair plus ride away
      if (bonus > 0) { returned += ante * bonus; ev.push('antebonus'); }
      if (!ThreeCard.dealerQualifies(dealer)) {
        returned += ante * 2 + ante; // ante pays even money, play pushes
        ev.push('noqualify');
        return { returned, ev };
      }
      const cmp = ThreeCard.compare(player, dealer);
      if (cmp > 0) { returned += ante * 4; ev.push('win'); }        // ante + play both 1:1
      else if (cmp === 0) { returned += ante * 2; ev.push('push'); }
      else ev.push('lose');
      return { returned, ev };
    }
  };

  // =========================================================
  // 8. HI-LO — Len's ladder at the bar. Fresh deck every
  // card. Call it high or low, let it ride or take it home.
  // Len keeps three cents of every fair dollar. He'll say so.
  // =========================================================
  const HiLo = {
    VIG: 0.97,
    newRun(rng, stake) {
      return { card: 2 + rng.int(13), mult: 1, stake, rungs: 0, dead: false };
    },
    odds(card) {
      const pH = (14 - card) / 13, pL = (card - 2) / 13;
      const m = p => p > 0 ? Math.max(1.01, Math.round((HiLo.VIG / p) * 100) / 100) : 0;
      return { pH, pL, mH: m(pH), mL: m(pL) };
    },
    guess(run, rng, dir) {
      const o = HiLo.odds(run.card);
      const next = 2 + rng.int(13);
      const res = { prev: run.card, next };
      // a tie goes to the house — that's the rub, and Len says so up front
      if (next === run.card) { run.dead = true; res.outcome = 'tie'; return res; }
      const won = dir === 'high' ? next > run.card : next < run.card;
      if (won) {
        run.mult *= dir === 'high' ? o.mH : o.mL;
        run.rungs++;
        run.card = next;
        res.outcome = 'win';
      } else {
        run.dead = true;
        res.outcome = 'lose';
      }
      return res;
    },
    cashout(run) { return run.dead ? 0 : Math.round(run.stake * run.mult); }
  };

  // =========================================================
  // 9. KENO — the lounge. A runner takes your ticket. The
  // house keeps more than a quarter of every dollar and the
  // carpet in there is the nicest in the building. Related.
  // =========================================================
  const KENO_PAYS = {
    1: { 1: 3 },
    2: { 2: 12 },
    3: { 2: 1, 3: 42 },
    4: { 2: 1, 3: 3, 4: 110 },
    5: { 3: 1, 4: 9, 5: 750 },
    6: { 3: 1, 4: 4, 5: 85, 6: 1500 },
    7: { 4: 2, 5: 20, 6: 350, 7: 5000 },
    8: { 5: 9, 6: 90, 7: 1500, 8: 20000 },
    9: { 5: 4, 6: 40, 7: 300, 8: 4000, 9: 25000 },
    10: { 5: 2, 6: 18, 7: 130, 8: 900, 9: 4000, 10: 50000 }
  };
  const Keno = {
    PAYS: KENO_PAYS,
    drawBalls(rng) {
      const balls = [];
      for (let i = 1; i <= 80; i++) balls.push(i);
      rng.shuffle(balls);
      return balls.slice(0, 20);
    },
    settle(picks, drawn, bet) {
      const set = new Set(drawn);
      const hits = picks.filter(p => set.has(p)).length;
      const table = KENO_PAYS[picks.length] || {};
      const mult = table[hits] || 0;
      return { hits, mult, returned: bet * mult };
    },
    // exact hypergeometric EV per spot count — the harness leans on this
    exactRTP(k) {
      const C = (n, r) => {
        if (r < 0 || r > n) return 0;
        let x = 1;
        for (let i = 0; i < r; i++) x = x * (n - i) / (i + 1);
        return x;
      };
      const table = KENO_PAYS[k];
      let ev = 0;
      for (let h = 0; h <= k; h++) {
        const p = C(20, h) * C(60, k - h) / C(80, k);
        ev += p * (table[h] || 0);
      }
      return ev;
    }
  };

  // =========================================================
  // 10. BIG SIX — the money wheel by the door. Fifty-four
  // pegs, six ways to bet, none of them good. It's the
  // prettiest thing in the building and it knows it.
  // =========================================================
  // authentic layout: 24 ones, 15 twos, 7 fives, 4 tens, 2 twenties, joker, gilt crest = 54 pegs
  const BIGSIX_SEGMENTS = ['1', '2', '1', '5', '1', '2', '1', '10', '1', '2', '1', '5', '1', '2', '1', '20', '1', '2', '1', '5', '1', '2', '1', 'joker', '1', '2', '1', '5', '1', '2', '1', '10', '1', '2', '1', '5', '1', '2', '1', '20', '1', '2', '1', '5', '1', '2', '1', 'crest', '2', '10', '5', '2', '10', '2'];
  const BigSix = {
    SEGMENTS: BIGSIX_SEGMENTS,
    PAYS: { '1': 1, '2': 2, '5': 5, '10': 10, '20': 20, 'joker': 40, 'crest': 40 },
    spin(rng) { return rng.int(BIGSIX_SEGMENTS.length); },
    settle(betOn, amt, segIndex) {
      const seg = BIGSIX_SEGMENTS[segIndex];
      if (seg === betOn) return amt * (BigSix.PAYS[seg] + 1);
      return 0;
    }
  };

  // =========================================================
  // 11. THE SIMULCAST — the back parlor. Six-horse fields
  // from tracks three time zones away. The morning line lies
  // a little. Fingers knows how much, for two hundred.
  // =========================================================
  const ODDS_LADDER = [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.5, 1.8, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10, 12, 15, 20, 30, 50];
  const Horses = {
    ODDS_LADDER,
    TAKEOUT: 1.18, TOUT_FEE: 200, TOUT_HONEST: 0.8,
    gauss(rng) {
      let u = 0, v = 0;
      while (u === 0) u = rng(); while (v === 0) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    newRace(rng, n) {
      n = n || 6;
      const strengths = [];
      for (let i = 0; i < n; i++) strengths.push(Math.exp(Horses.gauss(rng) * 0.9));
      const sum = strengths.reduce((a, b) => a + b, 0);
      const truePs = strengths.map(s => s / sum);
      // the board misprices: noisy view of form, then the takeout on top
      const noisy = truePs.map(p => p * Math.exp(Horses.gauss(rng) * 0.35));
      const nsum = noisy.reduce((a, b) => a + b, 0);
      const posted = noisy.map(p => {
        const q = (p / nsum) * Horses.TAKEOUT;             // implied probability with juice
        const fair = Math.max(0.05, (1 - q) / q);          // odds-to-1
        let best = ODDS_LADDER[0];
        for (const o of ODDS_LADDER) if (Math.abs(o - fair) < Math.abs(best - fair)) best = o;
        return best;
      });
      return { n, truePs, posted, ran: false, winner: -1 };
    },
    run(race, rng) {
      let r = rng(), w = race.n - 1;
      for (let i = 0; i < race.n; i++) { r -= race.truePs[i]; if (r < 0) { w = i; break; } }
      race.ran = true; race.winner = w;
      return w;
    },
    settleWin(race, horse, amt) {
      return race.winner === horse ? Math.round(amt * (1 + race.posted[horse])) : 0;
    },
    // EV of a $1 win bet at the posted price
    edge(race, horse) { return race.truePs[horse] * (1 + race.posted[horse]) - 1; },
    // Fingers marks the live one — the best-edge horse — most days.
    // The rest of the time you get his second-best idea. He skims. Everyone knows.
    tout(race, rng) {
      const edges = race.truePs.map((p, i) => Horses.edge(race, i));
      const order = edges.map((e, i) => i).sort((a, b) => edges[b] - edges[a]);
      const honest = rng() < Horses.TOUT_HONEST;
      return { pick: honest ? order[0] : order[1], fee: Horses.TOUT_FEE };
    }
  };

  // =========================================================
  // 12. SCRATCHERS — "Gold Strike" cards at Mabel's cage.
  // Six spots of foil, match three and it pays. The state
  // won't license them so the Gilt prints its own.
  // =========================================================
  const SCRATCH_PRIZES = [
    { v: 5, p: 1 / 5 },
    { v: 10, p: 1 / 12 },
    { v: 20, p: 1 / 28 },
    { v: 100, p: 1 / 240 },
    { v: 1000, p: 1 / 4800 }
  ];
  const Scratch = {
    PRICE: 5, PRIZES: SCRATCH_PRIZES,
    VALUES: [5, 10, 20, 100, 1000],
    buy(rng) {
      let prize = 0, r = rng();
      for (const pr of SCRATCH_PRIZES) { if (r < pr.p) { prize = pr.v; break; } r -= pr.p; }
      // lay six spots: winners show the prize three times; losers never show any value thrice
      const spots = [];
      if (prize > 0) {
        spots.push(prize, prize, prize);
        const others = Scratch.VALUES.filter(v => v !== prize);
        // three fillers, at most two alike
        const a = others[rng.int(others.length)];
        let b = others[rng.int(others.length)];
        let c = others[rng.int(others.length)];
        if (a === b && b === c) c = others.filter(v => v !== a)[rng.int(others.length - 1)];
        spots.push(a, b, c);
      } else {
        // build a losing spread: counts of each value capped at two
        const counts = {};
        while (spots.length < 6) {
          const v = Scratch.VALUES[rng.int(Scratch.VALUES.length)];
          if ((counts[v] || 0) >= 2) continue;
          counts[v] = (counts[v] || 0) + 1;
          spots.push(v);
        }
      }
      rng.shuffle(spots);
      return { spots, prize, scratched: [false, false, false, false, false, false] };
    },
    exactRTP() {
      let ev = 0;
      for (const pr of SCRATCH_PRIZES) ev += pr.p * pr.v;
      return ev / Scratch.PRICE;
    }
  };

  const Games = {
    TABLE, makeDeck, RANK_CH,
    Blackjack, Roulette, Craps, Slots, VideoPoker, Baccarat, ThreeCard, HiLo, Keno, BigSix, Horses, Scratch
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Games;
  root.GiltGames = Games;
})(typeof window !== 'undefined' ? window : globalThis);
