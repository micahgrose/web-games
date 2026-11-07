# SYMBIONT — Art Asset Spec (for the sprite-sheet pipeline)

You're sourcing/generating the pixel art; I wire it into the engine. This spec
keeps it painless. **Drop everything in:** `Claude Games/Symbiont/assets/`

The engine will load these if present and fall back to coded placeholders if a
file is missing — so the game always runs, and your art just *upgrades* the look
as files arrive. Start with the **Act 1 essentials**; ignore the rest for now
(we're pacing the production too).

---

## Global rules (please follow so things line up)

- **Format:** PNG, **transparent background** (alpha), no baked-in shadows.
- **Base resolution:** **16×16 or 32×32** pixels per tile/character cell. Pick one
  and stay consistent. I'll scale ×2 or ×3 with nearest-neighbor (crisp pixels).
  Tell me which base you used.
- **Style:** cohesive **limited palette**, light from the **top-left**. The world
  is warm and natural (greens, earthy browns, warm stone). The **symbiote is sickly
  violet / magenta** so it reads as *wrong* against everything else.
- **Animations = horizontal strips** (frames left→right, all same size), character
  **facing RIGHT** (I'll mirror for left). Feet at the bottom edge of the cell.
- **Filename = the manifest.** Name animated strips:
  `name_<frames>f_<w>x<h>.png`  →  e.g. `blob_move_6f_32x32.png` (6 frames, 32×32 each).
  Static single images: just `name.png` and tell me the size.

---

## ACT 1 ESSENTIALS (get these first)

### The symbiote (you)
| logical name | file example | frames | notes |
|---|---|---|---|
| blob idle | `blob_idle_4f_32x32.png` | ~4 | pulsing, oozing, "dying in open air" vibe |
| blob move | `blob_move_6f_32x32.png` | ~4–6 | a crawling/rolling ooze |
| *(optional)* blob hurt | `blob_hurt_2f_32x32.png` | ~2 | flash/recoil |

### First host — a small critter (the starter body)
Think a field animal: rat, fox, small dog, goat — your pick. One critter for Act 1.
| logical name | file example | frames | notes |
|---|---|---|---|
| critter idle | `critter_idle_4f_32x32.png` | ~4 | breathing |
| critter walk | `critter_walk_6f_32x32.png` | ~6 | a run cycle |
| *(optional)* critter jump | `critter_jump_2f_32x32.png` | ~2 | up + fall pose |

### Terrain (the "complex textured ground" you wanted)
| logical name | file | notes |
|---|---|---|
| ground top | `tile_ground_top.png` | grassy/mossy surface with a little texture |
| ground fill | `tile_ground_fill.png` | dirt **with pebbles/roots** (the under-layer) |
| *(optional)* ground edge L/R | `tile_ground_edgeL.png`, `tile_ground_edgeR.png` | clean cliff edges for pits |

### Background (optional but huge for mood — parallax)
| logical name | file | notes |
|---|---|---|
| far layer | `bg_far.png` | distant hills/treeline at dusk (wide image, will tile/scroll slow) |
| near layer | `bg_near.png` | closer trees/silhouettes (scroll a bit faster) |

---

## LATER (Acts 2–5 — don't make these yet)
- More critters (a fast darting one, a heavy ox/laborer), human villagers (idle/walk/flee),
  a torch-hunter, soldiers, and the **champion/hero boss**.
- More tiles: rock, fence/barricade (breakable), village wood, ruins.
- I'll give you exact lists per act as we lock each one.

---

## What I need back from you
1. The files in `assets/` (even 1–2 to start — I'll wire and we iterate).
2. One line: **"base size = 16 or 32."**
3. Don't sweat perfection — drop rough ones, screenshot, we tune together.
