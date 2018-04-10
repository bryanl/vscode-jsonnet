import * as path from 'path';
import * as vscode from 'vscode';
import * as vs from 'vscode';

import * as alert from './alert';
import * as explorer from './explorer';
import * as fs from './fs';
import { host } from './host';
import * as jsUtils from './jsonnet-utils';
import { create as ksCreate } from './ks';
import { create as jsonnetCreate } from './jsonnet';
import * as ksUtils from './ksonnet-utils';
import { shell } from './shell';
import * as workspace from './workspace';
import { create as previewCreate } from './preview';

const ks = ksCreate(host, fs.fs, shell);
const jsonnet = jsonnetCreate(host, fs.fs, shell);

// activate registers the Jsonnet language server with vscode, and
// configures it based on the contents of the workspace JSON file.
export const activate = (context: vs.ExtensionContext) => {
  const treeProvider = explorer.create(ks);

  const jsonnetPreviewProvider = previewCreate(jsonnet, ks);

  const subscriptions = [
    vscode.commands.registerCommand('ksonnet.refreshExplorer', () => treeProvider.refresh()),
    vscode.commands.registerCommand('ksonnet.useEnvironment', useKsonnetEnvironment),
    vscode.commands.registerCommand('jsonnet.preview', () => display.previewJsonnet(false)),
    vscode.commands.registerCommand('jsonnet.previewToSide', () => display.previewJsonnet(true)),
    vscode.window.onDidChangeActiveTextEditor(e => updateKsonnetWorkspace()),
    vscode.workspace.onDidChangeWorkspaceFolders(e => console.log(e)),
    vscode.workspace.registerTextDocumentContentProvider(jsUtils.PREVIEW_SCHEME, jsonnetPreviewProvider),
    vscode.workspace.onDidOpenTextDocument(doc => console.log(doc)),
    vscode.workspace.onDidSaveTextDocument(doc => console.log(doc)),
    vscode.workspace.onDidCloseTextDocument(doc => jsonnetPreviewProvider.delete(doc)),
  ];

  subscriptions.forEach((element) => {
    context.subscriptions.push(element)
  })

  // tree data providers
  vscode.window.registerTreeDataProvider('ksonnet.explorer', treeProvider);

  // text document providers

  register.jsonnetClient(context);
  const diagProvider = register.diagnostics(context);
  register.previewCommands(context, diagProvider);
}

export const deactivate = () => { }

var currentWorkspace = "";

function updateKsonnetWorkspace(): void {
  refreshExplorer()
}

async function useKsonnetEnvironment(explorerNode: explorer.KsonnetObject) {
  const envName = explorerNode.metadata.name;
  if (ksUtils.setCurrentEnvironment(ks, envName)) {
    refreshExplorer()
  }
}

async function refreshExplorer() {
  await vscode.commands.executeCommand("ksonnet.refreshExplorer");
}


namespace register {
  // jsonnetClient registers the Jsonnet language client with vscode.
  export const jsonnetClient = (context: vs.ExtensionContext): void => {
    // The server is implemented in node
    let languageClient = jsUtils.languageClient(
      context.asAbsolutePath(path.join('out', 'server', 'server.js')));


    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    context.subscriptions.push(languageClient.start());

    // Configure the workspace.
    workspace.configure(vs.workspace.getConfiguration('jsonnet'));
  }

  // diagnostics registers a `jsonnet.DiagnosticProvider` with vscode.
  // This will cause vscode to render errors and warnings for users as
  // they save their code.
  export const diagnostics = (
    context: vs.ExtensionContext,
  ): jsUtils.DiagnosticProvider => {
    const diagnostics = vs.languages.createDiagnosticCollection("jsonnet");
    context.subscriptions.push(diagnostics);
    return new jsUtils.DiagnosticProvider(diagnostics);
  }

  // previewCommands will register the commands that allow people to
  // open a "preview" pane that renders their Jsonnet, similar to the
  // markdown preview pane.
  export const previewCommands = (
    context: vs.ExtensionContext, diagProvider: jsUtils.DiagnosticProvider,
  ): void => {
    // Create Jsonnet provider, register it to provide for documents
    // with `PREVIEW_SCHEME` URI scheme.
    // const docProvider = new jsUtils.DocumentProvider();
    // const registration = vs.workspace.registerTextDocumentContentProvider(
    //   jsUtils.PREVIEW_SCHEME, docProvider);

    // Subscribe to document updates. This allows us to detect (e.g.)
    // when a document was saved.
    // context.subscriptions.push(registration);

    // Expand Jsonnet, register errors as diagnostics with vscode, and
    // generate preview if a preview tab is open.
    const preview = (doc: vs.TextDocument): void => {
      console.log("updating the preview...");
      // if (doc.languageId === "jsonnet") {
      //   const result = docProvider.cachePreview(doc);
      //   if (jsUtils.isRuntimeFailure(result)) {
      //     diagProvider.report(doc.uri, result.error);
      //   } else {
      //     diagProvider.clear(doc.uri);
      //   }
      //   docProvider.update(jsUtils.canonicalPreviewUri(doc.uri));
      // }
    }

    // Register Jsonnet preview commands.
    // context.subscriptions.push(vs.commands.registerCommand(
    //   'jsonnet.previewToSide', () => display.previewJsonnet(true)));
    // context.subscriptions.push(vs.commands.registerCommand(
    //   'jsonnet.preview', () => display.previewJsonnet(false)));

    // // Call `preview` any time we save or open a document.
    // context.subscriptions.push(vs.workspace.onDidSaveTextDocument(preview));
    // context.subscriptions.push(vs.workspace.onDidOpenTextDocument(preview));
    // context.subscriptions.push(vs.workspace.onDidCloseTextDocument(doc => {
    //   docProvider.delete(doc);
    // }));

    // // Call `preview` when we open the editor.
    // const active = vs.window.activeTextEditor;
    // if (active != null) {
    //   preview(active.document);
    // }
  }
}

namespace display {
  export const previewJsonnet = (sideBySide: boolean) => {
    const editor = vs.window.activeTextEditor;
    if (editor == null) {
      alert.noActiveWindow();
      return;
    }

    const languageId = editor.document.languageId;
    if (!(editor.document.languageId === "jsonnet")) {
      alert.documentNotJsonnet(languageId);
      return;
    }

    const previewUri = jsUtils.canonicalPreviewUri(editor.document.uri);

    return vs.commands.executeCommand(
      'vscode.previewHtml',
      previewUri,
      getViewColumn(sideBySide),
      `Jsonnet preview '${path.basename(editor.document.fileName)}'`
    ).then((success) => { }, (reason) => {
      alert.couldNotRenderJsonnet(reason);
    });
  }

  export const getViewColumn = (
    sideBySide: boolean
  ): vs.ViewColumn | undefined => {
    const active = vs.window.activeTextEditor;
    if (!active) {
      return vs.ViewColumn.One;
    }

    if (!sideBySide) {
      return active.viewColumn;
    }

    switch (active.viewColumn) {
      case vs.ViewColumn.One:
        return vs.ViewColumn.Two;
      case vs.ViewColumn.Two:
        return vs.ViewColumn.Three;
    }

    return active.viewColumn;
  }
}
