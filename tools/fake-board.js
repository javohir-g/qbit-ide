#!/usr/bin/env node
/* A stand-in for the real board, to try the IDE <-> board link without hardware (and the reference for the board side of docs/PROTOCOL.md).

     node ide/tools/fake-board.js [--port 8780] [--name q.bit-TEST] [--modules led:3,button:1,pot:2,rgb:4]

   It serves the IDE (the ide/ folder) the way the real board will: open  http://localhost:8780/  and the IDE connects to /ws by itself
   (it finds /qbit.json). Behind the socket runs the same virtual board + program runtime as the simulator, so programs behave the same.
   "Touching" the board from the outside:  GET /touch?port=1&key=pressed&value=1   (key = a module state: pressed, pos, dx, dy, motion ...)
   and  GET /state  prints what the board reports. No dependencies: the WebSocket handshake and framing are done by hand below. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true; }
const PORT = Number(args.port) || 8780;
const NAME = args.name || 'q.bit-TEST';
const ROOT = path.resolve(__dirname, '..');

/* the board and its runtime: exactly what the browser simulator uses */
const files = require('../js/core-files.json');
for (const f of files) require(path.join(ROOT, 'js', f));
const Q = globalThis.QBIT;
const board = new Q.Board({ source: 'usb-pd' });
board.run(1.5);
const rt = new Q.Runtime(board);
const mods = (args.modules || 'button:1,pot:2,led:3,rgb:4,oled:5,servo:7,buzzer:8').split(',').filter(Boolean);
mods.forEach((s) => { const [key, n] = s.split(':'); try { board.attach(Number(n), key, key === 'led' ? { variant: 'green' } : undefined); } catch (e) { console.error('cannot place', s, e.message); } });
board.run(1);

/* ---------------------------------------------------------------- what the board tells the IDE */
const clients = new Set();
function send(ws, obj) { if (ws.alive) ws.write(frame(JSON.stringify(obj))); }
function broadcast(obj) { clients.forEach((c) => send(c, obj)); }

function portsState() {
  return board.ports.map((p) => {
    const info = board.contract.info(p.n);
    return { n: p.n, key: info.key, title: info.title, state: p.state, values: info.values, text: info.text };
  });
}
function powerState() { const pw = board.pw; return { battery: Math.round(pw.soc), usb: !!pw.src.usb, charging: !!pw.charging, volts: Math.round(pw.v5 * 100) / 100, amps: Math.round(pw.iMa) / 1000, source: pw.src.label }; }
function stateMsg() { return { t: 'state', ports: portsState(), power: powerState(), run: { status: rt.status } }; }

rt.on('print', (text) => broadcast({ t: 'print', text }));
rt.on('error', (e) => broadcast({ t: 'error', type: e.type, message: e.message, line: e.line }));
rt.on('status', (s) => broadcast({ t: 'status', status: s }));
let lastLine = 0, lineDirty = false;
rt.on('line', (n) => { lastLine = n; lineDirty = true; });
setInterval(() => { if (lineDirty) { lineDirty = false; broadcast({ t: 'line', n: lastLine }); } }, 60);

/* the board runs in real time */
let last = process.hrtime.bigint();
setInterval(() => {
  const now = process.hrtime.bigint(), dt = Number(now - last) / 1e9; last = now;
  let acc = Math.min(dt, 0.25);
  while (acc > 0) { const s = Math.min(acc, 0.02); board.step(s); acc -= s; }
}, 20);
setInterval(() => { if (clients.size) broadcast(stateMsg()); }, 200);

function onMessage(ws, m) {
  switch (m.t) {
    case 'hello': send(ws, { t: 'hello', v: 1, fw: 'fake-0.1', name: NAME, board: 'qbit-fake' }); send(ws, stateMsg()); break;
    case 'run':
      try { rt.run(String(m.code || '')); }
      catch (e) { send(ws, { t: 'error', type: e.type || 'Error', message: e.msg || e.message, line: e.line || 0 }); }
      break;
    case 'stop': rt.stop(); break;
    case 'pause': rt.pause(); break;
    case 'resume': rt.resume(); break;
    case 'cmd': try { board.contract.command(m.port, board.port(m.port).module.key, m.words[0], m.words.slice(1)); } catch (e) { send(ws, { t: 'error', type: 'QbitError', message: e.message, line: 0 }); } break;
    case 'ping': send(ws, { t: 'pong' }); break;
  }
}

/* ---------------------------------------------------------------- HTTP + WebSocket by hand */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.cur': 'image/x-icon', '.gif': 'image/gif' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/qbit.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ qbit: 1, name: NAME, fw: 'fake-0.1', ws: '/ws' })); }
  if (url.pathname === '/state') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(stateMsg(), null, 1)); }
  if (url.pathname === '/touch') {
    const n = Number(url.searchParams.get('port')), key = url.searchParams.get('key'), raw = url.searchParams.get('value');
    const m = board.port(n) && board.port(n).module;
    if (!m) { res.writeHead(404); return res.end('no module on that port'); }
    const value = raw === 'true' || raw === '1' ? (key === 'pos' ? 1 : true) : raw === 'false' || raw === '0' ? (key === 'pos' ? 0 : false) : Number(raw);
    m.set(key, value); res.writeHead(200); return res.end('ok');
  }
  let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

function frame(text) {
  const payload = Buffer.from(text, 'utf8'), n = payload.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])]);
  return Buffer.concat([head, payload]);
}
server.on('upgrade', (req, socket) => {
  if (req.url.split('?')[0] !== '/ws') { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
    crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
  socket.alive = true; clients.add(socket);
  let buf = Buffer.alloc(0);
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, masked = !!(buf[1] & 128);
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + (masked ? 4 : 0) + len) return;
      const mask = masked ? buf.slice(off, off + 4) : null; off += masked ? 4 : 0;
      const payload = Buffer.from(buf.slice(off, off + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.slice(off + len);
      if (op === 8) { socket.end(); return; }
      if (op === 9) { socket.write(Buffer.concat([Buffer.from([0x8A, payload.length]), payload])); continue; }
      if (op === 1) { try { onMessage(socket, JSON.parse(payload.toString('utf8'))); } catch (e) { console.error('bad message', e.message); } }
    }
  });
  socket.write = ((orig) => (...a) => { try { return orig(...a); } catch (e) { return false; } })(socket.write.bind(socket));
  socket.on('close', () => { socket.alive = false; clients.delete(socket); });
  socket.on('error', () => { socket.alive = false; clients.delete(socket); });
});
server.listen(PORT, '0.0.0.0', () => console.log('fake q.bit board «' + NAME + '»: http://localhost:' + PORT + '/  (modules: ' + mods.join(' ') + ')'));
