import React, { useEffect, useState } from 'react';

export default function ComponentCell({ title, defaultOpen = true, children }) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<div className={`inspector-cell${open ? '' : ' collapsed'} component-cell`} tabIndex={1}>
			<div className="insp-title" role="button" tabIndex={0}
				onClick={() => setOpen(!open)}
				onKeyDown={e => { 
					if (e.key === 'Enter' || e.key === ' ') { 
						e.preventDefault(); 
						setOpen(!open); 
					}
				}}
			>
				{title}
			</div>
			{open && <div className="insp-body">{children}</div>}
		</div>
	);
}