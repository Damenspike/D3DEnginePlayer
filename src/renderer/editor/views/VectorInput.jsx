import React, { useEffect, useState } from 'react';

export default function VectorInput({ label, value, onSave }) {
	const safe = (v) => ({
		x: typeof v?.x === 'number' ? String(v.x) : (v?.x ?? '0'),
		y: typeof v?.y === 'number' ? String(v.y) : (v?.y ?? '0'),
		z: typeof v?.z === 'number' ? String(v.z) : (v?.z ?? '0'),
	});

	const [v, setV] = useState(safe(value));

	// 🔑 re-sync when any scalar changes (not just the object reference)
	useEffect(() => {
		setV(safe(value));
	}, [value?.x, value?.y, value?.z]);

	function handleChange(axis, str) {
		// allow empty / partial numeric input while typing
		setV(prev => ({ ...prev, [axis]: str }));
	}

	function handleBlur(axis, str) {
		// parse number (fall back to 0 on NaN)
		const num = Number.parseFloat(str);
		const next = {
			x: axis === 'x' ? (Number.isFinite(num) ? num : 0) : Number.parseFloat(v.x) || 0,
			y: axis === 'y' ? (Number.isFinite(num) ? num : 0) : Number.parseFloat(v.y) || 0,
			z: axis === 'z' ? (Number.isFinite(num) ? num : 0) : Number.parseFloat(v.z) || 0,
		};
		setV({ x: String(next.x), y: String(next.y), z: String(next.z) });
		onSave?.(next);
	}

	// Optional: blur on Enter/Escape
	function onKeyDown(e) {
		if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
	}

	return (
		<div className="vector-input">
			<label>{label}</label>
			{(['x','y','z']).map(axis => (
				<input
					key={axis}
					className="tf"
					type="number"
					inputMode="decimal"
					value={v[axis] ?? ''}          // keep as string while editing
					onChange={e => handleChange(axis, e.target.value)}
					onBlur={e => handleBlur(axis, e.target.value)}
					onKeyDown={onKeyDown}
				/>
			))}
		</div>
	);
}