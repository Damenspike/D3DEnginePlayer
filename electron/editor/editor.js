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
const pkg = require('../../package.json');
const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';

let editorDirty = false;
let startWindow;
let newProjectWindow;
let editorWindow;
let gameWindow;
let splashWindow;

const toolWindows = {
	bitmapTrace: {
		title: 'Trace Bitmap',
		width: 300,
		height: 260,
		resizable: false,
		html: 'bitmap-trace.html'
	},
	graphicSmooth: {
		title: 'Smooth',
		width: 300,
		height: 160,
		resizable: false,
		html: 'graphic-smooth.html'
	},
	graphicStraighten: {
		title: 'Straighten',
		width: 300,
		height: 160,
		resizable: false,
		html: 'graphic-straighten.html'
	},
	graphicSimplify: {
		title: 'Simplify',
		width: 300,
		height: 160,
		resizable: false,
		html: 'graphic-simplify.html'
	}
}

let lastOpenedProjectUri;
let playerURI;
let projectOpen = false;
let inputFieldActive = false;
let codeEditorActive = false;
let pendingFile;

function getEditorBusy() {
	return inputFieldActive;
}
function resolvePath(...segments) {
	// In prod, app.getAppPath() points inside app.asar
	const base = app.getAppPath();
	return path.join(base, ...segments);
}
function getFileFromArgv(argv) {
	return argv.find(arg => /\.d3dproj$/i.test(arg));
}

async function start() {
	setupAbout();
	if(pendingFile) {
		openProject(pendingFile);
		pendingFile = null;
	}else{
		createStartWindow();
	}
	
	try {
		const res = await fetch(`https://damen3d.com/api/v1/splash.php?origin=editor&v=${pkg.editorVersion}&theme=${nativeTheme.shouldUseDarkColors ? 'dark' : 'light'}`);
		
		if(res.ok) {
			const splashData = await res.json();
			if(splashData?.splash) {
				createSplashScreen(splashData.splash);
			}
		}
	}catch(e) { 
		console.error('Splash error', e); 
	}
}
function setupAbout() {
	app.setAboutPanelOptions({
		applicationName: 'Damen3D Editor',
		applicationVersion: pkg.editorVersion,
		
		copyright:
		`© 2025 Damen3D Engine. Property of Drake Hall. damen3d.com`,
		
		website: 'https://damen3d.com',
		websiteLabel: 'Visit Damen3D Website'
	});
}

