// preload.js
const { contextBridge, ipcRenderer } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync } = require('fs');

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
	updateEditorStatus: (options) => ipcRenderer.send('editor-status', options),
	
	readAsFiles: async (paths) => {
		const files = [];
		for (const p of paths) {
			const buf = await fs.readFile(p);
			const name = path.basename(p);
			const file = new File([new Blob([buf])], name);
			files.push(file);
		}
		return files;
	},
	readFile: async (filePath) => {
		const ext = getExtension(filePath);
		
		if(ext != 'd3dproj')
			throw new Error('Could not read file of this type');
		
		const b64 = await fs.readFile(filePath);
		return Uint8Array.from(Buffer.from(b64, 'base64'));
	},
	echoSave: () => ipcRenderer.send('echo-save'),
	echoBuild: ({prompt, play}) => ipcRenderer.send('echo-build', {prompt, play}),
	saveProjectFile: async (uint8array, projectURI, showInFinder = false) => {
		if(!projectURI)
			throw new Error('Unknown project URI');
		
		const ext = getExtension(projectURI);
		
		if(ext != 'd3dproj' && ext != 'd3d')
			throw new Error(`Could not write project file of type ${ext}`);
		
		const buffer = Buffer.from(uint8array);
		const dir = path.dirname(projectURI);
		if (!existsSync(dir)) {
			throw new Error(`Save failed: directory does not exist: ${dir}`);
		}
		await fs.writeFile(projectURI, buffer);
		
		if (showInFinder) {
			// This works on macOS, Windows and Linux
			ipcRenderer.send('show-in-finder', projectURI);
		}
	},
	/*writeFile: async (filePath, data) => {
		const dir = path.dirname(filePath);
		const { existsSync } = require('fs');
		if (!existsSync(dir)) {
			throw new Error(`Save failed: directory does not exist: ${dir}`);
		}
		
		await fs.writeFile(filePath, data);
	},*/
	openPlayer: (uri) => ipcRenderer.send('open-player', uri),
	onConsoleMessage: ({level, message}) => 
		ipcRenderer.send('console-message', {level, message}),
	
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

addIPCListener('select-all');
addIPCListener('delete');
addIPCListener('undo');
addIPCListener('redo');
addIPCListener('dupe');
addIPCListener('edit-code');
addIPCListener('save-project');
addIPCListener('add-object');
addIPCListener('symbolise-object');
addIPCListener('desymbolise-object');
addIPCListener('focus-object');
addIPCListener('set-tool');
addIPCListener('set-transform-tool');
addIPCListener('new-asset');
addIPCListener('request-save-and-close');
addIPCListener('menu-import-assets');
addIPCListener('animate');
addIPCListener('csm');
addIPCListener('build');