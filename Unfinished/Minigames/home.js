class Square{
	constructor(x, size, speed){
		this.x = x;
		this.y = 0 - size;
		this.size = size;
		this.speed = speed;
	}

	move(){
		this.y += this.speed;
	}
}

let frames = 0;
let squares = [];

let ranSX = Math.random()*window.innerWidth;
let ranSize = (Math.random()*10) + 1;
let ranSpeed = ranSize * .09;

const canvas = document.getElementById('canvas');
const context = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

function draw(){
	for(const square of squares){
		context.fillStyle = 'rgba(128, 128, 128, .5)';
		context.fillRect(square.x, square.y, square.size, square.size);
	}
}

requestAnimationFrame(loop);

function loop(){
	frames++;
	if(frames >= 5){
		frames = 0;

		let square = new Square(ranSX, ranSize, ranSpeed);
		squares.push(square)

		ranSX = Math.random()*window.innerWidth;
		ranSize = (Math.random()*10) + 1;
		ranSpeed = ranSize * .09;
	}

	context.clearRect(0, 0, canvas.width, canvas.height);
	squares.forEach(square => square.move());
	draw();

	squares = squares.filter(square => square.y < canvas.height);

	requestAnimationFrame(loop);
}
