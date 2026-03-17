setInterval(glowLoop, 1000/25);
const glow = document.getElementById('glow');
let deg = 0;
function glowLoop(){
	deg += 0.5;
	glow.style.transform = `rotate(${deg}deg)`;
}

let clickPower = 1;
const cookieDough = document.getElementById('cookieDough');
const cookieDoughCounter = document.getElementById('cookieDoughCounter');
let cookieDoughs = 0;
cookieDough.addEventListener('click', () => addCookieDoughs(clickPower));

let counterNum = '';
let counterNumDic = {
	1000: ' thousand',
	1000000: ' million',
	1000000000: ' billion',
	1000000000000: ' trillion',
	1000000000000000: ' quadrillion',
	1000000000000000000: ' quintillion',
	1000000000000000000000: ' sextillion',
	1000000000000000000000000: ' septillion',
	1000000000000000000000000000: ' octillion',
	1000000000000000000000000000000: ' nonillion',
	1000000000000000000000000000000000: ' decillion'
};

function addCookieDoughs(num = 0){
	let counterIter = 1000;
	if(num){
		cookieDoughs += num;
	}

	if(cookieDoughs >= 1000){
		for(let i = 0; i < 11; i++){
			if(cookieDoughs/counterIter >= 1 && cookieDoughs/counterIter <= 999){
				counterNum = counterNumDic[counterIter];
				break;
			}
			counterIter *= 1000;
		}
		cookieDoughCounter.innerHTML = `${Math.round((cookieDoughs/counterIter)*100)/100} ${counterNum} Cookie Doughs`;
	} else{
		cookieDoughCounter.innerHTML = `${Math.round(cookieDoughs)} ${counterNum} Cookie Doughs`;	
	}
}

let cookieDoughsPerSecond = 0;
const perSecText = document.getElementById('perSecCounter');
let perSecNum = '';
function updateSecondDough(num){
	let perSecIter = 1000;
	cookieDoughsPerSecond += num;

	if(cookieDoughsPerSecond >= 1000){
		for(let i = 0; i < 11; i++){
			if(cookieDoughsPerSecond/perSecIter >= 1 && cookieDoughsPerSecond/perSecIter <= 999){
				perSecNum = counterNumDic[perSecIter];
				break;
			}
			perSecIter *= 1000;
		}
		perSecText.innerHTML = `${Math.round((cookieDoughsPerSecond/perSecIter*100))/100} ${perSecNum} Cookie Doughs Per Second`;
	}else{
		perSecText.innerHTML = `${Math.round(cookieDoughsPerSecond*10)/10} Cookie Doughs Per Second`;
	}
}

let lastTick = performance.now();
requestAnimationFrame(tick);
function tick(now){
	let multiplier = (now - lastTick) / 1000;
	lastTick = now;
	addCookieDoughs(cookieDoughsPerSecond * multiplier);
	requestAnimationFrame(tick);
}

// Clickable upgrades
const cursorBtn = document.getElementById('addCursor');
const cursorCostText = document.getElementById('cursorCostText');
const cursorPowerText = document.getElementById('cursorPowerText');
let cursorCost = [15, 0];
let cursorPower = 0.1;

function addCursor(num){
	cookieDoughs -= cursorCost[0];
	money -= cursorCost[1];

	cursorCost[0] = Math.round(cursorCost[0]*1.155);
	cursorCost[1] = Math.round(cursorCost[1]*1.155);

	cursorCostText.innerHTML = `${cursorCost[0]} Cookie Doughs`;
	cursorPowerText.innerHTML = `${cursorPower} Per Second`;

	updateSecondDough(num);
}

cursorBtn.addEventListener('click', () => {
	if(cookieDoughs >= cursorCost[0] && money >= cursorCost[1]){
		addCursor(cursorPower);
	}
});

const grandmaBtn = document.getElementById('addGrandma');
const grandmaCostText = document.getElementById('grandmaCostText');
const grandmaPowerText = document.getElementById('grandmaPowerText');
let grandmaCost = [100, 0];
let grandmaPower = 1;

function addGrandma(num){
	cookieDoughs -= grandmaCost[0];
	money -= grandmaCost[1];

	grandmaCost[0] = Math.round(grandmaCost[0]*1.155);
	grandmaCost[1] = Math.round(grandmaCost[1]*1.155);

	grandmaCostText.innerHTML = `${grandmaCost[0]} Cookie Doughs`;
	grandmaPowerText.innerHTML = `${grandmaPower} Per Second`;

	updateSecondDough(num);
}

