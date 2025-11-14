import { DeviceMetadata } from '..';
import { RefreshTree } from '../../extension/tree-commands';
import { LayerKind } from '../layers/base-layer';
import { BaseClient, ClientClassDescriptor } from './base-client';

export class MockClient extends BaseClient {
    public static override readonly classDescriptor: ClientClassDescriptor = {
        os: undefined,
        layer: LayerKind.MOCK,
        deviceType: 'mock',
        description: 'Mock Device',
        supportsModularMpy: true,
        requiresSlot: false,
    };

    private _connected: boolean = false;

    public override get descriptionKVP(): [string, string][] {
        return [] as [string, string][];
    }

    public get connected() {
        return this._connected;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    protected async connectWorker(
        _onDeviceUpdated: (device: DeviceMetadata) => void,
        onDeviceRemoved: (device: DeviceMetadata, id?: string) => void,
    ) {
        const metadata = this.metadata;
        if (!metadata) throw new Error('No metadata client');

        this._connected = true;
        this._exitStack.push(() => {
            if (onDeviceRemoved) onDeviceRemoved(metadata);
            RefreshTree();
        });
    }

    protected override async disconnectWorker() {
        this._connected = false;

        // forced, even ok to remove current client

        RefreshTree(true);

        return Promise.resolve();
    }

    protected async write(_data: Uint8Array): Promise<void> {
        // NOOP
    }

    protected async handleIncomingData(_data: Buffer): Promise<void> {
        // NOOP
    }

    public override async sendTerminalUserInputAsync(_text: string) {
        // NOOP
    }
}
