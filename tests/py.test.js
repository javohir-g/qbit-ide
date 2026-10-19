/* Tests of the Python interpreter:  node ide/tests/py.test.js  */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.QBIT = globalThis.QBIT || {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'pyinterp.js'), 'utf8'), { filename: 'pyinterp.js' });
const Py = QBIT.Py;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'differ') + ':\n   got      ' + JSON.stringify(a) + '\n   expected ' + JSON.stringify(b)); }

/** run a program to the end (sleeping tasks are woken by a fake clock); returns printed text */
function run(src, opts) {
  let out = '';
  const interp = new Py.Interp(Object.assign({ print: (s, end) => { out += s + end; } }, opts && opts.interp));
  if (opts && opts.modules) Object.assign(interp.modules, opts.modules);
  const sched = new Py.Scheduler(interp, { onError: (e) => { throw e; } });
  sched.spawn(interp.module(Py.compile(src)), 'main');
  let t = 0;
  for (let i = 0; i < 100000 && !sched.idle(); i++) { sched.step(t); t += 0.01; }
  if (!sched.idle()) throw new Error('program did not finish');
  return out;
}
function expectOut(src, expected) { eq(run(src), expected); }
function expectError(src, type, part) {
  try { run(src); } catch (e) {
    if (!(e instanceof Py.PyError)) throw e;
    if (e.type !== type) throw new Error('expected ' + type + ', got ' + e.message);
    if (part && e.message.indexOf(part) < 0) throw new Error('message "' + e.message + '" lacks "' + part + '"');
    return;
  }
  throw new Error('no error, expected ' + type);
}

console.log('expressions');
test('arithmetic and precedence', () => expectOut('print(1 + 2 * 3, (1 + 2) * 3, 2 ** 3 ** 2, -2 ** 2, 7 // 2, -7 // 2, 7 % 3, -7 % 3, 7 / 2)', '7 9 512 -4 3 -4 1 2 3.5\n'));
test('floats and rounding', () => expectOut('print(round(2.5), round(3.5), round(2.675, 2), round(-0.5), abs(-3), 0.1 + 0.2, 1e3, 1.5e-7)', '2 4 2.67 0 3 0.30000000000000004 1000 1.5e-07\n'));
test('strings', () => expectOut("s = 'Hello'\nprint(s + ' ' + 'world', s * 2, s[1], s[-1], s[1:3], s[::-1], len(s), s.upper(), 'ell' in s)", 'Hello world HelloHello e o el olleH 5 HELLO True\n'));
test('string methods', () => expectOut("print(' a b '.strip(), 'a,b,c'.split(','), '-'.join(['x', 'y']), 'abc'.replace('b', 'X'), 'abc'.find('c'), 'Abc'.lower(), 'abc'.startswith('ab'))", "a b ['a', 'b', 'c'] x-y aXc 2 abc True\n"));
test('format and f-strings', () => expectOut("x = 3.14159\nn = 7\nprint(f'{x:.2f} {n:03d} {n:>4}|{n:<4}|{n:^5}|', '{} and {}'.format(1, 'a'), '%d-%s-%.1f' % (5, 'q', 2.55), f'{n}{n*2}')", '3.14 007    7|7   |  7  | 1 and a 5-q-2.5 714\n'));
test('lists', () => expectOut("l = [3, 1, 2]\nl.append(5)\nl.sort()\nprint(l, l[0], l[-1], l[1:3], len(l), sum(l), max(l), min(l), sorted(l, reverse=True), 2 in l, l.index(3))", '[1, 2, 3, 5] 1 5 [2, 3] 4 11 5 1 [5, 3, 2, 1] True 2\n'));
test('list ops', () => expectOut("a = [1, 2]\nb = a + [3]\nc = a * 2\nd = [0] * 3\nd[1] = 9\nprint(b, c, d, a.pop(), a)", '[1, 2, 3] [1, 2, 1, 2] [0, 9, 0] 2 [1]\n'));
test('tuples and unpacking', () => expectOut("a, b = 1, 2\na, b = b, a\nt = (1, 2, 3)\nx, y, z = t\nprint(a, b, t, x + y + z, (1,))", '2 1 (1, 2, 3) 6 (1,)\n'));
test('dicts', () => expectOut("d = {'a': 1, 'b': 2}\nd['c'] = 3\nprint(d, d['a'], d.get('z', 0), 'b' in d, len(d), list(d.keys()), list(d.values()))", "{'a': 1, 'b': 2, 'c': 3} 1 0 True 3 ['a', 'b', 'c'] [1, 2, 3]\n"));
test('comparison chain, and/or, ternary', () => expectOut("print(1 < 2 < 3, 3 > 2 > 2, 1 == 1.0, 'a' < 'b', 0 or 'x', 5 and 6, None is None, not 0, 'y' if 1 > 2 else 'n')", 'True False True True x 6 True True n\n'));
test('comprehension and lambda', () => expectOut("print([x * x for x in range(5) if x % 2 == 0], (lambda a, b=2: a * b)(4))", '[0, 4, 16] 8\n'));
test('bool arithmetic and None', () => expectOut("print(True + True, None, str(None), bool([]), bool([0]), int('12') + 1, float('2.5'), int(3.9), int(-3.9))", '2 None None False True 13 2.5 3 -3\n'));

