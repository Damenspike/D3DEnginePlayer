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
import ColorPicker from './ColorPicker.jsx';

const DrawTools = [
	'select',
	'draw'
]

export default function DrawBar() {
	const [_tool, setTool] = useState(_editor.tool);
	const [_fill, setFill] = useState(true);
	const [_line, setLine] = useState(true);
	const [_fillColor, setFillColor] = useState(_editor.draw2d.fillColor);
	const [_lineColor, setLineColor] = useState(_editor.draw2d.lineColor);
	const [_stroke, setStroke] = useState(_editor.draw2d.lineWidth);
	
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
			
			<hr />
			
			<div className='drawbar-draw2d'>
				<div className='small gray'>
					FILL
				</div>
				<input 
					type="checkbox" 
					checked={_fill} 
					onChange={e => {
						setFill(e.target.checked);
						_editor.draw2d.fill = e.target.checked;
					}}
				/>
				{_fill && (
					<ColorPicker
						value={_fillColor}
						displayMode='small'
						onChange={val => {
							setFillColor(val);
							_editor.draw2d.fillColor = val;
						}}
					/>
				)}
			</div>
			
			<div className='drawbar-draw2d'>
				<div className='mt small gray'>
					LINE
				</div>
				<input 
					type="checkbox" 
					checked={_line} 
					onChange={e => {
						setLine(e.target.checked);
						_editor.draw2d.line = e.target.checked;
					}}
				/>
				{_line && (
					<ColorPicker
						value={_lineColor}
						displayMode='small'
						onChange={val => {
							setLineColor(val);
							_editor.draw2d.lineColor = val;
						}}
					/>
				)}
			</div>
			
			<div className='drawbar-draw2d'>
				<div className='mt smallx gray'>
					STROKE
				</div>
				<input 
					type="number" 
					className='tf'
					value={_stroke}
					onChange={e => {
						const val = Number(e.target.value) || 1;
						setStroke(val);
						_editor.draw2d.lineWidth = val;
					}}
				/>
			</div>
		</div>
	)
}