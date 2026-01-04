// main-editor.cjs

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
const fontList = require('font-list');
const pkg = require('../../package.json');

const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';

// ----------------------------
// Global singleton windows
// ----------------------------
let startWindow;
let newProjectWindow;
let splashWindow;

let pendingFile;

// ----------------------------
// Multi-project sessions
// ----------------------------
const sessions = new Map();       // projectId -> session
const winToProject = new Map();   // browserWindow.id -> projectId

function makeProjectId(uri) {
	return String(uri || '').toLowerCase();
}

function getFileFromArgv(argv) {
	return argv.find(arg => /\.d3dproj$/i.test(arg));
}

function resolvePath(...segments) {
	const base = app.getAppPath();
	return path.join(base, ...segments);
}

function getFocusedWindow() {
	return BrowserWindow.getFocusedWindow();
}

function getFocusedSession() {
	const bw = getFocusedWindow();
	if(!bw) return null;

	const projectId = winToProject.get(bw.id);
	if(!projectId) return null;

	return sessions.get(projectId) || null;
}

function getSessionFromEvent(event) {
	const bw = BrowserWindow.fromWebContents(event.sender);
	if(!bw) return null;

	const projectId = winToProject.get(bw.id);
	if(!projectId) return null;

	return sessions.get(projectId) || null;
}

function isEditorWindow(bw) {
	if(!bw || bw.isDestroyed()) return false;
	return !!winToProject.get(bw.id);
}

function getEditorBusy() {
	const session = getFocusedSession();
	if(!session) return false;
	return !!session.inputFieldActive;
}

// ----------------------------
// Tool windows definitions
// ----------------------------
const toolWindows = {
	projectSettings: {
		title: 'Project Settings',
		width: 760,
		height: 480,
		resizable: false,
		html: 'project-settings.html'
	},
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
};

// ----------------------------
// Theme helper
// ----------------------------
function setupTheme(browserWindow) {
	browserWindow.webContents.on('did-finish-load', () => {
		if(browserWindow && !browserWindow.isDestroyed()) {
			browserWindow.webContents.send(
				'theme-changed',
				nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
			);
		}
	});
}

function broadcastTheme() {
	const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';

	[ startWindow, newProjectWindow, splashWindow ].forEach(win => {
		if(win && !win.isDestroyed())
			win.webContents.send('theme-changed', theme);
	});

	// sessions (editor/game/tools)
	for(const session of sessions.values()) {
		const list = [];

		if(session.editorWindow) list.push(session.editorWindow);
		if(session.gameWindow) list.push(session.gameWindow);

		for(const w of session.toolWindows.values())
			list.push(w);

		list.forEach(win => {
			if(win && !win.isDestroyed())
				win.webContents.send('theme-changed', theme);
		});
	}
}

// ----------------------------
// App About
// ----------------------------
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

// ----------------------------
// Splash
// ----------------------------
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

// ----------------------------
// Start / New Project windows
// ----------------------------
async function createStartWindow() {
	startWindow = new BrowserWindow({
		title: 'Damen3D Editor',
		width: 400,
		height: 250,
		resizable: false,
		fullScreenable: false,
		titleBarStyle: 'hidden',
		webPreferences: {
			preload: path.join(__dirname, 'preload-editor.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false
		}
	});

	if(isDev) await startWindow.loadURL('http://localhost:5173/editorstart.html');
	else await startWindow.loadFile(resolvePath('dist', 'editor', 'editorstart.html'));

	startWindow.on('closed', () => {
		startWindow = null;
	});

	startWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
		console.error('❌ Preload failed:', preloadPath, error);
	});

	setupTheme(startWindow);

	startWindow.webContents.on('did-finish-load', () => {
		startWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
	});
}

if(isMac) {
	app.on('new-window-for-tab', (event) => {
		// stop Electron/macOS creating a blank new tab window
		event.preventDefault();

		// only do this when the user is in an editor tab/window
		const bw = BrowserWindow.getFocusedWindow();
		const projectId = bw ? winToProject.get(bw.id) : null;

		if(!projectId)
			return;

		if(!startWindow) createStartWindow();
		else startWindow.show();

		startWindow.focus();
	});
}

async function createNewProjectWindow() {
	newProjectWindow = new BrowserWindow({
		title: 'New Project',
		width: 380,
		height: isMac ? 430 : 450,
		resizable: false,
		fullScreenable: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload-editor.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false,
			spellcheck: false
		}
	});

	if(isDev) await newProjectWindow.loadURL('http://localhost:5173/editornew.html');
	else await newProjectWindow.loadFile(resolvePath('dist', 'editor', 'editornew.html'));

	newProjectWindow.on('closed', () => {
		newProjectWindow = null;
	});

	setupTheme(newProjectWindow);

	if(!isMac)
		newProjectWindow.setMenu(null);
	else
		Menu.setApplicationMenu(appMenuBase);

	newProjectWindow.webContents.on('did-finish-load', () => {
		newProjectWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
	});
}

