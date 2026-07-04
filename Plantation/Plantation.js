const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const coordsEl = document.getElementById('coords');
const zoomEl = document.getElementById('zoomlabel');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();

let mouse = { x: 0, y: 0 };

window.addEventListener('resize', resize);
window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});
window.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // left click
        const held = inventory.hotBar[inventory.selectedHotBar];
        if(held) held.use();
    }
});

//---- Classes ----
class Farmer {
    constructor(){
        this.x = 0;
        this.y = 0;
    }
}

class Inventory {
    constructor(){
        this.items = {};
        this.hotBar = [teleporter, null, null, null, null, null, null, null, null];
        this.selectedHotBar = 0;
    }
}

class Item{
    update() {}
    use() {}
    draw() {}                     // world-space visual while selected
    drawIcon(cx, cy, size) {}     // icon inside its hotbar slot (centre cx,cy)
}

class Teleporter extends Item{
    constructor(){super(); this.x = 0; this.y = 0;}
    update() {
        // follow the cursor in WORLD space, so use() drops the farmer here correctly
        this.x = cam.x + mouse.x / zoom;
        this.y = cam.y + mouse.y / zoom;
    }

    use(){farmer.x = this.x; farmer.y = this.y;}
}

const teleporter = new Teleporter();
let items = [teleporter];
const inventory = new Inventory();
const farmer = new Farmer();


// ---- Loop ----
let then = performance.now();
function gameLoop(now) {
    let dt = (now - then) / 1000;
    then = now;
    if (dt > 0.05) dt = 0.05; // clamp after tab-outs

    updateCam(dt);
    selectHotBar();
    updateSelectedItem();

    draw();

    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

function selectHotBar() {
    if(keys['Digit1']) inventory.selectedHotBar = 0;
    if(keys['Digit2']) inventory.selectedHotBar = 1;
    if(keys['Digit3']) inventory.selectedHotBar = 2;
    if(keys['Digit4']) inventory.selectedHotBar = 3;
    if(keys['Digit5']) inventory.selectedHotBar = 4;
    if(keys['Digit6']) inventory.selectedHotBar = 5;
    if(keys['Digit7']) inventory.selectedHotBar = 6;
    if(keys['Digit8']) inventory.selectedHotBar = 7;
    if(keys['Digit9']) inventory.selectedHotBar = 8;
}

function updateSelectedItem() {
    const held = inventory.hotBar[inventory.selectedHotBar];
    if(held) held.update();
}


// ============================================================
//  ITEM VISUALS
//  draw() = world visual while the item is selected.
//  drawIcon(cx, cy, size) = the icon inside its hotbar slot.
//  Defined on each class's prototype so the class bodies up top
//  stay focused on logic. `this` is the item instance, exactly
//  like a normal method. Add a new item's visuals under its own
//  header here — no need to touch the class.
// ============================================================

// ---- Teleporter: glowing sci-fi teleport reticle (world) ----
Teleporter.prototype.draw = function () {
    const sx = (this.x - cam.x) * zoom; // world -> screen (sits under the cursor)
    const sy = (this.y - cam.y) * zoom;
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    const R = (24 + pulse * 4) * zoom;   // radius breathes, and scales with zoom

    ctx.save();
    ctx.translate(sx, sy);
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

    // outer ring
    ctx.strokeStyle = 'rgba(140, 230, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();

    // inner ring
    ctx.strokeStyle = 'rgba(205, 245, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // crosshair ticks
    ctx.beginPath();
    for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
        const ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(ca * R * 0.75, sa * R * 0.75);
        ctx.lineTo(ca * R * 1.2, sa * R * 1.2);
    }
    ctx.stroke();

    // core
    ctx.fillStyle = 'rgba(235, 250, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
};







// ---- Claude's portion ----  


// ---- Camera (top-left of the viewport, in world space) ----
// Pressing an arrow moves the "floating eyes" that way, so the ground
// scrolls the opposite direction underneath.
const cam = { x: 0, y: 0, vx: 0, vy: 0 };
const MAX_SPEED = 560;   // px / second
const EASE = 9;          // higher = snappier start/stop
const SHIFT_BOOST = 2.1; // hold Shift to sweep across the field faster
let shiftHeld = false;

// Start with the farmer (world 0,0) centered so he's on-screen at load.
cam.x = farmer.x - canvas.width / 2;
cam.y = farmer.y - canvas.height / 2;

// ---- Zoom (mouse wheel) ----
let zoom = 1;
const MIN_ZOOM = 0.40;   // pulled back — survey the whole field
const MAX_ZOOM = 1.75;    // pushed in — inspect a single plot
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    if (e.shiftKey || e.ctrlKey) {
        // Shift/Ctrl + scroll — zoom toward the cursor
        const worldX = cam.x + e.clientX / zoom;
        const worldY = cam.y + e.clientY / zoom;
        // exponential step feels smooth across trackpads and mice
        zoom = clamp(zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
        // re-anchor so that same world point stays under the cursor
        cam.x = worldX - e.clientX / zoom;
        cam.y = worldY - e.clientY / zoom;
    } else {
        // plain scroll — cycle the hotbar selection
        const slots = inventory.hotBar.length;
        const dir = e.deltaY > 0 ? 1 : -1;
        inventory.selectedHotBar = (inventory.selectedHotBar + dir + slots) % slots;
    }
}, { passive: false });

