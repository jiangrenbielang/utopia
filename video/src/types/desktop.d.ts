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

declare global {
  interface Window {
    utopiaDesktop?: {
      isDesktop?: boolean;
      /** 打开桌面客户端的设置窗（无应用菜单栏后它唯一的入口之一） */
      openSettings?: () => void;
      /** 把页面主题同步到 Electron 原生层（标题栏/滚动条颜色）；浏览器端无此方法 */
      setNativeTheme?: (dark: boolean) => Promise<{ ok: boolean } | void> | void;
      /** WCO 覆盖层几何 {width,height,glass}（像素）；非桌面/未启用 WCO 时 null */
      titleBarInfo?: () => { width: number; height: number; glass?: boolean } | null;
    };
  }
}