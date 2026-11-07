'use strict';
// LAMPBLACK — content tables (DESIGN §2.7–§2.8, §3.2, §4.7). Countable, gated.
var LB = (typeof LB !== 'undefined') ? LB : (typeof module !== 'undefined' ? require('./core.js') : {});

// ---------- Guards (10) — behavior hooks live in guards.js keyed by `type` ----------
LB.GUARDS = {
  watchman:  { name: 'Watchman', lantern: true, hearMul: 1, speedMul: 0.8, firstAt: 'A1J1',
    tell: 'whistle', silhouette: 'long coat, tall hat, lantern arm' },
  sentry:    { name: 'Sentry', posted: true, dozes: true, hearMul: 0.6, speedMul: 1, firstAt: 'A1J1',
    tell: 'snore', silhouette: 'slumped chair, chin on chest' },
  warden:    { name: 'Warden', relights: true, hearMul: 1, speedMul: 0.9, firstAt: 'A1J2',
    tell: 'keys', silhouette: 'hunched, huge key ring' },
  pair:      { name: 'Constable Pair', paired: true, hearMul: 1, speedMul: 1, firstAt: 'A2',
    tell: 'instep', silhouette: 'matched bobbies, capes' },
  hound:     { name: 'Hound + Handler', dog: true, hearMul: 2, speedMul: 1.1, firstAt: 'A2',
    tell: 'pant', silhouette: 'quadruped lope + leash-man' },
  sergeant:  { name: 'Sergeant', response: true, searches: true, noBribe: true, hearMul: 1, speedMul: 1.3, firstAt: 'A2',
    tell: 'orders', silhouette: 'plumed helmet, sabre' },
  marksman:  { name: 'Marksman', posted: true, litOnly: true, coneMul: 2, hearMul: 0.8, speedMul: 0, firstAt: 'A3',
    tell: 'riflecock', silhouette: 'long rifle, perched' },
  tough:     { name: 'Dockside Tough', erratic: true, hearMul: 1, speedMul: 0.9, firstAt: 'Docks',
    tell: 'humming', silhouette: 'broad, cap, cosh' },
  civilian:  { name: 'Guest', civilian: true, hearMul: 0.5, speedMul: 0.7, firstAt: 'Manor',
    tell: 'chatter', silhouette: 'gowns/livery, candlesticks' },
  oldcopper: { name: 'OLD COPPER', hunter: true, noKO: true, noBribe: true, hearMul: 1.5, speedMul: 0.7,
    firstAt: 'A2Big', tell: 'shutter', silhouette: 'massive greatcoat, bullseye lantern, limp' }
};

// ---------- Tools (8 × 3 named tiers; T3 changes tactics) ----------
LB.TOOLS = {
  snuffer:   { name: 'Snuffer', tiers: ['Snuffer', 'Blowpipe', 'Gloom Oil'],
    desc: ['Pinch adjacent lamps', 'Snuff at 4 tiles, silent', 'Doused lamps CANNOT be relit'] },
  coins:     { name: 'Coins', tiers: ['Coins', 'Chime Coin', 'Songbird Box'],
    desc: ['Toss a lure (L3)', 'Lingers, repeats twice', 'Walks 6 tiles chirping — a moving lure'] },
  smoke:     { name: 'Smoke Bomb', tiers: ['Smoke Bomb', 'Soot Bomb', 'Blinding Ash'],
    desc: ['Cloud blocks sight 6s', 'Also douses lamps in radius', 'Blinds guards 4s + refunds a Last Trick once/job'] },
  lockpicks: { name: 'Lockpicks', tiers: ['Lockpicks', 'Skeleton Set', 'Ghost Key'],
    desc: ['Standard locks', 'Quality locks, faster', 'Opens ANYTHING traceless — no evidence'] },
  blackjack: { name: 'Blackjack', tiers: ['Blackjack', 'Sandman', 'Chloroform Rag'],
    desc: ['KO from behind', 'KO twice as fast, quiet (L1)', 'Silent, no scuffle, works mid-walk'] },
  glasscutter: { name: 'Glass Cutter', tiers: ['Glass Cutter', 'Circle Cut', 'Mirror Kit'],
    desc: ['Silent window entry', 'Reach through for loot/latch', 'Place or steal mirrors — redirect cones yourself'] },
  oilflask:  { name: 'Oil Flask', tiers: ['Oil Flask', 'Scent Oil', 'Lamp Sabotage'],
    desc: ['Slick tile: guards slip (L6)', 'Breaks dog scent trails', 'Rig a lamp to flare-and-die on a timer'] },
  grapple:   { name: 'Rope & Grapple', tiers: ['Rope & Grapple', 'Ceiling Hook', 'The Long Line'],
    desc: ['Rappel bag to cart from any window', 'Hang above a room 5s', 'Zip between windows across the facade'] }
};
LB.TOOL_KEYS = Object.keys(LB.TOOLS);

