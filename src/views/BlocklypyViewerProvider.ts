import path from 'path';
import * as vscode from 'vscode';
import { convertFileToPython } from '../blocklypy/blpy-convert';
import { EXTENSION_KEY } from '../const';
import {
    setContextContentAvailability,
    setContextCustomViewType,
} from '../extension/context-utils';
import {
    CustomEditorProviderBase,
    DocumentState,
} from './helpers/CustomEditorProviderBase';
import { getNonce, getScriptUri } from './utils';

const BLOCKLYPYVIEW_VIEW_ID = EXTENSION_KEY + '-blocklypyViewer';
const BLOCKLYPY_WEBVIEW_NAME = 'BlocklypyWebview';

interface BlocklypyViewerContent {
    filename?: string;
    pycode?: string;
    pseudo?: string;
    preview?: string;
    graph?: string;
    // result
}
export type BlocklypyViewerContentAvailabilityMap = Record<
    Exclude<keyof BlocklypyViewerContent, 'filename' | 'result'>,
    boolean
>;

export enum ViewType {
    Preview = 'preview',
    Pseudo = 'pseudo',
    Pycode = 'pycode',
    Graph = 'graph',
    Loading = 'loading',
}

export class BlocklypyViewerState implements DocumentState<BlocklypyViewerContent> {
    public webviewReady?: Promise<void>;
    public webviewReadyResolver?: (() => void) | undefined;
    public refreshing: boolean = false;
    public viewtype: ViewType = ViewType.Loading;
    public content: BlocklypyViewerContent | undefined;
    public contentAvailability: BlocklypyViewerContentAvailabilityMap | undefined;
    public dirty: boolean = false;
    public uriLastModified: number = 0;
    public panel: vscode.WebviewPanel | undefined;
    constructor(
        public document: vscode.CustomDocument,
        public provider: BlocklypyViewerProvider,
    ) {}
    public async setErrorLineAsync(line: number, message: string) {
        if (this.viewtype !== ViewType.Pycode) {
            await this.provider.showViewAsync(ViewType.Pycode);
        }

        await this.panel?.webview.postMessage({
            command: 'setErrorLine',
            line,
            message,
        });
    }
    public get uri() {
        return this.document.uri;
    }
    public get filename() {
        return path.basename(this.document.uri.fsPath);
    }
}

