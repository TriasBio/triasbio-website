// Owner: hero. The first screen is a day, then the statement screen.
//
// Intro: night. Over about 2.5 s the sky runs through dawn, noon and dusk and back to night
// while the corner clock races 00:00 to 24:00 and the sun, then the moon, travel the ring.
// The window arc makes protein only while the hour is inside it. "Re-timing" lands as the
// night settles, then each rotating word re-times the sky, the ring and the clock to its
// hour (WORD_HOURS), and "medicine." settles at midnight, where the page begins.
//
// The whole intro is one schedule, sampled into Web Animations on transform and opacity,
// so it keeps running smoothly on the compositor while the rest of the page boots.
// A small rAF loop only drives the corner clock (state.clockOverride) and the word swaps.
// Scrolling, a navigation key or a click anywhere settles it at once. Repeat visits,
// reduced motion and "Pause motion" start settled (decided before first paint in
// partials/head-hero.html). 'intro:done' fires exactly once on every path, since the 3D
// layer waits for it before it loads three.js.
import { gsap } from 'gsap';
import { state, onTick, emitTick, emit, on } from '../core/state.js';
import { WORD_HOURS } from '../core/time.js';
import { EASE_CSS } from '../core/motion.js';
import { splitWords } from '../core/text.js';
import { skyAt, skyColor, wrap, cssA, FADE_LIFT } from './sky.js';
import { rods } from './ring-svg.js';

const $ = (s, el = document) => el.querySelector(s);
const SEEN = 'trias:intro-seen';
const PER_H = 8;                    // sky columns per hour
const SPAN_H = 48;                  // two days: the intro's clock only runs forward
const COLS = SPAN_H * PER_H + 1;
const ROWS = 160;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// 'intro:done' goes out once, whatever path the hero takes (intro, skip, settled start, error).
let introDone = false;
const doneOnce = () => { if (introDone) return; introDone = true; emit('intro:done'); };

// Instrument Serif (regular and italic) is in, so the headline lands in its real face.
const serifReady = () => {
  try { return document.fonts.check('1em "Instrument Serif"') && document.fonts.check('italic 1em "Instrument Serif"'); } catch { return true; }
};

