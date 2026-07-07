// ============================================================================
// PLANTATION — bird's-eye farming game
//
// File map (in order):
//   CONFIG        — every tunable number, grouped. Tweak here, not inline.
//   CANVAS & DOM  — canvas, HUD elements, resize.
//   STATE         — camera, zoom, mode, mouse, keys, farmer, inventory, world.
//   UTILS         — clamp/hash/world<->screen helpers.
//   INPUT         — keyboard, mouse, wheel. All listeners live here.
//   ITEMS         — Item base + concrete items (logic only; visuals below).
//   ITEM VISUALS  — draw()/drawIcon() on prototypes, out of the class bodies.
//   WORLD         — procedural dirt tiles + sparse per-tile state (tilling etc).
//   FARMER        — pixel-art bodies, walk rigs, drawFarmer().
//   UPDATE        — per-frame simulation (movement, camera, animation, items).
//   RENDER        — draw() pipeline: ground → farmer → vignette → item → UI.
//   UI            — hotbar + mode pill.
//   BOOT          — initial state + main loop.
// ============================================================================


// ============================== CONFIG =====================================
const CFG = {
    // free camera
    camSpeed:   560,    // px/s pan speed
    camBoost:   2.1,    // Shift multiplier (free cam)
    camEase:    9,      // higher = snappier start/stop

    // farmer
    farmerSpeed: 210,   // walk px/s — deliberately slower than the free cam
    farmerRun:   1.9,   // Shift multiplier while walking
    camFollow:   8,     // how fast the camera eases to re-centre on him

    // zoom
    zoomMin:  0.40,     // pulled back — survey the field
    zoomMax:  1.75,     // pushed in — inspect a single plot
    zoomRate: 0.0015,   // wheel sensitivity (exponential)

    // world
    tile:         64,   // world px per ground tile
    tileVariants: 16,   // baked soil variations

    // walk animation
    walkCadence: 0.05,  // phase advance per world-px moved (legs sync to speed)
    walkFade:    12,    // how fast the cycle blends in/out on start/stop
    legLen:      2,     // sprite px
    legThick:    3.4,   // sprite px

    // tools
    hoeReach: 72,       // fixed world-px distance from the farmer; mouse aims direction

    // farming
    growTime: 1.0,      // seconds per growth stage (extra short for testing)
    startCoins: 25,

    // shop
    shopRange: 120,     // world px from the stall counter to interact

    // hotbar
    slot:      58,      // slot size px
    slotGap:   8,
    hotbarPad: 22,      // distance from bottom of screen
};


// =========================== CANVAS & DOM ==================================
const canvas   = document.getElementById('c');
const ctx      = canvas.getContext('2d');
const coordsEl = document.getElementById('coords');
const zoomEl   = document.getElementById('zoomlabel');
const modeEl   = document.getElementById('mode');
const coinsEl  = document.getElementById('coins');

function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    buildVignette();
}


// ================================ STATE ====================================
const cam = { x: 0, y: 0, vx: 0, vy: 0 };   // top-left of viewport, world px
let zoom = 1;
let farmerMode = false;                      // false = Free cam, true = Farmer

const mouse = { x: 0, y: 0, wx: 0, wy: 0, down: false }; // screen + world px
const keys = Object.create(null);           // keys[e.code] = held?
let shiftHeld = false;

const farmer = {
    x: 0, y: 0, vx: 0, vy: 0,
    walkPhase: 0,       // advances while moving; drives the leg cycle
    walkAmt: 0,         // 0..1 eased "how much to animate"
    facing: 'front',    // front / back / side / front34 / back34
    mirror: false,      // true = flip horizontally (walking left-ish)
    dirX: 0, dirY: 1,   // unit vector of his 8-way facing (sticky, like facing)
};

const inventory = {
    hotBar: [null, null, null, null, null, null, null, null, null],
    selected: 0,
    coins: CFG.startCoins,
    items: {},          // future: counts of harvested crops etc by name
};

let shopOpen = false;   // the seed-stall buy panel
let coinFlash = 0;      // timestamp: flash coins red until then (can't afford)

// sparse per-tile state over the infinite procedural ground.
// A tile with no entry is plain dirt. Future: {kind:'tilled'|'planted', ...}
const worldTiles = new Map();
const tileKey = (c, r) => c + ',' + r;
const getTile = (c, r) => worldTiles.get(tileKey(c, r)) || null;
const setTile = (c, r, t) => { worldTiles.set(tileKey(c, r), t); };


// ================================ UTILS ====================================
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// world <-> screen
const sx = (wx) => (wx - cam.x) * zoom;
const sy = (wy) => (wy - cam.y) * zoom;
const wx = (px) => cam.x + px / zoom;
const wy = (py) => cam.y + py / zoom;

// aim point at a fixed reach from the farmer, in the direction of the cursor
// (falls back to his facing if the cursor sits right on him). Used by tools.
function aimFromFarmer(reach) {
    let dx = mouse.wx - farmer.x, dy = mouse.wy - farmer.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) { dx /= d; dy /= d; } else { dx = farmer.dirX; dy = farmer.dirY; }
    const ax = farmer.x + dx * reach;
    const ay = farmer.y + dy * reach;
    return { wx: ax, wy: ay, c: Math.floor(ax / CFG.tile), r: Math.floor(ay / CFG.tile) };
}

// deterministic 2D hash — pins ground detail to world coords (no flicker)
function hash2(x, y) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263;
    h = (h ^ (h >>> 13)) >>> 0;
    h = (h * 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}


// ================================ INPUT ====================================
window.addEventListener('resize', resize);

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
        mouse.down = true;
        // the shop panel swallows clicks while open
        if (shopOpen) { shopClick(e.clientX, e.clientY); return; }
        const held = inventory.hotBar[inventory.selected];
        // farmer tools only work as the farmer; free tools only as the eyes
        if (held && held.farmerTool === farmerMode) held.use();
    }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.shiftKey || e.ctrlKey) {
        // Shift/Ctrl + scroll — zoom toward the cursor
        const ax = wx(e.clientX), ay = wy(e.clientY);   // anchor world point
        zoom = clamp(zoom * Math.exp(-e.deltaY * CFG.zoomRate), CFG.zoomMin, CFG.zoomMax);
        cam.x = ax - e.clientX / zoom;                  // keep anchor under cursor
        cam.y = ay - e.clientY / zoom;
    } else {
        // plain scroll — cycle the hotbar selection
        const n = inventory.hotBar.length;
        const dir = e.deltaY > 0 ? 1 : -1;
        inventory.selected = (inventory.selected + dir + n) % n;
    }
}, { passive: false });

// Key off e.code (physical key) so Shift's uppercasing of e.key can't strand
// a held direction — 'w' down / 'W' up would never cancel each other.
const PAN_KEYS = ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'];
window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') shiftHeld = true;
    if (e.code === 'Tab' && !e.repeat) {    // Tab flips Free <-> Farmer
        e.preventDefault();
        setMode(!farmerMode);
    }
    if (e.code === 'KeyE' && !e.repeat && nearShop()) {  // E opens/closes the stall
        shopOpen = !shopOpen;
    }
    if (e.code.startsWith('Digit')) {       // 1-9 select hotbar slots
        const n = +e.code[5];
        if (n >= 1 && n <= inventory.hotBar.length) inventory.selected = n - 1;
    }
    keys[e.code] = true;                    // single source of truth for held keys
    if (PAN_KEYS.includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') shiftHeld = false;
    keys[e.code] = false;
});
// don't leave anything drifting if focus is lost mid-press
window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    shiftHeld = false;
    mouse.down = false;
});

