import * as im from 'immutable';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as client from 'vscode-languageclient';

import * as lexical from '../compiler/lexical-analysis/lexical';
import * as html from './html';
import * as ksUtils from './ksonnet-utils';
import * as workspace from './workspace';
import { Jsonnet } from './jsonnet';

export const PREVIEW_SCHEME = "jsonnet-preview";
export const DOCUMENT_FILTER = {
    language: 'jsonnet',
    scheme: 'file'
};

export const languageClient = (serverModule: string) => {
    // The debug options for the server
    let debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

    // If the extension is launched in debug mode then the debug
    // server options are used. Otherwise the run options are used
    let serverOptions: client.ServerOptions = {
        run: {
            module: serverModule,
            transport: client.TransportKind.ipc,
        },
        debug: {
            module: serverModule,
            transport: client.TransportKind.ipc,
            options: debugOptions
        }
    }

    // Options to control the language client
    let clientOptions: client.LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: [DOCUMENT_FILTER.language],
        synchronize: {
            // Synchronize the workspace/user settings sections
            // prefixed with 'jsonnet' to the server.
            configurationSection: DOCUMENT_FILTER.language,
            // Notify the server about file changes to '.clientrc
            // files contain in the workspace.
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        }
    }

    // Create the language client and start the client.
    return new client.LanguageClient(
        "JsonnetLanguageServer",
        'Jsonnet Language Server',
        serverOptions,
        clientOptions);
}

export const canonicalPreviewUri = (fileUri: vscode.Uri) => {
    return fileUri.with({
        scheme: PREVIEW_SCHEME,
        path: `${fileUri.path}.rendered`,
        query: fileUri.toString(),
    });
}

export const fileUriFromPreviewUri = (previewUri: vscode.Uri): vscode.Uri => {
    const file = previewUri.fsPath.slice(0, -(".rendered".length));
    return vscode.Uri.file(file);
}

// RuntimeError represents a runtime failure in a Jsonnet program.
export class RuntimeFailure {
    constructor(
        readonly error: string,
    ) { }
}

export const isRuntimeFailure = (thing): thing is RuntimeFailure => {
    return thing instanceof RuntimeFailure;
}

// DocumentProvider compiles Jsonnet code to JSON or YAML, and
// provides that to vscode for rendering in the preview pane.
//
// DESIGN NOTES: This class optionally exposes `cachePreview` and
// `delete` so that the caller can get the results of the document
// compilation for purposes of (e.g.) reporting diagnostic issues.
// export class DocumentProvider implements vscode.TextDocumentContentProvider {


//     public function provideTextDocumentContent(previewUri: vscode.Uri, token: vscode.CancellationToken): Thenable<string> {
//         const sourceUri = vscode.Uri.parse(previewUri.query);
//         return vscode.workspace.openTextDocument(sourceUri)
//             .then(sourceDoc => {
//                 const result = this.previewCache.has(sourceUri.toString())
//                     ? this.previewCache.get(sourceUri.toString())
//                     : this.cachePreview(sourceDoc);
//                 if (isRuntimeFailure(result)) {
//                     return html.body(html.errorMessage(result.error));
//                 }
//                 const outputFormat = workspace.outputFormat();
//                 return html.body(html.prettyPrintObject(result, outputFormat));
//             });
//     }

//     public async function cachePreview(Jsonnet: Jsonnet, sourceDoc: vscode.TextDocument): RuntimeFailure | string {
//         const sourceUri = sourceDoc.uri.toString();
//         const sourceFile = sourceDoc.uri.fsPath

//         let codePaths = '';

//         const rootDir = ksUtils.rootPath(sourceFile);

//         if (rootDir) {
//             const dir = path.dirname(sourceFile);
//             const paramsPath = path.join(dir, "params.libsonnet");
//             const rootDir = ksUtils.rootPath(sourceFile);
//             const envParamsPath = path.join(rootDir!, "environments", "default", "params.libsonnet");

//             let codeImports = {
//                 '__ksonnet/params': path.join(dir, "params.libsonnet"),
//                 '__ksonnet/environments': envParamsPath,
//             };

//             codePaths = Object.keys(codeImports)
//                 .map(k => `--ext-code-file "${k}"=${codeImports[k]}`)
//                 .join(' ');

//             console.log(codePaths);
//         }

//         try {
//             // Compile the preview Jsonnet file.
//             const extStrs = workspace.extStrs();
//             const libPaths = workspace.libPaths();
//             // const jsonOutput = execSync(
//             //     `${workspace.executable} ${libPaths} ${extStrs} ${codePaths} ${sourceFile}`
//             // ).toString();

//             const shellResult = await Jsonnet.invokeAsync(`${libPaths} ${extStrs} ${codePaths} ${sourceFile}`, "");

//             // Cache.
//             this.previewCache = this.previewCache.set(sourceUri, jsonOutput);

//             return jsonOutput;
//         } catch (e) {
//             const failure = new RuntimeFailure(e.message);
//             this.previewCache = this.previewCache.set(sourceUri, failure);
//             return failure;
//         }
//     }

