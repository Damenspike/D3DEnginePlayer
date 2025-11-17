import fs from 'fs';

const target = process.argv[2]; // "player" or "editor"

if (target !== 'player' && target !== 'editor') {
	console.error('Usage: node scripts/bump-version.mjs [player|editor]');
	process.exit(1);
}

const pkgPath = new URL('../package.json', import.meta.url);
const raw = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(raw);

// --- semver bump for main "version" (prerelease style) ---
function bumpSemverPrerelease(v) {
	const [core, pre] = v.split('-');

	// no pre-release part → bump patch and add -beta.1
	if (!pre) {
		let [maj, min, patch] = core.split('.').map(Number);
		patch++;
		return `${maj}.${min}.${patch}-beta.1`;
	}

	const [tag, numStr] = pre.split('.');
	const num = Number(numStr) || 0;
	return `${core}-${tag}.${num + 1}`;
}

const newVersion = bumpSemverPrerelease(target === 'player' ? pkg.playerVersion : pkg.editorVersion);
pkg.version = newVersion;

// tie per-target display version to the main version
if (target === 'player') {
	pkg.playerVersion = newVersion;
	console.log('Bumped PLAYER version →', newVersion);
} else if (target === 'editor') {
	pkg.editorVersion = newVersion;
	console.log('Bumped EDITOR version →', newVersion);
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');