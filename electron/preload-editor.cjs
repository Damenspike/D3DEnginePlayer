// preload.js
const { contextBridge, ipcRenderer } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const JSZip = require('jszip');
const { existsSync } = require('fs');

const events = {};
const fireEvent = (event, ...args) => events[event]?.(...args);
const addIPCListener = (name) => 
	ipcRenderer.on(name, (_, ...args) => fireEvent(name, ...args));
const showError = ({title, message, closeEditorWhenDone}) => {
	ipcRenderer.send('show-error', {
		title: String(title) || 'Error',
		message: String(message) || '',
		closeEditorWhenDone: !!closeEditorWhenDone
	});
}
const showConfirm = ({title, message}) => {
	return ipcRenderer.invoke('show-confirm', {
		title: String(title),
		message: String(message)
	});
}

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
	showError: showError,
	showConfirm: showConfirm,
	saveProject: async (targetPath, buffer) => {
		const b64 = Buffer.from(buffer).toString('base64');
		return ipcRenderer.invoke('project:save', { targetPath, bufferBase64: b64 });
	},
	startNewProject: () => ipcRenderer.invoke('new-project'),
	openProjectDialog: () => ipcRenderer.invoke('open-project'),
	openProject: (uri) => ipcRenderer.send('open-project-uri', uri),
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
		
		const data = await fs.readFile(filePath);
		return Uint8Array.from(Buffer.from(data, 'base64'));
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
	openContextMenu: ({template, x, y}) => 
		ipcRenderer.send('ctx-menu', {template, x, y}),
	createNewProject: async ({ name, author, width, height, closeNewWindow, onComplete }) => {
		try {
			if (!name || !name.trim()) {
				return showError('Project must have a name');
			}
			
			author = typeof author === 'string' ? author : '';
			
			let w = Number(width);
			let h = Number(height);
			
			if (!Number.isFinite(w)) 
				return showError('Invalid width');
			if (!Number.isFinite(h)) 
				return showError('Invalid height');
			
			w = Math.max(10, Math.round(w));
			h = Math.max(10, Math.round(h));
			
			// --- load template .d3dproj ---
			const tplPath = await resolveTemplatePath();
			const data = await fs.readFile(tplPath); // Buffer
			const zip = await JSZip.loadAsync(data);
			
			const manifestPath = 'manifest.json';
			const hasManifest = !!zip.file(manifestPath);
			
			const manifestStr = await zip.file(manifestPath).async('string');
			let manifest = {};
			try { manifest = JSON.parse(manifestStr); } catch {
				console.warn('Template manifest is invalid JSON');
			}
			manifest.name = name.trim();
			manifest.author = author;
			manifest.width = w;
			manifest.height = h;
			
			zip.file(manifestPath, JSON.stringify(manifest, null, 2));
			
			const outBuf = await zip.generateAsync({
				type: 'nodebuffer', 
				compression: 'DEFLATE' 
			});
			const saveTo = await ipcRenderer.invoke('show-save-dialog', {
				title: 'Save New Project',
				defaultPath: `${name}.d3dproj`,
				filters: [{ name: 'D3D Project', extensions: ['d3dproj'] }]
			});
			if (!saveTo || saveTo.canceled || !saveTo.filePath) {
				return; // user cancelled
			}
			
			await fs.writeFile(saveTo.filePath, outBuf);
			
			if(closeNewWindow) {
				ipcRenderer.send('close-new-proj-window');
			}
			
			onComplete({ 
				path: saveTo.filePath, name, author, width: w, height: h 
			});
		} catch (err) {
			console.error(err);
			showError('Failed to create project');
		}
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

function getExtension(path) {
	const lastDot = path.lastIndexOf('.');
	if (lastDot === -1) 
		return '';
	
	return path.slice(lastDot + 1).toLowerCase();
}

async function resolveTemplatePath() {
	// Prefer asking the main process (works in dev & prod)
	try {
		const p = await ipcRenderer.invoke('resolve-template-path', 'public/engine/newproject.d3dproj');
		if (p) return p;
	} catch {}
	// Fallbacks (dev)
	return path.join(__dirname, '..', 'public', 'engine', 'newproject.d3dproj');
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
addIPCListener('add-component');
addIPCListener('csm');
addIPCListener('build');
addIPCListener('copy-special');
addIPCListener('paste-special');
addIPCListener('group');
addIPCListener('ungroup');
addIPCListener('merge');
addIPCListener('ctx-menu-action');