grandmaBtn.addEventListener('click', () => {
	if(cookieDoughs >= grandmaCost[0] && money >= grandmaCost[1]){
		addGrandma(grandmaPower);
	}
});

const nurseryBtn = document.getElementById('addNursery');
const nurseryCostText = document.getElementById('nurseryCostText');
const nurseryPowerText = document.getElementById('nurseryPowerText');
let nurseryCost = [1000, 0];
let nurseryPower = 12;

function addNursery(num){
	cookieDoughs -= nurseryCost[0];
	money -= nurseryCost[1];

	nurseryCost[0] = Math.round(nurseryCost[0]*1.22);
	nurseryCost[1] = Math.round(nurseryCost[1]*1.22);

	nurseryCostText.innerHTML = `${nurseryCost[0]} Cookie Doughs`;
	nurseryPowerText.innerHTML = `${nurseryPower} Per Second`;

	updateSecondDough(num);
}

nurseryBtn.addEventListener('click', () => {
	if(cookieDoughs >= nurseryCost[0] && money >= nurseryCost[1]){
		addNursery(nurseryPower);
	}
});

// Upgrade affordability check loop
requestAnimationFrame(gameLoop);
function gameLoop(){
	[cursorCostText, grandmaCostText, nurseryCostText].forEach((el, i) => {
		let affordable = (i === 0 ? cookieDoughs >= cursorCost[0] :
						  i === 1 ? cookieDoughs >= grandmaCost[0] :
						  cookieDoughs >= nurseryCost[0]);
		el.classList.toggle('affordable', affordable);
		el.classList.toggle('unaffordable', !affordable);
	});
	requestAnimationFrame(gameLoop);
}

let money = 100;
let conveyorCost = 100;
const conveyorGridHolder = document.getElementById('conveyorGridHolder');
const conveyorBuy = document.getElementById('conveyorBuyHolder');
let gridSize = 50;

const gridCols = Math.floor(conveyorGridHolder.clientWidth / 50);
const gridRows = Math.floor(conveyorGridHolder.clientHeight / 50);
const conveyorGrid = [];
for (let y = 0; y < gridRows; y++) {
	conveyorGrid[y] = Array(gridCols).fill(null);
}

const directionVector = {
	'up': {x:0, y:-1},
	'right': {x:1, y:0},
	'down': {x:0, y:1},
	'left': {x:-1, y:0}
};

class Conveyor {
	constructor(tileX, tileY, direction, rotation, speed = 1){
		this.tileX = tileX;
		this.tileY = tileY;
		this.direction = direction;
		this.speed = speed;

		this.element = document.createElement('div');
		this.element.classList.add('conveyor');
		this.element.style.transform = `translate(${tileX*50}px, ${tileY*50}px) rotate(${rotation}deg)`;
	}
}

class Cookie {
	constructor(type, tileX, tileY){
		this.type = type;
		this.tileX = tileX;
		this.tileY = tileY;
		this.progress = 0;

		this.element = document.createElement('div');
		this.element.classList.add('cookie', type);
		conveyorGridHolder.appendChild(this.element);

		this.updatePosition();
	}

	updatePosition(){
		this.element.style.transform = `translate(${this.tileX*50}px, ${this.tileY*50}px)`;
	}

	update(delta){
		const conveyor = conveyorGrid[this.tileY][this.tileX];
		if(!conveyor) return;

		const dir = directionVector[conveyor.direction];
		this.progress += conveyor.speed * delta;

		if(this.progress >= 1){
			this.progress = 0;
			this.tileX += dir.x;
			this.tileY += dir.y;
		}

		this.element.style.transform = `translate(${(this.tileX + dir.x*this.progress)*50}px, ${(this.tileY + dir.y*this.progress)*50}px)`;
	}
}

// Single cookie for testing
const cookies = [new Cookie('chocolateChip', 0, 0)];
let lastTime = performance.now();
function animate(now){
	const deltaTime = (now - lastTime)/1000;
	lastTime = now;

	cookies.forEach(cookie => cookie.update(deltaTime));

	requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

conveyorBuy.addEventListener('click', buyConveyor);