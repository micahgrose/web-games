'use strict';

// ── The Game Master ────────────────────────────────────
// What changed, and why:
//
//  · Context is BOUNDED. The old build appended every turn to one
//    array and resent the whole thing forever — cost and latency
//    grew without limit and the tail eventually fell out of the
//    window anyway. Now the model gets a compact character-sheet
//    block (who everyone is, what hurts, what helps) plus a rolling
//    window of recent prose. State survives even when the words
//    scroll away.
//
//  · Three calls per action became two. Elimination used to be a
//    separate question put to a 70B model after the fact; now the
//    narrator appends a small machine-readable block, which also
//    gives us the sheets for free.
//
//  · Triage (is this intelligible? who does it hit?) runs on a
//    small fast model, and obvious cases never leave the process.
//
//  · The narrator no longer decides outcomes. resolve.js does the
//    arithmetic and hands over a verdict to be dramatised, so the
//    cards actually govern the fiction.

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const KEY = process.env.GROQ_API_KEY;

const MODEL_NARRATE = 'llama-3.3-70b-versatile';
const MODEL_TRIAGE = 'llama-3.1-8b-instant';

const OFFLINE = !KEY;
if (OFFLINE) {
    console.warn('[ai] No GROQ_API_KEY — running with the understudy narrator.');
}

// How much prose the narrator can see behind it. Sheets carry the
// facts; this window only carries voice and continuity.
const WINDOW = 14;

const STATE_OPEN = '<<<STATE';
const STATE_CLOSE = '>>>';

const GM_SYSTEM = `You are the Game Master of a multiplayer elimination role-playing game. Players declare what their characters do; a deck of cards decides whether it works; you narrate the result.

HOW OUTCOMES ARE DECIDED
You do NOT decide whether an action succeeds. Every turn you are given a verdict — RUIN, FALTER, MIXED, SUCCESS, TRIUMPH or FATE — already worked out from the cards and from each character's condition. Narrate that verdict faithfully. Never soften a failure into a success or inflate a success. If a defender is marked as turning an action aside, it is turned aside for that defender and no other.

CONTEXT
You are given a CAST block holding every character: who they are, lasting injuries, advantages they hold, and their present condition. Treat it as true and keep it true. A character who was crippled last turn is still crippled. Gear and powers a character holds should show up when they are used.

VOICE
Write only what happens in the story. Never mention cards, values, numbers, dice, odds, verdicts, modifiers, or any machinery behind the scene. Never address the players or explain rules.
Always third person, present tense, concrete and physical. Never "you" or "your". No preamble like "As the scene unfolds".

HOW TO NAME EACH CHARACTER
The CAST block ends every line with "call:". Obey it exactly.
- "call: by name only" means that character has never stated how they wish to be referred to. Write their exact name every single time, even where it reads repetitively. Use NO pronoun for them — not he, not she, not they. Recast the sentence if you must.
- Anything else, for example "call: she/her", means use those pronouns for that character normally.
Never guess a gender for a character. A player who wants pronouns will have said so in their own description.

CONTENT
Combat can be tense and violent in outcome, but keep it clean: no gore, no dwelling on injury detail, no sexual content.

LENGTH
Two to six sentences. Prefer fewer. Stop when the moment lands.

AFTER THE PROSE
Append a state block, exactly this shape, and nothing after it:

${STATE_OPEN}
Name | is: short description | hurt: injury; injury | has: advantage; advantage | now: temporary condition | call: pronouns or -
DEAD: Name, Name
${STATE_CLOSE}

Rules for the block: one line per living character, using their exact name. Carry forward everything still true and add whatever this turn changed. Use "-" for an empty field. Keep every field under twelve words. For "call:", copy forward whatever the CAST block already says, and set it only when a player's own words established how they wish to be referred to. Include the DEAD line only when someone died this turn, and only then. Write no text after ${STATE_CLOSE}.`;

// ── Transport ──────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Groq will occasionally rate-limit or wobble; ride it out. */
async function call(body, { tries = 3, timeout = 45000 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt < tries; attempt++) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeout);
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: ac.signal,
            });
            clearTimeout(timer);

            if (res.ok) return res;

            const retryable = res.status === 429 || res.status >= 500;
            const detail = await res.text().catch(() => '');
            lastErr = new Error(`Groq ${res.status}: ${detail.slice(0, 300)}`);
            if (!retryable || attempt === tries - 1) throw lastErr;

            const hinted = Number(res.headers.get('retry-after')) * 1000;
            const backoff = hinted > 0 ? hinted : (600 * Math.pow(2, attempt));
            await sleep(backoff + Math.random() * 250);
        } catch (err) {
            clearTimeout(timer);
            lastErr = err;
            if (err.name === 'AbortError') lastErr = new Error('The Game Master took too long to answer.');
            if (attempt === tries - 1) throw lastErr;
            await sleep(500 * Math.pow(2, attempt));
        }
    }
    throw lastErr;
}

