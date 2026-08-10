'use strict';

// ── Outcomes ───────────────────────────────────────────
// The cards decide; the Game Master only narrates. Keeping the
// arithmetic here (instead of asking a language model to hold the
// rules in its head) means the counter rule is exact every time and
// a wound is worth the same on turn forty as on turn one.

const { cardValue, cardName } = require('./deck');

const BANDS = [
    { max: 4,  key: 'ruin',    label: 'RUIN',
      directive: 'It fails outright, and the failure costs the actor something.' },
    { max: 7,  key: 'falter',  label: 'FALTER',
      directive: 'It mostly fails. At most a sliver of the intent lands.' },
    { max: 10, key: 'mixed',   label: 'MIXED',
      directive: 'It half-works. The actor gets part of what was wanted and pays for it.' },
    { max: 12, key: 'success', label: 'SUCCESS',
      directive: 'It works, cleanly and without much cost.' },
    { max: 14, key: 'triumph', label: 'TRIUMPH',
      directive: 'It works beyond what was hoped — decisive, and it should feel it.' },
    { max: 99, key: 'fate',    label: 'FATE',
      directive: 'The Joker. It works, but fate bends the result into something ' +
                 'nobody asked for — surprising, irreversible, and fitting.' },
];

// What a character carries hits hard. An injury is worth two points
// and a real advantage two the other way, so three wounds cost most of
// a band and a shield genuinely raises the card needed to get through
// it. Still bounded — the card stays the loudest single thing — but a
// wounded character now plainly needs a better card for the same feat,
// which is what the game is supposed to be about.
const WOUND_WEIGHT = 2;
const BOON_WEIGHT = 2;
const MAX_WOUND_PENALTY = 5;
const MAX_BOON_BONUS = 4;

// How well a character comes into being when they first arrive.
// A setup turn attempts nothing, so the card rules only on how fully
// the description takes hold.
const ARRIVAL = {
    ruin: 'The character arrives badly diminished — the idea is intact, the execution is not. '
        + 'Saddle this character with one clear lasting flaw or injury from the very start.',
    falter: 'The character arrives shakily, noticeably less than was described. '
        + 'Give this character one real weakness.',
    mixed: 'The character arrives much as described, but with one genuine limitation attached.',
    success: 'The character arrives fully and convincingly as described. '
        + 'Give this character one clear advantage.',
    triumph: 'The character arrives at the very height of what was described, better than hoped. '
        + 'Give this character two clear advantages, or one formidable one.',
    fate: 'The Joker. The character arrives, but fate bends them into something adjacent and '
        + 'stranger than described. Give this character something nobody asked for — a real '
        + 'advantage with a catch in it.',
};

const bandFor = (v) => BANDS.find(b => v <= b.max) || BANDS[BANDS.length - 1];

function penalty(sheet) {
    return Math.min((sheet?.wounds || []).length * WOUND_WEIGHT, MAX_WOUND_PENALTY);
}
function bonus(sheet) {
    return Math.min((sheet?.boons || []).length * BOON_WEIGHT, MAX_BOON_BONUS);
}

/** Card value adjusted for what the tale has already done to this character. */
function effective(card, sheet) {
    const raw = cardValue(card);
    if (card?.joker) return { raw, eff: raw, pen: 0, bon: 0 };
    const pen = penalty(sheet);
    const bon = bonus(sheet);
    const eff = Math.max(1, Math.min(14, raw - pen + bon));
    return { raw, eff, pen, bon };
}

/** One actor against the world. */
function resolveSolo(card, sheet) {
    const e = effective(card, sheet);
    const band = bandFor(e.eff);
    return {
        card, ...e,
        wounds: sheet?.wounds || [],
        boons: sheet?.boons || [],
        status: sheet?.status || [],
        band: band.key, label: band.label, directive: band.directive,
    };
}

/** A character coming into being. Nothing is attempted; the card only
 *  rules on how fully the description takes hold. */
function resolveSetup(card) {
    const e = effective(card, null);
    const band = bandFor(e.eff);
    return {
        card, ...e, wounds: [], boons: [], status: [],
        band: band.key, label: band.label, directive: ARRIVAL[band.key],
    };
}

/**
 * One actor against several. Instructions.md, verbatim: if a
 * defender's card is higher than the attacker's, the action is
 * turned aside FOR THAT DEFENDER ONLY. Everyone is resolved
 * independently.
 */
function resolveCounter(attacker, defenders) {
    const atk = resolveSolo(attacker.card, attacker.sheet);
    const rows = defenders.map(d => {
        const e = effective(d.card, d.sheet);
        const beaten = e.eff > atk.eff;          // ties go to the attacker
        const band = bandFor(e.eff);
        return {
            id: d.id, name: d.name, card: d.card, text: d.text,
            ...e, beaten, band: band.key, label: band.label,
            // Carried through so the directive can name them, not just count them.
            wounds: d.sheet?.wounds || [],
            boons: d.sheet?.boons || [],
            status: d.sheet?.status || [],
        };
    });
    return { attacker: atk, defenders: rows, allHeld: rows.every(r => r.beaten) };
}

