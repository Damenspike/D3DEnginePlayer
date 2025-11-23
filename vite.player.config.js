import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { resolve } from 'path';

export default defineConfig({
	root: './src/renderer/player',
	base: './',
	plugins: [
		react(),
		cssInjectedByJsPlugin({
			relativeCSSInjection: true
		})
	],
	assetsInclude: ['**/*.woff2', '**/*.woff', '**/*.ttf'],
	server: { port: 5174 },
	
	build: {
		outDir: '../../../dist/player',
		emptyOutDir: true,

		rollupOptions: {
			input: {
				main: resolve(__dirname, 'src/renderer/player/index.html'),
				playerstart: resolve(__dirname, 'src/renderer/player/playerstart.html')
			},

			output: {
				entryFileNames: 'd3dplayer.js',
				chunkFileNames: 'chunks/[name].js',
				assetFileNames: 'assets/[name].[ext]'
			}
		}
	}
});