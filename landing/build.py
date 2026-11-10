"""landing/v6: the q.bit landing in the oryzo.ai design language (full-screen scroll scenes, giant type, dotted
hairlines, pills, a live 3D desk in the hero), on the q.bit brand: cool ink / paper / electric blue, pixel logo.
Three languages from one template: index.html = Uzbek (default), ru.html, en.html. Uzbek is Latin script with
oʻ gʻ = U+02BB and the tutuq belgisi = U+02BC, as in the editor (ide/js/i18n/uz.js), and uses the editor's terms.
style.css, main.js and scene.js are written by hand.   python build.py"""
import os, re
H = os.path.dirname(os.path.abspath(__file__))
LOGO = open(os.path.join(H, "logo_path.txt"), encoding="utf-8").read().strip()
EDITOR = "https://javohir-g.github.io/qbit-ide/"
LANGS = [("uz", "index.html", "UZ"), ("ru", "ru.html", "RU"), ("en", "en.html", "EN")]

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

# ================================================================ language-independent data
STEP_IMG = [("how_snap", "mod_rgb"), ("how_recog", "station_top"), ("how_blocks", "blocks_prog"), ("how_run", "station_34")]
# station anatomy: hotspots as fractions of station_front.webp, icons
FEAT_PT = [(0.263, 0.194), (0.416, 0.484), (0.844, 0.388), (0.5, 0.06), (0.55, 0.877)]
FEAT_ICO = ['<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 12l2 2 4-4"/>',
            '<rect x="3" y="7" width="3.6" height="3.6" rx=".8"/><rect x="8" y="7" width="3.6" height="3.6" rx=".8"/><rect x="13" y="7" width="3.6" height="3.6" rx=".8"/><rect x="18" y="7" width="3.6" height="3.6" rx=".8"/><rect x="3" y="13.4" width="3.6" height="3.6" rx=".8"/><rect x="8" y="13.4" width="3.6" height="3.6" rx=".8"/><rect x="13" y="13.4" width="3.6" height="3.6" rx=".8"/><rect x="18" y="13.4" width="3.6" height="3.6" rx=".8"/>',
            '<path d="M3.5 9.5a12 12 0 0117 0M6.5 12.8a7.8 7.8 0 0111 0M9.5 16a3.6 3.6 0 015 0"/><circle cx="12" cy="19" r=".9"/>',
            '<rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M7.5 12h9"/>',
            '<rect x="3" y="8" width="16" height="8" rx="2"/><path d="M21 10.8v2.4M7 10.8v2.4M10.2 10.8v2.4"/>']
MOD_KEYS = ["button", "pot", "rgb", "led", "buzzer", "oled", "temphum", "ultrasonic"]
KIT_IMG = [("kit_starter", 900, 358), ("kit_modules", 900, 227), ("kit_edu", 900, 370)]
# the Python the editor generates for the two blocks of the story (ide/js/ide/blocks.js, catalog.js)
CODE = ('<span class="k">import</span> qbit\n\n<span class="k">async def</span> <span class="f">when_button_p1_press</span>():\n'
        '    qbit.rgb(<span class="n">2</span>).color(<span class="s">\'green\'</span>)\n\n'
        'qbit.button(<span class="n">1</span>).when(<span class="s">\'press\'</span>, when_button_p1_press)\nqbit.run()')

