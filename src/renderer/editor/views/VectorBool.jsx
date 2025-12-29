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
		x: mixedAxis(values, 'x'),
		y: mixedAxis(values, 'y'),
		z: mixedAxis(values, 'z'),
	};
}

export default function VectorBool({
	label,
	values = [],
	onChange, // ({x: 0|1|'-', y: 0|1|'-', z: 0|1|'-'})
	onSave,   // ({x: 0|1|'-', y: 0|1|'-', z: 0|1|'-'})
	type = 'Vector3'
}) {
	const sig = useMemo(
		() => Array.isArray(values) ? values.map(v => `${v?.x},${v?.y},${v?.z}`).join('|') : '',
		[values]
	);

	const initial = useMemo(() => deriveDisplay(values), [sig]);
	const [v, setV] = useState(initial);

	useEffect(() => { setV(initial); }, [initial.x, initial.y, initial.z]);

	const axes = (type === 'Vector2') ? ['x', 'y'] : ['x', 'y', 'z'];

	function emit(next, cb) {
		cb?.({
			x: axes.includes('x') ? (next.x ?? '-') : '-',
			y: axes.includes('y') ? (next.y ?? '-') : '-',
			z: axes.includes('z') ? (next.z ?? '-') : '-'
		});
	}

	function toggle(axis, checked) {
		const next = { ...v, [axis]: checked ? 1 : 0 };
		setV(next);
		emit(next, onChange);
	}

	function save(axis, checked) {
		const next = { ...v, [axis]: checked ? 1 : 0 };
		setV(next);
		emit(next, onSave);
	}

	return (
		<div className="vector-input vector-bool">
			{label ? <label>{label}</label> : null}

			{axes.map(axis => {
				const val = v?.[axis];
				const mixed = val === '-';
				const checked = !mixed && !!val;

				return (
					<label key={axis} className="vector-bool-axis" aria-label={axis.toUpperCase()}>
						<span className="vector-bool-axis-label">{axis.toUpperCase()}</span>
						<input
							type="checkbox"
							checked={checked}
							ref={el => {
								if (el) el.indeterminate = mixed;
							}}
							onChange={e => toggle(axis, e.target.checked)}
							onBlur={e => save(axis, e.target.checked)}
						/>
					</label>
				);
			})}
		</div>
	);
}