// Owner: 3D. The mRNA strand in WebGL. Lazy-loaded by stage.js (this module pulls in three.js).
//
// One molecule, four figures:
//   helix    the strand at rest: pearl gray, a slow sway, depth fading into the page.
//   anatomy  state.region lights the cap, UTRs, coding sequence and tail sage on the model.
//   protein  inside the target window ribosomes run along the coding sequence and a bead
//            chain (the protein) grows off each one; outside it the strand dims and goes quiet.
//   dial     the strand bends into the 24-hour dial: lit from 00:00 to the hour, with hour
//            ticks and the sun or moon at the corner clock's hour.
// Neutral at rest, sage when active, so green always means Trias. One key light, one rim light.
// By day (view.day, the cream behind the strand) pearl turns graphite and sage turns a deeper
// green, and the additive glow fades out: light added to cream does not show.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, InstancedMesh, BufferGeometry, BufferAttribute,
  InstancedBufferAttribute, CapsuleGeometry, SphereGeometry, BoxGeometry, MeshPhysicalMaterial, MeshBasicMaterial,
  AmbientLight, DirectionalLight, Points, PointsMaterial, Sprite, SpriteMaterial, CanvasTexture, Fog, Color,
  Vector3, Quaternion, Matrix4, AdditiveBlending, CustomBlending, AddEquation, SrcAlphaFactor, OneFactor, ZeroFactor, NeutralToneMapping, SRGBColorSpace, LinearSRGBColorSpace,
  PMREMGenerator, DynamicDrawUsage,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BASES, N_BASES, N_CODONS, REGIONS, REGION_KEYS, regionAt, regionMid, CDS_RANGE, TUBE_R, RUNG_R, DIAL_R,
  helixPoint, helixInward, dialPoint, dialInward, morphAt, hourOf, rungLength, chainPath,
  BEAD_R, SHADES, PEARL, SAGE, FIT_H, FIT_W, FOV,
} from './helix-curve.js';
import { WINDOW, isSunHour } from '../core/time.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = x => x * x * (3 - 2 * x);
const UP = new Vector3(0, 1, 0);
const RIBOS = 3;
const RELEASED = 2;
const TRANSLATE_S = 2.4; // seconds for a ribosome to read the coding sequence

// Soft round sprite for glow, drawn once.
// Glow on a transparent canvas must only add light. Plain additive blending also adds alpha,
// so a faint (near-black) glow left a dark smudge over the page. Keep the canvas alpha as is.
function lightOnly(mat) {
  mat.blending = CustomBlending;
  mat.blendEquation = AddEquation;
  mat.blendSrc = SrcAlphaFactor; mat.blendDst = OneFactor;
  mat.blendSrcAlpha = ZeroFactor; mat.blendDstAlpha = OneFactor;
  return mat;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,.4)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// Sun, moon and half-risen sun glyphs for the dial marker (same shapes as the clock icon).
