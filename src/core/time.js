// Time-of-day math shared by the 3D scene, the clock, and the problem chart.
// No three.js import here: this module ships in the first-paint bundle.

// Target window for the timed protein, used by the chart and the beads.
export const PEAK = 14;
export const WIDTH = 2.4;
export const WINDOW = [10.5, 17.5];
export const TOX = [0, 5];

// Shortest signed distance between two clock hours.
export function hourDist(a, b) {
  let d = (a - b) % 24;
  if (d > 12) d -= 24;
  if (d < -12) d += 24;
  return d;
}

// Trias-timed expression: locked to the window, independent of dose time.
export function expression(T) {
  return Math.exp(-0.5 * (hourDist(T, PEAK) / WIDTH) ** 2);
}

// Untimed expression: rises a few hours after the dose, then decays.
export function untimed(T, dose) {
  const tau = ((T - dose) % 24 + 24) % 24;
  const tp = 4;
  return (tau / tp) * Math.exp(1 - tau / tp);
}

export function fmt(T) {
  const m = Math.round(T * 60);
  const h = Math.floor(m / 60) % 25;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ---- Shared 24-hour dial convention (hero ring, clock icon, clock sheet, 3D dial) ----
// 00:00 sits at the top and hours run clockwise: 06:00 right, 12:00 bottom, 18:00 left.
// Returns radians clockwise from 12 o'clock. Screen position: x = cx + sin(a) * r, y = cy - cos(a) * r.
export function dialAngle(T) {
  return ((((T % 24) + 24) % 24) / 24) * Math.PI * 2;
}

// The sun shows from 06:00 to 18:00, the moon from 18:00 to 06:00.
export function isSunHour(T) {
  const h = ((T % 24) + 24) % 24;
  return h >= 6 && h < 18;
}

// Hours the hero re-times the sky to, one per rotating word. Illustrative: confirm with Helene.
export const WORD_HOURS = [
  ['immunotherapy.', 9],
  ['vaccines.', 11],
  ['metabolic drugs.', 19],
  ['medicine.', 0],
];
