// Owner: chrome. Header, nav state, the clock pill (and its sheet), page sky and titles.
// Keyboard focus after a jump is handled for every in-page link by core/scroll.js.
import { initSky } from './sky.js';
import { initHeader } from './header.js';
import { initSheet } from './sheet.js';
import { initTitles } from './titles.js';

const run = (name, fn) => {
  try { return fn(); } catch (e) { console.error(`[chrome:${name}]`, e); return null; }
};

export function initChrome() {
  // Sky first: it subscribes to the tick before the header, which reads its color.
  run('sky', initSky);
  const header = run('header', initHeader);
  run('sheet', () => initSheet(header?.btn || document.getElementById('clock-btn')));
  run('titles', initTitles);
}
