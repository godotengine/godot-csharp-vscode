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

        private static StreamWriter NewWriter() => new StreamWriter(LogPath, append: true, Encoding.UTF8);

        private static void Log(StreamWriter writer, string message)
        {
            writer.WriteLine($"{DateTime.Now:HH:mm:ss.ffffff}: {message}");
        }

        public static void Log(string message)
        {
            using (var writer = NewWriter())
            {
                Log(writer, message);
            }
        }

        public static void LogError(string message)
        {
            using (var writer = NewWriter())
            {
                Log(writer, message);
            }
        }

        public static void LogError(string message, Exception ex)
        {
            using (var writer = NewWriter())
            {
                Log(writer, $"{message}\n{ex}");
            }
        }

        public static void LogError(Exception ex)
        {
            using (var writer = NewWriter())
            {
                Log(writer, ex.ToString());
            }
        }
    }
}
