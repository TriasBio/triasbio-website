// Owner: 3D. Shared geometry for the mRNA strand. Pure math (no three.js), so the WebGL
// scene and the script that bakes the poster still (scripts/gen-static-helix.mjs) draw
// exactly the same molecule.
//
// The message, 5' to 3': a cap, a short 5' UTR (bases evenly spaced), the coding
// sequence (bases grouped in codons of three, with a gap between codons), a 3' UTR
// (evenly spaced again) and a uniform poly(A) tail. The shape is the logo's: a loose
// coil of one and a half turns, so seen from the front the strand runs down the right,
// crosses on a diagonal, and runs down the left, each base a rung pointing in toward
// the axis (face-on along the sides, where the codon triplets read clearly).
// In dial mode the same strand bends into a 24-hour ring: 00:00 at the top, clockwise.

export const HEIGHT = 7.2;   // top to bottom of the axis, world units
export const TURNS = 1.5;
export const TUBE_R = 0.058; // backbone radius
export const RUNG_R = 0.036; // base rung radius
export const RUNG_LONG = 0.46;  // purines (A, G)
export const RUNG_SHORT = 0.34; // pyrimidines (C, U)
export const DIAL_R = 2.62;  // dial radius (backbone circle)
export const DIAL_SPAN = 0.984; // fraction of the circle the strand covers (a hairline gap at 00:00)
// Camera fit (fov 30): the canvas always shows at least this half-height and half-width.
export const FIT_H = 4.3, FIT_W = 2.85, FOV = 30;

// Illustrative sequence. Kozak context before AUG; 16 codons from AUG to the UAA stop.
const UTR5 = 'GAGCCACC';
const CDS = 'AUGGCCUUCCAGGAGCUGAAGCGCACCUACGACAUCGGCCAGAAGUAA';
const UTR3 = 'GCUCGCUU';
const POLYA = 'AAAAAAAAAAAAAA';

export const REGION_KEYS = ['cap', 'utr5', 'cds', 'utr3', 'polyA'];
export const REGION_LABELS = {
  cap: '5′ cap', utr5: '5′ UTR', cds: 'Coding sequence', utr3: '3′ UTR', polyA: 'Poly(A) tail',
};

// Spacing along the strand, in base steps.
const STEP = 1, CODON_GAP = 0.95, REGION_GAP = 1.4, CAP_GAP = 1.9, POLYA_STEP = 0.9, END_PAD = 0.8;

// One entry per base: { base, region, codon (CDS index, else -1), k (0..2 in codon), s, t }.
export const BASES = [];
let s = CAP_GAP;
for (const ch of UTR5) { BASES.push({ base: ch, region: 'utr5', codon: -1, k: 0, s }); s += STEP; }
s += REGION_GAP - STEP;
for (let i = 0; i < CDS.length; i++) {
  const k = i % 3;
  if (i && !k) s += CODON_GAP;
  BASES.push({ base: CDS[i], region: 'cds', codon: (i / 3) | 0, k, s });
  s += STEP;
}
s += REGION_GAP - STEP;
for (const ch of UTR3) { BASES.push({ base: ch, region: 'utr3', codon: -1, k: 0, s }); s += STEP; }
s += REGION_GAP - STEP;
for (const ch of POLYA) { BASES.push({ base: ch, region: 'polyA', codon: -1, k: 0, s }); s += POLYA_STEP; }
export const S_TOTAL = s - POLYA_STEP + END_PAD;
for (const b of BASES) b.t = b.s / S_TOTAL;

export const N_BASES = BASES.length;          // 78
export const N_CODONS = CDS.length / 3;       // 16
export const CDS_RANGE = (() => {
  const c = BASES.filter(b => b.region === 'cds');
  return [c[0].t, c[c.length - 1].t];
})();

// Region t-ranges [t0, t1] along the strand (0 = 5' end, 1 = 3' end).
export const REGIONS = (() => {
  const half = 0.5 / S_TOTAL;
  const out = { cap: [0, (CAP_GAP - 0.9) / S_TOTAL] };
  for (const key of ['utr5', 'cds', 'utr3', 'polyA']) {
    const r = BASES.filter(b => b.region === key);
    out[key] = [r[0].t - half, r[r.length - 1].t + half];
  }
  return out;
})();
export const regionMid = key => (REGIONS[key][0] + REGIONS[key][1]) / 2;

// Which region a point t on the backbone belongs to (gaps go to the nearer side).
export function regionAt(t) {
  if (t <= REGIONS.cap[1]) return 'cap';
  for (const key of ['utr5', 'cds', 'utr3', 'polyA']) if (t <= REGIONS[key][1] + 0.6 / S_TOTAL) return key;
  return 'polyA';
}

