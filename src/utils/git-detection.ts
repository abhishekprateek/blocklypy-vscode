import * as vscode from 'vscode';

import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
let cachedAuthor: { name?: string; email?: string } | undefined;

// async function getGitConfigViaGitExtension(
//     workspaceUri?: vscode.Uri,
// ): Promise<{ name?: string; email?: string }> {
//     try {
//         const gitExt = vscode.extensions.getExtension('vscode.git')?.exports;
//         const api = gitExt?.getAPI?.(1);
//         const repo = api?.repositories?.find((r: any) =>
//             workspaceUri ? r.rootUri.fsPath === workspaceUri.fsPath : true,
//         );
//         if (!repo) return {};
//         const name = await repo.getConfig('user.name');
//         const email = await repo.getConfig('user.email');
//         return { name: name || undefined, email: email || undefined };
//     } catch {
//         return {};
//     }
// }

async function getGitConfigViaCli(
    cwd?: string,
): Promise<{ name?: string; email?: string }> {
    const run = async (args: string[]) => {
        try {
            const { stdout } = await execFileAsync('git', args, { cwd });
            const out = stdout.trim();
            return out ? out : undefined;
        } catch {
            return undefined;
        }
    };
    const nameLocal = await run(['config', '--get', 'user.name']);
    const emailLocal = await run(['config', '--get', 'user.email']);
    if (nameLocal || emailLocal) return { name: nameLocal, email: emailLocal };
    const nameGlobal = await run(['config', '--global', '--get', 'user.name']);
    const emailGlobal = await run(['config', '--global', '--get', 'user.email']);
    return { name: nameGlobal, email: emailGlobal };
}

export async function resolveGitAuthor(): Promise<{ name?: string; email?: string }> {
    if (cachedAuthor) return cachedAuthor;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceUri = workspaceFolder?.uri;
    let name: string | undefined;
    let email: string | undefined;
    // let { name, email } = await getGitConfigViaGitExtension(workspaceUri);
    if (!name && !email) {
        const viaCli = await getGitConfigViaCli(workspaceUri?.fsPath);
        name = viaCli.name ?? name;
        email = viaCli.email ?? email;
    }
    if (!name) {
        const user = os.userInfo().username || process.env.USER || process.env.USERNAME;
        name = user || undefined;
    }
    cachedAuthor = { name, email };
    return cachedAuthor;
}
