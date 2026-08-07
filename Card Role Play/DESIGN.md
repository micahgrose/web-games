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

### Cards are drawn, not typeset

`public/js/cards.js` renders every card as SVG:

- **Pip layouts follow a real deck**, including the convention that pips below
  the midline are printed upside down.
- **Courts are illustrated** — Jack with a feathered cap and halberd, Queen with
  a coronet and a rose, King bearded with a crown and sword — each a bust,
  stamped twice and rotated, the way a real court card reads from either end.
  (Previously J/Q/K were a circle with a suit symbol in it.)
- **Aces** get a filigree medallion.
- **The reverse** is an oxblood guilloché field with a four-suit medallion.
- **Jokers** are drawn as a jester and are new to the deck — see §4.

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

Condition is mechanical too, which is what the spec asked for: each lasting
wound is −1 (max −3), each advantage +1 (max +2). The same King triumphs for a
hale character and merely succeeds for a wounded one. Armour genuinely raises
the card an attacker needs to get through. Caps keep the card the loud part.

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
npm test          # 160 + 1288 checks, no API key needed
npm run test:live # 22 checks against the real API, costs a few tokens
```

- **`test/headless.js`** — deck invariants; the outcome ladder; wound and
  advantage arithmetic; the counter rule including the worked example from
  `Instructions.md`, ties, and armour; state-block parsing including malformed
  input; local screening (with the spec's own purple-dragon example as a case
  that must pass); then **a whole game played over real socket.io clients
  against a real server** — seating, name collisions, setup turns, refusals,
  counters, eliminations, victory, epilogue, and clearing the table.
- **`test/smoke.js`** — every one of the 54 cards checked for well-formed
  markup, balanced tags, valid colours and no `undefined` leaking into the art;
  pip counts checked against a real deck; every asset the page requests served
  with the right content type; every element id the scripts reach for confirmed
  present in the HTML.
- **`test/live.js`** — the parts only the real API can prove: JSON-mode triage,
  target identification, streaming, and that the state block parses and never
  reaches the stream.

**Not verified — needs eyes.** How any of it actually *looks*, how the deal and
clash animations feel, the audio mix, and real multiplayer feel with several
people typing at once.
