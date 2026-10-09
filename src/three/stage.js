// Owner: 3D. The fixed stage: where the strand sits, how present it is, which figure it
// shows, the figure caption, and when (and whether) WebGL loads.
//
// Desktop: one fixed canvas on the right half. Per section it is hidden, receded (faint,
// smaller, parked right of the content column) or forward. Presence is a pure
// function of scroll position, so it never jumps when the current section changes: the
// strand comes forward only once the outgoing section's content has scrolled up past it,
// and goes back before the incoming section's content reaches it.
// Phones: the canvas rides inside whichever .fig-slot shows most of itself; every other
// slot shows the baked still as its background, so no slot is ever empty.
// Phones in low-power mode or with reduced motion get the poster still and never start
// WebGL. three.js loads lazily: never during the hero intro, then on idle or on approach.
import { state, onTick, on } from '../core/state.js';
import { fmt, WINDOW } from '../core/time.js';
import { BASES, N_BASES, N_CODONS, REGION_KEYS, REGION_LABELS, hourOf, FIT_H, FIT_W } from './helix-curve.js';
import { probePower } from './power.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const inWindow = h => { const x = ((h % 24) + 24) % 24; return x >= WINDOW[0] && x < WINDOW[1]; };

// [presence, figure] per section. #mrna is the strand's first beat ("mRNA is short-lived"),
// then anatomy and the dose step in Platform (on the daylight, in its day palette). Sections
// with nothing to say about the strand hide it: #why (body clock, disease timing), #care, the
// lab loop, and #business, whose big count fills the width.
const MODES = {
  top: ['hidden'], statement: ['hidden'],
  why: ['hidden'], mrna: ['forward', 'helix'],
  platform: ['forward', 'anatomy'], schedule: ['forward', 'protein'], care: ['hidden'], engine: ['hidden'],
  business: ['hidden'], team: ['recede', 'helix'],
  vision: ['forward', 'dial'], contact: ['forward', 'dial'],
};

// Receded: faint, smaller, parked right of the content column. No blur: a soft strand
// read as out of focus for the whole hand-over.
const RECEDE = { o: 0.2, blur: 0, s: 0.68 };
// Drawn extent of the strand around the canvas center, in world units (the helix with its
// cap, sway and perspective; the dial is smaller in every direction).
const EXT = { top: 3.95, bottom: 3.75, side: 2.15 };
const COL_GAP = 16; // px between the content column and the receded strand
const RAMP = 0.4;   // a hand-over runs over at least this much of the viewport height of scrolling

// Dev only (stripped from production): ?fig=helix|anatomy|protein|dial&t=14&ph=14&region=cds
// pins the stage forward for review stills.
const DEBUG = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
const DBG = DEBUG?.has('fig') ? {
  fig: DEBUG.get('fig'), t: +(DEBUG.get('t') ?? 14), ph: +(DEBUG.get('ph') ?? 14), region: DEBUG.get('region'),
} : null;

const CAPTIONS = {
  helix: ['Fig. 01 · mRNA strand', `${N_BASES} bases · ${N_CODONS} codons`],
  anatomy: ['Fig. 02 · Anatomy', ''],
  protein: ['Fig. 03 · Protein in its window', ''],
  dial: ['Fig. 04 · 24-hour dial', ''],
};

