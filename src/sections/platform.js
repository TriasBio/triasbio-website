// Owner: platform. 06:00 anatomy steps (drive state.region), 07:00 dose chart (drives
// state.protein), 09:00 lab loop (moves while on screen; holds still when the reader pauses motion).
import { gsap } from 'gsap';
import { state, on, onTick } from '../core/state.js';
import { WINDOW, TOX, PEAK, expression, untimed, fmt } from '../core/time.js';
import { EASE, DUR } from '../core/motion.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const NS = 'http://www.w3.org/2000/svg';
const KEYS = ['cap', 'utr5', 'cds', 'utr3', 'polyA'];
const phoneMQ = matchMedia('(max-width: 999px)');
const headerH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
const inBand = (h, [a, b]) => h >= a && h < b;

function svgEl(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent?.appendChild(n);
  return n;
}

// Run fn(dt) on every frame while el is near the viewport; dt is seconds since the last
// frame (0 on the first frame after a start, so a loop resumes without a jump).
// { motion: true } marks an ambient loop: it also holds still while the reader has
// paused motion (state.paused, the "Pause motion" toggle) and resumes on 'motion'.
function whileVisible(el, fn, margin = '100px', { motion = false } = {}) {
  let visible = false, running = false, last = 0;
  const tick = () => {
    const now = gsap.ticker.time;
    const dt = last ? Math.min(0.1, now - last) : 0;
    last = now;
    fn(dt);
  };
  const sync = () => {
    const want = visible && !(motion && state.paused);
    if (want === running) return;
    running = want;
    last = 0;
    if (want) gsap.ticker.add(tick); else gsap.ticker.remove(tick);
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { rootMargin: margin }).observe(el);
  if (motion) on('motion', sync);
}

export function initPlatform() {
  for (const [name, fn] of [['anatomy', initAnatomy], ['chart', initChart], ['engine', initEngine]]) {
    try { fn(); } catch (e) { console.error(`[platform] ${name}`, e); }
  }
}

