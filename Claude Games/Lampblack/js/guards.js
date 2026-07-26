'use strict';
// LAMPBLACK — guard AI (DESIGN §2.1.2, §2.3, §2.8): graduated sight, sticky
// suspicion, ghost search, ten behavior kits, Old Copper's evidence chain,
// and LB.ProbeBrain — the probe bot that is ALSO The Other Shadow (§2.8 #11).
var LB = (typeof LB !== 'undefined') ? LB : (typeof module !== 'undefined' ? require('./core.js') : {});

LB.Guards = function (sim, bus) {
  var C = LB.C, M = LB.M;
  var mgr = { list: [], ghost: null, rival: null, anyPastSuspicious: false, koCount: 0 };

  function spawnFromSpec(gs, level) {
    if (gs.spawnLater && !gs.atStart) return null;
    return mgr.add(gs.type, gs.x, gs.y, level, gs);
  }

  mgr.add = function (type, x, y, level, spec) {
    var G = LB.GUARDS[type === 'handler' ? 'hound' : type] || LB.GUARDS.watchman;
    var g = {
      id: mgr.list.length, type: type, def: G, x: x, y: y, level: level || 0,
      facing: (spec && spec.post) ? spec.post.facing : 0,
      state: (spec && spec.post) ? ((LB.GUARDS[type] || {}).dozes ? 'doze' : 'post') : 'patrol',
      aware: 0, stickyFloor: 0, unseenT: 0, lastSeen: null, ghost: null,
      patrol: (spec && spec.patrol) || null, wpIdx: 0, post: (spec && spec.post) || null,
      path: null, pathIdx: 0, windupT: 0, searchQueue: [], searchT: 0, grabT: 0,
      headTurnT: 3 + Math.random() * 4, headTurn: 0, keyholder: (spec && spec.keyholder) || 0,
      lead: spec ? spec.lead : undefined, patrolId: spec ? spec.patrolId : -1,
      wanderAll: (spec && spec.wanderAll) || null, wanderRoom: (spec && spec.wander) || 0,
      ko: false, koBody: null, taskLight: null, lastLureCls: null, lastLureT: -999,
      evidenceQueue: [], evIdx: 0, shutterT: 0, shutterOpen: true, slipT: 0, blindT: 0,
      anim: { phase: 0, frame: 0, pose: 'walk' }, vx: 0, vy: 0, walkPhase: Math.random() * 6
    };
    mgr.list.push(g);
    bus.emit('guardSpawn', g);
    return g;
  };

  // spawn initial roster for every floor
  sim.floors.forEach(function (f, li) { f.guards.forEach(function (gs) { spawnFromSpec(gs, li); }); });

  bus.on('spawnResponse', function () {
    if (sim.responseSpawned >= 2) return;
    sim.responseSpawned++;
    var f = sim.floor(), e = f.exits[0];
    if (!e) return;
    var type = (sim.spec.act || 1) >= 2 ? 'sergeant' : 'watchman';
    var g = mgr.add(type, e.x + 0.5, e.y - 0.5, sim.level);
    g.state = 'investigate';
    var obj = f.rooms[f.objectiveRoomId - 1];
    g.lastSeen = { x: obj ? obj.cx : e.x, y: obj ? obj.cy : e.y };
    bus.emit('responseEntered', g);
  });
  bus.on('spawnCopper', function () {
    var f = sim.floor(), e = f.exits[0];
    mgr.add('oldcopper', e ? e.x + 0.5 : f.spawn.x, e ? e.y - 0.5 : f.spawn.y, sim.level);
  });

  // ---------- hearing (bus-driven; the L guards receive = the L the player hears) ----------
  bus.on('sound', function (ev) {
    mgr.list.forEach(function (g) {
      if (g.ko || g.level !== ev.level || g.def.civilian) return;
      if (ev.src === 'guard') return; // guards don't chase each other's boots
      var hearMul = g.def.hearMul * (g.state === 'doze' ? 0.5 : 1);
      var recv = ev.prop.at(g.x, g.y) * hearMul;
      var T = C.HEAR_THRESH;
      if (recv < T) return;
      if (g.state === 'doze') { g.state = 'post'; bus.emit('sentryWake', g); }
      var loudClass = ['scream', 'shout', 'whistleBlast'].indexOf(ev.cls) >= 0;
      if (ev.src === 'lure') { // habituation (§2.1.3): same trick twice = games
        if (g.lastLureCls === ev.cls && sim.time - g.lastLureT < C.LURE_HABIT_WINDOW) {
          if (!ev._habitFed) { ev._habitFed = true; sim.feedAlert('lureHabit', ev); bus.emit('lureHabituated', { guard: g, ev: ev }); }
          g.lastLureT = sim.time;
          return;
        }
        g.lastLureCls = ev.cls; g.lastLureT = sim.time;
      }
      if (recv >= 4 * T || loudClass) {
        if (!ev._fedAlert && ev.src !== 'guard') { ev._fedAlert = true; if (!loudClass) sim.feedAlert('loudNoise', ev); }
        if (g.state !== 'chase') { g.state = 'investigate'; g.windupT = 0.4; g.lastSeen = { x: ev.x, y: ev.y }; g.path = null; }
      } else if (recv >= 2 * T) {
        if (g.state === 'patrol' || g.state === 'post' || g.state === 'glance' || g.state === 'return') {
          g.state = 'investigate'; g.windupT = 0.4; g.lastSeen = { x: ev.x, y: ev.y }; g.path = null;
          bus.emit('guardInvestigates', { guard: g, ev: ev });
        }
      } else {
        if (g.state === 'patrol' || g.state === 'post' || g.state === 'return') {
          g.state = 'glance'; g.windupT = 1.2;
          g.glanceDir = M.angTo(g.x, g.y, ev.x, ev.y);
        }
      }
    });
  });

  // ---------- sight ----------
  function smokeBlocks(g, px, py) {
    for (var i = 0; i < sim.smokes.length; i++) {
      var s = sim.smokes[i];
      if (s.level !== g.level) continue;
      // distance from smoke center to the sight segment
      var dx = px - g.x, dy = py - g.y, len2 = dx * dx + dy * dy;
      var t = len2 ? M.clamp(((s.x - g.x) * dx + (s.y - g.y) * dy) / len2, 0, 1) : 0;
      if (M.dist(g.x + dx * t, g.y + dy * t, s.x, s.y) < s.r) return true;
    }
    return false;
  }

  function coneRange(g, targetLight) {
    if (g.def.dog || g.type === 'handler') return 3.5; // dogs: nose beats eyes; light-immune
    if (g.def.civilian) return C.CIV_CONE_R;
    var R = M.lerp(C.SIGHT_R_DARK, C.SIGHT_R_LIT, M.clamp(targetLight, 0, 1));
    R *= (g.def.coneMul || 1);
    return Math.max(1, R + sim.coneDelta);
  }

  // Can guard g see point (px,py) given target light? Returns visibility factor 0/1.
  mgr.canSee = function (g, px, py, opts) {
    opts = opts || {};
    if (g.ko || g.blindT > 0 || g.level !== (opts.level === undefined ? sim.level : opts.level)) return false;
    if (g.type === 'oldcopper' && !g.shutterOpen) return false;
    var L = sim.lightAt(px, py, g.level);
    if (g.def.litOnly && L < C.MARKSMAN_MIN_L) return false;
    var R = coneRange(g, L);
    var d = M.dist(g.x, g.y, px, py);
    if (d > R) return false;
    var ang = M.angTo(g.x, g.y, px, py);
    var half = C.CONE_HALF_DEG * Math.PI / 180;
    if (Math.abs(M.angDiff(g.facing + g.headTurn, ang)) > half && d > 0.8) return false;
    if (!sim.los(g.x, g.y, px, py, g.level)) return false;
    if (smokeBlocks(g, px, py)) return false;
    return true;
  };

  // mirror bounce (§2.8 hazards): virtual eye at the mirror, reflected direction
  mgr.mirrorSees = function (g, px, py) {
    var f = sim.floors[g.level];
    for (var i = 0; i < f.mirrors.length; i++) {
      var mi = f.mirrors[i];
      var mx = mi.x + 0.5, my = mi.y + 0.5;
      var dM = M.dist(g.x, g.y, mx, my);
      var L = sim.lightAt(px, py, g.level);
      var R = coneRange(g, L);
      if (dM > R) continue;
      if (!mgr.canSee(g, mx, my, {})) continue;
      var normals = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // facing 0..3 = mounted N/E/S/W wall
      var n = normals[mi.facing % 4];
      var ix = (mx - g.x) / (dM || 1), iy = (my - g.y) / (dM || 1);
      var dot = ix * n[0] + iy * n[1];
      var rx = ix - 2 * dot * n[0], ry = iy - 2 * dot * n[1];
      var rem = R - dM;
      var dP = M.dist(mx, my, px, py);
      if (dP > rem) continue;
      var ang = M.angTo(mx, my, px, py);
      if (Math.abs(M.angDiff(Math.atan2(ry, rx), ang)) > 0.45) continue;
      if (!sim.los(mx, my, px, py, g.level)) continue;
      return { mirror: mi, from: { x: mx, y: my } };
    }
    return null;
  };

  // ---------- movement ----------
  function repath(g, tx, ty) {
    var f = sim.floors[g.level];
    g.path = LB.astar(f.w, f.h, function (x, y) {
      if (f.solid[y][x] === 1) { return !f.windowAt[x + ',' + y] || true; } // guards don't climb windows
      if (f.solid[y][x] === 2) return true;
      var d = sim.doorAt(x, y, g.level);
      if (d && !d.open && d.timelock) return true;
      return false;
    }, g.x, g.y, tx, ty);
    g.pathIdx = 0;
    return !!g.path;
  }

  function follow(g, dt, speed) {
    if (!g.path || g.pathIdx >= g.path.length) return true;
    var wp = g.path[g.pathIdx];
    var d = M.dist(g.x, g.y, wp.x, wp.y);
    if (d < 0.15) { g.pathIdx++; return g.pathIdx >= g.path.length; }
    // doors: open what stands in the way (except vault timelock)
    var door = sim.doorAt(wp.x, wp.y, g.level);
    if (door && !door.open && d < 1.2) {
      if (door.timelock) { g.path = null; return true; }
      door.open = true;
      if (door.touched && !door.suspicionGiven && !door.routeOpen) { /* guard closed it himself earlier */ }
      if (door.touched && door.routeOpen && !door.suspicionGiven) {
        door.suspicionGiven = true; g.aware = Math.min(100, g.aware + 15); // the world remembers your touches
        bus.emit('doorSuspicion', { guard: g, door: door });
      }
      bus.emit('doorOpened', { door: door, by: 'guard' });
    }
    var sp = speed * (g.def.speedMul || 1) * (g.slipT > 0 ? 0 : 1);
    var nx = g.x + (wp.x - g.x) / d * sp * dt, ny = g.y + (wp.y - g.y) / d * sp * dt;
    g.vx = (nx - g.x) / (dt || 1); g.vy = (ny - g.y) / (dt || 1);
    g.x = nx; g.y = ny;
    var oil = sim.oilAt(g.x, g.y, g.level);
    if (oil && g.slipT <= 0 && !g.slippedHere) { // Oil Flask T1: comedy + 5s down
      g.slipT = 5; g.slippedHere = true;
      sim.emitSound(g.x, g.y, LB.C.NOISE.oilSlip, 'oilSlip', 'world', g.level);
      bus.emit('guardSlipped', { guard: g });
    } else if (!oil) g.slippedHere = false;
    g.facing = M.angTo(0, 0, g.vx, g.vy);
    g.walkPhase += sp * dt * 2.2;
    return false;
  }

  function hideSpotsNear(g, x, y, r) {
    var f = sim.floors[g.level];
    return f.furniture.filter(function (fu) { return fu.hideSpot && M.dist(fu.x, fu.y, x, y) <= (r || 5); })
      .sort(function (a, b) { return M.dist(a.x, a.y, x, y) - M.dist(b.x, b.y, x, y); }).slice(0, 3);
  }

  // ---------- per-guard update ----------
  function updateGuard(g, dt, player) {
    if (g.ko) return;
    if (g.slipT > 0) g.slipT -= dt;
    if (g.blindT > 0) g.blindT -= dt;
    if (g.type === 'oldcopper') { // shutter rhythm: cone snaps with the shk-CLACK
      g.shutterT += dt;
      var cycle = g.shutterOpen ? 1.5 : 1.0;
      if (g.shutterT >= cycle) { g.shutterT = 0; g.shutterOpen = !g.shutterOpen; bus.emit('copperShutter', { guard: g, open: g.shutterOpen }); }
    }
    // head-turn sweeps (WARY+ or pairs' rear man) give pickpocket windows & catch sneaks
    g.headTurnT -= dt;
    if (g.headTurnT <= 0) { g.headTurnT = 3 + Math.random() * 4; g.headTurnDur = 0.9; }
    if (g.headTurnDur > 0) {
      g.headTurnDur -= dt;
      g.headTurn = Math.sin((0.9 - g.headTurnDur) * Math.PI / 0.9) * (sim.stage >= 1 ? 1.6 : 0.9);
      if (g.headTurnDur <= 0) g.headTurn = 0;
    }
    if (g.lead === false) g.headTurn = Math.PI; // rear constable watches BACKWARD

    // ----- sight fill -----
    var visible = false, mirrorHit = null;
    if (player && !player.hidden && player.level === g.level && !(player.disguised && !player.blatant)) {
      var sootCloak = player.tricks && player.tricks.sootcloak && player.moveMode === 'still' && sim.lightAt(player.x, player.y, g.level) < 0.25;
      if (!sootCloak) {
        visible = mgr.canSee(g, player.x, player.y, {});
        if (!visible && !g.def.civilian) { mirrorHit = mgr.mirrorSees(g, player.x, player.y); if (mirrorHit) visible = true; }
      }
    }
    if (g.def.civilian) { // civilians: no fill; startle at blatancy in short cone
      if (visible && player.blatant) startleCivilian(g, player);
      visible = false;
    }
    if (visible) {
      var L = M.lerp(C.AWARE_L_FLOOR, 1, sim.lightAt(player.x, player.y, g.level));
      var mode = player.takedownT > 0 ? 'takedown' : player.moveMode;
      var Mf = C.MOTION_M[mode] || 1;
      var R = coneRange(g, sim.lightAt(player.x, player.y, g.level));
      var d = M.dist(g.x, g.y, player.x, player.y);
      // K=840 per design math: sprint adjacent in lamplight ≈ instant (0.1s),
      // creep at cone-edge in shadow ≈ 5–6s to DETECTED (§2.1.2)
      var rate = C.AWARE_K * (1 - d / Math.max(R, 0.1)) * Mf * L * (mirrorHit ? 0.5 : 1);
      g.aware = Math.min(100, g.aware + rate * dt);
      g.unseenT = 0;
      g.lastSeen = { x: player.x, y: player.y };
    } else {
      g.unseenT += dt;
      if (g.unseenT > C.AWARE_DECAY_DELAY && g.aware > g.stickyFloor)
        g.aware = Math.max(g.stickyFloor, g.aware - C.AWARE_DECAY * dt);
    }

    // threshold crossings (sticky — suspicion never fully forgets, §2.1.2)
    if (g.aware >= C.T_SUSPICIOUS && g.stickyFloor < C.T_SUSPICIOUS) {
      g.stickyFloor = C.T_SUSPICIOUS;
      if (g.state !== 'chase' && g.state !== 'investigate') { g.state = 'suspicious'; g.windupT = 0.3; }
      mgr.anyPastSuspicious = true;
      bus.emit('guardSuspicious', { guard: g });
    }
    if (g.aware >= C.T_INVESTIGATE && g.stickyFloor < C.T_INVESTIGATE) {
      g.stickyFloor = C.T_INVESTIGATE;
      if (g.state !== 'chase') { g.state = 'investigate'; g.windupT = 0.4; g.path = null; }
      bus.emit('guardInvestigates', { guard: g, sight: true });
    }
    if (g.aware >= C.T_DETECTED && g.state !== 'chase' && !g.def.civilian) {
      g.state = 'chase'; g.windupT = 0.4; g.chaseLostT = 0;
      sim.feedAlert('detected', { x: g.x, y: g.y });
      sim.emitSound(g.x, g.y, C.NOISE.whistleBlast, 'whistleBlast', 'guardAlarm', g.level);
      bus.emit('guardDetected', { guard: g });
    }

    // ----- notice evidence in view -----
    if (!g.def.civilian) for (var e = 0; e < sim.evidence.length; e++) {
      var ev = sim.evidence[e];
      if (ev.seen || ev.level !== g.level) continue;
      if (ev.kind === 'dousedLamp' && !(g.def.relights || sim.stage >= 1)) continue; // §2.1.1: noticed by those who know it should be lit
      if (mgr.canSee(g, ev.x + 0.5, ev.y + 0.5, {})) {
        sim.noticeEvidence(ev, g);
        if (ev.kind === 'body' || ev.kind === 'scoreMissing') { g.state = 'investigate'; g.windupT = 0.4; g.lastSeen = { x: ev.x, y: ev.y }; g.path = null; }
        if (ev.kind === 'dousedLamp' && g.def.relights) { g.taskLight = ev; }
      }
    }
    // wardens: relight any dark gas lamp they can see, evidence or not
    if (g.def.relights && !g.taskLight && g.state === 'patrol') {
      var f2 = sim.floors[g.level];
      for (var li = 0; li < f2.lights.length; li++) {
        var lt = f2.lights[li];
        if (!lt.on && lt.gas && !lt.gloomed && mgr.canSee(g, lt.x + 0.5, lt.y + 0.5, {})) { g.taskLight = { x: lt.x, y: lt.y, light: lt }; break; }
      }
    }

    // ----- state machine -----
    var sp = C.GUARD_SPEED;
    switch (g.state) {
      case 'doze':
        g.anim.pose = 'doze';
        if (sim.stage >= 1) { g.state = 'post'; bus.emit('sentryWake', g); }
        break;
      case 'post':
        g.anim.pose = 'idle';
        if (g.post) {
          if (M.dist(g.x, g.y, g.post.x, g.post.y) > 0.3) { if (!g.path) repath(g, g.post.x, g.post.y); follow(g, dt, sp.patrol); }
          else if (!g.headTurnDur) g.facing = g.post.facing;
        }
        break;
      case 'patrol':
        g.anim.pose = 'walk';
        if (g.type === 'handler') { // handler follows his hound
          var dog = mgr.list.find(function (o) { return o.type === 'hound' && o.patrolId === g.patrolId && !o.ko; });
          if (dog && M.dist(g.x, g.y, dog.x, dog.y) > 1.6) { if (!g.path || g.pathIdx >= g.path.length) repath(g, dog.x, dog.y); follow(g, dt, sp.patrol * 1.2); }
          break;
        }
        if (g.lead === false) { // rear constable holds formation behind the lead
          var lead = mgr.list.find(function (o) { return o.patrolId === g.patrolId && o.lead === true && !o.ko; });
          if (lead && M.dist(g.x, g.y, lead.x, lead.y) > 1.4) { if (!g.path || g.pathIdx >= g.path.length) repath(g, lead.x, lead.y); follow(g, dt, sp.patrol * 1.15); }
          else if (lead) g.facing = lead.facing + Math.PI;
          break;
        }
        if (g.erratic) { // dockside toughs wander off-loop
          if (!g.path || g.pathIdx >= g.path.length) {
            var f3 = sim.floors[g.level];
            var rr = f3.rooms[Math.floor(Math.random() * f3.rooms.length)];
            repath(g, Math.floor(rr.cx) + 0.5, Math.floor(rr.cy) + 0.5);
          }
          follow(g, dt, sp.patrol);
          break;
        }
        if (g.type === 'oldcopper') { updateCopper(g, dt, player); break; }
        if (g.def.dog) updateDogScent(g, player);
        if (g.patrol && g.patrol.length) {
          var wp = g.patrol[g.wpIdx % g.patrol.length];
          if (!g.path || g.pathIdx >= g.path.length) {
            if (M.dist(g.x, g.y, wp.x, wp.y) < 0.5) { g.wpIdx++; wp = g.patrol[g.wpIdx % g.patrol.length]; }
            repath(g, wp.x, wp.y);
          }
          follow(g, dt, sp.patrol);
        }
        break;
      case 'glance':
        g.anim.pose = 'idle';
        g.windupT -= dt;
        if (g.glanceDir !== undefined) g.facing = M.lerp(g.facing, g.glanceDir, 0.15);
        if (g.windupT <= 0) g.state = g.post ? 'post' : 'patrol';
        break;
      case 'suspicious': // halt + 300ms head-turn windup (telegraph, §4.4)
        g.anim.pose = 'alert';
        g.windupT -= dt;
        if (g.lastSeen) g.facing = M.lerp(g.facing, M.angTo(g.x, g.y, g.lastSeen.x, g.lastSeen.y), 0.2);
        if (g.windupT <= 0 && g.aware < C.T_SUSPICIOUS) g.state = g.post ? 'post' : 'patrol';
        break;
      case 'investigate':
        g.anim.pose = 'walk';
        if (g.windupT > 0) { g.windupT -= dt; g.anim.pose = 'point'; break; } // 400ms lean-and-point
        if (g.taskLight) { doRelightTask(g, dt); break; }
        if (g.lastSeen) {
          if (!g.path) { if (!repath(g, g.lastSeen.x, g.lastSeen.y)) { g.lastSeen = null; break; } }
          if (follow(g, dt, sp.investigate)) {
            // arrived: search hide spots around the ghost (hiding is a bet, §2.2)
            g.searchQueue = hideSpotsNear(g, g.lastSeen.x, g.lastSeen.y, 5);
            g.state = 'search'; g.searchT = 0; g.path = null;
            bus.emit('guardSearches', { guard: g, spots: g.searchQueue.length });
          }
        } else g.state = g.post ? 'post' : 'patrol';
        break;
      case 'search':
        g.anim.pose = 'walk';
        if (g.searchQueue.length) {
          var spot = g.searchQueue[0];
          if (!g.path) repath(g, spot.x + 0.5, spot.y + 0.5);
          if (follow(g, dt, sp.search)) {
            g.searchT += dt;
            g.anim.pose = 'check';
            if (g.searchT > 0.8) {
              if (spot.occupiedBy === 'player' && player) { // found you — hiding was a bet, you lost
                g.aware = 100; g.state = 'chase'; g.chaseLostT = 0; player.flushedOut = true;
                sim.feedAlert('detected', { x: g.x, y: g.y });
                sim.emitSound(g.x, g.y, C.NOISE.whistleBlast, 'whistleBlast', 'guardAlarm', g.level);
                bus.emit('guardDetected', { guard: g, flushed: true });
              }
              if (spot.body) { sim.noticeEvidence(spot.body, g); }
              g.searchQueue.shift(); g.searchT = 0; g.path = null;
              bus.emit('hideSpotChecked', { guard: g, spot: spot });
            }
          }
        } else { // radius sweep then give up
          g.sweepN = (g.sweepN || 0) + 1;
          if (g.sweepN > 3 || !g.lastSeen) {
            g.sweepN = 0; g.state = 'return'; g.path = null;
            bus.emit('searchResolved', { guard: g, found: false });
          } else {
            var f4 = sim.floors[g.level];
            var rx = g.lastSeen.x + (Math.random() * 8 - 4), ry = g.lastSeen.y + (Math.random() * 8 - 4);
            rx = M.clamp(rx, 1, f4.w - 2); ry = M.clamp(ry, 1, f4.h - 2);
            if (!sim.blocked(rx, ry, true, g.level) && repath(g, rx, ry)) g.state = 'sweep';
            else g.sweepN++;
          }
        }
        break;
      case 'sweep':
        g.anim.pose = 'walk';
        if (follow(g, dt, sp.search)) { g.state = 'search'; g.path = null; }
        break;
      case 'chase':
        g.anim.pose = 'run';
        if (g.windupT > 0) { g.windupT -= dt; g.anim.pose = 'shout'; break; } // shout pose BEFORE speed engages
        if (player && player.level === g.level && !player.hidden && mgr.canSee(g, player.x, player.y, {})) {
          g.chaseLostT = 0; g.lastSeen = { x: player.x, y: player.y };
          if (!g.path || g.pathIdx >= g.path.length || (sim.time - (g.repathT || 0)) > 0.4) { g.repathT = sim.time; repath(g, player.x, player.y); }
          follow(g, dt, sp.chase);
          if (M.dist(g.x, g.y, player.x, player.y) < 0.9) {
            g.grabT += dt;
            var need = player.tricks && player.tricks.ironnerve ? C.IRON_NERVE_GRAB_S : C.GRAB_S;
            if (g.grabT >= need) bus.emit('grabbed', { guard: g });
          } else g.grabT = 0;
        } else {
          g.chaseLostT += dt; g.grabT = 0;
          if (g.path && g.pathIdx < g.path.length) follow(g, dt, sp.chase);
          if (g.chaseLostT >= C.CHASE_LOSE_S) {
            // broke LOS + 3s: freeze the ghost where they lost you (§2.1.2 — non-negotiable)
            mgr.ghost = { x: g.lastSeen ? g.lastSeen.x : g.x, y: g.lastSeen ? g.lastSeen.y : g.y, t: sim.time, level: g.level };
            g.ghost = mgr.ghost;
            g.searchQueue = hideSpotsNear(g, mgr.ghost.x, mgr.ghost.y, 5);
            g.state = 'search'; g.aware = Math.max(g.aware - 10, g.stickyFloor); g.path = null;
            bus.emit('ghostDropped', { guard: g, ghost: mgr.ghost });
          }
        }
        break;
      case 'return':
        g.anim.pose = 'walk';
        if (!g.path) {
          var home = g.post ? g.post : (g.patrol && g.patrol.length ? g.patrol[g.wpIdx % g.patrol.length] : { x: g.x, y: g.y });
          if (!repath(g, home.x, home.y)) { g.state = g.post ? 'post' : 'patrol'; break; }
        }
        if (follow(g, dt, sp.patrol)) g.state = g.post ? 'post' : 'patrol';
        break;
    }
  }

  function doRelightTask(g, dt) {
    var t = g.taskLight;
    var lx = (t.light ? t.light.x : t.x), ly = (t.light ? t.light.y : t.y);
    if (M.dist(g.x, g.y, lx + 0.5, ly + 0.5) > 1.4) {
      if (!g.path || g.pathIdx >= g.path.length) { if (!repath(g, lx + 0.5, ly + 0.5)) { g.taskLight = null; return; } }
      follow(g, dt, C.GUARD_SPEED.patrol);
      return;
    }
    g.relightT = (g.relightT || 0) + dt;
    g.anim.pose = 'reach';
    if (g.relightT > 1) {
      g.relightT = 0;
      var f = sim.floors[g.level];
      var light = t.light || f.lights.find(function (l) { return l.x === t.x && l.y === t.y; });
      if (light) {
        if (light.gloomed) { g.aware = Math.min(100, g.aware + 20); bus.emit('gloomPanic', { guard: g, light: light }); } // Gloom Oil: wardens fail, +panic
        else sim.relight(light);
      }
      g.taskLight = null; g.state = 'patrol'; g.path = null;
    }
  }

  function updateDogScent(g, player) {
    if (!player || player.level !== g.level) return;
    var best = null, bd = 1e9;
    for (var i = 0; i < sim.scent.length; i++) {
      var n = sim.scent[i];
      if (n.level !== g.level) continue;
      var d = M.dist(g.x, g.y, n.x, n.y);
      if (d < C.DOG_SCENT_R && d < bd) { bd = d; best = i; }
    }
    if (best !== null) {
      // lock on: follow the chain toward the newest node (the player)
      var target = sim.scent[Math.min(best + 2, sim.scent.length - 1)];
      if (!g.scentLocked) { g.scentLocked = true; sim.emitSound(g.x, g.y, 4, 'bark', 'guardAlarm', g.level); bus.emit('dogLockOn', { guard: g }); }
      g.state = 'investigate'; g.windupT = 0; g.lastSeen = { x: target.x, y: target.y }; g.path = null;
    } else if (g.scentLocked) g.scentLocked = false;
  }

  function updateCopper(g, dt, player) {
    // evidence chain: visit each site in order, then hunt the ghost (§2.8 #10)
    var unvisited = sim.evidence.filter(function (e) { return e.level === g.level && !e.copperVisited; });
    if (g.copperTarget && g.copperTarget.copperVisited) g.copperTarget = null;
    if (!g.copperTarget && unvisited.length) g.copperTarget = unvisited[0];
    if (g.copperTarget) {
      var t = g.copperTarget;
      if (M.dist(g.x, g.y, t.x + 0.5, t.y + 0.5) < 1.5) {
        t.copperVisited = true; if (!t.seen) sim.noticeEvidence(t, g);
        g.copperTarget = null; g.path = null;
        bus.emit('copperReads', { guard: g, evidence: t });
      } else {
        if (!g.path || g.pathIdx >= g.path.length) repath(g, t.x + 0.5, t.y + 0.5);
        follow(g, dt, C.GUARD_SPEED.patrol);
      }
    } else if (mgr.ghost && mgr.ghost.level === g.level) {
      if (!g.path || g.pathIdx >= g.path.length) repath(g, mgr.ghost.x, mgr.ghost.y);
      if (follow(g, dt, C.GUARD_SPEED.patrol)) {
        g.searchQueue = hideSpotsNear(g, mgr.ghost.x, mgr.ghost.y, 6);
        g.state = 'search';
      }
    } else if (player && player.level === g.level) {
      // no evidence, no ghost: drift toward the objective room — he knows why you came
      var f = sim.floors[g.level], obj = f.rooms[f.objectiveRoomId - 1];
      if (obj && (!g.path || g.pathIdx >= g.path.length)) repath(g, obj.cx, obj.cy);
      if (g.path) follow(g, dt, C.GUARD_SPEED.patrol * 0.9);
    }
  }

  function startleCivilian(g, player) {
    if (g.startled) return;
    g.startled = true;
    sim.emitSound(g.x, g.y, C.NOISE.scream, 'scream', 'guardAlarm', g.level);
    sim.feedAlert('civilianScream', { x: g.x, y: g.y });
    bus.emit('civilianScream', { guard: g });
    // run to nearest real guard, screaming — a mobile sound event
    var nearest = null, bd = 1e9;
    mgr.list.forEach(function (o) {
      if (o.def.civilian || o.ko || o.level !== g.level) return;
      var d = M.dist(g.x, g.y, o.x, o.y);
      if (d < bd) { bd = d; nearest = o; }
    });
    if (nearest) { g.fleeTo = nearest; g.state = 'investigate'; g.lastSeen = { x: nearest.x, y: nearest.y }; g.windupT = 0; g.path = null; }
  }

  mgr.tryKO = function (player, g, opts) {
    opts = opts || {};
    if (g.def.noKO) { bus.emit('koFailed', { guard: g }); return false; } // Old Copper cannot be KO'd
    var behind = Math.abs(M.angDiff(g.facing, M.angTo(g.x, g.y, player.x, player.y) + Math.PI)) < 1.2;
    if (!behind && !opts.frontal) return false;
    g.ko = true; g.aware = 0; g.anim.pose = 'ko';
    mgr.koCount++;
    var f = sim.floors[g.level];
    g.koBody = { x: Math.floor(g.x), y: Math.floor(g.y), guard: g };
    g.bodyEvidence = sim.addEvidence(Math.floor(g.x), Math.floor(g.y), 'body', { guard: g.id });
    bus.emit('guardKO', { guard: g, silent: opts.silent });
    return true;
  };

  mgr.hideBody = function (g, spot) {
    if (!g.ko || !g.bodyEvidence) return false;
    sim.evidence = sim.evidence.filter(function (e) { return e !== g.bodyEvidence; });
    spot.body = g.bodyEvidence; spot.bodyGuard = g;
    g.hiddenIn = spot; g.bodyEvidence = null;
    g.x = spot.x + 0.5; g.y = spot.y + 0.5;
    bus.emit('bodyHidden', { guard: g, spot: spot });
    return true;
  };

  mgr.update = function (dt, player) {
    for (var i = 0; i < mgr.list.length; i++) updateGuard(mgr.list[i], dt, player);
    // register lantern lights (mobile pools — §2.1.1)
    sim.dynamicLights = sim.dynamicLights.filter(function (l) { return !l.guard; });
    mgr.list.forEach(function (g) {
      if (!g.ko && (g.def.lantern || g.type === 'oldcopper') && !(g.type === 'oldcopper' && !g.shutterOpen))
        sim.dynamicLights.push({ x: g.x, y: g.y, r: C.LANTERN_R, level: g.level, guard: true });
    });
    if (mgr.rival) updateRival(dt, player);
  };

  // ---------- THE OTHER SHADOW (§2.8 #11): the probe brain as an in-game actor ----------
  mgr.spawnRival = function () {
    var f = sim.floor();
    var wnd = f.windows[0];
    var start = wnd ? { x: wnd.x + (wnd.x === 0 ? 1.5 : wnd.x >= f.w - 2 ? -0.5 : 0.5), y: wnd.y + 1.5 } : { x: f.spawn.x, y: f.spawn.y };
    mgr.rival = {
      x: M.clamp(start.x, 1, f.w - 2), y: M.clamp(start.y, 1, f.h - 2), level: sim.level,
      speed: C.SPEED.walk * 0.9, escaped: false, gotScore: false, bag: [],
      moveMode: 'walk', anim: { phase: 0, pose: 'walk' }, facingOct: 0, vx: 0, vy: 0
    };
    mgr.rival.brain = LB.ProbeBrain(sim, mgr.rival, { rival: true });
    bus.emit('rivalSpawn', mgr.rival);
    return mgr.rival;
  };
  function updateRival(dt, player) {
    var r = mgr.rival;
    if (r.escaped) return;
    r.brain.update(dt);
    // guards notice her a little — chaos you can surf; she never rats you out
    mgr.list.forEach(function (g) {
      if (g.ko || g.def.civilian) return;
      if (mgr.canSee(g, r.x, r.y, {})) {
        g.aware = Math.min(65, g.aware + 30 * dt); // she stirs suspicion, never triggers a full hunt herself
        if (M.dist(g.x, g.y, r.x, r.y) < 1.6) { // cornered: soot-burst, gone
          r.escaped = true; bus.emit('rivalEscaped', { rival: r, caught: false });
        }
      }
    });
    if (r.brain.done && !r.escaped) { r.escaped = true; bus.emit('rivalEscaped', { rival: r, banked: true, gotScore: r.gotScore }); }
  }

  return mgr;
};

