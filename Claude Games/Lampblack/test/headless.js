'use strict';
// LAMPBLACK — headless verification (DESIGN §2.5 verification note).
// Gen asserts + sim invariants + AI soak + probe bot AS LOCALIZER (never judge)
// + teaching gates + DOM input-plumbing (feedback_verify_input_plumbing).
// Run: node test/headless.js
var fs = require('fs'), path = require('path'), vm = require('vm');

var ROOT = path.join(__dirname, '..');
var FILES = ['core.js', 'content.js', 'gen.js', 'sim.js', 'guards.js', 'player.js', 'run.js', 'teach.js', 'audio.js', 'art.js', 'render.js', 'main.js'];

var passed = 0, failed = 0, failures = [];
function assert(cond, msg) {
  if (cond) { passed++; return true; }
  failed++;
  if (failures.length < 60) failures.push(msg);
  return false;
}
function section(name) { console.log('\n== ' + name + ' =='); }

// ---------- load logic context (no window: main.js self-skips) ----------
function logicContext() {
  var ctx = vm.createContext({ console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    Math: Math, Date: Date, JSON: JSON });
  FILES.forEach(function (f) {
    var src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  });
  return ctx;
}

var G = logicContext();
var LB = G.LB;
section('module load');
assert(!!LB && !!LB.C && !!LB.PAL, 'LB namespace loads');
assert(Object.keys(LB.GUARDS).length === 10, '10 guard types (got ' + Object.keys(LB.GUARDS).length + ')');
assert(LB.TOOL_KEYS.length === 8, '8 tools');
LB.TOOL_KEYS.forEach(function (k) { assert(LB.TOOLS[k].tiers.length === 3 && LB.TOOLS[k].desc.length === 3, k + ' has 3 named tiers'); });
assert(Object.keys(LB.TRICKS).length === 12, '12 tricks');
assert(Object.keys(LB.LOADOUTS).length === 3, '3 loadouts');
assert(Object.keys(LB.ARCHETYPES).length === 6, '6 archetypes');
assert(LB.DISTRICTS.length === 5, '5 districts');
assert(LB.SCORES.length === 10, '10 named Scores');
assert(Object.keys(LB.MODIFIERS).length === 11, '11 job modifiers (incl. The Other Shadow)');
assert(LB.ACCOLADES.length === 7, '7 ledger accolades');
assert(Object.keys(LB.NOTES).length >= 30, '>=30 Magpie notes (got ' + Object.keys(LB.NOTES).length + ')');
Object.keys(LB.NOTES).forEach(function (k) {
  assert(LB.NOTES[k].split(/\s+/).length <= 12, 'note "' + k + '" is <=12 words');
});
assert(LB.C.LEITMOTIF.join(',') === 'D5,F5,E5,A4,D5', 'leitmotif is [D5 F5 E5 A4 D5]');
assert(Math.abs(LB.noteHz('D5') - 587.33) < 0.5, 'D5 = 587.33Hz');
assert(Math.abs(LB.noteHz('A4') - 440) < 0.01, 'A4 = 440Hz');
// Magpie pool counts (§4.7 commitments)
assert(Object.keys(LB.MAGPIE.appraisals).length === 10, '10 Score appraisals');
assert(LB.MAGPIE.shadowHints.length === 6, '6 Other Shadow hints');
assert(LB.MAGPIE.needles.length === 8, '8 needle lines');
assert(Object.keys(LB.MAGPIE.warnings).length === 12, '12 listing warnings');
var greetCount = 0; Object.keys(LB.MAGPIE.greetings).forEach(function (k) { greetCount += LB.MAGPIE.greetings[k].length; });
assert(greetCount === 8, '8 greetings across keys (got ' + greetCount + ')');

// ---------- audio graceful degradation ----------
section('audio (no AudioContext)');
var audio = LB.Audio();
assert(audio.init() === false, 'audio.init returns false without AudioContext');
var threw = false;
try { audio.play('snuff_fwip', {}); audio.setStage(2); audio.playLeitmotif({}, true); } catch (e) { threw = true; }
assert(!threw, 'audio calls are safe when uninitialized');
assert(Object.keys(audio.recipes).length >= 40, '>=40 named recipes for the soundboard (got ' + Object.keys(audio.recipes).length + ')');

// ---------- art construction rules ----------
section('art');
LB.Art.init();
assert(LB.Art.legFrame(0) === 0 && LB.Art.legFrame(Math.PI / 4 + 0.01) === 1, '8-frame discrete snapping');
assert(LB.Art.legFrame(2 * Math.PI - 0.01) === 7, 'frame 7 before wrap');
assert(LB.C.WALK_CAD === 0.05 && LB.C.CREEP_CAD === 0.03 && LB.C.SPRINT_CAD === 0.085, 'named cadence constants');
assert(Object.keys(LB.Art.guards).length === 11, '11 guard sprite bakes (10 types + handler)');
assert(Object.keys(LB.Art.magpie).length === 3, 'Magpie 3 expressions');

