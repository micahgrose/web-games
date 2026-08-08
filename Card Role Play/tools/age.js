'use strict';

// ── Ageing the deck ────────────────────────────────────
// The CC0 artwork is bright white paper and poster-flat colour. This
// takes it to something that has been in a drawer since 1974.
//
// Two parts, and both are needed. A palette remap alone gives a card
// printed on cream stock rather than an old card, because the inks stay
// poster-bright. Uneven overlays alone leave the paper white.
//
// Note the one that does NOT work: CSS sepia(). Push pure white through
// the sepia matrix and it comes out (255,255,239) — white clips and
// stays white. sepia() cannot yellow paper at all; all it does is mute
// the inks, so you get a bright white card with drab art. Exactly
// backwards.

// OFF by default: the game ships the plain deck. Pass a strength to
// build the aged one — 1 is barely there, 2.4 is the tuned setting, 4
// looks properly handled:
//
//   AGE_STRENGTH=2.4 node tools/fetch-cards.js
//
// A copy of the deck built at 2.4 is kept in artwork/aged-deck/.
const STRENGTH = Number(process.env.AGE_STRENGTH || 0);
const ENABLED = STRENGTH > 0;

// The artwork is a flat six-colour poster, so the palette can be
// remapped exactly rather than filtered. Real ageing creams the paper
// AND fades and warms the inks; doing only the first looks stained.
const AGED = {
    '#ffffff': '#f3e8d0',   // paper
    '#000000': '#241f18',   // black ink → warm near-black
    '#ff5555': '#d9615a',   // red
    '#ffff55': '#e8d078',   // yellow
    '#5555aa': '#5c5d96',   // the indigo linework
    '#ff0000': '#cc2a24',
    '#ffff00': '#e2c65a',
    '#f4e3d7': '#e7d6bd',
};

// How coarse the paper mottling is, in blotches across the card's
// width. This is the number that matters and the one to state plainly:
// a "feature size" reads as its own opposite half the time, and the
// first cut of this was tuned at 3 blotches and shipped at 4.5, which
// is fine enough to disappear at the size a card is actually shown.
const MOTTLE_DARK_CYCLES = 3.1;
const MOTTLE_LIGHT_CYCLES = 4.3;

