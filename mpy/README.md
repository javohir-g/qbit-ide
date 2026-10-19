# mpy: модуль `qbit` для платы

`qbit.py` — то, что импортирует программа на MicroPython (и на CPython для проверки). `qbit_spec.py` создаётся из `ide/js/runtime/spec.js` (`node ide/tools/gen_qbit_spec.js`) и описывает, какие у модулей есть значения, команды и события: в симуляторе и на плате названия берутся из одной таблицы.

## Что нужно от прошивки

Модуль C `_qbit` (тонкая обёртка над `firmware/qbit_core`):

| Функция | Что делает |
|---|---|
| `_qbit.module(port)` | ключ драйвера на порту (`"led"`) или `None` |
| `_qbit.get(port, name)` | значение (число, для текстовых — `str`) из `qbit_port_info_t.val[]` по имени поля |
| `_qbit.cmd(port, words)` | `qbit_port_cmd`: `words` — список строк, `["brightness","50"]`; при ошибке `ValueError("почему")` |
| `_qbit.events()` | события с прошлого вызова: список `(port, kind, value, text)`; `kind` — строки `press`, `release`, `click`, `long`, `change`, `turn`, `code`, `fault`, `key` (порт 0 — плата) |
| `_qbit.board_get(name)` | `battery`, `charging`, `usb`, `volts`, `amps` (из `qbit_power_t`) |
| `_qbit.board_cmd(words)` | `["led","green"]` → `qbit_led_status`, `["led_off"]` |
| `_qbit.ms()` | миллисекунды, монотонные |

Остальное (разбор событий, параллельные скрипты, безопасное состояние, сообщения между скриптами) уже есть в `qbit.py`. Для связи с IDE прошивке нужен ещё «исполнитель»: принимает `{"t":"run","code":…}`, выполняет текст в MicroPython и присылает `print`, `error`, `status`, `state` (см. `docs/PROTOCOL.md`).

## Проверка

`python -I ide/tests/mpy_test.py` — модуль работает на CPython с поддельным `_qbit` (10 проверок: команды, значения с псевдонимами, события, пропуск повторных событий, ошибки, безопасное состояние, сообщения).
