/* The site works offline and installs:  node ide/tests/pwa.test.js
   - sw.js lists every file the page loads, each exists, and its version is the one of the current files (otherwise: python -X utf8 ide/tools/gen_pwa.py),
   - the manifest and the icons are valid, the page links them and has a description and a preview picture. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); } }
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html'), sw = read('sw.js');
const files = JSON.parse(/const FILES = (\[[\s\S]*?\]);/.exec(sw)[1].replace(/'/g, '"'));
const version = /const CACHE = 'qbit-ide-(\w+)'/.exec(sw)[1];
const pngSize = (f) => { const b = fs.readFileSync(path.join(root, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('sw.js caches every script, style and picture of the page, and each file exists', () => {
  const need = [...html.matchAll(/<script src="([^"]+)"/g), ...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), ...html.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1]);
  const miss = need.filter((f) => !files.includes(f));
  if (miss.length) throw new Error('not cached: ' + miss.join(', '));
  const gone = files.filter((f) => f !== './' && !fs.existsSync(path.join(root, f)));
  if (gone.length) throw new Error('missing: ' + gone.join(', '));
  if (!files.includes('./') || !files.includes('manifest.webmanifest')) throw new Error('page or manifest not cached');
});
test('sw.js is up to date (its version is the hash of the files)', () => {
  const h = crypto.createHash('sha1');
  for (const f of files) { h.update(Buffer.from(f)); h.update(fs.readFileSync(path.join(root, f === './' ? 'index.html' : f))); }
  if (h.digest('hex').slice(0, 10) !== version) throw new Error('files changed: run  python -X utf8 ide/tools/gen_pwa.py');
});
test('sw.js never answers the board probe from the cache, and asks the network first', () => {
  if (!/qbit\.json/.test(sw) || !/fetch\(req\)\.then/.test(sw)) throw new Error('rules missing');
});
test('the manifest is valid and its icons exist with the right sizes', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const k of ['name', 'short_name', 'start_url', 'display', 'theme_color', 'background_color']) if (!m[k]) throw new Error('no ' + k);
  for (const i of m.icons) { const [w, h] = pngSize(i.src); if (i.sizes !== w + 'x' + h) throw new Error(i.src + ' is ' + w + 'x' + h); }
  if (!m.icons.some((i) => i.purpose === 'maskable') || !m.icons.some((i) => i.sizes === '192x192') || !m.icons.some((i) => i.sizes === '512x512')) throw new Error('icon set incomplete');
});
test('the page links the manifest, the touch icon, a description and a preview picture', () => {
  for (const re of [/mf\.rel = 'manifest'; mf\.href = 'manifest\.webmanifest'/, /<link rel="apple-touch-icon" href="img\/apple-touch-icon\.png">/, /<meta name="description" content="[^"]{30,}"/, /<meta property="og:image" content="https:\/\/[^"]+\/img\/og\.png">/, /serviceWorker\.register\('sw\.js'\)/])
    if (!re.test(html)) throw new Error('missing: ' + re);
  if (!/location\.protocol === 'https:'/.test(html)) throw new Error('the worker must be registered only on https / localhost');
  const [w, h] = pngSize('img/og.png'); if (w < 1000 || h < 500) throw new Error('og.png is ' + w + 'x' + h);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
