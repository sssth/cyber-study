import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PanelLoading } from '../../src/ui/LoadingScreen.jsx';
import { FeaturePanel } from '../../src/features/ui.jsx';
import ReaderOverlay from '../../src/reader/ReaderOverlay.jsx';
import { sampleBooks } from '../../src/reader/sampleBooks.js';
import '../../src/styles/global.css';
import '../../src/styles/reader.css';
import '../../src/styles/features.css';
import '../../src/styles/immersive.css';
// Reproduce the previous all-images gate with a deliberately slow decoder.
HTMLImageElement.prototype.decode = () => new Promise(resolve => setTimeout(resolve, 800));
function Preview() {
  const [page, setPage] = useState(0);
  const [reader, setReader] = useState(false);
  window.navigatePreview = () => setPage(value => value + 1);
  window.openPreviewBook = () => setReader(true);
  return <main className="app-shell" style={{background:'#ae352e'}}>
    <PanelLoading key={reader ? 'reader' : page} title="加载中">
      {reader ? <ReaderOverlay initialBookId={sampleBooks[0]?.id} initialView="last" shortcuts={{}} onClose={() => setReader(false)}/> :
        <FeaturePanel title={`页面${page}`} onClose={() => {}}>
          <div style={{height:400}}>页面{page}<img width="200" height="200" alt="慢图片" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3C/svg%3E"/></div>
        </FeaturePanel>}
    </PanelLoading>
  </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Preview/></React.StrictMode>);
