// Viewport screenshots of the landing at chosen scroll positions (headless Edge over CDP, exact window size).
// The pinned scroll scenes cannot be judged from one tall capture, so every scene is shot at several values of its
// progress p. The page must be served already (preview server, port 8771).
//   node shots.js <outDir> [w=1440] [h=900] [query="still=1&no3d=1"] [only=name,name] [ps=0,0.2,0.4,0.6,0.8,1] [scale=1]
// names: hero say big film feat flip shelf (scenes, by data-scene) and list cards editor pick specs end (plain sections)
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const [, , outDir = 'E:/qbit_review/landing_v6_shots/run', w = '1440', h = '900', query = 'still=1&no3d=1', only = '', ps = '0,0.2,0.4,0.6,0.8,1', scale = '1'] = process.argv;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', DBG = 9337, PROF = 'E:/qbit_review/landing_v6_tools/edgeprof_shots';
const URL0 = `http://localhost:8771/?${query}`;
fs.mkdirSync(PROF, { recursive: true }); fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (/^(\d\d_.*|_sheet_\d+)\.jpg$/.test(f)) fs.unlinkSync(path.join(outDir, f));   // frames of the previous run
// GPU=1: the real graphics card (d3d11) instead of software GL; WINDOW=1: a normal window parked off screen (some drivers need it)
const GL = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const MODE = process.env.WINDOW ? ['--window-position=-3000,0', '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] : ['--headless=new'];
const edge = spawn(EDGE, [...MODE, `--remote-debugging-port=${DBG}`, '--user-data-dir=' + PROF, ...GL,
  '--no-first-run', '--hide-scrollbars', `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function connect(url) {
  const ws = new WebSocket(url); let id = 0; const pend = {}, log = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) log.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
    if (m.method === 'Runtime.exceptionThrown') log.push('exception: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  return new Promise((r) => (ws.onopen = () => r({ send, log, ws })));
}
let gone = false; edge.on('exit', () => { gone = true; });
async function quit(code) {                             // close the browser itself, so no helper processes stay behind
  try { const v = await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json(); const b = await connect(v.webSocketDebuggerUrl); b.send('Browser.close'); } catch (e) {}
  for (let i = 0; i < 30 && !gone; i++) await sleep(100);
  if (!gone) { try { edge.kill(); } catch (e) {} await sleep(200); }
  process.exitCode = code; setTimeout(() => process.exit(code), 300).unref();
}
(async () => {
  let list = [];
  for (let i = 0; i < 100 && !list.find((t) => t.type === 'page'); i++) { try { list = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); } catch (e) {} await sleep(200); }
  const { send, log } = await connect(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  const ev = async (expression, awaitPromise = false) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.result?.value;
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: +scale, mobile: +w < 700 });
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });   // the profile is kept between runs
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.navigate', { url: URL0 });
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) { if (await ev('document.readyState === "complete" && document.documentElement.classList.contains("ready")')) break; await sleep(400); }
  console.log('page ready', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  await ev('Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]).then(() => 1)', true); await sleep(800);
  await ev(`Promise.race([new Promise((r) => setTimeout(r, 8000)), Promise.all([...document.querySelectorAll('img')].map((i) => { i.loading = 'eager'; return i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; }); }))]).then(() => 1)`, true);
  console.log('loaded', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  await ev('window.dispatchEvent(new Event("resize")), 1'); await sleep(300);
  const plan = await ev(`(() => { const PS = [${ps}], cine = document.documentElement.classList.contains('cine'), vh = innerHeight;
    return [...document.querySelectorAll('main > section')].flatMap((sec) => {
      const top = sec.getBoundingClientRect().top + scrollY, hh = sec.offsetHeight, name = sec.dataset.scene || sec.className.split(' ')[0];
      if (sec.dataset.scene && cine) return PS.map((p) => [name, 'p' + p, Math.round(top + (hh - vh) * p)]);
      const out = []; for (let y = top; y < top + hh - vh * 0.2; y += vh * 0.86) out.push([name, String(out.length), Math.round(Math.min(y, document.documentElement.scrollHeight - vh))]); return out;
    }); })()`);
  const want = only ? only.split(',') : null; let n = 0;
  console.log('mode', await ev('document.documentElement.className'), '| page height', await ev('document.documentElement.scrollHeight'), '| shots', plan.filter((p) => !want || want.includes(p[0])).length);
  for (const [name, tag, y] of plan) {
    if (want && !want.includes(name)) continue;
    await ev(`scrollTo({ top: ${y}, behavior: 'instant' }), 1`);
    await ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => r(1), 120)))))', true);
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    const f = path.join(outDir, `${String(n++).padStart(2, '0')}_${name}_${tag}.jpg`);
    fs.writeFileSync(f, Buffer.from(shot.result.data, 'base64'));
  }
  console.log('saved', n, 'to', outDir, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  if (log.length) console.log('page log:\n  ' + [...new Set(log)].slice(0, 12).join('\n  '));
  await quit(0);
})().catch(async (e) => { console.log('fail', e); await quit(1); });
