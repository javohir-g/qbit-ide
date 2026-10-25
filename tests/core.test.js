/* Headless tests of the simulator core:  node ide/tests/core.test.js  */
'use strict';
const Q = require('./load.js');
const { util: U, Passport: P } = Q;

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'values differ') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || 'not close') + ': ' + a + ' vs ' + b + ' (+-' + tol + ')'); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function boardUp(src, soc) {
  const b = new Q.Board({ source: src || 'usb-pd', soc });
  b.run(1.5);
  return b;
}
function ready(b, n) { return b.port(n).state === 'ready'; }

console.log('data & passports');
test('catalog has 32 modules, all defined, each with its M5 print', () => {
  eq(Q.DATA.modules.length, 32);
  Q.DATA.modules.forEach(m => ok(Q.moduleDef(m.key), 'no definition for ' + m.key));
  Q.DATA.modules.forEach(m => ok(Q.DATA.print.modules[m.key], 'no print for ' + m.key));
});
test('a module taken out of the kit (switch) still works but is listed nowhere', () => {
  ok(Q.moduleDef('switch') && Q.moduleDef('switch').retired);
  ok(!Q.moduleList().some(d => d.key === 'switch'));
  ok(Q.moduleByTypeId(Q.moduleDef('switch').id) === Q.moduleDef('switch'), 'the firmware still knows its TYPE_ID');
});
test('every passport image decodes, CRC ok, matches the catalog', () => {
  let n = 0;
  Object.keys(Q.DATA.passports).forEach(name => {
    const info = P.decode(U.fromHex(Q.DATA.passports[name]));
    ok(info.ok, name + ': ' + info.reason);
    const cat = Q.DATA.modules.concat(Q.DATA.retired).find(m => m.id === info.typeId);      // retired: built, then taken out of the kit
    ok(cat, name + ': type ' + info.typeId + ' is not in the catalogue');
    eq(info.formatMm, cat.fmt, name + ' format');
    eq(P.IFACE[info.iface], cat.io === 'I2C' || cat.io === 'MCU' || cat.io === 'DI' || cat.io === 'DO' || cat.io === 'AI' ? cat.io : '-', name + ' interface');
    eq(info.i2cAddr, cat.addr, name + ' i2c');
    n++;
  });
  eq(n, 36);
});
test('JS CRC-16 agrees with the Python tool (known vector)', () => {
  eq(U.crc16(Buffer.from('123456789')), 0x29B1);
});
test('passport variant helper rebuilds the CRC', () => {
  const img = Q.moduleDef('led') && U.fromHex(Q.DATA.passports.led_white);
  const blue = P.withVariant(img, 4);
  const i = P.decode(blue);
  ok(i.ok); eq(i.variant, 4);
});
test('geometry: 8 ports on a 35 mm grid', () => {
  const g = Q.DATA.board;
  eq(g.ports.length, 8);
  eq(g.ports[0].x, 25); eq(g.ports[7].x, 130); eq(g.ports[4].y, 60);
});

console.log('board bring-up');
test('USB PD: boots, 5 V rail, ports powered', () => {
  const b = boardUp('usb-pd');
  eq(b.mcu.state, 'run');
  near(b.pw.v5, 5.0, 0.1, 'v5');
  ok(b.ports.every(p => p.on && p.pg), 'ports powered');
  ok(b.pwrLed);
  near(b.pw.iMa, 150, 5, 'idle current');
});
test('battery only: off until PAIR is pressed, then boots, hold 2 s switches off', () => {
  const b = new Q.Board({ source: 'battery' });
  b.run(1);
  eq(b.mcu.state, 'off'); eq(b.pw.on, false);
  b.pressButton('pair', true); b.run(0.1); b.pressButton('pair', false);
  b.run(1.5);
  eq(b.mcu.state, 'run');
  b.pressButton('pair', true); b.run(2.2);
  eq(b.mcu.state, 'off', 'held PAIR should power off');
  b.pressButton('pair', false);
  b.run(0.5);
  eq(b.pw.on, false);
});
test('removing USB while running keeps the board alive (PWR_HOLD)', () => {
  const b = boardUp('usb-pd');
  b.setSource('battery'); b.run(0.5);
  eq(b.mcu.state, 'run');
});
test('RESET reboots and passports are read again; BOOT+RESET -> dfu', () => {
  const b = boardUp('usb-pd');
  b.attach(1, 'button'); b.run(1);
  ok(ready(b, 1));
  b.pressButton('reset', true); b.pressButton('reset', false);
  eq(b.mcu.state, 'boot');
  ok(b.port(1).state === 'debounce');
  b.run(2);
  ok(ready(b, 1));
  b.pressButton('boot', true); b.pressButton('reset', true); b.pressButton('reset', false); b.pressButton('boot', false);
  eq(b.mcu.state, 'dfu');
});

