// Split helpers. Text stays in the DOM in reading order; spans only wrap it.
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// Wrap each word in .w > span, so a mask can reveal it.
export function splitWords(root) {
  if (root.dataset.split) return $$('.w > span', root);
  root.dataset.split = '1';
  const walk = node => {
    [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        ch.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const w = document.createElement('span');
          w.className = 'w';
          const inner = document.createElement('span');
          // Display hyphens are wide in Instrument Serif: tighten them (24-hour, Short-lived).
          if (/\w-\w/.test(part)) inner.innerHTML = part.split('-').map(t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))).join('<span class="hy">-</span>');
          else inner.textContent = part;
          w.appendChild(inner);
          frag.appendChild(w);
        });
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1) walk(ch);
    });
  };
  walk(root);
  return $$('.w > span', root);
}

// Wrap each character of a big number in .ch > span. Skips .of suffixes.
export function splitChars(numEl) {
  const walk = node => {
    [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        [...ch.textContent].forEach(c => {
          if (c === ' ') { frag.appendChild(document.createTextNode(' ')); return; }
          const o = document.createElement('span');
          o.className = 'ch';
          const i = document.createElement('span');
          i.textContent = c;
          o.appendChild(i);
          frag.appendChild(o);
        });
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1 && !ch.classList.contains('of') && !ch.classList.contains('ch')) walk(ch);
    });
  };
  walk(numEl);
  return $$('.ch > span', numEl);
}
