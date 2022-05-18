import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import {getVscodeFolder} from './vscode-utils';
import {Configuration} from './configuration';
import {AssetsGenerator, createDebugConfigurationsArray} from './assets-generator';
import {findGodotExecutablePath, determineGodotVersion} from './godot-utils';

export class GodotMonoDebugConfigProvider implements vscode.DebugConfigurationProvider {
	private godotProjectPath: string;

	constructor(godotProjectPath: string) {
		this.godotProjectPath = godotProjectPath;
	}

	public async provideDebugConfigurations(
		folder: vscode.WorkspaceFolder | undefined,
		token?: vscode.CancellationToken
	): Promise<vscode.DebugConfiguration[]>
	{
		const vscodeFolder = getVscodeFolder();
		if (!folder || !folder.uri || !vscodeFolder)
		{
			vscode.window.showErrorMessage('Cannot create C# Godot debug configurations. No workspace folder was selected.');
			return [];
		}

		const godotVersion = await determineGodotVersion(folder);
		if (!godotVersion) {
			vscode.window.showErrorMessage('Cannot create C# Godot debug configurations. Godot version is unknown or unsupported.');
			return [];
		}

		const generator = AssetsGenerator.Create(vscodeFolder);

		// Make sure .vscode folder exists, addTasksJsonIfNecessary will fail to create tasks.json if the folder does not exist.
		await fs.ensureDir(vscodeFolder);

		// Add a tasks.json
		await generator.addTasksJsonIfNecessary(godotVersion);

		const godotPath = await findGodotExecutablePath(godotVersion);
		return createDebugConfigurationsArray(godotPath, godotVersion);
	}

	public async resolveDebugConfiguration(
		folder: vscode.WorkspaceFolder | undefined,
		debugConfiguration: vscode.DebugConfiguration,
		token?: vscode.CancellationToken
	): Promise<vscode.DebugConfiguration | undefined>
	{
		if (!debugConfiguration.__exceptionOptions) {
			debugConfiguration.__exceptionOptions = Configuration.Value.exceptionOptionsForDebug;
		}

		debugConfiguration['godotProjectDir'] = this.godotProjectPath;

		return debugConfiguration;
	}
}
