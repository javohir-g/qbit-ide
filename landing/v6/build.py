"""landing/v6: the q.bit landing in the oryzo.ai design language (full-screen scroll scenes, giant type, dotted
hairlines, pills, a live 3D desk in the hero), on the q.bit brand: cool ink / paper / electric blue, pixel logo.
Copy is the v5 copy. Writes index.html; style.css, main.js and scene.js are written by hand.   python build.py"""
import os
H = os.path.dirname(os.path.abspath(__file__))
LOGO = open(os.path.join(H, "logo_path.txt"), encoding="utf-8").read().strip()
EDITOR = "https://javohir-g.github.io/qbit-ide/"

# 5 x 7 pixel font of the station print (qbit_main_revA/tools/top_print.py)
FONT = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"], "I": [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "N": ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"], "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."], "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
}


def px_text(text, cls):
    """pixel text as one SVG path, 1 unit per pixel, horizontal runs merged"""
    x, d = 0, []
    for ch in text:
        g = FONT[ch]
        for r, row in enumerate(g):
            c = 0
            while c < len(row):
                if row[c] == "#":
                    n = 1
                    while c + n < len(row) and row[c + n] == "#":
                        n += 1
                    d.append(f"M{x + c} {r}h{n}v1h-{n}z")
                    c += n
                else:
                    c += 1
        x += len(g[0]) + 1
    return f'<svg class="{cls}" viewBox="0 0 {x - 1} 7" aria-hidden="true"><path d="{"".join(d)}"/></svg>'


def logo(cls="px"):
    return f'<svg class="{cls}" viewBox="0 0 84 36" role="img" aria-label="q.bit"><path d="{LOGO}"/></svg>'


def ico(d):
    return f'<svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>'


ARROW = '<svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12L12 4M6 4h6v6"/></svg>'

# ---------------------------------------------------------------- how it works (v5 loops, one story)
steps = [("Прижми модуль", "Магниты держат, контакты дают сигнал.", "how_snap", "mod_rgb",
          "Модуль RGB опускается в порт 2 станции и встаёт на магниты"),
         ("Станция узнаёт его", "Тип модуля и порт видны сразу.", "how_recog", "station_top",
          "От порта расходится волна, светодиод мигает, появляется подпись «RGB · порт 2»"),
         ("Собери программу", "Блоки в браузере, без установки.", "how_blocks", "blocks_prog",
          "Блок «RGB порт 2 цвет зелёный» защёлкивается под блоком «когда кнопка порт 1 нажата»"),
         ("Запусти — работает!", "Кнопка нажата — RGB горит зелёным.", "how_run", "station_34",
          "Нажатие кнопки в порту 1, модуль RGB загорается зелёным")]
film = "".join(
    f'<li class="film-step" style="--i:{i}"><div class="film-shot"><picture><source media="(prefers-reduced-motion: reduce)" srcset="assets/{still}.webp">'
    f'<img src="assets/{anim}.webp" alt="{alt}" loading="lazy" width="760" height="476"></picture></div>'
    f'<div class="film-cap"><p class="num">[ {i + 1}/{len(steps)} ]</p><h3 class="up">{t}</h3><p>{c}</p></div></li>'
    for i, (t, c, anim, still, alt) in enumerate(steps))
thumbs = "".join(f'<img class="film-thumb" style="--i:{i}" src="assets/{still}.webp" alt="" loading="lazy" width="380" height="238">'
                 for i, (t, c, anim, still, alt) in enumerate(steps))

