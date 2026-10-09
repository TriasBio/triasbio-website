// Owner: 3D. Bakes the poster stills for the stage as inline SVG, from the same geometry as
// the WebGL scene (src/three/helix-curve.js):
//   .poster-helix  the strand (cap, UTRs, codon triplets, poly(A) tail), depth-sorted, plus a
//                  hidden protein layer (ribosomes and chains) for the dose step.
//   .poster-dial   the strand bent into the 24-hour dial, with hour ticks and a sun/moon marker.
// They show while WebGL loads and stay on their own on phones in low-power mode or with
// reduced motion. stage.js lights them with CSS (regions, the dial's lit arc, the marker).
// Writes between the <!-- helix:start --> / <!-- helix:end --> markers in partials/stage.html,
// and two standalone stills (colors baked in) that phones show as the background of every
// .fig-slot not holding the canvas: public/three/still-helix.svg and public/three/still-dial.svg
// (the dial lit to 22:00, where the closing ring starts).
// Run: node scripts/gen-static-helix.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  BASES, REGION_KEYS, REGIONS, regionAt, helixPoint, helixInward, axisPoint, rungLength, chainPath, CDS_RANGE,
  N_CODONS, TUBE_R, RUNG_R, BEAD_R, DIAL_R, DIAL_SPAN, hourOf, FIT_H, FIT_W, FOV,
} from '../src/three/helix-curve.js';

const f1 = n => +n.toFixed(1);
const f2 = n => +n.toFixed(2);
const SH = { A: 'a', G: 'g', C: 'c', U: 'u' };
const RK = Object.fromEntries(REGION_KEYS.map((k, i) => [k, i]));

// ---- Camera: matches src/three/scene.js (same fov and fit, in a 3:4 box) ----
const W = 600, H = 800;
const tanH = Math.tan((FOV / 2) * Math.PI / 180);
const CAM_Z = Math.max(FIT_H / tanH, FIT_W / (tanH * (W / H)));
const F = (H / 2) / tanH;
// The still pose (the scene's reduced-motion pose): sway 0.12, tilt 0.06, roll -0.03.
const RX = 0.06, RY = 0.12, RZ = -0.03;
function rot([x, y, z]) {
  let c = Math.cos(RZ), s = Math.sin(RZ);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(RY); s = Math.sin(RY);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(RX); s = Math.sin(RX);
  [y, z] = [y * c - z * s, y * s + z * c];
  return [x, y, z];
}
const project = p => { const [x, y, z] = rot(p); const d = CAM_Z - z; return [W / 2 + (x * F) / d, H / 2 - (y * F) / d, d, z]; };
const depthO = z => f2(0.42 + 0.58 * Math.min(1, Math.max(0, (z + 0.85) / 1.6))); // fog: back of the coil fades

