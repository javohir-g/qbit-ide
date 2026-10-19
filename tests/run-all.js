/* Runs every test of the IDE, one after another:   node ide/tests/run-all.js [--quick]
   --quick skips the slow ones that need a browser (ide.test.html, ui.test.js). */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const quick = process.argv.includes('--quick');

const steps = [
  ['core (board, modules, passports)', ['tests/core.test.js']],
  ['Python interpreter', ['tests/py.test.js']],
  ['interpreter vs CPython', ['tests/conformance.test.js']],
  ['qbit contract and runtime', ['tests/runtime.test.js']],
  ['dictionaries (ru / uz / en)', ['tests/i18n.test.js']],
  ['contract table in mpy/ is current', ['tools/gen_qbit_spec.js', '--check']],
  ['board-side qbit module (CPython)', ['tests/mpy.test.js']],
  ['board protocol (fake board)', ['tests/link.test.js']],
];
if (!quick) steps.push(['blocks and generators (browser)', ['tests/browser.test.js']], ['IDE end to end (browser)', ['tests/ui.test.js']]);

let bad = 0;
for (const [name, args] of steps) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || '');
  const last = out.trim().split('\n').filter((l) => /passed|failed|up to date|skipped/.test(l)).pop() || out.trim().split('\n').pop();
  const ok = r.status === 0;
  if (!ok) bad++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + name.padEnd(40) + ' ' + String(last || '').trim() + '   (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  if (!ok) console.log(out.split('\n').filter((l) => /FAIL|Error|failed/.test(l)).slice(0, 12).join('\n'));
}
console.log(bad ? '\n' + bad + ' step(s) failed' : '\nall good');
process.exit(bad ? 1 : 0);
