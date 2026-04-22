require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const playerColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];

const rooms = new Map();

function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

function createDeck() {
    return suits.flatMap(suit => ranks.map(rank => ({ rank, suit })));
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function getCardValue(card) {
    if (!card) return 0;
    switch (card.rank) {
        case 'A': return 14; case 'J': return 11; case 'Q': return 12; case 'K': return 13;
        default: return Number(card.rank) || 0;
    }
}

function nextAliveIndex(players, currentIndex) {
    let next = (currentIndex + 1) % players.length;
    for (let i = 0; i < players.length; i++) {
        if (!players[next].eliminated) return next;
        next = (next + 1) % players.length;
    }
    return currentIndex;
}

function countAlive(players) {
    return players.filter(p => !p.eliminated).length;
}

function getPublicRoomsData() {
    const result = [];
    for (const [id, room] of rooms) {
        if (!room.isPublic) continue;
        result.push({
            id,
            playerCount: room.players.length,
            maxPlayers: room.maxPlayers,
            spectatorCount: room.spectators.length,
            alivePlayers: room.players.filter(p => !p.eliminated).length,
            status: room.started ? 'in-play' : 'open'
        });
    }
    return result;
}

function broadcastPublicRooms() {
    io.emit('public-rooms-updated', getPublicRoomsData());
}

function startNewGame(room, acceptedIds) {
    const acceptedSet = new Set(acceptedIds);
    const acceptedPlayers = room.players.filter(p => acceptedSet.has(p.id));

    // Promote waiting spectators to fill remaining slots
    const slotsRemaining = room.maxPlayers - acceptedPlayers.length;
    const promoted = room.spectators.slice(0, Math.max(0, slotsRemaining));
    const promotedIds = promoted.map(s => s.id);
    room.spectators = room.spectators.filter(s => !promotedIds.includes(s.id));

    room.players = [...acceptedPlayers, ...promoted].map((p, i) => ({
        id: p.id, name: p.name, color: playerColors[i], eliminated: false
    }));

    // Update socket state for promoted spectators
    for (const pid of promotedIds) {
        const s = io.sockets.sockets.get(pid);
        if (s) s.data.isSpectator = false;
    }

    room.deck = shuffleDeck(shuffleDeck(shuffleDeck(createDeck())));
    room.currentPlayerIndex = 0;
    room.lastDrawnCard = null;
    room.started = true;
    room.newGameVotes = null;
    room.playerSetupDone = new Set();
    room.pendingAction = null;
    room.conversationHistory = [
        {
            role: 'system',
            content: "You are the Game Master of a multiplayer elimination role-playing game. Each player controls a unique character with abilities, equipment, wounds, and status that evolve throughout the game.\n\nCARD VALUE RULES:\n- 2-4: Complete failure, may backfire.\n- 5-7: Mostly fails, minor partial effect.\n- 8-10: Mixed outcome.\n- 11-12: Clear success.\n- 13-14: Outstanding success.\n- For counter actions: if a defender's card value exceeds the attacker's, that defender's counter succeeds for them only. Resolve each defender independently.\n- Context matters: wounded/debuffed characters need higher values; characters with powerful gear or abilities can succeed with lower values.\n\nCONTEXT TRACKING: Remember each character's wounds, fatigue, equipment, special abilities, and buffs/debuffs from all previous turns. Factor these into every outcome.\n\nRETRY: Use [RETRY] ONLY in two cases: (1) the message is pure keyboard mashing or completely unintelligible English — any understandable action, no matter how weird or fantastical, must be played out; (2) the action is word-for-word identical to a very recent previous attempt. When using [RETRY], begin your ENTIRE response with the exact token [RETRY] followed by a brief explanation. Do not narrate any outcome.\n\nDEATH: State '[Name] is dead.' at the end of your response if a character dies.\n\nLANGUAGE: Always state the acting player's name first when addressing them, then you may use 'you' to refer to them within that same passage. Never use 'they', 'them', or 'their' — always use exact player names instead.\n\nCHARACTERS: Each player must have a unique character. If two players describe the same character type during setup, tell the second player to choose something different.\n\nNARRATION: Write only what is happening in the story. Never mention card values, dice, probability, game mechanics, context modifiers, wounds as numbers, or any behind-the-scenes reasoning. Just narrate the action and its outcome as a story.\n\nCONTENT: No gore, sexuality, or graphic violence. Keep combat intense but clean. Keep responses concise."
        },
        {
            role: 'system',
            content: `The players in this game are: ${room.players.map(p => p.name).join(', ')}. Remember all of these names throughout the entire game.`
        }
    ];

    io.to(room.id).emit('new-game-started', {
        players: room.players,
        acceptedIds: room.players.map(p => p.id),
        promotedIds,
        currentPlayerIndex: 0,
        deckSize: room.deck.length,
        spectatorCount: room.spectators.length
    });

    const firstPlayer = room.players[0];
    io.to(room.id).emit('setup-prompt', { playerName: firstPlayer.name, playerId: firstPlayer.id });

    broadcastPublicRooms();
}

function resolveNewGameVotes(room) {
    if (!room.newGameVotes) return;
    if (room.newGameTimer) { clearTimeout(room.newGameTimer); room.newGameTimer = null; }

    const accepted = room.players.filter(p => !p.eliminated && room.newGameVotes[p.id] !== false);
    room.newGameVotes = null;

    const totalAvailable = Math.min(accepted.length + room.spectators.length, room.maxPlayers);
    if (totalAvailable < 2) {
        io.to(room.id).emit('new-game-cancelled', { reason: 'Not enough players for a new game.' });
        return;
    }

    startNewGame(room, accepted.map(p => p.id));
}

async function detectEliminationsAI(players, gmResponse) {
    const aliveNames = players.filter(p => !p.eliminated).map(p => p.name);
    if (aliveNames.length === 0) return [];
    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are a game moderator assistant. Given a game narrative, determine which players were killed, died, or eliminated. Respond ONLY with a valid JSON array of their exact names, e.g. ["Alice","Bob"], or [] if none. No other text.' },
                    { role: 'user', content: `Active players: ${aliveNames.join(', ')}\n\nNarrative:\n"${gmResponse}"\n\nWhich players (if any) were killed, died, or eliminated? Reply with only a JSON array of their exact names.` }
                ],
                max_tokens: 100,
            }),
        });
        if (!response.ok) return [];
        const data = await response.json();
        const names = JSON.parse(data.choices[0].message.content.trim());
        if (!Array.isArray(names)) return [];
        return players.filter(p => !p.eliminated && names.some(n => n.toLowerCase() === p.name.toLowerCase()));
    } catch { return []; }
}

