const { 
	app, 
	BrowserWindow, 
	Menu, 
	dialog, 
	ipcMain, 
	nativeTheme, 
	screen,
	shell
} = require('electron');
const path = require('path');
const fs = require('fs');
const pkg = require('../package.json');
const isDev = !app.isPackaged;

let editorDirty = false;
let startWindow;
let newProjectWindow;
let editorWindow;
let gameWindow;

let lastOpenedProjectUri;
let playerURI;
let projectOpen = false;
let inputFieldActive = false;
let codeEditorActive = false;

function getEditorBusy() {
	return inputFieldActive;
}

function createStartWindow() {
	startWindow = new BrowserWindow({
		title: 'Damen3D Editor',
		width: 400,
		height: 250,
		resizable: false,
		titleBarStyle: 'hidden',
		webPreferences: {
			preload: path.join(__dirname, 'preload-editor.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false
		}
	});

	startWindow.loadFile('../src/windows/editor/editorstart.html');

	startWindow.on('closed', () => {
		startWindow = null;
	});
	startWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
		console.error('❌ Preload failed:', preloadPath, error);
	});
	
	setupTheme(startWindow);

	// Send initial theme
	startWindow.webContents.on('did-finish-load', () => {
		startWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
	});
}
function createNewProjectWindow() {
	newProjectWindow = new BrowserWindow({
		title: 'New Project',
		width: 380,
		height: 350,
		resizable: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload-editor.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false,
			spellcheck: false
		}
	});

	newProjectWindow.loadFile('../src/windows/editor/editornew.html');

	newProjectWindow.on('closed', () => {
		newProjectWindow = null;
	});
	
	setupTheme(newProjectWindow);
	Menu.setApplicationMenu(appMenuBase);

	// Send initial theme
	newProjectWindow.webContents.on('did-finish-load', () => {
		newProjectWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
	});
}
async function createGameWindow() {
	await closeGameWindow();
	
	// In-editor game window
	gameWindow = new BrowserWindow({
		useContentSize: true,
		width: 800,
		height: 600,
		webPreferences: {
			preload: path.join(__dirname, 'preload-player.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false,
			spellcheck: false
		}
	});
	
	await gameWindow.loadFile('../dist/player/index.html');
	
	gameWindow.on('closed', () => { gameWindow = null; });
}

async function createEditorWindow() {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	await closeEditorWindow();

	// Use safer prefs for the React/Vite editor window
	editorWindow = new BrowserWindow({
		title: 'Damen3D Editor',
		width,
		height,
		minWidth: 1200,
		minHeight: 600,
		resizable: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload-editor.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false,
			spellcheck: false
		}
	});
	
	editorWindow.on('close', async (e) => {
		if (!editorDirty) 
			return;
		
		e.preventDefault();
		
		const { response } = await dialog.showMessageBox(editorWindow, {
			type: 'question',
			buttons: ['Save', "Don’t Save", 'Cancel'],
			defaultId: 0,
			cancelId: 2,
			message: 'Do you want to save your changes before closing this project?',
		});
	
		if(response === 0) {
			editorWindow.webContents.send('request-save-and-close');
		}else
		if (response === 1) {
			editorDirty = false;
			editorWindow.destroy();
		}
	});
	
	editorWindow.on('closed', () => {
		Menu.setApplicationMenu(appMenuBase);
	});
	
	editorWindow.webContents.on('before-input-event', (event, input) => {
		const wc = editorWindow.webContents;
		
		if (!inputFieldActive) 
			return;
	
		const mod = (input.meta || input.control) && !input.alt;
		
		if (!mod) 
			return;
			
		switch (input.key.toLowerCase()) {
			case 'c': wc.copy();      event.preventDefault(); return;
			case 'v': wc.paste();     event.preventDefault(); return;
			case 'x': wc.cut();       event.preventDefault(); return;
			case 'a': wc.selectAll(); event.preventDefault(); return;
			case 'z':
				if (input.shift) wc.redo(); else wc.undo();
				return;
		}
	});
	
	if(isDev)
		await editorWindow.loadURL('http://localhost:5173');
	else
		await editorWindow.loadFile('../dist/editor/index.html');

	setupTheme(editorWindow);
	
	Menu.setApplicationMenu(appMenu);
	
	return new Promise(resolve => {
		editorWindow.webContents.once('did-finish-load', resolve);
	});
}
function setupTheme(browserWindow) {
	// Send initial theme once page loads
	browserWindow.webContents.on('did-finish-load', () => {
		if (browserWindow && !browserWindow.isDestroyed()) {
			browserWindow.webContents.send(
				'theme-changed',
				nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
			);
		}
	});
}
function closeEditorWindow() {
	Menu.setApplicationMenu(appMenuBase);
	
	return new Promise(resolve => {
		if (!editorWindow) return resolve();
		
		// If already destroyed, just cleanup and resolve
		if (editorWindow.isDestroyed()) {
			editorWindow = null;
			return resolve();
		}
		
		editorWindow.once('closed', () => {
			editorWindow = null;
			resolve();
		});
		editorWindow.close();
	});
}
function closeGameWindow() {
	return new Promise(resolve => {
		if (!gameWindow) return resolve();
		
		// If already destroyed, just cleanup and resolve
		if (gameWindow.isDestroyed()) {
			gameWindow = null;
			return resolve();
		}
		
		gameWindow.once('closed', () => {
			gameWindow = null;
			resolve();
		});
		gameWindow.close();
	});
}
function closeNewProjectWindow() {
	return new Promise(resolve => {
		if (!newProjectWindow) return resolve();
		
		// If already destroyed, just cleanup and resolve
		if (newProjectWindow.isDestroyed()) {
			newProjectWindow = null;
			return resolve();
		}
		
		newProjectWindow.once('closed', () => {
			newProjectWindow = null;
			resolve();
		});
		newProjectWindow.close();
	});
}
async function openBrowse() {
	const { canceled, filePaths } = await dialog.showOpenDialog({
		title: 'Select a D3D project file',
		filters: [{ name: 'Damen3D Project Files', extensions: ['d3dproj'] }],
		properties: ['openFile']
	});
	if (canceled || filePaths.length === 0) return null;
	openProject(filePaths[0]);
}
async function openProject(uri) {
	console.log('Open project', uri);
	lastOpenedProjectUri = uri;
	projectOpen = true;
	
	await createEditorWindow();
	
	updateEditorMenusEnabled();
}
function startNewProject() {
	Menu.setApplicationMenu(appMenuBase);
	
	if(!newProjectWindow) createNewProjectWindow()
	else newProjectWindow.show()
}
function sendSelectAll() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('select-all');
}
function sendDelete() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('delete');
}
function sendUndo() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('undo');
}
function sendRedo() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('redo');
}
function sendDupe() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('dupe');
}
function sendAddObject(type) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('add-object', type);
}
function sendSymboliseObject() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('symbolise-object');
}
function sendDesymboliseObject() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('desymbolise-object');
}
function sendFocusObject() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('focus-object');
}
function sendSaveProject() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('save-project', lastOpenedProjectUri);
}
function sendSaveProjectAs() {
	if (!editorWindow?.isFocused()) return;
	dialog.showSaveDialog(editorWindow, {
		title: 'Save Project As',
		defaultPath: lastOpenedProjectUri,
		buttonLabel: 'Save',
		filters: [
			{ name: 'Damen3D Project', extensions: ['d3dproj'] }
		],
		properties: ['showOverwriteConfirmation']
	}).then(result => {
		if (!result.canceled && result.filePath) {
			editorWindow.webContents.send('save-project', result.filePath);
		}
	}).catch(err => {
		console.error('Save As dialog failed:', err);
	});
}
function sendSetTool(type) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('set-tool', type);
}
function sendSetTransformTool(type) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('set-transform-tool', type);
}
function sendNewFile(extension) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('new-asset', extension);
}
function sendEditCode() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('edit-code');
}
function sendImportAssets(paths) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('menu-import-assets', paths);
}
function sendAddComponent(type) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('add-component', type);
}
function sendCopySpecial(type) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('copy-special', type);
}
function sendPasteSpecial(type) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('paste-special', type);
}
function sendGroupObjects() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('group');
}
function sendUngroupObjects() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('ungroup');
}
function sendMergeObjects() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('merge');
}
function sendMoveToView() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('move-sel-view');
}
function sendAlignToView() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('align-sel-view');
}
function sendDropToGround() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('drop-to-ground');
}

