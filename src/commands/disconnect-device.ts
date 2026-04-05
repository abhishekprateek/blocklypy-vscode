import { ConnectionManager } from '../communication/connection-manager';
import { hasState, StateProp } from '../logic/state';
import { stopUserProgramAsync } from './stop-user-program';
import { withViewProgress } from './utils';

export async function disconnectDeviceAsync() {
    if (!hasState(StateProp.Connected)) {
        throw new Error('No device is currently connected.');
    }

    if (hasState(StateProp.Running)) {
        await stopUserProgramAsync();
    }

    await withViewProgress(
        {
            title: `Disconnecting from device...`,
        },
        async () => {
            await ConnectionManager.disconnect();
        },
    );
}
