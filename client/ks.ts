import * as binutil from './binutil';
import { FS } from './fs';
import { Host } from './host';
import { Shell, ShellHandler, ShellResult } from './shell';
import { Terminal } from 'vscode';

export interface Ks {
    checkPresent(errorMessageMode: CheckPresentMessageMode): Promise<boolean>
    invoke(command: string, handler?: ShellHandler): Promise<void>;
    invokeWithProgress(command: string, progressMessage: string, handler?: ShellHandler): Promise<void>;
    invokeAsync(command: string): Promise<ShellResult>;
    invokeAsyncWithProgress(command: string, progressMessage: string): Promise<ShellResult>;

    invokeInTerminal(command: string, terminalName?: string): void;
    asLines(command: string): Promise<string[] | ShellResult | undefined>;
    path();
}

interface Context {
    readonly host : Host;
    readonly fs : FS;
    readonly shell : Shell;
    binFound : boolean;
    binPath : string;
}


class KsImpl implements Ks {
    constructor(host : Host, fs : FS, shell : Shell, ksFound : boolean) {
        this.context = { host : host, fs : fs, shell : shell, binFound : ksFound, binPath : 'ks' };
    }

    private readonly context : Context;
    private sharedTerminal : Terminal | null;

    checkPresent(errorMessageMode : CheckPresentMessageMode) : Promise<boolean> {
        return checkPresent(this.context, errorMessageMode);
    }
    invoke(command : string, handler? : ShellHandler) : Promise<void> {
        return invoke(this.context, command, handler);
    }
    invokeWithProgress(command : string, progressMessage : string, handler? : ShellHandler) : Promise<void> {
        return invokeWithProgress(this.context, command, progressMessage, handler);
    }
    invokeAsync(command : string) : Promise<ShellResult> {
        return invokeAsync(this.context, command);
    }
    invokeAsyncWithProgress(command : string, progressMessage : string) : Promise<ShellResult> {
        return invokeAsyncWithProgress(this.context, command, progressMessage);
    }
    invokeInTerminal(command : string, terminalName? : string) : void {
        const terminal = terminalName ? this.context.host.createTerminal(terminalName) : this.getSharedTerminal();
        return invokeInTerminal(this.context, command, terminal);
    }
    asLines(command : string) : Promise<string[] | ShellResult | undefined> {
        return asLines(this.context, command);
    }
    path() : string {
        return path(this.context);
    }
    private getSharedTerminal() : Terminal {
        if (!this.sharedTerminal) {
            this.sharedTerminal = this.context.host.createTerminal('ks');
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

export function create(host : Host, fs : FS, shell : Shell) : Ks {
    return new KsImpl(host, fs, shell, false);
}

type CheckPresentMessageMode = 'command' | 'activation';

async function checkPresent(context : Context, errorMessageMode : CheckPresentMessageMode) : Promise<boolean> {
    if (context.binFound) {
        return true;
    }

    return await checkForKsInternal(context, errorMessageMode);
}

async function checkForKsInternal(context : Context, errorMessageMode : CheckPresentMessageMode) : Promise<boolean> {
    const binName = 'ks';
    const bin = context.host.getConfiguration('vs-kubernetes')[`vs-kubernetes.${binName}-path`];

    const contextMessage = getCheckKsContextMessage(errorMessageMode);
    const inferFailedMessage = 'Could not find "ks" binary.' + contextMessage;
    const configuredFileMissingMessage = bin + ' does not exist!' + contextMessage;

    return await binutil.checkForBinary(context, bin, binName, inferFailedMessage, configuredFileMissingMessage);
}

function getCheckKsContextMessage(errorMessageMode : CheckPresentMessageMode) : string {
    if (errorMessageMode === 'activation') {
        return ' Kubernetes commands other than configuration will not function correctly.';
    } else if (errorMessageMode === 'command') {
        return ' Cannot execute command.';
    }
    return '';
}

async function invoke(context : Context, command : string, handler? : ShellHandler) : Promise<void> {
    await ksInternal(context, command, handler || ksDone(context));
}

async function invokeWithProgress(context : Context, command : string, progressMessage : string, handler? : ShellHandler) : Promise<void> {
    return context.host.withProgress((p) => {
        return new Promise<void>((resolve, reject) => {
            p.report({ message: progressMessage });
            ksInternal(context, command, (code, stdout, stderr) => {
                resolve();
                (handler || ksDone(context))(code, stdout, stderr);
            });
        });
    });
}

async function invokeAsync(context : Context, command : string) : Promise<ShellResult> {
    const bin = baseKsPath(context);
    let cmd = bin + ' ' + command;
    return await context.shell.exec(cmd);
}

async function invokeAsyncWithProgress(context : Context, command : string, progressMessage : string): Promise<ShellResult> {
    return context.host.withProgress(async (p) => {
        p.report({ message: progressMessage });
        return await invokeAsync(context, command);
    });
}

function invokeInTerminal(context : Context, command : string, terminal : Terminal) : void {
    let bin = baseKsPath(context).trim();
    if (bin.indexOf(" ") > -1 && !/^['"]/.test(bin)) {
        bin = `"${bin}"`;
    }
    terminal.sendText(`${bin} ${command}`);
    terminal.show();
}

async function ksInternal(context : Context, command : string, handler : ShellHandler) : Promise<void> {
    if (await checkPresent(context, 'command')) {
        const bin = baseKsPath(context);
        let cmd = bin + ' ' + command;
        context.shell.exec(cmd).then(({code, stdout, stderr}) => handler(code, stdout, stderr)).catch()
    }
}

function ksDone(context : Context) : ShellHandler {
    return (result : number, stdout : string, stderr : string) => {
        if (result !== 0) {
            context.host.showErrorMessage('Ks command failed: ' + stderr);
            console.log(stderr);
            return;
        }

        context.host.showInformationMessage(stdout);
    };
}

function baseKsPath(context : Context) : string {
    let bin = context.host.getConfiguration('vs-kubernetes')['vs-kubernetes.ks-path'];
    if (!bin) {
        bin = 'ks';
    }
    return bin;
}

async function asLines(context : Context, command : string) : Promise<string[] | ShellResult | undefined> {
    const shellResult = await invokeAsync(context, command);
    if (shellResult && shellResult.code === 0) {
        let lines = shellResult.stdout.split('\n');
        lines.shift();
        lines = lines.filter((l) => l.length > 0);
        return lines;

    }
    return shellResult;
}

function path(context : Context) : string {
    let bin = baseKsPath(context);
    return binutil.execPath(context.shell, bin);
}