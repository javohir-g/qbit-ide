#!/usr/bin/env node
/* Every sentence the program asks the dictionary for:  node ide/tools/i18n_keys.js [--missing]
   - T('...') calls in js/ (Q.t, see js/core/i18n.js),
   - the static texts of index.html and simulator.html (title, aria-label, placeholder, text of elements that hold only text),
   - the names in the generated hardware table (js/data/hw-data.js).
   Without arguments it lists them; --missing lists those that en.js or uz.js lack. tests/i18n.test.js uses collect() too. */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const CYR = /[А-Яа-яЁё]/;

function walk(d, out) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (!['vendor', 'i18n'].includes(f.name)) walk(p, out); }
    else if (f.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const unq = (s) => s.replace(/\\(.)/g, (m, c) => c === 'n' ? '\n' : c === 't' ? '\t' : c);

/** Map: Russian sentence -> [places] */
function collect() {
  const keys = new Map();
  const add = (k, where) => { if (!keys.has(k)) keys.set(k, []); const w = keys.get(k); if (!w.includes(where)) w.push(where); };
  for (const f of walk(path.join(root, 'js'), [])) {
    const rel = path.relative(path.join(root, 'js'), f).replace(/\\/g, '/');
    if (/^(core\/i18n\.js|core\/font5x7\.js|data\/hw-data\.js)$/.test(rel)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const re = /\bT\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
    let m;
    while ((m = re.exec(src))) { const k = unq(m[1] !== undefined ? m[1] : m[2]); if (CYR.test(k)) add(k, rel); }
  }
  for (const page of ['index.html', 'simulator.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    let m;
    const re = /\b(?:title|aria-label|placeholder)="([^"]*)"/g;
    while ((m = re.exec(html))) if (CYR.test(m[1])) add(m[1], page);
    const re2 = />([^<>]*[А-Яа-яЁё][^<>]*)</g;
    while ((m = re2.exec(html))) { const t = m[1].trim(); if (t) add(t, page); }
    const mt = /<title>([^<]*)<\/title>/.exec(html);
    if (mt && CYR.test(mt[1])) add(mt[1].trim(), page);
  }
  const G = {};
  new Function('G', fs.readFileSync(path.join(root, 'js/data/hw-data.js'), 'utf8').replace(/\}\)\(typeof globalThis[\s\S]*$/, '})(G);'))(G);
  const D = G.QBIT.DATA;
  ['kits', 'categories'].forEach((k) => Object.values(D[k]).forEach((v) => add(v, 'hw-data:' + k)));
  D.modules.concat(D.retired || []).forEach((m) => add(m.name, 'hw-data:name'));
  return keys;
}

module.exports = { collect, CYR };

if (require.main === module) {
  const keys = collect();
  if (process.argv.includes('--missing')) {
    globalThis.QBIT = {};
    for (const f of ['core/i18n.js', 'i18n/en.js', 'i18n/uz.js']) require(path.join(root, 'js', f));
    let n = 0;
    for (const lang of ['en', 'uz']) for (const [k, w] of keys) if (QBIT.i18n.dict[lang][k] === undefined) { console.log(lang + ' missing: ' + JSON.stringify(k) + '   (' + w[0] + ')'); n++; }
    console.log(n ? n + ' missing' : 'nothing is missing');
    process.exit(n ? 1 : 0);
  }
  for (const [k, w] of keys) console.log(JSON.stringify(k) + '   (' + w[0] + ')');
  console.error(keys.size + ' sentences');
}
