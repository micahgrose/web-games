// ── Wiring ─────────────────────────────────────────────
import * as ui from './ui.js';
import { el, esc } from './ui.js';
import * as anim from './anim.js';
import * as sfx from './audio.js';

const socket = io();

// ── State ──────────────────────────────────────────────
const S = {
    id: null,
    room: null,
    players: [],
    hostId: null,
    currentId: null,
    isHost: false,
    spectator: false,
    over: false,
    setupTurn: false,
    counter: { on: false, target: false, attacker: null, sent: false },
    lastSent: '',
    busy: false,
};

const me = () => S.players.find(p => p.id === S.id);
const iAmOut = () => !!me()?.eliminated;
const myTurn = () => S.currentId === S.id && !S.spectator && !iAmOut();

// Every visible change runs through one chain, so a deal animation,
// the narration that follows it, and the turn change after that can
// never render on top of each other.
let chain = Promise.resolve();
function seq(fn) {
    chain = chain.then(async () => {
        S.busy = true;
        try { await fn(); } catch (e) { console.error(e); }
    }).then(() => {
        S.busy = false;
        gate();
    });
    return chain;
}

// ── Input gating ───────────────────────────────────────
function gate() {
    const text = el.input.value.trim();
    if (S.over || S.spectator || iAmOut()) {
        el.input.disabled = true;
        el.submit.disabled = true;
        return;
    }
    if (S.counter.on) {
        const can = S.counter.target && !S.counter.sent;
        el.input.disabled = !can;
        el.submit.disabled = !can || !text || S.busy;
        return;
    }
    el.input.disabled = !myTurn();
    el.submit.disabled = !myTurn() || !text || S.busy;
}

function paintTurn() {
    if (S.over) return;
    const cur = S.players.find(p => p.id === S.currentId);
    ui.setSeatLight(cur?.color);

    if (S.counter.on) {
        el.turnIndicator.textContent = S.counter.target && !S.counter.sent
            ? 'Answer it'
            : `${S.counter.attacker} is being answered`;
        el.hint.textContent = S.counter.target
            ? (S.counter.sent ? 'Your answer is in. Waiting on the others…' : 'Say how you meet it. A higher card turns it aside.')
            : 'Waiting for the answers…';
    } else if (S.spectator) {
        el.turnIndicator.textContent = cur ? `${cur.name}'s turn` : '';
        el.hint.textContent = 'You are watching. A seat opens for you next game.';
    } else if (iAmOut()) {
        el.turnIndicator.textContent = cur ? `${cur.name}'s turn` : '';
        el.hint.textContent = 'You are out of this one. Watch it end.';
    } else if (myTurn()) {
        el.turnIndicator.textContent = S.setupTurn ? 'Who are you?' : 'Your turn';
        el.hint.textContent = S.setupTurn
            ? 'Describe who you are. No actions yet — this turn is only for becoming someone.'
            : '';
        el.input.placeholder = S.setupTurn ? 'I am…' : 'What do you do?';
    } else {
        el.turnIndicator.textContent = cur ? `${cur.name}'s turn` : '';
        el.hint.textContent = cur ? `Waiting for ${cur.name}…` : '';
    }

    ui.renderDramatis(S.players, S.id, S.counter.on ? null : S.currentId);
    gate();
}

function startClockFrom(ms) {
    if (!ms || S.spectator || S.over) { ui.stopClock(); return; }
    ui.startClock(Math.max(1, Math.round(ms / 1000)), (left) => {
        if (left > 0 && left <= 5 && (myTurn() || (S.counter.on && S.counter.target && !S.counter.sent))) {
            sfx.play('tick');
        }
    });
}

// ── Lobby ──────────────────────────────────────────────
el.tabOpen.addEventListener('click', () => {
    el.tabOpen.classList.add('active');
    el.tabInPlay.classList.remove('active');
    el.openList.classList.remove('hidden');
    el.inplayList.classList.add('hidden');
});
el.tabInPlay.addEventListener('click', () => {
    el.tabInPlay.classList.add('active');
    el.tabOpen.classList.remove('active');
    el.inplayList.classList.remove('hidden');
    el.openList.classList.add('hidden');
});

