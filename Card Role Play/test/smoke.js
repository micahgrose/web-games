'use strict';

// ── Serving & drawing smoke test ───────────────────────
//   node test/smoke.js
//
// Two things I cannot see for myself and so must check by machine:
//   1. every file the page asks for is actually served
//   2. every card's SVG is well-formed and free of undefined/NaN

process.env.GROQ_API_KEY = '';

const path = require('path');
const { server } = require('../server');

let checks = 0, failures = 0;
const ok = (cond, what) => {
    checks++;
    if (!cond) { failures++; console.error(`  ✗ ${what}`); }
};
const head = (s) => console.log(`\n── ${s}`);

// A small well-formedness pass: balanced tags, matched quotes, no
// stray placeholder values baked into the markup.
function checkSVG(svg, label) {
    ok(svg.startsWith('<svg') && svg.trimEnd().endsWith('</svg>'), `${label}: is an svg element`);
    ok(!/undefined|NaN|\[object/.test(svg), `${label}: no undefined/NaN leaked into the markup`);

    const quotes = (svg.match(/"/g) || []).length;
    ok(quotes % 2 === 0, `${label}: attribute quotes are balanced`);

    // Colours must be real: catch a mistyped hex like "#5d7near".
    for (const m of svg.matchAll(/(?:fill|stroke|stop-color)="(#[^"]*)"/g)) {
        ok(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(m[1]), `${label}: "${m[1]}" is a valid colour`);
    }

    const stack = [];
    const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    let m;
    while ((m = tagRe.exec(svg))) {
        const [, closing, name, , selfClose] = m;
        if (closing) {
            if (stack.pop() !== name) {
                ok(false, `${label}: </${name}> does not close the open element`);
                return;
            }
        } else if (!selfClose) {
            stack.push(name);
        }
    }
    ok(stack.length === 0, `${label}: every element is closed (${stack.join(',') || 'ok'})`);
}

async function main() {
    head('Card artwork');
    const cards = await import(
        'file:///' + path.join(__dirname, '..', 'public', 'js', 'cards.js').replace(/\\/g, '/')
    );

    for (const suit of cards.SUITS) {
        for (const rank of cards.RANKS) {
            checkSVG(cards.cardFaceSVG({ rank, suit }), `${rank} of ${suit}`);
        }
    }
    checkSVG(cards.cardFaceSVG({ joker: true, rank: 'JOKER', suit: 'Fate' }), 'joker');
    checkSVG(cards.cardBackSVG(), 'reverse');
    checkSVG(cards.cardFaceSVG(null), 'empty slot');

    head('Pip layouts follow a real deck');
    for (const rank of ['2', '3', '4', '5', '6', '7', '8', '9', '10']) {
        const svg = cards.cardFaceSVG({ rank, suit: 'Spades' });
        // corner marks are two of the pips; the rest are the field
        const pips = (svg.match(/<path d="M50 4 C50 4/g) || []).length;
        ok(pips === Number(rank) + 2, `${rank} draws ${rank} pips plus two corner marks (got ${pips - 2})`);
        const inverted = (svg.match(/rotate\(180 /g) || []).length;
        ok(inverted > 0, `${rank}: the lower half is inverted, as on a printed card`);
    }

    head('Outcome bands cover every value');
    for (let v = 2; v <= 15; v++) {
        const b = cards.bandFor(v);
        ok(!!b && !!b.label && !!b.glow, `value ${v} lands in a band (${b?.label})`);
    }
    ok(cards.cardValue({ joker: true }) === 15, 'the joker is the top of the ladder');

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
        ['/fonts/cinzel.woff2', 'font'],
        ['/fonts/garamond.woff2', 'font'],
        ['/fonts/garamond-italic.woff2', 'font'],
        ['/socket.io/socket.io.js', 'javascript'],
    ];

    let indexHtml = '';
    for (const [url, kind] of wanted) {
        try {
            const res = await fetch(base + url);
            ok(res.ok, `${url} → ${res.status}`);
            const type = res.headers.get('content-type') || '';
            ok(type.includes(kind), `${url} is served as ${kind} (got ${type.split(';')[0]})`);
            const body = await res.text();
            ok(body.length > 0, `${url} is not empty`);
            if (url === '/') indexHtml = body;
        } catch (err) {
            ok(false, `${url} → ${err.message}`);
        }
    }

    head('The card flip keeps its 3D context');
    {
        const fs2 = require('fs');
        const css = fs2.readFileSync(path.join(__dirname, '..', 'public', 'css', 'theme.css'), 'utf8');
        const animSrc = fs2.readFileSync(path.join(__dirname, '..', 'public', 'js', 'anim.js'), 'utf8');

        // A filter on the element carrying transform-style:preserve-3d
        // flattens the 3D context, and the card turns over without ever
        // showing its face. This cost me a bug once; never again.
        const innerRules = [...css.matchAll(/\.fly[^{]*\.inner[^{]*\{([^}]*)\}/g)].map(m => m[1]);
        ok(innerRules.length > 0, 'the .fly .inner rule exists');
        for (const body of innerRules) {
            ok(!/[^-]filter\s*:/.test(body),
                'no filter is declared on the element holding preserve-3d');
        }
        ok(innerRules.some(b => /preserve-3d/.test(b)), 'preserve-3d is still set');
        ok(/\.fly\s+\.face[^{]*\{[^}]*backface-visibility/.test(css),
            'the faces still hide their backs');
        ok(!/\.inner['"]\)?\s*\)?\.style\.filter/.test(animSrc),
            'the animation code never sets a filter on .inner');
    }

    head('The page and its script agree on element ids');
    const ids = [...indexHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    const fs = require('fs');
    const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui.js'), 'utf8');
    const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'main.js'), 'utf8');

    const asked = new Set();
    for (const src of [uiSrc, mainSrc]) {
        for (const m of src.matchAll(/\$\('([^']+)'\)/g)) asked.add(m[1]);
        for (const m of src.matchAll(/getElementById\('([^']+)'\)/g)) asked.add(m[1]);
    }
    for (const id of asked) {
        ok(ids.includes(id), `#${id} exists in the page`);
    }
    ok(asked.size > 20, `the script reaches for ${asked.size} elements and finds them all`);

    // Drop keep-alive sockets before closing, or the process exits
    // while libuv still holds handles and Windows complains.
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));

    console.log(`\n${'─'.repeat(46)}`);
    console.log(failures ? `${checks - failures}/${checks} passed — ${failures} FAILED`
                         : `${checks} checks, all green.`);
    process.exitCode = failures ? 1 : 0;
}

main().catch(err => { console.error(err); process.exit(1); });
