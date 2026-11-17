const { app, protocol } = require('electron');
const { createHash, randomUUID } = require('node:crypto');
const { createReadStream, createWriteStream } = require('node:fs');
const { mkdir, rename, rm, stat, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const scheme = 'study-audio';
const mediaTypes = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', flac: 'audio/flac',
  ogg: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac',
};
const pending = new Map();
const root = () => join(app.getPath('userData'), 'music-cache');
const cacheUrl = name => `${scheme}://audio/${name}`;
const maximumSize = 64 * 1024 * 1024;

function audioFormat(bytes) {
  if (bytes.toString('ascii', 0, 3) === 'ID3') return 'mp3';
  if (bytes.toString('ascii', 4, 8) === 'ftyp') return 'm4a';
  if (bytes.toString('ascii', 0, 4) === 'fLaC') return 'flac';
  if (bytes.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return 'aac';
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06)) return 'mp3';
  return '';
}

async function existingFile(key) {
  for (const extension of Object.keys(mediaTypes)) {
    const name = `${key}.${extension}`;
    if (await stat(join(root(), name)).then(file => file.isFile() && file.size > 0, () => false)) return name;
  }
  return '';
}

function allowedMediaUrl(value, provider) {
  const url = new URL(value);
  const domain = provider === 'netease'
    ? /(?:^|\.)(?:music\.126\.net|music\.163\.com)$/
    : /(?:^aqqmusic\.tc\.qq\.com$|(?:^|\.)(?:qqmusic\.qq\.com|music\.qq\.com|y\.qq\.com)$)/;
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && domain.test(url.hostname);
}

async function fetchAudio(address, provider, signal) {
  let url = address;
  for (let hops = 0; hops < 4; hops++) {
    if (!allowedMediaUrl(url, provider)) throw new Error('平台返回了无法缓存的音频地址。');
    const response = await fetch(url, { redirect: 'manual', signal });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      url = new URL(location, url).href;
      continue;
    }
    return response;
  }
  throw new Error('音频地址重定向次数过多。');
}

async function saveAudio(key, address, provider) {
  const signal = AbortSignal.timeout(45_000);
  const response = await fetchAudio(address, provider, signal);
  const expected = Number(response.headers.get('content-length'));
  if (response.status !== 200 || !response.body || expected > maximumSize) {
    await response.body?.cancel();
    throw new Error(response.status === 200 ? '音频文件过大或为空。' : `音频服务器返回 HTTP ${response.status}。`);
  }
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const temporary = join(root(), `${key}.${randomUUID()}.part`);
  let length = 0;
  let header = Buffer.alloc(0);
  const validate = new Transform({
    transform(chunk, _encoding, callback) {
      length += chunk.length;
      if (header.length < 12) header = Buffer.concat([header, chunk.subarray(0, 12 - header.length)]);
      callback(length > maximumSize ? new Error('音频文件过大。') : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), validate, createWriteStream(temporary, { mode: 0o600 }), { signal });
    const format = audioFormat(header);
    if (!format || length < 12 || (expected && !response.headers.get('content-encoding') && length !== expected)) {
      throw new Error('音频数据不完整或格式不受支持。');
    }
    const name = `${key}.${format}`;
    await rename(temporary, join(root(), name));
    return name;
  } finally {
    await rm(temporary, { force: true });
  }
}

function cacheTrack(provider, id, resolveStream) {
  const key = createHash('sha256').update(`${provider}:${id}`).digest('hex');
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      const existing = await existingFile(key);
      if (existing) return { cachedUrl: cacheUrl(existing), reused: true };
      const stream = await resolveStream();
      if (stream.error) return { error: stream.error };
      if (stream.preview) return { error: '平台只提供试听，未缓存。' };
      if (!stream.url) return { error: '平台未返回完整音源。' };
      const name = await saveAudio(key, stream.url, provider);
      return { cachedUrl: cacheUrl(name), reused: false };
    })().catch(error => ({
      error: error.name === 'TimeoutError' || error.name === 'AbortError'
        ? '缓存音频超时。' : error.message === 'fetch failed' ? '无法连接音频服务器。' : error.message,
    })).finally(() => pending.delete(key)));
  }
  return pending.get(key);
}

function registerAudioScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme, privileges: { standard: true, secure: true, stream: true } },
    { scheme: 'study-memory', privileges: { standard: true, secure: true } },
    { scheme: 'study-poster', privileges: { standard: true, secure: true } }]);
}

function serveCachedAudio() {
  protocol.handle(scheme, async request => {
    const url = new URL(request.url);
    const match = /^\/([a-f\d]{64})\.(mp3|m4a|flac|ogg|wav|aac)$/.exec(url.pathname);
    if (url.hostname !== 'audio' || !match || !['GET', 'HEAD'].includes(request.method)) {
      return new Response(null, { status: 404 });
    }
    const file = join(root(), url.pathname.slice(1));
    const size = await stat(file).then(item => item.isFile() ? item.size : 0, () => 0);
    if (!size) return new Response(null, { status: 404 });

    const headers = { 'Content-Type': mediaTypes[match[2]], 'Accept-Ranges': 'bytes' };
    const range = request.headers.get('range');
    let start = 0;
    let end = size - 1;
    if (range) {
      const parts = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (parts && (parts[1] || parts[2])) {
        if (parts[1]) start = Number(parts[1]);
        else start = Math.max(0, size - Number(parts[2]));
        if (parts[1] && parts[2]) end = Math.min(end, Number(parts[2]));
      }
      if (!parts || (!parts[1] && !parts[2]) || start > end || !Number.isSafeInteger(start)) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length'] = String(end - start + 1);
    const stream = request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(file, { start, end }));
    return new Response(stream, { status: range ? 206 : 200, headers });
  });
}

async function importLocalAudio(input) {
 const bytes=Buffer.from(input);if(!bytes.length||bytes.length>maximumSize)throw Error('请选择 64 MB 以内的音频。');const format=audioFormat(bytes);if(!format)throw Error('无法识别音频格式。');const id=createHash('sha256').update(bytes).digest('hex');await mkdir(root(),{recursive:true});const name=`${id}.${format}`,temp=join(root(),`${id}.${randomUUID()}.tmp`);try{await writeFile(temp,bytes);await rename(temp,join(root(),name));}finally{await rm(temp,{force:true});}return {id,cachedUrl:cacheUrl(name),audioAssetId:name};
}
module.exports = { importLocalAudio, cacheTrack, registerAudioScheme, serveCachedAudio };
