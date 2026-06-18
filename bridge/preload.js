const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mcdu', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  connect: () => ipcRenderer.invoke('connect'),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
})
