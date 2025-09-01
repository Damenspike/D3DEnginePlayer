import React, { forwardRef, useState, useEffect, useRef } from 'react';
import D3DComponents from '../../../engine/d3dcomponents.js';
import InspectorCell from './InspectorCell.jsx';
import ComponentCell from './ComponentCell.jsx';
import VectorInput from './VectorInput.jsx';
import AssetExplorerDialog from './AssetExplorerDialog.jsx';
import ObjectRow from './ObjectRow.jsx';

import { 
	MdDelete, 
	MdAdd, 
	MdFolderOpen, 
	MdGames,
	MdViewInAr,
	MdLightbulbOutline,
	MdPhotoCamera,
	MdHtml,
	MdFolder, MdInsertDriveFile, MdExpandMore, MdChevronRight,
	MdUpload, MdCreateNewFolder, MdRefresh, MdDeleteForever,
	MdOutlineInterests
} from "react-icons/md";

import {
	moveZipFile,
	renameZipFile,
	renameZipDirectory,
	uniqueDirPath,
	pathExists,
	makeSafeFilename,
	isDirPath,
	parentDir,
	uniqueFilePath,
	getExtension,
	MIME_D3D_ROW
} from '../../../engine/d3dutility.js';

const autoBlur = (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();   // stop form submit
		e.currentTarget.blur();
	}
}
let onSelectFile;

