const socket = io();

// ── State ──────────────────────────────────────────────
let myPlayerId = null;
let myRoomId   = null;
let players    = [];
let currentPlayerIndex = 0;
let isHost      = false;
let isSpectator = false;
let gameOver    = false;
let gmThinking  = false;
let voteTimer   = null;
let roomIsPublic = false;
let inCounterPhase    = false;
let isCounterTarget   = false;
let counterAttackerName = null;
let chatAnimating     = false;
const chatQueue       = [];

// ── Helpers ────────────────────────────────────────────
function getSuitSymbol(suit) {
    return { Hearts: '♥', Diamonds: '♦', Clubs: '♣', Spades: '♠' }[suit] || '';
}

function getSuitColor(suit) {
    return suit === 'Hearts' || suit === 'Diamonds' ? 'red' : 'black';
}

function getPipPositions(rank) {
    switch (rank) {
        case 'A':  return [[3,2]];
        case '2':  return [[1,2],[5,2]];
        case '3':  return [[1,2],[3,2],[5,2]];
        case '4':  return [[1,1],[1,3],[5,1],[5,3]];
        case '5':  return [[1,1],[1,3],[3,2],[5,1],[5,3]];
        case '6':  return [[1,1],[1,3],[3,1],[3,3],[5,1],[5,3]];
        case '7':  return [[1,1],[1,3],[2,2],[3,1],[3,3],[5,1],[5,3]];
        case '8':  return [[1,1],[1,3],[2,2],[3,1],[3,3],[4,2],[5,1],[5,3]];
        case '9':  return [[1,1],[1,3],[2,2],[3,1],[3,2],[3,3],[4,2],[5,1],[5,3]];
        case '10': return [[1,1],[1,3],[2,2],[3,1],[3,3],[4,2],[5,1],[5,3],[2,1],[4,3]];
        case 'J':  return [[1,1],[1,3],[2,1],[2,3],[3,1],[3,3],[4,1],[4,3],[5,1],[5,3],[3,2]];
        case 'Q':  return [[1,1],[1,3],[2,1],[2,3],[3,1],[3,3],[4,1],[4,3],[5,1],[5,3],[2,2],[4,2]];
        case 'K':  return [[1,1],[1,3],[2,1],[2,3],[3,1],[3,3],[4,1],[4,3],[5,1],[5,3],[2,2],[3,2],[4,2]];
        default:   return [];
    }
}

function renderCardFace(card) {
    if (!card) return `<div class="card-face-center"><div class="card-pip">?</div></div>`;
    const symbol = getSuitSymbol(card.suit);
    const colorClass = getSuitColor(card.suit);
    if (['J', 'Q', 'K'].includes(card.rank)) {
        const faceName = card.rank === 'J' ? 'Jack' : card.rank === 'Q' ? 'Queen' : 'King';
        return `
            <div class="card-face-corner top-left ${colorClass}">${card.rank}<br>${symbol}</div>
            <div class="card-face-corner bottom-right ${colorClass}">${card.rank}<br>${symbol}</div>
            <div class="card-face-center face-card ${colorClass}">
                <div class="face-card-title">${faceName}</div>
                <div class="face-card-portrait">${symbol}</div>
                <div class="face-card-subtitle">${card.suit}</div>
            </div>`;
    }
    const pips = getPipPositions(card.rank).map(([row, col]) =>
        `<div class="card-pip ${colorClass}" style="grid-row:${row};grid-column:${col};">${symbol}</div>`
    ).join('');
    return `
        <div class="card-face-corner top-left ${colorClass}">${card.rank}<br>${symbol}</div>
        <div class="card-face-corner bottom-right ${colorClass}">${card.rank}<br>${symbol}</div>
        <div class="card-face-center">${pips}</div>`;
}

// ── DOM refs ───────────────────────────────────────────
const landingWrapper  = document.getElementById('landingWrapper');
const lobbyPanel      = document.getElementById('lobbyPanel');
const waitingPanel    = document.getElementById('waitingPanel');
const gamePanel       = document.getElementById('gamePanel');

const quickNameInput  = document.getElementById('quickNameInput');
const openRoomsList   = document.getElementById('openRoomsList');
const inplayRoomsList = document.getElementById('inplayRoomsList');
const tabOpen         = document.getElementById('tabOpen');
const tabInPlay       = document.getElementById('tabInPlay');
const openCount       = document.getElementById('openCount');
const inplayCount     = document.getElementById('inplayCount');

const createNameInput  = document.getElementById('createNameInput');
const createRoomBtn    = document.getElementById('createRoomBtn');
const publicToggle     = document.getElementById('publicToggle');
const maxPlayersRow    = document.getElementById('maxPlayersRow');
const maxPlayersSelect = document.getElementById('maxPlayersSelect');
const joinNameInput    = document.getElementById('joinNameInput');
const joinCodeInput    = document.getElementById('joinCodeInput');
const joinRoomBtn      = document.getElementById('joinRoomBtn');
const lobbyError       = document.getElementById('lobbyError');