function sendBuild({prompt, play}) {
	if (!editorWindow?.isFocused()) return;
	let uri = lastOpenedProjectUri;
	if (uri.endsWith('.d3dproj'))
		uri = uri.slice(0, -'.d3dproj'.length) + '.d3d';
	
	if(uri && !prompt) {
		editorWindow.webContents.send('build', uri, play);
		return;
	}
	
	dialog.showSaveDialog(editorWindow, {
		title: 'Build',
		defaultPath: uri,
		buttonLabel: 'Save',
		filters: [
			{ name: 'Damen3D File', extensions: ['d3d'] }
		],
		properties: ['showOverwriteConfirmation']
	}).then(result => {
		if (!result.canceled && result.filePath) {
			editorWindow.webContents.send('build', result.filePath, play);
		}
	}).catch(err => {
		console.error('Build dialog failed:', err);
	});
}

// --- Menu ---
const isMac = process.platform === 'darwin';

const standardMenu = [
	{
		role: 'appMenu', // macOS only (adds About, Quit)
	},
	{
		role: 'editMenu', // adds Cut/Copy/Paste/Select All automatically
	},
];
const menuTemplate = [
	...(isMac ? [{
		label: app.productName,
		submenu: [
			{ role: 'about', id: 'about' },
			{ type: 'separator' },
			{ role: 'quit', id: 'quit' }
		]
	}] : []),
	{
		label: 'File',
		submenu: [
			{
				id: 'newProject',
				label: 'New Project',
				accelerator: 'CmdOrCtrl+N',
				click: () => startNewProject()
			},
			{
				id: 'openProject',
				label: 'Open Project',
				accelerator: 'CmdOrCtrl+O',
				click: () => openBrowse()
			},
			{ type: 'separator' },
			{
				id: 'save',
				label: 'Save',
				accelerator: 'CmdOrCtrl+S',
				click: () => sendSaveProject()
			},
			{
				id: 'saveas',
				label: 'Save As',
				accelerator: 'CmdOrCtrl+Shift+S',
				click: () => sendSaveProjectAs()
			},
			{ type: 'separator' },
			{
				id: 'build',
				label: 'Build',
				accelerator: 'CmdOrCtrl+B',
				click: () => sendBuild({prompt: false, play: false})
			},
			{
				id: 'buildto',
				label: 'Build As',
				accelerator: 'CmdOrCtrl+Shift+B',
				click: () => sendBuild({prompt: true, play: false})
			},
			{
				id: 'buildplay',
				label: 'Build and Play',
				accelerator: 'CmdOrCtrl+Enter',
				click: () => sendBuild({prompt: false, play: true})
			},
		]
	},
	{
		label: 'Edit',
		submenu: [
			{
				id: 'undo',
				label: 'Undo',
				accelerator: 'CmdOrCtrl+Z',
				click: () => sendUndo()
			},
			{
				id: 'redo',
				label: 'Redo',
				accelerator: 'CmdOrCtrl+Shift+Z',
				click: () => sendRedo()
			},
			{ type: 'separator' },
			{ role: 'cut', id: 'cut' },
			{ role: 'copy', id: 'copy' },
			{ role: 'paste', id: 'paste' },
			{
				label: 'Copy Transform',
				accelerator: 'CmdOrCtrl+Shift+T',
				click: () => sendCopySpecial('all')
			},
			{
				label: 'Paste Transform',
				submenu: [
					{
						label: 'All',
						accelerator: 'CmdOrCtrl+Shift+V',
						click: () => sendPasteSpecial('all')
					},
					{
						label: 'Position',
						click: () => sendPasteSpecial('position')
					},
					{
						label: 'Rotation',
						click: () => sendPasteSpecial('rotation')
					},
					{
						label: 'Scale',
						click: () => sendPasteSpecial('scale')
					}
				]
			},
			{
				id: 'delete',
				label: 'Delete',
				accelerator: process.platform === 'darwin' ? 'Backspace' : 'Delete',
				click: () => sendDelete()
			},
			{
				id: 'duplicate',
				label: 'Duplicate',
				accelerator: 'CmdOrCtrl+D',
				click: () => sendDupe()
			},
			{ type: 'separator' },
			{
				id: 'selectAll',
				label: 'Select All',
				accelerator: 'CmdOrCtrl+A',
				click: () => sendSelectAll()
			}
		]
	},
	{
		label: 'Object',
		id: 'object',
		submenu: [
			{
				id: 'newObject',
				label: 'New Object',
				submenu: [
					{
						label: 'Empty Object',
						click: () => sendAddObject('empty')
					},
					{ type: 'separator' },
					{
						label: 'Cube',
						click: () => sendAddObject('cube')
					},
					{
						label: 'Capsule',
						click: () => sendAddObject('capsule')
					},
					{
						label: 'Sphere',
						click: () => sendAddObject('sphere')
					},
					{
						label: 'Pyramid',
						click: () => sendAddObject('pyramid')
					},
					{
						label: 'Plane',
						click: () => sendAddObject('plane')
					},
					{ type: 'separator' },
					{
						label: 'Camera',
						click: () => sendAddObject('camera')
					},
					{
						label: 'Directional Light',
						click: () => sendAddObject('dirlight')
					},
					{
						label: 'Point Light',
						click: () => sendAddObject('pntlight')
					},
					{ type: 'separator' },
					{
						label: 'Audio Source',
						click: () => sendAddObject('audiosrc')
					}
				]
			},
			{
				id: 'addcomponent',
				label: 'Add Component',
				submenu: [
					{
						label: 'Animation',
						click: () => sendAddComponent('Animation')
					},
					{
						label: 'Rigidbody',
						click: () => sendAddComponent('Rigidbody')
					},
					{
						label: 'Character Controller',
						click: () => sendAddComponent('CharacterController')
					},
					{
						label: 'Third Person Camera',
						click: () => sendAddComponent('ThirdPersonCamera')
					},
					{
						label: 'Audio Listener',
						click: () => sendAddComponent('AudioListener')
					},
					{
						label: 'Audio Source',
						click: () => sendAddComponent('AudioSource')
					},
					{ type: 'separator' },
					{
						label: 'Layout 2D',
						click: () => sendAddComponent('Layout2D')
					}
				]
			},
			{ type: 'separator' },
			{
				id: 'focusObject',
				label: 'Focus',
				accelerator: 'F',
				click: () => sendFocusObject()
			},
			{
				label: 'Move to View',
				accelerator: 'CmdOrCtrl+Alt+M',
				click: () => sendMoveToView()
			},
			{
				label: 'Align to View',
				accelerator: 'CmdOrCtrl+Alt+A',
				click: () => sendAlignToView()
			},
			{
				label: 'Drop to Ground',
				accelerator: 'CmdOrCtrl+Alt+G',
				click: () => sendDropToGround()
			},
			{ type: 'separator' },
			{
				id: 'symbolise',
				label: 'Symbolise',
				accelerator: 'CmdOrCtrl+Shift+Y',
				click: () => sendSymboliseObject()
			},
			{
				id: 'desymbolise',
				label: 'Desymbolise',
				accelerator: 'CmdOrCtrl+Shift+D',
				click: () => sendDesymboliseObject()
			},
			{ type: 'separator' },
			{
				label: 'Group',
				accelerator: 'CmdOrCtrl+G',
				click: () => sendGroupObjects()
			},
			{
				label: 'Ungroup',
				accelerator: 'CmdOrCtrl+Shift+G',
				click: () => sendUngroupObjects()
			},
			{ type: 'separator' },
			{
				id: 'code',
				label: 'Code',
				accelerator: 'CmdOrCtrl+Shift+C',
				click: () => sendEditCode()
			},
		]
	},
	{
		label: 'Assets',
		id: 'assets',
		submenu: [
			{
				id: 'newAsset',
				label: 'New Asset',
				submenu: [
					{ id: 'newAssetMat', label: 'Material', click: () => sendNewFile('mat') },
					{ id: 'newAssetAnim', label: 'Animation Clip', click: () => sendNewFile('anim') }
				]
			},
			{
				id: 'importAsset',
				label: 'Import Asset…',
				accelerator: 'CmdOrCtrl+I',
				click: async () => {
					const { canceled, filePaths } = await dialog.showOpenDialog(editorWindow, {
						properties: ['openFile', 'multiSelections'],
					});
					if (!canceled && filePaths.length) {
						sendImportAssets(filePaths);
					}
				}
			}
		]
	},
	{
		label: 'Tools',
		id: 'tools',
		submenu: [
			{
				id: 'toolSelect',
				label: 'Select',
				accelerator: 'v',
				click: () => {
					sendSetTool('select');
					sendSetTransformTool('translate');
				}
			},
			{
				id: 'toolPan',
				label: 'Pan',
				accelerator: 'p',
				click: () => sendSetTool('pan')
			},
			{
				label: 'Orbit',
				accelerator: 'o',
				click: () => sendSetTool('orbit')
			},
			{ type: 'separator' },
			{ 
				id: 'toolTranslate', 
				label: 'Translate', 
				click: () => sendSetTransformTool('translate') 
			},
			{ 
				id: 'toolRotate', 
				label: 'Rotate', 
				accelerator: 'r',
				click: () => sendSetTransformTool('rotate') 
			},
			{ 
				id: 'toolScale',
				label: 'Scale', 
				accelerator: 's', 
				click: () => sendSetTransformTool('scale') 
			},
			{
				label: 'Transform (2D)', 
				accelerator: 'q', 
				click: () => sendSetTool('transform') 
			}
		]
	},
	{
		label: 'View',
		submenu: [
			{
				id: 'toggleDevTools',
				label: 'Toggle DevTools',
				accelerator: 'Alt+Cmd+I',
				click: (_, browserWindow) => {
					if (browserWindow) browserWindow.webContents.toggleDevTools();
				}
			}
		]
	},
	{
		label: 'Window',
		role: 'window',
		submenu: [
			{ role: 'minimize', id: 'minimize' },
			{ role: 'zoom', id: 'zoom' },
			...(isMac
				? [
					{ type: 'separator' },
					{ role: 'front', id: 'front' },
					{ type: 'separator' },
					{ role: 'window', id: 'windowRole' }
				]
				: []),
			{
				id: 'closeWindow',
				label: 'Close',
				accelerator: 'CmdOrCtrl+W',
				click: () => editorWindow.close()
			}
		]
	}
];

