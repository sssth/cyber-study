import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const web = new URL('./web/', import.meta.url);
const mimeTypes = new Map([
  ['html', 'text/html; charset=utf-8'],
  ['js', 'text/javascript; charset=utf-8'],
  ['css', 'text/css; charset=utf-8']
]);

const server = createServer(async (request, response) => {
  const pathname = request.url?.split('?')[0] ?? '';
  const isIndex = pathname === '/' || pathname === '/index.html';
  const isAsset = /^\/assets\/[\w-]+\.(js|css)$/.test(pathname);
  if ((!isIndex && !isAsset) || (request.method !== 'GET' && request.method !== 'HEAD')) {
    response.writeHead(404).end();
    return;
  }
  const path = isIndex ? 'index.html' : pathname.slice(1);
  try {
    const bytes = await readFile(new URL(path, web));
    const type = mimeTypes.get(path.split('.').pop()) ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' && isAsset ? 404 : 500).end('预览页面文件无法读取。');
  }
});

server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`场景包预览已启动 ${url}\n关闭此窗口可停止预览。`);
  if (process.argv.includes('--no-open')) return;
  for (const id of ['com.google.Chrome', 'com.microsoft.edgemac']) {
    if (spawnSync('/usr/bin/open', ['-b', id, url], { stdio: 'ignore' }).status === 0) return;
  }
  spawnSync('/usr/bin/open', [url], { stdio: 'ignore' });
});