const displayRoomCode    = document.getElementById('displayRoomCode');
const roomShareMsg       = document.getElementById('roomShareMsg');
const publicWaitingBadge = document.getElementById('publicWaitingBadge');
const waitingPlayerList  = document.getElementById('waitingPlayerList');
const waitingStatus      = document.getElementById('waitingStatus');
const waitingSpectatorNote = document.getElementById('waitingSpectatorNote');
const startGameBtn       = document.getElementById('startGameBtn');

const escapeOverlay   = document.getElementById('escapeOverlay');
const escapeTitle     = document.getElementById('escapeTitle');
const escapeSubtitle  = document.getElementById('escapeSubtitle');
const confirmLeaveBtn = document.getElementById('confirmLeaveBtn');
const cancelLeaveBtn  = document.getElementById('cancelLeaveBtn');
const voteOverlay     = document.getElementById('voteOverlay');
const voteTitle       = document.getElementById('voteTitle');
const voteSubtitle    = document.getElementById('voteSubtitle');
const voteCountdown   = document.getElementById('voteCountdown');
const voteBtnRow      = document.getElementById('voteBtnRow');
const voteAcceptBtn   = document.getElementById('voteAcceptBtn');
const voteDeclineBtn  = document.getElementById('voteDeclineBtn');
const newGameBtn      = document.getElementById('newGameBtn');
const gameOverText    = document.getElementById('gameOverText');
const gameOverSpectatorNote = document.getElementById('gameOverSpectatorNote');

const turnIndicator     = document.getElementById('turnIndicator');
const spectatorBar      = document.getElementById('spectatorBar');
const playersRoster     = document.getElementById('playersRoster');
const chatHistory       = document.getElementById('chatHistory');
const responseContainer = document.getElementById('responseContainer');
const messageInput      = document.getElementById('messageInput');
const submitBtn         = document.getElementById('submitBtn');
const deckVisual        = document.getElementById('deckVisual');
const drawnCardVisual   = document.getElementById('drawnCardVisual');
const notYourTurnMsg    = document.getElementById('notYourTurnMsg');
const gameOverBanner    = document.getElementById('gameOverBanner');

// ── Public rooms tabs ──────────────────────────────────
tabOpen.addEventListener('click', () => {
    tabOpen.classList.add('active');
    tabInPlay.classList.remove('active');
    openRoomsList.style.display = 'flex';
    inplayRoomsList.style.display = 'none';
});

tabInPlay.addEventListener('click', () => {
    tabInPlay.classList.add('active');
    tabOpen.classList.remove('active');
    inplayRoomsList.style.display = 'flex';
    openRoomsList.style.display = 'none';
});

function renderPublicRooms(rooms) {
    const open   = rooms.filter(r => r.status === 'open');
    const inplay = rooms.filter(r => r.status === 'in-play');

    openCount.textContent   = open.length;
    inplayCount.textContent = inplay.length;

    // Open rooms
    if (open.length === 0) {
        openRoomsList.innerHTML = '<p class="no-rooms-msg">No open public games yet.</p>';
    } else {
        openRoomsList.innerHTML = open.map(r => {
            const isFull = r.playerCount >= r.maxPlayers;
            return `
                <div class="room-row">
                    <div class="room-row-info">
                        <div class="room-row-code">${r.id}</div>
                        <div class="room-row-meta">${r.playerCount} / ${r.maxPlayers} players</div>
                    </div>
                    <span class="room-status-badge ${isFull ? 'full' : 'open'}">${isFull ? 'Full' : 'Open'}</span>
                    <button class="room-action-btn"
                        data-id="${r.id}" data-action="join"
                        ${isFull ? 'disabled' : ''}>Join</button>
                </div>`;
        }).join('');
    }

    // In-play rooms
    if (inplay.length === 0) {
        inplayRoomsList.innerHTML = '<p class="no-rooms-msg">No games currently in play.</p>';
    } else {
        inplayRoomsList.innerHTML = inplay.map(r => {
            const specText = r.spectatorCount > 0 ? ` · ${r.spectatorCount} watching` : '';
            return `
                <div class="room-row">
                    <div class="room-row-info">
                        <div class="room-row-code">${r.id}</div>
                        <div class="room-row-meta">${r.alivePlayers} alive / ${r.playerCount} players${specText}</div>
                    </div>
                    <span class="room-status-badge in-play">In Play</span>
                    <button class="room-action-btn watch" data-id="${r.id}" data-action="watch">Watch</button>
                </div>`;
        }).join('');
    }

    // Attach click handlers
    document.querySelectorAll('.room-action-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const roomId = btn.dataset.id;
            const action = btn.dataset.action;
            const name = quickNameInput.value.trim();
            if (!name) {
                quickNameInput.focus();
                quickNameInput.placeholder = 'Enter your name first!';
                setTimeout(() => { quickNameInput.placeholder = 'Your name to join or watch'; }, 2000);
                return;
            }
            btn.disabled = true;
            socket.emit('join-room', { roomId, playerName: name });
        });
    });
}

