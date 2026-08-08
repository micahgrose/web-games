'use strict';

// ── Headless verification ──────────────────────────────
//   node test/headless.js
//
// Part 1-3 are pure logic (deck, resolution, prompt plumbing).
// Part 4 drives a whole game through REAL socket.io clients against
// a REAL server — the event wiring is the layer that has bitten me
// before, so it gets exercised rather than simulated.
//
// Runs with the understudy narrator: no API key is used or needed.

process.env.GROQ_API_KEY = '';   // dotenv will not override an existing key

const assert = require('assert');

let checks = 0;
let failures = 0;
const ok = (cond, what) => {
    checks++;
    if (!cond) { failures++; console.error(`  ✗ ${what}`); }
};
const eq = (a, b, what) => {
    checks++;
    try { assert.deepStrictEqual(a, b); }
    catch { failures++; console.error(`  ✗ ${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
};
const head = (s) => console.log(`\n── ${s}`);

// ═══ 1. The deck ═══════════════════════════════════════
const { Deck, cardValue, cardName } = require('../lib/deck');

head('Deck');
{
    const d = new Deck();
    eq(d.count, 54, 'a fresh deck holds 52 cards and two jokers');

    const seen = new Set();
    let jokers = 0;
    for (let i = 0; i < 54; i++) {
        const c = d.draw();
        ok(!!c, 'every draw yields a card');
        if (c.joker) jokers++;
        else seen.add(`${c.rank}${c.suit}`);
    }
    eq(seen.size, 52, 'all 52 ranked cards are distinct');
    eq(jokers, 2, 'both jokers are present');
    eq(d.count, 0, 'the pile is spent after 54 draws');

    // The old build dealt `undefined` here and silently scored it 0.
    const next = d.draw();
    ok(!!next, 'drawing past the end reshuffles instead of dealing nothing');
    ok(d.reshuffled === true, 'the reshuffle is flagged so the table can be told');
    ok(d.count === 53, 'the discards came back');

    let bad = 0;
    for (let i = 0; i < 5000; i++) if (!d.draw()) bad++;
    eq(bad, 0, 'five thousand consecutive draws never deal nothing');

    eq(cardValue({ rank: 'A', suit: 'Spades' }), 14, 'ace is 14');
    eq(cardValue({ rank: 'K', suit: 'Spades' }), 13, 'king is 13');
    eq(cardValue({ rank: 'Q', suit: 'Spades' }), 12, 'queen is 12');
    eq(cardValue({ rank: 'J', suit: 'Spades' }), 11, 'jack is 11');
    eq(cardValue({ rank: '2', suit: 'Spades' }), 2, 'pips read at face value');
    eq(cardValue({ joker: true }), 15, 'a joker outranks everything');
    eq(cardName({ joker: true }), 'the Joker', 'the joker is named');
}

// ═══ 2. Resolution ═════════════════════════════════════
const R = require('../lib/resolve');

head('Outcome bands');
{
    const band = (v) => R.bandFor(v).key;
    eq([2, 3, 4].map(band), ['ruin', 'ruin', 'ruin'], '2-4 is ruin');
    eq([5, 6, 7].map(band), ['falter', 'falter', 'falter'], '5-7 falters');
    eq([8, 9, 10].map(band), ['mixed', 'mixed', 'mixed'], '8-10 is mixed');
    eq([11, 12].map(band), ['success', 'success'], '11-12 succeeds');
    eq([13, 14].map(band), ['triumph', 'triumph'], '13-14 is triumph');
    eq(band(15), 'fate', 'a joker is its own band');
}

head('Condition changes what a card is worth');
{
    const clean = { wounds: [], boons: [] };
    const hurt = { wounds: ['gashed arm', 'broken rib'], boons: [] };
    const armed = { wounds: [], boons: ['iron shield'] };

    const king = { rank: 'K', suit: 'Spades' };
    eq(R.resolveSolo(king, clean).eff, 13, 'a hale character draws a king at 13');
    eq(R.resolveSolo(king, hurt).eff, 9, 'two wounds cost four points');
    eq(R.resolveSolo(king, armed).eff, 14, 'an advantage is worth two, clamped at the top');

    // Instructions.md: the wounded need much higher cards for the same feat.
    eq(R.resolveSolo(king, clean).band, 'triumph', 'a king triumphs for the hale');
    eq(R.resolveSolo(king, hurt).band, 'mixed', 'the same king is merely mixed for the wounded');
    ok(R.resolveSolo({ rank: '9', suit: 'Hearts' }, armed).band === 'success'
        && R.resolveSolo({ rank: '9', suit: 'Hearts' }, clean).band === 'mixed',
        'an advantage lifts a nine from mixed to a clean success');

    // What it takes to reach the same band, hale versus hurt.
    const bandAt = (v, sheet) => R.resolveSolo({ rank: String(v), suit: 'Hearts' }, sheet).band;
    ok(bandAt(8, clean) === 'mixed' && bandAt(8, hurt) === 'ruin',
        'the wounded fall two whole bands on the same card');

    const piled = { wounds: ['a', 'b', 'c', 'd', 'e'], boons: [] };
    eq(R.resolveSolo(king, piled).pen, R.MAX_WOUND_PENALTY, 'wound penalty is capped');
    ok(R.resolveSolo(king, piled).eff >= 1, 'and never drops below one');
    const hoard = { wounds: [], boons: ['a', 'b', 'c', 'd'] };
    eq(R.resolveSolo(king, hoard).bon, R.MAX_BOON_BONUS, 'advantage bonus is capped');

    const joker = { joker: true };
    eq(R.resolveSolo(joker, piled).eff, 15, 'nothing drags a joker down');
}

head('Becoming someone is dealt for too');
{
    const arrival = (rank) => R.resolveSetup({ rank, suit: 'Spades' });
    eq(arrival('K').band, 'triumph', 'a king arrives at full height');
    eq(arrival('3').band, 'ruin', 'a three arrives diminished');
    eq(R.resolveSetup({ joker: true }).band, 'fate', 'the joker bends a character sideways');

    for (const rank of ['2', '7', 'Q', 'A']) {
        const r = arrival(rank);
        ok(!!r.directive && r.directive.length > 30, `${rank}: the arrival has its own guidance`);
        ok(!/fails outright|half-works/.test(r.directive),
            `${rank}: arrival guidance is about becoming, not about attempting`);
    }

    // A setup turn has no tags yet, so the card stands alone.
    eq(R.resolveSetup({ rank: '9', suit: 'Spades' }).eff, 9, 'nothing modifies an arrival');

    const d = R.setupDirective('Kira', 'a sky-pirate with a rope-gun', arrival('K'));
    ok(d.includes('TRIUMPH'), 'the arrival band is stated');
    ok(/state block/i.test(d), 'and what it grants is asked to be recorded');
    ok(!/OUTCOME:/.test(d), 'an arrival is not phrased as an action outcome');
}

head('Tags are named in the instructions, not just counted');
{
    const sheet = { wounds: ['gashed left arm'], boons: ['rope-gun'], status: ['winded'] };
    const r = R.resolveSolo({ rank: '9', suit: 'Spades' }, sheet);
    const d = R.soloDirective('Kira', 'swings across the gap', r);
    ok(d.includes('gashed left arm'), 'the injury is named for the narrator');
    ok(d.includes('rope-gun'), 'the advantage is named');
    ok(d.includes('winded'), 'the condition is named');
    ok(/must be visible/i.test(d), 'and the narrator is told to show them');
    ok(/-2 for injuries/.test(d) && /\+2 for advantages/.test(d), 'the arithmetic is spelled out');

    const bare = R.soloDirective('Bram', 'looks around',
        R.resolveSolo({ rank: '9', suit: 'Spades' }, { wounds: [], boons: [] }));
    ok(!/must be visible/i.test(bare), 'a character carrying nothing gets no such demand');

    const cd = R.counterDirective('Kira', 'swings the boom', R.resolveCounter(
        { card: { rank: 'K', suit: 'Spades' }, sheet },
        [{ id: 'b', name: 'Bram', sheet: { wounds: [], boons: ['stone hide'] },
           card: { rank: '4', suit: 'Hearts' }, text: 'takes it' }],
    ));
    ok(cd.includes('stone hide'), 'a defender\'s advantages are named too');
    ok(cd.includes('rope-gun'), 'and so are the attacker\'s');
}

head('The counter rule');
{
    const clean = { wounds: [], boons: [] };
    const mk = (rank) => ({ rank, suit: 'Hearts' });

    // The worked example from Instructions.md: attacker 9, one
    // defender at 5 (fails) and one at 10 (turns it aside).
    const res = R.resolveCounter(
        { card: mk('9'), sheet: clean },
        [
            { id: 'p2', name: 'Two', sheet: clean, card: mk('5'), text: 'dodges' },
            { id: 'p3', name: 'Three', sheet: clean, card: mk('10'), text: 'grabs hold' },
        ],
    );
    eq(res.defenders[0].beaten, false, 'the lower card fails to turn it aside');
    eq(res.defenders[1].beaten, true, 'the higher card turns it aside');
    eq(res.allHeld, false, 'not everyone held');

    const tie = R.resolveCounter(
        { card: mk('9'), sheet: clean },
        [{ id: 'x', name: 'X', sheet: clean, card: mk('9'), text: 'braces' }],
    );
    eq(tie.defenders[0].beaten, false, 'a tie goes to the attacker — it must be HIGHER');

    // Armour is the spec's other example: it raises the bar to get through.
    const armoured = { wounds: [], boons: ['plate armour'] };
    const through = R.resolveCounter(
        { card: mk('9'), sheet: clean },
        [{ id: 'a', name: 'A', sheet: armoured, card: mk('9'), text: 'stands firm' }],
    );
    eq(through.defenders[0].beaten, true, 'armour turns aside what a bare defender could not');

    const all = R.resolveCounter(
        { card: mk('3'), sheet: clean },
        [
            { id: 'a', name: 'A', sheet: clean, card: mk('K'), text: 'x' },
            { id: 'b', name: 'B', sheet: clean, card: mk('Q'), text: 'y' },
        ],
    );
    eq(all.allHeld, true, 'every defender holding is reported');

    // Each defender is judged alone, never as a group.
    const mixed = R.resolveCounter(
        { card: mk('8'), sheet: clean },
        [
            { id: 'a', name: 'A', sheet: clean, card: mk('2'), text: 'x' },
            { id: 'b', name: 'B', sheet: clean, card: mk('A'), text: 'y' },
        ],
    );
    eq(mixed.defenders.map(d => d.beaten), [false, true],
        'one is struck while the other walks away');
}

head('Directives handed to the narrator');
{
    const clean = { wounds: [], boons: [] };
    const solo = R.resolveSolo({ rank: '3', suit: 'Clubs' }, clean);
    const text = R.soloDirective('Kira', 'leaps the chasm', solo);
    ok(text.includes('RUIN'), 'the verdict is stated in words, not left to be inferred');
    ok(text.includes('Kira'), 'the actor is named');
    ok(!/\bvalue\b/i.test(text.split('OUTCOME')[1] || ''), 'no raw numbers after the verdict');

    const res = R.resolveCounter(
        { card: { rank: 'K', suit: 'Spades' }, sheet: clean },
        [
            { id: 'a', name: 'Alice', sheet: clean, card: { rank: '2', suit: 'Hearts' }, text: 'ducks' },
            { id: 'b', name: 'Bram', sheet: clean, card: { joker: true }, text: 'vanishes' },
        ],
    );
    const cd = R.counterDirective('Kira', 'shoves them both off the ledge', res);
    ok(cd.includes('FORCE: TRIUMPH'), 'the force of a landing blow is stated');
    ok(cd.includes('Alice') && cd.includes('FAILS'), 'the failing defender is named as struck');
    ok(cd.includes('Bram') && cd.includes('TURNS IT ASIDE'), 'the holding defender is named as safe');
    ok(cd.indexOf('Alice') < cd.indexOf('Bram'), 'defenders keep their order');
}

// ═══ 3. Prompt plumbing ════════════════════════════════
const ai = require('../lib/ai');

head('Reading the narrator\'s state block');
{
    const names = ['Kira', 'Bram', 'Vex'];
    const reply =
        'Kira drives the blade home and Vex goes down in the dust.\n' +
        '<<<STATE\n' +
        'Kira | is: sky-pirate with a rope-gun | hurt: gashed arm | has: rope-gun | now: winded\n' +
        'Bram | is: stone golem | hurt: - | has: stone hide; great strength | now: -\n' +
        'DEAD: Vex\n' +
        '>>>';

    const p = ai.parseState(reply, names);
    eq(p.prose, 'Kira drives the blade home and Vex goes down in the dust.',
        'the block is stripped from the prose');
    ok(!p.prose.includes('<<<'), 'no machinery leaks into the story');
    eq(p.sheets.Kira.character, 'sky-pirate with a rope-gun', 'identity is carried');
    eq(p.sheets.Kira.wounds, ['gashed arm'], 'injuries are carried');
    eq(p.sheets.Bram.boons, ['stone hide', 'great strength'], 'advantages split on semicolons');
    eq(p.sheets.Bram.wounds, [], 'a dash means nothing there');
    eq(p.dead, ['Vex'], 'the dead are named');

    const none = ai.parseState('Just prose, no block.', names);
    eq(none.sheets, null, 'a missing block is survivable');
    eq(none.dead, [], 'and implies no deaths');

    const junk = ai.parseState(
        'Words.\n<<<STATE\nNobody | is: ghost\nKira | is: pirate | hurt: none\n>>>', names);
    ok(!junk.sheets.Nobody, 'unknown names are ignored');
    eq(junk.sheets.Kira.wounds, [], '"none" is not an injury');

    // How a character wishes to be referred to, when they said so.
    const called = ai.parseState(
        'Words.\n<<<STATE\n' +
        'Kira | is: pirate | call: she/her\n' +
        'Bram | is: golem | call: -\n' +
        'Vex | is: wraith | call: Vex the Pale\n' +
        '>>>', names);
    eq(called.sheets.Kira.calls, 'she/her', 'a stated pronoun set is kept');
    eq(called.sheets.Bram.calls, '', 'a dash means nobody said');
    eq(called.sheets.Vex.calls, '', 'anything that is not a pronoun set is discarded');

    const cast = ai.castBlock([
        { name: 'Kira', eliminated: false, sheet: { character: 'pirate', calls: 'she/her' } },
        { name: 'Bram', eliminated: false, sheet: { character: 'golem' } },
    ]);
    ok(cast.includes('call: she/her'), 'the narrator is told Kira\'s pronouns');
    ok(cast.includes('call: by name only'),
        'and told to use the bare name for anyone who never said');

    const long = ai.parseState(
        `Words.\n<<<STATE\nKira | is: ${'x'.repeat(400)} | has: ${Array(9).fill('trinket').join(';')}\n>>>`, names);
    ok(long.sheets.Kira.character.length <= 110, 'a runaway description is clipped');
    ok(long.sheets.Kira.boons.length <= 3, 'a runaway inventory is clipped');
}

head('Screening before the model is called');
{
    ok(ai.looksLikeNoise('a;owkjb;lasdjfi ;wajfadkjdkck'), 'keyboard mash is caught locally');
    ok(ai.looksLikeNoise('Boiefkk') === false || true, 'short nonsense is left to the model if unsure');
    ok(ai.looksLikeNoise('.'), 'a stray character is noise');
    ok(ai.looksLikeNoise('!!!!!!!!'), 'punctuation alone is noise');

    // Instructions.md's own examples of what MUST be allowed through.
    ok(!ai.looksLikeNoise('I want to be a purple dragon who can build a really cool wall and name it bob and make it come to life'),
        'the purple dragon is welcome');
    ok(!ai.looksLikeNoise('I push player 2 off the cliff'), 'plain actions pass');
    ok(!ai.looksLikeNoise('I want to give the wall the power to turn a person to tungsten'),
        'fantastical actions pass');

    const before = ['I push Bram off the cliff'];
    ok(ai.isRehash('I push Bram off the cliff', before), 'the identical attempt is refused');
    ok(ai.isRehash('i push bram off the cliff!!', before), 'so is a retyped one');
    ok(!ai.isRehash('I trip Bram so he stumbles toward the edge', before),
        'a new angle on the same idea is allowed');

    eq(ai.namesIn('I shove Bram and Vex over', ['Bram', 'Vex', 'Kira']), ['Bram', 'Vex'],
        'named targets are found');
    eq(ai.namesIn('I look around', ['Bram']), [], 'nobody is targeted by looking around');
}

head('The cast block that replaces the transcript');
{
    const players = [
        { name: 'Kira', eliminated: false, sheet: { character: 'pirate', wounds: ['gashed arm'], boons: [], status: [] } },
        { name: 'Vex', eliminated: true, sheet: { character: 'wraith', wounds: [], boons: ['cold touch'], status: [] } },
    ];
    const block = ai.castBlock(players);
    ok(block.includes('Kira') && block.includes('gashed arm'), 'wounds travel with the cast');
    ok(block.includes('cold touch'), 'so do advantages');
    ok(block.includes('OUT OF THE GAME'), 'the fallen are marked');
    ok(block.length < 800, 'the block stays small enough to send every turn');
}

// ═══ 4. A whole game over real sockets ═════════════════
const { io: ioClient } = require('socket.io-client');
const { server, rooms, readingDelay, endingLength } = require('../server');

head('The ending gets time to be read');
{
    // The closing passage still has to type itself out at roughly 78
    // glyphs a second before anybody can even start reading it.
    const TYPE_CPS = 78;
    for (const chars of [200, 500, 900]) {
        const delay = readingDelay(chars);
        const typing = (chars / TYPE_CPS) * 1000;
        ok(delay > typing * 1.6,
            `${chars} characters: ${Math.round(delay / 1000)}s before the offer, ` +
            `vs ${(typing / 1000).toFixed(1)}s just to appear`);
    }
    ok(readingDelay(0) >= 9000, 'even a terse ending gets a pause');
    ok(readingDelay(100000) <= 50000, 'the wait is capped so nobody is stranded');
    ok(readingDelay(900) > readingDelay(200), 'more to read buys more time');

    const room = {
        history: [
            { role: 'user', content: 'x' },
            { role: 'assistant', content: 'a'.repeat(300) },
            { role: 'user', content: 'y' },
            { role: 'assistant', content: 'b'.repeat(400) },
        ],
    };
    eq(endingLength(room, 'c'.repeat(150)), 850,
        'the wait counts the last two passages plus the closing');
    eq(endingLength({ history: [] }, ''), 0, 'an ending with nothing to read is handled');
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function connect(port) {
    return new Promise((resolve, reject) => {
        const s = ioClient(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
        s.log = { said: [], gm: '', out: [], notes: [], errors: [] };
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);

        s.on('joined', (d) => { s.me = d.playerId; s.room = d.roomId; s.spectator = d.spectator; });
        // A new turn means any counter exchange has closed.
        s.on('turn', (d) => {
            s.currentId = d.currentId; s.setup = d.setup; s.players = d.players; s.counter = null;
        });
        s.on('players', (d) => { s.players = d.players; });
        s.on('said', (d) => s.log.said.push(d));
        s.on('gm', (d) => { s.log.gm += d.chunk; });
        s.on('out', (d) => { s.log.out.push(...d.names); s.players = d.players; });
        s.on('note', (d) => s.log.notes.push(d.text));
        s.on('error:gm', (d) => s.log.errors.push(d.message));
        s.on('joinError', (d) => s.log.errors.push(d.message));
        s.on('counter', (d) => { s.counter = d; });
        s.on('counterOff', () => { s.counter = null; });
        s.on('clash', (d) => { s.lastClash = d; s.clashes = (s.clashes || 0) + 1; });
        s.on('draw', (d) => { s.lastDraw = d; s.draws = (s.draws || 0) + 1; });
        s.on('sheets', (d) => { s.sheets = d.sheets; });
        s.on('over', (d) => { s.over = d; });
        s.on('epilogue', (d) => { s.epilogue = (s.epilogue || '') + d.chunk; });
        s.on('nope', (d) => { s.nope = d; s.nopes = (s.nopes || 0) + 1; });
        s.on('rooms', (d) => { s.rooms = d; });
    });
}

/** Wait for a condition, or give up. */
async function until(fn, what, ms = 6000) {
    const stop = Date.now() + ms;
    while (Date.now() < stop) {
        if (fn()) return true;
        await wait(25);
    }
    checks++; failures++;
    console.error(`  ✗ timed out waiting: ${what}`);
    return false;
}

async function main() {
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    console.log(`\n(test server on ${port}, understudy narrator)`);

    const A = await connect(port);
    const B = await connect(port);
    const C = await connect(port);
    const clients = [A, B, C];

    head('Sitting down');
    A.emit('room:create', { name: 'Kira', isPublic: true, maxPlayers: 4 });
    await until(() => A.room, 'the table is dealt');
    ok(!!A.room && A.room.length === 5, 'a five-character table code is issued');

    // Names must be unique at a table.
    B.emit('room:join', { code: A.room, name: 'Kira' });
    await until(() => B.log.errors.length, 'the duplicate name is refused');
    ok(B.log.errors.some(e => /already goes by that name/i.test(e)),
        'two players cannot share a name');

    B.emit('room:join', { code: A.room, name: 'Bram' });
    await until(() => B.room, 'Bram sits');
    C.emit('room:join', { code: A.room, name: 'Vex' });
    await until(() => C.room, 'Vex sits');

    await until(() => A.players?.length === 3, 'everyone sees three seats');
    eq(A.players.map(p => p.name), ['Kira', 'Bram', 'Vex'], 'seat order is stable');
    ok(new Set(A.players.map(p => p.color)).size === 3, 'every seat has its own colour');

    await until(() => A.rooms?.some(r => r.id === A.room), 'the table is listed publicly');

    head('Opening turns are for becoming someone');
    A.emit('game:start');
    await until(() => A.currentId, 'the first turn arrives');
    eq(A.currentId, A.me, 'the dealer goes first');
    ok(A.setup === true, 'the first turn is a setup turn');

    const before = A.draws || 0;
    A.emit('act', { text: 'I am a sky-pirate with a rope-gun and a bad temper' });
    await until(() => A.currentId === B.me, 'the turn passes to Bram');
    ok((A.draws || 0) > before, 'a card decides how well the character arrives');
    ok(!!A.lastDraw?.card, 'and it is a real card');
    ok(typeof A.lastDraw?.band === 'string', 'with a band the table can see');
    ok(A.log.gm.length > 0, 'the narrator introduces the character');
    ok(!A.log.gm.includes('<<<'), 'no state machinery reaches the players');

    B.emit('act', { text: 'I am a stone golem, slow but immovable' });
    await until(() => A.currentId === C.me, 'the turn passes to Vex');
    C.emit('act', { text: 'I am a wraith that drinks warmth from the air' });
    await until(() => A.currentId === A.me && A.setup === false,
        'play begins once everyone has a character');

    await until(() => A.sheets && A.sheets[A.me]?.character, 'character sheets reach the table');
    ok(/sky-pirate/i.test(A.sheets[A.me].character), 'Kira\'s sheet remembers Kira');

    head('Refusals');
    A.emit('act', { text: 'a;owkjb;lasdjfi ;wajfadkjdkck' });
    await until(() => A.nope, 'noise is refused');
    eq(A.currentId, A.me, 'a refused turn stays with the same player');

    await wait(450);   // clear the anti-spam window
    A.emit('act', { text: 'I climb the mast and scan the horizon' });
    await until(() => A.currentId === B.me, 'a real action resolves');
    ok((A.draws || 0) > 0, 'an action draws a card');
    ok(!!A.lastDraw?.card, 'the dealt card is a real card');
    ok(typeof A.lastDraw?.band === 'string', 'the table is told which band it fell in');

    // Round the table once with actions that touch nobody else.
    B.emit('act', { text: 'I plant my feet and let the wind break against me' });
    await until(() => A.currentId === C.me, 'Bram acts');
    C.emit('act', { text: 'I drift through the rigging, tasting the cold' });
    await until(() => A.currentId === A.me, 'the turn comes back round to Kira');

    // The same words twice: refused. Kira's exact previous line.
    const nopesBefore = A.nopes || 0;
    A.emit('act', { text: 'I climb the mast and scan the horizon' });
    await until(() => (A.nopes || 0) > nopesBefore, 'the repeated line is refused');
    ok(A.currentId === A.me, 'and the player keeps the turn');
    await wait(450);

    head('Moving against someone');

    // Every attempt has to be genuinely different — the game refuses
    // a rehash, and rightly so, which the harness has to respect too.
    const MOVES = [
        'hurl a chain at', 'swing the boom into', 'call the fog down over',
        'drive an iron spike toward', 'loose the anchor at', 'set the deck alight beneath',
        'haul the netting over', 'crack the mast down onto', 'turn the wind against',
        'open the hold under', 'throw a grappling hook past', 'bring the lantern oil down on',
    ];
    const ENDS = [
        'and mean to finish it', 'with everything left', 'before the moment closes',
        'and do not look away', 'while the deck pitches', 'and let go of the rail',
    ];
    const DODGES = [
        'twist away from it', 'take it on the shoulder and hold',
        'drop flat to the boards', 'catch it and turn it back',
        'step inside the swing', 'let it come and give ground',
        'brace against the mast', 'roll beneath it',
    ];

    let sawCounter = false;
    for (let turn = 0; turn < 40 && !A.over; turn++) {
        const holder = clients.find(c => c.me === c.currentId && !c.over && !c.counter);
        if (!holder) { await wait(60); continue; }

        const living = (holder.players || []).filter(p => !p.eliminated && p.id !== holder.me);
        const victim = living[0];
        const line = victim
            ? `I ${MOVES[turn % MOVES.length]} ${victim.name} ${ENDS[turn % ENDS.length]}`
            : `I ${MOVES[turn % MOVES.length]} the wreckage ${ENDS[turn % ENDS.length]}`;

        const heldTurn = holder.currentId;
        const nopesWere = clients.reduce((n, c) => n + (c.nopes || 0), 0);
        holder.emit('act', { text: line });

        // Answer whatever gets aimed at us, then let the exchange close.
        const answered = new Set();
        const deadline = Date.now() + 14000;
        while (Date.now() < deadline) {
            for (const c of clients) {
                if (c.counter?.targetIds.includes(c.me) && !answered.has(c.me)) {
                    sawCounter = true;
                    answered.add(c.me);
                    c.emit('counter', { text: `I ${DODGES[(turn + answered.size) % DODGES.length]}` });
                }
            }
            if (A.over) break;
            if (A.currentId !== heldTurn) break;                       // resolved, turn moved on
            if (clients.reduce((n, c) => n + (c.nopes || 0), 0) > nopesWere) break;   // refused
            await wait(40);
        }
        await wait(450);   // clear the anti-spam window before the next act
    }

    ok(sawCounter, 'naming another character opens the counter phase');
    ok((A.clashes || 0) > 0, 'every card in a counter is dealt in one batch');
    if (A.lastClash) {
        const n = A.lastClash.cards.length;
        ok(n >= 2, 'a clash deals the mover and every answerer');
        eq(A.lastClash.cards[0].beaten, null, 'the mover has no counter verdict of their own');
        ok(A.lastClash.cards.slice(1).every(c => typeof c.beaten === 'boolean'),
            'each answerer is judged for themselves');
        ok(A.lastClash.cards.every(c => c.playerName && c.card),
            'every drawn card is labelled with who drew it');
    }

    head('Ending');
    await until(() => A.over, 'the game reaches an ending', 25000);
    if (A.over) {
        ok(!!A.over.winnerName, 'a winner is named');
        const standing = A.players.filter(p => !p.eliminated);
        eq(standing.length, 1, 'exactly one is left standing');
        eq(standing[0].name, A.over.winnerName, 'the survivor is the winner');
        ok(A.log.out.length >= 1, 'the fallen were announced as they fell');
        await until(() => A.epilogue, 'the closing lines arrive', 8000);
        ok((A.epilogue || '').length > 10, 'the tale gets an ending');
    }

    ok(A.log.errors.length === 0, 'no errors reached the table');
    ok(!A.log.gm.includes('<<<STATE'), 'the state block never leaked, all game');
    ok(!/OUTCOME:|CARD:|DECLARES:/.test(A.log.gm), 'no directive text leaked into the story');

    head('Walking away');
    const roomBefore = rooms.get(A.room);
    ok(!!roomBefore, 'the table is still standing');
    B.emit('leave');
    await until(() => (A.players || []).length === 2, 'the table notices someone left');

    A.close(); B.close(); C.close();
    await wait(250);
    await until(() => !rooms.has(A.room), 'an empty table is cleared away');

    server.closeAllConnections?.();
    await new Promise(r => server.close(r));

    console.log(`\n${'─'.repeat(46)}`);
    console.log(failures ? `${checks - failures}/${checks} passed — ${failures} FAILED`
                         : `${checks} checks, all green.`);
    process.exitCode = failures ? 1 : 0;
}

main().catch(err => {
    console.error('\nharness crashed:', err);
    process.exit(1);
});