// ── Character sheets ───────────────────────────────────

const clip = (s, n) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, n);

function cleanList(raw, maxItems = 3, maxLen = 30) {
    if (!raw) return [];
    const t = String(raw).trim();
    if (!t || t === '-' || /^(none|nothing|n\/a)$/i.test(t)) return [];
    return t.split(/[;,]/)
        .map(s => clip(s, maxLen))
        .filter(s => s && !/^(none|-|nothing)$/i.test(s))
        .slice(0, maxItems);
}

/** Pull the machine-readable tail out of a narration. */
function parseState(text, names) {
    const start = text.indexOf(STATE_OPEN);
    if (start < 0) return { prose: text.trim(), sheets: null, dead: [] };

    const prose = text.slice(0, start).trim();
    let block = text.slice(start + STATE_OPEN.length);
    const end = block.indexOf(STATE_CLOSE);
    if (end >= 0) block = block.slice(0, end);

    const sheets = {};
    const dead = [];
    const known = new Map(names.map(n => [n.toLowerCase(), n]));

    for (const line of block.split('\n')) {
        const row = line.trim();
        if (!row) continue;

        const deadMatch = /^DEAD\s*:\s*(.+)$/i.exec(row);
        if (deadMatch) {
            for (const raw of deadMatch[1].split(/[,;]/)) {
                const hit = known.get(clip(raw, 40).toLowerCase());
                if (hit && !dead.includes(hit)) dead.push(hit);
            }
            continue;
        }

        const parts = row.split('|');
        const name = known.get(clip(parts[0], 40).toLowerCase());
        if (!name) continue;

        const sheet = {};
        for (const seg of parts.slice(1)) {
            const m = /^\s*([a-z]+)\s*:\s*(.*)$/i.exec(seg);
            if (!m) continue;
            const key = m[1].toLowerCase();
            if (key === 'is') sheet.character = clip(m[2], 110);
            else if (key === 'hurt') sheet.wounds = cleanList(m[2]);
            else if (key === 'has') sheet.boons = cleanList(m[2]);
            else if (key === 'now') sheet.status = cleanList(m[2], 2);
            else if (key === 'call') {
                const v = clip(m[2], 24);
                // Only ever a pronoun set — never a name or a sentence.
                sheet.calls = /^[a-z]+(\s*\/\s*[a-z]+){1,2}$/i.test(v) ? v.toLowerCase() : '';
            }
        }
        if (Object.keys(sheet).length) sheets[name] = sheet;
    }

    return { prose, sheets, dead };
}

/** The compact CAST block that replaces an ever-growing transcript. */
function castBlock(players) {
    const lines = players.map(p => {
        const s = p.sheet || {};
        const bits = [`${p.name} | is: ${s.character || 'not yet declared'}`];
        if (s.wounds?.length) bits.push(`hurt: ${s.wounds.join('; ')}`);
        if (s.boons?.length) bits.push(`has: ${s.boons.join('; ')}`);
        if (s.status?.length) bits.push(`now: ${s.status.join('; ')}`);
        if (p.eliminated) bits.push('OUT OF THE GAME');
        bits.push(`call: ${s.calls || 'by name only'}`);
        return bits.join(' | ');
    });
    return `CAST — every character in play, and what is true of each:\n${lines.join('\n')}`;
}

// ── Local screening (no API call needed) ───────────────

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Only the blatant cases: "a;owkjb;lasdjfi" and friends. */
function looksLikeNoise(text) {
    const t = text.trim();
    if (t.length < 3) return true;

    const letters = t.replace(/[^a-zA-Z]/g, '');
    if (!letters.length) return true;
    if (letters.length / t.length < 0.45) return true;

    const vowels = (letters.match(/[aeiouy]/gi) || []).length;
    if (letters.length > 5 && vowels / letters.length < 0.12) return true;

    // A single long unbroken run of consonants reads as a cat on a keyboard.
    if (/[bcdfghjklmnpqrstvwxz]{7,}/i.test(t)) return true;

    return false;
}

