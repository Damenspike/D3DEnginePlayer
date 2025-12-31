import JSZip from 'jszip';

export async function spawnD3DSceneFromBinary(u8, opts = {}) {
	const zip = await JSZip.loadAsync(u8);

	let scenes;
	try {
		const scenesStr = await zip.file('scenes.json')?.async('string');
		if(!scenesStr)
			return [];
		scenes = JSON.parse(scenesStr);
	}catch(e) {
		return [];
	}

	let manifest = null;
	try {
		const manifestStr = await zip.file('manifest.json')?.async('string');
		if(manifestStr)
			manifest = JSON.parse(manifestStr);
	}catch(e) {}

	const startScene = manifest?.startScene ?? 0;
	const entryScene = scenes?.[startScene] || scenes?.[0];
	if(!entryScene)
		return [];

	const assetIndexStr = await zip.file('asset-index.json')?.async('string');
	let assetIndex = [];
	if(assetIndexStr) {
		try {
			assetIndex = JSON.parse(assetIndexStr);
			if(!Array.isArray(assetIndex)) assetIndex = [];
		}catch(e) {
			assetIndex = [];
		}
	}

	for(const entry of assetIndex) {
		const rel = entry?.rel;
		const uuid = entry?.uuid;
		if(!rel || !uuid) continue;

		const srcFile = zip.file(rel);
		if(!srcFile) continue;

		if(!_root.zip.file(rel)) {
			const data = await srcFile.async('uint8array');
			_root.zip.file(rel, data);
		}

		upsertAssetIndexEntry(entry);
	}

	_editor.onAssetsUpdated();
	await _root.updateSymbolStore();

	const clip = entryScene.objects || [];
	if(clip.length < 1)
		return [];

	let spawned = await spawnFromClip(clip, opts);

	if(opts.addStep) {
		const prevSel = (_editor.selectedObjects || []).slice();

		const step = {
			name: 'Paste',
			undo() {
				for(const o of spawned)
					o?.destroy?.();

				spawned = [];
				_editor.setSelection(prevSel);
			},
			async redo() {
				spawned = await spawnFromClip(clip, opts);
				_editor.setSelection(spawned);
			}
		};

		_editor.addStep(step);
	}

	return spawned;
}

async function spawnFromClip(clip, opts = {}) {
	const spawned = [];

	for(const objData of clip) {
		const d3dobject = await _editor.focus.createObject(objData);
		d3dobject && spawned.push(d3dobject);
	}
	
	if(opts.keepWorldTransform) {
		spawned.forEach(d3dobject => {
			console.log(d3dobject.objData);
			d3dobject.worldPosition = d3dobject.objData.worldPosition;
			d3dobject.worldRotation = d3dobject.objData.worldRotation;
			d3dobject.worldScale = d3dobject.objData.worldScale;
		});
	}

	return spawned;
}

function upsertAssetIndexEntry(entry) {
	const { uuid, rel } = entry ?? {};
	if(!uuid || !rel) return;

	_root.assetIndex = _root.assetIndex || [];

	const existing = _root.assetIndex.find(a => a.uuid === uuid);
	if(existing)
		return;

	_root.assetIndex.push({ uuid, rel });
}