'use strict';
// LAMPBLACK — core: constants, palette, RNG, math, event bus.
// All tuning numbers live here under LB.C so the numbers-pass touches one file.
var LB = (typeof LB !== 'undefined') ? LB : {};

// ---------- Palette (DESIGN §4.1 — locked hexes, names are constants) ----------
LB.PAL = {
  NIGHT: '#070a14',
  FLOOR_UNLIT: '#10131f',
  WALL: '#1c2233',
  WOOD: '#35281a', CARPET: '#3a2430', MARBLE: '#3d4358',
  LAMP_CORE: '#ffdca8', LAMP_EDGE: 'rgba(255,180,90,0)',
  CANDLE: '#ffc878', FIRE: '#ff9d5c', MOON: '#9db8d8', MOON_ALPHA: 0.25,
  ALERT_RAMP: ['#ffb85c', '#ffe0b0', '#fff4e4', '#ff8a70'], // CALM WARY ALARMED LOCKDOWN
  THIEF_CLOAK: '#171a24', THIEF_SHADOW: '#0d0f16', THIEF_HILITE: '#262b3a',
  SCARF: '#8a3138',
  GUARD_COAT: '#2b3a58', BRASS: '#c9a45c',
  CONE_BASE: 'rgba(255,205,120,0.13)', CONE_ALARM: 'rgba(255,90,60,0.22)',
  RING_PLAYER: '#e8ecf4', RING_GUARD: '#ffb85c', RING_LURE: '#7ab8ff',
  PARCHMENT: '#e6d5ae', INK: '#26201a', SOOT_TEXT: '#c8ccd8'
};

// ---------- Tuning constants (defaults-with-rationale; structures settled) ----------
LB.C = {
  TILE: 32,                       // px per logical tile
  // LIGHT (§2.1.1)
  LAMP_R: 4, CANDLE_R: 2, FIRE_R: 3, LANTERN_R: 3, DARKLANTERN_R: 2,
  FINE_WORK_L: 0.3,               // min light at work point for fine work
  // SIGHT (§2.1.2)
  CONE_HALF_DEG: 45,              // ~90° cone
  SIGHT_R_DARK: 2.5, SIGHT_R_LIT: 8,
  AWARE_K: 840,                   // dA/dt = K*(1-d/R)*M*L ; see design math
  AWARE_L_FLOOR: 0.3,             // L term = lerp(0.3,1,light) — never zero in cone
  MOTION_M: { still: 0.4, creep: 0.6, walk: 1.0, sprint: 1.6, takedown: 2.0 },
  AWARE_DECAY: 30,                // per second, after…
  AWARE_DECAY_DELAY: 1.0,         // …1s unseen; floors at last threshold crossed
  T_SUSPICIOUS: 35, T_INVESTIGATE: 70, T_DETECTED: 100,
  CIV_CONE_R: 3,                  // civilians: short, light-independent
  MARKSMAN_MIN_L: 0.35,           // marksman only sees lit targets
  // SOUND (§2.1.3) — loudness L in tiles at source
  DOOR_OPEN_MUL: 0.7, DOOR_CLOSED_MUL: 0.25,
  NOISE: { creepStep: 0, walkStep: 2, sprintStep: 6, creak: 4,
    glassCut: 1, glassSmash: 10, pickTick: 1, doorForce: 8, safePickTick: 1,
    safeDrill: 7, blackjack: 3, bodyDrag: 2, dumbwaiter: 3, gasValve: 5,
    coinLure: 3, thud2h: 3, scream: 12, shout: 12, whistleBlast: 12, catYowl: 5,
    oilSlip: 6, rushPick: 4, scuffle: 5 },
  MATERIAL_MUL: { carpet: 0.5, wood: 1.0, marble: 1.3, glass: 2.5, stone: 1.0 },
  ENCUMBER_NOISE: 0.08, ENCUMBER_SPEED: 0.04, SPRINT_LOCK_SLOTS: 5,
  HEAR_THRESH: 1.0, DOG_HEAR_MUL: 2.0,
  LURE_HABIT_WINDOW: 60,          // s — same lure class twice => +10 alert, no walk
  // SCENT (dogs)
  SCENT_DROP_S: 0.5, SCENT_TTL: 15, DOG_SCENT_R: 4,
  // SPEEDS (tiles/s)
  SPEED: { creep: 1.6, walk: 3.0, sprint: 5.2 },
  GUARD_SPEED: { patrol: 1.6, investigate: 2.6, chase: 5.2, search: 2.2 },
  // ALERTNESS ratchet (§2.3) — one-way, never decays
  ALERT_STAGES: [0, 25, 50, 80],  // CALM WARY ALARMED LOCKDOWN lower bounds
  ALERT_FEED: { detected: 25, bodyFound: 20, civilianScream: 10, loudNoise: 8,
    dousedCluster: 5, forcedEntry: 5, scoreMissing: 15, lureHabit: 10, roundsTick: 4 },
  ROUNDS_TICK_S: 90,
  // CAPTURE (§2.3)
  GRAB_S: 0.5, CHASE_LOSE_S: 3.0, IRON_NERVE_GRAB_S: 1.5,
  BRIBE_FLOOR: [200, 500, 1000],  // act 1/2/3
  // BAG (§2.4)
  BAG_SLOTS: 6, DUMBWAITER_SLOT_S: 10,
  // ECONOMY (§2.6)
  BIGJOB_BUYIN: [400, 900, 1600],
  SCORE_FENCE_MUL: 3,
  INTEL_COST: { plan: 60, patrols: 80, loot: 50, roster: 40 },
  // FEEL (§4)
  WALK_CAD: 0.05, CREEP_CAD: 0.03, SPRINT_CAD: 0.085,
  SHAKE: { detected: 2, doorForce: 3, oilSlip: 3, grabbed: 5, lastTrick: 6 },
  SHAKE_CAP: 6, SHAKE_DECAY: 0.85,
  SNUFF_MS: 220, NOTE_MAX_W: 320, NOTE_GAP_S: 8,
  MUSIC_BPM: 84, MUSIC_XFADE_S: 3,
  MIN_W: 1024, MIN_H: 600,
  LEITMOTIF: ['D5', 'F5', 'E5', 'A4', 'D5'] // the game theme, D minor, lazy swing
};
LB.STAGE_NAMES = ['CALM', 'WARY', 'ALARMED', 'LOCKDOWN'];

