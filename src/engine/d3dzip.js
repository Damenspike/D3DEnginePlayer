// d3dzip.js
import JSZipReal from 'jszip';

/* =========================
   Main-thread proxy
   ========================= */

function u8ToTightArrayBuffer(u8) {
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function toArrayBuffer(data) {
	if(data instanceof ArrayBuffer) return data;
	if(data instanceof Uint8Array) return u8ToTightArrayBuffer(data);
	if(data?.buffer instanceof ArrayBuffer) return data.buffer;
	throw new Error('Expected ArrayBuffer or Uint8Array');
}

class ZipEntryProxy {
	constructor(zip, name) {
		this._zip = zip;
		this.name = name;
	}

	get dir() {
		return !!this._zip._meta.get(this.name)?.dir;
	}

	get date() {
		const ms = this._zip._meta.get(this.name)?.date || 0;
		return ms ? new Date(ms) : undefined;
	}

	get comment() {
		return this._zip._meta.get(this.name)?.comment || '';
	}

	async async(type) {
		return this._zip._read(this.name, type);
	}
}

// folder() returns a scoped JSZip view; files are shared, only root/prefix changes.  [oai_citation:2‡Stuk](https://stuk.github.io/jszip/documentation/examples.html?utm_source=chatgpt.com)
class FolderProxy {
	constructor(zip, base) {
		this._zip = zip;
		this._base = base; // '' or endsWith('/')
	}

	get files() {
		// JSZip folder view shares the same files map (just a view)
		return this._zip.files;
	}

	folder(name) {
		return this._zip.folder(this._base + name);
	}

	file(name, data, options) {
		return this._zip.file(this._base + name, data, options);
	}

	remove(name) {
		return this._zip.remove(this._base + name);
	}

	forEach(cb) {
		// JSZip forEach iterates all files in the instance view; this view is root-scoped.
		// We emulate by filtering on prefix.
		const base = this._base;
		for(const k of this._zip._meta.keys()) {
			if(!base || k.startsWith(base))
				cb(k, new ZipEntryProxy(this._zip, k));
		}
	}

	async generateAsync(options) {
		return this._zip.generateAsync(options);
	}
}

class ZipProxy {
	constructor() {
		this._worker = new Worker(
			new URL('./d3dzip.worker.js', import.meta.url),
			{ type: 'module' }
		);
		this._id = 1;
		this._pending = new Map();

		// authoritative meta store (name -> {dir,date,comment})
		this._meta = new Map();

		// ordered mutation queue (critical so folder moves/renames don’t race generate)
		this._ops = Promise.resolve();

		// JSZip-compatible `files` object (ZipObject map)
		this.files = this._makeFilesProxy();

		this._worker.onmessage = e => {
			const { id, ok, data, error } = e.data || {};
			const p = this._pending.get(id);
			if(!p) return;
			this._pending.delete(id);
			ok ? p.resolve(data) : p.reject(new Error(error));
		};

		this._worker.onerror = err => {
			for(const p of this._pending.values())
				p.reject(err);
			this._pending.clear();
		};
	}

	_makeFilesProxy() {
		const self = this;

		// This is the key: zip.files[path] must be a ZipObject-like thing with .async/.dir/etc.
		return new Proxy(Object.create(null), {
			get(_t, prop) {
				if(typeof prop !== 'string') return undefined;
				if(!self._meta.has(prop)) return undefined;
				return new ZipEntryProxy(self, prop);
			},
			has(_t, prop) {
				return (typeof prop === 'string') && self._meta.has(prop);
			},
			ownKeys() {
				return Array.from(self._meta.keys());
			},
			getOwnPropertyDescriptor(_t, prop) {
				if(typeof prop !== 'string') return undefined;
				if(!self._meta.has(prop)) return undefined;
				return { enumerable: true, configurable: true };
			},
			set() {
				// Don't allow external assignment to zip.files; JSZip doesn't expect that.
				return false;
			}
		});
	}

	_req(type, payload = {}, transfer) {
		const id = this._id++;
		return new Promise((resolve, reject) => {
			this._pending.set(id, { resolve, reject });
			this._worker.postMessage({ id, type, ...payload }, transfer || []);
		});
	}

	_enqueue(fn) {
		this._ops = this._ops.then(fn, fn);
		return this._ops;
	}

	async init(buffer) {
		const ab = toArrayBuffer(buffer);
		await this._req('init', { buffer: ab }, [ab]);

		const list = await this._req('list');
		this._meta.clear();
		for(const f of list) {
			this._meta.set(f.name, {
				dir: !!f.dir,
				date: f.date || 0,
				comment: f.comment || ''
			});
		}
	}

	/* ===== JSZip-like API ===== */

	// JSZip: file(name) -> ZipObject | null  [oai_citation:3‡Stuk](https://stuk.github.io/jszip/documentation/api_jszip/file_name.html?utm_source=chatgpt.com)
	// JSZip: file(name, data, options) -> this  [oai_citation:4‡Stuk](https://stuk.github.io/jszip/documentation/api_jszip/file_data.html?utm_source=chatgpt.com)
	file(name, data, options) {
		// READ
		if(data === undefined) {
			if(!this._meta.has(name)) return null;
			return new ZipEntryProxy(this, name);
		}

		const opts = options || {};
		const isDir = !!opts.dir || (typeof name === 'string' && name.endsWith('/'));

		// Normalize dir naming: dirs always end with '/'
		const finalName = isDir && !name.endsWith('/') ? (name + '/') : name;

		// Mirror immediately
		this._meta.set(finalName, {
			dir: isDir,
			date: opts.date ? +new Date(opts.date) : 0,
			comment: opts.comment || ''
		});

		// Queue worker mutation
		this._enqueue(async () => {
			let payload = data;

			if(isDir) payload = null;
			else {
				if(payload instanceof Blob)
					payload = await payload.arrayBuffer();
				else if(payload instanceof Uint8Array)
					payload = u8ToTightArrayBuffer(payload);
				else if(payload instanceof ArrayBuffer) {
					// ok
				} else if(typeof payload === 'string') {
					// ok
				} else {
					throw new Error('Unsupported file() data type');
				}
			}

			await this._req(
				'put',
				{ path: finalName, buffer: payload, options: opts },
				payload instanceof ArrayBuffer ? [payload] : undefined
			);

			// If createFolders (default true) is in play, worker may have created parents.
			// We need to mirror parent dirs too so zip.files shows them.
			if(opts.createFolders !== false) {
				const parts = finalName.split('/');
				let acc = '';
				for(let i = 0; i < parts.length - 1; i++) {
					acc += parts[i] + '/';
					if(acc && !this._meta.has(acc))
						this._meta.set(acc, { dir: true, date: 0, comment: '' });
				}
			}
		});

		return this;
	}

	// JSZip: folder(name) creates dir and returns a new JSZip view rooted there.  [oai_citation:5‡Stuk](https://stuk.github.io/jszip/documentation/examples.html?utm_source=chatgpt.com)
	folder(name) {
		let p = name || '';
		if(p && !p.endsWith('/')) p += '/';

		if(p && !this._meta.has(p))
			this._meta.set(p, { dir: true, date: 0, comment: '' });

		this._enqueue(() => this._req('folder', { path: p }));
		return new FolderProxy(this, p);
	}

	// JSZip: remove(name) deletes file or folder recursively and returns this.  [oai_citation:6‡Stuk](https://stuk.github.io/jszip/documentation/api_jszip/remove.html?utm_source=chatgpt.com)
	remove(name) {
		const isDir = name.endsWith('/');
		if(isDir) {
			for(const k of Array.from(this._meta.keys())) {
				if(k === name || k.startsWith(name))
					this._meta.delete(k);
			}
		} else {
			this._meta.delete(name);
		}

		this._enqueue(() => this._req('remove', { path: name }));
		return this;
	}

	// JSZip: forEach(cb(relativePath, file)) where file is ZipObject
	forEach(cb) {
		for(const k of this._meta.keys())
			cb(k, new ZipEntryProxy(this, k));
	}

	async generateAsync(options = {}) {
		await this._ops;
	
		const type = options.type || 'arraybuffer';
	
		if(type === 'base64')
			return this._req('generateBase64', { options });
	
		const ab = await this._req('generate', { options });
	
		if(type === 'arraybuffer') return ab;
		if(type === 'uint8array') return new Uint8Array(ab);
		if(type === 'blob') return new Blob([ab]);
	
		throw new Error(`Unsupported generateAsync type: ${type}`);
	}

	async _read(name, type) {
		await this._ops;
	
		// Reading a folder ZipObject is allowed in JSZip (it exists), but content is meaningless.
		if(this._meta.get(name)?.dir) {
			if(type === 'string') return '';
			if(type === 'base64') return '';
			if(type === 'arraybuffer') return new ArrayBuffer(0);
			if(type === 'uint8array') return new Uint8Array(0);
			if(type === 'blob') return new Blob([]);
		}
	
		if(type === 'string')
			return this._req('readText', { path: name });
	
		if(type === 'base64')
			return this._req('readBase64', { path: name });
	
		if(type === 'arraybuffer')
			return this._req('readBin', { path: name });
	
		if(type === 'uint8array')
			return new Uint8Array(await this._req('readBin', { path: name }));
	
		if(type === 'blob')
			return new Blob([await this._req('readBin', { path: name })]);
	
		throw new Error(`Unsupported async type: ${type}`);
	}

	terminate() {
		this._worker.terminate();
		this._pending.clear();
	}
}

/* =========================
   Public facade (JSZip API)
   ========================= */

async function loadZip(buffer) {
	const zip = new ZipProxy();
	await zip.init(buffer);
	return zip;
}

// Supports both new JSZip().loadAsync() and JSZip.loadAsync()
export default class JSZip {
	constructor() {}
	loadAsync(buffer) { return loadZip(buffer); }
	static loadAsync(buffer) { return loadZip(buffer); }
}