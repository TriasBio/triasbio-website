// Orchestrator. Loads each module on its own, so a failure in one never takes
// down the others, then initializes them in a fixed order and refreshes scroll math.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state } from './core/state.js';
import { initScroll, computeAnchors, jumpTo } from './core/scroll.js';
import { initReveals } from './core/reveals.js';
import './core/motion.js';
// The first screen needs these at once: import them statically so they ship in the entry chunk.
import * as chromeMod from './chrome/chrome.js';
import * as heroMod from './hero/hero.js';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });
if (state.reduced) document.documentElement.classList.add('reduced');

// [name, loader, init export]. Order matters: chrome and hero first (first screen), stage last.
const MODULES = [
  ['chrome', () => Promise.resolve(chromeMod), 'initChrome'],
  ['hero', () => Promise.resolve(heroMod), 'initHero'],
  ['why', () => import('./sections/why.js'), 'initWhy'],
  ['platform', () => import('./sections/platform.js'), 'initPlatform'],
  ['bizpipe', () => import('./sections/bizpipe.js'), 'initBizPipe'],
  ['team', () => import('./sections/team.js'), 'initTeam'],
  ['contact', () => import('./sections/contact.js'), 'initContact'],
  ['stage', () => import('./three/stage.js'), 'initStage'],
];

try { if (localStorage.getItem('trias:paused') === '1') { state.paused = true; document.documentElement.classList.add('paused'); } } catch {}

(async () => {
  initScroll();
  const loaded = await Promise.allSettled(MODULES.map(([, load]) => load()));
  loaded.forEach((r, i) => {
    const [name, , fn] = MODULES[i];
    if (r.status !== 'fulfilled') { console.error(`[${name}] failed to load`, r.reason); return; }
    try { r.value[fn]?.(state); } catch (e) { console.error(`[${name}] init failed`, e); }
  });
  initReveals();
  ScrollTrigger.refresh();
  computeAnchors();
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  // Land on a hash target after layout settles (first load with #business etc.).
  if (location.hash.length > 1) requestAnimationFrame(() => jumpTo(location.hash, { instant: true }));
})();
