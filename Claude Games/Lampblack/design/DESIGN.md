# DESIGN.md — LAMPBLACK (stealth-heist roguelite)

## HANDOFF
- Phase: 4 — Build & ship | Status: **BUILT + HEADLESSLY VERIFIED** (2026-07-26). The game is playable end-to-end: `index.html` (game), `soundboard.html` + `gallery.html` (feel-review harnesses), `test/headless.js` (976 asserts green: gen sweep, three channels, ratchet, capture ladder, AI soak, probe bot, run economy, teaching gates, DOM input plumbing). **What's owed now: the user's eyes and ears** — screenshot checkpoints (§4.9) + soundboard/gallery audits, then a feel/difficulty tuning pass against their reports. Build-time calls logged in red-team §Phase 4.
- Phase: 3 — Teaching & feel | Status: DONE (2026-07-25)
- Core: **Lampblack** — top-down gaslamp-noir stealth-heist roguelite. Three spatial information channels (LIGHT you manufacture, SIGHT that reads light, SOUND that propagates through geometry), an evidence ratchet that permanently hardens the floor, and a greed loop where the trip back out — not a bank button — is the risk.
- **USER DIRECTIVE (every phase): "watch yourself on art + sounds."** Phase 3 answered with the full feel spec (§4: locked palette, sprite construction + frame counts, per-guard gait/tell sync, WebAudio recipes + 4-layer music, shake budget, defensive HUD) and a six-channel diegetic teaching system (§3, Magpie-voiced). **Phase 4's compliance = implement audio/art WITH each system as it's built (not after), and ship the two feel-review harnesses (§4.9: soundboard page + animation gallery scene) so the user can audit every recipe/cycle by name.**
- Next chat does: **Phase 4 (build & ship).** Branch `Lampblack_Updates` (current). Read this file END TO END — §2 systems, §3 teaching, §4 feel are all build spec. Build order suggestion: floor gen + three channels → guards/AI → verbs/loot/banking → run structure/fence → teaching triggers + feel layer woven throughout. Headless verify per §2.5 (gen asserts + probe bot as localizer, never judge); The Other Shadow reuses the probe brain as an in-game actor. Ship the feel harnesses, commit+push, then hand the user: (1) the §4.9 screenshot checkpoint list, (2) the soundboard/gallery audit ask, (3) a punch list naming every unverified layer (feel, difficulty, input plumbing — verify DOM event wiring per feedback_verify_input_plumbing).
- SETTLED (don't reopen):
  - **Teaching (§3):** no tutorial-box object exists; six diegetic channels; Magpie's parchment notes (≤12 words, once per profile, queue-1, safe-moment gate, exact texts in §3.2); lesson-lock geometry teaches first, words confirm; **A1J1 = "The Glover House," a fixed authored seed** (NOT a gen-constraint feature) with the 8-beat walk order; universal preview grammar (noise pips + time pips + evidence eye); Fence's Ledger accolades PAY REP with unearned stubs visible; exactly 3 in-moment callouts; hold-Tab Case Notes as fallback reference; anti-degenerate counters get scripted discoveries (§3.3); Morning Edition names the cause of capture.
  - **Feel (§4):** palette hexes locked (§4.1, three temperature families rule); 5-layer render pipeline with cached visibility-polygon lightmap; thief = 5 baked bodies + procedural legs + 3-node verlet scarf + swelling satchel, 8-frame snapped cycles, named cadence constants; per-guard gait/signature/tell table with **audio synced to animation frames**; telegraph windups on every guard state change; shake = max-not-additive, cap 6px, 5 events only; WebAudio door-graph spatial model (same BFS as guards), all recipes + the [D5 F5 E5 A4 D5] leitmotif + 4 always-running music layers at 84bpm; 5-anchor defensive HUD (soot gem top-left prime), min 1024×600; Magpie 96×96 bust ×3 expressions + line-pool counts; Morning Edition run-end newspaper.
  - Setting = **gaslamp-noir Victorian city — USER-CONFIRMED at the Phase 2 seam** ("flavor sounds amazing, keep it"); name Lampblack is load-bearing (lampblack = lamp soot; the thief is soot-black; snuffing lamps is the signature verb).
  - **Seam self-pass additions (user delegated "add more" to me — see red-team §Phase 2-seam):** the **soot gem** player-visibility indicator (§2.1.1), the **capture ladder** (Last Trick → one Crooked Watchman bribe → pinched, §2.3), **Magpie** the named fence (§2.6 — she is Phase 3's teaching voice), and job modifier #11 **The Other Shadow** rival thief (§2.8).
  - The three-channel stealth model as specced in §2.1–§2.3: spatial light with raycast shadows, graduated cone detection with visible awareness fill + last-known-position ghost, sound as door-graph propagation (never a bare radius), scent trails for dogs.
  - Alertness is a one-way ratchet (never decays) with 4 stages; evidence system (doused lamps, bodies, missing famous loot) feeds it. WHAT you steal is a decision, not just how much.
  - Carry/bulk system with two-handed loot and spatial banking at the exit cart (§2.4). Pinched = run over, one Last Trick saves you (§2.6).
  - Run structure: 3 acts × (2 chosen jobs + 1 Big Job) ≈ 9 floors, job-board choice with visible risk/modifiers, fence screen between jobs (sell / draft tools / buy intel) (§2.6).
  - Tool roster with named 3-tier evolutions, 12 Tricks, 3 thief loadouts, 10 guard types incl. Old Copper hunter, 6 building archetypes, 5 districts, 4 Big Jobs, 10 named Scores, 10 job modifiers (§2.5–§2.8).
  - Anti-degenerate counters are part of the core, not tuning: you need light for fine work (dark lantern), wardens relight, lure habituation, body evidence, un-KO-able hunters (§2.3, red-team).
  - Big Jobs are 2-floor buildings; standard jobs 1 floor.
- OPEN (Phase 4 decides):
  - Fire propagation (oil + flame) — stretch system, in/out call at build time, NOT silently cut (see red-team Phase 2). Chandelier winches likewise stretch.
  - Exact tuning numbers everywhere (§2.1–§2.3 detection/noise, §4.3 cadences, §4.5 synth params, accolade REP values) are *defaults with rationale* — structures settled, numbers move.
  - Mid-run save format (serialize at fence screens — required, runs are 25–40 min).
  - Magpie's full line texts (pools + counts committed in §4.7; §3.2 notes are final text).
  - Safecracking dial minigame feel — spec'd generous, flagged for user co-tune; do NOT silently collapse to a hold-bar.
- Known risks (carry forward): detection fairness is a knife-edge I can't feel → every number errs generous + legible; **screenshot checkpoints + soundboard/gallery audits with the user EARLY, not at the end** (§4.9; feedback_user_provides_visuals). Covet-rhyme answered structurally (§2.4) — no "bank remotely" conveniences. Teaching's one untestable claim: does the never-decays ratchet land? — ask the user directly at first playtest.
- Read first (Phase 4): feedback_dont_tune_game_to_the_bot, feedback_bot_is_a_probe_not_a_judge, feedback_verify_input_plumbing, reference_headless_chrome_broken, feedback_user_runs_the_tests, feedback_climax_and_juice_budget, feedback_user_provides_visuals, feedback_auto_commit_push, then THIS FILE end-to-end (§2 systems, §3 teaching, §4 feel are all build spec).

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

# 3 — TEACHING (Phase 3, 2026-07-25)

**The rule: the game contains no tutorial-box object.** Every piece of instruction arrives through one of six diegetic channels (§3.1), and the *primary* teacher is level geometry — words only confirm what the floor already forced you to discover. §2.8's gating table is the skeleton; this section is the flesh.

## 3.0 — Principles (settled)

1. **Magpie is the only voice.** In-run tips are **Magpie's notes**: torn parchment scraps in her handwriting ("she scribbles on the back of every job listing, dearie"). They slide in bottom-left, ≤12 words, her diction, never pause the game. *Why:* she's a fence, not a radio — handwriting is the only period-honest channel, and it makes every tip characterful for free. *Rejected:* thief inner-voice (wastes the Magpie investment, no personality contrast), comm-link (anachronism), signposts (Symbiont lesson).
2. **One mechanic per beat, forced by geometry.** Each new mechanic gets a **lesson lock**: a generator-guaranteed arrangement where the mechanic is the only good move (feedback_teach_core_in_game's "scripted first encounter," implemented as gen constraints, not cutscenes). The note fires *after* the player is in the situation, never before.
3. **Once per profile, one at a time, safe moments only.** Every note has a persisted seen-flag. Queue depth 1; a queued note waits for: player not in any cone, no note shown in last 8s. Exceptions (fire immediately): Old Copper's entrance, LOCKDOWN, grabbed. *Why:* a stealth game's tension is silence; tips must never talk over a knife-edge moment.
4. **Consequence previews use one grammar everywhere:** every hands-verb option shows **noise pips (0–4 🔊) + time pips (0–3 ⏱) + an evidence eye-icon** if it leaves evidence. Taught once (first locked door: force = 4 pips/instant/eye vs pick = 1 pip/slow/none), read forever. Throw verbs preview the landing ring at true propagated radius. Blackjack prompt shows the body icon — you know it's an evidence bomb *before* the swing.
5. **Replays skip nothing and re-teach nothing.** A1J1's lesson locks are just good level design on replay (the seed varies after the first profile-run); the notes simply don't re-fire. No "skip tutorial" toggle needed because there is no tutorial to skip.

## 3.1 — The six channels

| Channel | When | Teaches |
|---|---|---|
| **Lesson locks** (gen-guaranteed geometry) | in the moment | the mechanic itself, by being the only good move |
| **Magpie's notes** (parchment scraps, ≤12 words) | just-in-time, once ever | names what the player just felt |
| **Consequence previews** (pips + eye grammar) | before every commit | costs of the choice, before it's made |
| **Magpie's briefings** (fence counter, pre-job) | between jobs | warns the NEXT job's new roster ("the Vane house keeps dogs — my knees remember") |
| **The Fence's Ledger** (post-job debrief accolades) | between jobs | rewards the deep play by naming it + paying REP (§3.4) |
| **The Morning Edition** (run-end newspaper) | run over | cause of death, named plainly; the season's story (§4.8) |

Fallback reference (allowed, never the teaching): **hold-Tab "Case Notes"** overlay — revealed floor plan, observed patrol dots, and every visible interactable labeled with its verb + pip grammar. Live, unpaused, in-world (a charcoal-sketch look).

## 3.2 — The curriculum (beat by beat)

**A1J1 is a fixed-seed townhouse — "The Glover House" — for a fresh profile.** Small (22×14), 1 watchman + 1 sentry, big shadows, quota = the Glover ledger (1 slot, in a desk). Lesson locks in walk order:

| # | Beat | Mechanic | The lesson lock (how geometry forces it) | Magpie's note |
|---|---|---|---|---|
| 1 | Perimeter | Casing / peek | Job starts on the perimeter strip; front door in a moonlit pool (obviously hostile), a side window overlooks the watchman's loop | "Walk the walls first, love. Windows gossip." |
| 2 | Entry vestibule | **Soot gem** | Entry is through a moonlight quad you MUST cross; gem flares as you step in | "See the gem glow? So do they." |
| 3 | First hall | **Snuffing** | One lamp lights the only corridor; watchman's loop crosses it; shadow route exists ONLY if snuffed | "Pinch the wick. Dark is your coat." |
| 4 | Same hall | **Awareness fill** | Watchman returns while player likely lingers; cone-edge in shadow = slow fill (5–6s window), visibly climbing | "His eyes are filling. Still, or shadow — pick one." |
| 5 | Parlor | **SUSPICIOUS + decay** | Sentry posted so the natural route clips his cone edge; he stirs, looks, settles (a designed safe scare) | "He *felt* you. Statues, dearie." |
| 6 | Study | **Fine work needs light** | The ledger desk sits in ℓ<0.3 unless its lamp stays lit; pick prompt reads "too dark for fine work" | "Can't pick what you can't see. Crack your lantern — briefly." |
| 7 | Any first noise ≥ clear | **Investigate + ghost** | First time a guard walks to a sound/spot, the ghost marker freezes where LOS broke | "That smoke-you is what he believes. Let him chase it." |
| 8 | Exit | **Banking** | Cart glows at the entry point; "Banked." callout with value on stash | "Shine in the bag is hope. Shine in the cart is money." |

**A1J2 (townhouse, +warden, creak floors) — SOUND and EVIDENCE:**

| Beat | Mechanic | Lesson lock | Note |
|---|---|---|---|
| First creak-tile step | Materials + creaks | Creak tiles seeded on the main route; ring renders, sentry glances | "Old boards sing. Creep, or go around." |
| First closed door between you and a noise | Door-graph sound | Ring visibly dies at the closed door | "Doors eat sound. Use them." |
| First locked door | Preview grammar | Force (4 pips, eye) vs pick (1 pip, slow) side by side | — (the grammar IS the note) |
| Warden relights your doused lamp | Evidence + undo | His circuit passes your first snuff within ~60s | "That one tidies up after you. Route around him." |
| First Alertness feed | **The ratchet** | Stamp line ("+5 — forced door found") + wall lamps recolor in a visible wave down the corridor | "The house remembers. It never calms — only hardens." |
| First attended-loot grab | Loot tags | Jewelry box in an occupied bedroom, tagged with a small warm-glow icon | "Warm loot. Someone misses it *tonight*." |

**A1 Big Job (Counting House) — pressure + multi-objective:** pickpocket taught on the first key-holder (slow-fill hold prompt, breaks on his head-turns — his tell telegraphs the rhythm); note: "Light fingers, patient heart." First response guard entering at ALARMED gets a door-slam sound + note: "Company. The house is hiring." Big Job briefing at the counter explains the buy-in economy in Magpie's terms ("jobs this fat need grease going in").

**A2 (pairs, dogs, mirrors, bells):** each new guard/hazard debuts in a job where its counter exists nearby (dogs debut in a manor with fireplaces + a smoke offer on the prior fence screen — the counter is drafted or ambient, never absent). Notes: pairs "Two sets of eyes, one watching backward. No sneaking behind."; first scent lock-on "He has your scent, not your shape. Smoke or hearth breaks it."; mirror "Mirrors carry eyes around corners. Both ways, mind."; bell door "Rigged. Three seconds of quiet hands buys silence."; first 2-hand Score "Hands full means helpless. Know your road home."; dumbwaiter "Send the shine down. Keep your hands free."; 5-slot sprint lock "Heavy bag, slow feet. Greed has a gait."
**A2 Big (Gala):** you *arrive in* servant livery — disguise is the entry state, not an option to find. Note on first sprint-warning flash (HUD edge glows when a blowing action is primed): "Walk like you're paid to be here. Never run."

**A3 (marksmen, electric zones, Old Copper):** marksman "He owns the light. The dark is yours."; electric zone "Can't pinch the future. Route around it."; **Old Copper is introduced audio-first** — his boot + *shk-CLACK* play through the door graph ~20s before he's visible (horror-style; the tell IS the introduction), urgent note: "That shutter-song? Leave. Now. He doesn't bribe." Magpie has already seeded him in the Act 2 debrief: "There's a copper who doesn't blow his whistle. Pray you never hear the shutter."
**A3 Big (Archive):** Heat-scaled garrison stated on the listing in plain words ("your season's noise, armed and waiting").

**Run-layer teaching (fence screens, trigger-based):** first Heat+2 "You've made that borough nervous. Nervous pays better — and bites."; first Score fenced "Famous shine sells thrice. Bring me stories, not spoons."; first Trick draft "Habits make the thief. Pick one."; LOCKDOWN first "They've sealed it. One door left — the long one."; famous-Score pickup "They'll miss that one by morning. Fly."; first Last Trick burn "That trick spends once. There's no third hand."; Crooked Watchman offer is a full scripted screen (his terms in dialogue — the one bribe is a story beat and self-explains); The Other Shadow first sighted "Another shadow works tonight. Mind she doesn't reach your prize first."

## 3.3 — Scripted discovery of the anti-degenerate counters (red-team Phase 2 requirement)

These are the moments a player learns the game pushes back; each is trigger-scripted so it *reads as a rule, not a bug*:
- **Body evidence:** first KO → note "Tuck him somewhere soft. A found man screams loudest." If the body IS found (+20 stamp + stage wave), Magpie's debrief needles: "Left him snoring in the hall, did we? The whole watch heard the encore." The pair (note → consequence → debrief) closes the loop even if the player ignores step 1.
- **Lure habituation:** second same-class lure within 60s → the +10 stamp fires WITH the note "Same trick twice? He's not a cat." — the punishment and the explanation are simultaneous, so it never feels random.
- **Douse-everything:** taught positively by beat 6 (fine work needs light) and negatively by the warden beat; no extra note needed — geometry covers it.
- **Camp-in-a-wardrobe:** the rounds-clock stamp (+4) is visible from the first 90s; if the player hides >20s at ALARMED+, one note: "The night doesn't wait with you, dearie."

## 3.4 — The Fence's Ledger (reward callouts that PAY)

Post-job debrief lists earned **accolades in Magpie's voice**, each worth REP (deep play is rewarded, not just labeled — feedback_teach_core_in_game):
**Ghost** (no guard past SUSPICIOUS) +2 · **No Trace** (zero evidence feeds) +2 · **Clean Hands** (no KOs) +1 · **Full Bag** (banked 6+ slots) +1 · **The Long Walk** (banked anything at LOCKDOWN) +1 · **In & Out** (quota banked under 5 min) +1 · **Second-Story Ghost** (never used a door) +1. Un-earned accolades show as silhouetted stubs with their names visible — the ledger doubles as a "here's what mastery looks like" menu (depth taught by visible absence).
**In-moment soot-script callouts (exactly 3, small, fading):** "Lost him." (a search resolves without finding you) · "Banked. +£N" (at the cart) · "Marked." (a Score enters the bag). *Rejected:* combo counters, popup spam — tension is the product; the ledger does the celebrating.

## 3.5 — Completeness audit (every §2 system → its teacher)

Light field/snuff/soot gem/fine-work → A1J1 beats 2–6. Cones/fill/ghost/SUSPICIOUS → beats 4–7. Sound graph/materials/previews → A1J2. Evidence ratchet/loot tags/warden → A1J2. Casing/peek → beat 1 + Case Notes. Banking/cart → beat 8; dumbwaiter/bulk/2-hand/sprint-lock → A2 notes. Hide spots → sentry-search moment (first INVESTIGATE searches a wardrobe on-screen — seeing him check teaches "hiding is a bet"). Pickpocket/response guards/buy-in → A1 Big. Pairs/dogs/mirrors/bells → A2. Disguise → A2 Big entry state. Marksman/electric/Old Copper → A3 audio-first. Heat/fence economy/Tricks/evolutions/intel → fence-screen triggers + Magpie stock lines. Capture ladder → Last Trick note + scripted Watchman screen + Morning Edition naming the cause. Job modifiers → listing headlines in plain words. The Other Shadow → sighting note + Magpie hints. **Gap found in audit and fixed:** hide-spot search needed an on-screen demonstration (added above); everything else had a row.

# 4 — FEEL (Phase 3, 2026-07-25)

The identity (§2.9) made flesh: exact palette, sprite construction, animation frames, synthesis recipes, layout. Phase 4 implements these WITH the systems, not after.

## 4.1 — Palette (locked; Phase 4 uses these names as constants)

| Name | Hex | Use |
|---|---|---|
| NIGHT | #070a14 | outdoor void, deepest dark |
| FLOOR_UNLIT | #10131f | interior floor base in darkness |
| WALL | #1c2233 | walls (multiply toward NIGHT unlit) |
| WOOD / CARPET / MARBLE | #35281a / #3a2430 / #3d4358 | material tints, revealed by light |
| LAMP_CORE → edge | #ffdca8 → rgba(255,180,90,0) | gas lamp radial gradient |
| CANDLE / FIRE / MOON | #ffc878 / #ff9d5c / #9db8d8 @ α.25 | other sources (moon is COLD — the one cold light) |
| ALERT ramp | #ffb85c → #ffe0b0 → #fff4e4 → #ff8a70 | CALM→WARY→ALARMED→LOCKDOWN lamp recolor |
| THIEF_CLOAK / SCARF | #171a24 / #8a3138 | player; the dull-crimson scarf is the ONE saturated accent on screen |
| GUARD_COAT / BRASS | #2b3a58 / #c9a45c | guard base + buttons/keys/plume |
| CONE base → alarmed | rgba(255,205,120,.13) → rgba(255,90,60,.22) | view cones, suspicion lerp |
| RING_PLAYER / GUARD / LURE | #e8ecf4 / #ffb85c / #7ab8ff | sound rings (player also solid-line, guard dashed — redundant with color) |
| PARCHMENT / INK / SOOT_TEXT | #e6d5ae / #26201a / #c8ccd8 | Magpie notes, job board / UI text |

Readability rule: the screen is allowed exactly three temperature families — warm lamplight, cold moon/night blues, and the crimson scarf. Anything else must justify itself.

## 4.2 — Render pipeline (Canvas 2D, 5 layers)

1. **Base:** floor/furniture pre-rendered per floor to an offscreen canvas at material colors × 0.35 (the "unlit" scene).
2. **Lightmap:** half-res offscreen. Per source: radial gradient in its color, drawn clipped to its **visibility polygon** (raycast source→wall-segment endpoints; cached per static source, invalidated on door toggle; guard lanterns recompute per frame against segments within radius only). Composite 'lighter' onto the base. Lamp breathing: radius ±4% sine ~0.5Hz with per-lamp phase; fireplaces add 1/f flicker jitter.
3. **Entities:** sprites brightness-lerped by ℓ at their tile (gameplay ℓ lives on the tile grid, recomputed on light-change *events* — one truth, the render prettifies it).
4. **FX:** cones (polygon fill, suspicion-tinted), rings (expanding stroked circles that clip at closed doors), ghost marker (smoky player silhouette, α 0.5, slow dissolve), particles, soot footprints.
5. **HUD** (§4.6).
Snuff fx: pool irises shut over 220ms (ease-in) + 6 soot-mote particles (2px, rise with sine drift, 900ms fade) + the *fwip* (§4.5). This is the signature verb — it must feel like pinching silk.

## 4.3 — The thief (construction per feedback_walk_cycle_and_facing_recipe)

32px logical tile; thief ≈ 20×28px. **Baked body + procedural legs:** 5 hand-authored bodies (front / back / side / front-¾ / back-¾, left = mirrored), hooded, 3-tone shading (base #171a24, shadow #0d0f16, highlight #262b3a), NO outline-plus-dot-eyes — the face is a dark void under the hood with two faint glints only in light (ℓ>0.5). **Scarf-tail: 3-node verlet chain** (gravity 0, damped follow, streams in sprint, settles on stop) — the "alive" flourish. **The satchel visibly swells with bag slots** — carry state is readable art (0 slots = flat strap, 6 = bulging + strap strain).
**Cycles:** 8-frame contact/down/passing/up walk, discrete snapping `floor(phase/(π/4))%8`, body offset down +0.7px / up −0.9px, speed-scaled cadence (named constants, expect live tuning: `WALK_CAD=0.05, CREEP_CAD=0.03, SPRINT_CAD=0.085`), walkAmt 0→1 ease to rest pose, velocity-octant 8-way sticky facing, splay legs front/back, scissor on side/diagonals.
**Pose list:** idle (2-frame breath, 1.2s) · creep (body −2px crouch, longer scissor) · sprint (2px lean, scarf streaming) · pick/safecrack (kneel + 2-frame elbow jitter synced to audio ticks) · snuff (3-frame reach-pinch-withdraw, 400ms) · throw (arc arm) · blackjack (250ms windup + 100ms swing + follow-through) · 2-hand carry (baked alt body, arms up, load sway) · drag (lean-back 2-frame) · hide (eyes-glint pair in wardrobe crack) · grabbed (2-frame struggle shake) · Last Trick (soot-burst smear + 8 particles).

## 4.4 — Guards: silhouette + gait + synced tell (audio fires ON animation frames — one clock)

| Guard | Gait/cadence | Signature animation | Tell sync |
|---|---|---|---|
| Watchman | slow stroll ×0.8 | lantern-arm swing; his light pool sways WITH it | whistle phrase starts on left-foot contacts |
| Sentry | seated | chest-rise snore bob; wake = snore stutter → 1.2s stretch → eyes (readable mercy window) | snore loop synced to bob |
| Warden | hunched ×0.9 | relight = reach up, flame blooms in 300ms | key jangle on each contact frame |
| Constable pair | matched ×1.0 | rear man walks backward, periodic shoulder-check turn | in-step footfalls + murmur between phrases |
| Hound + handler | 4-frame lope | nose-down sniff pose on scent; handler leash-jerked | pant at 4Hz; snuffle on sniff pose; bark on lock-on |
| Sergeant | stride ×1.3 | arm-extend point when ordering searches | barked orders on the point frame |
| Marksman | perched | rifle rotation lerps to track; muzzle glint when acquiring | rifle-cock click at acquire start |
| Dockside tough | rolling wander ×0.9 | spit (idle fx) | off-key hum, breaks randomly |
| Guests/servants | skirt-sway / tray 2-frame | startle = jump-back + hands up | chatter murmur; gasp→scream on startle |
| **Old Copper** | asymmetric limp (long-short step timing) ×0.7 | 1.5× silhouette mass, coat to floor; **shutter anim = his cone snaps in/out WITH the *shk-CLACK*** | heavy/light boot alternation; shutter clack on cone toggle |

**Telegraph rules (fairness is animation):** every guard state change gets a windup the player can act during — SUSPICIOUS: halt + 300ms head-turn (lantern raised) before the cone swings; INVESTIGATE: 400ms lean-and-point, then walk; DETECTED: 400ms shout pose + whistle BEFORE chase speed engages. KO: 90ms hit-stop + 3-frame crumple fold.
**Shake budget (feedback_climax_and_juice_budget):** `shake = max(shake, event)` — never additive — decay ×0.85/frame, hard cap 6px. Events: detected whistle 2 · door force 3 · guard slips on oil 3 · grabbed 5 · Last Trick 6. Nothing else shakes. Stealth's baseline is stillness; shake is punctuation.

## 4.5 — WebAudio (all procedural, no assets; init on first gesture; no-AudioContext guard)

**Graph:** master gain → DynamicsCompressor → destination. Buses: `music, ambience, foley, tells, ui`. **Spatial model = the door graph:** world sounds get pan `clamp(dx/14,-1,1)`, gain from received-loudness, and a lowpass whose cutoff lerps 600→8000Hz by door attenuation — **computed by the SAME BFS the guards use** (one truth, two consumers, §2.1.3). Guard tell loops re-evaluate at 4Hz, smoothed with setTargetAtTime.

**Foley recipes** (osc/noise → filter → env; all durations ms):
- **Footsteps by material:** carpet = noise bp200Hz, 60ms, soft · wood = bp400Hz 80ms + random creak (saw pitch-bend 300→180Hz, 120ms) · marble = bp900Hz click 50ms + slap-back delay 90ms · glass = 2kHz crunch grains, random pitch. Player's own steps audible at their true L — creak dread is a feature.
- **Snuff *fwip*:** hp1.2kHz noise 80ms + sine drop 800→200Hz. **Relight:** soft *foomp* — lp noise swell 150ms + candle sine flutter.
- **Lockpick:** 900Hz tick pattern (the hold-fill's audible progress); success = bright 2.4kHz ping. **Safe dial:** ticks per notch; **felt-click stop = duller 350Hz thunk** — the audio IS the minigame interface. **Drill:** saw 120Hz + noise, sustained.
- **Blackjack:** lp thump 90Hz 100ms + cloth noise. **Body drag:** looped slow noise scrapes on step frames.
- **Whistle-blast (DETECTED):** square 2.4kHz + noise, 300ms rising. **Scream:** swept square 800→1200Hz with 8Hz vibrato + gasp noise attack.
- **Tells:** watchman whistle = triangle osc + vibrato LFO playing **the leitmotif — D-minor, lazy swing: [D5 F5 E5 A4 D5]** (THE game theme — reprised in the menu pad and the Morning Edition sting; per-watchman phase offset) · snore = lp-noise with sawtooth-shaped gain LFO 0.25Hz (inhale/exhale), dropout-stutter before waking · keys = 4–6 FM pings (carrier 2–4kHz random, ratio 3.7) per contact frame · dog pant = bp800Hz bursts at 4Hz; bark = saw 300Hz pitch-drop + noise · Old Copper = alternating sine-thud 60Hz heavy/light + **shk-CLACK** (noise tick 15ms + square 1.8kHz 30ms metallic click).
- **UI:** coin = FM bell 5kHz short · paper rustle (Magpie note) = lp-noise sweep 200ms · jackdaw chirp = FM 2.8kHz 40ms (Magpie's text blip, every 3rd char at 40 chars/s).

**Music — 4 alertness layers, one 84bpm scheduler (0.1s lookahead), all layers always running, gains crossfade 3s on stage change (never restart — phase-aligned):**
- **CALM:** vinyl crackle (sparse bp3kHz pops) + harbor bell (FM, D3, random 25–45s) + room-tone pad (2 detuned triangles D2+A2, −30dB).
- **WARY:** + brushed-hat swing 8ths (hp4kHz noise bursts, −24dB) + sparse pizzicato bass (sine pluck, D–F–A–C line).
- **ALARMED:** + tremolo strings (3-saw Dm chord, 7Hz gain LFO, lp1.2kHz, −20dB).
- **LOCKDOWN:** + timpani heartbeat (sine 55Hz lub-dub) + thin A5 pedal whine (−30dB).
- Stage-up stinger: one muted-brass stab (saw + lowpass sweep). While any guard chases: tremolo bus +6dB.

## 4.6 — HUD & layout (defensive — I fly blind, so nothing may depend on eyeballing)

Full-window canvas (no letterbox), devicePixelRatio-aware, camera centered on player. **HUD lives in 5 fixed anchors, inset 16px, font `clamp(12px, 1.4vw, 18px)`, each anchor max-width 40vw — overlap between anchors is impossible by construction.** Min supported 1024×600.
- **Top-left: the soot gem** — 48px lantern-lens glyph, glow = ℓ at player (the genre's most-consulted instrument gets the prime slot) — with the 6-slot bag strip beneath (28px slots; bulk items span; slots visually strain at 5+).
- **Top-right:** alertness wall-lamp glyph (stage color + pips) + evidence ticker (last 3 stamps, fade 5s).
- **Top-center:** quota line, small ("Deeds 0/1 · fee £120").
- **Bottom-center:** contextual verb strip / radial on hold-E, with the pip+eye preview grammar.
- **Bottom-left:** Magpie note parchment (slide-in, max-width 320px).
- **Hold-Tab:** Case Notes overlay (charcoal-sketch floor plan, patrol dots, labels). No minimap otherwise — casing IS the map fantasy.
Phase 4 screenshot matrix: 1024×600, 1366×768, 1920×1080 (§4.9).

## 4.7 — Magpie (portrait + lines)

**Portrait: 96×96 pixel bust, 3 expressions** (appraising/default, delighted/big haul, needling/sloppy job): sharp-eyed older woman, silver bun, magpie-feather shawl, cameo brooch (stolen, obviously), jackdaw on her shoulder (it reacts too — puffs up at Scores), cluttered counter foreground. Text types at 40 chars/s with jackdaw-chirp blips.
**Line pools (counts committed; texts written in Phase 4 from these + §3.2's notes):** greetings ×8 keyed to {clean/sloppy/first-time/post-capture-history} · Score appraisals ×10 (one per named Score — "the Vane Emerald! Sit DOWN, dearie") · listing warnings ×12 keyed to modifiers/rosters · teaching briefings = §3.2's pool re-voiced for the counter · The Other Shadow hints ×6 ("she had another client, that one") · needle lines ×8 keyed to evidence stats ("half the district's lit up like Christmas").

## 4.8 — The Morning Edition (run-end newspaper)

Every run ends on a front page of **THE MORNING SENTINEL**: procedural headline from outcome — pinched: "PHANTOM TAKEN AT THE VANE HOUSE — hound followed a soot trail" (**the cause of capture named plainly — the roguelite death-lesson**) · disgrace: "SEASON OF SILENCE — the shadow retires poor" · victory: "ARCHIVE ROBBED — WATCH BAFFLED, MAGISTRATE FURIOUS". Sub-columns render run stats as news briefs (Scores taken with engravings, peak alertness per district, Heat map as "boroughs on edge"). Leitmotif sting, minor for loss / resolved-major for the win. Parchment + ink palette; cheap (text layout + the district map) and it closes every run with the fantasy: you are the city's ghost story, and this is the city telling it.

## 4.9 — Screenshot checkpoints (Phase 4 must request these EARLY — feedback_user_provides_visuals)

1. A lit parlor: lamp pool + shadow teeth + thief idle (art baseline — judge palette & light quality).
2. The same lamp mid-snuff (iris + smoke motes).
3. A guard at INVESTIGATE: cone tint + fill glyph + ghost marker visible.
4. Full HUD at 1366×768 AND 1024×600 (anchor overlap check).
5. Thief walk vs creep vs sprint (three shots or a short capture — leg readability).
6. Magpie's counter screen.
7. The Morning Edition.
Plus the two **feel-review harnesses Phase 4 must ship** (they make the blind layer auditable in minutes): a **soundboard debug page** (every recipe on a key) and an **animation gallery scene** (every character cycling its poses). The user auditions, reports by name, I fix precisely.

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

### Phase 3 (self-attack, 2026-07-25)
- **Completeness audit ran (§3.5): every §2 system now has a named teacher.** One real gap surfaced and fixed mid-audit — hide spots had a note but no *demonstration*; added the scripted on-screen wardrobe search at first INVESTIGATE so the player SEES that hiding is a bet, not a shield. Lesson repeated from the seam: audit "is it taught?" per-system, not per-section.
- **Is the ratchet — the identity — actually taught?** It's counter-genre-default (every other stealth game's alarm decays), so it gets triple coverage: the stamp+lamp-recolor wave (felt), note "It never calms — only hardens" (named), and Magpie's debrief needling (reflected). If a playtester still waits for the alarm to cool, the teaching failed — flag as a user-test question, not a settled success.
- **Note-volume check:** ~30 once-ever notes across 9 floors ≈ 3/floor average; densest is A1J1 (8, but strung along a linear walk order so the queue never stacks). The cap-1 + safe-moment gate is the spam-proof. Risk accepted: a player who rushes A1J1 may out-run beats 4–5; the fallback channels (previews, ledger stubs, briefings) re-teach later, so nothing is single-point.
- **Am I speccing art I can't verify?** Yes, deliberately — but every craft claim in §4 is either (a) construction-rule-shaped (silhouette-first, 3-tone, baked+procedural — followable blind), (b) numeric (palette hexes, frame counts, cadence constants — checkable in code), or (c) covered by the §4.9 checkpoint list + the two feel-review harnesses. The harnesses are the real answer: soundboard + gallery convert "user vibes on the whole game" into "user reports on named assets." Don't let Phase 4 skip them to save time — they ARE the verification plan for the feel layer.
- **What I almost cut (naming per feedback_build_the_novel_feature):** the Morning Edition newspaper (flinched — "scope"; kept: it's text layout + existing stats, and it's the run's story-closer and death-lesson in one); scarf verlet physics (kept — the single "alive" flourish, 3 nodes is trivial); Magpie's jackdaw reacting to Scores (kept, one conditional sprite swap). Honestly cut: full VO (no assets, no TTS in scope), minimap (anti-fantasy — casing is the map), per-guard barks-as-speech-text (tell audio + animation carries it; text barks would clutter the soot-quiet look).
- **Leitmotif risk:** the whistle motif [D5 F5 E5 A4 D5] is now load-bearing (watchman tell, menu, Morning Edition). I can't hear it. It's 5 notes in D minor with swing — structurally safe — but it's first on the soundboard audit list for a reason.
- **Fresh-me check:** could a fresh chat build A1J1's teaching from §3.2 alone? The lesson-lock table gives geometry constraints + trigger conditions + exact note text. The one soft spot: "generator guarantees the lesson lock" needs Phase 4 to implement A1J1 as a fixed authored seed, not constraint-solving — stated in §3.2's header, restated in HANDOFF so it isn't misread as a gen feature.

### Phase 4 (build log, 2026-07-26)
- **Stretch calls made in the open, not silently:** fire propagation (oil+flame chains) — **OUT for v1** (oil slicks ship as slip hazards + scent-breakers + lamp sabotage; ignition chains are the one system whose chaos I can't tune blind on top of an untested detection knife-edge; it's the named first candidate for the post-playtest pass). Chandelier winches — OUT, same reasoning, lower value. Everything else in §2 is IN.
- **Safecracking = release-timing dial, not a hold-bar** (per the standing flag): the dial sweeps, felt-stops pulse the ring + duller 350Hz thunk, release in the zone to lock each of 3 notches; Locksmith's Ear shows the first stop; Cracksman gets a wider zone. Co-tune params: sweep 0.35/s, zone 0.06.
- **Mid-run save:** whole-run JSON to localStorage at fence screens only (floor state intentionally not serialized — a heist in progress is not a save point; matches "runs are 25–40 min" need without save-scumming the ratchet).
- **Awareness math verified, one discovery:** K=840 reproduces the design targets (sprint-adjacent-lamplit ≈ instant; creep-at-dark-cone-edge ≈ 5s) — but a watchman's own lantern lights the player at cone edge, collapsing that window to ~1s. Kept: it's the Thief-canon reason you douse before you shadow a lantern carrier; flagged as a fairness item for the user playtest.
- **Gen defects the harness localized (and fixes):** flat layouts could put the vault 1 door deep when windows counted as entries → objective depth now measured over exit doors only + deterministic reroll + objective-room windows stripped (also closes the window-in-window-out degenerate). Warehouse crates could seal loot unreachable → flood-fill relocation pass.
- **Probe bot honesty:** bot verifies termination/reachability only (localizer). It does not play stealth well and was never used to judge difficulty. The Other Shadow runs the same brain live — verified she loots and escapes.
- **Known thin ice for the playtest:** detection fairness (the knife-edge — every number errs generous but is unfelt), sound loudness scale (L-in-tiles reads quiet: a smash two rooms away often dies — per spec, but may feel dead), rounds-clock pacing, guard density per act, WebAudio mix levels (all recipes untested by ear), full-run length.

## Open questions
- ~~Phase 1: user pick~~ ANSWERED: **Lampblack**, no splice, directive "watch art + sounds" (standing, in HANDOFF).
- ~~Phase 2 seam questions to user~~ ANSWERED 2026-07-25: **gaslamp-Victorian confirmed** ("flavor sounds amazing, keep it"); roster additions + harshness **delegated to me** ("you are the chef… be critical about it to yourself") → seam self-pass ran, four changes landed (soot gem, capture ladder, Magpie, The Other Shadow — see red-team §Phase 2-seam). Note for future seams: the poke can come back to me; a delegated seam = run a SECOND red-team, produce concrete changes, don't just reassure.
- ~~Phase 3: teaching curriculum + feel spec~~ ANSWERED 2026-07-25: §3 (six channels, Glover House 8-beat opening, full note text pool, accolades, discovery scripts, completeness audit) + §4 (palette, pipeline, thief/guard art + animation, WebAudio recipes + music layers, HUD anchors, Magpie portrait/lines, Morning Edition, screenshot checkpoints + feel-review harnesses).
- ~~Phase 4 build calls~~ ANSWERED 2026-07-26 (see red-team §Phase 4): fire OUT-for-v1 in writing; dial minigame built generous; saves at fence; Shadow shares the probe brain; Magpie line pools written in content.js.
- **For the user playtest (open):** does the never-decays ratchet land? detection fairness feel; sound-scale feel; all §4.9 screenshot checkpoints + soundboard/gallery audit reports by name.