// One delegated listener for every table row, now and forever.
function roomClick(ev) {
    const btn = ev.target.closest('button[data-id]');
    if (!btn || btn.disabled) return;
    const name = el.quickName.value.trim();
    if (!name) {
        el.quickName.focus();
        el.quickName.placeholder = 'Your name first…';
        setTimeout(() => { el.quickName.placeholder = 'Your name, to sit down or to watch'; }, 2200);
        return;
    }
    sfx.unlock();
    btn.disabled = true;
    socket.emit('room:join', { code: btn.dataset.id, name });
}
el.openList.addEventListener('click', roomClick);
el.inplayList.addEventListener('click', roomClick);

el.createName.addEventListener('input', () => {
    el.createBtn.disabled = !el.createName.value.trim();
});
el.publicToggle.addEventListener('change', () => {
    el.maxRow.classList.toggle('hidden', !el.publicToggle.checked);
});
el.createBtn.addEventListener('click', () => {
    const name = el.createName.value.trim();
    if (!name) return;
    sfx.unlock();
    el.createBtn.disabled = true;
    socket.emit('room:create', {
        name,
        isPublic: el.publicToggle.checked,
        maxPlayers: parseInt(el.maxSelect.value, 10),
    });
});

function joinGate() {
    el.joinBtn.disabled = !el.joinName.value.trim() || el.joinCode.value.trim().length < 5;
}
el.joinName.addEventListener('input', joinGate);
el.joinCode.addEventListener('input', joinGate);
el.joinBtn.addEventListener('click', () => {
    const name = el.joinName.value.trim();
    const code = el.joinCode.value.trim().toUpperCase();
    if (!name || code.length < 5) return;
    sfx.unlock();
    el.joinBtn.disabled = true;
    socket.emit('room:join', { code, name });
});
el.joinCode.addEventListener('keypress', e => { if (e.key === 'Enter') el.joinBtn.click(); });

el.startBtn.addEventListener('click', () => {
    el.startBtn.disabled = true;
    socket.emit('game:start');
});

// ── Composing ──────────────────────────────────────────
let typingSent = false;
let typingIdle = null;

el.input.addEventListener('input', () => {
    gate();
    const has = !!el.input.value.trim();
    if (has && !typingSent) { socket.emit('typing', { on: true }); typingSent = true; }
    clearTimeout(typingIdle);
    if (has) {
        typingIdle = setTimeout(() => {
            if (typingSent) { socket.emit('typing', { on: false }); typingSent = false; }
        }, 3200);
    } else if (typingSent) {
        socket.emit('typing', { on: false });
        typingSent = false;
    }
});

el.input.addEventListener('keypress', e => { if (e.key === 'Enter') el.submit.click(); });

el.submit.addEventListener('click', () => {
    const text = el.input.value.trim();
    if (!text || el.submit.disabled) return;
    sfx.unlock();

    S.lastSent = text;
    el.input.value = '';
    el.input.disabled = true;
    el.submit.disabled = true;
    if (typingSent) { socket.emit('typing', { on: false }); typingSent = false; }
    ui.hideTyping();
    ui.stopClock();

    if (S.counter.on && S.counter.target) {
        S.counter.sent = true;
        socket.emit('counter', { text });
    } else {
        socket.emit('act', { text });
    }
    paintTurn();
});

// ── Leaving ────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (el.game.style.display === 'none' && el.waiting.style.display === 'none') return;
    if (el.voteOverlay.classList.contains('on')) return;
    el.escapeTitle.textContent = S.spectator ? 'Stop Watching?' : 'Leave the Table?';
    el.escapeSubtitle.textContent = S.spectator
        ? 'You will return to the lobby.'
        : 'You will be counted out of the game.';
    el.escapeOverlay.classList.toggle('on');
});
document.getElementById('cancelLeaveBtn').addEventListener('click', () => el.escapeOverlay.classList.remove('on'));
document.getElementById('confirmLeaveBtn').addEventListener('click', () => {
    el.escapeOverlay.classList.remove('on');
    socket.emit('leave');
});

el.newGameBtn.addEventListener('click', () => {
    el.newGameBtn.disabled = true;
    socket.emit('newgame:request');
});

