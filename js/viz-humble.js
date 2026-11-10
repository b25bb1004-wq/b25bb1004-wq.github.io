/* viz-humble.js: reference figure. 31 repo tiles, a scan sweep, legend counts, "26 of 31" verified.
   Pattern to copy: (1) render the FINAL figure, (2) if motion, add tweens from the empty state to it. */
Folio.registerViz('humble', function (ctx) {
  var figure = ctx.figure, tl = ctx.tl, A = ctx.agents, h = ctx.h;

  // 14 solid (verified end-to-end), 12 hatched (waiting only on the user's input), 5 outline (not verified)
  var ROWS = ['SHSSHOSH', 'SSHSOSHS', 'HSSHSOHS', 'HSHOHOH'];   // 8 columns, the last row has 7 tiles
  var COLS = 8, NAME = { S: 'hm-s', H: 'hm-h', O: 'hm-o' };

  // ---- 1. final state ----
  var cells = '';
  ROWS.join('').split('').forEach(function (c) {
    cells += '<span class="hm-cell"><i class="hm-t ' + NAME[c] + '"><b class="hm-fin"></b></i></span>';
  });
  // The scan path is drawn in tile-pitch units (viewBox 8x4, tiles are square), so a tile's place along it
  // is just counting tiles: row r starts at 8r, odd rows run right to left. 31 units in total.
  var scan = '<svg class="hm-scan" viewBox="0 0 8 4" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M.5 .5H7.5V1.5H.5V2.5H7.5V3.5H.5"/></svg>';
  figure.innerHTML =
    '<div class="hm-grid">' + cells + scan + '</div>' +
    '<ul class="legend hm-legend">' +
    '<li><i class="hm-sw hm-s"></i><span><b class="num">14</b> verified end-to-end</span></li>' +
    '<li><i class="hm-sw hm-h"></i><span><b class="num">12</b> waiting only on the user\'s input</span></li>' +
    '<li><i class="hm-sw hm-o"></i><span><b class="num">5</b> not verified</span></li>' +
    '</ul>' +
    '<div class="hm-foot"><p class="hm-breaks"><b class="num">36</b> breaks fixed</p>' +
    '<p class="hm-verdict"><b class="num">26</b> of 31 verified</p></div>';

  // ---- 2. the build sequence: Data sweeps the tiles, then places the numbers, then Check verifies ----
  // No `if (motion)` branch on purpose. With reduced motion core hands us a dummy timeline, the helpers
  // become static (ticks are placed, nothing else), and core jumps the dummy to its end, so the final
  // state comes out of the same code as the animation.
  var q = function (s) { return figure.querySelectorAll(s); };
  var fins = q('.hm-fin'), path = figure.querySelector('.hm-scan path'), scanSvg = figure.querySelector('.hm-scan');
  var items = q('.hm-legend li'), nums = q('.hm-legend .num');
  var breaks = figure.querySelector('.hm-breaks'), breaksNum = breaks.querySelector('.num');
  var verdict = figure.querySelector('.hm-verdict'), foot = figure.querySelector('.hm-foot'), legend = figure.querySelector('.hm-legend');

  // the scan line is only visible while Data draws it; CSS leaves it at opacity 0 so the end state is clean
  var sweep = h.draw(tl, A.data, path, { dur: 7 }, 0);
  tl.fromTo(scanSvg, { opacity: 1 }, { opacity: 0, duration: 0.6 }, sweep.b + 0.3);

  // each tile resolves at the moment the scan line passes its centre (a..b is the stroke window)
  Array.prototype.forEach.call(fins, function (fin, i) {
    var r = Math.floor(i / COLS), c = i % COLS, unit = 8 * r + (r % 2 ? COLS - 1 - c : c);
    var at = sweep.a + (unit / 31) * (sweep.b - sweep.a);
    tl.fromTo(fin, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, ease: 'back.out(2)', duration: 0.35 }, Math.max(0, at - 0.1));
  });

  // Data moves to the legend and places the numbers; the rows fade in just ahead of the counts
  h.go(tl, A.data, nums[0], { at: [1, 0.5], dx: 14, dur: 1.2 }, sweep.end - 0.4);
  // the legend box and the foot rule fade in with their content, so no border or swatch shows early
  tl.fromTo([legend, foot], { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.4 }, 7.1);
  tl.fromTo(items, { opacity: 0, y: 8 }, { opacity: 1, y: 0, ease: 'power2.out', duration: 0.5, stagger: 0.12 }, 7.2);
  tl.fromTo(breaks, { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.4 }, 7.9);
  h.count(tl, nums[0], { to: 14, dur: 0.9 }, 7.7);
  h.count(tl, nums[1], { to: 12, dur: 0.9 }, 7.7);
  h.count(tl, nums[2], { to: 5, dur: 0.9 }, 7.7);
  h.count(tl, breaksNum, { to: 36, dur: 1.0 }, 8.0);
  h.park(tl, A.data, 8.8);

  // Check verifies the total: the line appears, Check hops to it, the tick pops
  tl.fromTo(verdict, { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.4 }, 8.6);
  h.tick(tl, verdict, 9.0);
  h.park(tl, A.check, 10.2);
});
