const windowVW = window.innerWidth / 100;
const windowVH = window.innerHeight / 100;

let lost = false;
let money = 0;
let moneyTxt = document.getElementById('moneyCount');

const upCount = {
	0:3,
	1:5,
	2:10,
	3:15,
	4:25,
	5:50,
	6:80,
	7:140,
	8:175,
	9:235,
	10:300,
	11:410,
	12:525,
	13:670,
	14:800,
	15:995,
	16:1190,
	17:1400,
	18:1655,
	19:1900,
	20:2500
}
let ups = 0;

class Player{
	constructor(x, y, size, color){
		this.x = x;
		this.y = y;
		this.size = size;
		this.color = color;

		this.element = document.getElementById('player');
		this.element.style.transform = `translate(${x}px, ${y}px)`;
		this.element.style.width = size + 'px';
		this.element.style.height = size + 'px';
		this.element.style.backgroundColor = color;
		document.body.appendChild(this.element);
	}

	move(){
		this.element.style.transform = `translate(${this.x}px, ${this.y}px)`;
	}
}

class Gaurdian{
	constructor(size){
		this.size = size;
		this.radius = 500;
		this.angle = 0;
		this.speed = .3;

		this.element = document.createElement('div');
		this.element.classList.add('gaurdian');
		this.element.style.width = `${this.size}px`;
		this.element.style.height = `${this.size}px`;
		this.element.style.transform = `translate(${this.px}px, ${this.py + this.r}px)`;
		document.appendChild(this.element);
	}
	move(){
		this.px = player.x + (player.size/2);
		this.py = player.y - (player.size/2);

		this.angle += 5;

		this.element.style.transform = `translate(${this.px}px, ${this.py + this.r}px)`;
	}
}

const player = new Player(75, 75, 75, 'black');
let speed = 10;

let keys = [];
document.addEventListener('keydown', (event) => keys.push(event.key));
document.addEventListener('keyup', (event) => keys = keys.filter(k => k !== event.key));

let ballTracker = 0;
let gemTracker = 0;
function loop(){
	ballTracker ++;
	gemTracker ++;



	if(ballTracker / 200 == 1){
		for(b of balls){
			let ball = new Ball(b.x, b.y, 25, b.vx, b.vy);
			newBalls.push(ball);
		}
		for(let i = 0; i < newBalls.length; i++){
			balls.push(newBalls[i]);
		}
		newBalls = [];
		ballTracker = 0;
	}



	if(gemTracker / 75 == 1){
		let gem = new Gem(Math.random()*window.innerWidth, Math.random()*window.innerHeight, 1);
		gems.push(gem);
		gemTracker = 0;
	}


	if((keys.includes('w') || keys.includes('ArrowUp')) && player.y > 0){
		player.y -= speed;
	}

	if((keys.includes('s') || keys.includes('ArrowDown')) && player.y < window.innerHeight - player.size){
		player.y += speed;
	}

	if((keys.includes('d') || keys.includes('ArrowRight')) && player.x < window.innerWidth - player.size){
		player.x += speed;
	}

	if((keys.includes('a') || keys.includes('ArrowLeft')) && player.x > 0){
		player.x -= speed;
	}

	player.move();
 
	balls.forEach(ball => ball.move());

	for(ball of balls){
		let ballRect = ball.element.getBoundingClientRect();
		let playerRect = player.element.getBoundingClientRect();
		if((ballRect.right > playerRect.left && ballRect.left < playerRect.left && (ballRect.top < playerRect.bottom && ballRect.bottom > playerRect.top)) || (ballRect.left < playerRect.right && ballRect.right > playerRect.right && (ballRect.top < playerRect.bottom && ballRect.bottom > playerRect.top))){
			lose();
		};
	}

	for(gem of gems){
		let gemRect = gem.element.getBoundingClientRect();
		let playerRect = player.element.getBoundingClientRect();
		if((gemRect.right > playerRect.left && gemRect.left < playerRect.left && (gemRect.top < playerRect.bottom && gemRect.bottom > playerRect.top)) || (gemRect.left < playerRect.right && gemRect.right > playerRect.right && (gemRect.top < playerRect.bottom && gemRect.bottom > playerRect.top))){
			money += gem.val;
			moneyTxt.innerHTML = `${money}/${upCount[ups]}`
			gem.element.remove();
			gem.rect = null;
			gems.filter(gem => gem.rect !== null);
		}
	}


	if(lost) return;
	requestAnimationFrame(loop);
}

requestAnimationFrame(loop);



class Ball{
	constructor(x, y, size, vx = 5, vy = 5){
		this.size = size;

		this.x = x;
		this.y = y;

		this.vx = vx * 1.2;
		this.vy = vy * 1.2;

		this.speed = .4;
		this.drag = .99;

		this.element = document.createElement('div');
		this.element.classList.add('ball');
		this.element.style.width = '25px';
		this.element.style.height = '25px';
		this.element.style.transform = `translate(${this.x}px, ${this.y}px)`;
		document.body.appendChild(this.element);
	}

	move(){	
		let cx = (player.x + (player.size/2)) - this.size/2;
		let cy = (player.y - (player.size/2)) - this.size/2;

		let dx = cx - this.x;
		let dy = cy - this.y;
		let dist = Math.hypot(dx, dy);

		let gx = dx / dist;
		let gy = dy / dist;

		this.vx += (gx * this.speed) + Math.random()*.2;
		this.vy += (gy * this.speed) + Math.random()*.2;

		this.vx *= this.drag;
		this.vy *= this.drag;

		this.x += this.vx;
		this.y += this.vy;

		this.element.style.transform = `translate(${this.x}px, ${this.y}px)`;
	}
}

let balls = [new Ball(1000, 500, 25)];
let newBalls = [];


gems = [];
const gemCol = {
	1 : 'green',
	10 : 'blue',
	100 : 'orange'
}
class Gem{
	constructor(x, y, val){
		this.x = x;
		this.y = y;
		this.val = val;

		this.element = document.createElement('div');
		this.element.classList.add('gem');
		this.element.style.backgroundColor = gemCol[val];
		this.element.style.transform = `translate(${this.x}px, ${this.y}px) rotate(45deg)`;
		document.body.appendChild(this.element);
	}
}





function lose(){
	lost = true;
	setTimeout(() => {
		for(ball of balls){
			ball.element.remove();
			ball.move = null;
		}
		player.element.remove();
		player.move = null;
		alert('you lose =)');
	}, 100);
	
}