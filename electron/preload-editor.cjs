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
	showConfirm: ({title, message}) => {
		return ipcRenderer.invoke('show-confirm', {
			title: String(title),
			message: String(message)
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
		const ext = getExtension(filePath);
		
		if(ext != 'd3dproj')
			throw new Error('Could not read file of this type');
		
		const b64 = await fs.readFile(filePath);
		return Uint8Array.from(Buffer.from(b64, 'base64'));
	},
	saveProjectFile: async (uint8array) => {
		const projectURI = await ipcRenderer.invoke('get-current-project-uri');
		
		if(!projectURI)
			throw new Error('Unknown project URI');
		
		const ext = getExtension(projectURI);
		
		if(ext != 'd3dproj')
			throw new Error(`Could not write project file of type ${ext}`);
		
		const buffer = Buffer.from(uint8array);
		const dir = path.dirname(projectURI);
		const { existsSync } = require('fs');
		if (!existsSync(dir)) {
			throw new Error(`Save failed: directory does not exist: ${dir}`);
		}
		await fs.writeFile(projectURI, buffer);
	},
	/*writeFile: async (filePath, data) => {
		const dir = path.dirname(filePath);
		const { existsSync } = require('fs');
		if (!existsSync(dir)) {
			throw new Error(`Save failed: directory does not exist: ${dir}`);
		}
		
		await fs.writeFile(filePath, data);
	},*/
	
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

function getExtension(path) {
	const lastDot = path.lastIndexOf('.');
	if (lastDot === -1) 
		return '';
	
	return path.slice(lastDot + 1).toLowerCase();
}

addIPCListener('delete');
addIPCListener('undo');
addIPCListener('redo');
addIPCListener('save-project');
addIPCListener('add-object');
addIPCListener('symbolise-object');
addIPCListener('desymbolise-object');
addIPCListener('focus-object');
addIPCListener('set-tool');
addIPCListener('set-transform-tool');
addIPCListener('new-asset');
addIPCListener('request-save-and-close');