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

// Bounded so that neither a pile of wounds nor a hoard of trinkets
// can decide a turn on its own. The card is always the loud part.
const MAX_WOUND_PENALTY = 3;
const MAX_BOON_BONUS = 2;

const bandFor = (v) => BANDS.find(b => v <= b.max) || BANDS[BANDS.length - 1];

function penalty(sheet) {
    return Math.min((sheet?.wounds || []).length, MAX_WOUND_PENALTY);
}
function bonus(sheet) {
    return Math.min((sheet?.boons || []).length, MAX_BOON_BONUS);
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
    return { card, ...e, band: band.key, label: band.label, directive: band.directive };
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
        };
    });
    return { attacker: atk, defenders: rows, allHeld: rows.every(r => r.beaten) };
}

// ── Rendering the maths as instructions ────────────────
// The prompt text lives next to the arithmetic so the two cannot
// drift apart.

function modNote(r) {
    const bits = [];
    if (r.pen) bits.push(`-${r.pen} hurt`);
    if (r.bon) bits.push(`+${r.bon} advantage`);
    return bits.length ? ` (${cardValue(r.card)} ${bits.join(' ')} = ${r.eff})` : '';
}

function soloDirective(name, text, r) {
    return [
        `ACTOR: ${name}`,
        `DECLARES: "${text}"`,
        `CARD: ${cardName(r.card)}${modNote(r)}`,
        `OUTCOME: ${r.label} — ${r.directive}`,
        '',
        `Narrate exactly this outcome for ${name} in 2-4 sentences.`,
    ].join('\n');
}

function counterDirective(attackerName, attackerText, res) {
    const lines = [
        `${attackerName} moves against ${res.defenders.map(d => d.name).join(' and ')}.`,
        `${attackerName} DECLARES: "${attackerText}"`,
        `${attackerName}'s card: ${cardName(res.attacker.card)}${modNote(res.attacker)}`,
        `FORCE: ${res.attacker.label} — against anyone who fails to turn it aside, ` +
            res.attacker.directive.replace(/^It /, 'the move '),
        '',
        'THE ANSWERS:',
    ];
    for (const d of res.defenders) {
        lines.push(
            `- ${d.name} answers: "${d.text}"`,
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
        `Narrate the whole exchange as one passage, 3-6 sentences.`,
    );
    return lines.join('\n');
}

module.exports = {
    BANDS, bandFor, effective, resolveSolo, resolveCounter,
    soloDirective, counterDirective,
    MAX_WOUND_PENALTY, MAX_BOON_BONUS,
};