// ── Lobby inputs ───────────────────────────────────────
createNameInput.addEventListener('input', () => {
    createRoomBtn.disabled = createNameInput.value.trim() === '';
});

publicToggle.addEventListener('change', () => {
    maxPlayersRow.style.display = publicToggle.checked ? 'flex' : 'none';
});

createRoomBtn.addEventListener('click', () => {
    const name = createNameInput.value.trim();
    if (!name) return;
    createRoomBtn.disabled = true;
    socket.emit('create-room', {
        playerName: name,
        isPublic: publicToggle.checked,
        maxPlayers: parseInt(maxPlayersSelect.value)
    });
});

function updateJoinBtn() {
    joinRoomBtn.disabled = joinNameInput.value.trim() === '' || joinCodeInput.value.trim().length < 5;
}
joinNameInput.addEventListener('input', updateJoinBtn);
joinCodeInput.addEventListener('input', updateJoinBtn);

joinRoomBtn.addEventListener('click', () => {
    const name = joinNameInput.value.trim();
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!name || code.length < 5) return;
    joinRoomBtn.disabled = true;
    socket.emit('join-room', { roomId: code, playerName: name });
});

// ── Waiting room ───────────────────────────────────────
function renderWaitingPlayers(playerList) {
    waitingPlayerList.innerHTML = playerList.map((p, i) => `
        <li>
            <div class="player-dot" style="background:${p.color};"></div>
            ${p.name}${i === 0 ? ' <em style="color:#aaa;font-size:0.8rem;">(host)</em>' : ''}
        </li>`
    ).join('');

    const count = playerList.length;
    waitingStatus.textContent = count < 2
        ? 'Waiting for at least one more player…'
        : `${count} player${count > 1 ? 's' : ''} ready`;

    if (isHost) startGameBtn.disabled = count < 2;
}

startGameBtn.addEventListener('click', () => {
    socket.emit('start-game');
    startGameBtn.disabled = true;
});

// ── Game UI ────────────────────────────────────────────
function renderRoster() {
    playersRoster.innerHTML = players.map(p => `
        <div class="roster-player ${p.eliminated ? 'eliminated' : ''}" style="background:${p.color}22; border-color:${p.eliminated ? '#ccc' : p.color};">
            <div class="roster-dot" style="background:${p.color};"></div>
            ${p.name}${p.id === myPlayerId ? ' (you)' : ''}
            ${p.eliminated ? ' ☠' : ''}
        </div>`
    ).join('');
}

function updateSpectatorBar(count) {
    if (count > 0) {
        spectatorBar.textContent = `👁 ${count} spectator${count > 1 ? 's' : ''} watching — they'll join the next game`;
    } else {
        spectatorBar.textContent = '';
    }
}

function updateTurnUI() {
    if (gameOver) return;

    const current = players[currentPlayerIndex];
    const myPlayer = players.find(p => p.id === myPlayerId);
    const amEliminated = myPlayer?.eliminated ?? false;

    if (inCounterPhase) {
        document.body.style.backgroundColor = current?.color || '#f4f4f4';
        if (isCounterTarget && !amEliminated && !isSpectator) {
            turnIndicator.textContent = `Counter ${counterAttackerName}'s action!`;
            messageInput.disabled = false;
            messageInput.placeholder = 'How do you respond?';
            submitBtn.disabled = chatAnimating || messageInput.value.trim() === '';
            notYourTurnMsg.textContent = '';
        } else {
            turnIndicator.textContent = `${counterAttackerName} is being countered…`;
            messageInput.disabled = true;
            submitBtn.disabled = true;
            notYourTurnMsg.textContent = 'Waiting for counter responses…';
        }
        renderRoster();
        return;
    }

    const isMyTurn = current?.id === myPlayerId;

    if (isSpectator) {
        turnIndicator.textContent = `${current?.name}'s turn`;
        document.body.style.backgroundColor = current?.color || '#f4f4f4';
        submitBtn.disabled    = true;
        messageInput.disabled = true;
        notYourTurnMsg.textContent = '👁 You are spectating. You\'ll play in the next game!';
    } else if (amEliminated) {
        turnIndicator.textContent = `${current?.name}'s turn — you are spectating`;
        document.body.style.backgroundColor = current?.color || '#f4f4f4';
        submitBtn.disabled    = true;
        messageInput.disabled = true;
        notYourTurnMsg.textContent = 'You have been eliminated. Watching as spectator.';
    } else {
        turnIndicator.textContent = isMyTurn ? 'Your turn!' : `${current.name}'s turn`;
        document.body.style.backgroundColor = current.color;
        messageInput.disabled = !isMyTurn;
        submitBtn.disabled = chatAnimating || messageInput.value.trim() === '';
        notYourTurnMsg.textContent = isMyTurn ? '' : `Waiting for ${current.name}…`;
    }

    renderRoster();
}

