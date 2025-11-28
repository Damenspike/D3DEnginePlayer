// preload.js
const { contextBridge, ipcRenderer, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const events = {};
const fireEvent = (event, ...args) => events[event]?.(...args);
const addIPCListener = (name) => 
	ipcRenderer.on(name, (_, ...args) => fireEvent(name, ...args));

contextBridge.exposeInMainWorld('D3D', {
	setEventListener: (event, listener) => {
		events[event] = listener;
	},
	invoke: (event, ...params) => {
		events[event]?.(...params);
	},
	path: {
		join: (...parts) => path.join(...parts),
		dirname: (p) => path.dirname(p),
		basename: (p, ext) => path.basename(p, ext),
		extname: (p) => path.extname(p)
	},
	
	readFile: async (filePath) => {
		const ext = getExtension(filePath);
	
		if(ext !== 'd3d')
			throw new Error('Could not read file of this type');
	
		const buf = await fs.readFile(filePath); 
		return new Uint8Array(buf);
	},
	
	getCurrentGameURI: () => ipcRenderer.invoke('get-current-game-uri'),
	getPlayerVersion: () => ipcRenderer.invoke('get-player-version'),
	closeGameWindow: () => ipcRenderer.send('close-game-window'),
	showError: ({title, message, closeEditorWhenDone}) => {
		ipcRenderer.send('show-error', {
			title: String(title) || 'Error',
			message: String(message) || '',
			closeEditorWhenDone: !!closeEditorWhenDone
		});
	},
	showConfirm: ({title, message}) => {
		return ipcRenderer.invoke('show-confirm', {
			title: String(title),
			message: String(message)
		});
	},
	
	browseD3D: async () => {
		const filePath = await ipcRenderer.invoke('browse-d3d');
		return filePath;
	},
	openD3DFile: (uri) => {
		ipcRenderer.send('open-d3d', uri);
	},
	getTheme: async () => {
		const theme = await ipcRenderer.invoke('get-theme');
		return theme;
	},
	loadD3D: (uri) => ipcRenderer.send('load-d3d', uri),
	closePlayer: () => ipcRenderer.send('close-game-window'),
	onConsoleMessage: ({level, message}) => 
		ipcRenderer.send('console-message', {level, message}),
	openContextMenu: ({template, x, y, onClose}) => 
		ipcRenderer.send('ctx-menu', {template, x, y}),
	openWebsite: () => shell.openExternal('https://damen3d.com/?origin=player'),
	
	theme: {
		get: () => ipcRenderer.invoke('get-theme'),
		onChange: (listener) => {
			const handler = (_, t) => listener(t);
			ipcRenderer.on('theme-changed', handler);
			return () => ipcRenderer.removeListener('theme-changed', handler);
		}
	},
	
	updateWindow: (opts) => ipcRenderer.send('update-window', opts), // player only
});

function getExtension(path) {
	const lastDot = path.lastIndexOf('.');
	if (lastDot === -1) 
		return '';
	
	return path.slice(lastDot + 1).toLowerCase();
}

addIPCListener('theme-changed');
addIPCListener('ctx-menu-action');
addIPCListener('ctx-menu-close');