export function initStage() {
  const stage = $('.stage');
  const inner = $('.stage-inner');
  const canvas = $('#gl');
  const hud = $('.hud');
  const hudName = $('#hud-name'), hudSub = $('#hud-sub');
  if (!stage || !inner || !canvas) return;
  const home = inner.parentElement;
  const root = document.documentElement;
  const phoneMQ = matchMedia('(max-width: 999px)');
  let phone = phoneMQ.matches;
  const secs = $$('main .sec[id]').filter(el => MODES[el.id]);
  const slots = $$('.fig-slot');
  const slotFig = new Map(slots.map(sl => [sl, MODES[sl.closest('.sec[id]')?.id]?.[1] || 'helix']));
  const visionSlot = slots.find(sl => sl.closest('#vision'));
  Object.assign(state.stage, { mode: 'hidden', fig: 'helix', presence: 0, forward: 0 });

  let fig = 'helix';
  let morph = 0;
  let host = null;          // phone: the slot holding the canvas
  let hostVisible = false;
  let pendingHost = null;   // phone: drop the new host's still once the canvas has drawn in it
  let lastStyle = '';
  let hidUntil = 0;         // keep rendering while the fade-out runs
  const still = () => state.reduced || state.paused;

  // ---------- Desktop geometry (measured on layout and resize) ----------
  const box = el => (el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el);
  let geo = null;
  const pads = new Map();
  const measure = () => {
    const vw = innerWidth, vh = innerHeight || 1;
    // The inner box at rest (offsets ignore the transform).
    const W = inner.offsetWidth || vw * 0.52, H = inner.offsetHeight || vh;
    const top = inner.offsetTop, left = inner.offsetLeft || vw - W;
    const ppw = Math.min(H / 2 / FIT_H, W / 2 / FIT_W);
    const cx = left + W / 2, cy = top + H / 2;
    // Right edge of the content column: 50vw + maxw/2 - gutter, read from a .wrap.
    let colRight = vw;
    const wrap = $('main .wrap');
    if (wrap) {
      const r = wrap.getBoundingClientRect();
      colRight = r.right - (parseFloat(getComputedStyle(wrap).paddingRight) || 0);
    }
    const half = EXT.side * ppw * RECEDE.s;
    const edge = colRight + COL_GAP;
    const room = vw - edge;
    geo = {
      vh,
      head: top,
      // Receded: the strand's left edge sits just past the column. Where the margin is too
      // narrow to show most of it (1440 and below), the receded strand is simply not shown.
      txR: Math.max(0, edge - (cx - half)),
      roomV: smooth((room - 1.2 * half) / (0.8 * half)),
      upStart: cy - EXT.top * ppw * RECEDE.s,       // receded strand's top
      downEnd: cy + EXT.bottom * ppw * RECEDE.s,    // receded strand's bottom
    };
    pads.clear();
    for (const el of secs) {
      const cs = getComputedStyle(el);
      pads.set(el, [parseFloat(cs.paddingTop) || 0, parseFloat(cs.paddingBottom) || 0]);
    }
  };

  // ---------- Presence (desktop) ----------
  const vals = id => {
    const [m, fg] = MODES[id] || MODES.top;
    return {
      f: m === 'forward' ? 1 : 0,
      v: m === 'forward' ? 1 : m === 'recede' ? geo.roomV : 0,
      dial: fg === 'dial' ? 1 : 0,
      fig: fg || null,
    };
  };
  const opac = p => p.v * (RECEDE.o + (1 - RECEDE.o) * p.f);
  // How far the hand-over from section A to the next section B has gone: 0 all A, 1 all B,
  // null when the pair only swaps the figure (it swaps where the current section changes).
  const pairW = (A, B) => {
    const a = vals(A.id), b = vals(B.id);
    const oa = opac(a), ob = opac(b);
    if (Math.abs(oa - ob) < 0.002 && a.f === b.f && a.dial === b.dial) return null;
    let w;
    if (ob > oa || (ob === oa && (b.f > a.f || b.dial > a.dial))) {
      // Coming forward (or in): starts once A's last content has scrolled above the receded
      // strand's top, and is complete as that content goes under the header. The strand's
      // top rises slower than the content, so the two never meet.
      // Once that content is gone the strand is free, so the ramp runs on a little past it.
      const cb = box(A).getBoundingClientRect().bottom - (pads.get(A)?.[1] || 0);
      const span = geo.upStart - geo.head;
      w = smooth((geo.upStart - cb) / Math.max(1, span + Math.max(0, RAMP * geo.vh - span)));
    } else {
      const r = box(B).getBoundingClientRect();
      if (B.dataset.tone === 'light' || ob < 0.002) {
        // Into cream noon, or into a section without the strand: gone by the time the
        // section's top is a fifth of the way up the screen.
        w = smooth((geo.vh - r.top) / (0.22 * geo.vh));
      } else {
        // Going back (or out): starts while B's first content is still below the fold, and is
        // complete before that content reaches the receded strand's bottom.
        const ct = r.top + (pads.get(B)?.[0] || 0);
        const span = geo.vh - geo.downEnd, lead = Math.max(0, RAMP * geo.vh - span);
        w = smooth((geo.vh + lead - ct) / Math.max(1, span + lead));
      }
    }
    // Reduced motion: no scroll-linked movement, the state switches halfway.
    return state.reduced ? (w >= 0.5 ? 1 : 0) : w;
  };
  const mix = (x, y, w) => ({
    f: x.f + (y.f - x.f) * w,
    v: x.v + (y.v - x.v) * w,
    dial: x.dial + (y.dial - x.dial) * w,
    fig: (w >= 0.5 ? y.fig : x.fig) || x.fig || y.fig,
  });
  const desktopPresence = () => {
    if (!geo) measure();
    let ci = secs.findIndex(el => el.id === state.section);
    if (ci < 0) ci = 0;
    const cur = secs[ci], prev = secs[ci - 1], next = secs[ci + 1];
    let p = vals(cur.id);
    if (prev) { const w = pairW(prev, cur); if (w != null && w < 1) p = mix(vals(prev.id), p, w); }
    if (next) { const w = pairW(cur, next); if (w != null && w > 0) p = mix(p, vals(next.id), w); }
    return p;
  };

  const applyDesktop = (f, v) => {
    const o = v * (RECEDE.o + (1 - RECEDE.o) * f);
    const blur = (1 - f) * RECEDE.blur;
    const x = (1 - f) * geo.txR;
    const s = RECEDE.s + (1 - RECEDE.s) * f;
    const key = `${o.toFixed(3)}|${blur.toFixed(2)}|${x.toFixed(1)}|${s.toFixed(3)}`;
    if (key === lastStyle) return o;
    lastStyle = key;
    inner.style.opacity = o.toFixed(3);
    inner.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0) scale(${s.toFixed(3)})`;
    inner.style.filter = blur > 0.05 && o > 0.005 ? `blur(${blur.toFixed(2)}px)` : 'none';
    return o;
  };

  // ---------- Phones: the canvas lives inside the slot that shows most of itself ----------
  // Visibility counts only what is below the header. The canvas moves when another slot
  // shows clearly more of itself (1.25x), without waiting for the host to leave; when no
  // slot is on screen it waits in the nearest one.
  const HYST = 1.25;
  const topbar = $('#topbar');
  const headBottom = () => Math.max(0, topbar?.getBoundingClientRect().bottom || 0);
  const slotVis = (sl, top = headBottom()) => {
    const r = sl.getBoundingClientRect();
    return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, top));
  };
  const pickSlot = () => {
    const vh = innerHeight;
    const top = headBottom();
    let best = null, bestV = 0, near = null, nearD = Infinity, hostV = 0;
    for (const sl of slots) {
      const r = sl.getBoundingClientRect();
      if (!r.height) continue;
      const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, top));
      if (vis > bestV) { bestV = vis; best = sl; }
      if (sl === host) hostV = vis;
      const d = r.top > vh ? r.top - vh : r.bottom < top ? top - r.bottom : 0;
      if (d < nearD) { nearD = d; near = sl; }
    }
    return { best, bestV, near, hostV };
  };
  const moveTo = sl => {
    host?.classList.remove('is-host');
    host = sl;
    sl.appendChild(inner);
    lastSig = '';
    if (scene) {
      scene.resize(); // size for the new slot now, so the next frame draws at the right size
      pendingHost = sl;
    } else sl.classList.add('is-host');
  };

  const layout = () => {
    phone = phoneMQ.matches;
    lastStyle = '';
    geo = null;
    pendingHost = null;
    host?.classList.remove('is-host');
    host = null;
    if (phone) {
      inner.style.opacity = inner.style.transform = inner.style.filter = '';
    } else if (inner.parentElement !== home) home.appendChild(inner);
    tick();
  };

  // ---------- Caption ----------
  let capName = '', capSub = '', hudOn = false;
  const setHud = (show, f) => {
    if (show !== hudOn) { hudOn = show; hud?.classList.toggle('on', show); }
    if (!show) return;
    let [name, sub] = CAPTIONS[f] || CAPTIONS.helix;
    if (f === 'anatomy') {
      const k = REGION_KEYS.reduce((a, b) => ((state.region[b] || 0) > (state.region[a] || 0) ? b : a), REGION_KEYS[0]);
      sub = (state.region[k] || 0) > 0.5 ? REGION_LABELS[k] : 'Five regions, 5′ to 3′';
    } else if (f === 'protein') {
      const h = state.protein.hour;
      sub = `${fmt(((h % 24) + 24) % 24)} · ${inWindow(h) ? 'in the window: ribosomes making protein' : 'outside the window: ribosomes off'}`;
    } else if (f === 'dial') {
      sub = `lit to ${fmt(clamp(state.dial.progress) * 24)}`;
    }
    if (name !== capName) { capName = name; hudName.textContent = name; }
    if (sub !== capSub) { capSub = sub; hudSub.textContent = sub; }
  };

  // ---------- Scroll tick: presence, figure, morph, dial progress ----------
  function tick() {
    if (!DBG) state.dial.progress = clamp(state.T / 24);
    const vh = innerHeight || 1;
    if (phone) {
      const { best, bestV, near, hostV } = pickSlot();
      let want = host;
      if (!host) want = best || near;
      else if (best && best !== host && bestV > hostV * HYST) want = best;
      else if (!best && hostV <= 0 && near && near !== host) want = near;
      if (want && want !== host) moveTo(want);
      hostVisible = host ? slotVis(host) > 0 : false;
      // One strand on screen at a time: while the live strand shows, every other slot's
      // still fades out, so two strands never stack up in one view.
      for (const sl of slots) sl.classList.toggle('is-quiet', sl !== host && hostVisible);
      fig = host ? slotFig.get(host) : 'helix';
      // The ring is already closed into a dial before its slot comes on screen: the morph
      // runs while the vision slot (a zero-height marker above the ring's slot) is still
      // below the fold.
      const mark = visionSlot || (fig === 'dial' ? host : null);
      const top = mark ? mark.getBoundingClientRect().top / vh : 2;
      morph = fig === 'dial' ? (state.reduced ? 1 : smooth((1.6 - top) / 0.4)) : 0;
      state.stage.mode = hostVisible ? 'forward' : 'hidden';
      state.stage.presence = hostVisible ? 1 : 0;
      state.stage.forward = hostVisible ? 1 : 0;
    } else {
      let f = 1, v = 1;
      if (DBG) {
        if (!geo) measure();
        fig = DBG.fig;
        morph = DBG.fig === 'dial' ? 1 : 0;
      } else {
        const p = desktopPresence();
        f = p.f; v = p.v;
        morph = state.reduced ? (p.dial >= 0.5 ? 1 : 0) : clamp(p.dial);
        fig = morph > 0.5 ? 'dial' : (p.fig || fig);
      }
      const o = applyDesktop(f, v);
      if (o < 0.01 && state.stage.presence >= 0.01) hidUntil = performance.now() + 400;
      state.stage.presence = o;
      state.stage.forward = f;
      state.stage.mode = o < 0.01 ? 'hidden' : f > 0.6 ? 'forward' : 'recede';
      setHud(o > 0.5 && f > 0.6, fig);
    }
    state.stage.fig = fig;
    state.form.dial = morph;
    if (inner.dataset.fig !== fig) inner.dataset.fig = fig;
    if (inner.dataset.mode !== state.stage.mode) inner.dataset.mode = state.stage.mode;
    if (phone || state.stage.presence < 0.01 || morph > 0.05) state.regionScreen = null;
    poster.update();
    wake();
  }

  // ---------- Poster still (shows while WebGL loads, and stays when WebGL never starts) ----------
  const poster = (() => {
    const dialRods = $$('.poster-dial .pr', inner);
    const rodHours = BASES.map(b => hourOf(b.t));
    const litArc = $('.poster-dial .pd-lit', inner);
    const mark = $('.poster-dial .pd-mark', inner);
    const glyph = $('.poster-dial .pd-glyph', inner);
    const markR = glyph ? +glyph.dataset.r : 0;
    let lastLit = -1, lastRegion = '', lastLive = '', lastMark = '';
    return {
      update() {
        // Region lighting via CSS variables (anatomy).
        const rk = REGION_KEYS.map(k => clamp(state.region[k] || 0).toFixed(2)).join(',');
        if (rk !== lastRegion) {
          lastRegion = rk;
          REGION_KEYS.forEach(k => inner.style.setProperty(`--r-${k}`, clamp(state.region[k] || 0).toFixed(2)));
        }
        const live = state.protein.on > 0.5 && inWindow(state.protein.hour) ? '1' : '0';
        if (live !== lastLive) { lastLive = live; inner.dataset.live = live; }
        // Dial: rods lit from 00:00 to the hour, the arc, and the sun or moon.
        const lit = clamp(state.dial.progress) * 24;
        const litR = Math.round(lit * 40) / 40;
        if (litR !== lastLit && dialRods.length) {
          lastLit = litR;
          dialRods.forEach((el, i) => el.classList.toggle('on', rodHours[i] <= lit));
          litArc?.setAttribute('stroke-dasharray', `${(lit / 24 * 100).toFixed(2)} 100`);
        }
        const clock = state.clockOverride ?? state.T;
        const h = ((clock % 24) + 24) % 24;
        const kind = Math.abs(h - 6) < 0.5 || Math.abs(h - 18) < 0.5 ? 'rise' : h >= 6 && h < 18 ? 'sun' : 'moon';
        const mk = `${kind}|${clock.toFixed(2)}`;
        if (mark && mk !== lastMark) {
          lastMark = mk;
          mark.dataset.kind = kind;
          const deg = ((clock / 24) * 360).toFixed(2);
          mark.setAttribute('transform', `rotate(${deg})`);
          // Keep the glyph upright as its arm turns.
          glyph?.setAttribute('transform', `translate(0 ${-markR}) rotate(${-deg})`);
        }
      },
    };
  })();

  // ---------- WebGL ----------
  let scene = null;
  let rafId = 0;
  let lastFrame = 0;
  let lastSig = '';
  let glReady = false;
  // Fog color: the page light right now (chrome/sky.js keeps state.skyRGB current).
  const bgRGB = [7, 9, 15];
  const readBg = () => {
    const c = state.stageRGB || state.skyRGB;
    if (c && c.length >= 3) { bgRGB[0] = +c[0]; bgRGB[1] = +c[1]; bgRGB[2] = +c[2]; }
    return bgRGB;
  };

  const visibleNow = () => (phone ? hostVisible : state.stage.presence > 0.01 || performance.now() < hidUntil);
  const shouldRender = () => {
    if (document.hidden) return false;
    if (DBG && scene) return true;
    if (!scene) {
      // Poster only: follow region and playhead changes while a lit figure is on screen
      // (a value sync, not an animation, so it runs under reduced motion too).
      return (fig === 'anatomy' || fig === 'protein') && visibleNow();
    }
    return visibleNow();
  };

  const view = {
    morph: 0, region: state.region, protein: state.protein, dialProgress: 0, clock: 0,
    reduced: state.reduced, paused: false, bg: bgRGB, throttled: false, day: 0,
  };

  function loop(now) {
    rafId = 0;
    if (!shouldRender()) return;
    rafId = requestAnimationFrame(loop);
    if (!scene) { poster.update(); return; }
    if (DBG) {
      state.T = DBG.t;
      state.protein.on = DBG.fig === 'protein' ? 1 : 0;
      state.protein.hour = DBG.ph;
      REGION_KEYS.forEach(k => { state.region[k] = DBG.region === k || DBG.region === 'all' ? 1 : 0; });
      state.dial.progress = DBG.t / 24;
    }
    view.morph = morph;
    view.dialProgress = state.dial.progress;
    view.clock = state.clockOverride ?? state.T;
    view.bg = readBg();
    view.day = state.dayLight || 0;
    view.paused = state.paused;
    // Receded: a lower frame rate is plenty.
    const receded = !phone && state.stage.forward < 0.4;
    view.throttled = receded;
    if (receded && now - lastFrame < 40) return;
    // Reduced motion or paused: draw only when something changed (no idle sway).
    if (still()) {
      const r = state.region;
      const sig = `${morph.toFixed(3)}|${r.cap},${r.utr5},${r.cds},${r.utr3},${r.polyA}|${state.protein.on.toFixed(2)}|${state.protein.hour.toFixed(2)}|${view.dialProgress.toFixed(4)}|${view.clock.toFixed(3)}|${bgRGB.join(',')}|${view.day.toFixed(3)}|${canvas.clientWidth}x${canvas.clientHeight}`;
      if (sig === lastSig && glReady) return;
      lastSig = sig;
    }
    lastFrame = now;
    scene.frame(now, view);
    if (!glReady) { glReady = true; document.body.classList.add('gl-ready'); }
    if (pendingHost) { pendingHost.classList.add('is-host'); pendingHost = null; }
    // Leader-line anchors for the anatomy labels (desktop, while the strand is a helix).
    if (!phone && state.stage.presence > 0.01 && morph < 0.05) {
      state.regionScreen = scene.regionScreen(canvas.getBoundingClientRect());
    } else if (state.regionScreen) state.regionScreen = null;
    setHudLive();
  }
  // The protein caption follows the playhead every frame.
  let hudFig = '';
  const setHudLive = () => {
    if (phone || !hudOn) return;
    if (fig === 'protein' || fig === 'anatomy' || hudFig !== fig) { hudFig = fig; setHud(true, fig); }
  };

  // Which region of the strand is under a viewport point (click-to-light in the anatomy), or null.
  // Live strand: the scene projects it. Poster still: the nearest baked shape, whose classes
  // k0..k4 follow REGION_KEYS.
  state.pickRegion = (x, y) => {
    if (fig !== 'anatomy' || state.stage.presence < 0.5 || morph > 0.05) return null;
    if (scene && glReady) return scene.pickRegion(canvas.getBoundingClientRect(), x, y);
    let best = null, bd = Infinity, y0 = Infinity, y1 = -Infinity;
    for (const el of inner.querySelectorAll('.poster-helix [class*="k"]')) {
      const m = /\bk([0-4])\b/.exec(el.getAttribute('class'));
      const r = el.getBoundingClientRect();
      if (!m || !r.width) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      const d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; best = REGION_KEYS[+m[1]]; }
    }
    return bd <= Math.max(24, 0.05 * (y1 - y0)) ? best : null;
  };

  function wake() {
    if (!rafId && shouldRender()) rafId = requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', wake);
  phoneMQ.addEventListener?.('change', layout);
  addEventListener('resize', () => { geo = null; lastStyle = ''; tick(); });
  document.fonts?.ready.then(() => { geo = null; tick(); });
  onTick(tick);
  on('section', tick);
  // "Pause motion": the loop stops drawing once the held frame is up; resuming wakes it.
  on('motion', () => { lastSig = ''; wake(); });

  // ---------- Loading ----------
  let started = false;
  const posterOnly = () => (phone && (state.reduced || state.lowPower)) || !('WebGL2RenderingContext' in window);
  const powerReady = new Promise(resolve => {
    const go = () => probePower().then(resolve);
    if (document.readyState === 'complete') setTimeout(go, 300);
    else addEventListener('load', () => setTimeout(go, 300), { once: true });
  });

  async function boot() {
    // Never during the hero intro: 'intro:done' boots on idle once it settles.
    if (started || state.introActive) return;
    started = true;
    await powerReady;
    if (DEBUG?.has('lowpower')) state.lowPower = true; // dev: test the still path on a phone
    if (posterOnly() && !DBG) { inner.classList.add('is-still'); wake(); return; }
    let mod;
    try { mod = await import('./scene.js'); } catch (e) { console.warn('[stage] 3D failed to load', e); return; }
    try {
      scene = mod.initScene(canvas, state, { phone });
    } catch (e) {
      console.warn('[stage] WebGL off:', e);
      inner.classList.add('is-still');
      scene = null;
      wake();
      return;
    }
    await scene.ready;
    if (DBG) {
      // Review stills: hide the page content so the model reads on its own.
      if (DEBUG.has('solo')) { const m = $('main'); if (m) m.style.visibility = 'hidden'; }
      $$('.poster', inner).forEach(p => { p.style.display = 'none'; });
      if (!phone) { inner.style.transition = 'none'; inner.style.opacity = '1'; }
    }
    lastSig = '';
    tick();
    wake();
  }

  // Start on idle once the intro has settled, or earlier when the reader approaches #care
  // (never while the intro runs). Phones use a tighter approach and need a real scroll.
  const idle = (fn, timeout = 2000) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 200));
  const why = $('#care');
  if (why && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      if (state.introActive || (phone && scrollY <= 0)) return;
      if (es.some(e => e.isIntersecting || e.boundingClientRect.top < 0)) { io.disconnect(); boot(); }
    }, { rootMargin: phone ? '0px 0px 25% 0px' : '0px 0px 80% 0px' });
    io.observe(why);
  }
  on('intro:done', () => idle(boot));
  on('section', id => { if (id !== 'top') boot(); });
  if (DBG || scrollY > innerHeight * 0.5) boot();
  // Fallback when no intro runs (repeat visits, reduced motion, a deep link).
  if (!root.classList.contains('hero-intro')) {
    const late = () => setTimeout(() => idle(boot), 3500);
    if (document.readyState === 'complete') late(); else addEventListener('load', late, { once: true });
  }

  layout();
}
