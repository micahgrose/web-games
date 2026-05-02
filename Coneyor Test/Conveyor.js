const gameHolder = document.getElementById('gameHolder');

let money = 500;

const msgHold = document.getElementById('msgHold');
function msgAlert(msg){
	const newMsg = document.createElement('h1');
	msgHold.appendChild(newMsg);
	newMsg.innerHTML = msg;
	newMsg.style.animation = 'msgAlert 4s';
	setTimeout(() => {
		newMsg.style.display = 'none';
	}, 4500);
}

/*
	SETTING UP GRID
*/

const gridCols = Math.floor(window.outerWidth / 50);
const gridRows = Math.floor(gameHolder.scrollHeight / 50);
const grid = [];

for(let x = -1; x < gridCols; x++){
	grid[x] = [];
	for(let y = -1; y < gridRows; y++){
		grid[x][y] = {
			ground:null,
			building:null
		}
	}
}

/*
CONVEYOR AND RESOURCE CLASSES AND MECHANICS
*/

const dirVec = {
	'up':{x:0, y:-1},
	'down':{x:0, y:1},
	'right':{x:1, y:0},
	'left':{x:-1, y:0}
}

class Conveyor{
	constructor(x, y, direction, speed = 1){
		this.type = 'conveyor';
		this.x = x;
		this.y = y;
		this.dir = direction;
		this.speed = speed;

		this.element = document.createElement('div');
		this.element.classList.add('conveyor');
		gameHolder.appendChild(this.element);

		let rotation = 0;
		switch(this.dir){
		case 'down':
			rotation = 180;
			break;
		case 'right':
			rotation = 90;
			break;
		case 'left':
			rotation = 270;
			break;
		}

		this.element.style.transform = `translate(${this.x*50}px, ${this.y*50}px) rotate(${rotation}deg)`;

		if (grid[x] && grid[x][y] !== undefined) {
   			grid[x][y].building = this;
		}
	}
}

class Vein{
	constructor(kind, tileX, tileY){
		this.type = 'vein';
		this.kind = kind
		this.tileX = tileX;
		this.tileY = tileY;
		this.taken = false;

		this.element = document.createElement('div');
		this.element.classList.add('vein', `${kind}Vein`);
		gameHolder.appendChild(this.element);

		this.element.style.transform = `translate(${this.tileX*50}px, ${this.tileY*50}px)`;

		grid[tileX][tileY].ground = this;
	}
}
class Resource{
	constructor(type, tileX, tileY){
		this.type = type;
		this.tileX = tileX;
		this.tileY = tileY;
		this.progress = 0;
		this.value = resourceVal[type];
		this.lastConveyor = null;
		this.move = true;

		this.element = document.createElement('div');
		this.element.classList.add('resource');
		gameHolder.appendChild(this.element);

		this.element.style.transform = `translate(${this.tileX*50}px, ${this.tileY*50}px)`;
		this.element.style.backgroundImage = `url(Images/${type}.png)`;
	}

	updatePos(delta){
		const building = grid[this.tileX][this.tileY].building;
		if(building){ 
			if(building.type == 'collector'){
				building.sell(this);
			} else if(building.type == 'smelter' && this.type.includes('Ore') && this.move){
				this.move = false;
				building.refine(this);
				return;
			}
		} else {
			this.element.remove();
			resources = resources.filter(r => r !== this);
			return;
		}
		
		const conveyor = building;
		if((!conveyor || building.type != 'conveyor') && building.type != 'smelter'){
			this.element.remove();
			resources = resources.filter(r => r !== this);
			return;
		}

		
		if(!this.move) return;

		const direction = dirVec[conveyor.dir];
		this.progress += delta*conveyor.speed;

		if(this.progress >= 1){
			this.progress = 0;
			this.tileX += direction.x;
			this.tileY += direction.y;
			this.lastConveyor = conveyor;
		}

		this.element.style.transform = `translate(${(this.tileX+direction.x*this.progress)*50}px, ${(this.tileY+direction.y*this.progress)*50}px)`;
	}
}

class Drill{
	constructor(tileX, tileY, speed, direction, rotation){
		const tile = grid[tileX][tileY];
		const vein = tile?.ground;
		if(!vein || vein.type != 'vein' || vein.taken){
			money -= cost['drill'];
			moneyTxt.innerHTML = `${money}$`
		};
		vein.taken = true;

		this.type = 'drill';
		this.x = tileX;
		this.y = tileY;
		this.speed = speed;
		this.dir = direction;
		this.frames = 0;

		this.element = document.createElement('div');
		this.element.classList.add('drill');
		gameHolder.appendChild(this.element);

		this.element.style.transform = `translate(${this.x*50}px, ${this.y*50}px) rotate(${rotation}deg)`;
		grid[tileX][tileY].building = this;
	}

