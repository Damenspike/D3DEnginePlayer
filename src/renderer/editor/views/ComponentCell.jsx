import React, { useEffect, useState } from 'react';

export default function ComponentCell({ 
	title, 
	children,
	bar,
	enabled,
	onToggleEnable,
	togglable = false,
	defaultOpen = true 
}) {
	const [open, setOpen] = useState(defaultOpen);
	
	const drawCheckbox = () => (
		<input 
			type="checkbox" 
			className='component-toggle'
			checked={!!enabled} 
			onClick={e => {
				e.stopPropagation();
			}}
			onChange={e => onToggleEnable(!!e.target.checked)}
		/>
	)

	return (
		<div className={`component-cell inspector-cell${open ? '' : ' collapsed'} shade material-editor-cell`} tabIndex={1}>
			<div className="insp-title" role="button" tabIndex={0}
				onClick={() => setOpen(!open)}
				onKeyDown={e => { 
					if (e.key === 'Enter' || e.key === ' ') { 
						e.preventDefault(); 
						setOpen(!open); 
					}
				}}
			>
				{togglable && drawCheckbox()}
				{title}
				{bar}
			</div>
			{open && <div className="insp-body">{children}</div>}
		</div>
	);
}