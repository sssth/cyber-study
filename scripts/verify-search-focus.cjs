const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'study-focus-')));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 900 });
  const contents = win.webContents;
  const run = expression => contents.executeJavaScript(expression);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function wait(expression) {
    for (let i = 0; i < 80; i++) {
      if (await run(expression)) return;
      await pause(100);
    }
    throw Error(expression);
  }
  const toggle = () => run("window.dispatchEvent(new Event('cyber-toggle-search'))");
  async function clickAndType(selector, text) {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    await pause(250);
    const { x, y, hit } = await run(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const r = input.getBoundingClientRect();
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
      return { x, y, hit: document.elementFromPoint(x, y) === input };
    })()`);
    if (!hit) throw Error('Input is covered: ' + selector);
    for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) {
      contents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
    }
    await wait(`document.activeElement.matches(${JSON.stringify(selector)})`);
    await contents.insertText(text);
    await wait(`document.activeElement.value.includes(${JSON.stringify(text)})`);
  }

  await win.loadURL('http://127.0.0.1:5173/tests/ui/map-projection.html');
  await wait('!!window.previewEdit && !!document.querySelector(".memo-board")');
  await toggle();
  await clickAndType('.unified-search input', '甲');
  // An unrelated modal has no searchable collection. Keep the draft on close.
  await run("const blocker = document.body.appendChild(document.createElement('dialog')); blocker.showModal()");
  await wait("!document.querySelector('.unified-search')");
  await toggle();
  if (await run("!!document.querySelector('.unified-search')")) throw Error('Background search opened');
  await run("blocker.close(); blocker.remove()");
  await toggle();
  await wait("document.querySelector('.unified-search input')?.value === '甲'");
  await toggle();

  await run('previewEdit()');
  await wait("!!document.querySelector('dialog.edit-sidebar[open]')");
  await run(`window.dispatchEvent(new CustomEvent('cyber-show-relations', { detail: {
    source: { key:'book:b44', type:'book', id:'b44', title:'测试书44', element:document.body }
  }}))`);
  await wait("!!document.querySelector('.content-relation-dialog:modal')");
  await toggle();
  await clickAndType('.content-relation-dialog .unified-search input', '关系');
  // The most recently opened modal can precede the relation panel in DOM order.
  await run("document.body.prepend(blocker); blocker.showModal()");
  await wait("!document.querySelector('.unified-search')");
  await toggle();
  if (await run("!!document.querySelector('.unified-search')")) throw Error('Search escaped the front modal');
  await run("blocker.close(); blocker.remove()");
  await toggle();
  await wait("document.querySelector('.content-relation-dialog .unified-search input')?.value === '关系'");
  await run("document.querySelector('.content-relation-dialog').dispatchEvent(new Event('cancel', {cancelable:true}))");
  await wait("!document.querySelector('.content-relation-dialog[open]') && !document.querySelector('.unified-search')");
  await toggle();
  await clickAndType('.unified-search input', '乙');

  await win.loadURL('http://127.0.0.1:5173/tests/ui/navigation-return.html');
  await wait('!!window.resetPreview');
  await run("resetPreview('reader')");
  await wait("!!document.querySelector('.reader-immersive .reader-content [data-block]')");
  await toggle();
  contents.sendInputEvent({ type:'mouseMove', x:550, y:4 });
  const selector = '.reader-search-slot .unified-search input';
  await clickAndType(selector, '甲');
  contents.sendInputEvent({ type:'mouseMove', x:550, y:460 });
  await pause(300);
  await wait(`document.activeElement.matches('${selector}')`);
  await contents.insertText('乙');
  await wait(`document.querySelector('${selector}').value === '甲乙'`);
  console.log('SEARCH_FOCUS_PASS');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