function setMode(toFarmer) {
    farmerMode = toFarmer;
    if (!modeEl) return;
    modeEl.textContent = farmerMode ? 'Farmer' : 'Free';
    // green pill in Free, amber pill in Farmer
    modeEl.style.borderColor = farmerMode ? 'rgba(240,200,110,0.85)' : 'rgba(120,200,130,0.7)';
    modeEl.style.color       = farmerMode ? 'rgba(255,236,182,0.95)' : 'rgba(200,245,200,0.95)';
    modeEl.style.boxShadow   = farmerMode
        ? '0 0 14px rgba(240,200,110,0.3)'
        : '0 0 14px rgba(120,200,130,0.25)';
}


// ================================ ITEMS ====================================
// Logic only — the draw()/drawIcon() visuals live in ITEM VISUALS below.
// farmerTool decides who wields it: true = only works/draws in Farmer mode
// (the farmer is holding it), false = only in Free mode (a god-view tool).
class Item {
    farmerTool = false;
    update() {}                 // runs every frame while selected
    use() {}                    // left click while selected (mode-gated centrally)
    draw() {}                   // world-space visual while selected (mode-gated)
    drawIcon(cx, cy, size) {}   // icon inside its hotbar slot
}

class Teleporter extends Item {
    constructor() { super(); this.x = 0; this.y = 0; }
    update() {
        this.x = mouse.wx;      // follows the cursor in world space
        this.y = mouse.wy;
    }
    use() { farmer.x = this.x; farmer.y = this.y; }
}

// The hoe is in the farmer's hands: it tills a tile a FIXED reach away from
// him, aimed with the MOUSE. So position (walk/run/teleport) sets how far you
// can reach; the cursor picks which tile in that ring you swing at.
class Hoe extends Item {
    farmerTool = true;
    constructor() { super(); this.c = 0; this.r = 0; this.wx = 0; this.wy = 0; }
    update() {
        const aim = aimFromFarmer(CFG.hoeReach);
        this.wx = aim.wx; this.wy = aim.wy;
        this.c = aim.c;   this.r = aim.r;
        // holding the button tills as you sweep the cursor / walk
        if (farmerMode && mouse.down && !shopOpen) this.till();
    }
    use() { this.till(); }
    till() {
        if (getTile(this.c, this.r)) return; // already worked soil
        setTile(this.c, this.r, { kind: 'tilled', v: (hash2(this.c, this.r) * 4) | 0 });
    }
}

// A bag of seeds, bought at the stall. Same fixed-reach mouse aim as the hoe;
// plants only into tilled soil, one seed per tile. The crop then grows on its
// own through 4 stages (see CROPS in WORLD / growth tick in UPDATE).
class SeedBag extends Item {
    farmerTool = true;
    constructor(cropId) {
        super();
        this.cropId = cropId;
        this.count = 0;
        this.c = 0; this.r = 0; this.wx = 0; this.wy = 0;
    }
    update() {
        const aim = aimFromFarmer(CFG.hoeReach);
        this.wx = aim.wx; this.wy = aim.wy;
        this.c = aim.c;   this.r = aim.r;
        // hold the button and sweep to sow row after row
        if (farmerMode && mouse.down && !shopOpen) this.plant();
    }
    use() { this.plant(); }
    plant() {
        if (this.count <= 0) return;
        const t = getTile(this.c, this.r);
        if (!t || t.kind !== 'tilled') return;   // needs worked soil
        this.count--;
        setTile(this.c, this.r, {
            kind: 'crop', crop: this.cropId, v: t.v,   // keep the tilled base look
            stage: 0, t: performance.now(),
        });
    }
}

const teleporter = new Teleporter();
const hoe = new Hoe();
const wheatSeeds = new SeedBag('wheat');
inventory.hotBar[0] = teleporter;
inventory.hotBar[1] = hoe;
inventory.hotBar[2] = wheatSeeds;

// what the stall sells (rows in the shop panel)
const SHOP_STOCK = [
    { name: 'Wheat Seeds', cost: 2, item: wheatSeeds },
];

function buyStock(entry) {
    if (inventory.coins < entry.cost) {
        coinFlash = performance.now() + 350;   // can't afford — flash the purse
        return;
    }
    inventory.coins -= entry.cost;
    entry.item.count++;
}


// ============================ ITEM VISUALS =================================
//  draw() = world visual while the item is selected.
//  drawIcon(cx, cy, size) = the icon inside its hotbar slot.
//  Defined on prototypes so the class bodies above stay focused on logic.
//  `this` is the item instance, exactly like a normal method. Add a new
//  item's visuals under its own header here — no need to touch the class.
// ===========================================================================

// ---- Teleporter: glowing sci-fi teleport reticle (world) ----
Teleporter.prototype.draw = function () {
    const px = sx(this.x), py = sy(this.y);
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    const R = (24 + pulse * 4) * zoom;   // radius breathes, and scales with zoom

    ctx.save();
    ctx.translate(px, py);
    ctx.shadowColor = 'rgba(120, 220, 255, 0.9)';
    ctx.shadowBlur = 16;

    // outer dashed ring, slowly spinning
    ctx.strokeStyle = 'rgba(140, 230, 255, 0.95)';
    ctx.lineWidth = Math.max(1, 2.5 * zoom);
    ctx.setLineDash([7 * zoom, 6 * zoom]);
    ctx.lineDashOffset = -t * 40;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();

    // inner solid ring
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(205, 245, 255, 0.85)';
    ctx.lineWidth = Math.max(1, 1.5 * zoom);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    // crosshair ticks at the four cardinals
    ctx.beginPath();
    for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
        const ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(ca * R * 0.7, sa * R * 0.7);
        ctx.lineTo(ca * R * 1.05, sa * R * 1.05);
    }
    ctx.stroke();

    // bright core
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(235, 250, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, 3 * zoom), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
};

