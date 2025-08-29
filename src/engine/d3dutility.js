export function arraysEqual(a, b) {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}
export async function renameZipFile(zip, oldPath, newBaseName) {
	// keep original extension unless user typed one
	const lastSlash = oldPath.lastIndexOf('/') + 1;
	const dir = oldPath.slice(0, lastSlash);            // e.g. "assets/img/"
	const oldName = oldPath.slice(lastSlash);           // e.g. "logo.png"
	const dot = oldName.lastIndexOf('.');
	const ext = dot > 0 ? oldName.slice(dot) : '';      // ".png" or ""

	const hasDot = newBaseName.includes('.');
	const finalName = hasDot ? newBaseName : (newBaseName + ext);
	const newPath = dir + finalName;

	// collision check
	if (zip.file(newPath)?.length) {
		throw new Error(`A file named "${finalName}" already exists in this folder.`);
	}

	// read → write → remove
	const data = await zip.file(oldPath).async('arraybuffer');
	zip.file(newPath, data);
	zip.remove(oldPath);

	return newPath;
}
export async function renameZipDirectory(zip, oldDirPath, newBaseName) {
	// normalize to have trailing slash
	if (!oldDirPath.endsWith('/')) oldDirPath += '/';

	const parentSlash = oldDirPath.lastIndexOf('/', oldDirPath.length - 2) + 1;
	const parentPath = oldDirPath.slice(0, parentSlash); // e.g. "assets/"
	const newPath = parentPath + newBaseName + '/';

	// collision check
	const hasConflict = Object.keys(zip.files).some(path =>
		path.startsWith(newPath)
	);
	if (hasConflict) throw new Error(`A folder "${newBaseName}" already exists here.`);

	// collect all files under the old dir
	const filesToMove = Object.keys(zip.files).filter(path =>
		path.startsWith(oldDirPath)
	);

	for (const filePath of filesToMove) {
		const newFilePath = newPath + filePath.slice(oldDirPath.length);
		if (zip.files[filePath].dir) {
			zip.folder(newFilePath); // just create the folder
		} else {
			const data = await zip.file(filePath).async('arraybuffer');
			zip.file(newFilePath, data);
		}
		zip.remove(filePath);
	}

	return newPath;
}