# ---------------------------------------------------------------- station anatomy: hotspots as fractions of station_front.webp (v5 callouts)
feats = [("Узнаёт модуль", "Станция читает его паспорт", "У каждого модуля есть паспорт. Станция читает его и сразу знает, что подключено и в какой порт.",
          "Тип и порт", "сразу", (0.263, 0.194),
          '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 12l2 2 4-4"/>'),
         ("8 портов", "Модули на магнитах, без проводов", "Модуль встаёт на магниты: они держат, контакты дают сигнал. Ни проводов, ни пайки.",
          "Магниты", "D4 × 1,5 мм", (0.416, 0.484),
          '<rect x="3" y="7" width="3.6" height="3.6" rx=".8"/><rect x="8" y="7" width="3.6" height="3.6" rx=".8"/><rect x="13" y="7" width="3.6" height="3.6" rx=".8"/><rect x="18" y="7" width="3.6" height="3.6" rx=".8"/><rect x="3" y="13.4" width="3.6" height="3.6" rx=".8"/><rect x="8" y="13.4" width="3.6" height="3.6" rx=".8"/><rect x="13" y="13.4" width="3.6" height="3.6" rx=".8"/><rect x="18" y="13.4" width="3.6" height="3.6" rx=".8"/>'),
         ("ESP32-S3 и Wi-Fi", "Своя точка доступа", "Станция поднимает свою точку доступа Wi-Fi. Редактор открывается по ссылке или прямо с неё.",
          "Процессор", "ESP32-S3", (0.844, 0.388),
          '<path d="M3.5 9.5a12 12 0 0117 0M6.5 12.8a7.8 7.8 0 0111 0M9.5 16a3.6 3.6 0 015 0"/><circle cx="12" cy="19" r=".9"/>'),
         ("Без винтов", "Корпус на защёлках", "Лоток, прозрачная пластина и рамка держатся на защёлках. Ни одного винта.",
          "Винтов", "0", (0.894, 0.696),
          '<circle cx="12" cy="12" r="7.5"/><path d="M8.6 12h6.8M12 8.6v6.8M4.5 19.5l15-15"/>'),
         ("USB-C", "Питание и прошивка", "Один разъём USB-C — и для питания, и для прошивки.",
          "Питание и прошивка", "USB-C", (0.5, 0.06),
          '<rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M7.5 12h9"/>'),
         ("Аккумулятор", "Внутри корпуса", "Аккумулятор внутри корпуса: станция работает без розетки.",
          "Питание", "без розетки", (0.55, 0.877),
          '<rect x="3" y="8" width="16" height="8" rx="2"/><path d="M21 10.8v2.4M7 10.8v2.4M10.2 10.8v2.4"/>')]
feat_items = "".join(
    f'<li class="feat-item" style="--i:{i}" data-x="{x}" data-y="{y}"><span class="feat-ico">{ico(svg)}</span><p class="num">[ {i + 1}/{len(feats)} ]</p>'
    f'<h3 class="up feat-title">{t}</h3><p class="up feat-sub">{sub}</p><p class="feat-body">{body}</p>'
    f'<p class="feat-spec"><span class="up">{lab}</span><b class="serif">{val}</b></p></li>'
    for i, (t, sub, body, lab, val, (x, y), svg) in enumerate(feats))

# ---------------------------------------------------------------- modules
mods = [("button", "Кнопка", "ввод"), ("pot", "Потенциометр", "ввод"), ("rgb", "RGB-светодиод", "свет"), ("led", "Светодиод", "свет"),
        ("buzzer", "Зуммер", "звук"), ("oled", "Дисплей OLED", "дисплей"), ("temphum", "Температура и влажность", "датчик"), ("ultrasonic", "Расстояние, ультразвук", "датчик")]
mod_tiles = "".join(f'<li class="mod"><img src="assets/mod_{k}.webp" alt="Модуль «{n}» в лотке" loading="lazy" width="640" height="420"><p class="up">{n}</p><p class="num">[ {c} ]</p></li>'
                    for k, n, c in mods)
names = ["Кнопка", "Потенциометр", "Ползунок", "Сенсорная кнопка", "Энкодер", "Джойстик", "Клавиатура", "Температура и влажность", "Освещённость",
         "Давление", "Датчик цвета", "Качество воздуха", "Движение", "Ультразвук", "Гироскоп", "Компас", "Датчик Холла", "Наклон", "ИК-приёмник",
         "Жесты", "Пульс", "Светодиод", "RGB", "OLED-дисплей", "Зуммер", "Сервопривод", "Мотор", "Реле", "ИК-передатчик", "Макетный модуль", "RFID", "Часы"]
assert len(names) == 32
chips = "".join(f"<span>{n}</span>" for n in names)