function trigrams(s) {
    const t = ` ${norm(s)} `;
    const out = new Set();
    for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
    return out;
}

/** Instructions.md: the same prompt twice is out; a new angle is fine. */
function isRehash(text, previous) {
    const n = norm(text);
    if (!n) return false;
    for (const old of previous) {
        if (norm(old) === n) return true;
        const a = trigrams(text), b = trigrams(old);
        if (!a.size || !b.size) continue;
        let shared = 0;
        for (const g of a) if (b.has(g)) shared++;
        if (shared / (a.size + b.size - shared) > 0.82) return true;
    }
    return false;
}

/** Names mentioned outright — the offline fallback for targeting. */
function namesIn(text, candidates) {
    const t = ` ${norm(text)} `;
    return candidates.filter(n => t.includes(` ${norm(n)} `));
}

// ── Triage ─────────────────────────────────────────────

// Worked examples beat prose rules on a small model, and getting
// targeting wrong is the worst failure this game has: a missed target
// means somebody is struck without ever being allowed to answer.
const TARGET_EXAMPLES = [
    ['OTHERS: Bram, Vex\nJUST HAPPENED: -\nKira writes: "I shove Bram off the ledge"',
     '{"ok":true,"reason":"","targets":["Bram"],"everyone":false}'],

    ['OTHERS: Bram, Vex\nJUST HAPPENED: -\nKira writes: "I climb the mast and look out to sea"',
     '{"ok":true,"reason":"","targets":[],"everyone":false}'],

    ['OTHERS: Bram, Vex\nJUST HAPPENED: -\nKira writes: "I bring the whole ceiling down on top of everyone"',
     '{"ok":true,"reason":"","targets":[],"everyone":true}'],

    ['OTHERS: Bram, Vex\nJUST HAPPENED: -\nKira writes: "I snatch the key out of Vex\'s hand and run"',
     '{"ok":true,"reason":"","targets":["Vex"],"everyone":false}'],

    ['OTHERS: Bram, Vex\nJUST HAPPENED: -\nKira writes: "I ask Bram what he saw in the hold"',
     '{"ok":true,"reason":"","targets":[],"everyone":false}'],

    ['OTHERS: Bram, Vex\nJUST HAPPENED: Bram has Kira pinned against the rail with one stone hand.\nKira writes: "I twist free and drive my knee up"',
     '{"ok":true,"reason":"","targets":["Bram"],"everyone":false}'],

    ['OTHERS: Bram, Vex\nJUST HAPPENED: -\nKira writes: "I swing at whoever is closest to me"',
     '{"ok":true,"reason":"","targets":[],"everyone":true}'],

    ['OTHERS: Bram, Vex\nJUST HAPPENED: -\nKira writes: "asdkjh a;lskdjf"',
     '{"ok":false,"reason":"That came through as noise.","targets":[],"everyone":false}'],
];

/**
 * Decides three things before any expensive call: is the message
 * intelligible, who does it strike, and has it been tried already.
 * Runs on the small model; obvious answers never leave the process.
 */
