// Chart animation for the index.html figures. The static HTML is the final state; play() clears what it adds.
(function () {
  'use strict';
  var STEP = 0.045, POP = 0.3, DUR = 0.4, TRAIL = 0.25;

  var q = function (root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
  var wait = function (s) { return new Promise(function (r) { gsap.delayedCall(Math.max(0, s), r); }); };
  var tw = function (t, v) {
    return new Promise(function (r) {
      if (t) gsap.to(t, { ...v, onComplete: r }); else r();
    });
  };

  // "83.7%" -> {pre:'', n:83.7, dec:1, suf:'%'}; null when the text has no number
  var parseNum = function (text) {
    var m = /^(\D*)([\d,]*\.?\d+)(\D*)$/.exec(text.trim());
    if (!m) return null;
    return { pre: m[1], n: parseFloat(m[2].replace(/,/g, '')), dec: (m[2].split('.')[1] || '').length, suf: m[3] };
  };

  var count = function (val, num) {
    var o = { v: 0 };
    var fmt = function (v) {
      return num.pre + v.toLocaleString('en-US', { minimumFractionDigits: num.dec, maximumFractionDigits: num.dec }) + num.suf;
    };
    val.textContent = fmt(0);
    return tw(o, { v: num.n, duration: 0.9, ease: 'none', onUpdate: function () { val.textContent = fmt(o.v); } });
  };

  var runRow = async function (row, agent) {
    var label = row.querySelector('.bar-label'), track = row.querySelector('.bar-track');
    var bar = row.querySelector('.bar'), val = row.querySelector('.bar-val');
    var frac = parseFloat(getComputedStyle(bar).getPropertyValue('--w')) / 100;
    var num = parseNum(val.textContent);
    var moves = [tw(label, { opacity: 1, duration: 0.3 })];
    if (agent) { await agent.go(track, { ax: 0, ay: 0.5, dur: 0.6 }); agent.write(true); }
    moves.push(tw(bar, { scaleX: 1, duration: 0.9, ease: 'power3.out' }));
    if (agent) moves.push(agent.go(track, { ax: frac, ay: 0.5, dur: 0.9 }));
    if (num) moves.push(count(val, num), tw(val, { opacity: 1, duration: 0.3 }));
    await Promise.all(moves);
    if (agent) agent.write(false);
  };

  var playBars = async function (fig, agents) {
    await tw(q(fig, 'figcaption')[0], { opacity: 1, duration: 0.4 });
    await Promise.all(q(fig, '.bar-row').map(function (row, i) {
      var agent = agents.length ? agents[i % agents.length] : null;
      return wait(i * 0.35).then(function () { return runRow(row, agent); });
    }));
  };

  // Walks an agent to each stop so it lands as the tile it targets finishes popping.
  var sweep = function (agent, stops, t0) {
    return (async function () {
      agent.write(true);
      for (var i = 0; i < stops.length; i++) {
        await wait(stops[i].at - DUR - (gsap.globalTimeline.time() - t0));
        await agent.go(stops[i].el, { ax: 0.5, ay: 0.5, dur: DUR });
      }
      agent.write(false);
    })();
  };

  var playTiles = async function (fig, agents) {
    var tiles = q(fig, '.tile'), cap = q(fig, 'figcaption')[0];
    var groups = ['solid', 'hatch', 'outline'].map(function (c) {
      return tiles.filter(function (t) { return t.classList.contains(c); });
    }).filter(function (g) { return g.length; });
    var at = function (el) { return tiles.indexOf(el) * STEP + POP; };
    var t0 = gsap.globalTimeline.time();
    var sweeps = [];
    if (agents[0]) {
      sweeps.push(sweep(agents[0], [{ el: tiles[0], at: POP }].concat(groups.map(function (g) {
        var el = g[g.length - 1];
        return { el: el, at: at(el) };
      })), t0));
    }
    if (agents[1]) {
      sweeps.push(sweep(agents[1], groups.map(function (g) {
        var el = g[Math.floor(g.length / 2)];
        return { el: el, at: at(el) + TRAIL };
      }), t0));
    }
    await Promise.all([tw(tiles, { opacity: 1, scale: 1, duration: POP, ease: 'back.out(2.2)', stagger: STEP })].concat(sweeps));
    await tw(cap, { opacity: 1, duration: 0.4 });
  };

  var prepare = function (fig) {
    var kind = fig.dataset.chart, cap = q(fig, 'figcaption');
    if (kind === 'bar') {
      var bars = q(fig, '.bar'), texts = q(fig, '.bar-label, .bar-val');
      gsap.killTweensOf(bars.concat(texts, cap));
      gsap.set(bars, { scaleX: 0, transformOrigin: 'left center' });
      gsap.set(texts.concat(cap), { opacity: 0 });
    } else if (kind === 'tiles') {
      var tiles = q(fig, '.tile');
      gsap.killTweensOf(tiles.concat(cap));
      gsap.set(tiles, { opacity: 0, scale: 0.4 });
      gsap.set(cap, { opacity: 0 });
    }
  };

  var play = async function (fig, agents) {
    var kind = fig.dataset.chart;
    if (kind !== 'bar' && kind !== 'tiles') return;
    agents = (agents || []).filter(Boolean);
    var vals = q(fig, '.bar-val'), texts = vals.map(function (v) { return v.textContent; });
    var targets = q(fig, '.bar, .bar-label, .bar-val, .tile').concat(q(fig, 'figcaption'));
    try {
      if (kind === 'bar') await playBars(fig, agents); else await playTiles(fig, agents);
    } finally {
      gsap.killTweensOf(targets);
      vals.forEach(function (v, i) { v.textContent = texts[i]; });
      gsap.set(targets.filter(function (t) { return !t.classList.contains('bar'); }), { clearProps: 'all' });
      gsap.set(q(fig, '.bar'), { clearProps: 'transform' }); // keeps inline --w so bars keep their width
      agents.forEach(function (a) { a.write(false); });
    }
  };

  window.Charts = { prepare: prepare, play: play };
})();
