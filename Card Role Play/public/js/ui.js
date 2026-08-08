// ── View layer ─────────────────────────────────────────
// Rules of the house:
//  · nothing a player typed ever reaches innerHTML unescaped
//  · repeating lists build their structure once and have values
//    poked into them, so a hovered button is never destroyed
//    out from under the cursor

import { cardFaceHTML, cardBackSVG, bandFor, cardValue, BANDS } from './cards.js';

export const $ = (id) => document.getElementById(id);

export function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const el = {
    room: $('room'),
    landing: $('landingWrapper'),
    waiting: $('waitingPanel'),
    game: $('gamePanel'),

    playerName: $('playerName'),
    genderSeg: $('genderSeg'),
    youNote: $('youNote'),
    openList: $('openRoomsList'),
    inplayList: $('inplayRoomsList'),
    tabOpen: $('tabOpen'),
    tabInPlay: $('tabInPlay'),
    openCount: $('openCount'),
    inplayCount: $('inplayCount'),

    createBtn: $('createRoomBtn'),
    publicToggle: $('publicToggle'),
    maxRow: $('maxPlayersRow'),
    maxSelect: $('maxPlayersSelect'),
    joinCode: $('joinCodeInput'),
    joinBtn: $('joinRoomBtn'),
    lobbyError: $('lobbyError'),

    roomCode: $('displayRoomCode'),
    shareMsg: $('roomShareMsg'),
    seatList: $('waitingPlayerList'),
    waitStatus: $('waitingStatus'),
    waitSpectators: $('waitingSpectatorNote'),
    startBtn: $('startGameBtn'),

    turnIndicator: $('turnIndicator'),
    candle: $('turnCandle'),
    candleStick: document.querySelector('#turnCandle .stick'),
    candleSecs: $('candleSecs'),
    spectatorBar: $('spectatorBar'),
    counterBanner: $('counterBanner'),
    chronicle: $('chronicle'),
    typing: $('typingIndicator'),
    typingName: $('typingName'),
    input: $('messageInput'),
    submit: $('submitBtn'),
    hint: $('hintLine'),
    deckHolder: $('deckHolder'),
    deckCount: $('deckCount'),
    drawnHolder: $('drawnHolder'),
    verdict: $('verdict'),
    dramatis: $('dramatis'),

    victory: $('victory'),
    victoryName: $('victoryName'),
    victoryEpilogue: $('victoryEpilogue'),
    victoryNote: $('victoryNote'),
    newGameBtn: $('newGameBtn'),

    escapeOverlay: $('escapeOverlay'),
    escapeTitle: $('escapeTitle'),
    escapeSubtitle: $('escapeSubtitle'),
    voteDock: $('voteDock'),
    voteTitle: $('voteTitle'),
    voteSubtitle: $('voteSubtitle'),
    voteCountdown: $('voteCountdown'),
};

// ── The room's light follows whoever holds the turn ────
export function setSeatLight(colour) {
    document.documentElement.style.setProperty('--seat', colour || '#c9a227');
}

// ── Public tables ──────────────────────────────────────
// Rows are keyed by table code and reused; only the text inside
// changes on refresh, so a Join button under the pointer survives.
const rowCache = new Map();

function buildRow(r) {
    const row = document.createElement('div');
    row.className = 'room-row';
    row.innerHTML =
        `<div class="info">
            <div class="code"></div>
            <div class="meta"></div>
        </div>
        <span class="badge"></span>
        <button class="btn sm" type="button"></button>`;
    row.querySelector('.code').textContent = r.id;
    return row;
}

function paintRow(row, r) {
    const full = r.playerCount >= r.maxPlayers;
    const watching = r.spectatorCount > 0 ? ` · ${r.spectatorCount} watching` : '';
    const meta = row.querySelector('.meta');
    const badge = row.querySelector('.badge');
    const btn = row.querySelector('button');

    if (r.status === 'open') {
        meta.textContent = `${r.playerCount} of ${r.maxPlayers} seats taken`;
        badge.className = `badge ${full ? 'full' : 'open'}`;
        badge.textContent = full ? 'Full' : 'Open';
        btn.textContent = 'Sit';
        btn.className = 'btn sm';
        btn.disabled = full;
        btn.dataset.action = 'join';
    } else {
        meta.textContent = `${r.alivePlayers} still standing of ${r.playerCount}${watching}`;
        badge.className = 'badge inplay';
        badge.textContent = 'In Play';
        btn.textContent = 'Watch';
        btn.className = 'btn sm ghost';
        btn.disabled = false;
        btn.dataset.action = 'watch';
    }
    btn.dataset.id = r.id;
}

