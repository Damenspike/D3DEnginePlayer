import React from 'react';
import { createRoot } from 'react-dom/client';
import AppStart from './AppStart.jsx';

window._isStandalone = true;

createRoot(document.getElementById('root')).render(<AppStart />);