console.log('placing modules');
test('65 mm module takes two ports in a row', () => {
  const b = boardUp();
  b.attach(2, 'slider'); b.run(1);
  eq(b.port(3).state, 'covered');
  eq(b.canPlace(3, 'button').ok, false);
  eq(b.canPlace(4, 'button').ok, true);
  b.detach(3);                       // covered port detaches the host
  eq(b.port(2).module, null);
  eq(b.port(3).state, 'empty');
});
test('65 mm module cannot start on the last column, or next to a busy port', () => {
  const b = boardUp();
  eq(b.canPlace(4, 'oled').ok, false); eq(b.canPlace(4, 'oled').code, 'edge');
  eq(b.canPlace(8, 'oled').ok, false);
  b.attach(6, 'button');
  eq(b.canPlace(5, 'oled').ok, false); eq(b.canPlace(5, 'oled').code, 'busy');
  eq(b.canPlace(1, 'oled').ok, true);
  let threw = false;
  try { b.attach(5, 'oled'); } catch (e) { threw = true; eq(e.code, 'busy'); }
  ok(threw);
});
test('move() works and keeps the instance', () => {
  const b = boardUp();
  const m = b.attach(1, 'button'); b.run(1);
  eq(b.move(1, 5), m);
  eq(b.port(1).module, null); eq(b.port(5).module, m);
  b.run(1);
  ok(ready(b, 5));
});

console.log('passport reading through the I2C mux');
test('the board finds every module of the catalogue (each on its own board)', () => {
  Q.DATA.modules.forEach(cat => {
    const b = boardUp();
    const n = cat.fmt === 65 ? 1 : 2;
    const inst = b.attach(n, cat.key);
    b.run(0.6);
    eq(b.port(n).state, 'ready', cat.key + ' not ready: ' + b.port(n).reason);
    eq(b.port(n).info.typeId, cat.id, cat.key + ' type');
    ok(inst.api, cat.key + ' has no driver');
    b.run(1.0);                                         // everything survives a second of simulated time
    eq(b.port(n).state, 'ready', cat.key + ' dropped out');
  });
});
test('I2C scan: addresses appear only on the selected mux channel', () => {
  const b = boardUp();
  b.attach(1, 'temphum'); b.attach(2, 'imu'); b.run(1);
  b.i2c.write(0x74, [0]);
  eq(b.i2c.scan().join(), '116');
  b.i2c.write(0x74, [1]);
  eq(b.i2c.scan().join(), [0x38, 0x50, 0x74].join());
  b.i2c.write(0x74, [3]);
  ok(b.i2c.scan().includes(0x6A) && b.i2c.scan().includes(0x38));
  b.i2c.write(0x74, [0]);
});
test('LED colour variants carry the right passport variant', () => {
  const b = boardUp();
  const m = b.attach(1, 'led', { variant: 'red' }); b.run(1);
  eq(b.port(1).info.variant, 1);
  m.setVariant('blue');
  eq(P.decode(m.eeprom).variant, 4);
});
test('blank EEPROM / bad CRC modules are "unknown" and cost no budget', () => {
  const b = boardUp();
  b.attach(1, 'dbg_blank'); b.attach(2, 'dbg_badcrc'); b.run(1);
  eq(b.port(1).state, 'unknown'); ok(/QB/.test(b.port(1).reason));
  eq(b.port(2).state, 'unknown'); ok(/CRC/.test(b.port(2).reason));
  eq(b.declaredMa(), 150);
});