console.log('statements');
test('if / elif / else', () => expectOut("def f(n):\n    if n < 0:\n        return 'neg'\n    elif n == 0:\n        return 'zero'\n    else:\n        return 'pos'\nprint(f(-1), f(0), f(5))", 'neg zero pos\n'));
test('while, break, continue, else', () => expectOut("i = 0\ns = 0\nwhile i < 10:\n    i += 1\n    if i % 2 == 0:\n        continue\n    if i > 7:\n        break\n    s += i\nelse:\n    s = -1\nprint(i, s)", '9 16\n'));
test('for over range / list / string / dict', () => expectOut("t = 0\nfor i in range(1, 6):\n    t += i\nfor ch in 'ab':\n    t = str(t) + ch\nfor k in {'x': 1}:\n    t = t + k\nfor i, v in enumerate(['p', 'q']):\n    t = t + str(i) + v\nprint(t)", '15abx0p1q\n'));
test('nested functions, recursion, defaults, kwargs', () => expectOut("def fact(n):\n    return 1 if n <= 1 else n * fact(n - 1)\ndef g(a, b=10, *rest, **kw):\n    return a + b + len(rest) + len(kw)\nprint(fact(10), g(1), g(1, 2, 3, 4, z=1), g(b=5, a=1))", '3628800 11 6 6\n'));
test('global vs local', () => expectOut("n = 1\ndef f():\n    global n\n    n = n + 1\ndef g():\n    n = 99\n    return n\nf(); f()\nprint(n, g(), n)", '3 99 3\n'));
test('closures', () => expectOut("def make(k):\n    def add(x):\n        return x + k\n    return add\nadd5 = make(5)\nprint(add5(10))", '15\n'));
test('augmented assignment on items', () => expectOut("l = [1, 2]\nl[0] += 5\nd = {'a': 1}\nd['a'] *= 3\ns = 'a'\ns += 'b'\nprint(l, d, s)", "[6, 2] {'a': 3} ab\n"));
test('import math / random / from import', () => expectOut("import math\nfrom math import sqrt, pi\nimport random as r\nx = r.randint(1, 6)\nprint(math.floor(2.7), sqrt(16), round(pi, 3), 1 <= x <= 6)", '2 4 3.142 True\n'));
test('semicolons, comments, line continuation', () => expectOut("a = 1; b = 2 # c\nprint(a +\\\n b, [1,\n 2])", '3 [1, 2]\n'));
test('print sep/end', () => expectOut("print('a', 'b', sep='-', end='!')\nprint()", 'a-b!\n'));

console.log('errors');
test('name error', () => expectError('print(zz)', 'NameError', 'zz'));
test('zero division', () => expectError('print(1 / 0)', 'ZeroDivisionError'));
test('type error', () => expectError("print(1 + 'a')", 'TypeError', "'int' and 'str'"));
test('index error', () => expectError('l = [1]\nprint(l[3])', 'IndexError'));
test('key error', () => expectError("d = {}\nprint(d['x'])", 'KeyError'));
test('syntax error has the line', () => { try { Py.compile('x = 1\ny = = 2'); throw new Error('no error'); } catch (e) { eq(e.type, 'SyntaxError'); eq(e.line, 2); } });
test('unbound local', () => expectError('def f():\n    x = x + 1\nf()', 'UnboundLocalError'));
test('endless sync loop is stopped, not hung', () => expectError('def f():\n    while True:\n        pass\nf()', 'RuntimeError', 'too long'));
test('unsupported feature says so', () => { try { Py.compile('class A:\n    pass'); throw new Error('no error'); } catch (e) { eq(e.type, 'SyntaxError'); } });
test('time.sleep points to qbit.wait', () => expectError('import time\ntime.sleep(1)', 'RuntimeError', 'qbit.wait'));

