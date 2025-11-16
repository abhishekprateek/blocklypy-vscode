import * as vscode from 'vscode';

import path from 'path';
import { showError } from '../extension/diagnostics';
import { ensurePybricksOnce } from '../extension/pip-check';
import { selectHubTemplate } from '../pybricks/autodetect/template-creation';

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

    // Track the last inserted template for updates
    let lastInsertedRange: { document: vscode.Uri; range: vscode.Range } | undefined;
    const onTemplateUpdated = async (code: string) => {
        // Use the currently active editor (the previous one may have been replaced by a non-preview editor)
        if (!editor) return;

        // Check if we have a previously inserted range to update
        const shouldUpdate =
            lastInsertedRange &&
            lastInsertedRange.document.toString() === editor.document.uri.toString();

        // Capture the start position before editing
        const startPosition =
            shouldUpdate && lastInsertedRange
                ? lastInsertedRange.range.start
                : editor.selection.active;

        await editor.edit((editorBuilder) => {
            if (shouldUpdate && lastInsertedRange) {
                // Update the previously inserted code
                editorBuilder.replace(lastInsertedRange.range, code);
            } else {
                // Insert new code at current position
                editorBuilder.insert(startPosition, code);
            }
        });

        // Calculate the new range for the inserted code
        const lines = code.split('\n');
        const endLine = startPosition.line + lines.length - 1;
        const endCharacter =
            lines.length === 1
                ? startPosition.character + code.length
                : lines[lines.length - 1].length;
        const endPosition = new vscode.Position(endLine, endCharacter);

        // Store the range for future updates
        lastInsertedRange = {
            document: editor.document.uri,
            range: new vscode.Range(startPosition, endPosition),
        };

        // Move cursor to the end of the inserted template
        editor.selection = new vscode.Selection(endPosition, endPosition);
    };

    const template = await selectHubTemplate(
        path.basename(editor.document.uri.fsPath),
        onTemplateUpdated,
    );
    if (!template) {
        return; // User cancelled
    }

    // re-focus editor
    await vscode.window.showTextDocument(editor.document, {
        viewColumn: editor.viewColumn,
        preserveFocus: false,
        preview: false,
    });

    // Insert or update the template
    await onTemplateUpdated(template);
}

/**
 * Create a new Python file with a Pybricks template
 */
export async function createPybricksFile(): Promise<void> {
    // create a new file
    const newFile = await vscode.workspace.openTextDocument({
        language: 'python',
        content: '',
    });

    // show the new file
    await vscode.window.showTextDocument(newFile);

    await insertPybricksTemplate();

    // trigger one-time pybricks install prompt
    await ensurePybricksOnce();
}