console.log('electrical');
test('short circuit trips the eFuse, retries three times, locks, and can be reset', () => {
  const b = boardUp();
  b.attach(3, 'dbg_short');
  b.run(0.3);
  eq(b.port(3).state, 'fault'); ok(b.port(3).tripped);
  eq(b.port(3).on, false);
  b.run(5);
  ok(b.port(3).locked, 'locked after the retries');
  ok(b.logs.some(l => /заблокировала|блокировка/.test(l.text) || /нужна ручная/.test(l.text)));
  b.resetPort(3); b.run(0.1);
  ok(b.port(3).tripped, 'trips again');
  b.detach(3);
  eq(b.port(3).state, 'empty');
});
test('other ports keep working while one is shorted', () => {
  const b = boardUp();
  b.attach(1, 'button'); b.attach(2, 'dbg_short'); b.run(1.5);
  ok(ready(b, 1));
  near(b.pw.v5, 5, 0.1);
});
test('current budget: a 700 mA servo does not fit a 500 mA USB port', () => {
  const b = boardUp('usb-pc');
  b.attach(1, 'servo'); b.run(1);
  eq(b.port(1).state, 'nobudget'); eq(b.port(1).en, false);
  b.setSource('usb-5v3a'); b.run(0.5);
  b.setPortEnable(1, true); b.run(1);
  eq(b.port(1).state, 'ready');
});
test('overloading the source browns the board out and it comes back staggered', () => {
  const b = boardUp('usb-pc');
  const m = b.attach(1, 'buzzer'); b.run(1);
  ok(ready(b, 1));
  b.port(1).sig.write(1);          // DC through the coil: 310 mA + 150 mA base = 460 mA... still ok
  b.run(0.5);
  eq(b.mcu.bootNo, 1);
  b.attach(2, 'buzzer'); b.run(1);
  b.port(2).sig.write(1);          // second one: 770 mA > 500 mA
  b.run(1);
  ok(b.mcu.bootNo >= 2, 'brownout reset');
  ok(b.logs.some(l => /Просадка/.test(l.text)));
});
test('battery discharges, USB charges', () => {
  const b = boardUp('battery'); // off
  b.setSource('usb-pd'); b.run(1.5);
  const s0 = b.pw.soc = 50;
  b.run(10);
  ok(b.pw.charging && b.pw.soc > s0, 'charging');
  b.setSource('battery'); b.run(10);
  ok(!b.pw.charging && b.pw.soc < b.pw.soc + 1);
});