function addChatMessage(role, text, color) {
    chatQueue.push({ role, text, color });
    if (!chatAnimating) processNextChat();
}

function processNextChat() {
    if (chatQueue.length === 0) {
        chatAnimating = false;
        submitBtn.disabled = messageInput.value.trim() === '';
        return;
    }
    chatAnimating = true;
    submitBtn.disabled = true;

    const { role, text, color } = chatQueue.shift();
    const el = document.createElement('div');
    el.className = 'chat-message';
    const label = document.createElement('strong');
    if (color) label.style.color = color;
    label.textContent = role + ':';
    const content = document.createElement('span');
    el.appendChild(label);
    el.appendChild(content);
    chatHistory.appendChild(el);

    let i = 0;
    content.textContent = ' ';
    const interval = setInterval(() => {
        content.textContent += text[i++];
        chatHistory.scrollTop = chatHistory.scrollHeight;
        if (i >= text.length) {
            clearInterval(interval);
            processNextChat();
        }
    }, 7);
}

function showGamePanel(deckSize, drawnCard) {
    landingWrapper.style.display = 'none';
    waitingPanel.style.display   = 'none';
    gamePanel.style.display      = 'block';
    updateDeckDisplay(deckSize, drawnCard);
    submitBtn.disabled    = true;
    messageInput.disabled = true;
}

function playDrawAnimation(drawnCard) {
    return new Promise(resolve => {
        const overlay = document.getElementById('animOverlay');
        overlay.innerHTML = '';
        overlay.style.display = 'block';

        const deckRect  = deckVisual.getBoundingClientRect();
        const drawnRect = drawnCardVisual.getBoundingClientRect();
        const w = deckRect.width;
        const h = deckRect.height;
        const cx = window.innerWidth  / 2 - w / 2;
        const cy = window.innerHeight / 2 - h / 2;

        deckVisual.style.visibility      = 'hidden';
        drawnCardVisual.style.visibility = 'hidden';

        const backIconHTML = `
            <div class="back-icon">
                <div class="back-icon-line horizontal"></div>
                <div class="back-icon-line vertical"></div>
                <div class="back-icon-center"></div>
            </div>`;

        const animDeck = document.createElement('div');
        animDeck.className = 'anim-deck';
        animDeck.style.cssText = `width:${w}px;height:${h}px;left:${deckRect.left}px;top:${deckRect.top}px;`;
        animDeck.innerHTML = backIconHTML;
        overlay.appendChild(animDeck);

        const animOuter = document.createElement('div');
        animOuter.className = 'anim-card-outer';
        animOuter.style.cssText = `width:${w}px;height:${h}px;left:${deckRect.left}px;top:${deckRect.top}px;`;

        const inner = document.createElement('div');
        inner.className = 'anim-card-inner';

        const faceBack = document.createElement('div');
        faceBack.className = 'anim-face-back';
        faceBack.innerHTML = backIconHTML;

        const faceFront = document.createElement('div');
        faceFront.className = `anim-face-front card-front ${getSuitColor(drawnCard.suit)}`;
        faceFront.innerHTML = renderCardFace(drawnCard);

        inner.appendChild(faceBack);
        inner.appendChild(faceFront);
        animOuter.appendChild(inner);
        overlay.appendChild(animOuter);

        requestAnimationFrame(() => requestAnimationFrame(() => {
            animDeck.style.left  = cx + 'px';
            animDeck.style.top   = cy + 'px';
            animOuter.style.left = cx + 'px';
            animOuter.style.top  = cy + 'px';
        }));

        setTimeout(() => { inner.style.transform = 'rotateY(180deg)'; }, 550);

        setTimeout(() => {
            animDeck.style.left  = deckRect.left  + 'px';
            animDeck.style.top   = deckRect.top   + 'px';
            animOuter.style.left = drawnRect.left + 'px';
            animOuter.style.top  = drawnRect.top  + 'px';
        }, 1300);

        setTimeout(() => {
            overlay.style.display            = 'none';
            overlay.innerHTML                = '';
            deckVisual.style.visibility      = '';
            drawnCardVisual.style.visibility = '';
            resolve();
        }, 1850);
    });
}

