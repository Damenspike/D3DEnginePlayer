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
				// Main windows
				main: resolve(__dirname, 'src/renderer/editor/index.html'),
				editorstart: resolve(__dirname, 'src/renderer/editor/editorstart.html'),
				editornew: resolve(__dirname, 'src/renderer/editor/editornew.html'),
				player: resolve(__dirname, 'src/renderer/editor/player.html'),
				
				// Tool windows
				bitmapTrace: resolve(__dirname, 'src/renderer/editor/tool-windows/bitmap-trace.html'),
				graphicSmooth: resolve(__dirname, 'src/renderer/editor/tool-windows/graphic-smooth.html'),
				graphicStraighten: resolve(__dirname, 'src/renderer/editor/tool-windows/graphic-straighten.html'),
				graphicSimplify: resolve(__dirname, 'src/renderer/editor/tool-windows/graphic-simplify.html'),
			},
			output: {
				entryFileNames: 'd3deditor.js',
				chunkFileNames: 'chunks/[name].js',
				assetFileNames: 'assets/[name].[ext]'
			},
			external: ['electron', 'fs', 'path', 'vm']
		}
	}
});