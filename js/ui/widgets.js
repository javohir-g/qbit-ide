/* Inspector controls built from the descriptions in a module definition (controls / tests / readouts). */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};
  var T = Q.t || String;
  var h = Q.h, U = Q.util;

  var W = {};

  function pct(input) {
    var min = +input.min, max = +input.max, v = +input.value;
    input.style.setProperty('--p', ((v - min) / (max - min) * 100).toFixed(1) + '%');
  }

  function row(label, right) { return h('div', { cls: 'ctl-row' }, h('label', { text: label }), right); }

  /** one control. desc = { type, id?, label, get?, set?, ... }; returns { el, update() } */
  W.control = function (m, desc, isTest) {
    var get = desc.get || (desc.id ? function () { return m.state[desc.id]; } : null);
    var set = desc.set || (desc.id ? function (mm, v) { mm.set(desc.id, v); } : null);
    var el, update = function () {}, input, val, self = { disabled: false };
    switch (desc.type) {
      case 'hold': {
        var b = h('button', { cls: 'holdbtn', type: 'button', text: desc.label });
        var down = false;
        b.addEventListener('pointerdown', function (e) { if (e.button) return; e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } down = true; set(m, true); });
        var end = function () { if (down) { down = false; set(m, false); } };
        b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('lostpointercapture', end);
        b.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); set(m, true); } });
        b.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') set(m, false); });
        el = h('div', { cls: 'ctl' }, b);
        update = function () { b.classList.toggle('on', !!get(m)); };
        break;
      }
      case 'toggle': {
        input = h('input', { type: 'checkbox' });
        input.addEventListener('change', function () { set(m, input.checked); });
        el = h('div', { cls: 'ctl' }, row(desc.label, h('span', { cls: 'switch' }, input, h('i'))));
        update = function () { var v = !!get(m); if (input.checked !== v) input.checked = v; };
        break;
      }
      case 'range': {
        input = h('input', { type: 'range', min: desc.min, max: desc.max, step: desc.step || 1, 'aria-label': desc.label });
        val = h('span', { cls: 'val' });
        var fmt = desc.fmt || function (v) { return String(v); };
        var cur = isTest ? (desc.value !== undefined ? desc.value : desc.min) : null;
        input.addEventListener('input', function () { var v = +input.value; cur = v; pct(input); val.textContent = fmt(v); if (isTest) desc.run(m, v); else set(m, v); });
        el = h('div', { cls: 'ctl' }, row(desc.label, val), input);
        update = function () {
          if (document.activeElement === input) return;
          var v = isTest ? cur : get(m);
          if (+input.value !== v) input.value = v;
          pct(input); val.textContent = fmt(+input.value);
        };
        break;
      }
      case 'select': {
        input = h('select', { cls: 'sel', 'aria-label': desc.label });
        desc.options.forEach(function (o, i) { input.appendChild(h('option', { value: String(i), text: o.t })); });
        input.addEventListener('change', function () { set(m, desc.options[+input.value].v); });
        el = h('div', { cls: 'ctl' }, row(desc.label), input);
        update = function () {
          var v = get(m), i = desc.options.findIndex(function (o) { return o.v === v; });
          if (i >= 0 && +input.value !== i && document.activeElement !== input) input.value = String(i);
        };
        break;
      }
      case 'color': {
        input = h('input', { type: 'color', 'aria-label': desc.label });
        var cv = desc.value || '#ff5a28';
        input.value = cv;
        var swatches = h('div', { cls: 'btnrow', style: { gap: '6px', marginTop: '6px' } });
        ['#ff3b30', '#ffb020', '#ffe14d', '#2fe06b', '#19c3ff', '#7c6bff', '#ff4fd8', '#ffffff'].forEach(function (c) {
          var s = h('button', { type: 'button', cls: 'btn small', style: { flex: '0 0 26px', width: '26px', height: '26px', padding: 0, background: c, borderColor: 'rgba(255,255,255,.4)' }, title: c });
          s.addEventListener('click', function () { input.value = c; input.dispatchEvent(new Event('input')); });
          swatches.appendChild(s);
        });
        var none = null;
        input.addEventListener('input', function () { if (isTest) desc.run(m, input.value); else set(m, input.value); });
        var line = h('div', { cls: 'ctl-row' }, h('label', { text: desc.label }), input);
        el = h('div', { cls: 'ctl' }, line, swatches);
        if (desc.allowNone) {
          none = h('button', { type: 'button', cls: 'btn small', text: T('убрать предмет') });
          none.addEventListener('click', function () { set(m, ''); });
          swatches.appendChild(none);
        }
        update = function () {
          if (isTest) return;
          var v = get(m);
          if (v && input.value !== v && document.activeElement !== input) input.value = v;
        };
        break;
      }
      case 'action':
      default: {
        var btn = h('button', { type: 'button', cls: 'btn', text: desc.label });
        btn.addEventListener('click', function () { desc.run(m); });
        el = h('div', { cls: 'ctl' }, btn);
        break;
      }
    }
    var setDisabled = function (d) {
      Array.prototype.forEach.call(el.querySelectorAll('input,button,select'), function (x) { x.disabled = d; });
    };
    return { el: el, update: update, setDisabled: setDisabled };
  };

  /** a labelled list of key / value rows */
  W.kv = function (rows) {
    var dl = h('dl', { cls: 'kv' });
    rows.forEach(function (r) { dl.appendChild(h('dt', { text: r[0] })); dl.appendChild(h('dd', { text: r[1] })); });
    return dl;
  };

  W.section = function (title, kids) {
    return h('section', { cls: 'sec' }, h('h3', { text: title }), kids);
  };

  W.hexdump = function (bytes, markEnd) {
    var out = [];
    for (var i = 0; i < bytes.length; i += 16) {
      var line = (i < 16 ? '0' + i.toString(16) : i.toString(16)).padStart(2, '0') + '  ';
      var ascii = '';
      for (var k = 0; k < 16; k++) {
        var b = bytes[i + k];
        line += (b < 16 ? '0' : '') + b.toString(16).toUpperCase() + ' ';
        ascii += b >= 32 && b < 127 ? String.fromCharCode(b) : '.';
      }
      out.push(line + ' ' + ascii);
    }
    return out.join('\n');
  };

  Q.widgets = W;
})(typeof globalThis !== 'undefined' ? globalThis : this);