// ---------- RNG (mulberry32; seedable for authored/verifiable floors) ----------
LB.RNG = function (seed) {
  var s = seed >>> 0;
  var r = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = function (a, b) { return a + Math.floor(r() * (b - a + 1)); };
  r.pick = function (arr) { return arr[Math.floor(r() * arr.length)]; };
  r.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  r.chance = function (p) { return r() < p; };
  return r;
};

// ---------- Math helpers ----------
LB.M = {
  clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp: function (a, b, t) { return a + (b - a) * t; },
  dist: function (x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
  angTo: function (x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
  angDiff: function (a, b) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; },
  // velocity octant for 8-way facing (0=E, CCW-ordered index 0..7)
  octant: function (dx, dy) { return ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8; }
};

// Bresenham LOS over a solid grid. Returns true if unblocked.
LB.los = function (grid, x0, y0, x1, y1) {
  var ax = Math.floor(x0), ay = Math.floor(y0), bx = Math.floor(x1), by = Math.floor(y1);
  var dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
  var sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1, err = dx - dy;
  var x = ax, y = ay;
  while (true) {
    if (!(x === ax && y === ay) && !(x === bx && y === by)) {
      if (!grid[y] || grid[y][x] === undefined || grid[y][x]) return false;
    }
    if (x === bx && y === by) return true;
    var e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
};

// A* on tile grid. blocked(x,y) => bool ; returns [{x,y}] tile centers or null.
LB.astar = function (w, h, blocked, sx, sy, tx, ty, costFn) {
  sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
  if (sx === tx && sy === ty) return [{ x: sx + 0.5, y: sy + 0.5 }];
  if (blocked(tx, ty)) return null;
  var open = [{ x: sx, y: sy, g: 0, f: 0 }], came = {}, gScore = {};
  gScore[sx + ',' + sy] = 0;
  var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var iter = 0;
  while (open.length) {
    if (++iter > 20000) return null;
    var bi = 0;
    for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    var cur = open.splice(bi, 1)[0];
    if (cur.x === tx && cur.y === ty) {
      var path = [], k = tx + ',' + ty;
      while (k) { var p = k.split(','); path.push({ x: +p[0] + 0.5, y: +p[1] + 0.5 }); k = came[k]; }
      return path.reverse();
    }
    for (var d = 0; d < 4; d++) {
      var nx = cur.x + dirs[d][0], ny = cur.y + dirs[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || blocked(nx, ny)) continue;
      var step = 1 + (costFn ? costFn(nx, ny) : 0);
      var ng = cur.g + step, nk = nx + ',' + ny;
      if (gScore[nk] === undefined || ng < gScore[nk]) {
        gScore[nk] = ng; came[nk] = cur.x + ',' + cur.y;
        open.push({ x: nx, y: ny, g: ng, f: ng + Math.abs(nx - tx) + Math.abs(ny - ty) });
      }
    }
  }
  return null;
};

// ---------- Event bus (systems talk through events; teach.js listens too) ----------
LB.Bus = function () {
  var subs = {};
  return {
    on: function (ev, fn) { (subs[ev] = subs[ev] || []).push(fn); },
    emit: function (ev, data) {
      var l = subs[ev]; if (l) for (var i = 0; i < l.length; i++) l[i](data);
      var all = subs['*']; if (all) for (var j = 0; j < all.length; j++) all[j](ev, data);
    }
  };
};

// Note name -> frequency (for audio + headless checks of the leitmotif)
LB.noteHz = function (name) {
  var SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  var m = /^([A-G]#?)(\d)$/.exec(name);
  var n = SEMI[m[1]] + (12 * (+m[2] + 1));
  return 440 * Math.pow(2, (n - 69) / 12);
};

if (typeof module !== 'undefined') module.exports = LB;