export class BlocklypyViewerProvider
    extends CustomEditorProviderBase<BlocklypyViewerState>
    implements vscode.CustomReadonlyEditorProvider
{
    public static get Get(): BlocklypyViewerProvider | undefined {
        const provider = BlocklypyViewerProvider.getProviderByType(
            BlocklypyViewerProvider.prototype.constructor,
        );
        return provider as BlocklypyViewerProvider | undefined;
    }

    public static get TypeKey() {
        return BLOCKLYPYVIEW_VIEW_ID;
    }

    public static get activeBlocklypyViewer(): BlocklypyViewerState | undefined {
        const provider = BlocklypyViewerProvider.Get;
        return provider?.documents.get(provider.activeUri);
    }

    constructor(context: vscode.ExtensionContext) {
        super(context);
        const diagDisposable = vscode.languages.onDidChangeDiagnostics(() =>
            this.handleDiagnosticsChangeAsync().catch(console.error),
        );
        this.context.subscriptions.push(diagDisposable);
    }

    protected createDocumentState(
        document: vscode.CustomDocument,
    ): BlocklypyViewerState {
        return new BlocklypyViewerState(document, this);
    }

    override async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token?: vscode.CancellationToken,
    ): Promise<void> {
        await super.resolveCustomEditor(document, webviewPanel, _token);

        const handleDelayedOpen = async () => {
            // refresh of data is done in refreshWebview super.resolveCustomEditor
            // but it is not awaited
            const state = this.documents.get(document.uri);

            await state?.webviewReady;
            await this.showViewAsync(state?.viewtype);

            if (!state?.content) {
                console.warn(`No content available for ${document.uri.toString()}`);
            } else {
                console.warn(`Content available for ${document.uri.toString()}`);
            }

            // Set up file change monitoring
            await this.monitorFileChanges(
                document,
                webviewPanel,
                () =>
                    this.refreshWebviewAsync(document, webviewPanel).catch(
                        console.error,
                    ),
                undefined, // or pass a Set<string> of watched URIs if needed
            );
        };

        // Delay the open handling to ensure the webview is fully ready
        setTimeout(() => {
            handleDelayedOpen().catch(console.error);
        }, 100);
    }

    protected async refreshWebviewAsync(
        document: vscode.CustomDocument,
        _webviewPanel: vscode.WebviewPanel,
        forced = false,
    ) {
        try {
            const state = this.documents.get(document.uri);
            if (!state) return;

            if (this.activeUri === document.uri || forced) {
                state.uriLastModified = (
                    await vscode.workspace.fs.stat(document.uri)
                ).mtime;

                state.content = await convertFileToPython(document.uri);
                state.contentAvailability = {
                    preview: !!state.content.preview,
                    pseudo: !!state.content.pseudo,
                    pycode: !!state.content.pycode,
                    graph: !!state.content.graph,
                } satisfies BlocklypyViewerContentAvailabilityMap;
                await setContextContentAvailability(state.contentAvailability);

                await this.showViewAsync(this.guardViewType(state, ViewType.Preview));
                state.dirty = false;
            } else {
                state.dirty = true; // Mark as dirty, don't refresh yet
            }
        } catch (error) {
            console.error('Error in refreshWebview:', error);
        }
    }

    protected async activateWithoutRefresh(
        _document: vscode.CustomDocument,
        _webviewPanel: vscode.WebviewPanel,
    ): Promise<void> {
        const state = this.documents.get(this.activeUri);
        if (!state) return Promise.resolve();

        await setContextContentAvailability(state.contentAvailability);
        return Promise.resolve();
    }

    public async rotateViewsAsync(forward: boolean) {
        const state = this.documents.get(this.activeUri);

        const view = this.guardViewType(
            state,
            this.nextView(state?.viewtype, forward ? +1 : -1),
        );
        await this.showViewAsync(view);
    }

    private contentForView(
        state: BlocklypyViewerState | undefined,
        view: ViewType | undefined,
    ) {
        if (view === ViewType.Pycode && state?.content?.pycode) {
            return state.content.pycode;
        } else if (view === ViewType.Pseudo && state?.content?.pseudo) {
            return state.content.pseudo;
        } else if (view === ViewType.Preview && state?.content?.preview) {
            return state.content.preview;
        } else if (view === ViewType.Graph && state?.content?.graph) {
            return state.content.graph;
        } else {
            return undefined;
        }
    }

    private guardViewType(
        state: BlocklypyViewerState | undefined,
        current: ViewType | undefined,
    ): ViewType {
        let effectiveView = current;
        let content: string | undefined;
        const triedViews = new Set<ViewType>();
        do {
            if (triedViews.has(effectiveView!)) break; // prevent infinite loop

            content = this.contentForView(state, effectiveView);
            if (!content) {
                effectiveView = this.nextView(effectiveView);
                triedViews.add(effectiveView);
            }
        } while (!content && effectiveView !== current);

        return effectiveView ?? ViewType.Preview;
    }

    private nextView(view: ViewType | undefined, step: number = +1): ViewType {
        const Views = [
            ViewType.Preview,
            ViewType.Pseudo,
            ViewType.Pycode,
            ViewType.Graph,
        ];
        const currentIndex = view ? Views.indexOf(view) : -1;
        const nextIndex = (currentIndex + step + Views.length) % Views.length;
        return Views[nextIndex];
    }

    public async showViewAsync(view: ViewType | undefined) {
        const state = this.documents.get(this.activeUri);
        if (!state) throw new Error('No active document state');

        const content = view ? this.contentForView(state, view) : undefined;
        state.viewtype = view ?? ViewType.Loading;
        await setContextCustomViewType(view);

        // wait for webview to be ready to ensure it can receive messages
        if (await this.waitForWebviewReady(state, 0)) {
            await state.panel?.webview.postMessage({
                command: 'showView',
                view: state.viewtype,
                content,
            });
        }
    }

    private async handleDiagnosticsChangeAsync() {
        const state = this.documents.get(this.activeUri);
        // NOTE: We might get a URI that does not match the current activeUri
        // in case of multiple open editors with different files.
        // We would need to find the correct state for that URI and activate it.
        // However, as LEGO files do not reference external ones (everything is __main__.py),
        // this is not needed.
        if (!state || !state.panel) return;

        const diagnostics = vscode.languages.getDiagnostics(state.document.uri);
        if (diagnostics.length > 0) {
            const firstError = diagnostics.find(
                (d) => d.severity === vscode.DiagnosticSeverity.Error,
            );
            if (firstError) {
                await state.setErrorLineAsync(
                    firstError.range.start.line,
                    firstError.message,
                );
            }
        }
    }

    public async openAndShowLine(
        uri: vscode.Uri,
        line: number,
        message: string,
    ): Promise<void> {
        const state = this.getDocumentByUri(uri);
        if (!state || !state.document || !state.panel) return;
        // const viewer = await this.resolveCustomEditor(
        //     state.document,
        //     state.panel,
        //     undefined,
        // );

        // // Focus the viewer
        // await vscode.commands.executeCommand(
        //     'vscode.openWith',
        //     uri,
        //     BlocklypyViewerProvider.TypeKey,
        // );

        // Set the error line in the viewer
        await state.setErrorLineAsync(line, message);
    }

    protected getHtmlForWebview(webviewPanel: vscode.WebviewPanel): string {
        const state = this.documents.get(this.activeUri);
        if (!state) throw new Error('No active document state');

        const nonce = getNonce();

        const scriptUri = getScriptUri(
            this.context,
            webviewPanel,
            BLOCKLYPY_WEBVIEW_NAME,
        );
        const imageUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'asset',
                'icons',
                'logo-small-spin.svg',
            ),
        );
        const editorWorkerUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'editor.worker.js'),
        );
        const monacoVendorWorkerUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'monaco.worker.js'),
        ); // const languageWorkerUris = ['python', 'less'].map((lang) => [
        const monacoVendorUri = webviewPanel.webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'dist',
                'webview',
                'monaco-vendor.js',
            ),
        ); //     lang,
        //     this.currentPanel?.webview.asWebviewUri(
        //         vscode.Uri.joinPath(
        //             this.context.extensionUri,
        //             'dist',
        //             `${lang}.worker.js`,
        //         ),
        //     ),
        // ]);
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${
                webviewPanel.webview.cspSource
            } blob: data:; script-src 'nonce-${nonce}'; style-src ${
            webviewPanel.webview.cspSource
        } 'unsafe-inline';">
            <link rel="preload" href="${String(imageUri)}" as="image">
            <style>
            html, body, #container, #editor {
                height: 100%;
                width: 100%;
                margin: 0;
                padding: 0;
                overflow: hidden;
            }
            #container {
                display: flex;
                height: 100vh;
                width: 100vw;
                justify-content: center;
                align-items: center;
            }
            #pycode, #pseudo, #preview, #graph {
                flex: 1 1 auto;
                height: 100%;
                width: 100%;
                display: none;
                overflow: auto;
            }
            #preview, #graph {
                padding: 20px;
            }
            #preview svg, #preview img, #graph svg {
                width: 100%;
                height: 100%;
                display: block;
            }
            #preview img {
                object-fit: contain;
            }
            #loading {
                height: 50%;
                width: 50%;
            }
            .errorLineDecoration {
                background-color: rgba(255, 0, 0, 0.1);
            }
            .errorLineDecorationInline {
                color: red;    
                border-bottom: 2px solid red;
            }
            .errorLineDecorationLine {
                border-left: 4px solid red;
            }
            </style>
            </head>
            <body>
            <div id="container">
                <img id="loading" src="${String(imageUri)}"/>
                <div id="editor" style="display:none"></div>
                <div id="preview" style="display:none"></div>
                <div id="graph" style="display:none"></div>
            </div>

            <script nonce="${nonce}">
            (function(){
                const vscode = acquireVsCodeApi();
                vscode.postMessage({ command: 'webviewReady' });
            })();
            window.workerUrls = {
                'editorWorkerService': '${String(editorWorkerUri)}',
                'default': '${String(monacoVendorWorkerUri)}'
            };
            </script>

            <!-- Add monaco-vendor.js script BEFORE your main webview script -->
            <script nonce="${nonce}" src="${String(monacoVendorUri)}"></script>

            <!-- Your main webview script that uses the global monaco -->
            <script nonce="${nonce}" defer src="${String(scriptUri)}"></script>

            </body>
            </html>
        `;
    }

    get pycode(): string | undefined {
        const state = this.documents.get(this.activeUri);
        return state?.content?.pycode;
    }

    get filename(): string | undefined {
        const state = this.documents.get(this.activeUri);
        return state?.content?.filename;
    }
}

// export function registerBlocklypyViewerDiagnosticsProvider(
//     context: vscode.ExtensionContext,
// ) {
//     vscode.window.registerUriHandler({
//         handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
//             // Parse URI components
//             // Example URI: blocklypy://open?file=/path/to/file&line=10
//             if (uri.path === '/open') {
//                 const query = new URLSearchParams(uri.query);
//                 const filePath = query.get('file');
//                 const line = parseInt(query.get('line') || '0', 10);
//                 const message = query.get('message') || 'Error';

//                 if (filePath) {
//                     const fileUri = vscode.Uri.file(filePath);
//                     // Open in BlocklyPy viewer
//                     return BlocklypyViewerProvider.Get?.openAndShowLine(
//                         fileUri,
//                         line,
//                         message,
//                     );
//                 }
//             }
//             return undefined;
//         },
//     });
// }
