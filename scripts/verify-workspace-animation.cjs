const { app, BrowserWindow } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'study-animation-')));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1440, height: 960, show: true, webPreferences: { backgroundThrottling: false } });
  for (const feature of ['book', 'movie']) {
    await window.loadURL('http://127.0.0.1:5173/tests/ui/content-interactions.html' + (feature === 'movie' ? '?feature=movie' : ''));
    await new Promise(resolve => setTimeout(resolve, 1500));
    const samples = await window.webContents.executeJavaScript(`new Promise(resolve => {
      const samples = [], start = performance.now();
      if (${JSON.stringify(feature)} === 'book') document.querySelector('.shelf-read').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0, detail: 2 }));
      else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', metaKey: true, shiftKey: true, bubbles: true }));
      const sample = () => {
        const button = document.querySelector('dialog.edit-sidebar[open] .edit-actions button');
        if (button) { const rect = button.getBoundingClientRect(); samples.push({ x: rect.x, y: rect.y }); }
        if (performance.now() - start < 700) requestAnimationFrame(sample); else resolve(samples);
      }; requestAnimationFrame(sample);
    })`);
    if (samples.length < 5) throw Error(feature + ': missing animation frames');
    const spread = axis => Math.max(...samples.map(s => s[axis])) - Math.min(...samples.map(s => s[axis]));
    console.log(feature, { frames: samples.length, horizontalMovement: spread('x'), verticalMovement: spread('y') });
    if (spread('x') > 1 || spread('y') > 1) throw Error(feature + ': footer jumps during opening');
  }
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
