import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import * as fs from 'fs-extra';
import {getFormattingOptions, replaceCommentPropertiesWithComments, updateJsonWithComments} from '../json-utils';
import {findGodotExecutablePath} from '../godot-utils';

export function createLaunchConfiguration(godotExecutablePath: string | undefined):
	{version: string, configurations: vscode.DebugConfiguration[]}
{
	return {
		version: '2.0.0',
		configurations: _createDebugConfigurations(godotExecutablePath),
	};
}

export function createDebugConfigurationsArray(godotExecutablePath: string | undefined): vscode.DebugConfiguration[]
{
	const configurations = _createDebugConfigurations(godotExecutablePath);

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

function _createDebugConfigurations(godotExecutablePath: string | undefined): vscode.DebugConfiguration[]
{
	return [
		createPlayInEditorDebugConfiguration(),
		createLaunchDebugConfiguration(godotExecutablePath),
		createLaunchDebugConfiguration(godotExecutablePath, true),
		createAttachDebugConfiguration(),
	];
}

export function createPlayInEditorDebugConfiguration(): vscode.DebugConfiguration
{
	return {
		name: 'Play in Editor',
		type: 'godot-mono',
		mode: 'playInEditor',
		request: 'launch',
	};
}

export function createLaunchDebugConfiguration(godotExecutablePath: string | undefined, canSelectScene: boolean = false): vscode.DebugConfiguration
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
			...(canSelectScene ? ['${command:SelectLaunchScene}'] : []),
		],
	};
}

export function createAttachDebugConfiguration()
{
	return {
		name: 'Attach',
		type: 'godot-mono',
		request: 'attach',
		address: 'localhost',
		port: 23685,
	};
}

export async function addLaunchJsonIfNecessary(launchJsonPath: string): Promise<void>
{
	const godotExecutablePath = await findGodotExecutablePath();
	const launchConfiguration = createLaunchConfiguration(godotExecutablePath);

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
