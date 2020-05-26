using System;
using System.IO;
using System.Reflection;
using System.Text;

namespace GodotDebugSession
{
    static class Logger
    {
        private static string ThisAppPath => Assembly.GetExecutingAssembly().Location;
        private static string ThisAppPathWithoutExtension => Path.ChangeExtension(ThisAppPath, null);

        private static readonly string LogPath = $"{ThisAppPathWithoutExtension}.log";
        internal static readonly string NewLogPath = $"{ThisAppPathWithoutExtension}.new.log";

        private static StreamWriter _writer;

        private static StreamWriter Writer =>
            _writer ?? (_writer = new StreamWriter(LogPath, append: true, Encoding.UTF8));

        private static void WriteLog(string message)
        {
            try
            {
                var writer = Writer;
                writer.WriteLine($"{DateTime.Now:HH:mm:ss.ffffff}: {message}");
                writer.Flush();
            }
            catch (IOException e)
            {
                Console.Error.WriteLine(e);
            }
        }

        public static void Log(string message) =>
            WriteLog(message);

        public static void LogError(string message) =>
            WriteLog(message);

        public static void LogError(string message, Exception ex) =>
            WriteLog($"{message}\n{ex}");

        public static void LogError(Exception ex) =>
            WriteLog(ex.ToString());

        public static void Close()
        {
            _writer?.Close();
            _writer = null;
        }
    }
}
