const path = require('node:path');
const fs = require('node:fs/promises');

async function publishProject(resolveProjectorPath, onPublishDone, publishURI, buildURI, opts) {
	//console.log('PUBLISH BY EDITOR!', publishURI, buildURI, opts);
	
	const fileName = getFileName(buildURI);
	const publishName = getFileNameNoExt(publishURI);
	
	let scriptURI = 'https://damen3d.com/player/1.0/d3dplayer.js';
	
	if(opts.js) {
		scriptURI = 'd3dplayer.js';
	}else
	if(opts.html) {
		const htmlStr = `<html><head><title>${opts.manifest.name}</title></head><body><script type="module" crossorigin src="${scriptURI}"></script><div id="damen3d-player" src="${fileName}"></div></body></html>`;
		await fs.writeFile(publishURI, htmlStr);
	}else
	if(opts.mac || opts.windows || opts.linux) {
		let platform;
		if(opts.mac) platform = 'mac';
		if(opts.windows) platform = 'win';
		if(opts.linux) platform = 'linux';
		
		if(!platform) 
			throw new Error('Invalid platform ' + platform);
			
		const projectorPath = await resolveProjectorPath(platform);
		
		if(opts.mac) {
			process.noAsar = true;
			await deleteIfExists(publishURI);
			await cloneAppWithRebasedSymlinks(projectorPath, publishURI);
			process.noAsar = false;
			
			await fs.copyFile(
				buildURI, 
				path.join(publishURI, 'Contents', 'Resources', 'game.d3d')
			);
			
			onPublishDone(publishURI);
		}else
		if(opts.windows || opts.linux) {
			process.noAsar = true;
			const publishDir = path.join(
				path.dirname(publishURI), 
				publishName
			);
			
			await deleteIfExists(publishDir);
			
			await fs.mkdir(
				publishDir, 
				{ recursive: true }
			);
			await fs.cp(projectorPath, publishDir, { 
				recursive: true,
				dereference: true
			});
			process.noAsar = false;
			
			if(opts.windows) {
				await fs.rename(
					path.join(publishDir, 'Damen3D Player.exe'),
					path.join(publishDir, `${publishName}.exe`),
				)
			}else
			if(opts.linux) {
				await fs.rename(
					path.join(publishDir, 'damen3dplayer'),
					path.join(publishDir, publishName),
				)
			}
			
			await fs.copyFile(
				buildURI, 
				path.join(publishDir, 'resources', 'game.d3d')
			);
			
			onPublishDone(publishDir);
		}
	}
}
function getFileName(filePath) {
	const a = filePath.split(/[\\/]/);
	let n = a.pop();
	
	if(!n) n = a.pop();
		
	return n || '';
}
function getFileNameNoExt(filePath) {
	const a = filePath.split(/[\\/]/);
	let n = a.pop();

	if (!n) n = a.pop();
	if (!n) return '';

	// strip extension if present
	const i = n.lastIndexOf('.');
	if (i > 0) {
		return n.substring(0, i);
	}
	return n;
}
async function deleteIfExists(dir) {
	try {
		await fs.rm(dir, { recursive: true, force: true });
	} catch (err) {
		console.error("Failed to delete:", err);
	}
}
async function cloneAppWithRebasedSymlinks(projectorPath, publishURI) {
	// Normalise roots
	const srcRoot = path.resolve(projectorPath);   // e.g. ".../Damen3D Player.app"
	const dstRoot = path.resolve(publishURI);      // e.g. ".../Testing.app"

	// Clean dest
	await fs.rm(dstRoot, { recursive: true, force: true });
	await fs.mkdir(dstRoot, { recursive: true });

	// Walk function
	async function walk(srcDir, dstDir) {
		const entries = await fs.readdir(srcDir, { withFileTypes: true });

		for (const entry of entries) {
			const srcPath = path.join(srcDir, entry.name);
			const dstPath = path.join(dstDir, entry.name);

			if (entry.isDirectory()) {
				await fs.mkdir(dstPath, { recursive: true });
				await walk(srcPath, dstPath);
			} else if (entry.isSymbolicLink()) {
				// Read original link target
				const linkTarget = await fs.readlink(srcPath);

				let newTarget = linkTarget;

				if (path.isAbsolute(linkTarget) && linkTarget.startsWith(srcRoot)) {
					// 1) Compute where that target would live inside the DEST bundle
					const relFromSrcRoot = path.relative(srcRoot, linkTarget);
					const dstTargetAbs = path.join(dstRoot, relFromSrcRoot);

					// 2) Make symlink *relative* from dstPath's directory
					const dstLinkDir = path.dirname(dstPath);
					newTarget = path.relative(dstLinkDir, dstTargetAbs) || '.';
				}

				await fs.symlink(newTarget, dstPath);
			} else if (entry.isFile()) {
				await fs.copyFile(srcPath, dstPath);
			} else {
				// Other types (sockets, FIFOs, whatever) — you probably don't have these in a .app,
				// but we can just skip or log if you want.
				// console.warn('Skipping weird entry:', srcPath);
			}
		}
	}

	await walk(srcRoot, dstRoot);
}

exports.publishProject = publishProject;