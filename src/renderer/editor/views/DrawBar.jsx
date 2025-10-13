import { useState, useEffect, useRef } from 'react';
import { 
	MdNavigation,
	MdBrush,
	MdTransform,
	MdOutlineDraw,
	MdEdit,
	MdRemove,
	MdOutlineRectangle,
	MdOutlineCircle
} from 'react-icons/md';
import { RiFlowChart } from "react-icons/ri";
import { CgColorBucket } from "react-icons/cg";

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
					(<MdEdit />),
					() => _tool == 'pencil',
					() => setTool('pencil'),
					'Pencil'
				)
			}
			{
				drawToolButton(
					(<div style={{transform: 'rotate(45deg) translateX(1px) translateY(4px)'}}><MdRemove /></div>),
					() => _tool == 'line',
					() => setTool('line'),
					'Line'
				)
			}
			{
				drawToolButton(
					(<MdOutlineRectangle />),
					() => _tool == 'square',
					() => setTool('square'),
					'Square'
				)
			}
			{
				drawToolButton(
					(<MdOutlineCircle />),
					() => _tool == 'circle',
					() => setTool('circle'),
					'Circle'
				)
			}
			{
				drawToolButton(
					(<RiFlowChart />),
					() => _tool == 'polygon',
					() => setTool('polygon'),
					'Polygon'
				)
			}
			{
				drawToolButton(
					(<CgColorBucket />),
					() => _tool == 'fill',
					() => setTool('fill'),
					'Fill'
				)
			}
		</div>
	)
}