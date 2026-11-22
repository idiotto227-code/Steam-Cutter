"""Build the portable Windows executable from a .NET SDK and the pinned NuGet packages."""
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'build'
SDK = os.environ.get('DOTNET', 'dotnet')
def compile_project(project):
    subprocess.run([SDK,'build',str(ROOT/project),'-c','Release','--nologo',
                    '-p:ContinuousIntegrationBuild=true'],check=True)
def write_zip(path, files):
    with zipfile.ZipFile(path, 'w') as archive:
        for name, source in sorted(files):
            entry=zipfile.ZipInfo(name,(2025,1,1,0,0,0))
            entry.compress_type=zipfile.ZIP_DEFLATED
            entry.external_attr=0o100644 << 16
            archive.writestr(entry, source.read_bytes(),compresslevel=9)

def main():
    BUILD.mkdir(exist_ok=True)
    compile_project('src/SteamCutter.csproj')
    folder=ROOT/'src/bin/Release/net48'
    files=[(n,folder/n) for n in ['Steam Cutter.exe','Steam Cutter.exe.config','Microsoft.Web.WebView2.Core.dll',
           'Microsoft.Web.WebView2.WinForms.dll','runtimes/win-x64/native/WebView2Loader.dll']]
    files.extend((p.relative_to(folder).as_posix(),p) for p in (folder/'ui').rglob('*') if p.is_file())
    cache=Path(os.environ.get('NUGET_PACKAGES',Path.home()/'.nuget/packages'))/'microsoft.web.webview2/1.0.3650.58'
    files.extend(('licenses/WebView2-'+n,cache/n) for n in ['LICENSE.txt','NOTICE.txt'])
    write_zip(BUILD/'payload.zip',files)
    compile_project('launcher/Launcher.csproj')
    exe=BUILD/'Steam Cutter.exe'
    shutil.copyfile(ROOT/'launcher/bin/Release/net48/Steam Cutter.exe',exe)
    write_zip(BUILD/'Steam-Cutter-5.0.2-Windows-x64.zip',[('Steam Cutter.exe',exe)])
    print(exe)
if __name__=='__main__': main()
