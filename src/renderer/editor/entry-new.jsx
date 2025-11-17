import React from 'react';
import { createRoot } from 'react-dom/client';
import AppNew from './AppNew.jsx';

window._isStandalone = true;

createRoot(document.getElementById('root')).render(<AppNew />);