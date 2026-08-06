/* GILT — tables: the twelve ways themselves, drawn and dealt.
   Every scene: bet, animate, settle through G.settleWager, and let the
   dealer say what dealers say. Discovery triggers write the notebook. */
(function (root) {
  'use strict';
  const A = root.GiltArt, E = root.GiltEngine, C = root.GiltCopy, Cast = root.GiltCast, GM = root.GiltGames;
  const SC = root.GiltScenes;
  const { S, G, UI, Dialog, Talk, drawHUD, hudAction, W, H } = SC;
  const { PAL, FONT, TAU, rr, poly, mix, alpha, label, lerp, clamp, ease, neon, lampPool, vignette } = A;

  const lim = id => {
    const t = GM.TABLE[id];
    const m = (G.night && G.night.freeplay && G.night.highroller) ? 10 : 1;
    return { min: (t.min || 0), max: (t.max || 0) * m, pace: t.pace, straightMax: (t.straightMax || 0) * m };
  };

  // ---------------- shared: bet box ----------------
  function BetBox(prefix, tableId) {
    return {
      amount: 0, denom: 25,
      draw(ctx, x, y, opts) {
        opts = opts || {};
        const L = lim(tableId);
        const denoms = [5, 25, 100, 500];
        for (let i = 0; i < denoms.length; i++) {
          const d = denoms[i];
          const bx = x + i * 52;
          const sel = this.denom === d;
          A.drawChip(ctx, bx, y, 22, d);
          if (sel) {
            ctx.beginPath(); ctx.arc(bx, y, 26, 0, TAU);
            ctx.strokeStyle = PAL.brassHi; ctx.lineWidth = 2.5; ctx.stroke();
          }
          UI.buttons.push({ id: prefix + ':d' + d, x: bx - 24, y: y - 24, w: 48, h: 48 });
        }
        if (!opts.noAmount) {
          label(ctx, this.amount > 0 ? E.dollars(this.amount) : (L.min ? E.dollars(L.min) + '–' + E.dollars(L.max) : ''), x + 104, y - 34, 16, this.amount > 0 ? PAL.brassHi : PAL.ivoryDim, 'center', FONT.ui, 'bold');
          UI.button(ctx, prefix + ':clear', x + 216, y - 18, 92, 36, C.ui.clear, { size: 13, disabled: this.amount === 0 });
        }
      },
      action(id) {
        for (const d of [5, 25, 100, 500]) {
          if (id === this.prefixd(d)) {
            this.denom = d;
            const L = lim(tableId);
            const room = Math.min(G.night.cash - this.amount, L.max - this.amount);
            if (d <= room) { this.amount += d; if (G.audio && G.audio.play) G.audio.play('chip'); }
            return true;
          }
        }
        if (id === prefix + ':clear') { this.amount = 0; return true; }
        return false;
      },
      prefixd(d) { return prefix + ':d' + d; }
    };
  }

  // escrow helper per scene
  function Escrow() {
    return {
      held: 0,
      take(amt) {
        if (amt > G.night.cash) return false;
        G.night.cash -= amt; this.held += amt;
        if (G.audio) G.audio.play('chips');
        return true;
      },
      settle(id, returned, minutes) {
        G.night.cash += this.held;
        G.settleWager(id, this.held, returned, minutes);
        this.held = 0;
      }
    };
  }

  function dealerName(ctx, name, x, y) {
    label(ctx, name, x, y, 12, alpha(PAL.brassHi, 0.85), 'center', FONT.ui, 'bold');
  }
  function feltText(ctx, text, x, y, size, a) {
    label(ctx, text, x, y, size, alpha('#e8e0c8', a == null ? 0.5 : a), 'center', FONT.display, 'bold');
  }

  // ======================================================
  // BLACKJACK — Ruth
  // ======================================================
  const bjScene = {
    rulesKey: 'blackjack',
    enter() {
      if (G.audio) G.audio.ambient('table');
      const n = G.night;
      if (!n.flags.bjShoe || !n.flags.bjShoe.cards.length) n.flags.bjShoe = GM.Blackjack.newShoe(G.rng);
      this.shoe = n.flags.bjShoe;
      this.bet = BetBox('bj', 'blackjack');
      this.esc = Escrow();
      this.round = null; this.fin = null;
      this.phase = 'bet';
      this.anims = []; this.wait = 0;
      this.lastActionWrong = null;
      if (!n.flags.bjGreeted) {
        n.flags.bjGreeted = true;
        Talk.sayFrom('ruthg', C.ruth.greetFirst, W / 2, H * 0.24);
      } else Talk.sayFrom('ruthg2', C.ruth.greet, W / 2, H * 0.24);
    },
    cardSpot(hi, ci, isDealer, nHands) {
      if (isDealer) return { x: W / 2 - 40 + ci * 34, y: 285 };
      const base = nHands > 1 ? (hi === 0 ? W / 2 - 190 : W / 2 + 130) : W / 2 - 40;
      return { x: base + ci * 34, y: 560 };
    },
    dealAnim(card, to, faceUp, delay) {
      this.anims.push({ card, x0: W - 180, y0: 240, x1: to.x, y1: to.y, t: -(delay || 0), dur: 0.34, faceUp });
      this.wait = Math.max(this.wait, (delay || 0) + 0.36);
      if (G.audio) G.audio.play('card', delay);
    },
    startRound() {
      const n = G.night;
      if (this.bet.amount < lim('blackjack').min) return;
      if (!this.esc.take(this.bet.amount)) return;
      if (GM.Blackjack.needsShuffle(this.shoe)) {
        n.flags.bjShoe = GM.Blackjack.newShoe(G.rng);
        this.shoe = n.flags.bjShoe;
        Talk.say('Fresh shoe.', W / 2, H * 0.24);
      }
      const tc = GM.Blackjack.trueCount(this.shoe);
      const tripped = E.noteBlackjackBet(n, this.bet.amount, tc);
      this.round = GM.Blackjack.start(this.shoe, this.bet.amount);
      this.phase = 'deal';
      n.flags.bjHands = (n.flags.bjHands || 0) + 1;
      const r = this.round;
      this.dealAnim(r.hands[0].cards[0], this.cardSpot(0, 0, false, 1), true, 0);
      this.dealAnim(r.up, this.cardSpot(0, 0, true, 1), true, 0.18);
      this.dealAnim(r.hands[0].cards[1], this.cardSpot(0, 1, false, 1), true, 0.36);
      this.dealAnim(r.hole, this.cardSpot(0, 1, true, 1), false, 0.54);
      if (tripped) this.coleTime = true;
    },
    doAction(act) {
      const r = this.round;
      const h = r.hands[r.active];
      // Ruth notices deviations — the politest lesson in the building
      const acts = GM.Blackjack.actions(r);
      const book = GM.Blackjack.basicAction(h, r.up, { canDouble: acts.indexOf('double') >= 0, canSplit: acts.indexOf('split') >= 0 });
      if (act !== book && G.rng() < 0.3) this.lastActionWrong = true;
      if (act === 'double' || act === 'split') {
        if (!this.esc.take(r.bet)) return;
        if (act === 'double') Talk.sayFrom('ruthd', [C.ruth.double], W / 2, H * 0.24);
        else Talk.sayFrom('ruths', [C.ruth.split], W / 2, H * 0.24);
      }
      const hi = r.active, before = h.cards.length;
      GM.Blackjack.act(r, this.shoe, act);
      // animate any card that appeared
      for (const [idx, hd] of r.hands.entries()) {
        for (let ci = 0; ci < hd.cards.length; ci++) {
          if (!hd.cards[ci]._seen) {
            hd.cards[ci]._seen = true;
            this.dealAnim(hd.cards[ci], this.cardSpot(idx, ci, false, r.hands.length), true, 0);
          }
        }
      }
      if (r.phase === 'dealer') { this.phase = 'reveal'; this.wait = Math.max(this.wait, 0.4); }
    },
    finishRound() {
      const r = this.round;
      this.fin = GM.Blackjack.finish(r, this.shoe);
      // animate dealer draws
      for (let ci = 2; ci < this.fin.dealer.length; ci++) {
        this.dealAnim(this.fin.dealer[ci], this.cardSpot(0, ci, true, 1), true, (ci - 2) * 0.32);
      }
      this.phase = 'settle';
      this.wait = Math.max(this.wait, 0.5 + (this.fin.dealer.length - 2) * 0.32);
    },
    settle() {
      const r = this.round, fin = this.fin;
      const staked = this.esc.held;
      this.esc.settle('blackjack', fin.returned, lim('blackjack').pace);
      const net = fin.returned - staked;
      if (fin.playerBJ && !fin.dealerBJ) { Talk.sayFrom('rbj', C.ruth.playerBJ, W / 2, H * 0.24); if (G.audio) G.audio.play('winBig'); }
      else if (fin.dealerBJ && !fin.playerBJ) Talk.sayFrom('rdbj', C.ruth.dealerBJ, W / 2, H * 0.24);
      else if (net > 0) {
        Talk.sayFrom('rw', net >= staked ? C.ruth.winBig : C.ruth.winSmall, W / 2, H * 0.24);
        if (G.audio) G.audio.play(net >= 200 ? 'winBig' : 'winSmall');
      }
      else if (net === 0) Talk.sayFrom('rp', C.ruth.push, W / 2, H * 0.24);
      else if (r.hands.every(h => h.busted)) Talk.sayFrom('rb', C.ruth.bust, W / 2, H * 0.24);
      else if (this.lastActionWrong) { Talk.sayFrom('rm', C.ruth.mistake, W / 2, H * 0.24); this.lastActionWrong = null; }
      else Talk.sayFrom('rl', C.ruth.lose, W / 2, H * 0.24);
      if (net !== 0) UI.money(net, W / 2, H * 0.5);
      this.phase = 'done';
      // Herb, if you've put the hands in and he's still on his stool
      const n = G.night;
      if ((n.flags.bjHands || 0) >= 15 && !G.knows('count') && !n.flags.herbOffered && n.t < 180 && !n.freeplay) {
        n.flags.herbOffered = true;
        this.herbTime = true;
      }
    },
    update(dt) {
      for (const an of this.anims) an.t += dt;
      this.anims = this.anims.filter(an => an.t < an.dur + 0.1);
      if (this.wait > 0) { this.wait -= dt; return; }
      if (this.coleTime) {
        this.coleTime = false;
        const self = this;
        Dialog.show(C.cole.backoff.map(text => ({ who: 'cole', name: 'COLE', text })), () => {
          G.learn('cover');
          S.go('floor');
        });
        return;
      }
      if (this.phase === 'deal') {
        this.phase = this.round.phase === 'dealer' ? 'reveal' : 'play';
        if (this.phase === 'play') {
          const h = this.round.hands[this.round.active];
          if (GM.Blackjack.value(h.cards).total === 21) { this.doAction('stand'); }
        }
      } else if (this.phase === 'reveal') { this.finishRound(); }
      else if (this.phase === 'settle') { this.settle(); }
      else if (this.phase === 'play') {
        const h = this.round.hands[this.round.active];
        if (h && !h.done && GM.Blackjack.value(h.cards).total === 21) this.doAction('stand');
      }
      if (this.herbTime && !Dialog.open) {
        this.herbTime = false;
        const lines = C.herb.approach.map(text => ({ who: 'herb', name: 'HERB', text }));
        Dialog.show(lines, () => { this.herbAsk = true; });
      }
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night.t);
      A.tableBackdrop(ctx, W, H, dawn);
      lampPool(ctx, W / 2, 240, 430, dawn, 1.3);
      // felt markings
      feltText(ctx, 'BLACKJACK PAYS 3 TO 2', W / 2, 420, 22, 0.4);
      feltText(ctx, 'DEALER STANDS ON ALL 17s', W / 2, 452, 13, 0.3);
      ctx.strokeStyle = alpha('#e8e0c8', 0.3); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W / 2, 260, 330, 0.45, Math.PI - 0.45); ctx.stroke();
      // betting circle
      ctx.beginPath(); ctx.arc(W / 2, 500, 34, 0, TAU);
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Ruth
      Cast.ruth(ctx, W / 2, 232, 1.02, G.time, {
        talk: false, smoke: G.smoke,
        arm: this.anims.length ? clamp(this.anims[0].t / this.anims[0].dur, 0, 1) : 0
      });
      dealerName(ctx, C.ruth.name, W / 2, 92);
      // shoe
      ctx.save();
      ctx.translate(W - 180, 240);
      ctx.rotate(0.06);
      rr(ctx, -34, -24, 68, 48, 6);
      ctx.fillStyle = PAL.woodDark; ctx.fill();
      ctx.strokeStyle = PAL.brass; ctx.lineWidth = 1.5; ctx.stroke();
      A.drawCard(ctx, 0, -6, 40, null, { flip: 0, rot: 0.05 });
      ctx.restore();
      // discard depth = the visible tell that the shoe is real
      const used = this.shoe.dealt;
      for (let i = 0; i < Math.min(30, used / 6); i++) {
        A.drawCard(ctx, 170 + i * 1.3, 250 - i * 1.1, 40, null, { flip: 0, rot: -0.08 + i * 0.004 });
      }
      // hands
      const r = this.round;
      if (r) {
        for (const [hi, hd] of r.hands.entries()) {
          for (let ci = 0; ci < hd.cards.length; ci++) {
            const spot = this.cardSpot(hi, ci, false, r.hands.length);
            if (!this.animFor(hd.cards[ci], ctx, spot)) {
              A.drawCard(ctx, spot.x, spot.y, 52, hd.cards[ci], {});
            }
          }
          const v = GM.Blackjack.value(hd.cards);
          const spot0 = this.cardSpot(hi, 0, false, r.hands.length);
          const col = hd.busted ? PAL.redHi : (r.active === hi && this.phase === 'play' ? PAL.brassHi : PAL.ivoryDim);
          label(ctx, String(v.total) + (v.soft ? ' soft' : ''), spot0.x - 56, 560, 17, col, 'center', FONT.display, 'bold');
          A.drawChipStack(ctx, spot0.x + 30, 648, hd.bet, 11, hi + 3);
        }
        // dealer cards
        const dcards = this.fin ? this.fin.dealer : [r.up, r.hole];
        for (let ci = 0; ci < dcards.length; ci++) {
          const spot = this.cardSpot(0, ci, true, 1);
          const faceUp = ci !== 1 || this.phase === 'settle' || this.phase === 'done' || this.phase === 'reveal';
          if (!this.animFor(dcards[ci], ctx, spot)) {
            A.drawCard(ctx, spot.x, spot.y, 52, dcards[ci], { flip: faceUp ? 1 : 0 });
          }
        }
        if (this.fin && (this.phase === 'done')) {
          const dv = GM.Blackjack.value(this.fin.dealer);
          label(ctx, dv.total > 21 ? dv.total + ' — over' : String(dv.total), W / 2 + 90, 285, 17, dv.total > 21 ? PAL.teal : PAL.ivoryDim, 'left', FONT.display, 'bold');
        }
      }
      // flying cards
      for (const an of this.anims) this.drawAnim(ctx, an);
      // count coach, if Herb taught you
      if (G.knows('count')) {
        const tcv = GM.Blackjack.trueCount(this.shoe);
        rr(ctx, 20, H - 120, 168, 58, 8);
        ctx.fillStyle = 'rgba(8,16,12,0.85)'; ctx.fill();
        ctx.strokeStyle = alpha(PAL.brass, 0.5); ctx.stroke();
        label(ctx, 'the tally', 104, H - 104, 11, PAL.ivoryDim, 'center', FONT.hand);
        label(ctx, (this.shoe.rc > 0 ? '+' : '') + this.shoe.rc + '  ·  true ' + (tcv > 0 ? '+' : '') + tcv.toFixed(1), 104, H - 82, 16, tcv >= 2 ? PAL.teal : PAL.ivory, 'center', FONT.mono, 'bold');
      }
      drawHUD(ctx, { back: this.phase === 'bet' || this.phase === 'done', rules: true });
      // controls
      if (this.phase === 'bet' || this.phase === 'done') {
        this.bet.draw(ctx, W / 2 - 240, H - 90);
        UI.button(ctx, 'bj:deal', W / 2 + 130, H - 112, 180, 48, C.ui.dealIn, { primary: true, disabled: this.bet.amount < lim('blackjack').min });
        if (this.phase === 'done') UI.button(ctx, 'bj:rebet', W / 2 + 130, H - 58, 180, 40, C.ui.rebet + ' · ' + E.dollars(this.lastBet || 0), { size: 14, disabled: !this.lastBet || this.lastBet > G.night.cash });
      } else if (this.phase === 'play' && this.wait <= 0) {
        const acts = GM.Blackjack.actions(this.round);
        let bx = W / 2 - (acts.length * 108) / 2;
        for (const a of acts) {
          const cost = (a === 'double' || a === 'split') ? this.round.bet : 0;
          UI.button(ctx, 'bj:' + a, bx, H - 112, 100, 48, C.ui[a === 'hit' ? 'hit' : a === 'stand' ? 'stand' : a === 'double' ? 'double' : 'split'], { primary: a === 'hit' || a === 'stand', disabled: cost > G.night.cash });
          bx += 108;
        }
      }
      if (this.herbAsk) {
        // Herb on his stool, waiting on an answer
        Cast.herb(ctx, 180, 560, 0.9, G.time, {});
        UI.button(ctx, 'bj:herbyes', 90, 600, 190, 44, C.herb.accept, { primary: true });
        UI.button(ctx, 'bj:herbno', 90, 652, 190, 40, C.herb.decline, { size: 14 });
      }
      vignette(ctx, W, H, 0.42);
    },
    animFor(card, ctx, spot) {
      for (const an of this.anims) {
        if (an.card === card) { this.drawAnim(ctx, an); return true; }
      }
      return false;
    },
    drawAnim(ctx, an) {
      if (an.t < 0) return;
      const k = ease(clamp(an.t / an.dur, 0, 1));
      const x = lerp(an.x0, an.x1, k), y = lerp(an.y0, an.y1, k) - Math.sin(k * Math.PI) * 26;
      A.drawCard(ctx, x, y, 52, an.card, { flip: an.faceUp ? clamp(k * 1.4, 0, 1) : 0, rot: (1 - k) * 0.4 });
    },
    action(id) {
      if (hudAction(id)) return;
      if (this.bet.action(id)) return;
      if (id === 'bj:deal') { this.lastBet = this.bet.amount; this.startRound(); }
      else if (id === 'bj:rebet') { this.bet.amount = this.lastBet; this.startRound(); }
      else if (id === 'bj:hit') this.doAction('hit');
      else if (id === 'bj:stand') this.doAction('stand');
      else if (id === 'bj:double') this.doAction('double');
      else if (id === 'bj:split') this.doAction('split');
      else if (id === 'bj:herbyes') {
        this.herbAsk = false;
        Dialog.show(C.herb.lesson.map(text => ({ who: 'herb', name: 'HERB', text })), () => {
          G.learn('count');
          Talk.say(C.herb.done, 180, 480);
        });
      } else if (id === 'bj:herbno') {
        this.herbAsk = false;
        Talk.say(C.herb.declined, 180, 480);
      }
    }
  };
  S.register('blackjack', bjScene);

  // ======================================================
  // ROULETTE — Vern
  // ======================================================
  const BOARD = { x: 70, y: 470, cw: 46, ch: 44 };
  function cellFor(num) { // 1..36 → col/row in the landscape layout
    const col = Math.floor((num - 1) / 3), row = 2 - ((num - 1) % 3);
    return { x: BOARD.x + 56 + col * BOARD.cw, y: BOARD.y + row * BOARD.ch };
  }
  const rouScene = {
    rulesKey: 'roulette',
    enter() {
      if (G.audio) G.audio.ambient('table');
      const n = G.night;
      if (!n.flags.rHist) n.flags.rHist = [];
      this.bet = BetBox('rou', 'roulette');
      this.esc = Escrow();
      this.bets = []; // {type, sel, amt, bx, by}
      this.phase = 'bet';
      this.wheelRot = 0; this.wheelVel = 0.5;
      this.ball = null; this.result = null;
      this.spinT = 0;
      if (!n.flags.rouGreeted) { n.flags.rouGreeted = true; Talk.sayFrom('verng', C.vern.greetFirst, W * 0.72, 180); }
    },
    placedOn(type, sel) {
      return this.bets.find(b => b.type === type && JSON.stringify(b.sel) === JSON.stringify(sel));
    },
    place(type, sel, bx, by) {
      const L = lim('roulette');
      const d = this.bet.denom;
      const cap = type === 'straight' ? L.straightMax : L.max;
      const cur = this.placedOn(type, sel);
      const has = cur ? cur.amt : 0;
      if (has + d > cap) return;
      if (!this.esc.take(d)) return;
      if (cur) cur.amt += d;
      else this.bets.push({ type, sel, amt: d, bx, by });
    },
    spin() {
      if (!this.bets.length) return;
      this.phase = 'spin';
      this.spinT = 0;
      this.result = GM.Roulette.spin(G.rng, true);
      this.wheelVel = 1.6;
      this.ball = { angle: G.rng() * TAU, vel: -7 - G.rng() * 2, r: 1.04 };
      Talk.sayFrom('verns', C.vern.spin, W * 0.72, 180);
      if (G.audio) G.audio.play('ballspin');
    },
    settle() {
      let returned = 0;
      let winners = 0;
      for (const b of this.bets) {
        const pay = GM.Roulette.payout(b, this.result);
        if (pay > 0) winners++;
        returned += pay;
      }
      const n = G.night;
      n.flags.rHist.push(this.result);
      if (n.flags.rHist.length > 60) n.flags.rHist.shift();
      const staked = this.esc.held;
      this.esc.settle('roulette', returned, lim('roulette').pace);
      const net = returned - staked;
      if (net !== 0) UI.money(net, W * 0.35, H * 0.4);
      if (this.result === '0' || this.result === '00') Talk.sayFrom('vz', C.vern.zero, W * 0.72, 180);
      else if (this.result === '26' && G.knows('wheel')) Talk.sayFrom('v26', C.vern.bias26hit, W * 0.72, 180);
      else Talk.sayFrom(net > 0 ? 'vw' : 'vl', net > 0 ? C.vern.win : C.vern.lose, W * 0.72, 180);
      if (net > 0 && G.audio) G.audio.play(net > 500 ? 'winBig' : 'winSmall');
      if (net > 800) G.chips.fountain(W * 0.3, H * 0.5, 10);
      this.bets = [];
      this.phase = 'bet';
      // the old wheel gives itself away, if anyone's counting
      const hist = n.flags.rHist;
      if (hist.length >= 30 && !G.knows('wheel')) {
        const c26 = hist.filter(p => p === '26').length;
        if (c26 >= 3) {
          Talk.say(C.vern.biasHint, W * 0.72, 180);
          G.learn('wheel');
        }
      }
    },
    update(dt) {
      this.wheelRot += this.wheelVel * dt;
      if (this.phase === 'spin') {
        this.spinT += dt;
        const T = 4.2;
        const k = clamp(this.spinT / T, 0, 1);
        this.wheelVel = lerp(1.6, 0.12, k);
        // ball: fast orbit decaying, then drops to the pocket that already knows
        this.ball.vel = lerp(-7.5, -0.0, ease(k));
        this.ball.angle += this.ball.vel * dt;
        this.ball.r = lerp(1.04, 0.76, ease(clamp((k - 0.45) / 0.5, 0, 1)));
        if (k > 0.75) {
          // glue to the result pocket
          const idx = GM.Roulette.WHEEL_ORDER.indexOf(this.result);
          const target = this.wheelRot + (idx + 0.5) * TAU / 38;
          const blend = clamp((k - 0.75) / 0.25, 0, 1);
          let diff = (target - this.ball.angle) % TAU;
          if (diff > Math.PI) diff -= TAU; if (diff < -Math.PI) diff += TAU;
          this.ball.angle += diff * blend * 0.3;
          if (blend > 0.5 && !this._clack) { this._clack = true; if (G.audio) G.audio.play('balldrop'); }
        }
        if (this.spinT >= T + 0.5) { this._clack = false; this.settle(); }
      }
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night.t);
      A.tableBackdrop(ctx, W, H, dawn);
      lampPool(ctx, W * 0.72, 250, 330, dawn, 1.3);
      lampPool(ctx, W * 0.32, 560, 380, dawn, 1);
      Cast.vern(ctx, W * 0.72, 218, 0.95, G.time, {});
      dealerName(ctx, C.vern.name, W * 0.72, 84);
      // wheel
      A.drawRouletteWheel(ctx, W * 0.72, 320, 108, this.wheelRot, this.ball, G.time);
      if (this.phase === 'bet' && this.result) {
        const col = GM.Roulette.color(this.result);
        label(ctx, this.result, W * 0.72, 470, 30, col === 'red' ? PAL.redHi : col === 'green' ? PAL.teal : PAL.ivory, 'center', FONT.display, 'bold');
      }
      // history board — the tell, posted in plain sight
      const hist = (G.night.flags.rHist || []).slice(-16);
      rr(ctx, W - 120, 100, 96, 420, 8);
      ctx.fillStyle = 'rgba(8,10,14,0.9)'; ctx.fill();
      ctx.strokeStyle = PAL.brass; ctx.lineWidth = 1.5; ctx.stroke();
      label(ctx, 'LAST', W - 72, 122, 12, PAL.ivoryDim, 'center', FONT.ui, 'bold');
      for (let i = 0; i < hist.length; i++) {
        const p = hist[hist.length - 1 - i];
        const col = GM.Roulette.color(p);
        label(ctx, p, W - 72, 150 + i * 23, 15, col === 'red' ? PAL.redHi : col === 'green' ? PAL.teal : '#d8d2c2', 'center', FONT.mono, 'bold');
      }
      // the betting board
      this.drawBoard(ctx);
      drawHUD(ctx, { back: this.phase === 'bet', rules: true });
      if (this.phase === 'bet') {
        this.bet.draw(ctx, 150, H - 60, { noAmount: true });
        UI.button(ctx, 'rou:spin', W - 320, H - 78, 150, 48, C.ui.spin, { primary: true, disabled: !this.bets.length });
        UI.button(ctx, 'rou:take', W - 160, H - 78, 130, 40, C.ui.clear, { size: 14, disabled: !this.bets.length });
      }
      vignette(ctx, W, H, 0.42);
    },
    drawBoard(ctx) {
      const { x, y, cw, ch } = BOARD;
      ctx.save();
      // zeros
      for (const [zi, z] of [['0', 0], ['00', 1]].map((v, i) => [v[0], i])) {
        rr(ctx, x, y + zi * (ch * 1.5), 50, ch * 1.5 - 2, 4);
        ctx.fillStyle = '#1f5c34'; ctx.fill();
        ctx.strokeStyle = alpha('#e8e0c8', 0.6); ctx.lineWidth = 1.5; ctx.stroke();
        label(ctx, z, x + 25, y + zi * ch * 1.5 + ch * 0.75, 16, PAL.ivory, 'center', FONT.display, 'bold');
      }
      // numbers
      for (let num = 1; num <= 36; num++) {
        const c = cellFor(num);
        const red = GM.Roulette.REDS.has(num);
        rr(ctx, c.x, c.y, cw - 2, ch - 2, 3);
        ctx.fillStyle = red ? PAL.red : '#17171c';
        ctx.fill();
        ctx.strokeStyle = alpha('#e8e0c8', 0.55); ctx.lineWidth = 1.2; ctx.stroke();
        label(ctx, String(num), c.x + cw / 2 - 1, c.y + ch / 2, 15, PAL.ivory, 'center', FONT.display);
      }
      // columns
      for (let r2 = 0; r2 < 3; r2++) {
        const cx = BOARD.x + 56 + 12 * cw, cy = y + r2 * ch;
        rr(ctx, cx, cy, 44, ch - 2, 3);
        ctx.fillStyle = 'rgba(14,40,28,0.8)'; ctx.fill();
        ctx.strokeStyle = alpha('#e8e0c8', 0.5); ctx.stroke();
        label(ctx, '2:1', cx + 22, cy + ch / 2, 12, PAL.ivory, 'center');
      }
      // dozens + evens
      const oy = y + 3 * ch + 4;
      const dz = ['1st 12', '2nd 12', '3rd 12'];
      for (let i = 0; i < 3; i++) {
        rr(ctx, x + 56 + i * 4 * cw, oy, 4 * cw - 3, 30, 3);
        ctx.fillStyle = 'rgba(14,40,28,0.8)'; ctx.fill();
        ctx.strokeStyle = alpha('#e8e0c8', 0.5); ctx.stroke();
        label(ctx, dz[i], x + 56 + i * 4 * cw + 2 * cw, oy + 15, 13, PAL.ivory, 'center', FONT.display);
      }
      const ev = [['low', '1–18'], ['even', 'EVEN'], ['red', ''], ['black', ''], ['odd', 'ODD'], ['high', '19–36']];
      for (let i = 0; i < 6; i++) {
        const bx = x + 56 + i * 2 * cw;
        rr(ctx, bx, oy + 34, 2 * cw - 3, 30, 3);
        if (ev[i][0] === 'red') ctx.fillStyle = alpha(PAL.red, 0.85);
        else if (ev[i][0] === 'black') ctx.fillStyle = '#17171c';
        else ctx.fillStyle = 'rgba(14,40,28,0.8)';
        ctx.fill();
        ctx.strokeStyle = alpha('#e8e0c8', 0.5); ctx.stroke();
        if (ev[i][1]) label(ctx, ev[i][1], bx + cw, oy + 49, 12, PAL.ivory, 'center', FONT.display);
        else {
          ctx.beginPath();
          ctx.moveTo(bx + cw, oy + 41); ctx.lineTo(bx + cw + 9, oy + 49); ctx.lineTo(bx + cw, oy + 57); ctx.lineTo(bx + cw - 9, oy + 49);
          ctx.closePath();
          ctx.strokeStyle = PAL.ivory; ctx.stroke();
        }
      }
      // placed chips
      for (const b of this.bets) {
        A.drawChipStack(ctx, b.bx, b.by, b.amt, 9, b.bx | 0);
      }
      ctx.restore();
    },
    boardHit(x, y) {
      const { x: bx0, y: by0, cw, ch } = BOARD;
      // zeros
      if (x >= bx0 && x <= bx0 + 50 && y >= by0 && y <= by0 + ch * 3) {
        const z = y < by0 + ch * 1.5 ? '0' : '00';
        return { type: 'straight', sel: z, bx: bx0 + 25, by: by0 + (z === '0' ? ch * 0.75 : ch * 2.25) };
      }
      // numbers with split/corner snapping at the borders
      if (x >= bx0 + 56 && x < bx0 + 56 + 12 * cw && y >= by0 && y < by0 + 3 * ch) {
        const col = Math.floor((x - bx0 - 56) / cw), row = Math.floor((y - by0) / ch);
        const num = col * 3 + (2 - row) + 1;
        const cx = (x - bx0 - 56) % cw, cy = (y - by0) % ch;
        const nearL = cx < 9, nearR = cx > cw - 9, nearT = cy < 9, nearB = cy > ch - 9;
        const c = cellFor(num);
        // corner picks (up to 4 numbers)
        if ((nearL || nearR) && (nearT || nearB)) {
          const dc = nearL ? -1 : 1, dr = nearT ? -1 : 1;
          const ncol = col + dc, nrow = row + dr;
          if (ncol >= 0 && ncol < 12 && nrow >= 0 && nrow < 3) {
            const nums = [
              num, ncol * 3 + (2 - row) + 1,
              col * 3 + (2 - nrow) + 1, ncol * 3 + (2 - nrow) + 1
            ].map(String);
            return { type: 'corner', sel: nums, bx: c.x + (nearL ? 0 : cw), by: c.y + (nearT ? 0 : ch) };
          }
        }
        if (nearL && col > 0) return { type: 'split', sel: [String(num), String(num - 3)], bx: c.x, by: c.y + ch / 2 };
        if (nearR && col < 11) return { type: 'split', sel: [String(num), String(num + 3)], bx: c.x + cw, by: c.y + ch / 2 };
        if (nearT && row > 0) return { type: 'split', sel: [String(num), String(num + 1)], bx: c.x + cw / 2, by: c.y };
        if (nearB && row < 2) return { type: 'split', sel: [String(num), String(num - 1)], bx: c.x + cw / 2, by: c.y + ch };
        if (nearB && row === 2) return { type: 'street', sel: col, bx: c.x + cw / 2, by: c.y + ch };
        return { type: 'straight', sel: String(num), bx: c.x + cw / 2, by: c.y + ch / 2 };
      }
      // columns
      for (let r2 = 0; r2 < 3; r2++) {
        const cx = bx0 + 56 + 12 * cw, cy = by0 + r2 * ch;
        if (x >= cx && x <= cx + 44 && y >= cy && y <= cy + ch) {
          return { type: 'column', sel: 2 - r2, bx: cx + 22, by: cy + ch / 2 };
        }
      }
      const oy = by0 + 3 * ch + 4;
      for (let i = 0; i < 3; i++) {
        const dx = bx0 + 56 + i * 4 * cw;
        if (x >= dx && x <= dx + 4 * cw - 3 && y >= oy && y <= oy + 30) {
          return { type: 'dozen', sel: i, bx: dx + 2 * cw, by: oy + 15 };
        }
      }
      const evTypes = ['low', 'even', 'red', 'black', 'odd', 'high'];
      for (let i = 0; i < 6; i++) {
        const dx = bx0 + 56 + i * 2 * cw;
        if (x >= dx && x <= dx + 2 * cw - 3 && y >= oy + 34 && y <= oy + 64) {
          return { type: evTypes[i], sel: null, bx: dx + cw, by: oy + 49 };
        }
      }
      return null;
    },
    pointer(type, x, y) {
      if (type !== 'down' || this.phase !== 'bet') return;
      const hit = this.boardHit(x, y);
      if (hit) this.place(hit.type, hit.sel, hit.bx, hit.by);
    },
    action(id) {
      if (hudAction(id)) return;
      if (this.bet.action(id)) return;
      if (id === 'rou:spin') this.spin();
      else if (id === 'rou:take') {
        G.night.cash += this.esc.held; this.esc.held = 0; this.bets = [];
      }
    }
  };
  S.register('roulette', rouScene);

  // ======================================================
  // CRAPS — Eddie
  // ======================================================
  const crapsScene = {
    rulesKey: 'craps',
    enter() {
      if (G.audio) G.audio.ambient('craps');
      const n = G.night;
      if (!n.flags.crapsTab) n.flags.crapsTab = GM.Craps.newTable();
      this.tab = n.flags.crapsTab;
      this.bet = BetBox('cr', 'craps');
      this.esc = Escrow(); // craps escrow works differently: bets live on the table
      this.dice = null; this.rolling = 0;
      this.events = [];
      if (!n.flags.crGreeted) { n.flags.crGreeted = true; Talk.sayFrom('edg', C.eddie.greetFirst, W / 2, 190); }
    },
    regions() {
      const on = this.tab.phase === 'point';
      return [
        { id: 'pass', x: 160, y: 620, w: 500, h: 52, text: 'PASS LINE', open: !on || this.tab.bets.pass > 0 },
        { id: 'dpass', x: 690, y: 620, w: 190, h: 52, text: 'DON\'T PASS · BAR 12', small: true, open: !on },
        { id: 'field', x: 160, y: 552, w: 500, h: 56, text: 'FIELD · 2 pays 2x · 12 pays 3x', open: true },
        { id: 'place6', x: 300, y: 452, w: 120, h: 62, text: 'SIX', open: on },
        { id: 'place8', x: 460, y: 452, w: 120, h: 62, text: 'EIGHT', open: on },
        { id: 'odds', x: 160, y: 452, w: 110, h: 62, text: 'ODDS', open: on && this.tab.bets.pass > 0 },
        { id: 'hard4', x: 660, y: 440, w: 82, h: 54, text: 'HARD 4', hard: [2, 2], open: true },
        { id: 'hard6', x: 750, y: 440, w: 82, h: 54, text: 'HARD 6', hard: [3, 3], open: true },
        { id: 'hard8', x: 660, y: 502, w: 82, h: 54, text: 'HARD 8', hard: [4, 4], open: true },
        { id: 'hard10', x: 750, y: 502, w: 82, h: 54, text: 'HARD 10', hard: [5, 5], open: true }
      ];
    },
    roll() {
      this.rolling = 1.15;
      this.diceResult = GM.Craps.roll(G.rng);
      this.dice = { t: 0 };
      if (G.audio) G.audio.play('dice');
      Talk.sayFrom('edr', this.tab.phase === 'comeout' ? C.eddie.comeout : [''], W / 2, 190);
    },
    resolveRoll() {
      const before = { ...this.tab.bets };
      const res = GM.Craps.resolve(this.tab, this.diceResult);
      // stake accounting: money placed on the table was already deducted; returns come back now
      if (res.returned > 0) {
        G.night.cash += res.returned;
      }
      // record the wagering that RESOLVED this roll (deltas of bets that left the table)
      let resolvedStake = 0;
      for (const k in before) {
        if (before[k] > 0 && this.tab.bets[k] === 0) resolvedStake += before[k];
      }
      if (resolvedStake > 0 || res.returned > 0) {
        E.recordBet(G.night, 'craps', resolvedStake, res.returned);
        const net = res.returned - resolvedStake;
        if (net !== 0) UI.money(net, W / 2, H * 0.42);
        if (net > 0 && G.audio) G.audio.play(net > 400 ? 'winBig' : 'winSmall');
      }
      E.spendTime(G.night, lim('craps').pace);
      E.checkBust(G.night);
      // Eddie reacts
      const ev = res.events;
      if (ev.indexOf('sevenout') >= 0) Talk.sayFrom('ed7', C.eddie.seven, W / 2, 190);
      else if (ev.indexOf('pointmade') >= 0) { Talk.sayFrom('edpm', C.eddie.pointMade, W / 2, 190); if (G.audio) G.audio.play('crowd'); }
      else if (ev.some(e => e.startsWith('point'))) Talk.sayFrom('edp', C.eddie.point, W / 2, 190);
      else if (res.sum === 11 && ev.indexOf('passwin') >= 0) Talk.sayFrom('ed11', C.eddie.eleven, W / 2, 190);
      else if (ev.indexOf('passlose') >= 0) Talk.sayFrom('edc', C.eddie.crapout, W / 2, 190);
      else if (ev.some(e => e.startsWith('fieldwin') || e === 'field2' || e === 'field12')) Talk.sayFrom('edf', C.eddie.fieldWin, W / 2, 190);
      else if (ev.some(e => e.startsWith('hardwin'))) { Talk.sayFrom('edh', C.eddie.hardway, W / 2, 190); if (G.audio) G.audio.play('crowd'); }
    },
    update(dt) {
      if (this.rolling > 0) {
        this.rolling -= dt;
        this.dice.t += dt;
        if (this.rolling <= 0) this.resolveRoll();
      }
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night.t);
      A.tableBackdrop(ctx, W, H, dawn, {});
      lampPool(ctx, W / 2, 300, 460, dawn, 1.25);
      Cast.eddie(ctx, W / 2 + 240, 250, 0.98, G.time, { arm: this.rolling > 0 ? 1 - this.rolling : 0 });
      dealerName(ctx, C.eddie.name, W / 2 + 240, 96);
      // the layout
      const b = this.tab.bets;
      for (const r of this.regions()) {
        rr(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.fillStyle = r.open ? 'rgba(10,40,28,0.55)' : 'rgba(10,25,18,0.4)';
        ctx.fill();
        ctx.strokeStyle = alpha('#e8e0c8', r.open ? 0.55 : 0.2);
        ctx.lineWidth = 1.5; ctx.stroke();
        label(ctx, r.text, r.x + r.w / 2, r.y + (r.hard ? 14 : r.h / 2), r.small ? 12 : (r.hard ? 11 : 16), alpha('#e8e0c8', r.open ? 0.75 : 0.3), 'center', FONT.display, 'bold');
        if (r.hard) {
          A.drawDie(ctx, r.x + r.w / 2 - 12, r.y + 36, 16, r.hard[0], 0);
          A.drawDie(ctx, r.x + r.w / 2 + 12, r.y + 36, 16, r.hard[1], 0);
        }
        const amt = b[r.id];
        if (amt > 0) A.drawChipStack(ctx, r.x + r.w - 34, r.y + r.h - 16, amt, 10, r.x | 0);
      }
      // puck
      const on = this.tab.phase === 'point';
      ctx.beginPath(); ctx.arc(on ? 360 + (this.tab.point - 4) * 40 : 120, 420, 20, 0, TAU);
      ctx.fillStyle = on ? '#e8e0cc' : '#17171c'; ctx.fill();
      ctx.strokeStyle = on ? '#17171c' : '#e8e0cc'; ctx.lineWidth = 2; ctx.stroke();
      label(ctx, on ? 'ON' : 'OFF', on ? 360 + (this.tab.point - 4) * 40 : 120, 420, 12, on ? '#17171c' : '#e8e0cc', 'center', FONT.ui, 'bold');
      if (on) label(ctx, 'the point is ' + this.tab.point, W / 2, 400, 16, PAL.brassHi, 'center', FONT.display);
      // dice
      if (this.dice) {
        const k = clamp(this.dice.t / 1.1, 0, 1);
        if (k < 1) {
          for (let i = 0; i < 2; i++) {
            const dx = lerp(950, 480 + i * 60, ease(k)) + Math.sin(k * 12 + i * 3) * (1 - k) * 30;
            const dy = lerp(300, 340, ease(k)) - Math.sin(k * Math.PI) * 120 + Math.abs(Math.sin(k * 9 + i)) * (1 - k) * 20;
            A.drawDie(ctx, dx, dy, 34, 1 + Math.floor((G.time * 17 + i * 3) % 6), G.time * (14 - k * 13) + i, k < 0.9);
          }
        } else {
          A.drawDie(ctx, 480, 340, 34, this.diceResult[0], 0.12);
          A.drawDie(ctx, 540, 340, 34, this.diceResult[1], -0.08);
          label(ctx, String(this.diceResult[0] + this.diceResult[1]), 512, 292, 26, PAL.brassHi, 'center', FONT.display, 'bold');
        }
      }
      drawHUD(ctx, { back: this.rolling <= 0, rules: true });
      this.bet.draw(ctx, 150, H - 60, { noAmount: true });
      UI.button(ctx, 'cr:roll', W - 320, H - 78, 150, 48, C.ui.roll, { primary: true, disabled: this.rolling > 0 || (this.tab.phase === 'comeout' && !b.pass && !b.dpass && !b.field && !b.hard4 && !b.hard6 && !b.hard8 && !b.hard10) });
      vignette(ctx, W, H, 0.42);
    },
    pointer(type, x, y) {
      if (type !== 'down' || this.rolling > 0) return;
      const L = lim('craps');
      for (const r of this.regions()) {
        if (!r.open) continue;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          const b = this.tab.bets;
          if (r.id === 'odds') {
            const maxO = GM.Craps.maxOdds(this.tab.point, b.pass);
            const add = Math.min(this.bet.denom, maxO - b.odds);
            if (add > 0 && add <= G.night.cash) {
              G.night.cash -= add; b.odds += add;
              if (G.audio) G.audio.play('chips');
              G.learn('odds');
            }
            return;
          }
          const cur = b[r.id];
          if (cur + this.bet.denom > L.max) return;
          if (this.bet.denom <= G.night.cash) {
            G.night.cash -= this.bet.denom;
            b[r.id] += this.bet.denom;
            if (G.audio) G.audio.play('chips');
          }
          return;
        }
      }
    },
    action(id) {
      if (hudAction(id)) return;
      if (this.bet.action(id)) return;
      if (id === 'cr:roll') this.roll();
    }
  };
  S.register('craps', crapsScene);

  // ======================================================
  // SLOTS — Pete's row
  // ======================================================
  const slotScene = {
    rulesKey: 'slots',
    enter() {
      if (G.audio) G.audio.ambient('slots');
      this.machines = ['pete', 'kate', 'motherlode'];
      this.state = {};
      for (const m of this.machines) this.state[m] = { reels: ['BA', 'SV', 'CH'], spin: 0, stops: [0, 0, 0], lever: 0, lit: false };
      this.esc = Escrow();
      // reading the meter is the discovery
      if (G.night.progressive >= 3900 && !G.knows('progressive')) {
        Talk.say('That meter\'s past what the glass needs. Somebody should be standing here.', W / 2, 190);
        G.learn('progressive');
      }
    },
    machineX(i) { return 200 + i * 330; },
    pull(m, i) {
      const st = this.state[m];
      if (st.spin > 0) return;
      const bet = GM.Slots.MACHINES[m].bet;
      if (!this.esc.take(bet)) return;
      st.lever = 1;
      st.spin = 1.9;
      st.result = GM.Slots.spin(m, G.rng);
      st.lit = false;
      if (G.audio) G.audio.play('lever');
      if (G.audio) G.audio.play('reels');
    },
    update(dt) {
      for (const [i, m] of this.machines.entries()) {
        const st = this.state[m];
        st.lever = Math.max(0, st.lever - dt * 2.2);
        if (st.spin > 0) {
          st.spin -= dt;
          const ph = 1.9 - st.spin;
          st.stops = [ph < 0.9 ? 1 : 0, ph < 1.3 ? 1 : 0, ph < 1.7 ? 1 : 0];
          if (ph >= 0.9 && !st._s1) { st._s1 = true; st.reels[0] = st.result.syms[0]; if (G.audio) G.audio.play('reelstop'); }
          if (ph >= 1.3 && !st._s2) { st._s2 = true; st.reels[1] = st.result.syms[1]; if (G.audio) G.audio.play('reelstop'); }
          if (ph >= 1.7 && !st._s3) { st._s3 = true; st.reels[2] = st.result.syms[2]; if (G.audio) G.audio.play('reelstop'); }
          if (st.spin <= 0) {
            st._s1 = st._s2 = st._s3 = false;
            this.land(m);
          }
        }
      }
    },
    land(m) {
      const st = this.state[m];
      const mc = GM.Slots.MACHINES[m];
      let returned = 0;
      if (st.result.jackpot) {
        returned = Math.floor(G.night.progressive);
        G.night.progressive = GM.Slots.PROGRESSIVE_RESET;
        G.chips.fountain(this.machineX(this.machines.indexOf(m)) + 110, 420, 26);
        if (G.audio) G.audio.play('jackpot');
        Talk.say('The whole meter. The WHOLE meter.', W / 2, 190);
        G.bump(4);
      } else if (st.result.mult > 0) {
        returned = st.result.mult * mc.bet;
        st.lit = true;
        if (G.audio) G.audio.play(returned >= mc.bet * 20 ? 'winBig' : 'coins');
      }
      this.esc.settle('slots', returned, lim('slots').pace);
      const net = returned - mc.bet;
      if (returned > 0) UI.money(net, this.machineX(this.machines.indexOf(m)) + 110, 380);
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night.t);
      ctx.fillStyle = mix(PAL.deep, PAL.dawn1, dawn * 0.2);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = A.getCarpet(ctx);
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
      for (let i = 0; i < 3; i++) lampPool(ctx, this.machineX(i) + 110, 330, 260, dawn, 1.2);
      const titles = { pete: C.signs.pete, kate: C.signs.kate, motherlode: C.signs.motherlode };
      const subs = { pete: '$1', kate: '$5', motherlode: C.signs.motherlodeSub };
      for (const [i, m] of this.machines.entries()) {
        const st = this.state[m];
        const x = this.machineX(i);
        A.drawSlotCabinet(ctx, x, 160, 220, {
          title: titles[m], sub: subs[m],
          neonColor: m === 'motherlode' ? PAL.pink : PAL.teal,
          reels: st.reels,
          reelOffsets: st.spin > 0 ? st.stops.map((s, ri) => s ? 0 : ((G.time * (6 + ri)) % 1)) : null,
          lever: st.lever,
          meter: m === 'motherlode' ? G.night.progressive : null,
          litLine: st.lit && Math.sin(G.time * 8) > 0,
          t: G.time + i * 2
        });
        UI.button(ctx, 'sl:pull:' + m, x + 30, 560, 160, 44, C.ui.pull + ' · $' + GM.Slots.MACHINES[m].bet, { primary: m === 'motherlode', disabled: st.spin > 0 || G.night.cash < GM.Slots.MACHINES[m].bet });
      }
      label(ctx, C.signs.motherlodeFine, this.machineX(2) + 110, 630, 10, alpha(PAL.ivoryDim, 0.7), 'center', FONT.ui);
      drawHUD(ctx, { back: true, rules: true });
      vignette(ctx, W, H, 0.48);
    },
    action(id) {
      if (hudAction(id)) return;
      for (const [i, m] of this.machines.entries()) {
        if (id === 'sl:pull:' + m) this.pull(m, i);
      }
    }
  };
  S.register('slots', slotScene);

  // ======================================================
  // VIDEO POKER — two glasses
  // ======================================================
  const vpScene = {
    rulesKey: 'vpoker',
    enter() {
      if (G.audio) G.audio.ambient('slots');
      this.machine = 'good';
      this.hand = null; this.holds = [false, false, false, false, false];
      this.phase = 'ready';
      this.esc = Escrow();
      this.flash = null;
      G.night.flags.vpSeen = G.night.flags.vpSeen || {};
      G.night.flags.vpSeen[this.machine] = true;
    },
    startHand() {
      if (!this.esc.take(5)) return;
      this.state = GM.VideoPoker.deal(G.rng);
      this.hand = this.state.hand;
      this.holds = [false, false, false, false, false];
      this.phase = 'hold';
      this.flash = null;
      if (G.audio) G.audio.play('card');
    },
    drawCards() {
      GM.VideoPoker.drawReplace(this.state, this.holds);
      const cls = GM.VideoPoker.classify(this.hand);
      const pay = GM.VideoPoker.payout(cls, this.machine, 5);
      this.esc.settle('vpoker', pay, lim('vpoker').pace);
      this.phase = 'ready';
      if (pay > 0) {
        this.flash = cls;
        UI.money(pay - 5, W / 2, 350);
        if (G.audio) G.audio.play(pay >= 100 ? 'winBig' : 'coins');
        if (cls === 'royal') { G.chips.fountain(W / 2, 400, 30); G.bump(4); }
      } else this.flash = null;
      if (G.audio) G.audio.play('card');
      // knowing both glasses is the discovery
      const seen = G.night.flags.vpSeen || {};
      if (seen.good && seen.bad) G.learn('goodmachine');
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night.t);
      ctx.fillStyle = mix(PAL.deep, PAL.dawn1, dawn * 0.2);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = A.getCarpet(ctx);
      ctx.fillRect(0, H * 0.8, W, H * 0.2);
      lampPool(ctx, W / 2, 340, 420, dawn, 1.2);
      // machine body
      rr(ctx, W / 2 - 330, 120, 660, 520, 14);
      const mg = ctx.createLinearGradient(0, 120, 0, 640);
      mg.addColorStop(0, '#232b40'); mg.addColorStop(1, '#141a2c');
      ctx.fillStyle = mg; ctx.fill();
      ctx.strokeStyle = PAL.brass; ctx.lineWidth = 2.5; ctx.stroke();
      // the glass: paytable
      const pays = GM.VideoPoker.PAYS[this.machine];
      rr(ctx, W / 2 - 300, 142, 600, 130, 8);
      ctx.fillStyle = '#0e1a2c'; ctx.fill();
      ctx.strokeStyle = alpha(PAL.brass, 0.7); ctx.stroke();
      neon(ctx, this.machine === 'good' ? C.signs.vpGood : C.signs.vpBad, W / 2, 168, 20, this.machine === 'good' ? PAL.teal : PAL.pink, G.time, { steady: true });
      const rows = [['royal flush', pays.royal], ['straight flush', pays.sf], ['four of a kind', pays.quads], ['full house', pays.full], ['flush', pays.flush]];
      const rows2 = [['straight', pays.straight], ['three of a kind', pays.trips], ['two pair', pays.twopair], ['jacks or better', pays.jacks]];
      for (let i = 0; i < rows.length; i++) {
        label(ctx, rows[i][0], W / 2 - 280, 200 + i * 14, 11, this.flash === rows[i][0].replace(/ /g, '') ? '#ffb04f' : PAL.ivoryDim, 'left', FONT.mono);
        label(ctx, String(rows[i][1]), W / 2 - 90, 200 + i * 14, 11, PAL.ivory, 'right', FONT.mono);
      }
      for (let i = 0; i < rows2.length; i++) {
        label(ctx, rows2[i][0], W / 2 + 60, 200 + i * 14, 11, PAL.ivoryDim, 'left', FONT.mono);
        label(ctx, String(rows2[i][1]), W / 2 + 270, 200 + i * 14, 11, PAL.ivory, 'right', FONT.mono);
      }
      // scratched graffiti on the widow
      if (this.machine === 'bad') {
        ctx.save();
        ctx.translate(W / 2 + 150, 262);
        ctx.rotate(-0.04);
        label(ctx, C.signs.vpBadScratch, 0, 0, 13, alpha('#c9c2ae', 0.75), 'center', FONT.hand);
        ctx.restore();
      }
      // cards
      if (this.hand) {
        for (let i = 0; i < 5; i++) {
          const cx = W / 2 - 220 + i * 110, cy = 400;
          A.drawCard(ctx, cx, cy, 84, this.hand[i], {});
          if (this.phase === 'hold') {
            if (this.holds[i]) {
              rr(ctx, cx - 34, cy + 74, 68, 24, 4);
              ctx.fillStyle = alpha(PAL.brass, 0.9); ctx.fill();
              label(ctx, 'HELD', cx, cy + 86, 13, '#38090d', 'center', FONT.ui, 'bold');
            }
            UI.buttons.push({ id: 'vp:hold:' + i, x: cx - 44, y: cy - 62, w: 88, h: 165 });
          }
        }
      } else {
        label(ctx, 'five cards, a nickel a go', W / 2, 400, 16, alpha(PAL.ivoryDim, 0.7), 'center', FONT.display);
      }
      if (this.flash) {
        label(ctx, this.flash === 'jacks' ? 'jacks or better' : this.flash, W / 2, 512, 22, '#ffb04f', 'center', FONT.display, 'bold');
      }
      drawHUD(ctx, { back: this.phase !== 'hold', rules: true });
      if (this.phase === 'ready') {
        UI.button(ctx, 'vp:deal', W / 2 - 90, 560, 180, 48, C.ui.deal + ' · $5', { primary: true, disabled: G.night.cash < 5 });
        UI.button(ctx, 'vp:switch', W / 2 - 130, 660, 260, 40, this.machine === 'good' ? 'Try the other machine' : 'Back to the one by the door', { size: 14 });
      } else if (this.phase === 'hold') {
        UI.button(ctx, 'vp:draw', W / 2 - 90, 560, 180, 48, C.ui.draw, { primary: true });
        label(ctx, 'tap a card to hold it', W / 2, 630, 13, PAL.ivoryDim, 'center', FONT.ui);
      }
      vignette(ctx, W, H, 0.45);
    },
    action(id) {
      if (hudAction(id)) return;
      if (id === 'vp:deal') this.startHand();
      else if (id === 'vp:draw') this.drawCards();
      else if (id === 'vp:switch') {
        this.machine = this.machine === 'good' ? 'bad' : 'good';
        G.night.flags.vpSeen[this.machine] = true;
        this.hand = null; this.flash = null;
      }
      else if (id && id.startsWith('vp:hold:')) {
        const i = +id.slice(8);
        this.holds[i] = !this.holds[i];
        if (G.audio) G.audio.play('click');
      }
    }
  };
  S.register('vpoker', vpScene);

  // ======================================================
  // BACCARAT — Dot
  // ======================================================
  const bacScene = {
    rulesKey: 'baccarat',
    enter() {
      if (G.audio) G.audio.ambient('table');
      const n = G.night;
      if (!n.flags.bacShoe || GM.Baccarat.needsShuffle(n.flags.bacShoe)) n.flags.bacShoe = GM.Baccarat.newShoe(G.rng);
      this.shoe = n.flags.bacShoe;
      this.bet = BetBox('ba', 'baccarat');
      this.esc = Escrow();
      this.on = 'player'; this.phase = 'bet';
      this.result = null; this.revealT = 0;
      if (!n.flags.bacGreeted) { n.flags.bacGreeted = true; Talk.sayFrom('dotg', C.dot.greetFirst, W / 2, 200); }
    },
    deal() {
      const L = lim('baccarat');
      if (this.bet.amount < L.min) return;
      if (!this.esc.take(this.bet.amount)) return;
      this.result = GM.Baccarat.playHand(this.shoe);
      this.phase = 'reveal';
      this.revealT = 0;
      Talk.sayFrom('dotd', C.dot.deal, W / 2, 200);
      if (G.audio) { G.audio.play('card'); G.audio.play('card', 0.3); }
    },
    update(dt) {
      if (this.phase === 'reveal') {
        this.revealT += dt;
        const total = 1.8 + (this.result.player.length + this.result.banker.length - 4) * 0.7;
        if (this.revealT >= total) {
          const r = this.result;
          const pay = GM.Baccarat.payout(this.on, this.esc.held, r.outcome);
          const staked = this.esc.held;
          this.esc.settle('baccarat', pay, lim('baccarat').pace);
          const net = pay - staked;
          if (net !== 0) UI.money(net, W / 2, H * 0.45);
          if (net > 0 && G.audio) G.audio.play(net > 400 ? 'winBig' : 'winSmall');
          Talk.sayFrom('doto', r.outcome === 'tie' ? C.dot.tie : (r.outcome === 'player' ? C.dot.player : C.dot.banker), W / 2, 200);
          if (r.natural) Talk.sayFrom('dotn', C.dot.natural, W / 2, 236);
          this.phase = 'done';
        }
      }
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night.t);
      A.tableBackdrop(ctx, W, H, dawn, { felt: '#3a2434', feltDark: '#2c1a28', feltHi: '#4a2e42' });
      lampPool(ctx, W / 2, 260, 420, dawn, 1.25);
      Cast.dot(ctx, W / 2, 236, 1.0, G.time, { arm: this.phase === 'reveal' ? clamp(this.revealT, 0, 1) : 0 });
      dealerName(ctx, C.dot.name, W / 2, 92);
      feltText(ctx, 'BACCARAT · BANKER PAYS 19 TO 20', W / 2, 420, 18, 0.35);
      // bet boxes
      const boxes = [['player', 'PLAYER · 1 to 1', W / 2 - 300], ['tie', 'TIE · 8 to 1', W / 2 - 90], ['banker', 'BANKER · 19:20', W / 2 + 120]];
      for (const [id, text, bx] of boxes) {
        rr(ctx, bx, 470, 180, 64, 10);
        ctx.fillStyle = this.on === id ? 'rgba(200,170,60,0.22)' : 'rgba(0,0,0,0.25)';
        ctx.fill();
        ctx.strokeStyle = this.on === id ? PAL.brassHi : alpha('#e8e0c8', 0.4);
        ctx.lineWidth = this.on === id ? 2.5 : 1.5; ctx.stroke();
        label(ctx, text, bx + 90, 502, 14, alpha('#e8e0c8', 0.8), 'center', FONT.display, 'bold');
        UI.buttons.push({ id: 'ba:on:' + id, x: bx, y: 470, w: 180, h: 64 });
        if (this.on === id && this.esc.held > 0) A.drawChipStack(ctx, bx + 90, 552, this.esc.held, 11, bx | 0);
      }
      // cards — the slow tableau
      if (this.result) {
        const r = this.result;
        const showN = Math.floor(this.revealT / 0.7) + 2;
        let drawn = 0;
        for (let i = 0; i < r.player.length; i++) {
          const flip = clamp((this.revealT - i * 0.7) * 2.2, 0, 1);
          A.drawCard(ctx, W / 2 - 200 + i * 56, 330, 60, r.player[i], { flip, rot: -0.04 });
          drawn++;
        }
        for (let i = 0; i < r.banker.length; i++) {
          const flip = clamp((this.revealT - (i + 0.35) * 0.7) * 2.2, 0, 1);
          A.drawCard(ctx, W / 2 + 90 + i * 56, 330, 60, r.banker[i], { flip, rot: 0.04 });
        }
        label(ctx, 'PLAYER', W / 2 - 160, 262, 13, PAL.ivoryDim, 'center', FONT.ui, 'bold');
        label(ctx, 'BANKER', W / 2 + 150, 262, 13, PAL.ivoryDim, 'center', FONT.ui, 'bold');
        if (this.phase === 'done') {
          label(ctx, String(r.pt), W / 2 - 160, 400, 26, r.outcome === 'player' ? PAL.brassHi : PAL.ivoryDim, 'center', FONT.display, 'bold');
          label(ctx, String(r.bt), W / 2 + 150, 400, 26, r.outcome === 'banker' ? PAL.brassHi : PAL.ivoryDim, 'center', FONT.display, 'bold');
        }
      }
      drawHUD(ctx, { back: this.phase !== 'reveal', rules: true });
      if (this.phase === 'bet' || this.phase === 'done') {
        this.bet.draw(ctx, W / 2 - 240, H - 70);
        UI.button(ctx, 'ba:deal', W / 2 + 130, H - 92, 180, 48, C.ui.deal, { primary: true, disabled: this.bet.amount < lim('baccarat').min });
      }
      vignette(ctx, W, H, 0.44);
    },
    action(id) {
      if (hudAction(id)) return;
      if (this.bet.action(id)) return;
      if (id === 'ba:deal') this.deal();
      else if (id && id.startsWith('ba:on:') && this.phase !== 'reveal') this.on = id.slice(6);
    }
  };
  S.register('baccarat', bacScene);

  // ======================================================
  // THREE-CARD — Marla
  // ======================================================
  const tcScene = {
    rulesKey: 'threecard',
    enter() {
      if (G.audio) G.audio.ambient('table');
      this.bet = BetBox('tc', 'threecard');
      this.pp = 0;
      this.esc = Escrow();
      this.phase = 'bet';
      this.ph = null; this.dh = null;
      if (!G.night.flags.tcGreeted) { G.night.flags.tcGreeted = true; Talk.sayFrom('marg', C.marla.greetFirst, W / 2, 200); }
      else Talk.sayFrom('marg2', C.marla.greet, W / 2, 200);
    },
    deal() {
      const L = lim('threecard');
      if (this.bet.amount < L.min) return;
      const total = this.bet.amount + this.pp;
      if (total > G.night.cash) return;
      this.esc.take(total);
      const deck = G.rng.shuffle(GM.makeDeck());
      this.ph = deck.slice(0, 3); this.dh = deck.slice(3, 6);
      this.phase = 'decide';
      if (G.audio) G.audio.play('card');
    },
    finish(played) {
      if (played && !this.esc.take(this.bet.amount)) played = false; // can't cover the play bet: forced fold
      const res = GM.ThreeCard.settle(this.ph, this.dh, this.bet.amount, played, this.pp);
      const staked = this.esc.held;
      this.esc.settle('threecard', res.returned, lim('threecard').pace);
      const net = res.returned - staked;
      this.phase = 'done';
      this.revealed = true;
      if (net !== 0) UI.money(net, W / 2, H * 0.45);
      const pr = GM.ThreeCard.rank(this.ph);
      if (res.ev.indexOf('fold') >= 0) Talk.sayFrom('marf', C.marla.fold, W / 2, 200);
      else if (pr.cls === 5) { Talk.sayFrom('marsf', C.marla.straightFlush, W / 2, 200); if (G.audio) G.audio.play('winBig'); }
      else if (res.ev.indexOf('noqualify') >= 0) Talk.sayFrom('marnq', C.marla.noQualify, W / 2, 200);
      else if (res.ev.indexOf('win') >= 0) { Talk.sayFrom('marw', C.marla.win, W / 2, 200); if (G.audio) G.audio.play(net > 300 ? 'winBig' : 'winSmall'); }
      else if (res.ev.indexOf('lose') >= 0) {
        const dr = GM.ThreeCard.rank(this.dh);
        if (dr.cls === 3 && pr.cls === 2) Talk.say(C.marla.straightBeatsFlush, W / 2, 200);
        else Talk.sayFrom('marl', C.marla.lose, W / 2, 200);
      }
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night.t);
      A.tableBackdrop(ctx, W, H, dawn);
      lampPool(ctx, W / 2, 260, 420, dawn, 1.25);
      Cast.marla(ctx, W / 2, 236, 1.0, G.time, { arm: this.phase === 'decide' ? 0.4 : 0 });
      dealerName(ctx, C.marla.name, W / 2, 92);
      feltText(ctx, 'THREE CARD · ANTE & PLAY · PAIR PLUS', W / 2, 430, 17, 0.35);
      feltText(ctx, 'dealer plays with queen high', W / 2, 458, 12, 0.28);
      // dealer cards
      if (this.dh) {
        for (let i = 0; i < 3; i++) {
          A.drawCard(ctx, W / 2 - 60 + i * 60, 320, 58, this.dh[i], { flip: this.revealed ? 1 : 0, rot: (i - 1) * 0.05 });
        }
      }
      // player cards
      if (this.ph) {
        for (let i = 0; i < 3; i++) {
          A.drawCard(ctx, W / 2 - 66 + i * 66, 545, 66, this.ph[i], { rot: (i - 1) * 0.04 });
        }
      }
      drawHUD(ctx, { back: this.phase !== 'decide', rules: true });
      if (this.phase === 'bet' || this.phase === 'done') {
        this.bet.draw(ctx, W / 2 - 300, H - 70);
        // pair plus toggle
        UI.button(ctx, 'tc:pp', W / 2 + 60, H - 92, 150, 40, 'Pair plus ' + (this.pp > 0 ? E.dollars(this.pp) : '—'), { size: 13 });
        UI.button(ctx, 'tc:ante', W / 2 + 230, H - 92, 140, 48, C.ui.ante, { primary: true, disabled: this.bet.amount < lim('threecard').min || this.bet.amount + this.pp > G.night.cash });
      } else if (this.phase === 'decide') {
        UI.button(ctx, 'tc:play', W / 2 - 160, H - 100, 150, 48, C.ui.play + ' · ' + E.dollars(this.bet.amount), { primary: true, disabled: this.bet.amount > G.night.cash });
        UI.button(ctx, 'tc:fold', W / 2 + 10, H - 100, 150, 48, C.ui.fold, {});
      }
      vignette(ctx, W, H, 0.44);
    },
    action(id) {
      if (hudAction(id)) return;
      if (this.phase === 'bet' || this.phase === 'done') {
        if (this.bet.action(id)) return;
      }
      if (id === 'tc:pp') { this.pp = this.pp >= 100 ? 0 : (this.pp === 0 ? 25 : this.pp * 2); }
      else if (id === 'tc:ante') { this.revealed = false; this.deal(); }
      else if (id === 'tc:play') this.finish(true);
      else if (id === 'tc:fold') { this.revealed = true; this.finish(false); }
    }
  };
  S.register('threecard', tcScene);

  // ======================================================
  // HI-LO — Len's ladder
  // ======================================================
  const hiloScene = {
    rulesKey: 'hilo',
    enter() {
      if (G.audio) G.audio.ambient('bar');
      this.bet = BetBox('hl', 'hilo');
      this.esc = Escrow();
      this.run = null;
      this.phase = 'stake';
      this.lastFlip = null;
      if (!G.night.flags.hlGreeted) {
        G.night.flags.hlGreeted = true;
        Dialog.show(C.len.greetFirst.map(text => ({ who: 'len', name: 'LEN', text })));
      } else Talk.sayFrom('leng', C.len.greet, W * 0.32, 250);
    },
    start() {
      const L = lim('hilo');
      if (this.bet.amount < L.min) return;
      if (!this.esc.take(this.bet.amount)) return;
      this.run = GM.HiLo.newRun(G.rng, this.bet.amount);
      this.phase = 'run';
      if (G.audio) G.audio.play('card');
    },
    guess(dir) {
      const res = GM.HiLo.guess(this.run, G.rng, dir);
      this.lastFlip = { card: { r: res.next, s: G.rng.int(4) }, t: 0 };
      if (G.audio) G.audio.play('card');
      if (res.outcome === 'lose' || res.outcome === 'tie') {
        this.esc.settle('hilo', 0, lim('hilo').pace);
        this.phase = 'dead';
        Talk.sayFrom('lenl', res.outcome === 'tie' ? C.len.tie : C.len.lose, W * 0.32, 250);
      } else {
        Talk.sayFrom('lenw', C.len.win, W * 0.32, 250);
      }
    },
    cashout() {
      const out = GM.HiLo.cashout(this.run);
      this.esc.settle('hilo', out, lim('hilo').pace);
      UI.money(out - this.run.stake, W / 2, H * 0.4);
      if (G.audio) G.audio.play(out > this.run.stake * 3 ? 'winBig' : 'winSmall');
      Talk.sayFrom('lenc', C.len.cashout, W * 0.32, 250);
      this.phase = 'stake';
      this.run = null;
    },
    update(dt) { if (this.lastFlip) { this.lastFlip.t += dt; } },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night.t);
      // the bar back
      ctx.fillStyle = mix('#170f0a', PAL.dawn1, dawn * 0.15);
      ctx.fillRect(0, 0, W, H);
      // shelves and bottles
      for (let sh = 0; sh < 2; sh++) {
        ctx.fillStyle = PAL.woodDark;
        ctx.fillRect(80, 150 + sh * 110, W - 160, 12);
        for (let i = 0; i < 16; i++) {
          const bx = 120 + i * 68, bh = 42 + ((i * 7 + sh * 3) % 4) * 9;
          ctx.fillStyle = ['#3a5a3a88', '#5a3a2a88', '#3a3a5a88', '#6a5a2a88'][(i + sh) % 4];
          rr(ctx, bx, 150 + sh * 110 - bh, 16, bh, 4);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,236,190,0.12)';
          ctx.fillRect(bx + 3, 150 + sh * 110 - bh + 4, 3, bh - 8);
        }
      }
      lampPool(ctx, W * 0.32, 300, 300, dawn, 1.3);
      lampPool(ctx, W * 0.66, 420, 340, dawn, 1);
      Cast.len(ctx, W * 0.32, 330, 1.05, G.time, {});
      dealerName(ctx, C.len.name, W * 0.32, 168);
      // bar top
      ctx.fillStyle = PAL.wood;
      ctx.fillRect(0, 380, W, 44);
      const wg = ctx.createLinearGradient(0, 380, 0, 424);
      wg.addColorStop(0, 'rgba(255,236,190,0.14)'); wg.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = wg;
      ctx.fillRect(0, 380, W, 44);
      // the run
      if (this.run) {
        A.drawCard(ctx, W * 0.62, 300, 96, { r: this.run.card, s: 1 }, {});
        const o = GM.HiLo.odds(this.run.card);
        if (this.phase === 'run') {
          label(ctx, 'higher pays ×' + o.mH.toFixed(2), W * 0.62 + 160, 260, 16, o.pH > 0.5 ? PAL.teal : PAL.ivory, 'left', FONT.ui);
          if (o.pL > 0) label(ctx, 'lower pays ×' + o.mL.toFixed(2), W * 0.62 + 160, 292, 16, o.pL > 0.5 ? PAL.teal : PAL.ivory, 'left', FONT.ui);
          else label(ctx, 'lower is off the menu', W * 0.62 + 160, 292, 14, PAL.ivoryDim, 'left', FONT.ui);
        }
        // the pot
        const pot = Math.round(this.run.stake * this.run.mult);
        label(ctx, E.dollars(pot), W * 0.62, 470, 30, this.run.dead ? PAL.redHi : PAL.brassHi, 'center', FONT.display, 'bold');
        label(ctx, this.run.rungs + (this.run.rungs === 1 ? ' rung up' : ' rungs up'), W * 0.62, 500, 14, PAL.ivoryDim, 'center', FONT.ui);
        if (this.lastFlip && this.lastFlip.t < 1.4) {
          A.drawCard(ctx, W * 0.62 + 130, 380, 66, this.lastFlip.card, { flip: clamp(this.lastFlip.t * 2.4, 0, 1) });
        }
      } else {
        label(ctx, 'a clean game — ask Len', W * 0.62, 310, 17, alpha(PAL.ivoryDim, 0.8), 'center', FONT.display);
      }
      drawHUD(ctx, { back: this.phase !== 'run', rules: true });
      if (this.phase === 'stake' || this.phase === 'dead') {
        this.bet.draw(ctx, W / 2 - 240, H - 70);
        UI.button(ctx, 'hl:start', W / 2 + 130, H - 92, 180, 48, C.ui.bet, { primary: true, disabled: this.bet.amount < lim('hilo').min });
      } else if (this.phase === 'run') {
        UI.button(ctx, 'hl:high', W / 2 - 260, H - 100, 150, 48, C.ui.higher, { primary: true });
        const o = GM.HiLo.odds(this.run.card);
        UI.button(ctx, 'hl:low', W / 2 - 90, H - 100, 150, 48, C.ui.lower, { primary: true, disabled: o.pL <= 0 });
        UI.button(ctx, 'hl:take', W / 2 + 90, H - 100, 170, 48, C.ui.takeIt + ' · ' + E.dollars(Math.round(this.run.stake * this.run.mult)), { disabled: this.run.rungs === 0 });
      }
      vignette(ctx, W, H, 0.46);
    },
    action(id) {
      if (hudAction(id)) return;
      if (this.bet.action(id)) return;
      if (id === 'hl:start') this.start();
      else if (id === 'hl:high') this.guess('high');
      else if (id === 'hl:low') this.guess('low');
      else if (id === 'hl:take') this.cashout();
    }
  };
  S.register('hilo', hiloScene);

  // ======================================================
  // KENO — the lounge
  // ======================================================
  const kenoScene = {
    rulesKey: 'keno',
    enter() {
      if (G.audio) G.audio.ambient('lounge');
      this.picks = [];
      this.betAmt = 5;
      this.esc = Escrow();
      this.phase = 'pick';
      this.drawn = []; this.drawT = 0; this.result = null;
      if (!G.night.flags.keGreeted) { G.night.flags.keGreeted = true; Talk.sayFrom('corg', C.coral.greetFirst, W * 0.7, 200); }
    },
    cellAt(x, y) {
      const gx = Math.floor((x - 80) / 44), gy = Math.floor((y - 150) / 44);
      if (gx < 0 || gx > 9 || gy < 0 || gy > 7) return 0;
      return gy * 10 + gx + 1;
    },
    play() {
      if (!this.picks.length) return;
      if (!this.esc.take(this.betAmt)) return;
      this.phase = 'draw';
      this.drawn = GM.Keno.drawBalls(G.rng);
      this.drawT = 0;
      G.night.flags.keTickets = (G.night.flags.keTickets || 0) + 1;
    },
    update(dt) {
      if (this.phase === 'draw') {
        const prev = Math.floor(this.drawT / 0.16);
        this.drawT += dt;
        const now = Math.min(20, Math.floor(this.drawT / 0.16));
        if (now > prev && G.audio) G.audio.play('pop');
        if (this.drawT >= 20 * 0.16 + 0.5) {
          this.result = GM.Keno.settle(this.picks, this.drawn, this.betAmt);
          this.esc.settle('keno', this.result.returned, lim('keno').pace);
          const net = this.result.returned - this.betAmt;
          if (net !== 0) UI.money(net, W * 0.35, H * 0.4);
          if (this.result.returned > 0) {
            Talk.sayFrom('corw', this.result.returned >= this.betAmt * 50 ? C.coral.bigWin : C.coral.win, W * 0.7, 200);
            if (G.audio) G.audio.play(this.result.returned >= this.betAmt * 20 ? 'winBig' : 'winSmall');
          } else Talk.sayFrom('corl', C.coral.lose, W * 0.7, 200);
          this.phase = 'done';
          if ((G.night.flags.keTickets || 0) >= 5) G.learn('keno');
        }
      }
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night.t);
      // the lounge: darker, plusher
      ctx.fillStyle = mix('#120a14', PAL.dawn1, dawn * 0.15);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = A.getCarpet(ctx);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      lampPool(ctx, W * 0.35, 320, 380, dawn, 1.1);
      lampPool(ctx, W * 0.78, 350, 300, dawn, 1.2);
      Cast.coral(ctx, W * 0.78, 330, 1.0, G.time, {});
      dealerName(ctx, C.coral.name, W * 0.78, 172);
      // the big board
      const drawnN = this.phase === 'draw' ? Math.min(20, Math.floor(this.drawT / 0.16)) : (this.phase === 'done' ? 20 : 0);
      const litSet = new Set(this.drawn.slice(0, drawnN));
      for (let i = 1; i <= 80; i++) {
        const gx = (i - 1) % 10, gy = Math.floor((i - 1) / 10);
        const cx = 80 + gx * 44, cy = 150 + gy * 44;
        const picked = this.picks.indexOf(i) >= 0;
        const lit = litSet.has(i);
        rr(ctx, cx, cy, 40, 40, 6);
        ctx.fillStyle = lit && picked ? '#b8912a' : lit ? 'rgba(255,176,79,0.28)' : picked ? 'rgba(55,200,180,0.25)' : 'rgba(20,16,26,0.85)';
        ctx.fill();
        ctx.strokeStyle = picked ? PAL.teal : alpha(PAL.brass, 0.3);
        ctx.lineWidth = picked ? 2 : 1;
        ctx.stroke();
        label(ctx, String(i), cx + 20, cy + 21, 14, lit && picked ? '#38090d' : lit ? '#ffb04f' : picked ? PAL.teal : PAL.ivoryDim, 'center', FONT.mono, lit || picked ? 'bold' : '');
      }
      label(ctx, 'mark up to ten · ' + this.picks.length + ' marked', 300, 128, 13, PAL.ivoryDim, 'center', FONT.ui);
      // paytable for current pick count
      if (this.picks.length) {
        const table = GM.Keno.PAYS[this.picks.length] || {};
        rr(ctx, 560, 150, 150, 260, 8);
        ctx.fillStyle = 'rgba(8,10,14,0.85)'; ctx.fill();
        ctx.strokeStyle = alpha(PAL.brass, 0.5); ctx.stroke();
        label(ctx, 'catch · pays', 635, 172, 12, PAL.ivoryDim, 'center', FONT.ui, 'bold');
        let yy = 198;
        for (const h in table) {
          label(ctx, h + '  ·  ' + table[h] + 'x', 635, yy, 14, PAL.ivory, 'center', FONT.mono);
          yy += 26;
        }
      }
      if (this.result && this.phase === 'done') {
        label(ctx, this.result.hits + ' of ' + this.picks.length + (this.result.returned > 0 ? ' — pays ' + E.dollars(this.result.returned) : ''), 300, 520, 19, this.result.returned > 0 ? PAL.brassHi : PAL.ivoryDim, 'center', FONT.display, 'bold');
      }
      drawHUD(ctx, { back: this.phase !== 'draw', rules: true });
      // bet + play
      UI.button(ctx, 'ke:bet', 90, H - 92, 130, 44, 'Ticket ' + E.dollars(this.betAmt), { size: 14 });
      UI.button(ctx, 'ke:play', 240, H - 96, 190, 50, C.ui.ticket, { primary: true, disabled: !this.picks.length || G.night.cash < this.betAmt || this.phase === 'draw' });
      UI.button(ctx, 'ke:wipe', 450, H - 92, 120, 44, C.ui.clear, { size: 13, disabled: !this.picks.length || this.phase === 'draw' });
      vignette(ctx, W, H, 0.5);
    },
    pointer(type, x, y) {
      if (type !== 'down' || this.phase === 'draw') return;
      const n = this.cellAt(x, y);
      if (n >= 1 && n <= 80) {
        if (this.phase === 'done') { this.phase = 'pick'; this.result = null; this.drawn = []; }
        const i = this.picks.indexOf(n);
        if (i >= 0) this.picks.splice(i, 1);
        else if (this.picks.length < 10) this.picks.push(n);
        if (G.audio) G.audio.play('click');
      }
    },
    action(id) {
      if (hudAction(id)) return;
      if (id === 'ke:bet') { this.betAmt = this.betAmt >= 20 ? 1 : this.betAmt * (this.betAmt === 1 ? 5 : 2); }
      else if (id === 'ke:play') { if (this.phase === 'done') { this.result = null; } this.play(); }
      else if (id === 'ke:wipe') { this.picks = []; this.result = null; this.phase = 'pick'; }
    }
  };
  S.register('keno', kenoScene);

  // ======================================================
  // BIG SIX — the loudest wheel
  // ======================================================
  const b6Scene = {
    rulesKey: 'bigsix',
    enter() {
      if (G.audio) G.audio.ambient('table');
      this.bet = BetBox('b6', 'bigsix');
      this.esc = Escrow();
      this.bets = {}; // betOn -> amt
      this.rot = 0; this.vel = 0.4;
      this.phase = 'bet';
      this.spinT = 0; this.resultIdx = -1;
      this.tickAcc = 0;
    },
    spin() {
      if (!Object.keys(this.bets).length) return;
      this.phase = 'spin';
      this.resultIdx = GM.BigSix.spin(G.rng);
      // land: target rotation puts resultIdx at the top clacker (angle -PI/2)
      const segA = TAU / 54;
      const target = -Math.PI / 2 - (this.resultIdx * segA);
      const turns = 4 + Math.floor(G.rng() * 2);
      this.spinFrom = this.rot % TAU;
      this.spinTo = target - turns * TAU;
      this.spinT = 0;
      Talk.sayFrom('vb6', C.vern.bigsix, W * 0.3, 200);
    },
    update(dt) {
      if (this.phase === 'spin') {
        this.spinT += dt;
        const T = 4.6;
        const k = clamp(this.spinT / T, 0, 1);
        const eased = 1 - Math.pow(1 - k, 3);
        const prev = this.rot;
        this.rot = lerp(this.spinFrom, this.spinTo, eased);
        // clacker ticks on peg crossings
        const segA = TAU / 54;
        if (Math.floor(prev / segA) !== Math.floor(this.rot / segA) && G.audio) G.audio.play('tick');
        if (k >= 1) this.settle();
      } else {
        this.rot += this.vel * dt * 0.2;
      }
    },
    settle() {
      let returned = 0;
      const seg = GM.BigSix.SEGMENTS[this.resultIdx];
      for (const on in this.bets) {
        returned += GM.BigSix.settle(on, this.bets[on], this.resultIdx);
      }
      const staked = this.esc.held;
      this.esc.settle('bigsix', returned, lim('bigsix').pace);
      const net = returned - staked;
      if (net !== 0) UI.money(net, W * 0.3, H * 0.4);
      if (net > 0 && G.audio) G.audio.play(seg === 'joker' || seg === 'crest' ? 'jackpot' : 'winSmall');
      if ((seg === 'joker' || seg === 'crest') && returned > 0) G.chips.fountain(W * 0.3, 400, 20);
      Talk.sayFrom(net > 0 ? 'vw6' : 'vl6', net > 0 ? C.vern.win : C.vern.lose, W * 0.3, 200);
      this.bets = {};
      this.phase = 'bet';
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night.t);
      A.tableBackdrop(ctx, W, H, dawn);
      lampPool(ctx, W * 0.3, 300, 360, dawn, 1.3);
      A.drawBigSix(ctx, W * 0.3, 320, 210, this.rot);
      Cast.vern(ctx, W * 0.68, 300, 0.9, G.time, {});
      dealerName(ctx, C.vern.name, W * 0.68, 172);
      if (this.phase === 'bet' && this.resultIdx >= 0) {
        const seg = GM.BigSix.SEGMENTS[this.resultIdx];
        label(ctx, seg === 'joker' ? 'JOKER' : seg === 'crest' ? 'THE CREST' : '$' + seg, W * 0.3, 580, 26, PAL.brassHi, 'center', FONT.display, 'bold');
      }
      // bet spots
      const spots = [['1', 'even money'], ['2', '2 to 1'], ['5', '5 to 1'], ['10', '10 to 1'], ['20', '20 to 1'], ['joker', '40 to 1'], ['crest', '40 to 1']];
      for (let i = 0; i < spots.length; i++) {
        const bx = W * 0.55 + (i % 4) * 130, by = 430 + Math.floor(i / 4) * 110;
        const id = spots[i][0];
        rr(ctx, bx, by, 116, 92, 8);
        ctx.fillStyle = 'rgba(10,40,28,0.55)'; ctx.fill();
        ctx.strokeStyle = alpha('#e8e0c8', 0.5); ctx.lineWidth = 1.5; ctx.stroke();
        label(ctx, id === 'joker' ? '★ JOKER' : id === 'crest' ? 'G · CREST' : '$' + id, bx + 58, by + 28, 17, PAL.ivory, 'center', FONT.display, 'bold');
        label(ctx, spots[i][1], bx + 58, by + 50, 11, PAL.ivoryDim, 'center', FONT.ui);
        UI.buttons.push({ id: 'b6:on:' + id, x: bx, y: by, w: 116, h: 92 });
        if (this.bets[id]) A.drawChipStack(ctx, bx + 58, by + 82, this.bets[id], 9, bx | 0);
      }
      drawHUD(ctx, { back: this.phase === 'bet', rules: true });
      this.bet.draw(ctx, 150, H - 60, { noAmount: true });
      UI.button(ctx, 'b6:spin', W - 320, H - 78, 150, 48, C.ui.spin, { primary: true, disabled: this.phase !== 'bet' || !Object.keys(this.bets).length });
      vignette(ctx, W, H, 0.44);
    },
    action(id) {
      if (hudAction(id)) return;
      if (this.bet.action(id)) return;
      if (id === 'b6:spin') this.spin();
      else if (id && id.startsWith('b6:on:') && this.phase === 'bet') {
        const on = id.slice(6);
        const L = lim('bigsix');
        const cur = this.bets[on] || 0;
        if (cur + this.bet.denom > L.max) return;
        if (this.esc.take(this.bet.denom)) this.bets[on] = cur + this.bet.denom;
      }
    }
  };
  S.register('bigsix', b6Scene);

  // ======================================================
  // THE SIMULCAST — horses, Fingers, the board
  // ======================================================
  const horseScene = {
    rulesKey: 'horses',
    enter() {
      if (G.audio) G.audio.ambient('parlor');
      const n = G.night;
      if (!n.flags.race || n.flags.race.ran) this.newRace();
      else this.race = n.flags.race;
      this.bet = BetBox('ho', 'horses');
      this.esc = Escrow();
      this.pick = -1;
      this.phase = 'bet'; // bet | run | done
      this.tip = null;
      this.raceT = 0;
      if (!n.flags.hoGreeted) {
        n.flags.hoGreeted = true;
        Dialog.show(C.fingers.greetFirst.map(text => ({ who: 'fingers', name: 'FINGERS', text })));
      }
    },
    newRace() {
      const n = G.night;
      n.flags.race = GM.Horses.newRace(G.rng);
      n.flags.raceNames = [];
      const used = new Set(n.flags.usedNames || []);
      for (let i = 0; i < 6; i++) {
        let nm;
        let guard = 0;
        do { nm = C.horseNames[G.rng.int(C.horseNames.length)]; guard++; } while (used.has(nm) && guard < 40);
        used.add(nm);
        n.flags.raceNames.push(nm);
      }
      n.flags.usedNames = Array.from(used).slice(-18);
      this.race = n.flags.race;
      this.tip = null;
    },
    silks(i) { return ['#b3323a', '#2b6bb3', '#2b8a4a', '#b8912a', '#6b4a8e', '#17171c'][i]; },
    oddsLabel(o) {
      if (o >= 1) return (Math.round(o * 2) / 2) + '-1';
      return Math.round(1 / o) === 5 ? '1-5' : (o === 0.4 ? '2-5' : o === 0.6 ? '3-5' : o === 0.8 ? '4-5' : o + '-1');
    },
    buyTip() {
      if (G.night.cash < GM.Horses.TOUT_FEE) {
        Talk.sayFrom('fbr', C.fingers.broke, W * 0.8, 240);
        return;
      }
      G.night.cash -= GM.Horses.TOUT_FEE;
      E.recordBet(G.night, 'horses', GM.Horses.TOUT_FEE, 0);
      this.tip = GM.Horses.tout(this.race, G.rng);
      G.learn('fingers');
      const nm = G.night.flags.raceNames[this.tip.pick];
      Dialog.show([
        { who: 'fingers', name: 'FINGERS', text: C.fingers.tip(nm) },
        { who: 'fingers', name: 'FINGERS', text: C.fingers.sold[0] }
      ]);
    },
    post() {
      if (this.pick < 0) return;
      if (this.bet.amount < lim('horses').min) return;
      if (!this.esc.take(this.bet.amount)) return;
      this.phase = 'run';
      this.raceT = 0;
      GM.Horses.run(this.race, G.rng);
      // rig the running order: winner finishes first; others by strength with noise
      const T = 8.2;
      this.finish = this.race.truePs.map((p, i) => {
        let ft = T * (1 + (0.5 - p) * 0.22 + (G.rng() - 0.5) * 0.06);
        return { i, ft };
      });
      const wIdx = this.race.winner;
      const minFt = Math.min.apply(null, this.finish.map(f => f.ft));
      this.finish[wIdx].ft = minFt - 0.12;
      this.raceDur = this.finish[wIdx].ft;
      // mid-race drama: each horse gets surge phases
      this.surge = this.race.truePs.map(() => ({ a: G.rng() * TAU, f: 0.5 + G.rng() * 1.2 }));
      Talk.sayFrom('foff', C.fingers.raceOff, W / 2, 210);
      if (G.audio) { G.audio.play('trumpet'); G.audio.play('hooves'); }
    },
    horseX(i) {
      const f = this.finish[i];
      const k = clamp(this.raceT / f.ft, 0, 1);
      const drama = Math.sin(this.raceT * this.surge[i].f + this.surge[i].a) * 26 * Math.sin(k * Math.PI);
      return 90 + (W - 260) * ease(k) + drama * (k < 0.92 ? 1 : (1 - k) * 12);
    },
    update(dt) {
      if (this.phase === 'run') {
        this.raceT += dt;
        if (this.raceT >= this.raceDur + 0.8) {
          const pay = GM.Horses.settleWin(this.race, this.pick, this.esc.held);
          const staked = this.esc.held;
          this.esc.settle('horses', pay, lim('horses').pace);
          const net = pay - staked;
          if (net !== 0) UI.money(net, W / 2, H * 0.4);
          if (net > 0 && G.audio) G.audio.play(net > 1000 ? 'jackpot' : 'winBig');
          if (net > 2000) G.chips.fountain(W / 2, 400, 18);
          this.phase = 'done';
        }
      }
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night.t);
      // parlor: dark wood, tote glow
      ctx.fillStyle = mix('#14100c', PAL.dawn1, dawn * 0.12);
      ctx.fillRect(0, 0, W, H);
      lampPool(ctx, W / 2, 200, 460, dawn, 1);
      label(ctx, C.signs.simulcastBoard, W / 2, 92, 15, '#ffb04f', 'center', FONT.mono, 'bold');
      if (this.phase === 'bet' || this.phase === 'done') {
        // tote board
        rr(ctx, 120, 110, W - 420, 320, 10);
        ctx.fillStyle = 'rgba(6,8,12,0.92)'; ctx.fill();
        ctx.strokeStyle = PAL.brass; ctx.lineWidth = 2; ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const ry = 140 + i * 48;
          const sel = this.pick === i;
          if (sel) {
            rr(ctx, 134, ry - 18, W - 448, 40, 6);
            ctx.fillStyle = 'rgba(200,170,60,0.16)'; ctx.fill();
          }
          // silks chip
          rr(ctx, 146, ry - 12, 26, 26, 4);
          ctx.fillStyle = this.silks(i); ctx.fill();
          ctx.strokeStyle = '#e8e0c8'; ctx.lineWidth = 1; ctx.stroke();
          label(ctx, String(i + 1), 159, ry + 2, 14, i === 5 ? PAL.ivory : '#111', 'center', FONT.ui, 'bold');
          label(ctx, G.night.flags.raceNames[i], 190, ry + 1, 17, this.tip && this.tip.pick === i ? PAL.brassHi : PAL.ivory, 'left', FONT.display);
          label(ctx, this.oddsLabel(this.race.posted[i]), W - 360, ry + 1, 17, '#ffb04f', 'right', FONT.mono, 'bold');
          UI.buttons.push({ id: 'ho:pick:' + i, x: 134, y: ry - 18, w: W - 448, h: 40 });
          if (this.phase === 'done' && this.race.winner === i) {
            label(ctx, 'WON', W - 440, ry + 1, 13, PAL.teal, 'right', FONT.ui, 'bold');
          }
        }
        // Fingers in his corner
        Cast.fingers(ctx, W - 160, 400, 0.92, G.time, {});
        dealerName(ctx, C.fingers.name, W - 160, 262);
        if (this.phase === 'bet') {
          UI.button(ctx, 'ho:tip', W - 260, 430, 200, 44, this.tip ? 'He already told you' : C.ui.buyTip, { size: 14, disabled: !!this.tip });
        }
      } else {
        // THE RACE — six lanes of silhouette and dirt
        const ty = 150;
        ctx.fillStyle = '#2c3e2c';
        ctx.fillRect(0, ty - 30, W, 30); // infield rail hedge
        ctx.fillStyle = '#4a3a28';
        ctx.fillRect(0, ty, W, 320);
        ctx.strokeStyle = alpha('#e8e0c8', 0.25);
        for (let i = 0; i <= 6; i++) {
          ctx.beginPath(); ctx.moveTo(0, ty + i * 52); ctx.lineTo(W, ty + i * 52); ctx.stroke();
        }
        // furlong poles
        for (let p = 0; p < 6; p++) {
          const px = 120 + p * (W - 240) / 5;
          ctx.fillStyle = p === 5 ? PAL.redHi : '#e8e0c8';
          ctx.fillRect(px, ty - 26, 4, 26);
        }
        // finish
        ctx.fillStyle = alpha('#e8e0c8', 0.5);
        for (let sq = 0; sq < 16; sq++) ctx.fillRect(W - 150, ty + sq * 20, 6, 10);
        for (let i = 0; i < 6; i++) {
          this.drawHorse(ctx, this.horseX(i), ty + 26 + i * 52, i);
        }
        label(ctx, G.night.flags.raceNames[this.pick] + ' carries ' + E.dollars(this.esc.held), W / 2, 520, 15, PAL.ivoryDim, 'center', FONT.ui);
      }
      drawHUD(ctx, { back: this.phase !== 'run', rules: true });
      if (this.phase === 'bet') {
        this.bet.draw(ctx, W / 2 - 300, H - 70);
        UI.button(ctx, 'ho:post', W / 2 + 140, H - 92, 190, 50, C.ui.postTime, { primary: true, disabled: this.pick < 0 || this.bet.amount < lim('horses').min });
      } else if (this.phase === 'done') {
        UI.button(ctx, 'ho:next', W / 2 - 90, H - 92, 180, 46, 'Next race', { primary: true });
      }
      vignette(ctx, W, H, 0.5);
    },
    drawHorse(ctx, x, y, i) {
      ctx.save();
      ctx.translate(x, y);
      const running = this.phase === 'run' && this.raceT < this.finish[i].ft;
      const ph = running ? Math.floor((this.raceT * 11 + i * 2) % 4) : 0;
      // horse silhouette, discrete gallop frames — snap, don't slide
      ctx.fillStyle = '#241a12';
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 11, 0, 0, TAU); // body
      ctx.fill();
      // neck+head
      poly(ctx, [[18, -6], [30, -18], [36, -14], [26, -2]]);
      ctx.fill();
      ctx.beginPath(); ctx.ellipse(33, -16, 6, 3.6, -0.5, 0, TAU); ctx.fill();
      // tail
      poly(ctx, [[-24, -6], [-34, -2 + (ph % 2) * 3], [-26, 2]]);
      ctx.fill();
      // legs, 4 frames
      const L = [
        [[-14, 0, -20, 16], [-8, 0, -4, 16], [10, 0, 6, 16], [16, 0, 22, 16]],
        [[-14, 0, -10, 16], [-8, 0, -14, 15], [10, 0, 16, 15], [16, 0, 12, 16]],
        [[-14, 0, -6, 15], [-8, 0, -12, 16], [10, 0, 18, 16], [16, 0, 8, 15]],
        [[-14, 0, -18, 15], [-8, 0, -2, 15], [10, 0, 4, 15], [16, 0, 20, 15]]
      ][ph];
      ctx.strokeStyle = '#241a12'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      for (const [x1, y1, x2, y2] of L) {
        ctx.beginPath(); ctx.moveTo(x1, y1 + 6); ctx.lineTo(x2, y2); ctx.stroke();
      }
      // jockey in silks
      ctx.fillStyle = this.silks(i);
      ctx.beginPath(); ctx.ellipse(2, -14, 7, 8, -0.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(7, -21, 4, 0, TAU); ctx.fill();
      // dust
      if (running && Math.random() < 0.3) {
        ctx.fillStyle = 'rgba(120,100,70,0.25)';
        ctx.beginPath(); ctx.arc(-30 - Math.random() * 10, 8 + Math.random() * 6, 3 + Math.random() * 4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
    action(id) {
      if (hudAction(id)) return;
      if (this.phase === 'bet' && this.bet.action(id)) return;
      if (id === 'ho:post') this.post();
      else if (id === 'ho:tip') this.buyTip();
      else if (id === 'ho:next') { this.newRace(); this.pick = -1; this.phase = 'bet'; this.bet.amount = 0; }
      else if (id && id.startsWith('ho:pick:') && this.phase === 'bet') this.pick = +id.slice(8);
    }
  };
  S.register('horses', horseScene);

})(typeof window !== 'undefined' ? window : globalThis);
