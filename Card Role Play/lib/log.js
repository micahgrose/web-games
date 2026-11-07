'use strict';

// ── The table's black box ──────────────────────────────
// A playtest turns up something strange and there is nothing to read: no
// transcript, no directives, no idea what the model was actually handed.
// The last one had to be diagnosed by reconstructing the prompt by hand
// and guessing at the tags.
//
// One file per game, written as it happens, holding the things that are
// gone the moment the process restarts: the world brief, every directive
// with its cards and verdict, the prose that came back, the state block
// as it parsed, and every refusal, timeout and error with its reason.
//
// Off with LOG_GAMES=off. Never allowed to throw — a logger that can
// break a game is worse than no logger.

const fs = require('fs');
const path = require('path');

const ENABLED = String(process.env.LOG_GAMES || 'on').toLowerCase() !== 'off';
const DIR = path.join(__dirname, '..', 'logs');

const streams = new Map();
let warned = false;

function stamp() {
    return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function streamFor(roomId) {
    if (streams.has(roomId)) return streams.get(roomId);
    try {
        fs.mkdirSync(DIR, { recursive: true });
        const when = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const s = fs.createWriteStream(path.join(DIR, `${when}_${roomId}.log`), { flags: 'a' });
        s.on('error', () => {});
        streams.set(roomId, s);
        return s;
    } catch (err) {
        if (!warned) { warned = true; console.warn('[log] cannot write logs:', err.message); }
        streams.set(roomId, null);
        return null;
    }
}

/**
 * One entry. `body` may be multi-line and is indented so a scan down the
 * left margin shows only the tags.
 */
function write(roomId, tag, body) {
    if (!ENABLED || !roomId) return;
    try {
        const s = streamFor(roomId);
        if (!s) return;
        const head = `${stamp()}  ${String(tag).toUpperCase().padEnd(9)}`;
        const text = body == null ? '' : String(body);
        if (!text.includes('\n')) { s.write(`${head} ${text}\n`); return; }
        s.write(`${head}\n`);
        for (const line of text.split('\n')) s.write(`    ${line}\n`);
    } catch { /* logging must never take the game down */ }
}

const LISTS = [['wounds', 'hurt'], ['boons', 'has'], ['status', 'now']];

// Positional and filler words match everything and mean nothing: without
// this, "gashed left arm" and "mending left leg" pair up as a rewrite.
const DULL = new Set(['left', 'right', 'both', 'the', 'and', 'with', 'from', 'that',
    'this', 'into', 'over', 'under', 'upper', 'lower', 'near', 'far', 'one', 'two',
    'his', 'her', 'its', 'their', 'has', 'had', 'was', 'are', 'for', 'own']);

const keywords = (s) => new Set(
    (String(s).toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !DULL.has(w)));

/** Every character's tags as they stand right now. */
function snapshot(players) {
    const out = {};
    for (const p of players) {
        const s = p.sheet || {};
        out[p.name] = {
            character: s.character || '', where: s.where || '',
            wounds: [...(s.wounds || [])], boons: [...(s.boons || [])],
            status: [...(s.status || [])],
        };
    }
    return out;
}

/**
 * What actually changed on the sheets, as applied — not what the model
 * claimed. A rewritten tag arrives as one gone and one new; where a
 * field loses exactly one and gains exactly one and they share a word,
 * it is reported as the rewrite it almost certainly is.
 */
function tagDelta(before, after) {
    const lines = [];
    for (const name of Object.keys(after)) {
        const a = after[name], b = before[name];
        const rows = [];

        if (!b) { rows.push(`  + joined the table`); }
        else {
            for (const [key, label] of [['character', 'is'], ['where', 'at']]) {
                if ((b[key] || '') !== (a[key] || '')) {
                    rows.push(b[key]
                        ? `  ~ ${label}: ${b[key]} → ${a[key] || '-'}`
                        : `  + ${label}: ${a[key]}`);
                }
            }
            for (const [key, label] of LISTS) {
                const had = b[key] || [], has = a[key] || [];
                const gone = had.filter(t => !has.includes(t));
                const fresh = has.filter(t => !had.includes(t));

                // Pair what looks rewritten before reporting the rest. A
                // turn commonly rewrites one tag AND adds another, so
                // this has to match pairwise rather than only when the
                // field lost exactly one thing and gained exactly one.
                const left = [...gone], added = [...fresh];
                for (const g of [...left]) {
                    const shared = [...keywords(g)].filter(w => keywords(
                        added.find(f => keywords(f).has(w)) || '').has(w));
                    if (!shared.length) continue;
                    const match = added.find(f => keywords(f).has(shared[0]));
                    if (!match) continue;
                    rows.push(`  ~ ${label}: ${g} → ${match}`);
                    left.splice(left.indexOf(g), 1);
                    added.splice(added.indexOf(match), 1);
                }
                for (const t of added) rows.push(`  + ${label}: ${t}`);
                for (const t of left) rows.push(`  - ${label}: ${t}`);
            }
        }
        if (!rows.length) continue;

        const now = `at: ${a.where || '-'} | hurt: ${a.wounds.join('; ') || '-'}`
            + ` | has: ${a.boons.join('; ') || '-'} | now: ${a.status.join('; ') || '-'}`;
        lines.push(`${name}\n${rows.join('\n')}\n  = ${now}`);
    }
    return lines.length ? lines.join('\n') : 'nothing on any sheet changed this turn';
}

/** Everything worth keeping about a finished turn, in one entry. */
function turn(roomId, { label, directive, prose, sheets, dead, places, retried }) {
    if (!ENABLED) return;
    write(roomId, 'directive', `${label ? label + '\n' : ''}${directive}`);
    // A turn that came back blank the first time still ends up looking
    // ordinary in here. It should say so.
    if (retried) write(roomId, 'RETRIED', retried);
    write(roomId, 'prose', prose);
    if (!sheets || !Object.keys(sheets).length) {
        write(roomId, 'sheets', 'NONE — the state block was missing or unparseable');
    }
    if (dead?.length) write(roomId, 'dead', dead.join(', '));
    if (places?.length) write(roomId, 'newplace', places.join('; '));
}

function close(roomId) {
    const s = streams.get(roomId);
    if (s) { try { s.end(); } catch { /* already gone */ } }
    streams.delete(roomId);
}

module.exports = { write, turn, close, snapshot, tagDelta, ENABLED, DIR };
