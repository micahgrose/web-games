# DESIGN.md — LAMPBLACK (stealth-heist roguelite)

## HANDOFF
- Phase: 2 — Core & systems | Status: **DONE** (2026-07-25)
- Core: **Lampblack** — top-down gaslamp-noir stealth-heist roguelite. Three spatial information channels (LIGHT you manufacture, SIGHT that reads light, SOUND that propagates through geometry), an evidence ratchet that permanently hardens the floor, and a greed loop where the trip back out — not a bank button — is the risk.
- **USER DIRECTIVE (every phase): "watch yourself on art + sounds."** Phase 2 complied by attaching an audio/visual identity to every system as it was designed (§2.9) — sound and light ARE mechanics here. Phase 3 must not treat §2.9 as done; it's the *identity spec*, Phase 3 owns the *feel spec* (animation frames, WebAudio synthesis recipes, palette values, layout safe-areas) and the teaching curriculum.
- Next chat does: **Phase 3 (teaching & feel).** Design the in-game curriculum (scripted first-heist encounters that teach light→sight→sound→evidence one at a time, §2.8 gating table is the skeleton; **Magpie the fence is the teaching voice** — tips in her words, never a tutorial box; consequence previews; no static legend) + full feel spec (thief + guard art per §2.9 identity notes, walk cycles per feedback_walk_cycle_and_facing_recipe, WebAudio synthesis plan, dynamic music layers, capped shake, defensive layout). Update this HANDOFF.
- SETTLED (don't reopen):
  - Setting = **gaslamp-noir Victorian city — USER-CONFIRMED at the Phase 2 seam** ("flavor sounds amazing, keep it"); name Lampblack is load-bearing (lampblack = lamp soot; the thief is soot-black; snuffing lamps is the signature verb).
  - **Seam self-pass additions (user delegated "add more" to me — see red-team §Phase 2-seam):** the **soot gem** player-visibility indicator (§2.1.1), the **capture ladder** (Last Trick → one Crooked Watchman bribe → pinched, §2.3), **Magpie** the named fence (§2.6 — she is Phase 3's teaching voice), and job modifier #11 **The Other Shadow** rival thief (§2.8).
  - The three-channel stealth model as specced in §2.1–§2.3: spatial light with raycast shadows, graduated cone detection with visible awareness fill + last-known-position ghost, sound as door-graph propagation (never a bare radius), scent trails for dogs.
  - Alertness is a one-way ratchet (never decays) with 4 stages; evidence system (doused lamps, bodies, missing famous loot) feeds it. WHAT you steal is a decision, not just how much.
  - Carry/bulk system with two-handed loot and spatial banking at the exit cart (§2.4). Pinched = run over, one Last Trick saves you (§2.6).
  - Run structure: 3 acts × (2 chosen jobs + 1 Big Job) ≈ 9 floors, job-board choice with visible risk/modifiers, fence screen between jobs (sell / draft tools / buy intel) (§2.6).
  - Tool roster with named 3-tier evolutions, 12 Tricks, 3 thief loadouts, 10 guard types incl. Old Copper hunter, 6 building archetypes, 5 districts, 4 Big Jobs, 10 named Scores, 10 job modifiers (§2.5–§2.8).
  - Anti-degenerate counters are part of the core, not tuning: you need light for fine work (dark lantern), wardens relight, lure habituation, body evidence, un-KO-able hunters (§2.3, red-team).
  - Big Jobs are 2-floor buildings; standard jobs 1 floor.
- OPEN (Phase 3+ decides):
  - Teaching curriculum specifics (which scripted encounters, in what order — gating table in §2.8 is the constraint).
  - All feel-layer specifics: sprite construction, animation frame counts, synthesis recipes, music layer instrumentation, palette hex values, HUD layout.
  - Fire propagation (oil + flame) — deliberately deferred to Phase 4 as a stretch system, NOT cut (see red-team). Chandelier winches likewise stretch.
  - Exact tuning numbers in §2.1–§2.3 are *defaults with rationale*, expected to move in Phase 4; the *structures* are settled.
  - Mid-run save format (serialize between jobs — required, runs are 25–40 min; shape decided in Phase 4).
- Known risks (carry forward): detection fairness is a knife-edge I can't feel → every number in §2.1 errs generous + legible (fill bars, ghosts, audio tells); screenshot checkpoints with the user EARLY in Phase 4 (feedback_user_provides_visuals). Covet-rhyme is answered structurally (§2.4 note) — don't drift back to payout-math greed.
- Read first (Phase 3): feedback_multichat_build_workflow, feedback_teach_core_in_game, feedback_onboarding_and_ambition, feedback_juice_and_feel, feedback_character_art_and_layout, feedback_walk_cycle_and_facing_recipe, feedback_user_provides_visuals, then §2 of this file end-to-end (especially §2.8 gating + §2.9 identities).

## 0 — Divergence map (what exists, where my defaults land)
Occupied basins in this repo — a new core must not be a sibling of these:
- **Collector-dodger canvas arcade** (Lumen, Covet) — my house default; the basin I fall into unprompted. Includes the greed/banking dial (Covet owns push-your-luck-while-dodging).
- **Survivors-like auto-battler** (Nyx, Wick) — auto-fire, upgrade cards, timed night, bosses.
- **Momentum/orbit one-button roguelite** (Gyre) — physics-flow verb.
- **Tower defense / maze-bending** (Wend) — flow-field rerouting.
- **Turn-based tactics** (Bastion, Reprise) — grid, telegraphs, time-echoes.
- **Card deckbuilder** (Ember) — energy/block, node map.
- **Factory/automation** (Foundry) — logistics, milestones, power.
- **Farming** (Plantation, live co-build) — plant/grow/sell.
- **Tile puzzle** (Marigold), Marble Run, Amoeba/cells.
- **Possession platformer** (Symbiont, tabled) — body-hop traversal; sci-fi invasion villain fantasy.
- **Underwater horror** (Echolocation) — being built in Unity, NOT web; its ping-to-see verb is spoken for.

Unoccupied fantasies (where to aim): indirect/god control, meta/rule manipulation, stealth/information, terrain destruction, economy-drafting, offense-inversion (being the horde), rhythm/timing, navigation/logistics-adventure.

Idea bank carryovers the user already loved ("SICK", 2026-06-26): **Conductor**, **Rule-breaker** (Echolocation is spoken for in Unity). Both included below — they compete on even footing, not grandfathered in.

## 1 — Core shortlist (ranked, NON-committal — user picked #4)
Ranking = my read of (novelty for this repo × depth ceiling × survives-blind-tuning). Every entry lists why it could be #1 and why it could fail.

### 1. Rule-breaker — "the weapon is editing the game's rules" (idea bank)
Action-puzzle rooms. Enemies/hazards run on visible rules ("bullets travel until they hit a wall", "gravity pulls down", "doors need keys"). You carry a limited hand of EDITS: grab a rule token and rewrite it mid-fight (bullets→heal, walls→edible, gravity→flips for everyone). Programmer-brain power fantasy.
- **Recurring decision:** which rule to break and when — every edit is global, so it empowers enemies/hazards too; breaking one thing always bends another.
- **Depth levers:** rule combos (2 edits interact = emergent solutions), locked/armored rules, rooms designed around specific edits, edit economy (uses-per-room? cooldown? sacrifice-a-rule-permanently?), enemy types that exploit YOUR edits back.
- **Why #1:** highest novelty ceiling of anything here; content = designed rooms, which are contained and fully verifiable headlessly; decision-density is enormous.
- **Why it could fail:** combinatorial rule interactions are a bug factory (mitigable: rules as data + property tests); needs a LOT of authored rooms to shine — content budget is the product.

### 2. Undermine — mining-descent push-your-luck where the map is your own tunnel
You pilot a digger. Ore is richer the deeper you go; you carve permanent tunnels through destructible strata. Fuel/air only refill at the surface — every dig deepens your commitment, and your own tunnels are the only way back up. Gas pockets, cave-ins, magma, and things living in the dark punish greed. Sell at surface → outfit the rig → dig deeper. (Motherload/SteamWorld Dig loop, which this repo lacks entirely.)
- **Recurring decision:** one more stratum vs enough-fuel-to-climb-home — the greed dial, but SPATIAL: your escape route is literally the shape you carved on the way down.
- **Depth levers:** strata as biomes that rewrite digging (ice slides, sand collapses and refills, crystal needs charges, flooded layers); a 2nd verb (blast charges / grapple / support struts); rig evolution tree; artifact side-objectives that lure you off the safe shaft; procedural seams = run variance.
- **Why high:** terrain-as-system is the Foundry lesson done right (spatial, not scalar); the loop is proven fun and survives rough tuning; almost everything is headlessly verifiable.
- **Why it could fail:** greed dial rhymes with Covet's banking (the DECISION overlaps even though the verb doesn't); mining theme superficially echoes Foundry. It's the "safest" pick here — which is exactly what the divergence lessons say to distrust.

### 3. Conductor — herd autonomous creatures with pulsed world-forces (idea bank)
You never control a hero. Creatures wander on visible AI; you fire timed PULSES of world-force (gust, gravity well, current, repulse) to herd them to goals and away from hazards. Indirect god-game.
- **Recurring decision:** when/where to spend a limited pulse — early nudge = cheap but drifts; late nudge = precise but desperate. Pulse types trade width vs strength.
- **Depth levers:** creature species with different physics responses (heavy, skittish, flocking, contrarian — pushes attract it); terrain that bends pulses (channels, baffles, mirrors); multi-species levels where one pulse herds both; pulse loadout drafting between levels; predator creatures you herd INTO things as weapons.
- **Why high:** no indirect-control game in the repo; decision is pure (limited resource, spatial, timed); levels are authored content = verifiable.
- **Why it could fail:** indirect control lives or dies on creature-AI feel, which I tune blind; "mushy inputs" is the failure mode and it's experiential. Highest feel-risk of the top tier.

### 4. Lampblack — stealth-heist roguelite (sightlines, sound, greed) ← **PICKED**
Top-down heists. Guards have visible view-cones and HEARING (movement speed = noise radius — sprint is loud). You case the floor, pick a route, crack what you can carry, get out. Alarm state escalates the floor permanently. Take the score you have, or push one more room?
- **Recurring decision:** speed vs noise, and loot-greed vs a shrinking escape window (the vault is always deeper than the exit is close).
- **Depth levers:** tools (smoke, lockpicks, decoy noise, blackjack) as a drafted kit; floor generators with camera/dog/patrol variety; heat meta between heists (hit the same district too hard and it hardens); scripted "big jobs" as bosses.
- **Why mid:** stealth is a real information-game (a genre of decisions, not reflexes) and the repo has none; sightline/sound systems are spatial and verifiable.
- **Why it could fail:** stealth frustration is a tuning knife-edge (detection that feels unfair), and I can't feel it; greed dial again rhymes with Covet.

### 5. Cortege — you are the horde (reverse tower defense)
The kingdom builds defenses; you MARCH THE DEAD. Sculpt and send waves — pick units, lanes, timing — then actively cast on the battlefield while the wave walks (haste, shield, exhume fallen defenders as yours). Their defenses evolve between assaults; you counter-build your horde.
- **Recurring decision:** composition + lane + timing against a defense you can scout; souls economy — spend on this wave vs bank toward monsters.
- **Depth levers:** unit evolution trees; defender AI that adapts (they rebuild where you broke through); champion units you promote across a campaign; live-cast 2nd verb keeps it from being pure watch-it-happen.
- **Why mid:** inversion fantasy (villain general) is fresh even though TD furniture is Wend-adjacent; strong economy + composition decisions; highly verifiable.
- **Why it could fail:** passivity — if the live-cast verb is thin, you're watching pathfinding; and it shares battlefield DNA with Wend (I'd be back in a defended-lanes basin from the other seat).

