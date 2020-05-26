import * as vscode from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Client, Peer, MessageContent, MessageStatus, ILogger, IMessageHandler } from './godot-tools-messaging/client';
import * as completion_provider from './completion-provider';
import { fixPathForGodot } from './godot-utils';
import * as path from 'path';
import * as fs from 'fs';

let client: Client;

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

export function activate(context: vscode.ExtensionContext) {
	let godotProjectDir = vscode.workspace.workspaceFolders?.find((workspaceFolder) => {
		let rootPath = workspaceFolder.uri.fsPath;
		let godotProjectFile = path.join(rootPath, 'project.godot');

		return fs.existsSync(godotProjectFile);
	})?.uri.fsPath;

	if (godotProjectDir === undefined) {
		return;
	}

	godotProjectDir = fixPathForGodot(godotProjectDir);

	client = new Client('VisualStudioCode', godotProjectDir, new MessageHandler(), new Logger());
	client.start();

	const debugConfigProvider = vscode.debug.registerDebugConfigurationProvider(
		'godot-mono',
		new GodotMonoDebugConfigProvider()
	);

	// There's no way to extend OmniSharp without having to provide our own language server.
	// That will be a big task so for now we will provide this basic completion provider.
	const codeCompletionProvider = vscode.languages.registerCompletionItemProvider(
		'csharp', new completion_provider.GodotCompletionProvider(client),
		// Trigger characters
		'(', '"', ',', ' '
	);

	context.subscriptions.push(
		debugConfigProvider,
		codeCompletionProvider
	);
}

export function deactivate() {
	client.dispose();
}

class GodotMonoDebugConfigProvider implements vscode.DebugConfigurationProvider {
	public async resolveDebugConfiguration(
		folder: vscode.WorkspaceFolder | undefined,
		debugConfiguration: vscode.DebugConfiguration,
		token?: vscode.CancellationToken
	): Promise<vscode.DebugConfiguration | undefined> {
		if (!debugConfiguration.__exceptionOptions) {
			debugConfiguration.__exceptionOptions = convertToExceptionOptions(getModel());
		}

		if (folder !== undefined) {
			debugConfiguration['godotProjectDir'] = folder.uri.fsPath;
		}

		return debugConfiguration;
	}
}

// Too lazy so we're re-using mono-debug extension settings for now...
const configuration = vscode.workspace.getConfiguration('mono-debug');

type ExceptionConfigurations = { [exception: string]: DebugProtocol.ExceptionBreakMode; };

const DEFAULT_EXCEPTIONS: ExceptionConfigurations = {
	'System.Exception': 'never',
	'System.SystemException': 'never',
	'System.ArithmeticException': 'never',
	'System.ArrayTypeMismatchException': 'never',
	'System.DivideByZeroException': 'never',
	'System.IndexOutOfRangeException': 'never',
	'System.InvalidCastException': 'never',
	'System.NullReferenceException': 'never',
	'System.OutOfMemoryException': 'never',
	'System.OverflowException': 'never',
	'System.StackOverflowException': 'never',
	'System.TypeInitializationException': 'never'
};

function getModel(): ExceptionConfigurations {
	let model = DEFAULT_EXCEPTIONS;
	if (configuration) {
		const exceptionOptions = configuration.get('exceptionOptions');
		if (exceptionOptions) {
			model = <ExceptionConfigurations>exceptionOptions;
		}
	}
	return model;
}

function convertToExceptionOptions(model: ExceptionConfigurations): DebugProtocol.ExceptionOptions[] {
	const exceptionItems: DebugProtocol.ExceptionOptions[] = [];
	for (let exception in model) {
		exceptionItems.push({
			path: [{ names: [exception] }],
			breakMode: model[exception]
		});
	}
	return exceptionItems;
}
