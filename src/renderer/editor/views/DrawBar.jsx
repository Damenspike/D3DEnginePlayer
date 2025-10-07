import { useState, useEffect, useRef } from 'react';
import { 
	MdNavigation,
	MdBrush
} from 'react-icons/md';

const DrawTools = [
	'select',
	'draw'
]

export default function DrawBar() {
	const [_tool, setTool] = useState(_editor.tool);
	
	useEffect(() => {
		_editor.setTool(_tool);
	}, [_tool]);
	
	useEffect(() => {
		_events.on('editor-tool', tool => setTool(tool));
	}, []);
	
	const drawToolButton = (content, activeCondition, onClick) => {
		const classes = ['tool-option', 'no-select'];
		
		if(activeCondition() == true)
			classes.push('tool-option--active');
		
		return (
			<div 
				className={classes.join(' ')}
				onClick={onClick} 
				tabIndex={0}
			>
				{content}
			</div>
		)
	}
	
	return (
		<div className='drawbar-tools'>
			{
				drawToolButton(
					(<MdNavigation />),
					() => _tool == 'select',
					() => setTool('select')
				)
			}
			{
				drawToolButton(
					(<MdBrush />),
					() => _tool == 'draw',
					() => setTool('draw')
				)
			}
		</div>
	)
}