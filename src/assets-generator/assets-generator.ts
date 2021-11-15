import * as path from 'path';
import * as fs from 'fs-extra';
import {addTasksJsonIfNecessary} from './tasks';
import {addLaunchJsonIfNecessary} from './debug';
import {getVscodeFolder} from '../vscode-utils';

export class AssetsGenerator {
	public readonly vscodeFolder: string;
	public readonly tasksJsonPath: string;
	public readonly launchJsonPath: string;

	private constructor(vscodeFolder: string)
	{
		this.vscodeFolder = vscodeFolder;
		this.tasksJsonPath = path.join(vscodeFolder, 'tasks.json');
		this.launchJsonPath = path.join(vscodeFolder, 'launch.json');
	}

	public static Create(vscodeFolder: string): AssetsGenerator;
	public static Create(vscodeFolder: string | undefined = undefined): AssetsGenerator | undefined
	{
		vscodeFolder = vscodeFolder ?? getVscodeFolder();
		if (!vscodeFolder)
		{
			return undefined;
		}

		return new AssetsGenerator(vscodeFolder);
	}

	public async addTasksJsonIfNecessary(): Promise<void> {
		return addTasksJsonIfNecessary(this.tasksJsonPath);
	}

	public async addLaunchJsonIfNecessary(): Promise<void> {
		return addLaunchJsonIfNecessary(this.launchJsonPath);
	}

	public async hasExistingAssets(): Promise<boolean> {
		return (await fs.pathExists(this.tasksJsonPath)) || (await fs.pathExists(this.launchJsonPath));
	}
}
