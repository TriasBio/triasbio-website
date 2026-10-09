// Owner: chrome. Section ids -> the label a reader sees (matches each eyebrow and nav item).
// Used by the dial, the pill's aria-label and the per-anchor page title.
export const LABELS = {
  top: 'Re-timing medicine',
  statement: 'Re-timing medicine',
  why: 'Why timing',
  mrna: 'Why timing',
  care: 'Why care',
  platform: 'Platform',
  schedule: 'Platform',
  engine: 'Platform',
  business: 'Traction',
  team: 'Team',
  vision: 'Vision',
  contact: 'Request a design',
};

// Which dial entry (first section of each stretch) a section belongs to.
const DIAL_OF = { statement: 'top', why: 'care', mrna: 'care', schedule: 'platform', engine: 'platform' };
export const dialEntry = id => DIAL_OF[id] || id;

// Nearest section id for any in-page target (e.g. #hf belongs to #business).
export function sectionOf(id) {
  if (!id) return 'top';
  const el = document.getElementById(id);
  if (!el) return null;
  return el.closest('.sec[id]')?.id || id;
}

// Label for a section; falls back to the section's own eyebrow text.
export function labelFor(id) {
  const sec = sectionOf(id);
  if (!sec) return null;
  if (LABELS[sec]) return LABELS[sec];
  return document.getElementById(sec)?.querySelector('.eyebrow .l')?.textContent.trim() || null;
}
