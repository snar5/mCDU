const dotSimConnect = document.getElementById('dot-simconnect')
const dotCdu = document.getElementById('dot-cdu')
const btnConnect = document.getElementById('btn-connect')
const btnDisconnect = document.getElementById('btn-disconnect')
const btnSave = document.getElementById('btn-save-settings')
const wsHostInput = document.getElementById('ws-host')
const wsPortInput = document.getElementById('ws-port')
const statusText = document.getElementById('status-text')

function setDot(el, active) {
  el.className = 'dot ' + (active ? 'active' : 'inactive')
}

function applyStatus({ connected, dataFlowing, error }) {
  setDot(dotSimConnect, connected)
  setDot(dotCdu, dataFlowing)
  btnConnect.disabled = connected
  btnDisconnect.disabled = !connected
  if (error) statusText.textContent = `Error: ${error}`
  else if (dataFlowing) statusText.textContent = 'CDU data flowing — WebSocket broadcasting.'
  else if (connected) statusText.textContent = 'SimConnect connected. Waiting for CRJ CDU data…'
  else statusText.textContent = 'Not connected.'
}

window.mcdu.getSettings().then(({ host, port }) => {
  wsHostInput.value = host
  wsPortInput.value = port
})

window.mcdu.onStatus(applyStatus)

btnConnect.addEventListener('click', async () => {
  btnConnect.disabled = true
  statusText.textContent = 'Connecting…'
  const result = await window.mcdu.connect()
  if (!result.success) {
    statusText.textContent = `Failed: ${result.error}`
    btnConnect.disabled = false
  }
})

btnDisconnect.addEventListener('click', async () => {
  await window.mcdu.disconnect()
  applyStatus({ connected: false, dataFlowing: false })
})

btnSave.addEventListener('click', async () => {
  const host = wsHostInput.value.trim()
  const port = parseInt(wsPortInput.value, 10)
  if (!host || isNaN(port)) return
  await window.mcdu.saveSettings({ host, port })
  const orig = btnSave.textContent
  btnSave.textContent = 'Saved!'
  setTimeout(() => (btnSave.textContent = orig), 1500)
})