	dropRes(){
		const vein = grid[this.x][this.y].ground;
		if(!vein || vein.type != 'vein') return;

		let dropDirX = this.x + dirVec[this.dir].x;
		let dropDirY = this.y + dirVec[this.dir].y;

		switch(vein.kind){
		case 'copper':
			const copperOre = new Resource('copperOre', dropDirX, dropDirY);
			resources.push(copperOre);
			break;
		case 'iron':
			const ironOre = new Resource('ironOre', dropDirX, dropDirY);
			resources.push(ironOre);
			break;
		}
	}

	decideGo(ms){
		this.frames ++;
		if(this.frames >= (this.speed*1000)/ms){
			this.dropRes();
			this.frames = 0;
		}
	}
}

class Collector{
	constructor(tileX, tileY, direction, rotation){
		this.type = 'collector';
		this.x = tileX;
		this.y = tileY;
		this.dir = direction;

		this.element = document.createElement('div');
		this.element.classList.add('collector');
		gameHolder.appendChild(this.element);
		
		this.element.style.transform = `translate(${this.x*50}px, ${this.y*50}px) rotate(${rotation}deg)`;
		grid[tileX][tileY].building = this;
	}

	sell(res){
		if(res.lastConveyor && res.lastConveyor.dir == this.dir){
			money += res.value;
			moneyTxt.innerHTML = `${money}$`;
		}
		res.element.remove();
		resources = resources.filter(r => r !== res);
	}
}

class Smelter{
	constructor(tileX, tileY, direction, rotation, speed){
		this.type = 'smelter';
		this.x = tileX;
		this.y = tileY;
		this.speed = speed;
		this.oldSpeed = speed;
		this.dir = direction;
		this.nextRes = [];

		this.element = document.createElement('div');
		this.element.classList.add('smelter');
		gameHolder.appendChild(this.element);

		this.element.style.transform = `translate(${this.x*50}px, ${this.y*50}px) rotate(${rotation}deg)`;
		grid[tileX][tileY].building = this;
	}

	refine(res){
		if(res.lastConveyor.dir != this.dir) return;
		if(res.type.includes('Ingot')) return;
		res.doneAt = this.speed*1000;
		this.nextRes.push(res);
	}

	awaitLeave(ms){
		if(this.nextRes.length == 0) return;
		this.nextRes[0].doneAt -= ms;
		if(this.nextRes[0].doneAt <= 0){
			const res = this.assignResProps(this.nextRes.shift());

			let direction = dirVec[this.dir];

			res.element.style.transform = `translate(${res.tileX*50}px, ${res.tileY*50}px)`;
			res.progress = 0;
			res.tileX += direction.x;
			res.tileY += direction.y;
			res.move = true;
		}
	}

	assignResProps(res){
		if(res.type.includes('copper')){
			res.type = 'copperIngot';
			res.element.style.backgroundImage = 'url(Images/copperIngot.png)';
		} else if(res.type.includes('iron')){
			res.type = 'ironIngot';
			res.element.style.backgroundImage = 'url(Images/ironIngot.png)';
		}

		res.value = resourceVal[res.type];
		return res;
	}

	changeSpeed(){
		this.nextRes.forEach(res => {
			const factor = res.doneAt / (this.oldSpeed*1000);
			res.doneAt = factor * (this.speed*1000);
		});
		this.oldSpeed = this.speed;
	}
}

/*
	RESOURCE ANIMATION AS WELL AS CONVEYOR AND RESOUCRE ARRAYS
*/
const resourceVal = {
	'copperOre':25,
	'copperIngot':75,
	'ironOre':100,
	'ironIngot':180
}

const conveyors = [];
let resources = [];
const veins = [new Vein('copper', 1, 5), new Vein('copper', 10, 3), new Vein('copper', 16, 13), new Vein('copper', 26, 7), new Vein('copper', 2, 25), new Vein('iron', 24, 12), new Vein('iron', 27, 27), new Vein('iron', 1, 32)];// boundries: 38, 75
const drills = [];
const collectors = [];
let collectorLimit = 2;
const smelters = [];

