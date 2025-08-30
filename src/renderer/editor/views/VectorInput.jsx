import React, { useState, useEffect } from 'react';

const autoBlur = (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();   // stop form submit
		e.currentTarget.blur();
	}
}

export default function VectorInput({ label, value, onSave }) {
	const [v, setV] = useState(value || { x: 0, y: 0, z: 0 });
	
	useEffect(() => setV(value || { x: 0, y: 0, z: 0 }), [value]);

	function handleChange(axis, str) {
		// update as string
		setV({ ...v, [axis]: str });
	}

	function handleBlur(axis, str) {
		// parse on blur
		const num = parseFloat(str);
		const newV = { ...v, [axis]: isNaN(num) ? 0 : num };
		setV(newV);
		onSave(newV);
	}

	return (
		<div className="vector-input">
			<label>{label}</label>
			{['x','y','z'].map(axis => (
				<input
					key={axis}
					className="tf"
					type="number"
					value={v[axis]}
					onChange={e => handleChange(axis, e.target.value)}
					onBlur={e => handleBlur(axis, e.target.value)}
					onKeyDown={autoBlur}
				/>
			))}
		</div>
	);
}