// ---------- Glover House (authored A1J1, §3.2) ----------
section('The Glover House');
var glover = LB.genGloverHouse();
assert(glover.authored === true && glover.gloverBeats === true, 'authored flag set');
assert(glover.rooms.length === 6, '6 rooms (got ' + glover.rooms.length + ')');
assert(glover.windows.length >= 1, 'side window exists (beat 1)');
assert(glover.moonQuads.length === 2, 'vestibule moon quad + front-door pool (beat 2)');
assert(glover.guards.filter(function (g) { return g.type === 'watchman'; }).length === 1, '1 watchman');
assert(glover.guards.filter(function (g) { return g.type === 'sentry'; }).length === 1, '1 sentry (beat 5)');
assert(glover.quotaLoot && glover.quotaLoot.quota && glover.quotaLoot.inDesk, 'ledger quota in the desk (beat 6)');
assert(glover.loot.some(function (l) { return l.tag === 'attended'; }), 'attended loot present (jewelry)');
assert(Object.keys(glover.creaks).length === 0, 'no creaks in J1 (creaks debut J2)');
var hallLamp = glover.lights.find(function (l) { return l.type === 'lamp' && l.y === 13; });
assert(!!hallLamp, 'the ONE hall lamp exists (beat 3)');
var wm = glover.guards.find(function (g) { return g.type === 'watchman'; });
assert(wm.patrol.some(function (p) { return Math.abs(p.x - (hallLamp.x + 0.5)) < 4 && Math.abs(p.y - (hallLamp.y + 0.5)) < 2; }),
  'watchman loop crosses the hall lamp pool (beat 3/4)');
var gsim = LB.Sim([glover], { act: 1, modifiers: [] }, LB.Bus());
var inPool = gsim.lightAt(hallLamp.x + 1, hallLamp.y);
assert(inPool > 0.3, 'hall corridor lit while lamp on (l=' + inPool.toFixed(2) + ')');
gsim.snuffLight(hallLamp, true);
var afterSnuff = gsim.lightAt(hallLamp.x + 1, hallLamp.y);
assert(afterSnuff < 0.15, 'snuffed -> corridor dark (l=' + afterSnuff.toFixed(2) + ') — shadow route only if snuffed');
assert(gsim.evidence.some(function (e) { return e.kind === 'dousedLamp'; }), 'player snuff leaves evidence');
gsim.relight(hallLamp);
assert(gsim.lightAt(hallLamp.x + 1, hallLamp.y) > 0.3, 'warden relight restores the pool');
assert(gsim.evidence.length === 0, 'relight clears the doused evidence');
hallLamp.gloomed = true; gsim.snuffLight(hallLamp, true);
assert(gsim.relight(hallLamp) === false, 'Gloom Oil T3: cannot be relit');
// study desk needs light (beat 6): lamp near desk on -> l>=0.3 at desk; snuffed -> below
var glover2 = LB.genGloverHouse();
var gsim2 = LB.Sim([glover2], {}, LB.Bus());
var deskL = gsim2.lightAt(glover2.quotaLoot.x, glover2.quotaLoot.y);
assert(deskL >= LB.C.FINE_WORK_L, 'desk lit for fine work while study lamp on (l=' + deskL.toFixed(2) + ')');
var studyLamp = glover2.lights.find(function (l) { return l.type === 'lamp' && l.y === 4; });
gsim2.snuffLight(studyLamp, true);
assert(gsim2.lightAt(glover2.quotaLoot.x, glover2.quotaLoot.y) < LB.C.FINE_WORK_L, 'snuffed study -> too dark for fine work (beat 6 lock)');

// ---------- procedural gen sweep (§2.5 asserts) ----------
section('gen sweep');
var archKeys = Object.keys(LB.ARCHETYPES).filter(function (k) { return !LB.ARCHETYPES[k].bigOnly; });
var genFailures = 0;
for (var seed = 1; seed <= 40; seed++) {
  var arch = archKeys[seed % archKeys.length];
  var act = 1 + (seed % 3);
  var spec = { archetype: arch, act: act, seed: seed * 7919, modifiers: seed % 4 === 0 ? ['fog'] : [], fee: 100 };
  var f;
  try { f = LB.genFloor(spec); } catch (e) { assert(false, 'gen threw seed ' + seed + ' ' + arch + ': ' + e.message); genFailures++; continue; }
  var tag = arch + '#' + seed;
  // connectivity: every room has a depth from entries
  var orphan = f.rooms.filter(function (r) { return f.depths[r.id] === undefined; });
  if (!assert(orphan.length === 0, tag + ': all rooms reachable via door graph (' + orphan.length + ' orphans)')) genFailures++;
  assert(f.exits.length + f.windows.length >= 2, tag + ': >=2 entries');
  assert(f.objectiveDepth >= 2, tag + ': objective at door-depth >= 2 (got ' + f.objectiveDepth + ')');
  assert(f.lights.length >= f.rooms.length * 0.4, tag + ': lights seeded');
  assert(f.guards.length >= 2, tag + ': guards seeded');
  // guards spawn on walkable tiles
  f.guards.forEach(function (gs) {
    if (gs.spawnLater || gs.x === undefined) return;
    var s = f.solid[Math.floor(gs.y)][Math.floor(gs.x)];
    assert(s !== 1, tag + ': guard ' + gs.type + ' not in a wall');
  });
  // no unreachable loot: path from spawn to a tile adjacent to each loot (locks pickable => doors passable)
  var simF = LB.Sim([f], spec, LB.Bus());
  var blockedFn = function (x, y) {
    if (f.solid[y][x] === 1) return !f.windowAt[x + ',' + y]; // player can climb windows
    if (f.solid[y][x] === 2) return true;
    return false; // any door is ultimately openable/pickable/forceable
  };
  var lootFail = 0;
  f.loot.forEach(function (l) {
    var ok = false;
    var dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var d = 0; d < dirs.length && !ok; d++) {
      var tx = l.x + dirs[d][0], ty = l.y + dirs[d][1];
      if (tx < 0 || ty < 0 || tx >= f.w || ty >= f.h || blockedFn(tx, ty)) continue;
      if (LB.astar(f.w, f.h, blockedFn, f.spawn.x, f.spawn.y, tx + 0.5, ty + 0.5)) ok = true;
    }
    if (!ok) lootFail++;
  });
  if (!assert(lootFail === 0, tag + ': no unreachable loot (' + lootFail + ' unreachable)')) genFailures++;
  // shadow-route existence: A* biased away from light still reaches the quota
  // (adjacent tile — the objective room center may hold furniture)
  var ql = f.quotaLoot, qTarget = null;
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d2) {
    var tx = ql.x + d2[0], ty = ql.y + d2[1];
    if (tx >= 0 && ty >= 0 && tx < f.w && ty < f.h && !blockedFn(tx, ty)) { qTarget = { x: tx + 0.5, y: ty + 0.5 }; return true; }
    return false;
  });
  var sr = qTarget && LB.astar(f.w, f.h, blockedFn, f.spawn.x, f.spawn.y, qTarget.x, qTarget.y,
    function (x, y) { return simF.lightAt(x, y) * 3; });
  if (assert(!!sr, tag + ': shadow route to objective exists')) {
    var meanL = 0; sr.forEach(function (p) { meanL += simF.lightAt(p.x, p.y); }); meanL /= sr.length;
    assert(meanL <= 0.55, tag + ': shadow route not floodlit (mean l=' + meanL.toFixed(2) + ')');
  }
  // patrol waypoints walkable
  f.guards.forEach(function (gs) {
    if (!gs.patrol) return;
    gs.patrol.forEach(function (wp) {
      assert(f.solid[Math.floor(wp.y)][Math.floor(wp.x)] !== 1, tag + ': patrol waypoint walkable');
    });
  });
}

