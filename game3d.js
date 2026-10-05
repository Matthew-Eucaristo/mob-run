/* MOB RUN 3D — the game from those ads, in Three.js.
   Chase-camera crowd runner: steer left/right, pick gates, shoot mobs, loot barrels. */
import * as THREE from './vendor/three.module.min.js';

const cv = document.getElementById('game');
const startOv = document.getElementById('startOverlay');
const overOv = document.getElementById('overOverlay');
const overStats = document.getElementById('overStats');
const reviveBtn = document.getElementById('reviveBtn');
const bestLine = document.getElementById('bestLine');
/* sound: always on; 'M' mutes */
const labelsEl = document.getElementById('labels');
const floatsEl = document.getElementById('floats');
const hudArmy = document.getElementById('hudArmy');
const hudWeapon = document.getElementById('hudWeapon');
const hudDist = document.getElementById('hudDist');
const hudLevel = document.getElementById('hudLevel');
const lvlFill = document.getElementById('lvlFill');
const zoneBanner = document.getElementById('zoneBanner');
const hintEl = document.getElementById('hint');

/* ---------------- sizes / coords ---------------- */
let W = 0, H = 0, DPR = 1;
const road = { x0: 0, x1: 0 };
const ROADW = 13;                 // world units across the road
let K = 0.014;                    // px -> world units
const wx = (x) => (x - W / 2) * K;
const wz = (wy) => (G.camY - wy) * K;   // ahead = negative z

/* ---------------- three setup ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 220);
scene.fog = new THREE.Fog(0x0e1526, 30, 110);

const hemi = new THREE.HemisphereLight(0x9db8ff, 0x1a2440, 1.15);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.3);
dir.position.set(-6, 14, 6);
scene.add(dir);
const rim = new THREE.DirectionalLight(0x7de8ff, 0.55);
rim.position.set(5, 8, -10);
scene.add(rim);
const warm = new THREE.PointLight(0xffd8a8, 26, 55, 1.6);
warm.position.set(0, 7, 6);
scene.add(warm);

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  road.x0 = W * 0.08; road.x1 = W * 0.92;
  K = ROADW / (road.x1 - road.x0);
}
window.addEventListener('resize', resize);

/* ---------------- audio ---------------- */
let AC = null, muted = false;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  if (AC && AC.state === 'suspended') AC.resume();
}
function tone(f, d, type, v, slide) {
  if (!AC || muted) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, v) {
  if (!AC || muted) return;
  const n = AC.createBuffer(1, AC.sampleRate * d, AC.sampleRate);
  const ch = n.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const s = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter(), t = AC.currentTime;
  s.buffer = n; f.type = 'lowpass'; f.frequency.value = 900;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t);
}
const sfx = {
  shoot: () => tone(880 + Math.random() * 220, 0.05, 'square', 0.02),
  good: () => { tone(620, 0.09, 'sine', 0.09); setTimeout(() => tone(930, 0.12, 'sine', 0.09), 60); },
  great: () => { tone(520, 0.09, 'sine', 0.1); setTimeout(() => tone(780, 0.09, 'sine', 0.1), 55); setTimeout(() => tone(1170, 0.16, 'sine', 0.11), 110); },
  bad: () => tone(160, 0.25, 'sawtooth', 0.1, 90),
  kill: () => tone(340 + Math.random() * 120, 0.06, 'triangle', 0.045, 120),
  hurt: () => tone(120, 0.12, 'sawtooth', 0.07, 70),
  boss: () => { tone(90, 0.5, 'sawtooth', 0.12, 45); noise(0.35, 0.12); },
  power: () => { tone(500, 0.08, 'square', 0.08); setTimeout(() => tone(1000, 0.14, 'square', 0.08), 70); },
  boom: () => { noise(0.5, 0.22); tone(70, 0.4, 'sine', 0.15, 35); },
  barrel: () => { noise(0.15, 0.1); tone(300, 0.12, 'triangle', 0.08, 80); },
};
/* 'M' toggles sound on desktop */

/* ---------------- zones ---------------- */
const ZONES = [
  { bg: '#0e1526', ground: '#0a1020', road: '#1a2440', post: '#2c3f63', dash: '#3a4f7a', sky: 0x9db8ff },
  { bg: '#0f1f10', ground: '#0a160a', road: '#1d3319', post: '#35572b', dash: '#4a7240', sky: 0xa8ffb0 },
  { bg: '#241209', ground: '#160b04', road: '#3d2214', post: '#5f3a28', dash: '#7a5238', sky: 0xffc89d },
  { bg: '#1c0f24', ground: '#100716', road: '#301a3d', post: '#4f2b5f', dash: '#6b4380', sky: 0xd8a8ff },
  { bg: '#0a1c22', ground: '#051014', road: '#143240', post: '#235063', dash: '#38647a', sky: 0x9de8ff },
];
const ZONE_NAMES = ['NIGHTFALL', 'TOXIC FLATS', 'EMBER RIDGE', 'VOID ZONE', 'DEEP RUN'];
const colCache = {};
const col3 = (hex) => colCache[hex] || (colCache[hex] = new THREE.Color(hex));
const curZone = { bg: new THREE.Color(ZONES[0].bg), ground: new THREE.Color(ZONES[0].ground), road: new THREE.Color(ZONES[0].road), post: new THREE.Color(ZONES[0].post), dash: new THREE.Color(ZONES[0].dash) };

/* ---------------- weapon tiers ---------------- */
const WT = [
  { name: 'PISTOL', dmg: 1, rate: 0.24, spread: 1, col: '#ffe97d', tl: 1.0 },
  { name: 'SMG', dmg: 1, rate: 0.15, spread: 1, col: '#7de8ff', tl: 1.25 },
  { name: 'RIFLE', dmg: 2, rate: 0.13, spread: 2, col: '#a8ffb0', tl: 1.5 },
  { name: 'SHOTGUN', dmg: 3, rate: 0.19, spread: 3, col: '#ff9d5d', tl: 0.8, tw: 1.5 },
  { name: 'MINIGUN', dmg: 2, rate: 0.065, spread: 3, col: '#ff6bd8', tl: 1.9 },
  { name: 'ANNIHILATOR', dmg: 5, rate: 0.11, spread: 3, col: '#ff4040', tl: 2.8, tw: 1.9 },
];

/* ---------------- state ---------------- */
const G = {
  mode: 'menu',
  camY: 0, speed: 150,
  armyX: 0, soldiers: 10,
  kills: 0, dist: 0, level: 1, peak: 10, best: 0,
  tier: 0, upDmg: 0, upRate: 0,
  streak: 0, killChain: 0, killChainT: 0, mileIdx: 0,
  shake: 0, slow: 0,
};
const MILES = [100, 250, 500, 1000, 2000, 4000];

let gates = [], enemies = [], walls = [], pickups = [], barrels = [], hazards = [];
let bullets = [], parts = [], floats = [], rewards = [];
let nextY = 400, bossCounter = 0, gatesSpawned = 0, gateSeq = 0;
let fireAcc = 0, drainAcc = 0, shootSfxAcc = 0;
let hintT = 0, zoneIdx = -1, fovKick = 0, muzzleGlow = 0, distMark = 0, revived = false, lastLevel = 1;

const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const chance = (p) => Math.random() < p;

/* ---------------- input ---------------- */
let dragging = false, lastPX = 0, keyDir = 0, prevArmyX = 0, bank = 0;
function press(x) {
  audio();
  if (G.mode === 'menu' || G.mode === 'over') { startGame(); return; }
  dragging = true; lastPX = x;
}
function move(x) {
  if (!dragging || G.mode !== 'run') return;
  G.armyX += (x - lastPX) * 1.7;
  lastPX = x;
  clampArmy();
}
function release() { dragging = false; }
function clampArmy() {
  const r = squadRadius();
  G.armyX = clamp(G.armyX, road.x0 + r * 0.7, road.x1 - r * 0.7);
}
cv.addEventListener('pointerdown', e => press(e.clientX));
cv.addEventListener('pointermove', e => move(e.clientX));
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);
startOv.addEventListener('pointerdown', () => press());
overOv.addEventListener('pointerdown', () => press());
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') keyDir = -1;
  else if (e.key === 'ArrowRight') keyDir = 1;
  else if (e.key === 'm' || e.key === 'M') muted = !muted;
  else if (e.key === ' ' || e.key === 'Enter') press();
});
document.addEventListener('keyup', e => {
  if ((e.key === 'ArrowLeft' && keyDir === -1) || (e.key === 'ArrowRight' && keyDir === 1)) keyDir = 0;
});

/* ================================================================
   THREE scene objects
   ================================================================ */

/* --- environment --- */
const groundMat = new THREE.MeshLambertMaterial({ color: ZONES[0].ground });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 300), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, 0, -60);
scene.add(ground);

const roadMat = new THREE.MeshLambertMaterial({ color: ZONES[0].road });
const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(ROADW + 1.6, 300), roadMat);
roadMesh.rotation.x = -Math.PI / 2;
roadMesh.position.set(0, 0.02, -60);
scene.add(roadMesh);

/* scrolling side posts + center dashes (instanced) */
const NPOST = 44, POST_GAP = 5;
const postMat = new THREE.MeshLambertMaterial({ color: ZONES[0].post });
const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), postMat, NPOST * 2);
scene.add(postMesh);
const NDASH = 30, DASH_GAP = 4.5;
const dashMat = new THREE.MeshBasicMaterial({ color: ZONES[0].dash });
const dashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.02, 1.6), dashMat, NDASH);
scene.add(dashMesh);

/* chevron arrows on the road */
const chevTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff'; g.lineWidth = 9; g.lineCap = 'round';
  g.beginPath(); g.moveTo(16, 42); g.lineTo(32, 22); g.lineTo(48, 42); g.stroke();
  return new THREE.CanvasTexture(c);
})();
const NCHEV = 14, CHEV_GAP = 9;
const chevMesh = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(1.5, 1.5),
  new THREE.MeshBasicMaterial({ map: chevTex, transparent: true, opacity: 0.4, color: ZONES[0].dash, depthWrite: false }),
  NCHEV);
scene.add(chevMesh);

/* roadside props: rocks + spires, wrap-scroll like posts */
const NROCK = 70, NSPIRE = 46, PROP_GAP = 5.5, PROP_RANGE = 150;
const rockMesh = new THREE.InstancedMesh(
  new THREE.DodecahedronGeometry(1, 0),
  new THREE.MeshStandardMaterial({ vertexColors: false, color: 0xffffff, roughness: 0.95, flatShading: true }), NROCK);
const spireMesh = new THREE.InstancedMesh(
  new THREE.ConeGeometry(0.7, 3.6, 5),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), NSPIRE);
rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
spireMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(rockMesh, spireMesh);
const propSeed = [];
for (let i = 0; i < NROCK; i++) propSeed.push({ x: (chance(0.5) ? -1 : 1) * rnd(ROADW / 2 + 2.5, 60), s: rnd(0.3, 1.6), ry: rnd(0, 6), kind: 0 });
for (let i = 0; i < NSPIRE; i++) propSeed.push({ x: (chance(0.5) ? -1 : 1) * rnd(ROADW / 2 + 2.2, 55), s: rnd(0.4, 1.5), ry: rnd(0, 6), kind: 1 });
function tintProps() {
  const z = ZONES[Math.max(0, zoneIdx)];
  let ri2 = 0, si = 0;
  for (const p of propSeed) {
    if (p.kind === 0) { rockMesh.setColorAt(ri2++, tmpCol.set(z.post).lerp(col3(z.ground), 0.35)); }
    else { spireMesh.setColorAt(si++, tmpCol.set(z.edge || z.post).lerp(col3(z.bg), 0.15)); }
  }
  rockMesh.instanceColor && (rockMesh.instanceColor.needsUpdate = true);
  spireMesh.instanceColor && (spireMesh.instanceColor.needsUpdate = true);
}

