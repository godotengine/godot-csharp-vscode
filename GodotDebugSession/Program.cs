using System;

namespace GodotDebugSession
{
    static class Program
    {
        static void Main()
        {
            try
            {
                Logger.Log("GodotDebugSession: Starting debug session...");

                new GodotDebugSession()
                    .Start(Console.OpenStandardInput(), Console.OpenStandardOutput())
                    .Wait();

                Logger.Log("GodotDebugSession: Debug session terminated.");
            }
            catch (Exception ex)
            {
                Logger.LogError(ex);
            }
            finally
            {
                Logger.Close();
            }
        }
    }
}