### 6. Ballast — wind, cargo, and pirates trade-adventure
Top-down sailing on a living wind-field (visible flow arrows). Buy low, sail routes, sell high — but wind is a physics system you tack against, cargo weight changes handling, and pirate territories move on the map. Storms rewrite the wind live.
- **Recurring decision:** route risk vs margin (fat cargo through pirate straits, or thin cargo the long safe way) compounded by a sailing verb with real skill (tacking, weight).
- **Depth levers:** ship outfitting tree (speed vs hold vs guns); dynamic economy (prices respond to what you flood); contracts/smuggling; boarding fights; seasonal wind patterns as run structure.
- **Why lower:** navigation+logistics fantasy is unoccupied and the wind-field is a proper spatial system; but scope drifts toward menus-and-numbers, and sailing feel is tuning-sensitive. Gyre also already owns "momentum against a field" adjacently.

### 7. Menagerie — shop-drafting auto-battler (Super-Auto-Pets-like)
Buy/sell/position critters in a shop phase; they auto-fight another team; synergies compound. Pure decision game, zero reflexes.
- **Recurring decision:** every gold piece (buy/reroll/level/freeze) against a visible meta.
- **Why lower despite being the most verifiable game here:** it's turn-based menu-tempo — Ember proved this user finds correct-but-slow loops boring, and the juice ceiling is low. Listed because the DECISION density is the highest on the page and it's the single best fit for headless verification. A splice donor (its shop-draft economy could bolt onto Cortege or Lampblack).

