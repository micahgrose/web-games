/* =========================================================================
   SYMBIONT — an 8-bit possession platformer (crafted campaign)
   You are a blight-spirit: a parasite invading a pure world. Alone you are a
   fragile wisp that fades. Sink into the world's creatures to wear their
   bodies and their movement — a Dart to dash a gap, a Brute to smash a wall,
   a Floater to fly a chasm. But your essence poisons every host: it decays
   and crumbles, so you must keep hopping forward. The husks you leave are the
   evidence of what you are.

   Logic is fully separated from rendering so a headless harness can drive the
   simulation (no DOM access outside boot()/audio).
   ========================================================================= */
(function () {
  "use strict";
  var ROOT = (typeof window !== "undefined") ? window : globalThis;

  // ---- constants --------------------------------------------------------
  var TS = 32;                 // tile size
  var VIEW_W = 960, VIEW_H = 576; // viewport (30x18 tiles)
  var GRAV = 2100;
  var TAU = Math.PI * 2;

  // ---- math helpers -----------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
  function approach(v, target, amt) { return v < target ? Math.min(v + amt, target) : Math.max(v - amt, target); }
  function aabb(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function rand(g) { g._seed = (g._seed * 1664525 + 1013904223) >>> 0; return g._seed / 4294967296; }
  function rrange(g, a, b) { return a + rand(g) * (b - a); }

  // ---- body definitions (platformer profiles + kit) ---------------------
  // jumpV tuned vs GRAV=2100: h = jumpV^2/(2*GRAV).  600 -> ~86px (~2.7 tiles)
  var BODIES = {
    husk: {
      key: "husk", name: "Husk",
      col: "#7fc456", dark: "#3c5e28", eye: "#f4ffd0",
      w: 22, h: 28, speed: 165, accel: 1500, airAccel: 900,
      jumpV: 600, doubleJump: false, fly: false,
      maxHp: 30, maxVit: 16, decay: 0.85, will: 0,
      power: "swipe", smash: false,
      desc: "A meek field-thing. Walks, hops, swipes. The body you learn on."
    },
    brute: {
      key: "brute", name: "Brute", col: "#c9763c", dark: "#7a3f1c", eye: "#ffe2b0",
      w: 38, h: 38, speed: 115, accel: 1000, airAccel: 500,
      jumpV: 470, doubleJump: false, fly: false,
      maxHp: 80, maxVit: 13, decay: 1.15, will: 0,
      power: "pound", smash: true,
      desc: "Slow, immense. A ground-pound shatters sealed walls. Burns out fast."
    },
    dart: {
      key: "dart", name: "Dart", col: "#3fb6d0", dark: "#1d6a86", eye: "#dffaff",
      w: 22, h: 18, speed: 300, accel: 2600, airAccel: 2000,
      jumpV: 560, doubleJump: true, fly: false,
      maxHp: 18, maxVit: 15, decay: 1.0, will: 0,
      power: "dash", smash: false,
      desc: "Quick and brittle. Double-jumps, and DASHES across gaps no Husk could clear."
    },
    floater: {
      key: "floater", name: "Floater", col: "#b06bd6", dark: "#6a3f8a", eye: "#f3d9ff",
      w: 26, h: 24, speed: 150, accel: 1100, airAccel: 1100,
      jumpV: 360, doubleJump: false, fly: true, flap: 1700, flyMax: 230,
      maxHp: 16, maxVit: 14, decay: 1.05, will: 0,
      power: "none", smash: false,
      desc: "A drifting bladder. Hold jump to FLY — the only way over a true chasm."
    },
    warden: {
      key: "warden", name: "Warden", col: "#c7c9da", dark: "#6c6f86", eye: "#ffe4d0",
      w: 30, h: 36, speed: 130, accel: 1100, airAccel: 600,
      jumpV: 520, doubleJump: false, fly: false,
      maxHp: 120, maxVit: 20, decay: 0.7, will: 0.45,
      power: "swipe", smash: false, elite: true,
      desc: "A guardian of the pure world. Resists your blight until wounded — then a durable host."
    }
  };

  // ---- LEVEL (Wing 1) — authored as rects/markers, not fragile ASCII -----
  // tile coords. rect = [x,y,w,h] in tiles.
  function levelWing1() {
    return {
      wTiles: 76, hTiles: 20,
      // solid terrain
      solids: [
        [0, 17, 10, 3],         // start plateau
        [12, 17, 8, 3],         // after jump-gap (2-tile teaching hop)
        [26, 17, 14, 3],        // after dart-gap (brute corridor)
        [30, 9, 10, 1],         // low roof above the sealed wall (no fly-over cheese)
        [48, 17, 28, 3],        // after floater chasm -> safe room + finish
        [0, 16, 1, 1], [75, 8, 1, 12] // left lip / right wall
      ],
      oneway: [
        [14, 14, 3, 1],         // little ledge to hint jumping up
      ],
      spikes: [
        [10, 19, 2, 1],         // jump-gap pit floor
        [20, 19, 6, 1],         // dart-gap pit floor
        [40, 19, 8, 1],         // floater chasm pit floor
      ],
      breakable: [
        [33, 10, 1, 7],         // sealed wall (brute smashes), full corridor height
      ],
      enemies: [
        { type: "husk", tx: 6, ty: 16 },     // first host
        { type: "dart", tx: 17, ty: 16 },    // for the dart-gap
        { type: "brute", tx: 28, ty: 16 },   // for the wall
        { type: "floater", tx: 37, ty: 15 }, // for the chasm
        { type: "husk", tx: 52, ty: 16 },    // safe-room host
        { type: "warden", tx: 70, ty: 16 },  // the guardian, before the rift
      ],
      safe: [ [48, 11, 12, 7], [0, 13, 9, 5] ], // decay pauses here
      checkpoints: [ { tx: 3, ty: 16 }, { tx: 51, ty: 16 } ],
      signs: [
        { tx: 4, ty: 15, text: "Fragile thing... you fade in the open. Sink into a body — press J — and wear it." },
        { tx: 13, ty: 15, text: "Carry it. A and D to walk. SPACE to leap. (Hold to leap higher.)" },
        { tx: 19, ty: 15, text: "Too far to jump. The blue one is FAST — wear it, then J in the air to DASH across." },
        { tx: 28, ty: 15, text: "A sealed wall. Only the heavy one can break it. Wear a Brute and POUND (J) beside it." },
        { tx: 37, ty: 12, text: "A chasm. No legs will cross it. Steal the floating bladder and HOLD SPACE to fly." },
        { tx: 50, ty: 15, text: "Here the pure world cannot see you. Your stolen flesh holds. Rest, then take the rift." },
        { tx: 66, ty: 15, text: "A guardian. It will not yield its body easily — wound it first, then take it. The rift is beyond." },
      ],
      start: { tx: 3, ty: 15 },
      goal: { tx: 73, ty: 14 },
    };
  }

  // build collision grid + entity list from a level def
  function buildLevel(def) {
    var W = def.wTiles, H = def.hTiles;
    var grid = new Array(W * H).fill(0); // 0 empty,1 solid,2 oneway,3 spike,4 breakable
    function fill(rects, val) {
      (rects || []).forEach(function (r) {
        for (var x = r[0]; x < r[0] + r[2]; x++)
          for (var y = r[1]; y < r[1] + r[3]; y++)
            if (x >= 0 && x < W && y >= 0 && y < H) grid[y * W + x] = val;
      });
    }
    fill(def.solids, 1); fill(def.oneway, 2); fill(def.spikes, 3); fill(def.breakable, 4);
    return { def: def, W: W, H: H, grid: grid, pxW: W * TS, pxH: H * TS };
  }

  // ---- game state -------------------------------------------------------
  function createGame(opts) {
    opts = opts || {};
    var def = levelWing1();
    var lv = buildLevel(def);
    var g = {
      _seed: (opts.seed != null ? opts.seed : (Date.now() & 0xffffffff)) >>> 0,
      time: 0, lv: lv, def: def,
      enemies: [], particles: [], floats: [], shocks: [],
      cam: { x: 0, y: 0 },
      shake: 0, flash: 0, hitstop: 0,
      phase: "play", // play | win | dead
      banner: null, bannerT: 0,
      sign: null,
      checkpoint: { x: def.start.tx * TS, y: def.start.ty * TS },
      kills: 0, hops: 0, deaths: 0,
      player: {
        mode: "spirit", host: null,
        x: def.start.tx * TS, y: def.start.ty * TS, w: 16, h: 18,
        vx: 0, vy: 0, dir: 1, onGround: false, coyote: 0, usedDouble: false,
        essence: 100, maxEssence: 100, grace: 0, invuln: 1.5,
        vit: 0, maxVit: 0,
        dashT: 0, dashCd: 0, pounding: false, swipeT: 0,
        anim: 0, flapPuff: 0
      },
      input: { left: false, right: false, jumpHeld: false, jumpBuf: 0, jumpRel: false,
               actBuf: 0, ejectBuf: 0, aimx: 0, aimy: 0 }
    };
    spawnEnemies(g);
    banner(g, "THE BLIGHT STIRS");
    return g;
  }

  function spawnEnemies(g) {
    g.enemies = [];
    g.def.enemies.forEach(function (e) {
      var T = BODIES[e.type];
      var en = {
        type: e.type, T: T, x: e.tx * TS, y: e.ty * TS, w: T.w, h: T.h,
        vx: 0, vy: 0, dir: -1, onGround: false, controlled: false, dead: false,
        hp: T.maxHp, maxHp: T.maxHp, hitFlash: 0, anim: rrange(g, 0, 6),
        homeX: e.tx * TS, patrol: T.fly ? "bob" : "walk", bobT: rrange(g, 0, TAU)
      };
      g.enemies.push(en);
    });
  }

  // ---- tile queries -----------------------------------------------------
  function tileAt(lv, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= lv.W || ty >= lv.H) return 1; // OOB solid (except below handled separately)
    return lv.grid[ty * lv.W + tx];
  }
  function solidTile(t) { return t === 1 || t === 4; }
  function inRects(rects, px, py) {
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (px >= r[0] * TS && px < (r[0] + r[2]) * TS && py >= r[1] * TS && py < (r[1] + r[3]) * TS) return true;
    }
    return false;
  }

  // ---- AABB vs tilemap physics -----------------------------------------
  function collideX(g, a) {
    var lv = g.lv;
    a.x += a.vx * a._dt;
    var minTx = Math.floor(a.x / TS), maxTx = Math.floor((a.x + a.w - 0.01) / TS);
    var minTy = Math.floor(a.y / TS), maxTy = Math.floor((a.y + a.h - 0.01) / TS);
    for (var ty = minTy; ty <= maxTy; ty++) {
      for (var tx = minTx; tx <= maxTx; tx++) {
        if (solidTile(tileAt(lv, tx, ty))) {
          if (a.vx > 0) { a.x = tx * TS - a.w; }
          else if (a.vx < 0) { a.x = (tx + 1) * TS; }
          a.vx = 0;
        }
      }
    }
  }
  function collideY(g, a) {
    var lv = g.lv;
    var prevBottom = a.y + a.h;
    a.y += a.vy * a._dt;
    a.onGround = false;
    var minTx = Math.floor(a.x / TS), maxTx = Math.floor((a.x + a.w - 0.01) / TS);
    var minTy = Math.floor(a.y / TS), maxTy = Math.floor((a.y + a.h - 0.01) / TS);
    for (var tx = minTx; tx <= maxTx; tx++) {
      for (var ty = minTy; ty <= maxTy; ty++) {
        var t = tileAt(lv, tx, ty);
        if (solidTile(t)) {
          if (a.vy > 0) { a.y = ty * TS - a.h; a.onGround = true; }
          else if (a.vy < 0) { a.y = (ty + 1) * TS; }
          a.vy = 0;
        } else if (t === 2) { // one-way: only when falling and feet were above
          if (a.vy > 0 && prevBottom <= ty * TS + 1) { a.y = ty * TS - a.h; a.vy = 0; a.onGround = true; }
        }
      }
    }
  }

  // hazard/goal checks for an actor box
  function checkHazards(g, a, isBody) {
    var lv = g.lv;
    var minTx = Math.floor(a.x / TS), maxTx = Math.floor((a.x + a.w - 0.01) / TS);
    var minTy = Math.floor(a.y / TS), maxTy = Math.floor((a.y + a.h - 0.01) / TS);
    for (var ty = minTy; ty <= maxTy; ty++)
      for (var tx = minTx; tx <= maxTx; tx++)
        if (tileAt(lv, tx, ty) === 3) return "spike";
    // fall out of world
    if (a.y > lv.pxH + 80) return "void";
    // goal
    var gx = g.def.goal.tx * TS, gy = g.def.goal.ty * TS;
    if (a.x < gx + TS && a.x + a.w > gx && a.y < gy + TS * 2 && a.y + a.h > gy - TS) return "goal";
    return null;
  }

  // ---- possession / eject / death --------------------------------------
  function canPossess(g, e) {
    if (!e || e.dead || e.controlled) return false;
    var will = e.T.will || 0;
    return will <= 0 ? true : e.hp <= e.maxHp * will;
  }
  function possess(g, e) {
    var p = g.player;
    p.mode = "body"; p.host = e; e.controlled = true;
    // adopt the host's box, keep feet roughly where they were
    var footY = p.y + p.h;
    p.w = e.T.w; p.h = e.T.h;
    p.x = e.x; p.y = e.y;
    p.vx = 0; p.vy = 0; p.usedDouble = false; p.dashT = 0; p.pounding = false;
    p.vit = e.T.maxVit; p.maxVit = e.T.maxVit; p.invuln = 0.3;
    g.hops++;
    burst(g, e.x + e.w / 2, e.y + e.h / 2, e.T.col, 20, 220);
    g.shake = Math.min(g.shake + 6, 14); g.flash = Math.min(g.flash + 0.3, 1);
    sfx(g, "possess");
    if (g.tutGate === "possess") g.tutGate = null;
  }
  function eject(g, up) {
    var p = g.player;
    if (p.mode !== "body" || !p.host) return;
    var e = p.host;
    var cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    e.dead = true; e.controlled = false;
    crumble(g, cx, cy, e.T.col);
    p.mode = "spirit"; p.host = null;
    p.w = 16; p.h = 18;
    p.x = cx - p.w / 2; p.y = cy - p.h / 2;
    p.vx = clamp(p.vx, -160, 160);
    p.vy = up ? -560 : -260;
    p.vit = 0; p.maxVit = 0; p.invuln = 0.25; p.grace = 0; p.usedDouble = false;
    sfx(g, "eject");
    g.shake = Math.min(g.shake + 4, 14);
  }
  function bodyDied(g) {
    var p = g.player, e = p.host;
    var cx = e ? e.x + e.w / 2 : p.x, cy = e ? e.y + e.h / 2 : p.y;
    if (e) { e.dead = true; e.controlled = false; }
    crumble(g, cx, cy, e ? e.T.col : "#b06bd6");
    p.mode = "spirit"; p.host = null; p.w = 16; p.h = 18;
    p.x = cx - p.w / 2; p.y = cy - p.h / 2; p.vy = -420; p.vx *= 0.4;
    p.vit = 0; p.maxVit = 0; p.invuln = 1.0; p.grace = 0; p.usedDouble = false;
    g.flash = Math.min(g.flash + 0.5, 1); g.shake = Math.min(g.shake + 6, 14);
    sfx(g, "bodyloss");
  }
  function respawn(g) {
    var p = g.player;
    g.deaths++;
    p.mode = "spirit"; p.host = null; p.w = 16; p.h = 18;
    p.x = g.checkpoint.x; p.y = g.checkpoint.y; p.vx = 0; p.vy = 0;
    p.essence = p.maxEssence; p.grace = 0; p.invuln = 1.5; p.vit = 0; p.maxVit = 0;
    spawnEnemies(g); // restore the world's creatures (but keep broken walls)
    g.flash = 1; banner(g, "THE BLIGHT REFORMS");
    sfx(g, "respawn");
  }

  // ---- spirit lunge (possession dive) ----------------------------------
  function lunge(g) {
    var p = g.player;
    if (p.mode !== "spirit" || p.dashCd > 0) return;
    var dx = p.dir, dy = -0.35;
    // aim toward cursor if it's meaningfully off-center
    var ang = Math.atan2(dy, dx);
    p.vx = Math.cos(ang) * 560; p.vy = Math.sin(ang) * 560 - 60;
    p.dashT = 0.22; p.dashCd = 0.3; p.invuln = Math.max(p.invuln, 0.12);
    sfx(g, "lunge");
    for (var i = 0; i < 6; i++) puff(g, p.x + p.w / 2, p.y + p.h / 2, "#b06bd6");
  }

  // ---- body power -------------------------------------------------------
  function useAction(g) {
    var p = g.player;
    if (p.mode === "spirit") { lunge(g); return; }
    if (!p.host) return;
    var e = p.host, T = e.T;
    if (T.power === "dash") {
      if (p.dashCd > 0) return;
      p.vx = p.dir * 620; p.dashT = 0.18; p.dashCd = 0.45; p.vy = Math.min(p.vy, -40);
      sfx(g, "dash"); for (var i = 0; i < 8; i++) puff(g, p.x + p.w / 2, p.y + p.h / 2, T.col);
      p.vit = Math.max(0, p.vit - 1.0);
    } else if (T.power === "pound") {
      if (!p.onGround) { p.vy = 1500; p.pounding = true; }
      else doPound(g); // already grounded -> immediate
      p.vit = Math.max(0, p.vit - 1.4);
    } else if (T.power === "swipe") {
      p.swipeT = 0.16; sfx(g, "swipe");
      var rx = p.x + p.w / 2 + p.dir * (p.w * 0.6 + 16), ry = p.y + p.h / 2;
      for (var k = 0; k < g.enemies.length; k++) {
        var o = g.enemies[k];
        if (o === e || o.dead || o.controlled) continue;
        if (Math.abs(o.x + o.w / 2 - rx) < 30 && Math.abs(o.y + o.h / 2 - ry) < 32)
          damageEnemy(g, o, 16, p.dir);
      }
      p.vit = Math.max(0, p.vit - 0.4);
    }
    if (p.vit <= 0) eject(g, false);
  }
  function doPound(g) {
    var p = g.player, e = p.host;
    p.pounding = false;
    var cx = p.x + p.w / 2, cy = p.y + p.h;
    g.shocks.push({ x: cx, y: cy, r: 10, max: 120, ttl: 0.35, life: 1, col: "#ffcaa0" });
    g.shake = Math.min(g.shake + 9, 14); sfx(g, "slam");
    // shatter breakable tiles nearby
    // shatter a generous vertical column of sealed wall (so one pound clears a passage)
    var lv = g.lv, ctx0 = Math.floor(cx / TS), cty = Math.floor((p.y + p.h - 1) / TS);
    for (var dx = -2; dx <= 2; dx++)
      for (var dy = -8; dy <= 1; dy++) {
        var tx = ctx0 + dx, ty = cty + dy;
        if (tileAt(lv, tx, ty) === 4) {
          lv.grid[ty * lv.W + tx] = 0;
          for (var q = 0; q < 4; q++) chunk(g, tx * TS + 16, ty * TS + 16, "#a06a4a");
        }
      }
    // knock enemies
    for (var i = 0; i < g.enemies.length; i++) {
      var o = g.enemies[i];
      if (o.dead || o.controlled) continue;
      if (Math.abs(o.x - cx) < 110 && Math.abs(o.y - cy) < 70) damageEnemy(g, o, 20, sign(o.x - cx) || 1);
    }
  }

  // ---- damage -----------------------------------------------------------
  function damageEnemy(g, e, dmg, dir) {
    if (e.dead) return;
    e.hp -= dmg; e.hitFlash = 0.12;
    e.vx += (dir || 1) * 120; e.vy -= 80;
    floatText(g, e.x + e.w / 2, e.y, Math.round(dmg), "#fff");
    for (var i = 0; i < 5; i++) puff(g, e.x + e.w / 2, e.y + e.h / 2, e.T.col);
    if (e.hp <= 0) killEnemy(g, e);
  }
  function killEnemy(g, e) {
    if (e.dead) return;
    e.dead = true; e.controlled = false; g.kills++;
    crumble(g, e.x + e.w / 2, e.y + e.h / 2, e.T.col); sfx(g, "die");
    g.shake = Math.min(g.shake + 4, 14);
  }
  function hurtPlayer(g, dmg, fromX) {
    var p = g.player;
    if (p.invuln > 0) return;
    if (p.mode === "body" && p.host) {
      p.host.hp -= dmg; p.host.hitFlash = 0.12; p.invuln = 0.5;
      p.vx += sign(p.x + p.w / 2 - fromX) * 160; p.vy -= 120;
      g.shake = Math.min(g.shake + 4, 14);
      if (p.host.hp <= 0) bodyDied(g);
    } else {
      p.essence -= dmg * 2.4; p.invuln = 0.9;
      g.shake = Math.min(g.shake + 6, 14); g.flash = Math.min(g.flash + 0.4, 1);
      burst(g, p.x + p.w / 2, p.y + p.h / 2, "#b06bd6", 10, 180); sfx(g, "hurt");
      if (p.essence <= 0) respawn(g);
    }
  }

  // ====================== UPDATE ========================================
  function update(g, dt) {
    if (dt > 0.05) dt = 0.05;
    g.time += dt;
    g.shake = Math.max(0, g.shake - dt * 28);
    g.flash = Math.max(0, g.flash - dt * 2.2);
    if (g.bannerT > 0) g.bannerT -= dt;
    if (g.hitstop > 0) { g.hitstop -= dt; updateParticles(g, dt); return; }
    if (g.phase !== "play") { updateParticles(g, dt); updateShocks(g, dt); return; }

    var p = g.player, inp = g.input;
    p.invuln = Math.max(0, p.invuln - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    if (p.swipeT > 0) p.swipeT -= dt;
    if (inp.jumpBuf > 0) inp.jumpBuf -= dt;
    if (inp.actBuf > 0) inp.actBuf -= dt;
    if (inp.ejectBuf > 0) inp.ejectBuf -= dt;

    var moveDir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);

    // consume buffered action / eject (edge events)
    if (inp.actBuf > 0) { inp.actBuf = 0; useAction(g); }
    if (inp.ejectBuf > 0) { inp.ejectBuf = 0; if (p.mode === "body") eject(g, true); else lunge(g); }

    if (p.mode === "spirit") updateSpirit(g, dt, moveDir);
    else updateBody(g, dt, moveDir);

    // enemies
    updateEnemies(g, dt);
    updateShocks(g, dt);
    updateParticles(g, dt);
    updateFloats(g, dt);

    // camera follow
    var pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
    g.cam.x = clamp(pcx - VIEW_W / 2, 0, Math.max(0, g.lv.pxW - VIEW_W));
    g.cam.y = clamp(pcy - VIEW_H / 2, 0, Math.max(0, g.lv.pxH - VIEW_H));

    // active sign (nearest within range)
    g.sign = null; var best = 1e9;
    for (var s = 0; s < g.def.signs.length; s++) {
      var sg = g.def.signs[s];
      var d = Math.abs(sg.tx * TS - pcx) + Math.abs(sg.ty * TS - pcy);
      if (d < 150 && d < best) { best = d; g.sign = sg; }
    }

    // remove dead enemies
    for (var r = g.enemies.length - 1; r >= 0; r--) if (g.enemies[r].dead) g.enemies.splice(r, 1);
  }

  function inSafe(g, a) {
    var cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    return inRects(g.def.safe, cx, cy);
  }

  function updateSpirit(g, dt, moveDir) {
    var p = g.player; p._dt = dt;
    // float physics: low gravity, hover when holding jump
    var grav = GRAV * 0.32;
    if (g.input.jumpHeld && p.vy > -40) grav = GRAV * 0.05; // hover
    if (p.dashT > 0) { p.dashT -= dt; grav *= 0.2; }
    p.vx = approach(p.vx, moveDir * 190, (p.dashT > 0 ? 600 : 1600) * dt);
    if (moveDir) p.dir = moveDir;
    p.vy += grav * dt;
    p.vy = clamp(p.vy, -640, 540);
    collideX(g, p); collideY(g, p);
    p.anim += dt;

    // possession on contact during/after lunge (and gentle touch)
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (!canPossess(g, e)) continue;
      if (aabb(p, e)) { possess(g, e); return; }
    }

    // essence bleed when exposed (the villain's curse: the pure world rejects you)
    if (inSafe(g, p)) {
      p.grace = 0;
      p.essence = Math.min(p.maxEssence, p.essence + dt * 14);
    } else {
      p.grace += dt;
      if (p.grace > 1.4) p.essence -= dt * 8;
    }
    var hz = checkHazards(g, p, false);
    if (hz === "goal") return winGame(g);
    if (hz === "spike" || hz === "void") respawn(g);
    if (p.essence <= 0) respawn(g);
  }

  function updateBody(g, dt, moveDir) {
    var p = g.player, e = p.host; if (!e) { p.mode = "spirit"; return; }
    p._dt = dt; e._dt = dt;
    var T = e.T;

    // horizontal
    var spd = T.speed, acc = (p.onGround ? T.accel : T.airAccel);
    var vitFrac = p.maxVit > 0 ? p.vit / p.maxVit : 1;
    spd *= lerp(0.6, 1, clamp(vitFrac + 0.25, 0, 1)); // decaying body sluggish
    if (p.dashT > 0) { p.dashT -= dt; } else {
      if (moveDir) { p.vx = approach(p.vx, moveDir * spd, acc * dt); p.dir = moveDir; }
      else p.vx = approach(p.vx, 0, (p.onGround ? T.accel : T.airAccel * 0.5) * dt);
    }

    // jump / double / fly
    if (p.onGround) { p.coyote = 0.09; p.usedDouble = false; }
    else p.coyote = Math.max(0, p.coyote - dt);

    if (T.fly) {
      // floater: hold jump to flap upward
      if (g.input.jumpHeld) { p.vy -= T.flap * dt; p.vy = Math.max(p.vy, -T.flyMax); p.flapPuff += dt;
        if (p.flapPuff > 0.08) { p.flapPuff = 0; puff(g, p.x + p.w / 2, p.y + p.h, T.col); } }
      p.vy += GRAV * 0.5 * dt;
    } else {
      if (g.input.jumpBuf > 0) {
        if (p.onGround || p.coyote > 0) { p.vy = -T.jumpV; g.input.jumpBuf = 0; p.coyote = 0; sfx(g, "jump"); }
        else if (T.doubleJump && !p.usedDouble) { p.vy = -T.jumpV * 0.92; p.usedDouble = true; g.input.jumpBuf = 0; sfx(g, "jump"); for (var d = 0; d < 6; d++) puff(g, p.x + p.w / 2, p.y + p.h, T.col); }
      }
      if (g.input.jumpRel && p.vy < 0) { p.vy *= 0.45; }
      p.vy += GRAV * dt;
    }
    g.input.jumpRel = false;
    p.vy = clamp(p.vy, -900, 1700);

    // integrate physics on the player actor, then mirror onto the host entity
    collideX(g, p); collideY(g, p);
    e.x = p.x; e.y = p.y; e.vx = p.vx; e.vy = p.vy; e.dir = p.dir; e.onGround = p.onGround;

    p.anim += dt * (1 + Math.abs(p.vx) * 0.01);

    // landing pound
    if (T.power === "pound" && p.pounding && p.onGround) doPound(g);

    // touch hostile enemies = damage (you're wearing a body now, they fight you)
    for (var i = 0; i < g.enemies.length; i++) {
      var o = g.enemies[i];
      if (o === e || o.dead || o.controlled) continue;
      if (aabb(p, o)) { hurtPlayer(g, 8, o.x + o.w / 2); damageEnemy(g, o, 6, sign(o.x - p.x) || 1); }
    }

    // decay
    if (inSafe(g, p)) { /* body steadies */ }
    else { p.vit -= dt * T.decay; if (p.vit <= 0) { eject(g, false); return; } }

    var hz = checkHazards(g, p, true);
    if (hz === "goal") return winGame(g);
    if (hz === "spike") { bodyDied(g); }
    else if (hz === "void") { bodyDied(g); }

    // checkpoint touch
    g.def.checkpoints.forEach(function (c) {
      if (Math.abs(c.tx * TS - (p.x + p.w / 2)) < 40 && Math.abs(c.ty * TS - (p.y + p.h / 2)) < 60) {
        g.checkpoint = { x: c.tx * TS, y: c.ty * TS };
      }
    });
  }

  function updateEnemies(g, dt) {
    var lv = g.lv;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (e.dead || e.controlled) { e.hitFlash = Math.max(0, e.hitFlash - dt); continue; }
      e._dt = dt; e.hitFlash = Math.max(0, e.hitFlash - dt); e.anim += dt;
      if (e.T.fly) {
        e.bobT += dt * 2; e.y = e.homeY != null ? e.homeY + Math.sin(e.bobT) * 16 : (e.homeY = e.y);
        continue;
      }
      // gravity + simple patrol
      e.vy += GRAV * dt; e.vy = clamp(e.vy, -600, 1200);
      // patrol: walk toward home range, turn at walls/edges
      if (e.onGround) {
        e.vx = approach(e.vx, e.dir * e.T.speed * 0.4, 800 * dt);
        // edge / wall detection
        var aheadX = e.dir > 0 ? e.x + e.w + 2 : e.x - 2;
        var footY = e.y + e.h + 2;
        var wallT = tileAt(lv, Math.floor(aheadX / TS), Math.floor((e.y + e.h / 2) / TS));
        var groundT = tileAt(lv, Math.floor(aheadX / TS), Math.floor(footY / TS));
        if (solidTile(wallT) || !solidTile(groundT)) e.dir = -e.dir;
      }
      collideX(g, e); collideY(g, e);
      // spikes kill enemies too (cosmetic)
      var hz = checkHazardsForEnemy(g, e);
      if (hz === "void") e.dead = true;
    }
  }
  function checkHazardsForEnemy(g, e) { if (e.y > g.lv.pxH + 120) return "void"; return null; }

  function updateShocks(g, dt) {
    for (var i = g.shocks.length - 1; i >= 0; i--) {
      var s = g.shocks[i]; s.ttl -= dt; s.life = clamp(s.ttl / 0.35, 0, 1);
      s.r = lerp(s.r, s.max, 0.3);
      if (s.ttl <= 0) g.shocks.splice(i, 1);
    }
  }
  function updateParticles(g, dt) {
    for (var i = g.particles.length - 1; i >= 0; i--) {
      var pt = g.particles[i]; pt.life -= dt;
      if (pt.grav) pt.vy += pt.grav * dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      if (pt.life <= 0) g.particles.splice(i, 1);
    }
  }
  function updateFloats(g, dt) {
    for (var i = g.floats.length - 1; i >= 0; i--) { var f = g.floats[i]; f.life -= dt; f.y -= 26 * dt; if (f.life <= 0) g.floats.splice(i, 1); }
  }

  function winGame(g) { g.phase = "win"; banner(g, "THE RIFT YIELDS"); g.flash = 1; g.shake = 12; sfx(g, "win"); }

  // ---- fx ---------------------------------------------------------------
  function puff(g, x, y, c) { g.particles.push({ x: x, y: y, vx: rrange(g, -50, 50), vy: rrange(g, -60, 20), life: rrange(g, 0.2, 0.5), max: 0.5, r: rrange(g, 1.5, 3), color: c, kind: "p" }); }
  function burst(g, x, y, c, n, sp) { for (var i = 0; i < n; i++) { var a = rand(g) * TAU, s = rrange(g, sp * 0.3, sp); g.particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rrange(g, 0.3, 0.7), max: 0.7, r: rrange(g, 2, 4), color: c, kind: "p" }); } }
  function chunk(g, x, y, c) { g.particles.push({ x: x, y: y, vx: rrange(g, -120, 120), vy: rrange(g, -260, -80), life: rrange(g, 0.5, 1.0), max: 1, r: rrange(g, 2, 5), color: c, kind: "chunk", grav: 1400 }); }
  function crumble(g, x, y, c) { burst(g, x, y, c, 22, 240); for (var i = 0; i < 8; i++) chunk(g, x + rrange(g, -12, 12), y + rrange(g, -12, 12), c); }
  function floatText(g, x, y, t, c) { g.floats.push({ x: x, y: y, txt: "" + t, color: c, life: 0.7, max: 0.7 }); }
  function banner(g, t) { g.banner = t; g.bannerT = 2.2; }

  // ---- audio (procedural, guarded) -------------------------------------
  var AUDIO = null;
  function initAudio() { if (AUDIO || typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return; try { AUDIO = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AUDIO = null; } }
  function tone(f, d, type, v, to) { if (!AUDIO) return; var t = AUDIO.currentTime, o = AUDIO.createOscillator(), gn = AUDIO.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + d); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(v || 0.18, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(gn); gn.connect(AUDIO.destination); o.start(t); o.stop(t + d + 0.02); }
  function noise(d, v, ff) { if (!AUDIO) return; var t = AUDIO.currentTime, n = Math.floor(AUDIO.sampleRate * d), buf = AUDIO.createBuffer(1, n, AUDIO.sampleRate), dd = buf.getChannelData(0); for (var i = 0; i < n; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / n); var s = AUDIO.createBufferSource(); s.buffer = buf; var fl = AUDIO.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = ff || 1200; var gn = AUDIO.createGain(); gn.gain.value = v || 0.18; s.connect(fl); fl.connect(gn); gn.connect(AUDIO.destination); s.start(t); }
  function sfx(g, n) {
    if (!AUDIO) return;
    switch (n) {
      case "jump": tone(360, 0.14, "square", 0.1, 620); break;
      case "lunge": tone(260, 0.18, "sawtooth", 0.12, 520); break;
      case "possess": tone(120, 0.32, "sawtooth", 0.16, 300); noise(0.18, 0.1, 700); break;
      case "eject": tone(440, 0.16, "triangle", 0.12, 180); break;
      case "dash": noise(0.14, 0.14, 2600); tone(520, 0.1, "square", 0.08, 760); break;
      case "slam": tone(64, 0.36, "square", 0.2, 36); noise(0.28, 0.18, 460); break;
      case "swipe": noise(0.1, 0.12, 2400); break;
      case "die": noise(0.2, 0.14, 700); tone(170, 0.16, "sawtooth", 0.08, 60); break;
      case "hurt": tone(200, 0.2, "square", 0.16, 80); break;
      case "bodyloss": tone(150, 0.4, "sawtooth", 0.18, 50); noise(0.3, 0.14, 480); break;
      case "respawn": tone(220, 0.3, "sine", 0.12, 440); break;
      case "win": tone(523, 0.18, "sine", 0.14); tone(784, 0.26, "sine", 0.12); tone(1046, 0.4, "sine", 0.1); break;
    }
  }

  // ====================== RENDER ========================================
  function render(g, ctx) {
    ctx.imageSmoothingEnabled = false;
    // sky
    var sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, "#1a2740"); sky.addColorStop(0.6, "#24344f"); sky.addColorStop(1, "#3a4a63");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // parallax hills
    drawParallax(g, ctx);

    ctx.save();
    var sx = (g.shake > 0 ? (Math.random() * 2 - 1) * g.shake : 0);
    var sy = (g.shake > 0 ? (Math.random() * 2 - 1) * g.shake : 0);
    ctx.translate(-Math.round(g.cam.x) + sx, -Math.round(g.cam.y) + sy);

    drawTiles(g, ctx);
    drawGoal(g, ctx);
    drawSigns(g, ctx);

    // shockwaves
    for (var s = 0; s < g.shocks.length; s++) { var sk = g.shocks[s]; ctx.globalAlpha = sk.life * 0.6; ctx.strokeStyle = sk.col; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(sk.x, sk.y, sk.r, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }

    // enemies
    for (var e = 0; e < g.enemies.length; e++) drawCreature(g, ctx, g.enemies[e]);

    // player body uses host's draw (already drawn as controlled enemy). Spirit drawn separately:
    if (g.player.mode === "spirit") drawSpirit(g, ctx);
    else drawPlayerBody(g, ctx);

    // particles
    for (var p2 = 0; p2 < g.particles.length; p2++) { var pt = g.particles[p2]; ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1); ctx.fillStyle = pt.color; var rr = Math.round(pt.r); ctx.fillRect(Math.round(pt.x) - rr, Math.round(pt.y) - rr, rr * 2, rr * 2); }
    ctx.globalAlpha = 1;

    // floats
    ctx.textAlign = "center"; ctx.font = "bold 14px monospace";
    for (var f = 0; f < g.floats.length; f++) { var fl = g.floats[f]; ctx.globalAlpha = clamp(fl.life / fl.max, 0, 1); ctx.fillStyle = fl.color; ctx.fillText(fl.txt, fl.x, fl.y); }
    ctx.globalAlpha = 1;

    ctx.restore();

    if (g.flash > 0) { ctx.fillStyle = "rgba(176,107,214," + (g.flash * 0.35) + ")"; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    drawHUD(g, ctx);
  }

  function drawParallax(g, ctx) {
    ctx.save();
    var off = g.cam.x * 0.3;
    ctx.fillStyle = "#2c3c58";
    for (var i = -1; i < 12; i++) {
      var bx = (i * 200 - (off % 200)) ;
      ctx.beginPath(); ctx.moveTo(bx, VIEW_H); ctx.lineTo(bx + 100, VIEW_H - 160); ctx.lineTo(bx + 200, VIEW_H); ctx.fill();
    }
    var off2 = g.cam.x * 0.55;
    ctx.fillStyle = "#34466a";
    for (var j = -1; j < 14; j++) { var cx = (j * 160 - (off2 % 160)); ctx.beginPath(); ctx.moveTo(cx, VIEW_H); ctx.lineTo(cx + 80, VIEW_H - 110); ctx.lineTo(cx + 160, VIEW_H); ctx.fill(); }
    ctx.restore();
  }

  function drawTiles(g, ctx) {
    var lv = g.lv;
    var x0 = Math.max(0, Math.floor(g.cam.x / TS) - 1), x1 = Math.min(lv.W, Math.ceil((g.cam.x + VIEW_W) / TS) + 1);
    var y0 = Math.max(0, Math.floor(g.cam.y / TS) - 1), y1 = Math.min(lv.H, Math.ceil((g.cam.y + VIEW_H) / TS) + 1);
    for (var ty = y0; ty < y1; ty++) for (var tx = x0; tx < x1; tx++) {
      var t = lv.grid[ty * lv.W + tx]; if (!t) continue;
      var X = tx * TS, Y = ty * TS;
      if (t === 1) { // solid earth — grass cap if open above
        ctx.fillStyle = "#3b2f4a"; ctx.fillRect(X, Y, TS, TS);
        ctx.fillStyle = "#2c2438"; ctx.fillRect(X, Y + TS - 6, TS, 6);
        if (tileAt(lv, tx, ty - 1) !== 1) { ctx.fillStyle = "#6a4d8c"; ctx.fillRect(X, Y, TS, 7); ctx.fillStyle = "#8a67b0"; ctx.fillRect(X, Y, TS, 3); }
        ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(X, Y, 2, TS);
      } else if (t === 2) { // one-way platform
        ctx.fillStyle = "#7a5e3a"; ctx.fillRect(X, Y, TS, 8); ctx.fillStyle = "#9c7a4c"; ctx.fillRect(X, Y, TS, 3);
      } else if (t === 3) { // spikes
        ctx.fillStyle = "#cfd6e0";
        for (var k = 0; k < 4; k++) { var sxp = X + k * 8; ctx.beginPath(); ctx.moveTo(sxp, Y + TS); ctx.lineTo(sxp + 4, Y + TS - 14); ctx.lineTo(sxp + 8, Y + TS); ctx.fill(); }
        ctx.fillStyle = "#6b7280"; ctx.fillRect(X, Y + TS - 4, TS, 4);
      } else if (t === 4) { // breakable sealed wall
        ctx.fillStyle = "#9c7e5c"; ctx.fillRect(X, Y, TS, TS);
        ctx.strokeStyle = "#6a5238"; ctx.lineWidth = 2; ctx.strokeRect(X + 3, Y + 3, TS - 6, TS / 2 - 4); ctx.strokeRect(X + 3, Y + TS / 2 + 1, TS - 6, TS / 2 - 4);
        ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(X, Y, TS, 3);
      }
    }
  }

  function drawGoal(g, ctx) {
    var gx = g.def.goal.tx * TS, gy = g.def.goal.ty * TS;
    var t = g.time;
    ctx.save(); ctx.translate(gx + TS / 2, gy + TS);
    for (var i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.5 - i * 0.12;
      var rr = 18 + i * 10 + Math.sin(t * 3 + i) * 4;
      ctx.fillStyle = i % 2 ? "#ff7adf" : "#b06bff"; ctx.beginPath(); ctx.ellipse(0, -14, rr * 0.6, rr, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = "#1a0a20"; ctx.beginPath(); ctx.ellipse(0, -14, 7, 22, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawSigns(g, ctx) {
    for (var i = 0; i < g.def.signs.length; i++) {
      var s = g.def.signs[i], X = s.tx * TS, Y = s.ty * TS;
      ctx.fillStyle = "#2a2036"; ctx.fillRect(X + 10, Y + 6, 6, 22);
      ctx.fillStyle = (g.sign === s) ? "#ffd24a" : "#7a6a90"; ctx.fillRect(X + 2, Y - 6, 24, 16);
      ctx.fillStyle = "#1a1426"; ctx.font = "10px monospace"; ctx.textAlign = "center"; ctx.fillText("!", X + 14, Y + 6);
    }
  }

  // ---- pixel creatures (side view) ----
  function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function drawCreature(g, ctx, e) {
    if (e.dead) return;
    drawBodySprite(g, ctx, e, e.x, e.y, e.w, e.h, e.dir, e.T, false, e.hitFlash > 0, e.anim);
    // hp bar for wounded / elites
    if (!e.controlled && (e.hp < e.maxHp || e.T.elite)) {
      var w = e.w + 6, X = e.x - 3, Y = e.y - 10;
      px(ctx, X, Y, w, 4, "rgba(0,0,0,0.6)");
      px(ctx, X, Y, w * clamp(e.hp / e.maxHp, 0, 1), 4, e.T.elite ? "#ff5db0" : "#e06b6b");
    }
    if (e.T.will > 0 && !e.controlled && !canPossess(g, e)) {
      ctx.fillStyle = "#ff8fae"; ctx.font = "9px monospace"; ctx.textAlign = "center";
      ctx.fillText("WOUND TO TAKE", e.x + e.w / 2, e.y - 14);
    }
  }
  function drawPlayerBody(g, ctx) {
    var p = g.player, e = p.host; if (!e) return;
    drawBodySprite(g, ctx, e, p.x, p.y, p.w, p.h, p.dir, e.T, true, p.invuln > 0 && Math.floor(g.time * 20) % 2 === 0, p.anim);
    // possession aura + vitality
    var cx = p.x + p.w / 2;
    var vf = p.maxVit > 0 ? clamp(p.vit / p.maxVit, 0, 1) : 1;
    var w = p.w + 8, X = p.x - 4, Y = p.y - 12;
    px(ctx, X, Y, w, 4, "rgba(0,0,0,0.6)");
    px(ctx, X, Y, w * vf, 4, vf > 0.3 ? "#ffd24a" : "#ff6a3a");
    if (p.swipeT > 0) { ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx + p.dir * 14, p.y + p.h / 2, 18, -0.8, 0.8); ctx.stroke(); }
  }

  function drawBodySprite(g, ctx, e, x, y, w, h, dir, T, possessed, flash, anim) {
    ctx.save();
    ctx.translate(Math.round(x + w / 2), Math.round(y + h / 2));
    if (dir < 0) ctx.scale(-1, 1);
    var bx = -w / 2, by = -h / 2;
    var col = flash ? "#ffffff" : T.col, dk = flash ? "#ffffff" : T.dark;
    var step = Math.sin(anim * 8) ; // walk cycle
    // possession glow
    if (possessed) { ctx.save(); ctx.globalAlpha = 0.35 + 0.15 * Math.sin(g.time * 8); ctx.fillStyle = "#b06bff"; ctx.fillRect(bx - 3, by - 3, w + 6, h + 6); ctx.restore(); }

    if (T.key === "husk") {
      px(ctx, bx + 4, by + h - 8 + step * 2, 5, 8, dk);
      px(ctx, bx + w - 9, by + h - 8 - step * 2, 5, 8, dk);
      px(ctx, bx + 2, by + 6, w - 4, h - 12, col);             // body
      px(ctx, bx + 4, by + 9, w - 8, h - 18, "rgba(255,255,255,0.12)");
      px(ctx, bx + 5, by, w - 10, 9, col);                     // head
      px(ctx, bx + w - 11, by + 2, 5, 5, possessed ? "#e7c6ff" : T.eye); // eye
    } else if (T.key === "brute") {
      px(ctx, bx + 5, by + h - 9 + step * 2, 9, 9, dk);
      px(ctx, bx + w - 14, by + h - 9 - step * 2, 9, 9, dk);
      px(ctx, bx + 1, by + 8, w - 2, h - 16, col);             // torso
      px(ctx, bx - 1, by + 12, 6, 14, dk); px(ctx, bx + w - 5, by + 12, 6, 14, dk); // arms
      px(ctx, bx + 5, by + 11, w - 10, 6, "rgba(255,255,255,0.12)"); // shoulder shine
      px(ctx, bx + w / 2 - 6, by, 12, 9, dk);                  // small head
      px(ctx, bx + w / 2, by + 2, 4, 4, possessed ? "#e7c6ff" : T.eye);
    } else if (T.key === "dart") {
      px(ctx, bx, by + 4, w - 4, h - 6, col);                  // sleek body
      px(ctx, bx + w - 6, by + 2, 6, h - 2, col);              // nose
      px(ctx, bx - 4, by + 1, 8, 4, dk); px(ctx, bx - 4, by + h - 5, 8, 4, dk); // fins
      px(ctx, bx + w - 8, by + 4, 4, 4, possessed ? "#e7c6ff" : T.eye);
    } else if (T.key === "floater") {
      var fb = Math.sin(g.time * 4 + anim) * 2;
      px(ctx, bx + 3, by + 3 + fb, w - 6, h - 8, col);         // bladder
      px(ctx, bx + 5, by + 5 + fb, w - 10, h - 14, "rgba(255,255,255,0.14)");
      px(ctx, bx + 2, by + h - 6 + fb, 3, 6, dk); px(ctx, bx + w - 5, by + h - 6 + fb, 3, 6, dk); // tendrils
      px(ctx, bx + w - 11, by + 7 + fb, 4, 4, possessed ? "#fff" : T.eye);
      px(ctx, bx + w - 17, by + 7 + fb, 4, 4, possessed ? "#fff" : T.eye);
    } else if (T.key === "warden") {
      px(ctx, bx + 5, by + h - 9 + step * 2, 8, 9, dk);
      px(ctx, bx + w - 13, by + h - 9 - step * 2, 8, 9, dk);
      px(ctx, bx + 1, by + 6, w - 2, h - 12, col);             // armored body
      px(ctx, bx + 4, by + 10, w - 8, 3, "rgba(255,255,255,0.2)");
      px(ctx, bx + 4, by + 18, w - 8, 3, "rgba(0,0,0,0.2)");
      px(ctx, bx + w / 2 - 7, by, 14, 9, dk);                  // helm
      px(ctx, bx + w / 2 + 1, by + 2, 5, 4, possessed ? "#e7c6ff" : T.eye);
    }
    ctx.restore();
  }

  function drawSpirit(g, ctx) {
    var p = g.player, t = g.time;
    var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    var vuln = p.invuln > 0 && Math.floor(t * 20) % 2 === 0;
    ctx.save(); ctx.globalAlpha = vuln ? 0.4 : 1;
    // trail
    ctx.fillStyle = "rgba(176,107,214,0.25)";
    for (var i = 1; i <= 4; i++) ctx.fillRect(cx - p.vx * 0.01 * i - 4, cy - p.vy * 0.01 * i - 4, 8, 8);
    // flame body (chunky)
    var fl = Math.sin(t * 12) * 2;
    ctx.fillStyle = "#6a3f8a"; ctx.fillRect(cx - 8, cy - 10 - fl, 16, 20);
    ctx.fillStyle = "#b06bd6"; ctx.fillRect(cx - 6, cy - 8 - fl, 12, 16);
    ctx.fillStyle = "#e3c0ff"; ctx.fillRect(cx - 3, cy - 5 - fl, 6, 10);
    // eyes
    ctx.fillStyle = "#fff"; var fx = p.dir * 2;
    ctx.fillRect(cx - 4 + fx, cy - 3, 3, 3); ctx.fillRect(cx + 2 + fx, cy - 3, 3, 3);
    ctx.restore();
    // lunge guide
    if (p.dashCd <= 0 && p.dashT <= 0) {
      ctx.globalAlpha = 0.25; ctx.strokeStyle = "#b06bd6"; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + p.dir * 70, cy - 24); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }

  // ---- HUD --------------------------------------------------------------
  function drawHUD(g, ctx) {
    var p = g.player;
    // essence bar
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(14, 14, 244, 22);
    var ef = clamp(p.essence / p.maxEssence, 0, 1);
    ctx.fillStyle = "#7a2bd0"; ctx.fillRect(16, 16, 240 * ef, 18);
    ctx.fillStyle = "#c98bff"; ctx.fillRect(16, 16, 240 * ef, 5);
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px monospace"; ctx.textAlign = "left"; ctx.fillText("ESSENCE", 22, 29);

    ctx.font = "12px monospace";
    if (p.mode === "body" && p.host) {
      ctx.fillStyle = p.host.T.col; ctx.fillText("WEARING: " + p.host.T.name.toUpperCase(), 16, 54);
      if (p.maxVit > 0 && p.vit / p.maxVit < 0.3 && Math.floor(g.time * 4) % 2 === 0) { ctx.fillStyle = "#ff6a3a"; ctx.fillText("BODY CRUMBLING", 16, 72); }
    } else {
      ctx.fillStyle = "#b06bd6"; ctx.fillText("SPIRIT — take a body", 16, 54);
      if (p.grace > 1.4 && Math.floor(g.time * 5) % 2 === 0 && !inSafe(g, p)) { ctx.fillStyle = "#ff5db0"; ctx.fillText("EXPOSED — FADING", 16, 72); }
    }

    // sign / inner-voice text
    if (g.sign) {
      ctx.textAlign = "center"; ctx.font = "13px monospace";
      var tw = ctx.measureText(g.sign.text).width + 28;
      ctx.fillStyle = "rgba(10,6,18,0.82)"; ctx.fillRect((VIEW_W - tw) / 2, VIEW_H - 58, tw, 30);
      ctx.fillStyle = "#e7d6ff"; ctx.fillText(g.sign.text, VIEW_W / 2, VIEW_H - 38);
    }

    // banner
    if (g.bannerT > 0 && g.banner) {
      ctx.globalAlpha = clamp(g.bannerT, 0, 1); ctx.textAlign = "center"; ctx.font = "bold 40px monospace";
      ctx.fillStyle = "#fff"; ctx.fillText(g.banner, VIEW_W / 2, 120); ctx.globalAlpha = 1;
    }

    if (g.phase === "win") {
      ctx.fillStyle = "rgba(8,5,14,0.72)"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = "center"; ctx.fillStyle = "#ffb0ec"; ctx.font = "bold 48px monospace";
      ctx.fillText("THE RIFT YIELDS", VIEW_W / 2, VIEW_H / 2 - 16);
      ctx.fillStyle = "#fff"; ctx.font = "16px monospace";
      ctx.fillText("Bodies worn: " + g.hops + "   Deaths: " + g.deaths, VIEW_W / 2, VIEW_H / 2 + 22);
      ctx.fillStyle = "#caa6ff"; ctx.fillText("Press R to spread further", VIEW_W / 2, VIEW_H / 2 + 52);
    }
  }

  // ====================== INPUT / BOOT ==================================
  function handleKey(g, code, down) {
    var inp = g.input;
    if (code === "KeyA" || code === "ArrowLeft") inp.left = down;
    else if (code === "KeyD" || code === "ArrowRight") inp.right = down;
    else if (code === "Space" || code === "KeyW" || code === "ArrowUp") {
      if (down && !inp.jumpHeld) inp.jumpBuf = 0.12;
      if (!down && inp.jumpHeld) inp.jumpRel = true;
      inp.jumpHeld = down;
    } else if (code === "KeyJ" || code === "KeyK") {
      if (down) inp.actBuf = 0.12;
    } else if (code === "ShiftLeft" || code === "ShiftRight" || code === "KeyL") {
      if (down) inp.ejectBuf = 0.12;
    } else if (down && code === "KeyR") {
      if (g.phase === "win" || g.phase === "dead") return "restart";
    }
    return null;
  }

  function boot(canvas) {
    initAudio();
    var g = createGame({});
    var ctx = canvas.getContext("2d");
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = VIEW_W * DPR; canvas.height = VIEW_H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    function resumeAudio() { if (!AUDIO) initAudio(); else if (AUDIO.state === "suspended") AUDIO.resume(); }
    canvas.addEventListener("mousemove", function (ev) { var r = canvas.getBoundingClientRect(); g.input.aimx = (ev.clientX - r.left) / r.width * VIEW_W; g.input.aimy = (ev.clientY - r.top) / r.height * VIEW_H; });
    canvas.addEventListener("mousedown", function (ev) { ev.preventDefault(); resumeAudio(); if (g.phase === "win") { g = createGame({}); ROOT.__SYM = g; return; } if (ev.button === 0) g.input.actBuf = 0.12; else g.input.ejectBuf = 0.12; });
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    window.addEventListener("keydown", function (e) { if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) >= 0) e.preventDefault(); resumeAudio(); if (handleKey(g, e.code, true) === "restart") { g = createGame({}); ROOT.__SYM = g; } });
    window.addEventListener("keyup", function (e) { handleKey(g, e.code, false); });

    ROOT.__SYM = g;
    var last = performance.now();
    function frame(now) { var dt = Math.min((now - last) / 1000, 0.05); last = now; update(g, dt); render(g, ctx); requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  }

  // ====================== EXPORTS =======================================
  ROOT.SYM = {
    TS: TS, VIEW_W: VIEW_W, VIEW_H: VIEW_H, BODIES: BODIES,
    createGame: createGame, update: update, render: render,
    possess: possess, eject: eject, useAction: useAction, lunge: lunge,
    canPossess: canPossess, damageEnemy: damageEnemy, hurtPlayer: hurtPlayer,
    handleKey: handleKey, tileAt: tileAt, solidTile: solidTile, buildLevel: buildLevel,
    levelWing1: levelWing1, spawnEnemies: spawnEnemies, boot: boot,
    _internals: { inSafe: inSafe, checkHazards: checkHazards }
  };
})();
