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
	MdImage, MdFilterBAndW, MdTextFields, 
	MdAudiotrack, MdOutlineVolumeUp
} from 'react-icons/md';
import { LuCloudMoon } from "react-icons/lu";
import { BsFonts, BsStars } from "react-icons/bs";
import { LuStamp } from "react-icons/lu";
import { PiSphereFill } from "react-icons/pi";
import { HiMiniAdjustmentsVertical } from "react-icons/hi2";

export function drawIconForObject(object) {
	if(object.symbol)
		return <MdOutlineInterests />;
	if(object.hasVisibleComponent('Mesh') || object.hasVisibleComponent('SubMesh'))
		return <MdViewInAr />;
	else
	if(object.hasComponent('AmbientLight') || object.hasComponent('DirectionalLight') || object.hasComponent('PointLight') || object.hasComponent('SpotLight'))
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
	if(object.hasComponent('AudioSource'))
		return <MdOutlineVolumeUp />;
	else
	if(object.hasComponent('AudioFilter'))
		return <HiMiniAdjustmentsVertical />;
	else
	if(object.hasComponent('Stamper'))
		return <LuStamp />;
	else
	if(object.hasComponent('DayNightCycle'))
		return <LuCloudMoon />;
	else
	if(object.hasComponent('ParticleSystem'))
		return <BsStars />;
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
		case 'mat': return <PiSphereFill />;
		
		case 'vert':
		case 'frag':
		case 'glsl':
			return <MdTexture />
		
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
		
		case 'mp3':
		case 'wav':
		case 'ogg':
		case 'm4a':
		case 'aac':
		case 'flac':
		case 'webm':
		case 'oga':
		case 'opus':
			return <MdAudiotrack />;
		
		default: return isDir ? <MdFolder /> : <MdInsertDriveFile />;
	}
}