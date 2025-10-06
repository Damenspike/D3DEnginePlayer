import { useMemo, useRef, useCallback } from 'react';
import { RgbaColorPicker } from 'react-colorful';

/* --- helpers --- */
const normalizeHex = (hex) => {
	if (!hex) return '0xFFFFFFFF';
	if (hex.startsWith('#')) hex = '0x' + hex.slice(1);
	let n = Number(hex);
	if (!Number.isFinite(n)) n = 0xFFFFFFFF;
	return '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0'); // RRGGBBAA
};

export function hexToRgbaObj(hex) {
	const h = normalizeHex(String(hex));
	const n = Number(h);
	const r = (n >>> 24) & 0xFF;
	const g = (n >>> 16) & 0xFF;
	const b = (n >>>  8) & 0xFF;
	const a = (n & 0xFF) / 255;
	return { r, g, b, a };
}

export function rgbaObjToHex({ r, g, b, a }) {
	const rr = (r & 255) | 0;
	const gg = (g & 255) | 0;
	const bb = (b & 255) | 0;
	const aa = Math.max(0, Math.min(255, Math.round((a ?? 1) * 255)));
	const n = (((rr << 24) >>> 0) | (gg << 16) | (bb << 8) | aa) >>> 0;
	return '0x' + n.toString(16).toUpperCase().padStart(8, '0');
}

/* --- component --- */
export default function ColorPicker({
	value,
	onChange,
	onBlur,
	onKeyDown,
	onClick,
	readOnly = false
}) {
	const propHex = normalizeHex(String(value ?? '0xFFFFFFFF'));
	const rgba = useMemo(() => hexToRgbaObj(propHex), [propHex]);

	// last value we told the parent
	const lastEmittedRef = useRef(propHex);
	if (lastEmittedRef.current !== propHex) {
		lastEmittedRef.current = propHex; // sync when parent changes externally
	}

	const emitChange = useCallback((rgbaVal) => {
		if (readOnly) return;
		const hex = rgbaObjToHex(rgbaVal);
		if (hex === lastEmittedRef.current) return; // guard: no echo
		lastEmittedRef.current = hex;
		onChange?.(hex);
	}, [onChange, readOnly]);

	const handlePointerUp = useCallback(() => {
		if (readOnly) return;
		onBlur?.(lastEmittedRef.current);
	}, [onBlur, readOnly]);

	const handleBlur = useCallback(() => {
		if (readOnly) return;
		onBlur?.(lastEmittedRef.current);
	}, [onBlur, readOnly]);

	return (
		<div
			className="color-field"
			tabIndex={readOnly ? -1 : 0}
			onKeyDown={readOnly ? undefined : onKeyDown}
			onClick={() => onClick?.(propHex)}
			onPointerUp={handlePointerUp}
			onBlur={handleBlur}
			style={readOnly ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
		>
			<RgbaColorPicker color={rgba} onChange={emitChange} />
		</div>
	);
}