async function classifyAction(convHistory, actingPlayer, message, alivePlayers) {
    const aliveNames = alivePlayers
        .filter(p => !p.eliminated && p.id !== actingPlayer.id)
        .map(p => p.name);
    try {
        const res = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: `You classify RPG player actions. Return ONLY valid JSON, no other text:
{"valid":bool,"invalidReason":"","targets":[],"isRepeat":bool}
- valid: false ONLY if the message is pure keyboard mashing, random characters, or completely unintelligible to an English speaker (e.g. "a;owkjb;lasdj" or "Boiefkk"). Any understandable English — no matter how weird or fantastical (purple dragons, sentient walls, telekinesis, etc.) — is valid.
- targets: names from [${aliveNames.join(', ')}] directly targeted or affected by this action (empty if self-action or environmental)
- isRepeat: true ONLY if the action is word-for-word or essentially identical to a very recent previous attempt with zero meaningful difference` },
                    ...convHistory.slice(-20).filter(m => m.role !== 'system'),
                    { role: 'user', content: `${actingPlayer.name}: "${message}"` }
                ],
                max_tokens: 120,
            }),
        });
        if (!res.ok) return { valid: true, targets: [], isRepeat: false, invalidReason: '' };
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content.trim());
        if (!Array.isArray(parsed.targets)) parsed.targets = [];
        return parsed;
    } catch { return { valid: true, targets: [], isRepeat: false, invalidReason: '' }; }
}

