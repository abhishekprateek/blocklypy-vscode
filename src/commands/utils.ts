import * as vscode from 'vscode';
import { BLOCKLYPY_COMMANDS_VIEW_ID } from '../const';
import { HUBOS_SPIKE_SLOTS } from '../spike';

/**
 * Show progress in the commands view, falling back to a notification
 * when the view isn't available (e.g. in web/Codespaces environments).
 */
export async function withViewProgress<T>(
    options: Omit<vscode.ProgressOptions, 'location'>,
    task: (
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        token: vscode.CancellationToken,
    ) => Thenable<T>,
): Promise<T> {
    try {
        return await vscode.window.withProgress(
            { ...options, location: { viewId: BLOCKLYPY_COMMANDS_VIEW_ID } },
            task,
        );
    } catch {
        return await vscode.window.withProgress(
            { ...options, location: vscode.ProgressLocation.Notification },
            task,
        );
    }
}

export async function pickSlot(message: string) {
    const picked = await vscode.window.showQuickPick(
        Array(HUBOS_SPIKE_SLOTS)
            .fill(0)
            .map((_, i) => i.toString()),
        {
            placeHolder: `${message} (0-${HUBOS_SPIKE_SLOTS - 1})`,
        },
    );
    const retval = parseInt(picked || '');
    if (Number.isNaN(retval)) return undefined;
    return retval;
}
