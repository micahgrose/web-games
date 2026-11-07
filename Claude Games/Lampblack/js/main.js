'use strict';
// LAMPBLACK — main: state machine, DOM input wiring, audio hookups, the loop.
var LB = (typeof LB !== 'undefined') ? LB : {};

(function () {
  if (typeof window === 'undefined') return; // headless harness drives modules directly
  var C = LB.C, M = LB.M;
  var canvas, R, audio, profile, run, state = 'menu';
  var sim = null, guards = null, player = null, teach = null, bus = null;
  var verbs = [], verbSel = 0, aimAng, gameTime = 0, lastT = 0, holdTab = false;
  var rivalTimer = -1, tellT = 0, jobResult = null, pendingBribe = null, whistleStep = {};
  var Input = { x: 0, y: 0, creep: false, sprint: false };
  var screenEl;

  // ---------- boot ----------
  window.addEventListener('DOMContentLoaded', function () {
    canvas = document.getElementById('game');
    screenEl = document.getElementById('screen');
    R = LB.Render(canvas);
    R.resize();
    LB.Art.init();
    audio = LB.Audio();
    profile = LB.loadProfile();
    window.addEventListener('resize', function () { R.resize(); });
    wireInput();
    showMenu();
    requestAnimationFrame(frame);
  });

  // ---------- input plumbing (real DOM handlers — verified by the harness) ----------
  var KEYS = {};
  function wireInput() {
    window.addEventListener('keydown', function (e) {
      if (KEYS[e.code]) return void (KEYS[e.code] = true);
      KEYS[e.code] = true;
      if (!audio.ok && audio.init()) { audio.resume(); audio.startMusic(); }
      if (e.code === 'Tab') { e.preventDefault(); holdTab = true; }
      if (state !== 'heist') return;
      if (e.code === 'KeyE' || e.code === 'Space') {
        e.preventDefault();
        if (player && player.action && player.action.kind === 'dial') { player.dialRelease(); return; }
        var v = verbs[verbSel % Math.max(1, verbs.length)];
        if (v) v.fn(aimAng);
      }
      if (e.code === 'KeyQ') verbSel++;
      if (e.code === 'KeyF' && player) { player.darkLantern = !player.darkLantern; }
      if (e.code === 'Escape') { if (player && player.action) player.action = null; }
    });
    window.addEventListener('keyup', function (e) {
      KEYS[e.code] = false;
      if (e.code === 'Tab') { e.preventDefault(); holdTab = false; }
    });
    window.addEventListener('mousemove', function (e) {
      if (!player || !R.vw) return;
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left + R.cam.x, my = e.clientY - rect.top + R.cam.y;
      aimAng = Math.atan2(my - player.y * C.TILE, mx - player.x * C.TILE);
    });
    window.addEventListener('blur', function () { KEYS = {}; });
  }
  function pollInput() {
    Input.x = (KEYS.KeyD || KEYS.ArrowRight ? 1 : 0) - (KEYS.KeyA || KEYS.ArrowLeft ? 1 : 0);
    Input.y = (KEYS.KeyS || KEYS.ArrowDown ? 1 : 0) - (KEYS.KeyW || KEYS.ArrowUp ? 1 : 0);
    Input.sprint = !!(KEYS.ShiftLeft || KEYS.ShiftRight);
    Input.creep = !!(KEYS.ControlLeft || KEYS.ControlRight || KEYS.KeyC);
  }

  // ---------- job lifecycle ----------
  function startJob(listing) {
    bus = LB.Bus();
    var job = LB.startJob(run, listing);
    sim = LB.Sim(job.floors, job.spec, bus);
    guards = LB.Guards(sim, bus);
    player = LB.Player(sim, guards, bus, run.loadout, { tools: Object.assign({}, run.tools), tricks: Object.assign({}, run.tricks), cash: run.cash });
    player.runRef = run;
    teach = LB.Teach(sim, guards, bus, profile);
    teach.playerRef = player;
    rivalTimer = (job.spec.modifiers || []).indexOf('othershadow') >= 0 ? 14 : -1;
    jobResult = null; pendingBribe = null; whistleStep = {};
    // intel purchases apply
    if (run.intel) {
      var f = sim.floor();
      if (run.intel.plan || (job.spec.modifiers || []).indexOf('insideman') >= 0) { f.revealed = {}; f.rooms.forEach(function (r) { f.revealed[r.id] = true; }); }
      run.intel = null;
    }
    wireJobAudio();
    bus.emit('jobStarted', { glover: !!listing.glover, disguise: !!sim.floor().disguise });
    hideScreen();
    state = 'heist';
    // debug/test handle (input-plumbing verification reads through this)
    window.__lampblack = { sim: sim, player: player, guards: guards, teach: teach, run: run,
      getState: function () { return state; }, keys: KEYS };
  }

  function endJob(how) { // 'left' | 'pinched' | 'bribed'
    var cart = sim.floors[0].cart;
    var quotaBanked = cart.banked.some(function (l) { return l.quota; });
    var result = {
      banked: cart.banked, bankedValue: cart.value, quotaBanked: quotaBanked,
      pinched: how === 'pinched', bribed: how === 'bribed',
      stats: player.stats, sim: sim, guards: guards
    };
    if (how === 'bribed') { run.bribeUsed = true; run.cash = 0; player.bag = []; result.banked = cart.banked; }
    var debrief = LB.endJob(run, null, result);
    debrief.sloppy = sim.stage >= 2 || sim.evidenceFeeds > 3;
    jobResult = { result: result, debrief: debrief };
    if (run.lastListing && run.lastListing.glover) { profile.gloverDone = true; LB.saveProfile(profile); }
    if (how === 'pinched') {
      profile.captureHistory = true; profile.captures++; LB.saveProfile(profile);
      run.over = true; run.outcome = 'pinched';
      run.causeOfEnd = { by: player.stats.flushedOut ? 'flushed' : (player.stats.grabbedBy || 'watchman'), place: run.lastListing ? run.lastListing.name : 'the job' };
      showMorning();
      return;
    }
    showDebrief();
  }

  // ---------- audio wiring: every system speaks as it acts (directive) ----------
  function wireJobAudio() {
    var stepMap = { carpet: 'step_carpet', wood: 'step_wood', marble: 'step_marble', glass: 'step_glass', stone: 'step_marble' };
    bus.on('playerStep', function (ev) {
      if (ev.mode === 'creep') return;
      audio.play(ev.creak ? 'creak' : (stepMap[ev.mat] || 'step_wood'), { gain: 0.25 + M.clamp(ev.L / 8, 0, 0.5) });
    });
    bus.on('snuffed', function (ev) { audio.play('snuff_fwip', { gain: 0.7 }); R.spawnSnuffFx(ev.light.x, ev.light.y); });
    bus.on('relit', function () { audio.play('relight_foomp', { gain: 0.5 }); });
    bus.on('lockPicked', function () { audio.play('pick_success', { gain: 0.5 }); });
    bus.on('safeOpened', function () { audio.play('pick_success', { gain: 0.6 }); });
    bus.on('deskOpened', function () { audio.play('pick_success', { gain: 0.4 }); });
    bus.on('dialTick', function () { audio.play('dial_tick', { gain: 0.7 }); });
    bus.on('dialNearStop', function () { audio.play('dial_stop_thunk', { gain: 0.8 }); });
    bus.on('dialNotch', function () { audio.play('pick_success', { gain: 0.45 }); });
    bus.on('guardKO', function () { audio.play('blackjack_thump', { gain: 0.7 }); });
    bus.on('doorForced', function () { R.addShake(C.SHAKE.doorForce); });
    bus.on('guardSlipped', function () { R.addShake(C.SHAKE.oilSlip); });
    bus.on('guardDetected', function () { R.addShake(C.SHAKE.detected); });
    bus.on('grabbed', function () { R.addShake(C.SHAKE.grabbed); });
    bus.on('lastTrickBurned', function (ev) {
      R.addShake(C.SHAKE.lastTrick);
      R.spawnBurstFx(player.x, player.y, 8);
      audio.play('smoke_burst', { gain: 0.8 });
    });
    bus.on('smokeThrown', function (ev) { audio.play('smoke_burst', { gain: 0.6 }); });
    bus.on('noteShown', function () { audio.play('paper_rustle', { gain: 0.5 }); });
    bus.on('banked', function () { audio.play('ui_coin', { gain: 0.5 }); });
    bus.on('copperShutter', function (ev) { spatialTell(ev.guard); audio.playTell(ev.guard.id, 'shk_clack'); });
    bus.on('sentryWake', function () { audio.play('gasp', { gain: 0.4 }); });
    bus.on('pinched', function () { endJob('pinched'); });
    bus.on('bribeOffer', function (ev) { pendingBribe = ev.guard; showBribe(); });
    bus.on('vaultOpened', function () { audio.play('door_force', { gain: 0.4 }); });
    bus.on('civilianScream', function () { });
    // your own hands are audible too — throttled per class so long recipes
    // (drag scrape, drill whine) SUSTAIN instead of retriggering (user audit)
    var selfFoley = { bodyDrag: ['body_drag', 1.05, 0.45], pickTick: ['pick_tick', 0.9, 0.5],
      drillTick: ['drill', 2.45, 0.9], cutTick: ['glass_cut', 0.45, 0.5],
      disarmTick: ['pick_tick', 0.9, 0.4], pickpocketTick: ['pick_tick', 0.9, 0.3] };
    var selfLast = {};
    // world sounds reach the player's ears through the same door-graph BFS
    bus.on('sound', function (ev) {
      if (!audio.ok || !player) return;
      if (ev.src === 'player') {
        var sf = selfFoley[ev.cls];
        if (sf) {
          var now = Date.now() / 1000;
          if (now - (selfLast[ev.cls] || 0) >= sf[1]) { selfLast[ev.cls] = now; audio.play(sf[0], { gain: sf[2] }); }
        }
        return;
      }
      var recv = ev.prop.at(player.x, player.y);
      if (recv <= 0.2) return;
      var atten = recv / ev.L;
      var sp = { pan: M.clamp((ev.x - player.x) / 14, -1, 1), gain: M.clamp(recv / 8, 0.05, 0.9),
        cutoff: atten < 0.95 ? 600 + atten * 7400 : 0 };
      var map = { creak: 'creak', glassSmash: 'glass_smash', doorForce: 'door_force', bell: 'bell_trap',
        blackjack: 'blackjack_thump', coinLure: 'coin_lure', gasValve: 'gas_hiss', whistleBlast: 'whistle_blast',
        scream: 'scream', bark: 'dog_bark', catYowl: 'scream', dumbwaiter: 'dumbwaiter_clunk',
        bodyDrag: 'body_drag', lure: 'songbird', oilSlip: 'oil_slip', step: 'step_wood' };
      if (map[ev.cls]) audio.play(map[ev.cls], sp);
    });
  }

  // guard tells: spatialized by the SAME BFS guards hear with; re-evaluated at 4Hz
  function spatialTell(g) {
    if (!audio.ok || !player) return;
    var prop = sim.propagate(g.x, g.y, 8, g.level);
    var recv = g.level === player.level ? prop.at(player.x, player.y) : 0;
    var atten = recv / 8;
    audio.setTellSpatial(g.id, M.clamp((g.x - player.x) / 14, -1, 1), M.clamp(recv / 8, 0, 0.8), 600 + atten * 7400);
  }
  function updateTells(dt) {
    tellT += dt;
    if (tellT < 0.25) return; // 4Hz
    tellT = 0;
    guards.list.forEach(function (g) {
      if (g.ko || M.dist(g.x, g.y, player.x, player.y) > 18) { audio.setTellSpatial(g.id, 0, 0, 8000); return; }
      spatialTell(g);
      var frame = LB.Art.legFrame(g.walkPhase);
      var moving = g.anim.pose === 'walk' || g.anim.pose === 'run';
      var w = whistleStep[g.id] = whistleStep[g.id] || { lastFrame: -1, note: 0, snore: 0, hum: 0 };
      switch (g.type) {
        case 'watchman': // whistle phrase starts on left-foot contacts
          if (moving && frame === 0 && w.lastFrame !== 0) {
            var seq = C.LEITMOTIF.concat([null, null, null]); // phrase + rests
            var n = seq[w.note % seq.length]; w.note++;
            if (n) audio.playTell(g.id, 'whistle_note', LB.noteHz(n));
          }
          if (moving && frame % 4 === 0 && w.lastFrame !== frame) audio.playTell(g.id, 'step_wood');
          break;
        case 'sentry':
          if (g.state === 'doze') { w.snore += 0.25; if (w.snore >= 4) { w.snore = 0; audio.playTell(g.id, 'snore_in'); setTimeout(function () { audio.playTell(g.id, 'snore_out'); }, 1400); } }
          break;
        case 'warden': if (moving && frame % 4 === 0 && w.lastFrame !== frame) { audio.playTell(g.id, 'key_jangle'); } break;
        case 'pair':
          if (moving && frame % 4 === 0 && w.lastFrame !== frame) audio.playTell(g.id, 'step_marble');
          if (Math.random() < 0.02) audio.playTell(g.id, 'civ_murmur');
          break;
        case 'hound': audio.playTell(g.id, 'dog_pant'); if (g.scentLocked && Math.random() < 0.3) audio.playTell(g.id, 'dog_snuffle'); break;
        case 'sergeant': if (g.anim.pose === 'point' && Math.random() < 0.4) audio.playTell(g.id, 'order_bark'); break;
        case 'marksman': if (g.aware >= 30 && !w.cocked) { w.cocked = true; audio.playTell(g.id, 'rifle_cock'); } if (g.aware < 10) w.cocked = false; break;
        case 'tough': w.hum += 0.25; if (w.hum > 1.2) { w.hum = Math.random(); audio.playTell(g.id, 'tough_hum'); } break;
        case 'civilian': if (Math.random() < 0.05) audio.playTell(g.id, 'civ_murmur'); break;
        case 'oldcopper': // heavy/light boot alternation (the limp)
          if (moving && frame % 4 === 0 && w.lastFrame !== frame) audio.playTell(g.id, (frame === 0) ? 'copper_boot_heavy' : 'copper_boot_light');
          break;
      }
      w.lastFrame = frame;
    });
  }

  // ---------- the loop ----------
  function frame(t) {
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t; gameTime += dt;
    if (state === 'heist' && sim && !pendingBribe) {
      pollInput();
      var mode = Input.creep ? 'creep' : Input.sprint ? 'sprint' : 'walk';
      player.move(dt, Input.x, Input.y, mode);
      player.update(dt);
      sim.update(dt, player);
      guards.update(dt, player);
      teach.update(dt, player);
      if (rivalTimer > 0) { rivalTimer -= dt; if (rivalTimer <= 0) guards.spawnRival(); }
      verbs = player.getVerbs();
      // leaving: the cart is also the way out
      var f0 = sim.floors[0];
      if (player.level === 0 && M.dist(player.x, player.y, f0.cart.x, f0.cart.y) < 2) {
        var quotaBanked = f0.cart.banked.some(function (l) { return l.quota; });
        verbs.push({ id: 'leave', label: quotaBanked ? 'Slip away (job done)' : 'Flee the job (quota unmet)', noise: 0, time: 0, evidence: false,
          fn: function () { endJob('left'); } });
      }
      teach.checkVerbs(verbs);
      // awareness teaching tick
      guards.list.forEach(function (g) { if (g.aware > 12 && g.aware < 35) bus.emit('awareTick', { aware: g.aware }); });
      // music follows the ratchet; tremolo swells in a chase
      audio.setStage(sim.stage);
      audio.setChase(guards.list.some(function (g) { return g.state === 'chase' && !g.ko; }));
      updateTells(dt);
      R.drawScene({ sim: sim, player: player, guards: guards, teach: teach, run: run,
        verbs: verbs, verbSel: verbSel, aimAng: aimAng, time: gameTime, holdTab: holdTab,
        quotaText: quotaLine() }, dt);
    }
    requestAnimationFrame(frame);
  }
  function quotaLine() {
    var f0 = sim.floors[0];
    var got = f0.cart.banked.some(function (l) { return l.quota; }) ? 1 : 0;
    return (run.lastListing ? run.lastListing.quota : 'the prize') + ' ' + got + '/1 · fee £' + (run.lastListing ? run.lastListing.fee : 0);
  }

  // ---------- DOM screens (parchment & ink) ----------
  function showScreen(html) { screenEl.innerHTML = html; screenEl.style.display = 'flex'; }
  function hideScreen() { screenEl.style.display = 'none'; }
  function el(id) { return document.getElementById(id); }

  function showMenu() {
    state = 'menu';
    var saved = LB.loadRun();
    var lo = Object.keys(LB.LOADOUTS).map(function (k) {
      var locked = profile.unlockedLoadouts.indexOf(k) < 0 && LB.LOADOUTS[k].unlockRep > profile.rep;
      if (!locked && profile.unlockedLoadouts.indexOf(k) < 0) profile.unlockedLoadouts.push(k);
      return '<button class="lo' + (locked ? ' locked' : '') + '" data-lo="' + k + '" ' + (locked ? 'disabled' : '') + '>' +
        '<b>' + LB.LOADOUTS[k].name + '</b><br><small>' + (locked ? 'Unlocks at ' + LB.LOADOUTS[k].unlockRep + ' REP' : LB.LOADOUTS[k].desc) + '</small></button>';
    }).join('');
    showScreen('<div class="panel"><h1>LAMPBLACK</h1><p class="tag">the city’s ghost story</p>' +
      (saved ? '<button id="continue">Continue the season (Act ' + saved.act + ')</button>' : '') +
      '<p>Choose your thief:</p><div class="row">' + lo + '</div>' +
      '<p class="small">REP ' + profile.rep + ' · runs ' + profile.runsPlayed + '</p>' +
      '<p class="small keys">WASD move · Ctrl creep · Shift sprint · E act · Q next verb · F lantern · hold Tab case notes</p></div>');
    if (saved) el('continue').onclick = function () { run = saved; showBoard(); };
    Array.prototype.forEach.call(screenEl.querySelectorAll('.lo'), function (b) {
      b.onclick = function () {
        run = LB.newRun(profile, b.getAttribute('data-lo'));
        profile.runsPlayed++; LB.saveProfile(profile);
        showBoard();
      };
    });
  }

  function showBoard() {
    state = 'board';
    if (run.jobInAct === 2) return showBigJob();
    var listings = LB.makeBoard(run, profile);
    var html = listings.map(function (L, i) {
      var mods = (L.modifiers || []).map(function (m) { return L.hiddenMod === m ? '<i>???</i>' : LB.MODIFIERS[m].name; }).join(', ');
      return '<div class="job" data-i="' + i + '"><b>' + L.name + '</b>' +
        (L.score ? ' <span class="score">★ ' + L.score.name + '</span>' : '') +
        '<br><small>' + (L.desc || LB.ARCHETYPES[L.archetype].name + ' · risk: ' + L.risk) + '</small>' +
        '<br><small>' + (mods ? 'tonight: ' + mods + ' · ' : '') + 'HEAT ' + '♨'.repeat(Math.min(5, L.heat)) + (L.heat ? '' : '—') + '</small>' +
        '<br>fee £' + L.fee + '</div>';
    }).join('');
    var warn = LB.magpieWarning(listings[0]);
    showScreen('<div class="panel wide"><h2>THE JOB BOARD — Act ' + run.act + ', job ' + (run.jobInAct + 1) + ' of 2</h2>' +
      '<p class="small">£' + run.cash + ' · REP ' + run.rep + '</p>' +
      '<div class="jobs">' + html + '</div>' +
      (warn ? '<p class="magpie">Magpie: “' + warn + '”</p>' : '') + '</div>');
    Array.prototype.forEach.call(screenEl.querySelectorAll('.job'), function (d) {
      d.onclick = function () { startJob(listings[+d.getAttribute('data-i')]); };
    });
  }

  function showBigJob() {
    var L = LB.bigJobListing(run);
    var afford = LB.canAffordBigJob(run);
    showScreen('<div class="panel"><h2>' + L.name + '</h2><p>' + L.desc + '</p>' +
      '<p>Buy-in: £' + L.buyIn + ' — you have £' + run.cash + '</p>' +
      '<p class="magpie">Magpie: “' + LB.MAGPIE.briefTeach.buyin + '”' + (run.act === 2 ? '<br>“' + LB.MAGPIE.briefTeach.oldcopperSeed + '”' : '') + '</p>' +
      (afford ? '<button id="go">Pay the buy-in. Do the job.</button>'
        : '<button id="disgrace">You cannot pay. The season ends.</button>') + '</div>');
    if (afford) el('go').onclick = function () { run.cash -= L.buyIn; startJob(L); };
    else el('disgrace').onclick = function () { run.over = true; run.outcome = 'disgrace'; showMorning(); };
  }

  function showDebrief() {
    state = 'debrief';
    var d = jobResult.debrief, r = jobResult.result;
    var rows = d.accolades.map(function (a) {
      return '<div class="acc' + (a.earned ? '' : ' stub') + '">' + (a.earned ? '✦ ' : '◇ ') + a.name +
        ' <small>' + a.desc + '</small><span>+' + a.rep + ' REP</span></div>';
    }).join('');
    var needle = LB.magpieNeedle(run, r.sim, r.stats);
    showScreen('<div class="panel"><h2>THE FENCE’S LEDGER</h2>' +
      '<p>' + (r.quotaBanked ? 'Job done. Fee £' + d.fee : (r.bribed ? 'Bribed out. The bag is gone.' : 'Fled without the quota. No fee.')) + '</p>' +
      '<div class="ledger">' + rows + '</div>' +
      (needle ? '<p class="magpie">Magpie: “' + needle + '”</p>' : '') +
      '<button id="tofence">To Magpie’s counter</button></div>');
    el('tofence').onclick = showFence;
    teach.fenceTriggers(run, { heatBump: d.heatBump, scoreFenced: r.banked.some(function (l) { return l.tag === 'famous'; }) });
  }

  function showFence() {
    state = 'fence';
    var banked = jobResult ? jobResult.result.banked : [];
    var sellable = banked.filter(function (l) { return !l.sold; });
    var offers = LB.toolOffers(run);
    var doTrick = (run.jobsDone % 2 === 1);
    var tricks = doTrick ? LB.trickOffers(run) : [];
    var greeting = LB.magpieGreeting(run, profile, jobResult && jobResult.debrief);
    var sellHtml = sellable.length ? '<button id="sellall">Sell the haul (£' + sellable.reduce(function (s, l) { return s + (l.tag === 'famous' ? l.value * 3 : l.value); }, 0) + ')</button>' : '<small>nothing to sell</small>';
    var toolHtml = offers.map(function (o, i) {
      return '<button class="offer" data-i="' + i + '">' + o.name + (o.evolution ? ' ⬆' : '') + ' — £' + o.cost + '<br><small>' + o.desc + '</small></button>';
    }).join('');
    var trickHtml = tricks.map(function (o, i) {
      return '<button class="trick" data-i="' + i + '">' + o.name + '<br><small>' + o.desc + '</small></button>';
    }).join('');
    var intelHtml = ['plan', 'patrols', 'loot', 'roster'].map(function (k) {
      return '<button class="intel" data-k="' + k + '">' + k + ' £' + C.INTEL_COST[k] + '</button>';
    }).join('');
    showScreen('<div class="panel wide magpieShop"><div class="bustWrap"><canvas id="bust" width="96" height="96"></canvas></div>' +
      '<h2>MAGPIE’S COUNTER</h2><p class="magpie" id="mline">“' + greeting + '”</p>' +
      '<p>£<span id="cash">' + run.cash + '</span> · REP ' + run.rep + '</p>' +
      '<div class="shoprow"><div><h3>Sell</h3>' + sellHtml + '</div>' +
      '<div><h3>Tools</h3>' + (toolHtml || '<small>nothing today</small>') + '</div>' +
      (doTrick ? '<div><h3>A Trick</h3>' + trickHtml + '</div>' : '') +
      '<div><h3>Intel (next job)</h3>' + intelHtml + '</div></div>' +
      '<button id="leave">Back to the boards</button></div>');
    var bustC = el('bust');
    var expr = (jobResult && jobResult.debrief.sloppy) ? 'needling' : (sellable.some(function (l) { return l.tag === 'famous'; }) ? 'delighted' : 'appraising');
    if (bustC) bustC.getContext('2d').drawImage(LB.Art.magpie[expr], 0, 0);
    if (el('sellall')) el('sellall').onclick = function () {
      var res = LB.fenceSell(run, sellable, profile);
      sellable.forEach(function (l) { l.sold = true; });
      el('cash').textContent = run.cash;
      if (res.lines.length) el('mline').textContent = '“' + res.lines[0] + '”';
      el('sellall').disabled = true;
      audio.play('ui_coin', { gain: 0.6 });
      LB.saveProfile(profile);
    };
    Array.prototype.forEach.call(screenEl.querySelectorAll('.offer'), function (b) {
      b.onclick = function () {
        var o = offers[+b.getAttribute('data-i')];
        if (run.cash < o.cost) return;
        run.cash -= o.cost; run.tools[o.tool] = o.tier;
        el('cash').textContent = run.cash; b.disabled = true;
        audio.play('ui_coin', { gain: 0.5 });
      };
    });
    if (doTrick) { teach.trickDraftShown(); Array.prototype.forEach.call(screenEl.querySelectorAll('.trick'), function (b) {
      b.onclick = function () {
        run.tricks[tricks[+b.getAttribute('data-i')].trick] = true;
        Array.prototype.forEach.call(screenEl.querySelectorAll('.trick'), function (x) { x.disabled = true; });
      };
    }); }
    Array.prototype.forEach.call(screenEl.querySelectorAll('.intel'), function (b) {
      b.onclick = function () { if (LB.buyIntel(run, b.getAttribute('data-k'))) { el('cash').textContent = run.cash; b.disabled = true; } };
    });
    el('leave').onclick = function () {
      var next = LB.advance(run);
      LB.saveRun(run); // mid-run save at the fence (§2.6)
      if (next === 'victory') {
        if (jobResult && !jobResult.result.quotaBanked) run.outcome = 'disgrace'; // fled the Archive empty-handed
        showMorning(); return;
      }
      showBoard();
    };
  }

  function showBribe() {
    state = 'bribe';
    var act = run.act, floorPrice = C.BRIBE_FLOOR[act - 1];
    var canPay = player.cash + run.cash >= floorPrice || true; // price = ALL cash + the whole bag; floor gates the deal
    var total = run.cash;
    var enough = total >= floorPrice;
    showScreen('<div class="panel"><h2>THE CROOKED WATCHMAN</h2>' +
      '<p>“Easy now, shadow. Every man has his price. Mine is <b>everything in your pockets and the bag off your back</b>.' +
      ' Call it £' + floorPrice + ' or better — or I call it a night in the cells.”</p>' +
      '<p>You carry £' + total + ' and ' + player.bag.length + ' pieces.</p>' +
      (enough ? '<button id="pay">Pay him. Walk away gutted.</button>' : '<p><i>You cannot cover his price.</i></p>') +
      '<button id="refuse">' + (enough ? 'Refuse' : 'You are pinched.') + '</button></div>');
    if (enough) el('pay').onclick = function () {
      pendingBribe = null; hideScreen(); state = 'heist';
      run.heat[run.lastListing.district] = (run.heat[run.lastListing.district] || 0) + 2;
      endJob('bribed');
    };
    el('refuse').onclick = function () {
      pendingBribe = null; player.pinched = true; hideScreen();
      endJob('pinched');
    };
  }

  function showMorning() {
    state = 'morning';
    LB.clearRun();
    profile.rep += run.rep;
    if (run.outcome === 'victory') profile.wins++;
    LB.saveProfile(profile);
    var me = LB.morningEdition(run, profile);
    audio.playLeitmotif({ gain: 0.5 }, run.outcome !== 'victory');
    var briefs = me.briefs.map(function (b) { return '<p class="brief">' + b + '</p>'; }).join('');
    var heat = me.heatMap.map(function (h) { return '<span>' + h.name + ' ' + '♨'.repeat(Math.min(5, h.heat)) + '</span>'; }).join(' · ');
    showScreen('<div class="panel wide paper"><p class="masthead">THE MORNING SENTINEL</p>' +
      '<h1 class="headline">' + me.headline + '</h1><p><i>' + me.sub + '</i></p><hr>' +
      '<div class="columns">' + (briefs || '<p class="brief">A quiet season, says the Watch.</p>') + '</div>' +
      (me.scores.length ? '<p><b>MISSING:</b> ' + me.scores.join(', ') + '</p>' : '') +
      '<p class="small">BOROUGHS ON EDGE: ' + heat + '</p>' +
      '<p>Season’s take £' + me.cash + ' · REP earned ' + me.rep + ' (total ' + profile.rep + ')</p>' +
      '<button id="again">Another season</button></div>');
    el('again').onclick = function () { run = null; showMenu(); };
  }
})();

if (typeof module !== 'undefined') module.exports = LB;
