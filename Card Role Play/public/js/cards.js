// ── Cards ──────────────────────────────────────────────
// The faces are not drawn here. They are Dmitry Fomin's
// English-pattern deck, released CC0, split into one file per card by
// tools/fetch-cards.js and served from public/cards/. Provenance is in
// public/cards/SOURCE.txt.
//
// This replaced a hand-drawn set. Drawing engraved court figures as
// SVG paths was never going to land near a deck traced from the real
// thing; this IS the real thing, jokers included, in one consistent
// style, for less code than the imitation took.
//
// What is still ours: the reverse, which belongs to this table rather
// than to a standard deck, and the outcome bands.

export const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const SUIT_GLYPH = { Hearts: '♥', Diamonds: '♦', Clubs: '♣', Spades: '♠' };

export const isRed = (suit) => suit === 'Hearts' || suit === 'Diamonds';
export const suitGlyph = (suit) => SUIT_GLYPH[suit] || '';

export function cardValue(card) {
    if (!card) return 0;
    if (card.joker) return 15;
    switch (card.rank) {
        case 'A': return 14;
        case 'K': return 13;
        case 'Q': return 12;
        case 'J': return 11;
        default: return Number(card.rank) || 0;
    }
}

export function cardName(card) {
    if (!card) return '—';
    return card.joker ? 'the Joker' : `${card.rank} of ${card.suit}`;
}

/** Which artwork file a card is drawn from. */
export function cardArt(card) {
    if (!card) return null;
    // The deck holds two jokers; give them one apiece.
    if (card.joker) return `cards/${card.id === 'j2' ? 'JokerBlack' : 'JokerRed'}.svg`;
    return `cards/${card.rank}${card.suit[0]}.svg`;
}

// ── Outcome bands ──────────────────────────────────────
// The glow around a card IS the rules text. Players learn what a
// number means by seeing the same colour every time it is dealt.
export const BANDS = [
    { max: 4,  key: 'ruin',    label: 'RUIN',    hint: 'it fails, and it costs something', ink: '#7d8ea3', glow: 'rgba(125,142,163,0.55)' },
    { max: 7,  key: 'falter',  label: 'FALTER',  hint: 'mostly fails; a sliver lands',     ink: '#a8763f', glow: 'rgba(168,118,63,0.55)' },
    { max: 10, key: 'mixed',   label: 'MIXED',   hint: 'it half-works, and it costs',      ink: '#c9a227', glow: 'rgba(201,162,39,0.55)' },
    { max: 12, key: 'success', label: 'SUCCESS', hint: 'it works, cleanly',                ink: '#d8b43a', glow: 'rgba(216,180,58,0.72)' },
    { max: 14, key: 'triumph', label: 'TRIUMPH', hint: 'it works beyond hope',             ink: '#f3dc86', glow: 'rgba(243,220,134,0.9)' },
    { max: 99, key: 'fate',    label: 'FATE',    hint: 'the deck writes this one itself',  ink: '#b58cf0', glow: 'rgba(181,140,240,0.85)' },
];

export function bandFor(value) {
    return BANDS.find(b => value <= b.max) || BANDS[BANDS.length - 1];
}

// ── Markup ─────────────────────────────────────────────

/** A card face: an <img> onto its artwork file. */
export function cardFaceHTML(card) {
    if (!card) {
        return `<svg class="card-art" viewBox="0 0 250 350" xmlns="http://www.w3.org/2000/svg"
                     role="img" aria-label="no card">
            <rect x="3" y="3" width="244" height="344" rx="16" fill="rgba(255,255,255,0.02)"
                  stroke="rgba(201,162,39,0.18)" stroke-width="1.5" stroke-dasharray="7 7"/>
            <text x="125" y="184" text-anchor="middle" font-family="Cinzel, serif" font-size="15"
                  fill="rgba(236,224,200,0.22)" letter-spacing="3">NO CARD</text>
        </svg>`;
    }
    return `<img class="card-art" src="${cardArt(card)}" alt="${cardName(card)}" draggable="false">`;
}

/** The reverse. Ours, so it belongs to this table rather than to a
 *  standard deck: oxblood, a gold lattice, four suits on a medallion. */
export function cardBackSVG() {
    const W = 250, H = 350;
    const medallion = SUITS.map((s, i) => {
        const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const cx = 125 + Math.cos(a) * 40, cy = 175 + Math.sin(a) * 40;
        return `<text x="${cx.toFixed(1)}" y="${(cy + 7.5).toFixed(1)}" text-anchor="middle"
                  font-size="22" fill="#c9a227">${SUIT_GLYPH[s]}</text>`;
    }).join('');

    return `<svg class="card-art" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
                 role="img" aria-label="card back">
        <defs>
            <pattern id="lattice" width="17" height="17" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d="M0 0 H17 M0 0 V17" stroke="rgba(201,162,39,0.30)" stroke-width="0.9" fill="none"/>
                <circle cx="0" cy="0" r="1.5" fill="rgba(201,162,39,0.34)"/>
            </pattern>
            <radialGradient id="backField" cx="0.5" cy="0.42" r="0.75">
                <stop offset="0" stop-color="#5c1f1c"/>
                <stop offset="1" stop-color="#2c100f"/>
            </radialGradient>
        </defs>
        <rect x="0" y="0" width="${W}" height="${H}" rx="17" fill="#f4ead4"/>
        <rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="12" fill="url(#backField)"/>
        <rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="12" fill="url(#lattice)"/>
        <rect x="15" y="15" width="${W - 30}" height="${H - 30}" rx="8" fill="none"
              stroke="rgba(201,162,39,0.55)" stroke-width="1.6"/>
        <rect x="21" y="21" width="${W - 42}" height="${H - 42}" rx="6" fill="none"
              stroke="rgba(201,162,39,0.28)" stroke-width="0.8"/>
        <circle cx="125" cy="175" r="62" fill="rgba(20,8,8,0.5)" stroke="rgba(201,162,39,0.5)" stroke-width="1.4"/>
        <circle cx="125" cy="175" r="54" fill="none" stroke="rgba(201,162,39,0.28)" stroke-width="0.8"/>
        ${medallion}
        <circle cx="125" cy="175" r="13" fill="rgba(201,162,39,0.9)"/>
        <circle cx="125" cy="175" r="8" fill="#2c100f"/>
        <circle cx="125" cy="175" r="3.4" fill="rgba(201,162,39,0.9)"/>
    </svg>`;
}
