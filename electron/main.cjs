const { nativeText, setWindowLanguage } = require('./i18n/native.cjs');
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const { registerAudioScheme, serveCachedAudio } = require('./music/cache.cjs');
const { serveMoviePosters, cacheMoviePoster, uploadMoviePoster } = require('./moviePosters.cjs');
const { registerGlobe } = require('./globe/register.cjs');
const { registerBooks } = require('./books.cjs');
const { registerMusic } = require('./music/register.cjs');
const { defaultSamples } = require('./defaultSamples.cjs');
const { configureGpuSwitches, registerProfiler } = require('./profiler.cjs');

configureGpuSwitches();

// 开发模式把运行数据留在项目目录，便于检查和清理；
// 打包后的应用使用系统默认的用户数据目录。
if (!app.isPackaged) {
  const runtimeDataDir = path.join(__dirname, '..', '.user-data');
  app.setPath('userData', runtimeDataDir);
  app.setPath('crashDumps', path.join(runtimeDataDir, 'crash-dumps'));
}

registerAudioScheme();

let mainWindow = null;
ipcMain.handle('ui:read-usage-tips', async event => {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) throw Error('Unavailable');
  return require('node:fs/promises').readFile(path.join(app.getAppPath(), '使用建议.md'), 'utf8');
});
ipcMain.on('ui:set-language', (event, language) => {
  if (event.sender === mainWindow?.webContents && event.senderFrame === event.sender.mainFrame) {
    setWindowLanguage(event.sender, language);
  }
});
const samples = defaultSamples(app.getPath('userData'));
for (const action of ['read', 'finish']) {
  ipcMain.handle('default-samples:' + action, (event, options) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('请从书房主页访问内置样例。');
    }
    return samples[action](options);
  });
}
const snapshots = require('./snapshots.cjs').snapshotStore(app.isPackaged ? app.getPath('userData') : path.resolve(__dirname,'..'));
for (const action of ['list','read','save']) {
  ipcMain.handle('snapshots:'+action,(event,input)=>{
    if(event.sender!==mainWindow?.webContents || event.senderFrame!==event.sender.mainFrame) throw Error('请从书房访问快照。');
    return snapshots[action](input);
  });
}
const aiChat = require('./aiChat.cjs');
const aiSettings = require('./aiSettings.cjs');
for (const [action, handler] of Object.entries({
  settings: () => aiSettings.describe(),
  'reveal-settings-file': aiSettings.revealSettingsFile,
  'chat-current': aiSettings.chatCurrent
})) {
  ipcMain.handle('ai:' + action, (event, input) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame)
      throw new Error('请从书房主页访问 AI 设置。');
    return handler(input);
  });
}
ipcMain.handle('ai:stream', (event, id, input) => {
  const frame = event.senderFrame;
  if (event.sender !== mainWindow?.webContents || !frame || frame !== event.sender.mainFrame)
    throw Error('请从书房主页发起对话。');
  return aiSettings.chatCurrent(input, part => frame.send('ai:delta', id, part));
});
ipcMain.handle('ai:list-providers', () => aiChat.listProviders());
ipcMain.handle('ai:chat', (event, input) => {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('请从书房主页发起对话。');
  }
  return aiChat.chat(input);
});
registerMusic(() => mainWindow);
registerBooks(() => mainWindow);
const serveMemoryPhotos = registerGlobe(() => mainWindow);
const { attachWindowShortcuts } = registerProfiler(() => mainWindow);

ipcMain.handle('movie:douban', async (event, subjectId) => {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame
      || typeof subjectId !== 'string' || !/^\d{1,20}$/.test(subjectId)) {
    return { error: '请输入有效的豆瓣电影条目链接。' };
  }

  const url = `https://movie.douban.com/subject/${subjectId}/`;
  try {
    const response = await session.fromPartition('persist:douban-movie').fetch(url, {
      redirect: 'manual',
      credentials: 'include',
      signal: AbortSignal.timeout(1500)
    });
    if (response.status === 404) return { error: '没有找到这个豆瓣条目，请检查链接。' };
    if (response.ok) return { html: await response.text() };
  } catch {
    // Chromium can report a manually stopped redirect as a network error.
  }
  return { needsBrowser: true };
});

ipcMain.handle('movie:cache-poster', (event, address) => {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) return '';
  return cacheMoviePoster(address).catch(() => '');
});