// ---- Teleporter: compact reticle icon (hotbar slot) ----
Teleporter.prototype.drawIcon = function (cx, cy, size) {
    const R = size * 0.30;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = 'rgba(120, 220, 255, 0.8)';
    ctx.shadowBlur = 7;

    ctx.strokeStyle = 'rgba(140, 230, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(205, 245, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
        const ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(ca * R * 0.75, sa * R * 0.75);
        ctx.lineTo(ca * R * 1.2, sa * R * 1.2);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(235, 250, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
};


// ---- Hoe: aim line from the farmer + target-tile highlight (world) ----
Hoe.prototype.draw = function () {
    const T = CFG.tile;
    const px = sx(this.c * T), py = sy(this.r * T);
    const size = T * zoom;
    const tillable = !getTile(this.c, this.r);
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);

    // faint reach line from the farmer's hands to the aimed tile, so the
    // fixed-distance / mouse-aim relationship is legible
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 220, 150, 0.5)';
    ctx.lineWidth = Math.max(1.5, 2 * zoom);
    ctx.setLineDash([5 * zoom, 5 * zoom]);
    ctx.beginPath();
    ctx.moveTo(sx(farmer.x), sy(farmer.y));
    ctx.lineTo(sx(this.wx), sy(this.wy));
    ctx.stroke();
    ctx.restore();

    ctx.save();
    if (tillable) {
        // warm earthy glow: this dirt is ready to turn
        ctx.fillStyle = `rgba(230, 190, 110, ${0.10 + pulse * 0.08})`;
        ctx.fillRect(px, py, size, size);
        ctx.strokeStyle = `rgba(255, 214, 130, ${0.65 + pulse * 0.3})`;
        ctx.lineWidth = Math.max(1.5, 2.5 * zoom);
    } else {
        // already worked — quiet grey frame, no invitation
        ctx.strokeStyle = 'rgba(220, 220, 220, 0.28)';
        ctx.lineWidth = Math.max(1, 1.5 * zoom);
    }
    // corner brackets read as "target" better than a full box
    const L = size * 0.26;
    ctx.beginPath();
    for (const [cx2, cy2, dx, dy] of [
        [px, py, 1, 1], [px + size, py, -1, 1],
        [px + size, py + size, -1, -1], [px, py + size, 1, -1],
    ]) {
        ctx.moveTo(cx2 + dx * L, cy2);
        ctx.lineTo(cx2, cy2);
        ctx.lineTo(cx2, cy2 + dy * L);
    }
    ctx.stroke();
    ctx.restore();
};

// ---- Hoe: pixel hoe icon (hotbar slot) ----
// Baked pixel map, same style as the farmer: a long diagonal handle coming
// down into a wide flat steel blade biting the ground (bottom-left).
const HOE_ICON = (() => {
    const map = [
        '............Ww',
        '...........Ww.',
        '..........Ww..',
        '.........Ww...',
        '........Ww....',
        '.......Ww.....',
        '..xxxxWw......',
        '.xmmmmx.......',
        '.xMMmmmx......',
        '..xxxxx.......',
    ];
    const pal = {
        x: '#241a12', // outline
        m: '#9aa7b0', // steel
        M: '#cfd8dd', // steel highlight (worn edge)
        w: '#7a4e26', // wood
        W: '#a9713a', // wood highlight
    };
    const W = 14, H = map.length;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const c = off.getContext('2d');
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const col = pal[map[y][x]];
            if (!col) continue;
            c.fillStyle = col;
            c.fillRect(x, y, 1, 1);
        }
    }
    return off;
})();

Hoe.prototype.drawIcon = function (cx, cy, size) {
    const scale = (size * 0.78) / 14;
    const w = HOE_ICON.width * scale, h = HOE_ICON.height * scale;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(HOE_ICON, Math.round(cx - w / 2), Math.round(cy - h / 2),
                  Math.round(w), Math.round(h));
    ctx.imageSmoothingEnabled = prev;
};

// ---- SeedBag: planting brackets on the aimed tile (world) ----
SeedBag.prototype.draw = function () {
    const T = CFG.tile;
    const px = sx(this.c * T), py = sy(this.r * T);
    const size = T * zoom;
    const t = getTile(this.c, this.r);
    const plantable = this.count > 0 && t && t.kind === 'tilled';
    const time = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);

    // reach line, same language as the hoe
    ctx.save();
    ctx.strokeStyle = 'rgba(190, 235, 150, 0.5)';
    ctx.lineWidth = Math.max(1.5, 2 * zoom);
    ctx.setLineDash([5 * zoom, 5 * zoom]);
    ctx.beginPath();
    ctx.moveTo(sx(farmer.x), sy(farmer.y));
    ctx.lineTo(sx(this.wx), sy(this.wy));
    ctx.stroke();
    ctx.restore();

    ctx.save();
    if (plantable) {
        // living green: this soil is ready for seed
        ctx.fillStyle = `rgba(140, 210, 90, ${0.10 + pulse * 0.08})`;
        ctx.fillRect(px, py, size, size);
        ctx.strokeStyle = `rgba(170, 235, 110, ${0.65 + pulse * 0.3})`;
        ctx.lineWidth = Math.max(1.5, 2.5 * zoom);
    } else {
        // wrong ground (or no seeds) — quiet grey frame
        ctx.strokeStyle = 'rgba(220, 220, 220, 0.28)';
        ctx.lineWidth = Math.max(1, 1.5 * zoom);
    }
    const L = size * 0.26;
    ctx.beginPath();
    for (const [cx2, cy2, dx, dy] of [
        [px, py, 1, 1], [px + size, py, -1, 1],
        [px + size, py + size, -1, -1], [px, py + size, 1, -1],
    ]) {
        ctx.moveTo(cx2 + dx * L, cy2);
        ctx.lineTo(cx2, cy2);
        ctx.lineTo(cx2, cy2 + dy * L);
    }
    ctx.stroke();
    ctx.restore();
};

// ---- SeedBag: pixel seed-pouch icon (hotbar slot) ----
const SEED_ICON = (() => {
    const map = [
        '....xx....',
        '...xggx...',
        '...xggx...',
        '..xssssx..',
        '.xssssssx.',
        '.xsBssBsx.',
        '.xssssssx.',
        '.xsBssBsx.',
        '..xssssx..',
        '...xxxx...',
    ];
    const pal = {
        x: '#241a12', // outline
        g: '#6a8f3f', // tie / sprout green
        s: '#d9b166', // burlap sack
        B: '#7a4e26', // seeds showing through
    };
    const W = 10, H = map.length;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const c = off.getContext('2d');
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const col = pal[map[y][x]];
            if (!col) continue;
            c.fillStyle = col;
            c.fillRect(x, y, 1, 1);
        }
    }
    return off;
})();

SeedBag.prototype.drawIcon = function (cx, cy, size) {
    const scale = (size * 0.62) / 10;
    const w = SEED_ICON.width * scale, h = SEED_ICON.height * scale;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(SEED_ICON, Math.round(cx - w / 2), Math.round(cy - h / 2),
                  Math.round(w), Math.round(h));
    ctx.imageSmoothingEnabled = prev;
};


// ================================ WORLD ====================================
// Pre-baked flat soil variants with grit/pebbles; hash picks one per world
// cell so the field is infinite and never flickers or slides.
const groundTiles = [];

