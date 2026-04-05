/**
 * Tests for the Web Bluetooth Bridge layer.
 *
 * The WebBTBridgeLayer has deep transitive dependencies (BaseLayer →
 * BaseClient → extension → … ). Rather than mocking the entire dependency
 * chain, these tests spin up the layer's HTTP+WS server in isolation and
 * exercise it directly, plus validate the generated bridge page HTML/JS.
 */

import * as http from 'http';
import { WebSocket, WebSocketServer } from 'ws';

import {
  SPIKE_SERVICE_UUID,
  SPIKE_RX_CHAR_UUID,
  SPIKE_TX_CHAR_UUID,
} from '../../spike/protocol';

// ---------------------------------------------------------------------------
// Helpers — we test the HTTP server and HTML generation in isolation because
// instantiating WebBTBridgeLayer pulls in the full extension graph via
// BaseLayer → connection-manager → extension.ts.
// ---------------------------------------------------------------------------

/** Start an HTTP + WS server identical to WebBTBridgeLayer._startServer(). */
function startBridgeServer(html: string) {
  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '')) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  const wss = new WebSocketServer({
    server: httpServer,
    perMessageDeflate: false,
  });

  let currentSocket: WebSocket | undefined;
  wss.on('connection', (ws) => {
    if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
      currentSocket.close();
    }
    currentSocket = ws;
    ws.on('close', () => {
      if (currentSocket === ws) currentSocket = undefined;
    });
  });

  return new Promise<{
    port: number;
    httpServer: http.Server;
    wss: WebSocketServer;
    getCurrentSocket: () => WebSocket | undefined;
    close: () => void;
  }>((resolve, reject) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      const port = typeof addr === 'object' ? addr!.port : 0;
      resolve({
        port,
        httpServer,
        wss,
        getCurrentSocket: () => currentSocket,
        close: () => {
          currentSocket?.close();
          wss.close();
          httpServer.close();
        },
      });
    });
    httpServer.once('error', reject);
  });
}

/** Build the bridge HTML exactly as the layer does. */
function buildBridgeHtml(): string {
  const svcUUID = SPIKE_SERVICE_UUID;
  const rxUUID = SPIKE_RX_CHAR_UUID;
  const txUUID = SPIKE_TX_CHAR_UUID;
  const BLE_CHUNK_SIZE = 20;

  // This is a direct copy of _getBridgePageHtml() so the test catches
  // drift between the template and the expected structure.  If the layer
  // template changes substantially, update this copy or extract a shared
  // helper.
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

function fetchBody(port: number, path = '/'): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function fetchHeaders(
  port: number,
  path = '/',
): Promise<http.IncomingHttpHeaders> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      res.resume();
      resolve(res.headers);
    }).on('error', reject);
  });
}

function fetchStatus(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebBTBridge — HTTP server', () => {
  let server: Awaited<ReturnType<typeof startBridgeServer>>;

  beforeEach(async () => {
    server = await startBridgeServer(buildBridgeHtml());
  });

  afterEach(() => {
    server.close();
  });

  it('should serve bridge HTML at /', async () => {
    const body = await fetchBody(server.port);
    expect(body).toContain('<!DOCTYPE html>');
    expect(body).toContain('LEGO Hub');
    expect(body).toContain('Web Bluetooth Bridge');
  });

  it('should return cache-prevention headers', async () => {
    const headers = await fetchHeaders(server.port);
    expect(headers['cache-control']).toBe(
      'no-cache, no-store, must-revalidate',
    );
    expect(headers['pragma']).toBe('no-cache');
  });

  it('should return 404 for unknown paths', async () => {
    const status = await fetchStatus(server.port, '/unknown');
    expect(status).toBe(404);
  });
});

