import { useState, useEffect } from 'react';
import { getImageBlob } from '../../../engine/d3dutility.js';

export default function ImagePreview({ uri }) {
	const [dataUri, setDataUri] = useState('');

	useEffect(() => {
		let dead = false;
		
		setDataUri('');
		
		(async () => {
			if (!uri) return;
			
			const s = await getImageBlob(uri, _root.zip);
			
			if (dead)
				return;
			
			setDataUri(s);
		})();
		
		return () => { 
			dead = true; 
		}
		
	}, [uri]);

	if (!dataUri) {
		return (
			<div className="image-preview-container">
				<p className="small gray">Loading image</p>
			</div>
		);
	}

	return (
		<div className="image-preview-container">
			<img src={dataUri} style={{ width: '100%', height: '100%' }} />
			<div className="small gray mts">{uri}</div>
		</div>
	);
}