const keys = Object.create(null);
// Key off e.code (physical key) so Shift's uppercasing of e.key can't strand
// a held direction — otherwise 'w' down / 'W' up never cancel each other.
const PAN_KEYS = ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'];
window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') shiftHeld = true;
    keys[e.code] = true;                       // single source of truth for held keys
    if (PAN_KEYS.includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') shiftHeld = false;
    keys[e.code] = false;
});
// Don't leave the camera drifting if focus is lost mid-press.
window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    shiftHeld = false;
});

// ---- Deterministic hash so ground detail stays pinned to the soil ----
function hash2(x, y) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263;
    h = (h ^ (h >>> 13)) >>> 0;
    h = (h * 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---- Pre-baked dirt tiles ----
// A handful of flat soil variants, each with baked-in grit/pebbles. We pick a
// variant per world cell from the hash, so the field never flickers or slides.
const TILE = 64;
const VARIANTS = 16;
const tiles = [];

function buildTiles() {
    tiles.length = 0;
    for (let i = 0; i < VARIANTS; i++) {
        const off = document.createElement('canvas');
        off.width = TILE;
        off.height = TILE;
        const c = off.getContext('2d');

        // seeded PRNG for this variant
        let s = (i * 2654435761 + 12345) >>> 0;
        const rnd = () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };

        // base soil colour, gently varied per variant
        const tint = 0.9 + rnd() * 0.22;
        const r = Math.floor(104 * tint);
        const g = Math.floor(72 * tint);
        const b = Math.floor(46 * tint);
        c.fillStyle = `rgb(${r},${g},${b})`;
        c.fillRect(0, 0, TILE, TILE);

        // soft mottling blobs so the flat fill reads as earth, not paint
        for (let k = 0; k < 10; k++) {
            const px = rnd() * TILE, py = rnd() * TILE;
            const rad = 6 + rnd() * 16;
            const darker = rnd() < 0.5;
            const a = 0.05 + rnd() * 0.08;
            c.fillStyle = darker
                ? `rgba(40,24,12,${a})`
                : `rgba(170,140,100,${a})`;
            c.beginPath();
            c.arc(px, py, rad, 0, Math.PI * 2);
            c.fill();
        }

        // grit: pebbles and little clods
        const grit = 26 + Math.floor(rnd() * 18);
        for (let k = 0; k < grit; k++) {
            const px = rnd() * TILE, py = rnd() * TILE;
            const rad = 0.5 + rnd() * 1.7;
            const roll = rnd();
            if (roll < 0.55) {
                c.fillStyle = `rgba(28,16,8,${0.22 + rnd() * 0.28})`;      // dark speck
            } else if (roll < 0.85) {
                c.fillStyle = `rgba(190,160,120,${0.16 + rnd() * 0.24})`;  // pale pebble
            } else {
                c.fillStyle = `rgba(120,150,90,${0.10 + rnd() * 0.14})`;   // stray bit of green
            }
            c.beginPath();
            c.arc(px, py, rad, 0, Math.PI * 2);
            c.fill();
        }

        tiles.push(off);
    }
}
buildTiles();

// ---- Pixel-art farmer ----
// A tiny front-facing dude: straw hat, blue overalls, boots. Baked to a
// 16x19 offscreen canvas at 1px per cell, then drawn scaled with smoothing
// off so the pixels stay crisp and blocky at any zoom.
const FARMER_PX = 3; // world px per sprite pixel
const farmerSprite = buildFarmerSprite();

function buildFarmerSprite() {
    const map = [
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
        '...xoooooooox...',
        '...xoooooooox...',
        '...xbbbxxbbbx...',
        '...xbbbxxbbbx...',
        '................',
    ];
    const pal = {
        x: '#241a12', // outline
        h: '#eccb73', // straw hat, light
        g: '#caa347', // straw hat brim, dark
        s: '#f2c396', // skin
        k: '#d89a68', // skin shadow (jaw/mouth)
        e: '#241a12', // eyes
        r: '#c34733', // shirt (red)
        o: '#35688f', // overalls (blue)
        d: '#244a66', // overalls dark (pockets/legs seam)
        b: '#5a3b22', // boots
    };
    const W = 16, H = map.length;
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
}

