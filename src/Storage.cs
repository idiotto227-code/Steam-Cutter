using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace SteamCutter
{
    sealed class Export
    {
        public string Path, Name, Mode;
        public string[] Parts;
    }

    sealed class Storage : IDisposable
    {
        public static readonly string Local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SteamCutter");
        static readonly string Home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "SteamCutter");
        static readonly HashSet<string> Extensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".gif", ".png", ".jpg", ".jpeg", ".webp", ".apng" };
        readonly Dictionary<string, Export> pending = new Dictionary<string, Export>(), results = new Dictionary<string, Export>();
        sealed class Media { public string File; public byte[] Bytes; }
        readonly Dictionary<string, Media> media = new Dictionary<string, Media>();
        public string Output { get; private set; } = Path.Combine(Home, "Exports");
        public string Inbox => Path.Combine(Home, "Inbox");
        readonly string preference = Path.Combine(Local, "output.txt");
        readonly HttpClient client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false, AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate });
        const int MaxInput = 32 * 1024 * 1024;
        public Storage()
        {
            try
            {
                if (File.Exists(preference)) Output = Path.GetFullPath(File.ReadAllText(preference));
                else {
                    var old = Path.Combine(Environment.GetEnvironmentVariable("STEAMCUTTER_LAUNCH_DIR") ?? AppDomain.CurrentDomain.BaseDirectory, "steam_cutter_config.json");
                    if (File.Exists(old)) {
                        var cfg = new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(old));
                        if (cfg.TryGetValue("save_dir", out var dir) && Directory.Exists(dir as string)) Output = Path.GetFullPath((string)dir);
                    }
                }
            } catch (Exception) { /* Keep the default when an older preference is unreadable. */ }
        }
        public void SetOutput(string folder) { Directory.CreateDirectory(Local); File.WriteAllText(preference, folder); Output = folder; }
        public object[] ListInbox()
        {
            Directory.CreateDirectory(Inbox);
            return Directory.EnumerateFiles(Inbox).Where(p => Extensions.Contains(Path.GetExtension(p)))
                .OrderBy(p => p, StringComparer.CurrentCultureIgnoreCase)
                .Select(p => Register(Path.GetFileName(p), new Media { File = p }, new FileInfo(p).Length)).ToArray();
        }
        object Register(string name, Media item, long size)
        {
            var token = Guid.NewGuid().ToString("N"); media[token] = item;
            return new { kind = "image", name, token, size };
        }
        public Stream OpenMedia(string token)
        {
            if (!media.TryGetValue(token, out var m)) return null;
            if (m.Bytes != null) return new MemoryStream(m.Bytes, false);
            try { return new FileInfo(m.File).Length <= MaxInput ? File.OpenRead(m.File) : null; }
            catch (IOException) { return null; }
            catch (UnauthorizedAccessException) { return null; }
        }
        public void Release(string token) { media.Remove(token); }
        static bool PublicAddress(IPAddress address)
        {
            if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
            var b = address.GetAddressBytes();
            if (address.AddressFamily == AddressFamily.InterNetworkV6) return (b[0] & 0xe0) == 0x20;
            return b[0] != 0 && b[0] != 10 && b[0] != 127 && b[0] < 224 && !(b[0] == 169 && b[1] == 254)
                && !(b[0] == 172 && b[1] >= 16 && b[1] <= 31) && !(b[0] == 192 && b[1] == 168)
                && !(b[0] == 100 && b[1] >= 64 && b[1] <= 127) && !(b[0] == 198 && (b[1] == 18 || b[1] == 19));
        }
        public async Task<object> ImportUrl(string input)
        {
            if (!Uri.TryCreate(input, UriKind.Absolute, out var uri)) throw new InvalidDataException("urlInvalid");
            using (var timer = new CancellationTokenSource(TimeSpan.FromSeconds(45)))
            for (int step = 0; step < 6; step++) {
                if ((uri.Scheme != "http" && uri.Scheme != "https") || uri.UserInfo.Length != 0 || !uri.IsDefaultPort || uri.IsLoopback)
                    throw new InvalidDataException("urlInvalid");
                var addresses = await Dns.GetHostAddressesAsync(uri.DnsSafeHost);
                if (addresses.Length == 0 || addresses.Any(a => !PublicAddress(a))) throw new InvalidDataException("urlInvalid");
                using (var request = new HttpRequestMessage(HttpMethod.Get, uri)) {
                    request.Headers.UserAgent.ParseAdd("SteamCutter/5.0");
                    using (var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timer.Token)) {
                        int status = (int)response.StatusCode;
                        if (status >= 300 && status < 400 && response.Headers.Location != null) { uri = new Uri(uri, response.Headers.Location); continue; }
                        response.EnsureSuccessStatusCode();
                        var headers = response.Content.Headers;
                        var type = headers.ContentType?.MediaType ?? "";
                        bool html = type == "text/html" || type == "application/xhtml+xml";
                        int limit = html ? 1024 * 1024 : MaxInput;
                        if (headers.ContentLength > limit) throw new InvalidDataException("tooBig");
                        using (var stream = await response.Content.ReadAsStreamAsync())
                        using (var data = new MemoryStream()) {
                            var buffer = new byte[65536]; int n;
                            while ((n = await stream.ReadAsync(buffer, 0, buffer.Length, timer.Token)) > 0) {
                                if (data.Length + n > limit) throw new InvalidDataException("tooBig");
                                data.Write(buffer, 0, n);
                            }
                            if (html) {
                                var encoding = Encoding.UTF8;
                                try { if (headers.ContentType.CharSet != null) encoding = Encoding.GetEncoding(headers.ContentType.CharSet.Trim('"')); } catch (ArgumentException) { }
                                return new { kind = "html", url = uri.AbsoluteUri, html = encoding.GetString(data.ToArray()) };
                            }
                            var name = Path.GetFileName(Uri.UnescapeDataString(uri.AbsolutePath));
                            return Register(string.IsNullOrWhiteSpace(name) ? "Image" : name, new Media { Bytes = data.ToArray() }, data.Length);
                        }
                    }
                }
            }
            throw new InvalidDataException("urlInvalid");
        }
        public string Begin(string name, string mode)
        {
            if (mode != "workshop" && mode != "artwork") throw new InvalidDataException("layout");
            name = new string(Path.GetFileNameWithoutExtension(name).Select(c => char.IsControl(c) || Path.GetInvalidFileNameChars().Contains(c) ? '_' : c).Take(65).ToArray()).Trim(' ', '.');
            if (name.Length == 0) name = "Image";
            string token = Guid.NewGuid().ToString("N"), path = Path.Combine(Output, ".partial-" + token);
            Directory.CreateDirectory(path);
            pending[token] = new Export { Path = path, Name = name, Mode = mode, Parts = new string[mode == "workshop" ? 5 : 2] };
            return token;
        }
        public async Task Write(string job, int index, string ext, string encoded)
        {
            var item = pending[job];
            if (index < 0 || index >= item.Parts.Length || (ext != "png" && ext != "gif")) throw new InvalidDataException();
            string name = item.Mode == "workshop" ? "part_" + (index + 1) : index == 0 ? "01_center_506" : "02_side_100";
            var bytes = Convert.FromBase64String(encoded);
            if (bytes.Length == 0 || bytes.Length > 5000000) throw new InvalidDataException("tooBig");
            name += "." + ext;
            using (var stream = new FileStream(Path.Combine(item.Path, name), FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true))
                await stream.WriteAsync(bytes, 0, bytes.Length);
            item.Parts[index] = name;
        }
        public string Finish(string token)
        {
            var item = pending[token];
            if (item.Parts.Any(string.IsNullOrEmpty)) throw new InvalidDataException("Incomplete export.");
            var stem = Path.Combine(Path.GetDirectoryName(item.Path), item.Name + " - " + item.Mode);
            for (int i = 1; ; i++) {
                var path = i == 1 ? stem : stem + " (" + i + ")";
                try { Directory.Move(item.Path, path); }
                catch (IOException) when (Directory.Exists(path) || File.Exists(path)) { continue; }
                item.Path = path; pending.Remove(token); results[token] = item; return path;
            }
        }
        public Export Result(string token) => results[token];
        public void Abort(string token)
        {
            if (!pending.TryGetValue(token, out var item)) return;
            try { Directory.Delete(item.Path, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
            pending.Remove(token);
        }
        public void Dispose() { foreach (var token in pending.Keys.ToList()) Abort(token); client.Dispose(); media.Clear(); }
    }
}
