import { useState, useEffect, useRef } from 'react';
import { 
	MdNavigation,
	MdBrush,
	MdTransform,
	MdOutlineDraw,
	MdRemove
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
	
	const drawToolButton = (content, activeCondition, onClick, title = '') => {
		const classes = ['tool-option', 'no-select'];
		
		if(activeCondition() == true)
			classes.push('tool-option--active');
		
		return (
			<div 
				className={classes.join(' ')}
				onClick={onClick} 
				title={title}
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
					() => setTool('select'),
					'Select'
				)
			}
			{
				drawToolButton(
					(<MdTransform />),
					() => _tool == 'transform',
					() => setTool('transform'),
					'Transform'
				)
			}
			{
				drawToolButton(
					(<MdBrush />),
					() => _tool == 'brush',
					() => setTool('brush'),
					'Brush'
				)
			}
			{
				drawToolButton(
					(<MdOutlineDraw />),
					() => _tool == 'pencil',
					() => setTool('pencil'),
					'Pencil'
				)
			}
			{
				drawToolButton(
					(<MdRemove />),
					() => _tool == 'line',
					() => setTool('line'),
					'Line'
				)
			}
		</div>
	)
}