let lastTime = performance.now();
function gameLoop(now){
	let ms = now - lastTime
	let dt = ms / 1000;
	lastTime = now;

	resources.forEach(resource => resource.updatePos(dt));

	for(let i = 0; i < drills.length; i++){
		if(drills[i].decideGo){
			drills[i].decideGo(ms);
		}
	}

	smelters.forEach(smelter => smelter.awaitLeave(ms));

	requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);


/*
	SHADOW PLACEMENT AND SUCH
*/

const gridSize = 50;
const shadow = document.createElement('div');
shadow.classList.add('shadow');
shadow.rotation = 0;
gameHolder.appendChild(shadow);

const cost = {
	'remove':0,
	'conveyor':50,
	'drill':200,
	'collector':100,
	'smelter':1500
}
const moneyTxt = document.getElementById('moneyTxt');

let shadowControl = true;

function gridShadow(thing){
	if(!shadowControl) return;
	if(money < cost[thing]){
		msgAlert('Not enough money!');
		return;
	}
	if(collectors.length == collectorLimit && thing == 'collector'){
		msgAlert('Two collector limit!');
		return;
	}
	shadowControl = false;

	const type = thing;

	setTimeout(() => {
		gameHolder.addEventListener('mousemove', moveShadow);
		document.addEventListener('keydown', rotateShadow);
		document.addEventListener('keydown', escape);
		gameHolder.addEventListener('click', placeShadow);
	}, 10);

	shadow.classList.add(`${type}Shadow`);

	function moveShadow(event){
		if(event){
			shadow.x = event.clientX;
			shadow.y = event.clientY + shadow.scrollY;	
		}

		let snappedX = Math.floor(shadow.x / gridSize) * gridSize;
		let snappedY = Math.floor(shadow.y / gridSize) * gridSize;

		shadow.tileX = snappedX/50;
		shadow.tileY = snappedY/50;

		shadow.style.transform = `translate(${snappedX}px, ${snappedY}px) rotate(${shadow.rotation}deg)`;
	}	

	function rotateShadow(event){
		if(event.key == 'r'){
			shadow.rotation = (shadow.rotation + 90) % 360;
			shadow.style.transform = `translate(${shadow.tileX*50}px, ${shadow.tileY*50}px) rotate(${shadow.rotation}deg)`;
		}

	}

	function escape(event){
		if(event.key == 'Escape'){
			cleanUp();
			return;
		}
	}

	function placeShadow(event){
		let direction = '';

		switch(shadow.rotation){
		case 0:
			direction = 'up';
			break;
		case 90:
			direction = 'right';
			break;
		case 180:
			direction = 'down';
			break;
		case 270:
			direction = 'left';
			break;
		}


		if((!grid[shadow.tileX][shadow.tileY].building || type == 'remove') && (!grid[shadow.tileX][shadow.tileY].ground || (type == 'drill' || type =='remove'))){

			switch(type){
			case 'conveyor':
				let conveyor = new Conveyor(shadow.tileX, shadow.tileY, direction, speeds.conveyor);
				conveyors.push(conveyor);
				break;
			case 'drill':
				let drill = new Drill(shadow.tileX, shadow.tileY, speeds.drill, direction, shadow.rotation);
				drills.push(drill);
				break;
			case 'collector':
				let collector = new Collector(shadow.tileX, shadow.tileY, direction, shadow.rotation);
				collectors.push(collector);
				break;
			case 'smelter':
				let smelter = new Smelter(shadow.tileX, shadow.tileY, direction, shadow.rotation, speeds.smelter);
				smelters.push(smelter);
				break;
			case 'remove':
				const tile = grid[shadow.tileX][shadow.tileY];
				if(!tile.building) break;
				tile.building.element.remove();
				removeFromList(tile);
				tile.building = null;
				break;
			}

			money -= cost[type];
			moneyTxt.innerHTML = `${money}$`;

		} else{
			msgAlert('Invalid placement!');
		}

		cleanUp();

	}

	function cleanUp(){
		shadowControl = true;

		shadow.classList.remove(`${type}Shadow`);
		gameHolder.removeEventListener('mousemove', moveShadow);
		document.removeEventListener('keydown', rotateShadow);
		gameHolder.removeEventListener('click', placeShadow);
	}


	function removeFromList(cell){
		let type = cell.building.type;
		money += cost[type] * .5;
		switch(type){
		case 'conveyor':
			conveyors.filter(con => con !== this);
			break;
		case 'drill':
			drills.filter(dri => dri !== this);
			cell.building.decideGo = null;
			cell.building.dropRes = null;
			cell.ground.taken = false;
			break;
		case 'collector':
			collectors.filter(col => col !== this);
			collectorLimit ++;
			break;
		}
	}

}

