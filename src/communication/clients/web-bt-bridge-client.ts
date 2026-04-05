import type WebSocket from 'ws';

import { DeviceMetadata } from '..';
import { LayerKind } from '../layers/base-layer';
import { DeviceOSType } from './base-client';
import { HubOSBaseClient } from './hubos-base-client';

// --------------------------------------------------------------------------
// Bridge message types (extension ↔ browser page)
// --------------------------------------------------------------------------

export type BridgeMsgIn =
  | { type: 'ble_connected'; name: string }
  | { type: 'notify'; data: number[] }
  | { type: 'ble_disconnected' }
  | { type: 'ble_error'; message: string };

export type BridgeMsgOut =
  | { type: 'prompt_connect' }
  | { type: 'write'; data: number[] }
  | { type: 'disconnect' };

// --------------------------------------------------------------------------
// WebBTBridgeClient
//
// Extends HubOSBaseClient so that all COBS framing, message routing,
// InfoRequest/Response, DeviceNotification, Tunnel etc. are inherited.
// The only customisation is the transport layer: raw bytes go over WebSocket
// (to the browser bridge page) instead of directly to a BLE characteristic.
// --------------------------------------------------------------------------

export class WebBTBridgeClient extends HubOSBaseClient {
  public static override readonly classDescriptor = {
    os: DeviceOSType.HubOS,
    layer: LayerKind.BLE,
    deviceType: 'hubos-ble',
    description: 'HubOS via Web Bluetooth Bridge',
    supportsModularMpy: false,
    requiresSlot: true,
  };

  private _bleConnected = false;
  private _bleConnectedResolve: ((name: string) => void) | undefined;
  private _bleConnectedReject: ((err: Error) => void) | undefined;

  constructor(
    metadata: DeviceMetadata,
    private readonly _layer: import('../layers/web-bt-bridge-layer').WebBTBridgeLayer,
    private _socket: WebSocket,
  ) {
    super(metadata, _layer);
    // Don't attach listeners here — the socket may be a placeholder.
    // Listeners are attached in connectWorker() once the real socket is available.
  }

  // ------------------------------------------------------------------
  // BaseClient overrides
  // ------------------------------------------------------------------

  public override get connected(): boolean {
    return this._bleConnected;
  }

  public override get descriptionKVP(): [string, string][] {
    return [['type', 'Web BT Bridge'], ...super.descriptionKVP.slice(1)];
  }

  protected override async disconnectWorker(): Promise<void> {
    if (this._socket.readyState === this._socket.OPEN) {
      this._sendMsg({ type: 'disconnect' });
    }
    this._bleConnected = false;
  }

  // ------------------------------------------------------------------
  // connectWorker — called by BaseClient.connect()
  // ------------------------------------------------------------------

  protected override async connectWorker(
    _onDeviceUpdated: (device: DeviceMetadata) => void | undefined,
    _onDeviceRemoved: (device: DeviceMetadata) => void | undefined,
  ): Promise<void> {
    this._reattachCount = 0;

    // Wait for the browser WS page to be ready (it may connect briefly after
    // the HTTP page loads).
    await this._layer.waitForWsSocket();

    // The layer may have given us a new socket (if the old one closed before
    // connect was called). Refresh to the latest live socket.
    this._socket = this._layer.currentSocket!;
    this._attachSocketListeners();

    // Prompt the bridge page to highlight the Connect button.
    // We cannot call requestDevice() remotely — it requires a user gesture.
    const bleReadyPromise = new Promise<string>((resolve, reject) => {
      this._bleConnectedResolve = resolve;
      this._bleConnectedReject = reject;
    });
    this._sendMsg({ type: 'prompt_connect' });

    const hubName = await bleReadyPromise;
    this._bleConnected = true;

    // Update the metadata name so BaseClient.connect() name-check passes.
    (this._metadata as import('./web-bt-bridge-client').WebBTBridgeMetadata).hubName =
      hubName;

    this._exitStack.push(() => {
      this._bleConnected = false;
    });

    // Run the HubOS handshake (InfoRequest → InfoResponse).
    await this.finalizeConnect();
  }

