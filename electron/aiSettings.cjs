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
  const state = { current: { provider: 'deepseek', model: 'deepseek-flash' }, providers: {} };
  for (const { id, models } of listProviders()) state.providers[id] = { models, apiKey: '' };
  const legacy = path.join(app.getPath('userData'), 'ai-settings.json');
  const content = !app.isPackaged && fs.existsSync(legacy)
    ? fs.readFileSync(legacy) : JSON.stringify(state, null, 2) + '\n';
  fs.writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
}

function read() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

function describe(state = read()) {
  return {
    current: state.current || null,
    providers: listProviders().map(({ id, name, models }) => ({
      id, name, models: [...new Set([...models, ...(state.providers?.[id]?.models || [])])],
      hasApiKey: Boolean(state.providers?.[id]?.apiKey?.trim() || state.providers?.[id]?.key)
    }))
  };
}

function select({ provider, model, apiKey }) {
  if (!listProviders().some(p => p.id === provider) || typeof model !== 'string' || !model.trim())
    throw new Error('请选择厂商并填写模型 ID。');
  model = model.trim();
  const state = read();
  state.providers ||= {};
  const entry = state.providers[provider] ||= {};
  if (apiKey !== undefined) {
    if (typeof apiKey !== 'string') throw new Error('请输入有效的 API Key。');
    if (apiKey.trim()) {
      if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'))
        throw new Error('系统安全存储暂不可用。');
      entry.key = safeStorage.encryptString(apiKey.trim()).toString('base64');
    } else delete entry.key;
    entry.apiKey = '';
  }
  entry.models = [...new Set([...describe(state).providers.find(p => p.id === provider).models, model])];
  state.current = { provider, model };
  const file = settingsPath();
  fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
  return describe(state);
}

function chatCurrent({ messages, system }, onText) {
  const state = read();
  const entry = state.providers?.[state.current?.provider];
  const key = entry?.apiKey?.trim() || (entry?.key && safeStorage.decryptString(Buffer.from(entry.key, 'base64')));
  if (!key) throw new Error('请先选择模型并保存对应厂商的 API Key。');
  return chat({ ...state.current, messages, system, apiKey: key }, fetch, onText);
}

function revealSettingsFile() {
  initialize();
  shell.showItemInFolder(settingsPath());
}

module.exports = { initialize, describe, select, chatCurrent, revealSettingsFile };
