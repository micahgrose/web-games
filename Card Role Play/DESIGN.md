# Card Role Play — design notes

The premise in `Instructions.md` is unchanged: players say what they do, cards
decide whether it works, an AI narrates the result, last one standing wins.
This document records what the v2 pass changed and why.

---

## 1. The visual theme — "The Long Table"

There wasn't one before: Arial, white cards, a body background that flooded to
a pastel player colour. Now the game is set at a dark felt table under one
candle.

| | |
|---|---|
| **Surfaces** | near-black wood, oxblood felt, inset shadow |
| **Metal** | aged brass `#c9a227` for every rule, border and control |
| **Paper** | parchment `#ece0c8` for prose |
| **Display type** | Cinzel — engraved Roman caps, for names and headings |
| **Body type** | EB Garamond — a reading face, because most of this game is reading |

Both fonts are **bundled locally** in `public/fonts/`. The Google Fonts CDN is
blocked in this browser environment (the same problem that broke Wick's
typography), so nothing is fetched from outside.

**The room reacts to the turn.** Rather than washing the whole page in the
active player's colour, the table stays dark and a single coloured glow —
`--seat` — moves around the room. Their character sheet lights up to match.

### The cards are a real deck, not an imitation of one

The faces are **Dmitry Fomin's English-pattern deck from Wikimedia Commons,
released CC0** — the artwork Wikipedia uses. `tools/fetch-cards.js` downloads
the single 13 × 5 sheet, splits each card out of its own top-level group, strips
the editor's metadata and rounds path coordinates, and writes 54 files into
`public/cards/`. Provenance sits beside them in `SOURCE.txt`.

This replaced a hand-drawn set, and the honest reason is worth recording: I
spent eight iterations drawing engraved court figures as SVG paths and they
still read as cartoons — flat, under-detailed, and near-identical across J, Q
and K, because one hand-built torso was doing duty for all three. A deck traced
from the real thing was never going to be caught up to that way. Switching cut
`cards.js` from 598 lines to 120 and produced better artwork in every respect,
jokers included.

Still drawn in code, because they should belong to this table rather than to a
standard deck:

- **The reverse** — an oxblood guilloché field with a four-suit medallion.
- **The empty slot** — a dashed brass outline.

The deck is 1.6 MB on disk and **361 KB gzipped** (a court card: 107 KB → 27 KB),
so `compression` is enabled and the faces load per card as they are dealt.

**One card, one shape.** The artwork is 360 × 540 — 2:3 — and the boxes holding
it were still 250 × 350 from the hand-drawn set. An `<img>` keeps its source's
aspect ratio whatever box you give it, so every card letterboxed inside its own
holder: about five pixels of dead gutter down each side, invisible against a
dark table until a glow was drawn on the *box* and hung off the edge of the
*card*. `--card-ratio` and `--card-r` now govern every card-shaped box, the
reverse and the empty slot are drawn to match, and `test/smoke.js` fails if any
of them drift apart or if the corner radius stops being circular.

### The glow is the rulebook

Every value maps to a band, and the band has a colour, a name, a one-line
meaning, and a bell:

| Value | Band | Meaning |
|---|---|---|
| 2–4 | RUIN | it fails, and it costs something |
| 5–7 | FALTER | mostly fails; a sliver lands |
| 8–10 | MIXED | half-works, and it costs |
| 11–12 | SUCCESS | works, cleanly |
| 13–14 | TRIUMPH | works beyond hope |
| Joker | FATE | the deck writes this one itself |

The card's aura, the verdict plate beneath it and the pitch of the chime all
carry the same band. Players learn the ladder by watching it, without a legend.
This is teaching inside the game rather than a rules panel next to it.

No glow carries a **spread**. Spread grows the lit shape *before* it is blurred,
so the light reads as a second, larger card sitting behind the real one; with
spread zero it starts at the card's edge and falls away, which reads as the card
giving off light. The ladder is carried by blur and opacity instead, and the
smoke test refuses a spread value anywhere a card is lit.

---

## 2. The AI layer

### The cards now actually decide

Previously the model was handed `Value: 9` and left to interpret it, holding
the counter rule, the wound modifiers and the outcome ladder in its head. It
drifted.

Now `lib/resolve.js` does the arithmetic and the narrator is *told* the verdict:

