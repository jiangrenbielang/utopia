/**
 * Utopia · 发布脚本
 *
 * 前端团队构建出 APK 后，运行本脚本即可发布为「最新版」并生成版本清单。
 *
 * 用法:
 *   node publish.js <apk路径> --version 1.0.0 --changelog "更新说明"
 *   node publish.js <apk路径> --version 1.1.0 --build 3 \
 *       --changelog "修复了倒计时偶发不刷新的问题" \
 *       --changelog "统计页新增空态提示"
 *
 * 参数:
 *   <apk路径>      必填，构建产物路径（apk 或 aab）
 *   --version     必填，版本号，如 1.0.0
 *   --build       可选，构建号；缺省自动取「当前最大构建号 + 1」
 *   --changelog   可选，可多次传，每行一条更新说明
 *
 * 效果:
 *   1. 把 APK 复制到 data/apk/ 并统一命名为 utopia-v<版本>-b<构建号>.apk
 *   2. 计算文件大小与 SHA-256，更新 data/versions.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const APK_DIR = path.join(ROOT, 'data', 'apk');
const VERSIONS_FILE = path.join(ROOT, 'data', 'versions.json');

// ---------- 命令行参数解析 ----------
const args = process.argv.slice(2);
const positional = [];
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    if (key === 'changelog') {
      (flags.changelog = flags.changelog || []).push(args[++i]);
    } else {
      flags[key] = args[++i];
    }
  } else {
    positional.push(args[i]);
  }
}

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

const srcFile = positional[0];
const version = flags.version;
const buildInput = flags.build;
const changelog = flags.changelog || [];

if (!srcFile) fail('缺少 APK 路径。用法: node publish.js <apk路径> --version 1.0.0 --changelog "说明"');
if (!version) fail('缺少 --version。用法: node publish.js <apk路径> --version 1.0.0');
if (!fs.existsSync(srcFile)) fail('文件不存在: ' + srcFile);
if (!/\.(apk|aab)$/i.test(srcFile)) fail('仅支持 .apk / .aab 文件，收到: ' + srcFile);

// ---------- 读取版本清单 ----------
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf8'));
} catch {
  manifest = { app: { name: 'Utopia', packageName: 'com.yanshiji.app' }, versions: [] };
}
if (!Array.isArray(manifest.versions)) manifest.versions = [];

// ---------- 计算构建号 ----------
let build;
if (buildInput) {
  build = parseInt(buildInput, 10);
  if (Number.isNaN(build)) fail('--build 必须是数字');
} else {
  build = manifest.versions.reduce((max, v) => Math.max(max, v.buildNumber || 0), 0) + 1;
}

// ---------- 复制并重命名 APK ----------
const targetName = `utopia-v${version}-b${build}.apk`;
const targetFile = path.join(APK_DIR, targetName);
fs.copyFileSync(srcFile, targetFile);

const size = fs.statSync(targetFile).size;
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(targetFile)).digest('hex');

// ---------- 更新版本清单 ----------
const entry = {
  version,
  buildNumber: build,
  apkFile: targetName,
  fileSizeBytes: size,
  sha256,
  releaseDate: new Date().toISOString().slice(0, 10),
  changelog,
};
const idx = manifest.versions.findIndex((v) => v.buildNumber === build);
if (idx >= 0) {
  manifest.versions[idx] = entry;
} else {
  manifest.versions.push(entry);
}
manifest.versions.sort((a, b) => b.buildNumber - a.buildNumber);
fs.writeFileSync(VERSIONS_FILE, JSON.stringify(manifest, null, 2) + '\n');

// ---------- 输出结果 ----------
console.log('');
console.log('✔ 发布成功');
console.log('  APK:      ' + path.relative(ROOT, targetFile));
console.log('  版本:     v' + version + ' (build ' + build + ')');
console.log('  大小:     ' + (size / 1024 / 1024).toFixed(2) + ' MB');
console.log('  SHA-256:  ' + sha256.slice(0, 16) + '…');
console.log('  更新日志: ' + (changelog.length ? changelog.join(' / ') : '（无）'));
console.log('');
console.log('  重启分发服务后，用户即可在下载页看到新版本。');
