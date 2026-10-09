// Owner: hero. Node script (not part of the app bundle). Writes the static ring SVG
// and the star field into partials/hero.html between the ring:* markers, so the first
// screen paints its ring instantly and without JS.
//   node src/hero/build-ring.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ringBaseSVG, ringLitSVG, starsSVG } from './ring-svg.js';

const file = fileURLToPath(new URL('../../partials/hero.html', import.meta.url));
let html = readFileSync(file, 'utf8');
const put = (name, markup) => {
  const re = new RegExp(`(<!-- ring:${name}:start -->)[\\s\\S]*?(<!-- ring:${name}:end -->)`);
  if (!re.test(html)) throw new Error(`marker ring:${name} missing`);
  html = html.replace(re, `$1${markup}$2`);
};
put('stars', starsSVG());
put('base', ringBaseSVG());
put('lit', ringLitSVG());
writeFileSync(file, html);
console.log('ring written to partials/hero.html');
