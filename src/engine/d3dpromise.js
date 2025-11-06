// d3dpromise.js
export default function D3DPromise(executor) {
	// executor: (resolve, reject) => { ... }
	if (typeof executor !== 'function') {
		// allow D3DPromise(value) to resolve immediately
		return Promise.resolve(executor);
	}
	return new Promise((resolve, reject) => {
		try {
			executor(resolve, reject);
		} catch (err) {
			reject(err);
		}
	});
}

D3DPromise.resolve     = (v) => Promise.resolve(v);
D3DPromise.reject      = (e) => Promise.reject(e);
D3DPromise.all         = (arr) => Promise.all(arr);
D3DPromise.allSettled  = (arr) => Promise.allSettled(arr);
D3DPromise.race        = (arr) => Promise.race(arr);

D3DPromise.delay = (ms, value) =>
	new Promise((res) => setTimeout(res, Math.max(0, ms|0), value));