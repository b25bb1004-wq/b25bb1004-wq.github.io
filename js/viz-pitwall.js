/* viz-pitwall.js: Plot draws a circuit in one stroke, a car laps it while two error bars grow to true ratio. */
Folio.registerViz('pitwall', function (ctx) {
  var figure = ctx.figure, tl = ctx.tl, A = ctx.agents, h = ctx.h;

  // An original closed circuit. It starts and ends on the start/finish line, so path length 0 is the line.
  var D = 'M150 150H270C312 150 342 138 342 112C342 88 316 82 296 84L250 90C228 92 220 74 238 62' +
    'C256 50 292 54 296 36C298 22 280 14 262 16L150 24C128 26 120 42 136 54C152 66 150 82 128 88' +
    'L70 100C42 108 30 124 40 138C48 148 66 150 90 150H150Z';
  var TRAIL = 6, RATIO = 0.62 / 1.11 * 100;

  function row(k, lab, v, w) {
    return '<div class="pw-row ' + k + '"><div class="pw-head"><span class="pw-lab">' + lab + '</span>' +
      '<p class="pw-val"><b class="num">' + v + '</b> s</p></div>' +
      '<div class="pw-rail"><i class="pw-bar" style="width:' + w + '%"></i></div></div>';
  }

  // ---- 1. final state ----
  var dots = '';
  for (var k = TRAIL; k >= 1; k--) dots += '<circle class="pw-trail" r="' + (5 - k * 0.55).toFixed(2) + '" opacity="0"/>';
  figure.innerHTML =
    '<svg class="pw-map" viewBox="20 6 336 160" aria-hidden="true">' +
    '<path class="pw-circ" d="' + D + '"/>' +
    '<line class="pw-sf" x1="150" y1="137" x2="150" y2="163"/>' + dots +
    '<circle class="pw-car" r="6.5"/></svg>' +
    '<div class="pw-bars">' + row('pw-m', 'This model', '0.62', RATIO.toFixed(3)) + row('pw-b', 'Repeating the last lap', '1.11', 100) + '</div>' +
    '<div class="pw-foot"><p class="pw-n"><b class="num">109,883</b> in-race predictions</p><p class="pw-held">held-out 2025 season</p></div>' +
    '<p class="cap pw-cap">Circuit shape is schematic.</p>';

  var q = function (s) { return figure.querySelector(s); };
  var path = q('.pw-circ'), sf = q('.pw-sf'), car = q('.pw-car'), trail = figure.querySelectorAll('.pw-trail');
  var L = path.getTotalLength();

  function at(p) { return path.getPointAtLength(L * Math.max(0, Math.min(1, p))); }
  // car and trail are a pure function of lap progress p, so scrubbing either way restores them
  function place(p) {
    var c = at(p), vis = Math.min(1, p * 14, (1 - p) * 14);
    car.setAttribute('cx', c.x); car.setAttribute('cy', c.y);
    Array.prototype.forEach.call(trail, function (t, i) {
      var s = at(p - (TRAIL - i) * 0.012);
      t.setAttribute('cx', s.x); t.setAttribute('cy', s.y);
      t.setAttribute('opacity', (vis * (0.1 + 0.5 * (i + 1) / TRAIL)).toFixed(3));
    });
  }
  place(0);                                     // the car rests on the start/finish line

  // ---- 2. the build sequence ----
  var m = q('.pw-m'), b = q('.pw-b');
  var mBar = m.querySelector('.pw-bar'), bBar = b.querySelector('.pw-bar');
  var mNum = m.querySelector('.num'), bNum = b.querySelector('.num');
  var rows = figure.querySelectorAll('.pw-row'), n = q('.pw-n'), held = q('.pw-held'), cap = q('.pw-cap');

  var draw = h.draw(tl, A.plot, path, { dur: 4.4 }, 0);
  tl.fromTo(sf, { opacity: 0 }, { opacity: 1, duration: 0.4 }, draw.b - 0.1);

  // the lap: the car appears on the line, runs the whole circuit, and rests on the line again
  var P = { p: 0 };
  tl.fromTo(car, { opacity: 0 }, { opacity: 1, duration: 0.3 }, draw.b + 0.4);
  tl.fromTo(P, { p: 0 }, { p: 1, ease: 'power1.inOut', duration: 4.1, immediateRender: false, onUpdate: function () { place(P.p); } }, 4.5);

  // Plot moves to the end of the model bar and waits there while both bars grow at the same speed
  tl.fromTo(rows, { opacity: 0 }, { opacity: 1, ease: 'power2.out', duration: 0.5, stagger: 0.12 }, 4.5);
  h.go(tl, A.plot, q('.pw-m .pw-rail'), { at: [RATIO / 100, 0.5], dur: 1.4 }, 4.3);
  tl.fromTo(mBar, { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: 2.4 * RATIO / 100, transformOrigin: '0 50%' }, 5.4);
  tl.fromTo(bBar, { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: 2.4, transformOrigin: '0 50%' }, 5.4);
  h.park(tl, A.plot, 6.9);

  // Data follows each number as it counts
  h.go(tl, A.data, mNum, { at: [1, 0.5], dx: 14, dur: 1.0 }, 4.9);
  h.count(tl, mNum, { to: 0.62, decimals: 2, ease: 'none', dur: 2.4 * RATIO / 100 }, 5.4);
  h.go(tl, A.data, bNum, { at: [1, 0.5], dx: 14, dur: 1.0 }, 6.9);
  h.count(tl, bNum, { to: 1.11, decimals: 2, ease: 'none', dur: 2.4 }, 5.4);
  tl.fromTo(n, { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.4 }, 7.2);
  tl.fromTo(held, { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.4 }, 7.5);
  tl.fromTo(cap, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 7.8);
  h.park(tl, A.data, 8.0);

  // Check verifies the result
  h.tick(tl, m.querySelector('.pw-val'), 8.9);
  h.park(tl, A.check, 10.2);
});