console.log('async and tasks');
function withWait(extra) {
  const log = [];
  const m = new Py.PyModule('qbit', { wait: (s) => new Py.Sleep(s), tick: () => new Py.Tick(), log: (x) => { log.push(x); return null; } });
  return { modules: { qbit: m }, log };
}
test('await wait takes simulated time', () => {
  let out = '';
  const interp = new Py.Interp({ print: (s, e) => { out += s + e; } });
  interp.modules.qbit = new Py.PyModule('qbit', { wait: (s) => new Py.Sleep(s) });
  const sched = new Py.Scheduler(interp);
  sched.spawn(interp.module(Py.compile("import qbit\nasync def main():\n    print('a')\n    await qbit.wait(1)\n    print('b')\n    await qbit.wait(2)\n    print('c')\nsched = 1\n")), 'main');
  // the module only defines main; start it like qbit.start would
  while (!sched.idle()) sched.step(0);
  sched.spawn(interp.callValue(interp.globals.vars.main, [], null), 'main()');
  const stamps = [];
  for (let k = 0; k <= 40; k++) { const t = k / 10, before = out; sched.step(t); if (out !== before) stamps.push(t + ':' + out.split('\n').filter(Boolean).pop()); }
  eq(stamps.join(' '), '0:a 1:b 3:c');
});
test('two tasks run side by side', () => {
  let out = '';
  const interp = new Py.Interp({ print: (s, e) => { out += s + e; } });
  interp.modules.qbit = new Py.PyModule('qbit', { wait: (s) => new Py.Sleep(s) });
  const sched = new Py.Scheduler(interp);
  while (sched.spawn(interp.module(Py.compile("import qbit\nasync def a():\n    for i in range(3):\n        print('a', i)\n        await qbit.wait(1)\nasync def b():\n    for i in range(3):\n        print('b', i)\n        await qbit.wait(1.5)\n")), 'm') && !sched.idle() && (sched.step(0), 0)) { /* define */ }
  sched.spawn(interp.callValue(interp.globals.vars.a, [], null), 'a');
  sched.spawn(interp.callValue(interp.globals.vars.b, [], null), 'b');
  for (let t = 0; t <= 5; t += 0.5) sched.step(t);
  eq(out.replace(/\n/g, ' ').trim(), 'a 0 b 0 a 1 b 1 a 2 b 2');
});
test('await a user coroutine and use its result', () => {
  const r = withWait();
  let out = '';
  const interp = new Py.Interp({ print: (s, e) => { out += s + e; } });
  interp.modules.qbit = r.modules.qbit;
  const sched = new Py.Scheduler(interp);
  sched.spawn(interp.module(Py.compile("import qbit\nasync def twice(x):\n    await qbit.wait(0.5)\n    return x * 2\nasync def main():\n    v = await twice(4) + await twice(1)\n    print(v)\n")), 'm');
  sched.step(0);
  sched.spawn(interp.callValue(interp.globals.vars.main, [], null), 'main');
  for (let t = 0; t <= 2; t += 0.25) sched.step(t);
  eq(out, '10\n');
});
test('a long computation is sliced, not blocking', () => {
  let out = '';
  const interp = new Py.Interp({ print: (s, e) => { out += s + e; } });
  const sched = new Py.Scheduler(interp);
  sched.spawn(interp.module(Py.compile("n = 0\nfor i in range(100000):\n    n += i\nprint(n)\n")), 'm');
  let steps = 0;
  while (!sched.idle() && steps < 100000) { sched.step(steps * 0.01); steps++; }
  eq(out, '4999950000\n'); if (steps < 50) throw new Error('not sliced: ' + steps);
});
test('await in a plain def is a syntax error', () => { try { Py.compile('async def f():\n    return 1\ndef g():\n    x = await f()\n'); throw new Error('no error'); } catch (e) { eq(e.type, 'SyntaxError'); } });

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
