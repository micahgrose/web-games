/* GILT — art: the committed look of the building.
   Deep green felt, old brass, ivory, oxblood, smoke. Neon only on signs.
   Everything drawn, nothing borrowed. */
(function (root) {
  'use strict';

  const PAL = {
    deep: '#07120d', room: '#0a1a12', roomHi: '#10241a',
    feltDark: '#0e4630', felt: '#14563b', feltHi: '#1d6b4a',
    brassDark: '#8a6d1c', brass: '#c9a227', brassHi: '#f3d97a',
    ivory: '#f2e9d8', ivoryDim: '#cfc3ab', ink: '#221a10',
    oxblood: '#6e1f24', red: '#b3323a', redHi: '#d4555c',
    smoke: '#8b95a1', pink: '#ff5f8f', teal: '#37c8b4',
    wood: '#3a2417', woodHi: '#5a3a24', woodDark: '#241407',
    night: '#0d1626', dawn1: '#41304f', dawn2: '#b06a45', dawn3: '#e8b264',
    black: '#0c0c0f', purple: '#4b2a56', green100: '#1f5c34'
  };

  const FONT = {
    display: 'Georgia, "Times New Roman", serif',
    ui: '"Trebuchet MS", "Segoe UI", sans-serif',
    hand: '"Segoe Script", "Bradley Hand", cursive',
    mono: '"Courier New", monospace'
  };

  // ---------- tiny math ----------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  function hex2rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function mix(h1, h2, t) {
    const a = hex2rgb(h1), b = hex2rgb(h2);
    return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')';
  }
  function alpha(h, a) {
    const c = hex2rgb(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  // ---------- shapes ----------
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function lampPool(ctx, x, y, r, warmth, strength) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const core = warmth > 0.5 ? '#ffd9a0' : '#ffeccb';
    g.addColorStop(0, alpha(core, 0.16 * (strength == null ? 1 : strength)));
    g.addColorStop(0.6, alpha(core, 0.06 * (strength == null ? 1 : strength)));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function vignette(ctx, W, H, k) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (k == null ? 0.5 : k) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  function brassGrad(ctx, x0, y0, x1, y1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, PAL.brassDark);
    g.addColorStop(0.45, PAL.brass);
    g.addColorStop(0.55, PAL.brassHi);
    g.addColorStop(1, PAL.brassDark);
    return g;
  }

  // ---------- neon ----------
  // flicker: pass a phase; sign occasionally stutters like the transformer's tired
  function neon(ctx, text, x, y, size, color, t, opts) {
    opts = opts || {};
    const stutter = opts.steady ? 1 : (Math.sin(t * 1.7) > 0.985 ? 0.35 : 1) * (0.92 + 0.08 * Math.sin(t * 13 + x));
    ctx.save();
    ctx.font = (opts.weight || 'bold') + ' ' + size + 'px ' + (opts.font || FONT.display);
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.55 * stutter;
    ctx.fillStyle = alpha(color, 0.85 * stutter);
    ctx.fillText(text, x, y);
    ctx.shadowBlur = size * 0.2;
    ctx.fillStyle = mix(color, '#ffffff', 0.75);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ---------- text helpers ----------
  function label(ctx, text, x, y, size, color, align, font, weight) {
    ctx.font = (weight || '') + ' ' + size + 'px ' + (font || FONT.ui);
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || PAL.ivory;
    ctx.fillText(text, x, y);
  }
  function wrapText(ctx, text, x, y, maxW, lineH, size, color, align, font) {
    ctx.font = size + 'px ' + (font || FONT.ui);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color || PAL.ivory;
    const words = text.split(' ');
    let line = '', yy = y, lines = 0;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy); yy += lineH; line = w; lines++;
      } else line = test;
    }
    if (line) { ctx.fillText(line, x, yy); yy += lineH; lines++; }
    return yy;
  }

  // ---------- chips ----------
  const CHIP_STYLE = {
    1: { body: '#e8e0cc', edge: '#b8ab8a', text: '#5a5040' },
    5: { body: '#a8333c', edge: '#e8e0cc', text: '#f5ead6' },
    25: { body: '#1f6b40', edge: '#e8e0cc', text: '#f5ead6' },
    100: { body: '#17171c', edge: '#c9a227', text: '#f3d97a' },
    500: { body: '#4b2a56', edge: '#e8e0cc', text: '#f5ead6' },
    1000: { body: '#b8912a', edge: '#17171c', text: '#17171c' }
  };
  function chipDenoms(amount) {
    // break a sum into a sensible pile
    const out = [];
    for (const d of [1000, 500, 100, 25, 5, 1]) {
      while (amount >= d && out.length < 24) { out.push(d); amount -= d; }
    }
    return out;
  }
  function drawChip(ctx, x, y, r, denom, rot) {
    const st = CHIP_STYLE[denom] || CHIP_STYLE[5];
    rot = rot || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // body
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = st.body; ctx.fill();
    // edge dashes
    ctx.strokeStyle = st.edge;
    ctx.lineWidth = r * 0.34;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.86, i * TAU / 6 - 0.18, i * TAU / 6 + 0.18);
      ctx.stroke();
    }
    // inner ring + face
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU);
    ctx.fillStyle = mix(st.body, '#000000', 0.12); ctx.fill();
    ctx.strokeStyle = alpha(st.edge, 0.7); ctx.lineWidth = r * 0.05; ctx.stroke();
    // top-light
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.6, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.rotate(-rot);
    label(ctx, denom >= 1000 ? '1K' : String(denom), 0, r * 0.02, r * 0.62, st.text, 'center', FONT.display, 'bold');
    ctx.restore();
  }
  function drawChipStack(ctx, x, y, amount, r, seed) {
    const denoms = chipDenoms(amount);
    // group by denom into little columns
    const cols = [];
    let cur = null;
    for (const d of denoms) {
      if (!cur || cur.d !== d || cur.n >= 8) { cur = { d, n: 0 }; cols.push(cur); }
      cur.n++;
    }
    const spread = (cols.length - 1) * r * 1.9;
    let cx = x - spread / 2;
    let si = seed || 1;
    const rnd = () => { si = (si * 16807) % 2147483647; return (si / 2147483647) - 0.5; };
    for (const col of cols) {
      for (let i = 0; i < col.n; i++) {
        const jx = rnd() * r * 0.16, ja = rnd() * 0.5;
        // side of the stack
        ctx.fillStyle = mix((CHIP_STYLE[col.d] || CHIP_STYLE[5]).body, '#000', 0.35);
        rr(ctx, cx - r + jx, y - i * r * 0.42 - r * 0.18, r * 2, r * 0.36, r * 0.18);
        ctx.fill();
        if (i === col.n - 1) drawChip(ctx, cx + jx, y - i * r * 0.42 - r * 0.1, r, col.d, ja);
      }
      cx += r * 1.9;
    }
  }

  // ---------- cards ----------
  const SUIT_CH = ['♠', '♥', '♣', '♦'];
  const SUIT_RED = [false, true, false, true];
  function suitPath(ctx, s, x, y, size) {
    // drawn suits — crisper than font glyphs at small sizes
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 100, size / 100);
    ctx.beginPath();
    if (s === 0) { // spade
      ctx.moveTo(0, -50);
      ctx.bezierCurveTo(28, -18, 44, -4, 44, 16);
      ctx.bezierCurveTo(44, 34, 26, 42, 12, 32);
      ctx.bezierCurveTo(16, 44, 24, 50, 30, 54);
      ctx.lineTo(-30, 54);
      ctx.bezierCurveTo(-24, 50, -16, 44, -12, 32);
      ctx.bezierCurveTo(-26, 42, -44, 34, -44, 16);
      ctx.bezierCurveTo(-44, -4, -28, -18, 0, -50);
    } else if (s === 1) { // heart
      ctx.moveTo(0, 54);
      ctx.bezierCurveTo(-46, 18, -46, -14, -24, -34);
      ctx.bezierCurveTo(-10, -46, 0, -36, 0, -22);
      ctx.bezierCurveTo(0, -36, 10, -46, 24, -34);
      ctx.bezierCurveTo(46, -14, 46, 18, 0, 54);
    } else if (s === 2) { // club
      ctx.arc(0, -28, 22, 0, TAU);
      ctx.moveTo(22, 12); ctx.arc(22, 6, 20, 0, TAU);
      ctx.moveTo(-2, 12); ctx.arc(-22, 6, 20, 0, TAU);
      ctx.moveTo(12, 54); ctx.lineTo(-12, 54);
      ctx.bezierCurveTo(-4, 40, -6, 24, -8, 14);
      ctx.lineTo(8, 14);
      ctx.bezierCurveTo(6, 24, 4, 40, 12, 54);
    } else { // diamond
      ctx.moveTo(0, -52); ctx.lineTo(34, 0); ctx.lineTo(0, 52); ctx.lineTo(-34, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // pip layouts per rank (unit grid: x in [-1,1], y in [-1,1])
  const PIP_LAYOUT = {
    2: [[0, -0.8], [0, 0.8]],
    3: [[0, -0.8], [0, 0], [0, 0.8]],
    4: [[-0.55, -0.8], [0.55, -0.8], [-0.55, 0.8], [0.55, 0.8]],
    5: [[-0.55, -0.8], [0.55, -0.8], [0, 0], [-0.55, 0.8], [0.55, 0.8]],
    6: [[-0.55, -0.8], [0.55, -0.8], [-0.55, 0], [0.55, 0], [-0.55, 0.8], [0.55, 0.8]],
    7: [[-0.55, -0.8], [0.55, -0.8], [0, -0.4], [-0.55, 0], [0.55, 0], [-0.55, 0.8], [0.55, 0.8]],
    8: [[-0.55, -0.8], [0.55, -0.8], [0, -0.4], [-0.55, 0], [0.55, 0], [0, 0.4], [-0.55, 0.8], [0.55, 0.8]],
    9: [[-0.55, -0.8], [0.55, -0.8], [-0.55, -0.27], [0.55, -0.27], [0, 0], [-0.55, 0.27], [0.55, 0.27], [-0.55, 0.8], [0.55, 0.8]],
    10: [[-0.55, -0.8], [0.55, -0.8], [0, -0.55], [-0.55, -0.27], [0.55, -0.27], [-0.55, 0.27], [0.55, 0.27], [0, 0.55], [-0.55, 0.8], [0.55, 0.8]]
  };
  function drawCourtFace(ctx, rank, s, w, h) {
    // deco court: geometric bust in a framed panel, three designs recolored by suit
    const red = SUIT_RED[s];
    const cMain = red ? PAL.red : '#2b3550';
    const cTrim = PAL.brass;
    const cSkin = '#e8c9a0';
    ctx.save();
    // panel
    rr(ctx, -w * 0.32, -h * 0.36, w * 0.64, h * 0.72, 3);
    ctx.fillStyle = '#f7f1e2'; ctx.fill();
    ctx.strokeStyle = cTrim; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.clip();
    // sunburst behind
    ctx.strokeStyle = alpha(cTrim, 0.35); ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.05);
      const a = -Math.PI / 2 + (i - 4) * 0.22;
      ctx.lineTo(Math.cos(a) * w, -h * 0.05 + Math.sin(a) * w);
      ctx.stroke();
    }
    // shoulders / garment
    ctx.fillStyle = cMain;
    poly(ctx, [[-w * 0.3, h * 0.36], [-w * 0.22, h * 0.02], [0, h * 0.1], [w * 0.22, h * 0.02], [w * 0.3, h * 0.36]]);
    ctx.fill();
    // garment chevrons
    ctx.strokeStyle = cTrim; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-w * 0.18, h * 0.18); ctx.lineTo(0, h * 0.26); ctx.lineTo(w * 0.18, h * 0.18); ctx.stroke();
    // head
    ctx.fillStyle = cSkin;
    ctx.beginPath(); ctx.ellipse(0, -h * 0.1, w * 0.11, h * 0.13, 0, 0, TAU); ctx.fill();
    // face — profile-ish deco: closed lids, calm
    ctx.strokeStyle = '#7a5c3a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-w * 0.05, -h * 0.11); ctx.quadraticCurveTo(-w * 0.02, -h * 0.095, w * 0.01, -h * 0.11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.03, -h * 0.11); ctx.quadraticCurveTo(w * 0.06, -h * 0.095, w * 0.08, -h * 0.11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w * 0.02, -h * 0.04); ctx.quadraticCurveTo(0.5, -h * 0.03, w * 0.03, -h * 0.04); ctx.stroke();
    if (rank === 13) { // king: crown
      ctx.fillStyle = cTrim;
      poly(ctx, [[-w * 0.13, -h * 0.2], [-w * 0.13, -h * 0.3], [-w * 0.06, -h * 0.23], [0, -h * 0.32], [w * 0.06, -h * 0.23], [w * 0.13, -h * 0.3], [w * 0.13, -h * 0.2]]);
      ctx.fill();
      // beard
      ctx.fillStyle = '#9a7b52';
      ctx.beginPath(); ctx.ellipse(0, h * 0.0, w * 0.1, h * 0.06, 0, 0, Math.PI); ctx.fill();
    } else if (rank === 12) { // queen: diadem + hair
      ctx.fillStyle = '#5a3d22';
      ctx.beginPath(); ctx.ellipse(0, -h * 0.16, w * 0.14, h * 0.1, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = cTrim;
      rr(ctx, -w * 0.12, -h * 0.24, w * 0.24, h * 0.035, 1); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -h * 0.27, w * 0.025, 0, TAU); ctx.fill();
      // flower at the shoulder
      ctx.fillStyle = red ? PAL.redHi : cTrim;
      ctx.beginPath(); ctx.arc(w * 0.16, h * 0.12, w * 0.04, 0, TAU); ctx.fill();
    } else { // jack: soft cap and feather
      ctx.fillStyle = cMain;
      ctx.beginPath(); ctx.ellipse(-w * 0.02, -h * 0.21, w * 0.14, h * 0.07, -0.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = cTrim; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(w * 0.08, -h * 0.26); ctx.quadraticCurveTo(w * 0.2, -h * 0.34, w * 0.24, -h * 0.24); ctx.stroke();
    }
    // suit mark at the panel corner
    ctx.fillStyle = red ? PAL.red : '#1c2333';
    suitPath(ctx, s, -w * 0.24, h * 0.26, w * 0.13);
    ctx.restore();
  }
  // face-down and face-up; flip: 0 down, 1 up, animate through scaleX
  function drawCard(ctx, x, y, w, card, opts) {
    opts = opts || {};
    const h = w * 1.4;
    const flip = opts.flip == null ? 1 : opts.flip;
    const rot = opts.rot || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const sx = Math.abs(Math.cos(flip * Math.PI)); // 1 at rest, 0 mid-flip
    const showBack = flip < 0.5;
    ctx.scale(Math.max(0.06, sx), 1);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, -w / 2 + 2, -h / 2 + 3, w, h, w * 0.09); ctx.fill();
    if (showBack) {
      rr(ctx, -w / 2, -h / 2, w, h, w * 0.09);
      ctx.fillStyle = '#123c2b'; ctx.fill();
      ctx.strokeStyle = PAL.brass; ctx.lineWidth = 1.2; ctx.stroke();
      // deco lattice
      ctx.save();
      rr(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, w * 0.06);
      ctx.clip();
      ctx.strokeStyle = alpha(PAL.brass, 0.5); ctx.lineWidth = 0.8;
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath(); ctx.moveTo(i * w * 0.25 - w / 2, -h / 2); ctx.lineTo(i * w * 0.25 + w / 2, h / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * w * 0.25 + w / 2, -h / 2); ctx.lineTo(i * w * 0.25 - w / 2, h / 2); ctx.stroke();
      }
      ctx.restore();
      // center monogram
      ctx.fillStyle = PAL.brass;
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.18, w * 0.24, 0, 0, TAU); ctx.fill();
      label(ctx, 'G', 0, 1, w * 0.3, '#123c2b', 'center', FONT.display, 'bold');
    } else if (card) {
      rr(ctx, -w / 2, -h / 2, w, h, w * 0.09);
      ctx.fillStyle = '#f9f4e6'; ctx.fill();
      ctx.strokeStyle = '#c9bfa5'; ctx.lineWidth = 1; ctx.stroke();
      const red = SUIT_RED[card.s];
      const ink = red ? PAL.red : '#1c2333';
      const R = (root.GiltGames && root.GiltGames.RANK_CH[card.r]) || String(card.r);
      // corners
      ctx.fillStyle = ink;
      ctx.font = 'bold ' + (w * 0.24) + 'px ' + FONT.display;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(R, -w / 2 + w * 0.07, -h / 2 + w * 0.06);
      suitPath(ctx, card.s, -w / 2 + w * 0.155, -h / 2 + w * 0.42, w * 0.16);
      ctx.save();
      ctx.rotate(Math.PI);
      ctx.fillStyle = ink;
      ctx.font = 'bold ' + (w * 0.24) + 'px ' + FONT.display;
      ctx.fillText(R, -w / 2 + w * 0.07, -h / 2 + w * 0.06);
      suitPath(ctx, card.s, -w / 2 + w * 0.155, -h / 2 + w * 0.42, w * 0.16);
      ctx.restore();
      // center
      if (card.r >= 11 && card.r <= 13) {
        drawCourtFace(ctx, card.r, card.s, w, h);
      } else if (card.r === 14) {
        ctx.fillStyle = ink;
        suitPath(ctx, card.s, 0, 0, w * 0.52);
        if (card.s === 0) { // the ace of spades gets the house treatment
          ctx.strokeStyle = PAL.brass; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(0, 0, w * 0.3, w * 0.4, 0, 0, TAU); ctx.stroke();
        }
      } else {
        ctx.fillStyle = ink;
        const lay = PIP_LAYOUT[card.r] || [];
        for (const p of lay) {
          ctx.save();
          if (p[1] > 0.1) { ctx.translate(p[0] * w * 0.28, p[1] * h * 0.3); ctx.rotate(Math.PI); suitPath(ctx, card.s, 0, 0, w * 0.17); }
          else suitPath(ctx, card.s, p[0] * w * 0.28, p[1] * h * 0.3, w * 0.17);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  // ---------- dice ----------
  const DIE_PIPS = {
    1: [[0, 0]], 2: [[-0.5, -0.5], [0.5, 0.5]], 3: [[-0.5, -0.5], [0, 0], [0.5, 0.5]],
    4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
    5: [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]],
    6: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0], [0.5, 0], [-0.5, 0.5], [0.5, 0.5]]
  };
  function drawDie(ctx, x, y, size, face, rot, inAir) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    const s = size / 2;
    if (!inAir) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      rr(ctx, -s + 2, -s + 4, size, size, size * 0.2); ctx.fill();
    }
    rr(ctx, -s, -s, size, size, size * 0.2);
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, '#f4ece0'); g.addColorStop(1, '#d8ccb8');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#b3a68c'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = PAL.oxblood;
    for (const p of DIE_PIPS[face] || []) {
      ctx.beginPath(); ctx.arc(p[0] * s * 0.82, p[1] * s * 0.82, size * 0.09, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- roulette wheel ----------
  // top-down; rotation = wheel angle; ball at ballAngle/ballR (absolute)
  function drawRouletteWheel(ctx, x, y, R, rotation, ball, t) {
    const G = root.GiltGames;
    const ORDER = G ? G.Roulette.WHEEL_ORDER : [];
    const n = ORDER.length || 38;
    ctx.save();
    ctx.translate(x, y);
    // outer bowl
    ctx.beginPath(); ctx.arc(0, 0, R * 1.16, 0, TAU);
    ctx.fillStyle = PAL.woodDark; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, R * 1.12, 0, TAU);
    const wg = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.12);
    wg.addColorStop(0, PAL.woodHi); wg.addColorStop(1, PAL.wood);
    ctx.fillStyle = wg; ctx.fill();
    ctx.strokeStyle = brassGrad(ctx, -R, -R, R, R); ctx.lineWidth = R * 0.03; ctx.stroke();
    // ball track groove
    ctx.beginPath(); ctx.arc(0, 0, R * 1.0, 0, TAU);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = R * 0.09; ctx.stroke();
    ctx.save();
    ctx.rotate(rotation);
    // pockets
    for (let i = 0; i < n; i++) {
      const a0 = i * TAU / n, a1 = (i + 1) * TAU / n;
      const p = ORDER[i];
      const col = p === '0' || p === '00' ? '#1f5c34' : (G && G.Roulette.REDS.has(parseInt(p, 10)) ? PAL.red : '#17171c');
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.9, a0, a1);
      ctx.arc(0, 0, R * 0.62, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = alpha(PAL.brass, 0.8); ctx.lineWidth = 1; ctx.stroke();
      // number
      const am = (a0 + a1) / 2;
      ctx.save();
      ctx.rotate(am);
      ctx.translate(R * 0.76, 0);
      ctx.rotate(Math.PI / 2);
      label(ctx, p, 0, 0, R * 0.085, PAL.ivory, 'center', FONT.ui, 'bold');
      ctx.restore();
    }
    // cone
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.62);
    cg.addColorStop(0, PAL.brassHi); cg.addColorStop(0.25, PAL.brass); cg.addColorStop(1, PAL.brassDark);
    ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, TAU); ctx.fillStyle = cg; ctx.fill();
    // turret
    ctx.beginPath(); ctx.arc(0, 0, R * 0.12, 0, TAU); ctx.fillStyle = PAL.brassHi; ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 2);
      rr(ctx, R * 0.1, -R * 0.02, R * 0.16, R * 0.04, R * 0.02);
      ctx.fillStyle = PAL.brass; ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // ball
    if (ball) {
      const bx = Math.cos(ball.angle) * ball.r * R, by = Math.sin(ball.angle) * ball.r * R;
      ctx.beginPath(); ctx.arc(bx, by, R * 0.045, 0, TAU);
      ctx.fillStyle = '#f5f2ea'; ctx.fill();
      ctx.beginPath(); ctx.arc(bx - R * 0.012, by - R * 0.015, R * 0.018, 0, TAU);
      ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    ctx.restore();
  }

  // ---------- big six wheel ----------
  function drawBigSix(ctx, x, y, R, rotation) {
    const G = root.GiltGames;
    const SEGS = G ? G.BigSix.SEGMENTS : [];
    const n = SEGS.length || 54;
    const COLS = { '1': '#e8e0cc', '2': '#a8333c', '5': '#1f6b40', '10': '#2b3550', '20': '#4b2a56', 'joker': '#b8912a', 'crest': '#17171c' };
    const TXT = { '1': '#5a5040', '2': '#f5ead6', '5': '#f5ead6', '10': '#f5ead6', '20': '#f5ead6', 'joker': '#17171c', 'crest': '#f3d97a' };
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    for (let i = 0; i < n; i++) {
      const a0 = i * TAU / n - TAU / n / 2, a1 = a0 + TAU / n;
      const seg = SEGS[i];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = COLS[seg]; ctx.fill();
      ctx.strokeStyle = PAL.brassDark; ctx.lineWidth = 1; ctx.stroke();
      ctx.save();
      ctx.rotate((a0 + a1) / 2);
      ctx.translate(R * 0.82, 0);
      ctx.rotate(Math.PI / 2);
      const short = seg === 'joker' ? '★' : (seg === 'crest' ? 'G' : seg);
      label(ctx, short, 0, 0, R * 0.09, TXT[seg], 'center', FONT.display, 'bold');
      ctx.restore();
      // peg
      const pa = a1;
      ctx.beginPath(); ctx.arc(Math.cos(pa) * R * 0.97, Math.sin(pa) * R * 0.97, R * 0.018, 0, TAU);
      ctx.fillStyle = PAL.brassHi; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, R * 0.3, 0, TAU);
    const hub = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.3);
    hub.addColorStop(0, PAL.brassHi); hub.addColorStop(1, PAL.brassDark);
    ctx.fillStyle = hub; ctx.fill();
    ctx.rotate(-rotation);
    label(ctx, 'THE GILT', 0, 0, R * 0.075, PAL.woodDark, 'center', FONT.display, 'bold');
    ctx.restore();
    // clacker at top
    ctx.save();
    ctx.translate(x, y - R - 6);
    ctx.fillStyle = PAL.oxblood;
    poly(ctx, [[-7, -10], [7, -10], [0, 16]]);
    ctx.fill();
    ctx.strokeStyle = PAL.brass; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  // ---------- slot cabinet ----------
  function drawSlotCabinet(ctx, x, y, w, opts) {
    // x,y top-left; w cabinet width. opts: {title, sub, reels:[sym,sym,sym], reelOffsets:[0..1 spin phase or null], lever:0..1, meter:number|null, litLine:bool, t}
    opts = opts || {};
    const h = w * 1.5;
    ctx.save();
    ctx.translate(x, y);
    // body
    rr(ctx, 0, 0, w, h, w * 0.06);
    const bodyG = ctx.createLinearGradient(0, 0, 0, h);
    bodyG.addColorStop(0, '#6e1f24'); bodyG.addColorStop(0.5, '#521319'); bodyG.addColorStop(1, '#38090d');
    ctx.fillStyle = bodyG; ctx.fill();
    ctx.strokeStyle = brassGrad(ctx, 0, 0, w, 0); ctx.lineWidth = 2; ctx.stroke();
    // top glass / title
    rr(ctx, w * 0.08, w * 0.07, w * 0.84, w * 0.3, w * 0.03);
    ctx.fillStyle = '#17110b'; ctx.fill();
    ctx.strokeStyle = PAL.brass; ctx.lineWidth = 1.5; ctx.stroke();
    if (opts.title) neon(ctx, opts.title, w * 0.5, w * 0.19, w * 0.085, opts.neonColor || PAL.pink, opts.t || 0, { steady: false });
    if (opts.sub) label(ctx, opts.sub, w * 0.5, w * 0.31, w * 0.045, PAL.ivoryDim, 'center', FONT.ui);
    // meter (progressive)
    let reelTop = w * 0.44;
    if (opts.meter != null) {
      rr(ctx, w * 0.14, w * 0.4, w * 0.72, w * 0.14, w * 0.02);
      ctx.fillStyle = '#0c0c0f'; ctx.fill();
      ctx.strokeStyle = PAL.brass; ctx.stroke();
      label(ctx, '$' + Math.floor(opts.meter).toLocaleString('en-US'), w * 0.5, w * 0.475, w * 0.1, '#ffb04f', 'center', FONT.mono, 'bold');
      reelTop = w * 0.6;
    }
    // reel window
    rr(ctx, w * 0.1, reelTop, w * 0.8, w * 0.42, w * 0.03);
    ctx.fillStyle = '#f4ecdc'; ctx.fill();
    ctx.strokeStyle = PAL.brassDark; ctx.lineWidth = 2; ctx.stroke();
    const rw = w * 0.8 / 3;
    for (let i = 0; i < 3; i++) {
      const rx = w * 0.1 + i * rw;
      ctx.save();
      rr(ctx, rx + 2, reelTop + 2, rw - 4, w * 0.42 - 4, w * 0.02);
      ctx.clip();
      const phase = opts.reelOffsets ? opts.reelOffsets[i] : null;
      if (phase != null && phase > 0) {
        // spinning: vertical smear of symbols
        for (let k = -1; k <= 2; k++) {
          const sym = SLOT_GLYPH_KEYS[(Math.floor((opts.t || 0) * 30 + i * 3 + k) % SLOT_GLYPH_KEYS.length + SLOT_GLYPH_KEYS.length) % SLOT_GLYPH_KEYS.length];
          drawSlotSymbol(ctx, sym, rx + rw / 2, reelTop + w * 0.21 + (k - (phase % 1)) * w * 0.3, rw * 0.5, 0.5);
        }
        ctx.fillStyle = 'rgba(244,236,220,0.35)';
        ctx.fillRect(rx, reelTop, rw, w * 0.42);
      } else if (opts.reels) {
        drawSlotSymbol(ctx, opts.reels[i], rx + rw / 2, reelTop + w * 0.21, rw * 0.5, 1);
      }
      // window shading
      const sg = ctx.createLinearGradient(0, reelTop, 0, reelTop + w * 0.42);
      sg.addColorStop(0, 'rgba(0,0,0,0.35)'); sg.addColorStop(0.25, 'rgba(0,0,0,0)');
      sg.addColorStop(0.75, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = sg;
      ctx.fillRect(rx, reelTop, rw, w * 0.42);
      ctx.restore();
      ctx.strokeStyle = alpha(PAL.brassDark, 0.6); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(rx, reelTop + 2); ctx.lineTo(rx, reelTop + w * 0.42 - 2); ctx.stroke();
    }
    // payline
    if (opts.litLine) {
      ctx.strokeStyle = alpha('#ffb04f', 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w * 0.08, reelTop + w * 0.21); ctx.lineTo(w * 0.92, reelTop + w * 0.21); ctx.stroke();
    }
    // coin tray
    rr(ctx, w * 0.2, h - w * 0.18, w * 0.6, w * 0.12, w * 0.03);
    ctx.fillStyle = '#17110b'; ctx.fill();
    ctx.strokeStyle = brassGrad(ctx, 0, h - w * 0.2, 0, h); ctx.lineWidth = 2; ctx.stroke();
    // lever
    const lv = opts.lever || 0;
    ctx.save();
    ctx.translate(w + w * 0.02, reelTop + w * 0.15);
    ctx.rotate(lerp(-0.5, 0.9, ease(lv)));
    ctx.strokeStyle = brassGrad(ctx, 0, -w * 0.3, 0, 0); ctx.lineWidth = w * 0.045;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -w * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -w * 0.32, w * 0.055, 0, TAU);
    ctx.fillStyle = PAL.red; ctx.fill();
    ctx.strokeStyle = '#7a1e25'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  const SLOT_GLYPH_KEYS = ['CH', 'LM', 'OR', 'PL', 'BE', 'BA', 'BB', 'SV', 'CR'];
  function drawSlotSymbol(ctx, sym, x, y, size, aVis) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = aVis == null ? 1 : aVis;
    const s = size;
    if (sym === 'CH') { // cherries
      ctx.strokeStyle = '#3f6b2a'; ctx.lineWidth = s * 0.09;
      ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.quadraticCurveTo(-s * 0.05, -s * 0.1, -s * 0.28, s * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.quadraticCurveTo(s * 0.1, -s * 0.1, s * 0.24, s * 0.16); ctx.stroke();
      for (const [cx, cy] of [[-s * 0.28, s * 0.28], [s * 0.24, s * 0.26]]) {
        ctx.beginPath(); ctx.arc(cx, cy, s * 0.2, 0, TAU);
        const g = ctx.createRadialGradient(cx - s * 0.06, cy - s * 0.08, 0, cx, cy, s * 0.2);
        g.addColorStop(0, '#e05a62'); g.addColorStop(1, '#8e1f28');
        ctx.fillStyle = g; ctx.fill();
      }
      ctx.fillStyle = '#4a7a33';
      ctx.beginPath(); ctx.ellipse(s * 0.05, -s * 0.5, s * 0.16, s * 0.07, -0.4, 0, TAU); ctx.fill();
    } else if (sym === 'LM' || sym === 'OR' || sym === 'PL') {
      const col = sym === 'LM' ? '#e8d24a' : (sym === 'OR' ? '#e08a3a' : '#6b4a8e');
      ctx.beginPath();
      if (sym === 'LM') ctx.ellipse(0, 0, s * 0.42, s * 0.3, 0, 0, TAU);
      else ctx.arc(0, 0, s * 0.36, 0, TAU);
      const g = ctx.createRadialGradient(-s * 0.1, -s * 0.12, 0, 0, 0, s * 0.42);
      g.addColorStop(0, mix(col, '#ffffff', 0.35)); g.addColorStop(1, mix(col, '#000000', 0.25));
      ctx.fillStyle = g; ctx.fill();
      if (sym === 'LM') { ctx.fillStyle = '#c9b53a'; ctx.beginPath(); ctx.ellipse(s * 0.42, 0, s * 0.07, s * 0.05, 0, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = '#4a7a33'; ctx.beginPath(); ctx.ellipse(0, -s * 0.36, s * 0.12, s * 0.05, 0.3, 0, TAU); ctx.fill(); }
    } else if (sym === 'BE') { // bell
      ctx.fillStyle = '#d9b23a';
      ctx.beginPath();
      ctx.moveTo(-s * 0.32, s * 0.22);
      ctx.quadraticCurveTo(-s * 0.3, -s * 0.05, -s * 0.14, -s * 0.24);
      ctx.quadraticCurveTo(0, -s * 0.42, s * 0.14, -s * 0.24);
      ctx.quadraticCurveTo(s * 0.3, -s * 0.05, s * 0.32, s * 0.22);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8e6f1c';
      rr(ctx, -s * 0.36, s * 0.2, s * 0.72, s * 0.09, s * 0.04); ctx.fill();
      ctx.beginPath(); ctx.arc(0, s * 0.36, s * 0.08, 0, TAU); ctx.fill();
    } else if (sym === 'BA' || sym === 'BB') {
      const bars = sym === 'BA' ? 1 : 2;
      for (let i = 0; i < bars; i++) {
        const by = (i - (bars - 1) / 2) * s * 0.34;
        rr(ctx, -s * 0.42, by - s * 0.13, s * 0.84, s * 0.26, s * 0.05);
        ctx.fillStyle = '#17171c'; ctx.fill();
        ctx.strokeStyle = PAL.brass; ctx.lineWidth = s * 0.03; ctx.stroke();
        label(ctx, 'BAR', 0, by + 1, s * 0.19, PAL.brassHi, 'center', FONT.ui, 'bold');
      }
    } else if (sym === 'SV') {
      ctx.fillStyle = PAL.red;
      ctx.font = 'bold ' + s * 0.95 + 'px ' + FONT.display;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#5e1218'; ctx.lineWidth = s * 0.05;
      ctx.strokeText('7', 0, s * 0.05);
      ctx.fillText('7', 0, s * 0.05);
    } else if (sym === 'CR') { // the gilt crest
      ctx.fillStyle = PAL.brass;
      poly(ctx, [[0, -s * 0.44], [s * 0.38, -s * 0.1], [s * 0.24, s * 0.4], [-s * 0.24, s * 0.4], [-s * 0.38, -s * 0.1]]);
      ctx.fill();
      ctx.strokeStyle = '#7a5c1a'; ctx.lineWidth = s * 0.03; ctx.stroke();
      label(ctx, 'G', 0, s * 0.02, s * 0.5, '#38090d', 'center', FONT.display, 'bold');
    }
    ctx.restore();
  }

  // ---------- carpet ----------
  let carpetPattern = null;
  function getCarpet(ctx) {
    if (carpetPattern) return carpetPattern;
    if (typeof document === 'undefined') return PAL.room;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#12241b'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(201,162,39,0.12)'; g.lineWidth = 1.5;
    // interlocking deco diamonds
    for (const [ox, oy] of [[0, 0], [32, 32]]) {
      g.beginPath();
      g.moveTo(ox + 16, oy - 12); g.lineTo(ox + 44, oy + 16); g.lineTo(ox + 16, oy + 44); g.lineTo(ox - 12, oy + 16);
      g.closePath(); g.stroke();
      g.beginPath();
      g.moveTo(ox + 16, oy); g.lineTo(ox + 32, oy + 16); g.lineTo(ox + 16, oy + 32); g.lineTo(ox, oy + 16);
      g.closePath(); g.stroke();
    }
    g.fillStyle = 'rgba(110,31,36,0.25)';
    g.beginPath(); g.arc(16, 16, 2.2, 0, TAU); g.fill();
    g.beginPath(); g.arc(48, 48, 2.2, 0, TAU); g.fill();
    carpetPattern = ctx.createPattern(c, 'repeat');
    return carpetPattern;
  }

  // ---------- smoke ----------
  function Smoke() {
    const parts = [];
    return {
      puff(x, y, drift) {
        if (parts.length > 60) return;
        parts.push({ x, y, vx: (drift || 0) + (Math.random() - 0.5) * 3, vy: -8 - Math.random() * 6, r: 2 + Math.random() * 3, a: 0.16 + Math.random() * 0.08, t: 0 });
      },
      step(dt) {
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.t += dt;
          p.x += (p.vx + Math.sin(p.t * 2 + p.y * 0.05) * 4) * dt;
          p.y += p.vy * dt;
          p.r += dt * 4;
          p.a -= dt * 0.045;
          if (p.a <= 0) parts.splice(i, 1);
        }
      },
      draw(ctx) {
        for (const p of parts) {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fillStyle = 'rgba(160,170,180,' + p.a.toFixed(3) + ')';
          ctx.fill();
        }
      }
    };
  }

  // ---------- chip flight (shared animation helper) ----------
  function ChipFlights() {
    const flights = [];
    return {
      fly(x0, y0, x1, y1, denom, delay, onLand) {
        flights.push({ x0, y0, x1, y1, denom, t: -(delay || 0), dur: 0.38, onLand });
      },
      fountain(x, y, count) {
        for (let i = 0; i < count; i++) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
          const sp = 220 + Math.random() * 260;
          flights.push({ ball: true, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, denom: [5, 25, 100, 1000][Math.floor(Math.random() * 4)], t: 0, dur: 1.4 + Math.random() * 0.5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12 });
        }
      },
      step(dt) {
        for (let i = flights.length - 1; i >= 0; i--) {
          const f = flights[i];
          f.t += dt;
          if (f.ball) {
            f.vy += 900 * dt;
            f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
            if (f.t > f.dur) flights.splice(i, 1);
          } else if (f.t > f.dur) {
            if (f.onLand) f.onLand();
            flights.splice(i, 1);
          }
        }
      },
      draw(ctx) {
        for (const f of flights) {
          if (f.ball) {
            ctx.globalAlpha = clamp(1 - (f.t / f.dur - 0.7) / 0.3, 0, 1);
            drawChip(ctx, f.x, f.y, 9, f.denom, f.rot);
            ctx.globalAlpha = 1;
          } else if (f.t > 0) {
            const k = ease(clamp(f.t / f.dur, 0, 1));
            const x = lerp(f.x0, f.x1, k), y = lerp(f.y0, f.y1, k) - Math.sin(k * Math.PI) * 40;
            drawChip(ctx, x, y, 10, f.denom, k * 7);
          }
        }
      },
      get busy() { return flights.length > 0; }
    };
  }

  // ---------- felt table base (scene backdrop across the felt) ----------
  function tableBackdrop(ctx, W, H, dawn, opts) {
    opts = opts || {};
    // back wall
    const wall = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    wall.addColorStop(0, mix(PAL.deep, PAL.dawn2, dawn * 0.35));
    wall.addColorStop(1, mix(PAL.room, PAL.dawn1, dawn * 0.25));
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H * 0.5);
    // wainscoting
    ctx.fillStyle = PAL.woodDark;
    ctx.fillRect(0, H * 0.42, W, H * 0.08);
    ctx.fillStyle = alpha(PAL.brass, 0.5);
    ctx.fillRect(0, H * 0.42, W, 2);
    // felt sweeps up toward the player
    const felt = ctx.createLinearGradient(0, H * 0.44, 0, H);
    felt.addColorStop(0, opts.feltDark || PAL.feltDark);
    felt.addColorStop(0.45, opts.felt || PAL.felt);
    felt.addColorStop(1, opts.feltHi || PAL.feltHi);
    ctx.fillStyle = felt;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.5);
    ctx.quadraticCurveTo(W / 2, H * 0.42, W, H * 0.5);
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath(); ctx.fill();
    // padded rail at the table edge
    ctx.strokeStyle = PAL.woodDark;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(-10, H * 0.505);
    ctx.quadraticCurveTo(W / 2, H * 0.425, W + 10, H * 0.505);
    ctx.stroke();
    ctx.strokeStyle = alpha(PAL.woodHi, 0.8);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-10, H * 0.5);
    ctx.quadraticCurveTo(W / 2, H * 0.42, W + 10, H * 0.5);
    ctx.stroke();
  }

  const Art = {
    PAL, FONT, TAU, clamp, lerp, ease, mix, alpha,
    rr, poly, lampPool, vignette, brassGrad, neon, label, wrapText,
    CHIP_STYLE, chipDenoms, drawChip, drawChipStack,
    SUIT_CH, SUIT_RED, suitPath, drawCard, drawCourtFace,
    drawDie, drawRouletteWheel, drawBigSix, drawSlotCabinet, drawSlotSymbol,
    getCarpet, Smoke, ChipFlights, tableBackdrop
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Art;
  root.GiltArt = Art;
})(typeof window !== 'undefined' ? window : globalThis);
