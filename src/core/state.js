// One shared state object. core/scroll.js writes the page clock; modules read it
// on every tick. Modules never import each other: they talk through this file.
const mq = q => matchMedia(q).matches;

export const state = {
  // ---- Page clock (written by core/scroll.js) ----
  T: 0,              // hour 0..24 mapped from scroll position (measured at the viewport middle)
  section: 'top',    // id of the .sec under the viewport middle
  group: null,       // its nav group (data-group): why | platform | business | team | null
  progress: 0,       // 0..1 of total scroll

  // ---- Sky / tone (written by chrome/sky.js; hero writes clockOverride and skyRGB during its intro) ----
  clockOverride: null, // when a number, the corner clock shows this hour instead of T (hero intro, word re-timing)
  skyRGB: [7, 9, 15],  // the page's light right now (chrome/sky.js; the hero writes it at the top during its intro)
  tone: 'dark',        // 'dark' | 'light' (cream noon). Mirrors <html data-tone>
  dayLight: 0,         // 0..1: daylight behind the 3D strand (chrome/sky.js); <html data-day> flips at 0.5
  stageRGB: null,      // the page color behind the strand, for its fog (chrome/sky.js)
  introActive: false,  // true while the hero day-pass intro runs

  // ---- Environment ----
  reduced: mq('(prefers-reduced-motion: reduce)'),
  mobile: mq('(max-width: 999px)'),
  touch: mq('(pointer: coarse)'),
  lowPower: false,     // set by three/power.js after a frame-rate probe
  paused: false,       // reader pressed "Pause motion" (chrome sheet). Ambient loops stop; emit('motion', paused)

  // ---- 3D inputs (read by three/scene.js; see CONTRACT.md) ----
  stage: { mode: 'hidden' },                       // written by three/stage.js: { mode: 'hidden'|'recede'|'forward', fig, presence, forward }
  form: { dial: 0 },                               // strand to dial morph 0..1 (three/stage.js)
  region: { cap: 0, utr5: 0, cds: 0, utr3: 0, polyA: 0 }, // anatomy highlight per region 0..1 (platform)
  protein: { on: 0, hour: 14 },                    // dose step: how much protein mode applies, and its local hour (platform)
  dial: { progress: 0 },                           // 0..1 how much of the 24-hour dial is lit (contact closes it)
  pickRegion: null,                                // set by three/stage.js: (x, y) => region key under that point, or null
  regionScreen: null,                              // written by three/stage.js: viewport px of each region's midpoint, or null
  dirty: true,
};

const subs = new Set();
// fn(state) runs on every scroll tick and every intro frame.
export function onTick(fn) { subs.add(fn); return () => subs.delete(fn); }
export function emitTick() {
  for (const fn of subs) {
    try { fn(state); } catch (e) { console.error('[tick]', e); }
  }
}

// App-wide events: 'intro:done', 'tone' (detail: 'dark'|'light'), 'section' (detail: id), 'motion' (detail: paused).
export const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => bus.addEventListener(type, e => fn(e.detail));