/* distant mountains silhouettes */
{
  const mGeo = new THREE.ConeGeometry(1, 1, 5);
  const mMat = new THREE.MeshLambertMaterial({ color: 0x11182c });
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(mGeo, mMat);
    const sx = (i % 2 ? -1 : 1) * rnd(46, 110);
    m.scale.set(rnd(14, 30), rnd(22, 46), rnd(10, 18));
    m.position.set(sx, m.scale.y * 0.45, -60 - i * 9 - rnd(0, 30));
    m.rotation.y = rnd(0, 3);
    scene.add(m);
  }
}

/* stars + motes */
const NSTARS = 260;
const starGeo = new THREE.BufferGeometry();
{
  const sp = new Float32Array(NSTARS * 3);
  for (let i = 0; i < NSTARS; i++) {
    sp[i * 3] = rnd(-120, 120); sp[i * 3 + 1] = rnd(14, 80); sp[i * 3 + 2] = rnd(-160, -10);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
}
const starMat = new THREE.PointsMaterial({ size: 0.55, color: 0xcfe0ff, transparent: true, opacity: 0.9, sizeAttenuation: true, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);
const ZONE_STARS = [0.9, 0.3, 0.15, 0.85, 0.45];

const NMOTES = 160;
const moteGeo = new THREE.BufferGeometry();
{
  const mp = new Float32Array(NMOTES * 3);
  for (let i = 0; i < NMOTES; i++) {
    mp[i * 3] = rnd(-20, 20); mp[i * 3 + 1] = rnd(0.2, 6); mp[i * 3 + 2] = rnd(-120, 10);
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
}
const moteMat = new THREE.PointsMaterial({ size: 0.18, color: 0x9db8ff, transparent: true, opacity: 0.28, depthWrite: false });
scene.add(new THREE.Points(moteGeo, moteMat));

/* --- merged-geometry builder: multi-part meshes, one draw call each --- */
function M4(px, py, pz, rx, ry, rz, sx, sy, sz) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz));
  return m;
}
function mergeParts(parts) {
  const posA = [], norA = [], colA = [];
  const col = new THREE.Color(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    nm.getNormalMatrix(p.m);
    const pos = g.attributes.position.array, nor = g.attributes.normal.array;
    col.set(p.c);
    for (let i = 0; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(p.m);
      posA.push(v.x, v.y, v.z);
      v.set(nor[i], nor[i + 1], nor[i + 2]).applyMatrix3(nm).normalize();
      norA.push(v.x, v.y, v.z);
      colA.push(col.r, col.g, col.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norA, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
  return out;
}
const CAP = (r, l, s) => new THREE.CapsuleGeometry(r, l, s || 3, s ? 10 : 8);
const SPH = (r, s) => new THREE.SphereGeometry(r, s || 10, s || 10);
const CONE = (r, h) => new THREE.ConeGeometry(r, h, 6);
const BOX = (a, b, c) => new THREE.BoxGeometry(a, b, c);

/* --- squad soldier: torso + helmet + visor + backpack + gun + legs --- */
const soldierGeo = mergeParts([
  { geo: CAP(0.14, 0.30), m: M4(0, 0.40, 0), c: '#eef4ff' },                    // torso
  { geo: SPH(0.14), m: M4(0, 0.70, 0, 0, 0, 0, 1, 0.8, 1), c: '#6ea2ff' },      // helmet
  { geo: BOX(0.17, 0.07, 0.05), m: M4(0, 0.70, -0.115), c: '#bfe8ff' },          // visor
  { geo: BOX(0.18, 0.20, 0.10), m: M4(0, 0.42, 0.13), c: '#2a3a5c' },            // backpack
  { geo: BOX(0.07, 0.08, 0.38), m: M4(0.10, 0.44, -0.22), c: '#1c2436' },        // gun
  { geo: BOX(0.09, 0.16, 0.09), m: M4(-0.07, 0.08, 0), c: '#263352' },           // leg L
  { geo: BOX(0.09, 0.16, 0.09), m: M4(0.07, 0.08, 0), c: '#263352' },            // leg R
]);
const MAXS = 220;
const soldierBody = new THREE.InstancedMesh(soldierGeo,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.08 }), MAXS);
soldierBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(soldierBody);
const muzzleMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.1, 0.1, 0.12),
  new THREE.MeshBasicMaterial({ color: 0xffe97d }), MAXS);
muzzleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(muzzleMesh);

/* dead soldier corpses (flung on drain) */
const deadSoldierMesh = new THREE.InstancedMesh(soldierGeo,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.08 }), 30);
deadSoldierMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(deadSoldierMesh);

/* --- enemies: merged multi-part geo per kind, feet at y=0 --- */
function enemyGeo(kind) {
  const HORN = '#2a1018';
  const parts = [];
  const body = (r, l, cy, sx, sy, sz) =>
    parts.push({ geo: CAP(r, l), m: M4(0, cy, 0, 0, 0, 0, sx || 1, sy || 1, sz || 1), c: '#ffffff' });
  const horn = (x, y, z, rx, rz, r, h) =>
    parts.push({ geo: CONE(r || 0.16, h || 0.5), m: M4(x, y, z, rx || 0, 0, rz || 0), c: HORN });
  const arm = (x, y, z, rz) =>
    parts.push({ geo: CAP(0.09, 0.28, 2), m: M4(x, y, z, -0.7, 0, rz), c: '#ffffff' });
  if (kind === 'runner') {
    body(0.34, 0.7, 0.72, 1, 1, 0.85);
    horn(0, 1.5, 0.05, -0.2, 0, 0.13, 0.45);
    arm(-0.36, 0.85, -0.1, -0.8); arm(0.36, 0.85, -0.1, 0.8);
  } else if (kind === 'brute') {
    body(0.75, 0.9, 1.2, 1, 0.95, 0.9);
    horn(-0.58, 2.1, 0, 0, 0.5, 0.2, 0.7); horn(0.58, 2.1, 0, 0, -0.5, 0.2, 0.7);
    horn(-0.82, 1.65, 0, 0, 1.1, 0.13, 0.45); horn(0.82, 1.65, 0, 0, -1.1, 0.13, 0.45);
    parts.push({ geo: SPH(0.3), m: M4(0, 0.9, 0.45), c: '#d8dce8' });            // pale belly
  } else if (kind === 'split') {
    body(0.5, 0.9, 1.0);
    parts.push({ geo: SPH(0.38), m: M4(0, 0.85, 0.3, 0, 0, 0, 1, 1.1, 0.6), c: '#e8c8ff' });
    horn(-0.3, 1.95, 0, 0, 0.45, 0.13, 0.4); horn(0.3, 1.95, 0, 0, -0.45, 0.13, 0.4); horn(0, 2.05, 0, -0.15, 0, 0.12, 0.42);
    arm(-0.5, 1.0, -0.05, -0.9); arm(0.5, 1.0, -0.05, 0.9);
  } else if (kind === 'gold') {
    body(0.5, 0.9, 1.0);
    parts.push({ geo: CONE(0.3, 0.5, 6), m: M4(0, 2.2, 0), c: '#fff2a8' });      // crown
    for (let i = 0; i < 4; i++) parts.push({ geo: CONE(0.07, 0.3, 5), m: M4(Math.cos(i * 1.57) * 0.28, 2.0, Math.sin(i * 1.57) * 0.28), c: '#fff2a8' });
    arm(-0.48, 1.0, -0.05, -0.85); arm(0.48, 1.0, -0.05, 0.85);
  } else if (kind === 'boss') {
    body(0.85, 1.6, 1.7, 1, 1, 0.9);
    horn(-0.7, 2.75, 0, 0, 0.5, 0.24, 0.9); horn(0.7, 2.75, 0, 0, -0.5, 0.24, 0.9);
    horn(-0.95, 2.2, 0, 0, 1.2, 0.15, 0.5); horn(0.95, 2.2, 0, 0, -1.2, 0.15, 0.5);
    parts.push({ geo: SPH(0.34), m: M4(0, 1.15, 0.5), c: '#f0b0a0' });           // chest glow spot
    parts.push({ geo: CONE(0.2, 0.6, 5), m: M4(0, 2.85, 0.25, 0.5, 0, 0), c: HORN }); // nose horn
  } else {
    body(0.5, 1.0, 1.05);
    horn(-0.4, 2.0, 0, 0, 0.4, 0.15, 0.5); horn(0.4, 2.0, 0, 0, -0.4, 0.15, 0.5);
    arm(-0.48, 1.05, -0.05, -0.85); arm(0.48, 1.05, -0.05, 0.85);
  }
  return mergeParts(parts);
}
const EDEF = {
  runner: { geo: enemyGeo('runner'), cap: 90, eyeY: 1.05, eyeZ: 0.3, eyeS: 0.55, labelY: 1.7 },
  normal: { geo: enemyGeo('normal'), cap: 70, eyeY: 1.55, eyeZ: 0.45, eyeS: 0.9, labelY: 2.4 },
  brute: { geo: enemyGeo('brute'), cap: 14, eyeY: 1.8, eyeZ: 0.62, eyeS: 1.2, labelY: 2.9 },
  split: { geo: enemyGeo('split'), cap: 24, eyeY: 1.55, eyeZ: 0.45, eyeS: 0.95, labelY: 2.4 },
  gold: { geo: enemyGeo('gold'), cap: 8, eyeY: 1.5, eyeZ: 0.45, eyeS: 0.9, labelY: 2.8 },
  boss: { geo: enemyGeo('boss'), cap: 4, eyeY: 2.55, eyeZ: 0.75, eyeS: 1.7, labelY: 3.7 },
};
const kindMesh = {};
for (const k in EDEF) {
  const m = new THREE.InstancedMesh(EDEF[k].geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05 }), EDEF[k].cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(m);
  kindMesh[k] = m;
}
const MAXE = 160;
const eyeMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.5, 0.14, 0.07),
  new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXE);
eyeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(eyeMesh);

/* --- soft blob shadows (fake AO) --- */
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const MAXSH = 260;
const shadowMesh = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.85, depthWrite: false }), MAXSH);
shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(shadowMesh);

/* --- sky dome gradient + horizon glow + moon --- */
const domeGeo = new THREE.SphereGeometry(160, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
{
  const pos = domeGeo.attributes.position, cols = [];
  const c1 = new THREE.Color('#0a0f22'), c2 = new THREE.Color('#ffffff');
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 160;
    const c = c2.clone().lerp(c1, Math.min(1, Math.max(0, h * 1.4)));
    cols.push(c.r, c.g, c.b);
  }
  domeGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
}
const domeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
const dome = new THREE.Mesh(domeGeo, domeMat);
dome.position.set(0, -4, -50);
scene.add(dome);

const glowTexMaker = () => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  return new THREE.CanvasTexture(c);
};
const glowTex = glowTexMaker();
const horizonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: ZONES[0].sky, transparent: true, opacity: 0.55, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
horizonGlow.position.set(0, 6, -150); horizonGlow.scale.set(190, 55, 1);
scene.add(horizonGlow);
const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xdfe9ff, transparent: true, opacity: 0.95, fog: false, depthWrite: false }));
moon.position.set(-48, 52, -140); moon.scale.set(17, 17, 1);
scene.add(moon);

/* --- battle scorch marks (instanced, fade out) --- */
const MAXSC = 44;
const scorchMesh = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.5, depthWrite: false, color: 0x140a08 }), MAXSC);
scorchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(scorchMesh);
const scorches = [];
function addScorch(x, wy, s) {
  scorches.push({ x, wy, s: s || 1.6, t: 0 });
  if (scorches.length > MAXSC) scorches.shift();
}

/* --- road edge light strips --- */
const stripMat = new THREE.MeshBasicMaterial({ color: ZONES[0].post });
for (const sx of [-1, 1]) {
  const st = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 300), stripMat);
  st.position.set(sx * (ROADW / 2 + 0.62), 0.06, -60);
  scene.add(st);
}