async function resolveCounterPhase(room) {
    const p = room.pendingAction;
    room.pendingAction = null;

    const counterCards = p.targetIds.map(id => {
        const counter = p.counters[id];
        const player = room.players.find(pl => pl.id === id);
        return { playerName: player.name, playerColor: player.color, card: counter.card, cardValue: counter.cardValue, message: counter.message };
    });

    const allCards = [
        { playerName: p.attackerName, playerColor: p.attackerColor, card: p.attackerCard, cardValue: p.attackerCardValue },
        ...counterCards
    ];

    io.to(room.id).emit('multi-card-draw', { cards: allCards, deckSize: room.deck.length });

    const counterLines = counterCards.map(c => `${c.playerName} (value: ${c.cardValue}): "${c.message}"`).join('\n');
    const prompt = `${p.attackerName} (value: ${p.attackerCardValue}): "${p.attackerMessage}"\nCounters:\n${counterLines}`;

    try {
        const response = await callGroqAPI(room.conversationHistory, prompt);
        const newlyEliminated = await detectEliminationsAI(room.players, response);
        for (const pl of newlyEliminated) {
            pl.eliminated = true;
            room.conversationHistory.push({ role: 'system', content: `${pl.name} has been eliminated and is out of the game.` });
        }
        const alive = countAlive(room.players);
        room.currentPlayerIndex = nextAliveIndex(room.players, room.currentPlayerIndex);

        if (alive <= 1) {
            const winner = room.players.find(pl => !pl.eliminated);
            io.to(room.id).emit('gm-response', { response, currentPlayerIndex: room.currentPlayerIndex, currentPlayerId: p.attackerId, eliminatedIds: newlyEliminated.map(pl => pl.id), players: room.players });
            io.to(room.id).emit('game-over', { winnerName: winner?.name, players: room.players, spectatorCount: room.spectators.length });
            broadcastPublicRooms();
        } else {
            io.to(room.id).emit('gm-response', {
                response, currentPlayerIndex: room.currentPlayerIndex,
                currentPlayerId: room.players[room.currentPlayerIndex].id,
                eliminatedIds: newlyEliminated.map(pl => pl.id), players: room.players
            });
        }
    } catch (err) {
        io.to(room.id).emit('gm-error', { message: err.message });
    }
}

async function callGroqAPI(conversationHistory, userMessage) {
    conversationHistory.push({ role: 'user', content: userMessage });
    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: conversationHistory, max_tokens: 1024 }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Groq API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }
    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;
    conversationHistory.push({ role: 'assistant', content: assistantMessage });
    return assistantMessage;
}