function playMultiCardAnimation(cards) {
    return new Promise(resolve => {
        const overlay = document.getElementById('animOverlay');
        overlay.innerHTML = '';
        overlay.style.display = 'block';

        const deckRect = deckVisual.getBoundingClientRect();
        const w = deckRect.width;
        const h = deckRect.height;
        const gap = 14;
        const totalWidth = cards.length * w + (cards.length - 1) * gap;
        const startX = (window.innerWidth - totalWidth) / 2;
        const cy = window.innerHeight / 2 - h / 2;

        deckVisual.style.visibility = 'hidden';
        drawnCardVisual.style.visibility = 'hidden';

        const backIconHTML = `<div class="back-icon">
            <div class="back-icon-line horizontal"></div>
            <div class="back-icon-line vertical"></div>
            <div class="back-icon-center"></div>
        </div>`;

        const items = cards.map((cardData, i) => {
            const targetX = startX + i * (w + gap);

            const nameEl = document.createElement('div');
            nameEl.style.cssText = `position:fixed;width:${w}px;text-align:center;font-weight:bold;font-size:0.78rem;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                color:${cardData.playerColor || '#222'};
                left:${deckRect.left}px;top:${deckRect.top - 26}px;
                transition:left 0.55s ease,top 0.55s ease,opacity 0.3s;
                opacity:0;z-index:1001;pointer-events:none;`;
            nameEl.textContent = cardData.playerName;
            overlay.appendChild(nameEl);

            const outer = document.createElement('div');
            outer.className = 'anim-card-outer';
            outer.style.cssText = `width:${w}px;height:${h}px;left:${deckRect.left}px;top:${deckRect.top}px;`;

            const inner = document.createElement('div');
            inner.className = 'anim-card-inner';

            const back = document.createElement('div');
            back.className = 'anim-face-back';
            back.innerHTML = backIconHTML;

            const front = document.createElement('div');
            front.className = `anim-face-front card-front ${getSuitColor(cardData.card.suit)}`;
            front.innerHTML = renderCardFace(cardData.card);

            inner.appendChild(back);
            inner.appendChild(front);
            outer.appendChild(inner);
            overlay.appendChild(outer);

            return { outer, inner, nameEl, targetX };
        });

        requestAnimationFrame(() => requestAnimationFrame(() => {
            items.forEach(({ outer, nameEl, targetX }) => {
                outer.style.left = targetX + 'px';
                outer.style.top = cy + 'px';
                nameEl.style.left = targetX + 'px';
                nameEl.style.top = (cy - 26) + 'px';
                nameEl.style.opacity = '1';
            });
        }));

        setTimeout(() => {
            items.forEach(({ inner }) => { inner.style.transform = 'rotateY(180deg)'; });
        }, 600);

        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.innerHTML = '';
            deckVisual.style.visibility = '';
            drawnCardVisual.style.visibility = '';
            resolve();
        }, 2600);
    });
}

function updateDeckDisplay(deckSize, drawnCard) {
    deckVisual.innerText = deckSize > 0 ? 'Deck' : 'Empty';
    drawnCardVisual.className = `card-front ${drawnCard ? getSuitColor(drawnCard.suit) : ''}`;
    drawnCardVisual.innerHTML = renderCardFace(drawnCard);
}

function resetToLanding(errorMsg) {
    landingWrapper.style.display = 'flex';
    waitingPanel.style.display   = 'none';
    gamePanel.style.display      = 'none';
    gameOver    = false;
    gmThinking  = false;
    isSpectator = false;
    isHost      = false;
    players     = [];
    myRoomId    = null;
    inCounterPhase    = false;
    isCounterTarget   = false;
    counterAttackerName = null;
    counterBanner.classList.remove('active');
    chatHistory.innerHTML       = '';
    responseContainer.innerHTML = '';
    gameOverBanner.style.display = 'none';
    lobbyError.textContent = errorMsg || '';
    document.body.style.backgroundColor = '#f4f4f4';
    turnIndicator.textContent   = '';
    notYourTurnMsg.textContent  = '';
    spectatorBar.textContent    = '';
    submitBtn.disabled          = true;
    messageInput.disabled       = false;
    messageInput.value          = '';
    createRoomBtn.disabled      = createNameInput.value.trim() === '';
    updateJoinBtn();
}

// ── Submit action ──────────────────────────────────────
const counterBanner   = document.getElementById('counterBanner');
const typingIndicator = document.getElementById('typingIndicator');
const typingName      = document.getElementById('typingName');

function showTypingIndicator(name, color) {
    typingName.textContent = name + ':';
    typingName.style.color = color || '';
    typingIndicator.style.display = 'flex';
}

function hideTypingIndicator() {
    typingIndicator.style.display = 'none';
}

messageInput.addEventListener('input', () => {
    submitBtn.disabled = chatAnimating || messageInput.value.trim() === '';
    if (messageInput.value.trim()) {
        socket.emit('typing-start');
        showTypingIndicator('You', players.find(p => p.id === myPlayerId)?.color);
    } else {
        socket.emit('typing-stop');
        hideTypingIndicator();
    }
});

socket.on('player-typing', ({ playerName, playerColor, isTyping }) => {
    if (isTyping) showTypingIndicator(playerName, playerColor);
    else hideTypingIndicator();
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitBtn.click();
});

submitBtn.addEventListener('click', () => {
    const msg = messageInput.value.trim();
    if (!msg) return;
    submitBtn.disabled = true;
    messageInput.disabled = true;
    hideTypingIndicator();
    socket.emit('typing-stop');

    if (inCounterPhase && isCounterTarget) {
        socket.emit('submit-counter', { message: msg });
        messageInput.value = '';
        notYourTurnMsg.textContent = 'Counter submitted. Waiting for others…';
    } else {
        responseContainer.innerHTML = '<p><em>Loading…</em></p>';
        socket.emit('submit-action', { message: msg });
        messageInput.value = '';
    }
});

