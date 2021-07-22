using System.IO;
using Mono.Debugging.Soft;

namespace GodotDebugSession
{
    public class GodotDebuggerStartInfo : SoftDebuggerStartInfo
    {
        public string GodotExecutablePath { get; }
        public string[] ExecutableArguments { get; }
        public ExecutionType ExecutionType { get; }
        public IProcessOutputListener ProcessOutputListener { get; }

        public GodotDebuggerStartInfo(ExecutionType executionType, string godotExecutablePath,
            string[] executableArguments, IProcessOutputListener processOutputListener,
            SoftDebuggerRemoteArgs softDebuggerConnectArgs) :
            base(softDebuggerConnectArgs)
        {
            ExecutionType = executionType;
            GodotExecutablePath = godotExecutablePath;
            ExecutableArguments = executableArguments;
            ProcessOutputListener = processOutputListener;
        }
    }

    public enum ExecutionType
    {
        PlayInEditor,
        Launch,
        Attach
    }

    public interface IProcessOutputListener
    {
        void ReceiveStdOut(string data);
        void ReceiveStdErr(string data);
    }

    public static class IProcessOutputListenerExtensions
    {
        public static TextWriter GetStdOutTextWriter(this IProcessOutputListener processOutputListener)
        {
            return new ActionTextWriter(processOutputListener.ReceiveStdOut);
        }

        public static TextWriter GetStdErrTextWriter(this IProcessOutputListener processOutputListener)
        {
            return new ActionTextWriter(processOutputListener.ReceiveStdErr);
        }
    }
}