export default function Inspector() {
	const _editor = window._editor;
	const _root = window._root;
	const zip = _root?.zip;
	const THREE = window.THREE;
	
	const [object, setObject] = useState();
	const [dummyObject, setDummyObject] = useState();
	const [dummyProject, setDummyProject] = useState();
	const [assetExplorerOpen, setAssetExplorerOpen] = useState(false);
	const [assetExplorerFilter, setAssetExplorerFilter] = useState('all');
	const [assetExplorerSelected, setAssetExplorerSelected] = useState();
	const [sceneInspectorExpanded, setSceneInspectorExpanded] = useState(false);
	const [objectInspectorExpanded, setObjectInspectorExpanded] = useState(false);
	const [assetsInspectorExpanded, setAssetsInspectorExpanded] = useState(false);
	
	// Scene config states
	const [bgType, setBgType] = useState('none');
	const [bgColor, setBgColor] = useState('#000000');
	const [bgTexturePath, setBgTexturePath] = useState('');
	
	// Asset Tree
	const assetFileInputRef = useRef(null);
	const [assetTree, setAssetTree] = useState(null);
	const [assetExpanded, setAssetExpanded] = useState(new Set(['assets']));
	const [selectedAssetPaths, setSelectedAssetPaths] = useState(new Set());
	const [lastSelectedPath, setLastSelectedPath] = useState(null); 
	const [currentAssetFolder, setCurrentAssetFolder] = useState('assets');
	const [newFolderOpen, setNewFolderOpen] = useState(false);
	const [newFolderName, setNewFolderName] = useState('');
	
	useEffect(() => {
		_editor.onProjectLoaded = () => {
			setDummyProject({..._editor.project});
		}
		_editor.onObjectSelected = (objects) => {
			const object = objects[0];
			
			setObject(object);
			
			if(!object)
				setDummyObject({});
			else
				setDummyObject({...object, name: object.name});
		}
	}, []);
	
	useEffect(() => {
		_editor.updateInspector = () => {
			setDummyObject({...dummyObject});
		}
	}, [dummyObject]);
	
	useEffect(() => {
		_editor.onDeleteKey = () => deleteSelectedObjects();
		_editor.selectNoAssets = () => setSelectedAssetPaths(new Set());
	}, [_editor.selectedObjects, selectedAssetPaths]);
	
	useEffect(() => {
		_editor.onAssetsUpdated = () => {
			if(_editor.__buildTree)
				setAssetTree(_editor.__buildTree());
		}
	}, [assetTree]);
	
	const update = () => {
		setDummyObject({...dummyObject});
		setDummyProject({...dummyProject});
	}
	const openAssetExplorer = ({ format, selectedAsset, onSelect }) => {
		setAssetExplorerFilter(format);
		setAssetExplorerOpen(true);
		setAssetExplorerSelected(selectedAsset);
		onSelectFile = onSelect;
	}
	const deleteSelectedObjects = () => {
		if(_editor.selectedObjects.length > 0) {
			_editor.selectedObjects.forEach(d3dobject => {
				d3dobject.delete();
			});
			_editor.setSelection([]);
			setObject(null);
		}else
		if(selectedAssetPaths.size > 0) {
			_editor.deleteSelectedAssets();
			setObject(null);
		}
	
		update();
	};
	
	const drawObjectInspector = () => {
		return (
			<InspectorCell 
				id="insp-cell-object" 
				title="Object" 
				expanded={objectInspectorExpanded}
				onExpand={() => setObjectInspectorExpanded(!objectInspectorExpanded)}
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
							const val = String(e.target.value).trim() || '';
							
							if(!val || !object.isNameAllowed(val)) {
								dummyObject.name = object.name; // revert
								update();
								
								return _editor.showError(`Invalid object name. ${val != '' ? 'Object names can only contain alphanumeric characters.' : ''}`);
							}
							
							const oldName = object.name;
							const newName = val;
							_editor.addStep({
								name: 'Edit object name',
								undo: () => {
									object.name = oldName;
									dummyObject.name = oldName;
									update();
								},
								redo: () => {
									object.name = newName;
									dummyObject.name = newName;
									update();
								}
							});
							
							object.name = val;
							dummyObject.name = val;
							update();
						}}
					/>
				</div>
				<div className="field vector-field">
					<VectorInput 
						label="Position"
						value={object.position} 
						onSave={vector => {
							const oldPosition = object.position.clone();
							const newPosition = new THREE.Vector3(vector.x, vector.y, vector.z);
							_editor.addStep({
								name: 'Update position',
								undo: () => {
									object.position.copy(oldPosition);
								},
								redo: () => {
									object.position.copy(newPosition);
								}
							});
							
							object.position.copy(newPosition);
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
							const oldRotation = object.rotation.clone();
							const newRotation = new THREE.Euler(
								THREE.MathUtils.degToRad(vector.x), 
								THREE.MathUtils.degToRad(vector.y), 
								THREE.MathUtils.degToRad(vector.z)
							);
							_editor.addStep({
								name: 'Update rotation',
								undo: () => {
									object.rotation.copy(oldRotation);
								},
								redo: () => {
									object.rotation.copy(newRotation);
								}
							});
							
							object.rotation.copy(newRotation);
						}} 
					/>
				</div>
				<div className="field vector-field">
					<VectorInput 
						label="Scale"
						value={object.scale} 
						onSave={vector => {
							const oldScale = object.scale.clone();
							const newScale = new THREE.Vector3(vector.x, vector.y, vector.z);
							_editor.addStep({
								name: 'Update scale',
								undo: () => {
									object.position.copy(oldScale);
								},
								redo: () => {
									object.position.copy(newScale);
								}
							});
							
							object.scale.copy(newScale);
						}} 
					/>
				</div>
				
				{objectInspectorExpanded && (
					<div className="field mt2">
						<div className="vector-input vector-input--top">
							<div>
								<label>Visible</label>
								<input 
									type="checkbox" 
									checked={object.visible} 
									onChange={e => {
										const oldVisible = object.visible;
										const newVisible = e.target.checked;
										_editor.addStep({
											name: 'Update scale',
											undo: () => {
												object.visible = oldVisible;
												update();
											},
											redo: () => {
												object.visible = newVisible;
												update();
											}
										});
										
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
										const val = Number(e.target.value);
										
										const oldOpacity = object.opacity;
										const newOpacity = val;
										_editor.addStep({
											name: 'Update scale',
											undo: () => {
												object.opacity = oldOpacity;
												update();
											},
											redo: () => {
												object.opacity = newOpacity;
												update();
											}
										});
										
										object.opacity = val;
										update();
									}}
								/>
							</div>
						</div>
					</div>
				)}
				
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
				const current = dummyComponent.properties[fieldId];
				const addStep = (val) => {
					const oldValue = component.properties[fieldId];
					const newValue = val;
					_editor.addStep({
						name: 'Update property',
						undo: () => {
							component.properties[fieldId] = oldValue;
							object.updateComponents();
							update();
						},
						redo: () => {
							component.properties[fieldId] = newValue;
							object.updateComponents();
							update();
						}
					});
				}
				const addStepManual = (oldValue, newValue) => {
					_editor.addStep({
						name: 'Update property',
						undo: () => {
							component.properties[fieldId] = oldValue;
							object.updateComponents();
							update();
						},
						redo: () => {
							component.properties[fieldId] = newValue;
							object.updateComponents();
							update();
						}
					});
				}
				
				let fieldContent;
				
				switch(field.type) {
					case 'string': {
						fieldContent = (
							<input 
								className="tf" 
								type="text" 
								value={current ?? ''} 
								onKeyDown={autoBlur}
								onChange={e => {
									let val = e.target.value;
									
									if(field.convert)
										val = field.covert(val);
									
									dummyComponent.properties[fieldId] = val;
									update();
								}}
								onBlur={e => {
									let val = String(e.target.value) || '';
									
									if(field.convert)
										val = field.covert(val);
										
									addStep(val);
									
									dummyComponent.properties[fieldId] = val;
									component.properties[fieldId] = val;
									object.updateComponents();
									update();
								}}
							/>
						)
						break;
					}
					case 'number': {
						fieldContent = (
							<input 
								className="tf tf--num" 
								type="number" 
								value={Number(current) || 0} 
								onKeyDown={autoBlur}
								min={field.min}
								max={field.max}
								onChange={e => {
									let val = Number(e.target.value) || 0;
									
									if(field.min !== undefined && val < field.min)
										val = field.min;
									
									if(field.min !== undefined && val > field.max)
										val = field.max;
									
									if(field.convert)
										val = field.covert(val);
										
									addStep(val);
									
									dummyComponent.properties[fieldId] = val;
									component.properties[fieldId] = val;
									object.updateComponents();
									update();
								}}
							/>
						)
						break;
					}
					case 'slider': {
						fieldContent = (
							<div className='flex'>
								<input 
									type="range" 
									value={Number(current) || 0} 
									onKeyDown={autoBlur}
									min={field.min}
									max={field.max}
									onChange={e => {
										let val = Number(e.target.value) || 0;
										
										if(field.min !== undefined && val < field.min)
											val = field.min;
										
										if(field.min !== undefined && val > field.max)
											val = field.max;
											
										if(field.convert)
											val = field.covert(val);
											
										addStep(val);
										
										dummyComponent.properties[fieldId] = val;
										component.properties[fieldId] = val;
										object.updateComponents();
										update();
									}}
								/>
								<div className='slider-value'>
									{Number(current) || 0}
								</div>
							</div>
						)
						break;
					}
					case 'boolean': {
						fieldContent = (
							<input 
								type="checkbox" 
								checked={!!current} 
								onKeyDown={autoBlur}
								onChange={e => {
									const val = !!e.target.checked;
									
									addStep(val);
									
									dummyComponent.properties[fieldId] = val;
									component.properties[fieldId] = val;
									object.updateComponents();
									update();
								}}
							/>
						)
						break;
					}
					case 'color': {
						fieldContent = (
							<input 
								type="color" 
								value={current.replace('0x', '#')}
								onKeyDown={autoBlur}
								onClick={e => {
									const val = (e.target.value || '#ffffff').replace('#', '0x');
									
									e.target.oldValue = val;
								}}
								onChange={e => {
									const val = (e.target.value || '#ffffff').replace('#', '0x');
									
									dummyComponent.properties[fieldId] = val;
									component.properties[fieldId] = val;
									object.updateComponents();
									update();
								}}
								onBlur={e => {
									const val = (e.target.value || '#ffffff').replace('#', '0x');
									
									addStepManual(e.target.oldValue, val);
									e.target.oldValue = val;
								}}
							/>
						);
						break;
					}
					case 'file': {
						const current = dummyComponent.properties[fieldId] ?? '';
						const open = () => openAssetExplorer({
							format: field.format,
							selectedAsset: current,
							onSelect: (assetName) => {
								addStep(assetName);
								
								dummyComponent.properties[fieldId] = assetName;
								component.properties[fieldId] = assetName;
								object.updateComponents();
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
									onClick={open}
								>
									<MdFolderOpen />
								</button>
							</div>
						);
						break;
					}
					case 'file[]': {
						const current = Array.isArray(dummyComponent.properties[fieldId])
							? dummyComponent.properties[fieldId]
							: [];
					
						const browseAndAppend = () => openAssetExplorer({
							format: field.format,
							selectedAsset: '',
							onSelect: (assetPath) => {
								const updated = [...current, assetPath];
								dummyComponent.properties[fieldId] = updated;
								component.properties[fieldId] = updated;
								update();
							}
						});
					
						fieldContent = (
							<div className="file-array-field">
								<div className="file-array-list">
									{current.map((filePath, idx) => {
										const browse = () => {
											openAssetExplorer({
												format: 'material',
												selectedAsset: filePath,
												onSelect: (assetPath) => {
													const updated = [...current];
													updated[idx] = assetPath;
													
													addStep(updated);
													
													dummyComponent.properties[fieldId] = updated;
													component.properties[fieldId] = updated;
													object.updateComponents();
													update();
												}
											})
										}
										
										return (
											<div key={idx} className="file-array-row">
												<input
													className="tf"
													type="text"
													readOnly
													value={filePath}
													placeholder="No asset selected"
													onClick={browse}
												/>
												<button
													title="Browse"
													onClick={browse}
												>
													<MdFolderOpen />
												</button>
												<button
													title="Remove"
													onClick={() => {
														const updated = current.filter((_, i) => i !== idx);
														
														addStep(updated);
														
														dummyComponent.properties[fieldId] = updated;
														component.properties[fieldId] = updated;
														object.updateComponents();
														update();
													}}
												>
													<MdDelete />
												</button>
											</div>
										)
									})}
								</div>
					
								{/* add button */}
								<div className="file-array-actions">
									<button
										title="Add"
										onClick={browseAndAppend}
									>
										<MdAdd />
									</button>
								</div>
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
					title={schema.name || component.type}
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
	const drawSceneInspector = () => {
		const scene = _root.object3d;
		const canDelete = _editor.selectedObjects.length > 0;
		
		const drawPath = () => {
			const path = [];
			const objectFrame = _editor.focus;
			
			if(!objectFrame || !objectFrame.parent)
				return;
			
			let stack = [objectFrame];
			let current = objectFrame;
			
			while(current.parent != null) {
				stack.push(current.parent);
				current = current.parent;
			}
			
			stack = stack.reverse();
			stack.forEach(object => {
				const drawArrow = () => {
					if(stack.indexOf(object) == stack.length - 1)
						return;
					
					return (
						<>
							&nbsp;
							&gt;
							&nbsp;
						</>
					)
				}
				path.push(
					<>
						<div 
							key={path.length}
							className='object-path-item'
							onClick={() => {
								const oldParent = _editor.focus;
								
								_editor.focus = object;
								
								if(object == (oldParent.parent ?? _root))
									_editor.setSelection([oldParent]);
								else
									_editor.setSelection([]);
							}}
						>
							{object.name}
						</div>
						{drawArrow()}
					</>
				)
			});
			
			return path;
		}
		const drawObjects = () => {
			const rows = [];
			const objects = [..._editor.focus.children];
			
			if(objects.length < 1)
				return <div className='no-label'>No objects</div>
			
			objects.forEach(object => {
				const selected = _editor.selectedObjects.includes(object);
				
				if(object.editorOnly)
					return;
				
				const drawIcon = () => {
					if(object.components.find(c => c.type == 'Mesh'))
						return <MdViewInAr />;
					else
					if(object.components.find(c => c.type.includes('Light')))
						return <MdLightbulbOutline />;
					else
					if(object.components.find(c => c.type == 'Camera'))
						return <MdPhotoCamera />;
					else
					if(object.components.find(c => c.type == 'HTML'))
						return <MdHtml />;
					else
						return <MdGames />;
				}
				
				rows.push(
					<ObjectRow
						key={rows.length}
						icon={drawIcon()}
						name={object.name}
						selected={selected}
						isInstance={true}
						onRename={(newName) => {
							if(!object.isValidName(newName))
								return object.name;
							
							object.name = newName;
							dummyObject.name = newName;
							update();
							
							return object.name;
						}}
						onClick={e => {
							if(e.shiftKey) {
								const anchor = _editor.selectedObjects[0];
								const startIndex = objects.indexOf(anchor);
								const endIndex = objects.indexOf(object);
								
								if (startIndex == -1 || endIndex == -1) 
									return;
								
								const start = Math.min(startIndex, endIndex);
								const end = Math.max(startIndex, endIndex);
								
								for (let i = start; i <= end; i++) {
									const o = objects[i];
									if (!_editor.isSelected(o))
										_editor.addSelection([o]);
								}
							}else
							if(e.metaKey || e.ctrlKey) {
								if(!_editor.isSelected(object))
									_editor.addSelection([object]);
								else 
									_editor.removeSelection([object]);
							}else
								_editor.setSelection([object]);
						}}
						onDoubleClick={() => {
							_editor.focus = object;
							_editor.setSelection([]);
						}}
					/>
				)
			})
			
			return rows;
		}
		const drawBackgroundSettings = () => {
			// helpers
			const applyNone = () => {
				scene.background = null;
			};
		
			const applyColor = (hex) => {
				try {
					scene.background = new THREE.Color(hex || '#000000');
				} catch {
					// ignore invalid hex
				}
			};
		
			const applyTextureFromZip = async (path) => {
				try {
					const f = _root?.zip?.file(path);
					if (!f) return;
					const blob = await f.async('blob');
					const url = URL.createObjectURL(blob);
		
					new THREE.TextureLoader().load(
						url,
						(tex) => {
							URL.revokeObjectURL(url);
							tex.mapping = THREE.EquirectangularReflectionMapping; // good default for sky panoramas
							tex.colorSpace = THREE.SRGBColorSpace;
							tex.needsUpdate = true;
							scene.background = tex;
						},
						undefined,
						() => URL.revokeObjectURL(url)
					);
				} catch (e) {
					console.warn('Failed to load background texture:', e);
				}
			};
		
			// UI
			return (
				<div className="scene-insp-background-settings">
					{/* Type */}
					<div className="field">
						<label>Background</label>
						<select
							className="tf"
							value={bgType}
							onChange={async (e) => {
								const t = e.target.value;
								setBgType(t);
		
								if (t === 'none') {
									applyNone();
								} else if (t === 'color') {
									applyColor(bgColor);
								} else if (t === 'texture') {
									if (bgTexturePath) await applyTextureFromZip(bgTexturePath);
								}
							}}
						>
							<option value="none">None</option>
							<option value="color">Color</option>
							<option value="texture">Texture (equirect)</option>
						</select>
					</div>
		
					{/* Color settings */}
					{bgType === 'color' && (
						<div className="field">
							<label>Background Color</label>
							<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
								<input
									type="color"
									value={bgColor}
									onChange={(e) => {
										const val = e.target.value || '#000000';
										setBgColor(val);
										applyColor(val);
									}}
								/>
								<input
									type="text"
									className="tf"
									value={bgColor}
									onChange={(e) => {
										const v = e.target.value.trim();
										setBgColor(v);
										// apply only if valid 6-digit hex (#RRGGBB)
										if (/^#[0-9a-fA-F]{6}$/.test(v)) applyColor(v);
									}}
									onBlur={(e) => {
										const v = e.target.value.trim();
										if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
											setBgColor('#000000');
											applyColor('#000000');
										}
									}}
									placeholder="#000000"
									style={{ width: 96, textAlign: 'center' }}
								/>
							</div>
						</div>
					)}
		
					{/* Texture settings */}
					{bgType === 'texture' && (
						<div className="field">
							<label>Background Texture</label>
							<div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
								<input
									className="tf"
									type="text"
									readOnly
									value={bgTexturePath}
									placeholder="No texture selected"
									onClick={() => {
										openAssetExplorer({
											format: 'img',
											selectedAsset: bgTexturePath,
											onSelect: async (assetPath) => {
												setBgTexturePath(assetPath);
												await applyTextureFromZip(assetPath);
											}
										});
									}}
								/>
								<button
									onClick={() => {
										openAssetExplorer({
											format: 'img',
											selectedAsset: bgTexturePath,
											onSelect: async (assetPath) => {
												setBgTexturePath(assetPath);
												await applyTextureFromZip(assetPath);
											}
										});
									}}
								>
									Browse…
								</button>
							</div>
							{bgTexturePath && (
								<div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
									Hint: use an equirectangular panorama for best results.
								</div>
							)}
						</div>
					)}
				</div>
			);
		};
		
		return (
			<InspectorCell 
				id="insp-cell-scene" 
				title="Scene" 
				expanded={sceneInspectorExpanded}
				onExpand={() => setSceneInspectorExpanded(!sceneInspectorExpanded)}
			>
				{sceneInspectorExpanded && (
					<div className="tools-section assets-insp-tools">
						<button onClick={() => null}>
							<MdAdd /> New Object
						</button>
				
						<button
							className="btn-small"
							onClick={deleteSelectedObjects}
							disabled={!canDelete}
						>
							<MdDeleteForever />
						</button>
					</div>
				)}
				<div className="path-container">
					{drawPath()}
				</div>
				<div className="scene-objects-list shade">
					{drawObjects()}
				</div>
				{sceneInspectorExpanded && _editor.focus == _root && (
					drawBackgroundSettings()
				)}
			</InspectorCell>
		)
	}
	const drawAssetInspector = () => {
		if(!zip)
			return <div className="no-label">No project file mounted</div>;
	
		// --- helpers (tree) ---
		const buildTree = () => {
			const root = { name: "assets", path: "assets", type: "dir", children: new Map() };
	
			zip.forEach((rel, file) => {
				if(!rel.startsWith("assets/"))
					return;
				if(rel.startsWith("assets/Standard/"))
					return;
	
				const stripped = rel.slice("assets/".length);
				if(!stripped)
					return;
	
				const parts = stripped.split("/").filter(Boolean);
				let node = root;
				for(let i = 0; i < parts.length; i++) {
					const part = parts[i];
					const isLast = i === parts.length - 1;
					const keyPath = (node.path ? node.path + "/" : "") + part;
	
					if(isLast && !file.dir) {
						node.children.set(part, { name: part, path: keyPath, type: "file" });
					} else {
						if(!node.children.has(part)) {
							node.children.set(part, { name: part, path: keyPath, type: "dir", children: new Map() });
						}
						node = node.children.get(part);
					}
				}
			});
	
			const normalize = (n) => {
				if(n.type === "dir") {
					const arr = Array.from(n.children.values());
					arr.sort((a, b) => {
						if(a.type !== b.type)
							return a.type === "dir" ? -1 : 1;
						return a.name.localeCompare(b.name);
					});
					n.children = arr;
					n.children.forEach(normalize);
				}
			};
			normalize(root);
			return root;
		};
	
		// expanded state
		const isExpanded = (p) => assetExpanded.has(p);
		const toggleExpanded = (p) => {
			const next = new Set(assetExpanded);
			if(next.has(p))
				next.delete(p);
			else
				next.add(p);
			setAssetExpanded(next);
		};
	
		// derive "current folder" from unified selection
		const selectedArr = Array.from(selectedAssetPaths);
		const primarySel = selectedArr.length ? selectedArr[selectedArr.length - 1] : "assets";
		const currentFolder = isDirPath(zip, primarySel) ? primarySel.replace(/\/$/, "") : parentDir(primarySel);
	
		// import files → drop into currentFolder
		const onImportFiles = async (files) => {
			if(!files || !files.length)
				return;
			for(const f of files) {
				const buf = await f.arrayBuffer();
				const target = `${currentFolder}/${f.name}`;
				zip.file(target, buf);
			}
			setAssetTree(buildTree());
			setAssetExpanded(prev => new Set(prev).add(currentFolder));
			setSelectedAssetPaths(new Set([`${currentFolder}/${files[0].name}`]));
			setLastSelectedPath(`${currentFolder}/${files[0].name}`);
			
			// important after any asset change
			_root.updateSymbolStore();
		};
	
		// new folder in currentFolder
		const onNewFolder = (name) => {
			const safe = makeSafeFilename(name);
			if(!safe)
				return;
			const dirPath = uniqueDirPath(zip, currentFolder, safe);
			zip.folder(dirPath);
			setAssetTree(buildTree());
			setAssetExpanded(prev => new Set(prev).add(currentFolder));
			setSelectedAssetPaths(new Set([dirPath.replace(/\/$/, "")]));
			setLastSelectedPath(dirPath.replace(/\/$/, ""));
			setNewFolderOpen(false);
			setNewFolderName("");
			
			// important after any asset change
			_root.updateSymbolStore();
		};
	
		// new file in currentFolder (zero-byte)
		const addNewFile = () => {
			const path = uniqueFilePath(zip, currentFolder, "New asset");
			zip.file(path, new Uint8Array());
			setAssetTree(buildTree());
			setAssetExpanded(prev => new Set(prev).add(currentFolder));
			setSelectedAssetPaths(new Set([path]));
			setLastSelectedPath(path);
			
			// important after any asset change
			_root.updateSymbolStore();
		};
	
		// DnD helpers
		const MIME = MIME_D3D_ROW || "application/x-d3d-objectrow";
		const canAccept = (e) => {
			const t = e.dataTransfer?.types;
			if(!t)
				return false;
			return Array.from(t).includes(MIME);
		};
		const unpack = (e) => {
			try {
				return JSON.parse(e.dataTransfer.getData(MIME) || "{}");
			} catch {
				return null;
			}
		};
	
		// selection helpers (unified)
		const isSelected = (p) => selectedAssetPaths.has(p);
		const setSingleSelection = (p) => {
			const next = new Set();
			if(p)
				next.add(p);
			_editor.setSelection([]);
			setSelectedAssetPaths(next);
			setLastSelectedPath(p || null);
		};
		const toggleSelection = (p) => {
			const next = new Set(selectedAssetPaths);
			if(next.has(p))
				next.delete(p);
			else
				next.add(p);
			_editor.setSelection([]);
			setSelectedAssetPaths(next);
			setLastSelectedPath(p);
		};
		const selectRange = (siblings, fromPath, toPath) => {
			if(!fromPath || !toPath) {
				setSingleSelection(toPath);
				return;
			}
			// range over displayed siblings (files only to keep behavior consistent)
			const filesOnly = siblings.filter(n => n.type === "file");
			const idxA = filesOnly.findIndex(n => n.path === fromPath);
			const idxB = filesOnly.findIndex(n => n.path === toPath);
			if(idxA === -1 || idxB === -1) {
				setSingleSelection(toPath);
				return;
			}
			const start = Math.min(idxA, idxB);
			const end = Math.max(idxA, idxB);
			const next = new Set(selectedAssetPaths);
			for(let i = start; i <= end; i++)
				next.add(filesOnly[i].path);
			_editor.setSelection([]);
			setSelectedAssetPaths(next);
			setLastSelectedPath(toPath);
		};
	
		const filename = (p) => p.split("/").pop();
	
		// delete selected (files + folders)
		const canDelete = selectedAssetPaths.size > 0;
		const deleteSelectedConfirm = async () => {
			if(!selectedAssetPaths.size)
				return;
			const count = selectedAssetPaths.size;
			const label = count === 1 ? filename([...selectedAssetPaths][0]) : `${count} items`;
			_editor.showConfirm({
				message: `Delete ${label}? This action cannot be undone.`,
				onConfirm: deleteSelected
			});
		};
		_editor.deleteSelectedAssets = deleteSelectedConfirm;
	
		const deleteSelected = () => {
			if(!selectedAssetPaths.size)
				return;
	
			// remove files directly, remove folders recursively
			for(const p of selectedAssetPaths) {
				const file = zip.file(p);
				if(file) {
					zip.remove(p);
					continue;
				}
				const dir = p.endsWith("/") ? p : p + "/";
				const toRemove = [];
				zip.forEach((rel) => {
					if(rel.startsWith(dir))
						toRemove.push(rel);
				});
				toRemove.forEach(rel => zip.remove(rel));
				zip.remove(dir);
			}
	
			setSelectedAssetPaths(new Set());
			setLastSelectedPath(null);
			setAssetTree(buildTree());
			
			// important after any asset change
			_root.updateSymbolStore();
		};
	
		// render a node
		const renderNode = (node, depth = 0, siblings = []) => {
			const selected = isSelected(node.path);
	
			if(node.type === "file") {
				const ext = getExtension(node.name);
				const displayName = node.name.split('.')[0];
				
				const drawIcon = () => {
					switch(ext) {
						case 'd3dsymbol':
							return <MdOutlineInterests />;
						case 'glb':
							return <MdViewInAr />;
						default: 
							return <MdInsertDriveFile />;
					}
				}
				
				return (
					<ObjectRow
						key={node.path}
						icon={drawIcon()}
						name={node.name}
						displayName={displayName}
						selected={selected}
						style={{ paddingLeft: 6 + depth * 24 }}
						draggable
						dragData={{ kind: "asset", path: node.path }}
						onRename={async (newName) => {
							try {
								const newPath = await renameZipFile(zip, node.path, newName);
								setAssetTree(buildTree());
								setSingleSelection(newPath);
								
								// important after any asset change
								_root.updateSymbolStore();
							} catch(err) {
								console.warn("Rename failed:", err);
							}
							return newName;
						}}
						title={node.path}
						onClick={(e) => {
							if(e.shiftKey) {
								selectRange(siblings, lastSelectedPath, node.path);
							} else if(e.metaKey || e.ctrlKey) {
								toggleSelection(node.path);
							} else {
								setSingleSelection(node.path);
							}
						}}
						onDoubleClick={() => {
							setSingleSelection(node.path);
						}}
					/>
				);
			}
	
			// directory
			const open = isExpanded(node.path);
			return (
				<React.Fragment key={node.path || "assets"}>
					<ObjectRow
						icon={(
							<>
								<div
									className="folder-expand-icon"
									onClick={(e) => {
										toggleExpanded(node.path);
										e.stopPropagation();
										e.preventDefault();
									}}
								>
									{open ? <MdExpandMore /> : <MdChevronRight />}
								</div>
								<MdFolder />
							</>
						)}
						name={node.name}
						selected={selected}
						title={node.path || "/"}
						style={{ paddingLeft: 6 + depth * 14 }}
						droppable
						draggable
						dragData={{ kind: "folder", path: node.path }}
						onDrop={async (e, payload) => {
							try {
								if(!payload?.path)
									return;
								// prevent moving into itself or its descendants
								const destDir = node.path.endsWith("/") ? node.path : (node.path + "/");
								const src = payload.path.endsWith("/") ? payload.path : payload.path + "/";
								if(payload.kind === "folder" && (destDir === src || destDir.startsWith(src)))
									return;
	
								const movedTo = await moveZipFile(zip, payload.path, node.path);
								setAssetTree(buildTree());
								setSingleSelection((movedTo || "").replace(/\/$/, ""));
								setAssetExpanded(prev => new Set(prev).add(node.path));
								
								// important after any asset change
								_root.updateSymbolStore();
							} catch(err) {
								console.error("Move failed", err);
							}
						}}
						onRename={async (newName) => {
							try {
								const newPath = await renameZipDirectory(zip, node.path, newName);
								setAssetTree(buildTree());
								setSingleSelection(newPath.replace(/\/$/, ""));
								
								// important after any asset change
								_root.updateSymbolStore();
							} catch(err) {
								console.warn("Rename failed:", err);
							}
							return newName;
						}}
						onClick={(e) => {
							if(e.shiftKey) {
								selectRange(siblings, lastSelectedPath, node.path);
							} else if(e.metaKey || e.ctrlKey) {
								toggleSelection(node.path);
							} else {
								setSingleSelection(node.path);
							}
						}}
						onDoubleClick={() => {
							toggleExpanded(node.path);
						}}
					/>
					{open && node.children?.map(child => (
						<React.Fragment key={child.path}>
							{renderNode(child, depth + 1, node.children)}
						</React.Fragment>
					))}
				</React.Fragment>
			);
		};
	
		// Build once (or after refresh)
		const tree = assetTree ?? buildTree();
		_editor.__buildTree = buildTree;
		if(assetTree !== tree)
			setAssetTree(tree);
	
		return (
			<InspectorCell
				id="insp-cell-assets"
				title="Assets"
				expanded={assetsInspectorExpanded}
				onExpand={() => setAssetsInspectorExpanded(!assetsInspectorExpanded)}
				onDragOver={(e) => {
					if(!canAccept(e))
						return;
					e.preventDefault();
					e.dataTransfer.dropEffect = "copy";
				}}
				onDrop={async (e) => {
					if(!canAccept(e))
						return;
					e.preventDefault();
					const payload = unpack(e);
					if(!payload?.path)
						return;
					// Drop to root if list catches it
					await moveZipFile(zip, payload.path, "assets");
					setAssetTree(buildTree());
					setSelectedAssetPaths(new Set(["assets"]));
					setLastSelectedPath("assets");
					setAssetExpanded(prev => new Set(prev).add("assets"));
					
					// important after any asset change
					_root.updateSymbolStore();
				}}
			>
				{assetsInspectorExpanded && (
					<div className="tools-section assets-insp-tools">
						<button onClick={addNewFile} title="Create file">
							<MdAdd /> New File
						</button>
	
						<button
							onClick={() => assetFileInputRef.current?.click()}
							title={`Import into ${currentFolder}`}
						>
							<MdUpload /> Import
						</button>
	
						{!newFolderOpen && (
							<button
								className="btn-small"
								onClick={() => setNewFolderOpen(true)}
								title={`Create folder in ${currentFolder}`}
							>
								<MdCreateNewFolder />
							</button>
						)}
	
						<button
							className="btn-small"
							onClick={deleteSelectedConfirm}
							title={selectedAssetPaths.size > 0 ? "Delete selected" : "Delete"}
							disabled={!canDelete}
						>
							<MdDeleteForever />
						</button>
	
						<input
							ref={assetFileInputRef}
							type="file"
							multiple
							style={{ display: "none" }}
							onChange={async (e) => {
								const files = Array.from(e.target.files || []);
								e.target.value = "";
								await onImportFiles(files);
							}}
						/>
	
						{newFolderOpen && (
							<div className="assets-new-folder">
								<input
									className="tf"
									type="text"
									placeholder="New folder name"
									autoFocus
									value={newFolderName}
									onChange={e => setNewFolderName(e.target.value)}
									onKeyDown={(e) => {
										if(e.key === "Enter")
											onNewFolder(newFolderName);
										else if(e.key === "Escape") {
											setNewFolderOpen(false);
											setNewFolderName("");
										}
									}}
									style={{ width: 160 }}
								/>
								<button onClick={() => onNewFolder(newFolderName)}>
									Okay
								</button>
								<button
									onClick={() => {
										setNewFolderOpen(false);
										setNewFolderName("");
									}}
								>
									Cancel
								</button>
							</div>
						)}
					</div>
				)}
	
				<div className="scene-objects-list shade">
					{tree.children && tree.children.length
						? tree.children.map(n => (
							<React.Fragment key={n.path}>
								{renderNode(n, 0, tree.children)}
							</React.Fragment>
						))
						: <div className="no-label">No assets</div>
					}
				</div>
			</InspectorCell>
		);
	};
	
	return (
		<>
			{_root && drawSceneInspector()}
			{object && drawObjectInspector()}
			{_root && drawAssetInspector()}
			{_editor.project && _editor.focus == _root && drawProjectInspector()}
			
			<div style={{height: 45}} />
			
			<AssetExplorerDialog
				isOpen={assetExplorerOpen}
				onClose={() => setAssetExplorerOpen(false)}
				onSelect={onSelectFile}
				zip={_root?.zip}
				folder="assets/"
				defaultFilter={assetExplorerFilter}
				allowChangeFormat={false}
				allowImport={true}
				selectedAsset={assetExplorerSelected}
			/>
		</>
	)
}