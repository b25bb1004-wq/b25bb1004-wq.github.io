// Swarm: greyscale agent cursors that queue, fly and mark up the page. Inert unless html.motion.
(function () {
  'use strict';

  var NAMES = ['Draft', 'Plot', 'Data', 'Check', 'Layout', 'Parse', 'Fetch', 'Count', 'Sum', 'Chart', 'Paint', 'Mark', 'Type', 'Cite', 'Diff', 'Test', 'Trace', 'Fit', 'Lint', 'Sort', 'Scan', 'Link', 'Proof', 'Ship'];
  var ARROW = 'M1 1 L1 16 L5 12.5 L8 19 L10.5 18 L7.6 11.6 L13 11.6 Z';
  var PINK = '#FF2E88';

  // No-op API until init runs with motion on.
  var api = {
    ready: false,
    agents: [],
    acquire: function () { return Promise.resolve([]); },
    release: function () {},
    marquee: function () { return Promise.resolve(); },
    unmark: function () {},
    formation: function () {}
  };
  window.Swarm = api;

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function init() {
    if (!document.documentElement.classList.contains('motion')) return;
    var host = document.getElementById('swarm');
    if (!host) return;
    var faces = document.getElementById('faces');
    var canvas = document.getElementById('trails');
    var ctx = canvas ? canvas.getContext('2d') : null;
    var dpr = 1;
    var formationPts = null;
    var marks = new Map();
    var all = [];
    var T0 = gsap.ticker.time;

    function slotX(i, n) {
      return innerWidth * 0.07 + (i + 0.5) * (innerWidth * 0.86 / Math.max(1, n));
    }

    // Agents rise from below the screen, staggered by index via a.wake.
    function slotOf(a, t, n) {
      if (t < a.wake) return { x: a.x, y: innerHeight + 60 };
      return { x: slotX(a.i, n), y: innerHeight - 26 + Math.sin(t * 1.3 + a.i) * 3 };
    }

    function targetOf(a, t, n) {
      if (a.hold) return a.hold();
      if (a.busy) return { x: a.x, y: a.y };
      if (formationPts) {
        var fp = typeof formationPts === 'function' ? formationPts(a.i, n, t) : formationPts[a.i];
        if (fp) return fp;
      }
      return slotOf(a, t, n);
    }

    function pointOf(t, ax, ay) {
      if (t.getBoundingClientRect) {
        var r = t.getBoundingClientRect();
        return { x: r.left + r.width * ax, y: r.top + r.height * ay };
      }
      return { x: t.x, y: t.y };
    }

    function setBusy(a, on) {
      a.busy = on;
      a.el.classList.toggle('busy', on);
      a.face.classList.toggle('busy', on);
    }

    // Each new flight bumps a.tok, which cancels any older flight or drag still running.
    function flyTo(a, target, opt) {
      if (!target) return Promise.resolve();
      var ax = opt.ax == null ? 0.5 : opt.ax;
      var ay = opt.ay == null ? 0.5 : opt.ay;
      var tok = ++a.tok;
      var p0 = pointOf(target, ax, ay);
      var sx = a.x, sy = a.y;
      var d0 = Math.hypot(p0.x - sx, p0.y - sy);
      // Direction of travel; the settle overshoots along it.
      var dir = d0 > 4 ? { x: (p0.x - sx) / d0, y: (p0.y - sy) / d0 } : { x: 0, y: 0 };
      var side = a.i % 2 ? 1 : -1;
      var f = { p: 0 };
      a.flying = true;
      a.hold = null;
      return new Promise(function (resolve) {
        var stale = function () { return tok !== a.tok; };
        var fly = gsap.to(f, {
          p: 1,
          duration: opt.dur || gsap.utils.clamp(0.35, 0.9, d0 / 900),
          ease: 'power3.inOut',
          onUpdate: function () {
            if (stale()) { fly.kill(); resolve(); return; }
            // Flight aims 4 px short; the settle carries the cursor in.
            var e = pointOf(target, ax, ay);
            var ex = e.x - dir.x * 4 * f.p, ey = e.y - dir.y * 4 * f.p;
            var dx = ex - sx, dy = ey - sy;
            var cx = (sx + ex) / 2 - dy * 0.18 * side;
            var cy = (sy + ey) / 2 + dx * 0.18 * side;
            var u = 1 - f.p;
            a.x = u * u * sx + 2 * u * f.p * cx + f.p * f.p * ex;
            a.y = u * u * sy + 2 * u * f.p * cy + f.p * f.p * ey;
          },
          onComplete: function () {
            if (stale()) { resolve(); return; }
            var s = { k: -4 };
            var settle = gsap.to(s, {
              k: 0,
              duration: 0.18,
              ease: 'back.out(3)',
              onUpdate: function () {
                if (stale()) { settle.kill(); resolve(); return; }
                var q = pointOf(target, ax, ay);
                a.x = q.x + dir.x * s.k;
                a.y = q.y + dir.y * s.k;
              },
              onComplete: function () {
                if (!stale()) {
                  a.flying = false;
                  a.hold = function () { return pointOf(target, ax, ay); };
                }
                resolve();
              }
            });
          }
        });
      });
    }

    function unmarkNow(el) {
      var old = marks.get(el);
      if (!old) return;
      gsap.killTweensOf(old.box);
      old.box.remove();
      marks.delete(el);
    }

    function marquee(a, el, opt) {
      if (!el) return Promise.resolve();
      opt = opt || {};
      unmarkNow(el);
      var box = document.createElement('div');
      box.className = 'marquee';
      box.style.position = 'fixed';
      box.style.pointerEvents = 'none';
      var lock = document.createElement('span');
      lock.className = 'lock';
      lock.textContent = 'locked by ' + a.name;
      box.appendChild(lock);
      host.appendChild(box);
      var m = { box: box, p: { v: 0 }, out: false };
      marks.set(el, m);
      return flyTo(a, el, { ax: 0, ay: 0 }).then(function () {
        var tok = ++a.tok;
        a.flying = true;
        a.hold = null;
        return new Promise(function (resolve) {
          var drag = gsap.to(m.p, {
            v: 1,
            duration: opt.dur || 0.8,
            ease: 'power2.inOut',
            onUpdate: function () {
              if (tok !== a.tok) { drag.kill(); resolve(); return; }
              var r = el.getBoundingClientRect();
              a.x = r.left + r.width * m.p.v;
              a.y = r.top + r.height * m.p.v;
            },
            onComplete: function () {
              if (tok === a.tok) {
                a.flying = false;
                a.hold = function () {
                  var q = el.getBoundingClientRect();
                  return { x: q.right, y: q.bottom };
                };
              }
              resolve();
            }
          });
        });
      });
    }

    function unmark(el) {
      var m = marks.get(el);
      if (!m || m.out) return;
      m.out = true;
      gsap.to(m.box, {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.out',
        onComplete: function () {
          m.box.remove();
          if (marks.get(el) === m) marks.delete(el);
        }
      });
    }

    // Build the 24 cursors and faces; syncLimit decides which are live.
    NAMES.forEach(function (name, i) {
      var g = Math.round(100 - i * 45 / (NAMES.length - 1));
      var grey = 'hsl(0 0% ' + g + '%)';
      var el = document.createElement('div');
      el.className = 'cur';
      el.style.setProperty('--g', g);
      el.style.setProperty('--fill', grey);
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.top = '0';
      el.style.pointerEvents = 'none';
      el.innerHTML = '<svg class="arrow" viewBox="0 0 16 20" width="16" height="20"><path d="' + ARROW + '" style="fill: var(--fill); stroke: #000; stroke-width: 1px"/></svg><span class="tab"></span>';
      var tab = el.querySelector('.tab');
      tab.textContent = name;
      host.appendChild(el);

      var face = document.createElement('span');
      face.className = 'face';
      face.title = name;
      face.textContent = name.slice(0, 2);
      if (faces) faces.appendChild(face);

      var a = {
        name: name,
        i: i,
        busy: false,
        x: 0,
        y: innerHeight + 60,
        px: 0,
        py: 0,
        el: el,
        tab: tab,
        face: face,
        on: true,
        flip: false,
        flying: false,
        hold: null,
        tok: 0,
        writing: false,
        wake: T0 + i * 0.06,
        noteT: 0
      };
      a.write = function (on) {
        a.writing = !!on;
        el.classList.toggle('writing', a.writing);
        el.style.setProperty('--fill', a.writing ? PINK : grey);
      };
      a.note = function (text) {
        clearTimeout(a.noteT);
        if (!text) { tab.textContent = name; return; }
        tab.textContent = text;
        a.noteT = setTimeout(function () { tab.textContent = name; }, 1600);
      };
      a.go = function (target, opt) { return flyTo(a, target, opt || {}); };
      all.push(a);
    });

    // Under 700 px only the first 10 cursors are live; the rest are hidden, not rebuilt.
    function syncLimit() {
      var n = innerWidth < 700 ? 10 : all.length;
      api.agents.length = 0;
      all.forEach(function (a, k) {
        a.on = k < n;
        a.el.style.display = a.on ? '' : 'none';
        a.face.style.display = a.on ? '' : 'none';
        if (a.on) {
          api.agents.push(a);
          a.px = a.x;
          a.py = a.y;
        }
      });
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas) {
        canvas.width = innerWidth * dpr;
        canvas.height = innerHeight * dpr;
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      syncLimit();
    }

    function tick() {
      var t = gsap.ticker.time;
      var W = innerWidth, H = innerHeight;
      var n = api.agents.length;
      var draw = ctx && !document.hidden;
      if (draw) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
      for (var k = 0; k < all.length; k++) {
        var a = all[k];
        if (!a.on) continue;
        if (!a.flying) {
          var g = targetOf(a, t, n);
          a.x += (g.x - a.x) * 0.09;
          a.y += (g.y - a.y) * 0.09;
        }
        a.el.style.transform = 'translate3d(' + a.x + 'px,' + a.y + 'px,0)';
        var flip = a.x > W - 110;
        if (flip !== a.flip) { a.flip = flip; a.tab.classList.toggle('flip', flip); }
        var sp = Math.hypot(a.x - a.px, a.y - a.py);
        if (draw && sp > 1.5) {
          ctx.beginPath();
          ctx.moveTo(a.px, a.py);
          ctx.lineTo(a.x, a.y);
          ctx.lineCap = 'round';
          if (a.writing) {
            ctx.strokeStyle = 'rgba(255,46,136,0.8)';
            ctx.lineWidth = 2;
          } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1.5;
          }
          ctx.stroke();
        }
        a.px = a.x;
        a.py = a.y;
      }
      marks.forEach(function (m, el) {
        var r = el.getBoundingClientRect(), s = m.box.style, p = m.p.v;
        s.left = r.left + 'px';
        s.top = r.top + 'px';
        s.width = r.width * p + 'px';
        s.height = r.height * p + 'px';
      });
    }

    api.agents = [];
    syncLimit();
    for (var k = 0; k < api.agents.length; k++) {
      var s = api.agents[k];
      s.x = slotX(k, api.agents.length);
      s.px = s.x;
    }
    resize();
    window.addEventListener('resize', resize);

    api.acquire = function (n) {
      return new Promise(function (resolve) {
        (function attempt() {
          var want = Math.min(n, api.agents.length);
          var free = api.agents.filter(function (a) { return !a.busy; });
          if (free.length >= want) {
            var pool = free.slice();
            for (var j = pool.length - 1; j > 0; j--) {
              var r = Math.floor(Math.random() * (j + 1)), t = pool[j];
              pool[j] = pool[r]; pool[r] = t;
            }
            var got = pool.slice(0, want);
            got.forEach(function (a) { setBusy(a, true); });
            resolve(got);
          } else {
            setTimeout(attempt, 60);
          }
        })();
      });
    };

    api.release = function (list) {
      (list || []).forEach(function (a) {
        a.tok++;
        a.hold = null;
        a.flying = false;
        a.write(false);
        setBusy(a, false);
      });
    };

    api.marquee = marquee;
    api.unmark = unmark;
    api.formation = function (pts) { formationPts = pts || null; };

    api.ready = true;
    gsap.ticker.add(tick);
  }

  onReady(init);

  // Self-check, runs only at #swarmtest.
  if (location.hash === '#swarmtest') {
    onReady(function () {
      if (!api.ready) return;
      api.acquire(6).then(function (list) {
        console.assert(list.length === 6 && new Set(list).size === 6, 'swarm: acquire(6) gives 6 distinct agents');
        var W = innerWidth, H = innerHeight;
        var spots = [{ x: 40, y: 40 }, { x: W - 40, y: 40 }, { x: 40, y: H - 40 }, { x: W - 40, y: H - 40 }, { x: W / 2, y: H / 2 }, { x: W / 2, y: 80 }];
        var nm = document.getElementById('name');
        var jobs = list.slice(1).map(function (a, k) { return a.go(spots[k + 1]); });
        if (nm) jobs.push(api.marquee(list[0], nm, { dur: 0.5 }));
        else jobs.push(list[0].go(spots[0]));
        return Promise.all(jobs).then(function () {
          api.release(list);
          if (nm) api.unmark(nm);
          console.assert(list.every(function (a) { return !a.busy; }), 'swarm: all agents free after release');
        });
      });
    });
  }
})();