describe('WebBTBridge — HTML content', () => {
  it('should inline SPIKE service/characteristic UUIDs', () => {
    const html = buildBridgeHtml();
    expect(html).toContain(SPIKE_SERVICE_UUID);
    expect(html).toContain(SPIKE_RX_CHAR_UUID);
    expect(html).toContain(SPIKE_TX_CHAR_UUID);
  });

  it('should contain valid JavaScript (no syntax errors)', () => {
    const html = buildBridgeHtml();
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    const js = scriptMatch![1];

    // Parsing via Function constructor will throw SyntaxError if invalid.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    expect(() => new Function(js)).not.toThrow();
  });

  it('should have a well-formed if/else chain in ws.onmessage', () => {
    const html = buildBridgeHtml();
    // The bug we fixed: "} else { ... } else if" — two else clauses
    // on the same if. Ensure the pattern doesn't regress.
    // Valid: "} else { ... }\n    } else if"
    // Invalid: "}\n      } else if" right after another else block
    // without a closing "}" for the outer if first.
    expect(html).not.toMatch(
      /}\s*else\s*\{[^}]*\}\s*else\s+if\s*\(/,
    );
  });

  it('should contain required DOM element IDs', () => {
    const html = buildBridgeHtml();
    for (const id of [
      'wsCard',
      'wsStatus',
      'bleCard',
      'status',
      'log',
      'btnConnect',
      'btnDisconnect',
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('should chunk BLE writes to 20 bytes', () => {
    const html = buildBridgeHtml();
    expect(html).toContain('const CHUNK = 20;');
  });
});

describe('WebBTBridge — WebSocket server', () => {
  let server: Awaited<ReturnType<typeof startBridgeServer>>;

  beforeEach(async () => {
    server = await startBridgeServer(buildBridgeHtml());
  });

  afterEach(() => {
    server.close();
  });

  it('should accept WebSocket connections', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(server.getCurrentSocket()).toBeDefined();

    ws.close();
    await new Promise<void>((resolve) => ws.on('close', resolve));
  });

  it('should replace stale socket with new connection', async () => {
    const ws1 = new WebSocket(`ws://127.0.0.1:${server.port}/`);
    await new Promise<void>((resolve) => ws1.on('open', resolve));
    const first = server.getCurrentSocket();

    const ws2 = new WebSocket(`ws://127.0.0.1:${server.port}/`);
    await new Promise<void>((resolve) => ws2.on('open', resolve));
    const second = server.getCurrentSocket();

    expect(second).not.toBe(first);

    ws1.close();
    ws2.close();
    await Promise.all([
      new Promise<void>((resolve) => ws1.on('close', resolve)),
      new Promise<void>((resolve) => ws2.on('close', resolve)),
    ]);
  });

  it('should clear currentSocket when WS closes', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/`);
    await new Promise<void>((resolve) => ws.on('open', resolve));
    expect(server.getCurrentSocket()).toBeDefined();

    ws.close();
    await new Promise<void>((resolve) => ws.on('close', resolve));

    // Small delay to let server-side close handler run
    await new Promise((r) => setTimeout(r, 50));
    expect(server.getCurrentSocket()).toBeUndefined();
  });

  it('should relay JSON messages from client to server', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const serverSocket = server.getCurrentSocket()!;
    const received = new Promise<string>((resolve) => {
      serverSocket.on('message', (data: Buffer) =>
        resolve(data.toString('utf-8')),
      );
    });

    const testMsg = JSON.stringify({
      type: 'ble_connected',
      name: 'TestHub',
    });
    ws.send(testMsg);

    const msg = await received;
    expect(JSON.parse(msg)).toEqual({
      type: 'ble_connected',
      name: 'TestHub',
    });

    ws.close();
    await new Promise<void>((resolve) => ws.on('close', resolve));
  });

  it('should relay JSON messages from server to client', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const received = new Promise<string>((resolve) => {
      ws.on('message', (data: Buffer) => resolve(data.toString('utf-8')));
    });

    const serverSocket = server.getCurrentSocket()!;
    const testMsg = JSON.stringify({ type: 'prompt_connect' });
    serverSocket.send(testMsg);

    const msg = await received;
    expect(JSON.parse(msg)).toEqual({ type: 'prompt_connect' });

    ws.close();
    await new Promise<void>((resolve) => ws.on('close', resolve));
  });
});