```
ACTOR: Kira
DECLARES: "I leap the gap to the far mast"
CARD: 3 of Clubs (3 -1 hurt = 2)
OUTCOME: RUIN — It fails outright, and the failure costs the actor something.
```

The counter rule from `Instructions.md` — *a defender whose card is higher turns
the action aside, for that defender only* — is a comparison in code, resolved
per defender, with ties going to the attacker. It cannot drift.

### What a character carries hits hard

Condition is mechanical, and deliberately heavy — this is the part of the spec
that makes the game a game rather than a chat:

| | |
|---|---|
| each lasting wound | **−2**, capped at −5 |
| each advantage | **+2**, capped at +4 |

So a King triumphs for a hale character and lands as merely *mixed* for one
carrying two wounds — a two-band drop on the identical card. A nine with two
advantages climbs from mixed to triumph. Armour genuinely raises the card an
attacker needs to get through it, because a defender's advantages count in the
counter comparison. The caps keep the card itself the loudest single thing, and
nothing heals unless someone tends to it in the story.

The narrator is pushed hard in the same direction. Every directive **names the
actual tags** rather than just their arithmetic — "Kira is carrying: shattered
right knee, deep gash across the ribs. This drags down everything Kira attempts,
and must show in the telling" — so the prose gives the *reason* a card came out
the way it did. When a wounded character fails, the wound is why; when an
equipped one succeeds, the gear is how.

### Every turn leaves a mark

Each narration must change at least one field on at least one character: a fresh
injury, an advantage gained, lost or broken, a condition that sets in or lifts.
A turn that leaves the cast exactly as it found them is a failed turn. The rule
sits in the system prompt *and* at the foot of every directive, because a model
follows the last thing it read far more reliably than the first.

### Arrival is dealt for too

A setup turn draws a card, and it rules on how fully the character takes hold —
RUIN arrives badly diminished and starts with a flaw, TRIUMPH arrives at full
height with two advantages, a Joker bends them into something stranger than
asked for. Whatever the arrival grants or costs is written onto the sheet and is
real for the rest of the game, so the deck has a say in who you are before it
has a say in what you do.

### Context is bounded

The old build pushed every turn into one array and resent the entire game on
every call — cost and latency grew without limit, and the early turns fell out
of the model's window anyway, so it forgot exactly the things it was told to
remember.

Now the narrator gets:

1. a **CAST block** — every character, who they are, what hurts, what helps,
   how to refer to them; regenerated each turn, always small
2. a **rolling window** of the last few exchanges, for voice and continuity

State survives even when the prose scrolls away. A character crippled on turn
three is still crippled on turn forty.

### Three calls became two

Elimination detection used to be a separate 70B call after each narration. Now
the narrator appends a machine-readable block, which is parsed for deaths *and*
for the updated sheets:

```
<<<STATE
Kira | is: a sky-pirate with a rope-gun | hurt: gashed left arm | has: - | now: winded | call: -
DEAD: Vex
>>>
```

It never reaches a player's screen: the stream holds back anything from `<<<`
onward. If the block is missing, the previous sheets stand and a conservative
prose regex catches the death as a fallback.

### Triage is cheap and often free

Screening (is this intelligible, who does it hit, has it been tried before)
moved to `llama-3.1-8b-instant`, and the obvious cases never leave the process
at all: keyboard mashing is caught locally, and so is a repeated attempt —
`Instructions.md` bans re-sending the same prompt, so that's an exact-match plus
trigram-similarity check rather than a model call. A new angle on the same idea
still passes.

### It streams

Narration arrives token by token, ~290 ms to the first word instead of several
seconds of "Game Master is thinking…". A quill drains the buffer at a readable
pace and speeds up if it falls behind.

### Naming characters

The narrator was inventing genders for player-made characters. Rather than
nagging it in the negative (which it ignored), each sheet carries a `call:`
field. It defaults to *by name only* — repeat the exact name, use no pronoun —
and a player who writes their own pronouns into their character description
gets them recorded and honoured for the rest of the game.

### It runs without a key

With no `GROQ_API_KEY` the game falls back to an understudy narrator that reads
the verdict and reports it plainly. Not clever, but the game is playable and
the whole test suite runs offline.

---

## 3. Code

