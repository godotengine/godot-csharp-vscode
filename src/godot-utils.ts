import {lookpath} from 'lookpath';
import {Configuration} from './configuration';
import {client} from './extension';

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

export async function findGodotExecutablePath(): Promise<string | undefined>
{
    let path: string | undefined;

    // If the user has set the path in the settings, use that value
    path = Configuration.Value.godotExecutablePath;
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
