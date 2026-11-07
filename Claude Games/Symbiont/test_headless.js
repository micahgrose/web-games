/* Headless harness for SYMBIONT (platformer). Drives the DOM-free simulation,
   renders each frame against a mock 2D context, and PROVES the metroidvania
   gating: each obstacle is crossable only by the body meant for it.
   Run: node test_headless.js  */
const fs = require("fs");
const path = require("path");
eval(fs.readFileSync(path.join(__dirname, "game.js"), "utf8"));
const SYM = globalThis.SYM;
const TS = SYM.TS;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("  ✗ FAIL: " + msg); } }
function section(s) { console.log("\n== " + s + " =="); }

function mockCtx() {
  const grad = { addColorStop() {} };
  return {
    canvas: { width: 960, height: 576 }, imageSmoothingEnabled: true,
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    measureText: (t) => ({ width: (t ? t.length : 0) * 7 }),
    save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, setTransform(){},
    beginPath(){}, closePath(){}, moveTo(){}, lineTo(){}, arc(){}, arcTo(){},
    ellipse(){}, quadraticCurveTo(){}, bezierCurveTo(){}, rect(){},
    fill(){}, stroke(){}, fillRect(){}, strokeRect(){}, clearRect(){},
    fillText(){}, strokeText(){}, setLineDash(){}, clip(){},
  };
}
const ctx = mockCtx();

function run(g, secs, dt, perFrame) {
  const steps = Math.floor(secs / dt);
  for (let i = 0; i < steps; i++) { if (perFrame) perFrame(g, i * dt); SYM.update(g, dt); SYM.render(g, ctx); }
}
function placeAndPossess(g, type, tx, ty) {
  const T = SYM.BODIES[type];
  const e = { type, T, x: tx * TS, y: ty * TS, w: T.w, h: T.h, vx: 0, vy: 0, dir: 1,
    onGround: false, controlled: false, dead: false, hp: T.maxHp, maxHp: T.maxHp,
    hitFlash: 0, anim: 0, homeX: tx * TS, patrol: T.fly ? "bob" : "walk", bobT: 0 };
  g.enemies.push(e); SYM.possess(g, e); return e;
}
// drive a possessed body across, with a per-frame controller; returns result
function tryCross(type, startTx, startTy, targetTx, ctrl, secs) {
  const g = SYM.createGame({ seed: 42 });
  g.enemies = [];                 // isolate: only our test body
  placeAndPossess(g, type, startTx, startTy);
  const st = { _dj: false, _dash: false };
  let crossed = false, fell = false;
  const dt = 1 / 60, steps = Math.floor((secs || 2.4) / dt);
  for (let i = 0; i < steps; i++) {
    g.input.left = false; g.input.right = false; g.input.jumpHeld = false;
    ctrl(g, i * dt, st);
    SYM.update(g, dt); SYM.render(g, ctx);
    if (g.player.x + g.player.w >= targetTx * TS && g.player.mode === "body" && g.player.onGround) crossed = true;
    if (g.player.mode === "spirit") fell = true; // lost the body to spikes/void
  }
  return { crossed, fell, x: g.player.x, mode: g.player.mode };
}
// is there solid ground just ahead of the body's front foot?
function groundAhead(g) {
  const p = g.player;
  const aheadTx = Math.floor((p.x + p.w + 6) / TS);
  const footTy = Math.floor((p.y + p.h + 4) / TS);
  return SYM.solidTile(SYM.tileAt(g.lv, aheadTx, footTy));
}
// edge-aware: walk right, jump exactly at a ledge edge
const huskCtrl = (g) => { g.input.right = true; if (g.player.onGround && !groundAhead(g)) g.input.jumpBuf = 0.12; };
const dartCtrl = (g, t, st) => {
  g.input.right = true;
  if (g.player.onGround) { st._dj = false; st._dash = false; if (!groundAhead(g)) g.input.jumpBuf = 0.12; }
  else {
    if (!st._dj && g.player.vy > -120) { g.input.jumpBuf = 0.12; st._dj = true; }     // double jump near apex
    if (!st._dash && g.player.vy > -30) { g.input.actBuf = 0.12; st._dash = true; }    // then dash
  }
};
const floaterCtrl = (g) => { g.input.right = true; g.input.jumpHeld = g.player.x < 47 * TS; };

