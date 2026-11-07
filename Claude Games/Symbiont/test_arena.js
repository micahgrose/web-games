/* Headless harness for Symbiont. Drives the DOM-free simulation and also runs
   render() against a mock 2D context every frame to catch draw-time crashes.
   Run: node test_headless.js  */
const fs = require("fs");
const path = require("path");
const code = fs.readFileSync(path.join(__dirname, "game.js"), "utf8");
eval(code); // attaches globalThis.SYM (window is undefined in node -> audio/boot skipped)
const SYM = globalThis.SYM;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log("  ✗ FAIL: " + msg); } }
function section(s) { console.log("\n== " + s + " =="); }

// ---- mock canvas 2D context (records nothing, just must not throw) ----
function mockCtx() {
  const grad = { addColorStop() {} };
  const c = {
    canvas: { width: 960, height: 600 },
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    measureText: (t) => ({ width: (t ? t.length : 0) * 7 }),
    save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, setTransform(){},
    beginPath(){}, closePath(){}, moveTo(){}, lineTo(){}, arc(){}, arcTo(){},
    ellipse(){}, quadraticCurveTo(){}, bezierCurveTo(){}, rect(){},
    fill(){}, stroke(){}, fillRect(){}, strokeRect(){}, clearRect(){},
    fillText(){}, strokeText(){}, setLineDash(){}, clip(){},
  };
  return c;
}
const ctx = mockCtx();

// drive a game forward, rendering each frame, feeding optional per-frame fn
function run(g, seconds, dt, perFrame) {
  const steps = Math.floor(seconds / dt);
  for (let i = 0; i < steps; i++) {
    if (perFrame) perFrame(g, i * dt);
    SYM.update(g, dt);
    SYM.render(g, ctx); // must never throw
  }
}

// =====================================================================
section("1. Load + render smoke");
ok(!!SYM, "SYM exported");
ok(typeof SYM.createGame === "function", "createGame present");
{
  const g = SYM.createGame({ seed: 1 });
  SYM.startTutorial(g);
  let threw = null;
  try { run(g, 1.0, 1 / 60); } catch (e) { threw = e; }
  ok(!threw, "tutorial renders 60 frames without throwing" + (threw ? " -> " + threw.stack : ""));
}

// =====================================================================
section("2. Possession core verb");
{
  const g = SYM.createGame({ seed: 2 });
  SYM.startTutorial(g);
  const husk = g.enemies[0];
  ok(g.player.mode === "spirit", "starts as spirit");
  ok(SYM.canPossess(g, husk), "dormant husk is possessable");
  SYM.possess(g, husk);
  ok(g.player.mode === "body" && g.player.host === husk, "possess -> body mode, host set");
  ok(g.player.vit > 0 && g.player.vit === g.player.maxVit, "vitality filled on possess");
  ok(g.tutStep === 1, "tutorial advanced to step 1 on first possess");
}

// =====================================================================
section("3. Decay economy ejects you");
{
  const g = SYM.createGame({ seed: 3 });
  const e = SYM.makeEnemy(g, "husk", 480, 300);
  g.enemies.push(e);
  g.phase = "fight";
  SYM.possess(g, e);
  const vit0 = g.player.vit;
  run(g, 0.5, 1 / 60);
  ok(g.player.vit < vit0, "vitality drains over time while possessing");
  // ride it all the way down
  run(g, 30, 1 / 60);
  ok(g.player.mode === "spirit", "body crumbles -> back to spirit when vitality hits 0");
}

// =====================================================================
section("4. Bodiless essence bleed (urgency / fail state)");
{
  const g = SYM.createGame({ seed: 4 });
  g.phase = "fight"; // no enemies, pure spirit
  g.player.essence = 100;
  run(g, 5, 1 / 60);
  ok(g.player.essence < 100, "essence bleeds while bodiless past grace");
  run(g, 30, 1 / 60);
  ok(g.phase === "dead", "starving spirit eventually dies");
}

// =====================================================================
section("5. Elites resist possession until wounded");
{
  const g = SYM.createGame({ seed: 5 });
  const rev = SYM.makeEnemy(g, "revenant", 480, 300);
  g.enemies.push(rev);
  ok(!SYM.canPossess(g, rev), "full-HP elite NOT possessable");
  rev.hp = rev.maxHp * 0.4;
  ok(SYM.canPossess(g, rev), "wounded elite (below will threshold) IS possessable");
}

// =====================================================================
section("6. Attacks damage & kill; kills drop motes + count");
{
  const g = SYM.createGame({ seed: 6 });
  const host = SYM.makeEnemy(g, "husk", 480, 300); g.enemies.push(host);
  const victim = SYM.makeEnemy(g, "husk", 510, 300); g.enemies.push(victim);
  g.phase = "fight";
  SYM.possess(g, host);
  g.player.aimx = 520; g.player.aimy = 300; g.player.atkCd = 0;
  const hp0 = victim.hp; const kills0 = g.kills;
  SYM.useAttack(g);
  ok(victim.hp < hp0 || victim.dead, "melee swipe damages adjacent enemy");
  // kill it outright
  victim.hp = 1; g.player.atkCd = 0; g.player.aimx = 520;
  SYM.useAttack(g);
  ok(g.kills > kills0, "kill counter increments");
  ok(g.motes.length > 0, "kill drops essence motes");
}

