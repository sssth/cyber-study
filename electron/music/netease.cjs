// Uses the same NeteaseCloudMusicApi calls as YesPlayMusic's auth, user and track adapters.
const api = require('NeteaseCloudMusicApi');

async function call(name, params = {}) {
  const result = await api[name]({ ...params, timestamp: Date.now() });
  return result.body;
}

async function account(cookie) {
  if (!cookie) return null;
  const body = await call('user_account', { cookie });
  const id = body.profile?.userId ?? body.account?.id;
  return id && !body.account?.anonimousUser
    ? { id: String(id), name: body.profile?.nickname || '网易云用户' }
    : null;
}

async function createQr() {
  const { data: { unikey: key } } = await call('login_qr_key');
  const { data: { qrimg: image } } = await call('login_qr_create', { key, qrimg: true });
  return { key, image };
}

async function checkQr(key) {
  let body = await call('login_qr_check', { key, noCookie: true });
  if (body.code === 803 && !body.cookie) body = await call('login_qr_check', { key });
  const status = { 800: 'expired', 801: 'waiting', 802: 'scanned', 803: 'confirmed' }[body.code];
  if (!status) throw new Error('网易云未返回扫码状态，请刷新二维码。');
  return { status, cookie: body.cookie };
}

async function playlists(cookie, user) {
  const { collectNeteaseUserPlaylists } = await import('./simple-music/netease-user-playlists.mjs');
  return collectNeteaseUserPlaylists(async (offset, limit) => {
    const body = await call('user_playlist', { cookie, uid: user.id, offset, limit });
    if (!Array.isArray(body.playlist)) throw new Error('网易云未返回个人歌单。');
    return { items: body.playlist, more: body.more === true };
  });
}

async function tracks(cookie, id) {
  const detail = await call('playlist_detail', { cookie, id });
  const ids = detail.playlist?.trackIds?.map(track => String(track.id));
  if (!Array.isArray(ids)) throw new Error('网易云未返回歌单曲目。');
  const byId = new Map();
  for (let start = 0; start < ids.length; start += 200) {
    const body = await call('song_detail', { cookie, ids: ids.slice(start, start + 200).join(',') });
    if (!Array.isArray(body.songs)) throw new Error('网易云未返回歌单曲目。');
    for (const song of body.songs) byId.set(String(song.id), song);
  }
  return ids.map(id => byId.get(id)).filter(Boolean).map(song => ({
    id: song.id,
    name: song.name,
    artist: (song.ar ?? []).map(artist => artist.name).join(' / '),
    cover: song.al?.picUrl,
  }));
}

async function stream(cookie, id) {
  try {
    const body = await call('song_url_v1', { cookie, id, level: 'standard', crypto: 'weapi' });
    const song = body.data?.[0];
    if (!song?.url) {
      const code = Number(song?.code);
      const status = Number.isInteger(code) ? `（曲目状态 ${code}）` : '';
      return {
        error: `网易云没有为这首歌返回播放地址${status}。`,
        retryable: code >= 500,
      };
    }
    return { url: song?.url, preview: Boolean(song?.freeTrialInfo) };
  } catch (failure) {
    const code = Number(failure?.body?.code ?? failure?.status);
    if ([-460, -462, 429].includes(code)) {
      return { error: '网易云暂时限制了播放请求，请稍后再试。' };
    }
    if ([301, 401].includes(code)) {
      return { error: '网易云登录已失效，请重新扫码。' };
    }
    return { error: '网易云未能加载这首歌的播放地址，请稍后再试。', retryable: code >= 500 || !Number.isFinite(code) };
  }
}

module.exports = { account, createQr, checkQr, playlists, tracks, stream };
