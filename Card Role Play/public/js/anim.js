// ── Card choreography ──────────────────────────────────
// Cards fly out of the deck, turn over in the middle of the
// room, and settle. In a counter, they meet each other.

import { cardFaceHTML, cardBackSVG, bandFor, cardValue, BANDS } from './cards.js';
import * as sfx from './audio.js';

const layer = () => document.getElementById('animLayer');

/** Prefer the band the server resolved (it knows about wounds). */
const bandOf = (card, key, value) =>
    (key && BANDS.find(b => b.key === key))
    || bandFor(value ?? cardValue(card));

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const twoFrames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function flyCard(card, rect, rot = 0) {
    const el = document.createElement('div');
    el.className = 'fly';
    el.style.cssText =
        `width:${rect.width}px;height:${rect.height}px;left:${rect.left}px;top:${rect.top}px;` +
        `transform:rotate(${rot}deg);`;
    el.innerHTML =
        `<div class="inner">
            <div class="face back">${cardBackSVG()}</div>
            <div class="face front">${cardFaceHTML(card)}</div>
        </div>`;
    return el;
}

function label(text, colour, rect) {
    const el = document.createElement('div');
    el.className = 'fly-name';
    el.style.cssText =
        `width:${rect.width}px;left:${rect.left}px;top:${rect.top - 24}px;color:${colour || '#ece0c8'};`;
    el.textContent = text;
    return el;
}

function tag(text, colour, rect) {
    const el = document.createElement('div');
    el.className = 'fly-tag';
    el.style.cssText =
        `width:${rect.width}px;left:${rect.left}px;top:${rect.top + rect.height + 8}px;color:${colour};`;
    el.textContent = text;
    return el;
}

function spark(x, y) {
    const el = document.createElement('div');
    el.className = 'spark';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    return el;
}

/** Geometry for a centred row of n cards that always fits the window. */
function rowLayout(n, base) {
    const gap = Math.max(8, Math.min(18, window.innerWidth * 0.014));
    const maxW = window.innerWidth - 32;
    let w = base.width;
    let h = base.height;
    if (n * w + (n - 1) * gap > maxW) {
        w = Math.max(52, (maxW - (n - 1) * gap) / n);
        h = w * (base.height / base.width);
    }
    const total = n * w + (n - 1) * gap;
    const startX = (window.innerWidth - total) / 2;
    const y = Math.max(58, window.innerHeight / 2 - h / 2 - 10);
    return { w, h, gap, startX, y };
}

/**
 * One card off the top of the deck: arc to the middle, turn over,
 * then slide into the drawn slot.
 */
export async function dealOne(card, deckEl, slotEl, bandKey) {
    const L = layer();
    if (!L || !card) return;

    const from = deckEl.getBoundingClientRect();
    const to = slotEl.getBoundingClientRect();
    if (!from.width || !to.width) return;

    if (reduced()) { sfx.play('flip'); return; }

    L.innerHTML = '';
    L.classList.add('on');

    const el = flyCard(card, from, -4);
    L.appendChild(el);

    deckEl.style.visibility = 'hidden';
    slotEl.style.visibility = 'hidden';

    const cx = window.innerWidth / 2 - from.width / 2;
    const cy = Math.max(52, window.innerHeight / 2 - from.height / 2 - 10);

    sfx.play('deal');
    await twoFrames();
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    el.style.transform = 'rotate(0deg) scale(1.1)';

    await wait(500);
    sfx.play('flip');
    el.querySelector('.inner').style.transform = 'rotateY(180deg)';

    await wait(620);
    const band = bandOf(card, bandKey);
    sfx.play('verdict', band.key);
    // On the face, not the .inner — see the note in theme.css.
    // No spread, so the light starts at the card's edge rather than
    // ringing it — same reasoning as the .aura tiers.
    el.querySelector('.face.front').style.boxShadow =
        `0 0 28px ${band.glow}, 0 16px 30px rgba(0,0,0,0.7)`;

    await wait(620);
    el.style.left = to.left + 'px';
    el.style.top = to.top + 'px';
    el.style.width = to.width + 'px';
    el.style.height = to.height + 'px';
    el.style.transform = 'rotate(0deg) scale(1)';

    await wait(520);
    sfx.play('land');
    L.classList.remove('on');
    L.innerHTML = '';
    deckEl.style.visibility = '';
    slotEl.style.visibility = '';
}

