export function parseTintColor(str) {
	if (!str || typeof str !== 'string')
		return { r: 255, g: 255, b: 255, a: 1 };

	str = str.trim();

	// --- rgba(...) / rgb(...) ---
	const m = str.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
	if (m) {
		const r = Math.max(0, Math.min(255, +m[1]));
		const g = Math.max(0, Math.min(255, +m[2]));
		const b = Math.max(0, Math.min(255, +m[3]));
		const a = m[4] !== undefined
			? Math.max(0, Math.min(1, +m[4]))
			: 1;
		return { r, g, b, a };
	}

	// --- hex forms ---
	if (str[0] === '#') {
		let hex = str.slice(1).toLowerCase();

		// #RGB or #RGBA -> expand to #RRGGBB / #RRGGBBAA
		if (hex.length === 3 || hex.length === 4) {
			let r = hex[0], g = hex[1], b = hex[2], a = hex[3] ?? 'f';
			hex = r + r + g + g + b + b + a + a; // now 6 or 8 chars
		}

		if (hex.length === 6 || hex.length === 8) {
			const r = parseInt(hex.slice(0, 2), 16);
			const g = parseInt(hex.slice(2, 4), 16);
			const b = parseInt(hex.slice(4, 6), 16);
			let   a = 255;

			if (hex.length === 8)
				a = parseInt(hex.slice(6, 8), 16);

			// guard NaN
			if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) && Number.isFinite(a)) {
				return {
					r: Math.max(0, Math.min(255, r)),
					g: Math.max(0, Math.min(255, g)),
					b: Math.max(0, Math.min(255, b)),
					a: Math.max(0, Math.min(1, a / 255))
				};
			}
		}
	}

	// fallback
	return { r: 255, g: 255, b: 255, a: 1, error: true };
}
console.log(parseTintColor('#ff00bbaa'));