// ---------- Tricks of the Trade (12, draft 1-of-3) ----------
LB.TRICKS = {
  softstep:   { name: 'Soft Step', desc: 'All floors count as carpet' },
  nighteyes:  { name: 'Night Eyes', desc: 'You see further in the dark' },
  peripheral: { name: 'Peripheral', desc: 'Cones visible through walls, 6 tiles' },
  secondstory:{ name: 'Second-Story', desc: 'Window entry/exit twice as fast' },
  greedy:     { name: 'Greedy Fingers', desc: 'Loot and pick 25% faster' },
  packmule:   { name: 'Pack Mule', desc: '7th bag slot; sprint never locks' },
  cardcounter:{ name: 'Card Counter', desc: 'Job board shows one hidden modifier' },
  silvertongue:{ name: 'Silver Tongue', desc: 'Fence prices +20%' },
  catburglar: { name: 'Cat Burglar', desc: 'Cats adore you; sometimes lure guards' },
  ironnerve:  { name: 'Iron Nerve', desc: 'Grabbed timer 1.5s — a wriggle window' },
  sootcloak:  { name: 'Soot Cloak', desc: 'Still + shadow = invisible, even adjacent' },
  locksear:   { name: "Locksmith's Ear", desc: 'Safes show one free dial-stop' }
};

// ---------- Thief loadouts (3) ----------
LB.LOADOUTS = {
  wisp:      { name: 'The Wisp', desc: 'Creep 20% faster. 5-slot bag. Starts: snuffer, coins.',
    creepMul: 1.2, bag: 5, sprintMul: 1, noiseMul: 1, lastTricks: 1, tools: ['snuffer', 'coins'], unlockRep: 0 },
  cracksman: { name: 'The Cracksman', desc: 'Safes/locks 40% faster, silent picks. 6-slot bag, 10% slower sprint. Starts: lockpicks, glass cutter.',
    creepMul: 1, bag: 6, sprintMul: 0.9, noiseMul: 1, lastTricks: 1, pickMul: 1.4, silentPicks: true,
    tools: ['lockpicks', 'glasscutter'], unlockRep: 10 },
  bruiser:   { name: 'The Bruiser', desc: 'Frontal blackjack (L5 scuffle). 2 Last Tricks, 7-slot bag, +25% movement noise. Starts: blackjack, smoke.',
    creepMul: 1, bag: 7, sprintMul: 1, noiseMul: 1.25, lastTricks: 2, frontalKO: true,
    tools: ['blackjack', 'smoke'], unlockRep: 25 }
};

// ---------- Building archetypes (6) ----------
LB.ARCHETYPES = {
  townhouse: { name: 'Townhouse', w: 26, h: 18, material: 'wood', creaky: true, civilians: 1,
    rooms: ['hall', 'parlor', 'study', 'bedroom', 'kitchen', 'pantry', 'landing'],
    guards: { A1: ['watchman', 'sentry'], A2: ['watchman', 'sentry', 'warden'], A3: ['watchman', 'warden', 'pair'] } },
  manor:     { name: 'Manor', w: 30, h: 20, material: 'carpet', dogs: true, civilians: 3,
    rooms: ['hall', 'ballroom', 'study', 'bedroom', 'gallery', 'kitchen', 'servants', 'conservatory'],
    guards: { A1: ['watchman', 'sentry', 'warden'], A2: ['watchman', 'warden', 'hound'], A3: ['watchman', 'warden', 'hound', 'pair'] } },
  bank:      { name: 'Counting House', w: 26, h: 18, material: 'marble', qualityLocks: true,
    rooms: ['lobby', 'office', 'clerks', 'vaultroom', 'records', 'strongroom'],
    guards: { A1: ['watchman', 'sentry'], A2: ['watchman', 'pair', 'sentry'], A3: ['pair', 'warden', 'marksman'] } },
  museum:    { name: 'Museum', w: 30, h: 20, material: 'marble', skylights: true, pedestals: true,
    rooms: ['atrium', 'gallery', 'gallery', 'exhibits', 'archive', 'office'],
    guards: { A1: ['watchman', 'sentry'], A2: ['watchman', 'warden', 'sentry'], A3: ['watchman', 'marksman', 'pair'] } },
  warehouse: { name: 'Warehouse', w: 28, h: 20, material: 'wood', crates: true, noCivilians: true,
    rooms: ['floor', 'floor', 'office', 'loading', 'lockup'],
    guards: { A1: ['tough', 'tough'], A2: ['tough', 'tough', 'watchman'], A3: ['tough', 'tough', 'hound'] } },
  gala:      { name: 'Gala Manor', w: 34, h: 24, material: 'marble', bigOnly: true, crowd: true, disguise: true,
    rooms: ['ballroom', 'hall', 'study', 'gallery', 'kitchen', 'servants', 'terrace', 'cloakroom'],
    guards: { A2: ['watchman', 'watchman', 'warden', 'pair', 'civilian', 'civilian', 'civilian', 'civilian'] } }
};

