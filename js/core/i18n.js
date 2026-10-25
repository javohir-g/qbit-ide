/* Interface languages: Russian, Uzbek (Latin script) and English.

   The source text of the program is Russian, and the Russian sentence is the key:  Q.t('Запустить')  ->  "Run" / "Ishga tushirish".
   A sentence with variable parts uses %1 %2 ... and the values follow:  Q.t('порт %1', 3).
   A text that is not in the dictionary of the chosen language is shown in Russian (tests/i18n.test.js makes sure none is missing).

   The language is fixed while the page lives: it is read once (?lang=en in the address, else the one saved by the language menu, else Russian),
   every text is looked up when it is created, and changing the language reloads the page (the project is saved first).
   The dictionaries (js/i18n/en.js, uz.js) must be loaded before any script that calls Q.t while it loads.

     Q.t(ru, ...values)             translated text
     Q.i18n.lang / .langs           current id ('ru' | 'uz' | 'en') / [{ id, name, short }]
     Q.i18n.setLang(id)             remember the choice and reload the page
     Q.i18n.add(id, { ru: text })   dictionary;  Q.i18n.addBlockly(id, { KEY: text })  Blockly's own messages
     Q.i18n.dom(root)               translate what the static HTML of a page says (title, aria-label, placeholder, leaf text)
     Q.i18n.localizeData(DATA)      names in the generated hardware table
     Q.i18n.blockly(Blockly)        apply the Blockly messages of the language */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var CYR = /[А-Яа-яЁё]/;
  var STORE = 'qbit-lang';
  var LANGS = [
    { id: 'ru', name: 'Русский', short: 'RU' },
    { id: 'uz', name: 'Oʻzbekcha', short: 'UZ' },
    { id: 'en', name: 'English', short: 'EN' }
  ];
  var dict = { uz: {}, en: {} }, blockly = { uz: {}, en: {} }, misses = {};

  function known(id) { return LANGS.some(function (l) { return l.id === id; }); }
  function detect() {
    var id = null, m;
    try { m = /[?&]lang=(ru|uz|en)(?:&|$|#)/.exec((G.location && G.location.search) || ''); if (m) { id = m[1]; try { G.localStorage.setItem(STORE, id); } catch (e) { /* kept for this visit only */ } } } catch (e) { /* no location (Node) */ }
    if (!id) { try { id = G.localStorage.getItem(STORE); } catch (e) { /* private mode, Node */ } }
    if (!known(id) && G.document && G.navigator) {                 // a first visit: the language of the browser (a page, not Node)
      var b = String(G.navigator.language || '').slice(0, 2).toLowerCase();
      if (b === 'uz' || b === 'en') id = b;
    }
    return known(id) ? id : 'ru';
  }
  var lang = detect();

  function t(s) {
    var r = s;
    if (lang !== 'ru') {
      var d = dict[lang][s];
      if (d === undefined) { if (!misses[s]) misses[s] = lang; } else r = d;
    }
    if (arguments.length > 1) {
      var a = arguments;
      r = String(r).replace(/%(\d)/g, function (m, i) { return a[+i] !== undefined ? a[+i] : m; });
    }
    return r;
  }

  function add(id, words) { Object.assign(dict[id], words); }
  function addBlockly(id, words) { Object.assign(blockly[id], words); }

  function setLang(id) {
    if (!known(id)) return;
    var saved = true;
    try { G.localStorage.setItem(STORE, id); } catch (e) { saved = false; }          // then the choice lives only in the address
    if (G.location) G.location.replace(G.location.pathname + (saved ? '' : '?lang=' + id) + (G.location.hash || ''));
  }

  /** names in the generated hardware table (js/data/hw-data.js): kits, categories, module names */
  function localizeData(D) {
    if (lang === 'ru' || !D || D._localized) return;
    D._localized = true;
    ['kits', 'categories'].forEach(function (k) { Object.keys(D[k] || {}).forEach(function (n) { D[k][n] = t(D[k][n]); }); });
    (D.modules || []).concat(D.retired || []).forEach(function (m) { m.name = t(m.name); });     // a retired module can still be on a saved board
  }

  /** the static HTML of a page: attributes and the text of elements that hold nothing but text */
  function dom(root) {
    var doc = G.document;
    if (!doc) return;
    doc.documentElement.lang = lang;
    if (lang === 'ru') return;
    root = root || doc.body;
    doc.title = t(doc.title);
    Array.prototype.forEach.call(root.querySelectorAll('*'), function (e) {
      ['title', 'aria-label', 'placeholder'].forEach(function (a) {
        var v = e.getAttribute(a);
        if (v && CYR.test(v)) e.setAttribute(a, t(v));
      });
      if (!e.children.length) {
        var tx = (e.textContent || '').trim();
        if (tx && CYR.test(tx)) e.textContent = e.textContent.replace(tx, function () { return t(tx); });
      }
    });
  }

  /** Blockly's own sentences (context menu, variables, built-in blocks): the Russian set is loaded first, the language overrides it */
  function applyBlockly(B) {
    if (lang === 'ru' || !B || !B.Msg) return;
    Object.keys(blockly[lang]).forEach(function (k) { B.Msg[k] = blockly[lang][k]; });
  }

  Q.t = t;
  Q.i18n = {
    langs: LANGS, add: add, addBlockly: addBlockly, setLang: setLang, dom: dom, localizeData: localizeData, blockly: applyBlockly,
    dict: dict, blocklyDict: blockly, misses: misses, CYR: CYR,
    get lang() { return lang; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
