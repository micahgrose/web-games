'use strict';

// ── The deck ───────────────────────────────────────────
// Fifty-two plus two Jokers. Cards drawn go to a discard pile and
// come back only when the draw pile is spent — so the deck is a
// real deck, and it can never deal a card that isn't there.

const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const JOKER_VALUE = 15;

function freshCards() {
    const cards = [];
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
    cards.push({ joker: true, rank: 'JOKER', suit: 'Fate', id: 'j1' });
    cards.push({ joker: true, rank: 'JOKER', suit: 'Fate', id: 'j2' });
    return cards;
}

function shuffle(cards) {
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
}

function cardValue(card) {
    if (!card) return 0;
    if (card.joker) return JOKER_VALUE;
    switch (card.rank) {
        case 'A': return 14;
        case 'K': return 13;
        case 'Q': return 12;
        case 'J': return 11;
        default: return Number(card.rank) || 0;
    }
}

function cardName(card) {
    if (!card) return 'no card';
    return card.joker ? 'the Joker' : `${card.rank} of ${card.suit}`;
}

class Deck {
    constructor() { this.reset(); }

    reset() {
        this.draw_ = shuffle(shuffle(freshCards()));
        this.discard = [];
        this.reshuffled = false;
    }

    /** Take one. Reshuffles the discards back in if the pile is spent. */
    draw() {
        this.reshuffled = false;
        if (!this.draw_.length) {
            if (!this.discard.length) this.reset();
            else {
                this.draw_ = shuffle(this.discard);
                this.discard = [];
            }
            this.reshuffled = true;
        }
        const card = this.draw_.pop();
        this.discard.push(card);
        return card;
    }

    /** Several at once — one reshuffle flag covers the batch. */
    drawMany(n) {
        let shuffled = false;
        const out = [];
        for (let i = 0; i < n; i++) {
            out.push(this.draw());
            if (this.reshuffled) shuffled = true;
        }
        this.reshuffled = shuffled;
        return out;
    }

    get count() { return this.draw_.length; }
}

module.exports = { Deck, cardValue, cardName, SUITS, RANKS, JOKER_VALUE };
