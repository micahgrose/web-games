const c = document.getElementById('c');
const ctx = c.getContext('2d');
c.width = window.innerWidth;
c.height = window.innerHeight;

let lineWidth = 3;
ctx.lineWidth = lineWidth;

const gravity = 1;

class Line{
	constructor(x1, y1, x2, y2, fricVal = 0){
		this.x1 = x1;
		this.y1 = y1;
		this.x2 = x2;
		this.y2 = y2;
		this.fricVal = fricVal;
	}
}

class Curve{
	// cubic bezier: (x1,y1) -> (x2,y2) with control points (cx1,cy1) and (cx2,cy2)
	// Note: `fricVal` parameter comes after `samples` and overrides per-curve friction (default 0)
	constructor(x1, y1, cx1, cy1, cx2, cy2, x2, y2, samples = 20, fricVal = 0){
		this.x1 = x1; this.y1 = y1;
		this.cx1 = cx1; this.cy1 = cy1;
		this.cx2 = cx2; this.cy2 = cy2;
		this.x2 = x2; this.y2 = y2;
		this.samples = samples;
		// per-curve friction override (number). Default 0 preserves normal behavior.
		this.fricVal = fricVal;
	}

	getPoints(){
		const pts = [];
		for(let i=0;i<=this.samples;i++){
			let t = i/this.samples;
			let u = 1 - t;
			let x = u*u*u*this.x1 + 3*u*u*t*this.cx1 + 3*u*t*t*this.cx2 + t*t*t*this.x2;
			let y = u*u*u*this.y1 + 3*u*u*t*this.cy1 + 3*u*t*t*this.cy2 + t*t*t*this.y2;
			pts.push({x,y});
		}
		return pts;
	}
}

class Rect {
	constructor(x, y, w, h, fricVal = 0) {
		this.x = x;
		this.y = y;
		this.w = w;
		this.h = h;
		this.fricVal = fricVal;
	}

	getLines() {
		return [
			new Line(this.x,        this.y,        this.x + this.w, this.y,        this.fricVal), // top
			new Line(this.x + this.w, this.y,      this.x + this.w, this.y + this.h, this.fricVal), // right
			new Line(this.x,        this.y + this.h, this.x + this.w, this.y + this.h, this.fricVal), // bottom
			new Line(this.x,        this.y,        this.x,          this.y + this.h, this.fricVal), // left
		];
	}
}

const ballSize = 5;