function closeNewProjectWindow() {
	return new Promise(resolve => {
		if(!newProjectWindow) return resolve();

		if(newProjectWindow.isDestroyed()) {
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

// ----------------------------
// Session windows
// ----------------------------
async function createEditorWindow(session) {
	if(session.editorWindow && !session.editorWindow.isDestroyed()) {
		session.editorWindow.show();
		session.editorWindow.focus();
		return;
	}

	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const win = new BrowserWindow({
		title: 'Damen3D Editor',
		width,
		height,
		minWidth: 1200,
		minHeight: 600,
		resizable: true,

		// macOS native tab grouping (optional)
		tabbingIdentifier: 'damen3d-editor',

		webPreferences: {
			preload: path.join(__dirname, 'preload-editor.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false,
			spellcheck: false
		}
	});

	session.editorWindow = win;
	winToProject.set(win.id, session.projectId);

	win.on('close', async (e) => {
		if(!session.dirty)
			return;

		e.preventDefault();

		const { response } = await dialog.showMessageBox(win, {
			type: 'question',
			buttons: ['Save', "Don’t Save", 'Cancel'],
			defaultId: 0,
			cancelId: 2,
			message: 'Do you want to save your changes before closing this project?',
		});

		if(response === 0) {
			win.webContents.send('request-save-and-close', session.uri);
		}else
		if(response === 1) {
			session.dirty = false;
			win.destroy();
		}
	});

	win.on('closed', () => {
		winToProject.delete(win.id);

		// close game + tools for this project
		closeSessionGameWindow(session);
		closeAllSessionToolWindows(session);

		session.editorWindow = null;

		// remove session when fully closed
		sessions.delete(session.projectId);

		updateEditorMenusEnabled();
	});

	win.webContents.on('before-input-event', (event, input) => {
		const wc = win.webContents;

		if(!session.inputFieldActive)
			return;

		const mod = (input.meta || input.control) && !input.alt;
		if(!mod) return;

		switch(input.key.toLowerCase()) {
			case 'c': wc.copy();      event.preventDefault(); return;
			case 'v': wc.paste();     event.preventDefault(); return;
			case 'x': wc.cut();       event.preventDefault(); return;
			case 'a': wc.selectAll(); event.preventDefault(); return;
			case 'z':
				if(input.shift) wc.redo(); else wc.undo();
				return;
		}
	});

	if(isDev) await win.loadURL('http://localhost:5173');
	else await win.loadFile(resolvePath('dist', 'editor', 'index.html'));

	if(isMac) {
		// must match for native tabbing
		win.tabbingIdentifier = 'damen3d-editor';
	
		const host = getAnyEditorWindowExcept(win);
		if(host) {
			// Force it into tabs instead of a separate window
			try { host.addTabbedWindow(win); } catch(e) {}
		}
	}
	
	setupTheme(win);

	Menu.setApplicationMenu(appMenu);

	await new Promise(resolve => {
		win.webContents.once('did-finish-load', resolve);
	});

	// tell renderer what project it is
	win.webContents.send('open-project-uri', session.uri);

	updateEditorMenusEnabled();
}

async function createGameWindow(session) {
	await closeSessionGameWindow(session);

	const win = new BrowserWindow({
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
	
	session.gameWindow = win;
	winToProject.set(win.id, session.projectId);

	if(!isMac)
		win.setMenu(null);

	if(isDev) await win.loadURL('http://localhost:5173/player.html');
	else await win.loadFile(resolvePath('dist', 'editor', 'player.html'));

	win.on('closed', () => {
		winToProject.delete(win.id);
		session.gameWindow = null;
	});

	setupTheme(win);
}

function closeSessionGameWindow(session) {
	return new Promise(resolve => {
		if(!session.gameWindow) return resolve();

		if(session.gameWindow.isDestroyed()) {
			session.gameWindow = null;
			return resolve();
		}

		session.gameWindow.once('closed', () => {
			session.gameWindow = null;
			resolve();
		});

		session.gameWindow.close();
	});
}

function getAnyEditorWindowExcept(exceptWin) {
	for(const s of sessions.values()) {
		const w = s.editorWindow;
		if(!w || w.isDestroyed()) continue;
		if(exceptWin && w.id === exceptWin.id) continue;
		return w;
	}
	return null;
}

async function createToolWindow(session, name) {
	const def = toolWindows[name];
	if(!def || !def.title)
		throw new Error(`Tool window ${name} does not exist`);

	// close existing tool window for this project
	const old = session.toolWindows.get(name);
	if(old && !old.isDestroyed())
		old.close();

	const win = new BrowserWindow({
		title: def.title ?? 'Tool Window',
		width: def.width ?? 100,
		height: def.height ?? 100,
		resizable: def.resizable ?? true,
		//parent: session.editorWindow || undefined,
		webPreferences: {
			preload: path.join(__dirname, 'preload-editor.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false,
			spellcheck: false
		}
	});

	session.toolWindows.set(name, win);
	winToProject.set(win.id, session.projectId);

	if(isDev) await win.loadURL(`http://localhost:5173/tool-windows/${def.html}`);
	else await win.loadFile(resolvePath('dist', 'editor', 'tool-windows', def.html));

	win.on('closed', () => {
		winToProject.delete(win.id);
		session.toolWindows.delete(name);
	});

	setupTheme(win);

	if(!isMac)
		win.setMenu(null);
	else
		Menu.setApplicationMenu(appMenuBase);
}

function closeAllSessionToolWindows(session) {
	for(const w of session.toolWindows.values()) {
		if(w && !w.isDestroyed())
			w.close();
	}
	session.toolWindows.clear();
}

// ----------------------------
// Project open / browse
// ----------------------------
async function openBrowse() {
	const { canceled, filePaths } = await dialog.showOpenDialog({
		title: 'Select a D3D project file',
		filters: [{ name: 'Damen3D Project Files', extensions: ['d3dproj'] }],
		properties: ['openFile']
	});

	if(canceled || filePaths.length === 0)
		return null;

	openProject(filePaths[0]);
}

async function openProject(uri) {
	console.log('Open project', uri);

	const projectId = makeProjectId(uri);

	let session = sessions.get(projectId);
	if(!session) {
		session = {
			projectId,
			uri,

			dirty: false,
			inputFieldActive: false,
			codeEditorActive: false,

			editorWindow: null,
			gameWindow: null,

			toolWindows: new Map(),

			editorTitleBase: null,
			playerURI: null
		};

		sessions.set(projectId, session);
	}

	await createEditorWindow(session);
}

function startNewProject() {
	Menu.setApplicationMenu(appMenuBase);

	if(!newProjectWindow) createNewProjectWindow();
	else newProjectWindow.show();
}

// ----------------------------
// Send helpers (focused project only)
// ----------------------------
function sendToEditor(channel, ...args) {
	const session = getFocusedSession();
	if(!session || !session.editorWindow || session.editorWindow.isDestroyed())
		return;

	session.editorWindow.webContents.send(channel, ...args);
}

function sendSelectAll() { sendToEditor('select-all'); }
function sendDelete() { sendToEditor('delete'); }
function sendUndo() { sendToEditor('undo'); }
function sendRedo() { sendToEditor('redo'); }
function sendDupe() { sendToEditor('dupe'); }
function sendAddObject(type) { sendToEditor('add-object', type); }
function sendSymboliseObject() { sendToEditor('symbolise-object'); }
function sendDesymboliseObject() { sendToEditor('desymbolise-object'); }
function sendFocusObject() { sendToEditor('focus-object'); }
function sendEnableObject() { sendToEditor('enable-object'); }
function sendDisableObject() { sendToEditor('disable-object'); }
function sendSetTool(type) { sendToEditor('set-tool', type); }
function sendSetTransformTool(type) { sendToEditor('set-transform-tool', type); }
function sendNewFolder() { sendToEditor('new-folder'); }
function sendNewFile(extension) { sendToEditor('new-asset', extension); }
function sendEditCode() { sendToEditor('edit-code'); }
function sendEditInPlace() { sendToEditor('edit-in-place') }
function sendExportSelectedAssets() { sendToEditor('menu-export-assets'); }
function sendAddComponent(type, properties) { sendToEditor('add-component', type, properties); }
function sendCopySpecial(type) { sendToEditor('copy-special', type); }
function sendPasteSpecial(type) { sendToEditor('paste-special', type); }
function sendGroupObjects() { sendToEditor('group'); }
function sendUngroupObjects() { sendToEditor('ungroup'); }
function sendMergeObjects() { sendToEditor('merge'); }
function sendMoveToView() { sendToEditor('move-sel-view'); }
function sendAlignToView() { sendToEditor('align-sel-view'); }
function sendDropToGround() { sendToEditor('drop-to-ground'); }
function sendZoomStep(step) { sendToEditor('zoom-step', step); }
function sendResetView() { sendToEditor('reset-view'); }
function sendExportAsD3D() { sendToEditor('export-as-d3d'); }
function sendExportAsD3DProj() { sendToEditor('export-as-d3dproj'); }
function sendModify(type) { sendToEditor('modify', type); }
function sendPasteInPlace() { sendToEditor('paste-in-place'); }

function sendImportAssets(paths) {
	sendToEditor('menu-import-assets', paths);
}

function sendSaveProject() {
	const session = getFocusedSession();
	if(!session) return;

	sendToEditor('save-project', session.uri);
}

function sendSaveProjectAs() {
	const session = getFocusedSession();
	if (!session || !session.editorWindow || session.editorWindow.isDestroyed())
		return;

	dialog.showSaveDialog(session.editorWindow, {
		title: 'Save Project As',
		defaultPath: session.uri,
		buttonLabel: 'Save',
		filters: [{ name: 'Damen3D Project', extensions: ['d3dproj'] }],
		properties: ['showOverwriteConfirmation']
	}).then(result => {
		if (result.canceled || !result.filePath)
			return;

		try {
			rekeySessionToUri(session, result.filePath);
		} catch (e) {
			console.error(e);
			// optional: show dialog to user here
			return;
		}

		session.editorWindow.webContents.send('save-project', result.filePath);

		// optional but usually correct: update window title / recent docs etc.
		session.editorWindow.webContents.send('project-uri-changed', result.filePath);
	}).catch(err => {
		console.error('Save As dialog failed:', err);
	});
}

function rekeySessionToUri(session, newUri) {
	// old id derived from previous uri
	const oldProjectId = session.projectId ?? makeProjectId(session.uri);
	const newProjectId = makeProjectId(newUri);

	// no-op if same file (case-insensitive etc.)
	if (oldProjectId === newProjectId) {
		session.uri = newUri;
		session.projectId = newProjectId;
		return;
	}

	// hard guard: if another session already owns the new id, bail
	// (or close/merge depending on your app rules)
	const existing = sessions.get(newProjectId);
	if (existing && existing !== session) {
		throw new Error(`A project is already open for: ${newUri}`);
	}

	// remove old key, set new key
	sessions.delete(oldProjectId);
	sessions.set(newProjectId, session);

	// update win -> project mapping
	if (session.editorWindow && !session.editorWindow.isDestroyed()) {
		winToProject.set(session.editorWindow.id, newProjectId);
	}

	// update session fields
	session.uri = newUri;
	session.projectId = newProjectId;
}

function sendBuild({prompt, play}) {
	const session = getFocusedSession();
	if(!session || !session.editorWindow || session.editorWindow.isDestroyed())
		return;

	let uri = session.uri;

	if(uri.endsWith('.d3dproj'))
		uri = uri.slice(0, -'.d3dproj'.length) + '.d3d';

	if(uri && !prompt) {
		session.editorWindow.webContents.send('build', uri, play);
		return;
	}

	dialog.showSaveDialog(session.editorWindow, {
		title: 'Build',
		defaultPath: uri,
		buttonLabel: 'Save',
		filters: [
			{ name: 'Damen3D File', extensions: ['d3d'] }
		],
		properties: ['showOverwriteConfirmation']
	}).then(result => {
		if(!result.canceled && result.filePath) {
			session.editorWindow.webContents.send('build', result.filePath, play);
		}
	}).catch(err => {
		console.error('Build dialog failed:', err);
	});
}

function sendPublish(opts = {}) {
	const session = getFocusedSession();
	if(!session || !session.editorWindow || session.editorWindow.isDestroyed())
		return;

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

	let uri = session.uri;
	let d3duri = session.uri;

	if(d3duri.endsWith('.d3dproj'))
		d3duri = d3duri.slice(0, -'.d3dproj'.length) + '.d3d';

	if(uri.endsWith('.d3dproj'))
		uri = uri.slice(0, -'.d3dproj'.length) + `${ext != '' ? `.${ext}` : ''}`;
	else
		return;

	dialog.showSaveDialog(session.editorWindow, {
		title: 'Publish',
		defaultPath: uri,
		buttonLabel: 'Publish',
		filters: [
			{ name: fname, extensions: [ext] }
		],
		properties: ['showOverwriteConfirmation']
	}).then(result => {
		if(!result.canceled && result.filePath) {
			session.editorWindow.webContents.send('publish', result.filePath, d3duri, opts);
		}
	}).catch(err => {
		console.error('Publish dialog failed:', err);
	});
}

function openToolWindow(name) {
	const session = getFocusedSession();
	if(!session) return;
	createToolWindow(session, name);
}

// ----------------------------
// Menu enabling
// ----------------------------
function setItemEnabledDeep(item, enabled) {
	if(!item)
		return;

	if(item.type !== 'separator')
		item.enabled = enabled;

	if(item.submenu) {
		for(const child of item.submenu.items)
			setItemEnabledDeep(child, enabled);
	}
}

function updateEditorMenusEnabled() {
	const session = getFocusedSession();
	const projectOpen = !!session;

	const toggleForSwitch = (ids, toggle) => {
		ids.forEach(id => {
			const item = appMenu.getMenuItemById(id);
			if(!item) return;
			setItemEnabledDeep(item, toggle);
		});
	};

	toggleForSwitch(
		['save', 'assets', 'object'],
		projectOpen
	);

	if(isMac)
		Menu.setApplicationMenu(projectOpen ? appMenu : appMenuBase);
}

// ----------------------------
// Menus
// ----------------------------
const standardMenu = [
	...(isMac ? [{
		label: app.productName,
		submenu: [
			{ role: 'about', id: 'about' },
			{ type: 'separator' },
			{ role: 'quit', id: 'quit' }
		]
	}] : []),
	{ role: 'editMenu' },
	...(isDev ? [{
		label: 'View',
		submenu: [
			{
				id: 'toggleDevTools',
				label: 'Toggle DevTools',
				accelerator: 'Alt+Cmd+I',
				click: (_, browserWindow) => {
					if(browserWindow)
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
			...(isMac ? [
				{ type: 'separator' },
				{ role: 'front', id: 'front' },
				{ type: 'separator' },
				{ role: 'window', id: 'windowRole' }
			] : []),
			{
				id: 'closeWindow',
				label: 'Close',
				accelerator: 'CmdOrCtrl+W',
				click: () => {
					const bw = getFocusedWindow();
					if(bw) bw.close();
				}
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
					}
				]
			},
		]
	},
	{
		label: 'Edit',
		submenu: [
			{ id: 'undo', label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => sendUndo() },
			{ id: 'redo', label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => sendRedo() },
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
					{ label: 'All', accelerator: 'CmdOrCtrl+Shift+V', click: () => sendPasteSpecial('all') },
					{ label: 'Position', click: () => sendPasteSpecial('position') },
					{ label: 'Rotation', click: () => sendPasteSpecial('rotation') },
					{ label: 'Scale', click: () => sendPasteSpecial('scale') }
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
			{ id: 'selectAll', label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => sendSelectAll() },
			{ type: 'separator' },
			{ label: 'Project Settings', click: () => openToolWindow('projectSettings'), accelerator: 'CmdOrCtrl+,' }
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
					{ label: 'Empty Object', click: () => sendAddObject('empty') },
					{ type: 'separator' },
					{ label: 'Cube', click: () => sendAddObject('cube') },
					{ label: 'Capsule', click: () => sendAddObject('capsule') },
					{ label: 'Sphere', click: () => sendAddObject('sphere') },
					{ label: 'Cone', click: () => sendAddObject('cone') },
					{ label: 'Pyramid', click: () => sendAddObject('pyramid') },
					{ label: 'Plane', click: () => sendAddObject('plane') },
					{ type: 'separator' },
					{ label: 'Camera', click: () => sendAddObject('camera') },
					{ label: 'Ambient Light', click: () => sendAddObject('amblight') },
					{ label: 'Directional Light', click: () => sendAddObject('dirlight') },
					{ label: 'Point Light', click: () => sendAddObject('pntlight') },
					{ label: 'Spot Light', click: () => sendAddObject('spotlight') },
					{ type: 'separator' },
					{ label: 'Particle System', click: () => sendAddObject('particlesys') },
					{ label: 'Audio Source', click: () => sendAddObject('audiosrc') },
					{ label: 'Day Night Cycle', click: () => sendAddObject('dncycle') },
					{ label: 'Stamper', click: () => sendAddObject('stamper') }
				]
			},
			{
				id: 'addcomponent',
				label: 'Add Component',
				submenu: [
					{ label: 'Animation', click: () => sendAddComponent('Animation') },
					{ label: 'Camera Collision', click: () => sendAddComponent('CameraCollision') },
					{ label: 'Particle System', click: () => sendAddComponent('ParticleSystem') },
					{ label: 'Audio Listener', click: () => sendAddComponent('AudioListener') },
					{ label: 'Audio Source', click: () => sendAddComponent('AudioSource') },
					{
						label: 'Rigidbody',
						submenu: [
							{ label: 'Dynamic', click: () => sendAddComponent('Rigidbody', {kind: 'dynamic'}) },
							{ label: 'Fixed', click: () => sendAddComponent('Rigidbody', {kind: 'fixed'}) },
							{ label: 'Kinematic', click: () => sendAddComponent('Rigidbody', {kind: 'kinematic'}) },
						]
					},
					{
						label: 'Advanced',
						submenu: [
							{ label: 'Auto LOD', click: () => sendAddComponent('AutoLOD') },
							{ label: 'Trigger', click: () => sendAddComponent('Trigger') }
						]
					},
					{ type: 'separator' },
					{
						label: 'First Person',
						submenu: [
							{ label: 'Character Controller', click: () => sendAddComponent('FirstPersonCharacterController') },
							{ label: 'Camera Controller', click: () => sendAddComponent('FirstPersonCamera') }
						]
					},
					{
						label: 'Third Person',
						submenu: [
							{ label: 'Character Controller', click: () => sendAddComponent('CharacterController') },
							{ label: 'Camera Controller', click: () => sendAddComponent('ThirdPersonCamera') }
						]
					},
					{
						label: '2D',
						submenu: [
							{ label: 'Layout 2D', click: () => sendAddComponent('Layout2D') },
							{ label: 'Filter 2D', click: () => sendAddComponent('Filter2D') }
						]
					}
				]
			},
			{ type: 'separator' },
			{ id: 'focusObject', label: 'Focus', accelerator: 'F', click: () => sendFocusObject() },
			{ label: 'Enable', accelerator: 'Alt+Shift+E', click: () => sendEnableObject() },
			{ label: 'Disable', accelerator: 'Alt+Shift+D', click: () => sendDisableObject() },
			{ type: 'separator' },
			{ id: 'symbolise', label: 'Symbolise', accelerator: 'CmdOrCtrl+Shift+Y', click: () => sendSymboliseObject() },
			{ id: 'desymbolise', label: 'Desymbolise', accelerator: 'CmdOrCtrl+Shift+D', click: () => sendDesymboliseObject() },
			{ type: 'separator' },
			{ label: 'Group', accelerator: 'CmdOrCtrl+Alt+G', click: () => sendGroupObjects() },
			{ label: 'Ungroup', accelerator: 'CmdOrCtrl+Alt+U', click: () => sendUngroupObjects() },
			{ type: 'separator' },
			{ label: 'Export As D3D...', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendExportAsD3D() },
			{ label: 'Export As Project...', click: () => sendExportAsD3DProj() },
			{ type: 'separator' },
			{ id: 'code', label: 'Edit In Place', click: () => sendEditInPlace() },
			{ id: 'code', label: 'Code', accelerator: 'CmdOrCtrl+Shift+C', click: () => sendEditCode() }
		]
	},
	{
		label: 'Modify',
		submenu: [
			{
				label: 'Graphic',
				submenu: [
					{ label: 'Smooth', click: () => openToolWindow('graphicSmooth') },
					{ label: 'Straighten', click: () => openToolWindow('graphicStraighten') },
					{ label: 'Simplify', click: () => openToolWindow('graphicSimplify') },
					{ type: 'separator' },
					{ label: 'Merge', click: () => sendMergeObjects() },
					{ type: 'separator' },
					{ label: 'Convert To Bitmap', click: () => sendModify('convert-bitmap') },
					{ label: 'Export As PNG...', click: () => sendModify('export-png') }
				]
			},
			{
				label: 'Bitmap',
				submenu: [
					{ label: 'Trace Bitmap', accelerator: 'Shift+Alt+T', click: () => openToolWindow('bitmapTrace') },
					{ label: 'Export Bitmap...', click: () => sendModify('export-bitmap') }
				]
			},
			{ type: 'separator' },
			{ label: 'Flip Vertically', click: () => sendModify('flip-vertical') },
			{ label: 'Flip Horizontally', click: () => sendModify('flip-horizontal') },
			{ label: 'Rotate 90 Degrees', click: () => sendModify('rotate+90') },
			{ label: 'Rotate -90 Degrees', click: () => sendModify('rotate-90') },
			{ type: 'separator' },
			{ label: 'Move to View', accelerator: 'CmdOrCtrl+Alt+M', click: () => sendMoveToView() },
			{ label: 'Align to View', accelerator: 'CmdOrCtrl+Alt+A', click: () => sendAlignToView() },
			{ label: 'Drop to Ground', accelerator: 'CmdOrCtrl+G', click: () => sendDropToGround() },
		]
	},
	{
		label: 'Assets',
		id: 'assets',
		submenu: [
			{ label: 'New Folder', accelerator: 'CmdOrCtrl+Shift+N', click: () => sendNewFolder() },
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
					const session = getFocusedSession();
					if(!session || !session.editorWindow) return;

					const { canceled, filePaths } = await dialog.showOpenDialog(session.editorWindow, {
						properties: ['openFile', 'multiSelections'],
					});

					if(!canceled && filePaths.length)
						sendImportAssets(filePaths);
				}
			},
			{ label: 'Export Assets…', accelerator: 'CmdOrCtrl+E', click: () => sendExportSelectedAssets() }
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
			{ id: 'toolPan', label: 'Pan', accelerator: '[', click: () => sendSetTool('pan') },
			{ label: 'Look', accelerator: 'o', click: () => sendSetTool('look') },
			{ type: 'separator' },
			{ id: 'toolTranslate', label: 'Translate', click: () => sendSetTransformTool('translate') },
			{ id: 'toolRotate', label: 'Rotate', accelerator: 'r', click: () => sendSetTransformTool('rotate') },
			{ id: 'toolScale', label: 'Scale', accelerator: 's', click: () => sendSetTransformTool('scale') },
			{ type: 'separator' },
			{ label: '2D Tools', type: 'header' },
			{ label: 'Transform', accelerator: 'q', click: () => sendSetTool('transform') },
			{ label: 'Pencil', accelerator: 'p', click: () => sendSetTool('pencil') },
			{ label: 'Brush', accelerator: 'b', click: () => sendSetTool('brush') },
			{ label: 'Line', accelerator: 'l', click: () => sendSetTool('line') },
			{ label: 'Text', accelerator: 't', click: () => sendSetTool('text') },
			{ label: 'Polygon', accelerator: 'g', click: () => sendSetTool('polygon') },
			{ label: 'Rectangle', accelerator: 'Alt+R', click: () => sendSetTool('square') },
			{ label: 'Circle', accelerator: 'Alt+C', click: () => sendSetTool('circle') },
			{ label: 'Fill', accelerator: 'k', click: () => sendSetTool('fill') }
		]
	},
	{
		label: 'View',
		submenu: [
			{ label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => sendZoomStep(+1) },
			{ label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => sendZoomStep(-1) },
			{ label: 'Reset View', accelerator: 'CmdOrCtrl+Shift+R', click: () => sendResetView() },
			...(isDev ? [{
				label: 'Toggle DevTools',
				accelerator: 'Alt+Cmd+I',
				click: (_, browserWindow) => {
					if(browserWindow)
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
			...(isMac ? [
				{ type: 'separator' },
				{ role: 'front', id: 'front' },
				{ type: 'separator' },
				{ role: 'window', id: 'windowRole' }
			] : []),
			{
				id: 'closeWindow',
				label: 'Close',
				accelerator: 'CmdOrCtrl+W',
				click: () => {
					const bw = getFocusedWindow();
					if(bw) bw.close();
				}
			}
		]
	},
	{
		label: 'Help',
		role: 'help',
		submenu: [
			{ label: 'Damen3D Engine Help', click: () => shell.openExternal('https://damen3d.com/help?origin=editor-help') },
			{ label: 'Scripting Documentation', click: () => shell.openExternal('https://damen3d.com/scripting?origin=editor-help') },
			{ type: 'separator' },
			{ label: 'Drake Hall Forums', click: () => shell.openExternal('https://drakehall.co.uk/?origin=d3d-editor') }
		]
	}
];

const appMenu = Menu.buildFromTemplate(menuTemplate);
const appMenuBase = Menu.buildFromTemplate(standardMenu);

Menu.setApplicationMenu(appMenuBase);

// ----------------------------
// Start
// ----------------------------
async function start() {
	setupAbout();

	if(pendingFile) {
		openProject(pendingFile);
		pendingFile = null;
	}else{
		createStartWindow();
	}

	try {
		const res = await fetch(
			`https://damen3d.com/api/v1/splash.php?origin=editor&v=${pkg.editorVersion}&theme=${nativeTheme.shouldUseDarkColors ? 'dark' : 'light'}`
		);

		if(res.ok) {
			const splashData = await res.json();
			if(splashData?.splash)
				createSplashScreen(splashData.splash);
		}
	}catch(e) {
		console.error('Splash error', e);
	}
}

// ----------------------------
// Theme events
// ----------------------------
nativeTheme.on('updated', () => {
	broadcastTheme();
});

// ----------------------------
// App events
// ----------------------------
if(!isMac) {
	const gotLock = app.requestSingleInstanceLock();

	if(!gotLock) {
		app.quit();
	} else {
		app.on('second-instance', (event, argv) => {
			const filePath = getFileFromArgv(argv);
			if(!filePath) return;

			if(app.isReady()) openProject(filePath);
			else pendingFile = filePath;
		});

		const firstFile = getFileFromArgv(process.argv);
		if(firstFile)
			pendingFile = firstFile;
	}
}

app.whenReady().then(() => start());

app.on('open-file', (event, filePath) => {
	event.preventDefault();

	if(app.isReady()) openProject(filePath);
	else pendingFile = filePath;
});

app.on('browser-window-focus', () => {
	updateEditorMenusEnabled();
});

app.on('window-all-closed', () => {
	app.quit();
});

app.on('activate', () => {
	if(!startWindow)
		createStartWindow();
});

// ----------------------------
// IPC handlers
// ----------------------------

// Theme
ipcMain.handle('get-theme', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');

// New D3D project
ipcMain.handle('new-project', () => startNewProject());

// Browse D3D Project
ipcMain.handle('open-project', () => openBrowse());

// Get project URI (per-window)
ipcMain.handle('get-current-project-uri', (event) => {
	const session = getSessionFromEvent(event);
	return session?.uri || null;
});

// Get editor version
ipcMain.handle('get-editor-version', () => pkg.editorVersion);

// Get player version
ipcMain.handle('get-player-version', () => pkg.playerVersion);

// Get system fonts
ipcMain.handle('get-system-fonts', async () => {
	const fonts = await fontList.getFonts();
	return Array.from(new Set(fonts)).sort((a, b) => a.localeCompare(b));
});

// Editor status (per project window)
ipcMain.on('editor-status', (event, { inputFocussed, codeEditorOpen, activeElement }) => {
	const session = getSessionFromEvent(event);
	if(!session) return;

	if(typeof inputFocussed === 'boolean')
		session.inputFieldActive = inputFocussed;

	if(typeof codeEditorOpen === 'boolean')
		session.codeEditorActive = codeEditorOpen;

	const bw = BrowserWindow.fromWebContents(event.sender);
	if(bw && !bw.isDestroyed()) {
		const wc = bw.webContents;
		if(wc && !wc.isDestroyed()) {
			const shouldIgnore = (
				activeElement?.tag === 'TEXTAREA' ||
				(activeElement?.tag === 'INPUT' && (activeElement?.type === 'text' || activeElement?.type === 'search'))
			);

			wc.setIgnoreMenuShortcuts(shouldIgnore);
		}
	}

	updateEditorMenusEnabled();
});

// Close new project window
ipcMain.on('close-new-proj-window', () => closeNewProjectWindow());

// Close editor (close the session window that sent it)
ipcMain.on('close-editor', (event) => {
	const bw = BrowserWindow.fromWebContents(event.sender);
	if(bw) bw.close();
});

// Show error dialog
ipcMain.on('show-error', async (event, { title, message, closeEditorWhenDone }) => {
	const win =
		BrowserWindow.fromWebContents(event.sender) ||
		BrowserWindow.getFocusedWindow();

	if(!win) return;

	await dialog.showMessageBox(win, {
		type: 'error',
		title: title || 'Error',
		message: message || 'Unknown error',
		buttons: ['OK']
	});

	if(closeEditorWhenDone)
		win.close();
});

// Show confirm dialog
ipcMain.handle('show-confirm', async (event, { title = 'Confirm', message = 'Are you sure?' }) => {
	const win =
		BrowserWindow.fromWebContents(event.sender) ||
		BrowserWindow.getFocusedWindow();

	if(!win) return false;

	const { response } = await dialog.showMessageBox(win, {
		type: 'question',
		title,
		message,
		buttons: ['Yes', 'No'],
		defaultId: 0,
		cancelId: 1,
		normalizeAccessKeys: true
	});

	return response === 0;
});

// Resolve path
ipcMain.handle('resolve-path', (_e, ...args) => {
	return !isDev ? resolvePath(...args) : null;
});

// Show save dialog
ipcMain.handle('show-save-dialog', async (_e, opts) => {
	return await dialog.showSaveDialog(opts || {});
});

// Export multiple files
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

// Update editor window title/size (per sender)
ipcMain.on('update-editor-window', (event, { width, height, title }) => {
	const bw = BrowserWindow.fromWebContents(event.sender);
	const session = getSessionFromEvent(event);

	if(!bw || bw.isDestroyed() || !session)
		return;

	if(width && height)
		bw.setSize(width, height);

	session.editorTitleBase = `${title} - Damen3D Editor ${pkg.editorVersion}`;
	bw.setTitle(session.editorTitleBase + (session.dirty ? ' *' : ''));
});

// Dirty flag (per sender)
ipcMain.on('set-dirty', (event, isDirty) => {
	const bw = BrowserWindow.fromWebContents(event.sender);
	const session = getSessionFromEvent(event);

	if(!bw || bw.isDestroyed() || !session)
		return;

	session.dirty = !!isDirty;

	bw.setDocumentEdited(session.dirty);

	if(!session.editorTitleBase)
		session.editorTitleBase = bw.getTitle();

	bw.setTitle(session.editorTitleBase + (session.dirty ? ' *' : ''));
});

// Finder
ipcMain.on('show-in-finder', (_event, uri) => {
	shell.showItemInFolder(uri);
});

// Game window update (per session)
ipcMain.on('update-window', (event, { width, height, title }) => {
	const session = getSessionFromEvent(event);
	if(!session || !session.gameWindow || session.gameWindow.isDestroyed())
		return;

	if(width && height)
		session.gameWindow.setContentSize(width, height);

	if(title)
		session.gameWindow.setTitle(title);
});

// Open player (per session)
ipcMain.on('open-player', (event, uri) => {
	const session = getSessionFromEvent(event);
	if(!session) return;

	session.playerURI = uri;
	createGameWindow(session);
});

// Get player URI (per sender session)
ipcMain.handle('get-current-game-uri', (event) => {
	const session = getSessionFromEvent(event);
	return session?.playerURI || null;
});

ipcMain.handle('get-project-settings', async (event) => {
	const session = getSessionFromEvent(event);
	const editorWindow = session.editorWindow;
	
	if(!editorWindow || editorWindow.isDestroyed())
		return null;
	
	const value = await editorWindow.webContents.executeJavaScript(
		`(function(){
			try {
				return window?._editor?.project?.editorConfig ?? null;
			}catch(e){
				return null;
			}
		})()`,
		true
	);
	
	return value;
});

// Console message (route back to sender's editor)
ipcMain.on('console-message', (event, {level, message}) => {
	const session = getSessionFromEvent(event);
	if(!session || !session.editorWindow || session.editorWindow.isDestroyed())
		return;

	session.editorWindow.webContents.send('csm', {level, message});
});

// Echoes
ipcMain.on('echo-save', () => sendSaveProject());
ipcMain.on('echo-build', (_event, {prompt, play}) => sendBuild({prompt, play}));

// Context menu (route action to that project’s editor + game)
ipcMain.on('ctx-menu', (event, {template, x, y}) => {
	const session = getSessionFromEvent(event);
	if(!session) return;

	template.forEach(t => {
		t.click = () => {
			if(session.editorWindow && !session.editorWindow.isDestroyed())
				session.editorWindow.webContents.send('ctx-menu-action', t.id);

			if(session.gameWindow && !session.gameWindow.isDestroyed())
				session.gameWindow.webContents.send('ctx-menu-action', t.id);
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

// Open project uri (from renderer)
ipcMain.on('open-project-uri', (_event, uri) => {
	openProject(uri);
});

// Tool windows (focused project)
ipcMain.on('open-tool-window', (_event, name) => {
	openToolWindow(name);
});

ipcMain.on('close-tool-window', (event, name) => {
	const session = getSessionFromEvent(event);
	if(!session) return;

	const w = session.toolWindows.get(name);
	if(w && !w.isDestroyed())
		w.close();
});

// Send message (to sender’s editor window)
ipcMain.on('send-message', (event, name, ...params) => {
	const session = getSessionFromEvent(event);
	if(!session || !session.editorWindow || session.editorWindow.isDestroyed())
		return;

	session.editorWindow.webContents.send('send-message', name, ...params);
});