/**
 * This is the script for the BlocklyPy webview.
 * It is compiled separately from the main extension code.
 */

// import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type * as monacoType from 'monaco-editor';
// import 'monaco-editor/esm/vs/basic-languages/less/less';
// import 'monaco-editor/esm/vs/basic-languages/python/python';
// import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import svgPanZoom from 'svg-pan-zoom';
import { sanitizeHtml } from './webviewUtils';

// const vscode = acquireVsCodeApi();

let monacoInstance: monacoType.editor.IStandaloneCodeEditor | undefined = undefined;

const ViewType = {
    Preview: 'preview',
    Pseudo: 'pseudo',
    Pycode: 'pycode',
    Graph: 'graph',
};

function getVsCodeTheme() {
    return document.body.classList.contains('vscode-dark') ? 'vs-dark' : 'vs-light';
}

function waitForMonaco(callback: () => void) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    if ((window as any).monaco) {
        callback();
    } else {
        setTimeout(() => waitForMonaco(callback), 100);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    waitForMonaco(() => {
        monacoInstance = monaco.editor.create(document.getElementById('editor')!, {
            language: 'python',
            value: '',
            readOnly: true,
            theme: getVsCodeTheme(),
            minimap: { enabled: false },
        });

        resizeHandler();
    });
});

let diagnosticsDecorations: monacoType.editor.IEditorDecorationsCollection | undefined =
    undefined;

type BlocklypyWebviewMessage =
    | { command: 'showView'; view: string; content: string }
    | { command: 'setErrorLine'; line: number; message: string };

window.addEventListener('message', (event) => {
    const data = event.data as BlocklypyWebviewMessage;
    if (data.command === 'showView') {
        const { view, content } = data || {};
        const effectiveView = view;
        showView(effectiveView, content);
    } else if (data.command === 'setErrorLine') {
        const { line, message } = data || {};
        if (monacoInstance && typeof line === 'number' && line >= 0) {
            const line1 = line + 1; // Convert to 0-based
            const lineLen = monacoInstance.getModel()?.getLineMaxColumn(line1) ?? 1;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
            const selection = new (window as any).monaco.Selection(
                line1,
                0,
                line1,
                lineLen,
            );
            monacoInstance.revealLineInCenter(line1); // Monaco is 1-based
            // monacoInstance.setSelection(selection);

            // Create or update diagnostics decorations
            const decorations = [
                {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    range: selection,
                    options: {
                        isWholeLine: true,
                        className: 'errorLineDecoration',
                        inlineClassName: 'errorLineDecorationInline',
                        linesDecorationsClassName: 'errorLineDecorationLine',
                        borderColor: 'red',
                        borderStyle: 'solid',
                        borderWidth: '0 0 2px 0',
                        overviewRuler: {
                            color: 'red',
                            position: monaco.editor.OverviewRulerLane.Full,
                        },
                        hoverMessage: { value: message || 'Error on this line' },
                    },
                },
            ];

            if (diagnosticsDecorations) {
                diagnosticsDecorations.set(decorations);
            } else {
                diagnosticsDecorations =
                    monacoInstance.createDecorationsCollection(decorations);
            }
        }
    }
});

const resizeHandler = () => {
    // Resize Monaco Editor
    monacoInstance?.layout();
    panzoomFitCenter();
};
window.addEventListener('resize', resizeHandler);

// In showView, save the svgPanZoom instance
function showView(view: string, content: string) {
    const refreshVisibility = () => {
        const target_domid =
            view === ViewType.Pycode || view === ViewType.Pseudo ? 'editor' : view;
        ['loading', 'editor', 'preview', 'graph'].forEach((domid) => {
            const el = document.getElementById(domid);
            if (el) {
                el.style.display = domid === target_domid ? 'block' : 'none';
            }
        });
    };

    if (view === ViewType.Pycode || view === ViewType.Pseudo) {
        if (!monacoInstance) return;
        refreshVisibility();
        resizeHandler();

        monacoInstance.setValue(content);
        const model = monacoInstance.getModel();
        if (model) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
                (window as any).monaco.editor.setModelLanguage(
                    model,
                    view === ViewType.Pycode ? 'python' : 'less',
                );
            } catch {
                // less will fail many times, this is expected
                // NOOP
            }
        }
    } else if (view === ViewType.Preview || view === ViewType.Graph) {
        const element = document.getElementById(view);
        if (element) {
            // if content is svg do this, if it is base64 image do that
            // Detect if content is SVG or base64 image
            if (
                typeof content === 'string' &&
                (content.trim().startsWith('<svg') ||
                    content.trim().startsWith('<?xml'))
            ) {
                // no sanitization here, as it will break the svg
                element.innerHTML = content ?? '';
                requestAnimationFrame(() => {
                    getPanZoom(false, element); // clear cache and re-init
                    panzoomFitCenter();
                });
            } else if (
                typeof content === 'string' &&
                content.trim().startsWith('data:image')
            ) {
                // no sanitization here, as it will break the svg
                element.innerHTML = `<img src="${content}" style="max-width:100%;max-height:100%;" />`;
            } else {
                element.innerHTML = sanitizeHtml(content ?? '');
            }
        }
    } else if (view === 'loading') {
        // Do nothing, just show the loading image
    }
    refreshVisibility();
    resizeHandler();
}

// Monaco Editor Web Worker fix for VS Code webview (local/offline)
self.MonacoEnvironment = {
    getWorkerUrl: function (_moduleId, label) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        const workerUrls = (window as any).workerUrls;

        // The worker files are output to dist/ by MonacoWebpackPlugin
        // Use the VS Code webview API to get the correct URI
        // You must pass the worker URL from your extension to the webview via postMessage or as a global variable
        // Example assumes you have a global variable set by your extension:

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return workerUrls[label] || workerUrls['default'];
    },
};

let _panzoomInstance: ReturnType<typeof svgPanZoom> | undefined = undefined;
function getPanZoom(allowcached = true, rootelem: HTMLElement | null = null) {
    if (rootelem === null) {
        const previewEl = document.getElementById('preview');
        const graphEl = document.getElementById('graph');

        if (previewEl?.style.display === 'block') {
            rootelem = previewEl;
        }
        if (graphEl?.style.display === 'block') {
            rootelem = graphEl;
        }
    }
    const svg = rootelem?.querySelector('svg');

    if (svg && (!_panzoomInstance || !allowcached)) {
        // requestAnimationFrame(() => {
        _panzoomInstance = svgPanZoom(svg, {
            panEnabled: true,
            zoomEnabled: true,
            controlIconsEnabled: true,
            fit: true,
            center: true,
            zoomScaleSensitivity: 0.4, // Lower = slower zoom, higher = faster (default is 0.2)
        });
    }
    return _panzoomInstance;
}

function panzoomFitCenter() {
    const instance = getPanZoom();
    if (instance) {
        try {
            instance.resize();
            instance.fit();
            instance.center();
        } catch {
            // NOOP
        }
    }
}
