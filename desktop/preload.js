'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('utopiaDesktop', {
  isDesktop: true,
  openSettings: () => ipcRenderer.send('desktop:open-settings'),
  /**
   * 同步页面主题到系统原生层：Electron 的 nativeTheme 决定标题栏、
   * 系统对话框与滚动条等原生控件的颜色。页面是浅色而 nativeTheme 是深色时，
   * 顶部白色顶栏与系统标题栏会形成割裂（反之亦然）。
   */
  setNativeTheme: (dark) => ipcRenderer.invoke('desktop:set-native-theme', dark === true),
  /**
   * WCO（Window Controls Overlay）几何：app-region: drag 需要避开系统
   * 最小化/最大化/关闭按钮的落点，CSS 变量 --ut-titlebar-w/h 由这里提供。
   * 浏览器环境无此 API，返回 null。
   */
  titleBarInfo: () => {
    try {
      return ipcRenderer.sendSync('desktop:titlebar-info');
    } catch {
      return null;
    }
  },
});
