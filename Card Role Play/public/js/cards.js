// ── Card rendering ─────────────────────────────────────
// Every card is drawn as SVG: pip layouts follow real playing-card
// convention (lower half inverted), courts are illustrated busts
// mirrored about the centre, and the back carries a guilloché field.

export const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const SUIT_GLYPH = { Hearts: '♥', Diamonds: '♦', Clubs: '♣', Spades: '♠' };

// Suit silhouettes normalised to a 100×100 box.
const SUIT_PATH = {
    Hearts:
        'M50 90 C22 68 4 48 4 30 C4 14 16 5 29 5 C39 5 46 11 50 19 ' +
        'C54 11 61 5 71 5 C84 5 96 14 96 30 C96 48 78 68 50 90 Z',
    Diamonds:
        'M50 3 L93 50 L50 97 L7 50 Z',
    Clubs:
        'M50 4 C61 4 70 13 70 24 C70 28 69 32 67 35 C70 33 74 32 78 32 ' +
        'C89 32 97 41 97 51 C97 62 89 70 78 70 C69 70 62 65 58 58 ' +
        'C58 64 61 73 65 81 C67 85 69 89 71 93 L29 93 C31 89 33 85 35 81 ' +
        'C39 73 42 64 42 58 C38 65 31 70 22 70 C11 70 3 62 3 51 ' +
        'C3 41 11 32 22 32 C26 32 30 33 33 35 C31 32 30 28 30 24 C30 13 39 4 50 4 Z',
    Spades:
        'M50 4 C50 4 93 35 93 58 C93 73 83 81 72 81 C64 81 57 77 54 71 ' +
        'C54 71 56 84 66 93 L34 93 C44 84 46 71 46 71 C43 77 36 81 28 81 ' +
        'C17 81 7 73 7 58 C7 35 50 4 50 4 Z',
};

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

// ── Outcome bands ──────────────────────────────────────
// The glow around a card IS the rules text. Players learn what a
// number means by seeing the same colour every time it is dealt.
export const BANDS = [
    { max: 4,  key: 'ruin',    label: 'RUIN',     hint: 'it fails, and it costs something',  ink: '#7d8ea3', glow: 'rgba(125,142,163,0.55)' },
    { max: 7,  key: 'falter',  label: 'FALTER',   hint: 'mostly fails; a sliver lands',      ink: '#a8763f', glow: 'rgba(168,118,63,0.55)' },
    { max: 10, key: 'mixed',   label: 'MIXED',    hint: 'it half-works, and it costs',       ink: '#c9a227', glow: 'rgba(201,162,39,0.55)' },
    { max: 12, key: 'success', label: 'SUCCESS',  hint: 'it works, cleanly',                 ink: '#d8b43a', glow: 'rgba(216,180,58,0.72)' },
    { max: 14, key: 'triumph', label: 'TRIUMPH',  hint: 'it works beyond hope',              ink: '#f3dc86', glow: 'rgba(243,220,134,0.9)' },
    { max: 99, key: 'fate',    label: 'FATE',     hint: 'the deck writes this one itself',   ink: '#b58cf0', glow: 'rgba(181,140,240,0.85)' },
];

export function bandFor(value) {
    return BANDS.find(b => value <= b.max) || BANDS[BANDS.length - 1];
}

// ── Pip geometry ───────────────────────────────────────
// Column x and row y in 0..1 of the pip field. Pips below the
// midline are rotated 180°, exactly as on a printed deck.
const CL = 0.26, CC = 0.5, CR = 0.74;
const PIP_LAYOUT = {
    '2':  [[CC, 0.13], [CC, 0.87]],
    '3':  [[CC, 0.13], [CC, 0.50], [CC, 0.87]],
    '4':  [[CL, 0.13], [CR, 0.13], [CL, 0.87], [CR, 0.87]],
    '5':  [[CL, 0.13], [CR, 0.13], [CC, 0.50], [CL, 0.87], [CR, 0.87]],
    '6':  [[CL, 0.13], [CR, 0.13], [CL, 0.50], [CR, 0.50], [CL, 0.87], [CR, 0.87]],
    '7':  [[CL, 0.13], [CR, 0.13], [CC, 0.315], [CL, 0.50], [CR, 0.50], [CL, 0.87], [CR, 0.87]],
    '8':  [[CL, 0.13], [CR, 0.13], [CC, 0.315], [CL, 0.50], [CR, 0.50], [CC, 0.685], [CL, 0.87], [CR, 0.87]],
    '9':  [[CL, 0.13], [CR, 0.13], [CL, 0.377], [CR, 0.377], [CC, 0.50], [CL, 0.623], [CR, 0.623], [CL, 0.87], [CR, 0.87]],
    '10': [[CL, 0.13], [CR, 0.13], [CC, 0.245], [CL, 0.377], [CR, 0.377], [CL, 0.623], [CR, 0.623], [CC, 0.755], [CL, 0.87], [CR, 0.87]],
};