# ---------------------------------------------------------------- kits
kits = [("Стартовый", "Стартовый комплект", "Станция и 12 модулей — первая покупка семьи или класса.", "kit_starter", "Станция и модули стартового комплекта", 900, 358,
         ["Есть", "12", "—", "Семья или класс"]),
        ("Модули", "Дополнительные модули", "32 типа, докупаются по одному под новый проект.", "kit_modules", "Три модуля в лотках: кнопка, RGB, зуммер", 900, 227,
         ["—", "По одному, 32 типа", "—", "Новый проект"]),
        ("Школам", "Образовательный набор", "Все 32 модуля и уроки — для школ и учебных центров.", "kit_edu", "Станция и модули образовательного набора", 900, 370,
         ["Есть", "Все 32", "Есть", "Школы и учебные центры"])]
panels = "".join(
    f'<article class="panel panel-{i + 1}" style="--i:{i}"><p class="up panel-cap">{name}<span>{desc}</span></p><h3 class="panel-word">{word}</h3>'
    f'<img src="assets/{img}.webp" alt="{alt}" loading="lazy" width="{w}" height="{h}"></article>'
    for i, (word, name, desc, img, alt, w, h, cells) in enumerate(kits))
rows_lab = ["Станция", "Модули", "Уроки", "Для кого"]
table = ('<thead><tr>' + "".join(f'<th scope="col"><span class="new">Набор {i + 1}</span><b>{name}</b><span class="th-desc">{desc}</span></th>'
                                 for i, (word, name, desc, *_) in enumerate(kits)) + '</tr></thead><tbody>'
         + "".join('<tr>' + "".join(f'<td><span class="td-lab up">{lab}:</span><span class="up">{k[7][r]}</span></td>' for k in kits) + '</tr>'
                   for r, lab in enumerate(rows_lab)) + '</tbody>')

# ---------------------------------------------------------------- specs, problem rows, editor rows
specs = [("Процессор", "ESP32-S3"), ("Связь", "своя точка доступа Wi-Fi, USB-C"), ("Порты", "8, модули на магнитах D4 × 1,5 мм"),
         ("Модули", "32 типа: датчики, дисплеи, моторы, звук"), ("Питание", "аккумулятор внутри корпуса, USB-C"), ("Плата", "155 × 85 мм, 6 слоёв"),
         ("Прошивка", "C на ESP-IDF и MicroPython"), ("Редактор", "qblock: блоки и Python, симулятор, RU · UZ · EN"),
         ("Корпус", "лоток, прозрачная пластина и рамка на защёлках, без винтов")]
spec_rows = "".join(f'<div class="row"><dt class="up">{k}</dt><dd>{v}</dd></div>' for k, v in specs)
pains = [("Провода", "Одна ошибка в схеме — и ничего не работает."), ("Электроника", "Схемы нужно понять до того, как появится интерес."),
         ("Настройка", "Драйверы, среда разработки, нужен компьютер."), ("Цена", "Наборы LEGO SPIKE Prime стоят $440–530 — почти средняя зарплата.")]
pain_rows = "".join(f'<li class="row"><span class="num">[ 0{i + 1} ]</span><h3 class="up">{t}</h3><p>{d}</p><span class="row-x" aria-hidden="true">×</span></li>'
                    for i, (t, d) in enumerate(pains))
checks = [("Блоки → Python", "Тот же код, когда ребёнок готов."), ("Симулятор станции", "Можно учиться без железа."),
          ("Без установки", "По ссылке или со станции по Wi-Fi."), ("RU · UZ · EN", "Русский, узбекский, английский.")]
check_rows = "".join(f'<li class="row"><span class="num">[ 0{i + 1} ]</span><h3 class="up">{t}</h3><p>{d}</p><span class="row-ok" aria-hidden="true"></span></li>'
                     for i, (t, d) in enumerate(checks))
# the Python the editor generates for the two blocks of the story (ide/js/ide/blocks.js, catalog.js)
CODE = ('<span class="k">import</span> qbit\n\n<span class="k">async def</span> <span class="f">when_button_p1_press</span>():\n'
        '    qbit.rgb(<span class="n">2</span>).color(<span class="s">\'green\'</span>)\n\n'
        'qbit.button(<span class="n">1</span>).when(<span class="s">\'press\'</span>, when_button_p1_press)\nqbit.run()')

