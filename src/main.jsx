import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initializeDefaultSamples } from './data/defaultSamples.js';
import './styles/scene.css';
import './styles/reader.css';
import './styles/features.css';
import './styles/immersive.css';

const root = createRoot(document.getElementById('root'));

async function openStudy() {
  try {
    await initializeDefaultSamples();
    root.render(<React.StrictMode><App /></React.StrictMode>);
  } catch (error) {
    console.error('内置样例无法加载', error);
    root.render(<main>
      <p role="alert">内置样例无法加载，请检查可用空间后重试。</p>
      <button type="button" onClick={openStudy}>重试</button>
    </main>);
  }
}

openStudy();
