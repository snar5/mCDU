# CRJ CDU Project — Planning Summary

This document captures the architecture and decisions made during planning, before any code was written. Use it as the reference when starting implementation in Visual Studio / VS Code.

## Goal

Build a custom CDU (MCDU) display for the Aerosoft CRJ in MSFS 2020, as a personal learning/curiosity project. This is **not** a replacement for GlassOut in daily use — GlassOut remains the "production" tool. This project exists to explore the SimConnect-based approach as an alternative, lower-level technique.

The physical target is a PuAirKorea MCDU hardware unit (small screen + buttons, no real onboard compute). USB (buttons) stays connected to the Windows MSFS PC. The goal is to move the HDMI/display duty to a separate, cheap Linux box, freeing up a GPU slot on the main gaming PC.

## Why Not Just Use GlassOut for This?

GlassOut works by capturing DirectX 12 textures directly from the simulator's renderer. It's aircraft-agnostic but:
- Requires DX12 (current setup runs DX11 due to DX12 crashes)
- Fragile across MSFS updates (texture coordinates can shift)
- Requires admin privileges
- Higher overhead (full image frames vs. small text payloads)

The Aerosoft CRJ happens to publish its CDU screen content as structured text via a **SimConnect Client Data Area** (the same mechanism PMDG uses). This is a much lighter-weight, more stable approach — but only works for aircraft that explicitly support it (CRJ does; not universal like GlassOut).

## How CDU Data Works (Aerosoft CRJ / PMDG-style)

- The CRJ's WASM module (running inside MSFS, written by Aerosoft) renders the CDU and pushes the result into a named **SimConnect Client Data Area**.
- The data is a fixed grid: **24 columns × 14 rows** of cells.
- Each cell is 3 bytes: `Symbol` (ASCII char), `Color` (0=white, 1=cyan, 2=green, 3=magenta, 4=amber, 5=red), `Flags` (small font, reverse video, etc.)
- **Important gotcha:** data is ordered **column-first**, not row-first. The first 14 cell entries are the leftmost column top-to-bottom, not the top row left-to-right.
- A trailing `Powered` boolean indicates if the CDU has power.
- **Page logic (NEXT PAGE / PREV PAGE, multi-page scrolling) is handled entirely by the CRJ's internal FMS logic.** The client never needs to know what page is displayed — it just receives whatever the current rendered screen state is, as a fresh grid, whenever it changes. No page-state tracking needs to be built on the client side.
- The exact Client Data Area name Aerosoft uses for the CRJ needs to be discovered via the **SimConnect Inspector** in MSFS Developer Mode (load the CRJ, open dev mode, open SimConnect Inspector, look for active client data areas). PMDG's equivalent is named e.g. `"PMDG_NG3_CDU_0"` — Aerosoft's naming may differ and needs verifying directly.

## SimConnect vs. WASM vs. DX12 — Quick Recap

| Approach | Where code runs | What you get | Used by |
|---|---|---|---|
| DX12 texture capture | External, hooks GPU | Raw pixels of whatever's rendered | GlassOut |
| SimConnect Client Data | External (separate process) | Structured text/color grid, only for aircraft that publish it | This project |
| WASM module | Inside MSFS itself, bundled with aircraft | Full access to aircraft internals; this is what *generates* the CDU data in the first place | Aerosoft (already built, not something we need to write) |

We are **consuming** data the CRJ's existing WASM module already publishes. We do not need to write any WASM ourselves.

## Confirmed Architecture

Two machines, two small apps:

```
┌─────────────────────────────────┐         ┌─────────────────────────────┐
│ Windows PC                       │         │ Linux PC (cheap secondary)   │
│                                   │         │                               │
│ MSFS 2020 + Aerosoft CRJ          │         │ Tauri "Display" app          │
│  (WASM writes CDU data into       │         │  - connects to Bridge via    │
│   SimConnect Client Data Area)    │         │    WebSocket                 │
│                                   │         │  - renders 24x14 cell grid   │
│ MobiFlight (USB — CDU buttons)    │         │  - moveable window           │
│  USB ↑ stays here, unchanged      │         │  - fullscreen toggle         │
│                                   │         │  - aspect-ratio locked       │
│ "Bridge" app (Node.js):           │  WS     │    scaling on resize         │
│  - connects to SimConnect locally │ ──────► │  - HDMI out → PuAirKorea     │
│    (pipe, no network config       │         │    screen                    │
│    needed since same PC)          │         │                               │
│  - reads CRJ CDU Client Data Area │         │                               │
│  - has its own UI:                │         │                               │
│     - settings (WebSocket IP/port │         │                               │
│       it listens on)              │         │                               │
│     - Connect button (SimConnect) │         │                               │
│     - status indicator            │         │                               │
│       (SimConnect connected? CDU  │         │                               │
│       data flowing?)              │         │                               │
│     - "Launch Display" button —   │         │                               │
│       only enabled once real CDU  │         │                               │
│       data is confirmed flowing   │         │                               │
│  - broadcasts CDU grid as JSON    │         │                               │
│    over WebSocket to any          │         │                               │
│    connected clients              │         │                               │
└─────────────────────────────────┘         └─────────────────────────────┘
```

