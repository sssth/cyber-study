const { app, protocol, session } = require('electron');
const { createHash, randomUUID } = require('node:crypto');
const { mkdir, readFile, rename, rm, stat, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

const directory = () => join(app.getPath('userData'), 'movie-posters');
const limit = 8 * 1024 * 1024;
const pending = new Map();
const types = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };

function posterFormat(bytes) {
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'jpg';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'gif';
  return '';
}

async function downloadPoster(url, key) {
  for (const extension of Object.keys(types)) {
    const name = `${key}.${extension}`;
    if (await stat(join(directory(), name)).then((entry) => entry.isFile() && entry.size > 0, () => false)) return name;
  }
  const response = await session.fromPartition('persist:douban-movie').fetch(url.href, {
    headers: { Referer: 'https://movie.douban.com/' },
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('无法下载豆瓣海报。');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('豆瓣海报文件过大。');
    chunks.push(chunk);
  }
  return savePoster(Buffer.concat(chunks), key);
}

async function savePoster(bytes, key) {
  const format = posterFormat(bytes);
  if (!format) throw new Error('请选择有效的 JPG、PNG、WebP 或 GIF 图片。');
  const name = `${key}.${format}`;

  await mkdir(directory(), { recursive: true });
  const temporary = join(directory(), randomUUID() + '.part');
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, join(directory(), name));
    return name;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function cacheMoviePoster(address) {
  const url = typeof address === 'string' && URL.parse(address);
  if (!url || url.protocol !== 'https:' || url.port || url.username || url.password
      || !/(^|\.)(doubanio\.com|douban\.com)$/.test(url.hostname)) return '';
  url.hash = '';
  const key = createHash('sha256').update(url.href).digest('hex');
  if (!pending.has(key)) {
    pending.set(key, downloadPoster(url, key).finally(() => pending.delete(key)));
  }
  const name = await pending.get(key);
  return `study-poster://movie/${name}`;
}

async function uploadMoviePoster(data) {
  if (!(data instanceof Uint8Array) || !data.byteLength || data.byteLength > limit) {
    return { error: '请选择 8 MB 以内的图片。' };
  }
  const bytes = Buffer.from(data);
  if (!posterFormat(bytes)) return { error: '请选择有效的 JPG、PNG、WebP 或 GIF 图片。' };
  const key = createHash('sha256').update(bytes).digest('hex');
  const name = await savePoster(bytes, key);
  return { poster: `study-poster://movie/${name}` };
}

function serveMoviePosters() {
  protocol.handle('study-poster', async (request) => {
    const url = new URL(request.url);
    const name = url.pathname.slice(1);
    const match = /^[a-f0-9]{64}\.(webp|jpg|png|gif)$/.exec(name);
    if (request.method !== 'GET' || url.host !== 'movie' || !match) {
      return new Response(null, { status: 404 });
    }
    try {
      return new Response(await readFile(join(directory(), name)), { headers: { 'Content-Type': types[match[1]] } });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

module.exports = { cacheMoviePoster, uploadMoviePoster, serveMoviePosters };
