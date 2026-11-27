const { contextBridge, ipcRenderer } = require('electron');

let streamId = 0;

contextBridge.exposeInMainWorld('cyberStudy', {
  name: '赛博书房',
  readUsageTips: () => ipcRenderer.invoke('ui:read-usage-tips'),
  setInterfaceLanguage: language => ipcRenderer.send('ui:set-language', language),
  defaultSamples: {
    read: options => ipcRenderer.invoke('default-samples:read', options),
    finish: () => ipcRenderer.invoke('default-samples:finish')
  },
  snapshots: {
    save: input=>ipcRenderer.invoke('snapshots:save',input),
    list: ()=>ipcRenderer.invoke('snapshots:list'),
    read: name=>ipcRenderer.invoke('snapshots:read',name)
  },
  ai: {
    getSettings: () => ipcRenderer.invoke('ai:settings'),
    revealSettingsFile: () => ipcRenderer.invoke('ai:reveal-settings-file'),
    streamCurrent: async (input, onText) => {
      const id = ++streamId;
      const listener = (_event, source, part) => { if (source === id) onText(part); };
      ipcRenderer.on('ai:delta', listener);
      try { return await ipcRenderer.invoke('ai:stream', id, input); }
      finally { ipcRenderer.removeListener('ai:delta', listener); }
    },
    chatCurrent: input => ipcRenderer.invoke('ai:chat-current', input),
    listProviders: () => ipcRenderer.invoke('ai:list-providers'),
    chat: input => ipcRenderer.invoke('ai:chat', input)
  },
  importLocalAudio: bytes => ipcRenderer.invoke('music:import-local',bytes),
  globe: (action, input) => ipcRenderer.invoke('globe:request', action, input),
  onGlobeProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('globe:progress', listener);
    return () => ipcRenderer.removeListener('globe:progress', listener);
  },
  version: '0.1.0',
  stage: 'desktop-skeleton',
  bookTrash: (action, token) => ipcRenderer.invoke('books:trash', action, token),
  deleteBooks: (ids, count) => ipcRenderer.invoke('books:delete-many', ids, count),
  deleteBook: (id) => ipcRenderer.invoke('books:delete', id),
  migrateLegacyBooks: (payload) => ipcRenderer.invoke('books:migrate-legacy', payload),
  listBooks: (options) => ipcRenderer.invoke('books:list', options),
  getBookImportState: () => ipcRenderer.invoke('books:import-state'),
  importBooks: (folder) => ipcRenderer.invoke('books:import', folder),
  patchBook: (id, fields) => ipcRenderer.invoke('books:patch', id, fields),
  renameBook: (id, title) => ipcRenderer.invoke('books:rename', id, title),
  saveBookMarkdown: (book, previousContent) => ipcRenderer.invoke('books:save', book, previousContent),
  onBookImportProgress: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('books:progress', listener);
    return () => ipcRenderer.removeListener('books:progress', listener);
  },
  music: (provider, action, input) => ipcRenderer.invoke('music:request', provider, action, input),
  doubanMovie: (subjectId) => ipcRenderer.invoke('movie:douban', subjectId),
  doubanMovieInBrowser: (subjectId) => ipcRenderer.invoke('movie:douban-browser', subjectId),
  uploadMoviePoster: (bytes) => ipcRenderer.invoke('movie:upload-poster', bytes),
  cacheMoviePoster: (address) => ipcRenderer.invoke('movie:cache-poster', address),
  profiler: {
    getStatus: () => ipcRenderer.invoke('profiler:status'),
    startTrace: (options) => ipcRenderer.invoke('profiler:start-trace', options),
    stopTrace: () => ipcRenderer.invoke('profiler:stop-trace'),
    saveReport: (snapshot) => ipcRenderer.invoke('profiler:save-report', snapshot),
    getGpuInfo: () => ipcRenderer.invoke('profiler:gpu-info'),
    openTraces: () => ipcRenderer.invoke('profiler:open-traces'),
    onTraceState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('profiler:trace-state', listener);
      return () => ipcRenderer.removeListener('profiler:trace-state', listener);
    },
    onToggleHud: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('profiler:toggle-hud', listener);
      return () => ipcRenderer.removeListener('profiler:toggle-hud', listener);
    }
  }
});
