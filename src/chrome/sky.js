// Owner: chrome. The page background follows the clock: night navy at the hero, a cooler blue
// at 03:00, mauve first light. The daylight is one layer, .daysky (results.css), placed here from
// the top of #platform to the bottom of #business: a sunrise band, cream from 06:00 through
// Traction, a sunset band. The band colors pass under empty space, never under text. After it the
// sky picks up at rose dusk, violet by 18:00 (Team), night again by 22:00. A low glow on the
// horizon (.sky-glow) adds warmth around both ends of the day.
// Every dark stop keeps --fg (#f4f1ea) above 12:1.
//
// The header follows the cream: while the cream part of .daysky sits under the header,
// <html data-tone="light"> and the header's --bg-now switch to cream.
// state.dayLight (0..1) is how much daylight sits behind the 3D strand (the middle of the
// screen); the strand takes its day palette from it and <html data-day> flips the figure caption.
//
// Cost: the page color goes on body.style.backgroundColor, which nothing inherits. --bg-now
// is written only on the few elements whose CSS reads it, and only when the color changes.
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state, onTick, emitTick, emit } from '../core/state.js';

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const toHex = c => `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
const smooth = t => t * t * (3 - 2 * t);

// The day: [hour, color]. Interpolated in sRGB between stops.
const DAY = [
  [0, '#07090f'],    // night (matches the hero sky at rest)
  [1.5, '#080c19'],
  [3, '#0c1631'],    // cooler blue
  [4, '#141a34'],
  [5, '#231a2e'],    // first light, mauve
  [6, '#2a1b33'],
  [7, '#2d1f36'],
  [8, '#271731'],    // plum
  [8.6, '#2f1934'],  // magenta
  [9.3, '#3a1b3a'],  // the top of the daylight's sunrise band picks up from here
  [15.6, '#381a39'], // and its sunset band hands back here
  [16.6, '#2e1834'], // rose dusk
  [17.2, '#251733'],
  [18, '#261a3d'],   // violet dusk
  [19, '#1d1637'],
  [20, '#151230'],
  [21, '#0e0f22'],
  [22, '#0a0c18'],   // night
  [24, '#07090f'],
].map(([h, c]) => [h, hex(c)]);

const ramp = (R, T) => {
  for (let i = 1; i < R.length; i++) {
    const [h0, c0] = R[i - 1], [h1, c1] = R[i];
    if (T <= h1) return mix(c0, c1, clamp((T - h0) / (h1 - h0)));
  }
  return R[R.length - 1][1];
};

export const skyAt = T => ramp(DAY, T);

// Horizon glow strength 0..1 (the layer's peak alpha, .18, lives in chrome.css).
// Rises with first light, peaks through the sunrise, and is gone by the time the sky turns
// cream; the same at sunset. Each edge eases, so scrolling never shows a step.
const band = (T, a, b, c, d) => (T <= a || T >= d ? 0 : T < b ? smooth((T - a) / (b - a)) : T <= c ? 1 : smooth((d - T) / (d - c)));
export const glowAt = T => Math.max(band(T, 5, 6.5, 9.2, 9.8), band(T, 16, 16.5, 17.5, 18.5));

const CREAM = hex('#f4f1ea');

// Elements whose CSS reads var(--bg-now). Keep this in step with: grep -rn "bg-now" src partials
const READERS = [
  '#topbar', '#sheet', '#request', '#top .sky-fade', '.anat-leaders', '#chart-svg', '#loop-svg',
  '.ds-mark', '#contact .paths',
].join(',');
// The fixed layers that sit over whatever is under the header: these take the cream with it.
const OVERLAYS = '#topbar, #sheet, #request';

export function initSky() {
  const root = document.documentElement;
  const body = document.body;
  const meta = document.querySelector('meta[name="theme-color"]');
  // The daylight in page coordinates, measured on load and on every refresh (core/scroll.js
  // refreshes after any layout change), so a tick reads no layout. day = [top, bottom, band].
  const daysky = document.querySelector('.daysky');
  let noon = null, day = null;
  const measure = () => {
    const first = document.querySelector('main .sec.day-first');
    const last = document.querySelector('main .sec.day-last');
    if (!daysky || !first || !last) { noon = day = null; return; }
    const top = first.getBoundingClientRect().top + scrollY;
    const bottom = last.getBoundingClientRect().bottom + scrollY;
    // --band is a clamp(); read its resolved px from a probe, since custom properties stay unresolved.
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--band)';
    daysky.append(probe);
    const band = probe.offsetHeight;
    probe.remove();
    daysky.style.top = `${top}px`;
    daysky.style.height = `${bottom - top}px`;
    noon = [top + band, bottom - band];
    day = [top, bottom, band];
  };
  // Daylight at page position y: 0 on the dark sky, 1 on cream. In a band it rises only once
  // the color has gone past coral, so the strand turns dark as the light turns pale.
  const lightAt = y => {
    if (!day) return 0;
    const [top, bottom, band] = day;
    if (y <= top || y >= bottom) return 0;
    const f = Math.min(y - top, bottom - y) / band;
    return f >= 1 ? 1 : smooth(clamp((f - 0.5) / 0.4));
  };
  measure();
  let readers = [...document.querySelectorAll(READERS)];
  let bgStr = '', bodyStr = '', glowStr = '', themeHex = '', themeTimer = 0;

  // The warm light source: one fixed layer under <main> and the 3D stage.
  const glow = document.createElement('div');
  glow.className = 'sky-glow';
  glow.setAttribute('aria-hidden', 'true');
  const stage = document.querySelector('.stage');
  if (stage) stage.before(glow); else body.prepend(glow);

  const writeTheme = () => {
    themeTimer = 0;
    const h = toHex(state.skyRGB.map(v => clamp(Math.round(v), 0, 255)));
    if (meta && h !== themeHex) { themeHex = h; meta.setAttribute('content', h); }
  };

  const update = () => {
    // Cream under the header line: the header and its ink follow it.
    const line = scrollY + (document.getElementById('topbar')?.offsetHeight || 64) / 2;
    const lit = !!noon && line >= noon[0] && line < noon[1];
    // The page itself always takes the sky; only the header (the --bg-now readers) takes the
    // cream, so the cream never shows outside the daylight section.
    const sky = skyAt(state.T);
    const c = lit ? CREAM : sky;

    const bs = `rgb(${sky[0]} ${sky[1]} ${sky[2]})`;
    if (bs !== bodyStr) {
      bodyStr = bs;
      body.style.backgroundColor = bs;
      // Readers inside a daylight section keep the cream they inherit (base.css .day).
      for (const el of readers) if (!el.matches(OVERLAYS) && !el.closest('.day')) el.style.setProperty('--bg-now', bs);
    }
    const s = `rgb(${c[0]} ${c[1]} ${c[2]})`;
    if (s !== bgStr) {
      bgStr = s;
      for (const el of readers) if (el.matches(OVERLAYS)) el.style.setProperty('--bg-now', s);
    }

    const g = (lit ? 0 : glowAt(state.T)).toFixed(3);
    if (g !== glowStr) { glowStr = g; glow.style.opacity = g; }

    // Daylight behind the strand: just below the middle of the screen.
    const dl = lightAt(scrollY + innerHeight * 0.55);
    state.dayLight = dl;
    state.stageRGB = dl > 0 ? mix(sky, CREAM, dl) : sky;
    const d = dl > 0.5 ? '1' : '0';
    if (root.dataset.day !== d) root.dataset.day = d;

    const tone = lit ? 'light' : 'dark';
    if (tone !== state.tone) {
      state.tone = tone;
      root.dataset.tone = tone;
      emit('tone', tone);
    }

    // The hero owns the light behind the header while its intro or word re-timing runs.
    const heroOwns = (state.introActive || state.clockOverride != null) && state.section === 'top';
    if (!heroOwns) state.skyRGB = c;
    if (!themeTimer) themeTimer = setTimeout(writeTheme, 120);
  };

  // Sections build their figures after this runs; pick up any new readers on each refresh.
  ScrollTrigger.addEventListener('refresh', () => {
    measure();
    const next = [...document.querySelectorAll(READERS)];
    for (const el of next) {
      if (readers.includes(el) || !bgStr) continue;
      if (el.matches(OVERLAYS)) el.style.setProperty('--bg-now', bgStr);
      else if (!el.closest('.day')) el.style.setProperty('--bg-now', bodyStr);
    }
    readers = next;
    // core/scroll.js ticked before this listener ran, on the old positions: tick again.
    emitTick();
  });

  onTick(update);
  update();
}
