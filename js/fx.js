(function () {
  'use strict';
  window.Fx = {};
  if (!document.documentElement.classList.contains('motion')) return;

  var TAU = Math.PI * 2;
  // [alpha, radius as share of the larger side, x period s, y period s, phase]
  var BLOOMS = [[0.10, 0.45, 23, 37, 0], [0.07, 0.35, 31, 41, 2.1], [0.05, 0.30, 27, 29, 4.2]];
  var PINK = '255,46,136';
  var pNow = 0, pDone = -1, frame = 0;
  var mx, my, px, py, prog, cv, cx, grainPat;
  var W = 1, H = 1;

  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  }

  // Part 1: scroll hairline. Measured on scroll, written in the ticker when it changes.
  function measure() {
    var span = document.documentElement.scrollHeight - innerHeight;
    pNow = span > 0 ? Math.min(1, Math.max(0, scrollY / span)) : 0;
  }

  // Part 2: backdrop canvas at half resolution.
  function sizeCanvas() {
    W = cv.width = Math.max(1, Math.round(innerWidth / 2));
    H = cv.height = Math.max(1, Math.round(innerHeight / 2));
  }

  function onPoint(e) { mx = e.clientX; my = e.clientY; }

  function draw(t) {
    var big = Math.max(W, H), sx = W / innerWidth, sy = H / innerHeight;
    var up = scrollY * 0.05 * sy;
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = '#050505';
    cx.fillRect(0, 0, W, H);

    cx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < BLOOMS.length; i++) {
      var b = BLOOMS[i], r = b[1] * big;
      var x = W * (0.5 + 0.28 * Math.sin(TAU * t / b[2] + b[4]));
      var y = H * (0.5 + 0.22 * Math.cos(TAU * t / b[3] + b[4])) - up;
      var g = cx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,' + b[0] + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = g;
      cx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }

    px += (mx - px) * 0.06;
    py += (my - py) * 0.06;
    var pr = 0.22 * big, qx = px * sx, qy = py * sy;
    var pg = cx.createRadialGradient(qx, qy, 0, qx, qy, pr);
    pg.addColorStop(0, 'rgba(' + PINK + ',0.16)');
    pg.addColorStop(1, 'rgba(' + PINK + ',0)');
    cx.fillStyle = pg;
    cx.fillRect(qx - pr, qy - pr, 2 * pr, 2 * pr);

    cx.globalCompositeOperation = 'source-over';
    var ox = Math.random() * 128 | 0, oy = Math.random() * 128 | 0;
    cx.save();
    cx.translate(ox, oy);
    cx.fillStyle = grainPat;
    cx.fillRect(-ox, -oy, W, H);
    cx.restore();
  }

  function splitName(name) {
    var text = name.textContent, letters = [];
    name.setAttribute('aria-label', text);
    name.textContent = '';
    var words = text.split(' ');
    for (var w = 0; w < words.length; w++) {
      if (w > 0) name.appendChild(document.createTextNode(' '));
      var word = document.createElement('span');
      word.className = 'word';
      name.appendChild(word);
      for (var k = 0; k < words[w].length; k++) {
        var s = document.createElement('span');
        s.className = 'letter';
        s.setAttribute('aria-hidden', 'true');
        // CSS will-change would composite the letters and hide the background-clip text fill
        s.style.willChange = 'auto';
        s.textContent = words[w].charAt(k);
        word.appendChild(s);
        letters.push(s);
      }
    }
    return letters;
  }

  // Part 3: hero build. The finally block always leaves the hero visible.
  async function runHero(letters, rise, name) {
    var all = letters.concat(rise), agents = [], marked = false, stopped = false, stop = null;
    var stopP = new Promise(function (_, rej) { stop = rej; });
    stopP.catch(function () {});
    var y0 = scrollY, T0 = gsap.ticker.time;
    function until(p) { return Promise.race([p, stopP]); }
    function after(s) { return new Promise(function (res) { gsap.delayedCall(Math.max(0, s), res); }); }
    function tweenP(targets, vars) {
      return new Promise(function (res) { vars.onComplete = res; gsap.to(targets, vars); });
    }
    function skip() { if (!stopped) { stopped = true; stop(new Error('skip')); } }
    function onScroll() { if (Math.abs(scrollY - y0) > 200) skip(); }
    function fly(agent, el) {
      return agent.go(el).then(function () {
        agent.write(true);
        agent.go(el, { dur: 0.95 });
        return tweenP(el, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.95, ease: 'expo.out' });
      }).then(function () { agent.write(false); });
    }

    addEventListener('scroll', onScroll, { passive: true });
    // Watchdog: a stuck swarm promise must not leave the hero hidden
    var watchdog = gsap.delayedCall(15, skip);
    try {
      var n = Math.min(letters.length, Swarm.agents.length - 2);
      if (Swarm.ready && n > 0) {
        var crew = await until(Swarm.acquire(n).then(function (list) {
          if (stopped) Swarm.release(list); else agents = list;
          return list;
        }));
        var chains = crew.map(function (agent, k) {
          var own = [];
          for (var i = k; i < letters.length; i += n) own.push(i);
          return own.reduce(function (p, idx) {
            return p.then(function () {
              return until(after(T0 + idx * 0.07 - gsap.ticker.time))
                .then(function () { return fly(agent, letters[idx]); });
            });
          }, Promise.resolve());
        });
        await until(Promise.all(chains));
        marked = true;
        await until(Swarm.marquee(crew[0], name, { dur: 0.6 }));
        await until(after(0.35));
        Swarm.unmark(name);
        marked = false;
        Swarm.release(crew);
        agents = [];
      } else {
        await until(tweenP(letters, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.95, ease: 'expo.out', stagger: 0.07 }));
      }
      await until(tweenP(rise, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.1 }));
    } catch (e) {
      // skipped or interrupted: the finally block settles the hero
    } finally {
      removeEventListener('scroll', onScroll);
      watchdog.kill();
      gsap.killTweensOf(all);
      if (marked) Swarm.unmark(name);
      Swarm.release(agents);
      gsap.set(letters, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 });
      gsap.set(rise, { opacity: 1, y: 0 });
      gsap.set(all, { clearProps: 'transform,opacity' });
    }
  }

  function start() {
    // Part 1 markup and scroll listeners
    prog = document.createElement('div');
    prog.id = 'progress';
    prog.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(prog, document.body.firstChild);
    measure();
    addEventListener('scroll', measure, { passive: true });
    addEventListener('resize', measure);

    // Part 2 backdrop
    cv = document.getElementById('backdrop');
    cx = cv.getContext('2d');
    sizeCanvas();
    addEventListener('resize', sizeCanvas);
    px = mx = 0.72 * innerWidth;
    py = my = 0.30 * innerHeight;
    addEventListener('pointermove', onPoint, { passive: true });
    addEventListener('pointerdown', onPoint, { passive: true });
    var gc = document.createElement('canvas');
    gc.width = gc.height = 128;
    var gx = gc.getContext('2d'), img = gx.createImageData(128, 128);
    for (var k = 0; k < img.data.length; k += 4) {
      var g = Math.random() * 256 | 0;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = g;
      img.data[k + 3] = 13; // 0.05 alpha
    }
    gx.putImageData(img, 0, 0);
    grainPat = cx.createPattern(gc, 'repeat');
    gsap.ticker.add(function () {
      if (pNow !== pDone) { pDone = pNow; prog.style.setProperty('--p', pNow); }
      if (document.hidden || frame++ % 2) return;
      draw(gsap.ticker.time);
    });

    // Part 3 hero
    var hero = document.getElementById('hero'), name = document.getElementById('name');
    if (hero && name && inView(hero)) {
      var lede = hero.querySelector('.lede'), intro = hero.querySelector('.intro');
      var rise = [lede, intro].concat(Array.prototype.slice.call(hero.querySelectorAll('.links a')));
      var letters = splitName(name);
      letters.forEach(function (el) {
        gsap.set(el, {
          x: (Math.random() * 1.2 - 0.6) * innerWidth,
          y: (0.5 + Math.random() * 0.6) * innerHeight,
          rotation: Math.random() * 100 - 50,
          scale: 0.6,
          opacity: 0
        });
      });
      gsap.set(rise, { opacity: 0, y: 18 });
      gsap.delayedCall(0.25, runHero, [letters, rise, name]);
    }

    // Part 4 window entrance
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        gsap.fromTo(en.target, { scale: 0.96, y: 30, opacity: 0.4 },
          { scale: 1, y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', clearProps: 'transform,opacity' });
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.win').forEach(function (w) { io.observe(w); });

    // Part 5 footer formation
    var contact = document.getElementById('contact');
    var mail = contact && contact.querySelector('a[href^="mailto:"]');
    if (mail) {
      var rc = -1, rcx = 0, rcy = 0, rbase = 150;
      var ring = function (i, n, t) {
        if (t > 1000) t /= 1000;
        if (t !== rc) {
          rc = t;
          var r = mail.getBoundingClientRect();
          rcx = r.left + r.width / 2;
          rcy = r.top + r.height / 2;
          rbase = Math.max(r.width / 2 + 70, 150);
        }
        var R = rbase + 6 * Math.sin(t * 2 + i);
        var a = i / n * TAU + t * 0.35;
        return { x: rcx + Math.cos(a) * R, y: rcy + Math.sin(a) * R * 0.55 };
      };
      var fio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) Swarm.formation(null);
          else if (Swarm.ready) Swarm.formation(ring);
        });
      }, { threshold: 0.35 });
      fio.observe(contact);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
