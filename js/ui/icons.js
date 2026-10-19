/* One set of line icons for the whole UI (no emoji, no symbol characters).
   The shapes live once in the hidden <svg id="svg-defs"> as <symbol>s; a page uses them with
       <svg class="ic"><use href="#i-play"/></svg>        or from script:   Q.icon('play')   Q.iconHtml('bolt')
   Colour and thickness come from CSS (`.ic` strokes with currentColor), so an icon follows the text colour of its button.
   Filled shapes (play, stop, pause, bolt) say fill="currentColor" themselves. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var NS = 'http://www.w3.org/2000/svg';
  var F = ' fill="currentColor" stroke="none"';

  var SHAPES = {
    play: '<path d="M7.2 4.9v14.2c0 .8.9 1.3 1.6.9l11.3-7.1c.6-.4.6-1.3 0-1.7L8.8 4c-.7-.4-1.6.1-1.6.9z"' + F + '/>',
    stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="2.8"' + F + '/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1.5"' + F + '/><rect x="14" y="5" width="4" height="14" rx="1.5"' + F + '/>',
    bolt: '<path d="M13.4 2.6L5.2 13.3h5.4l-1 8.1 8.2-10.7h-5.4z"' + F + ' stroke-linejoin="round"/>',
    check: '<path d="M5 12.6l4.4 4.4L19 7.4"/>',
    x: '<path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10.6" cy="10.6" r="6"/><path d="M15.2 15.2L20 20"/>',
    chevron: '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.4v5.6M12 16.6v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.6M12 7.5v.01"/>',

    file: '<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 3v5h5"/>',
    'file-plus': '<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 3v5h5M12 11.5v6M9 14.5h6"/>',
    folder: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.6l2 2.4H18a2.5 2.5 0 0 1 2.5 2.5v7.6A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z"/>',
    save: '<path d="M5.5 3.5h10.8L20.5 7.7V18.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M7.5 3.5v5h7v-5M7.5 20.5v-6.5h9v6.5"/>',
    book: '<path d="M4.5 18.5V5.5a2 2 0 0 1 2-2h12.8v14H6.5a2 2 0 0 0-2 2 2 2 0 0 0 2 2h12.8v-2"/>',
    pencil: '<path d="M4.5 19.5l.9-4L16.6 4.3a2.1 2.1 0 0 1 3 3L8.5 18.6z"/><path d="M14.6 6.3l3 3"/>',
    code: '<path d="M8.6 7.2L3.8 12l4.8 4.8M15.4 7.2l4.8 4.8-4.8 4.8"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 11.6a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7"/>',
    refresh: '<path d="M19.6 11.2A7.8 7.8 0 1 0 17.4 17"/><path d="M19.8 4.6v6.2h-6.2"/>',
    copy: '<rect x="8.6" y="8.6" width="11" height="11" rx="2.4"/><path d="M15.4 8.6V6.4a2 2 0 0 0-2-2H6.4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2.2"/>',
    undo: '<path d="M9 5L4 10l5 5"/><path d="M4.6 10H14a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="M15 5l5 5-5 5"/><path d="M19.4 10H10a5 5 0 0 0 0 10h3"/>',

    'sound-on': '<path d="M3.5 9.6H7l5-4.1v13l-5-4.1H3.5z"' + F + ' stroke-linejoin="round"/><path d="M15.6 9a4.2 4.2 0 0 1 0 6M18.4 6.2a8 8 0 0 1 0 11.6"/>',
    'sound-off': '<path d="M3.5 9.6H7l5-4.1v13l-5-4.1H3.5z"' + F + ' stroke-linejoin="round"/><path d="M16 9.6l5 5M21 9.6l-5 5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 4 5.6 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.6-4-9s1.4-6.4 4-9z"/>',
    plug: '<path d="M9 3.5v4.6M15 3.5v4.6"/><path d="M6.5 8.1h11v3.4a5.5 5.5 0 0 1-11 0z"/><path d="M12 17v3.5"/>',
    board: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.4"/><rect x="9.7" y="9.7" width="4.6" height="4.6" rx="1"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
    power: '<path d="M12 3.5v8"/><path d="M7 6.9a7.2 7.2 0 1 0 10 0"/>',
    menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
    dots: '<circle cx="5.5" cy="12" r="1.5"' + F + '/><circle cx="12" cy="12" r="1.5"' + F + '/><circle cx="18.5" cy="12" r="1.5"' + F + '/>',
    panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.6"/><path d="M14.8 4.5v15"/>',
    shake: '<rect x="8.2" y="4" width="7.6" height="16" rx="2.2"/><path d="M4.4 8.6c-1.1 2-1.1 4.8 0 6.8M19.6 8.6c1.1 2 1.1 4.8 0 6.8"/>',
    level: '<rect x="3.5" y="9" width="17" height="6" rx="3"/><circle cx="12" cy="12" r="1.3"' + F + '/>',
    swap: '<path d="M4.5 8.5h14.2M15.2 5l3.5 3.5-3.5 3.5"/><path d="M19.5 15.5H5.3M8.8 12l-3.5 3.5L8.8 19"/>',
    'skip-back': '<path d="M6.5 5.5v13"/><path d="M18 6v12c0 .6-.7 1-1.2.6l-8-6c-.4-.3-.4-.9 0-1.2l8-6c.5-.4 1.2 0 1.2.6z"' + F + '/>',
    'skip-fwd': '<path d="M17.5 5.5v13"/><path d="M6 6v12c0 .6.7 1 1.2.6l8-6c.4-.3.4-.9 0-1.2l-8-6C6.7 5 6 5.4 6 6z"' + F + '/>',
    'play-pause': '<path d="M4.5 5.6v12.8c0 .6.6.9 1.1.6l7.6-6.4c.4-.3.4-.9 0-1.2L5.6 5c-.5-.3-1.1 0-1.1.6z"' + F + '/><path d="M16.5 6v12M20 6v12"/>'
  };

  function install() {
    var host = document.getElementById('svg-defs');
    if (!host || host.querySelector('#i-play')) return;
    var html = '';
    Object.keys(SHAPES).forEach(function (k) { html += '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + SHAPES[k] + '</symbol>'; });
    var tmp = document.createElementNS(NS, 'svg');
    tmp.innerHTML = html;
    while (tmp.firstChild) host.appendChild(tmp.firstChild);
  }

  /** <svg class="ic"><use href="#i-name"/></svg> */
  function icon(name, cls) {
    var s = document.createElementNS(NS, 'svg'), u = document.createElementNS(NS, 'use');
    s.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    u.setAttribute('href', '#i-' + name);
    s.appendChild(u);
    return s;
  }
  function iconHtml(name, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }

  Q.icon = icon;
  Q.iconHtml = iconHtml;
  Q.icons = { shapes: SHAPES, install: install };
  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
})(typeof globalThis !== 'undefined' ? globalThis : this);