### 8. Downbeat — rhythm-locked dueling
Combat where actions cost beats: act off-beat = weak, sync to the downbeat = devastating, but enemies don't wait. Choose between acting NOW (weak, safe) or holding for the measure (strong, exposed).
- **Recurring decision:** tempo-greed — every bar is a push-your-luck against incoming attacks you can see coming in the music's structure.
- **Why last:** the product IS audio-visual timing feel and I'm blind AND deaf in this environment — this is the one concept where "needs a human to judge" applies to the CORE, not the trim. Included deliberately (per feedback_build_the_novel_feature it deserves a slot, not a silent pre-cut) but flagged honest: picking it means the user signs up to co-tune the feel early and often.

---

# 2 — SYSTEMS & CONTENT (Phase 2, 2026-07-25)

**Theme, settled: gaslamp-noir Victorian city.** *Why:* the era makes LIGHT a physical, manipulable object (gas lamps you snuff with soot-black fingers, candles, moonlight, dark lanterns) instead of electric switches — the setting IS the mechanic. It also hands us the whole content palette free: watchmen with lanterns, bloodhounds, galas, safecracking, fences, bobbies' whistles. The name Lampblack becomes literal (lampblack = the soot of burnt lamp oil; the thief is the smudge the lamps leave). *Rejected:* modern/neon cyber-heist (electric light = binary switches, less tactile; neon is Nyx's look), fantasy dungeon-heist (drifts toward combat expectations), 1920s noir (fine, but gas > electric for the snuff verb). **Settled.**

**The player fantasy in one line:** you are the city's ghost story — the shadow that empties manors while the watch swears no one came in. Every system below serves *reading a floor like a predator reads a herd*, then getting greedy and having to improvise.

## 2.1 — The three channels (the stealth model)

The core is an information game played on three overlapping spatial fields, all VISIBLE (the player sees everything the simulation knows about them — fairness through legibility). Foundry lesson applied hard: none of these is a scalar; all three live in geometry.

### 2.1.1 LIGHT — the terrain you manufacture
- Every floor tile has light level ℓ ∈ [0,1], the clamped sum of contributions from **sources**: wall gas lamps (pool r≈4 tiles), table candles (r≈2), fireplaces (r≈3, flicker), guard-carried lanterns (r≈3, MOBILE — a walking light pool), moonlight through windows (directional quad, immutable), the player's own dark lantern when shuttered open (r≈2 — you are a beacon).
- Light is occluded: shadow polygons cast from walls/furniture via raycast. A lamp doesn't light around a corner. (Render = the game's visual identity, see §2.9.)
- **Snuffing (signature verb):** adjacent + interact = pinch a lamp/candle out. Silent, instant, permanent-until-relit. **But:** a doused lamp is EVIDENCE — a guard who walks into a dark zone he knows should be lit gets +suspicion and relights it (Warden type relights diligently). Gas valves (1–2 per floor, in service rooms) kill a whole zone's gas lamps at once — loud hiss for 2s (sound event), and the Warden will find the valve eventually.
- **Darkness costs YOU too (anti-degenerate core rule):** fine work — safecracking, lockpicking on quality locks, reading documents, spotting small loot glints — requires ℓ ≥ 0.3 at the work point, so you either leave a lamp lit near the safe or open your own dark lantern shutter and glow. Full-dark floors are not free wins; they're trades.
- Moonlight windows can't be doused; rooms with them are permanent risk corridors. Weather modifies (overcast job modifier = no moonlight).
- **The soot gem (added at seam — a genuine miss):** a small HUD glyph (a soot-smudged lantern lens) showing ℓ *at the player's exact position* — dark = hidden, glowing = exposed. Rendering light pools shows the field, but the single most important number in a stealth game is "how visible am I RIGHT NOW," and Thief made this canonical for a reason. Cheap, non-negotiable legibility; the fairness contract was incomplete without it.
- *Rejected:* binary lit/unlit rooms (scalar-in-disguise, kills the geometry play); player-placeable portable lights beyond the dark lantern (economy noise). **Structure settled; radii/thresholds are Phase 4 tuning.**

### 2.1.2 SIGHT — graduated, legible, light-driven
- Guards have a view cone (≈90°, facing-driven) rendered as the actual occluded polygon on the floor. **Cone length is a function of light at the *target*:** R = lerp(2.5 tiles in ℓ=0 → 8 tiles in ℓ=1). You are hard to see in shadow even point-blank-ish; you are visible across a ballroom in lamplight.
- **Awareness fill per guard, 0–100, visible as a fill glyph over their head AND as the cone tinting yellow→orange→red.** While the player is in cone+LOS: dA/dt = k · (1 − d/R) · M · L, where M = motion factor (still 0.4, creep 0.6, walk 1.0, sprint 1.6, mid-takedown 2.0) and L = light blend at player. Default k tuned so: sprinting adjacent in lamplight ≈ instant, creeping at cone-edge in shadow ≈ 5–6s of sustained exposure. Decays −30/s after 1s unseen, **but only below the suspicion threshold it last crossed** (suspicion is sticky for that guard).
- Thresholds: **35 = SUSPICIOUS** (stops, turns toward you, "…eh?" vocal); **70 = INVESTIGATE** (walks to your last seen spot, searches nearby hide spots); **100 = DETECTED** (shout — a LOUD sound event other guards hear — then chase; feeds the Alertness ratchet, §2.3).
- **Last-known-position ghost:** when you break LOS during investigate/chase, a translucent "you" marker freezes where they lost you — the player literally sees what the guard believes. Guards search around the ghost (nearest 2–3 hide spots, then radius sweep), not around your real position. This single element makes the whole information game playable and is non-negotiable content of the core.
- Civilians (gala/manor guests, servants) have short cones (3 tiles, light-independent) and no awareness fill — they instantly startle if you're blatant (sprint/weapon out/dragging a body in cone) and run screaming to the nearest guard (a mobile sound event).
- *Rejected:* binary insta-spot (the frustration knife-edge named in Phase 1 — graduated fill + visible state IS the mitigation); "detection meter on the player" as one global scalar (per-guard fills preserve the spatial question *who* is noticing me).  **Settled.**