// ── Vote ───────────────────────────────────────────────
let voteTick = null;
function voteClock(sec) {
    let left = sec;
    el.voteCountdown.textContent = left;
    clearInterval(voteTick);
    voteTick = setInterval(() => {
        left--;
        el.voteCountdown.textContent = Math.max(0, left);
        if (left <= 0) clearInterval(voteTick);
    }, 1000);
}
function closeVote() {
    clearInterval(voteTick);
    el.voteOverlay.classList.remove('on');
}
document.getElementById('voteAcceptBtn').addEventListener('click', () => {
    closeVote();
    socket.emit('newgame:vote', { accept: true });
});
document.getElementById('voteDeclineBtn').addEventListener('click', () => {
    closeVote();
    socket.emit('newgame:vote', { accept: false });
});

// ── Sound toggle ───────────────────────────────────────
const muteBtn = document.getElementById('muteBtn');
function paintMute() {
    const m = sfx.isMuted();
    muteBtn.textContent = m ? 'Sound Off' : 'Sound On';
    muteBtn.setAttribute('aria-pressed', String(!m));
}
sfx.restoreMute();
paintMute();
muteBtn.addEventListener('click', () => {
    sfx.unlock();
    sfx.setMuted(!sfx.isMuted());
    paintMute();
});
ui.setQuillGlyphHook(() => { if (Math.random() < 0.11) sfx.play('scratch'); });

// ── Reset ──────────────────────────────────────────────
function toLanding(message) {
    const known = el.quickName.value.trim() || el.createName.value.trim() || el.joinName.value.trim();
    if (known) el.quickName.value = known;
    S.room = null; S.players = []; S.spectator = false; S.isHost = false;
    S.over = false; S.setupTurn = false;
    S.counter = { on: false, target: false, attacker: null, sent: false };
    ui.clearChronicle();
    ui.stopClock();
    ui.setSeatLight(null);
    el.counterBanner.classList.remove('on');
    el.victory.classList.remove('on');
    el.newGameBtn.style.display = 'none';
    el.spectatorBar.textContent = '';
    el.turnIndicator.textContent = '';
    el.hint.textContent = '';
    el.input.value = '';
    el.input.disabled = false;
    el.submit.disabled = true;
    el.lobbyError.textContent = message || '';
    el.createBtn.disabled = !el.createName.value.trim();
    joinGate();
    document.querySelectorAll('.room-row button').forEach(b => { b.disabled = false; });
    ui.show('landing');
}

// ══ Socket ═════════════════════════════════════════════
socket.on('rooms', (rooms) => ui.renderRooms(rooms));

socket.on('joined', (d) => {
    S.id = d.playerId;
    S.room = d.roomId;
    S.players = d.players;
    S.hostId = d.hostId;
    S.isHost = d.hostId === d.playerId;
    S.spectator = !!d.spectator;
    S.over = false;
    S.currentId = d.currentId || null;

    if (d.started) {
        ui.show('game');
        ui.clearChronicle();
        ui.paintDeck(d.deckCount);
        ui.paintDrawn(d.drawnCard || null);
        el.spectatorBar.textContent = d.spectatorCount
            ? `${d.spectatorCount} watching`
            : '';
        if (S.spectator) ui.systemLine('You pulled up a chair. A seat opens for you next game.');
        paintTurn();
        startClockFrom(d.deadlineIn);
    } else {
        ui.show('waiting');
        el.roomCode.textContent = d.roomId;
        el.shareMsg.textContent = d.isPublic
            ? `Public · ${d.maxPlayers} seats · listed in the lobby`
            : 'Share this code';
        el.startBtn.style.display = S.isHost ? 'block' : 'none';
        el.startBtn.disabled = d.players.length < 2;
        ui.renderSeats(d.players, d.hostId);
        el.waitStatus.textContent = d.players.length < 2
            ? 'Waiting for at least one more…'
            : `${d.players.length} seated`;
    }
});

socket.on('players', (d) => {
    S.players = d.players;
    S.hostId = d.hostId;
    S.isHost = d.hostId === S.id;
    if (d.currentId !== undefined) S.currentId = d.currentId;
    if (el.waiting.style.display !== 'none') {
        ui.renderSeats(d.players, d.hostId);
        el.startBtn.style.display = S.isHost ? 'block' : 'none';
        el.startBtn.disabled = d.players.length < 2;
        el.waitStatus.textContent = d.players.length < 2
            ? 'Waiting for at least one more…'
            : `${d.players.length} seated`;
        el.waitSpectators.textContent = d.spectatorCount
            ? `${d.spectatorCount} watching` : '';
    } else {
        el.spectatorBar.textContent = d.spectatorCount ? `${d.spectatorCount} watching` : '';
        paintTurn();
    }
});

