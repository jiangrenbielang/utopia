/**
 * 桌面端原生外观同步（Electron 专用；浏览器环境全部为空操作）。
 *
 * 页面侧是外观的唯一事实来源：
 * - `themeSource`（系统对话框 / 滚动条 / 原生控件配色）跟随页面主题；
 * - WCO 窗口按钮的图标颜色跟随**顶栏的实际深浅**——注意壁纸模式会强制
 *   深色玻璃 HUD（globals.css `html.has-wallpaper`），此时即使主题是浅色、
 *   系统是浅色，顶栏也是深的，图标必须用白色，否则近黑图标叠近黑顶栏
 *   会「隐形」。
 *
 * themeSource 的 system 语义：nativeTheme.themeSource 是粘性的（一旦显式
 * 写入 light/dark 就不再跟随系统）。因此仅在「system 模式且无壁纸覆盖」时
 * 恢复 'system'（此时页面外观本就由 OS 决定）；其余情况写入页面有效外观。
 *
 * 桥的类型就地声明（不 import src/types/desktop.d.ts）：本文件也被服务核
 * 编译（tsconfig.server.json include src/lib/**），那侧没有全局声明文件。
 */

/** 原生外观同步载荷：theme 决定 themeSource，headerDark 决定 WCO 按钮图标颜色 */
export interface NativeAppearancePayload {
  /** 'system' 恢复跟随操作系统（themeSource 粘性，需显式恢复）；boolean 为显式亮/暗 */
  theme: boolean | 'system';
  /** 顶栏实际是否为深色（壁纸模式强制深色，即便主题为浅） */
  headerDark: boolean;
}

/**
 * 页面侧的桥视图。不做 declare global（那会与 src/types/desktop.d.ts 的
 * 完整声明合并出窄化类型）：本文件也被服务核编译（tsconfig.server.json
 * include src/lib/**），那侧没有 d.ts 的全局声明，就地断言最稳。
 */
interface DesktopBridgeView {
  setNativeTheme?: (payload: NativeAppearancePayload | boolean | 'system') => unknown;
}

function desktopBridge(): DesktopBridgeView | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { utopiaDesktop?: DesktopBridgeView }).utopiaDesktop;
}

/** 页面当前有效外观是否为深色：主题深色，或壁纸模式（强制深色 HUD） */
export function pageAppearanceDark(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.classList.contains('dark') || root.classList.contains('has-wallpaper');
}

function storedThemeChoice(): 'light' | 'dark' | 'system' {
  try {
    const v = localStorage.getItem('libretv-theme');
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

function hasWallpaper(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('has-wallpaper');
}

/** 计算要发送给主进程的同步载荷（纯函数，便于测试） */
export function buildSyncPayload(): { theme: boolean | 'system'; headerDark: boolean } {
  const headerDark = pageAppearanceDark();
  const choice = storedThemeChoice();
  // system 模式且无壁纸覆盖：交还操作系统决定（themeSource 粘性，需显式恢复）；
  // 此时页面有效外观 == OS 外观，两者天然一致。壁纸开启时页面强制深色 HUD，
  // themeSource 也应写 dark（系统对话框与深色页面同色，避免割裂）。
  const theme: boolean | 'system' = choice === 'system' && !hasWallpaper() ? 'system' : headerDark;
  return { theme, headerDark };
}

/** 把页面有效外观同步到原生层（themeSource + WCO 按钮图标颜色） */
export function syncNativeAppearance(): void {
  const bridge = desktopBridge();
  if (!bridge?.setNativeTheme) return;
  try {
    void bridge.setNativeTheme(buildSyncPayload());
  } catch {
    /* 桥不可用（浏览器/旧版客户端）时忽略 */
  }
}

/**
 * 桌面端窗口控制（三端对齐的内核 API）：web / 移动端全部为空操作，
 * 页面代码可无差别调用——例如播放页全屏按钮，桌面端走原生窗口全屏
 * （标题栏一并隐藏，视频面积最大化），其余端回落 Fullscreen API。
 */
export function toggleWindowFullscreen(): void {
  if (typeof window === 'undefined') return;
  const bridge = desktopBridge();
  const fn = (bridge as unknown as { toggleFullscreen?: () => unknown })?.toggleFullscreen;
  if (!fn) {
    // 非桌面端：Fullscreen API（元素全屏），失败静默（iOS Safari 等受限环境）
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen().catch(() => {});
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    void fn();
  } catch {
    /* ignore */
  }
}