# ================================================================ copy
T = {}
T["ru"] = dict(
    title="q.bit station — образовательная робототехника",
    desc="q.bit station — конструктор электроники и программирования для детей 7–18 лет: модули на магнитах, блоки и Python в браузере.",
    skip="К содержанию", top_label="q.bit station — наверх", nav_label="Разделы", lang_label="Язык",
    nav=["Как работает", "Станция", "Модули", "Редактор", "Наборы", "Характеристики"],
    side="Открыть редактор", hint="Листайте дальше", press="Нажмите кнопку",
    poster_alt="Станция q.bit в чёрном корпусе с модулями на синем коврике, рядом модули, планшет с программой из блоков и стилус",
    hero_tag="Модули на магнитах. Программы из блоков.",
    hero_lead='Конструктор электроники и программирования для детей <span class="nw">7–18 лет</span>. Первый результат — на&nbsp;первом же уроке.',
    hero_card="Образовательная робототехника, доступная каждому.", hero_card_s="q.bit station.<br>Сделано<br>в Узбекистане.",
    say_title="Начать заниматься робототехникой сложно.", say_text="Слишком много нужно понять раньше, чем появится первый результат.*",
    say_note="* Провода, схемы,<br>драйверы", pains_label="Что мешает начать",
    pains=[("Провода", "Одна ошибка в схеме — и ничего не работает."), ("Электроника", "Схемы нужно понять до того, как появится интерес."),
           ("Настройка", "Драйверы, среда разработки, нужен компьютер.")],
    big=["Подключи.", "Запрограммируй.", "Создай."], big_alt="Станция q.bit в чёрном корпусе с модулями в портах",
    big_cap="Без проводов и пайки.<br>Без установки.<br>Блоки → Python.",
    big_lead="Модули на магнитах и программа из блоков в браузере. Первый результат — на первом же уроке.",
    film_kick="Четыре шага,", film_word="как это работает", film_intro="Один пример от начала до конца: кнопка в порту 1 включает RGB в порту 2.",
    film_link="Соберите эту программу сами в редакторе",
    steps=[("Прижми модуль", "Магниты держат, контакты дают сигнал.", "Модуль RGB опускается в порт 2 станции и встаёт на магниты"),
           ("Станция узнаёт его", "Тип модуля и порт видны сразу.", "От порта расходится волна, светодиод мигает, появляется подпись «RGB · порт 2»"),
           ("Собери программу", "Блоки в браузере, без установки.", "Блок «RGB порт 2 цвет зелёный» защёлкивается под блоком «когда кнопка порт 1 нажата»"),
           ("Запусти — работает!", "Кнопка нажата — RGB горит зелёным.", "Нажатие кнопки в порту 1, модуль RGB загорается зелёным")],
    feat_sub="Станция, 32 модуля и редактор — одна система", feat_alt="Станция q.bit в чёрном корпусе с модулями, вид спереди",
    feats=[("Узнаёт модуль", "Станция читает его паспорт", "У каждого модуля есть паспорт. Станция читает его и сразу знает, что подключено и в какой порт.", "Тип и порт", "сразу"),
           ("8 портов", "Модули на магнитах, без проводов", "Модуль встаёт на магниты: они держат, контакты дают сигнал. Ни проводов, ни пайки.", "Портов", "8"),
           ("ESP32-S3 и Wi-Fi", "Своя точка доступа", "Станция поднимает свою точку доступа Wi-Fi. Редактор открывается по ссылке или прямо с неё.", "Процессор", "ESP32-S3"),
           ("USB-C", "Питание и прошивка", "Один разъём USB-C — и для питания, и для прошивки.", "Питание и прошивка", "USB-C"),
           ("Аккумулятор", "Внутри корпуса", "Аккумулятор внутри корпуса: станция работает без розетки.", "Питание", "без розетки")],
    flip_top="Докупаются по одному", flip_kick="Кнопки, датчики, дисплеи, моторы", flip_word="32 модуля",
    flip_text="32 типа модулей.<br>Под новый проект — новый модуль.", cards_label="Модули",
    card2=("Встают<br>на магниты", "Модуль RGB в лотке", "Магниты держат, контакты дают сигнал. Ни проводов, ни пайки."),
    card3=("32 типа", "Все типы модулей", "Кнопки, датчики, дисплеи, моторы и звук."),
    mod_alt="Модуль «{}» в лотке",
    mods=[("Кнопка", "ввод"), ("Потенциометр", "ввод"), ("RGB-светодиод", "свет"), ("Светодиод", "свет"), ("Зуммер", "звук"),
          ("Дисплей OLED", "дисплей"), ("Температура и влажность", "датчик"), ("Расстояние, ультразвук", "датчик")],
    names=["Кнопка", "Потенциометр", "Ползунок", "Сенсорная кнопка", "Энкодер", "Джойстик", "Клавиатура", "Температура и влажность", "Освещённость",
           "Давление", "Датчик цвета", "Качество воздуха", "Движение", "Ультразвук", "Гироскоп", "Компас", "Датчик Холла", "Наклон", "ИК-приёмник",
           "Жесты", "Пульс", "Светодиод", "RGB", "OLED-дисплей", "Зуммер", "Сервопривод", "Мотор", "Реле", "ИК-передатчик", "Макетный модуль", "RFID", "Часы"],
    ed_kick="Блоки и Python", ed_title="Редактор qblock",
    ed_lead="Программа из блоков собирается за минуту и сразу работает — на станции или в симуляторе.",
    ipad_alt="iPad с редактором qblock: курсор перетаскивает два блока, нажимает «Запустить» и кнопку в симуляторе, RGB станции загорается зелёным",
    b2p_blocks="Блоки", blocks_alt="Программа из двух блоков: когда кнопка в порту 1 нажата, RGB в порту 2 загорается зелёным",
    checks=[("Блоки → Python", "Тот же код, когда ребёнок готов."),
            ("Без установки", "По ссылке или со станции по Wi-Fi."), ("RU · UZ · EN", "Русский, узбекский, английский.")],
    try_browser="Попробовать в браузере",
    kits_kick="Наборы", kits_title="Станция приводит,<br>модули остаются", kits_text="Начните со стартового комплекта и докупайте модули под новые проекты.",
    kits=[("Стартовый", "Стартовый комплект", "Станция и 12 модулей — первая покупка семьи или класса.", "Станция и модули стартового комплекта", ["Есть", "12", "—", "Семья или класс"]),
          ("Модули", "Дополнительные модули", "32 типа, докупаются по одному под новый проект.", "Три модуля в лотках: кнопка, RGB, зуммер", ["—", "По одному, 32 типа", "—", "Новый проект"]),
          ("Школам", "Образовательный набор", "Все 32 модуля и уроки — для школ и учебных центров.", "Станция и модули образовательного набора", ["Есть", "Все 32", "Есть", "Школы и учебные центры"])],
    kit_n="Набор {}", kit_rows=["Станция", "Модули", "Уроки", "Для кого"],
    pick_label="Сравнение наборов", pick_kick="Выберите свой", pick_word="набор",
    specs_kick="Характеристики", specs_note="Характеристики могут измениться.",
    specs=[("Процессор", "ESP32-S3"), ("Связь", "своя точка доступа Wi-Fi, USB-C"), ("Порты", "8, модули на магнитах"),
           ("Модули", "32 типа: датчики, дисплеи, моторы, звук"), ("Питание", "аккумулятор внутри корпуса, USB-C"),
           ("Прошивка", "C на ESP-IDF и MicroPython"), ("Редактор", "qblock: блоки и Python, симулятор, RU · UZ · EN")],
    end_title="Попробуйте редактор прямо сейчас.", end_text="Редактор работает в браузере — без установки.",
    open_editor="Открыть редактор", qr_alt="QR-код: javohir-g.github.io/qbit-ide", qr_cap="Редактор<br>онлайн",
    foot_label="Ссылки", foot_note="Сделано в Узбекистане<br>© 2026 q.bit",
)
T["uz"] = dict(
    title="q.bit station — taʼlim robototexnikasi",
    desc="q.bit station — 7–18 yoshli bolalar uchun elektronika va dasturlash konstruktori: magnitli modullar, brauzerda bloklar va Python.",
    skip="Asosiy qismga oʻtish", top_label="q.bit station — yuqoriga", nav_label="Boʻlimlar", lang_label="Til",
    nav=["Qanday ishlaydi", "Stansiya", "Modullar", "Muharrir", "Toʻplamlar", "Xususiyatlar"],
    side="Muharrirni ochish", hint="Pastga aylantiring", press="Tugmani bosing",
    poster_alt="Koʻk gilamchada modullar oʻrnatilgan qora korpusli q.bit stansiyasi, yonida modullar, bloklardan dasturli planshet va stilus",
    hero_tag="Magnitli modullar. Bloklardan dasturlar.",
    hero_lead='<span class="nw">7–18 yoshli</span> bolalar uchun elektronika va dasturlash konstruktori. Birinchi natija — birinchi darsdayoq.',
    hero_card="Hamma uchun ochiq taʼlim robototexnikasi.", hero_card_s="q.bit station.<br>Oʻzbekistonda<br>ishlab chiqarilgan.",
    say_title="Robototexnikani boshlash qiyin.", say_text="Birinchi natijagacha juda koʻp narsani tushunish kerak.*",
    say_note="* Simlar, sxemalar,<br>drayverlar", pains_label="Boshlashga nima xalal beradi",
    pains=[("Simlar", "Sxemadagi bitta xato — va hech narsa ishlamaydi."), ("Elektronika", "Qiziqish paydo boʻlishidan oldin sxemalarni tushunish kerak."),
           ("Sozlash", "Drayverlar, dasturlash muhiti, kompyuter kerak.")],
    big=["Ulang.", "Dasturlang.", "Yarating."], big_alt="Portlarida modullar boʻlgan qora korpusli q.bit stansiyasi",
    big_cap="Simsiz va kavsharsiz.<br>Oʻrnatishsiz.<br>Bloklar → Python.",
    big_lead="Magnitli modullar va brauzerda bloklardan dastur. Birinchi natija — birinchi darsdayoq.",
    film_kick="Toʻrt qadam:", film_word="qanday ishlaydi", film_intro="Boshidan oxirigacha bitta misol: 1-portdagi tugma 2-portdagi RGB ni yoqadi.",
    film_link="Bu dasturni muharrirda oʻzingiz yigʻing",
    steps=[("Modulni qoʻying", "Magnitlar ushlaydi, kontaktlar signal beradi.", "RGB moduli stansiyaning 2-portiga tushib, magnitlarga oʻrnashadi"),
           ("Stansiya uni taniydi", "Modul turi va porti darhol koʻrinadi.", "Portdan toʻlqin tarqaladi, LED miltillaydi, «RGB · 2-port» yozuvi chiqadi"),
           ("Dasturni yigʻing", "Brauzerda bloklar, oʻrnatishsiz.", "«RGB 2-port yashil rang» bloki «1-portdagi tugma bosilganda» bloki ostiga ulanadi"),
           ("Ishga tushiring — ishlaydi!", "Tugma bosildi — RGB yashil yonadi.", "1-portdagi tugma bosiladi, RGB moduli yashil yonadi")],
    feat_sub="Stansiya, 32 modul va muharrir — yagona tizim", feat_alt="Modullar oʻrnatilgan qora korpusli q.bit stansiyasi, old tomondan",
    feats=[("Modulni taniydi", "Stansiya uning pasportini oʻqiydi", "Har bir modulning pasporti bor. Stansiya uni oʻqiydi va nima qaysi portga ulanganini darhol biladi.", "Turi va porti", "darhol"),
           ("8 port", "Magnitli modullar, simsiz", "Modul magnitlarga oʻrnashadi: ular ushlab turadi, kontaktlar signal beradi. Na sim, na kavsharlash.", "Portlar", "8"),
           ("ESP32-S3 va Wi-Fi", "Oʻz kirish nuqtasi", "Stansiya oʻzining Wi-Fi kirish nuqtasini ishga tushiradi. Muharrir havola orqali yoki toʻgʻridan-toʻgʻri stansiyadan ochiladi.", "Protsessor", "ESP32-S3"),
           ("USB-C", "Quvvat va proshivka", "Bitta USB-C ulagichi — ham quvvat, ham proshivka uchun.", "Quvvat va proshivka", "USB-C"),
           ("Akkumulyator", "Korpus ichida", "Akkumulyator korpus ichida: stansiya rozetkasiz ishlaydi.", "Quvvat", "rozetkasiz")],
    flip_top="Bittadan sotib olinadi", flip_kick="Tugmalar, datchiklar, displeylar, motorlar", flip_word="32 modul",
    flip_text="32 turdagi modul.<br>Yangi loyiha — yangi modul.", cards_label="Modullar",
    card2=("Magnitlarga<br>oʻrnashadi", "Lotokdagi RGB moduli", "Magnitlar ushlaydi, kontaktlar signal beradi. Na sim, na kavsharlash."),
    card3=("32 tur", "Barcha modul turlari", "Tugmalar, datchiklar, displeylar, motorlar va tovush."),
    mod_alt="Lotokdagi «{}» moduli",
    mods=[("Tugma", "kiritish"), ("Potensiometr", "kiritish"), ("RGB LED", "yorugʻlik"), ("LED", "yorugʻlik"), ("Zummer", "tovush"),
          ("OLED displey", "displey"), ("Harorat va namlik", "datchik"), ("Masofa, ultratovush", "datchik")],
    names=["Tugma", "Potensiometr", "Sirpanuvchi", "Sensorli tugma", "Enkoder", "Joystik", "Klaviatura", "Harorat va namlik", "Yoritilganlik",
           "Bosim", "Rang datchigi", "Havo sifati", "Harakat", "Ultratovush", "Giroskop", "Kompas", "Xoll datchigi", "Qiyalik", "IQ qabul qilgich",
           "Imo-ishoralar", "Puls", "LED", "RGB", "OLED displey", "Zummer", "Servo", "Motor", "Rele", "IQ uzatgich", "Maket modul", "RFID", "Soat"],
    ed_kick="Bloklar va Python", ed_title="qblock muharriri",
    ed_lead="Bloklardan dastur bir daqiqada yigʻiladi va darhol ishlaydi — stansiyada yoki simulyatorda.",
    ipad_alt="qblock muharriri ochilgan iPad: kursor ikki blokni sudraydi, «Ishga tushirish» va simulyatordagi tugmani bosadi, stansiyaning RGB si yashil yonadi",
    b2p_blocks="Bloklar", blocks_alt="Ikki blokli dastur: 1-portdagi tugma bosilganda 2-portdagi RGB yashil yonadi",
    checks=[("Bloklar → Python", "Bola tayyor boʻlganda — oʻsha kod."),
            ("Oʻrnatishsiz", "Havola orqali yoki stansiyadan Wi-Fi orqali."), ("UZ · RU · EN", "Oʻzbek, rus va ingliz tillari.")],
    try_browser="Brauzerda sinab koʻrish",
    kits_kick="Toʻplamlar", kits_title="Stansiyadan boshlang,<br>modullarni qoʻshing", kits_text="Boshlangʻich toʻplamdan boshlang va yangi loyihalar uchun modullar qoʻshing.",
    kits=[("Start", "Boshlangʻich toʻplam", "Stansiya va 12 ta modul — oila yoki sinf uchun birinchi xarid.", "Boshlangʻich toʻplamdagi stansiya va modullar", ["Bor", "12", "—", "Oila yoki sinf"]),
          ("Modullar", "Qoʻshimcha modullar", "32 tur, yangi loyiha uchun bittadan sotib olinadi.", "Lotoklardagi uchta modul: tugma, RGB, zummer", ["—", "Bittadan, 32 tur", "—", "Yangi loyiha"]),
          ("Maktablar", "Taʼlim toʻplami", "Barcha 32 modul va darslar — maktablar va oʻquv markazlari uchun.", "Taʼlim toʻplamidagi stansiya va modullar", ["Bor", "Hammasi, 32", "Bor", "Maktablar va oʻquv markazlari"])],
    kit_n="{}-toʻplam", kit_rows=["Stansiya", "Modullar", "Darslar", "Kim uchun"],
    pick_label="Toʻplamlarni solishtirish", pick_kick="Oʻzingizga mosini tanlang", pick_word="toʻplam",
    specs_kick="Xususiyatlar", specs_note="Xususiyatlar oʻzgarishi mumkin.",
    specs=[("Protsessor", "ESP32-S3"), ("Aloqa", "oʻz Wi-Fi kirish nuqtasi, USB-C"), ("Portlar", "8, magnitli modullar"),
           ("Modullar", "32 tur: datchiklar, displeylar, motorlar, tovush"), ("Quvvat", "korpus ichidagi akkumulyator, USB-C"),
           ("Proshivka", "ESP-IDF da C va MicroPython"), ("Muharrir", "qblock: bloklar va Python, simulyator, UZ · RU · EN")],
    end_title="Muharrirni hoziroq sinab koʻring.", end_text="Muharrir brauzerda ishlaydi — oʻrnatishsiz.",
    open_editor="Muharrirni ochish", qr_alt="QR-kod: javohir-g.github.io/qbit-ide", qr_cap="Onlayn<br>muharrir",
    foot_label="Havolalar", foot_note="Oʻzbekistonda ishlab chiqarilgan<br>© 2026 q.bit",
)
T["en"] = dict(
    title="q.bit station — educational robotics",
    desc="q.bit station — an electronics and programming kit for kids aged 7–18: magnetic modules, blocks and Python in the browser.",
    skip="Skip to content", top_label="q.bit station — back to top", nav_label="Sections", lang_label="Language",
    nav=["How it works", "Station", "Modules", "Editor", "Kits", "Specs"],
    side="Open the editor", hint="Scroll down", press="Press the button",
    poster_alt="The q.bit station in a black case with modules on a blue mat, next to loose modules, a tablet with a block program and a stylus",
    hero_tag="Magnetic modules. Programs made of blocks.",
    hero_lead='An electronics and programming kit for kids aged <span class="nw">7–18</span>. The first result comes in the very first lesson.',
    hero_card="Educational robotics within everyone’s reach.", hero_card_s="q.bit station.<br>Made<br>in Uzbekistan.",
    say_title="Getting into robotics is hard.", say_text="There is too much to learn before the first result.*",
    say_note="* Wires, circuits,<br>drivers", pains_label="What gets in the way",
    pains=[("Wires", "One mistake in the circuit and nothing works."), ("Electronics", "Circuits have to make sense before the interest comes."),
           ("Setup", "Drivers, a development environment, a computer.")],
    big=["Connect.", "Code.", "Create."], big_alt="The q.bit station in a black case with modules in its ports",
    big_cap="No wires, no soldering.<br>Nothing to install.<br>Blocks → Python.",
    big_lead="Magnetic modules and a block program in the browser. The first result comes in the very first lesson.",
    film_kick="Four steps:", film_word="how it works", film_intro="One example from start to finish: a button in port 1 turns on the RGB in port 2.",
    film_link="Build this program yourself in the editor",
    steps=[("Snap a module in", "Magnets hold it, contacts carry the signal.", "The RGB module drops into port 2 of the station and lands on its magnets"),
           ("The station knows it", "Module type and port show at once.", "A wave spreads from the port, the LED blinks, the label “RGB · port 2” appears"),
           ("Build a program", "Blocks in the browser, nothing to install.", "The block “RGB port 2 color green” snaps under the block “when button port 1 pressed”"),
           ("Run it — it works!", "Press the button, the RGB lights up green.", "The button in port 1 is pressed, the RGB module lights up green")],
    feat_sub="The station, 32 modules and the editor — one system", feat_alt="The q.bit station in a black case with modules, front view",
    feats=[("Knows the module", "The station reads its passport", "Every module carries a passport. The station reads it and knows at once what is plugged in and where.", "Type and port", "at once"),
           ("8 ports", "Magnetic modules, no wires", "A module lands on magnets: they hold it, the contacts carry the signal. No wires, no soldering.", "Ports", "8"),
           ("ESP32-S3 and Wi-Fi", "Its own access point", "The station runs its own Wi-Fi access point. The editor opens from a link or straight from the station.", "Processor", "ESP32-S3"),
           ("USB-C", "Power and firmware", "One USB-C port for both power and firmware.", "Power and firmware", "USB-C"),
           ("Battery", "Inside the case", "The battery sits inside the case: the station works away from a socket.", "Power", "cordless")],
    flip_top="Bought one at a time", flip_kick="Buttons, sensors, displays, motors", flip_word="32 modules",
    flip_text="32 module types.<br>A new project, a new module.", cards_label="Modules",
    card2=("Snap onto<br>magnets", "The RGB module in its tray", "Magnets hold, contacts carry the signal. No wires, no soldering."),
    card3=("32 types", "All module types", "Buttons, sensors, displays, motors and sound."),
    mod_alt="The “{}” module in its tray",
    mods=[("Button", "input"), ("Potentiometer", "input"), ("RGB LED", "light"), ("LED", "light"), ("Buzzer", "sound"),
          ("OLED display", "display"), ("Temperature & humidity", "sensor"), ("Distance, ultrasonic", "sensor")],
    names=["Button", "Potentiometer", "Slider", "Touch button", "Encoder", "Joystick", "Keypad", "Temperature & humidity", "Light",
           "Pressure", "Color sensor", "Air quality", "Motion", "Ultrasonic", "Gyroscope", "Compass", "Hall sensor", "Tilt", "IR receiver",
           "Gestures", "Pulse", "LED", "RGB", "OLED display", "Buzzer", "Servo", "Motor", "Relay", "IR transmitter", "Prototyping module", "RFID", "Clock"],
    ed_kick="Blocks and Python", ed_title="The qblock editor",
    ed_lead="A block program comes together in a minute and runs right away — on the station or in the simulator.",
    ipad_alt="An iPad with the qblock editor: the cursor drags two blocks, presses Run and the button in the simulator, the station’s RGB lights up green",
    b2p_blocks="Blocks", blocks_alt="A two-block program: when the button in port 1 is pressed, the RGB in port 2 lights up green",
    checks=[("Blocks → Python", "The same code, when the child is ready."),
            ("Nothing to install", "From a link or from the station over Wi-Fi."), ("UZ · RU · EN", "Uzbek, Russian and English.")],
    try_browser="Try it in the browser",
    kits_kick="Kits", kits_title="Start with the station,<br>grow with the modules", kits_text="Begin with the starter kit and add modules for new projects.",
    kits=[("Starter", "Starter kit", "The station and 12 modules — the first buy for a family or a class.", "Station and modules of the starter kit", ["Yes", "12", "—", "Family or class"]),
          ("Modules", "Extra modules", "32 types, bought one at a time for a new project.", "Three modules in trays: button, RGB, buzzer", ["—", "One at a time, 32 types", "—", "A new project"]),
          ("Schools", "Education kit", "All 32 modules and lessons — for schools and learning centers.", "Station and modules of the education kit", ["Yes", "All 32", "Yes", "Schools and learning centers"])],
    kit_n="Kit {}", kit_rows=["Station", "Modules", "Lessons", "For"],
    pick_label="Kit comparison", pick_kick="Choose your", pick_word="kit",
    specs_kick="Specifications", specs_note="Specifications may change.",
    specs=[("Processor", "ESP32-S3"), ("Connectivity", "its own Wi-Fi access point, USB-C"), ("Ports", "8, magnetic modules"),
           ("Modules", "32 types: sensors, displays, motors, sound"), ("Power", "battery inside the case, USB-C"),
           ("Firmware", "C on ESP-IDF and MicroPython"), ("Editor", "qblock: blocks and Python, simulator, UZ · RU · EN")],
    end_title="Try the editor right now.", end_text="The editor runs in the browser — nothing to install.",
    open_editor="Open the editor", qr_alt="QR code: javohir-g.github.io/qbit-ide", qr_cap="Editor<br>online",
    foot_label="Links", foot_note="Made in Uzbekistan<br>© 2026 q.bit",
)
assert T["ru"].keys() == T["uz"].keys() == T["en"].keys()

