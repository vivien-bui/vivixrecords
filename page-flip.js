/**
 * page-flip.js — the volumes, on a phone, as a book you turn.
 *
 * On a narrow screen a volume stops being a scroll and becomes a deck of
 * leaves: one sheet at a time, stacked, with the next one waiting
 * underneath. Drag a corner and the page folds over your finger — a real
 * fold, not a rotation: the paper creases along the perpendicular
 * bisector of (corner → finger), the flap is that region mirrored across
 * the crease, and the corner swings on an arc hinged at the spine, so it
 * can never travel further than the sheet is wide. Let go past halfway
 * and it finishes; let go short and it falls back. Tapping works too.
 *
 * A leaf keeps the box the pages were written for and is scaled bodily
 * to fit the screen, so the fold is solved in that unscaled space and the
 * scale only ever rides along in the transform.
 *
 * Nothing here moves a node React owns. The layout swap is pure CSS
 * (`html.zf-on`, see the flip section in index.html's stylesheet); this
 * file only sets `data-zf` on leaves, writes a transient `clip-path`
 * while a fold is open, and keeps its own overlay — the folded flap, the
 * dog-ear, the counter — parked on <body>, outside the React root.
 *
 * The sound is synthesised rather than sampled: filtered noise with a
 * swept band and a fibre-crackle envelope for the rustle, a short
 * low-passed knock for the landing, and a live rustle bed under a drag
 * whose level follows how fast the corner is moving.
 */
