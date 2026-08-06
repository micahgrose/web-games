# GILT — design doc

## HANDOFF
- Phase: 4 — build (phases 1–3 compressed into one autonomous session per user's direct build order)
- Core: SETTLED — one night at a fading casino, debt due at dawn; every honest edge in the house is real math you can find
- Next chat does: user playtest fixes. Read this file end to end first; the Red-team log and Open list at the bottom are live.
- SETTLED (don't reopen): the night frame, 12-game roster, real-odds honesty rule (no fake luck, no myths-made-true), single-canvas presentation, 1974 voice, notebook-as-metaprogression
- OPEN (next chat decides): balance numbers after human play (debt size, bias strength, marker juice), whether free play needs its own goals, more Cole back-off nuance
- Read first: feedback_character_art_and_layout, feedback_juice_and_feel, feedback_dont_tune_game_to_the_bot, feedback_verify_input_plumbing, feedback_user_provides_visuals

## 0 — Divergence map (frames considered)
User's order fixed the genre (casino, ≥10 ways to gamble, superb art, human text). Divergence happened one level up — the FRAME around the gambling:

1. **Flat casino sim** — menu of games, endless bankroll. Rejected as the whole game: no stakes, no arc, no reason to choose one table over another. It survives as the unlocked "Just play" floor.
2. **Debt night** (PICKED) — walk in at 9 PM with $500, owe Sal $12,000 at 6 AM. Clock ticks per round. The house edge means the math is against you — unless you find the honest edges hidden in the house. Winnable through attention, not luck.
3. **Cheater roguelite** — palming cards, heat meter. Rejected: cheat buttons cheapen the premise that the math is real; heat/stealth overlaps Lampblack; pulls focus from the games themselves.
4. **Own-the-house tycoon** — set the odds, fleece the marks. Rejected: the player stops gambling, which fights the brief.
5. **Death's casino / occult stakes** — Rejected: spectacle would eat the craft budget, and "the devil deals you in" is the exact trope-soup an AI reaches for. The scariest thing in this game is a man who is polite about money.

## 1 — Core
**Decision:** One night. $500 against $12,000 by 6 AM. Every round costs game-minutes. Twelve real gambling games with true odds, real paytables, and a posted house edge. Hidden in the house are HONEST edges — every one is a real-world advantage-play technique: count the blackjack shoe (dealt from a real 4-deck shoe, so counting genuinely works), spot the worn roulette wheel's heavy pocket from the history board, find the full-pay video poker machine by reading paytables, take free odds at craps, buy real information from the tout, watch the progressive slot's meter cross the line where EV goes positive. The game never lies about probability and never makes a myth true (no "due" machines — a character voices the gambler's fallacy and is WRONG).

**Why:** The core tension is a four-way squeeze felt every minute: which game (edge vs variance vs pace) × bet size (you need ~24x growth, so grinding can't win — you must pick spots) × the clock (fast games are the worst games; that's not an accident, it's the house) × markers (Sal will always lend; that's the problem). Knowledge converts a ~2% night into a ~25% night. That's a real decision engine, not a slot façade.

**Rejected:** fake luck meters, cheat verbs, rubber-band pity — all break the "math is real" spine that makes the knowledge game mean something.

## 2 — Systems & content

### The twelve ways to gamble
| # | Game | Table | Pace/round | House edge (posted in-voice) | The edge, if any |
|---|------|-------|-----------|------------------------------|------------------|
| 1 | Blackjack | Ruth | 2 min | ~0.6% at basic | Real 4-deck shoe → counting works. Herb teaches the count. Spread too hard and Cole cools the table. |
| 2 | Roulette | Vern | 4 min | 5.26% (double-zero) | Worn wheel: pocket 26 hits ~1.5x fair. History board is posted. Chi-square-real. |
| 3 | Craps | Eddie | 3 min | 1.41% pass | Free odds behind the line: zero house edge, and Eddie says so. |
| 4 | Slots | Pete's row (3 cabinets) | 1 min | ~8% | The progressive's meter grows with floor play; above the line on the glass, EV goes positive. |
| 5 | Video poker | 2 machines | 2 min | 9/6 machine ~0.5%, 8/5 machine ~3.7% | The good machine exists; the paytable on the glass is the tell. |
| 6 | Baccarat | Dot | 3 min | 1.06% banker | None. It's just the least-bad big table, and Dot knows it. |
| 7 | Three-card poker | Marla | 2 min | ~3.4% | Q-6-4 discipline, printed on the rules card if you read it. |
| 8 | Hi-Lo ladder | the bar, Len | 1 min | ~3% per rung | Knowing when to walk. Streak multiplies; one miss takes it all. |
| 9 | Keno | lounge, runner | 2 min | ~27% | None. The honest trap. Fast, cheap, ruinous. Mabel will tell you straight. |
| 10 | Big Six wheel | Vern's other job | 1 min | 11–24% | None. It's beautiful and it's a mugging. |
| 11 | The simulcast (horses) | back parlor, Fingers | 8 min | ~15% takeout | Posted morning lines misprice true form. Fingers sells real information for $200 — and skims. |
| 12 | Scratchers | Mabel's cage | 1 min | ~35% | None. Foil comes off under your thumb; that's the product. |

All rules real: S17 3:2 blackjack with double/split; American wheel in true pocket order; pass/don't/come-free odds/field/place/hardways; punto banco third-card tableau; Jacks-or-Better with exact paytables; 3-card ranks where a straight beats a flush; hypergeometric keno paytable; six-horse fields with a real tote.

### The night
- 9:00 PM → 6:00 AM, 540 minutes. Rounds debit minutes by table. A wall clock hangs in every scene; the light warms as dawn gets close.
- **Markers:** Sal fronts $1,000 a time, up to twice, at 30% juice, added to the number. Mabel handles the paper ("Sal says okay. Sal always says okay. That's the problem.").
- **Endings ladder** (voiced, no gore): bust before dawn < dawn with scraps < dawn with half (buys you a month) < paid in full (the sunrise walk) < double-plus (the Gilt ending: Cole's respect, the suite, high-roller room unlocked in free play).
- **Cole (pit boss):** wins draw him to your shoulder. Bet-spreading an obviously hot count gets you backed off — blackjack cools 45 house-minutes. Teaches cover play the way it was actually learned.
- **The notebook (metaprogression):** discoveries persist across nights as scrawled pages — the count, the heavy pocket, the good machine, Fingers' number. Knowledge is the unlock; the next night starts smarter, not richer.
- **Two doors on the marquee:** "The night" (the game) and "Just play" (free-play floor, house money, no clock — the practice room; high-roller room locked behind the Gilt ending).

## 3 — Teaching (in play, no static legend)
- Mabel at the cage on arrival: chips, one line on the floor, first door pointed at.
- First visit to any table: the dealer's two-sentence in-voice explainer + the printed **house rules card** (real casinos have them — the diegetic legend), which ends with the edge in plain words ("The house keeps about a nickel of every dollar through this wheel. Vern didn't make the rules.").
- First blackjack hand: Ruth annotates the buttons once.
- Herb appears after ~15 hands, teaches the count over coffee → count coach overlay unlocked, forever, in the notebook.
- Vern's history board is always posted; 30+ spins with the heavy pocket hot earns Vern four quiet words.
- Fingers finds YOU after your first race.
- Curriculum order is baked into geography: cheap fast traps near the door, the real tables deeper in — the floor itself is the lesson.

## 4 — Feel (the axis this build over-invests in)
- **One canvas, 1280×800 internal, letterboxed scale-to-fit.** All UI drawn and hit-tested in-canvas — no CSS fit bugs possible (the Reprise lesson). Pointer transformed through the same matrix.
- **Palette (committed):** room black-green `#07120d`, felt `#0e4630/#14563b`, brass `#c9a227→#f3d97a`, ivory `#f2e9d8`, oxblood `#6e1f24/#b3323a`, smoke `#8b95a1`; neon pink `#ff5f8f` + teal `#37c8b4` for signage ONLY. Dawn creeps the whole palette warm after 4 AM.
- **The floor hub:** illustrated 3/4 casino floor — real drawn tables, patron silhouettes, lamp pools, procedural deco carpet, neon over each pit. Click a pit → camera glide into the scene.
- **Table scenes:** across-the-felt first person. Dealer drawn waist-up with silhouette/posture/tics (breathing, blink, cigarette, dealing arm) — characters, not shapes with eyes. Authentic felt markings. Cards with deco backs, full pips, three drawn court faces. Chips that slide, clack, stack, and cascade on a big hit.
- **Cast:** Sal (camel coat, polite), Mabel (glasses on a chain, dog photo taped in the cage), Ruth (beehive, counts your mistakes), Eddie (rolled sleeves, night-school textbook under the rail), Vern (bow tie, pocket watch 4 min fast — "house time"), Dot (crossword between shoes), Marla (three-card, new, careful), Len (barman), Herb (cardigan, quits at midnight — "that's when I get stupid"), Fingers (racing form, skims), Cole (dark suit, compliments that aren't).
- **Signature animations:** ball's decaying orbit and fret-bounce into the pocket; dice tumble off the rail; reel blur with staggered stops; the horse race run in silhouette with gallop cycles and a call; foil scratching off under the pointer; smoke wisps in every lamp pool; neon flicker; the dawn gradient.
- **Shake budget:** casinos don't shake. Wins pay in light, sound, and chips — capped chip fountain on jackpots.
- **Audio (all procedural WebAudio, offline-verified):** floor bed = murmur + glass clinks + slow piano out of a D-minor-9 pool; per-scene mixes; chip clack/slide, card slip/flip, wheel tick-decay + ball drop, dice, reel stops, coin tray, keno pop, hoofbeats + trumpet, three win stingers sized to the hit; Sal's scenes get a low quiet drone.

## 5 — Text (the not-AI ask, treated as craft)
Voice bible — The Gilt, Reno-adjacent, about 1974. Everyone's worked here forever. Nobody's excited. Everybody's specific.
- No exclamation marks anywhere except signage, because signs shout.
- Contractions always; fragments fine; each character owns 2–3 verbal tics (Ruth: "hon", counts mistakes; Vern: four words max; Dot: mostly punctuation; Sal: politeness as menace; Cole: compliments that aren't; Eddie: patter that outruns the dice).
- Concrete numbers, names, times. Banned: "test your luck", "fortune favors", "Welcome to", exclamation cheer, title-case labels, colon subtitles.
- Buttons in-voice: "Deal me in", "Let it ride", "Walk", "Ask Mabel".
- Win/lose lines drawn from per-character non-repeating pools, varied by streak and size.

## 6 — Verification plan
- Engine and all game logic DOM-free on `window.__GILT`; seeded RNG; node harness evals sources under stubs.
- Exact checks: every paytable; blackjack rules matrix; baccarat tableau vs the published table; 3-card ranks (straight > flush); wheel pocket order; dice pip opposites sum 7; keno hypergeometric EV per pick count.
- Monte Carlo: blackjack basic ≈ 99.4% RTP and counting EV positive at TC≥+3; pass 244/495; banker/player/tie bands; biased pocket detectable at 50k spins AND straight-bet EV positive on 26; progressive EV crosses zero at the posted line; tout info flips horse EV positive.
- Night bots as probes (never judges): grinder / degenerate / edge-player; edge-player must clear the night materially more often; invariants each sim-minute (finite, non-negative, clock monotonic, endings reachable).
- DOM smoke drives the REAL canvas listeners with synthetic pointer events through every scene (the Nyx input-plumbing lesson).
- Audio rendered offline via node-web-audio-api; RMS/clipping/centroid/duration asserted per cue.

## Red-team log (Phase 1–3 pass, in the user's voice)
1. *"Ten menu items isn't a game"* — held: the night/clock/marker/edge lattice is the game; the games are its terrain. ✔
2. *"You'll starve the art again"* — countermeasure: art tasks sit BEFORE tuning in the build order, dealers are named deliverables with tics and idle animation each, and "shape with eyes" is a banned tell in review. ✔
3. *"The debt night might be unwinnable-feeling"* — endings ladder pays partial progress; notebook makes every failed night compound into the next; bots measure the knowing-player win rate and the tune target is 20–30%, adjusted by paytables/bias, never by shrinking the game. ✔
4. *"Free play could cannibalize the night"* — separate practice bankroll, no notebook discoveries in free play except reading paytables (which is fair — that's just literacy), high-roller room gated behind the Gilt ending. ✔
5. *"12 games × art = you'll rush the last four"* — the four fast games (keno, big six, scratchers, hi-lo) share the lounge/cage scenes and lean on the same chip/card/wheel art systems; budgeted, not hand-waved. ✔
6. *"Where's the teaching for counting, really?"* — Herb's scene is a scripted first encounter with a practice shoe, not a tooltip. ✔
7. Cut-by-omission audit vs the brief: ≥10 ways ✔ (12), superb art = single biggest line item ✔, non-AI text = voice bible + per-character pools ✔.