// Card geometry (viewBox units)
const W = 250, H = 350;
const FIELD = { x: 52, y: 46, w: 146, h: 258 };   // pip field
const PIP = 30;                                    // pip box size

function pip(suit, cx, cy, size, colour, rotate) {
    const s = size / 100;
    const t = `translate(${cx - size / 2} ${cy - size / 2}) scale(${s})`;
    const r = rotate ? `rotate(180 ${cx} ${cy}) ` : '';
    return `<path d="${SUIT_PATH[suit]}" fill="${colour}" transform="${r}${t}"/>`;
}

// ── Court illustrations ────────────────────────────────
// A bust drawn in a 104×124 box, then stamped twice (once rotated)
// so the card reads correctly from either end.
function courtFigure(rank, suit) {
    const red = isRed(suit);
    const cloth = red ? '#9d2d26' : '#22303f';   // robe
    const cloth2 = red ? '#c1443a' : '#33475d';  // robe highlight
    const gold = '#c9a227';
    const gold2 = '#8a6f22';
    const ink = '#1b1512';
    const skin = '#e8cfa9';

    const parts = [];

    // Shoulders / robe
    parts.push(`<path d="M14 124 L14 96 C14 80 30 70 52 70 C74 70 90 80 90 96 L90 124 Z" fill="${cloth}"/>`);
    parts.push(`<path d="M14 124 L14 96 C14 84 24 76 38 72 L44 124 Z" fill="${cloth2}" opacity="0.55"/>`);
    // Robe trim
    parts.push(`<path d="M14 124 L14 96 C14 80 30 70 52 70 C74 70 90 80 90 96 L90 124" fill="none" stroke="${gold2}" stroke-width="2"/>`);
    // Collar
    parts.push(`<path d="M34 74 C40 88 64 88 70 74 L78 78 C70 96 34 96 26 78 Z" fill="${gold}" stroke="${gold2}" stroke-width="1.2"/>`);
    // Neck
    parts.push(`<path d="M44 60 L60 60 L60 78 L44 78 Z" fill="${skin}"/>`);
    // Head
    parts.push(`<ellipse cx="52" cy="42" rx="20" ry="23" fill="${skin}" stroke="${ink}" stroke-width="1.4"/>`);
    // Eye + brow (profile-ish three-quarter)
    parts.push(`<path d="M44 38 q5 -3 10 0" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/>`);
    parts.push(`<circle cx="49" cy="42" r="2.1" fill="${ink}"/>`);
    parts.push(`<path d="M58 46 q3 3 0 5" fill="none" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/>`);

    if (rank === 'K') {
        // Beard + long hair
        parts.push(`<path d="M32 44 C30 62 38 76 52 76 C66 76 74 62 72 44 C72 58 64 66 52 66 C40 66 32 58 32 44 Z" fill="#4a3527"/>`);
        parts.push(`<path d="M34 50 C36 70 44 80 52 80 C60 80 68 70 70 50 C66 68 60 74 52 74 C44 74 38 68 34 50 Z" fill="#5c4433"/>`);
        parts.push(`<path d="M52 52 q-9 2 -10 12 q10 6 20 0 q-1 -10 -10 -12 Z" fill="#6b5140"/>`);
        // Crown
        parts.push(`<path d="M28 24 L34 8 L42 20 L52 4 L62 20 L70 8 L76 24 Z" fill="${gold}" stroke="${gold2}" stroke-width="1.4"/>`);
        parts.push(`<rect x="28" y="22" width="48" height="8" rx="2" fill="${gold}" stroke="${gold2}" stroke-width="1.2"/>`);
        parts.push(`<circle cx="52" cy="26" r="3" fill="${cloth}"/>`);
        parts.push(`<circle cx="38" cy="26" r="2.2" fill="${cloth}"/>`);
        parts.push(`<circle cx="66" cy="26" r="2.2" fill="${cloth}"/>`);
        // Sword held upright
        parts.push(`<rect x="82" y="30" width="5" height="70" fill="#cfd6dd" stroke="${ink}" stroke-width="0.9"/>`);
        parts.push(`<path d="M84.5 22 L88 32 L81 32 Z" fill="#e6ebf0" stroke="${ink}" stroke-width="0.9"/>`);
        parts.push(`<rect x="74" y="98" width="21" height="5" rx="2" fill="${gold}" stroke="${gold2}" stroke-width="1"/>`);
        parts.push(`<rect x="81" y="102" width="7" height="14" rx="2" fill="${gold2}"/>`);
    } else if (rank === 'Q') {
        // Flowing hair
        parts.push(`<path d="M30 40 C26 20 38 10 52 10 C66 10 78 20 74 40 C74 26 64 20 52 20 C40 20 30 26 30 40 Z" fill="#4a3527"/>`);
        parts.push(`<path d="M30 38 C24 56 26 78 22 96 L34 96 C34 76 34 56 36 42 Z" fill="#5c4433"/>`);
        parts.push(`<path d="M74 38 C80 56 78 78 82 96 L70 96 C70 76 70 56 68 42 Z" fill="#5c4433"/>`);
        // Coronet
        parts.push(`<path d="M32 20 L38 8 L45 17 L52 5 L59 17 L66 8 L72 20 Z" fill="${gold}" stroke="${gold2}" stroke-width="1.3"/>`);
        parts.push(`<circle cx="52" cy="13" r="2.6" fill="${cloth}"/>`);
        // Rose on a stem
        parts.push(`<path d="M86 44 C86 38 92 34 96 38 C100 34 104 40 101 45 C104 49 100 55 95 53 C90 56 85 51 86 44 Z" fill="${red ? '#c1443a' : '#8fa8bf'}" stroke="${gold2}" stroke-width="0.9"/>`);
        parts.push(`<circle cx="94" cy="45" r="3.4" fill="${red ? '#9d2d26' : '#5d7a8f'}" opacity="0.8"/>`);
        parts.push(`<path d="M93 54 C92 72 88 86 86 100" fill="none" stroke="#4a7a45" stroke-width="2.4"/>`);
        parts.push(`<path d="M92 68 q-10 -4 -14 4 q10 5 14 -4 Z" fill="#4a7a45"/>`);
    } else {
        // Jack — feathered cap, halberd
        parts.push(`<path d="M32 34 C28 18 40 8 52 8 C64 8 76 18 72 34 C70 22 62 18 52 18 C42 18 34 22 32 34 Z" fill="#4a3527"/>`);
        parts.push(`<path d="M26 30 C26 16 38 6 52 6 C68 6 80 16 78 30 L72 26 C70 16 62 12 52 12 C42 12 33 17 31 27 Z" fill="${cloth}" stroke="${gold2}" stroke-width="1.2"/>`);
        parts.push(`<path d="M78 26 C90 18 98 6 96 -2 C88 4 80 12 74 22 Z" fill="${gold}" stroke="${gold2}" stroke-width="1"/>`);
        parts.push(`<path d="M30 40 C26 56 28 74 26 96 L36 96 C36 74 34 56 36 44 Z" fill="#5c4433"/>`);
        // Halberd
        parts.push(`<rect x="84" y="26" width="4.6" height="76" fill="#6b4f31" stroke="${ink}" stroke-width="0.8"/>`);
        parts.push(`<path d="M86 12 L90 26 L82 26 Z" fill="#cfd6dd" stroke="${ink}" stroke-width="0.9"/>`);
        parts.push(`<path d="M88 28 C98 30 100 40 94 46 L88 42 Z" fill="#cfd6dd" stroke="${ink}" stroke-width="0.9"/>`);
    }

    return parts.join('');
}

