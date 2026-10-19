/* The program text is run by two engines: CPython (the reference) and our interpreter. They must print the same:
     node ide/tests/conformance.test.js
   Programs live in tests/corpus/*.py. Skipped (with a note) when no `python` is on the PATH. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), { spawnSync } = require('child_process');
globalThis.QBIT = globalThis.QBIT || {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'pyinterp.js'), 'utf8'), { filename: 'pyinterp.js' });
const Py = QBIT.Py;

const dir = path.join(__dirname, 'corpus');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.py')).sort();
const probe = spawnSync('python', ['-c', 'print(1)'], { encoding: 'utf8' });
if (probe.status !== 0) { console.log('python not found: conformance test skipped'); process.exit(0); }

function ours(src) {
  let out = '';
  const it = new Py.Interp({ print: (s, e) => { out += s + e; } });
  const sched = new Py.Scheduler(it, { onError: (e) => { throw e; } });
  sched.spawn(it.module(Py.compile(src)), 'main');
  for (let t = 0, i = 0; i < 200000 && !sched.idle(); i++, t += 0.01) sched.step(t);
  return out;
}

let passed = 0, failed = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const ref = spawnSync('python', ['-I', '-X', 'utf8', path.join(dir, f)], { encoding: 'utf8' });
  let mine, err = null;
  try { mine = ours(src); } catch (e) { err = e; }
  if (ref.status !== 0) { failed++; console.log('  FAIL ' + f + ': CPython itself failed:\n' + ref.stderr); continue; }
  if (err) { failed++; console.log('  FAIL ' + f + ': ' + (err.message || err) + (err.line ? ' (line ' + err.line + ')' : '')); continue; }
  if (mine === ref.stdout.replace(/\r\n/g, '\n')) { passed++; console.log('  ok   ' + f); }
  else {
    failed++;
    const a = ref.stdout.replace(/\r\n/g, '\n').split('\n'), b = mine.split('\n');
    const i = a.findIndex((l, k) => l !== b[k]);
    console.log('  FAIL ' + f + ' at output line ' + (i + 1) + '\n       CPython: ' + a[i] + '\n       ours:    ' + b[i]);
  }
}
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