const hex = (s) => [
    parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16),
];
const str = (c) => '#' + c.map(v =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

const PALETTE = Object.keys(AGED).map(k => ({ from: hex(k), to: hex(AGED[k]) }));

/** Nearest palette entry, so the near-duplicate shades follow suit. */
function shift(c) {
    let best = null, bd = Infinity;
    for (const p of PALETTE) {
        const d = (c[0] - p.from[0]) ** 2 + (c[1] - p.from[1]) ** 2 + (c[2] - p.from[2]) ** 2;
        if (d < bd) { bd = d; best = p; }
    }
    return bd <= 3600 ? best.to : c;
}

/** Age every colour in a card's markup. */
function recolour(svg) {
    return svg.replace(/#([0-9a-fA-F]{6})\b/g, (m) => str(shift(hex(m.toLowerCase()))));
}

/** A card's own number, so it always wears the same way. */
function seedOf(name) {
    let h = 2166136261;
    for (const ch of name) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
const rng = (s) => () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0) / 4294967296);

/**
 * The uneven part: a broad cast, handling wear at the edges, and paper
 * mottle. Every value is seeded from the card's name, so the seven of
 * clubs is always marked in exactly the same places — it is the same
 * physical card every time it is dealt.
 *
 * Returned in the card's own user space (x, y, w, h from its viewBox).
 */
function patina(name, x, y, w, h) {
    const R = rng(seedOf(name));
    const seed = seedOf(name) % 1000;
    const a = (v) => (v * STRENGTH).toFixed(3);
    const rx = (w * 29.944 / 360).toFixed(1);
    const defs = [], paint = [];

    const box = (extra) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${extra}/>`;

    // A broad uneven cast — as if it sat in a drawer one way up.
    defs.push(`<linearGradient id="ag-cast" gradientTransform="rotate(${(R() * 360).toFixed(0)} .5 .5)">`
        + `<stop offset="0" stop-color="#8a6a22" stop-opacity="0"/>`
        + `<stop offset=".55" stop-color="#8a6a22" stop-opacity="${a(0.045)}"/>`
        + `<stop offset="1" stop-color="#8a6a22" stop-opacity="${a(0.115)}"/></linearGradient>`);
    paint.push(box(`fill="url(#ag-cast)" style="mix-blend-mode:multiply"`));

    // Handling wear: borders and corners darken first.
    defs.push(`<radialGradient id="ag-vig" cx=".5" cy=".5" r=".74">`
        + `<stop offset=".5" stop-color="#6b4a18" stop-opacity="0"/>`
        + `<stop offset="1" stop-color="#6b4a18" stop-opacity="${a(0.14)}"/></radialGradient>`);
    paint.push(box(`fill="url(#ag-vig)" style="mix-blend-mode:multiply"`));

    defs.push(`<linearGradient id="ag-edge" x1="0" y1="0" x2="1" y2="0">`
        + `<stop offset="0" stop-color="#5e3f14" stop-opacity="${a(0.13)}"/>`
        + `<stop offset="1" stop-color="#5e3f14" stop-opacity="0"/></linearGradient>`);
    const e = Math.round(w * 0.16);
    const strip = (t, len) => `<rect transform="${t}" width="${e}" height="${len}" `
        + `fill="url(#ag-edge)" style="mix-blend-mode:multiply"/>`;
    paint.push(
        strip(`translate(${x},${y})`, h),
        strip(`translate(${x + w},${y}) scale(-1,1)`, h),
        strip(`translate(${x},${y + h}) rotate(-90)`, w),
        strip(`translate(${x + w},${y}) rotate(90)`, w));

    // Paper mottle, dark and light. Two layers rather than one because
    // real paper varies in both directions — and because darkening
    // alone costs the pips contrast against the glow the card sits in.
    const freq = (cycles) => (cycles / w).toFixed(5);
    defs.push(`<filter id="ag-nzd" x="0" y="0" width="100%" height="100%">`
        + `<feTurbulence type="fractalNoise" baseFrequency="${freq(MOTTLE_DARK_CYCLES)}" numOctaves="4" seed="${seed}"/>`
        + `<feColorMatrix type="matrix" values="0 0 0 0 .55 0 0 0 0 .42 0 0 0 0 .16 ${a(0.34)} 0 0 0 ${a(-0.09)}"/>`
        + `</filter>`);
    paint.push(box(`filter="url(#ag-nzd)" style="mix-blend-mode:multiply"`));

    defs.push(`<filter id="ag-nzl" x="0" y="0" width="100%" height="100%">`
        + `<feTurbulence type="fractalNoise" baseFrequency="${freq(MOTTLE_LIGHT_CYCLES)}" numOctaves="3" seed="${(seed + 371) % 1000}"/>`
        + `<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 .97 0 0 0 0 .88 ${a(0.26)} 0 0 0 ${a(-0.07)}"/>`
        + `</filter>`);
    paint.push(box(`filter="url(#ag-nzl)" style="mix-blend-mode:screen"`));

    return `<defs>${defs.join('')}<clipPath id="ag-clip">`
        + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath></defs>`
        + `<g clip-path="url(#ag-clip)">${paint.join('')}</g>`;
}

/**
 * The whole pass, or nothing at all. Returns the card's markup either
 * aged — palette remapped, patina laid over — or exactly as it came.
 */
function age(markup, name, x, y, w, h) {
    if (!ENABLED) return markup;
    return recolour(markup) + patina(name, x, y, w, h);
}

module.exports = { age, recolour, patina, STRENGTH, ENABLED, AGED };