async function createSplashScreen({origin, title, width, height, resizable}) {
	splashWindow = new BrowserWindow({
		title, width, height,
		resizable: !!resizable
	});
	
	await splashWindow.loadURL(origin);
	
	splashWindow.on('closed', () => {
		splashWindow = null;
	});
	
	if(!isMac)
		splashWindow.setMenu(null);
	
	setupTheme(splashWindow);
}
async function createStartWindow() {
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
	
	if (isDev) {
		await startWindow.loadURL('http://localhost:5173/editorstart.html');
	} else {
		await startWindow.loadFile(resolvePath('dist', 'editor', 'editorstart.html'));
	}

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
async function createNewProjectWindow() {
	newProjectWindow = new BrowserWindow({
		title: 'New Project',
		width: 380,
		height: isMac ? 430 : 450,
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

	if (isDev) {
		await newProjectWindow.loadURL('http://localhost:5173/editornew.html');
	} else {
		await newProjectWindow.loadFile(resolvePath('dist', 'editor', 'editornew.html'));
	}

	newProjectWindow.on('closed', () => {
		newProjectWindow = null;
	});
	
	setupTheme(newProjectWindow);
	
	if(!isMac)
		newProjectWindow.setMenu(null);
	else
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
	
	if(!isMac)
		gameWindow.setMenu(null);
	
	if (isDev) {
		await gameWindow.loadURL('http://localhost:5173/player.html');
	} else {
		await gameWindow.loadFile(resolvePath('dist', 'editor', 'player.html'));
	}
	
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
			editorWindow.webContents.send('request-save-and-close', lastOpenedProjectUri);
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
	
	if (isDev) {
		await editorWindow.loadURL('http://localhost:5173');
	} else {
		await editorWindow.loadFile(resolvePath('dist', 'editor', 'index.html'));
	}

	setupTheme(editorWindow);
	
	Menu.setApplicationMenu(appMenu);
	
	return new Promise(resolve => {
		editorWindow.webContents.once('did-finish-load', resolve);
	});
}
async function createToolWindow(toolWindow) {
	await closeToolWindow(toolWindow.name);
	
	const browserWindow = new BrowserWindow({
		title: toolWindow.title ?? 'Tool Window',
		width: toolWindow.width ?? 100,
		height: toolWindow.height ?? 100,
		resizable: toolWindow.resizable ?? true,
		webPreferences: {
			preload: path.join(__dirname, 'preload-editor.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false,
			spellcheck: false
		}
	});
	
	if (isDev) {
		await browserWindow.loadURL(`http://localhost:5173/tool-windows/${toolWindow.html}`);
	} else {
		await browserWindow.loadFile(resolvePath('dist', 'editor', 'tool-windows', toolWindow.html));
	}

	browserWindow.on('closed', () => {
		toolWindow._window = null;
	});
	
	setupTheme(browserWindow);
	
	if(!isMac)
		browserWindow.setMenu(null);
	else
		Menu.setApplicationMenu(appMenuBase);
	
	// Send initial theme
	browserWindow.webContents.on('did-finish-load', () => {
		browserWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
	});
	
	toolWindow._window = browserWindow;
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
function openToolWindow(name) {
	const toolWindow = toolWindows[name];
	
	toolWindow.name = name;
	
	if(!toolWindow || !toolWindow.title) { // ensure its a toolWindow
		throw new Error(`Tool window ${name} does not exist`);
	}
	
	createToolWindow(toolWindow);
}
function closeToolWindow(name) {
	const toolWindow = toolWindows[name];
	
	if(!toolWindow || !toolWindow.title) { // ensure its a toolWindow
		throw new Error(`Tool window ${name} does not exist`);
	}
	if(!toolWindow._window || typeof toolWindow._window.close !== 'function') {
		return;
	}
	
	return new Promise(resolve => {
		if (!toolWindow._window) return resolve();
		
		// If already destroyed, just cleanup and resolve
		if (toolWindow._window.isDestroyed()) {
			toolWindow._window = null;
			return resolve();
		}
		
		editorWindow.once('closed', () => {
			toolWindow._window = null;
			resolve();
		});
		toolWindow._window.close();
	});
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
			lastOpenedProjectUri = result.filePath;
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
function sendNewFolder() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('new-folder');
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
function sendExportSelectedAssets() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('menu-export-assets');
}
function sendAddComponent(type, properties) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('add-component', type, properties);
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
function sendZoomStep(step) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('zoom-step', step);
}
function sendResetView() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('reset-view');
}
function sendExportAsD3D() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('export-as-d3d');
}
function sendExportAsD3DProj() {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('export-as-d3dproj');
}
function sendModify(type) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('modify', type);
}
function sendPasteInPlace(type) {
	if (!editorWindow?.isFocused()) return;
	editorWindow.webContents.send('paste-in-place', type);
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
function sendPublish(opts = {}) {
	if (!editorWindow?.isFocused()) return;
	let ext = '';
	let fname = '';
	
	if(opts.html) {
		ext = 'html';
		fname = 'HTML file';
	}else
	if(opts.mac) {
		ext = 'app';
		fname = 'Application Package';
	}else
	if(opts.windows) {
		ext = '';
		fname = 'Player Package';
	}else
	if(opts.linux) {
		ext = '';
		fname = 'Player Package';
	}else
		return;
	
	let uri = lastOpenedProjectUri;
	let d3duri = lastOpenedProjectUri;
	
	if (d3duri.endsWith('.d3dproj'))
		d3duri = d3duri.slice(0, -'.d3dproj'.length) + '.d3d';
	
	if (uri.endsWith('.d3dproj'))
		uri = uri.slice(0, -'.d3dproj'.length) + `${ext != '' ? `.${ext}` : ''}`;
	else 
		return;
	
	dialog.showSaveDialog(editorWindow, {
		title: 'Publish',
		defaultPath: uri,
		buttonLabel: 'Publish',
		filters: [
			{ name: fname, extensions: [ext] }
		],
		properties: ['showOverwriteConfirmation']
	}).then(result => {
		if (!result.canceled && result.filePath) {
			editorWindow.webContents.send('publish', result.filePath, d3duri, opts);
		}
	}).catch(err => {
		console.error('Publish dialog failed:', err);
	});
}

// --- Menu ---
const standardMenu = [
	...(isMac ? [{
		label: app.productName,
		submenu: [
			{ role: 'about', id: 'about' },
			{ type: 'separator' },
			{ role: 'quit', id: 'quit' }
		]
	}] : []),
	{
		role: 'editMenu', // adds Cut/Copy/Paste/Select All automatically
	},
	...(isDev ? [{
		label: 'View',
		submenu: [
			{
				id: 'toggleDevTools',
				label: 'Toggle DevTools',
				accelerator: 'Alt+Cmd+I',
				click: (_, browserWindow) => {
					if (browserWindow)
						browserWindow.webContents.toggleDevTools();
				}
			}
		]
	}] : []),
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
				click: () => BrowserWindow.getFocusedWindow().close()
			}
		]
	}
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
			{ type: 'separator' },
			{
				label: 'Publish',
				submenu: [
					{
						label: 'HTML Page',
						accelerator: 'CmdOrCtrl+P',
						click: () => sendPublish({html: true})
					},
					/*
					{ type: 'separator' },
					{
						label: 'Standalone',
						submenu: [
							{
								label: 'Windows (Intel)',
								click: () => sendPublish({windows: true, x64: true})
							},
							{
								label: 'Windows (ARM)',
								click: () => sendPublish({windows: true, arm64: true})
							},
							{
								label: 'Mac (Apple Silicon)',
								click: () => sendPublish({mac: true, arm64: true})
							},
							{
								label: 'Mac (Intel)',
								click: () => sendPublish({mac: true, x64: true})
							},
							{
								label: 'Linux (Intel)',
								click: () => sendPublish({linux: true, x64: true})
							},
							{
								label: 'Linux (ARM)',
								click: () => sendPublish({linux: true, arm64: true})
							}
						]
					}
					*/
				]
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
				label: 'Paste In Place',
				accelerator: 'CmdOrCtrl+Shift+V',
				click: () => sendPasteInPlace()
			},
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
				accelerator: isMac ? 'Backspace' : 'Delete',
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
						label: 'Cone',
						click: () => sendAddObject('cone')
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
						label: 'Ambient Light',
						click: () => sendAddObject('amblight')
					},
					{
						label: 'Directional Light',
						click: () => sendAddObject('dirlight')
					},
					{
						label: 'Point Light',
						click: () => sendAddObject('pntlight')
					},
					{
						label: 'Spot Light',
						click: () => sendAddObject('spotlight')
					},
					{ type: 'separator' },
					{
						label: 'Particle System',
						click: () => sendAddObject('particlesys')
					},
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
						label: 'Camera Collision',
						click: () => sendAddComponent('CameraCollision')
					},
					{
						label: 'Particle System',
						click: () => sendAddComponent('ParticleSystem')
					},
					{
						label: 'Audio Listener',
						click: () => sendAddComponent('AudioListener')
					},
					{
						label: 'Audio Source',
						click: () => sendAddComponent('AudioSource')
					},
					{
						label: 'Auto LOD',
						click: () => sendAddComponent('AutoLOD')
					},
					{
						label: 'Day Night Cycle',
						click: () => sendAddComponent('DayNightCycle')
					},
					{
						label: 'Rigidbody',
						submenu: [
							{
								label: 'Dynamic',
								click: () => sendAddComponent('Rigidbody', {kind: 'dynamic'})
							},
							{
								label: 'Fixed',
								click: () => sendAddComponent('Rigidbody', {kind: 'fixed'})
							},
							{
								label: 'Kinematic',
								click: () => sendAddComponent('Rigidbody', {kind: 'kinematic'})
							},
						]
					},
					
					{ type: 'separator' },
					{
						label: 'First Person',
						submenu: [
							{
								label: 'Character Controller',
								click: () => sendAddComponent('FirstPersonCharacterController')
							},
							{
								label: 'Camera Controller',
								click: () => sendAddComponent('FirstPersonCamera')
							},
						]
					},
					{
						label: 'Third Person',
						submenu: [
							{
								label: 'Character Controller',
								click: () => sendAddComponent('CharacterController')
							},
							{
								label: 'Camera Controller',
								click: () => sendAddComponent('ThirdPersonCamera')
							}
						]
					},
					
					{
						label: '2D',
						submenu: [
							{
								label: 'Layout 2D',
								click: () => sendAddComponent('Layout2D')
							},
							{
								label: 'Filter 2D',
								click: () => sendAddComponent('Filter2D')
							}
						]
					},
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
				accelerator: 'CmdOrCtrl+G',
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
				accelerator: 'CmdOrCtrl+Alt+G',
				click: () => sendGroupObjects()
			},
			{
				label: 'Ungroup',
				accelerator: 'CmdOrCtrl+Alt+U',
				click: () => sendUngroupObjects()
			},
			{ type: 'separator' },
			{
				id: 'code',
				label: 'Code',
				accelerator: 'CmdOrCtrl+Shift+C',
				click: () => sendEditCode()
			},
			{
				label: 'Export As D3D...',
				accelerator: 'CmdOrCtrl+Shift+E',
				click: () => sendExportAsD3D()
			},
			{
				label: 'Export As Project...',
				click: () => sendExportAsD3DProj()
			}
		]
	},
	{
		label: 'Modify',
		submenu: [
			{
				label: 'Graphic',
				submenu: [
					{
						label: 'Smooth',
						click: () => openToolWindow('graphicSmooth')
					},
					{
						label: 'Straighten',
						click: () => openToolWindow('graphicStraighten')
					},
					{
						label: 'Simplify',
						click: () => openToolWindow('graphicSimplify')
					},
					{ type: 'separator' },
					{
						label: 'Merge',
						click: () => sendMergeObjects()
					},
					{ type: 'separator' },
					{
						label: 'Convert To Bitmap',
						click: () => sendModify('convert-bitmap')
					},
					{
						label: 'Export As PNG...',
						click: () => sendModify('export-png')
					}
				]
			},
			{
				label: 'Bitmap',
				submenu: [
					{
						label: 'Trace Bitmap',
						accelerator: 'Shift+Alt+T',
						click: () => openToolWindow('bitmapTrace')
					},
					{
						label: 'Export Bitmap...',
						click: () => sendModify('export-bitmap')
					}
				]
			},
			{ type: 'separator' },
			{
				label: 'Flip Vertically',
				click: () => sendModify('flip-vertical')
			},
			{
				label: 'Flip Horizontally',
				click: () => sendModify('flip-horizontal')
			},
			{
				label: 'Rotate 90 Degrees',
				click: () => sendModify('rotate+90')
			},
			{
				label: 'Rotate -90 Degrees',
				click: () => sendModify('rotate-90')
			},
		]
	},
	{
		label: 'Assets',
		id: 'assets',
		submenu: [
			{
				label: 'New Folder',
				accelerator: 'CmdOrCtrl+Shift+N',
				click: () => sendNewFolder()
			},
			{
				label: 'New Asset',
				submenu: [
					{ id: 'newAssetMat', label: 'Material', click: () => sendNewFile('mat') },
					{ id: 'newAssetAnim', label: 'Animation Clip', click: () => sendNewFile('anim') }
				]
			},
			{ type: 'separator' },
			{
				label: 'Import Assets…',
				accelerator: 'CmdOrCtrl+I',
				click: async () => {
					const { canceled, filePaths } = await dialog.showOpenDialog(editorWindow, {
						properties: ['openFile', 'multiSelections'],
					});
					if (!canceled && filePaths.length) {
						sendImportAssets(filePaths);
					}
				}
			},
			{
				label: 'Export Assets…',
				accelerator: 'CmdOrCtrl+E',
				click: () => sendExportSelectedAssets()
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
				accelerator: '[',
				click: () => sendSetTool('pan')
			},
			{
				label: 'Look',
				accelerator: 'o',
				click: () => sendSetTool('look')
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
			
			{ type: 'separator' },
			{ label: '2D Tools', type: 'header' },
			{
				label: 'Transform', 
				accelerator: 'q', 
				click: () => sendSetTool('transform') 
			},
			{
				label: 'Pencil', 
				accelerator: 'p', 
				click: () => sendSetTool('pencil') 
			},
			{
				label: 'Brush', 
				accelerator: 'b', 
				click: () => sendSetTool('brush') 
			},
			{
				label: 'Line', 
				accelerator: 'l', 
				click: () => sendSetTool('line') 
			},
			{
				label: 'Text', 
				accelerator: 't', 
				click: () => sendSetTool('text') 
			},
			{
				label: 'Polygon', 
				accelerator: 'g', 
				click: () => sendSetTool('polygon') 
			},
			{
				label: 'Rectangle', 
				accelerator: 'Alt+R', 
				click: () => sendSetTool('square') 
			},
			{
				label: 'Circle', 
				accelerator: 'Alt+C', 
				click: () => sendSetTool('circle') 
			},
			{
				label: 'Fill', 
				accelerator: 'k', 
				click: () => sendSetTool('fill') 
			}
		]
	},
	{
		label: 'View',
		submenu: [
			{
				label: 'Zoom In', 
				accelerator: 'CmdOrCtrl+=', 
				click: () => sendZoomStep(+1)
			},
			{
				label: 'Zoom Out', 
				accelerator: 'CmdOrCtrl+-', 
				click: () => sendZoomStep(-1)
			},
			{
				label: 'Reset View', 
				accelerator: 'CmdOrCtrl+Shift+R', 
				click: () => sendResetView()
			},
			...(isDev ? [{
				label: 'Toggle DevTools',
				accelerator: 'Alt+Cmd+I',
				click: (_, browserWindow) => {
					if (browserWindow)
						browserWindow.webContents.toggleDevTools();
				}
			}] : [])
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
	},
	{
		label: 'Help',
		role: 'help',
		submenu: [
			{
				label: 'Damen3D Engine Help',
				click: () => shell.openExternal('https://damen3d.com/help?origin=editor-help')
			},
			{
				label: 'Scripting Documentation',
				click: () => shell.openExternal('https://damen3d.com/scripting?origin=editor-help')
			},
			{ type: 'separator' },
			{
				label: 'Drake Hall Forums',
				click: () => shell.openExternal('https://drakehall.co.uk/?origin=d3d-editor')
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
		['save', 'assets', 'object'],
		projectOpen
	);
	
	if (isMac) {
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
if (!isMac) {
	const gotLock = app.requestSingleInstanceLock();
	
	if (!gotLock) {
		app.quit();
	} else {
		app.on('second-instance', (event, argv, workingDirectory) => {
			const filePath = getFileFromArgv(argv);
			if (!filePath) return;
			
			if (app.isReady()) {
				openProject(filePath);
			} else {
				pendingFile = filePath;
			}
		});
		
		const firstFile = getFileFromArgv(process.argv);
		if (firstFile) {
			pendingFile = firstFile;
		}
	}
}

app.whenReady().then(() => start());

app.on('open-file', (event, filePath) => {
	event.preventDefault();
	
	if(app.isReady()) {
		openProject(filePath);
	}else{
		pendingFile = filePath;
	}
});
app.on('window-all-closed', () => {
	app.quit();
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

// Get editor version
ipcMain.handle('get-editor-version', () => pkg.editorVersion);

// Get player version
ipcMain.handle('get-player-version', () => pkg.playerVersion);

// Set editor status
ipcMain.on('editor-status', (_, { inputFocussed, codeEditorOpen, activeElement }) => {
	if(typeof inputFocussed === 'boolean')
		inputFieldActive = inputFocussed;
	
	if(typeof codeEditorOpen === 'boolean')
		codeEditorActive = codeEditorOpen;
	
	if (editorWindow && !editorWindow.isDestroyed()) {
		const wc = editorWindow.webContents;
		if (wc && !wc.isDestroyed()) {
			const shouldIgnore = (
				activeElement?.tag === 'TEXTAREA' ||
				(activeElement?.tag === 'INPUT' && (activeElement?.type === 'text' || activeElement?.type === 'search'))
			);
			wc.setIgnoreMenuShortcuts(shouldIgnore);
		}
	}
		
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
ipcMain.handle('resolve-path', (_e, ...args) => {
	return !isDev ? resolvePath(...args) : null;
});
ipcMain.handle('show-save-dialog', async (_e, opts) => {
	return await dialog.showSaveDialog(opts || {});
});
ipcMain.handle('export-multiple-files', async (event, files) => {
	const wc = event.sender;
	const bw = BrowserWindow.fromWebContents(wc);
	
	const { canceled, filePaths } = await dialog.showOpenDialog(bw, {
		title: "Choose output folder",
		properties: ["openDirectory", "createDirectory"]
	});

	if(canceled || !filePaths || filePaths.length === 0)
		return { canceled: true };

	const outDir = filePaths[0];
	
	for(const f of files) {
		const buf = Buffer.from(f.data.data || f.data);
		const outPath = path.join(outDir, f.name);
		
		await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
		await fs.promises.writeFile(outPath, buf);
	}
	
	return { canceled: false, count: files.length };
});

// Get player URI
ipcMain.handle('get-current-game-uri', () => playerURI);

ipcMain.on('update-editor-window', (_, { width, height, title }) => {
	if (editorWindow && !editorWindow.isDestroyed()) {
		if(width && height)
			editorWindow.setSize(width, height);
		
		editorWindow.d3deditortitle = `${title} - Damen3D Editor ${pkg.editorVersion}`;
		editorWindow.setTitle(editorWindow.d3deditortitle);
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
		t.click = () => {
			editorWindow.webContents.send('ctx-menu-action', t.id);
			
			if(gameWindow?.webContents && !gameWindow.isDestroyed())
				gameWindow.webContents.send('ctx-menu-action', t.id); // for player test
		};
	});
	
	const menu = Menu.buildFromTemplate(template);
	const bw = BrowserWindow.fromWebContents(event.sender);
	
	menu.popup({ 
		window: bw, 
		x, y, 
		callback: () => event.sender.send('ctx-menu-close')
	});
});
ipcMain.on('open-project-uri', (_, uri) => {
	openProject(uri);
});
ipcMain.on('open-tool-window', (_, name) => {
	openToolWindow(name);
});
ipcMain.on('close-tool-window', (_, name) => {
	closeToolWindow(name);
});
ipcMain.on('send-message', (_, name, ...params) => {
	if(editorWindow.isDestroyed())
		return;
	
	editorWindow.webContents.send('send-message', name, ...params);
});