function drawFarmer() {
    const W = farmerSprite.width, H = farmerSprite.height;
    const fw = W * FARMER_PX * zoom;
    const fh = H * FARMER_PX * zoom;
    const cxs = (farmer.x - cam.x) * zoom; // screen centre x
    const cys = (farmer.y - cam.y) * zoom; // screen centre y

    // soft contact shadow to ground him
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(cxs, cys + fh * 0.42, fw * 0.34, fh * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false; // keep the pixels crisp
    ctx.drawImage(
        farmerSprite,
        Math.round(cxs - fw / 2),
        Math.round(cys - fh / 2),
        Math.round(fw),
        Math.round(fh)
    );
    ctx.imageSmoothingEnabled = prevSmooth;
}

// ---- Update ----
function updateCam(dt) {
    let tx = 0, ty = 0;
    if (keys.ArrowLeft || keys.KeyA) tx -= 1;
    if (keys.ArrowRight || keys.KeyD) tx += 1;
    if (keys.ArrowUp || keys.KeyW) ty -= 1;
    if (keys.ArrowDown || keys.KeyS) ty += 1;
    if (tx && ty) { tx *= 0.70710678; ty *= 0.70710678; } // no faster diagonally

    const speed = MAX_SPEED * (shiftHeld ? SHIFT_BOOST : 1);
    const targetVX = tx * speed;
    const targetVY = ty * speed;
    const t = Math.min(1, dt * EASE);
    cam.vx += (targetVX - cam.vx) * t;
    cam.vy += (targetVY - cam.vy) * t;
    cam.x += cam.vx * dt;
    cam.y += cam.vy * dt;
}

// ---- Render ----
function draw() {
    // world span visible on screen grows as we zoom out
    const viewW = canvas.width / zoom;
    const viewH = canvas.height / zoom;
    const startCol = Math.floor(cam.x / TILE);
    const startRow = Math.floor(cam.y / TILE);
    const cols = Math.ceil(viewW / TILE) + 2;
    const rows = Math.ceil(viewH / TILE) + 2;
    const drawSize = Math.ceil(TILE * zoom) + 1; // +1 overlaps seams

    for (let ry = 0; ry < rows; ry++) {
        for (let cx = 0; cx < cols; cx++) {
            const wc = startCol + cx;   // world cell col
            const wr = startRow + ry;   // world cell row
            const sx = Math.floor((wc * TILE - cam.x) * zoom);
            const sy = Math.floor((wr * TILE - cam.y) * zoom);

            const v = (hash2(wc, wr) * VARIANTS) | 0;
            ctx.drawImage(tiles[v], sx, sy, drawSize, drawSize);

            // coarse damp patches spanning a few cells for large-scale variety
            const m = hash2((wc >> 2) * 31 + 7, (wr >> 2) * 31 + 3);
            if (m < 0.16) {
                ctx.fillStyle = 'rgba(22,13,6,0.16)';
                ctx.fillRect(sx, sy, drawSize, drawSize);
            }
        }
    }

    drawFarmer();

    // gentle vignette for depth
    const g = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.35,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.8
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // the selected hotbar item draws its world-space visual on top (e.g. the
    // teleport reticle). update() already ran this frame, so its pos is current.
    const held = inventory.hotBar[inventory.selectedHotBar];
    if (held) held.draw();

    coordsEl.textContent = `${Math.round(cam.x)}, ${Math.round(cam.y)}`;
    zoomEl.textContent = `× ${zoom.toFixed(2)}`;

    drawHotbar();
}

// ---- Hotbar (screen-space UI) ----
const SLOT = 58;      // slot size in px
const SLOT_GAP = 8;   // gap between slots
const HOTBAR_PAD = 22;// distance from the bottom of the screen

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
    const slots = inventory.hotBar.length;
    const totalW = slots * SLOT + (slots - 1) * SLOT_GAP;
    const startX = (canvas.width - totalW) / 2;
    const y = canvas.height - SLOT - HOTBAR_PAD;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let i = 0; i < slots; i++) {
        const x = startX + i * (SLOT + SLOT_GAP);
        const selected = i === inventory.selectedHotBar;

        // selected slot lifts slightly and glows
        const lift = selected ? 6 : 0;
        const sy = y - lift;

        // slot body
        roundRectPath(x, sy, SLOT, SLOT, 9);
        ctx.fillStyle = selected
            ? 'rgba(60, 44, 22, 0.92)'
            : 'rgba(28, 20, 12, 0.72)';
        if (selected) {
            ctx.shadowColor = 'rgba(255, 200, 90, 0.9)';
            ctx.shadowBlur = 22;
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        // border — bright warm glow ring when selected
        roundRectPath(x + 1, sy + 1, SLOT - 2, SLOT - 2, 8);
        ctx.lineWidth = selected ? 2.5 : 1.5;
        ctx.strokeStyle = selected
            ? 'rgba(255, 216, 120, 0.95)'
            : 'rgba(120, 96, 64, 0.6)';
        ctx.stroke();

        // each item paints its own icon in the slot
        const item = inventory.hotBar[i];
        if (item && item.drawIcon) {
            item.drawIcon(x + SLOT / 2, sy + SLOT / 2, SLOT);
        }

        // slot number (1–9) in the top-left corner
        ctx.font = '11px "Consolas", monospace';
        ctx.fillStyle = selected
            ? 'rgba(255, 230, 170, 0.95)'
            : 'rgba(200, 180, 150, 0.5)';
        ctx.fillText(String(i + 1), x + 5, sy + 4);
    }

    ctx.restore();
}