### Why the Bridge runs on Windows (not directly from Linux)

`node-simconnect` is actually cross-platform and could theoretically run directly on the Linux box, connecting to MSFS over a remote SimConnect TCP connection (this requires editing `SimConnect.xml` on the Windows PC to open a network port — confirmed possible and documented, contrary to initial assumption that remote SimConnect wasn't possible).

However, we chose to keep the bridge on Windows because:
- Local SimConnect (pipe) connections are simpler and more reliable than remote TCP
- The bridge already needs its own settings/status/UI, which fits naturally as a small Windows-side app
- Keeps the Linux display app "dumb" — it only ever speaks WebSocket/JSON, with no SimConnect reconnection complexity mixed into the same app responsible for window/display behavior
- Matches the proven pattern GlassOut itself already uses (server-ish piece on the MSFS PC, client elsewhere)

### USB / HDMI Split

- USB (PuAirKorea buttons) stays plugged into the Windows PC — MobiFlight needs direct USB access there, and USB-over-network would add unreliable latency to button presses. Not worth attempting to move.
- HDMI moves to the Linux box. Rendering a text grid is trivial 2D work — no meaningful GPU requirement, so a cheap mini-PC, NUC, or even a Raspberry Pi 4/5 is plausible hardware for the Linux side.

## Project Structure

Single repo, two folders (chosen over two separate repos — single-developer project, frequent coordinated changes across both sides, low overhead preferred over publishing-readiness):

```
crj-cdu-project/
├── bridge/      → Node.js app, runs on Windows MSFS PC
│   └── (SimConnect connection, CDU data parsing, WebSocket server, settings/status/launch UI)
└── display/     → Tauri app, runs on Linux PC
    └── (WebSocket client, CDU grid renderer, window management)
```

## Bridge App — Requirements

- **Tech stack:** Node.js (using `node-simconnect`). UI framework not yet decided — needs to support a small desktop UI with native feel; Electron is the obvious default given Node.js, but worth reconsidering at implementation time since Tauri could also work here for consistency with the Display app.
- **Settings:** WebSocket IP/port that the bridge listens on (this is the address the Display app will need to connect to). This is the "IP/Port" that can change and needs to be user-editable, not the SimConnect connection itself (which is local/automatic on the same PC).
- **Connect button:** initiates the local SimConnect connection.
- **Status indicator:** should reflect at least two states — (1) SimConnect connected or not, (2) CDU data actively flowing or not (i.e., CRJ loaded and broadcasting, not just "SimConnect is up").
- **Launch Display button:** only enabled once CDU data is confirmed flowing. No point opening a display window with nothing to show yet.
- **Core logic:**
  1. Connect to SimConnect (local pipe)
  2. Map and subscribe to the CRJ's CDU Client Data Area (name TBD — discover via SimConnect Inspector)
  3. On each update, parse the 24×14 cell struct (mind the column-first ordering)
  4. Serialize to JSON
  5. Broadcast over WebSocket to any connected clients

## Display App — Requirements

- **Tech stack:** Tauri (Rust + WebView), matches existing GlassOut client app for consistency. Runs on Xubuntu currently.
- **Connects to:** the Bridge's WebSocket address (user-configurable on this side too, or hardcoded/settings-driven — TBD at implementation time).
- **Renders:** the 24×14 cell grid as styled elements (e.g., a grid of `<span>`/`<div>`), applying per-cell color from the `Color` field.
- **Window behavior:**
  - Moveable window (native OS behavior, Tauri provides this by default)
  - Fullscreen toggle (Tauri has a built-in API for this)
  - Aspect-ratio-locked scaling on resize — text/grid should scale to fill the window while preserving the CDU's native aspect ratio (likely via CSS `aspect-ratio` plus a scaling container, or `transform: scale()`)
- **Scope:** CRJ only for now. Not designed for multi-aircraft support at this stage — keep it simple.

## Open Items / Not Yet Decided

- Exact Aerosoft CRJ Client Data Area name and struct layout (needs discovery via SimConnect Inspector in MSFS Dev Mode with the CRJ loaded)
- Bridge app UI framework (Electron vs. other Node-friendly desktop UI option vs. Tauri)
- Whether the Display app's WebSocket target (bridge IP/port) is hardcoded, config file, or has its own settings UI
- Visual styling details for the CDU render (font, exact color values, cell spacing)

## Reference Material Found During Planning

- `node-simconnect` (npm/GitHub: EvenAR/node-simconnect) — cross-platform Node.js SimConnect client library, used for both reading sim data and Client Data Areas
- GitHub issue showing a working example of reading PMDG NG3 CDU data via `node-simconnect`'s Client Data Area APIs (struct layout, mapping client data name to ID, etc.) — useful as a structural reference even though Aerosoft's exact data area name differs
- PMDG SDK header structure (`PMDG_NGX_CDU_Cell`, `PMDG_NGX_CDU_Screen`) — useful as the template for the equivalent Aerosoft CRJ struct, which needs to be confirmed independently
- FSDeveloper.com forum threads confirming remote SimConnect connections over LAN are possible by editing `SimConnect.xml`
- Existing GlassOut client project (github.com/snar5/glassout-client) — current production Tauri app, useful as a reference/starting point for the new Display app's window management code