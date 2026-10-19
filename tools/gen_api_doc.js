#!/usr/bin/env node
/* Writes docs/QBIT-API.md (the Python reference of the `qbit` module) from js/runtime/spec.js:   node ide/tools/gen_api_doc.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
globalThis.QBIT = globalThis.QBIT || {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'spec.js'), 'utf8'), { filename: 'spec.js' });
const SPEC = QBIT.SPEC;
const TYPE = { bool: 'True / False', int: 'целое', float: 'число', text: 'текст', any: 'число или текст' };

let md = `# Python: модуль \`qbit\`

> Этот файл создаётся автоматически из \`js/runtime/spec.js\` (\`node ide/tools/gen_api_doc.js\`), руками его не правят.

Программа из блоков превращается в Python, который вызывает модуль \`qbit\`. Тот же текст запускается в симуляторе (JavaScript-версия модуля) и на плате (MicroPython, \`mpy/qbit.py\`). Имена значений, команд и событий взяты из драйверов прошивки (\`firmware/qbit_core/drivers\`).

## Как выглядит программа

\`\`\`python
import qbit

async def on_start():
    while True:
        qbit.led(3).on()              # команда модулю на порту 3
        await qbit.wait(0.5)          # пауза, другие скрипты в это время работают
        qbit.led(3).off()
        await qbit.wait(0.5)
        await qbit.tick()             # дать шанс другим скриптам (в конце каждого цикла)

async def when_button_p1_press():     # «когда кнопка нажата»
    qbit.rgb(4).color('red')

qbit.start(on_start)                  # запустить скрипт
qbit.button(1).when('press', when_button_p1_press)
qbit.run()                            # события работают, пока программа не остановлена
\`\`\`

## Общее

| Что | Как |
|---|---|
| модуль на порту | \`qbit.led(3)\`, \`qbit.button(1)\` … (имя = ключ модуля, порты 1…8) |
| значение | \`qbit.pot(2).value\` (свойство, только чтение) |
| команда | \`qbit.led(3).brightness(50)\`; \`True\` / \`False\` отправляются как \`on\` / \`off\` |
| событие | \`qbit.button(1).when('press', функция)\`; функция получает аргумент события, если он есть |
| пауза | \`await qbit.wait(секунды)\`, \`await qbit.wait_ms(мс)\`, \`await qbit.tick()\` |
| параллельный скрипт | \`qbit.start(функция)\` |
| сообщения | \`qbit.send('имя')\`, \`qbit.on_message('имя', функция)\` |
| остановка | \`qbit.stop()\` |
| время | \`qbit.seconds()\`, \`qbit.millis()\` с запуска программы |
| числа | \`qbit.map(x, a, b, c, d)\`, \`qbit.constrain(x, a, b)\` |
| порт по типу | \`qbit.find('led')\` → номер порта (0 — нет), \`qbit.find('led', 1)\` — второй светодиод |
| универсально | \`qbit.port(3).module\`, \`qbit.port(3).value('brightness')\`, \`qbit.port(3).cmd('on', 50)\` |

**Правила.** Если событие пришло, пока предыдущий запуск этого же скрипта ещё идёт, новое событие пропускается. Когда программа останавливается кнопкой «Стоп» или из-за ошибки, светодиоды, зуммер, мотор и реле выключаются. Если значение называется так же, как команда, у значения другое имя в Python (колонка «в Python»).

`;

function row(cells) { return '| ' + cells.join(' | ') + ' |\n'; }
function section(title, spec, key) {
  let s = '### ' + title + (key ? ' — `qbit.' + key + '(порт)`' : '') + '\n\n';
  if (spec.values.length) {
    s += row(['значение', 'тип', 'в Python']) + row(['---', '---', '---']);
    spec.values.forEach((v) => { s += row([v.label + (v.unit ? ', ' + v.unit : ''), TYPE[v.t], '`.' + v.py + '`' + (v.py !== v.n ? ' (в прошивке `' + v.n + '`)' : '')]); });
    s += '\n';
  }
  if (spec.commands.length) {
    s += row(['команда', 'что делает']) + row(['---', '---']);
    spec.commands.forEach((c) => {
      const args = c.args.map((a) => (a.optional ? '[' + a.n + ']' : a.n)).join(', ');
      s += row(['`.' + c.n + '(' + args + ')`', c.label + (c.args.length ? ' (' + c.args.map((a) => a.n + ' — ' + a.label).join('; ') + ')' : '')]);
    });
    s += '\n';
  }
  if (spec.events.length) {
    s += row(['событие', 'аргумент']) + row(['---', '---']);
    spec.events.forEach((e) => { s += row(['`.when(\'' + e.n + '\', f)` — ' + e.label, e.arg === 'value' ? 'число' : e.arg === 'text' ? 'текст' : '—']); });
    s += '\n';
  }
  if (spec.dirNames) s += 'Направления джойстика (`dir`): ' + spec.dirNames.map((n, i) => i + ' = ' + n).join(', ') + '.\n\n';
  if (spec.colorNames) s += 'Имена цветов: ' + spec.colorNames.join(', ') + '; ещё можно строкой `\'#FF8000\'`.\n\n';
  return s;
}

md += '## Плата — `qbit.board`\n\n' + section('Плата', SPEC.board, null).replace('### Плата\n\n', '');
md += '## Модули\n\n';
SPEC.keys.forEach((k) => { md += section(SPEC.modules[k].title, SPEC.modules[k], k); });

const file = path.join(__dirname, '..', 'docs', 'QBIT-API.md');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, md, 'utf8');
console.log('wrote ' + file + ' (' + md.length + ' bytes)');
