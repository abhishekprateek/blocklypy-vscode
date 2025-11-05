import * as vscode from 'vscode';
import { DeviceObjectType } from '../pybricks/autodetect/detection-logic';
import { getScriptUri } from './utils';

const AUTODETECT_ROBOT_SIZING_WEBVIEW_NAME = 'AutodetectWebview';

interface AutodetectResult {
    wheel_diameter: number;
    axle_track: number;
}

interface AutodetectOptions {
    hubType: string;
    wheelDiameter: number;
    axleTrack: number;
    wheelPorts: string; // concatenated port for the drivebase - AB
    devices: DeviceObjectType[];
}

export class AutodetectPanel {
    private static currentPanel: AutodetectPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly context: vscode.ExtensionContext;
    private resolvePromise?: (result: AutodetectResult | undefined) => void;

    private constructor(context: vscode.ExtensionContext, options: AutodetectOptions) {
        this.context = context;

        // Create the webview panel with minimal chrome for a floating appearance
        this.panel = vscode.window.createWebviewPanel(
            'pybricks-autodetect',
            'Device Autodetect - Robot Sizing',
            {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false,
            },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'dist'),
                    vscode.Uri.joinPath(context.extensionUri, 'asset'),
                ],
            },
        );

        // Set the HTML content
        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            (message: {
                command: string;
                wheelDiameter?: number;
                axleTrack?: number;
            }) => {
                if (
                    message.command === 'submit' &&
                    message.wheelDiameter !== undefined &&
                    message.axleTrack !== undefined
                ) {
                    this.resolvePromise?.({
                        wheel_diameter: message.wheelDiameter,
                        axle_track: message.axleTrack,
                    });
                    this.panel.dispose();
                } else if (message.command === 'cancel') {
                    this.resolvePromise?.(undefined);
                    this.panel.dispose();
                }
            },
            undefined,
            context.subscriptions,
        );

        // Handle panel disposal
        this.panel.onDidDispose(
            () => {
                this.resolvePromise?.(undefined);
                AutodetectPanel.currentPanel = undefined;
            },
            undefined,
            context.subscriptions,
        );

        // Initialize the webview with the options
        const devices = options.devices.map((device) => ({
            port: device.port,
            description: device.description,
        }));
        setTimeout(() => {
            this.panel.webview.postMessage({
                command: 'initialize',
                hubType: options.hubType,
                wheelDiameter: options.wheelDiameter,
                axleTrack: options.axleTrack,
                wheelPorts: options.wheelPorts,
                devices,
            });
        }, 100);
    }

    /**
     * Show the robot sizing panel and return a promise that resolves with the result
     */
    public static async show(
        context: vscode.ExtensionContext,
        options: AutodetectOptions,
    ): Promise<AutodetectResult | undefined> {
        // If a panel already exists, dispose it
        if (AutodetectPanel.currentPanel) {
            AutodetectPanel.currentPanel.panel.dispose();
        }

        // Create a new panel
        const panel = new AutodetectPanel(context, options);
        AutodetectPanel.currentPanel = panel;

        // Return a promise that will be resolved when the user submits or cancels
        return new Promise<AutodetectResult | undefined>((resolve) => {
            panel.resolvePromise = resolve;
        });
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = getScriptUri(
            this.context,
            this.panel,
            AUTODETECT_ROBOT_SIZING_WEBVIEW_NAME,
        );

        // Use codicon font for native VS Code icons
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'dist',
                'codicons',
                'codicon.css',
            ),
        );

        // Get the template robot sizing image URI
        const templateImageUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'asset',
                'template-robot-sizing.jpg',
            ),
        );

        return /* html */ `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy"
                    content="default-src 'none'; font-src ${
                        webview.cspSource
                    }; style-src 'unsafe-inline' ${
            webview.cspSource
        }; script-src 'unsafe-inline' 'unsafe-eval' ${webview.cspSource}; img-src ${
            webview.cspSource
        };"/>
                <link href="${codiconsUri.toString()}" rel="stylesheet" />
                <style>
                    * {
                        box-sizing: border-box;
                    }

                    body {
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        font-weight: var(--vscode-font-weight);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 16px 20px;
                        margin: 0;
                    }

                    .container {
                        max-width: 480px;
                        margin: 0 auto;
                    }

                    .header {
                        display: flex;
                        align-items: center;
                        margin-bottom: 16px;
                        padding-bottom: 12px;
                        border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
                    }

                    .header-icon {
                        font-size: 20px;
                        margin-right: 10px;
                        opacity: 0.9;
                    }

                    .header-subtitle {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-block: 1em;
                    }

                    .form-section {
                        margin-bottom: 12px;
                    }

                    .form-row {
                        margin-bottom: 14px;
                    }

                    .form-row:last-child {
                        margin-bottom: 0;
                    }

                    label {
                        display: block;
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.3px;
                        margin-bottom: 4px;
                        color: var(--vscode-settings-headerForeground, var(--vscode-foreground));
                        opacity: 0.9;
                    }

                    .input-container {
                        position: relative;
                    }

                    input[type="text"] {
                        width: 100%;
                        padding: 4px 8px;
                        font-size: 13px;
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-input-foreground);
                        background-color: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border, transparent);
                        outline: none;
                        line-height: 20px;
                    }

                    input[type="text"]:focus {
                        outline: 1px solid var(--vscode-focusBorder);
                        outline-offset: -1px;
                    }

                    input[type="text"].invalid {
                        outline: 1px solid var(--vscode-inputValidation-errorBorder);
                        outline-offset: -1px;
                        background-color: var(--vscode-inputValidation-errorBackground);
                    }

                    input[type="text"]::placeholder {
                        color: var(--vscode-input-placeholderForeground);
                        opacity: 1;
                    }

                    .validation-message {
                        display: flex;
                        align-items: center;
                        font-size: 12px;
                        margin-top: 4px;
                        min-height: 18px;
                        line-height: 18px;
                    }

                    .validation-message.valid {
                        color: var(--vscode-descriptionForeground);
                    }

                    .validation-message.invalid {
                        color: var(--vscode-inputValidation-errorForeground);
                    }

                    .validation-message .codicon {
                        margin-right: 4px;
                        font-size: 14px;
                    }

                    .hint {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 3px;
                        opacity: 0.8;
                    }

                    .actions {
                        display: flex;
                        gap: 8px;
                        margin-top: 20px;
                        padding-top: 16px;
                        border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
                        justify-content: flex-end;
                    }

                    button {
                        padding: 4px 14px;
                        font-size: 13px;
                        font-family: var(--vscode-font-family);
                        line-height: 20px;
                        border: 1px solid transparent;
                        cursor: pointer;
                        outline: none;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        white-space: nowrap;
                    }

                    button:focus {
                        outline: 1px solid var(--vscode-focusBorder);
                        outline-offset: 2px;
                    }

                    button:disabled {
                        opacity: 0.4;
                        cursor: not-allowed;
                    }

                    .btn-primary {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }

                    .btn-primary:hover:not(:disabled) {
                        background-color: var(--vscode-button-hoverBackground);
                    }

                    .btn-primary:active:not(:disabled) {
                        filter: brightness(0.9);
                    }

                    .btn-secondary {
                        background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }

                    .btn-secondary:hover:not(:disabled) {
                        background-color: var(--vscode-button-secondaryHoverBackground);
                    }

                    .btn-secondary:active:not(:disabled) {
                        filter: brightness(0.9);
                    }

                    .kbd {
                        font-size: 10px;
                        margin-left: 4px;
                        padding: 0 4px;
                        background-color: var(--vscode-keybindingLabel-background);
                        color: var(--vscode-keybindingLabel-foreground);
                        border: 1px solid var(--vscode-keybindingLabel-border);
                        border-radius: 3px;
                        box-shadow: inset 0 -1px 0 var(--vscode-keybindingLabel-bottomBorder, var(--vscode-keybindingLabel-border));
                        font-family: var(--vscode-font-family);
                        line-height: 14px;
                    }

                    #devices {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                    }

                    #devices thead {
                        background-color: var(--vscode-editor-background);
                    }

                    #devices th {
                        text-align: left;
                        padding: 6px 8px;
                        font-weight: 600;
                        color: var(--vscode-foreground);
                        border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
                    }

                    #devices td {
                        padding: 6px 8px;
                        border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
                    }

                    #devices tbody tr:last-child td {
                        border-bottom: none;
                    }

                    #devices tbody tr:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }

                    .robot-image-container {
                        margin: 16px 0;
                        text-align: center;
                    }

                    .robot-image {
                        max-width: 100%;
                        height: auto;
                        border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
                        border-radius: 4px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="form-section">
                        <div class="form-row">
                            <label for="devices">Detected Devices</label>

                            <div class="header-subtitle" id="port-title">
                                <div>Autodetect has successfully detected your <b id="hub-type"></b> configuration:</div>
                            </div>

                            <table id="devices">
                                <tbody id="devices-tbody"></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="robot-image-container">
                        <img src="${templateImageUri.toString()}" alt="Robot Sizing Template" class="robot-image" />
                    </div>

                    <div class="form-section">
                        <div class="form-row">
                            <label for="wheel-diameter">Wheel Diameter</label>

                            <div class="header-subtitle" id="port-title">
                                <div>Configure your robot dimensions:</div>
                            </div>

                            <div class="input-container">
                                <input 
                                    type="text" 
                                    id="wheel-diameter" 
                                    placeholder="Enter wheel diameter for your robot"
                                    autocomplete="off"
                                    spellcheck="false"
                                />
                            </div>
                            <div id="wheel-diameter-display" class="validation-message"></div>
                            <div class="hint">Enter size in mm, cm, or studs (e.g., 56, 56mm, 7s)</div>
                        </div>

                        <div class="form-row">
                            <label for="axle-track">Axle Track</label>
                            <div class="input-container">
                                <input 
                                    type="text" 
                                    id="axle-track" 
                                    placeholder="Enter distance between wheel centters of your robot"
                                    autocomplete="off"
                                    spellcheck="false"
                                />
                            </div>
                            <div id="axle-track-display" class="validation-message"></div>
                            <div class="hint">Distance between wheel centers (e.g., 104, 104mm, 13s)</div>
                        </div>
                    </div>

                    <div class="actions">
                        <button type="button" id="cancel-btn" class="btn-secondary">
                            Cancel<span class="kbd">Esc</span>
                        </button>
                        <button type="button" id="submit-btn" class="btn-primary">
                            OK<span class="kbd">Enter</span>
                        </button>
                    </div>
                </div>

                <script src="${scriptUri.toString()}"></script>
            </body>
            </html>
        `;
    }
}
