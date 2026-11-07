'use strict';
// LAMPBLACK — art (DESIGN §4.3–§4.4, §4.7): baked bodies + procedural legs
// (the walk-cycle recipe that passed), 3-tone shading, no shapes-with-eyes.
// All sprites baked to offscreen canvases at init; render.js composites.
var LB = (typeof LB !== 'undefined') ? LB : (typeof module !== 'undefined' ? require('./core.js') : {});

LB.Art = (function () {
  var P = LB.PAL;
  var art = { ready: false, thief: {}, guards: {}, magpie: {}, props: {} };

  function mk(w, h) {
    var c = (typeof document !== 'undefined') ? document.createElement('canvas') : { width: w, height: h, getContext: function () { return null; } };
    c.width = w; c.height = h;
    return c;
  }
  function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }

  // ---------- THE THIEF: 5 baked bodies, 20×28 logical (legs drawn separately) ----------
  // 3-tone: base THIEF_CLOAK, shadow, highlight. Face = void under hood; glints only in light.
  function bakeThiefBody(facing) {
    var c = mk(20, 22), g = c.getContext('2d');
    if (!g) return c;
    var B = P.THIEF_CLOAK, S = P.THIEF_SHADOW, H = P.THIEF_HILITE;
    if (facing === 'front' || facing === 'f34') {
      px(g, 5, 8, 10, 12, B);                    // torso/cloak
      px(g, 4, 12, 12, 8, B);                    // cloak flare
      px(g, 5, 8, 3, 12, S);                     // left fold shadow
      px(g, 13, 9, 2, 10, H);                    // right rim light
      px(g, 5, 0, 10, 9, B);                     // hood
      px(g, 6, 1, 8, 7, S);                      // hood interior
      px(g, 7, 3, 6, 4, '#05060b');              // the void (face)
      px(g, 5, 0, 2, 8, H);                      // hood rim
      if (facing === 'f34') { px(g, 12, 3, 3, 5, B); px(g, 4, 10, 2, 9, S); }
      px(g, 14, 11, 4, 6, S);                    // satchel base (right hip) — swells at draw time
      px(g, 14, 11, 4, 1, '#4a3a22');            // strap
    } else if (facing === 'back' || facing === 'b34') {
      px(g, 5, 8, 10, 12, B);
      px(g, 4, 12, 12, 8, B);
      px(g, 12, 8, 3, 12, S);
      px(g, 5, 9, 2, 10, H);
      px(g, 5, 0, 10, 9, B);                     // hood from behind: full cloth
      px(g, 6, 1, 8, 8, facing === 'b34' ? S : B);
      px(g, 5, 0, 10, 2, H);
      px(g, 2, 11, 4, 6, S);                     // satchel peeking left
      px(g, 2, 11, 4, 1, '#4a3a22');
    } else { // side (right-facing; left = mirrored at draw)
      px(g, 6, 8, 9, 12, B);
      px(g, 5, 12, 10, 8, B);
      px(g, 6, 9, 2, 10, S);                     // back edge shadow
      px(g, 13, 9, 2, 10, H);                    // chest rim
      px(g, 6, 0, 10, 9, B);                     // hood profile
      px(g, 8, 2, 6, 5, S);
      px(g, 11, 3, 3, 3, '#05060b');             // face void, forward
      px(g, 6, 0, 10, 2, H);
      px(g, 8, 12, 5, 6, S);                     // satchel on hip
      px(g, 8, 12, 5, 1, '#4a3a22');
    }
    return c;
  }

  // 8-frame leg cycle: contact/down/passing/up ×2. Values = [frontLegDX, frontDY, backDX, backDY, bodyBob]
  // bodyBob per recipe: down +0.7 / up −0.9.
  var LEG_FRAMES = [
    [3, 0, -3, 0, 0],     // contact
    [2, 0, -2, 1, 0.7],   // down
    [0, -1, 0, 0, 0],     // passing
    [-2, -2, 2, 0, -0.9], // up
    [-3, 0, 3, 0, 0],     // contact (switched)
    [-2, 1, 2, 0, 0.7],   // down
    [0, 0, 0, -1, 0],     // passing
    [2, 0, -2, -2, -0.9]  // up
  ];
  art.legFrame = function (phase) { return Math.floor(phase / (Math.PI / 4)) % 8; };

  // Draw the thief. o: {facingOct, phase, pose, mode, bagFrac, light, scarf:[{x,y}] screen pts, walkAmt}
  art.drawThief = function (g, sx, sy, o) {
    o = o || {};
    var oct = o.facingOct || 0;
    // octants: 0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE → body pick + mirror
    var map = [
      { b: 'side', m: false }, { b: 'f34', m: false }, { b: 'front', m: false }, { b: 'f34', m: true },
      { b: 'side', m: true }, { b: 'b34', m: true }, { b: 'back', m: false }, { b: 'b34', m: false }
    ][oct];
    var body = art.thief[map.b];
    var fr = LEG_FRAMES[art.legFrame(o.phase || 0)];
    var wa = o.walkAmt !== undefined ? o.walkAmt : 1;
    var bob = fr[4] * wa;
    var crouch = o.pose === 'creep' || o.mode === 'creep' ? 2 : 0;
    var lean = o.mode === 'sprint' ? 2 : 0;
    var kneel = (o.pose === 'kneel');
    g.save();
    g.translate(Math.round(sx), Math.round(sy + bob + crouch));
    if (map.m) g.scale(-1, 1);
    if (lean) g.transform(1, 0, -0.12, 1, lean, 0);
    // scarf-tail: the ONE saturated accent (drawn under the hood, over the body)
    if (o.scarf) {
      g.fillStyle = P.SCARF;
      for (var i = 0; i < o.scarf.length; i++) {
        var n = o.scarf[i];
        g.fillRect(Math.round(n.x - sx) * (map.m ? -1 : 1) - 1, Math.round(n.y - sy) + 4, 3 - i * 0.5, 3 - i * 0.5);
      }
    }
    if (o.pose === 'hide') { // eyes-glint pair in the wardrobe crack
      px(g, -2, -4, 1, 1, '#cfd6e4'); px(g, 2, -4, 1, 1, '#cfd6e4');
      g.restore(); return;
    }
    // legs (procedural): splay on front/back, scissor on side/diagonals
    var sideView = (map.b === 'side' || map.b === 'f34' || map.b === 'b34');
    g.fillStyle = P.THIEF_SHADOW;
    if (kneel) {
      g.fillRect(-4, 6, 4, 3); g.fillRect(1, 4, 3, 5);
    } else if (sideView) { // scissor
      g.fillRect(-1 + fr[0] * wa, 4 + fr[1] * wa, 3, 6 - Math.abs(fr[1]) * wa);
      g.fillStyle = '#0a0c12';
      g.fillRect(-1 + fr[2] * wa, 4 + fr[3] * wa, 3, 6 - Math.abs(fr[3]) * wa);
    } else { // splay
      g.fillRect(-4, 4 + fr[1] * wa, 3, 6 - fr[1] * wa);
      g.fillStyle = '#0a0c12';
      g.fillRect(1, 4 + fr[3] * wa, 3, 6 - fr[3] * wa);
    }
    // body (baked) — centered: body canvas 20×22, feet at ~+10
    if (body && body.width) g.drawImage(body, -10, -12);
    // satchel swell: strain marks appear as it fills (§4.3 — carry state is readable art)
    var bagFrac = o.bagFrac || 0;
    if (bagFrac > 0) {
      var bw = 2 + Math.round(bagFrac * 4);
      g.fillStyle = '#241d12';
      g.fillRect(3, -1, bw, 4 + Math.round(bagFrac * 3));
      g.fillStyle = '#4a3a22';
      g.fillRect(3, -1, bw, 1);
      if (bagFrac > 0.8) { g.fillStyle = '#5a4426'; g.fillRect(3 + bw - 1, 0, 1, 5); } // strap strain
    }
    // face glints only in light (ℓ>0.5) and only on forward facings
    if ((o.light || 0) > 0.5 && (map.b === 'front' || map.b === 'f34' || map.b === 'side')) {
      g.fillStyle = '#aeb6c6';
      if (map.b === 'side') g.fillRect(2, -8, 1, 1);
      else { g.fillRect(-2, -8, 1, 1); g.fillRect(1, -8, 1, 1); }
    }
    // pose overlays
    if (o.pose === 'snuff') { g.fillStyle = P.THIEF_CLOAK; g.fillRect(6, -6, 5, 2); }        // reach arm
    if (o.pose === 'swing') { g.fillStyle = P.THIEF_SHADOW; g.fillRect(5, -8, 2, 6); }       // blackjack up
    if (o.pose === 'carry') { g.fillStyle = P.THIEF_CLOAK; g.fillRect(-6, -10, 12, 2); }     // arms up under load
    if (o.pose === 'grabbed') { g.translate(Math.sin(Date.now() / 30) * 1.5, 0); }
    g.restore();
  };

  // ---------- GUARDS: one silhouette each (§2.8 table), baked, + accessories ----------
  function bakeGuard(type) {
    var c = mk(22, 26), g = c.getContext('2d');
    if (!g) return c;
    var C0 = P.GUARD_COAT, S = '#1d2940', H = '#3c4f74', BR = P.BRASS;
    switch (type) {
      case 'watchman': // long coat, tall hat, lantern arm
        px(g, 6, 9, 10, 14, C0); px(g, 6, 9, 3, 14, S); px(g, 13, 10, 2, 12, H);
        px(g, 7, 4, 8, 5, '#d8c9a8'); px(g, 8, 5, 6, 3, '#b09a72');          // face
        px(g, 6, 0, 10, 4, '#12141c'); px(g, 5, 3, 12, 1, '#12141c');        // tall hat
        px(g, 8, 12, 6, 1, BR);                                              // buttons row
        px(g, 15, 12, 4, 2, C0);                                             // lantern arm
        break;
      case 'sentry': // slumped chair, chin on chest
        px(g, 5, 12, 12, 10, C0); px(g, 5, 12, 3, 10, S);
        px(g, 7, 7, 8, 6, '#d8c9a8'); px(g, 8, 11, 6, 2, S);                 // chin down
        px(g, 6, 5, 10, 3, '#12141c');                                       // cap tipped
        px(g, 3, 20, 16, 3, '#241a10');                                      // chair
        break;
      case 'warden': // hunched, huge key ring
        px(g, 5, 10, 12, 13, C0); px(g, 5, 10, 4, 13, S);
        px(g, 7, 6, 8, 5, '#d8c9a8');
        px(g, 6, 3, 10, 3, '#2a2318');                                       // flat cap
        px(g, 4, 8, 4, 4, C0);                                               // hunch
        px(g, 15, 14, 4, 4, BR); px(g, 16, 15, 2, 2, S);                     // KEY RING
        break;
      case 'pair': // matched bobbies, capes
        px(g, 6, 9, 10, 14, C0); px(g, 4, 9, 14, 6, '#22304a');              // cape
        px(g, 7, 4, 8, 5, '#d8c9a8');
        px(g, 6, 0, 10, 5, '#12141c'); px(g, 8, 0, 6, 2, '#0a0b10');         // helmet
        px(g, 10, 1, 2, 1, BR);                                              // badge
        break;
      case 'hound': // the dog itself (handler baked as watchman-like)
        c.width = 26; c.height = 16; g = c.getContext('2d');
        px(g, 4, 6, 18, 6, '#3a3226'); px(g, 4, 6, 18, 2, '#2a2318');
        px(g, 20, 3, 6, 5, '#3a3226'); px(g, 24, 4, 2, 2, '#241d12');        // head + muzzle
        px(g, 20, 2, 2, 2, '#2a2318');                                       // ear
        px(g, 3, 6, 3, 3, '#2a2318');                                        // tail
        break;
      case 'handler':
        px(g, 6, 9, 10, 14, C0); px(g, 6, 9, 3, 14, S);
        px(g, 7, 4, 8, 5, '#d8c9a8');
        px(g, 6, 1, 10, 3, '#12141c');
        px(g, 15, 13, 5, 1, '#7a6a4a');                                      // leash
        break;
      case 'sergeant': // plumed helmet, sabre
        px(g, 6, 9, 10, 14, C0); px(g, 6, 9, 3, 14, S); px(g, 13, 10, 2, 12, H);
        px(g, 7, 4, 8, 5, '#d8c9a8');
        px(g, 6, 0, 10, 5, '#12141c'); px(g, 9, -2, 3, 4, '#a03a3a');        // plume
        px(g, 16, 12, 2, 9, '#9aa4b8'); px(g, 15, 12, 4, 1, BR);             // sabre
        px(g, 8, 12, 6, 1, BR); px(g, 8, 14, 6, 1, BR);
        break;
      case 'marksman': // long rifle, perched
        px(g, 6, 10, 10, 12, C0); px(g, 6, 10, 3, 12, S);
        px(g, 7, 5, 8, 5, '#d8c9a8');
        px(g, 6, 2, 10, 3, '#1a2030');
        px(g, 14, 2, 2, 16, '#4a3a26'); px(g, 14, 1, 2, 3, '#2c343f');       // RIFLE
        break;
      case 'tough': // broad, cap, cosh
        px(g, 4, 10, 14, 13, '#3a3430'); px(g, 4, 10, 4, 13, '#2a2420');
        px(g, 7, 5, 9, 5, '#c9b596');
        px(g, 6, 2, 10, 3, '#4a4034');                                       // flat cap
        px(g, 17, 14, 2, 6, '#241d12');                                      // cosh
        break;
      case 'civilian': // gown OR livery: gown by default
        px(g, 5, 12, 12, 11, '#5a3a54'); px(g, 4, 18, 14, 5, '#4a2c44');     // gown + hem
        px(g, 7, 8, 8, 5, '#3a2a3c');                                        // bodice
        px(g, 8, 3, 6, 5, '#d8c9a8');
        px(g, 7, 1, 8, 3, '#7a6248');                                        // coiffure
        px(g, 10, 13, 2, 2, BR);                                             // candlestick glint
        break;
      case 'oldcopper': // massive greatcoat to the floor, bullseye lantern, 1.5× mass
        c.width = 28; c.height = 32; g = c.getContext('2d');
        px(g, 5, 8, 18, 23, '#232a3a'); px(g, 5, 8, 6, 23, '#161c28');       // greatcoat
        px(g, 20, 9, 3, 20, '#2e3a52');
        px(g, 8, 3, 12, 6, '#c9b596'); px(g, 9, 6, 10, 3, '#8a765a');        // heavy jaw
        px(g, 7, 0, 14, 4, '#12141c');                                       // low brim
        px(g, 22, 14, 5, 6, '#3a3222'); px(g, 23, 15, 3, 3, '#ffdca8');      // BULLSEYE LANTERN
        px(g, 10, 12, 8, 1, '#3a4258');
        break;
    }
    return c;
  }

  // Draw a guard entity (render passes anim state). o: {phase, pose, walkAmt, shutterOpen}
  art.drawGuard = function (g, type, sx, sy, facing, o) {
    o = o || {};
    var body = art.guards[type] || art.guards.watchman;
    var fr = LEG_FRAMES[art.legFrame(o.phase || 0)];
    var wa = o.walkAmt !== undefined ? o.walkAmt : (o.pose === 'walk' || o.pose === 'run' ? 1 : 0);
    var mirror = Math.cos(facing || 0) < 0;
    g.save();
    g.translate(Math.round(sx), Math.round(sy + fr[4] * wa));
    if (mirror) g.scale(-1, 1);
    if (type === 'hound') {
      // 4-frame lope
      var lf = Math.floor((o.phase || 0) / (Math.PI / 2)) % 4;
      g.translate(0, [0, -1, 0, 1][lf]);
      if (body && body.width) g.drawImage(body, -13, -8);
      g.fillStyle = '#241d12';
      g.fillRect(-8 + [2, 0, -2, 0][lf], 4, 2, 3); g.fillRect(6 + [-2, 0, 2, 0][lf], 4, 2, 3);
      g.restore(); return;
    }
    if (type === 'sentry' && o.pose === 'doze') {
      var bob = Math.sin((o.snoreT || Date.now() / 1000) * 1.6) * 0.8; // chest-rise snore bob
      g.translate(0, bob);
      if (body && body.width) g.drawImage(body, -11, -14);
      g.restore(); return;
    }
    // legs
    g.fillStyle = '#141a28';
    if (o.pose === 'ko') {
      g.rotate(Math.PI / 2); g.translate(2, -4);
    } else {
      g.fillRect(-3 + fr[0] * wa * 0.8, 6, 3, 6 - Math.abs(fr[1]) * wa);
      g.fillRect(1 + fr[2] * wa * 0.8, 6, 3, 6 - Math.abs(fr[3]) * wa);
    }
    var big = type === 'oldcopper';
    if (body && body.width) g.drawImage(body, big ? -14 : -11, big ? -22 : -16);
    // accessories synced to gait
    if (type === 'watchman') { // lantern-arm swing; its light pool sways WITH it (render reads lanternDX)
      var sw = Math.sin(o.phase || 0) * 2;
      g.fillStyle = '#3a3222'; g.fillRect(6 + sw, -2, 3, 4);
      g.fillStyle = P.LAMP_CORE; g.fillRect(7 + sw, -1, 1, 2);
    }
    if (type === 'warden') { // key ring bob on contact frames
      var kb = (art.legFrame(o.phase || 0) % 4 === 0) ? 1 : 0;
      g.fillStyle = P.BRASS; g.fillRect(6, 0 + kb, 2, 2);
    }
    if (type === 'sergeant' && o.pose === 'point') { g.fillStyle = P.GUARD_COAT; g.fillRect(6, -10, 7, 2); }
    if (type === 'oldcopper') { // the shutter: lantern beam only when open
      if (o.shutterOpen) { g.fillStyle = 'rgba(255,220,168,0.5)'; g.fillRect(10, -8, 6, 4); }
      g.fillStyle = o.shutterOpen ? P.LAMP_CORE : '#3a3222';
      g.fillRect(9, -7, 2, 2);
    }
    g.restore();
  };
  art.lanternDX = function (phase) { return Math.sin(phase || 0) * 2 / LB.C.TILE; }; // light pool sway, tiles

  // ---------- MAGPIE: 96×96 bust ×3 expressions (§4.7) ----------
  function bakeMagpie(expr) {
    var c = mk(96, 96), g = c.getContext('2d');
    if (!g) return c;
    px(g, 0, 0, 96, 96, '#1a1512');                                          // shop gloom
    px(g, 8, 84, 80, 12, '#241c12');                                         // counter clutter base
    px(g, 12, 80, 10, 6, P.BRASS); px(g, 70, 82, 12, 4, '#7a8a9a'); px(g, 30, 82, 8, 5, '#8a5a3a');
    px(g, 28, 40, 40, 46, '#2e2433');                                        // shawl mass
    for (var i = 0; i < 7; i++) px(g, 28 + i * 6, 60 + (i % 2) * 4, 5, 14, i % 2 ? '#232a3a' : '#3a3142'); // magpie-feather shawl
    px(g, 44, 62, 8, 9, '#d8cfc0'); px(g, 46, 64, 4, 5, '#a89478');          // cameo brooch (stolen, obviously)
    px(g, 36, 22, 24, 26, '#d0bda0');                                        // face
    px(g, 36, 22, 24, 4, '#b5a488');
    px(g, 34, 12, 28, 12, '#b8b4ac'); px(g, 40, 6, 16, 10, '#c8c4bc');       // silver bun
    px(g, 42, 4, 12, 6, '#a8a49c');
    // sharp eyes ×3 expressions
    if (expr === 'delighted') {
      px(g, 40, 32, 6, 2, '#2a2320'); px(g, 52, 32, 6, 2, '#2a2320');        // crinkled
      px(g, 42, 42, 12, 3, '#8a4a42');                                       // wide grin
      px(g, 40, 30, 6, 1, '#6a5a48'); px(g, 52, 30, 6, 1, '#6a5a48');
    } else if (expr === 'needling') {
      px(g, 40, 31, 6, 3, '#2a2320'); px(g, 52, 33, 6, 2, '#2a2320');        // one brow up
      px(g, 39, 28, 8, 2, '#6a5a48');
      px(g, 44, 43, 8, 2, '#7a4a42');                                        // pressed lips
    } else { // appraising (default)
      px(g, 40, 32, 6, 3, '#2a2320'); px(g, 52, 32, 6, 3, '#2a2320');
      px(g, 41, 33, 2, 1, '#e8e4da'); px(g, 53, 33, 2, 1, '#e8e4da');        // glint: she's pricing you
      px(g, 43, 43, 10, 2, '#8a5a52');
    }
    px(g, 44, 37, 8, 3, '#c0ac90');                                          // nose
    // the jackdaw on her shoulder (it reacts too)
    var puff = expr === 'delighted' ? 2 : 0;
    px(g, 66, 40 - puff, 12 + puff, 10 + puff, '#20242e');
    px(g, 74, 36 - puff, 7, 7, '#2a2f3a'); px(g, 79, 38 - puff, 3, 2, '#4a4438'); // head + beak
    px(g, 76, 39 - puff, 1, 1, '#cfd6e4');                                   // eye
    px(g, 64, 48, 10, 3, '#181c24');                                         // tail
    return c;
  }

  art.init = function () {
    if (art.ready) return art;
    ['front', 'back', 'side', 'f34', 'b34'].forEach(function (f) { art.thief[f] = bakeThiefBody(f); });
    ['watchman', 'sentry', 'warden', 'pair', 'hound', 'handler', 'sergeant', 'marksman', 'tough', 'civilian', 'oldcopper']
      .forEach(function (t) { art.guards[t] = bakeGuard(t); });
    ['appraising', 'delighted', 'needling'].forEach(function (e) { art.magpie[e] = bakeMagpie(e); });
    art.ready = true;
    return art;
  };

  return art;
})();

if (typeof module !== 'undefined') module.exports = LB;
