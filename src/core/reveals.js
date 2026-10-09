// Site-wide reveals. Section headlines rise word by word out of a mask; any
// element with [data-reveal] fades up 8px. Both reverse when you scroll back.
import { gsap } from 'gsap';
import { state } from './state.js';
import { EASE, DUR, STAGGER, reveal } from './motion.js';
import { splitWords } from './text.js';

const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function initReveals() {
  $$('h2.split').forEach(h => {
    const words = splitWords(h);
    if (state.reduced || h.dataset.noReveal != null) return;
    gsap.fromTo(words, { yPercent: 110 }, {
      yPercent: 0, duration: DUR.l, ease: EASE, stagger: STAGGER,
      scrollTrigger: { trigger: h, start: 'top 88%', toggleActions: 'play none none reverse' },
    });
  });
  $$('[data-reveal]').forEach(el => reveal(el));
}
