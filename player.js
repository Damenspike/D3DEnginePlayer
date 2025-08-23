const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme } = require('electron');
const path = require('path');

let startWindow;
let gameWindow;
let gameURI;

function createStartWindow() {
	startWindow = new BrowserWindow({
		width: 500,
		height: 300,
		resizable: false,
		titleBarStyle: 'hidden',
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			nodeIntegration: true,
			contextIsolation: false
		}
	});

	startWindow.loadFile('src/windows/player/playerstart.html');

	startWindow.on('closed', () => {
		startWindow = null;
	});

	// Send initial theme
	startWindow.webContents.on('did-finish-load', () => {
		startWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
	});

	// React to theme changes
	nativeTheme.on('updated', () => {
		if (startWindow) {
			startWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
		}
	});
}

function createGameWindow() {
	gameWindow = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			nodeIntegration: true,
			contextIsolation: false
		}
	});

	gameWindow.loadFile('src/windows/player/player.html');

	gameWindow.on('closed', () => {
		gameWindow = null;
	});

	return gameWindow.webContents;
}

function loadGameURI(uri) {
	console.log('Loading game URI:', uri);
	gameURI = uri;

	// Destroy existing game window if present
	if (gameWindow && !gameWindow.isDestroyed()) {
		gameWindow.destroy();
	}

	// Create new game window and send URI once loaded
	const gameWebContents = createGameWindow();
	gameWebContents.once('did-finish-load', () => {
		gameWebContents.send('d3d-load', uri);
	});
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
				label: 'Open',
				accelerator: 'CmdOrCtrl+O',
				click: () => {
					if (!startWindow) createStartWindow();
					else startWindow.show();
				}
			},
			{
				label: 'Reload',
				accelerator: 'Shift+CmdOrCtrl+R',
				click: () => {
					if (gameURI) loadGameURI(gameURI);
				}
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

// Browse D3D
ipcMain.handle('browse-d3d', async () => {
	const { canceled, filePaths } = await dialog.showOpenDialog({
		title: 'Select a D3D File',
		filters: [{ name: 'Damen3D Files', extensions: ['d3d'] }],
		properties: ['openFile']
	});
	if (canceled || filePaths.length === 0) return null;
	return filePaths[0];
});

// Load D3D
ipcMain.on('load-d3d', (_, uri) => loadGameURI(uri));

// Update window size/title
ipcMain.on('update-window', (_, { width, height, title }) => {
	if (gameWindow && !gameWindow.isDestroyed()) {
		gameWindow.setSize(width, height);
		gameWindow.setTitle(title);
	}
});

// Close game window
ipcMain.on('close-game-window', () => {
	if (gameWindow && !gameWindow.isDestroyed()) gameWindow.destroy();
});

// Show error dialog
ipcMain.on('show-error', async (_, { title, message }) => {
	const focused = BrowserWindow.getFocusedWindow();
	if (!focused) return;
	await dialog.showMessageBox(focused, {
		type: 'error',
		title: title || 'Error',
		message: message || 'Unknown error',
		buttons: ['OK']
	});
});