function courtCard(card) {
    const { rank, suit } = card;
    const colour = isRed(suit) ? 'var(--suit-red)' : 'var(--suit-ink)';
    const fig = courtFigure(rank, suit);
    return `
        <g clip-path="url(#courtClip)">
            <rect x="52" y="46" width="146" height="258" fill="#f0e4cc"/>
            <g transform="translate(73 48)">${fig}</g>
            <g transform="rotate(180 125 175) translate(73 48)">${fig}</g>
        </g>
        <rect x="52" y="46" width="146" height="258" fill="none" stroke="#b09a6a" stroke-width="1.6"/>
        <line x1="52" y1="175" x2="198" y2="175" stroke="#b09a6a" stroke-width="1.6"/>
        <line x1="52" y1="171" x2="198" y2="171" stroke="#b09a6a" stroke-width="0.7"/>
        <line x1="52" y1="179" x2="198" y2="179" stroke="#b09a6a" stroke-width="0.7"/>
        <text x="125" y="180" text-anchor="middle" font-family="Cinzel, serif" font-size="15"
              font-weight="700" fill="${colour}" opacity="0.85">${rank}</text>`;
}

function aceCard(card) {
    const colour = isRed(card.suit) ? 'var(--suit-red)' : 'var(--suit-ink)';
    return `
        <g opacity="0.5" stroke="#b09a6a" fill="none" stroke-width="1.2">
            <circle cx="125" cy="175" r="74"/>
            <circle cx="125" cy="175" r="66" stroke-width="0.6"/>
            <path d="M125 95 q22 34 0 46 q-22 -12 0 -46 Z"/>
            <path d="M125 255 q22 -34 0 -46 q-22 12 0 46 Z"/>
            <path d="M45 175 q34 22 46 0 q-12 -22 -46 0 Z"/>
            <path d="M205 175 q-34 22 -46 0 q12 -22 46 0 Z"/>
        </g>
        ${pip(card.suit, 125, 175, 92, colour, false)}`;
}

