import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
	root: './src/renderer/editor',
	base: './',
	publicDir: path.resolve(__dirname, 'public'),
	plugins: [react()],
	server: { port: 5173 },
	assetsInclude: ['**/*.woff2', '**/*.woff', '**/*.ttf'],
	optimizeDeps: {
		exclude: ['electron', 'fs', 'path', 'vm']
	},
	build: {
		outDir: '../../../dist/editor',
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: resolve(__dirname, 'src/renderer/editor/index.html'),
				editorstart: resolve(__dirname, 'src/renderer/editor/editorstart.html'),
				editornew: resolve(__dirname, 'src/renderer/editor/editornew.html'),
				player: resolve(__dirname, 'src/renderer/editor/player.html')
			},
			external: ['electron', 'fs', 'path', 'vm']
		}
	}
});