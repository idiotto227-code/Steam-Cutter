using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Windows.Forms;

namespace SteamCutter.Launcher
{
    static class Program
    {
        [STAThread] static void Main()
        {
            try
            {
                using (var payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("studio.payload"))
                using (var sha = SHA256.Create())
                {
                    var hash = BitConverter.ToString(sha.ComputeHash(payload)).Replace("-", "");
                    var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SteamCutter", "Versions");
                    Directory.CreateDirectory(root);
                    var destination = Path.Combine(root, hash);
                    if (!Directory.Exists(destination))
                    {
                        var stage = Path.Combine(root, ".install-" + Guid.NewGuid().ToString("N"));
                        Directory.CreateDirectory(stage);
                        try
                        {
                            payload.Position = 0;
                            using (var zip = new ZipArchive(payload, ZipArchiveMode.Read, true))
                            foreach (var entry in zip.Entries)
                            {
                                var file = Path.GetFullPath(Path.Combine(stage, entry.FullName));
                                if (!file.StartsWith(stage + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException();
                                Directory.CreateDirectory(Path.GetDirectoryName(file));
                                using (var input = entry.Open())
                                using (var output = File.Create(file)) input.CopyTo(output);
                            }
                            try { Directory.Move(stage, destination); }
                            catch (IOException) when (Directory.Exists(destination)) { }
                        }
                        finally { if (Directory.Exists(stage)) Directory.Delete(stage, true); }
                    }
                    var exe = Path.Combine(destination, "Steam Cutter.exe");
                    var start = new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = destination };
                    start.EnvironmentVariables["STEAMCUTTER_LAUNCH_DIR"] = AppDomain.CurrentDomain.BaseDirectory;
                    Process.Start(start);
                }
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Steam Cutter", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        }
    }
}
