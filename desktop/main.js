'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

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
const WEB_BASE = `http://127.0.0.1:${WEB_PORT}`;

/**
 * 标题栏方案（Windows）：
 * - WCO（Window Controls Overlay）：隐藏系统标题栏，最小化/最大化/关闭按钮由系统
 *   以覆盖层浮在应用顶栏右侧，顶栏整体成为可拖拽区——消除「系统标题栏 + 应用顶栏」双条割裂；
 * - 玻璃材质：Win11 22H2（build ≥ 22621）起支持 backgroundMaterial，配合透明窗口，
 *   页面里只让顶栏一条透出亚克力材质，正文区铺实色（见 globals.css 的 window-glass 规则）。
 *   Win10 及更早版本回落为不透明窗口，顶栏接管与主题适配不受影响。
 */
const IS_WINDOWS = process.platform === 'win32';
const WIN_BUILD = IS_WINDOWS ? parseInt((os.release().split('.').pop() || '0'), 10) : 0;
const GLASS_SUPPORTED = IS_WINDOWS && WIN_BUILD >= 22621;

let config = { allowPrivateUpstream: true };
let configPath = '';
let webServer = null;
let mainWindow = null;
let settingsWindow = null;
let quitting = false;
/** 最近一次页面同步来的顶栏深浅（WCO 图标颜色依据；null = 尚未同步过 */
let lastHeaderDark = null;
/** 窗口状态防抖落盘计时器 */
let windowStateTimer = null;

/**
 * WCO 覆盖层设置：底色全透明（玻璃顶栏透出材质），仅按钮图标按顶栏深浅取反色
 * ——深色顶栏白图标、浅色顶栏近黑图标，保证最小化/最大化/关闭始终可见。
 */
function applyTitleBarOverlay(win, headerDark) {
  if (!IS_WINDOWS) return;
  try {
    win.setTitleBarOverlay({
      color: '#00000000',
      symbolColor: headerDark ? '#ffffff' : '#141416',
    });
  } catch (error) {
    log('set title bar overlay failed', String(error?.message || error));
  }
}

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
    // 自建网盘（AList / OpenList）常在本机或局域网；桌面数据层只监听环回地址，默认放行
    allowPrivateUpstream: true,
  };
}

/** 上次会话的窗口状态（位置/尺寸/是否最大化）；不存在或非法时返回 null */
function loadWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-state.json'), 'utf8'));
    if (
      state &&
      typeof state.x === 'number' &&
      typeof state.y === 'number' &&
      typeof state.width === 'number' &&
      typeof state.height === 'number' &&
      state.width >= 200 &&
      state.height >= 120
    ) {
      return state;
    }
  } catch {
    /* 首次运行 / 文件损坏：走默认尺寸 */
  }
  return null;
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    // 最小化时 getBounds 返回 (-32000)：只在正常/最大化态落盘
    if (mainWindow.isMinimized()) return;
    const bounds = mainWindow.getNormalBounds();
    fs.writeFileSync(
      path.join(app.getPath('userData'), 'window-state.json'),
      JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }, null, 2),
      'utf8'
    );
  } catch {
    /* ignore */
  }
}

function saveConfig() {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const disk = {
    allowPrivateUpstream: config.allowPrivateUpstream !== false,
  };
  fs.writeFileSync(configPath, JSON.stringify(disk, null, 2), 'utf8');
}

