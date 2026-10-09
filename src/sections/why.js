// Owner: why. Why timing (04:00) and Why mRNA (05:00).
// 1. The three numbers rise digit by digit as the stats row enters; scrolling back reverses it.
// 2. The 24-hour disease strip draws itself hour by hour with scroll (--p, 0..1 of the day).
// 3. The half-life bars grow with scroll (--grow, 0..1) and shrink again on the way back up.
// With reduced motion nothing moves: the CSS defaults (--p: 1, --grow: 1) are the final state.
// No ambient loops here (everything is tied to scroll), so "Pause motion" has nothing to stop.
import { gsap } from 'gsap';
import { state } from '../core/state.js';
import { EASE, DUR, STAGGER } from '../core/motion.js';
import { splitChars } from '../core/text.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// Scrub a CSS custom property on `el` from 0 to 1 across a scroll range.
function scrubVar(el, name, ease, trigger) {
  const o = { v: 0 };
  const set = () => el.style.setProperty(name, o.v.toFixed(4));
  set();
  return gsap.to(o, { v: 1, ease, onUpdate: set, scrollTrigger: { trigger: el, scrub: 0.5, ...trigger } });
}

export function initWhy() {
  if (state.reduced) return;

  // 1. Big numbers: digits rise out of a mask, small stagger, columns left to right.
  const stats = $('.why-stats');
  if (stats) {
    const tl = gsap.timeline({ scrollTrigger: { trigger: stats, start: 'top 86%', toggleActions: 'play none none reverse' } });
    $$('.stat', stats).forEach((stat, i) => {
      const n = $('.stat-n', stat);
      const at = i * 0.1;
      tl.fromTo(splitChars(n), { yPercent: 105 }, { yPercent: 0, duration: DUR.l, ease: EASE, stagger: STAGGER }, at);
      const of = $('.of', n);
      if (of) tl.fromTo(of, { opacity: 0 }, { opacity: 1, duration: DUR.m, ease: EASE }, at + 0.2);
      tl.fromTo($$('.stat-t, .cite', stat), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: DUR.m, ease: EASE, stagger: 0.05 }, at + 0.15);
    });
  }

  // 2. The strip runs like a clock: linear, 00:00 to 24:00 (horizontal on every screen size).
  const plot = $('.ds-plot');
  if (plot) scrubVar(plot, '--p', 'none', { start: 'top 88%', end: 'top 42%' });

  // 3. Half-life bars.
  const hl = $('.halflife');
  if (hl) scrubVar(hl, '--grow', EASE, { start: 'top 85%', end: 'center 50%' });
}
