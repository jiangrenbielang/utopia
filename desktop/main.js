'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  safeStorage,
  session,
  shell,
} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

function bootLog(message) {
  try {
    fs.appendFileSync(path.join(os.tmpdir(), 'utopia-desktop-boot.log'), `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

bootLog(`main loaded packaged=${app.isPackaged} exec=${process.execPath}`);

const isDev = !app.isPackaged;
const ROOT = path.resolve(__dirname, '..');
const WEB_PORT = 3210;
const COMPANION_PORT = 8765;
const WEB_BASE = `http://127.0.0.1:${WEB_PORT}`;

let config = { token: '', password: 'utopia2026', sessdata: '' };
let configPath = '';
let firstRun = false;
let webProc = null;
let companionProc = null;
let mainWindow = null;
let settingsWindow = null;
let quitting = false;

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map((x) => String(x)).join(' ')}`;
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'desktop.log'), `${line}\n`, 'utf8');
  } catch {
    /* ignore */
  }
  console.log(line);
}

function defaultConfig() {
  return {
    token: crypto.randomBytes(24).toString('base64url'),
    password: 'utopia2026',
    sessdata: '',
  };
}

function encodeSecret(value) {
  if (!value) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(value).toString('base64')}`;
    }
  } catch {
    /* fall through */
  }
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
}

function decodeSecret(value) {
  if (!value) return '';
  try {
    if (value.startsWith('enc:')) {
      if (!safeStorage.isEncryptionAvailable()) return '';
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
    }
    if (value.startsWith('plain:')) return Buffer.from(value.slice(6), 'base64').toString('utf8');
  } catch {
    return '';
  }
  return '';
}

function saveConfig() {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const disk = {
    token: config.token,
    password: encodeSecret(config.password),
    sessdata: encodeSecret(config.sessdata),
  };
  fs.writeFileSync(configPath, JSON.stringify(disk, null, 2), 'utf8');
}

function loadConfig() {
  configPath = path.join(app.getPath('userData'), 'config.json');
  firstRun = !fs.existsSync(configPath);
  let disk = {};
  try {
    disk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    disk = {};
  }
  config = {
    ...defaultConfig(),
    ...disk,
    password: decodeSecret(disk.password) || 'utopia2026',
    sessdata: decodeSecret(disk.sessdata) || '',
  };
  if (!disk.token) saveConfig();
}

function findMpv() {
  const candidates = [];
  if (isDev) {
    if (process.env.MPV_PATH) candidates.push(process.env.MPV_PATH);
    candidates.push(path.join(ROOT, 'desktop', 'resources', 'mpv', 'mpv.exe'));
    candidates.push('C:\\Program Files\\MPV Player\\mpv.exe');
    candidates.push('C:\\Program Files\\mpv\\mpv.exe');
  } else {
    candidates.push(path.join(process.resourcesPath, 'mpv', 'mpv.exe'));
  }
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

function waitForHttp(url, timeoutMs, accept = (res) => res.statusCode < 500) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (accept(res)) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(2500, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error(`等待服务超时：${url}`));
      else setTimeout(attempt, 350);
    };
    attempt();
  });
}

