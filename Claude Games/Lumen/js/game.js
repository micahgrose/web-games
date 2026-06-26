/* Lumen — a small spark adrift in the deep.
   Self-contained canvas game. Pointer / touch / keyboard. */
(function () {
  'use strict';

  // ---------- canvas ----------
  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d');
  var DPR = 1, W = 0, H = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- helpers ----------
  var TAU = Math.PI * 2;
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  // ---------- persistent best ----------
  var BEST_KEY = 'lumen.best.v1';
  function getBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; }
    catch (e) { return 0; }
  }
  function setBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) {}
  }

  // ---------- dom ----------
  var el = {
    hud: document.getElementById('hud'),
    score: document.getElementById('score'),
    mult: document.getElementById('mult'),
    pips: document.getElementById('pips'),
    pauseBtn: document.getElementById('pauseBtn'),
    flash: document.getElementById('flash'),
    title: document.getElementById('title'),
    titleBest: document.getElementById('titleBest'),
    playBtn: document.getElementById('playBtn'),
    pause: document.getElementById('pause'),
    resumeBtn: document.getElementById('resumeBtn'),
    quitBtn: document.getElementById('quitBtn'),
    over: document.getElementById('over'),
    overTitle: document.getElementById('overTitle'),
    finalScore: document.getElementById('finalScore'),
    finalMeta: document.getElementById('finalMeta'),
    overBest: document.getElementById('overBest'),
    againBtn: document.getElementById('againBtn')
  };

  // ---------- state ----------
  var STATE = { MENU: 0, PLAY: 1, PAUSE: 2, OVER: 3 };
  var state = STATE.MENU;

  var player, motes, hazards, powers, particles, dust;
  var score, displayScore, combo, mult, shields, maxShields;
  var iFrames, elapsed, spawnMote, spawnHaz, spawnPow, intensity;
  var slowTimer, shake, bestAtStart, novaFlash;
  var pointerActive, keys;

  var MAX_SHIELDS = 5;
  var MULT_TIERS = [0, 4, 10, 18, 30, 46, 68];   // streak thresholds -> mult = index+1

  function multForCombo(c) {
    var m = 1;
    for (var i = 0; i < MULT_TIERS.length; i++) if (c >= MULT_TIERS[i]) m = i + 1;
    return m;
  }

  // ---------- input ----------
  keys = {};
  pointerActive = false;
  var target = { x: 0, y: 0 };

  function setTargetFromEvent(clientX, clientY) {
    target.x = clamp(clientX, 0, W);
    target.y = clamp(clientY, 0, H);
    pointerActive = true;
  }

  canvas.addEventListener('mousemove', function (e) {
    if (state === STATE.PLAY) setTargetFromEvent(e.clientX, e.clientY);
  });
  canvas.addEventListener('touchstart', function (e) {
    if (state === STATE.PLAY) { var t = e.touches[0]; setTargetFromEvent(t.clientX, t.clientY); e.preventDefault(); }
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    if (state === STATE.PLAY) { var t = e.touches[0]; setTargetFromEvent(t.clientX, t.clientY); e.preventDefault(); }
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    keys[k] = true;
    if (k === 'p' || k === 'escape') {
      if (state === STATE.PLAY) doPause();
      else if (state === STATE.PAUSE) doResume();
    }
    if (k === 'm') { Sound.setMuted(!Sound.isMuted()); }
    if ((k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' ||
         k === 'arrowright' || k === ' ') && state === STATE.PLAY) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

  // pause/resume when tab hidden
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === STATE.PLAY) doPause();
  });

  // ---------- entities ----------
  function newPlayer() {
    return { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 11, trail: [], glow: 0 };
  }

  function spawnMoteEntity() {
    // drift in from a random edge toward a loosely opposite area
    var edge = Math.floor(rand(0, 4));
    var x, y;
    if (edge === 0) { x = rand(0, W); y = -20; }
    else if (edge === 1) { x = W + 20; y = rand(0, H); }
    else if (edge === 2) { x = rand(0, W); y = H + 20; }
    else { x = -20; y = rand(0, H); }
    var tx = rand(W * 0.2, W * 0.8), ty = rand(H * 0.2, H * 0.8);
    var a = Math.atan2(ty - y, tx - x);
    var sp = rand(22, 46);
    motes.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: 6, life: 0, ph: rand(0, TAU)
    });
  }

  function spawnHazardEntity() {
    var edge = Math.floor(rand(0, 4));
    var x, y;
    if (edge === 0) { x = rand(0, W); y = -30; }
    else if (edge === 1) { x = W + 30; y = rand(0, H); }
    else if (edge === 2) { x = rand(0, W); y = H + 30; }
    else { x = -30; y = rand(0, H); }
    // aim roughly across the screen with scatter; bigger ones move slower
    var tx = rand(W * 0.15, W * 0.85), ty = rand(H * 0.15, H * 0.85);
    var a = Math.atan2(ty - y, tx - x) + rand(-0.35, 0.35);
    var big = Math.random() < 0.32;
    var r = big ? rand(20, 30) : rand(11, 17);
    var base = big ? rand(34, 58) : rand(70, 112);
    var sp = base * (1 + intensity * 0.12);
    hazards.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: r, spin: rand(-1.4, 1.4), rot: rand(0, TAU),
      spikes: Math.floor(rand(5, 8)), life: 0
    });
  }

  var POWER_KINDS = ['shield', 'slow', 'nova'];
  function spawnPowerEntity() {
    var kind;
    // bias toward shield when low, nova/slow otherwise
    if (shields <= 1) kind = Math.random() < 0.6 ? 'shield' : POWER_KINDS[Math.floor(rand(0, 3))];
    else kind = POWER_KINDS[Math.floor(rand(0, 3))];
    var m = 60;
    powers.push({
      x: rand(m, W - m), y: rand(m, H - m),
      vx: rand(-12, 12), vy: rand(-12, 12),
      r: 13, kind: kind, life: 0, ttl: 11
    });
  }

  function burst(x, y, color, n, spd) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, TAU), s = rand(spd * 0.3, spd);
      particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: rand(1.5, 3.5), life: 0, ttl: rand(0.4, 0.9), color: color
      });
    }
  }

  function makeDust() {
    dust = [];
    var n = Math.floor((W * H) / 26000);
    n = clamp(n, 26, 90);
    for (var i = 0; i < n; i++) {
      dust.push({
        x: rand(0, W), y: rand(0, H),
        z: rand(0.25, 1), r: rand(0.6, 1.8), ph: rand(0, TAU),
        vx: rand(-6, 6), vy: rand(-6, 6)
      });
    }
  }

  // ---------- lifecycle ----------
  function resetRun() {
    player = newPlayer();
    motes = []; hazards = []; powers = []; particles = [];
    score = 0; displayScore = 0; combo = 0; mult = 1;
    maxShields = 3; shields = 3;
    iFrames = 0; elapsed = 0;
    spawnMote = 0.0; spawnHaz = 1.2; spawnPow = 9;
    intensity = 0; slowTimer = 0; shake = 0; novaFlash = 0;
    bestStreakMult = 1;
    target.x = W / 2; target.y = H / 2;
    pointerActive = false;
    makeDust();
    renderPips();
    updateMultUI();
    el.score.textContent = '0';
  }

  function startGame() {
    bestAtStart = getBest();
    resetRun();
    state = STATE.PLAY;
    el.title.classList.add('hidden');
    el.over.classList.add('hidden');
    el.pause.classList.add('hidden');
    el.hud.classList.remove('hidden');
    document.body.classList.remove('show-cursor');
    Sound.unlock();
    Sound.start();
  }

  function doPause() {
    if (state !== STATE.PLAY) return;
    state = STATE.PAUSE;
    el.pause.classList.remove('hidden');
    document.body.classList.add('show-cursor');
  }
  function doResume() {
    if (state !== STATE.PAUSE) return;
    state = STATE.PLAY;
    el.pause.classList.add('hidden');
    document.body.classList.remove('show-cursor');
  }

  function gameOver() {
    state = STATE.OVER;
    Sound.over();
    burst(player.x, player.y, '#6ad6ff', 46, 320);
    shake = Math.min(shake + 16, 22);
    document.body.classList.add('show-cursor');

    var best = getBest();
    var isNew = score > best;
    if (isNew) { best = score; setBest(best); }

    el.finalScore.textContent = String(score);
    var secs = Math.floor(elapsed);
    var mm = Math.floor(secs / 60), ss = secs % 60;
    el.finalMeta.textContent = 'lasted ' + mm + ':' + (ss < 10 ? '0' : '') + ss +
      '  ·  best streak ×' + bestStreakMult;
    el.overTitle.textContent = isNew ? 'A new high' : 'Drifted away';
    el.overBest.innerHTML = isNew
      ? 'New best — <b>' + best + '</b>'
      : 'Best <b>' + best + '</b>';

    // small delay so the death burst is visible before the panel
    setTimeout(function () {
      if (state === STATE.OVER) {
        el.hud.classList.add('hidden');
        el.over.classList.remove('hidden');
      }
    }, 650);
  }

  var bestStreakMult = 1;

  // ---------- pickups / hits ----------
  function flash(color, strength) {
    el.flash.style.transition = 'none';
    el.flash.style.background = color;
    el.flash.style.opacity = String(strength);
    // force reflow then fade
    void el.flash.offsetWidth;
    el.flash.style.transition = 'opacity 0.5s ease';
    el.flash.style.opacity = '0';
  }

  function collectMote(m) {
    combo += 1;
    mult = multForCombo(combo);
    if (mult > bestStreakMult) bestStreakMult = mult;
    score += 1 * mult;
    player.glow = 1;
    Sound.pickup(combo);
    burst(m.x, m.y, '#ffd27a', 9, 150);
    updateMultUI();
  }

  function takeHit() {
    if (iFrames > 0) return;
    shields -= 1;
    combo = 0; mult = 1;
    updateMultUI();
    iFrames = 1.3;
    shake = Math.min(shake + 13, 22);
    flash('#ff4d6d', 0.5);
    Sound.hit();
    if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} }
    burst(player.x, player.y, '#ff4d6d', 18, 220);
    renderPips();
    if (shields <= 0) gameOver();
  }

  function applyPower(p) {
    Sound.power();
    burst(p.x, p.y, powerColor(p.kind), 16, 200);
    if (p.kind === 'shield') {
      if (shields < MAX_SHIELDS) { shields += 1; renderPips(); }
      else { score += 15 * mult; }     // overflow -> small bonus
      flash('#6ad6ff', 0.28);
    } else if (p.kind === 'slow') {
      slowTimer = 5.5;
      flash('#b07bff', 0.26);
    } else if (p.kind === 'nova') {
      novaFlash = 1;
      flash('#eaf6ff', 0.5);
      Sound.nova();
      shake = Math.min(shake + 9, 22);
      // clear hazards near the player into particles
      for (var i = hazards.length - 1; i >= 0; i--) {
        var hz = hazards[i];
        burst(hz.x, hz.y, '#ff4d6d', 10, 200);
        hazards.splice(i, 1);
      }
    }
  }

  function powerColor(kind) {
    return kind === 'shield' ? '#6ad6ff' : kind === 'slow' ? '#b07bff' : '#eaf6ff';
  }

  // ---------- UI ----------
  function renderPips() {
    var html = '';
    for (var i = 0; i < maxShields; i++) {
      html += '<span class="pip' + (i < shields ? '' : ' spent') + '"></span>';
    }
    // show extra earned shields beyond the starting three
    for (var j = maxShields; j < shields; j++) html += '<span class="pip"></span>';
    el.pips.innerHTML = html;
  }
  function updateMultUI() {
    if (mult > 1) {
      el.mult.classList.remove('hidden');
      el.mult.textContent = '×' + mult + '  ' + combo + ' streak';
    } else {
      el.mult.classList.add('hidden');
    }
  }

  // ---------- update ----------
  function update(dt) {
    elapsed += dt;
    intensity = elapsed / 22;            // ramps difficulty over minutes
    if (iFrames > 0) iFrames = Math.max(0, iFrames - dt);
    if (slowTimer > 0) slowTimer = Math.max(0, slowTimer - dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 26);
    if (novaFlash > 0) novaFlash = Math.max(0, novaFlash - dt * 2);
    if (player.glow > 0) player.glow = Math.max(0, player.glow - dt * 3);

    var slow = slowTimer > 0 ? 0.42 : 1;

    // smooth score counter
    displayScore = lerp(displayScore, score, 1 - Math.pow(0.001, dt));
    el.score.textContent = String(Math.round(displayScore));

    // ----- player movement -----
    // keyboard nudges the target so all three input styles share one path
    var kx = 0, ky = 0;
    if (keys['arrowleft'] || keys['a']) kx -= 1;
    if (keys['arrowright'] || keys['d']) kx += 1;
    if (keys['arrowup'] || keys['w']) ky -= 1;
    if (keys['arrowdown'] || keys['s']) ky += 1;
    if (kx || ky) {
      var kl = Math.hypot(kx, ky) || 1;
      target.x = clamp(target.x + (kx / kl) * 520 * dt, 0, W);
      target.y = clamp(target.y + (ky / kl) * 520 * dt, 0, H);
      pointerActive = true;
    }

    if (pointerActive) {
      // critically-damped-ish follow: weighty but responsive
      var follow = 1 - Math.pow(0.0009, dt);
      player.x = lerp(player.x, target.x, follow);
      player.y = lerp(player.y, target.y, follow);
    }
    player.x = clamp(player.x, player.r, W - player.r);
    player.y = clamp(player.y, player.r, H - player.r);

    // trail
    player.trail.push({ x: player.x, y: player.y });
    if (player.trail.length > 16) player.trail.shift();

    // ----- spawns -----
    spawnMote -= dt;
    if (spawnMote <= 0) {
      spawnMoteEntity();
      spawnMote = clamp(0.85 - intensity * 0.05, 0.4, 0.9);
      if (motes.length > 14) spawnMote += 0.6;
    }
    spawnHaz -= dt;
    if (spawnHaz <= 0) {
      spawnHazardEntity();
      spawnHaz = clamp(1.5 - intensity * 0.13, 0.45, 1.5);
    }
    spawnPow -= dt;
    if (spawnPow <= 0) {
      spawnPowerEntity();
      spawnPow = rand(10, 15);
    }

    // ----- motes -----
    for (var i = motes.length - 1; i >= 0; i--) {
      var m = motes[i];
      m.x += m.vx * dt * slow;
      m.y += m.vy * dt * slow;
      m.life += dt;
      if (m.x < -40 || m.x > W + 40 || m.y < -40 || m.y > H + 40) { motes.splice(i, 1); continue; }
      var pull = (player.r + m.r + 4);
      if (dist2(player.x, player.y, m.x, m.y) < pull * pull) {
        collectMote(m);
        motes.splice(i, 1);
      }
    }

    // ----- hazards -----
    for (var h = hazards.length - 1; h >= 0; h--) {
      var hz = hazards[h];
      hz.x += hz.vx * dt * slow;
      hz.y += hz.vy * dt * slow;
      hz.rot += hz.spin * dt * slow;
      hz.life += dt;
      if (hz.x < -60 || hz.x > W + 60 || hz.y < -60 || hz.y > H + 60) { hazards.splice(h, 1); continue; }
      var rr = player.r + hz.r - 3;       // slightly forgiving collision
      if (dist2(player.x, player.y, hz.x, hz.y) < rr * rr) {
        takeHit();
        if (state !== STATE.PLAY) return;
      }
    }

    // ----- powers -----
    for (var p = powers.length - 1; p >= 0; p--) {
      var pw = powers[p];
      pw.x += pw.vx * dt * slow;
      pw.y += pw.vy * dt * slow;
      pw.life += dt;
      if (pw.x < 30 || pw.x > W - 30) pw.vx *= -1;
      if (pw.y < 30 || pw.y > H - 30) pw.vy *= -1;
      if (pw.life > pw.ttl) { powers.splice(p, 1); continue; }
      var pr = player.r + pw.r + 2;
      if (dist2(player.x, player.y, pw.x, pw.y) < pr * pr) {
        applyPower(pw);
        powers.splice(p, 1);
      }
    }

    // ----- particles -----
    for (var c = particles.length - 1; c >= 0; c--) {
      var pt = particles[c];
      pt.life += dt;
      if (pt.life > pt.ttl) { particles.splice(c, 1); continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.94; pt.vy *= 0.94;
    }

    // ----- dust drift -----
    for (var d = 0; d < dust.length; d++) {
      var du = dust[d];
      du.x += du.vx * dt * du.z;
      du.y += du.vy * dt * du.z;
      if (du.x < 0) du.x += W; if (du.x > W) du.x -= W;
      if (du.y < 0) du.y += H; if (du.y > H) du.y -= H;
    }
  }

  // ---------- render ----------
  function draw() {
    var ox = 0, oy = 0;
    if (shake > 0.2) { ox = rand(-shake, shake); oy = rand(-shake, shake); }

    ctx.setTransform(DPR, 0, 0, DPR, ox * DPR, oy * DPR);

    // background gradient
    var g = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#0a1124');
    g.addColorStop(1, '#04060c');
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, W + 80, H + 80);

    // dust
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < dust.length; i++) {
      var du = dust[i];
      var tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(performance.now() * 0.001 + du.ph));
      ctx.globalAlpha = 0.5 * du.z * tw;
      ctx.fillStyle = '#8fb6ff';
      ctx.beginPath();
      ctx.arc(du.x, du.y, du.r * du.z, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // slow-time tint
    if (slowTimer > 0) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(140, 90, 230, ' + (0.06 * Math.min(1, slowTimer)) + ')';
      ctx.fillRect(-40, -40, W + 80, H + 80);
      ctx.globalCompositeOperation = 'lighter';
    }

    // motes
    for (var m2 = 0; m2 < motes.length; m2++) {
      var m = motes[m2];
      var pr = 0.7 + 0.3 * Math.sin(m.life * 4 + m.ph);
      glowDot(m.x, m.y, m.r + 5 * pr, '#ffd27a', 0.9);
      glowDot(m.x, m.y, m.r * 0.5, '#fff4d6', 1);
    }

    // powers
    for (var p2 = 0; p2 < powers.length; p2++) drawPower(powers[p2]);

    // particles
    for (var c = 0; c < particles.length; c++) {
      var pt = particles[c];
      var a = 1 - pt.life / pt.ttl;
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r * (0.5 + a * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // hazards (drawn over so danger reads clearly)
    for (var h2 = 0; h2 < hazards.length; h2++) drawHazard(hazards[h2]);

    // player
    drawPlayer();

    // nova ring
    if (novaFlash > 0) {
      var nr = (1 - novaFlash) * Math.max(W, H) * 0.9;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(234,246,255,' + novaFlash * 0.7 + ')';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(player.x, player.y, nr, 0, TAU);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function glowDot(x, y, r, color, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    ctx.globalCompositeOperation = 'lighter';
    // trail
    for (var i = 0; i < player.trail.length; i++) {
      var t = player.trail[i];
      var f = i / player.trail.length;
      ctx.globalAlpha = f * 0.5;
      ctx.fillStyle = '#6ad6ff';
      ctx.beginPath();
      ctx.arc(t.x, t.y, player.r * f * 0.85, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    var blink = iFrames > 0 ? (0.4 + 0.6 * Math.abs(Math.sin(elapsed * 22))) : 1;
    var haloR = player.r * (2.4 + player.glow * 1.2);
    glowDot(player.x, player.y, haloR, '#6ad6ff', 0.55 * blink);
    glowDot(player.x, player.y, player.r * 1.5, '#bfeaff', 0.9 * blink);
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r * 0.7, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawHazard(hz) {
    ctx.globalCompositeOperation = 'source-over';
    // soft danger glow
    glowDot(hz.x, hz.y, hz.r * 2.1, 'rgba(255,77,109,0.5)', 0.8);
    ctx.save();
    ctx.translate(hz.x, hz.y);
    ctx.rotate(hz.rot);
    ctx.beginPath();
    var n = hz.spikes;
    for (var i = 0; i < n * 2; i++) {
      var ang = (i / (n * 2)) * TAU;
      var rad = (i % 2 === 0) ? hz.r : hz.r * 0.56;
      var x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, hz.r);
    g.addColorStop(0, '#ffd0da');
    g.addColorStop(0.5, '#ff4d6d');
    g.addColorStop(1, '#b3203f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,200,210,0.5)';
    ctx.stroke();
    ctx.restore();
  }

  function drawPower(pw) {
    var col = powerColor(pw.kind);
    var pulse = 0.6 + 0.4 * Math.sin(pw.life * 5);
    // fade as it nears expiry
    var fade = pw.life > pw.ttl - 2 ? clamp(pw.ttl - pw.life, 0, 2) / 2 : 1;
    ctx.globalAlpha = fade;
    glowDot(pw.x, pw.y, pw.r * (1.7 + pulse * 0.5), col, 0.6);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(pw.x, pw.y);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, pw.r, 0, TAU);
    ctx.stroke();
    // glyph per kind
    ctx.fillStyle = col;
    ctx.lineWidth = 2;
    if (pw.kind === 'shield') {
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(5, -3); ctx.lineTo(5, 2);
      ctx.lineTo(0, 7); ctx.lineTo(-5, 2); ctx.lineTo(-5, -3);
      ctx.closePath(); ctx.fill();
    } else if (pw.kind === 'slow') {
      ctx.beginPath(); ctx.arc(0, 0, 6, -Math.PI / 2, Math.PI * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -5); ctx.moveTo(0, 0); ctx.lineTo(4, 1); ctx.stroke();
    } else {
      for (var i = 0; i < 8; i++) {
        var a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 2.5, Math.sin(a) * 2.5);
        ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ---------- loop ----------
  var last = performance.now();
  function frame(now) {
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;   // clamp big gaps (tab switches)

    if (state === STATE.PLAY) update(dt);

    if (state !== STATE.MENU) {
      draw();
    } else {
      // idle ambient behind the title
      drawIdle();
    }
    requestAnimationFrame(frame);
  }

  // ambient backdrop for the menu
  var idleDust = null;
  function drawIdle() {
    if (!idleDust) { makeDust(); idleDust = dust; }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var g = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#0a1124'); g.addColorStop(1, '#04060c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < idleDust.length; i++) {
      var du = idleDust[i];
      du.x += du.vx * 0.016 * du.z; du.y += du.vy * 0.016 * du.z;
      if (du.x < 0) du.x += W; if (du.x > W) du.x -= W;
      if (du.y < 0) du.y += H; if (du.y > H) du.y -= H;
      var tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(performance.now() * 0.001 + du.ph));
      ctx.globalAlpha = 0.5 * du.z * tw;
      ctx.fillStyle = '#8fb6ff';
      ctx.beginPath(); ctx.arc(du.x, du.y, du.r * du.z, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- wire up ----------
  function showTitle() {
    state = STATE.MENU;
    var best = getBest();
    el.titleBest.innerHTML = best > 0 ? 'Best <b>' + best + '</b>' : '';
    el.title.classList.remove('hidden');
    el.hud.classList.add('hidden');
    document.body.classList.add('show-cursor');
  }

  el.playBtn.addEventListener('click', startGame);
  el.againBtn.addEventListener('click', startGame);
  el.resumeBtn.addEventListener('click', doResume);
  el.pauseBtn.addEventListener('click', function () {
    if (state === STATE.PLAY) doPause(); else if (state === STATE.PAUSE) doResume();
  });
  el.quitBtn.addEventListener('click', function () {
    state = STATE.OVER;
    el.pause.classList.add('hidden');
    showTitle();
  });

  // space / enter to begin or restart from a screen
  window.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter') {
      if (state === STATE.MENU) { startGame(); }
      else if (state === STATE.OVER && !el.over.classList.contains('hidden')) { startGame(); }
    }
  });

  showTitle();
  requestAnimationFrame(frame);
})();
