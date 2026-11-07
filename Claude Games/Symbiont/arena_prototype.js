/* =========================================================================
   SYMBIONT  —  a body-hop action roguelite
   You are a spirit. Leap into enemies, wear their bodies, ride them till they
   crumble. Logic is fully separated from rendering so it can be driven by a
   headless test harness (createGame/update/possess/eject/attack are pure-ish
   and never touch the DOM).
   ========================================================================= */
(function () {
  "use strict";
  var ROOT = (typeof window !== "undefined") ? window : globalThis;

  // ----- world constants -------------------------------------------------
  var W = 960, H = 600;
  var TAU = Math.PI * 2;

  // ----- small math helpers ---------------------------------------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
  function ang(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
  function rand(g) { // deterministic-ish LCG so tests can seed
    g._seed = (g._seed * 1664525 + 1013904223) >>> 0;
    return g._seed / 4294967296;
  }
  function rrange(g, a, b) { return a + rand(g) * (b - a); }
  function pick(g, arr) { return arr[(rand(g) * arr.length) | 0]; }

  // ----- body / creature definitions ------------------------------------
  // Each defines stats + a kit. `will` is the HP fraction an elite must be
  // brought below before it can be possessed (0 = always possessable).
  var BODIES = {
    husk: {
      key: "husk", name: "Husk", color: "#7fae5a", eye: "#cde6a0",
      r: 16, maxHp: 28, speed: 132, maxVit: 13, decay: 1.0, will: 0,
      atkType: "melee", atkRange: 56, atkArc: 1.5, dmg: 14,
      atkCd: 0.42, vitCost: 0.5, dmgToPlayer: 8, aiRange: 999,
      desc: "A common grunt. A reliable swipe. Decays at an even pace."
    },
    brute: {
      key: "brute", name: "Brute", color: "#b06a3a", eye: "#ffd9a0",
      r: 26, maxHp: 70, speed: 88, maxVit: 11, decay: 1.35, will: 0,
      atkType: "slam", atkRange: 120, dmg: 30, atkCd: 0.95,
      vitCost: 1.6, dmgToPlayer: 16, aiRange: 999, smashes: true,
      desc: "Slow and mighty. Ground-slam shockwave knocks foes back and shatters barriers. Burns out fast."
    },
    dart: {
      key: "dart", name: "Dart", color: "#46b6c9", eye: "#d6fbff",
      r: 13, maxHp: 18, speed: 224, maxVit: 14, decay: 0.95, will: 0,
      atkType: "ranged", atkRange: 520, dmg: 11, atkCd: 0.3,
      vitCost: 0.35, projSpeed: 560, dmgToPlayer: 7, aiRange: 360,
      desc: "Fast and fragile. Fires needles from afar. Glass cannon."
    },
    warden: {
      key: "warden", name: "Warden", color: "#8a8fb0", eye: "#e7ecff",
      r: 22, maxHp: 95, speed: 96, maxVit: 18, decay: 0.62, will: 0,
      atkType: "shield", atkRange: 60, dmg: 12, atkCd: 0.7,
      vitCost: 0.4, dmgToPlayer: 10, aiRange: 999, shieldDur: 2.6,
      desc: "Durable. Raises a shield bubble that eats projectiles. Decays slowly — the marathon body."
    },
    hexer: {
      key: "hexer", name: "Hexer", color: "#9a5fc4", eye: "#f0d2ff",
      r: 17, maxHp: 30, speed: 110, maxVit: 12, decay: 1.05, will: 0,
      atkType: "orb", atkRange: 460, dmg: 20, atkCd: 0.62,
      vitCost: 0.8, projSpeed: 230, dmgToPlayer: 10, aiRange: 320, homing: true,
      desc: "Lobs slow homing orbs that curve into prey. Strong but thirsty for vitality."
    },
    // Elite — must be wounded below `will` HP fraction before you can steal it.
    revenant: {
      key: "revenant", name: "Revenant", color: "#c9456b", eye: "#ffd0dd",
      r: 24, maxHp: 130, speed: 150, maxVit: 16, decay: 0.8, will: 0.45,
      atkType: "melee", atkRange: 70, atkArc: 1.8, dmg: 26, atkCd: 0.5,
      vitCost: 0.6, dmgToPlayer: 18, aiRange: 999, elite: true,
      desc: "An elite. Resists possession until wounded — then a brutal, fast host."
    }
  };
  // Boss is a fight, not a host (its will is unbreakable).
  var BOSS = {
    key: "maw", name: "THE MAW", color: "#6a2b8a", eye: "#ff5db0",
    r: 64, maxHp: 1500, speed: 36, will: 1.1, elite: true, boss: true,
    desc: "A hollow god that devours the possessed."
  };

  // ----- factories -------------------------------------------------------
  function makeEnemy(g, typeKey, x, y) {
    var T = (typeKey === "maw") ? BOSS : BODIES[typeKey];
    return {
      type: typeKey, T: T, x: x, y: y, vx: 0, vy: 0, r: T.r,
      hp: T.maxHp, maxHp: T.maxHp, controlled: false,
      atkCd: 0, hitFlash: 0, facing: 0, walk: rrange(g, 0, TAU),
      stun: 0, knock: 0, kx: 0, ky: 0, born: g.time, dead: false,
      shootCd: rrange(g, 0.4, 1.6), summonCd: 4
    };
  }

  function createGame(opts) {
    opts = opts || {};
    var g = {
      _seed: (opts.seed != null ? opts.seed : (Date.now() & 0xffffffff)) >>> 0,
      time: 0, W: W, H: H,
      phase: "tutorial",      // tutorial | fight | reward | boss | win | dead
      tutStep: 0,
      wave: 0, maxWaves: 6,
      enemies: [], projectiles: [], particles: [], shocks: [], motes: [], floats: [],
      shake: 0, hitstop: 0, flash: 0,
      kills: 0, hops: 0,
      traits: {},            // permanent spirit upgrades this run
      rewardChoices: null,
      boss: null,
      player: {
        mode: "spirit",      // spirit | body
        host: null,
        x: W * 0.5, y: H * 0.5, vx: 0, vy: 0, r: 12,
        essence: 100, maxEssence: 100,
        grace: 0,            // time bodiless before essence bleeds
        invuln: 1.2,
        leapCd: 0, atkCd: 0,
        vit: 0, maxVit: 0,   // current body's decay meter
        aimx: W * 0.5, aimy: H * 0.4,
        leaping: false, leapT: 0,
        shield: 0,           // warden shield timer
        empower: 0,          // "violent birth" first-hit buff
        color: "#b06bff"
      },
      input: { up: 0, down: 0, left: 0, right: 0, leap: 0, atk: 0 },
      banner: null, bannerT: 0
    };
    return g;
  }

  // ----- trait definitions (roguelite spirit upgrades) -------------------
  var TRAITS = {
    resilient: { name: "Resilient Flesh", desc: "Bodies decay 30% slower." },
    vampiric:  { name: "Vampiric", desc: "Kills restore +120% essence." },
    longleap:  { name: "Long Leap", desc: "Leap & possession reach +45%." },
    violent:   { name: "Violent Birth", desc: "First strike in a new body deals 2.2× damage + knockback." },
    spectral:  { name: "Spectral Armor", desc: "Spirit takes 55% less essence damage; grace +1.2s." },
    echoslam:  { name: "Echo Slam", desc: "Ejecting bursts a shockwave that hurts nearby foes." },
    adrenal:   { name: "Adrenal Decay", desc: "Attacks cost 50% less vitality." },
    greed:     { name: "Greed", desc: "Foes drop +1 essence mote on death." }
  };

  function decayMult(g) { return g.traits.resilient ? 0.7 : 1; }
  function leapReach(g) { return g.traits.longleap ? 1.45 : 1; }

  // ----- possession / ejection ------------------------------------------
  function canPossess(g, e) {
    if (!e || e.dead || e.controlled || e.type === "maw") return false;
    var will = e.T.will || 0;
    if (will <= 0) return true;
    return e.hp <= e.maxHp * will; // elites only when wounded
  }

  function possess(g, e) {
    var p = g.player;
    p.mode = "body"; p.host = e; e.controlled = true;
    p.vit = e.T.maxVit; p.maxVit = e.T.maxVit;
    p.leaping = false; p.leapT = 0; p.invuln = 0.35;
    p.atkCd = 0.12; p.shield = 0;
    p.empower = g.traits.violent ? 1 : 0;
    g.hops++;
    burst(g, e.x, e.y, e.T.color, 22, 200);
    ring(g, e.x, e.y, e.r + 6, "#d9b3ff");
    g.shake = Math.min(g.shake + 6, 16);
    sfx(g, "possess");
    if (g.phase === "tutorial") advanceTutorial(g, "possessed");
    return e;
  }

  // leap out of current body toward the aim point; old body crumbles.
  function eject(g, dirx, diry) {
    var p = g.player;
    if (p.mode !== "body" || !p.host) return;
    var e = p.host;
    e.dead = true; e.controlled = false;
    crumble(g, e.x, e.y, e.T.color);
    if (g.traits.echoslam) {
      g.shocks.push({ x: e.x, y: e.y, r: 10, max: 130, dmg: 22, hit: {}, life: 1, ttl: 0.4, color: "#b06bff" });
    }
    p.mode = "spirit"; p.host = null;
    p.x = e.x; p.y = e.y;
    var a = Math.atan2(diry, dirx);
    var pwr = 560;
    p.vx = Math.cos(a) * pwr; p.vy = Math.sin(a) * pwr;
    p.leaping = true; p.leapT = 0.28; p.invuln = Math.max(p.invuln, 0.18);
    p.vit = 0; p.maxVit = 0; p.shield = 0;
    sfx(g, "eject");
    g.shake = Math.min(g.shake + 4, 16);
  }

  // body lost to combat (hp gone) — pop to spirit, keep essence, brief invuln
  function bodyDied(g) {
    var p = g.player, e = p.host;
    if (e) { e.dead = true; e.controlled = false; deathFx(g, e); }
    p.mode = "spirit"; p.host = null;
    if (e) { p.x = e.x; p.y = e.y; }
    p.vx *= 0.3; p.vy *= 0.3;
    p.invuln = 1.0; p.grace = 0;
    p.vit = 0; p.maxVit = 0; p.shield = 0;
    g.flash = Math.min(g.flash + 0.5, 1);
    sfx(g, "bodyloss");
  }

  // ----- the player's leap (spirit form) --------------------------------
  function spiritLeap(g, dirx, diry) {
    var p = g.player;
    if (p.mode !== "spirit" || p.leapCd > 0) return;
    var a = Math.atan2(diry, dirx);
    var pwr = 600 * leapReach(g);
    p.vx = Math.cos(a) * pwr; p.vy = Math.sin(a) * pwr;
    p.leaping = true; p.leapT = 0.3; p.leapCd = 0.34;
    sfx(g, "leap");
    for (var i = 0; i < 6; i++) puff(g, p.x, p.y, p.color);
  }

  // ----- attacks (body kits) --------------------------------------------
  function useAttack(g) {
    var p = g.player;
    if (p.mode !== "body" || !p.host || p.atkCd > 0) return;
    var e = p.host, T = e.T;
    var a = ang(e.x, e.y, p.aimx, p.aimy);
    e.facing = a;
    var vc = T.vitCost * (g.traits.adrenal ? 0.5 : 1);
    var empow = p.empower ? 2.2 : 1;
    var kb = p.empower ? 220 : 0;
    p.empower = 0;
    p.atkCd = T.atkCd;
    p.vit = Math.max(0, p.vit - vc);

    if (T.atkType === "melee" || T.atkType === "shield") {
      // arc sweep in front
      var arc = T.atkArc || 1.1;
      var reach = T.atkRange;
      swipeFx(g, e.x, e.y, a, reach, T.color);
      for (var i = 0; i < g.enemies.length; i++) {
        var o = g.enemies[i];
        if (o === e || o.dead || o.controlled) continue;
        if (dist(e.x, e.y, o.x, o.y) <= reach + o.r) {
          var da = Math.abs(normAng(ang(e.x, e.y, o.x, o.y) - a));
          if (da <= arc * 0.5) damageEnemy(g, o, T.dmg * empow, a, kb || 120);
        }
      }
      sfx(g, "swipe");
    } else if (T.atkType === "slam") {
      g.shocks.push({ x: e.x, y: e.y, r: 14, max: T.atkRange, dmg: T.dmg * empow,
        hit: {}, life: 1, ttl: 0.42, color: "#ffcaa0", knock: 320 + kb });
      g.shake = Math.min(g.shake + 7, 16);
      sfx(g, "slam");
      // brutes shatter barriers
      for (var b = 0; b < g.enemies.length; b++) {
        var bx = g.enemies[b];
        if (bx.type === "barrier" && dist(e.x, e.y, bx.x, bx.y) < T.atkRange) damageEnemy(g, bx, 999, a, 0);
      }
    } else if (T.atkType === "ranged" || T.atkType === "orb") {
      spawnProj(g, e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a,
        T.projSpeed, T.dmg * empow, true, T.atkType === "orb", T.color);
      sfx(g, T.atkType === "orb" ? "orb" : "shoot");
    }
    if (T.atkType === "shield") { p.shield = T.shieldDur; }
    if (p.vit <= 0) eject(g, Math.cos(p._lastDir || 0), Math.sin(p._lastDir || 0)); // burnt out by attacking
  }

  function normAng(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

  function spawnProj(g, x, y, a, sp, dmg, fromPlayer, homing, color) {
    g.projectiles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      dmg: dmg, fromPlayer: fromPlayer, homing: homing, color: color, r: 6, life: 2.4 });
  }

  // ----- damage ----------------------------------------------------------
  function damageEnemy(g, e, dmg, a, knock) {
    if (e.dead) return;
    e.hp -= dmg; e.hitFlash = 0.12;
    if (knock) { e.knock = Math.max(e.knock, 0.18); e.kx = Math.cos(a) * knock; e.ky = Math.sin(a) * knock; }
    floatText(g, e.x, e.y - e.r, Math.round(dmg), "#fff");
    for (var i = 0; i < 5; i++) puff(g, e.x, e.y, e.T.color);
    if (e.hp <= 0) killEnemy(g, e);
    else if (e.type === "maw") g.boss = e;
  }

  function killEnemy(g, e) {
    if (e.dead) return;
    e.dead = true; e.controlled = false;
    g.kills++;
    deathFx(g, e);
    if (e.type !== "barrier") {
      var n = 1 + (g.traits.greed ? 1 : 0) + (e.T.elite ? 2 : 0);
      for (var i = 0; i < n; i++) {
        g.motes.push({ x: e.x + rrange(g, -10, 10), y: e.y + rrange(g, -10, 10),
          vx: rrange(g, -60, 60), vy: rrange(g, -90, -20), life: 8, r: 4 });
      }
    }
    if (e.type === "maw") winGame(g);
  }

  // damage the player (only meaningful in spirit mode; body absorbs via hp)
  function damagePlayer(g, dmg, fromX, fromY) {
    var p = g.player;
    if (p.invuln > 0) return;
    if (p.mode === "body" && p.host) {
      if (p.shield > 0) { ring(g, p.host.x, p.host.y, p.host.r + 8, "#bfe6ff"); sfx(g, "block"); return; }
      damageEnemy(g, p.host, dmg, ang(fromX, fromY, p.host.x, p.host.y), 80);
      p.host.hp = p.host.hp; // host hp tracked on entity
      p.invuln = 0.35;
      if (p.host.hp <= 0) bodyDied(g);
      g.shake = Math.min(g.shake + 3, 16);
    } else {
      var mult = g.traits.spectral ? 0.45 : 1;
      p.essence -= dmg * 2.2 * mult; // spirit hits hurt a lot
      p.invuln = 0.7;
      g.shake = Math.min(g.shake + 5, 16); g.flash = Math.min(g.flash + 0.4, 1);
      burst(g, p.x, p.y, "#b06bff", 10, 160);
      sfx(g, "hurt");
      if (p.essence <= 0) loseGame(g);
    }
  }

  // ----- waves / phases --------------------------------------------------
  var WAVE_TABLE = [
    ["husk", "husk", "husk"],
    ["husk", "husk", "dart", "dart"],
    ["husk", "brute", "dart", "hexer"],
    ["dart", "dart", "hexer", "warden", "husk"],
    ["brute", "hexer", "hexer", "revenant"],
    ["brute", "brute", "dart", "dart", "warden", "revenant"]
  ];

  function startWave(g, n) {
    g.wave = n;
    g.phase = "fight";
    g.rewardChoices = null;
    var list = WAVE_TABLE[clamp(n - 1, 0, WAVE_TABLE.length - 1)];
    // scale up on later loops
    var extra = Math.max(0, n - WAVE_TABLE.length);
    for (var i = 0; i < list.length; i++) spawnAtEdge(g, list[i]);
    for (var x = 0; x < extra; x++) spawnAtEdge(g, pick(g, ["husk", "dart", "hexer"]));
    banner(g, "WAVE " + n);
  }

  function spawnAtEdge(g, key) {
    var side = (rand(g) * 4) | 0, x, y, m = 60;
    if (side === 0) { x = rrange(g, m, W - m); y = -30; }
    else if (side === 1) { x = W + 30; y = rrange(g, m, H - m); }
    else if (side === 2) { x = rrange(g, m, W - m); y = H + 30; }
    else { x = -30; y = rrange(g, m, H - m); }
    var e = makeEnemy(g, key, x, y);
    e.spawnIn = 0.5; // brief spawn-in fade
    g.enemies.push(e);
    spawnRing(g, x, y, key === "maw" ? BOSS.color : BODIES[key].color);
    return e;
  }

  function startBoss(g) {
    g.phase = "boss";
    var e = makeEnemy(g, "maw", W * 0.5, -80);
    e.targetY = 150;
    g.enemies.push(e); g.boss = e;
    banner(g, "THE MAW");
    sfx(g, "bossroar");
  }

  function offerReward(g) {
    g.phase = "reward";
    var owned = Object.keys(g.traits);
    var avail = Object.keys(TRAITS).filter(function (k) { return owned.indexOf(k) < 0; });
    // shuffle
    for (var i = avail.length - 1; i > 0; i--) { var j = (rand(g) * (i + 1)) | 0; var t = avail[i]; avail[i] = avail[j]; avail[j] = t; }
    g.rewardChoices = avail.slice(0, 3);
    banner(g, "CHOOSE A TRAIT");
  }

  function chooseReward(g, key) {
    if (g.phase !== "reward" || !g.rewardChoices || g.rewardChoices.indexOf(key) < 0) return;
    g.traits[key] = true;
    if (key === "spectral") g.player.maxEssence += 0; // grace handled in update
    g.rewardChoices = null;
    if (g.wave >= g.maxWaves) startBoss(g);
    else startWave(g, g.wave + 1);
  }

  function winGame(g) { g.phase = "win"; banner(g, "THE MAW FALLS"); g.shake = 18; g.flash = 1; }
  function loseGame(g) { g.phase = "dead"; banner(g, "ESSENCE LOST"); g.flash = 1; }

  // ----- tutorial --------------------------------------------------------
  // step 0: leap into the dormant husk. step1: attack a target. step2: feel
  // decay / eject. then begin wave 1.
  var TUT = [
    "A spirit cannot fight. LEAP into the husk — aim with the mouse, press SPACE.",
    "You wear its body now. Its VITALITY (yellow bar) is draining. LEFT-CLICK to strike the target.",
    "Every body is a fuse. Press SPACE to LEAP OUT toward your cursor — then dive into fresh prey."
  ];
  function startTutorial(g) {
    g.phase = "tutorial"; g.tutStep = 0;
    var husk = makeEnemy(g, "husk", W * 0.5 + 150, H * 0.5);
    husk.dormant = true; g.enemies.push(husk);
    g.tutHusk = husk;
    banner(g, "SYMBIONT");
  }
  function advanceTutorial(g, ev) {
    if (g.phase !== "tutorial") return;
    if (ev === "possessed" && g.tutStep === 0) {
      g.tutStep = 1;
      var t = makeEnemy(g, "husk", W * 0.5 - 180, H * 0.5 - 60);
      t.dormant = true; t.tutTarget = true; g.enemies.push(t);
    } else if (ev === "killed" && g.tutStep === 1) {
      g.tutStep = 2;
    } else if (ev === "ejected" && g.tutStep === 2) {
      g.tutStep = 3;
      banner(g, "GO");
      setTimeoutSafe(g, function () { startWave(g, 1); }, 0.8);
    }
  }
  // simple timer queue (so logic stays DOM-free / testable)
  function setTimeoutSafe(g, fn, t) { (g._timers || (g._timers = [])).push({ fn: fn, t: t }); }

  // ----- particles / fx --------------------------------------------------
  function puff(g, x, y, color) {
    g.particles.push({ x: x, y: y, vx: rrange(g, -50, 50), vy: rrange(g, -50, 50),
      life: rrange(g, 0.2, 0.5), max: 0.5, r: rrange(g, 1.5, 3.5), color: color, kind: "p" });
  }
  function burst(g, x, y, color, n, sp) {
    for (var i = 0; i < n; i++) {
      var a = rand(g) * TAU, s = rrange(g, sp * 0.3, sp);
      g.particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rrange(g, 0.3, 0.7), max: 0.7, r: rrange(g, 2, 4), color: color, kind: "p" });
    }
  }
  function crumble(g, x, y, color) {
    burst(g, x, y, color, 26, 240);
    for (var i = 0; i < 10; i++)
      g.particles.push({ x: x + rrange(g, -14, 14), y: y + rrange(g, -14, 14), vx: rrange(g, -30, 30),
        vy: rrange(g, -120, -40), life: rrange(g, 0.5, 1.0), max: 1, r: rrange(g, 2, 5), color: color, kind: "chunk", grav: 320 });
  }
  function deathFx(g, e) { burst(g, e.x, e.y, e.T.color, 18, 220); ring(g, e.x, e.y, e.r, "#fff"); g.shake = Math.min(g.shake + 3, 16); sfx(g, "die"); }
  function ring(g, x, y, r, color) { g.shocks.push({ x: x, y: y, r: r, max: r + 28, dmg: 0, hit: {}, life: 1, ttl: 0.3, color: color, fxOnly: true }); }
  function spawnRing(g, x, y, color) { g.shocks.push({ x: x, y: y, r: 4, max: 44, dmg: 0, hit: {}, life: 1, ttl: 0.4, color: color, fxOnly: true }); }
  function swipeFx(g, x, y, a, reach, color) {
    g.shocks.push({ x: x, y: y, r: reach * 0.6, max: reach, dmg: 0, hit: {}, life: 1, ttl: 0.18, color: color, fxOnly: true, arc: a });
  }
  function floatText(g, x, y, txt, color) { g.floats.push({ x: x, y: y, txt: "" + txt, color: color, life: 0.8, max: 0.8 }); }
  function banner(g, txt) { g.banner = txt; g.bannerT = 1.6; }

  // ----- audio (procedural WebAudio, guarded for headless) ---------------
  var AUDIO = null;
  function initAudio() {
    if (AUDIO || typeof window === "undefined" || !window.AudioContext) return;
    try { AUDIO = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AUDIO = null; }
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!AUDIO) return;
    var t = AUDIO.currentTime;
    var o = AUDIO.createOscillator(), gn = AUDIO.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(AUDIO.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, filterFreq) {
    if (!AUDIO) return;
    var t = AUDIO.currentTime, n = Math.floor(AUDIO.sampleRate * dur);
    var buf = AUDIO.createBuffer(1, n, AUDIO.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = AUDIO.createBufferSource(); s.buffer = buf;
    var f = AUDIO.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filterFreq || 1200;
    var gn = AUDIO.createGain(); gn.gain.value = vol || 0.2;
    s.connect(f); f.connect(gn); gn.connect(AUDIO.destination); s.start(t);
  }
  function sfx(g, name) {
    if (!AUDIO) return;
    switch (name) {
      case "leap": tone(280, 0.18, "sine", 0.12, 520); break;
      case "possess": tone(140, 0.3, "sawtooth", 0.16, 320); noise(0.18, 0.1, 800); break;
      case "eject": tone(420, 0.16, "triangle", 0.12, 160); break;
      case "swipe": noise(0.12, 0.14, 2400); break;
      case "slam": tone(70, 0.35, "square", 0.2, 40); noise(0.25, 0.18, 500); break;
      case "shoot": tone(620, 0.1, "square", 0.08, 420); break;
      case "orb": tone(360, 0.18, "sine", 0.1, 300); break;
      case "die": noise(0.2, 0.14, 700); tone(180, 0.15, "sawtooth", 0.08, 60); break;
      case "hurt": tone(200, 0.2, "square", 0.16, 80); noise(0.12, 0.1, 600); break;
      case "bodyloss": tone(150, 0.4, "sawtooth", 0.18, 50); noise(0.3, 0.14, 500); break;
      case "block": tone(700, 0.1, "sine", 0.1, 900); break;
      case "bossroar": tone(60, 0.8, "sawtooth", 0.22, 30); noise(0.7, 0.16, 380); break;
      case "mote": tone(880, 0.08, "sine", 0.06, 1200); break;
      case "trait": tone(523, 0.15, "sine", 0.12); tone(784, 0.2, "sine", 0.1); break;
    }
  }

  // ============================ UPDATE ===================================
  function update(g, dt) {
    if (dt > 0.05) dt = 0.05; // clamp big frames
    g.time += dt;

    // timers
    if (g._timers) {
      for (var ti = g._timers.length - 1; ti >= 0; ti--) {
        g._timers[ti].t -= dt;
        if (g._timers[ti].t <= 0) { var f = g._timers[ti].fn; g._timers.splice(ti, 1); f(); }
      }
    }

    g.shake = Math.max(0, g.shake - dt * 30);
    g.flash = Math.max(0, g.flash - dt * 2.2);
    if (g.bannerT > 0) g.bannerT -= dt;

    if (g.phase === "win" || g.phase === "dead") { updateParticles(g, dt); updateShocks(g, dt); return; }
    if (g.hitstop > 0) { g.hitstop -= dt; return; }

    var p = g.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.leapCd = Math.max(0, p.leapCd - dt);
    p.atkCd = Math.max(0, p.atkCd - dt);
    if (p.shield > 0) p.shield -= dt;

    // ----- player control -----
    var ix = (g.input.right ? 1 : 0) - (g.input.left ? 1 : 0);
    var iy = (g.input.down ? 1 : 0) - (g.input.up ? 1 : 0);
    var adx = g.player.aimx - (p.mode === "body" && p.host ? p.host.x : p.x);
    var ady = g.player.aimy - (p.mode === "body" && p.host ? p.host.y : p.y);
    if (adx || ady) p._lastDir = Math.atan2(ady, adx);

    if (p.mode === "spirit") {
      if (p.leaping) {
        p.leapT -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.86; p.vy *= 0.86;
        // trail
        if (rand(g) < 0.7) g.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.3, max: 0.3, r: 4, color: "#b06bff", kind: "p" });
        // possession check mid-flight
        var best = null, bd = 1e9;
        for (var i = 0; i < g.enemies.length; i++) {
          var e = g.enemies[i];
          if (!canPossess(g, e)) continue;
          var d = dist2(p.x, p.y, e.x, e.y);
          if (d < (e.r + p.r + 6) * (e.r + p.r + 6) && d < bd) { bd = d; best = e; }
        }
        if (best) { possess(g, best); }
        else if (p.leapT <= 0) { p.leaping = false; p.vx *= 0.4; p.vy *= 0.4; }
      } else {
        var sp = 150;
        p.vx = lerp(p.vx, ix * sp, 0.2); p.vy = lerp(p.vy, iy * sp, 0.2);
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      p.x = clamp(p.x, 16, W - 16); p.y = clamp(p.y, 16, H - 16);

      // bodiless essence bleed (the urgency)
      var graceMax = g.traits.spectral ? 2.7 : 1.5;
      p.grace += dt;
      if (p.grace > graceMax) p.essence -= dt * 7;
      if (p.essence <= 0) loseGame(g);
    } else if (p.mode === "body" && p.host && !p.host.dead) {
      var e = p.host;
      p.grace = 0;
      var sp2 = e.T.speed;
      // decaying body slows down
      var vitFrac = p.maxVit > 0 ? p.vit / p.maxVit : 0;
      sp2 *= lerp(0.55, 1, clamp(vitFrac + 0.2, 0, 1));
      e.vx = lerp(e.vx, ix * sp2, 0.25); e.vy = lerp(e.vy, iy * sp2, 0.25);
      if (e.knock > 0) { e.knock -= dt; e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= 0.9; e.ky *= 0.9; }
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.x = clamp(e.x, e.r, W - e.r); e.y = clamp(e.y, e.r, H - e.r);
      if (ix || iy) e.facing = Math.atan2(e.vy, e.vx);
      e.walk += dt * (Math.abs(e.vx) + Math.abs(e.vy)) * 0.02;
      p.x = e.x; p.y = e.y;
      e.hitFlash = Math.max(0, e.hitFlash - dt);

      // decay drain
      p.vit -= dt * e.T.decay * decayMult(g);
      if (p.vit <= 0) { eject(g, Math.cos(p._lastDir || 0), Math.sin(p._lastDir || 0)); }
    }

    // ----- enemies AI -----
    var tx = p.mode === "body" && p.host ? p.host.x : p.x;
    var ty = p.mode === "body" && p.host ? p.host.y : p.y;
    for (var k = 0; k < g.enemies.length; k++) {
      var en = g.enemies[k];
      if (en.dead || en.controlled || en.dormant) { if (en.hitFlash) en.hitFlash = Math.max(0, en.hitFlash - dt); continue; }
      if (en.spawnIn > 0) { en.spawnIn -= dt; continue; }
      en.hitFlash = Math.max(0, en.hitFlash - dt);
      en.atkCd = Math.max(0, en.atkCd - dt);
      if (en.knock > 0) { en.knock -= dt; en.x += en.kx * dt; en.y += en.ky * dt; en.kx *= 0.9; en.ky *= 0.9; }

      if (en.type === "maw") { updateBoss(g, en, dt, tx, ty); continue; }
      var T = en.T;
      var dToP = dist(en.x, en.y, tx, ty);
      var aToP = ang(en.x, en.y, tx, ty);
      var desired = T.aiRange < 999 ? Math.min(T.atkRange * 0.7, 280) : 0; // ranged keep distance
      var moveDir = aToP;
      var move = true;
      if (T.aiRange < 999) {
        if (dToP < desired - 30) moveDir = aToP + Math.PI; // back off
        else if (dToP < desired + 40) move = false;       // hold
      }
      if (move && en.knock <= 0) {
        en.x += Math.cos(moveDir) * T.speed * dt;
        en.y += Math.sin(moveDir) * T.speed * dt;
      }
      en.x = clamp(en.x, en.r, W - en.r); en.y = clamp(en.y, en.r, H - en.r);
      en.facing = aToP;
      en.walk += dt * 6;

      // attack the player
      if (en.atkCd <= 0) {
        if (T.atkType === "ranged" || T.atkType === "orb") {
          if (dToP < T.atkRange) {
            spawnProj(g, en.x + Math.cos(aToP) * en.r, en.y + Math.sin(aToP) * en.r, aToP,
              T.projSpeed, T.dmgToPlayer, false, T.homing, T.color);
            en.atkCd = T.atkCd + rrange(g, 0.1, 0.5);
            sfx(g, T.atkType === "orb" ? "orb" : "shoot");
          }
        } else {
          var reach = (T.atkType === "slam") ? T.atkRange * 0.5 : T.atkRange;
          if (dToP < reach + (p.host ? p.host.r : p.r)) {
            if (T.atkType === "slam") {
              g.shocks.push({ x: en.x, y: en.y, r: 12, max: T.atkRange, dmg: 0, hit: {}, life: 1, ttl: 0.4, color: "#ffcaa0", enemyHit: true, dmgToPlayer: T.dmgToPlayer });
              sfx(g, "slam");
            } else { swipeFx(g, en.x, en.y, aToP, reach, T.color); sfx(g, "swipe"); }
            damagePlayer(g, T.dmgToPlayer, en.x, en.y);
            en.atkCd = T.atkCd + rrange(g, 0.05, 0.3);
          }
        }
      }
    }

    updateProjectiles(g, dt, tx, ty);
    updateShocks(g, dt);
    updateMotes(g, dt);
    updateParticles(g, dt);
    updateFloats(g, dt);

    // remove dead enemies
    for (var r = g.enemies.length - 1; r >= 0; r--) if (g.enemies[r].dead) g.enemies.splice(r, 1);

    // wave / phase progression
    if (g.phase === "fight") {
      var alive = countHostiles(g);
      if (alive === 0 && !pendingSpawns(g)) {
        if (g.wave >= g.maxWaves) { offerRewardThenBoss(g); }
        else offerReward(g);
      }
    }
  }

  function offerRewardThenBoss(g) { offerReward(g); g._bossNext = true; }

  function countHostiles(g) {
    var n = 0;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (!e.dead && !e.controlled && !e.dormant && e.type !== "barrier") n++;
    }
    return n;
  }
  function pendingSpawns(g) { return false; }

  function updateBoss(g, e, dt, tx, ty) {
    if (e.targetY != null && e.y < e.targetY) { e.y += 60 * dt; return; }
    var a = ang(e.x, e.y, tx, ty);
    // slow drift toward player
    e.x += Math.cos(a) * e.T.speed * dt; e.y += Math.sin(a) * e.T.speed * dt;
    e.x = clamp(e.x, e.r, W - e.r); e.y = clamp(e.y, e.r, H - e.r);
    e.shootCd -= dt; e.summonCd -= dt;
    var hpFrac = e.hp / e.maxHp;
    if (e.shootCd <= 0) {
      var spokes = hpFrac < 0.5 ? 12 : 8;
      for (var i = 0; i < spokes; i++) {
        var aa = (i / spokes) * TAU + g.time * 0.6;
        spawnProj(g, e.x, e.y, aa, 150, 16, false, false, "#ff5db0");
      }
      e.shootCd = hpFrac < 0.5 ? 1.4 : 2.0;
      sfx(g, "orb");
    }
    if (e.summonCd <= 0) {
      for (var s = 0; s < (hpFrac < 0.5 ? 3 : 2); s++) {
        var ne = makeEnemy(g, "husk", e.x + rrange(g, -60, 60), e.y + 60);
        ne.spawnIn = 0.4; g.enemies.push(ne); spawnRing(g, ne.x, ne.y, "#7fae5a");
      }
      e.summonCd = 6;
    }
    e.walk += dt * 2;
  }

  function updateProjectiles(g, dt, tx, ty) {
    var p = g.player;
    for (var i = g.projectiles.length - 1; i >= 0; i--) {
      var pr = g.projectiles[i];
      pr.life -= dt;
      if (pr.homing) {
        var targetx, targety;
        if (pr.fromPlayer) { var nn = nearestEnemy(g, pr.x, pr.y); if (nn) { targetx = nn.x; targety = nn.y; } }
        else { targetx = tx; targety = ty; }
        if (targetx != null) {
          var ca = Math.atan2(pr.vy, pr.vx), da2 = Math.atan2(targety - pr.y, targetx - pr.x);
          var na = ca + clamp(normAng(da2 - ca), -2.5 * dt, 2.5 * dt);
          var sp = Math.sqrt(pr.vx * pr.vx + pr.vy * pr.vy);
          pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
        }
      }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (rand(g) < 0.3) g.particles.push({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.2, max: 0.2, r: 2, color: pr.color, kind: "p" });
      var rm = false;
      if (pr.x < -20 || pr.x > W + 20 || pr.y < -20 || pr.y > H + 20 || pr.life <= 0) rm = true;
      if (!rm && pr.fromPlayer) {
        for (var j = 0; j < g.enemies.length; j++) {
          var e = g.enemies[j];
          if (e.dead || e.controlled || e.dormant || e.spawnIn > 0) continue;
          if (dist2(pr.x, pr.y, e.x, e.y) < (e.r + pr.r) * (e.r + pr.r)) {
            damageEnemy(g, e, pr.dmg, Math.atan2(pr.vy, pr.vx), 60); rm = true; break;
          }
        }
      } else if (!rm) {
        // hits player
        var px = p.mode === "body" && p.host ? p.host.x : p.x;
        var py = p.mode === "body" && p.host ? p.host.y : p.y;
        var pr2 = p.mode === "body" && p.host ? p.host.r : p.r;
        if (dist2(pr.x, pr.y, px, py) < (pr2 + pr.r) * (pr2 + pr.r)) {
          if (p.mode === "body" && p.shield > 0) { ring(g, px, py, pr2 + 6, "#bfe6ff"); sfx(g, "block"); }
          else damagePlayer(g, pr.dmg, pr.x, pr.y);
          rm = true;
        }
      }
      if (rm) g.projectiles.splice(i, 1);
    }
  }

  function nearestEnemy(g, x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (e.dead || e.controlled || e.dormant) continue;
      var d = dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function updateShocks(g, dt) {
    var p = g.player;
    for (var i = g.shocks.length - 1; i >= 0; i--) {
      var s = g.shocks[i];
      s.ttl -= dt; s.life = clamp(s.ttl / 0.4, 0, 1);
      s.r = lerp(s.r, s.max, 0.25);
      if (!s.fxOnly) {
        if (s.enemyHit) {
          // enemy slam hitting player handled at attack time; this is fx
        } else {
          // player slam: damage enemies once
          for (var j = 0; j < g.enemies.length; j++) {
            var e = g.enemies[j];
            if (e.dead || e.controlled || e.dormant) continue;
            if (s.hit[j]) continue;
            if (dist(s.x, s.y, e.x, e.y) <= s.r + e.r && dist(s.x, s.y, e.x, e.y) >= s.r - 40) {
              s.hit[j] = 1;
              damageEnemy(g, e, s.dmg, ang(s.x, s.y, e.x, e.y), s.knock || 200);
            }
          }
        }
      }
      if (s.ttl <= 0) g.shocks.splice(i, 1);
    }
  }

  function updateMotes(g, dt) {
    var p = g.player;
    var px = p.mode === "body" && p.host ? p.host.x : p.x;
    var py = p.mode === "body" && p.host ? p.host.y : p.y;
    for (var i = g.motes.length - 1; i >= 0; i--) {
      var m = g.motes[i]; m.life -= dt;
      m.vy += 120 * dt;
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.y > H - 8) { m.y = H - 8; m.vy *= -0.3; m.vx *= 0.7; }
      var d = dist(m.x, m.y, px, py);
      if (d < 120) { var a = ang(m.x, m.y, px, py); m.vx += Math.cos(a) * 600 * dt; m.vy += Math.sin(a) * 600 * dt; }
      if (d < (p.host ? p.host.r : p.r) + 8) {
        var gain = 6 * (g.traits.vampiric ? 2.2 : 1);
        p.essence = Math.min(p.maxEssence, p.essence + gain);
        sfx(g, "mote");
        g.motes.splice(i, 1); continue;
      }
      if (m.life <= 0) g.motes.splice(i, 1);
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
    for (var i = g.floats.length - 1; i >= 0; i--) {
      var f = g.floats[i]; f.life -= dt; f.y -= 30 * dt;
      if (f.life <= 0) g.floats.splice(i, 1);
    }
  }

  // when reward chosen and boss is queued
  var _origChoose = chooseReward;
  chooseReward = function (g, key) {
    if (g.phase !== "reward" || !g.rewardChoices || g.rewardChoices.indexOf(key) < 0) return;
    g.traits[key] = true; g.rewardChoices = null; sfx(g, "trait");
    if (g._bossNext) { g._bossNext = false; startBoss(g); }
    else startWave(g, g.wave + 1);
  };

  // ============================ RENDER ===================================
  function render(g, ctx) {
    ctx.save();
    // screen shake
    var sh = g.shake;
    if (sh > 0) ctx.translate((Math.random() * 2 - 1) * sh, (Math.random() * 2 - 1) * sh);

    // background
    drawBackground(g, ctx);

    // motes
    for (var i = 0; i < g.motes.length; i++) {
      var m = g.motes[i];
      ctx.globalAlpha = clamp(m.life, 0, 1);
      ctx.fillStyle = "#9cf";
      ctx.shadowColor = "#9cf"; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    // shockwaves
    for (var s = 0; s < g.shocks.length; s++) {
      var sk = g.shocks[s];
      ctx.globalAlpha = sk.life * (sk.fxOnly ? 0.6 : 0.5);
      ctx.strokeStyle = sk.color; ctx.lineWidth = sk.fxOnly ? 3 : 6;
      ctx.beginPath(); ctx.arc(sk.x, sk.y, sk.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // enemies
    for (var e = 0; e < g.enemies.length; e++) drawCreature(g, ctx, g.enemies[e]);

    // projectiles
    for (var pj = 0; pj < g.projectiles.length; pj++) {
      var pr = g.projectiles[pj];
      ctx.fillStyle = pr.color; ctx.shadowColor = pr.color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // particles
    for (var p2 = 0; p2 < g.particles.length; p2++) {
      var pt = g.particles[p2];
      ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // spirit (when not in a body)
    if (g.player.mode === "spirit") drawSpirit(g, ctx);

    // float text
    ctx.textAlign = "center"; ctx.font = "bold 16px sans-serif";
    for (var f = 0; f < g.floats.length; f++) {
      var fl = g.floats[f];
      ctx.globalAlpha = clamp(fl.life / fl.max, 0, 1);
      ctx.fillStyle = fl.color; ctx.fillText(fl.txt, fl.x, fl.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // flash overlay
    if (g.flash > 0) { ctx.fillStyle = "rgba(180,80,120," + (g.flash * 0.4) + ")"; ctx.fillRect(0, 0, W, H); }

    drawHUD(g, ctx);
  }

  function drawBackground(g, ctx) {
    var grd = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 620);
    grd.addColorStop(0, "#1a1226"); grd.addColorStop(1, "#0a0712");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    // subtle grid
    ctx.strokeStyle = "rgba(120,80,160,0.06)"; ctx.lineWidth = 1;
    for (var x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (var y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // vignette dots
  }

  // ---- creature art (real shapes, animated) ----
  function drawCreature(g, ctx, e) {
    if (e.dead) return;
    var T = e.T, x = e.x, y = e.y, r = e.r;
    var possessed = e.controlled;
    var alpha = e.spawnIn > 0 ? clamp(1 - e.spawnIn / 0.5, 0, 1) : 1;
    if (e.dormant) alpha *= 0.78;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);

    // possession aura
    if (possessed) {
      ctx.save();
      var pulse = 0.5 + 0.5 * Math.sin(g.time * 8);
      ctx.globalAlpha = alpha * (0.3 + 0.2 * pulse);
      ctx.fillStyle = g.player.color; ctx.shadowColor = g.player.color; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(0, 0, r + 9, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // shield bubble
    if (possessed && g.player.shield > 0) {
      ctx.globalAlpha = alpha * 0.4; ctx.strokeStyle = "#bfe6ff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r + 12, 0, TAU); ctx.stroke(); ctx.globalAlpha = alpha;
    }

    var hitTint = e.hitFlash > 0 ? "#ffffff" : null;
    var bob = Math.sin(e.walk) * 2;

    // decaying body desaturates / cracks
    var decayFrac = possessed && g.player.maxVit > 0 ? 1 - g.player.vit / g.player.maxVit : 0;
    var bodyColor = hitTint || shade(T.color, possessed ? -0.05 : 0, decayFrac);

    if (T.boss) drawMaw(g, ctx, e, bodyColor, alpha);
    else if (T.key === "husk") drawHusk(ctx, e, bodyColor, bob, T, possessed, g);
    else if (T.key === "brute") drawBrute(ctx, e, bodyColor, bob, T, possessed, g);
    else if (T.key === "dart") drawDart(ctx, e, bodyColor, bob, T, possessed, g);
    else if (T.key === "warden") drawWarden(ctx, e, bodyColor, bob, T, possessed, g);
    else if (T.key === "hexer") drawHexer(ctx, e, bodyColor, bob, T, possessed, g);
    else if (T.key === "revenant") drawRevenant(ctx, e, bodyColor, bob, T, possessed, g);

    ctx.restore();

    // health / vitality bars
    if (!e.dormant) drawEnemyBars(g, ctx, e, possessed);
    // elite "wound me" hint
    if (T.will > 0 && !possessed && !canPossess(g, e) && !T.boss) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ff8fae"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("WOUND TO STEAL", x, y - r - 16); ctx.globalAlpha = 1;
    }
  }

  function eyePair(ctx, e, T, possessed, g, ey, sz) {
    var col = possessed ? g.player.color : T.eye;
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = possessed ? 12 : 6;
    var fx = Math.cos(e.facing) * 2, fy = Math.sin(e.facing) * 2;
    ctx.beginPath(); ctx.arc(-3 + fx, ey + fy, sz, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3 + fx, ey + fy, sz, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawHusk(ctx, e, color, bob, T, poss, g) {
    // legs
    ctx.fillStyle = shade(color, -0.3, 0);
    var ls = Math.sin(e.walk) * 4;
    rrect(ctx, -8, 6, 6, 12 + ls, 3); rrect(ctx, 2, 6, 6, 12 - ls, 3);
    // arms
    rrect(ctx, -14, -4, 5, 12, 2); rrect(ctx, 9, -4, 5, 12, 2);
    // body (hunched torso)
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, bob, 13, 15, 0, 0, TAU); ctx.fill();
    // mottled belly highlight
    ctx.fillStyle = shade(color, 0.15, 0);
    ctx.beginPath(); ctx.ellipse(-2, bob + 3, 7, 9, 0, 0, TAU); ctx.fill();
    // head
    ctx.fillStyle = shade(color, 0.05, 0);
    ctx.beginPath(); ctx.arc(0, -10 + bob, 8, 0, TAU); ctx.fill();
    eyePair(ctx, e, T, poss, g, -11 + bob, 2.4);
  }

  function drawBrute(ctx, e, color, bob, T, poss, g) {
    // legs
    ctx.fillStyle = shade(color, -0.35, 0);
    rrect(ctx, -14, 12, 11, 14, 4); rrect(ctx, 3, 12, 11, 14, 4);
    // huge arms
    ctx.fillStyle = shade(color, -0.1, 0);
    ctx.beginPath(); ctx.ellipse(-24, 2, 8, 16, 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(24, 2, 8, 16, -0.2, 0, TAU); ctx.fill();
    // torso
    ctx.fillStyle = color;
    rrect(ctx, -20, -16 + bob, 40, 34, 12);
    // armored shoulders
    ctx.fillStyle = shade(color, 0.18, 0);
    ctx.beginPath(); ctx.ellipse(-16, -12 + bob, 9, 7, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(16, -12 + bob, 9, 7, 0, 0, TAU); ctx.fill();
    // small head
    ctx.fillStyle = shade(color, -0.15, 0);
    ctx.beginPath(); ctx.arc(0, -18 + bob, 8, 0, TAU); ctx.fill();
    eyePair(ctx, e, T, poss, g, -18 + bob, 2.2);
  }

  function drawDart(ctx, e, color, bob, T, poss, g) {
    ctx.rotate(e.facing);
    // fins
    ctx.fillStyle = shade(color, -0.2, 0);
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-14, -10); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-14, 10); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
    // sleek body
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 7, 0, 0, TAU); ctx.fill();
    // nose
    ctx.fillStyle = shade(color, 0.2, 0);
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(4, -5); ctx.lineTo(4, 5); ctx.closePath(); ctx.fill();
    ctx.rotate(-e.facing);
    eyePair(ctx, e, T, poss, g, -1, 2);
  }

  function drawWarden(ctx, e, color, bob, T, poss, g) {
    // squat legs
    ctx.fillStyle = shade(color, -0.3, 0);
    rrect(ctx, -12, 10, 8, 12, 3); rrect(ctx, 4, 10, 8, 12, 3);
    // shell/back
    ctx.fillStyle = shade(color, -0.12, 0);
    ctx.beginPath(); ctx.ellipse(0, -2, 20, 18, 0, 0, TAU); ctx.fill();
    // plated front
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 15, 0, 0, TAU); ctx.fill();
    // plate lines
    ctx.strokeStyle = shade(color, 0.2, 0); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.stroke();
    // head peeking
    ctx.fillStyle = shade(color, 0.05, 0);
    ctx.beginPath(); ctx.arc(0, -14, 7, 0, TAU); ctx.fill();
    eyePair(ctx, e, T, poss, g, -14, 2);
  }

  function drawHexer(ctx, e, color, bob, T, poss, g) {
    var fl = Math.sin(g.time * 4 + e.walk) * 3;
    // robe
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -16 + bob);
    ctx.quadraticCurveTo(-18, 0, -14, 18 + fl);
    ctx.quadraticCurveTo(0, 12, 14, 18 - fl);
    ctx.quadraticCurveTo(18, 0, 0, -16 + bob);
    ctx.fill();
    // hood
    ctx.fillStyle = shade(color, -0.2, 0);
    ctx.beginPath(); ctx.arc(0, -12 + bob, 9, 0, TAU); ctx.fill();
    // glowing hands
    ctx.fillStyle = poss ? g.player.color : T.eye; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(-12, 6 + fl, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(12, 6 - fl, 3, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    eyePair(ctx, e, T, poss, g, -12 + bob, 2);
  }

  function drawRevenant(ctx, e, color, bob, T, poss, g) {
    // tattered cloak with spikes
    ctx.fillStyle = shade(color, -0.2, 0);
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(i * 12, -18 + bob); ctx.lineTo(i * 12 - 6, 20); ctx.lineTo(i * 12 + 6, 20); ctx.closePath(); ctx.fill();
    }
    // body
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, bob, 16, 18, 0, 0, TAU); ctx.fill();
    // ribs
    ctx.strokeStyle = shade(color, 0.25, 0); ctx.lineWidth = 2;
    for (var r2 = -2; r2 <= 2; r2++) { ctx.beginPath(); ctx.moveTo(-10, r2 * 5 + bob); ctx.lineTo(10, r2 * 5 + bob); ctx.stroke(); }
    // horned head
    ctx.fillStyle = shade(color, 0.05, 0);
    ctx.beginPath(); ctx.arc(0, -14 + bob, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(color, -0.3, 0);
    ctx.beginPath(); ctx.moveTo(-6, -20 + bob); ctx.lineTo(-12, -30 + bob); ctx.lineTo(-3, -22 + bob); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -20 + bob); ctx.lineTo(12, -30 + bob); ctx.lineTo(3, -22 + bob); ctx.fill();
    eyePair(ctx, e, T, poss, g, -15 + bob, 2.6);
  }

  function drawMaw(g, ctx, e, color, alpha) {
    var t = g.time;
    // outer writhing body
    ctx.fillStyle = shade(color, -0.1, 0);
    ctx.beginPath();
    for (var i = 0; i <= 24; i++) {
      var a = (i / 24) * TAU;
      var rr = e.r + Math.sin(a * 5 + t * 2) * 8;
      var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    // inner maw
    ctx.fillStyle = "#1a0a14";
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.55, 0, TAU); ctx.fill();
    // teeth ring
    ctx.fillStyle = "#e9d6e6";
    for (var k = 0; k < 14; k++) {
      var aa = (k / 14) * TAU + t * 0.4;
      var tx = Math.cos(aa) * e.r * 0.55, ty = Math.sin(aa) * e.r * 0.55;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.lineTo(Math.cos(aa + 0.1) * e.r * 0.4, Math.sin(aa + 0.1) * e.r * 0.4);
      ctx.lineTo(Math.cos(aa - 0.1) * e.r * 0.4, Math.sin(aa - 0.1) * e.r * 0.4);
      ctx.fill();
    }
    // central eye
    ctx.fillStyle = e.T.eye; ctx.shadowColor = e.T.eye; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(0, 0, 12 + Math.sin(t * 3) * 2, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawEnemyBars(g, ctx, e, possessed) {
    var w = e.r * 2 + 6, x = e.x - w / 2, y = e.y - e.r - 12;
    // hp
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = possessed ? "#7CFC9A" : (e.T.boss ? "#ff5db0" : "#e06b6b");
    ctx.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    // vitality (only when possessed)
    if (possessed && g.player.maxVit > 0) {
      var vf = clamp(g.player.vit / g.player.maxVit, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x, y - 6, w, 4);
      ctx.fillStyle = vf > 0.3 ? "#ffd24a" : "#ff6a3a";
      ctx.fillRect(x, y - 6, w * vf, 4);
    }
  }

  function drawSpirit(g, ctx) {
    var p = g.player, t = g.time;
    ctx.save();
    ctx.translate(p.x, p.y);
    var vuln = p.invuln > 0 && Math.floor(t * 20) % 2 === 0;
    ctx.globalAlpha = vuln ? 0.4 : 0.92;
    // trailing tail
    ctx.fillStyle = "rgba(176,107,255,0.25)";
    for (var i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(-p.vx * 0.012 * i, -p.vy * 0.012 * i, 10 - i * 1.6, 0, TAU); ctx.fill();
    }
    // flame body
    var fl = Math.sin(t * 10) * 2;
    var grd = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    grd.addColorStop(0, "#f0e0ff"); grd.addColorStop(0.5, "#b06bff"); grd.addColorStop(1, "rgba(120,60,200,0)");
    ctx.fillStyle = grd; ctx.shadowColor = "#b06bff"; ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(0, -14 - fl);
    ctx.quadraticCurveTo(11, -2, 7, 8);
    ctx.quadraticCurveTo(0, 14, -7, 8);
    ctx.quadraticCurveTo(-11, -2, 0, -14 - fl);
    ctx.fill();
    ctx.shadowBlur = 0;
    // eyes
    ctx.fillStyle = "#fff";
    var fx = Math.cos(p._lastDir || 0) * 1.5, fy = Math.sin(p._lastDir || 0) * 1.5;
    ctx.beginPath(); ctx.arc(-3 + fx, -2 + fy, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(3 + fx, -2 + fy, 2, 0, TAU); ctx.fill();
    ctx.restore();

    // leap aim guide
    if (!p.leaping && p.leapCd <= 0) {
      var a = p._lastDir || 0, reach = 110 * leapReach(g);
      ctx.globalAlpha = 0.25; ctx.strokeStyle = "#b06bff"; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * reach, p.y + Math.sin(a) * reach); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }

  // ---- HUD ----
  function drawHUD(g, ctx) {
    var p = g.player;
    // essence bar
    ctx.fillStyle = "rgba(0,0,0,0.45)"; rrect2(ctx, 16, 16, 260, 22, 6);
    var ef = clamp(p.essence / p.maxEssence, 0, 1);
    var eg = ctx.createLinearGradient(16, 0, 276, 0);
    eg.addColorStop(0, "#7a2bd0"); eg.addColorStop(1, "#c98bff");
    ctx.fillStyle = eg; rrect2(ctx, 18, 18, 256 * ef, 18, 5);
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left";
    ctx.fillText("ESSENCE", 24, 31);

    // current body label
    ctx.textAlign = "left"; ctx.font = "13px sans-serif";
    if (p.mode === "body" && p.host) {
      ctx.fillStyle = p.host.T.color;
      ctx.fillText("HOST: " + p.host.T.name.toUpperCase(), 16, 56);
      if (p.maxVit > 0 && p.vit / p.maxVit < 0.3) {
        if (Math.floor(g.time * 4) % 2 === 0) { ctx.fillStyle = "#ff6a3a"; ctx.fillText("BODY FAILING", 16, 74); }
      }
    } else {
      ctx.fillStyle = "#b06bff"; ctx.fillText("SPIRIT — find a host!", 16, 56);
      if (p.grace > (g.traits.spectral ? 2.7 : 1.5)) {
        if (Math.floor(g.time * 5) % 2 === 0) { ctx.fillStyle = "#ff5db0"; ctx.fillText("ESSENCE BLEEDING", 16, 74); }
      }
    }

    // wave + traits top-right
    ctx.textAlign = "right"; ctx.fillStyle = "#caa6ff"; ctx.font = "bold 14px sans-serif";
    var label = g.phase === "boss" ? "BOSS" : g.phase === "tutorial" ? "TUTORIAL" : "WAVE " + g.wave + " / " + g.maxWaves;
    ctx.fillText(label, W - 16, 28);
    ctx.font = "11px sans-serif"; ctx.fillStyle = "#8a7aa8";
    var tn = Object.keys(g.traits).map(function (k) { return TRAITS[k].name; });
    for (var i = 0; i < tn.length; i++) ctx.fillText(tn[i], W - 16, 48 + i * 14);

    // boss bar
    if (g.boss && !g.boss.dead && (g.phase === "boss")) {
      var bw = 520, bx = (W - bw) / 2;
      ctx.fillStyle = "rgba(0,0,0,0.5)"; rrect2(ctx, bx, H - 38, bw, 16, 5);
      ctx.fillStyle = "#ff5db0"; rrect2(ctx, bx + 2, H - 36, (bw - 4) * clamp(g.boss.hp / g.boss.maxHp, 0, 1), 12, 4);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 12px sans-serif";
      ctx.fillText("THE MAW", W / 2, H - 26);
    }

    // tutorial prompt
    if (g.phase === "tutorial" && g.tutStep < 3) {
      var msg = TUT[g.tutStep];
      ctx.textAlign = "center"; ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "rgba(0,0,0,0.6)"; rrect2(ctx, W / 2 - 320, H - 70, 640, 40, 8);
      ctx.fillStyle = "#fff"; ctx.fillText(msg, W / 2, H - 44);
    }

    // reward screen
    if (g.phase === "reward" && g.rewardChoices) drawRewardScreen(g, ctx);

    // banner
    if (g.bannerT > 0 && g.banner) {
      ctx.globalAlpha = clamp(g.bannerT, 0, 1);
      ctx.textAlign = "center"; ctx.font = "bold 48px sans-serif";
      ctx.fillStyle = "#fff"; ctx.shadowColor = "#b06bff"; ctx.shadowBlur = 20;
      ctx.fillText(g.banner, W / 2, H / 2 - 80);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    // win / dead overlays
    if (g.phase === "win" || g.phase === "dead") {
      ctx.fillStyle = "rgba(8,5,14,0.7)"; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.fillStyle = g.phase === "win" ? "#caffd6" : "#ff8fae";
      ctx.font = "bold 56px sans-serif";
      ctx.fillText(g.phase === "win" ? "THE MAW FALLS" : "ESSENCE LOST", W / 2, H / 2 - 20);
      ctx.fillStyle = "#fff"; ctx.font = "18px sans-serif";
      ctx.fillText("Hosts worn: " + g.hops + "    Kills: " + g.kills, W / 2, H / 2 + 20);
      ctx.fillStyle = "#caa6ff"; ctx.font = "16px sans-serif";
      ctx.fillText("Press R to rise again", W / 2, H / 2 + 56);
    }
  }

  function drawRewardScreen(g, ctx) {
    ctx.fillStyle = "rgba(8,5,14,0.78)"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "bold 30px sans-serif";
    ctx.fillText("CHOOSE A TRAIT", W / 2, 120);
    ctx.font = "14px sans-serif"; ctx.fillStyle = "#8a7aa8";
    ctx.fillText("Permanent for this run — press 1, 2, or 3", W / 2, 150);
    var cw = 250, gap = 28, total = g.rewardChoices.length * cw + (g.rewardChoices.length - 1) * gap;
    var sx = (W - total) / 2;
    for (var i = 0; i < g.rewardChoices.length; i++) {
      var tr = TRAITS[g.rewardChoices[i]];
      var cx = sx + i * (cw + gap);
      ctx.fillStyle = "rgba(40,24,60,0.9)"; rrect2(ctx, cx, 200, cw, 180, 12);
      ctx.strokeStyle = "#7a2bd0"; ctx.lineWidth = 2; ctx.strokeRect(cx, 200, cw, 180);
      ctx.fillStyle = "#caa6ff"; ctx.font = "bold 40px sans-serif";
      ctx.fillText((i + 1), cx + cw / 2, 250);
      ctx.fillStyle = "#fff"; ctx.font = "bold 20px sans-serif";
      ctx.fillText(tr.name, cx + cw / 2, 290);
      ctx.fillStyle = "#cbb8e6"; ctx.font = "14px sans-serif";
      wrapText(ctx, tr.desc, cx + cw / 2, 320, cw - 30, 18);
    }
  }

  // ---- draw helpers ----
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.fill();
  }
  function rrect2(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.fill();
  }
  function wrapText(ctx, text, x, y, maxW, lh) {
    var words = text.split(" "), line = "", yy = y;
    for (var n = 0; n < words.length; n++) {
      var test = line + words[n] + " ";
      if (ctx.measureText(test).width > maxW && n > 0) { ctx.fillText(line, x, yy); line = words[n] + " "; yy += lh; }
      else line = test;
    }
    ctx.fillText(line, x, yy);
  }
  function shade(hex, amt, decay) {
    // amt -1..1 lighten/darken; decay 0..1 desaturate toward grey-purple
    var c = hexToRgb(hex);
    var r = c.r, gg = c.g, b = c.b;
    if (amt > 0) { r += (255 - r) * amt; gg += (255 - gg) * amt; b += (255 - b) * amt; }
    else { r *= (1 + amt); gg *= (1 + amt); b *= (1 + amt); }
    if (decay) { var grey = 90; r = lerp(r, grey, decay * 0.55); gg = lerp(gg, grey, decay * 0.55); b = lerp(b, grey + 20, decay * 0.55); }
    return "rgb(" + (r | 0) + "," + (gg | 0) + "," + (b | 0) + ")";
  }
  function hexToRgb(h) { h = h.replace("#", ""); return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) }; }

  // ============================ INPUT / BOOT =============================
  function handleKey(g, code, down) {
    var inp = g.input;
    if (code === "KeyW" || code === "ArrowUp") inp.up = down;
    else if (code === "KeyS" || code === "ArrowDown") inp.down = down;
    else if (code === "KeyA" || code === "ArrowLeft") inp.left = down;
    else if (code === "KeyD" || code === "ArrowRight") inp.right = down;
    else if (code === "Space") {
      if (down && !inp.leap) doLeap(g);
      inp.leap = down;
    } else if (down && (code === "Digit1" || code === "Digit2" || code === "Digit3")) {
      if (g.phase === "reward" && g.rewardChoices) {
        var idx = code === "Digit1" ? 0 : code === "Digit2" ? 1 : 2;
        if (g.rewardChoices[idx]) chooseReward(g, g.rewardChoices[idx]);
      }
    } else if (down && code === "KeyR") {
      if (g.phase === "win" || g.phase === "dead") return "restart";
    }
    return null;
  }
  function doLeap(g) {
    var p = g.player;
    var ox = p.mode === "body" && p.host ? p.host.x : p.x;
    var oy = p.mode === "body" && p.host ? p.host.y : p.y;
    var dx = p.aimx - ox, dy = p.aimy - oy;
    if (dx === 0 && dy === 0) dy = -1;
    if (p.mode === "spirit") spiritLeap(g, dx, dy);
    else {
      var wasTut = g.phase === "tutorial" && g.tutStep === 2;
      eject(g, dx, dy);
      if (wasTut) advanceTutorial(g, "ejected");
    }
  }

  function boot(canvas) {
    initAudio();
    var g = createGame({});
    startTutorial(g);
    var ctx = canvas.getContext("2d");
    var DPR = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      var rect = canvas.getBoundingClientRect();
      canvas.width = W * DPR; canvas.height = H * DPR;
    }
    resize();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    function aimFromEvent(ev) {
      var rect = canvas.getBoundingClientRect();
      g.player.aimx = clamp((ev.clientX - rect.left) / rect.width * W, 0, W);
      g.player.aimy = clamp((ev.clientY - rect.top) / rect.height * H, 0, H);
    }
    canvas.addEventListener("mousemove", aimFromEvent);
    canvas.addEventListener("mousedown", function (ev) {
      ev.preventDefault();
      if (!AUDIO) initAudio(); else if (AUDIO.state === "suspended") AUDIO.resume();
      aimFromEvent(ev);
      if (ev.button === 0) {
        if (g.phase === "reward" && g.rewardChoices) {
          // click a card
          var cw = 250, gap = 28, total = g.rewardChoices.length * cw + (g.rewardChoices.length - 1) * gap;
          var sx = (W - total) / 2;
          for (var i = 0; i < g.rewardChoices.length; i++) {
            var cx = sx + i * (cw + gap);
            if (g.player.aimx >= cx && g.player.aimx <= cx + cw && g.player.aimy >= 200 && g.player.aimy <= 380) { chooseReward(g, g.rewardChoices[i]); break; }
          }
        } else if (g.phase === "win" || g.phase === "dead") {
          restart();
        } else useAttack(g);
      }
    });
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    window.addEventListener("keydown", function (e) {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) >= 0) e.preventDefault();
      if (!AUDIO) initAudio(); else if (AUDIO.state === "suspended") AUDIO.resume();
      var res = handleKey(g, e.code, true);
      if (res === "restart") restart();
    });
    window.addEventListener("keyup", function (e) { handleKey(g, e.code, false); });

    function restart() { g = createGame({}); startTutorial(g); ROOT.__SYM_GAME = g; }
    ROOT.__SYM_GAME = g;

    var last = performance.now();
    function frame(now) {
      var dt = Math.min((now - last) / 1000, 0.05); last = now;
      update(g, dt);
      render(g, ctx);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ============================ EXPORTS ==================================
  ROOT.SYM = {
    W: W, H: H, BODIES: BODIES, BOSS: BOSS, TRAITS: TRAITS,
    createGame: createGame, update: update,
    possess: possess, eject: eject, useAttack: useAttack,
    spiritLeap: spiritLeap, doLeap: doLeap,
    canPossess: canPossess, damageEnemy: damageEnemy, damagePlayer: damagePlayer,
    startWave: startWave, startTutorial: startTutorial, startBoss: startBoss,
    offerReward: offerReward, chooseReward: function (g, k) { return chooseReward(g, k); },
    makeEnemy: makeEnemy, handleKey: handleKey, countHostiles: countHostiles,
    boot: boot, render: render
  };
})();