function buildGroundTiles() {
    const T = CFG.tile;
    groundTiles.length = 0;
    for (let i = 0; i < CFG.tileVariants; i++) {
        const off = document.createElement('canvas');
        off.width = T;
        off.height = T;
        const c = off.getContext('2d');

        // seeded PRNG for this variant
        let s = (i * 2654435761 + 12345) >>> 0;
        const rnd = () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };

        // base soil colour, gently varied per variant
        const tint = 0.9 + rnd() * 0.22;
        c.fillStyle = `rgb(${Math.floor(104 * tint)},${Math.floor(72 * tint)},${Math.floor(46 * tint)})`;
        c.fillRect(0, 0, T, T);

        // soft mottling blobs so the flat fill reads as earth, not paint
        for (let k = 0; k < 10; k++) {
            const a = 0.05 + rnd() * 0.08;
            c.fillStyle = rnd() < 0.5 ? `rgba(40,24,12,${a})` : `rgba(170,140,100,${a})`;
            c.beginPath();
            c.arc(rnd() * T, rnd() * T, 6 + rnd() * 16, 0, Math.PI * 2);
            c.fill();
        }

        // grit: pebbles and little clods
        const grit = 26 + Math.floor(rnd() * 18);
        for (let k = 0; k < grit; k++) {
            const roll = rnd();
            if (roll < 0.55)      c.fillStyle = `rgba(28,16,8,${0.22 + rnd() * 0.28})`;     // dark speck
            else if (roll < 0.85) c.fillStyle = `rgba(190,160,120,${0.16 + rnd() * 0.24})`; // pale pebble
            else                  c.fillStyle = `rgba(120,150,90,${0.10 + rnd() * 0.14})`;  // stray green
            c.beginPath();
            c.arc(rnd() * T, rnd() * T, 0.5 + rnd() * 1.7, 0, Math.PI * 2);
            c.fill();
        }

        groundTiles.push(off);
    }
}

// Tilled soil: darker turned earth with horizontal furrow ridges. Baked in a
// few variants (picked per tile) so a field doesn't look rubber-stamped.
const tilledTiles = [];

function buildTilledTiles() {
    const T = CFG.tile;
    tilledTiles.length = 0;
    for (let i = 0; i < 4; i++) {
        const off = document.createElement('canvas');
        off.width = T;
        off.height = T;
        const c = off.getContext('2d');

        let s = (i * 96534123 + 7777) >>> 0;
        const rnd = () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };

        // turned earth base — a shade darker/richer than the untouched ground,
        // but nowhere near plank-dark
        const tint = 0.94 + rnd() * 0.12;
        c.fillStyle = `rgb(${Math.floor(88 * tint)},${Math.floor(60 * tint)},${Math.floor(38 * tint)})`;
        c.fillRect(0, 0, T, T);

        // soft mottling so the base isn't a flat paint fill
        for (let k = 0; k < 6; k++) {
            const a = 0.04 + rnd() * 0.05;
            c.fillStyle = rnd() < 0.5 ? `rgba(40,24,12,${a})` : `rgba(160,124,84,${a})`;
            c.beginPath();
            c.arc(rnd() * T, rnd() * T, 5 + rnd() * 11, 0, Math.PI * 2);
            c.fill();
        }

        // three furrows, drawn as broken wobbly groove segments inset from the
        // tile edges — no edge-to-edge rails, so a row of tilled tiles reads as
        // dug soil rather than decking
        for (let f = 0; f < 3; f++) {
            const cy = 11 + f * 21 + rnd() * 3;
            let x = 3 + rnd() * 4;
            while (x < T - 8) {
                const seg = 9 + rnd() * 13;             // groove piece
                const y = cy + (rnd() - 0.5) * 3;        // slight wobble
                c.fillStyle = `rgba(34,19,10,${0.26 + rnd() * 0.14})`; // shadowed groove
                c.fillRect(x, y, Math.min(seg, T - 5 - x), 4.5);
                c.fillStyle = `rgba(176,134,90,${0.16 + rnd() * 0.12})`; // lit crumb ridge
                c.fillRect(x + 1, y - 2, Math.min(seg - 2, T - 7 - x), 1.8);
                x += seg + 2 + rnd() * 4;                // small gap breaks the line
            }
        }

        // clods and crumbs of freshly turned soil
        for (let k = 0; k < 9; k++) {
            c.fillStyle = `rgba(30,17,9,${0.10 + rnd() * 0.12})`;
            c.beginPath();
            c.arc(rnd() * T, rnd() * T, 1.6 + rnd() * 2.2, 0, Math.PI * 2);
            c.fill();
        }
        for (let k = 0; k < 16; k++) {
            c.fillStyle = rnd() < 0.5
                ? `rgba(24,13,7,${0.2 + rnd() * 0.2})`
                : `rgba(168,128,86,${0.14 + rnd() * 0.16})`;
            c.beginPath();
            c.arc(rnd() * T, rnd() * T, 0.5 + rnd() * 1.1, 0, Math.PI * 2);
            c.fill();
        }

        tilledTiles.push(off);
    }
}

// ---- Crops ----
// Growth-stage art per crop: clumps planted along the furrow lines, baked in
// 2 variants per stage so fields aren't perfectly rubber-stamped.
// wheat: seeds -> sprout -> green stalks -> golden mature
const cropTiles = { wheat: [] }; // [stage][variant] -> canvas

function buildCropTiles() {
    const T = CFG.tile;
    cropTiles.wheat = [];
    for (let stage = 0; stage < 4; stage++) {
        const variants = [];
        for (let vv = 0; vv < 2; vv++) {
            const off = document.createElement('canvas');
            off.width = T;
            off.height = T;
            const c = off.getContext('2d');

            let s = (stage * 7919 + vv * 104729 + 31) >>> 0;
            const rnd = () => {
                s = (s * 1664525 + 1013904223) >>> 0;
                return s / 4294967296;
            };

            // one clump every ~13px along each furrow line
            for (const fy of [11, 32, 53]) {
                for (let x = 7 + rnd() * 4; x < T - 5; x += 12 + rnd() * 5) {
                    const jy = fy + (rnd() - 0.5) * 3;
                    if (stage === 0) {
                        // freshly sown: a little dimple with seeds pressed in
                        c.fillStyle = 'rgba(30,17,9,0.35)';
                        c.beginPath();
                        c.ellipse(x, jy, 2.6, 1.7, 0, 0, Math.PI * 2);
                        c.fill();
                        c.fillStyle = '#e0c268';
                        c.fillRect(x - 1, jy - 0.5, 1.2, 1.2);
                        c.fillRect(x + 0.4, jy, 1.2, 1.2);
                    } else if (stage === 1) {
                        // sprout: two tiny blades
                        c.strokeStyle = '#79b04d';
                        c.lineWidth = 1.2;
                        c.beginPath();
                        c.moveTo(x, jy + 1); c.lineTo(x - 1.2, jy - 3);
                        c.moveTo(x, jy + 1); c.lineTo(x + 1.4, jy - 2.4);
                        c.stroke();
                    } else if (stage === 2) {
                        // young wheat: a fan of green stalks
                        c.strokeStyle = '#4f8a33';
                        c.lineWidth = 1.3;
                        c.beginPath();
                        for (let b = -1; b <= 1; b++) {
                            c.moveTo(x, jy + 1.5);
                            c.lineTo(x + b * 2.4 + (rnd() - 0.5), jy - 6 - rnd() * 2);
                        }
                        c.stroke();
                        c.strokeStyle = '#6fa844';
                        c.beginPath();
                        c.moveTo(x, jy + 1.5); c.lineTo(x + (rnd() - 0.5) * 2, jy - 4.5);
                        c.stroke();
                    } else {
                        // mature: tall golden stalks with grain heads
                        c.strokeStyle = '#b89a3e';
                        c.lineWidth = 1.4;
                        c.beginPath();
                        for (let b = -1; b <= 1; b++) {
                            c.moveTo(x, jy + 1.5);
                            c.lineTo(x + b * 2.2, jy - 8 - rnd() * 2);
                        }
                        c.stroke();
                        c.fillStyle = '#e3c76a';
                        for (let b = -1; b <= 1; b++) {
                            const hx = x + b * 2.2, hy = jy - 8.5 - rnd() * 2;
                            c.fillRect(hx - 1, hy - 3, 2.2, 4);
                        }
                        c.fillStyle = '#f0d98c';
                        c.fillRect(x - 0.8, jy - 11, 1.6, 2);
                    }
                }
            }
            variants.push(off);
        }
        cropTiles.wheat.push(variants);
    }
}

