'use strict';
// LAMPBLACK — floor generation (DESIGN §2.5): buildings not caves, room-template
// stitching, objective at max door-depth, patrols with deliberate gaps,
// plus the fixed authored A1J1 seed "The Glover House" (§3.2).
var LB = (typeof LB !== 'undefined') ? LB : (typeof module !== 'undefined' ? require('./core.js') : {});

(function () {
  var MARGIN = 3; // perimeter casing strip width around the building

  function makeFloor(w, h) {
    var f = {
      w: w, h: h,
      solid: [], material: [], roomId: [], windowAt: {}, creaks: {}, chimes: {},
      rooms: [], doors: [], windows: [], lights: [], moonQuads: [],
      furniture: [], loot: [], stairs: [], valves: [], mirrors: [], cats: [],
      exits: [], guards: [], cart: null, spawn: null,
      objectiveRoomId: -1, building: null, level: 0
    };
    for (var y = 0; y < h; y++) {
      f.solid.push(new Array(w).fill(0));
      f.material.push(new Array(w).fill('stone'));
      f.roomId.push(new Array(w).fill(0)); // 0 = outside
    }
    return f;
  }

  function fillWalls(f, bx, by, bw, bh) {
    for (var y = by; y < by + bh; y++) for (var x = bx; x < bx + bw; x++) {
      var edge = (x === bx || y === by || x === bx + bw - 1 || y === by + bh - 1);
      f.solid[y][x] = edge ? 1 : 0;
    }
  }

  // BSP partition of interior; wall lines occupy the split row/col.
  function bsp(f, rng, x, y, w, h, depth, leaves) {
    var MIN = 5; // interior min span incl. no wall
    var canV = w >= MIN * 2 + 1, canH = h >= MIN * 2 + 1;
    if (depth <= 0 || (!canV && !canH)) { leaves.push({ x: x, y: y, w: w, h: h }); return; }
    var vertical = canV && (!canH || rng.chance(w > h ? 0.75 : 0.25));
    if (vertical) {
      var sx = x + rng.int(MIN, w - MIN - 1);
      for (var yy = y; yy < y + h; yy++) f.solid[yy][sx] = 1;
      bsp(f, rng, x, y, sx - x, h, depth - 1, leaves);
      bsp(f, rng, sx + 1, y, x + w - sx - 1, h, depth - 1, leaves);
    } else {
      var sy = y + rng.int(MIN, h - MIN - 1);
      for (var xx = x; xx < x + w; xx++) f.solid[sy][xx] = 1;
      bsp(f, rng, x, y, w, sy - y, depth - 1, leaves);
      bsp(f, rng, x, sy + 1, w, y + h - sy - 1, depth - 1, leaves);
    }
  }

  function addRoom(f, rect, type) {
    var id = f.rooms.length + 1;
    var room = { id: id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, type: type, doors: [], cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 };
    f.rooms.push(room);
    for (var y = rect.y; y < rect.y + rect.h; y++) for (var x = rect.x; x < rect.x + rect.w; x++) f.roomId[y][x] = id;
    return room;
  }

  function addDoor(f, x, y, a, b, opts) {
    opts = opts || {};
    var d = { id: f.doors.length, x: x, y: y, roomA: a, roomB: b,
      open: opts.open !== undefined ? opts.open : true,
      locked: !!opts.locked, quality: opts.quality || 0, bell: !!opts.bell,
      disarmed: false, forced: false, exit: !!opts.exit, routeOpen: opts.open !== false };
    f.solid[y][x] = 0;
    f.doors.push(d);
    if (a > 0) f.rooms[a - 1].doors.push(d.id);
    if (b > 0) f.rooms[b - 1].doors.push(d.id);
    return d;
  }

  function addWindow(f, x, y, roomId) {
    var wnd = { id: f.windows.length, x: x, y: y, roomId: roomId, cut: false };
    f.windowAt[x + ',' + y] = wnd;
    f.windows.push(wnd);
    return wnd;
  }

  function addLight(f, x, y, type, opts) {
    opts = opts || {};
    var r = type === 'lamp' ? LB.C.LAMP_R : type === 'candle' ? LB.C.CANDLE_R : type === 'fire' ? LB.C.FIRE_R : LB.C.LAMP_R;
    var l = { id: f.lights.length, x: x, y: y, type: type, r: opts.r || r, on: opts.on !== false,
      electric: !!opts.electric, gas: type === 'lamp' && !opts.electric, sabotaged: false, roomId: f.roomId[y] ? f.roomId[y][x] : 0 };
    f.lights.push(l);
    return l;
  }

  function addFurn(f, x, y, type, opts) {
    opts = opts || {};
    var solidTypes = { wardrobe: 1, bed: 1, crate: 1, table: 1, desk: 1, pedestal: 1, fireplace: 1, safe: 1, chair: 0, curtain: 0, rug: 0, dumbwaiter: 1, mirror: 1 };
    var hideTypes = { wardrobe: 1, bed: 1, crate: 1, curtain: 1 };
    var it = { id: f.furniture.length, x: x, y: y, type: type,
      hideSpot: !!hideTypes[type], occupiedBy: null, body: null,
      facing: opts.facing || 0, locked: !!opts.locked, quality: opts.quality || 0, opened: false };
    if (solidTypes[type]) f.solid[y][x] = 2; // 2 = furniture: blocks walk, not sight
    f.furniture.push(it);
    if (type === 'mirror') f.mirrors.push(it);
    if (type === 'dumbwaiter') it.queue = [];
    return it;
  }

  function addLoot(f, x, y, entry, tag, score) {
    var it = { id: f.loot.length, x: x, y: y, name: entry[0], bulk: entry[1], value: entry[2],
      tag: tag || entry[3] || 'quiet', score: score || null, taken: false, missedNoticed: false,
      twoHand: score ? !!score.twoHand : entry[1] >= 2 && entry[0].indexOf('portrait') >= 0 };
    if (score) { it.name = score.name; it.bulk = score.bulk; it.value = score.value; it.tag = 'famous'; it.twoHand = !!score.twoHand; }
    f.loot.push(it);
    return it;
  }

  function freeTileIn(f, room, rng, nearWall) {
    for (var t = 0; t < 60; t++) {
      var x, y;
      if (nearWall && rng.chance(0.8)) {
        if (rng.chance(0.5)) { x = rng.chance(0.5) ? room.x : room.x + room.w - 1; y = rng.int(room.y, room.y + room.h - 1); }
        else { y = rng.chance(0.5) ? room.y : room.y + room.h - 1; x = rng.int(room.x, room.x + room.w - 1); }
      } else { x = rng.int(room.x, room.x + room.w - 1); y = rng.int(room.y, room.y + room.h - 1); }
      if (f.solid[y][x] !== 0) continue;
      var nearDoor = false;
      for (var i = 0; i < f.doors.length; i++) { var d = f.doors[i]; if (Math.abs(d.x - x) + Math.abs(d.y - y) <= 1) { nearDoor = true; break; } }
      if (!nearDoor) return { x: x, y: y };
    }
    return null;
  }

  // Door-graph BFS depth of each room from the exit rooms.
  // doorsOnly: objective placement counts EXIT DOORS only (windows are casing
  // entries, not the geometry the greed question is measured against).
  function roomDepths(f, doorsOnly) {
    var depth = {}, queue = [];
    for (var i = 0; i < f.doors.length; i++) {
      var d = f.doors[i];
      if (d.roomA === 0 || d.roomB === 0) {
        var r = d.roomA === 0 ? d.roomB : d.roomA;
        if (depth[r] === undefined) { depth[r] = 1; queue.push(r); }
      }
    }
    if (!doorsOnly) for (var w = 0; w < f.windows.length; w++) {
      var rw = f.windows[w].roomId;
      if (depth[rw] === undefined) { depth[rw] = 1; queue.push(rw); }
    }
    while (queue.length) {
      var cur = queue.shift(), room = f.rooms[cur - 1];
      for (var j = 0; j < room.doors.length; j++) {
        var dd = f.doors[room.doors[j]];
        var other = dd.roomA === cur ? dd.roomB : dd.roomA;
        if (other > 0 && depth[other] === undefined) { depth[other] = depth[cur] + 1; queue.push(other); }
      }
    }
    return depth;
  }

  // Furnish a room per its type template.
  function furnish(f, room, rng, arch, spec) {
    var t = room.type;
    var put = function (type, opts) { var p = freeTileIn(f, room, rng, true); if (p) return addFurn(f, p.x, p.y, type, opts); return null; };
    var lootHere = function (n, tagOverride) {
      var table = LB.LOOT_TABLE[t] || LB.LOOT_TABLE.default;
      for (var i = 0; i < n; i++) {
        var p = freeTileIn(f, room, rng, false);
        if (p) addLoot(f, p.x, p.y, rng.pick(table), tagOverride);
      }
    };
    if (t === 'bedroom') { put('bed'); put('wardrobe'); var c = freeTileIn(f, room, rng, true); if (c) addLight(f, c.x, c.y, 'candle'); lootHere(rng.int(1, 2)); }
    else if (t === 'parlor' || t === 'study' || t === 'office') { put('desk'); put('chair'); put('curtain'); lootHere(rng.int(1, 2)); }
    else if (t === 'kitchen' || t === 'pantry' || t === 'servants') { put('table'); if (rng.chance(0.6)) { var v = freeTileIn(f, room, rng, true); if (v) f.valves.push({ x: v.x, y: v.y, roomId: room.id, used: false }); } lootHere(1); }
    else if (t === 'gallery' || t === 'exhibits' || t === 'atrium') {
      put('pedestal'); if (arch.pedestals || rng.chance(0.5)) put('pedestal');
      if (rng.chance(0.5)) put('mirror', { facing: rng.int(0, 3) });
      lootHere(rng.int(1, 2));
    }
    else if (t === 'ballroom') { put('table'); put('curtain'); put('curtain'); lootHere(2); }
    else if (t === 'vaultroom' || t === 'strongroom' || t === 'lockup') { put('safe', { locked: true, quality: 2 }); lootHere(rng.int(1, 2)); }
    else if (t === 'floor' || t === 'loading') { put('crate'); put('crate'); put('crate'); lootHere(rng.int(1, 2)); }
    else if (t === 'hall' || t === 'lobby' || t === 'landing') { put('curtain'); if (rng.chance(0.4)) lootHere(1); }
    else lootHere(rng.chance(0.6) ? 1 : 0);
    if ((t === 'parlor' || t === 'study' || t === 'hall') && rng.chance(0.35)) put('fireplace');
    if (arch.crates && rng.chance(0.5)) put('crate');
    if ((arch.name === 'Manor' || arch.name === 'Gala Manor') && rng.chance(0.3)) put('dumbwaiter');
    // pressure chimes: manor/museum rugs
    if ((arch.name === 'Manor' || arch.name === 'Museum') && rng.chance(0.3)) {
      var rp = freeTileIn(f, room, rng, false);
      if (rp) { addFurn(f, rp.x, rp.y, 'rug'); f.chimes[rp.x + ',' + rp.y] = { revealed: false, tripped: false }; }
    }
  }

  function lightRoom(f, room, rng, arch, spec) {
    var bright = { ballroom: 3, atrium: 2, gallery: 2, lobby: 2, hall: 1, exhibits: 2 }[room.type];
    var n = bright || (room.w * room.h > 30 ? 2 : 1);
    if (room.type === 'pantry' || room.type === 'lockup' || room.type === 'strongroom') n = rng.chance(0.5) ? 1 : 0;
    for (var i = 0; i < n; i++) {
      var p = freeTileIn(f, room, rng, true);
      if (p) addLight(f, p.x, p.y, i === 0 ? 'lamp' : (rng.chance(0.6) ? 'lamp' : 'candle'));
    }
  }

  // Patrol loop: nearest-neighbour tour over target rooms' centers.
  function makePatrol(f, roomIds) {
    var pts = [], remaining = roomIds.slice();
    var cur = remaining.shift();
    pts.push({ x: Math.floor(f.rooms[cur - 1].cx) + 0.5, y: Math.floor(f.rooms[cur - 1].cy) + 0.5, roomId: cur });
    while (remaining.length) {
      var best = 0, bd = 1e9, c = pts[pts.length - 1];
      for (var i = 0; i < remaining.length; i++) {
        var r = f.rooms[remaining[i] - 1];
        var d = Math.abs(r.cx - c.x) + Math.abs(r.cy - c.y);
        if (d < bd) { bd = d; best = i; }
      }
      var rid = remaining.splice(best, 1)[0];
      pts.push({ x: Math.floor(f.rooms[rid - 1].cx) + 0.5, y: Math.floor(f.rooms[rid - 1].cy) + 0.5, roomId: rid });
    }
    return pts;
  }

  function pickGuardRoster(f, arch, spec, rng) {
    var actKey = 'A' + spec.act;
    var roster = (arch.guards[actKey] || arch.guards.A1 || arch.guards.A2 || []).slice();
    if (spec.big) roster.push(spec.act >= 2 ? 'sergeant' : 'watchman');
    var mul = 1;
    (spec.modifiers || []).forEach(function (m) { if (LB.MODIFIERS[m] && LB.MODIFIERS[m].guardMul) mul = LB.MODIFIERS[m].guardMul; });
    if (mul > 1) { roster.push(roster[0] || 'watchman'); }
    if (spec.garrison) for (var g = 0; g < spec.garrison; g++) roster.push(rng.pick(['watchman', 'pair', 'sergeant']));
    return roster;
  }

  function placeGuards(f, arch, spec, rng, depths) {
    var roster = pickGuardRoster(f, arch, spec, rng);
    var valuable = f.rooms.filter(function (r) { return ['vaultroom', 'strongroom', 'gallery', 'study', 'exhibits', 'ballroom', 'lockup', 'bedroom'].indexOf(r.type) >= 0; })
      .map(function (r) { return r.id; });
    var all = f.rooms.map(function (r) { return r.id; });
    if (!valuable.length) valuable = all.slice(0, 2);
    var patrolIdx = 0;
    roster.forEach(function (type) {
      var G = LB.GUARDS[type];
      if (!G) return;
      if (G.posted) {
        var room = f.rooms[rng.pick(valuable) - 1];
        var p = freeTileIn(f, room, rng, true) || { x: Math.floor(room.cx), y: Math.floor(room.cy) };
        if (type === 'sentry') addFurn(f, p.x, p.y, 'chair');
        f.solid[p.y][p.x] = 0;
        f.guards.push({ type: type, x: p.x + 0.5, y: p.y + 0.5, post: { x: p.x + 0.5, y: p.y + 0.5, facing: rng() * Math.PI * 2 } });
      } else if (G.civilian) {
        var cr = f.rooms[rng.pick(all) - 1];
        var cp = freeTileIn(f, cr, rng, false);
        if (cp) f.guards.push({ type: 'civilian', x: cp.x + 0.5, y: cp.y + 0.5, wander: cr.id });
      } else if (G.paired) {
        // deliberate gap: patrol covers valuable rooms but never ALL rooms
        var cover = rng.shuffle(valuable).slice(0, Math.max(2, valuable.length - 1));
        var wp = makePatrol(f, cover);
        f.guards.push({ type: 'pair', x: wp[0].x, y: wp[0].y, patrol: wp, lead: true, patrolId: patrolIdx });
        f.guards.push({ type: 'pair', x: wp[0].x, y: wp[0].y + 1, patrol: wp, lead: false, patrolId: patrolIdx });
        patrolIdx++;
      } else if (G.relights) {
        var lampRooms = {};
        f.lights.forEach(function (l) { if (l.type === 'lamp' && l.roomId > 0) lampRooms[l.roomId] = 1; });
        var lr = Object.keys(lampRooms).map(Number);
        if (!lr.length) lr = all.slice(0, 3);
        var wwp = makePatrol(f, rng.shuffle(lr).slice(0, Math.min(4, lr.length)));
        f.guards.push({ type: 'warden', x: wwp[0].x, y: wwp[0].y, patrol: wwp, patrolId: patrolIdx++ });
      } else if (G.dog) {
        var hr = rng.shuffle(all).slice(0, Math.min(3, all.length));
        var hwp = makePatrol(f, hr);
        f.guards.push({ type: 'hound', x: hwp[0].x, y: hwp[0].y, patrol: hwp, patrolId: patrolIdx });
        f.guards.push({ type: 'handler', x: hwp[0].x, y: hwp[0].y + 1, patrol: hwp, patrolId: patrolIdx });
        patrolIdx++;
      } else if (G.hunter || G.response) {
        f.guards.push({ type: type, spawnLater: true });
      } else {
        var cover2 = rng.shuffle(valuable.concat(rng.shuffle(all).slice(0, 2))).slice(0, Math.max(2, Math.min(4, valuable.length)));
        var wp2 = makePatrol(f, cover2);
        f.guards.push({ type: type, x: wp2[0].x, y: wp2[0].y, patrol: wp2, patrolId: patrolIdx++, erratic: !!G.erratic, wanderAll: all });
      }
    });
    if (spec.oldCopperFromStart) f.guards.push({ type: 'oldcopper', spawnLater: false, atStart: true });
  }

  // ---------- Procedural floor ----------
  LB.genFloor = function (spec) {
    var rng = LB.RNG(spec.seed);
    var arch = LB.ARCHETYPES[spec.archetype];
    var bw = spec.big ? Math.max(arch.w, 32) : arch.w, bh = spec.big ? Math.max(arch.h, 22) : arch.h;
    var W = bw + MARGIN * 2, H = bh + MARGIN * 2;
    var f = makeFloor(W, H);
    f.building = { x: MARGIN, y: MARGIN, w: bw, h: bh };
    f.archetype = spec.archetype; f.spec = spec; f.level = spec.level || 0;
    fillWalls(f, MARGIN, MARGIN, bw, bh);

    var leaves = [];
    bsp(f, rng, MARGIN + 1, MARGIN + 1, bw - 2, bh - 2, spec.big ? 4 : 3, leaves);

    // room types: shuffle archetype list over leaves (repeat as needed)
    var types = rng.shuffle(arch.rooms);
    leaves.forEach(function (rect, i) { addRoom(f, rect, types[i % types.length]); });

    // material per room
    f.rooms.forEach(function (r) {
      var mat = arch.material;
      if (r.type === 'kitchen' || r.type === 'pantry' || r.type === 'servants') mat = 'stone';
      if (r.type === 'bedroom' || r.type === 'study') mat = arch.material === 'marble' ? 'wood' : arch.material;
      for (var y = r.y; y < r.y + r.h; y++) for (var x = r.x; x < r.x + r.w; x++) f.material[y][x] = mat;
    });

    // door carving: adjacency runs between leaves, spanning tree + extras
    var runs = [];
    for (var a = 0; a < f.rooms.length; a++) for (var b = a + 1; b < f.rooms.length; b++) {
      var A = f.rooms[a], B = f.rooms[b], run = [];
      if (B.x === A.x + A.w + 1 || A.x === B.x + B.w + 1) {
        var wx = B.x === A.x + A.w + 1 ? A.x + A.w : B.x + B.w;
        var y0 = Math.max(A.y, B.y), y1 = Math.min(A.y + A.h, B.y + B.h);
        for (var yy = y0; yy < y1; yy++) run.push({ x: wx, y: yy });
      } else if (B.y === A.y + A.h + 1 || A.y === B.y + B.h + 1) {
        var wy = B.y === A.y + A.h + 1 ? A.y + A.h : B.y + B.h;
        var x0 = Math.max(A.x, B.x), x1 = Math.min(A.x + A.w, B.x + B.w);
        for (var xx = x0; xx < x1; xx++) run.push({ x: xx, y: wy });
      }
      if (run.length) runs.push({ a: A.id, b: B.id, run: run });
    }
    var parent = {};
    var find = function (x) { while (parent[x] !== undefined && parent[x] !== x) x = parent[x]; return x; };
    f.rooms.forEach(function (r) { parent[r.id] = r.id; });
    rng.shuffle(runs).forEach(function (rr) {
      var ra = find(rr.a), rb = find(rr.b);
      var p = rng.pick(rr.run);
      if (ra !== rb) {
        parent[ra] = rb;
        addDoor(f, p.x, p.y, rr.a, rr.b, { open: rng.chance(0.7), locked: false });
      } else if (rng.chance(0.3)) {
        addDoor(f, p.x, p.y, rr.a, rr.b, { open: rng.chance(0.5), locked: arch.qualityLocks && rng.chance(0.3), quality: arch.qualityLocks ? 1 : 0 });
      }
    });

    // exterior: front door (south wall) + windows on outer rooms
    var southRooms = f.rooms.filter(function (r) { return r.y + r.h === MARGIN + bh - 1; });
    var front = rng.pick(southRooms.length ? southRooms : f.rooms);
    var fdx = LB.M.clamp(Math.floor(front.cx), front.x, front.x + front.w - 1);
    var frontDoor = addDoor(f, fdx, MARGIN + bh - 1, 0, front.id, { open: false, exit: true, bell: arch.qualityLocks && rng.chance(0.4) });
    f.exits.push({ x: fdx, y: MARGIN + bh - 1, kind: 'door', doorId: frontDoor.id });
    var extraWin = 0;
    (spec.modifiers || []).forEach(function (m) { if (LB.MODIFIERS[m] && LB.MODIFIERS[m].extraWindows) extraWin = LB.MODIFIERS[m].extraWindows; });
    f.rooms.forEach(function (r) {
      var sides = [];
      if (r.x === MARGIN + 1) sides.push({ x: MARGIN, y: Math.floor(r.cy) });
      if (r.x + r.w === MARGIN + bw - 1) sides.push({ x: MARGIN + bw - 1, y: Math.floor(r.cy) });
      if (r.y === MARGIN + 1) sides.push({ x: Math.floor(r.cx), y: MARGIN });
      if (r.y + r.h === MARGIN + bh - 1 && r.id !== front.id) sides.push({ x: Math.floor(r.cx), y: MARGIN + bh - 1 });
      var wn = (arch.name === 'Counting House' ? (rng.chance(0.3) ? 1 : 0) : rng.chance(0.75) ? 1 : 0) + (extraWin > 0 ? 1 : 0);
      if (extraWin > 0) extraWin--;
      rng.shuffle(sides).slice(0, wn).forEach(function (s) {
        if (f.doors.some(function (d) { return d.x === s.x && d.y === s.y; })) return;
        addWindow(f, s.x, s.y, r.id);
      });
    });
    // guarantee at least 2 entries total
    if (f.windows.length === 0) {
      var wr = f.rooms.find(function (r) { return r.x === MARGIN + 1; }) || f.rooms[0];
      addWindow(f, MARGIN, Math.floor(wr.cy), wr.id);
    }

    // lights + furnishing + creaks
    f.rooms.forEach(function (r) { lightRoom(f, r, rng, arch, spec); furnish(f, r, rng, arch, spec); });
    var noMoon = (spec.modifiers || []).some(function (m) { return LB.MODIFIERS[m] && LB.MODIFIERS[m].noMoon; });
    if (!noMoon) {
      f.windows.forEach(function (wd) {
        if (rng.chance(0.5)) {
          var dx = wd.x === MARGIN ? 1 : wd.x === MARGIN + bw - 1 ? -1 : 0;
          var dy = wd.y === MARGIN ? 1 : wd.y === MARGIN + bh - 1 ? -1 : 0;
          f.moonQuads.push({ x: wd.x + dx, y: wd.y + dy, w: dx ? 3 : 2, h: dy ? 3 : 2 });
        }
      });
      if (arch.skylights) f.rooms.forEach(function (r) {
        if ((r.type === 'gallery' || r.type === 'atrium') && rng.chance(0.7))
          f.moonQuads.push({ x: Math.floor(r.cx) - 1, y: Math.floor(r.cy) - 1, w: 3, h: 3 });
      });
    }
    for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++)
      if (f.material[y2][x2] === 'wood' && f.roomId[y2][x2] > 0 && !f.solid[y2][x2] && rng.chance(0.08))
        f.creaks[x2 + ',' + y2] = true;

    // electric zones modifier
    var elecZones = 0;
    (spec.modifiers || []).forEach(function (m) { if (LB.MODIFIERS[m] && LB.MODIFIERS[m].electricZones) elecZones = LB.MODIFIERS[m].electricZones; });
    if (elecZones) rng.shuffle(f.rooms).slice(0, elecZones).forEach(function (r) {
      f.lights.forEach(function (l) { if (l.roomId === r.id && l.type === 'lamp') { l.electric = true; l.gas = false; } });
      r.electric = true;
    });

    // objective: deepest room by EXIT-DOOR depth (§2.5 — greed geometry enforced)
    var depths = roomDepths(f);
    var doorDepths = roomDepths(f, true);
    var deepest = f.rooms[0], dbest = -1;
    f.rooms.forEach(function (r) { var d = doorDepths[r.id] || 0; if (d > dbest) { dbest = d; deepest = r; } });
    f.objectiveRoomId = deepest.id; f.objectiveDepth = dbest;
    // no window-in-window-out vault raids (red-team §Phase 2): strip objective-room windows
    f.windows = f.windows.filter(function (wd) {
      if (wd.roomId !== deepest.id) return true;
      delete f.windowAt[wd.x + ',' + wd.y];
      return false;
    });
    f.windows.forEach(function (wd, i) { wd.id = i; });
    if (f.windows.length === 0) { // still guarantee a second entry, away from the vault
      var wr2 = f.rooms.find(function (r) { return r.id !== deepest.id && r.x === MARGIN + 1; }) ||
                f.rooms.find(function (r) { return r.id !== deepest.id; });
      if (wr2) addWindow(f, wr2.x === MARGIN + 1 ? MARGIN : Math.floor(wr2.cx), wr2.x === MARGIN + 1 ? Math.floor(wr2.cy) : (wr2.y === MARGIN + 1 ? MARGIN : MARGIN + bh - 1), wr2.id);
    }
    var quotaSpot = freeTileIn(f, deepest, rng, false) || { x: Math.floor(deepest.cx), y: Math.floor(deepest.cy) };
    f.quotaLoot = addLoot(f, quotaSpot.x, quotaSpot.y, ['the client’s prize', 1, spec.fee ? Math.floor(spec.fee / 2) : 80, 'quiet']);
    f.quotaLoot.quota = true;
    if (spec.score) {
      var scoreRooms = f.rooms.filter(function (r) { return ['gallery', 'exhibits', 'ballroom', 'study', 'vaultroom', 'atrium', 'floor'].indexOf(r.type) >= 0 && r.id !== deepest.id; });
      var sroom = scoreRooms.length ? rng.pick(scoreRooms) : deepest;
      var sp = freeTileIn(f, sroom, rng, false) || { x: Math.floor(sroom.cx), y: Math.floor(sroom.cy) };
      addFurn(f, sp.x, sp.y, 'pedestal');
      var sl = addLoot(f, sp.x, sp.y - 1 >= 0 && !f.solid[sp.y - 1][sp.x] ? sp.y - 1 : sp.y, ['', 1, 0], 'famous', spec.score);
      if (f.solid[sl.y] && f.solid[sl.y][sl.x]) { sl.x = sp.x; sl.y = sp.y; f.solid[sp.y][sp.x] = 2; }
      f.scoreLoot = sl;
      if (spec.score.lit) addLight(f, LB.M.clamp(sp.x + 1, sroom.x, sroom.x + sroom.w - 1), sp.y, 'candle');
    }

    // spawn + cart on the perimeter near a corner
    f.spawn = { x: 1.5, y: H - 2.5 };
    f.cart = { x: 2.5, y: H - 1.5, banked: [], value: 0 };
    // loot must stay reachable: furniture (crates) can seal a piece in — flood
    // from the spawn (windows count as climbable crossings) and relocate strays.
    (function () {
      var reach = {};
      var q = [[Math.floor(f.spawn.x), Math.floor(f.spawn.y)]];
      reach[q[0][0] + ',' + q[0][1]] = true;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      while (q.length) {
        var c = q.pop();
        for (var d = 0; d < 4; d++) {
          var nx = c[0] + dirs[d][0], ny = c[1] + dirs[d][1];
          if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
          if (f.solid[ny][nx] === 1) { // windows are climbable: hop to the far side
            var wd = f.windowAt[nx + ',' + ny];
            if (wd) {
              var fx = nx + dirs[d][0], fy = ny + dirs[d][1];
              if (fx >= 0 && fy >= 0 && fx < f.w && fy < f.h && f.solid[fy][fx] === 0 && !reach[fx + ',' + fy]) {
                reach[fx + ',' + fy] = true; q.push([fx, fy]);
              }
            }
            continue;
          }
          if (f.solid[ny][nx] !== 0) continue;
          if (reach[nx + ',' + ny]) continue;
          reach[nx + ',' + ny] = true; q.push([nx, ny]);
        }
      }
      var reachableAdj = function (x, y) {
        if (reach[x + ',' + y]) return true;
        for (var d2 = 0; d2 < 4; d2++) if (reach[(x + dirs[d2][0]) + ',' + (y + dirs[d2][1])]) return true;
        return false;
      };
      f.loot.forEach(function (l) {
        if (reachableAdj(l.x, l.y)) return;
        var room = f.rooms[(f.roomId[l.y] && f.roomId[l.y][l.x]) - 1];
        var moved = false;
        var tryRoom = function (r) {
          if (!r || moved) return;
          for (var yy = r.y; yy < r.y + r.h && !moved; yy++) for (var xx = r.x; xx < r.x + r.w && !moved; xx++)
            if (f.solid[yy][xx] === 0 && reach[xx + ',' + yy]) { l.x = xx; l.y = yy; moved = true; }
        };
        tryRoom(room);
        if (!moved) f.rooms.forEach(tryRoom);
      });
    })();
    placeGuards(f, arch, spec, rng, depths);
    f.depths = depths;
    return f;
  };

  // Depth guarantee: reroll flat layouts (deterministic per seed) so the vault
  // is never one door from the street.
  var genFloorOnce = LB.genFloor;
  LB.genFloor = function (spec) {
    var best = null;
    for (var att = 0; att < 5; att++) {
      var f = genFloorOnce(att === 0 ? spec : Object.assign({}, spec, { seed: (spec.seed || 1) + att * 104729 }));
      if (!best || f.objectiveDepth > best.objectiveDepth) best = f;
      if (best.objectiveDepth >= 2) break;
    }
    return best;
  };

  // ---------- Big Job dressing (§2.6) ----------
  LB.genBigJob = function (spec) {
    var f0 = LB.genFloor(Object.assign({}, spec, { big: true, level: 0 }));
    var f1 = LB.genFloor(Object.assign({}, spec, { seed: spec.seed + 7717, big: true, level: 1 }));
    // two linked staircases at matched positions (both floors guaranteed in-building)
    var placed = 0;
    for (var t = 0; t < 200 && placed < 2; t++) {
      var rng = LB.RNG(spec.seed + t);
      var x = rng.int(f0.building.x + 2, Math.min(f0.building.x + f0.building.w, f1.building.x + f1.building.w) - 3);
      var y = rng.int(f0.building.y + 2, Math.min(f0.building.y + f0.building.h, f1.building.y + f1.building.h) - 3);
      if (!f0.solid[y][x] && !f1.solid[y][x] && f0.roomId[y][x] > 0 && f1.roomId[y][x] > 0) {
        f0.stairs.push({ x: x, y: y, to: 1 }); f1.stairs.push({ x: x, y: y, to: 0 });
        placed++;
      }
    }
    var floors = [f0, f1];
    if (spec.bigKind === 'counting') {
      // 3 key-holders patrol independently; vault needs 3 keys (or crack 3 side-safes for copies)
      f1.quotaLoot.vaulted = true;
      var vroom = f1.rooms[f1.objectiveRoomId - 1];
      vroom.type = 'vaultroom'; f1.vault = { roomId: vroom.id, keysNeeded: 3 };
      var vd = vroom.doors.map(function (i) { return f1.doors[i]; });
      vd.forEach(function (d) { d.locked = true; d.open = false; d.quality = 3; d.timelock = true; });
      for (var k = 0; k < 3; k++) {
        var host = floors[k % 2];
        var rr = LB.RNG(spec.seed + 31 * k);
        var all = host.rooms.map(function (r) { return r.id; });
        var wp = makePatrol(host, rr.shuffle(all).slice(0, 3));
        host.guards.push({ type: 'watchman', x: wp[0].x, y: wp[0].y, patrol: wp, keyholder: k + 1, patrolId: 90 + k });
        var sr = host.rooms[rr.pick(all) - 1];
        var sp = freeTileIn(host, sr, rr, true);
        if (sp) { var s = addFurn(host, sp.x, sp.y, 'safe', { locked: true, quality: 2 }); s.keyCopy = k + 1; }
      }
    } else if (spec.bigKind === 'gala') {
      f0.disguise = true; f1.disguise = true;
      var ball = f0.rooms.find(function (r) { return r.type === 'ballroom'; }) || f0.rooms[0];
      for (var c = 0; c < 5; c++) {
        var rg = LB.RNG(spec.seed + 100 + c);
        var cp = freeTileIn(f0, ball, rg, false);
        if (cp) f0.guards.push({ type: 'civilian', x: cp.x + 0.5, y: cp.y + 0.5, wander: ball.id });
      }
      addLight(f0, Math.floor(ball.cx), Math.floor(ball.cy) - 1, 'lamp', { r: 5 }); // the brightest pool
    } else if (spec.bigKind === 'archive') {
      floors.forEach(function (fl) { fl.guards.push({ type: 'oldcopper', atStart: true }); });
    }
    return floors;
  };

  // ---------- THE GLOVER HOUSE — fixed authored A1J1 seed (§3.2 beats 1–8) ----------
  LB.genGloverHouse = function () {
    var W = 28, H = 20, O = MARGIN; // building 22x14 at offset 3
    var f = makeFloor(W, H);
    f.building = { x: O, y: O, w: 22, h: 14 };
    f.archetype = 'townhouse'; f.level = 0; f.authored = true;
    f.spec = { archetype: 'townhouse', act: 1, big: false, modifiers: [], seed: 1889 };
    fillWalls(f, O, O, 22, 14);
    var bx = function (x) { return O + x; }, by = function (y) { return O + y; };
    // interior walls (building coords). Rooms: parlor / hallNorth / study / bedroom / vestibule / hallSouth
    var wallRects = [
      { x: 5, y: 1, w: 1, h: 8 },   // parlor | hallNorth
      { x: 10, y: 1, w: 1, h: 8 },  // hallNorth | study+bedroom
      { x: 11, y: 4, w: 11, h: 1 }, // study | bedroom
      { x: 1, y: 8, w: 5, h: 1 },   // parlor | vestibule
      { x: 6, y: 8, w: 16, h: 1 },  // north rooms | hallSouth
      { x: 5, y: 9, w: 1, h: 5 },   // vestibule | hallSouth
      { x: 11, y: 8, w: 1, h: 0 }
    ];
    wallRects.forEach(function (r) { for (var y = r.y; y < r.y + Math.max(r.h, 1); y++) for (var x = r.x; x < r.x + Math.max(r.w, 1); x++) if (r.w && r.h) f.solid[by(y)][bx(x)] = 1; });
    var parlor = addRoom(f, { x: bx(1), y: by(1), w: 4, h: 7 }, 'parlor');
    var hallN = addRoom(f, { x: bx(6), y: by(1), w: 4, h: 7 }, 'hall');
    var study = addRoom(f, { x: bx(11), y: by(1), w: 10, h: 3 }, 'study');
    var bedroom = addRoom(f, { x: bx(11), y: by(5), w: 10, h: 3 }, 'bedroom');
    var vestibule = addRoom(f, { x: bx(1), y: by(9), w: 4, h: 4 }, 'hall');
    var hallS = addRoom(f, { x: bx(6), y: by(9), w: 15, h: 4 }, 'hall');
    // materials: wood everywhere (townhouse), no creaks in J1 (creaks debut J2)
    f.rooms.forEach(function (r) { for (var y = r.y; y < r.y + r.h; y++) for (var x = r.x; x < r.x + r.w; x++) f.material[y][x] = 'wood'; });
    // doors
    addDoor(f, bx(5), by(4), parlor.id, hallN.id, { open: true });               // parlor <-> hallN
    addDoor(f, bx(10), by(2), hallN.id, study.id, { open: true });               // hallN <-> study
    addDoor(f, bx(10), by(6), hallN.id, bedroom.id, { open: false });            // hallN <-> bedroom
    addDoor(f, bx(7), by(8), hallN.id, hallS.id, { open: true });                // hallN <-> hallS
    addDoor(f, bx(5), by(11), vestibule.id, hallS.id, { open: true });           // vestibule <-> hallS
    var fd = addDoor(f, bx(11), by(13), 0, hallS.id, { open: false, exit: true }); // FRONT DOOR (moonlit — hostile)
    f.exits.push({ x: bx(11), y: by(13), kind: 'door', doorId: fd.id });
    // Beat 1–2: side window into the vestibule; moon quad you MUST cross
    addWindow(f, bx(0), by(11), vestibule.id);
    f.moonQuads.push({ x: bx(1), y: by(9), w: 2, h: 4 });      // vestibule entry moonlight
    f.moonQuads.push({ x: bx(10), y: by(14), w: 3, h: 2 });    // front-door outside pool (obviously hostile)
    // Beat 3: ONE lamp lights the only corridor (hallS); shadow route exists only if snuffed
    addLight(f, bx(10), by(10), 'lamp');
    // Beat 6: study lamp near the ledger desk — fine work needs it lit
    addLight(f, bx(15), by(1), 'lamp');
    addLight(f, bx(1), by(1), 'candle');   // parlor corner candle
    addLight(f, bx(12), by(5), 'candle');  // bedroom candle
    // furniture
    addFurn(f, bx(17), by(2), 'desk', { locked: true, quality: 0 });   // the Glover ledger desk
    addFurn(f, bx(2), by(2), 'chair');
    addFurn(f, bx(1), by(6), 'curtain');
    addFurn(f, bx(19), by(5), 'wardrobe');
    addFurn(f, bx(16), by(6), 'bed');
    addFurn(f, bx(14), by(12), 'curtain');
    addFurn(f, bx(2), by(4), 'chair'); // sentry's chair
    // loot
    f.quotaLoot = addLoot(f, bx(17), by(2), ['the Glover ledger', 1, 60, 'quiet']);
    f.quotaLoot.quota = true; f.quotaLoot.inDesk = true;
    addLoot(f, bx(2), by(6), ['silver candlesticks', 1, 40, 'quiet']);
    addLoot(f, bx(14), by(11), ['umbrella stand silver', 1, 30, 'quiet']);
    addLoot(f, bx(18), by(6), ['jewelry box', 1, 90, 'attended']);
    // guards: 1 watchman loop (hallS lamp pool -> hallN -> study), 1 sentry (parlor, facing the hallN door)
    f.guards.push({ type: 'watchman', x: bx(11) + 0.5, y: by(10) + 0.5, patrolId: 0, patrol: [
      { x: bx(13) + 0.5, y: by(10) + 0.5, roomId: hallS.id },
      { x: bx(7) + 0.5, y: by(11) + 0.5, roomId: hallS.id },
      { x: bx(7) + 0.5, y: by(5) + 0.5, roomId: hallN.id },
      { x: bx(8) + 0.5, y: by(2) + 0.5, roomId: hallN.id },
      { x: bx(15) + 0.5, y: by(2) + 0.5, roomId: study.id },
      { x: bx(8) + 0.5, y: by(2) + 0.5, roomId: hallN.id },
      { x: bx(7) + 0.5, y: by(8) + 0.5, roomId: hallN.id }
    ] });
    f.guards.push({ type: 'sentry', x: bx(2) + 0.5, y: by(4) + 0.5, post: { x: bx(2) + 0.5, y: by(4) + 0.5, facing: 0 } });
    // objective + spawn + cart (Beat 8: cart at the entry point)
    f.objectiveRoomId = study.id;
    var depths = roomDepths(f);
    f.depths = depths; f.objectiveDepth = depths[study.id] || 2;
    f.spawn = { x: 1.5, y: by(11) + 0.5 };
    f.cart = { x: 1.5, y: by(12) + 0.5, banked: [], value: 0 };
    f.gloverBeats = true; // teach.js keys A1J1 triggers off this
    return f;
  };

  LB.roomDepths = roomDepths;
  LB.genHelpers = { addDoor: addDoor, addLight: addLight, addFurn: addFurn, addLoot: addLoot, makePatrol: makePatrol };
})();

if (typeof module !== 'undefined') module.exports = LB;
