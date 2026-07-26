'use strict';
// LAMPBLACK — renderer (DESIGN §4.2, §4.6): Canvas 2D, 5 layers, cached
// visibility-polygon lightmap, 5-anchor defensive HUD, hold-Tab Case Notes.
var LB = (typeof LB !== 'undefined') ? LB : (typeof module !== 'undefined' ? require('./core.js') : {});

LB.Render = function (canvas) {
  var P = LB.PAL, C = LB.C, M = LB.M, T = C.TILE;
  var R = { canvas: canvas, ctx: canvas.getContext('2d'), shake: 0, shakeX: 0, shakeY: 0,
    cam: { x: 0, y: 0 }, base: null, lightCanvas: null, polyCache: {}, cacheGen: -1,
    particles: [], flash: 0, snuffFx: [] };

  R.addShake = function (amount) { R.shake = Math.min(C.SHAKE_CAP, Math.max(R.shake, amount)); }; // max, never additive

  R.resize = function () {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    var w = canvas.clientWidth || 1024, h = canvas.clientHeight || 600;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    R.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.vw = w; R.vh = h;
  };

  // ---------- layer 1: base (unlit scene, prerendered per floor) ----------
  R.bakeBase = function (floor) {
    var c = document.createElement('canvas');
    c.width = floor.w * T; c.height = floor.h * T;
    var g = c.getContext('2d');
    g.fillStyle = P.NIGHT; g.fillRect(0, 0, c.width, c.height);
    var matCol = { wood: P.WOOD, carpet: P.CARPET, marble: P.MARBLE, stone: '#2a2f40', glass: '#3d4a58' };
    for (var y = 0; y < floor.h; y++) for (var x = 0; x < floor.w; x++) {
      var s = floor.solid[y][x];
      if (floor.roomId[y][x] === 0 && s === 0) { // outside: cobbles
        g.fillStyle = ((x + y) % 2) ? '#0a0e1a' : '#0c101d';
        g.fillRect(x * T, y * T, T, T);
        continue;
      }
      if (s === 1) {
        g.fillStyle = P.WALL; g.fillRect(x * T, y * T, T, T);
        g.fillStyle = '#151a28'; g.fillRect(x * T, y * T + T - 4, T, 4);
        var wnd = floor.windowAt[x + ',' + y];
        if (wnd) {
          g.fillStyle = '#2c384a';
          g.fillRect(x * T + 4, y * T + 6, T - 8, T - 12);
          g.strokeStyle = '#4a5a74'; g.lineWidth = 2;
          g.strokeRect(x * T + 4, y * T + 6, T - 8, T - 12);
          g.beginPath(); g.moveTo(x * T + T / 2, y * T + 6); g.lineTo(x * T + T / 2, y * T + T - 6); g.stroke();
        }
        continue;
      }
      // floor at material colors × 0.35 (the unlit scene) — texture flecks
      var col = matCol[floor.material[y][x]] || P.FLOOR_UNLIT;
      g.fillStyle = shade(col, 0.35);
      g.fillRect(x * T, y * T, T, T);
      if (floor.material[y][x] === 'wood') { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x * T, y * T + (y % 2) * 16, T, 1); }
      if (floor.material[y][x] === 'marble' && (x + y) % 2) { g.fillStyle = 'rgba(255,255,255,0.02)'; g.fillRect(x * T, y * T, T, T); }
      if (floor.creaks[x + ',' + y]) { g.fillStyle = 'rgba(90,70,40,0.25)'; g.fillRect(x * T + 3, y * T + 12, T - 6, 3); g.fillRect(x * T + 6, y * T + 20, T - 12, 2); }
    }
    // furniture
    floor.furniture.forEach(function (fu) { drawFurniture(g, fu); });
    floor.doors.forEach(function (d) { /* dynamic, drawn per frame */ });
    return c;
  };
  function shade(hex, f) {
    var r = parseInt(hex.slice(1, 3), 16) * f, gg = parseInt(hex.slice(3, 5), 16) * f, b = parseInt(hex.slice(5, 7), 16) * f;
    return 'rgb(' + Math.round(r) + ',' + Math.round(gg) + ',' + Math.round(b) + ')';
  }
  function drawFurniture(g, fu) {
    var x = fu.x * T, y = fu.y * T;
    g.save();
    switch (fu.type) {
      case 'wardrobe': g.fillStyle = '#241a10'; g.fillRect(x + 2, y - 6, T - 4, T + 4); g.fillStyle = '#312414'; g.fillRect(x + 4, y - 4, T / 2 - 5, T); g.fillRect(x + T / 2 + 1, y - 4, T / 2 - 5, T); g.fillStyle = '#c9a45c'; g.fillRect(x + T / 2 - 2, y + T / 2 - 4, 2, 4); break;
      case 'bed': g.fillStyle = '#2c2033'; g.fillRect(x + 1, y + 4, T - 2, T - 8); g.fillStyle = '#3d2c44'; g.fillRect(x + 1, y + 4, T - 2, 8); g.fillStyle = '#241a10'; g.fillRect(x, y + 2, T, 3); break;
      case 'crate': g.fillStyle = '#33261a'; g.fillRect(x + 2, y + 2, T - 4, T - 4); g.strokeStyle = '#241a10'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, T - 6, T - 6); g.beginPath(); g.moveTo(x + 3, y + 3); g.lineTo(x + T - 3, y + T - 3); g.stroke(); break;
      case 'table': case 'desk': g.fillStyle = '#3a2a18'; g.fillRect(x + 2, y + 6, T - 4, T - 10); g.fillStyle = '#241a10'; g.fillRect(x + 3, y + T - 5, 3, 4); g.fillRect(x + T - 6, y + T - 5, 3, 4); if (fu.type === 'desk') { g.fillStyle = '#c9a45c'; g.fillRect(x + T / 2 - 1, y + 10, 3, 2); } break;
      case 'chair': g.fillStyle = '#2e2214'; g.fillRect(x + 8, y + 8, T - 16, T - 14); g.fillRect(x + 8, y + 2, 3, 10); break;
      case 'curtain': g.fillStyle = '#3d2430'; for (var i = 0; i < 4; i++) g.fillRect(x + 2 + i * 7, y, 5, T); break;
      case 'pedestal': g.fillStyle = '#3d4358'; g.fillRect(x + 8, y + 6, T - 16, T - 10); g.fillStyle = '#4a5270'; g.fillRect(x + 6, y + 4, T - 12, 4); break;
      case 'fireplace': g.fillStyle = '#241a14'; g.fillRect(x, y, T, T); g.fillStyle = '#0d0a08'; g.fillRect(x + 5, y + 8, T - 10, T - 10); break;
      case 'safe': g.fillStyle = '#2c343f'; g.fillRect(x + 3, y + 3, T - 6, T - 6); g.fillStyle = '#c9a45c'; g.beginPath(); g.arc(x + T / 2, y + T / 2, 5, 0, 7); g.stroke(); g.fillRect(x + T / 2 - 1, y + T / 2 - 1, 2, 2); break;
      case 'rug': g.fillStyle = 'rgba(90,45,70,0.3)'; g.fillRect(x + 2, y + 2, T - 4, T - 4); break;
      case 'dumbwaiter': g.fillStyle = '#241a10'; g.fillRect(x + 4, y, T - 8, T); g.fillStyle = '#0d0a08'; g.fillRect(x + 8, y + 6, T - 16, T - 12); g.fillStyle = '#c9a45c'; g.fillRect(x + 8, y + 4, T - 16, 2); break;
      case 'mirror': g.fillStyle = '#241a10'; g.fillRect(x + 6, y + 2, T - 12, T - 4); g.fillStyle = '#8fa3b8'; g.fillRect(x + 8, y + 4, T - 16, T - 8); break;
    }
    g.restore();
  }

  // ---------- layer 2: lightmap (half-res, visibility polygons, cached) ----------
  function visPoly(sim, l, lvl) {
    var key = lvl + ':' + l.id;
    if (R.polyCache[key] && R.polyCache[key].gen === R.cacheGen) return R.polyCache[key].pts;
    var pts = [], N = 48, cx = l.x + 0.5, cy = l.y + 0.5;
    for (var i = 0; i < N; i++) {
      var a = (i / N) * Math.PI * 2, d = 0, hit = l.r;
      for (d = 0.4; d <= l.r; d += 0.33) {
        var x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        if (sim.lightOpaque(x, y, lvl)) { hit = d; break; }
        hit = d;
      }
      pts.push({ x: cx + Math.cos(a) * hit, y: cy + Math.sin(a) * hit });
    }
    R.polyCache[key] = { gen: R.cacheGen, pts: pts };
    return pts;
  }
  function drawLightmap(g2, sim, floor, time) {
    var lvl = sim.level;
    var HALF = 0.5;
    if (!R.lightCanvas || R.lightCanvas.width !== Math.ceil(floor.w * T * HALF)) {
      R.lightCanvas = document.createElement('canvas');
      R.lightCanvas.width = Math.ceil(floor.w * T * HALF);
      R.lightCanvas.height = Math.ceil(floor.h * T * HALF);
    }
    var lg = R.lightCanvas.getContext('2d');
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.clearRect(0, 0, R.lightCanvas.width, R.lightCanvas.height);
    lg.scale(T * HALF, T * HALF);
    lg.globalCompositeOperation = 'lighter';
    var cols = { lamp: P.LAMP_CORE, candle: P.CANDLE, fire: P.FIRE };
    floor.lights.forEach(function (l) {
      if (!l.on) return;
      // breathing: ±4% sine ~0.5Hz per-lamp phase; fireplaces 1/f-ish jitter
      var breathe = 1 + 0.04 * Math.sin(time * Math.PI + l.id * 1.7);
      if (l.type === 'fire') breathe += (Math.random() - 0.5) * 0.06;
      var r = l.r * breathe;
      var pts = visPoly(sim, l, lvl);
      lg.save();
      lg.beginPath();
      pts.forEach(function (p, i) { i ? lg.lineTo(p.x, p.y) : lg.moveTo(p.x, p.y); });
      lg.closePath(); lg.clip();
      var grad = lg.createRadialGradient(l.x + 0.5, l.y + 0.5, 0.1, l.x + 0.5, l.y + 0.5, r);
      grad.addColorStop(0, cols[l.type] || P.LAMP_CORE);
      grad.addColorStop(1, 'rgba(255,180,90,0)');
      lg.globalAlpha = l.electric ? 0.9 : 0.8;
      lg.fillStyle = grad;
      lg.fillRect(l.x + 0.5 - r, l.y + 0.5 - r, r * 2, r * 2);
      lg.restore();
    });
    // moon quads — the one cold light
    floor.moonQuads.forEach(function (q) {
      lg.globalAlpha = P.MOON_ALPHA;
      lg.fillStyle = P.MOON;
      lg.fillRect(q.x, q.y, q.w, q.h);
    });
    // dynamic: guard lanterns + player dark lantern
    sim.dynamicLights.forEach(function (dl) {
      if (dl.level !== lvl) return;
      var grad2 = lg.createRadialGradient(dl.x, dl.y, 0.1, dl.x, dl.y, dl.r);
      grad2.addColorStop(0, P.LAMP_CORE);
      grad2.addColorStop(1, 'rgba(255,180,90,0)');
      lg.globalAlpha = 0.7;
      lg.fillStyle = grad2;
      lg.fillRect(dl.x - dl.r, dl.y - dl.r, dl.r * 2, dl.r * 2);
    });
    lg.globalAlpha = 1;
    g2.drawImage(R.lightCanvas, 0, 0, floor.w * T, floor.h * T);
  }

  // ---------- main scene ----------
  R.drawScene = function (S, dt) {
    // S: {sim, player, guards, teach, run, verbs, verbSel, aimAng, time, holdTab}
    var g = R.ctx, sim = S.sim, p = S.player, floor = sim.floor();
    if (R.cacheGen !== sim._renderGen) { R.cacheGen = sim._renderGen || 0; }
    R.resizeIfNeeded();
    // shake: decay ×0.85/frame, cap 6 (§4.4)
    R.shake *= C.SHAKE_DECAY;
    var shx = (Math.random() - 0.5) * 2 * R.shake, shy = (Math.random() - 0.5) * 2 * R.shake;
    g.fillStyle = P.NIGHT;
    g.fillRect(0, 0, R.vw, R.vh);
    // camera on player
    R.cam.x = M.clamp(p.x * T - R.vw / 2, -T * 2, Math.max(0, floor.w * T - R.vw + T * 2));
    R.cam.y = M.clamp(p.y * T - R.vh / 2, -T * 2, Math.max(0, floor.h * T - R.vh + T * 2));
    g.save();
    g.translate(-Math.round(R.cam.x) + shx, -Math.round(R.cam.y) + shy);
    // L1 base
    if (!R.base || R.baseFloor !== floor) { R.base = R.bakeBase(floor); R.baseFloor = floor; R.polyCache = {}; }
    g.drawImage(R.base, 0, 0);
    // doors (dynamic state)
    floor.doors.forEach(function (d) { drawDoor(g, d, sim); });
    // L2 lightmap
    drawLightmap(g, sim, floor, S.time);
    // fog: unrevealed rooms (casing IS the map)
    for (var ry = 0; ry < floor.h; ry++) for (var rx = 0; rx < floor.w; rx++) {
      var rid = floor.roomId[ry][rx];
      if (rid > 0 && !(floor.revealed && floor.revealed[rid])) {
        g.fillStyle = 'rgba(4,6,12,0.93)';
        g.fillRect(rx * T, ry * T, T, T);
      }
    }
    // L3 entities
    drawLoot(g, sim, floor);
    drawEvidenceFx(g, sim, S.time);
    S.guards.list.forEach(function (gd) { if (gd.level === sim.level && !gd.hiddenIn) drawGuardEntity(g, gd, sim, S); });
    if (S.guards.rival && !S.guards.rival.escaped) drawRival(g, S.guards.rival, sim);
    drawCart(g, floor);
    if (!p.hidden) drawPlayer(g, p, sim);
    else { var hs = p.hidden; LB.Art.drawThief(g, hs.x * T + T / 2, hs.y * T + T / 2 - 6, { pose: 'hide' }); }
    // L4 FX
    S.guards.list.forEach(function (gd) { if (gd.level === sim.level && !gd.ko && !gd.def.civilian && !gd.hiddenIn) drawCone(g, gd, sim, S); });
    drawRings(g, sim, floor);
    if (S.guards.ghost && S.guards.ghost.level === sim.level && sim.time - S.guards.ghost.t < 12) drawGhost(g, S.guards.ghost, sim);
    drawScentFootprints(g, sim);
    drawSmoke(g, sim);
    drawParticles(g, dt);
    drawThrowPreview(g, S);
    g.restore();
    // L5 HUD
    drawHUD(g, S);
    if (S.holdTab) drawCaseNotes(g, S);
  };
  R.resizeIfNeeded = function () {
    if (canvas.clientWidth && (R.vw !== canvas.clientWidth || R.vh !== canvas.clientHeight)) R.resize();
    if (!R.vw) R.resize();
  };

  function drawDoor(g, d, sim) {
    var x = d.x * T, y = d.y * T;
    var horiz = !sim.opaque(d.x - 1, d.y) || !sim.opaque(d.x + 1, d.y) ? false : true;
    g.fillStyle = d.sealed ? '#1a1e2c' : '#3a2a16';
    if (d.open) {
      g.fillRect(x, y, 6, T * 0.4); // swung open leaf
    } else {
      g.fillRect(x + 2, y, T - 4, T);
      g.fillStyle = '#241a10'; g.fillRect(x + 4, y + 2, T - 8, T - 4);
      g.fillStyle = d.locked ? '#c9a45c' : '#543a22';
      g.fillRect(x + T - 10, y + T / 2 - 2, 3, 4);
      if (d.bell && !d.disarmed) { g.fillStyle = '#c9a45c'; g.beginPath(); g.arc(x + 8, y + 6, 3, 0, 7); g.fill(); }
    }
  }
  function drawLoot(g, sim, floor) {
    floor.loot.forEach(function (l) {
      if (l.taken || l.inDesk) return;
      var x = l.x * T + T / 2, y = l.y * T + T / 2;
      var lit = sim.lightAt(l.x, l.y) > 0.15;
      g.save();
      if (l.tag === 'famous') {
        g.fillStyle = '#ffd27a'; g.fillRect(x - 5, y - 5, 10, 10);
        g.fillStyle = '#fff4d0'; g.fillRect(x - 2, y - 2, 4, 4);
        if (lit) { g.globalAlpha = 0.5 + 0.3 * Math.sin(Date.now() / 300); g.fillStyle = '#ffe9b0'; g.fillRect(x - 7, y - 1, 14, 2); g.fillRect(x - 1, y - 7, 2, 14); }
      } else {
        g.fillStyle = l.tag === 'attended' ? '#d8a86a' : '#b8b09a';
        g.fillRect(x - 3, y - 3, 7, 6);
        if (lit) { g.fillStyle = 'rgba(255,240,200,0.8)'; g.fillRect(x - 1, y - 2, 2, 2); } // glint
      }
      g.restore();
    });
  }
  function drawCart(g, floor) {
    if (!floor.cart) return;
    var x = floor.cart.x * T, y = floor.cart.y * T;
    g.fillStyle = '#241c12'; g.fillRect(x - 14, y - 8, 30, 16);
    g.fillStyle = '#382a18'; g.fillRect(x - 12, y - 12, 26, 6);
    g.fillStyle = '#151312'; g.beginPath(); g.arc(x - 8, y + 9, 5, 0, 7); g.arc(x + 10, y + 9, 5, 0, 7); g.fill();
    if (floor.cart.banked.length) { g.fillStyle = '#c9a45c'; g.fillRect(x - 8, y - 15, 18, 4); }
  }
  function drawPlayer(g, p, sim) {
    var l = sim.lightAt(p.x, p.y);
    var scarfPts = p.scarf.map(function (n) { return { x: n.x * T, y: n.y * T }; });
    g.save();
    g.globalAlpha = 0.75 + 0.25 * l;
    LB.Art.drawThief(g, p.x * T, p.y * T - 6, {
      facingOct: p.facingOct, phase: p.anim.phase, pose: p.twoHand ? 'carry' : p.anim.pose,
      mode: p.moveMode, bagFrac: p.bagUsed() / p.bagSlots, light: l,
      walkAmt: p.moveMode === 'still' ? 0 : 1
    });
    g.restore();
  }
  function drawRival(g, r, sim) {
    g.save();
    g.globalAlpha = 0.85;
    LB.Art.drawThief(g, r.x * T, r.y * T - 6, { facingOct: r.facingOct, phase: r.anim.phase, mode: 'walk', walkAmt: 1, light: sim.lightAt(r.x, r.y) });
    g.fillStyle = '#3a6a8a'; g.fillRect(r.x * T - 2, r.y * T - 16, 5, 2); // her scarf is cold blue — not you
    g.restore();
  }
  function drawGuardEntity(g, gd, sim, S) {
    var pose = gd.anim.pose;
    if (gd.ko) pose = 'ko';
    LB.Art.drawGuard(g, gd.type === 'pair' ? 'pair' : gd.type, gd.x * T, gd.y * T - 6, gd.facing, {
      phase: gd.walkPhase, pose: pose, walkAmt: (pose === 'walk' || pose === 'run') ? 1 : 0,
      shutterOpen: gd.shutterOpen, snoreT: sim.time
    });
    // awareness fill glyph over head (0–100, §2.1.2)
    if (!gd.ko && !gd.def.civilian && gd.aware > 3) {
      var x = gd.x * T - 8, y = gd.y * T - 32;
      g.fillStyle = 'rgba(10,12,20,0.7)'; g.fillRect(x, y, 16, 5);
      var frac = gd.aware / 100;
      g.fillStyle = frac < 0.35 ? '#ffe0b0' : frac < 0.7 ? '#ffb85c' : '#ff8a70';
      g.fillRect(x + 1, y + 1, 14 * frac, 3);
    }
    if (gd.state === 'suspicious') { g.fillStyle = P.SOOT_TEXT; g.font = '10px serif'; g.fillText('…eh?', gd.x * T + 8, gd.y * T - 26); }
  }
  function drawCone(g, gd, sim, S) {
    if (gd.type === 'oldcopper' && !gd.shutterOpen) return;
    if (gd.blindT > 0) return;
    var L = sim.lightAt(S.player.x, S.player.y);
    var Rr = (function () { // same math as guards.canSee
      if (gd.def.dog) return 3.5;
      var base = M.lerp(C.SIGHT_R_DARK, C.SIGHT_R_LIT, M.clamp(L, 0, 1)) * (gd.def.coneMul || 1);
      return Math.max(1, base + sim.coneDelta);
    })();
    var half = C.CONE_HALF_DEG * Math.PI / 180;
    var frac = M.clamp(gd.aware / 100, 0, 1);
    var col = frac < 0.35 ? 'rgba(255,205,120,' : frac < 0.7 ? 'rgba(255,150,80,' : 'rgba(255,90,60,';
    g.fillStyle = col + (0.13 + frac * 0.09) + ')';
    g.beginPath();
    g.moveTo(gd.x * T, gd.y * T);
    var N = 20;
    for (var i = 0; i <= N; i++) {
      var a = gd.facing + gd.headTurn - half + (i / N) * half * 2;
      var d = 0.3, hit = Rr;
      for (d = 0.3; d <= Rr; d += 0.4) {
        if (sim.opaque(gd.x + Math.cos(a) * d, gd.y + Math.sin(a) * d, gd.level)) { hit = d; break; }
        hit = d;
      }
      g.lineTo((gd.x + Math.cos(a) * hit) * T, (gd.y + Math.sin(a) * hit) * T);
    }
    g.closePath(); g.fill();
  }
  function drawRings(g, sim, floor) {
    sim.sounds.forEach(function (s) {
      if (s.level !== sim.level) return;
      var r = s.age * 6 * T, alpha = Math.max(0, 1 - s.age / 1.1) * 0.5;
      if (s.age * 6 > s.L) return; // ring dies at its loudness radius
      g.save();
      // clip to rooms the sound actually reached — rings visibly die at closed doors
      g.beginPath();
      Object.keys(s.prop.rooms).forEach(function (rid) {
        rid = +rid;
        if (rid === 0) { g.rect(0, 0, floor.w * T, floor.h * T); return; }
        var room = floor.rooms[rid - 1];
        if (room) g.rect((room.x - 0.5) * T, (room.y - 0.5) * T, (room.w + 1) * T, (room.h + 1) * T);
      });
      g.clip();
      g.strokeStyle = s.src === 'player' ? P.RING_PLAYER : s.src === 'lure' ? P.RING_LURE : P.RING_GUARD;
      g.globalAlpha = alpha;
      if (s.src !== 'player') g.setLineDash([6, 5]); // redundant with color for colorblind
      g.lineWidth = 2;
      g.beginPath(); g.arc(s.x * T, s.y * T, r, 0, Math.PI * 2); g.stroke();
      g.restore();
    });
  }
  function drawGhost(g, ghost, sim) {
    var age = sim.time - ghost.t;
    g.save();
    g.globalAlpha = Math.max(0, 0.5 - age * 0.04);
    LB.Art.drawThief(g, ghost.x * T, ghost.y * T - 6, { facingOct: 2, pose: 'idle', walkAmt: 0 });
    g.globalAlpha *= 0.5;
    g.fillStyle = '#aab2c4';
    for (var i = 0; i < 3; i++) g.fillRect(ghost.x * T - 6 + i * 5, ghost.y * T - 22 - i * 3 - age, 3, 3);
    g.restore();
  }
  function drawScentFootprints(g, sim) {
    g.save();
    sim.scent.forEach(function (n, i) {
      if (n.level !== sim.level) return;
      var age = (sim.time - n.t) / C.SCENT_TTL;
      g.globalAlpha = Math.max(0, 0.25 * (1 - age));
      g.fillStyle = '#11131c';
      g.fillRect(n.x * T - 2 + (i % 2 ? 3 : -3), n.y * T - 1, 4, 6);
    });
    g.restore();
  }
  function drawSmoke(g, sim) {
    sim.smokes.forEach(function (s) {
      if (s.level !== sim.level) return;
      g.save();
      g.globalAlpha = M.clamp(s.ttl / 3, 0.15, 0.55);
      var grad = g.createRadialGradient(s.x * T, s.y * T, 2, s.x * T, s.y * T, s.r * T);
      grad.addColorStop(0, '#3a3f4c'); grad.addColorStop(1, 'rgba(30,34,44,0)');
      g.fillStyle = grad;
      g.fillRect((s.x - s.r) * T, (s.y - s.r) * T, s.r * 2 * T, s.r * 2 * T);
      g.restore();
    });
    sim.oils.forEach(function (o) {
      if (o.level !== sim.level) return;
      g.fillStyle = 'rgba(40,36,20,0.6)';
      g.beginPath(); g.ellipse((o.x + 0.5) * T, (o.y + 0.5) * T, 12, 8, 0.4, 0, 7); g.fill();
    });
  }
  function drawEvidenceFx(g, sim, time) {
    sim.evidence.forEach(function (e) {
      if (e.level !== sim.level || e.seen) return;
      if (e.kind === 'dousedLamp') { // doused lamps smoke faintly
        g.save(); g.globalAlpha = 0.3;
        g.fillStyle = '#6a7080';
        var wob = Math.sin(time * 2 + e.x) * 2;
        g.fillRect(e.x * T + T / 2 + wob, e.y * T - 6 - (time * 7 % 12), 2, 3);
        g.restore();
      }
    });
  }
  R.spawnSnuffFx = function (x, y) {
    for (var i = 0; i < 6; i++) R.particles.push({ x: x * T + T / 2, y: y * T + T / 2, vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 8, ttl: 0.9, kind: 'soot', ph: Math.random() * 6 });
  };
  R.spawnBurstFx = function (x, y, n) {
    for (var i = 0; i < (n || 8); i++) R.particles.push({ x: x * T, y: y * T, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, ttl: 0.5, kind: 'soot' });
  };
  function drawParticles(g, dt) {
    for (var i = R.particles.length - 1; i >= 0; i--) {
      var pt = R.particles[i];
      pt.ttl -= dt;
      if (pt.ttl <= 0) { R.particles.splice(i, 1); continue; }
      pt.x += (pt.vx + (pt.kind === 'soot' && pt.ph !== undefined ? Math.sin(pt.ph += 0.1) * 6 : 0)) * dt;
      pt.y += pt.vy * dt;
      g.globalAlpha = Math.min(1, pt.ttl);
      g.fillStyle = '#4a4f5e';
      g.fillRect(pt.x, pt.y, 2, 2);
      g.globalAlpha = 1;
    }
  }
  function drawThrowPreview(g, S) {
    var v = S.verbs && S.verbs[S.verbSel];
    if (!v || ['coins', 'smoke', 'oil'].indexOf(v.id) < 0) return;
    var p = S.player, ang = S.aimAng !== undefined ? S.aimAng : p.facingOct * Math.PI / 4;
    var tx = p.x + Math.cos(ang) * p.throwRange, ty = p.y + Math.sin(ang) * p.throwRange;
    g.save();
    g.strokeStyle = P.RING_LURE; g.globalAlpha = 0.5; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(p.x * T, p.y * T);
    g.quadraticCurveTo((p.x + tx) / 2 * T, (p.y + ty) / 2 * T - 30, tx * T, ty * T);
    g.stroke();
    // landing ring at TRUE propagated radius (§3.0.4)
    var Lr = v.id === 'coins' ? C.NOISE.coinLure : 1;
    g.beginPath(); g.arc(tx * T, ty * T, Lr * T, 0, 7); g.stroke();
    g.restore();
  }

  // ---------- L5: HUD — 5 fixed anchors, inset 16, overlap impossible (§4.6) ----------
  function fontPx() { return M.clamp(R.vw * 0.014, 12, 18); }
  function drawHUD(g, S) {
    var sim = S.sim, p = S.player, f = fontPx();
    var maxW = R.vw * 0.4;
    g.save();
    g.font = f + 'px Georgia, serif';
    // TOP-LEFT: the soot gem (prime slot) + bag strip
    var l = sim.lightAt(p.x, p.y);
    var gx = 16 + 24, gy = 16 + 24;
    var glow = g.createRadialGradient(gx, gy, 2, gx, gy, 24);
    glow.addColorStop(0, 'rgba(255,220,168,' + (0.15 + l * 0.85) + ')');
    glow.addColorStop(1, 'rgba(255,220,168,0)');
    g.fillStyle = glow; g.fillRect(gx - 24, gy - 24, 48, 48);
    g.fillStyle = '#12141c'; g.beginPath(); g.arc(gx, gy, 15, 0, 7); g.fill();
    g.strokeStyle = '#3a3222'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(255,220,168,' + (0.08 + l * 0.92) + ')';
    g.beginPath(); g.arc(gx, gy, 10, 0, 7); g.fill();
    g.fillStyle = '#0a0c12'; g.beginPath(); g.arc(gx - 3, gy - 3, 4, 0, 7); g.fill(); // soot smudge on the lens
    // bag strip beneath (28px slots; strain at 5+)
    var used = 0;
    var by = gy + 30;
    for (var i = 0; i < p.bagSlots; i++) {
      var strain = p.bagUsed() >= 5 && i >= 4;
      g.strokeStyle = strain ? '#8a5a3a' : '#3a3f52';
      g.strokeRect(16 + i * 30, by, 28, 28);
    }
    var sx = 16;
    p.bag.forEach(function (lo) {
      var w = Math.max(1, lo.bulk) * 30 - 2;
      g.fillStyle = lo.tag === 'famous' ? '#ffd27a' : lo.tag === 'attended' ? '#d8a86a' : '#8a8672';
      g.fillRect(sx + 2, by + 2, w - 2, 24);
      sx += Math.max(1, lo.bulk) * 30;
    });
    if (p.twoHand) { g.fillStyle = P.SOOT_TEXT; g.fillText('◤ ' + p.twoHand.name + ' — hands FULL', 16, by + 48); }
    if (p.lastTricks > 0) { g.fillStyle = '#c8ccd8'; g.fillText('✦'.repeat(p.lastTricks) + ' last trick', 16, by + (p.twoHand ? 68 : 48)); }
    // TOP-RIGHT: alertness wall-lamp glyph + evidence ticker
    var ax = R.vw - 16, stage = sim.stage;
    g.textAlign = 'right';
    g.fillStyle = P.ALERT_RAMP[stage];
    g.beginPath(); g.arc(ax - 14, 32, 10, 0, 7); g.fill();
    g.fillStyle = '#2a2416'; g.fillRect(ax - 18, 42, 8, 8);
    g.fillStyle = P.ALERT_RAMP[stage];
    g.fillText(LB.STAGE_NAMES[stage] + ' ' + Math.round(sim.alert), ax - 34, 38);
    // pips
    for (var s2 = 0; s2 <= 3; s2++) { g.fillStyle = s2 <= stage ? P.ALERT_RAMP[stage] : '#2a2f40'; g.fillRect(ax - 34 - s2 * 10, 46, 7, 4); }
    // evidence ticker: last 3 stamps
    var stamps = sim.stamps.slice(-3);
    stamps.forEach(function (st, i) {
      var age = sim.time - st.t;
      if (age > 5) return;
      g.globalAlpha = M.clamp(1 - age / 5, 0, 1);
      g.fillStyle = '#ffb0a0';
      g.fillText('+' + st.amt + ' — ' + st.label, ax, 66 + i * (f + 4));
      g.globalAlpha = 1;
    });
    // TOP-CENTER: quota line
    g.textAlign = 'center';
    g.fillStyle = P.SOOT_TEXT;
    var quotaTxt = S.quotaText || '';
    if (quotaTxt) g.fillText(quotaTxt, R.vw / 2, 16 + f);
    // BOTTOM-CENTER: verb strip with pip+eye grammar
    g.textAlign = 'center';
    if (S.verbs && S.verbs.length) {
      var vy = R.vh - 16 - f;
      var v = S.verbs[S.verbSel % S.verbs.length];
      if (v) {
        var pips = '';
        for (var n = 0; n < 4; n++) pips += n < v.noise ? '◉' : '◌';
        var tp = '';
        for (var n2 = 0; n2 < 3; n2++) tp += n2 < v.time ? '⏱' : '·';
        var eye = v.evidence ? '  👁' : '';
        g.fillStyle = '#12141c'; var tw = Math.min(maxW, 380);
        g.globalAlpha = 0.75; g.fillRect(R.vw / 2 - tw / 2, vy - f - 22, tw, f * 2 + 26); g.globalAlpha = 1;
        g.fillStyle = P.PARCHMENT;
        g.fillText('[E] ' + v.label, R.vw / 2, vy - 8);
        g.fillStyle = '#b8925a';
        g.fillText(pips + '  ' + tp + eye + (S.verbs.length > 1 ? '   ⟨Q⟩ ' + (S.verbSel % S.verbs.length + 1) + '/' + S.verbs.length : ''), R.vw / 2, vy + f - 4);
      }
    }
    // dial minigame overlay (bottom-center, above verb strip)
    if (p.action && p.action.kind === 'dial') drawDial(g, p.action.dial);
    // BOTTOM-LEFT: Magpie note parchment
    if (S.teach && S.teach.current) {
      var note = S.teach.current;
      var slide = Math.min(1, note.age * 3);
      var fade = note.age > note.dur - 1 ? (note.dur - note.age) : 1;
      var nw = Math.min(C.NOTE_MAX_W, maxW), nh = f * 2 + 26;
      var nx = 16 - (1 - slide) * (nw + 30), ny = R.vh - 16 - nh - (S.verbs && S.verbs.length ? 70 : 0);
      g.globalAlpha = M.clamp(fade, 0, 1);
      g.fillStyle = P.PARCHMENT;
      g.save(); g.translate(nx, ny); g.rotate(-0.015);
      g.fillRect(0, 0, nw, nh);
      g.fillStyle = 'rgba(60,40,20,0.25)'; g.fillRect(0, nh - 4, nw, 4); g.fillRect(nw - 5, 0, 5, nh); // torn edge
      g.fillStyle = P.INK;
      g.font = 'italic ' + f + 'px Georgia, serif';
      g.textAlign = 'left';
      wrapText(g, '“' + note.text + '”', 10, f + 6, nw - 20, f + 3);
      g.font = (f - 3) + 'px Georgia, serif';
      g.fillText('— M.', nw - 40, nh - 8);
      g.restore();
      g.globalAlpha = 1;
    }
    // in-moment soot-script callouts (exactly 3 kinds, small, fading)
    g.textAlign = 'center'; g.font = 'italic ' + (f + 2) + 'px Georgia, serif';
    if (S.teach) S.teach.callouts.forEach(function (co, i) {
      g.globalAlpha = M.clamp(1 - co.age / co.dur, 0, 1) * 0.9;
      g.fillStyle = P.SOOT_TEXT;
      g.fillText(co.text, R.vw / 2, R.vh * 0.35 - i * (f + 8) - co.age * 8);
    });
    g.globalAlpha = 1;
    g.restore();
  }
  function drawDial(g, d) {
    var cx = R.vw / 2, cy = R.vh - 150, r = 44;
    g.save();
    g.fillStyle = '#2c343f'; g.beginPath(); g.arc(cx, cy, r + 8, 0, 7); g.fill();
    g.strokeStyle = '#c9a45c'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
    if (d.showFirst || d.notch > 0) { // Locksmith's Ear or found stops
      for (var i = 0; i < (d.showFirst ? d.notch + 1 : d.notch); i++) {
        var sa = -Math.PI / 2 + d.stops[i] * Math.PI * 2;
        g.fillStyle = '#ffd27a';
        g.fillRect(cx + Math.cos(sa) * (r - 6) - 2, cy + Math.sin(sa) * (r - 6) - 2, 4, 4);
      }
    }
    var a = -Math.PI / 2 + d.angle * Math.PI * 2;
    g.strokeStyle = '#e8ecf4'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); g.stroke();
    // subtle ring pulse near the felt stop
    var near = Math.abs(d.angle - d.stops[d.notch]) < d.zone * 2;
    if (near) { g.strokeStyle = 'rgba(255,220,168,0.6)'; g.beginPath(); g.arc(cx, cy, r + 4 + Math.sin(Date.now() / 80) * 2, 0, 7); g.stroke(); }
    g.fillStyle = P.SOOT_TEXT; g.textAlign = 'center'; g.font = '12px Georgia, serif';
    g.fillText('release at the felt click — ' + d.notch + '/3', cx, cy + r + 24);
    g.restore();
  }
  function wrapText(g, text, x, y, maxW, lh) {
    var words = text.split(' '), line = '', yy = y;
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i] + ' ';
      if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = words[i] + ' '; yy += lh; }
      else line = test;
    }
    g.fillText(line, x, yy);
  }

  // ---------- hold-Tab: Case Notes (charcoal-sketch, live, unpaused §3.1) ----------
  function drawCaseNotes(g, S) {
    var sim = S.sim, floor = sim.floor(), p = S.player;
    g.save();
    g.fillStyle = 'rgba(12,10,8,0.88)';
    g.fillRect(0, 0, R.vw, R.vh);
    var scale = Math.min((R.vw - 120) / (floor.w * 10), (R.vh - 120) / (floor.h * 10), 1.4);
    var cell = 10 * scale;
    var ox = (R.vw - floor.w * cell) / 2, oy = (R.vh - floor.h * cell) / 2;
    g.translate(ox, oy);
    // charcoal plan: revealed rooms sketched
    floor.rooms.forEach(function (room) {
      var known = floor.revealed && floor.revealed[room.id];
      g.strokeStyle = known ? '#c8bfa8' : '#3a362c';
      g.lineWidth = known ? 2 : 1;
      g.strokeRect(room.x * cell, room.y * cell, room.w * cell, room.h * cell);
      if (known) {
        g.fillStyle = 'rgba(200,190,168,0.06)';
        g.fillRect(room.x * cell, room.y * cell, room.w * cell, room.h * cell);
        g.fillStyle = '#8a8266'; g.font = Math.max(9, 11 * scale) + 'px Georgia, serif';
        g.fillText(room.type, room.x * cell + 3, room.y * cell + 12);
      }
    });
    floor.doors.forEach(function (d) {
      g.fillStyle = d.sealed ? '#6a3a34' : d.locked ? '#c9a45c' : '#c8bfa8';
      g.fillRect(d.x * cell + cell * 0.2, d.y * cell + cell * 0.2, cell * 0.6, cell * 0.6);
    });
    floor.windows.forEach(function (w) {
      g.fillStyle = w.sealed ? '#6a3a34' : '#7ab8d8';
      g.fillRect(w.x * cell, w.y * cell + cell * 0.3, cell, cell * 0.4);
    });
    // observed patrols: dotted routes that persist (casing pays)
    g.fillStyle = '#b89f6a';
    S.guards.list.forEach(function (gd) {
      if (gd.ko || gd.level !== sim.level) return;
      var room = sim.roomAt(gd.x, gd.y);
      if (floor.revealed && floor.revealed[room]) {
        g.beginPath(); g.arc(gd.x * cell, gd.y * cell, 3, 0, 7); g.fill();
        if (gd.patrol) gd.patrol.forEach(function (wp) {
          if (floor.revealed[wp.roomId]) { g.fillRect(wp.x * cell - 1, wp.y * cell - 1, 2, 2); }
        });
      }
    });
    // you + the cart
    g.fillStyle = '#e8ecf4'; g.beginPath(); g.arc(p.x * cell, p.y * cell, 4, 0, 7); g.fill();
    if (floor.cart) { g.fillStyle = '#c9a45c'; g.fillRect(floor.cart.x * cell - 4, floor.cart.y * cell - 3, 8, 6); }
    // interactables in your room, labeled with verb grammar
    g.font = '11px Georgia, serif';
    if (S.verbs) S.verbs.slice(0, 6).forEach(function (v, i) {
      g.fillStyle = '#c8bfa8';
      g.fillText('› ' + v.label + '  ' + '◉'.repeat(v.noise) + (v.evidence ? ' 👁' : ''), 8, floor.h * cell + 18 + i * 14);
    });
    g.restore();
    g.fillStyle = '#c8bfa8'; g.font = '13px Georgia, serif'; g.textAlign = 'center';
    g.fillText('— CASE NOTES (release Tab) —', R.vw / 2, 24);
    g.textAlign = 'left';
  }

  return R;
};

if (typeof module !== 'undefined') module.exports = LB;