# ---------------------------------------------------------------- loader: the station's top view as a construction drawing (mm, centred)
# drawn at exactly the size and place where the 3D station appears (CSS --sw = scene.js poses().hero), so the drawing
# turns into the model the way oryzo.ai's ring turns into the coaster
SW, SH, SR = 161.2, 91.2, 17.0                          # bezel outline
handle = lambda x, y, dx, dy, s=1: (f'<path class="h" d="M{x - dx} {y - dy}L{x + dx} {y + dy}"/><rect class="hs" x="{x - .9 * s}" y="{y - .9 * s}" width="{1.8 * s}" height="{1.8 * s}"/>'
                                    f'<circle class="hd" cx="{x - dx}" cy="{y - dy}" r="{.75 * s}"/><circle class="hd" cx="{x + dx}" cy="{y + dy}" r="{.75 * s}"/>')
pockets = "".join(f'<rect class="k" style="--k:{(i * 4 + j) / 9 + .06:.3f}" x="{45 + 35 * i - 97.5 - 16.3}" y="{45 + 35 * j - 62.5 - 16.3}" width="32.6" height="32.6" rx=".8"/>'
                  for j in range(2) for i in range(4))
LOADER = (f'<div class="loader-fig"><span class="loader-fill"></span><svg viewBox="{-SW / 2} {-SH / 2} {SW} {SH}" aria-hidden="true">'
          f'<path class="g" d="M-900 {-SH / 2}H900M-900 {SH / 2}H900M{-SW / 2} -900V900M{SW / 2} -900V900M-900 -43.7H900M-900 43.7H900"/>'
          f'<rect class="o" x="{-SW / 2}" y="{-SH / 2}" width="{SW}" height="{SH}" rx="{SR}"/>'
          f'<rect class="o o2" x="-78.7" y="-43.7" width="157.4" height="87.4" rx="15.2"/>{pockets}'
          + handle(0, -SH / 2, 26, 0) + handle(0, SH / 2, 26, 0) + handle(-SW / 2, 0, 0, 20) + handle(SW / 2, 0, 0, 20)
          + handle(0, -43.7, 15, 0, .8) + handle(0, 43.7, 15, 0, .8) + handle(-78.7, 0, 0, 11, .8) + handle(78.7, 0, 0, 11, .8) + '</svg></div>')

page = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>q.bit station — образовательная робототехника</title>
<meta name="description" content="q.bit station — конструктор электроники и программирования для детей 7–18 лет: модули на магнитах, блоки и Python в браузере.">
<meta name="theme-color" content="#0A0B0F">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=Inter:wght@400;500&family=Literata:opsz,wght@7..72,400&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="style.css">
<script>if (matchMedia('(min-width: 900px) and (min-height: 520px) and (prefers-reduced-motion: no-preference)').matches && !/[?&](plain|no3d)(=|&|$)/.test(location.search)) document.documentElement.classList.add('loading');</script>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
</head>
<body>
<a class="skip" href="#problem">К содержанию</a>
<div class="loader" aria-hidden="true">__LOADER__</div>
<div class="bg" aria-hidden="true"></div>
<div class="edge" aria-hidden="true"></div>

<header class="top">
  <a class="top-logo" href="#top" aria-label="q.bit station — наверх"><i class="top-dot"></i>__LOGO__</a>
  <nav class="top-nav" aria-label="Разделы"><a href="#how">Как работает</a><a href="#station">Станция</a><a href="#modules">Модули</a><a href="#editor">Редактор</a><a href="#kits">Наборы</a></nav>
</header>
<a class="side" href="__EDITOR__" target="_blank" rel="noopener"><span><i></i>Открыть редактор</span></a>
<p class="hint" aria-hidden="true"><i></i>Листайте дальше</p>

<main>
<section class="hero" id="top" data-scene="hero">
  <div class="pin">
    <div class="hero-stage"><img class="hero-poster" src="assets/cover_scene3d_v2.jpg" alt="Станция q.bit в чёрном корпусе с модулями на синем коврике, рядом модули, планшет с программой из блоков и стилус" width="2880" height="1620"></div>
    <div class="hero-ui">
      <p class="up hero-tag">Модули на магнитах. Программы из блоков.</p>
      <h1 class="hero-mark" aria-label="q.bit station">__LOGO__</h1>
      <p class="hero-lead">Конструктор электроники и программирования для детей <span class="nw">7–18 лет</span>. Первый результат — на&nbsp;первом же уроке.</p>
      <div class="hero-card"><p class="up">Образовательная робототехника, доступная каждому.</p><i class="dots"></i><p class="hero-card-s">q.bit station.<br>Сделано<br>в Узбекистане.</p></div>
      <a class="hero-reel" href="#how"><img src="assets/how_run.webp" alt="" width="760" height="476"><span class="up"><i></i>Как это работает</span></a>
      <button class="hero-hint" type="button"><i></i><span>Нажмите кнопку</span></button>
    </div>
  </div>
