import * as vscode from 'vscode';

const alert = vscode.window.showErrorMessage;

export const noActiveWindow = () => {
    alert("Can't open Jsonnet preview because there is no active window");
}

export const documentNotJsonnet = (languageId) => {
    alert(`Can't generate Jsonnet document preview for document with language id '${languageId}'`);
}

export const couldNotRenderJsonnet = (reason) => {
    alert(`Error: Could not render Jsonnet; ${reason}`);
}

export const jsonnetCommandNotOnPath = () => {
    alert(`Error: could not find 'jsonnet' command on path`);
}

export const jsonnetCommandIsNull = () => {
    alert(`Error: 'jsonnet.executablePath' must be set in vscode settings`);
}