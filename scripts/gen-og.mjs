// Owner: hero. Renders the 1200x630 link-preview image (public/og.png) with headless
// Chrome, from the same pieces as the first screen: the 00:00 night sky, the 24-hour
// ring with the moon at the top, "Re-timing medicine." and the one-line subline.
//   node scripts/gen-og.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ringBaseSVG, starsSVG } from '../src/hero/ring-svg.js';
import { skyAt, css, cssA } from '../src/hero/sky.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const logo = readFileSync(join(root, 'public/logo.png')).toString('base64');
const night = skyAt(0);

// Geometry mirrors src/css/hero.css: the ring box holds the SVG (viewBox 1200), the rods'
// outer ends sit at .3867 of it and the moon orbits at .2917.
const W = 1200, H = 630;
const BOX = 980, CY = 404;
const ORBIT = BOX * 0.29167;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&display=block">
<style>
*{margin:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;position:relative;overflow:hidden;background:#07090f;color:#f4f1ea;font-family:Geist,sans-serif}
.sky{position:absolute;inset:0;background:linear-gradient(${css(night.top)} 0%, ${css(night.mid)} 50%, ${css(night.low)} 100%)}
.sky-stars{position:absolute;inset:0;width:100%;height:100%;opacity:.9}
.moonlight{position:absolute;left:${W / 2 - 230}px;top:${CY - ORBIT - 230}px;width:460px;height:460px;border-radius:50%;background:radial-gradient(closest-side,rgb(196 210 255/.2),rgb(196 210 255/0))}
.fade{position:absolute;inset:0;background:linear-gradient(transparent 56%, rgb(9 16 36/.5) 80%, #07090f 100%)}
.ring{position:absolute;left:${W / 2 - BOX / 2}px;top:${CY - BOX / 2}px;width:${BOX}px;height:${BOX}px;
  --m:radial-gradient(430px 215px at 50% ${BOX / 2 + 34}px, rgb(0 0 0/.26), rgb(0 0 0/.32) 58%, #000 100%);-webkit-mask-image:var(--m);mask-image:var(--m)}
.ring svg{width:100%;height:100%}
.moon{position:absolute;left:${W / 2 - 13}px;top:${CY - ORBIT - 13}px;width:26px;height:26px;filter:drop-shadow(0 0 8px rgb(200 214 255/.55))}
.brand{position:absolute;left:48px;top:40px;display:flex;align-items:center;gap:12px;font-weight:600;font-size:24px;letter-spacing:-.01em}
.brand img{width:36px;height:36px;border-radius:9px}
.copy{position:absolute;left:0;right:0;bottom:54px;text-align:center}
h1{font-family:'Instrument Serif',serif;font-weight:400;font-size:132px;line-height:.9;letter-spacing:-.02em}
h1>span{display:block}
.hy{margin-inline:-.05em} /* as on the site (base.css): Instrument Serif's hyphen is wide */
h1 em{font-style:italic;text-shadow:0 0 .26em ${cssA(night.glow, 0.5)},0 0 .8em ${cssA(night.glow, 0.2)}}
p{margin-top:24px;font-size:24px;color:rgb(244 241 234/.8)}
</style></head><body>
<div class="sky"></div>${starsSVG()}<div class="moonlight"></div><div class="fade"></div>
<div class="ring">${ringBaseSVG()}</div>
<svg class="moon" viewBox="-12 -12 24 24"><defs><mask id="m"><rect x="-12" y="-12" width="24" height="24" fill="#fff"/><circle cx="5.2" cy="-3.6" r="8.6" fill="#000"/></mask></defs><circle r="10" fill="#e9edf7" fill-opacity=".1"/><circle r="10" fill="#eef1f8" mask="url(#m)"/></svg>
<div class="brand"><img src="data:image/png;base64,${logo}" alt="">TriasBio</div>
<div class="copy"><h1><span>Re<span class="hy">-</span>timing</span><span><em>medicine.</em></span></h1><p>mRNA medicines that make their protein at the right hour.</p></div>
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'og-'));
writeFileSync(join(dir, 'og.html'), html);
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  `--window-size=${W},${H}`, '--virtual-time-budget=6000',
  `--screenshot=${join(root, 'public/og.png')}`, `file://${join(dir, 'og.html')}`,
], { stdio: 'pipe' });
console.log('wrote public/og.png');
