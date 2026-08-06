/* GILT — scenes: the building itself. Title, the walk in, the floor,
   the cage, the notebook, and the five ways a night can end.
   The twelve tables live in tables.js and register here. */
(function (root) {
  'use strict';
  const A = root.GiltArt, E = root.GiltEngine, C = root.GiltCopy, Cast = root.GiltCast;
  const { PAL, FONT, TAU, rr, poly, mix, alpha, label, wrapText, lerp, clamp, ease, neon, lampPool, vignette, brassGrad } = A;
  const W = 1280, H = 800;

  // ---------------- shared state handle (main.js fills the rest) ----------------
  const G = {
    W, H, night: null, save: null, rng: null, storage: null,
    audio: null, // GiltAudio, set by main
    smoke: A.Smoke(),
    chips: A.ChipFlights(),
    time: 0, // wall time for animation
    shakeT: 0, shakeAmp: 0, // capped, tiny, decays fast
    displayCash: 0,
    freshNight() {
      G.night = E.newNight((Math.random() * 1e9) >>> 0);
      G.displayCash = G.night.cash;
    },
    freshFreeplay() {
      G.night = E.newFreeplay((Math.random() * 1e9) >>> 0);
      if (G.save && G.save.highroller) G.night.highroller = true;
      G.displayCash = G.night.cash;
    },
    // one call for every wager: takes the stake, spends the minutes, pays the return
    settleWager(gameId, staked, returned, minutes) {
      const n = G.night;
      n.cash = Math.round((n.cash - staked + returned) * 100) / 100;
      E.recordBet(n, gameId, staked, returned);
      if (minutes) E.spendTime(n, minutes);
      E.checkBust(n);
    },
    learn(key) {
      if (E.learn(G.save, key)) {
        E.writeSave(G.storage, G.save);
        UI.toast(C.notebookAdded, PAL.brassHi);
        if (G.audio) G.audio.play('pencil');
        return true;
      }
      return false;
    },
    knows(key) { return !!(G.save && G.save.notebook[key]); },
    bump(amp) { G.shakeAmp = Math.min(5, G.shakeAmp + amp); } // the whole budget
  };

  // ---------------- immediate-mode ui ----------------
  const UI = {
    buttons: [], hover: null, mx: -1, my: -1,
    toasts: [],
    begin() { this.buttons = []; },
    button(ctx, id, x, y, w, h, text, opts) {
      opts = opts || {};
      const hot = this.mx >= x && this.mx <= x + w && this.my >= y && this.my <= y + h && !opts.disabled;
      this.buttons.push({ id, x, y, w, h, disabled: opts.disabled, silent: opts.silent });
      const base = opts.primary ? PAL.oxblood : '#132a1f';
      rr(ctx, x, y, w, h, opts.round == null ? 8 : opts.round);
      ctx.fillStyle = opts.disabled ? '#1a221d' : (hot ? mix(base, '#ffffff', 0.12) : base);
      ctx.fill();
      ctx.strokeStyle = opts.disabled ? '#2e352f' : (hot ? PAL.brassHi : alpha(PAL.brass, 0.75));
      ctx.lineWidth = 1.5;
      ctx.stroke();
      label(ctx, text, x + w / 2, y + h / 2 + 1, opts.size || 17,
        opts.disabled ? '#5a635c' : (opts.primary ? PAL.ivory : PAL.ivory), 'center', FONT.ui);
      if (hot && this.hover !== id) { this.hover = id; }
      return hot;
    },
    hit(x, y) {
      for (let i = this.buttons.length - 1; i >= 0; i--) {
        const b = this.buttons[i];
        if (!b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
      }
      return null;
    },
    toast(text, color) { this.toasts.push({ text, color: color || PAL.ivory, t: 0 }); },
    money(amount, x, y) { this.toasts.push({ text: (amount >= 0 ? '+' : '−') + E.dollars(Math.abs(amount)).slice(0), color: amount >= 0 ? PAL.brassHi : PAL.redHi, t: 0, x, y, rise: true }); },
    drawToasts(ctx, dt) {
      for (let i = this.toasts.length - 1; i >= 0; i--) {
        const t = this.toasts[i];
        t.t += dt;
        const life = 2.2;
        if (t.t > life) { this.toasts.splice(i, 1); continue; }
        const a = clamp(1 - (t.t - 1.4) / 0.8, 0, 1) * clamp(t.t / 0.15, 0, 1);
        ctx.globalAlpha = a;
        if (t.rise) {
          label(ctx, t.text, t.x || W / 2, (t.y || H * 0.4) - t.t * 42, 26, t.color, 'center', FONT.display, 'bold');
        } else {
          const yy = H - 168 - i * 30;
          label(ctx, t.text, W / 2, yy, 17, t.color, 'center', FONT.ui);
        }
        ctx.globalAlpha = 1;
      }
    }
  };

  // ---------------- dialogue ----------------
  const Dialog = {
    queue: [], onDone: null, chars: 0, active: null,
    show(lines, onDone) {
      this.queue = lines.slice();
      this.onDone = onDone || null;
      this.next();
    },
    next() {
      if (!this.queue.length) {
        this.active = null;
        const cb = this.onDone; this.onDone = null;
        if (cb) cb();
        return;
      }
      this.active = this.queue.shift();
      this.chars = 0;
      if (G.audio) G.audio.play('murmur');
    },
    get open() { return !!this.active; },
    click() {
      if (!this.active) return;
      if (this.chars < this.active.text.length) this.chars = this.active.text.length;
      else this.next();
    },
    update(dt) {
      if (this.active) this.chars = Math.min(this.active.text.length, this.chars + dt * 46);
    },
    draw(ctx) {
      if (!this.active) return;
      const a = this.active;
      const ph = 168, py = H - ph - 14;
      // panel
      rr(ctx, 220, py, W - 440, ph, 10);
      ctx.fillStyle = 'rgba(8,16,12,0.93)'; ctx.fill();
      ctx.strokeStyle = PAL.brass; ctx.lineWidth = 1.5; ctx.stroke();
      // portrait vignette
      if (a.who && Cast[a.who]) {
        ctx.save();
        rr(ctx, 244, py - 60, 150, ph + 40, 8);
        ctx.fillStyle = '#0c1811'; ctx.fill();
        ctx.strokeStyle = alpha(PAL.brass, 0.8); ctx.stroke();
        ctx.clip();
        lampPool(ctx, 319, py + 10, 130, 0.5, 1.6);
        Cast[a.who](ctx, 319, py + ph + 34, 0.78, G.time, { talk: this.chars < a.text.length });
        ctx.restore();
      }
      const nm = a.name || (a.who ? a.who.toUpperCase() : '');
      if (nm) label(ctx, nm, 420, py + 26, 15, PAL.brassHi, 'left', FONT.ui, 'bold');
      wrapText(ctx, a.text.slice(0, Math.floor(this.chars)), 420, py + 44, W - 440 - 220, 24, 18, PAL.ivory, 'left', FONT.ui);
      if (this.chars >= a.text.length) {
        const bob = Math.sin(G.time * 4) * 3;
        label(ctx, '▸', W - 244, py + ph - 22 + bob, 16, PAL.brassHi, 'center');
      }
    }
  };

  // ---------------- table talk (floating dealer lines, no panel) ----------------
  const Talk = {
    line: null, t: 0, pool: null,
    say(text, x, y) { this.line = { text, x: x || W / 2, y: y || H * 0.3 }; this.t = 0; },
    sayFrom(rngKey, lines, x, y) {
      if (!lines || !lines.length) return;
      if (!this.pool) this.pool = E.LinePool(G.rng || E.mulberry32(1));
      this.say(this.pool.draw(rngKey, lines), x, y);
    },
    update(dt) { if (this.line) { this.t += dt; if (this.t > 3.4) this.line = null; } },
    draw(ctx) {
      if (!this.line) return;
      const a = clamp(this.t / 0.2, 0, 1) * clamp((3.4 - this.t) / 0.5, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = 'italic 17px ' + FONT.display;
      const w = ctx.measureText(this.line.text).width + 28;
      rr(ctx, this.line.x - w / 2, this.line.y - 17, w, 32, 16);
      ctx.fillStyle = 'rgba(8,16,12,0.82)'; ctx.fill();
      ctx.strokeStyle = alpha(PAL.brass, 0.5); ctx.lineWidth = 1; ctx.stroke();
      label(ctx, this.line.text, this.line.x, this.line.y, 16, PAL.ivory, 'center', FONT.display);
      ctx.globalAlpha = 1;
    }
  };

  // ---------------- scene manager ----------------
  const S = {
    scenes: {}, cur: null, curName: null,
    fade: 1, fadeDir: -1, pending: null, overlay: null,
    register(name, scene) { this.scenes[name] = scene; },
    go(name, arg) {
      this.pending = { name, arg };
      this.fadeDir = 1;
    },
    _swap() {
      const p = this.pending; this.pending = null;
      if (this.cur && this.cur.leave) this.cur.leave();
      this.cur = this.scenes[p.name]; this.curName = p.name;
      if (this.cur.enter) this.cur.enter(p.arg);
      this.fadeDir = -1;
    },
    update(dt) {
      G.time += dt;
      if (this.fadeDir !== 0) {
        this.fade = clamp(this.fade + this.fadeDir * dt * 3.2, 0, 1);
        if (this.fade >= 1 && this.pending) this._swap();
        if (this.fade <= 0) this.fadeDir = 0;
      }
      G.displayCash += (((G.night && G.night.cash) || 0) - G.displayCash) * Math.min(1, dt * 8);
      if (Math.abs(G.displayCash - ((G.night && G.night.cash) || 0)) < 0.6) G.displayCash = (G.night && G.night.cash) || 0;
      G.smoke.step(dt);
      G.chips.step(dt);
      G.shakeAmp = Math.max(0, G.shakeAmp - dt * 14);
      Dialog.update(dt);
      Talk.update(dt);
      if (this.cur && this.cur.update && !this.pending) this.cur.update(dt);
      // the night ends wherever you're standing
      if (G.night && G.night.over && !G.night.freeplay && this.curName !== 'ending' &&
        this.curName !== 'title' && !this.pending && !G.chips.busy && !Dialog.open) {
        S.go('ending');
      }
    },
    draw(ctx, dt) {
      ctx.save();
      if (G.shakeAmp > 0.1) {
        ctx.translate((Math.random() - 0.5) * G.shakeAmp, (Math.random() - 0.5) * G.shakeAmp);
      }
      UI.begin();
      if (this.cur) this.cur.draw(ctx);
      G.chips.draw(ctx);
      Talk.draw(ctx);
      if (this.overlay) this.overlay.draw(ctx);
      Dialog.draw(ctx);
      UI.drawToasts(ctx, dt);
      ctx.restore();
      if (this.fade > 0) {
        ctx.fillStyle = 'rgba(4,8,6,' + this.fade.toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }
    },
    pointer(type, x, y) {
      UI.mx = x; UI.my = y;
      if (type !== 'down') {
        if (this.cur && this.cur.pointer && !Dialog.open && !this.overlay) this.cur.pointer(type, x, y);
        return;
      }
      if (G.audio) G.audio.unlock();
      if (Dialog.open) { Dialog.click(); return; }
      if (this.overlay) { this.overlay.click(x, y); return; }
      const id = UI.hit(x, y);
      if (id && this.cur && this.cur.action) {
        if (G.audio) G.audio.play('click');
        this.cur.action(id);
        return;
      }
      if (this.cur && this.cur.pointer) this.cur.pointer(type, x, y);
    }
  };

  // ---------------- hud ----------------
  function drawHUD(ctx, opts) {
    opts = opts || {};
    const n = G.night;
    if (!n) return;
    // top rail
    const g = ctx.createLinearGradient(0, 0, 0, 54);
    g.addColorStop(0, 'rgba(5,10,7,0.95)'); g.addColorStop(1, 'rgba(5,10,7,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 54);
    ctx.fillStyle = alpha(PAL.brass, 0.5);
    ctx.fillRect(0, 53, W, 1.5);
    // cash
    label(ctx, E.dollars(Math.round(G.displayCash)), 24, 28, 24, PAL.brassHi, 'left', FONT.display, 'bold');
    label(ctx, n.freeplay ? 'house money' : 'yours, for now', 24, 45, 11, PAL.ivoryDim, 'left', FONT.ui);
    // clock, center — with the dawn bleeding into it late
    const dawn = E.dawnAmount(n.t);
    label(ctx, E.clockLabel(n.t), W / 2, 26, 22, mix('#d8d2c2', PAL.dawn3, dawn), 'center', FONT.mono, 'bold');
    label(ctx, n.freeplay ? 'the night goes on' : 'sun\'s up at six', W / 2, 45, 11, PAL.ivoryDim, 'center', FONT.ui);
    // the number
    if (!n.freeplay) {
      label(ctx, E.dollars(n.debt), W - 24, 28, 24, n.cash >= n.debt ? PAL.teal : PAL.redHi, 'right', FONT.display, 'bold');
      label(ctx, 'the number' + (n.markers ? ' · ' + n.markers + ' marker' + (n.markers > 1 ? 's' : '') : ''), W - 24, 45, 11, PAL.ivoryDim, 'right', FONT.ui);
    } else {
      label(ctx, 'JUST PLAY', W - 24, 32, 16, PAL.ivoryDim, 'right', FONT.ui, 'bold');
    }
    // notebook tab
    if (!opts.noNotebook) {
      UI.button(ctx, 'hud:notebook', W - 150, 62, 126, 30, C.ui.notebook, { size: 14, round: 15 });
    }
    if (opts.back) {
      UI.button(ctx, 'hud:back', 24, 62, 150, 30, C.ui.back, { size: 14, round: 15 });
    }
    if (opts.rules) {
      UI.button(ctx, 'hud:rules', 186, 62, 116, 30, C.ui.rules, { size: 14, round: 15 });
    }
  }
  function hudAction(id) {
    if (id === 'hud:notebook') { S.overlay = NotebookOverlay; return true; }
    if (id === 'hud:back') { S.go('floor'); return true; }
    if (id === 'hud:rules' && S.cur && S.cur.rulesKey) { S.overlay = makeRulesOverlay(S.cur.rulesKey); return true; }
    return false;
  }

  // ---------------- overlays ----------------
  const NotebookOverlay = {
    draw(ctx) {
      ctx.fillStyle = 'rgba(2,5,3,0.72)';
      ctx.fillRect(0, 0, W, H);
      const px = W / 2 - 270, py = 70, pw = 540, ph = H - 150;
      // battered pocket notebook
      ctx.save();
      ctx.translate(px + pw / 2, py + ph / 2);
      ctx.rotate(-0.012);
      rr(ctx, -pw / 2 - 6, -ph / 2 - 6, pw + 12, ph + 12, 8);
      ctx.fillStyle = '#2e2018'; ctx.fill();
      rr(ctx, -pw / 2, -ph / 2, pw, ph, 4);
      ctx.fillStyle = '#e8e0c8'; ctx.fill();
      // ruled lines
      ctx.strokeStyle = 'rgba(110,130,160,0.28)'; ctx.lineWidth = 1;
      for (let yy = -ph / 2 + 70; yy < ph / 2 - 20; yy += 30) {
        ctx.beginPath(); ctx.moveTo(-pw / 2 + 26, yy); ctx.lineTo(pw / 2 - 26, yy); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(180,80,80,0.3)';
      ctx.beginPath(); ctx.moveTo(-pw / 2 + 46, -ph / 2); ctx.lineTo(-pw / 2 + 46, ph / 2); ctx.stroke();
      label(ctx, C.notebook.title, 0, -ph / 2 + 38, 26, '#4a4238', 'center', FONT.hand);
      const keys = E.NOTEBOOK_KEYS.filter(k => G.save && G.save.notebook[k]);
      let yy = -ph / 2 + 84;
      ctx.globalAlpha = 0.9;
      if (!keys.length) {
        label(ctx, C.notebook.empty, 0, yy + 10, 19, '#5a5248', 'center', FONT.hand);
      }
      for (const k of keys) {
        ctx.save();
        ctx.rotate((k.length % 3 - 1) * 0.004);
        yy = wrapText(ctx, '· ' + C.notebook[k], -pw / 2 + 56, yy - 10, pw - 112, 29, 17, '#3a3630', 'left', FONT.hand) + 18;
        ctx.restore();
        if (yy > ph / 2 - 40) break;
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      UI.button(ctx, 'nb:close', W / 2 - 60, py + ph - 20, 120, 40, C.ui.ok, { primary: true });
    },
    click(x, y) {
      const id = UI.hit(x, y);
      if (id === 'nb:close' || x < W / 2 - 290 || x > W / 2 + 290) S.overlay = null;
    }
  };

  function makeRulesOverlay(key) {
    const R = C.rules[key];
    return {
      draw(ctx) {
        ctx.fillStyle = 'rgba(2,5,3,0.72)';
        ctx.fillRect(0, 0, W, H);
        const pw = 620, px = W / 2 - pw / 2, py = 110;
        // the printed card — ivory, brass rule, small type
        rr(ctx, px, py, pw, H - 250, 6);
        ctx.fillStyle = '#efe7d2'; ctx.fill();
        ctx.strokeStyle = PAL.brassDark; ctx.lineWidth = 2; ctx.stroke();
        rr(ctx, px + 10, py + 10, pw - 20, H - 270, 3);
        ctx.strokeStyle = alpha(PAL.brassDark, 0.5); ctx.lineWidth = 1; ctx.stroke();
        label(ctx, R.title, W / 2, py + 46, 22, '#3a3020', 'center', FONT.display, 'bold');
        ctx.fillStyle = PAL.brassDark;
        ctx.fillRect(W / 2 - 60, py + 64, 120, 1.5);
        let yy = py + 92;
        for (const line of R.body) {
          yy = wrapText(ctx, line, px + 48, yy, pw - 96, 22, 15.5, '#443a28', 'left', FONT.display) + 10;
        }
        label(ctx, '— mgmt', px + pw - 60, py + (H - 250) - 34, 14, '#7a6a4a', 'right', FONT.display);
        UI.button(ctx, 'rules:close', W / 2 - 60, H - 118, 120, 40, C.ui.ok, { primary: true });
      },
      click(x, y) {
        const id = UI.hit(x, y);
        if (id === 'rules:close' || x < W / 2 - 320 || x > W / 2 + 320) S.overlay = null;
      }
    };
  }

  // ---------------- exterior (title + intro + endings share it) ----------------
  function drawExterior(ctx, dawn, t) {
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.66);
    sky.addColorStop(0, mix('#080d18', PAL.dawn1, dawn));
    sky.addColorStop(0.7, mix('#0d1626', PAL.dawn2, dawn));
    sky.addColorStop(1, mix('#111a2c', PAL.dawn3, dawn * 0.9));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.66);
    // stars fade at dawn
    if (dawn < 0.6) {
      ctx.fillStyle = alpha('#e8ecff', 0.7 * (1 - dawn));
      let sd = 12345;
      for (let i = 0; i < 60; i++) {
        sd = (sd * 16807) % 2147483647;
        const sx = (sd / 2147483647) * W; sd = (sd * 16807) % 2147483647;
        const sy = (sd / 2147483647) * H * 0.4;
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7);
        ctx.globalAlpha = (0.25 + tw * 0.5) * (1 - dawn);
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    }
    if (dawn > 0.25) { // the sun itself, low and mean
      const sg = ctx.createRadialGradient(W * 0.78, H * 0.6, 0, W * 0.78, H * 0.6, 260);
      sg.addColorStop(0, alpha('#ffd9a0', 0.5 * dawn));
      sg.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H * 0.66);
    }
    // the building — a deco slab with a stepped crown
    ctx.fillStyle = mix('#131a16', PAL.dawn1, dawn * 0.3);
    poly(ctx, [[W * 0.16, H * 0.66], [W * 0.16, H * 0.24], [W * 0.24, H * 0.24], [W * 0.24, H * 0.18], [W * 0.4, H * 0.18], [W * 0.4, H * 0.12], [W * 0.6, H * 0.12], [W * 0.6, H * 0.18], [W * 0.76, H * 0.18], [W * 0.76, H * 0.24], [W * 0.84, H * 0.24], [W * 0.84, H * 0.66]]);
    ctx.fill();
    // lit windows, some of them
    let wd = 777;
    for (let fx = 0; fx < 14; fx++) for (let fy = 0; fy < 7; fy++) {
      wd = (wd * 16807) % 2147483647;
      if ((wd / 2147483647) < 0.4) {
        ctx.fillStyle = alpha('#f0c878', 0.5 + 0.2 * Math.sin(t * 0.6 + fx * fy));
        ctx.fillRect(W * 0.2 + fx * W * 0.045, H * 0.28 + fy * H * 0.05, W * 0.014, H * 0.024);
      }
    }
    // marquee
    const my = H * 0.35;
    rr(ctx, W / 2 - 300, my - 90, 600, 175, 10);
    ctx.fillStyle = '#0d0f14'; ctx.fill();
    ctx.strokeStyle = brassGrad(ctx, W / 2 - 300, 0, W / 2 + 300, 0);
    ctx.lineWidth = 5; ctx.stroke();
    // bulb border
    for (let i = 0; i < 46; i++) {
      const bx = W / 2 - 285 + (i % 23) * (570 / 22);
      const by = i < 23 ? my - 78 : my + 72;
      const on = Math.floor(t * 4 + i * 0.7) % 8 !== 0;
      ctx.beginPath(); ctx.arc(bx, by, 3.4, 0, TAU);
      ctx.fillStyle = on ? '#ffdf9e' : '#4a4436'; ctx.fill();
    }
    neon(ctx, C.signs.marquee, W / 2, my - 14, 84, PAL.pink, t);
    neon(ctx, C.signs.marqueeSub, W / 2, my + 46, 22, PAL.teal, t + 3);
    // cocktails side sign
    ctx.save();
    ctx.translate(W * 0.855, H * 0.34);
    ctx.rotate(Math.PI / 2);
    neon(ctx, C.signs.cocktails, 0, 0, 26, PAL.teal, t + 7);
    ctx.restore();
    // street
    ctx.fillStyle = mix('#0b0d10', PAL.dawn2, dawn * 0.18);
    ctx.fillRect(0, H * 0.66, W, H * 0.34);
    // wet reflection of the marquee
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.translate(0, H * 1.32 + 175);
    ctx.scale(1, -0.7);
    neon(ctx, C.signs.marquee, W / 2, H * 0.35 - 14, 84, PAL.pink, t, { steady: true });
    ctx.restore();
    // doors
    rr(ctx, W / 2 - 84, H * 0.5, 168, H * 0.16, 4);
    ctx.fillStyle = '#1a1410'; ctx.fill();
    ctx.strokeStyle = PAL.brass; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = alpha(PAL.brass, 0.6);
    ctx.beginPath(); ctx.moveTo(W / 2, H * 0.5); ctx.lineTo(W / 2, H * 0.66); ctx.stroke();
    const dg = ctx.createLinearGradient(0, H * 0.5, 0, H * 0.66);
    dg.addColorStop(0, alpha('#ffd9a0', 0.25)); dg.addColorStop(1, alpha('#ffd9a0', 0.05));
    ctx.fillStyle = dg;
    ctx.fillRect(W / 2 - 80, H * 0.505, 160, H * 0.15);
  }

  // ---------------- title ----------------
  S.register('title', {
    enter() { if (G.audio) G.audio.ambient('exterior'); },
    draw(ctx) {
      drawExterior(ctx, 0, G.time);
      vignette(ctx, W, H, 0.55);
      // menu
      const bx = W / 2 - 170, bw = 340;
      UI.button(ctx, 't:night', bx, H * 0.7, bw, 56, C.menu.night, { primary: true, size: 22 });
      label(ctx, C.menu.nightSub, W / 2, H * 0.7 + 74, 14, PAL.ivoryDim, 'center', FONT.ui);
      UI.button(ctx, 't:free', bx, H * 0.7 + 96, bw, 46, C.menu.freeplay, { size: 18 });
      if (G.save && Object.keys(G.save.notebook).length) {
        UI.button(ctx, 't:nb', bx, H * 0.7 + 152, bw, 40, C.menu.notebook, { size: 16 });
      }
      // history line
      if (G.save && G.save.nights > 0) {
        const seen = G.save.endingsSeen;
        const parts = [];
        if (G.save.nights) parts.push(G.save.nights + (G.save.nights === 1 ? ' night' : ' nights'));
        if (seen.paid || seen.gilt) parts.push('paid Sal ' + ((seen.paid || 0) + (seen.gilt || 0)) + 'x');
        label(ctx, parts.join(' · '), W / 2, H - 22, 13, alpha(PAL.ivoryDim, 0.8), 'center', FONT.ui);
      }
      label(ctx, C.signs.est, 24, H - 22, 12, alpha(PAL.ivoryDim, 0.6), 'left', FONT.ui);
    },
    action(id) {
      if (id === 't:night') {
        G.freshNight();
        S.go(G.save.seenIntro ? 'cage' : 'intro');
      } else if (id === 't:free') {
        G.freshFreeplay();
        S.go('floor');
      } else if (id === 't:nb') S.overlay = NotebookOverlay;
    }
  });

  // ---------------- intro: Sal at the curb ----------------
  S.register('intro', {
    enter() {
      if (G.audio) G.audio.ambient('exterior');
      this.started = false;
    },
    update() {
      if (!this.started && S.fade <= 0) {
        this.started = true;
        Dialog.show(C.sal.intro.map(text => ({ who: 'sal', text })), () => {
          G.save.seenIntro = true;
          E.writeSave(G.storage, G.save);
          S.go('cage', 'first');
        });
      }
    },
    draw(ctx) {
      drawExterior(ctx, 0, G.time);
      // Sal under the marquee light
      lampPool(ctx, W / 2 - 210, H * 0.62, 200, 0.3, 1.6);
      Cast.sal(ctx, W / 2 - 210, H * 0.72, 1.05, G.time, { talk: Dialog.open && Dialog.chars < (Dialog.active ? Dialog.active.text.length : 0) });
      vignette(ctx, W, H, 0.6);
    },
    action() { }
  });

  // ---------------- the cage ----------------
  S.register('cage', {
    rulesKey: 'scratch',
    enter(arg) {
      if (G.audio) G.audio.ambient('floor');
      this.first = arg === 'first';
      this.greeted = false;
      this.ticket = null; // scratch card in progress lives here
      this.scratched = 0;
    },
    update() {
      if (this.first && !this.greeted && S.fade <= 0) {
        this.greeted = true;
        Dialog.show(C.mabel.first.map(text => ({ who: 'mabel', name: 'MABEL', text })));
      }
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night ? G.night.t : 0);
      // back office wall
      ctx.fillStyle = mix('#171410', PAL.dawn1, dawn * 0.15);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = A.getCarpet(ctx);
      ctx.fillRect(0, H * 0.72, W, H * 0.28);
      // pigeonholes behind her
      for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) {
        rr(ctx, W * 0.28 + i * 68, 96 + j * 60, 56, 48, 3);
        ctx.fillStyle = '#241c12'; ctx.fill();
        ctx.strokeStyle = alpha(PAL.woodHi, 0.5); ctx.stroke();
        if ((i * 3 + j) % 4 !== 1) {
          ctx.fillStyle = '#3f3324';
          ctx.fillRect(W * 0.28 + i * 68 + 8, 100 + j * 60 + 26, 40, 14);
        }
      }
      lampPool(ctx, W / 2, H * 0.3, 420, dawn, 1.4);
      // Mabel behind the counter
      Cast.mabel(ctx, W / 2, H * 0.62, 1.15, G.time, {});
      // Duke's photo taped to the pigeonholes
      ctx.save();
      ctx.translate(W * 0.28 + 30, 210);
      ctx.rotate(-0.06);
      rr(ctx, -20, -26, 40, 52, 2);
      ctx.fillStyle = '#e8e0cc'; ctx.fill();
      rr(ctx, -16, -22, 32, 36, 1);
      ctx.fillStyle = '#8a8272'; ctx.fill();
      // a dog, mostly ears
      ctx.fillStyle = '#4a4236';
      ctx.beginPath(); ctx.ellipse(0, -6, 9, 7, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-8, -12, 3.5, 6, 0.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(8, -12, 3.5, 6, -0.5, 0, TAU); ctx.fill();
      label(ctx, 'DUKE', 0, 22, 8, '#5a5040', 'center', FONT.hand);
      ctx.restore();
      // brass bars + counter
      ctx.fillStyle = PAL.woodDark;
      ctx.fillRect(0, H * 0.66, W, 26);
      ctx.fillStyle = brassGrad(ctx, 0, H * 0.66, 0, H * 0.7);
      ctx.fillRect(0, H * 0.66, W, 5);
      ctx.strokeStyle = alpha(PAL.brass, 0.85);
      ctx.lineWidth = 5;
      for (let i = 0; i < 13; i++) {
        const bx = W * 0.08 + i * W * 0.07;
        if (Math.abs(bx - W / 2) < W * 0.1) continue; // the window
        ctx.beginPath(); ctx.moveTo(bx, 60); ctx.lineTo(bx, H * 0.66); ctx.stroke();
      }
      neon(ctx, C.signs.cage, W * 0.11, 110, 34, PAL.teal, G.time);
      label(ctx, C.signs.goldstrike, W * 0.86, 116, 16, PAL.brassHi, 'center', FONT.ui, 'bold');
      // scratch card in play
      if (this.ticket) this.drawTicket(ctx);
      drawHUD(ctx, { back: true, rules: !!this.ticket });
      if (!this.ticket) {
        const by = H - 120;
        UI.button(ctx, 'cage:scratch', W / 2 - 330, by, 200, 48, C.signs.goldstrike, {});
        UI.button(ctx, 'cage:marker', W / 2 - 100, by, 200, 48, C.ui.marker, { disabled: G.night.freeplay || G.night.markers >= E.MARKER_MAX });
        UI.button(ctx, 'cage:duke', W / 2 + 130, by, 200, 48, 'Ask about the dog', {});
      }
      vignette(ctx, W, H, 0.45);
    },
    drawTicket(ctx) {
      const t = this.ticket;
      const tx = W / 2, ty = H * 0.42, tw = 300, th = 190;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(0.01);
      rr(ctx, -tw / 2, -th / 2, tw, th, 8);
      const tg = ctx.createLinearGradient(-tw / 2, -th / 2, tw / 2, th / 2);
      tg.addColorStop(0, '#b8912a'); tg.addColorStop(0.5, '#e8c85a'); tg.addColorStop(1, '#96741e');
      ctx.fillStyle = tg; ctx.fill();
      ctx.strokeStyle = '#6e5214'; ctx.lineWidth = 2; ctx.stroke();
      label(ctx, 'GOLD STRIKE', 0, -th / 2 + 26, 24, '#38090d', 'center', FONT.display, 'bold');
      label(ctx, 'match 3 · keep what you strike', 0, -th / 2 + 46, 11, '#5e4a10', 'center', FONT.ui);
      for (let i = 0; i < 6; i++) {
        const sx = -tw / 2 + 52 + (i % 3) * 98, sy = -8 + Math.floor(i / 3) * 62;
        rr(ctx, sx - 34, sy - 22, 68, 44, 5);
        ctx.fillStyle = '#efe7d2'; ctx.fill();
        label(ctx, '$' + t.spots[i], sx, sy + 1, 20, '#3a3020', 'center', FONT.display, 'bold');
        // foil
        const sc = t.scratched[i];
        if (sc < 1) {
          ctx.save();
          rr(ctx, sx - 34, sy - 22, 68, 44, 5);
          ctx.clip();
          ctx.globalAlpha = 1 - sc;
          ctx.fillStyle = '#9a9482';
          ctx.fillRect(sx - 34, sy - 22, 68, 44);
          ctx.fillStyle = '#aaa492';
          for (let k = 0; k < 5; k++) ctx.fillRect(sx - 34 + k * 15, sy - 22, 7, 44);
          label(ctx, '⛏', sx, sy, 18, '#7a7462', 'center');
          ctx.restore();
        }
      }
      ctx.restore();
      label(ctx, 'rub the foil', W / 2, ty + th / 2 + 28, 14, PAL.ivoryDim, 'center', FONT.ui);
      if (t.done) {
        UI.button(ctx, 'cage:another', W / 2 - 220, H - 120, 200, 48, C.ui.another + ' · $5', { disabled: G.night.cash < 5 });
        UI.button(ctx, 'cage:tdone', W / 2 + 20, H - 120, 200, 48, C.ui.ok, { primary: true });
      }
    },
    buyTicket() {
      if (G.night.cash < 5) return;
      const Sc = root.GiltGames.Scratch;
      this.ticket = Sc.buy(G.rng);
      this.ticket.scratched = [0, 0, 0, 0, 0, 0];
      this.ticket.done = false;
      this.ticket.paid = false;
      G.settleWager('scratch', 5, 0, 1);
      if (G.audio) G.audio.play('paper');
      Talk.sayFrom('mabel', [C.mabel.scratcher], W / 2, H * 0.18);
    },
    pointer(type, x, y) {
      const t = this.ticket;
      if (!t || t.done) return;
      if (type !== 'move' && type !== 'down') return;
      // scratching: pointer over a foil spot rubs it off
      const tx = W / 2, ty = H * 0.42, tw = 300;
      for (let i = 0; i < 6; i++) {
        const sx = tx - tw / 2 + 52 + (i % 3) * 98, sy = ty - 8 + Math.floor(i / 3) * 62;
        if (Math.abs(x - sx) < 36 && Math.abs(y - sy) < 24 && t.scratched[i] < 1) {
          t.scratched[i] = Math.min(1, t.scratched[i] + 0.16);
          if (G.audio && Math.random() < 0.4) G.audio.play('scratch');
          if (t.scratched[i] >= 1 && G.audio) G.audio.play('foil');
        }
      }
      if (!t.paid && t.scratched.every(s => s >= 1)) {
        t.done = true; t.paid = true;
        if (t.prize > 0) {
          G.settleWager('scratch', 0, t.prize, 0);
          UI.money(t.prize, W / 2, H * 0.32);
          if (G.audio) G.audio.play(t.prize >= 100 ? 'winBig' : 'winSmall');
          Talk.sayFrom('mabelw', [C.mabel.scratchWin], W / 2, H * 0.18);
          if (t.prize >= 100) G.chips.fountain(W / 2, H * 0.42, 14);
        } else {
          Talk.sayFrom('mabell', [C.mabel.scratchLose], W / 2, H * 0.18);
        }
      }
    },
    action(id) {
      if (hudAction(id)) return;
      if (id === 'cage:scratch' || id === 'cage:another') this.buyTicket();
      else if (id === 'cage:tdone') { this.ticket = null; }
      else if (id === 'cage:marker') {
        if (E.takeMarker(G.night)) {
          Dialog.show([
            { who: 'mabel', name: 'MABEL', text: C.mabel.marker },
            { who: 'mabel', name: 'MABEL', text: C.mabel.markerSigned }
          ]);
          if (G.audio) G.audio.play('chips');
        } else {
          Dialog.show([{ who: 'mabel', name: 'MABEL', text: C.mabel.markerNo }]);
        }
      }
      else if (id === 'cage:duke') Dialog.show([{ who: 'mabel', name: 'MABEL', text: C.mabel.dogPhoto }]);
    }
  });

  // ---------------- the floor ----------------
  // pit layout: clickable regions with a sign, a drawn table, and its dealer
  const PITS = [
    { id: 'blackjack', x: 400, y: 300, w: 200, h: 150, sign: C.signs.blackjack, neon: PAL.pink, who: 'ruth' },
    { id: 'roulette', x: 640, y: 290, w: 190, h: 160, sign: C.signs.roulette, neon: PAL.teal, who: 'vern' },
    { id: 'craps', x: 870, y: 300, w: 230, h: 150, sign: C.signs.craps, neon: PAL.pink, who: 'eddie' },
    { id: 'baccarat', x: 520, y: 128, w: 200, h: 120, sign: C.signs.baccarat, neon: PAL.teal, who: 'dot' },
    { id: 'threecard', x: 760, y: 128, w: 200, h: 120, sign: C.signs.threecard, neon: PAL.pink, who: 'marla' },
    { id: 'slots', x: 120, y: 290, w: 190, h: 170, sign: C.signs.slots, neon: PAL.pink },
    { id: 'vpoker', x: 120, y: 490, w: 190, h: 130, sign: C.signs.vpoker, neon: PAL.teal },
    { id: 'hilo', x: 1090, y: 128, w: 140, h: 130, sign: C.signs.hilo, neon: PAL.teal, who: 'len' },
    { id: 'keno', x: 1080, y: 300, w: 150, h: 150, sign: C.signs.keno, neon: PAL.pink, who: 'coral' },
    { id: 'bigsix', x: 330, y: 128, w: 140, h: 120, sign: C.signs.bigsix, neon: PAL.teal },
    { id: 'horses', x: 130, y: 122, w: 150, h: 126, sign: C.signs.horses, neon: PAL.pink, who: 'fingers' },
    { id: 'cage', x: 950, y: 500, w: 220, h: 130, sign: C.signs.cage, neon: PAL.teal, who: 'mabel' }
  ];
  const patrons = [];
  for (let i = 0; i < 9; i++) {
    patrons.push({
      x: 200 + Math.random() * 900, y: 200 + Math.random() * 420,
      tx: 200 + Math.random() * 900, ty: 200 + Math.random() * 420,
      hat: Math.random() < 0.5, dress: Math.random() < 0.4, drink: Math.random() < 0.4,
      pace: 12 + Math.random() * 16, wait: Math.random() * 6
    });
  }
  S.register('floor', {
    enter() {
      if (G.audio) G.audio.ambient('floor');
      this.salBeat = null;
    },
    update(dt) {
      const n = G.night;
      // patrons drift
      for (const p of patrons) {
        if (p.wait > 0) { p.wait -= dt; continue; }
        const dx = p.tx - p.x, dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 4) {
          p.wait = 2 + Math.random() * 8;
          const pit = PITS[Math.floor(Math.random() * PITS.length)];
          p.tx = pit.x + pit.w / 2 + (Math.random() - 0.5) * 120;
          p.ty = pit.y + pit.h + 24 + Math.random() * 40;
        } else {
          p.x += dx / d * p.pace * dt;
          p.y += dy / d * p.pace * dt;
        }
      }
      // Sal's two visits
      if (n && !n.freeplay && !Dialog.open) {
        if (n.t >= 360 && !n.flags.sal3) { n.flags.sal3 = true; Dialog.show([{ who: 'sal', text: C.sal.three }]); }
        if (n.t >= 480 && !n.flags.sal5) { n.flags.sal5 = true; Dialog.show([{ who: 'sal', text: C.sal.five }]); }
      }
      // ambient smoke over the pits
      if (Math.random() < 0.12) {
        const pit = PITS[Math.floor(Math.random() * 5)];
        G.smoke.puff(pit.x + Math.random() * pit.w, pit.y + 30, 1);
      }
    },
    draw(ctx) {
      const dawn = E.dawnAmount(G.night ? G.night.t : 0);
      // room
      ctx.fillStyle = mix(PAL.deep, PAL.dawn1, dawn * 0.2);
      ctx.fillRect(0, 0, W, H);
      // carpet
      ctx.fillStyle = A.getCarpet(ctx);
      ctx.fillRect(0, 90, W, H - 90);
      // back wall + high windows that betray the hour
      ctx.fillStyle = mix('#0c1710', PAL.dawn1, dawn * 0.3);
      ctx.fillRect(0, 0, W, 92);
      for (let i = 0; i < 7; i++) {
        rr(ctx, 80 + i * 180, 16, 90, 54, 4);
        const wg = ctx.createLinearGradient(0, 16, 0, 70);
        wg.addColorStop(0, mix('#0d1626', PAL.dawn2, dawn));
        wg.addColorStop(1, mix('#111a2c', PAL.dawn3, dawn));
        ctx.fillStyle = wg; ctx.fill();
        ctx.strokeStyle = PAL.woodDark; ctx.lineWidth = 3; ctx.stroke();
      }
      // lamp pools over pits
      for (const pit of PITS) lampPool(ctx, pit.x + pit.w / 2, pit.y + pit.h / 2, 170, dawn, 1.1);
      // pits
      for (const pit of PITS) this.drawPit(ctx, pit);
      // patrons (between tables, silhouettes with a little life)
      for (const p of patrons) this.drawPatron(ctx, p);
      G.smoke.draw(ctx);
      // est plaque
      label(ctx, C.signs.est, W / 2, H - 16, 11, alpha(PAL.ivoryDim, 0.55), 'center', FONT.ui);
      drawHUD(ctx, {});
      // walk-out door (settle early if you're holding enough)
      if (!G.night.freeplay) {
        UI.button(ctx, 'floor:door', W - 150, H - 66, 126, 40, C.ui.toDoor, { size: 14 });
      } else {
        UI.button(ctx, 'floor:door', W - 150, H - 66, 126, 40, C.ui.walk, { size: 14 });
      }
      vignette(ctx, W, H, 0.5);
    },
    drawPit(ctx, pit) {
      const hot = UI.mx >= pit.x && UI.mx <= pit.x + pit.w && UI.my >= pit.y && UI.my <= pit.y + pit.h + 30;
      const t = G.time;
      ctx.save();
      ctx.translate(pit.x, pit.y);
      // sign above
      neon(ctx, pit.sign, pit.w / 2, -4, hot ? 21 : 18, pit.neon, t + pit.x * 0.01);
      const locked = pit.id === 'blackjack' && G.night && !E.blackjackOpen(G.night);
      // the furniture, small and specific
      if (pit.id === 'blackjack' || pit.id === 'threecard' || pit.id === 'baccarat') {
        // kidney table, felt arc, little cards
        ctx.beginPath();
        ctx.ellipse(pit.w / 2, 66, 74, 42, 0, 0, TAU);
        ctx.fillStyle = locked ? '#3a4a42' : PAL.felt; ctx.fill();
        ctx.strokeStyle = PAL.woodDark; ctx.lineWidth = 6; ctx.stroke();
        for (let i = 0; i < 3; i++) A.drawCard(ctx, pit.w / 2 - 20 + i * 20, 66, 13, { r: 2 + i, s: i }, { flip: i === 2 ? 0 : 1 });
        if (locked) label(ctx, C.signs.closed, pit.w / 2, 66, 10, PAL.redHi, 'center', FONT.ui, 'bold');
      } else if (pit.id === 'roulette') {
        A.drawRouletteWheel(ctx, pit.w / 2, 70, 42, t * 0.4, null, t);
      } else if (pit.id === 'craps') {
        rr(ctx, 10, 40, pit.w - 20, 58, 24);
        ctx.fillStyle = PAL.felt; ctx.fill();
        ctx.strokeStyle = PAL.woodDark; ctx.lineWidth = 7; ctx.stroke();
        A.drawDie(ctx, pit.w / 2 - 12, 68, 14, 4, 0.4);
        A.drawDie(ctx, pit.w / 2 + 10, 70, 14, 3, -0.2);
      } else if (pit.id === 'slots') {
        for (let i = 0; i < 3; i++) A.drawSlotCabinet(ctx, 8 + i * 60, 40, 52, { reels: ['CH', 'BA', 'SV'], t: t + i });
      } else if (pit.id === 'vpoker') {
        for (let i = 0; i < 2; i++) {
          rr(ctx, 20 + i * 82, 44, 66, 74, 6);
          ctx.fillStyle = '#1c2333'; ctx.fill();
          ctx.strokeStyle = PAL.brass; ctx.lineWidth = 2; ctx.stroke();
          rr(ctx, 28 + i * 82, 54, 50, 30, 3);
          ctx.fillStyle = '#0e1a2c'; ctx.fill();
          label(ctx, i === 0 ? '9/6' : '8/5', 53 + i * 82, 70, 12, i === 0 ? PAL.teal : PAL.ivoryDim, 'center', FONT.mono, 'bold');
        }
      } else if (pit.id === 'hilo') {
        rr(ctx, 10, 60, pit.w - 20, 30, 6);
        ctx.fillStyle = PAL.wood; ctx.fill();
        ctx.strokeStyle = PAL.woodDark; ctx.lineWidth = 3; ctx.stroke();
        for (let i = 0; i < 3; i++) {
          poly(ctx, [[24 + i * 34, 58], [30 + i * 34, 44], [36 + i * 34, 58]]);
          ctx.fillStyle = 'rgba(220,235,235,0.4)'; ctx.fill();
        }
      } else if (pit.id === 'keno') {
        rr(ctx, 16, 40, pit.w - 32, 60, 6);
        ctx.fillStyle = '#100c14'; ctx.fill();
        ctx.strokeStyle = PAL.brass; ctx.lineWidth = 2; ctx.stroke();
        for (let i = 0; i < 12; i++) {
          const on = Math.floor(t * 2 + i * 2.3) % 5 === 0;
          ctx.beginPath(); ctx.arc(30 + (i % 4) * 26, 56 + Math.floor(i / 4) * 16, 5, 0, TAU);
          ctx.fillStyle = on ? '#ffb04f' : '#2e2436'; ctx.fill();
        }
      } else if (pit.id === 'bigsix') {
        A.drawBigSix(ctx, pit.w / 2, 76, 46, t * 0.3);
      } else if (pit.id === 'horses') {
        rr(ctx, 12, 42, pit.w - 24, 66, 5);
        ctx.fillStyle = '#100c14'; ctx.fill();
        ctx.strokeStyle = PAL.brass; ctx.lineWidth = 2; ctx.stroke();
        label(ctx, C.signs.simulcastBoard.split('—')[0], pit.w / 2, 60, 9, '#ffb04f', 'center', FONT.mono);
        for (let i = 0; i < 3; i++) {
          label(ctx, (i + 1) + '  ' + '· · ·', 30, 76 + i * 12, 8, PAL.ivoryDim, 'left', FONT.mono);
        }
      } else if (pit.id === 'cage') {
        ctx.strokeStyle = alpha(PAL.brass, 0.85); ctx.lineWidth = 3;
        for (let i = 0; i < 7; i++) {
          ctx.beginPath(); ctx.moveTo(20 + i * 30, 34); ctx.lineTo(20 + i * 30, 100); ctx.stroke();
        }
        rr(ctx, 8, 96, pit.w - 16, 16, 3);
        ctx.fillStyle = PAL.woodDark; ctx.fill();
      }
      // the dealer, small, alive
      if (pit.who && Cast[pit.who] && !locked) {
        Cast[pit.who](ctx, pit.w / 2, pit.id === 'cage' ? 96 : 52, 0.33, t, {});
      }
      // hover ring
      if (hot) {
        rr(ctx, -6, -22, pit.w + 12, pit.h + 40, 12);
        ctx.strokeStyle = alpha(PAL.brassHi, 0.6 + 0.3 * Math.sin(t * 5));
        ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
    },
    drawPatron(ctx, p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      const walking = p.wait <= 0;
      const step = walking ? Math.sin(G.time * 9 + p.x) * 2.5 : 0;
      ctx.fillStyle = 'rgba(10,16,13,0.85)';
      // body silhouette
      if (p.dress) {
        poly(ctx, [[-8, 0], [-5, -22], [5, -22], [8, 0]]);
      } else {
        poly(ctx, [[-7, 0], [-6, -24], [6, -24], [7, 0]]);
      }
      ctx.fill();
      ctx.beginPath(); ctx.arc(0, -29, 5.5, 0, TAU); ctx.fill();
      if (p.hat) {
        ctx.beginPath(); ctx.ellipse(0, -33, 8, 2.4, 0, 0, TAU); ctx.fill();
        rr(ctx, -4.5, -40, 9, 8, 2); ctx.fill();
      }
      if (p.drink) {
        ctx.fillStyle = 'rgba(220,235,235,0.5)';
        ctx.fillRect(8, -18 + step * 0.4, 3, 5);
      }
      // legs when walking
      ctx.fillStyle = 'rgba(10,16,13,0.85)';
      ctx.fillRect(-5, -2, 3.4, 2 + Math.abs(step));
      ctx.fillRect(2, -2, 3.4, 2 + Math.abs(-step));
      ctx.restore();
    },
    action(id) {
      if (hudAction(id)) return;
      if (id === 'floor:door') {
        if (G.night.freeplay) { S.go('title'); return; }
        E.settleNight(G.night);
        S.go('ending');
      }
    },
    pointer(type, x, y) {
      if (type !== 'down') return;
      for (const pit of PITS) {
        if (x >= pit.x && x <= pit.x + pit.w && y >= pit.y - 10 && y <= pit.y + pit.h + 30) {
          if (pit.id === 'blackjack' && !E.blackjackOpen(G.night)) {
            Talk.say(C.ruth.cooled, pit.x + pit.w / 2, pit.y - 30);
            return;
          }
          if (G.audio) G.audio.play('steps');
          S.go(pit.id);
          return;
        }
      }
    }
  });

  // ---------------- endings ----------------
  S.register('ending', {
    enter() {
      const n = G.night;
      this.kind = n.ending || 'scraps';
      E.absorbNight(G.save, n);
      E.writeSave(G.storage, G.save);
      if (G.audio) G.audio.ambient('exterior');
      this.beat = 0;
      this.showCard = false;
      const lines = (this.kind === 'gilt')
        ? C.cole.giltEnding.map(text => ({ who: 'cole', name: 'COLE', text })).concat(C.sal.endings.gilt.map(text => ({ who: 'sal', text })))
        : C.sal.endings[this.kind].map(text => ({ who: 'sal', text }));
      const self = this;
      setTimeout(() => { }, 0); // no-op; dialog starts on first update so fade finishes
      this.pendingLines = lines;
    },
    update() {
      if (this.pendingLines && S.fade <= 0) {
        const lines = this.pendingLines; this.pendingLines = null;
        Dialog.show(lines, () => { this.showCard = true; });
      }
    },
    draw(ctx) {
      const dawnMap = { bust: 0.15, scraps: 0.85, half: 0.9, paid: 1, gilt: 1 };
      drawExterior(ctx, dawnMap[this.kind], G.time);
      const who = this.kind === 'gilt' ? 'cole' : 'sal';
      lampPool(ctx, W / 2 - 210, H * 0.62, 220, 0.8, 1.4);
      Cast[who](ctx, W / 2 - 210, H * 0.72, 1.05, G.time, { talk: Dialog.open, mood: this.kind === 'bust' ? 'down' : 'up' });
      if (this.kind === 'gilt') Cast.sal(ctx, W / 2 + 240, H * 0.73, 0.95, G.time + 4, {});
      vignette(ctx, W, H, 0.5);
      if (this.showCard) this.drawCard(ctx);
    },
    drawCard(ctx) {
      const n = G.night;
      const pw = 460, px = W / 2 - pw / 2, py = 120, ph = 400;
      ctx.save();
      ctx.translate(px + pw / 2, py + ph / 2);
      ctx.rotate(0.01);
      // cocktail napkin
      rr(ctx, -pw / 2, -ph / 2, pw, ph, 10);
      ctx.fillStyle = '#efe9da'; ctx.fill();
      ctx.strokeStyle = '#c9bfa5'; ctx.lineWidth = 1.5; ctx.stroke();
      rr(ctx, -pw / 2 + 8, -ph / 2 + 8, pw - 16, ph - 16, 8);
      ctx.strokeStyle = alpha(PAL.oxblood, 0.3); ctx.stroke();
      label(ctx, C.dawn.title, 0, -ph / 2 + 42, 24, '#4a4238', 'center', FONT.hand);
      const rows = [
        [C.dawn.wagered, E.dollars(Math.round(n.stats.wagered))],
        [C.dawn.rounds, String(n.stats.rounds)],
        [C.dawn.biggest, n.stats.biggestWin > 0 ? '+' + E.dollars(Math.round(n.stats.biggestWin)) : '—'],
        [C.dawn.worst, n.stats.biggestLoss < 0 ? '−' + E.dollars(Math.round(-n.stats.biggestLoss)) : '—'],
        [C.dawn.markers, n.markers ? String(n.markers) : 'none'],
        [C.dawn.backoffs, n.backedOff ? String(n.backedOff) : 'none']
      ];
      let yy = -ph / 2 + 92;
      for (const [k, v] of rows) {
        label(ctx, k, -pw / 2 + 44, yy, 15, '#6a6252', 'left', FONT.hand);
        label(ctx, v, pw / 2 - 44, yy, 17, '#3a3630', 'right', FONT.hand);
        ctx.strokeStyle = alpha('#6a6252', 0.2);
        ctx.beginPath(); ctx.moveTo(-pw / 2 + 44, yy + 13); ctx.lineTo(pw / 2 - 44, yy + 13); ctx.stroke();
        yy += 42;
      }
      ctx.restore();
      UI.button(ctx, 'end:done', W / 2 - 80, py + ph + 30, 160, 46, C.ui.ok, { primary: true });
    },
    action(id) {
      if (id === 'end:done') S.go('title');
    }
  });

  // exported for tables.js and main.js
  root.GiltScenes = { S, G, UI, Dialog, Talk, drawHUD, hudAction, makeRulesOverlay, NotebookOverlay, W, H };
})(typeof window !== 'undefined' ? window : globalThis);