ipcMain.handle('music:import-local', async (event, bytes) => {if(event.sender!==mainWindow?.webContents||event.senderFrame!==event.sender.mainFrame)return {error:'无法访问音频导入。'};try{return await require('./music/cache.cjs').importLocalAudio(bytes);}catch(error){return {error:error.message};}});

ipcMain.handle('movie:upload-poster', (event, bytes) => {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) return {};
  return uploadMoviePoster(bytes).catch(() => ({ error: '无法读取或保存海报图片。' }));
});

ipcMain.handle('movie:douban-browser', (event, subjectId) => {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame
      || typeof subjectId !== 'string' || !/^\d{1,20}$/.test(subjectId)) {
    return { error: '请输入有效的豆瓣电影条目链接。' };
  }

  const url = new URL(`https://movie.douban.com/subject/${subjectId}/`);
  const browser = new BrowserWindow({
    parent: mainWindow,
    show: false,
    width: 1000,
    height: 780,
    title: nativeText(event.sender, 'i18n.nativeDoubanFilm'),
    webPreferences: { partition: 'persist:douban-movie', backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  const contents = browser.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const limitNavigation = (event, destination) => {
    const target = new URL(destination);
    if (target.protocol !== 'https:' || !['movie.douban.com', 'sec.douban.com', 'accounts.douban.com', 'www.douban.com'].includes(target.host)) {
      event.preventDefault();
    }
  };
  contents.on('will-navigate', limitNavigation);
  contents.on('will-redirect', limitNavigation);

  return new Promise((resolve) => {
    let reading = false;
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearInterval(retry);
      clearTimeout(deadline);
      resolve(result);
      if (!browser.isDestroyed()) browser.destroy();
    };
    const isSubject = (value) => {
      const current = URL.parse(value);
      return current?.origin === url.origin && current.pathname.replace(/\/$/, '') === url.pathname.slice(0, -1);
    };
    const readPage = async () => {
      if (finished || reading || contents.isDestroyed()) return false;
      reading = true;
      try {
        const snapshot = await contents.executeJavaScriptInIsolatedWorld(1001, [{
          code: `(() => {
            const hasTitle = document.querySelector('[property="v:itemreviewed"], #content h1 span, h1');
            const hasDetails = document.querySelector('#info, #mainpic, [property="v:itemreviewed"], meta[property="og:type"][content="video.movie"]');
            if (hasTitle && hasDetails) return { url: location.href, html: document.documentElement.outerHTML };
            const verification = document.querySelector(
              'input[name*="captcha" i], input[id*="captcha" i], iframe[src*="captcha" i], #captcha, .geetest_panel, input[type="password"]'
            );
            const visible = verification?.getClientRects().length > 0;
            const prompt = /请输入验证码|请完成.{0,12}验证|请.{0,12}滑块|点击.{0,12}验证/.test(document.body?.innerText ?? '');
            const challengeHost = ['sec.douban.com', 'accounts.douban.com'].includes(location.hostname);
            return { url: location.href, needsUser: visible || (challengeHost && prompt) };
          })()`
        }]);
        if (finished || !snapshot || snapshot.url !== contents.getURL()) return false;
        if (snapshot.needsUser && !browser.isVisible()) {
          clearTimeout(deadline);
          browser.show();
        }
        if (!snapshot.html || !isSubject(snapshot.url)) return false;
        finish({ html: snapshot.html });
        return true;
      } catch {
        return false;
      } finally {
        reading = false;
      }
    };
    const retry = setInterval(readPage, 250);
    const deadline = setTimeout(() => finish({ error: '等待豆瓣影片资料超时，请稍后重试。' }), 18000);
    browser.once('closed', () => finish({ error: '已关闭豆瓣页面，未获取影片资料。' }));
    contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) finish({ error: '豆瓣页面加载失败，请检查网络或代理设置后重试。' });
    });
    contents.on('dom-ready', readPage);
    contents.on('did-finish-load', readPage);
    contents.on('did-navigate-in-page', readPage);
    browser.loadURL(url.href).catch(() => {
      // Navigation failures are handled by did-fail-load.
    });
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#03060d',
    // hiddenInset 只在 macOS 生效，Windows 上会丢掉系统标题栏按钮，因此保留默认边框。
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  attachWindowShortcuts(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  aiSettings.initialize();
  samples.start().catch(error => console.error('内置样例初始化失败', error));
  serveCachedAudio();
  serveMoviePosters();
  serveMemoryPhotos();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