### 2.1.3 SOUND — propagated through the door graph, both ways
- Every noise is an **event with loudness L (in tiles) at a point**, propagated over the room/door graph by BFS: crossing an open door multiplies remaining loudness ×0.7, a closed door ×0.25, a wall = blocked (must route through doors). Within a room it falls off with distance. NOT a bare radius — a scream two rooms away through closed doors is quieter than a coin-drop in your room. Guards compare received loudness to their hearing threshold.
- **Movement noise:** creep = silent, walk = L2 per-step ticks, sprint = L6. Multiplied by **floor material** (carpet ×0.5, wood ×1 with random creak-tiles that spike L4 unless crept over, marble ×1.3, broken glass ×2.5) and by **encumbrance** (§2.4).
- **Action noise (loud verbs):** glass cut = L1 / glass smash = L10; lock pick = L1 ticks / door force = L8; safe: pick the dial = slow + L1 / drill = fast + L7 sustained; blackjack = L3 thump; body drag = L2/step; dumbwaiter = L3 clunk; gas valve = L5 hiss.
- **Guard response by received loudness:** faint (≥threshold) = glance toward it; clear (≥2×) = investigate the SOURCE POINT; loud (≥4×, or any scream/shout/gunshot-class) = +Alertness AND converge. Guards investigate where the sound *came from*, not where you are — thrown noise (coins, songbird) displaces guards. **Habituation (anti-spam):** the same lure class heard twice within 60s → the guard doesn't walk, he ratchets +10 Alertness ("someone's playing games"). Lures are a rationed displacement tool, not a remote control.
- **Sound is bidirectional information — the player HEARS the guards** (this is where the audio directive becomes mechanics): every guard type has an audible tell (§2.8) — whistling watchman, jangling warden keys, dog panting, snoring sentry — spatialized (WebAudio pan + distance gain) so an eyes-closed player knows what's around the corner. What you can hear, they can hear: the footstep sounds the player's speakers play are literally the L-values guards receive. One truth, two consumers.
- **Visible sound:** every noise renders as an expanding ring (yours = white, guards' = amber, lures = blue); rings visibly die at closed doors. Deaf-friendly and teaches propagation for free.
- **Scent (dogs only):** the player drops invisible-to-guards trail nodes (every 0.5s, TTL ≈ 15s, visible to the PLAYER as faint soot footprints). Dogs within ~4 tiles of a node lock on and follow the chain. Smoke, spilled oil, or crossing a fireplace breaks the chain. Dogs ignore light entirely — the counter-system to shadow play.
- *Rejected:* radial noise circles ignoring walls (the exact scalar-collapse Foundry warned about); footstep noise as a stamina-style meter. **Settled.**

## 2.2 — Verbs, tools, and the hands

**Primary verb: movement itself** — the speed dial (creep/walk/sprint) is a continuous risk decision; add **doors as a manipulable topology** (open/close; closed doors block cones AND muffle sound, but a guard who finds a door closed that his route expects open gets +suspicion — the world remembers your touches).

**Second verb, settled: THE HANDS.** One contextual interact system with real depth: snuff/relight lamps, pick locks (hold-to-fill with audible tick... tick... — interruptible, faster = louder option via tension wrench "rush pick" L4), crack safes (dial minigame: rotate to felt-click stops shown as subtle ring pulses — needs light; or drill loud), cut/climb windows, throw (coins/noisemakers/smoke — aimed arc), blackjack takedown (from behind cone only, unless Bruiser), drag/stash bodies (into wardrobes/under beds — the same hide spots YOU use; a stuffed wardrobe is one less hiding place for you — lovely little economy), peek (through keyholes/door cracks: reveals the room through the door without opening — casing verb), stash/retrieve at the exit cart.

**Hide spots:** wardrobes, under beds, curtains, crates, shadows-behind-furniture. Guards at INVESTIGATE+ search the 2–3 nearest hide spots to the ghost marker. At ALARMED+ they pattern-search rooms they pass. Hiding isn't invincibility, it's a bet on their search pattern.

**Casing (the pre-verb):** every job starts OUTSIDE the building on a perimeter strip. Walk it freely; peek through windows to reveal interior rooms + observed patrol segments (fog-of-war lifts where observed, patrols draw their observed path as dotted routes that persist). Enter when you choose (door/window/coal chute per gen). Casing costs only the **rounds clock** (§2.3) — information is never free, but it's cheap before you're inside.

**Tool roster (draftable consumable/equipment kit, 4 slots + coins always):** see content table §2.8 with 3-tier named evolutions per feedback_replayability_and_content ("if a card shows MAX it must DO something" — here every tool's max tier changes tactics, not numbers).

## 2.3 — Alertness, evidence, and the ratchet

**Floor Alertness: 0–100, ONE-WAY (never decays). Rendered as the wall-lamp flames themselves creeping from warm amber → white → red-tinged, plus the music layers (§2.9) — the floor itself is the meter.** (Settled in Phase 1: alarm hardens permanently.)

| Stage | Range | Floor hardening (permanent) |
|---|---|---|
| CALM | 0–24 | Baseline patrols, sentries doze, lamps amber. |
| WARY | 25–49 | Head-turn sweeps added to patrols; wardens relight lamps on sight; sentries wake; doors close. |
| ALARMED | 50–79 | Patrols pair up + reroute through high-value rooms; +1 response guard enters at main door; interior doors start locked; hide-spot spot-checks. |
| LOCKDOWN | 80–100 | All exits seal except the ONE farthest from the vault (shown on map — the long walk out); Old Copper enters on Act 2+ floors; marksmen man balconies; civilians evacuate (gala). |

**Feeds (all events, all avoidable):** detected shout +25; body discovered +20 (KO'd) / civilian screaming +10; loud-class noise +8; doused-lamp cluster noticed +5; forced door/smashed window discovered +5; **famous Score noticed missing +15** (see below); lure habituation +10; **rounds clock: +4 per 90s on-site** (the shift wears on; makes time — and therefore casing, creeping, and greed — a real spend; replaces any hard fail-timer). *Rejected:* decaying alarm (industry default, but the ratchet IS the identity — every mistake is permanent, so the "one more room" question compounds); hard mission timer (feels arcade, punishes the casing fantasy).

**Evidence — WHAT you steal is a decision:** loot is tagged. **Quiet loot** (drawer cash, pocket watches, unattended silver) is never missed tonight. **Attended loot** (jewelry from an occupied bedroom, gala jewel) risks discovery on next civilian interaction. **Famous loot (Scores — the run's real prize)** sits on display; its absence is noticed by the next guard whose patrol passes the pedestal → +15 and an investigate. You can **forge-swap** (Tier-3 lockpick evo / manor jobs provide decoy busts) to delay discovery. So the vault question is never just "can I reach it" but "what does taking it do to my exit."

**Chase & capture:** DETECTED → guard chases at sprint-equal speed but loses you on broken LOS + 3s (→ ghost search). While chased, your sprint is free (stealth already blown locally). **Grabbed** (guard adjacent 0.5s) → the **CAPTURE LADDER** (settled at seam — user delegated the harshness call; my read: run-over-on-one-blind-tuned-grab is the frustration knife-edge itself, so mercy comes in layers and every layer COSTS):
1. **Last Trick** (start with 1; Bruiser 2; smoke T3 refunds one): auto-burns — soot-cloud burst, guard blinded, dropped 3 tiles away, +10 Alertness.
2. **The Crooked Watchman** (once per RUN, genre-native: every man has his price): if trickless, you may bribe — costs ALL carried cash + the entire bag (handed over), price floor scales by act (A1 200 / A2 500 / A3 1000 — can't pay = no deal); job fails, Heat +2, run continues gutted. **Old Copper and Sergeants cannot be bribed** — getting grabbed by the hunter is always the end.
3. **PINCHED = run over** (keep only REP already fenced).
You can always flee to any unsealed exit with whatever's in the bag — the deepest mercy is retreat, never rescue. *Rejected:* HP bar (not a combat game; capture-as-death keeps every guard lethal and every decision about information, not attrition); mid-run jail-break minigame (post-ship candidate; softens the ratchet for v1); unlimited bribes (capture must stay scary — one bribe is a story beat, two is a mechanic to farm).

## 2.4 — Loot, bulk, and spatial banking

- **The swag bag: 6 slots.** Loot has bulk (1–3 slots) and value. Encumbrance is mechanical, not cosmetic: each filled slot +8% movement noise and −4% speed; at 5+ slots you can't sprint. **Two-handed loot** (paintings, candelabra, the harp?!) occupies THE HANDS: while carrying you cannot snuff, pick, throw, blackjack, or hide in wardrobes — you are a mule on a route you'd better have prepared. Drop it to act (floor thud L3), pick it back up.
- **Spatial banking:** your **exit cart** (rope/coal-chute/carriage at your entry point) is the stash. Loot in the bag is AT RISK (pinched = gone); loot walked back to the cart is banked for the job. Banking = physically re-crossing the floor you've been hardening. **This is the Covet-differentiator, structural:** Covet banks with a decision at a moment (press the button at the bank); Lampblack banks with a JOURNEY through a ratcheting spatial state — the greed question is a routing problem ("the vault room's open, but I'm 6 slots deep on a LOCKDOWN floor and the open exit is the far one"). Don't let Phase 4 add a "bank remotely" convenience that collapses this.
- **Dumbwaiter (manor/gala gen feature, and a tier-3 tool):** send bag contents (not yourself) down a chute to the cart from deep in the floor — L3 clunk, 1 slot per 10s. Turns a known dumbwaiter room into a strategic forward base. *Why:* rewards casing and route planning; a partial bank that costs noise and time rather than a free skip.
- **Job goal structure:** every job posts a **quota** ("the client wants the deeds; take what else you like") — quota loot banked = job success (pays contract fee + keeps the run's economy moving); everything above quota is yours. Greed has a floor (you must go in) and no ceiling (the fence §2.6 always wants more).

## 2.5 — Floor generation (buildings, not caves)

- **Room-template stitching:** each building archetype defines a room-set (with weights) and adjacency rules; generator lays a rect-ish footprint (standard job ≈ 26×18 tiles, Big Job ≈ 34×24 × 2 floors linked by 2+ staircases), partitions into rooms (BSP with min/max per archetype), assigns types by rules (kitchens touch service corridors; vault/objective always at **max door-depth from all exits** — the greed geometry is enforced, never accidental), doors from adjacency (plus locked-quality tiers), windows on outer walls, furniture/hide-spots/lights/creak-tiles per room-type template, loot seeded by room type + job quota placement.
- **Patrols:** generated as loops over the door graph guaranteeing coverage of high-value rooms with deliberate gaps (every floor must have at least one full-loop shadow route to the objective at CALM — solvability by construction), plus posted sentries at chokes, plus a Warden circuit through lamp-dense zones. Patrol timing offsets randomized per run.
- **Verification (Phase 4 note):** headless asserts — connectivity, exit-count, objective-depth ≥ threshold, shadow-route existence (A* through low-light low-cone-coverage cost field), patrol coverage %, no unreachable loot, both stairs usable on 2-floor. Bot as probe: a greedy-router bot that cases, snuffs, and routes — its failures localize gen bugs, never judge difficulty (feedback_bot_is_a_probe_not_a_judge).
- **Archetypes (6):** Townhouse (compact, creaky wood, families = civilians), Manor (sprawling, carpets + dogs + wardens), Counting-house/Bank (marble = loud, quality locks, few windows, vault), Museum (open galleries, moonlight skylights, pedestal Scores, marksman balconies), Warehouse/Docks (crates = hide-spot maze, lantern patrols, no civilians, gang toughs variant guards), Gala Manor (Big-Job-only: crowd dynamics, servant disguise verb, the jewel on display).

## 2.6 — Run structure & economy (the night, the fence, the draft)

**A run = one SEASON of the city's fear, 3 acts ≈ 25–40 min.** Act = **job board** (choose 2 of 4 offered jobs, sequentially) **→ mandatory Big Job** (act boss). 9 floors total. *Rejected:* endless-heist survival (no arc, no finale to tune — feedback_climax_and_juice_budget wants a designed climax); single-heist sessions (throws away the drafting/meta layer); node-map à la Ember (job BOARD with rich listings beats abstract nodes for this fantasy — the listings ARE the choice texture).

- **Job board listings show:** district, archetype, quota + fee, headline risk ("dogs", "marksman", "moonlit"), 1–2 **job modifiers** (§2.8 — run variance), and district **HEAT**.
- **HEAT (in-run district meta):** each district hit +1 Heat (+2 if you left at ALARMED+, +3 LOCKDOWN). Heat upgrades that district's future listings: +1 guard tier, faster rounds clock, better locks — but also **fatter quotas & fees** (scared rich hire guards AND move valuables home). Hit where it's cold, or farm where it's hot for pay — the roguelite's push-your-luck at the MAP layer. Heat persists the whole run; the finale district's Heat is set by your whole season's behavior.
- **The FENCE is a CHARACTER: MAGPIE** (added at seam — the spec had systems and nobody living in them). She runs a curiosity shop of stolen shine; every fence screen is her counter — she appraises your haul with a line, needles your sloppy jobs ("half the district's lit up like Christmas, dearie"), brags about Scores, and warns about listings ("the Vane house keeps dogs now — my knees remember"). Cheap to build (portrait + text pool keyed to run state), enormous personality return, and she is **Phase 3's teaching mouthpiece** — tips come from Magpie's mouth, not a tutorial box. One screen, four spends — **sell** loot (Scores pay 3× + 1 REP each); **restock/draft tools** (pick 1 of 3 offers; evolutions offered when a tool is Tier-max-owned + rep threshold); **draft a Trick** (thief perk, pick 1 of 3, ≈ every other job); **buy intel** for the next job (floor plan reveal / patrol routes / loot survey / guard roster — information as literal economy, genre-native). Money is tight by design: Big Jobs demand a **buy-in** (bribes, schematics — Act1 ≈ 400, Act2 ≈ 900, Act3 ≈ 1600) so greed is *pulled* by need, not just score-chasing.
- **Big Jobs (act bosses, scripted setpieces on gen'd bones, 2 floors):** Act 1 — **The Counting House** (timelock vault: 3 key-holders patrol independently; pick all three pockets or crack 3 side-safes for copies). Act 2 — **The Gala at Vane House** (crowd = mobile cover; the Vane Emerald on display in the ballroom's brightest pool; servant disguise lets you walk lit rooms slowly but any RUN/interact blows it). Act 3 finale — **The Magistrate's Archive** (the city's evidence vault: Old Copper patrols from minute 0, your season's Heat sets the garrison; stealing YOUR OWN case file erases one Mark/permanently rep-boosts — the season's story closes on it).
- **Failure & mercy:** pinched = run over (keep fenced REP). Fled-without-quota = job failed, fee lost, Heat +1 anyway, run continues poorer. Can't afford a Big Job buy-in = the season ends in disgrace (soft loss with rep consolation) — the economy IS a fail-state.
- **Mid-run save:** serialize at fence screens (runs are long; browser reality). Phase 4 shapes it.

## 2.7 — Progression: Tricks, evolutions, and the Den (meta)

- **In-run: Tricks of the Trade** (drafted perks, §2.8 list of 12) + **tool evolutions** (each of 8 tools has 3 named tiers; tier jumps change TACTICS — e.g. lockpicks T3 "Ghost Key" opens *without trace* = no evidence feed — not just numbers).
- **Between runs: the DEN.** REP (earned per Score fenced, small trickle per job done clean) unlocks, in order: 2nd thief loadout (Cracksman), tool draft-pool expansions (each unlock ADDS offers, never removes), 3rd loadout (Bruiser), job-modifier pool expansions (harder+richer listings start appearing), district cosmetic states, and **Vows** (opt-in run modifiers à la ascension: "No Blackjack", "Moonlit Season (+moonlight, +fees)", "The Long Night (4 acts)") for earned difficulty. *Rejected:* stat upgrades between runs (+5% speed etc. — power creep that detunes the detection model I can't re-feel; unlocks add OPTIONS, never stats).
- **Thief loadouts (3):** **The Wisp** (default): creep 20% faster, 5-slot bag, starts snuffer+coins. **The Cracksman** (unlock 1): safes/locks 40% faster + silent picks, starts lockpicks+glass cutter, but hearing-threshold-worse guards? no — instead: 6-slot bag, 10% slower sprint. **The Bruiser** (unlock 2): frontal blackjack (with L5 scuffle), 2 Last Tricks, +1 bag slot, but +25% base movement noise — the loud build. Each rewrites the verb priorities, not the numbers only.

## 2.8 — CONTENT LISTS (countable, buildable, gated)

**Guards (10) — each with silhouette + audio tell (identity specced NOW per user directive; Phase 3 does the frames/synthesis):**
| # | Type | Behavior hook | Silhouette | Audio tell | First appears |
|---|---|---|---|---|---|
| 1 | Watchman | Loop patrol, carries LANTERN (mobile light pool) | Long coat, tall hat, lantern arm | Whistled tune (leitmotif) | A1J1 |
| 2 | Sentry | Posted; dozes at CALM (snore = safe rhythm, stutters before waking) | Slumped chair, chin on chest | Snore cycle | A1J1 |
| 3 | Warden | Circuit; relights lamps, re-locks doors, closes windows — UNDOES your prep | Hunched, huge key ring | Key jangle | A1J2 |
| 4 | Constable Pair | Two-man patrol, rear man watches BACKWARD (no sneak-behind) | Matched bobbies, capes | Footsteps in step + small talk murmur | A2 |
| 5 | Hound + Handler | Dog hears ×2 and follows SCENT trails; light-immune | Quadruped lope + leash-man | Panting, snuffling, bark on lock | A2 |
| 6 | Sergeant | Spawns as ALARMED response; fast, searches hide spots properly | Plumed helmet, sabre | Barked orders | A2 |
| 7 | Marksman | Balcony post, cone ×2 length but ONLY over lit tiles (useless in dark) | Long rifle, perched | Rifle-cock click when acquiring | A3 + Museum |
| 8 | Dockside Tough | Warehouse variant: no uniform, erratic non-loop wander | Broad, cap, cosh | Off-key humming, spits | Docks district |
| 9 | Guests/Servants | Civilians: short cone, scream-beacon, no fill (startle) | Gowns/livery, candlesticks | Chatter, gasp-scream | Manor/Gala |
| 10 | **OLD COPPER** (hunter) | Enters at LOCKDOWN (A2+) or Archive start; CANNOT be KO'd; follows evidence chain (visits each evidence site in order, then hunts your ghost) ; dark-lantern cone SNAPS open/shut on a rhythm | Massive greatcoat, bullseye lantern, limp | Slow heavy boot + lantern shutter *shk-CLACK* | A2 Big Job |

**Hazard/furniture systems (9):** mirrors (extend/bend guard cones around corners — visible reflected cone), creaky boards (marked tiles, L4 unless crept), broken glass patches (L amplifier, placeable by smashing), bell-rigged doors (disarm = 3s hands-work), pressure chimes (rug-hidden, revealed by peek/intel), moonlight quads, gas valves, dumbwaiters, manor cats (wander; startle → yowl L5; can knock ornaments — false-positive noise the GUARDS also mis-investigate — and they follow fish-lure… tier-3 coins? no: cats are ambient chaos, not a tool).

**Tools (8 × 3 tiers — draft pool):**
| Tool | T1 | T2 | T3 (tactic-changer) |
|---|---|---|---|
| Snuffer | Pinch adjacent | **Blowpipe**: snuff at 4 tiles, silent | **Gloom Oil**: doused lamps CAN'T be relit (wardens fail, +panic) |
| Coins | Toss lure L3 | **Chime coin**: lingers, repeats ×2 | **Songbird box**: walks 6 tiles chirping — a MOVING lure drawing guards in a line |
| Smoke bomb | Cloud: blocks LOS 6s | **Soot bomb**: also DOUSES lamps in radius | **Blinding ash**: guards inside rub eyes 4s + refunds a Last Trick once/job |
| Lockpicks | Std locks | **Skeleton set**: quality locks, faster | **Ghost Key**: opens ANYTHING traceless (no evidence, no suspicion from opened doors) |
| Blackjack | Behind-KO | **Sandman**: KO 2× faster, L1 | **Chloroform rag**: silent, no scuffle, works mid-walk |
| Glass cutter | Silent window entry | **Circle cut**: reach-through loot/latch without entering | **Mirror kit**: place/steal mirrors — REDIRECT guard cones yourself |
| Oil flask | Slick tile: guards slip (L6 comedy + 5s down) | **Scent oil**: breaks dog trails | **Lamp sabotage**: rig a lamp to flare-and-die — timed remote darkness |
| Rope & grapple | Rappel out any window = instant partial bank (bag→cart, you stay) | **Ceiling hook**: hang above a room 5s | **The Long Line**: zip between windows across the facade |

**Tricks of the Trade (12, draft 1-of-3):** Soft Step (all floors count as carpet), Night Eyes (+1.5 dark sight for YOU, see §2.9 vignette), Peripheral (cones visible through walls 6 tiles), Second-Story (window entry/exit 2× speed), Greedy Fingers (loot/pick 25% faster), Pack Mule (7th slot, immune to 5-slot sprint lock), Card Counter (job board shows one hidden modifier), Silver Tongue (fence prices +20%), Cat Burglar (cats adore you = never yowl, sometimes lure guards), Iron Nerve (grabbed-timer 1.5s — wriggle window), Soot Cloak (standing still in shadow = invisible even to adjacent), Locksmith's Ear (safes show one free dial-stop).

**Named Scores (10, 1–2 seeded per job in matching archetypes):** the Vane Emerald (gala finale of Act 2), the Regatta Cup (docks), Portrait of the Withered Duke (manor, 2-hand), the Meridian Chronometer (counting house), the Whale-Oil Crown (museum), the Ivory Orrery (museum, 2-hand), Letters of the Blackmailed Bishop (townhouse, weightless, fence-explodes-value), the Serpent Candelabra (manor, 2-hand, ironic: it's LIT when you find it), the Docklands Ledger (warehouse, gang Heat −1 when fenced), your own Case File (Archive finale only).

**Job modifiers (10, 1–2 per listing):** Rain (all noise −40% — everyone's, including guard tells), Fog (all cones −2 tiles), Overcast (no moonlight), New Electric Lights (2 zones unsnuffable — the future arrives, warden-guarded), Society Ball (civilian crowds in a non-gala archetype), Double Shift (+40% guards, +60% fee), Inside Man (start with full floor plan), Renovation (scaffolding = extra window entries; drop cloths = extra shadows), Lockdown Drill (starts at WARY, quota fee ×1.5), The Collector Is Home (a unique civilian wanders holding the Score — pickpocket-tail him), **The Other Shadow** (added at seam, the novel one: a RIVAL THIEF works the floor tonight — she cases, snuffs lamps, lifts loot, and races you to the Score; she trips guards' suspicion (free chaos you can surf) but never rats you out; follow her to loot you haven't found; if she banks the Score first it's GONE and Magpie won't say who bought it. Implementation note: she runs the headless probe-bot brain as an in-game actor — the verification tool becomes content. Recurring across a run if she escapes; Magpie hints she has "another client").

**Difficulty/teaching gating (skeleton for Phase 3's curriculum):** A1J1 = watchmen+sentries, no dogs/mirrors, big shadows (teach light/sight); A1J2 = +warden (+evidence teaching), creak floors (sound); A1 Big Job = keys/pickpocket + first response-guard pressure; A2 = pairs, dogs (scent), mirrors, bells; A2 Big = civilians+disguise; A3 = marksmen, electric zones, Old Copper roaming; A3 Big = everything + Heat-scaled garrison. Roster NEVER front-loads (feedback_onboarding_and_ambition).

## 2.9 — A/V identity attached to each system (directive compliance — Phase 3 expands into full feel spec)

- **The look, one sentence:** a soot-and-amber city — near-black blues, every light source a hand-painted warm pool with raycast shadow teeth, and everything the player has touched leaves a faint soot signature only they can see. Canvas 2D, gradient+polygon lighting (no WebGL dependency).
- **Per-system identity (settled as identity, Phase 3 does craft):** LIGHT = the renderer itself (lamp pools breathe/flicker; snuffing = a satisfying *fwip* + curl of smoke particle + the pool irising shut). SIGHT = cone polygons in translucent gold, awareness tint yellow→red, ghost marker = smoky player-silhouette. SOUND = expanding rings dying at doors; guard tells spatialized (§2.1.3). ALERTNESS = the lamps themselves recolor + music layers stack (CALM: vinyl-crackle silence + distant harbor bells; WARY: + brushed hats + bass pizzicato; ALARMED: + tremolo strings; LOCKDOWN: + timpani heartbeat). EVIDENCE = doused lamps smoke faintly; your soot footprints (scent viz) fade behind you. HEAT = district map lamps burn whiter as districts harden.
- **Characters are CHARACTERS** (feedback_character_art_and_layout: no shapes-with-eyes): the thief = hooded silhouette with scarf-tail physics, 8-way facing + full walk/creep/sprint cycles per feedback_walk_cycle_and_facing_recipe, distinct carry/pick/snuff/KO poses. Every guard type owns a silhouette (table §2.8) + gait (watchman stroll, sergeant stride, dog lope, Old Copper's limp) + vocal/foley tell. Phase 3 specs frames.
- **All audio procedural WebAudio** (repo standard, no assets): footstep synthesis per material, whistle-melody synth, snore LFO, key-jangle noise bursts, the *shk-CLACK* shutter. Phase 3 writes the recipes; Phase 4 implements WITH the systems, not after (directive).

## Red-team log

### Phase 1 (self-attack)
- **Is the list leaning?** Watch me: #1–#2 are ordered by my confidence, and my confidence historically = safety. Undermine at #2 is the most-proven, most-verifiable loop — i.e., my comfort food with a new coat. If the user smells convergence, Rule-breaker/Conductor/Cortege are the braver picks and I said so here first.
- **What's missing:** local 2-player (versus/co-op same keyboard) — a real repo gap, cut because solo-verifying multiplayer feel is double-blind; a builder/sandbox (no fail state = no tension); racing (shallow recurring decision). Any could be spliced in if the user wants ("Cortege but 2-player: one defends, one marches" is a genuinely spicy splice).
- **Clone check per pick:** Undermine↔Covet (greed dial) and Cortege↔Wend (battlefield) are the two with sibling DNA — flagged in their entries, not hidden.
- **Fantasy spread check:** god/shepherd, hacker/trickster, prospector, thief, villain-general, captain-merchant, coach, duelist — no two share a seat. Pass.

### Phase 2 (self-attack, 2026-07-25)
- **Degenerate-strategy sweep (each has a COUNTER IN THE CORE, not in tuning):** *Douse everything* → doused lamps are evidence, wardens relight, Gloom Oil is a T3 earn, fine work needs light, dogs/marksmen-in-moonlight ignore your darkness. *Creep everywhere forever* → the rounds clock feeds the ratchet (+4/90s), so patience is a spend. *Lure-spam* → habituation ratchets instead of walking. *KO everyone* → bodies are +20 evidence bombs, pairs can't be approached from behind, Old Copper can't be KO'd, wardrobe-stuffing consumes YOUR hide spots. *Window-in-window-out vault raid* → objective at max door-depth by construction; museums/banks have few/no windows deep. *Hide-in-wardrobe-till-it-blows-over* → Alertness never decays; waiting only feeds the clock. Each of these is ALSO a teachable moment — Phase 3 should script at least the body-evidence and lure-habituation discoveries.
- **What did I almost cut for safety (naming it per feedback_build_the_novel_feature):** (1) *Fire propagation* (oil+flame chains) — genuinely deferred to Phase 4 stretch, in writing, not silently dropped: if built, oil slicks become ignitable, spreading light+alarm+destruction — the loud-run capstone. (2) *Old Copper's evidence-chain AI* — I flinched ("complex"); he's IN, he's the boss-pressure identity and his chain is just an ordered site queue + ghost hunt. (3) *2-floor buildings* — kept for Big Jobs (flinched on ALL jobs — that's a legit scope call, 1-floor standard jobs preserve readability, not verifiability). (4) *Gala disguise verb* — kept, one Big Job owns it (scoping a verb to a setpiece is design, not cowardice).
- **Covet-rhyme check (the flagged risk):** banking is now a routing journey across a ratcheting floor (§2.4), greed is pulled by buy-in need (§2.6), and the choice is *what* to steal (evidence tags), not just how-much-before-the-buzzer. The DECISION shape is now "plan a route through information," not Covet's "release the joystick at the right moment." Structurally differentiated — hold this line in Phase 4 conveniences.
- **One-mechanic audit (feedback_one_mechanic_isnt_a_game):** verb count: move-dial, hands (snuff/pick/throw/KO/peek/drag), doors, hide, case, bank-routing, draft/fence, board/Heat strategy. Terrain that rewrites the verb: materials, mirrors, moonlight, creaks, crowds, 2-floor, weather modifiers. Session growth: tools→T3 + Tricks. Run variance: board choice, modifiers, Heat, archetypes, Scores. Meta: REP unlocks + Vows. Economy: money(fence/intel/buy-in) + REP + Heat + Alertness + slots. Pass — this is a GAME's worth of systems, and none is a scalar-in-disguise (the audit: light=field, sound=graph-propagation, alertness=staged ratchet with spatial consequences, heat=map-layer, carry=slots-with-verb-locks).
- **Where's the thin ice, honestly:** (1) Guard search AI at ALARMED is the hardest correctness surface (ghost + hide-spot search + pairs + dog chains) — Phase 4 must property-test it headlessly (guards never stuck, never teleport-omniscient, always resolve to a route). (2) The dial-safecracking minigame needs feel I can't feel — spec generous defaults, flag for user playtest, DON'T cut to a hold-bar silently. (3) 9 floors × gen variety could outrun the content budget — the archetype/room-template system is the hedge (templates are cheap; ship 6 archetypes even if room-template counts start modest). (4) Am I over-systemizing into sim-territory where fun drowns? The mitigation is the gating table — A1J1 is deliberately a SIMPLE game (light+cones+2 guard types) that the ratchet then deepens.
- **What a fresh me might miss reading this:** the three channels are ONE fairness contract — every rule that watches the player is rendered (cones, fills, rings, ghosts, footprints, soot gem). If any Phase 4 shortcut breaks render-what-you-simulate, the knife-edge risk comes back. Non-negotiable.

### Phase 2-seam (user poke delegated back to me, 2026-07-25)
User confirmed the gaslamp-Victorian flavor and handed the "add more?" question back ("you are the chef"). Ran a second critical pass as the user's voice. What it caught:
- **Real miss #1 — the soot gem:** I rendered the light *field* but not the player's *own* visibility number — the single most-consulted datum in the genre (Thief's light gem). Added §2.1.1. Lesson: I audited "is every rule rendered?" but not "is the MOST IMPORTANT rule rendered most prominently?"
- **Real miss #2 — nobody lives in the spec:** systems everywhere, zero characters outside the floor. Named the fence (Magpie, §2.6) — cheapest possible personality layer and it solves Phase 3's teaching-voice problem in the same stroke.
- **Real miss #3 — a Phase 1 depth lever silently dropped:** the rival-thief idea appeared in the Phase 1 pitch ("The Collector's House — a rival master thief") and vanished from my Phase 2 rosters — a cut-by-omission, the exact anti-pattern from feedback_build_the_novel_feature. Restored as The Other Shadow (§2.8), and it's cheap because the probe bot IS her brain.
- **Harshness call (delegated):** kept run-over teeth but built the capture ladder (§2.3) — one unbribeable-hunter exception preserves terror, one gutting bribe converts the most frustration-prone moment (blind-tuned grab) into a story beat with an economic scar. This is designing around a knife-edge I can't feel, per the standing risk.
- **Examined and deliberately NOT changed:** rounds-clock pacing (+4/90s — Phase 4 tuning, noted a 15-min floor self-ALARMS around min 19, probably right); genre-canon inventory re-checked (light/sound/hiding/bodies/disguise/keys/peeking/casing all present; verticality served by windows+grapple — full rooftop layer would be a different game); guard roster at 10 (enough identities; an 11th adds count, not decisions); no new districts (5 is the content budget's edge already).

## Open questions
- ~~Phase 1: user pick~~ ANSWERED: **Lampblack**, no splice, directive "watch art + sounds" (standing, in HANDOFF).
- ~~Phase 2 seam questions to user~~ ANSWERED 2026-07-25: **gaslamp-Victorian confirmed** ("flavor sounds amazing, keep it"); roster additions + harshness **delegated to me** ("you are the chef… be critical about it to yourself") → seam self-pass ran, four changes landed (soot gem, capture ladder, Magpie, The Other Shadow — see red-team §Phase 2-seam). Note for future seams: the poke can come back to me; a delegated seam = run a SECOND red-team, produce concrete changes, don't just reassure.
- Phase 3: teaching curriculum beats (Magpie is the voice; §2.8 gating is the skeleton); full feel spec (frames, synthesis recipes, palette, layout, Magpie's portrait + line pools).
- Phase 4: fire propagation stretch (in/out); safecracking minigame tuning (user co-tune); mid-run save shape; exact numbers pass; The Other Shadow's bot-brain shared with the verification probe.