socket.on('started', (d) => seq(async () => {
    S.players = d.players;
    S.currentId = d.currentId;
    S.over = false;
    ui.show('game');
    ui.clearChronicle();
    ui.paintDeck(d.deckCount);
    ui.paintDrawn(null);
    el.victory.classList.remove('on');
    el.newGameBtn.style.display = 'none';
    await anim.shuffleDeck(el.deckHolder);
}));

socket.on('turn', (d) => seq(() => {
    S.currentId = d.currentId;
    S.setupTurn = !!d.setup;
    S.counter = { on: false, target: false, attacker: null, sent: false };
    el.counterBanner.classList.remove('on');
    if (d.players) S.players = d.players;
    paintTurn();
    startClockFrom(d.deadlineIn);
    if (myTurn()) sfx.play('yours');
}));

socket.on('ask', (d) => seq(() => {
    ui.gmSays(d.text);
}));

socket.on('said', (d) => seq(() => {
    ui.saidBy(d.name, d.text, d.color);
    ui.hideTyping();
}));

socket.on('draw', (d) => seq(async () => {
    ui.paintDeck(d.deckCount);
    if (d.shuffled) {
        ui.systemLine('The deck runs out. It is gathered and shuffled again.');
        await anim.shuffleDeck(el.deckHolder);
    }
    await anim.dealOne(d.card, el.deckHolder, el.drawnHolder, d.band);
    ui.paintDrawn(d.card, d.band);
}));

socket.on('clash', (d) => seq(async () => {
    ui.paintDeck(d.deckCount);
    if (d.shuffled) await anim.shuffleDeck(el.deckHolder);
    await anim.dealClash(d.cards, el.deckHolder);
    ui.paintDrawn(d.cards[0].card);
}));

socket.on('gmStart', () => seq(() => { ui.quill.open(); }));
socket.on('gm', (d) => seq(() => { ui.quill.write(d.chunk); }));
socket.on('gmEnd', () => seq(() => ui.quill.finish()));

socket.on('sheets', (d) => seq(() => {
    S.players = S.players.map(p => ({ ...p, ...(d.sheets[p.id] || {}) }));
    ui.renderDramatis(S.players, S.id, S.counter.on ? null : S.currentId);
}));

socket.on('out', (d) => seq(() => {
    if (d.players) S.players = d.players;
    (d.names || []).forEach(n => ui.knell(`${n} is out`));
    if (d.names?.length) sfx.play('knell');
    ui.renderDramatis(S.players, S.id, S.currentId);
}));

socket.on('note', (d) => seq(() => ui.systemLine(d.text)));

socket.on('nope', (d) => seq(() => {
    ui.gmSays(d.reason);
    if (S.lastSent && !el.input.value) el.input.value = S.lastSent;
    if (S.counter.on) S.counter.sent = false;
    paintTurn();
    startClockFrom(d.deadlineIn);
    el.input.focus();
}));

socket.on('counter', (d) => seq(() => {
    S.counter = {
        on: true,
        target: d.targetIds.includes(S.id) && !iAmOut(),
        attacker: d.attackerName,
        sent: false,
    };
    el.counterBanner.innerHTML =
        `<strong>${esc(d.attackerName)}</strong> moves against <strong>${d.targetNames.map(esc).join('</strong> and <strong>')}</strong>`;
    el.counterBanner.classList.add('on');
    ui.gmSays(`${d.targetNames.join(' and ')} — how do you meet it?`);
    el.input.placeholder = 'You answer by…';
    paintTurn();
    startClockFrom(d.deadlineIn);
    if (S.counter.target) sfx.play('yours');
}));

socket.on('counterIn', (d) => seq(() => {
    ui.saidBy(d.name, d.text, d.color);
    if (d.remaining > 0) el.hint.textContent = `Waiting on ${d.remaining} more…`;
    else el.hint.textContent = 'All answers in.';
}));

