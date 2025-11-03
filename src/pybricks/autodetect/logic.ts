import * as vscode from 'vscode';

import {
    BaseClient,
    DeviceOSType,
    StartMode,
} from '../../communication/clients/base-client';
import { PybricksBleClient } from '../../communication/clients/pybricks-ble-client';
import { ConnectionManager } from '../../communication/connection-manager';
import { loadPythonAssetModule } from '../../logic/compile';
import { StateProp, waitForStateWithTimeout } from '../../logic/state';
import { PnpId } from '../ble-device-info-service/protocol';
import { HubType } from '../ble-lwp3-service/protocol';
import {
    DEVICE_NAMES,
    HubTypeDescriptors,
    HubTypeDescriptorType,
    MOTOR_SIZES,
} from './const';

const AUTODETECT_PREFIX = 'AUTODETECT';
const AUTODETECT_TIMEOUT_MS = 10 * 1000;
const AUTODETECT_SCRIPT_NAME = 'hub-autodetect.py';
// const AUTODETECT_MOVE_SCRIPT_NAME = 'hub-autodetect-move.py';

export async function autodetectPybricksHub(): Promise<{
    hubType: HubTypeDescriptorType | undefined;
    portTypes: Record<string, number | string>;
}> {
    const client0 = ConnectionManager.client;
    if (
        !client0 ||
        !client0.connected ||
        client0.classDescriptor.os !== DeviceOSType.Pybricks ||
        !(client0 instanceof PybricksBleClient)
    ) {
        return { hubType: undefined, portTypes: {} };
    }
    const client: PybricksBleClient = client0;

    let hubType: HubTypeDescriptorType | undefined = undefined;
    let portTypes: Record<string, number | string> = {};

    // Try to autodetect the hub type
    const pnpId = client.pnpId;
    hubType = getHubTypeDescriptor(pnpId);

    try {
        if (hubType?.productId === HubType.MoveHub)
            throw new Error('MoveHub autodetection not supported');

        const { content } = await loadPythonAssetModule(AUTODETECT_SCRIPT_NAME);
        if (content) {
            // Start listening for output before sending the code
            const outputPromise = waitForReplOutput(
                client,
                AUTODETECT_PREFIX,
                AUTODETECT_TIMEOUT_MS,
            );
            await client.action_start(StartMode.REPL, content);

            // Wait for the detection result (max 10 seconds)
            const output = await outputPromise;
            await client.action_stop(); // stop the REPL

            if (output) {
                try {
                    // Parse the detection result
                    const detectionResult = JSON.parse(
                        output.replace(/'/g, '"'),
                    ) as Array<[string, number | string]>;
                    console.debug('Device detection result:', output);

                    // returns an array of [port, puptype]
                    detectionResult.forEach(
                        ([port, puptype]: [string, number | string]) => {
                            portTypes[port] = puptype;
                        },
                    );
                } catch {
                    console.error('Failed to parse detection result:', output);
                }
            }

            // need for REPL to finish as we want to add a quick pick to select the hub type
            // quick pick will be cancelled on state change / tree refresh
            await waitForStateWithTimeout(
                StateProp.Running,
                false,
                AUTODETECT_TIMEOUT_MS,
            );
        }
    } catch (error) {
        // Silently fail - device detection is optional
        console.error('Device auto-detection failed:', error);
    }

    return { hubType, portTypes };
}

/**
 * Wait for the first line of output from REPL with a timeout
 */
function waitForReplOutput(
    client: BaseClient,
    lineStartsWith: string,
    timeoutMs: number = 10000,
): Promise<string | undefined> {
    return new Promise((resolve) => {
        let timeoutHandle: NodeJS.Timeout | undefined;
        let disposable: vscode.Disposable | undefined;
        let resolved = false;

        const cleanup = () => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (disposable) disposable.dispose();
        };

        const resolveOnce = (value: string | undefined) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve(value);
            }
        };

        // Set up timeout
        timeoutHandle = setTimeout(() => {
            resolveOnce(undefined);
        }, timeoutMs);

        // Listen for stdout
        disposable = client.onStdout((data: string) => {
            const trimmed = data.trim();
            if (trimmed.startsWith(lineStartsWith)) {
                const result = trimmed.substring(lineStartsWith.length).trim();
                resolveOnce(result);
            }
        });
    });
}

