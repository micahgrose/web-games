'use strict';

// ── The world ──────────────────────────────────────────
// The host writes the setting while people are still arriving. The
// Game Master reads it, asks the few things it cannot guess, and then
// the whole thing is COMPACTED into a handful of fields — because a
// paragraph of atmosphere resent every turn forever is the same mistake
// the unbounded transcript was, and because a narrator obeys a short
// list of facts far more reliably than it obeys good prose.
//
// What the compaction is for, beyond flavour: it gives the game two
// things it could not do before. It can tell that an action is
// impossible HERE (no telephones in 1340), and it can tell whether a
// place a player walks toward should exist at all.

const OPEN = '<<<WORLD';
const CLOSE = '>>>';

const clip = (s, n) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, n);

// The brief is read by the narrator every turn and shown to every player,
// so a field cut mid-word stays cut: one game carried "political intrigue
// can turn allies into enem" for the whole of its length. Trim at a word.
function trimWords(s, n) {
    const t = clip(s, 4 * n);
    if (t.length <= n) return t;
    const cut = t.lastIndexOf(' ', n);
    return cut > 0 ? t.slice(0, cut) : t.slice(0, n);
}

function list(raw, maxItems, maxLen = 44) {
    if (!raw) return [];
    const t = String(raw).trim();
    if (!t || t === '-' || /^(none|nothing|n\/a|unknown)$/i.test(t)) return [];
    return t.split(/[;,]/)
        .map(s => trimWords(s, maxLen))
        .filter(s => s && !/^(none|-|nothing)$/i.test(s))
        .slice(0, maxItems);
}

const blankWorld = () => ({
    where: '', goal: '', power: '', tone: '', places: [], holds: [], absent: [],
});

/** A world is usable once it knows where everyone is. */
const isReady = (w) => !!(w && w.where);

// ── Asking the host what it cannot guess ───────────────

const INTERVIEW_SYSTEM =
`You are the Game Master of a card-driven role-playing game, reading the setting the host has just written for it.

Ask at most three short questions. Two of them are nearly always these, and you should ask them unless the host has already made the answer plain:

1. WHAT THE PLAYERS ARE HERE TO DO. What do their characters want out of this place, and what would count as getting somewhere?
2. HOW FAR THIS WORLD BENDS. What can a character actually be and do here — ordinary people, or throw fire, fly, walk through walls, come back from the dead? And how does travel work: hours and roads, or a step through the right door?

Those two decide more about how an action resolves than anything else you could ask, because between them they settle what players will reach for and what they will be told is not there.

The third, if you ask one, is whatever else would genuinely change a resolution: what is flatly impossible, how big the place is, who else is around, what the danger actually is. Never ask about backstory, the names of things nobody will touch, anything you could invent yourself without contradicting what you were told, or anything answerable "whatever you like".

Reply with JSON only: {"questions":["...","..."]}. Each question one plain sentence, under twenty words, answerable in a few words. Empty array if you have enough.`;

// One more round, if the first one left a hole — the Game Master's own
// call, because it is the only thing here that knows whether it can
// actually rule on an action yet. Biased hard toward asking nothing: a
// host who has already answered three questions is being kept from
// starting a game, and two rounds of interrogation over a sentence about
// a drowned city is worse than one imperfect brief.
const FOLLOWUP_SYSTEM =
`You are the Game Master of a card-driven role-playing game. You have already asked the host what you needed about their setting, and they have answered. This is your one chance to ask again, and you should usually decline it.

Ask nothing — return an empty array — unless an answer genuinely failed to settle what it was asked, and the hole it left will change how actions resolve at the table. That means one of:

- an answer that dodged the question or said nothing of substance. "Whatever suits the story" is a real answer: it means the host wants you to decide, so decide, and never ask that again.
- an answer that contradicts the setting, or another answer.
- a limit left so vague that you could not tell a player their action is impossible here.

At most two questions, and one is better than two. Never re-ask what has been answered, never ask for a detail you could invent yourself without contradicting anything, and never ask the host to confirm something they plainly told you. If the two things that decide the most — what the players are here for, and how far this world bends — are settled well enough to rule on, you have enough. Say so by asking nothing.

Reply with JSON only: {"questions":["..."]}. Each question one plain sentence, under twenty words, answerable in a few words, and each must point at the one thing that was left open.`;

const COMPACT_SYSTEM =
`You are compacting a role-playing game's setting into the short brief its Game Master will read every single turn. Be ruthless: this is a reference card, not a description. Prose is wasted here.

Reply with exactly this block and nothing else:

${OPEN}
where: one sentence — the place, the era, and what kind of story this is
goal: one sentence — what the characters want here, and what getting somewhere looks like
power: one sentence — how far this world bends, and how travel works
tone: three or four words
places: four to eight specific locations, separated by semicolons
holds: what is true or possible here that would not be elsewhere; semicolons
absent: what plainly does not exist here; semicolons
${CLOSE}

Rules. "goal" is what gives every character a reason to act; write it so it is still true whoever is playing. "power" is the ceiling on the possible — say plainly whether these are ordinary people or can throw fire, fly, pass through walls, cross the world in a step; it is what an outrageous action gets measured against. "places" are locations a character could stand in or walk to, named as a player would name them — a room, a street, a landmark, not a region. "holds" is what the world permits that a narrator might otherwise get wrong: magic that works, laws of the place, who holds power, dangers. "absent" is the one to be concrete about, because it is what lets an impossible action be refused: name the things players will reach for and not find — firearms, engines, telephones, electricity, magic, help. Keep every field under twenty-five words. Invent what the host left out, as long as it does not contradict what they said.`;