/* --- bullets: instanced tracers --- */
const MAXB = 500;
const bulletMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.07, 0.07, 0.55),
  new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXB);
bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(bulletMesh);

/* --- particles: Points --- */
const MAXP = 900;
const partGeo = new THREE.BufferGeometry();
const partPos = new Float32Array(MAXP * 3);
const partCol = new Float32Array(MAXP * 3);
partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
partGeo.setAttribute('color', new THREE.BufferAttribute(partCol, 3));
const partMesh = new THREE.Points(partGeo, new THREE.PointsMaterial({
  size: 0.3, vertexColors: true, transparent: true, opacity: 0.95,
  depthWrite: false, sizeAttenuation: true,
}));
scene.add(partMesh);

/* --- pickups & rewards: glowing orbs (small pool) --- */
const pickupProto = new THREE.SphereGeometry(0.32, 10, 10);
const pickupMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const PICKUP_COL = { rate: 0x7de8ff, dmg: 0xffd75d, spread: 0x7dff9b, heal: 0x7dff9b, gold: 0xffd75d, weapon: 0xff9d5d, upgrade: 0x7de8ff };

/* --- barrels: group per barrel --- */
const BAR_COL = { weapon: '#ff9d5d', heal: '#7dff9b', bomb: '#ff5d6a', gold: '#ffd75d', upgrade: '#7de8ff' };
const BAR_ICON = { weapon: '🔫', heal: '💚', bomb: '💣', gold: '⭐', upgrade: '⚡' };
const barrelGeoC = new THREE.CylinderGeometry(0.5, 0.55, 1.15, 12);
const barrelRing = new THREE.CylinderGeometry(0.56, 0.56, 0.14, 12);

/* --- emoji sprite texture cache --- */
const emojiTex = {};
function makeEmojiTex(ch) {
  if (emojiTex[ch]) return emojiTex[ch];
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  g.font = '72px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 48, 54);
  const t = new THREE.CanvasTexture(c);
  emojiTex[ch] = t;
  return t;
}
function makeSprite(ch) {
  const m = new THREE.SpriteMaterial({ map: makeEmojiTex(ch), transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.set(1.5, 1.5, 1);
  return s;
}

/* --- gate panels --- */
const PANEL_STYLE = {
  add: { bg: 'rgba(38,140,82,0.72)', edge: '#7dff9b' },
  mul: { bg: 'rgba(30,170,90,0.75)', edge: '#7dff9b' },
  gun: { bg: 'rgba(20,150,160,0.75)', edge: '#7de8ff' },
  sub: { bg: 'rgba(170,44,60,0.72)', edge: '#ff5d6a' },
  div: { bg: 'rgba(150,40,80,0.75)', edge: '#ff5d6a' },
};
function gateLabel(p) {
  if (p.t === 'add') return '+' + p.v;
  if (p.t === 'sub') return '-' + p.v;
  if (p.t === 'mul') return '×' + p.v;
  if (p.t === 'gun') return '🔫UP';
  return '÷' + p.v;
}
function gateGood(p) { return p.t === 'add' || p.t === 'mul' || p.t === 'gun'; }
function panelTex(p) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  const st = PANEL_STYLE[p.t];
  g.fillStyle = st.bg;
  g.beginPath(); g.roundRect(6, 6, 244, 148, 18); g.fill();
  g.strokeStyle = st.edge; g.lineWidth = 6; g.stroke();
  g.font = '900 84px Avenir Next, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 8;
  const lab = gateLabel(p);
  g.font = lab.length > 3 ? '900 64px Avenir Next, sans-serif' : '900 92px Avenir Next, sans-serif';
  g.fillText(lab, 128, 84);
  return new THREE.CanvasTexture(c);
}
const panelGeo = new THREE.PlaneGeometry(1, 4.6);
function makeGateMeshes(g) {
  const grp = new THREE.Group();
  g.meshes = []; g.frames = [];
  for (const p of g.panels) {
    const frame = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({
      color: PANEL_STYLE[p.t].edge, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
    }));
    frame.position.z = -0.02; frame.scale.setScalar(1.07);
    grp.add(frame); g.frames.push(frame);
    const m = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({
      map: panelTex(p), transparent: true, side: THREE.DoubleSide, depthWrite: false,
    }));
    grp.add(m); g.meshes.push(m);
  }
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.2, 0.28),
    new THREE.MeshLambertMaterial({ color: g.moving ? 0x7de8ff : 0xdfe9ff }));
  grp.add(post); g.postMesh = post;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.18, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x5f729a }));
  grp.add(base); g.baseMesh = base;
  grp.position.z = wz(g.wy);
  scene.add(grp);
  g.grp = grp;
}
function layoutGate(g) {
  const mid = gateMid(g);
  const lW = (mid - road.x0) * K, rW = (road.x1 - mid) * K;
  const l = g.meshes[0], r = g.meshes[1];
  l.scale.x = lW; l.position.set(wx((road.x0 + mid) / 2), 2.3, 0);
  r.scale.x = rW; r.position.set(wx((mid + road.x1) / 2), 2.3, 0);
  g.frames[0].scale.set(lW * 1.07, 4.6 * 1.07, 1); g.frames[0].position.set(l.position.x, 2.3, -0.02);
  g.frames[1].scale.set(rW * 1.07, 4.6 * 1.07, 1); g.frames[1].position.set(r.position.x, 2.3, -0.02);
  g.postMesh.position.set(wx(mid), 2.6, 0);
  g.baseMesh.scale.x = ROADW; g.baseMesh.position.set(0, 0.09, 0);
}
function removeGate(g) { if (g.grp) scene.remove(g.grp); }

/* --- walls --- */
const wallGeo = new THREE.BoxGeometry(1, 4.6, 0.9);
function makeWallMesh(w) {
  const m = new THREE.Mesh(wallGeo, new THREE.MeshLambertMaterial({ color: 0x35435f }));
  m.scale.x = ROADW;
  scene.add(m); w.mesh = m;
}

/* --- hazards: lava pools + sweeping sawblades (dodge, can't be shot) --- */
const lavaGeo = new THREE.PlaneGeometry(1, 1);
const sawGeo = mergeParts([
  { geo: new THREE.CylinderGeometry(1, 1, 0.15, 11), m: M4(0, 0.15, 0), c: '#9fb0d8' },
  { geo: new THREE.CylinderGeometry(0.3, 0.3, 0.26, 10), m: M4(0, 0.15, 0), c: '#2e3c58' },
]);
const sawRimGeo = new THREE.TorusGeometry(1.0, 0.08, 6, 26);
const sawTrackGeo = new THREE.BoxGeometry(ROADW + 1.4, 0.1, 0.5);
const sawTrackMat = new THREE.MeshLambertMaterial({ color: 0x27314d });
const sawMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 });
const sawRimMat = new THREE.MeshBasicMaterial({ color: 0xff5d6a });

function sawX(h) {
  return h.mid + Math.sin(performance.now() * h.speed + h.phase) * h.amp;
}