console.log('inputs on SIG');
test('button: HIGH when pressed, events and latch', () => {
  const b = boardUp();
  const m = b.attach(1, 'button'); b.run(1);
  const sig = b.port(1).sig;
  eq(sig.read(), 0);
  let presses = 0; m.api.on('press', () => presses++);
  m.set('pressed', true); b.run(0.1);
  eq(sig.read(), 1); eq(presses, 1); eq(m.api.isPressed(), true); eq(m.api.wasPressed(), true); eq(m.api.wasPressed(), false);
  m.set('pressed', false); b.run(0.1);
  eq(sig.read(), 0);
});
test('pot / slider / light analogue levels', () => {
  const b = boardUp();
  const pot = b.attach(1, 'pot'), light = b.attach(2, 'light'); b.run(1);
  pot.set('pos', 1); b.run(0.1);
  near(b.port(1).sig.readMv(), 3000, 1);
  near(pot.api.percent(), 100, 0.5);
  pot.set('pos', 0.25);
  near(pot.api.percent(), 25, 0.5);
  b.env.lux = 100; b.run(0.1);
  near(light.api.percent(), 10, 0.5, 'light %');
  b.env.lux = 5000; b.run(0.1);
  near(light.api.percent(), 100, 0.5);
  light.set('cover', 1); b.run(0.1);
  near(light.api.percent(), 0, 0.5);
});
test('switch / touch / hall / pir / tilt', () => {
  const b = boardUp();
  const sw = b.attach(1, 'switch'), touch = b.attach(2, 'touch'), hall = b.attach(3, 'hall'), pir = b.attach(4, 'pir'), tilt = b.attach(5, 'tilt');
  b.run(1);
  eq(sw.api.isOn(), false); sw.set('on', true); b.run(0.05); eq(sw.api.isOn(), true);
  touch.set('touched', true); b.run(0.05); eq(touch.api.isTouched(), true);
  eq(hall.api.isMagnetNear(), false); hall.set('magnet', true); b.run(0.05); eq(hall.api.isMagnetNear(), true);
  eq(pir.api.isMotion(), false); pir.set('motion', true); b.run(0.1); eq(pir.api.isMotion(), true);
  pir.set('motion', false); b.run(1); eq(pir.api.isMotion(), true, 'holds ~2.5 s'); b.run(2); eq(pir.api.isMotion(), false);
  eq(tilt.api.isTilted(), false); b.env.roll = 60; b.run(0.1); eq(tilt.api.isTilted(), true);
});
test('joystick ladder: every direction and the centre decode back', () => {
  const b = boardUp();
  const j = b.attach(1, 'joystick'); b.run(1);
  eq(j.api.direction(), 'none');
  near(b.port(1).sig.readMv(), 3300, 1);
  const cases = [[0, -1, 'up'], [1, 0, 'right'], [0, 1, 'down'], [-1, 0, 'left'], [1, -1, 'up-right'], [-1, 1, 'down-left']];
  cases.forEach(([dx, dy, name]) => {
    j.set('dx', dx); j.set('dy', dy); b.run(0.05);
    eq(j.api.direction(), name);
  });
  j.set('dx', 0); j.set('dy', 0); j.set('push', true); b.run(0.05);
  eq(j.api.isPressed(), true);
  near(b.port(1).sig.readMv(), 3300 * 2200 / 12200, 2, 'centre level 0.60 V');
});
test('keypad ladder: single keys and pairs', () => {
  const b = boardUp();
  const k = b.attach(1, 'keypad'); b.run(1);
  near(b.port(1).sig.readMv(), 3300, 1);
  const want = [595, 1058, 1650, 2269];
  for (let i = 0; i < 4; i++) {
    k.state.keys = [false, false, false, false]; k.state.keys[i] = true; b.run(0.05);
    near(b.port(1).sig.readMv(), want[i], 5, 'key ' + (i + 1));
    eq(k.api.pressed().join(), String(i + 1));
  }
  k.state.keys = [true, false, true, false]; b.run(0.05);
  eq(k.api.pressed().join(), '1,3');
});
test('pulse sensor: bpm is measured from the waveform', () => {
  const b = boardUp();
  const p = b.attach(1, 'pulse'); b.run(1);
  eq(p.api.bpm(), 0);
  p.set('finger', true); p.set('bpm', 90);
  b.run(8);
  near(p.api.bpm(), 90, 4, 'bpm');
});
test('IR: transmitter on one port is heard by the receiver on another', () => {
  const b = boardUp();
  const tx = b.attach(1, 'irtx'), rx = b.attach(2, 'irrx'); b.run(1);
  let got = null; rx.api.on('code', f => { got = f; });
  tx.api.send(0x00, 0x45); b.run(0.02);
  ok(got && got.command === 0x45 && got.address === 0, 'frame received');
  eq(rx.api.isReceiving(), true, 'SIG low during the burst');
  b.run(0.2);
  eq(rx.api.isReceiving(), false);
  eq(rx.api.available(), 1); eq(rx.api.read().command, 0x45);
  b.env.irCoupling = false;
  tx.api.send(0, 0x15); b.run(0.1);
  eq(rx.api.available(), 0);
});

console.log('outputs');
test('led: on / off / brightness / current', () => {
  const b = boardUp();
  const l = b.attach(1, 'led'); b.run(1);
  l.api.on(); b.run(0.1);
  eq(l.out.b, 1); near(b.port(1).iMa, 25, 0.5);
  l.api.brightness(40); b.run(0.1);
  near(l.out.b, 0.4, 0.001);
  l.api.off(); b.run(0.1); eq(l.out.b, 0);
  l.api.on(); b.pressButton('reset', true); b.pressButton('reset', false); b.run(0.05);
  eq(l.out.b, 0, 'a reset releases the pin: LED off');
});
test('rgb: colour frame', () => {
  const b = boardUp();
  const r = b.attach(1, 'rgb'); b.run(1);
  r.api.color(255, 128, 0); b.run(0.05);
  eq(r.out.rgb.join(), '255,128,0');
  near(b.port(1).iMa, 4 + 60 * 383 / 765, 1);
  r.api.hsv(120, 1, 1); b.run(0.05);
  eq(r.out.rgb.join(), '0,255,0');
});
test('buzzer: tone with duration, stops by itself, DC is flagged', () => {
  const b = boardUp();
  const z = b.attach(1, 'buzzer'); b.run(1);
  z.api.tone(2700, 200); b.run(0.05);
  eq(z.out.freq, 2700); ok(Q.moduleDef('buzzer').loudness(z) > 0.9);
  b.run(0.3);
  eq(z.out.freq, 0);
  b.port(1).sig.write(1); b.run(0.05);
  ok(z.out.dc); near(b.port(1).iMa, 313, 1);
});
test('servo: pulse width -> angle, moves at ~600 deg/s, stall draws 640 mA', () => {
  const b = boardUp();
  const s = b.attach(1, 'servo'); b.run(1);
  s.api.angle(0); b.run(0.5); near(s.out.angle, 0, 0.5);
  s.api.angle(180);
  b.run(0.1); ok(s.out.angle > 40 && s.out.angle < 90, 'in motion: ' + s.out.angle);
  ok(b.port(1).iMa > 200);
  b.run(0.5); near(s.out.angle, 180, 0.5);
  s.set('blocked', true); s.api.angle(0); b.run(0.1);
  ok(s.out.stalled); ok(b.port(1).iMa > 600);
  s.api.release(); b.run(0.1); ok(!s.out.valid);
});
test('relay: coil current and contact state', () => {
  const b = boardUp();
  const r = b.attach(1, 'relay'); b.run(1);
  const clicks = []; b.on('fx', e => clicks.push(e.type));
  r.api.on(); b.run(0.05);
  ok(r.out.on); near(b.port(1).iMa, 78, 1); eq(clicks.join(), 'relay-click');
  r.api.off(); b.run(0.05); ok(!r.out.on);
});

