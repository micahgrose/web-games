/* GILT — the cast. Twelve people who work here or might as well.
   Everyone gets a silhouette, a posture, a face with bones in it,
   breath, blinks, and one habit. Nobody is a shape with eyes. */
(function (root) {
  'use strict';
  const A = root.GiltArt;
  const { PAL, FONT, TAU, rr, poly, mix, alpha, label, lerp, clamp } = A;

  // ---------- shared figure kit ----------
  const SKIN = {
    warm: { base: '#e0b48c', shade: '#b78a62', line: '#7a5138' },
    pale: { base: '#e8c9a8', shade: '#c2a077', line: '#8a6a48' },
    olive: { base: '#c9a276', shade: '#a07c52', line: '#6e5232' },
    ruddy: { base: '#dda586', shade: '#b47c5c', line: '#84523c' }
  };

  function blinkAt(t, offset) {
    const cycle = 3.4 + (offset % 1.7);
    const ph = (t + offset * 7.3) % cycle;
    if (ph > cycle - 0.13) return 1 - Math.abs((ph - (cycle - 0.065)) / 0.065);
    return 0;
  }

  function eye(ctx, x, y, w, skin, opts) {
    opts = opts || {};
    const lid = clamp(opts.lid || 0, 0, 1);
    const look = opts.look || 0; // -1..1 sideways
    const droop = opts.droop || 0;
    const h = w * (0.62 - droop * 0.22) * (1 - lid);
    // white
    ctx.beginPath();
    ctx.ellipse(x, y, w, Math.max(0.6, h), 0, 0, TAU);
    ctx.fillStyle = '#f2ede2';
    ctx.fill();
    if (h > w * 0.14) {
      // iris
      ctx.beginPath();
      ctx.arc(x + look * w * 0.42, y + w * 0.05, w * 0.42, 0, TAU);
      ctx.fillStyle = opts.iris || '#4a3a28';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + look * w * 0.42, y + w * 0.05, w * 0.18, 0, TAU);
      ctx.fillStyle = '#1a120a'; ctx.fill();
      ctx.beginPath();
      ctx.arc(x + look * w * 0.42 - w * 0.1, y - w * 0.06, w * 0.08, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    }
    // upper lid line
    ctx.strokeStyle = skin.line;
    ctx.lineWidth = w * 0.14;
    ctx.beginPath();
    ctx.moveTo(x - w, y - h * 0.4);
    ctx.quadraticCurveTo(x, y - h * 1.15, x + w, y - h * 0.35);
    ctx.stroke();
    if (droop > 0.3) { // tired pouch
      ctx.lineWidth = w * 0.08;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.7, y + w * 0.55);
      ctx.quadraticCurveTo(x, y + w * 0.8, x + w * 0.7, y + w * 0.55);
      ctx.stroke();
    }
  }
  function brow(ctx, x, y, w, skin, angle, thick) {
    ctx.strokeStyle = mix(skin.line, '#000000', 0.2);
    ctx.lineWidth = thick || 3;
    ctx.beginPath();
    ctx.moveTo(x - w, y + Math.sin(angle) * w);
    ctx.quadraticCurveTo(x, y - w * 0.45, x + w, y - Math.sin(angle) * w);
    ctx.stroke();
  }
  function nose(ctx, x, y, len, skin, wide) {
    ctx.strokeStyle = skin.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - len * 0.12, y - len * 0.65);
    ctx.quadraticCurveTo(x + len * 0.2, y, x + (wide || 0.28) * len, y + len * 0.18);
    ctx.quadraticCurveTo(x, y + len * 0.34, x - len * 0.2, y + len * 0.2);
    ctx.stroke();
  }
  function mouth(ctx, x, y, w, skin, opts) {
    opts = opts || {};
    const talk = opts.talk ? (0.5 + 0.5 * Math.sin(opts.t * 13)) * 0.9 : 0;
    const curve = (opts.smile || 0) * w * 0.5;
    if (talk > 0.18) {
      ctx.beginPath();
      ctx.ellipse(x, y + talk * w * 0.16, w * 0.55, w * (0.12 + talk * 0.26), 0, 0, TAU);
      ctx.fillStyle = '#5e2a28'; ctx.fill();
    } else {
      ctx.strokeStyle = mix(skin.line, '#5e2a28', 0.5);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.6, y - curve * 0.4);
      ctx.quadraticCurveTo(x, y + curve, x + w * 0.6, y - curve * 0.42);
      ctx.stroke();
    }
  }
  function headShape(ctx, w, h, skin, jaw) {
    // jaw: 0 pointed .. 1 heavy
    ctx.beginPath();
    ctx.moveTo(-w, -h * 0.15);
    ctx.bezierCurveTo(-w, -h * 0.85, w, -h * 0.85, w, -h * 0.15);
    ctx.bezierCurveTo(w, h * lerp(0.35, 0.6, jaw), w * lerp(0.35, 0.75, jaw), h, 0, h);
    ctx.bezierCurveTo(-w * lerp(0.35, 0.75, jaw), h, -w, h * lerp(0.35, 0.6, jaw), -w, -h * 0.15);
    ctx.closePath();
    ctx.fillStyle = skin.base;
    ctx.fill();
  }
  function headShade(ctx, w, h, skin) {
    const g = ctx.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, alpha(skin.shade, 0.55));
    g.addColorStop(0.35, 'rgba(0,0,0,0)');
    g.addColorStop(0.8, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(255,236,190,0.28)'); // lamp rim, house-right
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w, -h * 0.15);
    ctx.bezierCurveTo(-w, -h * 0.85, w, -h * 0.85, w, -h * 0.15);
    ctx.bezierCurveTo(w, h * 0.5, w * 0.6, h, 0, h);
    ctx.bezierCurveTo(-w * 0.6, h, -w, h * 0.5, -w, -h * 0.15);
    ctx.closePath();
    ctx.fill();
  }
  function ears(ctx, w, skin) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * w * 1.02, 2, w * 0.14, w * 0.24, 0, 0, TAU);
      ctx.fillStyle = skin.base; ctx.fill();
    }
  }
  function cigarette(ctx, x, y, angle, t, smoke) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    rr(ctx, 0, -1.5, 16, 3, 1.5);
    ctx.fillStyle = '#f2ede2'; ctx.fill();
    rr(ctx, 13, -1.5, 3, 3, 1);
    ctx.fillStyle = '#e0762a'; ctx.fill();
    ctx.beginPath(); ctx.arc(16.5, 0, 1.6, 0, TAU);
    ctx.fillStyle = Math.sin(t * 2.2) > 0.6 ? '#ff8a3a' : '#b34a1e';
    ctx.fill();
    ctx.restore();
    if (smoke && Math.random() < 0.12) {
      smoke.puff(x + Math.cos(angle) * 17, y + Math.sin(angle) * 17, 2);
    }
  }

  // Every draw fn: (ctx, x, y, s, t, st) — anchored bottom-center at the waist.
  // st: {talk, look, arm (0..1 dealing sweep), mood ('down'|'up'|null), smoke}

  // ---------- RUTH — blackjack. Beehive, beauty mark, cigarette, seen it all ----------
  function drawRuth(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.warm;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const breath = Math.sin(t * 1.5) * 1.4;
    // dealing arm (behind torso when idle, sweeps across when st.arm)
    const armPh = st.arm || 0;
    // torso: green dealer vest over cream blouse
    ctx.save();
    ctx.translate(0, breath * 0.4);
    poly(ctx, [[-52, 0], [-46, -78], [-30, -96], [30, -96], [46, -78], [52, 0]]);
    ctx.fillStyle = '#f0e6d0'; ctx.fill();
    // vest
    poly(ctx, [[-52, 0], [-46, -78], [-26, -92], [-12, -60], [-16, 0]]);
    ctx.fillStyle = PAL.feltDark; ctx.fill();
    poly(ctx, [[52, 0], [46, -78], [26, -92], [12, -60], [16, 0]]);
    ctx.fillStyle = mix(PAL.feltDark, '#000', 0.15); ctx.fill();
    // brass buttons
    ctx.fillStyle = PAL.brass;
    for (const by of [-52, -34, -16]) { ctx.beginPath(); ctx.arc(-14, by, 2.5, 0, TAU); ctx.fill(); }
    // arms: left resting on rail; right deals
    ctx.strokeStyle = '#f0e6d0';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-44, -70);
    ctx.quadraticCurveTo(-66, -40, -58, -6);
    ctx.stroke();
    const sweep = Math.sin(armPh * Math.PI);
    ctx.beginPath(); ctx.moveTo(44, -70);
    ctx.quadraticCurveTo(66 - sweep * 30, -44 - sweep * 18, 52 - sweep * 74, -10 - sweep * 26);
    ctx.stroke();
    // hands
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(-58, -4, 8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(52 - sweep * 74, -8 - sweep * 26, 8, 0, TAU); ctx.fill();
    ctx.restore();
    // head
    ctx.save();
    ctx.translate(0, -96 + breath);
    ctx.rotate(Math.sin(t * 0.4) * 0.02);
    ears(ctx, 26, skin);
    headShape(ctx, 26, 34, skin, 0.35);
    // beehive — the landmark
    ctx.fillStyle = '#8c3a1e';
    ctx.beginPath();
    ctx.moveTo(-27, -12);
    ctx.bezierCurveTo(-34, -46, -22, -76, 0, -78);
    ctx.bezierCurveTo(24, -76, 34, -44, 27, -12);
    ctx.bezierCurveTo(18, -26, -18, -26, -27, -12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = mix('#8c3a1e', '#000', 0.3);
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-20 + i * 3, -20 - i * 12);
      ctx.quadraticCurveTo(0, -30 - i * 13, 20 - i * 3, -18 - i * 12);
      ctx.stroke();
    }
    headShade(ctx, 26, 34, skin);
    const lid = Math.max(blinkAt(t, 0.2), 0.25);
    eye(ctx, -10, -2, 5.5, skin, { lid, look: st.look || 0, droop: 0.45 });
    eye(ctx, 11, -2, 5.5, skin, { lid, look: st.look || 0, droop: 0.45 });
    brow(ctx, -10, -10, 6, skin, 0.12, 2.6);
    brow(ctx, 11, -10, 6, skin, 0.12, 2.6);
    nose(ctx, 0, 10, 12, skin);
    mouth(ctx, -1, 22, 10, skin, { talk: st.talk, t, smile: st.mood === 'up' ? 0.5 : 0.06 });
    // beauty mark, rouge, cigarette in the mouth corner
    ctx.fillStyle = skin.line;
    ctx.beginPath(); ctx.arc(15, 16, 1.4, 0, TAU); ctx.fill();
    ctx.fillStyle = alpha('#c05a5a', 0.25);
    ctx.beginPath(); ctx.ellipse(-16, 12, 5, 3, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(16, 12, 5, 3, 0, 0, TAU); ctx.fill();
    if (!st.talk) cigarette(ctx, 8, 23, -0.35, t, st.smoke);
    // earrings
    ctx.fillStyle = PAL.brass;
    ctx.beginPath(); ctx.arc(-26, 10, 2.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(26, 10, 2.4, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ---------- EDDIE — craps. Pompadour, vest, stick, motor mouth ----------
  function drawEddie(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.olive;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const bounce = Math.sin(t * 3.1) * 1.6; // he doesn't stand still
    ctx.translate(0, bounce * 0.5);
    // torso: white shirt, sleeves rolled, open black vest
    poly(ctx, [[-46, 0], [-42, -76], [-26, -95], [26, -95], [42, -76], [46, 0]]);
    ctx.fillStyle = '#efe9dc'; ctx.fill();
    poly(ctx, [[-46, 0], [-42, -76], [-24, -90], [-16, -50], [-22, 0]]);
    ctx.fillStyle = '#1c1c22'; ctx.fill();
    poly(ctx, [[46, 0], [42, -76], [24, -90], [16, -50], [22, 0]]);
    ctx.fillStyle = '#26262e'; ctx.fill();
    // loosened tie
    poly(ctx, [[-4, -88], [4, -88], [7, -60], [0, -50], [-7, -60]]);
    ctx.fillStyle = PAL.oxblood; ctx.fill();
    // right arm with the stick, pointing about
    const wave = Math.sin(t * 2.3) * 0.15 + (st.arm ? Math.sin(st.arm * Math.PI) * 0.5 : 0);
    ctx.save();
    ctx.translate(38, -80);
    ctx.rotate(-0.5 + wave);
    ctx.strokeStyle = '#efe9dc'; ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(34, 26); ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(38, 30, 8, 0, TAU); ctx.fill();
    // the stick
    ctx.strokeStyle = PAL.woodHi; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(38, 30); ctx.lineTo(96, 44); ctx.stroke();
    ctx.strokeStyle = PAL.wood;
    ctx.beginPath(); ctx.moveTo(88, 42); ctx.lineTo(96, 44); ctx.stroke();
    ctx.restore();
    // left hand on the rail
    ctx.strokeStyle = '#efe9dc'; ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-38, -78); ctx.quadraticCurveTo(-58, -40, -50, -8); ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(-50, -5, 8, 0, TAU); ctx.fill();
    // rolled cuffs
    ctx.fillStyle = '#dcd4c2';
    rr(ctx, -60, -30, 18, 10, 4); ctx.fill();
    // head
    ctx.save();
    ctx.translate(0, -95 + bounce);
    ctx.rotate(Math.sin(t * 1.1) * 0.05);
    ears(ctx, 23, skin);
    headShape(ctx, 23, 30, skin, 0.5);
    // pompadour
    ctx.fillStyle = '#241a12';
    ctx.beginPath();
    ctx.moveTo(-24, -8);
    ctx.bezierCurveTo(-30, -34, -12, -50, 6, -46);
    ctx.bezierCurveTo(30, -42, 32, -22, 24, -10);
    ctx.bezierCurveTo(12, -22, -10, -24, -24, -8);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3a2c1e'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-14, -22); ctx.quadraticCurveTo(4, -34, 22, -26); ctx.stroke();
    // sideburns
    ctx.fillStyle = '#241a12';
    rr(ctx, -25, -8, 5, 16, 2); ctx.fill();
    rr(ctx, 20, -8, 5, 16, 2); ctx.fill();
    headShade(ctx, 23, 30, skin);
    const lid = blinkAt(t, 1.4);
    eye(ctx, -9, -2, 5, skin, { lid, look: Math.sin(t * 0.9) * 0.5 });
    eye(ctx, 10, -2, 5, skin, { lid, look: Math.sin(t * 0.9) * 0.5 });
    brow(ctx, -9, -10, 5.5, skin, 0.35, 2.8);
    brow(ctx, 10, -10, 5.5, skin, 0.35, 2.8);
    nose(ctx, 0, 8, 11, skin);
    mouth(ctx, 0, 19, 9, skin, { talk: st.talk == null ? (Math.sin(t * 0.7) > -0.2) : st.talk, t, smile: 0.55 });
    ctx.restore();
    ctx.restore();
  }

  // ---------- VERN — the wheel. Ancient, bow tie, four words ----------
  function drawVern(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.pale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const breath = Math.sin(t * 1.1) * 1;
    ctx.translate(0, breath * 0.3);
    // stooped narrow shoulders, black waistcoat, watch chain
    poly(ctx, [[-38, 0], [-34, -66], [-20, -84], [20, -84], [34, -66], [38, 0]]);
    ctx.fillStyle = '#efe9dc'; ctx.fill();
    poly(ctx, [[-38, 0], [-34, -66], [-18, -80], [-8, -40], [-12, 0]]);
    ctx.fillStyle = '#17171c'; ctx.fill();
    poly(ctx, [[38, 0], [34, -66], [18, -80], [8, -40], [12, 0]]);
    ctx.fillStyle = '#1f1f26'; ctx.fill();
    ctx.strokeStyle = PAL.brass; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-10, -34); ctx.quadraticCurveTo(0, -26, 14, -32); ctx.stroke();
    ctx.beginPath(); ctx.arc(14, -32, 3, 0, TAU); ctx.stroke();
    // arms folded low
    ctx.strokeStyle = '#17171c'; ctx.lineWidth = 13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-32, -60); ctx.quadraticCurveTo(-40, -30, -18, -18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(32, -60); ctx.quadraticCurveTo(40, -30, 18, -18); ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(-14, -16, 7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -16, 7, 0, TAU); ctx.fill();
    // bow tie
    ctx.fillStyle = PAL.oxblood;
    poly(ctx, [[-12, -80], [-2, -74], [-12, -68]]); ctx.fill();
    poly(ctx, [[12, -80], [2, -74], [12, -68]]); ctx.fill();
    ctx.fillRect(-3, -78, 6, 8);
    // head — long, hollow-cheeked, forward on the neck
    ctx.save();
    ctx.translate(0, -84 + breath);
    ctx.rotate(0.03 + Math.sin(t * 0.35) * 0.015);
    ctx.translate(3, 6); // the stoop
    ears(ctx, 20, skin);
    headShape(ctx, 20, 32, skin, 0.15);
    // wisps
    ctx.strokeStyle = '#d8d2c2'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-18 + i * 2, -28);
      ctx.quadraticCurveTo(-14 + i * 8, -40 - Math.sin(t * 0.8 + i) * 1.5, -6 + i * 6, -30);
      ctx.stroke();
    }
    headShade(ctx, 20, 32, skin);
    // liver spots
    ctx.fillStyle = alpha(skin.shade, 0.5);
    ctx.beginPath(); ctx.arc(-8, -24, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -26, 1.5, 0, TAU); ctx.fill();
    const lid = Math.max(blinkAt(t, 2.7), 0.4);
    eye(ctx, -8, 0, 4.5, skin, { lid, droop: 0.8, look: st.look || 0 });
    eye(ctx, 9, 0, 4.5, skin, { lid, droop: 0.8, look: st.look || 0 });
    brow(ctx, -8, -8, 5.5, skin, -0.1, 3.2);
    brow(ctx, 9, -8, 5.5, skin, -0.1, 3.2);
    nose(ctx, 0, 12, 14, skin, 0.34);
    mouth(ctx, 0, 24, 8, skin, { talk: st.talk, t, smile: -0.18 });
    // hollow cheeks
    ctx.strokeStyle = alpha(skin.shade, 0.6); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, 12); ctx.quadraticCurveTo(-16, 20, -10, 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 12); ctx.quadraticCurveTo(16, 20, 10, 26); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  // ---------- DOT — baccarat. Silk, pearls, crossword, unimpressed ----------
  function drawDot(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.pale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const breath = Math.sin(t * 1.3) * 1.1;
    ctx.translate(0, breath * 0.3);
    // silk blouse, square shoulders
    poly(ctx, [[-48, 0], [-46, -72], [-28, -92], [28, -92], [46, -72], [48, 0]]);
    const silk = ctx.createLinearGradient(-48, -92, 48, 0);
    silk.addColorStop(0, '#3a3f5c'); silk.addColorStop(0.5, '#565f8a'); silk.addColorStop(1, '#2e3350');
    ctx.fillStyle = silk; ctx.fill();
    // neck v + pearls
    poly(ctx, [[-10, -92], [10, -92], [0, -74]]);
    ctx.fillStyle = skin.base; ctx.fill();
    ctx.fillStyle = '#f0ead8';
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.arc(i * 5, -76 + Math.abs(i) * -1.4 + 6, 2.4, 0, TAU); ctx.fill();
    }
    // arms: one dealing (st.arm), one holding the folded crossword
    const sweep = Math.sin((st.arm || 0) * Math.PI);
    ctx.strokeStyle = '#4a5178'; ctx.lineWidth = 13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(40, -66);
    ctx.quadraticCurveTo(56 - sweep * 26, -36 - sweep * 12, 44 - sweep * 66, -8 - sweep * 20);
    ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(44 - sweep * 66, -6 - sweep * 20, 7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-40, -66);
    ctx.strokeStyle = '#4a5178';
    ctx.quadraticCurveTo(-52, -40, -40, -16);
    ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(-38, -14, 7, 0, TAU); ctx.fill();
    if (!st.arm) { // the crossword, folded in quarters
      ctx.save();
      ctx.translate(-38, -20);
      ctx.rotate(-0.3);
      rr(ctx, -12, -15, 24, 30, 2);
      ctx.fillStyle = '#e8e2d0'; ctx.fill();
      ctx.strokeStyle = '#b8b0995c'; ctx.stroke();
      ctx.fillStyle = '#3a3a3a';
      for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 5; gy++) {
        if ((gx * 7 + gy * 3) % 4 === 0) ctx.fillRect(-9 + gx * 5, -12 + gy * 5, 4, 4);
      }
      ctx.restore();
    }
    // head — sleek dark bob, grey streak
    ctx.save();
    ctx.translate(0, -92 + breath);
    ctx.rotate(-0.02);
    headShape(ctx, 22, 30, skin, 0.22);
    ctx.fillStyle = '#1c1518';
    ctx.beginPath();
    ctx.moveTo(-23, 14);
    ctx.bezierCurveTo(-30, -20, -18, -44, 0, -44);
    ctx.bezierCurveTo(20, -44, 30, -18, 23, 16);
    ctx.lineTo(17, 16);
    ctx.bezierCurveTo(22, -12, 16, -30, 0, -32);
    ctx.bezierCurveTo(-14, -30, -20, -14, -17, 12);
    ctx.closePath(); ctx.fill();
    // the streak
    ctx.strokeStyle = '#b8b2a8'; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(-8, -42); ctx.quadraticCurveTo(-16, -22, -19, 8); ctx.stroke();
    headShade(ctx, 22, 30, skin);
    const lid = Math.max(blinkAt(t, 0.9), 0.5); // permanently half-lidded
    eye(ctx, -9, -1, 5, skin, { lid, look: st.look != null ? st.look : -0.2 });
    eye(ctx, 10, -1, 5, skin, { lid, look: st.look != null ? st.look : -0.2 });
    brow(ctx, -9, -9, 5.5, skin, 0.05, 2);
    brow(ctx, 10, -9, 5.5, skin, 0.05, 2);
    nose(ctx, 0, 9, 10, skin, 0.2);
    mouth(ctx, 0, 20, 8, skin, { talk: st.talk, t, smile: -0.05 });
    // pearl earrings
    ctx.fillStyle = '#f0ead8';
    ctx.beginPath(); ctx.arc(-22, 8, 2.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(22, 8, 2.6, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ---------- MARLA — three-card. Young, freckles, borrowed vest ----------
  function drawMarla(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.ruddy;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const breath = Math.sin(t * 1.8) * 1.3;
    ctx.translate(0, breath * 0.4);
    poly(ctx, [[-44, 0], [-40, -74], [-26, -92], [26, -92], [40, -74], [44, 0]]);
    ctx.fillStyle = '#f0e6d0'; ctx.fill();
    // vest a size big — sits wide at the shoulders
    poly(ctx, [[-44, 0], [-42, -72], [-24, -90], [-10, -56], [-16, 0]]);
    ctx.fillStyle = PAL.feltDark; ctx.fill();
    poly(ctx, [[44, 0], [42, -72], [24, -90], [10, -56], [16, 0]]);
    ctx.fillStyle = mix(PAL.feltDark, '#000', 0.12); ctx.fill();
    // name tag
    rr(ctx, 16, -62, 22, 9, 2);
    ctx.fillStyle = PAL.ivory; ctx.fill();
    label(ctx, 'MARLA', 27, -57, 5.5, PAL.ink, 'center', FONT.ui, 'bold');
    // hands: careful dealing sweep
    const sweep = Math.sin((st.arm || 0) * Math.PI);
    ctx.strokeStyle = '#f0e6d0'; ctx.lineWidth = 13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(38, -68);
    ctx.quadraticCurveTo(54 - sweep * 22, -40 - sweep * 10, 44 - sweep * 62, -8 - sweep * 22);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-38, -68); ctx.quadraticCurveTo(-52, -38, -44, -8); ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(44 - sweep * 62, -6 - sweep * 22, 7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-44, -6, 7, 0, TAU); ctx.fill();
    // head — high ponytail, freckles, open face
    ctx.save();
    ctx.translate(0, -92 + breath);
    ctx.rotate(Math.sin(t * 0.6) * 0.03);
    ears(ctx, 22, skin);
    headShape(ctx, 22, 29, skin, 0.3);
    ctx.fillStyle = '#6e4222';
    ctx.beginPath();
    ctx.moveTo(-23, -6);
    ctx.bezierCurveTo(-26, -34, -12, -46, 0, -46);
    ctx.bezierCurveTo(14, -46, 26, -32, 23, -6);
    ctx.bezierCurveTo(14, -20, -14, -20, -23, -6);
    ctx.closePath(); ctx.fill();
    // ponytail with its own bounce
    ctx.save();
    ctx.translate(20, -34);
    ctx.rotate(0.5 + Math.sin(t * 1.8 + 0.6) * 0.06);
    ctx.fillStyle = '#6e4222';
    ctx.beginPath(); ctx.ellipse(12, 12, 8, 22, 0.5, 0, TAU); ctx.fill();
    ctx.restore();
    headShade(ctx, 22, 29, skin);
    const lid = blinkAt(t, 3.3);
    eye(ctx, -9, -1, 5.4, skin, { lid, look: st.look || 0, iris: '#4a6a42' });
    eye(ctx, 10, -1, 5.4, skin, { lid, look: st.look || 0, iris: '#4a6a42' });
    brow(ctx, -9, -10, 5.5, skin, 0.28, 2.2);
    brow(ctx, 10, -10, 5.5, skin, 0.28, 2.2);
    nose(ctx, 0, 8, 9, skin, 0.22);
    mouth(ctx, 0, 19, 8.5, skin, { talk: st.talk, t, smile: 0.4 });
    // freckles
    ctx.fillStyle = alpha(skin.line, 0.4);
    for (const [fx, fy] of [[-13, 8], [-9, 11], [-15, 12], [10, 9], [14, 11], [9, 13], [-4, 12], [4, 13]]) {
      ctx.beginPath(); ctx.arc(fx, fy, 0.9, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  // ---------- LEN — the bar. Walrus mustache, apron, a glass to polish ----------
  function drawLen(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.ruddy;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const breath = Math.sin(t * 1.2) * 1.2;
    ctx.translate(0, breath * 0.35);
    // barrel torso, shirt + dark apron
    poly(ctx, [[-54, 0], [-50, -70], [-30, -92], [30, -92], [50, -70], [54, 0]]);
    ctx.fillStyle = '#dfd7c4'; ctx.fill();
    poly(ctx, [[-40, 0], [-34, -58], [34, -58], [40, 0]]);
    ctx.fillStyle = '#2e2620'; ctx.fill();
    ctx.strokeStyle = '#1c1611'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-34, -58); ctx.lineTo(-24, -80); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(34, -58); ctx.lineTo(24, -80); ctx.stroke();
    // arms polishing a glass — the perpetual motion
    const polish = Math.sin(t * 4) * 3;
    ctx.strokeStyle = '#dfd7c4'; ctx.lineWidth = 15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-44, -64); ctx.quadraticCurveTo(-52, -34, -22, -26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(44, -64); ctx.quadraticCurveTo(52, -36, 20, -30); ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(-18, -26, 8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(16 + polish * 0.4, -30, 8, 0, TAU); ctx.fill();
    // the glass
    ctx.save();
    ctx.translate(-16, -34);
    ctx.rotate(polish * 0.04);
    ctx.fillStyle = 'rgba(220,235,235,0.35)';
    poly(ctx, [[-7, -14], [7, -14], [5, 8], [-5, 8]]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,250,250,0.6)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
    // rag
    ctx.fillStyle = '#c9c2ae';
    ctx.beginPath(); ctx.ellipse(18 + polish * 0.4, -28, 7, 5, polish * 0.1, 0, TAU); ctx.fill();
    // head — big, bald top, walrus mustache
    ctx.save();
    ctx.translate(0, -92 + breath);
    ears(ctx, 25, skin);
    headShape(ctx, 25, 30, skin, 0.75);
    // side hair only
    ctx.fillStyle = '#8a7a62';
    ctx.beginPath(); ctx.ellipse(-22, -6, 5, 12, 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(22, -6, 5, 12, -0.2, 0, TAU); ctx.fill();
    headShade(ctx, 25, 30, skin);
    const lid = blinkAt(t, 0.5);
    eye(ctx, -10, -4, 5, skin, { lid, look: st.look || 0, droop: 0.3 });
    eye(ctx, 11, -4, 5, skin, { lid, look: st.look || 0, droop: 0.3 });
    brow(ctx, -10, -12, 6.5, skin, 0.15, 3.6);
    brow(ctx, 11, -12, 6.5, skin, 0.15, 3.6);
    nose(ctx, 0, 7, 12, skin, 0.34);
    // the mustache IS the mouth
    ctx.fillStyle = '#8a7a62';
    ctx.beginPath();
    ctx.moveTo(-14, 14);
    ctx.quadraticCurveTo(0, 8 + (st.talk ? Math.sin(t * 13) * 1.5 : 0), 14, 14);
    ctx.quadraticCurveTo(15, 22, 8, 24);
    ctx.quadraticCurveTo(0, 18, -8, 24);
    ctx.quadraticCurveTo(-15, 22, -14, 14);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ---------- CORAL — keno. Big earrings, pencil behind ear, tray ----------
  function drawCoral(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.warm;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const sway = Math.sin(t * 1.6) * 2;
    ctx.translate(sway * 0.4, Math.abs(Math.sin(t * 1.6)) * -1);
    // uniform dress, teal with brass piping
    poly(ctx, [[-42, 0], [-38, -70], [-24, -90], [24, -90], [38, -70], [42, 0]]);
    const dress = ctx.createLinearGradient(-40, -90, 40, 0);
    dress.addColorStop(0, '#1e6b62'); dress.addColorStop(1, '#14504a');
    ctx.fillStyle = dress; ctx.fill();
    ctx.strokeStyle = PAL.brass; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-24, -88); ctx.lineTo(-14, -56); ctx.lineTo(-18, 0); ctx.stroke();
    // tray with tickets, held forward
    ctx.strokeStyle = '#1e6b62'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-36, -66); ctx.quadraticCurveTo(-46, -40, -30, -30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(36, -66); ctx.quadraticCurveTo(46, -40, 30, -30); ctx.stroke();
    rr(ctx, -34, -34, 68, 12, 3);
    ctx.fillStyle = PAL.wood; ctx.fill();
    ctx.strokeStyle = PAL.woodDark; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 4; i++) {
      rr(ctx, -28 + i * 15, -32, 12, 8, 1);
      ctx.fillStyle = i % 2 ? '#efe9dc' : '#f6d78a'; ctx.fill();
    }
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(-30, -28, 7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(30, -28, 7, 0, TAU); ctx.fill();
    // head — curls piled up, hoop earrings, pencil
    ctx.save();
    ctx.translate(sway * 0.3, -90);
    ctx.rotate(Math.sin(t * 0.8) * 0.04);
    ears(ctx, 22, skin);
    headShape(ctx, 22, 28, skin, 0.32);
    ctx.fillStyle = '#31201a';
    for (const [cx2, cy2, cr] of [[-14, -30, 12], [0, -36, 13], [14, -30, 12], [-20, -18, 8], [20, -18, 8], [7, -26, 10], [-7, -26, 10]]) {
      ctx.beginPath(); ctx.arc(cx2, cy2, cr, 0, TAU); ctx.fill();
    }
    // pencil behind the ear
    ctx.save();
    ctx.translate(21, -8);
    ctx.rotate(-1.1);
    rr(ctx, 0, -1.5, 18, 3, 1);
    ctx.fillStyle = '#d9a23a'; ctx.fill();
    poly(ctx, [[18, -1.5], [21, 0], [18, 1.5]]);
    ctx.fillStyle = skin.line; ctx.fill();
    ctx.restore();
    headShade(ctx, 22, 28, skin);
    const lid = blinkAt(t, 2.2);
    eye(ctx, -9, -1, 5.2, skin, { lid, look: st.look || 0, iris: '#3a2a1a' });
    eye(ctx, 10, -1, 5.2, skin, { lid, look: st.look || 0, iris: '#3a2a1a' });
    brow(ctx, -9, -9, 5.5, skin, 0.3, 2.4);
    brow(ctx, 10, -9, 5.5, skin, 0.3, 2.4);
    nose(ctx, 0, 8, 10, skin, 0.3);
    mouth(ctx, 0, 19, 9, skin, { talk: st.talk, t, smile: 0.5 });
    // hoops
    ctx.strokeStyle = PAL.brassHi; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-22, 12, 5, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(22, 12, 5, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  // ---------- HERB — the regular. Cardigan, coffee, kind heavy brows ----------
  function drawHerb(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.pale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const breath = Math.sin(t * 1.15) * 1.1;
    ctx.translate(0, breath * 0.4);
    // soft shoulders, brown cardigan over checked shirt
    poly(ctx, [[-46, 0], [-42, -68], [-26, -88], [26, -88], [42, -68], [46, 0]]);
    ctx.fillStyle = '#5e4630'; ctx.fill();
    poly(ctx, [[-12, -88], [12, -88], [8, -40], [-8, -40]]);
    ctx.fillStyle = '#d8cfb8'; ctx.fill();
    ctx.strokeStyle = alpha('#8a5a3a', 0.5); ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(i * 6 - 2, -88); ctx.lineTo(i * 5 - 2, -42); ctx.stroke();
    }
    // cardigan buttons
    ctx.fillStyle = '#3a2c1c';
    for (const by of [-56, -40, -24]) { ctx.beginPath(); ctx.arc(-10, by, 2.2, 0, TAU); ctx.fill(); }
    // arms: coffee cup raised now and then
    const sip = Math.max(0, Math.sin(t * 0.35)) * (st.talk ? 0 : 1);
    ctx.strokeStyle = '#5e4630'; ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-38, -62); ctx.quadraticCurveTo(-48, -34, -36, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(38, -62);
    ctx.quadraticCurveTo(50, -40, 26 - sip * 10, -20 - sip * 34);
    ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(-34, -10, 7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(24 - sip * 10, -20 - sip * 34, 7, 0, TAU); ctx.fill();
    // cup
    ctx.save();
    ctx.translate(24 - sip * 10, -26 - sip * 34);
    rr(ctx, -7, -8, 14, 12, 2);
    ctx.fillStyle = '#efe9dc'; ctx.fill();
    ctx.strokeStyle = '#c9bfa5'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.arc(9, -2, 4, -1.2, 1.2);
    ctx.stroke();
    ctx.restore();
    // head — bald crown, side hair, glasses pushed up on forehead
    ctx.save();
    ctx.translate(0, -88 + breath);
    ctx.rotate(Math.sin(t * 0.5) * 0.02);
    ears(ctx, 23, skin);
    headShape(ctx, 23, 29, skin, 0.6);
    ctx.fillStyle = '#a89a84';
    ctx.beginPath(); ctx.ellipse(-20, -8, 5, 11, 0.25, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(20, -8, 5, 11, -0.25, 0, TAU); ctx.fill();
    // reading glasses parked on the forehead
    ctx.strokeStyle = '#3a3430'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(-8, -22, 6, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(9, -22, 6, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, -22); ctx.lineTo(3, -22); ctx.stroke();
    headShade(ctx, 23, 29, skin);
    const lid = blinkAt(t, 4.1);
    eye(ctx, -9, -2, 5, skin, { lid, look: st.look || 0, droop: 0.35 });
    eye(ctx, 10, -2, 5, skin, { lid, look: st.look || 0, droop: 0.35 });
    brow(ctx, -9, -10, 7, skin, 0.1, 4.2); // the brows are the landmark
    brow(ctx, 10, -10, 7, skin, 0.1, 4.2);
    nose(ctx, 0, 8, 11, skin, 0.3);
    mouth(ctx, 0, 19, 9, skin, { talk: st.talk, t, smile: 0.28 });
    ctx.restore();
    ctx.restore();
  }

  // ---------- FINGERS — the tout. Pencil mustache, loud jacket, fedora back ----------
  function drawFingers(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.olive;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const fidget = Math.sin(t * 2.6) * 1.5;
    ctx.translate(fidget * 0.5, 0);
    // skinny frame, check jacket (drawn check!)
    poly(ctx, [[-40, 0], [-37, -70], [-24, -90], [24, -90], [37, -70], [40, 0]]);
    ctx.fillStyle = '#7a5c3a'; ctx.fill();
    ctx.save();
    poly(ctx, [[-40, 0], [-37, -70], [-24, -90], [24, -90], [37, -70], [40, 0]]);
    ctx.clip();
    ctx.strokeStyle = alpha('#3f2f1c', 0.7); ctx.lineWidth = 1.2;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath(); ctx.moveTo(i * 9, -95); ctx.lineTo(i * 9 - 8, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-45, i * 12 - 45); ctx.lineTo(45, i * 12 - 52); ctx.stroke();
    }
    ctx.restore();
    // shirt + skinny tie
    poly(ctx, [[-9, -90], [9, -90], [6, -46], [-6, -46]]);
    ctx.fillStyle = '#efe6cc'; ctx.fill();
    poly(ctx, [[-3, -88], [3, -88], [4, -56], [0, -48], [-4, -56]]);
    ctx.fillStyle = '#8e2f8a'; ctx.fill(); // the tie is a crime
    // racing form rolled in one hand, other hand talks
    const gesture = st.talk ? Math.sin(t * 6) * 6 : fidget;
    ctx.strokeStyle = '#7a5c3a'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-33, -64); ctx.quadraticCurveTo(-44, -40, -34, -18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(33, -64); ctx.quadraticCurveTo(48, -48, 40 + gesture * 0.4, -30 - Math.abs(gesture)); ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(-33, -16, 6.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(41 + gesture * 0.4, -30 - Math.abs(gesture), 6.5, 0, TAU); ctx.fill();
    // the form
    ctx.save();
    ctx.translate(-34, -20);
    ctx.rotate(0.5);
    rr(ctx, -4, -16, 8, 30, 3);
    ctx.fillStyle = '#e8ddb8'; ctx.fill();
    ctx.strokeStyle = '#b3a678'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    // head — narrow, fedora pushed way back, pencil mustache
    ctx.save();
    ctx.translate(fidget * 0.3, -90);
    ctx.rotate(Math.sin(t * 1.3) * 0.04);
    ears(ctx, 19, skin);
    headShape(ctx, 19, 28, skin, 0.2);
    // fedora, back on the crown
    ctx.fillStyle = '#4a3a28';
    ctx.beginPath(); ctx.ellipse(0, -26, 24, 7, 0, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-16, -28);
    ctx.bezierCurveTo(-14, -46, 14, -46, 16, -28);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2e2418';
    rr(ctx, -16, -34, 32, 5, 2); ctx.fill();
    headShade(ctx, 19, 28, skin);
    const lid = blinkAt(t, 1.1);
    const look = st.look != null ? st.look : Math.sin(t * 1.7) * 0.7; // always casing the room
    eye(ctx, -7, -2, 4.4, skin, { lid, look });
    eye(ctx, 8, -2, 4.4, skin, { lid, look });
    brow(ctx, -7, -9, 4.5, skin, 0.4, 2);
    brow(ctx, 8, -9, 4.5, skin, 0.4, 2);
    nose(ctx, 0, 9, 12, skin, 0.2);
    // pencil mustache
    ctx.strokeStyle = '#241a12'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-7, 16); ctx.quadraticCurveTo(0, 14.5, 7, 16); ctx.stroke();
    mouth(ctx, 0, 21, 8, skin, { talk: st.talk, t, smile: 0.35 });
    ctx.restore();
    ctx.restore();
  }

  // ---------- MABEL — the cage. Glasses on a chain, cardigan, Duke's photo ----------
  function drawMabel(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.pale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const breath = Math.sin(t * 1.25) * 1;
    ctx.translate(0, breath * 0.35);
    // rounded shoulders, rose cardigan
    poly(ctx, [[-46, 0], [-43, -66], [-26, -86], [26, -86], [43, -66], [46, 0]]);
    ctx.fillStyle = '#8e5a62'; ctx.fill();
    poly(ctx, [[-10, -86], [10, -86], [7, -44], [-7, -44]]);
    ctx.fillStyle = '#e8dfca'; ctx.fill();
    // glasses chain draped to the cardigan
    ctx.strokeStyle = PAL.brass; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-16, -78); ctx.quadraticCurveTo(-26, -62, -20, -50); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16, -78); ctx.quadraticCurveTo(26, -62, 20, -50); ctx.stroke();
    // hands counting at the counter
    const count = Math.sin(t * 3.2);
    ctx.strokeStyle = '#8e5a62'; ctx.lineWidth = 13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-38, -60); ctx.quadraticCurveTo(-46, -36, -26, -18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(38, -60); ctx.quadraticCurveTo(46, -36, 26, -20); ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(-24, -16 + count, 7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(24, -18 - count, 7, 0, TAU); ctx.fill();
    // head — grey bun, glasses ON (she's working), soft face
    ctx.save();
    ctx.translate(0, -86 + breath);
    ctx.rotate(Math.sin(t * 0.45) * 0.02);
    ears(ctx, 23, skin);
    headShape(ctx, 23, 29, skin, 0.45);
    ctx.fillStyle = '#b8b2a4';
    ctx.beginPath();
    ctx.moveTo(-24, -4);
    ctx.bezierCurveTo(-28, -30, -14, -42, 0, -42);
    ctx.bezierCurveTo(14, -42, 28, -30, 24, -4);
    ctx.bezierCurveTo(14, -16, -14, -16, -24, -4);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -42, 9, 0, TAU); ctx.fill(); // the bun
    ctx.strokeStyle = '#96907e'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, -42, 5.5, 0, TAU); ctx.stroke();
    headShade(ctx, 23, 29, skin);
    const lid = blinkAt(t, 5.2);
    eye(ctx, -9, -1, 4.8, skin, { lid, look: st.look || 0, droop: 0.3, iris: '#5c7186' });
    eye(ctx, 10, -1, 4.8, skin, { lid, look: st.look || 0, droop: 0.3, iris: '#5c7186' });
    // wire glasses, on the nose
    ctx.strokeStyle = PAL.brass; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(-9, 0, 7, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(10, 0, 7, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(3, 0); ctx.stroke();
    brow(ctx, -9, -10, 5.5, skin, 0.12, 2.4);
    brow(ctx, 10, -10, 5.5, skin, 0.12, 2.4);
    nose(ctx, 0, 8, 10, skin, 0.26);
    mouth(ctx, 0, 19, 9, skin, { talk: st.talk, t, smile: 0.35 });
    // smile lines
    ctx.strokeStyle = alpha(skin.shade, 0.55); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-12, 14); ctx.quadraticCurveTo(-14, 19, -10, 23); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12, 14); ctx.quadraticCurveTo(14, 19, 10, 23); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  // ---------- SAL — the reason you're here. Camel coat, patience ----------
  function drawSal(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.ruddy;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const breath = Math.sin(t * 0.9) * 1.2; // slow breather
    ctx.translate(0, breath * 0.3);
    // the coat — wide, camel, collar up a little
    poly(ctx, [[-62, 0], [-58, -64], [-38, -92], [38, -92], [58, -64], [62, 0]]);
    const camel = ctx.createLinearGradient(-60, -92, 60, 0);
    camel.addColorStop(0, '#b3915c'); camel.addColorStop(0.5, '#c9a675'); camel.addColorStop(1, '#96784a');
    ctx.fillStyle = camel; ctx.fill();
    // lapels
    poly(ctx, [[-38, -92], [-10, -88], [-22, -46], [-40, -60]]);
    ctx.fillStyle = '#a88752'; ctx.fill();
    poly(ctx, [[38, -92], [10, -88], [22, -46], [40, -60]]);
    ctx.fillStyle = '#b3915c'; ctx.fill();
    // dark shirt, no tie, open collar
    poly(ctx, [[-10, -88], [10, -88], [6, -56], [-6, -56]]);
    ctx.fillStyle = '#26262c'; ctx.fill();
    // one hand in pocket; the other turns a mint over, slow
    ctx.strokeStyle = '#b3915c'; ctx.lineWidth = 17; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-52, -58); ctx.quadraticCurveTo(-60, -30, -46, -14); ctx.stroke();
    const turn = Math.sin(t * 1.4);
    ctx.beginPath(); ctx.moveTo(52, -58); ctx.quadraticCurveTo(58, -34, 34, -24); ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.arc(32, -22, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2ede2';
    ctx.beginPath(); ctx.ellipse(32, -30, 3.4, 3.4 * Math.abs(turn), 0, 0, TAU); ctx.fill();
    // pinky ring
    ctx.fillStyle = PAL.brassHi;
    ctx.beginPath(); ctx.arc(38, -20, 2, 0, TAU); ctx.fill();
    // head — big, jowly, swept-back grey, heavy lids
    ctx.save();
    ctx.translate(0, -92 + breath);
    ctx.rotate(Math.sin(t * 0.3) * 0.015);
    ears(ctx, 27, skin);
    headShape(ctx, 27, 32, skin, 0.9);
    // jowls
    ctx.fillStyle = alpha(skin.shade, 0.35);
    ctx.beginPath(); ctx.ellipse(-16, 22, 8, 6, 0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(16, 22, 8, 6, -0.3, 0, TAU); ctx.fill();
    // swept-back steel hair
    ctx.fillStyle = '#8e8a82';
    ctx.beginPath();
    ctx.moveTo(-27, -10);
    ctx.bezierCurveTo(-30, -34, -16, -44, 0, -44);
    ctx.bezierCurveTo(16, -44, 30, -34, 27, -10);
    ctx.bezierCurveTo(18, -24, -18, -24, -27, -10);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6e6a62'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(-18 + i * 4, -18 - i * 7); ctx.quadraticCurveTo(0, -26 - i * 7, 18 - i * 4, -16 - i * 7); ctx.stroke();
    }
    headShade(ctx, 27, 32, skin);
    const lid = Math.max(blinkAt(t, 6.1), 0.45);
    eye(ctx, -10, -2, 5.2, skin, { lid, look: st.look != null ? st.look : 0, droop: 0.7 });
    eye(ctx, 11, -2, 5.2, skin, { lid, look: st.look != null ? st.look : 0, droop: 0.7 });
    brow(ctx, -10, -10, 6.5, skin, -0.05, 4);
    brow(ctx, 11, -10, 6.5, skin, -0.05, 4);
    nose(ctx, 0, 10, 13, skin, 0.36);
    mouth(ctx, 0, 23, 9, skin, { talk: st.talk, t, smile: st.mood === 'down' ? -0.25 : 0.1 });
    ctx.restore();
    ctx.restore();
  }

  // ---------- COLE — the pit boss. Dark suit. Stillness. ----------
  function drawCole(ctx, x, y, s, t, st) {
    st = st || {};
    const skin = SKIN.warm;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // he barely breathes — that's the point
    const breath = Math.sin(t * 0.7) * 0.5;
    ctx.translate(0, breath * 0.2);
    // tall narrow suit, hands clasped in front
    poly(ctx, [[-44, 0], [-42, -78], [-28, -100], [28, -100], [42, -78], [44, 0]]);
    const suit = ctx.createLinearGradient(-44, -100, 44, 0);
    suit.addColorStop(0, '#20242c'); suit.addColorStop(1, '#14161c');
    ctx.fillStyle = suit; ctx.fill();
    // crisp shirt, dark tie, bar pin
    poly(ctx, [[-8, -98], [8, -98], [5, -52], [-5, -52]]);
    ctx.fillStyle = '#e8e8e2'; ctx.fill();
    poly(ctx, [[-3, -96], [3, -96], [4, -62], [0, -54], [-4, -62]]);
    ctx.fillStyle = '#2e1c22'; ctx.fill();
    ctx.fillStyle = PAL.brass;
    rr(ctx, -4, -80, 8, 2, 1); ctx.fill();
    // pocket square
    poly(ctx, [[18, -78], [28, -78], [23, -72]]);
    ctx.fillStyle = '#e8e8e2'; ctx.fill();
    // clasped hands
    ctx.strokeStyle = '#191c23'; ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-36, -70); ctx.quadraticCurveTo(-40, -34, -12, -20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(36, -70); ctx.quadraticCurveTo(40, -34, 12, -20); ctx.stroke();
    ctx.fillStyle = skin.base;
    ctx.beginPath(); ctx.ellipse(0, -18, 12, 8, 0, 0, TAU); ctx.fill();
    // head — silver temples, level gaze
    ctx.save();
    ctx.translate(0, -100 + breath);
    ears(ctx, 22, skin);
    headShape(ctx, 22, 30, skin, 0.55);
    ctx.fillStyle = '#2a2622';
    ctx.beginPath();
    ctx.moveTo(-23, -8);
    ctx.bezierCurveTo(-25, -32, -12, -42, 0, -42);
    ctx.bezierCurveTo(12, -42, 25, -32, 23, -8);
    ctx.bezierCurveTo(14, -20, -14, -20, -23, -8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8e8a84';
    ctx.beginPath(); ctx.ellipse(-21, -12, 3, 7, 0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(21, -12, 3, 7, -0.3, 0, TAU); ctx.fill();
    headShade(ctx, 22, 30, skin);
    // only the eyes move
    const lid = blinkAt(t, 8.3);
    const look = st.look != null ? st.look : (Math.floor(t * 0.31) % 3 - 1) * 0.55;
    eye(ctx, -9, -2, 5, skin, { lid, look });
    eye(ctx, 10, -2, 5, skin, { lid, look });
    brow(ctx, -9, -10, 6, skin, -0.12, 3);
    brow(ctx, 10, -10, 6, skin, -0.12, 3);
    nose(ctx, 0, 9, 11, skin, 0.24);
    mouth(ctx, 0, 20, 8, skin, { talk: st.talk, t, smile: -0.08 });
    ctx.restore();
    ctx.restore();
  }

  const Cast = {
    ruth: drawRuth, eddie: drawEddie, vern: drawVern, dot: drawDot,
    marla: drawMarla, len: drawLen, coral: drawCoral, herb: drawHerb,
    fingers: drawFingers, mabel: drawMabel, sal: drawSal, cole: drawCole
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Cast;
  root.GiltCast = Cast;
})(typeof window !== 'undefined' ? window : globalThis);
