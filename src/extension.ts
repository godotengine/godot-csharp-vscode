import * as vscode from 'vscode';
import { Client, Peer, MessageContent, MessageStatus, ILogger, IMessageHandler } from './godot-tools-messaging/client';
import * as completion_provider from './completion-provider';
import * as debug_provider from './debug-provider';
import * as assets_provider from './assets-provider';
import { getWorkspaceScenes } from './workspace-utils';
import { fixPathForGodot, determineGodotVersion, GODOT_VERSION_3 } from './godot-utils';
import { findProjectFiles, ProjectLocation, promptForProject } from './project-select';

export let client: Client;
let codeCompletionProvider: vscode.Disposable;
let debugConfigProvider: vscode.Disposable;
let statusBarItem: vscode.StatusBarItem;

class Logger implements ILogger {
	logDebug(message: string): void {
		console.debug(message);
	}
	logInfo(message: string): void {
		console.info(message);
	}
	logWarning(message: string): void {
		console.warn(message);
	}
	logError(message: string): void;
	logError(message: string, e: Error): void;
	logError(message: any, e?: any) {
		console.error(message, e);
	}
}

type RequestHandler = (peer: Peer, content: MessageContent) => Promise<MessageContent>;

class MessageHandler implements IMessageHandler {
	requestHandlers = new Map<string, RequestHandler>();

	constructor() {
		this.requestHandlers.set('OpenFile', this.handleOpenFile);
	}

	async handleRequest(peer: Peer, id: string, content: MessageContent, logger: ILogger): Promise<MessageContent> {
		let handler = this.requestHandlers.get(id);
		if (handler === undefined) {
			logger.logError(`Received unknown request: ${id}`);
			return new MessageContent(MessageStatus.RequestNotSupported, 'null');
		}

		let response = await handler(peer, content);
		return new MessageContent(response.status, JSON.stringify(response));
	}

	async handleOpenFile(peer: Peer, content: MessageContent): Promise<MessageContent> {
		// Not used yet by Godot as it doesn't brind the VSCode window to foreground

		let request = JSON.parse(content.body);

		let file: string | undefined = request.File;
		let line: number | undefined = request.Line;
		let column: number | undefined = request.Column;

		if (file === undefined) {
			return new MessageContent(MessageStatus.InvalidRequestBody, 'null');
		}

		let openPath = vscode.Uri.parse(file);
		vscode.workspace.openTextDocument(openPath).then(doc => {
			vscode.window.showTextDocument(doc);

			if (line !== undefined) {
				line -= 1;

				if (column !== undefined) {
					column -= 1;
				}

				let editor = vscode.window.activeTextEditor;

				if (editor !== undefined) {
					const position = editor.selection.active;

					let newPosition = position.with(line, column);
					let range = new vscode.Range(newPosition, newPosition);
					editor.selection = new vscode.Selection(range.start, range.end);
					editor.revealRange(range);
				}
			}
		});

		return new MessageContent(MessageStatus.Ok, '{}');
	}
}

export async function activate(context: vscode.ExtensionContext) {
	const foundProjects: ProjectLocation[] = await findProjectFiles();
	// No project.godot files found. The extension doesn't need to do anything more.
	if (foundProjects.length === 0) {
		return;
	}

	// Setup the status bar / project selector and prompt for project if necessary
	const commandId = 'godot.csharp.selectProject';
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
	statusBarItem.command = commandId;
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);
	context.subscriptions.push(vscode.commands.registerCommand(commandId, async () => {
		const project = await promptForProject(); // project.godot
		if (project !== undefined) {
			await setupProject(project, context);
		}
	}));

	// One project.godot files found. Use it.
	if (foundProjects.length === 1) {
		await setupProject(foundProjects[0], context);
	}
	// Multiple project.godot files found. Prompt the user for which one they want to use.
	else {
		const project = await promptForProject();
		if (project !== undefined) {
			await setupProject(project, context);
		}
	}

	// Setup generate assets command
	const generateAssetsCommand = vscode.commands.registerCommand('godot.csharp.generateAssets', async () => {
		await assets_provider.addAssets(client.getGodotProjectDir());
	});
	context.subscriptions.push(generateAssetsCommand);

	// Setup get launch scene command
	const getLaunchSceneCommand = vscode.commands.registerCommand('godot.csharp.getLaunchScene', () => {
		return vscode.window.showQuickPick(getWorkspaceScenes(client?.getGodotProjectDir()));
	});
	context.subscriptions.push(getLaunchSceneCommand);
}

async function setupProject(project: ProjectLocation, context: vscode.ExtensionContext) {
	const statusBarPath: string = project.relativeProjectPath === '.' ? './' : project.relativeProjectPath;
	statusBarItem.text = `$(folder) Godot Project: ${statusBarPath}`;
	// Setup client
	if (client !== undefined) {
		client.dispose();
	}
	let godotVersion = await determineGodotVersion(project.absoluteProjectPath);
	if (!godotVersion) {
		// Fallback to Godot 3
		godotVersion = GODOT_VERSION_3;
	}
	client = new Client(
		'VisualStudioCode',
		fixPathForGodot(project.absoluteProjectPath),
		godotVersion,
		new MessageHandler(),
		new Logger(),
	);
	client.start();

	// Setup debug provider
	if (debugConfigProvider !== undefined) {
		debugConfigProvider.dispose();
	}
	debugConfigProvider = vscode.debug.registerDebugConfigurationProvider(
		'godot-mono',
		new debug_provider.GodotMonoDebugConfigProvider(project.absoluteProjectPath)
	);
	context.subscriptions.push(debugConfigProvider);

	// Setup completion provider
	// There's no way to extend OmniSharp without having to provide our own language server.
	// That will be a big task so for now we will provide this basic completion provider.
	if (codeCompletionProvider !== undefined) {
		codeCompletionProvider.dispose();
	}
	// Create client, create provider, register and subscribe provider
	codeCompletionProvider = vscode.languages.registerCompletionItemProvider(
		'csharp', new completion_provider.GodotCompletionProvider(client),
		// Trigger characters
		'(', '"', ',', ' '
	);
	context.subscriptions.push(codeCompletionProvider);
}

export function deactivate() {
	client.dispose();
}

