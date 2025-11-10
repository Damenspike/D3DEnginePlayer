import React, { useState, useEffect } from 'react';

import { 
	MdNavigation,
	MdOpenWith,
	MdOutlineSync,
	MdCameraswitch,
	MdCode,
	MdPlayArrow,
	MdBackHand,
	MdLightbulb
} from "react-icons/md";
import { PiHandGrabbingFill } from "react-icons/pi";
import { BiExpand } from "react-icons/bi";

import smallLogoLight from '../../../assets/images/d3dicon-small.png';
import smallLogoDark from '../../../assets/images/d3dicon-small-dark.png';

export default function Topbar() {
	const [_tool, setTool] = useState(_editor.tool);
	const [_transformTool, setTransformTool] = useState(_editor.transformTool);
	const [_mode, setMode] = useState(_editor.mode);
	const [_lightsEnabled, setLightsEnabled] = useState(_editor.lightsEnabled);
	
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
	
	useEffect(() => {
		_editor.lightsEnabled = _lightsEnabled;
	}, [_lightsEnabled]);
	
	const openDamen3DWebsite = () => {
		D3D.openWebsite();
	}
	
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
		<div className="topbar" id="topbar-view">
			<div className="tools-section">
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
						(<MdCameraswitch />),
						() => _tool == 'look',
						() => setTool('look'),
						'3D camera look'
					)
				}
				{
					drawToolButton(
						(<PiHandGrabbingFill />),
						() => _tool == 'pan',
						() => setTool('pan'),
						'Pan'
					)
				}
			</div>

			<div className="tools-section">
				{
					drawToolButton(
						(<MdOpenWith />),
						() => _transformTool == 'translate',
						() => setTransformTool('translate'),
						'Translate tool'
					)
				}
				{
					drawToolButton(
						(<MdOutlineSync />),
						() => _transformTool == 'rotate',
						() => setTransformTool('rotate'),
						'Rotate tool'
					)
				}
				{
					drawToolButton(
						(<BiExpand />),
						() => _transformTool == 'scale',
						() => setTransformTool('scale'),
						'Scale tool'
					)
				}
			</div>
			
			<div className="tools-section">
				{
					drawToolButton(
						(<div className='btn-2d-3d'>2D</div>),
						() => _mode == '2D',
						() => setMode('2D'),
						'2D edit mode'
					)
				}
				{
					drawToolButton(
						(<div className='btn-2d-3d'>3D</div>),
						() => _mode == '3D',
						() => setMode('3D'),
						'3D edit mode'
					)
				}
			</div>
			
			<div className="tools-section">
				{
					drawToolButton(
						(<MdCode />),
						() => false,
						() => _editor.editCode(),
						'Code editor'
					)
				}
				{
					drawToolButton(
						(<MdPlayArrow />),
						() => false,
						() => D3D.echoBuild({prompt: false, play: true}),
						'Build and play'
					)
				}
			</div>
			
			<div className="tools-section">
				{
					drawToolButton(
						(<MdLightbulb />),
						() => _lightsEnabled,
						() => setLightsEnabled(!_lightsEnabled),
						'Lights'
					)
				}
			</div>
			
			<div className="small-logo no-select" onClick={openDamen3DWebsite}>
				<img src={_host.theme == 'dark' ? smallLogoLight : smallLogoDark} />
			</div>
		</div>
	);
}