/** Pull the compacted brief out of a model reply. */
function parseWorld(text) {
    const start = String(text || '').indexOf(OPEN);
    let block = start < 0 ? String(text || '') : text.slice(start + OPEN.length);
    const end = block.indexOf(CLOSE);
    if (end >= 0) block = block.slice(0, end);

    const w = blankWorld();
    for (const line of block.split('\n')) {
        const m = /^\s*([a-z]+)\s*:\s*(.*)$/i.exec(line.trim());
        if (!m) continue;
        const key = m[1].toLowerCase();
        if (key === 'where') w.where = clip(m[2], 220);
        else if (key === 'goal') w.goal = clip(m[2], 200);
        else if (key === 'power') w.power = clip(m[2], 200);
        else if (key === 'tone') w.tone = clip(m[2], 60);
        else if (key === 'places') w.places = list(m[2], 8);
        else if (key === 'holds') w.holds = list(m[2], 5);
        else if (key === 'absent') w.absent = list(m[2], 6);
    }
    return w;
}

/**
 * Write the host's answers onto the questions still open.
 *
 * The host is only ever shown unanswered questions, so a reply lines up
 * with those and not with the whole list — filling a second round by
 * index across everything would overwrite the first round's answers with
 * the second round's text. Returns just the ones filled, for the log.
 */
function fillAnswers(qa, given) {
    const answers = Array.isArray(given) ? given : [];
    const filled = [];
    let i = 0;
    for (const x of qa || []) {
        if (x.a) continue;
        // A blank is an answer too: it hands the decision back.
        x.a = clip(answers[i++], 400) || 'whatever suits the story';
        filled.push(x);
    }
    return filled;
}

/** Places the story establishes as it goes are as real as the first ones. */
function addPlaces(world, names) {
    if (!world || !names?.length) return world;
    const have = new Set(world.places.map(p => p.toLowerCase()));
    for (const raw of names) {
        const p = trimWords(raw, 44);
        if (p && !have.has(p.toLowerCase())) { world.places.push(p); have.add(p.toLowerCase()); }
    }
    // The list is a reference card. Oldest anchor the setting, newest are
    // where the story actually is; drop from the middle.
    if (world.places.length > 14) {
        world.places = [...world.places.slice(0, 6), ...world.places.slice(-8)];
    }
    return world;
}

// ── What the narrator sees, every turn ─────────────────

function worldBlock(world) {
    if (!isReady(world)) return null;
    const lines = [`THE WORLD — everything happens here, and nothing happens that this world forbids.`,
        `WHERE: ${world.where}`];
    if (world.goal) lines.push(`WHAT THEY ARE HERE FOR: ${world.goal}`);
    if (world.power) lines.push(`HOW FAR THIS WORLD BENDS: ${world.power}`);
    if (world.tone) lines.push(`TONE: ${world.tone}`);
    if (world.places.length) lines.push(`PLACES THAT EXIST: ${world.places.join('; ')}`);
    if (world.holds.length) lines.push(`WHAT HOLDS TRUE HERE: ${world.holds.join('; ')}`);
    if (world.absent.length) lines.push(`WHAT DOES NOT EXIST HERE: ${world.absent.join('; ')}`);

    lines.push(
        '',
        'What they are here for is why anyone acts: let it pull at them, give them something to '
        + 'want in the room they are standing in. It is not the ending — the tale still closes with '
        + 'one of them left standing — it is the reason they are moving at all.',
        'Work out how the action would really go IN THIS PLACE before you write it. The same '
        + 'sentence resolves differently in a flooded tunnel and on an open roof, and the world '
        + 'decides which — reach for what is actually to hand here.',
        'Where a character heads somewhere already listed above, they can get there. Somewhere not '
        + 'listed but that plainly belongs in a world like this: it is there, describe it, and name '
        + 'it on the WORLD line of the state block so it stays real. Somewhere that contradicts this '
        + 'world: it is simply not there, and the character finds what is actually in that direction '
        + 'instead. Do not argue with the player and do not explain the rule — show them the wall.',
        'Keep each character\'s "at:" current. Nobody crosses the world in one turn, and nobody '
        + 'touches what is not within reach of where they stand.');
    return lines.join('\n');
}

/** Handed to triage, which refuses what this world cannot contain. */
function worldConstraint(world) {
    if (!isReady(world)) return '';
    const bits = [`THE WORLD: ${world.where}`];
    // The ceiling on the possible is the whole point of showing triage
    // the world: it is what "I fly to the moon" gets measured against.
    if (world.power) bits.push(`HOW FAR IT BENDS: ${world.power}`);
    if (world.absent.length) bits.push(`DOES NOT EXIST HERE: ${world.absent.join('; ')}`);
    if (world.holds.length) bits.push(`TRUE HERE: ${world.holds.join('; ')}`);
    if (world.places.length) bits.push(`KNOWN PLACES: ${world.places.join('; ')}`);
    return bits.join('\n');
}

module.exports = {
    OPEN, CLOSE, blankWorld, isReady, parseWorld, addPlaces, fillAnswers,
    worldBlock, worldConstraint, INTERVIEW_SYSTEM, FOLLOWUP_SYSTEM, COMPACT_SYSTEM,
};
