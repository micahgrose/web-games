let mouseX = 0;
let mouseY = 0;

document.addEventListener('mousemove', e => {
	mouseX = e.clientX;
	mouseY = e.clientY;
});

const c = document.getElementById('c');
const ctx = c.getContext('2d');
c.width = window.innerWidth;
c.height = window.innerHeight;

function calcSpeed(size) {
	return Math.pow(10 / size, 0.15) * 2;
}

class Cell {
	constructor() {
		this.size = 10;
		this.speed = 2;
		this.x = window.innerWidth / 2;
		this.y = window.innerHeight / 2;
	}
}

class Bot {
	constructor() {
		this.size = 10;
		this.speed = 2;
		this.x = Math.random() * window.innerWidth;
		this.y = Math.random() * window.innerHeight;
		this.goalX = Math.random() * window.innerWidth;
		this.goalY = Math.random() * window.innerHeight;
	}
}

class Food {
	constructor() {
		this.x = Math.random() * window.innerWidth;
		this.y = Math.random() * window.innerHeight;
		this.size = Math.random() * 3 + 1;
		this.color = `rgb(${Math.floor(Math.random() * 101) + 155},${Math.floor(Math.random() * 101) + 155},${Math.floor(Math.random() * 101) + 155})`;
	}
}

const food = [];
const bots = [new Bot()];
const cell = new Cell();

let frames = 0;
let botFrames = 0;

function loop() {
	frames++;
	botFrames++;

	if (frames >= 25 && food.length < 500) {
		frames = 0;
		food.push(new Food());
	}

	if (botFrames >= 10000 && bots.length < 10) {
		bots.push(new Bot());
		botFrames = 0;
	}

	moveCell();
	moveBots();
	eatFood();
	eatBots();

	draw();
	requestAnimationFrame(loop);
}

function moveCell() {
	let dx = mouseX - cell.x;
	let dy = mouseY - cell.y;
	let dist = Math.hypot(dx, dy);
	if (dist < cell.speed) return;
	cell.x += (dx / dist) * cell.speed;
	cell.y += (dy / dist) * cell.speed;
}

function moveBots() {
	for (let b of bots) {
		let dx = b.goalX - b.x;
		let dy = b.goalY - b.y;
		let dist = Math.hypot(dx, dy);
		if (dist > b.speed) {
			b.x += (dx / dist) * b.speed;
			b.y += (dy / dist) * b.speed;
		} else {
			b.goalX = Math.random() * window.innerWidth;
			b.goalY = Math.random() * window.innerHeight;
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
	// Cell vs bot
	for (let i = bots.length - 1; i >= 0; i--) {
		let b = bots[i];
		let dist = Math.hypot(b.x - cell.x, b.y - cell.y);
		if (cell.size >= b.size * 1.1 && dist < cell.size) {
			cell.size += b.size * 0.5;
			cell.speed = calcSpeed(cell.size);
			bots.splice(i, 1);
			continue;
		}
		if (b.size >= cell.size * 1.1 && dist < b.size) {
			alert('You were eaten! Restarting...');
			cell.size = 10;
			cell.speed = 2;
			cell.x = window.innerWidth / 2;
			cell.y = window.innerHeight / 2;
			return;
		}
	}

	// Bot vs bot — j = i-1 avoids duplicate pairs and the i===j check
	for (let i = bots.length - 1; i >= 0; i--) {
		for (let j = i - 1; j >= 0; j--) {
			let a = bots[i];
			let b = bots[j];
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

function draw() {
	ctx.clearRect(0, 0, c.width, c.height);

	ctx.fillStyle = 'green';
	ctx.beginPath();
	ctx.arc(cell.x, cell.y, cell.size, 0, 2 * Math.PI);
	ctx.fill();

	ctx.fillStyle = 'blue';
	for (let b of bots) {
		ctx.beginPath();
		ctx.arc(b.x, b.y, b.size, 0, 2 * Math.PI);
		ctx.fill();
	}

	for (let f of food) {
		ctx.fillStyle = f.color;
		ctx.beginPath();
		ctx.arc(f.x, f.y, f.size, 0, 2 * Math.PI);
		ctx.fill();
	}
}

requestAnimationFrame(loop);