// ---- Helix ----
// A loose coil, one and a half turns: x swings across the stage, z gives it depth. Bases sit
// at equal spacing along the path as seen from the front, so where the strand runs straight
// down the sides (rungs face-on, as in the logo) the codon triplets have room to read.
const AMP_X = 1.62; // half-width of the swing
const AMP_Z = 0.7;  // depth of the coil
const phiOf = u => u * TURNS * Math.PI * 2;
const axisX = u => -0.3 * Math.tanh((u - 0.5) * 4) / Math.tanh(2);
function coilScale(u) {
  const head = Math.sin(Math.min(1, u * 8) * Math.PI / 2);
  const tail = Math.min(1, Math.max(0, (u - 0.87) / 0.13));
  return (0.84 + 0.16 * head) * (1 - 0.28 * tail);
}
function raw(u) {
  const f = phiOf(u), k = coilScale(u);
  return [axisX(u) + Math.cos(f) * AMP_X * k, HEIGHT / 2 - u * HEIGHT, Math.sin(f) * AMP_Z * k];
}
// Arc-length table of the front view (x, y), so t is "distance along the strand as seen".
const TABLE = 1600;
const ARC = new Float64Array(TABLE + 1);
{
  let p = raw(0);
  for (let i = 1; i <= TABLE; i++) {
    const q = raw(i / TABLE);
    ARC[i] = ARC[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]);
    p = q;
  }
}
export const PATH_LEN = ARC[TABLE];
function uOf(t) {
  const L = Math.min(1, Math.max(0, t)) * PATH_LEN;
  let lo = 0, hi = TABLE;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ARC[mid] < L) lo = mid; else hi = mid; }
  const span = ARC[hi] - ARC[lo] || 1;
  return (lo + (L - ARC[lo]) / span) / TABLE;
}

export function axisPoint(t) {
  const u = uOf(t);
  return [axisX(u), HEIGHT / 2 - u * HEIGHT, 0];
}

export function helixPoint(t) {
  return raw(uOf(t));
}

// The way a base points: across the strand toward the coil's axis. Face-on along the
// sides, turning into the page where the strand crosses in front (the logo's bare diagonal).
export function helixInward(t) {
  const u = uOf(t), e = 1 / TABLE;
  const a = raw(Math.max(0, u - e)), b = raw(Math.min(1, u + e));
  let tx = b[0] - a[0], ty = b[1] - a[1];
  const L = Math.hypot(tx, ty) || 1;
  tx /= L; ty /= L;
  const f = phiOf(u);
  // In-plane perpendicular (pointing left when the strand runs down), turned about the strand.
  const c = Math.cos(f), s = Math.sin(f);
  return [ty * c, -tx * c, -s];
}

// ---- Dial ----
// 00:00 at the top, clockwise: 06:00 right, 12:00 bottom, 18:00 left.
export const dialAngleOf = t => t * DIAL_SPAN * Math.PI * 2;
export const hourOf = t => t * DIAL_SPAN * 24;
export function dialPoint(t, r = DIAL_R) {
  const a = dialAngleOf(t);
  return [Math.sin(a) * r, Math.cos(a) * r, 0];
}
export function dialInward(t) {
  const a = dialAngleOf(t);
  return [-Math.sin(a), -Math.cos(a), 0];
}

// Staggered morph: bases near the 5' end move first, so the ring assembles 5' to 3'.
export function morphAt(m, t) {
  const x = Math.min(1, Math.max(0, m * 1.5 - t * 0.5));
  return x * x * (3 - 2 * x);
}

export const isPurine = b => b === 'A' || b === 'G';
export const rungLength = b => (isPurine(b) ? RUNG_LONG : RUNG_SHORT);

// Neutral pearl shades per base (the hero ring uses the same four), sage when active.
export const SHADES = { A: '#ecebe6', G: '#d7d5cf', C: '#b3b1ac', U: '#9a9995' };
export const PEARL = '#e6e3dc';
export const SAGE = '#8fc9a3';

// ---- Protein chain ----
// A growing chain hangs off each ribosome: one bead per codon read. The path leaves the
// ribosome away from the helix axis and then meanders. Deterministic per seed.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Offsets in a local frame: +x = outward from the axis, +y = up, +z = toward the viewer.
export const BEAD_R = 0.06;
export const BEAD_STEP = 0.105;
export function chainPath(seed, n = N_CODONS) {
  const r = rng(seed * 7919 + 13);
  const out = [];
  let x = 0.34, y = 0.06, z = 0.1;
  let dx = 1, dy = 0.15 + (r() - 0.5) * 0.5, dz = 0.35 + r() * 0.3;
  for (let i = 0; i < n; i++) {
    out.push([x, y, z]);
    // Turn a little each bead, with a gentle pull back as the chain grows (it starts to fold).
    dx += (r() - 0.5) * 0.5 - x * 0.05;
    dy += (r() - 0.5) * 0.55 - y * 0.07;
    dz += (r() - 0.5) * 0.5 - (z - 0.3) * 0.07;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L; dy /= L; dz /= L;
    x += dx * BEAD_STEP; y += dy * BEAD_STEP; z += dz * BEAD_STEP;
  }
  return out;
}
