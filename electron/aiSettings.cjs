const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage, shell } = require('electron');
const { listProviders, chat } = require('./aiChat.cjs');

function settingsPath() {
  return path.join(app.isPackaged ? app.getPath('userData') : path.resolve(__dirname, '..'), 'ai-settings.json');
}

function initialize() {
  const file = settingsPath();
  if (fs.existsSync(file)) return;
  const legacy = path.join(app.getPath('userData'), 'ai-settings.json');
  const content = !app.isPackaged && fs.existsSync(legacy)
    ? fs.readFileSync(legacy) : fs.readFileSync(path.resolve(__dirname, '../ai-settings.example.json'));
  fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
}

function read() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

function describe(state = read()) {
  if (!listProviders().some(p => p.id === state.current?.provider) || typeof state.current.model !== 'string' || !state.current.model.trim())
    throw new Error('请在 ai-settings.json 中填写 current.provider 和 current.model。');
  return {
    current: { provider: state.current.provider, model: state.current.model.trim() },
    providers: listProviders().map(({ id, name }) => ({
      id, name,
      hasApiKey: Boolean(state.providers?.[id]?.apiKey?.trim() || state.providers?.[id]?.key)
    }))
  };
}

function chatCurrent({ messages, system }, onText) {
  const state = read();
  const entry = state.providers?.[state.current?.provider];
  const key = entry?.apiKey?.trim() || (entry?.key && safeStorage.decryptString(Buffer.from(entry.key, 'base64')));
  if (!key) throw new Error('请在 ai-settings.json 中填写当前厂商的 API Key。');
  return chat({ ...state.current, messages, system, apiKey: key }, fetch, onText);
}

function revealSettingsFile() {
  initialize();
  shell.showItemInFolder(settingsPath());
}

module.exports = { initialize, describe, chatCurrent, revealSettingsFile };
