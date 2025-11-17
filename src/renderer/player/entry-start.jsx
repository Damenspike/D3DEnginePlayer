import React from 'react';
import { createRoot } from 'react-dom/client';
import AppStart from './AppStart.jsx';

const root = document.getElementById('root');

createRoot(root)
.render(
	<AppStart />
);