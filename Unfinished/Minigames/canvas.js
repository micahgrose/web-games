const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;


let offset = 0;

function loop(){

	switch(offset){
	case 0:
		ctx.fillStyle = `rgba(${Math.random()*255-900}, ${Math.random()*255}, ${Math.random()*255}, ${Math.random()})`;
		ctx.fillRect(Math.random()*window.innerWidth, Math.random()*window.innerHeight, Math.random()*(window.innerWidth/10), Math.random()*(window.innerHeight/10));
		break;
	case 1:
		ctx.fillStyle = `rgba(${Math.random()*255}, ${Math.random()*255-900}, ${Math.random()*255}, ${Math.random()})`;
		ctx.fillRect(Math.random()*window.innerWidth, Math.random()*window.innerHeight, Math.random()*(window.innerWidth/10), Math.random()*(window.innerHeight/10));
		break;
	case 2:
		ctx.fillStyle = `rgba(${Math.random()*255}, ${Math.random()*255}, ${Math.random()*255-900}, ${Math.random()})`;
		ctx.fillRect(Math.random()*window.innerWidth, Math.random()*window.innerHeight, Math.random()*(window.innerWidth/10), Math.random()*(window.innerHeight/10));
		break;
	case 3:
		offset = 0;
		break;
	}
	

requestAnimationFrame(loop)
}
requestAnimationFrame(loop);

setInterval(() => {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	offset ++;
}, 10000);
