import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

window._isStandalone = true;

createRoot(document.getElementById('root')).render(<App />);