// ---------- Districts (5) ----------
LB.DISTRICTS = [
  { id: 'gaslight', name: 'Gaslight Row', flavor: 'townhouses under humming lamps', types: ['townhouse', 'townhouse', 'bank'] },
  { id: 'vane', name: 'Vane Hill', flavor: 'old money behind tall hedges', types: ['manor', 'manor', 'townhouse'] },
  { id: 'exchange', name: 'The Exchange', flavor: 'marble, ledgers, and locks', types: ['bank', 'bank', 'museum'] },
  { id: 'founders', name: 'Founders Court', flavor: 'galleries and glass roofs', types: ['museum', 'museum', 'manor'] },
  { id: 'docks', name: 'Blacksail Docks', flavor: 'crates, fog, no uniforms', types: ['warehouse', 'warehouse', 'warehouse'] }
];

// ---------- Named Scores (10) ----------
LB.SCORES = [
  { id: 'vane_emerald', name: 'the Vane Emerald', arch: 'gala', bulk: 1, value: 900, act2Finale: true },
  { id: 'regatta_cup', name: 'the Regatta Cup', arch: 'warehouse', bulk: 2, value: 420 },
  { id: 'duke_portrait', name: 'Portrait of the Withered Duke', arch: 'manor', bulk: 2, value: 520, twoHand: true },
  { id: 'chronometer', name: 'the Meridian Chronometer', arch: 'bank', bulk: 1, value: 480 },
  { id: 'whale_crown', name: 'the Whale-Oil Crown', arch: 'museum', bulk: 1, value: 560 },
  { id: 'orrery', name: 'the Ivory Orrery', arch: 'museum', bulk: 3, value: 640, twoHand: true },
  { id: 'letters', name: 'Letters of the Blackmailed Bishop', arch: 'townhouse', bulk: 0, value: 700 },
  { id: 'candelabra', name: 'the Serpent Candelabra', arch: 'manor', bulk: 2, value: 460, twoHand: true, lit: true },
  { id: 'ledger', name: 'the Docklands Ledger', arch: 'warehouse', bulk: 1, value: 380, heatRelief: true },
  { id: 'casefile', name: 'your own Case File', arch: 'archive', bulk: 0, value: 0, finaleOnly: true }
];

// ---------- Job modifiers (11) ----------
LB.MODIFIERS = {
  rain:       { name: 'Rain', desc: 'All noise softened — theirs and yours', noiseMul: 0.6 },
  fog:        { name: 'Fog', desc: 'All cones 2 tiles shorter', coneDelta: -2 },
  overcast:   { name: 'Overcast', desc: 'No moonlight tonight', noMoon: true },
  electric:   { name: 'New Electric Lights', desc: 'Two zones cannot be snuffed', electricZones: 2 },
  ball:       { name: 'Society Ball', desc: 'Civilian crowds tonight', crowds: true },
  doubleshift:{ name: 'Double Shift', desc: '+40% guards, +60% fee', guardMul: 1.4, feeMul: 1.6 },
  insideman:  { name: 'Inside Man', desc: 'Start with the full floor plan', fullPlan: true },
  renovation: { name: 'Renovation', desc: 'Scaffolds add windows; cloths add shadows', extraWindows: 2 },
  drill:      { name: 'Lockdown Drill', desc: 'Starts at WARY; fee ×1.5', startAlert: 25, feeMul: 1.5 },
  collector:  { name: 'The Collector Is Home', desc: 'He carries the prize on him — tail and lift it', collector: true },
  othershadow:{ name: 'The Other Shadow', desc: 'A rival works the floor tonight', rival: true }
};

