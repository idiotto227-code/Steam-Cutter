using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SteamCutter
{
    sealed class SteamWindow : Form
    {
        const string Artwork = "https://steamcommunity.com/sharedfiles/edititem/767/3/";
        const string Workshop = "https://steamcommunity.com/workshop/";
        readonly WebView2 web = new WebView2 { Dock = DockStyle.Fill };
        readonly Label address = new Label { Dock = DockStyle.Bottom, Height = 24, AutoEllipsis = true, Padding = new Padding(8, 3, 0, 0) };
        readonly ComboBox parts = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 155 };
        readonly string lang;
        string T(string ru, string uk, string en) => lang == "uk" ? uk : lang == "en" ? en : ru;
        public SteamWindow(CoreWebView2Environment env, Export export, string language)
        {
            lang = language; Text = "Steam Community  ·  Steam Cutter"; Size = new Size(1080, 850);
            MinimumSize = new Size(760, 540); StartPosition = FormStartPosition.CenterParent;
            var top = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Top, Padding = new Padding(7), WrapContents = true };
            var note = new Label { Dock = DockStyle.Top, Height = 52, Padding = new Padding(10, 4, 10, 3) };
            var isWorkshop = export.Mode == "workshop";
            note.Text = isWorkshop
                ? T("Пять файлов готовы. Для публикации в мастерской откройте инструменты нужной игры. Через «Иллюстрации» файлы попадут в галерею профиля.",
                    "П’ять файлів готові. Для публікації в майстерні відкрийте інструменти потрібної гри. Через «Ілюстрації» файли потраплять до галереї профілю.",
                    "Five files are ready. Publish Workshop items using the chosen game's tools. The Artwork form uploads to your profile artwork gallery.")
                : T("Перетащите выбранный файл в поле загрузки Steam или скопируйте его путь. Войдите и подтвердите публикацию на странице Steam.",
                    "Перетягніть вибраний файл у поле Steam або скопіюйте шлях. Увійдіть і підтвердьте публікацію на сторінці Steam.",
                    "Drag the selected file onto Steam’s upload field or copy its path. Sign in and confirm publication on Steam.");
            parts.Items.AddRange(export.Parts); parts.SelectedIndex = 0; top.Controls.Add(parts);
            Func<string> selected = () => Path.Combine(export.Path, (string)parts.SelectedItem);
            var drag = new Button { Text = T("Перетащить файл", "Перетягнути файл", "Drag file"), AutoSize = true };
            drag.MouseDown += (s,e) => { if (e.Button == MouseButtons.Left && File.Exists(selected())) drag.DoDragDrop(new DataObject(DataFormats.FileDrop, new[] { selected() }), DragDropEffects.Copy); };
            top.Controls.Add(drag);
            Add(top, T("Копировать путь", "Копіювати шлях", "Copy path"), () => Clipboard.SetText(selected()));
            Add(top, T("Иллюстрации", "Ілюстрації", "Artwork"), () => web.CoreWebView2?.Navigate(Artwork));
            Add(top, T("Мастерская", "Майстерня", "Workshop"), () => web.CoreWebView2?.Navigate(Workshop));
            Add(top, T("В браузере", "У браузері", "Use browser"), () => { if (Allowed(web.Source?.AbsoluteUri)) Studio.OpenShell(web.Source.AbsoluteUri); });
            Controls.Add(web); Controls.Add(address); Controls.Add(note); Controls.Add(top);
            Shown += async (s,e) => {
                try {
                    await web.EnsureCoreWebView2Async(env);
                    var core = web.CoreWebView2;
                    core.Settings.IsWebMessageEnabled = false; core.Settings.AreHostObjectsAllowed = false;
                    core.Settings.IsPasswordAutosaveEnabled = false; core.Settings.IsGeneralAutofillEnabled = false;
                    core.Settings.AreDevToolsEnabled = false;
                    core.NavigationStarting += (a,b) => { b.Cancel = !Allowed(b.Uri); };
                    core.SourceChanged += (a,b) => address.Text = core.Source;
                    core.NewWindowRequested += (a,b) => { b.Handled = true; if (Allowed(b.Uri)) core.Navigate(b.Uri); };
                    core.PermissionRequested += (a,b) => b.State = CoreWebView2PermissionState.Deny;
                    core.Navigate(isWorkshop ? Workshop : Artwork);
                } catch (Exception ex) { address.Text = ex.Message; }
            };
        }
        static bool Allowed(string url)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != "https" || !uri.IsDefaultPort || uri.UserInfo.Length > 0) return false;
            string[] roots = { "steamcommunity.com", "steampowered.com" };
            return roots.Any(root => uri.Host == root || uri.Host.EndsWith("." + root, StringComparison.OrdinalIgnoreCase));
        }
        static void Add(Control row, string name, Action action)
        {
            var button = new Button { Text = name, AutoSize = true };
            button.Click += (s,e) => { try { action(); } catch (Exception ex) { MessageBox.Show(ex.Message, "Steam Cutter"); } };
            row.Controls.Add(button);
        }
    }
}
