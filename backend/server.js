/**
 * Utopia · APK 安装包分发服务
 *
 * 纯 Node 内置 http 模块实现，零第三方依赖、无需 npm install。
 *
 * 启动:
 *   node server.js             # 默认端口 8080
 *   PORT=9000 node server.js   # 指定端口
 *
 * 路由:
 *   GET /             移动端下载页
 *   GET /versions.json  版本清单（no-store）
 *   GET /download      最新版 APK（302 重定向）
 *   GET /apk/<文件>     具体 APK 文件（支持断点续传 Range）
 *   GET /public/<文件>  静态资源（js/css/图标）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const APK_DIR = path.join(DATA_DIR, 'apk');
const VERSIONS_FILE = path.join(DATA_DIR, 'versions.json');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeOf(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** 读取版本清单；文件不存在或损坏时返回空结构，不崩溃 */
function readVersions() {
  try {
    const raw = JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf8'));
    return Array.isArray(raw.versions) ? raw : { app: {}, versions: [] };
  } catch {
    return { app: {}, versions: [] };
  }
}

/** 返回 buildNumber 最大的版本（最新版） */
function latestVersion(manifest) {
  const list = manifest.versions;
  if (!list.length) return null;
  return list.reduce((a, b) => (b.buildNumber > a.buildNumber ? b : a));
}

/**
 * 流式输出文件，支持 HTTP Range（移动端浏览器分块下载、断点续传必需）。
 */
function serveFile(req, res, filePath, { download = false } = {}) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const total = stat.size;
    const headers = {
      'Content-Type': mimeOf(filePath),
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    };
    if (download) {
      headers['Content-Disposition'] =
        `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`;
    }

    // 处理 Range 请求（部分下载）
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (m) {
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : total - 1;
        if (start >= total) {
          res.writeHead(416, { 'Content-Range': `bytes */${total}` });
          res.end();
          return;
        }
        if (end >= total) end = total - 1;
        const chunkLen = end - start + 1;
        res.writeHead(206, {
          ...headers,
          'Content-Length': chunkLen,
          'Content-Range': `bytes ${start}-${end}/${total}`,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

/** 防目录穿越：确保解析后的路径仍位于 base 目录内 */
function safeResolve(base, requested) {
  const resolved = path.normalize(path.join(base, requested));
  if (!resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }
  const pathname = decodeURIComponent(url.pathname);

  // —— 移动端/Web 应用直达入口 ——
  if (pathname === '/app' || pathname === '/web' || pathname === '/app/' || pathname === '/web/') {
    res.writeHead(302, { Location: '/public/web/index.html' });
    res.end();
    return;
  }

  // —— 下载页 ——
  if (pathname === '/' || pathname === '/index.html') {
    return serveFile(req, res, path.join(PUBLIC_DIR, 'index.html'));
  }

  // —— 版本清单（no-store，保证页面拿到最新数据）——
  if (pathname === '/versions.json') {
    res.setHeader('Cache-Control', 'no-store');
    return serveFile(req, res, VERSIONS_FILE);
  }

  // —— 最新版下载入口 ——
  if (pathname === '/download') {
    const latest = latestVersion(readVersions());
    if (!latest || !fs.existsSync(path.join(APK_DIR, latest.apkFile))) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('暂无可用安装包，请稍后再来');
      return;
    }
    res.writeHead(302, { Location: `/apk/${encodeURIComponent(latest.apkFile)}` });
    res.end();
    return;
  }

  // —— APK 文件 ——
  if (pathname.startsWith('/apk/')) {
    const filePath = safeResolve(APK_DIR, pathname.slice('/apk/'.length));
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }
    return serveFile(req, res, filePath, { download: true });
  }

  // —— 公共静态资源 ——
  if (pathname.startsWith('/public/')) {
    const filePath = safeResolve(PUBLIC_DIR, pathname.slice('/public/'.length));
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }
    return serveFile(req, res, filePath);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

server.listen(PORT, HOST, () => {
  console.log('==================================================');
  console.log('  Utopia · 安装包分发服务已启动');
  console.log(`  本机访问:     http://localhost:${PORT}/`);
  for (const name of Object.keys(os.networkInterfaces())) {
    for (const net of os.networkInterfaces()[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  局域网访问:   http://${net.address}:${PORT}/`);
      }
    }
  }
  console.log('  把上面「局域网访问」地址发给手机用户即可安装');
  console.log('  正式发布前请配置 HTTPS 域名（见 README.md）');
  console.log('==================================================');
});
