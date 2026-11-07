'use strict';

// ── Serving & artwork smoke test ───────────────────────
//   node test/smoke.js
//
// Three things I cannot see for myself and so must check by machine:
//   1. every card's artwork file exists and is well-formed
//   2. every file the page asks for is actually served
//   3. the card flip still has a 3D context to flip in

process.env.GROQ_API_KEY = '';

const path = require('path');
const fs = require('fs');
const { server } = require('../server');

let checks = 0, failures = 0;
const ok = (cond, what) => {
    checks++;
    if (!cond) { failures++; console.error(`  ✗ ${what}`); }
};
const head = (s) => console.log(`\n── ${s}`);

const CARDS_DIR = path.join(__dirname, '..', 'public', 'cards');

/** The width : height of an SVG's viewBox, or null. */
function ratioOf(svg) {
    const m = /viewBox="\s*([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)\s*"/.exec(svg);
    if (!m) return null;
    const w = Number(m[3]), h = Number(m[4]);
    return h ? w / h : null;
}

/**
 * Every box-shadow layer, with its length values separated from its
 * colour — colours contain commas, so they have to be masked before
 * the layers can be split apart.
 */
function shadowLayers(value) {
    const masked = value.replace(/(rgba?|hsla?|var)\([^()]*\)/g, 'COLOUR');
    return masked.split(',').map(layer => ({
        text: layer.trim(),
        lengths: (layer.match(/-?\d*\.?\d+px|(?<![\w.])0(?![\w.%])/g) || []).length,
    }));
}

