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
		this.transform();
		document.body.appendChild(this.element);

		if(type == 'static') return;
		this.element.onclick = () => this.readyChangePos(this);
	}

	readyChangePos(obj){
		obj.initiate = true;
		obj.dragging = true;
		obj.element.style.opacity = .5;
	}

	rotate(){
		this.dir = (cell.dir % 4) + 1;
		this.transform();
	}

	changePos(){
		let x = Math.floor(((event.clientX)/tile));
		let y = Math.floor(((event.clientY)/tile)-1);
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

				for(let i = chain.length; i >= 0; i--){
					if(chain[i]){
						chain[i].move(this.dir);
						chain[i].transform();
					}
				}

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