function numberCard(card) {
    const colour = isRed(card.suit) ? 'var(--suit-red)' : 'var(--suit-ink)';
    const layout = PIP_LAYOUT[card.rank] || [];
    return layout.map(([fx, fy]) => {
        const cx = FIELD.x + fx * FIELD.w;
        const cy = FIELD.y + fy * FIELD.h;
        return pip(card.suit, cx, cy, PIP, colour, fy > 0.5);
    }).join('');
}

function corner(card, flipped) {
    const colour = isRed(card.suit) ? 'var(--suit-red)' : 'var(--suit-ink)';
    const t = flipped ? `rotate(180 125 175)` : '';
    return `
        <g transform="${t}">
            <text x="26" y="42" text-anchor="middle" font-family="Cinzel, serif" font-size="30"
                  font-weight="700" fill="${colour}" letter-spacing="-1">${card.rank}</text>
            ${pip(card.suit, 26, 62, 20, colour, false)}
        </g>`;
}

function jokerCard() {
    return `
        <rect x="52" y="46" width="146" height="258" fill="#1d1630"/>
        <g opacity="0.35" stroke="#b58cf0" fill="none" stroke-width="0.8">
            ${Array.from({ length: 9 }, (_, i) =>
                `<circle cx="125" cy="175" r="${18 + i * 12}"/>`).join('')}
        </g>
        <g transform="translate(125 175)">
            <path d="M-34 34 C-34 8 -18 -8 0 -8 C18 -8 34 8 34 34 Z" fill="#3a2a5c"/>
            <ellipse cx="0" cy="-24" rx="17" ry="19" fill="#e8cfa9" stroke="#1b1512" stroke-width="1.3"/>
            <circle cx="-6" cy="-26" r="2" fill="#1b1512"/>
            <circle cx="6" cy="-26" r="2" fill="#1b1512"/>
            <path d="M-8 -16 q8 6 16 0" fill="none" stroke="#1b1512" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M-18 -38 C-30 -54 -44 -58 -50 -52 C-44 -44 -34 -38 -24 -34 Z" fill="#8f2b24"/>
            <path d="M18 -38 C30 -54 44 -58 50 -52 C44 -44 34 -38 24 -34 Z" fill="#2f6a5e"/>
            <path d="M-19 -40 C-14 -56 -6 -62 0 -62 C6 -62 14 -56 19 -40 Z" fill="#c9a227"/>
            <circle cx="-50" cy="-52" r="4.5" fill="#c9a227"/>
            <circle cx="50" cy="-52" r="4.5" fill="#c9a227"/>
            <circle cx="0" cy="-63" r="4.5" fill="#8f2b24"/>
            <path d="M-34 34 C-34 8 -18 -8 0 -8 C18 -8 34 8 34 34 Z" fill="none" stroke="#c9a227" stroke-width="1.4"/>
        </g>
        <text x="125" y="292" text-anchor="middle" font-family="Cinzel, serif" font-size="17"
              font-weight="700" fill="#b58cf0" letter-spacing="4">FATE</text>
        <text x="26" y="42" text-anchor="middle" font-family="Cinzel, serif" font-size="26"
              font-weight="700" fill="#b58cf0">★</text>
        <text x="224" y="316" text-anchor="middle" font-family="Cinzel, serif" font-size="26"
              font-weight="700" fill="#b58cf0" transform="rotate(180 224 308)">★</text>`;
}

