import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');
const videoDir = path.resolve(desktopDir, '..', 'video');
const standalone = path.join(videoDir, '.next', 'standalone');

console.log('[desktop] building Next.js standalone…');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'build'], {
  cwd: videoDir,
  env: {
    ...process.env,
    DOCKER_BUILD: '1',
    NEXT_TELEMETRY_DISABLED: '1',
  },
  stdio: 'inherit',
  shell: true,
});
if (result.status !== 0) process.exit(result.status || 1);

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  console.error('[desktop] standalone server.js not found');
  process.exit(1);
}

const staticSrc = path.join(videoDir, '.next', 'static');
const staticDst = path.join(standalone, '.next', 'static');
if (fs.existsSync(staticSrc)) {
  fs.rmSync(staticDst, { recursive: true, force: true });
  fs.cpSync(staticSrc, staticDst, { recursive: true });
}

const envFile = path.join(standalone, '.env');
if (fs.existsSync(envFile)) fs.rmSync(envFile, { force: true });

const publicSrc = path.join(videoDir, 'public');
const publicDst = path.join(standalone, 'public');
if (fs.existsSync(publicSrc)) {
  fs.rmSync(publicDst, { recursive: true, force: true });
  fs.cpSync(publicSrc, publicDst, { recursive: true });
}

console.log('[desktop] standalone ready:', standalone);
