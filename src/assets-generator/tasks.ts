import * as tasks from 'vscode-tasks';
import * as jsonc from 'jsonc-parser';
import * as fs from 'fs-extra';
import {getFormattingOptions, replaceCommentPropertiesWithComments, updateJsonWithComments} from '../json-utils';
import {findGodotExecutablePath} from '../godot-utils';

export function createTasksConfiguration(godotExecutablePath: string | undefined): tasks.TaskConfiguration
{
	return {
		version: '2.0.0',
		tasks: [createBuildTaskDescription(godotExecutablePath)],
	};
}

export function createBuildTaskDescription(godotExecutablePath: string | undefined): tasks.TaskDescription
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

export async function addTasksJsonIfNecessary(tasksJsonPath: string): Promise<void>
{
	const godotExecutablePath = await findGodotExecutablePath();
	const tasksConfiguration = createTasksConfiguration(godotExecutablePath);

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
