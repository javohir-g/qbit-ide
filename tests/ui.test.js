/* The IDE in a real (headless) Chrome: start-up, running programs, error flow, search, Python tab, a real board over the link, phone width.
     node ide/tests/ui.test.js */
'use strict';
const path = require('path'), http = require('http'), { spawn } = require('child_process');
const { launch, sleep, BASE } = require('./lib/cdp');

let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); } }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'differ') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
const get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d)); }).on('error', rej));
const SHOT = (n) => path.join(BASE, 'shots', 'ui_' + n + '.png');

(async () => {
  const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
  const page = await launch({ w: 1440, h: 900 });
  const click = async (sel) => { const r = await page.rect(sel); if (!r) throw new Error('no element ' + sel); await page.click(r.cx, r.cy); await sleep(250); };
  const E = (js) => page.eval(js);
  try {
    await page.goto(url, 1800);

    await test('starts without errors; eight categories; an example is loaded', async () => {
      eq(page.errors.length, 0, page.errors.join(' | '));
      eq(await E(`document.querySelectorAll('.blocklyToolboxCategory').length`), 8);
      ok(await E(`QBIT.ide.editor.ws.getAllBlocks(false).length`) >= 5, 'example blocks');
      ok(/Мигаем/.test(await E(`document.getElementById('project-name').value`)));
    });
    const until = async (js, want, ms) => { for (let t = 0; t < ms; t += 40) { if ((await E(js)) === want) return true; await sleep(40); } return false; };
    const LED = `QBIT.ide.sim.board.port(3).module.api.isOn()`;
    await test('Run starts the program on the simulator, the LED blinks, Stop switches it off', async () => {
      await click('#btn-run');
      eq(await E(`QBIT.ide.device().status`), 'running');
      ok(await until(LED, true, 1500), 'led comes on');
      ok(await until(LED, false, 1500), 'led goes off half a second later');
      eq(await E(`document.getElementById('btn-pause').disabled`), false);
      await click('#btn-stop'); await sleep(200);
      eq(await E(`QBIT.ide.device().status`), 'stopped');
      ok(!(await E(LED)));
      eq(await E(`document.getElementById('btn-stop').disabled`), true);
    });
    await test('Pause holds the program, Continue resumes it', async () => {
      await click('#btn-run'); ok(await until(LED, true, 1500)); await click('#btn-pause');
      eq(await E(`QBIT.ide.device().status`), 'paused');
      const a = await E(LED); await sleep(900);
      eq(await E(LED), a, 'frozen while paused');
      await click('#btn-pause'); eq(await E(`QBIT.ide.device().status`), 'running');
      ok(await until(LED, !a, 1500), 'moves again after Continue');
      await click('#btn-stop');
    });
    await test('a block glows while it runs', async () => {
      await click('#btn-run');
      let seen = 0;
      for (let i = 0; i < 12 && !seen; i++) { seen = await E(`document.querySelectorAll('.qbit-running').length`); if (!seen) await sleep(40); }
      ok(seen >= 1, 'a running block');
      await click('#btn-stop');
    });
    await test('Python tab shows the program; it is what runs', async () => {
      await click('#tab-python');
      const t = await E(`document.getElementById('code-view').innerText`);
      ok(/import qbit/.test(t) && /async def on_start/.test(t) && /qbit\.led\(\d\)\.on\(\)/.test(t), t);
      await click('#tab-blocks');
    });
    await test('print goes to the console; an error is shown with its block', async () => {
      await E(`QBIT.ide.openExample(QBIT.Examples.list[0], true)`); await sleep(300);   // blink
      // point the LED block at the button's port: a clear error and a flagged block
      await E(`(() => { const ws = QBIT.ide.editor.ws; const b = ws.getAllBlocks(false).find(x => x.type === 'led_turn'); b.setFieldValue('1', 'PORT'); })()`); await sleep(400);
      await click('#btn-run'); await sleep(500);
      const t = await E(`document.getElementById('pane-console').innerText`);
      ok(/стоит «Кнопка»/.test(t), t); eq(await E(`QBIT.ide.device().status`), 'error');
      ok(await E(`document.querySelectorAll('.qbit-error').length`) >= 1, 'flagged block');
      await page.shot(SHOT('error'));
    });
    await test('the toggle example: pressing the button switches the LED (when ... hat)', async () => {
      await E(`QBIT.ide.openExample(QBIT.Examples.list[2], true)`); await sleep(300);
      await click('#btn-run'); await sleep(400);
      await E(`QBIT.ide.sim.board.port(1).module.set('pressed', true)`); await sleep(250); await E(`QBIT.ide.sim.board.port(1).module.set('pressed', false)`); await sleep(250);
      ok(await E(`QBIT.ide.sim.board.port(3).module.api.isOn()`), 'on after press 1');
      await E(`QBIT.ide.sim.board.port(1).module.set('pressed', true)`); await sleep(250); await E(`QBIT.ide.sim.board.port(1).module.set('pressed', false)`); await sleep(250);
      ok(!(await E(`QBIT.ide.sim.board.port(3).module.api.isOn()`)), 'off after press 2');
      await click('#btn-stop');
    });
    await test('the Data tab lists values of attached modules', async () => {
      await click('#btab-data'); await sleep(600);
      const t = await E(`document.getElementById('pane-data').innerText`);
      ok(/Потенциометр/.test(t) && /положение/.test(t), t.slice(0, 200));
      await click('#btab-console');
    });
    await test('search narrows the blocks; clearing brings the categories back', async () => {
      await E(`(() => { const s = document.getElementById('block-search'); s.value = 'яркость'; s.dispatchEvent(new Event('input')); })()`); await sleep(900);
      ok(/Найдено: [1-9]/.test(await E(`document.querySelector('.blocklyToolbox').innerText`)));
      await E(`(() => { const s = document.getElementById('block-search'); s.value = ''; s.dispatchEvent(new Event('input')); })()`); await sleep(600);
      eq(await E(`document.querySelectorAll('.blocklyToolboxCategory').length`), 8);
    });
    await test('the category column never scrolls and always fits, at any window size and with a search row', async () => {
      const measure = `JSON.stringify((() => {
        const tb = document.querySelector('.blocklyToolbox'), t = tb.getBoundingClientRect(), cs = getComputedStyle(tb);
        const rows = [...document.querySelectorAll('.blocklyToolboxCategory')].map(r => r.getBoundingClientRect());
        const ext = document.getElementById('btn-ext').getBoundingClientRect();
        return { sw: tb.scrollWidth - tb.clientWidth, sh: tb.scrollHeight - tb.clientHeight, ov: cs.overflowX + '/' + cs.overflowY, n: rows.length,
          inside: rows.every(r => r.top >= t.top - 1 && r.bottom <= t.bottom + 1 && r.left >= t.left - 1 && r.right <= t.right + 1),
          clear: rows.every(r => r.bottom <= ext.top + 1), icon: Math.round(document.querySelector('.blocklyToolboxCategoryIcon').getBoundingClientRect().width) };
      })())`;
      const sizes = [[1440, 900, false], [1920, 1080, false], [1280, 620, false], [1100, 480, false], [390, 844, true]];
      const seen = [];
      for (const [w, h, mobile] of sizes) {
        await page.viewport(w, h, 1, mobile); await sleep(500);
        for (const q of ['', 'порт']) {
          await E(`(() => { const s = document.getElementById('block-search'); s.value = ${JSON.stringify(q)}; s.dispatchEvent(new Event('input')); })()`); await sleep(700);
          const m = JSON.parse(await E(measure));
          ok(m.sw <= 0 && m.sh <= 0, w + 'x' + h + ' scrolls: ' + JSON.stringify(m));
          ok(/hidden/.test(m.ov), w + 'x' + h + ' overflow ' + m.ov);
          ok(m.inside && m.clear, w + 'x' + h + ' rows leave the column: ' + JSON.stringify(m));
          ok(m.n === (q ? 9 : 8), w + 'x' + h + ' rows ' + m.n);
          ok(m.icon >= 14, w + 'x' + h + ' dot ' + m.icon);
          seen.push(m.icon);
        }
      }
      ok(seen[0] > seen[4], 'the dots follow the room: ' + seen.join(','));
      await E(`(() => { const s = document.getElementById('block-search'); s.value = ''; s.dispatchEvent(new Event('input')); })()`);
      await page.viewport(1440, 900, 1, false); await sleep(500);
    });
    await test('the blocks on offer keep their size when the editor is zoomed; a block taken from them gets the editor zoom', async () => {
      const size = `JSON.stringify((() => { const b = document.querySelector('.blocklyFlyout .blocklyDraggable'), r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), +QBIT.ide.editor.ws.getToolbox().getFlyout().getWorkspace().scale.toFixed(2)]; })())`;
      const open = `(() => { const t = QBIT.ide.editor.ws.getToolbox(), f = t.getFlyout(); if (!f.isVisible() || f.getWidth() < 10) { t.clearSelection(); t.selectItemByPosition(3); } })()`;
      await E(`QBIT.ide.editor.ws.setScale(0.8)`); await E(open); await sleep(450);
      const base = await E(size);
      ok(JSON.parse(base)[0] > 40, 'a block is on offer: ' + base);
      for (const s of [1.6, 0.5]) {
        await E(`QBIT.ide.editor.ws.setScale(${s})`); await sleep(300); await E(open); await sleep(450);
        eq(await E(size), base, 'palette at editor zoom ' + s);
      }
      await E(`QBIT.ide.editor.ws.setScale(1.5)`); await sleep(300); await E(open); await sleep(450);
      const n0 = await E(`QBIT.ide.editor.ws.getAllBlocks(false).length`), from = JSON.parse(await E(`JSON.stringify((() => { const r = document.querySelector('.blocklyFlyout .blocklyDraggable').getBoundingClientRect(); return [r.x + 14, r.y + r.height / 2]; })())`));
      await page.drag(from[0], from[1], 900, 700); await sleep(500);
      ok(await E(`QBIT.ide.editor.ws.getAllBlocks(false).length`) > n0, 'a block can still be dragged out of the palette');
      eq(await E(`QBIT.ide.editor.ws.scale`), 1.5);
      await E(`QBIT.ide.editor.ws.setScale(0.8)`);
    });
    await test('flat and icon-only: no shadows or filters on the page, no emoji or symbol glyphs in any text', async () => {
      for (const tab of ['console', 'modules', 'props', 'data', 'devices']) await click('#btab-' + tab);
      await click('#btn-file');
      const r = JSON.parse(await E(`JSON.stringify((() => {
        const shadows = [], glyphs = new Set();
        document.querySelectorAll('body *').forEach(e => {
          const cs = getComputedStyle(e);
          if (cs.boxShadow !== 'none' || cs.textShadow !== 'none' || /drop-shadow|url/.test(cs.filter)) shadows.push(e.tagName + '.' + (typeof e.className === 'string' ? e.className : e.className.baseVal));
        });
        (document.body.innerText + ' ' + [...document.querySelectorAll('[title],[aria-label],[placeholder]')].map(e => e.title + e.getAttribute('aria-label') + (e.placeholder || '')).join(' '))
          .replace(/[\\u2190-\\u21FF\\u2300-\\u27BF\\u2B00-\\u2BFF\\u25A0-\\u25FF\\uFF0B]|[\\u{1F300}-\\u{1FAFF}]/gu, (g) => glyphs.add(g));
        const nodeText = [...document.querySelectorAll('svg text')].map(t => t.textContent).join('');
        nodeText.replace(/[\\u2190-\\u21FF\\u2300-\\u27BF\\u2B00-\\u2BFF\\u25A0-\\u25FF]|[\\u{1F300}-\\u{1FAFF}]/gu, (g) => glyphs.add(g));
        return { shadows, glyphs: [...glyphs], icons: document.querySelectorAll('svg.ic use').length, undefinedIcons: [...document.querySelectorAll('svg.ic use')].filter(u => !document.querySelector(u.getAttribute('href'))).length };
      })())`));
      eq(r.shadows.length, 0, 'shadowed: ' + r.shadows.join(', '));
      eq(r.glyphs.length, 0, 'glyphs: ' + r.glyphs.join(' '));
      ok(r.icons > 15, 'icons in use ' + r.icons);
      eq(r.undefinedIcons, 0, 'icons that point at nothing');
      await E(`QBIT.ide.closeMenu()`); await click('#btab-console');
    });
    await test('a block on a port without that module gets a warning', async () => {
      await E(`QBIT.ide.openExample(QBIT.Examples.list[0], true)`); await sleep(300);
      await E(`(() => { const b = QBIT.ide.editor.ws.getAllBlocks(false).find(x => x.type === 'led_turn'); b.setFieldValue('6', 'PORT'); })()`); await sleep(500);
      ok(await E(`QBIT.ide.editor.ws.getAllBlocks(false).some(b => b.type === 'led_turn' && b.qbitWarn)`), 'warning on the block');
    });
    await test('every example sets up the board and runs for two seconds without an error', async () => {
      const n = await E(`QBIT.Examples.list.length`), bad = [];
      for (let i = 0; i < n; i++) {
        await E(`QBIT.ide.openExample(QBIT.Examples.list[${i}], true)`); await sleep(1300);       // modules get recognised
        await E(`QBIT.ide.run()`); await sleep(1500);
        const st = await E(`QBIT.ide.device().status`), title = await E(`QBIT.Examples.list[${i}].title`);
        if (st === 'error') bad.push(title + ': ' + (await E(`document.querySelector('.cl2.err .tx') ? document.querySelector('.cl2.err .tx').textContent : '?'`)));
        await E(`QBIT.ide.stop()`); await sleep(100);
      }
      eq(bad.join(' | '), '');
    });
    await test('project survives a reload (saved in the browser)', async () => {
      await E(`QBIT.ide.saveProject()`);
      await page.goto(url, 1500);
      ok(await E(`QBIT.ide.editor.ws.getAllBlocks(false).length`) >= 5);
    });
    await test('phone width: no horizontal scroll, board sheet opens', async () => {
      await page.viewport(390, 844, 1, true); await page.goto(url, 1500);
      ok(await E(`document.documentElement.scrollWidth <= 392`), 'scrollWidth ' + await E(`document.documentElement.scrollWidth`));
      await click('#btn-board'); await sleep(300);
      ok(await E(`getComputedStyle(document.getElementById('ide-right')).display !== 'none'`));
      await page.shot(SHOT('phone'));
      await page.viewport(1440, 900, 1, false);
    });

    /* ---------------------------------------------------------------- languages: Uzbek and English leave nothing in Russian */
    const SCAN = `JSON.stringify((() => {
      const CYR = /[А-Яа-яЁё]/, out = new Set();
      document.body.innerText.split('\\n').forEach((l) => { if (CYR.test(l)) out.add(l.trim()); });
      document.querySelectorAll('[title],[aria-label],[placeholder]').forEach((e) => ['title', 'aria-label', 'placeholder'].forEach((a) => { const v = e.getAttribute(a); if (v && CYR.test(v)) out.add(a + ': ' + v); }));
      document.querySelectorAll('svg text').forEach((t) => { if (CYR.test(t.textContent)) out.add('svg: ' + t.textContent.trim()); });
      document.querySelectorAll('select option').forEach((o) => { if (CYR.test(o.textContent)) out.add('option: ' + o.textContent.trim()); });
      if (CYR.test(document.title)) out.add('title: ' + document.title);
      return [...out];
    })())`;
    const BLOCK_TYPES = `QBIT.Catalog.blocks.map((r) => r.id).concat(['qbit_when_started', 'qbit_when_event', 'qbit_when_pair', 'qbit_when_message', 'qbit_send_message', 'qbit_event_value', 'qbit_wait', 'qbit_wait_until', 'qbit_repeat', 'qbit_forever', 'qbit_repeat_until', 'qbit_while', 'qbit_for', 'qbit_stop', 'qbit_print', 'qbit_timer', 'qbit_map', 'qbit_constrain', 'controls_if', 'controls_flow_statements', 'math_arithmetic', 'math_random_int', 'math_modulo', 'math_round', 'math_single', 'logic_compare', 'logic_operation', 'logic_negate', 'logic_boolean', 'logic_ternary', 'text_join', 'text_length', 'variables_get', 'variables_set', 'procedures_defnoreturn', 'procedures_defreturn', 'procedures_callnoreturn'])`;
    for (const lang of ['en', 'uz']) {
      await test('language ' + lang + ': no Russian text is left in the panes, menus, blocks, modules or error messages', async () => {
        await page.goto(url + '?lang=' + lang, 2200);
        eq(await E(`QBIT.i18n.lang`), lang); eq(await E(`document.documentElement.lang`), lang);
        eq(page.errors.length, 0, page.errors.join(' | '));
        const leaks = new Set();
        const scan = async (js) => { JSON.parse(await E(js || SCAN)).forEach((s) => leaks.add(s)); };
        await scan();
        for (const t of ['modules', 'props', 'data', 'devices', 'console']) { await click('#btab-' + t); await scan(); }
        for (const id of ['#btn-file', '#btn-ext', '#btn-lang']) { await click(id); await scan(); await click('#ide-main'); }
        await click('#btn-file'); await E(`QBIT.ide.examplesMenu()`); await sleep(200); await scan(); await click('#ide-main');
        const cats = await E(`document.querySelectorAll('.blocklyToolboxCategory').length`);
        for (let i = 0; i < cats; i++) { await E(`(() => { const t = QBIT.ide.editor.ws.getToolbox(); t.clearSelection(); t.selectItemByPosition(${i}); })()`); await sleep(350); await scan(); }
        // every block: its text, tooltip and the options of its dropdowns
        JSON.parse(await E(`JSON.stringify((() => { const CYR = /[А-Яа-яЁё]/, out = [], B = QBIT.ide.editor.Blockly, ws = new B.Workspace();
          ${BLOCK_TYPES}.forEach((t) => { try { const b = ws.newBlock(t); const s = b.toString() + ' | ' + (typeof b.tooltip === 'string' ? b.tooltip : ''); if (CYR.test(s)) out.push(t + ': ' + s);
            b.inputList.forEach((i) => i.fieldRow.forEach((f) => { if (f.getOptions) { try { f.getOptions(false).forEach((o) => { if (typeof o[0] === 'string' && CYR.test(o[0])) out.push(t + ' option: ' + o[0]); }); } catch (e) { /* needs a workspace state */ } } })); b.dispose(); } catch (e) { out.push(t + ' ERR ' + e.message); } });
          return out; })())`)).forEach((s) => leaks.add(s));
        // every module on the board: the inspector (controls, readings, hints, passport)
        await click('#btab-props');
        const keys = JSON.parse(await E(`JSON.stringify(QBIT.moduleList({ debug: true }).map((d) => d.key))`));
        for (const key of keys) {
          await E(`(() => { const b = QBIT.ide.sim.board; b.clear(); const def = QBIT.moduleDef('${key}'); for (let n = 1; n <= 8; n++) if (b.canPlace(n, def).ok) { b.attach(n, '${key}', def.variants && def.variants.length ? { variant: def.defaultVariant } : undefined); QBIT.ide.app.select(n); break; } })()`);
          await sleep(300); await scan();
        }
        // a runtime error and the messages of the interpreter
        await E(`QBIT.ide.sim.board.clear()`); await E(`QBIT.ide.openExample(QBIT.Examples.list[0], true)`); await sleep(500);
        await E(`QBIT.ide.sim.board.detach(3)`); await sleep(200);
        await click('#btab-console'); await E(`QBIT.ide.run()`); await sleep(500); await scan(); await E(`QBIT.ide.stop()`);
        for (const code of ["import qbit\nasync def f():\n    qbit.led(9).on()\nqbit.start(f)\nqbit.run()", "import qbit\nasync def f():\n    x = undefined_name\nqbit.start(f)\nqbit.run()"]) {
          await E(`(() => { try { QBIT.ide.sim.run(${JSON.stringify(code)}, {}); } catch (e) { /* shown in the console */ } })()`); await sleep(300); await scan();
        }
        const left = [...leaks].filter((s) => s !== 'Русский');           // the name of the Russian language, in Russian, is the one that stays
        eq(left.slice(0, 6).join(' | '), '', left.length + ' Russian texts');
        eq(JSON.stringify(await E(`QBIT.i18n.misses`)), '{}', 'sentences that asked the dictionary and were not there');
      });
    }
    await test('the language menu switches the page, remembers the choice and keeps the project', async () => {
      await E(`localStorage.removeItem('qbit-lang')`);
      await page.goto(url, 2000);
      eq(await E(`QBIT.i18n.lang`), 'ru');
      const n = await E(`QBIT.ide.editor.ws.getAllBlocks(false).length`);
      await click('#btn-lang'); await click('#menu button[lang="uz"]'); await sleep(2500);
      eq(await E(`QBIT.i18n.lang`), 'uz'); eq(await E(`document.getElementById('lang-short').textContent`), 'UZ');
      eq(await E(`QBIT.ide.editor.ws.getAllBlocks(false).length`), n, 'the blocks survive the switch');
      await click('#btn-lang'); await click('#menu button[lang="ru"]'); await sleep(2500);
      eq(await E(`QBIT.i18n.lang`), 'ru'); eq(await E(`document.getElementById('lang-short').textContent`), 'RU');
    });
  } finally { await page.close(); }

  /* ---------------------------------------------------------------- a real board (the fake one) serving the IDE */
  const PORT = 8800 + Math.floor(Math.random() * 90);
  const board = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'fake-board.js'), '--port', String(PORT), '--modules', 'button:1,pot:2,led:3,rgb:4'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { board.stdout.on('data', (d) => { if (/fake q\.bit board/.test(String(d))) res(); }); setTimeout(() => rej(new Error('fake board did not start')), 15000); });
  const p2 = await launch({ w: 1440, h: 900 });
  const click2 = async (sel) => { const r = await p2.rect(sel); await p2.click(r.cx, r.cy); await sleep(250); };
  try {
    await p2.goto('http://127.0.0.1:' + PORT + '/', 2500);
    await test('served by a board: connects by itself and mirrors it', async () => {
      eq(p2.errors.length, 0, p2.errors.join(' | '));
      eq(await p2.eval(`QBIT.ide.device().kind`), 'wifi'); eq(await p2.eval(`QBIT.ide.device().connected`), true);
      eq(await p2.eval(`JSON.stringify(QBIT.ide.sim.board.ports.map(p => p.module && p.module.key))`), JSON.stringify(['button', 'pot', 'led', 'rgb', null, null, null, null]));
      ok(await p2.eval(`document.getElementById('ide-right').classList.contains('mirroring')`));
    });
    await test('Run sends the program to the board; the board prints back; the mirror follows touches', async () => {
      await p2.eval(`QBIT.ide.openExample(QBIT.Examples.list[0], true)`); await sleep(400);
      await click2('#btn-run'); await sleep(900);
      const st = JSON.parse(await get('http://127.0.0.1:' + PORT + '/state'));
      eq(st.run.status, 'running');
      await get('http://127.0.0.1:' + PORT + '/touch?port=1&key=pressed&value=1'); await sleep(600);
      eq(await p2.eval(`QBIT.ide.sim.board.port(1).module.state.pressed`), true, 'button mirrored');
      await click2('#btn-stop'); await sleep(500);
      eq(JSON.parse(await get('http://127.0.0.1:' + PORT + '/state')).run.status, 'stopped');
      await p2.shot(SHOT('remote'));
    });
  } finally { await p2.close(); board.kill(); }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
