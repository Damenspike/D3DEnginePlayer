// preload.js
const { contextBridge, ipcRenderer } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const vm = require('vm');

const events = {};
const fireEvent = (event, ...args) => events[event]?.(...args);
const addIPCListener = (name) => 
	ipcRenderer.on(name, (_, ...args) => fireEvent(name, ...args));

contextBridge.exposeInMainWorld('D3D', {
	setEventListener: (event, listener) => {
		events[event] = listener;
	},
	path: {
		join: (...parts) => path.join(...parts),
		dirname: (p) => path.dirname(p),
		basename: (p, ext) => path.basename(p, ext),
		extname: (p) => path.extname(p)
	},
	
	closeEditor: () => ipcRenderer.send('close-editor'),
	showError: ({title, message, closeEditorWhenDone}) => {
		ipcRenderer.send('show-error', {
			title: String(title) || 'Error',
			message: String(message) || '',
			closeEditorWhenDone: !!closeEditorWhenDone
		});
	},
	saveProject: async (targetPath, buffer) => {
		const b64 = Buffer.from(buffer).toString('base64');
		return ipcRenderer.invoke('project:save', { targetPath, bufferBase64: b64 });
	},
	startNewProject: () => ipcRenderer.invoke('new-project'),
	openProjectDialog: () => ipcRenderer.invoke('open-project'),
	setDirty: (dirty) => ipcRenderer.send('set-dirty', !!dirty),
	getCurrentProjectURI: () => ipcRenderer.invoke('get-current-project-uri'),
	updateEditorWindow: (options) => ipcRenderer.send('update-editor-window', options),
	
	readFile: async (filePath) => {
		const b64 = await fs.readFile(filePath);
		return Uint8Array.from(Buffer.from(b64, 'base64'));
	},
	writeFile: async (filePath, data) => {
		const dir = path.dirname(filePath);
		const { existsSync } = require('fs');
		if (!existsSync(dir)) {
			throw new Error(`Save failed: directory does not exist: ${dir}`);
		}
		
		await fs.writeFile(filePath, data);
	},
	
	theme: {
		get: () => ipcRenderer.invoke('get-theme'),
		onChange: (listener) => {
			const handler = (_, t) => listener(t);
			ipcRenderer.on('theme-changed', handler);
			return () => ipcRenderer.removeListener('theme-changed', handler);
		}
	},
	
	updateWindow: () => null, // player only
});

addIPCListener('delete');
addIPCListener('undo');
addIPCListener('redo');
addIPCListener('save-project');
addIPCListener('add-object');
addIPCListener('symbolise-object');
addIPCListener('desymbolise-object');
addIPCListener('focus-object');