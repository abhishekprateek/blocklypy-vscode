import * as vscode from 'vscode';

export function getScriptUri(
    context: vscode.ExtensionContext,
    webviewContainer: vscode.WebviewPanel | vscode.WebviewView,
    basename: string,
): vscode.Uri {
    return webviewContainer.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'dist/webview', basename + '.js'),
    );
}

/**
 * Generate a cryptographically secure nonce for CSP script-src and style-src directives
 */
export function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
