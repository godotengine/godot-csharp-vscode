using System;
using System.IO;
using System.Text;

namespace GodotDebugSession
{
    public class ActionTextWriter : TextWriter
    {
        private readonly StringBuilder buffer = new StringBuilder();

        private Action<string> Writer { get; }

        public ActionTextWriter(Action<string> writer)
        {
            Writer = writer;
        }

        public override Encoding Encoding => Encoding.UTF8;

        public override void Write(char value)
        {
            if (value == '\n')
            {
                Writer(buffer.ToString());
                buffer.Clear();
                return;
            }

            buffer.Append(value);
        }
    }
}
