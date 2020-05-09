using System.Threading.Tasks;
using GodotTools.IdeMessaging;
using GodotTools.IdeMessaging.Requests;

namespace GodotDebugSession
{
    public class GodotMessageHandler : ClientMessageHandler
    {
        protected override Task<Response> HandleOpenFile(OpenFileRequest request)
        {
            return Task.FromResult<Response>(new OpenFileResponse {Status = MessageStatus.RequestNotSupported});
        }
    }
}
