// Owner: contact. Copy-on-click for email addresses.
// The HTML ships a plain mailto link (works without JS). This upgrades each
// a.copy[data-copy] to a real button that copies the address and briefly says
// "Copied". If the clipboard is unavailable it falls back to the mailto link.

const ICON_COPY = '<svg viewBox="0 0 16 16" width="16" height="16" focusable="false"><rect x="5.25" y="5.25" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.75 3.4V3.2c0-.94-.76-1.7-1.7-1.7H4.2c-.94 0-1.7.76-1.7 1.7v4.85c0 .94.76 1.7 1.7 1.7h.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 16 16" width="16" height="16" focusable="false"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HOLD = 1800; // ms the "Copied" state stays up

// Write text to the clipboard. Returns true on success.
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  const prev = document.activeElement;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    // Inside an open modal the rest of the page is inert, so select within the dialog.
    (document.querySelector('dialog[open]') || document.body).appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  } finally {
    // Selecting the textarea took focus; hand it back to the control that was pressed.
    if (prev && prev !== document.activeElement && prev.isConnected) prev.focus({ preventScroll: true });
  }
}

// One polite live region per scope (the page, and each dialog, since a modal makes the page inert).
function liveFor(el) {
  const scope = el.closest('dialog') || document.body;
  let live = scope.querySelector(':scope > .copy-live');
  if (!live) {
    live = document.createElement('p');
    live.className = 'sr-only copy-live';
    live.setAttribute('aria-live', 'polite');
    scope.appendChild(live);
  }
  return live;
}

export function announce(el, msg) {
  const live = liveFor(el);
  live.textContent = '';
  setTimeout(() => { live.textContent = msg; }, 60);
}

// Show the "Copied" state on a control for a moment.
export function flashCopied(btn) {
  btn.classList.add('is-copied');
  clearTimeout(btn._copiedT);
  btn._copiedT = setTimeout(() => btn.classList.remove('is-copied'), HOLD);
}

function upgrade(a) {
  const text = a.dataset.copy;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = a.className;
  btn.dataset.copy = text;
  btn.dataset.mailto = a.getAttribute('href') || `mailto:${text}`;
  // The check swaps in for the copy icon in the same box, and "Copied" floats above it,
  // so the line never changes width (the paths grid would reflow otherwise).
  btn.innerHTML = `<span class="copy-text"></span><span class="sr-only">, copy address</span><span class="copy-ic" aria-hidden="true">${ICON_COPY}${ICON_CHECK}</span><span class="copy-tip" aria-hidden="true">Copied</span>`;
  btn.querySelector('.copy-text').textContent = a.textContent.trim();
  btn.title = 'Copy address';
  a.replaceWith(btn);
  return btn;
}

export function initCopy() {
  document.querySelectorAll('a.copy[data-copy]').forEach(upgrade);
  // Liven up the live regions now, so the first announcement is heard.
  document.querySelectorAll('button.copy').forEach(liveFor);

  document.addEventListener('click', async e => {
    const btn = e.target.closest('button.copy[data-copy]');
    if (!btn) return;
    const ok = await copyText(btn.dataset.copy);
    if (!ok) { location.href = btn.dataset.mailto; return; }
    flashCopied(btn);
    announce(btn, `Copied ${btn.dataset.copy}`);
  });
}