// =====================================================================
section("1. Load + render smoke");
ok(!!SYM, "SYM exported");
{
  const g = SYM.createGame({ seed: 1 });
  let threw = null;
  try { run(g, 1.0, 1 / 60); } catch (e) { threw = e; }
  ok(!threw, "renders 60 frames w/o throwing" + (threw ? " -> " + threw.stack : ""));
  ok(g.player.mode === "spirit", "starts as spirit");
}

// =====================================================================
section("2. Gravity & tile collision");
{
  const g = SYM.createGame({ seed: 2 });
  g.enemies = [];
  const y0 = g.player.y;
  run(g, 1.5, 1 / 60);
  ok(g.player.y > y0, "spirit falls under gravity");
  ok(g.player.onGround, "spirit lands and rests on solid ground");
  ok(g.player.y < g.lv.pxH, "did not fall through the floor");
}

// =====================================================================
section("3. Possession on contact");
{
  const g = SYM.createGame({ seed: 3 });
  const husk = g.enemies.find(e => e.type === "husk");
  // drift the spirit into the husk
  run(g, 2.5, 1 / 60, (gg) => { gg.input.right = (gg.player.x + 8 < husk.x); });
  ok(g.player.mode === "body", "spirit possesses a body on contact");
  ok(g.player.vit > 0 && g.player.vit === g.player.maxVit, "vitality filled on possess");
}

// =====================================================================
section("4. GATING — the right body for the obstacle");
// jump-gap (2 tiles): a Husk clears it
{
  const r = tryCross("husk", 7, 15, 12, huskCtrl, 2.4);
  ok(r.crossed && !r.fell, "Husk clears the 2-tile teaching jump-gap");
}
// dart-gap (6 tiles): Husk FAILS, Dart SUCCEEDS
{
  const rh = tryCross("husk", 18, 15, 26, huskCtrl, 2.4);
  ok(!rh.crossed && rh.fell, "Husk CANNOT cross the 6-tile dart-gap (falls in)");
  const rd = tryCross("dart", 18, 15, 26, dartCtrl, 2.4);
  ok(rd.crossed, "Dart (double-jump + dash) CROSSES the 6-tile gap");
}
// chasm (8 tiles): Floater flies across; a Husk cannot
{
  const rf = tryCross("floater", 38, 15, 48, floaterCtrl, 3.4);
  ok(rf.crossed, "Floater FLIES across the 8-tile chasm and lands");
  const rh = tryCross("husk", 38, 15, 48, huskCtrl, 2.4);
  ok(!rh.crossed && rh.fell, "Husk cannot cross the chasm");
}

// =====================================================================
section("5. Brute pound shatters the sealed wall; Husk swipe cannot");
function wallPresent(g) {
  for (let ty = 10; ty <= 16; ty++) if (SYM.tileAt(g.lv, 33, ty) === 4) return true;
  return false;
}
{
  const g = SYM.createGame({ seed: 5 }); g.enemies = [];
  placeAndPossess(g, "brute", 31, 16);
  run(g, 0.4, 1 / 60); // settle on ground
  ok(wallPresent(g), "sealed wall present before pound");
  SYM.useAction(g); // grounded -> immediate pound
  ok(!wallPresent(g), "Brute pound shatters the sealed wall");
}
{
  const g = SYM.createGame({ seed: 55 }); g.enemies = [];
  placeAndPossess(g, "husk", 31, 16);
  run(g, 0.4, 1 / 60);
  SYM.useAction(g); // swipe
  ok(wallPresent(g), "Husk swipe does NOT break the wall");
}

// =====================================================================
section("6. Decay economy & safe rooms");
{
  const g = SYM.createGame({ seed: 6 }); g.enemies = [];
  placeAndPossess(g, "husk", 14, 15); // not in a safe rect
  const v0 = g.player.vit;
  run(g, 1.0, 1 / 60);
  ok(g.player.vit < v0, "vitality decays while exposed");
  run(g, 30, 1 / 60);
  ok(g.player.mode === "spirit", "body crumbles to spirit when vitality hits 0");
}
{
  const g = SYM.createGame({ seed: 66 }); g.enemies = [];
  placeAndPossess(g, "husk", 52, 16); // inside safe rect [48,11,12,7]
  const v0 = g.player.vit;
  run(g, 3.0, 1 / 60);
  ok(Math.abs(g.player.vit - v0) < 0.2, "vitality holds steady in a safe room");
}

