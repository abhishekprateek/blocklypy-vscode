import * as http from 'http';
import * as vscode from 'vscode';
import { WebSocket, WebSocketServer } from 'ws';

import { ConnectionState } from '..';
import {
  SPIKE_RX_CHAR_UUID,
  SPIKE_SERVICE_UUID,
  SPIKE_TX_CHAR_UUID,
} from '../../spike/protocol';
import {
  WebBTBridgeClient,
  WebBTBridgeMetadata,
} from '../clients/web-bt-bridge-client';
import {
  BaseLayer,
  DeviceChangeEvent,
  LayerDescriptor,
  LayerKind,
} from './base-layer';

// -----------------------------------------------------------------------
// LayerKind entry — reuse BLE so the connection-manager devtype routing
// (BLE-kind layers handle 'hubos-ble') works without changes.
// -----------------------------------------------------------------------

const _BRIDGE_DEVICE_ID = 'hubos-ble:Web Bluetooth Bridge';

// Prefer a fixed port so Codespaces reuses the same forwarded port across
// restarts instead of accumulating stale forwarded ports.
const BRIDGE_DEFAULT_PORT = 9580;

// -----------------------------------------------------------------------
// WebBTBridgeLayer
//
// Provides BLE connectivity for browser/Codespaces environments where
// @stoprocent/noble (native binding) is unavailable.
//
// Architecture:
//   • An HTTP+WebSocket server is started on an OS-assigned port.
//   • startScanning() opens the bridge HTML page in the host browser via
//     vscode.env.openExternal().
//   • The bridge page establishes a WebSocket connection back to the server
//     and acts as a transparent byte proxy between the extension and the
//     LEGO hub via the WebBluetooth API (no protocol knowledge in the page).
//   • connectWorker() in WebBTBridgeClient sends {type:'request_connect'}
//     over the WS, the page shows a browser BT picker, then forwards raw
//     BLE notification bytes back.  All COBS / HubOS protocol processing
//     remains in existing TypeScript code.
// -----------------------------------------------------------------------

export class WebBTBridgeLayer extends BaseLayer {
  public static override readonly descriptor: LayerDescriptor = {
    id: 'web-bt-bridge',
    name: 'Web Bluetooth Bridge',
    kind: LayerKind.BLE,
    canScan: true,
  } as const;

  private _httpServer: http.Server | undefined;
  private _wss: WebSocketServer | undefined;
  private _port: number | undefined;

  // The active WS connection from the browser page.
  private _socket: WebSocket | undefined;

  // Resolvers for waitForWsSocket() callers.
  private _wsWaiters: Array<{
    resolve: () => void;
    reject: (e: Error) => void;
  }> = [];

  private _virtualDevice: WebBTBridgeMetadata | undefined;
  private _bridgePageOpened = false;

  // -----------------------------------------------------------------------
  // Public accessors used by WebBTBridgeClient and ConnectionManager
  // -----------------------------------------------------------------------

  public get currentSocket(): WebSocket | undefined {
    return this._socket;
  }

  /** The port the bridge HTTP server is listening on. */
  public get currentPort(): number | undefined {
    return this._port;
  }

