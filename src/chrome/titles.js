// Owner: chrome. Page title per anchor. After a jump from the nav, the sheet or the footer
// (anything that changes the hash) the title names the section, "Results · TriasBio".
// Back at the top it returns to the default. A first load on a #hash gets its title too.
import { on } from '../core/state.js';
import { labelFor } from './sections.js';

export const DEFAULT_TITLE = 'TriasBio · Re-timing medicine';

export function initTitles() {
  const fromHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const label = id && id !== 'top' ? labelFor(id) : null;
    // Sections without a label of their own (the statement) keep the default.
    const next = label && label !== 'Re-timing medicine' ? `${label} · TriasBio` : DEFAULT_TITLE;
    if (document.title !== next) document.title = next;
  };

  // core/scroll.js handles in-page links on document and rewrites the hash with
  // history.replaceState (no hashchange event). This listener is added after it, so the
  // new hash is already in place. A link the contact form intercepts leaves the hash alone.
  document.addEventListener('click', e => {
    if (e.target.closest('a[href^="#"]')) fromHash();
  });
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('popstate', fromHash);
  on('section', id => { if (id === 'top' && document.title !== DEFAULT_TITLE) document.title = DEFAULT_TITLE; });
  fromHash();
}
