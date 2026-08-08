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
            ok(/viewBox="[-\d. ]+"/.test(svg), `${label}: carries a viewBox`);
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
