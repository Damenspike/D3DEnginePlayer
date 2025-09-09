// MaterialEditor.jsx
import React, { useEffect, useRef, useState } from 'react';
import { MdFolderOpen, MdDelete } from 'react-icons/md';

const DEFAULTS = {
	type: 'MeshStandardMaterial',
	color: 0xffffff,
	metalness: 0.2,
	roughness: 0.6,
	emissive: 0x000000,
	emissiveIntensity: 0,
	opacity: 1,
	transparent: false,
	wireframe: false,
	side: 'FrontSide',
	map: '',
	normalMap: '',
	roughnessMap: '',
	metalnessMap: '',
	emissiveMap: '',
	alphaMap: '',
	envMapIntensity: 1
};

let timer;

function numToInput(n) {
	const v = Math.max(0, Math.min(0xffffff, Number(n) || 0));
	return `#${v.toString(16).padStart(6, '0')}`;
}
function inputToNum(s) {
	const hex = (s || '#ffffff').replace('#', '').slice(0, 6);
	const v = parseInt(hex || 'ffffff', 16);
	return Number.isFinite(v) ? v : 0xffffff;
}
function normalizeColor(c) {
	if (typeof c === 'number') return Math.max(0, Math.min(0xffffff, c));
	if (typeof c === 'string') {
		if (c.startsWith('#')) return inputToNum(c);
		if (c.startsWith('0x') || c.startsWith('0X')) return parseInt(c.slice(2), 16) >>> 0;
		const n = Number(c);
		if (Number.isFinite(n)) return Math.max(0, Math.min(0xffffff, n));
	}
	return DEFAULTS.color;
}
function ensureDefaults(val) {
	const v = { ...(val || {}) };
	v.type = v.type || DEFAULTS.type;
	v.color = normalizeColor(v.color ?? DEFAULTS.color);
	v.emissive = normalizeColor(v.emissive ?? DEFAULTS.emissive);
	v.metalness = Number.isFinite(+v.metalness) ? +v.metalness : DEFAULTS.metalness;
	v.roughness = Number.isFinite(+v.roughness) ? +v.roughness : DEFAULTS.roughness;
	v.emissiveIntensity = Number.isFinite(+v.emissiveIntensity) ? +v.emissiveIntensity : DEFAULTS.emissiveIntensity;
	v.opacity = Number.isFinite(+v.opacity) ? +v.opacity : DEFAULTS.opacity;
	v.transparent = !!v.transparent;
	v.wireframe = !!v.wireframe;
	v.side = v.side || DEFAULTS.side;
	v.map = v.map || '';
	v.normalMap = v.normalMap || '';
	v.roughnessMap = v.roughnessMap || '';
	v.metalnessMap = v.metalnessMap || '';
	v.emissiveMap = v.emissiveMap || '';
	v.alphaMap = v.alphaMap || '';
	v.envMapIntensity = Number.isFinite(+v.envMapIntensity) ? +v.envMapIntensity : DEFAULTS.envMapIntensity;
	return v;
}
function clamp01(v) {
	v = Number(v) || 0;
	if (v < 0) return 0;
	if (v > 1) return 1;
	return v;
}

