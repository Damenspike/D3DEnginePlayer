const Tween = {
	Linear: (u) => u,
	
	// Quadratic
	EaseIn:  (u) => u * u,
	EaseOut: (u) => 1 - (1 - u) * (1 - u),
	EaseInOut: (u) => (u < 0.5) ? 2*u*u : 1 - Math.pow(-2*u + 2, 2) / 2,
	
	// Cubic
	EaseInCubic:  (u) => u*u*u,
	EaseOutCubic: (u) => 1 - Math.pow(1 - u, 3),
	EaseInOutCubic: (u) => (u < 0.5) ? 4*u*u*u : 1 - Math.pow(-2*u + 2, 3) / 2,
	
	// Sine
	EaseInSine:  (u) => 1 - Math.cos((u * Math.PI) / 2),
	EaseOutSine: (u) => Math.sin((u * Math.PI) / 2),
	EaseInOutSine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
};

export default Tween;