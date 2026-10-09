// Owner: chrome. The sun/moon glyph that follows the hour (clock pill and sheet dial).
// Moon 18:00 to 06:00, sun 06:00 to 18:00. Within half an hour of 06:00 and 18:00 the sun
// sits on a small horizon line, half risen at the crossing itself, and moves with the clock.
import { isSunHour } from '../core/time.js';

const HZ = 16;            // horizon line y in the 24-unit box
const R_RISE = 5.2;       // disc radius on the horizon
const WIN = 0.5;          // hours either side of a crossing that show the horizon
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  const p = r => [12 + Math.sin(a) * r, 12 - Math.cos(a) * r].map(v => v.toFixed(2));
  const [x1, y1] = p(6.7), [x2, y2] = p(9.1);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}).join('');
// Five short rays fanned above a sun sitting on the horizon.
const RISE_RAYS = [-60, -30, 0, 30, 60].map(d => {
  const a = (d * Math.PI) / 180;
  const p = r => [12 + Math.sin(a) * r, HZ - Math.cos(a) * r].map(v => v.toFixed(2));
  const [x1, y1] = p(7.4), [x2, y2] = p(9.5);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}).join('');
let uid = 0;

// Fills an <svg viewBox="0 0 24 24"> and returns update(hour).
export function skyIcon(svg) {
  const clip = `trias-hz-${++uid}`;
  svg.innerHTML =
    `<defs><clipPath id="${clip}"><rect x="-2" y="-4" width="28" height="${HZ + 4}"/></clipPath></defs>` +
    `<g class="si-moon"><path d="M15 5.68A7 7 0 1 0 15 18.32A6.6 6.6 0 0 1 15 5.68Z" transform="rotate(-24 12 12)"/></g>` +
    `<g class="si-sun"><circle cx="12" cy="12" r="4.3"/><g class="si-rays">${RAYS}</g></g>` +
    `<g class="si-rise"><g clip-path="url(#${clip})"><g class="si-up">` +
    `<circle class="si-disc" cx="12" cy="${HZ}" r="${R_RISE}"/><g class="si-rays">${RISE_RAYS}</g></g></g>` +
    `<line class="si-hz" x1="3" y1="${HZ}" x2="21" y2="${HZ}"/></g>`;
  const up = svg.querySelector('.si-up');
  const upRays = up.querySelector('.si-rays');
  let phase = '', cy = NaN;

  return function update(T) {
    const h = ((T % 24) + 24) % 24;
    const dRise = h - 6, dSet = h - 18;
    let next, y = HZ;
    if (Math.abs(dRise) < WIN) { next = 'rise'; y = HZ - (dRise / WIN) * R_RISE * 0.72; }
    else if (Math.abs(dSet) < WIN) { next = 'set'; y = HZ + (dSet / WIN) * R_RISE * 0.72; }
    else next = isSunHour(h) ? 'sun' : 'moon';
    if (next !== phase) { phase = next; svg.dataset.phase = next; }
    if (next === 'rise' || next === 'set') {
      const v = Math.round((y - HZ) * 100) / 100;
      if (v !== cy) {
        cy = v;
        up.setAttribute('transform', `translate(0 ${v})`);
        // Rays brighten as the disc clears the horizon.
        const risen = 0.5 - v / (2 * R_RISE * 0.72);
        upRays.style.opacity = (0.3 + 0.7 * Math.min(1, Math.max(0, risen))).toFixed(2);
      }
    }
    return next;
  };
}
