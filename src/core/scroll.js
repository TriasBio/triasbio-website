// The page clock. Native scroll only (no smooth-scroll library, no scroll hijack).
// Every element with data-time is an anchor. A section's hour begins when its eyebrow
// reaches the landing line just under the header (where a nav jump puts it), so a click
// on "Results · 10:00" shows 10:00 in the clock. Between anchors the hour interpolates.
// The current section (nav highlight, tone, 3D presence) is the one under a line 35% down.
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state, emitTick, emit } from './state.js';

const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
let anchors = [];
let sections = [];

function headerH() {
  const h = document.getElementById('topbar')?.getBoundingClientRect().height || 64;
  document.documentElement.style.setProperty('--header-h', `${Math.round(h)}px`);
  return h;
}

// Where a nav jump lands an eyebrow: just under the header.
export function landLine() { return headerH() + (innerWidth < 1000 ? 24 : 32); }
export const SECTION_LINE = 0.35;

// The element whose top marks an anchor's hour: a section's eyebrow, a moment's label, or the element.
function markOf(el) {
  return el.querySelector(':scope .eyebrow, :scope .tag, :scope [class*="-tag"]') || el;
}

function boxTop(el) {
  // Pinned elements sit inside a pin-spacer; measure the spacer so pin state does not matter.
  const box = el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el;
  return box.getBoundingClientRect().top + window.scrollY;
}

export function computeAnchors() {
  headerH();
  sections = $$('.sec[id]');
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const land = landLine();
  const pts = $$('[data-time]')
    .map(el => {
      const mark = markOf(el);
      const off = mark === el ? 0 : mark.getBoundingClientRect().top - el.getBoundingClientRect().top;
      return [clamp(boxTop(el) + off - land, 0, max), +el.dataset.time];
    })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // Clock starts at 00:00 at the top and ends at 24:00 at the bottom. Hours never run backwards.
  anchors = [[0, 0]];
  for (const [y, h] of pts) {
    const last = anchors[anchors.length - 1];
    if (h < last[1]) continue;
    if (y <= last[0]) { last[1] = Math.max(last[1], h); continue; }
    anchors.push([y, h]);
  }
  anchors.push([max, 24]);
  state.dirty = true;
  tick();
}

export function timeAt(y) {
  for (let i = 1; i < anchors.length; i++) {
    const [y0, h0] = anchors[i - 1], [y1, h1] = anchors[i];
    if (y <= y1) return h0 + (h1 - h0) * clamp((y - y0) / Math.max(1, y1 - y0));
  }
  return 24;
}

let lastSection = '';
export function tick() {
  if (!anchors.length) return;
  const y = window.scrollY;
  const T = clamp(timeAt(y), 0, 24);
  if (Math.abs(T - state.T) > 1e-4) state.dirty = true;
  state.T = T;
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  state.progress = clamp(y / max);
  const line = innerHeight * SECTION_LINE;
  const cur = sections.find(s => { const r = s.getBoundingClientRect(); return r.top <= line && r.bottom > line; })
    || (y < 10 ? sections[0] : null);
  if (cur && cur.id !== lastSection) {
    lastSection = cur.id;
    state.section = cur.id;
    state.group = cur.dataset.group || null;
    emit('section', cur.id);
  }
  document.documentElement.classList.toggle('scrolled', y > 40);
  emitTick();
}

// Jump to an in-page id, landing the section's eyebrow on the landing line.
// A smooth jump survives layout changes on the way: refreshes are held until it ends,
// and if one happens anyway the jump is re-aimed at the target's new position.
let jump = null;       // { id } while a smooth jump is in flight
let jumpIdle = 0;      // timer that ends the jump once scrolling stops
let heldRefresh = false;

function targetTop(id) {
  let el = null;
  try { el = document.querySelector(id); } catch { return null; }
  if (!el) return null;
  const box = el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el;
  let top = box.getBoundingClientRect().top + window.scrollY;
  const eb = el.matches('.sec') ? el.querySelector('.eyebrow') : null;
  if (eb) top += eb.getBoundingClientRect().top - el.getBoundingClientRect().top;
  else top += headerH() - landLine(); // no eyebrow: put the element's top just under the header
  return Math.max(0, top - landLine());
}

function endJump() {
  clearTimeout(jumpIdle);
  const j = jump;
  jump = null;
  if (heldRefresh) {
    heldRefresh = false;
    ScrollTrigger.refresh();
    // The refresh can move the target; settle on it without another animation.
    if (j) { const t = targetTop(j.id); if (t != null && Math.abs(t - window.scrollY) > 4) window.scrollTo({ top: t, behavior: 'auto' }); }
  }
}

export function jumpTo(id, { instant = false } = {}) {
  const smooth = !state.reduced && !instant;
  const top = !id || id === '#top' || id === '#' ? 0 : targetTop(id);
  if (top == null) return;
  if (smooth) {
    jump = { id };
    clearTimeout(jumpIdle);
    jumpIdle = setTimeout(endJump, 1600); // ends early on scrollend or when scrolling goes quiet
  }
  window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
}
export const jumping = () => !!jump;

// Keyboard focus follows the jump, so the next Tab continues from the target (fixes the skip link).
function focusTarget(id) {
  const target = id.length > 1 && id !== '#top' ? document.querySelector(id) : document.getElementById('top');
  if (!target) return;
  if (!target.hasAttribute('tabindex')) { target.setAttribute('tabindex', '-1'); target.dataset.jumpTarget = ''; }
  target.focus({ preventScroll: true });
}

export function initScroll() {
  window.addEventListener('scroll', () => {
    if (jump) { clearTimeout(jumpIdle); jumpIdle = setTimeout(endJump, 180); }
    tick();
  }, { passive: true });
  window.addEventListener('scrollend', () => { if (jump) endJump(); });
  // A reader who takes over (wheel, touch, keys) ends the jump where they are.
  ['wheel', 'touchstart', 'keydown'].forEach(t => window.addEventListener(t, () => { if (jump) endJump(); }, { passive: true }));

  ScrollTrigger.addEventListener('refresh', () => {
    computeAnchors();
    // Something refreshed mid-jump anyway (which stops a native smooth scroll): re-aim it.
    if (jump) { const t = targetTop(jump.id); if (t != null) window.scrollTo({ top: t, behavior: 'smooth' }); }
  });
  let rz;
  const later = () => {
    clearTimeout(rz);
    rz = setTimeout(() => { if (jump) heldRefresh = true; else ScrollTrigger.refresh(); }, 150);
  };
  // Phones: the browser toolbar showing or hiding changes only the height. Ignore that.
  let lastW = innerWidth, lastH = innerHeight;
  window.addEventListener('resize', () => {
    const dw = Math.abs(innerWidth - lastW), dh = Math.abs(innerHeight - lastH);
    lastW = innerWidth; lastH = innerHeight;
    if (state.touch && dw === 0 && dh < 160) return;
    later();
  });
  let lastBodyH = 0;
  new ResizeObserver(([e]) => {
    const h = e.contentRect.height;
    if (Math.abs(h - lastBodyH) < 1) return;
    lastBodyH = h;
    later();
  }).observe(document.body);
  // In-page links: land below the header. Modules can stop this with e.preventDefault() first,
  // in the capture phase (for example [data-action="request"] opens the form instead).
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const id = a.getAttribute('href');
    e.preventDefault();
    jumpTo(id);
    try { focusTarget(id); } catch {}
    if (id.length > 1) history.replaceState(null, '', id === '#top' ? location.pathname : id);
  });
  computeAnchors();
}