// big jobs: 2 floors, both stairs usable
section('big jobs');
['counting', 'gala', 'archive'].forEach(function (kind, i) {
  var spec = { archetype: kind === 'counting' ? 'bank' : kind === 'gala' ? 'gala' : 'museum',
    act: i + 1, seed: 4242 + i, big: true, bigKind: kind, modifiers: [], fee: 500,
    garrison: kind === 'archive' ? 3 : 0, oldCopperFromStart: kind === 'archive' };
  var floors = LB.genBigJob(spec);
  assert(floors.length === 2, kind + ': 2 floors');
  assert(floors[0].stairs.length === 2 && floors[1].stairs.length === 2, kind + ': both staircases placed');
  floors[0].stairs.forEach(function (s) {
    assert(floors[0].solid[s.y][s.x] === 0 && floors[1].solid[s.y][s.x] === 0, kind + ': stair usable on BOTH floors');
  });
  if (kind === 'counting') {
    var keyholders = floors[0].guards.concat(floors[1].guards).filter(function (g) { return g.keyholder; });
    assert(keyholders.length === 3, 'counting: 3 key-holders (got ' + keyholders.length + ')');
    var keySafes = floors[0].furniture.concat(floors[1].furniture).filter(function (fu) { return fu.keyCopy; });
    assert(keySafes.length === 3, 'counting: 3 side-safes with key copies');
    var vd = floors[1].doors.filter(function (d) { return d.timelock; });
    assert(vd.length >= 1, 'counting: timelock vault doors exist');
  }
  if (kind === 'archive') {
    assert(floors[0].guards.some(function (g) { return g.type === 'oldcopper' && g.atStart; }), 'archive: Old Copper from minute 0');
  }
  if (kind === 'gala') {
    assert(floors[0].disguise === true, 'gala: disguise entry state');
    assert(floors[0].guards.filter(function (g) { return g.type === 'civilian'; }).length >= 4, 'gala: crowd present');
  }
});

// ---------- sound propagation (§2.1.3) ----------
section('sound: door-graph BFS');
(function () {
  var f = LB.genGloverHouse();
  var s = LB.Sim([f], {}, LB.Bus());
  // adjacent rooms: study (source, 2.5 tiles from the door) -> hallN listener
  // door hallN<->study sits at map (13,5); source (15.5,5.5); listener (11.5,5.5)
  f.doors.forEach(function (d) { d.open = true; });
  var open = s.propagate(15.5, 5.5, 8).at(11.5, 5.5);
  f.doors.forEach(function (d) { d.open = false; });
  var closed = s.propagate(15.5, 5.5, 8).at(11.5, 5.5);
  assert(open > closed, 'closed doors muffle (open=' + open.toFixed(2) + ' closed=' + closed.toFixed(2) + ')');
  assert(closed < open * 0.5, 'closed-door attenuation is strong (x0.25 vs x0.7)');
  f.doors.forEach(function (d) { d.open = true; });
  var sameRoom = s.propagate(15.5, 5.5, 8).at(17.5, 5.5);
  assert(sameRoom > open, 'louder in the source room than through doors');
  // ring data: propagation records reached rooms for the render clip
  var ev = s.emitSound(15.5, 5.5, 6, 'test', 'player');
  assert(ev && Object.keys(ev.prop.rooms).length >= 1, 'sound event carries reached-room map for ring rendering');
})();

