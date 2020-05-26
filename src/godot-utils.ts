
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
