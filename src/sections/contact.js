// Owner: contact. Vision (22:00), contact (24:00), footer and the request form.
// The closing ring itself is drawn by the 3D stage from state.T (it reads 24:00 at the bottom).
// Nothing here moves on its own, so "Pause motion" needs no handling (the form's entrance is
// handled in contact.css).
import { initCopy } from './contact/copy.js';
import { initRequest } from './contact/request.js';

export function initContact() {
  const run = (name, fn) => { try { fn(); } catch (e) { console.error(`[contact:${name}]`, e); } };
  run('copy', initCopy);
  run('request', initRequest);
}
