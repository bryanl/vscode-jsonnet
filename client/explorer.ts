import * as vscode from 'vscode';

import { Ks } from './ks';
import * as ksUtils from './ksonnet-utils';

export function create(ks: Ks): KsonnetExplorer {
    return new KsonnetExplorer(ks)
}

export interface KsonnetObject {
    readonly id: string;
    readonly metadata?: any;
    getChildren(ks: Ks): vscode.ProviderResult<KsonnetObject[]>;
    getTreeItem(): vscode.TreeItem | Thenable<vscode.TreeItem>;
}

export class KsonnetExplorer implements vscode.TreeDataProvider<KsonnetObject> {
    private _onDidChangeTreeData: vscode.EventEmitter<KsonnetObject | undefined> = new vscode.EventEmitter<KsonnetObject | undefined>();
    readonly onDidChangeTreeData: vscode.Event<KsonnetObject | undefined> = this._onDidChangeTreeData.event;

    constructor(private readonly ks: Ks) {}

    getTreeItem(element: KsonnetObject): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element.getTreeItem()
    }

    getChildren(parent?: KsonnetObject): vscode.ProviderResult<KsonnetObject[]> {
        if (parent) {
            return parent.getChildren(this.ks)
        }

        return this.getApp();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire()
    }

    private async getApp(): Promise<KsonnetObject[]> {
        return [
            new KsonnetEnvironmentsFolder()
        ]
    }
}

class KsonnetEnvironment implements KsonnetObject {
    constructor(readonly id: string, readonly metadata: ksUtils.Env) {}

    getChildren(ks: Ks) : vscode.ProviderResult<KsonnetObject[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem | Thenable<vscode.TreeItem> {
        let treeItem = new vscode.TreeItem(this.id, vscode.TreeItemCollapsibleState.None);

        treeItem.contextValue = "ksonnet.environment";

        if (this.metadata.active) {
           treeItem.label = "* " + treeItem.label;
        } else {
            treeItem.contextValue += ".inactive";
        }

        return treeItem;
    }
}

abstract class KsonnetFolder implements KsonnetObject {
    constructor(readonly id: string, readonly displayName: string, readonly contextValue?: string){
    }

    abstract getChildren(ks: Ks): vscode.ProviderResult<KsonnetObject[]>;

    getTreeItem(): vscode.TreeItem | Thenable<vscode.TreeItem> {
        const treeItem = new vscode.TreeItem(this.displayName, vscode.TreeItemCollapsibleState.Collapsed);
        treeItem.contextValue = this.contextValue || `vsJsonnet.${this.id}`;
        return treeItem;
    }
}

class KsonnetEnvironmentsFolder extends KsonnetFolder {
    constructor() {
        super("environment", "Environments");
    }

    getChildren(ks: Ks): vscode.ProviderResult<KsonnetObject[]> {
        return this.getEnvironments(ks);
    }

    private async getEnvironments(ks: Ks): Promise<KsonnetObject[]> {
        const environments = await ksUtils.getEnvironments(ks);
        return environments.map((environment) => new KsonnetEnvironment(environment.name, environment));
    }
}