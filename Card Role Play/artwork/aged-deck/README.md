# The aged deck

All 54 faces with the ageing pass applied: the palette remapped to cream
paper and faded, warmed inks, plus an uneven patina over the top — a broad
cast in its own direction per card, darker handling wear at the edges, and
paper mottle. Everything seeded from the card's own name, so the seven of
clubs is always marked in exactly the same places.

Built at `AGE_STRENGTH=2.4`. **Not in use** — the game ships the plain deck.

## To put it back

Either copy these over the live deck:

```
cp artwork/aged-deck/*.svg public/cards/
```

Or rebuild them from source, which is the better route if you want to
change the strength while you are at it:

```
AGE_STRENGTH=2.4 node tools/fetch-cards.js
```

Any strength works — 1 is barely there, 2.4 is what these were built at,
4 starts to look properly handled. `tools/age.js` holds the palette table
and the patina, and `STRENGTH` at the top of it scales the whole uneven
part in one number.

## Provenance

Dmitry Fomin's English-pattern deck from Wikimedia Commons, CC0. **The
colours here are not his** — see `public/cards/SOURCE.txt` for the full
record. CC0 permits the change freely; it is noted so nobody mistakes
these for the original artwork.
