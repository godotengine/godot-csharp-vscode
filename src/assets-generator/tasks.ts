import * as vscode from 'vscode';
import * as tasks from 'vscode-tasks';
import * as jsonc from 'jsonc-parser';
import * as fs from 'fs-extra';
import * as semver from 'semver';
import {getFormattingOptions, replaceCommentPropertiesWithComments, updateJsonWithComments} from '../json-utils';
import {findGodotExecutablePath, GODOT_VERSION_3, GODOT_VERSION_4} from '../godot-utils';

export function createTasksConfiguration(godotExecutablePath: string | undefined, godotVersion: string): tasks.TaskConfiguration
{
	return {
		version: '2.0.0',
		tasks: _createTasksConfiguration(godotExecutablePath, godotVersion),
	};
}

function _createTasksConfiguration(godotExecutablePath: string | undefined, godotVersion: string) : tasks.TaskDescription[] {	
	if (semver.intersects(godotVersion, GODOT_VERSION_3)) {
		return [
			createBuildTaskDescriptionForGodot3(godotExecutablePath),
		];
	} else if (semver.intersects(godotVersion, GODOT_VERSION_4)) {
		return [
			createBuildTaskDescriptionForGodot4(godotExecutablePath),
		];
	} else {
		vscode.window.showErrorMessage('Cannot create C# Godot tasks configurations. Godot version is unknown or unsupported.');
		return [];
	}
}

export function createBuildTaskDescriptionForGodot3(godotExecutablePath: string | undefined): tasks.TaskDescription
{
	godotExecutablePath = godotExecutablePath ?? '<insert-godot-executable-path-here>';
	return {
		label: 'build',
		command: godotExecutablePath,
		type: 'process',
		args: ['--build-solutions', '--path', '${workspaceRoot}', '--no-window', '--quit'],
		problemMatcher: '$msCompile',
	};
}

export function createBuildTaskDescriptionForGodot4(godotExecutablePath: string | undefined): tasks.TaskDescription
{
	godotExecutablePath = godotExecutablePath ?? '<insert-godot-executable-path-here>';
	return {
		label: 'build',
		command: godotExecutablePath,
		type: 'process',
		args: ['--build-solutions', '--path', '${workspaceRoot}', '--headless', '--quit'],
		problemMatcher: '$msCompile',
	};
}

export async function addTasksJsonIfNecessary(tasksJsonPath: string, godotVersion: string): Promise<void>
{
	const godotExecutablePath = await findGodotExecutablePath(godotVersion);
	const tasksConfiguration = createTasksConfiguration(godotExecutablePath, godotVersion);

	const formattingOptions = getFormattingOptions();

	let text: string;
	const exists = await fs.pathExists(tasksJsonPath);
	if (!exists) {
		// when tasks.json does not exist create it and write all the content directly
		const tasksJsonText = JSON.stringify(tasksConfiguration);
		const tasksJsonTextFormatted = jsonc.applyEdits(tasksJsonText, jsonc.format(tasksJsonText, undefined, formattingOptions));
		text = tasksJsonTextFormatted;
	} else {
		// when tasks.json exists just update the tasks node
		const ourConfigs = tasksConfiguration.tasks ?? [];
		const content = fs.readFileSync(tasksJsonPath).toString();
		const updatedJson = updateJsonWithComments(content, ourConfigs, 'tasks', 'label', formattingOptions);
		text = updatedJson;
	}

	const textWithComments = replaceCommentPropertiesWithComments(text);
	await fs.writeFile(tasksJsonPath, textWithComments);
}
