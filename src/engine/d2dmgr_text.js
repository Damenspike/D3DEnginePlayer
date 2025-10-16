export default function TextManager(d3dobject, component) {
	this.textProperties = component.properties;
	
	this.updateComponent = () => {
		if(!component.__setup)
			setup();
		else
			update();
	}
	
	function setup() {
		
		component.__setup = true;
	}
	function update() {
		
	}
}