// ---------- Fence Ledger accolades (§3.4) ----------
LB.ACCOLADES = [
  { id: 'ghost', name: 'Ghost', desc: 'No guard past SUSPICIOUS', rep: 2 },
  { id: 'notrace', name: 'No Trace', desc: 'Zero evidence feeds', rep: 2 },
  { id: 'cleanhands', name: 'Clean Hands', desc: 'No KOs', rep: 1 },
  { id: 'fullbag', name: 'Full Bag', desc: 'Banked 6+ slots', rep: 1 },
  { id: 'longwalk', name: 'The Long Walk', desc: 'Banked anything at LOCKDOWN', rep: 1 },
  { id: 'inandout', name: 'In & Out', desc: 'Quota banked under 5 minutes', rep: 1 },
  { id: 'secondstory', name: 'Second-Story Ghost', desc: 'Never used a door', rep: 1 }
];

// ---------- Magpie's notes (§3.2 — exact texts, ≤12 words, once per profile) ----------
LB.NOTES = {
  casing:      'Walk the walls first, love. Windows gossip.',
  sootgem:     'See the gem glow? So do they.',
  snuff:       'Pinch the wick. Dark is your coat.',
  awareness:   'His eyes are filling. Still, or shadow — pick one.',
  suspicious:  'He *felt* you. Statues, dearie.',
  finework:    "Can't pick what you can't see. Crack your lantern — briefly.",
  ghost:       'That smoke-you is what he believes. Let him chase it.',
  banking:     'Shine in the bag is hope. Shine in the cart is money.',
  creak:       'Old boards sing. Creep, or go around.',
  doorsound:   'Doors eat sound. Use them.',
  warden:      'That one tidies up after you. Route around him.',
  ratchet:     'The house remembers. It never calms — only hardens.',
  warmloot:    'Warm loot. Someone misses it *tonight*.',
  pickpocket:  'Light fingers, patient heart.',
  response:    'Company. The house is hiring.',
  pairs:       'Two sets of eyes, one watching backward.',
  scent:       'He has your scent, not your shape. Smoke breaks it.',
  mirror:      'Mirrors carry eyes around corners. Both ways, mind.',
  bell:        'Rigged. Three seconds of quiet hands buys silence.',
  twohand:     'Hands full means helpless. Know your road home.',
  dumbwaiter:  'Send the shine down. Keep your hands free.',
  heavybag:    'Heavy bag, slow feet. Greed has a gait.',
  disguise:    "Walk like you're paid to be here. Never run.",
  marksman:    'He owns the light. The dark is yours.',
  electric:    "Can't pinch the future. Route around it.",
  oldcopper:   "That shutter-song? Leave. Now. He doesn't bribe.",
  bodyhide:    'Tuck him somewhere soft. A found man screams loudest.',
  lurehabit:   "Same trick twice? He's not a cat.",
  roundsclock: "The night doesn't wait with you, dearie.",
  heat:        "You've made that borough nervous. Nervous pays better — and bites.",
  scorefenced: 'Famous shine sells thrice. Bring me stories, not spoons.',
  trickdraft:  'Habits make the thief. Pick one.',
  lockdown:    "They've sealed it. One door left — the long one.",
  scoretaken:  "They'll miss that one by morning. Fly.",
  lasttrick:   "That trick spends once. There's no third hand.",
  othershadow: "Another shadow works tonight. Mind she doesn't reach your prize first.",
  hidespot:    'Hiding is a bet on where he looks.'
};

