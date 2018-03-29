import { Md5 } from 'ts-md5/dist/md5';
import * as vscode from 'vscode';

import { Ks } from './ks';

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

export async function getEnvironments(ks: Ks): Promise<Env[]> {
    const shellResult = await ks.invokeAsync("env list -o json");
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

async function getCurrentEnvironment(ks: Ks): Promise<string> {
    const shellResult = await ks.invokeAsync("env current");
    if (shellResult.code !== 0) {
        vscode.window.showErrorMessage(shellResult.stderr)
        return "";
    }

    return shellResult.stdout.trim();
}