import React, { forwardRef, useState, useEffect } from 'react';
import InspectorCell from './InspectorCell.jsx';
import VectorInput from './VectorInput.jsx';

const autoBlur = (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();   // stop form submit
		e.currentTarget.blur();
	}
}

export default function Inspector() {
	const _editor = window._editor;
	
	const [object, setObject] = useState();
	const [dummyObject, setDummyObject] = useState();
	const [dummyProject, setDummyProject] = useState();
	
	useEffect(() => {
		_editor.onProjectLoaded = () => {
			setDummyProject({..._editor.project});
		}
		_editor.onObjectSelected = (objects) => {
			console.log(objects);
			setObject(objects[0]);
		}
	}, []);
	
	useEffect(() => {
		setDummyObject(object ? {...object} : {});
	}, [object]);
	
	const update = () => {
		setDummyObject({...dummyObject});
		setDummyProject({...dummyProject});
	}
	
	const drawObjectInspector = () => {
		return (
			<InspectorCell 
				id="insp-cell-object" 
				title="Object" 
			>
				<div className="field">
					<label>Name</label>
					<input 
						className="tf" 
						type="text" 
						value={dummyObject.name} 
						onKeyDown={autoBlur}
						onChange={e => {
							dummyObject.name = e.target.value;
							update();
						}}
						onBlur={e => {
							const val = String(e.target.value) || '';
							
							if(!val || !object.isNameAllowed(val)) {
								dummyObject.name = object.name; // revert
								update();
								
								return _editor.showError(`Invalid object name. ${val != '' ? 'Object names must contain no spaces or special characters apart from - and _' : ''}`);
							}
							
							object.name = val;
							update();
						}}
					/>
				</div>
				{/*
				<div className="field vector-field">
					<VectorInput label="Position" value={pos} onCommit={v => commitVector('pos', v)} />
				</div>
				<div className="field vector-field">
					<VectorInput label="Rotation" value={rot} onCommit={v => commitVector('rot', v)} />
				</div>
				<div className="field vector-field">
					<VectorInput label="Scale" value={scl} onCommit={v => commitVector('scl', v)} />
				</div>
				<div className="field">
					<div className="vector-input vector-input--top">
						<div>
							<label htmlFor="insp-object-visible">Visible</label>
							<input id="insp-object-visible" type="checkbox" className="tf" checked={visible} onChange={e => commitVisible(e.target.checked)} />
						</div>
						<div>
							<label htmlFor="insp-object-opacity">Opacity</label>
							<input id="insp-object-opacity" type="range" min="0" max="1" step="0.01" className="tf" value={opacity} onChange={e => commitOpacity(Number(e.target.value))} />
						</div>
					</div>
				</div>*/}
			</InspectorCell>
		)
	}
	const drawProjectInspector = () => {
		return (
			<InspectorCell id="insp-cell-project" title="Project">
				<div className="field">
					<label>Project name</label>
					
					<input 
						className="tf" 
						type="text" 
						value={dummyProject.name} 
						onKeyDown={autoBlur}
						onChange={e => {
							dummyProject.name = e.target.value;
							update();
						}}
						onBlur={e => {
							const val = String(e.target.value) || '';
							
							if(!val) {
								dummyProject.name = _editor.project.name; // revert
								update();
								
								return _editor.showError('Invalid project name');
							}
							
							_editor.project.name = val;
							update();
						}}
					/>
				</div>
				{/*
				<div className="field">
					<label>Author</label>
					<input id="insp-project-author" type="text" className="tf" defaultValue={_root?.manifest?.author || ''} />
				</div>
				<div className="field">
					<label>Default dimensions</label>
					<input id="insp-project-dimensions-width" type="number" className="tf tf--num" defaultValue={760} />
					<input id="insp-project-dimensions-height" type="number" className="tf tf--num" defaultValue={480} />
				</div>*/}
			</InspectorCell>
		)
	}
	
	return (
		<div className="inspector resizable no-select" id="insp-view">
			{object && drawObjectInspector()}
			{_editor.project && drawProjectInspector()}
		</div>
	)
}