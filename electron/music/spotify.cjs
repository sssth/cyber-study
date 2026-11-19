const path = require('node:path');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');

const idPattern = /^[a-zA-Z0-9]{22}$/;
const likedId = 'liked';
const validDevice = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const pairingPage = 'https://www.spotify.com/pair';
const readId = (uri, type) => {
  const prefix = `spotify:${type}:`;
  const id = typeof uri === 'string' && uri.startsWith(prefix) ? uri.slice(prefix.length) : '';
  return idPattern.test(id) ? id : '';
};

async function availablePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}

function createSpotify({ dataPath, resourcesPath, openExternal, request = fetch }) {
  let daemon;
  let starting;
  const directory = path.join(dataPath, 'spotify-player');
  const cache = path.join(dataPath, 'spotify-audio-cache');

  async function launch() {
    const candidates = [
      process.env.CYBER_STUDY_SPOTIFY_PLAYER,
      path.join(resourcesPath, 'spotify', 'go-librespot'),
      path.resolve(__dirname, '../../.spotify.local/go-librespot'),
      '/opt/homebrew/bin/go-librespot', '/usr/local/bin/go-librespot',
      ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'go-librespot')),
    ].filter(file => file && path.isAbsolute(file));
    let executable;
    for (const file of candidates) {
      try { await fs.access(file, constants.X_OK); executable = file; break; }
      catch { /* Check the next location. */ }
    }
    if (!executable) throw new Error('未找到 Spotify 播放组件 go-librespot（建议 0.10.7，或兼容的 0.10.6）。');
    const port = await availablePort();
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.mkdir(cache, { recursive: true, mode: 0o700 });
    const config = [
      'device_name: 赛博书房', 'zeroconf_enabled: false', 'disable_autoplay: true',
      'credentials:', '  type: device_auth',
      'server:', '  enabled: true', '  address: 127.0.0.1', `  port: ${port}`,
      'metadata:', '  enabled: true', '  max_tracks: 3000',
      'cache:', '  enabled: true', `  dir: ${JSON.stringify(cache)}`, '  size_limit: 1GB',
    ].join('\n') + '\n';
    await fs.writeFile(path.join(directory, 'config.yml'), config, { mode: 0o600 });
    const child = spawn(executable, ['--config_dir', directory], { stdio: 'ignore' });
    const instance = { child, base: `http://127.0.0.1:${port}`, ready: false };
    daemon = instance;
    const clear = () => { if (daemon === instance) daemon = undefined; };
    child.once('error', clear);
    child.once('exit', clear);
    try {
      for (let attempt = 0; attempt < 30 && daemon === instance; attempt++) {
        try {
          const response = await request(instance.base + '/', { signal: AbortSignal.timeout(500), redirect: 'error' });
          if (response.ok && daemon === instance) { instance.ready = true; return instance; }
        } catch { /* The local API is still starting. */ }
        await delay(150);
      }
      throw new Error('Spotify 播放组件无法启动，请检查安装版本。');
    } catch (error) {
      await stop();
      throw error;
    }
  }

  function ensure() {
    if (daemon?.ready) return Promise.resolve(daemon);
    if (!starting) starting = launch().finally(() => { starting = undefined; });
    return starting;
  }

  async function stop() {
    const instance = daemon;
    if (!instance) return;
    daemon = undefined;
    const { child } = instance;
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    const closed = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    const timer = setTimeout(() => child.kill('SIGKILL'), 1000);
    try { await closed; } finally { clearTimeout(timer); }
  }

  async function api(endpoint, body, { start = true } = {}) {
    const instance = start ? await ensure() : daemon;
    if (!instance?.ready) return null;
    const response = await request(instance.base + endpoint, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(7000),
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Spotify 播放组件请求失败（${response.status}）。`);
    if (body !== undefined) return {};
    return response.json();
  }

  async function status(start = true) {
    return api('/status', undefined, { start });
  }

  async function requireAccount() {
    if (!(await status())?.username) throw new Error('请先连接 Spotify 账号。');
  }

  async function pairing() {
    await ensure();
    for (let attempt = 0; attempt < 14; attempt++) {
      if ((await status())?.username) return { status: 'confirmed' };
      const pending = await api('/auth/code');
      if (pending?.code && Date.parse(pending.expires_at) > Date.now()) {
        const code = String(pending.code);
        if (!/^[a-z0-9-]{3,24}$/i.test(code)) throw new Error('Spotify 返回的配对码无效。');
        let url = pairingPage;
        try {
          const candidate = new URL(pending.url);
          if (candidate.protocol === 'https:' && ['spotify.com', 'www.spotify.com', 'accounts.spotify.com'].includes(candidate.hostname)
              && !candidate.username && !candidate.password && !candidate.port) url = candidate.href;
        } catch { /* The fixed pairing page accepts the code. */ }
        const qrcode = createRequire(require.resolve('NeteaseCloudMusicApi/package.json'))('qrcode');
        return { image: await qrcode.toDataURL(url, { width: 240 }), code };
      }
      await delay(350);
    }
    throw new Error('Spotify 未返回配对码，请稍后重试。');
  }

  async function playlists() {
    await requireAccount();
    const results = [{ id: likedId, title: '已赞歌曲', cover: '' }];
    for (let offset = 0; offset < 5000;) {
      const page = await api(`/library/playlists?offset=${offset}&limit=100`);
      if (!Array.isArray(page?.items)) throw new Error('Spotify 未返回歌单。');
      for (const item of page.items) {
        const id = readId(item.uri, 'playlist');
        if (id && item.name) results.push({ id, title: item.name, cover: spotifyImage(item.image_url) });
      }
      offset += page.items.length;
      if (!page.items.length || offset >= page.total) break;
    }
    return { playlists: results };
  }

  async function tracks(id) {
    if (id !== likedId && !idPattern.test(id)) throw new Error('Spotify 歌单编号无效。');
    await requireAccount();
    const uri = id === likedId ? 'spotify:collection:tracks' : `spotify:playlist:${id}`;
    const endpoint = '/context/tracks?' + new URLSearchParams({ uri });
    let list;
    for (let attempt = 0; attempt < 36; attempt++) {
      list = await api(endpoint);
      if (list?.ready && list.cached >= list.length) break;
      await delay(550);
    }
    if (!list?.ready) throw new Error('Spotify 歌单尚未载入，请稍后重试。');
    const songs = new Map();
    for (const entry of list.tracks || []) {
      const id = readId(entry.uri, 'track');
      const item = entry.track;
      if (!id || !item?.name) continue;
      songs.set(id, {
        provider: 'spotify', sourceId: id, title: item.name, artist: item.artist_names?.join(' / ') || '',
        cover: spotifyImage(item.album_cover_url), durationSeconds: (item.duration || 0) / 1000,
        spotifyUrl: `https://open.spotify.com/track/${id}`,
      });
    }
    return { tracks: [...songs.values()], pending: (list.tracks || []).filter(item => readId(item.uri, 'track') && !item.track).length };
  }

  function canPlayOn(device) {
    return !device.is_self && !device.is_offline && device.can_transfer && validDevice(device.id);
  }

  async function playbackStatus(deviceId) {
    if (deviceId) {
      const cluster = await api('/connect/devices', undefined, { start: false });
      const active = cluster?.active_device_id === deviceId;
      const track = active ? cluster.now_playing : null;
      return { connected: Boolean(cluster?.devices?.some(device => device.id === deviceId && canPlayOn(device))),
        id: readId(track?.track_uri, 'track'), playing: Boolean(track?.playing), stopped: !track,
        position: track?.position || 0, duration: track?.duration || 0 };
    }
    const info = await status(false);
    const track = info?.track;
    return { connected: Boolean(info?.username), id: readId(track?.uri, 'track'),
      playing: Boolean(track && !info.paused && !info.stopped && !info.buffering),
      stopped: !info || info.stopped, position: track?.position || 0, duration: track?.duration || 0 };
  }

  async function playTrack(input) {
    if (!idPattern.test(input.id)) throw new Error('Spotify 歌曲编号无效。');
    await requireAccount();
    const uri = `spotify:track:${input.id}`;
    if (input.deviceId) {
      const cluster = await api('/connect/devices');
      if (!cluster?.devices?.some(device => device.id === input.deviceId && canPlayOn(device))) {
        throw new Error('所选 Spotify 设备已离线，请重新选择。');
      }
      const playlist = input.playlistId === likedId ? 'spotify:collection:tracks'
        : idPattern.test(input.playlistId) ? `spotify:playlist:${input.playlistId}` : null;
      const result = await api('/connect/command', {
        device_id: input.deviceId, endpoint: 'play', uri: playlist || uri,
        ...(playlist ? { skip_to_uri: uri } : {}),
      });
      if (!result) throw new Error('Spotify 设备未接收播放请求。');
      await confirmTrack(input);
      if (position(input.position)) await control('seek', input);
      return;
    }

    // The daemon acknowledges the request before decoding or acquiring its audio key.
    const socket = new WebSocket(daemon.base.replace('http:', 'ws:') + '/events');
    let failure;
    const opened = new Promise(resolve => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', resolve, { once: true });
    });
    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type !== 'playback_error' || (message.data.uri && message.data.uri !== uri)) return;
        failure = /(?:audio key|aes key).*code 1/i.test(message.data.message)
          ? 'Spotify 拒绝向书房提供音频密钥。可以切换到 Spotify Connect 设备播放。'
          : 'Spotify 未能加载这首歌，请重试或切换播放设备。';
      } catch { /* Ignore messages unrelated to this request. */ }
    });
    try {
      await Promise.race([opened, delay(600)]);
      const result = await api('/player/play', { uri, position: position(input.position) });
      if (!result) throw new Error('Spotify 会话已断开，请重新连接。');
      await confirmTrack(input, () => failure);
    } finally {
      socket.close();
    }
  }

  async function confirmTrack(input, failure = () => undefined) {
    for (let attempt = 0; attempt < 24; attempt++) {
      if (failure()) throw new Error(failure());
      const playing = await playbackStatus(input.deviceId);
      if (playing.id === input.id && playing.playing) return;
      if (!playing.connected) throw new Error('Spotify 播放设备已断开。');
      await delay(250);
    }
    throw new Error(failure() || 'Spotify 没有开始播放。请重试或在唱片机里选择 Spotify Connect 设备。');
  }

  async function control(action, input) {
    if (input.deviceId) {
      if (!validDevice(input.deviceId)) throw new Error('Spotify 设备编号无效。');
      await api('/connect/command', { device_id: input.deviceId, endpoint: action === 'seek' ? 'seek_to' : action,
        ...(action === 'seek' ? { position: position(input.position) } : {}) }, { start: false });
      return;
    }
    await api(`/player/${action}`, action === 'seek' ? { position: position(input.position) } : {}, { start: false });
  }

  async function handle(action, input = {}) {
    switch (action) {
      case 'account': {
        try { await fs.access(path.join(directory, 'state.json')); }
        catch { if (!daemon) return { user: null }; }
        const info = await status();
        return { user: info?.username ? { id: info.username, name: info.username } : null };
      }
      case 'qr-start': return pairing();
      case 'qr-check': {
        if ((await status(false))?.username) return { status: 'confirmed' };
        const code = await api('/auth/code', undefined, { start: false });
        return { status: Date.parse(code?.expires_at) > Date.now() ? 'pending' : 'expired' };
      }
      case 'pair-open': await openExternal(pairingPage); return {};
      case 'logout':
        await stop();
        await fs.rm(path.join(directory, 'state.json'), { force: true });
        await fs.rm(path.join(directory, 'credentials.json'), { force: true });
        return {};
      case 'playlists': return playlists();
      case 'tracks': return tracks(input.id);
      case 'cache-status': return { supported: false };
      case 'devices': {
        await requireAccount();
        const cluster = await api('/connect/devices');
        return { devices: (cluster?.devices || []).filter(canPlayOn).map(({ id, name }) => ({ id, name })) };
      }
      case 'open-web-player': await openExternal('https://open.spotify.com/'); return {};
      case 'play': await playTrack(input); return {};
      case 'pause':
      case 'resume':
      case 'seek': await control(action, input); return {};
      case 'playback-status': return playbackStatus(input.deviceId);
      default: throw new Error('Spotify 操作无效。');
    }
  }
  return { handle, stop };
}

function position(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(86400000, Math.round(value))) : 0;
}
function spotifyImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

module.exports = { createSpotify };
