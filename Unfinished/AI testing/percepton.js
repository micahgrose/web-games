function Perceptron(iter, learningRate = 0.001){
	this.learnc = learningRate;
	this.bias = 1;
	//random weights for neuron to go off of:
	this.wieghts = [];
	for(let i = 0; i <= iter; i++){
		this.wieghts[i] = Math.random() * 2 - 1; //0 or 1;
	}

	this.active = function(inputs){
		let sum = 0;
		sum += inputs*this.weights;
		if(sum > 0){return 1} else {return 0}
	}

	this.train = function(inputs, desired){
		inputs.push(this.bias);
		let guess = this.active(inputs);
		let error = desired - guess;
		if(error != 0){
			for (let i = 0; i < inputs.length; i++) {
      			this.weights[i] += this.learnc * error * inputs[i];
    		}
		}
	}
}