function spawnHazard(wy) {
  const d = G.level;
  if (chance(0.52)) {
    /* lava pool(s) anchored to a road edge — steer to the free side */
    const n = d >= 3 && chance(0.45) ? 2 : 1;
    let ly = wy;
    for (let i = 0; i < n; i++) {
      const wpx = (road.x1 - road.x0) * rnd(0.42, 0.58);
      const left = chance(0.5);
      const x = left ? road.x0 + wpx / 2 : road.x1 - wpx / 2;
      const len = rnd(150, 260);
      const h = { kind: 'lava', x, w: wpx, wy: ly, len, drain: 2 + Math.floor(d / 4), pop: 0 };
      const grp = new THREE.Group();
      const outer = new THREE.Mesh(lavaGeo, new THREE.MeshBasicMaterial({ color: 0xb32d12, transparent: true, opacity: 0.85, depthWrite: false }));
      outer.rotation.x = -Math.PI / 2; outer.position.y = 0.045;
      outer.scale.set(wpx * K, len * K, 1);
      const inner = new THREE.Mesh(lavaGeo, new THREE.MeshBasicMaterial({ color: 0xffb03d, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      inner.rotation.x = -Math.PI / 2; inner.position.y = 0.06;
      inner.scale.set(wpx * K * 0.8, len * K * 0.8, 1);
      const warn = makeSprite('⚠'); warn.position.set(0, 2.8, -len * K * 0.5 - 1.4);
      grp.add(outer, inner, warn);
      grp.position.set(wx(x), 0, wz(ly));
      scene.add(grp);
      h.grp = grp; h.inner = inner;
      hazards.push(h);
      ly += len + rnd(80, 140);
    }
  } else {
    /* sawblade sweeping across the road on a rail */
    const h = {
      kind: 'saw', wy, r: 88, drain: 4 + Math.floor(d / 4),
      mid: (road.x0 + road.x1) / 2 + rnd(-40, 40),
      amp: (road.x1 - road.x0) / 2 - rnd(95, 125),
      speed: rnd(0.0011, 0.0021), phase: rnd(0, 6), pop: 0,
    };
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(sawTrackGeo, sawTrackMat));
    grp.children[0].position.y = 0.05;
    const blade = new THREE.Group();
    const disc = new THREE.Mesh(sawGeo, sawMat);
    disc.scale.setScalar(1.25);
    const rim = new THREE.Mesh(sawRimGeo, sawRimMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.15; rim.scale.setScalar(1.25);
    blade.add(disc, rim);
    grp.add(blade);
    const warn = makeSprite('⚠'); warn.position.set(0, 3.1, -2.2);
    grp.add(warn);
    grp.position.set(0, 0, wz(wy));
    scene.add(grp);
    h.grp = grp; h.blade = blade;
    hazards.push(h);
  }
}

/* --- HTML label pool --- */
function mkLabel(cls) {
  const d = document.createElement('div');
  d.className = 'lb' + (cls ? ' ' + cls : '');
  labelsEl.appendChild(d);
  return d;
}
const tmpV = new THREE.Vector3();
function project(x3, y3, z3) {
  tmpV.set(x3, y3, z3).project(camera);
  return [(tmpV.x * 0.5 + 0.5) * W, (1 - (tmpV.y * 0.5 + 0.5)) * H, tmpV.z];
}
function setLabel(el, x3, y3, z3, txt) {
  if (txt !== undefined) el.textContent = txt;
  const [sx, sy, zz] = project(x3, y3, z3);
  if (zz > 1 || zz < -1 || sx < -120 || sx > W + 120 || sy < -60 || sy > H + 60) {
    el.style.display = 'none';
  } else {
    el.style.display = 'block';
    el.style.transform = `translate(${sx - W / 2}px,${sy - H / 2}px) translate(-50%,-50%)`;
    /* translate relative to left/top center: */
    el.style.left = '50%'; el.style.top = '50%';
  }
}
function floatText(x, wy, text, color, size, h) {
  const el = document.createElement('div');
  el.className = 'fl'; el.textContent = text;
  el.style.color = color; el.style.fontSize = (size || 18) + 'px';
  floatsEl.appendChild(el);
  floats.push({ el, x, wy, h: h === undefined ? 2.5 : h, vh: 2.6, t: 0, life: 1.05 });
}

/* ---------------- spawning ---------------- */
function schedule() {
  while (nextY < G.camY + H * 3.2) {
    const roll = Math.random();
    if (roll < 0.44) spawnGate(nextY);
    else if (roll < 0.65) spawnPack(nextY);
    else if (roll < 0.76) spawnBarrels(nextY);
    else if (roll < 0.83 && G.level >= 2) spawnHorde(nextY);
    else if (roll < 0.90 && G.level >= 2) spawnHazard(nextY);
    else spawnWall(nextY);
    if (chance(0.13)) spawnPickup(nextY + rnd(-150, 150));
    nextY += rnd(560, 860) - Math.min(G.level * 16, 150);
    bossCounter += 1;
    if (bossCounter >= 6) { bossCounter = 0; spawnBoss(nextY + 350); nextY += 900; }
  }
}

function spawnGate(wy) {
  const d = G.level;
  const addBase = ri(8, 16) + d * 5;
  const bigSub = ri(15, 30) + d * 5;
  const styles = [
    [{ t: 'add', v: addBase }, { t: 'mul', v: 2 }],
    [{ t: 'sub', v: bigSub }, { t: 'add', v: addBase + ri(4, 10) }],
    [{ t: 'mul', v: 2 }, { t: 'div', v: 2 }],
    [{ t: 'add', v: addBase }, { t: 'sub', v: ri(10, 22) }],
    [{ t: 'mul', v: 3 }, { t: 'sub', v: bigSub + d * 3 }],
    [{ t: 'add', v: addBase * 2 }, { t: 'mul', v: 2 }],
    [{ t: 'div', v: 2 }, { t: 'add', v: addBase + ri(0, 8) }],
    [{ t: 'mul', v: 3 }, { t: 'div', v: 3 }],
    [{ t: 'add', v: addBase + 20 }, { t: 'sub', v: bigSub * 2 }],
    [{ t: 'gun' }, { t: 'sub', v: bigSub }],
    [{ t: 'gun' }, { t: 'div', v: 2 }],
  ];
  if (chance(0.06)) styles.push([{ t: 'mul', v: 5 }, { t: 'sub', v: bigSub * 2 }]);
  if (chance(0.05)) styles.push([{ t: 'mul', v: 4 }, { t: 'div', v: 2 }]);
  const pair = gatesSpawned < 2 ? [{ t: 'add', v: addBase }, { t: 'mul', v: 2 }]
    : styles[ri(0, styles.length - 1)];
  gatesSpawned += 1;
  const moving = gatesSpawned > 3 && chance(Math.min(0.55, 0.22 + G.level * 0.05))
    ? { amp: rnd(45, 105), speed: rnd(0.0017, 0.0034), phase: rnd(0, 6) } : null;
  const g = { id: ++gateSeq, wy, passed: false, moving, mid: (road.x0 + road.x1) / 2, pop: 0,
    panels: [{ ...pair[0], side: 0 }, { ...pair[1], side: 1 }] };
  makeGateMeshes(g);
  gates.push(g);
}

function mkEnemy(kind, x, wy, hp) {
  const d = G.level;
  const e = { x, wy, hp, maxhp: hp, attacking: false, boss: false, kind, pop: 0, label: mkLabel(kind === 'boss' ? 'boss' : '') };
  if (kind === 'runner') { e.r = rnd(8, 10); e.drift = rnd(22, 34); e.col = '#ff6b5d'; e.drain = 1; }
  else if (kind === 'brute') { e.r = rnd(22, 27); e.drift = rnd(2, 5); e.col = '#a32233'; e.drain = 2; }
  else if (kind === 'split') { e.r = rnd(14, 16); e.drift = rnd(8, 14); e.col = '#c96bff'; e.drain = 1; }
  else if (kind === 'gold') { e.r = rnd(13, 15); e.drift = rnd(6, 10); e.col = '#ffd75d'; e.drain = 1; }
  else if (kind === 'boss') { e.r = 26; e.drift = 4; e.col = '#c93a2e'; e.drain = 2; e.boss = true; }
  else { e.r = rnd(11, 15); e.drift = rnd(6, 16); e.col = '#e8485a'; e.drain = 1; }
  return e;
}

function spawnPack(wy) {
  const d = G.level;
  const cxp = rnd(road.x0 + 40, road.x1 - 40);
  const roll = Math.random();
  if (roll < 0.28 && d >= 1) {
    const n = ri(4, 7) + Math.min(d, 3);
    for (let i = 0; i < n; i++)
      enemies.push(mkEnemy('runner', clamp(cxp + rnd(-80, 80), road.x0 + 12, road.x1 - 12),
        wy + rnd(-80, 80), Math.round((4 + d * 2) * rnd(0.8, 1.3))));
  } else if (roll < 0.45 && d >= 2) {
    enemies.push(mkEnemy('brute', cxp, wy, Math.round((40 + d * 26) * rnd(0.9, 1.2))));
    for (let i = 0; i < ri(1, 2); i++)
      enemies.push(mkEnemy('normal', clamp(cxp + rnd(-50, 50), road.x0 + 16, road.x1 - 16),
        wy + rnd(-50, 50), Math.round((7 + d * 4) * rnd(0.8, 1.3))));
  } else if (roll < 0.58 && d >= 2) {
    for (let i = 0; i < ri(2, 3); i++)
      enemies.push(mkEnemy('split', clamp(cxp + rnd(-60, 60), road.x0 + 16, road.x1 - 16),
        wy + rnd(-60, 60), Math.round((14 + d * 5) * rnd(0.9, 1.3))));
  } else {
    const n = ri(2, 4) + Math.min(Math.floor(d * 0.7), 3);
    for (let i = 0; i < n; i++)
      enemies.push(mkEnemy('normal', clamp(cxp + rnd(-70, 70), road.x0 + 16, road.x1 - 16),
        wy + rnd(-60, 60), Math.round((7 + d * 4) * rnd(0.8, 1.4))));
  }
  if (chance(0.05)) enemies.push(mkEnemy('gold', rnd(road.x0 + 30, road.x1 - 30), wy, Math.round(30 + d * 18)));
}

function spawnHorde(wy) {
  const d = G.level;
  const n = ri(9, 13) + Math.min(d, 5);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1 || 1);
    enemies.push(mkEnemy('runner',
      road.x0 + 24 + t * (road.x1 - road.x0 - 48) + rnd(-8, 8),
      wy + (i % 2) * 34 + rnd(-8, 8),
      Math.round((5 + d * 2.4) * rnd(0.8, 1.2))));
  }
}

function spawnWall(wy) {
  const d = G.level;
  const hp = Math.round((18 + d * 22) * rnd(0.85, 1.2));
  const w = { wy, hp, maxhp: hp, dead: false, pop: 0, label: mkLabel('wall') };
  makeWallMesh(w);
  walls.push(w);
}

function spawnBoss(wy) {
  const d = G.level;
  const hp = Math.round(42 + d * 46);
  const bx = (road.x0 + road.x1) / 2 + rnd(-60, 60);
  const boss = mkEnemy('boss', bx, wy, hp);
  boss.roar = 1;
  enemies.push(boss);
  zoneBanner.textContent = '⚠ BOSS';
  zoneBanner.style.color = '#ff5d6a';
  zoneBanner.style.opacity = '1';
  setTimeout(() => { zoneBanner.style.opacity = '0'; }, 1500);
  setTimeout(() => { zoneBanner.style.color = ''; }, 1700);
  if (d >= 3 && chance(0.5)) {
    enemies.push(mkEnemy('normal', clamp(bx - 60, road.x0 + 16, road.x1 - 16), wy + 40, Math.round(10 + d * 4)));
    enemies.push(mkEnemy('normal', clamp(bx + 60, road.x0 + 16, road.x1 - 16), wy + 40, Math.round(10 + d * 4)));
  }
}

function spawnBarrels(wy) {
  const d = G.level;
  const n = ri(1, 3);
  const kinds = ['weapon', 'heal', 'bomb', 'gold', 'upgrade'];
  for (let i = 0; i < n; i++) {
    const kind = kinds[ri(0, kinds.length - 1)];
    const b = {
      x: rnd(road.x0 + 34, road.x1 - 34), wy: wy + i * rnd(40, 90) + rnd(-20, 20),
      hp: Math.round((10 + d * 7) * rnd(0.85, 1.2)), maxhp: 0, kind, pop: 0,
      label: mkLabel('barrel'),
    };
    const grp = new THREE.Group();
    const body = new THREE.Mesh(barrelGeoC, new THREE.MeshStandardMaterial({ color: BAR_COL[kind], roughness: 0.55, metalness: 0.3 }));
    body.position.y = 0.58;
    const ring1 = new THREE.Mesh(barrelRing, new THREE.MeshStandardMaterial({ color: 0xdfe9ff, roughness: 0.4, metalness: 0.6 }));
    ring1.position.y = 0.32;
    const ring2 = ring1.clone(); ring2.position.y = 0.88;
    const icon = makeSprite(BAR_ICON[kind]); icon.position.y = 1.9;
    grp.add(body, ring1, ring2, icon);
    grp.position.set(wx(b.x), 0, wz(b.wy));
    scene.add(grp);
    b.grp = grp;
    barrels.push(b);
  }
  for (const b of barrels) if (!b.maxhp) b.maxhp = b.hp;
}

function spawnPickup(wy) {
  const kinds = ['rate', 'dmg', 'spread', 'heal'];
  const kind = kinds[ri(0, kinds.length - 1)];
  const m = new THREE.Mesh(pickupProto, new THREE.MeshBasicMaterial({ color: PICKUP_COL[kind] }));
  scene.add(m);
  pickups.push({ x: rnd(road.x0 + 30, road.x1 - 30), wy, kind, taken: false, mesh: m, pop: 0 });
}

/* ---------------- combat helpers ---------------- */
function squadRadius() { return clamp(15 + G.soldiers * 0.42, 22, 88); }

function addSoldiers(n) {
  const prevPeak = G.peak;
  G.soldiers = clamp(Math.round(n), 0, 9999);
  G.peak = Math.max(G.peak, G.soldiers);
  while (G.mileIdx < MILES.length && G.peak >= MILES[G.mileIdx]) {
    if (MILES[G.mileIdx] > prevPeak) {
      floatText(G.armyX, G.camY, 'ARMY ' + MILES[G.mileIdx] + '!', '#ffd75d', 34, 4);
      sfx.great(); G.shake = Math.max(G.shake, 8);
    }
    G.mileIdx += 1;
  }
  if (G.soldiers <= 0) gameOver();
}

function gateMid(g) {
  if (!g.moving) return g.mid;
  return g.mid + Math.sin(performance.now() * g.moving.speed + g.moving.phase) * g.moving.amp;
}

function applyGate(g) {
  const p = (G.armyX < gateMid(g)) ? g.panels[0] : g.panels[1];
  let delta = 0, gunUp = false;
  if (p.t === 'gun') gunUp = true;
  else if (p.t === 'add') delta = p.v;
  else if (p.t === 'sub') delta = -p.v;
  else if (p.t === 'mul') delta = G.soldiers * (p.v - 1);
  else delta = Math.ceil(G.soldiers / p.v) - G.soldiers;
  if (G.soldiers + delta < 1) delta = 1 - G.soldiers;
  addSoldiers(G.soldiers + delta);
  const good = gunUp || delta >= 0;
  if (good) G.streak += 1; else G.streak = 0;
  if (gunUp) weaponUp();
  const lab = gunUp ? 'WEAPON UP!' : ((delta >= 0 ? '+' : '') + delta);
  floatText(G.armyX, G.camY + 10,
    (!gunUp && (p.t === 'mul' || p.t === 'div') ? gateLabel(p) + ' → ' : '') + lab,
    good ? (p.t === 'mul' || gunUp ? '#ffd75d' : '#7dff9b') : '#ff5d6a',
    p.t === 'mul' || gunUp ? 32 : 24, 3.4);
  if (good) (p.t === 'mul' && p.v >= 3 || gunUp ? sfx.great : sfx.good)();
  else sfx.bad();
  g.punch = 1;
  G.shake = p.t === 'mul' ? 7 : 4;
  fovKick = Math.min(fovKick + (p.t === 'mul' ? 6 : 3), 10);
  for (let i = 0; i < 18; i++) parts.push(mkPart(G.armyX + rnd(-30, 30), G.camY + rnd(-10, 30), good ? '#7dff9b' : '#ff5d6a'));
  ringT = 0; ringMat.color.set(good ? (p.t === 'mul' ? '#ffd75d' : '#7dff9b') : '#ff5d6a');
  if (g.grp) { for (const m of g.meshes) m.material.opacity = 0.25; for (const f of g.frames) f.material.opacity = 0.12; }
  vib(good ? 18 : 45);
}

function vib(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }
const vigEl = document.getElementById('vignette');
let vigT = null, lastDanger = false;
function dmgFlash() {
  const v = document.getElementById('vignette');
  if (!v) return;
  v.style.opacity = '1';
  clearTimeout(vigT);
  vigT = setTimeout(() => { v.style.opacity = '0'; }, 70);
}

/* --- music: tiny bassline sequencer --- */
let musTimer = null, musStep = 0;
const BASS_PAT = [0, 0, 3, 0, 5, 0, 3, 2];
const BASS_FREQ = [55, 61.74, 65.41, 73.42, 82.41, 87.31, 98, 110];
function musicStart() {
  if (musTimer || !AC) return;
  musStep = 0;
  musTimer = setInterval(() => {
    if (!AC || muted || G.mode !== 'run') { musStep++; return; }
    const s = musStep % 8;
    const zi = Math.max(0, zoneIdx);
    if (s === 0 || s === 4) tone(58, 0.1, 'sine', 0.11, 38);
    if (s === 2 || s === 6) noise(0.03, 0.014);
    const deg = BASS_PAT[s] + zi;
    tone(BASS_FREQ[deg % BASS_FREQ.length], 0.13, 'sawtooth', 0.026);
    if (s === 7) tone(BASS_FREQ[(deg + 2) % BASS_FREQ.length] * 2, 0.09, 'triangle', 0.02);
    musStep++;
  }, 132);
}
function musicStop() { clearInterval(musTimer); musTimer = null; }

function weaponUp() {
  if (G.tier < WT.length - 1) {
    G.tier += 1;
    floatText(G.armyX, G.camY, WT[G.tier].name + '!', WT[G.tier].col, 28, 4);
    sfx.great();
  } else { G.upDmg += 2; floatText(G.armyX, G.camY, 'DMG +2', '#ffd75d', 24, 4); }
}

function mkPart(x, wy, color) {
  return { x, wy, h: rnd(0.3, 1.6), vx: rnd(-90, 90), vwy: rnd(-90, 90), vh: rnd(1, 5),
    t: 0, life: rnd(0.3, 0.75), color };
}

/* --- gate shockwave ring --- */
const ringMat = new THREE.MeshBasicMaterial({ color: 0x7dff9b, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), ringMat);
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
scene.add(ring);
let ringT = 9;

/* --- death flings (enemy corpses + soldier corpses) --- */
const deadEnemies = [];
function flingEnemy(e) {
  deadEnemies.push({ x: e.x, wy: e.wy, kind: e.kind, s: e._s || 0.5, t: 0,
    vx: rnd(-55, 55), vwy: rnd(25, 65), y: 0.4, vy: rnd(3.2, 6), spin: rnd(-7, 7) });
  if (deadEnemies.length > 26) deadEnemies.shift();
}
const MAXDEAD = 30;
const deadSoldiers = [];
function flingSoldier() {
  deadSoldiers.push({ x: G.armyX + rnd(-18, 18), wy: G.camY + rnd(0, 22),
    y: 0.45, vy: rnd(2.6, 4.6), vx: rnd(-45, 45), vwy: -rnd(35, 75), spin: rnd(-8, 8), t: 0 });
  if (deadSoldiers.length > MAXDEAD) deadSoldiers.shift();
}

/* ---------------- game flow ---------------- */
function startGame() {
  G.mode = 'run'; G.camY = 0; G.speed = 150;
  G.armyX = W / 2; G.soldiers = 10; G.kills = 0; G.dist = 0; G.level = 1; G.peak = 10;
  G.tier = 0; G.upDmg = 0; G.upRate = 0;
  G.streak = 0; G.killChain = 0; G.killChainT = 0; G.mileIdx = 0;
  G.shake = 0; G.slow = 0;
  clearWorld();
  nextY = H * 0.55; bossCounter = 0; gatesSpawned = 0; fireAcc = 0; drainAcc = 0; hintT = 4; zoneIdx = -1; distMark = 0; revived = false; lastLevel = 1;
  startOv.style.display = 'none'; overOv.style.display = 'none';
  musicStart();
}

function clearWorld() {
  for (const g of gates) removeGate(g);
  for (const w of walls) { scene.remove(w.mesh); w.label.remove(); }
  for (const e of enemies) e.label.remove();
  for (const b of barrels) { scene.remove(b.grp); b.label.remove(); }
  for (const p of pickups) scene.remove(p.mesh);
  for (const r of rewards) scene.remove(r.mesh);
  for (const h of hazards) scene.remove(h.grp);
  for (const f of floats) f.el.remove();
  gates = []; enemies = []; walls = []; pickups = []; barrels = []; hazards = [];
  bullets = []; parts = []; floats = []; rewards = [];
  deadEnemies.length = 0; deadSoldiers.length = 0; scorches.length = 0;
  labelsEl.innerHTML = ''; floatsEl.innerHTML = '';
}

function gameOver() {
  G.mode = 'over';
  const d = Math.floor(G.dist);
  const isBest = d > G.best;
  if (isBest) { G.best = d; try { localStorage.setItem('mobrun_best', String(d)); } catch (e) { } }
  overStats.innerHTML =
    `${isBest ? '<b style="color:#ffd75d">NEW BEST!</b><br>' : ''}` +
    `<span style="font-size:32px;font-weight:900">${d}m</span><br>` +
    `<span style="font-size:13px;color:#8fa8cc">kills ${G.kills} &middot; peak army ${G.peak} &middot; best ${G.best}m</span>`;
  overOv.style.display = 'flex';
  if (reviveBtn) reviveBtn.style.display = revived ? 'none' : 'block';
  sfx.boss(); vib(80);
}

function revive() {
  if (G.mode !== 'over' || revived) return;
  revived = true;
  for (const e of enemies) e.label.remove();
  enemies.length = 0; deadEnemies.length = 0;
  overOv.style.display = 'none';
  G.mode = 'run';
  addSoldiers(Math.max(24, Math.ceil(G.peak * 0.5)));
  floatText(G.armyX, G.camY + 20, 'SECOND WIND!', '#7de8ff', 30, 4);
  ringT = 0; ringMat.color.set('#7de8ff');
  sfx.great(); vib(40);
}
if (reviveBtn) reviveBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault(); audio(); revive();
});