# ================================================================ loader: the station's top view as a construction drawing (mm, centred)
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

PAGE = """<!doctype html>
<html lang="@@lang@@">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@@title@@</title>
<meta name="description" content="@@desc@@">
<meta name="theme-color" content="#0A0B0F">
@@alternates@@
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=Inter:wght@400;500&family=Literata:opsz,wght@7..72,400&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="style.css">
<script>if (matchMedia('(min-width: 900px) and (min-height: 520px) and (prefers-reduced-motion: no-preference)').matches && !/[?&](plain|no3d)(=|&|$)/.test(location.search)) document.documentElement.classList.add('loading');</script>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
</head>
<body>
<a class="skip" href="#problem">@@skip@@</a>
<div class="loader" aria-hidden="true">@@LOADER@@</div>
<div class="bg" aria-hidden="true"></div>

<header class="top">
  <div class="top-l">
    <a class="top-logo" href="#top" aria-label="@@top_label@@"><i class="top-dot"></i>@@LOGO@@</a>
    <nav class="lang" aria-label="@@lang_label@@">@@LANGS@@</nav>
  </div>
  <nav class="top-nav" aria-label="@@nav_label@@">@@NAV@@</nav>
</header>
<a class="side" href="@@EDITOR@@" target="_blank" rel="noopener"><span><i></i>@@side@@</span></a>
<p class="hint" aria-hidden="true"><i></i>@@hint@@</p>

<main>
<section class="hero" id="top" data-scene="hero">
  <div class="pin">
    <div class="hero-stage"><img class="hero-poster" src="assets/cover_scene3d_v2.jpg" alt="@@poster_alt@@" width="2880" height="1620"></div>
    <div class="hero-ui">
      <p class="up hero-tag">@@hero_tag@@</p>
      <h1 class="hero-mark" aria-label="q.bit station">@@LOGO@@</h1>
      <p class="hero-lead">@@hero_lead@@</p>
      <div class="hero-card"><p class="up">@@hero_card@@</p><i class="dots"></i><p class="hero-card-s">@@hero_card_s@@</p></div>
      <button class="hero-hint" type="button"><i></i><span>@@press@@</span></button>
    </div>
  </div>
</section>

<section class="say" id="problem" data-scene="say">
  <div class="pin">
    <h2 class="up say-title" data-split="words">@@say_title@@</h2>
    <p class="say-text" data-split="words">@@say_text@@</p>
    <p class="up say-note"><i class="dots"></i>@@say_note@@</p>
  </div>
</section>
<section class="list" aria-label="@@pains_label@@">
  <ol class="rows" data-reveal>@@PAINS@@</ol>
</section>

<section class="big" id="solution" data-scene="big">
  <div class="pin">
    <h2 class="big-title" data-split="letters">@@BIG@@</h2>
    <p class="up big-label">q.bit station</p>
    <img class="big-img" src="assets/station_34.webp" alt="@@big_alt@@" loading="lazy" width="1600" height="827">
    <p class="up big-cap">@@big_cap@@</p>
    <p class="big-lead">@@big_lead@@</p>
  </div>
</section>

<section class="film" id="how" data-scene="film">
  <div class="pin">
    <div class="film-head"><p class="up film-kicker">@@film_kick@@</p><h2 class="film-word">@@film_word@@</h2></div>
    <p class="film-intro">@@film_intro@@</p>
    <div class="film-frame" aria-hidden="true"><i></i></div>
    <div class="film-thumbs" aria-hidden="true">@@THUMBS@@</div>
    <ol class="film-steps">@@FILM@@</ol>
    <a class="film-link" href="@@EDITOR@@" target="_blank" rel="noopener">@@film_link@@@@ARROW@@</a>
  </div>
</section>

<section class="feat" id="station" data-scene="feat">
  <div class="pin">
    <div class="feat-head"><h2 class="up">q.bit station</h2><p>@@feat_sub@@</p></div>
    <div class="feat-view"><div class="feat-fig"><img src="assets/station_front.webp" alt="@@feat_alt@@" loading="lazy" width="2192" height="770"><i class="feat-mark" aria-hidden="true"><b></b></i></div></div>
    <ol class="feat-list">@@FEATS@@</ol>
  </div>
</section>

<section class="flip" id="modules" data-scene="flip">
  <div class="pin">
    <p class="up flip-top">@@flip_top@@</p>
    <div class="flip-block"><p class="up flip-kicker">@@flip_kick@@</p>
      <h2 class="flip-word" data-fit>@@flip_word@@</h2>
      <p class="flip-text">@@flip_text@@</p></div>
  </div>
</section>
<section class="cards" data-tone="ink" aria-label="@@cards_label@@">
  <div class="cards-row" data-reveal>
    <article class="card"><h3 class="up">@@CARD2H@@</h3><img src="assets/mod_rgb.webp" alt="@@CARD2A@@" loading="lazy" width="640" height="420"><p>@@CARD2P@@</p></article>
    <article class="card"><h3 class="up">@@CARD3H@@</h3><div class="chips" aria-label="@@CARD3A@@">@@CHIPS@@</div><p>@@CARD3P@@</p></article>
  </div>
  <ul class="mods" data-reveal>@@MODS@@</ul>
</section>

<section class="editor" id="editor">
  <div class="center" data-reveal><p class="up kick">@@ed_kick@@</p><h2 class="up">@@ed_title@@</h2><p class="lead">@@ed_lead@@</p></div>
  <div class="editor-fig" data-reveal><picture><source media="(prefers-reduced-motion: reduce)" srcset="assets/qblock_ipad_still.webp"><img src="assets/qblock_ipad.webp" alt="@@ipad_alt@@" loading="lazy" width="1354" height="979"></picture></div>
  <div class="b2p" data-reveal>
    <figure class="b2p-blocks"><figcaption class="up">@@b2p_blocks@@</figcaption><img src="assets/blocks_prog.webp" alt="@@blocks_alt@@" loading="lazy" width="1238" height="387"></figure>
    <span class="b2p-arrow" aria-hidden="true">→</span>
    <figure class="b2p-code"><figcaption class="up">Python</figcaption><pre><code>@@CODE@@</code></pre></figure>
  </div>
  <ol class="rows" data-reveal>@@CHECKS@@</ol>
  <p class="center" data-reveal><a class="pill" href="@@EDITOR@@" target="_blank" rel="noopener">@@try_browser@@@@ARROW@@</a></p>
</section>

<section class="shelf" id="kits" data-scene="shelf">
  <div class="pin">
    <div class="shelf-track"><div class="shelf-head"><p class="up kick">@@kits_kick@@</p><h2 class="up">@@kits_title@@</h2><p>@@kits_text@@</p></div>@@PANELS@@</div>
  </div>
</section>
<section class="pick" aria-label="@@pick_label@@">
  <div class="center" data-reveal><p class="up kick">@@pick_kick@@</p><h2 class="pick-word">@@pick_word@@</h2></div>
  <div class="pick-scroll" data-reveal><table class="pick-table">@@TABLE@@</table></div>
</section>

<section class="specs" id="specs">
  <div class="specs-in">
    <div data-reveal><p class="up kick">@@specs_kick@@</p><h2 class="specs-word">@@STATION@@</h2></div>
    <dl class="rows" data-reveal>@@SPECS@@</dl>
    <p class="specs-note" data-reveal>@@specs_note@@</p>
  </div>
</section>

<section class="end" id="try">
  <div class="end-main" data-reveal>
    <span class="end-logo">@@LOGO@@</span>
    <div class="end-text"><h2 class="up">@@end_title@@</h2><p class="up">@@end_text@@</p>
      <a class="pill" href="@@EDITOR@@" target="_blank" rel="noopener">@@open_editor@@@@ARROW@@</a></div>
  </div>
  <footer class="foot">
    <figure class="foot-qr"><img src="assets/qr.png" alt="@@qr_alt@@" loading="lazy" width="528" height="528"><figcaption class="up">@@qr_cap@@<span>javohir-g.github.io/qbit-ide</span></figcaption></figure>
    <nav class="foot-nav up" aria-label="@@foot_label@@">@@FOOTNAV@@</nav>
    <nav class="lang lang-foot" aria-label="@@lang_label@@">@@LANGS@@</nav>
    <p class="up foot-note">@@foot_note@@</p>
  </footer>
</section>
</main>
<script src="main.js"></script>
</body>
</html>
"""
SECTIONS = ["#how", "#station", "#modules", "#editor", "#kits", "#specs"]


