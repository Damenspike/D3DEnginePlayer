import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	root: './src/renderer/editor',
	base: '',
	publicDir: path.resolve(__dirname, 'public'),
	plugins: [react()],
	server: { port: 5173 },
	optimizeDeps: {
		exclude: ['electron', 'fs', 'path', 'vm']
	},
	build: {
		outDir: '../../../dist/editor',
		emptyOutDir: true,
		rollupOptions: {
			external: ['electron', 'fs', 'path', 'vm']
		}
	}
});