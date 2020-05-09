using System;
using System.Net;
using Mono.Debugging.Client;
using Mono.Debugging.Soft;
using VSCodeDebug;

namespace GodotDebugSession
{
    public class GodotDebugSession : MonoDebugSession, IProcessOutputListener
    {
        public GodotDebugSession() : base(new GodotDebuggerSession(), new CustomLogger())
        {
        }

        public override void Launch(Response response, dynamic args)
        {
            ExecutionType executionType;

            string godotExecutablePath = getString(args, "executable");

            string mode = getString(args, "mode");
            if (string.IsNullOrEmpty(mode) || (mode != "playInEditor" && mode != "executable"))
            {
                executionType = !string.IsNullOrEmpty(godotExecutablePath) ?
                    ExecutionType.Launch :
                    ExecutionType.PlayInEditor;
            }
            else
            {
                executionType = mode == "playInEditor" ? ExecutionType.PlayInEditor : ExecutionType.Launch;
            }

            RunImpl(response, args, executionType);
        }

        public override void Attach(Response response, dynamic args)
        {
            RunImpl(response, args, ExecutionType.Attach);
        }

        private void RunImpl(Response response, dynamic args, ExecutionType executionType)
        {
            lock (_lock)
            {
                _attachMode = executionType == ExecutionType.Attach;

                SetExceptionBreakpoints(args.__exceptionOptions);

                SoftDebuggerRemoteArgs listenArgs;

                if (executionType == ExecutionType.Attach)
                {
                    // validate argument 'address'
                    string host = getString(args, "address");
                    if (host == null)
                    {
                        SendErrorResponse(response, 3007, "Property 'address' is missing or empty.");
                        return;
                    }

                    // validate argument 'port'
                    int port = getInt(args, "port", -1);
                    if (port == -1)
                    {
                        SendErrorResponse(response, 3008, "Property 'port' is missing.");
                        return;
                    }

                    IPAddress address = Utilities.ResolveIPAddress(host);
                    if (address == null)
                    {
                        SendErrorResponse(response, 3013, "Invalid address '{host}'.", new {host});
                        return;
                    }

                    listenArgs = new SoftDebuggerConnectArgs("Godot", IPAddress.Loopback, port);
                }
                else
                {
                    listenArgs = new SoftDebuggerListenArgs("Godot", IPAddress.Loopback, 0);
                }

                // ------

                _debuggeeKilled = false;

                string godotExecutablePath = (string)args.executable;

                string godotProjectDir = (string)args.godotProjectDir;

                var startInfo = new GodotDebuggerStartInfo(executionType, godotExecutablePath,
                    processOutputListener: this, listenArgs) {WorkingDirectory = godotProjectDir};

                _session.Run(startInfo, _debuggerSessionOptions);

                _debuggeeExecuting = true;
            }
        }

        private class CustomLogger : ICustomLogger
        {
            public void LogError(string message, Exception ex) => Logger.LogError(message, ex);

            public void LogAndShowException(string message, Exception ex) => LogError(message, ex);

            public void LogMessage(string messageFormat, params object[] args)
            {
                Logger.Log(string.Format(messageFormat, args));
            }

            public string GetNewDebuggerLogFilename() => Logger.NewLogPath;
        }

        public void ReceiveStdOut(string data)
        {
            if (data == null)
                _stdoutEOF = true;

            SendOutput("stdout", data);
        }

        public void ReceiveStdErr(string data)
        {
            if (data == null)
                _stdoutEOF = true;

            SendOutput("stderr", data);
        }
    }
}