//     public delete = (document: vscode.TextDocument): void => {
//         const previewUri = document.uri.query.toString();
//         this.previewCache = this.previewCache.delete(previewUri);
//     }

//     //
//     // Document update API.
//     //

//     get onDidChange(): vscode.Event<vscode.Uri> {
//         return this._onDidChange.event;
//     }

//     public update = (uri: vscode.Uri) => {
//         this._onDidChange.fire(uri);
//     }

//     //
//     // Private members.
//     //

//     private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
//     private previewCache = im.Map<string, string | RuntimeFailure>();
// }

// DiagnosticProvider will consume the output of the Jsonnet CLI and
// either (1) report diagnostics issues (e.g., errors, warnings) to
// the user, or (2) clear them if the compilation was successful.
export class DiagnosticProvider {
    constructor(private readonly diagnostics: vscode.DiagnosticCollection) { }

    public report = (fileUri: vscode.Uri, message: string): void => {
        const messageLines = im.List<string>((<string>message).split(os.EOL)).rest();

        // Start over.
        this.diagnostics.clear();
        const errorMessage = messageLines.get(0);

        if (errorMessage.startsWith(lexical.staticErrorPrefix)) {
            return this.reportStaticErrorDiagnostics(errorMessage);
        } else if (errorMessage.startsWith(lexical.runtimeErrorPrefix)) {
            const stackTrace = messageLines.rest().toList();
            return this.reportRuntimeErrorDiagnostics(
                fileUri, errorMessage, stackTrace);
        }
    }

    public clear = (fileUri: vscode.Uri): void => {
        this.diagnostics.delete(fileUri);
    }

    //
    // Private members.
    //

    private reportStaticErrorDiagnostics = (message: string): void => {
        const staticError = message.slice(lexical.staticErrorPrefix.length);
        const match = DiagnosticProvider.fileFromStackFrame(staticError);
        if (match == null) {
            console.log(`Could not parse filename from Jsonnet error: '${message}'`);
            return;
        }

        const locAndMessage = staticError.slice(match.fullMatch.length);
        const range = DiagnosticProvider.parseRange(locAndMessage);
        if (range == null) {
            console.log(`Could not parse location range from Jsonnet error: '${message}'`);
            return;
        }
        const diag = new vscode.Diagnostic(
            range, locAndMessage, vscode.DiagnosticSeverity.Error);
        this.diagnostics.set(vscode.Uri.file(match.file), [diag]);
    }

    private reportRuntimeErrorDiagnostics = (
        fileUri: vscode.Uri, message: string, messageLines: im.List<string>,
    ): void => {
        const diagnostics = messageLines
            .reduce((acc: im.Map<string, im.List<vscode.Diagnostic>>, line: string) => {
                // Filter error lines that we know aren't stack frames.
                const trimmed = line.trim();
                if (trimmed == "" || trimmed.startsWith("During manifestation")) {
                    return acc;
                }

                // Log when we think a line is a stack frame, but we can't
                // parse it.
                const match = DiagnosticProvider.fileFromStackFrame(line);
                if (match == null) {
                    console.log(`Could not parse filename from Jsonnet error: '${line}'`);
                    return acc;
                }

                const loc = line.slice(match.fileWithLeadingWhitespace.length);
                const range = DiagnosticProvider.parseRange(loc);
                if (range == null) {
                    console.log(`Could not parse filename from Jsonnet error: '${line}'`);
                    return acc;
                }

                // Generate and emit diagnostics.
                const diag = new vscode.Diagnostic(
                    range, `${message}`, vscode.DiagnosticSeverity.Error);

                const prev = acc.get(match.file, undefined);
                return prev == null
                    ? acc.set(match.file, im.List<vscode.Diagnostic>([diag]))
                    : acc.set(match.file, prev.push(diag));
            },
                im.Map<string, im.List<vscode.Diagnostic>>());

        const fileDiags = diagnostics.get(fileUri.fsPath, undefined);
        fileDiags != null && this.diagnostics.set(fileUri, fileDiags.toArray());
    }

    private static parseRange = (range: string): vscode.Range | null => {
        const lr = lexical.LocationRange.fromString("Dummy name", range);
        if (lr == null) {
            return null;
        }

        const start = new vscode.Position(lr.begin.line - 1, lr.begin.column - 1);
        // NOTE: Don't subtract 1 from `lr.end.column` because the range
        // is exclusive at the end.
        const end = new vscode.Position(lr.end.line - 1, lr.end.column);

        return new vscode.Range(start, end);
    }

    private static fileFromStackFrame = (
        frameMessage: string
    ): { fullMatch: string, fileWithLeadingWhitespace: string, file: string } | null => {
        const fileMatch = frameMessage.match(/(\s*)(.*?):/);
        return fileMatch == null
            ? null
            : {
                fullMatch: fileMatch[0],
                fileWithLeadingWhitespace: fileMatch[1] + fileMatch[2],
                file: fileMatch[2],
            }
    }
}
