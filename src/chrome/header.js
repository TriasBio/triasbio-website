// Owner: chrome. Header ink, the clock pill and the nav's active item.
// At the top of the hero there is no bar, and the hero's sky can turn bright during its
// intro, so the ink flips by the luminance of state.skyRGB and a soft scrim tops it up.
// Once scrolled, the bar is the page's own sky and the ink follows the tone tokens.
import { state, onTick, on } from '../core/state.js';
import { fmt } from '../core/time.js';
import { skyIcon } from './icon.js';
import { LABELS } from './sections.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const lin = v => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const LIGHT_INK = [244, 241, 234];
const DARK_INK = [21, 20, 15];
// Off-white and near-black text are equally legible (about 4:1) on a sky of luminance 0.18.
// Flip around there, with hysteresis so a sky hovering at the edge does not flicker.
const FLIP_UP = 0.22, FLIP_DOWN = 0.15;

export function initHeader() {
  const root = document.documentElement;
  const bar = document.getElementById('topbar');
  const btn = document.getElementById('clock-btn');
  const clockEl = document.getElementById('clock');
  const icon = skyIcon(document.getElementById('clock-icon'));
  const nav = [...bar.querySelectorAll('.nav a[data-group]')];
  let ink = null, shown = '', pill = '', scrim = '', ariaTimer = 0;

  // The pill's name says what it opens and where the reader is. Throttled: it changes with scroll.
  const writeAria = () => {
    ariaTimer = 0;
    const where = LABELS[state.section];
    btn.setAttribute('aria-label', `Sections by hour. Now ${shown}${where ? `, ${where}` : ''}`);
  };
  const queueAria = () => { if (!ariaTimer) ariaTimer = setTimeout(writeAria, 600); };

  const tick = s => {
    const h = s.clockOverride ?? s.T;
    // The hero carries its own filled button; one green button per screen, so the header's waits.
    // The markup ships with .at-hero, so the button never shows on the first screen.
    bar.classList.toggle('at-hero', s.section === 'top');
    const txt = fmt(h);
    if (txt !== shown) { shown = txt; clockEl.textContent = txt; queueAria(); }
    icon(h);

    const sky = (s.skyRGB || [7, 9, 15]).map(Number);
    const barOn = root.classList.contains('scrolled') || root.classList.contains('sheet-open');
    let next = null, a = 0, tint = [0, 0, 0];
    if (!barOn) {
      const L = lum(sky);
      const dark = ink === 'dark' ? L > FLIP_DOWN : L > FLIP_UP;
      next = dark ? 'dark' : 'light';
      // Scrim: strongest near the flip point, where neither ink has much contrast on its own.
      if (dark) { a = clamp((0.5 - L) / 0.28) * 0.5; tint = mix(sky, [255, 255, 255], 0.55); }
      else { a = clamp((L - 0.03) / 0.19) * 0.55; tint = mix(sky, [0, 0, 0], 0.62); }
    }
    if (next !== ink) {
      ink = next;
      if (ink) bar.dataset.ink = ink; else delete bar.dataset.ink;
    }
    const sc = a > 0.004 ? `${tint.join(' ')} / ${a.toFixed(3)}` : '0 0 0 / 0';
    if (sc !== scrim) { scrim = sc; bar.style.setProperty('--scrim', sc); }

    // The pill takes the sky behind it, lifted slightly toward the ink.
    const inkRGB = ink === 'dark' || (!ink && s.tone === 'light') ? DARK_INK : LIGHT_INK;
    const p = mix(sky, inkRGB, 0.1).join(' ');
    if (p !== pill) { pill = p; btn.style.setProperty('--pill', p); }
  };
  // chrome/sky.js subscribes first, so state.skyRGB is already this tick's color.
  onTick(tick);
  tick(state);
  // The button fades only after the first frames, so a load below the hero shows it at once
  // and a load on the hero never fades it in or out.
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('ready')));

  // Active group: accent color, plus the current section's hour under its label (out of the flow).
  const setNav = () => {
    const g = state.group;
    const t = document.getElementById(state.section)?.dataset.time;
    nav.forEach(a => {
      const on = g != null && a.dataset.group === g;
      a.classList.toggle('cur', on);
      if (on) {
        a.setAttribute('aria-current', 'location');
        if (t != null) a.querySelector('.nav-t').textContent = fmt(+t);
      } else a.removeAttribute('aria-current');
    });
    queueAria();
  };
  on('section', setNav);
  setNav(); // core/scroll.js emitted the first section before this module loaded

  return { btn };
}