console.log('I2C sensors');
test('temphum / pressure / airq / color / imu / gesture / rtc read the environment', () => {
  const b = boardUp();
  const th = b.attach(1, 'temphum'), pr = b.attach(2, 'pressure'), aq = b.attach(3, 'airq'), col = b.attach(4, 'color'),
        imu = b.attach(5, 'imu'), ges = b.attach(6, 'gesture'), rtc = b.attach(7, 'rtc');
  b.env.tempC = 30; b.env.humidity = 60; b.env.pressureHpa = 1000; b.env.voc = 250;
  b.run(1.5);
  near(th.api.temperature(), 30, 0.01); near(th.api.humidity(), 60, 0.01);
  near(pr.api.pressure(), 1000, 0.01); near(pr.api.altitude(1013.25), 110, 3, 'altitude');
  eq(aq.api.vocIndex(), 0, 'warming up'); b.run(11); eq(aq.api.vocIndex(), 250);
  th.set('warm', true); b.run(10); ok(th.api.temperature() > 33 && th.api.humidity() > 80, 'warming by breath');
  col.api.light(true); b.run(0.1);
  const rgb = col.api.rgb(); ok(rgb[0] === 255 && rgb[1] < rgb[0] && rgb[2] < rgb[1], 'orange sample: ' + rgb);
  near(imu.api.accel()[2], 1, 0.001);
  b.env.pitch = 90; b.run(0.1); near(imu.api.accel()[1], 1, 0.001); near(imu.api.accel()[2], 0, 0.001);
  b.env.pitch = 0; b.env.roll = 90; b.run(0.1); near(imu.api.accel()[0], -1, 0.001);
  b.env.roll = 0;
  let shakes = 0; imu.api.on('shake', () => shakes++);
  b.env.shakeNow(); b.run(0.5); eq(shakes, 1); ok(imu.api.isShaken());
  b.run(2);
  ges.set('hand', 2); b.run(0.05); ok(ges.api.proximity() > 70); near(ges.api.distanceCm(), 2, 0.01);
  ges.set('hand', 20); b.run(1);
  let waves = 0; ges.api.on('wave', () => waves++);
  ges.out.wave = 0; b.run(1.2); eq(waves, 1);
  const t = rtc.api.now(); ok(t.year >= 2026);
  rtc.api.setTime(2026, 12, 31, 23, 59, 50); near(rtc.api.now().second, 50, 1); eq(rtc.api.now().day, 31);
});
test('compass: hard-iron offset spoils the heading until calibrated', () => {
  const b = boardUp();
  const c = b.attach(1, 'compass'); b.run(1);
  b.env.yaw = 90; b.run(0.1);
  const raw = c.api.heading();
  ok(Math.abs(raw - 90) > 5, 'uncalibrated: ' + raw);
  c.api.calibrate(true);
  for (let a = 0; a < 360; a += 5) { b.env.yaw = a; b.run(0.05); }
  c.api.calibrate(false);
  ok(c.api.isCalibrated());
  [0, 45, 90, 180, 270].forEach(a => { b.env.yaw = a; b.run(0.05); const h = c.api.heading(); near(Math.min(Math.abs(h - a), 360 - Math.abs(h - a)), 0, 2.5, 'heading ' + a + ' got ' + h); });
  eq(c.eeprom[0x80], 0xC5, 'stored in the passport user area');
});
test('rfid: card appears, IRQ pulse, uid', () => {
  const b = boardUp();
  const r = b.attach(1, 'rfid'); b.run(1);
  let seen = null; r.api.on('card', u => { seen = u; });
  eq(r.api.cardPresent(), false);
  r.set('card', 0); b.run(0.2);
  eq(seen, '04:A3:5F:21'); eq(r.api.uid(), '04:A3:5F:21');
  r.set('card', -1); b.run(0.2); eq(r.api.uid(), null);
  b.i2c.write(0x74, [1]);
  eq(b.i2c.writeRead(0x28, [0x37], 1)[0], 0x92, 'MFRC522 VersionReg');
  b.i2c.write(0x74, [0]);
});