// per-tile state renderer
function drawTileState(tile, px, py, size) {
    if (tile.kind === 'tilled') {
        ctx.drawImage(tilledTiles[tile.v & 3], px, py, size, size);
    } else if (tile.kind === 'crop') {
        ctx.drawImage(tilledTiles[tile.v & 3], px, py, size, size);      // soil base
        ctx.drawImage(cropTiles[tile.crop][tile.stage][tile.v & 1], px, py, size, size);
    }
    // 'shop' tiles draw nothing — the stall sprite covers them
}

// ---- The seed stall (an actual place in the world) ----
// Sits just up-right of spawn. Walk the farmer to the counter and press E.
const SHOP = {
    x: 2 * CFG.tile,            // sprite top-left, world px
    y: -3 * CFG.tile,
    w: 3 * CFG.tile,            // 24x17 sprite cells at 8 world px each
    h: 136,
    baseY: -56,                 // where its feet meet the ground (y-sort line)
    door: { x: 3.5 * CFG.tile, y: -30 },  // stand near here to shop
    tiles: [],                  // reserved ground cells (blocked from tilling)
};
for (let c = 2; c <= 4; c++) for (let r = -3; r <= -2; r++) SHOP.tiles.push([c, r]);

function nearShop() {
    return farmerMode &&
        Math.hypot(farmer.x - SHOP.door.x, farmer.y - SHOP.door.y) < CFG.shopRange;
}

// wooden stall: striped awning, open counter with seed sacks on display
const STALL_SPRITE = (() => {
    const map = [
        'xxxxxxxxxxxxxxxxxxxxxxxx',
        'xaaAAaaAAaaAAaaAAaaAAaax',
        'xaaAAaaAAaaAAaaAAaaAAaax',
        'xaaAAaaAAaaAAaaAAaaAAaax',
        'xaaAAaaAAaaAAaaAAaaAAaax',
        'xxxxxxxxxxxxxxxxxxxxxxxx',
        'wwiiiiiiiiiiiiiiiiiiiiww',
        'wwiiiiiiiiiiiiiiiiiiiiww',
        'wwiissssiissssiissssiiww',
        'wwiissssiissssiissssiiww',
        'xPPPPPPPPPPPPPPPPPPPPPPx',
        'xppppppppppppppppppppppx',
        'xppppppppppppppppppppppx',
        'xqqqqqqqqqqqqqqqqqqqqqqx',
        '.ww..................ww.',
        '.ww..................ww.',
        '.xx..................xx.',
    ];
    const pal = {
        x: '#241a12', // outline / dark
        a: '#c0392b', // awning red
        A: '#f2e7d5', // awning cream
        w: '#7a4e26', // wooden post
        i: '#171009', // shaded interior
        s: '#d9b166', // seed sacks on display
        P: '#b98c53', // counter top (lit)
        p: '#96703f', // counter front
        q: '#6d4e2a', // counter shadow
    };
    const W = 24, H = map.length;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const c = off.getContext('2d');
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const col = pal[map[y][x]];
            if (!col) continue;
            c.fillStyle = col;
            c.fillRect(x, y, 1, 1);
        }
    }
    return off;
})();

function drawStall() {
    // soft ground shadow under the stall
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(sx(SHOP.x + SHOP.w / 2), sy(SHOP.baseY - 2),
                (SHOP.w / 2 + 6) * zoom, 9 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(STALL_SPRITE, Math.round(sx(SHOP.x)), Math.round(sy(SHOP.y)),
                  Math.round(SHOP.w * zoom), Math.round(SHOP.h * zoom));
    ctx.imageSmoothingEnabled = prev;
}


// ================================ FARMER ===================================
// Baked body (hat -> hips) per facing + procedural legs drawn every frame.
// Left-facing = right-facing art mirrored at render time. Legs attach @ row 13.
const FARMER_PX = 3;   // world px per sprite pixel
const FARMER_W  = 16;  // sprite width in pixels
const FARMER_H  = 18;  // full logical height (body + legs) used for centring

const FARMER_PAL = {
    x: '#241a12', // outline
    h: '#eccb73', // straw hat, light
    g: '#caa347', // straw hat brim, dark
    s: '#f2c396', // skin
    k: '#d89a68', // skin shadow (jaw/mouth)
    e: '#241a12', // eyes
    n: '#4a2f1a', // hair (back of head)
    r: '#c34733', // shirt (red)
    o: '#35688f', // overalls (blue)
    d: '#244a66', // overalls dark (pocket seam)
    b: '#5a3b22', // boots
};

const FARMER_MAPS = {
    // walking DOWN (towards camera) — the classic front view
    front: [
        '................',
        '.....xxxxxx.....',
        '....xhhhhhhx....',
        '...xhhhhhhhhx...',
        '..xggggggggggx..',
        '....xssssssx....',
        '....xsessesx....',
        '....xsskkssx....',
        '...xssssssssx...',
        '..xrrrrrrrrrrx..',
        '..xsoooooooosx..',
        '..xsoooooooosx..',
        '...xoooooooox...',
        '...xooddddoox...',
    ],
    // walking UP (away) — hat + hair, overall straps crossing the shirt, back pocket
    back: [
        '................',
        '.....xxxxxx.....',
        '....xhhhhhhx....',
        '...xhhhhhhhhx...',
        '..xggggggggggx..',
        '....xnnnnnnx....',
        '....xnnnnnnx....',
        '....xsnnnnsx....',
        '...xssssssssx...',
        '..xroorrrroorx..',
        '..xsoooooooosx..',
        '..xsoooooooosx..',
        '...xoooooooox...',
        '...xoodxxdoox...',
    ],
    // walking RIGHT — profile: brim pokes forward, one eye, arm over the side
    side: [
        '................',
        '.....xxxxx......',
        '....xhhhhhx.....',
        '....xhhhhhx.....',
        '....xggggggggx..',
        '.....xssssx.....',
        '.....xsssex.....',
        '.....xsskkx.....',
        '.....xssssx.....',
        '....xrrrrrrx....',
        '....xrossrrx....',
        '....xrossrrx....',
        '.....xooooox....',
        '.....xoodoox....',
    ],
    // walking DOWN-RIGHT — front view turned: eyes shifted, brim swung forward
    front34: [
        '................',
        '.....xxxxxx.....',
        '....xhhhhhhx....',
        '...xhhhhhhhhx...',
        '..xgggggggggggx.',
        '....xssssssx....',
        '....xssessex....',
        '....xssskksx....',
        '...xssssssssx...',
        '..xrrrrrrrrrrx..',
        '..xsoooooooosx..',
        '..xsoooooooosx..',
        '...xoooooooox...',
        '...xooddddoox...',
    ],
    // walking UP-RIGHT — back view turned: brim swung, sliver of cheek showing
    back34: [
        '................',
        '.....xxxxxx.....',
        '....xhhhhhhx....',
        '...xhhhhhhhhx...',
        '..xgggggggggggx.',
        '....xnnnnnnx....',
        '....xnnnnnsx....',
        '....xsnnnnsx....',
        '...xssssssssx...',
        '..xroorrrroorx..',
        '..xsoooooooosx..',
        '..xsoooooooosx..',
        '...xoooooooox...',
        '...xoodxxdoox...',
    ],
};

const FARMER_BODIES = {};
for (const name in FARMER_MAPS) FARMER_BODIES[name] = bakeFarmerMap(FARMER_MAPS[name]);

function bakeFarmerMap(map) {
    const off = document.createElement('canvas');
    off.width = FARMER_W;
    off.height = map.length;
    const c = off.getContext('2d');
    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < FARMER_W; x++) {
            const col = FARMER_PAL[map[y][x]];
            if (!col) continue;
            c.fillStyle = col;
            c.fillRect(x, y, 1, 1);
        }
    }
    return off;
}