def build(lang):
    t = T[lang]
    film = "".join(
        f'<li class="film-step" style="--i:{i}"><div class="film-shot"><picture><source media="(prefers-reduced-motion: reduce)" srcset="assets/{still}.webp">'
        f'<img src="assets/{anim}.webp" alt="{alt}" loading="lazy" width="760" height="476"></picture></div>'
        f'<div class="film-cap"><p class="num">[ {i + 1}/4 ]</p><h3 class="up">{h}</h3><p>{c}</p></div></li>'
        for i, ((h, c, alt), (anim, still)) in enumerate(zip(t["steps"], STEP_IMG)))
    thumbs = "".join(f'<img class="film-thumb" style="--i:{i}" src="assets/{still}.webp" alt="" loading="lazy" width="380" height="238">'
                     for i, (anim, still) in enumerate(STEP_IMG))
    n = len(t["feats"])
    feats = "".join(
        f'<li class="feat-item" style="--i:{i}" data-x="{x}" data-y="{y}"><span class="feat-ico">{ico(svg)}</span><p class="num">[ {i + 1}/{n} ]</p>'
        f'<h3 class="up feat-title">{h}</h3><p class="up feat-sub">{sub}</p><p class="feat-body">{body}</p>'
        f'<p class="feat-spec"><span class="up">{lab}</span><b class="serif">{val}</b></p></li>'
        for i, ((h, sub, body, lab, val), (x, y), svg) in enumerate(zip(t["feats"], FEAT_PT, FEAT_ICO)))
    mods = "".join(f'<li class="mod"><img src="assets/mod_{k}.webp" alt="{t["mod_alt"].format(nm)}" loading="lazy" width="640" height="420"><p class="up">{nm}</p><p class="num">[ {c} ]</p></li>'
                   for k, (nm, c) in zip(MOD_KEYS, t["mods"]))
    assert len(t["names"]) == 32
    kits = t["kits"]
    panels = "".join(
        f'<article class="panel panel-{i + 1}" style="--i:{i}"><p class="up panel-cap">{name}<span>{desc}</span></p><h3 class="panel-word">{word}</h3>'
        f'<img src="assets/{img}.webp" alt="{alt}" loading="lazy" width="{w}" height="{hh}"></article>'
        for i, ((word, name, desc, alt, cells), (img, w, hh)) in enumerate(zip(kits, KIT_IMG)))
    table = ('<thead><tr>' + "".join(f'<th scope="col"><span class="new">{t["kit_n"].format(i + 1)}</span><b>{name}</b><span class="th-desc">{desc}</span></th>'
                                     for i, (word, name, desc, *_) in enumerate(kits)) + '</tr></thead><tbody>'
             + "".join('<tr>' + "".join(f'<td><span class="td-lab up">{lab}:</span><span class="up">{k[4][r]}</span></td>' for k in kits) + '</tr>'
                       for r, lab in enumerate(t["kit_rows"])) + '</tbody>')
    rows = lambda items, mark: "".join(f'<li class="row"><span class="num">[ 0{i + 1} ]</span><h3 class="up">{h}</h3><p>{d}</p><span class="{mark}" aria-hidden="true">{"×" if mark == "row-x" else ""}</span></li>'
                                       for i, (h, d) in enumerate(items))
    langs = "".join(f'<a href="{f}" hreflang="{c}" lang="{c}"' + (' aria-current="true"' if c == lang else '') + f'>{lab}</a>' for c, f, lab in LANGS)
    alternates = "\n".join(f'<link rel="alternate" hreflang="{c}" href="{f}">' for c, f, _ in LANGS) + '\n<link rel="alternate" hreflang="x-default" href="index.html">'
    rep = dict(t)
    rep.update({
        "lang": lang, "alternates": alternates, "LOADER": LOADER, "LOGO": logo(), "STATION": px_text("STATION", "px"), "ARROW": ARROW,
        "EDITOR": f"{EDITOR}?lang={lang}", "LANGS": langs,
        "NAV": "".join(f'<a href="{s}">{a}</a>' for s, a in zip(SECTIONS[:5], t["nav"][:5])),
        "FOOTNAV": "".join(f'<a href="{s}">{a}</a>' for s, a in zip(SECTIONS, t["nav"])),
        "PAINS": rows(t["pains"], "row-x"), "CHECKS": rows(t["checks"], "row-ok"),
        "BIG": "".join(f'<span class="ln">{w}</span>' for w in t["big"]),
        "THUMBS": thumbs, "FILM": film, "FEATS": feats, "MODS": mods, "PANELS": panels, "TABLE": table, "CODE": CODE,
        "CHIPS": "".join(f"<span>{nm}</span>" for nm in t["names"]),
        "CARD2H": t["card2"][0], "CARD2A": t["card2"][1], "CARD2P": t["card2"][2],
        "CARD3H": t["card3"][0], "CARD3A": t["card3"][1], "CARD3P": t["card3"][2],
        "SPECS": "".join(f'<div class="row"><dt class="up">{k}</dt><dd>{v}</dd></div>' for k, v in t["specs"]),
    })
    page = re.sub(r"@@(\w+)@@", lambda m: str(rep[m.group(1)]), PAGE)
    assert "@@" not in page
    return page


for lang, fn, _ in LANGS:
    page = build(lang)
    open(os.path.join(H, fn), "w", encoding="utf-8").write(page)
    print(fn, len(page))
