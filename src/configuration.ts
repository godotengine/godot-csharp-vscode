import * as vscode from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol';

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
	'System.TypeInitializationException': 'never',
};

export function getModel(): ExceptionConfigurations {
	let model = DEFAULT_EXCEPTIONS;
	if (configuration) {
		const exceptionOptions = configuration.get('exceptionOptions');
		if (exceptionOptions) {
			model = <ExceptionConfigurations>exceptionOptions;
		}
	}
	return model;
}

export function convertToExceptionOptions(model: ExceptionConfigurations): DebugProtocol.ExceptionOptions[] {
	const exceptionItems: DebugProtocol.ExceptionOptions[] = [];
	for (let exception in model) {
		exceptionItems.push({
			path: [{ names: [exception] }],
			breakMode: model[exception],
		});
	}
	return exceptionItems;
}
