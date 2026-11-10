/* viz-serving.js: one 12 GB GPU slot, five queued models, two measured bars. Lead agent: Layout (violet).
   Moment: Layout carries the models through the single slot one at a time, ending with the 35B model loaded. */
Folio.registerViz('serving', function (ctx) {
  var figure = ctx.figure, tl = ctx.tl, A = ctx.agents, h = ctx.h;
  var N = 5;

  // ---- 1. final state: model 5 (the 35B MoE model) is loaded, both bars at true length ----
  var rows = '', blocks = '';
  for (var i = 1; i <= N; i++) {
    var last = i === N, sub = last ? '<small>35B MoE</small>' : '';
    rows += '<li class="sv-row' + (last ? ' sv-last' : '') + '"><span class="sv-hl"></span><span class="sv-rt">model ' + i + sub + '</span></li>';
    blocks += '<div class="sv-blk' + (last ? ' sv-last' : '') + '"><b>' + (last ? '35B MoE' : 'model ' + i) + '</b>' + (last ? '<small>model ' + i + '</small>' : '') + '</div>';
  }
  function bar(label, val, w) {
    return '<div class="sv-bar"><div class="sv-lab"><span>' + label + '</span><span class="sv-val"><b class="num">' + val + '%</b></span></div>' +
      '<div class="sv-track"><i class="sv-fill" style="width:' + w + '%"></i></div></div>';
  }
  figure.innerHTML =
    '<div class="sv-top">' +
      '<div class="sv-gpu"><p class="sv-h">12 GB GPU</p><div class="sv-slot"><span class="sv-solid"></span><div class="sv-clip">' + blocks + '</div></div></div>' +
      '<div class="sv-queue"><p class="sv-h">Queue</p><ol class="sv-rows">' + rows + '</ol></div>' +
    '</div>' +
    '<p class="cap sv-cap">One llama.cpp router loads each model on demand.</p>' +
    '<div class="sv-bars"><p class="sv-h sv-bh">35B mixture-of-experts (MoE) model</p>' +
      bar('MMLU, 300-question subset', '83.7', 83.7) + bar('HumanEval, all 164 problems', '75.6', 75.6) + '</div>';

  var q = function (s) { return figure.querySelectorAll(s); };
  var rowEls = q('.sv-row'), hls = q('.sv-hl'), blks = q('.sv-blk'), slot = figure.querySelector('.sv-slot'),
    solid = figure.querySelector('.sv-solid'), barsBox = figure.querySelector('.sv-bars'),
    tracks = q('.sv-track'), fills = q('.sv-fill'), nums = q('.sv-val .num'), vals = q('.sv-val');
  var L = A.layout, D = A.data, C = A.check;

  // ---- 2. Layout carries each model through the slot: pick it from the queue, slide it in, the old one slides out ----
  // Cursors only target static elements (queue rows, the slot); the sliding is done by the blocks inside the slot.
  for (var k = 0; k < N; k++) {
    var t = k * 1.0;
    h.go(tl, L, rowEls[k], { at: [0.35, 0.5], dur: 0.5 }, t);
    tl.fromTo(hls[k], { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.2 }, t + 0.2);
    h.go(tl, L, slot, { dur: 0.5 }, t + 0.5);
    tl.fromTo(blks[k], { x: 90, opacity: 0 }, { x: 0, opacity: 1, ease: 'power2.out', duration: 0.45 }, t + 0.5);
    if (k > 0) {
      tl.fromTo(blks[k - 1], { x: 0, opacity: 1 }, { x: -90, opacity: 0, ease: 'power2.in', duration: 0.4, immediateRender: false }, t + 0.5);
      tl.fromTo(hls[k - 1], { opacity: 1 }, { opacity: 0, ease: 'power1.in', duration: 0.2, immediateRender: false }, t + 0.2);
    }
  }
  // the slot is now occupied for good: its dashed outline turns solid
  tl.fromTo(solid, { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.35 }, 4.7);

  // ---- 3. the bars grow to true length, Layout drags each tip, Data counts the percentage ----
  tl.fromTo(barsBox, { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.5 }, 5.4);
  var STRAIGHT = ['power2.inOut', 'power2.inOut'];
  var W = [0.837, 0.756], T0 = [6.2, 8.1];
  for (var b = 0; b < 2; b++) {
    var s = T0[b] - 0.7;
    h.go(tl, L, tracks[b], { at: [0, 0.5], dur: 0.6 }, s);
    h.go(tl, D, nums[b], { at: [1, 0.5], dx: 14, dur: 0.8 }, s + 0.1);
    h.go(tl, L, tracks[b], { at: [W[b], 0.5], dur: 1.2, ease: STRAIGHT, click: false }, T0[b]);
    tl.fromTo(fills[b], { scaleX: 0 }, { scaleX: 1, ease: 'power2.inOut', duration: 1.2 }, T0[b]);
    h.count(tl, nums[b], { to: b ? 75.6 : 83.7, decimals: 1, suffix: '%', dur: 1.2, ease: 'power2.inOut' }, T0[b]);
  }
  h.park(tl, L, 9.5);
  h.park(tl, D, 9.6);

  // ---- 4. Check verifies both measurements ----
  h.tick(tl, vals[0], 9.8);
  h.tick(tl, vals[1], 10.8);
  h.park(tl, C, 12.0);
});
