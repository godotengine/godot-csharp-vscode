import * as vscode from 'vscode';
import { DebugProtocol } from 'vscode-debugprotocol';

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

export class Configuration {
	public static Value: Configuration = new Configuration();

	public exceptionOptions: ExceptionConfigurations = DEFAULT_EXCEPTIONS;

	public get exceptionOptionsForDebug(): DebugProtocol.ExceptionOptions[] {
		return this.convertToExceptionOptions(this.exceptionOptions);
	}

	private constructor(){
		this.read();
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('mono-debug'))
			{
				this.read();
			}
		});
	}

	public read()
	{
		// Too lazy so we're re-using mono-debug extension settings for now...
		const monoConfiguration = vscode.workspace.getConfiguration('mono-debug');

		this.exceptionOptions = monoConfiguration.get('exceptionOptions', DEFAULT_EXCEPTIONS);
	}

	private convertToExceptionOptions(model: ExceptionConfigurations): DebugProtocol.ExceptionOptions[] {
		const exceptionItems: DebugProtocol.ExceptionOptions[] = [];
		for (let exception in model) {
			exceptionItems.push({
				path: [{ names: [exception] }],
				breakMode: model[exception],
			});
		}
		return exceptionItems;
	}
}
