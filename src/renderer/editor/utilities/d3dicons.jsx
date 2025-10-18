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
	MdOutlineInterests, MdTexture, MdDirectionsWalk,
	MdImage, MdFilterBAndW, MdTextFields
} from 'react-icons/md';
import { BsFonts } from "react-icons/bs";

export function drawIconForObject(object) {
	if(object.symbol)
		return <MdOutlineInterests />;
	if(object.hasComponent('Mesh') || object.hasComponent('SubMesh'))
		return <MdViewInAr />;
	else
	if(object.hasComponent('Light'))
		return <MdLightbulbOutline />;
	else
	if(object.hasComponent('Camera'))
		return <MdPhotoCamera />;
	else
	if(object.hasComponent('Bitmap2D'))
		return <MdImage />;
	else
	if(object.hasComponent('Text2D'))
		return <BsFonts />;
	else
	if(object.hasComponent('Graphic2D'))
		return <MdFilterBAndW />;
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
		
		case 'png':
		case 'jpg':
		case 'jpeg':
		case 'gif':
		case 'webp':
		case 'bmp':
		case 'svg':
			return <MdImage />;
		
		default: return isDir ? <MdFolder /> : <MdInsertDriveFile />;
	}
}