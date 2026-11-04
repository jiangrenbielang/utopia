'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('utopiaDesktop', {
  isDesktop: true,
  openSettings: () => ipcRenderer.send('desktop:open-settings'),
  /**
   * 同步页面外观到系统原生层（Electron 专用）：
   * - payload.theme：'system' | boolean —— nativeTheme.themeSource（决定系统
   *   对话框 / 滚动条等原生控件配色；粘性，'system' 用于恢复跟随操作系统）；
   * - payload.headerDark：顶栏实际是否为深色 —— WCO 窗口按钮（最小化/最大化/
   *   关闭）的图标颜色。壁纸模式会强制深色顶栏，即便主题/系统是浅色，
   *   此时图标也必须取白色，否则近黑图标叠近黑顶栏会「隐形」。
   * 兼容旧调用形式：布尔 / 'system' 字符串。
   */
  setNativeTheme: (payload) => ipcRenderer.invoke('desktop:set-native-theme', payload),
  /**
   * 桌面能力查询：返回 { glass }（Win11 玻璃材质可用性）。首屏脚本据此给
   * <html> 加 .glass-titlebar 启用玻璃顶栏样式。WCO 按钮区的让位几何由
   * 渲染层标准 CSS 环境变量 env(titlebar-area-*) 提供，不经此桥。
   * 浏览器环境无此 API，返回 null。
   */
  titleBarInfo: () => {
    try {
      return ipcRenderer.sendSync('desktop:titlebar-info');
    } catch {
      return null;
    }
  },
  /**
   * 窗口全屏切换（三端对齐 API）：桌面端切原生窗口全屏（标题栏一并隐藏），
   * 页面侧的 web/移动端由 desktop-bridge 回落 Fullscreen API。
   */
  toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
});
