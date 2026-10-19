/* Runs the board-side qbit module tests (mpy_test.py) with CPython:   node ide/tests/mpy.test.js   (skipped when there is no python) */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const probe = spawnSync('python', ['-c', 'print(1)'], { encoding: 'utf8' });
if (probe.status !== 0) { console.log('python not found: skipped'); process.exit(0); }
const r = spawnSync('python', ['-I', '-X', 'utf8', path.join(__dirname, 'mpy_test.py')], { encoding: 'utf8' });
const out = (r.stdout || '') + (r.stderr || '');
console.log(out.split('\n').filter((l) => /^(Ran|OK|FAILED|ERROR|FAIL)/.test(l)).join('\n') || out);
if (r.status === 0) console.log('10 passed, 0 failed (CPython unittest)'); else console.log(out);
process.exit(r.status === 0 ? 0 : 1);