function glyphTextures() {
  const make = draw => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const halo = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    halo.addColorStop(0, 'rgba(244,241,234,.22)');
    halo.addColorStop(1, 'rgba(244,241,234,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = g.strokeStyle = '#f4f1ea';
    g.lineCap = 'round';
    draw(g);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  };
  const moon = make(g => {
    g.save();
    g.translate(64, 64);
    g.rotate(-0.42);
    g.beginPath();
    g.arc(0, 0, 27, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(13, -8, 23, 0, Math.PI * 2);
    g.fill();
    g.restore();
  });
  const sun = make(g => {
    g.beginPath();
    g.arc(64, 64, 17, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(64 + Math.sin(a) * 27, 64 - Math.cos(a) * 27);
      g.lineTo(64 + Math.sin(a) * 38, 64 - Math.cos(a) * 38);
      g.stroke();
    }
  });
  const rise = make(g => {
    g.save();
    g.beginPath();
    g.rect(0, 0, 128, 74);
    g.clip();
    g.beginPath();
    g.arc(64, 74, 21, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(26, 74);
    g.lineTo(102, 74);
    g.stroke();
  });
  return { moon, sun, rise };
}

// Pearl: soft sheen, a light clearcoat, and a faint warm rim so edges read slightly
// translucent. aGlow (per vertex or per instance) adds sage emission on the active segment.
const RIMS = []; // [uniform, night value]: the warm rim dims by day
const PEARLS = []; // every pearl material: its white sheen dims by day, or it greys the graphite
function pearl(opts, glowColor, rim = 0.1) {
  const rimU = { value: rim };
  RIMS.push([rimU, rim]);
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.38, metalness: 0,
    sheen: 0.7, sheenRoughness: 0.45, sheenColor: new Color('#fff6ea'),
    clearcoat: 0.65, clearcoatRoughness: 0.22,
    ...opts,
  });
  PEARLS.push(m);
  m.onBeforeCompile = sh => {
    sh.uniforms.uGlow = { value: glowColor };
    sh.uniforms.uRim = rimU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGlow;\nuniform float uRim;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);
        totalEmissiveRadiance += vec3(1.0, 0.97, 0.92) * uRim * rimF * (1.0 - 0.6 * vGlow) + uGlow * vGlow * (0.45 + 0.55 * rimF);`);
  };
  return m;
}

export function initScene(canvas, state, opts = {}) {
  const phone = !!opts.phone;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  let dprCap = phone ? 1.5 : (state.lowPower ? 1.25 : 2);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dprCap));
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
  scene.fog = new Fog(0x07090f, 15, 19);

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, 16);

  // root carries the sway; everything else hangs off frameG.
  const root = new Group();
  const frameG = new Group();
  root.add(frameG);
  scene.add(root);

  // ---- Lights: one key, one rim, a little ambient so the shadow side is not black ----
  scene.add(new AmbientLight(0xfff8ef, 0.42));
  const key = new DirectionalLight(0xfff5e8, 2.6);
  key.position.set(-5, 6, 9);
  scene.add(key);
  const rimL = new DirectionalLight(0xf2f6f8, 2.2);
  rimL.position.set(6, -2, -8);
  scene.add(rimL);

  const sageC = new Color(SAGE);
  // Lit surfaces take a slightly deeper sage, so after light and sheen they read as the brand
  // sage (#8fc9a3) rather than mint.
  const tintC = new Color('#78b48c');
  const glowC = new Color(SAGE).multiplyScalar(0.3);
  const pearlC = new Color(PEARL);
  const shade = Object.fromEntries(Object.entries(SHADES).map(([k, v]) => [k, new Color(v)]));
  // Day palette: graphite shades in the same order of lightness, and a green that holds on cream.
  const shadeDay = { A: new Color('#4a4842'), G: new Color('#5b5952'), C: new Color('#75726a'), U: new Color('#8b877d') };
  const pearlDayC = new Color('#4a4842');
  const tintDayC = new Color('#3e9e62');
  const capC = new Color('#f1ece2'), capDayC = new Color('#34322d');
  const riboC = new Color('#a4cfb2'), riboDayC = new Color('#3d8a5c');
  const beadC = new Color('#93c8a5'), beadDayC = new Color('#4a9466');
  // Per-frame blends of the two palettes (reused, no allocation in the loop).
  const shadeNow = Object.fromEntries(Object.keys(SHADES).map(k => [k, new Color()]));
  const pearlNow = new Color(), tintNow = new Color();
  let lastDay = -1;

  // ---- Backbone: a tube rebuilt on the CPU only when its shape changes (the dial morph) ----
  const SAMPLES = phone ? 260 : 440;
  const RADIAL = phone ? 7 : 10;
  const tubeGeo = new BufferGeometry();
  const tPos = new Float32Array(SAMPLES * RADIAL * 3);
  const tNor = new Float32Array(SAMPLES * RADIAL * 3);
  const tCol = new Float32Array(SAMPLES * RADIAL * 3);
  const tGlow = new Float32Array(SAMPLES * RADIAL);
  const idx = [];
  for (let i = 0; i < SAMPLES - 1; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = i * RADIAL + j, b = i * RADIAL + ((j + 1) % RADIAL);
      const c = a + RADIAL, d = b + RADIAL;
      idx.push(a, c, b, b, c, d);
    }
  }
  tubeGeo.setIndex(idx);
  const posAttr = new BufferAttribute(tPos, 3).setUsage(DynamicDrawUsage);
  const norAttr = new BufferAttribute(tNor, 3).setUsage(DynamicDrawUsage);
  const colAttr = new BufferAttribute(tCol, 3).setUsage(DynamicDrawUsage);
  const tGlowAttr = new BufferAttribute(tGlow, 1).setUsage(DynamicDrawUsage);
  tubeGeo.setAttribute('position', posAttr);
  tubeGeo.setAttribute('normal', norAttr);
  tubeGeo.setAttribute('color', colAttr);
  tubeGeo.setAttribute('aGlow', tGlowAttr);
  const tubeMat = pearl({ vertexColors: true }, glowC, 0.12);
  const tube = new Mesh(tubeGeo, tubeMat);
  tube.frustumCulled = false;
  frameG.add(tube);
  const sampleT = Array.from({ length: SAMPLES }, (_, i) => i / (SAMPLES - 1));
  const sampleRegion = sampleT.map(regionAt);
  const sampleR = sampleT.map(t => TUBE_R * (t > REGIONS.polyA[0] ? 0.86 : 1));
  const centers = new Float32Array(SAMPLES * 3);

  // ---- Bases: one rung per nucleotide ----
  const L0 = 0.36;
  const rungGeo = new CapsuleGeometry(RUNG_R, L0 - RUNG_R * 2, phone ? 3 : 5, phone ? 7 : 10);
  const rungGlow = new InstancedBufferAttribute(new Float32Array(N_BASES), 1).setUsage(DynamicDrawUsage);
  rungGeo.setAttribute('aGlow', rungGlow);
  const rungs = new InstancedMesh(rungGeo, pearl({}, glowC, 0.1), N_BASES);
  rungs.instanceMatrix.setUsage(DynamicDrawUsage);
  for (let i = 0; i < N_BASES; i++) rungs.setColorAt(i, shade[BASES[i].base]);
  rungs.frustumCulled = false;
  frameG.add(rungs);

  // ---- 5' cap: an m7G bulb on a short triphosphate bridge ----
  const capMat = pearl({ color: new Color('#f1ece2') }, glowC, 0.14);
  const capGeoGlow = g => { g.setAttribute('aGlow', new BufferAttribute(new Float32Array(g.attributes.position.count), 1)); return g; };
  const capBulb = new Mesh(capGeoGlow(new SphereGeometry(0.15, 24, 16)), capMat);
  capBulb.scale.set(1, 0.82, 1);
  const bridgeGeo = capGeoGlow(new SphereGeometry(0.05, 12, 8));
  const bridge = [0, 1, 2].map(() => new Mesh(bridgeGeo, capMat));
  const capG = new Group();
  capG.add(capBulb, ...bridge);
  frameG.add(capG);
  const tailMat = pearl({ color: shade.A.clone() }, glowC, 0.12);
  const tailEnd = new Mesh(capGeoGlow(new SphereGeometry(TUBE_R * 1.15, 12, 8)), tailMat);
  frameG.add(tailEnd);

  // ---- Glow: soft additive points along the active segment ----
  const GLOW_N = N_BASES + Math.ceil(SAMPLES / 3);
  const gPos = new Float32Array(GLOW_N * 3);
  const gCol = new Float32Array(GLOW_N * 3);
  const glowGeo = new BufferGeometry();
  glowGeo.setAttribute('position', new BufferAttribute(gPos, 3).setUsage(DynamicDrawUsage));
  glowGeo.setAttribute('color', new BufferAttribute(gCol, 3).setUsage(DynamicDrawUsage));
  const glowTex = glowTexture();
  const glow = new Points(glowGeo, lightOnly(new PointsMaterial({
    size: 1.5, map: glowTex, vertexColors: true, transparent: true, blending: AdditiveBlending,
    depthWrite: false, sizeAttenuation: true, fog: false,
  })));
  glow.frustumCulled = false;
  frameG.add(glow);

  // ---- Ribosomes and the protein they make ----
  const riboMat = pearl({ color: riboC.clone(), roughness: 0.42 }, new Color(SAGE).multiplyScalar(0.2), 0.2);
  const riboGeoL = capGeoGlow(new SphereGeometry(0.28, phone ? 20 : 32, phone ? 14 : 22));
  const riboGeoS = capGeoGlow(new SphereGeometry(0.22, phone ? 16 : 28, phone ? 12 : 18));
  const ribos = Array.from({ length: RIBOS }, (_, k) => {
    const g = new Group();
    // Large subunit on the backbone's outer side, the flatter small subunit over the bases.
    const large = new Mesh(riboGeoL, riboMat);
    large.scale.set(0.95, 1.0, 1.0);
    large.position.set(0.17, 0.03, 0);
    const small = new Mesh(riboGeoS, riboMat);
    small.scale.set(0.82, 1.05, 1.1);
    small.position.set(-0.13, -0.03, 0);
    g.add(large, small);
    g.visible = false;
    frameG.add(g);
    return { g, u: k / RIBOS, seed: k + 1, path: chainPath(k + 1), pts: [] };
  });
  const BEADS_MAX = (RIBOS + RELEASED) * N_CODONS;
  const beadGeo = capGeoGlow(new SphereGeometry(BEAD_R, phone ? 10 : 14, phone ? 7 : 10));
  const beadGlow = new InstancedBufferAttribute(new Float32Array(BEADS_MAX).fill(0.35), 1);
  beadGeo.setAttribute('aGlow', beadGlow);
  const beadMat = pearl({ color: beadC.clone(), roughness: 0.4 }, glowC, 0.12);
  const beads = new InstancedMesh(beadGeo, beadMat, BEADS_MAX);
  beads.instanceMatrix.setUsage(DynamicDrawUsage);
  beads.count = 0;
  beads.frustumCulled = false;
  frameG.add(beads);
  const released = []; // finished chains drifting off: { pts: [[x,y,z]], c: centroid, age }
  const riboGlowPos = new Float32Array(RIBOS * 3);
  const riboGlowCol = new Float32Array(RIBOS * 3);
  const riboGlowGeo = new BufferGeometry();
  riboGlowGeo.setAttribute('position', new BufferAttribute(riboGlowPos, 3).setUsage(DynamicDrawUsage));
  riboGlowGeo.setAttribute('color', new BufferAttribute(riboGlowCol, 3).setUsage(DynamicDrawUsage));
  const riboGlow = new Points(riboGlowGeo, lightOnly(new PointsMaterial({
    size: 1.7, map: glowTex, vertexColors: true, transparent: true, blending: AdditiveBlending,
    depthWrite: false, sizeAttenuation: true, fog: false,
  })));
  riboGlow.frustumCulled = false;
  frameG.add(riboGlow);

  // ---- Dial: hour ticks and the sun or moon ----
  const tickGeo = new BoxGeometry(1, 1, 1);
  const ticks = new InstancedMesh(tickGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false }), 24);
  {
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3();
    for (let h = 0; h < 24; h++) {
      const major = h % 6 === 0;
      const a = (h / 24) * Math.PI * 2;
      const r0 = DIAL_R - (major ? 0.86 : 0.72), r1 = DIAL_R - 0.56;
      const rm = (r0 + r1) / 2;
      p.set(Math.sin(a) * rm, Math.cos(a) * rm, 0);
      q.setFromAxisAngle(new Vector3(0, 0, 1), -a);
      s.set(major ? 0.034 : 0.022, r1 - r0, 0.02);
      ticks.setMatrixAt(h, m.compose(p, q, s));
      ticks.setColorAt(h, new Color(major ? '#f4f1ea' : '#bdbab3'));
    }
  }
  ticks.visible = false;
  frameG.add(ticks);
  const glyphs = glyphTextures();
  const marker = new Sprite(new SpriteMaterial({ map: glyphs.moon, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  marker.scale.setScalar(0.62);
  marker.visible = false;
  frameG.add(marker);
  const MARK_R = DIAL_R - 1.16;

  // ---- Size: fit the strand (and the dial) whatever the canvas aspect ----
  // Setting the canvas size clears it, so skip when nothing changed (a phone slot hand-off
  // calls this at once and the ResizeObserver calls it again a moment later).
  let sizeKey = '';
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const key = `${w}x${h}@${renderer.getPixelRatio()}`;
    if (key === sizeKey) return;
    sizeKey = key;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tanH = Math.tan((camera.fov / 2) * Math.PI / 180);
    const z = Math.max(FIT_H / tanH, FIT_W / (tanH * camera.aspect));
    camera.position.z = z;
    camera.updateProjectionMatrix();
    scene.fog.near = z - 0.6;
    scene.fog.far = z + 3.4;
    needShape = true;
  }

  // ---- Shape (positions): helix <-> dial ----
  let needShape = true, shapeM = -1;
  const v3 = new Vector3(), dir = new Vector3(), q = new Quaternion(), mtx = new Matrix4(), scl = new Vector3();
  const pointAt = (t, m, out) => {
    const a = morphAt(m, t);
    const h = helixPoint(t), d = dialPoint(t);
    out[0] = h[0] + (d[0] - h[0]) * a;
    out[1] = h[1] + (d[1] - h[1]) * a;
    out[2] = h[2] + (d[2] - h[2]) * a;
    return a;
  };
  const tmp = [0, 0, 0];
  const basePos = BASES.map(() => [0, 0, 0]);
  const baseDir = BASES.map(() => [0, 0, 0]);

  function buildShape(m) {
    // Backbone centers.
    for (let i = 0; i < SAMPLES; i++) {
      pointAt(sampleT[i], m, tmp);
      centers[i * 3] = tmp[0]; centers[i * 3 + 1] = tmp[1]; centers[i * 3 + 2] = tmp[2];
    }
    // Parallel-transport frames, then the tube rings.
    let nx = 0, ny = 0, nz = 1;
    for (let i = 0; i < SAMPLES; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(SAMPLES - 1, i + 1);
      let tx = centers[i1 * 3] - centers[i0 * 3], ty = centers[i1 * 3 + 1] - centers[i0 * 3 + 1], tz = centers[i1 * 3 + 2] - centers[i0 * 3 + 2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      if (i === 0) {
        // Any vector not parallel to the tangent.
        const ax = Math.abs(tz) < 0.9 ? 0 : 1, az = Math.abs(tz) < 0.9 ? 1 : 0;
        nx = ax; ny = 0; nz = az;
      }
      const dp = nx * tx + ny * ty + nz * tz;
      nx -= tx * dp; ny -= ty * dp; nz -= tz * dp;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      const r = sampleR[i];
      for (let j = 0; j < RADIAL; j++) {
        const th = (j / RADIAL) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        const ox = nx * c + bx * s, oy = ny * c + by * s, oz = nz * c + bz * s;
        const k = (i * RADIAL + j) * 3;
        tPos[k] = centers[i * 3] + ox * r; tPos[k + 1] = centers[i * 3 + 1] + oy * r; tPos[k + 2] = centers[i * 3 + 2] + oz * r;
        tNor[k] = ox; tNor[k + 1] = oy; tNor[k + 2] = oz;
      }
    }
    posAttr.needsUpdate = true;
    norAttr.needsUpdate = true;
    tubeGeo.computeBoundingSphere();

    // Rungs.
    for (let i = 0; i < N_BASES; i++) {
      const b = BASES[i];
      const a = pointAt(b.t, m, basePos[i]);
      const hi = helixInward(b.t), di = dialInward(b.t);
      dir.set(hi[0] + (di[0] - hi[0]) * a, hi[1] + (di[1] - hi[1]) * a, hi[2] + (di[2] - hi[2]) * a).normalize();
      baseDir[i][0] = dir.x; baseDir[i][1] = dir.y; baseDir[i][2] = dir.z;
      const L = rungLength(b.base);
      q.setFromUnitVectors(UP, dir);
      v3.set(basePos[i][0] + dir.x * (L / 2 + TUBE_R * 0.4), basePos[i][1] + dir.y * (L / 2 + TUBE_R * 0.4), basePos[i][2] + dir.z * (L / 2 + TUBE_R * 0.4));
      scl.set(1, L / L0, 1);
      rungs.setMatrixAt(i, mtx.compose(v3, q, scl));
    }
    rungs.instanceMatrix.needsUpdate = true;

    // Cap: bridge beads and the bulb trail back from the 5' end along the backbone tangent.
    const p0 = [centers[0], centers[1], centers[2]];
    const p1 = [centers[6], centers[7], centers[8]];
    let bx = p0[0] - p1[0], by = p0[1] - p1[1], bz = p0[2] - p1[2];
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl; by /= bl; bz /= bl;
    bridge.forEach((mesh, k) => mesh.position.set(p0[0] + bx * 0.075 * (k + 1), p0[1] + by * 0.075 * (k + 1), p0[2] + bz * 0.075 * (k + 1)));
    capBulb.position.set(p0[0] + bx * 0.39, p0[1] + by * 0.39, p0[2] + bz * 0.39);
    const pe = SAMPLES - 1;
    tailEnd.position.set(centers[pe * 3], centers[pe * 3 + 1], centers[pe * 3 + 2]);
  }

  // ---- Per-frame inputs smoothed toward their targets ----
  let last = 0;
  let clockS = 0;              // animation time: stands still while motion is paused
  let act = 0;                 // protein activity: 0 quiet .. 1 making protein
  let markerKind = 'moon';
  const frameTimes = [];

  // Where a ribosome sits for progress u through the coding sequence.
  const riboT = u => CDS_RANGE[0] + (CDS_RANGE[1] - CDS_RANGE[0]) * u;
  const basisAt = (t, m, out) => {
    // Position, outward (from the axis), tangent.
    const P = [0, 0, 0];
    pointAt(t, m, P);
    const P2 = [0, 0, 0];
    pointAt(Math.min(1, t + 0.004), m, P2);
    const a = morphAt(m, t);
    const hi = helixInward(t), di = dialInward(t);
    let ox = -(hi[0] + (di[0] - hi[0]) * a), oy = -(hi[1] + (di[1] - hi[1]) * a), oz = -(hi[2] + (di[2] - hi[2]) * a);
    let tx = P2[0] - P[0], ty = P2[1] - P[1], tz = P2[2] - P[2];
    const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
    const dp = tx * ox + ty * oy + tz * oz;
    tx -= ox * dp; ty -= oy * dp; tz -= oz * dp;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // z = outward x tangent (so it points toward the viewer on the front of the coil)
    const zx = oy * tz - oz * ty, zy = oz * tx - ox * tz, zz = ox * ty - oy * tx;
    out.P = P; out.X = [ox, oy, oz]; out.Y = [tx, ty, tz]; out.Z = [zx, zy, zz];
    return out;
  };
  const basis = {};
  const CHAIN_X = (() => { const v = [0.8, -0.16, 0.58]; const l = Math.hypot(...v); return v.map(x => x / l); })();
  const CHAIN_Y = (() => { const d = CHAIN_X[1]; const v = [-CHAIN_X[0] * d, 1 - CHAIN_X[1] * d, -CHAIN_X[2] * d]; const l = Math.hypot(...v); return v.map(x => x / l); })();
  const CHAIN_Z = [CHAIN_X[1] * CHAIN_Y[2] - CHAIN_X[2] * CHAIN_Y[1], CHAIN_X[2] * CHAIN_Y[0] - CHAIN_X[0] * CHAIN_Y[2], CHAIN_X[0] * CHAIN_Y[1] - CHAIN_X[1] * CHAIN_Y[0]];
  const local = (B, o) => [
    B.P[0] + B.X[0] * o[0] + B.Y[0] * o[1] + B.Z[0] * o[2],
    B.P[1] + B.X[1] * o[0] + B.Y[1] * o[1] + B.Z[1] * o[2],
    B.P[2] + B.X[2] * o[0] + B.Y[2] * o[1] + B.Z[2] * o[2],
  ];

  function frame(now, view) {
    const wall = now / 1000;
    const wdt = last ? Math.min(0.1, Math.max(0, wall - last)) : 0;
    last = wall;
    const reduced = view.reduced;
    // "Pause motion": the sway and the ribosomes hold where they are; changes from scroll snap.
    const still = reduced || view.paused;
    const dt = view.paused ? 0 : wdt;
    clockS += dt;
    const sec = clockS;
    const k = rate => (still || !dt ? 1 : 1 - Math.exp(-dt * rate));

    // Adaptive resolution: if frames run long, step the pixel ratio down.
    if (wdt && !view.paused) {
      frameTimes.push(wdt);
      if (frameTimes.length > 90) {
        const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        frameTimes.length = 0;
        const min = phone ? 1 : 1.25;
        if (avg > 0.034 && renderer.getPixelRatio() > min && !view.throttled) {
          dprCap = Math.max(min, renderer.getPixelRatio() - 0.25);
          renderer.setPixelRatio(dprCap);
          resize();
        }
      }
    }

    // Fog fades the back of the coil into the page color (gentle depth of field).
    // Fog mixes after the output color transform, so it takes the sRGB value as is.
    const bg = view.bg;
    scene.fog.color.setRGB(bg[0] / 255, bg[1] / 255, bg[2] / 255, LinearSRGBColorSpace);

    const m = clamp(view.morph);
    if (needShape || Math.abs(m - shapeM) > 1e-4) {
      buildShape(m);
      shapeM = m;
      needShape = false;
    }
    const em = ease(m);

    // Sway: a slow rock (never a spin, so the logo's S always reads), flat to the camera as a dial.
    const sway = reduced ? 0.12 : 0.3 * Math.sin(sec * 0.42) + 0.1 * Math.sin(sec * 0.17 + 1.3);
    root.rotation.y = sway * (1 - em);
    root.rotation.x = 0.06 * (1 - em);
    root.rotation.z = -0.03 * (1 - em);

    const prot = clamp(view.protein.on) * (1 - em);

    // ---- Protein activity: only while the dose hour is inside the target window ----
    const h = ((view.protein.hour % 24) + 24) % 24;
    const edge = 0.3;
    const inWin = clamp(Math.min(h - WINDOW[0], WINDOW[1] - h) / edge + 0.5);
    act += (inWin * prot - act) * k(7);
    const quiet = prot * (1 - act);

    // Ribosomes advance only while active; each reads the coding sequence once, releases
    // its finished chain, and a new one loads at the start codon.
    let beadN = 0;
    const mBead = new Matrix4();
    const bp = new Vector3(), bs = new Vector3(), bq = new Quaternion();
    ribos.forEach((rb, i) => {
      if (reduced) rb.u = [0.3, 0.62, 0.9][i];
      else if (act > 0.04) {
        rb.u += (dt / TRANSLATE_S) * (0.4 + 0.6 * act);
        if (rb.u >= 1) {
          // Release the protein: it drifts off and folds as it fades.
          if (act > 0.3 && rb.pts?.length > 8) {
            if (released.length >= RELEASED) released.shift();
            const c = rb.pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(v => v / rb.pts.length);
            released.push({ pts: rb.pts.map(p => p.slice()), c, age: 0 });
          }
          rb.u -= 1;
          rb.seed += RIBOS;
          rb.path = chainPath(rb.seed);
        }
      }
      const u = clamp(rb.u);
      const assemble = ease(clamp(u / 0.05)) * ease(clamp((1 - u) / 0.04));
      const vis = act * assemble;
      rb.g.visible = vis > 0.01;
      basisAt(riboT(u), m, basis);
      const s = Math.max(0.001, vis);
      rb.g.scale.setScalar(s);
      rb.g.position.set(basis.P[0], basis.P[1], basis.P[2]);
      mBead.makeBasis(v3.set(...basis.X), dir.set(...basis.Y), bp.set(...basis.Z));
      rb.g.quaternion.setFromRotationMatrix(mBead);
      const rp = local(basis, [0.12, 0, 0.02]);
      riboGlowPos[i * 3] = rp[0]; riboGlowPos[i * 3 + 1] = rp[1]; riboGlowPos[i * 3 + 2] = rp[2];
      const gI = 0.22 * vis * (1 - clamp(view.day || 0));
      riboGlowCol[i * 3] = sageC.r * gI; riboGlowCol[i * 3 + 1] = sageC.g * gI; riboGlowCol[i * 3 + 2] = sageC.b * gI;

      // The chain: one bead per codon read. It extrudes from the exit tunnel, so the
      // first bead made (the N-terminus) is the one farthest out. It grows toward the open
      // side of the stage and toward the viewer, so it never crosses the text column.
      const exit = local(basis, [0.3, 0.08, 0]);
      const CB = { P: exit, X: CHAIN_X, Y: CHAIN_Y, Z: CHAIN_Z };
      const read = u * N_CODONS;
      const n = Math.min(N_CODONS, Math.ceil(read));
      rb.pts = [];
      for (let j = 0; j < n; j++) {
        const f = Math.max(0, read - 1 - j);
        const i0 = Math.min(N_CODONS - 1, Math.floor(f)), i1 = Math.min(N_CODONS - 1, i0 + 1), w = f - Math.floor(f);
        const a0 = rb.path[i0], a1 = rb.path[i1];
        const p = local(CB, [a0[0] + (a1[0] - a0[0]) * w - 0.3, a0[1] + (a1[1] - a0[1]) * w, a0[2] + (a1[2] - a0[2]) * w]);
        rb.pts.push(p);
        const grow = j === n - 1 ? clamp(read - (n - 1)) : 1;
        const sc = vis * grow;
        if (sc < 0.02) continue;
        mBead.compose(bp.set(p[0], p[1], p[2]), bq, bs.setScalar(sc));
        beads.setMatrixAt(beadN++, mBead);
      }
    });
    for (let r = released.length - 1; r >= 0; r--) {
      const rel = released[r];
      if (!reduced) rel.age += dt;
      const p = rel.age / 2.2;
      if (p >= 1 || act < 0.02) { released.splice(r, 1); continue; }
      // The finished protein folds up as it drifts away, then fades.
      const fold = 1 - 0.72 * ease(clamp(p * 1.6));
      const drift = 0.45 * ease(p);
      const sc = act * (1 - ease(clamp((p - 0.55) / 0.45))) * (1 + 0.25 * ease(clamp(p * 1.6)));
      for (const pt of rel.pts) {
        mBead.compose(bp.set(
          rel.c[0] + (pt[0] - rel.c[0]) * fold + CHAIN_X[0] * drift,
          rel.c[1] + (pt[1] - rel.c[1]) * fold + 0.25 * drift,
          rel.c[2] + (pt[2] - rel.c[2]) * fold + CHAIN_X[2] * drift,
        ), bq, bs.setScalar(Math.max(0.001, sc)));
        if (beadN < BEADS_MAX) beads.setMatrixAt(beadN++, mBead);
      }
    }
    beads.count = beadN;
    beads.visible = beadN > 0;
    beads.instanceMatrix.needsUpdate = true;
    riboGlowGeo.attributes.position.needsUpdate = true;
    riboGlowGeo.attributes.color.needsUpdate = true;
    riboGlow.visible = act > 0.01;

    // ---- Day palette: blend toward graphite and deep green as the cream comes up behind ----
    const day = clamp(view.day || 0);
    if (day !== lastDay) {
      lastDay = day;
      for (const k in shadeNow) shadeNow[k].copy(shade[k]).lerp(shadeDay[k], day);
      pearlNow.copy(pearlC).lerp(pearlDayC, day);
      tintNow.copy(tintC).lerp(tintDayC, day);
      riboMat.color.copy(riboC).lerp(riboDayC, day);
      beadMat.color.copy(beadC).lerp(beadDayC, day);
      for (const [u, v] of RIMS) u.value = v * (1 - 0.65 * day);
      // Sheen stays above zero so the shader never recompiles mid-scroll.
      for (const pm of PEARLS) { pm.sheen = 0.7 * (1 - 0.65 * day); pm.clearcoat = 0.65 * (1 - 0.5 * day); }
      scene.environmentIntensity = 0.5 * (1 - 0.6 * day);
      // The sage self-light on a lit region: less of it on cream, where it would wash the green out.
      glowC.copy(sageC).multiplyScalar(0.3 * (1 - 0.5 * day));
    }
    const night = 1 - day;

    // ---- Color and glow per base: region lighting, ribosome reading, the dial's lit arc ----
    const reg = view.region;
    const dialLit = clamp(view.dialProgress) * 24;
    const dim = 1 - 0.42 * quiet;
    const riboTs = ribos.map(rb => ({ t: riboT(clamp(rb.u)), v: act * ease(clamp(rb.u / 0.05)) * ease(clamp((1 - rb.u) / 0.04)) }));
    let gi = 0;
    const c = new Color();
    const litOf = (t, region) => {
      // Returns [tint 0..1, glow 0..1].
      const rv = clamp(reg[region] || 0) * (1 - em);
      let tint = rv, g = clamp((rv - 0.5) * 2);
      if (prot > 0) {
        if (region === 'cds') tint = Math.max(tint, 0.3 * act);
        for (const r of riboTs) {
          const d = Math.abs(t - r.t) * 60;
          const near = Math.exp(-d * d) * r.v;
          tint = Math.max(tint, near);
          g = Math.max(g, near);
        }
      }
      if (em > 0) {
        const hr = hourOf(t);
        const lit = hr <= dialLit ? 1 : 0;
        tint = Math.max(tint, lit * em);
        const front = Math.exp(-(((dialLit - hr) / 0.9) ** 2)) * lit;
        g = Math.max(g, front * em, lit * 0.08 * em);
      }
      return [tint, g];
    };
    for (let i = 0; i < N_BASES; i++) {
      const b = BASES[i];
      const [tint, g] = litOf(b.t, b.region);
      c.copy(shadeNow[b.base]).lerp(tintNow, tint).multiplyScalar(dim);
      rungs.setColorAt(i, c);
      rungGlow.array[i] = g;
      if (g > 0.02 && gi < GLOW_N && i % 2 === 0) {
        const d = baseDir[i], L = rungLength(b.base);
        gPos[gi * 3] = basePos[i][0] + d[0] * L * 0.5;
        gPos[gi * 3 + 1] = basePos[i][1] + d[1] * L * 0.5;
        gPos[gi * 3 + 2] = basePos[i][2] + d[2] * L * 0.5;
        const gv = g * 0.07 * night;
        gCol[gi * 3] = sageC.r * gv; gCol[gi * 3 + 1] = sageC.g * gv; gCol[gi * 3 + 2] = sageC.b * gv;
        gi++;
      }
    }
    rungs.instanceColor.needsUpdate = true;
    rungGlow.needsUpdate = true;
    for (let i = 0; i < SAMPLES; i++) {
      const [tint, g] = litOf(sampleT[i], sampleRegion[i]);
      c.copy(pearlNow).lerp(tintNow, tint).multiplyScalar(dim);
      for (let j = 0; j < RADIAL; j++) {
        const kk = (i * RADIAL + j);
        tCol[kk * 3] = c.r; tCol[kk * 3 + 1] = c.g; tCol[kk * 3 + 2] = c.b;
        tGlow[kk] = g;
      }
      if (g > 0.05 && i % 8 === 0 && gi < GLOW_N) {
        gPos[gi * 3] = centers[i * 3]; gPos[gi * 3 + 1] = centers[i * 3 + 1]; gPos[gi * 3 + 2] = centers[i * 3 + 2];
        const gv = g * 0.06 * night;
        gCol[gi * 3] = sageC.r * gv; gCol[gi * 3 + 1] = sageC.g * gv; gCol[gi * 3 + 2] = sageC.b * gv;
        gi++;
      }
    }
    colAttr.needsUpdate = true;
    tGlowAttr.needsUpdate = true;
    glowGeo.setDrawRange(0, gi);
    glowGeo.attributes.position.needsUpdate = true;
    glowGeo.attributes.color.needsUpdate = true;
    glow.visible = gi > 0;

    // Cap lights with its region (and with the dial's first hour).
    const [capTint, capG] = litOf(0, 'cap');
    capMat.color.copy(capC).lerp(capDayC, day).lerp(tintNow, capTint).multiplyScalar(dim);
    capMat.emissive.copy(glowC).multiplyScalar(capG * 0.9);
    const [tailTint] = litOf(1, 'polyA');
    tailMat.color.copy(shadeNow.A).lerp(tintNow, tailTint).multiplyScalar(dim);

    // ---- Dial furniture ----
    ticks.visible = em > 0.01;
    ticks.material.opacity = 0.6 * ease(clamp((m - 0.4) / 0.6));
    const clockH = ((view.clock % 24) + 24) % 24;
    const kind = Math.abs(clockH - 6) < 0.5 || Math.abs(clockH - 18) < 0.5 ? 'rise' : isSunHour(clockH) ? 'sun' : 'moon';
    if (kind !== markerKind) { markerKind = kind; marker.material.map = glyphs[kind]; marker.material.needsUpdate = true; }
    const ma = (view.clock / 24) * Math.PI * 2;
    marker.position.set(Math.sin(ma) * MARK_R, Math.cos(ma) * MARK_R, 0.05);
    marker.material.opacity = ease(clamp((m - 0.55) / 0.45));
    marker.visible = m > 0.55;

    renderer.render(scene, camera);
  }

  // Viewport CSS px of each region's midpoint, or null as a dial. Each anchor sits on the
  // model itself: the middle of the rung nearest the region's midpoint (the cap: its bulb).
  const midBase = Object.fromEntries(REGION_KEYS.filter(k => k !== 'cap').map(k => {
    const m = regionMid(k);
    let best = 0, bd = Infinity;
    BASES.forEach((b, i) => { if (b.region === k && Math.abs(b.t - m) < bd) { bd = Math.abs(b.t - m); best = i; } });
    return [k, best];
  }));
  function regionScreen(rect) {
    if (shapeM > 0.05) return null;
    root.updateMatrixWorld();
    const out = {};
    for (const key of REGION_KEYS) {
      if (key === 'cap') v3.copy(capBulb.position);
      else {
        const i = midBase[key], L = rungLength(BASES[i].base) * 0.5 + TUBE_R * 0.4;
        v3.set(basePos[i][0] + baseDir[i][0] * L, basePos[i][1] + baseDir[i][1] * L, basePos[i][2] + baseDir[i][2] * L);
      }
      v3.applyMatrix4(frameG.matrixWorld).project(camera);
      out[key] = [
        Math.round((rect.left + ((v3.x + 1) / 2) * rect.width) * 10) / 10,
        Math.round((rect.top + ((1 - v3.y) / 2) * rect.height) * 10) / 10,
      ];
    }
    return out;
  }

  // The region under a viewport point, for clicks on the strand: the nearest backbone point or
  // rung middle (the cap: its bulb), if it lies within reach of the strand; otherwise null.
  function pickRegion(rect, x, y) {
    if (shapeM > 0.05) return null;
    root.updateMatrixWorld();
    let best = null, bd = Infinity, y0 = Infinity, y1 = -Infinity;
    const test = key => {
      v3.applyMatrix4(frameG.matrixWorld).project(camera);
      const px = rect.left + ((v3.x + 1) / 2) * rect.width, py = rect.top + ((1 - v3.y) / 2) * rect.height;
      y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = key; }
    };
    v3.copy(capBulb.position); test('cap');
    for (let i = 0; i < N_BASES; i++) {
      const p = basePos[i], d = baseDir[i], L = rungLength(BASES[i].base) * 0.5;
      v3.set(p[0], p[1], p[2]); test(BASES[i].region);
      v3.set(p[0] + d[0] * L, p[1] + d[1] * L, p[2] + d[2] * L); test(BASES[i].region);
    }
    // Reach scales with the strand's size on screen, so a near miss still counts.
    return bd <= Math.max(24, 0.05 * (y1 - y0)) ? best : null;
  }

  new ResizeObserver(resize).observe(canvas);
  resize();

  // Compile shaders up front, off the scroll path where the browser supports it.
  const ready = (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve()).catch(() => {});

  return {
    frame,
    regionScreen,
    pickRegion,
    ready,
    resize,
  };
}
