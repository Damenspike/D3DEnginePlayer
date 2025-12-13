// d3dfilecache.js
const _mem = new Map();        // key -> Uint8Array
const _inflight = new Map();   // key -> Promise<Uint8Array>
const CACHE_NAME = 'd3d-files-v1';

function canUseCacheStorage() {
	return typeof caches !== 'undefined' && typeof Response !== 'undefined';
}

async function getPersistent(key) {
	if(!canUseCacheStorage()) return null;

	const cache = await caches.open(CACHE_NAME);
	const res = await cache.match(key);
	if(!res) return null;

	const ab = await res.arrayBuffer();
	return new Uint8Array(ab);
}

async function setPersistent(key, buffer) {
	if(!canUseCacheStorage()) return;

	const cache = await caches.open(CACHE_NAME);
	// store raw bytes; headers not super important for your use-case
	await cache.put(key, new Response(buffer, { status: 200 }));
}

export default class D3DFileCache {
	static async get(key, { persistent = true } = {}) {
		if(_mem.has(key))
			return _mem.get(key);

		if(persistent) {
			const hit = await getPersistent(key);
			if(hit) {
				_mem.set(key, hit);
				return hit;
			}
		}

		return null;
	}

	static async set(key, buffer, { persistent = true } = {}) {
		_mem.set(key, buffer);
		if(persistent)
			await setPersistent(key, buffer);
	}

	static async getOrLoad(key, loaderFn, { persistent = true } = {}) {
		const hit = await this.get(key, { persistent });
		if(hit) return hit;

		const inflight = _inflight.get(key);
		if(inflight) return inflight;

		const p = (async () => {
			try {
				const buf = await loaderFn();
				if(buf)
					await this.set(key, buf, { persistent });
				return buf;
			} finally {
				_inflight.delete(key);
			}
		})();

		_inflight.set(key, p);
		return p;
	}

	static clearMemory() {
		_mem.clear();
		_inflight.clear();
	}

	static async clearPersistent() {
		if(!canUseCacheStorage()) return;
		await caches.delete(CACHE_NAME);
	}
}