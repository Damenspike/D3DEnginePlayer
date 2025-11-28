export default class TextManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component = component;
		this.textProperties = component.properties;
	}
	
	/* ---------- content ---------- */
	get text() {
		return this.textProperties.text;
	}
	set text(v) {
		this.textProperties.text = v;
	}
	
	/* ---------- font family ---------- */
	get fontFamily() {
		return this.textProperties.fontFamily;
	}
	set fontFamily(v) {
		this.textProperties.fontFamily = v;
	}
	
	/* ---------- style (placeholders handled in UI but still stored) ---------- */
	get fontWeight() {
		return this.textProperties.fontWeight;
	}
	set fontWeight(v) {
		this.textProperties.fontWeight = v;
	}
	
	get fontStyle() {
		return this.textProperties.fontStyle;
	}
	set fontStyle(v) {
		this.textProperties.fontStyle = v;
	}
	
	get align() {
		return this.textProperties.align;
	}
	set align(v) {
		this.textProperties.align = v;
	}
	
	get valign() {
		return this.textProperties.valign;
	}
	set valign(v) {
		this.textProperties.valign = v;
	}
	// same thing
	get verticalAlign() {
		return this.textProperties.valign;
	}
	set verticalAlign(v) {
		this.textProperties.valign = v;
	}
	
	/* ---------- sizing & spacing ---------- */
	get fontSize() {
		return this.textProperties.fontSize;
	}
	set fontSize(v) {
		this.textProperties.fontSize = v;
	}
	
	get lineHeight() {
		return this.textProperties.lineHeight;
	}
	set lineHeight(v) {
		this.textProperties.lineHeight = v;
	}
	
	get letterSpacing() {
		return this.textProperties.letterSpacing;
	}
	set letterSpacing(v) {
		this.textProperties.letterSpacing = v;
	}
	
	get wrap() {
		return this.textProperties.wrap;
	}
	set wrap(v) {
		this.textProperties.wrap = !!v;
	}
	
	get wordWrap() {
		return this.textProperties.wrap;
	}
	set wordWrap(v) {
		this.textProperties.wrap = !!v;
	}
	
	get multiline() {
		return this.textProperties.multiline;
	}
	set multiline(v) {
		this.textProperties.multiline = !!v;
	}
	
	/* ---------- fill ---------- */
	get color() {
		return this.textProperties.fill;
	}
	set color(v) {
		this.textProperties.fill = v;
	}
	
	get textColor() {
		return this.textProperties.fillStyle;
	}
	set textColor(v) {
		this.textProperties.fillStyle = v;
	}
	
	/* ---------- stroke ---------- */
	get stroke() {
		return this.textProperties.stroke;
	}
	set stroke(v) {
		this.textProperties.stroke = v;
	}
	
	get strokeStyle() {
		return this.textProperties.strokeStyle;
	}
	set strokeStyle(v) {
		this.textProperties.strokeStyle = v;
	}
	
	get strokeWidth() {
		return this.textProperties.strokeWidth;
	}
	set strokeWidth(v) {
		this.textProperties.strokeWidth = v;
	}
	
	/* ---------- input mode ---------- */
	get isInput() {
		return this.textProperties.isInput;
	}
	set isInput(v) {
		this.textProperties.isInput = v;
	}
	
	get caretColor() {
		return this.textProperties.caretColor;
	}
	set caretColor(v) {
		this.textProperties.caretColor = v;
	}
	
	get paddingLeft() {
		return this.textProperties.paddingLeft;
	}
	set paddingLeft(v) {
		this.textProperties.paddingLeft = v;
	}
	
	get paddingTop() {
		return this.textProperties.paddingTop;
	}
	set paddingTop(v) {
		this.textProperties.paddingTop = v;
	}
	
	get paddingRight() {
		return this.textProperties.paddingRight;
	}
	set paddingRight(v) {
		this.textProperties.paddingRight = v;
	}
	
	get paddingBottom() {
		return this.textProperties.paddingBottom;
	}
	set paddingBottom(v) {
		this.textProperties.paddingBottom = v;
	}
	
	updateComponent() {
		if(!this.__setup)
			this.setup();
		else
			this.update();
	}
	setup() {
		this.d3dobject.__simpleHit = true;
		this.__setup = true;
	}
	update() {
		
	}
}