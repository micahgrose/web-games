'use strict';

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const compression = require('compression');
const { Server } = require('socket.io');

const { Deck, cardValue } = require('./lib/deck');
const R = require('./lib/resolve');
const ai = require('./lib/ai');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });

// ── Constants ──────────────────────────────────────────
const SEAT_COLOURS = [
    '#d9483c', // garnet
    '#34a891', // jade
    '#5b8dd9', // sapphire
    '#8fae4a', // moss
    '#e0a83c', // amber
    '#a87bd6', // amethyst
    '#d472ab', // orchid
    '#ded06a', // topaz
    '#2f8fb0', // deep cyan
    '#9aa8bc', // pewter
];

const MAX_TEXT = 400;
const TURN_MS = 120000;
const COUNTER_MS = 80000;
const ACT_COOLDOWN = 400;
const PLAYER_VOTE_MS = 30000;
const SPECTATOR_VOTE_MS = 15000;

// How long to leave the ending alone before offering another round.
// Scaled to how much there is to read: the closing passage still has
// to type itself out, and then somebody has to actually read it.
const READ_MS_PER_CHAR = 34;
const VOTE_DELAY_MIN = 9000;
const VOTE_DELAY_MAX = 50000;

const rooms = new Map();

// ── Small helpers ──────────────────────────────────────
const clip = (s, n = MAX_TEXT) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Players choose this at the lobby, so the story never has to guess. */
const pronounsFor = (gender) =>
    (String(gender).toLowerCase() === 'female' ? 'she/her' : 'he/him');

function roomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id;
    do {
        id = '';
        for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
    } while (rooms.has(id));
    return id;
}

const alive = (room) => room.players.filter(p => !p.eliminated);
const byId = (room, id) => room.players.find(p => p.id === id);
const current = (room) => byId(room, room.currentId);

/** Seat order, skipping the fallen. */
function nextAlive(room, afterId) {
    const living = alive(room);
    if (!living.length) return null;
    const idx = room.players.findIndex(p => p.id === afterId);
    for (let step = 1; step <= room.players.length; step++) {
        const p = room.players[(idx + step + room.players.length) % room.players.length];
        if (p && !p.eliminated) return p.id;
    }
    return living[0].id;
}

function publicPlayers(room) {
    return room.players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        eliminated: p.eliminated,
        character: p.sheet.character || '',
        wounds: p.sheet.wounds || [],
        boons: p.sheet.boons || [],
        status: p.sheet.status || [],
    }));
}

function lobbyList() {
    const out = [];
    for (const [id, room] of rooms) {
        if (!room.isPublic) continue;
        out.push({
            id,
            playerCount: room.players.length,
            maxPlayers: room.maxPlayers,
            spectatorCount: room.spectators.length,
            alivePlayers: alive(room).length,
            status: room.started ? 'in-play' : 'open',
        });
    }
    return out;
}

const pushLobby = () => io.emit('rooms', lobbyList());

function sendPlayers(room) {
    io.to(room.id).emit('players', {
        players: publicPlayers(room),
        hostId: room.hostId,
        currentId: room.currentId,
        spectatorCount: room.spectators.length,
    });
}

function sendSheets(room) {
    const sheets = {};
    for (const p of room.players) {
        sheets[p.id] = {
            character: p.sheet.character || '',
            wounds: p.sheet.wounds || [],
            boons: p.sheet.boons || [],
            status: p.sheet.status || [],
            eliminated: p.eliminated,
        };
    }
    io.to(room.id).emit('sheets', { sheets });
}

// ── Turn clock ─────────────────────────────────────────
// Somebody always wanders off. Without this the table waits forever.

function clearClock(room) {
    if (room.clock) { clearTimeout(room.clock); room.clock = null; }
    room.deadline = 0;
}

