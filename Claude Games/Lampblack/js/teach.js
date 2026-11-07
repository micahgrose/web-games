'use strict';
// LAMPBLACK — teaching (DESIGN §3): no tutorial-box object exists. Magpie's
// parchment notes (once per profile, queue-1, safe-moment gate), lesson
// triggers, exactly three in-moment callouts, scripted discoveries.
var LB = (typeof LB !== 'undefined') ? LB : (typeof module !== 'undefined' ? require('./core.js') : {});

LB.Teach = function (sim, guards, bus, profile) {
  var C = LB.C, M = LB.M;
  var t = {
    current: null,      // {id, text, age, dur}
    queued: null,
    lastShownAt: -999,
    callouts: [],       // the exactly-3 grammar: Lost him. / Banked. +£N / Marked.
    armed: {}, hiddenTime: 0
  };
  var IMMEDIATE = { oldcopper: 1, lockdown: 1, lasttrick: 1 }; // §3.0.3 exceptions

  t.note = function (id) {
    if (!LB.NOTES[id]) return;
    if (profile.seenNotes[id]) return;
    profile.seenNotes[id] = true;
    LB.saveProfile(profile);
    var n = { id: id, text: LB.NOTES[id], age: 0, dur: 6.5 };
    if (IMMEDIATE[id]) { t.current = n; t.lastShownAt = sim.time; bus.emit('noteShown', n); return; }
    if (t.current) { if (!t.queued) t.queued = n; return; } // queue depth 1
    t.queued = t.queued || n;
  };

  t.callout = function (text) {
    t.callouts.push({ text: text, age: 0, dur: 2.4 });
    if (t.callouts.length > 3) t.callouts.shift();
  };

  function playerInAnyCone(player) {
    for (var i = 0; i < guards.list.length; i++) {
      var g = guards.list[i];
      if (!g.ko && !g.def.civilian && guards.canSee(g, player.x, player.y, {})) return true;
    }
    return false;
  }

  t.update = function (dt, player) {
    if (t.current) {
      t.current.age += dt;
      if (t.current.age >= t.current.dur) t.current = null;
    }
    if (!t.current && t.queued) {
      // safe-moment gate: not in any cone, 8s since last note (§3.0.3)
      if (sim.time - t.lastShownAt >= C.NOTE_GAP_S && !playerInAnyCone(player)) {
        t.current = t.queued; t.queued = null; t.lastShownAt = sim.time;
        bus.emit('noteShown', t.current);
      }
    }
    for (var i = t.callouts.length - 1; i >= 0; i--) {
      t.callouts[i].age += dt;
      if (t.callouts[i].age >= t.callouts[i].dur) t.callouts.splice(i, 1);
    }
    // proximity-armed lessons
    proximityChecks(player);
    // camp-in-a-wardrobe counter (§3.3): the night doesn't wait with you
    if (player.hidden && sim.stage >= 2) {
      t.hiddenTime += dt;
      if (t.hiddenTime > 20) { t.note('roundsclock'); t.hiddenTime = -999; }
    } else if (!player.hidden) t.hiddenTime = 0;
    // soot gem lesson: the first time you step into real light (Glover: the moon quad you MUST cross)
    if (!t.armed.sootgem && sim.lightAt(player.x, player.y) > 0.2 && sim.roomAt(player.x, player.y) > 0) {
      t.armed.sootgem = 1; t.note('sootgem');
    }
    if (!t.armed.heavybag && player.bagUsed() >= C.SPRINT_LOCK_SLOTS) { t.armed.heavybag = 1; t.note('heavybag'); }
  };

  function proximityChecks(player) {
    for (var i = 0; i < guards.list.length; i++) {
      var g = guards.list[i];
      if (g.ko || g.level !== player.level) continue;
      var d = M.dist(g.x, g.y, player.x, player.y);
      if (!t.armed.pairs && g.type === 'pair' && d < 7) { t.armed.pairs = 1; t.note('pairs'); }
      if (!t.armed.marksman && g.type === 'marksman' && d < 9) { t.armed.marksman = 1; t.note('marksman'); }
      if (!t.armed.pickpocket && g.keyholder && d < 5) { t.armed.pickpocket = 1; t.note('pickpocket'); }
    }
    if (guards.rival && !guards.rival.escaped && !t.armed.othershadow &&
        M.dist(guards.rival.x, guards.rival.y, player.x, player.y) < 7 &&
        sim.los(player.x, player.y, guards.rival.x, guards.rival.y)) {
      t.armed.othershadow = 1; t.note('othershadow');
    }
    var f = sim.floor();
    if (!t.armed.mirror) for (var m = 0; m < f.mirrors.length; m++)
      if (M.dist(f.mirrors[m].x, f.mirrors[m].y, player.x, player.y) < 3) { t.armed.mirror = 1; t.note('mirror'); break; }
  }

  // Verb-availability lessons — main calls this with the live verb list.
  t.checkVerbs = function (verbs) {
    for (var i = 0; i < verbs.length; i++) {
      var v = verbs[i];
      if (v.id === 'snuff' && !t.armed.snuff) { t.armed.snuff = 1; t.note('snuff'); }
      if (v.id === 'disarm' && !t.armed.bell) { t.armed.bell = 1; t.note('bell'); }
      if (v.id === 'dumb' && !t.armed.dumb) { t.armed.dumb = 1; t.note('dumbwaiter'); }
    }
  };

  // ---------- bus wiring (the curriculum, §3.2) ----------
  bus.on('jobStarted', function (ev) {
    t.hiddenTime = 0; t.armed = {};
    if (ev.glover) t.note('casing');
    if (ev.disguise) t.note('disguise');
  });
  bus.on('guardSuspicious', function () { t.note('suspicious'); });
  bus.on('guardDetected', function () { });
  bus.on('tooDark', function () { t.note('finework'); });
  bus.on('ghostDropped', function () { t.note('ghost'); });
  bus.on('banked', function (ev) { t.callout('Banked. +£' + ev.value); t.note('banking'); });
  bus.on('scoreMarked', function () { t.callout('Marked.'); t.note('scoretaken'); });
  bus.on('searchResolved', function (ev) { if (!ev.found) t.callout('Lost him.'); });
  bus.on('playerStep', function (ev) { if (ev.creak) t.note('creak'); });
  bus.on('relit', function () { t.note('warden'); });
  bus.on('alertFeed', function (ev) { if (ev.kind !== 'roundsTick') t.note('ratchet'); });
  bus.on('warmLootTaken', function () { t.note('warmloot'); });
  bus.on('responseEntered', function () { t.note('response'); });
  bus.on('dogLockOn', function () { t.note('scent'); });
  bus.on('lootTaken', function (ev) { if (ev.twoHand) t.note('twohand'); });
  bus.on('electricBlocked', function () { t.note('electric'); });
  bus.on('copperShutter', function () { t.note('oldcopper'); });
  bus.on('guardSpawn', function (g) { if (g.type === 'oldcopper') t.note('oldcopper'); });
  bus.on('guardKO', function () { t.note('bodyhide'); });
  bus.on('lureHabituated', function () { t.note('lurehabit'); });
  bus.on('stageUp', function (ev) { if (ev.stage >= 3) t.note('lockdown'); });
  bus.on('lastTrickBurned', function () { t.note('lasttrick'); });
  bus.on('hideSpotChecked', function () { t.note('hidespot'); });
  bus.on('sound', function (ev) {
    // door-graph lesson: a noise from another room, eaten by a closed door
    if (t.armed.doorsound) return;
    if (ev.src === 'player') return;
    var pr = t.playerRef; if (!pr) return;
    var room = sim.roomAt(pr.x, pr.y);
    var raw = ev.L - M.dist(ev.x, ev.y, pr.x, pr.y);
    var got = ev.prop.at(pr.x, pr.y);
    if (room !== sim.roomAt(ev.x, ev.y) && raw > 1 && got < raw * 0.5) { t.armed.doorsound = 1; t.note('doorsound'); }
  });
  // awareness lesson: the fill visibly climbing while you're exposed
  bus.on('awareTick', function (ev) { if (ev.aware > 12) t.note('awareness'); });

  // fence-screen triggers (main calls these)
  t.fenceTriggers = function (run, result) {
    if (result && result.heatBump >= 2) t.note('heat');
    if (result && result.scoreFenced) t.note('scorefenced');
  };
  t.trickDraftShown = function () { t.note('trickdraft'); };

  return t;
};

if (typeof module !== 'undefined') module.exports = LB;
