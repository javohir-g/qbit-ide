/* The console of the board: what the USB serial port would print. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var h = Q.h;

  function Console(el, board) {
    this.el = el; this.board = board;
    this.pending = [];
    this.build();
    var self = this;
    board.on('log', function (e) { self.pending.push(e); });
    board.logs.forEach(function (e) { self.pending.push(e); });
  }

  function stamp(t) {
    var m = Math.floor(t / 60), s = t - m * 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }

  Console.prototype.build = function () {
    var self = this;
    this.el.textContent = '';
    this.log = h('div', { cls: 'log', role: 'log', 'aria-live': 'off' });
    var clear = h('button', { cls: 'btn small', type: 'button', text: T('Очистить') });
    clear.addEventListener('click', function () { self.log.textContent = ''; self.board.logs.length = 0; });
    var copy = h('button', { cls: 'btn small', type: 'button', text: T('Копировать') });
    copy.addEventListener('click', function () {
      var txt = self.board.logs.map(function (e) { return '[' + stamp(e.t) + '] ' + e.text; }).join('\n');
      if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
    });
    this.el.appendChild(h('div', { cls: 'console-head' }, h('b', { text: T('Консоль платы') }), h('span', { text: T('то, что плата печатает по USB') }), h('span', { cls: 'spacer' }), copy, clear));
    this.el.appendChild(this.log);
  };

  Console.prototype.flush = function () {
    if (!this.pending.length) return;
    var atEnd = this.log.scrollTop + this.log.clientHeight >= this.log.scrollHeight - 16;
    var frag = document.createDocumentFragment();
    this.pending.splice(0).forEach(function (e) {
      frag.appendChild(h('div', { cls: e.level }, h('span', { cls: 't', text: stamp(e.t) }), e.text));
    });
    this.log.appendChild(frag);
    while (this.log.childNodes.length > 300) this.log.removeChild(this.log.firstChild);
    if (atEnd) this.log.scrollTop = this.log.scrollHeight;
  };

  Q.Console = Console;
})(typeof globalThis !== 'undefined' ? globalThis : this);
