import React, { forwardRef, useState, useEffect } from 'react';
import D3DComponents from '../../../engine/d3dcomponents.js';
import InspectorCell from './InspectorCell.jsx';
import ComponentCell from './ComponentCell.jsx';
import VectorInput from './VectorInput.jsx';
import AssetExplorerDialog from './AssetExplorerDialog.jsx';

const autoBlur = (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();   // stop form submit
		e.currentTarget.blur();
	}
}
let onSelectFile;

export default function Inspector() {
	const _editor = window._editor;
	const THREE = window.THREE;
	
	const [object, setObject] = useState();
	const [dummyObject, setDummyObject] = useState();
	const [dummyProject, setDummyProject] = useState();
	const [assetExplorerOpen, setAssetExplorerOpen] = useState(false);
	const [assetExplorerFilter, setAssetExplorerFilter] = useState('all');
	
	useEffect(() => {
		_editor.onProjectLoaded = () => {
			setDummyProject({..._editor.project});
		}
		_editor.onObjectSelected = (objects) => {
			const object = objects[0];
			
			setObject(object);
			setDummyObject({...object});
		}
	}, []);
	
	useEffect(() => {
		_editor.updateInspector = () => {
			setDummyObject({...dummyObject});
		}
	}, [dummyObject]);
	
	const update = () => {
		setDummyObject({...dummyObject});
		setDummyProject({...dummyProject});
	}
	const openAssetExplorer = ({ format, onSelect }) => {
		setAssetExplorerFilter(format);
		setAssetExplorerOpen(true);
		onSelectFile = onSelect;
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
				<div className="field vector-field">
					<VectorInput 
						label="Position"
						value={object.position} 
						onSave={vector => {
							object.position.set(
								vector.x, 
								vector.y, 
								vector.z
							);
						}} 
					/>
				</div>
				<div className="field vector-field">
					<VectorInput 
						label="Rotation"
						value={{
							x: THREE.MathUtils.radToDeg(object.rotation.x),
							y: THREE.MathUtils.radToDeg(object.rotation.y),
							z: THREE.MathUtils.radToDeg(object.rotation.z)
						}} 
						onSave={vector => {
							object.rotation.set(
								THREE.MathUtils.degToRad(vector.x), 
								THREE.MathUtils.degToRad(vector.y), 
								THREE.MathUtils.degToRad(vector.z)
							);
						}} 
					/>
				</div>
				<div className="field vector-field">
					<VectorInput 
						label="Scale"
						value={object.scale} 
						onSave={vector => {
							object.scale.set(
								vector.x, 
								vector.y, 
								vector.z
							);
						}} 
					/>
				</div>
				
				<div className="field mt2">
					<div className="vector-input vector-input--top">
						<div>
							<label>Visible</label>
							<input 
								type="checkbox" 
								checked={object.visible} 
								onChange={e => {
									object.visible = e.target.checked;
									update();
								}} 
							/>
						</div>
						<div>
							<label>Opacity</label>
							<input 
								type="range" 
								min={0} 
								max={1}
								step={0.01}
								value={object.opacity} 
								onChange={e => {
									object.opacity = Number(e.target.value);
									update();
								}}
							/>
						</div>
					</div>
				</div>
				
				<div className="components-editor">
					{drawComponentsEditor()}
				</div>
			</InspectorCell>
		)
	}
	const drawComponentsEditor = () => {
		const rows = [];
		
		object.components.forEach(component => {
			const fields = [];
			const schema = D3DComponents[component.type];
			const idx = object.components.indexOf(component);
			const dummyComponent = dummyObject.components[idx];
			
			if(!schema) {
				console.warn(`Unknown component schema for '${component.type}'`);
				return;
			}
			
			for(let fieldId in schema.fields) {
				const field = schema.fields[fieldId];
				let fieldContent;
				
				switch(field.type) {
					case 'string': {
						fieldContent = (
							<input 
								className="tf" 
								type="text" 
								value={dummyComponent.properties[fieldId] ?? ''} 
								onKeyDown={autoBlur}
								onChange={e => {
									dummyComponent.properties[fieldId] = e.target.value;
									update();
								}}
								onBlur={e => {
									const val = String(e.target.value) || '';
									
									component.properties[fieldId] = val;
									update();
								}}
							/>
						)
						break;
					}
					case 'file': {
						const current = dummyComponent.properties[fieldId] ?? '';
						const open = () => openAssetExplorer({
							format: 'model',
							onSelect: (assetName) => {
								dummyComponent.properties[fieldId] = assetName;
								component.properties[fieldId] = assetName;
								console.log(assetName);
								update();
							}
						});
						fieldContent = (
							<div className="file-field">
								<input
									className="tf"
									type="text"
									readOnly
									value={current}
									placeholder="No asset selected"
									onClick={open}
								/>
								<button 
									className="btn" 
									onClick={open}
								>
									Browse…
								</button>
							</div>
						);
						break;
					}
					default: {
						fieldContent = (<i>No editor</i>)
						break;
					}
				}
				
				fields.push(
					<div className='field' key={fields.length}>
						<label>{field.label}</label>
						{fieldContent}
					</div>
				);
			}
			
			rows.push(
				<ComponentCell 
					title={component.type}
					key={rows.length} 
				>
					{fields}
				</ComponentCell>
			);
		});
		
		return rows;
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
				<div className="field">
					<label>Author</label>
					
					<input 
						className="tf" 
						type="text" 
						value={dummyProject.author} 
						onKeyDown={autoBlur}
						onChange={e => {
							dummyProject.author = e.target.value;
							update();
						}}
						onBlur={e => {
							const val = String(e.target.value) || '';
							
							_editor.project.author = val;
							update();
						}}
					/>
				</div>
				<div className="field">
					<label>Dimensions</label>
					
					<input 
						className="tf tf--num mr" 
						type="number" 
						value={dummyProject.width} 
						onKeyDown={autoBlur}
						onChange={e => {
							dummyProject.width = Number(e.target.value);
							update();
						}}
						onBlur={e => {
							const minValue = 100;
							const maxValue = 5000;
							const val = Number(e.target.value) || 0;
							
							if(val < minValue) {
								dummyProject.width = minValue;
								update();
								return _editor.showError(`Minimum resolution is ${minValue}x${minValue}`);
							}
							if(val > maxValue) {
								dummyProject.width = maxValue;
								update();
								return _editor.showError(`Maximum resolution is ${maxValue}x${maxValue}`);
							}
							
							_editor.project.width = val;
							update();
						}}
					/>
					<input 
						className="tf tf--num mr" 
						type="number" 
						value={dummyProject.height} 
						onKeyDown={autoBlur}
						onChange={e => {
							dummyProject.height = Number(e.target.value);
							update();
						}}
						onBlur={e => {
							const minValue = 100;
							const maxValue = 5000;
							const val = Number(e.target.value) || 0;
							
							if(val < minValue) {
								dummyProject.height = minValue;
								update();
								return _editor.showError(`Minimum resolution is ${minValue}x${minValue}`);
							}
							if(val > maxValue) {
								dummyProject.height = maxValue;
								update();
								return _editor.showError(`Maximum resolution is ${maxValue}x${maxValue}`);
							}
							
							_editor.project.height = val;
							update();
						}}
					/>
				</div>
			</InspectorCell>
		)
	}
	
	return (
		<div className="inspector resizable no-select" id="insp-view">
			{object && drawObjectInspector()}
			{_editor.project && drawProjectInspector()}
			
			<AssetExplorerDialog
				isOpen={assetExplorerOpen}
				onClose={() => setAssetExplorerOpen(false)}
				onSelect={onSelectFile}
				zip={window._root?.zip}
				folder="assets/"
				defaultFilter={assetExplorerFilter}
				allowChangeFormat={false}
				allowImport={true}
			/>
		</div>
	)
}