document.addEventListener('keydown', keyFunc);

shadow.scrollY = window.scrollY;
const scrollBy = window.outerHeight/5;

function keyFunc(event){
	switch(event.key){
	case '1':
		gridShadow('conveyor');
		break;
	case '2':
		gridShadow('drill');
		break;
	case '3':
		gridShadow('collector');
		break;
	case '4':
		gridShadow('smelter');
		break;
	case 'e':
		gridShadow('remove');
		break;
	}

	if(event.key == 's' && shadow.scrollY < gameHolder.scrollHeight){
		window.scrollBy(0, scrollBy);
		shadow.y += scrollBy;
		shadow.scrollY += scrollBy;
	}

	if(event.key == 'w' && shadow.scrollY > 0){
		window.scrollBy(0, -scrollBy);
		shadow.y -= scrollBy;
		shadow.scrollY -= scrollBy;
	}

	if(!(lastMousePosX && lastMousePosY)) return;

	shadow.x = lastMousePosX;
	shadow.y = lastMousePosY + shadow.scrollY;	

	let snappedX = Math.floor(shadow.x / gridSize) * gridSize;
	let snappedY = Math.floor(shadow.y / gridSize) * gridSize;

	shadow.tileX = snappedX/50;
	shadow.tileY = snappedY/50;

	shadow.style.transform = `translate(${snappedX}px, ${snappedY}px) rotate(${shadow.rotation}deg)`;
}

document.addEventListener('mousemove', trackMouse);

let lastMousePosX = null;
let lastMousePosY = null;

function trackMouse(event){
	lastMousePosX = event.clientX;
	lastMousePosY = event.clientY;
}


const upgradeInfo = {
	'conveyor':{'price': 5000, 'speed': 2, 'lvl': 1},
	'drill':{'price': 150000, 'speed': .5, 'lvl': 1},
	'smelter':{'price': 500000, 'speed': .5, 'lvl': 1}
}

const speeds = {
	'conveyor': .5,
	'drill': 10,
	'smelter': 15
}

const conveyorUp = document.getElementById('conveyorUp');
const drillUp = document.getElementById('drillUp');
const smelterUp = document.getElementById('smelterUp');

const conveyorStat = document.getElementById('conveyorStat');
const drillStat = document.getElementById('drillStat');
const smelterStat = document.getElementById('smelterStat');

conveyorUp.addEventListener('click', () => upgrade('conveyor', conveyors));
drillUp.addEventListener('click', () => upgrade('drill', drills));
smelterUp.addEventListener('click', () => upgrade('smelter', smelters));

function upgrade(thing, list){
	let price = upgradeInfo[thing].price;
	let speedChange = upgradeInfo[thing].speed;
	if(!(money >= price)){
		msgAlert('Not enough money');
		return;
	}

	money -= price;
	moneyTxt.innerHTML = `${money}$`

	list.forEach(item => item.speed *= speedChange);

	speeds[thing] *= speedChange;
	upgradeInfo[thing].lvl ++;
	upgradeInfo[thing].price *= 3;

	conveyorStat.innerHTML = `Conveyor: MK ${upgradeInfo['conveyor'].lvl}`;
	drillStat.innerHTML = `Drill: MK ${upgradeInfo['drill'].lvl}`;
	smelterStat.innerHTML = `Smelter: MK ${upgradeInfo['smelter'].lvl}`;

	conveyorUp.innerHTML = `Upgrade conveyor: ${upgradeInfo['conveyor'].price}`;
	drillUp.innerHTML = `Upgrade drill: ${upgradeInfo['drill'].price}`;
	smelterUp.innerHTML = `Upgrade smelter: ${upgradeInfo['smelter'].price}`;

	if(thing != 'smelter') return;
	list.forEach(item => item.changeSpeed());
}

const upHide = document.getElementById('upgradeHide');
const upHold = document.getElementById('upHold');

function hideUp(){
	upHide.classList.remove('upHideShown');
	upHide.classList.add('upHideHidden');
	upHide.innerHTML = '&larr;';
	upHide.onclick = showUp;

	upHold.classList.remove('upHoldShown');
	upHold.classList.add('upHoldHidden');
}

function showUp(){
	upHide.classList.add('upHideShown');
	upHide.classList.remove('upHideHidden');
	upHide.innerHTML = '&rarr;';
	upHide.onclick = hideUp;

	upHold.classList.add('upHoldShown');
	upHold.classList.remove('upHoldHidden');
}