// d3dlocalstorage.js

const NAMESPACE = 'd3d:';
const backend   = window.localStorage;

function makeKey(key) {
	return NAMESPACE + String(key);
}

function isNamespacedKey(rawKey) {
	return typeof rawKey === 'string' && rawKey.startsWith(NAMESPACE);
}

function encodeValue(value) {
	// JSON encode everything; strings still round-trip fine
	return JSON.stringify(value);
}

function decodeValue(raw) {
	if (raw == null) return null;
	try {
		return JSON.parse(raw);
	} catch (e) {
		return raw;
	}
}

const D3DLocalStorage = {
	// Get a value by key. Returns defaultValue if missing.
	get(key, defaultValue = null) {
		const raw = backend.getItem(makeKey(key));
		return raw === null ? defaultValue : decodeValue(raw);
	},

	// Set any JSON-serializable value.
	set(key, value) {
		backend.setItem(makeKey(key), encodeValue(value));
	},

	// Remove a single key.
	remove(key) {
		backend.removeItem(makeKey(key));
	},

	// Check if a key exists.
	has(key) {
		return backend.getItem(makeKey(key)) !== null;
	},

	// List all D3D local keys (without namespace prefix).
	keys() {
		const out = [];
		const len = backend.length;
		for (let i = 0; i < len; i++) {
			const rawKey = backend.key(i);
			if (!isNamespacedKey(rawKey)) continue;
			out.push(rawKey.slice(NAMESPACE.length));
		}
		return out;
	},

	// Clear only D3D keys (does NOT touch third-party keys).
	clearAll() {
		const len = backend.length;
		const toRemove = [];
		for (let i = 0; i < len; i++) {
			const rawKey = backend.key(i);
			if (isNamespacedKey(rawKey)) toRemove.push(rawKey);
		}
		for (let i = 0; i < toRemove.length; i++) {
			backend.removeItem(toRemove[i]);
		}
	}
};

export default D3DLocalStorage;