'use strict';
// LAMPBLACK — the thief (DESIGN §2.2, §2.4): movement dial, THE HANDS,
// bulk/banking, tools with tier tactics, the capture ladder.
var LB = (typeof LB !== 'undefined') ? LB : (typeof module !== 'undefined' ? require('./core.js') : {});

LB.Player = function (sim, guards, bus, loadoutKey, kit) {
  var C = LB.C, M = LB.M;
  var lo = LB.LOADOUTS[loadoutKey || 'wisp'];
  var p = {
    x: sim.floor().spawn.x, y: sim.floor().spawn.y, level: 0,
    loadout: loadoutKey || 'wisp', lo: lo,
    moveMode: 'still', vx: 0, vy: 0, facingOct: 0,
    bag: [], bagSlots: lo.bag, cash: (kit && kit.cash) || 0,
    tools: (kit && kit.tools) || {}, tricks: (kit && kit.tricks) || {},
    lastTricks: lo.lastTricks, ashRefundUsed: false,
    twoHand: null, dragging: null, hidden: null, disguised: !!sim.floor().disguise,
    blatant: false, blatantT: 0, darkLantern: false,
    takedownT: 0, action: null, stepAcc: 0, scentT: 0,
    keys: {}, peeked: {}, pinched: false, fled: false,
    anim: { phase: 0, pose: 'idle', breathT: 0 }, scarf: [],
    stats: { koCount: 0, banked: 0, bankedValue: 0, bankedSlots: 0, bankedAtLockdown: false,
      usedDoor: false, quotaTime: -1, evidenceAtStart: 0, grabbedBy: null }
  };
  lo.tools.forEach(function (t) { if (!p.tools[t]) p.tools[t] = 1; });
  for (var i = 0; i < 3; i++) p.scarf.push({ x: p.x, y: p.y });
  if (p.tricks.packmule) p.bagSlots += 1;

  p.bagUsed = function () {
    var n = 0; p.bag.forEach(function (l) { n += Math.max(1, l.bulk); }); return n;
  };
  p.speed = function () {
    var base = C.SPEED[p.moveMode] || 0;
    if (p.moveMode === 'creep') base *= lo.creepMul || 1;
    if (p.moveMode === 'sprint') base *= lo.sprintMul || 1;
    base *= Math.max(0.5, 1 - C.ENCUMBER_SPEED * p.bagUsed());
    if (p.twoHand) base = Math.min(base, C.SPEED.walk * 0.8);
    if (p.disguised) base = Math.min(base, C.SPEED.walk); // walk like you're paid to be here
    return base;
  };
  p.stepNoise = function () {
    var L = { still: 0, creep: C.NOISE.creepStep, walk: C.NOISE.walkStep, sprint: C.NOISE.sprintStep }[p.moveMode] || 0;
    if (p.tricks.softstep) return L * C.MATERIAL_MUL.carpet * noiseScale();
    var mat = sim.materialAt(p.x, p.y);
    return L * (C.MATERIAL_MUL[mat] || 1) * noiseScale();
  };
  function noiseScale() {
    return (1 + C.ENCUMBER_NOISE * p.bagUsed()) * (lo.noiseMul || 1);
  }
  function blowDisguise(why) {
    if (p.disguised) { p.disguised = false; bus.emit('disguiseBlown', { why: why }); }
  }

  // ---------- movement ----------
  p.move = function (dt, ix, iy, mode) {
    if (p.hidden || p.action && p.action.locksMove) { p.moveMode = 'still'; return; }
    var mag = Math.sqrt(ix * ix + iy * iy);
    if (mag < 0.1) { p.moveMode = 'still'; p.vx = p.vy = 0; return; }
    if (mode === 'sprint' && (p.bagUsed() >= C.SPRINT_LOCK_SLOTS && !p.tricks.packmule)) mode = 'walk'; // greed has a gait
    if (mode === 'sprint') blowDisguise('sprint');
    if (mode === 'sprint') p.blatant = true, p.blatantT = 0.4;
    p.moveMode = mode;
    var sp = p.speed();
    var nx = p.x + (ix / mag) * sp * dt, ny = p.y + (iy / mag) * sp * dt;
    if (!collides(nx, p.y)) p.x = nx;
    if (!collides(p.x, ny)) p.y = ny;
    p.vx = (ix / mag) * sp; p.vy = (iy / mag) * sp;
    p.facingOct = M.octant(p.vx, p.vy);
    p.anim.phase += sp * dt * (p.moveMode === 'sprint' ? 2.6 : p.moveMode === 'creep' ? 1.4 : 2.2);
    // step noise every ~0.7 tiles
    p.stepAcc += sp * dt;
    if (p.stepAcc >= 0.7) {
      p.stepAcc = 0;
      var L = p.stepNoise();
      var onCreak = sim.creakAt(p.x, p.y);
      if (onCreak && p.moveMode !== 'creep' && !p.tricks.softstep) L = Math.max(L, C.NOISE.creak);
      var chime = sim.chimeAt(p.x, p.y);
      if (chime && p.moveMode !== 'creep' && !chime.tripped) { chime.tripped = true; L = Math.max(L, 5); bus.emit('chimeTripped', { x: p.x, y: p.y }); }
      if (L > 0) sim.emitSound(p.x, p.y, L, onCreak && p.moveMode !== 'creep' ? 'creak' : 'step', 'player');
      bus.emit('playerStep', { L: L, mat: sim.materialAt(p.x, p.y), creak: onCreak && p.moveMode !== 'creep', mode: p.moveMode });
    }
    // scent trail (§2.1.3): soot footprints only YOU (and dogs) know
    p.scentT += dt;
    if (p.scentT >= C.SCENT_DROP_S) {
      p.scentT = 0;
      var nearFire = sim.floor().furniture.some(function (f) { return f.type === 'fireplace' && M.dist(f.x + 0.5, f.y + 0.5, p.x, p.y) < 1.5; });
      if (nearFire) sim.breakScentNear(p.x, p.y, 3); else sim.dropScent(p.x, p.y);
    }
    // reveal the room you're in
    var room = sim.roomAt(p.x, p.y);
    if (room > 0) revealRoom(room);
  };
  function collides(x, y) {
    var r = 0.3;
    return sim.blocked(x - r, y - r, false, p.level) || sim.blocked(x + r, y - r, false, p.level) ||
           sim.blocked(x - r, y + r, false, p.level) || sim.blocked(x + r, y + r, false, p.level);
  }
  function revealRoom(id) {
    var f = sim.floor();
    f.revealed = f.revealed || {};
    if (!f.revealed[id]) { f.revealed[id] = true; bus.emit('roomRevealed', { roomId: id }); }
  }

  // ---------- verb discovery (with pip preview grammar §3.0.4) ----------
  function near(x, y, r) { return M.dist(p.x, p.y, x + 0.5, y + 0.5) <= (r || 1.5); }
  function toolTier(k) { return p.tools[k] || 0; }

  p.getVerbs = function () {
    var f = sim.floor(), verbs = [];
    var V = function (id, label, noise, time, evid, fn, data) {
      verbs.push({ id: id, label: label, noise: noise, time: time, evidence: evid, fn: fn, data: data });
    };
    if (p.hidden) { V('unhide', 'Slip out', 0, 0, false, function () { leaveHiding(); }); return verbs; }
    if (p.action) { V('cancel', 'Stop (' + p.action.label + ')', 0, 0, false, function () { p.action = null; }); return verbs; }

    // lights
    f.lights.forEach(function (l) {
      var reach = toolTier('snuffer') >= 2 ? 4 : 1.5;
      if (l.on && near(l.x, l.y, reach)) {
        if (l.electric) V('elec', 'Electric — cannot snuff', 0, 0, false, function () { bus.emit('electricBlocked', { light: l }); });
        else V('snuff', 'Snuff ' + l.type, 0, 0, true, function () {
          var traceless = false;
          sim.snuffLight(l, true, traceless);
          if (toolTier('snuffer') >= 3) l.gloomed = true; // Gloom Oil
          p.anim.pose = 'snuff'; p.anim.poseT = 0.4;
          bus.emit('playerSnuffed', { light: l });
        });
      }
      if (!l.on && !l.gloomed && !l.electric && near(l.x, l.y, 1.5) && toolTier('oilflask') >= 3)
        V('rig', 'Rig lamp (flare & die)', 0, 1, false, function () { l.sabotageT = 5; l.on = true; sim.rebuildLight(); });
    });
    // doors
    f.doors.forEach(function (d) {
      if (!near(d.x, d.y, 1.5)) return;
      if (d.sealed) { V('sealed', 'Sealed — LOCKDOWN', 0, 0, false, function () { }); return; }
      if (d.open) V('closedoor', 'Close door', 0, 0, false, function () { d.open = false; d.touched = true; p.stats.usedDoor = true; sim.rebuildLight(); bus.emit('doorToggled', { door: d }); });
      else if (!d.locked) {
        if (d.bell && !d.disarmed) V('disarm', 'Disarm bell (quiet hands)', 0, 2, false, function () { startAction('disarm', 'Disarming', 3, d, function () { d.disarmed = true; bus.emit('bellDisarmed', { door: d }); }); });
        V('opendoor', d.bell && !d.disarmed ? 'Open door (BELL!)' : 'Open door', d.bell && !d.disarmed ? 4 : 0, 0, false, function () {
          d.open = true; d.touched = true; p.stats.usedDoor = true; sim.rebuildLight();
          if (d.bell && !d.disarmed) { sim.emitSound(d.x + 0.5, d.y + 0.5, C.NOISE.doorForce, 'bell', 'player'); sim.addEvidence(d.x, d.y, 'forcedDoor'); }
          if (p.disguised) blowDisguise('interact');
          bus.emit('doorToggled', { door: d });
        });
      } else {
        var q = d.quality || 0, lp = toolTier('lockpicks');
        if (d.timelock) {
          var have = (p.keys[1] ? 1 : 0) + (p.keys[2] ? 1 : 0) + (p.keys[3] ? 1 : 0);
          V('vault', 'Vault: keys ' + have + '/3', 0, 1, false, function () {
            if (have >= 3) { d.locked = false; d.open = true; bus.emit('vaultOpened', { door: d }); }
            else bus.emit('vaultNeedsKeys', { have: have });
          });
        } else {
          if (lp >= 3) V('ghostkey', 'Ghost Key (traceless)', 0, 0, false, function () { d.locked = false; d.open = true; sim.rebuildLight(); bus.emit('doorToggled', { door: d, ghost: true }); });
          else if (lp >= 1 && (q < 2 || lp >= 2)) {
            V('pick', 'Pick lock', 1, 2, false, function () {
              startAction('pick', 'Picking', pickTime(q), d, function () { d.locked = false; bus.emit('lockPicked', { door: d }); }, { tickNoise: 1, needLight: q >= 1 });
            });
            V('rushpick', 'Rush pick (loud)', 3, 1, false, function () {
              startAction('pick', 'Rushing', pickTime(q) * 0.5, d, function () { d.locked = false; bus.emit('lockPicked', { door: d }); }, { tickNoise: C.NOISE.rushPick });
            });
          }
          V('force', 'Force door', 4, 0, true, function () {
            d.locked = false; d.open = true; d.forced = true; sim.rebuildLight();
            sim.emitSound(d.x + 0.5, d.y + 0.5, C.NOISE.doorForce, 'doorForce', 'player');
            sim.addEvidence(d.x, d.y, 'forcedDoor');
            bus.emit('doorForced', { door: d });
          });
        }
      }
    });
    // windows
    f.windows.forEach(function (w) {
      if (!near(w.x, w.y, 1.5)) return;
      if (w.sealed) { V('sealedw', 'Shuttered — LOCKDOWN', 0, 0, false, function () { }); return; }
      if (!w.cut) {
        if (!p.peeked[w.id]) V('peekw', 'Peek through window', 0, 0, false, function () { p.peeked[w.id] = 1; revealRoom(w.roomId); bus.emit('peeked', { window: w }); });
        if (toolTier('glasscutter') >= 1) V('cut', 'Cut glass (silent)', 1, 1, false, function () {
          startAction('cut', 'Cutting', p.tricks.secondstory ? 1 : 2, w, function () { w.cut = true; bus.emit('windowCut', { window: w }); }, { tickNoise: 1 });
        });
        V('smash', 'Smash window', 4, 0, true, function () {
          w.cut = true; w.smashed = true;
          sim.emitSound(w.x + 0.5, w.y + 0.5, C.NOISE.glassSmash, 'glassSmash', 'player');
          sim.addEvidence(w.x, w.y, 'smashedWindow');
          sim.floor().material[w.y][w.x] = 'glass';
          bus.emit('windowSmashed', { window: w });
        });
        if (toolTier('glasscutter') >= 2 && w.cut !== true) V('circle', 'Circle cut (reach through)', 1, 1, false, function () {
          var f2 = sim.floor();
          var got = f2.loot.find(function (l) { return !l.taken && M.dist(l.x, l.y, w.x, w.y) < 2.5; });
          if (got) takeLoot(got); else bus.emit('nothingInReach', {});
        });
      } else {
        V('climb', 'Climb through', 1, 1, false, function () { climbWindow(w); });
        if (toolTier('grapple') >= 1 && p.bag.length) V('rappel', 'Rappel bag to cart', 1, 1, false, function () { bankBag('rappel'); });
        if (toolTier('grapple') >= 3) V('zipline', 'The Long Line (zip)', 1, 1, false, function () {
          var other = f.windows.filter(function (o) { return o.cut && o !== w && M.dist(o.x, o.y, w.x, w.y) > 4; })[0];
          if (other) { p.x = other.x + (other.x <= f.building.x ? 1.5 : other.x >= f.building.x + f.building.w - 1 ? -0.5 : 0.5); p.y = other.y + 1; bus.emit('ziplined', {}); }
        });
      }
    });
    // closed-door peek (keyhole)
    f.doors.forEach(function (d) {
      if (!d.open && near(d.x, d.y, 1.2) && !d.exit) {
        var other = sim.roomAt(p.x, p.y) === d.roomA ? d.roomB : d.roomA;
        if (other > 0 && !(f.revealed && f.revealed[other]))
          V('peek', 'Peek (keyhole)', 0, 0, false, function () { revealRoom(other); bus.emit('peeked', { door: d }); });
      }
    });
    // furniture: safes, desks, hide spots, mirrors, dumbwaiters
    f.furniture.forEach(function (fu) {
      if (!near(fu.x, fu.y, 1.5)) return;
      if (fu.type === 'safe' && fu.locked) {
        V('dial', 'Crack the dial (needs light)', 1, 3, false, function () { startSafeDial(fu); });
        V('drillsafe', 'Drill (fast, LOUD)', 4, 2, true, function () {
          startAction('drill', 'Drilling', 4, fu, function () { openSafe(fu); }, { tickNoise: C.NOISE.safeDrill, sustained: true });
        });
      }
      if (fu.type === 'desk' && fu.locked !== undefined && !fu.opened) {
        V('desk', fu.locked ? 'Pick the desk lock' : 'Open desk', 1, 1, false, function () {
          startAction('pick', 'Picking', pickTime(fu.quality), fu, function () { fu.opened = true; fu.locked = false; bus.emit('deskOpened', { furn: fu }); }, { tickNoise: 1, needLight: true });
        });
      }
      if (fu.hideSpot && !p.twoHand) {
        if (p.dragging) V('stash', 'Stash the body', 1, 1, false, function () {
          if (guards.hideBody(p.dragging, fu)) { p.dragging = null; }
        });
        else if (!fu.body) V('hide', 'Hide (' + fu.type + ')', 0, 0, false, function () { enterHiding(fu); });
      }
      if (fu.type === 'mirror' && toolTier('glasscutter') >= 3) {
        V('takemirror', 'Steal the mirror', 1, 1, false, function () {
          f.mirrors = f.mirrors.filter(function (m2) { return m2 !== fu; });
          f.furniture = f.furniture.filter(function (m2) { return m2 !== fu; });
          f.solid[fu.y][fu.x] = 0; p.carriedMirror = fu;
          bus.emit('mirrorTaken', {});
        });
      }
      if (fu.type === 'dumbwaiter' && p.bag.length) {
        V('dumb', 'Send bag down (slow, L3)', 2, 3, false, function () {
          fu.queue = fu.queue.concat(p.bag.splice(0, p.bag.length));
          fu.sendT = 0;
          sim.emitSound(fu.x + 0.5, fu.y + 0.5, C.NOISE.dumbwaiter, 'dumbwaiter', 'player');
          bus.emit('dumbwaiterUsed', { furn: fu, count: fu.queue.length });
        });
      }
    });
    if (p.carriedMirror) {
      V('placemirror', 'Place mirror here', 1, 1, false, function () {
        var mx = Math.floor(p.x), my = Math.floor(p.y);
        var m2 = LB.genHelpers.addFurn(f, mx, my, 'mirror', { facing: p.facingOct % 4 });
        p.carriedMirror = null; bus.emit('mirrorPlaced', { furn: m2 });
      });
    }
    // gas valves
    f.valves.forEach(function (v) {
      if (!v.used && near(v.x, v.y, 1.5)) V('valve', 'Turn the gas valve (hiss)', 3, 1, false, function () { sim.gasValveOff(v); });
    });
    // loot
    f.loot.forEach(function (l) {
      if (l.taken || !near(l.x, l.y, 1.5)) return;
      if (l.inDesk) {
        var desk = f.furniture.find(function (fu) { return fu.type === 'desk' && fu.x === l.x && fu.y === l.y; });
        if (desk && !desk.opened) return;
      }
      if (l.vaulted) { /* reachable only once the vault door is open — same room check */ }
      var lbl = l.tag === 'famous' ? 'Take ' + l.name + ' (FAMOUS)' : 'Take ' + l.name + (l.tag === 'attended' ? ' (warm)' : '');
      V('take', lbl, l.twoHand ? 1 : 0, 0, l.tag !== 'quiet', function () { takeLoot(l); });
    });
    // bodies: drag
    guards.list.forEach(function (g) {
      if (g.ko && !g.hiddenIn && near(g.x - 0.5, g.y - 0.5, 1.5) && !p.twoHand) {
        if (p.dragging === g) V('drop', 'Drop the body', 1, 0, false, function () { p.dragging = null; });
        else V('drag', 'Drag the body', 1, 0, false, function () { p.dragging = g; });
      }
    });
    // guards: blackjack / pickpocket
    guards.list.forEach(function (g) {
      if (g.ko || g.def.civilian && !g.hasScore) { if (g.ko) return; }
      var d = M.dist(p.x, p.y, g.x, g.y);
      if (d > 1.6) return;
      if (!g.ko && !g.def.civilian && toolTier('blackjack') >= 1 && !p.twoHand) {
        var t3 = toolTier('blackjack') >= 3;
        V('ko', g.def.noKO ? 'Blackjack — he would not fall' : 'Blackjack (from behind)', t3 ? 0 : toolTier('blackjack') >= 2 ? 1 : 3, 0, true, function () {
          p.takedownT = 0.35; p.anim.pose = 'swing';
          if (p.disguised) blowDisguise('interact');
          var ok = guards.tryKO(p, g, { frontal: lo.frontalKO || t3, silent: t3 });
          if (ok) {
            var L2 = t3 ? 0 : toolTier('blackjack') >= 2 ? 1 : C.NOISE.blackjack;
            if (lo.frontalKO && !t3) L2 = C.NOISE.scuffle;
            if (L2 > 0) sim.emitSound(g.x, g.y, L2, 'blackjack', 'player');
          }
        });
      }
      if (g.keyholder && !g.ko && !p.keys[g.keyholder]) {
        V('pickpocket', 'Pickpocket key ' + g.keyholder, 0, 3, false, function () {
          startAction('pickpocket', 'Lifting key', 3, g, function () { p.keys[g.keyholder] = true; bus.emit('keyLifted', { k: g.keyholder }); }, { breakOnTurn: true });
        });
      }
      if (g.hasScore && !g.ko) {
        V('lift', 'Lift the prize from him', 0, 3, false, function () {
          startAction('pickpocket', 'Lifting', 3.5, g, function () { takeLoot(g.hasScore); g.hasScore = null; }, { breakOnTurn: true });
        });
      }
    });
    // stairs
    f.stairs.forEach(function (s) {
      if (near(s.x, s.y, 1.2)) V('stairs', s.to > p.level ? 'Up the stairs' : 'Down the stairs', 1, 1, false, function () {
        p.level = s.to; sim.level = s.to;
        var back = sim.floor().stairs.find(function (o) { return o.to !== s.to || true; });
        var landing = sim.floor().stairs.find(function (o) { return o.x === s.x && o.y === s.y; }) || sim.floor().stairs[0];
        p.x = landing.x + 0.5; p.y = landing.y + 1.2;
        bus.emit('levelChanged', { level: p.level });
      });
    });
    // throwables
    if (toolTier('coins') >= 1) V('coins', toolTier('coins') >= 3 ? 'Loose the songbird' : toolTier('coins') >= 2 ? 'Toss chime coin' : 'Toss coins', 2, 0, false, function (aim) { throwCoins(aim); });
    if (toolTier('smoke') >= 1) V('smoke', LB.TOOLS.smoke.tiers[toolTier('smoke') - 1], 1, 0, false, function (aim) { throwSmoke(aim); });
    if (toolTier('oilflask') >= 1) V('oil', toolTier('oilflask') >= 2 ? 'Scent oil' : 'Oil the floor', 1, 0, false, function (aim) { throwOil(aim); });
    // cart banking
    var cart = f.cart;
    if (cart && M.dist(p.x, p.y, cart.x, cart.y) < 2 && (p.bag.length || p.twoHand))
      V('bank', 'Stash at the cart', 0, 0, false, function () { bankBag('cart'); });
    // dark lantern
    V('lantern', p.darkLantern ? 'Shutter the lantern' : 'Open dark lantern (you will GLOW)', 0, 0, false, function () {
      p.darkLantern = !p.darkLantern; bus.emit('darkLantern', { open: p.darkLantern });
    });
    return verbs;
  };

  function pickTime(quality) {
    var t = 2 + quality * 2;
    if (p.tricks.greedy) t *= 0.75;
    if (lo.pickMul) t /= lo.pickMul;
    return t;
  }

  // ---------- actions (hold-to-fill with audible ticks) ----------
  function startAction(kind, label, dur, target, done, opts) {
    opts = opts || {};
    if (opts.needLight && sim.lightAt(p.x, p.y) < C.FINE_WORK_L && !p.darkLantern) {
      bus.emit('tooDark', { kind: kind }); return;
    }
    if (p.disguised) blowDisguise('interact');
    p.action = { kind: kind, label: label, t: 0, dur: dur, target: target, done: done,
      tickNoise: opts.tickNoise || 0, tickT: 0, breakOnTurn: !!opts.breakOnTurn, sustained: !!opts.sustained, locksMove: true };
    p.anim.pose = 'kneel';
  }
  function startSafeDial(safe) {
    if (sim.lightAt(p.x, p.y) < C.FINE_WORK_L && !p.darkLantern) { bus.emit('tooDark', { kind: 'dial' }); return; }
    if (p.disguised) blowDisguise('interact');
    var stops = [], rng = LB.RNG(safe.x * 977 + safe.y * 31);
    for (var i = 0; i < 3; i++) stops.push(0.15 + rng() * 0.7);
    p.action = { kind: 'dial', label: 'Cracking', target: safe, locksMove: true,
      dial: { angle: 0, dir: 1, stops: stops, notch: 0, showFirst: !!p.tricks.locksear, zone: 0.06 }, tickT: 0, tickNoise: 1 };
    p.anim.pose = 'kneel';
    bus.emit('dialStarted', { safe: safe });
  }
  function openSafe(safe) {
    safe.locked = false; safe.opened = true;
    if (safe.keyCopy) { p.keys[safe.keyCopy] = true; bus.emit('keyLifted', { k: safe.keyCopy, fromSafe: true }); }
    var f = sim.floor();
    var inSafe = f.loot.find(function (l) { return !l.taken && Math.abs(l.x - safe.x) <= 1 && Math.abs(l.y - safe.y) <= 1; });
    bus.emit('safeOpened', { safe: safe });
  }
  // dial input: called by main on interact press/release while action.kind === 'dial'
  p.dialRelease = function () {
    var a = p.action;
    if (!a || a.kind !== 'dial') return;
    var d = a.dial, stop = d.stops[d.notch];
    if (Math.abs(d.angle - stop) < d.zone * (lo.pickMul ? 1.4 : 1)) {
      d.notch++;
      bus.emit('dialNotch', { notch: d.notch });
      if (d.notch >= d.stops.length) { openSafe(a.target); p.action = null; }
    } else {
      sim.emitSound(p.x, p.y, 1, 'dialMiss', 'player');
      bus.emit('dialMiss', {});
    }
  };

  function takeLoot(l) {
    if (l.twoHand) {
      if (p.twoHand) { bus.emit('handsFull', {}); return; }
      if (p.bag.length && p.bagUsed() + l.bulk > p.bagSlots) { bus.emit('bagFull', {}); return; }
      p.twoHand = l; l.taken = true; l.takenBy = 'player';
      bus.emit('lootTaken', { loot: l, twoHand: true });
    } else {
      if (p.bagUsed() + Math.max(1, l.bulk) > p.bagSlots) { bus.emit('bagFull', {}); return; }
      l.taken = true; l.takenBy = 'player';
      p.bag.push(l);
      bus.emit('lootTaken', { loot: l });
    }
    if (l.tag === 'famous') {
      bus.emit('scoreMarked', { loot: l });
      // its absence will be noticed: plant the evidence site at the pedestal
      sim.addEvidence(l.x, l.y, 'scoreMissing', { loot: l });
    }
    if (l.tag === 'attended') bus.emit('warmLootTaken', { loot: l });
    if (p.disguised) blowDisguise('interact');
  }

  function bankBag(how) {
    var f = sim.floor(), cart = f.cart;
    var moved = 0, val = 0;
    p.bag.forEach(function (l) { cart.banked.push(l); val += l.value; moved += Math.max(1, l.bulk); });
    p.bag = [];
    if (p.twoHand && how === 'cart') { cart.banked.push(p.twoHand); val += p.twoHand.value; moved += p.twoHand.bulk; p.twoHand = null; }
    if (!moved) return;
    cart.value += val;
    p.stats.banked += 1; p.stats.bankedValue += val; p.stats.bankedSlots = Math.max(p.stats.bankedSlots, moved);
    if (sim.stage >= 3) p.stats.bankedAtLockdown = true;
    var quotaBanked = cart.banked.some(function (l) { return l.quota; });
    if (quotaBanked && p.stats.quotaTime < 0) p.stats.quotaTime = sim.time;
    bus.emit('banked', { value: val, how: how, quota: quotaBanked });
  }

  function climbWindow(w) {
    var f = sim.floor();
    var inside = f.roomId[w.y] && sim.roomAt(p.x, p.y) !== 0;
    var dx = w.x <= f.building.x ? (inside ? -1.2 : 1.2) : w.x >= f.building.x + f.building.w - 1 ? (inside ? 1.2 : -1.2) : 0;
    var dy = w.y <= f.building.y ? (inside ? -1.2 : 1.2) : w.y >= f.building.y + f.building.h - 1 ? (inside ? 1.2 : -1.2) : 0;
    p.x = w.x + 0.5 + dx; p.y = w.y + 0.5 + dy;
    p.stats.enteredByWindow = true;
    sim.emitSound(w.x, w.y, 1, 'climb', 'player');
    revealRoom(w.roomId);
    bus.emit('windowClimbed', { window: w, inside: !inside });
  }

  function enterHiding(spot) {
    p.hidden = spot; spot.occupiedBy = 'player';
    p.moveMode = 'still'; p.anim.pose = 'hide';
    bus.emit('playerHid', { spot: spot });
  }
  function leaveHiding() {
    if (p.hidden) { p.hidden.occupiedBy = null; p.hidden = null; bus.emit('playerUnhid', {}); }
  }

  // ---------- throws (landing ring previews rendered from these ranges) ----------
  p.throwRange = 4;
  function throwTarget(aim) {
    var ang = aim !== undefined ? aim : (p.facingOct * Math.PI / 4);
    var tx = p.x + Math.cos(ang) * p.throwRange, ty = p.y + Math.sin(ang) * p.throwRange;
    // walls stop the throw
    for (var t = p.throwRange; t > 0.5; t -= 0.5) {
      var x = p.x + Math.cos(ang) * t, y = p.y + Math.sin(ang) * t;
      if (!sim.blocked(x, y, false, p.level)) return { x: x, y: y };
    }
    return { x: p.x, y: p.y };
  }
  function throwCoins(aim) {
    var t = throwTarget(aim), tier = toolTier('coins');
    if (tier >= 3) { sim.addSongbird(t.x, t.y, Math.sign(t.x - p.x) || 1, 0); }
    else {
      sim.emitSound(t.x, t.y, C.NOISE.coinLure, 'coinLure', 'lure');
      if (tier >= 2) { p.chimeQueue = p.chimeQueue || []; p.chimeQueue.push({ x: t.x, y: t.y, n: 2, t: 1.5 }); }
    }
    bus.emit('lureThrown', { x: t.x, y: t.y, tier: tier });
  }
  function throwSmoke(aim) {
    var t = throwTarget(aim), tier = toolTier('smoke');
    sim.addSmoke(t.x, t.y, 2.5, 6, tier >= 2);
    if (tier >= 3) {
      guards.list.forEach(function (g) { if (!g.ko && g.level === p.level && M.dist(g.x, g.y, t.x, t.y) < 2.5) g.blindT = 4; });
      if (!p.ashRefundUsed && p.lastTricks < lo.lastTricks + 1) { p.ashRefundUsed = true; p.lastTricks++; bus.emit('trickRefunded', {}); }
    }
    bus.emit('smokeThrown', { x: t.x, y: t.y, tier: tier });
  }
  function throwOil(aim) {
    var t = throwTarget(aim), tier = toolTier('oilflask');
    if (tier >= 2) sim.breakScentNear(t.x, t.y, 3);
    else sim.addOil(t.x, t.y);
    bus.emit('oilThrown', { x: t.x, y: t.y, tier: tier });
  }

  // ---------- capture ladder (§2.3) ----------
  bus.on('grabbed', function (ev) {
    if (p.pinched || p.lastTrickFiring) return;
    var g = ev.guard;
    p.stats.grabbedBy = g.type;
    if (p.lastTricks > 0) {
      // 1) Last Trick auto-burns: soot-burst, blinded guard, dropped 3 tiles away
      p.lastTricks--;
      p.lastTrickFiring = true;
      g.blindT = 3; g.aware = 60; g.grabT = 0; g.state = 'search'; g.searchQueue = []; g.lastSeen = { x: p.x, y: p.y };
      var esc = findEscapeTile(g);
      p.x = esc.x; p.y = esc.y;
      sim.alert = Math.min(100, sim.alert + 10);
      sim.stamps.push({ t: sim.time, kind: 'lastTrick', amt: 10, label: 'a soot-cloud, a vanishing' });
      bus.emit('lastTrickBurned', { guard: g });
      p.lastTrickFiring = false;
    } else if (!g.def.noBribe && !p.bribeUsedThisRun && p.runRef && !p.runRef.bribeUsed) {
      bus.emit('bribeOffer', { guard: g }); // main.js opens the Crooked Watchman screen
    } else {
      p.pinched = true;
      bus.emit('pinched', { guard: g });
    }
  });
  function findEscapeTile(g) {
    var f = sim.floor();
    var ang = M.angTo(g.x, g.y, p.x, p.y);
    for (var a = 0; a < 8; a++) {
      var try_ = ang + a * Math.PI / 4;
      var x = p.x + Math.cos(try_) * 3, y = p.y + Math.sin(try_) * 3;
      if (x > 0 && y > 0 && x < f.w && y < f.h && !sim.blocked(x, y, false, p.level)) return { x: x, y: y };
    }
    return { x: p.x, y: p.y };
  }

  // ---------- per-frame ----------
  p.update = function (dt) {
    if (p.takedownT > 0) p.takedownT -= dt;
    if (p.blatantT > 0) { p.blatantT -= dt; if (p.blatantT <= 0) p.blatant = false; }
    if (p.anim.poseT > 0) { p.anim.poseT -= dt; if (p.anim.poseT <= 0) p.anim.pose = 'idle'; }
    // dark lantern glow (you are a beacon)
    sim.dynamicLights = sim.dynamicLights.filter(function (l) { return !l.player; });
    if (p.darkLantern) sim.dynamicLights.push({ x: p.x, y: p.y, r: C.DARKLANTERN_R, level: p.level, player: true });
    // dragging body: follows, L2 per step
    if (p.dragging) {
      var g = p.dragging;
      g.x = M.lerp(g.x, p.x - Math.cos(p.facingOct * Math.PI / 4), 0.1);
      g.y = M.lerp(g.y, p.y - Math.sin(p.facingOct * Math.PI / 4), 0.1);
      if (g.bodyEvidence) { g.bodyEvidence.x = Math.floor(g.x); g.bodyEvidence.y = Math.floor(g.y); }
      p.dragT = (p.dragT || 0) + dt;
      if (p.dragT > 1 && p.moveMode !== 'still') { p.dragT = 0; sim.emitSound(p.x, p.y, C.NOISE.bodyDrag, 'bodyDrag', 'player'); }
    }
    // chime coins repeat
    if (p.chimeQueue) for (var i = p.chimeQueue.length - 1; i >= 0; i--) {
      var cqi = p.chimeQueue[i];
      cqi.t -= dt;
      if (cqi.t <= 0) { sim.emitSound(cqi.x, cqi.y, C.NOISE.coinLure, 'coinLure', 'lure'); cqi.n--; cqi.t = 1.5; if (cqi.n <= 0) p.chimeQueue.splice(i, 1); }
    }
    // sabotaged lamps flare and die
    sim.floor().lights.forEach(function (l) {
      if (l.sabotageT !== undefined && l.sabotageT > 0) {
        l.sabotageT -= dt;
        if (l.sabotageT <= 0) { l.on = false; l.sabotaged = true; sim.rebuildLight(); bus.emit('lampSabotaged', { light: l }); }
      }
    });
    // dumbwaiter transfers
    sim.floor().furniture.forEach(function (fu) {
      if (fu.type === 'dumbwaiter' && fu.queue && fu.queue.length) {
        fu.sendT = (fu.sendT || 0) + dt;
        if (fu.sendT >= C.DUMBWAITER_SLOT_S) {
          fu.sendT = 0;
          var l = fu.queue.shift();
          var cart = sim.floors[0].cart;
          cart.banked.push(l); cart.value += l.value;
          if (l.quota && p.stats.quotaTime < 0) p.stats.quotaTime = sim.time;
          bus.emit('banked', { value: l.value, how: 'dumbwaiter', quota: l.quota });
        }
      }
    });
    // ongoing hold-actions
    if (p.action && p.action.kind !== 'dial') {
      var a = p.action;
      a.t += dt;
      a.tickT += dt;
      if (a.tickNoise && a.tickT > (a.sustained ? 0.5 : 1)) {
        a.tickT = 0;
        sim.emitSound(p.x, p.y, a.tickNoise, a.kind + 'Tick', 'player');
        if (lo.silentPicks && a.kind === 'pick') { /* Cracksman: ticks stay inaudible to guards */ sim.sounds.pop(); }
      }
      if (a.breakOnTurn && a.target && a.target.headTurnDur > 0) {
        p.action = null; bus.emit('pickpocketBroken', {});
      } else if (a.t >= a.dur) { p.action = null; a.done(); }
    }
    if (p.action && p.action.kind === 'dial') {
      var d = p.action.dial;
      d.angle += d.dir * dt * 0.35;
      if (d.angle > 1) { d.angle = 1; d.dir = -1; }
      if (d.angle < 0) { d.angle = 0; d.dir = 1; }
      p.action.tickT += dt;
      if (p.action.tickT > 0.25) {
        p.action.tickT = 0;
        var nearStop = Math.abs(d.angle - d.stops[d.notch]) < d.zone * 2;
        if (!lo.silentPicks) sim.emitSound(p.x, p.y, 1, nearStop ? 'dialStop' : 'dialTick', 'player');
        bus.emit(nearStop ? 'dialNearStop' : 'dialTick', { angle: d.angle });
      }
    }
    // scarf verlet (3 nodes, §4.3)
    var head = { x: p.x, y: p.y };
    for (var s = 0; s < p.scarf.length; s++) {
      var n = p.scarf[s], target = s === 0 ? head : p.scarf[s - 1];
      n.x = M.lerp(n.x, target.x - p.vx * 0.06 * (s + 1), 0.25);
      n.y = M.lerp(n.y, target.y - p.vy * 0.06 * (s + 1), 0.25);
    }
    if (p.anim.pose === 'idle') { p.anim.breathT += dt; }
  };

  return p;
};

if (typeof module !== 'undefined') module.exports = LB;
