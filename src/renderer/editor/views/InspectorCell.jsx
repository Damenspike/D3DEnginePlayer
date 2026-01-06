import React, { useEffect, useState } from 'react';
import { MdMoreHoriz } from 'react-icons/md';
import { HiPlus } from "react-icons/hi";

export default function InspectorCell({ 
	id, title, icon = null, defaultOpen = true, children,
	expanded = false, onExpand = null, onDragOver = null, onDrop = null, alwaysOpen = null
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
	
	const isOpen = alwaysOpen ? true : open;
	
	return (
		<div className={`inspector-cell${isOpen ? '' : ' collapsed'} shade`} id={id} tabIndex={1}>
			<div className="insp-title" role="button" tabIndex={0}
				onClick={() => {
					if(alwaysOpen)
						return;
					setOpen(!open)
				}}
				onKeyDown={e => { 
					if(alwaysOpen)
						return;
					if (e.key === 'Enter' || e.key === ' ') { 
						e.preventDefault(); 
						setOpen(!open); 
					}
				}}
			>
				{icon && (
					<div className='insp-title__icon'>
						{icon}
					</div>
				)}
				{title}
				{onExpand && isOpen && (
					<button 
						className={`insp-expand ${expanded ? 'insp-expand--expanded' : ''}`}
						onClick={e => {
							onExpand();
							e.stopPropagation();
							e.preventDefault();
						}}
					>
						<MdMoreHoriz />
					</button>
				)}
			</div>
			{isOpen && (
				<div 
					className="insp-body"
					onDragOver={onDragOver}
					onDrop={onDrop}
				>
					{children}
				</div>
			)}
		</div>
	);
}