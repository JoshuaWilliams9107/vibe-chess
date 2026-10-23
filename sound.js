// ---------- Sound effects ----------
// Exposes window.SFX:
//   SFX.play(name, delayMs)  - name: 'move' | 'capture' | 'checkmate';
//                               delayMs until it sounds
//   SFX.toggleMute()         - flips mute state, returns the new state
//   SFX.isMuted()
//
// 'move'/'capture' are synthesized: a single shared AudioContext is
// created/unlocked on the first user gesture, and each sound is just a few
// oscillators + a noise burst.
// 'checkmate' is the FNAF "Yayyyy" sample — the one real audio file in the
// app — held in a preloaded HTMLAudioElement.
(function () {
  'use strict';
  if (window.SFX) return; // already loaded

  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;      // shared AudioContext
  let muted = false;
  let noiseBuf = null; // cached white-noise buffer

  // The FNAF "Yayyyy" sample. Plain HTMLAudio (it's a recording, not a synth);
  // playback is always triggered from a user gesture, so autoplay policies
  // are satisfied.
  const yayAudio = new Audio('assets/fnaf-yayyyy.mp3');
  yayAudio.preload = 'auto';
  yayAudio.load();

  // Create (once) and unlock the context. Safe to call from a user gesture.
  function ensureCtx() {
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Unlock on the first user gesture of any kind (browser autoplay policy).
  const unlockEvents = ['pointerdown', 'keydown', 'click'];
  function unlock() {
    ensureCtx();
    for (const ev of unlockEvents) window.removeEventListener(ev, unlock);
  }
  for (const ev of unlockEvents) {
    window.addEventListener(ev, unlock, { passive: true });
  }

  // A short buffer of white noise, generated once.
  function noiseBuffer(ac) {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(ac.sampleRate * 0.06); // 60 ms is plenty
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseBuf = buf;
    return buf;
  }

  // Percussive gain envelope: near-instant attack to `peak`, then an
  // exponential decay toward 0 with time constant `decay` (seconds).
  function percussive(ac, dest, peak, t0, attack, decay) {
    const g = ac.createGain();
    const gn = g.gain;
    gn.setValueAtTime(0.0001, t0);
    gn.linearRampToValueAtTime(peak, t0 + attack);
    gn.setTargetAtTime(0, t0 + attack, decay);
    g.connect(dest);
    return g;
  }

  // A little frequency randomness so repeated hits don't loop mechanically.
  const jitter = (f, amt = 0.04) => f * (1 + (Math.random() * 2 - 1) * amt);

  // A struck ceramic piece: TWO inharmonic partials (1x, 1.62x) with
  // different fast decays. A single sustained sine reads as a bottle;
  // two modes dying out of phase reads as a struck piece.
  function ceramic(ac, out, f, peak, t0) {
    const o1 = ac.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(jitter(f), t0);
    const g1 = percussive(ac, out, peak, t0, 0.001, 0.014);
    o1.connect(g1);
    o1.start(t0);
    o1.stop(t0 + 0.05);

    const o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(jitter(f * 1.62), t0);
    const g2 = percussive(ac, out, peak * 0.5, t0, 0.001, 0.009);
    o2.connect(g2);
    o2.start(t0);
    o2.stop(t0 + 0.04);
  }

  // A knock on wood: a low fundamental, a ~2.1x mode, and a low-passed
  // noise thump, all decaying at different rates. Real wood knocks are
  // multi-mode, which is what stops them sounding like pipes or bottles.
  function wood(ac, out, f, peak, t0) {
    const o1 = ac.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(jitter(f), t0);
    const g1 = percussive(ac, out, peak, t0, 0.003, 0.016);
    o1.connect(g1);
    o1.start(t0);
    o1.stop(t0 + 0.07);

    const o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(jitter(f * 2.1), t0);
    const g2 = percussive(ac, out, peak * 0.35, t0, 0.002, 0.008);
    o2.connect(g2);
    o2.start(t0);
    o2.stop(t0 + 0.05);

    const n = ac.createBufferSource();
    n.buffer = noiseBuffer(ac);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g3 = percussive(ac, out, peak * 0.5, t0, 0.002, 0.006);
    n.connect(lp);
    lp.connect(g3);
    n.start(t0);
    n.stop(t0 + 0.04);
  }

  // A ceramic piece set on a wooden board: a hard, dull "tok" with a
  // faint re-touch as it settles.
  function playMove(ac, t0) {
    const out = ac.createGain();
    out.gain.value = 0.85;
    out.connect(ac.destination);

    // 1) The edge on wood: instant, mid-high transient.
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const nGain = percussive(ac, out, 0.5, t0, 0.001, 0.008);
    src.connect(hp);
    hp.connect(nGain);
    src.start(t0);
    src.stop(t0 + 0.05);

    // 2) The struck ceramic body.
    ceramic(ac, out, 1400, 0.22, t0);

    // 3) The wood knock.
    wood(ac, out, 260, 0.34, t0);

    // 4) A faint, dull re-touch as the piece finds its rest.
    const t1 = t0 + 0.03;
    wood(ac, out, 230, 0.1, t1);
  }

  // A capture: a harder, deeper clack, then the taken piece drops off
  // with a delayed, low "tok".
  function playCapture(ac, t0) {
    const out = ac.createGain();
    out.gain.value = 1.0;
    out.connect(ac.destination);

    // 1) Two pieces meeting: instant, mid-high.
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const nGain = percussive(ac, out, 0.55, t0, 0.001, 0.009);
    src.connect(hp);
    hp.connect(nGain);
    src.start(t0);
    src.stop(t0 + 0.05);

    // 2) The struck piece.
    ceramic(ac, out, 1100, 0.16, t0);

    // 3) The board knock: hard.
    wood(ac, out, 220, 0.42, t0);

    // 4) The taken piece falls.
    const t1 = t0 + 0.055;
    wood(ac, out, 170, 0.26, t1);
  }

  function play(name, delayMs = 0) {
    if (muted) return;
    if (name === 'checkmate') {
      const go = () => {
        try {
          yayAudio.currentTime = 0;
          const p = yayAudio.play();
          if (p && p.catch) p.catch(() => {});
        } catch (_) {}
      };
      const t = Math.max(0, delayMs);
      if (t > 0) setTimeout(go, t);
      else go();
      return;
    }
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime + Math.max(0, delayMs) / 1000;
    if (name === 'capture') playCapture(ac, t0);
    else playMove(ac, t0);
  }

  const SFX = {
    play,
    toggleMute: () => {
      muted = !muted;
      if (muted) yayAudio.pause();
      return muted;
    },
    isMuted: () => muted,
  };
  window.SFX = SFX;

  // Wire up the mute button if it's in the DOM.
  const btn = document.getElementById('mute');
  if (btn) {
    const sync = () => {
      btn.textContent = muted ? '🔇' : '🔊';
      btn.setAttribute('aria-pressed', String(muted));
      btn.title = muted ? 'Sound: off (click to enable)' : 'Sound: on (click to mute)';
    };
    btn.addEventListener('click', () => {
      SFX.toggleMute();
      sync();
    });
    sync();
  }
})();
