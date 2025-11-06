import React, { forwardRef, useState, useEffect, useRef } from 'react';
import D3DComponents from '../../../engine/d3dcomponents.js';
import InspectorCell from './InspectorCell.jsx';
import ComponentCell from './ComponentCell.jsx';
import VectorInput from './VectorInput.jsx';
import AssetExplorerDialog from './AssetExplorerDialog.jsx';
import ObjectRow from './ObjectRow.jsx';
import MaterialEditor from './MaterialEditor.jsx';
import ColorPicker from './ColorPicker.jsx';
import ColorPickerBest from './ColorPickerBest.jsx'

import { 
	MdDelete, 
	MdAdd, 
	MdFolderOpen, 
	MdGames,
	MdViewInAr,
	MdFolderSpecial,
	MdLightbulbOutline,
	MdPhotoCamera,
	MdHtml, MdCode,
	MdFolder, MdInsertDriveFile, MdExpandMore, MdChevronRight,
	MdUpload, MdCreateNewFolder, MdRefresh, MdDeleteForever,
	MdOutlineInterests, MdTexture, MdDirectionsWalk,
	MdFormatAlignLeft, MdFormatAlignCenter, MdFormatAlignRight,
	MdLock, MdLockOpen
} from 'react-icons/md';

import { IoMdEye, IoMdEyeOff } from 'react-icons/io';

import {
	MIME_D3D_ROW,
	moveZipEntry,
	renameZipFile,
	renameZipDirectory,
	uniqueDirPath,
	pathExists,
	makeSafeFilename,
	isDirPath,
	parentDir,
	uniqueFilePath,
	getExtension,
	fileName,
	isDirectory,
	fileNameNoExt
} from '../../../engine/d3dutility.js';

import {
	drawIconForObject,
	drawIconForExt
} from '../utilities/d3dicons.jsx';

const { path } = D3D;

const autoBlur = (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();   // stop form submit
		e.currentTarget.blur();
	}
}
let onSelectFile;

const Tabs = {
	All: 'all',
	Assets: 'assets',
	Scene: 'scene',
	Object: 'object',
	Project: 'project'
}

