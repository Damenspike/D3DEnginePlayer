import Tween from './d3dtween.js';

Math.lerp = (a, b, time, easeFn) => {
	const fn = easeFn || Tween.Linear;
	const u  = Math.max(0, Math.min(1, time));
	return a + (b - a) * fn(u);
};
Math.reverseNumber = (value, min, max) => {
	return (max + min) - value;
}
Math.rcoeff = (value) => {
	return Math.reverseNumber(value, 0.0, 1.0);
}
Math.clamp = function(value, min, max) {
	return Math.min(Math.max(value, min), max);
}
Math.clamp01 = function(value) {
	return Math.min(Math.max(value, 0), 1);
}
Math.norm180 = d => {
	let a = (d + 180) % 360;
	if (a < 0) a += 360;
	return a - 180;
}
Math.randInt = (min, max) => {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}
Math.rand = (min = 0, max = 1) => {
	if(min > max) {
		const t = min;
		min = max;
		max = t;
	}
	
	return min + (max - min) * Math.random();
}
Math.randVec3 = (a, b) => {
	return {
		x: rand(Math.min(a.x, b.x), Math.max(a.x, b.x)),
		y: rand(Math.min(a.y, b.y), Math.max(a.y, b.y)),
		z: rand(Math.min(a.z, b.z), Math.max(a.z, b.z))
	};
}

export default class D3DMath {
	
}

export const rand = Math.rand;
export const randInt = Math.randInt;
export const randVec3 = Math.randVec3;
export const clamp01 = Math.clamp01;
export const clamp = Math.clamp;