/* ---------------------------------------------------------------------------
   06:00 Anatomy. Five scroll steps; the active one lights its stretch of the strand.
   Desktop: the step list is sticky (CSS) and the active step follows progress through
   the track. Phone and narrow windows: the strand's slot is sticky in the right column;
   the step crossing the reading line on the left is active. Scrolling back reverses; nothing is time-based.
--------------------------------------------------------------------------- */
function initAnatomy() {
  const anat = $('#anat');
  if (!anat) return;
  const pin = $('.anat-pin', anat);
  const steps = $$('.anat-step', anat);
  const heads = steps.map(s => $('h3', s));
  const leaders = $('.anat-leaders');
  const ldLine = leaders && $('.ld-line', leaders);
  const ldDot = leaders && $('.ld-dot', leaders);
  const ldRing = leaders && $('.ld-ring', leaders);
  const ldStart = leaders && $('.ld-start', leaders);
  let drawn = -1; // the step the line was last drawn in for
  let active = -2;
  let tween = null;

  const setRegions = idx => {
    const target = {};
    // Active region full, regions already explained stay faintly lit, the rest dark.
    KEYS.forEach((k, i) => { target[k] = idx < 0 ? 0 : i === idx ? 1 : i < idx ? 0.25 : 0; });
    tween?.kill();
    if (state.reduced) { Object.assign(state.region, target); state.dirty = true; return; }
    tween = gsap.to(state.region, { ...target, duration: DUR.m, ease: EASE, onUpdate: () => { state.dirty = true; } });
  };

  const setActive = idx => {
    if (idx === active) return;
    active = idx;
    steps.forEach((s, i) => {
      s.classList.toggle('is-on', i === idx);
      s.classList.toggle('is-seen', idx >= 0 && i < idx);
      if (i === idx) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
    });
    anat.dataset.step = String(idx);
    setRegions(idx);
  };

  const indexDesktop = () => {
    const r = anat.getBoundingClientRect();
    const hh = headerH();
    const pinH = pin.offsetHeight;
    if (r.top > innerHeight * 0.62 || r.bottom < hh + pinH * 0.4) return -1;
    const p = clamp((hh - r.top) / Math.max(1, r.height - pinH));
    return Math.min(4, Math.floor(p * 5 + 0.12));
  };

  // Phone and narrow windows: the strand is pinned in the right column, so a step takes over when
  // its top crosses a line 45% of the way down the screen under the header.
  const phoneLine = () => { const hh = headerH(); return hh + (innerHeight - hh) * 0.45; };
  const indexPhone = () => {
    const pr = pin.getBoundingClientRect();
    if (pr.bottom < headerH() + 80 || pr.top > innerHeight) return -1;
    const line = phoneLine();
    let idx = -1;
    steps.forEach((s, i) => { if (s.getBoundingClientRect().top < line) idx = i; });
    return idx;
  };

  // Desktop: a leader from the active label to its region on the strand. It runs as an
  // elbow that stays outside the strand: across to just left of the strand, down or up to
  // the region's height, then a short tick that stops 10px short of the region's dot.
  // Hidden when the region is behind the header or too far from its label to read as one.
  const leader = () => {
    if (!leaders) return;
    const rs = state.regionScreen;
    const pt = active >= 0 && rs && rs[KEYS[active]];
    const hide = () => { leaders.classList.remove('on'); drawn = -1; };
    if (phoneMQ.matches || !pt) return hide();
    const h = heads[active].getBoundingClientRect();
    const sx = h.right + 14;
    const sy = h.top + h.height / 2;
    const [tx, ty] = pt;
    // The strand's left edge: its leftmost region point, less about half the helix's
    // width (which scales with the strand's on-screen length).
    const pts = KEYS.map(k => rs[k]).filter(Boolean);
    const ys = pts.map(p => p[1]);
    const half = 0.1 * (Math.max(...ys) - Math.min(...ys)) + 8;
    const vx = Math.min(...pts.map(p => p[0])) - half - 24;
    const hh = headerH();
    if (ty < hh + 8 || ty > innerHeight - 8 || sy < hh || Math.abs(ty - sy) > innerHeight * 0.4
      || vx < sx + 24 || tx - 10 < vx + 6) return hide();
    ldLine.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} H${vx.toFixed(1)} V${ty.toFixed(1)} H${(tx - 10).toFixed(1)}`);
    for (const c of [ldDot, ldRing]) { c.setAttribute('cx', tx.toFixed(1)); c.setAttribute('cy', ty.toFixed(1)); }
    ldStart.setAttribute('cx', sx.toFixed(1));
    ldStart.setAttribute('cy', sy.toFixed(1));
    // A new step: draw the line in again from its label.
    if (drawn !== active && !state.reduced) {
      ldLine.classList.add('reset');
      ldLine.getBoundingClientRect();
      ldLine.classList.remove('reset');
    }
    drawn = active;
    leaders.classList.add('on');
  };

  // Click a step: scroll to where that step is the active one, so clicking and scrolling
  // always agree. The step lights at once and holds while the page travels, so the steps
  // in between do not flash; any wheel, touch or key from the reader hands control back.
  let held = -1, heldUntil = 0;
  const release = () => { held = -1; };
  const targetY = i => {
    // Phone: put the step's top just above the line where it takes over (see indexPhone).
    if (phoneMQ.matches) return scrollY + steps[i].getBoundingClientRect().top - (phoneLine() - 40);
    // The middle of step i's stretch of the pinned scroll (see indexDesktop).
    const r = anat.getBoundingClientRect();
    const p = (i + 0.38) / 5;
    return scrollY + r.top - headerH() + p * Math.max(1, r.height - pin.offsetHeight);
  };
  const go = i => {
    held = i; heldUntil = performance.now() + 1600;
    setActive(i);
    window.scrollTo({ top: Math.round(targetY(i)), behavior: state.reduced ? 'auto' : 'smooth' });
  };
  ['wheel', 'touchstart', 'keydown'].forEach(t => addEventListener(t, e => {
    if (held >= 0 && !(t === 'keydown' && e.target.closest?.('.anat-btn'))) release();
  }, { passive: true }));
  steps.forEach((s, i) => {
    // The heading becomes a button (keyboard and screen readers); the whole step is a target.
    const h = heads[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'anat-btn';
    b.append(...h.childNodes);
    h.append(b);
    s.addEventListener('click', e => {
      if (e.target.closest('a') || getSelection()?.toString()) return;
      go(i);
    });
  });

  // Click the strand itself: light the region under the pointer, the same as clicking its step.
  // The strand sits under the page content, so the page asks the stage what is under the point.
  const onAnat = () => { const r = anat.getBoundingClientRect(); return r.bottom > headerH() && r.top < innerHeight; };
  const strandAt = e => {
    if (!onAnat() || e.target.closest('a, button, input, label, header, .anat-step, #topbar, #sheet')) return -1;
    const k = state.pickRegion?.(e.clientX, e.clientY);
    return k ? KEYS.indexOf(k) : -1;
  };
  addEventListener('click', e => {
    const i = strandAt(e);
    if (i >= 0 && !getSelection()?.toString()) go(i);
  });
  // A pointer cursor over the strand says it can be clicked.
  let hoverOn = false;
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const on = strandAt(e) >= 0;
    if (on !== hoverOn) { hoverOn = on; document.documentElement.classList.toggle('strand-hover', on); }
  }, { passive: true });

  const update = () => {
    const idx = phoneMQ.matches ? indexPhone() : indexDesktop();
    // Holding a clicked step: let go once the scroll lands on it (or after a moment).
    if (held >= 0 && (idx === held || performance.now() > heldUntil)) release();
    setActive(held >= 0 ? held : idx);
    leader();
  };
  phoneMQ.addEventListener?.('change', update);
  whileVisible(anat, update, '200px');
  // When the anatomy leaves view, hand the strand back unlit.
  new IntersectionObserver(([e]) => { if (!e.isIntersecting) { setActive(-1); leaders?.classList.remove('on'); } }).observe(anat);
  update();
}

/* ---------------------------------------------------------------------------
   07:00 Dose chart. Drawn in real CSS pixels (viewBox = rendered size), so labels
   render at exactly 12px desktop / 11px phone. A playhead loops the day and drives
   state.protein.hour; the dose marker sweeps the day once on first view.
--------------------------------------------------------------------------- */
function initChart() {
  const sec = $('#schedule');
  const svg = $('#chart-svg');
  const box = $('.plot');
  const input = $('#dose');
  const readout = $('.readout');
  if (!svg || !box || !input) return;
  const phHour = $('#ph-hour'), phState = $('#ph-state'), phStatus = $('.ph-status');

  const DAY_S = 9.6;                   // seconds per looped day on the playhead
  let dose = +input.value;
  let hour = state.reduced ? PEAK : 6;
  let G = null;                        // geometry + element refs, rebuilt on resize
  let lastLive = null;

  // Where the untimed peak lands. The readout reserves the height of its longest form
  // (hidden copies stacked in the same grid cell), so the sweep never reflows the page.
  const WHERE = {
    tox: 'inside the toxicity-sensitive window',
    win: 'inside the target window, only because of the dose hour',
    out: 'outside the target window',
  };
  const whereEl = $('#r-u-where');
  const liveP = whereEl?.closest('p');
  if (liveP?.parentElement?.classList.contains('ro-stack')) {
    for (const text of Object.values(WHERE)) {
      const g = liveP.cloneNode(true);
      g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      g.querySelector('.ro-where').textContent = text;
      g.className = 'ro-ghost';
      g.setAttribute('aria-hidden', 'true');
      liveP.parentElement.appendChild(g);
    }
  }

  const build = () => {
    const W = Math.round(box.clientWidth);
    if (!W) return;
    // Narrow plots get a fixed 340px height so the plot area stays at least 260px tall.
    const H = W < 560 ? 340 : Math.round(clamp(W * 0.52, 330, 390));
    const fs = phoneMQ.matches ? 11 : 12;        // rendered px: 12 desktop, 11 phone (viewBox = CSS px)
    const X0 = fs + 7, X1 = W - 1, Y0 = 34, Y1 = H - 34;
    const xs = h => X0 + (h / 24) * (X1 - X0);
    const ys = v => Y1 - v * (Y1 - Y0 - 30);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.style.setProperty('--cfs', `${fs}px`);
    svg.replaceChildren();

    const defs = svgEl('defs', {}, svg);
    const clip = svgEl('clipPath', { id: 'pf-tox-clip' }, defs);
    svgEl('rect', { x: xs(TOX[0]), y: 0, width: xs(TOX[1]) - xs(TOX[0]), height: H }, clip);

    svgEl('rect', { class: 'band-win', x: xs(WINDOW[0]), y: Y0, width: xs(WINDOW[1]) - xs(WINDOW[0]), height: Y1 - Y0 }, svg);
    svgEl('rect', { class: 'band-tox', x: xs(TOX[0]), y: Y0, width: xs(TOX[1]) - xs(TOX[0]), height: Y1 - Y0 }, svg);
    const axis = [];
    const half = fs * 1.55;              // half the width of an "HH:MM" label in Geist Mono
    const sparse = (X1 - X0) / 8 < half * 3 + 10; // too tight for a label every 3 hours (edge labels are end-anchored)
    for (let h = 0; h <= 24; h += 3) {
      svgEl('line', { class: h % 6 ? 'grid minor' : 'grid', x1: xs(h), x2: xs(h), y1: Y0, y2: Y1 }, svg);
      if (sparse && h % 6) continue;
      const t = svgEl('text', { class: h % 6 ? 'ax minor' : 'ax', x: xs(h), y: Y1 + 21, 'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle' }, svg);
      t.textContent = fmt(h);
      axis.push({ t, cx: h === 0 ? xs(h) + half : h === 24 ? xs(h) - half : xs(h), under: false });
    }
    svgEl('line', { class: 'base', x1: X0, x2: X1, y1: Y1, y2: Y1 }, svg);
    const yl = svgEl('text', { class: 'ylab', x: 0, y: 0, transform: `translate(${fs - 1} ${(Y0 + Y1) / 2}) rotate(-90)`, 'text-anchor': 'middle' }, svg);
    yl.textContent = 'Protein level';

    const pathU = svgEl('path', { class: 'c-u' }, svg);
    const pathUTox = svgEl('path', { class: 'c-utox', 'clip-path': 'url(#pf-tox-clip)' }, svg);
    const pathT = svgEl('path', { class: 'c-t' }, svg);
    const labT = svgEl('text', { class: 'dl', 'text-anchor': 'middle' }, svg);
    labT.textContent = 'Trias-timed';
    const labU = svgEl('text', { class: 'dl', 'text-anchor': 'middle' }, svg);
    labU.textContent = 'Untimed';

    const doseLine = svgEl('line', { class: 'dose-line', y1: Y0 - 2, y2: Y1 }, svg);
    const doseTri = svgEl('path', { class: 'dose-tri' }, svg);
    const doseLab = svgEl('text', { class: 'dose-lab' }, svg);
    doseLab.textContent = 'Dose';

    const play = svgEl('g', { class: 'play' }, svg);
    const playLine = svgEl('line', { class: 'play-line', y1: Y0, y2: Y1 }, play);
    const playDot = svgEl('circle', { class: 'play-dot', r: 4.5 }, play);
    const pill = svgEl('g', { class: 'play-pill' }, play);
    const pw = Math.round(fs * 4.2), ph = 22;
    svgEl('rect', { x: -pw / 2, y: -ph / 2, width: pw, height: ph, rx: ph / 2 }, pill);
    const pillT = svgEl('text', { y: 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, pill);

    const tPeakY = ys(0.92 * expression(PEAK));
    labT.setAttribute('x', clamp(xs(PEAK), X0 + 44, X1 - 44));
    labT.setAttribute('y', tPeakY - 10);

    G = { W, H, X0, X1, Y0, Y1, xs, ys, pw, axis, half, pathU, pathUTox, pathT, labU, doseLine, doseTri, doseLab, play, playLine, playDot, pill, pillT };
    drawCurves();
    drawPlay();
    // The live chart replaces the partial's baked stills.
    if (!box.classList.contains('built')) { $('.chart-bake-m', box)?.remove(); box.classList.add('built'); }
  };

  const curve = fn => {
    const { xs, ys } = G;
    const n = Math.round(G.W / 2);
    let d = '';
    for (let i = 0; i <= n; i++) {
      const h = (i / n) * 24;
      d += `${i ? 'L' : 'M'}${xs(h).toFixed(1)} ${ys(fn(h)).toFixed(1)}`;
    }
    return d;
  };

  const drawCurves = () => {
    if (!G) return;
    const { xs, ys, X0, X1, Y0 } = G;
    const dU = curve(h => untimed(h, dose));
    G.pathU.setAttribute('d', dU);
    G.pathUTox.setAttribute('d', dU);
    if (!G.pathT.getAttribute('d')) G.pathT.setAttribute('d', curve(h => 0.92 * expression(h)));
    const x = xs(dose);
    G.doseLine.setAttribute('x1', x);
    G.doseLine.setAttribute('x2', x);
    G.doseTri.setAttribute('d', `M${x - 5} ${Y0 - 9} H${x + 5} L${x} ${Y0 - 2} Z`);
    const right = x > X1 - 60;
    G.doseLab.setAttribute('x', right ? x - 9 : x + 9);
    G.doseLab.setAttribute('y', Y0 - 5);
    G.doseLab.setAttribute('text-anchor', right ? 'end' : 'start');
    const peakU = (dose + 4) % 24;
    G.labU.setAttribute('x', clamp(xs(peakU), X0 + 30, X1 - 30));
    G.labU.setAttribute('y', ys(1) - 10);
    // Readout (text in the DOM is the true value).
    $('#dose-label').textContent = fmt(dose);
    $('#r-u-peak').textContent = fmt(peakU);
    const where = WHERE[inBand(peakU, TOX) ? 'tox' : inBand(peakU, WINDOW) ? 'win' : 'out'];
    if (whereEl && whereEl.textContent !== where) whereEl.textContent = where;
  };

  const drawPlay = () => {
    const h = ((hour % 24) + 24) % 24;
    const live = inBand(h, WINDOW);
    if (G) {
      const { xs, ys, X0, X1, Y1, pw } = G;
      const x = xs(h);
      G.playLine.setAttribute('x1', x);
      G.playLine.setAttribute('x2', x);
      G.playDot.setAttribute('cx', x);
      G.playDot.setAttribute('cy', ys(0.92 * expression(h)));
      const px = clamp(x, X0 + pw / 2, X1 - pw / 2);
      G.pill.setAttribute('transform', `translate(${px.toFixed(1)} ${Y1 + 17})`);
      // Hide the axis labels the pill is passing over, so they never peek out from under it.
      for (const a of G.axis) {
        const under = Math.abs(a.cx - px) < pw / 2 + G.half - 2;
        if (under !== a.under) { a.under = under; a.t.classList.toggle('under', under); }
      }
      G.pillT.textContent = fmt(h);
      G.play.classList.toggle('live', live);
    }
    if (phHour) {
      phHour.textContent = fmt(h);
      if (live !== lastLive) {
        lastLive = live;
        phStatus.classList.toggle('live', live);
        phState.textContent = live ? 'In the window. Ribosomes making protein.' : 'Outside the window. Ribosomes off.';
      }
    }
  };

  const setDose = (d, fromUser) => {
    dose = ((d % 24) + 24) % 24;
    if (!fromUser) input.value = String((Math.round(dose * 4) / 4) % 24);
    input.setAttribute('aria-valuetext', fmt(+input.value));
    drawCurves();
  };

  input.addEventListener('input', () => setDose(+input.value, true));
  new ResizeObserver(() => { if (Math.round(box.clientWidth) !== G?.W) build(); }).observe(box);
  phoneMQ.addEventListener?.('change', build);
  build();

  // ---- Playhead: loops the day while #schedule is on screen, feeds the strand ----
  // Holds still (and so does the strand's protein hour) while motion is paused.
  state.protein.hour = hour;
  if (!state.reduced) {
    whileVisible(sec, dt => {
      if (!dt) return;
      hour = (hour + dt * (24 / DAY_S)) % 24;
      state.protein.hour = hour;
      state.dirty = true;
      drawPlay();
    }, '0px', { motion: true });
  }
  let onTween = null, onTarget = state.protein.on;
  const setOn = v => {
    if (v === onTarget) return;       // already there, or already easing there
    onTarget = v;
    onTween?.kill();
    // Phones: the canvas moves between slots, so leaving protein mode is instant (no ribosomes fading on the anatomy strand).
    if (state.reduced || (state.mobile && v === 0)) { state.protein.on = v; state.dirty = true; return; }
    onTween = gsap.to(state.protein, { on: v, duration: DUR.l, ease: EASE, onUpdate: () => { state.dirty = true; }, onComplete: () => { onTween = null; } });
  };
  // Protein mode follows the figure the strand is showing (state.stage.fig, written by the
  // 3d stage): on desktop that switches with the section; on phones with the slot that holds
  // the canvas, so the anatomy slot never shows ribosomes while it is still on screen.
  // Falls back to the section if the stage never started. Checked after each tick, once
  // every subscriber (the stage included) has updated.
  const syncOn = () => {
    const f = state.stage?.fig;
    setOn((f ? f === 'protein' : state.section === 'schedule') ? 1 : 0);
  };
  let queued = false;
  const later = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; syncOn(); }); };
  onTick(later);
  on('section', later);
  syncOn();

  // ---- Dose autoplay: once, when the chart first comes into view ----
  // Any hand on the slider (focus included, so a keyboard or screen-reader user never has
  // the value move under them) or pausing motion ends it. Skipped while motion is paused.
  if (state.reduced) return;
  let auto = null;
  const stop = () => {
    if (!auto) return;
    auto.kill();
    auto = null;
    readout.setAttribute('aria-live', 'polite');
    box.classList.remove('autoplay');
  };
  ['pointerdown', 'keydown', 'touchstart', 'wheel', 'focus'].forEach(ev => input.addEventListener(ev, stop, { passive: true }));
  on('motion', paused => { if (paused) stop(); });
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    if (state.paused || document.activeElement === input) return;
    const p = { d: dose };
    readout.setAttribute('aria-live', 'off');
    box.classList.add('autoplay');
    auto = gsap.to(p, {
      d: dose + 24, duration: 3.2, ease: 'sine.inOut', delay: 0.35,
      // Also checks focus directly: a focus event may not fire while the window is in the background.
      onUpdate: () => { if (document.activeElement === input) stop(); else setDose(p.d); },
      onComplete: () => { setDose(p.d); stop(); },
    });
  }, { threshold: 0.6 });
  io.observe(box);
}

/* ---------------------------------------------------------------------------
   09:00 Data engine. Model -> Wet lab -> Data -> Model. Dashes flow (CSS), a pulse
   travels the loop and wakes each node it reaches, and the plate's wells light in a
   wave that crosses the day (12 columns = 24 hours). Under reduced motion: a still.
--------------------------------------------------------------------------- */
function initEngine() {
  const svg = $('#loop-svg');
  if (!svg) return;
  const CX = 240, CY = 230, R = 150, NR = 38;
  const P = (a, r = R) => [CX + Math.sin(a) * r, CY - Math.cos(a) * r];
  const TAU = Math.PI * 2;
  const nodes = [['Model', 0], ['Wet lab', TAU / 3], ['Data', (2 * TAU) / 3]];
  const arcLabels = ['sequences', 'signal every minute', 'retraining'];
  const gap = (NR + 9) / R;

  const arcs = $('#loop-arcs', svg), nodeG = $('#loop-nodes', svg), labG = $('#loop-labels', svg), plate = $('#loop-plate', svg);
  // The partial ships a baked still of this diagram for readers without JavaScript; rebuild it live.
  [arcs, nodeG, labG, plate].forEach(g => g.replaceChildren());
  // Labels are sized in real CSS px: --px is viewBox units per rendered px, so the
  // text never drops under the floor when the diagram scales down (360px phones).
  const VB_W = svg.viewBox.baseVal.width || 480;
  const fit = () => {
    const w = svg.getBoundingClientRect().width;
    if (w) svg.style.setProperty('--px', (VB_W / w).toFixed(4));
  };
  new ResizeObserver(fit).observe(svg);
  fit();
  nodes.forEach(([, a], i) => {
    const b = nodes[(i + 1) % 3][1] + (i === 2 ? TAU : 0);
    const [x1, y1] = P(a + gap), [x2, y2] = P(b - gap - 0.02);
    svgEl('path', { class: 'loop-arc', d: `M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`, 'marker-end': 'url(#loop-arr)' }, arcs);
    const mid = (a + b) / 2;
    const side = Math.sin(mid);  // right of the loop: anchor start; left: anchor end; bottom: middle
    const [lx, ly] = P(mid, R + (Math.abs(side) > 0.5 ? 16 : 30));
    const t = svgEl('text', { class: 'loop-k', x: lx.toFixed(1), y: (ly + 5).toFixed(1), 'text-anchor': side > 0.5 ? 'start' : side < -0.5 ? 'end' : 'middle' }, labG);
    t.textContent = arcLabels[i];
  });
  const nodeEls = nodes.map(([name, a]) => {
    const [x, y] = P(a);
    const g = svgEl('g', { class: 'node', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, nodeG);
    svgEl('circle', { class: 'node-bg', r: NR }, g);
    const glow = svgEl('circle', { class: 'node-glow', r: NR }, g);
    svgEl('circle', { class: 'node-ring', r: NR }, g);
    const t = svgEl('text', { y: 1, 'dominant-baseline': 'middle', 'text-anchor': 'middle' }, g);
    t.textContent = name;
    return { a, g, glow };
  });

  // 96-well plate at the center: 8 rows x 12 columns; each column is two hours of the day.
  const COLS = 12, ROWS = 8, SP = 10.5;
  const pw = (COLS - 1) * SP, ph = (ROWS - 1) * SP;
  const ox = CX - pw / 2, oy = CY - ph / 2 - 8;
  svgEl('rect', { class: 'plate', x: ox - 12, y: oy - 12, width: pw + 24, height: ph + 24, rx: 9 }, plate);
  const wells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const w = svgEl('circle', { class: 'well', cx: (ox + c * SP).toFixed(1), cy: (oy + r * SP).toFixed(1), r: 3.5 }, plate);
    // Each well's own signal strength and a small per-row phase so the wave is not a ruler.
    const amp = 0.55 + 0.45 * Math.abs(Math.sin(r * 12.9898 + c * 78.233) * 43758.5453 % 1);
    wells.push({ w, hourAt: c * 2 + 1 + r * 0.22, amp, last: -1 });
  }
  const clockT = svgEl('text', { class: 'plate-h', x: CX, y: oy + ph + 31, 'text-anchor': 'middle' }, plate);

  const pulse = $('#loop-pulse', svg);
  const DAY = 12;       // seconds for the wave to cross the day
  const LAP = 6;        // seconds for the pulse to go once around the loop

  const paint = (t, still = false) => {
    // Wave: the column under the current hour is brightest, the ones just read fade behind it.
    const hour = ((t / DAY) * 24) % 24;
    for (const wl of wells) {
      const d = (((hour - wl.hourAt) % 24) + 24) % 24;
      const v = Math.round((0.1 + 0.9 * Math.exp(-d / 2.6) * wl.amp) * 50) / 50;
      if (v !== wl.last) { wl.last = v; wl.w.style.fillOpacity = v; }
    }
    clockT.textContent = fmt(Math.floor(hour * 4) / 4);
    // Pulse around the loop, clockwise from Model.
    const a = still ? TAU / 6 : ((t / LAP) % 1) * TAU;
    const [px, py] = P(a);
    let near = 0;
    for (const n of nodeEls) {
      let d = Math.abs(a - n.a) % TAU;
      if (d > Math.PI) d = TAU - d;
      const act = clamp(1 - d / (gap * 1.6));
      near = Math.max(near, clamp(1 - d / gap));
      n.glow.style.opacity = (act * 0.32).toFixed(3);
    }
    pulse.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
    pulse.style.opacity = (1 - near).toFixed(3);
  };

  if (state.reduced) { paint(DAY * (14 / 24), true); return; }
  // Local clock: advances only while the loop runs, so pausing motion freezes it in place.
  let t = 0;
  paint(t);
  whileVisible(svg, dt => { t += dt; paint(t); }, '50px', { motion: true });
}
