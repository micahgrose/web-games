# MAPTAP ENDLESS

*five places, one globe, no borders to help you.*

A rebuild of the daily geography game [maptap.gg](https://maptap.gg) — the core game only, with the one thing the original will not do: **play round after round, as many as you like, whenever you like.** No daily lockout, no waiting for tomorrow.

You are told a place and a piece of its history. Spin the globe, tap where you think it is, lock it in. Then you find out how wrong you were, and read the rest of the story.

## Controls
- **Drag** — spin the globe (it keeps a little momentum)
- **Scroll / pinch / + −** — zoom, centred on the cursor
- **Tap the globe** — place your guess; tap again to move it
- **Enter / Space** — lock in, then advance
- **Esc** — leave the round

## Scoring
- **0–100 per place, by distance.** Within **25 km** is a perfect 100. It decays from there — about **85** at 250 km, **50** at 1,000 km, **12** at 3,000 km, nothing at all across the world.
- **The right country is worth +10**, capped at 100. A near miss on the correct side of a border beats a near miss on the wrong side — and that is exactly when the bonus pays.
- **Multipliers run ×1 ×1 ×2 ×3 ×3.** The last three questions are most of the round. A flawless round is exactly **1000**.

## Tiers
| | |
|---|---|
| **Tourist** | Capitals and landmarks you have seen a hundred times. |
| **Explorer** | You know the names. Now place them. |
| **Cartographer** | Obscure, remote, and unforgiving. |
| **Weak Spots** | Five places *you personally* have missed before. Unlocks after five bad taps. |

Difficulty is about how well you can **place** a location, not whether you have heard of it. Reykjavík is famous and easy. Bratislava is famous and puts people in Croatia.

## What's in it
**356 hand-written locations** across eight regions, each with real history attached — a hook before you guess, the full story after. Every coordinate is checked against the actual country polygon by the test suite, so a typo or a flipped sign cannot ship.

The globe is a **true orthographic sphere** built from Natural Earth 1:50m vector data (public domain): real coastlines, real point-in-polygon country detection for the bonus, deep zoom. **No country borders, no labels, no city dots** — land, ocean, and what you know, the way the original plays it.

Stats, score history, per-region accuracy and your weak-spot list are kept in local storage. Nothing leaves the machine.

## Running it
Open `index.html`. No build step, no server, no libraries, no network.

```
node test/headless.js    # 208 checks: geometry, scoring, rounds, stats, data integrity
node test/dom-flow.js    # 135 checks: drives the real page script through full rounds
```

`dom-flow.js` exists because I cannot see the screen: it builds a DOM stub, boots the page's own script, and plays rounds through synthetic pointer and keyboard events to catch the dead-button class of bug that logic tests never reach.

## Files
| | |
|---|---|
| `index.html` | screens, input, round flow |
| `js/geo.js` | TopoJSON decode, globe projection, geodesy, country lookup |
| `js/render.js` | the globe |
| `js/game.js` | scoring, round construction, stats |
| `js/locations.js` | the 356 places |
| `js/world-data.js` | Natural Earth 1:50m geometry |