// ---------- awareness model (§2.1.2 design math) ----------
section('awareness');
(function () {
  var f = LB.genGloverHouse();
  var bus = LB.Bus(), s = LB.Sim([f], {}, bus);
  var gm = LB.Guards(s, bus);
  gm.list.length = 0; // isolate one synthetic guard
  var g = gm.add('watchman', 10, 10, 0);
  g.patrol = null; g.state = 'post'; g.post = { x: 10, y: 10, facing: 0 };
  var player = { x: 11.2, y: 10, level: 0, hidden: null, disguised: false, blatant: false,
    moveMode: 'sprint', takedownT: 0, tricks: {}, stats: {} };
  s.dynamicLights.push({ x: 11.2, y: 10, r: 2, level: 0, player: true }); // lamplight on the player
  var t = 0, dt = 1 / 60;
  while (g.aware < 100 && t < 3) { gm.update(dt, player); t += dt; }
  assert(t < 0.5, 'sprint adjacent in lamplight ~ instant (took ' + t.toFixed(2) + 's)');
  // creep at cone edge in shadow: ~5-6s to detected. Douse the hall lamp, put
  // guard + player in the open hallS corridor (map x9..23, y12..15).
  s.dynamicLights.length = 0;
  var hallLamp2 = f.lights.find(function (l) { return l.type === 'lamp' && l.y === 13; });
  s.snuffLight(hallLamp2, false);
  // sentry, not watchman: a watchman's own lantern lights the player (genre-true,
  // separately correct) — the raw design math needs a lanternless guard
  var g2 = gm.add('sentry', 11.5, 13.5, 0);
  g2.state = 'post'; g2.post = { x: 11.5, y: 13.5, facing: 0 }; g2.headTurnT = 999;
  var p2 = { x: 11.5 + 2.5 * 0.88, y: 13.5, level: 0, hidden: null, disguised: false, blatant: false,
    moveMode: 'creep', takedownT: 0, tricks: {}, stats: {} };
  g.ko = true; // silence the first guard
  t = 0;
  while (g2.aware < 100 && t < 20) { gm.update(dt, p2); t += dt; }
  assert(t > 2 && t < 12, 'creep at dark cone-edge is slow (took ' + t.toFixed(1) + 's, target ~5-6s)');
  // decay floors at sticky threshold
  var floorBefore = g2.stickyFloor;
  assert(floorBefore >= LB.C.T_INVESTIGATE, 'sticky floor recorded');
  p2.x = 30; p2.y = 3; // gone
  for (var i = 0; i < 600; i++) gm.update(dt, p2);
  assert(g2.aware >= floorBefore - 0.001, 'awareness never decays below the sticky floor');
})();

// ---------- alertness ratchet + LOCKDOWN seal (§2.3) ----------
section('the ratchet');
(function () {
  var f = LB.genFloor({ archetype: 'manor', act: 2, seed: 999, modifiers: [], fee: 100 });
  var bus = LB.Bus(), s = LB.Sim([f], { act: 2 }, bus);
  var stages = [];
  bus.on('stageUp', function (ev) { stages.push(ev.stage); });
  var prev = 0;
  ['loudNoise', 'detected', 'bodyFound', 'detected', 'scoreMissing', 'detected'].forEach(function (k) {
    s.feedAlert(k);
    assert(s.alert >= prev, 'alert monotonic after ' + k);
    prev = s.alert;
  });
  assert(s.alert >= 80 && s.stage === 3, 'reached LOCKDOWN (alert=' + s.alert + ')');
  assert(stages.join(',').indexOf('3') >= 0, 'stageUp events fired');
  var openExits = f.doors.filter(function (d) { return d.exit && !d.sealed; }).length +
    f.windows.filter(function (w) { return !w.sealed; }).length;
  assert(openExits === 1, 'LOCKDOWN seals all exits but ONE (open=' + openExits + ')');
  assert(!!s.lockdownExit, 'the long walk out is marked');
})();

// ---------- evidence + habituation ----------
section('evidence & lures');
(function () {
  var f = LB.genGloverHouse();
  var bus = LB.Bus(), s = LB.Sim([f], {}, bus);
  var gm = LB.Guards(s, bus);
  var habit = 0; bus.on('lureHabituated', function () { habit++; });
  var g = gm.list.find(function (x) { return x.type === 'watchman'; });
  var a0 = s.alert;
  s.emitSound(g.x + 1, g.y, 3, 'coinLure', 'lure');
  var stateAfter1 = g.state;
  assert(stateAfter1 === 'investigate' || stateAfter1 === 'glance', 'first lure moves the guard (' + stateAfter1 + ')');
  s.emitSound(g.x + 1, g.y, 3, 'coinLure', 'lure');
  assert(habit === 1, 'second same-class lure within 60s -> habituation');
  assert(s.alert === a0 + LB.C.ALERT_FEED.lureHabit, 'habituation feeds +10 alertness');
  // KO -> body evidence -> noticed feeds +20
  var g2 = gm.list.find(function (x) { return x.type === 'sentry'; });
  var player = { x: g2.x - 1, y: g2.y, level: 0, tricks: {}, stats: {} };
  g2.facing = 0; // facing away test: player west, guard facing east -> behind
  var ok = gm.tryKO(player, g2, {});
  assert(ok, 'blackjack from behind succeeds');
  assert(s.evidence.some(function (e) { return e.kind === 'body'; }), 'KO creates body evidence');
  var alertBefore = s.alert;
  s.noticeEvidence(s.evidence.find(function (e) { return e.kind === 'body'; }), g);
  assert(s.alert === alertBefore + LB.C.ALERT_FEED.bodyFound, 'body found feeds +20');
  // Old Copper cannot be KO'd
  var oc = gm.add('oldcopper', 5, 5, 0);
  assert(gm.tryKO(player, oc, {}) === false, 'Old Copper cannot be KO’d');
})();

