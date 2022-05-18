using System;
using System.Diagnostics;
using System.Net.Sockets;
using System.Net;
using System.Threading.Tasks;
using GodotTools.IdeMessaging.Requests;
using Medallion.Shell;
using Mono.Debugging.Client;
using Mono.Debugging.Soft;
using System.Collections.Generic;

namespace GodotDebugSession
{
    public class GodotDebuggerSession : SoftDebuggerSession
    {
        private bool _attached;
        private NetworkStream _godotRemoteDebuggerStream;

        private class GodotMessagingLogger : GodotTools.IdeMessaging.ILogger
        {
            public void LogDebug(string message) => Logger.Log(message);

            public void LogInfo(string message) => Logger.Log(message);

            public void LogWarning(string message) => Logger.Log(message);

            public void LogError(string message) => Logger.LogError(message);

            public void LogError(string message, Exception e) => Logger.LogError(message, e);
        }

        protected override async void OnRun(DebuggerStartInfo startInfo)
        {
            var godotStartInfo = (GodotDebuggerStartInfo)startInfo;

            switch (godotStartInfo.ExecutionType)
            {
                case ExecutionType.PlayInEditor:
                {
                    try
                    {
                        _attached = false;
                        StartListening(godotStartInfo, out var assignedDebugPort);

                        string host = "127.0.0.1";
                        string godotProjectDir = startInfo.WorkingDirectory;

                        using (var messagingClient = new GodotTools.IdeMessaging.Client(
                            identity: "VSCodeGodotDebugSession", godotProjectDir,
                            new GodotMessageHandler(), new GodotMessagingLogger()))
                        {
                            messagingClient.Start();
                            await messagingClient.AwaitConnected();
                            var response = await messagingClient.SendRequest<DebugPlayResponse>(
                                new DebugPlayRequest { DebuggerHost = host, DebuggerPort = assignedDebugPort });

                            if (response.Status != GodotTools.IdeMessaging.MessageStatus.Ok)
                            {
                                Logger.Log("Debug play request failed.");
                                Exit();
                                // ReSharper disable once RedundantJumpStatement
                                return;
                            }
                        }

                        // TODO: Read the editor player stdout and stderr somehow
                    }
                    catch (Exception e)
                    {
                        Logger.LogError(e);
                    }

                    break;
                }
                case ExecutionType.Launch:
                {
                    try
                    {
                        _attached = false;
                        StartListening(godotStartInfo, out var assignedDebugPort);

                        // Listener to replace the Godot editor remote debugger.
                        // We use it to notify the game when assemblies should be reloaded.
                        var remoteDebugListener = new TcpListener(IPAddress.Any, 0);
                        remoteDebugListener.Start();
                        _ = remoteDebugListener.AcceptTcpClientAsync().ContinueWith(OnGodotRemoteDebuggerConnected);

                        string workingDir = startInfo.WorkingDirectory;
                        string host = "127.0.0.1";
                        int remoteDebugPort = ((IPEndPoint)remoteDebugListener.LocalEndpoint).Port;

                        // Construct the --remote-debug parameter for the found version of Godot

                        var versionCommand = Command.Run(godotStartInfo.GodotExecutablePath, new[] { "--version" }).Result;
                        string versionOutput = versionCommand.StandardOutput;
                        int versionFirstDot = versionOutput.IndexOf('.');
                        if (versionFirstDot == -1 || !int.TryParse(versionOutput.Substring(0, versionFirstDot), out int versionMajor))
                        {
                            Logger.Log($"Godot launch request failed: Godot version unrecognized: {versionOutput}.");
                            Exit();
                            return;
                        }
                        string remoteDebugAddress = versionMajor >= 4 ? $"tcp://{host}:{remoteDebugPort}" : $"{host}:{remoteDebugPort}";

                        // Launch Godot to run the game and connect to our remote debugger

                        var args = new List<string>()
                        {
                            "--path", workingDir,
                            "--remote-debug", remoteDebugAddress,
                        };
                        args.AddRange(godotStartInfo.ExecutableArguments);

                        var process = Command.Run(godotStartInfo.GodotExecutablePath, args, options =>
                        {
                            options.WorkingDirectory(workingDir);
                            options.ThrowOnError(true);

                            // Tells Godot to connect to the mono debugger we just started
                            options.EnvironmentVariable("GODOT_MONO_DEBUGGER_AGENT",
                                    "--debugger-agent=transport=dt_socket" +
                                    $",address={host}:{assignedDebugPort}" +
                                    ",server=n");
                        })
                            .RedirectTo(godotStartInfo.ProcessOutputListener.GetStdOutTextWriter())
                            .RedirectStandardErrorTo(godotStartInfo.ProcessOutputListener.GetStdErrTextWriter());

                        try
                        {
                            await process.Task;
                        }
                        catch (Exception e)
                        {
                            Logger.Log($"Godot launch request failed: {e.Message}.");
                            Exit();
                            return;
                        }

                        OnDebuggerOutput(false, $"Godot PID:{process.ProcessId}{Environment.NewLine}");
                    }
                    catch (Exception e)
                    {
                        Logger.LogError(e);
                    }

                    break;
                }
                case ExecutionType.Attach:
                {
                    _attached = true;
                    StartConnecting(godotStartInfo);
                    break;
                }
                default:
                    throw new NotImplementedException(godotStartInfo.ExecutionType.ToString());
            }
        }

        private async Task OnGodotRemoteDebuggerConnected(Task<TcpClient> task)
        {
            var tcpClient = task.Result;
            _godotRemoteDebuggerStream = tcpClient.GetStream();
            byte[] buffer = new byte[1000];
            while (tcpClient.Connected)
            {
                // There is no library to decode this messages, so
                // we just pump buffer so it doesn't go out of memory
                var readBytes = await _godotRemoteDebuggerStream.ReadAsync(buffer, 0, buffer.Length);
            }
        }

        protected override void OnExit()
        {
            if (_attached)
                base.OnDetach();
            else
                base.OnExit();
        }
    }
}