export default function MaterialEditor({ uri, onChange, onSave, openAsset }) {
	const [mat, setMat] = useState(ensureDefaults(null));
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [showAdvanced, setShowAdvanced] = useState(false);
	const prevRef = useRef(JSON.stringify(ensureDefaults(null)));

	useEffect(() => {
		let cancelled = false;
		(async () => {
			setLoading(true);
			setError('');
			try {
				const text = await _editor.readFile(uri);
				let parsed = {};
				try { parsed = JSON.parse(text || '{}'); } catch {}
				const withDefaults = ensureDefaults(parsed);
				if (!cancelled) {
					setMat(withDefaults);
					prevRef.current = JSON.stringify(withDefaults);
					onChange?.(withDefaults, null);
				}
			} catch (e) {
				console.error('[MaterialEditor] read fail', uri, e);
				if (!cancelled) {
					setMat(ensureDefaults(null));
					setError('Failed to load material');
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => { cancelled = true; };
	}, [uri]);

	const commit = (next) => {
		const prev = JSON.parse(prevRef.current || '{}');
		prevRef.current = JSON.stringify(next);
		onSave?.(prev, next);
	};
	const patch = (patchObj, commitChange = false) => {
		const next = ensureDefaults({ ...mat, ...patchObj });
		setMat(next);
		onChange?.(next, mat);
		if (commitChange) commit(next);
	};
	const fileRow = (label, field, acceptFormat = 'texture') => {
		const current = mat[field] || '';
		return (
			<div className="material-editor-row">
				<label className="material-editor-label">{label}</label>
				<div className="file-field">
					<input
						className="tf"
						type="text"
						readOnly
						value={current}
						placeholder="No asset"
						onClick={() => openAsset?.({ format: acceptFormat, field, current })}
					/>
					<button title="Browse" onClick={() => openAsset?.({ format: acceptFormat, field, current })}>
						<MdFolderOpen />
					</button>
					{current ? (
						<button title="Clear" onClick={() => patch({ [field]: '' }, true)}>
							<MdDelete />
						</button>
					) : null}
				</div>
			</div>
		);
	};

	if (loading) return <div className="material-editor">Loading material…</div>;
	if (error) return <div className="material-editor error">{error}</div>;

	const isBasic = mat.type === 'MeshBasicMaterial';
	
	return (
		<div className="material-editor">
			{/* BASIC */}
			<div className="material-editor-row">
				<label className="material-editor-label">Color</label>
				<input
					type="color"
					value={numToInput(mat.color)}
					onClick={(e) => { e.target.oldValueNum = mat.color; }}
					onChange={(e) => {
						patch({ color: inputToNum(e.target.value) });
						
						clearTimeout(timer);
						timer = setTimeout(() => {
							const next = { ...mat, color: inputToNum(e.target.value) };
							const prev = { ...mat, color: e.target.oldValueNum ?? mat.color };
							onSave?.(prev, next);
						}, 100);
					}}
					onBlur={(e) => {
						const next = { ...mat, color: inputToNum(e.target.value) };
						const prev = { ...mat, color: e.target.oldValueNum ?? mat.color };
						onSave?.(prev, next);
					}}
				/>
			</div>

			{!isBasic && (
				<div className="material-editor-row">
					<label className="material-editor-label">Metalness</label>
					<div className="material-editor-slider">
						<input
							type="range" min={0} max={1} step={0.01}
							value={Number(mat.metalness) || 0}
							onChange={(e) => patch({ metalness: clamp01(e.target.value) })}
							onMouseUp={(e) => patch({ metalness: clamp01(e.target.value) }, true)}
							onTouchEnd={(e) => patch({ metalness: clamp01(e.target.value) }, true)}
						/>
						<div className="slider-value">{(Number(mat.metalness) || 0).toFixed(2)}</div>
					</div>
				</div>
			)}

			{!isBasic && (
				<div className="material-editor-row">
					<label className="material-editor-label">Roughness</label>
					<div className="material-editor-slider">
						<input
							type="range" min={0} max={1} step={0.01}
							value={Number(mat.roughness) || 0}
							onChange={(e) => patch({ roughness: clamp01(e.target.value) })}
							onMouseUp={(e) => patch({ roughness: clamp01(e.target.value) }, true)}
							onTouchEnd={(e) => patch({ roughness: clamp01(e.target.value) }, true)}
						/>
						<div className="slider-value">{(Number(mat.roughness) || 0).toFixed(2)}</div>
					</div>
				</div>
			)}

			<div className="material-editor-row">
				<div></div>
				<button className="btn" type="button" onClick={() => setShowAdvanced(s => !s)}>
					{showAdvanced ? 'Hide Advanced' : 'Advanced'}
				</button>
			</div>

			{/* ADVANCED */}
			{showAdvanced && (
				<>
					<div className="material-editor-row">
						<label className="material-editor-label">Type</label>
						<select
							className="tf"
							value={mat.type}
							onChange={(e) => patch({ type: e.target.value }, true)}
						>
							<option value="MeshStandardMaterial">Mesh Standard Material</option>
							<option value="MeshPhysicalMaterial">Mesh Physical Material</option>
							<option value="MeshBasicMaterial">Mesh Basic Material</option>
						</select>
					</div>

					<div className="material-editor-row">
						<label className="material-editor-label">Emissive</label>
						<input
							type="color"
							value={numToInput(mat.emissive)}
							onClick={(e) => { e.target.oldValueNum = mat.emissive; }}
							onChange={(e) => patch({ emissive: inputToNum(e.target.value) })}
							onBlur={(e) => {
								const next = { ...mat, emissive: inputToNum(e.target.value) };
								const prev = { ...mat, emissive: e.target.oldValueNum ?? mat.emissive };
								onSave?.(prev, next);
							}}
						/>
					</div>

					<div className="material-editor-row">
						<label className="material-editor-label">Emissive Intensity</label>
						<div className="material-editor-slider">
							<input
								type="range" min={0} max={10} step={0.1}
								value={Number(mat.emissiveIntensity) || 0}
								onChange={(e) => patch({ emissiveIntensity: Math.max(0, Number(e.target.value) || 0) })}
								onMouseUp={(e) => patch({ emissiveIntensity: Math.max(0, Number(e.target.value) || 0) }, true)}
								onTouchEnd={(e) => patch({ emissiveIntensity: Math.max(0, Number(e.target.value) || 0) }, true)}
							/>
							<div className="slider-value">{(Number(mat.emissiveIntensity) || 0).toFixed(1)}</div>
						</div>
					</div>

					<div className="material-editor-row">
						<label className="material-editor-label">Transparent</label>
						<input
							type="checkbox"
							checked={!!mat.transparent}
							onChange={(e) => patch({ transparent: !!e.target.checked }, true)}
						/>
					</div>

					<div className="material-editor-row">
						<label className="material-editor-label">Opacity</label>
						<div className="material-editor-slider">
							<input
								type="range" min={0} max={1} step={0.01}
								value={Number(mat.opacity) || 1}
								onChange={(e) => patch({ opacity: clamp01(e.target.value) })}
								onMouseUp={(e) => patch({ opacity: clamp01(e.target.value) }, true)}
								onTouchEnd={(e) => patch({ opacity: clamp01(e.target.value) }, true)}
							/>
							<div className="slider-value">{(Number(mat.opacity) || 1).toFixed(2)}</div>
						</div>
					</div>

					<div className="material-editor-row">
						<label className="material-editor-label">Wireframe</label>
						<input
							type="checkbox"
							checked={!!mat.wireframe}
							onChange={(e) => patch({ wireframe: !!e.target.checked }, true)}
						/>
					</div>

					<div className="material-editor-row">
						<label className="material-editor-label">Side</label>
						<select
							className="tf"
							value={mat.side}
							onChange={(e) => patch({ side: e.target.value }, true)}
						>
							<option value="FrontSide">Front Side</option>
							<option value="BackSide">Back Side</option>
							<option value="DoubleSide">Double Side</option>
						</select>
					</div>

					{fileRow('Color Map', 'map')}
					{fileRow('Normal Map', 'normalMap')}
					{!isBasic && fileRow('Roughness Map', 'roughnessMap')}
					{!isBasic && fileRow('Metalness Map', 'metalnessMap')}
					{fileRow('Emissive Map', 'emissiveMap')}
					{fileRow('Alpha Map', 'alphaMap')}

					{!isBasic && (
						<div className="material-editor-row">
							<label className="material-editor-label">EnvMap Intensity</label>
							<div className="material-editor-slider">
								<input
									type="range" min={0} max={5} step={0.1}
									value={Number(mat.envMapIntensity) || 1}
									onChange={(e) => patch({ envMapIntensity: Math.max(0, Number(e.target.value) || 0) })}
									onMouseUp={(e) => patch({ envMapIntensity: Math.max(0, Number(e.target.value) || 0) }, true)}
									onTouchEnd={(e) => patch({ envMapIntensity: Math.max(0, Number(e.target.value) || 0) }, true)}
								/>
								<div className="slider-value">{(Number(mat.envMapIntensity) || 1).toFixed(1)}</div>
							</div>
						</div>
					)}
				</>
			)}
		</div>
	);
}