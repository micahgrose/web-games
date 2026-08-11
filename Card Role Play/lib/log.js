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

/** Everything worth keeping about a finished turn, in one entry. */
function turn(roomId, { label, directive, prose, sheets, dead, places }) {
    if (!ENABLED) return;
    write(roomId, 'directive', `${label ? label + '\n' : ''}${directive}`);
    write(roomId, 'prose', prose);
    if (sheets && Object.keys(sheets).length) {
        write(roomId, 'sheets', Object.entries(sheets)
            .map(([n, s]) => `${n} | at: ${s.where || '-'} | hurt: ${(s.wounds || []).join('; ') || '-'}`
                + ` | has: ${(s.boons || []).join('; ') || '-'} | now: ${(s.status || []).join('; ') || '-'}`)
            .join('\n'));
    } else {
        write(roomId, 'sheets', 'NONE — the state block was missing or unparseable');
    }
    if (dead?.length) write(roomId, 'dead', dead.join(', '));
    if (places?.length) write(roomId, 'places', places.join('; '));
}

function close(roomId) {
    const s = streams.get(roomId);
    if (s) { try { s.end(); } catch { /* already gone */ } }
    streams.delete(roomId);
}

module.exports = { write, turn, close, ENABLED, DIR };
