// Owner: hero. Geometry and markup for the hero's 24-hour ring, in one place.
// Pure functions, no DOM: src/hero/build-ring.mjs writes the static SVG into
// partials/hero.html (instant first paint, works without JS), scripts/gen-og.mjs
// reuses it for the share image, and hero.js reads the same constants.
//
// The ring echoes the 3D dial: 84 short radial base rods in pearl grays, grouped
// in codons of three, on a thin backbone, with 24 hour ticks inside (majors at
// 00, 06, 12, 18). Dial convention: 00:00 at the top, hours run clockwise.

// All values are in viewBox units. The viewBox is a 1200 x 1200 square centered on 0,0.
export const VB = 1200;
export const R_ROD = 440;        // rod midpoints sit on this circle (the backbone)
export const ROD_LONG = 24;      // half-length of a purine rod (A, G)
export const ROD_SHORT = 17;     // half-length of a pyrimidine rod (C, U)
export const ROD_W = 5;
export const ORBIT = 350;        // the sun and moon ride this circle, inside the ticks
export const BASES = 84;
export const CODONS = 28;
export const WINDOW_H = [10.5, 17.5]; // mirrors WINDOW in src/core/time.js

// Fraction of the box half-size, used by CSS to place HTML layers on the same circles.
export const K_ROD = R_ROD / (VB / 2);
export const K_ORBIT = ORBIT / (VB / 2);
export const K_OUTER = (R_ROD + ROD_LONG) / (VB / 2);

const SHADES = { A: '#ecebe6', G: '#d5d3cd', C: '#a9a8a4', U: '#8b8a88' };
const f = n => +n.toFixed(2);

// Deterministic base sequence, so the static SVG, the OG image and the runtime agree.
function sequence() {
  let s = 0x2f6b47;
  const out = [];
  for (let i = 0; i < BASES; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out.push('ACGU'[(s >> 16) & 3]);
  }
  return out;
}

// One entry per rod: angle in degrees clockwise from 12 o'clock, the hour it marks, its base.
export function rods() {
  const seq = sequence();
  const step = 360 / CODONS;     // one codon every 12.86 degrees
  const inner = 3.35;            // gap between rods inside a codon (the codon gap is wider)
  return seq.map((base, i) => {
    const c = Math.floor(i / 3), k = (i % 3) - 1;
    const deg = c * step + step / 2 + k * inner;
    const hour = (deg / 360) * 24;
    const len = base === 'A' || base === 'G' ? ROD_LONG : ROD_SHORT;
    return { i, base, deg, hour, len, win: hour >= WINDOW_H[0] && hour <= WINDOW_H[1] };
  });
}

const pt = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [Math.sin(a) * r, -Math.cos(a) * r];
};
const line = (deg, r0, r1, attrs) => {
  const [x0, y0] = pt(deg, r0), [x1, y1] = pt(deg, r1);
  return `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"${attrs}/>`;
};
const arc = (d0, d1, r) => {
  const [x0, y0] = pt(d0, r), [x1, y1] = pt(d1, r);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
};

// The neutral ring: backbone, 84 rods, 24 hour ticks. Static.
export function ringBaseSVG(cls = 'ring-base') {
  const parts = [];
  parts.push(`<circle r="${R_ROD}" fill="none" stroke="#e9e7e1" stroke-opacity=".16" stroke-width="1.4"/>`);
  for (const r of rods()) {
    parts.push(line(r.deg, R_ROD - r.len, R_ROD + r.len, ` stroke="${SHADES[r.base]}" stroke-opacity=".5"`));
  }
  for (let h = 0; h < 24; h++) {
    const major = h % 6 === 0;
    parts.push(line(h * 15, major ? 374 : 390, 402, ` stroke="#e9e7e1" stroke-opacity="${major ? '.55' : '.26'}" stroke-width="${major ? 2.6 : 1.6}"`));
  }
  return `<svg class="${cls}" viewBox="-600 -600 1200 1200" aria-hidden="true" focusable="false"><g stroke-linecap="round" stroke-width="${ROD_W}">${parts.join('')}</g></svg>`;
}

// The target window (10:30 to 17:30) lit: a soft sage glow under bright rods.
// Hidden by default; hero.js fades it in only while the hour is inside the window.
export function ringLitSVG(cls = 'ring-lit') {
  const d0 = (WINDOW_H[0] / 24) * 360, d1 = (WINDOW_H[1] / 24) * 360;
  const win = rods().filter(r => r.win);
  const parts = [];
  parts.push(`<defs><filter id="ring-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>`
    + `<filter id="rod-bloom" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter></defs>`);
  parts.push(`<path d="${arc(d0, d1, R_ROD)}" fill="none" stroke="#8fc9a3" stroke-opacity=".5" stroke-width="86" stroke-linecap="round" filter="url(#ring-blur)"/>`);
  parts.push(`<path d="${arc(d0, d1, R_ROD)}" fill="none" stroke="#bfe3cb" stroke-opacity=".55" stroke-width="2"/>`);
  const rodsMarkup = win.map(r => line(r.deg, R_ROD - r.len, R_ROD + r.len, '')).join('');
  parts.push(`<g stroke="#a9dcb9" stroke-opacity=".9" filter="url(#rod-bloom)">${rodsMarkup}</g>`);
  parts.push(`<g stroke="#eef8f1">${rodsMarkup}</g>`);
  return `<svg class="${cls}" viewBox="-600 -600 1200 1200" aria-hidden="true" focusable="false"><g stroke-linecap="round" stroke-width="${ROD_W}">${parts.join('')}</g></svg>`;
}

// A sparse star field for the night sky. Deterministic.
export function starsSVG(cls = 'sky-stars', n = 90) {
  let s = 0x8fc9a3;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const dots = [];
  for (let i = 0; i < n; i++) {
    const x = rnd() * 1000, y = Math.pow(rnd(), 1.35) * 640; // denser near the top
    const r = 0.5 + rnd() * rnd() * 1.4;
    const o = 0.25 + rnd() * 0.6;
    dots.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill-opacity="${f(o)}"/>`);
  }
  return `<svg class="${cls}" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false"><g fill="#e9eefc">${dots.join('')}</g></svg>`;
}
