import * as vscode from 'vscode';

import path from 'path';
import { ConnectionManager } from '../communication/connection-manager';
import { showError } from '../extension/diagnostics';
import {
    HubTypeDescriptors,
    HubTypeDescriptorType,
} from '../pybricks/autodetect/const';
import {
    autodetectPybricksHub,
    generateDetectedPortCode,
    padInit,
} from '../pybricks/autodetect/logic';
import { resolveGitAuthor } from '../utils/git-detection';

interface TemplateContext {
    filename: string;
    author?: string;
    date: string;
    workspaceName?: string;
    connectedDevice?: string;
}

const HUB_TYPE_PLACEHOLDER = '$$HUB_TYPE$$';
const HUB_LINE_PLACEHOLDER = '$$HUB_LINE_PLACEHOLDER$$';

const PYBRICKS_BASE_TEMPLATE = `from pybricks.hubs import ${HUB_TYPE_PLACEHOLDER}
from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor, ForceSensor
from pybricks.parameters import Button, Color, Direction, Port, Side, Stop
from pybricks.robotics import DriveBase
from pybricks.tools import wait, StopWatch

${HUB_LINE_PLACEHOLDER}
`;

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

/**
 * Enhance a template with dynamic content
 */
function enhanceTemplate(
    baseTemplate: string,
    hubType: HubTypeDescriptorType,
    longestInitLength: number,
    context: TemplateContext,
): string {
    let enhanced = baseTemplate;

    // Replace ThisHub with the selected hub type
    const hubline = padInit(
        'hub',
        `${hubType.hubType}()`,
        hubType.label,
        longestInitLength,
    );

    enhanced = enhanced
        .replaceAll(HUB_TYPE_PLACEHOLDER, hubType.hubType)
        .replaceAll(HUB_LINE_PLACEHOLDER, hubline);

    // Add file header if requested
    const header = generateFileHeader(context);
    enhanced = header + enhanced;

    return enhanced;
}

/**
 * Show a quick pick to select a hub type and return the template with dynamic content
 */
async function selectHubTemplate(filename: string): Promise<string | undefined> {
    // Device auto detection
    let { hubType, portTypes } = await autodetectPybricksHub();

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
        return undefined;
    }

    // Add port code
    const { code: autocode, longestInitLength } = generateDetectedPortCode(portTypes);

    // Enhance template with dynamic content
    const context = await getTemplateContext(filename, hubType);
    let code = enhanceTemplate(
        PYBRICKS_BASE_TEMPLATE,
        hubType,
        longestInitLength,
        context,
    );
    code += autocode;

    return code;
}

/**
 * Insert a Pybricks template at the current cursor position or at the beginning of the file
 */
export async function insertPybricksTemplate(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        showError('No active editor. Please open a Python file first.');
        return;
    }

    if (editor.document.languageId !== 'python') {
        showError('This command only works with Python files.');
        return;
    }

    const template = await selectHubTemplate(path.basename(editor.document.uri.fsPath));
    if (!template) {
        return; // User cancelled
    }

    const position = editor.selection.active;
    await editor.edit((editBuilder) => {
        editBuilder.insert(position, template);
    });

    // Move cursor to the end of the inserted template
    const lines = template.split('\n').length;
    const newPosition = new vscode.Position(position.line + lines - 1, 0);
    editor.selection = new vscode.Selection(newPosition, newPosition);
}

/**
 * Create a new Python file with a Pybricks template
 */
export async function createPybricksFile(): Promise<void> {
    // get template
    const template = await selectHubTemplate('untitled.py');
    if (!template) {
        return; // User cancelled
    }

    // create a new file
    const newFile = await vscode.workspace.openTextDocument({
        language: 'python',
        content: template,
    });

    // show the new file
    await vscode.window.showTextDocument(newFile);

    // move to the end of the file
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const position = editor.document.positionAt(editor.document.getText().length);
        editor.selection = new vscode.Selection(position, position);
    }
}
