/* viz-vox.js: a voice becomes a transcript, the transcript reaches four tools, Check ticks the award.
   Final state first. Draft types the transcript; the waveform bars ripple in step with each word; four lines
   draw to the four tool chips; Check ticks "2nd in Product". Schematic waveform, a made-up question. */
Folio.registerViz('vox', function (ctx) {
  var figure = ctx.figure, tl = ctx.tl, A = ctx.agents, h = ctx.h;

  var SAY = 'Find recent work on sleep and memory, and check for related patents.';
  var HEIGHTS = [28, 46, 62, 38, 76, 92, 54, 70, 100, 64, 48, 82, 96, 58, 40, 72, 56, 34, 60, 44, 30, 20];
  var TOOLS = ['PDFs', 'arXiv', 'Web', 'Patent search'], XS = [50, 150, 250, 350], ORIGIN = 280;

  var bars = HEIGHTS.map(function (v) { return '<i style="--h:' + v + '%"></i>'; }).join('');
  var paths = XS.map(function (x) { return '<path d="M' + ORIGIN + ' 0C' + ORIGIN + ' 24 ' + x + ' 16 ' + x + ' 40"/>'; }).join('');
  var chips = TOOLS.map(function (t) { return '<li><i class="vx-lit"></i><span>' + t + '</span></li>'; }).join('');

  figure.innerHTML =
    '<div class="vx-top">' +
      '<div class="vx-voice"><p class="vx-lab">Voice</p><div class="vx-wave" aria-hidden="true">' + bars + '</div></div>' +
      '<div class="vx-say"><p class="vx-lab">Live transcription</p><p class="vx-tr">' + SAY + '</p></div>' +
    '</div>' +
    '<svg class="vx-lines" viewBox="0 0 400 40" aria-hidden="true">' + paths + '</svg>' +
    '<ul class="vx-tools">' + chips + '</ul>' +
    '<p class="vx-award"><span class="vx-a">2nd in Product</span><span class="vx-ev">Murf AI × IIT Bombay</span></p>' +
    '<p class="cap">Schematic. The question is made up.</p>';

  var $$ = function (s) { return figure.querySelectorAll(s); };
  var barEls = $$('.vx-wave i'), tr = figure.querySelector('.vx-tr'), pathEls = $$('.vx-lines path');
  var tools = $$('.vx-tools li'), lits = $$('.vx-lit'), award = figure.querySelector('.vx-award'), prize = figure.querySelector('.vx-a');

  // 1. Draft types what was said; the word times fall out of the character positions
  var ty = h.type(tl, A.draft, tr, { dur: 3.4 }, 0.3);
  var words = [], re = /\S+/g, m, N = barEls.length;
  while ((m = re.exec(SAY))) words.push(m.index);
  words.forEach(function (idx, j) {
    var t = ty.a + (idx / SAY.length) * (ty.b - ty.a), lo = Math.floor(j * N / words.length), hi = Math.floor((j + 1) * N / words.length);
    for (var b = lo; b < hi; b++) {                    // the bars under this word ripple up, left to right
      var s = t + (b - lo) * 0.05;
      tl.fromTo(barEls[b], { scaleY: 0.15 }, { scaleY: 1.22, ease: 'power2.out', duration: 0.16 }, s);
      tl.to(barEls[b], { scaleY: 1, ease: 'sine.out', duration: 0.35, immediateRender: false }, s + 0.16);
    }
  });

  // 2. a line from the transcript to each tool; the chip lights as its line arrives
  var p = ty.end + 0.15;
  Array.prototype.forEach.call(pathEls, function (pa, i) {
    var s = h.draw(tl, A.draft, pa, { dur: 0.95 }, p);
    tl.fromTo(tools[i], { opacity: 0.45 }, { opacity: 1, ease: 'power1.out', duration: 0.25 }, s.b - 0.05);
    tl.fromTo(lits[i], { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.25 }, s.b - 0.05);
    p = s.end;
  });
  h.park(tl, A.draft, p);

  // 3. Check walks to the award and ticks it
  h.go(tl, A.check, award, { at: [0.15, 1], dy: 16, dur: 1.3 }, ty.end + 1.0);
  tl.fromTo(award, { opacity: 0 }, { opacity: 1, ease: 'power1.out', duration: 0.4 }, p - 0.2);
  h.tick(tl, prize, p + 0.1);
  h.park(tl, A.check, p + 1.4);
});