io.on('connection', (socket) => {
    socket.data.isSpectator = false;

    // Send current public rooms immediately on connect
    socket.emit('public-rooms-updated', getPublicRoomsData());

    socket.on('get-public-rooms', () => {
        socket.emit('public-rooms-updated', getPublicRoomsData());
    });

    socket.on('create-room', ({ playerName, isPublic, maxPlayers }) => {
        let roomId;
        do { roomId = generateRoomId(); } while (rooms.has(roomId));

        const parsedMax = Math.min(10, Math.max(2, parseInt(maxPlayers) || 10));
        const player = { id: socket.id, name: playerName, color: playerColors[0], eliminated: false };
        const room = {
            id: roomId,
            hostId: socket.id,
            players: [player],
            spectators: [],
            deck: shuffleDeck(shuffleDeck(shuffleDeck(createDeck()))),
            currentPlayerIndex: 0,
            lastDrawnCard: null,
            started: false,
            isPublic: !!isPublic,
            maxPlayers: parsedMax,
            playerSetupDone: new Set(),
            pendingAction: null,
            conversationHistory: [
                {
                    role: 'system',
                    content: "You are the Game Master of a multiplayer elimination role-playing game. Each player controls a unique character with abilities, equipment, wounds, and status that evolve throughout the game.\n\nCARD VALUE RULES:\n- 2-4: Complete failure, may backfire.\n- 5-7: Mostly fails, minor partial effect.\n- 8-10: Mixed outcome.\n- 11-12: Clear success.\n- 13-14: Outstanding success.\n- For counter actions: if a defender's card value exceeds the attacker's, that defender's counter succeeds for them only. Resolve each defender independently.\n- Context matters: wounded/debuffed characters need higher values; characters with powerful gear or abilities can succeed with lower values.\n\nCONTEXT TRACKING: Remember each character's wounds, fatigue, equipment, special abilities, and buffs/debuffs from all previous turns. Factor these into every outcome. No character starts a new turn with a clean slate.\n\nDEATH: State '[Name] is dead.' at the end of your response if a character dies.\n\nLANGUAGE: Never use 'you', 'your', 'they', 'them', or 'their'. Always use exact player names in third person only.\n\nCHARACTERS: Each player must have a unique character. If two players describe the same character type during setup, tell the second player to choose something different.\n\nNARRATION: Write only what is happening in the story. Never mention card values, dice, probability, game mechanics, context modifiers, wounds as numbers, or any behind-the-scenes reasoning. Just narrate the action and its outcome as a story.\n\nCONTENT: No gore, sexuality, or graphic violence. Keep combat intense but clean. Keep responses concise."
                }
            ]
        };

        rooms.set(roomId, room);
        socket.join(roomId);
        socket.data.roomId = roomId;

        socket.emit('room-created', {
            roomId, playerId: socket.id, players: room.players,
            isPublic: room.isPublic, maxPlayers: room.maxPlayers
        });

        if (room.isPublic) broadcastPublicRooms();
    });

    socket.on('join-room', ({ roomId, playerName }) => {
        const room = rooms.get(roomId.toUpperCase());
        if (!room) { socket.emit('join-error', { message: 'Room not found.' }); return; }

        if (room.players.some(p => !p.eliminated && p.name.toLowerCase() === playerName.trim().toLowerCase())) {
            socket.emit('join-error', { message: 'A player with that name already exists in this room.' });
            return;
        }

        if (room.started) {
            if (!room.isPublic) { socket.emit('join-error', { message: 'Game already in progress.' }); return; }
            // Join as spectator
            const spectator = { id: socket.id, name: playerName };
            room.spectators.push(spectator);
            socket.join(room.id);
            socket.data.roomId = room.id;
            socket.data.isSpectator = true;

            socket.emit('joined-as-spectator', {
                roomId: room.id,
                playerId: socket.id,
                players: room.players,
                spectators: room.spectators,
                currentPlayerIndex: room.currentPlayerIndex,
                deckSize: room.deck.length,
                lastDrawnCard: room.lastDrawnCard
            });
            socket.to(room.id).emit('spectator-count-changed', { spectators: room.spectators });
            broadcastPublicRooms();
            return;
        }

        if (room.players.length >= room.maxPlayers) {
            socket.emit('join-error', { message: `Room is full (max ${room.maxPlayers}).` }); return;
        }

        const color = playerColors[room.players.length];
        const player = { id: socket.id, name: playerName, color, eliminated: false };
        room.players.push(player);
        socket.join(room.id);
        socket.data.roomId = room.id;

        socket.emit('room-joined', {
            roomId: room.id, playerId: socket.id, players: room.players,
            isPublic: room.isPublic, maxPlayers: room.maxPlayers
        });
        socket.to(room.id).emit('player-joined', { players: room.players });

        if (room.isPublic) broadcastPublicRooms();
    });

    socket.on('start-game', () => {
        const room = rooms.get(socket.data.roomId);
        if (!room || room.hostId !== socket.id) return;
        if (room.players.length < 2) { socket.emit('join-error', { message: 'Need at least 2 players to start.' }); return; }

        room.started = true;
        room.conversationHistory.push({
            role: 'system',
            content: `The players in this game are: ${room.players.map(p => p.name).join(', ')}. Remember all of these names throughout the entire game.`
        });

        io.to(room.id).emit('game-started', {
            players: room.players, currentPlayerIndex: 0,
            deckSize: room.deck.length, lastDrawnCard: null
        });

        const firstPlayer = room.players[0];
        io.to(room.id).emit('setup-prompt', { playerName: firstPlayer.name, playerId: firstPlayer.id });

        broadcastPublicRooms();
    });

    socket.on('submit-action', async ({ message }) => {
        const room = rooms.get(socket.data.roomId);
        if (!room || !room.started || socket.data.isSpectator) return;
        if (room.pendingAction) return;

        const currentPlayer = room.players[room.currentPlayerIndex];
        if (currentPlayer.id !== socket.id) return;

        // ── Setup phase ────────────────────────────────────
        if (!room.playerSetupDone.has(socket.id)) {
            room.playerSetupDone.add(socket.id);
            room.conversationHistory.push({ role: 'system', content: `${currentPlayer.name} is playing as: ${message}` });

            if (room.lastDrawnCard) room.deck.push(room.lastDrawnCard);
            room.lastDrawnCard = room.deck.shift();

            io.to(room.id).emit('action-submitted', {
                playerName: currentPlayer.name, playerColor: currentPlayer.color,
                message, drawnCard: room.lastDrawnCard, deckSize: room.deck.length
            });

            try {
                const rawResponse = await callGroqAPI(room.conversationHistory,
                    `${currentPlayer.name} IS this character — not a minion or summoned creature, but ${currentPlayer.name} themselves: "${message}". Narrate ${currentPlayer.name}'s dramatic arrival in 2 sentences. Do not reference an arena.`);
                const isRetry = rawResponse.trimStart().startsWith('[RETRY]');
                const response = rawResponse.replace(/^\s*\[RETRY\]\s*/i, '');

                if (isRetry) {
                    room.playerSetupDone.delete(socket.id);
                    io.to(room.id).emit('gm-response', {
                        response, currentPlayerIndex: room.currentPlayerIndex,
                        currentPlayerId: currentPlayer.id, eliminatedIds: [], players: room.players
                    });
                    io.to(room.id).emit('setup-prompt', { playerName: currentPlayer.name, playerId: currentPlayer.id });
                    return;
                }

                room.currentPlayerIndex = nextAliveIndex(room.players, room.currentPlayerIndex);
                io.to(room.id).emit('gm-response', {
                    response, currentPlayerIndex: room.currentPlayerIndex,
                    currentPlayerId: room.players[room.currentPlayerIndex].id,
                    eliminatedIds: [], players: room.players
                });

                const nextPlayer = room.players[room.currentPlayerIndex];
                if (!room.playerSetupDone.has(nextPlayer.id)) {
                    io.to(room.id).emit('setup-prompt', { playerName: nextPlayer.name, playerId: nextPlayer.id });
                }
            } catch (err) {
                room.playerSetupDone.delete(socket.id);
                io.to(room.id).emit('gm-error', { message: err.message });
            }
            return;
        }

        // ── Classify action ────────────────────────────────
        const alivePlayers = room.players.filter(p => !p.eliminated);
        let classification;
        try {
            classification = await classifyAction(room.conversationHistory, currentPlayer, message, alivePlayers);
        } catch {
            classification = { valid: true, targets: [], isRepeat: false };
        }

        if (!classification.valid) {
            io.to(room.id).emit('player-chat', { playerName: currentPlayer.name, playerColor: currentPlayer.color, message });
            socket.emit('action-invalid', { reason: classification.invalidReason || 'That action doesn\'t make sense. Please try something else.' });
            return;
        }

        if (classification.isRepeat) {
            io.to(room.id).emit('player-chat', { playerName: currentPlayer.name, playerColor: currentPlayer.color, message });
            socket.emit('action-repeat', { reason: 'You\'ve already attempted that. Try a different approach.' });
            return;
        }

        const targetPlayers = alivePlayers.filter(p =>
            p.id !== socket.id &&
            classification.targets.some(name => name.toLowerCase() === p.name.toLowerCase())
        );

        if (room.lastDrawnCard) room.deck.push(room.lastDrawnCard);
        room.lastDrawnCard = room.deck.shift();
        const attackerCardValue = getCardValue(room.lastDrawnCard);

        if (targetPlayers.length > 0) {
            // ── Counter phase ──────────────────────────────
            room.pendingAction = {
                attackerId: socket.id,
                attackerName: currentPlayer.name,
                attackerColor: currentPlayer.color,
                attackerMessage: message,
                attackerCard: room.lastDrawnCard,
                attackerCardValue,
                targetIds: targetPlayers.map(p => p.id),
                counters: {}
            };

            io.to(room.id).emit('counter-phase', {
                attackerName: currentPlayer.name, attackerColor: currentPlayer.color,
                attackerMessage: message,
                targetIds: targetPlayers.map(p => p.id),
                targetNames: targetPlayers.map(p => p.name)
            });
        } else {
            // ── Normal action ──────────────────────────────
            io.to(room.id).emit('action-submitted', {
                playerName: currentPlayer.name, playerColor: currentPlayer.color,
                message, drawnCard: room.lastDrawnCard, deckSize: room.deck.length
            });

            try {
                const rawResponse = await callGroqAPI(room.conversationHistory, `${currentPlayer.name}: ${message}. Value: ${attackerCardValue}.`);
                const isRetry = rawResponse.trimStart().startsWith('[RETRY]');
                const response = rawResponse.replace(/^\s*\[RETRY\]\s*/i, '');

                if (isRetry) {
                    // Return the card and keep the same player's turn
                    room.deck.unshift(room.lastDrawnCard);
                    room.lastDrawnCard = null;
                    io.to(room.id).emit('gm-response', {
                        response, currentPlayerIndex: room.currentPlayerIndex,
                        currentPlayerId: currentPlayer.id,
                        eliminatedIds: [], players: room.players
                    });
                    return;
                }

                const newlyEliminated = await detectEliminationsAI(room.players, response);
                for (const p of newlyEliminated) {
                    p.eliminated = true;
                    room.conversationHistory.push({ role: 'system', content: `${p.name} has been eliminated and is out of the game.` });
                }
                const alive = countAlive(room.players);
                room.currentPlayerIndex = nextAliveIndex(room.players, room.currentPlayerIndex);

                if (alive <= 1) {
                    const winner = room.players.find(p => !p.eliminated);
                    io.to(room.id).emit('gm-response', { response, currentPlayerIndex: room.currentPlayerIndex, currentPlayerId: currentPlayer.id, eliminatedIds: newlyEliminated.map(p => p.id), players: room.players });
                    io.to(room.id).emit('game-over', { winnerName: winner?.name, players: room.players, spectatorCount: room.spectators.length });
                    broadcastPublicRooms();
                } else {
                    io.to(room.id).emit('gm-response', {
                        response, currentPlayerIndex: room.currentPlayerIndex,
                        currentPlayerId: room.players[room.currentPlayerIndex].id,
                        eliminatedIds: newlyEliminated.map(p => p.id), players: room.players
                    });
                }
            } catch (err) {
                io.to(room.id).emit('gm-error', { message: err.message });
            }
        }
    });

    socket.on('submit-counter', async ({ message }) => {
        const room = rooms.get(socket.data.roomId);
        if (!room?.pendingAction) return;
        if (!room.pendingAction.targetIds.includes(socket.id)) return;
        if (room.pendingAction.counters[socket.id]) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const card = room.deck.shift();
        const cardValue = getCardValue(card);
        room.pendingAction.counters[socket.id] = { message, card, cardValue };

        const remaining = room.pendingAction.targetIds.filter(id => !room.pendingAction.counters[id]).length;
        io.to(room.id).emit('counter-received', { playerName: player.name, playerColor: player.color, message, remaining });

        if (remaining === 0) await resolveCounterPhase(room);
    });

    socket.on('player-leave', () => {
        const room = rooms.get(socket.data.roomId);
        if (!room) return;

        if (socket.data.isSpectator) {
            room.spectators = room.spectators.filter(s => s.id !== socket.id);
            socket.emit('you-left');
            socket.to(room.id).emit('spectator-count-changed', { spectators: room.spectators });
            socket.leave(room.id);
            socket.data.roomId = null;
            socket.data.isSpectator = false;
            if (room.isPublic) broadcastPublicRooms();
            return;
        }

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        const playerName = player.name;

        socket.emit('you-left');

        if (room.started && !player.eliminated) {
            player.eliminated = true;
            room.conversationHistory.push({ role: 'system', content: `${playerName} has left the game and is eliminated.` });

            const wasCurrent = room.players[room.currentPlayerIndex]?.id === socket.id;
            const alive = countAlive(room.players);

            if (alive <= 1) {
                const winner = room.players.find(p => !p.eliminated);
                io.to(room.id).emit('player-left-voluntarily', { playerName, players: room.players, currentPlayerIndex: room.currentPlayerIndex });
                io.to(room.id).emit('game-over', { winnerName: winner?.name, players: room.players, spectatorCount: room.spectators.length });
                broadcastPublicRooms();
            } else {
                if (wasCurrent) room.currentPlayerIndex = nextAliveIndex(room.players, room.currentPlayerIndex);
                io.to(room.id).emit('player-left-voluntarily', {
                    playerName, players: room.players,
                    currentPlayerIndex: room.currentPlayerIndex,
                    currentPlayerId: room.players[room.currentPlayerIndex]?.id
                });
            }
        } else {
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                rooms.delete(room.id);
                broadcastPublicRooms();
                socket.leave(room.id);
                socket.data.roomId = null;
                return;
            }
            if (room.hostId === socket.id) room.hostId = room.players[0].id;
            io.to(room.id).emit('player-joined', { players: room.players });
            if (room.isPublic) broadcastPublicRooms();
        }

        socket.leave(room.id);
        socket.data.roomId = null;
    });

    socket.on('new-game-request', () => {
        const room = rooms.get(socket.data.roomId);
        if (!room || room.hostId !== socket.id) return;

        const others = room.players.filter(p => p.id !== socket.id && !p.eliminated);
        if (others.length === 0 && room.spectators.length === 0) { startNewGame(room, [socket.id]); return; }
        if (others.length === 0) { startNewGame(room, [socket.id]); return; }

        room.newGameVotes = {};
        room.players.filter(p => !p.eliminated).forEach(p => { room.newGameVotes[p.id] = null; });
        room.newGameVotes[socket.id] = true;

        room.newGameTimer = setTimeout(() => resolveNewGameVotes(room), 30000);

        const hostName = room.players.find(p => p.id === socket.id)?.name;
        io.to(room.id).emit('new-game-vote', { hostName, timeoutMs: 30000, spectatorCount: room.spectators.length });
    });

    socket.on('new-game-response', ({ accept }) => {
        const room = rooms.get(socket.data.roomId);
        if (!room || !room.newGameVotes) return;

        room.newGameVotes[socket.id] = accept;

        const allVoted = Object.values(room.newGameVotes).every(v => v !== null);
        if (allVoted) {
            clearTimeout(room.newGameTimer);
            room.newGameTimer = null;
            resolveNewGameVotes(room);
        }
    });

    socket.on('typing-start', () => {
        const room = rooms.get(socket.data.roomId);
        if (!room || socket.data.isSpectator) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        socket.to(room.id).emit('player-typing', { playerName: player.name, playerColor: player.color, isTyping: true });
    });

    socket.on('typing-stop', () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        socket.to(roomId).emit('player-typing', { isTyping: false });
    });

    socket.on('disconnect', () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;

        if (room.pendingAction) {
            if (room.pendingAction.attackerId === socket.id || room.pendingAction.targetIds.includes(socket.id)) {
                room.pendingAction = null;
                io.to(roomId).emit('counter-phase-cancelled', { reason: 'A player disconnected during the counter phase.' });
            }
        }

        if (socket.data.isSpectator) {
            room.spectators = room.spectators.filter(s => s.id !== socket.id);
            io.to(roomId).emit('spectator-count-changed', { spectators: room.spectators });
            if (room.isPublic) broadcastPublicRooms();
            return;
        }

        const player = room.players.find(p => p.id === socket.id);

        // Log disconnect to conversation history before removing
        if (room.started && player && !player.eliminated) {
            room.conversationHistory.push({ role: 'system', content: `${player.name} has disconnected and is eliminated.` });
        }

        // Remove from players array so their name/slot is freed and voting works correctly
        room.players = room.players.filter(p => p.id !== socket.id);

        if (room.players.length === 0) {
            rooms.delete(roomId);
            broadcastPublicRooms();
            return;
        }

        if (room.hostId === socket.id) room.hostId = room.players[0].id;

        if (room.started) {
            const alive = countAlive(room.players);
            if (alive <= 1) {
                const winner = room.players.find(p => !p.eliminated);
                io.to(roomId).emit('player-left', { players: room.players, currentPlayerIndex: room.currentPlayerIndex, currentPlayerId: room.players[room.currentPlayerIndex]?.id });
                io.to(roomId).emit('game-over', { winnerName: winner?.name, players: room.players, spectatorCount: room.spectators.length });
                broadcastPublicRooms();
                return;
            }

            // Fix out-of-bounds index after removal, then skip eliminated players
            if (room.currentPlayerIndex >= room.players.length) room.currentPlayerIndex = 0;
            if (room.players[room.currentPlayerIndex]?.eliminated) {
                room.currentPlayerIndex = nextAliveIndex(room.players, room.currentPlayerIndex);
            }
        }

        io.to(roomId).emit('player-left', {
            players: room.players,
            currentPlayerIndex: room.currentPlayerIndex,
            currentPlayerId: room.players[room.currentPlayerIndex]?.id
        });

        if (room.isPublic) broadcastPublicRooms();
    });
});

const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'CRP.html')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