// ---------- capture ladder (§2.3) ----------
section('capture ladder');
(function () {
  var f = LB.genGloverHouse();
  var bus = LB.Bus(), s = LB.Sim([f], {}, bus);
  var gm = LB.Guards(s, bus);
  var p = LB.Player(s, gm, bus, 'wisp', {});
  p.runRef = { bribeUsed: false };
  var g = gm.list[0];
  var events = [];
  bus.on('bribeOffer', function () { events.push('bribe'); });
  bus.on('pinched', function () { events.push('pinched'); });
  bus.on('lastTrickBurned', function () { events.push('trick'); });
  var x0 = p.x, y0 = p.y;
  assert(p.lastTricks === 1, 'Wisp starts with 1 Last Trick');
  bus.emit('grabbed', { guard: g });
  assert(events.join(',') === 'trick', 'first grab burns the Last Trick');
  assert(p.lastTricks === 0, 'trick consumed');
  bus.emit('grabbed', { guard: g });
  assert(events.join(',') === 'trick,bribe', 'second grab -> Crooked Watchman offer');
  p.runRef.bribeUsed = true;
  bus.emit('grabbed', { guard: g });
  assert(events.join(',') === 'trick,bribe,pinched', 'third grab (bribe spent) -> pinched');
  assert(p.pinched === true, 'pinched flag set');
  // unbribeable: fresh player, no tricks, grabbed by Old Copper -> straight to pinched
  var p2 = LB.Player(s, gm, bus, 'wisp', {});
  p2.lastTricks = 0; p2.runRef = { bribeUsed: false };
  var events2 = [];
  var bus2events = events; events.length = 0;
  var oc = gm.add('oldcopper', 6, 6, 0);
  bus.emit('grabbed', { guard: oc });
  assert(events.indexOf('bribe') < 0 && (p2.pinched || p.pinched), 'Old Copper does not bribe');
})();

// ---------- player verbs & banking ----------
section('verbs & banking');
(function () {
  var f = LB.genGloverHouse();
  var bus = LB.Bus(), s = LB.Sim([f], {}, bus);
  var gm = LB.Guards(s, bus);
  var p = LB.Player(s, gm, bus, 'wisp', {});
  // fine work gate: pick the desk in the dark -> tooDark
  var dark = 0; bus.on('tooDark', function () { dark++; });
  var studyLamp = f.lights.find(function (l) { return l.type === 'lamp' && l.y === 4; });
  s.snuffLight(studyLamp, true);
  p.x = f.quotaLoot.x - 1 + 0.5; p.y = f.quotaLoot.y + 0.5;
  var verbs = p.getVerbs();
  var deskVerb = verbs.find(function (v) { return v.id === 'desk'; });
  assert(!!deskVerb, 'desk verb offered when adjacent');
  if (deskVerb) deskVerb.fn();
  assert(dark === 1, 'fine work blocked in the dark (beat 6 mechanism)');
  p.darkLantern = true; // crack your lantern — briefly
  if (deskVerb) deskVerb.fn();
  assert(p.action !== null, 'dark lantern enables the pick');
  var t = 0;
  while (p.action && t < 20) { p.update(1 / 30); t += 1 / 30; }
  var desk = f.furniture.find(function (fu) { return fu.type === 'desk'; });
  assert(desk.opened, 'desk opens after hold-action');
  // take the ledger, bank it
  verbs = p.getVerbs();
  var take = verbs.find(function (v) { return v.id === 'take'; });
  assert(!!take, 'take verb for the ledger');
  if (take) take.fn();
  assert(p.bag.length === 1 && p.bag[0].quota, 'ledger in the bag');
  var bankedEv = null; bus.on('banked', function (ev) { bankedEv = ev; });
  p.x = f.cart.x; p.y = f.cart.y - 1;
  verbs = p.getVerbs();
  var bank = verbs.find(function (v) { return v.id === 'bank'; });
  assert(!!bank, 'bank verb at the cart');
  if (bank) bank.fn();
  assert(bankedEv && bankedEv.quota, 'quota banked event');
  assert(f.cart.banked.length === 1 && p.bag.length === 0, 'loot moved bag -> cart');
  // pip grammar: every verb carries the preview fields
  p.getVerbs().forEach(function (v) {
    assert(typeof v.noise === 'number' && typeof v.time === 'number' && typeof v.evidence === 'boolean',
      'verb "' + v.id + '" has pips+eye preview');
  });
  // encumbrance: 5+ slots locks sprint
  p.bag = [{ bulk: 3, value: 1, name: 'a', tag: 'quiet' }, { bulk: 2, value: 1, name: 'b', tag: 'quiet' }];
  p.move(0.016, 1, 0, 'sprint');
  assert(p.moveMode !== 'sprint', 'sprint locked at 5+ slots');
})();

// ---------- guard AI soak: never NaN, never in walls, never teleports ----------
section('AI soak (60s x 3 floors)');
[7001, 7002, 7003].forEach(function (seed) {
  var arch = ['manor', 'bank', 'warehouse'][seed % 3];
  var f = LB.genFloor({ archetype: arch, act: 2, seed: seed, modifiers: [], fee: 100 });
  var bus = LB.Bus(), s = LB.Sim([f], { act: 2 }, bus);
  var gm = LB.Guards(s, bus);
  var p = { x: f.spawn.x, y: f.spawn.y, level: 0, hidden: null, disguised: false, blatant: false,
    moveMode: 'walk', takedownT: 0, tricks: {}, stats: {} };
  var rngT = LB.RNG(seed);
  var bad = 0, teleport = 0, prevPos = {};
  gm.list.forEach(function (g) { prevPos[g.id] = { x: g.x, y: g.y }; });
  for (var i = 0; i < 600; i++) {
    var dt = 0.1;
    // player wanders (probe stimulus)
    var nx = p.x + (rngT() - 0.5) * 2, ny = p.y + (rngT() - 0.5) * 2;
    if (!s.blocked(nx, ny, false)) { p.x = nx; p.y = ny; }
    if (i === 200) s.emitSound(p.x, p.y, 8, 'glassSmash', 'player');
    if (i === 400) s.feedAlert('detected');
    gm.update(dt, p);
    gm.list.forEach(function (g) {
      if (g.ko) return;
      if (isNaN(g.x) || isNaN(g.y)) bad++;
      else {
        var tile = f.solid[Math.floor(g.y)] && f.solid[Math.floor(g.y)][Math.floor(g.x)];
        if (tile === 1) bad++;
        var moved = Math.sqrt(Math.pow(g.x - prevPos[g.id].x, 2) + Math.pow(g.y - prevPos[g.id].y, 2));
        if (moved > LB.C.GUARD_SPEED.chase * dt * 2.5 + 0.01) teleport++;
        prevPos[g.id] = { x: g.x, y: g.y };
      }
    });
  }
  assert(bad === 0, arch + '#' + seed + ': no NaN/in-wall guards over 60s (' + bad + ' bad frames)');
  assert(teleport === 0, arch + '#' + seed + ': no guard teleports (' + teleport + ')');
});

