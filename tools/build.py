#!/usr/bin/env python
"""Single-file bundles:   python -X utf8 ide/tools/build.py

    dist/qbit-ide.html   the block IDE (index.html with every script and style inlined, Blockly included)
    dist/qbit-sim.html   the plain simulator (simulator.html)
    dist/*.gz            the same, gzipped: this is what the board serves (its web server has few connections and little flash)
    dist/media/          Blockly's small picture folder (the IDE page refers to it as media/)
"""
import base64
import gzip
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'dist'


def bundle(page: str, name: str, media: bool):
    html = (ROOT / page).read_text(encoding='utf-8')

    def css(m):
        return '<style>\n' + (ROOT / m.group(1)).read_text(encoding='utf-8') + '\n</style>'

    def js(m):
        code = (ROOT / m.group(1)).read_text(encoding='utf-8').replace('</script', '<\\/script')
        return '<script>\n' + code + '\n</script>'

    def img(m):   # the page's own pictures (logo, tab icon) go in as data: URLs
        return m.group(1) + '="data:image/png;base64,' + base64.b64encode((ROOT / m.group(2)).read_bytes()).decode('ascii') + '"'

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', js, html)
    html = re.sub(r'\b(src|href)="(img/[^"]+\.png)"', img, html)
    if media:   # Blockly looks for its pictures next to the page
        html = html.replace('<script>window.QBIT_NO_AUTOBOOT = true;</script>', "<script>window.QBIT_NO_AUTOBOOT = true; window.QBIT_MEDIA = 'media/';</script>", 1)
    if re.search(r'<script src=|rel="stylesheet"|="img/', html):
        sys.exit('build: some external resources are left in ' + page)
    data = html.encode('utf-8')
    (OUT / name).write_bytes(data)
    gz = gzip.compress(data, 9)
    (OUT / (name + '.gz')).write_bytes(gz)
    print('%-18s %5d KB   .gz %4d KB' % ('dist/' + name, len(data) // 1024, len(gz) // 1024))


OUT.mkdir(exist_ok=True)
bundle('index.html', 'qbit-ide.html', True)
bundle('simulator.html', 'qbit-sim.html', False)
media_src = ROOT / 'vendor' / 'blockly' / 'media'
if media_src.exists():
    shutil.copytree(media_src, OUT / 'media', dirs_exist_ok=True)
    print('dist/media/        %d files' % len(list((OUT / 'media').iterdir())))
