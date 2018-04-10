import { Host } from './host';
import { FS } from './fs';
import { Shell, ShellHandler, ShellResult } from './shell';
import * as binutil from './binutil';
import * as vscode from 'vscode';
import { pathMatch } from 'tough-cookie';

export interface Context {
    readonly host: Host;
    readonly fs: FS;
    readonly shell: Shell;
    binFound: boolean;
    binPath: string;
}



export interface Cmd {
    checkPresent(errorMessageMode: CheckPresentMessageMode): Promise<boolean>
    invoke(command: string, handler?: ShellHandler): Promise<void>;
    invokeWithProgress(command: string, progressMessage: string, handler?: ShellHandler): Promise<void>;
    invokeAsync(command: string, cwd: string): Promise<ShellResult>;
    invokeAsyncWithProgress(command: string, progressMessage: string): Promise<ShellResult>;

    invokeInTerminal(command: string, terminalName?: string): void;
    asLines(command: string): Promise<string[] | ShellResult | undefined>;
    path();
}

export abstract class BaseCmd {
    constructor(host: Host, fs: FS, shell: Shell, binName: string, binPath: string, binFound: boolean) {
        this.context = { host: host, fs: fs, shell: shell, binFound: binFound, binPath: binPath };
        this.binName = binName;
        this.binPath = binPath;
    }

    protected readonly binPath: string;
    protected readonly binName: string;
    protected readonly context: Context;
    private sharedTerminal: vscode.Terminal | null;

    checkPresent(errorMessageMode: CheckPresentMessageMode): Promise<boolean> {
        return checkPresent(this.context, this.binPath, this.binName, errorMessageMode);
    }
    invoke(command: string, handler?: ShellHandler): Promise<void> {
        return internal(this.context, this.binPath, command, handler || cmdDone(this.context));
    }
    invokeWithProgress(command: string, progressMessage: string, handler?: ShellHandler): Promise<void> {
        return invokeWithProgress(this.context, this.binPath, command, progressMessage, handler);
    }
    invokeAsync(command: string): Promise<ShellResult> {
        return invokeAsync(this.context, this.binPath, command);
    }
    invokeAsyncWithProgress(command: string, progressMessage: string): Promise<ShellResult> {
        return invokeAsyncWithProgress(this.context, this.binPath, command, progressMessage);
    }
    invokeInTerminal(command: string, terminalName?: string): void {
        const terminal = terminalName ? this.context.host.createTerminal(terminalName) : this.getSharedTerminal();
        return invokeInTerminal(this.context, this.binPath, command, terminal);
    }
    asLines(command: string): Promise<string[] | ShellResult | undefined> {
        return asLines(this.context, this.binPath, command);
    }
    path(): string {
        return path(this.context, this.binPath);
    }
    private getSharedTerminal(): vscode.Terminal {
        if (!this.sharedTerminal) {
            this.sharedTerminal = this.context.host.createTerminal(this.binName);
            const disposable = this.context.host.onDidCloseTerminal((terminal) => {
                if (terminal === this.sharedTerminal) {
                    this.sharedTerminal = null;
                    disposable.dispose();
                }
            });
        }
        return this.sharedTerminal;
    }

}



export async function invoke(context: Context, bin: string, command: string, handler?: ShellHandler): Promise<void> {
    await internal(context, bin, command, handler || cmdDone(context));
}

export async function invokeWithProgress(context: Context, bin: string, command: string, progressMessage: string, handler?: ShellHandler): Promise<void> {
    return context.host.withProgress((p) => {
        return new Promise<void>((resolve, reject) => {
            p.report({ message: progressMessage });
            internal(context, bin, command, (code, stdout, stderr) => {
                resolve();
                (handler || cmdDone(context))(code, stdout, stderr);
            });
        });
    });
}

export async function invokeAsync(context: Context, bin: string, command: string): Promise<ShellResult> {
    let cmd = bin + ' ' + command;
    return await context.shell.exec(cmd, locateCwd());
}

export async function invokeAsyncWithProgress(context: Context, bin: string, command: string, progressMessage: string): Promise<ShellResult> {
    return context.host.withProgress(async (p) => {
        p.report({ message: progressMessage });
        return await invokeAsync(context, bin, command);
    });
}

export function invokeInTerminal(context: Context, bin: string, command: string, terminal: vscode.Terminal): void {
    if (bin.indexOf(" ") > -1 && !/^['"]/.test(bin)) {
        bin = `"${bin}"`;
    }
    terminal.sendText(`${bin} ${command}`);
    terminal.show();
}

export async function asLines(context: Context, bin: string, command: string): Promise<string[] | ShellResult | undefined> {
    const shellResult = await invokeAsync(context, bin, command);
    if (shellResult && shellResult.code === 0) {
        let lines = shellResult.stdout.split('\n');
        lines.shift();
        lines = lines.filter((l) => l.length > 0);
        return lines;

    }
    return shellResult;
}

async function internal(context: Context, bin: string, command: string, handler: ShellHandler): Promise<void> {
    if (await checkPresent(context, bin, '',  'command')) {
        let cmd = bin + ' ' + command;
        context.shell.exec(cmd, locateCwd()).then(({ code, stdout, stderr }) => handler(code, stdout, stderr)).catch()
    }
}

export function basePath(propertyName: string, context: Context): any {
    return context.host.getConfiguration(propertyName)
}

function cmdDone(context: Context): ShellHandler {
    return (result: number, stdout: string, stderr: string) => {
        if (result !== 0) {
            context.host.showErrorMessage('command failed: ' + stderr);
            console.log(stderr);
            return;
        }

        context.host.showInformationMessage(stdout);
    };
}

type CheckPresentMessageMode = 'command' | 'activation';

async function checkPresent(context: Context, bin: string, binName: string, errorMessageMode: CheckPresentMessageMode): Promise<boolean> {
    if (context.binFound) {
        return true;
    }

    return await checkForInternal(context, bin, binName, errorMessageMode);
}

async function checkForInternal(context: Context, bin: string, binName: string, errorMessageMode: CheckPresentMessageMode): Promise<boolean> {
    const contextMessage = getCheckContextMessage(errorMessageMode);
    const inferFailedMessage = `Could not find "${binName}" binary.` + contextMessage;
    const configuredFileMissingMessage = bin + ' does not exist!' + contextMessage;

    return await binutil.checkForBinary(context, bin, binName, inferFailedMessage, configuredFileMissingMessage);
}

function getCheckContextMessage(errorMessageMode: CheckPresentMessageMode): string {
    if (errorMessageMode === 'activation') {
        return ' Kubernetes commands other than configuration will not function correctly.';
    } else if (errorMessageMode === 'command') {
        return ' Cannot execute command.';
    }
    return '';
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

function path(context: Context, bin: string): string {
    return binutil.execPath(context.shell, bin);
}