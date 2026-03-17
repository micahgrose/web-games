const goBtn = document.getElementById('stopGo');
const stepper = document.getElementById('step');
const rest = document.getElementById('restart');
const randBtn = document.getElementById('randGen');
const randIn = document.getElementById('randGenIn');
const overlaySelect = document.getElementById('overlaySelect');
let overlay = true;

});
const x1in = document.getElementById('x1in');
const x2in = document.getElementById('x2in');
const y1in = document.getElementById('y1in');
const y2in = document.getElementById('y2in');

let activeCell = null;
class Cell{
	constructor(x, y, type, dir=1){
		this.here = true;
		this.x = x;
		this.y = y;

		this.type = type;
		this.dir = dir; // 4:up, 3:right, 2:down, 1:left

		this.dragging = false;
		this.initiate = false;

		grid[x][y] = this;

		this.element = document.createElement('div')
		this.element.classList.add(type);
		this.element.style.zIndex = '-1';
		this.transform();
		document.body.appendChild(this.element);

		if(type == 'static') return;
		this.element.onclick = () => this.readyChangePos(this);
	}

	readyChangePos(obj){
		obj.initiate = true;
		obj.dragging = true;
		activeCell = this;
		obj.element.style.opacity = .5;
	}

	rotate(){
		this.dir = (this.dir & 3) + 1;
		this.transform();
	}

	changePos(){
		let x = Math.floor(((event.clientX)/tile));
		let y = Math.floor(((event.clientY)/tile)-1)+1;
		if(grid[x][y]) return;
		grid[this.x][this.y] = null;
		this.x = x;
		this.y = y;
		grid[this.x][this.y] = this;

		this.transform();
		this.element.style.opacity = 1;
		this.dragging = false; 
	}

	action(){
		switch(this.type){
			case 'rotate':
				for(let i = 1; i < 5; i++){
					let cell = grid[this.x + dirVec[i].x][this.y + dirVec[i].y];
					if(cell && cell.type != 'static'){
						cell.dir = (cell.dir % 4) + 1;
						cell.transform();
					}
				}
				break;

			case 'push':
				let chain = [];

				let cell = grid[this.x + dirVec[this.dir].x][this.y + dirVec[this.dir].y];
				let next = cell;
				while(next){
					if(next.type == 'static') return;
					chain.push(next);
					next = grid[next.x + dirVec[this.dir].x][next.y + dirVec[this.dir].y]
				}

				for(let i = chain.length-1; i >= 0; i--){
					if(chain[i]){
						chain[i].move(this.dir);
					}
				}
				chain.forEach(c => c.transform());

				this.move();
				this.transform();
				break;
		}
	}

	move(dir = this.dir){
		grid[this.x][this.y] = null;

		this.x += dirVec[dir].x;
		this.y += dirVec[dir].y;
				
		grid[this.x][this.y] = this;
	}

	transform(){
		this.element.style.transform = `translate(${this.x*tile}px, ${this.y*tile}px) rotate(${rotateVec[this.dir]}deg)`;
	}

	kill(){
		this.element.remove();
		if(grid[this.x]?.[this.y] === this){
			grid[this.x][this.y] = null;
		}
		const i = cells.indexOf(this);
		if (i !== -1) cells.splice(i, 1);
	}
}





function setBorder(startup=false){
	if(!startup){	
		borderTry = true;
	}
	for(let i = 0; i < x2-x1; i++){
		cells.push(new Cell(x1+i, y1, 'static')); // top
		cells.push(new Cell(x1+i+1, y2, 'static')); // bottom
	}

	for(let i = 0; i < y2-y1; i++){
		cells.push(new Cell(x2, y1+i, 'static')); // right
		cells.push(new Cell(x1, y1+i+1, 'static')); // left
	}
}

const typeVec = {
	1:'mobile',
	2:'push',
	3:'rotate',
	4:'static'
}

function randGenerate(num, overlay=false){
	if(oldCells.length+parseInt(num, 10)>=MAX){
		alert('not enough space for that amount of cells!');
		return;
	}
	for(let i = 0; i < num; i++){
		let x = Math.floor(Math.random()*(x2-x1-1)+x1)+1;
		let y = Math.floor(Math.random()*(y2-y1-1)+y1)+1;
		
		if(grid[x][y]){
			i--;
			continue;
		}

		let type = '';
		if(Math.floor(Math.random()*3) == 2){
			type = typeVec[Math.floor(Math.random()*4)+1];
		} else{
			type = typeVec[Math.floor(Math.random()*3)+1];
		}
		let rot = Math.floor(Math.random()*4)+1; 
		oldCells.push([x, y, type, rot]);
		cells.push(new Cell(x, y, type, rot));
	}
}

