// ---------- Confetti ----------
// Exposes window.Confetti:
//   Confetti.celebrate(delayMs)  - full-screen confetti rain, delayed by delayMs
//
// Self-contained: lazily creates a fixed, pointer-events:none canvas overlay
// on the first celebration, then runs its own requestAnimationFrame loop.
// Pieces are born staggered over the first SPAWN_MS (instead of all at once)
// and the whole celebration is hard-capped at TOTAL_MS - sized to ride the
// ~5s checkmate "yayyyy" audio. Piece positions are derived from the clock,
// so it still ends cleanly after a frame stall / hidden tab.
// Respects prefers-reduced-motion (skips entirely).
(function () {
  'use strict';
  if (window.Confetti) return; // already loaded

  const COLORS = ['#ff5252', '#ffd740', '#40c4ff', '#69f0ae', '#e040fb', '#ff9800', '#f5f5f5'];
  const COUNT = 180;
  const SPAWN_MS = 2000; // pieces appear staggered over this window
  const TOTAL_MS = 5000; // hard cap: the celebration can never run past this

  let canvas = null;
  let g = null; // 2d context
  let particles = null;
  let raf = null;
  let timer = null;
  let t0 = 0; // performance.now() when spawning began

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'confetti';
    document.body.appendChild(canvas);
    g = canvas.getContext('2d');
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas);
  }

  function sizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn() {
    const w = window.innerWidth;
    const list = [];
    for (let i = 0; i < COUNT; i++) {
      const circle = Math.random() < 0.25;
      const rw = 5 + Math.random() * 7;
      const rh = 8 + Math.random() * 9;
      const rr = 2.5 + Math.random() * 2;
      list.push({
        born: Math.random() * SPAWN_MS,        // ms into the run when it appears
        fallMs: 1600 + Math.random() * 1380,  // time from top edge to off-screen
        x: Math.random() * w,
        drift: (Math.random() - 0.5) * 40,    // px/s horizontal drift
        w: circle ? 0 : rw,
        h: circle ? 0 : rh,
        r: circle ? rr : 0,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 3,      // rad/s
        phase: Math.random() * Math.PI * 2,
        amp: 0.5 + Math.random() * 0.7,      // flutter amplitude scale
        color: COLORS[(Math.random() * COLORS.length) | 0],
      });
    }
    return list;
  }

  function tick() {
    raf = null;
    const w = window.innerWidth;
    const h = window.innerHeight;
    g.clearRect(0, 0, w, h);
    const elapsed = performance.now() - t0;
    if (elapsed >= TOTAL_MS) {
      g.clearRect(0, 0, w, h);
      return; // hard cap (also covers a long rAF stall / hidden tab)
    }
    let alive = 0;
    for (const p of particles) {
      const age = elapsed - p.born;
      if (age < 0 || age >= p.fallMs) continue; // not born yet / already off-screen
      alive++;
      const e = age / p.fallMs;
      const y = -30 + (h + 70) * e * e; // ease-in: accelerates like gravity, exits at h+40
      const t = age / 1000;
      const x = p.x + p.drift * t + Math.sin(p.phase + t * 6) * 10 * p.amp; // flutter
      g.save();
      g.translate(x, y);
      g.rotate(p.rot + p.spin * t);
      g.fillStyle = p.color;
      if (p.r) {
        g.beginPath();
        g.arc(0, 0, p.r, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      g.restore();
    }
    // Keep running while pieces are on-screen OR the spawn window is still
    // open (a frame with zero live pieces must not kill the loop - pieces
    // are born staggered up to SPAWN_MS in). The TOTAL_MS cap still ends it.
    if (alive > 0 || elapsed < SPAWN_MS) {
      raf = window.requestAnimationFrame(tick);
    } else {
      g.clearRect(0, 0, w, h);
    }
  }

  function schedule(delayMs) {
    const go = () => {
      timer = null;
      ensureCanvas();
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = null;
      }
      particles = spawn();
      t0 = performance.now();
      raf = window.requestAnimationFrame(tick);
    };
    const t = Math.max(0, delayMs | 0);
    if (t > 0) timer = window.setTimeout(go, t);
    else go();
  }

  function celebrate(delayMs) {
    if (reducedMotion()) {
      console.info('[confetti] skipped: prefers-reduced-motion is set');
      return;
    }
    schedule(delayMs);
  }

  // DevTools helper: type Confetti.test() in the console — always runs,
  // ignoring prefers-reduced-motion, with no delay.
  function test() {
    schedule(0);
  }

  window.Confetti = { celebrate, test };
})();