function loadConfig() {
  configPath = path.join(app.getPath('userData'), 'config.json');
  let disk = {};
  try {
    disk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    disk = {};
  }
  config = {
    ...defaultConfig(),
    // 老配置文件没有这个字段：缺省按「开启」处理（与 defaultConfig 一致）
    allowPrivateUpstream: disk.allowPrivateUpstream !== false,
  };
  saveConfig();
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

/**
 * 启动本地数据层：静态导出产物 + 服务核，都由本进程承载。
 *
 * 取代了原先 spawn 一个 Next.js standalone 服务的做法——桌面客户端不再需要长驻的
 * Web 框架进程。**端口与 origin 仍是 127.0.0.1:3210**：localStorage / IndexedDB 按
 * origin 隔离，换地址会让用户的课程库与学习记录全部读不到。
 */
async function startDataLayer() {
  const webDir = isDev ? path.join(ROOT, 'video', 'out') : path.join(process.resourcesPath, 'web');
  // apiRoot 是编译产物目录（server/ 与 app-version.json 都在它下面），显式声明避免路径层数算错
  const apiRoot = isDev
    ? path.join(ROOT, 'desktop', 'resources', 'api')
    : path.join(process.resourcesPath, 'api');
  const apiEntry = path.join(apiRoot, 'server', 'index.js');
  // 版本号：服务核的 status 处理器读 process.env.APP_VERSION。Next 宿主由 next.config.ts
  // 在构建期注入，主进程这边从构建产物里的 app-version.json 读取（打包后读不到 video/package.json）。
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(apiRoot, 'app-version.json'), 'utf8'));
    if (meta && meta.version) process.env.APP_VERSION = String(meta.version);
  } catch {
    /* 版本元数据缺失时 /api/status 会回落成 dev，不影响功能 */
  }

  /**
   * 放行内网上游媒体：自建 AList / OpenList 的直链通常就在本机或局域网
   * （`http://127.0.0.1:5244`、`http://192.168.x.x:5244`）。桌面数据层只监听 127.0.0.1，
   * 只有本机进程能访问，因此默认放行；用户可在设置窗里关掉。
   */
  process.env.ALLOW_PRIVATE_UPSTREAM = config.allowPrivateUpstream === false ? '0' : '1';

  /**
   * 网盘令牌的落盘目录：放到 Electron 的 userData 下，而不是安装目录
   * （安装目录可能只读、且卸载/重装会被清掉——这正是上一次把 AList 数据弄丢的原因）。
   */
  process.env.UTOPIA_DATA_DIR = path.join(app.getPath('userData'), 'netdisk');

  webServer = await require('./web-server.js').start({
    webDir,
    apiEntry,
    port: WEB_PORT,
    host: '127.0.0.1',
    log: (message) => log('[data]', message),
  });
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 420,
    parent: mainWindow || undefined,
    modal: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Utopia 设置',
    // 跟随 nativeTheme（主窗口页面切主题时会同步）：避免设置窗弹出时闪深色底
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f11' : '#f5f5f7',
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

/**
 * **不创建应用菜单栏**（Windows 上「文件 / 编辑 / 视图 / 帮助」那一条）。
 *
 * 需求：界面要干净、不与页面顶栏争抢顶部空间，所以整条菜单去掉。
 * 随之失去的能力都改到窗口内快捷键（见 bindWindowShortcuts）：
 * 缩放、整屏、开发者工具、打开桌面设置窗。
 */
function buildMenu() {
  Menu.setApplicationMenu(null);
}

/**
 * 无菜单栏后的窗口级快捷键。
 *
 * 只在主窗口内生效（`before-input-event`），不注册系统级快捷键——否则会和别的软件抢键。
 * 与原来菜单里的 role 对齐：zoomIn/zoomOut/resetZoom、togglefullscreen、toggleDevTools；
 * 另加 `Ctrl+,` 打开桌面设置窗（菜单删除后它唯一的入口，网页「设置」页也有按钮）。
 */