// Classic 8-frame walk cycle (contact -> down -> passing -> up, then mirrored).
// body = sprite-px of vertical offset (+ = sinks, - = rises). Two leg styles:
// SPLAY for front/back views (feet part sideways, knees tuck on the pass) and
// SCISSOR for side/diagonal views (one leg swings forward, the other trails).
const FARMER_SPLAY_FRAMES = [
    { l: { th: -0.50, lift: 0   }, r: { th: 0.50, lift: 0   }, body:  0.0 }, // CONTACT 1 (/\)
    { l: { th: -0.34, lift: 0   }, r: { th: 0.34, lift: 0   }, body:  0.7 }, // DOWN (compress)
    { l: { th: -0.05, lift: 0   }, r: { th: 0.10, lift: 1.4 }, body:  0.2 }, // PASSING (|| R knee up)
    { l: { th: -0.03, lift: 0   }, r: { th: 0.16, lift: 0.6 }, body: -0.9 }, // UP (tall push-off)
    { l: { th: -0.50, lift: 0   }, r: { th: 0.50, lift: 0   }, body:  0.0 }, // CONTACT 2 (/\)
    { l: { th: -0.34, lift: 0   }, r: { th: 0.34, lift: 0   }, body:  0.7 }, // DOWN
    { l: { th: -0.10, lift: 1.4 }, r: { th: 0.05, lift: 0   }, body:  0.2 }, // PASSING (|| L knee up)
    { l: { th: -0.16, lift: 0.6 }, r: { th: 0.03, lift: 0   }, body: -0.9 }, // UP
];
// scissor: +th = toward the facing direction (screen-right pre-mirror)
const FARMER_SCISSOR_FRAMES = [
    { l: { th:  0.60, lift: 0   }, r: { th: -0.60, lift: 0   }, body:  0.0 }, // CONTACT (stride)
    { l: { th:  0.38, lift: 0   }, r: { th: -0.38, lift: 0   }, body:  0.7 }, // DOWN
    { l: { th:  0.05, lift: 0   }, r: { th:  0.05, lift: 1.2 }, body:  0.2 }, // PASSING (R swings thru)
    { l: { th: -0.20, lift: 0   }, r: { th:  0.35, lift: 0.5 }, body: -0.9 }, // UP (R reaching fwd)
    { l: { th: -0.60, lift: 0   }, r: { th:  0.60, lift: 0   }, body:  0.0 }, // CONTACT (swapped)
    { l: { th: -0.38, lift: 0   }, r: { th:  0.38, lift: 0   }, body:  0.7 }, // DOWN
    { l: { th:  0.05, lift: 1.2 }, r: { th:  0.05, lift: 0   }, body:  0.2 }, // PASSING (L swings thru)
    { l: { th:  0.35, lift: 0.5 }, r: { th: -0.20, lift: 0   }, body: -0.9 }, // UP (L reaching fwd)
];
const FARMER_REST = { l: { th: -0.10, lift: 0 }, r: { th: 0.10, lift: 0 }, body: 0 };

// per-facing rig: which leg style, where the hips sit
const FARMER_RIGS = {
    front:   { frames: FARMER_SPLAY_FRAMES,   hipL: 6.5, hipR: 9.5 },
    back:    { frames: FARMER_SPLAY_FRAMES,   hipL: 6.5, hipR: 9.5 },
    side:    { frames: FARMER_SCISSOR_FRAMES, hipL: 7.6, hipR: 8.6 }, // profile: hips overlap
    front34: { frames: FARMER_SCISSOR_FRAMES, hipL: 6.8, hipR: 9.2 },
    back34:  { frames: FARMER_SCISSOR_FRAMES, hipL: 6.8, hipR: 9.2 },
};

// fill a sprite-space rect (cols/rows may be fractional) into screen space
function fillSpritePx(ox, oy, u, col, row, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(ox + col * u), Math.round(oy + row * u),
                 Math.ceil(w * u), Math.ceil(h * u));
}

// One leg = an overalls-blue limb pivoting at the hip. `th` is signed radians
// from straight-down. `lift` bends the knee: shortens the leg, raising the boot.
function drawFarmerLeg(ox, oy, u, hipCol, hipRow, th, lift) {
    const len = CFG.legLen - lift;
    const footCol = hipCol + len * Math.sin(th);
    const footRow = hipRow + len * Math.cos(th);

    ctx.strokeStyle = FARMER_PAL.o;
    ctx.lineWidth = CFG.legThick * u;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(ox + hipCol * u, oy + hipRow * u);
    ctx.lineTo(ox + footCol * u, oy + footRow * u);
    ctx.stroke();

    // boot + dark sole (axis-aligned block keeps the chunky look)
    fillSpritePx(ox, oy, u, footCol - 1.5, footRow - 0.8, 3, 1.6, FARMER_PAL.b);
    fillSpritePx(ox, oy, u, footCol - 1.5, footRow + 0.8, 3, 0.6, FARMER_PAL.x);
}

function drawFarmer() {
    const u = FARMER_PX * zoom;
    const cxs = sx(farmer.x);
    const cys = sy(farmer.y);

    const rig  = FARMER_RIGS[farmer.facing];
    const body = FARMER_BODIES[farmer.facing];

    // current discrete frame (8 per cycle); walkAmt blends toward rest on stop
    const f = rig.frames[Math.floor(farmer.walkPhase / (Math.PI / 4)) % 8];
    const a = farmer.walkAmt, rest = FARMER_REST;
    const thL   = rest.l.th + (f.l.th - rest.l.th) * a;
    const thR   = rest.r.th + (f.r.th - rest.r.th) * a;
    const liftL = f.l.lift * a;
    const liftR = f.r.lift * a;
    const bodyY = f.body * a;

    const baseOy = cys - (FARMER_H * u) / 2; // grounded reference (for the shadow)
    const ox = cxs - (FARMER_W * u) / 2;
    const oy = baseOy + bodyY * u;           // down/up frames sink/raise the whole guy

    // contact shadow: swells when compressed, tightens at the top of the step
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cxs, baseOy + 17.3 * u, (5.2 + bodyY * 0.6) * u, (1.5 + bodyY * 0.2) * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    if (farmer.mirror) { // left-facing = right-facing art flipped about his centre
        ctx.translate(cxs, 0);
        ctx.scale(-1, 1);
        ctx.translate(-cxs, 0);
    }

    // legs first so the overalls hem (body) overlaps their tops
    drawFarmerLeg(ox, oy, u, rig.hipL, 13, thL, liftL);
    drawFarmerLeg(ox, oy, u, rig.hipR, 13, thR, liftR);

    // body on top, crisp pixels
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(body, Math.round(ox), Math.round(oy),
                  Math.round(FARMER_W * u), Math.round(body.height * u));
    ctx.imageSmoothingEnabled = prev;
    ctx.restore();
}