class Ball{
	constructor(x, y, mx=0, my=0, restitution=0.5){
		this.x = x;
		this.y = y;

		this.mx = mx;
		this.my = my;
		this.restitution = restitution;
		this.isStatic = false;
		this.constraintCount = 0;
		this.destroyed = false;
	}
	move(){
		// if static, skip movement entirely
		if (this.isStatic) return;
		
		// reset constraint counter each frame
		this.constraintCount = 0;
		
		// apply gravity
		this.my += gravity;

		// continuous-ish collision: subdivide movement to avoid tunneling
		let speed = Math.hypot(this.mx, this.my);
		let steps = Math.ceil(speed / (ballSize * 0.5));
		if (steps < 1) steps = 1;
		if (steps > 20) steps = 20;

		// base friction settings: flatter surfaces produce more friction
		const frictionBase = 0.0012; // minimum friction
		const frictionRange = 0.0058; // added when surface is fully flat

		for (let i = 0; i < steps; i++) {
			this.x += this.mx / steps;
			this.y += this.my / steps;

			// check collision against each line and project out using dot products
			for (let line of lines) {
				let lx = line.x2 - line.x1;
				let ly = line.y2 - line.y1;
				let len2 = lx*lx + ly*ly;
				if (len2 === 0) continue;

				// vector from line start to ball
				let vx = this.x - line.x1;
				let vy = this.y - line.y1;

				// projection factor t of v onto the line (clamped to segment)
				let t = (vx*lx + vy*ly) / len2;
				if (t < 0) t = 0;
				else if (t > 1) t = 1;

				let closestX = line.x1 + lx * t;
				let closestY = line.y1 + ly * t;

				let dx = this.x - closestX;
				let dy = this.y - closestY;
				let dist2 = dx*dx + dy*dy;
				let minDist = ballSize + (lineWidth/2);

				if (dist2 < minDist*minDist) {
					let dist = Math.sqrt(dist2);
					let nx, ny;
					if (dist === 0) {
						// choose a normal perpendicular to the line when coincident
						nx = -ly;
						ny = lx;
						let nlen = Math.sqrt(nx*nx + ny*ny);
						if (nlen === 0) continue;
						nx /= nlen; ny /= nlen;
					} else {
						nx = dx / dist;
						ny = dy / dist;
					}

					// push ball out of the line by the overlap amount
					let overlap = minDist - dist;
					this.x += nx * overlap;
					this.y += ny * overlap;
					this.constraintCount++; // count this constraint

					// reflect velocity along the normal with restitution
					let vdotn = this.mx * nx + this.my * ny;
					if (vdotn < 0) {
						this.mx = this.mx - (1 + this.restitution) * vdotn * nx;
						this.my = this.my - (1 + this.restitution) * vdotn * ny;
					}

					// apply tangential friction: reduce velocity along tangent
					// apply tangential friction: scale by how flat the surface is
					let tx = -ny;
					let ty = nx;
					// slope factor: tangent x-component magnitude (1 for horizontal, 0 for vertical)
					let slopeFactor = Math.abs(tx);
					let perLine = (line && typeof line.fricVal === 'number') ? line.fricVal : 0;
					let friction = frictionBase + frictionRange * slopeFactor + perLine;
					let vtdot = this.mx * tx + this.my * ty;
					this.mx -= friction * vtdot * tx;
					this.my -= friction * vtdot * ty;
				}
			}
			// also check curves by sampling into small segments
			for (let curve of curves) {
				let pts = curve.getPoints();
				for (let k = 0; k < pts.length - 1; k++) {
					let sx = pts[k].x, sy = pts[k].y, ex = pts[k+1].x, ey = pts[k+1].y;
					let lx = ex - sx;
					let ly = ey - sy;
					let len2c = lx*lx + ly*ly;
					if (len2c === 0) continue;

					let vx2 = this.x - sx;
					let vy2 = this.y - sy;

					let t2 = (vx2*lx + vy2*ly) / len2c;
					if (t2 < 0) t2 = 0;
					else if (t2 > 1) t2 = 1;

					let closestX2 = sx + lx * t2;
					let closestY2 = sy + ly * t2;

					let dx2 = this.x - closestX2;
					let dy2 = this.y - closestY2;
					let dist2c = dx2*dx2 + dy2*dy2;
					let minDist = ballSize + (lineWidth/2);

					if (dist2c < minDist*minDist) {
						let distc = Math.sqrt(dist2c);
						let nx2, ny2;
						if (distc === 0) {
							nx2 = -ly;
							ny2 = lx;
							let nlen2 = Math.sqrt(nx2*nx2 + ny2*ny2);
							if (nlen2 === 0) continue;
							nx2 /= nlen2; ny2 /= nlen2;
						} else {
							nx2 = dx2 / distc;
							ny2 = dy2 / distc;
						}

						let overlap2 = minDist - distc;
						this.x += nx2 * overlap2;
						this.y += ny2 * overlap2;
						this.constraintCount++; // count this constraint
						let vdotnc = this.mx * nx2 + this.my * ny2;
						if (vdotnc < 0) {
							this.mx = this.mx - (1 + this.restitution) * vdotnc * nx2;
							this.my = this.my - (1 + this.restitution) * vdotnc * ny2;
						}

						let tx2 = -ny2;
						let ty2 = nx2;
						let slopeFactor2 = Math.abs(tx2);
						// include per-curve friction override (`fricVal`) if provided; default 0 preserves normal friction
						let perCurve = (curve && typeof curve.fricVal === 'number') ? curve.fricVal : 0;
						let friction2 = frictionBase + frictionRange * slopeFactor2 + perCurve;
						let vtdot2 = this.mx * tx2 + this.my * ty2;
						this.mx -= friction2 * vtdot2 * tx2;
						this.my -= friction2 * vtdot2 * ty2;
					}
				}
			}
			// collision between balls inside same step
			for (let other of balls) {
				if (other === this) continue;
				if (other.destroyed) continue; // skip destroyed balls
				let dx = other.x - this.x;
				let dy = other.y - this.y;
				let dist2b = dx*dx + dy*dy;
				let radiusA = this instanceof DestructorBall ? this.getSize() : ballSize;
				let radiusB = other instanceof DestructorBall ? other.getSize() : ballSize;
				let minDistB = radiusA + radiusB;
				if (dist2b < minDistB*minDistB && dist2b > 0) {
					// check if either ball is a destructor (only destroy non-destructor balls)
					if (this instanceof DestructorBall && !(other instanceof DestructorBall)) {
						other.destroyed = true;
						this.destroyCount++; // increment destroy count
					} else if (other instanceof DestructorBall && !(this instanceof DestructorBall)) {
						this.destroyed = true;
						other.destroyCount++; // increment destroy count
						continue; // don't process physics for this ball anymore
					}
					
					let distb = Math.sqrt(dist2b);
					let nxB = dx / distb;
					let nyB = dy / distb;
					
					// only separate if neither ball is static
					if (!this.isStatic && !other.isStatic) {
						let overlapB = minDistB - distb;
						this.x -= nxB * overlapB * 0.4;
						this.y -= nyB * overlapB * 0.4;
						other.x += nxB * overlapB * 0.4;
						other.y += nyB * overlapB * 0.4;
					} else if (!this.isStatic) {
						// if only other is static, push this ball away
						let overlapB = minDistB - distb;
						this.x -= nxB * overlapB * 0.8;
						this.y -= nyB * overlapB * 0.8;
					} else if (!other.isStatic) {
						// if only this is static, push other ball away
						let overlapB = minDistB - distb;
						other.x += nxB * overlapB * 0.8;
						other.y += nyB * overlapB * 0.8;
					}

					// relative velocity of this ball relative to other
					let rvx = this.mx - other.mx;
					let rvy = this.my - other.my;
					let relVelAlongNormal = rvx * nxB + rvy * nyB;
					
					// only resolve if balls moving toward each other and neither is static
					if (relVelAlongNormal > 0 && !this.isStatic && !other.isStatic) {
						// blended restitution (0 = perfectly inelastic, 1 = perfectly elastic)
						let e = (this.restitution + other.restitution) * 0.5;
						
						// impulse magnitude for equal-mass collision
						// satisfies: conservation of momentum and energy loss via restitution
						let impulseScalar = -(1 + e) * relVelAlongNormal * 0.5;
						
						// apply equal and opposite impulses along collision normal
						this.mx += impulseScalar * nxB;
						this.my += impulseScalar * nyB;
						other.mx -= impulseScalar * nxB;
						other.my -= impulseScalar * nyB;
					}
				}
			}
		}
	}
}
		// if too many constraints, mark as static
		if (this.constraintCount >= 3) {
			this.isStatic = true;
			this.mx = 0;
			this.my = 0;
		}


