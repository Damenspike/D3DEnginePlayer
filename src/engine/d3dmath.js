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
Math.rand = (min, max) => {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default class D3DMath {
	
}