function startWeb() {
  const server = isDev
    ? path.join(ROOT, 'video', '.next', 'standalone', 'server.js')
    : path.join(process.resourcesPath, 'web', 'server.js');
  if (!fs.existsSync(server)) {
    throw new Error('缺少 Next.js standalone 构建，请先在 desktop 目录执行 npm run build:web');
  }
  webProc = spawn(process.execPath, [server], {
    cwd: path.dirname(server),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(WEB_PORT),
      HOSTNAME: '127.0.0.1',
      PASSWORD: config.password,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  webProc.stdout?.on('data', (chunk) => log('[web]', chunk.toString().trim()));
  webProc.stderr?.on('data', (chunk) => log('[web:err]', chunk.toString().trim()));
  webProc.on('exit', (code) => {
    log('web exited', code);
    if (!quitting) {
      dialog.showErrorBox('Utopia Web 服务退出', `本地 Web 服务意外退出（code=${code}）。`);
      app.quit();
    }
  });
}

async function startCompanion() {
  const dataDir = path.join(app.getPath('userData'), 'companion-data');
  fs.mkdirSync(dataDir, { recursive: true });
  const env = {
    ...process.env,
    TOKEN: config.token,
    SESSDATA: config.sessdata,
    PORT: String(COMPANION_PORT),
    HOST: '127.0.0.1',
    MPV_PATH: findMpv(),
    UTOPIA_DATA_DIR: dataDir,
    PYTHONIOENCODING: 'utf-8',
  };
  let cmd;
  let args;
  let cwd;
  if (isDev) {
    const script = path.join(ROOT, 'companion', 'run.py');
    if (!fs.existsSync(script)) throw new Error('本地 companion 目录不存在');
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python');
    cmd = python;
    args = python === 'py' ? ['-3', script] : [script];
    cwd = path.dirname(script);
  } else {
    const exe = path.join(process.resourcesPath, 'companion', 'utopia-companion.exe');
    if (!fs.existsSync(exe)) throw new Error('安装包缺少 utopia-companion.exe');
    cmd = exe;
    args = [];
    cwd = path.dirname(exe);
  }
  companionProc = spawn(cmd, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  companionProc.stdout?.on('data', (chunk) => log('[companion]', chunk.toString().trim()));
  companionProc.stderr?.on('data', (chunk) => log('[companion:err]', chunk.toString().trim()));
  companionProc.on('exit', (code) => {
    log('companion exited', code);
    if (!quitting) {
      console.error('companion exited', code);
    }
  });
  await waitForHttp(`http://127.0.0.1:${COMPANION_PORT}/api/health`, 30000);
}

async function loginWeb() {
  const response = await fetch(`${WEB_BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: config.password }),
  });
  if (!response.ok) {
    console.error('web login failed', response.status);
    return;
  }
  const rawCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  for (const raw of rawCookies) {
    const pair = String(raw).split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    await session.defaultSession.cookies.set({
      url: WEB_BASE,
      name,
      value,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
  }
}

function navigate(pathname) {
  if (mainWindow) mainWindow.loadURL(`${WEB_BASE}${pathname}`);
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 560,
    parent: mainWindow || undefined,
    modal: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Utopia 设置',
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'Utopia',
      submenu: [
        { label: '首页', click: () => navigate('/') },
        { label: '课程库', click: () => navigate('/courses') },
        { label: '本地高清', click: () => navigate('/local-player') },
        { label: '统计', click: () => navigate('/stats') },
        { type: 'separator' },
        { label: '设置 B 站登录 / 密码', click: openSettings },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '打开本地高清说明',
          click: () => navigate('/local-player'),
        },
        {
          label: '打开项目目录',
          click: () => shell.openPath(ROOT).catch(() => {}),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: true,
    backgroundColor: '#0b1220',
    title: 'Utopia',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    log('main window closed');
    mainWindow = null;
  });
  mainWindow.webContents.on('did-finish-load', () => {
    log('did-finish-load', mainWindow?.webContents.getURL());
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    log('did-fail-load', code, description, url);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log('render process gone', JSON.stringify(details));
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.loadURL(`${WEB_BASE}${process.env.UTOPIA_START_PATH || '/'}`);
  mainWindow.show();
}

function stopChild(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* ignore */
  }
}

function registerIpc() {
  ipcMain.on('desktop:runtime', (event) => {
    event.returnValue = {
      isDesktop: true,
      companionUrl: `http://127.0.0.1:${COMPANION_PORT}`,
      token: config.token,
    };
  });
  ipcMain.on('desktop:open-settings', () => openSettings());
  ipcMain.handle('settings:load', () => ({
    sessdataConfigured: Boolean(config.sessdata),
    passwordConfigured: Boolean(config.password),
  }));
  ipcMain.handle('settings:save', (_event, data) => {
    const nextSessdata = String(data?.sessdata || '').trim();
    const nextPassword = String(data?.password || '').trim();
    if (data?.clearSessdata) config.sessdata = '';
    else if (nextSessdata) config.sessdata = nextSessdata;
    if (nextPassword) config.password = nextPassword;
    saveConfig();
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 300);
    return { ok: true };
  });
  ipcMain.on('settings:close', () => {
    if (settingsWindow) settingsWindow.close();
  });
}

async function bootstrap() {
  app.setAppUserModelId('com.utopia.desktop');
  loadConfig();
  log('bootstrap', JSON.stringify({ isDev, configPath, firstRun, hasSessdata: Boolean(config.sessdata) }));
  registerIpc();
  buildMenu();

  let companionError = '';
  try {
    log('starting web');
    startWeb();
    await waitForHttp(`${WEB_BASE}/api/status`, 30000);
    log('web ready');
  } catch (error) {
    log('web failed', error?.message || error);
    dialog.showErrorBox('Utopia 启动失败', String(error?.message || error));
    app.quit();
    return;
  }

  try {
    log('starting companion');
    await startCompanion();
    log('companion ready');
  } catch (error) {
    companionError = String(error?.message || error);
    log('companion failed', companionError);
  }

  try {
    log('login web');
    await loginWeb();
  } catch (error) {
    log('loginWeb error', error?.message || error);
  }

  log('creating window');
  createWindow();
  if (firstRun) {
    mainWindow?.webContents.once('did-finish-load', () => openSettings());
  }
  if (companionError) {
    mainWindow?.webContents.once('did-finish-load', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '本地高清不可用',
        message: '本地 mpv 伴生程序没有启动。',
        detail: `${companionError}\n\nWeb 平台仍可使用；请检查安装包中的 companion/mpv，或在设置中确认配置。`,
      });
    });
  }
}

const gotLock = app.requestSingleInstanceLock();
bootLog(`single instance lock=${gotLock}`);
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    bootLog('app ready');
    return bootstrap();
  }).catch((error) => {
    bootLog(`bootstrap error ${error?.stack || error}`);
    dialog.showErrorBox('Utopia 启动失败', String(error?.stack || error));
    app.quit();
  });
}

app.on('before-quit', () => {
  log('before-quit');
  quitting = true;
  stopChild(webProc);
  stopChild(companionProc);
});

app.on('window-all-closed', () => {
  log('all windows closed');
  app.quit();
});