function setClock(room, ms, onExpire) {
    clearClock(room);
    room.deadline = Date.now() + ms;
    room.clock = setTimeout(() => {
        room.clock = null;
        if (!rooms.has(room.id)) return;
        try { onExpire(); } catch (err) { console.error('[clock]', err); }
    }, ms);
}

const clockLeft = (room) => (room.deadline ? Math.max(0, room.deadline - Date.now()) : 0);

function beginTurn(room, { setup = false, announce = true } = {}) {
    const p = current(room);
    if (!p) return;
    room.setupTurn = setup;
    setClock(room, TURN_MS, () => onTurnExpired(room, p.id));

    io.to(room.id).emit('turn', {
        currentId: p.id,
        setup,
        players: publicPlayers(room),
        deadlineIn: clockLeft(room),
    });

    if (setup && announce) {
        io.to(room.id).emit('ask', { text: `${p.name}, who are you? Describe your character.` });
    }
}

function onTurnExpired(room, playerId) {
    if (!room.started || room.over) return;
    if (room.currentId !== playerId || room.busy || room.pending) return;
    const p = byId(room, playerId);
    if (!p) return;
    io.to(room.id).emit('note', { text: `${p.name} lets the moment pass.` });
    room.currentId = nextAlive(room, playerId);
    beginTurn(room, { setup: !room.setupDone.has(room.currentId) });
}

// ── Narration plumbing ─────────────────────────────────

/** Push a narration to the table, streaming it as it is written. */
async function tell(room, directive, { historyLabel } = {}) {
    io.to(room.id).emit('gmStart', {});
    let result;
    try {
        result = await ai.narrate({
            players: room.players.map(p => ({ ...p, sheet: p.sheet })),
            history: room.history,
            directive,
            onChunk: (chunk) => io.to(room.id).emit('gm', { chunk }),
        });
    } finally {
        io.to(room.id).emit('gmEnd', {});
    }

    // Rolling window of prose, so the narrator keeps its voice
    // without us resending the whole game every turn.
    room.history.push({ role: 'user', content: historyLabel || directive });
    room.history.push({ role: 'assistant', content: result.prose });
    while (room.history.length > ai.WINDOW) room.history.shift();

    applySheets(room, result.sheets);
    return result;
}

function applySheets(room, sheets) {
    if (!sheets) return;
    for (const p of room.players) {
        const s = sheets[p.name];
        if (!s) continue;
        if (s.character) p.sheet.character = s.character;
        if (s.wounds) p.sheet.wounds = s.wounds;
        if (s.boons) p.sheet.boons = s.boons;
        if (s.status) p.sheet.status = s.status;
        // The player chose their own pronouns at the lobby; the
        // narrator does not get a vote on them.
        if (s.calls && !p.sheet.calls) p.sheet.calls = s.calls;
    }
}