export function renderRooms(rooms) {
    const open = rooms.filter(r => r.status === 'open');
    const inplay = rooms.filter(r => r.status === 'in-play');
    el.openCount.textContent = open.length;
    el.inplayCount.textContent = inplay.length;

    const seen = new Set();
    const fill = (host, list, emptyMsg) => {
        if (!list.length) {
            if (host.dataset.empty !== '1') {
                host.innerHTML = `<p class="empty-note">${emptyMsg}</p>`;
                host.dataset.empty = '1';
            }
            return;
        }
        host.dataset.empty = '0';
        list.forEach((r, i) => {
            seen.add(r.id);
            let row = rowCache.get(r.id);
            if (!row) { row = buildRow(r); rowCache.set(r.id, row); }
            paintRow(row, r);
            const at = host.children[i];
            if (at !== row) host.insertBefore(row, at || null);
        });
        // drop rows that no longer belong to this list
        while (host.children.length > list.length) host.lastElementChild.remove();
    };

    fill(el.openList, open, 'No tables are waiting. Deal one yourself.');
    fill(el.inplayList, inplay, 'Nothing in play just now.');
    for (const [id, row] of rowCache) if (!seen.has(id)) { row.remove(); rowCache.delete(id); }
}

// ── Waiting room ───────────────────────────────────────
export function renderSeats(players, hostId) {
    el.seatList.replaceChildren(...players.map(p => {
        const li = document.createElement('li');
        li.style.setProperty('--seat-colour', p.color);
        li.innerHTML =
            `<span class="dot" style="background:${esc(p.color)};color:${esc(p.color)}"></span>
             <span class="who"></span>
             <span class="tag"></span>`;
        li.querySelector('.who').textContent = p.name;
        if (p.id === hostId) li.querySelector('.tag').textContent = 'dealer';
        return li;
    }));
}

// ── Dramatis personae ──────────────────────────────────
// Live character sheets: who each player claimed to be, plus
// whatever the tale has done to them since.
export function renderDramatis(players, myId, currentId) {
    el.dramatis.replaceChildren(...players.map(p => {
        const card = document.createElement('div');
        card.className = 'sheet'
            + (p.eliminated ? ' dead' : '')
            + (!p.eliminated && p.id === currentId ? ' active' : '');
        card.style.setProperty('--voice', p.color);

        const name = document.createElement('div');
        name.className = 'name';
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = p.color;
        dot.style.color = p.color;
        name.appendChild(dot);
        name.appendChild(document.createTextNode(p.name));
        if (p.id === myId) {
            const you = document.createElement('span');
            you.className = 'you';
            you.textContent = '(you)';
            name.appendChild(you);
        }
        card.appendChild(name);

        if (p.character) {
            const role = document.createElement('div');
            role.className = 'role';
            role.textContent = p.character;
            card.appendChild(role);
        }

        const marks = [
            ...(p.boons || []).map(t => ['boon', t]),
            ...(p.wounds || []).map(t => ['wound', t]),
            ...(p.status || []).map(t => ['state', t]),
        ];
        if (marks.length) {
            const wrap = document.createElement('div');
            wrap.className = 'marks';
            marks.slice(0, 6).forEach(([kind, text]) => {
                const m = document.createElement('span');
                m.className = 'mark ' + kind;
                m.textContent = text;
                m.title = text;
                wrap.appendChild(m);
            });
            card.appendChild(wrap);
        }

        if (p.eliminated) {
            const s = document.createElement('span');
            s.className = 'skull';
            s.textContent = 'OUT';
            card.appendChild(s);
        }
        return card;
    }));
}

// ── Chronicle ──────────────────────────────────────────
const MAX_ENTRIES = 140;

function trim() {
    while (el.chronicle.children.length > MAX_ENTRIES) el.chronicle.firstElementChild.remove();
}

function atBottom() {
    const c = el.chronicle;
    return c.scrollHeight - c.scrollTop - c.clientHeight < 90;
}

function stick(was) {
    if (was) el.chronicle.scrollTop = el.chronicle.scrollHeight;
}

function entry(kind, speaker, colour) {
    const was = atBottom();
    const e = document.createElement('div');
    e.className = 'entry ' + kind;
    if (colour) e.style.setProperty('--voice', colour);
    const sp = document.createElement('span');
    sp.className = 'speaker';
    sp.textContent = speaker || '';
    const said = document.createElement('span');
    said.className = 'said';
    e.appendChild(sp);
    e.appendChild(said);
    el.chronicle.appendChild(e);
    trim();
    stick(was);
    return said;
}

export function saidBy(name, text, colour) {
    entry('player', name, colour).textContent = text;
}

export function systemLine(text) {
    entry('system', '', null).textContent = text;
}

export function knell(text) {
    entry('knell', '', null).textContent = text;
}

/**
 * The Game Master writes live. Chunks arrive from the server at
 * network pace; this drains them at a readable one, speeding up if
 * it falls behind so it never lags the game.
 */
class Quill {
    constructor(onGlyph) {
        this.target = null;
        this.cursor = null;
        this.queue = '';
        this.raf = 0;
        this.last = 0;
        this.onGlyph = onGlyph;
        this.done = false;
        this.resolve = null;
    }

