import * as vscode from 'vscode';
import * as path from 'path';

export interface ProjectLocation{
    relativeFilePath: string
    absoluteFilePath: string
    relativeProjectPath: string
    absoluteProjectPath: string
}

export async function findProjectFiles(): Promise<ProjectLocation[]> {
    let projectFiles = await vscode.workspace.findFiles("**/project.godot");
    return projectFiles.map((x) => {
        return {
            relativeFilePath: vscode.workspace.asRelativePath(x),
            absoluteFilePath: x.path,
            relativeProjectPath: path.dirname(vscode.workspace.asRelativePath(x)),
            absoluteProjectPath: path.dirname(x.path)            
        }
    });
}

export async function promptForProject(): Promise<ProjectLocation | undefined> {
    let godotProjectFiles = await findProjectFiles();
    let selectionOptions = godotProjectFiles?.map((x) => {
        return {
            label: x.relativeFilePath,
            ...x
        }
    });
    return vscode.window.showQuickPick(selectionOptions, {
        title: 'Select a Godot project',
        placeHolder: 'Select a Godot project'
    });
}