const { ipcRenderer } = require('electron');

// Set initial theme
ipcRenderer.invoke('get-theme').then(theme => {
	document.body.classList.remove('dark', 'light');
	document.body.classList.add(theme);
});

// Listen for theme changes
ipcRenderer.on('theme-changed', (_, theme) => {
	document.body.classList.remove('dark', 'light');
	document.body.classList.add(theme);
});