// ── Rendering the maths as instructions ────────────────
// The prompt text lives next to the arithmetic so the two cannot
// drift apart.

function modNote(r) {
    const bits = [];
    if (r.pen) bits.push(`-${r.pen} for injuries`);
    if (r.bon) bits.push(`+${r.bon} for advantages`);
    return bits.length ? ` → ${cardValue(r.card)} ${bits.join(' ')} = ${r.eff}` : '';
}

// Repeated at the foot of every directive. The rule is in the system
// prompt too, but a model follows the last thing it read far more
// reliably than the first.
const MARK = 'Before the state block: whatever this turn cost, caught, broke, mended or won, record '
    + 'it on whoever it happened to. It has to be something the passage actually described — never '
    + 'break a tag the passage never touched, and never invent a loss just to have one to write '
    + 'down. If nothing lasting came of the moment, a change to "now:" is change enough. '
    + 'Then reread their existing tags and rewrite or delete any this turn made untrue. '
    + 'Name no card, no number, and none of the words ruin, falter, mixed, success, triumph or fate.';

/** Spell out what a character is carrying, by name. The narrator has
 *  to be able to SEE the reason a card came out the way it did. */
function conditionLines(name, r) {
    const out = [];
    if (r.wounds?.length) {
        out.push(`${name} is carrying: ${r.wounds.join(', ')}. `
            + `Whichever of these bears on this moment is why it went as it did — show that one `
            + `interfering, once. Say nothing of the others. If this turn tends to any, soften or strike it.`);
    }
    if (r.boons?.length) {
        out.push(`${name} has: ${r.boons.join(', ')}. `
            + `Whichever applies here is how ${name} acts — name it once and never again in the same `
            + `passage. Pass over the rest in silence. If any is spent, broken or lost, strike it.`);
    }
    if (r.status?.length) {
        out.push(`${name} is currently ${r.status.join(', ')} — a passing state. `
            + `If this moment ends it, clear it.`);
    }
    return out;
}

function soloDirective(name, text, r) {
    return [
        `ACTOR: ${name}`,
        `DECLARES: "${text}"`,
        ...conditionLines(name, r),
        `CARD: ${cardName(r.card)}${modNote(r)}`,
        `OUTCOME: ${r.label} — ${r.directive}`,
        '',
        `Narrate exactly this for ${name} in 2-3 sentences. No sentence may restate another.`,
        MARK,
    ].filter(Boolean).join('\n');
}

function setupDirective(name, text, r) {
    return [
        `SETUP — a new character enters. Nothing is at stake and no action is attempted; `
            + `the card rules only on how well this character comes into being.`,
        `ACTOR: ${name}`,
        `BECOMES: "${text}"`,
        `CARD: ${cardName(r.card)} (${r.eff})`,
        `ARRIVAL: ${r.label} — ${r.directive}`,
        '',
        `Introduce ${name} arriving, in two sentences. Do not invent a location the tale has `
            + `not already established. Whatever this arrival grants or costs ${name}, write it `
            + `into the state block as an advantage or an injury — it is real from now on.`,
    ].join('\n');
}

function counterDirective(attackerName, attackerText, res) {
    const lines = [
        `${attackerName} moves against ${res.defenders.map(d => d.name).join(' and ')}.`,
        `${attackerName} DECLARES: "${attackerText}"`,
        ...conditionLines(attackerName, res.attacker),
        `${attackerName}'s card: ${cardName(res.attacker.card)}${modNote(res.attacker)}`,
        `FORCE: ${res.attacker.label} — against anyone who fails to turn it aside, ` +
            res.attacker.directive.replace(/^It /, 'the move '),
        '',
        'THE ANSWERS:',
    ];
    for (const d of res.defenders) {
        lines.push(`- ${d.name} answers: "${d.text}"`);
        for (const line of conditionLines(d.name, d)) lines.push(`  ${line}`);
        lines.push(
            `  card: ${cardName(d.card)}${modNote(d)} → ${d.beaten
                ? `TURNS IT ASIDE. ${d.name}'s answer works; ${attackerName}'s action fails against ${d.name} alone.`
                : `FAILS. ${attackerName}'s action lands on ${d.name}.`}`,
        );
    }
    lines.push(
        '',
        res.allHeld
            ? `Every answer held. ${attackerName}'s move fails completely, and ${attackerName} bears the cost of it.`
            : `Resolve each name exactly as marked above — one may be struck while another walks away.`,
        `Narrate the whole exchange as one passage, 3-4 sentences — one clean pass through it, `
            + `no sentence restating another and no closing summary.`,
        MARK,
    );
    return lines.join('\n');
}

module.exports = {
    BANDS, ARRIVAL, bandFor, effective,
    resolveSolo, resolveSetup, resolveCounter,
    soloDirective, setupDirective, counterDirective,
    WOUND_WEIGHT, BOON_WEIGHT, MAX_WOUND_PENALTY, MAX_BOON_BONUS,
};
