import * as ksUtils from './ksonnet-utils';
import * as vscode from 'vscode';
import { Jsonnet } from './jsonnet';
import { Ks } from './ks';
import * as path from 'path';
import * as html from './html';
import * as fs from './fs';
import { shell } from './shell';

export function create(jsonnet: Jsonnet, ks: Ks, fs: fs.FS): Provider {
    return new Provider(jsonnet, ks, fs);
}

export class Provider implements vscode.TextDocumentContentProvider {
    private _documents = new Map<string, string>();

    constructor(private readonly jsonnet: Jsonnet, private readonly ks: Ks, private readonly fs: fs.FS) {

    }

    dispose() {
        this._documents.clear();
    }

    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {

        let document = this._documents.get(uri.toString())
        if (document) {
            return document
        }

        const sourceUri = vscode.Uri.parse(uri.query);

        return vscode.workspace.openTextDocument(sourceUri)
            .then(sourceDoc => {
                return this.generatePreview(sourceDoc).then((preview) => {
                    return html.body(html.prettyPrintObject(preview, "yaml"));
                })
            })
    }

    async generatePreview(sourceDoc: vscode.TextDocument): Promise<string> {
        const sourceUri = sourceDoc.uri.toString();
        const sourceFile = sourceDoc.uri.fsPath;

        let preview = "";

        const appDir = ksUtils.rootPath(sourceFile)
        if (appDir) {
            preview = await this.generateKsonnetPreview(appDir, sourceFile);
        } else {
            preview = await this.generateJsonnetPreview(sourceFile);
        }

        this._documents.set(sourceUri, preview)
        return preview
    }

    async generateKsonnetPreview(appDir: string, sourceFile: string): Promise<string> {
        console.log(`generating ksonnet preview for ${sourceFile} at ${appDir}`);

        const componentsPath = shell.combinePath(appDir, "components")

        // TODO: figure out what the component name is
        const envName = "default";
        const componentName = path.basename(sourceFile.replace(componentsPath, ''), path.extname(sourceFile));
        console.log(`ksonnet preview: component name = ${componentName}`)

        const shellResult = await this.ks.invokeAsync(`show ${envName} -c ${componentName} -o json`, appDir);
        if (shellResult.code === 0) {
            return shellResult.stdout;
        }

        return "ksonnet";
    }

    async generateJsonnetPreview(sourceFile: string): Promise<string> {
        console.log(`generating jsonnet preview for ${sourceFile}`);
        const sourceDir = path.dirname(sourceFile);

        const shellResult = await this.jsonnet.invokeAsync(`${sourceFile}`, sourceDir);
        if (shellResult.code === 0) {
            return shellResult.stdout;
        }

        return "jsonnet"
    }

    public delete(document: vscode.TextDocument): void {
        const uri = document.uri.query.toString();
        this._documents.delete(uri)
    }

}