  /** Resolves when a browser page has opened a WS connection to us. */
  public waitForWsSocket(): Promise<void> {
    if (this._socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this._wsWaiters.push({ resolve, reject });
    });
  }

  // -----------------------------------------------------------------------
  // BaseLayer overrides
  // -----------------------------------------------------------------------

  /** Allow 120 s for the user to open the bridge page, click Connect, and pair. */
  private static readonly BRIDGE_CONNECT_TIMEOUT_MS = 120_000;

  protected override get connectionTimeoutMs(): number {
    return WebBTBridgeLayer.BRIDGE_CONNECT_TIMEOUT_MS;
  }

  public override async initialize(): Promise<void> {
    await super.initialize();
    await this._startServer();
    this.state = ConnectionState.Disconnected;
  }

  public override waitForReadyPromise(): Promise<void> {
    if (this._port !== undefined) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this._httpServer?.once('listening', () => resolve());
    });
  }

  public override supportsDevtype(devtype: string): boolean {
    return devtype === 'hubos-ble';
  }

  public override async startScanning(): Promise<void> {
    await this.waitForReadyPromise();
    this._emitVirtualDevice();

    // Only open the bridge page once. Subsequent startScanning() calls
    // (e.g. from onDidChangeVisibility) must not open duplicate tabs.
    if (!this._bridgePageOpened) {
      this._bridgePageOpened = true;
      await this.openBridgePage();
    }
  }

  public override stopScanning(): void {
    // Virtual device stays visible so the user can still click Connect.
  }

  public override async connect(id: string, devtype: string): Promise<void> {
    if (!this._virtualDevice) throw new Error('Bridge device not found');

    // Wait for the browser page to open its WebSocket before creating the client.
    await this.waitForWsSocket();

    BaseLayer.activeClient = new WebBTBridgeClient(
      this._virtualDevice,
      this,
      this._socket!,
    );
    await super.connect(id, devtype);
  }

  public override async finalize(): Promise<void> {
    // Reject any pending WS waiters.
    for (const w of this._wsWaiters) w.reject(new Error('Layer finalized'));
    this._wsWaiters = [];

    this._socket?.close();
    this._wss?.close();
    this._httpServer?.close();

    await super.finalize();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async _startServer(): Promise<void> {
    this._httpServer = http.createServer((req, res) => {
      // Serve the bridge page at /.
      if (req.method === 'GET' && (req.url === '/' || req.url === '')) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        });
        res.end(this._getBridgePageHtml());
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this._wss = new WebSocketServer({
      server: this._httpServer,
      // Disable per-message deflate — Codespaces / reverse-proxy environments
      // can break the WebSocket handshake when compression is negotiated.
      perMessageDeflate: false,
    });
    this._wss.on('connection', (ws: WebSocket) => this._onWsConnection(ws));
    this._wss.on('error', (err) => console.error('WebBTBridge WSS error:', err));

    // Try the fixed port first; fall back to an OS-assigned port if busy.
    const tryListen = (port: number): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        this._httpServer!.once('error', reject);
        this._httpServer!.listen(port, '127.0.0.1', () => {
          this._httpServer!.removeListener('error', reject);
          const addr = this._httpServer!.address();
          if (addr && typeof addr === 'object') {
            this._port = addr.port;
          }
          resolve();
        });
      });

    try {
      await tryListen(BRIDGE_DEFAULT_PORT);
    } catch {
      console.debug(`WebBTBridge: port ${BRIDGE_DEFAULT_PORT} busy, using OS-assigned port`);
      await tryListen(0);
    }
  }

  private _onWsConnection(ws: WebSocket): void {
    // Reject any existing stale socket.
    if (this._socket && this._socket.readyState === WebSocket.OPEN) {
      this._socket.close();
    }
    this._socket = ws;

    ws.on('close', () => {
      if (this._socket === ws) this._socket = undefined;
    });
    ws.on('error', (err) => console.error('WebBTBridge WS error:', err));

    // Resolve all waiters.
    for (const w of this._wsWaiters) w.resolve();
    this._wsWaiters = [];
  }

  private _emitVirtualDevice(): void {
    if (!this._virtualDevice) {
      this._virtualDevice = new WebBTBridgeMetadata(
        'hubos-ble',
        'Web Bluetooth Bridge',
      );
      this._allDevices.set(this._virtualDevice.id, this._virtualDevice);
    }
    this._deviceChange.fire({
      metadata: this._virtualDevice,
      layer: this,
    } satisfies DeviceChangeEvent);
  }

  public async openBridgePage(): Promise<void> {
    try {
      const localUri = vscode.Uri.parse(`http://127.0.0.1:${this._port}/`);
      const externalUri = await vscode.env.asExternalUri(localUri);
      await vscode.env.openExternal(externalUri);
    } catch (err) {
      console.error('WebBTBridge: failed to open bridge page:', err);
    }
  }

  // -----------------------------------------------------------------------
  // Bridge HTML page
  //
  // Deliberately protocol-blind: it is a transparent raw-byte proxy between
  // the WS connection and the BLE GATT characteristics.  All HubOS framing
  // stays in TypeScript.
  // -----------------------------------------------------------------------

  private _getBridgePageHtml(): string {
    // UUID constants are inlined from src/spike/protocol.ts to keep the
    // HTML self-contained.
    const svcUUID = SPIKE_SERVICE_UUID;
    const rxUUID = SPIKE_RX_CHAR_UUID; // hub receives (our writes)
    const txUUID = SPIKE_TX_CHAR_UUID; // hub sends (we read notifications)

    // BLE writes are chunked to 20 bytes (GATT default without MTU negotiation).
    const BLE_CHUNK_SIZE = 20;

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LEGO Hub — Web Bluetooth Bridge</title>
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:540px;
 margin:40px auto;padding:20px;background:#1e1e1e;color:#ccc}
h1{font-size:18px;color:#fff;margin:0 0 16px}
.card{background:#252526;border:1px solid #333;border-radius:6px;padding:14px;margin:10px 0}
.card.ok{border-color:#4caf50}.card.err{border-color:#f44336}.card.warn{border-color:#ffa726}
#status{font-size:14px}
button{padding:9px 18px;margin:4px 4px 4px 0;background:#0078d4;color:#fff;
 border:none;border-radius:4px;cursor:pointer;font-size:13px}
button:hover:not(:disabled){background:#106ebe}
button:disabled{opacity:.45;cursor:not-allowed}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,120,212,.7)}50%{box-shadow:0 0 0 10px rgba(0,120,212,0)}}
button.pulse{animation:pulse 1.2s infinite;background:#0098ff}
#btnDisconnect{background:#c62828}
#btnDisconnect:hover:not(:disabled){background:#b71c1c}
#log{font-family:monospace;font-size:11px;height:180px;overflow-y:auto;
 white-space:pre-wrap;color:#9e9e9e;padding:8px;background:#0d0d0d;
 border:1px solid #2a2a2a;border-radius:4px;margin-top:10px}
.note{font-size:11px;color:#778;margin-top:8px}
</style>
</head>
<body>
<h1>&#x1F4F6; LEGO Hub — Bluetooth Bridge</h1>
<div class="card" id="wsCard">
 <strong>WebSocket:</strong> <span id="wsStatus">Connecting…</span>
</div>
<div class="card" id="bleCard">
 <strong>Hub:</strong> <span id="status">Not connected</span>
</div>
<div>
 <button id="btnConnect">Connect Hub</button>
 <button id="btnDisconnect" disabled>Disconnect</button>
</div>
<p class="note">Keep this tab open while using VS Code. The extension controls
 when to show the Bluetooth pairing dialog.</p>
<div id="log"></div>
<script>
(function(){
'use strict';

const SVC  = '${svcUUID}';
const RX   = '${rxUUID}';  // hub receives
const TX   = '${txUUID}';  // hub sends notifications
const CHUNK = ${BLE_CHUNK_SIZE};

// --- DOM helpers ---
const elWsStatus  = document.getElementById('wsStatus');
const elWsCard    = document.getElementById('wsCard');
const elStatus    = document.getElementById('status');
const elBleCard   = document.getElementById('bleCard');
const elLog       = document.getElementById('log');
const btnConnect  = document.getElementById('btnConnect');
const btnDisc     = document.getElementById('btnDisconnect');

function log(msg, color) {
  const s = document.createElement('span');
  if (color) s.style.color = color;
  s.textContent = new Date().toLocaleTimeString() + '  ' + msg + '\\n';
  elLog.appendChild(s);
  elLog.scrollTop = elLog.scrollHeight;
}

function setBle(text, cls) {
  elStatus.textContent = text;
  elBleCard.className = 'card ' + (cls || '');
  btnConnect.disabled  = cls === 'ok';
  btnDisc.disabled     = cls !== 'ok';
}

// --- State ---
let dev = null, rxChar = null, txChar = null;
let ws  = null;

// --- WS connection ---
// Derive the WS URL from our own host in case Codespaces rewrites the port.
function makeWsUrl() {
  const loc = window.location;
  const scheme = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return scheme + '//' + loc.host + '/';
}

function connectWs() {
  var url = makeWsUrl();
  log('Connecting WebSocket to ' + url + '…');
  ws = new WebSocket(url);
  var wsReconnectDelay = 1000;
  var WS_MAX_RECONNECT_DELAY = 8000;

  ws.onopen = function() {
    wsReconnectDelay = 1000; // reset on success
    elWsStatus.textContent = 'Connected';
    elWsCard.className = 'card ok';
    log('WebSocket connected to extension', '#64b5f6');
  };

  ws.onclose = function() {
    elWsStatus.textContent = 'Reconnecting in ' + (wsReconnectDelay / 1000) + 's…';
    elWsCard.className = 'card warn';
    log('WebSocket closed — retrying in ' + (wsReconnectDelay / 1000) + 's', '#ffa726');
    ws = null;
    var d = wsReconnectDelay;
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, WS_MAX_RECONNECT_DELAY);
    setTimeout(connectWs, d);
  };

  ws.onerror = function() {
    // onclose will fire next and handle the reconnect
  };

  ws.onmessage = async function(e) {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'prompt_connect') {
      // If BLE is already paired, immediately notify the extension.
      if (dev && dev.gatt && dev.gatt.connected && rxChar) {
        var name = dev.name || 'Hub';
        log('Already connected to ' + name + ', notifying extension.', '#81c784');
        ws.send(JSON.stringify({ type: 'ble_connected', name: name }));
      } else {
        // Extension is waiting — highlight the Connect button for the user.
        log('Extension is waiting. Click "Connect Hub" below.', '#ffa726');
        btnConnect.classList.add('pulse');
        btnConnect.focus();
      }
    } else if (msg.type === 'write' && msg.data) {
      await writeToHub(new Uint8Array(msg.data));
    } else if (msg.type === 'disconnect') {
      disconnectBle();
    }
  };
}

// --- Helpers ---
function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// Retry GATT connect — LEGO hubs often drop the initial connection.
async function gattConnectWithRetry(device, retries, delayMs) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log('GATT connect attempt ' + attempt + '/' + retries + '…');
      const server = await device.gatt.connect();
      // Brief pause to let the connection stabilise before service discovery.
      await delay(300);
      return server;
    } catch (err) {
      log('Attempt ' + attempt + ' failed: ' + (err.message || err), '#ffa726');
      if (attempt === retries) throw err;
      await delay(delayMs);
    }
  }
}

// --- BLE ---
async function connectBle() {
  if (!navigator.bluetooth) {
    log('Web Bluetooth not available. Use Chrome or Edge.', '#e57373');
    setBle('Web Bluetooth unavailable', 'err');
    return;
  }
  try {
    log('Opening Bluetooth picker…');
    setBle('Scanning…', 'warn');
    dev = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SVC] }],
    });
    log('Found: ' + dev.name);

    setBle('Connecting…', 'warn');
    const server = await gattConnectWithRetry(dev, 3, 1000);
    const service = await server.getPrimaryService(SVC);
    rxChar = await service.getCharacteristic(RX);
    txChar = await service.getCharacteristic(TX);

    await txChar.startNotifications();
    txChar.addEventListener('characteristicvaluechanged', onNotify);

    // Register disconnect listener only after a stable connection,
    // to avoid premature disconnect events during GATT negotiation.
    dev.addEventListener('gattserverdisconnected', onBleDisconnect);

    const name = dev.name || 'Hub';
    log('Connected to ' + name + '!', '#81c784');
    setBle('Connected: ' + name, 'ok');

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ble_connected', name: name }));
    }
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    log('BLE error: ' + msg, '#e57373');
    setBle('Error: ' + msg, 'err');
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ble_error', message: msg }));
    }
  }
}

function onNotify(e) {
  const bytes = Array.from(new Uint8Array(e.target.value.buffer));
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'notify', data: bytes }));
  }
}

function onBleDisconnect() {
  log('Hub disconnected', '#e57373');
  setBle('Disconnected', 'err');
  rxChar = null; txChar = null; dev = null;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ble_disconnected' }));
  }
}

async function writeToHub(data) {
  if (!rxChar) { log('Write skipped — not connected', '#ffa726'); return; }
  try {
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, Math.min(i + CHUNK, data.length));
      await rxChar.writeValueWithoutResponse(chunk);
    }
  } catch (err) {
    log('Write error: ' + (err.message || err), '#e57373');
  }
}

function disconnectBle() {
  if (dev && dev.gatt && dev.gatt.connected) {
    dev.gatt.disconnect();
  }
}

// --- Button handlers ---
btnConnect.onclick = function() { btnConnect.classList.remove('pulse'); connectBle(); };
btnDisc.onclick    = disconnectBle;

// --- Boot ---
connectWs();

})();
</script>
</body>
</html>`;
  }
}