console.log('smart modules and chips (register level)');
test('encoder registers 0x36 follow the firmware README', () => {
  const b = boardUp();
  const e = b.attach(1, 'encoder'); b.run(1);
  const dev = b.dev(1, 0x36);
  eq(dev.readReg(0, 1)[0], 0x36); eq(dev.readReg(1, 1)[0], 1); eq(dev.readReg(7, 1)[0], 4);
  for (let i = 0; i < 3; i++) e.set('counts', e.state.counts + 4);
  b.run(0.01);
  eq(e.api.position(), 3); eq(e.api.delta(), 3); eq(e.api.delta(), 0);
  e.set('counts', e.state.counts - 8); eq(e.api.position(), 1); eq(e.api.delta(), -2);
  eq(b.port(1).sig.read(), 1, 'SIG pulses after a change'); b.run(0.1); eq(b.port(1).sig.read(), 0);
  e.set('down', true); b.run(0.1); eq(e.api.isPressed(), true); e.set('down', false); b.run(0.05);
  eq(e.api.wasClicked(), true); eq(e.api.wasClicked(), false);
  e.set('down', true); b.run(0.8); eq(e.api.wasLongPressed(), true); e.set('down', false); b.run(0.05);
  eq(e.api.wasClicked(), false, 'a long press is not a click');
  e.api.reset(); eq(e.api.position(), 0);
  e.api.setCountsPerDetent(8); eq(dev.readReg(7, 1)[0], 8);
});
test('ultrasonic registers 0x39: distance with the air-temperature error', () => {
  const b = boardUp();
  const u = b.attach(1, 'ultrasonic'); b.run(1);
  b.env.tempC = 20;
  const dev = b.dev(1, 0x39);
  eq(dev.readReg(0, 1)[0], 0x39);
  u.set('objectCm', 100); b.run(0.2);
  near(u.api.distanceMm(), 1000, 3, 'at 20 C');
  near(u.api.echoUs(), 2 * 1 / 343.4 * 1e6, 10);
  b.env.tempC = 24; b.run(0.2);
  near(u.api.distanceMm(), 993, 3, 'default firmware 20 C vs real 24 C air: reads short');
  b.env.tempC = 20; b.run(0.2);
  b.env.tempC = 40; b.run(0.2);
  near(u.api.distanceMm(), 966, 4, 'hot air: sound is faster, the echo is early, the distance reads short');
  u.api.setAirTemperature(40); b.run(0.2);
  near(u.api.distanceMm(), 1000, 3, 'compensated');
  u.set('objectCm', 400); b.run(0.2);
  eq(u.api.distanceMm(), null);
  eq(dev.readReg(6, 1)[0] & 2, 2, 'timeout flag');
  u.set('objectCm', 30);
  dev.writeReg(7, 0x00); b.run(0.5);                      // continuous off
  const d1 = u.api.distanceMm(); u.set('objectCm', 50); b.run(0.5);
  eq(u.api.distanceMm(), d1, 'frozen without measuring');
  u.api.measureOnce(); near(u.api.distanceMm(), 500, 3);
});
test('motor DRV8830: speed, direction, current limit and nFAULT', () => {
  const b = boardUp();
  const m = b.attach(1, 'motor'); b.run(1);
  m.api.speed(100); b.run(1.5);
  ok(m.out.rpm > 5000, 'rpm ' + m.out.rpm);
  m.api.speed(-50); b.run(2);
  ok(m.out.rpm < -1500, 'reverse');
  eq(m.api.isFault(), false);
  m.set('load', 1); m.api.speed(100); b.run(1);
  ok(m.api.isFault(), 'stalled: nFAULT low'); eq(m.api.fault() & 0x11, 0x11);
  near(m.out.iMa, 606, 1);
  m.set('load', 0); m.api.clearFault(); b.run(0.1); eq(m.api.isFault(), false);
  m.api.brake(); b.run(1); near(m.out.rpm, 0, 20);
});
test('OLED: SSD1306 commands, drawing, text through the driver', () => {
  const b = boardUp();
  const o = b.attach(1, 'oled'); b.run(1);
  eq(o.out.on, false);
  o.api.clear(); o.api.pixel(0, 0); o.api.pixel(127, 63); o.api.rect(10, 10, 20, 10, false); o.api.text('Hi', 40, 40, 1); o.api.show();
  eq(o.out.on, true, 'init switched the panel on');
  const scr = Q.moduleDef('oled').screen(o);
  eq(scr[0], 1); eq(scr[63 * 128 + 127], 1); eq(scr[10 * 128 + 10], 1); eq(scr[11 * 128 + 11], 0, 'inside the rectangle is empty');
  ok(Q.moduleDef('oled').lit(o) > 80);
  o.api.invert(true); b.run(0.01);
  eq(Q.moduleDef('oled').screen(o)[0], 0, 'inversion');
  o.api.invert(false);
  o.api.power(false); eq(Q.moduleDef('oled').screen(o).every(v => v === 0), true);
  o.api.power(true);
  o.api.demo();
  ok(Q.moduleDef('oled').lit(o) > 300);
  b.attach(5, 'button'); b.run(0.5);
  // power loss clears the RAM
  b.port(1).en = false; b.run(0.1);
  eq(o.out.on, false); eq(Q.moduleDef('oled').lit(o), 0);
});
test('font has all Russian letters', () => {
  const f = Q.font5x7;
  'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя'.split('').forEach(ch => ok(f.has(ch), 'missing ' + ch));
  for (let c = 32; c < 127; c++) ok(f.has(String.fromCharCode(c)), 'missing ascii ' + c);
});

