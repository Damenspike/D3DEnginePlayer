export default class Filter2DManager {
	constructor(d3dobject, component) {
		this.d3dobject = d3dobject;
		this.component  = component;
	}

	updateComponent() {}

	refresh() {
		this.d3dobject.invalidateGraphic2D();
	}

	// -----------------------------
	// Brightness
	// -----------------------------
	get brightness() {
		return this.component.properties.brightness;
	}
	set brightness(v) {
		this.component.properties.brightness = v;
		this.refresh();
	}

	// -----------------------------
	// Tint enabled
	// -----------------------------
	get tint() {
		return this.component.properties.tint;
	}
	set tint(v) {
		this.component.properties.tint = v;
		this.refresh();
	}

	// -----------------------------
	// Tint color
	// -----------------------------
	get tintColor() {
		return this.component.properties.tintColor;
	}
	set tintColor(v) {
		this.component.properties.tintColor = v;
		this.refresh();
	}

	// -----------------------------
	// Extra opacity (filter opacity)
	// -----------------------------
	get filterOpacity() {
		return this.component.properties.filterOpacity;
	}
	set filterOpacity(v) {
		this.component.properties.filterOpacity = v;
		this.refresh();
	}

	// -----------------------------
	// Blend mode
	// -----------------------------
	get blend() {
		return this.component.properties.blend;
	}
	set blend(v) {
		this.component.properties.blend = v;
		this.refresh();
	}

	// -----------------------------
	// Glow enabled
	// -----------------------------
	get glow() {
		return this.component.properties.glow;
	}
	set glow(v) {
		this.component.properties.glow = v;
		this.refresh();
	}

	// -----------------------------
	// Glow color
	// -----------------------------
	get glowColor() {
		return this.component.properties.glowColor;
	}
	set glowColor(v) {
		this.component.properties.glowColor = v;
		this.refresh();
	}

	// -----------------------------
	// Glow blur
	// -----------------------------
	get glowBlur() {
		return this.component.properties.glowBlur;
	}
	set glowBlur(v) {
		this.component.properties.glowBlur = v;
		this.refresh();
	}

	// -----------------------------
	// Glow strength
	// -----------------------------
	get glowStrength() {
		return this.component.properties.glowStrength;
	}
	set glowStrength(v) {
		this.component.properties.glowStrength = v;
		this.refresh();
	}

	// -----------------------------
	// Shadow enabled
	// -----------------------------
	get shadow() {
		return this.component.properties.shadow;
	}
	set shadow(v) {
		this.component.properties.shadow = v;
		this.refresh();
	}

	// -----------------------------
	// Shadow color
	// -----------------------------
	get shadowColor() {
		return this.component.properties.shadowColor;
	}
	set shadowColor(v) {
		this.component.properties.shadowColor = v;
		this.refresh();
	}

	// -----------------------------
	// Shadow angle (deg)
	// -----------------------------
	get shadowAngle() {
		return this.component.properties.shadowAngle;
	}
	set shadowAngle(v) {
		this.component.properties.shadowAngle = v;
		this.refresh();
	}

	// -----------------------------
	// Shadow Distance X
	// -----------------------------
	get shadowDistanceX() {
		return this.component.properties.shadowDistanceX;
	}
	set shadowDistanceX(v) {
		this.component.properties.shadowDistanceX = v;
		this.refresh();
	}

	// -----------------------------
	// Shadow Distance Y
	// -----------------------------
	get shadowDistanceY() {
		return this.component.properties.shadowDistanceY;
	}
	set shadowDistanceY(v) {
		this.component.properties.shadowDistanceY = v;
		this.refresh();
	}

	// -----------------------------
	// Shadow Blur
	// -----------------------------
	get shadowBlur() {
		return this.component.properties.shadowBlur;
	}
	set shadowBlur(v) {
		this.component.properties.shadowBlur = v;
		this.refresh();
	}

	// -----------------------------
	// Shadow Type
	// -----------------------------
	get shadowType() {
		return this.component.properties.shadowType;
	}
	set shadowType(v) {
		this.component.properties.shadowType = v;
		this.refresh();
	}
}