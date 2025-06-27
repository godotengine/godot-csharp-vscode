import * as vscode from 'vscode';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import * as semver from 'semver';
import {lookpath} from 'lookpath';
import {Configuration} from './configuration';
import {client} from './extension';
import {findProjectFiles} from './project-select';

export const GODOT_VERSION_3 = '3.*.*';
export const GODOT_VERSION_4 = '4.*.*';

export async function determineGodotVersion(folder: vscode.WorkspaceFolder | string | undefined): Promise<string | undefined> {
    if (folder) {
        // Try to determine Godot version from the project folder
        const folderPath = typeof folder === 'string' ? folder : folder.uri.fsPath;
        const projectFile = path.join(folderPath, 'project.godot');
        const godotVersion = await determineGodotVersionFromProjectFile(projectFile);
        if (godotVersion) {
            return godotVersion;
        }
    }

    // A project folder was not provided or we couldn't determine the version from it.
    // Try to find all the project.godot files in the workspace.
    const projectFiles = await findProjectFiles();
    if (projectFiles.length === 1) {
        // We found exactly one project.godot file so we can assume this is the user's project
        const godotVersion = await determineGodotVersionFromProjectFile(projectFiles[0].absoluteFilePath);
        if (godotVersion) {
            return godotVersion;
        }
    }

    // We could not determine the Godot version
    return undefined;
}

async function determineGodotVersionFromProjectFile(projectFilePath: string): Promise<string | undefined> {
    if (!fs.existsSync(projectFilePath)) {
        return undefined;
    }

    const projectFileStream = await fs.createReadStream(projectFilePath);
    const rl = readline.createInterface({
        input: projectFileStream,
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        if (line.startsWith('config_version=')) {
            const configVersion = line.substr('config_version='.length);
            switch (configVersion) {
                case '4':
                    return GODOT_VERSION_3;
                case '5':
                    return GODOT_VERSION_4;
                default:
                    return undefined;
            }
        }
    }

    return undefined;
}

export function fixPathForGodot(path: string): string {
    if (process.platform === "win32") {
        // Godot expects the drive letter to be upper case
        if (path && path.charAt(1) === ':') {
            let drive = path[0];
            let driveUpper = drive.toUpperCase();
            if (driveUpper !== drive) {
                path = driveUpper + path.substr(1);
            }
        }
    }

    return path;
}

export async function findGodotExecutablePath(godotVersion: string): Promise<string | undefined> {
    let path: string | undefined;

    // If the user has set the path in the settings, use that value
    if (semver.intersects(godotVersion, GODOT_VERSION_3)) {
        path = Configuration.Value.godot3ExecutablePath;
    } else if (semver.intersects(godotVersion, GODOT_VERSION_4)) {
        path = Configuration.Value.godot4ExecutablePath;
    }
    if (path) {
        return path;
    }

    // If the extension is connected to a running Godot editor instance, use its path
    if (client !== undefined) {
        path = client.metadata?.editorExecutablePath;
        if (path) {
            return path;
        }
    }

    // Check if the godot command is in the path
    path = await lookpath('godot');
    if (path) {
        return path;
    }

    // We couldn't find the Godot executable
    return undefined;
}