// =====================================================================
section("7. Spirit essence: bleeds when exposed, regens when safe");
{
  const g = SYM.createGame({ seed: 7 }); g.enemies = [];
  g.player.x = 18 * TS; g.player.y = 15 * TS; g.player.essence = 100;
  run(g, 4, 1 / 60);
  ok(g.player.essence < 100, "essence bleeds while exposed");
}
{
  const g = SYM.createGame({ seed: 77 }); g.enemies = [];
  g.player.x = 3 * TS; g.player.y = 14 * TS; g.player.essence = 50; // safe rect [0,13,9,5]
  run(g, 2, 1 / 60);
  ok(g.player.essence > 50, "essence regenerates in a safe room");
}

// =====================================================================
section("8. Elite guardian resists possession until wounded");
{
  const g = SYM.createGame({ seed: 8 });
  const w = g.enemies.find(e => e.type === "warden");
  ok(!SYM.canPossess(g, w), "full-HP Warden resists the blight");
  w.hp = w.maxHp * 0.4;
  ok(SYM.canPossess(g, w), "wounded Warden can be taken");
}

// =====================================================================
section("9. Reaching the rift wins the wing");
{
  const g = SYM.createGame({ seed: 9 }); g.enemies = [];
  placeAndPossess(g, "husk", g.def.goal.tx, g.def.goal.ty);
  g.player.x = g.def.goal.tx * TS; g.player.y = g.def.goal.ty * TS;
  SYM.update(g, 1 / 60);
  ok(g.phase === "win", "touching the rift wins");
}

// =====================================================================
section("10. Input plumbing");
{
  const g = SYM.createGame({ seed: 10 }); g.enemies = [];
  SYM.handleKey(g, "KeyD", true); ok(g.input.right === true, "KeyD -> input.right");
  SYM.handleKey(g, "KeyD", false); ok(g.input.right === false, "keyup clears right");
  SYM.handleKey(g, "Space", true); ok(g.input.jumpBuf > 0 && g.input.jumpHeld, "Space buffers jump + sets held");
  SYM.handleKey(g, "Space", false); // release (real input always has a keyup)
  // possess + jump actually launches
  placeAndPossess(g, "husk", 5, 15);
  run(g, 0.4, 1 / 60); // settle to ground
  const y0 = g.player.y;
  SYM.handleKey(g, "Space", true);   // fresh press
  let minY = y0; run(g, 0.45, 1 / 60, (gg) => { minY = Math.min(minY, gg.player.y); });
  ok(minY < y0 - 30, "buffered jump launches the body upward");
}

// =====================================================================
section("11. Full fuzz — random input, no throw, no NaN, in-bounds");
{
  const g = SYM.createGame({ seed: 4321 });
  let threw = null, frames = 0, s = 7;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  try {
    run(g, 120, 1 / 60, (gg) => {
      frames++;
      gg.input.left = rnd() < 0.35; gg.input.right = rnd() < 0.45;
      gg.input.jumpHeld = rnd() < 0.5;
      if (rnd() < 0.05) gg.input.jumpBuf = 0.12;
      if (rnd() < 0.08) gg.input.actBuf = 0.12;
      if (rnd() < 0.04) gg.input.ejectBuf = 0.12;
      if (gg.phase === "win") gg.phase = "play"; // keep stressing
      if (!isFinite(gg.player.x) || !isFinite(gg.player.y)) throw new Error("NaN pos @" + frames);
      if (gg.player.essence > gg.player.maxEssence + 1) throw new Error("essence overflow");
    });
  } catch (e) { threw = e; }
  ok(!threw, "120s fuzz no throw" + (threw ? " -> " + threw.stack : ""));
  ok(frames > 6000, "ran full sim (" + frames + " frames)");
  ok(g.player.x >= -50 && g.player.x <= g.lv.pxW + 50, "player stays within map bounds");
}

console.log("\n=====================================");
console.log("  PASS: " + pass + "   FAIL: " + fail);
console.log("=====================================");
process.exit(fail ? 1 : 0);