socket.on('counterOff', (d) => seq(() => {
    S.counter = { on: false, target: false, attacker: null, sent: false };
    el.counterBanner.classList.remove('on');
    el.input.placeholder = 'What do you do?';
    ui.systemLine(d.reason);
    paintTurn();
}));

socket.on('over', (d) => seq(async () => {
    S.over = true;
    if (d.players) S.players = d.players;
    ui.stopClock();
    ui.setSeatLight('#c9a227');
    el.counterBanner.classList.remove('on');
    el.turnIndicator.textContent = 'The table is quiet';
    el.hint.textContent = '';
    el.input.disabled = true;
    el.submit.disabled = true;
    el.victoryName.textContent = d.winnerName || 'Nobody';
    el.victoryEpilogue.textContent = '';
    el.victoryNote.textContent = d.spectatorCount
        ? `${d.spectatorCount} waiting to play the next one.`
        : '';
    el.victory.classList.add('on');
    if (S.isHost) el.newGameBtn.style.display = 'inline-block';
    ui.renderDramatis(S.players, S.id, null);
    sfx.play('victory');
}));

// The closing legend, streamed into the victory plate.
socket.on('epilogue', (d) => seq(() => {
    el.victoryEpilogue.textContent += d.chunk;
}));

socket.on('vote', (d) => seq(() => {
    if (d.phase === 'players' && S.spectator) {
        ui.systemLine('The players are deciding on another round…');
        return;
    }
    if (d.phase === 'spectators' && !S.spectator) {
        ui.systemLine(`${d.slots} seat${d.slots > 1 ? 's' : ''} left open — the watchers are being asked.`);
        return;
    }
    el.newGameBtn.style.display = 'none';
    el.voteSubtitle.textContent = d.phase === 'spectators'
        ? `${d.slots} seat${d.slots > 1 ? 's' : ''} open — first to accept sits down.`
        : 'Another round, same table?';
    el.voteOverlay.classList.add('on');
    voteClock(Math.round(d.timeoutMs / 1000));
}));

socket.on('voteOff', (d) => seq(() => {
    closeVote();
    el.newGameBtn.disabled = false;
    ui.systemLine(d.reason);
}));

socket.on('newGame', (d) => seq(async () => {
    closeVote();
    el.escapeOverlay.classList.remove('on');

    if (S.spectator && d.promotedIds?.includes(S.id)) {
        S.spectator = false;
        ui.systemLine('A seat opened. You are in.');
    }
    if (!d.acceptedIds.includes(S.id) && !S.spectator) {
        toLanding('A new game started without you.');
        return;
    }

    S.players = d.players;
    S.currentId = d.currentId;
    S.hostId = d.hostId;
    S.isHost = d.hostId === S.id;
    S.over = false;
    S.counter = { on: false, target: false, attacker: null, sent: false };

    el.victory.classList.remove('on');
    el.newGameBtn.style.display = 'none';
    el.newGameBtn.disabled = false;
    el.counterBanner.classList.remove('on');
    ui.clearChronicle();
    ui.paintDrawn(null);
    ui.paintDeck(d.deckCount);
    el.spectatorBar.textContent = d.spectatorCount ? `${d.spectatorCount} watching` : '';
    paintTurn();
    await anim.shuffleDeck(el.deckHolder);
}));

socket.on('typing', (d) => {
    if (S.busy) return;
    if (d.on) ui.showTyping(d.name, d.color); else ui.hideTyping();
});

socket.on('left', () => {
    closeVote();
    toLanding('');
});

socket.on('joinError', (d) => {
    el.lobbyError.textContent = d.message;
    el.createBtn.disabled = !el.createName.value.trim();
    joinGate();
    document.querySelectorAll('.room-row button').forEach(b => { b.disabled = false; });
});

socket.on('error:gm', (d) => seq(() => {
    ui.quill.close();
    ui.systemLine(d.message);
    paintTurn();
    startClockFrom(d.deadlineIn);
}));

socket.on('disconnect', () => {
    ui.stopClock();
    el.hint.textContent = 'Connection lost. Reload to return to the table.';
    el.input.disabled = true;
    el.submit.disabled = true;
});

// Kick the audio context awake on the first real gesture.
['pointerdown', 'keydown'].forEach(evt =>
    window.addEventListener(evt, () => sfx.unlock(), { once: true, passive: true }));

ui.show('landing');
socket.emit('rooms:get');