// ---------------- Helix ----------------
const items = [];
const N = 170;
for (let s = 0; s < N; s++) {
  const t0 = s / N, t1 = (s + 1) / N;
  const a = project(helixPoint(t0)), b = project(helixPoint(t1));
  const zm = (a[3] + b[3]) / 2;
  const w = (TUBE_R * 2 * F) / ((a[2] + b[2]) / 2) * (t0 > REGIONS.polyA[0] ? 0.86 : 1);
  items.push({ d: (a[2] + b[2]) / 2, svg: `<line class="sb k${RK[regionAt((t0 + t1) / 2)]}" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke-width="${f1(w)}" stroke-opacity="${depthO(zm)}"/>` });
}
for (const b of BASES) {
  const p = helixPoint(b.t), d = helixInward(b.t), L = rungLength(b.base);
  const o = TUBE_R * 0.4 + RUNG_R;
  const p0 = [p[0] + d[0] * o, p[1], p[2] + d[2] * o];
  const p1 = [p[0] + d[0] * (o + L - RUNG_R * 2), p[1], p[2] + d[2] * (o + L - RUNG_R * 2)];
  const A = project(p0), B = project(p1);
  items.push({ d: (A[2] + B[2]) / 2 - 0.02, svg: `<line class="s${SH[b.base]} k${RK[b.region]}" x1="${f1(A[0])}" y1="${f1(A[1])}" x2="${f1(B[0])}" y2="${f1(B[1])}" stroke-width="${f1((RUNG_R * 2 * F) / A[2])}" stroke-opacity="${depthO((A[3] + B[3]) / 2)}"/>` });
}
// 5' cap: the bulb on a short bridge, trailing back from the first backbone point.
{
  const p0 = helixPoint(0), p1 = helixPoint(6 / 439); // the scene's 7th backbone sample
  let bx = p0[0] - p1[0], by = p0[1] - p1[1], bz = p0[2] - p1[2];
  const bl = Math.hypot(bx, by, bz);
  bx /= bl; by /= bl; bz /= bl;
  for (let k = 1; k <= 3; k++) {
    const P = project([p0[0] + bx * 0.075 * k, p0[1] + by * 0.075 * k, p0[2] + bz * 0.075 * k]);
    items.push({ d: P[2], svg: `<circle class="cp k0" cx="${f1(P[0])}" cy="${f1(P[1])}" r="${f1((0.05 * F) / P[2])}" fill-opacity="${depthO(P[3])}"/>` });
  }
  const P = project([p0[0] + bx * 0.39, p0[1] + by * 0.39, p0[2] + bz * 0.39]);
  items.push({ d: P[2], svg: `<ellipse class="cp k0" cx="${f1(P[0])}" cy="${f1(P[1])}" rx="${f1((0.15 * F) / P[2])}" ry="${f1((0.123 * F) / P[2])}" fill-opacity="${depthO(P[3])}"/>` });
  const E = project(helixPoint(1));
  items.push({ d: E[2], svg: `<circle class="cp sa k4" cx="${f1(E[0])}" cy="${f1(E[1])}" r="${f1((TUBE_R * 1.15 * F) / E[2])}" fill-opacity="${depthO(E[3])}"/>` });
}
items.sort((a, b) => b.d - a.d);

