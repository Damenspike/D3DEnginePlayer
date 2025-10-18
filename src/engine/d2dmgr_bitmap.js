export default function BitmapManager(d3dobject, component) {
	this.bitmapProperties = component.properties;
	
	this.updateComponent = () => {
		if(!component.__setup)
			setup();
		else
			update();
	}
	
	function setup() {
		d3dobject.__simpleHit = true;
		component.__setup = true;
	}
	function update() {
		
	}
}