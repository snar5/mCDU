# mCDU — CRJ CDU Display Project

Custom CDU display for the Aerosoft CRJ in MSFS 2020. Reads structured CDU cell data from a SimConnect Client Data Area and renders it on a PuAirKorea MCDU hardware unit driven by a separate Linux machine.

**This is not a replacement for GlassOut in daily use** — it exists to explore the SimConnect-based approach as a lighter-weight, more stable alternative (see [Background](#background) below).

---

## Quick Start

### Bridge (Windows MSFS PC)

Requirements: Node.js 18+

```
cd bridge
npm install        # first run downloads Electron (~100 MB) — takes a minute
npm start          # opens the Bridge UI window
```

> **Note:** `npm install` may prompt you to run `npm audit fix` before proceeding if vulnerabilities are detected in the dependency tree. Run it and then re-run `npm install`.

Once running:
1. Adjust the WebSocket host/port if needed (default `0.0.0.0:8765` listens on all interfaces)
2. Click **Connect to SimConnect** — this requires MSFS to be running with the CRJ loaded
3. Once the CDU data dot goes green, the WebSocket is broadcasting

> **Known issue:** WebSocket host/port settings are not persisted — they reset to defaults when the app restarts. If you use a non-default port, you'll need to re-enter it each session.

### Display (Linux PC)

Requirements: Rust + Tauri CLI (`cargo install tauri-cli`)

```
cd display
npm install
npm run dev        # development build with hot reload
npm run build      # production build
```

**Setting the bridge address:** The display app connects to whatever WebSocket URL is stored in `localStorage` under the key `mcdu-ws-url`. On first run it defaults to `ws://192.168.1.100:8765` which will almost certainly be wrong. To change it, open the Tauri devtools (right-click → Inspect) and run:

```js
localStorage.setItem('mcdu-ws-url', 'ws://YOUR_BRIDGE_IP:8765')
location.reload()
```

The setting persists across restarts. The overlay shows the current URL when disconnected.

Press **F11** to toggle fullscreen.

---

## Architecture

```
┌─────────────────────────────────┐         ┌─────────────────────────────┐
│ Windows PC                       │         │ Linux PC (cheap secondary)   │
│                                   │         │                               │
│ MSFS 2020 + Aerosoft CRJ          │         │ Tauri "Display" app          │
│  (WASM writes CDU data into       │         │  - connects to Bridge via    │
│   SimConnect Client Data Area)    │         │    WebSocket                 │
│                                   │         │  - renders 24×14 cell grid   │
│ MobiFlight (USB — CDU buttons)    │         │  - F11 fullscreen toggle     │
│  USB stays here, unchanged        │         │  - aspect-ratio locked       │
│                                   │         │    scaling on resize         │
│ "Bridge" app (Electron/Node.js):  │  WS     │  - HDMI out → PuAirKorea    │
│  - reads CRJ CDU Client Data Area │ ──────► │    screen                   │
│  - WebSocket server               │         │                               │
│  - settings + status UI           │         │                               │
└─────────────────────────────────┘         └─────────────────────────────┘
```

### CDU Data Format

The Aerosoft CRJ WASM module publishes CDU state to a SimConnect Client Data Area named **`ASCRJ CDU1 Data`** (CDU2: `ASCRJ CDU2 Data`). The data is a fixed 24 × 14 cell grid:

- Each cell is 3 bytes: `symbol` (ASCII), `color` (0–5), `flags` (bitmask)
- **Data is column-first** — the first 14 entries are column 0 top-to-bottom, not the top row
- A trailing byte indicates `powered` state
- Color map: 0=white 1=cyan 2=green 3=magenta 4=amber 5=red
- Flags bit 0 = small font, bit 1 = reverse video

The Bridge receives updates via `ClientDataPeriod.ON_SET` — it only wakes when the sim actually changes the screen, so there is no polling overhead.

### Why Bridge on Windows (not direct Linux → SimConnect)

`node-simconnect` supports remote SimConnect connections over TCP (requires editing `SimConnect.xml` on the Windows PC). We chose to keep the bridge on Windows because:
- Local named-pipe connections are simpler and more reliable than remote TCP
- The bridge already needs its own settings/status UI — fits naturally as a Windows-side app
- Keeps the Linux display app "dumb" (WebSocket/JSON only, no SimConnect reconnection logic)

### Why Not GlassOut for This?

GlassOut captures DirectX 12 textures from the renderer. It works but:
- Requires DX12 (current setup runs DX11 due to crashes)
- Fragile across MSFS updates
- Requires admin privileges
- Higher overhead (full image frames vs. small text payloads)

The CRJ publishes structured text data over SimConnect — a much lighter path for aircraft that support it.

---

## Project Structure

```
mCDU/
├── bridge/          Node.js/Electron app — runs on Windows MSFS PC
│   ├── main.js      Electron main process, IPC handlers
│   ├── preload.js   Context bridge (exposes window.mcdu API to renderer)
│   ├── src/
│   │   ├── simconnect.js   SimConnect connection + CDU data parsing
│   │   └── wsserver.js     WebSocket server
│   └── renderer/    Bridge UI (HTML/CSS/JS)
└── display/         Tauri app — runs on Linux display PC
    ├── src/         Frontend (HTML/CSS/JS) — WebSocket client + grid renderer
    └── src-tauri/   Rust backend — toggle_fullscreen Tauri command
```

---

## Known Issues / To Do

- **Bridge settings not persisted** — host/port reset on restart; needs `electron-store` or a config file
- **Display WS URL has no UI** — must be set via browser devtools/localStorage (see Quick Start above)
- **B612 Mono font not loaded** — display falls back to Courier New; font could be bundled or loaded from a CDN
- **No "Launch Display" button** — planned but not yet implemented; would open a browser/window on the Linux machine once CDU data is confirmed flowing

---

## Background

### SimConnect vs. WASM vs. DX12

| Approach | Where code runs | What you get | Used by |
|---|---|---|---|
| DX12 texture capture | External, hooks GPU | Raw pixels of whatever's rendered | GlassOut |
| SimConnect Client Data | External (separate process) | Structured text/color grid — only for aircraft that publish it | This project |
| WASM module | Inside MSFS, bundled with aircraft | Full access to aircraft internals | Aerosoft (already built) |

We consume data the CRJ's existing WASM module already publishes. No WASM authoring needed.

### Reference Material

- `node-simconnect` (EvenAR/node-simconnect) — pure-JS SimConnect client, no native compilation needed
- PMDG NG3 CDU data area pattern — structural reference for the Aerosoft equivalent
- GlassOut client (github.com/snar5/glassout-client) — reference for Tauri window management
- FSDeveloper.com — confirmed remote SimConnect over LAN is possible via `SimConnect.xml` edits
