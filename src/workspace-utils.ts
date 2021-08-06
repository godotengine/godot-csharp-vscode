import * as vscode from 'vscode';

export async function getWorkspaceScenes(projectDirectory: string | undefined = undefined): Promise<string[]> {
	const pattern: string = '**/*.tscn';
	const include: vscode.GlobPattern = projectDirectory
		? new vscode.RelativePattern(projectDirectory, pattern)
		: pattern;
	return vscode.workspace.findFiles(include)
		.then(uris => uris.map(uri => uri.fsPath));
}