const appMenu = Menu.buildFromTemplate(menuTemplate);
const appMenuBase = Menu.buildFromTemplate(standardMenu);

Menu.setApplicationMenu(appMenuBase);

function setItemEnabledDeep(item, enabled) {
	if (!item) 
		return;
		
	if (item.type !== 'separator') 
		item.enabled = enabled;
		
	if (item.submenu) {
		for (const child of item.submenu.items) {
			setItemEnabledDeep(child, enabled);
		}
	}
}
function updateEditorMenusEnabled() {
	const toggleForSwitch = (ids, toggle) => {
		ids.forEach(id => {
			const item = appMenu.getMenuItemById(id);
			
			if (!item) 
				return;
				
			setItemEnabledDeep(item, toggle);
		});
	}
	
	toggleForSwitch(
		['save', 'assets', 'objects'],
		projectOpen
	);
	
	if (process.platform === 'darwin') {
		Menu.setApplicationMenu(appMenu);
	}
}

// --- Native theme ---
nativeTheme.on('updated', () => {
	[ startWindow, newProjectWindow, editorWindow ].forEach(win => {
		if (win && !win.isDestroyed()) {
			win.webContents.send(
				'theme-changed',
				nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
			);
		}
	});
});

// --- App events ---
app.whenReady().then(createStartWindow);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
	if (!startWindow) 
		createStartWindow();
});

