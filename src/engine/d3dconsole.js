function toStr(v) {
	if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`;
	if (typeof v === 'string') return v;
	if (typeof v === 'number' || typeof v === 'boolean' || v == null) return String(v);
	try { return JSON.stringify(v, null, 2); } catch { return '[Unserializable Object]'; }
}
function formatMessage(args) {
	return args.map(toStr).join(' ');
}

const D3DConsole = {
	log: (...args) => {
		console.log(...args);
		_host.onConsoleMessage({ level: 'log', message: formatMessage(args) });
	},
	warn: (...args) => {
		console.warn(...args);
		_host.onConsoleMessage({ level: 'warn', message: formatMessage(args) });
	},
	error: (...args) => {
		console.error(...args);
		_host.onConsoleMessage({ level: 'error', message: formatMessage(args) });
	},
	assert: (condition, ...args) => {
		console.assert(condition, ...args);
		if (!condition) {
			const msg = args.length ? formatMessage(args) : 'Assertion failed';
			_host.onConsoleMessage({ level: 'assert', message: msg });
		}
	}
};

export default D3DConsole;