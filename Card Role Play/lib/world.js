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

function list(raw, maxItems, maxLen = 44) {
    if (!raw) return [];
    const t = String(raw).trim();
    if (!t || t === '-' || /^(none|nothing|n\/a|unknown)$/i.test(t)) return [];
    return t.split(/[;,]/)
        .map(s => clip(s, maxLen))
        .filter(s => s && !/^(none|-|nothing)$/i.test(s))
        .slice(0, maxItems);
}

const blankWorld = () => ({ where: '', tone: '', places: [], holds: [], absent: [] });

/** A world is usable once it knows where everyone is. */
const isReady = (w) => !!(w && w.where);

// ── Asking the host what it cannot guess ───────────────

const INTERVIEW_SYSTEM =
`You are the Game Master of a card-driven role-playing game, reading the setting the host has just written for it.

Ask at most three short questions — fewer is better, and none at all is a fine answer when the setting is already clear enough to play in.

Only ask what would change how an ACTION RESOLVES. Useful: what is impossible here, what technology or magic exists, how large the place is, who else is around, what the players are there to do. Useless: backstory, names of things nobody will touch, anything you could invent yourself without contradicting what you were told, anything answerable "whatever you like".

Reply with JSON only: {"questions":["...","..."]}. Each question one plain sentence, under twenty words, answerable in a few words. Empty array if you have enough.`;

const COMPACT_SYSTEM =
`You are compacting a role-playing game's setting into the short brief its Game Master will read every single turn. Be ruthless: this is a reference card, not a description. Prose is wasted here.

Reply with exactly this block and nothing else:

${OPEN}
where: one sentence — the place, the era, and what kind of story this is
tone: three or four words
places: four to eight specific locations, separated by semicolons
holds: what is true or possible here that would not be elsewhere; semicolons
absent: what plainly does not exist here; semicolons
${CLOSE}

Rules. "places" are locations a character could stand in or walk to, named as a player would name them — a room, a street, a landmark, not a region. "holds" is what the world permits that a narrator might otherwise get wrong: magic that works, laws of the place, who holds power, dangers. "absent" is the one to be concrete about, because it is what lets an impossible action be refused: name the things players will reach for and not find — firearms, engines, telephones, electricity, magic, help. Keep every field under twenty-five words. Invent what the host left out, as long as it does not contradict what they said.`;

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
        else if (key === 'tone') w.tone = clip(m[2], 60);
        else if (key === 'places') w.places = list(m[2], 8);
        else if (key === 'holds') w.holds = list(m[2], 5);
        else if (key === 'absent') w.absent = list(m[2], 6);
    }
    return w;
}

/** Places the story establishes as it goes are as real as the first ones. */
function addPlaces(world, names) {
    if (!world || !names?.length) return world;
    const have = new Set(world.places.map(p => p.toLowerCase()));
    for (const raw of names) {
        const p = clip(raw, 44);
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
    if (world.tone) lines.push(`TONE: ${world.tone}`);
    if (world.places.length) lines.push(`PLACES THAT EXIST: ${world.places.join('; ')}`);
    if (world.holds.length) lines.push(`WHAT HOLDS TRUE HERE: ${world.holds.join('; ')}`);
    if (world.absent.length) lines.push(`WHAT DOES NOT EXIST HERE: ${world.absent.join('; ')}`);

    lines.push(
        '',
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
    if (world.absent.length) bits.push(`DOES NOT EXIST HERE: ${world.absent.join('; ')}`);
    if (world.holds.length) bits.push(`TRUE HERE: ${world.holds.join('; ')}`);
    if (world.places.length) bits.push(`KNOWN PLACES: ${world.places.join('; ')}`);
    return bits.join('\n');
}

module.exports = {
    OPEN, CLOSE, blankWorld, isReady, parseWorld, addPlaces,
    worldBlock, worldConstraint, INTERVIEW_SYSTEM, COMPACT_SYSTEM,
};
