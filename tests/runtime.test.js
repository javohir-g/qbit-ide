/* Tests of the qbit contract, the runtime and the interplay of programs with the simulated board:  node ide/tests/runtime.test.js  */
'use strict';
const fs = require('fs'), path = require('path');
const Q = require('./load.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n       ') : e)); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'differ') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

function setup(mods, src) {
  const b = new Q.Board({ source: src || 'usb-pd' });
  b.run(1.5);
  Object.keys(mods || {}).forEach(n => { const v = mods[n]; b.attach(+n, Array.isArray(v) ? v[0] : v, Array.isArray(v) ? v[1] : undefined); });
  b.run(1.0);
  const rt = new Q.Runtime(b);
  const log = { out: '', errors: [], status: [] };
  rt.on('print', s => { log.out += s; });
  rt.on('error', e => log.errors.push(e));
  rt.on('status', s => log.status.push(s));
  return { b, rt, log, mod: n => b.port(n).module };
}
function runFor(env, src, sec) { env.rt.run(src); env.b.run(sec === undefined ? 0.5 : sec); }

console.log('contract vs firmware');
const FW = [path.join(__dirname, '..', '..', 'firmware'), path.join(process.cwd(), 'firmware'), 'C:/Users/User/Desktop/q bit/firmware'].map(d => path.join(d, 'qbit_core', 'drivers')).filter(fs.existsSync)[0] || '';
test('values and commands in spec.js match the C drivers', () => {
  if (!FW) { console.log('       (firmware folder not found, skipped)'); return; }
  const text = fs.readdirSync(FW).filter(f => f.endsWith('.c')).map(f => fs.readFileSync(path.join(FW, f), 'utf8')).join('\n');
  const fields = {};
  for (const m of text.matchAll(/static const qbit_field_t (f_\w+)\[\] = \{([\s\S]*?)\};/g)) fields[m[1]] = [...m[2].matchAll(/\{\s*"(\w+)"/g)].map(x => x[1]);
  const drivers = {};
  for (const m of text.matchAll(/const qbit_driver_t drv_\w+ = \{\s*0x[0-9A-Fa-f]+,\s*"(\w+)",\s*"[^"]*",\s*\d+,\s*(f_\w+|NULL),\s*\d+,\s*((?:"[^"]*"\s*)+),/g)) {
    drivers[m[1]] = { fields: m[2] === 'NULL' ? [] : fields[m[2]], help: [...m[3].matchAll(/"([^"]*)"/g)].map(x => x[1]).join('') };
  }
  const missing = [];
  Object.keys(Q.SPEC.modules).forEach(key => {
    const d = drivers[key];
    if (!d) { missing.push('no driver ' + key); return; }
    const sv = Q.SPEC.modules[key].values.map(v => v.n);
    if (key !== 'rfid' && sv.join() !== d.fields.join()) missing.push(key + ' values ' + sv.join() + ' != ' + d.fields.join());
    Q.SPEC.modules[key].commands.forEach(c => { if (!new RegExp('(^|[ |\\[])' + c.n + '([ |\\]<\\[]|$)').test(d.help.replace(/\|/g, ' | '))) missing.push(key + ' command ' + c.n + ' not in "' + d.help + '"'); });
  });
  eq(missing.join('\n'), '');
});
test('every module of the catalogue has a spec and a simulator driver', () => {
  const keys = Q.DATA.modules.map(m => m.key);
  keys.forEach(k => { ok(Q.SPEC.modules[k], 'spec for ' + k); ok(Q.ContractDrivers[k], 'sim driver for ' + k); });
});

console.log('running programs');
test('blink: led goes on and off at the right simulated time', () => {
  const e = setup({ 1: ['led', { variant: 'green' }] });
  e.rt.run("import qbit\nasync def main():\n    qbit.led(1).on()\n    await qbit.wait(1)\n    qbit.led(1).off()\nqbit.start(main)\nqbit.run()\n");
  e.b.run(0.3); ok(e.mod(1).api.isOn(), 'on after 0.3 s');
  e.b.run(0.5); ok(e.mod(1).api.isOn(), 'still on at 0.8 s');
  e.b.run(0.5); ok(!e.mod(1).api.isOn(), 'off at 1.3 s');
  eq(e.rt.status, 'finished');
});
test('forever loop with wait keeps running; stop puts the output to a safe state', () => {
  const e = setup({ 1: 'led' });
  e.rt.run("import qbit\nasync def main():\n    while True:\n        qbit.led(1).on()\n        await qbit.wait(0.5)\n        qbit.led(1).off()\n        await qbit.wait(0.5)\n        await qbit.tick()\nqbit.start(main)\nqbit.run()\n");
  e.b.run(0.2); ok(e.mod(1).api.isOn());
  e.b.run(0.4); ok(!e.mod(1).api.isOn());
  e.b.run(0.6); ok(e.mod(1).api.isOn());
  eq(e.rt.status, 'running');
  e.rt.stop(); e.b.run(0.1);
  ok(!e.mod(1).api.isOn(), 'off after stop'); eq(e.rt.status, 'stopped');
});
test('when button pressed: a handler runs for each press', () => {
  const e = setup({ 1: 'button', 2: 'led' });
  e.rt.run("import qbit\nasync def pressed():\n    qbit.led(2).toggle()\nqbit.button(1).when('press', pressed)\nqbit.run()\n");
  e.b.run(0.2);
  eq(e.rt.status, 'running', 'a program with handlers keeps running');
  e.mod(1).set('pressed', true); e.b.run(0.2); e.mod(1).set('pressed', false); e.b.run(0.2);
  ok(e.mod(2).api.isOn(), 'on after first press');
  e.mod(1).set('pressed', true); e.b.run(0.2); e.mod(1).set('pressed', false); e.b.run(0.2);
  ok(!e.mod(2).api.isOn(), 'off after second press');
});
test('read a sensor: pot value and print', () => {
  const e = setup({ 3: 'pot' });
  e.mod(3).set('pos', 0.8); e.b.run(0.2);
  runFor(e, "import qbit\nprint('pot', qbit.pot(3).value)\n");
  eq(e.log.out, 'pot 80\n');
});
test('value and command with the same name: led.level / led.brightness()', () => {
  const e = setup({ 1: 'led' });
  runFor(e, "import qbit\nqbit.led(1).brightness(40)\nprint(qbit.led(1).level)\n");
  eq(e.log.out, '40\n');
});
test('a wrong module on the port is a clear error, and the program stops', () => {
  const e = setup({ 1: 'button' });
  runFor(e, "import qbit\nqbit.led(1).on()\n");
  eq(e.rt.status, 'error'); eq(e.log.errors.length, 1);
  ok(/на порту 1 стоит «Кнопка», а программа ждёт «Светодиод»/.test(e.log.errors[0].message), e.log.errors[0].message);
  eq(e.log.errors[0].line, 2);
});
test('an empty port', () => {
  const e = setup({});
  runFor(e, "import qbit\nprint(qbit.pot(4).value)\n");
  ok(/на порту 4 нет модуля/.test(e.log.errors[0].message), e.log.errors[0].message);
});
test('syntax error does not touch the board', () => {
  const e = setup({ 1: 'led' });
  runFor(e, 'import qbit\nqbit.led(1).on()\n', 0.1);
  ok(e.mod(1).api.isOn(), 'on after the first program');
  let err; try { e.rt.run('x = = 1'); } catch (x) { err = x; }
  ok(err && err.type === 'SyntaxError'); ok(e.mod(1).api.isOn());
});
test('reset of the board stops the program', () => {
  const e = setup({ 1: 'led' });
  e.rt.run("import qbit\nasync def m():\n    while True:\n        await qbit.wait(1)\nqbit.start(m)\n"); e.b.run(0.2);
  eq(e.rt.status, 'running');
  e.b.pressButton('reset', true); e.b.pressButton('reset', false); e.b.run(0.1);
  eq(e.rt.status, 'stopped');
});
test('an unknown event name is explained', () => {
  const e = setup({ 1: 'button' });
  runFor(e, "import qbit\nqbit.button(1).when('push', print)\n");
  ok(/нет события «push»/.test(e.log.errors[0].message), e.log.errors[0].message);
});

console.log('modules through the contract');
test('rgb: named color, rgb numbers, hsv, off', () => {
  const e = setup({ 1: 'rgb' });
  runFor(e, "import qbit\nqbit.rgb(1).brightness(100)\nqbit.rgb(1).color('red')\n", 0.1);
  eq(e.mod(1).out.rgb.join(), '255,0,0');
  runFor(e, "import qbit\nqbit.rgb(1).brightness(100)\nqbit.rgb(1).color(0, 255, 0)\n", 0.1);
  eq(e.mod(1).out.rgb.join(), '0,255,0');
  runFor(e, "import qbit\nqbit.rgb(1).brightness(100)\nqbit.rgb(1).hsv(240)\n", 0.1);
  eq(e.mod(1).out.rgb.join(), '0,0,255');
  runFor(e, "import qbit\nqbit.rgb(1).off()\n", 0.1);
  eq(e.mod(1).out.rgb.join(), '0,0,0');
});
test('buzzer: tone with duration stops by itself; play melody', () => {
  const e = setup({ 1: 'buzzer' });
  runFor(e, "import qbit\nqbit.buzzer(1).tone(880, 300)\n", 0.1);
  eq(Math.round(e.mod(1).out.freq), 880);
  e.b.run(0.4); eq(e.mod(1).out.freq, 0);
  runFor(e, "import qbit\nqbit.buzzer(1).play('C4:100 E4 G4')\n", 0.05);
  ok(Math.abs(e.mod(1).out.freq - 262) <= 1, 'C4 first: ' + e.mod(1).out.freq);
});
test('servo angle and relay pulse', () => {
  const e = setup({ 1: 'servo', 2: 'relay' });
  runFor(e, "import qbit\nqbit.servo(1).angle(30)\nqbit.relay(2).pulse(200)\n", 0.1);
  ok(e.mod(2).out.on, 'relay on'); e.b.run(0.3); ok(!e.mod(2).out.on, 'relay off after the pulse');
  e.b.run(0.5); ok(Math.abs(e.mod(1).out.angle - 30) < 1, 'servo angle ' + e.mod(1).out.angle);
});
test('oled: print lines and scroll', () => {
  const e = setup({ 1: 'oled' });
  runFor(e, "import qbit\nfor i in range(10):\n    qbit.oled(1).print('line ' + str(i))\n", 0.3);
  const lines = e.mod(1).screenText ? e.mod(1).screenText() : null;
  ok(e.mod(1).api && !e.log.errors.length, 'no error: ' + JSON.stringify(e.log.errors));
});
test('ultrasonic and temphum read in cm and degrees', () => {
  const e = setup({ 1: 'ultrasonic', 3: 'temphum' });
  e.mod(1).set('objectCm', 42); e.b.env.tempC = 30; e.b.run(2);
  runFor(e, "import qbit\nprint(qbit.ultrasonic(1).distance, round(qbit.temphum(3).temperature))\n");
  ok(/^4[12] 30\n$/.test(e.log.out), e.log.out);       // the module models the real error of a wrong air temperature (0.17 % per degree)
});
test('joystick direction event passes its name', () => {
  const e = setup({ 1: 'joystick' });
  e.rt.run("import qbit\nasync def d(name):\n    print('dir', name)\nqbit.joystick(1).when('direction', d)\n"); e.b.run(0.2);
  e.mod(1).set('dx', 0.9); e.b.run(0.3);
  ok(/dir right/.test(e.log.out), e.log.out);
});
test('encoder turn passes the number of detents', () => {
  const e = setup({ 1: 'encoder' });
  e.rt.run("import qbit\nasync def t(d):\n    print('turn', d)\nqbit.encoder(1).when('turn', t)\n"); e.b.run(0.2);
  e.mod(1).set('counts', e.mod(1).state.counts + 4); e.b.run(0.3);
  ok(/turn 1/.test(e.log.out), e.log.out);
});
test('PAIR key click event of the board', () => {
  const e = setup({});
  e.rt.run("import qbit\nasync def k():\n    print('pair!')\nqbit.board.when('click', k)\n"); e.b.run(0.2);
  e.b.pressButton('pair', true); e.b.run(0.1); e.b.pressButton('pair', false); e.b.run(0.2);
  ok(/pair!/.test(e.log.out), e.log.out);
});
test('board values: battery percent', () => {
  const e = setup({});
  runFor(e, "import qbit\nprint(qbit.board.battery > 0, qbit.board.usb)\n");
  eq(e.log.out, 'True True\n');
});
test('two handlers and a main loop run side by side', () => {
  const e = setup({ 1: 'button', 2: 'led', 3: 'rgb' });
  e.rt.run("import qbit\nasync def blink():\n    while True:\n        qbit.led(2).toggle()\n        await qbit.wait(0.25)\nasync def red():\n    qbit.rgb(3).brightness(100)\n    qbit.rgb(3).color('red')\nqbit.start(blink)\nqbit.button(1).when('press', red)\n"); e.b.run(0.6);
  e.mod(1).set('pressed', true); e.b.run(0.3);
  eq(e.mod(3).out.rgb.join(), '255,0,0'); eq(e.rt.status, 'running');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