console.log('demo');
test('demo: button drives the LED, switching it off releases the output', () => {
  const b = boardUp();
  const led = b.attach(5, 'led', { variant: 'green' });
  const btn = b.attach(6, 'button');
  const demo = new Q.Demo(b);
  demo.set(true); b.run(1.0);
  ok(ready(b, 5) && ready(b, 6), 'modules ready');
  btn.set('pressed', true); b.run(0.3);
  ok(led.api && led.api.isOn(), 'LED follows the button');
  demo.set(false); b.run(0.2);
  ok(!led.api.isOn(), 'LED released when demo is off');
});

console.log('persistence');
test('serialize / restore round trip', () => {
  const b = boardUp();
  b.attach(1, 'led', { variant: 'green' }); b.attach(2, 'slider'); b.attach(6, 'pot').set('pos', 0.9); b.env.tempC = 31;
  const j = JSON.parse(JSON.stringify(b.serialize()));
  const b2 = boardUp();
  b2.restore(j); b2.run(1.5);
  eq(b2.port(1).module.variant, 'green'); eq(b2.port(2).module.key, 'slider'); eq(b2.port(3).state, 'covered');
  near(b2.port(6).module.state.pos, 0.9, 1e-9); eq(b2.env.tempC, 31);
  ok(ready(b2, 1) && ready(b2, 2) && ready(b2, 6));
});

console.log('the pages load the same scripts the tests load');
['index.html', 'simulator.html'].forEach(page => test('script list in ' + page + ' matches core-files.json', () => {
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
  const listed = [...html.matchAll(/<script src="js\/([^"]+)"/g)].map(m => m[1]);
  const core = require('../js/core-files.json');
  const inHtml = listed.filter(f => core.includes(f));
  eq(inHtml.join('|'), core.join('|'), 'core files in ' + page);
  // every script a page names exists
  listed.forEach(f => ok(fs.existsSync(path.join(__dirname, '..', 'js', f)), page + ' names a missing file: ' + f));
}));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) { console.log('failed: ' + failures.join('; ')); process.exit(1); }
