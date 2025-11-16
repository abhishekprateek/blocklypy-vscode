import * as vscode from 'vscode';
import { extensionContext } from '../extension';
import { getActivePythonPath } from './python-env';

const GLOBAL_STATE_KEY = 'pybricksInstallPromptShown';

export async function promptInstallPybricks(): Promise<void> {
    const pythonPath = await getActivePythonPath();
    const installed = await isRealImportPossible('pybricks', pythonPath);
    const BTN_INSTALL = 'Install';
    const BTN_UPGRADE = 'Upgrade';
    const msg = installed
        ? 'Pybricks package detected. Upgrade to latest version?'
        : 'Pybricks package not found in the active environment. Install now?';
    const choice = await vscode.window.showInformationMessage(
        msg,
        { modal: true, detail: `Interpreter: ${pythonPath}` },
        installed ? BTN_UPGRADE : BTN_INSTALL,
    );
    if (!choice) return;

    const installCmd = `"${pythonPath}" -m pip install --upgrade pybricks`;
    const result = await executeCommandInTask(installCmd);

    // Mark prompt as shown; ignore errors silently
    if (result) void extensionContext.globalState.update(GLOBAL_STATE_KEY, true);
}

export async function ensurePybricksOnce(): Promise<void> {
    if (!extensionContext) return;
    const alreadyShown = extensionContext.globalState.get<boolean>(
        GLOBAL_STATE_KEY,
        false,
    );
    if (alreadyShown) return;

    const pythonPath = await getActivePythonPath();
    const installed = await isRealImportPossible('pybricks', pythonPath);
    if (installed) {
        // Mark as shown silently (already installed, no need to bother user)
        // Mark as shown silently; ignore errors
        void extensionContext.globalState.update(GLOBAL_STATE_KEY, true);
    } else {
        await promptInstallPybricks();
    }
}

async function isRealImportPossible(pkg: string, pythonPath: string): Promise<boolean> {
    // Use a simple execution via Python extension if available; else spawn via terminal & heuristic.
    try {
        const checkCmd = `"${pythonPath}" -c "import ${pkg}; print('OK')"`;
        const result = await executeCommandInTask(checkCmd);
        return result;
    } catch {
        return false;
    }
}

async function executeCommandInTask(cmd: string): Promise<boolean> {
    try {
        const task = new vscode.Task(
            { type: 'shell' },
            vscode.TaskScope.Workspace,
            'PybricksImportCheck',
            'blocklypy',
            new vscode.ShellExecution(cmd),
        );
        const _execution = await vscode.tasks.executeTask(task);

        // Wait for the task to finish and get the exit code
        const exitCode: number = await new Promise((resolve) => {
            const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
                if (e.execution.task === task) {
                    disposable.dispose();
                    resolve(e.exitCode ?? 1);
                }
            });
        });

        // Close the terminal opened by the PybricksImportCheck task
        for (const terminal of vscode.window.terminals) {
            if (terminal.name.includes('PybricksImportCheck')) {
                terminal.dispose();
            }
        }
        if (exitCode !== 0) throw new Error(`Import failed with exit code ${exitCode}`);

        return true;
    } catch {
        return false;
    }
}
