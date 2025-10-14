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
	const [_subtract, setSubtract] = useState(true);
	const [_fillColor, setFillColor] = useState(_editor.draw2d.fillColor);
	const [_lineColor, setLineColor] = useState(_editor.draw2d.lineColor);
	const [_stroke, setStroke] = useState(_editor.draw2d.lineWidth);
	const [_borderRadius, setBorderRadius] = useState(_editor.draw2d.borderRadius);
	
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
	const drawDrawingOptions = () => {
		if(_tool == 'select' || _tool == 'transform') return;
		
		return (
			<>
				<hr />
				
				<div className='drawbar-draw2d'>
					<div className='gray'>
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
					<div className='mt gray'>
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
					<div className='mt gray'>
						SIZE
					</div>
					<input 
						type="range" 
						orient="vertical"
						value={_stroke}
						min={0.1}
						max={100}
						onChange={e => {
							const val = Number(e.target.value) || 1;
							setStroke(val);
							_editor.draw2d.lineWidth = val;
						}}
					/>
				</div>
				
				<div className='drawbar-draw2d'>
					<div className='mt smallx gray'>
						CURVE
					</div>
					<input 
						type="range" 
						orient="vertical"
						value={_borderRadius}
						min={0}
						max={100}
						onChange={e => {
							const val = Number(e.target.value) || 0;
							setBorderRadius(val);
							_editor.draw2d.borderRadius = val;
						}}
					/>
				</div>
				
				<div className='drawbar-draw2d'>
					<div className='mt gray smallx'>
						MINUS
					</div>
					<input 
						type="checkbox" 
						checked={_subtract} 
						onChange={e => {
							//setSubtract(e.target.checked);
							//_editor.draw2d.subtract = e.target.checked;
						}}
					/>
				</div>
			</>
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
			
			{drawDrawingOptions()}
		</div>
	)
}