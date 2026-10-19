/* Minimal Chrome DevTools Protocol driver (no dependencies): launch headless Chrome, screenshots, mouse, evaluate. */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const os = require('os');
function findChrome() {
  const c = [process.env.CHROME, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return c.find((x) => x && fs.existsSync(x));
}
const CHROME = findChrome();
// scratch files (browser profile, screenshots) go where there is room: set QBIT_TMP, default E:/qbit-tmp or the system temp
const BASE = process.env.QBIT_TMP || (fs.existsSync('E:/') ? 'E:/qbit-tmp/sim-test' : path.join(os.tmpdir(), 'qbit-sim-test'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

class Page {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.logs = []; this.errors = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message)); else res(m.result);
      } else if (m.method === 'Runtime.consoleAPICalled') {
        const text = m.params.args.map((a) => a.value !== undefined ? a.value : a.description || a.type).join(' ');
        this.logs.push(m.params.type + ': ' + text);
      } else if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        this.errors.push((d.exception && d.exception.description) || d.text);
      } else if (m.method === 'Log.entryAdded') {
        const en = m.params.entry;
        if (en.level === 'error') {
          const st = en.stackTrace ? en.stackTrace.callFrames.slice(0, 3).map((f) => f.url.split('/').slice(-2).join('/') + ':' + (f.lineNumber + 1) + ' ' + f.functionName).join(' < ') : '';
          this.errors.push('log: ' + en.text + ' ' + (en.url || '') + (st ? ' [' + st + ']' : ''));
        }
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error('CDP timeout: ' + method)); }, 25000);
      this.pending.set(id, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async init(w, h, dpr) {
    await this.send('Page.enable'); await this.send('Runtime.enable'); await this.send('Log.enable');
    await this.viewport(w, h, dpr);
  }
  async viewport(w, h, dpr = 1, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  }
  async goto(url, wait = 700) {
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 80; i++) {
      await sleep(150);
      try { if (await this.eval('document.readyState') === 'complete' && await this.eval('location.href') === url) break; } catch (e) { /* navigating */ }
    }
    await sleep(wait);
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    return r.result.value;
  }
  async shot(file, clip) {
    const p = { format: 'png' };
    if (clip) p.clip = { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: clip.scale || 1 };
    const r = await this.send('Page.captureScreenshot', p);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }
  async mouse(type, x, y, extra = {}) {
    await this.send('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, extra));
  }
  async move(x, y) { await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 }); }
  async down(x, y) { await this.mouse('mousePressed', x, y); }
  async up(x, y) { await this.mouse('mouseReleased', x, y); }
  async click(x, y) { await this.move(x, y); await this.down(x, y); await sleep(60); await this.up(x, y); }
  async dblclick(x, y) {
    await this.move(x, y);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 2 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 2 });
  }
  async drag(x1, y1, x2, y2, opts = {}) {
    const steps = opts.steps || 24, hold = opts.hold || 0;
    await this.move(x1, y1); await this.down(x1, y1); await sleep(40);
    for (let i = 1; i <= steps; i++) {
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps, button: 'left', buttons: 1 });
      await sleep(opts.stepMs || 16);
    }
    if (opts.shotBeforeUp) await opts.shotBeforeUp();
    if (hold) await sleep(hold);
    await this.up(x2, y2);
  }
  async key(key, code) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code || key });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key });
  }
  async rect(sel) {
    return this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width/2, cy: r.y + r.height/2}; })()`);
  }
}

async function launch(opts = {}) {
  const port = opts.port || (9400 + Math.floor(Math.random() * 500));
  if (!CHROME) throw new Error('Chrome not found: set the CHROME environment variable');
  fs.mkdirSync(path.join(BASE, 'shots'), { recursive: true });
  for (const d of fs.readdirSync(BASE)) { if (d.startsWith('prof-') && Date.now() - Number(d.slice(5)) > 600000) { try { fs.rmSync(path.join(BASE, d), { recursive: true, force: true }); } catch (e) { /* locked */ } } }
  const dir = path.join(BASE, 'prof-' + Date.now());
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    '--lang=ru-RU', '--autoplay-policy=no-user-gesture-required', '--disk-cache-size=1', '--media-cache-size=1', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore', detached: false });
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try { targets = await getJson(`http://127.0.0.1:${port}/json/list`); if (targets.length) break; } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  if (!targets) throw new Error('Chrome did not start');
  const t = targets.find((x) => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const page = new Page(ws);
  await page.init(opts.w || 1440, opts.h || 900, opts.dpr || 1);
  page.close = async () => { try { ws.close(); } catch (e) { /* ignore */ } try { require('child_process').execSync('taskkill /F /T /PID ' + proc.pid, { stdio: 'ignore' }); } catch (e) { /* gone */ } await sleep(500); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* locked: leave it */ } };
  return page;
}

module.exports = { launch, sleep, BASE };
