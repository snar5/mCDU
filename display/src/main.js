const COLS = 24
const ROWS = 14

// color index → CSS color (0=white 1=cyan 2=green 3=magenta 4=amber 5=red)
const COLORS = ['#ffffff', '#00e5ff', '#69ff47', '#ff4dff', '#ffbf00', '#ff4444']

// Bridge WebSocket address — stored in localStorage so the user can change it
// without a rebuild. Falls back to a sensible default on first run.
const DEFAULT_WS = 'ws://192.168.1.100:8765'
const wsUrl = localStorage.getItem('mcdu-ws-url') ?? DEFAULT_WS

const gridEl = document.getElementById('cdu-grid')
const overlay = document.getElementById('overlay-disconnected')
const wsAddressEl = document.getElementById('ws-address')

wsAddressEl.textContent = wsUrl

// Pre-build all 24×14 cell elements once
const cellEls = []
for (let i = 0; i < ROWS * COLS; i++) {
  const span = document.createElement('span')
  span.className = 'cell'
  gridEl.appendChild(span)
  cellEls.push(span)
}

function renderFrame({ cells, powered }) {
  overlay.hidden = true
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const { symbol, color, flags } = cells[row][col]
      const el = cellEls[row * COLS + col]
      el.textContent = powered ? (symbol || ' ') : ' '
      el.style.color = powered ? (COLORS[color] ?? '#ffffff') : '#1a1a1a'
      // flags bit 0 = small font, bit 1 = reverse video
      el.classList.toggle('small', !!(flags & 0x01))
      el.classList.toggle('reverse', !!(flags & 0x02))
    }
  }
}

function connectWs(url) {
  const ws = new WebSocket(url)
  ws.onmessage = (e) => renderFrame(JSON.parse(e.data))
  ws.onclose = () => {
    overlay.hidden = false
    setTimeout(() => connectWs(url), 3000)
  }
  ws.onerror = () => ws.close()
}

connectWs(wsUrl)

// F11 → fullscreen toggle (Tauri command when inside app, native API in browser)
document.addEventListener('keydown', async (e) => {
  if (e.key === 'F11') {
    e.preventDefault()
    if (window.__TAURI__) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      await invoke('toggle_fullscreen')
    } else {
      document.documentElement.requestFullscreen?.()
    }
  }
})
