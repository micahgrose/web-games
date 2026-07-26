'use strict';
// LAMPBLACK — run structure & economy (DESIGN §2.6, §2.7): the season, the job
// board, Heat, Magpie's counter, the Den meta, saves, the Morning Edition.
var LB = (typeof LB !== 'undefined') ? LB : (typeof module !== 'undefined' ? require('./core.js') : {});

(function () {
  var STORE_PROFILE = 'lampblack_profile_v1', STORE_RUN = 'lampblack_run_v1';
  function storage() {
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; }
  }

  // ---------- profile (the Den, §2.7) ----------
  LB.loadProfile = function () {
    var s = storage(), raw = s && s.getItem(STORE_PROFILE);
    var pr = raw ? JSON.parse(raw) : null;
    if (!pr) pr = { rep: 0, seenNotes: {}, runsPlayed: 0, wins: 0, captures: 0,
      unlockedLoadouts: ['wisp'], vows: [], toolPoolBonus: 0, gloverDone: false, captureHistory: false };
    return pr;
  };
  LB.saveProfile = function (pr) { var s = storage(); if (s) s.setItem(STORE_PROFILE, JSON.stringify(pr)); };
  LB.denUnlocks = function (pr) {
    var u = [];
    if (pr.rep >= LB.LOADOUTS.cracksman.unlockRep && pr.unlockedLoadouts.indexOf('cracksman') < 0) u.push({ kind: 'loadout', id: 'cracksman' });
    if (pr.rep >= LB.LOADOUTS.bruiser.unlockRep && pr.unlockedLoadouts.indexOf('bruiser') < 0) u.push({ kind: 'loadout', id: 'bruiser' });
    return u;
  };

  // ---------- run ----------
  LB.newRun = function (profile, loadoutKey, seed) {
    var run = {
      seed: seed || (Date.now() & 0x7fffffff), act: 1, jobInAct: 0, jobsDone: 0,
      loadout: loadoutKey, cash: 120, rep: 0,
      tools: {}, tricks: {}, bribeUsed: false, lastListing: null,
      heat: {}, districtVisits: {}, scoresFenced: [], history: [],
      rivalActive: false, rivalEscapedWith: [], over: false, outcome: null, causeOfEnd: null,
      trickDraftCounter: 0
    };
    LB.DISTRICTS.forEach(function (d) { run.heat[d.id] = 0; });
    LB.LOADOUTS[loadoutKey].tools.forEach(function (t) { run.tools[t] = 1; });
    return run;
  };

  // ---------- job board (§2.6): 4 listings, choose sequentially ----------
  LB.makeBoard = function (run, profile) {
    var rng = LB.RNG(run.seed + run.act * 1000 + run.jobInAct * 37 + run.jobsDone);
    var listings = [];
    // fresh profile: A1J1 is ALWAYS The Glover House (§3.2 — authored seed, not gen)
    if (!profile.gloverDone && run.act === 1 && run.jobInAct === 0) {
      return [{ glover: true, district: 'gaslight', districtName: 'Gaslight Row', archetype: 'townhouse',
        name: 'The Glover House', quota: 'the Glover ledger', fee: 120, risk: 'a quiet street',
        modifiers: [], heat: 0, desc: 'A clerk wants his master’s ledger. In and out, dearie.' }];
    }
    for (var i = 0; i < 4; i++) {
      var district = LB.DISTRICTS[rng.int(0, LB.DISTRICTS.length - 1)];
      var arch = rng.pick(district.types);
      var heat = run.heat[district.id] || 0;
      var mods = [];
      var modKeys = Object.keys(LB.MODIFIERS).filter(function (k) { return k !== 'othershadow'; });
      if (rng.chance(0.7)) mods.push(rng.pick(modKeys));
      if (rng.chance(0.3)) { var m2 = rng.pick(modKeys); if (mods.indexOf(m2) < 0) mods.push(m2); }
      if (run.act >= 2 && rng.chance(0.25)) mods.push('othershadow');
      var A = LB.ARCHETYPES[arch];
      var baseFee = 100 + run.act * 60 + heat * 45 + rng.int(0, 40);
      var feeMul = 1;
      mods.forEach(function (m) { if (LB.MODIFIERS[m].feeMul) feeMul *= LB.MODIFIERS[m].feeMul; });
      // 1–2 named Scores seeded in matching archetypes (§2.8)
      var score = null;
      var candidates = LB.SCORES.filter(function (s) {
        return s.arch === arch && !s.finaleOnly && !s.act2Finale &&
          !run.scoresFenced.some(function (fs) { return fs === s.id; }) &&
          !run.rivalEscapedWith.some(function (rs) { return rs === s.id; });
      });
      if (candidates.length && rng.chance(0.55)) score = rng.pick(candidates);
      var risk = [];
      var gset = A.guards['A' + run.act] || A.guards.A1 || [];
      if (gset.indexOf('hound') >= 0) risk.push('dogs');
      if (gset.indexOf('marksman') >= 0) risk.push('a marksman');
      if (gset.indexOf('pair') >= 0) risk.push('paired constables');
      if (mods.indexOf('overcast') < 0 && rng.chance(0.5)) risk.push('moonlit');
      listings.push({
        district: district.id, districtName: district.name, archetype: arch, name: A.name + ', ' + district.name,
        quota: 'the client’s prize', fee: Math.round(baseFee * feeMul), risk: risk.join(', ') || 'a quiet street',
        modifiers: mods, heat: heat, score: score,
        hiddenMod: mods.length > 1 && !(run.tricks.cardcounter) ? mods[mods.length - 1] : null,
        seed: rng.int(1, 1e9)
      });
    }
    return listings;
  };

  LB.bigJobListing = function (run) {
    var acts = {
      1: { bigKind: 'counting', name: 'THE COUNTING HOUSE', archetype: 'bank', district: 'exchange',
        desc: 'A timelock vault. Three key-holders walk the floors. Take all three — or crack their side-safes.',
        fee: 500 },
      2: { bigKind: 'gala', name: 'THE GALA AT VANE HOUSE', archetype: 'gala', district: 'vane',
        desc: 'You arrive in servant livery. The Vane Emerald sits in the brightest pool of the ballroom.',
        fee: 900, score: LB.SCORES[0] },
      3: { bigKind: 'archive', name: 'THE MAGISTRATE’S ARCHIVE', archetype: 'museum', district: 'founders',
        desc: 'The city’s evidence vault. Old Copper walks it from minute one. Your season’s noise, armed and waiting.',
        fee: 1500, score: LB.SCORES[9] }
    };
    var a = acts[run.act];
    var totalHeat = 0; Object.keys(run.heat).forEach(function (k) { totalHeat += run.heat[k]; });
    return {
      big: true, bigKind: a.bigKind, name: a.name, archetype: a.archetype, district: a.district,
      districtName: (LB.DISTRICTS.find(function (d) { return d.id === a.district; }) || {}).name,
      desc: a.desc, fee: a.fee, quota: 'the client’s prize',
      buyIn: LB.C.BIGJOB_BUYIN[run.act - 1],
      modifiers: run.act >= 2 ? ['othershadow'] : [],
      heat: run.heat[a.district] || 0, score: a.score || null,
      garrison: a.bigKind === 'archive' ? Math.min(6, Math.floor(totalHeat / 2)) : 0,
      seed: run.seed + run.act * 5555, risk: a.bigKind === 'archive' ? 'OLD COPPER' : 'a hard house'
    };
  };

  // ---------- job start/end ----------
  LB.startJob = function (run, listing) {
    run.lastListing = listing;
    var spec = {
      archetype: listing.archetype, act: run.act, big: !!listing.big, bigKind: listing.bigKind,
      modifiers: listing.modifiers || [], seed: listing.seed || run.seed, fee: listing.fee,
      score: listing.score || null, heat: listing.heat || 0, garrison: listing.garrison || 0,
      startAlert: 0, oldCopperFromStart: listing.bigKind === 'archive'
    };
    (spec.modifiers || []).forEach(function (m) { if (LB.MODIFIERS[m] && LB.MODIFIERS[m].startAlert) spec.startAlert = LB.MODIFIERS[m].startAlert; });
    var floors = listing.glover ? [LB.genGloverHouse()] : (listing.big ? LB.genBigJob(spec) : [LB.genFloor(spec)]);
    // The Collector Is Home: a unique civilian carries the Score
    if ((spec.modifiers || []).indexOf('collector') >= 0 && floors[0].scoreLoot) {
      var f0 = floors[0];
      f0.scoreLoot.taken = true; // not on the pedestal — on the man
      var room = f0.rooms[f0.objectiveRoomId - 1];
      f0.guards.push({ type: 'civilian', x: room.cx, y: room.cy, wander: room.id, carriesScore: f0.scoreLoot });
    }
    return { spec: spec, floors: floors };
  };

  // Compute debrief: accolades (they PAY, §3.4), fee, Heat bump.
  LB.endJob = function (run, ctx, result) {
    // result: {banked:[], quotaBanked, fled, pinched, stats, sim, guards}
    var listing = run.lastListing || {};
    var out = { accolades: [], earned: 0, fee: 0, rep: 0, sold: [], quotaBanked: result.quotaBanked };
    var sim = result.sim, stats = result.stats;
    if (result.quotaBanked) out.fee = listing.fee || 0;
    var stageName = LB.STAGE_NAMES[sim ? sim.stage : 0];
    // accolades
    var A = {};
    LB.ACCOLADES.forEach(function (a) { A[a.id] = a; });
    var earned = {};
    if (result.guards && !result.guards.anyPastSuspicious) earned.ghost = 1;
    if (sim && sim.evidenceFeeds === 0) earned.notrace = 1;
    if (result.guards && result.guards.koCount === 0) earned.cleanhands = 1;
    if (stats && stats.bankedSlots >= 6) earned.fullbag = 1;
    if (stats && stats.bankedAtLockdown) earned.longwalk = 1;
    if (stats && stats.quotaTime > 0 && stats.quotaTime < 300) earned.inandout = 1;
    if (stats && !stats.usedDoor && stats.enteredByWindow) earned.secondstory = 1;
    LB.ACCOLADES.forEach(function (a) {
      var got = !!earned[a.id];
      out.accolades.push({ id: a.id, name: a.name, desc: a.desc, rep: a.rep, earned: got });
      if (got) out.rep += a.rep;
    });
    // Heat (§2.6): +1 hit, +2 left ALARMED+, +3 LOCKDOWN
    var d = listing.district;
    if (d !== undefined && run.heat[d] !== undefined) {
      var bump = 1;
      if (sim && sim.stage >= 3) bump = 3; else if (sim && sim.stage >= 2) bump = 2;
      if (result.pinched) bump = Math.max(bump, 2);
      run.heat[d] += bump;
      out.heatBump = bump; out.heatDistrict = d;
    }
    if (!result.quotaBanked && !result.pinched) { out.failed = true; if (d !== undefined) { } }
    run.cash += out.fee;
    run.rep += out.rep;
    run.jobsDone++;
    run.history.push({ listing: listing.name, district: listing.districtName, stage: stageName,
      banked: result.banked ? result.banked.length : 0, value: result.bankedValue || 0,
      quotaBanked: result.quotaBanked, pinched: result.pinched, accolades: Object.keys(earned) });
    return out;
  };

  // ---------- the fence screen: sell / draft / trick / intel (§2.6) ----------
  LB.fenceSell = function (run, banked, profile) {
    var total = 0, repGain = 0, lines = [];
    var mul = run.tricks.silvertongue ? 1.2 : 1;
    banked.forEach(function (l) {
      var v = l.value;
      if (l.tag === 'famous' && l.score) {
        v *= LB.C.SCORE_FENCE_MUL; repGain += 1;
        run.scoresFenced.push(l.score.id);
        lines.push(LB.MAGPIE.appraisals[l.score.id] || ('The ' + l.name + '!'));
        if (l.score.heatRelief && run.heat.docks > 0) run.heat.docks--;
      }
      total += Math.round(v * mul);
    });
    run.cash += total; run.rep += repGain;
    profile.rep += repGain;
    return { cash: total, rep: repGain, lines: lines };
  };

  LB.toolOffers = function (run, rng) {
    rng = rng || LB.RNG(run.seed + run.jobsDone * 131);
    var offers = [];
    var keys = rng.shuffle(LB.TOOL_KEYS);
    for (var i = 0; i < keys.length && offers.length < 3; i++) {
      var k = keys[i], tier = run.tools[k] || 0;
      if (tier === 0) offers.push({ tool: k, tier: 1, name: LB.TOOLS[k].tiers[0], desc: LB.TOOLS[k].desc[0], cost: 80 + run.act * 30 });
      else if (tier < 3 && run.rep + (LB.loadProfile ? 0 : 0) >= (tier) * 2) // evolutions gated by rep threshold
        offers.push({ tool: k, tier: tier + 1, name: LB.TOOLS[k].tiers[tier], desc: LB.TOOLS[k].desc[tier], cost: 140 * tier + run.act * 40, evolution: true });
    }
    return offers;
  };
  LB.trickOffers = function (run, rng) {
    rng = rng || LB.RNG(run.seed + run.jobsDone * 733);
    var have = Object.keys(run.tricks);
    var pool = Object.keys(LB.TRICKS).filter(function (k) { return have.indexOf(k) < 0; });
    return rng.shuffle(pool).slice(0, 3).map(function (k) { return { trick: k, name: LB.TRICKS[k].name, desc: LB.TRICKS[k].desc }; });
  };
  LB.buyIntel = function (run, kind) {
    var cost = LB.C.INTEL_COST[kind];
    if (run.cash < cost) return false;
    run.cash -= cost;
    run.intel = run.intel || {};
    run.intel[kind] = true;
    return true;
  };

  // Magpie's greeting for the fence screen (keyed to run state, §4.7)
  LB.magpieGreeting = function (run, profile, lastResult) {
    var pool;
    if (profile.runsPlayed === 0 && run.jobsDone <= 1) pool = LB.MAGPIE.greetings.firstTime;
    else if (profile.captureHistory && run.jobsDone === 0) pool = LB.MAGPIE.greetings.postCapture;
    else if (lastResult && lastResult.sloppy) pool = LB.MAGPIE.greetings.sloppy;
    else pool = LB.MAGPIE.greetings.clean;
    return pool[(run.jobsDone + run.act) % pool.length];
  };
  LB.magpieNeedle = function (run, sim, stats) {
    if (!sim) return null;
    if (stats && stats.grabbedBy === 'bribed') return LB.MAGPIE.needles[6];
    if (sim.evidence.some(function (e) { return e.kind === 'body' && e.seen; })) return LB.MAGPIE.needles[0];
    if (sim.evidence.filter(function (e) { return e.kind === 'forcedDoor'; }).length >= 3) return LB.MAGPIE.needles[1];
    if (sim.evidence.filter(function (e) { return e.kind === 'dousedLamp'; }).length >= 4) return LB.MAGPIE.needles[2];
    if (sim.stage >= 2) return LB.MAGPIE.needles[4];
    return null;
  };
  LB.magpieWarning = function (listing) {
    var w = LB.MAGPIE.warnings;
    if (!listing) return null;
    var gset = (LB.ARCHETYPES[listing.archetype].guards['A' + 2] || []);
    if ((listing.modifiers || []).indexOf('doubleshift') >= 0) return w.doubleshift;
    if ((listing.modifiers || []).indexOf('electric') >= 0) return w.electric;
    if ((listing.modifiers || []).indexOf('drill') >= 0) return w.drill;
    if ((listing.modifiers || []).indexOf('collector') >= 0) return w.collector;
    if ((listing.modifiers || []).indexOf('rain') >= 0) return w.rain;
    if ((listing.modifiers || []).indexOf('ball') >= 0) return w.crowds;
    if (listing.risk && listing.risk.indexOf('dogs') >= 0) return w.dogs;
    if (listing.risk && listing.risk.indexOf('marksman') >= 0) return w.marksman;
    if (listing.risk && listing.risk.indexOf('paired') >= 0) return w.pair;
    if (listing.risk && listing.risk.indexOf('moonlit') >= 0) return w.moonlit;
    if ((listing.heat || 0) >= 3) return w.heat3;
    return null;
  };

  // ---------- act/run progression ----------
  LB.advance = function (run) {
    run.jobInAct++;
    if (run.jobInAct >= 3) { // 2 chosen jobs + big job done
      if (run.act >= 3) { run.over = true; run.outcome = 'victory'; return 'victory'; }
      run.act++; run.jobInAct = 0;
      return 'newAct';
    }
    return run.jobInAct === 2 ? 'bigJob' : 'board';
  };
  LB.canAffordBigJob = function (run) { return run.cash >= LB.C.BIGJOB_BUYIN[run.act - 1]; };

  // ---------- mid-run save (§2.6 — serialize at fence screens) ----------
  LB.saveRun = function (run) { var s = storage(); if (s) s.setItem(STORE_RUN, JSON.stringify(run)); };
  LB.loadRun = function () {
    var s = storage(), raw = s && s.getItem(STORE_RUN);
    return raw ? JSON.parse(raw) : null;
  };
  LB.clearRun = function () { var s = storage(); if (s) s.removeItem(STORE_RUN); };

  // ---------- The Morning Edition (§4.8): the city tells your story ----------
  LB.morningEdition = function (run, profile) {
    var headline, sub;
    var cause = run.causeOfEnd || {};
    if (run.outcome === 'victory') {
      headline = 'ARCHIVE ROBBED — WATCH BAFFLED, MAGISTRATE FURIOUS';
      sub = 'No arrests. No witnesses. The city’s ghost story walks free.';
    } else if (run.outcome === 'pinched') {
      var where = cause.place || 'the ' + (run.lastListing ? run.lastListing.name : 'job');
      var how = { hound: 'a hound followed a soot trail', oldcopper: 'Old Copper read the evidence like a book',
        sergeant: 'a sergeant checked the wardrobe', watchman: 'a watchman’s lantern found a face',
        pair: 'the second constable was watching backward', flushed: 'they searched the hiding spot',
        marksman: 'a rifleman owned the lamplight' }[cause.by] || 'the watch closed a fist';
      headline = 'PHANTOM TAKEN AT ' + where.toUpperCase() + ' — ' + how;
      sub = 'The cause named plainly, as every death-lesson should be.';
    } else if (run.outcome === 'disgrace') {
      headline = 'SEASON OF SILENCE — the shadow retires poor';
      sub = 'The buy-in went unpaid. The fat jobs went to bolder hands.';
    } else {
      headline = 'A QUIET SEASON ENDS';
      sub = '';
    }
    var briefs = [];
    run.history.forEach(function (h) {
      briefs.push((h.quotaBanked ? 'ROBBERY at ' : 'PROWLER at ') + (h.listing || 'a house') +
        ' — the household reached ' + h.stage + (h.accolades && h.accolades.indexOf('ghost') >= 0 ? '; no one saw a thing' : ''));
    });
    var heatMap = LB.DISTRICTS.map(function (d) { return { name: d.name, heat: run.heat[d.id] || 0 }; });
    var scores = run.scoresFenced.map(function (id) { return (LB.SCORES.find(function (s) { return s.id === id; }) || {}).name; });
    return { headline: headline, sub: sub, briefs: briefs, heatMap: heatMap, scores: scores,
      cash: run.cash, rep: run.rep, outcome: run.outcome };
  };
})();

if (typeof module !== 'undefined') module.exports = LB;