/** Last-ditch death detection for a narrator that skipped the block. */
function deathsInProse(room, prose) {
    const found = [];
    for (const p of alive(room)) {
        const n = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${n}\\b[^.!?]{0,60}?\\b(is dead|is killed|is slain|dies|lies dead)\\b`, 'i');
        if (re.test(prose)) found.push(p.name);
    }
    return found;
}

function eliminate(room, names) {
    const hit = [];
    for (const name of names || []) {
        const p = room.players.find(x => x.name === name && !x.eliminated);
        if (!p) continue;
        p.eliminated = true;
        hit.push(p.name);
    }
    if (hit.length) {
        io.to(room.id).emit('out', { names: hit, players: publicPlayers(room) });
    }
    return hit;
}

/** After any resolution: are we done, or whose turn is it? */
async function afterResolution(room, actorId) {
    sendSheets(room);

    if (alive(room).length <= 1) {
        await endGame(room);
        return;
    }
    room.currentId = nextAlive(room, actorId);
    beginTurn(room, { setup: !room.setupDone.has(room.currentId) });
}

/** The last two passages plus the closing — everything still unread. */
function endingLength(room, epilogueText) {
    const tail = room.history
        .filter(h => h.role === 'assistant')
        .slice(-2)
        .reduce((n, h) => n + h.content.length, 0);
    return tail + (epilogueText ? epilogueText.length : 0);
}

function readingDelay(chars) {
    return Math.min(VOTE_DELAY_MAX, Math.max(VOTE_DELAY_MIN, 4000 + chars * READ_MS_PER_CHAR));
}

async function endGame(room) {
    room.over = true;
    clearClock(room);
    const winner = alive(room)[0];

    io.to(room.id).emit('over', {
        winnerName: winner?.name || null,
        players: publicPlayers(room),
        spectatorCount: room.spectators.length,
    });
    pushLobby();

    let closing = '';
    if (winner) {
        try {
            closing = await ai.epilogue({
                players: room.players,
                winner: winner.name,
                history: room.history,
                onChunk: (chunk) => io.to(room.id).emit('epilogue', { chunk }),
            });
        } catch (err) {
            console.warn('[ai] epilogue failed:', err.message);
        }
    }
    scheduleVote(room, readingDelay(endingLength(room, closing)));
}

// ── Acting ─────────────────────────────────────────────

async function handleSetup(room, player, text) {
    const others = room.players.filter(p => p.id !== player.id);
    const taken = others.map(p => p.sheet.character).filter(Boolean);

    const verdict = await ai.triage({
        text, actor: player.name, others: others.map(p => p.name),
        previous: [], setup: true, existingCharacters: taken,
    });

    if (!verdict.ok || verdict.duplicate) {
        io.to(room.id).emit('said', { name: player.name, color: player.color, text });
        io.to(player.id).emit('nope', {
            reason: verdict.reason || (verdict.duplicate
                ? 'Someone at this table is already that. Be something else.'
                : 'That did not read as a character. Try again in plain words.'),
            deadlineIn: TURN_MS,
        });
        setClock(room, TURN_MS, () => onTurnExpired(room, player.id));
        return;
    }

    player.sheet.character = clip(text, 110);
    room.setupDone.add(player.id);
    io.to(room.id).emit('said', { name: player.name, color: player.color, text });

    // The card rules on how well this character comes into being. A
    // strong arrival brings an advantage, a poor one a flaw, and
    // either way it is real for the rest of the game.
    const card = room.deck.draw();
    const shuffled = room.deck.reshuffled;
    const arrival = R.resolveSetup(card);

    io.to(room.id).emit('draw', {
        card, deckCount: room.deck.count, shuffled, band: arrival.band,
    });

    await tell(room, R.setupDirective(player.name, text, arrival),
        { historyLabel: `${player.name} enters as: ${text}` });

    sendSheets(room);
    room.currentId = nextAlive(room, player.id);
    beginTurn(room, { setup: !room.setupDone.has(room.currentId) });
}

/** The last thing the narrator said — context for "I twist free". */
function lastNarration(room) {
    for (let i = room.history.length - 1; i >= 0; i--) {
        if (room.history[i].role === 'assistant') return room.history[i].content;
    }
    return '';
}

async function handleAction(room, player, text) {
    const others = alive(room).filter(p => p.id !== player.id);

    const verdict = await ai.triage({
        text,
        actor: player.name,
        others: others.map(p => p.name),
        previous: player.previous,
        setup: false,
        recent: lastNarration(room),
    });

    io.to(room.id).emit('said', { name: player.name, color: player.color, text });

    if (!verdict.ok) {
        io.to(player.id).emit('nope', {
            reason: verdict.reason || 'That did not come through. Try saying it another way.',
            deadlineIn: TURN_MS,
        });
        setClock(room, TURN_MS, () => onTurnExpired(room, player.id));
        return;
    }

    player.previous.push(text);
    if (player.previous.length > 12) player.previous.shift();

    const targets = others.filter(p => verdict.targets.includes(p.name));

    if (targets.length) {
        openCounter(room, player, text, targets);
        return;
    }

    // Nobody else is in the way: one card settles it.
    const card = room.deck.draw();
    const shuffled = room.deck.reshuffled;
    const res = R.resolveSolo(card, player.sheet);

    io.to(room.id).emit('draw', {
        card, deckCount: room.deck.count, shuffled, band: res.band,
    });

    const out = await tell(room, R.soloDirective(player.name, text, res),
        { historyLabel: `${player.name}: ${text}` });

    const dead = out.sheets ? out.dead : [...new Set([...out.dead, ...deathsInProse(room, out.prose)])];
    eliminate(room, dead);
    await afterResolution(room, player.id);
}

// ── The counter phase ──────────────────────────────────
// Instructions.md: everyone struck gets to say how they meet it,
// then every card is dealt in the same breath.

function openCounter(room, attacker, text, targets) {
    room.pending = {
        attackerId: attacker.id,
        attackerName: attacker.name,
        attackerText: text,
        targetIds: targets.map(t => t.id),
        answers: new Map(),
    };

    setClock(room, COUNTER_MS, () => {
        const p = room.pending;
        if (!p) return;
        for (const id of p.targetIds) {
            if (!p.answers.has(id)) {
                p.answers.set(id, 'stands frozen, caught unprepared');
            }
        }
        resolveCounter(room).catch(err => failRoom(room, err));
    });

    io.to(room.id).emit('counter', {
        attackerName: attacker.name,
        attackerColor: attacker.color,
        attackerText: text,
        targetIds: room.pending.targetIds,
        targetNames: targets.map(t => t.name),
        deadlineIn: clockLeft(room),
    });
}

async function resolveCounter(room) {
    const p = room.pending;
    if (!p || room.busy) return;
    room.busy = true;
    room.pending = null;
    clearClock(room);

    try {
        const attacker = byId(room, p.attackerId);
        const defenders = p.targetIds
            .map(id => byId(room, id))
            .filter(d => d && !d.eliminated);

        if (!attacker || attacker.eliminated || !defenders.length) {
            io.to(room.id).emit('counterOff', { reason: 'The moment passes.' });
            room.busy = false;
            if (!room.over) {
                room.currentId = nextAlive(room, p.attackerId);
                beginTurn(room, { setup: !room.setupDone.has(room.currentId) });
            }
            return;
        }

        // Every card at once, so nobody's fate is read before another's.
        const cards = room.deck.drawMany(defenders.length + 1);
        const shuffled = room.deck.reshuffled;

        const res = R.resolveCounter(
            { card: cards[0], sheet: attacker.sheet },
            defenders.map((d, i) => ({
                id: d.id, name: d.name, sheet: d.sheet, card: cards[i + 1],
                text: p.answers.get(d.id) || 'does nothing',
            })),
        );

        io.to(room.id).emit('clash', {
            deckCount: room.deck.count,
            shuffled,
            cards: [
                {
                    playerName: attacker.name, playerColor: attacker.color,
                    card: cards[0], value: res.attacker.eff, beaten: null,
                },
                ...res.defenders.map(d => {
                    const who = byId(room, d.id);
                    return {
                        playerName: d.name, playerColor: who?.color,
                        card: d.card, value: d.eff, beaten: d.beaten,
                    };
                }),
            ],
        });

        const out = await tell(room,
            R.counterDirective(attacker.name, p.attackerText, res),
            { historyLabel: `${attacker.name} moves against ${defenders.map(d => d.name).join(' and ')}` });

        const dead = out.sheets ? out.dead : [...new Set([...out.dead, ...deathsInProse(room, out.prose)])];
        eliminate(room, dead);
        room.busy = false;
        await afterResolution(room, attacker.id);
    } catch (err) {
        room.busy = false;
        failRoom(room, err);
    }
}

function failRoom(room, err) {
    console.error('[room]', room.id, err);
    io.to(room.id).emit('error:gm', {
        message: 'The Game Master lost the thread. Try that again.',
        deadlineIn: TURN_MS,
    });
    const p = current(room);
    if (p && room.started && !room.over) {
        setClock(room, TURN_MS, () => onTurnExpired(room, p.id));
    }
}

// ── Rematch voting ─────────────────────────────────────

function clearVote(room) {
    if (room.voteTimer) { clearTimeout(room.voteTimer); room.voteTimer = null; }
}

function scheduleVote(room, delayMs) {
    clearVote(room);
    room.voteTimer = setTimeout(() => {
        if (!rooms.has(room.id) || room.votePhase) return;
        startPlayerVote(room);
    }, delayMs ?? VOTE_DELAY_MIN);
}

function startPlayerVote(room) {
    clearVote(room);
    room.votePhase = 'players';
    room.votes = new Map(room.players.map(p => [p.id, null]));
    room.accepted = [];
    room.voteTimer = setTimeout(() => finishPlayerVote(room), PLAYER_VOTE_MS);
    io.to(room.id).emit('vote', { phase: 'players', timeoutMs: PLAYER_VOTE_MS });
}

function finishPlayerVote(room) {
    if (room.votePhase !== 'players') return;
    clearVote(room);
    const accepted = room.accepted.slice();
    const slots = room.maxPlayers - accepted.length;

    if (slots > 0 && room.spectators.length) {
        room.votePhase = 'spectators';
        room.carried = accepted;
        room.slots = slots;
        room.accepted = [];
        room.votes = new Map(room.spectators.map(s => [s.id, null]));
        room.voteTimer = setTimeout(() => finishSpectatorVote(room), SPECTATOR_VOTE_MS);
        io.to(room.id).emit('vote', { phase: 'spectators', slots, timeoutMs: SPECTATOR_VOTE_MS });
        return;
    }

    room.votePhase = null;
    launchRematch(room, accepted);
}

function finishSpectatorVote(room) {
    if (room.votePhase !== 'spectators') return;
    clearVote(room);
    const all = [...(room.carried || []), ...room.accepted];
    room.votePhase = null;
    room.carried = null;
    launchRematch(room, all);
}

function launchRematch(room, ids) {
    // Never seat more than the table holds — latest arrivals lose out.
    const seated = ids.slice(0, room.maxPlayers);

    if (seated.length < 2) {
        io.to(room.id).emit('voteOff', { reason: 'Not enough players for another round.' });
        return;
    }

    const pool = [...room.players, ...room.spectators];
    const ordered = seated.map(id => pool.find(p => p.id === id)).filter(Boolean);
    const promotedIds = ordered
        .filter(p => room.spectators.some(s => s.id === p.id))
        .map(p => p.id);

    // Anyone who sat out goes back to the lobby properly, rather than
    // lingering in the room quietly receiving a game they left.
    const staying = new Set([...seated, ...room.spectators.map(s => s.id)]);
    for (const p of room.players) {
        if (staying.has(p.id)) continue;
        const sock = io.sockets.sockets.get(p.id);
        if (!sock) continue;
        sock.leave(room.id);
        sock.data.roomId = null;
        sock.data.spectator = false;
        sock.emit('left', {});
    }

    room.spectators = room.spectators.filter(s => !promotedIds.includes(s.id));
    for (const id of promotedIds) {
        const sock = io.sockets.sockets.get(id);
        if (sock) sock.data.spectator = false;
    }

    room.players = ordered.map((p, i) => ({
        id: p.id,
        name: p.name,
        color: SEAT_COLOURS[i % SEAT_COLOURS.length],
        eliminated: false,
        calls: p.calls,
        // Everything else resets for the new game; how somebody is
        // spoken of does not.
        sheet: { character: '', wounds: [], boons: [], status: [], calls: p.calls },
        previous: [],
    }));

    room.hostId = room.players[0].id;
    room.deck = new Deck();
    room.started = true;
    room.over = false;
    room.busy = false;
    room.pending = null;
    room.setupDone = new Set();
    room.history = [];
    room.currentId = room.players[0].id;
    room.votes = null;
    room.accepted = [];
    room.carried = null;

    io.to(room.id).emit('newGame', {
        players: publicPlayers(room),
        hostId: room.hostId,
        acceptedIds: room.players.map(p => p.id),
        promotedIds,
        currentId: room.currentId,
        deckCount: room.deck.count,
        spectatorCount: room.spectators.length,
    });

    beginTurn(room, { setup: true });
    pushLobby();
}

// ── Leaving ────────────────────────────────────────────

function dropFromRoom(room, socket, { voluntary }) {
    const wasCurrent = room.currentId === socket.id;

    if (socket.data.spectator) {
        room.spectators = room.spectators.filter(s => s.id !== socket.id);
        sendPlayers(room);
        pushLobby();
        return;
    }

    const player = byId(room, socket.id);
    if (!player) return;

    if (room.started && !room.over) {
        io.to(room.id).emit('note', {
            text: `${player.name} ${voluntary ? 'leaves the table' : 'vanishes from the table'}.`,
        });
    }

    room.players = room.players.filter(p => p.id !== socket.id);
    room.votes?.delete(socket.id);
    room.accepted = (room.accepted || []).filter(id => id !== socket.id);

    if (!room.players.length) {
        clearClock(room);
        clearVote(room);
        rooms.delete(room.id);
        pushLobby();
        return;
    }

    if (room.hostId === socket.id) room.hostId = room.players[0].id;

    // If they were mid-counter, keep the exchange coherent.
    if (room.pending) {
        const p = room.pending;
        if (p.attackerId === socket.id) {
            room.pending = null;
            clearClock(room);
            io.to(room.id).emit('counterOff', { reason: 'The one who moved is gone. The moment passes.' });
            if (room.started && !room.over) {
                room.currentId = nextAlive(room, socket.id);
                beginTurn(room, { setup: !room.setupDone.has(room.currentId) });
            }
        } else if (p.targetIds.includes(socket.id)) {
            p.targetIds = p.targetIds.filter(id => id !== socket.id);
            p.answers.delete(socket.id);
            if (!p.targetIds.length) {
                room.pending = null;
                clearClock(room);
                io.to(room.id).emit('counterOff', { reason: 'Everyone struck at is gone. The moment passes.' });
                if (room.started && !room.over) {
                    room.currentId = nextAlive(room, socket.id);
                    beginTurn(room, { setup: !room.setupDone.has(room.currentId) });
                }
            } else if (p.targetIds.every(id => p.answers.has(id))) {
                resolveCounter(room).catch(err => failRoom(room, err));
            }
        }
    }

    sendPlayers(room);

    if (room.started && !room.over) {
        if (alive(room).length <= 1) {
            endGame(room).catch(err => console.error(err));
        } else if (wasCurrent && !room.pending && !room.busy) {
            room.currentId = nextAlive(room, socket.id);
            beginTurn(room, { setup: !room.setupDone.has(room.currentId) });
        }
    }
    pushLobby();
}

// ── Sockets ────────────────────────────────────────────

io.on('connection', (socket) => {
    socket.data.spectator = false;
    socket.data.lastAct = 0;
    socket.emit('rooms', lobbyList());

    const myRoom = () => rooms.get(socket.data.roomId);

    socket.on('rooms:get', () => socket.emit('rooms', lobbyList()));

    socket.on('room:create', ({ name, gender, isPublic, maxPlayers } = {}) => {
        if (socket.data.roomId) return;
        const playerName = clip(name, 24);
        if (!playerName) return socket.emit('joinError', { message: 'Pick a name first.' });
        const calls = pronounsFor(gender);

        const id = roomCode();
        const room = {
            id,
            hostId: socket.id,
            isPublic: !!isPublic,
            maxPlayers: Math.min(10, Math.max(2, parseInt(maxPlayers, 10) || 10)),
            players: [{
                id: socket.id, name: playerName, color: SEAT_COLOURS[0], eliminated: false,
                calls,
                sheet: { character: '', wounds: [], boons: [], status: [], calls }, previous: [],
            }],
            spectators: [],
            deck: new Deck(),
            started: false,
            over: false,
            busy: false,
            currentId: null,
            setupTurn: false,
            setupDone: new Set(),
            pending: null,
            history: [],
            clock: null,
            deadline: 0,
            voteTimer: null,
            votePhase: null,
        };

        rooms.set(id, room);
        socket.join(id);
        socket.data.roomId = id;

        socket.emit('joined', {
            roomId: id, playerId: socket.id, players: publicPlayers(room),
            hostId: room.hostId, isPublic: room.isPublic, maxPlayers: room.maxPlayers,
            started: false, spectator: false,
        });
        pushLobby();
    });

    socket.on('room:join', ({ code, name, gender } = {}) => {
        if (socket.data.roomId) return;
        const playerName = clip(name, 24);
        const room = rooms.get(String(code || '').toUpperCase());
        if (!room) return socket.emit('joinError', { message: 'No table with that code.' });
        if (!playerName) return socket.emit('joinError', { message: 'Pick a name first.' });
        const calls = pronounsFor(gender);

        const clash = [...room.players, ...room.spectators]
            .some(p => p.name.toLowerCase() === playerName.toLowerCase());
        if (clash) return socket.emit('joinError', { message: 'Somebody at that table already goes by that name.' });

        if (room.started) {
            if (!room.isPublic) return socket.emit('joinError', { message: 'That game is already under way.' });
            // Watchers carry their pronouns too — they may be seated next game.
            room.spectators.push({ id: socket.id, name: playerName, calls });
            socket.join(room.id);
            socket.data.roomId = room.id;
            socket.data.spectator = true;

            socket.emit('joined', {
                roomId: room.id, playerId: socket.id, players: publicPlayers(room),
                hostId: room.hostId, isPublic: room.isPublic, maxPlayers: room.maxPlayers,
                started: true, spectator: true,
                deckCount: room.deck.count, drawnCard: null,
                currentId: room.currentId, deadlineIn: clockLeft(room),
                spectatorCount: room.spectators.length,
            });
            sendPlayers(room);
            sendSheets(room);
            pushLobby();
            return;
        }

        if (room.players.length >= room.maxPlayers) {
            return socket.emit('joinError', { message: `That table is full (${room.maxPlayers} seats).` });
        }

        room.players.push({
            id: socket.id, name: playerName,
            color: SEAT_COLOURS[room.players.length % SEAT_COLOURS.length],
            eliminated: false,
            calls,
            sheet: { character: '', wounds: [], boons: [], status: [], calls },
            previous: [],
        });
        socket.join(room.id);
        socket.data.roomId = room.id;

        socket.emit('joined', {
            roomId: room.id, playerId: socket.id, players: publicPlayers(room),
            hostId: room.hostId, isPublic: room.isPublic, maxPlayers: room.maxPlayers,
            started: false, spectator: false,
        });
        sendPlayers(room);
        pushLobby();
    });

    socket.on('game:start', () => {
        const room = myRoom();
        if (!room || room.hostId !== socket.id || room.started) return;
        if (room.players.length < 2) {
            return socket.emit('joinError', { message: 'Two players at least.' });
        }
        room.started = true;
        room.currentId = room.players[0].id;

        io.to(room.id).emit('started', {
            players: publicPlayers(room),
            currentId: room.currentId,
            deckCount: room.deck.count,
        });
        beginTurn(room, { setup: true });
        pushLobby();
    });

    socket.on('act', async ({ text } = {}) => {
        const room = myRoom();
        if (!room || !room.started || room.over || socket.data.spectator) return;
        if (room.busy || room.pending) return;
        if (room.currentId !== socket.id) return;

        // Anti-spam, but never a silent drop: a swallowed action
        // would leave the player staring at an empty box.
        const now = Date.now();
        if (now - socket.data.lastAct < ACT_COOLDOWN) {
            return socket.emit('nope', {
                reason: 'One thing at a time.',
                deadlineIn: clockLeft(room) || TURN_MS,
            });
        }
        socket.data.lastAct = now;

        const player = byId(room, socket.id);
        if (!player || player.eliminated) return;

        const body = clip(text);
        if (!body) return;

        room.busy = true;
        clearClock(room);
        try {
            if (!room.setupDone.has(socket.id)) await handleSetup(room, player, body);
            else await handleAction(room, player, body);
        } catch (err) {
            failRoom(room, err);
        } finally {
            room.busy = false;
        }
    });

    socket.on('counter', ({ text } = {}) => {
        const room = myRoom();
        if (!room?.pending) return;
        const p = room.pending;
        if (!p.targetIds.includes(socket.id) || p.answers.has(socket.id)) return;

        const player = byId(room, socket.id);
        if (!player) return;
        const body = clip(text);
        if (!body) return;

        p.answers.set(socket.id, body);
        const remaining = p.targetIds.filter(id => !p.answers.has(id)).length;

        io.to(room.id).emit('counterIn', {
            name: player.name, color: player.color, text: body, remaining,
        });

        if (!remaining) resolveCounter(room).catch(err => failRoom(room, err));
    });

    socket.on('typing', ({ on } = {}) => {
        const room = myRoom();
        if (!room || socket.data.spectator) return;
        const player = byId(room, socket.id);
        if (!player) return;
        socket.to(room.id).emit('typing', { name: player.name, color: player.color, on: !!on });
    });

    socket.on('newgame:request', () => {
        const room = myRoom();
        if (!room || !room.started || room.votePhase) return;
        if (room.hostId !== socket.id) return;
        startPlayerVote(room);
    });

    socket.on('newgame:vote', ({ accept } = {}) => {
        const room = myRoom();
        if (!room?.votes || !room.votes.has(socket.id)) return;
        room.votes.set(socket.id, !!accept);

        if (accept && !room.accepted.includes(socket.id)) {
            const cap = room.votePhase === 'spectators' ? room.slots : room.maxPlayers;
            if (room.accepted.length < cap) room.accepted.push(socket.id);
        }

        const everyone = [...room.votes.values()].every(v => v !== null);
        const full = room.votePhase === 'spectators' && room.accepted.length >= room.slots;

        if (everyone || full) {
            if (room.votePhase === 'players') finishPlayerVote(room);
            else finishSpectatorVote(room);
        }
    });

    socket.on('leave', () => {
        const room = myRoom();
        socket.emit('left', {});
        if (room) dropFromRoom(room, socket, { voluntary: true });
        socket.leave(socket.data.roomId);
        socket.data.roomId = null;
        socket.data.spectator = false;
    });

    socket.on('disconnect', () => {
        const room = myRoom();
        if (room) dropFromRoom(room, socket, { voluntary: false });
        socket.data.roomId = null;
    });
});

// ── Serve ──────────────────────────────────────────────
// Fonts are content-addressed enough to cache hard; everything else
// is revalidated every load, so a fix is one refresh away rather than
// one hour away.
// The court cards are ~130 KB of SVG each. As text they compress to a
// fraction of that, so gzip earns its keep here more than anywhere.
app.use(compression());

app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts'), {
    maxAge: '30d', immutable: true,
}));
app.use(express.static(path.join(__dirname, 'public'), {
    etag: true,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
    server.listen(PORT, () => console.log(`Card Role Play — http://localhost:${PORT}`));
}

module.exports = { app, server, io, rooms, readingDelay, endingLength, applySheets };
