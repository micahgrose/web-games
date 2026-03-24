const iterations = 10000000;
let nums = [];
for (let i = 0; i < iterations; i++) {
  nums.push(Math.random()*100);
}
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