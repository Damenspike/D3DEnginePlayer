import React, { useEffect, useState } from 'react';

export default function InspectorCell({ id, title, defaultOpen = true, children }) {
	const key = 'insp-collapsed:' + (id || '');
	const [open, setOpen] = useState(defaultOpen);

	useEffect(() => {
		const saved = localStorage.getItem(key);
		if (saved === '1') setOpen(false);
		if (saved === '0') setOpen(true);
	}, [key]);

	useEffect(() => {
		localStorage.setItem(key, open ? '0' : '1');
	}, [key, open]);

	return (
		<div className={`inspector-cell${open ? '' : ' collapsed'}`} id={id} tabIndex={1}>
			<div className="insp-title" role="button" tabIndex={0}
				onClick={() => setOpen(!open)}
				onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}>
				{title}
			</div>
			{open && <div className="insp-body">{children}</div>}
		</div>
	);
}