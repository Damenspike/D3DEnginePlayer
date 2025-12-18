// d3dzip.worker.js
import JSZipReal from 'jszip';

let zip = null;

function reply(id, ok, data, error, transfer) {
  const msg = { id, ok };
  if (ok) msg.data = data;
  else msg.error = error;
  self.postMessage(msg, transfer && transfer.length ? transfer : undefined);
}

self.onmessage = async e => {
  const msg = e.data || {};
  const { id, type } = msg;

  try {
	if (type === 'init') {
	  zip = await JSZipReal.loadAsync(msg.buffer);
	  reply(id, true, true);
	  return;
	}

	if (!zip) throw new Error('Zip not initialised');

	if (type === 'list') {
	  reply(id, true,
		Object.values(zip.files).map(f => ({
		  name: f.name,
		  dir: !!f.dir,
		  date: f.date ? +new Date(f.date) : 0,
		  comment: f.comment || ''
		}))
	  );
	  return;
	}

	if (type === 'folder') {
	  const p = msg.path && !msg.path.endsWith('/') ? msg.path + '/' : (msg.path || '');
	  zip.folder(p);
	  reply(id, true, true);
	  return;
	}

	if (type === 'remove') {
	  zip.remove(msg.path);
	  reply(id, true, true);
	  return;
	}

	if (type === 'put') {
	  zip.file(msg.path, msg.buffer, msg.options || undefined);
	  reply(id, true, true);
	  return;
	}

	if (type === 'readText') {
	  const f = zip.file(msg.path);
	  if (!f) throw new Error(`File not found: ${msg.path}`);
	  reply(id, true, await f.async('string'));
	  return;
	}

	if (type === 'readBin') {
	  const f = zip.file(msg.path);
	  if (!f) throw new Error(`File not found: ${msg.path}`);
	  const u8 = await f.async('uint8array');
	  const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
	  reply(id, true, ab, null, [ab]);
	  return;
	}

	if (type === 'generate') {
	  const opts = msg.options || {};
	  const u8 = await zip.generateAsync({ ...opts, type: 'uint8array' });
	  const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
	  reply(id, true, ab, null, [ab]);
	  return;
	}

	if (type === 'readBase64') {
	  const f = zip.file(msg.path);
	  if (!f) throw new Error(`File not found: ${msg.path}`);
	  reply(id, true, await f.async('base64'));
	  return;
	}

	if (type === 'generateBase64') {
	  const opts = msg.options || {};
	  const b64 = await zip.generateAsync({ ...opts, type: 'base64' });
	  reply(id, true, b64);
	  return;
	}

	throw new Error(`Unknown type: ${type}`);
  } catch (err) {
	reply(id, false, null, err?.message || String(err));
  }
};