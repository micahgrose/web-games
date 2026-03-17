let mouseX = 0;
let mouseY = 0;

document.addEventListener('mousemove', (event) => {
	mouseX = event.clientX;
	mouseY = event.clientY;
});


const c = document.getElementById('c');
const ctx = c.getContext('2d');
c.width = window.innerWidth;
c.height = window.innerHeight;

class Cell{
	constructor(){
		this.size = 10;
		this.speed = 2;
		this.x = window.innerWidth/2;
		this.y = window.innerHeight/2;
	}
}

class Bot{
	constructor(){
		this.size = 10;
		this.speed = 2;
		this.x = Math.random()*window.innerWidth;
		this.y = Math.random()*window.innerHeight;
		this.goalX = Math.random()*window.innerWidth;
		this.goalY = Math.random()*window.innerHeight;
	}
}

class Food{
	constructor(){
		this.x = Math.random()*window.innerWidth;
		this.y = Math.random()*window.innerHeight;
		this.size = (Math.random()*3)+1;
		this.color = `rgb(${Math.floor(Math.random()*101)+155}, ${Math.floor(Math.random()*101)+155}, ${Math.floor(Math.random()*101)+155})`;
	}
}

const food = [];

const bots = [new Bot()];

const cell = new Cell();

requestAnimationFrame(loop);

let frames = 0;

let botFrames = 0;

function loop(){
	let ate = 0;
	frames++;
	botFrames++;
	if(frames >= 25 && food.length < 500){
		frames = 0;
		food.push(new Food());
	}

	if(botFrames >= 10000 && bots.length < 10){
		bots.push(new Bot());
		botFrames = 0;
	}

	move(false);
	move(true);

	for(let i = 0; i < food.length; i++){
		let beingEaten = eating(food[i]);
		if(beingEaten && beingEaten === -1){
			cell.size += food[i].size/10;
			food.splice(i, 1);
			cell.speed *= Math.pow(10 / cell.size, 0.01);
		} else if(beingEaten !== false){
			bots[beingEaten].size += food[i].size/10;
			food.splice(i, 1);
			bots[beingEaten].speed *= Math.pow(10 / b.size, 0.01)
		}
	}

	draw();

	requestAnimationFrame(loop);
}

function move(bot){
	if(bot){
		if(!bots.length) return;
		for(let i = 0; i < bots.length; i++){
			let b = bots[i];

			let dx = b.goalX - (b.x + b.size/2);
			let dy = b.goalY - (b.y + b.size/2);

			let dist = Math.hypot(dx, dy);

			if(!(dist < b.speed && dist > -b.speed)){
				let moveX = (dx/dist) * b.speed;
				let moveY = (dy/dist) * b.speed;

				b.x += moveX;
				b.y += moveY;
			} else{
				setTimeout(() => {
					b.goalX = Math.random()*window.innerWidth;
					b.goalY = Math.random()*window.innerHeight;
				}, Math.random()*50);
			}
		}
	} else {
		let dx = mouseX - (cell.x + cell.size/2);
		let dy = mouseY - (cell.y + cell.size/2);

		let dist = Math.hypot(dx, dy);

		if(dist < cell.speed && dist > -cell.speed) return;

		let moveX = (dx / dist) * cell.speed;
		let moveY = (dy / dist) * cell.speed;
	
		cell.x += moveX;
		cell.y += moveY;
	}
}

function eating(f){

	let dx = f.x - cell.x;
	let dy = f.y - cell.y;

	let cellDist = Math.hypot(dx, dy);
	if(cellDist <= cell.size + f.size){
		return -1;
	} else{
		for(b of bots){
			let bdx = f.x - b.x;
			let bdy = f.y - b.y;
			let bDist = Math.hypot(bdx, bdy);
			if(bDist <= b.size + f.size){
				return bots.indexOf(b);
			}
		}
		return false;
	}
}


function draw(){
	ctx.clearRect(0, 0, c.width, c.height);
	ctx.fillStyle = 'green';

	ctx.beginPath();
	ctx.arc(cell.x, cell.y, cell.size, 0, 2*Math.PI);
	ctx.fill();

	ctx.fillStyle = 'blue';
	for(b of bots){
		ctx.beginPath();
		ctx.arc(b.x, b.y, b.size, 0, 2*Math.PI);
		ctx.fill();
	}

	for(f of food){
		ctx.fillStyle = f.color;
		ctx.beginPath();
		ctx.arc(f.x,f.y,f.size,0,2*Math.PI);
		ctx.fill();
	}
}
