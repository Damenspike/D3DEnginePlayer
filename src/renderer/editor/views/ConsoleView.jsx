import React, { useState, useEffect, useRef } from 'react';
import AnimationInspector from './AnimationInspector.jsx';

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
				return (
					<p>Console here</p>
				)
			}
			case Tabs.Animation: {
				return <AnimationInspector />
			}
		}
	}
	
	return (
		<div className='console-view'>
			<div className='tabs'>
				{drawTabButtons()}
			</div>
			<div className='tab-content'>
				{drawTabContent()}
			</div>
		</div>
	)
}