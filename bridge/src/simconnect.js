const EventEmitter = require('events')

// Confirmed from WASM binary strings. CDU2 equivalent is 'ASCRJ CDU2 Data'.
const CDU_AREA_NAME = 'ASCRJ CDU1 Data'

const COLS = 24
const ROWS = 14
const BYTES_PER_CELL = 3 // symbol (ASCII), color (0–5), flags (bitmask)
const DATA_SIZE = COLS * ROWS * BYTES_PER_CELL + 1 // +1 for Powered byte

const AREA_ID = 1
const DEF_ID = 1
const REQUEST_ID = 1

class SimConnectBridge extends EventEmitter {
  constructor() {
    super()
    this._handle = null
    this.connected = false
    this.dataFlowing = false
  }

  async connect() {
    try {
      // Protocol.KittyHawk = MSFS 2020; Protocol.SunRise = MSFS 2024
      const { open, Protocol, ClientDataPeriod, ClientDataRequestFlag } = require('node-simconnect')
      const { handle } = await open('mCDU-Bridge', Protocol.KittyHawk)
      this._handle = handle

      handle.mapClientDataNameToID(CDU_AREA_NAME, AREA_ID)

      // Register the full block as one raw byte-array datum
      handle.addToClientDataDefinition(DEF_ID, 0, DATA_SIZE, 0, 0)

      // Receive an update whenever the sim writes new data to the area
      handle.requestClientData(
        AREA_ID,
        REQUEST_ID,
        DEF_ID,
        ClientDataPeriod.ON_SET,
        ClientDataRequestFlag.CLIENT_DATA_REQUEST_FLAG_DEFAULT
      )

      handle.on('clientData', ({ data }) => this._parse(data))
      handle.on('quit', () => this._onDisconnect())
      handle.on('error', (err) =>
        this.emit('status', { connected: false, dataFlowing: false, error: err.message })
      )
      handle.on('exception', (ex) =>
        this.emit('status', { connected: true, dataFlowing: false, error: `SimConnect exception ${ex.exception} (sendID ${ex.sendID})` })
      )

      this.connected = true
      this.emit('status', { connected: true, dataFlowing: false })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // Converts column-first wire format → row-major 2D array.
  // rawBuffer is a RawBuffer (library type with a sequential read cursor), not a Node Buffer.
  // readBytes() extracts a standard Buffer we can index arbitrarily.
  _parse(rawBuffer) {
    const buf = rawBuffer.readBytes(DATA_SIZE)
    const cells = Array.from({ length: ROWS }, () => Array(COLS))
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const offset = (col * ROWS + row) * BYTES_PER_CELL
        cells[row][col] = {
          symbol: String.fromCharCode(buf.readUInt8(offset)),
          color: buf.readUInt8(offset + 1),
          flags: buf.readUInt8(offset + 2),
        }
      }
    }
    const powered = buf.readUInt8(COLS * ROWS * BYTES_PER_CELL) !== 0

    if (!this.dataFlowing) {
      this.dataFlowing = true
      this.emit('status', { connected: true, dataFlowing: true })
    }
    this.emit('cdu-data', { cells, powered, timestamp: Date.now() })
  }

  _onDisconnect() {
    this.connected = false
    this.dataFlowing = false
    this._handle = null
    this.emit('status', { connected: false, dataFlowing: false })
  }

  disconnect() {
    this._handle?.close?.()
    this._onDisconnect()
  }
}

module.exports = { SimConnectBridge }
