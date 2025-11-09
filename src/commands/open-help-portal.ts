import * as vscode from 'vscode';

let pybricksHelpPanel: vscode.WebviewPanel | undefined;

export async function openHelpPortal() {
    try {
        const helpUris = ['https://docs.pybricks.com/en/latest'];
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.languageId !== 'python') return;

        // for now, we just open the main help portal
        const ptype = await getPythonType();
        if (ptype?.module && ptype.ctype) {
            // Example: numpy.ndarray -> https://numpy.org/doc/stable/reference/generated/numpy.ndarray.html
            const module1 = ptype.module.split('.');
            if (module1.length === 2 && module1[0] === 'pybricks') {
                let module = module1[1].toLowerCase();
                const className = ptype.ctype.toLowerCase();
                if (module === '_common') module = 'pupdevices';
                helpUris.unshift(
                    helpUris[0] + `/${module}/${className}.html`,
                    helpUris[0] + `/${className}.html`,
                );
            }
        }

        if (!pybricksHelpPanel) {
            pybricksHelpPanel = vscode.window.createWebviewPanel(
                'pybricksHelpPortal', // Identifies the type of the webview. Used internally
                'Pybricks Help Portal', // Title of the panel displayed to the user
                vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
                {
                    // Enable scripts in the webview
                    enableScripts: true,
                },
            );
            pybricksHelpPanel.onDidDispose(() => {
                pybricksHelpPanel = undefined;
            });
        }

        // check if helpUri is valid URL and can be loaded, if not use base help URL
        let helpUri = helpUris[0];
        for (const helpUriCandidate of helpUris) {
            try {
                const response = await fetch(helpUriCandidate, { method: 'HEAD' });
                if (response.ok) {
                    helpUri = helpUriCandidate;
                    break;
                }
            } catch {
                // Ignore fetch errors and try next candidate
            }
        }

        pybricksHelpPanel.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Pybricks Help Portal</title>
                <style>
                    body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
                    iframe { width: 100%; height: 100%; border: none; }
                </style>
            </head>
            <body>
                <iframe src="${helpUri}"></iframe>
            </body>
            </html>
        `;

        await Promise.resolve(); // Added to satisfy ESLint for async handler
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to open help portal: ${errorMessage}`);
    }
}

async function getPythonType(): Promise<
    { module?: string; ctype: string; funcname?: string } | undefined
> {
    const editor = vscode.window.activeTextEditor;
    const position = editor?.selection.active;
    const document = editor?.document;
    if (document?.languageId !== 'python' || !position) {
        return undefined;
    }

    const wordRange = document.getWordRangeAtPosition(position);
    const selectedWord = wordRange ? document.getText(wordRange) : '';
    if (!wordRange || !selectedWord) {
        return undefined;
    }

    try {
        const typeDefinitions = await vscode.commands.executeCommand<
            vscode.LocationLink[]
        >('vscode.executeTypeDefinitionProvider', document.uri, position);

        if (typeDefinitions && typeDefinitions.length > 0) {
            const typeDef = typeDefinitions[0] as unknown as vscode.Location;
            const typeUri = typeDef.uri;
            const typeRange = typeDef.range;

            if (typeUri && typeRange) {
                const typeDoc = await vscode.workspace.openTextDocument(typeUri);

                // Get the full line or multiple lines around the definition
                const startLine = typeRange.start.line;

                // go backwards to find the class definition
                for (let i = startLine; i > 0; i--) {
                    const line = typeDoc.lineAt(i).text;

                    // Extract class name with full module path if possible
                    // Skip lines that start with '#' (comments) or '"""' (docstrings)
                    if (/^\s*#/.test(line) || /^\s*"""/.test(line)) {
                        continue;
                    }
                    const classMatch = line.match(/class\s+(\w+)/);
                    if (classMatch) {
                        const className = classMatch[1];

                        // Try to get module path from the file
                        const filePath = typeUri.fsPath;

                        // Extract module path from site-packages or src structure
                        // e.g., /site-packages/numpy/ndarray.py -> numpy.ndarray
                        const sitePackagesMatch = filePath.match(
                            /site-packages[\/\\](.+?)\.py/,
                        );
                        if (sitePackagesMatch) {
                            const modulePath = sitePackagesMatch[1].replace(
                                /[\/\\]/g,
                                '.',
                            );

                            return { module: modulePath, ctype: className };
                        }

                        // Try to extract from __init__.py or module structure
                        const moduleMatch = filePath.match(
                            /([^\/\\]+)[\/\\]([^\/\\]+)\.py$/,
                        );
                        if (moduleMatch) {
                            return { module: moduleMatch[1], ctype: className };
                        }

                        return { ctype: className };
                        // break;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error retrieving Python type information:', error);
    }

    return undefined;
}
