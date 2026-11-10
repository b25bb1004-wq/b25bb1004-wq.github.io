/* core.js: window.Folio. Agents, helpers, section wiring, hero. Contract in .loop/API.md. */
(function () {
  'use strict';

  var stub = window.Folio;                      // inline queue stub from index.html (may be undefined)
  var gsap = window.gsap, ST = window.ScrollTrigger;

  var KEYS = ['draft', 'plot', 'data', 'check', 'layout'];
  var NAMES = { draft: 'Draft', plot: 'Plot', data: 'Data', check: 'Check', layout: 'Layout' };
  var LEAD = { humble: 'data', pitwall: 'plot', faith: 'check', vox: 'draft', serving: 'layout', scratch: 'plot' };
  var VIZ_LEN = 10;                             // the figure's own timeline is scaled to this many master units
  var ARR = 0.22, ACT = 0.62;                   // share of a helper's duration: arrive, act (the rest is hold)
  var MQ = {
    reduce: '(prefers-reduced-motion: reduce)',
    desktop: '(prefers-reduced-motion: no-preference) and (min-width: 900px) and (min-height: 600px)',
    phone: '(prefers-reduced-motion: no-preference) and ((max-width: 899.98px) or (max-height: 599.98px))'
  };

  var builders = {};                            // id -> build function
  var secs = [];                                // mounted sections (hero + works), rebuilt by mount()
  var bySection = new Map();                    // <section> element -> section state
  var mm = null, mounted = false;

  /* ---------- small utilities ---------- */

  // Cache a layout read per "stamp"; the stamp is bumped before every ScrollTrigger refresh so resize works.
  function memo(S, fn) {
    var st = -1, v;
    return function () { if (st !== S.stamp) { v = fn(); st = S.stamp; } return v; };
  }
  function secOf(el) { var s = el && el.closest && el.closest('section'); return s ? bySection.get(s) : null; }
  function mark(tl, A, a, b) { (tl.__m = tl.__m || []).push({ k: A.key, a: a, b: b }); }
  function span(g, tl) { var s = g.startTime(); return { start: s, end: s + g.duration() }; }

  /* ---------- cursors ---------- */

  var ARROW = '<svg class="cur-arrow" viewBox="0 0 20 22" aria-hidden="true"><path d="M2 1.5l15 8.2-6.6 1.9-2.6 6.8z" fill="currentColor" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  // Cursors are created on first use, so an agent that never works in a section never exists there.
  function ensureEl(A) {
    if (A.el || !A.on) return;
    var el = document.createElement('div');
    el.className = 'cur';
    el.setAttribute('data-agent', A.key);
    el.innerHTML = '<span class="cur-drift">' + ARROW + '</span><span class="cur-tab">' + A.name + '</span>';
    A.S.cast.appendChild(el);
    A.el = el; A.arrow = el.querySelector('.cur-arrow'); A.tab = el.querySelector('.cur-tab'); A.drift = el.querySelector('.cur-drift');
    gsap.set(el, { x: -999, y: -999 });         // parked off screen until its first tween renders
    A.S.used.push(A);
  }

  function entryFn(S, A) {                      // where a cursor comes in from: just above the section's top edge
    return memo(S, function () {
      var cr = S.cast.getBoundingClientRect(), fr = S.frame.getBoundingClientRect();
      return { x: fr.left - cr.left + fr.width * (0.15 + 0.17 * A.idx), y: S.phone ? fr.top - cr.top - 70 : -60 };
    });
  }

  // target: Element | {x,y} in frame (figure) coordinates | function returning {x,y} in frame coordinates | {cast: fn} (internal)
  function targetFn(S, target, o) {
    o = o || {};
    return memo(S, function () {
      var cr = S.cast.getBoundingClientRect(), at = o.at || [0.5, 0.5], x, y, p;
      if (target && target.cast) { p = target.cast(); x = p.x; y = p.y; }
      else if (target && target.getBoundingClientRect) {
        var r = target.getBoundingClientRect(); x = r.left - cr.left + r.width * at[0]; y = r.top - cr.top + r.height * at[1];
      } else {
        var fr = S.frame.getBoundingClientRect(); p = typeof target === 'function' ? target() : target;
        x = fr.left - cr.left + p.x; y = fr.top - cr.top + p.y;
      }
      return { x: x + (o.dx || 0), y: y + (o.dy || 0) };
    });
  }

  /* One travel segment, added to group `g` at local time `at`.
     x and y use different eases so the path arcs; the cursor overshoots by a few px, settles, then clicks.
     Every tween is a fromTo with function values, so a scrub in any direction lands exactly. */
  function move(g, A, toFn, d, at, o) {
    o = o || {};
    var S = A.S, el = A.el, from = A.at, first = !A.moved;
    var plain = !!o.ease || o.settle === false;           // sweeps and exits: straight travel, no overshoot
    var V = memo(S, function () {
      var f = from(), t = toFn(), dx = t.x - f.x, dy = t.y - f.y, dist = Math.hypot(dx, dy) || 1;
      var ov = plain ? 0 : Math.min(8, dist * 0.06), ux = dx / dist, uy = dy / dist;
      return { fx: f.x, fy: f.y, tx: t.x, ty: t.y, ux: ux, uy: uy, ox: t.x + ux * ov, oy: t.y + uy * ov };
    });
    var ease = o.ease || (A.idx % 2 ? ['power3.inOut', 'power2.out'] : ['power2.out', 'power3.inOut']);
    var td = plain ? d : d * 0.85;
    function trail() {                                    // the name tab lags behind the arrow while travelling
      var v = V(), k = -10 * Math.sin(Math.PI * this.progress());
      A.tab.style.transform = 'translate(' + (v.ux * k).toFixed(1) + 'px,' + (v.uy * k).toFixed(1) + 'px)';
    }
    g.fromTo(el, { x: function () { return V().fx; } }, { x: function () { return V().ox; }, ease: ease[0], duration: td, immediateRender: first }, at);
    g.fromTo(el, { y: function () { return V().fy; } }, { y: function () { return V().oy; }, ease: ease[1], duration: td, immediateRender: first, onUpdate: trail }, at);
    if (!plain) {
      g.fromTo(el, { x: function () { return V().ox; }, y: function () { return V().oy; } },
        { x: function () { return V().tx; }, y: function () { return V().ty; }, ease: 'power2.out', duration: d * 0.15, immediateRender: false }, at + td);
    }
    if (o.click !== false) {
      g.fromTo(A.arrow, { scale: 1 }, { scale: 0.8, ease: 'power1.in', duration: d * 0.07, immediateRender: false }, at + td);
      g.fromTo(A.arrow, { scale: 0.8 }, { scale: 1, ease: 'back.out(2.5)', duration: d * 0.1, immediateRender: false }, at + td + d * 0.07);
    }
    A.at = toFn; A.moved = true;
  }

  /* ---------- helpers (the public h) ---------- */

  var H = {};

  // h.go(tl, agent, target, {dur, at:[fx,fy], dx, dy, ease:[ex,ey], click}, pos)
  H.go = function (tl, A, target, o, pos) {
    o = o || {};
    if (A.S.final || !A.on) return { start: 0, end: 0 };
    ensureEl(A);
    var g = gsap.timeline();
    move(g, A, targetFn(A.S, target, o), o.dur || 1, 0, o);
    tl.add(g, pos);
    var s = span(g); mark(tl, A, s.start, s.end);
    return s;
  };

  // h.park(tl, agent, pos): idle spot under the figure, name tab hides (core toggles it from the work marks)
  H.park = function (tl, A, pos) {
    var S = A.S;
    if (S.final || !A.on) return { start: 0, end: 0 };
    ensureEl(A);
    var g = gsap.timeline();
    move(g, A, targetFn(S, function () { return { x: 16 + A.idx * 42, y: S.frame.getBoundingClientRect().height + 26 }; }), 0.9, 0, { click: false });
    tl.add(g, pos);
    var s = span(g); mark(tl, A, s.start, s.end);
    return s;
  };

  /* Typing. The element keeps its real text in .tw-sr; the visible copy is
     [typed][caret][remaining, visibility:hidden] so wrapping and height never change.
     The cursor rides the caret using per-character positions measured once per refresh. */
  function prep(el, A, text) {
    if (el.__tw) return el.__tw;
    var S = A.S, sr = document.createElement('span'), vis = document.createElement('span'), a = document.createElement('span'),
      b = document.createElement('span'), caret = document.createElement('i');
    sr.className = 'tw-sr'; sr.textContent = text;
    vis.className = 'tw-vis'; vis.setAttribute('aria-hidden', 'true');
    a.className = 'tw-a'; b.className = 'tw-b'; caret.className = 'tw-caret';
    var ta = document.createTextNode(''), tb = document.createTextNode(text);
    a.appendChild(ta); b.appendChild(tb); vis.appendChild(a); vis.appendChild(caret); vis.appendChild(b);
    var orig = el.innerHTML;
    el.textContent = ''; el.appendChild(sr); el.appendChild(vis);
    el.classList.add('tw'); el.setAttribute('data-agent', A.key);
    var T = el.__tw = { n: 0, len: text.length, ta: ta, tb: tb, text: text };
    T.set = function (n) {
      T.n = n; ta.nodeValue = text.slice(0, n); tb.nodeValue = text.slice(n);
      el.classList.toggle('typing', n > 0 && n < T.len);
    };
    S.cleanups.push(function () { el.innerHTML = orig; el.classList.remove('tw', 'typing'); el.removeAttribute('data-agent'); delete el.__tw; });
    return T;
  }
  function measure(T, cast) {                   // cursor tip position after n typed characters, in cast coordinates
    var cr = cast.getBoundingClientRect(), na = T.ta.nodeValue.length, rng = document.createRange(), out = [], last = null;
    for (var i = 0; i <= T.len; i++) {
      var j = Math.min(i, T.len - 1), node = j < na ? T.ta : T.tb, off = j < na ? j : j - na, r;
      rng.setStart(node, off); rng.setEnd(node, off + 1);
      var rs = rng.getClientRects(); r = rs.length ? rs[i === T.len ? rs.length - 1 : 0] : null;
      if (r) last = { x: (i === T.len ? r.right : r.left) - cr.left, y: r.top + r.height * 0.82 - cr.top };
      out.push(last || { x: 0, y: 0 });
    }
    return out;
  }

  // h.type(tl, agent, el, {dur}, pos) -> {start, end, a, b} (a..b is the typing window)
  H.type = function (tl, A, el, o, pos) {
    o = o || {};
    var S = A.S, dur = o.dur || 2;
    if (S.final) return { start: 0, end: 0, a: 0, b: 0 };
    var text = (el.__tw ? el.__tw.text : el.textContent.replace(/\s+/g, ' ').trim()), T = prep(el, A, text), len = T.len;
    ensureEl(A);
    var g = gsap.timeline(), tabl = memo(S, function () { return measure(T, S.cast); });
    var a0 = dur * ARR, P = { n: 0 };
    if (A.on) move(g, A, targetFn(S, { cast: function () { return tabl()[0]; } }), a0, 0, { click: false });
    g.fromTo(P, { n: 0 }, {
      n: len, ease: 'none', duration: dur * ACT, immediateRender: false,
      onUpdate: function () {
        T.set(Math.round(P.n));
        if (A.on) { var t = tabl()[T.n]; gsap.set(A.el, { x: t.x, y: t.y }); }
      }
    }, a0);
    g.to({}, { duration: 0 }, dur);
    if (A.on) A.at = function () { return tabl()[len]; };
    tl.add(g, pos);
    var s = span(g); mark(tl, A, s.start, s.end);
    return { start: s.start, end: s.end, a: s.start + a0, b: s.start + a0 + dur * ACT };
  };

  // h.draw(tl, agent, pathEl, {dur}, pos) -> {start, end, a, b}; the stroke is linear along the path
  H.draw = function (tl, A, path, o, pos) {
    o = o || {};
    var S = A.S, dur = o.dur || 3;
    if (S.final) return { start: 0, end: 0, a: 0, b: 0 };
    ensureEl(A);
    var op = getComputedStyle(path).opacity;
    path.setAttribute('pathLength', '1'); path.setAttribute('stroke-dasharray', '1');
    var svg = path.ownerSVGElement;
    var pts = memo(S, function () {             // path sampled in cast coordinates, so following it costs no layout reads
      var cr = S.cast.getBoundingClientRect(), m = path.getScreenCTM(), L = path.getTotalLength(), out = [], N = 96;
      for (var i = 0; i <= N; i++) {
        var p = path.getPointAtLength(L * i / N), q = svg.createSVGPoint(); q.x = p.x; q.y = p.y; q = q.matrixTransform(m);
        out.push({ x: q.x - cr.left, y: q.y - cr.top });
      }
      return out;
    });
    var g = gsap.timeline(), a0 = dur * ARR;
    if (A.on) move(g, A, targetFn(S, { cast: function () { return pts()[0]; } }), a0, 0, { click: false });
    g.fromTo(path, { opacity: 0 }, { opacity: op, duration: 0.001, immediateRender: true }, a0);   // hides round-cap dots at offset 1
    // attr, not CSS: GSAP rounds CSS px values, which would snap a 0..1 offset to 0 or 1
    g.fromTo(path, { attr: { 'stroke-dashoffset': 1 } }, {
      attr: { 'stroke-dashoffset': 0 }, ease: 'none', duration: dur * ACT, immediateRender: true,
      onUpdate: function () {
        if (!A.on) return;
        var pp = pts(), f = this.progress() * (pp.length - 1), i = Math.min(pp.length - 2, Math.floor(f)), t = f - i;
        gsap.set(A.el, { x: pp[i].x + (pp[i + 1].x - pp[i].x) * t, y: pp[i].y + (pp[i + 1].y - pp[i].y) * t });
      }
    }, a0);
    g.to({}, { duration: 0 }, dur);
    if (A.on) A.at = function () { var pp = pts(); return pp[pp.length - 1]; };
    tl.add(g, pos);
    var s = span(g); mark(tl, A, s.start, s.end);
    return { start: s.start, end: s.end, a: s.start + a0, b: s.start + a0 + dur * ACT };
  };

  // h.count(tl, el, {to, decimals, suffix, from, dur}, pos): the final text is already in the HTML
  H.count = function (tl, el, o, pos) {
    var S = secOf(el), final = el.textContent, dec = o.decimals || 0, suf = o.suffix || '', from = o.from || 0;
    if (S && S.final) return { start: 0, end: 0 };
    var nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }), P = { v: from };
    el.textContent = nf.format(from) + suf;
    var tw = gsap.fromTo(P, { v: from }, {
      v: o.to, ease: o.ease || 'power1.out', duration: o.dur || 1, immediateRender: false,
      onUpdate: function () { el.textContent = this.progress() >= 1 ? final : nf.format(P.v) + suf; }
    });
    tl.add(tw, pos);
    var s = span(tw);
    if (S && S.agents.data.on) mark(tl, S.agents.data, s.start, s.end);
    return s;
  };

  // h.tick(tl, el, pos): Check hops to the element and its verified mark pops in
  H.tick = function (tl, el, pos) {
    var S = secOf(el), C = S && S.agents.check, svgEl = !!(window.SVGElement && el instanceof SVGElement), m, circ, pth, inner;
    var NS = 'http://www.w3.org/2000/svg';
    if (svgEl) {                                // SVG target: a <g> placed right of the element's box
      var bb = el.getBBox(), r = Math.max(5, bb.height * 0.5);
      m = document.createElementNS(NS, 'g'); m.setAttribute('class', 'tick-g'); m.setAttribute('aria-hidden', 'true');
      m.setAttribute('transform', 'translate(' + (bb.x + bb.width + r + 6) + ',' + (bb.y + bb.height / 2) + ')');
      inner = document.createElementNS(NS, 'g');
      circ = document.createElementNS(NS, 'circle'); circ.setAttribute('r', r); circ.setAttribute('fill', '#008F7A');
      pth = document.createElementNS(NS, 'path'); pth.setAttribute('d', 'M' + (-r * 0.45) + ' ' + (r * 0.02) + 'l' + (r * 0.3) + ' ' + (r * 0.32) + 'l' + (r * 0.6) + ' ' + (-r * 0.6));
      pth.setAttribute('fill', 'none'); pth.setAttribute('stroke', '#fff'); pth.setAttribute('stroke-width', Math.max(1.5, r * 0.22));
      pth.setAttribute('stroke-linecap', 'round'); pth.setAttribute('stroke-linejoin', 'round'); pth.setAttribute('pathLength', '1');
      inner.appendChild(circ); inner.appendChild(pth); m.appendChild(inner);
      (el.ownerSVGElement || el).appendChild(m);
      if (S) S.cleanups.push(function () { m.remove(); });
    } else {
      m = document.createElement('span'); m.className = 'tick'; m.setAttribute('aria-hidden', 'true');
      m.innerHTML = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/><path d="M4.4 8.4l2.4 2.4 4.8-5" pathLength="1"/></svg>';
      inner = m.firstChild; pth = inner.querySelector('path');
      // inline targets get the mark right after them, blocks get it inside (so a counted element is never wiped)
      if (getComputedStyle(el).display.indexOf('inline') === 0) el.parentNode.insertBefore(m, el.nextSibling); else el.appendChild(m);
      if (S) S.cleanups.push(function () { m.remove(); });
    }
    if (!S || S.final) return { start: 0, end: 0 };
    var g = gsap.timeline(), d0 = 0.7;
    if (C && C.on) { ensureEl(C); move(g, C, targetFn(S, svgEl ? circ : inner, { dx: 4, dy: 4 }), d0, 0, { click: false }); }
    g.fromTo(inner, svgEl ? { scale: 0, opacity: 0, svgOrigin: '0 0' } : { scale: 0, opacity: 0, transformOrigin: '50% 50%' },
      svgEl ? { scale: 1, opacity: 1, svgOrigin: '0 0', ease: 'back.out(2.4)', duration: 0.35, immediateRender: true } :
        { scale: 1, opacity: 1, ease: 'back.out(2.4)', duration: 0.35, immediateRender: true }, d0);
    g.fromTo(pth, { attr: { 'stroke-dasharray': 1, 'stroke-dashoffset': 1 } }, { attr: { 'stroke-dasharray': 1, 'stroke-dashoffset': 0 }, ease: 'power1.out', duration: 0.3, immediateRender: true }, d0 + 0.08);
    g.to({}, { duration: 0 }, d0 + 0.5);
    tl.add(g, pos);
    var s = span(g); if (C && C.on) mark(tl, C, s.start, s.start + d0 + 0.35);
    return s;
  };

  /* ---------- who is working: chips, name tabs ---------- */

  var chips = [];
  function nearest() {                          // the section whose centre is closest to the viewport centre
    var mid = window.innerHeight / 2, best = null, bd = 1e9;
    secs.forEach(function (S) {
      var r = S.el.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bd) { bd = d; best = S; }
    });
    return best;
  }
  function refreshChips() {
    var cur = nearest();
    chips.forEach(function (c) {
      var k = c.getAttribute('data-agent'), A = cur && cur.agents[k];
      c.classList.toggle('on', !!(A && A.on && cur.now[k]));
    });
  }
  function updWork(S) {                         // pure function of master time, so scrubbing back restores it
    var t = S.master.time(), now = {};
    // a master parked at 0 (not reached yet) or at its end has nobody working, even if a move starts at 0
    if (t > 0 && t < S.master.duration()) S.marks.forEach(function (m) { if (t >= m.a && t < m.b) now[m.k] = 1; });
    S.now = now;
    KEYS.forEach(function (k) { var A = S.agents[k]; if (A.el) A.el.classList.toggle('is-work', !!now[k]); });
    refreshChips();
  }
  function mapMarks(list, off, scale) {
    return (list || []).map(function (m) { return { k: m.k, a: off + m.a * scale, b: off + m.b * scale }; });
  }

  /* Name tabs flip to the cursor's left side whenever they would cross the figure's or the viewport's right edge.
     A pure function of the cursor's x, so scrubbing in either direction restores it. */
  function limits(S) {
    if (!S.lim) S.lim = memo(S, function () {
      var cr = S.cast.getBoundingClientRect(), o = { vp: document.documentElement.clientWidth - cr.left - 6 };
      if (S.figure) { var fr = S.figure.getBoundingClientRect(); o.l = fr.left - cr.left; o.r = fr.right - cr.left; }
      return o;
    });
    return S.lim();
  }
  function flipTabs() {
    secs.forEach(function (S) {
      if (!S.vis || !S.vis.isActive || !S.used.length) return;
      var lim = limits(S);
      S.used.forEach(function (A) {
        if (!A.el) return;
        if (!A.tw) A.tw = A.tab.offsetWidth + 20;         // tab width plus its 14 px offset and a margin
        var x = gsap.getProperty(A.el, 'x'), edge = lim.vp;
        if (lim.r && x > lim.l - 24 && x < lim.r) edge = Math.min(edge, lim.r - 4);
        var f = x + A.tw > edge;
        if (f !== !!A.flip) { A.flip = f; A.el.classList.toggle('flip', f); }
      });
    });
  }

  /* ---------- section state ---------- */

  function makeS(el, o) {
    var fig = el.querySelector('figure.viz'), S = {
      el: el, id: el.id, cast: el.querySelector('.cast'), figure: fig, slot: fig && fig.parentNode,
      frame: fig || el.querySelector('.hero-in') || el.querySelector('.method-in'), stamp: 0, used: [], cleanups: [], now: {}, marks: [],
      final: o.final, phone: o.phone, agents: {}, master: null
    };
    var lead = LEAD[el.id], enabled = {};
    KEYS.forEach(function (k) {
      enabled[k] = !o.final && (o.phone ? (el.id === 'hero' ? (k === 'draft' || k === 'layout' || k === 'check') : (k === lead || k === 'check')) : true);
    });
    KEYS.forEach(function (k, i) {
      var A = { key: k, name: NAMES[k], idx: i, S: S, on: enabled[k], el: null, moved: false };
      A.at = entryFn(S, A);
      S.agents[k] = A;
    });
    return S;
  }

  function buildArgs(S, tl, motion) {
    return {
      figure: S.figure, tl: tl, agents: S.agents, h: H, motion: motion,
      section: S.el, title: S.el.querySelector('[data-type]'), claim: S.el.querySelector('.claim')
    };
  }
  function safe(fn, what) { try { fn(); } catch (e) { console.error('[Folio] ' + what + ':', e); } }

  function buildStatic(S, build) {              // reduced motion: run the same code on a dummy timeline, then jump to the end
    var tl = gsap.timeline({ paused: true });
    safe(function () { build(buildArgs(S, tl, false)); }, S.id + ' build');
    tl.progress(1);
    S.figure.classList.add('has-viz');
    S.cleanups.push(function () { S.figure.classList.remove('has-viz'); S.figure.replaceChildren(); });
  }

  function exits(S, m, at) {                    // the crew leaves through the bottom edge, one after another
    S.used.forEach(function (A, i) {
      if (!A.on) return;
      var g = gsap.timeline(), prev = A.at;
      move(g, A, memo(S, function () { return { x: prev().x, y: S.cast.getBoundingClientRect().height + 80 }; }), 0.7, 0, { ease: ['none', 'power2.in'], click: false });
      m.add(g, at + i * 0.35);
      var s = span(g); mark(m, A, s.start, s.end);
    });
  }

  function buildWork(S, build, desktop) {
    var m = gsap.timeline({ paused: true, defaults: { ease: 'none' } }), vtl = gsap.timeline({ defaults: { ease: 'none' } });
    S.master = m;
    var A = S.agents, fig = S.figure, frame = document.createElement('span'), title = S.el.querySelector('[data-type]'), claim = S.el.querySelector('.claim');
    frame.className = 'frame'; frame.setAttribute('aria-hidden', 'true'); S.slot.appendChild(frame);
    S.cleanups.push(function () { frame.remove(); fig.classList.remove('has-viz'); fig.replaceChildren(); });
    safe(function () { build(buildArgs(S, vtl, true)); }, S.id + ' build');
    fig.classList.add('has-viz');
    var k = (vtl.duration() || 1) / VIZ_LEN;    // normalise: the figure's timeline always occupies VIZ_LEN master units
    vtl.timeScale(k);
    var v0 = desktop ? 3.4 : 0.3;

    // 1. Layout frames the figure
    var lay = [-7, -7];
    if (desktop) {
      H.go(m, A.layout, fig, { at: [0, 0], dx: lay[0], dy: lay[1], dur: 1.0 }, 0);
      H.go(m, A.layout, fig, { at: [1, 1], dx: 7, dy: 7, dur: 0.9, ease: ['power2.inOut', 'power2.inOut'], click: false }, 1.0);
    }
    var t0 = desktop ? 1.0 : 0;
    m.fromTo(frame, { opacity: 0, scaleX: 0.02, scaleY: 0.02 }, { opacity: 1, scaleX: 1, scaleY: 1, ease: 'power2.inOut', duration: desktop ? 0.9 : 0.01 }, t0);
    m.fromTo(fig, { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.5 }, t0 + (desktop ? 0.7 : 0));
    m.fromTo(frame, { opacity: 1 }, { opacity: 0, ease: 'power1.out', duration: 0.4, immediateRender: false }, t0 + (desktop ? 1.0 : 0.2));
    if (desktop) H.park(m, A.layout, 2.0);

    // 2. Draft types the title (desktop only; on phones the title is far above the figure, so it stays as is)
    if (desktop && title) { H.type(m, A.draft, title, { dur: 2.2 }, 1.6);  H.park(m, A.draft, 3.9); }

    // 3. the figure's own sequence: lead agent builds, Data places numbers, Check verifies
    m.add(vtl, v0);
    var vend = v0 + VIZ_LEN;

    // 4. the claim settles
    if (desktop && claim) m.fromTo(claim, { opacity: 0.55 }, { opacity: 1, ease: 'power2.out', duration: 0.8 }, vend);
    var xe = vend + (desktop ? 0.8 : 0.2);
    exits(S, m, xe);
    m.to({}, { duration: 0 }, xe + 1.4 + 1.0);   // hold on the finished state before the pin releases

    S.marks = mapMarks(m.__m, 0, 1).concat(mapMarks(vtl.__m, v0, 1 / k));
    m.eventCallback('onUpdate', function () { updWork(S); });

    var vars = desktop
      ? { trigger: S.el, start: 'top top', end: '+=120%', pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true, animation: m }
      : { trigger: fig, start: 'top 85%', end: 'center 40%', scrub: 0.6, invalidateOnRefresh: true, animation: m };
    S.st = ST.create(vars);

    // idle drift for cursors that have arrived; only runs while the section is on screen
    var drifts = S.used.map(function (a, i) {
      return gsap.to(a.drift, { x: 2.5, y: 3, duration: 1.7 + i * 0.35, ease: 'sine.inOut', repeat: -1, yoyo: true, paused: true });
    });
    S.vis = ST.create({ trigger: S.el, start: 'top bottom', end: 'bottom top', onToggle: function (self) { drifts.forEach(function (d) { self.isActive ? d.play() : d.pause(); }); } });
  }

  /* The hero. The crew assembles the name: every letter starts scattered over the hero and an agent's cursor carries
     it home (two letters per agent, at most two cursors moving at once, found by `fit`). Then Draft types the intro,
     Layout nudges the links, Check ticks the intro. One time-driven timeline; any scroll or key skips to the end.
     Afterwards, on fine pointers, the cursors follow the visitor's mouse as a loose flock. */
  var SCAT = [[.08, .2], [.2, .78], [.33, .16], [.45, .86], [.57, .24], [.68, .8], [.8, .18], [.9, .7], [.14, .5], [.84, .46]];
  var ROT = [-34, 28, -18, 41, -27, 15, 38, -41, 22, -12];
  var FLOCK = [[-40, -30], [36, -38], [54, 8], [-6, 42], [-52, 18]];          // fixed offsets by agent index, so followers never stack
  var A_FIRST = 0.32, A_ARR = 0.22, A_CAR = 0.32;                              // carry the first letter at once, later ones arrive first

  function buildHero(S) {
    var A = S.agents, h1 = S.el.querySelector('h1'), intro = S.el.querySelector('.intro'), lis = S.el.querySelectorAll('.links li'),
      tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    S.master = tl;

    // the name: real text on the h1 (aria-label), one inline-block span per letter (aria-hidden)
    var label = h1.textContent.replace(/\s+/g, ' ').trim(), orig = h1.innerHTML, chars = [], pre = [];
    var tn0 = h1.firstChild, rg = document.createRange();           // pen positions of the unsplit text, to put kerning back afterwards
    for (var q = 0; q < label.length; q++) { rg.setStart(tn0, q); rg.setEnd(tn0, q + 1); pre.push(rg.getBoundingClientRect().left); }
    h1.setAttribute('aria-label', label); h1.textContent = '';
    label.split(' ').forEach(function (w, wi) {
      if (wi) h1.appendChild(document.createTextNode(' '));
      var ws = document.createElement('span'); ws.className = 'hw'; ws.setAttribute('aria-hidden', 'true');
      w.split('').forEach(function (c) { var s = document.createElement('span'); s.className = 'hc'; s.textContent = c; ws.appendChild(s); chars.push(s); });
      h1.appendChild(ws);
    });
    S.cleanups.push(function () { h1.innerHTML = orig; h1.removeAttribute('aria-label'); });
    var n = chars.length, fs = parseFloat(getComputedStyle(h1).fontSize), now = chars.map(function (c) { return c.getBoundingClientRect().left; }), idx = 0;
    label.split(' ').forEach(function (w, wi) {                      // kerning lost at the span boundaries, restored as a margin in em
      for (var j = 1; j < w.length; j++) chars[idx + j].style.marginLeft = (((pre[idx + j + wi] - pre[idx + j + wi - 1]) - (now[idx + j] - now[idx + j - 1])) / fs).toFixed(4) + 'em';
      idx += w.length;
    });

    // letter geometry in .hero-in coordinates: natural centre, and displacement to its scattered spot
    var G = memo(S, function () {
      var cr = S.cast.getBoundingClientRect(), fr = S.frame.getBoundingClientRect(), vh = Math.min(cr.height, window.innerHeight),
        g = { w: [], h: [], cx: [], cy: [], dx: [], dy: [] };
      chars.forEach(function (c, i) {
        var sc = SCAT[(i * 3) % SCAT.length];
        g.w.push(c.offsetWidth); g.h.push(c.offsetHeight);
        g.cx.push(h1.offsetLeft + c.offsetLeft + c.offsetWidth / 2); g.cy.push(h1.offsetTop + c.offsetTop + c.offsetHeight / 2);
        g.dx.push(sc[0] * cr.width - (fr.left - cr.left) - g.cx[i]); g.dy.push(sc[1] * vh - (fr.top - cr.top) - g.cy[i]);
      });
      return g;
    });
    function pick(i) { return function () { var g = G(); return { x: g.cx[i] + g.dx[i] + g.w[i] * 0.22, y: g.cy[i] + g.dy[i] + g.h[i] * 0.18 }; }; }
    function drop(i) { return function () { var g = G(); return { x: g.cx[i] + g.w[i] * 0.22, y: g.cy[i] + g.h[i] * 0.18 }; }; }

    // the letter travels exactly as its cursor does (same eases, same overshoot), plus a small rotation settle
    function carry(i, Ak, at) {
      var ch = chars[i], e = Ak.idx % 2 ? ['power3.inOut', 'power2.out'] : ['power2.out', 'power3.inOut'], td = A_CAR * 0.85;
      var V = memo(S, function () { var g = G(), dx = g.dx[i], dy = g.dy[i], d = Math.hypot(dx, dy) || 1, ov = Math.min(8, d * 0.06); return { dx: dx, dy: dy, ox: -dx / d * ov, oy: -dy / d * ov }; });
      tl.fromTo(ch, { x: function () { return V().dx; } }, { x: function () { return V().ox; }, ease: e[0], duration: td }, at);
      tl.fromTo(ch, { y: function () { return V().dy; } }, { y: function () { return V().oy; }, ease: e[1], duration: td }, at);
      tl.fromTo(ch, { x: function () { return V().ox; }, y: function () { return V().oy; } }, { x: 0, y: 0, ease: 'power2.out', duration: A_CAR * 0.15, immediateRender: false }, at + td);
      tl.fromTo(ch, { rotation: ROT[i] }, { rotation: 0, ease: 'back.out(2.4)', duration: A_CAR * 0.95 }, at);
      tl.fromTo(ch, { opacity: 0.3 }, { opacity: 1, ease: 'power1.out', duration: A_CAR * 0.7 }, at);
    }

    // scheduler: earliest start >= `from` where fewer than two cursor jobs overlap anywhere in [t, t+len]
    var busy = [], free = {};
    function fit(len, from) {
      for (var t = from; ; t += 0.02) {
        var ok = true;
        for (var s = t + 0.01; s < t + len; s += 0.02) {
          var c = 0; busy.forEach(function (w) { if (s > w[0] && s < w[1]) c++; });
          if (c > 1) { ok = false; break; }
        }
        if (ok) { busy.push([t, t + len]); return t; }
      }
    }
    var crew = KEYS.filter(function (k) { return A[k].on; }), mine = {};
    crew.forEach(function (k) { mine[k] = []; });
    for (var i = 0; i < n; i++) mine[crew[Math.floor(i * crew.length / n)]].push(i);
    ['plot', 'data', 'draft', 'layout', 'check'].filter(function (k) { return A[k].on; }).forEach(function (k) {
      var Ak = A[k], list = mine[k], len = A_FIRST + (list.length - 1) * (A_ARR + A_CAR), p = fit(len, 0), t0 = p;
      Ak.at = targetFn(S, pick(list[0]));          // the cursor waits on its first letter from the start
      list.forEach(function (li, j) {
        if (j) { H.go(tl, Ak, pick(li), { dur: A_ARR, click: false }, p); p += A_ARR; }
        H.go(tl, Ak, drop(li), { dur: j ? A_CAR : A_FIRST, click: false }, p);
        carry(li, Ak, p); p += A_CAR;
      });
      free[k] = t0 + len;
    });

    // Draft types the intro, Layout nudges the links in, Check ticks the intro
    var tt = fit(1.1, free.draft);
    H.type(tl, A.draft, intro, { dur: 1.1 }, tt);
    var tn = fit(0.95, Math.max(free.layout, tt + 0.6));
    tl.fromTo(lis, { opacity: 0, x: -16 }, { opacity: 1, x: 0, ease: 'back.out(1.6)', duration: 0.4, stagger: 0.16 }, tn + 0.2);
    H.go(tl, A.layout, lis[0], { at: [0, 0.5], dx: -8, dur: 0.45, click: false }, tn);
    H.go(tl, A.layout, lis[lis.length - 1], { at: [1, 0.5], dx: 10, dur: 0.5, ease: ['power2.inOut', 'power2.inOut'], click: false }, tn + 0.45);
    var tk = fit(1.05, Math.max(free.check, tt + 1.0));
    H.tick(tl, intro, tk);
    var tp = fit(0.45, tt + 1.1);                  // Draft steps off the end of the intro so Check's mark is not covered
    H.go(tl, A.draft, function () { var fr = S.frame.getBoundingClientRect(); return { x: -26, y: fr.height * 0.5 }; }, { dur: 0.45, click: false }, tp);

    S.marks = mapMarks(tl.__m, 0, 1);
    tl.eventCallback('onUpdate', function () { updWork(S); });
    S.vis = ST.create({ trigger: S.el, start: 'top bottom', end: 'bottom top' });

    // pointer flock (fine pointers only), armed once the sequence has finished
    var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches, on = false, rest = null, qx = {}, qy = {};
    function release() {
      if (!on) return; on = false;
      S.used.forEach(function (Ak) {
        gsap.killTweensOf(Ak.el, 'x,y'); Ak.el.classList.remove('is-follow');
        gsap.to(Ak.el, { x: rest[Ak.key].x, y: rest[Ak.key].y, duration: 0.8, delay: Ak.idx * 0.05, ease: 'power3.inOut' });
      });
    }
    function onMove(e) {
      if (tl.progress() < 1 || window.scrollY > S.el.offsetHeight * 0.6) return;
      var cr = S.cast.getBoundingClientRect();
      if (!on) {
        on = true; if (!rest) { rest = {}; S.used.forEach(function (Ak) { rest[Ak.key] = { x: gsap.getProperty(Ak.el, 'x'), y: gsap.getProperty(Ak.el, 'y') }; }); }
        S.used.forEach(function (Ak) {
          gsap.killTweensOf(Ak.el, 'x,y'); Ak.el.classList.add('is-follow');
          var o = { duration: 0.32 + Ak.idx * 0.12, ease: 'power3.out' }; qx[Ak.key] = gsap.quickTo(Ak.el, 'x', o); qy[Ak.key] = gsap.quickTo(Ak.el, 'y', o);
        });
      }
      S.used.forEach(function (Ak) { qx[Ak.key](e.clientX - cr.left + FLOCK[Ak.idx][0]); qy[Ak.key](e.clientY - cr.top + FLOCK[Ak.idx][1]); });
    }
    function onFar() { if (on && window.scrollY > S.el.offsetHeight * 0.6) release(); }
    if (fine) {
      S.el.addEventListener('mousemove', onMove); S.el.addEventListener('mouseleave', release); window.addEventListener('scroll', onFar, { passive: true });
      S.cleanups.push(function () { S.el.removeEventListener('mousemove', onMove); S.el.removeEventListener('mouseleave', release); window.removeEventListener('scroll', onFar); });
    }

    // the pre-state is already applied (scattered letters, empty typed copy); now let the page show it
    document.documentElement.classList.add('ready');
    var skip = function () { tl.progress(1); off(); };
    var evs = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    function off() { evs.forEach(function (e) { window.removeEventListener(e, skip); }); window.removeEventListener('scroll', onSkipScroll); }
    function onSkipScroll() { if (window.scrollY > 8) skip(); }
    evs.forEach(function (e) { window.addEventListener(e, skip, { passive: true, once: true }); });
    window.addEventListener('scroll', onSkipScroll, { passive: true });
    S.cleanups.push(off);
    S.busy = busy;
    tl.play(0);
  }

  /* #method: unpinned and quiet. Scrubbed with the scroll: the rule above each principle draws left to right, Check ticks its heading. */
  function buildMethod(S) {
    var el = S.el, items = el.querySelectorAll('.principles li'), m = gsap.timeline({ paused: true, defaults: { ease: 'none' } }), rules = [];
    S.master = m;
    Array.prototype.forEach.call(items, function (li) {
      var r = document.createElement('i'); r.className = 'rule'; r.setAttribute('aria-hidden', 'true'); li.insertBefore(r, li.firstChild); rules.push(r);
    });
    el.classList.add('has-rules');
    S.cleanups.push(function () { rules.forEach(function (r) { r.remove(); }); el.classList.remove('has-rules'); });
    Array.prototype.forEach.call(items, function (li, i) {
      m.fromTo(rules[i], { scaleX: 0 }, { scaleX: 1, ease: 'power2.inOut', duration: 0.9 }, i * 1.5);
      H.tick(m, li.querySelector('strong'), i * 1.5 + 0.5);
    });
    exits(S, m, 4.9);
    S.marks = mapMarks(m.__m, 0, 1);
    m.eventCallback('onUpdate', function () { updWork(S); });
    S.st = ST.create({ trigger: el.querySelector('.principles'), start: 'top 82%', end: 'clamp(bottom 55%)', scrub: 0.6, invalidateOnRefresh: true, animation: m });
    S.vis = ST.create({ trigger: el, start: 'top bottom', end: 'bottom top' });
  }

  /* ---------- mount ---------- */

  function mount(ctx) {
    var c = ctx.conditions, reduce = !!c.reduce, desktop = !!c.desktop, local = [];
    chips = Array.prototype.slice.call(document.querySelectorAll('#bar .chip'));
    document.documentElement.classList.add('ready');
    if (!reduce) {
      var line = document.querySelector('#bar .progress i');
      if (line) gsap.to(line, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: document.documentElement, start: 0, end: function () { return ST.maxScroll(window); }, scrub: 0.3 } });
    }
    Array.prototype.forEach.call(document.querySelectorAll('#hero, .work, #method'), function (el) {
      var S = makeS(el, { final: reduce, phone: !desktop });
      if (el.id === 'hero') {
        if (!reduce) { bySection.set(el, S); local.push(S); buildHero(S); }
        return;
      }
      if (el.id === 'method') {
        if (!reduce) { bySection.set(el, S); local.push(S); buildMethod(S); }
        return;
      }
      var build = builders[S.figure && S.figure.getAttribute('data-viz')];
      if (!build) return;                       // not registered: text stays, figure stays empty (and hidden)
      bySection.set(el, S); local.push(S);
      if (reduce) buildStatic(S, build); else buildWork(S, build, desktop);
    });
    secs = local;
    return function () {                        // matchMedia revert: undo every DOM change
      secs.forEach(function (S) {
        S.cleanups.forEach(function (f) { f(); });
        S.used.forEach(function (A) { if (A.el) A.el.remove(); });
        bySection.delete(S.el);
      });
      secs = []; chips.forEach(function (ch) { ch.classList.remove('on'); });
    };
  }

  function start() {
    if (!gsap || !ST) return;                   // vendor scripts missing: the page is plain text, which is fine
    gsap.registerPlugin(ST);
    ST.config({ ignoreMobileResize: true });
    ST.addEventListener('refreshInit', function () { secs.forEach(function (S) { S.stamp++; S.used.forEach(function (A) { A.tw = 0; }); }); });
    gsap.ticker.add(flipTabs);
    ST.addEventListener('refresh', function () {   // events are suppressed during refresh; re-render so typed text and counts match the playhead
      secs.forEach(function (S) { if (S.st && S.master) { S.master.render(S.master.time(), false, true); updWork(S); } });
    });
    var go = function () {
      mm = gsap.matchMedia();
      mm.add(MQ, mount);
      mounted = true;
      var fonts = document.fonts && document.fonts.ready;
      if (fonts) fonts.then(function () { ST.refresh(); });
      window.addEventListener('load', function () { ST.refresh(); });
    };
    // wait briefly for webfonts so text measurements are right; never block longer than 1.2 s
    var gate = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1200); })]) : Promise.resolve();
    gate.then(go);
  }

  /* ---------- public API ---------- */

  function registerViz(name, build) {
    builders[name] = build;
    if (mounted) { mm.revert(); mm.kill(); mounted = false; mm = gsap.matchMedia(); mm.add(MQ, mount); mounted = true; ST.refresh(); }
  }
  var Folio = { agents: KEYS.slice(), h: H, registerViz: registerViz, refresh: function () { if (ST) ST.refresh(); } };
  window.Folio = Folio;
  ((stub && stub._q) || []).forEach(function (q) { builders[q[0]] = q[1]; });

  // deferred scripts run while readyState is 'interactive', before DOMContentLoaded: wait for it so all figures are registered before the single mount
  if (document.readyState === 'complete') start(); else document.addEventListener('DOMContentLoaded', start);
})();
