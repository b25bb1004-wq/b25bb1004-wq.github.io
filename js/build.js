(function () {
  'use strict';

  var root = document.documentElement;
  var ORIG = new Map();    // td -> { html, text } captured before the cell is wrapped
  var T0 = new Map();      // block -> start time in seconds
  var busy = new Set();
  var started = new Set();
  var running = 0, runStart = 0, ticking = false, dead = false, io = null;

  function now() { return performance.now() / 1000; }
  function motionOn() { return root.classList.contains('motion'); }
  function wait(s) { return new Promise(function (r) { gsap.delayedCall(s, r); }); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function vOf(td) { return td.querySelector('.v'); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(s) {
    var m = Math.floor(s / 60), r = (s - m * 60).toFixed(1);
    return pad2(m) + ':' + (r.length < 4 ? '0' : '') + r;
  }

  // Formula evaluator: refs, + - * /, parentheses, SUM over one row or column.
  function cellVal(table, addr) {
    var td = table.querySelector('td[data-cell="' + addr + '"]');
    if (!td || td.dataset.v === undefined) throw new Error('no value at ' + addr);
    return Number(td.dataset.v);
  }
  function evalFormula(table, f) {
    var s = String(f).replace(/^=/, '');
    s = s.replace(/SUM\(([A-Z])(\d+):([A-Z])(\d+)\)/g, function (m, c1, r1, c2, r2) {
      var vals = [];
      for (var c = c1.charCodeAt(0); c <= c2.charCodeAt(0); c++)
        for (var r = +r1; r <= +r2; r++) vals.push(cellVal(table, String.fromCharCode(c) + r));
      return '(' + vals.join('+') + ')';
    });
    s = s.replace(/[A-Z]\d+/g, function (addr) { return '(' + cellVal(table, addr) + ')'; });
    if (!/^[\d\s.+\-*/()]+$/.test(s)) throw new Error('unsupported formula: ' + f);
    return Function('return ' + s)();
  }

  function selfTest() {
    document.querySelectorAll('td[data-f]').forEach(function (td) {
      var r;
      try { r = evalFormula(td.closest('table'), td.dataset.f); } catch (e) { r = NaN; }
      console.assert(Math.abs(r - Number(td.dataset.v)) < 0.006,
        'formula ' + td.dataset.f + ' in ' + td.dataset.cell + ' gives ' + r + ', expected ' + td.dataset.v);
    });
  }

  // Cell inspection (works with or without motion).
  function inspect(td) {
    var win = td.closest('.win');
    if (!win) return;
    var prev = win.querySelector('td.active');
    if (prev && prev !== td) prev.classList.remove('active');
    td.classList.add('active');
    win.querySelector('.fx-cell').textContent = td.dataset.cell;
    win.querySelector('.fx-val').textContent = td.dataset.f || td.textContent.trim();
  }
  function wireCells() {
    document.querySelectorAll('td[data-cell]').forEach(function (td) {
      td.tabIndex = 0;
      var show = function () { inspect(td); };
      td.addEventListener('click', show);
      td.addEventListener('focus', show);
    });
  }

  // Clock
  function tick() {
    var el = document.getElementById('clock');
    var s = (now() - runStart).toFixed(1);
    if (running > 0) {
      if (el) el.textContent = 'Filling ' + s + 's';
    } else {
      if (el) el.textContent = 'Filled in ' + s + 's';
      gsap.ticker.remove(tick);
      ticking = false;
    }
  }
  function startClock() {
    if (ticking) return;
    ticking = true;
    gsap.ticker.add(tick);
  }

  function log(block, name, text) {
    var ol = block.querySelector('.log ol');
    if (!ol) return;
    var li = document.createElement('li'), t = document.createElement('time'), sp = document.createElement('span');
    t.textContent = stamp(now() - (T0.get(block) || now()));
    li.appendChild(t);
    if (name) { var b = document.createElement('b'); b.textContent = name; li.append(b, ' '); }
    sp.textContent = text;
    li.appendChild(sp);
    ol.appendChild(li);
    while (ol.children.length > 60) ol.removeChild(ol.children[0]);
    ol.scrollTop = ol.scrollHeight;
  }

  // Agents: every acquired agent is tracked on the run so the finally can free it.
  function take(n, R) {
    if (n <= 0) return Promise.resolve([]);
    return Swarm.acquire(n).then(function (a) { R.held = R.held.concat(a); return a; });
  }
  function free(R, list) {
    R.held = R.held.filter(function (a) { return list.indexOf(a) < 0; });
    Swarm.release(list);
  }

  // Reveal by type
  async function typeText(v, text, html) {
    var p = { n: 0 };
    v.textContent = '';
    await gsap.to(p, {
      n: text.length, duration: clamp(text.length / 45, 0.25, 1.4), ease: 'none', snap: { n: 1 },
      onUpdate: function () { v.textContent = text.slice(0, p.n); }
    });
    if (/</.test(html)) v.innerHTML = html; else v.textContent = text;
  }
  async function countUp(v, td, text) {
    var target = Number(td.dataset.v);
    var dec = ((text.split('.')[1] || '').match(/^\d*/)[0]).length;
    var suf = (text.match(/[^\d.,\s]+$/) || [''])[0];
    var p = { n: 0 };
    await gsap.to(p, {
      n: target, duration: 0.7, ease: 'power1.out',
      onUpdate: function () {
        v.textContent = p.n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
      }
    });
    v.textContent = text;
  }
  function flash(td, s) {
    td.classList.add('wrote');
    gsap.delayedCall(s || 0.6, function () { td.classList.remove('wrote'); });
  }
  async function reveal(td) {
    var o = ORIG.get(td), v = vOf(td), t = td.dataset.t;
    v.style.visibility = 'visible';
    if (t === 'num' || t === 'heat') await countUp(v, td, o.text);
    else if (t === 'tag') {
      v.textContent = o.text;
      v.style.display = 'inline-block';
      await gsap.fromTo(v, { scale: 0.6 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
    } else await typeText(v, o.text, o.html);
    td.classList.add('done');
    flash(td);
  }

  function prepare(block) {
    if (block.dataset.block === 'sheet') {
      block.querySelectorAll('td[data-cell]').forEach(function (td) {
        ORIG.set(td, { html: td.innerHTML, text: td.textContent.trim() });
        var v = document.createElement('span');
        v.className = 'v';
        while (td.firstChild) v.appendChild(td.firstChild);
        td.appendChild(v);
      });
      var fig = block.querySelector('figure.chart');
      if (fig && window.Charts) Charts.prepare(fig);
    }
    block.classList.add('pending');
  }

  function kidsOf(block) {
    return block.dataset.block === 'notes' ? [].slice.call(block.children) : [];
  }

  function reset(block) {
    var kids = kidsOf(block);
    if (kids.length) gsap.set(kids, { clearProps: 'opacity,transform' });
    block.querySelectorAll('td[data-cell]').forEach(function (td) {
      td.classList.remove('done', 'checked', 'wrote', 'active');
      td.style.removeProperty('--h');
      var o = ORIG.get(td), v = vOf(td);
      if (o && v) { v.innerHTML = o.html; v.style.visibility = ''; }
    });
    block.querySelectorAll('.win').forEach(function (w) {
      w.classList.remove('live');
      w.querySelector('.win-status').textContent = '';
    });
    var fig = block.querySelector('figure.chart');
    if (fig && window.Charts) Charts.prepare(fig);
    var ol = block.querySelector('.log ol');
    if (ol) ol.innerHTML = '';
    block.classList.remove('built');
    if (motionOn()) block.classList.add('pending');
  }

  function showAll(block) {
    block.classList.remove('pending');
    block.querySelectorAll('.v').forEach(function (v) { v.style.visibility = 'visible'; });
    block.querySelectorAll('.win').forEach(function (w) { w.classList.remove('live'); });
    var kids = kidsOf(block);
    if (kids.length) gsap.set(kids, { clearProps: 'opacity,transform' });
  }

  async function sheet(block, R) {
    var win = block.querySelector('.win'), status = win.querySelector('.win-status');
    var table = block.querySelector('table.grid');
    var fxCell = win.querySelector('.fx-cell'), fxVal = win.querySelector('.fx-val');

    win.classList.add('live');
    status.textContent = 'filling';
    log(block, null, 'Layout opened ' + win.querySelector('.win-name').textContent);

    // Header: a marker drags the box, makers type the cells.
    var headRow = table.querySelector('tr.head');
    var marker = (await take(1, R))[0];
    await Swarm.marquee(marker, headRow);
    free(R, [marker]);
    var headCells = [].slice.call(headRow.querySelectorAll('td[data-cell]'));
    var makers = await take(Math.min(3, headCells.length), R);
    await Promise.all(makers.map(function (m, k) {
      return (async function () {
        for (var i = k; i < headCells.length; i += makers.length) {
          await m.go(headCells[i], { ax: 0.2, ay: 0.55 });
          m.write(true);
          await reveal(headCells[i]);
          m.write(false);
        }
      })();
    }));
    log(block, marker.name, 'locked and typed the header row');
    Swarm.unmark(headRow);
    free(R, makers);

    // Cells: a crew works the grid in parallel.
    var rows = [].slice.call(table.tBodies[0].rows).filter(function (r) { return !r.classList.contains('head'); });
    var cells = [];
    rows.forEach(function (r) {
      [].slice.call(r.children).forEach(function (td) {
        if (!td.dataset.cell || td.dataset.t === 'formula' || !ORIG.get(td).text) return;
        cells.push(td);
      });
    });
    var n = Math.max(1, Math.min(10, cells.length, Math.max(4, Math.ceil(cells.length / 2)), Swarm.agents.length - 4));
    var crew = await take(n, R);
    await Promise.all(crew.map(function (a, k) {
      return (async function () {
        await wait(k * 0.12);
        for (var i = k; i < cells.length; i += n) {
          var td = cells[i];
          await a.go(td, { ax: 0.2, ay: 0.55 });
          a.write(true);
          await reveal(td);
          a.write(false);
          log(block, a.name, 'wrote ' + td.dataset.cell);
        }
      })();
    }));
    free(R, crew);
    log(block, null, 'crew of ' + n + ' filled ' + cells.length + ' cells');

    // Formulas: type the formula, hold, resolve to the value.
    // Each formula is its own task, staggered 0.45 s; the chart starts alongside the first.
    var formulas = [].slice.call(table.querySelectorAll('td[data-f]'));
    var runFormula = async function (td, k) {
      await wait(k * 0.45);
      var formula = td.dataset.f, v = vOf(td), o = ORIG.get(td);
      var a = (await take(1, R))[0];
      await a.go(td, { ax: 0.2, ay: 0.55 });
      a.write(true);
      fxCell.textContent = td.dataset.cell;
      v.style.visibility = 'visible';
      var p = { n: 0 };
      await gsap.to(p, {
        n: formula.length, duration: clamp(formula.length / 30, 0.3, 1), ease: 'none', snap: { n: 1 },
        onUpdate: function () {
          var s = formula.slice(0, p.n);
          v.textContent = s;
          fxVal.textContent = s;
        }
      });
      await wait(0.35);
      v.textContent = o.text;
      td.classList.add('done');
      flash(td);
      a.write(false);
      log(block, a.name, 'wrote ' + formula);
      free(R, [a]);
    };
    var chartTask = async function () {
      var fig = block.querySelector('figure.chart');
      if (!fig) return;
      var ag = await take(2, R);
      log(block, ag[0].name, 'selected ' + fig.dataset.range + ' and drew the chart');
      if (window.Charts) await Charts.play(fig, ag);
      free(R, ag);
    };
    var jobs = formulas.map(function (td, k) { return runFormula(td, k); });
    jobs.push(chartTask());
    await Promise.all(jobs);

    // Heat: strength is value over the column maximum.
    var heats = [].slice.call(table.querySelectorAll('td[data-t="heat"]'));
    await Promise.all(heats.map(function (td) {
      var max = 0;
      rows.forEach(function (r) {
        var c = r.children[td.cellIndex];
        if (c && c.dataset.v) max = Math.max(max, Number(c.dataset.v));
      });
      var h = { h: 0 };
      return gsap.to(h, {
        h: Number(td.dataset.v) / max, duration: 0.5,
        onUpdate: function () { td.style.setProperty('--h', h.h); }
      });
    }));

    // Review: reviewers tick each claim while sweepers re-read the numbers.
    var nums = [].slice.call(block.querySelectorAll('td[data-t="num"]'));
    var sweep = (async function () {
      if (!nums.length) return;
      var sw = await take(Math.min(3, nums.length), R);
      await Promise.all(sw.map(function (a, k) {
        return (async function () {
          for (var i = k; i < nums.length; i += sw.length) {
            await a.go(nums[i], { ax: 0.8, ay: 0.5, dur: 0.3 });
            flash(nums[i], 0.4);
          }
        })();
      }));
      free(R, sw);
      log(block, sw[0].name, 're-read ' + nums.length + ' numbers');
    })();
    var checks = [].slice.call(block.querySelectorAll('td[data-check]'));
    var reviewers = (async function () {
      for (var k = 0; k < checks.length; k++) {
        var rv = (await take(1, R))[0];
        await Swarm.marquee(rv, checks[k], { dur: 0.4 });
        rv.note('checked');
        checks[k].classList.add('checked');
        log(block, rv.name, 'verified ' + checks[k].dataset.check);
        await wait(0.5);
        Swarm.unmark(checks[k]);
        free(R, [rv]);
      }
    })();
    await Promise.all([reviewers, sweep]);

    status.textContent = 'filled in ' + (now() - R.t0).toFixed(1) + ' s';
    win.classList.remove('live');
    block.classList.add('built');
    block.classList.remove('pending');
    log(block, null, 'handed the sheet over. Click any cell.');
  }

  async function notes(block, R) {
    var kids = kidsOf(block);
    gsap.set(kids, { opacity: 0, y: 24 });
    var agents = await take(3, R);
    var tween = gsap.to(kids, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.12 });
    await Promise.all(agents.map(function (a, k) {
      return (async function () {
        for (var i = k; i < kids.length; i += agents.length) await a.go(kids[i], { ax: 0.05, ay: 0.3 });
      })();
    }));
    await tween;
    free(R, agents);
    block.classList.add('built');
    block.classList.remove('pending');
  }

  async function run(block) {
    if (!motionOn() || !window.Swarm || dead || busy.has(block)) return;
    busy.add(block);
    if (running === 0) runStart = now();
    running++;
    startClock();
    var R = { held: [], t0: now() };
    T0.set(block, R.t0);
    try {
      await (block.dataset.block === 'notes' ? notes(block, R) : sheet(block, R));
    } catch (e) {
      console.error(e);
    } finally {
      if (R.held.length) Swarm.release(R.held);
      showAll(block);
      busy.delete(block);
      running--;
    }
  }

  function rebuild() {
    if (running > 0 || !motionOn() || dead) return;
    document.querySelectorAll('[data-block].built').forEach(function (b) {
      var r = b.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= innerHeight) return;
      reset(b);
      run(b);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    selfTest();
    wireCells();
    var btn = document.getElementById('rebuild');
    if (btn) btn.addEventListener('click', rebuild);
    if (!motionOn() || !window.Swarm) return;

    var blocks = [].slice.call(document.querySelectorAll('[data-block="sheet"], [data-block="notes"]'));
    blocks.forEach(prepare);

    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (started.has(e.target)) return;
        if (e.intersectionRatio >= 0.3 || e.intersectionRect.height >= innerHeight * 0.5) {
          started.add(e.target);
          io.unobserve(e.target);
          run(e.target);
        }
      });
    }, { threshold: [0.05, 0.3, 0.6, 1] });
    blocks.forEach(function (b) { io.observe(b); });

    gsap.delayedCall(0.3, function () {
      if (window.Swarm && Swarm.ready) return;
      dead = true;
      if (io) io.disconnect();
      blocks.forEach(showAll);
    });
  });

  window.Build = { run: run, reset: reset, evalFormula: evalFormula };
})();
