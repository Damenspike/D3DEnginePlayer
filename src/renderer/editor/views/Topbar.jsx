import React, { useState, useEffect } from 'react';

import { 
	MdNavigation,
	MdOpenWith,
	MdOutlineSync,
	MdCameraswitch,
	MdCode
} from "react-icons/md";
import { BiExpand } from "react-icons/bi";

export default function Topbar() {
	const [_tool, setTool] = useState(_editor.tool);
	const [_transformTool, setTransformTool] = useState(_editor.transformTool);
	const [_mode, setMode] = useState(_editor.mode);
	
	useEffect(() => {
		function onKey(e) {
			const el = document.activeElement;
			if (!el || !el.classList.contains('tool-option')) return;
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				el.click();
			}
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, []);
	
	useEffect(() => {
		_events.on('editor-tool', tool => setTool(tool));
		_events.on('editor-transform-tool', tool => setTransformTool(tool));
		_events.on('editor-mode', mode => setMode(mode));
	}, []);
	
	useEffect(() => {
		_editor.setTool(_tool);
	}, [_tool]);
	
	useEffect(() => {
		_editor.setMode(_mode);
	}, [_mode]);
	
	useEffect(() => {
		_editor.setTransformTool(_transformTool);
	}, [_transformTool]);
	
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
		<div className="topbar" id="topbar-view">
			<div className="tools-section">
				{
					drawToolButton(
						(<MdNavigation />),
						() => _tool == 'select',
						() => setTool('select')
					)
				}
				{
					drawToolButton(
						(<MdCameraswitch />),
						() => _tool == 'pan',
						() => setTool('pan')
					)
				}
			</div>

			<div className="tools-section">
				{
					drawToolButton(
						(<MdOpenWith />),
						() => _transformTool == 'translate',
						() => setTransformTool('translate')
					)
				}
				{
					drawToolButton(
						(<MdOutlineSync />),
						() => _transformTool == 'rotate',
						() => setTransformTool('rotate')
					)
				}
				{
					drawToolButton(
						(<BiExpand />),
						() => _transformTool == 'scale',
						() => setTransformTool('scale')
					)
				}
			</div>
			
			<div className="tools-section">
				{
					drawToolButton(
						(<div className='btn-2d-3d'>2D</div>),
						() => _mode == '2D',
						() => setMode('2D')
					)
				}
				{
					drawToolButton(
						(<div className='btn-2d-3d'>3D</div>),
						() => _mode == '3D',
						() => setMode('3D')
					)
				}
			</div>
			
			<div className="tools-section">
				{
					drawToolButton(
						(<MdCode />),
						() => false,
						() => _editor.editCode()
					)
				}
			</div>
		</div>
	);
}