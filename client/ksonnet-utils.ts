import * as fs from 'fs';
import * as path from 'path';
import { Md5 } from 'ts-md5/dist/md5';
import * as vscode from 'vscode';

import { Ks } from './ks';
import { ShellResult } from './shell';

export interface Env {
    readonly name: string;
    readonly hash: string;
    readonly kubernetesVersion: string;
    readonly path: string;
    readonly server: string;
    readonly namespace: string;

    // active is true is this Env is active.
    readonly active: boolean;
}

function locateCwd(): string | undefined {
    const editor = vscode.window.activeTextEditor;

    if (editor) {
        const resource = editor.document.uri;
        if (resource.scheme == 'file') {
            const folder = vscode.workspace.getWorkspaceFolder(resource);
            if (folder) {
                return folder.uri.path;
            }
        }
    }

    return undefined;
}

export async function setCurrentEnvironment(ks: Ks, name: string): Promise<boolean>  {
    const appRoot = findRootPath(locateCwd())

    if (appRoot) {
        const shellResult = await ks.invokeAsync(`env current --set ${name}`, appRoot);
        if (shellResult.code === 0) {
            return true
        }

        vscode.window.showErrorMessage(`Failed to set ${name}' as current environment: ${shellResult.stderr}`);
        return false;
    }

    return false;
}


export async function getEnvironments(ks: Ks): Promise<Env[]> {
    const wd = locateCwd()
    const appRoot = findRootPath(wd)

    if (appRoot) {
        const shellResult = await ks.invokeAsync("env list -o json", appRoot);
        if (shellResult.code !== 0) {
            vscode.window.showErrorMessage(shellResult.stderr)
            return [];
        }

        const current = await getCurrentEnvironment(ks)

        const ksEnvironments = JSON.parse(shellResult.stdout);
        var environments: Env[] = [];


        Object.keys(ksEnvironments).forEach(key => {
            let value = ksEnvironments[key];
            const hash = Md5.hashStr(key).toString();

            environments.push({
                name: key,
                hash: hash,
                kubernetesVersion: value.k8sVersion,
                path: value.path,
                server: value.destination.server,
                namespace: value.destination.namespace,
                active: current === key,
            });
        });

        return environments;
    }

    return [];
}

async function getCurrentEnvironment(ks: Ks): Promise<string> {
    const appRoot = findRootPath(locateCwd())

    if (appRoot) {
        const shellResult = await ks.invokeAsync("env current", appRoot);
        if (shellResult.code !== 0) {
            vscode.window.showErrorMessage(shellResult.stderr)
            return "";
        }

        return shellResult.stdout.trim();
    }
    return "";
}

/**
 * Return the root path of the ksonnet app.
 *
 * @param filePath
 * @param fsRoot
 */
export function rootPath(filePath?: string, fsRoot = '/'): string | undefined {
    if (!filePath) {
        return undefined
    }

    const currentPath = path.join(fsRoot, filePath)
    return findRootPath(currentPath);
}

function findRootPath(dirPath?: string): string | undefined {
    if (!dirPath) {
        return undefined
    }

    if (dirPath === "/") {
        return;
    }

    const ksConfig = path.join(dirPath, "app.yaml")

    try {
        const stats = fs.statSync(ksConfig)
        return dirPath;
    }
    catch (err) {
        const dir = path.dirname(dirPath);
        return findRootPath(dir);
    }
}