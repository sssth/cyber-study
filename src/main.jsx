import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/scene.css';
import './styles/reader.css';
import './styles/features.css';
import './styles/immersive.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
