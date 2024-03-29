import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import {getVscodeFolder} from './vscode-utils';
import {AssetsGenerator} from './assets-generator';

export async function addAssets(): Promise<void>
{
	const vscodeFolder = getVscodeFolder();
	if (!vscodeFolder)
	{
		vscode.window.showErrorMessage('Cannot generate C# Godot assets for build and debug. No workspace folder was selected.');
		return;
	}

	const generator = AssetsGenerator.Create(vscodeFolder);

	const doGenerateAssets = await shouldGenerateAssets(generator);
	if (!doGenerateAssets)
	{
		return; // user cancelled
	}

	// Make sure .vscode folder exists, generator will fail to create tasks.json and launch.json if the folder does not exist.
	await fs.ensureDir(vscodeFolder);

	const promises = [
		generator.addTasksJsonIfNecessary(),
		generator.addLaunchJsonIfNecessary(),
	];

	await Promise.all(promises);
}

async function shouldGenerateAssets(generator: AssetsGenerator): Promise<boolean>
{
	if (await generator.hasExistingAssets()) {
		const yesItem = {title: 'Yes'};
		const cancelItem = {title: 'Cancel', isCloseAffordance: true};
		const selection = await vscode.window.showWarningMessage('Replace existing build and debug assets?', cancelItem, yesItem);
		if (selection === yesItem)
		{
			return true;
		} else {
			// The user clicked cancel
			return false;
		}
	} else {
		// The assets don't exist, so we're good to go.
		return true;
	}
}
