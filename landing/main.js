/* q.bit landing v6: scroll scenes in the oryzo.ai manner.
   Two modes. "cine" (wide screen, motion allowed): sections with data-scene are pinned and driven by scroll;
   every frame the script writes --p (0..1 through the pinned stretch), --in and --out on them and style.css does
   the choreography. Otherwise (phone, reduced motion, no script) the same markup is a plain page.
   ?plain forces the plain page, ?no3d keeps the poster instead of the live scene, ?still switches easing and the
   scroll magnet off, ?nosnap only the magnet. */
(function () {
  'use strict';
  var doc = document.documentElement, QB = (window.QB = window.QB || {});
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  var Q = new URLSearchParams(location.search);

  var mq = matchMedia('(min-width: 320px) and (min-height: 480px) and (prefers-reduced-motion: no-preference)');
  var cine = mq.matches && !Q.has('plain');
  doc.classList.add('js'); doc.classList.toggle('cine', cine);
  var STILL = Q.has('still');                            // ?still: no easing, no transitions (screenshots, hidden tabs)
  if (STILL) doc.classList.add('still');
  mq.addEventListener('change', function () { location.reload(); });

  /* ---------------------------------------------------------------- text split into words / letters (cine only) */
  function plainText(node) {
    var s = '';
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) s += n.textContent; else if (n.tagName === 'BR') s += ' '; else s += plainText(n) + (n.classList.contains('ln') ? ' ' : '');
    });
    return s;
  }
  function split(el) {
    var letters = el.dataset.split === 'letters', i = 0, label = plainText(el).replace(/\s+/g, ' ').trim();
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 1) { if (n.tagName !== 'BR') walk(n); return; }
        var frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(function (tok) {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
          var w = document.createElement('span'); w.className = 'w';
          if (letters) Array.from(tok).forEach(function (ch) { var c = document.createElement('span'); c.className = 'ch'; c.textContent = ch; c.style.setProperty('--i', i++); w.appendChild(c); });
          else { w.textContent = tok; w.style.setProperty('--i', i++); }
          frag.appendChild(w);
        });
        node.replaceChild(frag, n);
      });
    })(el);
    el.style.setProperty('--n', i);
    if (/^H\d$/.test(el.tagName)) { el.setAttribute('aria-label', label); $$('.w', el).forEach(function (w) { w.setAttribute('aria-hidden', 'true'); }); }
  }
  if (cine) $$('[data-split]').forEach(split);

  /* ---------------------------------------------------------------- reveal on enter */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal]').forEach(function (el) { io.observe(el); });
  } else $$('[data-reveal]').forEach(function (el) { el.classList.add('in'); });

  /* ---------------------------------------------------------------- the type chips drift in three rows */
  $$('.chips').forEach(function (box) {
    var kids = $$('span', box), n = 3, per = Math.ceil(kids.length / n);
    box.textContent = '';
    for (var r = 0; r < n; r++) {
      var row = document.createElement('div'); row.className = 'chips-row';
      [0, 1].forEach(function (copy) { kids.slice(r * per, (r + 1) * per).forEach(function (k) { var c = k.cloneNode(true); if (copy) c.setAttribute('aria-hidden', 'true'); row.appendChild(c); }); });
      box.appendChild(row);
    }
  });

  /* ---------------------------------------------------------------- scenes */
  var scenes = $$('[data-scene]').map(function (el) { return { el: el, name: el.dataset.scene, top: 0, h: 0, p: -1, tp: 0, inn: -1, out: -1 }; });
  var byName = {}; scenes.forEach(function (s) { byName[s.name] = s; });
  var secs = [], vh = innerHeight, vw = innerWidth, docH = 1, lastT = 0, running = false;
  var hint = $('.hint');

  var film = byName.film && { steps: $$('.film-step', byName.film.el), thumbs: $$('.film-thumb', byName.film.el), frame: $('.film-frame', byName.film.el),
    head: $('.film-head', byName.film.el), word: $('.film-word', byName.film.el), kick: $('.film-kicker', byName.film.el), fw: 0, tw: 0 };
  var navs = $$('.top-nav a').map(function (a) { return { a: a, el: $(a.getAttribute('href')), top: 0 }; }).filter(function (n) { return n.el; }), navOn = null;
  var feat = byName.feat && { items: $$('.feat-item', byName.feat.el), fig: $('.feat-fig', byName.feat.el) };
  var shelf = byName.shelf && { track: $('.shelf-track', byName.shelf.el), w: 0 };
  if (feat) feat.pts = feat.items.map(function (li) { return { x: +li.dataset.x, y: +li.dataset.y }; });

  function measure() {
    vh = innerHeight; vw = innerWidth; docH = Math.max(1, doc.scrollHeight - vh);
    scenes.forEach(function (s) { var r = s.el.getBoundingClientRect(); s.top = r.top + scrollY; s.h = r.height; });
    secs = $$('main > section').map(function (el) { var r = el.getBoundingClientRect(); return { el: el, top: r.top + scrollY, bottom: r.bottom + scrollY, tone: el.dataset.tone || '' }; });
    navs.forEach(function (n) { n.top = n.el.getBoundingClientRect().top + scrollY; });
    if (!cine) return;
    $$('[data-fit]').forEach(function (el) {            // one word across the whole column
      el.style.fontSize = ''; var base = parseFloat(getComputedStyle(el).fontSize), w = el.scrollWidth, box = el.parentNode.clientWidth;
      if (w > 0) el.style.fontSize = (base * box / w).toFixed(2) + 'px';
    });
    if (film) {
      film.fw = film.frame.offsetWidth; film.tw = film.thumbs[0] ? film.thumbs[0].offsetWidth : 0;
      // the giant word is laid out at its big size and scaled DOWN into the small title: scaling a small word up blurs it
      film.word.style.fontSize = film.word.style.marginTop = '';
      var mt = getComputedStyle(film.word).marginTop;    // keep the small title's gap above it
      film.pad = film.head.offsetLeft; film.ww = film.word.offsetWidth; film.wh = film.word.offsetHeight;
      film.S = (vw - film.pad * 2) / Math.max(1, film.ww);
      film.word.style.fontSize = (parseFloat(getComputedStyle(film.word).fontSize) * film.S).toFixed(2) + 'px'; film.word.style.marginTop = mt;
      film.wy = film.head.offsetTop + film.word.offsetTop; film.ky = film.head.offsetTop + film.kick.offsetTop; film.kh = film.kick.offsetHeight;
    }
    if (shelf) shelf.w = shelf.track.scrollWidth;
    buildZones();
  }

  var H = {
    hero: function (s) { QB.heroP = s.tp; s.el.classList.toggle('gone', s.p > 0.23); },
    say: function (s) { QB.sayP = s.tp; },
    film: function (s) {
      var n = film.steps.length, t = clamp((s.p - 0.24) / 0.56, 0, 1) * (n - 1), b = Math.min(Math.floor(t), n - 2);   // the last step rests from 0.8 to the fade at 0.93
      t = b + smooth(0.3, 0.7, t - b);
      // the giant word spans the page, then shrinks into the small title on the left
      var kk = smooth(0.07, 0.2, s.p), S = film.S, bigTop = vh * 0.5 - film.wh * S * 0.5;
      film.word.style.transform = 'translate3d(0,' + ((1 - kk) * (bigTop - film.wy)).toFixed(1) + 'px,0) scale(' + ((1 + (1 - kk) * (S - 1)) / S).toFixed(4) + ')';
      film.kick.style.transform = 'translate3d(0,' + ((1 - kk) * (bigTop - film.kh * 1.35 - film.ky)).toFixed(1) + 'px,0)';
      s.el.style.setProperty('--k', kk.toFixed(3)); s.el.style.setProperty('--big', (1 - kk).toFixed(3)); s.el.style.setProperty('--end', smooth(n - 1.5, n - 1.02, t).toFixed(3));
      var gap = vw * 0.012, k = film.fw / 2 + gap + film.tw / 2;
      film.steps.forEach(function (el, i) {
        var d = i - t; el.style.setProperty('--d', d.toFixed(4)); el.style.setProperty('--o', clamp(1 - Math.abs(d) * 2.4, 0, 1).toFixed(3));
        el.classList.toggle('on', Math.abs(d) < 0.5);
      });
      film.thumbs.forEach(function (el, i) {
        var d = i - t, a = Math.abs(d), x = (d < 0 ? -1 : 1) * (Math.min(a, 1) * k + Math.max(a - 1, 0) * (film.tw + gap));
        el.style.transform = 'translate(-50%, -50%) translateX(' + x.toFixed(1) + 'px)'; el.style.opacity = (clamp(a * 2 - 0.9, 0, 1) * 0.7).toFixed(3);
      });
    },
    feat: function (s) {
      var n = feat.items.length, t = clamp((s.p - 0.03) / 0.8, 0, 1) * (n - 1), b = Math.min(Math.floor(t), n - 2), e = smooth(0.22, 0.78, t - b), tt = b + e;
      feat.items.forEach(function (el, i) {
        var d = i - tt; el.style.setProperty('--o', clamp(1 - Math.abs(d) * 2.6, 0, 1).toFixed(3)); el.style.setProperty('--d', d.toFixed(4)); el.classList.toggle('on', Math.abs(d) < 0.5);
      });
      var A = feat.pts[b], B = feat.pts[b + 1];
      feat.fig.style.setProperty('--mx', ((A.x + (B.x - A.x) * e) * 100).toFixed(2) + '%'); feat.fig.style.setProperty('--my', ((A.y + (B.y - A.y) * e) * 100).toFixed(2) + '%');
      feat.fig.style.setProperty('--pulse', (1 - Math.abs(e - 0.5) * 2).toFixed(3));
    },
    shelf: function (s) { shelf.track.style.transform = 'translate3d(' + (-(shelf.w - vw) * smooth(0.04, 0.96, s.p)).toFixed(1) + 'px,0,0)'; }
  };

  function frame(now) {
    var dt = Math.min(0.1, (now - lastT) / 1000 || 0.016); lastT = now;
    var y = scrollY, k = STILL ? 1 : 1 - Math.exp(-dt * 9), busy = false, pinned = false;
    scenes.forEach(function (s) {
      var span = Math.max(1, s.h - vh);
      s.tp = clamp((y - s.top) / span, 0, 1);
      var inn = clamp((y + vh - s.top) / vh, 0, 1), out = clamp((y - s.top - span) / vh, 0, 1);
      if (s.p < 0) s.p = s.tp;
      var np = Math.abs(s.tp - s.p) < 0.0004 ? s.tp : s.p + (s.tp - s.p) * k;
      if (np !== s.tp) busy = true;
      if (inn > 0 && out < 1 && y > s.top - 4 && s.tp < 0.985) pinned = true;
      if (np === s.p && inn === s.inn && out === s.out) return;
      s.p = np; s.inn = inn; s.out = out;
      if (!cine) return;
      s.el.style.setProperty('--p', np.toFixed(4)); s.el.style.setProperty('--in', inn.toFixed(4)); s.el.style.setProperty('--out', out.toFixed(4));
      if (H[s.name]) H[s.name](s);
    });
    if (!cine && byName.hero) QB.heroP = byName.hero.tp;
    // header tone follows what is under it; the scroll thumb follows the page
    var probe = y + 40, tone = '';
    for (var i = 0; i < secs.length; i++) if (probe >= secs[i].top && probe < secs[i].bottom) { tone = secs[i].tone; break; }
    if (cine && byName.flip && probe >= byName.flip.top && probe < byName.flip.top + byName.flip.h) tone = byName.flip.p > 0.47 || byName.flip.out > 0 ? 'ink' : '';
    if (doc.dataset.tone !== tone) doc.dataset.tone = tone;
    var cur = null; for (i = 0; i < navs.length; i++) if (navs[i].top <= y + vh * 0.5) cur = navs[i];
    if (cur !== navOn) { if (navOn) navOn.a.removeAttribute('aria-current'); if (cur) cur.a.setAttribute('aria-current', 'true'); navOn = cur; }
    doc.style.setProperty('--page', (y / docH).toFixed(4));
    doc.classList.toggle('scrolled', y > vh * 0.6);
    if (hint) hint.classList.toggle('on', cine && pinned);
    if (busy) requestAnimationFrame(frame); else running = false;
  }
  function kick() { if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(frame); } }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', function () { measure(); kick(); });
  addEventListener('load', function () { measure(); kick(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); kick(); });
  measure(); kick();

  /* ---------------------------------------------------------------- scroll magnet (cine only)
     A pinned scene has frames that are composed (a step of the film, a feature, a panel of the shelf) and stretches in
     between where things are half faded or the screen is nearly empty. When the scroll comes to rest inside such a
     stretch, the page glides on to the next composed frame in the direction of travel. Plain sections scroll freely.
     zones: merged runs of scenes that follow each other without a plain section between; pts: the rest positions. */
  var SNAP = { hero: [0], say: [0.66], big: [0.82], film: [0, 0.22, 0.4267, 0.6133, 0.82], flip: [0.3, 0.8] };
  var BLANK_IN = { big: 1 }, BLANK_OUT = { say: 1 };     // scenes that are empty when they enter / after they fade out
  var zones = [], mag = { on: cine && !STILL && !Q.has('nosnap'), dir: 0, y: scrollY, timer: 0, auto: false, raf: 0, held: false };
  function unsmooth(a, b, f) {                           // inverse of smooth(): where between a and b it reaches f
    for (var lo = 0, hi = 1, i = 0; i < 24; i++) { var m = (lo + hi) / 2; if (m * m * (3 - 2 * m) < f) lo = m; else hi = m; }
    return a + (b - a) * (lo + hi) / 2;
  }
  function restsOf(s) {                                  // rest points of a scene, as its progress 0..1
    if (s.name === 'feat' && feat) { var n = feat.items.length; return feat.items.map(function (el, i) { return i ? 0.03 + 0.8 * i / (n - 1) : 0; }); }
    if (s.name === 'shelf' && shelf) {                   // the head with the first panel, every middle panel centred, the last one
      var room = shelf.w - vw, out = [0];
      if (room > 0) $$('.panel', shelf.track).slice(1, -1).forEach(function (el) { out.push(unsmooth(0.04, 0.96, clamp((el.offsetLeft + el.offsetWidth / 2 - vw / 2) / room, 0, 1))); });
      out.push(0.97); return out;
    }
    return SNAP[s.name] || [];
  }
  function buildZones() {
    zones = []; if (!mag || !mag.on) return;
    var z = null;
    scenes.forEach(function (s, i) {
      var span = Math.max(1, s.h - vh), prev = scenes[i - 1], next = scenes[i + 1];
      if (!(z && prev && s.top <= prev.top + Math.max(1, prev.h - vh) + 2)) {
        var floor = z ? z.b : 0;                         // a short section between two scenes: never reach back into the zone before
        z = { a: s.top, b: 0, pts: [] }; zones.push(z);
        if (BLANK_IN[s.name]) { z.a = Math.max(floor, s.top - vh * 0.85); z.pts.push(Math.max(floor, s.top - vh)); }   // back out: the section above, flush with the bottom
      }
      restsOf(s).forEach(function (p) { z.pts.push(s.top + p * span); });
      z.b = s.top + span;
      if (BLANK_OUT[s.name] && !(next && next.top <= s.top + span + 2)) { z.b = s.top + s.h; z.pts.push(s.top + s.h); }   // on: the top of the section below
    });
  }
  function glide(to) {
    var from = scrollY, t0 = performance.now(), dur = clamp(380 + Math.abs(to - from) / vh * 520, 450, 1400);
    mag.auto = true; mag.until = t0 + dur + 400;
    (function step(now) {
      if (!mag.auto) return;
      var x = clamp((now - t0) / dur, 0, 1), e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(2 - 2 * x, 3) / 2;
      scrollTo({ top: from + (to - from) * e, behavior: 'instant' });
      if (x < 1) mag.raf = requestAnimationFrame(step); else mag.auto = false;
    })(t0);
  }
  function settle() {
    if (mag.auto && performance.now() > mag.until) mag.auto = false;                    // a glide that never finished (a frozen tab)
    if (!mag.on || mag.auto || mag.held || doc.classList.contains('loading')) return;
    var y = scrollY, z = null, dir = mag.dir, best = null, i, d;
    for (i = 0; i < zones.length; i++) if (y > zones[i].a + 2 && y < zones[i].b - 2) { z = zones[i]; break; }
    if (!z) return;
    for (i = 0; i < z.pts.length; i++) if (Math.abs(z.pts[i] - y) < 3) return;          // already resting on a frame
    for (i = 0; i < scenes.length; i++) if (Math.abs(scenes[i].top - y) < 3) dir = 1;   // landed on a scene's top (a menu link): go in
    for (i = 0; i < z.pts.length; i++) {
      d = z.pts[i] - y;
      if (dir > 0 ? d > 0 && (best === null || d < best - y) : dir < 0 ? d < 0 && (best === null || d > best - y) : best === null || Math.abs(d) < Math.abs(best - y)) best = z.pts[i];
    }
    if (best !== null) glide(best);
  }
  QB.mag = mag; QB.zones = function () { return zones; };                              // for tools/snaptest.js
  function rest() { clearTimeout(mag.timer); mag.timer = setTimeout(settle, 160); }
  function letGo() { if (mag.auto) { mag.auto = false; cancelAnimationFrame(mag.raf); } }   // the visitor takes over
  if (mag.on) {
    buildZones();
    addEventListener('scroll', function () { var y = scrollY; if (!mag.auto) { if (y !== mag.y) mag.dir = y > mag.y ? 1 : -1; if (mag.held) mag.moved = true; else rest(); } mag.y = y; }, { passive: true });
    addEventListener('wheel', letGo, { passive: true });
    addEventListener('keydown', function (e) { if (/^(Arrow|Page|Home|End| $)/.test(e.key)) letGo(); });
    ['touchstart', 'mousedown'].forEach(function (t) { addEventListener(t, function () { letGo(); mag.held = true; }, { passive: true }); });   // also a drag of the scrollbar
    var free = function () { mag.held = false; if (mag.moved) { mag.moved = false; rest(); } };
    ['touchend', 'touchcancel', 'mouseup'].forEach(function (t) { addEventListener(t, free, { passive: true }); });
    addEventListener('mousemove', function (e) { if (mag.held && !e.buttons) free(); }, { passive: true });                               // a mouseup the scrollbar swallowed
  }

  /* ---------------------------------------------------------------- the glass card catches the light under the cursor */
  $$('.hero-card').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--cx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%'); card.style.setProperty('--cy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  });

  /* ---------------------------------------------------------------- live hero scene behind a loader; the poster is the fallback
     loading: the station's drawing on the mat-blue fills up with the download -> reveal: the blue gives way to the blurred
     scene, which comes into focus under the drawing -> ui: the texts come in -> ready: the drawing is gone */
  var webgl = (function () { try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  function done() { doc.classList.remove('loading'); doc.classList.add('ui', 'ready'); }
  if (cine && webgl && !Q.has('no3d')) {
    var loader = $('.loader'), shown = 0, goal = 0.04;
    QB.still = STILL;
    doc.classList.add('loading');
    QB.progress = function (f) { goal = Math.max(goal, Math.min(0.96, f)); };
    (function tick() {
      shown = STILL ? goal : shown + (goal - shown) * 0.12; loader.style.setProperty('--load', shown.toFixed(3));
      if (!doc.classList.contains('ready')) requestAnimationFrame(tick);
    })();
    QB.ready = function () {
      goal = 1;
      var at = function (ms, fn) { if (STILL) fn(); else setTimeout(fn, ms); };
      at(500, function () { doc.classList.add('live', 'reveal'); });
      at(1900, function () { doc.classList.add('ui'); doc.classList.remove('loading'); });
      at(3300, function () { doc.classList.add('ready'); });
    };
    QB.fail = done;
    import('./scene.js').catch(function (e) { console.warn('hero scene not loaded', e); done(); });
    setTimeout(function () { if (!doc.classList.contains('ui')) done(); }, 25000);
  } else done();
})();
