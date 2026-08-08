'use strict';

// ── Build the card artwork ─────────────────────────────
//   node tools/fetch-cards.js
//
// The cards are not drawn by hand. They come from Dmitry Fomin's
// English-pattern deck on Wikimedia Commons, released CC0 (public
// domain dedication) — the same artwork Wikipedia uses. Hand-drawing
// engraved court figures in SVG paths was never going to match a
// traced real deck, and this is the whole set in one consistent style,
// jokers included.
//
//   source: https://commons.wikimedia.org/wiki/File:English_pattern_playing_cards_deck_with_extra_cards.svg
//   author: Dmitry Fomin
//   licence: CC0 1.0 Universal (no rights reserved)
//
// The download is one 2.9 MB sheet of 13 × 5 cells. Every card is a
// self-contained top-level <g> — no gradients, clip paths or shared
// refs — so each one splits out into its own small file. Which cell a
// group lands in is worked out by rendering it and looking, rather
// than by trusting the transform arithmetic.
//
// Run this once; the output is committed. It only needs re-running to
// change the artwork.

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const SRC = 'https://commons.wikimedia.org/wiki/Special:FilePath/'
    + 'English%20pattern%20playing%20cards%20deck%20with%20extra%20cards.svg';

const OUT = path.join(__dirname, '..', 'public', 'cards');
const CACHE = path.join(__dirname, '.deck-cache.svg');

const COLS = 13, ROWS = 5;
const CELL_W = 360, CELL_H = 540;
const SHEET_W = COLS * CELL_W, SHEET_H = ROWS * CELL_H;

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const ROW_SUIT = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];

// The fifth row holds the extras. Only the two jokers are wanted —
// the game keeps its own back, which is themed to the table.
const EXTRAS = { 0: 'JokerBlack', 1: 'JokerRed' };

/** Strip the editor's leavings. Keeps geometry untouched. */
function slim(svg) {
    return svg
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
        .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, '')
        .replace(/\s(sodipodi|inkscape):[\w-]+="[^"]*"/g, '')
        .replace(/\s(id|inkscape:label)="[^"]*"/g, '')   // ids are unreferenced here
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** Round coordinate noise out of path data: 0.01 units on a 360-wide
 *  card is far below anything anybody can see. */
function roundPaths(svg) {
    return svg.replace(/ d="([^"]+)"/g, (_, d) =>
        ' d="' + d.replace(/-?\d+\.\d+/g, (n) => {
            const r = Math.round(parseFloat(n) * 100) / 100;
            return String(r);
        }) + '"');
}

/** Split the sheet into its top-level <g> elements. */
function topLevelGroups(svg) {
    const body = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
    const out = [];
    const tag = /<(\/?)g\b([^>]*)>/g;
    let depth = 0, start = -1, m;
    while ((m = tag.exec(body))) {
        const closing = m[1] === '/';
        const selfClosing = /\/$/.test(m[2]);
        if (!closing && !selfClosing) {
            if (depth === 0) start = m.index;
            depth++;
        } else if (closing) {
            depth--;
            if (depth === 0 && start >= 0) {
                out.push(body.slice(start, m.index + m[0].length));
                start = -1;
            }
        }
    }
    return out;
}

/** Which cell does this group occupy? Render it and find out.
 *  The group must already be slimmed — the editor's namespaced
 *  attributes make a standalone renderer refuse to parse it. */
// The probe canvas MUST keep the sheet's aspect ratio. Give a
// renderer a canvas of a different shape and it letterboxes the
// content, and then every measured coordinate is quietly wrong.
const PROBE_DIV = 12;
const PROBE_W = SHEET_W / PROBE_DIV;      // 390
const PROBE_H = SHEET_H / PROBE_DIV;      // 225
const CELL_PX_W = CELL_W / PROBE_DIV;     // 30
const CELL_PX_H = CELL_H / PROBE_DIV;     // 45

function cellOf(group) {
    const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="${PROBE_W}" height="${PROBE_H}"
        viewBox="0 0 ${SHEET_W} ${SHEET_H}">${group}</svg>`;
    let img;
    try {
        img = new Resvg(probe, { background: '#ffffff' }).render();
    } catch (err) {
        console.warn('  probe failed:', err.message.split('\n')[0].slice(0, 90));
        return null;
    }

    const { width, height } = img;
    const raw = img.pixels;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (raw[i] < 245 || raw[i + 1] < 245 || raw[i + 2] < 245) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return null;

    // A card is a group that FILLS a cell — its border reaches the
    // edges. Anything smaller is a stray ornament and must not be let
    // near a card's slot.
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (w < CELL_PX_W * 0.75 || w > CELL_PX_W * 1.3) return null;
    if (h < CELL_PX_H * 0.75 || h > CELL_PX_H * 1.3) return null;

    return {
        col: Math.floor(((minX + maxX) / 2) / CELL_PX_W),
        row: Math.floor(((minY + maxY) / 2) / CELL_PX_H),
    };
}

async function main() {
    let sheet;
    if (fs.existsSync(CACHE)) {
        sheet = fs.readFileSync(CACHE, 'utf8');
        console.log('using cached sheet');
    } else {
        console.log('downloading the deck…');
        const res = await fetch(SRC, { headers: { 'User-Agent': 'card-role-play/1.0' } });
        if (!res.ok) throw new Error(`download failed: ${res.status}`);
        sheet = await res.text();
        fs.writeFileSync(CACHE, sheet);
    }
    console.log(`sheet: ${(sheet.length / 1024 / 1024).toFixed(2)} MB`);

    const groups = topLevelGroups(sheet);
    console.log(`top-level groups: ${groups.length}`);

    fs.mkdirSync(OUT, { recursive: true });
    let written = 0, bytes = 0;
    const seen = new Set();

    for (const raw of groups) {
        const g = roundPaths(slim(raw));
        const cell = cellOf(g);
        if (!cell) continue;
        const { col, row } = cell;

        let name = null;
        if (row < 4 && col < 13) name = RANKS[col] + ROW_SUIT[row][0];
        else if (row === 4 && EXTRAS[col]) name = EXTRAS[col];
        if (!name || seen.has(name)) continue;
        seen.add(name);

        const x = col * CELL_W, y = row * CELL_H;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${CELL_W} ${CELL_H}">${g}</svg>`;
        const file = path.join(OUT, name + '.svg');
        fs.writeFileSync(file, svg);
        written++;
        bytes += svg.length;
    }

    // Provenance travels with the artwork.
    fs.writeFileSync(path.join(OUT, 'SOURCE.txt'),
        'Card artwork: English pattern playing cards, by Dmitry Fomin.\n'
        + 'Licence: CC0 1.0 Universal — public domain dedication, no rights reserved.\n'
        + 'Source: https://commons.wikimedia.org/wiki/File:English_pattern_playing_cards_deck_with_extra_cards.svg\n'
        + '\nSplit into individual cards by tools/fetch-cards.js. Geometry is unmodified;\n'
        + 'editor metadata was stripped and path coordinates rounded to 0.01 units.\n');

    console.log(`wrote ${written} cards, ${(bytes / 1024).toFixed(0)} KB total`);
    const missing = [];
    for (const s of ROW_SUIT) for (const r of RANKS) if (!seen.has(r + s[0])) missing.push(r + s[0]);
    for (const n of Object.values(EXTRAS)) if (!seen.has(n)) missing.push(n);
    if (missing.length) console.warn('MISSING:', missing.join(', '));
    else console.log('every card and both jokers accounted for');
}

main().catch(err => { console.error(err); process.exit(1); });
