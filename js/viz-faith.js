/* viz-faith.js: how a citation gets verified. Schematic: placeholder sentence, no result numbers.
   Final state first; then Draft types the answer, Check drags a selection over the quoted sentence, the same
   words light up in the answer, the connector draws, both checks resolve. */
Folio.registerViz('faith', function (ctx) {
  var figure = ctx.figure, tl = ctx.tl, A = ctx.agents, h = ctx.h;

  var LINES = [['The', 'method', 'scores', 'each', 'candidate'], ['step', 'before', 'it', 'is', 'kept.']];
  var bar = function (w) { return '<span class="fa-bar" style="--w:' + w + '"></span>'; };
  var q = LINES.map(function (l) { return l.join(' '); });

  // answer text, typed by Draft; the ghost copy underneath carries the word highlights (same text, same wrapping)
  var LEAD = 'The paper states: “', TAIL = '”';
  var ghost = LEAD, flat = [];
  LINES.forEach(function (l, li) {
    l.forEach(function (w, wi) {
      var last = li === LINES.length - 1 && wi === l.length - 1;
      ghost += '<span class="fa-gw">' + w + (last ? '' : ' ') + '</span>';
      flat.push({ line: li, start: l.slice(0, wi).join(' ').length + (wi ? 1 : 0), len: w.length });
    });
  });
  ghost += TAIL;

  figure.innerHTML =
    '<div class="fa-grid">' +
      '<div class="fa-g1"><span class="fa-seg fa-s1"><i></i></span><span class="fa-seg fa-hook"><i></i></span></div>' +
      '<div class="fa-paper"><p class="fa-lab">Paper excerpt</p>' + bar('94%') + bar('78%') +
        '<p class="fa-q">' + q.map(function (t) { return '<span class="fa-ln"><i class="fa-fh"></i><span>' + t + '</span></span>'; }).join('') + '</p>' +
        bar('88%') + bar('54%') + '</div>' +
      '<div class="fa-g2"><span class="fa-seg fa-s2"><i></i></span><span class="fa-chip">[1]</span></div>' +
      '<div class="fa-answ"><div class="fa-ans"><span class="fa-ghost" aria-hidden="true">' + ghost + '</span>' +
        '<span class="fa-text">' + LEAD + q.join(' ') + TAIL + '</span></div></div>' +
      '<div class="fa-chks">' +
        '<p class="fa-chk"><span class="fa-cl">Natural language inference (NLI) check</span></p>' +
        '<p class="fa-chk"><span class="fa-cl">Word-for-word quote test</span></p>' +
      '</div>' +
    '</div>' +
    '<p class="cap">Schematic. The sentence is a placeholder, not from a real paper.</p>';

  var $ = function (s) { return figure.querySelector(s); }, $$ = function (s) { return figure.querySelectorAll(s); };
  var lns = $$('.fa-ln'), fhs = $$('.fa-fh'), gws = $$('.fa-gw'), chip = $('.fa-chip'), text = $('.fa-text');
  var s1 = $('.fa-s1'), s2 = $('.fa-s2'), hook = $('.fa-hook'), rows = $$('.fa-chk'), labels = $$('.fa-cl');

  // 1. Draft types the answer; the citation marker appears with it
  var ty = h.type(tl, A.draft, text, { dur: 2.6 }, 0.3);
  tl.fromTo(chip, { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.4 }, ty.a);
  h.park(tl, A.draft, ty.end + 0.1);
  // the two checks wait, dimmed, until the answer exists
  tl.fromTo(rows, { opacity: 0 }, { opacity: 0.45, ease: 'power1.out', duration: 0.5, stagger: 0.12 }, ty.b);

  // 2. the memorable moment: Check drags across the quote, one line at a time; the highlight grows under the cursor
  var P = ty.end - 0.2, d1 = 0.9, d2 = 0.65, st = [];
  var arrive = h.go(tl, A.check, lns[0], { at: [0, 0.5], dx: -3, dur: 1.1 }, P);
  st[0] = arrive.end;
  h.go(tl, A.check, lns[0], { at: [1, 0.5], dx: 3, ease: ['none', 'none'], click: false, dur: d1 }, st[0]);
  tl.fromTo(fhs[0], { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: d1 }, st[0]);
  var hop = st[0] + d1;
  h.go(tl, A.check, lns[1], { at: [0, 0.5], dx: -3, ease: ['power1.inOut', 'power1.inOut'], click: false, dur: 0.3 }, hop);
  st[1] = hop + 0.3;
  h.go(tl, A.check, lns[1], { at: [1, 0.5], dx: 3, ease: ['none', 'none'], click: false, dur: d2 }, st[1]);
  tl.fromTo(fhs[1], { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: d2 }, st[1]);

  // the same words light up in the answer as the selection passes them
  var D = [d1, d2];
  flat.forEach(function (w, i) {
    var lineLen = q[w.line].length, t = st[w.line] + ((w.start + w.len / 2) / lineLen) * D[w.line];
    tl.fromTo(gws[i], { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.18 }, Math.max(0, t - 0.06));
  });

  // 3. the connector draws from the citation up to the quote
  var c0 = st[1] + d2 + 0.1;
  h.go(tl, A.check, chip, { dur: 0.9 }, c0);
  var g0 = c0 + 0.9;
  h.go(tl, A.check, s2, { at: [0.5, 0], ease: ['none', 'none'], click: false, dur: 0.28 }, g0);
  tl.fromTo(s2.firstChild, { scaleY: 0 }, { scaleY: 1, ease: 'none', duration: 0.28 }, g0);
  h.go(tl, A.check, s1, { at: [0.5, 0], ease: ['none', 'none'], click: false, dur: 0.62 }, g0 + 0.28);
  tl.fromTo(s1.firstChild, { scaleY: 0 }, { scaleY: 1, ease: 'none', duration: 0.62 }, g0 + 0.28);
  h.go(tl, A.check, hook, { at: [1, 0.5], ease: ['none', 'none'], click: false, dur: 0.3 }, g0 + 0.9);
  tl.fromTo(hook.firstChild, { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: 0.3 }, g0 + 0.9);

  // 4. both checks resolve
  var k0 = g0 + 1.3, k1 = k0 + 1.15;
  h.tick(tl, labels[0], k0);
  tl.fromTo(rows[0], { opacity: 0.45 }, { opacity: 1, ease: 'power1.out', duration: 0.3, immediateRender: false }, k0 + 0.7);
  h.tick(tl, labels[1], k1);
  tl.fromTo(rows[1], { opacity: 0.45 }, { opacity: 1, ease: 'power1.out', duration: 0.3, immediateRender: false }, k1 + 0.7);
  h.park(tl, A.check, k1 + 1.3);
});