// Protein layer: ribosomes on the front of the coil, each with the chain it has made so far.
const riboT = u => CDS_RANGE[0] + (CDS_RANGE[1] - CDS_RANGE[0]) * u;
function basisAt(t) {
  const P = helixPoint(t), P2 = helixPoint(Math.min(1, t + 0.004)), hi = helixInward(t);
  const X = [-hi[0], -hi[1], -hi[2]];
  let Y = [P2[0] - P[0], P2[1] - P[1], P2[2] - P[2]];
  const dp = Y[0] * X[0] + Y[1] * X[1] + Y[2] * X[2];
  Y = Y.map((v, i) => v - X[i] * dp);
  const yl = Math.hypot(...Y);
  Y = Y.map(v => v / yl);
  const Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  return { P, X, Y, Z };
}
const local = (B, o) => [0, 1, 2].map(i => B.P[i] + B.X[i] * o[0] + B.Y[i] * o[1] + B.Z[i] * o[2]);
const prot = [];
// Pick three points on the front of the coil, spread through the coding sequence.
const front = [];
for (let u = 0.12; u < 0.98; u += 0.01) if (helixPoint(riboT(u))[2] > 0.45) front.push(u);
const picks = [front[Math.floor(front.length * 0.12)], front[Math.floor(front.length * 0.52)], front[Math.floor(front.length * 0.9)]];
picks.forEach((u, k) => {
  const B = basisAt(riboT(u));
  const path = chainPath(k + 1);
  const n = Math.max(1, Math.round(u * N_CODONS));
  const beads = [];
  for (let j = 0; j < n; j++) beads.push(project(local(B, path[n - 1 - j])));
  const L = project(local(B, [0.15, 0.04, 0.02])), S = project(local(B, [-0.12, -0.03, 0]));
  prot.push(beads.map(p => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1((BEAD_R * F) / p[2])}"/>`).join(''));
  prot.push(`<ellipse class="rb" cx="${f1(S[0])}" cy="${f1(S[1])}" rx="${f1((0.19 * F) / S[2])}" ry="${f1((0.14 * F) / S[2])}"/>`);
  prot.push(`<ellipse class="rb" cx="${f1(L[0])}" cy="${f1(L[1])}" rx="${f1((0.28 * F) / L[2])}" ry="${f1((0.235 * F) / L[2])}"/>`);
});

const helixSVG = `<svg class="poster poster-helix" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">`
  + `<g class="ph-s" stroke-linecap="round">${items.map(i => i.svg).join('')}</g>`
  + `<g class="ph-p">${prot.join('')}</g></svg>`;

// ---------------- Dial ----------------
// Same vertical scale as the WebGL canvas: FIT_H world units = half the box height.
const K = 600 / FIT_H;
const R = DIAL_R * K;
const dpt = (deg, r) => { const a = deg * Math.PI / 180; return [f1(Math.sin(a) * r), f1(-Math.cos(a) * r)]; };
const dparts = [];
for (let h = 0; h < 24; h++) {
  const major = h % 6 === 0;
  const [x1, y1] = dpt(h * 15, (DIAL_R - (major ? 0.86 : 0.72)) * K), [x2, y2] = dpt(h * 15, (DIAL_R - 0.56) * K);
  dparts.push(`<line class="${major ? 'tk mj' : 'tk'}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
}
const span = DIAL_SPAN * 360;
const [ax, ay] = dpt(span, R);
dparts.push(`<path class="pd-bb" d="M0 ${f1(-R)}A${f1(R)} ${f1(R)} 0 1 1 ${ax} ${ay}" stroke-width="${f1(TUBE_R * 2 * K)}"/>`);
dparts.push(`<circle class="pd-lit" r="${f1(R)}" pathLength="100" transform="rotate(-90)" stroke-width="${f1(TUBE_R * 2 * K)}" stroke-dasharray="0 100"/>`);
const rods = BASES.map(b => {
  const deg = (hourOf(b.t) / 24) * 360;
  const L = rungLength(b.base);
  const [x1, y1] = dpt(deg, R - (TUBE_R * 0.4 + RUNG_R) * K), [x2, y2] = dpt(deg, R - (TUBE_R * 0.4 + L - RUNG_R) * K);
  return `<line class="pr s${SH[b.base]}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
});
dparts.push(`<g stroke-width="${f1(RUNG_R * 2 * K)}">${rods.join('')}</g>`);
// The cap sits at 00:00, just before the top.
dparts.push(`<circle class="cp" cx="${f1(-0.075 * 2 * K)}" cy="${f1(-R)}" r="${f1(0.05 * K)}"/><ellipse class="cp" cx="${f1(-0.39 * K)}" cy="${f1(-R)}" rx="${f1(0.15 * K)}" ry="${f1(0.123 * K)}"/>`);
// Sun / moon / half-risen sun, the clock icon's shapes. stage.js rotates the arm to the hour.
const MR = (DIAL_R - 1.16) * K;
const rays = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  return `<line x1="${f2(12 + Math.sin(a) * 6.7)}" y1="${f2(12 - Math.cos(a) * 6.7)}" x2="${f2(12 + Math.sin(a) * 9.1)}" y2="${f2(12 - Math.cos(a) * 9.1)}"/>`;
}).join('');
dparts.push(`<g class="pd-mark" data-kind="moon"><g class="pd-glyph" data-r="${f1(MR)}" transform="translate(0 ${f1(-MR)})"><g transform="scale(2.4) translate(-12 -12)">`
  + `<path class="gm" d="M15 5.68A7 7 0 1 0 15 18.32A6.6 6.6 0 0 1 15 5.68Z" transform="rotate(-24 12 12)"/>`
  + `<g class="gs"><circle cx="12" cy="12" r="4.3"/><g stroke-width="1.6" stroke-linecap="round">${rays}</g></g>`
  + `<g class="gr"><path d="M7.1 15.5A4.9 4.9 0 0 1 16.9 15.5Z"/><line x1="2.5" y1="15.5" x2="21.5" y2="15.5" stroke-width="1.6" stroke-linecap="round"/></g>`
  + `</g></g></g>`);
