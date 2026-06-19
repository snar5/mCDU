const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { SimConnectBridge } = require('./src/simconnect')
const { WsServer } = require('./src/wsserver')

let mainWindow
const bridge = new SimConnectBridge()
const wsServer = new WsServer()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.loadFile('renderer/index.html')
  mainWindow.setMenuBarVisibility(false)
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  createWindow()

  ipcMain.handle('get-settings', () => wsServer.getSettings())
  ipcMain.handle('save-settings', (_e, settings) => wsServer.updateSettings(settings))

  ipcMain.handle('connect', async () => {
    const result = await bridge.connect()
    if (result.success) wsServer.start()
    return result
  })

  ipcMain.handle('disconnect', () => {
    bridge.disconnect()
    wsServer.stop()
    return { success: true }
  })

  bridge.on('status', (status) => mainWindow?.webContents.send('status', status))
  bridge.on('cdu-data', (data) => wsServer.broadcast(data))
})

app.on('window-all-closed', () => {
  bridge.disconnect()
  wsServer.stop()
  if (process.platform !== 'darwin') app.quit()
})