// ── Escape / Leave ─────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (gamePanel.style.display === 'none' && waitingPanel.style.display === 'none') return;
    if (voteOverlay.classList.contains('active')) return;
    if (isSpectator) {
        escapeTitle.textContent    = 'Stop Watching?';
        escapeSubtitle.textContent = 'You will leave this game and return to the lobby.';
    } else {
        escapeTitle.textContent    = 'Leave Game?';
        escapeSubtitle.textContent = 'You will be eliminated and removed from the game.';
    }
    escapeOverlay.classList.toggle('active');
});

cancelLeaveBtn.addEventListener('click', () => escapeOverlay.classList.remove('active'));

confirmLeaveBtn.addEventListener('click', () => {
    escapeOverlay.classList.remove('active');
    socket.emit('player-leave');
});

// ── New Game (host) ────────────────────────────────────
newGameBtn.addEventListener('click', () => {
    newGameBtn.disabled = true;
    socket.emit('new-game-request');
});

// ── Vote UI ────────────────────────────────────────────
function startVoteCountdown(seconds) {
    let remaining = seconds;
    voteCountdown.textContent = remaining;
    voteTimer = setInterval(() => {
        remaining--;
        voteCountdown.textContent = remaining;
        if (remaining <= 0) stopVoteCountdown();
    }, 1000);
}

function stopVoteCountdown() {
    if (voteTimer) { clearInterval(voteTimer); voteTimer = null; }
}

voteAcceptBtn.addEventListener('click', () => {
    stopVoteCountdown();
    voteOverlay.classList.remove('active');
    socket.emit('new-game-response', { accept: true });
});

voteDeclineBtn.addEventListener('click', () => {
    stopVoteCountdown();
    voteOverlay.classList.remove('active');
    socket.emit('new-game-response', { accept: false });
});

// ── Socket events ──────────────────────────────────────
socket.on('public-rooms-updated', (rooms) => {
    renderPublicRooms(rooms);
});

socket.on('room-created', ({ roomId, playerId, players: pl, isPublic, maxPlayers }) => {
    myPlayerId  = playerId;
    myRoomId    = roomId;
    isHost      = true;
    isSpectator = false;
    roomIsPublic = isPublic;
    players     = pl;

    landingWrapper.style.display = 'none';
    waitingPanel.style.display   = 'flex';
    displayRoomCode.textContent  = roomId;

    if (isPublic) {
        publicWaitingBadge.style.display = 'inline-block';
        roomShareMsg.textContent = `Public · max ${maxPlayers} players · visible in the lobby`;
    } else {
        publicWaitingBadge.style.display = 'none';
        roomShareMsg.textContent = 'Share this code with your friends';
    }

    startGameBtn.style.display = 'block';
    startGameBtn.disabled      = true;
    renderWaitingPlayers(pl);
});

socket.on('room-joined', ({ roomId, playerId, players: pl, isPublic, maxPlayers }) => {
    myPlayerId   = playerId;
    myRoomId     = roomId;
    isHost       = false;
    isSpectator  = false;
    roomIsPublic = isPublic;
    players      = pl;

    landingWrapper.style.display = 'none';
    waitingPanel.style.display   = 'flex';
    displayRoomCode.textContent  = roomId;

    if (isPublic) {
        publicWaitingBadge.style.display = 'inline-block';
        roomShareMsg.textContent = `Public · max ${maxPlayers} players`;
    } else {
        publicWaitingBadge.style.display = 'none';
        roomShareMsg.textContent = 'Share this code with your friends';
    }

    startGameBtn.style.display = 'none';
    renderWaitingPlayers(pl);
});

socket.on('joined-as-spectator', ({ roomId, playerId, players: pl, spectators, currentPlayerIndex: idx, deckSize, lastDrawnCard }) => {
    myPlayerId         = playerId;
    myRoomId           = roomId;
    isHost             = false;
    isSpectator        = true;
    players            = pl;
    currentPlayerIndex = idx;
    gameOver           = false;

    showGamePanel(deckSize, lastDrawnCard);
    updateSpectatorBar(spectators.length - 1); // exclude self
    updateTurnUI();
    addChatMessage('System', 'You joined as a spectator. You\'ll play in the next game!', '#6c5ce7');
});

socket.on('spectator-count-changed', ({ spectators }) => {
    const count = spectators.filter(s => s.id !== myPlayerId).length + (isSpectator ? 0 : 0);
    const total = spectators.length;
    updateSpectatorBar(total);
    if (waitingPanel.style.display !== 'none') {
        waitingSpectatorNote.textContent = total > 0 ? `${total} spectator${total > 1 ? 's' : ''} watching` : '';
    }
});

