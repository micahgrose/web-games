/* GILT DOM smoke — boots the real page under stubs and drives the REAL
   pointer-event plumbing: synthetic pointerdown/move/up through the same
   listeners the browser would call. Every scene visited, every core
   interaction exercised. If a control freezes in the wild, it fails here first.
   node test/smoke.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error('  FAIL: ' + msg); }
}

// ---------- 2d context stub ----------
function makeCtx2D(canvas) {
  const grad = () => ({ addColorStop() { } });
  const ctx = {
    canvas,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px x',
    textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    shadowColor: '', shadowBlur: 0, lineCap: 'butt', globalCompositeOperation: 'source-over',
    save() { }, restore() { }, translate() { }, rotate() { }, scale() { },
    beginPath() { }, closePath() { }, moveTo() { }, lineTo() { }, arc() { }, arcTo() { },
    ellipse() { }, bezierCurveTo() { }, quadraticCurveTo() { }, rect() { },
    fill() { }, stroke() { }, clip() { },
    fillRect() { }, strokeRect() { }, clearRect() { },
    fillText() { }, strokeText() { },
    measureText(t) { return { width: (t ? String(t).length : 0) * 7 }; },
    createLinearGradient: grad, createRadialGradient: grad,
    createPattern() { return {}; }, setLineDash() { },
    drawImage() { }, getImageData() { return { data: new Uint8ClampedArray(4) }; }
  };
  return ctx;
}
function makeCanvas() {
  const c = {
    width: 0, height: 0,
    style: {},
    listeners: {},
    getContext() { return makeCtx2D(c); },
    addEventListener(type, fn) { (c.listeners[type] = c.listeners[type] || []).push(fn); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 800 }; }
  };
  return c;
}

// ---------- window/document stubs ----------
const mainCanvas = makeCanvas();
let rafCb = null;
let clock = 0;
const storageMem = {};
const sandbox = {
  console, Math, JSON, Date, Object, Array, String, Number, Boolean, isFinite, isNaN,
  parseInt, parseFloat, Uint8ClampedArray, Float32Array, Set, Map, Promise,
  setTimeout: (fn) => { setTimeout(fn, 0); }, clearTimeout,
  performance: { now: () => clock },
  requestAnimationFrame: cb => { rafCb = cb; },
  localStorage: {
    getItem: k => (k in storageMem ? storageMem[k] : null),
    setItem: (k, v) => { storageMem[k] = String(v); }
  },
  document: {
    getElementById: id => id === 'gilt' ? mainCanvas : null,
    createElement: tag => tag === 'canvas' ? makeCanvas() : {}
  },
  innerWidth: 1280, innerHeight: 800,
  addEventListener() { }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = ['copy.js', 'engine.js', 'games.js', 'art.js', 'cast.js', 'audio.js', 'scenes.js', 'tables.js', 'main.js'];
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
}
ok(!!sandbox.__GILT, 'the page booted under stubs');
const GI = sandbox.__GILT;
const { S, G, UI, E } = GI;

// deterministic rng for the run
G.rng = E.mulberry32(20260806);

// ---------- drivers: REAL event dispatch through registered listeners ----------
function fire(type, x, y) {
  for (const fn of (mainCanvas.listeners[type] || [])) {
    fn({ clientX: x, clientY: y, preventDefault() { } });
  }
}
let frameErr = null;
function frames(n, dtMs) {
  for (let i = 0; i < n; i++) {
    clock += (dtMs || 16.7);
    const cb = rafCb; rafCb = null;
    try { if (cb) cb(clock); } catch (e) { frameErr = frameErr || (S.curName + ': ' + e.stack); }
    if (!rafCb) break;
  }
}
function click(x, y) { fire('pointerdown', x, y); fire('pointerup', x, y); frames(3); }
function btn(id) { return UI.buttons.find(b => b.id === id && !b.disabled); }
function clickBtn(id) {
  const b = btn(id);
  if (!b) return false;
  click(b.x + b.w / 2, b.y + b.h / 2);
  return true;
}
function clearDialog() {
  let guard = 0;
  while (GI.Dialog.open && guard++ < 60) click(640, 400);
  return guard < 60;
}

// ---------- title → night intro → cage ----------
frames(20);
ok(S.curName === 'title', 'title is up');
ok(clickBtn('t:night'), 'the night door exists');
frames(40); // fade
ok(S.curName === 'intro', 'Sal gets his word in first');
ok(clearDialog(), 'Sal finishes his three beats');
frames(40);
ok(S.curName === 'cage', 'Mabel is next');
clearDialog();
ok(G.night && G.night.cash === 500 && G.night.debt === 12000, 'five hundred against twelve thousand');

// scratcher through the real pointer path
{
  const cashBefore = G.night.cash;
  ok(clickBtn('cage:scratch'), 'Gold Strike on sale');
  frames(5);
  ok(G.night.cash === cashBefore - 5, 'the card cost five');
  // rub all six spots with pointer moves
  for (let i = 0; i < 6; i++) {
    const sx = 640 - 150 + 52 + (i % 3) * 98, sy = 800 * 0.42 - 8 + Math.floor(i / 3) * 62;
    for (let k = 0; k < 9; k++) fire('pointermove', sx, sy);
    frames(2);
  }
  frames(5);
  const scene = S.scenes.cage;
  ok(scene.ticket && scene.ticket.done, 'foil comes off under the pointer');
  clickBtn('cage:tdone');
  frames(3);
}
// a marker signed at the window
{
  ok(clickBtn('cage:marker'), 'Mabel handles the paper');
  frames(3);
  clearDialog();
  ok(G.night.cash === 1495 - 5 + 510 || G.night.markers === 1, 'the marker landed'); // cash check loose; marker flag is the real assert
  ok(G.night.debt === 13300, 'thirteen hundred on the number');
}
clickBtn('hud:back');
frames(40);
ok(S.curName === 'floor', 'out to the floor');

// ---------- every pit, through the real click path ----------
const PIT_CLICKS = {
  blackjack: [500, 380], roulette: [735, 370], craps: [985, 375], baccarat: [620, 190],
  threecard: [860, 190], slots: [215, 375], vpoker: [215, 555], hilo: [1160, 190],
  keno: [1155, 375], bigsix: [400, 190], horses: [205, 185]
};
function toFloor() {
  if (S.curName !== 'floor') { clickBtn('hud:back'); frames(40); }
  ok(S.curName === 'floor', 'back on the floor (from ' + S.curName + ')');
}
function enterPit(name) {
  click(PIT_CLICKS[name][0], PIT_CLICKS[name][1]);
  frames(45);
  clearDialog();
  ok(S.curName === name, 'walked to ' + name + ' (got ' + S.curName + ')');
}

// blackjack: a full dealt hand, stand on whatever comes
{
  enterPit('blackjack');
  clickBtn('bj:d25');
  ok(S.scenes.blackjack.bet.amount === 25, 'chips click into the circle');
  const cash0 = G.night.cash;
  clickBtn('bj:deal');
  frames(80); // deal anims
  let guard = 0;
  while (S.scenes.blackjack.phase === 'play' && guard++ < 10) {
    if (!clickBtn('bj:stand')) frames(10);
    frames(30);
  }
  frames(120); // dealer + settle
  ok(S.scenes.blackjack.phase === 'done', 'the hand settled (phase ' + S.scenes.blackjack.phase + ')');
  ok(G.night.cash !== cash0 || S.scenes.blackjack.fin.returned === 25, 'money moved or pushed');
  ok(G.night.t > 0, 'the clock took its two minutes');
  toFloor();
}
// roulette: straight up on 17 by clicking the felt, then spin
{
  enterPit('roulette');
  // cell for 17: col=floor(16/3)=5, row=2-(16%3)=1 → x=70+56+5*46+22=356+..., compute like the scene does
  const cx = 70 + 56 + 5 * 46 + 22, cy = 470 + 1 * 44 + 22;
  click(cx, cy);
  ok(S.scenes.roulette.bets.length === 1 && S.scenes.roulette.bets[0].type === 'straight', 'a chip on 17, through the felt');
  clickBtn('rou:spin');
  frames(320); // ~5s spin
  ok(S.scenes.roulette.phase === 'bet' && S.scenes.roulette.bets.length === 0, 'the wheel settled');
  ok((G.night.flags.rHist || []).length === 1, 'the history board remembers');
  toFloor();
}
// craps: pass line through the felt, roll
{
  enterPit('craps');
  click(410, 646); // pass line
  ok(S.scenes.craps.tab.bets.pass > 0, 'money on the line');
  clickBtn('cr:roll');
  frames(100);
  ok(S.scenes.craps.rolling <= 0, 'dice came to rest');
  toFloor();
}
// slots: pull Pete
{
  enterPit('slots');
  const cash0 = G.night.cash;
  ok(clickBtn('sl:pull:pete'), 'Pete takes a dollar');
  frames(150);
  ok(S.scenes.slots.state.pete.spin <= 0, 'reels stopped');
  ok(G.night.cash <= cash0, 'the dollar went in (maybe some came back)');
  toFloor();
}
// video poker: deal, hold the first card, draw
{
  enterPit('vpoker');
  clickBtn('vp:deal');
  frames(10);
  ok(S.scenes.vpoker.phase === 'hold', 'five cards up');
  clickBtn('vp:hold:0');
  ok(S.scenes.vpoker.holds[0] === true, 'a card held by tapping it');
  clickBtn('vp:draw');
  frames(10);
  ok(S.scenes.vpoker.phase === 'ready', 'the draw settled');
  clickBtn('vp:switch');
  frames(5);
  ok(S.scenes.vpoker.machine === 'bad', 'the widow accepts visitors');
  toFloor();
}
// baccarat: banker bet, watch the tableau
{
  enterPit('baccarat');
  clickBtn('ba:on:banker');
  clickBtn('ba:d25');
  clickBtn('ba:deal');
  frames(300);
  ok(S.scenes.baccarat.phase === 'done', 'the tableau ran itself');
  toFloor();
}
// three-card: ante and play it out
{
  enterPit('threecard');
  clickBtn('tc:d25');
  clickBtn('tc:ante');
  frames(10);
  ok(S.scenes.threecard.phase === 'decide', 'three cards to look at');
  if (!clickBtn('tc:play')) clickBtn('tc:fold');
  frames(10);
  ok(S.scenes.threecard.phase === 'done', 'Marla settled it');
  toFloor();
}
// hi-lo: one rung then take it (or lose trying)
{
  enterPit('hilo');
  clearDialog(); // Len's napkin speech
  clickBtn('hl:d25');
  clickBtn('hl:start');
  frames(10);
  ok(S.scenes.hilo.phase === 'run', 'a card up at the bar');
  clickBtn(S.scenes.hilo.run.card <= 8 ? 'hl:high' : 'hl:low');
  frames(10);
  if (S.scenes.hilo.phase === 'run') { clickBtn('hl:take'); frames(10); }
  ok(S.scenes.hilo.phase === 'stake' || S.scenes.hilo.phase === 'dead', 'the ladder resolved');
  toFloor();
}
// keno: three numbers, a ticket, the draw
{
  enterPit('keno');
  click(100, 171); click(100 + 44, 171); click(100 + 88, 171);
  ok(S.scenes.keno.picks.length === 3, 'three numbers marked');
  clickBtn('ke:play');
  frames(260);
  ok(S.scenes.keno.phase === 'done', 'twenty balls out');
  toFloor();
}
// big six: five bucks on the 5, spin it
{
  enterPit('bigsix');
  clickBtn('b6:d5');
  const spot = UI.buttons.find(b => b.id === 'b6:on:5');
  ok(!!spot, 'the five spot is on the felt');
  click(spot.x + spot.w / 2, spot.y + spot.h / 2);
  ok((S.scenes.bigsix.bets['5'] || 0) > 0, 'a chip on the five');
  clickBtn('b6:spin');
  frames(330);
  ok(S.scenes.bigsix.phase === 'bet', 'the big wheel came around');
  toFloor();
}
// the simulcast: pick the 1 horse, small bet, watch the race
{
  enterPit('horses');
  clearDialog(); // Fingers' pitch
  const row = UI.buttons.find(b => b.id === 'ho:pick:0');
  ok(!!row, 'the tote board is posted');
  click(row.x + row.w / 2, row.y + row.h / 2);
  ok(S.scenes.horses.pick === 0, 'the one horse is ours');
  clickBtn('ho:d25');
  clickBtn('ho:post');
  frames(600); // the race runs ~9s
  ok(S.scenes.horses.phase === 'done', 'the race went off and paid');
  clickBtn('ho:next');
  frames(5);
  ok(S.scenes.horses.phase === 'bet' && !S.scenes.horses.race.ran, 'a fresh field posted');
  toFloor();
}

// ---------- overlays ----------
{
  clickBtn('hud:notebook');
  frames(3);
  ok(!!S.overlay, 'the notebook opens');
  click(640, 780); // outside / close button area
  clickBtn('nb:close');
  frames(3);
  ok(!S.overlay, 'and closes');
}

// ---------- the door, and the dawn ----------
{
  G.night.cash = 30000; // walk out a legend, for testing purposes
  clickBtn('floor:door');
  frames(60);
  ok(S.curName === 'ending', 'the door leads to dawn');
  ok(G.night.ending === 'gilt', 'thirty grand is the gilt ending');
  clearDialog();
  frames(10);
  clickBtn('end:done');
  frames(60);
  ok(S.curName === 'title', 'and back to the marquee');
  const saved = JSON.parse(storageMem['gilt_save_v1']);
  ok(saved.nights === 1 && saved.bestEnding === 'gilt' && saved.highroller, 'the save remembers the night');
}
// ---------- free play door ----------
{
  clickBtn('t:free');
  frames(60);
  ok(S.curName === 'floor' && G.night.freeplay, 'the free-play floor opens');
  ok(G.night.highroller === true, 'the Meridian Room limits apply after the gilt ending');
}

ok(!frameErr, 'no exceptions in any frame' + (frameErr ? ' — first: ' + frameErr : ''));
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
