// Owner: 3D. A short frame-rate probe. iOS Low Power Mode (and some battery savers) cap
// requestAnimationFrame at 30 fps, so a median frame time above ~28 ms over ~40 frames
// means "save power": phones then show the poster still and never start WebGL.
import { state } from '../core/state.js';

const FRAMES = 40;
const SLOW_MS = 28;

export function probePower() {
  return new Promise(resolve => {
    const times = [];
    let last = 0, skip = 4, done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const sorted = times.slice().sort((a, b) => a - b);
      const median = sorted.length ? sorted[sorted.length >> 1] : 16;
      state.lowPower = median > SLOW_MS;
      resolve(state.lowPower);
    };
    const step = now => {
      if (done) return;
      // A hidden tab pauses rAF; start over when it comes back so the gap is not counted.
      if (document.hidden) { last = 0; requestAnimationFrame(step); return; }
      if (last && skip-- <= 0) times.push(now - last);
      last = now;
      if (times.length >= FRAMES) finish(); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    // Never wait forever (a throttled background tab): decide with what we have.
    setTimeout(finish, 4000);
  });
}
