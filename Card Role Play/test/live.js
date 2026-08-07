'use strict';

// ── Live check against Groq ────────────────────────────
//   node test/live.js
//
// Costs a handful of tokens. Everything else in test/ runs offline;
// this exists because streaming, JSON-mode triage and the state
// block can only really be trusted once they've met the real API.

require('dotenv').config();

if (!process.env.GROQ_API_KEY) {
    console.error('No GROQ_API_KEY in .env — nothing to check.');
    process.exit(1);
}

const ai = require('../lib/ai');
const R = require('../lib/resolve');

let checks = 0, failures = 0;
const ok = (cond, what) => {
    checks++;
    console.log(`  ${cond ? '✓' : '✗'} ${what}`);
    if (!cond) failures++;
};

const CAST = [
    { name: 'Kira', eliminated: false, sheet: { character: 'a sky-pirate with a rope-gun', wounds: ['gashed left arm'], boons: ['rope-gun'], status: [] } },
    { name: 'Bram', eliminated: false, sheet: { character: 'a stone golem, slow but immovable', wounds: [], boons: ['stone hide'], status: [] } },
];

async function main() {
    console.log('\n── Triage (small model, JSON mode)');

    const noise = await ai.triage({
        text: 'a;owkjb;lasdjfi ;wajfadkjdkck', actor: 'Kira',
        others: ['Bram'], previous: [], setup: false,
    });
    ok(noise.ok === false, 'keyboard mash is refused');

    const wild = await ai.triage({
        text: 'I want to be a purple dragon who can build a really cool wall and name it bob and make it come to life',
        actor: 'Kira', others: ['Bram'], previous: [], setup: true, existingCharacters: [],
    });
    ok(wild.ok === true, 'the purple dragon from Instructions.md is allowed');

    const aimed = await ai.triage({
        text: 'I swing the boom into Bram and knock him over the rail',
        actor: 'Kira', others: ['Bram'], previous: [], setup: false,
    });
    ok(aimed.ok === true, 'a real action passes');
    ok(aimed.targets.includes('Bram'), `Bram is identified as the target (got [${aimed.targets}])`);

    const idle = await ai.triage({
        text: 'I sit down and rub the salt out of my eyes',
        actor: 'Kira', others: ['Bram'], previous: [], setup: false,
    });
    ok(idle.targets.length === 0, `minding your own business targets nobody (got [${idle.targets}])`);

    console.log('\n── Narration (streamed, with a state block)');

    const res = R.resolveSolo({ rank: '3', suit: 'Clubs' }, CAST[0].sheet);
    ok(res.band === 'ruin', `a 3 with one wound lands in RUIN (eff ${res.eff})`);

    let streamed = '';
    let chunks = 0;
    const t0 = Date.now();
    let firstAt = 0;

    const out = await ai.narrate({
        players: CAST,
        history: [],
        directive: R.soloDirective('Kira', 'leaps the gap to the far mast', res),
        onChunk: (c) => { if (!firstAt) firstAt = Date.now() - t0; streamed += c; chunks++; },
    });

    ok(chunks > 3, `the answer arrives in pieces, not one lump (${chunks} chunks)`);
    ok(firstAt < 4000, `first words reach the table in ${firstAt}ms`);
    ok(!streamed.includes('<<<'), 'the state block never reached the stream');
    ok(!/STATE|hurt:|has:|now:/.test(streamed), 'no field markers leaked into the prose');
    ok(out.prose.length > 30, 'there is a story');
    ok(!/\b(card|value|roll|dice|verdict|RUIN)\b/i.test(out.prose), 'no game machinery is mentioned');
    ok(/Kira/.test(out.prose), 'Kira is named');
    ok(!/\byou\b|\byour\b/i.test(out.prose), 'the narrator stays in third person');
    ok(!/\b(he|she|his|her|hers|him|they|them|their)\b/i.test(out.prose),
        'no gender is invented for a character nobody described that way');
    ok(out.sheets !== null, 'a state block came back and parsed');
    if (out.sheets) {
        ok(!!out.sheets.Kira, 'Kira has a sheet');
        ok(Array.isArray(out.sheets.Kira?.wounds), 'wounds parsed as a list');
        console.log('\n    sheets:', JSON.stringify(out.sheets, null, 2).replace(/\n/g, '\n    '));
    }
    ok(streamed.trim() === out.prose.trim(),
        'what was streamed is exactly what was recorded');

    console.log(`\n    prose: "${out.prose}"`);

    console.log('\n── A counter, resolved by the cards');

    const counter = R.resolveCounter(
        { card: { rank: 'K', suit: 'Spades' }, sheet: CAST[0].sheet },
        [{ id: 'b', name: 'Bram', sheet: CAST[1].sheet, card: { rank: '4', suit: 'Hearts' },
           text: 'plants his feet and takes it' }],
    );
    ok(counter.defenders[0].beaten === false, 'the 4 fails against the king');

    let cText = '';
    const cOut = await ai.narrate({
        players: CAST,
        history: [],
        directive: R.counterDirective('Kira', 'swings the boom into Bram to put him over the rail', counter),
        onChunk: (c) => { cText += c; },
    });
    ok(/Bram/.test(cOut.prose) && /Kira/.test(cOut.prose), 'both names appear');
    ok(!cText.includes('<<<'), 'again, no block in the stream');
    console.log(`\n    prose: "${cOut.prose}"`);

    console.log(`\n${'─'.repeat(46)}`);
    console.log(failures ? `${checks - failures}/${checks} passed — ${failures} FAILED`
                         : `${checks} checks, all green.`);
    process.exit(failures ? 1 : 0);
}

main().catch(err => { console.error('\nlive check failed:', err); process.exit(1); });
