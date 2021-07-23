import * as vscode from 'vscode';
import * as configuration from './configuration';
import * as fs from 'fs-extra';
import {getVscodeFolder} from './vscode-utils';
import {AssetsGenerator, createDebugConfigurationsArray} from './assets-generator';

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

		const generator = AssetsGenerator.Create(vscodeFolder);

		// Make sure .vscode folder exists, addTasksJsonIfNecessary will fail to create tasks.json if the folder does not exist.
		await fs.ensureDir(vscodeFolder);

		// Add a tasks.json
		await generator.addTasksJsonIfNecessary();

		return createDebugConfigurationsArray();
	}

	public async resolveDebugConfiguration(
		folder: vscode.WorkspaceFolder | undefined,
		debugConfiguration: vscode.DebugConfiguration,
		token?: vscode.CancellationToken
	): Promise<vscode.DebugConfiguration | undefined>
	{
		if (!debugConfiguration.__exceptionOptions) {
			debugConfiguration.__exceptionOptions = configuration.convertToExceptionOptions(configuration.getModel());
		}

		debugConfiguration['godotProjectDir'] = this.godotProjectPath;

		return debugConfiguration;
	}
}
