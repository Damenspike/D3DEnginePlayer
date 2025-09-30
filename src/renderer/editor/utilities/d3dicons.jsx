import { 
	MdDelete, 
	MdAdd, 
	MdFolderOpen, 
	MdGames,
	MdViewInAr,
	MdFolderSpecial,
	MdLightbulbOutline,
	MdPhotoCamera,
	MdHtml,
	MdFolder, MdInsertDriveFile, MdExpandMore, MdChevronRight,
	MdUpload, MdCreateNewFolder, MdRefresh, MdDeleteForever,
	MdOutlineInterests, MdTexture, MdDirectionsWalk
} from 'react-icons/md';

export function drawIconForObject(object) {
	if(object.symbol)
		return <MdOutlineInterests />;
	if(object.components.find(c => c.type == 'Mesh' || c.type == 'SubMesh'))
		return <MdViewInAr />;
	else
	if(object.components.find(c => c.type.includes('Light')))
		return <MdLightbulbOutline />;
	else
	if(object.components.find(c => c.type == 'Camera'))
		return <MdPhotoCamera />;
	else
	if(object.components.find(c => c.type == 'HTML'))
		return <MdHtml />;
	else
		return <MdGames />;
}
export function drawIconForExt(ext, isDir = false) {
	switch (ext) {
		case 'd3dsymbol': return <MdOutlineInterests />;
		case 'glb':
		case 'gltf':
			return <MdViewInAr />;
		case 'glbcontainer': 
		case 'gltfcontainer': 
			return <MdFolderSpecial />;
		case 'mat': return <MdTexture />;
		case 'html': return <MdHtml />;
		case 'anim': return <MdDirectionsWalk />;
		default: return isDir ? <MdFolder /> : <MdInsertDriveFile />;
	}
}