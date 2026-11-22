"""Run with Python, Pillow, Playwright and Chromium. No Steam account is used."""
import base64
import functools
import io
import os
import random
import shutil
import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = """
window.__exports = []; window.__ops = []; window.__media = {}; const listeners=[];
window.chrome ||= {}; window.chrome.webview={
 addEventListener: (_,fn)=>listeners.push(fn),
 postMessage: ({id,op,...data})=>queueMicrotask(()=>{
   window.__ops.push(op); let value=null;
   if(op==='info')value={output:'Documents / SteamCutter / Exports',inbox:'Inbox'};
   if(op==='begin'){window.__exports.push([]);value='job'+window.__exports.length;}
   if(op==='write')window.__exports.at(-1).push(data);
   if(op==='url')value=data.url.endsWith('/page') ? {kind:'html',url:data.url,html:'<meta property="og:image" content="/cover">'}
      : {kind:'image',token:'one',name:'cover.png',size:window.__media.size};
   if(op==='readMedia')value=window.__media.base64;
   if(op==='inbox')value=[{token:'one',name:'inbox.png',size:window.__media.size}];
   listeners.forEach(fn=>fn({data:{id,value}}));
 })
};"""
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

class StudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(Handler, directory=str(ROOT / 'src/ui'))
        cls.server = ThreadingHTTPServer(('127.0.0.1',0), handler)
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.pw = sync_playwright().start()
        cls.browser=cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM') or shutil.which('chromium'),args=['--no-sandbox'])
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.page=self.browser.new_page(viewport={'width':1120,'height':760},locale='ru-RU')
        self.page.add_init_script(BRIDGE)
        self.page.goto('http://127.0.0.1:%s/index.html'%self.server.server_port)
        expect(self.page.locator('#outputPath')).not_to_have_text('')
    def tearDown(self): self.page.close()
    def file(self, image, name, fmt, **kw):
        buf=io.BytesIO();image.save(buf,format=fmt,**kw)
        return dict(name=name,mimeType='application/octet-stream',buffer=buf.getvalue())
    def parts(self,job=1):
        self.page.locator('.job .publish, .job.error').nth(job-1).wait_for(timeout=45000)
        self.assertFalse(self.page.locator('.job.error').count(),self.page.locator('#jobs').inner_text())
        return [Image.open(io.BytesIO(base64.b64decode(p['bytes']))) for p in self.page.evaluate('n=>__exports[n-1]',job)]
    def test_static_sizes_and_pixels(self):
        src=Image.new('RGBA',(750,60)); d=ImageDraw.Draw(src)
        for i in range(5):d.rectangle((i*150,0,i*150+149,59),fill=(20*i,40,220,0 if i==0 else 255))
        self.page.locator('#picker').set_input_files(self.file(src,'colors.png','PNG'))
        parts=self.parts();self.assertEqual([p.size for p in parts],[(150,60)]*5)
        for i,p in enumerate(parts):
            a=p.convert('RGBA').getpixel((22,25));b=src.getpixel((150*i+22,25))
            self.assertEqual(a[3],b[3])
            if a[3]:self.assertEqual(a,b)
        self.page.locator('[data-mode=artwork]').click()
        self.assertEqual([p.size for p in self.parts(2)],[(506,48),(100,48)])
    def test_animation_formats(self):
        for fmt in ('GIF','WEBP','PNG'):
            with self.subTest(fmt=fmt):
                frames=[Image.new('RGBA',(100,36),(0,0,0,0)) for _ in range(3)]
                for i,im in enumerate(frames): ImageDraw.Draw(im).rectangle((0,5,10+4*i,24),fill=(255,20*i,20,255))
                opts=dict(save_all=True,append_images=frames[1:],duration=[60,110,180],loop=2)
                if fmt=='GIF':opts['disposal']=2
                if fmt=='WEBP':opts['lossless']=True
                self.page.locator('#picker').set_input_files(self.file(frames[0],'animation.'+fmt.lower(),fmt,**opts))
                parts=self.parts(('GIF','WEBP','PNG').index(fmt)+1); p=parts[0]; self.assertEqual(p.n_frames,3)
                self.assertEqual(p.info.get('loop'),2 if fmt=='GIF' else 1)
                for i,delay in enumerate((60,110,180)):
                    p.seek(i);self.assertEqual(p.info.get('duration'),delay)
                    self.assertEqual(p.convert('RGBA').getpixel((2,2))[3],0)
                    self.assertEqual(p.convert('RGBA').getpixel((15,70))[3],255)
    def test_optimized_animation(self):
        rng=random.Random(2026)
        # In Artwork mode the wide panel exceeds the upload budget at 256 colours.
        source=[Image.frombytes('P',(606,230),rng.randbytes(606*230)) for _ in range(52)]
        pal=bytes(v for i in range(256) for v in (i,(i*89)%256,(i*17)%256))
        for frame in source: frame.putpalette(pal)
        self.page.locator('[data-mode=artwork]').click()
        self.page.locator('#picker').set_input_files(self.file(source[0],'motion.gif','GIF',
                save_all=True,append_images=source[1:],duration=60,loop=0,optimize=False))
        self.page.locator('.publish').first.wait_for(timeout=180000)
        for part in self.parts():
            self.assertLessEqual(len(part.fp.getvalue()),5_000_000)
            total=0
            for i in range(part.n_frames):
                part.seek(i);total+=part.info['duration']
            self.assertEqual(total,52*60)
    def test_link_inbox_jpeg(self):
        data=self.file(Image.new('RGB',(310,80),'red'),'pic.jpg','JPEG')
        self.page.evaluate('(m)=>window.__media=m',dict(size=len(data['buffer']),base64=base64.b64encode(data['buffer']).decode()))
        self.page.locator('[data-tab=url]').click();self.page.locator('#urlInput').fill('https://example.org/page');self.page.locator('#getUrl').click()
        self.assertEqual(len(self.parts()),5)
        self.page.locator('[data-tab=inbox]').click();self.page.locator('#runInbox').click()
        self.assertEqual(len(self.parts(2)),5);self.assertIn('releaseMedia',self.page.evaluate('window.__ops'))
    def test_bad_file_then_good_file(self):
        src=self.file(Image.new('RGB',(300,125),'gold'),'good.jpg','JPEG')
        self.page.locator('#picker').set_input_files([dict(name='bad.gif',mimeType='image/gif',buffer=b'bad'),src])
        self.page.locator('.publish').first.wait_for()
        self.assertEqual(self.page.locator('.job.error').count(),1)
        self.assertEqual(len(self.page.evaluate('__exports[0]')),5)
    def test_layout_diagrams_do_not_overlap_text(self):
        self.page.set_viewport_size({'width': 760, 'height': 600})
        for lang in ('ru', 'uk', 'en'):
            self.page.locator('#lang').select_option(lang)
            for zoom in (1, 1.25, 1.5, 2):
                self.page.evaluate('scale => document.body.style.zoom = scale', zoom)
                for mode, count in [('workshop', 5), ('artwork', 2)]:
                    with self.subTest(lang=lang, zoom=zoom, mode=mode):
                        button = self.page.locator(f'[data-mode="{mode}"]')
                        diagram = button.locator('.layout-diagram')
                        bars = [bar.bounding_box() for bar in diagram.locator('b').all()]
                        label = button.locator('[data-t]').bounding_box()
                        self.assertEqual(len(bars), count)
                        for bar in bars:
                            self.assertGreater(bar['width'], 0)
                            self.assertAlmostEqual(bar['y'], bars[0]['y'], delta=1)
                        self.assertGreaterEqual(label['x'] - (bars[-1]['x'] + bars[-1]['width']), 10 * zoom)
                        if mode == 'artwork':
                            self.assertGreater(bars[0]['width'], bars[1]['width'])
    def test_contextual_instructions(self):
        help_box=self.page.locator('#layoutHelp')
        summary=help_box.locator('summary')
        steps=help_box.locator('ol')
        for lang, title in [('ru','Инструкция'),('uk','Інструкція'),('en','Instructions')]:
            self.page.locator('#lang').select_option(lang)
            self.page.locator('[data-mode=workshop]').click()
            expect(help_box.locator('p:visible')).to_have_count(1)
            expect(help_box.locator('p:visible')).to_contain_text('150 px')
            expect(summary).to_have_text(title)
            expect(steps).to_be_hidden()
            summary.focus()
            summary.press('Enter')
            expect(steps.locator('li:visible')).to_have_count(5)
            expect(steps).to_contain_text('750 × 150 px')
            expect(steps.locator('li:visible').last).to_contain_text('part_5')
            self.page.locator('[data-mode=artwork]').click()
            expect(help_box.locator('p:visible')).to_have_count(1)
            expect(help_box.locator('p:visible')).to_contain_text('506 px')
            expect(steps.locator('li:visible')).to_have_count(4)
            expect(steps.locator('li:visible').last).to_contain_text('02_side_100')
            summary.click()
            expect(steps).to_be_hidden()
    def test_language_and_layout(self):
        self.page.locator('#lang').select_option('uk');self.assertEqual(self.page.locator('h1').inner_text(),'Студія вітрин')
        self.page.locator('[data-mode=artwork]').click();self.page.reload()
        self.assertEqual(self.page.locator('#lang').input_value(),'uk')
        self.assertEqual(self.page.locator('[data-mode=artwork]').get_attribute('aria-pressed'),'true')
        path=os.environ.get('STUDIO_SCREENSHOT')
        if path:
            self.page.locator('[data-mode=workshop]').click();self.page.locator('#lang').select_option('ru');self.page.screenshot(path=path)
if __name__=='__main__': unittest.main()
