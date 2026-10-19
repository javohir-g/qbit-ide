/* The board protocol, end to end: the fake board (tools/fake-board.js) as a child process, a WebSocket client playing the IDE:
     node ide/tests/link.test.js */
'use strict';
const { spawn } = require('child_process');
const path = require('path'), http = require('http');

const PORT = 8790 + Math.floor(Math.random() * 100);
let passed = 0, failed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); } }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'differ') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const get = (p) => new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + p, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); }).on('error', rej));

(async () => {
  const board = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'fake-board.js'), '--port', String(PORT), '--modules', 'button:1,led:2,pot:3,rgb:4'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { board.stdout.on('data', (d) => { if (/fake q\.bit board/.test(String(d))) res(); }); board.on('exit', () => rej(new Error('board exited'))); setTimeout(() => rej(new Error('board did not start')), 15000); });

  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
  const inbox = [];
  ws.onmessage = (e) => inbox.push(JSON.parse(e.data));
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });
  const waitFor = async (pred, ms = 4000) => { const t0 = Date.now(); for (;;) { const m = inbox.find(pred); if (m) return m; if (Date.now() - t0 > ms) throw new Error('timeout waiting for a message'); await sleep(20); } };
  const send = (o) => ws.send(JSON.stringify(o));

  await test('/qbit.json tells the IDE this is a board', async () => { const r = await get('/qbit.json'); eq(r.status, 200); ok(JSON.parse(r.body).qbit === 1); });
  await test('hello and a first state with the modules', async () => {
    send({ t: 'hello', v: 1 });
    const h = await waitFor((m) => m.t === 'hello'); eq(h.v, 1); ok(h.name && h.fw);
    const s = await waitFor((m) => m.t === 'state');
    eq(s.ports[0].key, 'button'); eq(s.ports[1].key, 'led'); eq(s.ports[7].key, null); ok(s.power.battery > 0);
    ok('pressed' in s.ports[0].values);
  });
  await test('run: print comes back, status goes running -> finished', async () => {
    inbox.length = 0;
    send({ t: 'run', code: "import qbit\nprint('hello', 2 + 3)\n" });
    const p = await waitFor((m) => m.t === 'print'); eq(p.text, 'hello 5\n');
    await waitFor((m) => m.t === 'status' && m.status === 'finished');
  });
  await test('run: a command reaches the module and shows in the next state', async () => {
    inbox.length = 0;
    send({ t: 'run', code: "import qbit\nqbit.led(2).on()\nasync def m():\n    while True:\n        await qbit.wait(0.1)\nqbit.start(m)\n" });
    const s = await waitFor((m) => m.t === 'state' && m.ports[1].values.brightness === 100 && m.run.status === 'running');
    ok(s);
  });
  await test('touching the board from outside is reported', async () => {
    await get('/touch?port=1&key=pressed&value=1');
    await waitFor((m) => m.t === 'state' && m.ports[0].values.pressed === true);
    await get('/touch?port=1&key=pressed&value=0');
  });
  await test('stop: the program ends and the LED goes off (safe state)', async () => {
    send({ t: 'stop' });
    await waitFor((m) => m.t === 'status' && m.status === 'stopped');
    await waitFor((m) => m.t === 'state' && m.ports[1].values.brightness === 0 && m.run.status === 'stopped');
  });
  await test('errors arrive with the line and a readable text', async () => {
    inbox.length = 0;
    send({ t: 'run', code: "import qbit\nqbit.led(1).on()\n" });
    const e = await waitFor((m) => m.t === 'error'); eq(e.line, 2); ok(/стоит «Кнопка»/.test(e.message), e.message);
  });
  await test('a syntax error is reported, the board stays idle', async () => {
    inbox.length = 0;
    send({ t: 'run', code: 'x = = 1' });
    const e = await waitFor((m) => m.t === 'error'); eq(e.type, 'SyntaxError');
  });
  await test('direct command from the IDE', async () => {
    send({ t: 'cmd', port: 4, words: ['color', 'red'] });
    await waitFor((m) => m.t === 'state' && m.ports[3].values.r === 255);
  });
  await test('ping / pong', async () => { inbox.length = 0; send({ t: 'ping' }); await waitFor((m) => m.t === 'pong'); });

  ws.close(); board.kill();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