export function generateDetectedPortCode(portTypes: Record<string, number | string>): {
    code: string;
    longestInitLength: number;
} {
    // Add port types to template ordered by port alphabetically
    const ports = Object.keys(portTypes).sort();
    let motorpair: { m1: string; m2: string } | undefined = undefined;
    const motor_objects: Record<string, string> = {};
    const autodevices: Record<string, [string, string, string]> = {};
    for (const port of ports) {
        const puptype = portTypes[port];
        // code += `\nport_${port} = PUPDevice(Port.${port})`
        const pcl = port.toLowerCase();
        let deviceName =
            typeof puptype === 'number'
                ? DEVICE_NAMES[puptype] || `Unknown device ${puptype}`
                : puptype;
        let deviceVar = '';
        let deviceInit = '';
        switch (puptype) {
            case 0:
                continue;
            case 63:
            case 'ForceSensor':
                deviceVar = `force_${pcl}`;
                deviceInit = `ForceSensor(Port.${port})`;
                autodevices[deviceVar] = [deviceVar, deviceInit, deviceName];
                break;
            case 62:
            case 'UltrasonicSensor':
                deviceVar = `usensor_${pcl}`;
                deviceInit = `UltrasonicSensor(Port.${port})`;
                autodevices[deviceVar] = [deviceVar, deviceInit, deviceName];
                break;
            case 61:
            case 'ColorSensor':
                deviceVar = `color_${pcl}`;
                deviceInit = `ColorSensor(Port.${port})`;
                autodevices[deviceVar] = [deviceVar, deviceInit, deviceName];
                break;
            case 37:
            case 'ColorDistanceSensor':
                deviceVar = `color_${pcl}`;
                deviceInit = `ColorDistanceSensor(Port.${port})`;
                autodevices[deviceVar] = [deviceVar, deviceInit, deviceName];
                break;
            default:
                if (isMotor(puptype)) {
                    deviceVar = `motor_${pcl}`;
                    deviceInit = `Motor(Port.${port})`;
                    motor_objects[port] = `motor_${pcl}`; //!!
                    autodevices[deviceVar] = [deviceVar, deviceInit, deviceName];
                } else {
                    deviceVar = `device_${pcl}`;
                    deviceInit = `PUPDevice(Port.${port})`;
                    autodevices[deviceVar] = [deviceVar, deviceInit, deviceName];
                }
                break;
        }
    }

    // Add DriveBase if two motors are detected
    if (Object.keys(motor_objects).length >= 2) {
        const entries = Object.entries(motor_objects); // [port, motorVar]

        const isDeviceByNumericIds = Object.entries(portTypes).every(
            ([_, id]) => typeof id === 'number',
        );

        if (isDeviceByNumericIds) {
            // Helper to sort pairs by descending motor size
            const sortBySizeDesc = (a: { size: number }, b: { size: number }) =>
                (b.size ?? 0) - (a.size ?? 0);

            // 1) Find any matching motors with identical puptype, prefer larger motors first
            const sameTypePairs = [] as Array<{ m1: string; m2: string; size: number }>;
            for (let i = 0; i < entries.length; i++) {
                const [port1, m1] = entries[i];
                const pt1 = portTypes[port1] as number;
                for (let j = i + 1; j < entries.length; j++) {
                    const [port2, m2] = entries[j];
                    const pt2 = portTypes[port2] as number;
                    if (pt1 === pt2) {
                        const size = MOTOR_SIZES[pt1] ?? 0;
                        sameTypePairs.push({ m1, m2, size });
                    }
                }
            }
            sameTypePairs.sort(sortBySizeDesc);

            motorpair = sameTypePairs[0];

            // 2) If none, find pairs with the same motor size (via MOTOR_SIZES), prefer larger size
            if (!motorpair) {
                const sameSizePairs = [] as Array<{
                    m1: string;
                    m2: string;
                    size: number;
                }>;
                for (let i = 0; i < entries.length; i++) {
                    const [port1, m1] = entries[i];
                    const size1 = MOTOR_SIZES[portTypes[port1] as number];
                    if (size1 === undefined) continue;
                    for (let j = i + 1; j < entries.length; j++) {
                        const [port2, m2] = entries[j];
                        const size2 = MOTOR_SIZES[portTypes[port2] as number];
                        if (size2 === undefined) continue;
                        if (size1 === size2) {
                            sameSizePairs.push({ m1, m2, size: size1 });
                        }
                    }
                }
                sameSizePairs.sort(sortBySizeDesc);
                if (sameSizePairs.length) {
                    motorpair = sameSizePairs[0];
                }
            }
        }

        // 3) Fallback: match first two motors
        if (!motorpair) {
            const [, m1] = entries[0];
            const [, m2] = entries[1];
            motorpair = { m1, m2 };
        }

        if (motorpair) {
            // Set direction of first motor to counter-clockwise
            autodevices[motorpair.m1][1] = autodevices[motorpair.m1][1].replace(
                /\)$/,
                ', positive_direction=Direction.COUNTERCLOCKWISE)',
            );
        }
    }

    // Add code for Devices and DriveBase
    const autocode: string[] = [];
    let longestInitLength = 0;
    let motorpairCode: [string, string, string] | undefined = undefined;
    for (const [varName, [_, init]] of Object.entries(autodevices)) {
        longestInitLength = Math.max(longestInitLength, varName.length + init.length);
    }
    if (motorpair) {
        const { m1, m2 } = motorpair;
        motorpairCode = [
            'robot',
            `DriveBase(${m1}, ${m2}, wheel_diameter=56, axle_track=114)`,
            'Pair of motors, adjust parameters as needed',
        ];
        longestInitLength = Math.max(longestInitLength, motorpairCode.length);
    }

    // Add device initializations
    for (const [varName, [_, init, name]] of Object.entries(autodevices)) {
        autocode.push(padInit(varName, init, name, longestInitLength));
    }

    // Add DriveBase initialization if available
    if (motorpairCode) {
        // Add DriveBase code and examples
        autocode.push(padInit(...motorpairCode, longestInitLength));
        autocode.push('');
        autocode.push('# Example commands, uncomment and run to test:');
        autocode.push('# robot.straight(100) # Move robot forward for 10 cm / 100 mm');
        autocode.push('# robot.turn(90) # Make robot turn 90 degrees');
        autocode.push(
            '# robot.curve(100, 90) # Make robot curve 90 degrees, using a 100 mm radius arc',
        );
        autocode.push(
            '# robot.arc(100, 90) # Make robot curve 90 degrees, using a 100 mm radius arc - similar to curve',
        );
        autocode.push(
            '# robot.arc(100, distance=100) # Make robot curve 100 mms, using a 100 mm radius arc',
        );
        autocode.push('# robot.stop() # Stop robot (optional)');
    }

    if (autocode.length) {
        autocode.push('');
    }

    const code = autocode.join('\n');

    return { code, longestInitLength };
}

// Padding function for code alignment
export function padInit(
    varname: string,
    init: string,
    comment: string,
    longestInitLength: number,
) {
    const paddingLength = Math.max(longestInitLength - varname.length - init.length, 0);
    const padding = ' '.repeat(paddingLength);
    return `${varname} = ${init}${padding} # ${comment}`;
}

function getHubTypeDescriptor(
    pnpId: PnpId | undefined,
): HubTypeDescriptorType | undefined {
    if (!pnpId) return undefined;
    const { productId, productVersion } = pnpId;

    return HubTypeDescriptors.find(
        (d) =>
            d.productId === productId &&
            (d.productVersion === undefined || d.productVersion === productVersion),
    );
}

function isMotor(puptype: number | string): boolean {
    if (typeof puptype === 'number') {
        return MOTOR_SIZES[puptype] !== undefined;
    } else {
        return puptype === 'Motor';
    }
}