// ================================ UPDATE ===================================
function update(dt) {
    // input -> direction vector (WASD or arrows), diagonal-normalised
    let tx = 0, ty = 0;
    if (keys.ArrowLeft  || keys.KeyA) tx -= 1;
    if (keys.ArrowRight || keys.KeyD) tx += 1;
    if (keys.ArrowUp    || keys.KeyW) ty -= 1;
    if (keys.ArrowDown  || keys.KeyS) ty += 1;
    if (tx && ty) { tx *= 0.70710678; ty *= 0.70710678; }

    if (farmerMode) updateFarmerMove(dt, tx, ty);
    else            updateFreeCam(dt, tx, ty);

    updateWalkAnim(dt);

    // mouse world position, once per frame, for anything that wants it
    mouse.wx = wx(mouse.x);
    mouse.wy = wy(mouse.y);

    const held = inventory.hotBar[inventory.selected];
    if (held) held.update();

    // crops grow on their own, one stage per CFG.growTime seconds
    const now = performance.now();
    for (const tile of worldTiles.values()) {
        if (tile.kind === 'crop' && tile.stage < 3 && now - tile.t > CFG.growTime * 1000) {
            tile.stage++;
            tile.t = now;
        }
    }

    // wandering off closes the stall panel
    if (shopOpen && !nearShop()) shopOpen = false;
}

// Free mode: the camera itself roams; the farmer stands still.
function updateFreeCam(dt, tx, ty) {
    const speed = CFG.camSpeed * (shiftHeld ? CFG.camBoost : 1);
    const t = Math.min(1, dt * CFG.camEase);
    cam.vx += (tx * speed - cam.vx) * t;
    cam.vy += (ty * speed - cam.vy) * t;
    cam.x += cam.vx * dt;
    cam.y += cam.vy * dt;
    farmer.vx = 0; farmer.vy = 0;
}

// Farmer mode: input walks the farmer; the camera eases to keep him centred
// (that ease also produces the lerp-in when you first press Tab).
function updateFarmerMove(dt, tx, ty) {
    const speed = CFG.farmerSpeed * (shiftHeld ? CFG.farmerRun : 1);
    const t = Math.min(1, dt * CFG.camEase);
    farmer.vx += (tx * speed - farmer.vx) * t;
    farmer.vy += (ty * speed - farmer.vy) * t;
    farmer.x += farmer.vx * dt;
    farmer.y += farmer.vy * dt;

    const f = Math.min(1, dt * CFG.camFollow);
    cam.x += (farmer.x - (canvas.width  / 2) / zoom - cam.x) * f;
    cam.y += (farmer.y - (canvas.height / 2) / zoom - cam.y) * f;
    cam.vx = 0; cam.vy = 0; // don't carry free-cam drift into farmer mode
}

// Leg cycle cadence scales with actual speed (running speeds the legs), and
// facing tracks the direction of travel — sticky when he stops.
function updateWalkAnim(dt) {
    const speed = Math.hypot(farmer.vx, farmer.vy);
    const moving = speed > 8;
    if (moving) farmer.walkPhase += dt * speed * CFG.walkCadence;
    farmer.walkAmt += ((moving ? 1 : 0) - farmer.walkAmt) * Math.min(1, dt * CFG.walkFade);
    if (!moving && farmer.walkAmt < 0.02) { farmer.walkAmt = 0; farmer.walkPhase = 0; }

    if (moving) {
        const D = 0.70710678; // diagonal component
        const oct = Math.round(Math.atan2(farmer.vy, farmer.vx) / (Math.PI / 4)); // -4..4, 0 = east
        switch (oct) {
            case  0: farmer.facing = 'side';    farmer.mirror = false; farmer.dirX =  1; farmer.dirY =  0; break; // right
            case  1: farmer.facing = 'front34'; farmer.mirror = false; farmer.dirX =  D; farmer.dirY =  D; break; // down-right
            case  2: farmer.facing = 'front';   farmer.mirror = false; farmer.dirX =  0; farmer.dirY =  1; break; // down
            case  3: farmer.facing = 'front34'; farmer.mirror = true;  farmer.dirX = -D; farmer.dirY =  D; break; // down-left
            case  4:
            case -4: farmer.facing = 'side';    farmer.mirror = true;  farmer.dirX = -1; farmer.dirY =  0; break; // left
            case -3: farmer.facing = 'back34';  farmer.mirror = true;  farmer.dirX = -D; farmer.dirY = -D; break; // up-left
            case -2: farmer.facing = 'back';    farmer.mirror = false; farmer.dirX =  0; farmer.dirY = -1; break; // up
            case -1: farmer.facing = 'back34';  farmer.mirror = false; farmer.dirX =  D; farmer.dirY = -D; break; // up-right
        }
    }
}


// ================================ RENDER ===================================
let vignette = null; // cached — rebuilding a gradient every frame is wasted work

function buildVignette() {
    vignette = document.createElement('canvas');
    vignette.width  = canvas.width;
    vignette.height = canvas.height;
    const c = vignette.getContext('2d');
    const g = c.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.35,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.8
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    c.fillStyle = g;
    c.fillRect(0, 0, canvas.width, canvas.height);
}

