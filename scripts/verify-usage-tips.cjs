const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'study-usage-tips-')));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 840, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
  const run = source => win.webContents.executeJavaScript(source);
  async function wait(source) {
    for (let attempt = 0; attempt < 900; attempt++) {
      if (await run(source)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Not observed: ' + source + '\n' + await run('document.body.innerText.slice(0, 500)'));
  }
  const click = selector => run('document.querySelector(' + JSON.stringify(selector) + ').click()');
  const buttons = "[...document.querySelectorAll('#room-interactions button')]";
  async function openFilm() {
    await click('.interaction-menu > button');
    await run(buttons + ".find(b => b.textContent === '影碟机').click()");
  }
  const tipText = "document.querySelector('.usage-tip p')?.textContent";
  const url = 'http://127.0.0.1:5173/tests/ui/usage-tips.html';
  await win.loadURL(url);
  await wait("document.querySelector('.usage-tip') && document.querySelector('.interaction-menu > button')");
  await openFilm();
  await wait(tipText + " === '首条示例'");
  const coords = "['.usage-tip', '.command-toolbar-toggle'].map(s => document.querySelector(s).getBoundingClientRect().top).join(',')";
  const initial = JSON.stringify(await run(coords));
  await click('.command-toolbar-toggle');
  await wait(coords + ' === ' + initial);
  await click('.command-toolbar-toggle');
  await click('.usage-tip-toggle');
  await wait("!document.querySelector('.usage-tip p') && document.querySelector('.command-toolbar-toggle').getAttribute('aria-expanded') === 'true'");
  await click('.usage-tip-toggle');
  await wait(tipText + " === '首条示例'");
  await click('.usage-tip-next');
  await wait(coords + ' === ' + initial);
  await wait(tipText + "?.startsWith('第二条示例')");
  await run("[...document.querySelectorAll('.command-toolbar button')].find(b => b.textContent === '新建').click()");
  await wait("document.querySelector('.edit-sidebar[open]') && !document.querySelector('.usage-tip')");
  await click('.edit-sidebar[open] header button');
  await wait(tipText + "?.startsWith('第二条示例')");
  await click('.feature-overlay .display-close');
  await wait("!!document.querySelector('.interaction-menu > button')");
  await openFilm();
  await wait(tipText + " === '第三条示例'");
  await wait("document.querySelector('.usage-tip').getBoundingClientRect().top > document.querySelector('.command-toolbar').getBoundingClientRect().bottom");
  win.setContentSize(800, 450);
  await wait("document.querySelector('.usage-tip').getBoundingClientRect().top > document.querySelector('.command-toolbar').getBoundingClientRect().bottom && innerHeight === 450");
  win.setContentSize(1200, 840);
  await click('.feature-overlay .display-close');
  await click('.interaction-menu > button');
  await click('#room-interactions [aria-label="使用建议"]');
  await win.loadURL(url);
  await wait("!!document.querySelector('.interaction-menu > button')");
  await openFilm();
  await wait("document.querySelector('[data-tip-page=movie]') && !document.querySelector('.usage-tip')");
  await click('.feature-overlay .display-close');
  await click('.interaction-menu > button');
  await click('#room-interactions [aria-label="使用建议"]');
  await run(buttons + ".find(b => b.textContent === '影碟机').click()");
  await wait(tipText + " === '全局示例'");
  await click('.feature-overlay .display-close');
  await click('.interaction-menu > button');
  await click('#room-interactions [aria-label="功能按键"]');
  await win.loadURL(url);
  await wait("!!document.querySelector('.interaction-menu > button')");
  await openFilm();
  await wait("!!document.querySelector('.usage-tip') && !document.querySelector('.command-toolbar')");
  await click('.feature-overlay .display-close');
  await click('.interaction-menu > button');
  await click('#room-interactions [aria-label="功能按键"]');
  await run(buttons + ".find(b => b.textContent === '影碟机').click()");
  await wait("!!document.querySelector('.command-toolbar-toggle')");
  async function verifyEdge() {
    const hidden = "getComputedStyle(document.querySelector('.command-toolbar')).visibility === 'hidden' && !document.querySelector('.usage-tip')";
    await wait("!!document.querySelector('[data-immersive-tools=hidden]') && " + hidden);
    await run("document.dispatchEvent(new PointerEvent('pointermove', {clientX: innerWidth - 1, clientY: innerHeight / 2}))");
    await wait("getComputedStyle(document.querySelector('.command-toolbar')).visibility === 'visible' && !!document.querySelector('.usage-tip')");
    await run("document.dispatchEvent(new PointerEvent('pointermove', {clientX: 40, clientY: 40}))");
    await wait(hidden);
  }
  const fixtures = 'http://127.0.0.1:5173/tests/ui/';
  await win.loadURL(fixtures + 'content-interactions.html?feature=typewriter');
  await wait("!!document.querySelector('.copying-work-card')");
  await click('.copying-work-card');
  await verifyEdge();
  await win.loadURL(fixtures + 'navigation-transitions.html');
  await wait("typeof window.openPreviewBook === 'function'");
  await run('window.openPreviewBook()');
  await wait("!!document.querySelector('.reading-mode')");
  await win.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b => b.textContent === '全屏阅读').click()", true);
  await verifyEdge();
  console.log('USAGE_TIPS_PASS');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
