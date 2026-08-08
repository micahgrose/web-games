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
// Drawn the way a real court card is drawn: dense outlined linework
// filling the panel edge to edge, a half-length figure cropped at the
// waist, then stamped twice so the card reads from either end.
// Traditional colouring — red, blue, gold and cream on heavy black
// line — with the suit deciding which of red or blue leads.

const CINK   = '#1a1512';   // every outline
const CSKIN  = '#f2ddbd';
const CRED   = '#c2302a';
const CBLUE  = '#2c4a78';
const CGOLD  = '#e2b53f';
const CCREAM = '#f6efdc';
const CHAIR  = '#c9902f';
const CBEARD = '#8d6b45';
const CSTEEL = '#c3ccd4';
const CLEAF  = '#4f7a44';

/** A half-length figure in a 146 × 129 box. */
function courtFigure(rank, suit) {
    const lead = isRed(suit) ? CRED : CBLUE;     // robe
    const trim = isRed(suit) ? CBLUE : CRED;     // mantle and jewels
    const p = [];
    const add = (s) => p.push(s);

    // Outlined band: a thick ink stroke with the colour laid over it.
    const band = (d, colour, w) =>
        `<path d="${d}" fill="none" stroke="${CINK}" stroke-width="${w + 2.2}" stroke-linecap="round"/>` +
        `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${w}" stroke-linecap="round"/>`;

    // ── Garment ────────────────────────────────────────
    add(`<path d="M4 129 L4 110 C4 95 24 83 48 78 L98 78 C122 83 142 95 142 110 L142 129 Z"
          fill="${lead}" stroke="${CINK}" stroke-width="1.6"/>`);

    // Mantle over each shoulder
    add(`<path d="M4 129 L4 110 C4 97 20 87 40 82 L50 97 C32 102 21 109 21 117 L21 129 Z"
          fill="${trim}" stroke="${CINK}" stroke-width="1.3"/>`);
    add(`<path d="M142 129 L142 110 C142 97 126 87 106 82 L96 97 C114 102 125 109 125 117 L125 129 Z"
          fill="${trim}" stroke="${CINK}" stroke-width="1.3"/>`);

    // Ermine trim, with the tail-tick marks that make it ermine
    add(band('M44 86 C28 92 17 102 17 116 L17 129', CCREAM, 6));
    add(band('M102 86 C118 92 129 102 129 116 L129 129', CCREAM, 6));
    [[24, 108], [20, 121], [122, 108], [126, 121]].forEach(([x, y]) =>
        add(`<path d="M${x} ${y} l0 4" stroke="${CINK}" stroke-width="1.6" stroke-linecap="round"/>`));

    // Placket down the centre, jewelled
    add(`<path d="M61 80 L85 80 L91 129 L55 129 Z" fill="${CGOLD}" stroke="${CINK}" stroke-width="1.4"/>`);
    [[73, 92, 4.4], [73, 106, 4.4], [74, 120, 4.4]].forEach(([x, y, r]) => {
        add(`<path d="M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y} Z"
              fill="${trim}" stroke="${CINK}" stroke-width="1.1"/>`);
    });

    // ── Arm and implement ──────────────────────────────
    const sleeve = () => add(`<path d="M99 86 C112 84 121 92 121 101 L121 114 C110 118 99 110 99 100 Z"
        fill="${trim}" stroke="${CINK}" stroke-width="1.3"/>`);
    const hand = (cx, cy) => {
        add(`<ellipse cx="${cx}" cy="${cy}" rx="7.6" ry="6.4" fill="${CSKIN}" stroke="${CINK}" stroke-width="1.3"/>`);
        for (let i = -1; i <= 1; i++) {
            add(`<path d="M${cx - 4} ${cy + i * 2.6} l8 0" stroke="${CINK}" stroke-width="0.85" opacity="0.65"/>`);
        }
    };

    if (rank === 'K') {
        add(`<path d="M115 4 L121 17 L121 90 L109 90 L109 17 Z" fill="${CSTEEL}" stroke="${CINK}" stroke-width="1.3"/>`);
        add(`<path d="M115 20 L115 86" stroke="${CINK}" stroke-width="0.9" opacity="0.45"/>`);
        add(`<rect x="99" y="89" width="32" height="6.5" rx="2" fill="${CGOLD}" stroke="${CINK}" stroke-width="1.2"/>`);
        add(`<rect x="111" y="95" width="8" height="17" fill="${CBEARD}" stroke="${CINK}" stroke-width="1"/>`);
        add(`<circle cx="115" cy="116" r="5.2" fill="${CGOLD}" stroke="${CINK}" stroke-width="1.2"/>`);
        sleeve();
        hand(115, 103);
    } else if (rank === 'Q') {
        add(band('M114 116 C111 92 113 68 116 46', CLEAF, 3.2));
        add(`<path d="M114 84 C102 77 95 83 97 92 C106 95 113 90 114 84 Z"
              fill="${CLEAF}" stroke="${CINK}" stroke-width="1.1"/>`);
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            add(`<circle cx="${(116 + Math.cos(a) * 7).toFixed(1)}" cy="${(42 + Math.sin(a) * 7).toFixed(1)}"
                  r="6.2" fill="${trim}" stroke="${CINK}" stroke-width="1.1"/>`);
        }
        add(`<circle cx="116" cy="42" r="4.6" fill="${CGOLD}" stroke="${CINK}" stroke-width="1.1"/>`);
        sleeve();
        hand(114, 108);
    } else {
        add(`<rect x="111" y="6" width="6.4" height="108" fill="${CBEARD}" stroke="${CINK}" stroke-width="1.1"/>`);
        add(`<path d="M114 0 L120 18 L108 18 Z" fill="${CSTEEL}" stroke="${CINK}" stroke-width="1.2"/>`);
        add(`<path d="M117 21 C133 24 137 39 127 49 L117 44 Z" fill="${CSTEEL}" stroke="${CINK}" stroke-width="1.2"/>`);
        add(`<path d="M117 30 C126 32 128 39 124 44" fill="none" stroke="${CINK}" stroke-width="0.9" opacity="0.5"/>`);
        sleeve();
        hand(114, 101);
    }

    // ── Collar ─────────────────────────────────────────
    add(`<path d="M64 56 L82 56 L82 78 L64 78 Z" fill="${CSKIN}" stroke="${CINK}" stroke-width="1.2"/>`);
    [[55, 73, 7], [73, 75, 7], [91, 73, 7]].forEach(([x, y, r]) =>
        add(`<circle cx="${x}" cy="${y}" r="${r}" fill="${CCREAM}" stroke="${CINK}" stroke-width="1.2"/>`));
    [[48, 79, 9], [61, 83, 9], [73, 85, 9], [85, 83, 9], [98, 79, 9]].forEach(([x, y, r]) =>
        add(`<circle cx="${x}" cy="${y}" r="${r}" fill="${CCREAM}" stroke="${CINK}" stroke-width="1.2"/>`));

    // ── Head ───────────────────────────────────────────
    add(`<ellipse cx="73" cy="44" rx="16.5" ry="18.5" fill="${CSKIN}" stroke="${CINK}" stroke-width="1.6"/>`);

    // Hair, framing
    if (rank === 'Q') {
        add(`<path d="M54 42 C46 64 49 92 44 129 L61 129 C61 92 57 64 60 44 Z"
              fill="${CHAIR}" stroke="${CINK}" stroke-width="1.3"/>`);
        add(`<path d="M92 42 C100 64 97 92 102 129 L85 129 C85 92 89 64 86 44 Z"
              fill="${CHAIR}" stroke="${CINK}" stroke-width="1.3"/>`);
    }
    add(`<path d="M55 40 C52 21 61 13 73 13 C85 13 94 21 91 40 C88 29 82 25 73 25 C64 25 58 29 55 40 Z"
          fill="${CHAIR}" stroke="${CINK}" stroke-width="1.3"/>`);
    if (rank !== 'K') {
        [[55, 45], [56, 55], [91, 45], [90, 55]].forEach(([x, y]) =>
            add(`<circle cx="${x}" cy="${y}" r="6.4" fill="${CHAIR}" stroke="${CINK}" stroke-width="1.1"/>`));
    }

    // ── Face ───────────────────────────────────────────
    // Brows, then almond eyes with pupils, a nose in profile line and
    // a drawn mouth. Not two dots.
    add(`<path d="M60 37 q6 -4 11 -1" fill="none" stroke="${CINK}" stroke-width="2" stroke-linecap="round"/>`);
    add(`<path d="M75 36 q5 -3 11 1" fill="none" stroke="${CINK}" stroke-width="2" stroke-linecap="round"/>`);
    add(`<path d="M61 44 q5 -5 10 -1 q-5 4 -10 1 Z" fill="${CCREAM}" stroke="${CINK}" stroke-width="1.2"/>`);
    add(`<circle cx="66.5" cy="43" r="1.9" fill="${CINK}"/>`);
    add(`<path d="M75 43 q5 -4 10 1 q-5 3 -10 -1 Z" fill="${CCREAM}" stroke="${CINK}" stroke-width="1.2"/>`);
    add(`<circle cx="80" cy="43.5" r="1.9" fill="${CINK}"/>`);
    add(`<path d="M73 42 L70 53 Q73 55 76 53" fill="none" stroke="${CINK}" stroke-width="1.4" stroke-linecap="round"/>`);

    if (rank === 'K') {
        add(`<path d="M57 50 C55 71 63 86 73 86 C83 86 91 71 89 50 C87 65 82 71 73 71 C64 71 59 65 57 50 Z"
              fill="${CBEARD}" stroke="${CINK}" stroke-width="1.3"/>`);
        add(`<path d="M64 74 q5 5 9 2 M78 76 q3 4 -2 6" fill="none" stroke="${CINK}"
              stroke-width="0.9" opacity="0.55"/>`);
        add(band('M60 56 Q67 63 73 59', CBEARD, 4.4));
        add(band('M86 56 Q79 63 73 59', CBEARD, 4.4));
    } else {
        add(`<path d="M67 59 Q73 63 79 59" fill="none" stroke="${CINK}" stroke-width="1.7" stroke-linecap="round"/>`);
    }

    // ── Headwear ───────────────────────────────────────
    if (rank === 'K') {
        add(`<path d="M40 26 L45 5 L57 19 L73 1 L89 19 L101 5 L106 26 Z"
              fill="${CGOLD}" stroke="${CINK}" stroke-width="1.5"/>`);
        add(`<rect x="40" y="24" width="66" height="10.5" rx="2" fill="${CGOLD}" stroke="${CINK}" stroke-width="1.4"/>`);
        [[45, 5, 3.4], [73, 1, 3.8], [101, 5, 3.4]].forEach(([x, y, r]) =>
            add(`<circle cx="${x}" cy="${y}" r="${r}" fill="${CCREAM}" stroke="${CINK}" stroke-width="1.1"/>`));
        add(`<circle cx="73" cy="29" r="3.8" fill="${trim}" stroke="${CINK}" stroke-width="1.1"/>`);
        [[56, 29], [90, 29]].forEach(([x, y]) =>
            add(`<circle cx="${x}" cy="${y}" r="2.9" fill="${lead}" stroke="${CINK}" stroke-width="1"/>`));
    } else if (rank === 'Q') {
        add(`<path d="M46 22 L52 7 L60 18 L73 3 L86 18 L94 7 L100 22 Z"
              fill="${CGOLD}" stroke="${CINK}" stroke-width="1.4"/>`);
        add(`<rect x="46" y="20" width="54" height="9" rx="2" fill="${CGOLD}" stroke="${CINK}" stroke-width="1.3"/>`);
        [[52, 7, 2.8], [73, 3, 3.2], [94, 7, 2.8]].forEach(([x, y, r]) =>
            add(`<circle cx="${x}" cy="${y}" r="${r}" fill="${CCREAM}" stroke="${CINK}" stroke-width="1.1"/>`));
        add(`<circle cx="73" cy="24.5" r="3.4" fill="${trim}" stroke="${CINK}" stroke-width="1.1"/>`);
        [[59, 24.5], [87, 24.5]].forEach(([x, y]) =>
            add(`<circle cx="${x}" cy="${y}" r="2.4" fill="${lead}" stroke="${CINK}" stroke-width="1"/>`));
    } else {
        add(`<path d="M100 24 C118 20 130 10 132 1 L137 8 C133 20 119 29 103 33 Z"
              fill="${trim}" stroke="${CINK}" stroke-width="1.2"/>`);
        add(`<path d="M46 30 C44 13 57 5 73 5 C89 5 102 13 100 30 L92 27 C90 16 83 12 73 12 C63 12 56 16 54 27 Z"
              fill="${lead}" stroke="${CINK}" stroke-width="1.5"/>`);
        add(`<rect x="46" y="27" width="54" height="9" rx="2.5" fill="${CGOLD}" stroke="${CINK}" stroke-width="1.3"/>`);
        add(`<circle cx="73" cy="31.5" r="3.2" fill="${trim}" stroke="${CINK}" stroke-width="1.1"/>`);
    }

    return p.join('');
}

function courtCard(card) {
    const fig = courtFigure(card.rank, card.suit);
    return `
        <g clip-path="url(#courtClip)">
            <rect x="52" y="46" width="146" height="258" fill="#f6efdc"/>
            <g transform="translate(52 46)">${fig}</g>
            <g transform="rotate(180 125 175) translate(52 46)">${fig}</g>
        </g>
        <rect x="52" y="46" width="146" height="258" fill="none" stroke="#b09a6a" stroke-width="1.6"/>
        <line x1="52" y1="175" x2="198" y2="175" stroke="#1a1512" stroke-width="1.4"/>`;
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
