// Owner: chrome. The 24-hour dial inside the clock sheet. 00:00 at the top, clockwise:
// 06:00 right, 12:00 bottom (the day half is shaded), 18:00 left. Each section sits on the
// ring at its hour, the ring is lit from 00:00 to now, and the sun or moon rides just
// outside the ring at the current hour, the same glyph as the clock pill.
import { dialAngle, fmt } from '../core/time.js';
import { skyIcon } from './icon.js';

const R_TRACK = 76;   // ring with the section dots
const R_GLYPH = 90;   // orbit of the sun/moon
const R_TICK = [63, 68];
const R_NUM = 50;
const C = 2 * Math.PI * R_TRACK;
const pt = (h, r) => {
  const a = dialAngle(h);
  return [Math.sin(a) * r, -Math.cos(a) * r].map(v => +v.toFixed(2));
};

// entries: [{ id, h }] in hour order. Returns { update(T, entryId, label), hover(id or null) }.
export function buildDial(svg, entries) {
  const ticks = Array.from({ length: 24 }, (_, h) => {
    const major = h % 6 === 0;
    const [x1, y1] = pt(h, R_TICK[0]);
    const [x2, y2] = pt(h, major ? R_TICK[1] + 3 : R_TICK[1]);
    return `<line class="d-tick${major ? ' major' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  const nums = [0, 6, 12, 18].map(h => {
    const [x, y] = pt(h, R_NUM);
    return `<text class="d-num" x="${x}" y="${y}">${String(h).padStart(2, '0')}</text>`;
  }).join('');
  const dots = entries.map(({ id, h }) => {
    const [x, y] = pt(h, R_TRACK);
    return `<g class="d-sec" data-id="${id}" transform="translate(${x} ${y})"><circle class="halo" r="10"/><circle class="dot" r="3.6"/></g>`;
  }).join('');

  svg.innerHTML =
    `<circle class="d-face" r="99"/>` +
    // Day half: from 06:00 (right) through 12:00 (bottom) to 18:00 (left).
    `<path class="d-day" d="M ${R_TICK[1]} 0 A ${R_TICK[1]} ${R_TICK[1]} 0 0 1 ${-R_TICK[1]} 0 Z"/>` +
    ticks + nums +
    `<circle class="d-track" r="${R_TRACK}"/>` +
    `<circle class="d-lit" r="${R_TRACK}" transform="rotate(-90)" stroke-dasharray="0 ${C.toFixed(2)}"/>` +
    dots +
    `<g class="d-now"><circle class="d-now-bg" r="11"/><svg class="sky-icon" x="-9" y="-9" width="18" height="18" viewBox="0 0 24 24"></svg></g>` +
    `<text class="d-time" x="0" y="2">00:00</text>` +
    `<text class="d-label" x="0" y="22"></text>`;

  const lit = svg.querySelector('.d-lit');
  const now = svg.querySelector('.d-now');
  const time = svg.querySelector('.d-time');
  const label = svg.querySelector('.d-label');
  const secs = new Map([...svg.querySelectorAll('.d-sec')].map(g => [g.dataset.id, g]));
  const glyph = skyIcon(svg.querySelector('.d-now .sky-icon'));
  let cur = null, last = '';

  return {
    update(T, entryId, text) {
      const key = `${T.toFixed(3)}|${entryId}|${text}`;
      if (key === last) return;
      last = key;
      const f = Math.min(1, Math.max(0, T / 24));
      lit.setAttribute('stroke-dasharray', `${(f * C).toFixed(2)} ${C.toFixed(2)}`);
      const [x, y] = pt(T, R_GLYPH);
      now.setAttribute('transform', `translate(${x} ${y})`);
      glyph(T);
      time.textContent = fmt(T);
      label.textContent = text || '';
      if (entryId !== cur) {
        secs.get(cur)?.classList.remove('cur');
        cur = entryId;
        secs.get(cur)?.classList.add('cur');
      }
    },
    hover(id) {
      secs.forEach((g, k) => g.classList.toggle('hover', k === id));
    },
  };
}