</section>

<section class="say" id="problem" data-scene="say">
  <div class="pin">
    <h2 class="up say-title" data-split="words">Начать заниматься робототехникой сложно.</h2>
    <p class="say-text" data-split="words">Слишком много нужно понять раньше, чем появится первый результат.*</p>
    <p class="up say-note"><i class="dots"></i>* Провода, схемы,<br>драйверы, цена</p>
  </div>
</section>
<section class="list" aria-label="Что мешает начать">
  <ol class="rows" data-reveal>__PAINS__</ol>
</section>

<section class="big" id="solution" data-scene="big">
  <div class="pin">
    <h2 class="big-title" data-split="letters"><span class="ln">Подключи.</span><span class="ln">Запрограммируй.</span><span class="ln">Создай.</span></h2>
    <p class="up big-label">q.bit station</p>
    <img class="big-img" src="assets/station_34.webp" alt="Станция q.bit в чёрном корпусе с модулями в портах" loading="lazy" width="1600" height="827">
    <p class="up big-cap">Без проводов и пайки.<br>Без установки.<br>Блоки → Python.</p>
    <p class="big-lead">Модули на магнитах и программа из блоков в браузере. Первый результат — на первом же уроке.</p>
  </div>
</section>

<section class="film" id="how" data-scene="film">
  <div class="pin">
    <div class="film-head"><p class="up film-kicker">Четыре шага,</p><h2 class="film-word">как это работает</h2></div>
    <p class="film-intro">Один пример от начала до конца: кнопка в порту 1 включает RGB в порту 2.</p>
    <div class="film-frame" aria-hidden="true"><i></i></div>
    <div class="film-thumbs" aria-hidden="true">__THUMBS__</div>
    <ol class="film-steps">__FILM__</ol>
    <a class="film-link" href="__EDITOR__" target="_blank" rel="noopener">Соберите эту программу сами в редакторе__ARROW__</a>
  </div>
</section>

<section class="feat" id="station" data-scene="feat">
  <div class="pin">
    <div class="feat-head"><h2 class="up">q.bit station</h2><p>Станция, 32 модуля и редактор — одна система</p></div>
    <div class="feat-view"><div class="feat-fig"><img src="assets/station_front.webp" alt="Станция q.bit в чёрном корпусе с модулями, вид спереди" loading="lazy" width="2192" height="770"><i class="feat-mark" aria-hidden="true"><b></b></i></div></div>
    <ol class="feat-list">__FEATS__</ol>
  </div>
</section>

<section class="flip" id="modules" data-scene="flip">
  <div class="pin">
    <p class="up flip-top">Докупаются по одному</p>
    <div class="flip-block"><p class="up flip-kicker">Кнопки, датчики, дисплеи, моторы</p>
      <h2 class="flip-word" data-fit>32 модуля</h2>
      <p class="flip-text">32 типа модулей.<br>Под новый проект — новый модуль.</p></div>
  </div>
</section>
<section class="cards" data-tone="ink" aria-label="Модули">
  <div class="cards-row" data-reveal>
    <article class="card card-blue"><h3 class="up">Один<br>размер</h3><p>Каждый модуль — 30 × 30 мм. Большим хватает двух мест: 65 × 30 мм.</p><b class="card-num" aria-hidden="true">30</b></article>
    <article class="card"><h3 class="up">Встают<br>на магниты</h3><img src="assets/mod_rgb.webp" alt="Модуль RGB в лотке" loading="lazy" width="640" height="420"><p>Магниты держат, контакты дают сигнал. Ни проводов, ни пайки.</p></article>
    <article class="card"><h3 class="up">32 типа</h3><div class="chips" aria-label="Все типы модулей">__CHIPS__</div><p>Кнопки, датчики, дисплеи, моторы и звук.</p></article>
  </div>
  <ul class="mods" data-reveal>__MODS__</ul>
</section>