async function triage({ text, actor, others, previous, setup, existingCharacters, recent }) {
    if (looksLikeNoise(text)) {
        return { ok: false, reason: 'That came through as noise. Say it again in plain words.' };
    }
    if (!setup && isRehash(text, previous)) {
        return { ok: false, repeat: true, reason: 'That has already been tried. Come at it from another angle.' };
    }

    if (OFFLINE) {
        return { ok: true, targets: setup ? [] : namesIn(text, others) };
    }

    const system = setup
        ? `You screen inputs for a role-playing game. Reply with JSON only, matching {"ok":boolean,"reason":string,"duplicate":boolean}.
The player is describing WHO THEY ARE. Set ok=false only if the text is keyboard mashing or is not intelligible English — any character, however strange, is fine. Set duplicate=true only if this character is essentially the same being as one already taken: ${existingCharacters?.length ? existingCharacters.join(' / ') : '(none yet)'}. reason: one short sentence, only when ok=false or duplicate=true.`

        : `You screen actions for a role-playing game. Reply with JSON only, matching {"ok":boolean,"reason":string,"targets":string[],"everyone":boolean}.

Your one important job is deciding who has to defend themselves. Anyone you leave out gets no chance to react, so when it is close, include them.

targets — every OTHER character who would be struck, grabbed, blocked, chased, stolen from, tricked, endangered or otherwise acted upon against their will. Chosen only from the OTHERS list. Include a character if any reasonable player would want to react.
everyone — true when the action strikes at other characters WITHOUT naming them: an area effect, a blast, a collapse, a spell over the whole room, or "whoever is nearest". Leave targets empty in that case.
Neither — an action on the actor alone, on the surroundings, or a friendly or conversational exchange that nobody would need to defend against.
ok — false ONLY for keyboard mashing or text that is not intelligible English. Anything understandable, however fantastical, is valid.
reason — one short sentence, only when ok=false.`;

    const messages = [{ role: 'system', content: system }];

    if (!setup) {
        for (const [q, a] of TARGET_EXAMPLES) {
            messages.push({ role: 'user', content: q });
            messages.push({ role: 'assistant', content: a });
        }
    }

    // What just happened matters: "I twist free" only has a target if
    // somebody has hold of the actor.
    messages.push({
        role: 'user',
        content: setup
            ? `${actor} writes: "${text}"`
            : `OTHERS: ${others.join(', ') || '(nobody)'}\nJUST HAPPENED: ${clip(recent, 400) || '-'}\n${actor} writes: "${text}"`,
    });

    try {
        const res = await call({
            model: MODEL_TRIAGE,
            messages,
            temperature: 0,
            max_tokens: 150,
            response_format: { type: 'json_object' },
        }, { tries: 2, timeout: 12000 });

        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);

        let targets = Array.isArray(parsed.targets)
            ? [...new Set(parsed.targets
                .map(n => others.find(o => o.toLowerCase() === String(n).toLowerCase()))
                .filter(Boolean))]
            : [];

        if (parsed.everyone === true) targets = others.slice();

        return {
            ok: parsed.ok !== false,
            duplicate: !!parsed.duplicate,
            reason: clip(parsed.reason, 160),
            everyone: parsed.everyone === true,
            targets,
        };
    } catch (err) {
        // Screening must never block play. Fall back to letting it through.
        console.warn('[ai] triage failed, waving it through:', err.message);
        return { ok: true, targets: namesIn(text, others) };
    }
}

// ── Narration ──────────────────────────────────────────

/**
 * Streams a passage. `onChunk` receives display-safe text only —
 * the state block is held back and never reaches a player's screen.
 */
async function narrate({ players, history, directive, onChunk }) {
    const names = players.map(p => p.name);

    if (OFFLINE) {
        const prose = understudy(directive, players);
        for (const piece of prose.match(/.{1,24}(\s|$)/g) || [prose]) {
            onChunk?.(piece);
            await sleep(18);
        }
        return { prose, sheets: null, dead: understudyDead(directive, names) };
    }

    const messages = [
        { role: 'system', content: GM_SYSTEM },
        { role: 'system', content: castBlock(players) },
        ...history.slice(-WINDOW),
        { role: 'user', content: directive },
    ];

    const res = await call({
        model: MODEL_NARRATE,
        messages,
        temperature: 0.85,
        max_tokens: 520,
        stream: true,
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let emitted = 0;
    let cut = -1;

    const flush = () => {
        if (cut < 0) {
            const idx = full.indexOf(STATE_OPEN[0] + STATE_OPEN[1] + STATE_OPEN[2]);
            if (idx >= 0) cut = idx;
        }
        // Hold back the last couple of characters so a partial "<<"
        // is never shown and then retracted.
        const safe = cut >= 0 ? cut : Math.max(0, full.length - 3);
        if (safe > emitted) {
            onChunk?.(full.slice(emitted, safe));
            emitted = safe;
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
                const piece = JSON.parse(payload).choices?.[0]?.delta?.content;
                if (piece) full += piece;
            } catch { /* keep-alive or partial frame */ }
        }
        flush();
    }

    // Anything left that wasn't part of the state block.
    if (cut < 0 && full.length > emitted) {
        onChunk?.(full.slice(emitted));
        emitted = full.length;
    }

    const { prose, sheets, dead } = parseState(full, names);
    return { prose: prose || full.trim(), sheets, dead };
}

/** A short legend for whoever is left standing. */
async function epilogue({ players, winner, history, onChunk }) {
    if (OFFLINE) {
        const line = `And so ${winner} is the last one standing, and the tale closes on ${winner} alone.`;
        onChunk?.(line);
        return line;
    }
    try {
        const res = await call({
            model: MODEL_NARRATE,
            messages: [
                { role: 'system', content: GM_SYSTEM },
                { role: 'system', content: castBlock(players) },
                ...history.slice(-8),
                { role: 'user', content:
                    `The game is over. ${winner} is the only one left standing.\n\n` +
                    `Write the closing of this tale in exactly two sentences: what ${winner} did to survive, ` +
                    `and what ${winner} is left with now. Name ${winner}. Do not append a state block.` },
            ],
            temperature: 0.9,
            max_tokens: 170,
            stream: true,
        }, { tries: 2, timeout: 25000 });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', full = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith('data:')) continue;
                const payload = t.slice(5).trim();
                if (payload === '[DONE]') continue;
                try {
                    const piece = JSON.parse(payload).choices?.[0]?.delta?.content;
                    if (piece) { full += piece; onChunk?.(piece); }
                } catch {}
            }
        }
        return full.trim();
    } catch {
        const line = `${winner} is the last one standing.`;
        onChunk?.(line);
        return line;
    }
}

