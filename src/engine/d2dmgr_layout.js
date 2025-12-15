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
	
	get size() {
		return this.component.properties.size;
	}
	set size(v) {
		this.component.properties.size = v;
		this.updateLayout();
	}
	
	get sizeWidth() {
		return this.component.properties.sizeWidth;
	}
	set sizeWidth(v) {
		this.component.properties.sizeWidth = v;
		this.updateLayout();
	}
	
	get sizeHeight() {
		return this.component.properties.sizeHeight;
	}
	set sizeHeight(v) {
		this.component.properties.sizeHeight = v;
		this.updateLayout();
	}
	
	get sizeOffsetAuto() {
		return this.component.properties.sizeOffsetAuto;
	}
	set sizeOffsetAuto(v) {
		this.component.properties.sizeOffsetAuto = v;
		this.updateLayout();
	}
	
	get sizeOffsetX() {
		return this.component.properties.sizeOffsetX;
	}
	set sizeOffsetX(v) {
		this.component.properties.sizeOffsetX = v;
		this.updateLayout();
	}
	
	get sizeOffsetY() {
		return this.component.properties.sizeOffsetY;
	}
	set sizeOffsetY(v) {
		this.component.properties.sizeOffsetY = v;
		this.updateLayout();
	}

	updateComponent() {
		if (!this.__setup) 
			this.setup();
		else 
			this.updateLayout();
	}

	setup() {
		this.updateOffset();
		this.updateLayout();
		
		this.__setup = true;
	}
	updateLayout() {
		if(!window._player)
			return;
		
		this.updateAnchoring();
		this.updateSizing();
	}
	updateOffset() {
		const properties = this.component.properties;
		const parentGraphic = this.d3dobject.parent?.getComponent('Graphic2D');
		const graphic = this.d3dobject.getComponent('Graphic2D');
		
		if(this.anchorOffsetAuto) {
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
		if(this.sizeOffsetAuto && graphic) {
			let relativeWidth = _dimensions.width;
			let relativeHeight = _dimensions.height;
			
			if(parentGraphic) {
				relativeWidth = parentGraphic.width;
				relativeHeight = parentGraphic.height;
			}
			
			if(this.sizeWidth) {
				properties.sizeOffsetX = relativeWidth - graphic.width;
			}
			if(this.sizeHeight) {
				properties.sizeOffsetY = relativeHeight - graphic.height;
			}
		}
	}
	__onInternalEnterFrame() {
		this.updateLayout();
	}
	updateAnchoring() {
		if(this.anchor !== true)
			return;
		
		const parentGraphic = this.d3dobject.parent?.getComponent('Graphic2D');
		
		let totalWidth = _dimensions.right;
		let totalHeight = _dimensions.bottom;
		const drawScale = 1;//_dimensions.drawScale2D; // dont do this for anchoring just scaling
		
		if(parentGraphic) {
			totalWidth = parentGraphic.width;
			totalHeight = parentGraphic.height;
		}
		
		const xAnchor = this.getHorizontalAnchorPoint(totalWidth, true);
		const yAnchor = this.getVerticalAnchorPoint(totalHeight, true);
		
		const x = xAnchor + (this.anchorOffsetX * drawScale);
		const y = yAnchor + (this.anchorOffsetY * drawScale);
		
		this.d3dobject.position.x = x;
		this.d3dobject.position.y = y;
	}
	updateSizing() {
		if(this.size !== true)
			return;
		
		if(!this.d3dobject.hasComponent('Graphic2D'))
			return;
			
		if(!_host.renderer2d)
			return;
		
		const graphic = this.d3dobject.getComponent('Graphic2D');
		const parentGraphic = this.d3dobject.parent?.getComponent('Graphic2D');
		const drawScale = _dimensions.drawScale2D;
		
		let totalWidth = _dimensions.gameWidth;
		let totalHeight = _dimensions.gameHeight;
		
		if(parentGraphic) {
			totalWidth = parentGraphic.width;
			totalHeight = parentGraphic.height;
		}
		
		graphic.width = totalWidth - (this.sizeOffsetX * drawScale);
		graphic.height = totalHeight - (this.sizeOffsetY * drawScale);
	}
	
	getVerticalAnchorPoint(totalHeight, scale = false) {
		const parentGraphic = this.d3dobject.parent?.getComponent('Graphic2D');
		const drawScale = _dimensions.drawScale2D;
		
		switch(this.anchorVertical) {
			case 'top':
				return !parentGraphic ? _dimensions.top : 0;
			case 'center':
				const rootTotal = _dimensions.height * (scale ? drawScale : 1);
				return !parentGraphic ? (rootTotal / 2) : (parentGraphic.height / 2);
			case 'bottom':
				return totalHeight;
		}
	}
	getHorizontalAnchorPoint(totalWidth, scale = false) {
		const parentGraphic = this.d3dobject.parent?.getComponent('Graphic2D');
		const drawScale = _dimensions.drawScale2D;
		
		switch(this.anchorHorizontal) {
			case 'left':
				return !parentGraphic ? _dimensions.left : 0;
			case 'center':
				const rootTotal = _dimensions.width * (scale ? drawScale : 1);
				return !parentGraphic ? (rootTotal / 2) : (parentGraphic.width / 2);
			case 'right':
				return totalWidth;
		}
	}
}