<section class="editor" id="editor">
  <div class="center" data-reveal><p class="up kick">Блоки и Python</p><h2 class="up">Редактор qblock</h2><p class="lead">Программа из блоков собирается за минуту и сразу работает — на станции или в симуляторе.</p></div>
  <div class="editor-fig" data-reveal><picture><source media="(prefers-reduced-motion: reduce)" srcset="assets/qblock_ipad_still.webp"><img src="assets/qblock_ipad.webp" alt="iPad с редактором qblock: курсор перетаскивает два блока, нажимает «Запустить» и кнопку в симуляторе, RGB станции загорается зелёным" loading="lazy" width="1354" height="979"></picture></div>
  <div class="b2p" data-reveal>
    <figure class="b2p-blocks"><figcaption class="up">Блоки</figcaption><img src="assets/blocks_prog.webp" alt="Программа из двух блоков: когда кнопка в порту 1 нажата, RGB в порту 2 загорается зелёным" loading="lazy" width="1238" height="387"></figure>
    <span class="b2p-arrow" aria-hidden="true">→</span>
    <figure class="b2p-code"><figcaption class="up">Python</figcaption><pre><code>__CODE__</code></pre></figure>
  </div>
  <ol class="rows" data-reveal>__CHECKS__</ol>
  <p class="center" data-reveal><a class="pill" href="__EDITOR__" target="_blank" rel="noopener">Попробовать в браузере__ARROW__</a></p>
</section>

<section class="shelf" id="kits" data-scene="shelf">
  <div class="pin">
    <div class="shelf-track"><div class="shelf-head"><p class="up kick">Наборы</p><h2 class="up">Станция приводит,<br>модули остаются</h2><p>Начните со стартового комплекта и докупайте модули под новые проекты.</p></div>__PANELS__</div>
  </div>
</section>
<section class="pick" aria-label="Сравнение наборов">
  <div class="center" data-reveal><p class="up kick">Выберите свой</p><h2 class="pick-word">набор</h2></div>
  <div class="pick-scroll" data-reveal><table class="pick-table">__TABLE__</table></div>
</section>

<section class="specs" id="specs">
  <div class="specs-in">
    <div data-reveal><p class="up kick">Характеристики</p><h2 class="specs-word">__STATION__</h2></div>
    <dl class="rows" data-reveal>__SPECS__</dl>
    <p class="specs-note" data-reveal>Характеристики могут измениться.</p>
  </div>
</section>

<section class="end" id="try">
  <div class="end-main" data-reveal>
    <span class="end-logo">__LOGO__</span>
    <div class="end-text"><h2 class="up">Попробуйте редактор прямо сейчас.</h2><p class="up">Симулятор станции работает в браузере — без установки и без железа.</p>
      <a class="pill" href="__EDITOR__" target="_blank" rel="noopener">Открыть редактор__ARROW__</a></div>
  </div>
  <footer class="foot">
    <figure class="foot-qr"><img src="assets/qr.png" alt="QR-код: javohir-g.github.io/qbit-ide" loading="lazy" width="528" height="528"><figcaption class="up">Редактор<br>онлайн<span>javohir-g.github.io/qbit-ide</span></figcaption></figure>
    <nav class="foot-nav up" aria-label="Ссылки"><a href="#how">Как работает</a><a href="#station">Станция</a><a href="#modules">Модули</a><a href="#editor">Редактор</a><a href="#kits">Наборы</a><a href="#specs">Характеристики</a></nav>
    <p class="up foot-note">Сделано в Узбекистане<br>© 2026 q.bit</p>
  </footer>
</section>
</main>
<script src="main.js"></script>
</body>
</html>
"""
rep = {"__LOADER__": LOADER, "__LOGO__": logo(), "__STATION__": px_text("STATION", "px"), "__ARROW__": ARROW, "__EDITOR__": EDITOR,
       "__PAINS__": pain_rows, "__THUMBS__": thumbs, "__FILM__": film, "__FEATS__": feat_items, "__CHIPS__": chips, "__MODS__": mod_tiles,
       "__CODE__": CODE, "__CHECKS__": check_rows, "__PANELS__": panels, "__TABLE__": table, "__SPECS__": spec_rows}
for k, v in rep.items():
    page = page.replace(k, v)
assert "__" not in page.replace("__proto__", ""), [t for t in page.split() if "__" in t][:5]
open(os.path.join(H, "index.html"), "w", encoding="utf-8").write(page)
print("index.html", len(page))