// ── Understudy ─────────────────────────────────────────
// Used when no API key is configured, and by the test harness. Not
// clever, but it keeps the game playable and the rules visible.

function understudy(directive, players) {
    const actor = /ACTOR:\s*(.+)/.exec(directive)?.[1]?.trim();
    const declares = /DECLARES:\s*"([^"]*)"/.exec(directive)?.[1] || 'something';
    const band = /OUTCOME:\s*([A-Z]+)/.exec(directive)?.[1];

    if (/^SETUP/.test(directive)) {
        const who = /BECOMES:\s*"([^"]*)"/.exec(directive)?.[1] || 'a stranger';
        return `${actor} steps into the light: ${who}. The table takes ${actor}'s measure and says nothing.`;
    }

    // A counter exchange: report each answer as the cards ruled it.
    if (/^THE ANSWERS:/m.test(directive)) {
        const mover = /^(\w[\w '-]*) moves against/m.exec(directive)?.[1] || 'Someone';
        const force = /^FORCE:\s*([A-Z]+)/m.exec(directive)?.[1] || 'MIXED';
        const held = [], struck = [];
        const re = /- ([^\n]+?) answers: "([^"]*)"\n\s*card:[^\n]*→ (TURNS IT ASIDE|FAILS)/g;
        let m;
        while ((m = re.exec(directive))) {
            (m[3] === 'TURNS IT ASIDE' ? held : struck).push({ name: m[1], said: m[2] });
        }
        const out = [];
        if (struck.length) {
            const heavy = force === 'TRIUMPH' || force === 'FATE';
            out.push(`${mover} comes at ${struck.map(s => s.name).join(' and ')}, and it lands${heavy ? ' with everything behind it' : ''}.`);
        }
        for (const h of held) {
            out.push(`${h.name} meets it — ${h.said} — and ${mover}'s move comes to nothing against ${h.name}.`);
        }
        if (!out.length) out.push(`${mover} moves, and the moment closes over it.`);
        return out.join(' ');
    }

    if (!actor) {
        const first = players[0]?.name || 'Someone';
        return `The moment turns, and ${first} is left to make sense of it.`;
    }

    const lines = {
        RUIN: `${actor} tries to ${declares.toLowerCase()}, and it goes wrong at once. ${actor} is left worse off than before.`,
        FALTER: `${actor} tries to ${declares.toLowerCase()}. Almost none of it lands, though ${actor} salvages a scrap of the intent.`,
        MIXED: `${actor} manages part of it. ${actor} gets what was wanted and pays for it in the same breath.`,
        SUCCESS: `${actor} does exactly what ${actor} set out to do, cleanly.`,
        TRIUMPH: `It works better than ${actor} could have hoped, and everyone at the table sees it.`,
        FATE: `Something turns over. What ${actor} intended happens, but not in any shape ${actor} would have chosen.`,
    };
    return lines[band] || lines.MIXED;
}

/**
 * The understudy needs SOME way for a game to end. A move that lands
 * with overwhelming force kills whoever failed to turn it aside.
 * Only ever used when there is no narrator to make the call.
 */
function understudyDead(directive, names) {
    if (!/^FORCE:\s*(TRIUMPH|FATE)/m.test(directive)) return [];
    const dead = [];
    const re = /action lands on ([^\n.]+)/g;
    let m;
    while ((m = re.exec(directive))) {
        const target = m[1].trim().replace(/[.,;]+$/, '');
        const name = names.find(n => n.toLowerCase() === target.toLowerCase());
        if (name && !dead.includes(name)) dead.push(name);
    }
    return dead;
}

module.exports = {
    triage, narrate, epilogue,
    castBlock, parseState, looksLikeNoise, isRehash, namesIn,
    GM_SYSTEM, OFFLINE, WINDOW,
};