try { G.best = parseInt(localStorage.getItem('mobrun_best', '0') || '0', 10) || 0; } catch (e) { }
if (bestLine) bestLine.textContent = G.best ? `BEST RUN: ${G.best}m` : '';

/* ---------------- update ---------------- */
function hurt(e, dmg) {
  e.hp -= dmg;
  e.hitT = 0.1;
  e.wy += Math.min(7, dmg * 0.18);
  if (e.hp > 0 && parts.length < MAXP - 8 && Math.random() < 0.55)
    parts.push(mkPart(e.x + rnd(-5, 5), e.wy + rnd(-4, 4), '#e8f2ff'));
  if (e.hp <= 0 && !e._dead) {
    e.hp = 0; e._dead = true;
    flingEnemy(e);
    for (let i = 0; i < (e.boss ? 40 : 9); i++) parts.push(mkPart(e.x, e.wy, e.boss ? '#ff9d5d' : e.col));
    addScorch(e.x, e.wy, e.boss ? 4.5 : 1.4 + e.r * K);
    G.kills += 1;
    G.killChain += 1; G.killChainT = 1.4;
    if (G.killChain === 8 || G.killChain === 15 || G.killChain === 25)
      floatText(e.x, e.wy, 'RAMPAGE ×' + G.killChain, '#ff6bd8', 26, 3);
    if (e.boss) {
      sfx.boss(); G.shake = 14; G.slow = 0.45; vib(70);
      const reward = 25 + G.level * 10;
      floatText(e.x, e.wy, 'BOSS DOWN +' + reward, '#ffd75d', 30, 4);
      addSoldiers(G.soldiers + reward);
      for (let i = 0; i < 30; i++) parts.push(mkPart(e.x + rnd(-40, 40), e.wy + rnd(-40, 40), '#ffd75d'));
    } else {
      sfx.kill();
      if (e.kind === 'split') {
        for (let k = 0; k < 2; k++)
          enemies.push(mkEnemy('runner', clamp(e.x + (k ? 14 : -14), road.x0 + 12, road.x1 - 12),
            e.wy, Math.round(e.maxhp * 0.3 + 4)));
      }
      if (e.kind === 'gold') {
        const g = ri(8, 18);
        addSoldiers(G.soldiers + g);
        floatText(e.x, e.wy, '+' + g + ' JACKPOT', '#ffd75d', 22, 3);
      }
      if (chance(0.06)) {
        const m = new THREE.Mesh(pickupProto, new THREE.MeshBasicMaterial({ color: PICKUP_COL.heal }));
        scene.add(m);
        pickups.push({ x: e.x, wy: e.wy, kind: 'heal', taken: false, mesh: m });
      }
      if (chance(0.12)) addSoldiers(G.soldiers + 1);
    }
  }
}

function hitBarrel(bar, dmg) {
  bar.hp -= dmg;
  bar.hitT = 0.28;
  if (bar.hp <= 0 && !bar._dead) {
    bar._dead = true;
    sfx.barrel(); G.shake = Math.max(G.shake, 4);
    for (let i = 0; i < 16; i++) parts.push(mkPart(bar.x, bar.wy, BAR_COL[bar.kind]));
    if (bar.kind === 'bomb') {
      sfx.boom(); G.shake = 12;
      for (const e of enemies) {
        if (e.wy - G.camY > -40 && e.wy - G.camY < H * 1.4) hurt(e, 60);
      }
      for (let i = 0; i < 30; i++) parts.push(mkPart(bar.x + rnd(-60, 60), bar.wy + rnd(-40, 40), '#ff9d5d'));
      floatText(bar.x, bar.wy, 'BOOM', '#ff9d5d', 28, 3);
    } else {
      const m = new THREE.Mesh(pickupProto, new THREE.MeshBasicMaterial({ color: PICKUP_COL[bar.kind] }));
      m.position.set(wx(bar.x), 1.4, wz(bar.wy));
      scene.add(m);
      rewards.push({ x: bar.x, wy: bar.wy, t: 0, kind: bar.kind, mesh: m });
    }
    scene.remove(bar.grp); bar.label.style.display = 'none';
  }
}

function killWall(w) {
  w.dead = true; w.deadT = 0; sfx.power(); G.shake = 8;
  for (let i = 0; i < 26; i++) parts.push(mkPart(rnd(road.x0, road.x1), w.wy, '#b7c6e8'));
  floatText(W / 2, w.wy, 'WALL BROKEN', '#b7c6e8', 24, 3);
  w.label.style.display = 'none';
}

function takePickup(kind, x) {
  sfx.power();
  if (kind === 'rate') { G.upRate += 0.02; floatText(x, G.camY, 'FIRE RATE +', '#7de8ff', 21, 3.5); }
  if (kind === 'dmg') { G.upDmg += 1; floatText(x, G.camY, 'DAMAGE +1', '#ffd75d', 21, 3.5); }
  if (kind === 'spread') { G.upDmg += 1; floatText(x, G.camY, 'POWER +1', '#7dff9b', 21, 3.5); }
  if (kind === 'heal') { addSoldiers(G.soldiers + 15); floatText(x, G.camY, '+15 SOLDIERS', '#7dff9b', 21, 3.5); }
  if (kind === 'gold') { const g = ri(10, 24); addSoldiers(G.soldiers + g); floatText(x, G.camY, '+' + g + ' GOLD', '#ffd75d', 21, 3.5); }
  if (kind === 'weapon') weaponUp();
  if (kind === 'upgrade') { G.upRate += 0.015; G.upDmg += 1; floatText(x, G.camY, 'OVERCLOCK!', '#7de8ff', 23, 3.5); }
  for (let i = 0; i < 12; i++) parts.push(mkPart(x, G.camY + 10, '#7de8ff'));
}

