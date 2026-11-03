/**
 * Electron 主进程通过 preload 注入的桥接对象。
 *
 * 目前只暴露「这是桌面端」与「打开桌面设置窗」两件事：
 * 令牌、内网上游开关等敏感配置一律留在主进程/服务端，页面拿不到。
 *
 * 注意：网页（Next 静态导出）里它是可缺失的，所有使用点都按可选处理，
 * 否则浏览器端会因为这层声明而误以为它一定存在。
 */
export {};

/**
 * 原生外观同步载荷。完整语义与发送逻辑见 src/lib/desktop-bridge.ts
 * （服务核编译范围内也有同一份声明，此处为页面侧引用入口）。
 */
export interface NativeAppearancePayload {
  /** 'system' 恢复跟随操作系统（themeSource 粘性，需显式恢复）；boolean 为显式亮/暗 */
  theme: boolean | 'system';
  /** 顶栏实际是否为深色（壁纸模式强制深色，即便主题为浅） */
  headerDark: boolean;
}

declare global {
  interface Window {
    utopiaDesktop?: {
      isDesktop?: boolean;
      /** 打开桌面客户端的设置窗（无应用菜单栏后它唯一的入口之一） */
      openSettings?: () => void;
      /**
       * 同步页面外观到 Electron 原生层。载荷：对象（推荐）或旧式
       * boolean / 'system'（兼容）。浏览器端无此方法。
       */
      setNativeTheme?: (payload: NativeAppearancePayload | boolean | 'system') => Promise<{ ok: boolean } | void> | void;
      /** 桌面能力 {glass}（Win11 玻璃材质）；WCO 几何走 env(titlebar-area-*)。非桌面 null */
      titleBarInfo?: () => { glass?: boolean } | null;
    };
  }
}