// ---------- Magpie line pools (§4.7 — counts committed in Phase 3) ----------
LB.MAGPIE = {
  greetings: {
    clean: ['Not a whisper in the papers. My favorite kind of night.',
      'Quiet as soot, dearie. The counter is yours.',
      "The watch slept through you. Beautiful."],
    sloppy: ["Half the district's lit up like Christmas, dearie.",
      'The Sentinel already has a headline. Sloppy.',
      'You woke the whole street. Sit. Explain.'],
    firstTime: ['New face, old trade. Show Magpie what you carry.'],
    postCapture: ["Back from the cells, are we? The city forgets slower than I do."]
  },
  appraisals: {
    vane_emerald: 'The Vane Emerald! Sit DOWN, dearie.',
    regatta_cup: 'The Regatta Cup. Half the yacht club will weep.',
    duke_portrait: 'The Withered Duke himself. He always looked better stolen.',
    chronometer: 'The Meridian Chronometer. Time, purloined. Poetic.',
    whale_crown: 'The Whale-Oil Crown. Gaudy. Gorgeous. Mine.',
    orrery: 'The Ivory Orrery. The heavens in a sack. Show-off.',
    letters: "The Bishop's letters?! Oh, these are worth SINS.",
    candelabra: 'The Serpent Candelabra — still warm! You carried it LIT?',
    ledger: 'The Docklands Ledger. The gangs will thank you. Quietly.',
    casefile: 'Your own file. Burn it or frame it, dearie — you earned either.'
  },
  warnings: {
    dogs: 'That house keeps dogs now — my knees remember.',
    marksman: 'Rifles on the balconies. Stay out of the lamplight.',
    hound: 'A hound on shift. Bring smoke or use the hearths.',
    pair: 'Constables walk in pairs there. No sneaking behind.',
    electric: "They've wired in the electric. Can't pinch those.",
    doubleshift: 'Double shift tonight. Twice the eyes, better pay.',
    drill: 'They drill the lockdown now. Doors close early.',
    collector: 'The Collector never leaves his prize. Nor his house.',
    moonlit: 'Clear night. The moon works for the watch, remember.',
    rain: 'Rain tonight. Soft ears all round — theirs and yours.',
    crowds: 'A ball next door spills guests everywhere. Mind the gowns.',
    heat3: 'That borough is CRAWLING. The fee says why.'
  },
  shadowHints: ['She had another client, that one.',
    'Someone sold your route, dearie. Or hers.',
    'Two shadows, one prize. The city loves a race.',
    "Don't follow her too close. She notices.",
    'She banked it before you? Then it was never yours.',
    "The other one? No name. Even I don't buy names."],
  needles: ['Left him snoring in the hall, did we? The whole watch heard the encore.',
    'Three doors forced. A carpenter sends regards.',
    'They found the lamps doused in a row. Might as well sign it.',
    'A scream at midnight, the paper says. Yours?',
    'The rounds clock beat you, dearie. Dawdling costs.',
    'You left the Score ON THE SHELF? My heart.',
    'Bribing the Crooked Watchman. Expensive habits.',
    'All that noise for spoons and buttons.'],
  briefTeach: {
    buyin: 'Jobs this fat need grease going in. The buy-in, dearie.',
    oldcopperSeed: "There's a copper who doesn't blow his whistle. Pray you never hear the shutter."
  }
};

// Loot table by room type: [name, bulk, value, tag] tag: quiet|attended|famous
LB.LOOT_TABLE = {
  parlor:   [['silver candlesticks', 1, 40, 'quiet'], ['pocket watch', 1, 35, 'quiet'], ['snuffbox', 1, 25, 'quiet']],
  study:    [['drawer cash', 1, 50, 'quiet'], ['deeds', 1, 60, 'quiet'], ['inkstand', 1, 30, 'quiet']],
  bedroom:  [['jewelry box', 1, 90, 'attended'], ['pearl string', 1, 70, 'attended'], ['locket', 1, 45, 'attended']],
  gallery:  [['small bronze', 2, 110, 'quiet'], ['miniature portrait', 1, 80, 'quiet']],
  vaultroom:[['bond stack', 1, 150, 'quiet'], ['bullion bar', 2, 200, 'quiet']],
  strongroom:[['coin sacks', 2, 130, 'quiet']],
  exhibits: [['display piece', 1, 100, 'attended']],
  kitchen:  [['good silver', 1, 35, 'quiet']],
  office:   [['ledger notes', 1, 55, 'quiet'], ['petty cash', 1, 45, 'quiet']],
  floor:    [['crated goods', 2, 70, 'quiet'], ['bottled spirits', 1, 40, 'quiet']],
  lockup:   [['strongbox', 2, 120, 'quiet']],
  ballroom: [['gala jewel', 1, 120, 'attended']],
  hall:     [['umbrella stand silver', 1, 30, 'quiet']],
  default:  [['oddments', 1, 20, 'quiet']]
};

if (typeof module !== 'undefined') module.exports = LB;