/** Balanced tags, matched quotes, no placeholder values baked in. */
function checkSVG(svg, label) {
    ok(svg.trimStart().startsWith('<svg'), `${label}: is an svg element`);
    ok(svg.trimEnd().endsWith('</svg>'), `${label}: is closed`);
    ok(!/undefined|NaN|\[object/.test(svg), `${label}: nothing undefined leaked in`);
    ok((svg.match(/"/g) || []).length % 2 === 0, `${label}: attribute quotes balanced`);

    const stack = [];
    const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    let m;
    while ((m = tagRe.exec(svg))) {
        const [, closing, name, , selfClose] = m;
        if (closing) {
            if (stack.pop() !== name) { ok(false, `${label}: </${name}> mismatched`); return; }
        } else if (!selfClose) stack.push(name);
    }
    ok(stack.length === 0, `${label}: every element closed`);
}

async function main() {
    const cards = await import(
        'file:///' + path.join(__dirname, '..', 'public', 'js', 'cards.js').replace(/\\/g, '/')
    );

    head('Card artwork is present and sound');
    ok(fs.existsSync(CARDS_DIR), 'the artwork directory exists');
    ok(fs.existsSync(path.join(CARDS_DIR, 'SOURCE.txt')),
        'provenance travels with the artwork');

    const src = fs.readFileSync(path.join(CARDS_DIR, 'SOURCE.txt'), 'utf8');
    ok(/CC0/.test(src) && /Fomin/i.test(src), 'the licence and author are recorded');

    const SHAPE = cards.CARD_W / cards.CARD_H;

    let total = 0;
    for (const suit of cards.SUITS) {
        for (const rank of cards.RANKS) {
            const rel = cards.cardArt({ rank, suit });
            const file = path.join(__dirname, '..', 'public', rel);
            const label = `${rank} of ${suit}`;
            if (!fs.existsSync(file)) { ok(false, `${label}: ${rel} is missing`); continue; }
            const svg = fs.readFileSync(file, 'utf8');
            total += svg.length;
            checkSVG(svg, label);
            const r = ratioOf(svg);
            ok(r !== null, `${label}: carries a viewBox`);
            ok(r !== null && Math.abs(r - SHAPE) < 0.001,
                `${label}: is the deck's shape (${r?.toFixed(4)} vs ${SHAPE.toFixed(4)})`);
            ok(svg.length > 600, `${label}: has real artwork in it`);
        }
    }
    ok(total > 500 * 1024, `the deck carries real detail (${Math.round(total / 1024)} KB)`);

    for (const id of ['j1', 'j2']) {
        const rel = cards.cardArt({ joker: true, id });
        const file = path.join(__dirname, '..', 'public', rel);
        ok(fs.existsSync(file), `joker ${id} → ${rel} exists`);
        if (fs.existsSync(file)) checkSVG(fs.readFileSync(file, 'utf8'), `joker ${id}`);
    }
    ok(cards.cardArt({ joker: true, id: 'j1' }) !== cards.cardArt({ joker: true, id: 'j2' }),
        'the two jokers are different cards');

    head('The pieces still drawn in code');
    checkSVG(cards.cardBackSVG(), 'the reverse');
    checkSVG(cards.cardFaceHTML(null), 'empty slot');
    ok(/<img /.test(cards.cardFaceHTML({ rank: 'K', suit: 'Spades' })),
        'a face is an img onto its artwork');
    ok(/class="card-art"/.test(cards.cardFaceHTML({ rank: 'K', suit: 'Spades' })),
        'and is tagged so the CSS can size it');

    head('Every card box is the shape of the picture inside it');
    {
        // An <img> keeps its source's aspect ratio whatever box you give
        // it. A box of any other ratio letterboxes the picture — and then
        // the glow, drawn on the box, floats off the edge of the card.
        const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'theme.css'), 'utf8');

        ok(Math.abs(ratioOf(cards.cardBackSVG()) - SHAPE) < 0.001,
            'the reverse is the deck\'s shape');
        ok(Math.abs(ratioOf(cards.cardFaceHTML(null)) - SHAPE) < 0.001,
            'the empty slot is the deck\'s shape');

        const declared = /--card-ratio:\s*([\d.]+)\s*\/\s*([\d.]+)/.exec(css);
        ok(!!declared, '--card-ratio is declared');
        if (declared) {
            const r = Number(declared[1]) / Number(declared[2]);
            ok(Math.abs(r - SHAPE) < 0.001,
                `the CSS box matches the artwork (${r.toFixed(4)} vs ${SHAPE.toFixed(4)})`);
        }
        ok(/\.card-holder\s*\{[^}]*aspect-ratio:\s*var\(--card-ratio\)/.test(css),
            'the holder takes its shape from that one value');

        // Corner radius: --card-r is horizontal% / vertical%, and the two
        // must describe the same absolute radius or the corners go oval.
        const rad = /--card-r:\s*([\d.]+)%\s*\/\s*([\d.]+)%/.exec(css);
        ok(!!rad, '--card-r is declared as a percentage pair');
        if (rad) {
            const horiz = Number(rad[1]) / 100;                  // of the width
            const vert = (Number(rad[2]) / 100) / SHAPE;         // of the width too
            ok(Math.abs(horiz - vert) < 0.002, 'the corners are round, not oval');
            ok(Math.abs(horiz - 29.944 / 360) < 0.002,
                'and they sit on the artwork\'s own corner');
        }
    }

    head('Glows sit on the card edge, not outside it');
    {
        // Spread grows the lit shape before it is blurred, so a glow with
        // spread reads as a second, larger card behind the real one.
        const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'theme.css'), 'utf8');
        const animSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'anim.js'), 'utf8');

        const glowRules = [...css.matchAll(/(\.aura-[\w-]+|\.fly\.winner\s+\.face)[^{]*\{([^}]*)\}/g)];
        ok(glowRules.length >= 7, `every glow tier is checked (${glowRules.length})`);
        for (const [, sel, body] of glowRules) {
            for (const m of body.matchAll(/box-shadow:\s*([^;]+);/g)) {
                for (const layer of shadowLayers(m[1])) {
                    ok(layer.lengths <= 3, `${sel}: no spread on "${layer.text}"`);
                }
            }
        }
        for (const [, body] of [...css.matchAll(/@keyframes fatepulse\s*\{([\s\S]*?)\n\}/g)]) {
            for (const m of body.matchAll(/box-shadow:\s*([^;]+);/g)) {
                for (const layer of shadowLayers(m[1])) {
                    ok(layer.lengths <= 3, `fatepulse: no spread on "${layer.text}"`);
                }
            }
        }
        // The animation writes its glows inline; same rule applies.
        for (const m of animSrc.matchAll(/boxShadow\s*=\s*[`'"]([^`'"]+)/g)) {
            const value = m[1].replace(/\$\{[^}]*\}/g, 'COLOUR');
            for (const layer of shadowLayers(value)) {
                ok(layer.lengths <= 3, `anim.js: no spread on "${layer.text}"`);
            }
        }

        // The losing card in a clash greys out. Faces are <img> now, so a
        // selector matching on the svg tag would quietly stop working.
        ok(/\.fly\.loser\s+\.face\s+\.card-art\s*\{[^}]*grayscale/.test(css),
            'a beaten card still greys out');
    }

    head('Outcome bands cover every value');
    for (let v = 2; v <= 15; v++) {
        const b = cards.bandFor(v);
        ok(!!b && !!b.label && !!b.glow, `value ${v} lands in a band (${b?.label})`);
    }
    ok(cards.cardValue({ joker: true }) === 15, 'the joker is the top of the ladder');

    head('The card flip keeps its 3D context');
    {
        const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'theme.css'), 'utf8');
        const animSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'anim.js'), 'utf8');
        // A filter on the element carrying transform-style:preserve-3d
        // flattens the 3D context, and the card turns over without ever
        // showing its face. This cost me a bug once; never again.
        const innerRules = [...css.matchAll(/\.fly[^{]*\.inner[^{]*\{([^}]*)\}/g)].map(m => m[1]);
        ok(innerRules.length > 0, 'the .fly .inner rule exists');
        for (const body of innerRules) {
            ok(!/[^-]filter\s*:/.test(body), 'no filter on the element holding preserve-3d');
        }
        ok(innerRules.some(b => /preserve-3d/.test(b)), 'preserve-3d is still set');
        ok(/\.fly\s+\.face[^{]*\{[^}]*backface-visibility/.test(css), 'the faces hide their backs');
        ok(!/\.inner['"]\)?\s*\)?\.style\.filter/.test(animSrc),
            'the animation never sets a filter on .inner');
    }

    head('Everything the page asks for is served');
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    const base = `http://localhost:${port}`;

    const wanted = [
        ['/', 'text/html'],
        ['/gallery.html', 'text/html'],
        ['/css/theme.css', 'text/css'],
        ['/js/main.js', 'javascript'],
        ['/js/ui.js', 'javascript'],
        ['/js/cards.js', 'javascript'],
        ['/js/anim.js', 'javascript'],
        ['/js/audio.js', 'javascript'],
        ['/cards/KS.svg', 'image/svg'],
        ['/cards/2H.svg', 'image/svg'],
        ['/cards/JokerRed.svg', 'image/svg'],
        ['/fonts/cinzel.woff2', 'font'],
        ['/fonts/garamond.woff2', 'font'],
        ['/socket.io/socket.io.js', 'javascript'],
    ];

    let indexHtml = '';
    for (const [url, kind] of wanted) {
        try {
            const res = await fetch(base + url);
            ok(res.ok, `${url} → ${res.status}`);
            const type = res.headers.get('content-type') || '';
            ok(type.includes(kind), `${url} served as ${kind} (got ${type.split(';')[0]})`);
            const body = await res.text();
            ok(body.length > 0, `${url} is not empty`);
            if (url === '/') indexHtml = body;
        } catch (err) {
            ok(false, `${url} → ${err.message}`);
        }
    }

    head('Big artwork is compressed on the wire');
    {
        const res = await fetch(base + '/cards/KS.svg', { headers: { 'Accept-Encoding': 'gzip' } });
        const enc = res.headers.get('content-encoding') || 'none';
        ok(enc === 'gzip', `a 130 KB court card is gzipped in transit (got ${enc})`);
    }

    head('The page and its script agree on element ids');
    const ids = [...indexHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui.js'), 'utf8');
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'main.js'), 'utf8');
    const asked = new Set();
    for (const s of [uiSrc, mainSrc]) {
        for (const m of s.matchAll(/\$\('([^']+)'\)/g)) asked.add(m[1]);
        for (const m of s.matchAll(/getElementById\('([^']+)'\)/g)) asked.add(m[1]);
    }
    for (const id of asked) ok(ids.includes(id), `#${id} exists in the page`);
    ok(asked.size > 20, `the script reaches for ${asked.size} elements and finds them all`);

    server.closeAllConnections?.();
    await new Promise(r => server.close(r));

    console.log(`\n${'─'.repeat(46)}`);
    console.log(failures ? `${checks - failures}/${checks} passed — ${failures} FAILED`
                         : `${checks} checks, all green.`);
    process.exitCode = failures ? 1 : 0;
}

main().catch(err => { console.error(err); process.exit(1); });
