import * as vscode from 'vscode';
import * as os from 'os';
import * as jsonc from 'jsonc-parser';
import { FormattingOptions, ModificationOptions } from 'jsonc-parser';

export function getFormattingOptions(): FormattingOptions {
    const editorConfig = vscode.workspace.getConfiguration('editor');

    const tabSize = editorConfig.get<number>('tabSize') ?? 4;
    const insertSpaces = editorConfig.get<boolean>('insertSpaces') ?? true;

    const filesConfig = vscode.workspace.getConfiguration('files');
    const eolSetting = filesConfig.get<string>('eol');
    const eol = !eolSetting || eolSetting === 'auto' ? os.EOL : '\n';

    const formattingOptions: FormattingOptions = {
        insertSpaces: insertSpaces,
        tabSize: tabSize,
        eol: eol,
    };

    return formattingOptions;
}

export function replaceCommentPropertiesWithComments(text: string): string {
    // replacing dummy properties OS-COMMENT with the normal comment syntax
    const regex = /["']OS-COMMENT\d*["']\s*\:\s*["'](.*)["']\s*?,/gi;
    const withComments = text.replace(regex, '// $1');

    return withComments;
}

export function updateJsonWithComments(text: string, replacements: any[], nodeName: string, keyName: string, formattingOptions: FormattingOptions) : string {
    const modificationOptions : ModificationOptions = {
        formattingOptions
    };

    // parse using jsonc because there are comments
    // only use this to determine what to change
    // we will modify it as text to keep existing comments
    const parsed = jsonc.parse(text);
    const items = parsed[nodeName];
    const itemKeys : string[] = items.map((i: { [x: string]: string; }) => i[keyName]);

    let modified = text;
    // count how many items we inserted to ensure we are putting items at the end
    // in the same order as they are in the replacements array
    let insertCount = 0;
    replacements.map((replacement: { [x: string]: string; }) => {
        const index = itemKeys.indexOf(replacement[keyName]);

        const found = index >= 0;
        const modificationIndex = found ? index : items.length + insertCount++;
        const edits = jsonc.modify(modified, [nodeName, modificationIndex], replacement, modificationOptions);
        const updated = jsonc.applyEdits(modified, edits);

        // we need to carry out the changes one by one, because we are inserting into the json
        // and so we cannot just figure out all the edits from the original text, instead we need to apply
        // changes one by one
        modified = updated;
    });

    return replaceCommentPropertiesWithComments(modified);
}