  // ------------------------------------------------------------------
  // write — sends a raw Uint8Array (COBS-packed HubOS frame) to the hub
  // via the WS pipe.
  // ------------------------------------------------------------------

  protected override async write(data: Uint8Array): Promise<void> {
    this._sendMsg({ type: 'write', data: Array.from(data) });
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  private _sendMsg(msg: BridgeMsgOut): void {
    if (this._socket.readyState === this._socket.OPEN) {
      this._socket.send(JSON.stringify(msg));
    }
  }

  private _attachSocketListeners(): void {
    this._socket.on('message', (raw: WebSocket.RawData) => {
      void this._handleWsMessage(raw);
    });

    this._socket.on('close', () => {
      if (this._bleConnected) {
        this._bleConnected = false;
        void this.handleDisconnectAsync(this._metadata?.id ?? '');
        this._bleConnectedReject?.(new Error('WebSocket closed while connected'));
        this._bleConnectedResolve = undefined;
        this._bleConnectedReject = undefined;
      } else if (this._bleConnectedResolve) {
        // Still waiting for BLE pairing — try to reattach to a new socket
        // (the user may have reloaded the bridge page).
        void this._reattachSocket();
      }
    });
  }

  /** Wait for the browser page to reconnect its WS, then re-prompt. */
  private static readonly MAX_REATTACH_ATTEMPTS = 5;
  private _reattachCount = 0;

  private async _reattachSocket(): Promise<void> {
    this._reattachCount++;
    if (this._reattachCount > WebBTBridgeClient.MAX_REATTACH_ATTEMPTS) {
      this._bleConnectedReject?.(
        new Error('WebSocket closed before BLE connected (max retries exceeded)'),
      );
      this._bleConnectedResolve = undefined;
      this._bleConnectedReject = undefined;
      return;
    }

    console.debug(
      `WebBTBridge: WS closed during connect, waiting for reconnect (attempt ${this._reattachCount})…`,
    );

    try {
      await this._layer.waitForWsSocket();
      this._socket = this._layer.currentSocket!;
      this._attachSocketListeners();
      this._sendMsg({ type: 'prompt_connect' });
    } catch {
      this._bleConnectedReject?.(new Error('WebSocket closed before BLE connected'));
      this._bleConnectedResolve = undefined;
      this._bleConnectedReject = undefined;
    }
  }

  private async _handleWsMessage(raw: WebSocket.RawData): Promise<void> {
    let msg: BridgeMsgIn;
    try {
      msg = JSON.parse(raw.toString()) as BridgeMsgIn;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'ble_connected':
        this._bleConnectedResolve?.(msg.name);
        this._bleConnectedResolve = undefined;
        this._bleConnectedReject = undefined;
        break;

      case 'notify':
        // Feed raw bytes into the existing HubOS COBS decoder.
        await this.handleIncomingData(Buffer.from(msg.data));
        break;

      case 'ble_disconnected':
        // Reject pending connection promise if still in the connect phase.
        this._bleConnectedReject?.(new Error('BLE disconnected during connection'));
        this._bleConnectedResolve = undefined;
        this._bleConnectedReject = undefined;
        if (this._bleConnected) {
          this._bleConnected = false;
          void this.handleDisconnectAsync(this._metadata?.id ?? '');
        }
        break;

      case 'ble_error':
        // Explicit error from the bridge page — reject pending connection.
        this._bleConnectedReject?.(new Error(msg.message || 'BLE error'));
        this._bleConnectedResolve = undefined;
        this._bleConnectedReject = undefined;
        break;
    }
  }
}

// --------------------------------------------------------------------------
// DeviceMetadata subclass with a mutable hub name (set after BLE negotiate).
// --------------------------------------------------------------------------

export class WebBTBridgeMetadata extends DeviceMetadata {
  private _hubName: string;

  constructor(devtype: string, displayName: string) {
    super(devtype);
    this._hubName = displayName;
    // Never expire — bridge device is always visible while scanning.
    this.validTill = Number.MAX_VALUE;
  }

  public override get name(): string | undefined {
    return this._hubName;
  }

  public set hubName(n: string) {
    this._hubName = n;
  }
}