const tile = 50;

const gridCols = Math.floor(window.innerWidth / tile);
const gridRows = Math.floor(window.innerHeight / tile);
const grid = [];

for(let x = -1; x < gridCols; x++){
	grid[x] = [];
	for(let y = -1; y < gridRows; y++){
		grid[x][y] = null;
	}
}

const dirVec = {
	4:{x:0, y:-1},
	3:{x:1, y:0},
	2:{x:0, y:1},
	1:{x:-1, y:0}
}

const rotateVec = {
	1:270,
	2:180,
	3:90,
	4:0
}

document.addEventListener('click', checkDrag);
document.addEventListener('keydown', (event) => checkRotate(event));

let moveListeners = true;

function checkDrag(){
	if(!activeCell) return;
	let singleCell = false;
	if(activeCell.dragging && !activeCell.initiate){
		activeCell.changePos();
		activeCell = null;
	} else if(activeCell.initiate){
		activeCell.initiate = false;
	}
}

function checkRotate(event){
	let key = event.key;
	if(event.key == 'r'){
		if(!activeCell) return;
		activeCell.rotate();
	}

	if(key == 'Enter'){
		prepGen()
	}
}

let cells = [];
let oldCells = [];

createReferenceCoordinates();

let frames = 0;
function loop(){
	frames ++;

	if(frames >= 25 && (go||step)){
		step = false;
		frames = 0;
		for(let cell of cells){
			if(cell.type == 'rotate'){
				cell.action();
			}
		}
		for(let cell of cells){
			if(cell.type == 'push'){
				cell.action();
			}
		}
		cells.forEach(cell => cell.element.onclick = null);
		document.removeEventListener('click', checkDrag);
		document.removeEventListener('keydown', checkRotate);
		moveListeners = false;

		rest.style.backgroundColor = 'darkgrey';
		randBtn.style.backgroundColor = 'darkgrey';
		rest.style.visibility = 'hidden';
		randBtn.style.visibility = 'hidden';
	} else if(!go && !step){
		rest.style.backgroundColor = 'lightGrey';
		randBtn.style.backgroundColor = 'lightGrey';
		rest.style.visibility = 'visible';
		randBtn.style.visibility = 'visible';

		if(!moveListeners){
			moveListeners = true;
			document.addEventListener('click', checkDrag);
			document.addEventListener('keydown', checkRotate);
		}
	}

	if(!finished && !running){
		tutorial();
	}

	requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

let go = false;
let step = false;


function start(){
	go = true;
	goBtn.onclick = stop;
	goBtn.innerHTML = 'S T O P';
	tryGo = true;
}
function stop(){
	go = false;
	goBtn.onclick = start;
	goBtn.innerHTML = 'G O';
	tryStop = true;
}
function stepGo(){
	step = true;
	tryStep = true;
}
function restart(){
	clear(false, false, false);

	for(list of oldCells){
		cells.push(new Cell(list[0], list[1], list[2], list[3]));
	}

	tryRestart = true;
}
function prepGen(){
	clear(false, overlay);

	if(go || step) return;
	if(randIn.value > MAX){
		alert('to many!');
		return;
	}
	randGenerate(randIn.value);
}

function readyBorderChange(){
	let msg = confirm('Changing border will delete current cells. Change anyway?');
	let x1p = Math.floor(parseInt(x1in.value, 10));
	let x2p = Math.floor(parseInt(x2in.value, 10));
	let y1p = Math.floor(parseInt(y1in.value, 10));
	let y2p = Math.floor(parseInt(y2in.value, 10));
	if(msg && Number.isFinite(x1p) && Number.isFinite(x2p) && Number.isFinite(y1p) && Number.isFinite(y2p)){
		x1 = x1p;
		x2 = x2p;
		y1 = y1p;
		y2 = y2p;
		checkCords();
		clear(false, false);
		setBorder();
	} else{
		alert('invalid coordinates');
		return;
	}
}

function reset(){
	clear(false, false, true);
	tryReset = true;
}

function checkCords(){
	if(x1 > x2){
		[x1, x2] = [x2, x1];
	}
	if(y1 > y2){
		[y1, y2] = [y2, y1];
	}
	if(x1<0){
		x1=0;
	}
	if(y1<0){
		y1=0;
	}
	if(x2 > gridCols){
		x2=gridCols-1;
	}
	if(y2 > gridRows){
		y2=gridRows-1;
	}
	MAX = ((x2-1)-(x1))*((y2-1)-(y1));
	randIn.placeholder = '# of cells. Max ' + MAX;
	console.log(x1);
	console.log(y1);
	console.log(x2);
	console.log(y2);
}

function clear(border=false, overlay=true, wipeOld=true){
	if(overlay) {
		generateOverlay = true;
		return;
	} else if(generateOverlay){
		generateReplace = true;
	}
	if(go || step) return;
	while(cells.length){
		cells[0].kill();
	}

	for(let x in grid){
		for(let y in grid[x]){
			grid[x][y] = null;
		}
	}

	if(wipeOld) oldCells = [];

	if(!border){
		setBorder();	
	}

}


function createReferenceCoordinates(){
	for(let i = 0; i < gridCols; i++){
		let p = document.createElement('p');
		p.classList.add('referenceCoords');
		p.style.left = i*tile + 'px';
		p.style.top = '95vh';
		p.innerHTML = i;
		document.body.appendChild(p);
	}
	for(let i = 0; i < gridRows; i++){
		let p = document.createElement('p');
		p.classList.add('referenceCoords');
		p.style.top = i*tile + 'px';
		p.style.left = '98vw';
		p.innerHTML = i;
		document.body.appendChild(p);
	}
}




let borderTry = false;
let generateOverlay = false;
let generateReplace = false;
let tryStep = false;
let tryGo = false;
let tryStop = false;
let tryRestart = false;
let tryReset = false;
let finished = false;
let running = false;
const box = document.getElementById('tutBox');

const timeSec = document.querySelector(".timeSec");
const genSec = document.querySelector(".genSec");
const resetSec = document.querySelector(".resetSec");
const bordSec = document.querySelector(".bordSec");
const xylab = document.getElementById('xyLabel');
timeSec.style.setProperty('--timeGray', '100%');
genSec.style.setProperty('--genGray', '100%');
resetSec.style.setProperty('--resetGray', '100%');
bordSec.style.setProperty('--bordGray', '100%');
document.documentElement.style.setProperty('--refGray', 'darkgrey');

tutorial();
function tutorial(){
	running = true;

	if(!borderTry){
		bordSec.style.setProperty('--bordGray', '0%');
		box.style.top = '100px';
		box.style.left = '835px';
		box.innerHTML = 'Enter in coordinates for the border corners. For the top left, do (1,3). For the bottom right, do (20,15). Reference numbers can be found down below and to the right';
	} else if(!generateOverlay){
		bordSec.style.setProperty('--bordGray', '100%');
		genSec.style.setProperty('--genGray', '0%');
		box.style.left = '1500px';
		box.innerHTML = 'The generate button generates random cells inside the border. Type in a number of cells you would like to generate and click generate.';
	} else if(!generateReplace){
		box.style.left = '1700px';
		box.innerHTML = 'Overlay means that every time you generate cells, it adds to the past cells. Replace replaces the old cells. Set to replace and try generate again.';
	} else if(!tryStep){
		genSec.style.setProperty('--genGray', '100%');
		timeSec.style.setProperty('--timeGray', '0%');
		box.style.left = '125px';
		box.innerHTML = 'Click step. You can see that each cell as a different action. Green cells push, orange cells rotate adjacent cells, dark cells can not be moved and white ones can.';
	} else if(!tryGo){
		box.style.left = '10px';
		box.innerHTML = 'Now try clicking go.';
	} else if(!tryStop){
		box.innerHTML = 'Click stop now.';
	} else if(!tryRestart){
		box.style.left = '270px';
		box.innerHTML = 'Clicking restart resets the cells to there original positions.';
	} else if(!tryReset){
		timeSec.style.setProperty('--timeGray', '100%');
		resetSec.style.setProperty('--resetGray', '0%');
		box.style.top = '866px';
		box.style.left='200px';
		box.innerHTML = 'Fnally, reseting clears all existing cells, except borders.';
	} else{
		skip(document.getElementById('skipTutorial'));
	}

	running = false
}

function skip(b){
	timeSec.style.setProperty('--timeGray', '0%');
	genSec.style.setProperty('--genGray', '0%');
	resetSec.style.setProperty('--resetGray', '0%');
	bordSec.style.setProperty('--bordGray', '0%');
	document.documentElement.style.setProperty('--refGray', 'white');
	xylab.style.filter = 'grayscale(0%)';
	b.style.display = 'none';
	finished = true;
	box.style.display = 'none';
}