function bindWindowShortcuts(win) {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = String(input.key || '');
    const webContents = win.webContents;

    if (ctrl && (key === '=' || key === '+')) {
      webContents.setZoomLevel(webContents.getZoomLevel() + 0.5);
      event.preventDefault();
      return;
    }
    if (ctrl && key === '-') {
      webContents.setZoomLevel(webContents.getZoomLevel() - 0.5);
      event.preventDefault();
      return;
    }
    if (ctrl && key === '0') {
      webContents.setZoomLevel(0);
      event.preventDefault();
      return;
    }
    if (ctrl && key === ',') {
      openSettings();
      event.preventDefault();
      return;
    }
    if (key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
      return;
    }
    if (isDev && ctrl && input.shift && key.toLowerCase() === 'i') {
      webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

function createWindow() {
  // 上次会话的窗口位置/尺寸（恢复现场；首次运行走默认并居中由系统决定）
  const lastState = loadWindowState();
  mainWindow = new BrowserWindow({
    width: lastState?.width ?? 1280,
    height: lastState?.height ?? 860,
    ...(lastState ? { x: lastState.x, y: lastState.y } : {}),
    minWidth: 960,
    minHeight: 640,
    show: true,
    ...(GLASS_SUPPORTED
      ? {
          // 玻璃标题栏：透明窗口 + 亚克力材质（材质透过页面顶栏的半透明底显示）
          transparent: true,
          backgroundColor: '#00000000',
          backgroundMaterial: 'acrylic',
        }
      : {
          // 初始底色按系统主题：页面首屏脚本会把页面主题同步过来（nativeTheme），
          // 此后随切换刷新。避免浅色用户首启时窗口闪一帧深色。
          backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f11' : '#f5f5f7',
        }),
    // 顶栏即标题栏：隐藏系统标题栏，窗口控制按钮以覆盖层浮在应用顶栏（高 56 = h-14）右侧；
    // 覆盖层底色全透明，仅按钮图标按主题取色（页面首屏同步后会按顶栏实际深浅刷新）
    ...(IS_WINDOWS && {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        height: 56,
        color: '#00000000',
        symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#141416',
      },
    }),
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
  // 最大化/还原时重设 WCO 覆盖层：部分 Windows 版本在窗口状态切换时会
  // 丢弃覆盖层的自定义颜色（图标变回默认色甚至消失），显式重设兜底。
  // lastHeaderDark 为 null（页面尚未同步）时沿用创建时的系统主题判定。
  const reassertOverlay = () => {
    const dark = lastHeaderDark == null ? nativeTheme.shouldUseDarkColors : lastHeaderDark;
    applyTitleBarOverlay(mainWindow, dark);
  };
  mainWindow.on('maximize', reassertOverlay);
  mainWindow.on('unmaximize', reassertOverlay);
  mainWindow.webContents.on('did-finish-load', () => {
    log('did-finish-load', mainWindow?.webContents.getURL());
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    log('did-fail-load', code, description, url);
  });
  /**
   * 渲染层日志转发：页面被错误边界接住时只显示一句通用文案，异常堆栈只进浏览器控制台，
   * 而用户看不到控制台。转发到 desktop.log 才能在出问题时定位到具体报错。
   */
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const text = String(message || '');
    // 过滤噪音：只留 warning/error 级别的渲染层日志
    if (level >= 2 || text.includes('[Utopia]') || text.includes('Error')) {
      log('[renderer]', `lvl=${level}`, text.slice(0, 2000), `${sourceId || '-'}:${line ?? '-'}`);
    }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log('render process gone', JSON.stringify(details));
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  // 菜单栏已移除：缩放 / 整屏 / 开发者工具 / 打开设置 都靠窗口内快捷键
  bindWindowShortcuts(mainWindow);
  // 窗口状态持久化：移动/缩放/最大化变化后防抖落盘；关闭时立即保存
  const persistWindowState = () => {
    clearTimeout(windowStateTimer);
    windowStateTimer = setTimeout(saveWindowState, 800);
  };
  mainWindow.on('resize', persistWindowState);
  mainWindow.on('move', persistWindowState);
  mainWindow.on('maximize', persistWindowState);
  mainWindow.on('unmaximize', persistWindowState);
  mainWindow.on('close', saveWindowState);
  // 上次是最大化态：显示后恢复（先 show 再 maximize，避免透明窗口闪烁）
  if (lastState?.maximized) {
    mainWindow.once('ready-to-show', () => {
      try {
        mainWindow.maximize();
      } catch {
        /* ignore */
      }
    });
  }
  mainWindow.loadURL(`${WEB_BASE}${process.env.UTOPIA_START_PATH || '/'}`);
  mainWindow.show();
}

function registerIpc() {
  ipcMain.on('desktop:runtime', (event) => {
    event.returnValue = {
      isDesktop: true,
    };
  });
  ipcMain.on('desktop:open-settings', () => openSettings());
  /**
   * WCO 与玻璃能力查询（同步）：
   * - Electron 45 没有 getTitleBarOverlayRect API，WCO 几何由渲染层的标准
   *   CSS 环境变量 env(titlebar-area-*) 直接提供（Header 让位计算用它）；
   * - 这里只返回玻璃材质能力（Win11 22H2+），供首屏脚本决定是否给 <html>
   *   加 .glass-titlebar（启用玻璃顶栏样式）。
   * 非桌面环境返回 null，页面回落为浏览器外观。
   */
  ipcMain.on('desktop:titlebar-info', (event) => {
    try {
      event.returnValue = { glass: GLASS_SUPPORTED };
    } catch {
      event.returnValue = null;
    }
  });
  /**
   * 页面外观 → 原生层同步。载荷两种形式：
   * - 旧式：boolean（按主题亮暗）或 'system'（恢复跟随操作系统）；
   * - 对象：{ theme: boolean|'system', headerDark: boolean }。
   *   headerDark 是**顶栏的实际深浅**（壁纸模式强制深色 HUD，即便主题为浅），
   *   决定 WCO 按钮（最小化/最大化/关闭）的图标颜色——图标与顶栏同色系
   *   会在玻璃顶栏上「隐形」，必须按顶栏实际深浅取反色。
   *
   * themeSource（系统对话框/滚动条配色）跟随 theme；'system' 时恢复粘性源。
   * 同时刷新窗口底色（非玻璃模式防刷新闪深色）与 WCO 覆盖层。
   */
  ipcMain.handle('desktop:set-native-theme', (_event, payload) => {
    try {
      const isObject = payload !== null && typeof payload === 'object';
      const theme = isObject ? payload.theme : payload;
      const headerDarkSpecified = isObject && typeof payload.headerDark === 'boolean';
      const isSystem = theme === 'system';
      const themeDark = isSystem ? nativeTheme.shouldUseDarkColors : theme === true;
      const headerDark = headerDarkSpecified ? payload.headerDark : themeDark;

      if (isSystem) {
        nativeTheme.themeSource = 'system';
      } else {
        nativeTheme.themeSource = themeDark ? 'dark' : 'light';
      }
      lastHeaderDark = headerDark;
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!GLASS_SUPPORTED) {
          mainWindow.setBackgroundColor(themeDark ? '#0f0f11' : '#f5f5f7');
        }
        applyTitleBarOverlay(mainWindow, headerDark);
      }
      log(`native appearance -> ${isSystem ? 'system' : themeDark ? 'dark' : 'light'} (header ${headerDark ? 'dark' : 'light'})`);
    } catch (error) {
      log('native theme sync failed', String(error?.message || error));
    }
    return { ok: true };
  });
  ipcMain.handle('desktop:toggle-fullscreen', () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      return { ok: true };
    } catch (error) {
      log('toggle fullscreen failed', String(error?.message || error));
      return { ok: false };
    }
  });
  ipcMain.handle('settings:load', () => ({
    allowPrivateUpstream: config.allowPrivateUpstream !== false,
  }));
  ipcMain.handle('settings:save', (_event, data) => {
    // 布尔项：显式传入才改，未传（如老版设置窗）保持原值
    if (typeof data?.allowPrivateUpstream === 'boolean') {
      config.allowPrivateUpstream = data.allowPrivateUpstream;
    }
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
  log('bootstrap', JSON.stringify({ isDev, configPath }));
  registerIpc();
  buildMenu();

  try {
    log('starting data layer');
    await startDataLayer();
    await waitForHttp(`${WEB_BASE}/api/status`, 30000);
    log('data layer ready');
  } catch (error) {
    log('web failed', error?.message || error);
    dialog.showErrorBox('Utopia 启动失败', String(error?.message || error));
    app.quit();
    return;
  }

  log('creating window');
  createWindow();
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
  if (webServer) {
    try {
      webServer.close();
    } catch {
      /* ignore */
    }
    webServer = null;
  }
});

app.on('window-all-closed', () => {
  log('all windows closed');
  app.quit();
});
