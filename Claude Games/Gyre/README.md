# GYRE

*fall forever. catch a star. let go.*

A one-button momentum roguelite. You are a spark adrift in the dark — you never stop moving. **Hold** to catch the nearest star and swing around it; the longer you hold, the **faster you swing** and the deeper the star **winds up**. **Release** to fling off along your arc and unleash a shockwave from the star. That wave is your only weapon, your only key, and your only escape.

## Controls
- **Hold** (mouse / touch / **Space**) — catch a star and wind it up
- **Release** — fling off + release a shockwave (bigger the deeper you wound it)
- **Dash** (**Shift** / right-click / two-finger tap) — break free when no star is near
- **Esc / P** pause &middot; **M** mute &middot; **1/2/3** pick a gift &middot; **R** reroll &middot; **T** skip tutorial

## The loop
**Beacons** sleep in every sector. Only a wave of deep wind-up will light one — a faint wave fizzles against it, and the required depth climbs as you fall. Light them all and the **gate** opens. The gate only takes the **swift**: you have to fling yourself through it at speed, so the last act of every sector is a committed, wound-up launch.

Nothing here is completable by loitering.

## Stars rewrite the swing
- **Stars** (gold) — steady, accelerating orbit
- **Pulsars** (cyan) — ever-accelerating; huge wind-up, hard to control
- **Voids** (violet) — reel you inward, conserving momentum; a whirlpool
- **Brittle** (green) — winds fastest, shatters after one fling
- **Repulsors** (rose) — can't be caught; bounce off them

## The dark hunts back
Nine husk kinds, each attacking the verb differently — **weavers** string silk between stars, **lampreys** latch onto the star you're riding and drain your wind-up, **moths** telegraph then dart on a locked line, **splitters** break apart, **brutes** soak. **Nests** guard beacons and keep breeding until you break them. Elites wear crowns and won't fall to a faint wave. Linger too long and the dark grows **restless**.

Each sector rolls a **modifier** — restless dark, solar gale, brittle sky, hungry void, watchful dark.

## The Heart of the Gyre
A three-phase duel, not an HP sponge:
1. **The Shell** — three ward stones orbit the Heart and drink every wave. Break them.
2. **The Open Heart** — now you can catch the Heart *itself*. Only a wave born off its own core truly wounds it; strays barely mark it. It shudders on a telegraphed rhythm to throw you off — release before it does.
3. **Collapse** — the arena falls inward, the ring stars go brittle, and the wards return as hazards.

## Between runs
Fallen runs leave **embers**. Spend them in **the constellation** on permanent gifts, and unlock **forms** — Frost (chilling waves, less light), Wild (fast wind, short reach), Gloom (double motes, deeper cuts).

23 gifts including **7 evolutions** (Supernova, Pulsar Heart, Twin Echo, Star Core, Graviton, Slingshot, Eventide) and two **pacts** that cost you something real. A scripted **first fall** teaches the verb by making you do it. The title screen plays the game to itself.

Plain canvas + Web Audio. Single file, no libraries, no build step. Open `index.html`.

---
### Verification
Headless harness (DOM/canvas stubs, seeded RNG, fixed timestep): **176,016 assertions, 0 failures** — every gift applies and runs clean, evolutions gated behind full mastery, beacon/gate rules, boss phase transitions and damage rules, tutorial completion, attract-mode, meta persistence, render safety in every state, determinism.

Balance measured by bot policies: a **passive spark always dies** and lights nothing; a **sloppy bot wins 0/3**; a **competent bot wins 2/6 full runs** (~340–730s). The Heart falls to a focused build in ~110–140s and shrugs off a scattered one.

**Not verified:** anything visual or tactile — art, CSS fit, animation, audio, and real input feel. Those need a human.