export default function Inspector() {
	const _editor = window._editor;
	const _root = window._root;
	const zip = _root?.zip;
	const THREE = window.THREE;
	
	const [tab, setTab] = useState(Tabs.All);
	const [objects, setObjects] = useState([]);
	const [dummyObject, setDummyObject] = useState();
	const [dummyProject, setDummyProject] = useState();
	const [assetExplorerOpen, setAssetExplorerOpen] = useState(false);
	const [assetExplorerFilter, setAssetExplorerFilter] = useState('all');
	const [assetExplorerSelected, setAssetExplorerSelected] = useState();
	const [sceneInspectorExpanded, setSceneInspectorExpanded] = useState(false);
	const [objectInspectorExpanded, setObjectInspectorExpanded] = useState(false);
	const [assetsInspectorExpanded, setAssetsInspectorExpanded] = useState(false);
	const [mediaInspectorExpanded, setMediaInspectorExpanded] = useState(false);
	
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
		_events.on('deselect-assets', () => {
			setSelectedAssetPaths(() => new Set());
			setLastSelectedPath(null);
		});
		_events.on('selected-objects', (selectedObjects) => {
			const selectedObject = selectedObjects[0];
			setObjects([...selectedObjects]);
		
			if(!selectedObject) {
				setDummyObject({});
			} else {
				setDummyObject({...selectedObject, name: selectedObject._name});
			}
		
			// Use functional state setter to ensure fresh reference
			_editor.updateInspector = () => {
				setDummyObject(prev => prev ? { ...prev } : {});
			};
		});
		
		_editor.onProjectLoaded = () => {
			setDummyProject({..._editor.project});
		}
		
		_editor.updateInspector = () => {};
	}, []);
	
	useEffect(() => {
		const onDelete = () => {
			if(_editor.gameOrInspectorActive())
				deleteSelectedObjects();
		}
		
		_events.on('delete-action', onDelete);
		_editor.selectNoAssets = () => setSelectedAssetPaths(new Set());
		
		return () => {
			_events.un('delete-action', onDelete);
		}
	}, [_editor.selectedObjects, selectedAssetPaths]);
	
	useEffect(() => {
		_editor.onAssetsUpdatedInspector = () => {
			if(_editor.__buildTree)
				setAssetTree(_editor.__buildTree());
		}
	}, [assetTree]);
	
	useEffect(() => {
		if(!_root)
			return;
		setBgType(_root.object3d.background?.isColor ? 'color' : 'none');
		setBgColor(_root.object3d.background?.isColor ? `#${_root.object3d.background.getHexString()}` : '#000000');
	}, [_root?.object3d?.background?.isColor]);
	
	const update = () => {
		setDummyObject({...dummyObject});
		setDummyProject({...dummyProject});
		_editor.setDirty(true);
	}
	const writeAndRefresh = (uri, data) => {
		_editor.writeFile({ path: uri, data });
		update();
	}
	const openAssetExplorer = ({ format, selectedAsset, onSelect }) => {
		setAssetExplorerFilter(format);
		setAssetExplorerOpen(true);
		setAssetExplorerSelected(selectedAsset);
		onSelectFile = onSelect;
	}
	const deleteSelectedObjects = () => {
		if(_editor.selectedObjects.length > 0) {
			if(_editor.mode == '2D' && _editor.renderer2d.edit.selectedPoints.length > 0)
				return;
			
			_editor.deleteSelectedObjects();
			setObjects([]);
		}else
		if(selectedAssetPaths.size > 0) {
			_editor.deleteSelectedAssets();
			setObjects([]);
		}
		
		update();
		_editor.renderer2d.drawer._rebuildSnapCache(); // rebuild 2d snap
	}
	const drawMaterialEditor = (uri) => (
		<MaterialEditor
			uri={uri}
			date={new Date()}
			onSave={async (prev, next) => {
				const before = JSON.stringify(prev);
				const after  = JSON.stringify(next);
				
				writeAndRefresh(uri, after);
				
				_editor.addStep({
					name: `Edit material: ${uri}`,
					undo: async () => {
						writeAndRefresh(uri, before);
						await _root.refreshObjectsWithResource(uri);
					},
					redo: async () => {
						writeAndRefresh(uri, after);
						await _root.refreshObjectsWithResource(uri);
					}
				});
				
				// apply to all other objects using this material
				await _root.refreshObjectsWithResource(uri);
			}}
			openAsset={openAssetExplorer}
		/>
	)
	const drawObjectInspector = () => {
		if(objects?.length < 1) {
			// Should never happen. dummyObject == defined = objects.length > 0;
			return;
		}
		if(dummyObject.part) {
			// Is a vector part
			return;
		}
		if(!dummyObject.name) {
			console.error('Fatal: Dummy object name undefined', dummyObject);
			return;
		}
		return (
			<InspectorCell 
				id="insp-cell-object" 
				title="Object" 
				expanded={objectInspectorExpanded}
				onExpand={() => setObjectInspectorExpanded(!objectInspectorExpanded)}
				alwaysOpen={tab != Tabs.All}
			>
				{
					objects.length === 1 && (
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
									const object = objects[0];
									const val = String(e.target.value).trim() || '';
									
									if(!val || !object.isNameAllowed(val)) {
										dummyObject.name = object.name; // revert
										update();
										
										return _editor.showError(`Object name not allowed. ${val != '' && !object.isValidName(val) ? 'Object names can only contain alphanumeric characters.' : ''}`);
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
					)
				}
				{
					objects.length > 1 && (
						<div className='small gray mb'>
							<i>Multiple objects selected</i>
						</div>
					)
				}
				
				<div className="field mt2">
					{
						objectInspectorExpanded && (
							<>
								<div className="field vector-field">
									<VectorInput 
										label="Position"
										values={objects.map(o => o.position)} 
										onSave={vector => {
											objects.forEach(object => {
												object.__inspApplyPos = () => object.setPosition(
													new THREE.Vector3(
														vector.x == '-' ? object.position.x : vector.x, 
														vector.y == '-' ? object.position.y : vector.y, 
														vector.z == '-' ? object.position.z : vector.z
													)
												);
												object.__inspApplyPos();
											});
											
											_editor.addStep({
												name: 'Update position',
												undo: () => {
													objects.forEach(object => 
														object.setPosition(object.__spOldPosition)
													);
												},
												redo: () => {
													objects.forEach(object => object.__inspApplyPos());
												}
											});
										}}
									/>
								</div>
								<div className="field vector-field">
									<VectorInput 
										label="Rotation"
										values={objects.map(o => (
											{
												x: THREE.MathUtils.radToDeg(o.rotation.x),
												y: THREE.MathUtils.radToDeg(o.rotation.y),
												z: THREE.MathUtils.radToDeg(o.rotation.z)
											}
										))}
										onSave={vector => {
											objects.forEach(object => {
												object.__inspApplyRot = () => object.setRotation(
													new THREE.Euler(
														vector.x == '-' ? object.rotation.x : THREE.MathUtils.degToRad(vector.x), 
														vector.y == '-' ? object.rotation.y : THREE.MathUtils.degToRad(vector.y), 
														vector.z == '-' ? object.rotation.z : THREE.MathUtils.degToRad(vector.z)
													)
												);
												object.__inspApplyRot();
											});
											
											_editor.addStep({
												name: 'Update rotation',
												undo: () => {
													objects.forEach(object => 
														object.setRotation(object.__spOldRotation)
													);
												},
												redo: () => {
													objects.forEach(object => object.__inspApplyRot());
												}
											});
										}}  
									/>
								</div>
								<div className="field vector-field">
									<VectorInput 
										label="Scale"
										values={objects.map(o => o.scale)} 
										onSave={vector => {
											objects.forEach(object => {
												object.__inspApplyScl = () => object.setScale(
													new THREE.Vector3(
														vector.x == '-' ? object.scale.x : vector.x, 
														vector.y == '-' ? object.scale.y : vector.y, 
														vector.z == '-' ? object.scale.z : vector.z
													)
												);
												object.__inspApplyScl();
											});
											
											_editor.addStep({
												name: 'Update scale',
												undo: () => {
													objects.forEach(object => 
														object.setScale(object.__spOldScale)
													);
												},
												redo: () => {
													objects.forEach(object => object.__inspApplyScl());
												}
											});
										}}
									/>
								</div>
								<div style={{height: 20}}></div>
								<div className="vector-input vector-input--top">
									<div>
										<label>Visible</label>
										<input 
											type="checkbox" 
											checked={objects[0].visible} 
											onChange={e => {
												const newVisible = e.target.checked;
												
												objects.forEach(object => {
													object.__inspWasVisible = object.visible;
													object.visible = newVisible;
												});
												update();
												
												_editor.addStep({
													name: 'Update visibility',
													undo: () => {
														objects.forEach(object => {
															object.visible = object.__inspWasVisible;
														});
														update();
													},
													redo: () => {
														objects.forEach(object => {
															object.visible = newVisible;
														});
														update();
													}
												});
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
											value={objects[0].opacity} 
											onChange={e => {
												const newOpacity = Number(e.target.value);
												
												objects.forEach(object => {
													object.__inspOldOpacity = object.opacity;
													object.opacity = newOpacity;
												});
												update();
												
												_editor.addStep({
													name: 'Update opacity',
													undo: () => {
														objects.forEach(object => {
															object.opacity = object.__inspOldOpacity;
														});
														update();
													},
													redo: () => {
														objects.forEach(object => {
															object.opacity = newOpacity;
														});
														update();
													}
												});
											}} 
										/>
									</div>
								</div>
							</>
						)
					}
				</div>
				
				{
					objects.length === 1 && (
						<div className="components-editor">
							{drawComponentsEditor()}
						</div>
					)
				}
			</InspectorCell>
		)
	}
	const drawComponentsEditor = () => {
		const rows = [];
		const object = objects[0];
		
		object.components.forEach(component => {
			if(!dummyObject.components)
				return;
			
			const fields = [];
			const schema = D3DComponents[component.type];
			const idx = object.components.indexOf(component);
			const dummyComponent = dummyObject.components[idx];
			const manager = object.getComponent(component.type);
			const sections = {};
			
			if(!schema) {
				console.warn(`Unknown component schema for '${component.type}'`);
				return;
			}
			if(!dummyComponent) {
				console.warn(`Unknown component for '${idx}'`);
				return;
			}
			
			if(schema.hidden)
				return;
				
			if(component.properties.__editorOnly)
				return;
			
			const deleteComponent = () => {
				const componentSerialized = object.getSerializedComponent(component);
				
				const doDelete = (addStep = true) => {
					addStep && _editor.addStep({
						name: 'Delete component',
						undo: () => {
							object.addComponent(
								component.type,
								componentSerialized.properties
							);
							update();
						},
						redo: () => {
							doDelete(false);
							update();
						}
					});
					
					// Remove from dummy first
					dummyObject.components.splice(dummyObject.components.findIndex(c => c.type == component.type), 1);
					object.removeComponent(component.type);
					
					_events.invoke('refresh-component', component.type);
					
					update();
				}
				
				_editor.showConfirm({
					title: 'Delete Component',
					message: `Are you sure you want to delete ${component.type} off this object?`,
					onConfirm: doDelete
				}) 
			}
			
			for(let fieldId in schema.fields) {
				const field = schema.fields[fieldId];
				const current = dummyComponent.properties[fieldId];
				
				if(field.hidden)
					continue;
					
				if(field.name == 'materials' && 
					dummyComponent.properties['minimaterial']?.enabled)
					continue;
				
				if(typeof field.condition == 'function') {
					if(field.condition(dummyComponent) === false)
						continue;
				}
				
				let desc = field.description;
				let sideBySide = true;
				
				const addStep = (val) => {
					const oldValue = component.properties[fieldId];
					const newValue = val;
					_editor.addStep({
						name: 'Update property',
						undo: () => {
							object.setComponentValue(
								component.type,
								fieldId,
								oldValue
							);
							update();
						},
						redo: () => {
							object.setComponentValue(
								component.type,
								fieldId,
								newValue
							);
							update();
						}
					});
				}
				const addStepManual = (oldValue, newValue) => {
					_editor.addStep({
						name: 'Update property',
						undo: () => {
							object.setComponentValue(
								component.type,
								fieldId,
								oldValue
							);
							update();
						},
						redo: () => {
							object.setComponentValue(
								component.type,
								fieldId,
								newValue
							);
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
								readOnly={field.readOnly}
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
									
									object.setComponentValue(
										component.type,
										fieldId,
										val
									);
									
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
								readOnly={field.readOnly}
								onChange={e => {
									let val = Number(e.target.value) || 0;
									
									dummyComponent.properties[fieldId] = val;
									update();
								}}
								onBlur={e => {
									let val = Number(e.target.value) || 0;
									
									if(field.min !== undefined && val < field.min)
										val = field.min;
									
									if(field.min !== undefined && val > field.max)
										val = field.max;
									
									if(field.convert)
										val = field.covert(val);
										
									addStep(val);
									
									dummyComponent.properties[fieldId] = val;
									
									object.setComponentValue(
										component.type,
										fieldId,
										val
									);
									
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
									step={field.step || 1}
									readOnly={field.readOnly}
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
										
										object.setComponentValue(
											component.type,
											fieldId,
											val
										);
										
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
								readOnly={field.readOnly}
								onKeyDown={autoBlur}
								onChange={e => {
									const val = !!e.target.checked;
									
									addStep(val);
									
									dummyComponent.properties[fieldId] = val;
									
									object.setComponentValue(
										component.type,
										fieldId,
										val
									);
									
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
								value={String(current).replace('0x', '#')}
								onKeyDown={autoBlur}
								readOnly={field.readOnly}
								onClick={e => {
									const val = (e.target.value || '#ffffff').replace('#', '0x');
									
									e.target.oldValue = val;
								}}
								onChange={e => {
									const val = (e.target.value || '#ffffff').replace('#', '0x');
									
									dummyComponent.properties[fieldId] = val;
									
									object.setComponentValue(
										component.type,
										fieldId,
										val
									);
									
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
					case 'colora': {
						fieldContent = (
							<ColorPicker
								value={String(current).replace('0x', '#')}
								displayMode='small'
								onKeyDown={autoBlur}
								readOnly={field.readOnly}
								onClick={val => {
									dummyComponent.__oldValue = val;
								}}
								onChange={val => {
									dummyComponent.properties[fieldId] = val;
									update();
									object.setComponentValue(
										component.type,
										fieldId,
										val
									);
								}}
								onBlur={val => {
									addStepManual(dummyComponent.__oldValue, val);
									dummyComponent.__oldValue = val;
								}}
							/>
						);
						break;
					}
					case 'colorbest': {
						fieldContent = (
							<ColorPickerBest
								value={current}
								onClick={val => {
									dummyComponent.__oldValue = val;
								}}
								onChange={val => {
									dummyComponent.properties[fieldId] = val;
									update();
									object.setComponentValue(
										component.type,
										fieldId,
										val
									);
								}}
								onBlur={val => {
									addStepManual(dummyComponent.__oldValue, val);
									dummyComponent.__oldValue = val;
								}}
							/>
						);
						break;
					}
					case 'file':
					case 'file[]': {
						sideBySide = false;
						
						const current = Array.isArray(dummyComponent.properties[fieldId])
							? dummyComponent.properties[fieldId]
							: [dummyComponent.properties[fieldId]];
						
						const browseAndAppend = () => openAssetExplorer({
							format: field.format,
							selectedAsset: '',
							onSelect: (assetPath) => {
								const uuid = _root.resolveAssetId(assetPath);
								const val = [...current, uuid];
								dummyComponent.properties[fieldId] = val;
								
								addStep(val);
								
								object.setComponentValue(
									component.type,
									fieldId,
									val
								);
								
								update();
							}
						});
						
						const drawExtra = () => {
							if(field.label == 'Materials') {
								const ids = component.properties['materials'];
								return drawMaterials(
									ids.map(id => _root.resolvePathNoAssets(id))
								);
							}
						}
						const drawMaterials = (uris) => {
							const mrows = [];
							
							uris.forEach(uri => {
								const originURI = uri;
								
								uri = path.join('assets', uri);
								if(uri.split('/')[1] == 'Standard')
									return;
								
								if(!originURI)
									return;
								
								mrows.push(
									<ComponentCell 
										title={fileNameNoExt(originURI)}
										key={mrows.length} 
									>
										{drawMaterialEditor(uri)}
									</ComponentCell>
								)
							});
							
							return (
								<div className='mt'>
									{mrows}
								</div>
							);
						}
					
						fieldContent = (
							<div className="file-array-field mt">
								<div className="file-array-list">
									{current.map((uuid, idx) => {
										const filePath = _root.resolvePathNoAssets(uuid);
										const fname = fileNameNoExt(filePath);
										const ext = getExtension(filePath);
										
										const browse = () => {
											openAssetExplorer({
												format: field.format,
												selectedAsset: filePath,
												onSelect: (assetPath) => {
													const uuid = _root.resolveAssetId(assetPath);
													let val;
													
													if(field.type == 'file[]') {
														val = [...current];
														val[idx] = uuid;
													}else
													if(field.type == 'file') {
														val = uuid;
													}
													
													addStep(val);
													
													dummyComponent.properties[fieldId] = val;
													
													object.setComponentValue(
														component.type,
														fieldId,
														val
													);
													
													_events.invoke('refresh-component', component.type);
													
													update();
												}
											})
										}
										
										return (
											<div key={idx} className="file-array-row">
												<div 
													className='tf'
													onClick={() => {
														if(!field.readOnly)
															browse();
													}}
													tabIndex={0}
												>
													{fname && (
														<div className='ib vm mrs'>
															{drawIconForExt(ext)}
														</div>
													)}
													<div className='ib vm'>
														{fname || 'No file selected'}
													</div>
												</div>
												{!field.readOnly && (
													<button
														title="Browse"
														onClick={browse}
													>
														<MdFolderOpen />
													</button>
												)}
												{field.type == 'file[]' && !field.readOnly && (
													<button
														title="Remove"
														onClick={() => {
															const val = current.filter((_, i) => i !== idx);
															
															addStep(val);
															
															dummyComponent.properties[fieldId] = val;
															
															object.setComponentValue(
																component.type,
																fieldId,
																val
															);
															
															_events.invoke('refresh-component', component.type);
															
															update();
														}}
													>
														<MdDelete />
													</button>
												)}
											</div>
										)
									})}
								</div>
					
								{field.type == 'file[]' && (
									<div className="file-array-actions">
										<button
											title="Add"
											onClick={() => {
												if(!field.readOnly)
													browseAndAppend();
											}}
										>
											<MdAdd />
										</button>
									</div>
								)}
								
								{drawExtra()}
							</div>
						);
						break;
					}
					case 'fonts':
					case 'select': {
						const selRows = [];
						const currentOption = field.options.find(
							o => o.name == current
						);
						
						const options = [...field.options];
						
						options.forEach(option => {
							selRows.push(
								<option
									key={selRows.length}
									value={option.name}
								>
									{option.label}
								</option>
							)
						});
						
						if(currentOption?.description)
							desc = currentOption.description;
						
						fieldContent = (
							<>
								<select
									className='tf'
									value={current}
									onChange={e => {
										const val = e.target.value;
										
										addStep(val);
										
										dummyComponent.properties[fieldId] = val;
										
										object.setComponentValue(
											component.type,
											fieldId,
											val
										);
										
										update();
									}}
								>
									{selRows}
								</select>
							</>	
						)
						break;
					}
					case '_textStyle': {
						const drawButton = (content, activeCondition, onClick, title = '') => {
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
						fieldContent = (
							<div className='text-style-editor'>
								{
									drawButton(
										(<b>B</b>),
										() => dummyComponent.properties.fontWeight == 'bold',
										() => {
											const val = dummyComponent.properties.fontWeight;
											
											dummyComponent.properties.fontWeight = val == 'bold' ? 'normal' : 'bold';
											update();
										}
									)
								}
								{
									drawButton(
										(<i>i</i>),
										() => dummyComponent.properties.fontStyle == 'italic',
										() => {
											const val = dummyComponent.properties.fontStyle;
											
											dummyComponent.properties.fontStyle = val == 'italic' ? 'normal' : 'italic';
											update();
										}
									)
								}
								<div style={{width: 15}}></div>
								{
									drawButton(
										(<MdFormatAlignLeft />),
										() => dummyComponent.properties.align == 'left',
										() => {
											const val = dummyComponent.properties.align;
											
											dummyComponent.properties.align = val == 'left' ? 'normal' : 'left';
											update();
										}
									)
								}
								{
									drawButton(
										(<MdFormatAlignCenter />),
										() => dummyComponent.properties.align == 'center',
										() => {
											const val = dummyComponent.properties.align;
											
											dummyComponent.properties.align = val == 'center' ? 'normal' : 'center';
											update();
										}
									)
								}
								{
									drawButton(
										(<MdFormatAlignRight />),
										() => dummyComponent.properties.align == 'right',
										() => {
											const val = dummyComponent.properties.align;
											
											dummyComponent.properties.align = val == 'right' ? 'normal' : 'right';
											update();
										}
									)
								}
							</div>
						);
						break;
					}
					case 'none':
						fieldContent = null;
						break;
					default: {
						fieldContent = (<i>No editor</i>)
						break;
					}
				}
				
				if(!fieldContent)
					continue;
					
				let rowContainer = fields;
				
				if(field.section) {
					if(!sections[field.section])
						sections[field.section] = [];
					
					rowContainer = sections[field.section];
				}
				
				if(sideBySide) {
					rowContainer.push(
						<div className='field' key={rowContainer.length}>
							<div className='sidebyside'>
								<div className='left-side'>
									<label>{field.label}</label>
									{desc && (
										<div className='small gray desc mt'>
											{desc}
										</div>
									)}
								</div>
								<div className='right-side'>
									{fieldContent}
								</div>
							</div>
						</div>
					);
				}else{
					rowContainer.push(
						<div className='field' key={rowContainer.length}>
							<label>{field.label}</label>
							{desc && (
								<div className='small gray mt'>
									{desc}
								</div>
							)}
							{fieldContent}
						</div>
					);
				}
			}
			
			const drawFields = () => {
				const rows = [];
				
				if(schema.sectionsLast)
					rows.push(...fields);
				
				for(let i in sections) {
					const rws = sections[i];
					
					rows.push(
						<div 
							key={rows.length+1000} 
							className='component-section shade'
						>
							{rws}
						</div>
					);
				}
				
				if(!schema.sectionsLast)
					rows.push(...fields);
				
				return rows;
			}
			
			rows.push(
				<ComponentCell 
					key={rows.length}
					title={schema.name || component.type}
					enabled={component.enabled}
					togglable={true}
					onToggleEnable={(enabled) => {
						component.enabled = enabled;
						update();
					}}
					bar={!schema.persistent && (
						<div 
							className='component-delete'
							onClick={(e) => {
								e.stopPropagation();
								deleteComponent();
							}}
						>
							<MdDelete />
						</div>
					)}
				>
					{drawFields()}
				</ComponentCell>
			);
		});
		
		return rows;
	}
	const drawProjectInspector = () => {
		return (
			<InspectorCell 
				id="insp-cell-project" 
				title="Project"
				alwaysOpen={tab != Tabs.All}
			>
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
							_editor.renderer2d.refreshSize();
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
							_editor.renderer2d.refreshSize();
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
				const classes = ['object-path-item'];
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
				
				if(object == _editor.focus) {
					classes.push('object-path-item--active')
				}
				
				path.push(
					<React.Fragment key={path.length}>
						<div 
							className={classes.join(' ')}
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
					</React.Fragment>
				)
			});
			
			return path;
		}
		const drawObjects = () => {
			const rows = [];
			const objects = _editor.focus.children
			.filter(
				c => !c.editorOnly &&
				(
					(_editor.mode == '3D' && c.is3D) || 
					(_editor.mode == '2D' && c.is2D)
				)
			);
			
			if(objects.length < 1)
				return <div className='no-label'>No {_editor.mode} objects in scene</div>
			
			objects.forEach(object => {
				const selected = _editor.selectedObjects.includes(object);
				
				rows.push(
					<ObjectRow
						key={rows.length}
						icon={drawIconForObject(object)}
						name={object.name}
						selected={selected}
						isInstance={true}
						onRename={(newName) => {
							//if(!object.isValidName(newName))
								//return object.name;
							
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
							//_editor.focusOnSelectedObjects();
							_editor.setSelection([]);
						}}
					>
						<div className='option-buttons'>
							{
								!!object.__script && (
									<div 
										className='option-button'
										title='Code'
										onClick={(e) => {
											e.stopPropagation();
											_editor.openCode(object);
										}}
									>
										<MdCode />
									</div>
								)
							}
							
							<div 
								className='option-button option-button--lock'
								title='Selection lock'
								onClick={(e) => {
									e.stopPropagation();
									object.__editorState.locked = !object.__editorState.locked;
									
									if(_editor.selectedObjects.includes(object))
										_editor.removeSelection([object]);
									
									update();
								}}
							>
								{
									!!object.__editorState.locked ? 
										<MdLock /> : <MdLockOpen style={{opacity: 0.5}} />
								}
							</div>
							<div 
								className='option-button option-button--hidden'
								title='Editor visible'
								onClick={(e) => {
									e.stopPropagation();
									object.__editorState.hidden = !object.__editorState.hidden;
									update();
								}}
							>
								{
									!!object.__editorState.hidden ? 
										<IoMdEyeOff /> : <IoMdEye style={{opacity: 0.5}} />
								}
							</div>
						</div>
					</ObjectRow>
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
				alwaysOpen={tab != Tabs.All}
			>
				{sceneInspectorExpanded && (
					<div className="tools-section assets-insp-tools">
						<button
							className="btn-small btn-destructive"
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
				{sceneInspectorExpanded && _editor.focus == _root && _editor.mode == '3D' && (
					drawBackgroundSettings()
				)}
			</InspectorCell>
		)
	}
	const drawAssetInspector = () => {
		const ROOT = 'assets/';
	
		// ------------------------------
		// Path helpers (one source of truth)
		// ------------------------------
		const normPath = (p) => {
			if (!p) return '';
			let s = p.replace(/\\/g, '/').replace(/^\/+/, '');
			if (s === 'assets' || s === 'assets/') return 'assets'; // unify root
			// strip trailing slashes always
			return s.replace(/\/+$/, '');
		};
		const isRoot = (p) => normPath(p) === ROOT;
		const isDirLike = (p) => normPath(p).endsWith('/');
		const parentDir = (p) => {
			const s = normPath(p);
			if (isRoot(s)) return ROOT;
			const trimmed = s.endsWith('/') ? s.slice(0, -1) : s;
			const idx = trimmed.lastIndexOf('/');
			if (idx <= 0) return ROOT;
			return trimmed.slice(0, idx + 1);
		};
		const baseName = (p) => {
			const s = normPath(p);
			const tr = s.endsWith('/') ? s.slice(0, -1) : s;
			return tr.split('/').pop();
		};
		// Returns a normalized list of items to drag based on what was grabbed.
		const getDragPaths = (clickedPath) => {
			const np = normPath(clickedPath);
			// Drag the whole selection if the clicked item is in it; otherwise just the clicked one.
			return selectedAssetPaths.has(np)
				? Array.from(selectedAssetPaths).map(normPath)
				: [np];
		};
		const getPayloadPaths = (payload) => {
			if (!payload) return [];
			if (Array.isArray(payload.paths) && payload.paths.length) return payload.paths.map(normPath);
			if (payload.path) return [normPath(payload.path)];
			return [];
		};
		const moveManyTo = async (srcPaths, destDir) => {
			const dst = normPath(destDir);           // folder path (no trailing slash)
			const destSlash = `${dst}/`;
			const moved = [];
		
			for (const raw of srcPaths) {
				const src = normPath(raw);
				const srcIsDir = isDirectory(zip, src);
		
				// block moving a folder into itself/descendant
				if (srcIsDir) {
					if (dst === src || dst.startsWith(`${src}/`)) {
						continue; // skip invalid move, carry on with others
					}
				}
		
				// moveZipEntry should accept dest dir with trailing slash
				const res = await moveZipEntry(zip, src, destSlash, { updateIndex });
				// res may shape as {dir: '...', file: '...'} — normalize:
				const movedTo = normPath(res?.dir || res?.file || joinPath(dst, baseName(src)));
				moved.push(movedTo);
			}
		
			return moved;
		};
	
		if (!zip) return <div className="no-label">No project file mounted</div>;
	
		const updateIndex = (oldRel, newRel) => {
			console.log(oldRel, newRel);
			const a = _root.findAssetByPath(oldRel);
			if (a) a.rel = newRel;
		};
	
		// ------------------------------
		// Tree builder (kept, but normalized)
		// ------------------------------
		const buildTree = () => {
			const root = { name: 'assets', path: 'assets', type: 'dir', children: new Map() };
		
			zip.forEach((rel, file) => {
				if (!rel.startsWith('assets/')) return;
				if (rel.startsWith('assets/Standard/')) return;
		
				const stripped = rel.slice('assets/'.length);
				if (!stripped) return;
		
				const parts = stripped.split('/').filter(Boolean);
				let node = root;
		
				for (let i = 0; i < parts.length; i++) {
					const part = parts[i];
					const isLast = i === parts.length - 1;
					const keyPath = (node.path ? node.path + '/' : '') + part;
		
					// make sure node has children if it's a dir
					if (node.type !== 'dir') {
						node.type = 'dir';
						node.children = new Map();
					}
		
					if (isLast && !file.dir) {
						node.children.set(part, { name: part, path: keyPath, type: 'file' });
					} else {
						if (!node.children.has(part)) {
							node.children.set(part, { name: part, path: keyPath, type: 'dir', children: new Map() });
						} else {
							// if an entry exists but was a file, promote it to a dir
							const existing = node.children.get(part);
							if (existing.type !== 'dir') {
								existing.type = 'dir';
								existing.children = new Map();
							}
						}
						node = node.children.get(part);
					}
				}
			});
		
			// normalize Map -> Array and sort
			const normalize = (n) => {
				if (n.type === 'dir') {
					const arr = Array.from(n.children.values());
					arr.sort((a, b) => {
						if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
						return a.name.localeCompare(b.name);
					});
					n.children = arr;
					n.children.forEach(normalize);
				}
			};
			normalize(root);
		
			return root;
		};
	
		// expanded
		const isExpanded = (p) => assetExpanded.has(p);
		const toggleExpanded = (p) => {
			setAssetExpanded(prev => {
				const next = new Set(prev);
				next.has(p) ? next.delete(p) : next.add(p);
				return next;
			});
		};
	
		// ------------------------------
		// Selection (centralized & concrete)
		// ------------------------------
		const selectedArr = Array.from(selectedAssetPaths);
		const primarySel = selectedArr.length ? selectedArr[selectedArr.length - 1] : 'assets';
		const currentFolder = isDirLike(primarySel) ? primarySel.replace(/\/$/, '') : parentDir(primarySel).replace(/\/$/, '');
		
		const isSelected = (p) => selectedAssetPaths.has(normPath(p));
		
		const selectNone = () => {
			_editor.setSelection([], false, false);
			setSelectedAssetPaths(() => new Set());
			setLastSelectedPath(null);
		};
	
		const setSingleSelection = (p) => {
			const np = p ? p : null;
			_editor.setSelection([], false, false);
			setSelectedAssetPaths(() => (np ? new Set([np]) : new Set()));
			setLastSelectedPath(np);
		};
	
		const toggleSelection = (p) => {
			setSelectedAssetPaths(prev => {
				const next = new Set(prev);
				next.has(p) ? next.delete(p) : next.add(p);
				return next;
			});
			_editor.setSelection([], false, false);
			setLastSelectedPath(p);
		};
	
		const selectRange = (siblings, fromPath, toPath) => {
			// normalize inputs
			const A = fromPath ? normPath(fromPath) : null;
			const B = toPath ? normPath(toPath) : null;
		
			// trivial cases
			if (!B) return;
			if (!A || A === B) return setSingleSelection(B);
		
			const sibs = Array.isArray(siblings) ? siblings : [];
		
			// helpers
			const byPath = (list, p) => list.find(n => normPath(n.path) === p);
			const idxIn  = (list, p) => list.findIndex(n => normPath(n.path) === p);
		
			const aNode = byPath(sibs, A);
			const bNode = byPath(sibs, B);
		
			// choose the selection pool
			let pool;
			if (aNode && bNode && aNode.type === 'file' && bNode.type === 'file') {
				pool = sibs.filter(n => n.type === 'file');
			} else if (aNode && bNode && aNode.type === 'dir' && bNode.type === 'dir') {
				pool = sibs.filter(n => n.type === 'dir');
			} else {
				pool = sibs; // mixed endpoints → select across both files and dirs
			}
		
			// find indices inside chosen pool; if either not found, fall back to full siblings
			let iA = idxIn(pool, A);
			let iB = idxIn(pool, B);
			if (iA === -1 || iB === -1) {
				pool = sibs;
				iA = idxIn(pool, A);
				iB = idxIn(pool, B);
				if (iA === -1 || iB === -1) return setSingleSelection(B);
			}
		
			const start = Math.min(iA, iB);
			const end   = Math.max(iA, iB);
		
			setSelectedAssetPaths(prev => {
				const next = new Set(prev);
				for (let i = start; i <= end; i++) next.add(normPath(pool[i].path));
				return next;
			});
		
			// keep editor selection model in sync (use your signature)
			_editor.setSelection([], false, false);
			setLastSelectedPath(B);
		};
	
		// ------------------------------
		// Import / create
		// ------------------------------
		const onImportFiles = async (files) => {
			if (!files || !files.length) return;
			const destDir = currentFolder; // no slash
			for (const f of files) {
				await _editor.importFile(f, destDir);
			}
			setAssetTree(buildTree());
			setAssetExpanded(prev => new Set(prev).add(destDir));
			const sel = `${destDir}/${files[0].name}`;
			
			if(zip.file(sel))
				setSingleSelection(sel);
			
			_editor.onAssetsUpdated();
		};
	
		const onNewFolder = (name) => {
			const safe = makeSafeFilename(name);
			if (!safe) return;
			const dirPath = uniqueDirPath(zip, currentFolder, safe); // returns "assets/.../New/"
			zip.folder(dirPath);
			setAssetTree(buildTree());
			setAssetExpanded(prev => new Set(prev).add(currentFolder));
			setSingleSelection(dirPath.replace(/\/$/, ''));
			setNewFolderOpen(false);
			setNewFolderName('');
			_editor.onAssetsUpdated();
		};
	
		const addNewFile = () => {
			const path = uniqueFilePath(zip, currentFolder, 'New asset'); // returns file path
			zip.file(path, new Uint8Array());
			setAssetTree(buildTree());
			setAssetExpanded(prev => new Set(prev).add(currentFolder));
			setSingleSelection(path);
			_editor.onAssetsUpdated();
		};
	
		// ------------------------------
		// DnD helpers
		// ------------------------------
		const MIME = MIME_D3D_ROW || 'application/x-d3d-objectrow';
		const canAccept = (e) => {
			const t = e.dataTransfer?.types;
			return !!t && Array.from(t).includes(MIME);
		};
		const unpack = (e) => {
			try { return JSON.parse(e.dataTransfer.getData(MIME) || '{}'); }
			catch { return null; }
		};
	
		// ------------------------------
		// Delete (triple-guarded)
		// ------------------------------
		const canDelete = [...selectedAssetPaths].some(p => !isRoot(p));
	
		const deleteSelected = (explicitTargets) => {
			const targets = (explicitTargets || [...selectedAssetPaths])
				.map(normPath)
				.filter(p => !isRoot(p));
	
			if (!targets.length) return;
	
			for (const p of targets) {
				if (!isDirLike(p)) {
					zip.remove(p); // file
					_editor.onAssetDeleted?.(p);
					continue;
				}
				// folder: remove all under it
				const dir = normPath(p); // ends with /
				const toRemove = [];
				zip.forEach((rel) => { if (normPath(rel).startsWith(dir)) toRemove.push(rel); });
				toRemove.forEach(rel => zip.remove(rel));
				if (zip.files[dir]) zip.remove(dir);
			}
	
			selectNone();
			setAssetTree(buildTree());
			_editor.onAssetsUpdated?.();
		};
	
		const deleteSelectedConfirm = async () => {
			if (!selectedAssetPaths.size) return;
			const targets = [...selectedAssetPaths].map(normPath).filter(p => !isRoot(p));
			if (!targets.length) {
				_editor.showAlert?.({ message: 'You cannot delete the root assets folder.' });
				return;
			}
			
			const label = targets.length === 1 ? fileName(targets[0]) : `${targets.length} items`;
			_editor.showConfirm({
				message: `Delete ${label}? This action cannot be undone.`,
				onConfirm: () => deleteSelected(targets)
			});
		};
		_editor.deleteSelectedAssets = deleteSelectedConfirm;
	
		// ------------------------------
		// Node renderers
		// ------------------------------
		const renderNode = (node, depth = 0, siblings = []) => {
			const selected = isSelected(node.path);
			const ext = getExtension(node.name);
			const displayName = fileNameNoExt(node.name);
			
			if (node.type === 'file') {
				return (
					<ObjectRow
						key={node.path}
						icon={drawIconForExt(ext)}
						name={node.name}
						displayName={displayName}
						selected={selected}
						style={{ paddingLeft: 6 + depth * 24 }}
						draggable
						dragData={{
							kind: 'assets',
							primary: node.path,
							paths: getDragPaths(node.path)   // <-- multi-drag
						}}
						onRename={async (newName) => {
							try {
								const newPath = await renameZipFile(zip, node.path, newName, updateIndex);
								setAssetTree(buildTree());
								setSingleSelection(newPath);
								_editor.onAssetsUpdated();
							} catch (err) {
								console.warn('Rename failed:', err);
							}
							return newName;
						}}
						title={node.path}
						onClick={(e) => {
							if (e.shiftKey) selectRange(siblings, lastSelectedPath, node.path);
							else if (e.metaKey || e.ctrlKey) toggleSelection(node.path);
							else setSingleSelection(node.path);
						}}
						onDoubleClick={() => setSingleSelection(node.path)}
					/>
				);
			}else{
				// dir
				const open = isExpanded(node.path);
				return (
					<React.Fragment key={node.path || 'assets'}>
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
									{drawIconForExt(ext, true)}
								</>
							)}
							name={node.name}
							displayName={displayName}
							selected={selected}
							title={node.path || '/'}
							style={{ paddingLeft: 6 + depth * 14 }}
							droppable
							draggable
							dragData={{
								kind: 'assets',
								primary: node.path,
								paths: getDragPaths(node.path)   // <-- multi-drag
							}}
							onDrop={async (e, payload) => {
								e.stopPropagation();
								e.preventDefault();
								try {
									const paths = getPayloadPaths(payload);
									if (!paths.length) return;
							
									const destDir = node.path; // normalized (no trailing slash)
									const movedTo = await moveManyTo(paths, destDir);
							
									setAssetTree(buildTree());
									setAssetExpanded(prev => {
										const next = new Set(prev);
										next.add(destDir);
										return next;
									});
							
									// Re-select everything that successfully moved
									if (movedTo.length) {
										setSelectedAssetPaths(new Set(movedTo.map(normPath)));
										setLastSelectedPath(movedTo[movedTo.length - 1]);
									}
							
									_editor.onAssetsUpdated();
								} catch (err) {
									console.error('Move failed', err);
								}
							}}
							onRename={async (newName) => {
								try {
									const newPath = await renameZipDirectory(zip, node.path, newName, updateIndex);
									setAssetTree(buildTree());
									setSingleSelection(newPath.replace(/\/$/, ''));
									_editor.onAssetsUpdated();
								} catch (err) {
									console.warn('Rename failed:', err);
								}
								return newName;
							}}
							onClick={(e) => {
								if (e.shiftKey) selectRange(siblings, lastSelectedPath, node.path);
								else if (e.metaKey || e.ctrlKey) toggleSelection(node.path);
								else setSingleSelection(node.path);
							}}
							onDoubleClick={() => toggleExpanded(node.path)}
						/>
						{open && node.children?.map(child => (
							<React.Fragment key={child.path}>
								{renderNode(child, depth + 1, node.children)}
							</React.Fragment>
						))}
					</React.Fragment>
				);
			}
		};
	
		// ------------------------------
		// Duplicate (uses selection API)
		// ------------------------------
		const dupeInspector = async () => {
			if (!selectedAssetPaths.size) return;
	
			const ensureDir = (p) => (p.endsWith('/') ? p : p + '/');
			const parent = (p) => {
				const s = normPath(p);
				const pv = s.endsWith('/') ? s.slice(0, -1) : s;
				const i = pv.lastIndexOf('/');
				return i <= 0 ? ROOT.slice(0, -1) : pv.slice(0, i);
			};
			const splitNameExt = (name) => {
				const i = name.lastIndexOf('.');
				return i <= 0 ? { base: name, ext: '' } : { base: name.slice(0, i), ext: name.slice(i) };
			};
			const basename = (p) => p.split('/').pop();
			const isDir = (p) => p.endsWith('/') || (zip.file(p)?.dir === true);
	
			const uniqueSiblingFile = (dir, fileName) => {
				const { base, ext } = splitNameExt(fileName);
				let candidate = `${dir}/${base} copy${ext}`;
				let n = 2;
				while (zip.file(candidate)) {
					candidate = `${dir}/${base} copy ${n}${ext}`;
					n++;
				}
				return candidate;
			};
			const uniqueSiblingDir = (dir, folderName) => {
				let candidate = ensureDir(`${dir}/${folderName} copy`);
				let n = 2;
				let exists = false;
				zip.forEach((rel) => { if (rel.startsWith(candidate)) exists = true; });
				while (exists) {
					candidate = ensureDir(`${dir}/${folderName} copy ${n}`);
					exists = false;
					zip.forEach((rel) => { if (rel.startsWith(candidate)) exists = true; });
					n++;
				}
				return candidate;
			};
	
			const newSelections = new Set();
	
			for (const srcPath0 of selectedAssetPaths) {
				const dirish = isDir(srcPath0);
				if (!dirish) {
					const dir = parent(srcPath0);
					const name = basename(srcPath0);
					const dstPath = uniqueSiblingFile(dir, name);
					const file = zip.file(srcPath0);
					if (!file) continue;
					const buf = await file.async('arraybuffer');
					zip.file(dstPath, buf);
					newSelections.add(dstPath);
				} else {
					const srcDir = ensureDir(srcPath0);
					const dirParent = parent(srcDir.slice(0, -1));
					const folderName = basename(srcDir.slice(0, -1));
					const dstDir = uniqueSiblingDir(dirParent, folderName); // ends with '/'
	
					const copyPromises = [];
					zip.forEach((rel, file) => {
						if (!rel.startsWith(srcDir)) return;
						const tail = rel.slice(srcDir.length);
						const outRel = dstDir + tail;
						if (file.dir) zip.folder(outRel);
						else {
							copyPromises.push(file.async('arraybuffer').then(buf => zip.file(outRel, buf)));
						}
					});
					await Promise.all(copyPromises);
	
					newSelections.add(dstDir.replace(/\/$/, ''));
				}
			}
	
			const newTree = buildTree();
			setAssetTree(newTree);
	
			setAssetExpanded(prev => {
				const next = new Set(prev);
				for (const p of newSelections) next.add(parentDir(p).replace(/\/$/, ''));
				return next;
			});
	
			setSelectedAssetPaths(newSelections);
			setLastSelectedPath([...newSelections][newSelections.size - 1] || null);
	
			_editor.onAssetsUpdated?.();
		};
		_editor.__buildTree = buildTree;
		_editor.__dupeInspector = dupeInspector;
	
		// ------------------------------
		// Build once / refresh
		// ------------------------------
		const tree = assetTree ?? buildTree();
		if (assetTree !== tree) setAssetTree(tree);
	
		// ------------------------------
		// Render
		// ------------------------------
		return (
			<InspectorCell
				id="insp-cell-assets"
				title="Assets"
				alwaysOpen={tab != Tabs.All}
				expanded={assetsInspectorExpanded}
				onExpand={() => setAssetsInspectorExpanded(!assetsInspectorExpanded)}
				onDragOver={(e) => {
					if (!canAccept(e)) return;
					e.preventDefault();
					e.dataTransfer.dropEffect = 'copy';
				}}
				onDrop={async (e) => {
					if (!canAccept(e)) return;
					e.preventDefault();
				
					const payload = unpack(e);
					const paths = getPayloadPaths(payload);
					if (!paths.length) return;
				
					const dstDir = ROOT;
					const movedTo = await moveManyTo(paths, dstDir);
				
					setAssetTree(buildTree());
					setAssetExpanded(prev => new Set(prev).add(dstDir));
				
					if (movedTo.length) {
						setSelectedAssetPaths(new Set(movedTo.map(normPath)));
						setLastSelectedPath(movedTo[movedTo.length - 1]);
					}
				
					_editor.onAssetsUpdated();
				}}
			>
				{assetsInspectorExpanded && (
					<div className="tools-section assets-insp-tools">
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
							title={selectedAssetPaths.size > 0 ? 'Delete selected' : 'Delete'}
							disabled={!canDelete}
						>
							<MdDeleteForever />
						</button>
	
						<input
							ref={assetFileInputRef}
							type="file"
							multiple
							style={{ display: 'none' }}
							onChange={async (e) => {
								const files = Array.from(e.target.files || []);
								e.target.value = '';
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
										if (e.key === 'Enter') onNewFolder(newFolderName);
										else if (e.key === 'Escape') {
											setNewFolderOpen(false);
											setNewFolderName('');
										}
									}}
									style={{ width: 160 }}
								/>
								<button onClick={() => onNewFolder(newFolderName)}>Okay</button>
								<button onClick={() => { setNewFolderOpen(false); setNewFolderName(''); }}>Cancel</button>
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
	}
	const drawMediaInspector = () => {
		const uri = selectedAssetPaths.values().next().value;
		const ext = getExtension(uri);
		
		const drawInspControls = () => {
			switch(ext) {
				case 'mat': {
					return drawMaterialEditor(uri);
				}
				default: return;
			}
		}
		
		const drawnControls = drawInspControls();
		
		if(!drawnControls)
			return;
		
		return (
			<InspectorCell 
				id="insp-cell-media" 
				title="Media" 
				expanded={mediaInspectorExpanded}
				onExpand={() => setMediaInspectorExpanded(!mediaInspectorExpanded)}
				alwaysOpen={tab != Tabs.All}
			>
				{drawnControls}
			</InspectorCell>
		)
	}
	
	const drawTabButtons = () => {
		const rows = [];
		
		for(let tabName in Tabs) {
			const id = Tabs[tabName];
			const classes = ['tab'];
			
			if(tab == id)
				classes.push('tab--selected');
			
			rows.push(
				<div 
					className={classes.join(' ')} 
					onClick={() => setTab(id)}
					key={rows.length}
				>
					{tabName}
				</div>
			)
		}
		
		return rows;
	}
	
	return (
		<div className='insp-view'>
			<div className='tabs-container'>
				<div className='tabs no-scrollbar'>
					{drawTabButtons()}
				</div>
			</div>
			
			<div className={`insp-itself insp-view-${tab}`}>
				{(tab == 'assets' || tab == 'all') && _root && drawAssetInspector()}
				{(tab == 'scene' || tab == 'all') && _root && drawSceneInspector()}
				{(tab == 'object' || tab == 'all') && objects.length > 0 && drawObjectInspector()}
				{selectedAssetPaths.size == 1 && drawMediaInspector()}
				{(tab == 'project' || tab == 'all') && _editor.project && _editor.focus == _root && drawProjectInspector()}
				
				<div style={{height: 45}} />
			</div>
			
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
		</div>
	)
}