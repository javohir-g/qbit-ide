// Bakes the KiCad GLBs of the cover scene into light real-time models: assets/3d/<name>.glb
// Serves this folder and the sources over http and drives headless Edge through CDP (no npm packages).
//   node bake.js            all models
//   node bake.js station    only these
const { spawn } = require('child_process'), fs = require('fs'), path = require('path'), http = require('http');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SRC = 'E:/qbit_review/cover_scene3d/glb', OUT = path.join(__dirname, '..', 'assets', '3d');
const PROF = 'E:/qbit_review/landing_v6_tools/edgeprof', PORT = 8793, DBG = 9335;
const ALL = ['station', 'tray30', 'tray65', 'button', 'rgb', 'oled', 'pot', 'ultrasonic', 'temphum', 'buzzer', 'led'];
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const TYPES = { '.html': 'text/html', '.glb': 'model/gltf-binary', '.js': 'text/javascript' };

const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u.startsWith('/src/') ? path.join(SRC, u.slice(5)) : path.join(__dirname, u);
  if (u.includes('..') || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(PORT, '127.0.0.1');

fs.mkdirSync(PROF, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${DBG}`, '--user-data-dir=' + PROF,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--window-size=800,600', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quit = (code) => { try { edge.kill(); } catch (e) {} server.close(); process.exit(code); };

(async () => {
  let list = [];
  for (let i = 0; i < 100 && !list.find((t) => t.type === 'page'); i++) {
    try { list = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); } catch (e) {} await sleep(200);
  }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = {};
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
    if (m.method === 'Runtime.consoleAPICalled') console.log('[page]', m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') console.log('[exc]', JSON.stringify(m.params.exceptionDetails).slice(0, 600));
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
  await send('Runtime.enable');
  let total = 0, bad = 0;
  for (const name of names) {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/bake.html?name=${name}` });
    await sleep(300);
    const t0 = Date.now(); let done = '';
    while (Date.now() - t0 < 600000) { done = await ev('window.DONE || ""'); if (done) break; await sleep(500); }
    if (done !== 'ok') { console.log(name, 'FAILED', done || 'timeout'); bad++; continue; }
    const len = await ev('OUT.length'); let s = '';
    for (let i = 0; i < len; i += 4e6) s += await ev(`OUT.substr(${i}, 4e6)`);
    const buf = Buffer.from(s, 'base64'); fs.writeFileSync(path.join(OUT, name + '.glb'), buf); total += buf.length;
    const info = JSON.parse(await ev('INFO'));
    console.log(name.padEnd(11), (buf.length / 1024).toFixed(0).padStart(5), 'KB', String(info.tris).padStart(7), 'tris', String(info.meshes).padStart(3), 'meshes',
      info.source ? `(from ${info.source})` : '', info.masked ? `masked ${info.masked}` : '', 'bbox', JSON.stringify(info.bbox), info.board ? 'board ' + JSON.stringify(info.board) : '', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    if (process.env.ROLES) console.log('   ', JSON.stringify(info.roles));
  }
  console.log('total', (total / 1048576).toFixed(2), 'MB', bad ? `, ${bad} failed` : '');
  quit(bad ? 1 : 0);
})().catch((e) => { console.log('fail', e); quit(1); });
