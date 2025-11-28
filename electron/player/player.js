const { 
	app, 
	BrowserWindow, 
	Menu, 
	dialog, 
	ipcMain, 
	nativeTheme,
	shell 
} = require('electron');
const path = require('path');
const fs = require('fs');
const pkg = require('../../package.json');
const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';

let startWindow;
let gameWindow;
let gameURI;
let customPlayer = false;
let pendingFile;

function resolvePath(...segments) {
	// In prod, app.getAppPath() points inside app.asar
	const base = app.getAppPath();
	return path.join(base, ...segments);
}
function getFileFromArgv(argv) {
	return argv.find(arg => /\.d3d$/i.test(arg));
}

async function start() {
	setupAbout();
	const gamePath = findGamePath(); // for custom builds
	
	if(gamePath) {
		customPlayer = true;
		loadGameURI(gamePath);
		return;
	}
	if(pendingFile) {
		openGameURI(pendingFile);
		pendingFile = null;
	}else{
		createStartWindow();
	}
	
	try {
		const res = await fetch(`https://damen3d.com/api/v1/splash.php?origin=player&v=${pkg.playerVersion}&theme=${nativeTheme.shouldUseDarkColors ? 'dark' : 'light'}`);
		
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
		applicationName: 'Damen3D Player',
		applicationVersion: pkg.playerVersion,
		
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
		width: isMac ? 480 : 490,
		height: isMac ? 170 : 180,
		resizable: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload-player.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false
		}
	});
	
	if (isDev) {
		await startWindow.loadURL('http://localhost:5174/playerstart.html');
	} else {
		await startWindow.loadFile(resolvePath('dist', 'player', 'playerstart.html'));
	}

	startWindow.on('closed', () => {
		startWindow = null;
	});
	
	if(!isMac)
		startWindow.setMenu(null);

	// Send initial theme
	startWindow.webContents.on('did-finish-load', () => {
		startWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
	});

	// React to theme changes
	nativeTheme.on('updated', () => {
		[ startWindow, gameWindow ].forEach(win => {
			if (win && !win.isDestroyed()) {
				win.webContents.send(
					'theme-changed',
					nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
				);
			}
		});
	});
}

async function createGameWindow() {
	gameWindow = new BrowserWindow({
		useContentSize: true,
		width: 800,
		height: 600,
		webPreferences: {
			preload: path.join(__dirname, 'preload-player.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			enableRemoteModule: false,
			sandbox: false
		}
	});

	if(isDev)
		await gameWindow.loadURL('http://localhost:5174');
	else
		await gameWindow.loadFile(resolvePath('dist', 'player', 'index.html'));
	
	gameWindow.on('closed', () => { 
		gameWindow = null;
		
		if(!customPlayer) {
			if (!startWindow) createStartWindow();
			else startWindow.show();
		}
	});
}
function findGamePath() {
	// When packaged:
	// - macOS:   MyGame.app/Contents/Resources
	// - Windows: MyGame/resources
	// - Linux:   MyGame/resources
	const resources = process.resourcesPath;
	
	const gamePath = path.join(resources, 'game.d3d');
	
	if (fs.existsSync(gamePath))
		return gamePath;
}

async function openGameURI(uri) {
	await loadGameURI(uri);
	
	// Close existing start window if present
	if (startWindow && !startWindow.isDestroyed()) {
		startWindow.close();
	}
}

async function loadGameURI(uri) {
	console.log('Loading game URI:', uri);
	gameURI = uri;
	
	// Destroy existing game window if present
	if (gameWindow && !gameWindow.isDestroyed()) {
		gameWindow.destroy();
	}
	
	await createGameWindow();
}

function closeGameWindow() {
	if (gameWindow && !gameWindow.isDestroyed()) 
		gameWindow.destroy();
}

// --- Menu ---
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

	...(isDev ? [{
		label: 'Toggle DevTools',
		accelerator: 'Alt+Cmd+I',
		click: (_, browserWindow) => {
			if (browserWindow)
				browserWindow.webContents.toggleDevTools();
		}
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
	},
	{
		label: 'Help',
		role: 'help',
		submenu: [
			{
				label: 'Damen3D Engine Help',
				click: () => shell.openExternal('https://damen3d.com/help?origin=player-help')
			},
			{
				label: 'Make Your Own Game',
				click: () => shell.openExternal('https://damen3d.com/')
			}
		]
	}
];

Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

// --- App events ---
if (!isMac) {
	const gotLock = app.requestSingleInstanceLock();
	
	if (!gotLock) {
		app.quit();
	} else {
		// second instance (already running)
		app.on('second-instance', (event, argv, workingDirectory) => {
			const filePath = getFileFromArgv(argv);
			if (!filePath) return;
			
			if (app.isReady()) {
				openGameURI(filePath);
			} else {
				pendingFile = filePath;
			}
		});

		// first instance (cold start)
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
		openGameURI(filePath);
	}else{
		pendingFile = filePath;
	}
});
app.on('window-all-closed', () => {
	app.quit();
});
app.on('activate', () => {
	if (!customPlayer && !startWindow) 
		createStartWindow();
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

// Open D3D (from start window)
ipcMain.on('open-d3d', (_, uri) => openGameURI(uri));

// Load D3D
ipcMain.on('load-d3d', (_, uri) => loadGameURI(uri));

// Get player version
ipcMain.handle('get-player-version', () => pkg.playerVersion);

// Update window size/title
ipcMain.on('update-window', (_, { width, height, title }) => {
	if (gameWindow && !gameWindow.isDestroyed()) {
		gameWindow.setContentSize(width, height);
		gameWindow.setTitle(title);
	}
});

// Close game window
ipcMain.on('close-game-window', () => {
	if (gameWindow && !gameWindow.isDestroyed()) 
		gameWindow.destroy();
});

// Show error dialog
ipcMain.on('show-error', async (_, { title, message, closeGameWhenDone }) => {
	const focused = BrowserWindow.getFocusedWindow();
	if (!focused) return;
	await dialog.showMessageBox(focused, {
		type: 'error',
		title: title || 'Error',
		message: message || 'Unknown error',
		buttons: ['OK']
	});
	
	if(closeGameWhenDone)
		closeGameWindow();
});

// Right click menus
ipcMain.on('ctx-menu', (event, {template, x, y}) => {
	template.forEach(t => {
		t.click = () => gameWindow.webContents.send('ctx-menu-action', t.id);
	});
	
	const menu = Menu.buildFromTemplate(template);
	const bw = BrowserWindow.fromWebContents(event.sender);
	
	menu.popup({ 
		window: bw, 
		x, y, 
		callback: () => event.sender.send('ctx-menu-close')
	});
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

// Get game URI
ipcMain.handle('get-current-game-uri', () => gameURI);