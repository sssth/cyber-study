const { app, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { cacheTrack } = require('./cache.cjs');

const providers = new Set(['qq', 'netease']);
const sessions = new Map();
const pending = new Map();
const cookiePath = provider => path.join(app.getPath('userData'), `music-${provider}.enc`);

async function readCookie(provider) {
  if (sessions.has(provider)) return sessions.get(provider);
  if (!safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(await fs.readFile(cookiePath(provider)));
  } catch {
    return '';
  }
}

async function rememberCookie(provider, cookie) {
  if (!cookie || typeof cookie !== 'string') throw new Error('平台未返回登录凭证，请重新扫码。');
  if (safeStorage.isEncryptionAvailable()) {
    const target = cookiePath(provider);
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, safeStorage.encryptString(cookie), { mode: 0o600 });
      await fs.rename(temp, target);
    } finally {
      await fs.rm(temp, { force: true });
    }
  }
  sessions.set(provider, cookie);
}

async function loadQq() {
  const [client, login, identity] = await Promise.all([
    import('./simple-music/qq-client.mjs'),
    import('./simple-music/qq-qr-login.mjs'),
    import('./simple-music/device-identity.mjs'),
  ]);
  identity.setDeviceIdentityDir(app.getPath('userData'));
  return {
    async account(cookie) {
      if (!cookie) return null;
      const result = await client.getQQLoginInfo(cookie);
      return result.loggedIn
        ? { id: result.userId, name: result.nickname || 'QQ 音乐用户' }
        : null;
    },
    createQr: type => login.createQQQr(type),
    checkQr: (key, type) => login.checkQQQr(type, key),
    async playlists(cookie) {
      const result = await client.handleQQUserPlaylists(cookie);
      if (!result.loggedIn) throw new Error('QQ 音乐登录已失效，请重新扫码。');
      if (!result.playlists.some(item => item.id === 'qq-liked:201')) {
        const liked = await client.handleQQLikedPlaylist(cookie);
        if (liked.playlist) result.playlists.unshift(liked.playlist);
      }
      return result.playlists;
    },
    async tracks(cookie, id) {
      const result = await client.handleQQPlaylistTracks(cookie, id);
      if (result.loggedIn === false) throw new Error('QQ 音乐登录已失效，请重新扫码。');
      if (result.error) throw new Error('QQ 音乐未返回歌单曲目。');
      return result.tracks;
    },
    async stream(cookie, id, track) {
      const result = await client.handleQQSongUrl(cookie, id, track.mediaMid, 'standard', track.fee);
      const candidate = result.candidates?.find(item => httpsUrl(item.url));
      return { url: candidate?.url || result.url, preview: Boolean(candidate?.trial ?? result.trial) };
    },
  };
}

const isDigits = value => typeof value === 'string' && /^\d{1,20}$/.test(value);
const isMid = value => typeof value === 'string' && /^[a-zA-Z0-9]{1,32}$/.test(value);
function httpsUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.username || url.password) return '';
    if (url.protocol === 'http:' && /(?:^|\.)(?:music\.126\.net|music\.163\.com|qqmusic\.qq\.com)$/.test(url.hostname)) {
      url.protocol = 'https:';
    }
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}
const qrImage = value => typeof value === 'string' && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(value) ? value : '';

function registerMusic(getWindow) {
  ipcMain.handle('music:request', async (event, provider, action, input = {}) => {
    if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame || !providers.has(provider)) {
      return { error: '音乐请求来源无效。' };
    }
    if (action === 'cache-status') return { supported: true };
    try {
      const api = provider === 'qq' ? await loadQq() : require('./netease.cjs');
      if (action === 'qr-start') {
        const type = input.type === 'wx' ? 'wx' : 'qq';
        const request = { type, expires: Date.now() + 180000 };
        pending.set(provider, request);
        const qr = await api.createQr(type);
        if (pending.get(provider) !== request) return { status: 'expired' };
        request.key = qr.key;
        const image = qrImage(qr.image);
        if (!image || !request.key) throw new Error('平台未返回二维码，请重试。');
        return { image };
      }
      if (action === 'qr-check') {
        const qr = pending.get(provider);
        if (!qr?.key || qr.expires < Date.now()) {
          pending.delete(provider);
          return { status: 'expired' };
        }
        const result = await api.checkQr(qr.key, qr.type);
        if (pending.get(provider) !== qr) return { status: 'expired' };
        if (result.status === 'expired') pending.delete(provider);
        if (result.status === 'confirmed') {
          await rememberCookie(provider, result.cookie);
          pending.delete(provider);
        }
        return { status: result.status };
      }
      if (action === 'logout') {
        pending.delete(provider);
        await fs.rm(cookiePath(provider), { force: true });
        sessions.set(provider, '');
        return {};
      }

      const cookie = await readCookie(provider);
      if (action === 'account') return { user: await api.account(cookie) };
      if (!cookie) return { error: '请先扫码登录。' };
      if (action === 'playlists') {
        const user = await api.account(cookie);
        if (!user) return { error: '登录已失效，请重新扫码。' };
        const list = await api.playlists(cookie, user);
        return { playlists: list.map(item => ({ id: String(item.id), title: item.name, cover: httpsUrl(item.cover || item.coverImgUrl) })).filter(item => item.title) };
      }
      if (action === 'tracks') {
        if (!isDigits(input.id) && !(provider === 'qq' && input.id === 'qq-liked:201')) {
          return { error: '歌单编号无效。' };
        }
        const tracks = await api.tracks(cookie, input.id);
        return { tracks: tracks.map(item => ({
          provider, sourceId: String(item.id), title: item.name, artist: item.artist,
          cover: httpsUrl(item.cover), mediaMid: item.mediaMid, fee: item.fee,
        })).filter(item => item.title && (provider === 'qq' ? isMid(item.sourceId) : isDigits(item.sourceId))) };
      }
      if (action === 'stream' || action === 'cache-track') {
        if (!(provider === 'qq' ? isMid(input.id) : isDigits(input.id))) return { error: '歌曲编号无效。' };
        const resolveStream = async () => {
          const stream = await api.stream(cookie, input.id, {
            mediaMid: isMid(input.mediaMid) ? input.mediaMid : '',
            fee: input.fee === 1 ? 1 : 0,
          });
          if (stream.error) return { error: stream.error, retryable: stream.retryable };
          const url = httpsUrl(stream.url);
          return url ? { url, preview: stream.preview } : { error: '平台没有为当前账号返回可播放的音源。' };
        };
        return action === 'cache-track' ? await cacheTrack(provider, input.id, resolveStream) : await resolveStream();
      }
      return { error: '音乐操作无效。' };
    } catch (error) {
      if (error?.message === '平台未返回登录凭证，请重新扫码。') {
        pending.delete(provider);
        return { error: error.message };
      }
      return { error: '音乐平台请求失败，请稍后重试。' };
    }
  });
}

module.exports = { registerMusic };