/** Full card face as an <svg> string. */
export function cardFaceSVG(card, opts = {}) {
    const cls = opts.class ? ` class="${opts.class}"` : '';
    if (!card) {
        return `<svg${cls} viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="no card">
            <rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="16" fill="rgba(255,255,255,0.02)"
                  stroke="rgba(201,162,39,0.18)" stroke-width="1.5" stroke-dasharray="7 7"/>
            <text x="125" y="184" text-anchor="middle" font-family="Cinzel, serif" font-size="15"
                  fill="rgba(236,224,200,0.22)" letter-spacing="3">NO CARD</text>
        </svg>`;
    }

    const body = card.joker ? jokerCard()
        : card.rank === 'A' ? aceCard(card)
        : ['J', 'Q', 'K'].includes(card.rank) ? courtCard(card)
        : numberCard(card);

    const corners = card.joker ? '' : corner(card, false) + corner(card, true);
    const label = card.joker ? 'Joker' : `${card.rank} of ${card.suit}`;

    return `<svg${cls} viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">
        <defs>
            <clipPath id="courtClip"><rect x="52" y="46" width="146" height="258"/></clipPath>
            <linearGradient id="stock" x1="0" y1="0" x2="0.4" y2="1">
                <stop offset="0" stop-color="#fbf5e6"/>
                <stop offset="0.55" stop-color="#f4ead4"/>
                <stop offset="1" stop-color="#e9dcc0"/>
            </linearGradient>
        </defs>
        <rect x="0" y="0" width="${W}" height="${H}" rx="17" fill="url(#stock)"/>
        <rect x="1.2" y="1.2" width="${W - 2.4}" height="${H - 2.4}" rx="16" fill="none"
              stroke="#c3b189" stroke-width="2.4"/>
        <rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="11" fill="none"
              stroke="#d9c9a3" stroke-width="1"/>
        ${body}
        ${corners}
    </svg>`;
}

/** The reverse: oxblood field, gold lattice, four-suit medallion. */
export function cardBackSVG(opts = {}) {
    const cls = opts.class ? ` class="${opts.class}"` : '';
    const medallion = SUITS.map((s, i) => {
        const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const cx = 125 + Math.cos(a) * 40, cy = 175 + Math.sin(a) * 40;
        return pip(s, cx, cy, 19, '#c9a227', false);
    }).join('');

    return `<svg${cls} viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="card back">
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

/** Small inline suit mark for prose/labels. */
export function suitMarkSVG(suit, size = 12) {
    const colour = isRed(suit) ? 'var(--suit-red)' : 'currentColor';
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" style="vertical-align:-1px">
        <path d="${SUIT_PATH[suit]}" fill="${colour}"/></svg>`;
}

export function cardName(card) {
    if (!card) return '—';
    return card.joker ? 'the Joker' : `${card.rank} of ${card.suit}`;
}
