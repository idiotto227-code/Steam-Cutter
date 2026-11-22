"""Exercise the portable EXE and actual WebView2/WinForms host on Windows."""
import io
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen
from PIL import Image
from playwright.sync_api import sync_playwright

def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env=dict(os.environ, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=f'--remote-debugging-port={port}')
    launch=subprocess.Popen([str(Path(sys.argv[1]).resolve())],env=env)
    assert launch.wait(timeout=30)==0
    endpoint=f'http://127.0.0.1:{port}'
    for _ in range(100):
        try:
            with urlopen(endpoint+'/json/version',timeout=1): break
        except OSError: time.sleep(0.6)
    targets = []
    for _ in range(90):
        with urlopen(endpoint+'/json/list',timeout=3) as response:
            targets=json.load(response)
        if any('studio.steamcutter.invalid' in target.get('url','') for target in targets): break
        time.sleep(.5)
    else:
        print('WebView targets:',[(target.get('type'),target.get('url'),target.get('title')) for target in targets],flush=True)
        subprocess.run(['powershell','-NoProfile','-Command',
            'Add-Type -AssemblyName UIAutomationClient; $u=[System.Windows.Automation.AutomationElement]; '
            '$u::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition) | '
            'ForEach-Object { if ($_.Current.Name -like "*Steam*") { $_.FindAll([System.Windows.Automation.TreeScope]::Descendants,'
            '[System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { $_.Current.Name } } }'])
        raise AssertionError('Studio failed to navigate')
    with sync_playwright() as pw:
        browser=pw.chromium.connect_over_cdp(endpoint,timeout=20000)
        context=browser.contexts[0]
        page=next(p for p in context.pages if 'studio.steamcutter.invalid' in p.url)
        page.wait_for_function("document.querySelector('#outputPath')?.textContent.length>0")
        page.locator('#autoSteam').uncheck()
        output=Path(page.locator('#outputPath').inner_text());buf=io.BytesIO()
        Image.new('RGB',(750,100),(22,111,180)).save(buf,format='PNG')
        name=f'smoke-{time.time_ns()}'
        page.locator('#picker').set_input_files({'name':name+'.png','mimeType':'image/png','buffer':buf.getvalue()})
        page.wait_for_selector('.job .publish',timeout=60000)
        folder=output/(name+' - workshop')
        assert [p.name for p in sorted(folder.iterdir())]==[f'part_{i}.png' for i in range(1,6)]
        for p in folder.iterdir():
            with Image.open(p) as im: assert im.size==(150,100)
        page.locator('[data-mode=artwork]').click()
        page.locator('.publish').nth(1).wait_for()
        assert (output/(name+' - artwork')/'01_center_506.png').is_file()
        page.locator('.publish').first.click()
        for _ in range(80):
            matches=[p for p in context.pages if p.url.startswith('https://steamcommunity.com/') or p.url.startswith('https://store.steampowered.com/')]
            if matches: break
            page.wait_for_timeout(250)
        assert matches,'Official Steam window did not navigate'
        print('Portable launch, native I/O, both layouts and Steam navigation passed.')
        browser.close()
if __name__=='__main__': main()
