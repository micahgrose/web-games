# MAPTAP ENDLESS

*five places, one globe, no borders to help you.*

A rebuild of the daily geography game [maptap.gg](https://maptap.gg) — the core game only, with the one thing the original will not do: **play round after round, as many as you like, whenever you like.** No daily lockout, no waiting for tomorrow.

You are told a place and a piece of its history. Spin the globe, tap where you think it is, lock it in. Then you find out how wrong you were, and read the rest of the story.

## Controls
- **Drag** — spin the globe (it keeps a little momentum)
- **Scroll / pinch / + −** — zoom, centred on the cursor
- **Tap the globe** — place your guess; tap again to move it
- **Enter / Space** — lock in, then advance
- **M** — sound on/off · **Esc** — leave the round

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

The globe is **real satellite imagery on a true sphere** — NASA Blue Marble (August 2004, topography and bathymetry, public domain), ray-cast per pixel in a WebGL2 fragment shader so it stays sharp at any zoom. Sunlight from the upper left, limb darkening, atmospheric rim. Country detection for the bonus is genuine point-in-polygon against Natural Earth 1:50m vectors, and once you zoom past ~2× the coastline is traced faintly over the imagery.

**No country borders, no labels, no city dots** — terrain, ocean, and what you know.

Browsers without WebGL2 fall back to a vector globe drawn in canvas 2D: same projection, same controls, painted coastlines instead of imagery.

### Zoom detail
The embedded texture is 4096 px around the equator — about 9.8 km per pixel, which runs out well before the zoom limit does. So when you zoom in and hold still, the visible region is fetched from **NASA GIBS** as WMTS tiles of the *same* Blue Marble imagery, down to **489 m per pixel**, composited into one canvas and handed to the shader as a second texture covering a known lon/lat rectangle. Levels are chosen to match your screen resolution, never more than 16 tiles at a time, feathered at the edges so you cannot see the join.

It degrades to nothing: switched off, offline, or after a few failed requests, the embedded texture simply stays on screen. **This is the one thing that leaves your machine** — tile requests to `gibs.earthdata.nasa.gov` reveal roughly where you are looking. Turn it off with the **Detail** button on the menu and the game is fully offline again.

**Sound** is synthesised on the fly with WebAudio — no files. A pin drop, the line racing out, a four-note sparkle for a bullseye, and an end-of-round chord that turns major above 62% and adds an octave above 85%. Toggle with **M**.

Stats, score history, per-region accuracy and your weak-spot list are kept in local storage.

## Running it
Open `index.html`. No build step, no server, no libraries, no network.

```
node test/headless.js               # 3910 checks: geometry, scoring, rounds, stats, data,
                                    #   audio, tile maths, shader math
node test/dom-flow.js               #  209 checks: drives the real page script through full rounds
powershell -File test/tiles-live.ps1  # optional, needs internet: 5 real tiles
```

`dom-flow.js` exists because I cannot see the screen: it builds a DOM stub *and* a recording WebGL2 context, boots the page's own script, and plays rounds through synthetic pointer and keyboard events — catching the dead-button class of bug that logic tests never reach, on both the satellite and fallback renderers.

Two checks worth naming:

- The fragment shader unprojects pixels to sample the texture, and `geo.js` unprojects the same pixels to decide what you clicked. If those ever disagreed, the globe you see would not be the globe you are tapping. The suite replicates the shader's arithmetic — y-flip included — and compares thousands of pixels against the hit test.
- Tile addressing can be self-consistent and still wrong: a row or column off by one returns a perfectly valid 512×512 JPEG of somewhere else. `tiles-live.ps1` asks the game which tile it would fetch for the Sahara, the mid-Pacific, Greenland, the Amazon and the Australian interior, downloads them for real, and checks each one's average colour looks like the place it claims to be.

## Files
| | |
|---|---|
| `index.html` | screens, input, round flow |
| `js/geo.js` | TopoJSON decode, globe projection, geodesy, country lookup |
| `js/render-gl.js` | the satellite globe (WebGL2) |
| `js/tiles.js` | GIBS tile-matrix maths, fetching and compositing |
| `js/render.js` | the vector globe (canvas 2D fallback, plus the shared overlay drawing) |
| `js/audio.js` | the synth |
| `js/game.js` | scoring, round construction, stats |
| `js/locations.js` | the 356 places |
| `js/world-data.js` | Natural Earth 1:50m geometry |
| `js/earth-texture.js` | NASA Blue Marble, 4096×2048, embedded as a data URI |