// ---------- probe bot as LOCALIZER (never judge) ----------
section('probe bot (localizer)');
var botLog = [];
for (var bseed = 1; bseed <= 12; bseed++) {
  var barch = archKeys[bseed % archKeys.length];
  var bf = LB.genFloor({ archetype: barch, act: 1, seed: bseed * 131071, modifiers: [], fee: 100,
    score: bseed % 3 === 0 ? LB.SCORES[1] : null });
  var bbus = LB.Bus(), bs = LB.Sim([bf], { act: 1 }, bbus);
  var agent = { x: bf.spawn.x, y: bf.spawn.y, level: 0, speed: 3, bag: [], anim: { phase: 0 } };
  var brain = LB.ProbeBrain(bs, agent, { bagMax: 2 });
  var steps = 0;
  while (!brain.done && steps++ < 4000) brain.update(0.05);
  var tag2 = barch + '#' + bseed;
  var tookSomething = agent.bag.length > 0;
  if (!assert(brain.done, tag2 + ': bot run terminates (localizer: non-termination = pathing defect)')) {
    botLog.push(tag2 + ' STUCK in state ' + brain.state + ' @' + agent.x.toFixed(1) + ',' + agent.y.toFixed(1));
  }
  if (!tookSomething) botLog.push(tag2 + ' banked nothing — log: ' + brain.log.slice(0, 3).join('; '));
  assert(!isNaN(agent.x) && !isNaN(agent.y), tag2 + ': bot position sane');
}
if (botLog.length) console.log('  bot localization notes:\n   ' + botLog.join('\n   '));

// ---------- The Other Shadow (rival = probe brain as actor) ----------
section('the Other Shadow');
(function () {
  var f = LB.genFloor({ archetype: 'manor', act: 2, seed: 5555, modifiers: ['othershadow'], fee: 100, score: LB.SCORES[2] });
  var bus = LB.Bus(), s = LB.Sim([f], { act: 2, modifiers: ['othershadow'] }, bus);
  var gm = LB.Guards(s, bus);
  var rival = gm.spawnRival();
  assert(!!rival && !isNaN(rival.x), 'rival spawns');
  var p = { x: f.spawn.x, y: f.spawn.y, level: 0, hidden: null, disguised: false, blatant: false,
    moveMode: 'still', takedownT: 0, tricks: {}, stats: {} };
  var escaped = false; bus.on('rivalEscaped', function () { escaped = true; });
  for (var i = 0; i < 2400 && !escaped; i++) gm.update(0.05, p);
  assert(escaped || rival.bag.length > 0, 'rival acts (escaped=' + escaped + ' bag=' + rival.bag.length + ')');
  assert(!isNaN(rival.x) && !isNaN(rival.y), 'rival position sane');
})();

