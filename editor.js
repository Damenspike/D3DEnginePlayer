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
const pkg = require('./package.json');

let startWindow;
let newProjectWindow;
let editorWindow;

function createStartWindow() {
	startWindow = new BrowserWindow({
		title: 'Damen3D Editor',
		width: 400,
		height: 250,
		resizable: false,
		titleBarStyle: 'hidden',
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			nodeIntegration: true,
			contextIsolation: false
		}
	});

	startWindow.loadFile('src/windows/editor/editorstart.html');

	startWindow.on('closed', () => {
		startWindow = null;
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
			preload: path.join(__dirname, 'preload.js'),
			nodeIntegration: true,
			contextIsolation: false
		}
	});

	newProjectWindow.loadFile('src/windows/editor/editornew.html');

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

	// Wait for previous window to close if it exists
	await closeEditorWindow();
	
	editorWindow = new BrowserWindow({
		title: 'Damen3D Editor',
		width: width,
		height: height,
		resizable: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			nodeIntegration: true,
			contextIsolation: false
		}
	});

	editorWindow.loadFile('src/windows/editor/editor.html');

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
	await createEditorWindow();
	
	editorWindow.webContents.send(
		'd3dproj-load',
		uri
	);
}
function startNewProject() {
	if(!newProjectWindow) createNewProjectWindow()
	else newProjectWindow.show()
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
				click: () => null
			}
		]
	},

	{
		label: 'Edit',
		submenu: [
			{ role: 'undo' },
			{ role: 'redo' },
			{ type: 'separator' },
			{ role: 'cut' },
			{ role: 'copy' },
			{ role: 'paste' },
			{ type: 'separator' },
			{ role: 'selectall' }
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

// Close editor
ipcMain.on('close-editor', () => closeEditorWindow());

// Show error dialog
ipcMain.on('show-error', async (event, { title, message, closeEditorWhenDone }) => {
	const focused = BrowserWindow.getFocusedWindow();
	if (!focused) return;
	await dialog.showMessageBox(focused, {
		type: 'error',
		title: title || 'Error',
		message: message || 'Unknown error',
		buttons: ['OK']
	});
	
	event.reply('show-error-closed', closeEditorWhenDone);
});

// Update window size/title
ipcMain.on('update-editor-window', (_, { width, height, title }) => {
	if (editorWindow && !editorWindow.isDestroyed()) {
		if(width && height)
			editorWindow.setSize(width, height);
		
		editorWindow.setTitle(`${title} - Damen3D Editor ${pkg.editorVersion}`);
	}
});