// ---- Easing (sampled, so any curve works) ----
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t;
  const Y = t => ((ay * t + by) * t + cy) * t;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { const v = X(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}
const easeTrias = bezier(0.2, 0.7, 0.2, 1);
const easeDayIO = bezier(0.42, 0.08, 0.58, 0.92);
// The day pass: gentle start and end, and it lingers a little in daylight.
const dayCurve = p => { const q = easeDayIO(p); return q - (0.3 * Math.sin(2 * Math.PI * q)) / (2 * Math.PI); };

// How far the sun sits below its horizon: half-risen (centered on it) at rise 0.5,
// and far enough down at 0 that its glow is hidden too.
const sunDrop = r => (r >= 0.5 ? (1 - r) * 104 : 52 + (0.5 - r) * 2 * 178);

// ---- The schedule: hour H (unwrapped, 0..48) as a function of time ----
function buildPlan(mobile) {
  const P = mobile
    ? { lead: 0.15, day: 2.1, gap: 0.2, move: 0.68, hold: 1.4 }
    : { lead: 0.25, day: 2.5, gap: 0.22, move: 0.8, hold: 1.8 };
  const segs = [];
  let t = 0, H = 0;
  const hold = d => { segs.push({ t0: t, t1: t + d, h0: H, h1: H, ease: () => 0 }); t += d; };
  const move = (h1, d, ease) => { segs.push({ t0: t, t1: t + d, h0: H, h1, ease }); t += d; H = h1; };
  hold(P.lead);
  move(24, P.day, dayCurve);
  const dayEnd = t;
  hold(P.gap);
  const words = [];
  WORD_HOURS.forEach(([word, hour], i) => {
    const target = H + ((((hour - wrap(H)) % 24) + 24) % 24);
    words.push({ word, hour, t: t, i });
    move(target, P.move, easeTrias);
    if (i < WORD_HOURS.length - 1) hold(P.hold);
  });
  return { segs, total: t, dayStart: P.lead, dayEnd, words, line1: dayEnd - 0.42, sub: words[0].t + 0.45 };
}
function hourAt(plan, t) {
  for (const s of plan.segs) {
    if (t <= s.t1) return s.h0 + (s.h1 - s.h0) * s.ease((t - s.t0) / (s.t1 - s.t0 || 1));
  }
  return plan.segs[plan.segs.length - 1].h1;
}

export function initHero() {
  try { initStatement(); } catch (e) { console.error('[hero] statement failed', e); }
  try { initFirstScreen(); } catch (e) {
    // The first screen must never stay hidden: show the settled hero and let the page go on.
    console.error('[hero] first screen failed', e);
    const root = document.documentElement;
    root.classList.remove('hero-intro', 'hero-hold');
    root.classList.add('hero-settled');
    state.clockOverride = null;
    state.introActive = false;
    emitTick();
    requestAnimationFrame(doneOnce);
  }
}

function initFirstScreen() {
  const root = document.documentElement;
  const hero = $('#top.hero');
  if (!hero) { requestAnimationFrame(doneOnce); return; }
  const el = {
    canvas: $('.sky-canvas', hero), stars: $('.sky-stars', hero), scrim: $('.sky-scrim', hero), fade: $('.sky-fade', hero),
    glowArm: $('.glow-arm', hero), warm: $('.glow-warm', hero), white: $('.glow-white', hero), moonGlow: $('.glow-moon', hero),
    lit: $('.ring-lit', hero), particles: $('.particles', hero),
    orbArm: $('.orb-arm', hero), orb: $('.orb', hero), moon: $('.moon', hero), sun: $('.sun', hero), halo: $('.sun-halo', hero), dash: $('.dash', hero),
    l1: $('.l1', hero), l2: $('.l2', hero), rot: $('#rot'), sub: $('.hero-sub', hero), cta: $('.cta-row', hero),
  };
  const still = state.reduced || state.lowPower;
  paintSky(el.canvas);

  // Fit the ring's dimming mask to the copy as it is now: headline, subline and the
  // button row together (the box changes with each word). Also measure what the ring
  // sizes itself by on short phones (--copy-b) and where the buttons sit for the sun.
  const h1 = el.l1.parentElement;
  const ringBox = $('.hero-ring', hero);
  // The buttons themselves (the row is full width; its children are the real targets).
  const ctaRect = () => {
    const rs = [...el.cta.children].map(n => n.getBoundingClientRect()).filter(r => r.width);
    if (!rs.length) return el.cta.getBoundingClientRect();
    return { left: Math.min(...rs.map(r => r.left)), top: Math.min(...rs.map(r => r.top)), right: Math.max(...rs.map(r => r.right)), bottom: Math.max(...rs.map(r => r.bottom)) };
  };
  let geo = null; // hero-relative: ring center and orbit, sun halo radius, button box
  const fitMask = () => {
    const hr = hero.getBoundingClientRect(), a = h1.getBoundingClientRect(), b = el.sub.getBoundingClientRect(), c = ctaRect();
    const range = document.createRange();
    const width = node => { range.selectNodeContents(node); return range.getBoundingClientRect().width; };
    const w = Math.max(width(el.l1), width(el.rot), width(el.sub), c.right - c.left);
    const top = a.top, bottom = c.bottom;
    hero.style.setProperty('--hl-rx', `${Math.round(w * 0.56 + 24)}px`);
    hero.style.setProperty('--hl-ry', `${Math.round((bottom - top) * 0.62)}px`);
    hero.style.setProperty('--hl-y', `${Math.round((top + bottom) / 2 - hr.top)}px`);
    // Layout offsets, so the intro's 8px fade-up on the subline never nudges the ring.
    const copyEl = el.sub.offsetParent;
    hero.style.setProperty('--copy-b', `${Math.round(hero.offsetHeight - (copyEl?.offsetTop || 0) - el.sub.offsetTop)}px`);
    const rb = ringBox.getBoundingClientRect();
    geo = {
      cx: rb.left + rb.width / 2 - hr.left, cy: rb.top + rb.height / 2 - hr.top, R: rb.width * 0.29167,
      halo: (el.sun?.offsetWidth || 24) * 3,
      cta: [c.left - hr.left, c.top - hr.top, c.right - hr.left, c.bottom - hr.top],
    };
  };
  // 1 when the sun's halo reaches within about 80px of the buttons (the 09:00 word puts the
  // sun right beside them), easing to 0 by 160px. The sun and halo fade there.
  const nearCta = H => {
    if (!geo) return 0;
    const ang = (H * Math.PI) / 12;
    const x = geo.cx + geo.R * Math.sin(ang), y = geo.cy - geo.R * Math.cos(ang);
    const [l, t, r, b] = geo.cta;
    const gap = Math.hypot(Math.max(l - x, 0, x - r), Math.max(t - y, 0, y - b)) - geo.halo;
    return 1 - smooth(80, 160, gap);
  };
  fitMask();
  new ResizeObserver(fitMask).observe(hero);
  document.fonts?.ready.then(fitMask);
  if (!still) buildParticles(el.particles, state.mobile ? 14 : 30);
  // Particles drift only inside the target window, and never while motion is paused.
  const particlesOn = s => !still && !state.paused && s.win > 0.02;

  // Every animated property is a function of the hour (H unwrapped, s = skyAt(H)).
  const deg = H => `rotate(${(H * 15).toFixed(3)}deg)`;
  const CH = [
    [el.canvas, 'transform', H => `translateX(${(-Math.min(H, SPAN_H) * PER_H * 100).toFixed(2)}%) scaleX(${COLS})`],
    [el.glowArm, 'transform', deg],
    [el.orbArm, 'transform', deg],
    [el.orb, 'transform', H => `rotate(${(-H * 15).toFixed(3)}deg)`],
    [el.sun, 'transform', (H, s) => `translateY(${sunDrop(s.rise).toFixed(2)}%)`],
    [el.sun, 'opacity', H => 1 - 0.4 * nearCta(H)],
    [el.stars, 'opacity', (H, s) => s.stars],
    [el.warm, 'opacity', (H, s) => s.warm],
    [el.white, 'opacity', (H, s) => s.white],
    [el.moonGlow, 'opacity', (H, s) => s.moonGlow],
    [el.scrim, 'opacity', (H, s, copy) => (state.mobile ? s.scrimM : s.scrim) * copy],
    // In daylight the ground fade lifts: fully open while the copy is hidden (the day pass), part
    // way under the copy, so the morning words sit on a cool haze. Night (and so the settled
    // hero, whose edge meets the page) keeps the full fade.
    [el.fade, 'opacity', (H, s, copy) => 1 - s.day * (copy ? FADE_LIFT.copy : FADE_LIFT.open)],
    [el.lit, 'opacity', (H, s) => s.win],
    [el.particles, 'opacity', (H, s) => (still ? 0 : s.win)],
    [el.moon, 'opacity', (H, s) => s.moon],
    [el.halo, 'opacity', (H, s) => s.rise * (1 - 0.7 * nearCta(H))],
    [el.dash, 'opacity', (H, s) => s.dash * 0.85],
  ].filter(c => c[0]);
  const fmtV = v => (typeof v === 'number' ? +v.toFixed(4) : v);

  // Static render: the settled hero follows the page clock (the moon moves with scroll).
  let lastH = -1;
  const render = H => {
    if (Math.abs(H - lastH) < 1e-4) return;
    lastH = H;
    const s = skyAt(wrap(H));
    for (const [node, prop, fn] of CH) node.style[prop] = fmtV(fn(H, s, 1));
    el.particles.classList.toggle('on', particlesOn(s));
  };
  const setGlow = hour => {
    const g = skyAt(hour).glow;
    el.rot.style.setProperty('--glow', cssA(g, 0.5));
    el.rot.style.setProperty('--glow2', cssA(g, 0.2));
  };

  // ---- Settled state (end of intro, skip, repeat visit, reduced motion) ----
  let settled = false, running = false, anims = [], raf = 0;
  const settle = () => {
    if (settled) return;
    settled = true; running = false;
    cancelAnimationFrame(raf);
    // Copy that was still hidden fades in quickly from wherever it was.
    const copy = [el.l1, el.l2, el.sub, el.cta];
    const from = copy.map(n => +getComputedStyle(n).opacity);
    root.classList.remove('hero-intro');
    root.classList.add('hero-settled');
    anims.forEach(a => a.cancel());
    anims = [];
    el.rot.textContent = 'medicine.';
    setGlow(0);
    fitMask();
    copy.forEach((n, i) => { if (from[i] < 0.99 && !state.reduced) n.animate([{ opacity: from[i] }, { opacity: 1 }], { duration: 320, easing: EASE_CSS }); });
    lastH = -1;
    render(state.T);
    state.clockOverride = null;
    state.introActive = false;
    try { localStorage.setItem(SEEN, '1'); } catch {}
    detach();
    emitTick();
    doneOnce();
  };

  onTick(st => { if (settled && st.T < 4) render(st.T); });

  // ---- Skip on any intent to read or move ----
  const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Spacebar', 'Home', 'End', 'Tab', 'Enter', 'Escape']);
  const onKey = e => { if (NAV_KEYS.has(e.key)) settle(); };
  const onScroll = () => { if (scrollY > 2) settle(); };
  const skipEvents = [['wheel', settle], ['touchmove', settle], ['pointerdown', settle], ['keydown', onKey], ['scroll', onScroll]];
  const attach = () => skipEvents.forEach(([t, fn]) => addEventListener(t, fn, { passive: true, capture: true }));
  const detach = () => skipEvents.forEach(([t, fn]) => removeEventListener(t, fn, { capture: true }));

  if (import.meta.env?.DEV) {
    // Debug hook for screenshots: __hero.at(hour, wordIndex) freezes a state.
    window.__hero = {
      settle,
      at(H, i = 3) {
        settle();
        el.rot.textContent = WORD_HOURS[i][0];
        setGlow(WORD_HOURS[i][1]);
        fitMask();
        state.clockOverride = wrap(H);
        lastH = -1;
        const s = skyAt(wrap(H));
        for (const [node, prop, fn] of CH) node.style[prop] = fmtV(fn(H, s, 1));
        el.particles.classList.toggle('on', particlesOn(s));
        settled = false; // keep scroll ticks from overwriting the frozen state
        emitTick();
        return { scrim: s.scrim, win: s.win };
      },
    };
  }

  // "Pause motion" (chrome sheet): the intro stops where it is and settles; particles hold.
  on('motion', () => {
    if (state.paused && !settled) { settle(); return; }
    if (settled) el.particles.classList.toggle('on', particlesOn(skyAt(wrap(lastH < 0 ? state.T : lastH))));
  });

  const introWanted = root.classList.contains('hero-intro') && !still && !state.paused && scrollY < 3;
  if (!introWanted) {
    clearTimeout(window.__heroFailsafe);
    requestAnimationFrame(settle); // after every module has subscribed to 'intro:done'
    return;
  }

  // ---- Intro ----
  const plan = buildPlan(state.mobile);
  attach();
  render(0);
  state.introActive = true;
  state.clockOverride = 0;
  emitTick();

  const start = () => {
    if (settled) return;
    // The failsafe in head-hero.html may already have shown the settled hero.
    if (!root.classList.contains('hero-intro')) { settle(); return; }
    clearTimeout(window.__heroFailsafe);
    window.__heroStarted = true;
    running = true;
    // Sample the schedule: dense while the hour moves, endpoints while it holds.
    const times = new Set([0, plan.total]);
    for (const s of plan.segs) {
      times.add(s.t0); times.add(s.t1);
      if (s.h1 !== s.h0) { const n = Math.ceil((s.t1 - s.t0) * 48); for (let k = 1; k < n; k++) times.add(s.t0 + ((s.t1 - s.t0) * k) / n); }
    }
    const ts = [...times].sort((a, b) => a - b);
    const copyOn = t => (t >= plan.line1 ? 1 : 0);
    const samples = ts.map(t => { const H = hourAt(plan, t); return [t, H, skyAt(wrap(H)), copyOn(t)]; });
    const dur = plan.total * 1000;
    const t0 = document.timeline.currentTime;
    for (const [node, prop, fn] of CH) {
      const frames = samples.map(([t, H, s, c]) => ({ [prop]: fmtV(fn(H, s, c)), offset: t / plan.total }));
      const a = node.animate(frames, { duration: dur, fill: 'forwards', easing: 'linear' });
      a.startTime = t0;
      anims.push(a);
    }
    // Copy: "Re-timing" lands as the night settles; the line and button follow the first word.
    // Each lands at its time on the schedule, or now if the font made it wait past that.
    const elapsed = () => Math.max(0, (document.timeline.currentTime - t0) / 1000);
    const land = (node, at, d = 700) => {
      const a = node.animate([{ opacity: 0, transform: 'translateY(.14em)' }, { opacity: 1, transform: 'none' }], { duration: d, delay: Math.max(at, elapsed()) * 1000, easing: EASE_CSS, fill: 'both' });
      a.startTime = t0; anims.push(a);
    };
    const fade = (node, at) => {
      const a = node.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: Math.max(at, elapsed()) * 1000, easing: EASE_CSS, fill: 'both' });
      a.startTime = t0; anims.push(a);
    };
    // The words wait for Instrument Serif (head-hero.html started loading it), up to 0.8 s
    // past the moment "Re-timing" is due; the sky and the clock never wait.
    let copyReady = false;
    const startCopy = () => {
      if (copyReady || settled) return;
      copyReady = true;
      land(el.l1, plan.line1, 760);
      fade(el.sub, plan.sub);
      fade(el.cta, Math.max(plan.sub, elapsed()) + 0.12);
    };
    if (serifReady()) startCopy();
    else {
      const cap = new Promise(r => setTimeout(r, (plan.line1 + 0.8) * 1000));
      Promise.race([window.__heroFonts || Promise.resolve(), cap]).then(startCopy, startCopy);
    }

    let wordIdx = -1;
    const swap = i => {
      const w = plan.words[i];
      setGlow(w.hour);
      if (i === 0) {
        el.rot.textContent = w.word;
        fitMask();
        land(el.l2, w.t, 700);
        return;
      }
      const out = el.rot.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-.07em)' }], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      anims.push(out);
      out.onfinish = () => {
        if (settled) return;
        el.rot.textContent = w.word;
        fitMask();
        const inn = el.rot.animate([{ opacity: 0, transform: 'translateY(.09em)' }, { opacity: 1, transform: 'none' }], { duration: 560, easing: EASE_CSS, fill: 'forwards' });
        anims.push(inn);
      };
    };

    const loop = now => {
      if (!running) return;
      if (state.lowPower) { settle(); return; }
      const t = Math.max(0, (now - t0) / 1000);
      const H = hourAt(plan, t);
      const s = skyAt(wrap(H));
      while (copyReady && wordIdx + 1 < plan.words.length && t >= plan.words[wordIdx + 1].t) swap(++wordIdx);
      // The day pass reads 00:00 to 24:00; from the first word on, the clock wraps.
      state.clockOverride = t < plan.words[0].t ? H : wrap(H);
      state.skyRGB = s.top.map(Math.round);
      el.particles.classList.toggle('on', particlesOn(s));
      emitTick();
      if (t >= plan.total) { settle(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  };

  // Any failure shows the settled hero; the intro must never hide the copy.
  const safeStart = () => { try { start(); } catch (e) { console.error('[hero] intro failed', e); settle(); } };
  // A tab opened in the background waits until someone can see it.
  if (document.hidden) {
    const vis = () => { if (!document.hidden) { removeEventListener('visibilitychange', vis); safeStart(); } };
    addEventListener('visibilitychange', vis);
  } else safeStart();

}

// ---- Sky texture: one column per 1/8 hour across two days, drawn once ----
function paintSky(canvas) {
  if (!canvas) return;
  canvas.width = COLS;
  canvas.height = ROWS;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(COLS, ROWS);
  for (let c = 0; c < COLS; c++) {
    const s = skyAt(wrap(c / PER_H));
    for (let y = 0; y < ROWS; y++) {
      const col = skyColor(s, (y + 0.5) / ROWS);
      const k = (y * COLS + c) * 4;
      img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---- Protein particles: a fixed pool along the window rods, CSS-animated ----
function buildParticles(box, n) {
  if (!box) return;
  const win = rods().filter(r => r.win);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const r = win[Math.floor((i / n) * win.length + rnd() * 2) % win.length];
    const arm = document.createElement('span');
    arm.className = 'p-arm';
    arm.style.transform = `rotate(${(r.deg + (rnd() - 0.5) * 2).toFixed(2)}deg)`;
    const p = document.createElement('span');
    p.className = 'p';
    p.style.setProperty('--dur', `${(2.2 + rnd() * 1.4).toFixed(2)}s`);
    p.style.setProperty('--delay', `${(-rnd() * 3).toFixed(2)}s`);
    p.style.setProperty('--dx', `${((rnd() - 0.5) * 26).toFixed(1)}px`);
    arm.appendChild(p);
    frag.appendChild(arm);
  }
  box.appendChild(frag);
}

// ---- Statement (02:00): words brighten as you read down; a dawn rises behind ----
function initStatement() {
  const sec = $('#statement');
  if (!sec) return;
  const line = $('.big-line', sec);
  const dawn = $('.statement-dawn i', sec);
  if (state.reduced) return; // final, readable state with a still glow
  const words = splitWords(line);
  gsap.fromTo(words, { opacity: 0.22 }, {
    opacity: 1, ease: 'none', stagger: 0.12,
    scrollTrigger: { trigger: sec, start: 'top 72%', end: 'center 56%', scrub: true },
  });
  gsap.fromTo(dawn, { yPercent: 40, opacity: 0 }, {
    yPercent: -8, opacity: 1, ease: 'none',
    scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom 35%', scrub: 0.4 },
  });
}
