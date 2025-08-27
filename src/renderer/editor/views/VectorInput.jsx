import React, { useState, useEffect } from 'react';

export default function VectorInput({ label, value, onSave }) {
	const [v, setV] = useState(value || { x: 0, y: 0, z: 0 });
	useEffect(() => setV(value || { x: 0, y: 0, z: 0 }), [value]);

	function save(next) {
		setV(next);
		onSave(next);
	}
	return (
		<div className="vector-input">
			<label>{label}</label>
			<input className="tf" type="number" value={v.x} onChange={e => save({ ...v, x: Number(e.target.value) })} />
			<input className="tf" type="number" value={v.y} onChange={e => save({ ...v, y: Number(e.target.value) })} />
			<input className="tf" type="number" value={v.z} onChange={e => save({ ...v, z: Number(e.target.value) })} />
		</div>
	);
}