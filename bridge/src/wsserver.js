const { WebSocketServer } = require('ws')
const EventEmitter = require('events')

const DEFAULT_HOST = '0.0.0.0'
const DEFAULT_PORT = 8765

class WsServer extends EventEmitter {
  constructor() {
    super()
    this._wss = null
    this._clients = new Set()
    this._settings = { host: DEFAULT_HOST, port: DEFAULT_PORT }
  }

  getSettings() {
    return { ...this._settings }
  }

  updateSettings({ host, port } = {}) {
    if (host !== undefined) this._settings.host = host
    if (port !== undefined) this._settings.port = Number(port)
    return { success: true }
  }

  start() {
    if (this._wss) return { success: true }
    this._wss = new WebSocketServer({ host: this._settings.host, port: this._settings.port })
    this._wss.on('connection', (ws) => {
      this._clients.add(ws)
      ws.on('close', () => this._clients.delete(ws))
    })
    this._wss.on('error', (err) => this.emit('error', err))
    return { success: true }
  }

  stop() {
    this._wss?.close()
    this._wss = null
    this._clients.clear()
  }

  broadcast(data) {
    if (!this._wss) return
    const msg = JSON.stringify(data)
    for (const ws of this._clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg)
    }
  }
}

module.exports = { WsServer }
