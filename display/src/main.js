const COLS = 24
const ROWS = 14

// color index → CSS color (0=white 1=cyan 2=green 3=magenta 4=amber 5=red)
const COLORS = ['#ffffff', '#00e5ff', '#69ff47', '#ff4dff', '#ffbf00', '#ff4444']

// Bridge WebSocket address — stored in localStorage so the user can change it
// without a rebuild. Falls back to a sensible default on first run.
const DEFAULT_WS = 'ws://localhost:8765'

const gridEl = document.getElementById('cdu-grid')
const overlay = document.getElementById('overlay-disconnected')
const wsAddressEl = document.getElementById('ws-address')
const wsForm = document.getElementById('ws-form')
const wsInput = document.getElementById('ws-input')

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
      el.classList.toggle('small', !!(flags & 0x01))
      el.classList.toggle('reverse', !!(flags & 0x02))
    }
  }
}

let activeWs = null
function connectWs(url) {
  wsAddressEl.textContent = url
  wsInput.value = url
  activeWs = new WebSocket(url)
  activeWs.onmessage = (e) => renderFrame(JSON.parse(e.data))
  activeWs.onclose = () => {
    overlay.hidden = false
    setTimeout(() => connectWs(url), 3000)
  }
  activeWs.onerror = () => activeWs.close()
}

wsForm.addEventListener('submit', (e) => {
  e.preventDefault()
  const url = wsInput.value.trim()
  if (!url) return
  localStorage.setItem('mcdu-ws-url', url)
  activeWs?.close()  // cancel current retry loop
  connectWs(url)
})

const savedUrl = localStorage.getItem('mcdu-ws-url') ?? DEFAULT_WS
wsInput.value = savedUrl
connectWs(savedUrl)

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
