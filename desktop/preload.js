'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const runtime = ipcRenderer.sendSync('desktop:runtime');

contextBridge.exposeInMainWorld('utopiaDesktop', {
  isDesktop: true,
  companionUrl: runtime.companionUrl,
  token: runtime.token,
  openSettings: () => ipcRenderer.send('desktop:open-settings'),
});
