import * as vscode from 'vscode';
import { Client, MessageStatus } from './godot-tools-messaging/client';

enum CompletionKind {
    InputActions = 0,
    NodePaths,
    ResourcePaths,
    ScenePaths,
    ShaderParams,
    Signals,
    ThemeColors,
    ThemeConstants,
    ThemeFonts,
    ThemeStyles
}

const qualifiedNameRegex = /(?:((?!\d)\w+(?:[\n\r\s]*\.[\n\r\s]*(?!\d)\w+)*)[\n\r\s]*\.[\n\r\s]*)?((?!\d)\w+)/;
const genericPartRegex = new RegExp('(?:[\\n\\r\\s]*<[\\n\\r\\s]*' + qualifiedNameRegex.source + '[\\n\\r\\s]*>)?');

const getNodeRegex = new RegExp(/\bGetNode/.source + genericPartRegex.source + /[\n\r\s]*\([\n\r\s]*(?<withQuote>"(?<partialString>\w*))?$/.source);
const inputActionRegex = /\b(IsActionPressed|IsActionJustPressed|IsActionJustReleased|GetActionStrength|ActionPress|ActionRelease)[\n\r\s]*\([\n\r\s]*(?<withQuote>"(?<partialString>\w*))?$/;
const resourcePathRegex = new RegExp(/\b(GD[\n\r\s]*\.[\n\r\s]*Load|ResourceLoader[\n\r\s]*\.[\n\r\s]*Load)/.source + genericPartRegex.source + /[\n\r\s]*\([\n\r\s]*(?<withQuote>"(?<partialString>\w*))?/.source);
const scenePathRegex = /\bChangeScene[\n\r\s]*\([\n\r\s]*(?<withQuote>"(?<partialString>\w*))?/;
const signalsRegex = /\b(Connect|Disconnect|IsConnected|EmitSignal)[\n\r\s]*\([\n\r\s]*(?<withQuote>"(?<partialString>\w*))?$/;
const toSignalRegex = new RegExp(/\bToSignal[\n\r\s]*\([\n\r\s]*/.source + qualifiedNameRegex.source + /[\n\r\s]*,[\n\r\s]*(?<withQuote>"(?<partialString>\w*))?$/.source);

export class GodotCompletionProvider implements vscode.CompletionItemProvider {
    client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    getPrefixLines(document: vscode.TextDocument, position: vscode.Position): [string, number] {
        let result: string = '';
        if (position.line > 1) {
            result += document.lineAt(position.line - 2).text + '\n';
        }
        if (position.line > 0) {
            result += document.lineAt(position.line - 1).text + '\n';
        }
        let extraLength = result.length;
        result += document.lineAt(position.line).text;
        return [result, extraLength + position.character];
    }

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        if (!this.client.isConnected() || (!this.client.peer?.isConnected ?? false)) {
            return undefined;
        }

        let filePath = document.uri.fsPath;

        let [lines, character] = this.getPrefixLines(document, position);
        let linePrefix = lines.substr(0, character);
        let lineSuffix = lines.substr(character);

        let genericStringItemImpl = (regexes: RegExp[] | RegExp, completionKind: CompletionKind) =>
            this.genericStringItemImpl(regexes, completionKind, filePath, token, context, linePrefix, lineSuffix);

        return genericStringItemImpl(getNodeRegex, CompletionKind.NodePaths) ||
            genericStringItemImpl(inputActionRegex, CompletionKind.InputActions) ||
            genericStringItemImpl(resourcePathRegex, CompletionKind.ResourcePaths) ||
            genericStringItemImpl(scenePathRegex, CompletionKind.ScenePaths) ||
            genericStringItemImpl([signalsRegex, toSignalRegex], CompletionKind.Signals) ||
            undefined;
    }

    genericStringItemImpl(regexes: RegExp[] | RegExp, completionKind: CompletionKind, filePath: string,
        token: vscode.CancellationToken, context: vscode.CompletionContext,
        linePrefix: string, lineSuffix: string): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        let isMatch = false;
        let startsWithQuote = false;
        let endsWithQuote = false;
        let partialString = '';

        let match;

        if (regexes instanceof RegExp) {
            regexes = [regexes];
        }

        for (let regex in regexes) {
            if ((match = linePrefix.match(regexes[regex]))) {
                isMatch = true;
                if (match.groups?.withQuote !== undefined) {
                    startsWithQuote = true;
                    endsWithQuote = lineSuffix.startsWith('"');
                    partialString = match.groups.partialString || '';
                }
                break;
            }
        }

        if (isMatch) {
            return new Promise(async (resolve, reject) => {
                let request = {
                    Kind: completionKind as number,
                    ScriptFile: filePath
                };

                const response = await this.client.peer?.sendRequest('CodeCompletion', JSON.stringify(request));

                if (response === undefined || response.status !== MessageStatus.Ok) {
                    if (response) {
                        console.error(`Code completion request failed with status: ${response?.status}`);
                    } else {
                        console.error('Code completion request failed');
                    }
                    reject();
                    return;
                }

                let responseObj = JSON.parse(response.body);
                let suggestions: string[] = responseObj.Suggestions;

                let tweak = (str: string) => {
                    if (startsWithQuote && str.startsWith('"')) {
                        return str.substr(1, str.length - (endsWithQuote ? 2 : 1));
                    }
                    return str;
                };

                resolve(suggestions.filter(suggestion => suggestion.startsWith('"' + partialString)).map(suggestion => {
                    let item = new vscode.CompletionItem(suggestion, vscode.CompletionItemKind.Value);
                    item.insertText = tweak(suggestion);
                    return item;
                }));
            });
        }

        return undefined;
    }
}
