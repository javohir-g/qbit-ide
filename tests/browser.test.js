/* Runs the browser-side tests (ide.test.html) in headless Chrome:  node ide/tests/browser.test.js [page.html]  */
'use strict';
const path = require('path');
const { launch, sleep } = require('./lib/cdp');

(async () => {
  const file = path.resolve(__dirname, process.argv[2] || 'ide.test.html');
  const page = await launch({ w: 1100, h: 800 });
  let code = 1;
  try {
    await page.goto('file:///' + file.replace(/\\/g, '/'), 500);
    for (let i = 0; i < 60 && !(await page.eval('!!window.__done')); i++) await sleep(250);
    const r = await page.eval('JSON.stringify(window.__results || null)');
    if (!r || r === 'null') { console.log('tests did not finish; errors:', page.errors); }
    else {
      const res = JSON.parse(r);
      res.lines.forEach((l) => console.log('  ' + l));
      console.log('\n' + res.passed + ' passed, ' + res.failed + ' failed');
      if (page.errors.length) console.log('page errors:\n  ' + page.errors.join('\n  '));
      code = res.failed || page.errors.length ? 1 : 0;
    }
  } finally { await page.close(); }
  process.exit(code);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
