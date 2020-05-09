using System;

namespace VSCodeDebug
{
	// Placeholder for VSCodeDebug.Program in vscode-mono-debug
	static class Program
	{
		public static void Log(bool predicate, string format, params object[] data)
		{
			if (predicate)
				Log(format, data);
		}

		public static void Log(string format, params object[] data)
		{
			Console.Error.WriteLine(format, data);
		}
	}
}
