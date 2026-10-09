// Owner: chrome. The clock sheet: a modal dialog with the 24-hour dial and the section list.
// Desktop and tablet: a popover under the pill. Phone (< 640px): a full-height overlay below
// the header, list and button in thumb reach. Focus moves in, Tab stays inside, Esc and the
// scrim close it, and focus returns to the pill. Links close it; core/scroll.js does the jump.
// The foot is pinned (the body scrolls if it must) and holds "Pause motion" (WCAG 2.2.2):
// state.paused, html.paused, localStorage 'trias:paused' and a 'motion' event.
import { state, onTick, on, emit } from '../core/state.js';
import { buildDial } from './dial.js';
import { LABELS, dialEntry } from './sections.js';

const PHONE = matchMedia('(max-width: 639px)');

export function initSheet(btn) {
  const root = document.documentElement;
  const sheet = document.getElementById('sheet');
  if (!sheet || !btn) return null;
  const card = sheet.querySelector('.sheet-card');
  const links = [...sheet.querySelectorAll('.sheet-list a[data-h]')];
  const entries = links.map(a => ({ id: a.getAttribute('href').slice(1), h: +a.dataset.h }));
  const dialSvg = sheet.querySelector('#dial');
  const dialWrap = sheet.querySelector('.dial-wrap');
  const dial = buildDial(dialSvg, entries);
  const pause = sheet.querySelector('.sheet-pause');
  const outside = () => [document.getElementById('main'), document.querySelector('.site-foot')].filter(Boolean);
  let open = false, closeTimer = 0, current = null;

  const render = () => {
    const T = state.clockOverride ?? state.T;
    const entry = dialEntry(state.section);
    dial.update(T, entry, LABELS[state.section] || '');
    if (entry !== current) {
      current = entry;
      links.forEach(a => {
        if (a.getAttribute('href') === `#${entry}`) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }
  };

  // Desktop popover: right edge lines up with the pill.
  const place = () => {
    const r = btn.getBoundingClientRect();
    sheet.style.setProperty('--sheet-right', `${Math.max(8, Math.round(root.clientWidth - r.right))}px`);
  };

  // Dial text is set in the dial's own units. Scale it so it renders at 11px or more at any
  // dial size, and drop the labels that would crowd a small dial (the list names them anyway).
  const fitDial = () => {
    const w = dialWrap?.offsetWidth || 0;
    if (!w) return;
    dialSvg.style.setProperty('--dial-k', (200 / w).toFixed(3));
    dialWrap.classList.toggle('is-small', w < 200);
    dialWrap.classList.toggle('is-tiny', w < 170);
  };

  const focusables = () => [...card.querySelectorAll('a[href], button:not([disabled])')]
    .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');

  function show() {
    if (open) return;
    open = true;
    clearTimeout(closeTimer);
    place();
    render();
    sheet.hidden = false;
    fitDial();
    void card.offsetWidth; // commit the closed state so the open transition runs
    sheet.classList.add('is-open');
    root.classList.add('sheet-open');
    btn.setAttribute('aria-expanded', 'true');
    outside().forEach(el => { el.inert = true; });
    if (PHONE.matches) root.style.overflow = 'hidden';
    (links.find(a => a.hasAttribute('aria-current')) || links[0])?.focus({ preventScroll: true });
  }

  function hide({ restore = true } = {}) {
    if (!open) return;
    open = false;
    sheet.classList.remove('is-open');
    root.classList.remove('sheet-open');
    btn.setAttribute('aria-expanded', 'false');
    outside().forEach(el => { el.inert = false; });
    root.style.overflow = '';
    dial.hover(null);
    closeTimer = setTimeout(() => { if (!open) sheet.hidden = true; }, state.reduced ? 0 : 380);
    if (restore) btn.focus({ preventScroll: true });
  }

  btn.addEventListener('click', () => (open ? hide() : show()));

  sheet.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) { hide(); return; }
    // Section links and "Request a design": close and let the link do its job
    // (core/scroll.js jumps; the contact form opens from [data-action="request"]).
    if (e.target.closest('a[href]')) hide({ restore: false });
  });

  // Anything else on the page (the header's brand, nav or button) also closes it.
  document.addEventListener('click', e => {
    if (!open || card.contains(e.target) || btn.contains(e.target) || sheet === e.target) return;
    hide({ restore: !e.target.closest('a[href], button') });
  });

  document.addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], at = document.activeElement;
    if (e.shiftKey && (at === first || !card.contains(at))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (at === last || !card.contains(at))) { e.preventDefault(); first.focus(); }
  });

  // Hovering or focusing a row points the dial at that section.
  links.forEach(a => {
    const id = a.getAttribute('href').slice(1);
    a.addEventListener('pointerenter', () => dial.hover(id));
    a.addEventListener('pointerleave', () => dial.hover(null));
    a.addEventListener('focus', () => dial.hover(id));
    a.addEventListener('blur', () => dial.hover(null));
  });

  onTick(() => { if (open) render(); });
  window.addEventListener('resize', () => {
    if (!open) return;
    place();
    fitDial();
    root.style.overflow = PHONE.matches ? 'hidden' : '';
  });

  // Pause motion. A toggle: the name stays "Pause motion" and aria-pressed carries the state
  // (the switch shows it). main.js restores the saved choice before this runs.
  const syncPause = () => pause?.setAttribute('aria-pressed', String(!!state.paused));
  pause?.addEventListener('click', () => {
    state.paused = !state.paused;
    root.classList.toggle('paused', state.paused);
    try { localStorage.setItem('trias:paused', state.paused ? '1' : '0'); } catch {}
    syncPause();
    emit('motion', state.paused);
  });
  on('motion', syncPause);
  syncPause();

  return { show, hide, isOpen: () => open };
}
