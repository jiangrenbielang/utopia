/**
 * 平台检测（三端对齐的内核设施）。
 *
 * 三端的运行形态：
 * - desktop：Electron 桌面客户端（preload 注入 utopiaDesktop 桥，有 WCO 标题栏、
 *   原生主题同步、玻璃材质等独有能力）；
 * - mobile：手机 / 平板浏览器或 PWA（触屏指针 + 窄视口，导航以底部栏为主）；
 * - web：桌面浏览器（完整顶栏导航，无原生桥）。
 *
 * 纯函数模块（无 React 依赖）：既被客户端组件使用，也被服务核编译
 * （tsconfig.server.json include src/lib/**）——保持零依赖两侧都安全。
 */

export type PlatformKind = 'desktop' | 'mobile' | 'web';

/** 移动端判定的视口宽度上限（与 Tailwind sm 断点一致） */
const MOBILE_MAX_WIDTH = 640;

/** 是否运行在 Electron 桌面客户端（preload 桥存在） */
export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { utopiaDesktop?: { isDesktop?: boolean } }).utopiaDesktop?.isDesktop
  );
}

/**
 * 检测当前平台。SSR 环境返回 'web'（与客户端首帧一致，避免 hydration 错位）。
 * 移动端判定：粗指针（触屏）+ 窄视口——两者都满足才视为移动端，
 * 避免触屏笔记本被误判。
 */
export function detectPlatform(): PlatformKind {
  if (typeof window === 'undefined') return 'web';
  if (isDesktopApp()) return 'desktop';
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    return coarse && window.innerWidth < MOBILE_MAX_WIDTH ? 'mobile' : 'web';
  } catch {
    return 'web';
  }
}
