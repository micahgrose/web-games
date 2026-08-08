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

    console.log('\n── Who has to defend themselves');
    // Getting this wrong is the worst failure in the game: a missed
    // target means somebody is struck with no chance to answer.
    const CASES = [
        ['I shove Bram off the ledge', ['Bram'], 'a plain named attack'],
        ['I bring the whole ceiling down on top of everyone', ['Bram', 'Vex'], 'an area effect hits all'],
        ['I swing at whoever is standing closest', ['Bram', 'Vex'], 'an unnamed attack hits all'],
        ['I set fire to the deck under Bram and Vex', ['Bram', 'Vex'], 'two named at once'],
        ['I snatch the key out of Vex\'s hand', ['Vex'], 'theft counts'],
        ['I lash Bram to the mast with the rope', ['Bram'], 'restraint counts'],
        ['I lie to Vex about what is in the hold', ['Vex'], 'deception counts'],
        ['I climb the rigging to get a better view', [], 'minding your own business'],
        ['I ask Bram what he saw down there', [], 'a mention is not a target'],
        ['I bind my wound with a strip of sailcloth', [], 'tending to yourself'],
    ];
    for (const [line, want, label] of CASES) {
        const v = await ai.triage({
            text: line, actor: 'Kira', others: ['Bram', 'Vex'], previous: [], setup: false,
        });
        const got = [...v.targets].sort();
        const hit = JSON.stringify(got) === JSON.stringify([...want].sort());
        ok(hit, `${label}: "${line}" → [${got}]${hit ? '' : ` (wanted [${want}])`}`);
    }

    // Context: "I twist free" only has a target if someone has hold of you.
    const freed = await ai.triage({
        text: 'I twist free and drive my knee up',
        actor: 'Kira', others: ['Bram', 'Vex'], previous: [], setup: false,
        recent: 'Bram has Kira pinned against the rail with one stone hand.',
    });
    ok(freed.targets.includes('Bram'),
        `context resolves an unnamed target (got [${freed.targets}])`);

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

    console.log('\n── Pronouns come from the player, not from a guess');
    {
        const cast = [
            { name: 'Kira', eliminated: false, sheet: { character: 'a sky-pirate', wounds: ['gashed left arm'], boons: ['rope-gun'], status: [], calls: 'she/her' } },
            { name: 'Bram', eliminated: false, sheet: { character: 'a stone golem', wounds: [], boons: ['stone hide'], status: [], calls: 'he/him' } },
        ];
        const res = R.resolveCounter(
            { card: { rank: 'K', suit: 'Spades' }, sheet: cast[0].sheet },
            [{ id: 'b', name: 'Bram', sheet: cast[1].sheet, card: { rank: '4', suit: 'Hearts' }, text: 'plants both feet' }],
        );
        const o = await ai.narrate({
            players: cast, history: [],
            directive: R.counterDirective('Kira', 'swings the boom into Bram', res),
            onChunk: () => {},
        });
        ok(/\b(she|her)\b/i.test(o.prose), 'Kira, who chose she/her, gets she/her');
        ok(/\b(he|him|his)\b/i.test(o.prose), 'Bram, who chose he/him, gets he/him');
        console.log(`    prose: "${o.prose}"`);
    }

    console.log('\n── Arrival is dealt for too');

    const arrival = R.resolveSetup({ rank: 'K', suit: 'Spades' });
    ok(arrival.band === 'triumph', 'a king arrives at full height');
    const aOut = await ai.narrate({
        players: [{ name: 'Oro', eliminated: false, sheet: { character: '', wounds: [], boons: [], status: [] } }],
        history: [],
        directive: R.setupDirective('Oro', 'a purple dragon who builds walls and brings them to life', arrival),
        onChunk: () => {},
    });
    ok(/Oro/.test(aOut.prose), 'the new character is named');
    ok(aOut.sheets?.Oro, 'the arrival is written onto a sheet');
    const granted = (aOut.sheets?.Oro?.boons || []).length;
    ok(granted > 0, `a triumphant arrival grants something (${granted}: ${aOut.sheets?.Oro?.boons})`);
    console.log(`\n    prose: "${aOut.prose}"`);

    const poor = await ai.narrate({
        players: [{ name: 'Nix', eliminated: false, sheet: { character: '', wounds: [], boons: [], status: [] } }],
        history: [],
        directive: R.setupDirective('Nix', 'an unbeatable warrior of pure diamond', R.resolveSetup({ rank: '2', suit: 'Clubs' })),
        onChunk: () => {},
    });
    const flawed = (poor.sheets?.Nix?.wounds || []).length + (poor.sheets?.Nix?.status || []).length;
    ok(flawed > 0, `a ruinous arrival costs something (${JSON.stringify(poor.sheets?.Nix)})`);
    console.log(`    prose: "${poor.prose}"`);

    console.log('\n── Tags have to bite');

    // A heavily wounded character on a good card: the failure must
    // read as caused by the injuries, and they must be named.
    const wrecked = {
        name: 'Kira', eliminated: false,
        sheet: {
            character: 'a sky-pirate', wounds: ['shattered right knee', 'deep gash across the ribs'],
            boons: [], status: ['bleeding'],
        },
    };
    const hurtRes = R.resolveSolo({ rank: 'Q', suit: 'Hearts' }, wrecked.sheet);
    ok(hurtRes.eff === 8, `a queen on two wounds resolves at 8, not 12 (got ${hurtRes.eff})`);
    const hurtOut = await ai.narrate({
        players: [wrecked, CAST[1]],
        history: [],
        directive: R.soloDirective('Kira', 'sprints the length of the deck and vaults the rail', hurtRes),
        onChunk: () => {},
    });
    const named = /knee|gash|rib|bleed/i.test(hurtOut.prose);
    ok(named, 'the injuries are named in the prose, not just implied');
    console.log(`    prose: "${hurtOut.prose}"`);

    // An equipped character: the gear should be how the thing is done.
    const geared = {
        name: 'Bram', eliminated: false,
        sheet: { character: 'a tinker', wounds: [], boons: ['grappling line', 'clockwork arm'], status: [] },
    };
    const gearRes = R.resolveSolo({ rank: '9', suit: 'Clubs' }, geared.sheet);
    ok(gearRes.eff === 13, `a nine with two advantages reaches 13 (got ${gearRes.eff})`);
    ok(gearRes.band === 'triumph', 'which carries it two bands, from mixed to triumph');
    const gearOut = await ai.narrate({
        players: [geared, CAST[0]],
        history: [],
        directive: R.soloDirective('Bram', 'crosses the gap to the far tower', gearRes),
        onChunk: () => {},
    });
    ok(/grappl|line|clockwork|arm/i.test(gearOut.prose), 'the gear is what does the work');
    console.log(`    prose: "${gearOut.prose}"`);

    console.log('\n── Every turn leaves a mark');

    let marked = 0;
    const trials = 3;
    for (let i = 0; i < trials; i++) {
        const sheet = { character: 'a sky-pirate', wounds: [], boons: ['rope-gun'], status: [] };
        const r = R.resolveSolo({ rank: ['5', '10', 'J'][i], suit: 'Spades' }, sheet);
        const o = await ai.narrate({
            players: [{ name: 'Kira', eliminated: false, sheet }, CAST[1]],
            history: [],
            directive: R.soloDirective('Kira', `forces the hatch on the ${i + 2}th deck`, r),
            onChunk: () => {},
        });
        const s = o.sheets?.Kira;
        const changed = !!s && (
            (s.wounds || []).length > 0 ||
            (s.status || []).length > 0 ||
            JSON.stringify(s.boons || []) !== JSON.stringify(['rope-gun'])
        );
        if (changed) marked++;
        console.log(`    ${r.label.padEnd(8)} → ${changed ? 'left a mark' : 'NOTHING CHANGED'} ${JSON.stringify(s)}`);
    }
    ok(marked >= trials - 1, `at least ${trials - 1} of ${trials} turns changed something (${marked})`);

    console.log(`\n${'─'.repeat(46)}`);
    console.log(failures ? `${checks - failures}/${checks} passed — ${failures} FAILED`
                         : `${checks} checks, all green.`);
    process.exit(failures ? 1 : 0);
}

main().catch(err => { console.error('\nlive check failed:', err); process.exit(1); });
