import { spawn } from 'node:child_process';
import path from 'node:path';

const ELECTRON_MAIN = path.resolve('electron/player/player.js');
const VITE_CONFIG   = path.resolve('vite.player.config.js');
const URL           = 'http://localhost:5174';

const env = { ...process.env, D3D_PLAYER_VITE: '1' };

const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(url, tries = 120) {
	for (let i = 0; i < tries; i++) {
		try {
			const res = await fetch(url, { method: 'HEAD' });
			if (res.ok) return;
		} catch {}
		await wait(500);
	}
	throw new Error('Vite dev server not ready: ' + url);
}

(async () => {
	const vite = spawn('npx', ['vite', '--config', VITE_CONFIG, '--strictPort'], {
		stdio: 'inherit',
		shell: true,
		env
	});

	await waitFor(URL);

	const elec = spawn('npx', ['electron', ELECTRON_MAIN], {
		stdio: 'inherit',
		shell: true,
		env
	});

	elec.on('exit', (code) => {
		try { vite.kill(); } catch {}
		process.exit(code ?? 0);
	});
})().catch(err => {
	console.error(err);
	process.exit(1);
});