**Split into modules.** `server.js` is the socket layer and room state machine;
`lib/deck.js`, `lib/resolve.js`, `lib/ai.js` hold the deck, the rules and the
model. The client is `cards / audio / anim / ui / main`.

**Bugs fixed along the way:**

- *The deck could deal nothing.* It was a 52-card array that shifted off the
  front and pushed the last card to the back; once spent it dealt `undefined`,
  which scored 0. It's now a real draw pile and discard pile that reshuffles,
  announces itself, and is verified over 5000 consecutive draws.
- *Counter cards leaked out of the deck* — drawn and never returned.
- *Player names went into `innerHTML` unescaped* in four places. Everything
  player-typed now goes through `textContent` or `esc()`.
- *The public table list rebuilt its own HTML on every refresh*, so a Join
  button could be destroyed under the cursor mid-hover — the same defect I hit
  on Foundry. Rows are keyed and reused now, with one delegated click handler.
- *Turn index vs. mutated array.* Turn tracking was an index into a `players`
  array that a disconnect could splice; it's a player id now.
- *An idle player froze the table forever.* There's a turn clock (a candle that
  burns down), and an unanswered counter auto-resolves rather than hanging.
- *A rapid resubmit was silently swallowed*, leaving the player staring at an
  empty box; it now answers.
- *Two different system prompts* existed for the same Game Master, with
  contradictory language rules. One prompt now.
- *Players who declined a rematch* stayed subscribed to the table invisibly.
- *A beaten card stopped greying out* in the clash. The rule matched
  `.fly .face svg`, which was right when faces were inline SVG and wrong the
  moment they became `<img>`; it now matches `.card-art`, which is both.

---

## 4. Additions

- **Jokers.** Two in the deck. A Joker is FATE: it outranks everything, ignores
  wounds, always turns a counter aside — and the narrator is told to bend the
  result into something nobody asked for.
- **Character sheets.** A live row of cards under the table showing who each
  player is and what the story has done to them — wounds, gear, conditions,
  read straight out of the AI's state block. The game's memory made visible.
- **The clash.** A counter no longer just prints text. Every card is dealt in
  one animation with names above them, they turn over together, then the
  attacker's card is set against each defender's in turn with a spark at the
  meeting point — winner glowing, loser greyed, tagged TURNED ASIDE or
  OVERCOME.
- **Procedural audio.** No asset files: riffle, deal, flip, land, a verdict bell
  whose timbre encodes the band, a clash, a knell when someone falls, a chord
  at victory, quill-scratch under the narration. Every cue is
  `(ctx, dest, t0) → endTime`, so the same code can render offline for
  measurement. Off/on toggle, remembered.
- **The turn candle.** The clock, as a candle that burns down and gutters.
- **An epilogue.** When the last player is standing, the narrator writes a
  two-sentence closing legend, streamed into the victory plate.
- **A gallery page** at `/gallery.html`: every card, band, sheet and control on
  one screen, for judging the art without playing a game to find it.

---

## 5. Verification

```
npm test          # 205 + 592 checks, no API key needed
npm run test:live # 44 checks against the real API, costs a few tokens
```

- **`test/headless.js`** — deck invariants; the outcome ladder; wound and
  advantage arithmetic; the counter rule including the worked example from
  `Instructions.md`, ties, and armour; state-block parsing including malformed
  input; local screening (with the spec's own purple-dragon example as a case
  that must pass); then **a whole game played over real socket.io clients
  against a real server** — seating, name collisions, setup turns, refusals,
  counters, eliminations, victory, epilogue, and clearing the table.
- **`test/smoke.js`** — every one of the 54 cards checked for well-formed
  markup, balanced tags and no `undefined` leaking into the art; every card box
  checked to be the same shape as the picture inside it, with round corners on
  the artwork's own radius; every glow checked for spread; the flip checked for
  a 3D context to flip in; every asset the page requests served with the right
  content type; every element id the scripts reach for confirmed present in the
  HTML. These are the things I cannot see, so they are the things I measure.
- **`test/live.js`** — the parts only the real API can prove: JSON-mode triage,
  target identification, streaming, and that the state block parses and never
  reaches the stream.

**Not verified — needs eyes.** How any of it actually *looks*, how the deal and
clash animations feel, the audio mix, and real multiplayer feel with several
people typing at once.
