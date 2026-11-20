import { translate, updateDocumentLanguage } from './i18n/index.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initializeDefaultSamples } from './data/defaultSamples.js';
import './styles/scene.css';
import './styles/reader.css';
import './styles/features.css';
import './styles/immersive.css';

updateDocumentLanguage();
const initialLabel = translate('i18n.startingApp');
document.querySelector('[data-startup-label]').textContent = initialLabel;
document.querySelector('[data-startup-progress]').setAttribute('aria-label', initialLabel);

const root = createRoot(document.getElementById('root'));

async function openStudy() {
  try {
    await initializeDefaultSamples();
    root.render(<React.StrictMode><App /></React.StrictMode>);
  } catch (error) {
    console.error(translate("i18n.couldNotLoadTheBuiltInSamples"), error);
    root.render(<main>
      <p role="alert">{translate("i18n.couldNotLoadTheBuiltInSamples2")}</p>
      <button type="button" onClick={openStudy}>{translate("i18n.retry")}</button>
    </main>);
  }
}

openStudy();
