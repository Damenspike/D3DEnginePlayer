import React, { useEffect } from 'react';

import { 
	MdNavigation,
	MdOpenWith,
	MdOutlineSync,
	MdCameraswitch,
	MdCode
} from "react-icons/md";
import { BiExpand } from "react-icons/bi";

export default function Topbar() {
	useEffect(() => {
		function onKey(e) {
			const el = document.activeElement;
			if (!el || !el.classList.contains('tool-option')) return;
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				el.click();
			}
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, []);

	return (
		<div className="topbar" id="topbar-view">
			<div className="tools-section">
				<div 
					className="tool-option no-select" 
					id="tool-select" 
					onClick={() => _editor.setTool('select')} 
					tabIndex={0}
				>
					<MdNavigation />
				</div>
				<div 
					className="tool-option no-select" 
					id="tool-pan" 
					onClick={() => _editor.setTool('pan')} 
					tabIndex={0}
				>
					<MdCameraswitch />
				</div>
			</div>

			<div className="tools-section">
				<div 
					className="tool-option no-select" 
					id="ttool-translate"
					onClick={() => _editor.setTransformTool('translate')} 
					tabIndex={0}
				>
					<MdOpenWith />
				</div>
				<div 
					className="tool-option no-select" 
					id="ttool-rotate"
					onClick={() => _editor.setTransformTool('rotate')} 
					tabIndex={0}
				>
					<MdOutlineSync />
				</div>
				<div 
					className="tool-option no-select" 
					id="ttool-scale"
					onClick={() => _editor.setTransformTool('scale')} 
					tabIndex={0}
				>
					<BiExpand />
				</div>
			</div>
			
			<div className="tools-section">
				<div 
					className="tool-option no-select" 
					id="tool-code"
					onClick={() => _editor.editCode()} 
					tabIndex={0}
				>
					<MdCode />
				</div>
			</div>
		</div>
	);
}