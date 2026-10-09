// Owner: team. Team (18:00).
// 1. Each founder leads with one line; the full bio and "Previously" sit behind a "More"
//    disclosure (a real button with aria-expanded, collapsed by default). The open and close
//    animation is CSS (grid rows 0fr to 1fr), so reduced motion simply snaps.
//    Until this runs, the bios stay open and the buttons stay hidden (see team.css).
// 2. Founders, advisors and the backer groups fade up 8px as they enter; scrolling back reverses it.
import { reveal } from '../core/motion.js';

const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function initTeam() {
  const root = document.getElementById('team');
  if (!root) return;

  $$('.person', root).forEach(person => {
    const btn = person.querySelector('.more');
    const bio = btn && document.getElementById(btn.getAttribute('aria-controls'));
    if (!bio) return;
    const set = open => {
      btn.setAttribute('aria-expanded', String(open));
      person.classList.toggle('is-open', open);
    };
    set(false);
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  });
  root.classList.add('has-more');

  reveal($$('.person', root), { stagger: 0.08 });
  reveal($$('.advisor', root), { stagger: 0.06 });
  reveal($$('.backers-group', root), { stagger: 0.08 });
}
