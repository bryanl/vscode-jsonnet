import * as vscode from 'vscode';
import * as os from 'os';

export let executable = "jsonnet";

const extStrsProp = "extStrs";
const execPathProp = "executablePath";

export const extStrs = (): string => {
    const extStrsObj = vscode.workspace.getConfiguration('jsonnet')[extStrsProp];
    return extStrsObj == null
        ? ""
        : Object.keys(extStrsObj)
            .map(key => `--ext-str ${key}="${extStrsObj[key]}"`)
            .join(" ");
}

export const libPaths = (): string => {
    const libPaths = vscode.workspace.getConfiguration('jsonnet')["libPaths"];
    if (libPaths == null) {
        return "";
    }

    // Add executable to the beginning of the library paths, because
    // the Jsonnet CLI will look there first.
    //
    // TODO(hausdorff): Consider adding support for Jsonnet's
    // (undocumented) search paths `/usr/share/{jsonnet version}` and
    // `/usr/local/share/{jsonnet version}`. We don't support them
    // currently because (1) they're undocumented and therefore not
    // widely-used, and (2) it requires shelling out to the Jsonnet
    // command line, which complicates the extension.
    const jsonnetExecutable = vscode.workspace.getConfiguration[execPathProp];
    if (jsonnetExecutable != null) {
        (<string[]>libPaths).unshift(jsonnetExecutable);
    }

    return libPaths
        .map(path => `-J ${path}`)
        .join(" ");
}

export const outputFormat = (): "json" | "yaml" => {
    return vscode.workspace.getConfiguration('jsonnet')["outputFormat"];
}

export const configure = (config: vscode.WorkspaceConfiguration): boolean => {
    if (os.type() === "Windows_NT") {
        return configureWindows(config);
    } else {
        return configureUnix(config);
    }
}

const configureUnix = (config: vscode.WorkspaceConfiguration): boolean => {
    if (config[execPathProp] != null) {
        executable = config[execPathProp];
    } else {
        // try {
        // //     // If this doesn't throw, 'jsonnet' was found on
        // //     // $PATH.
        // //     //
        // //     // TODO: Probably should find a good non-shell way of
        // //     // doing this.
        // //     execSync(`which jsonnet`);
        // // } catch (e) {
        // //     alert.jsonnetCommandNotOnPath();
        // //     return false;
        // }
        return false
    }

    return true;
}

const configureWindows = (config: vscode.WorkspaceConfiguration): boolean => {
    // if (config[execPathProp] == null) {
    //     alert.jsonnetCommandIsNull();
    //     return false;
    // }

    // executable = config[execPathProp];
    // return true;
    return false
}
