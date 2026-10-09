// One motion language for the whole site: one curve, 400 to 700 ms, body text
// fades up 8px, big reveals tied to scroll so scrolling back reverses them.
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { state } from './state.js';

gsap.registerPlugin(CustomEase);
export const EASE_CSS = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
export const EASE = CustomEase.create('trias', '0.2,0.7,0.2,1');
export const DUR = { s: 0.4, m: 0.55, l: 0.7 };
export const STAGGER = 0.04;

// Scroll-linked, reversible reveal for one element or a list.
// Plays when the element's top passes `start`, reverses when you scroll back above it.
export function reveal(targets, { y = 8, start = 'top 88%', stagger = 0, duration = DUR.m, trigger } = {}) {
  if (state.reduced) return null;
  const els = gsap.utils.toArray(targets);
  if (!els.length) return null;
  return gsap.fromTo(els, { opacity: 0, y }, {
    opacity: 1, y: 0, duration, ease: EASE, stagger,
    scrollTrigger: { trigger: trigger || els[0], start, toggleActions: 'play none none reverse' },
  });
}
