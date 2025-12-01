// preload.js
const { contextBridge, ipcRenderer, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { publishProject } = require('./editor-publish.js');
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
const showConfirm = async ({title, message}) => {
	return await ipcRenderer.invoke('show-confirm', {
		title: String(title),
		message: String(message)
	});
}

const MAX_D3D_MB = 500;

contextBridge.exposeInMainWorld('D3D', {
	setEventListener: (event, listener) => {
		events[event] = listener;
	},
	invoke: (event, ...params) => {
		events[event]?.(...params);
	},
	sendMessage: (name, ...params) => {
		ipcRenderer.send('send-message', name, ...params);
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
	getEditorVersion: () => ipcRenderer.invoke('get-editor-version'),
	updateEditorWindow: (options) => ipcRenderer.send('update-editor-window', options),
	updateEditorStatus: (options) => ipcRenderer.send('editor-status', options),
	openWebsite: () => shell.openExternal('https://damen3d.com/?origin=editor'),
	
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
	
		if(ext !== 'd3dproj') {
			showError({
				title: 'Open Project',
				message: `Could not open file of this type`,
				closeEditorWhenDone: true
			});
			return;
		}
	
		const buf = await fs.readFile(filePath); 
		return new Uint8Array(buf);
	},
	echoSave: () => ipcRenderer.send('echo-save'),
	echoBuild: ({prompt, play}) => ipcRenderer.send('echo-build', {prompt, play}),
	saveProjectFile: async (data, projectURI, showInFinder = false) => {
		if (!projectURI)
			throw new Error('Unknown project URI');
		
		const ext = getExtension(projectURI);
		
		if(ext != 'd3dproj' && ext != 'd3d')
			throw new Error(`Could not write project file of type ${ext}`);
		
		// Normalize to Uint8Array
		let uint8array;
		if(data instanceof Uint8Array) {
			uint8array = data;
		}else
		if(data instanceof ArrayBuffer) {
			uint8array = new Uint8Array(data);
		}else{
			throw new Error('saveProjectFile expects Uint8Array or ArrayBuffer');
		}
		
		const buildMB = uint8array.byteLength / 1024 / 1024;
		if(ext === 'd3d' && buildMB > MAX_D3D_MB) {
			const ok = await showConfirm({
				title: 'Build Size',
				message: `Your d3d file size of ${buildMB} MB exceeds the recommended maximum build size of ${MAX_D3D_MB} MB. It is recommended to split your d3d files into chunks and stream them in. Are you sure you want to continue?`
			});
			if (!ok)
				return;
		}
		
		const dir = path.dirname(projectURI);
		
		if(!existsSync(dir))
			throw new Error(`Save failed: directory does not exist: ${dir}`);
		
		await fs.writeFile(projectURI, uint8array);
		
		if(showInFinder) {
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
	openContextMenu: ({template, x, y, onClose}) => 
		ipcRenderer.send('ctx-menu', {template, x, y}),
	createNewProject: async ({ 
		name, 
		author, 
		width, 
		height, 
		template, 
		closeNewWindow, 
		onComplete, 
		jszipCreateProject
	}) => {
		try {
			const showErrorMessage = (msg) => showError({ title: 'New Project', message: msg });
	
			if (!name || !name.trim()) {
				return showErrorMessage('Project must have a name');
			}
	
			author = typeof author === 'string' ? author : '';
	
			let w = Number(width);
			let h = Number(height);
	
			if (!Number.isFinite(w) || !w)
				return showErrorMessage('Invalid width');
			if (!Number.isFinite(h) || !h)
				return showErrorMessage('Invalid height');
	
			w = Math.max(10, Math.round(w));
			h = Math.max(10, Math.round(h));
	
			// --- template selection ---
			let templateName = 'newproject';
			switch (template) {
				case 'aviation':
				case 'waddle':
				case 'snail':
				case 'car':
					templateName = template;
					break;
			}
	
			// --- resolve template path (still done in preload) ---
			const tplPath = await resolveTemplatePath(templateName);
	
			if (!tplPath) {
				return showErrorMessage(
					'Could not find template. You may need to re-install. Location: ' + tplPath
				);
			}
	
			if (typeof jszipCreateProject !== 'function') {
				return showErrorMessage('Internal error: ZIP handler is missing.');
			}
	
			// --- read template on the Node side ---
			let data;
			try {
				data = await fs.readFile(tplPath); // Buffer
			} catch (e) {
				console.error(e);
				return showErrorMessage('Template could not be read. ' + tplPath);
			}
	
			// --- delegate ALL JSZip logic to the renderer via callback ---
			let outArr;
			try {
				outArr = await jszipCreateProject({
					data: new Uint8Array(data), // send a typed array over the bridge
					name: name.trim(),
					author,
					width: w,
					height: h
				});
			} catch (e) {
				console.error(e);
				return showErrorMessage(
					e && e.message ? e.message : 'Template processing failed.'
				);
			}
	
			if (!outArr || !outArr.length) {
				return showErrorMessage('Template processing returned empty data.');
			}
	
			const outBuf = Buffer.from(outArr);
	
			// --- save dialog still on the Node side ---
			const saveTo = await ipcRenderer.invoke('show-save-dialog', {
				title: 'Save New Project',
				defaultPath: `${name}.d3dproj`,
				filters: [{ name: 'D3D Project', extensions: ['d3dproj'] }]
			});
			if (!saveTo || saveTo.canceled || !saveTo.filePath) {
				return; // user cancelled
			}
	
			await fs.writeFile(saveTo.filePath, outBuf);
	
			if (typeof onComplete === 'function') {
				onComplete({
					path: saveTo.filePath,
					name: name.trim(),
					author,
					width: w,
					height: h
				});
			}
			
			if (closeNewWindow) {
				ipcRenderer.send('close-new-proj-window');
			}
		} catch (err) {
			console.error(err);
			showError({ title: 'New Project', message: 'Failed to create project. ' + err.toString() });
		}
	},
	publishProject: (...args) => publishProject(resolveProjectorPath, onPublishDone, ...args),
	resolveEngineScriptPath: resolveEngineScriptPath,
	resolveProjectorPath: resolveProjectorPath,
	getEditorInFocus: () => document.hasFocus(),
	exportMultipleFiles: (files) => ipcRenderer.invoke('export-multiple-files', files),
	openToolWindow: (name) => ipcRenderer.send('open-tool-window', name),
	closeToolWindow: (name) => ipcRenderer.send('close-tool-window', name),
	
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

async function resolveProjectorPath(platform, arch) {
	let playerName;
	
	if(platform == 'linux')
		playerName = 'CustomPlayer';
	else
	if(platform == 'mac')
		playerName = 'CustomPlayer.app';
	else
	if(platform == 'win')
		playerName = 'CustomPlayer';
	else
		return;
	
	// Try production first
	const p = await ipcRenderer.invoke('resolve-path', 
	'dist', 'editor', 'projectors', platform, arch, playerName);
	
	if (p) 
		return p;
	
	// Fallbacks (dev)
	return path.join(__dirname, '..', '..', 'public', 'engine', 'projectors', platform, playerName);
}
async function resolveTemplatePath(templateName = 'newproject') {
	// Try production first
	const p = await ipcRenderer.invoke('resolve-path', 
	'dist', 'editor', 'engine', 'templates', `${templateName}.d3dproj`);
	
	if (p) 
		return p;
	
	// Fallbacks (dev)
	return path.join(__dirname, '..', '..', 'public', 'engine', 'templates', `${templateName}.d3dproj`);
}
async function resolveEngineScriptPath(scriptName) {
	// Try production first
	const p = await ipcRenderer.invoke('resolve-path', 
	'dist', 'editor', 'engine', 'scripts', encodeURIComponent(scriptName));
	
	if (p) 
		return p;
	
	// Fallbacks (dev)
	return path.join(__dirname, '..', '..', 'public', 'engine', 'scripts', encodeURIComponent(scriptName));
}
function onPublishDone(publishURI) {
	ipcRenderer.send('show-in-finder', publishURI);
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
addIPCListener('new-folder');
addIPCListener('new-asset');
addIPCListener('request-save-and-close');
addIPCListener('menu-import-assets');
addIPCListener('add-component');
addIPCListener('csm');
addIPCListener('build');
addIPCListener('publish');
addIPCListener('copy-special');
addIPCListener('paste-special');
addIPCListener('group');
addIPCListener('ungroup');
addIPCListener('merge');
addIPCListener('ctx-menu-action');
addIPCListener('ctx-menu-close');
addIPCListener('move-sel-view');
addIPCListener('align-sel-view');
addIPCListener('drop-to-ground');
addIPCListener('zoom-step');
addIPCListener('reset-view');
addIPCListener('menu-export-assets');
addIPCListener('export-as-d3d');
addIPCListener('export-as-d3dproj');
addIPCListener('send-message');