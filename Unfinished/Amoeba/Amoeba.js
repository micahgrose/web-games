let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;

document.addEventListener('mousemove', e => {
	mouseX = e.clientX;
	mouseY = e.clientY;
});

const c = document.getElementById('c');
const ctx = c.getContext('2d');
c.width = window.innerWidth;
c.height = window.innerHeight;

const WORLD_W = 4000;
const WORLD_H = 4000;
const BASE_SIZE = 10;
const MAX_FOOD = 500;
const MAX_BOTS = 10;

const BOT_NAMES = [
	'Globulus','Blobsworth','Oozebert','Slimon','Gloopus',
	'Muckling','Vacuole','Cytoplasm','Nucleon','Flagellum',
	'Amoebius','Rhizopod','Plasmodex','Goobert','Dribbles'
];

function calcSpeed(size) {
	return Math.pow(BASE_SIZE / size, 0.45) * 3;
}

function randColor() {
	return `hsl(${Math.floor(Math.random() * 360)}, 70%, 55%)`;
}

function randName() {
	return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}

class Cell {
	constructor() {
		this.size  = BASE_SIZE;
		this.speed = calcSpeed(BASE_SIZE);
		this.x     = WORLD_W / 2;
		this.y     = WORLD_H / 2;
		this.color = randColor();
		this.velX  = 0;
		this.velY  = 0;
		this.phase = Math.random() * Math.PI * 2;
	}
}

class Bot {
	constructor() {
		this.size  = BASE_SIZE;
		this.speed = calcSpeed(BASE_SIZE);
		this.x     = Math.random() * WORLD_W;
		this.y     = Math.random() * WORLD_H;
		this.goalX = Math.random() * WORLD_W;
		this.goalY = Math.random() * WORLD_H;
		this.color = randColor();
		this.name  = randName();
		this.velX  = 0;
		this.velY  = 0;
		this.phase = Math.random() * Math.PI * 2;
	}
}

class Food {
	constructor() {
		this.x     = Math.random() * WORLD_W;
		this.y     = Math.random() * WORLD_H;
		this.size  = Math.random() * 3 + 1;
		this.color = `rgb(${Math.floor(Math.random()*101)+155},${Math.floor(Math.random()*101)+155},${Math.floor(Math.random()*101)+155})`;
	}
}

const food = [];
const bots = [];
const cell = new Cell();

for (let i = 0; i < 5; i++) bots.push(new Bot());
for (let i = 0; i < 200; i++) food.push(new Food());

let frames    = 0;
let botFrames = 0;
let time      = 0;
let camScale  = 1;

function loop() {
	time++;
	frames++;
	botFrames++;

	if (frames >= 25 && food.length < MAX_FOOD) {
		frames = 0;
		food.push(new Food());
	}

	if (botFrames >= 100 && bots.length < MAX_BOTS) {
		bots.push(new Bot());
		botFrames = 0;
	}

	moveCell();
	moveBots();
	eatFood();
	eatBots();

	camScale = Math.max(0.15, Math.min(1, Math.pow(BASE_SIZE / cell.size, 0.5)));

	draw();
	requestAnimationFrame(loop);
}

function moveCell() {
	let dx   = mouseX - c.width / 2;
	let dy   = mouseY - c.height / 2;
	let dist = Math.hypot(dx, dy);
	if (dist < 1) { cell.velX = 0; cell.velY = 0; return; }
	cell.velX = (dx / dist) * cell.speed;
	cell.velY = (dy / dist) * cell.speed;
	cell.x = Math.max(0, Math.min(WORLD_W, cell.x + cell.velX));
	cell.y = Math.max(0, Math.min(WORLD_H, cell.y + cell.velY));
}

function updateBotGoal(b) {
	let bestScore = -Infinity;
	let bestX = b.goalX;
	let bestY = b.goalY;

	for (let f of food) {
		let score = f.size / (Math.hypot(f.x - b.x, f.y - b.y) + 1);
		if (score > bestScore) { bestScore = score; bestX = f.x; bestY = f.y; }
	}

	for (let other of bots) {
		if (other === b || b.size < other.size * 1.1) continue;
		let score = other.size / (Math.hypot(other.x - b.x, other.y - b.y) + 1) * 3;
		if (score > bestScore) { bestScore = score; bestX = other.x; bestY = other.y; }
	}

	if (b.size >= cell.size * 1.1) {
		let score = cell.size / (Math.hypot(cell.x - b.x, cell.y - b.y) + 1) * 3;
		if (score > bestScore) { bestX = cell.x; bestY = cell.y; }
	}

	b.goalX = bestX;
	b.goalY = bestY;
}

function moveBots() {
	for (let b of bots) {
		updateBotGoal(b);
		let dx   = b.goalX - b.x;
		let dy   = b.goalY - b.y;
		let dist = Math.hypot(dx, dy);
		if (dist > b.speed) {
			b.velX = (dx / dist) * b.speed;
			b.velY = (dy / dist) * b.speed;
			b.x += b.velX;
			b.y += b.velY;
		} else {
			b.velX = 0;
			b.velY = 0;
			b.goalX = Math.random() * WORLD_W;
			b.goalY = Math.random() * WORLD_H;
		}
	}
}