// ---------- run structure & economy (§2.6-§2.7) ----------
section('run & economy');
(function () {
  var profile = { rep: 0, seenNotes: {}, runsPlayed: 0, wins: 0, captures: 0,
    unlockedLoadouts: ['wisp'], vows: [], gloverDone: false, captureHistory: false };
  var run = LB.newRun(profile, 'wisp', 12345);
  var board = LB.makeBoard(run, profile);
  assert(board.length === 1 && board[0].glover, 'fresh profile: A1J1 is The Glover House, always');
  profile.gloverDone = true;
  board = LB.makeBoard(run, profile);
  assert(board.length === 4, 'board offers 4 listings');
  board.forEach(function (L, i) {
    assert(!!LB.ARCHETYPES[L.archetype] && typeof L.fee === 'number' && L.fee > 0, 'listing ' + i + ' well-formed');
  });
  var big = LB.bigJobListing(run);
  assert(big.bigKind === 'counting' && big.buyIn === 400, 'Act 1 Big Job: Counting House, buy-in 400');
  run.act = 2; assert(LB.bigJobListing(run).bigKind === 'gala', 'Act 2: the Gala');
  run.act = 3; assert(LB.bigJobListing(run).bigKind === 'archive', 'Act 3: the Archive');
  run.act = 1;
  // heat: hit a district at LOCKDOWN -> +3
  run.lastListing = { district: 'vane', districtName: 'Vane Hill', fee: 100, name: 'test' };
  var fakeSim = { stage: 3, evidenceFeeds: 0, evidence: [], stamps: [] };
  var res = LB.endJob(run, null, { banked: [], quotaBanked: true, stats: { bankedSlots: 0, quotaTime: 100, usedDoor: true }, sim: fakeSim, guards: { anyPastSuspicious: false, koCount: 0 } });
  assert(run.heat.vane === 3, 'left at LOCKDOWN -> district Heat +3');
  assert(res.accolades.length === 7, 'ledger lists all 7 accolades');
  assert(res.accolades.filter(function (a) { return a.earned; }).length >= 3, 'clean fabricated job earns accolades (ghost/notrace/cleanhands/inandout)');
  assert(res.rep > 0, 'accolades PAY rep');
  // fence: score sells 3x + 1 rep
  var cash0 = run.cash;
  var sold = LB.fenceSell(run, [{ name: 'the Regatta Cup', value: 100, tag: 'famous', score: LB.SCORES[1] }], profile);
  assert(sold.cash === 300 && sold.rep === 1, 'Score fences at 3x + 1 REP');
  assert(sold.lines.length === 1, 'Magpie appraises the Score by name');
  // tool evolution offers require rep
  run.rep = 10;
  run.tools.snuffer = 1;
  var offers = LB.toolOffers(run, LB.RNG(1));
  assert(offers.length > 0 && offers.length <= 3, 'fence offers 1-3 tools');
  // advance: 2 jobs + big then next act
  run.jobInAct = 0;
  assert(LB.advance(run) === 'board', 'job 1 -> board');
  assert(LB.advance(run) === 'bigJob', 'job 2 -> big job');
  assert(LB.advance(run) === 'newAct' && run.act === 2, 'big job -> Act 2');
  // morning edition names the cause
  run.over = true; run.outcome = 'pinched';
  run.causeOfEnd = { by: 'hound', place: 'the Vane manor' };
  var me = LB.morningEdition(run, profile);
  assert(me.headline.indexOf('soot trail') >= 0, 'Morning Edition names the cause of capture (death-lesson)');
  run.outcome = 'victory';
  assert(LB.morningEdition(run, profile).headline.indexOf('ARCHIVE ROBBED') === 0, 'victory headline');
  run.outcome = 'disgrace';
  assert(LB.morningEdition(run, profile).headline.indexOf('SEASON OF SILENCE') === 0, 'disgrace headline');
})();

// ---------- teaching gates (§3.0) ----------
section('teaching');
(function () {
  var f = LB.genGloverHouse();
  var bus = LB.Bus(), s = LB.Sim([f], {}, bus);
  var gm = LB.Guards(s, bus);
  gm.list.forEach(function (g) { g.ko = true; }); // nobody watching: safe moments everywhere
  var profile = { seenNotes: {} };
  var t = LB.Teach(s, gm, bus, profile);
  // player OUTSIDE the building, in the dark — no ambient lesson triggers fire
  t.playerRef = { x: 1.5, y: 1.5, level: 0, hidden: null, bagUsed: function () { return 0; } };
  t.note('snuff');
  t.update(1, t.playerRef);
  assert(t.current && t.current.id === 'snuff', 'note shows at a safe moment');
  t.note('snuff');
  assert(!t.queued, 'once per profile: seen note never re-queues');
  t.note('creak'); t.note('doorsound');
  assert(t.queued && t.queued.id === 'creak', 'queue depth 1 (doorsound dropped, fallback channels reteach)');
  // 8s gap gate
  s.time = 2; t.current = null;
  t.update(0.1, t.playerRef);
  assert(!t.current, 'queued note waits for the 8s gap');
  s.time = 20;
  t.update(0.1, t.playerRef);
  assert(t.current && t.current.id === 'creak', 'queued note fires after the gap');
  // immediate class jumps the queue
  t.note('lockdown');
  assert(t.current && t.current.id === 'lockdown', 'LOCKDOWN note fires immediately (exception class)');
  // exactly 3 callout kinds
  bus.emit('banked', { value: 10 }); bus.emit('scoreMarked', {}); bus.emit('searchResolved', { found: false });
  var kinds = t.callouts.map(function (c) { return c.text.split('.')[0]; });
  assert(t.callouts.length === 3, 'the three in-moment callouts fire');
})();