function draw() {
    const T = CFG.tile;
    const startCol = Math.floor(cam.x / T);
    const startRow = Math.floor(cam.y / T);
    const cols = Math.ceil(canvas.width  / zoom / T) + 2;
    const rows = Math.ceil(canvas.height / zoom / T) + 2;
    const size = Math.ceil(T * zoom) + 1; // +1 overlaps seams

    // ground
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const wc = startCol + c, wr = startRow + r;
            const px = Math.floor(sx(wc * T));
            const py = Math.floor(sy(wr * T));

            ctx.drawImage(groundTiles[(hash2(wc, wr) * CFG.tileVariants) | 0], px, py, size, size);

            // coarse damp patches spanning a few cells for large-scale variety
            if (hash2((wc >> 2) * 31 + 7, (wr >> 2) * 31 + 3) < 0.16) {
                ctx.fillStyle = 'rgba(22,13,6,0.16)';
                ctx.fillRect(px, py, size, size);
            }

            // per-tile state (tilled/planted/... — future)
            const tile = getTile(wc, wr);
            if (tile) drawTileState(tile, px, py, size);
        }
    }

    // painter's order: whoever is further south draws in front
    const farmerFeet = farmer.y + (FARMER_H * FARMER_PX) / 2;
    if (farmerFeet < SHOP.baseY) { drawFarmer(); drawStall(); }
    else                         { drawStall(); drawFarmer(); }

    ctx.drawImage(vignette, 0, 0);

    // selected item's world visual — only in the mode that wields it
    // (free tools with the eyes, farmer tools in the farmer's hands)
    const held = inventory.hotBar[inventory.selected];
    if (held && held.farmerTool === farmerMode && !shopOpen) held.draw();

    // "press E" prompt floating over the stall when in range
    if (nearShop() && !shopOpen) {
        const px = sx(SHOP.x + SHOP.w / 2), py = sy(SHOP.y) - 14 * zoom;
        ctx.save();
        ctx.font = `600 ${Math.max(11, 13 * zoom)}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = 'E — Seed Shop';
        const tw = ctx.measureText(label).width;
        roundRectPath(px - tw / 2 - 10, py - 12, tw + 20, 24, 12);
        ctx.fillStyle = 'rgba(24, 17, 10, 0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(240, 200, 110, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 230, 170, 0.95)';
        ctx.fillText(label, px, py + 1);
        ctx.restore();
    }

    coordsEl.textContent = `${Math.round(cam.x)}, ${Math.round(cam.y)}`;
    zoomEl.textContent = `× ${zoom.toFixed(2)}`;
    coinsEl.textContent = String(inventory.coins);
    coinsEl.style.color = performance.now() < coinFlash
        ? 'rgba(255, 110, 90, 0.95)' : 'rgba(255, 214, 110, 0.95)';

    drawHotbar();
    if (shopOpen) drawShopPanel();
}


// ================================== UI =====================================
function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawHotbar() {
    const S = CFG.slot, GAP = CFG.slotGap;
    const n = inventory.hotBar.length;
    const totalW = n * S + (n - 1) * GAP;
    const startX = (canvas.width - totalW) / 2;
    const y = canvas.height - S - CFG.hotbarPad;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let i = 0; i < n; i++) {
        const x = startX + i * (S + GAP);
        const selected = i === inventory.selected;
        const sy2 = y - (selected ? 6 : 0); // selected slot lifts slightly

        // slot body (selected one glows)
        roundRectPath(x, sy2, S, S, 9);
        ctx.fillStyle = selected ? 'rgba(60, 44, 22, 0.92)' : 'rgba(28, 20, 12, 0.72)';
        if (selected) {
            ctx.shadowColor = 'rgba(255, 200, 90, 0.9)';
            ctx.shadowBlur = 22;
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        // border — bright warm ring when selected
        roundRectPath(x + 1, sy2 + 1, S - 2, S - 2, 8);
        ctx.lineWidth = selected ? 2.5 : 1.5;
        ctx.strokeStyle = selected ? 'rgba(255, 216, 120, 0.95)' : 'rgba(120, 96, 64, 0.6)';
        ctx.stroke();

        // each item paints its own icon in the slot
        const item = inventory.hotBar[i];
        if (item) item.drawIcon(x + S / 2, sy2 + S / 2, S);

        // slot number (1-9)
        ctx.font = '11px "Consolas", monospace';
        ctx.fillStyle = selected ? 'rgba(255, 230, 170, 0.95)' : 'rgba(200, 180, 150, 0.5)';
        ctx.fillText(String(i + 1), x + 5, sy2 + 4);

        // count badge for stackable items (seeds etc)
        if (item && typeof item.count === 'number') {
            ctx.font = 'bold 12px "Consolas", monospace';
            ctx.textAlign = 'right';
            ctx.fillStyle = item.count > 0 ? 'rgba(255, 240, 200, 0.95)' : 'rgba(255, 255, 255, 0.3)';
            ctx.fillText(String(item.count), x + S - 5, sy2 + S - 15);
            ctx.textAlign = 'left';
        }
    }

    ctx.restore();
}

// ---- Seed shop panel (open with E at the stall) ----
const shopRowRects = []; // rebuilt every draw; hit-tested by shopClick

function drawShopPanel() {
    const W = 380, ROW = 58;
    const H = 92 + SHOP_STOCK.length * (ROW + 8);
    const x = (canvas.width - W) / 2;
    const y = canvas.height * 0.24;
    shopRowRects.length = 0;

    ctx.save();

    // dim the world a touch behind the panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // panel
    roundRectPath(x, y, W, H, 14);
    ctx.fillStyle = 'rgba(26, 18, 11, 0.95)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(240, 200, 110, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // title + purse
    ctx.textBaseline = 'middle';
    ctx.font = '600 18px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 230, 170, 0.95)';
    ctx.fillText('Seed Shop', x + 18, y + 26);
    ctx.textAlign = 'right';
    ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = performance.now() < coinFlash
        ? 'rgba(255, 110, 90, 0.95)' : 'rgba(255, 214, 110, 0.9)';
    ctx.fillText(`${inventory.coins} coins`, x + W - 18, y + 26);

    // stock rows
    for (let i = 0; i < SHOP_STOCK.length; i++) {
        const st = SHOP_STOCK[i];
        const ry = y + 50 + i * (ROW + 8);
        const rx = x + 12, rw = W - 24;
        const hover = mouse.x >= rx && mouse.x <= rx + rw && mouse.y >= ry && mouse.y <= ry + ROW;
        shopRowRects.push({ x: rx, y: ry, w: rw, h: ROW, entry: st });

        roundRectPath(rx, ry, rw, ROW, 10);
        ctx.fillStyle = hover ? 'rgba(255, 220, 140, 0.12)' : 'rgba(255, 255, 255, 0.045)';
        ctx.fill();
        ctx.strokeStyle = hover ? 'rgba(255, 216, 120, 0.6)' : 'rgba(120, 96, 64, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        st.item.drawIcon(rx + 28, ry + ROW / 2, 44);

        ctx.textAlign = 'left';
        ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(245, 235, 215, 0.95)';
        ctx.fillText(st.name, rx + 54, ry + 20);
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(200, 185, 160, 0.6)';
        ctx.fillText(`you have ${st.item.count}`, rx + 54, ry + 39);

        ctx.textAlign = 'right';
        ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 214, 110, 0.95)';
        ctx.fillText(`${st.cost}c`, rx + rw - 16, ry + ROW / 2);
    }

    // hint
    ctx.textAlign = 'center';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200, 185, 160, 0.55)';
    ctx.fillText('click to buy   ·   E to close', x + W / 2, y + H - 18);

    ctx.restore();
}

function shopClick(px, py) {
    for (const r of shopRowRects) {
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
            buyStock(r.entry);
            return;
        }
    }
}


// ================================= BOOT ====================================
resize();
buildGroundTiles();
buildTilledTiles();
buildCropTiles();
for (const [c, r] of SHOP.tiles) setTile(c, r, { kind: 'shop' }); // stall ground is off-limits
setMode(false);

// start with the farmer centred on screen
cam.x = farmer.x - canvas.width / 2;
cam.y = farmer.y - canvas.height / 2;

let then = performance.now();
function gameLoop(now) {
    let dt = (now - then) / 1000;
    then = now;
    if (dt > 0.05) dt = 0.05; // clamp after tab-outs

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
