/* viz-scratch.js: a micrograd-style graph. Plot draws it forward, gradients flow back along the edges, Check ticks two tests. */
Folio.registerViz('scratch', function (ctx) {
  var figure = ctx.figure, tl = ctx.tl, A = ctx.agents, h = ctx.h;

  // Symbols only: value nodes a, b, c feed * and +, then tanh, into the output L. kind v = value box, o = operation circle.
  var N = {
    a: { k: 'v', x: 28, y: 40, t: 'a' }, b: { k: 'v', x: 28, y: 96, t: 'b' }, c: { k: 'v', x: 28, y: 160, t: 'c' },
    mul: { k: 'o', x: 100, y: 68, r: 18, t: '*' }, add: { k: 'o', x: 172, y: 114, r: 18, t: '+' },
    tanh: { k: 'o', x: 250, y: 114, r: 24, t: 'tanh' }, L: { k: 'v', x: 332, y: 114, t: 'L', out: 1 }
  };
  var E = [['a', 'mul'], ['b', 'mul'], ['mul', 'add'], ['c', 'add'], ['add', 'tanh'], ['tanh', 'L']];
  function half(n) { return n.k === 'v' ? 17 : n.r; }
  function edge(e, rev) {                         // cubic with horizontal ends, from the source's right side to the target's left
    var s = N[e[0]], t = N[e[1]], x1 = s.x + half(s), x2 = t.x - half(t), m = (x1 + x2) / 2;
    return rev ? 'M' + x2 + ' ' + t.y + 'C' + m + ' ' + t.y + ' ' + m + ' ' + s.y + ' ' + x1 + ' ' + s.y
      : 'M' + x1 + ' ' + s.y + 'C' + m + ' ' + s.y + ' ' + m + ' ' + t.y + ' ' + x2 + ' ' + t.y;
  }

  // ---- 1. final state ----
  var base = '', grad = '', pulses = '', nodes = '';
  E.forEach(function (e) {
    base += '<path class="sc-e" d="' + edge(e) + '"/>';
    grad += '<path class="sc-g" d="' + edge(e, 1) + '" pathLength="1" stroke-dasharray="1" stroke-dashoffset="0"/>';
    pulses += '<circle class="sc-p" r="5" opacity="0"/>';
  });
  Object.keys(N).forEach(function (id) {
    var n = N[id], shape = n.k === 'v'
      ? '<rect x="-17" y="-15" width="34" height="30" rx="7"/>' : '<circle r="' + n.r + '"/>';
    nodes += '<g transform="translate(' + n.x + ' ' + n.y + ')"><g class="sc-n' + (n.out ? ' sc-out' : '') + '" data-id="' + id + '">' + shape +
      '<text class="' + (n.t === 'tanh' ? 'sc-sm' : '') + '" y="0" dy="' + (n.t === '*' ? '.62em' : '.36em') + '" text-anchor="middle">' + n.t + '</text></g></g>';
  });
  figure.innerHTML =
    '<svg class="sc-map" viewBox="0 0 360 196" aria-hidden="true">' + base + grad + nodes + pulses + '</svg>' +
    '<ul class="legend sc-tests">' +
    '<li><i class="sc-sw sc-f"></i><span>forward pass</span><span class="sc-pass">test passed</span></li>' +
    '<li><i class="sc-sw sc-b"></i><span>backward gradients</span><span class="sc-pass">test passed</span></li></ul>' +
    '<div class="sc-status"><p class="sc-s"><i class="sc-dot"></i>micrograd done</p>' +
    '<p class="sc-s"><i class="sc-dot sc-wip"></i>makemore in progress</p></div>' +
    '<p class="cap sc-cap">Schematic</p>';

  // ---- 2. the build sequence ----
  var q = function (s) { return figure.querySelectorAll(s); };
  var bases = q('.sc-e'), grads = q('.sc-g'), pls = q('.sc-p'), tests = q('.sc-tests li'), pass = q('.sc-pass');
  var status = q('.sc-s'), cap = figure.querySelector('.sc-cap');
  function node(id) { return figure.querySelector('.sc-n[data-id="' + id + '"]'); }
  function pop(id, at) {
    tl.fromTo(node(id), { opacity: 0, scale: 0.5, transformOrigin: '50% 50%' },
      { opacity: 1, scale: 1, transformOrigin: '50% 50%', ease: 'back.out(2)', duration: 0.35 }, Math.max(0, at));
  }

  // forward pass: Plot draws each edge in turn (sources first), and a node appears as the stroke reaches it
  var D = 0.9, s = [];
  for (var i = 0; i < E.length; i++) s.push(h.draw(tl, A.plot, bases[i], { dur: D }, i * D));
  pop('a', s[0].start + 0.1); pop('b', s[1].start + 0.1); pop('c', s[3].start + 0.1);
  pop('mul', s[1].b - 0.05); pop('add', s[3].b - 0.05); pop('tanh', s[4].b - 0.05); pop('L', s[5].b - 0.05);
  var fwd = s[5].end;                                   // 5.4
  h.park(tl, A.plot, fwd - 0.3);

  // Check: the forward test
  tl.fromTo(tests[0], { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.4 }, fwd - 0.2);
  h.tick(tl, pass[0], fwd + 0.2);

  // backward pass: from L to the inputs, a magenta pulse runs right to left along each edge and leaves it magenta
  var T = fwd + 0.9, DB = 0.85, WAVE = [[5], [4], [2, 3], [0, 1]];
  WAVE.forEach(function (w, wi) {
    w.forEach(function (ei) {
      var t0 = T + wi * 0.75, g = grads[ei], p = pls[ei], P = { p: 0 }, len = g.getTotalLength();
      tl.fromTo(g, { attr: { 'stroke-dashoffset': 1 } }, { attr: { 'stroke-dashoffset': 0 }, ease: 'none', duration: DB, immediateRender: true }, t0);
      tl.fromTo(P, { p: 0 }, {
        p: 1, ease: 'none', duration: DB, immediateRender: false,
        onUpdate: function () {
          var c = g.getPointAtLength(len * P.p);
          p.setAttribute('cx', c.x); p.setAttribute('cy', c.y);
          p.setAttribute('opacity', Math.min(1, P.p * 10, (1 - P.p) * 10).toFixed(3));
        }
      }, t0);
    });
  });
  var bwd = T + 3 * 0.75 + DB;

  // Check: the backward test, then the status lines
  tl.fromTo(tests[1], { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.4 }, bwd - 0.6);
  h.tick(tl, pass[1], bwd + 0.1);
  tl.fromTo(status, { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.5, stagger: 0.2 }, bwd + 0.3);
  tl.fromTo(cap, { opacity: 0 }, { opacity: 1, duration: 0.4 }, bwd + 0.7);
  h.park(tl, A.check, bwd + 1.7);
});