socket.on('player-joined', ({ players: pl }) => {
    players = pl;
    if (waitingPanel.style.display !== 'none') renderWaitingPlayers(pl);
    if (gamePanel.style.display !== 'none') updateTurnUI();
});

socket.on('game-started', ({ players: pl, currentPlayerIndex: idx, deckSize, lastDrawnCard }) => {
    players            = pl;
    currentPlayerIndex = idx;

    waitingPanel.style.display   = 'none';
    landingWrapper.style.display = 'none';
    gamePanel.style.display      = 'block';

    updateTurnUI();
    updateDeckDisplay(deckSize, lastDrawnCard);
    submitBtn.disabled    = isSpectator;
    messageInput.disabled = isSpectator || players[currentPlayerIndex].id !== myPlayerId;
});

socket.on('action-submitted', async ({ playerName, playerColor, message, drawnCard, deckSize }) => {
    gmThinking = true;
    addChatMessage(playerName, message, playerColor);
    await playDrawAnimation(drawnCard);
    updateDeckDisplay(deckSize, drawnCard);
    if (gmThinking) responseContainer.innerHTML = '<p><em>Game Master is thinking…</em></p>';
});

socket.on('gm-response', ({ response, currentPlayerIndex: idx, eliminatedIds, players: pl }) => {
    gmThinking = false;
    inCounterPhase = false;
    isCounterTarget = false;
    counterAttackerName = null;
    counterBanner.classList.remove('active');
    currentPlayerIndex = idx;
    if (pl) players = pl;
    responseContainer.innerHTML = '';
    messageInput.placeholder = 'Enter your action…';
    addChatMessage('Game Master', response, null, true);
    if (eliminatedIds?.length) {
        for (const id of eliminatedIds) {
            const name = players.find(p => p.id === id)?.name;
            if (name) addChatMessage('⚔️ Eliminated', name, '#c32026');
        }
    }
    updateTurnUI();
});

socket.on('game-over', ({ winnerName, players: pl, spectatorCount }) => {
    players    = pl;
    gameOver   = true;
    gmThinking = false;
    responseContainer.innerHTML = '';
    gameOverBanner.style.display = 'flex';
    gameOverText.textContent = `🏆 ${winnerName} wins!`;
    turnIndicator.textContent = 'Game Over';
    submitBtn.disabled    = true;
    messageInput.disabled = true;
    notYourTurnMsg.textContent = '';
    document.body.style.backgroundColor = '#f4f4f4';
    renderRoster();
    addChatMessage('Game Master', `The game is over. ${winnerName} is victorious!`, '#1f70ff');

    if (spectatorCount > 0) {
        gameOverSpectatorNote.textContent = `${spectatorCount} spectator${spectatorCount > 1 ? 's' : ''} waiting to join the next game.`;
    } else {
        gameOverSpectatorNote.textContent = '';
    }

    if (isHost) newGameBtn.style.display = 'inline-block';
    if (isSpectator) {
        addChatMessage('System', 'You\'re in the queue for the next game!', '#6c5ce7');
    }
});

socket.on('new-game-vote', ({ hostName, timeoutMs, spectatorCount }) => {
    if (isHost) return;
    if (isSpectator) {
        // Spectators don't vote — they're automatically included
        addChatMessage('System', `${hostName} wants a new game. You'll be included automatically!`, '#6c5ce7');
        return;
    }
    voteTitle.textContent    = 'Play again?';
    const specNote = spectatorCount > 0 ? ` (${spectatorCount} spectator${spectatorCount > 1 ? 's' : ''} waiting to join)` : '';
    voteSubtitle.textContent = `${hostName} wants to start a new game${specNote}.`;
    voteBtnRow.style.display = 'flex';
    voteOverlay.classList.add('active');
    startVoteCountdown(Math.round(timeoutMs / 1000));
});

socket.on('new-game-started', ({ players: pl, acceptedIds, promotedIds, currentPlayerIndex: idx, deckSize, spectatorCount }) => {
    stopVoteCountdown();
    voteOverlay.classList.remove('active');
    escapeOverlay.classList.remove('active');

    const allNewIds = new Set(acceptedIds);

    // If I was a spectator and got promoted to player
    if (isSpectator && promotedIds?.includes(myPlayerId)) {
        isSpectator = false;
        addChatMessage('System', 'You\'ve been promoted from spectator to player!', '#1a7a3a');
    }

    // If I'm not in the new game at all (declined or wasn't in room)
    if (!allNewIds.has(myPlayerId) && !isSpectator) {
        resetToLanding('The host started a new game without you.');
        return;
    }

    players            = pl;
    currentPlayerIndex = idx;
    gameOver           = false;
    gmThinking         = false;
    inCounterPhase     = false;
    isCounterTarget    = false;
    counterAttackerName = null;
    counterBanner.classList.remove('active');

    gameOverBanner.style.display = 'none';
    newGameBtn.style.display     = 'none';
    newGameBtn.disabled          = false;
    chatHistory.innerHTML        = '';
    responseContainer.innerHTML  = '';
    gameOverSpectatorNote.textContent = '';

    updateSpectatorBar(spectatorCount || 0);
    updateTurnUI();
    updateDeckDisplay(deckSize, null);
});

