import React, { useEffect, useState } from 'react';
import { MdMoreHoriz } from 'react-icons/md';
import { HiPlus } from "react-icons/hi";

export default function InspectorCell({ 
	id, title, defaultOpen = true, children,
	expanded = false, onExpand = null
}) {
	const key = 'insp-collapsed:' + (id || '');
	const [open, setOpen] = useState(defaultOpen);
	const [init, setInit] = useState(false);

	useEffect(() => {
		const saved = localStorage.getItem(key);
		if (saved === '1') setOpen(false);
		if (saved === '0') setOpen(true);
		setInit(true);
	}, [key]);

	useEffect(() => {
		localStorage.setItem(key, open ? '0' : '1');
	}, [key, open]);
	
	if(!init)
		return;

	return (
		<div className={`inspector-cell${open ? '' : ' collapsed'} shade`} id={id} tabIndex={1}>
			<div className="insp-title" role="button" tabIndex={0}
				onClick={() => setOpen(!open)}
				onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
			>
				{title}
				{onExpand && open && (
					<button 
						className={`insp-expand ${expanded ? 'insp-expand--expanded' : ''}`}
						onClick={e => {
							onExpand();
							e.stopPropagation();
							e.preventDefault();
						}}
					>
						<HiPlus />
					</button>
				)}
			</div>
			{open && <div className="insp-body">{children}</div>}
		</div>
	);
}