// DestructorBall: a ball that destroys other balls on contact
class DestructorBall extends Ball {
	constructor(x, y, mx=0, my=0, restitution=0.5) {
		super(x, y, mx, my, restitution);
		this.destroyCount = 0; // track how many balls this has destroyed
	}
	
	getSize() {
		// grows as it destroys more balls: base size + 2 per destroy
		return ballSize + (this.destroyCount * .25);
	}
}

let lines = [
	
];

let curves = [
new Curve(10, 100, 120, 150, 220, 50, 330, 100, 30, 0),
];

let balls = [
	new Ball(ballSize+17, ballSize, 0, 0, 0)
];

let rects = [

];

for(let i=0; i < 50; i++){
	
}

for(let i=0; i < 1; i++){

}


function draw(){
	ctx.clearRect(0, 0, c.width, c.height);
	for(line of lines){
		ctx.beginPath();
		ctx.moveTo(line.x1, line.y1);
		ctx.lineTo(line.x2, line.y2);
		// visual: fully red when fricVal is negative, otherwise black
		if (typeof line.fricVal === 'number' && line.fricVal < 0) {
			ctx.strokeStyle = 'red';
		} else {
			ctx.strokeStyle = 'black';
		}
		ctx.stroke();
	}

	for(curve of curves){
		ctx.beginPath();
		ctx.moveTo(curve.x1, curve.y1);
		ctx.bezierCurveTo(curve.cx1, curve.cy1, curve.cx2, curve.cy2, curve.x2, curve.y2);
		// visual: fully red when fricVal is negative, otherwise black
		if (typeof curve.fricVal === 'number' && curve.fricVal < 0) {
			ctx.strokeStyle = 'red';
		} else {
			ctx.strokeStyle = 'black';
		}
		ctx.stroke();
	}

	ctx.strokeStyle = 'black';

	balls.forEach(b => b.move());

	// remove destroyed balls
	balls = balls.filter(b => !b.destroyed);

	for(ball of balls){
		ctx.beginPath();
		let radius = ball instanceof DestructorBall ? ball.getSize() : ballSize;
		ctx.arc(ball.x, ball.y, radius, 0, 2*Math.PI);
		// destructor balls are red, normal balls are black
		ctx.strokeStyle = ball instanceof DestructorBall ? 'red' : 'black';
		ctx.fill();
	}

	requestAnimationFrame(draw);
}
draw();