import * as vscode from 'vscode';

type PythonApi = {
    settings?: {
        getExecutionDetails?: (resource?: vscode.Uri) => { execCommand: string[] };
    };
    environment?: {
        getExecutionDetails?: (resource?: vscode.Uri) => { execCommand: string[] };
    };
};

/**
 * Attempts to get the active Python interpreter path using the Python extension.
 * Falls back to 'python' if not available.
 */
export async function getActivePythonPath(resource?: vscode.Uri): Promise<string> {
    try {
        const pyExt = vscode.extensions.getExtension('ms-python.python');
        if (!pyExt) return getFallbackPython();
        const api = (
            pyExt.isActive ? pyExt.exports : await pyExt.activate()
        ) as PythonApi;
        // Common API shape: settings.getExecutionDetails(resource).execCommand: string[]
        const execDetails =
            api?.settings?.getExecutionDetails?.(resource) ??
            api?.environment?.getExecutionDetails?.(resource);

        const cmd: string[] | undefined = execDetails?.execCommand;
        if (cmd && cmd.length > 0) {
            // First item should be the interpreter path
            return cmd[0];
        }
    } catch {
        // ignore and fallback
    }
    return getFallbackPython();
}

function getFallbackPython(): string {
    return (
        process.env.PYBRICKS_PYTHON_PATH ||
        process.env.PYTHON ||
        process.env.PYTHONPATH ||
        'python'
    );
}
