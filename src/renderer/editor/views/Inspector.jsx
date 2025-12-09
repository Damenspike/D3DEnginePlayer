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
	MdLock, MdLockOpen,
	MdCheckBox, MdCheckBoxOutlineBlank
} from 'react-icons/md';
import { IoMdEye, IoMdEyeOff } from 'react-icons/io';
import { 
	AiOutlineVerticalAlignTop,
	AiOutlineVerticalAlignMiddle,
	AiOutlineVerticalAlignBottom
	
} from "react-icons/ai";

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
	hex8ToRgba
} from '../../../engine/d2dutility.js';

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
const sharedInspector = {};
const DASH = '–';

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
	
	const assetsListRef = useRef();
	const sceneListRef = useRef();
	
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
	const [sceneFilter, setSceneFilter] = useState('');
	const [assetFilter, setAssetFilter] = useState('');
	
	// Scene config states
	const [bgType, setBgType] = useState('none');
	const [bgColor, setBgColor] = useState('#000000');
	const [bgTextureAsset, setBgTextureAsset] = useState('');
	
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
		_editor.exportSelectedAssetsInspector = () => {
			if(selectedAssetPaths.size < 1) {
				_editor.showError({
					title: 'Export',
					message: 'Select asset(s) to export'
				})
				return;
			}
			
			_editor.exportAssets([...selectedAssetPaths]);
		}
		
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
		setBgType(_root.scene.background.type);
		setBgColor(_root.scene.background.color);
		setBgTextureAsset(_root.scene.background.textureAsset);
	}, [_root?.scene?.background?.type]);
	
	// Right click menu on asset list
	useEffect(() => {
		if(!assetsListRef?.current)
			return;
			
		const assetsList = assetsListRef.current;
		
		const onRightClick = (e) => {
			if(selectedAssetPaths.size < 1)
				return;
			
			const template = [
				{
					id: 'rename',
					label: 'Rename',
					enabled: selectedAssetPaths.size === 1
				},
				{
					id: 'delete',
					label: 'Delete'
				},
				{
					id: 'export',
					label: 'Export...'
				},
				{type: 'separator'},
				{
					id: 'newfolder',
					label: 'New Folder'
				},
				{
					id: 'import',
					label: 'Import Asset...'
				}
			];
			const x = e.clientX + 2;
			const y = e.clientY + 2;
			
			_events.unall('ctx-menu-action');
			_events.once('ctx-menu-action', onCtxMenuAction);
			_events.once('ctx-menu-close', () => {
				_events.unall('ctx-menu-action');
			});
			
			D3D.openContextMenu({template, x, y});
		}
		const onCtxMenuAction = async (id) => {
			switch(id) {
				case 'rename':
					_events.invoke('edit-object-row');
				break;
				case 'export':
					_editor.exportAssets([...selectedAssetPaths]);
				break;
				case 'delete':
					_editor.delete();
				break;
				case 'newfolder':
				console.log('new folder');
					_editor.newFolder();
				break;
			}
		}
		
		assetsList.addEventListener('contextmenu', onRightClick);
		
		_editor.invokeAssetRightClick = onRightClick;
		
		return () => {
			assetsList.removeEventListener('contextmenu', onRightClick);
		}
	}, [assetsListRef, selectedAssetPaths]);
	
	// Right click menu on scene list
	useEffect(() => {
		if(!sceneListRef?.current)
			return;
			
		const sceneList = sceneListRef.current;
		
		const onRightClick = (e) => {
			if(_editor.selectedObjects.length < 1)
				return;
			
			const template = [
				{
					id: 'cut',
					label: 'Cut'
				},
				{
					id: 'copy',
					label: 'Copy'
				},
				{
					id: 'paste',
					label: 'Paste'
				},
				{
					id: 'duplicate',
					label: 'Duplicate'
				},
				{
					id: 'rename',
					label: 'Rename',
					enabled: _editor.selectedObjects.length === 1
				},
				{
					id: 'delete',
					label: 'Delete'
				},
				{ type: 'separator' },
				{
					id: 'focus',
					label: 'Focus'
				},
				{
					id: 'movetoview',
					label: 'Move to View'
				},
				{
					id: 'aligntoview',
					label: 'Align to View'
				},
				{
					id: 'droptoground',
					label: 'Drop to Ground'
				},
				{ type: 'separator' },
				{
					id: 'symbolise',
					label: 'Symbolise'
				},
				{
					id: 'desymbolise',
					label: 'Desymbolise'
				},
				{ type: 'separator' },
				{
					id: 'group',
					label: 'Group'
				},
				{
					id: 'ungroup',
					label: 'Ungroup'
				},
				{ type: 'separator' },
				{
					id: 'exportpng',
					label: 'Export As PNG...'
				},
				{
					id: 'exportd3d',
					label: 'Export As D3D...'
				},
				{
					id: 'exportd3dproj',
					label: 'Export As Project...'
				},
				{ type: 'separator' },
				{
					id: 'edit',
					label: 'Edit In Place',
					enabled: _editor.selectedObjects.length === 1
				},
				{
					id: 'code',
					label: 'Code'
				},
			];
			const x = e.clientX + 2;
			const y = e.clientY + 2;
			
			_events.unall('ctx-menu-action');
			_events.once('ctx-menu-action', onCtxMenuAction);
			_events.once('ctx-menu-close', () => {
				_events.unall('ctx-menu-action');
			});
			
			D3D.openContextMenu({template, x, y});
		}
		const onCtxMenuAction = async (id) => {
			switch(id) {
				case 'cut':
					_editor.cut();
				break;
				case 'copy':
					_editor.copy();
				break;
				case 'paste':
					_editor.paste();
				break;
				case 'duplicate':
					_editor.dupe();
				break;
				case 'delete':
					_editor.delete();
				break;
				case 'rename':
					_events.invoke('edit-object-row');
				break;
				case 'focus':
					_editor.focusOnSelected();
				break;
				case 'edit':
					_editor.focus = _editor.selectedObjects[0];
				break;
				case 'movetoview':
					_editor.moveSelectionToView()
				break;
				case 'aligntoview':
					_editor.alignSelectionToView()
				break;
				case 'droptoground':
					_editor.dropSelectionToGround()
				break;
				case 'symbolise':
					_editor.symboliseSelectedObject()
				break;
				case 'desymbolise':
					_editor.desymboliseSelectedObject()
				break;
				case 'group':
					_editor.groupSelectedObjects()
				break;
				case 'ungroup':
					_editor.ungroupSelectedObjects()
				break;
				case 'code':
					_editor.editCode()
				break;
				case 'exportd3d':
					_editor.exportD3DSelectedObjects();
				break;
				case 'exportd3dproj':
					_editor.exportD3DSelectedObjects({d3dproj: true});
				break;
				case 'exportpng':
					_editor.modifySelected('export-png');
				break;
			}
		}
		
		sceneList.addEventListener('contextmenu', onRightClick);
		
		_editor.invokeObjectRightClick = onRightClick;
		
		return () => {
			sceneList.removeEventListener('contextmenu', onRightClick);
		}
	}, [sceneListRef, _editor.selectedObjects]);
	
	const update = () => {
		setDummyObject({...dummyObject});
		setDummyProject({...dummyProject});
		_editor.setDirty(true);
		
		objects.forEach(o => o.checkSymbols());
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
		const allGraphic2D = objects.filter(o => o.hasComponent('Graphic2D')).length === objects.length;
		
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
												object.__inspApplyPos = () => {
													object.setPosition(
														new THREE.Vector3(
															vector.x == '-' ? object.position.x : vector.x, 
															vector.y == '-' ? object.position.y : vector.y, 
															vector.z == '-' ? object.position.z : vector.z
														)
													);
													update();
												}
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
												object.__inspApplyRot = () => {
													object.setRotation(
														new THREE.Euler(
															vector.x == '-' ? object.rotation.x : THREE.MathUtils.degToRad(vector.x), 
															vector.y == '-' ? object.rotation.y : THREE.MathUtils.degToRad(vector.y), 
															vector.z == '-' ? object.rotation.z : THREE.MathUtils.degToRad(vector.z)
														)
													);
													update();
												}
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
												object.__inspApplyScl = () => {
													object.setScale(
														new THREE.Vector3(
															vector.x == '-' ? object.scale.x : vector.x, 
															vector.y == '-' ? object.scale.y : vector.y, 
															vector.z == '-' ? object.scale.z : vector.z
														)
													);
													update();
												}
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
								
								{
									allGraphic2D && (
										<div className="field vector-field">
											<VectorInput 
												label="Size"
												type="Vector2"
												values={objects.map( 
													o => {
														const g2d = o.getComponent('Graphic2D');
														return new THREE.Vector2(g2d.width, g2d.height);
													}
												)}
												onSave={vector => {
													objects.forEach(o => {
														const g2d = o.getComponent('Graphic2D');
														o.__inspApplySize = () => {
															o.__oldSize = {width: g2d.width, height: g2d.height};
															g2d.width = vector.x;
															g2d.height = vector.y;
															update();
														}
														o.__inspApplySize();
													});
													
													_editor.addStep({
														name: 'Update size',
														undo: () => {
															objects.forEach(o => {
																const g2d = o.getComponent('Graphic2D');
																g2d.width = o.__oldSize.width;
																g2d.height = o.__oldSize.height;
															});
														},
														redo: () => {
															objects.forEach(o => o.__inspApplySize());
														}
													});
												}}
											/>
										</div>
									)
								}
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
				
				<div className="components-editor">
					{drawComponentsEditor()}
				</div>
			</InspectorCell>
		)
	}
	const drawComponentsEditor = () => {
		const rows = [];
		const sharedComponents = [];
		
		const canSee = (component) => !component.properties.__editorOnly;
		
		objects.forEach(object => {
			object.components.forEach(component => {
				const schema = D3DComponents[component.type];
				
				if(!canSee(component))
					return;
				
				if(!schema)
					return;
				
				const shared = sharedComponents.find(sc => sc.type == component.type);
				
				if(!shared)
					sharedComponents.push({schema, type: component.type, allEnabled: component.enabled});
				else {
					if(!component.enabled)
						shared.allEnabled = false;
				}
			})
		});
		
		sharedComponents.forEach( ({schema, type, allEnabled}) => {
			const fields = [];
			const sections = {};
			
			if(schema.hidden)
				return;
			
			const setComponentEnabled = (enable, addStep = true) => {
				objects.forEach(object => {
					const component = object.getComponentObject(type);
					if(!component || !canSee(component))
						return;
					
					component.enabled = enable;
				});
				
				addStep && _editor.addStep({
					name: 'Toggle component',
					undo: () => setComponentEnabled(!enable, false),
					redo: () => setComponentEnabled(enable, false)
				});
			}
			const deleteComponent = () => {
				const doDelete = () => {
					const serializedComponents = {};
					
					objects.forEach(object => {
						const component = object.getComponentObject(type);
						if(!component || !canSee(component))
							return;
						
						serializedComponents[object.uuid] = object.getSerializedComponent(component);
					});
					
					const deleteComponentFromObjects = () => {
						objects.forEach(object => {
							if(!object.hasComponent(type))
								return;
							
							object.removeComponent(type);
						});
						
						update();
						_events.invoke('refresh-component', type);
					}
					
					_editor.addStep({
						name: 'Delete component',
						undo: () => {
							objects.forEach(object => {
								if(object.hasComponent(type))
									return;
								
								const serializedComponent = serializedComponents[object.uuid];
								if(!serializedComponent)
									return;
								
								object.addComponent(
									serializedComponent.type,
									serializedComponent.properties
								);
							});
							
							update();
						},
						redo: () => deleteComponentFromObjects()
					})
					
					deleteComponentFromObjects();
					
				}
				
				_editor.showConfirm({
					title: 'Delete Component',
					message: `Are you sure you want to delete ${type} from ${objects.length} object(s)?`,
					onConfirm: doDelete
				}) 
			}
			const getCurrentValueOf = (fieldId) => {
				let current;
				let mixed = false;
				for(const object of objects) {
					const dummyComponent = object.getComponentObject(type, { dummy: true });
					if(!dummyComponent || !canSee(dummyComponent))
						continue;
					
					const val = dummyComponent.properties[fieldId];
					
					if(current === undefined) {
						current = val;
						continue;
					}
					if(JSON.stringify(val) != JSON.stringify(current)) {
						mixed = true;
						break;
					}
				}
				return {current, mixed};
			}
			const commitValueOf = ({val, fieldId, oldValueOverride = undefined, addStep = true}) => {
				const serializedComponents = {};
				
				objects.forEach(object => {
					const component = object.getComponentObject(type);
					if(!component || !canSee(component))
						return;
					
					serializedComponents[object.uuid] = object.getSerializedComponent(component);
				});
				
				const applyValue = () => {
					objects.forEach(object => {
						const component = object.getComponentObject(type);
						const dummyComponent = object.getComponentObject(type, {dummy: true});
						
						if(!component || !canSee(component))
							return;
						
						object.setComponentValue(
							type,
							fieldId,
							val
						);
						
						dummyComponent.properties[fieldId] = val;
					});
					
					update();
				}
				
				applyValue();
				
				addStep && _editor.addStep({
					name: 'Update property',
					undo: () => {
						objects.forEach(object => {
							const component = object.getComponentObject(type);
							const dummyComponent = object.getComponentObject(type, {dummy: true});
							
							if(!component || !canSee(component))
								return;
							
							const serializedComponent = serializedComponents[object.uuid];
							if(!serializedComponent)
								return;
							
							const oldValue = oldValueOverride ?? serializedComponent.properties[fieldId];
							
							object.setComponentValue(
								type,
								fieldId,
								oldValue
							);
							
							dummyComponent.properties[fieldId] = oldValue;
						});
						
						update();
						_events.invoke('refresh-component', type);
					},
					redo: () => applyValue()
				})
			}
			
			for(let fieldId in schema.fields) {
				const field = schema.fields[fieldId];
				const { current, mixed } = getCurrentValueOf(fieldId);
				
				let desc = field.description;
				let sideBySide = true;
				let fieldContent;
				
				if(field.hidden)
					continue;
				
				if(typeof field.condition == 'function') {
					let canShow = true;
					
					for(const object of objects) {
						const component = object.getComponentObject(type);
						if(!component)
							continue;
						
						if(field.condition(component) === false) {
							canShow = false;
							break;
						}
					}
					
					if(!canShow)
						continue;
				}
				
				const commitValueLight = (val, oldValueOverride) => {
					if((val === DASH || JSON.stringify(val) === '{"x":"-","y":"-","z":"-"}' || JSON.stringify(val) === '{"x":"-","y":"-"}') && mixed)
						return; // Ignore ambiguous dash
					
					commitValueOf({val, fieldId, oldValueOverride, addStep: false});
				}
				const commitValue = (val, oldValueOverride) => {
					if((val === DASH || JSON.stringify(val) === '{"x":"-","y":"-","z":"-"}' || JSON.stringify(val) === '{"x":"-","y":"-"}') && mixed)
						return; // Ignore ambiguous dash
					
					commitValueOf({val, fieldId, oldValueOverride});
				}
				const offerValue = (val) => {
					objects.forEach(object => {
						const dummyComponent = object.getComponentObject(type, { dummy: true });
						if(!dummyComponent || !canSee(dummyComponent))
							return;
						
						dummyComponent.properties[fieldId] = val;
					});
					update();
				}
				
				const drawAmbiguous = () => (
					<div className='small gray mb'>
						<i>Multiple values</i>
					</div>
				)
				
				switch(field.type) {
					case 'vector3': {
						fieldContent = (
							<VectorInput 
								values={[ (!mixed ? current : {x: '-', y: '-', z: '-'}) ]} 
								onSave={vector => commitValue(vector)}
							/>
						);
						break;
					}
					case 'string': {
						fieldContent = (
							<input 
								className="tf" 
								type="text" 
								value={ (!mixed ? (current ?? '') : DASH) } 
								onKeyDown={autoBlur}
								readOnly={field.readOnly}
								onChange={e => offerValue(e.target.value)}
								onBlur={e => commitValue(e.target.value)}
							/>
						)
						break;
					}
					case 'longstring': {
						fieldContent = (
							<textarea
								className="tf"
								value={ (!mixed ? (current ?? '') : DASH) }
								readOnly={field.readOnly}
								rows={field.rows ?? 3}
								onChange={e => commitValueLight(e.target.value)}
								onBlur={e => commitValue(e.target.value)}
								style={{
									resize: field.resize ?? 'vertical',
									width: '100%',
									minHeight: '60px',
									fontFamily: 'inherit',
									fontSize: 'inherit'
								}}
							/>
						);
						break;
					}
					case 'number': {
						fieldContent = (
							<input 
								className="tf tf--num" 
								type="number" 
								value={ (!mixed ? Number(current) : '') } 
								onKeyDown={autoBlur}
								min={field.min}
								max={field.max}
								step={field.step || 1}
								readOnly={field.readOnly}
								onChange={e => offerValue( Number(e.target.value) || 0 )}
								onBlur={e => {
									let val = Number(e.target.value) || 0;
									
									if(field.min !== undefined && val < field.min)
										val = field.min;
									
									if(field.max !== undefined && val > field.max)
										val = field.max;
									
									commitValue(val);
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
									value={ (!mixed ? Number(current) : 0) } 
									onKeyDown={autoBlur}
									min={field.min}
									max={field.max}
									step={field.step || 1}
									readOnly={field.readOnly}
									onChange={e => {
										let val = Number(e.target.value) || 0;
										
										if(field.min !== undefined && val < field.min)
											val = field.min;
										
										if(field.max !== undefined && val > field.max)
											val = field.max;
											
										commitValue(val);
									}}
								/>
								<div className='slider-value'>
									{ (!mixed ? Number(current) : DASH) }
								</div>
							</div>
						)
						break;
					}
					case 'islider': {
						fieldContent = (
							<div className='flex'>
								<input 
									type="range" 
									value={ (!mixed ? Number(current) : 0) } 
									onKeyDown={autoBlur}
									min={field.min}
									max={field.max}
									step={field.step || 1}
									readOnly={field.readOnly}
									onChange={e => {
										let val = Number(e.target.value) || 0;
										
										if(field.min !== undefined && val < field.min)
											val = field.min;
										
										if(field.max !== undefined && val > field.max)
											val = field.max;
											
										commitValue(val);
									}}
								/>
								<div className='slider-value' style={{width: 'auto'}}>
									<input 
										className="tf tf--numm" 
										type="number" 
										value={ (!mixed ? Number(current) : '') } 
										onKeyDown={autoBlur}
										min={field.min}
										max={field.max}
										step={field.step || 1}
										readOnly={field.readOnly}
										onChange={e => offerValue( Number(e.target.value) || 0 )}
										onBlur={e => {
											let val = Number(e.target.value) || 0;
											
											if(field.min !== undefined && val < field.min)
												val = field.min;
											
											if(field.max !== undefined && val > field.max)
												val = field.max;
											
											commitValue(val);
										}}
									/>
								</div>
							</div>
						)
						break;
					}
					case 'boolean': {
						fieldContent = (
							<input 
								type="checkbox" 
								checked={!!current && !mixed} 
								readOnly={field.readOnly}
								onChange={e => commitValue(!!e.target.checked)}
							/>
						)
						break;
					}
					case 'color': {
						fieldContent = (
							<input 
								type="color" 
								value={ (!mixed ? String(current).replace('0x', '#') : '#000000') }
								onKeyDown={autoBlur}
								readOnly={field.readOnly}
								onClick={e => {
									const val = (e.target.value || '#ffffff').replace('#', '0x');
									
									e.target.oldValue = val;
								}}
								onChange={e => {
									const val = (e.target.value || '#ffffff').replace('#', '0x');
									
									offerValue(val);
								}}
								onBlur={e => {
									const val = (e.target.value || '#ffffff').replace('#', '0x');
									
									commitValue(val, e.target.oldValue);
								}}
							/>
						);
						break;
					}
					case 'colora': {
						fieldContent = (
							<ColorPicker
								value={ (!mixed ? String(current).replace('0x', '#') : '#000000') }
								displayMode='small'
								onKeyDown={autoBlur}
								readOnly={field.readOnly}
								onClick={(e, val) => {
									sharedInspector.oldValue = val;
								}}
								onChange={val => offerValue(val)}
								onBlur={val => {
									commitValue(val, sharedInspector.oldValue);
									sharedInspector.oldValue = val;
								}}
							/>
						);
						break;
					}
					case 'colorbest': {
						fieldContent = (
							<ColorPickerBest
								value={hex8ToRgba(current)}
								onClick={(e, val) => {
									sharedInspector.oldValue = val;
								}}
								onChange={val => offerValue(val)}
								onBlur={val => {
									commitValue(val, sharedInspector.oldValue);
									sharedInspector.oldValue = val;
								}}
							/>
						);
						break;
					}
					case 'file':
					case 'file[]': {
						sideBySide = false;
						
						let list = field.type == 'file[]'
						? (Array.isArray(current) ? current : (current ? [current] : []))
						: (current ? [current] : []);
						
						// Allow one empty row always for file
						if(field.type == 'file' && list.length < 1)
							list = [null];
						
						const browseAndAppend = () => openAssetExplorer({
							format: field.format,
							selectedAsset: '',
							onSelect: (assetPath) => {
								const uuid = _root.resolveAssetId(assetPath);
								const val = [...list, uuid];
								
								commitValue(val);
							}
						});
						
						const drawExtra = () => {
							if(field.label == 'Materials') {
								const uuids = [];
								let match = true;
								
								for(const object of objects) {
									const component = object.getComponentObject(type);
									if(!component || !canSee(component))
										return;
									
									const ids = component.properties.materials;
									if(!ids)
										return;
									
									for(let i in ids) {
										const id = ids[i];
										if(uuids[i] != id) {
											match = false;
											break;
										}
										if(!uuids.includes(id))
											uuids.push(id);
									}
									
									if(!match)
										break;
								}
								
								// Too ambiguous. Don't draw.
								if(!match) 
									return;
								
								return drawMaterials(
									uuids.map(uuid => _root.resolvePathNoAssets(uuid))
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
						
						if(mixed) {
							fieldContent = drawAmbiguous();
							break;
						}
					
						fieldContent = (
							<div className="file-array-field mt">
								<div className="file-array-list">
									{list.map((uuid, idx) => {
										const filePath = uuid ? _root.resolvePathNoAssets(uuid) : '';
										const fname = uuid ? fileNameNoExt(filePath) : '';
										const ext = uuid ? getExtension(filePath) : '';
										
										const browse = () => {
											openAssetExplorer({
												format: field.format,
												selectedAsset: filePath,
												onSelect: (assetPath) => {
													const uuid = _root.resolveAssetId(assetPath);
													let val;
													
													if(field.type == 'file[]') {
														val = [...list];
														val[idx] = uuid;
													}else{
														val = uuid;
													}
													
													commitValue(val);
												}
											})
										};
										
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
															const val = list.filter((_, i) => i !== idx);
															
															commitValue(val);
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
					case 'select': {
						const selRows = [];
						const options = [...field.options];
						
						if(mixed)
							options.unshift({ name: DASH, label: DASH })
						
						const currentOption = options.find(
							o => o.name == (!mixed ? current : DASH)
						);
						
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
							<select
								className='tf'
								value={ (!mixed ? current : DASH) }
								onChange={e => commitValue(e.target.value)}
								readOnly={field.readOnly}
							>
								{selRows}
							</select>
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
						const getVal = fid => {
							const { current, mixed } = getCurrentValueOf(fid);
							if(mixed) return DASH;
							return current;
						};
						const setVal = (fid, val) => commitValueOf({fieldId: fid, val});
						
						fieldContent = (
							<>
								<div className='text-style-row'>
									<div className='text-style-editor'>
										{
											drawButton(
												(<b>B</b>),
												() => getVal('fontWeight') == 'bold',
												() => {
													const val = getVal('fontWeight');
													
													setVal('fontWeight', val == 'bold' ? 'normal' : 'bold');
												}
											)
										}
										{
											drawButton(
												(<i>i</i>),
												() => getVal('fontStyle') == 'italic',
												() => {
													const val = getVal('fontStyle');
													
													setVal('fontStyle', val == 'italic' ? 'normal' : 'italic');
												}
											)
										}
										<div style={{width: 15}}></div>
										{
											drawButton(
												(<MdFormatAlignLeft />),
												() => getVal('align') == 'left',
												() => setVal('align', 'left')
											)
										}
										{
											drawButton(
												(<MdFormatAlignCenter />),
												() => getVal('align') == 'center',
												() => setVal('align', 'center')
											)
										}
										{
											drawButton(
												(<MdFormatAlignRight />),
												() => getVal('align') == 'right',
												() => setVal('align', 'right')
											)
										}
									</div>
								</div>
								<div className='text-style-row'>
									<div className='text-style-editor'>
										{
											drawButton(
												(<AiOutlineVerticalAlignTop />),
												() => getVal('valign') == 'top',
												() => setVal('valign', 'top')
											)
										}
										{
											drawButton(
												(<AiOutlineVerticalAlignMiddle />),
												() => getVal('valign') == 'middle',
												() => setVal('valign', 'middle')
											)
										}
										{
											drawButton(
												(<AiOutlineVerticalAlignBottom />),
												() => getVal('valign') == 'bottom',
												() => setVal('valign', 'bottom')
											)
										}
									</div>
								</div>
							</>
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
						<div className={`field field-${fieldId}`} key={rowContainer.length}>
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
				
				for(let sectionName in sections) {
					const rws = sections[sectionName];
					
					const drawSectionName = () => (
						<div className='insp-title' style={{cursor: 'auto'}}>
							{sectionName}
						</div>
					)
					
					rows.push(
						<div 
							key={rows.length+1000} 
							className='component-section shade'
						>
							{schema.displaySectionNames && drawSectionName()}
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
					title={schema.name}
					enabled={allEnabled}
					togglable={true}
					onToggleEnable={enabled => setComponentEnabled(enabled)}
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
			let objects = _editor.focus.children
			.filter(
				c => !c.editorOnly &&
				(
					(_editor.mode == '3D' && c.is3D) || 
					(_editor.mode == '2D' && c.is2D)
				) &&
				(c.name.toLowerCase().includes(sceneFilter.toLowerCase()) || !sceneFilter)
			);
			
			if(_editor.mode == '2D') {
				objects = objects.sort((a, b) => {
					if(a.position.z > b.position.z)
						return -1;
					else
					if(a.position.z < b.position.z)
						return 1;
					else
						return 0;
				});
			}
			
			if(objects.length < 1) {
				if(!sceneFilter) {
					return <div className='no-label'>No {_editor.mode} objects in scene</div>
				}else {
					return <div className='no-label'>No objects match your search</div>
				}
			}
			
			objects.forEach(object => {
				const selected = _editor.selectedObjects.includes(object);
				const styleObj = {};
				
				if(!object.enabled) {
					styleObj.color = '#555';
				}
				
				rows.push(
					<ObjectRow
						key={rows.length}
						icon={drawIconForObject(object)}
						name={object.name}
						selected={selected}
						isInstance={true}
						style={styleObj}
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
						onRightClick={(e) => {
							if(!selected) {
								_editor.setSelection([object]);
								setTimeout(() => _editor.invokeObjectRightClick?.(e), 100);
							}
						}}
					>
						<div className='option-buttons'>
							{
								<div 
									className={['option-button', (!!object.__script ? 'code-present' : 'code-not-present')].join(' ')}
									title='Code'
									onClick={(e) => {
										e.stopPropagation();
										_editor.openCode(object);
									}}
								>
									<MdCode />
								</div>
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
									
									if(_editor.selectedObjects.includes(object))
										_editor.removeSelection([object]);
									
									update();
								}}
							>
								{
									!!object.__editorState.hidden ? 
										<IoMdEyeOff /> : <IoMdEye style={{opacity: 0.5}} />
								}
							</div>
							<div 
								className='option-button option-button--hidden'
								title='Enabled'
								onClick={(e) => {
									e.stopPropagation();
									object.enabled = !object.enabled;
									update();
								}}
							>
								{
									!!object.enabled ? 
										<MdCheckBox /> : 
										<MdCheckBoxOutlineBlank style={{opacity: 0.5}} />
								}
							</div>
						</div>
					</ObjectRow>
				)
			})
			
			return rows;
		}
		const drawBackgroundSettings = () => {
			const drawBgInput = () => {
				const bgTexturePath = _root.resolvePathNoAssets(bgTextureAsset);
				
				const openBrowseTexture = () => openAssetExplorer({
					format: 'img',
					selectedAsset: bgTexturePath,
					onSelect: (assetPath) => {
						const assetId = _root.resolveAssetId(assetPath);
						setBgTextureAsset(assetId);
						_root.scene.background.textureAsset = assetId;
						_root.applyScene(_root.scene);
					}
				});
				
				return (
					<>
						<input
							className="tf"
							type="text"
							readOnly
							value={bgTexturePath}
							placeholder="No texture selected"
							onClick={openBrowseTexture}
						/>
						<button
							onClick={openBrowseTexture}
						>
							Browse…
						</button>
						
						{bgTexturePath && (
							<div className='small gray'>
								Use a 2:1 panorama for best results
							</div>
						)}
					</>
				)
			}
		
			// UI
			return (
				<div className="scene-insp-background-settings">
					<div className='ib vt'>
						{/* Type */}
						<div className="field">
							<label>Background</label>
							<select
								className="tf"
								value={bgType}
								style={{minWidth: 150}}
								onChange={e => {
									const t = e.target.value;
									setBgType(t);
									_root.scene.background.type = t;
									_root.applyScene(_root.scene);
								}}
							>
								<option value="none">None</option>
								<option value="color">Color</option>
								<option value="texture">Texture</option>
							</select>
						</div>
					</div>
					<div className='ib vt ml2'>
						{/* Color settings */}
						{bgType === 'color' && (
							<div className="field">
								<label>Color</label>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									<input
										type="color"
										value={bgColor}
										onChange={(e) => {
											const val = e.target.value || '#000000';
											setBgColor(val);
											
											_root.scene.background.color = val;
											_root.applyScene(_root.scene);
										}}
									/>
								</div>
							</div>
						)}
					</div>
					
					
					<div className='mt2'>
						{/* Texture settings */}
						{bgType === 'texture' && (
							<div className="field">
								<label>Texture</label>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
									{drawBgInput()}
								</div>
							</div>
						)}
					</div>
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
				{/*sceneInspectorExpanded && (
					<div className="tools-section assets-insp-tools">
						<button
							className="btn-small btn-destructive"
							onClick={deleteSelectedObjects}
							disabled={!canDelete}
						>
							<MdDeleteForever />
						</button>
					</div>
				)*/}
				{sceneInspectorExpanded && (
					<div className="tools-section assets-insp-tools">
						<input 
							className="tf" 
							type="search" 
							style={{width: '100%'}}
							placeholder="Search"
							value={sceneFilter}
							onChange={e => setSceneFilter(e.target.value)}
						/>
					</div>
				)}
				<div className="path-container">
					{drawPath()}
				</div>
				<div 
					ref={sceneListRef}
					className="scene-objects-list shade"
				>
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
	
		const updateIndex = (oldRel, newRel) => {
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
				const dir = normPath(p);
				const dirWithSlash = dir.endsWith('/') ? dir : dir + '/';
				const toRemove = [];
		
				zip.forEach((rel) => {
					const n = normPath(rel);
					// match either exact file, or children under folder
					if (n === dir || n.startsWith(dirWithSlash)) {
						toRemove.push(rel);
					}
				});
		
				toRemove.forEach(rel => {
					zip.remove(rel);
					_editor.onAssetDeleted?.(rel);
				});
		
				if (zip.files[dir]) {
					zip.remove(dir);
				}
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
		_editor.onNewFolderInspector = onNewFolder;
		// ------------------------------
		// Node renderers
		// ------------------------------
		const renderNode = (node, depth = 0, siblings = []) => {
			const selected = isSelected(node.path);
			const ext = getExtension(node.name);
			const displayName = fileNameNoExt(node.name) || '';
			
			if(!node.name.toLowerCase().includes(assetFilter.toLowerCase()))
				return;
				
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
						onRightClick={(e) => {
							if(!selected) {
								setSingleSelection(node.path);
								setTimeout(() => _editor.invokeAssetRightClick?.(e), 100);
							}
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
							onRightClick={(e) => {
								if(!selected) {
									setSingleSelection(node.path);
									setTimeout(() => _editor.invokeAssetRightClick?.(e), 100);
								}
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
						<input 
							className="tf" 
							type="search" 
							style={{width: '100%'}}
							placeholder="Search"
							value={assetFilter}
							onChange={e => setAssetFilter(e.target.value)}
						/>
						<div style={{height: 4}}></div>
					</div>
				)}
	
				<div
					ref={assetsListRef}
					className="scene-objects-list shade"
				>
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
	
	const loaded = !!_root?.zip;
	
	return (
		<div className='insp-view'>
			{loaded && (
				<div className='tabs-container'>
					<div className='tabs no-scrollbar'>
						{drawTabButtons()}
					</div>
				</div>
			)}
			
			<div className={`insp-itself insp-view-${tab}`}>
				{!loaded && (<div className="no-label mt">Waiting for project to load</div>)}
				{(tab == 'assets' || tab == 'all') && loaded && drawAssetInspector()}
				{(tab == 'scene' || tab == 'all') && loaded && drawSceneInspector()}
				{(tab == 'object' || tab == 'all') && loaded && objects.length > 0 && drawObjectInspector()}
				{selectedAssetPaths.size == 1 && loaded &&  drawMediaInspector()}
				{(tab == 'project' || tab == 'all') && loaded && _editor.project && _editor.focus == _root && drawProjectInspector()}
				
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