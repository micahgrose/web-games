'use strict';
// LAMPBLACK — the three channels (DESIGN §2.1) + alertness/evidence ratchet (§2.3).
// One truth, two consumers: the same fields drive gameplay AND render AND audio.
var LB = (typeof LB !== 'undefined') ? LB : (typeof module !== 'undefined' ? require('./core.js') : {});

LB.Sim = function (floors, spec, bus) {
  var C = LB.C, M = LB.M;
  var sim = {
    floors: floors, level: 0, spec: spec || {}, bus: bus || LB.Bus(),
    time: 0, roundsTimer: 0,
    alert: (spec && spec.startAlert) || 0, stage: 0,
    evidence: [], evidenceFeeds: 0, stamps: [],
    scent: [], smokes: [], oils: [], sounds: [], songbirds: [],
    sealed: false, openExitDoorId: -1, responseSpawned: 0, copperSpawned: false,
    noiseMul: 1, coneDelta: 0
  };
  (spec && spec.modifiers || []).forEach(function (m) {
    var mod = LB.MODIFIERS[m]; if (!mod) return;
    if (mod.noiseMul) sim.noiseMul = mod.noiseMul;
    if (mod.coneDelta) sim.coneDelta = mod.coneDelta;
    if (mod.startAlert) sim.alert = Math.max(sim.alert, mod.startAlert);
  });
  if (sim.alert >= 25) sim.stage = 1;

  sim.floor = function () { return sim.floors[sim.level]; };

  // ---------- lookups ----------
  var doorMaps = floors.map(function (f) {
    var m2 = {}; f.doors.forEach(function (d) { m2[d.x + ',' + d.y] = d; }); return m2;
  });
  sim.doorAt = function (x, y, lvl) { return doorMaps[lvl === undefined ? sim.level : lvl][Math.floor(x) + ',' + Math.floor(y)]; };
  sim.roomAt = function (x, y, lvl) {
    var f = sim.floors[lvl === undefined ? sim.level : lvl];
    var yy = Math.floor(y), xx = Math.floor(x);
    return (f.roomId[yy] && f.roomId[yy][xx] !== undefined) ? f.roomId[yy][xx] : 0;
  };

  // Movement blocking. Guards may pass closed-unlocked doors (they open them).
  sim.blocked = function (x, y, isGuard, lvl) {
    var f = sim.floors[lvl === undefined ? sim.level : lvl];
    if (x < 0 || y < 0 || x >= f.w || y >= f.h) return true;
    var s = f.solid[Math.floor(y)][Math.floor(x)];
    if (s === 1) return true;
    if (s === 2) return true; // furniture
    var d = sim.doorAt(x, y, lvl);
    if (d && !d.open) {
      if (isGuard) return d.timelock; // guards open anything but the timelock vault
      return true; // player opens via verb
    }
    return false;
  };

  // Sight/light opacity: walls opaque (windows transparent), closed doors opaque.
  sim.opaque = function (x, y, lvl) {
    var f = sim.floors[lvl === undefined ? sim.level : lvl];
    if (x < 0 || y < 0 || x >= f.w || y >= f.h) return true;
    var xf = Math.floor(x), yf = Math.floor(y);
    if (f.solid[yf][xf] === 1) return !f.windowAt[xf + ',' + yf];
    var d = doorMaps[lvl === undefined ? sim.level : lvl][xf + ',' + yf];
    if (d && !d.open) return true;
    return false;
  };
  // Light occlusion: like opaque but furniture also casts shadow (§2.1.1).
  sim.lightOpaque = function (x, y, lvl) {
    var f = sim.floors[lvl === undefined ? sim.level : lvl];
    if (x < 0 || y < 0 || x >= f.w || y >= f.h) return true;
    if (f.solid[Math.floor(y)][Math.floor(x)] === 2) return true;
    return sim.opaque(x, y, lvl);
  };

  function losGeneric(opFn, x0, y0, x1, y1, lvl) {
    var ax = Math.floor(x0), ay = Math.floor(y0), bx = Math.floor(x1), by = Math.floor(y1);
    var dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
    var sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1, err = dx - dy, x = ax, y = ay;
    var guard = 0;
    while (guard++ < 500) {
      if (!(x === ax && y === ay) && !(x === bx && y === by) && opFn(x, y, lvl)) return false;
      if (x === bx && y === by) return true;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return false;
  }
  sim.los = function (x0, y0, x1, y1, lvl) { return losGeneric(sim.opaque, x0, y0, x1, y1, lvl); };
  sim.losLight = function (x0, y0, x1, y1, lvl) { return losGeneric(sim.lightOpaque, x0, y0, x1, y1, lvl); };

  // ---------- LIGHT field (§2.1.1): static cache + dynamic sources ----------
  var lightCache = floors.map(function () { return null; });
  sim.rebuildLight = function (lvl) {
    lvl = lvl === undefined ? sim.level : lvl;
    var f = sim.floors[lvl];
    var field = [];
    for (var y = 0; y < f.h; y++) field.push(new Float32Array(f.w));
    f.lights.forEach(function (l) {
      if (!l.on) return;
      var r = l.r, x0 = Math.max(0, Math.floor(l.x - r)), x1 = Math.min(f.w - 1, Math.ceil(l.x + r));
      var y0 = Math.max(0, Math.floor(l.y - r)), y1 = Math.min(f.h - 1, Math.ceil(l.y + r));
      for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) {
        var d = M.dist(l.x + 0.5, l.y + 0.5, xx + 0.5, yy + 0.5);
        if (d > r) continue;
        if (!losGeneric(sim.lightOpaque, l.x, l.y, xx, yy, lvl)) continue;
        field[yy][xx] = Math.min(1, field[yy][xx] + (1 - d / r));
      }
    });
    f.moonQuads.forEach(function (q) {
      for (var yy = q.y; yy < q.y + q.h; yy++) for (var xx = q.x; xx < q.x + q.w; xx++)
        if (yy >= 0 && xx >= 0 && yy < f.h && xx < f.w) field[yy][xx] = Math.min(1, field[yy][xx] + LB.PAL.MOON_ALPHA);
    });
    lightCache[lvl] = field;
    sim.bus.emit('lightRebuilt', { level: lvl });
  };
  floors.forEach(function (_, i) { sim.rebuildLight(i); });

  // dynamic sources registered per frame by guards (lanterns) and player (dark lantern)
  sim.dynamicLights = [];
  sim.lightAt = function (x, y, lvl) {
    lvl = lvl === undefined ? sim.level : lvl;
    var f = sim.floors[lvl], xf = Math.floor(x), yf = Math.floor(y);
    if (xf < 0 || yf < 0 || xf >= f.w || yf >= f.h) return 0;
    var v = lightCache[lvl][yf][xf];
    for (var i = 0; i < sim.dynamicLights.length; i++) {
      var l = sim.dynamicLights[i];
      if (l.level !== lvl) continue;
      var d = M.dist(l.x, l.y, x, y);
      if (d < l.r && sim.losLight(l.x, l.y, x, y, lvl)) v = Math.min(1, v + (1 - d / l.r));
    }
    // smoke clouds dim light locally
    for (var s = 0; s < sim.smokes.length; s++) {
      var sm = sim.smokes[s];
      if (sm.level === lvl && M.dist(sm.x, sm.y, x, y) < sm.r) v *= 0.3;
    }
    return v;
  };

  sim.snuffLight = function (l, byPlayer, traceless) {
    if (!l.on || l.electric) return false;
    l.on = false;
    sim.rebuildLight();
    if (byPlayer && !traceless) sim.addEvidence(l.x, l.y, 'dousedLamp');
    sim.bus.emit('snuffed', { light: l, byPlayer: byPlayer });
    return true;
  };
  sim.relight = function (l) {
    if (l.on || l.sabotaged) return false;
    if (l.gloomed) return false; // Gloom Oil T3: cannot be relit
    l.on = true;
    sim.rebuildLight();
    // relight clears the doused evidence at this spot
    sim.evidence = sim.evidence.filter(function (e) { return !(e.kind === 'dousedLamp' && e.x === l.x && e.y === l.y); });
    sim.bus.emit('relit', { light: l });
    return true;
  };
  sim.gasValveOff = function (valve) {
    if (valve.used) return;
    valve.used = true;
    var f = sim.floor();
    var zone = {}; zone[valve.roomId] = 1;
    f.doors.forEach(function (d) { if (d.roomA === valve.roomId) zone[d.roomB] = 1; if (d.roomB === valve.roomId) zone[d.roomA] = 1; });
    f.lights.forEach(function (l) { if (l.gas && zone[l.roomId]) l.on = false; });
    sim.rebuildLight();
    sim.emitSound(valve.x + 0.5, valve.y + 0.5, C.NOISE.gasValve, 'gasValve', 'player');
    sim.bus.emit('gasValve', { valve: valve });
  };

  // ---------- SOUND (§2.1.3): door-graph propagation, BFS best-loudness ----------
  // Returns { rooms: {roomId: loudnessAtEntry}, at(x,y,room): received loudness }
  sim.propagate = function (sx, sy, L0, lvl) {
    lvl = lvl === undefined ? sim.level : lvl;
    var f = sim.floors[lvl];
    var srcRoom = sim.roomAt(sx, sy, lvl);
    var best = {}; // roomId -> {L, x, y}
    best[srcRoom] = { L: L0, x: sx, y: sy };
    var queue = [{ room: srcRoom, L: L0, x: sx, y: sy }];
    var guard = 0;
    while (queue.length && guard++ < 400) {
      var bi = 0;
      for (var i = 1; i < queue.length; i++) if (queue[i].L > queue[bi].L) bi = i;
      var cur = queue.splice(bi, 1)[0];
      if (best[cur.room] && best[cur.room].L > cur.L + 0.001) continue;
      var doors = cur.room === 0 ? f.doors.filter(function (d) { return d.roomA === 0 || d.roomB === 0; })
        : f.rooms[cur.room - 1].doors.map(function (di) { return f.doors[di]; });
      for (var j = 0; j < doors.length; j++) {
        var d = doors[j];
        var other = (d.roomA === cur.room) ? d.roomB : (d.roomB === cur.room ? d.roomA : null);
        if (other === null) continue;
        var atDoor = cur.L - M.dist(cur.x, cur.y, d.x + 0.5, d.y + 0.5);
        if (atDoor <= 0) continue;
        var thru = atDoor * (d.open ? C.DOOR_OPEN_MUL : C.DOOR_CLOSED_MUL);
        if (thru <= 0.2) continue;
        if (!best[other] || thru > best[other].L) {
          best[other] = { L: thru, x: d.x + 0.5, y: d.y + 0.5 };
          queue.push({ room: other, L: thru, x: d.x + 0.5, y: d.y + 0.5 });
        }
      }
    }
    return {
      rooms: best,
      at: function (x, y) {
        var room = sim.roomAt(x, y, lvl);
        var b = best[room];
        if (!b) return 0;
        return Math.max(0, b.L - M.dist(b.x, b.y, x, y));
      }
    };
  };

  // Emit a world sound. cls in NOISE keys; src 'player'|'guard'|'lure'|'world'.
  sim.emitSound = function (x, y, L, cls, src, lvl) {
    lvl = lvl === undefined ? sim.level : lvl;
    L = L * sim.noiseMul;
    if (L <= 0) return null;
    var prop = sim.propagate(x, y, L, lvl);
    var ev = { x: x, y: y, L: L, cls: cls, src: src, t: sim.time, level: lvl, prop: prop, age: 0 };
    sim.sounds.push(ev);
    if (sim.sounds.length > 30) sim.sounds.shift();
    sim.bus.emit('sound', ev);
    return ev;
  };

  // ---------- SCENT (dogs, §2.1.3) ----------
  sim.dropScent = function (x, y) {
    sim.scent.push({ x: x, y: y, t: sim.time, level: sim.level });
    if (sim.scent.length > 60) sim.scent.shift();
  };
  sim.breakScentNear = function (x, y, r) {
    sim.scent = sim.scent.filter(function (n) { return M.dist(n.x, n.y, x, y) > (r || 2.5); });
  };

  // ---------- ALERTNESS ratchet (§2.3): one-way, staged, spatial hardening ----------
  sim.feedAlert = function (kind, at) {
    var amt = C.ALERT_FEED[kind] || 0;
    if (!amt) return;
    var before = sim.stage;
    sim.alert = Math.min(100, sim.alert + amt);
    sim.stamps.push({ t: sim.time, kind: kind, amt: amt, label: stampLabel(kind) });
    if (sim.stamps.length > 12) sim.stamps.shift();
    var st = 0;
    for (var i = 0; i < C.ALERT_STAGES.length; i++) if (sim.alert >= C.ALERT_STAGES[i]) st = i;
    sim.bus.emit('alertFeed', { kind: kind, amt: amt, at: at, alert: sim.alert });
    if (st > before) { sim.stage = st; hardenFloor(st); sim.bus.emit('stageUp', { stage: st, name: LB.STAGE_NAMES[st] }); }
  };
  function stampLabel(kind) {
    return { detected: 'seen — the cry goes up', bodyFound: 'a man found sleeping',
      civilianScream: 'a scream', loudNoise: 'a racket heard', dousedCluster: 'doused lamps noticed',
      forcedEntry: 'forced entry found', scoreMissing: 'the prize is missed', lureHabit: "someone's playing games",
      roundsTick: 'the shift wears on' }[kind] || kind;
  }
  function hardenFloor(stage) {
    var f = sim.floor();
    if (stage >= 1) { // WARY: doors close
      f.doors.forEach(function (d) { if (!d.exit && d.open && Math.random() < 0.5) { d.open = false; } });
    }
    if (stage >= 2) { // ALARMED: interior doors lock, response guard at main door
      f.doors.forEach(function (d) { if (!d.exit && !d.open && Math.random() < 0.3) d.locked = true; });
      sim.bus.emit('spawnResponse', {});
    }
    if (stage >= 3) { // LOCKDOWN: seal all exits but the farthest from the objective
      sim.sealed = true;
      var obj = f.rooms[f.objectiveRoomId - 1] || f.rooms[0];
      var bestD = -1, keep = null;
      var exitDoors = f.doors.filter(function (d) { return d.exit; });
      var exitWins = f.windows;
      var far = null, farD = -1, farKind = 'door';
      exitDoors.forEach(function (d) { var dd = M.dist(d.x, d.y, obj.cx, obj.cy); if (dd > farD) { farD = dd; far = d; farKind = 'door'; } });
      exitWins.forEach(function (w) { var dd = M.dist(w.x, w.y, obj.cx, obj.cy); if (dd > farD) { farD = dd; far = w; farKind = 'window'; } });
      exitDoors.forEach(function (d) { d.locked = true; d.open = false; d.sealed = true; });
      exitWins.forEach(function (w) { w.sealed = true; });
      if (far) { far.sealed = false; if (farKind === 'door') { far.locked = false; sim.openExitDoorId = far.id; } sim.lockdownExit = { x: far.x, y: far.y, kind: farKind }; }
      if ((sim.spec.act || 1) >= 2 && !sim.copperSpawned) { sim.copperSpawned = true; sim.bus.emit('spawnCopper', {}); }
    }
    sim.bus.emit('lightRebuilt', { level: sim.level }); // lamp recolor wave
  }

  // ---------- EVIDENCE (§2.3): sites guards can notice; feeds the ratchet ----------
  sim.addEvidence = function (x, y, kind, data) {
    var e = { x: x, y: y, kind: kind, level: sim.level, seen: false, t: sim.time, data: data || null };
    sim.evidence.push(e);
    sim.bus.emit('evidence', e);
    return e;
  };
  sim.noticeEvidence = function (e, guard) {
    if (e.seen) return;
    e.seen = true;
    sim.evidenceFeeds++;
    var feedKind = { dousedLamp: 'dousedCluster', body: 'bodyFound', forcedDoor: 'forcedEntry',
      smashedWindow: 'forcedEntry', scoreMissing: 'scoreMissing' }[e.kind];
    if (feedKind) sim.feedAlert(feedKind, e);
    sim.bus.emit('evidenceNoticed', { evidence: e, guard: guard });
  };

  // ---------- misc world systems ----------
  sim.addSmoke = function (x, y, r, ttl, douses) {
    sim.smokes.push({ x: x, y: y, r: r, ttl: ttl, level: sim.level });
    if (douses) {
      var f = sim.floor();
      f.lights.forEach(function (l) {
        if (l.on && !l.electric && M.dist(l.x + 0.5, l.y + 0.5, x, y) <= r) sim.snuffLight(l, true);
      });
    }
    sim.breakScentNear(x, y, r);
  };
  sim.addOil = function (x, y) { sim.oils.push({ x: Math.floor(x), y: Math.floor(y), level: sim.level }); };
  sim.addSongbird = function (x, y, dirx, diry) {
    sim.songbirds.push({ x: x, y: y, dx: dirx, dy: diry, left: 6, tick: 0, level: sim.level });
  };

  sim.smokeAt = function (x, y, lvl) {
    lvl = lvl === undefined ? sim.level : lvl;
    for (var i = 0; i < sim.smokes.length; i++) {
      var s = sim.smokes[i];
      if (s.level === lvl && M.dist(s.x, s.y, x, y) < s.r) return s;
    }
    return null;
  };

  sim.update = function (dt, playerRef) {
    sim.time += dt;
    // rounds clock: +4 per 90s on site (§2.3) — time is a spend
    sim.roundsTimer += dt;
    if (sim.roundsTimer >= C.ROUNDS_TICK_S) { sim.roundsTimer -= C.ROUNDS_TICK_S; sim.feedAlert('roundsTick'); }
    // scent decay
    sim.scent = sim.scent.filter(function (n) { return sim.time - n.t < C.SCENT_TTL; });
    // smoke decay
    for (var i = sim.smokes.length - 1; i >= 0; i--) { sim.smokes[i].ttl -= dt; if (sim.smokes[i].ttl <= 0) sim.smokes.splice(i, 1); }
    // sound ring ages (render)
    sim.sounds.forEach(function (s) { s.age += dt; });
    sim.sounds = sim.sounds.filter(function (s) { return s.age < 1.2; });
    // songbird lures walk and chirp
    for (var b = sim.songbirds.length - 1; b >= 0; b--) {
      var sb = sim.songbirds[b];
      sb.tick += dt;
      if (sb.tick > 1) {
        sb.tick = 0; sb.left--;
        var nx = sb.x + sb.dx, ny = sb.y + sb.dy;
        if (!sim.blocked(nx, ny, false, sb.level)) { sb.x = nx; sb.y = ny; }
        sim.emitSound(sb.x, sb.y, C.NOISE.coinLure, 'lure', 'lure', sb.level);
        if (sb.left <= 0) sim.songbirds.splice(b, 1);
      }
    }
    // cats: ambient chaos (manor)
    var f = sim.floor();
    f.cats.forEach(function (cat) {
      cat.t = (cat.t || 0) + dt;
      if (cat.t > 2) {
        cat.t = 0;
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        var d = dirs[Math.floor(Math.random() * 4)];
        if (!sim.blocked(cat.x + d[0], cat.y + d[1], false)) { cat.x += d[0]; cat.y += d[1]; }
        if (playerRef && !cat.tame && M.dist(cat.x, cat.y, playerRef.x, playerRef.y) < 1.5 && playerRef.moveMode === 'sprint') {
          sim.emitSound(cat.x, cat.y, C.NOISE.catYowl, 'catYowl', 'world');
        }
      }
    });
  };

  // material under a position (creak tiles live separately)
  sim.materialAt = function (x, y, lvl) {
    lvl = lvl === undefined ? sim.level : lvl;
    var f = sim.floors[lvl];
    var yy = Math.floor(y), xx = Math.floor(x);
    if (f.material[yy] && f.material[yy][xx]) return f.material[yy][xx];
    return 'stone';
  };
  sim.creakAt = function (x, y) { return !!sim.floor().creaks[Math.floor(x) + ',' + Math.floor(y)]; };
  sim.chimeAt = function (x, y) { return sim.floor().chimes[Math.floor(x) + ',' + Math.floor(y)]; };
  sim.oilAt = function (x, y, lvl) {
    lvl = lvl === undefined ? sim.level : lvl;
    for (var i = 0; i < sim.oils.length; i++) {
      var o = sim.oils[i];
      if (o.level === lvl && o.x === Math.floor(x) && o.y === Math.floor(y)) return o;
    }
    return null;
  };

  return sim;
};

if (typeof module !== 'undefined') module.exports = LB;
