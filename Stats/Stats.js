function getMean(nums)
const iterations = 10000000;
let nums = [];
let mean = 0;
let mad = 0;
let deviationTotal = 0;
let median = 0;
let total = 0;
for (let i = 0; i < iterations; i++) {
    total += nums[i];
}
mean = total/iterations;
for (let i = 0; i < iterations; i++) {
    deviationTotal += nums[i] - mean;
}
mad = deviationTotal/iterations;
nums.sort((a, b) => a - b);
if (iterations % 2 === 0) {
    median = (nums[iterations/2 - 1] + nums[iterations/2])/2;
}else {
    median = nums[Math.floor(iterations/2)];
}

console.log(`Mean: ${mean}`);
console.log(`Median: ${median}`);
console.log(`Mean Absolute Deviation: ${mad}`);

const iterations = 46656;
let sixOfKinds = 0;
let inOrders = 0;
let dice = [];
for(let i = 0; i < iterations; i++) {
    for(let j = 0; j < 6; j++) {
        dice.push(Math.floor(Math.random()*6)+1);
    }
    dice.sort((a, b) => a - b);
    if(dice.toString() == [1, 2, 3, 4, 5, 6].toString()) {
       inOrders++;
    } else if(dice[0] == dice[1] && dice[1] == dice[2] && dice[2] == dice[3] && dice[3] == dice[4] && dice[4] == dice[5]) {
        sixOfKinds++;
    }
    dice = [];
}
console.log(`In Orders: ${inOrders}`);
console.log(`Six of Kinds: ${sixOfKinds}`);
console.log(`In Order Probability: ${inOrders/iterations}`);
console.log(`Six of Kind Probability: ${sixOfKinds/iterations}`);