(function () {
  'use strict';

  // The helmet runs its scripts twice — once as the parser meets them
  // inside <x-dc>, once when the runtime re-mounts them into <head>.
  if (window.__zineFlipLoaded) return;
  window.__zineFlipLoaded = true;

  var MOBILE = window.matchMedia('(max-width: 899px)');
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

  var GAP = 48;          // the fixed header
  var CHROME = 36;       // the counter under the sheet
  var LIFT = 0.3;        // how far the corner bows off the hinge line
  var BOW = 0.16;        // how much the sheet gathers at mid-turn
  // A finger can only carry the corner to the spine, which is half a turn,
  // so the point of no return sits at a bit under half of that.
  var COMMIT = 0.22;
  var FLING = 0.55;      // px/ms of corner speed that finishes it regardless
  var TURN_MS = 660;

  /* ── the sound of it ──────────────────────────────────────────────── */

  var Paper = (function () {
    var ctx = null, noise = null, master = null, dead = false;

    function ready() {
      if (dead) return null;
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { dead = true; return null; }
      try { ctx = new AC(); } catch (e) { dead = true; return null; }
      var len = Math.floor(ctx.sampleRate * 2);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      master = ctx.createGain();
      master.gain.value = 0.17;
      master.connect(ctx.destination);
      return ctx;
    }

    function grain(rate) {
      var s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.playbackRate.value = rate;
      return s;
    }

    // The leaf landing: a short, dull knock with no top end to it.
    function settle(at, level) {
      var s = grain(0.6);
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.01, 0.34 * level), at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
      s.connect(lp); lp.connect(g); g.connect(master);
      s.start(at, Math.random());
      s.stop(at + 0.18);
    }

    // A page going over: the band sweeps up as the leaf passes vertical
    // and back down as it falls, and the envelope is stepped at random so
    // it reads as fibres catching rather than as a hiss.
    function turn(level) {
      var c = ready();
      if (!c) return;
      level = Math.max(0.15, Math.min(1, level || 1));
      var t = c.currentTime + 0.005;
      var dur = 0.32 + Math.random() * 0.12;
      var s = grain(0.85 + Math.random() * 0.4);
      var hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 760;
      var bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.65;
      bp.frequency.setValueAtTime(1100, t);
      bp.frequency.exponentialRampToValueAtTime(3800, t + dur * 0.45);
      bp.frequency.exponentialRampToValueAtTime(1500, t + dur);
      var g = c.createGain();
      var peak = 0.5 * level;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.035);
      for (var i = 1; i <= 5; i++) {
        g.gain.exponentialRampToValueAtTime(
          peak * (0.3 + Math.random() * 0.8),
          t + dur * (i / 6)
        );
      }
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(hp); hp.connect(bp); bp.connect(g); g.connect(master);
      s.start(t, Math.random() * 1.4);
      s.stop(t + dur + 0.06);
      settle(t + dur * 0.8, level);
    }

    // A rustle bed held open for the length of a drag; level() is fed the
    // corner's speed so the paper only talks while it is actually moving.
    function rustle() {
      var c = ready();
      var nil = { level: function () {}, stop: function () {} };
      if (!c) return nil;
      var s = grain(0.9);
      var hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      var bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.8;
      bp.frequency.value = 2200;
      var g = c.createGain();
      g.gain.value = 0.0001;
      s.connect(hp); hp.connect(bp); bp.connect(g); g.connect(master);
      try { s.start(c.currentTime, Math.random() * 1.4); } catch (e) { return nil; }
      var over = false;
      return {
        level: function (v) {
          if (over) return;
          var now = c.currentTime;
          g.gain.setTargetAtTime(Math.max(0.0001, Math.min(0.42, v)), now, 0.04);
          bp.frequency.setTargetAtTime(1500 + v * 3400, now, 0.07);
        },
        stop: function () {
          if (over) return;
          over = true;
          var now = c.currentTime;
          g.gain.setTargetAtTime(0.0001, now, 0.05);
          try { s.stop(now + 0.3); } catch (e) {}
        }
      };
    }

    return { ready: ready, turn: turn, rustle: rustle };
  })();

  /* ── fold geometry ────────────────────────────────────────────────── */

  // Sutherland–Hodgman against one half-plane. `keep` picks which side of
  // the crease survives: true keeps the corner's side (the flap), false
  // the rest of the sheet (what stays lying flat).
  function clipHalf(poly, mx, my, nx, ny, keep) {
    var sign = keep ? 1 : -1;
    var out = [];
    var f = function (p) { return sign * ((p[0] - mx) * nx + (p[1] - my) * ny); };
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var fa = f(a), fb = f(b);
      if (fa <= 0) out.push(a);
      if ((fa <= 0) !== (fb <= 0)) {
        var t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  function polyCss(p) {
    var parts = [];
    for (var i = 0; i < p.length; i++) {
      parts.push(p[i][0].toFixed(2) + 'px ' + p[i][1].toFixed(2) + 'px');
    }
    return 'polygon(' + parts.join(',') + ')';
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ── the deck ─────────────────────────────────────────────────────── */

  var wrap = null;          // the .snap-wrap currently being read
  var leaves = [];          // every .pg in it, in reading order
  var index = 0;
  var wasWrap = null;       // so a rotation doesn't send the reader back to
  var wasIndex = 0;         // page one — same volume, same place
  var turned = 0;           // pages turned this visit — the hint watches this

  var layer = null, probe = null, cast = null, flap = null,
      face = null, sheen = null, ear = null, count = null, hint = null;
  var box = { nw: 0, nh: 0, s: 1, left: 0, top: 0 };

  var fold = null;          // { corner, W, H, px, py, clipEl }
  var lifted = false;       // a leaf is off the sheet, so draw the one under it
  var raf = 0;
  var after = null;         // what the running turn commits to when it lands
  var drag = null;
  var swallowClick = false;

  function sectionOf(pg) { return pg.closest ? pg.closest('.snap-sec') : null; }

  function sameSection() {
    return index + 1 < leaves.length &&
      sectionOf(leaves[index]) === sectionOf(leaves[index + 1]);
  }

  // What the crease cuts. When the next leaf is the facing page of this
  // same spread it shares the spread's backdrop, so only the page itself
  // may be clipped away; otherwise the whole sheet lifts.
  function clipEl() {
    return sameSection() ? leaves[index] : sectionOf(leaves[index]);
  }

  // The page box as the pages were written (nw x nh), plus the scale and
  // offset that put it on screen whole, under the header and above the
  // counter. Everything else in here works in unscaled page pixels.
  function measure() {
    if (!probe) return false;
    var r = probe.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;
    if (!r.width || !r.height || !vw || !vh) return false;
    var s = Math.min(vw * 0.96 / r.width, (vh - GAP - CHROME) / r.height, 1);
    box.nw = r.width;
    box.nh = r.height;
    box.s = s;
    box.left = Math.round((vw - r.width * s) / 2);
    box.top = Math.round(GAP + (vh - GAP - CHROME - r.height * s) / 2);
    var st = document.documentElement.style;
    st.setProperty('--zf-s', String(s));
    st.setProperty('--zf-left', box.left + 'px');
    st.setProperty('--zf-top', box.top + 'px');
    return true;
  }

  /* ── overlay ──────────────────────────────────────────────────────── */

  function buildLayer() {
    if (layer) return;
    layer = document.createElement('div');
    layer.id = 'zf-layer';
    layer.setAttribute('aria-hidden', 'true');
    // The stage is the sheet's own rectangle: the flap is clipped to it so
    // a finished turn disappears at the edge instead of lying in the margin.
    layer.innerHTML =
      '<div class="zf-probe"></div>' +
      '<div class="zf-stage">' +
        '<div class="zf-form"></div>' +
        '<div class="zf-cast" hidden></div>' +
        '<div class="zf-flap" hidden>' +
          '<div class="zf-face"></div>' +
          '<div class="zf-back"></div>' +
          '<div class="zf-sheen"></div>' +
        '</div>' +
      '</div>' +
      '<div class="zf-ear"></div>' +
      '<div class="zf-chrome"><div class="zf-count"></div>' +
      '<div class="zf-hint">( drag the corner )</div></div>';
    document.body.appendChild(layer);
    probe = layer.querySelector('.zf-probe');
    cast = layer.querySelector('.zf-cast');
    flap = layer.querySelector('.zf-flap');
    face = layer.querySelector('.zf-face');
    sheen = layer.querySelector('.zf-sheen');
    ear = layer.querySelector('.zf-ear');
    count = layer.querySelector('.zf-count');
    hint = layer.querySelector('.zf-hint');
  }

  function dropLayer() {
    if (!layer) return;
    layer.remove();
    layer = probe = cast = flap = face = sheen = ear = count = hint = null;
  }

  /* ── state on the page ────────────────────────────────────────────── */

  function mark(el, v) {
    if (!el) return;
    if (el.getAttribute('data-zf') !== v) el.setAttribute('data-zf', v);
  }

  // Only the leaf being read is drawn. The one beneath it waits until a
  // fold actually opens — some leaves are printed on a scrim rather than
  // on stock, and a page showing through another is not what a book does.
  function paint() {
    var ranks = new Map();
    for (var i = 0; i < leaves.length; i++) {
      var rank = i === index ? 2 : (lifted && i === index + 1) ? 1 : 0;
      mark(leaves[i], rank === 2 ? 'cur' : rank === 1 ? 'next' : 'off');
      var sec = sectionOf(leaves[i]);
      if (sec) ranks.set(sec, Math.max(ranks.get(sec) || 0, rank));
    }
    ranks.forEach(function (rank, sec) {
      mark(sec, rank === 2 ? 'cur' : rank === 1 ? 'next' : 'off');
    });

    var cur = leaves[index] && sectionOf(leaves[index]);
    if (cur && wrap) {
      var bg = window.getComputedStyle(cur).backgroundColor;
      var lit = shade(bg);
      if (lit) {
        wrap.style.setProperty('--zf-back', lit.css);
        if (layer) layer.style.setProperty('--zf-ink', lit.dark ? '#cabfa9' : '#8a8776');
      }
    }
    if (count) {
      count.textContent = '( ' + pad(index + 1) + ' / ' + pad(leaves.length) + ' )';
    }
    if (hint) hint.classList.toggle('gone', turned > 1);
    if (ear) ear.classList.toggle('gone', index >= leaves.length - 1);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  // The backdrop is the leaf's own section colour taken down toward a warm
  // black — sometimes the two are the same ink, and a book has to sit *on*
  // something. Dark spreads need more of it than pale ones to read at all.
  function shade(css) {
    var m = /(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/.exec(css);
    if (!m) return null;
    var r = +m[1], g = +m[2], bl = +m[3];
    var lum = (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255;
    var k = 0.1 + 0.24 * (1 - lum);
    var mix = function (v, t) { return Math.round(v * (1 - k) + t * k); };
    return {
      css: 'rgb(' + mix(r, 11) + ',' + mix(g, 9) + ',' + mix(bl, 6) + ')',
      dark: lum < 0.5
    };
  }

  /* ── the flap ─────────────────────────────────────────────────────── */

  // The flap is a throwaway copy of the whole sheet with every leaf but
  // the turning one switched off, so a spread's backdrop rides over with
  // the page the way ink does.
  var flapKey = null;
  function loadFlap() {
    var sec = sectionOf(leaves[index]);
    if (!sec || !face) return;
    var key = index + '|' + leaves.length;
    if (key === flapKey && face.firstElementChild) return;
    flapKey = key;
    var clone = sec.cloneNode(true);
    clone.setAttribute('data-zf', 'cur');
    var ids = clone.querySelectorAll('[id]');
    for (var i = 0; i < ids.length; i++) ids[i].removeAttribute('id');
    if (clone.id) clone.removeAttribute('id');
    var mine = sec.querySelectorAll('.pg');
    var theirs = clone.querySelectorAll('.pg');
    for (var j = 0; j < theirs.length; j++) {
      theirs[j].setAttribute('data-zf', mine[j] === leaves[index] ? 'cur' : 'off');
      theirs[j].style.clipPath = '';
    }
    clone.style.clipPath = '';
    face.replaceChildren(clone);
  }

  function clearFold() {
    if (fold && fold.clipEl) fold.clipEl.style.clipPath = '';
    if (flap) {
      flap.hidden = true;
      flap.style.clipPath = '';
      flap.style.transform = '';
      flap.style.filter = '';
    }
    if (cast) { cast.hidden = true; cast.style.clipPath = ''; }
    fold = null;
    lifted = false;
  }

  // Draw the sheet folded so that `corner` has been dragged to (px, py),
  // in sheet-local pixels.
  function draw() {
    if (!fold) return;
    var W = fold.W, H = fold.H;
    var cx = W, cy = fold.corner === 'bottom' ? H : 0;
    var dx = fold.px - cx, dy = fold.py - cy;
    var len = Math.hypot(dx, dy);
    if (len < 1.2) {
      fold.clipEl.style.clipPath = '';
      flap.hidden = cast.hidden = true;
      return;
    }
    var nx = dx / len, ny = dy / len;
    var mx = (cx + fold.px) / 2, my = (cy + fold.py) / 2;
    var rect = [[0, 0], [W, 0], [W, H], [0, H]];
    var flapPoly = clipHalf(rect, mx, my, nx, ny, true);
    if (flapPoly.length < 3) {
      fold.clipEl.style.clipPath = '';
      flap.hidden = cast.hidden = true;
      return;
    }
    var basePoly = clipHalf(rect, mx, my, nx, ny, false);
    fold.clipEl.style.clipPath = basePoly.length >= 3 ? polyCss(basePoly) : 'polygon(0 0,0 0,0 0)';

    // Reflection across the crease: X' = X − 2((X−M)·n)n.
    var a = 1 - 2 * nx * nx;
    var b = -2 * nx * ny;
    var d = 1 - 2 * ny * ny;
    var k = 2 * (mx * nx + my * ny);
    var shape = polyCss(flapPoly);
    cast.hidden = false;
    cast.style.clipPath = shape;
    flap.hidden = false;
    flap.style.clipPath = shape;
    flap.style.transform = 'scale(' + box.s.toFixed(5) + ') matrix(' +
      a.toFixed(5) + ',' + b.toFixed(5) + ',' + b.toFixed(5) + ',' + d.toFixed(5) +
      ',' + (k * nx).toFixed(3) + ',' + (k * ny).toFixed(3) + ')';
    flap.style.filter =
      'drop-shadow(' + (nx * 3).toFixed(1) + 'px ' + (ny * 3).toFixed(1) +
      'px 5px rgba(28,18,8,0.45)) drop-shadow(' + (nx * 12).toFixed(1) + 'px ' +
      (ny * 12).toFixed(1) + 'px 22px rgba(28,18,8,0.4))';
    // Both gradients run along n, so their far stop always lands on the crease.
    var ang = (Math.atan2(nx, -ny) * 180 / Math.PI).toFixed(2) + 'deg';
    sheen.style.setProperty('--zf-ang', ang);
    cast.style.setProperty('--zf-ang', ang);
  }

  /* ── the corner's path ────────────────────────────────────────────── */

  // The corner is hinged at the spine: an ellipse of half-width W and
  // half-height LIFT·W, so the paper bows without ever having to stretch.
  function atProgress(p) {
    var W = fold.W;
    var phi = p * Math.PI;
    var r = W * (1 - BOW * Math.sin(phi));
    var sy = fold.corner === 'bottom' ? fold.H : 0;
    var lift = fold.corner === 'bottom' ? -1 : 1;
    return [r * Math.cos(phi), sy + lift * r * Math.sin(phi) * LIFT];
  }

  function progressOf(px) {
    return clamp((fold.W - px) / (2 * fold.W), 0, 1);
  }

  function stopAnim() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    after = null;
  }

  // Land a turn that is still in the air, where it was already headed, so
  // a reader tapping quickly gets page after page instead of one in four.
  function finish() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
    var done = after;
    after = null;
    if (done) done();
  }

  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Run the corner from wherever it is to `to` on the hinge path. The
  // first fifth blends out of the raw finger position so releasing a drag
  // never snaps.
  function run(to, ms, done) {
    stopAnim();
    after = done;
    var from = progressOf(fold.px);
    var rawX = fold.px, rawY = fold.py;
    var t0 = performance.now();
    var step = function (now) {
      var t = clamp((now - t0) / ms, 0, 1);
      var e = ease(t);
      var p = from + (to - from) * e;
      var pt = atProgress(p);
      var blend = Math.min(1, t * 5);
      var seed = atProgress(from);
      fold.px = pt[0] + (rawX - seed[0]) * (1 - blend);
      fold.py = pt[1] + (rawY - seed[1]) * (1 - blend);
      draw();
      if (t < 1) { raf = requestAnimationFrame(step); return; }
      raf = 0;
      after = null;
      if (done) done();
    };
    raf = requestAnimationFrame(step);
  }

  function openFold(corner, startP) {
    if (!box.nw && !measure()) return false;
    fold = {
      corner: corner,
      W: box.nw,
      H: box.nh,
      px: 0,
      py: 0,
      clipEl: clipEl()
    };
    lifted = true;
    var pt = atProgress(startP);
    fold.px = pt[0];
    fold.py = pt[1];
    loadFlap();
    return true;
  }

  /* ── turning ──────────────────────────────────────────────────────── */

  function canNext() { return index + 1 < leaves.length; }
  function canPrev() { return index > 0; }

  function finishForward() {
    clearFold();
    index++;
    turned++;
    paint();
  }

  function flipNext(level, corner) {
    if (drag) return;
    finish();
    if (!canNext()) return;
    if (REDUCED.matches) {
      Paper.turn(0.7);
      index++; turned++; paint();
      return;
    }
    if (!openFold(corner || 'bottom', 0)) return;
    paint();
    Paper.turn(level || 0.85);
    run(1, TURN_MS, finishForward);
  }

  function flipPrev(level, corner) {
    if (drag) return;
    finish();
    if (!canPrev()) return;
    if (REDUCED.matches) {
      Paper.turn(0.7);
      index--; turned++; paint();
      return;
    }
    index--;
    if (!openFold(corner || 'bottom', 1)) { paint(); return; }
    paint();
    draw();
    Paper.turn(level || 0.85);
    run(0, TURN_MS, function () {
      clearFold();
      turned++;
      paint();
    });
  }

  /* ── pointer ──────────────────────────────────────────────────────── */

  function interactive(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (n.nodeType !== 1) continue;
      var tag = n.tagName;
      if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT') return true;
      var role = n.getAttribute('role');
      if (role === 'button' || role === 'link') return true;
      if (window.getComputedStyle(n).cursor === 'pointer') return true;
    }
    return false;
  }

  function onDown(e) {
    if (!wrap || drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    finish();
    if (!box.nw && !measure()) return;
    Paper.ready();
    drag = {
      id: e.pointerId,
      x0: e.clientX, y0: e.clientY,
      gx: (e.clientX - box.left) / box.s, gy: (e.clientY - box.top) / box.s,
      W: box.nw, H: box.nh,
      lastX: e.clientX, lastT: performance.now(),
      speed: 0, live: false, dir: 0, bed: null,
      tappable: !interactive(e.target)
    };
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;

    if (!drag.live) {
      if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy)) return;
      var forward = dx < 0;
      if (forward ? !canNext() : !canPrev()) { drag.dir = 0; return; }
      drag.live = true;
      drag.dir = forward ? 1 : -1;
      var corner = drag.gy > drag.H * 0.55 ? 'bottom' : 'top';
      if (forward) {
        if (!openFold(corner, 0)) { drag = null; return; }
        paint();
      } else {
        index--;
        if (!openFold(corner, 1)) { index++; paint(); drag = null; return; }
        paint();
      }
      drag.bed = Paper.rustle();
      // Capture only once this is a drag: capturing on pointerdown would
      // retarget the click too, and every link on the leaf would go dead.
      try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
    }
    if (!fold) return;

    var now = performance.now();
    var dt = Math.max(8, now - drag.lastT);
    drag.speed = Math.abs(e.clientX - drag.lastX) / dt;
    drag.lastX = e.clientX;
    drag.lastT = now;
    if (drag.bed) drag.bed.level(Math.min(0.4, drag.speed * 0.16));

    var sy = fold.corner === 'bottom' ? fold.H : 0;

    if (drag.dir === 1) {
      // Forward: the corner follows the finger, keeping the grip offset,
      // and is reined back onto the hinge circle so the sheet can't stretch.
      var px = (e.clientX - box.left) / box.s + (fold.W - drag.gx);
      var py = (e.clientY - box.top) / box.s + (sy - drag.gy);
      var r = Math.hypot(px, py - sy);
      if (r > fold.W) {
        var s = fold.W / r;
        px = px * s;
        py = sy + (py - sy) * s;
      }
      if (px > fold.W) px = fold.W;
      fold.px = px;
      fold.py = py;
    } else {
      // Back: the finger's rightward travel drives the turn, so the leaf
      // comes back over from the left instead of jumping to the touch.
      var p = clamp(1 - dx / box.s / (fold.W * 1.35), 0, 1);
      var pt = atProgress(p);
      fold.px = pt[0];
      fold.py = pt[1];
    }
    draw();
  }

  function onUp(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag;
    drag = null;
    if (d.bed) d.bed.stop();

    if (!d.live) {
      if (d.tappable && Math.abs(e.clientX - d.x0) < 8 && Math.abs(e.clientY - d.y0) < 8) {
        var corner = d.gy > d.H * 0.55 ? 'bottom' : 'top';
        if (d.gx < d.W * 0.26) flipPrev(0.8, corner); else flipNext(0.9, corner);
      }
      return;
    }
    swallowClick = true;
    setTimeout(function () { swallowClick = false; }, 0);
    if (!fold) return;

    var p = progressOf(fold.px);
    var fling = d.speed > FLING;
    var remain = 1;

    if (d.dir === 1) {
      var go = p > COMMIT || (fling && p > 0.06);
      remain = go ? 1 - p : p;
      Paper.turn(clamp(0.45 + remain * 0.7, 0.3, 1));
      run(go ? 1 : 0, Math.max(220, TURN_MS * remain + 140), function () {
        if (go) finishForward(); else { clearFold(); paint(); }
      });
    } else {
      var back = p < 1 - COMMIT || (fling && p < 0.88);
      remain = back ? p : 1 - p;
      Paper.turn(clamp(0.45 + remain * 0.7, 0.3, 1));
      run(back ? 0 : 1, Math.max(220, TURN_MS * remain + 140), function () {
        if (!back) index++;
        clearFold();
        turned++;
        paint();
      });
    }
  }

  // A photograph under the finger would otherwise start a native image
  // drag, and the browser cancels the pointer out from under the fold.
  function onDragStart(e) { e.preventDefault(); }

  function onClick(e) {
    if (!swallowClick) return;
    e.stopPropagation();
    e.preventDefault();
  }

  function onKey(e) {
    if (!wrap) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); flipNext(0.8); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); flipPrev(0.8); }
  }

  /* ── enter / leave ────────────────────────────────────────────────── */

  function bind(on) {
    var m = on ? 'addEventListener' : 'removeEventListener';
    if (!wrap) return;
    wrap[m]('pointerdown', onDown);
    wrap[m]('pointermove', onMove);
    wrap[m]('pointerup', onUp);
    wrap[m]('pointercancel', onUp);
    wrap[m]('dragstart', onDragStart);
    wrap[m]('click', onClick, true);
    window[m]('keydown', onKey);
  }

  function enter(el, pages) {
    wrap = el;
    leaves = pages;
    index = el === wasWrap ? Math.min(wasIndex, pages.length - 1) : 0;
    turned = index ? 2 : 0;
    document.documentElement.classList.add('zf-on');
    buildLayer();
    var paper = window.getComputedStyle(wrap).getPropertyValue('--zf-paper');
    if (paper) layer.style.setProperty('--zf-paper', paper.trim());
    wrap.scrollTop = 0;
    measure();
    bind(true);
    paint();
  }

  function leave() {
    wasWrap = wrap;
    wasIndex = index;
    stopAnim();
    if (drag && drag.bed) drag.bed.stop();
    drag = null;
    clearFold();
    bind(false);
    flapKey = null;
    if (wrap) wrap.style.removeProperty('--zf-back');
    for (var i = 0; i < leaves.length; i++) {
      leaves[i].removeAttribute('data-zf');
      leaves[i].style.clipPath = '';
      var sec = sectionOf(leaves[i]);
      if (sec) { sec.removeAttribute('data-zf'); sec.style.clipPath = ''; }
    }
    document.documentElement.classList.remove('zf-on');
    ['--zf-s', '--zf-left', '--zf-top'].forEach(function (v) {
      document.documentElement.style.removeProperty(v);
    });
    box.nw = box.nh = 0;
    dropLayer();
    wrap = null;
    leaves = [];
  }

  function sync() {
    var el = MOBILE.matches ? document.querySelector('.snap-wrap') : null;
    var pages = el ? Array.prototype.slice.call(el.querySelectorAll('.pg')) : [];
    if (!el || pages.length < 2) {
      if (wrap) leave();
      return;
    }
    if (el === wrap) {
      measure();
      // Same volume — React may have swapped nodes underneath us.
      var same = pages.length === leaves.length;
      for (var i = 0; same && i < pages.length; i++) same = pages[i] === leaves[i];
      if (same) { paint(); return; }
      var keep = Math.min(index, pages.length - 1);
      leaves = pages;
      index = keep;
      flapKey = null;
      paint();
      return;
    }
    if (wrap) leave();
    enter(el, pages);
  }

  var pending = 0;
  function schedule() {
    if (pending) return;
    pending = requestAnimationFrame(function () { pending = 0; sync(); });
  }

  function start() {
    // Re-scan whenever React re-renders, but never in answer to our own
    // overlay writes — that would loop.
    new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var t = recs[i].target;
        if (layer && (t === layer || layer.contains(t))) continue;
        schedule();
        return;
      }
    }).observe(document.body, { childList: true, subtree: true });
    var listen = function (mq) {
      if (mq.addEventListener) mq.addEventListener('change', schedule);
      else mq.addListener(schedule);
    };
    listen(MOBILE);
    listen(REDUCED);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('popstate', schedule);
    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
