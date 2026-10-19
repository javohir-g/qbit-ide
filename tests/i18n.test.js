/* The dictionaries are complete and consistent:  node ide/tests/i18n.test.js
   - every sentence the program asks for (T('...') calls, static page texts, hardware names) is in en.js and in uz.js,
   - a translation keeps the same %1 %2 placeholders and has no Russian letters left,
   - no dictionary entry is unused (a typo in a key would otherwise hide a missing translation),
   - Blockly's own sentences: the key exists in vendor/blockly/msg/ru.js, same placeholders, no Russian letters. */
'use strict';
const fs = require('fs'), path = require('path');
require('./load');                                       // the simulator core, with the i18n core and both dictionaries
const { collect, CYR } = require('../tools/i18n_keys');
const Q = globalThis.QBIT;

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); } }
const ph = (s) => (s.match(/%\d/g) || []).sort().join(' ');
const keys = collect();

test('the sentences of the program are found', () => { if (keys.size < 900) throw new Error('only ' + keys.size); });
for (const lang of ['en', 'uz']) {
  const dict = Q.i18n.dict[lang];
  test(lang + ': every sentence has a translation', () => {
    const miss = [...keys.keys()].filter((k) => dict[k] === undefined);
    if (miss.length) throw new Error(miss.length + ' missing, e.g. ' + miss.slice(0, 5).map((k) => JSON.stringify(k)).join(', '));
  });
  test(lang + ': placeholders are kept, no Russian letters, nothing empty', () => {
    const bad = [];
    for (const k of Object.keys(dict)) {
      if (ph(k) !== ph(dict[k])) bad.push('placeholders: ' + JSON.stringify(k));
      else if (CYR.test(dict[k])) bad.push('Russian letters: ' + JSON.stringify(dict[k]));
      else if (!dict[k].trim()) bad.push('empty: ' + JSON.stringify(k));
    }
    if (bad.length) throw new Error(bad.length + ' bad, e.g. ' + bad.slice(0, 4).join('; '));
  });
  test(lang + ': no unused entries', () => {
    const stale = Object.keys(dict).filter((k) => !keys.has(k));
    if (stale.length) throw new Error(stale.length + ' unused, e.g. ' + stale.slice(0, 5).map((k) => JSON.stringify(k)).join(', '));
  });
  test(lang + ': Blockly sentences are valid', () => {
    const ru = {};
    for (const line of fs.readFileSync(path.join(__dirname, '..', 'vendor', 'blockly', 'msg', 'ru.js'), 'utf8').split(/\r?\n/)) {
      let m = /^Blockly\.Msg\["([A-Z0-9_]+)"\] = "(.*)";/.exec(line); if (m) ru[m[1]] = m[2];
      m = /^Blockly\.Msg\["([A-Z0-9_]+)"\] = Blockly\.Msg\["([A-Z0-9_]+)"\];/.exec(line); if (m && ru[m[2]] !== undefined) ru[m[1]] = ru[m[2]];
    }
    const bl = Q.i18n.blocklyDict[lang], bad = [];
    for (const k of Object.keys(bl)) {
      if (ru[k] === undefined) bad.push('unknown key ' + k);
      else if (ph(ru[k]) !== ph(bl[k])) bad.push('placeholders ' + k);
      else if (CYR.test(bl[k])) bad.push('Russian letters ' + k);
    }
    if (bad.length) throw new Error(bad.slice(0, 5).join('; '));
    if (Object.keys(bl).length < 150) throw new Error('only ' + Object.keys(bl).length + ' Blockly sentences');
  });
}
test('Q.t: placeholders, fallback to Russian', () => {
  if (Q.t('порт %1 и %2', 3, 'x') !== 'порт 3 и x') throw new Error(Q.t('порт %1 и %2', 3, 'x'));
  if (Q.t('такого нет в словаре') !== 'такого нет в словаре') throw new Error('fallback');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
