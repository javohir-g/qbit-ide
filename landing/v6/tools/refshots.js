// Screenshots of any page by a timed script (headless Edge over CDP): used to study the reference site frame by frame.
//   node refshots.js <url> <outDir> <w> <h> "<step>;<step>;..."
// steps:  wait:MS   shot:NAME   scroll:Y   mouse:X,Y / click:X,Y (0..1 of the viewport)   wheel:DY   js:EXPR
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const [, , url, outDir, w = '1440', h = '900', script = 'wait:8000;shot:a'] = process.argv;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', DBG = 9338, PROF = 'E:/qbit_review/landing_v6_tools/edgeprof_ref';
fs.mkdirSync(PROF, { recursive: true }); fs.mkdirSync(outDir, { recursive: true });
const GL = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const MODE = process.env.WINDOW ? ['--window-position=-3000,0', '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] : ['--headless=new'];
const edge = spawn(EDGE, [...MODE, `--remote-debugging-port=${DBG}`, '--user-data-dir=' + PROF, ...GL,
  '--no-first-run', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gone = false; edge.on('exit', () => { gone = true; });
function connect(u) {
  const ws = new WebSocket(u); let id = 0; const pend = {};
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  return new Promise((r) => (ws.onopen = () => r({ send })));
}
async function quit(code) {
  try { const v = await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json(); const b = await connect(v.webSocketDebuggerUrl); b.send('Browser.close'); } catch (e) {}
  for (let i = 0; i < 30 && !gone; i++) await sleep(100);
  if (!gone) { try { edge.kill(); } catch (e) {} await sleep(200); }
  process.exitCode = code; setTimeout(() => process.exit(code), 300).unref();
}
(async () => {
  let list = [];
  for (let i = 0; i < 100 && !list.find((t) => t.type === 'page'); i++) { try { list = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); } catch (e) {} await sleep(200); }
  const { send } = await connect(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.navigate', { url });
  const t0 = Date.now(); let n = 0;
  for (const step of script.split(';')) {
    const k = step.indexOf(':'), op = step.slice(0, k), arg = step.slice(k + 1);
    if (op === 'wait') await sleep(+arg);
    else if (op === 'scroll') await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${+arg})` });
    else if (op === 'js') console.log('js', JSON.stringify((await send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true })).result?.result?.value));
    else if (op === 'mouse') { const [x, y] = arg.split(',').map(Number); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x * +w), y: Math.round(y * +h) }); }
    else if (op === 'click') { const [x, y] = arg.split(',').map(Number), X = Math.round(x * +w), Y = Math.round(y * +h);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: X, y: Y, button: 'left', clickCount: 1 }); }
    else if (op === 'wheel') await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(+w / 2), y: Math.round(+h / 2), deltaX: 0, deltaY: +arg });
    else if (op === 'shot') {
      const shot = await Promise.race([send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }), sleep(60000).then(() => null)]);
      if (!shot || !shot.result) { console.log('shot', arg, 'timed out'); continue; }
      fs.writeFileSync(path.join(outDir, `${String(n++).padStart(2, '0')}_${arg}.jpg`), Buffer.from(shot.result.data, 'base64'));
      console.log('shot', arg, ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
  }
  await quit(0);
})().catch(async (e) => { console.log('fail', e); await quit(1); });