// =====================================================================
section("7. Damage routing: spirit loses essence, body loses HP");
{
  const g = SYM.createGame({ seed: 7 });
  g.phase = "fight";
  g.player.invuln = 0; const ess0 = g.player.essence;
  SYM.damagePlayer(g, 10, 480, 300);
  ok(g.player.essence < ess0, "spirit takes essence damage");

  const host = SYM.makeEnemy(g, "warden", 480, 300); g.enemies.push(host);
  SYM.possess(g, host); g.player.invuln = 0;
  const ess1 = g.player.essence, hhp0 = host.hp;
  SYM.damagePlayer(g, 10, 600, 300);
  ok(host.hp < hhp0, "body absorbs damage as HP");
  ok(g.player.essence === ess1, "essence untouched while bodied");
}

// =====================================================================
section("8. Wave clear -> reward -> choose -> progress");
{
  const g = SYM.createGame({ seed: 8 });
  SYM.startWave(g, 1);
  ok(g.phase === "fight" && g.enemies.length > 0, "wave 1 spawned enemies");
  // nuke all hostiles
  g.enemies.forEach(e => { e.hp = 0; });
  for (let i = 0; i < g.enemies.length; i++) SYM.damageEnemy(g, g.enemies[i], 999, 0, 0);
  SYM.update(g, 1 / 60);
  ok(g.phase === "reward" && g.rewardChoices && g.rewardChoices.length === 3, "clearing wave offers 3 traits");
  const choice = g.rewardChoices[0];
  SYM.chooseReward(g, choice);
  ok(g.traits[choice], "chosen trait applied");
  ok(g.phase === "fight" && g.wave === 2, "advances to wave 2");
}

// =====================================================================
section("9. Boss spawns and can be defeated -> win");
{
  const g = SYM.createGame({ seed: 9 });
  SYM.startBoss(g);
  ok(g.boss && g.boss.type === "maw", "boss spawned");
  ok(!SYM.canPossess(g, g.boss), "boss cannot be possessed");
  g.boss.hp = 1;
  SYM.damageEnemy(g, g.boss, 999, 0, 0);
  ok(g.phase === "win", "killing boss wins the game");
}

// =====================================================================
section("10. Input plumbing (handleKey -> input vars -> doLeap)");
{
  const g = SYM.createGame({ seed: 10 });
  g.phase = "fight";
  SYM.handleKey(g, "KeyD", true);
  ok(g.input.right === true, "KeyD sets input.right");
  SYM.handleKey(g, "KeyD", false);
  ok(g.input.right === false, "keyup clears input.right");
  // spirit leap via doLeap
  g.player.mode = "spirit"; g.player.leapCd = 0;
  g.player.aimx = 600; g.player.aimy = 300; g.player.x = 480; g.player.y = 300;
  SYM.doLeap(g);
  ok(g.player.leaping && g.player.vx > 0, "doLeap launches spirit toward aim (+x)");
  // leap into a host = possession during flight
  const tgt = SYM.makeEnemy(g, "husk", 540, 300); g.enemies.push(tgt);
  run(g, 0.3, 1 / 60);
  ok(g.player.mode === "body", "leaping into an enemy possesses it (chain-hop plumbing)");
}

// =====================================================================
section("11. Eject plumbing crumbles old body and re-spirits");
{
  const g = SYM.createGame({ seed: 11 });
  const e = SYM.makeEnemy(g, "brute", 480, 300); g.enemies.push(e);
  g.phase = "fight"; SYM.possess(g, e);
  SYM.eject(g, 1, 0);
  ok(g.player.mode === "spirit", "eject returns to spirit");
  ok(e.dead, "ejected body crumbles (dies)");
  ok(g.player.vx > 0, "eject launches spirit toward aim direction");
}

// =====================================================================
section("12. Full fuzz run — random input, never throws, stays valid");
{
  const g = SYM.createGame({ seed: 1234 });
  SYM.startTutorial(g);
  let threw = null, frames = 0;
  let s = 99;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  try {
    run(g, 90, 1 / 60, (gg, t) => {
      frames++;
      // random move
      gg.input.up = rnd() < 0.4; gg.input.down = rnd() < 0.3;
      gg.input.left = rnd() < 0.3; gg.input.right = rnd() < 0.4;
      gg.player.aimx = rnd() * 960; gg.player.aimy = rnd() * 600;
      if (rnd() < 0.04) SYM.doLeap(gg);
      if (rnd() < 0.12) SYM.useAttack(gg);
      if (gg.phase === "reward" && gg.rewardChoices) SYM.chooseReward(gg, gg.rewardChoices[0]);
      if (gg.phase === "win" || gg.phase === "dead") { gg.player.essence = 100; /* keep going */ }
      // invariants
      if (!isFinite(gg.player.x) || !isFinite(gg.player.y)) throw new Error("player pos NaN at frame " + frames);
      if (gg.player.essence > gg.player.maxEssence + 1) throw new Error("essence overflow");
    });
  } catch (e) { threw = e; }
  ok(!threw, "90s fuzz run no throw" + (threw ? " -> " + threw.stack : ""));
  ok(frames > 5000, "ran a full simulation (" + frames + " frames)");
  ok(g.player.x >= 0 && g.player.x <= 960, "player stays in bounds");
}

// =====================================================================
console.log("\n=====================================");
console.log("  PASS: " + pass + "   FAIL: " + fail);
console.log("=====================================");
process.exit(fail ? 1 : 0);