const dialSVG = `<svg class="poster poster-dial" viewBox="-600 -600 1200 1200" aria-hidden="true" focusable="false"><g stroke-linecap="round">${dparts.join('')}</g></svg>`;

const out = `${helixSVG}\n${dialSVG}`;
const htmlPath = new URL('../partials/stage.html', import.meta.url);
const html = readFileSync(htmlPath, 'utf8');
if (!/<!-- helix:start -->[\s\S]*<!-- helix:end -->/.test(html)) throw new Error('helix markers not found in partials/stage.html');
writeFileSync(htmlPath, html.replace(/<!-- helix:start -->[\s\S]*<!-- helix:end -->/, `<!-- helix:start -->\n${out}\n<!-- helix:end -->`));
console.log(`posters: helix ${(helixSVG.length / 1024).toFixed(1)} KB, dial ${(dialSVG.length / 1024).toFixed(1)} KB, total ${(out.length / 1024).toFixed(1)} KB`);

// ---------------- Standalone stills for the phone slots ----------------
// Same drawings with the stage.css colors written in, since a CSS background image
// cannot read the page's styles.
const STILL_HOUR = 22;
const standalone = (svg, css) => svg
  .replace(/^<svg class="[^"]*"/, '<svg xmlns="http://www.w3.org/2000/svg"')
  .replace(/ aria-hidden="true" focusable="false">/, `><style>${css}</style>`);
const helixCSS = 'line{stroke:#e6e3dc}.sa{stroke:#ecebe6}.sg{stroke:#d7d5cf}.sc{stroke:#b3b1ac}.su{stroke:#9a9995}'
  + '.sb{stroke:#e6e3dc}circle,ellipse{stroke:none}.cp{fill:#f1ece2}.cp.sa{fill:#ecebe6}.ph-p{display:none}';
const dialCSS = '.pr{stroke-opacity:.9}.pr.sa{stroke:#ecebe6}.pr.sg{stroke:#d7d5cf}.pr.sc{stroke:#b3b1ac}.pr.su{stroke:#9a9995}'
  + '.pr.on{stroke:#8fc9a3;stroke-opacity:1}.pd-bb{fill:none;stroke:#e6e3dc;stroke-opacity:.55}.pd-lit{fill:none;stroke:#8fc9a3}'
  + '.tk{stroke:#bdbab3;stroke-opacity:.6;stroke-width:4}.tk.mj{stroke:#f4f1ea;stroke-width:6}.cp{fill:#f1ece2;stroke:none}'
  + '.pd-mark{fill:#f4f1ea;stroke:#f4f1ea}.pd-mark .gm,.pd-mark .gs circle,.pd-mark .gr path{stroke:none}.gs,.gr{display:none}';
const deg = (STILL_HOUR / 24) * 360;
const dialStill = dialSVG
  .replace(/stroke-dasharray="0 100"/, `stroke-dasharray="${f2((STILL_HOUR / 24) * 100)} 100"`)
  .replace('<g class="pd-mark" data-kind="moon">', `<g class="pd-mark" data-kind="moon" transform="rotate(${deg})">`)
  .replace(/(<g class="pd-glyph" data-r="[\d.]+") transform="translate\(0 (-?[\d.]+)\)"/, `$1 transform="translate(0 $2) rotate(${-deg})"`);
let rodI = 0;
const litStill = dialStill.replace(/class="pr (s[agcu])"/g, (m, sh) => {
  const on = hourOf(BASES[rodI++].t) <= STILL_HOUR;
  return `class="pr ${sh}${on ? ' on' : ''}"`;
});
const stillDir = new URL('../public/three/', import.meta.url);
mkdirSync(stillDir, { recursive: true });
const helixStill = standalone(helixSVG, helixCSS);
const dialStillOut = standalone(litStill, dialCSS);
writeFileSync(new URL('still-helix.svg', stillDir), helixStill);
writeFileSync(new URL('still-dial.svg', stillDir), dialStillOut);
console.log(`stills: helix ${(helixStill.length / 1024).toFixed(1)} KB, dial ${(dialStillOut.length / 1024).toFixed(1)} KB`);
