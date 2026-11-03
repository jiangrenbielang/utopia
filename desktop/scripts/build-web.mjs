import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * 构建桌面客户端需要的两部分产物：
 *
 * 1. **静态导出的页面**（`video/out`）——`next build` 的 `output:'export'` 与 Route Handler
 *    互斥，所以构建期间必须把 `video/src/app/api` 临时移出源码树，构建后立刻还原。
 *    暂存目录用 `video/.tmp/api-stash`（`.tmp/` 已被 gitignore，即使中断也不会让
 *    `src/app/api` 以「已删除」的姿态暴露在版本控制里）。
 * 2. **服务核**（`desktop/resources/api`）——用 `tsc -p tsconfig.server.json` 编译
 *    `video/src/server`（一份逻辑，两个宿主：Next 的薄壳 Route 与这里的 Node 宿主）。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const videoDir = path.resolve(desktopDir, '..', 'video');

const apiSrc = path.join(videoDir, 'src', 'app', 'api');
const stashDir = path.join(videoDir, '.tmp', 'api-stash');
const outDir = path.join(videoDir, 'out');
const apiOutDir = path.join(desktopDir, 'resources', 'api');
const tscBin = path.join(videoDir, 'node_modules', 'typescript', 'bin', 'tsc');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** 把暂存的 src/app/api 放回原位；reason 只影响日志措辞 */
function restoreApi(reason) {
  if (!fs.existsSync(stashDir)) return;
  if (fs.existsSync(apiSrc)) fs.rmSync(apiSrc, { recursive: true, force: true });
  fs.renameSync(stashDir, apiSrc);
  console.log(`[desktop] 已还原 src/app/api${reason ? `（${reason}）` : ''}`);
}

function run(cmd, args, { cwd, env, shell = true } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: 'inherit',
    shell,
  });
  if (result.status !== 0) {
    console.error(`[desktop] 命令失败（exit=${result.status}）：${cmd} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }
}

// 0. 自愈：上次若停在暂存状态，先还原，避免源码树缺了 src/app/api
restoreApi('上次构建被中断，先自愈');

if (!fs.existsSync(apiSrc)) {
  console.error('[desktop] 找不到 video/src/app/api —— 源码树不完整，先还原后再构建');
  process.exit(1);
}

// 1. 静态导出
console.log('[desktop] 静态导出 Next.js（STATIC_EXPORT=1）…');
let restored = false;
const restoreOnce = (reason) => {
  if (restored) return;
  restored = true;
  restoreApi(reason);
};
// 正常结束、异常退出、Ctrl+C 都要还原
process.on('exit', () => restoreOnce('构建结束'));
process.on('SIGINT', () => {
  restoreOnce('收到中断信号');
  process.exit(130);
});
process.on('SIGTERM', () => {
  restoreOnce('收到终止信号');
  process.exit(143);
});

try {
  fs.mkdirSync(path.dirname(stashDir), { recursive: true });
  fs.renameSync(apiSrc, stashDir);
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  // 整条命令作为字符串交给 shell：shell:true 与参数数组并用会触发 DEP0190
  run(`${npm} run build`, [], { cwd: videoDir, env: { STATIC_EXPORT: '1', NEXT_TELEMETRY_DISABLED: '1' } });
} finally {
  restoreOnce('静态导出结束');
}

// 2. 校验导出产物
if (!fs.existsSync(path.join(outDir, 'index.html'))) {
  console.error('[desktop] 静态导出产物缺失：', outDir);
  process.exit(1);
}
if (fs.existsSync(path.join(outDir, 'api'))) {
  console.error('[desktop] 导出产物里不应出现 api 目录（说明 api 未被移出源码树）');
  process.exit(1);
}

// 3. 编译服务核（纯 tsc，不引入打包器）
console.log('[desktop] 编译服务核（tsc -p tsconfig.server.json）…');
if (!fs.existsSync(tscBin)) {
  console.error('[desktop] 找不到 typescript，请先在 video 目录执行 npm install');
  process.exit(1);
}
if (fs.existsSync(apiOutDir)) fs.rmSync(apiOutDir, { recursive: true, force: true });
// process.execPath 可能含空格，这里不走 shell
run(process.execPath, [tscBin, '-p', 'tsconfig.server.json'], { cwd: videoDir, shell: false });

if (!fs.existsSync(path.join(apiOutDir, 'server', 'index.js'))) {
  console.error('[desktop] 服务核编译产物缺失：', apiOutDir);
  process.exit(1);
}

// 4. 把应用版本留在产物里：主进程启动数据层时读它并注入 process.env.APP_VERSION
//    （打包后拿不到 video/package.json，所以必须随产物走）
const pkg = JSON.parse(fs.readFileSync(path.join(videoDir, 'package.json'), 'utf8'));
fs.writeFileSync(
  path.join(apiOutDir, 'app-version.json'),
  `${JSON.stringify({ version: pkg.version || '0.0.0' }, null, 2)}\n`,
  'utf8'
);

console.log('[desktop] 构建完成');
console.log('[desktop]   静态页面：', outDir);
console.log('[desktop]   服务核　：', apiOutDir);
