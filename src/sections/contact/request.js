// Owner: contact. The request form.
// Every [data-action="request"] control (hero, header, clock sheet, contact, footer) opens one <dialog>.
// One capture-phase listener on document catches them before core/scroll.js, which skips
// prevented clicks; without JS those links still go to #contact.
// There is no backend: on submit we validate, open the visitor's email app with the request
// filled in, and switch to a confirmation that shows the address to copy in case no mail app opened.
import { state } from '../../core/state.js';
import { copyText, announce, flashCopied } from './copy.js';

const TO = 'info@triasbio.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const KEYS = ['name', 'email', 'protein'];
const RULES = {
  name: v => (v ? '' : 'Enter your name.'),
  email: v => (!v ? 'Enter your email address.' : EMAIL_RE.test(v) ? '' : 'Enter an email address like name@company.com.'),
  protein: v => (v ? '' : 'Enter the protein and the system you express it in.'),
};

const visible = el => !!el && el.isConnected && el.getClientRects().length > 0 && !el.closest('[hidden], [inert]');

export function initRequest() {
  const dlg = document.getElementById('request');
  // No <dialog> support: leave the links alone so they scroll to #contact.
  if (!dlg || typeof dlg.showModal !== 'function') return;

  const form = dlg.querySelector('.req-form');
  const viewForm = dlg.querySelector('.req-view-form');
  const viewDone = dlg.querySelector('.req-view-done');
  const titleForm = dlg.querySelector('#req-title');
  const titleDone = dlg.querySelector('#req-done-title');
  const fields = Object.fromEntries(KEYS.map(k => [k, form.elements[k]]));
  let opener = null;
  let tried = false;      // validate live only after the first submit attempt
  let message = '';       // the last request, for "Copy request"

  const check = key => {
    const input = fields[key];
    const msg = RULES[key](input.value.trim());
    const err = dlg.querySelector(`#req-${key}-err`);
    err.textContent = msg;
    err.hidden = !msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  };
  const clearErrors = () => KEYS.forEach(k => {
    fields[k].removeAttribute('aria-invalid');
    const err = dlg.querySelector(`#req-${k}-err`);
    err.textContent = '';
    err.hidden = true;
  });

  const show = view => {
    const done = view === 'done';
    viewForm.hidden = done;
    viewDone.hidden = !done;
    dlg.setAttribute('aria-labelledby', done ? 'req-done-title' : 'req-title');
    dlg.classList.toggle('is-done', done);
  };

  const open = from => {
    opener = from;
    if (dlg.open) return;
    document.documentElement.classList.add('req-open');
    dlg.showModal();
    dlg.querySelector('.req-panel').scrollTop = 0;
    // On touch screens, focusing a field would throw up the keyboard over the form, so land on the title.
    const target = viewDone.hidden && !state.touch ? fields.name : (viewDone.hidden ? titleForm : titleDone);
    target.focus({ preventScroll: true });
  };

  dlg.addEventListener('close', () => {
    document.documentElement.classList.remove('req-open');
    // After a finished request, the next open starts fresh. An unfinished one keeps what was typed.
    if (!viewDone.hidden) { form.reset(); clearErrors(); tried = false; show('form'); }
    // Focus goes back to the control that opened the form. The clock sheet closes itself when
    // its button is pressed, so a request from the sheet hands focus to the clock button.
    const back = opener?.closest('#sheet') ? document.getElementById('clock-btn') : (visible(opener) ? opener : null);
    back?.focus({ preventScroll: true });
    opener = null;
  });

  // Every request control on the page, in the capture phase so core/scroll.js sees a prevented click.
  document.addEventListener('click', e => {
    const t = e.target.closest?.('[data-action="request"]');
    if (!t || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let "open in new tab" work
    e.preventDefault();
    open(t);
  }, true);

  // Close: the X, Done, or a click on the backdrop (press and release both outside the panel).
  let downOnBackdrop = false;
  dlg.addEventListener('pointerdown', e => { downOnBackdrop = e.target === dlg; });
  dlg.addEventListener('click', e => {
    if (e.target.closest('[data-req-close]')) { dlg.close(); return; }
    if (e.target === dlg && downOnBackdrop) dlg.close();
    downOnBackdrop = false;
  });

  form.addEventListener('input', e => {
    if (tried && KEYS.includes(e.target.name)) check(e.target.name);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    tried = true;
    const ok = KEYS.map(check);
    const bad = KEYS.find((k, i) => !ok[i]);
    if (bad) { fields[bad].focus(); return; }

    const name = fields.name.value.trim();
    const email = fields.email.value.trim();
    const protein = fields.protein.value.trim();
    const first = protein.split(/\r?\n/)[0].trim();
    const subject = `Design request: ${first.length > 80 ? `${first.slice(0, 79)}…` : first}`;
    const body = `Name: ${name}\nEmail: ${email}\nProtein and expression system: ${protein}\n`;
    message = `To: ${TO}\nSubject: ${subject}\n\n${body}`;

    const a = document.createElement('a');
    a.href = `mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
    a.hidden = true;
    viewDone.appendChild(a);
    a.click();
    a.remove();

    show('done');
    dlg.querySelector('.req-panel').scrollTop = 0;
    titleDone.focus({ preventScroll: true });
  });

  // "Copy request": the whole message, for webmail users whose browser has no mail app.
  dlg.querySelector('[data-copy-message]')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    if (!message) return;
    if (await copyText(message)) {
      flashCopied(btn);
      announce(btn, 'Request copied');
    }
  });
}
