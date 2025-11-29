import React, { useEffect, useMemo, useState } from 'react';

function mixedAxis(values, axis) {
	if (!values?.length) return '-';
	const a = values[0]?.[axis];
	for (let i = 1; i < values.length; i++) {
		if (values[i]?.[axis] !== a) return '-';
	}
	return a ?? '-';
}

function deriveDisplay(values) {
	return {
		x: mixedAxis(values, 'x') === '-' ? '-' : String(mixedAxis(values, 'x')),
		y: mixedAxis(values, 'y') === '-' ? '-' : String(mixedAxis(values, 'y')),
		z: mixedAxis(values, 'z') === '-' ? '-' : String(mixedAxis(values, 'z')),
	};
}

function toScalar(str) {
	if (str === '-' || str === '' || str === '+' ) return '-';
	const n = Number.parseFloat(str);
	return Number.isFinite(n) ? n : '-';
}

export default function VectorInput({
	label,
	values = [],
	onChange, // (vectorLikeWithDash)
	onSave,   // (vectorLikeWithDash)
	type = 'Vector3'
}) {
	const sig = useMemo(() => Array.isArray(values) ? values.map(v => `${v?.x},${v?.y},${v?.z}`).join('|') : '', [values]);
	const initial = useMemo(() => deriveDisplay(values), [sig]);

	const [str, setStr] = useState(initial);
	useEffect(() => { setStr(initial); }, [initial.x, initial.y, initial.z]);

	function emit(cb) {
		const v = { x: toScalar(str.x), y: toScalar(str.y), z: toScalar(str.z) };
		cb?.(v);
	}

	function handleChange(axis, next) {
		setStr(prev => ({ ...prev, [axis]: next }));
		emit(onChange);
	}

	function handleBlur(axis, raw) {
		const v = { ...str, [axis]: raw };
		const fixed = {
			x: toScalar(v.x),
			y: toScalar(v.y),
			z: toScalar(v.z),
		};
		setStr({
			x: fixed.x === '-' ? '-' : String(fixed.x),
			y: fixed.y === '-' ? '-' : String(fixed.y),
			z: fixed.z === '-' ? '-' : String(fixed.z),
		});
		onSave?.(fixed);
	}

	function onKeyDown(e) {
		if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
	}

	function onFocus(axis) {
		setStr(prev => (prev[axis] === '-' ? { ...prev, [axis]: '' } : prev));
	}

	return (
		<div className="vector-input">
			{label ? <label>{label}</label> : null}
			{(type == 'Vector2' ? ['x', 'y'] : ['x', 'y', 'z']).map(axis => (
				<input
					key={axis}
					className="tf"
					type="text"
					inputMode="decimal"
					value={str[axis] ?? ''}
					onFocus={() => onFocus(axis)}
					onChange={e => handleChange(axis, e.target.value)}
					onBlur={e => handleBlur(axis, e.target.value)}
					onKeyDown={onKeyDown}
					aria-label={axis.toUpperCase()}
				/>
			))}
		</div>
	);
}