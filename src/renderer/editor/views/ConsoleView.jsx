import React, { useState, useEffect, useRef } from 'react';
import AnimationInspector from './AnimationInspector.jsx';
import ConsoleInspector from './ConsoleInspector.jsx';

const Tabs = {
	Console: 'console',
	Animation: 'animation'
}

export default function ConsoleView() {
	const [tab, setTab] = useState(Tabs.Console);
	
	const drawTabButtons = () => {
		const rows = [];
		
		for(let tabName in Tabs) {
			const id = Tabs[tabName];
			const classes = ['tab'];
			
			if(tab == id)
				classes.push('tab--selected');
			
			rows.push(
				<div 
					className={classes.join(' ')} 
					onClick={() => setTab(id)}
					key={rows.length}
				>
					{tabName}
				</div>
			)
		}
		
		return rows;
	}
	const drawTabContent = () => {
		switch(tab) {
			case Tabs.Console: {
				return <ConsoleInspector />
			}
			case Tabs.Animation: {
				return <AnimationInspector />
			}
		}
	}
	
	return (
		<div className='console-view'>
			<div className='tabs no-scrollbar'>
				{drawTabButtons()}
			</div>
			<div className='tab-content'>
				{drawTabContent()}
			</div>
		</div>
	)
}