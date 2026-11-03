'use strict';

/**
 * Electron 主进程内建的本地数据层：**静态页面 + /api/\***。
 *
 * 它取代了原先 `spawn` 出来的 Next.js standalone 服务——桌面客户端不再需要一个
 * 长驻的 Web 框架进程，页面是静态导出的产物（`video/out` → 打包后的 `web/`），
 * 数据接口由编译好的服务核（`video/src/server` → 打包后的 `api/`）在同一个端口上承载。
 *
 * **端口与 origin 必须保持 `http://127.0.0.1:3210` 不变**：localStorage / IndexedDB
 * 按 origin 隔离，换成 `file://` 或别的端口会让用户的课程库、学习记录、设置全部读不到。
 *
 * 静态解析顺序（对齐 Next.js 静态导出的产物布局）：
 *   `/`                → `index.html`
 *   `/courses`         → `courses.html`
 *   `/courses/detail`  → `courses/detail.html`
 *   `/_next/...`、`/icons/...`、`/favicon.ico` → 原样命中真实文件
 * 命中不了就回落 `404.html`（本项目的页面都是预渲染的，深链不依赖 SPA 回落）。
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

/** 扩展名 → Content-Type（只覆盖本产物里会出现的类型） */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.m4s': 'video/iso.segment',
  '.ts': 'video/mp2t',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.map': 'application/json; charset=utf-8',
};

/** HTML 不缓存（内容随版本变化）；带内容哈希的静态资源长缓存 */
const CACHE_HTML = 'no-cache, must-revalidate';
const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';

function contentTypeOf(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * 把 URL pathname 解析成 `webDir` 下的真实文件。
 * 越界（`..`、编码穿越）一律拒绝；命中目录而非文件时继续尝试下一个候选。
 */
function resolveStatic(webDir, pathname) {
  let clean;
  try {
    clean = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (clean.includes('\0')) return null;

  // 必须先规范化为绝对路径：越界校验是按 `path.sep` 比较字符串前缀的，
  // 而调用方传进来的可能是正斜杠路径（手工传参、或非 Windows 平台），
  // 不规范化会把所有合法请求都当成越界拒掉。
  const root = path.resolve(webDir);
  const rel = clean.replace(/^\/+/, '');
  const candidates = rel === '' ? ['index.html'] : [rel, `${rel}.html`, `${rel}/index.html`];

  for (const candidate of candidates) {
    const full = path.normalize(path.join(root, candidate));
    // 目录穿越防护：必须落在 root 之内
    if (full !== root && !full.startsWith(root + path.sep)) continue;
    try {
      const stat = fs.statSync(full);
      if (stat.isFile()) return { file: full, stat };
    } catch {
      /* 候选不存在，试下一个 */
    }
  }
  return null;
}

function cacheControlFor(filePath) {
  if (filePath.endsWith('.html')) return CACHE_HTML;
  // Next 的静态资源目录带内容哈希，可长缓存
  if (filePath.includes(`${path.sep}_next${path.sep}static${path.sep}`)) return CACHE_IMMUTABLE;
  if (filePath.includes(`${path.sep}icons${path.sep}`)) return CACHE_IMMUTABLE;
  return 'public, max-age=3600';
}

/**
 * 按 Range 头返回部分内容（本地媒体拖进度需要）；返回 true 表示已自行结束响应。
 * `status` 用于 404 兜底：不传时按 200，206/416 由 Range 分支自己决定。
 */
function sendFile(req, res, filePath, stat, status = 200) {
  const headers = {
    'Content-Type': contentTypeOf(filePath),
    'Cache-Control': cacheControlFor(filePath),
    'Last-Modified': stat.mtime.toUTCString(),
    'Accept-Ranges': 'bytes',
  };

  const range = req.headers.range;
  const method = (req.method || 'GET').toUpperCase();

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (match) {
      const size = stat.size;
      let start = match[1] === '' ? undefined : Number(match[1]);
      let end = match[2] === '' ? undefined : Number(match[2]);
      if (start === undefined && end !== undefined) {
        // `bytes=-N`：最后 N 字节
        start = Math.max(0, size - end);
        end = size - 1;
      } else {
        if (start === undefined) start = 0;
        if (end === undefined || end >= size) end = size - 1;
      }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return true;
      }
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
      });
      if (method === 'HEAD') {
        res.end();
        return true;
      }
      fs.createReadStream(filePath, { start, end })
        .on('error', () => res.destroy())
        .pipe(res);
      return true;
    }
  }

  res.writeHead(status, { ...headers, 'Content-Length': String(stat.size) });
  if (method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(filePath)
    .on('error', () => res.destroy())
    .pipe(res);
  return true;
}

/** 静态资源处理（未命中回落到 404.html） */
function serveStatic(req, res, webDir) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const found = resolveStatic(webDir, url.pathname);
  if (found) {
    sendFile(req, res, found.file, found.stat);
    return;
  }

  const notFound = path.join(webDir, '404.html');
  try {
    const stat = fs.statSync(notFound);
    sendFile(req, res, notFound, stat, 404);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

/**
 * 启动数据层。
 *
 * @param {object} options
 * @param {string} options.webDir   静态导出产物目录（dev: `video/out`；打包: `resources/web`）
 * @param {string} options.apiEntry 服务核入口（dev/打包: `…/api/server/index.js`）
 * @param {number} [options.port]   默认 3210，必须与 `WEB_BASE` 一致
 * @param {string} [options.host]   默认 127.0.0.1（只监听环回，不对外暴露）
 * @param {(msg: string) => void} [options.log]
 * @returns {Promise<http.Server>} 已就绪的 http.Server（未就绪时不 resolve）
 */
function start({ webDir, apiEntry, port = 3210, host = '127.0.0.1', log = () => {} }) {
  if (!fs.existsSync(path.join(webDir, 'index.html'))) {
    return Promise.reject(new Error(`缺少静态导出产物：${webDir}（请先执行 npm run build:web）`));
  }
  if (!fs.existsSync(apiEntry)) {
    return Promise.reject(new Error(`缺少服务核：${apiEntry}（请先执行 npm run build:web）`));
  }

  // 服务核是同一份源码编译出来的 Node 宿主，直接在主进程里跑
  const { handleRequest } = require(apiEntry);

  const server = http.createServer((req, res) => {
    const pathname = (req.url || '/').split('?')[0];
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      // 流式（NDJSON）与长连接（HTTP-FLV）都由服务核自行写回，这里不做缓冲
      handleRequest(req, res).catch((error) => {
        log(`[api] ${pathname} 处理失败: ${error && error.message ? error.message : error}`);
        if (!res.writableEnded) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '本地数据层内部错误' }));
        }
      });
      return;
    }
    try {
      serveStatic(req, res, webDir);
    } catch (error) {
      log(`[static] ${pathname} 处理失败: ${error && error.message ? error.message : error}`);
      if (!res.writableEnded) res.destroy();
    }
  });

  // 长连接（HTTP-FLV / NDJSON）不设响应超时；与旧版 Next standalone 的行为对齐
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 30_000;

  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      log(`本地数据层已就绪 http://${host}:${port}（静态: ${webDir}）`);
      resolve(server);
    });
  });
}

module.exports = { start };