// ---------- DOM context: full boot + INPUT PLUMBING (feedback_verify_input_plumbing) ----------
section('input plumbing (DOM stubs)');
(function () {
  var ids = {}, allEls = [], listeners = { window: {}, document: {} }, rafQ = [];
  var ctxFns = {
    measureText: function () { return { width: 60 }; },
    createRadialGradient: function () { return { addColorStop: function () { } }; },
    createLinearGradient: function () { return { addColorStop: function () { } }; },
    getImageData: function () { return { data: [] }; }
  };
  function makeCtx() {
    var store = {};
    return new Proxy(store, {
      get: function (t, k) {
        if (k in ctxFns) return ctxFns[k];
        if (k in t) return t[k];
        return function () { };
      },
      set: function (t, k, v) { t[k] = v; return true; }
    });
  }
  function makeEl(tag) {
    var el = {
      tag: tag, attrs: {}, className: '', id: '', disabled: false, textContent: '',
      style: {}, width: 0, height: 0, clientWidth: 1366, clientHeight: 768,
      children: [], onclick: null, _ctx: null,
      classList: { add: function () { }, remove: function () { }, toggle: function () { } },
      getContext: function () { if (!el._ctx) el._ctx = makeCtx(); return el._ctx; },
      getAttribute: function (k) { return el.attrs[k]; },
      getBoundingClientRect: function () { return { left: 0, top: 0, width: 1366, height: 768 }; },
      addEventListener: function () { },
      appendChild: function (c) { el.children.push(c); },
      querySelectorAll: function (sel) {
        var cls = sel.replace('.', '');
        return el._parsed ? el._parsed.filter(function (e) { return (' ' + e.className + ' ').indexOf(' ' + cls + ' ') >= 0; }) : [];
      }
    };
    Object.defineProperty(el, 'innerHTML', {
      set: function (html) {
        el._parsed = [];
        var re = /<(\w+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, m;
        while ((m = re.exec(html))) {
          var child = makeEl(m[1]);
          var attrs = m[2] || '';
          var am, ar = /([\w-]+)="([^"]*)"/g;
          while ((am = ar.exec(attrs))) {
            if (am[1] === 'id') { child.id = am[2]; ids[am[2]] = child; }
            else if (am[1] === 'class') child.className = am[2];
            else child.attrs[am[1].replace(/^data-/, 'data-')] = am[2];
            child.attrs[am[1]] = am[2];
          }
          el._parsed.push(child);
          allEls.push(child);
        }
      },
      get: function () { return ''; }
    });
    return el;
  }
  var gameCanvas = makeEl('canvas'); gameCanvas.id = 'game'; ids.game = gameCanvas;
  var screenDiv = makeEl('div'); screenDiv.id = 'screen'; ids.screen = screenDiv;
  var store = {};
  var domCtx = vm.createContext({
    console: console, Math: Math, Date: Date, JSON: JSON,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    performance: { now: function () { return Date.now(); } },
    localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    document: {
      createElement: function (tag) { return makeEl(tag); },
      getElementById: function (id) { return ids[id] || null; },
      addEventListener: function (ev, fn) { (listeners.document[ev] = listeners.document[ev] || []).push(fn); }
    }
  });
  domCtx.window = {
    addEventListener: function (ev, fn) { (listeners.window[ev] = listeners.window[ev] || []).push(fn); },
    devicePixelRatio: 1,
    requestAnimationFrame: function (fn) { rafQ.push(fn); },
    __lampblack: null
  };
  domCtx.requestAnimationFrame = domCtx.window.requestAnimationFrame;
  vm.runInContext('window.localStorage = localStorage;', domCtx);
  FILES.forEach(function (f) {
    var src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    vm.runInContext(src, domCtx, { filename: 'dom:' + f });
  });
  function fire(target, ev, data) {
    (listeners[target][ev] || []).forEach(function (fn) { fn(data || {}); });
  }
  function pump(n) {
    for (var i = 0; i < n; i++) {
      var q = rafQ.splice(0, rafQ.length);
      q.forEach(function (fn) { fn(Date.now() + i * 16); });
    }
  }
  fire('window', 'DOMContentLoaded');
  assert(!!(listeners.window.keydown && listeners.window.keyup && listeners.window.mousemove),
    'keydown/keyup/mousemove handlers registered on window');
  var los = screenDiv.querySelectorAll('lo');
  assert(los.length === 3, 'menu renders 3 loadout buttons (got ' + los.length + ')');
  var wisp = los.filter(function (e) { return e.attrs['data-lo'] === 'wisp'; })[0];
  assert(!!wisp && !!wisp.onclick, 'wisp button clickable');
  wisp.onclick();
  var jobs = screenDiv.querySelectorAll('job');
  assert(jobs.length === 1, 'fresh profile board shows only The Glover House');
  jobs[0].onclick();
  var W = vm.runInContext('window.__lampblack', domCtx);
  assert(!!W && !!W.player, 'job started; debug handle live');
  assert(W.getState() === 'heist', 'state=heist after board click-through');
  // the actual plumbing: DOM keydown -> frame -> player MOVES
  var x0 = W.player.x, y0 = W.player.y;
  var pd = 0;
  fire('window', 'keydown', { code: 'KeyD', preventDefault: function () { pd++; } });
  pump(30);
  assert(W.player.x > x0 + 0.1, 'KeyD via DOM event moves the player east (dx=' + (W.player.x - x0).toFixed(2) + ')');
  fire('window', 'keyup', { code: 'KeyD' });
  // creep modifier through the DOM
  fire('window', 'keydown', { code: 'ControlLeft', preventDefault: function () { } });
  fire('window', 'keydown', { code: 'KeyS', preventDefault: function () { } });
  pump(10);
  assert(W.player.moveMode === 'creep', 'Ctrl via DOM event engages creep');
  fire('window', 'keyup', { code: 'ControlLeft' }); fire('window', 'keyup', { code: 'KeyS' });
  // F toggles the dark lantern
  var dl0 = W.player.darkLantern;
  fire('window', 'keydown', { code: 'KeyF', preventDefault: function () { } });
  assert(W.player.darkLantern === !dl0, 'KeyF via DOM event toggles the dark lantern');
  // Tab is captured (case notes)
  var tabPd = 0;
  fire('window', 'keydown', { code: 'Tab', preventDefault: function () { tabPd++; } });
  assert(tabPd === 1, 'Tab preventDefault called (Case Notes hold)');
  fire('window', 'keyup', { code: 'Tab', preventDefault: function () { tabPd++; } });
  // E executes a verb without throwing; Q cycles
  var threw2 = false;
  try {
    fire('window', 'keydown', { code: 'KeyQ', preventDefault: function () { } });
    fire('window', 'keydown', { code: 'KeyE', preventDefault: function () { } });
    pump(5);
  } catch (e) { threw2 = true; console.log('   E/Q threw: ' + e.stack); }
  assert(!threw2, 'E (interact) and Q (cycle) fire through DOM events without error');
  pump(60); // render soak with stub canvas
  assert(true, 'render loop survives 60 stub frames');
})();

// ---------- summary ----------
console.log('\n========================================');
console.log('PASSED: ' + passed + '   FAILED: ' + failed);
if (failed) {
  console.log('\nFailures:');
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
} else {
  console.log('All assertions green.');
}