function formation(n) {
  const out = [];
  const cols = Math.max(2, Math.ceil(Math.sqrt(n) * 1.3));
  const sp = 16;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    out.push({ x: (c - (cols - 1) / 2) * sp + Math.sin(i * 7.3) * 6, y: (r - cols / 2) * sp + Math.cos(i * 3.1) * 6 });
  }
  return out;
}

/* ---------------- frame ---------------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (G.mode !== 'run') { draw(now); return; }
  if (G.slow > 0) { G.slow -= dt; dt *= 0.35; }
  update(dt);
  draw(now);
}
requestAnimationFrame(frame);

function update(dt) {
  hintT = Math.max(0, hintT - dt);
  if (keyDir) { G.armyX += keyDir * W * 1.1 * dt; clampArmy(); }
  const axVel = (G.armyX - prevArmyX) / Math.max(dt, 0.001);
  prevArmyX = G.armyX;
  bank += (clamp(-axVel * 0.00035, -0.055, 0.055) - bank) * Math.min(1, dt * 8);
  if (G.killChainT > 0) { G.killChainT -= dt; if (G.killChainT <= 0) G.killChain = 0; }

  G.speed = 150 + Math.min(G.level * 15, 110) + Math.min(G.dist * 0.05, 85);
  G.camY += G.speed * dt;
  G.dist = G.camY / 40;
  G.level = 1 + Math.floor(G.dist / 120);
  const dm = Math.floor(G.dist / 100);
  if (dm > distMark) { distMark = dm; floatText(W / 2, G.camY + 46, dm * 100 + 'm!', '#7de8ff', 22, 3.4); }
  if (G.level > lastLevel) {
    lastLevel = G.level;
    const bonus = Math.max(5, Math.ceil(G.soldiers * 0.12));
    addSoldiers(G.soldiers + bonus);
    floatText(G.armyX, G.camY + 30, 'LEVEL UP +' + bonus, '#c96bff', 26, 3.8);
    sfx.great();
  }
  G.shake = Math.max(0, G.shake - dt * 22);
  fovKick = Math.max(0, fovKick - dt * 14);

  /* zone transition banner */
  const zi = (G.level - 1) % ZONES.length;
  if (zi !== zoneIdx) {
    zoneIdx = zi;
    tintProps();
    if (G.dist > 5) {
      zoneBanner.textContent = ZONE_NAMES[zi];
      zoneBanner.style.color = '';
      zoneBanner.style.opacity = '1';
      setTimeout(() => { zoneBanner.style.opacity = '0'; }, 1400);
    }
  }

  schedule();

  /* squad firing */
  const wt = WT[G.tier];
  const shooters = Math.min(G.soldiers, 60);
  const dmgPerBullet = (wt.dmg + G.upDmg) * Math.max(1, Math.ceil(G.soldiers / shooters));
  const rate = Math.max(0.05, wt.rate - G.upRate);
  fireAcc += dt;
  const interval = rate / Math.max(1, shooters * 0.11);
  const muzzleWy = G.camY + 30;
  while (fireAcc >= interval) {
    fireAcc -= interval;
    const offs = formation(shooters);
    const o = offs[ri(0, offs.length - 1)];
    const mx = G.armyX + o.x;
    let tvx = 0, twy = 760, tgt = null, best = 640;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const dy = e.wy - muzzleWy;
      if (dy < -60 || dy > 1400) continue;
      const d = Math.hypot(e.x - mx, dy);
      if (d < best) { best = d; tgt = { x: e.x, wy: e.wy }; }
    }
    for (const b of barrels) {
      if (b._dead) continue;
      const dy = b.wy - muzzleWy;
      if (dy < -60 || dy > 1400) continue;
      const d = Math.hypot(b.x - mx, dy) * 0.85;
      if (d < best) { best = d; tgt = { x: b.x, wy: b.wy }; }
    }
    for (const w of walls) {
      if (w.dead) continue;
      const dy = w.wy - muzzleWy;
      if (dy < -50 || dy > 1400) continue;
      const d = Math.abs(dy) + Math.abs(W / 2 - mx) * 0.5;
      if (d < best) { best = d; tgt = { x: mx, wy: w.wy }; }
    }
    if (tgt) {
      const dx = tgt.x - mx, dy = tgt.wy - muzzleWy, len = Math.hypot(dx, dy) || 1;
      tvx = (dx / len) * 760; twy = (dy / len) * 760;
    }
    for (let s = 0; s < wt.spread; s++) {
      const jit = (s - (wt.spread - 1) / 2) * 0.10 + rnd(-0.03, 0.03);
      const cs = Math.cos(jit), sn = Math.sin(jit);
      bullets.push({ x: mx, wy: muzzleWy, vx: tvx * cs - twy * sn, vwy: tvx * sn + twy * cs,
        dmg: dmgPerBullet, col: wt.col, len: wt.tl, wid: wt.tw || 1 });
    }
    shootSfxAcc += 1;
    if (shootSfxAcc % 4 === 0) sfx.shoot();
    if (parts.length < MAXP - 24 && chance(0.4))
      parts.push({ x: mx, wy: muzzleWy, h: 0.55, vx: rnd(-15, 15), vwy: rnd(60, 140), vh: rnd(0.5, 1.5), t: 0, life: 0.14, color: '#fff2a8' });
    muzzleGlow = 1;
  }
  if (bullets.length > MAXB) bullets.splice(0, bullets.length - MAXB);

  /* bullets */
  const sr = squadRadius();
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const prevWy = b.wy;
    b.x += b.vx * dt; b.wy += b.vwy * dt;
    if (b.wy < G.camY - 60 || b.wy > G.camY + 1500 || b.x < -20 || b.x > W + 20) { bullets.splice(i, 1); continue; }
    /* bullets crossing a gate row take that panel's effect too */
    for (const g of gates) {
      if (g.id === b.lastGate || !(prevWy < g.wy && b.wy >= g.wy)) continue;
      b.lastGate = g.id;
      const p = (b.x < gateMid(g)) ? g.panels[0] : g.panels[1];
      if (p.t === 'mul') {
        b.dmg *= p.v; b.col = '#ffd75d';
        for (let k = 0; k < p.v - 1 && bullets.length < MAXB - 12; k++) {
          const a = rnd(-0.09, 0.09), cs = Math.cos(a), sn = Math.sin(a);
          bullets.push({ x: b.x, wy: b.wy, vx: b.vx * cs - b.vwy * sn, vwy: b.vx * sn + b.vwy * cs,
            dmg: b.dmg, col: b.col, len: b.len, wid: b.wid, lastGate: g.id });
        }
        if (floats.length < 26 && chance(0.35)) floatText(b.x, b.wy, 'AMMO ×' + p.v, '#ffd75d', 15, 2.5);
      }
      else if (p.t === 'add') { b.dmg += p.v * 0.3 + 2; b.col = '#7dff9b'; }
      else if (p.t === 'sub') { b.dmg -= p.v * 0.3 + 2; }
      else if (p.t === 'div') { b.dmg = Math.max(0.5, b.dmg / p.v); }
      else if (p.t === 'gun') { b.dmg *= 1.5; b.col = '#7de8ff'; }
      for (let k = 0; k < 6 && parts.length < MAXP - 8; k++)
        parts.push(mkPart(b.x + rnd(-6, 6), b.wy + rnd(-4, 4), p.t === 'sub' || p.t === 'div' ? '#ff5d6a' : '#ffd75d'));
    }
    if (b.dmg <= 0) { bullets.splice(i, 1); continue; }
    let hit = false;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const dA = e.wy - G.camY;
      if (dA < -(sr + 40) || dA > 1400) continue;
      const dx = b.x - e.x, dy = b.wy - e.wy;
      if (dx * dx + dy * dy < (e.r + 6) * (e.r + 6)) { hurt(e, b.dmg); hit = true; break; }
    }
    if (!hit) for (const bar of barrels) {
      if (bar._dead) continue;
      const dx = b.x - bar.x, dy = b.wy - bar.wy;
      if (dx * dx + dy * dy < 20 * 20) { hitBarrel(bar, b.dmg); hit = true; break; }
    }
    if (!hit) for (const w of walls) {
      if (w.dead) continue;
      if (Math.abs(b.wy - w.wy) < 16 && b.x > road.x0 && b.x < road.x1) {
        w.hp -= b.dmg; hit = true;
        if (w.hp <= 0) killWall(w);
        break;
      }
    }
    if (hit) bullets.splice(i, 1);
  }

  /* sprint dust */
  if (G.mode === 'run' && parts.length < MAXP - 4 && Math.random() < 0.35)
    parts.push({ x: G.armyX + rnd(-16, 16), wy: G.camY + rnd(-8, 6), h: 0.15,
      vx: rnd(-8, 8), vwy: -rnd(20, 50), vh: rnd(0.4, 1), t: 0, life: rnd(0.3, 0.6), color: '#7d88ab' });

  /* enemies drift toward the squad */
  drainAcc += dt;
  const drainTick = 0.36;
  const doDrain = drainAcc >= drainTick;
  let tickDmg = 0;
  const drainCap = Math.max(1, Math.ceil(G.soldiers * 0.08));
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e._dead) { e.label.remove(); enemies.splice(i, 1); continue; }
    e.wy -= e.drift * dt;
    e.pop = Math.min(1, e.pop + dt * 4);
    if (e.hitT) e.hitT -= dt;
    if (e.kind === 'gold' && Math.random() < 0.22 && parts.length < MAXP - 4)
      parts.push(mkPart(e.x + rnd(-8, 8), e.wy + rnd(-6, 6), '#ffd75d'));
    if (e.roar) e.roar -= dt * 1.4;
    if (e.wy < G.camY - 320) { e.label.remove(); enemies.splice(i, 1); continue; }
    const near = e.wy - G.camY < sr + e.r && e.wy - G.camY > -(sr + e.r + 90);
    e.attacking = near && Math.abs(e.x - G.armyX) < sr + e.r;
    if (e.attacking && doDrain) {
      tickDmg += e.drain;
      if (Math.random() < 0.45) parts.push(mkPart(e.x, G.camY + 10, '#5db2ff'));
      if (Math.random() < 0.35) sfx.hurt();
      if (Math.random() < 0.5) dmgFlash();
      vib(20);
      hurt(e, G.soldiers * 0.7 + 6);
      if (Math.random() < 0.55) flingSoldier();
    }
  }
  /* environmental hazards chip away at the squad while it overlaps them */
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    if (h.wy < G.camY - (h.len || 0) / 2 - 240) { scene.remove(h.grp); hazards.splice(i, 1); continue; }
    if (h.wy - G.camY > 1500 || h.wy < G.camY - 200) continue;
    if (h.kind === 'lava' && Math.random() < 0.3 && parts.length < MAXP - 6)
      parts.push({ x: h.x + rnd(-h.w / 2, h.w / 2), wy: h.wy + rnd(-h.len / 2, h.len / 2), h: 0.1,
        vx: 0, vwy: rnd(-8, 8), vh: rnd(1.5, 3.5), t: 0, life: rnd(0.4, 0.8), color: '#ff7a3d' });
    if (h.kind === 'saw' && Math.random() < 0.3 && parts.length < MAXP - 6)
      parts.push({ x: sawX(h) + rnd(-10, 10), wy: h.wy + rnd(-8, 8), h: 0.15,
        vx: rnd(-40, 40), vwy: rnd(-20, 20), vh: rnd(1, 4), t: 0, life: rnd(0.2, 0.45), color: '#ffd75d' });
    if (!doDrain) continue;
    const touching = h.kind === 'lava'
      ? Math.abs(h.wy - G.camY) < h.len / 2 + sr * 0.5 && Math.abs(h.x - G.armyX) < h.w / 2 + sr * 0.55
      : Math.hypot(sawX(h) - G.armyX, h.wy - G.camY) < h.r + sr * 0.75;
    if (touching) {
      tickDmg += h.drain;
      G.shake = Math.max(G.shake, 3);
      dmgFlash(); vib(25);
      if (Math.random() < 0.5) sfx.hurt();
      if (Math.random() < 0.6) flingSoldier();
      for (let k = 0; k < 5 && parts.length < MAXP - 6; k++)
        parts.push(mkPart(G.armyX + rnd(-sr * 0.6, sr * 0.6), G.camY + rnd(-6, 18), h.kind === 'lava' ? '#ff7a3d' : '#ff5d6a'));
    }
  }
  if (doDrain && tickDmg > 0)
    addSoldiers(G.soldiers - Math.min(tickDmg, drainCap));
  if (doDrain) drainAcc = 0;

  /* gates */
  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i];
    if (!g.passed && G.camY >= g.wy) { g.passed = true; applyGate(g); }
    if (g.wy < G.camY - 200) { removeGate(g); gates.splice(i, 1); }
  }

  /* walls */
  for (let i = walls.length - 1; i >= 0; i--) {
    const w = walls[i];
    if (w.dead) {
      w.deadT += dt;
      if (w.deadT > 0.75) { scene.remove(w.mesh); walls.splice(i, 1); }
      continue;
    }
    if (w.wy - G.camY < sr + 30) {
      if (doDrain) { addSoldiers(G.soldiers - Math.max(1, Math.ceil(G.soldiers * 0.1))); G.shake = 5; flingSoldier(); }
      w.hp -= G.soldiers * 6 * dt;
      if (w.hp <= 0) killWall(w);
    }
    if (w.wy < G.camY - 200) { scene.remove(w.mesh); w.label.remove(); walls.splice(i, 1); }
  }

  /* pickups */
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (Math.abs(p.wy - G.camY) < sr + 10 && Math.abs(p.x - G.armyX) < sr + 12) {
      takePickup(p.kind, p.x); scene.remove(p.mesh); pickups.splice(i, 1); continue;
    }
    if (p.wy < G.camY - 160) { scene.remove(p.mesh); pickups.splice(i, 1); }
  }
  for (let i = rewards.length - 1; i >= 0; i--) {
    const r = rewards[i];
    r.t += dt * 2.2;
    const k = Math.min(1, r.t);
    r.x += (G.armyX - r.x) * k * 0.25;
    r.wy += (G.camY + 10 - r.wy) * k * 0.25;
    r.mesh.position.set(wx(r.x), 1.4, wz(r.wy));
    if (k >= 1 || Math.hypot(G.armyX - r.x, G.camY + 10 - r.wy) < 24) {
      takePickup(r.kind, G.armyX); scene.remove(r.mesh); rewards.splice(i, 1);
    }
  }

  /* barrels pop-in / cleanup */
  for (let i = barrels.length - 1; i >= 0; i--) {
    const b = barrels[i];
    b.pop = Math.min(1, b.pop + dt * 4);
    if (b._dead || b.wy < G.camY - 200) { if (b.grp) scene.remove(b.grp); b.label.remove(); barrels.splice(i, 1); }
  }
  for (const g of gates) g.pop = Math.min(1, g.pop + dt * 4);
  for (const w of walls) w.pop = Math.min(1, w.pop + dt * 4);
  for (const p of pickups) p.pop = Math.min(1, p.pop + dt * 4);
  for (const h of hazards) h.pop = Math.min(1, h.pop + dt * 4);

  /* particles & floats */
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.t += dt;
    p.x += p.vx * dt; p.wy += p.vwy * dt; p.h += p.vh * dt; p.vh -= 9 * dt;
    if (p.h < 0) { p.h = 0; p.vh *= -0.4; }
    if (p.t > p.life) parts.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; f.h += f.vh * dt;
    if (f.t > f.life) { f.el.remove(); floats.splice(i, 1); }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i]._dead) { enemies[i].label.remove(); enemies.splice(i, 1); }
  }
}

