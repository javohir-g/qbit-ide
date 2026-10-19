/* Browser-side tests of the block layer: catalogue, generators, and whole programs from blocks run on the simulated board.
   Run by  node ide/tests/browser.test.js  (headless Chrome) or just open ide.test.html. */
(function () {
  'use strict';
  var Q = window.QBIT, Blockly = window.Blockly;
  var out = document.getElementById('out'), passed = 0, failed = 0, lines = [];
  function test(name, fn) {
    try { fn(); passed++; lines.push('ok   ' + name); out.insertAdjacentHTML('beforeend', '<div class="ok">ok &nbsp; ' + name + '</div>'); }
    catch (e) { failed++; var msg = (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)); lines.push('FAIL ' + name + ' :: ' + msg); out.insertAdjacentHTML('beforeend', '<div class="bad">FAIL ' + name + '</div><pre>' + msg.replace(/</g, '&lt;') + '</pre>'); }
  }
  function eq(a, b, m) { if (a !== b) throw new Error((m || 'differ') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
  function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

  Q.Blocks.install(Blockly);

  /** build a workspace from a compact description: [hatType, {fields}, [child, ...]] */
  function mk(ws, spec) {
    var b = ws.newBlock(spec[0]);
    var f = spec[1] || {};
    Object.keys(f).forEach(function (k) { b.setFieldValue(f[k], k); });
    var kids = spec[2] || [];
    return { block: b, kids: kids };
  }
  function build(ws, spec) {
    var n = mk(ws, spec), b = n.block, prev = null, first = true;
    // children chain into the DO input (statements) in order
    n.kids.forEach(function (k) {
      var child = build(ws, k);
      if (k.input) {                                        // value child: {input:'TIMES'}
        b.getInput(k.input).connection.connect(child.outputConnection);
      } else if (prev) prev.nextConnection.connect(child.previousConnection);
      else if (b.getInput('DO')) b.getInput('DO').connection.connect(child.previousConnection);
      if (!k.input) prev = child;
    });
    return b;
  }
  function num(v) { var b = Blockly.getMainWorkspace; return v; }
  function program(spec) {
    var ws = new Blockly.Workspace();
    var top = build(ws, spec);
    return { ws: ws, top: top, gen: Q.Blocks.generate(ws) };
  }
  function withValue(spec, input, valueSpec) { var s = spec.slice(); var vs = valueSpec.slice(); vs.input = input; return vs; }
  function child(spec, extra) { spec.input = extra; return spec; }
  function val(input, spec) { spec.input = input; return spec; }

  function boardWith(mods) {
    var b = new Q.Board({ source: 'usb-pd' });
    b.run(1.5);
    Object.keys(mods).forEach(function (n) { var v = mods[n]; b.attach(+n, Array.isArray(v) ? v[0] : v, Array.isArray(v) ? v[1] : undefined); });
    b.run(1);
    return b;
  }
  function runBlocks(spec, mods, seconds) {
    var p = program(spec), b = boardWith(mods), rt = new Q.Runtime(b), res = { out: '', errors: [], code: p.gen.code, rt: rt, b: b, map: p.gen.map };
    rt.on('print', function (s) { res.out += s; }); rt.on('error', function (e) { res.errors.push(e); });
    rt.run(p.gen.code); b.run(seconds === undefined ? 1 : seconds);
    return res;
  }

  /* ------------------------------------------------------------------------------------------------ catalogue */
  test('every catalogue block points at something the qbit contract has', function () {
    var bad = [];
    Q.Catalog.blocks.forEach(function (r) {
      if (r.mod !== 'board' && !Q.SPEC.modules[r.mod]) { bad.push(r.id + ': module ' + r.mod); return; }
      var re = /qbit\.(\w+)(?:\(\{PORT\}\))?\.(\w+)/g, m;
      while ((m = re.exec(r.py))) {
        var mod = m[1], name = m[2];
        if (mod === 'wait_ms' || mod === 'wait') continue;
        var spec = mod === 'board' ? Q.SPEC.board : Q.SPEC.modules[mod];
        if (!spec) { bad.push(r.id + ': no module ' + mod); continue; }
        var found = spec.values.some(function (v) { return v.py === name; }) || spec.commands.some(function (c) { return c.n === name; });
        if (!found) bad.push(r.id + ': ' + mod + '.' + name);
      }
    });
    eq(bad.join('; '), '');
  });
  test('block ids are unique and every block can be created', function () {
    var ws = new Blockly.Workspace(), seen = {};
    Q.Catalog.blocks.forEach(function (r) { ok(!seen[r.id], 'duplicate ' + r.id); seen[r.id] = 1; var b = ws.newBlock(r.id); ok(b, r.id); });
    ['qbit_when_started', 'qbit_when_event', 'qbit_when_pair', 'qbit_when_message', 'qbit_send_message', 'qbit_event_value', 'qbit_wait', 'qbit_repeat', 'qbit_forever', 'qbit_stop', 'qbit_print'].forEach(function (t) { ok(ws.newBlock(t), t); });
  });
  test('every catalogue block produces Python that parses', function () {
    var bad = [];
    Q.Catalog.blocks.forEach(function (r) {
      var ws = new Blockly.Workspace(), hat = ws.newBlock('qbit_when_started'), b = ws.newBlock(r.id);
      if (r.kind === 'action') hat.getInput('DO').connection.connect(b.previousConnection);
      else { var pr = ws.newBlock('qbit_print'); hat.getInput('DO').connection.connect(pr.previousConnection); pr.getInput('TEXT').connection.connect(b.outputConnection); }
      var g = Q.Blocks.generate(ws);
      try { Q.Py.compile(g.code); } catch (e) { bad.push(r.id + ': ' + e.message + '\n' + g.code); }
    });
    eq(bad.join('\n---\n'), '');
  });

  /* ------------------------------------------------------------------------------------------------ generator */
  test('blink program generates readable Python with a line map', function () {
    var p = program(['qbit_when_started', {}, [['qbit_forever', {}, [['led_turn', { PORT: '1', STATE: 'on' }], ['qbit_wait', {}], ['led_turn', { PORT: '1', STATE: 'off' }], ['qbit_wait', {}]]]]]);
    var c = p.gen.code;
    ok(/^import qbit/m.test(c), 'imports qbit');
    ok(/async def on_start\(\):/.test(c), c);
    ok(/qbit\.led\(1\)\.on\(\)/.test(c) && /await qbit\.wait\(1\)/.test(c), c);
    ok(/qbit\.start\(on_start\)\nqbit\.run\(\)/.test(c), c);
    ok(!/#@/.test(c), 'markers are removed');
    var n = 0; for (var k in p.gen.map) n++;
    ok(n >= 5, 'line map has entries: ' + n);
  });
  test('loose blocks (no hat) are not turned into code', function () {
    var ws = new Blockly.Workspace(); ws.newBlock('led_turn');
    var g = Q.Blocks.generate(ws);
    ok(!/qbit\.led/.test(g.code), g.code); eq(g.hats, 0);
  });
  test('event hat with a value: handler gets event_value', function () {
    var p = program(['qbit_when_event', { MOD: 'encoder', PORT: '2', EVENT: 'turn' }, [['qbit_print', {}, [val('TEXT', ['qbit_event_value', {}])]]]]);
    ok(/async def when_encoder_p2_turn\(event_value\):/.test(p.gen.code), p.gen.code);
    ok(/qbit\.encoder\(2\)\.when\('turn', when_encoder_p2_turn\)/.test(p.gen.code), p.gen.code);
  });
  test('changing the module of an event hat fixes the event', function () {
    var ws = new Blockly.Workspace(), h = ws.newBlock('qbit_when_event');
    h.setFieldValue('button', 'MOD'); h.setFieldValue('long', 'EVENT'); eq(h.getFieldValue('EVENT'), 'long');
    h.setFieldValue('imu', 'MOD'); eq(h.getFieldValue('EVENT'), 'shake');
  });
  test('functions become async def and are awaited', function () {
    var ws = new Blockly.Workspace();
    var def = ws.newBlock('procedures_defnoreturn'); def.setFieldValue('моргнуть', 'NAME');
    var led = ws.newBlock('led_turn'); led.setFieldValue('1', 'PORT'); def.getInput('STACK').connection.connect(led.previousConnection);
    var hat = ws.newBlock('qbit_when_started'), call = ws.newBlock('procedures_callnoreturn'); call.setFieldValue('моргнуть', 'NAME');
    hat.getInput('DO').connection.connect(call.previousConnection);
    var c = Q.Blocks.generate(ws).code;
    ok(/async def /.test(c) && /await /.test(c), c);
    Q.Py.compile(c);
  });

  /* ------------------------------------------------------------------------------------------------ programs on the simulator */
  test('blocks: blink an LED', function () {
    var r = runBlocks(['qbit_when_started', {}, [['led_turn', { PORT: '1', STATE: 'on' }], ['qbit_wait', {}], ['led_turn', { PORT: '1', STATE: 'off' }]]], { 1: 'led' }, 0.5);
    eq(r.errors.length, 0, JSON.stringify(r.errors)); ok(r.b.port(1).module.api.isOn(), 'on at 0.5 s');
    r.b.run(1); ok(!r.b.port(1).module.api.isOn(), 'off at 1.5 s');
  });
  test('blocks: when button pressed, repeat 3 beeps', function () {
    var r = runBlocks(['qbit_when_event', { MOD: 'button', PORT: '2', EVENT: 'press' }, [['qbit_repeat', {}, [['qbit_print', {}]]]]], { 2: 'button' }, 0.3);
    eq(r.errors.length, 0, JSON.stringify(r.errors));
    r.b.port(2).module.set('pressed', true); r.b.run(0.5);
    eq(r.errors.length, 0, JSON.stringify(r.errors) + r.code);
  });
  test('blocks: a sensor value in an expression', function () {
    var ws = new Blockly.Workspace(), hat = ws.newBlock('qbit_when_started'), pr = ws.newBlock('qbit_print'), pot = ws.newBlock('pot_value');
    pot.setFieldValue('3', 'PORT'); hat.getInput('DO').connection.connect(pr.previousConnection); pr.getInput('TEXT').connection.connect(pot.outputConnection);
    var g = Q.Blocks.generate(ws), b = boardWith({ 3: 'pot' }); b.port(3).module.set('pos', 0.4); b.run(0.3);
    var rt = new Q.Runtime(b), outp = ''; rt.on('print', function (s) { outp += s; }); rt.run(g.code); b.run(0.3);
    eq(outp, '40\n');
  });
  test('blocks: wrong module on the port gives a readable error with a block id for the line', function () {
    var r = runBlocks(['qbit_when_started', {}, [['led_turn', { PORT: '1', STATE: 'on' }]]], { 1: 'button' }, 0.3);
    eq(r.errors.length, 1); ok(/стоит «Кнопка»/.test(r.errors[0].message), r.errors[0].message);
    ok(r.map[r.errors[0].line], 'the failing line maps to a block: line ' + r.errors[0].line + ' map ' + JSON.stringify(r.map));
  });
  test('blocks: a variable, a loop with a counter and math', function () {
    var ws = new Blockly.Workspace(), hat = ws.newBlock('qbit_when_started');
    var v = ws.getVariableMap().createVariable('счёт');
    var set = ws.newBlock('variables_set'); set.setFieldValue(v.getId(), 'VAR');
    var n = ws.newBlock('math_number'); n.setFieldValue(5, 'NUM'); set.getInput('VALUE').connection.connect(n.outputConnection);
    hat.getInput('DO').connection.connect(set.previousConnection);
    var pr = ws.newBlock('qbit_print'), get = ws.newBlock('variables_get'); get.setFieldValue(v.getId(), 'VAR');
    pr.getInput('TEXT').connection.connect(get.outputConnection); set.nextConnection.connect(pr.previousConnection);
    var g = Q.Blocks.generate(ws), b = boardWith({}), rt = new Q.Runtime(b), outp = ''; rt.on('print', function (s) { outp += s; }); rt.on('error', function (e) { outp += 'ERR ' + e.message; });
    rt.run(g.code); b.run(0.3); eq(outp, '5\n', g.code);
  });

  window.__results = { passed: passed, failed: failed, lines: lines };
  out.insertAdjacentHTML('beforeend', '<h4>' + passed + ' passed, ' + failed + ' failed</h4>');
  window.__done = true;
})();
