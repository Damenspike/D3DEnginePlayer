import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	root: './src/renderer/player',
	base: '',
	plugins: [react()],
	server: { port: 5174 },
	build: {
		outDir: '../../../dist/player',
		emptyOutDir: true
	}
});