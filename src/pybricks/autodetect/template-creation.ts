import * as vscode from 'vscode';

import { ConnectionManager } from '../../communication/connection-manager';
import { resolveGitAuthor } from '../../utils/git-detection';
import { HubTypeDescriptors, HubTypeDescriptorType } from './const';
import {
    autodetectPybricksHub,
    detectMotorPair,
    DeviceObjectType,
} from './detection-logic';

export const ROBOT_VAR = 'robot';
const HUB_VAR = 'hub';
const HUB_TYPE_PLACEHOLDER = '$$HUB_TYPE$$';
const PYBRICKS_BASE_TEMPLATE = `from pybricks.hubs import ${HUB_TYPE_PLACEHOLDER}
from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor, ForceSensor
from pybricks.parameters import Button, Color, Direction, Port, Side, Stop
from pybricks.robotics import DriveBase
from pybricks.tools import wait, StopWatch

`;
const TEMPLATE_CONFIGURATION_IN_PROGRESS =
    '\n# Autodetecting hub and devices... please wait...';

interface TemplateContext {
    filename: string;
    author?: string;
    date: string;
    workspaceName?: string;
    connectedDevice?: string;
    hubType?: string;
}

/**
 * Show a quick pick to select a hub type and return the template with dynamic content
 */
export async function selectHubTemplate(
    filename: string,
    onTemplateUpdated?: (code: string) => Promise<void>,
): Promise<string | undefined> {
    const retval = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Generating Pybricks template...',
            cancellable: false,
        },
        async (_progress, _token) => {
            // Device auto detection

            const getcode = async (
                hubType: HubTypeDescriptorType | undefined = undefined,
                devices: Record<string, DeviceObjectType> = {},
                inProgress: boolean = false,
            ) => {
                const context = await getTemplateContext(filename, hubType);
                let code = enhanceTemplate(PYBRICKS_BASE_TEMPLATE, context);
                const autocode = generateDeviceInitCode(
                    hubType,
                    Object.values(devices),
                    inProgress,
                );
                code += autocode;
                return code;
            };

            // initial template
            await onTemplateUpdated?.(await getcode(undefined, undefined, true));

            // autodetect
            let { hubType, devices } = await autodetectPybricksHub();
            await onTemplateUpdated?.(await getcode(hubType, devices, true));

            // Pick hubtype is not detected
            if (!hubType) {
                const items = HubTypeDescriptors.map((t) => ({
                    label: `$(circuit-board) ${t.label}`,
                    // description: t.label,
                    hubType: t.hubType,
                    hubTypeDescriptor: t,
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select the hub type for your Pybricks program',
                    matchOnDescription: true,
                });

                if (selected) {
                    hubType = selected.hubTypeDescriptor;
                }
            }

            // User cancelled
            if (!hubType) {
                await onTemplateUpdated?.('');
                return undefined;
            }

            // update code
            await onTemplateUpdated?.(await getcode(hubType, devices, true));

            // Add port code
            await detectMotorPair(devices, hubType);
            const code = await getcode(hubType, devices);
            await onTemplateUpdated?.(code);

            return code;
        },
    );

    return retval;
}

/**
 * Enhance a template with dynamic content
 */
function enhanceTemplate(baseTemplate: string, context: TemplateContext): string {
    let enhanced = baseTemplate;

    enhanced = enhanced.replace(HUB_TYPE_PLACEHOLDER, context.hubType ?? 'ThisHub');

    // Add file header if requested
    const header = generateFileHeader(context);
    enhanced = header + enhanced;

    return enhanced;
}

/**
 * Gather dynamic context information for template generation
 */
async function getTemplateContext(
    filename: string,
    hubType: HubTypeDescriptorType | undefined,
): Promise<TemplateContext> {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Get workspace name
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceName = workspaceFolder?.name;

    let author: string | undefined;
    try {
        const { name } = await resolveGitAuthor();
        author = name;
    } catch {
        author = undefined;
    }

    // Get connected device info if available
    let connectedDevice: string | undefined;
    try {
        const client = ConnectionManager.client;
        if (client) {
            connectedDevice = `${client.name}, ${hubType?.label}`;
        }
    } catch {
        // ConnectionManager not initialized or no device connected
    }

    return {
        filename,
        author,
        date: dateStr,
        workspaceName,
        connectedDevice,
        hubType: hubType?.hubType,
    };
}

/**
 * Generate a file header comment based on context
 */
function generateFileHeader(context: TemplateContext): string {
    const lines: string[] = ['"""'];
    lines.push(context.filename);

    if (context.author || context.date) {
        lines.push('');
        if (context.author) lines.push(`Author: ${context.author}`);
        if (context.date) lines.push(`Date: ${context.date}`);
    }

    if (context.workspaceName) {
        lines.push(`Project: ${context.workspaceName}`);
    }

    if (context.connectedDevice) {
        lines.push(`Hub: ${context.connectedDevice}`);
    }

    lines.push('"""', '');
    return lines.join('\n');
}

export function generateDeviceInitCode(
    hubType: HubTypeDescriptorType | undefined,
    devices0: DeviceObjectType[],
    inProgress: boolean = false,
): string {
    const devices1 = [
        {
            variable: HUB_VAR,
            init: `${hubType ? hubType.hubType : 'ThisHub'}()`,
            description: hubType?.label,
        } satisfies DeviceObjectType,
        ...devices0,
    ];

    // Add device initializations
    const padlength = devices1
        .map((d) => (d.variable?.length ?? 0) + (d.init?.length ?? 0))
        .reduce((a, b) => Math.max(a, b));

    const autocode: string[] = [];
    for (const obj of devices1) {
        autocode.push(padDeviceInit(obj, padlength));
    }

    // Add DriveBase initialization if available
    if (devices1.find((d) => d.variable === ROBOT_VAR)) {
        // Add DriveBase code and examples
        autocode.push(
            ...[
                '',
                '# Example commands, uncomment and run to test:',
                '# robot.straight(100)          # Move robot forward for 10 cm / 100 mm',
                '# robot.turn(90)               # Make robot turn 90 degrees',
                '# robot.curve(100, 90)         # Make robot curve 90 degrees, using a 100 mm radius arc',
                '# robot.arc(100, 90)           # Make robot curve 90 degrees, using a 100 mm radius arc - similar to curve',
                '# robot.arc(100, distance=100) # Make robot curve 100 mms, using a 100 mm radius arc',
                '# robot.stop()                 # Stop robot (optional)',
            ],
        );
    }

    if (inProgress) {
        autocode.push(TEMPLATE_CONFIGURATION_IN_PROGRESS);
    }

    if (autocode.length) {
        autocode.push('');
    }

    const code = autocode.join('\n');

    return code;
}

function padDeviceInit(device: DeviceObjectType, padlength: number) {
    const paddingLength = Math.max(
        padlength - (device.variable?.length ?? 0) - (device.init?.length ?? 0),
        0,
    );
    const padding = ' '.repeat(paddingLength);
    return `${device.variable} = ${device.init}${padding}${
        device.description ? ` # ${device.description}` : ''
    }`;
}