/* ---------------- draw ---------------- */
const dummy = new THREE.Object3D();
const tmpCol = new THREE.Color();
let soldierOffsets = [];
let soldierBirth = [];

function draw(now) {
  const t = now * 0.001;
  const zi = Math.max(0, zoneIdx);
  const z = ZONES[zi];

  /* zone color lerp */
  const lp = Math.min(1, 0.04);
  curZone.bg.lerp(col3(z.bg), lp);
  curZone.ground.lerp(col3(z.ground), lp);
  curZone.road.lerp(col3(z.road), lp);
  curZone.post.lerp(col3(z.post), lp);
  curZone.dash.lerp(col3(z.dash), lp);
  scene.background = curZone.bg;
  scene.fog.color.copy(curZone.bg);
  groundMat.color.copy(curZone.ground);
  roadMat.color.copy(curZone.road);
  postMat.color.copy(curZone.post);
  dashMat.color.copy(curZone.dash);
  hemi.color.setHex(z.sky);
  domeMat.color.copy(tmpCol.set(z.sky).lerp(col3('#ffffff'), 0.3));
  horizonGlow.material.color.set(z.sky);
  stripMat.color.copy(curZone.post);
  moon.material.color.copy(tmpCol.set(z.sky).lerp(col3('#ffffff'), 0.6));
  moteMat.color.copy(tmpCol.set(z.sky));

  /* scorch decals */
  let sci = 0;
  for (let i = scorches.length - 1; i >= 0; i--) {
    const sc = scorches[i];
    sc.t += 0.016;
    if (sc.t > 5) { scorches.splice(i, 1); continue; }
    const sz = wz(sc.wy);
    if (sz > 14) continue;
    const f = 1 - sc.t / 5;
    dummy.position.set(wx(sc.x), 0.012, sz);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.setScalar(sc.s * (0.7 + f * 0.5));
    dummy.updateMatrix();
    scorchMesh.setMatrixAt(sci++, dummy.matrix);
  }
  scorchMesh.count = sci; scorchMesh.instanceMatrix.needsUpdate = true;
  scorchMesh.material.opacity = 0.42;

  /* camera chase + shake + fov kick + bank */
  const axw = wx(G.armyX);
  const shx = (Math.random() - 0.5) * G.shake * 0.02;
  const shy = (Math.random() - 0.5) * G.shake * 0.02;
  const camZoom = Math.max(0, squadRadius() * K - 1.2) * 0.55;
  camera.position.set(axw * 0.55 + shx, 10.5 + shy + camZoom * 0.6, 12.5 + camZoom);
  camera.lookAt(axw * 0.35, 1.0, -12);
  camera.rotateZ(bank);
  const fovT = 62 + fovKick + (G.speed - 150) * 0.025;
  if (Math.abs(camera.fov - fovT) > 0.01) { camera.fov += (fovT - camera.fov) * 0.12; camera.updateProjectionMatrix(); }
  starMat.opacity += (ZONE_STARS[zi] - starMat.opacity) * 0.05;
  warm.intensity = 26 + muzzleGlow * 46; muzzleGlow *= 0.8;
  const danger = G.mode === 'run' && G.soldiers > 0 && G.soldiers < 12;
  if (vigEl) {
    if (danger) vigEl.style.opacity = (0.3 + Math.sin(t * 7) * 0.15).toFixed(2);
    else if (lastDanger) vigEl.style.opacity = '0';
  }
  lastDanger = danger;

  /* scroll the road markings */
  const scroll = G.camY * K;
  let pi = 0;
  for (let i = 0; i < NPOST; i++) {
    const zPos = -((i * POST_GAP + scroll) % (NPOST * POST_GAP)) + 8;
    for (const sx of [-1, 1]) {
      dummy.position.set(sx * (ROADW / 2 + 1.0), 0.55, zPos);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postMesh.setMatrixAt(pi++, dummy.matrix);
    }
  }
  postMesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < NDASH; i++) {
    const zPos = -((i * DASH_GAP + scroll) % (NDASH * DASH_GAP)) + 6;
    dummy.position.set(0, 0.04, zPos);
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(i, dummy.matrix);
  }
  dashMesh.instanceMatrix.needsUpdate = true;

  /* gate shockwave */
  if (ringT < 0.55) {
    ringT += 0.016;
    const rk = ringT / 0.55;
    ring.position.x = axw;
    ring.scale.setScalar(1.2 + rk * 9);
    ringMat.opacity = Math.max(0, 0.75 * (1 - rk));
  } else ringMat.opacity = 0;

  /* chevrons */
  for (let i = 0; i < NCHEV; i++) {
    const zPos = -((i * CHEV_GAP + scroll * 1.15) % (NCHEV * CHEV_GAP)) + 5;
    dummy.position.set(0, 0.03, zPos);
    dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    chevMesh.setMatrixAt(i, dummy.matrix);
  }
  chevMesh.instanceMatrix.needsUpdate = true;
  chevMesh.material.color.copy(curZone.dash);

  /* roadside props */
  let ri2 = 0, si = 0;
  for (const p of propSeed) {
    const span = PROP_RANGE;
    const zPos = -(((p.x > 0 ? 1 : -1) * 7 + p.ry * 31 + scroll) % span) - 20;
    dummy.position.set(p.x, p.kind === 0 ? p.s * 0.5 : p.s * 1.8, zPos);
    dummy.rotation.set(0, p.ry, p.kind === 0 ? p.ry * 0.3 : 0);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    if (p.kind === 0 && ri2 < NROCK) rockMesh.setMatrixAt(ri2++, dummy.matrix);
    if (p.kind === 1 && si < NSPIRE) spireMesh.setMatrixAt(si++, dummy.matrix);
  }
  rockMesh.count = ri2; rockMesh.instanceMatrix.needsUpdate = true;
  spireMesh.count = si; spireMesh.instanceMatrix.needsUpdate = true;

  /* shadows (filled across sections below) */
  let shI = 0;

  /* squad */
  const shown = Math.min(G.soldiers, MAXS);
  if (soldierOffsets.length !== shown) {
    const oldN = soldierOffsets.length;
    soldierOffsets = formation(shown);
    soldierBirth.length = shown;
    for (let i = oldN; i < shown; i++) soldierBirth[i] = t;
    for (let i = 0; i < shown; i++)
      soldierBody.setColorAt(i, tmpCol.setHSL(0.585 + rnd(-0.02, 0.02), 0.78, 0.55 + rnd(-0.06, 0.08)));
    if (soldierBody.instanceColor) soldierBody.instanceColor.needsUpdate = true;
  }
  const bobT = G.mode === 'run' ? t : t * 0.4;
  for (let i = 0; i < shown; i++) {
    const o = soldierOffsets[i];
    const bob = Math.abs(Math.sin(bobT * 9 + i * 1.7)) * 0.16;
    const bx = axw + o.x * K, bz = 0.6 + o.y * K;
    const born = Math.min(1, (t - (soldierBirth[i] || 0)) * 5 + 0.25);
    dummy.position.set(bx, bob + (1 - born) * 0.35, bz);
    dummy.rotation.set(Math.sin(bobT * 9 + i * 1.7) * 0.1, 0, 0);
    const lead = i === 0 && shown > 14;
    dummy.scale.setScalar((lead ? 1.65 : 1.3) * born);
    dummy.updateMatrix();
    soldierBody.setMatrixAt(i, dummy.matrix);
    if (lead) soldierBody.setColorAt(0, tmpCol.set('#ffd75d'));
    dummy.position.set(bx + 0.12, 0.55 + bob, bz - 0.5);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    muzzleMesh.setMatrixAt(i, dummy.matrix);
  }
  soldierBody.count = muzzleMesh.count = shown;
  soldierBody.instanceMatrix.needsUpdate = true;
  muzzleMesh.instanceMatrix.needsUpdate = true;
  if (soldierBody.instanceColor) soldierBody.instanceColor.needsUpdate = true;
  muzzleMesh.material.color.copy(tmpCol.set(WT[G.tier].col));

  /* squad blob shadow */
  {
    const srW = Math.max(1.2, squadRadius() * K);
    dummy.position.set(axw, 0.02, 0.7);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.set(srW * 1.55, srW * 1.1, 1);
    dummy.updateMatrix();
    if (shI < MAXSH) shadowMesh.setMatrixAt(shI++, dummy.matrix);
  }

  /* enemies: per-kind instanced meshes + eyes + shadows */
  const kCount = { runner: 0, normal: 0, brute: 0, split: 0, gold: 0, boss: 0 };
  let ei = 0;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const zP = wz(e.wy);
    if (zP > 14) { e.label.style.display = 'none'; continue; }
    const d = EDEF[e.kind] || EDEF.normal;
    let s = e.r * K * (e.boss ? 1.55 : 1.8) * e.pop * (e.attacking ? 1 + Math.sin(t * 14) * 0.08 : 1);
    if (s < 0.01) s = 0.01;
    if (e.roar) s *= 1 + e.roar * 0.28 * Math.sin(t * 26);
    e._s = s;
    const hop = (e.kind === 'runner' ? Math.abs(Math.sin(t * 11 + e.x)) * 0.3 : Math.abs(Math.sin(t * 6 + e.x)) * 0.1) * s;
    const km = kindMesh[e.kind] || kindMesh.normal;
    if (kCount[e.kind] < d.cap) {
      const ki = kCount[e.kind]++;
      dummy.position.set(wx(e.x), hop, zP);
      dummy.rotation.set(e.attacking ? 0.35 : 0, Math.sin(t * 2.2 + e.x) * 0.14, 0);
      const sq = (e.hitT || 0) * 1.6;
      dummy.scale.set(s * (1 + sq * 0.55), Math.max(0.05, s * (1 - sq * 0.4)), s * (1 + sq * 0.55));
      dummy.updateMatrix();
      km.setMatrixAt(ki, dummy.matrix);
      km.setColorAt(ki, tmpCol.set(e.hitT > 0 ? '#ffffff' : e.col));
      if (ei < MAXE) {
        dummy.position.set(wx(e.x), s * d.eyeY + hop, zP + s * d.eyeZ);
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(s * d.eyeS);
        dummy.updateMatrix();
        eyeMesh.setMatrixAt(ei, dummy.matrix);
        eyeMesh.setColorAt(ei, tmpCol.set(e.boss ? '#ff9d5d' : '#ffffff'));
        ei++;
      }
      if (shI < MAXSH) {
        dummy.position.set(wx(e.x), 0.015, zP);
        dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(s * 1.6, s * 1.25, 1);
        dummy.updateMatrix();
        shadowMesh.setMatrixAt(shI++, dummy.matrix);
      }
    }
    setLabel(e.label, wx(e.x), s * d.labelY + 0.4, zP, String(Math.ceil(e.hp)));
    if (e.attacking) e.label.style.color = '#ffb0a0';
    else e.label.style.color = '';
  }
  for (const k in kindMesh) {
    kindMesh[k].count = kCount[k];
    kindMesh[k].instanceMatrix.needsUpdate = true;
    if (kindMesh[k].instanceColor) kindMesh[k].instanceColor.needsUpdate = true;
  }
  /* enemy corpses: fling back + shrink */
  for (let i = deadEnemies.length - 1; i >= 0; i--) {
    const dE = deadEnemies[i];
    dE.t += 0.016;
    if (dE.t > 0.5) { deadEnemies.splice(i, 1); continue; }
    const kd = EDEF[dE.kind] || EDEF.normal;
    const km2 = kindMesh[dE.kind] || kindMesh.normal;
    if (kCount[dE.kind] >= kd.cap) continue;
    const ki = kCount[dE.kind]++;
    dE.x += dE.vx * 0.016; dE.wy += dE.vwy * 0.016;
    dE.y += dE.vy * 0.016; dE.vy -= 11 * 0.016;
    dummy.position.set(wx(dE.x), Math.max(0.05, dE.y), wz(dE.wy));
    dummy.rotation.set(dE.spin * dE.t * 2.4, 0, dE.spin * dE.t);
    dummy.scale.setScalar(Math.max(0.01, dE.s * (1 - dE.t * 1.4)));
    dummy.updateMatrix();
    km2.setMatrixAt(ki, dummy.matrix);
    km2.setColorAt(ki, tmpCol.set('#232a36').lerp(col3('#ffffff'), 0.1));
  }

  /* soldier corpses */
  let di2 = 0;
  for (let i = deadSoldiers.length - 1; i >= 0; i--) {
    const p = deadSoldiers[i];
    p.t += 0.016;
    if (p.t > 0.8) { deadSoldiers.splice(i, 1); continue; }
    p.x += p.vx * 0.016; p.wy += p.vwy * 0.016;
    p.y += p.vy * 0.016; p.vy -= 9.5 * 0.016;
    if (p.y < 0.1) { p.y = 0.1; p.vy *= -0.3; }
    dummy.position.set(wx(p.x), p.y, wz(p.wy));
    dummy.rotation.set(p.spin * p.t, p.spin * p.t * 0.6, 0);
    dummy.scale.setScalar(1.05 * (1 - p.t / 0.85));
    dummy.updateMatrix();
    deadSoldierMesh.setMatrixAt(di2, dummy.matrix);
    deadSoldierMesh.setColorAt(di2, tmpCol.set('#46598a'));
    di2++;
  }
  deadSoldierMesh.count = di2;
  deadSoldierMesh.instanceMatrix.needsUpdate = true;
  if (deadSoldierMesh.instanceColor) deadSoldierMesh.instanceColor.needsUpdate = true;

  eyeMesh.count = ei; eyeMesh.instanceMatrix.needsUpdate = true;
  if (eyeMesh.instanceColor) eyeMesh.instanceColor.needsUpdate = true;

  /* gate glow pulse */
  const gp = 0.32 + Math.sin(t * 4) * 0.14;
  for (const g of gates) if (g.frames) for (const f of g.frames) if (!g.passed) f.material.opacity = gp;

  /* gates */
  for (const g of gates) {
    const zP = wz(g.wy);
    g.grp.position.z = zP;
    g.grp.position.y = -(1 - g.pop) * 5.4;
    g.grp.visible = zP < 14;
    if (g.punch) { g.punch = Math.max(0, g.punch - 0.06); g.grp.scale.setScalar(1 + g.punch * 0.1); }
    if (g.grp.visible) layoutGate(g);
  }

  /* walls */
  for (const w of walls) {
    const zP = wz(w.wy);
    if (w.dead) {
      const k = Math.min(1, w.deadT / 0.75);
      w.mesh.visible = zP < 14;
      w.mesh.scale.set(ROADW, Math.max(0.05, 1 - k * 0.9), 1 + k * 0.5);
      w.mesh.rotation.x = k * 0.4;
      w.mesh.position.set(0, Math.max(0.14, 2.3 * (1 - k * 0.9)), zP);
      continue;
    }
    w.mesh.visible = zP < 14;
    w.mesh.scale.set(ROADW, 1, 1);
    w.mesh.rotation.x = 0;
    w.mesh.position.set(0, 2.3 - (1 - w.pop) * 4.6, zP);
    setLabel(w.label, 0, 5.2, zP, String(Math.ceil(w.hp)));
    if (zP < 14 && shI < MAXSH) {
      dummy.position.set(0, 0.015, zP + 0.6);
      dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(11, 4.4, 1);
      dummy.updateMatrix();
      shadowMesh.setMatrixAt(shI++, dummy.matrix);
    }
  }

  /* hazards */
  for (const h of hazards) {
    const zP = wz(h.wy);
    h.grp.position.z = zP;
    h.grp.position.y = -(1 - h.pop) * 2.5;
    h.grp.visible = zP < 14;
    if (h.kind === 'saw') {
      h.blade.position.x = wx(sawX(h));
      h.blade.rotation.y = t * 11 + h.phase;
    } else if (h.inner) {
      h.inner.material.opacity = 0.4 + Math.sin(t * 5 + h.wy) * 0.18;
    }
  }

  /* barrels */
  for (const b of barrels) {
    if (b._dead) continue;
    const zP = wz(b.wy);
    b.grp.visible = zP < 14;
    b.grp.position.set(wx(b.x), -(1 - b.pop) * 1.3, zP);
    b.grp.rotation.y = t * 0.8;
    if (b.hitT) {
      b.hitT = Math.max(0, b.hitT - 0.016);
      b.grp.rotation.z = Math.sin(b.hitT * 36) * b.hitT * 0.8;
    } else b.grp.rotation.z = 0;
    setLabel(b.label, wx(b.x), 2.6, zP, String(Math.ceil(b.hp)));
    if (zP < 14 && shI < MAXSH) {
      dummy.position.set(wx(b.x), 0.015, zP);
      dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1.5, 1.5, 1);
      dummy.updateMatrix();
      shadowMesh.setMatrixAt(shI++, dummy.matrix);
    }
  }
  shadowMesh.count = shI; shadowMesh.instanceMatrix.needsUpdate = true;

  /* pickups bob */
  for (const p of pickups) {
    const zP = wz(p.wy);
    p.mesh.visible = zP < 14;
    p.mesh.scale.setScalar(Math.max(0.01, p.pop) * (1 + Math.sin(t * 6 + p.wy) * 0.1));
    p.mesh.position.set(wx(p.x), 0.7 + Math.sin(t * 3 + p.wy) * 0.25, zP);
  }

  /* bullets */
  let bi = 0;
  for (const b of bullets) {
    const zP = wz(b.wy);
    if (zP > 14) continue;
    dummy.position.set(wx(b.x), 0.8, zP);
    dummy.rotation.set(0, Math.atan2(b.vx, -b.vwy), 0);
    dummy.scale.set(b.wid || 1, b.wid || 1, b.len || 1);
    dummy.updateMatrix();
    if (bi < MAXB) {
      bulletMesh.setMatrixAt(bi, dummy.matrix);
      bulletMesh.setColorAt(bi, tmpCol.set(b.col));
      bi += 1;
    }
  }
  bulletMesh.count = bi;
  bulletMesh.instanceMatrix.needsUpdate = true;
  if (bulletMesh.instanceColor) bulletMesh.instanceColor.needsUpdate = true;

  /* particles */
  let pc = 0;
  for (const p of parts) {
    if (pc >= MAXP) break;
    partPos[pc * 3] = wx(p.x);
    partPos[pc * 3 + 1] = p.h;
    partPos[pc * 3 + 2] = wz(p.wy);
    tmpCol.set(p.color);
    partCol[pc * 3] = tmpCol.r; partCol[pc * 3 + 1] = tmpCol.g; partCol[pc * 3 + 2] = tmpCol.b;
    pc += 1;
  }
  partGeo.setDrawRange(0, pc);
  partGeo.attributes.position.needsUpdate = true;
  partGeo.attributes.color.needsUpdate = true;

  /* floats */
  for (const f of floats) {
    const [sx, sy, zz] = project(wx(f.x), f.h, wz(f.wy));
    const a = Math.max(0, 1 - f.t / f.life);
    if (zz > 1) { f.el.style.display = 'none'; continue; }
    f.el.style.display = 'block';
    f.el.style.left = '50%'; f.el.style.top = '50%';
    f.el.style.opacity = String(a);
    f.el.style.transform = `translate(${sx - W / 2}px,${sy - H / 2}px) translate(-50%,-50%)`;
  }

  /* HUD */
  hudArmy.textContent = String(G.soldiers);
  hudWeapon.textContent = WT[G.tier].name;
  hudWeapon.style.color = WT[G.tier].col;
  hudDist.textContent = Math.floor(G.dist) + 'm';
  hudLevel.textContent = 'LV ' + G.level;
  if (lvlFill) lvlFill.style.width = ((G.dist % 120) / 120 * 100).toFixed(1) + '%';
  hintEl.style.opacity = hintT > 0 ? '0.9' : '0';

  renderer.render(scene, camera);
}

resize();
