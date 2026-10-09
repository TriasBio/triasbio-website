// Owner: bizpipe. The suns in the daylight bands (.daysky) and the 12:00 Traction count (#business).
// The value band (initBusiness) draws only where a .biz-fig exists: the investor site keeps it,
// the public site has none.
// The suns: one climbs out of the sunrise band's horizon above Platform, and the sunset band's
// horizon below Traction rises over the other.
// Traction: the open model's all-time Hugging Face downloads, fetched live; the figure in the HTML
// is the fallback. Reduced motion shows the finished state.
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state, onTick } from '../core/state.js';

const NS = 'http://www.w3.org/2000/svg';
const PHONE = '(max-width: 999px)';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const isPhone = () => matchMedia(PHONE).matches;

function svgEl(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

// ---------------------------------------------------------------------------
// The value band
// ---------------------------------------------------------------------------
// Where the three milestones fall inside Development (fractions of that phase).
const MILESTONES = [0.2, 0.5, 0.8];

// Half-width of the band at distance s along the program.
function halfWidth(s, g) {
  if (s <= g.b1) return g.w0;
  if (s <= g.b2) {
    let w = g.w0;
    MILESTONES.forEach((f, i) => {
      const prev = i ? g.levels[i - 1] : g.w0;
      w += (g.levels[i] - prev) * smooth(clamp((s - g.at[i]) / g.ramp + 0.5));
    });
    return w;
  }
  // Royalty: grows by a constant factor per unit length, so it reads as compounding.
  const wD = g.levels[g.levels.length - 1];
  return wD * Math.pow(g.wMax / wD, (s - g.b2) / (g.L - g.b2));
}

function initBusiness() {
  const fig = $('.biz-fig');
  const list = fig && $('.biz-phases', fig);
  if (!list) return;
  const phases = $$('.biz-phase', list);
  const slot = $('.biz-slot', list);
  if (phases.length !== 3 || !slot) return;

  const svg = svgEl('svg', { class: 'biz-svg', 'aria-hidden': 'true', focusable: 'false' }, fig);
  const defs = svgEl('defs', {}, svg);
  const grad = svgEl('linearGradient', { id: 'biz-grad', gradientUnits: 'userSpaceOnUse' }, defs);
  const stops = ['b-s0', 'b-s1', 'b-s2'].map(c => svgEl('stop', { class: c }, grad));
  const clip = svgEl('clipPath', { id: 'biz-clip' }, defs);
  const clipRect = svgEl('rect', {}, clip);
  const axis = svgEl('path', { class: 'b-axis' }, svg);
  const drawn = svgEl('g', { 'clip-path': 'url(#biz-clip)' }, svg);
  const band = svgEl('path', { fill: 'url(#biz-grad)' }, drawn);
  const edge = svgEl('path', { class: 'b-edge' }, drawn);
  const start = svgEl('circle', { class: 'b-dot b-start', r: 4.5 }, svg);
  const dots = MILESTONES.map(() => svgEl('circle', { class: 'b-dot', r: 3.5 }, svg));

  let g = null;
  let p = state.reduced ? 1 : 0;

  // Map (distance along, offset across) to SVG pixels.
  const pt = (s, d) => (g.vertical ? [g.c + d, g.o + s] : [g.o + s, g.c + d]);
  const f1 = v => Math.round(v * 10) / 10;

  function layout() {
    const box = fig.getBoundingClientRect();
    if (!box.width) return;
    const r = phases.map(el => el.getBoundingClientRect());
    const sr = slot.getBoundingClientRect();
    const vertical = isPhone();
    let o, L, b1, b2, c, wMax;
    if (vertical) {
      o = r[0].top - box.top; L = r[2].bottom - r[0].top;
      b1 = r[1].top - r[0].top; b2 = r[2].top - r[0].top;
      c = sr.left + sr.width / 2 - box.left; wMax = sr.width / 2 - 2;
    } else {
      // The royalty runs off the right edge of the screen: it keeps going while the drug sells.
      o = r[0].left - box.left; L = Math.max(r[2].right, document.documentElement.clientWidth) - r[0].left;
      b1 = r[1].left - r[0].left; b2 = r[2].left - r[0].left;
      c = sr.top + sr.height / 2 - box.top; wMax = sr.height / 2 - 8;
    }
    const k = vertical ? [0.15, 0.25, 0.35] : [0.09, 0.165, 0.25];
    g = {
      vertical, o, L, b1, b2, c, wMax,
      w0: Math.max(2.5, wMax * 0.035),
      levels: k.map(f => wMax * f),
      ramp: vertical ? 18 : 28,
      at: MILESTONES.map(f => b1 + (b2 - b1) * f),
    };

    // Band outline, sampled every 2px.
    const up = [], down = [];
    for (let s = 0; s <= L + 0.01; s += 2) {
      const w = halfWidth(Math.min(s, L), g);
      up.push(pt(Math.min(s, L), -w));
      down.push(pt(Math.min(s, L), w));
    }
    const line = a => a.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('');
    band.setAttribute('d', `${line(up)}L${down.slice().reverse().map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z`);
    edge.setAttribute('d', `${line(up)}${line(down)}`);
    const [ax0, ay0] = pt(0, 0), [ax1, ay1] = pt(L, 0);

    // Gradient runs along the program: faint at Design, full at Approval.
    grad.setAttribute('x1', ax0); grad.setAttribute('y1', ay0);
    grad.setAttribute('x2', ax1); grad.setAttribute('y2', ay1);
    stops[0].setAttribute('offset', 0);
    stops[1].setAttribute('offset', (b2 / L).toFixed(3));
    stops[2].setAttribute('offset', 1);

    // Milestone dots sit on the axis where each step lands; one dot marks the start.
    const [sx, sy] = pt(0, 0);
    start.setAttribute('cx', f1(sx)); start.setAttribute('cy', f1(sy));
    dots.forEach((d, i) => {
      const [x, y] = pt(g.at[i], 0);
      d.setAttribute('cx', f1(x)); d.setAttribute('cy', f1(y));
    });
    apply(p);
  }

  function apply(v) {
    p = v;
    if (!g) return;
    const len = g.L * p;
    const pad = 12;
    if (g.vertical) {
      clipRect.setAttribute('x', f1(g.c - g.wMax - pad)); clipRect.setAttribute('width', f1(2 * (g.wMax + pad)));
      clipRect.setAttribute('y', f1(g.o - pad)); clipRect.setAttribute('height', f1(Math.max(0, len + pad)));
    } else {
      clipRect.setAttribute('x', f1(g.o - pad)); clipRect.setAttribute('width', f1(Math.max(0, len + pad)));
      clipRect.setAttribute('y', f1(g.c - g.wMax - pad)); clipRect.setAttribute('height', f1(2 * (g.wMax + pad)));
    }
    // The dashed timeline shows only the stretch the band has yet to cover.
    const [ax, ay] = pt(Math.min(g.L, len), 0), [bx, by] = pt(g.L, 0);
    axis.setAttribute('d', len < g.L - 1 ? `M${f1(ax)} ${f1(ay)}L${f1(bx)} ${f1(by)}` : '');
    start.classList.toggle('off', p <= 0.002);
    dots.forEach((d, i) => d.classList.toggle('off', len < g.at[i]));
  }

  layout();
  new ResizeObserver(() => layout()).observe(list);
  document.fonts?.ready.then(layout);

  if (state.reduced) return;
  // The trigger's own progress drives the band, so a refresh (resize, fonts, another
  // section's layout change) always re-reads where the reader is and never blanks it.
  // Scrolling eases toward that progress over about half a second; a refresh snaps to it.
  let target = p, raf = 0, last = 0;
  const step = now => {
    const dt = Math.min(64, now - (last || now)); last = now;
    const k = 1 - Math.exp(-dt / 140);
    const v = Math.abs(target - p) < 0.001 ? target : p + (target - p) * k;
    apply(v);
    if (v === target) { raf = 0; last = 0; } else raf = requestAnimationFrame(step);
  };
  const goTo = (v, snap) => {
    target = v;
    if (snap || state.paused) {
      cancelAnimationFrame(raf); raf = 0; last = 0;
      apply(v);
    } else if (!raf) raf = requestAnimationFrame(step);
  };
  ScrollTrigger.create({
    trigger: list,
    // Desktop: fully drawn once the whole figure is in view. Phone: the band's tip
    // follows a line about 72% down the screen as you read down the three phases.
    start: () => (isPhone() ? 'top 72%' : 'top 80%'),
    end: () => (isPhone() ? 'bottom 72%' : 'top 30%'),
    onUpdate: s => goTo(s.progress),
    onRefresh: s => goTo(s.progress, true),
  });
}


// ---------------------------------------------------------------------------
// The sun
// ---------------------------------------------------------------------------
// Each band's box (.day-hz) clips at its lower edge, the horizon. Sunrise: the sun climbs out of
// the horizon, warming from red-orange to pale gold. Sunset: it sinks slowly, gold going red,
// while the horizon scrolls up and swallows it. Reduced motion or paused: both sit mid-band.
const SUN_LOW = hexRGB('#ff6a3d'), SUN_HIGH = hexRGB('#ffcf8a');
function hexRGB(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
const sunColor = k => `rgb(${SUN_LOW.map((v, i) => Math.round(v + (SUN_HIGH[i] - v) * k)).join(' ')})`;

function initSun() {
  const rise = $('.day-hz-rise'), set = $('.day-hz-set');
  const rSun = rise && $('.day-sun', rise), sSun = set && $('.day-sun', set);
  if (!rSun || !sSun) return;
  // Targets come from scroll; the drawn values glide toward them, so a wheel step or a
  // trackpad flick never makes the sun jump. snap: skip the glide (first paint, resize).
  const want = { ry: 0, rk: 0, sy: 0, sk: 0, so: 0 };
  const cur = { ...want };
  let snap = true, raf = 0, lastT = 0;
  const put = (sun, y, k, o) => {
    sun.style.setProperty('--y', `${y.toFixed(1)}px`);
    sun.style.setProperty('--sun-c', sunColor(k));
    sun.style.setProperty('--o', o.toFixed(3));
  };
  const draw = () => { put(rSun, cur.ry, cur.rk, 1); put(sSun, cur.sy, cur.sk, cur.so); };
  const step = now => {
    const dt = Math.min(64, now - (lastT || now)); lastT = now;
    const a = 1 - Math.exp(-dt / 90);
    let moving = false;
    for (const key in want) {
      const d = want[key] - cur[key];
      if (Math.abs(d) > (key.endsWith('y') ? 0.2 : 0.001)) { cur[key] += d * a; moving = true; } else cur[key] = want[key];
    }
    draw();
    if (moving) raf = requestAnimationFrame(step); else { raf = 0; lastT = 0; }
  };
  const target = () => {
    const vh = innerHeight || 1;
    const rr = rise.getBoundingClientRect(), sr = set.getBoundingClientRect();
    const B = rise.offsetHeight, D = rSun.offsetHeight, R = D / 2;
    if (state.reduced) {
      Object.assign(want, { ry: B * 0.45 - R, rk: 0.7, sy: B * 0.45 - R, sk: 0.4, so: 1 });
      return;
    }
    // Sunrise, in screen terms (the band is taller than the screen): the sun starts under the
    // the horizon and climbs about half a screen above it while the horizon scrolls from the
    // bottom of the screen to 40% down. Eases out (sine): it lifts off, then slows.
    const q = clamp((vh - rr.bottom) / (0.6 * vh));
    const p = Math.sin(q * Math.PI / 2);
    // From fully under the haze to a center 38% down the band, well clear of it.
    const lift = (0.62 * B + 1.3 * R) * p;
    want.ry = B + 0.3 * R - lift;
    want.rk = p;
    // Sunset: the sun sinks slowly down the screen (28% to 50%) while the horizon rises faster
    // and covers it. Gold at the band's top, red at the horizon; fades in clear of the cream edge.
    const t = clamp((vh - sr.top) / (B + 0.6 * vh));
    const cy = vh * (0.28 + 0.22 * t) - sr.top;
    const k = clamp(cy / B);
    want.sy = Math.min(cy, B + D) - R;
    want.sk = 1 - k;
    want.so = smooth(clamp((cy - R) / (0.3 * B)));
  };
  const update = () => {
    target();
    if (snap || state.reduced || state.paused) {
      snap = false;
      Object.assign(cur, want);
      cancelAnimationFrame(raf); raf = 0; lastT = 0;
      draw();
    } else if (!raf) raf = requestAnimationFrame(step);
  };
  onTick(update);
  addEventListener('resize', () => { snap = true; update(); });
  update();
}

// ---------------------------------------------------------------------------
// Traction: live download count
// ---------------------------------------------------------------------------
function liveDownloads() {
  fetch('https://huggingface.co/api/models/lareaulab/Trias?expand%5B%5D=downloadsAllTime')
    .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(d => {
      if (!d || !d.downloadsAllTime) throw new Error('no count');
      $('#hf-total').textContent = d.downloadsAllTime.toLocaleString('en-US');
      $('#hf-asof').textContent = `as of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
      $('#hf')?.classList.add('is-live');
    })
    // No live count: drop the dot's reserved space and keep the static figure and date.
    .catch(() => { $('#hf')?.classList.add('no-live'); });
}

export function initBizPipe() {
  try { initBusiness(); } catch (e) { console.error('[bizpipe] business', e); }
  try { initSun(); } catch (e) { console.error('[bizpipe] sun', e); }
  if ($('#hf')) liveDownloads();
}