    open(speaker = 'Game Master') {
        this.close(true);
        this.target = entry('gm', speaker, null);
        this.cursor = document.createElement('span');
        this.cursor.className = 'cursor';
        this.target.after(this.cursor);
        this.queue = '';
        this.done = false;
        this.pump();
    }

    write(text) {
        if (!this.target) this.open();
        this.queue += text;
    }

    /** Resolves once every queued glyph has been laid down. */
    finish() {
        this.done = true;
        if (!this.target) return Promise.resolve();
        if (!this.queue) { this.close(); return Promise.resolve(); }
        return new Promise(r => { this.resolve = r; });
    }

    pump() {
        cancelAnimationFrame(this.raf);
        const step = (t) => {
            if (!this.target) return;
            const dt = this.last ? Math.min(90, t - this.last) : 16;
            this.last = t;

            // Base pace ~78 glyphs/sec, quicker when the buffer is deep
            const backlog = this.queue.length;
            const rate = backlog > 240 ? 340 : backlog > 90 ? 170 : 78;
            let n = Math.max(1, Math.round((dt / 1000) * rate));

            if (n > 0 && backlog) {
                const was = atBottom();
                const chunk = this.queue.slice(0, n);
                this.queue = this.queue.slice(n);
                this.target.textContent += chunk;
                if (this.onGlyph && /\S/.test(chunk)) this.onGlyph();
                stick(was);
            }

            if (this.done && !this.queue) {
                this.close();
                if (this.resolve) { this.resolve(); this.resolve = null; }
                return;
            }
            this.raf = requestAnimationFrame(step);
        };
        this.raf = requestAnimationFrame(step);
    }

    close(silent) {
        cancelAnimationFrame(this.raf);
        this.last = 0;
        if (this.cursor) { this.cursor.remove(); this.cursor = null; }
        if (silent && this.target && this.queue) {
            this.target.textContent += this.queue;   // never lose text
        }
        this.queue = '';
        this.target = null;
    }

    get busy() { return !!this.target; }
}

export const quill = new Quill(null);

export function setQuillGlyphHook(fn) { quill.onGlyph = fn; }

/** Drop a complete GM passage in one piece (no streaming). */
export function gmSays(text) {
    entry('gm', 'Game Master', null).textContent = text;
}

export function clearChronicle() {
    quill.close();
    el.chronicle.replaceChildren();
}

// ── Cards on the rail ──────────────────────────────────
export function paintDeck(count) {
    if (!el.deckHolder.dataset.painted) {
        el.deckHolder.innerHTML = cardBackSVG();
        el.deckHolder.dataset.painted = '1';
    }
    el.deckHolder.classList.toggle('empty', !count);
    el.deckCount.textContent = count === undefined ? '' : `${count} left`;
}

/** `bandKey` comes from the server's resolution — it accounts for
 *  wounds and advantages, so it can differ from the raw card value.
 *  The aura must always show the band the story actually used. */
export function paintDrawn(card, bandKey) {
    el.drawnHolder.innerHTML = cardFaceHTML(card);
    const band = card
        ? (bandKey ? (BANDS.find(b => b.key === bandKey) || bandFor(cardValue(card)))
                   : bandFor(cardValue(card)))
        : null;
    el.drawnHolder.className = 'card-holder aura' + (band ? ' aura-' + band.key : '');
    if (band) {
        el.verdict.style.color = band.ink;
        el.verdict.querySelector('.band').textContent = band.label;
        el.verdict.querySelector('.hint').textContent = band.hint;
        el.verdict.classList.add('show');
    } else {
        el.verdict.classList.remove('show');
    }
}

// ── The turn candle ────────────────────────────────────
let clockTimer = null;

export function startClock(seconds, onTick) {
    stopClock();
    if (!seconds) return;
    const total = seconds;
    let left = seconds;
    const paint = () => {
        const frac = Math.max(0, left / total);
        el.candleStick.style.height = (4 + frac * 22) + 'px';
        el.candleSecs.textContent = left > 0 ? `${left}s` : '';
        el.candle.classList.toggle('urgent', left <= 10);
        el.candle.classList.toggle('out', left <= 0);
        el.candle.style.visibility = 'visible';
    };
    paint();
    clockTimer = setInterval(() => {
        left--;
        paint();
        if (onTick) onTick(left);
        if (left <= 0) stopClock(true);
    }, 1000);
}

export function stopClock(keepOut) {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (!keepOut) {
        el.candle.style.visibility = 'hidden';
        el.candle.classList.remove('urgent', 'out');
        el.candleSecs.textContent = '';
    }
}

// ── Screens ────────────────────────────────────────────
export function show(which) {
    el.landing.style.display = which === 'landing' ? 'flex' : 'none';
    el.waiting.style.display = which === 'waiting' ? 'flex' : 'none';
    el.game.style.display = which === 'game' ? 'block' : 'none';
}

export function showTyping(name, colour) {
    el.typingName.textContent = name;
    el.typingName.style.color = colour || 'var(--parch-dim)';
    el.typing.classList.add('on');
}

export function hideTyping() {
    el.typing.classList.remove('on');
}