// --- IPC handlers ---
// Theme
ipcMain.handle('get-theme', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');

// New D3D project
ipcMain.handle('new-project', () => startNewProject());

// Browse D3D Project
ipcMain.handle('open-project', () => openBrowse());

// Get project URI
ipcMain.handle('get-current-project-uri', () => lastOpenedProjectUri);

// Set editor status
ipcMain.on('editor-status', (_, { inputFocussed, codeEditorOpen, activeElement }) => {
	if(typeof inputFocussed === 'boolean')
		inputFieldActive = inputFocussed;
	
	if(typeof codeEditorOpen === 'boolean')
		codeEditorActive = codeEditorOpen;
	
	try {
		editorWindow && editorWindow.webContents && editorWindow.webContents.setIgnoreMenuShortcuts(
			activeElement?.tag == 'TEXTAREA' || 
			(activeElement?.tag == 'INPUT' && activeElement?.type == 'text')
		);
	}catch(e) {
		console.error(e);
	};
		
	updateEditorMenusEnabled();
});

// Close editor
ipcMain.on('close-editor', () => closeEditorWindow());
ipcMain.on('close-new-proj-window', () => closeNewProjectWindow());

// Show error dialog
ipcMain.on('show-error', async (_, { title, message, closeEditorWhenDone }) => {
	const focused = BrowserWindow.getFocusedWindow();
	if (!focused) return;
	await dialog.showMessageBox(focused, {
		type: 'error',
		title: title || 'Error',
		message: message || 'Unknown error',
		buttons: ['OK']
	});
	
	if(closeEditorWhenDone)
		closeEditorWindow();
});

// Show confirm dialog
ipcMain.handle('show-confirm', async (
	event, 
	{ title = 'Confirm', message = 'Are you sure?' }
) => {
	const win =
		BrowserWindow.fromWebContents(event.sender) ||
		BrowserWindow.getFocusedWindow();

	if (!win) return false;

	const { response } = await dialog.showMessageBox(win, {
		type: 'question',
		title,
		message,
		buttons: ['Yes', 'No'],
		defaultId: 0,
		cancelId: 1,
		normalizeAccessKeys: true
	});

	return response === 0; // true if "Yes"
});
ipcMain.handle('resolve-template-path', (_e, rel) => {
	// App path in dev vs packaged
	const base = app.isPackaged
		? path.join(process.resourcesPath, 'app.asar.unpacked') // or 'app.asar' if packed
		: app.getAppPath();
	const cand1 = path.join(base, rel);
	if (fs.existsSync(cand1)) return cand1;

	// Another common packaged location (if you ship assets unpacked alongside)
	const cand2 = path.join(process.resourcesPath, rel);
	if (fs.existsSync(cand2)) return cand2;

	return null;
});
ipcMain.handle('show-save-dialog', async (_e, opts) => {
	return await dialog.showSaveDialog(opts || {});
});

// Get player URI
ipcMain.handle('get-current-game-uri', () => playerURI);

ipcMain.on('update-editor-window', (_, { width, height, title }) => {
	if (editorWindow && !editorWindow.isDestroyed()) {
		if(width && height)
			editorWindow.setSize(width, height);
		
		editorWindow.setTitle(`${title} - Damen3D Editor ${pkg.editorVersion}`);
	}
});
ipcMain.on('set-dirty', (_, isDirty) => {
	editorDirty = isDirty;
	editorWindow.setDocumentEdited(editorDirty);
	
	if(!editorWindow.d3deditortitle)
		editorWindow.d3deditortitle = editorWindow.getTitle();
	
	editorWindow.setTitle(editorWindow.d3deditortitle + (isDirty ? ' *' : ''));
});
ipcMain.on('show-in-finder', (_, uri) => {
	shell.showItemInFolder(uri);
});
ipcMain.on('update-window', (_, { width, height, title }) => {
	if (gameWindow && !gameWindow.isDestroyed()) {
		gameWindow.setContentSize(width, height);
		gameWindow.setTitle(title);
	}
});
ipcMain.on('open-player', (_, uri) => {
	playerURI = uri;
	createGameWindow();
});
ipcMain.on('console-message', (_, {level, message}) => {
	console.log('csm', level, message);
	editorWindow.webContents.send('csm', {level, message});
});
ipcMain.on('echo-save', () => {
	sendSaveProject();
})
ipcMain.on('echo-build', (_, {prompt, play}) => {
	sendBuild({prompt, play});
});
ipcMain.on('ctx-menu', (event, {template, x, y}) => {
	template.forEach(t => {
		t.click = () => editorWindow.webContents.send('ctx-menu-action', t.id);
	});
	
	const menu = Menu.buildFromTemplate(template);
	const bw = BrowserWindow.fromWebContents(event.sender);
	
	menu.popup({ window: bw, x, y });
});
ipcMain.on('open-project-uri', (_, uri) => {
	openProject(uri);
});