// ---------- ProbeBrain: greedy stealth router. Verification tool AND rival AI. ----------
// agent: {x, y, speed, bag[], level} — brain moves it, snuffs lamps, lifts loot, exits.
LB.ProbeBrain = function (sim, agent, opts) {
  opts = opts || {};
  var M = LB.M;
  var brain = { state: 'loot', target: null, path: null, pathIdx: 0, done: false, log: [], stuck: 0 };

  function costFn(x, y) {
    var c = sim.lightAt(x, y, agent.level) * 3;
    return c;
  }
  function repath(tx, ty) {
    var f = sim.floors[agent.level];
    brain.path = LB.astar(f.w, f.h, function (x, y) {
      if (f.solid[y][x] === 1) return true;
      if (f.solid[y][x] === 2) return true;
      var d = sim.doorAt(x, y, agent.level);
      if (d && !d.open && (d.locked || d.timelock)) return true; // rival doesn't pick locks
      return false;
    }, agent.x, agent.y, tx, ty, costFn);
    brain.pathIdx = 0;
    return !!brain.path;
  }
  function adjacentReach(tx, ty) { // stand next to a furniture/loot tile
    var f = sim.floors[agent.level];
    var dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < dirs.length; i++) {
      var x = tx + dirs[i][0], y = ty + dirs[i][1];
      if (x >= 0 && y >= 0 && x < f.w && y < f.h && !sim.blocked(x + 0.5, y + 0.5, false, agent.level)) return { x: x + 0.5, y: y + 0.5 };
    }
    return null;
  }
  function pickTarget() {
    var f = sim.floors[agent.level];
    var options = f.loot.filter(function (l) { return !l.taken && !l.vaulted && !l.inDesk; });
    if (!options.length) return null;
    options.sort(function (a, b) {
      var fa = (a.tag === 'famous' ? -500 : 0) + M.dist(agent.x, agent.y, a.x, a.y);
      var fb = (b.tag === 'famous' ? -500 : 0) + M.dist(agent.x, agent.y, b.x, b.y);
      return fa - fb;
    });
    return options[0];
  }
  function exitPoint() {
    var f = sim.floors[agent.level];
    if (f.windows.length && !f.windows[0].sealed) {
      var w = f.windows[0];
      var inSide = adjacentReach(w.x, w.y);
      if (inSide) return inSide;
    }
    var e = f.exits[0];
    if (e) { var p = adjacentReach(e.x, e.y); if (p) return p; }
    return { x: f.spawn.x, y: f.spawn.y };
  }

  brain.update = function (dt) {
    if (brain.done) return;
    var f = sim.floors[agent.level];
    if (brain.state === 'loot') {
      if (!brain.target || brain.target.taken) {
        brain.target = pickTarget();
        brain.path = null;
        if (!brain.target || agent.bag.length >= (opts.bagMax || 3)) { brain.state = 'exit'; brain.path = null; }
      }
      if (brain.target) {
        if (!brain.path) {
          var reach = adjacentReach(brain.target.x, brain.target.y);
          if (!reach || !repath(reach.x, reach.y)) { brain.target.unreachable = true; brain.log.push('unreachable loot ' + brain.target.name); brain.target.taken = true; brain.target = null; return; }
        }
        if (walk(dt)) {
          brain.target.taken = true; brain.target.takenBy = opts.rival ? 'rival' : 'probe';
          agent.bag.push(brain.target);
          if (brain.target.tag === 'famous') { agent.gotScore = true; if (opts.rival) sim.bus.emit('rivalTookScore', { loot: brain.target }); }
          brain.log.push('took ' + brain.target.name);
          brain.target = null; brain.path = null;
        }
      }
    } else if (brain.state === 'exit') {
      if (!brain.path) { var ep = exitPoint(); if (!repath(ep.x, ep.y)) { brain.stuck++; if (brain.stuck > 5) brain.done = true; return; } }
      if (walk(dt)) brain.done = true;
    }
    // snuff lamps adjacent on route (she works dark, and so does the probe)
    for (var i = 0; i < f.lights.length; i++) {
      var l = f.lights[i];
      if (l.on && !l.electric && M.dist(l.x + 0.5, l.y + 0.5, agent.x, agent.y) < 1.5) {
        sim.snuffLight(l, false); // rival snuffs leave no PLAYER evidence trail but guards still see dark
        if (opts.rival) sim.bus.emit('rivalSnuffed', { light: l });
        brain.log.push('snuffed lamp @' + l.x + ',' + l.y);
      }
    }
  };
  function walk(dt) {
    if (!brain.path || brain.pathIdx >= brain.path.length) return true;
    var wp = brain.path[brain.pathIdx];
    var d = M.dist(agent.x, agent.y, wp.x, wp.y);
    if (d < 0.15) { brain.pathIdx++; return brain.pathIdx >= brain.path.length; }
    var door = sim.doorAt(wp.x, wp.y, agent.level);
    if (door && !door.open && d < 1.2 && !door.locked) { door.open = true; sim.bus.emit('doorOpened', { door: door, by: 'rival' }); }
    var sp = agent.speed * (sim.smokeAt(agent.x, agent.y, agent.level) ? 0.7 : 1);
    agent.vx = (wp.x - agent.x) / d * sp; agent.vy = (wp.y - agent.y) / d * sp;
    agent.x += agent.vx * dt; agent.y += agent.vy * dt;
    agent.facingOct = M.octant(agent.vx, agent.vy);
    if (agent.anim) agent.anim.phase += sp * dt * 2.2;
    return false;
  }
  return brain;
};

if (typeof module !== 'undefined') module.exports = LB;