socket.on('new-game-cancelled', ({ reason }) => {
    stopVoteCountdown();
    voteOverlay.classList.remove('active');
    newGameBtn.disabled = false;
    addChatMessage('System', reason, '#888');
});

socket.on('player-left-voluntarily', ({ playerName, players: pl, currentPlayerIndex: idx }) => {
    players = pl;
    if (idx !== undefined) currentPlayerIndex = idx;
    addChatMessage('⚔️ Left', `${playerName} left the game`, '#c32026');
    if (gamePanel.style.display !== 'none') updateTurnUI();
});

socket.on('you-left', () => {
    stopVoteCountdown();
    voteOverlay.classList.remove('active');
    resetToLanding('');
});

socket.on('player-left', ({ players: pl, currentPlayerIndex: idx }) => {
    players = pl;
    currentPlayerIndex = idx;
    if (gamePanel.style.display !== 'none') updateTurnUI();
    if (waitingPanel.style.display !== 'none') renderWaitingPlayers(pl);
});

socket.on('join-error', ({ message }) => {
    lobbyError.textContent = message;
    createRoomBtn.disabled = createNameInput.value.trim() === '';
    joinRoomBtn.disabled   = false;
    // Re-enable any public room join buttons
    document.querySelectorAll('.room-action-btn').forEach(btn => { btn.disabled = false; });
});

socket.on('gm-error', ({ message }) => {
    gmThinking = false;
    responseContainer.innerHTML = '';
    addChatMessage('Error', message);
    const current = players[currentPlayerIndex];
    if (current?.id === myPlayerId) {
        messageInput.disabled = false;
        submitBtn.disabled    = messageInput.value.trim() === '';
    }
});

socket.on('setup-prompt', ({ playerName, playerId }) => {
    addChatMessage('Game Master', `${playerName}, who are you? Describe your character to the arena.`, '#1f70ff');
    if (playerId === myPlayerId) {
        messageInput.disabled = false;
        messageInput.placeholder = 'Describe your character…';
        submitBtn.disabled = messageInput.value.trim() === '';
        turnIndicator.textContent = 'Introduce yourself!';
        notYourTurnMsg.textContent = '';
    }
});


socket.on('player-chat', ({ playerName, playerColor, message }) => {
    addChatMessage(playerName, message, playerColor);
});

socket.on('action-invalid', ({ reason }) => {
    addChatMessage('Game Master', `${reason} Try again.`, '#e67e22');
    const current = players[currentPlayerIndex];
    if (current?.id === myPlayerId) {
        messageInput.disabled = false;
        submitBtn.disabled = messageInput.value.trim() === '';
    }
});

socket.on('action-repeat', ({ reason }) => {
    addChatMessage('Game Master', reason || 'You\'ve already attempted that. Try a different approach.', '#e67e22');
    const current = players[currentPlayerIndex];
    if (current?.id === myPlayerId) {
        messageInput.disabled = false;
        submitBtn.disabled = messageInput.value.trim() === '';
    }
});

socket.on('counter-phase', ({ attackerName, attackerColor, attackerMessage, targetIds, targetNames }) => {
    inCounterPhase = true;
    isCounterTarget = targetIds.includes(myPlayerId);
    counterAttackerName = attackerName;

    counterBanner.innerHTML = `<strong>${attackerName}</strong> targets <strong>${targetNames.join(' and ')}</strong>`;
    counterBanner.classList.add('active');

    addChatMessage(attackerName, attackerMessage, attackerColor);
    addChatMessage('Game Master', `${attackerName} targets ${targetNames.join(' and ')}! ${targetNames.join(' and ')}, how do you respond?`, '#1f70ff');
    responseContainer.innerHTML = '';
    updateTurnUI();
});

socket.on('counter-received', ({ playerName, playerColor, message, remaining }) => {
    addChatMessage(playerName, message, playerColor);
    if (remaining > 0) {
        responseContainer.innerHTML = `<p><em>Waiting for ${remaining} more counter${remaining > 1 ? 's' : ''}…</em></p>`;
    } else {
        responseContainer.innerHTML = '<p><em>All counters in! Resolving…</em></p>';
    }
    if (isCounterTarget) {
        submitBtn.disabled = true;
        messageInput.disabled = true;
    }
});

socket.on('multi-card-draw', async ({ cards, deckSize }) => {
    await playMultiCardAnimation(cards);
    const attackerCard = cards[0];
    updateDeckDisplay(deckSize, attackerCard.card);
});

socket.on('counter-phase-cancelled', ({ reason }) => {
    inCounterPhase = false;
    isCounterTarget = false;
    counterAttackerName = null;
    counterBanner.classList.remove('active');
    messageInput.placeholder = 'Enter your action…';
    addChatMessage('System', reason, '#888');
    updateTurnUI();
});
