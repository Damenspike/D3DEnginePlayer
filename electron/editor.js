const { 
	app, 
	BrowserWindow, 
	Menu, 
	dialog, 
	ipcMain, 
	nativeTheme, 
	screen
} = require('electron');
const path = require('path');
const pkg = require('../package.json');
const isDev = !app.isPackaged;

let editorDirty = false;
let startWindow;
let newProjectWindow;
let editorWindow;

let lastOpenedProjectUri;

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
		height: 400,
		resizable: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload-editor.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false
		}
	});

	newProjectWindow.loadFile('../src/windows/editor/editornew.html');

	newProjectWindow.on('closed', () => {
		newProjectWindow = null;
	});
	
	setupTheme(newProjectWindow);

	// Send initial theme
	newProjectWindow.webContents.on('did-finish-load', () => {
		newProjectWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
	});
}
async function createEditorWindow() {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	await closeEditorWindow();

	// Use safer prefs for the React/Vite editor window
	editorWindow = new BrowserWindow({
		title: 'Damen3D Editor',
		width,
		height,
		resizable: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload-editor.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false
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
			message: 'Save changes before closing?',
		});
	
		if(response === 0) {
			editorWindow.webContents.send('request-save-and-close');
		}else
		if (response === 1) {
			editorDirty = false;
			editorWindow.destroy();
		}
	});
	
	if(isDev)
		await editorWindow.loadURL('http://localhost:5173');
	else
		await editorWindow.loadFile('../dist/editor/main/index.html');

	setupTheme(editorWindow);
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
	
	await createEditorWindow();
}
function startNewProject() {
	if(!newProjectWindow) createNewProjectWindow()
	else newProjectWindow.show()
}
function sendDelete() {
	editorWindow.webContents.send('delete');
}
function sendUndo() {
	editorWindow.webContents.send('undo');
}
function sendRedo() {
	editorWindow.webContents.send('redo');
}
function sendAddObject(type) {
	editorWindow.webContents.send('add-object', type);
}
function sendSymboliseObject() {
	editorWindow.webContents.send('symbolise-object');
}
function sendDesymboliseObject() {
	editorWindow.webContents.send('desymbolise-object');
}
function sendFocusObject() {
	editorWindow.webContents.send('focus-object');
}
function sendSaveProject() {
	editorWindow.webContents.send('save-project');
}
function sendSetTool(type) {
	editorWindow.webContents.send('set-tool', type);
}
function sendSetTransformTool(type) {
	editorWindow.webContents.send('set-transform-tool', type);
}

// --- Menu ---
const isMac = process.platform === 'darwin';

const menuTemplate = [
	...(isMac ? [{
		label: app.productName,
		submenu: [
			{ role: 'about' },
			{ type: 'separator' },
			{ role: 'quit' }
		]
	}] : []),
	{
		label: 'File',
		submenu: [
			{
				label: 'New Project',
				accelerator: 'CmdOrCtrl+N',
				click: () => startNewProject()
			},
			{
				label: 'Open Project',
				accelerator: 'CmdOrCtrl+O',
				click: () => openBrowse()
			},
			{ type: 'separator' },
			{
				label: 'Save',
				accelerator: 'CmdOrCtrl+S',
				click: () => sendSaveProject()
			}
		]
	},
	{
		label: 'Edit',
		submenu: [
			{ 
				label: 'Undo',
				accelerator: 'CmdOrCtrl+Z',
				click: () => sendUndo()
			},
			{ 
				label: 'Redo',
				accelerator: 'CmdOrCtrl+Shift+Z',
				click: () => sendRedo()
			},
			{ type: 'separator' },
			{ role: 'cut' },
			{ role: 'copy' },
			{ role: 'paste' },
			{ 
				label: 'Delete',
				accelerator: process.platform === 'darwin' 
					? 'Backspace' : 'Delete',
				click: () => sendDelete()
			},
			{ type: 'separator' },
			{ role: 'selectall' }
		]
	},
	{
		label: 'Object',
		submenu: [
			{
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
					{
						label: 'HTML Overlay',
						click: () => sendAddObject('html')
					}
				]
			},
			{ type: 'separator' },
			{
				label: 'Focus',
				accelerator: 'F',
				click: () => sendFocusObject()
			},
			{
				label: 'Symbolise',
				accelerator: 'CmdOrCtrl+Shift+S',
				click: () => sendSymboliseObject()
			},
			{
				label: 'Desymbolise',
				accelerator: 'CmdOrCtrl+Shift+D',
				click: () => sendDesymboliseObject()
			}
		]
	},
	{
		label: 'Tools',
		submenu: [
			{
				label: 'Select',
				accelerator: 'v',
				click: () => {
					sendSetTool('select')
					sendSetTransformTool('translate')
				}
			},
			{
				label: 'Pan',
				accelerator: 'p',
				click: () => sendSetTool('pan')
			},
			{ type: 'separator' },
			{
				label: 'Translate',
				click: () => sendSetTransformTool('translate')
			},
			{
				label: 'Rotate',
				accelerator: 'r',
				click: () => sendSetTransformTool('rotate')
			},
			{
				label: 'Scale',
				accelerator: 's',
				click: () => sendSetTransformTool('scale')
			}
		]
	},
	{
		label: 'View',
		submenu: [
			{
				label: 'Toggle DevTools',
				accelerator: 'CmdOrCtrl+Shift+I',
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
			{ role: 'minimize' },
			{ role: 'zoom' },
			...(isMac
				? [
					{ type: 'separator' },
					{ role: 'front' },
					{ type: 'separator' },
					{ role: 'window' }
				]
				: []),
			{
				label: 'Close',
				accelerator: 'CmdOrCtrl+W',
				click: () => editorWindow.close()
			}
		]
	}
];

Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

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
	if (!startWindow) createStartWindow();
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

// Close editor
ipcMain.on('close-editor', () => closeEditorWindow());

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

// Show error dialog
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

// Update window size/title
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