export default class Layout2DManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
	}

	get anchor() {
		return this.component.properties.anchor;
	}
	set anchor(v) {
		this.component.properties.anchor = v;
		this.updateLayout();
	}

	get anchorVertical() {
		return this.component.properties.anchorVertical;
	}
	set anchorVertical(v) {
		this.component.properties.anchorVertical = v;
		this.updateLayout();
	}

	get anchorHorizontal() {
		return this.component.properties.anchorHorizontal;
	}
	set anchorHorizontal(v) {
		this.component.properties.anchorHorizontal = v;
		this.updateLayout();
	}

	get anchorOffsetAuto() {
		return this.component.properties.anchorOffsetAuto;
	}
	set anchorOffsetAuto(v) {
		this.component.properties.anchorOffsetAuto = v;
		this.updateLayout();
	}

	get anchorOffsetX() {
		return this.component.properties.anchorOffsetX;
	}
	set anchorOffsetX(v) {
		this.component.properties.anchorOffsetX = v;
		this.updateLayout();
	}

	get anchorOffsetY() {
		return this.component.properties.anchorOffsetY;
	}
	set anchorOffsetY(v) {
		this.component.properties.anchorOffsetY = v;
		this.updateLayout();
	}

	updateComponent() {
		if (!this.component.__setup) 
			this.setup();
		else 
			this.updateLayout();
	}

	setup() {
		this.updateOffset();
		this.updateLayout();
		
		if(window._player)
			this.__onInternalEnterFrame = () => this.updateLayout();
		
		this.component.__setup = true;
	}
	updateOffset() {
		if(this.anchorOffsetAuto) {
			const properties = this.component.properties;
			const parentGraphic = this.d3dobject.parent?.getComponent('Graphic2D');
			
			let relativeWidth = _dimensions.width;
			let relativeHeight = _dimensions.height;
			
			if(parentGraphic) {
				relativeWidth = parentGraphic.width;
				relativeHeight = parentGraphic.height;
			}
			
			const xAnchor = this.getHorizontalAnchorPoint(relativeWidth);
			const yAnchor = this.getVerticalAnchorPoint(relativeHeight);
			
			switch(this.anchorHorizontal) {
				case 'left':
					properties.anchorOffsetX = this.d3dobject.position.x;
				break;
				case 'center':
					properties.anchorOffsetX = this.d3dobject.position.x - xAnchor;
				break;
				case 'right':
					properties.anchorOffsetX = -(xAnchor - this.d3dobject.position.x);
				break;
			}
			switch(this.anchorVertical) {
				case 'top':
					properties.anchorOffsetY = this.d3dobject.position.y;
				break;
				case 'center':
					properties.anchorOffsetY = this.d3dobject.position.y - yAnchor;
				break;
				case 'bottom':
					properties.anchorOffsetY = -(yAnchor - this.d3dobject.position.y);
				break;
			}
		}
	}
	updateLayout() {
		if(!window._player)
			return;
		
		const parentGraphic = this.d3dobject.parent?.getComponent('Graphic2D');
		
		let totalWidth = _dimensions.pixelWidth;
		let totalHeight = _dimensions.pixelHeight;
		
		if(parentGraphic) {
			totalWidth = parentGraphic.width;
			totalHeight = parentGraphic.height;
		}
		
		const xAnchor = this.getHorizontalAnchorPoint(totalWidth);
		const yAnchor = this.getVerticalAnchorPoint(totalHeight);
		
		const x = xAnchor + this.anchorOffsetX;
		const y = yAnchor + this.anchorOffsetY;
		
		this.d3dobject.position.x = x;
		this.d3dobject.position.y = y;
	}
	
	getVerticalAnchorPoint(totalHeight) {
		const parentGraphic = this.d3dobject.parent?.getComponent('Graphic2D');
		
		switch(this.anchorVertical) {
			case 'top':
				return !parentGraphic ? -this.getVerticalExpansion() : 0;
			case 'center':
				return totalHeight / 2;
			case 'bottom':
				return totalHeight;
		}
	}
	getHorizontalAnchorPoint(totalWidth) {
		const parentGraphic = this.d3dobject.parent?.getComponent('Graphic2D');
		
		switch(this.anchorHorizontal) {
			case 'left':
				return !parentGraphic ? -this.getHorizontalExpansion() : 0;
			case 'center':
				return totalWidth / 2;
			case 'right':
				return totalWidth;
		}
	}
	getVerticalExpansion() {
		return _dimensions.pixelHeight - _dimensions.height;
	}
	getHorizontalExpansion() {
		return _dimensions.pixelWidth - _dimensions.width;
	}
}