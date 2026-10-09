// Owner: hero. The light of each hour, for the first screen.
// skyAt(hour) interpolates a vertical sky gradient (top, mid, low), the light
// sources (sun, moon, stars), the glow that falls on the rotating word, and how
// much scrim the headline needs to stay readable. Pure math; no DOM.
import { WINDOW, expression } from '../core/time.js';

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const wrap = h => ((h % 24) + 24) % 24;

// Keyframes. Deep navy at night, peach and gold at dawn, pale blue-white at noon,
// violet at dusk. glow = the light that falls on the rotating word at that hour.
// warm / white = sun glow strength, moon = moonlight, stars = star field.
const KEYS = [
  //  h     top        mid        low        glow       warm white moon stars
  [0,    '#03050d', '#08101f', '#0e1a34', '#9db3e6', 0,   0,   .7,  1],
  [4.5,  '#050a1d', '#131b3e', '#332f58', '#a9a4dc', 0,   0,   .45, .6],
  [6,    '#1a2b59', '#8a6383', '#f0a27b', '#f6b486', .95, 0,   0,   .06],
  [7.5,  '#2f5590', '#c08a7a', '#f2c48c', '#f6c27e', .85, .2,  0,   0],
  [9,    '#285392', '#5c82b2', '#89a4ce', '#f4c46c', .65, .3,  0,   0],  // word hour: gold light, cool haze low
  [11,   '#2a5fa3', '#5b89c0', '#9cb8d6', '#ffe2a6', .2,  .6,  0,   0],  // word hour: clear late morning
  [12.5, '#4d84c4', '#c0d8ec', '#eef3f5', '#fff1cf', .1,  .85, 0,   0],  // noon flash (no headline yet)
  [15.5, '#3d6dac', '#7ca2cd', '#dccfbd', '#ffe0a8', .3,  .6,  0,   0],
  [17,   '#3a4c85', '#bb8787', '#f2b07c', '#f7a978', .85, .2,  0,   0],
  [18,   '#262a5e', '#704f8d', '#d97b8a', '#cf9ae8', .75, 0,   0,   0],
  [19,   '#16133a', '#3e2f6c', '#6a4483', '#b58cf0', .22, 0,   .18, .25], // word hour: violet dusk
  [20.5, '#0a0b22', '#1a1a40', '#2b2652', '#a194e6', 0,   0,   .45, .7],
  [22,   '#05071a', '#0d1230', '#161c40', '#97a0e0', 0,   0,   .6,  .9],
  [24,   '#03050d', '#08101f', '#0e1a34', '#9db3e6', 0,   0,   .7,  1],
].map(([h, t, m, l, g, ...n]) => ({ h, top: hex(t), mid: hex(m), low: hex(l), glow: hex(g), n }));

export const NIGHT_STOPS = { top: KEYS[0].top, mid: KEYS[0].mid, low: KEYS[0].low };

// ---- Contrast (WCAG relative luminance) ----
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const INK = hex('#f4f1ea');
const SCRIM = hex('#050a18');
const PAGE = hex('#07090f');
const TARGET = 3.6;            // headline target, with margin over the 3:1 floor

// The sky gradient at height y (0 top, 1 bottom), before the bottom fade.
export function skyColor(s, y) {
  return y < 0.5 ? mix(s.top, s.mid, y / 0.5) : mix(s.mid, s.low, (y - 0.5) / 0.5);
}
// The bottom of the hero fades to the page (CSS: transparent 58% to page 100%). In daylight
// the fade lifts part way (FADE_LIFT, hero.js), so the morning haze shows under the copy.
const fadeA = y => clamp((y - 0.58) / 0.42);
export const FADE_LIFT = { copy: 0.45, open: 0.75 };

// How much scrim (0..1) the headline band needs so #F4F1EA holds TARGET contrast.
// band = the headline's vertical extent (0 top, 1 bottom). lift = how much of the sun's
// glow can sit behind the text (on phones the sun's daytime arc runs right behind it).
const SUN_LIGHT = hex('#fff4dc');
function scrimFor(s, [y0, y1], lift) {
  const glow = clamp(lift * (0.7 * s.white + 0.5 * s.warm));
  let need = 0;
  for (let y = y0; y <= y1 + 1e-6; y += 0.03) {
    const c = mix(mix(skyColor(s, y), SUN_LIGHT, glow), PAGE, fadeA(y) * 0.6 * (1 - FADE_LIFT.copy * s.day));
    if (contrast(INK, c) >= TARGET) continue;
    let lo = 0, hi = 1;
    for (let k = 0; k < 14; k++) {
      const m = (lo + hi) / 2;
      if (contrast(INK, mix(c, SCRIM, m)) >= TARGET) hi = m; else lo = m;
    }
    need = Math.max(need, hi);
  }
  return Math.min(need, 0.8);
}

// Everything the first screen needs at one hour.
export function skyAt(hour) {
  const h = clamp(hour, 0, 24) === hour ? hour : wrap(hour);
  let i = 1;
  while (i < KEYS.length - 1 && h > KEYS[i].h) i++;
  const a = KEYS[i - 1], b = KEYS[i];
  const t = clamp((h - a.h) / (b.h - a.h));
  const e = t * t * (3 - 2 * t); // ease between keys so the colors never kink
  const s = {
    hour: h,
    top: mix(a.top, b.top, e),
    mid: mix(a.mid, b.mid, e),
    low: mix(a.low, b.low, e),
    glow: mix(a.glow, b.glow, e),
  };
  const [warm, white, moon, stars] = a.n.map((v, k) => v + (b.n[k] - v) * e);
  Object.assign(s, { warm, white, moonGlow: moon, stars });
  // Sun and moon glyphs. The sun is half-risen at 06:00 and half-set at 18:00.
  s.rise = smooth(5.5, 6.5, h) * (1 - smooth(17.5, 18.5, h));
  s.dash = Math.max(1 - Math.abs(h - 6) / 0.75, 1 - Math.abs(h - 18) / 0.75, 0); // the horizon tick at the crossings
  s.moon = Math.max(1 - smooth(4.9, 5.8, h), smooth(18.2, 19.1, h));
  // Daylight 0..1: during the day pass the ground fade lifts so noon fills the screen.
  s.day = smooth(5.6, 7.4, h) * (1 - smooth(17.4, 19.2, h));
  // The target window makes protein only while the hour is inside it.
  const inWin = smooth(WINDOW[0], WINDOW[0] + 0.6, h) * (1 - smooth(WINDOW[1] - 0.6, WINDOW[1], h));
  s.win = inWin * (0.6 + 0.4 * expression(h));
  s.scrim = scrimFor(s, [0.36, 0.78], 0.3);    // desktop: headline over the ring's middle
  s.scrimM = scrimFor(s, [0.6, 0.8], 0.75);     // phone: headline over the ring's lower edge
  return s;
}

// The light behind the header (for the corner clock pill): the top of the sky.
export const headerRGB = s => s.top.map(Math.round);
export const css = c => `rgb(${c.map(v => Math.round(v)).join(' ')})`;
export const cssA = (c, a) => `rgb(${c.map(v => Math.round(v)).join(' ')} / ${+a.toFixed(3)})`;
