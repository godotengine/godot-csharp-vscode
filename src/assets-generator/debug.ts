import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import * as fs from 'fs-extra';
import * as semver from 'semver';
import {getFormattingOptions, replaceCommentPropertiesWithComments, updateJsonWithComments} from '../json-utils';
import {findGodotExecutablePath, GODOT_VERSION_3, GODOT_VERSION_4} from '../godot-utils';

export function createLaunchConfiguration(godotExecutablePath: string | undefined, godotVersion: string):
	{version: string, configurations: vscode.DebugConfiguration[]}
{
	return {
		version: '2.0.0',
		configurations: _createDebugConfigurations(godotExecutablePath, godotVersion),
	};
}

export function createDebugConfigurationsArray(godotExecutablePath: string | undefined, godotVersion: string): vscode.DebugConfiguration[]
{
	const configurations = _createDebugConfigurations(godotExecutablePath, godotVersion);

	// Remove comments
	configurations.forEach(configuration => {
		for (const key in configuration)
		{
			if (Object.prototype.hasOwnProperty.call(configuration, key))
			{
				if (key.startsWith('OS-COMMENT'))
				{
					delete configuration[key];
				}
			}
		}
	});

	return configurations;
}

function _createDebugConfigurations(godotExecutablePath: string | undefined, godotVersion: string): vscode.DebugConfiguration[] {
	if (semver.intersects(godotVersion, GODOT_VERSION_3)) {
		return [
			createPlayInEditorDebugConfigurationForGodot3(),
			createLaunchDebugConfigurationForGodot3(godotExecutablePath),
			createLaunchDebugConfigurationForGodot3(godotExecutablePath, true),
			createAttachDebugConfigurationForGodot3(),
		];
	} else if (semver.intersects(godotVersion, GODOT_VERSION_4)) {
		return [
			createLaunchDebugConfigurationForGodot4(godotExecutablePath),
			createLaunchDebugConfigurationForGodot4(godotExecutablePath, true),
			createAttachDebugConfigurationForGodot4(),
		];
	} else {
		vscode.window.showErrorMessage('Cannot create C# Godot debug configurations. Godot version is unknown or unsupported.');
		return [];
	}
}

export function createPlayInEditorDebugConfigurationForGodot3(): vscode.DebugConfiguration
{
	return {
		name: 'Play in Editor',
		type: 'godot-mono',
		mode: 'playInEditor',
		request: 'launch',
	};
}

export function createLaunchDebugConfigurationForGodot3(godotExecutablePath: string | undefined, canSelectScene: boolean = false): vscode.DebugConfiguration
{
	godotExecutablePath = godotExecutablePath ?? '<insert-godot-executable-path-here>';
	return {
		name: `Launch${canSelectScene ? ' (Select Scene)' : ''}`,
		type: 'godot-mono',
		request: 'launch',
		mode: 'executable',
		preLaunchTask: 'build',
		executable: godotExecutablePath,
		'OS-COMMENT1': 'See which arguments are available here:',
		'OS-COMMENT2': 'https://docs.godotengine.org/en/stable/getting_started/editor/command_line_tutorial.html',
		executableArguments: [
			'--path',
			'${workspaceRoot}',
			...(canSelectScene ? ['${command:godot.csharp.getLaunchScene}'] : []),
		],
	};
}

export function createLaunchDebugConfigurationForGodot4(godotExecutablePath: string | undefined, canSelectScene: boolean = false): vscode.DebugConfiguration
{
	godotExecutablePath = godotExecutablePath ?? '<insert-godot-executable-path-here>';
	return {
		name: `Launch${canSelectScene ? ' (Select Scene)' : ''}`,
		type: 'coreclr',
		request: 'launch',
		preLaunchTask: 'build',
		program: godotExecutablePath,
		'OS-COMMENT1': 'See which arguments are available here:',
		'OS-COMMENT2': 'https://docs.godotengine.org/en/stable/getting_started/editor/command_line_tutorial.html',
		args: [
			'--path',
			'${workspaceRoot}',
			...(canSelectScene ? ['${command:SelectLaunchScene}'] : []),
		],
		cwd: '${workspaceRoot}',
		stopAtEntry: false,
		console: 'internalConsole',
	};
}

export function createAttachDebugConfigurationForGodot3()
{
	return {
		name: 'Attach',
		type: 'godot-mono',
		request: 'attach',
		address: 'localhost',
		port: 23685,
	};
}

export function createAttachDebugConfigurationForGodot4()
{
	return {
		name: 'Attach',
		type: 'coreclr',
		request: 'attach',
	};
}

export async function addLaunchJsonIfNecessary(launchJsonPath: string, godotVersion: string): Promise<void>
{
	const godotExecutablePath = await findGodotExecutablePath(godotVersion);
	const launchConfiguration = createLaunchConfiguration(godotExecutablePath, godotVersion);

	const formattingOptions = getFormattingOptions();

	let text: string;
	const exists = await fs.pathExists(launchJsonPath);
	if (!exists) {
		// when launch.json does not exist, create it and write all the content directly
		const launchJsonText = JSON.stringify(launchConfiguration);
		const launchJsonTextFormatted = jsonc.applyEdits(launchJsonText, jsonc.format(launchJsonText, undefined, formattingOptions));
		text = launchJsonTextFormatted;
	} else {
		// when launch.json exists replace or append our configurations
		const ourConfigs = launchConfiguration.configurations ?? [];
		const content = fs.readFileSync(launchJsonPath).toString();
		const updatedJson = updateJsonWithComments(content, ourConfigs, 'configurations', 'name', formattingOptions);
		text = updatedJson;
	}

	const textWithComments = replaceCommentPropertiesWithComments(text);
	await fs.writeFile(launchJsonPath, textWithComments);
}