function eatFood() {
	for (let i = food.length - 1; i >= 0; i--) {
		let f = food[i];
		if (Math.hypot(f.x - cell.x, f.y - cell.y) <= cell.size + f.size) {
			cell.size += f.size / 10;
			cell.speed = calcSpeed(cell.size);
			food.splice(i, 1);
			continue;
		}
		for (let j = 0; j < bots.length; j++) {
			let b = bots[j];
			if (Math.hypot(f.x - b.x, f.y - b.y) <= b.size + f.size) {
				b.size += f.size / 10;
				b.speed = calcSpeed(b.size);
				food.splice(i, 1);
				break;
			}
		}
	}
}

function eatBots() {
	for (let i = bots.length - 1; i >= 0; i--) {
		let b    = bots[i];
		let dist = Math.hypot(b.x - cell.x, b.y - cell.y);
		if (cell.size >= b.size * 1.1 && dist < cell.size) {
			cell.size += b.size * 0.5;
			cell.speed = calcSpeed(cell.size);
			bots.splice(i, 1);
			continue;
		}
		if (b.size >= cell.size * 1.1 && dist < b.size) {
			alert('You were eaten! Restarting...');
			cell.size  = BASE_SIZE;
			cell.speed = calcSpeed(BASE_SIZE);
			cell.x     = WORLD_W / 2;
			cell.y     = WORLD_H / 2;
			cell.velX  = 0;
			cell.velY  = 0;
			return;
		}
	}

	for (let i = bots.length - 1; i >= 0; i--) {
		for (let j = i - 1; j >= 0; j--) {
			let a    = bots[i];
			let b    = bots[j];
			let dist = Math.hypot(a.x - b.x, a.y - b.y);
			if (a.size >= b.size * 1.1 && dist < a.size) {
				a.size += b.size * 0.5;
				a.speed = calcSpeed(a.size);
				bots.splice(j, 1);
				i--;
			} else if (b.size >= a.size * 1.1 && dist < b.size) {
				b.size += a.size * 0.5;
				b.speed = calcSpeed(b.size);
				bots.splice(i, 1);
				break;
			}
		}
	}
}

// Draws an amoeba with pseudopod protrusions and organic wobble.
function drawAmoeba(x, y, radius, color, velX, velY, phase) {
	const N         = 24;
	const speed     = Math.hypot(velX, velY);
	const moveAngle = speed > 0.01 ? Math.atan2(velY, velX) : 0;
	const t         = time * 0.012;

	let pts = [];
	for (let i = 0; i < N; i++) {
		let a = (i / N) * Math.PI * 2;
		let r = radius;

		// Layered organic wobble
		r += Math.sin(a * 2 + t       + phase)        * radius * 0.10;
		r += Math.sin(a * 3 + t * 1.3 + phase * 0.7)  * radius * 0.08;
		r += Math.sin(a * 5 + t * 0.7 + phase * 1.5)  * radius * 0.05;

		// Pseudopod spikes — high power = sharp protrusion
		r += Math.pow(Math.max(0, Math.sin(a * 2 + t * 0.6  + phase)),        5) * radius * 0.65;
		r += Math.pow(Math.max(0, Math.sin(a * 2 + t * 0.45 + phase + 2.1)),  5) * radius * 0.55;
		r += Math.pow(Math.max(0, Math.sin(a * 2 + t * 0.35 + phase + 4.3)),  5) * radius * 0.45;

		// Stretch forward in movement direction
		if (speed > 0.1) {
			let align = Math.cos(a - moveAngle);
			r += Math.max(0, align) * Math.min(speed / 3, 1) * radius * 0.3;
		}

		pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
	}

	ctx.fillStyle = color;
	ctx.beginPath();
	let s = { x: (pts[N - 1].x + pts[0].x) / 2, y: (pts[N - 1].y + pts[0].y) / 2 };
	ctx.moveTo(s.x, s.y);
	for (let i = 0; i < N; i++) {
		let p    = pts[i];
		let next = pts[(i + 1) % N];
		ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
	}
	ctx.closePath();
	ctx.fill();
}

function drawLabel(x, y, radius, text) {
	let fontSize = Math.max(8, Math.min(radius * 0.65, 20));
	ctx.fillStyle    = 'white';
	ctx.font         = `bold ${fontSize}px sans-serif`;
	ctx.textAlign    = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, x, y);
}

function draw() {
	ctx.clearRect(0, 0, c.width, c.height);

	ctx.save();
	ctx.translate(c.width / 2, c.height / 2);
	ctx.scale(camScale, camScale);
	ctx.translate(-cell.x, -cell.y);

	// Grid
	ctx.strokeStyle = '#111';
	ctx.lineWidth   = 1;
	for (let x = 0; x <= WORLD_W; x += 100) {
		ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke();
	}
	for (let y = 0; y <= WORLD_H; y += 100) {
		ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke();
	}

	// Arena border
	ctx.strokeStyle = '#c0394b';
	ctx.lineWidth   = 8;
	ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

	// Food
	for (let f of food) {
		ctx.fillStyle = f.color;
		ctx.beginPath();
		ctx.arc(f.x, f.y, f.size, 0, 2 * Math.PI);
		ctx.fill();
	}

	// Bots
	for (let b of bots) {
		drawAmoeba(b.x, b.y, b.size, b.color, b.velX, b.velY, b.phase);
		drawLabel(b.x, b.y, b.size, b.name);
	}

	// Player
	drawAmoeba(cell.x, cell.y, cell.size, cell.color, cell.velX, cell.velY, cell.phase);
	drawLabel(cell.x, cell.y, cell.size, '(you)');

	ctx.restore();
}

requestAnimationFrame(loop);
