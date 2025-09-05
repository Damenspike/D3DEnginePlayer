D3D.theme.onChange((theme) => setTheme(theme));

async function getTheme() {
	const theme = await D3D.theme.get();
	setTheme(theme);
}
function setTheme(theme) {
	document.body.classList.toggle('dark', theme === 'dark');
	document.body.classList.toggle('light', theme !== 'dark');
}
getTheme();