import * as vscode from 'vscode';
import * as path from 'path';

export function getVscodeFolder(): string | undefined
{
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		return undefined;
	}

	return path.join(workspaceFolders[0].uri.fsPath, '.vscode');
}