/**
 * The counter. Every card is dealt at once and named, then the
 * attacker's card is set against each defender's in turn: higher
 * value wins, and you watch it happen.
 *
 * cards[0] is the attacker. Each entry: {playerName, playerColor,
 * card, cardValue, beaten}.
 */
export async function dealClash(cards, deckEl) {
    const L = layer();
    if (!L || !cards?.length) return;

    const from = deckEl.getBoundingClientRect();
    if (!from.width) return;

    if (reduced()) { sfx.play('clash'); return; }

    L.innerHTML = '';
    L.classList.add('on');
    deckEl.style.visibility = 'hidden';

    const { w, h, gap, startX, y } = rowLayout(cards.length, from);
    const items = cards.map((c, i) => {
        const el = flyCard(c.card, from, (i - cards.length / 2) * 2);
        const nm = label(c.playerName, c.playerColor, from);
        L.appendChild(nm);
        L.appendChild(el);
        return { ...c, el, nm, x: startX + i * (w + gap) };
    });

    // Fan out
    sfx.play('shuffle');
    await twoFrames();
    items.forEach(({ el, nm, x }) => {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        el.style.transform = 'rotate(0deg)';
        nm.style.left = x + 'px';
        nm.style.top = (y - 24) + 'px';
        nm.style.width = w + 'px';
        nm.style.opacity = '1';
    });

    // Turn them over together, so nobody learns their fate first
    await wait(560);
    sfx.play('flip');
    items.forEach(({ el }) => { el.querySelector('.inner').style.transform = 'rotateY(180deg)'; });

    await wait(660);
    items.forEach(({ el, card, value }) => {
        const band = bandOf(card, null, value);
        el.querySelector('.face.front').style.boxShadow =
            `0 0 22px ${band.glow}, 0 14px 26px rgba(0,0,0,0.65)`;
    });
    sfx.play('verdict', bandOf(items[0].card, null, items[0].value).key);

    // Set them against each other
    await wait(900);
    const [atk, ...defs] = items;
    if (defs.length) {
        const midY = y;
        const atkX = window.innerWidth / 2 - w - 14;
        atk.el.style.left = atkX + 'px';
        atk.el.style.top = midY + 'px';
        atk.el.style.transform = 'rotate(-7deg)';
        atk.nm.style.left = atkX + 'px';
        atk.nm.style.top = (midY - 24) + 'px';

        for (let i = 0; i < defs.length; i++) {
            const d = defs[i];
            const dX = window.innerWidth / 2 + 14;
            d.el.style.zIndex = String(60 - i);
            d.el.style.left = dX + 'px';
            d.el.style.top = (midY + i * 13) + 'px';
            d.el.style.transform = `rotate(${6 + i * 2}deg)`;
            d.nm.style.left = dX + 'px';
            d.nm.style.top = (midY - 24 + i * 13) + 'px';

            await wait(300);
            const s = spark(window.innerWidth / 2, midY + h / 2);
            L.appendChild(s);
            void s.offsetWidth;
            s.classList.add('flash');
            sfx.play('clash');

            // beaten === true means this defender turned the action aside
            const held = d.beaten === true;
            d.el.classList.add(held ? 'winner' : 'loser');
            const t = tag(held ? 'TURNED ASIDE' : 'OVERCOME',
                held ? '#f3dc86' : '#8d8578',
                { left: dX, top: midY + i * 13, width: w, height: h });
            L.appendChild(t);
            void t.offsetWidth;
            t.classList.add('on');
            await wait(180);
        }

        const anyHeld = defs.some(d => d.beaten === true);
        atk.el.classList.add(anyHeld && defs.every(d => d.beaten === true) ? 'loser' : 'winner');
    }

    await wait(1500);
    L.classList.remove('on');
    L.innerHTML = '';
    deckEl.style.visibility = '';
}

/** Riffle the deck in place when it is rebuilt. */
export async function shuffleDeck(deckEl) {
    sfx.play('shuffle');
    if (!deckEl || reduced()) return;
    deckEl.animate(
        [
            { transform: 'translateY(0) rotate(0deg)' },
            { transform: 'translateY(-9px) rotate(-3deg)' },
            { transform: 'translateY(0) rotate(2deg)' },
            { transform: 'translateY(-4px) rotate(-1deg)' },
            { transform: 'translateY(0) rotate(0deg)' },
        ],
        { duration: 620, easing: 'ease-in-out' }
    );
    await wait(620);
}
