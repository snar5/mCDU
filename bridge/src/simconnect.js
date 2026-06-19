const EventEmitter = require('events')

// Confirmed from WASM binary strings. CDU2 equivalent is 'ASCRJ CDU2 Data'.
const CDU_AREA_NAME = 'ASCRJ CDU1 Data'

const COLS = 24
const ROWS = 14
// Aerosoft CRJ appears to use 2 bytes per cell (symbol + color/flags packed),
// no separate Powered byte — total 672. Was 1009 (3 bytes + powered) but that
// caused SIMCONNECT_EXCEPTION_OUT_OF_BOUNDS (31), meaning the area is smaller.
const BYTES_PER_CELL = 2
const DATA_SIZE = COLS * ROWS * BYTES_PER_CELL // 672

const AREA_ID = 1
const DEF_ID = 1
const REQUEST_ID_ONCE = 1  // one-shot on connect to get current state
const REQUEST_ID_SET  = 2  // ongoing — fires whenever the sim writes the area

class SimConnectBridge extends EventEmitter {
  constructor() {
    super()
    this._handle = null
    this.connected = false
    this.dataFlowing = false
  }

  async connect() {
    try {
      const { open, Protocol, ClientDataPeriod, ClientDataRequestFlag } = require('node-simconnect')

      // Try MSFS 2020 protocol first, fall back to MSFS 2024
      let handle
      try {
        ;({ handle } = await open('mCDU-Bridge', Protocol.KittyHawk))
      } catch {
        ;({ handle } = await open('mCDU-Bridge', Protocol.SunRise))
      }
      this._handle = handle

      console.log('[mCDU] Subscribing to client data area:', CDU_AREA_NAME)
      handle.mapClientDataNameToID(CDU_AREA_NAME, AREA_ID)

      // Register the full block as one raw byte-array datum
      handle.addToClientDataDefinition(DEF_ID, 0, DATA_SIZE, 0, 0)

      // Pull current state immediately, then subscribe to future writes
      handle.requestClientData(AREA_ID, REQUEST_ID_ONCE, DEF_ID,
        ClientDataPeriod.ONCE, ClientDataRequestFlag.CLIENT_DATA_REQUEST_FLAG_DEFAULT)
      handle.requestClientData(AREA_ID, REQUEST_ID_SET, DEF_ID,
        ClientDataPeriod.ON_SET, ClientDataRequestFlag.CLIENT_DATA_REQUEST_FLAG_DEFAULT)

      handle.on('clientData', ({ data }) => {
        console.log('[mCDU] clientData event received, bytes:', DATA_SIZE)
        this._parse(data)
      })
      handle.on('quit', () => this._onDisconnect())
      handle.on('error', (err) => {
        console.error('[mCDU] SimConnect error:', err.message)
        this.emit('status', { connected: false, dataFlowing: false, error: err.message })
      })
      handle.on('exception', (ex) => {
        console.error('[mCDU] SimConnect exception:', JSON.stringify(ex))
        this.emit('status', { connected: true, dataFlowing: false, error: `SimConnect exception ${ex.exception} (sendID ${ex.sendID})` })
      })

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
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const offset = (row * COLS + col) * BYTES_PER_CELL
        const colorByte = buf.readUInt8(offset + 1)
        cells[row][col] = {
          symbol: String.fromCharCode(buf.readUInt8(offset)),
          color: colorByte & 0x0F,
          flags: (colorByte >> 4) & 0x0F,
        }
      }
    }
    // No separate Powered byte in this layout — treat as always powered
    const powered = true

    // DEBUG: log color index for every non-space cell
    cells.forEach((row, r) => row.forEach((cell, c) => {
      if (cell.symbol.trim()) console.log(`[mCDU] [${r},${c}] '${cell.symbol}' color=${cell.color} flags=${cell.flags}`)
    }))

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
