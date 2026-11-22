using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SteamCutter
{
    static class Program
    {
        [STAThread] static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            Application.Run(new Studio());
        }
    }

    sealed class Studio : Form
    {
        const string Origin = "https://studio.steamcutter.invalid";
        readonly WebView2 editor = new WebView2 { Dock = DockStyle.Fill };
        readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 8000000 };
        readonly Storage files = new Storage();
        CoreWebView2Environment environment;
        public Studio()
        {
            Text = "Steam Cutter"; BackColor = Color.FromArgb(12, 19, 25);
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            Size = new Size(1140, 790); MinimumSize = new Size(760, 600);
            StartPosition = FormStartPosition.CenterScreen; Controls.Add(editor);
            Shown += async (s, e) => await Start();
            FormClosed += (s, e) => files.Dispose();
        }
        async Task Start()
        {
            try
            {
                environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Storage.Local, "Browser"));
                await editor.EnsureCoreWebView2Async(environment);
                var core = editor.CoreWebView2;
                core.Settings.AreHostObjectsAllowed = false;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.SetVirtualHostNameToFolderMapping(new Uri(Origin).Host,
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ui"), CoreWebView2HostResourceAccessKind.DenyCors);
                core.NavigationStarting += (s, e) => e.Cancel = e.Uri != Origin + "/index.html";
                core.NewWindowRequested += (s, e) => e.Handled = true;
                core.PermissionRequested += (s, e) => e.State = CoreWebView2PermissionState.Deny;
                core.WebMessageReceived += Receive;
                core.Navigate(Origin + "/index.html");
            }
            catch (WebView2RuntimeNotFoundException)
            {
                if (MessageBox.Show("Для запуска нужен Microsoft Edge WebView2 Runtime. Открыть страницу установки Microsoft?\n\nMicrosoft Edge WebView2 Runtime is required. Open the installer page?",
                    Text, MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                    OpenShell("https://developer.microsoft.com/microsoft-edge/webview2/");
                Close();
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, Text); Close(); }
        }
        public static void OpenShell(string target) => Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
        async void Receive(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            if (args.Source != Origin + "/index.html") return;
            string id = "";
            try
            {
                var m = json.Deserialize<Dictionary<string, object>>(args.WebMessageAsJson);
                id = (string)m["id"];
                object value = await Dispatch((string)m["op"], m);
                Respond(new { id, value });
            }
            catch (Exception ex) { Respond(new { id, error = ex.Message }); }
        }
        void Respond(object message)
        {
            if (!IsDisposed && !editor.IsDisposed && editor.CoreWebView2 != null)
                editor.CoreWebView2.PostWebMessageAsJson(json.Serialize(message));
        }
        async Task<object> Dispatch(string op, Dictionary<string, object> m)
        {
            switch (op)
            {
                case "info": return new { output = files.Output, inbox = files.Inbox };
                case "inbox": return files.ListInbox();
                case "openInbox": Directory.CreateDirectory(files.Inbox); OpenShell(files.Inbox); break;
                case "chooseOutput":
                    using (var dlg = new FolderBrowserDialog { SelectedPath = files.Output })
                        if (dlg.ShowDialog(this) == DialogResult.OK) files.SetOutput(dlg.SelectedPath);
                    return files.Output;
                case "url": return await files.ImportUrl((string)m["url"]);
                case "readMedia": return await files.ReadMedia((string)m["token"], Convert.ToInt64(m["offset"]));
                case "releaseMedia": files.Release((string)m["token"]); break;
                case "begin": return files.Begin((string)m["name"], (string)m["mode"]);
                case "write":
                    await files.Write((string)m["job"], Convert.ToInt32(m["index"]), (string)m["ext"], (string)m["bytes"]);
                    break;
                case "finish": return files.Finish((string)m["job"]);
                case "abort": files.Abort((string)m["job"]); break;
                case "folder": OpenShell(files.Result((string)m["job"]).Path); break;
                case "steam":
                    var result = files.Result((string)m["job"]);
                    new SteamWindow(environment, result, (string)m["lang"]) { Icon = Icon }.Show(this);
                    break;
                default: throw new InvalidOperationException("Unknown action.");
            }
            return null;
        }
    }
}
