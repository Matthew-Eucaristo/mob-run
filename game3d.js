/* MOB RUN 3D — the game from those ads, in Three.js.
   Chase-camera crowd runner: steer, stretch the squad, pick gates, shoot mobs. */
import * as THREE from './vendor/three.module.min.js';
import { icon, drawIcon } from './icons.js';
const COIN = '<span class="coin"></span>';
const INK = '#1b1430';
/* canvas text waits for the display font so gate numbers never flash in a fallback face */
if (document.fonts) document.fonts.load('64px "Lilita One"').catch(() => {});

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
const hudSkills = document.getElementById('hudSkills');
const formLabel = document.getElementById('formLabel');
const formFill = document.getElementById('formFill');
const skillOv = document.getElementById('skillOverlay');
const skillCards = document.getElementById('skillCards');
const hudCoins = document.getElementById('hudCoins');
const shopOv = document.getElementById('shopOverlay');
const shopGrid = document.getElementById('shopGrid');
const shopCoins = document.getElementById('shopCoins');
const installCard = document.getElementById('installCard');
const installHint = document.getElementById('installHint');
const installBtn = document.getElementById('installBtn');
const installNo = document.getElementById('installNo');
const btnCol = document.getElementById('btnCol');
const btnWide = document.getElementById('btnWide');
const overCause = document.getElementById('overCause');
const overMissions = document.getElementById('overMissions');
const menuMissions = document.getElementById('menuMissions');
const dailyBtn = document.getElementById('dailyBtn');
const againBtn = document.getElementById('againBtn');
const muteBtn = document.getElementById('muteBtn');
const playBtn = document.getElementById('playBtn');
if (muteBtn) muteBtn.innerHTML = icon('sound');
const upGrid = document.getElementById('upGrid');
const toastEl = document.getElementById('toast');
const comboEl = document.getElementById('combo');
const bossBar = document.getElementById('bossBar');
const bossName = document.getElementById('bossName');
const bossFill = document.getElementById('bossFill');
const pauseOv = document.getElementById('pauseOverlay');
const pauseBtn = document.getElementById('pauseBtn');
if (pauseBtn) pauseBtn.innerHTML = icon('pause');
if (pauseBtn) pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); setPause(true); });
if (pauseOv) pauseOv.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); audio(); setPause(false); });

/* Phones drop MSAA and cap the pixel ratio. Truly weak devices also
   cut instance counts. Missing deviceMemory (iPhone) counts as fine. */
function detectQuality() {
  let q = '';
  try { q = new URLSearchParams(location.search).get('q') || ''; } catch (e) { }
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const save = !!(navigator.connection && navigator.connection.saveData);
  const low = q === 'low' || mem <= 3 || (coarse && cores <= 4) || save;
  const phone = low || coarse || q === 'phone';
  return { low, phone, aa: !phone, dpr: low ? 1 : phone ? 1.25 : 1.75 };
}
const Q = detectQuality();
const partCap = Q.low ? 120 : Q.phone ? 260 : 700;
const visCap = Q.low ? 48 : Q.phone ? 90 : 220;
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
});

/* ---------------- sizes / coords ---------------- */
let W = 0, H = 0, DPR = 1;
/* Gameplay runs in a fixed logical space the size of a phone, whatever the
   window is. Before, px -> world scale followed the window width, so a wide
   desktop packed gates and mobs 3x tighter in the 3D world than a phone did. */
const LW = 400, LH = 820;
const road = { x0: 0, x1: 0 };
const ROADW = 13;                 // world units across the road at the start
let K = ROADW / (LW * 0.84);                    // px -> world units (locked to the FULL road, never the narrowed one)
let roadHalf = ROADW / 2;         // current asphalt half-width in world units
const wx = (x) => (x - LW / 2) * K;
const wz = (wy) => (G.camY - wy) * K;   // ahead = negative z

/* ---------------- three setup ---------------- */
const renderer = new THREE.WebGLRenderer({
  canvas: cv, antialias: Q.aa, alpha: false,
  powerPreference: Q.low ? 'low-power' : 'default',
});
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 220);
scene.fog = new THREE.Fog(0x0e1526, 30, 110);

const hemi = new THREE.HemisphereLight(0x9db8ff, 0x1a2440, 1.15);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.3);
dir.position.set(-6, 14, 6);
scene.add(dir);
const rim = new THREE.DirectionalLight(0xe7c99a, 0.38);
rim.position.set(5, 8, -10);
scene.add(rim);
const warm = new THREE.PointLight(0xffd8a8, 26, 55, 1.6);
warm.position.set(0, 7, 6);
scene.add(warm);
warm.visible = !Q.low && !Q.phone;

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, Q.dpr);
  document.body.classList.toggle('touch',
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches || W < 760);
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  syncRoad();
  if (G.mode !== 'run') { G.armyX = LW / 2; aimX = LW / 2; }
  const keysEl = document.querySelector('#startOverlay .keys');
  if (keysEl) keysEl.textContent = document.body.classList.contains('touch')
    ? 'one thumb · swipe sideways to steer · up for a column, down to spread'
    : 'arrows or WASD · up / down stretches the squad · M mute';
}
window.addEventListener('resize', resize);

/* ---------------- audio ----------------
   Everything goes through one bus: a compressor glues the mix and keeps a
   busy fight from clipping, and a short synthetic room adds a tail to the
   big moments. Noise comes from one shared buffer. */
let AC = null, muted = false, BUS = null, VERB = null, NOISE = null, MASTER = null;
function audio() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -22; comp.knee.value = 10; comp.ratio.value = 4;
      comp.attack.value = 0.004; comp.release.value = 0.2;
      /* makeup gain into a brickwall-ish limiter: loud like a phone game, never clipping */
      const master = AC.createGain(); master.gain.value = 2.6;
      const lim = AC.createDynamicsCompressor();
      lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
      comp.connect(master); master.connect(lim); lim.connect(AC.destination);
      MASTER = lim;
      BUS = comp;
      /* room: exponentially decaying stereo noise impulse */
      const len = Math.floor(AC.sampleRate * 1.1);
      const ir = AC.createBuffer(2, len, AC.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 3.2);
      }
      const conv = AC.createConvolver(); conv.buffer = ir;
      const wet = AC.createGain(); wet.gain.value = 0.32;
      conv.connect(wet); wet.connect(BUS);
      VERB = conv;
      NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const nd = NOISE.getChannelData(0);
      for (let k = 0; k < nd.length; k++) nd[k] = Math.random() * 2 - 1;
    } catch (e) { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
}
/* oscillator voice: pitch glide, attack, exponential decay, optional reverb send */
function voice(f, d, type, v, slide, opt) {
  if (!AC || muted || !BUS) return;
  const t = AC.currentTime + ((opt && opt.at) || 0);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d);
  if (opt && opt.detune) o.detune.value = opt.detune;
  const a = (opt && opt.attack) || 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  o.connect(g); g.connect(BUS);
  if (opt && opt.verb && VERB) g.connect(VERB);
  o.start(t); o.stop(t + a + d + 0.03);
}
function tone(f, d, type, v, slide) { voice(f, d, type, v, slide); }
/* filtered noise with a cutoff sweep: hits, whooshes, crunches */
function hiss(d, v, kind, f0, f1, q, opt) {
  if (!AC || muted || !BUS) return;
  const t = AC.currentTime + ((opt && opt.at) || 0);
  const src = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = NOISE;
  fl.type = kind || 'lowpass'; fl.Q.value = q || 0.8;
  fl.frequency.setValueAtTime(f0 || 900, t);
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(fl); fl.connect(g); g.connect(BUS);
  if (opt && opt.verb && VERB) g.connect(VERB);
  src.start(t, Math.random() * 0.8); src.stop(t + d + 0.02);
}
function noise(d, v) { hiss(d, v, 'lowpass', 900); }
const sfx = {
  /* a muffled crack, darker for heavier guns */
  shoot: () => {
    const heavy = G.tier / 5;
    hiss(0.045, 0.05, 'bandpass', 2600 - heavy * 1300, 900, 1.2);
    voice(170 - heavy * 50, 0.05, 'sine', 0.05, 60);
  },
  good: () => {
    hiss(0.22, 0.06, 'bandpass', 500, 3800, 0.9);
    voice(659, 0.12, 'triangle', 0.09); voice(988, 0.16, 'triangle', 0.08, 0, { at: 0.06 });
  },
  great: () => {
    hiss(0.26, 0.07, 'bandpass', 400, 4200, 0.9);
    [523, 659, 784, 1047].forEach((f, k) => voice(f, 0.16, 'triangle', 0.09, 0, { at: k * 0.05, verb: k === 3 }));
  },
  bad: () => { voice(220, 0.28, 'sawtooth', 0.08, 70); hiss(0.2, 0.08, 'lowpass', 700, 120); },
  /* a little "pop": falling sine plus a click */
  kill: () => { voice(520 + Math.random() * 160, 0.07, 'sine', 0.06, 140); hiss(0.025, 0.04, 'highpass', 3000); },
  hurt: () => { voice(130, 0.12, 'sine', 0.1, 55); hiss(0.08, 0.06, 'lowpass', 600); },
  boss: () => { voice(80, 0.6, 'sawtooth', 0.1, 38, { verb: true }); hiss(0.5, 0.12, 'lowpass', 1400, 90, 0.7, { verb: true }); },
  power: () => { voice(587, 0.09, 'square', 0.05); voice(1175, 0.15, 'square', 0.05, 0, { at: 0.07, verb: true }); },
  boom: () => { hiss(0.7, 0.24, 'lowpass', 2400, 60, 0.7, { verb: true }); voice(65, 0.45, 'sine', 0.2, 30); },
  barrel: () => { hiss(0.16, 0.12, 'bandpass', 1800, 400, 1.4); voice(260, 0.12, 'triangle', 0.08, 90); },
  coin: () => { voice(1568, 0.08, 'sine', 0.05); voice(1568 * 2.76, 0.05, 'sine', 0.015); },
  /* big moments: a rising major arpeggio over a thump, into the room */
  fanfare: () => {
    voice(70, 0.32, 'sine', 0.16, 40);
    hiss(0.3, 0.06, 'bandpass', 600, 5000, 0.8);
    [523, 659, 784, 1047, 1319].forEach((f, k) => {
      voice(f, 0.2, 'square', 0.035, 0, { at: k * 0.07, verb: true });
      voice(f / 2, 0.2, 'triangle', 0.05, 0, { at: k * 0.07 });
    });
  },
};
/* coins climb a pentatonic ladder while you keep scooping them */
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
let ladder = 0, ladderT = 0;
function coinLadder() {
  ladder = ladderT > 0 ? Math.min(ladder + 1, LADDER.length - 1) : 0;
  ladderT = 0.6;
  if (coinSfx > 0) return;
  coinSfx = 0.03;
  const f = 1046 * Math.pow(2, LADDER[ladder] / 12);
  /* bell: a fundamental plus the inharmonic partial a struck coin has */
  voice(f, 0.09, 'sine', 0.05);
  voice(f * 2.76, 0.05, 'sine', 0.014);
  voice(f * 2, 0.03, 'square', 0.008);
}

/* ---------------- zones ---------------- */
const ZONES = [
  { bg: '#0e1526', ground: '#0a1020', road: '#1a2440', post: '#2c3f63', dash: '#3a4f7a', sky: 0x9db8ff },
  { bg: '#0f1f10', ground: '#0a160a', road: '#1d3319', post: '#35572b', dash: '#4a7240', sky: 0xa8ffb0 },
  { bg: '#241209', ground: '#160b04', road: '#3d2214', post: '#5f3a28', dash: '#7a5238', sky: 0xffc89d },
  { bg: '#161410', ground: '#100e0c', road: '#2c281f', post: '#4a4336', dash: '#6b5e45', sky: 0xf0d2a4 },
  { bg: '#0a1c22', ground: '#051014', road: '#143240', post: '#235063', dash: '#38647a', sky: 0x9de8ff },
];
const ZONE_NAMES = ['NIGHTFALL', 'TOXIC FLATS', 'EMBER RIDGE', 'SALT FLATS', 'DEEP RUN'];
const colCache = {};
const col3 = (hex) => colCache[hex] || (colCache[hex] = new THREE.Color(hex));
const curZone = { bg: new THREE.Color(ZONES[0].bg), ground: new THREE.Color(ZONES[0].ground), road: new THREE.Color(ZONES[0].road), post: new THREE.Color(ZONES[0].post), dash: new THREE.Color(ZONES[0].dash) };

/* ---------------- weapon tiers ---------------- */
const WT = [
  { name: 'PISTOL', dmg: 1, rate: 0.24, spread: 1, col: '#ffe97d', tl: 1.0 },
  { name: 'SMG', dmg: 1, rate: 0.15, spread: 1, col: '#7de8ff', tl: 1.25 },
  { name: 'RIFLE', dmg: 2, rate: 0.13, spread: 2, col: '#a8ffb0', tl: 1.7 },
  { name: 'SHOTGUN', dmg: 3, rate: 0.19, spread: 3, col: '#ff9d5d', tl: 0.8, tw: 1.5 },
  { name: 'MINIGUN', dmg: 2, rate: 0.065, spread: 3, col: '#f0c14a', tl: 3.0 },
  { name: 'ANNIHILATOR', dmg: 5, rate: 0.11, spread: 3, col: '#ff4040', tl: 3.6, tw: 1.9 },
];

/* ---------------- state ---------------- */
const G = {
  mode: 'menu',
  camY: 0, speed: 148,
  armyX: 0, soldiers: 10,
  kills: 0, dist: 0, level: 1,   peak: 10, best: 0,
  coins: 0, coinsRun: 0, skin: 'recruit', owned: { recruit: true },
  tier: 0, upDmg: 0, upRate: 0, upSpread: 0,
  streak: 0, killChain: 0, killChainT: 0, mileIdx: 0,
  shake: 0, slow: 0,
  form: 0, shield: 0, overT: 0, skillPicks: 0,
  skills: {},
  coinsPicked: 0, coinsPickedVal: 0, bonusTotal: 0, gunUps: 0, missionCoins: 0, coinFrac: 0, bonusPaid: 0,
  time: 0, cause: '', mobsBeaten: 0, bossKills: 0, wallsBroken: 0, gateStreakBest: 0,
};
const SKILLS = [
  { id: 'pierce', name: 'PIERCE', icon: 'arrow', col: '#4aa3ff', desc: 'Bullets punch through one more monster.', max: 3 },
  { id: 'split', name: 'FAN FIRE', icon: 'fan', col: '#4aa3ff', desc: 'One more pellet in every shot.', max: 3 },
  { id: 'rate', name: 'TRIGGER', icon: 'bolt', col: '#ff9f1c', desc: 'Everybody shoots faster.', max: 4 },
  { id: 'dmg', name: 'HOLLOW POINT', icon: 'bullet', col: '#ff4d5e', desc: '+1 damage on every bullet.', max: 5 },
  { id: 'rally', name: 'RALLY', icon: 'flag', col: '#5bd44a', desc: 'Level-ups bring more recruits.', max: 3 },
  { id: 'shield', name: 'WARD', icon: 'shield', col: '#7a8cff', desc: 'Shrug off the next hit. Stacks.', max: 3 },
  { id: 'magnet', name: 'MAGNET', icon: 'magnet', col: '#ff4d5e', desc: 'Coins and loot fly to you.', max: 2 },
  { id: 'bulwark', name: 'BULWARK', icon: 'wall', col: '#8b6cff', desc: 'Lava, saws and walls bite less.', max: 3 },
  { id: 'chain', name: 'CHAIN', icon: 'chain', col: '#ff9f1c', desc: 'Kills zap the monsters next door.', max: 2 },
  { id: 'crit', name: 'CRIT', icon: 'star', col: '#ffb400', desc: 'Some shots hit double.', max: 3 },
  { id: 'steady', name: 'ANCHOR', icon: 'anchor', col: '#4aa3ff', desc: 'Fewer soldiers slip off the edge.', max: 2 },
  { id: 'overdrive', name: 'OVERDRIVE', icon: 'chevrons', col: '#ff9f1c', desc: 'Good gates spin up your guns for a bit.', max: 2 },
  { id: 'greed', name: 'GREED', icon: 'bag', col: '#ffb400', desc: '+1 on every coin you grab.', max: 3 },
  { id: 'fortune', name: 'FORTUNE', icon: 'sparkle', col: '#ffb400', desc: 'Bigger distance payout at the end.', max: 2 },
  { id: 'execution', name: 'EXECUTION', icon: 'skull', col: '#ff4d5e', desc: 'Bosses take way more damage.', max: 3 },
  { id: 'iron', name: 'IRON', icon: 'shield', col: '#8b6cff', desc: 'Lose fewer soldiers to everything.', max: 3 },
  { id: 'focus', name: 'FOCUS', icon: 'crosshair', col: '#ff4d5e', desc: 'Tighter, deadlier volleys.', max: 3 },
  { id: 'warcry', name: 'WARCRY', icon: 'megaphone', col: '#5bd44a', desc: 'Good gates bring extra recruits.', max: 3 },
  { id: 'scavenge', name: 'SCAVENGE', icon: 'bag', col: '#ffb400', desc: 'Monsters drop coins sometimes.', max: 3 },
  { id: 'laststand', name: 'LAST STAND', icon: 'heart', col: '#ff4d5e', desc: 'Under 18 soldiers? Hit harder.', max: 2 },
  { id: 'quickstep', name: 'QUICKSTEP', icon: 'chevrons', col: '#5bd44a', desc: 'Switch formation faster.', max: 2 },
  { id: 'hoard', name: 'HOARD', icon: 'magnet', col: '#ffb400', desc: 'Grab coins from farther out.', max: 2 },
];
const SKINS = [
  { id: 'recruit', name: 'RECRUIT', price: 0, body: '#6ea2ff', lead: '#ffd75d' },
  { id: 'vanguard', name: 'VANGUARD', price: 40, body: '#5ee0ff', lead: '#f4fbff' },
  { id: 'ember', name: 'EMBER', price: 80, body: '#ff6a2a', lead: '#ffd27a' },
  { id: 'toxic', name: 'TOXIC', price: 140, body: '#3dff7a', lead: '#e8ff8a' },
  { id: 'royal', name: 'OXBLOOD', price: 220, body: '#8c3a2f', lead: '#f2d48a' },
  { id: 'void', name: 'ASH', price: 360, body: '#4a453c', lead: '#f4efe4' },
];
/* ---------------- meta progression (persists between runs) ----------------
   Upgrades make the next run go further, missions give a reason to try a
   different route, and the daily gift brings people back. */
const UPGRADES = [
  { id: 'army', name: 'BIGGER SQUAD', icon: 'flag', col: '#5bd44a', max: 10, desc: 'Soldiers at the start', val: (l) => String(10 + l * 5), cost: (l) => Math.round(30 * Math.pow(1.5, l)) },
  { id: 'gun', name: 'STARTING GUN', icon: 'gun', col: '#ff4d5e', max: 3, desc: 'Weapon at the start', val: (l) => ['PISTOL', 'SMG', 'RIFLE', 'SHOTGUN'][l], cost: (l) => [150, 450, 1100][l] },
  { id: 'armor', name: 'BODY ARMOR', icon: 'shield', col: '#8b6cff', max: 6, desc: 'Fewer soldiers lost to every hit', val: (l) => l ? '-' + l * 5 + '%' : 'none', cost: (l) => Math.round(60 * Math.pow(1.6, l)) },
  { id: 'magnet', name: 'MAGNET', icon: 'magnet', col: '#ff7ab8', max: 4, desc: 'Coins fly to you from farther away', val: (l) => l ? 'x' + (1 + l * 0.5).toFixed(1) : 'off', cost: (l) => Math.round(80 * Math.pow(1.7, l)) },
  { id: 'lucky', name: 'LUCKY GATES', icon: 'sparkle', col: '#ffb400', max: 5, desc: 'Chance of a golden gate, good on both sides', val: (l) => l ? l * 6 + '%' : 'none', cost: (l) => Math.round(100 * Math.pow(1.65, l)) },
  { id: 'coin', name: 'COIN VALUE', icon: 'star', col: '#ff9f1c', max: 8, desc: 'Every coin is worth more', val: (l) => l ? '+' + l * 15 + '%' : 'normal', cost: (l) => Math.round(45 * Math.pow(1.55, l)) },
];
const MISSION_ICON = { dist: 'run', army: 'flag', mobs: 'skull', boss: 'crown', coins: 'star', walls: 'wall', gun: 'gun', streak: 'bolt' };
const MISSION_DEFS = {
  dist: { steps: [300, 500, 800, 1200, 1600, 2200, 3000, 4000], text: (n) => `Run ${n}m in one run` },
  army: { steps: [100, 250, 600, 1500, 4000, 10000, 20000], text: (n) => `Grow your army to ${n}` },
  mobs: { steps: [2, 4, 6, 9, 13, 18], text: (n) => `Beat ${n} enemy mobs in one run` },
  boss: { steps: [1, 2, 3, 5, 7, 10], text: (n) => `Defeat ${n} boss${n > 1 ? 'es' : ''} in one run` },
  coins: { steps: [40, 90, 160, 260, 400, 600], text: (n) => `Grab ${n} coins in one run` },
  walls: { steps: [2, 4, 7, 10, 15], text: (n) => `Break ${n} walls in one run` },
  gun: { steps: [1, 2, 3, 4, 5], text: (n) => `Upgrade your gun ${n} time${n > 1 ? 's' : ''} in one run` },
  streak: { steps: [4, 6, 8, 11, 15], text: (n) => `Take ${n} good gates in a row` },
};
const META = {
  up: { army: 0, gun: 0, armor: 0, coin: 0, magnet: 0, lucky: 0 },
  mlv: {}, missions: [], done: 0, seenMob: false,
  daily: { last: '', streak: 0 },
  runs: 0,
};
/* rank: every 3 missions done promotes you; each rank pays out and adds +5% coins */
const RANKS = ['RECRUIT', 'PRIVATE', 'CORPORAL', 'SERGEANT', 'LIEUTENANT', 'CAPTAIN', 'MAJOR', 'COLONEL', 'GENERAL', 'WARLORD'];
function rankOf(done) { return Math.min(RANKS.length - 1, Math.floor(done / 3)); }
function rankReward(r) { return 60 + r * 40; }
function missionGoal(m) { const d = MISSION_DEFS[m.type]; return d.steps[Math.min(d.steps.length - 1, META.mlv[m.type] || 0)]; }
function missionReward(m) { return 40 + (META.mlv[m.type] || 0) * 30; }
function missionValue(type) {
  if (type === 'dist') return Math.floor(G.dist);
  if (type === 'army') return G.peak;
  if (type === 'mobs') return G.mobsBeaten;
  if (type === 'boss') return G.bossKills;
  if (type === 'coins') return G.coinsPicked;
  if (type === 'walls') return G.wallsBroken;
  if (type === 'gun') return G.gunUps;
  if (type === 'streak') return G.gateStreakBest;
  return 0;
}
function fillMissions() {
  const types = Object.keys(MISSION_DEFS);
  META.missions = META.missions.filter((m) => MISSION_DEFS[m.type] && !m.claimed
    && (META.mlv[m.type] || 0) < MISSION_DEFS[m.type].steps.length);
  let guard = 0;
  while (META.missions.length < 3 && guard++ < 60) {
    const t = types[ri(0, types.length - 1)];
    if (META.missions.some((m) => m.type === t)) continue;
    if ((META.mlv[t] || 0) >= MISSION_DEFS[t].steps.length) continue;
    META.missions.push({ type: t, done: false, isNew: true });
  }
}
/* called every frame in a run: a finished mission pays out immediately */
function checkMissions() {
  for (const m of META.missions) {
    if (m.done) continue;
    if (missionValue(m.type) >= missionGoal(m)) {
      m.done = true;
      const r = missionReward(m);
      G.coins += r; G.missionCoins += r;
      META.done += 1;
      missionToast(MISSION_DEFS[m.type].text(missionGoal(m)), r);
      const rk = rankOf(META.done);
      if (rk > rankOf(META.done - 1)) {
        const rr = rankReward(rk);
        G.coins += rr; G.missionCoins += rr;
        missionToast('You made ' + RANKS[rk] + '!', rr, 'RANK UP');
        setTimeout(() => sfx.fanfare(), 2700);
      }
      saveSave();
    }
  }
}
/* end of run: finished missions level up and get replaced */
function rollMissions() {
  for (const m of META.missions) if (m.done) { META.mlv[m.type] = (META.mlv[m.type] || 0) + 1; m.claimed = true; }
  for (const m of META.missions) m.isNew = false;
  fillMissions();
}
function todayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function dailyReady() { return META.daily.last !== todayKey(); }
function dailyAmount() {
  const n = new Date();
  const y = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
  const yk = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
  const streak = META.daily.last === yk ? META.daily.streak + 1 : 1;
  return { streak, coins: 25 * Math.min(7, streak) + (streak >= 7 ? 50 : 0) };
}
const SPEED_BASE = 148;
const SPEED_CAP = 288;
const MILES = [100, 250, 500, 1000, 2000, 4000];

let gates = [], enemies = [], walls = [], pickups = [], barrels = [], hazards = [];
let bullets = [], parts = [], floats = [], rewards = [], ebullets = [], coins = [], mobs = [];
let firstMob = false, nextBand = 320;
let nextY = 400, bossCounter = 0, gatesSpawned = 0, gateSeq = 0;
let fireAcc = 0, drainAcc = 0, shootSfxAcc = 0, fallAcc = 0, edgeWarn = 0;
let hintT = 0, zoneIdx = -1, fovKick = 0, muzzleGlow = 0, distMark = 0, revived = false, lastLevel = 1;
let shownTier = -1, shownSkills = null;
let bossIntro = false, deathT = 0, shownCoins = -1, shownArmy = -1, armyRoll = 10, armyFlash = 0, armyFlashT = 0;
const fmtNum = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K' : String(n);
let halfPxCache = 28, coinSfx = 0, saveT = 0, paintedSkin = '';

const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const chance = (p) => Math.random() < p;

/* ---------------- input ----------------
   Pointer tracks fast, but lateral speed is capped so a flick / macro
   cannot teleport the squad across the road. Vertical drag stretches
   the formation; a mostly-horizontal drag does not. */
let dragging = false, lastPX = 0, lastPY = 0, prevArmyX = 0, bank = 0, dragAxis = 0;
let aimX = 0, aimForm = 0;
const keys = { left: false, right: false, up: false, down: false };
function latMax() { return Math.max(560, LW * 1.7); }
/* Steering alone never drops anyone: the squad's own width stays on the
   asphalt. Only a formation spread wider than the road hangs over. */
function clampAim(x) {
  const m = Math.min(halfPxCache + 8, (road.x1 - road.x0) * 0.5);
  return clamp(x, road.x0 + m, road.x1 - m);
}
let overAt = 0, skillIds = [];
function press(x, y) {
  audio();
  if (G.mode === 'menu') { startGame(); return; }
  if (G.mode === 'over') { if (performance.now() - overAt > 900) startGame(); return; }
  if (G.mode !== 'run' || x === undefined) return;
  dragging = true; dragAxis = 0; lastPX = x; lastPY = y;
}
function move(x, y) {
  if (!dragging || G.mode !== 'run') return;
  const dx = x - lastPX, dy = y - lastPY;
  /* One thumb: the first real move locks the gesture. Sideways steers,
     up packs a column, down spreads the squad wide. */
  if (!dragAxis) {
    if (dx * dx + dy * dy < 144) return;
    dragAxis = Math.abs(dx) >= Math.abs(dy) ? 1 : 2;
  }
  lastPX = x; lastPY = y;
  if (dragAxis === 1) {
    const span = Math.max(80, road.x1 - road.x0);
    const sens = (span * 0.46) / Math.max(150, W * 0.42);
    aimX = clampAim(aimX + dx * sens);
  } else aimForm = clamp(aimForm + dy * 0.013, -1, 1);
}
function release() { dragging = false; dragAxis = 0; }
function syncRoad() {
  const t = clamp((G.dist || 0) / 2600, 0, 1);
  const narrow = t * t * (3 - 2 * t);
  const halfPx = (LW * 0.42) * (1 - 0.5 * narrow);
  road.x0 = LW * 0.5 - halfPx;
  road.x1 = LW * 0.5 + halfPx;
  roadHalf = halfPx * K;
}
cv.addEventListener('pointerdown', e => press(e.clientX, e.clientY));
cv.addEventListener('pointermove', e => move(e.clientX, e.clientY));
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);
startOv.addEventListener('pointerdown', () => press());
overOv.addEventListener('pointerdown', (e) => {
  if (e.target.closest && e.target.closest('button, .missions, #installCard')) return;
  press();
});
function snapForm(v, e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  if (G.mode !== 'run') return;
  audio();
  aimForm = v;
}
if (btnCol) btnCol.addEventListener('pointerdown', (e) => snapForm(-1, e));
if (btnWide) btnWide.addEventListener('pointerdown', (e) => snapForm(1, e));
const shopBtn = document.getElementById('shopBtn');
const shopBtnOver = document.getElementById('shopBtnOver');
if (shopBtn) shopBtn.addEventListener('pointerdown', (e) => openShop(e));
if (shopBtnOver) shopBtnOver.addEventListener('pointerdown', (e) => openShop(e));
const shopClose = document.getElementById('shopClose');
if (shopClose) shopClose.addEventListener('pointerdown', (e) => closeShop(e));
if (installCard) installCard.addEventListener('pointerdown', (e) => e.stopPropagation());
if (installNo) installNo.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault();
  installCard.style.display = 'none';
});
if (installBtn) installBtn.addEventListener('pointerdown', async (e) => {
  e.stopPropagation(); e.preventDefault();
  if (!deferredInstall) return;
  deferredInstall.prompt();
  try { await deferredInstall.userChoice; } catch (err) { }
  deferredInstall = null;
  installCard.style.display = 'none';
});
document.addEventListener('touchmove', (e) => {
  if (e.target.closest && e.target.closest('.overlay')) return;
  e.preventDefault();
}, { passive: false });
document.addEventListener('keydown', e => {
  if (G.mode === 'pick' && e.key >= '1' && e.key <= '3' && skillIds[+e.key - 1]) { chooseSkill(skillIds[+e.key - 1]); return; }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = true;
  else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = true;
  else if (e.key === 'm' || e.key === 'M') toggleMute();
  else if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && shopOv && shopOv.style.display === 'flex') closeShop();
  else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') setPause(G.mode === 'run');
  else if (e.key === ' ' || e.key === 'Enter') {
    if ((shopOv && shopOv.style.display === 'flex') || G.mode === 'pick') return;
    e.preventDefault();
    if (G.mode === 'paused') setPause(false); else press();
  }
});
document.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = false;
  else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = false;
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
roadMesh.position.set(0, 0.025, -60);
scene.add(roadMesh);
const shoulderMat = new THREE.MeshLambertMaterial({ color: 0x141c30 });
const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(ROADW + 11, 300), shoulderMat);
shoulder.rotation.x = -Math.PI / 2;
shoulder.position.set(0, 0.012, -60);
scene.add(shoulder);

/* scrolling side posts + center dashes (instanced) */
const NPOST = 44, POST_GAP = 5;
const postMat = new THREE.MeshLambertMaterial({ color: ZONES[0].post });
const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), postMat, NPOST * 2);
scene.add(postMesh);
const NDASH = 30, DASH_GAP = 4.5;
const dashMat = new THREE.MeshBasicMaterial({ color: ZONES[0].dash });
const dashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.02, 1.6), dashMat, NDASH);
scene.add(dashMesh);

/* speed lines: streaks at the roadside once the run gets fast */
const NSL = 16;
const speedLineMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.05, 0.05, 3),
  new THREE.MeshBasicMaterial({ color: 0x9db8ff, transparent: true, opacity: 0, depthWrite: false }), NSL);
speedLineMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(speedLineMesh);
const slSeed = [];
for (let i = 0; i < NSL; i++) slSeed.push({ x: (chance(0.5) ? -1 : 1) * rnd(ROADW / 2 + 2.5, 20), off: rnd(0, 120), h: rnd(0.5, 4) });

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
  let ri2 = 0, si = 0, ci = 0;
  for (const p of propSeed) {
    if (p.kind === 0) { rockMesh.setColorAt(ri2++, tmpCol.set(z.post).lerp(col3(z.ground), 0.35)); }
    else if (p.kind === 1) { spireMesh.setColorAt(si++, tmpCol.set(z.edge || z.post).lerp(col3(z.bg), 0.15)); }
    else { crysMesh.setColorAt(ci++, tmpCol.set(z.sky).lerp(col3('#ffffff'), 0.25)); }
  }
  rockMesh.instanceColor && (rockMesh.instanceColor.needsUpdate = true);
  spireMesh.instanceColor && (spireMesh.instanceColor.needsUpdate = true);
  crysMesh.instanceColor && (crysMesh.instanceColor.needsUpdate = true);
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

/* round particles with a bright core: square GL points read as placeholder art */
const dotTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
})();
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
const starMat = new THREE.PointsMaterial({ map: dotTex, size: 0.7, color: 0xcfe0ff, transparent: true, opacity: 0.9, sizeAttenuation: true, depthWrite: false });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);
const ZONE_STARS = [0.9, 0.3, 0.15, 0.85, 0.45];

const NMOTES = 220;
const moteGeo = new THREE.BufferGeometry();
{
  const mp = new Float32Array(NMOTES * 3);
  for (let i = 0; i < NMOTES; i++) {
    mp[i * 3] = rnd(-20, 20); mp[i * 3 + 1] = rnd(0.2, 6); mp[i * 3 + 2] = rnd(-120, 10);
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
}
const moteMat = new THREE.PointsMaterial({ map: dotTex, size: 0.24, color: 0x9db8ff, transparent: true, opacity: 0.28, depthWrite: false });
const motes = new THREE.Points(moteGeo, moteMat);
motes.visible = !Q.low && !Q.phone;
scene.add(motes);

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

/* --- squad soldier: armored runner, one draw call --- */
const soldierGeo = mergeParts([
  { geo: BOX(0.11, 0.07, 0.14), m: M4(-0.07, 0.035, 0.02), c: '#141822' },
  { geo: BOX(0.11, 0.07, 0.14), m: M4(0.07, 0.035, 0.02), c: '#141822' },
  { geo: BOX(0.09, 0.16, 0.09), m: M4(-0.07, 0.14, 0), c: '#2a3858' },
  { geo: BOX(0.09, 0.16, 0.09), m: M4(0.07, 0.14, 0), c: '#2a3858' },
  { geo: BOX(0.28, 0.07, 0.16), m: M4(0, 0.24, 0), c: '#1a2233' },
  { geo: BOX(0.07, 0.045, 0.04), m: M4(0, 0.24, -0.09), c: '#ffd75d' },
  { geo: CAP(0.15, 0.26), m: M4(0, 0.48, 0), c: '#e7eeff' },
  { geo: BOX(0.18, 0.2, 0.05), m: M4(0, 0.5, -0.11), c: '#3f6ed0' },
  { geo: BOX(0.06, 0.07, 0.03), m: M4(0, 0.52, -0.145), c: '#ffd75d' },
  { geo: SPH(0.09, 7), m: M4(-0.2, 0.6, 0, 0, 0, 0, 1.15, 0.7, 0.9), c: '#355a9e' },
  { geo: SPH(0.09, 7), m: M4(0.2, 0.6, 0, 0, 0, 0, 1.15, 0.7, 0.9), c: '#355a9e' },
  { geo: BOX(0.07, 0.16, 0.07), m: M4(-0.2, 0.4, -0.02), c: '#d5e2ff' },
  { geo: BOX(0.07, 0.16, 0.07), m: M4(0.18, 0.42, -0.06), c: '#d5e2ff' },
  { geo: BOX(0.18, 0.22, 0.1), m: M4(0, 0.48, 0.15), c: '#1e293d' },
  { geo: BOX(0.07, 0.1, 0.035), m: M4(0, 0.64, 0.18), c: '#7de8ff' },
  { geo: SPH(0.145, 8), m: M4(0, 0.76, 0, 0, 0, 0, 1, 0.78, 1.02), c: '#6ea2ff' },
  { geo: BOX(0.19, 0.055, 0.05), m: M4(0, 0.72, -0.125), c: '#bff6ff' },
  { geo: BOX(0.02, 0.16, 0.02), m: M4(0, 0.98, -0.01), c: '#dfe7ff' },
  { geo: SPH(0.035, 6), m: M4(0, 1.08, -0.01), c: '#ffd75d' },
  { geo: BOX(0.055, 0.07, 0.46), m: M4(0.17, 0.44, -0.3), c: '#121722' },
  { geo: BOX(0.04, 0.045, 0.12), m: M4(0.17, 0.52, -0.36), c: '#2c384f' },
  { geo: BOX(0.03, 0.03, 0.08), m: M4(0.17, 0.44, -0.56), c: '#ffe9a0' },
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
const leaderFlag = new THREE.Mesh(
  new THREE.PlaneGeometry(0.36, 0.26),
  new THREE.MeshBasicMaterial({ color: 0xffd75d, side: THREE.DoubleSide, depthWrite: false }));
scene.add(leaderFlag);

/* dead soldier corpses (flung on drain / fallen off the road) */
const MAXDEAD = 48;
const deadSoldierMesh = new THREE.InstancedMesh(soldierGeo,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.08 }), MAXDEAD);
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
    parts.push({ geo: SPH(0.38), m: M4(0, 0.85, 0.3, 0, 0, 0, 1, 1.1, 0.6), c: '#f0c2a0' });
    horn(-0.3, 1.95, 0, 0, 0.45, 0.13, 0.4); horn(0.3, 1.95, 0, 0, -0.45, 0.13, 0.4); horn(0, 2.05, 0, -0.15, 0, 0.12, 0.42);
    arm(-0.5, 1.0, -0.05, -0.9); arm(0.5, 1.0, -0.05, 0.9);
  } else if (kind === 'gold') {
    body(0.5, 0.9, 1.0);
    parts.push({ geo: CONE(0.3, 0.5, 6), m: M4(0, 2.2, 0), c: '#fff2a8' });      // crown
    for (let i = 0; i < 4; i++) parts.push({ geo: CONE(0.07, 0.3, 5), m: M4(Math.cos(i * 1.57) * 0.28, 2.0, Math.sin(i * 1.57) * 0.28), c: '#fff2a8' });
    arm(-0.48, 1.0, -0.05, -0.85); arm(0.48, 1.0, -0.05, 0.85);
  } else if (kind === 'leaper') {
    body(0.26, 0.42, 0.78, 0.85, 1.15, 0.7);
    parts.push({ geo: BOX(0.07, 0.42, 0.07), m: M4(-0.16, 0.22, 0.04), c: '#ffffff' });
    parts.push({ geo: BOX(0.07, 0.42, 0.07), m: M4(0.16, 0.22, 0.04), c: '#ffffff' });
    horn(-0.2, 1.22, 0.12, 0.7, 0.35, 0.07, 0.38);
    horn(0.2, 1.22, 0.12, 0.7, -0.35, 0.07, 0.38);
    arm(-0.32, 0.85, -0.16, -1.1); arm(0.32, 0.85, -0.16, 1.1);
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
  leaper: { geo: enemyGeo('leaper'), cap: 40, eyeY: 1.15, eyeZ: 0.32, eyeS: 0.7, labelY: 1.85 },
  boss: { geo: enemyGeo('boss'), cap: 6, eyeY: 2.55, eyeZ: 0.75, eyeS: 1.7, labelY: 3.7 },
};
const kindMesh = {};
for (const k in EDEF) {
  const m = new THREE.InstancedMesh(EDEF[k].geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05 }), EDEF[k].cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(m);
  kindMesh[k] = m;
}
kindMesh.boss.material.fog = false;
kindMesh.boss.material.emissive = new THREE.Color('#ff7a45');
kindMesh.boss.material.emissiveIntensity = 0.32;
kindMesh.boss.renderOrder = 2;
/* rival mobs: one shared instanced crowd for every enemy army on screen */
const MOBU_MAX = 300;
const MOB_VIS = Q.low ? 34 : Q.phone ? 56 : 90;
const mobUnitMesh = new THREE.InstancedMesh(EDEF.runner.geo,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, emissive: 0x3a0a06, emissiveIntensity: 0.6 }), MOBU_MAX);
mobUnitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(mobUnitMesh);
const MAXE = 320;
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
const MAXSH = 520;
const shadowMesh = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    map: blobTex, transparent: true, opacity: 0.72, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), MAXSH);
shadowMesh.renderOrder = 2;
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
const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xf3ecdf, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
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

/* --- glowing crystals along the roadside (zone-tinted) --- */
const NCRY = 30;
const crysMesh = new THREE.InstancedMesh(
  new THREE.OctahedronGeometry(1, 0),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.2, emissive: 0x334455, emissiveIntensity: 0.7 }), NCRY);
crysMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(crysMesh);
for (let i = 0; i < NCRY; i++) propSeed.push({ x: (chance(0.5) ? -1 : 1) * rnd(ROADW / 2 + 2.6, 48), s: rnd(0.4, 1.3), ry: rnd(0, 6), kind: 2 });

/* trees, grass, lamps, ruins — instanced, zone-tinted, no shadow maps */
const NTREE = 40, NGRASS = 110, NLAMP = 26, NRUIN = 22;
const trunkMesh = new THREE.InstancedMesh(
  new THREE.CylinderGeometry(0.12, 0.2, 1.15, 5),
  new THREE.MeshLambertMaterial({ color: 0x3a2a1c }), NTREE);
const crownMesh = new THREE.InstancedMesh(
  new THREE.ConeGeometry(0.95, 2.15, 6),
  new THREE.MeshLambertMaterial({ color: 0x8dffa8 }), NTREE);
const grassMesh = new THREE.InstancedMesh(
  new THREE.ConeGeometry(0.16, 0.55, 4),
  new THREE.MeshLambertMaterial({ color: 0x6ea86a }), NGRASS);
const lampPole = new THREE.InstancedMesh(
  new THREE.CylinderGeometry(0.06, 0.08, 2.3, 5),
  new THREE.MeshLambertMaterial({ color: 0x2a3344 }), NLAMP);
const lampBulb = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.16, 7, 6),
  new THREE.MeshBasicMaterial({ color: 0xfff1c2 }), NLAMP);
const ruinMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.7, 1, 0.7),
  new THREE.MeshLambertMaterial({ color: 0x2a354c }), NRUIN);
for (const m of [trunkMesh, crownMesh, grassMesh, lampPole, lampBulb, ruinMesh]) {
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(m);
}
const treeSeed = [], grassSeed = [], ruinSeed = [];
for (let i = 0; i < NTREE; i++) treeSeed.push({
  side: chance(0.5) ? -1 : 1, spread: rnd(3.4, 16), s: rnd(0.7, 1.7),
  off: rnd(0, 160), ry: rnd(0, 6),
});
for (let i = 0; i < NGRASS; i++) grassSeed.push({
  side: chance(0.5) ? -1 : 1, spread: rnd(0.7, 4.8), s: rnd(0.45, 1.15),
  off: rnd(0, 150), ry: rnd(0, 6),
});
for (let i = 0; i < NRUIN; i++) ruinSeed.push({
  side: chance(0.5) ? -1 : 1, spread: rnd(8, 28), s: rnd(0.6, 2.2),
  off: rnd(0, 170), ry: rnd(0, 3), h: rnd(0.5, 1.6),
});

/* --- dark ground patches: break up the flat roadside --- */
const NPT = 56;
const patchMesh = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.32, depthWrite: false }), NPT);
patchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(patchMesh);
const patchSeed = [];
for (let i = 0; i < NPT; i++) patchSeed.push({ x: (chance(0.5) ? -1 : 1) * rnd(ROADW / 2 + 2.2, 48), s: rnd(1.2, 4.2), ry: rnd(0, 6) });
function addScorch(x, wy, s) {
  scorches.push({ x, wy, s: s || 1.6, t: 0 });
  if (scorches.length > MAXSC) scorches.shift();
}

/* --- road edge light strips (follow the asphalt as it narrows) --- */
const stripMat = new THREE.MeshBasicMaterial({ color: ZONES[0].post });
const roadStrips = [];
for (const sx of [-1, 1]) {
  const st = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 300), stripMat);
  st.position.set(sx * (ROADW / 2 + 0.08), 0.09, -60);
  scene.add(st);
  roadStrips.push(st);
}

/* --- personal-best finish line: you can see the record coming --- */
const bestGrp = new THREE.Group();
{
  const gold = new THREE.MeshBasicMaterial({ color: 0xffd75d, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), gold);
  strip.rotation.x = -Math.PI / 2; strip.position.y = 0.08;
  const checker = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 16;
    const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#1a140c' : '#ffd75d'; g.fillRect(i * 8, j * 8, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 3; return t;
  })();
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ map: checker, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  banner.position.y = 3.3;
  const postGeo = new THREE.BoxGeometry(0.22, 3.6, 0.22);
  const pL = new THREE.Mesh(postGeo, gold), pR = new THREE.Mesh(postGeo, gold);
  pL.position.y = pR.position.y = 1.8;
  bestGrp.add(strip, banner, pL, pR);
  bestGrp.userData = { strip, banner, pL, pR };
  bestGrp.visible = false;
  scene.add(bestGrp);
}
let bestFlagPassed = true;
const bestLabel = document.createElement('div');
bestLabel.className = 'lb best';
document.getElementById('labels').appendChild(bestLabel);

/* --- bullets: instanced tracers --- */
const MAXB = 500;
const BULLET_CAP = Q.low ? 140 : Q.phone ? 260 : MAXB;
const bulletMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.07, 0.07, 0.55),
  new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXB);
bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(bulletMesh);
const MAXEB = 30;
const ebulletMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.16, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXEB);
ebulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(ebulletMesh);
const MAXCOIN = 72;
/* coins: a chunky gold disc with a darker rim, spinning on its edge like every coin in every runner */
const coinMesh = new THREE.InstancedMesh(
  mergeParts([
    { geo: new THREE.CylinderGeometry(0.24, 0.24, 0.08, 16), m: M4(0, 0, 0, Math.PI / 2, 0, 0), c: '#e09a12' },
    { geo: new THREE.CylinderGeometry(0.17, 0.17, 0.1, 16), m: M4(0, 0, 0, Math.PI / 2, 0, 0), c: '#ffd84a' },
  ]),
  new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x6a3c00, emissiveIntensity: 0.55, metalness: 0.35, roughness: 0.35 }), MAXCOIN);
coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(coinMesh);

/* --- particles: Points --- */
const MAXP = 900;
const partGeo = new THREE.BufferGeometry();
const partPos = new Float32Array(MAXP * 3);
const partCol = new Float32Array(MAXP * 3);
partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
partGeo.setAttribute('color', new THREE.BufferAttribute(partCol, 3));
const partMesh = new THREE.Points(partGeo, new THREE.PointsMaterial({
  size: 0.42, map: dotTex, vertexColors: true, transparent: true, opacity: 1,
  depthWrite: false, sizeAttenuation: true, alphaTest: 0.02,
}));
scene.add(partMesh);

/* --- pickups & rewards: glowing orbs (small pool) --- */
const pickupProto = new THREE.SphereGeometry(0.32, 10, 10);
const pickupMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const PICKUP_COL = { rate: 0xe2b657, dmg: 0xffd75d, spread: 0xd7e2c3, heal: 0xd7e2c3, gold: 0xffd75d, weapon: 0xff9d5d, upgrade: 0xe2b657, ward: 0xf3ecdf };

/* --- barrels: group per barrel --- */
const BAR_COL = { weapon: '#ff9d5d', heal: '#7dff9b', bomb: '#ff5d6a', gold: '#ffd75d', upgrade: '#7de8ff' };
const BAR_ICON = { weapon: 'gun', heal: 'plus', bomb: 'bomb', gold: 'star', upgrade: 'bolt' };
const barrelGeoC = new THREE.CylinderGeometry(0.5, 0.55, 1.15, 12);
const barrelRing = new THREE.CylinderGeometry(0.56, 0.56, 0.14, 12);

/* --- emoji sprite texture cache --- */
const emojiTex = {};
function makeIconTex(name, fill) {
  const key = name + fill;
  if (emojiTex[key]) return emojiTex[key];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  /* round badge, ink rim, icon in the middle */
  g.fillStyle = INK; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff4dc'; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.fill();
  drawIcon(g, name, 64, 66, 64, fill);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  emojiTex[key] = t;
  return t;
}
function makeWarnTex() {
  if (emojiTex.__warn) return emojiTex.__warn;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const tri = (inset) => { g.beginPath(); g.moveTo(64, 10 + inset); g.lineTo(118 - inset * 1.2, 112 - inset * 0.6); g.lineTo(10 + inset * 1.2, 112 - inset * 0.6); g.closePath(); };
  g.lineJoin = 'round';
  g.fillStyle = INK; tri(0); g.fill(); g.lineWidth = 10; g.strokeStyle = INK; g.stroke();
  g.fillStyle = '#ffcc33'; tri(12); g.fill();
  g.fillStyle = INK; g.beginPath(); g.roundRect(56, 42, 16, 38, 6); g.fill();
  g.beginPath(); g.arc(64, 93, 8, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  emojiTex.__warn = t;
  return t;
}
function makeSprite(name, fill) {
  const map = name === 'warn' ? makeWarnTex() : makeIconTex(name, fill || '#ff4d5e');
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
  sp.scale.set(1.5, 1.5, 1);
  return sp;
}

/* --- gate panels --- */
const PANEL_STYLE = {
  add: { bg: 'rgba(60,180,70,0.78)', edge: '#a6f59a' },
  mul: { bg: 'rgba(40,170,80,0.82)', edge: '#c4ffb0' },
  gun: { bg: 'rgba(40,130,220,0.8)', edge: '#a8dcff' },
  sub: { bg: 'rgba(220,50,70,0.78)', edge: '#ffb0b8' },
  div: { bg: 'rgba(170,40,90,0.82)', edge: '#ffb0d0' },
};
function gateLabel(p) {
  if (p.t === 'add') return '+' + p.v;
  if (p.t === 'sub') return '-' + p.v;
  if (p.t === 'mul') return '×' + p.v;
  if (p.t === 'gun') return 'GUN UP';
  return '÷' + p.v;
}
function gateGood(p) { return p.t === 'add' || p.t === 'mul' || p.t === 'gun'; }
function panelTex(p) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  const st = p.gold ? { bg: 'rgba(214,150,20,0.86)', edge: '#ffe27a' } : PANEL_STYLE[p.t];
  g.fillStyle = st.bg;
  g.beginPath(); g.roundRect(8, 8, 240, 144, 22); g.fill();
  g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
  g.lineWidth = 4; g.strokeStyle = st.edge;
  g.beginPath(); g.roundRect(16, 16, 224, 128, 15); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const text = (str, x, size) => {
    g.font = `${size}px "Lilita One", "Avenir Next", sans-serif`;
    g.lineWidth = size * 0.2; g.strokeStyle = INK;
    g.strokeText(str, x, 86); g.fillStyle = '#fff'; g.fillText(str, x, 84);
  };
  if (p.t === 'gun') {
    drawIcon(g, 'gun', 84, 82, 74, '#ffcc33');
    text('UP', 172, 72);
  } else {
    const lab = gateLabel(p);
    text(lab, 128, lab.length > 4 ? 64 : lab.length > 3 ? 76 : 92);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const panelGeo = new THREE.PlaneGeometry(1, 4.6);
function makeGateMeshes(g) {
  const grp = new THREE.Group();
  g.meshes = []; g.frames = [];
  for (const p of g.panels) {
    const frame = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({
      color: p.gold ? '#ffd75d' : PANEL_STYLE[p.t].edge, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
    }));
    frame.position.z = -0.02; frame.scale.setScalar(1.07);
    grp.add(frame); g.frames.push(frame);
    const m = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({
      map: panelTex(p), transparent: true, side: THREE.DoubleSide, depthWrite: false,
    }));
    grp.add(m); g.meshes.push(m);
  }
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.2, 0.28),
    new THREE.MeshLambertMaterial({ color: g.moving ? 0x7de8ff : 0xdfe9ff, transparent: true }));
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
  l.scale.set(Math.max(0.15, lW), 1, 1); l.position.set(wx((road.x0 + mid) / 2), 2.3, 0);
  r.scale.set(Math.max(0.15, rW), 1, 1); r.position.set(wx((mid + road.x1) / 2), 2.3, 0);
  g.frames[0].scale.set(Math.max(0.15, lW) * 1.045, 1.045, 1); g.frames[0].position.set(l.position.x, 2.3, -0.04);
  g.frames[1].scale.set(Math.max(0.15, rW) * 1.045, 1.045, 1); g.frames[1].position.set(r.position.x, 2.3, -0.04);
  g.postMesh.position.set(wx(mid), 2.6, 0);
  g.baseMesh.scale.x = Math.max(0.4, roadHalf * 2); g.baseMesh.position.set(0, 0.09, 0);
}
function removeGate(g) { if (g.grp) scene.remove(g.grp); }

/* --- walls: barricade slab + rim + side pillars + warning core --- */
const wallGeo = mergeParts([
  { geo: BOX(1, 3.0, 0.8), m: M4(0, 1.5, 0), c: '#3a4a6e' },
  { geo: BOX(1.03, 0.4, 0.95), m: M4(0, 3.2, 0), c: '#2a3654' },
  { geo: BOX(0.12, 3.1, 1.0), m: M4(-0.46, 1.55, 0), c: '#2a3654' },
  { geo: BOX(0.12, 3.1, 1.0), m: M4(0.46, 1.55, 0), c: '#2a3654' },
  { geo: BOX(0.26, 0.44, 0.12), m: M4(0, 1.9, 0.42), c: '#ff5d6a' },
]);
const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15 });
function makeWallMesh(w) {
  const m = new THREE.Mesh(wallGeo, wallMat);
  m.scale.x = w.wx;
  m.position.x = w.cxW;
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
  return h.mid + Math.sin(G.time * 1000 * h.speed + h.phase) * h.amp;
}

/* choke barriers: road narrows — crowd wider than the gap gets crushed */
const chokeGeo = new THREE.BoxGeometry(1, 1.7, 1);
const chokeMat = new THREE.MeshLambertMaterial({ color: 0x303c5c });
const chokeEdgeGeo = new THREE.BoxGeometry(0.26, 2.2, 1);
const chokeEdgeMat = new THREE.MeshBasicMaterial({ color: 0xff5d6a });

/* meteors: warning ring, then a rock falls and blows up whoever stands there */
const hazRingGeo = new THREE.RingGeometry(0.86, 1, 32);
const meteorGeo = new THREE.DodecahedronGeometry(0.55, 0);
const meteorMat = new THREE.MeshStandardMaterial({ color: 0xff7a3d, emissive: 0xff4a1a, emissiveIntensity: 0.9, roughness: 0.6 });

function spawnMeteor(wy) {
  const h = { kind: 'meteor', x: rnd(road.x0 + 60, road.x1 - 60), wy, r: rnd(65, 95),
    armed: false, dead: false, tImpact: 0, deadT: 0, pop: 1 };
  const grp = new THREE.Group();
  const ring = new THREE.Mesh(hazRingGeo, new THREE.MeshBasicMaterial({ color: 0xff5d6a, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(wx(h.x), 0.05, 0);
  const rock = new THREE.Mesh(meteorGeo, meteorMat);
  rock.position.set(wx(h.x), 30, 0); rock.visible = false;
  const warn = makeSprite('warn'); warn.position.set(wx(h.x), 3.4, 0); warn.visible = false;
  grp.add(ring, rock, warn);
  grp.position.z = wz(wy);
  scene.add(grp);
  h.grp = grp; h.ring = ring; h.rock = rock; h.warn = warn;
  hazards.push(h);
}

function spawnHazard(wy) {
  const d = G.level;
  let roll = Math.random();
  if (G.dist < 220 && roll > 0.62) roll = Math.random() * 0.62;
  if (roll < 0.28) {
    /* lava pool(s) anchored to a road edge — steer to the free side */
    const n = d >= 3 && chance(0.45) ? 2 : 1;
    let ly = wy;
    for (let i = 0; i < n; i++) {
      const wpx = (road.x1 - road.x0) * rnd(0.42, 0.58);
      const left = chance(0.5);
      const x = left ? road.x0 + wpx / 2 : road.x1 - wpx / 2;
      const len = rnd(150, 260);
      const h = { kind: 'lava', x, w: wpx, wy: ly, len, drain: 4 + Math.floor(d / 3), pop: 0 };
      const grp = new THREE.Group();
      const outer = new THREE.Mesh(lavaGeo, new THREE.MeshBasicMaterial({ color: 0xb32d12, transparent: true, opacity: 0.85, depthWrite: false }));
      outer.rotation.x = -Math.PI / 2; outer.position.y = 0.045;
      outer.scale.set(wpx * K, len * K, 1);
      const inner = new THREE.Mesh(lavaGeo, new THREE.MeshBasicMaterial({ color: 0xffb03d, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      inner.rotation.x = -Math.PI / 2; inner.position.y = 0.06;
      inner.scale.set(wpx * K * 0.8, len * K * 0.8, 1);
      const warn = makeSprite('warn'); warn.position.set(0, 2.8, -len * K * 0.5 - 1.4);
      grp.add(outer, inner, warn);
      grp.position.set(wx(x), 0, wz(ly));
      scene.add(grp);
      h.grp = grp; h.inner = inner;
      hazards.push(h);
      ly += len + rnd(80, 140);
    }
  } else if (roll < 0.52) {
    /* sawblade sweeping across the road on a rail */
    const h = {
      kind: 'saw', wy, r: 88, drain: 6 + Math.floor(d / 3),
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
    const warn = makeSprite('warn'); warn.position.set(0, 3.1, -2.2);
    grp.add(warn);
    grp.position.set(0, 0, wz(wy));
    scene.add(grp);
    h.grp = grp; h.blade = blade;
    hazards.push(h);
  } else if (roll < 0.74) {
    /* chokepoint: barriers squeeze the road down to a gap */
    const gapW = (road.x1 - road.x0) * rnd(0.38, 0.55);
    const gapX = rnd(road.x0 + gapW / 2 + 24, road.x1 - gapW / 2 - 24);
    const len = rnd(220, 320);
    const h = { kind: 'choke', wy: wy + len / 2, len, gapX, gapW, drain: 5 + Math.floor(d / 3), pop: 0 };
    const grp = new THREE.Group();
    const gapL = gapX - gapW / 2, gapR = gapX + gapW / 2;
    for (const seg of [[road.x0, gapL], [gapR, road.x1]]) {
      const wpx = seg[1] - seg[0];
      if (wpx <= 8) continue;
      const m = new THREE.Mesh(chokeGeo, chokeMat);
      m.scale.set(wpx * K, 1, len * K);
      m.position.set(wx((seg[0] + seg[1]) / 2), 0.85, 0);
      grp.add(m);
      const edge = new THREE.Mesh(chokeEdgeGeo, chokeEdgeMat);
      edge.scale.z = len * K;
      edge.position.set(wx(seg[0] === road.x0 ? seg[1] : seg[0]), 1.1, 0);
      grp.add(edge);
    }
    const warn = makeSprite('warn'); warn.position.set(wx(gapX), 3.0, -len * K / 2 - 1.2);
    grp.add(warn);
    grp.position.z = wz(h.wy);
    scene.add(grp);
    h.grp = grp;
    hazards.push(h);
  } else if (G.dist > 260) {
    /* hole in the asphalt — anyone standing on it drops */
    const wpx = (road.x1 - road.x0) * rnd(0.28, 0.55);
    const len = rnd(78, 140);
    const x = rnd(road.x0 + wpx / 2 + 10, road.x1 - wpx / 2 - 10);
    const h = { kind: 'gap', x, w: wpx, wy: wy + len * 0.5, len, drain: 7 + Math.floor(d / 2), pop: 0 };
    const grp = new THREE.Group();
    const hole = new THREE.Mesh(lavaGeo, new THREE.MeshBasicMaterial({ color: 0x070910, transparent: true, opacity: 0.92, depthWrite: false }));
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.05;
    hole.scale.set(wpx * K, len * K, 1);
    const lip = new THREE.Mesh(lavaGeo, new THREE.MeshBasicMaterial({ color: 0xff5d6a, transparent: true, opacity: 0.55, depthWrite: false }));
    lip.rotation.x = -Math.PI / 2; lip.position.y = 0.055;
    lip.scale.set(wpx * K * 1.12, len * K * 1.08, 1);
    const warn = makeSprite('warn'); warn.position.set(0, 2.4, -len * K * 0.5 - 1);
    grp.add(lip, hole, warn);
    grp.position.set(wx(x), 0, wz(h.wy));
    scene.add(grp);
    h.grp = grp;
    hazards.push(h);
  } else {
    spawnWall(wy);
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
  /* Far labels stay full-size in screen space and pile into an unreadable blob. */
  const cl = el.classList;
  const farCut = cl.contains('boss') || cl.contains('mob') || cl.contains('best') ? -80 : (cl.contains('wall') ? -32 : -15);
  if (zz > 1 || zz < -1 || z3 < farCut || sx < -120 || sx > W + 120 || sy < -60 || sy > H + 60) {
    el.style.display = 'none';
  } else {
    const sc = clamp(1.05 - Math.max(0, -z3) / 36, 0.62, 1.05);
    el.style.display = 'block';
    el.style.transform = `translate(${sx - W / 2}px,${sy - H / 2}px) translate(-50%,-50%) scale(${sc.toFixed(3)})`;
    el.style.left = '50%'; el.style.top = '50%';
  }
}
function floatText(x, wy, text, color, size, h) {
  const el = document.createElement('div');
  el.className = 'fl'; el.textContent = text;
  el.style.color = color; el.style.fontSize = (size || 18) + 'px';
  floatsEl.appendChild(el);
  /* stack instead of overlapping when several pop at once near the squad */
  let hh = h === undefined ? 2.5 : h;
  let busy = 0;
  for (const f of floats) if (f.t < 0.45 && Math.abs(f.x - x) < 140 && Math.abs(f.wy - wy) < 90) busy++;
  hh += busy * 1.15;
  floats.push({ el, x, wy, h: hh, vh: 2.6, t: 0, life: 1.05 + busy * 0.12 });
  while (floats.length > 14) { floats[0].el.remove(); floats.shift(); }
}

/* ---------------- spawning ---------------- */
function spawnCoinLine(wy) {
  if (coins.length > MAXCOIN - 10) return;
  const early = gatesSpawned <= 3;
  const arc = !early && Math.random() < 0.4;
  const n = ri(6, 9);
  const x0 = early ? LW / 2 + rnd(-24, 24) : rnd(road.x0 + 36, road.x1 - 36);
  const drift = arc ? rnd(-80, 80) : rnd(-16, 16);
  for (let i = 0; i < n && coins.length < MAXCOIN; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const x = clamp(x0 + drift * (u - 0.5) + (arc ? Math.sin(u * Math.PI) * 42 : 0), road.x0 + 22, road.x1 - 22);
    coins.push({ x, wy: wy + i * Math.max(26, 0.85 / K), spin: i * 0.5 });
  }
}

function schedule() {
  const heat = clamp((G.dist - 220) / 1900, 0, 1);
  while (nextY < G.camY + LH * 3.2) {
    const roll = Math.random();
    const gateP = 0.46 - heat * 0.06;
    const packP = gateP + 0.2;
    const barrelP = packP + 0.1;
    const hordeP = barrelP + heat * 0.1;
    const hazP = hordeP + 0.05 + heat * 0.09;
    const mobP = G.dist > 60 ? 0.13 + heat * 0.1 : 0;
    if (G.dist > nextBand) { nextBand += 350; spawnMob(nextY, 1, true); nextY += rnd(640, 900) - heat * 210; continue; }
    if (G.dist > 60 && !firstMob) { firstMob = true; spawnMob(nextY, 0.7); }
    else if (G.dist < 100 && gatesSpawned < 3) spawnGate(nextY);
    else if (roll > 1 - mobP) spawnMob(nextY);
    else if (G.dist < 100) { if (chance(0.55)) spawnBarrels(nextY); else spawnPack(nextY); }
    else if (roll < gateP) spawnGate(nextY);
    else if (roll < packP) spawnPack(nextY);
    else if (roll < barrelP) spawnBarrels(nextY);
    else if (roll < hordeP && G.dist > 220) spawnHorde(nextY);
    else if (roll < hazP && G.dist > 200) spawnHazard(nextY);
    else if (G.dist > 120) spawnWall(nextY);
    else spawnGate(nextY);
    if (chance(0.12)) spawnPickup(nextY + rnd(-150, 150));
    if (gatesSpawned <= 3 || chance(0.7)) spawnCoinLine(nextY + rnd(70, 200));
    if (G.dist > 380 && chance(0.08 + heat * 0.1)) spawnMeteor(nextY + rnd(-120, 240));
    nextY += rnd(640, 940) - heat * 210;
    bossCounter += 1;
    if (bossCounter >= (G.dist < 450 ? 10 : 6)) { bossCounter = 0; spawnBoss(nextY + 140); nextY += 900; }
  }
}

function spawnGate(wy) {
  const d = G.level;
  const S = Math.max(10, G.soldiers);
  /* add values track the army a bit so +N never feels worthless; red gates
     take a share of the army — a wrong pick stings but is rarely lethal early */
  const addBase = ri(8, 16) + d * 5 + Math.round(S * rnd(0.12, 0.22));
  const late = G.dist > 420;
  const bigSub = Math.max(4, Math.round(S * rnd(0.35, 0.6)) + d * 2);
  const styles = [
    [{ t: 'add', v: addBase }, { t: 'mul', v: 2 }],
    [{ t: 'sub', v: bigSub }, { t: 'add', v: addBase + ri(4, 10) }],
    [{ t: 'mul', v: 2 }, { t: 'div', v: 2 }],
    [{ t: 'add', v: addBase }, { t: 'sub', v: Math.max(3, Math.round(S * rnd(0.2, 0.35))) }],
    [{ t: 'mul', v: 3 }, { t: 'sub', v: late ? Math.round(S * rnd(0.7, 0.95)) : bigSub }],
    [{ t: 'add', v: addBase * 2 }, { t: 'mul', v: 2 }],
    [{ t: 'div', v: 2 }, { t: 'add', v: addBase + ri(0, 8) }],
    [{ t: 'mul', v: 3 }, { t: 'div', v: 3 }],
    [{ t: 'add', v: addBase + 20 }, { t: 'sub', v: late ? Math.round(S * rnd(0.9, 1.25)) : bigSub }],
    [{ t: 'gun' }, { t: 'sub', v: bigSub }],
    [{ t: 'gun' }, { t: 'div', v: 2 }],
  ];
  if (chance(0.06)) styles.push([{ t: 'mul', v: 5 }, { t: 'sub', v: late ? Math.round(S * rnd(0.9, 1.3)) : bigSub }]);
  if (chance(0.05)) styles.push([{ t: 'mul', v: 4 }, { t: 'div', v: 2 }]);
  const lucky = gatesSpawned >= 2 && chance((META.up.lucky || 0) * 0.06);
  const pair = gatesSpawned < 2 ? [{ t: 'add', v: addBase }, { t: 'mul', v: 2 }]
    : lucky ? (chance(0.5) ? [{ t: 'mul', v: 3 }, { t: 'add', v: addBase * 2 }] : [{ t: 'add', v: addBase * 2 }, { t: 'mul', v: 3 }])
    : styles[ri(0, styles.length - 1)];
  gatesSpawned += 1;
  const moving = gatesSpawned > 3 && chance(Math.min(0.55, 0.22 + G.level * 0.05))
    ? { amp: rnd(45, 105), speed: rnd(0.0017, 0.0034), phase: rnd(0, 6) } : null;
  const g = { id: ++gateSeq, wy, passed: false, moving: lucky ? null : moving, lucky, mid: (road.x0 + road.x1) / 2, pop: 0,
    panels: [{ ...pair[0], side: 0, gold: lucky }, { ...pair[1], side: 1, gold: lucky }] };
  makeGateMeshes(g);
  gates.push(g);
  if (lucky) g.announce = true;
}

function mkEnemy(kind, x, wy, hp) {
  const d = G.level;
  const e = { x, wy, hp, maxhp: hp, attacking: false, boss: false, kind, pop: 0, label: mkLabel(kind === 'boss' ? 'boss' : '') };
  if (kind === 'runner') { e.r = rnd(8, 10); e.drift = rnd(22, 34); e.col = '#ff6b5d'; e.drain = 1; }
  else if (kind === 'brute') { e.r = rnd(22, 27); e.drift = rnd(2, 5); e.col = '#a32233'; e.drain = 2; }
  else if (kind === 'split') { e.r = rnd(14, 16); e.drift = rnd(8, 14); e.col = '#e07a3d'; e.drain = 1; }
  else if (kind === 'gold') { e.r = rnd(13, 15); e.drift = rnd(6, 10); e.col = '#ffd75d'; e.drain = 1; }
  else if (kind === 'leaper') { e.r = rnd(9, 12); e.drift = rnd(26, 40); e.col = '#e25a32'; e.drain = 1; }
  else if (kind === 'boss') { e.r = 26; e.drift = 26; e.col = '#c0302c'; e.drain = 3; e.boss = true; }
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
  } else if (roll < 0.76 && d >= 4) {
    const n = ri(3, 5);
    for (let i = 0; i < n; i++)
      enemies.push(mkEnemy('leaper', clamp(cxp + rnd(-90, 90), road.x0 + 10, road.x1 - 10),
        wy + rnd(-40, 70), Math.round((6 + d * 2.2) * rnd(0.85, 1.2))));
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
  /* sometimes a partial barricade covering part of the road — dodgeable */
  const partial = d >= 2 && chance(0.45);
  let x0 = road.x0, x1 = road.x1;
  if (partial) {
    const wpx = (road.x1 - road.x0) * rnd(0.55, 0.7);
    x0 = chance(0.5) ? road.x0 : road.x1 - wpx;
    x1 = x0 + wpx;
  }
  const cx = (x0 + x1) / 2;
  const hp = Math.round((14 + d * 19) * rnd(0.85, 1.2) * (partial ? 0.8 : 1));
  const w = { wy, hp, maxhp: hp, dead: false, pop: 0, x0, x1,
    cx, cxW: wx(cx), wx: (x1 - x0) * K, label: mkLabel('wall') };
  makeWallMesh(w);
  walls.push(w);
}

/* Threat curve. Rival mobs scale with distance AND with the army you bring,
   so a fat squad still has to fight for it, and every run eventually ends.
   Shooting a mob down before contact is how you keep your soldiers. */
function threatBase(d) { return 6 * Math.pow(1.00205, d); }
function threatRatio(d) {
  const t = clamp(d / 2300, 0, 1);
  /* past ~1100m the mobs keep swelling until they outnumber any army: outgun them or die */
  return 0.24 + 0.62 * t * t * (3 - 2 * t) + Math.max(0, (d - 1100) / 1400) * 0.5;
}
/* firepower per soldier relative to a bare pistol squad */
function firepower() {
  const wt = WT[G.tier];
  const spread = Math.min(7, wt.spread + (G.skills.split || 0) + (G.upSpread || 0));
  const rate = Math.max(0.04, wt.rate - G.upRate) * (1 - Math.min(0.4, (G.skills.rate || 0) * 0.1));
  return ((wt.dmg + G.upDmg) * spread / rate) / (1 / 0.24);
}
/* sublinear in firepower: a better gun still shreds more of the mob */
function unitHp(d) { return (6 + d / 32) * Math.pow(Math.max(1, firepower()), 0.6); }
function spawnMob(wy, scale, band) {
  const d = G.dist;
  let n = band
    ? Math.max(threatBase(d) * 2, G.soldiers * (0.55 + 0.45 * clamp((d - 300) / 1000, 0, 1)) * rnd(0.9, 1.1) * (1 + Math.max(0, d - 1300) / 2500))
    : Math.max(threatBase(d), G.soldiers * threatRatio(d)) * rnd(0.8, 1.15) * (scale || 1);
  n = Math.max(4, Math.round(n));
  const uh = unitHp(d);
  const vis = Math.min(n, MOB_VIS);
  const roadW = road.x1 - road.x0;
  const gap = 15;
  const colMax = Math.max(2, Math.floor(roadW * 0.86 / gap));
  let cols = band ? colMax : clamp(Math.round(Math.sqrt(vis * 2.2)), 2, colMax);
  const rows = Math.ceil(vis / cols);
  const units = [];
  for (let i = 0; i < vis; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const rowN = Math.min(cols, vis - r * cols);
    units.push({ ox: (c - (rowN - 1) / 2) * gap + rnd(-3, 3), oy: (r - (rows - 1) / 2) * gap * 0.9 + rnd(-3, 3), ph: rnd(0, 6.28), k: 0 });
  }
  /* front rows first, outer edges last: a shrinking crowd thins from the back */
  for (const u of units) u.k = u.oy * 2 + Math.abs(u.ox) * 0.5;
  units.sort((a, b) => a.k - b.k);
  const hw = ((cols - 1) * gap) / 2 + 10;
  const x = clamp(rnd(road.x0 + hw, road.x1 - hw), road.x0 + hw * 0.6, road.x1 - hw * 0.6);
  const m = { x: band ? (road.x0 + road.x1) / 2 : x, band: !!band, wy, count: n, start: n, hp: n * uh, uh, units, hw, hd: ((rows - 1) * gap * 0.9) / 2 + 10,
    clash: false, tick: 0, hitT: 0, pop: 0, dead: false, deadT: 0, label: mkLabel('mob') };
  mobs.push(m);
  if (band) bannerFlash('WAR BAND AHEAD', '#ff5d6a');
  if (!META.seenMob) { META.seenMob = true; showHint('RED MOB AHEAD · shoot it down, then outnumber it on contact', 4.5); }
  return m;
}
function mobVisible(m) { return Math.max(1, Math.min(m.units.length, Math.ceil(m.units.length * m.count / m.start))); }
function mobHalfW(m) {
  const v = mobVisible(m);
  let h = 10;
  for (let i = 0; i < v; i++) h = Math.max(h, Math.abs(m.units[i].ox) + 10);
  return h;
}
function killMob(m, how) {
  if (m.dead) return;
  G.kills += m.count;
  m.dead = true; m.deadT = 0; m.count = 0;
  m.label.style.display = 'none';
  G.mobsBeaten += 1;
  const loot = Math.max(2, Math.round(Math.sqrt(m.start) * (m.band ? 1.6 : 0.9)));
  for (let i = 0; i < Math.min(loot, 14) && coins.length < MAXCOIN; i++)
    coins.push({ x: clamp(m.x + rnd(-m.hw, m.hw), road.x0 + 20, road.x1 - 20), wy: m.wy + rnd(-m.hd, m.hd), spin: rnd(0, 6), fly: 0.25 + i * 0.04 });
  floatText(m.x, m.wy, m.band ? 'WAR BAND BROKEN!' : how === 'shot' ? 'WIPED OUT!' : 'CRUSHED!', '#ffd75d', m.band ? 32 : how === 'shot' ? 26 : 30, 3.4);
  for (let i = 0; i < 28 && parts.length < MAXP - 30; i++) parts.push(mkPart(m.x + rnd(-m.hw, m.hw), m.wy + rnd(-m.hd, m.hd), i % 3 ? '#ff5d6a' : '#ffd75d'));
  for (let i = 0; i < Math.min(10, mobVisible(m)); i++) {
    const u = m.units[i];
    deadEnemies.push({ x: m.x + u.ox, wy: m.wy + u.oy, kind: 'runner', col: '#e8485a', s: 0.5, t: 0,
      vx: rnd(-80, 80), vwy: rnd(40, 110), y: 0.4, vy: rnd(3.4, 6.4), spin: rnd(-8, 8) });
  }
  while (deadEnemies.length > 30) deadEnemies.shift();
  addScorch(m.x, m.wy, 3);
  (m.band ? sfx.fanfare : sfx.great)(); G.shake = Math.max(G.shake, m.band ? 12 : how === 'shot' ? 6 : 10);
  if (how !== 'shot') hitstop(0.09);
  vib(how === 'shot' ? 15 : 35);
}
function hurtMob(m, dmg) {
  if (m.dead) return;
  m.hp -= dmg;
  const c = Math.max(0, Math.ceil(m.hp / m.uh));
  if (c < m.count) { G.kills += m.count - c; m.count = c; if (!(m.hitCD > 0)) { m.hitT = 0.06; m.hitCD = 0.2; } }
  if (m.hp <= 0) killMob(m, 'shot');
}

const bossAuraGeo = new THREE.RingGeometry(0.85, 1, 36);
function spawnBoss(wy) {
  const d = G.level;
  const hp = Math.round(42 + d * 46 + G.soldiers * 1.5 * (1 + G.dist / 1400));
  const bx = (road.x0 + road.x1) / 2 + rnd(-60, 60);
    const boss = mkEnemy('boss', bx, wy, hp);
  boss.roar = 1;
  boss.pop = 0.55;
  /* variant: a gunner boss lobs burning orbs */
  if (d >= 2 && chance(0.45)) { boss.shooter = true; boss.col = '#d8762a'; boss.fireT = 1.1; }
  const aura = new THREE.Mesh(bossAuraGeo, new THREE.MeshBasicMaterial({
    color: boss.shooter ? 0xe2b657 : 0xff5d3d, transparent: true, opacity: 0.72,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  aura.rotation.x = -Math.PI / 2;
  scene.add(aura);
  boss.aura = aura;
  enemies.push(boss);
  zoneBanner.textContent = 'BOSS';
  zoneBanner.style.color = '#e25a32';
  zoneBanner.classList.remove('go');
  void zoneBanner.offsetWidth;
  zoneBanner.classList.add('go');
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
    const badge = makeSprite(BAR_ICON[kind], BAR_COL[kind]); badge.position.y = 1.95;
    grp.add(body, ring1, ring2, badge);
    grp.position.set(wx(b.x), 0, wz(b.wy));
    scene.add(grp);
    b.grp = grp;
    barrels.push(b);
  }
  for (const b of barrels) if (!b.maxhp) b.maxhp = b.hp;
}

function spawnPickup(wy) {
  const kinds = ['rate', 'dmg', 'spread', 'heal', 'ward'];
  const kind = kinds[ri(0, kinds.length - 1)];
  const m = new THREE.Mesh(pickupProto, new THREE.MeshBasicMaterial({ color: PICKUP_COL[kind] }));
  scene.add(m);
  pickups.push({ x: rnd(road.x0 + 30, road.x1 - 30), wy, kind, taken: false, mesh: m, pop: 0 });
}

/* ---------------- combat helpers ---------------- */
function squadRadius() {
  const bulk = Math.min(22, Math.sqrt(Math.max(1, G.soldiers)) * 0.85);
  return clamp(halfPxCache * 0.82 + bulk, 20, 200);
}

function addSoldiers(n) {
  const prevPeak = G.peak;
  G.soldiers = clamp(Math.round(n), 0, 20000);
  G.peak = Math.max(G.peak, G.soldiers);
  while (G.mileIdx < MILES.length && G.peak >= MILES[G.mileIdx]) {
    if (MILES[G.mileIdx] > prevPeak) {
      floatText(G.armyX, G.camY, 'ARMY ' + MILES[G.mileIdx] + '!', '#ffd75d', 34, 4);
      sfx.great(); G.shake = Math.max(G.shake, 8);
    }
    G.mileIdx += 1;
  }
  if (G.soldiers <= 0) beginDeath();
}

function gateMid(g) {
  if (!g.moving) return g.mid;
  return g.mid + Math.sin(G.time * 1000 * g.moving.speed + g.moving.phase) * g.moving.amp;
}

function transformCount(count, p) {
  if (count <= 0) return 0;
  if (p.t === 'add') return count + p.v;
  if (p.t === 'sub') return Math.max(0, count - p.v);
  if (p.t === 'mul') return count * p.v;
  if (p.t === 'div') return count / p.v;
  return count;
}
function applyGate(g) {
  const mid = gateMid(g);
  const army = G.soldiers;
  const shown = Math.min(army, 180);
  let left = 0, counted = 0;
  if (bodyN > 1) {
    counted = bodyN;
    for (let i = 0; i < bodyN; i++) if (G.armyX + bodyX[i] < mid) left++;
  } else {
    const offs = formation(shown);
    counted = offs.length;
    for (const o of offs) if (G.armyX + o.x < mid) left++;
  }
  let lFrac = left / counted, rFrac = 1 - lFrac;
  if (lFrac < 0.08) { lFrac = 0; rFrac = 1; }
  else if (rFrac < 0.08) { rFrac = 0; lFrac = 1; }
  const lp = g.panels[0], rp = g.panels[1];
  let nl = transformCount(army * lFrac, lp);
  let nr = transformCount(army * rFrac, rp);
  let gunUp = false;
  if (lp.t === 'gun' && lFrac > 0) gunUp = true;
  if (rp.t === 'gun' && rFrac > 0) gunUp = true;
  let after = Math.max(0, Math.round(nl + nr));
  /* the first stretch is a tutorial: a wrong gate hurts but never ends the run */
  if (G.dist < 250 && after < 5) after = Math.min(army, 5);
  const delta = after - army;
  if (after < army) G.cause = 'A BAD GATE';
  addSoldiers(after);
  const split = lFrac > 0.08 && rFrac > 0.08;
  const good = gunUp || delta >= 0;
  if (good) G.streak += 1; else G.streak = 0;
  G.gateStreakBest = Math.max(G.gateStreakBest, G.streak);
  if (G.streak >= 3 && good) floatText(G.armyX, G.camY + 60, G.streak + ' IN A ROW!', '#7dff9b', 18, 4.4);
  if (gunUp) weaponUp();
  if (good && G.skills.overdrive) G.overT = 2.4 + G.skills.overdrive * 0.8;
  if (good && G.skills.warcry) {
    const extra = 4 * G.skills.warcry;
    addSoldiers(G.soldiers + extra);
    floatText(G.armyX, G.camY + 28, 'WARCRY +' + extra, '#f3ecdf', 20, 3);
  }
  const lab = gunUp && delta === 0 ? 'WEAPON UP!' : ((delta >= 0 ? '+' : '') + delta);
  const tag = split ? (gateLabel(lp) + ' | ' + gateLabel(rp) + '  ') : '';
  floatText(G.armyX, G.camY + 10, tag + lab,
    good ? '#ffd75d' : '#ff5d6a', split || gunUp ? 26 : 24, 3.4);
  if (good) (delta > army || gunUp ? sfx.great : sfx.good)();
  else sfx.bad();
  g.punch = 1;
  G.shake = Math.min(16, Math.max(G.shake, split ? 6 : 4));
  fovKick = Math.min(fovKick + (good ? 5 : 3), 10);
  for (let i = 0; i < 18; i++) parts.push(mkPart(G.armyX + rnd(-30, 30), G.camY + rnd(-10, 30), good ? '#7dff9b' : '#ff5d6a'));
  ringT = 0; ringMat.color.set(good ? '#7dff9b' : '#ff5d6a');
  if (g.grp) { for (const m of g.meshes) m.material.opacity = 0.25; for (const f of g.frames) f.material.opacity = 0.12; }
  vib(good ? 18 : 45);
}
function magLevel() { return (G.skills.magnet || 0) + (META.up.magnet || 0) * 0.5; }
function armorFrac() {
  return Math.min(0.55, (G.skills.iron || 0) * 0.12 + (META.up.armor || 0) * 0.05);
}
let clashSfx = 0;
function clashTick(m) {
  for (let k = 0; k < 4 && parts.length < MAXP - 6; k++)
    parts.push(mkPart(m.x + rnd(-m.hw * 0.7, m.hw * 0.7), G.camY + sr0() * 0.4 + rnd(-6, 10), k % 2 ? '#ff5d6a' : '#5db2ff'));
  if (chance(0.35)) flingSoldier();
  if (chance(0.5)) {
    const u = m.units[mobVisible(m) - 1];
    if (u) deadEnemies.push({ x: m.x + u.ox, wy: m.wy + u.oy, kind: 'runner', col: '#e8485a', s: 0.45, t: 0,
      vx: rnd(-60, 60), vwy: rnd(40, 90), y: 0.4, vy: rnd(3, 5.5), spin: rnd(-8, 8) });
    while (deadEnemies.length > 30) deadEnemies.shift();
  }
  G.shake = Math.max(G.shake, 3.5);
  if (chance(0.3)) dmgFlash();
  if (clashSfx <= 0) { clashSfx = 0.07; tone(180 + Math.random() * 90, 0.05, 'square', 0.035, 90); }
}
function sr0() { return squadRadius(); }
function loseSoldiers(n, cause) {
  if (cause) G.cause = cause;
  n = Math.max(0, Math.round(n));
  if (n <= 0) return;
  const arm = armorFrac();
  if (arm > 0) n = Math.max(1, Math.round(n * (1 - arm)));
  if (G.shield > 0) {
    G.shield -= 1;
    floatText(G.armyX, G.camY + 18, 'WARD', '#f3ecdf', 22, 3.2);
    sfx.power();
    ringT = 0; ringMat.color.set('#f3ecdf');
    return;
  }
  addSoldiers(G.soldiers - n);
}

function bannerFlash(text, color) {
  zoneBanner.textContent = text;
  zoneBanner.style.color = color || '';
  zoneBanner.classList.remove('go');
  void zoneBanner.offsetWidth;
  zoneBanner.classList.add('go');
  zoneBanner.style.opacity = '1';
  clearTimeout(bannerT);
  bannerT = setTimeout(() => { zoneBanner.style.opacity = '0'; }, 1500);
  setTimeout(() => { if (zoneBanner.style.opacity === '0') zoneBanner.style.color = ''; }, 1900);
}
let bannerT = null;
function showHint(text, secs) {
  if (!hintEl) return;
  hintEl.textContent = text;
  hintT = secs;
}
function hitstop(t) { G.slow = Math.max(G.slow, t); }
function vib(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }
const vigEl = document.getElementById('vignette');
let vigT = null, lastDanger = false;
function dmgFlash() {
  const v = document.getElementById('vignette');
  if (!v) return;
  v.style.opacity = '1';
  clearTimeout(vigT);
  vigT = setTimeout(() => {
    if (v.classList.contains('doom')) return;
    v.style.opacity = '0';
  }, 70);
}

/* --- music ---
   A 4-bar loop in A minor (Am F C G), shifted up a step per zone.
   Notes are scheduled on the audio clock a little ahead of time, so the
   groove doesn't wobble with frame hitches the way setInterval does.
   Layers: kick + clap + hats, a moving bassline, a soft chord stab, and
   an arpeggio that only plays when a mob or boss is close. */
let musTimer = null, musStep = 0, musNext = 0, musicHeat = 0;
const STEP = 60 / 116 / 4;                    // 16th notes at 116 bpm
const CHORDS = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];   // Am F C G as semitones from A
const BASSLINE = [0, null, 0, 12, null, 0, 7, null, 0, null, 12, 0, null, 7, 5, 3];
const ZONE_KEY = [0, 2, -2, 3, 5];
const hz = (semi) => 110 * Math.pow(2, semi / 12);
function musicStep(step, at) {
  const s16 = step % 16, bar = Math.floor(step / 16) % 4;
  const key = ZONE_KEY[Math.max(0, zoneIdx) % ZONE_KEY.length];
  const ch = CHORDS[bar];
  const o = { at };
  /* drums */
  if (s16 % 4 === 0) { voice(150, 0.11, 'sine', 0.16, 42, o); }
  if (s16 === 4 || s16 === 12) hiss(0.09, 0.05, 'bandpass', 1800, 900, 0.9, o);
  if (s16 % 2 === 1) hiss(0.025, G.soldiers > 120 ? 0.018 : 0.011, 'highpass', 7000, 0, 0.7, o);
  /* bass: root of the bar's chord, sidestepping on the off-beats */
  const b = BASSLINE[s16];
  if (b !== null) {
    const f = hz(key + ch[0] + b - 24);
    voice(f, STEP * 1.6, 'triangle', 0.075, 0, o);
    voice(f, STEP * 1.2, 'sawtooth', 0.012, 0, o);
  }
  /* chord stab on the "and" of beat 2 and 4 */
  if (s16 === 6 || s16 === 14) for (const n of ch) voice(hz(key + n + 12), 0.16, 'triangle', 0.016, 0, { at, attack: 0.012 });
  /* tension arpeggio */
  if (musicHeat > 0.5) {
    const n = ch[s16 % 3] + (s16 % 6 > 2 ? 24 : 12);
    voice(hz(key + n + 12), 0.08, 'square', 0.01 + 0.006 * musicHeat, 0, o);
  }
}
function musicStart() {
  if (musTimer || !AC) return;
  musStep = 0;
  musNext = AC.currentTime + 0.06;
  musTimer = setInterval(() => {
    if (!AC) return;
    if (muted || G.mode !== 'run' || document.hidden) { musNext = AC.currentTime + 0.06; return; }
    const ahead = AC.currentTime + 0.14;
    if (musNext < AC.currentTime - 0.2) musNext = AC.currentTime + 0.02;
    while (musNext < ahead) {
      musicStep(musStep, Math.max(0, musNext - AC.currentTime));
      musNext += STEP;
      musStep++;
    }
  }, 40);
}
function musicStop() { clearInterval(musTimer); musTimer = null; }

function weaponUp() {
  G.gunUps += 1;
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
  deadEnemies.push({ x: e.x, wy: e.wy, kind: e.kind, col: e.col, s: e._s || (e.boss ? 1.1 : 0.5), t: 0,
    vx: rnd(-55, 55), vwy: rnd(25, 65), y: e.boss ? 1.2 : 0.4, vy: rnd(3.2, 6) * (e.boss ? 1.35 : 1), spin: rnd(-7, 7) });
  if (deadEnemies.length > 26) deadEnemies.shift();
}
const deadSoldiers = [];
function flingSoldier() {
  deadSoldiers.push({ x: G.armyX + rnd(-18, 18), wy: G.camY + rnd(0, 22),
    y: 0.45, vy: rnd(2.6, 4.6), vx: rnd(-45, 45), vwy: -rnd(35, 75), spin: rnd(-8, 8), t: 0 });
  if (deadSoldiers.length > MAXDEAD) deadSoldiers.shift();
}
function flingOff(px) {
  const side = px < road.x0 + 8 ? -1 : 1;
  deadSoldiers.push({
    x: px, wy: G.camY + rnd(-8, 26), y: 0.62, vy: rnd(0.4, 1.5),
    vx: side * rnd(90, 160), vwy: rnd(-16, 20), spin: side * rnd(5, 11), t: 0, off: true,
  });
  if (deadSoldiers.length > MAXDEAD) deadSoldiers.shift();
}
let edgeDanger = 0;

/* ---------------- game flow ---------------- */
function startGame() {
  G.mode = 'run'; G.camY = 0; G.speed = SPEED_BASE; shownArmy = -1;
  G.armyX = LW / 2; aimX = LW / 2; aimForm = 0; G.form = 0; formKey = ''; bodyN = 0; dragAxis = 0;
  G.soldiers = 10 + META.up.army * 5; G.kills = 0; G.dist = 0; G.level = 1; G.peak = G.soldiers;
  G.tier = META.up.gun; G.upDmg = 0; G.upRate = 0; G.upSpread = 0;
  G.streak = 0; G.killChain = 0; G.killChainT = 0; G.mileIdx = 0;
  G.shake = 0; G.slow = 0;
  G.shield = 0; G.overT = 0; G.skillPicks = 0; G.skills = {};
  armyRoll = G.soldiers;
  G.coinsRun = 0; G.coinsPicked = 0; G.coinsPickedVal = 0; G.bonusTotal = 0; G.gunUps = 0; G.missionCoins = 0; G.coinFrac = 0; G.bonusPaid = 0; G.time = 0; G.cause = ''; G.mobsBeaten = 0; G.bossKills = 0; G.wallsBroken = 0; G.gateStreakBest = 0;
  clearWorld();
  nextY = LH * 0.55; firstMob = false; nextBand = 320; bossCounter = 0; gatesSpawned = 0; fireAcc = 0; drainAcc = 0; fallAcc = 0;
  hintT = META.runs < 3 ? 4.5 : 0; zoneIdx = -1;
  if (hintEl) hintEl.textContent = document.body.classList.contains('touch') ? 'swipe sideways to steer · up for a column · down to spread wide' : '← → steer · ↑ column · ↓ spread wide'; distMark = 0; revived = false; lastLevel = 1; bossIntro = false; deathT = 0;
  startOv.style.display = 'none'; overOv.style.display = 'none'; overOv.classList.remove('on');
  if (vigEl) { vigEl.classList.remove('doom'); vigEl.style.opacity = '0'; }
  if (skillOv) skillOv.style.display = 'none';
  if (shopOv) shopOv.style.display = 'none';
  if (installCard) installCard.style.display = 'none';
  document.body.classList.remove('menu');
  rollMissions();
  for (const m of META.missions) m.isNew = false;
  META.runs += 1;
  bestFlagPassed = G.best <= 0;
  camIntro = 1;
  floatText(LW / 2, LH * 0.3, 'GO!', '#f3ecdf', 46, 2.2);
  sfx.power();
  musicStart();
}
function skillLine() {
  let h = '';
  if (G.shield > 0) h += `<span class="ward">${icon('shield')}${G.shield}</span>`;
  for (const sk of SKILLS) {
    const n = G.skills[sk.id] || 0;
    if (!n || sk.id === 'shield') continue;
    h += `<span>${icon(sk.icon)}${n > 1 ? n : ''}</span>`;
  }
  if (G.overT > 0.15) h += `<span style="color:#ffcc33;border-color:#ffcc33">${icon('chevrons')}</span>`;
  return h;
}
function offerSkills() {
  if (!skillOv || !skillCards) return;
  const pool = SKILLS.filter(s => (G.skills[s.id] || 0) < s.max);
  if (!pool.length) return;
  const bag = pool.slice();
  const picks = [];
  while (picks.length < 3 && bag.length) picks.push(bag.splice(ri(0, bag.length - 1), 1)[0]);
  skillCards.innerHTML = '';
  for (const s of picks) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'skillCard';
    const st = G.skills[s.id] || 0;
    let pips = '';
    for (let k = 0; k < s.max; k++) pips += `<u class="${k < st ? 'f' : k === st ? 'n' : ''}"></u>`;
    btn.style.setProperty('--sc', s.col);
    btn.innerHTML = `<i>${icon(s.icon)}</i><b>${s.name}</b><span>${s.desc}</span><div class="pips">${pips}</div>` +
      `<em class="${st ? 'up' : ''}">${st ? 'LV ' + (st + 1) : 'NEW'}</em><kbd>${picks.indexOf(s) + 1}</kbd>`;
    btn.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      chooseSkill(s.id);
    });
    skillCards.appendChild(btn);
  }
  const head = document.getElementById('skillHead');
  if (head) head.textContent = 'LEVEL ' + G.level + '!';
  skillOv.style.display = 'flex';
  G.mode = 'pick';
  skillIds = picks.map((p) => p.id);
  sfx.power();
}
function chooseSkill(id) {
  if (G.mode !== 'pick') return;
  G.skills[id] = (G.skills[id] || 0) + 1;
  G.skillPicks += 1;
  if (id === 'shield') G.shield = Math.min(5, G.shield + 1);
  if (id === 'dmg') G.upDmg += 1;
  const sk = SKILLS.find(s => s.id === id);
  if (skillOv) skillOv.style.display = 'none';
  G.mode = 'run';
  floatText(G.armyX, G.camY + 24, (sk ? sk.name : 'SKILL') + '!', '#e2b657', 26, 3.6);
  sfx.great();
  ringT = 0; ringMat.color.set('#e2b657');
}

function clearWorld() {
  for (const g of gates) removeGate(g);
  for (const w of walls) { scene.remove(w.mesh); w.label.remove(); }
  for (const e of enemies) { e.label.remove(); if (e.aura) scene.remove(e.aura); }
  for (const b of barrels) { scene.remove(b.grp); b.label.remove(); }
  for (const p of pickups) scene.remove(p.mesh);
  for (const r of rewards) scene.remove(r.mesh);
  for (const h of hazards) scene.remove(h.grp);
  for (const m of mobs) m.label.remove();
  for (const f of floats) f.el.remove();
  gates = []; enemies = []; walls = []; pickups = []; barrels = []; hazards = [];
  bullets = []; parts = []; floats = []; rewards = []; ebullets = []; coins = []; mobs = [];
  deadEnemies.length = 0; deadSoldiers.length = 0; scorches.length = 0;
  labelsEl.innerHTML = ''; floatsEl.innerHTML = '';
  labelsEl.appendChild(bestLabel);
}

function missionHTML(showNew) {
  let h = '';
  const live = G.mode !== 'menu';
  for (const m of META.missions) {
    const goal = missionGoal(m);
    const val = Math.min(goal, m.done ? goal : (live ? missionValue(m.type) : 0));
    const pct = Math.round((val / goal) * 100);
    const sub = live ? (m.done ? 'Done!' + nextTxt(m) : fmtNum(val) + ' / ' + fmtNum(goal)) : '';
    h += `<div class="ms${m.done ? ' done' : ''}"><div class="mi">${icon(m.done ? 'check' : MISSION_ICON[m.type])}</div>` +
      `<div class="mt">${showNew && m.isNew ? '<span class="nw">NEW</span>' : ''}${MISSION_DEFS[m.type].text(goal)}` +
      (sub ? `<span class="pg">${sub}</span>` : '') +
      (live && !m.done ? `<div class="bar"><i style="width:${pct}%"></i></div>` : '') +
      `</div><div class="rw">+${missionReward(m)}${COIN}</div></div>`;
  }
  return h ? '<h3>MISSIONS</h3>' + h : '';
}
function nextTxt(m) {
  const d = MISSION_DEFS[m.type], l = (META.mlv[m.type] || 0) + 1;
  return l < d.steps.length ? ' Next up: ' + d.text(d.steps[l]).toLowerCase() : '';
}
function reviveCost() { return Math.max(30, Math.round(G.dist / 8)); }
function gameOver() {
  if (G.mode === 'over') return;
  G.mode = 'over';
  overAt = performance.now();
  musicStop();
  const d = Math.floor(G.dist);
  const prevBest = G.best;
  const isBest = d > G.best;
  if (isBest) G.best = d;
  const bonus = Math.floor(((G.dist - G.bonusPaid) / 20) * (1 + 0.75 * (G.skills.fortune || 0)) * coinMult());
  G.bonusPaid = G.dist;
  G.coins += bonus;
  G.coinsRun += bonus;
  G.bonusTotal += bonus;
  if (overCause) overCause.textContent = G.cause || 'WIPED OUT';
  const gap = prevBest - d;
  const sub = isBest && d > 0 ? '<span class="stamp">NEW BEST!</span>'
    : gap <= 120 ? `<b class="close">So close! ${gap}m short of your best</b>`
    : `<span class="chip">${icon('crown')}best ${G.best}m</span>`;
  const earned = G.coinsRun + G.missionCoins;
  overStats.innerHTML =
    `<div id="overDist">0m</div>${sub}` +
    `<div class="runline"><span class="chip">${icon('flag')}${fmtNum(G.peak)} peak</span>` +
    `<span class="chip">${icon('skull')}${G.mobsBeaten} mobs</span><span class="chip">${icon('crown')}${G.bossKills} bosses</span></div>` +
    `<div class="earn">+${earned}${COIN}<small>${G.coinsPickedVal} grabbed · ${G.bonusTotal} distance${G.missionCoins ? ' · ' + G.missionCoins + ' missions' : ''}</small></div>`;
  if (overMissions) overMissions.innerHTML = missionHTML(false);
  saveSave();
  overOv.style.display = 'flex';
  overOv.classList.remove('on');
  void overOv.offsetWidth;
  overOv.classList.add('on');
  /* count the distance up: cheap, and it makes every run feel like a score */
  const el = document.getElementById('overDist');
  const t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 900);
    if (el) el.textContent = Math.floor(d * (1 - Math.pow(1 - k, 3))) + 'm';
    if (k < 1 && G.mode === 'over') requestAnimationFrame(tick);
    else if (isBest && d > 0 && G.mode === 'over') { sfx.great(); vib(40); }
  };
  requestAnimationFrame(tick);
  if (reviveBtn) {
    const c = reviveCost();
    reviveBtn.style.display = revived ? 'none' : '';
    reviveBtn.disabled = G.coins < c;
    reviveBtn.innerHTML = `${icon('heart')}<span class="stack">REVIVE<small>${c} coins</small></span>`;
  }
  refreshBadges();
  renderQuickBuy();
  maybeOfferInstall();
  vib(30);
}
function beginDeath() {
  if (G.mode === 'dying' || G.mode === 'over') return;
  G.mode = 'dying';
  deathT = 0.78;
  G.shake = 18;
  G.slow = 0;
  clearTimeout(vigT);
  if (vigEl) { vigEl.classList.add('doom'); vigEl.style.opacity = '1'; }
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    deadSoldiers.push({
      x: G.armyX + rnd(-36, 36), wy: G.camY + rnd(-8, 36),
      y: rnd(0.4, 0.9), vy: rnd(3.8, 7.2),
      vx: side * rnd(50, 190), vwy: rnd(-30, 70),
      spin: rnd(-14, 14), t: 0, off: true, doom: true,
    });
  }
  while (deadSoldiers.length > MAXDEAD) deadSoldiers.shift();
  for (let i = 0; i < 22 && parts.length < partCap; i++)
    parts.push(mkPart(G.armyX + rnd(-40, 40), G.camY + rnd(-10, 30), i % 3 ? '#e25a32' : '#f3ecdf'));
  noise(0.5, 0.26); tone(64, 0.55, 'sine', 0.18, 28); vib(80);
}

function revive() {
  if (G.mode !== 'over' || revived) return;
  const c = reviveCost();
  if (G.coins < c) { sfx.bad(); return; }
  G.coins -= c; saveSave();
  revived = true;
  musicStart();
  for (const e of enemies) { e.label.remove(); if (e.aura) scene.remove(e.aura); }
  enemies.length = 0; deadEnemies.length = 0;
  for (const m of mobs) m.label.remove();
  mobs.length = 0; ebullets.length = 0;
  for (const h of hazards) if (Math.abs(h.wy - G.camY) < 700) { scene.remove(h.grp); h.gone = true; }
  hazards = hazards.filter((h) => !h.gone);
  for (const w of walls) if (Math.abs(w.wy - G.camY) < 500 && !w.dead) killWall(w, true);
  overOv.style.display = 'none';
  overOv.classList.remove('on');
  if (vigEl) { vigEl.classList.remove('doom'); vigEl.style.opacity = '0'; }
  G.mode = 'run';
  addSoldiers(Math.max(24, Math.ceil(G.peak * 0.5)));
  floatText(G.armyX, G.camY + 20, 'SECOND WIND!', '#e2b657', 30, 4);
  ringT = 0; ringMat.color.set('#e2b657');
  sfx.great(); vib(40);
}
if (reviveBtn) reviveBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault(); audio(); revive();
});
if (againBtn) againBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault(); audio();
  if (G.mode === 'over' && performance.now() - overAt > 350) startGame();
});
const shareBtn = document.getElementById('shareBtn');
if (shareBtn) shareBtn.innerHTML = icon('share');
if (shareBtn) shareBtn.addEventListener('pointerdown', async (e) => {
  e.stopPropagation(); e.preventDefault();
  const d = Math.floor(G.dist);
  const text = `I ran ${d}m in MOB RUN with a peak army of ${G.peak}. Beat that:`;
  const url = location.origin + location.pathname.replace(/index\.html$/, '');
  try {
    if (navigator.share) { await navigator.share({ title: 'MOB RUN', text, url }); return; }
    await navigator.clipboard.writeText(text + ' ' + url);
    shareBtn.innerHTML = icon('check');
    setTimeout(() => { shareBtn.innerHTML = icon('share'); }, 1500);
  } catch (err) { }
});
/* results screen: offer the cheapest upgrade you can afford, one tap to buy */
const quickBuy = document.getElementById('quickBuy');
function bestBuy() {
  let pick = null;
  for (const u of UPGRADES) {
    const l = META.up[u.id] || 0;
    if (l >= u.max) continue;
    const c = u.cost(l);
    if (c <= G.coins && (!pick || c < pick.c)) pick = { u, l, c };
  }
  return pick;
}
function renderQuickBuy() {
  if (!quickBuy) return;
  const b = bestBuy();
  quickBuy.classList.toggle('on', !!b);
  if (b) quickBuy.innerHTML = `${icon(b.u.icon)}<span class="stack">${b.u.name} → ${b.u.val(b.l + 1)}<small>upgrade for ${b.c} coins</small></span>`;
}
if (quickBuy) quickBuy.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault(); audio();
  const b = bestBuy();
  if (!b) return;
  G.coins -= b.c;
  META.up[b.u.id] = b.l + 1;
  saveSave();
  sfx.great(); vib(25);
  burstCoinsUI(quickBuy, -b.c);
  renderQuickBuy();
  if (reviveBtn) reviveBtn.disabled = G.coins < reviveCost();
});
function toggleMute() {
  muted = !muted;
  if (muteBtn) muteBtn.innerHTML = icon(muted ? 'mute' : 'sound');
  try { localStorage.setItem('mobrun_mute', muted ? '1' : '0'); } catch (e) { }
}
if (muteBtn) muteBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); audio(); toggleMute(); });
if (dailyBtn) dailyBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault(); audio();
  if (!dailyReady()) return;
  const dd = dailyAmount();
  META.daily = { last: todayKey(), streak: dd.streak };
  G.coins += dd.coins;
  saveSave();
  sfx.great(); vib(30);
  dailyBtn.classList.remove('on');
  burstCoinsUI(dailyBtn, dd.coins);
});
let toastT = null;
const toastQ = [];
function missionToast(text, reward, title) {
  toastQ.push({ text, reward, title });
  if (toastQ.length === 1) showToast();
}
function showToast() {
  if (!toastEl || !toastQ.length) return;
  const q = toastQ[0];
  toastEl.innerHTML = `<div class="chip">${icon(q.title ? 'crown' : 'check')}</div><div><b>${q.title || 'MISSION DONE'}</b>${q.text} · +${q.reward}${COIN}</div>`;
  toastEl.classList.toggle('rank', !!q.title);
  toastEl.classList.add('on');
  sfx.great(); vib(25);
  clearTimeout(toastT);
  toastT = setTimeout(() => {
    toastEl.classList.remove('on');
    setTimeout(() => { toastQ.shift(); showToast(); }, 380);
  }, 2300);
}
function burstCoinsUI(fromEl, amount) {
  const r = fromEl.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fl';
  el.innerHTML = (amount > 0 ? '+' : '') + amount + COIN;
  el.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top}px;color:#ffd75d;font-size:30px;z-index:20;position:fixed;transition:transform .9s cubic-bezier(.16,.84,.28,1),opacity .9s;`;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translate(-50%,-90px) scale(1.2)'; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 1000);
}

function coinMult() { return 1 + (META.up.coin || 0) * 0.15 + rankOf(META.done) * 0.05; }
function cheapestUpgrade() {
  let best = Infinity;
  for (const u of UPGRADES) { const l = META.up[u.id] || 0; if (l < u.max) best = Math.min(best, u.cost(l)); }
  return best;
}
function refreshBadges() {
  const can = G.coins >= cheapestUpgrade();
  for (const id of ['shopBadge', 'shopBadgeOver']) {
    const b = document.getElementById(id);
    if (b) b.classList.toggle('on', can);
  }
}
function refreshMeta() {
  if (bestLine) bestLine.innerHTML = `<span class="chip">${icon('crown')}${G.best ? 'best ' + G.best + 'm' : 'no best yet'}</span>` +
    `<span class="chip">${COIN}${fmtNum(G.coins)}</span>`;
  if (hudCoins) hudCoins.innerHTML = COIN + fmtNum(G.coins);
  refreshBadges();
}
function rankHTML() {
  const rk = rankOf(META.done);
  const maxed = rk >= RANKS.length - 1;
  const into = META.done - rk * 3;
  let pips = '';
  for (let i = 0; i < 3; i++) pips += `<u class="${maxed || i < into ? 'f' : ''}"></u>`;
  return `<span class="rk">${icon('crown')}${RANKS[rk]}</span><span class="pips">${pips}</span>` +
    `<span class="nx">${maxed ? 'top rank' : 'next: ' + RANKS[rk + 1]}</span>`;
}
function renderMenu() {
  document.body.classList.add('menu');
  const rankEl = document.getElementById('rankLine');
  if (rankEl) rankEl.innerHTML = rankHTML();
  fillMissions();
  if (menuMissions) menuMissions.innerHTML = missionHTML(true);
  if (dailyBtn) {
    const on = dailyReady();
    dailyBtn.classList.toggle('on', on);
    if (on) { const dd = dailyAmount(); dailyBtn.innerHTML = `${icon('gift')}<span class="stack">FREE GIFT +${dd.coins}<small>day ${dd.streak} of 7</small></span>`; }
  }
  refreshMeta();
}
function loadSave() {
  try {
    const raw = localStorage.getItem('mobrun_save');
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s.bank === 'number') G.coins = Math.max(0, s.bank | 0);
      G.owned = { recruit: true };
      if (s && s.owned && typeof s.owned === 'object') {
        for (const sk of SKINS) if (s.owned[sk.id]) G.owned[sk.id] = true;
      }
      if (s && typeof s.skin === 'string' && G.owned[s.skin]) G.skin = s.skin;
      if (s && typeof s.best === 'number') G.best = Math.max(G.best, s.best | 0);
      if (s && s.up && typeof s.up === 'object')
        for (const u of UPGRADES) META.up[u.id] = clamp((s.up[u.id] | 0), 0, u.max);
      if (s && s.mlv && typeof s.mlv === 'object')
        for (const k in MISSION_DEFS) META.mlv[k] = Math.max(0, s.mlv[k] | 0);
      if (s && Array.isArray(s.missions))
        META.missions = s.missions.filter((m) => m && MISSION_DEFS[m.type]).slice(0, 3)
          .map((m) => ({ type: m.type, done: !!m.done, isNew: false }));
      if (s && s.daily && typeof s.daily.last === 'string') META.daily = { last: s.daily.last, streak: s.daily.streak | 0 };
      if (s && typeof s.done === 'number') META.done = s.done | 0;
      if (s && typeof s.runs === 'number') META.runs = s.runs | 0;
      if (s && s.seenMob) META.seenMob = true;
    }
    const legacy = parseInt(localStorage.getItem('mobrun_best') || '0', 10) || 0;
    if (legacy > G.best) G.best = legacy;
    muted = localStorage.getItem('mobrun_mute') === '1';
    if (muteBtn) muteBtn.innerHTML = icon(muted ? 'mute' : 'sound');
  } catch (e) { }
  /* finished-but-unrolled missions (tab closed mid-run) roll now */
  rollMissions();
  renderMenu();
}
function saveSave() {
  saveT = 0;
  try {
    localStorage.setItem('mobrun_save', JSON.stringify({
      bank: G.coins | 0, skin: G.skin, owned: G.owned, best: G.best | 0,
      up: META.up, mlv: META.mlv, done: META.done, runs: META.runs, daily: META.daily, seenMob: META.seenMob,
      missions: META.missions.map((m) => ({ type: m.type, done: m.done })),
    }));
    localStorage.setItem('mobrun_best', String(G.best | 0));
  } catch (e) { }
  refreshMeta();
}
function touchSave() {
  if ((G.coins % 5) === 0) saveSave();
  else saveT = 0.45;
}
function skinNow() { return SKINS.find((s) => s.id === G.skin) || SKINS[0]; }
function paintDirty() { paintedSkin = ''; }
function renderShop() {
  if (!shopGrid) return;
  if (shopCoins) shopCoins.innerHTML = COIN + G.coins;
  if (upGrid) {
    upGrid.innerHTML = '';
    for (const u of UPGRADES) {
      const l = META.up[u.id] || 0;
      const maxed = l >= u.max;
      const cost = maxed ? 0 : u.cost(l);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'upCard' + (maxed ? ' maxed' : G.coins >= cost ? ' can' : ' broke');
      let pips = '';
      for (let k = 0; k < u.max; k++) pips += `<u class="${k < l ? 'f' : ''}"></u>`;
      card.style.setProperty('--uc', u.col);
      card.innerHTML = `<i>${icon(u.icon)}</i><div class="mid"><b>${u.name}</b><span>${u.desc}<br><b class="v">${u.val(l)}</b>${maxed ? '' : ' → <b class="v nx">' + u.val(l + 1) + '</b>'}</span><div class="pips">${pips}</div></div>` +
        `<div class="price">${maxed ? 'MAX' : cost + COIN}</div>`;
      card.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        audio();
        if (maxed) return;
        if (G.coins < cost) { sfx.bad(); card.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 180 }); return; }
        G.coins -= cost;
        META.up[u.id] = l + 1;
        saveSave();
        sfx.great(); vib(25);
        renderShop();
      });
      upGrid.appendChild(card);
    }
  }
  shopGrid.innerHTML = '';
  for (const sk of SKINS) {
    const owned = !!G.owned[sk.id];
    const on = G.skin === sk.id;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'skinCard' + (on ? ' on' : '') + (!owned && G.coins < sk.price ? ' broke' : '');
    const act = on ? 'ON' : owned ? 'USE' : sk.price + COIN;
    card.innerHTML = `<i style="color:${sk.body}">${icon('run')}</i><b>${sk.name}</b><span>${act}</span>`;
    card.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      audio();
      if (on) return;
      if (!owned) {
        if (G.coins < sk.price) { sfx.bad(); return; }
        G.coins -= sk.price;
        G.owned[sk.id] = true;
      }
      G.skin = sk.id;
      saveSave();
      sfx.power();
      paintDirty();
      renderShop();
    });
    shopGrid.appendChild(card);
  }
}
function openShop(e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  audio();
  renderShop();
  if (shopOv) shopOv.style.display = 'flex';
}
function closeShop(e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  if (shopOv) shopOv.style.display = 'none';
  if (G.mode === 'menu') renderMenu();
  else refreshMeta();
  if (G.mode === 'over' && reviveBtn) reviveBtn.disabled = G.coins < reviveCost();
  if (G.mode === 'over') renderQuickBuy();
}
function maybeOfferInstall() {
  if (!installCard) return;
  const hide = () => { installCard.style.display = 'none'; };
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) { hide(); return; }
  let seen = false;
  try { seen = localStorage.getItem('mobrun_pwa_once') === '1'; } catch (e) { }
  if (seen) { hide(); return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const coarse = window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
  if (deferredInstall) {
    if (installHint) installHint.textContent = 'Keep MOB RUN on your home screen. It opens full screen, like an app.';
    if (installBtn) installBtn.style.display = '';
  } else if (ios) {
    if (installHint) installHint.textContent = 'On iPhone: tap Share, then Add to Home Screen.';
    if (installBtn) installBtn.style.display = 'none';
  } else if (coarse) {
    if (installHint) installHint.textContent = 'Open the browser menu and choose Install app, or Add to Home Screen.';
    if (installBtn) installBtn.style.display = 'none';
  } else { hide(); return; }
  try { localStorage.setItem('mobrun_pwa_once', '1'); } catch (e) { }
  installCard.style.display = 'block';
}
loadSave();
if (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches || window.innerWidth < 760) {
  if (hintEl) hintEl.textContent = 'swipe sideways to steer · up for a column · down to spread wide';
}

/* ---------------- update ---------------- */
function hurt(e, dmg) {
  if (e.boss && G.skills.execution) dmg *= 1 + G.skills.execution * 0.4;
  e.hp -= dmg;
  /* flash in short pulses so a monster under constant fire keeps its color */
  if (!(e.hitCD > 0)) { e.hitT = 0.07; e.hitCD = 0.22; }
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
    if ((G.skills.scavenge || 0) > 0 && Math.random() < 0.1 * G.skills.scavenge && coins.length < MAXCOIN)
      coins.push({ x: e.x + rnd(-10, 10), wy: e.wy, spin: rnd(0, 6) });
    /* combos pay: every 10 kills in a chain throws coins at the squad */
    if (G.killChain % 10 === 0) {
      const n = Math.min(6, G.killChain / 10);
      floatText(e.x, e.wy, 'RAMPAGE ×' + G.killChain, '#e2b657', 22 + Math.min(10, n * 2), 3);
      for (let i = 0; i < n && coins.length < MAXCOIN; i++)
        coins.push({ x: e.x + rnd(-20, 20), wy: e.wy + rnd(-10, 10), spin: rnd(0, 6), fly: 0.15 + i * 0.05 });
      if (n >= 3) tone(660 + n * 80, 0.12, 'square', 0.04);
    }
    if (e.boss) {
      sfx.boss(); sfx.fanfare(); G.shake = 14; G.slow = 0.45; vib(70); G.bossKills += 1;
      const reward = 25 + G.level * 10;
      floatText(e.x, e.wy, 'BOSS DOWN +' + reward, '#ffd75d', 30, 4);
      for (let i = 0; i < 16 && coins.length < MAXCOIN; i++)
        coins.push({ x: e.x + rnd(-50, 50), wy: e.wy + rnd(-30, 30), spin: rnd(0, 6), fly: 0.3 + i * 0.035 });
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
    if ((G.skills.chain || 0) > 0 && !e._chained) {
      const splash = 5 + G.skills.chain * 7;
      const rad = 64 + G.skills.chain * 22;
      let n = 0;
      for (const o of enemies) {
        if (o === e || o._dead || o.hp <= 0) continue;
        if (Math.hypot(o.x - e.x, o.wy - e.wy) > rad) continue;
        o._chained = true;
        hurt(o, splash);
        o._chained = false;
        if (++n >= 4) break;
      }
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
        if (e.wy - G.camY > -40 && e.wy - G.camY < LH * 1.4) hurt(e, 60);
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

function killWall(w, quiet) {
  w.dead = true; w.deadT = 0;
  w.label.style.display = 'none';
  if (quiet) return;
  G.wallsBroken += 1;
  sfx.power(); G.shake = 8;
  for (let i = 0; i < 26; i++) parts.push(mkPart(rnd(road.x0, road.x1), w.wy, '#b7c6e8'));
  floatText(w.cx, w.wy, 'WALL BROKEN', '#b7c6e8', 24, 3);
  w.label.style.display = 'none';
}

function takePickup(kind, x) {
  sfx.power();
  if (kind === 'rate') { G.upRate += 0.02; floatText(x, G.camY, 'FIRE RATE +', '#7de8ff', 21, 3.5); }
  if (kind === 'dmg') { G.upDmg += 1; floatText(x, G.camY, 'DAMAGE +1', '#ffd75d', 21, 3.5); }
  if (kind === 'spread') { G.upSpread = Math.min(3, G.upSpread + 1); floatText(x, G.camY, 'SPREAD +1', '#7dff9b', 21, 3.5); }
  if (kind === 'heal') { addSoldiers(G.soldiers + 15); floatText(x, G.camY, '+15 SOLDIERS', '#7dff9b', 21, 3.5); }
  if (kind === 'ward') { G.shield = Math.min(5, G.shield + 1); floatText(x, G.camY, 'WARD +1', '#f3ecdf', 21, 3.5); }
  if (kind === 'gold') { const g = ri(10, 24); addSoldiers(G.soldiers + g); floatText(x, G.camY, '+' + g + ' GOLD', '#ffd75d', 21, 3.5); }
  if (kind === 'weapon') weaponUp();
  if (kind === 'upgrade') { G.upRate += 0.015; G.upDmg += 1; floatText(x, G.camY, 'OVERCLOCK!', '#7de8ff', 23, 3.5); }
  for (let i = 0; i < 12; i++) parts.push(mkPart(x, G.camY + 10, '#7de8ff'));
}

function formation(n) {
  /* Width tracks the asphalt. A centered wide line fills the road;
     steering past the edge, or a narrower road later, drops soldiers. */
  n = Math.max(1, n | 0);
  const wide = (G.form + 1) * 0.5;
  const roadW = Math.max(120, road.x1 - road.x0);
  const span = roadW * (0.18 + wide * 0.66);
  const spY = (8 + (1 - wide) * 10) * Math.max(0.7, Math.min(1, roadW / 480));
  const aspect = Math.pow(2.6, G.form);
  let cols = Math.round(Math.sqrt(n) * aspect);
  cols = clamp(cols, 1, Math.min(n, wide > 0.72 ? 16 : 36));
  const body = n - 1;
  const rows = Math.max(1, Math.ceil(Math.max(1, body) / cols));
  /* small squads stay a tight knot; only big ones fill the road */
  const spX = cols <= 1 ? 0 : Math.min(span / (cols - 1), 22 + wide * 24);
  const out = new Array(n);
  out[0] = { x: 0, y: -((rows - 1) * spY) * 0.45 - spY * 0.9 };
  for (let i = 1; i < n; i++) {
    const r = Math.floor((i - 1) / cols);
    const rowCount = Math.min(cols, body - r * cols);
    const c = (i - 1) % cols;
    out[i] = {
      x: (c - (rowCount - 1) / 2) * spX,
      y: (r - (rows - 1) / 2) * spY,
    };
  }
  return out;
}
let formKey = '';
const CROWD = 220;
const bodyX = new Float32Array(CROWD), bodyY = new Float32Array(CROWD);
const bodyVX = new Float32Array(CROWD), bodyVY = new Float32Array(CROWD);
const bodyPh = new Float32Array(CROWD);
let bodyN = 0, crowdT = 0;
function stepBodies(dt) {
  const n = Math.max(1, Math.min(G.soldiers, visCap, CROWD, squadNow.length));
  if (bodyN < n) {
    for (let i = bodyN; i < n; i++) {
      const slot = squadNow[i] || squadNow[0];
      bodyX[i] = slot.x + rnd(-4, 4);
      bodyY[i] = slot.y + rnd(-3, 3);
      bodyVX[i] = rnd(-30, 30);
      bodyVY[i] = rnd(-18, 18);
      bodyPh[i] = rnd(0, 6.28);
    }
  }
  bodyN = n;
  crowdT += dt;
  const damp = Math.max(0, 1 - 3.4 * dt);
  for (let i = 0; i < n; i++) {
    const slot = squadNow[i] || squadNow[0];
    const pull = i === 0 ? 16 : 7;
    const biasX = i === 0 ? 0 : Math.sin(bodyPh[i]) * 8;
    const biasY = i === 0 ? 0 : Math.cos(bodyPh[i] * 1.7) * 6;
    bodyVX[i] = (bodyVX[i] + (slot.x + biasX - bodyX[i]) * pull * dt) * damp;
    bodyVY[i] = (bodyVY[i] + (slot.y + biasY - bodyY[i]) * pull * dt) * damp;
    if (i !== 0) {
      bodyVX[i] += Math.sin(crowdT * 2.1 + bodyPh[i]) * 90 * dt;
      bodyVY[i] += Math.cos(crowdT * 1.7 + bodyPh[i] * 1.6) * 70 * dt;
    }
    bodyX[i] += bodyVX[i] * dt;
    bodyY[i] += bodyVY[i] * dt;
  }
  const reach = 9;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const ri0 = i === 0 ? 8 : 4.2 + (bodyPh[i] % 1) * 2.4;
      for (let j = i + 1; j < n; j++) {
        let dx = bodyX[j] - bodyX[i];
        let dy = bodyY[j] - bodyY[i];
        const rj = j === 0 ? 8 : 4.2 + (bodyPh[j] % 1) * 2.4;
        const minD = ri0 + rj;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD) continue;
        let d = Math.sqrt(d2);
        if (d < 0.05) { dx = 0.6; dy = 0.25; d = 0.65; }
        const push = (minD - d) * 0.55;
        const nx = dx / d, ny = dy / d;
        const wi = i === 0 ? 0.2 : 0.5;
        const wj = j === 0 ? 0.2 : 0.5;
        bodyX[i] -= nx * push * wi * 2;
        bodyY[i] -= ny * push * wi * 2;
        bodyX[j] += nx * push * wj * 2;
        bodyY[j] += ny * push * wj * 2;
        bodyVX[i] -= nx * push * 3;
        bodyVY[i] -= ny * push * 3;
        bodyVX[j] += nx * push * 3;
        bodyVY[j] += ny * push * 3;
      }
    }
  }
  let h = 12;
  const slack = Math.max(5, Math.max(120, road.x1 - road.x0) * 0.045);
  for (let i = 0; i < n; i++) {
    const slot = squadNow[i] || squadNow[0];
    const lim = i === 0 ? Math.min(6, slack) : slack;
    const ox = bodyX[i] - slot.x, oy = bodyY[i] - slot.y;
    const d2 = ox * ox + oy * oy;
    if (d2 > lim * lim) {
      const d = Math.sqrt(d2);
      bodyX[i] = slot.x + ox / d * lim;
      bodyY[i] = slot.y + oy / d * lim;
      bodyVX[i] *= 0.4; bodyVY[i] *= 0.4;
    }
    h = Math.max(h, Math.abs(bodyX[i]));
  }
  halfPxCache = h;
}
function refreshFormation() {
  const shown = Math.max(1, Math.min(G.soldiers, visCap));
  const key = shown + ':' + G.form.toFixed(2) + ':' + ((road.x1 - road.x0) | 0);
  if (key === formKey && squadNow.length === shown) return;
  formKey = key;
  squadNow = formation(shown);
  let h = 12;
  for (const o of squadNow) h = Math.max(h, Math.abs(o.x));
  halfPxCache = h;
}
let squadNow = [{ x: 0, y: 0 }];

/* ---------------- frame ---------------- */
let last = performance.now();
const SIM = { on: false };
function setPause(on) {
  if (on && G.mode === 'run') {
    G.mode = 'paused';
    keys.left = keys.right = keys.up = keys.down = false;
    dragging = false; dragAxis = 0;
    if (pauseOv) pauseOv.style.display = 'flex';
    musicStop();
  } else if (!on && G.mode === 'paused') {
    G.mode = 'run';
    if (pauseOv) pauseOv.style.display = 'none';
    last = performance.now();
    musicStart();
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
window.addEventListener('blur', () => setPause(true));
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  let dt = Math.max(0, Math.min((now - last) / 1000, 0.05)); last = now;
  if (SIM.on) return;
  if (G.mode === 'dying') {
    deathT -= dt;
    G.shake = Math.max(0, G.shake - dt * 9);
    if (deathT <= 0) gameOver();
    draw(now);
    return;
  }
  /* attract mode: the road keeps rolling behind the menu */
  if (G.mode === 'menu') G.camY += 70 * dt;
  if (G.mode !== 'run') { draw(now); return; }
  if (G.slow > 0) { G.slow -= dt; dt *= 0.35; }
  update(dt);
  draw(now);
}
requestAnimationFrame(frame);

function update(dt) {
  if (parts.length > partCap) parts.splice(0, parts.length - partCap);
  hintT = Math.max(0, hintT - dt);
  if (coinSfx > 0) coinSfx -= dt;
  if (clashSfx > 0) clashSfx -= dt;
  if (ladderT > 0) ladderT -= dt;
  if (saveT > 0) { saveT -= dt; if (saveT <= 0) saveSave(); }
  if (G.overT > 0) G.overT = Math.max(0, G.overT - dt);
  G.time += dt;
  syncRoad();
  const keyX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const keyY = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (keyX) aimX = clampAim(aimX + keyX * latMax() * dt);
  if (keyY) aimForm = clamp(aimForm + keyY * 0.95 * dt, -1, 1);
  aimX = clampAim(aimX);
  const maxStep = latMax() * dt;
  G.armyX += clamp(aimX - G.armyX, -maxStep, maxStep);
  const formSp = 2.4 * (1 + (G.skills.quickstep || 0) * 0.5);
  G.form += clamp(aimForm - G.form, -formSp * dt, formSp * dt);
  refreshFormation();
  stepBodies(dt);
  const axVel = (G.armyX - prevArmyX) / Math.max(dt, 0.001);
  prevArmyX = G.armyX;
  bank += (clamp(-axVel * 0.00035, -0.055, 0.055) - bank) * Math.min(1, dt * 8);
  if (G.killChainT > 0) { G.killChainT -= dt; if (G.killChainT <= 0) G.killChain = 0; }

  let off = 0, near = 0;
  const crowd = bodyN;
  for (let i = 0; i < crowd; i++) {
    const px = G.armyX + bodyX[i];
    if (px < road.x0 + 1 || px > road.x1 - 1) off++;
    if (px < road.x0 + 34 || px > road.x1 - 34) near++;
  }
  edgeDanger = crowd ? near / crowd : 0;
  fallAcc += dt;
  if (off > 0 && fallAcc >= 0.12 && G.soldiers > 0) {
    fallAcc = 0;
    const per = G.soldiers / crowd;
    let loss = Math.max(1, Math.round(off * per * 0.22));
    loss = Math.max(1, Math.round(loss * (1 - Math.min(0.5, (G.skills.steady || 0) * 0.25))));
    loss = Math.min(loss, Math.ceil(G.soldiers * 0.14));
    loseSoldiers(loss, 'FELL OFF THE ROAD');
    let flung = 0;
    for (let i = 0; i < crowd; i++) {
      const px = G.armyX + bodyX[i];
      if (px >= road.x0 + 1 && px <= road.x1 - 1) continue;
      flingOff(px);
      if (++flung >= 3) break;
    }
    if (edgeWarn <= 0) {
      floatText(G.armyX, G.camY + 8, 'FALL', '#ff5d6a', 20, 2.4);
      edgeWarn = 0.75; sfx.hurt();
    }
  }
  if (edgeWarn > 0) edgeWarn -= dt;

  const ramp = 1 - Math.exp(-Math.max(0, G.dist) / 1150);
  G.speed = Math.min(SPEED_CAP, SPEED_BASE + (SPEED_CAP - SPEED_BASE) * Math.pow(ramp, 1.22));
  G.camY += G.speed * dt;
  G.dist = G.camY / 40;
  G.level = 1 + Math.floor(G.dist / 150);
  if (!bestFlagPassed && G.best > 0 && G.dist > G.best) {
    bestFlagPassed = true;
    floatText(G.armyX, G.camY + 40, 'NEW BEST!', '#ffd75d', 40, 4.6);
    sfx.fanfare();
    G.shake = Math.max(G.shake, 9); vib(60); fovKick = 10;
    for (let i = 0; i < 50 && parts.length < MAXP - 4; i++)
      parts.push(mkPart(G.armyX + rnd(-120, 120), G.camY + rnd(0, 80), ['#ffd75d', '#7dff9b', '#7de8ff', '#ff8d98'][i % 4]));
  }
  const dm = Math.floor(G.dist / 100);
  if (dm > distMark) { distMark = dm; floatText(LW / 2, G.camY + 46, dm * 100 + 'm!', '#e2b657', 22, 3.4); }
  let wantSkill = false;
  if (G.level > lastLevel) {
    const steps = G.level - lastLevel;
    lastLevel = G.level;
    const rally = 1 + (G.skills.rally || 0) * 0.45;
    const bonus = Math.max(5, Math.round(Math.ceil(G.soldiers * 0.1) * rally)) * steps;
    addSoldiers(G.soldiers + bonus);
    floatText(G.armyX, G.camY + 30, 'LEVEL UP +' + bonus, '#e2b657', 26, 3.8);
    sfx.great();
    wantSkill = true;
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
      zoneBanner.classList.remove('go');
      void zoneBanner.offsetWidth;
      zoneBanner.classList.add('go');
      zoneBanner.style.opacity = '1';
      setTimeout(() => { zoneBanner.style.opacity = '0'; }, 1400);
    }
  }

  schedule();
  if (!bossIntro && G.dist > 170) {
    bossIntro = true;
    spawnBoss(G.camY + Math.max(460, LH * 0.7));
  }

  /* squad firing */
  const wt = WT[G.tier];
  const shooters = Math.min(G.soldiers, Q.low ? 22 : Q.phone ? 32 : 60);
  const stand = (G.soldiers < 18 && G.skills.laststand) ? (1 + 0.22 * G.skills.laststand) : 1;
  const dmgPerBullet = (wt.dmg + G.upDmg) * Math.max(1, Math.ceil(G.soldiers / Math.max(1, shooters))) * stand;
  let rate = Math.max(0.04, wt.rate - G.upRate);
  rate *= 1 - Math.min(0.4, (G.skills.rate || 0) * 0.1);
  if (stand > 1) rate *= 1 - 0.1 * (G.skills.laststand || 0);
  if (G.overT > 0) rate *= 0.64;
  const spread = Math.min(7, wt.spread + (G.skills.split || 0) + (G.upSpread || 0));
  fireAcc += dt;
  const interval = rate / Math.max(1, shooters * 0.11);
  const muzzleWy = G.camY + 30;
  while (fireAcc >= interval && bullets.length < BULLET_CAP - spread) {
    fireAcc -= interval;
    const si = bodyN > 0 ? ri(0, bodyN - 1) : 0;
    const mx = G.armyX + (bodyN > 0 ? bodyX[si] : 0);
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
    for (const m of mobs) {
      if (m.dead) continue;
      const dy = m.wy - m.hd - muzzleWy;
      if (dy < -60 || dy > 1400) continue;
      const tx = clamp(mx, m.x - m.hw * 0.7, m.x + m.hw * 0.7);
      const d = Math.hypot(tx - mx, dy) * 0.9;
      if (d < best) { best = d; tgt = { x: tx, wy: m.wy - m.hd * 0.5 }; }
    }
    for (const w of walls) {
      if (w.dead) continue;
      const dy = w.wy - muzzleWy;
      if (dy < -50 || dy > 1400) continue;
      const tx = clamp(mx, w.x0 + 20, w.x1 - 20);
      const d = Math.abs(dy) + Math.abs(tx - mx) * 0.5;
      if (d < best) { best = d; tgt = { x: tx, wy: w.wy }; }
    }
    if (tgt) {
      const dx = tgt.x - mx, dy = tgt.wy - muzzleWy, len = Math.hypot(dx, dy) || 1;
      tvx = (dx / len) * 760; twy = (dy / len) * 760;
    }
    let shotDmg = dmgPerBullet, shotCol = wt.col, shotPulse = 0;
    if ((G.skills.crit || 0) > 0 && Math.random() < 0.07 * G.skills.crit) {
      shotDmg *= 2; shotCol = '#fff4c2'; shotPulse = 1;
    }
    for (let s = 0; s < spread; s++) {
      const focus = 1 - Math.min(0.55, (G.skills.focus || 0) * 0.2);
      const jit = ((s - (spread - 1) / 2) * 0.10 + rnd(-0.03, 0.03)) * focus;
      const cs = Math.cos(jit), sn = Math.sin(jit);
      bullets.push({ x: mx, wy: muzzleWy, vx: tvx * cs - twy * sn, vwy: tvx * sn + twy * cs,
        dmg: shotDmg, col: shotCol, len: wt.tl, wid: wt.tw || 1,
        pierce: G.skills.pierce || 0, pulse: shotPulse });
    }
    shootSfxAcc += 1;
    if (shootSfxAcc % 4 === 0) sfx.shoot();
    if (parts.length < MAXP - 24 && chance(0.4))
      parts.push({ x: mx, wy: muzzleWy, h: 0.55, vx: rnd(-15, 15), vwy: rnd(60, 140), vh: rnd(0.5, 1.5), t: 0, life: 0.14, color: '#fff2a8' });
    muzzleGlow = 1;
  }
  if (fireAcc > interval * 2) fireAcc = interval;
  if (bullets.length > BULLET_CAP) bullets.splice(0, bullets.length - BULLET_CAP);

  /* bullets — ×N becomes N separate shots, ÷N deletes shots for real */
  const sr = squadRadius();
  const born = [];
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const prevWy = b.wy;
    b.x += b.vx * dt; b.wy += b.vwy * dt;
    if (b.pulse) b.pulse = Math.max(0, b.pulse - dt * 3.4);
    if (b.wy < G.camY - 60 || b.wy > G.camY + 1500 || b.x < -40 || b.x > LW + 40) { bullets.splice(i, 1); continue; }
    /* crossing a gate really multiplies or deletes bullets — damage is per bullet */
    for (const g of gates) {
      if (g.id === b.lastGate || !(prevWy < g.wy && b.wy >= g.wy)) continue;
      b.lastGate = g.id;
      const p = (b.x < gateMid(g)) ? g.panels[0] : g.panels[1];
      if (p.t === 'mul') {
        const n = Math.max(2, Math.min(8, p.v | 0));
        const gap = 44, ang = 0.34, mid = (n - 1) / 2;
        const base = { x: b.x, vx: b.vx, vwy: b.vwy };
        for (let k = 0; k < n; k++) {
          const slot = k - mid;
          const a = slot * ang;
          const cs = Math.cos(a), sn = Math.sin(a);
          const vx = base.vx * cs - base.vwy * sn;
          const vwy = base.vx * sn + base.vwy * cs;
          const x = base.x + slot * gap;
          if (k === Math.round(mid)) {
            b.x = x; b.vx = vx; b.vwy = vwy;
            b.col = '#ffd75d'; b.pulse = 1.4;
            b.wid = Math.max(b.wid || 1, 1.35);
            b.len = Math.max(b.len || 1, 2.2);
          } else {
            born.push({
              x, wy: b.wy, vx, vwy, dmg: b.dmg, col: '#ffe57a',
              len: Math.max(b.len || 1, 2.2), wid: Math.max(b.wid || 1, 1.35),
              lastGate: g.id, pierce: b.pierce || 0, pulse: 1.4,
            });
          }
        }
        if (!p._ann) { p._ann = 1; floatText(b.x, b.wy, '×' + n, '#ffd75d', 22, 2.6); }
      } else if (p.t === 'div') {
        const v = Math.max(2, p.v | 0);
        p._n = (p._n | 0) + 1;
        if (p._n % v !== 0) {
          if (parts.length < partCap) parts.push(mkPart(b.x, b.wy, '#ff5d6a'));
          b.dmg = -1;
          break;
        }
        b.col = '#fff1f3'; b.pulse = 1.15;
        b.wid = Math.min(2.2, (b.wid || 1) * 1.25);
        if (!p._ann) { p._ann = 1; floatText(b.x, b.wy, '÷' + v, '#ff8d98', 22, 2.6); }
      } else if (p.t === 'add') { b.dmg += p.v * 0.25 + 1.5; b.col = '#7dff9b'; }
      else if (p.t === 'sub') { b.dmg -= p.v * 0.35 + 2; b.col = '#ff8d98'; }
      else if (p.t === 'gun') {
        b.dmg *= 1.35; b.vx *= 1.06; b.vwy *= 1.06; b.col = '#7de8ff';
        b.pierce = (b.pierce || 0) + 1; b.pulse = 1;
      }
      if (b.dmg > 0 && parts.length < MAXP - 40 && Math.random() < 0.22)
        parts.push(mkPart(b.x, b.wy, p.t === 'sub' || p.t === 'div' ? '#ff5d6a' : '#ffd75d'));
    }
    if (b.dmg <= 0) { if (bullets[i] === b) bullets.splice(i, 1); continue; }
    let hit = false;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      if (b.pierced) {
        let seen = false;
        for (let pi = 0; pi < b.pierced.length; pi++) if (b.pierced[pi] === e) { seen = true; break; }
        if (seen) continue;
      }
      const dA = e.wy - G.camY;
      if (dA < -(sr + 40) || dA > 1400) continue;
      const dx = b.x - e.x, dy = b.wy - e.wy;
      if (dx * dx + dy * dy < (e.r + 6) * (e.r + 6)) {
        hurt(e, b.dmg);
        if (!b.pierced) b.pierced = [];
        b.pierced.push(e);
        if ((b.pierce || 0) > 0) b.pierce -= 1;
        else hit = true;
        break;
      }
    }
    if (!hit) for (const m of mobs) {
      if (m.dead) continue;
      if (Math.abs(b.x - m.x) < m.hw && Math.abs(b.wy - m.wy) < m.hd + 6) { hurtMob(m, b.dmg); hit = true; break; }
    }
    if (!hit) for (const bar of barrels) {
      if (bar._dead) continue;
      const dx = b.x - bar.x, dy = b.wy - bar.wy;
      if (dx * dx + dy * dy < 20 * 20) { hitBarrel(bar, b.dmg); hit = true; break; }
    }
    if (!hit) for (const w of walls) {
      if (w.dead) continue;
      if (Math.abs(b.wy - w.wy) < 16 && b.x > w.x0 && b.x < w.x1) {
        w.hp -= b.dmg; hit = true;
        if (w.hp <= 0) killWall(w);
        break;
      }
    }
    if (hit) bullets.splice(i, 1);
  }
  if (born.length) {
    const overflow = bullets.length + born.length - BULLET_CAP;
    if (overflow > 0) bullets.splice(0, Math.min(overflow, bullets.length));
    for (let k = 0; k < born.length && bullets.length < BULLET_CAP; k++) bullets.push(born[k]);
  }

  /* enemy projectiles — dodgeable orbs from shooter bosses */
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const p = ebullets[i];
    p.t += dt; p.x += p.vx * dt; p.wy += p.vwy * dt;
    if (p.t > 7 || p.wy < G.camY - 140 || p.x < road.x0 - 80 || p.x > road.x1 + 80) { ebullets.splice(i, 1); continue; }
    const dx = p.x - G.armyX, dy = p.wy - G.camY, rr = sr * 0.8 + p.r;
    if (dx * dx + dy * dy < rr * rr) {
      loseSoldiers(Math.max(2, Math.ceil(G.soldiers * 0.07)), 'BOSS FIREBALL');
      for (let k = 0; k < 10 && parts.length < MAXP - 12; k++)
        parts.push(mkPart(p.x + rnd(-10, 10), p.wy + rnd(-8, 8), '#ff5d6a'));
      dmgFlash(); sfx.hurt(); vib(30); flingSoldier(); flingSoldier();
      ebullets.splice(i, 1);
    }
  }

  /* sprint dust */
  if (G.mode === 'run' && parts.length < MAXP - 4 && Math.random() < 0.35)
    parts.push({ x: G.armyX + rnd(-16, 16), wy: G.camY + rnd(-8, 6), h: 0.15,
      vx: rnd(-8, 8), vwy: -rnd(20, 50), vh: rnd(0.4, 1), t: 0, life: rnd(0.3, 0.6), color: '#7d88ab' });

  /* enemies drift toward the squad */
  drainAcc += dt;
  const drainTick = 0.32;
  const doDrain = drainAcc >= drainTick;
  let tickDmg = 0, bossDmg = 0;
  const drainCap = Math.max(1, Math.ceil(G.soldiers * 0.1));
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e._dead) { e.label.remove(); if (e.aura) scene.remove(e.aura); enemies.splice(i, 1); continue; }
    e.wy -= e.drift * dt;
    if (e.kind === 'leaper') {
      const dir = Math.sign(G.armyX - e.x) || 1;
      const burst = Math.abs(e.wy - G.camY) < 340 ? 200 : 64;
      e.x = clamp(e.x + dir * burst * dt, road.x0 - 24, road.x1 + 24);
    }
    e.pop = Math.min(1, e.pop + dt * 4);
    if (e.hitT) e.hitT -= dt;
    if (e.hitCD > 0) e.hitCD -= dt;
    if (e.kind === 'gold' && Math.random() < 0.22 && parts.length < MAXP - 4)
      parts.push(mkPart(e.x + rnd(-8, 8), e.wy + rnd(-6, 6), '#ffd75d'));
    if (e.roar) e.roar -= dt * 1.4;
    /* shooter bosses lob orbs at the squad while in range */
    if (e.shooter && !e._dead) {
      e.fireT -= dt;
      const bd = e.wy - G.camY;
      if (e.fireT <= 0 && bd < 780 && bd > 110 && ebullets.length < MAXEB - 2) {
        e.fireT = rnd(1.3, 1.9);
        const dx = G.armyX - e.x, dy = (G.camY + 8) - e.wy, len = Math.hypot(dx, dy) || 1;
        ebullets.push({ x: e.x, wy: e.wy, vx: dx / len * 290, vwy: dy / len * 290, r: 15, t: 0, col: '#e2b657' });
        tone(210, 0.13, 'sawtooth', 0.05, 120);
      }
    }
    if (e.wy < G.camY - 320) { e.label.remove(); if (e.aura) scene.remove(e.aura); enemies.splice(i, 1); continue; }
    const near = e.wy - G.camY < sr + e.r && e.wy - G.camY > -(sr + e.r + 90);
    e.attacking = near && Math.abs(e.x - G.armyX) < sr + e.r;
    if (e.attacking && doDrain) {
      if (e.boss) bossDmg += Math.max(3, Math.ceil(G.soldiers * 0.045));
      else tickDmg += e.drain;
      if (Math.random() < 0.45) parts.push(mkPart(e.x, G.camY + 10, '#5db2ff'));
      if (Math.random() < 0.35) sfx.hurt();
      if (Math.random() < 0.5) dmgFlash();
      vib(20);
      hurt(e, G.soldiers * 0.55 + 5);
      if (Math.random() < 0.55) flingSoldier();
    }
  }
  /* music heat: anything big within striking distance */
  let heat = 0;
  for (const m of mobs) if (!m.dead && m.wy - G.camY < 700) heat = Math.max(heat, m.clash ? 2 : 1);
  for (const e of enemies) if (e.boss && e.hp > 0 && e.wy - G.camY < 900) heat = Math.max(heat, 1.5);
  musicHeat = heat;

  /* rival mobs: march in, charge sideways, then trade 1:1 on contact */
  const armor = armorFrac();
  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i];
    if (m.dead) {
      m.deadT += dt;
      if (m.deadT > 0.2) { m.label.remove(); mobs.splice(i, 1); }
      continue;
    }
    m.pop = Math.min(1, m.pop + dt * 3);
    if (m.hitT > 0) m.hitT -= dt;
    if (m.hitCD > 0) m.hitCD -= dt;
    m.hw = mobHalfW(m);
    const ahead = m.wy - m.hd - G.camY;
    if (!m.clash) {
      m.wy -= 34 * dt;
      if (ahead < 620) {
        const chase = 38 + G.dist * 0.02;
        m.x += clamp(G.armyX - m.x, -chase * dt, chase * dt);
        m.x = clamp(m.x, road.x0 + m.hw * 0.5, road.x1 - m.hw * 0.5);
      }
      if (ahead < sr * 0.45 && ahead > -(m.hd * 2 + sr) && Math.abs(m.x - G.armyX) < m.hw + sr * 0.55) {
        m.clash = true; m.tick = 0; m.clashN = Math.min(m.count, G.soldiers);
        G.shake = Math.max(G.shake, 7); sfx.bad(); vib(30);
        floatText(m.x, G.camY + 40, 'CLASH!', '#ff8d6a', 24, 3);
      }
      if (m.wy < G.camY - 260) { m.label.remove(); mobs.splice(i, 1); continue; }
    }
    if (m.clash) {
      m.wy = G.camY + m.hd + sr * 0.35;
      m.x += (G.armyX - m.x) * Math.min(1, dt * 4);
      m.tick += dt;
      while (m.tick >= 0.05 && m.count > 0 && G.soldiers > 0) {
        m.tick -= 0.05;
        const k = Math.max(1, Math.ceil(Math.max(Math.min(m.count, G.soldiers) * 0.08, (m.clashN || 1) / 22)));
        const hitN = Math.min(k, m.count);
        m.count -= hitN; m.hp = Math.min(m.hp - hitN * m.uh, m.count * m.uh);
        G.kills += hitN;
        const lose = Math.max(1, Math.round(hitN * (1 - armor)));
        G.cause = 'OUTNUMBERED BY A MOB';
        addSoldiers(G.soldiers - lose);
        clashTick(m);
      }
      if (m.count <= 0) killMob(m, 'clash');
    }
  }

  /* environmental hazards chip away at the squad while it overlaps them.
     Hazards get their own, harsher cap — they are supposed to threaten. */
  let hazDmg = 0, hazCause = '';
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    if (h.dead) {
      h.deadT += dt;
      if (h.deadT > 0.6) { scene.remove(h.grp); hazards.splice(i, 1); }
      continue;
    }
    if (h.wy < G.camY - (h.len || 0) / 2 - 240) { scene.remove(h.grp); hazards.splice(i, 1); continue; }
    if (h.wy - G.camY > 1500 || h.wy < G.camY - 200) continue;
    if (h.kind === 'lava' && Math.random() < 0.3 && parts.length < MAXP - 6)
      parts.push({ x: h.x + rnd(-h.w / 2, h.w / 2), wy: h.wy + rnd(-h.len / 2, h.len / 2), h: 0.1,
        vx: 0, vwy: rnd(-8, 8), vh: rnd(1.5, 3.5), t: 0, life: rnd(0.4, 0.8), color: '#ff7a3d' });
    if (h.kind === 'saw' && Math.random() < 0.3 && parts.length < MAXP - 6)
      parts.push({ x: sawX(h) + rnd(-10, 10), wy: h.wy + rnd(-8, 8), h: 0.15,
        vx: rnd(-40, 40), vwy: rnd(-20, 20), vh: rnd(1, 4), t: 0, life: rnd(0.2, 0.45), color: '#ffd75d' });
    if (h.kind === 'meteor') {
      if (!h.armed && h.wy - G.camY < 560) { h.armed = true; h.tImpact = 1.15; }
      if (h.armed) {
        h.tImpact -= dt;
        if (Math.random() < 0.5 && parts.length < MAXP - 4)
          parts.push({ x: h.x + rnd(-8, 8), wy: h.wy, h: 28 * Math.max(0, h.tImpact / 1.15) + rnd(1, 4),
            vx: 0, vwy: 0, vh: 2.5, t: 0, life: 0.28, color: '#ffb03d' });
        if (h.tImpact <= 0) {
          h.dead = true; h.deadT = 0;
          sfx.boom(); G.shake = Math.max(G.shake, 10);
          addScorch(h.x, h.wy, 3.4);
          for (let k = 0; k < 24 && parts.length < MAXP - 26; k++)
            parts.push(mkPart(h.x + rnd(-30, 30), h.wy + rnd(-24, 24), '#ff9d5d'));
          const dd = Math.hypot(h.x - G.armyX, h.wy - G.camY);
          if (dd < h.r + sr) {
            const frac = clamp(1 - dd / (h.r + sr), 0.15, 1);
            loseSoldiers(Math.max(3, Math.ceil(G.soldiers * 0.4 * frac)), 'METEOR STRIKE');
            for (let k = 0; k < 4; k++) flingSoldier();
            dmgFlash(); vib(50);
          }
          for (const e of enemies)
            if (!e._dead && Math.hypot(e.x - h.x, e.wy - h.wy) < h.r + e.r) hurt(e, 45);
        }
      }
      continue;
    }
    if (h.kind === 'gap') {
      if (doDrain && Math.abs(h.wy - G.camY) < h.len / 2 + 8 && Math.abs(h.x - G.armyX) < h.w / 2 + sr * 0.3) {
        loseSoldiers(Math.max(2, Math.ceil(G.soldiers * 0.07)), 'FELL IN A PIT');
        flingOff(G.armyX);
        dmgFlash();
        if (Math.random() < 0.45) sfx.hurt();
      }
      continue;
    }
    if (!doDrain) continue;
    const touching = h.kind === 'lava'
      ? Math.abs(h.wy - G.camY) < h.len / 2 + sr * 0.5 && Math.abs(h.x - G.armyX) < h.w / 2 + sr * 0.55
      : h.kind === 'choke'
        ? Math.abs(h.wy - G.camY) < h.len / 2 + sr * 0.5 && Math.abs(G.armyX - h.gapX) + sr * 0.75 > h.gapW / 2
        : Math.hypot(sawX(h) - G.armyX, h.wy - G.camY) < h.r + sr * 0.75;
    if (touching) {
      hazDmg += h.drain;
      hazCause = h.kind === 'lava' ? 'BURNED IN LAVA' : h.kind === 'choke' ? 'CRUSHED IN A CHOKEPOINT' : 'SHREDDED BY A SAW';
      G.shake = Math.max(G.shake, 3);
      dmgFlash(); vib(25);
      if (Math.random() < 0.5) sfx.hurt();
      if (Math.random() < 0.6) flingSoldier();
      for (let k = 0; k < 5 && parts.length < MAXP - 6; k++)
        parts.push(mkPart(G.armyX + rnd(-sr * 0.6, sr * 0.6), G.camY + rnd(-6, 18), h.kind === 'lava' ? '#ff7a3d' : '#ff5d6a'));
    }
  }
  const guard = 1 - Math.min(0.55, (G.skills.bulwark || 0) * 0.18);
  if (doDrain && hazDmg > 0)
    loseSoldiers(Math.min(hazDmg, Math.max(2, Math.ceil(G.soldiers * 0.16))) * guard, hazCause);
  if (doDrain && (tickDmg > 0 || bossDmg > 0))
    loseSoldiers(Math.min(tickDmg + bossDmg, drainCap + bossDmg) * guard, bossDmg ? 'CRUSHED BY A BOSS' : 'OVERRUN BY MONSTERS');
  if (doDrain) drainAcc = 0;

  /* gates */
  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i];
    if (g.announce && g.wy - G.camY < 900) { g.announce = false; bannerFlash('GOLDEN GATE', '#ffd75d'); tone(1320, 0.1, 'sine', 0.05); }
    if (!g.passed && G.camY >= g.wy) { g.passed = true; applyGate(g); }
    if (g.wy < G.camY - 200) { removeGate(g); gates.splice(i, 1); }
  }

  /* walls */
  for (let i = walls.length - 1; i >= 0; i--) {
    const w = walls[i];
    if (w.dead) {
      w.deadT += dt;
      if (w.deadT > 0.75) { scene.remove(w.mesh); w.label.remove(); walls.splice(i, 1); }
      continue;
    }
    if (w.wy - G.camY < sr + 30 && G.armyX + sr * 0.6 > w.x0 && G.armyX - sr * 0.6 < w.x1) {
      if (doDrain) {
        loseSoldiers(Math.max(1, Math.ceil(G.soldiers * 0.12 * guard)), 'SMASHED INTO A WALL');
        G.shake = 5; flingSoldier();
      }
      w.hp -= G.soldiers * 6 * dt;
      if (w.hp <= 0) killWall(w);
    }
    if (w.wy < G.camY - 200) { scene.remove(w.mesh); w.label.remove(); walls.splice(i, 1); }
  }

  /* pickups */
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const reach = (sr + 14) * (1 + magLevel() * 0.9);
    if (Math.abs(p.wy - G.camY) < reach && Math.abs(p.x - G.armyX) < reach) {
      takePickup(p.kind, p.x); scene.remove(p.mesh); pickups.splice(i, 1); continue;
    }
    if (p.wy < G.camY - 160) { scene.remove(p.mesh); pickups.splice(i, 1); }
  }
  const mag = magLevel();
  const hoard = G.skills.hoard || 0;
  const reachX = halfPxCache * 0.92 + 18 + mag * 34 + hoard * 18;
  const reachY = 26 + mag * 40 + hoard * 12;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    if (c.fly !== undefined) {
      /* loot coins pop up, hang for a beat, then home in on the squad */
      c.fly -= dt;
      if (c.fly < 0) {
        const k = Math.min(1, dt * (6 - Math.max(-0.5, c.fly) * 8));
        c.x += (G.armyX - c.x) * k;
        c.wy += (G.camY + 10 - c.wy) * k;
      }
    } else if (mag && c.wy - G.camY < 320 && c.wy > G.camY - 30) {
      const pull = Math.min(1, dt * (2.1 + mag * 2.4));
      c.x += (G.armyX - c.x) * pull;
      if (c.wy - G.camY > 36) c.wy += (G.camY + 24 - c.wy) * pull * 0.55;
    }
    if ((c.fly === undefined || c.fly < 0) && c.wy - G.camY < reachY && c.wy - G.camY > -28 && Math.abs(c.x - G.armyX) < reachX) {
      G.coinFrac += (1 + (G.skills.greed || 0)) * coinMult();
      const gain = Math.floor(G.coinFrac);
      G.coinFrac -= gain;
      G.coins += gain; G.coinsRun += gain; G.coinsPicked += 1; G.coinsPickedVal += gain; touchSave();
      coinLadder();
      if (parts.length < partCap && Math.random() < 0.4) parts.push(mkPart(c.x, c.wy, '#ffd75d'));
      coins.splice(i, 1);
      continue;
    }
    if (c.wy < G.camY - 90 && c.fly === undefined) coins.splice(i, 1);
  }
  for (let i = rewards.length - 1; i >= 0; i--) {
    const r = rewards[i];
    r.t += dt * 2.2;
    const k = Math.min(1, r.t);
    const pull = k * (0.25 + magLevel() * 0.22);
    r.x += (G.armyX - r.x) * pull;
    r.wy += (G.camY + 10 - r.wy) * pull;
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
  if (parts.length > partCap) parts.splice(0, parts.length - partCap);
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
    if (enemies[i]._dead) { enemies[i].label.remove(); if (enemies[i].aura) scene.remove(enemies[i].aura); enemies.splice(i, 1); }
  }
  checkMissions();
  if (wantSkill && G.mode === 'run') offerSkills();
}

/* ---------------- draw ---------------- */
const dummy = new THREE.Object3D();
const tmpCol = new THREE.Color();
let soldierOffsets = [];
let soldierBirth = [];

let lastDraw = performance.now(), camIntro = 0;
function draw(now) {
  const t = now * 0.001;
  /* real frame time: animations run the same speed at 60, 90 or 120 Hz */
  const FD = Math.min(0.05, Math.max(0.001, (now - lastDraw) / 1000)) * (G.slow > 0 && G.mode === 'run' ? 0.35 : 1);
  lastDraw = now;
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
  shoulderMat.color.copy(curZone.ground).lerp(curZone.road, 0.42);
  roadMesh.scale.x = Math.max(0.25, (roadHalf * 2) / (ROADW + 1.6));
  roadStrips[0].position.x = -(roadHalf + 0.02);
  roadStrips[1].position.x = roadHalf + 0.02;
  grassMesh.material.color.copy(tmpCol.set(z.sky).lerp(col3(z.ground), 0.55));
  crownMesh.material.color.copy(tmpCol.set(z.post).lerp(col3(z.sky), 0.4));
  ruinMesh.material.color.copy(curZone.post);
  postMat.color.copy(curZone.post);
  dashMat.color.copy(curZone.dash);
  hemi.color.setHex(z.sky);
  domeMat.color.copy(tmpCol.set(z.sky).lerp(col3('#ffffff'), 0.3));
  horizonGlow.material.color.set(z.sky);
  stripMat.color.copy(edgeDanger > 0.18 ? tmpCol.set('#ff5d6a') : curZone.post);
  moon.material.color.copy(tmpCol.set(z.sky).lerp(col3('#ffffff'), 0.6));
  moteMat.color.copy(tmpCol.set(z.sky));
  patchMesh.material.color.copy(tmpCol.copy(curZone.ground).multiplyScalar(0.55));

  /* scorch decals */
  let sci = 0;
  for (let i = scorches.length - 1; i >= 0; i--) {
    const sc = scorches[i];
    sc.t += FD;
    if (sc.t > 5) { scorches.splice(i, 1); continue; }
    const sz = wz(sc.wy);
    if (sz > 14) continue;
    const f = 1 - sc.t / 5;
    dummy.position.set(wx(sc.x), 0.07, sz);
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
  /* run start: the camera swoops down from a high wide shot into the chase cam */
  if (camIntro > 0) camIntro = Math.max(0, camIntro - FD / 0.9);
  const swoop = camIntro * camIntro * (3 - 2 * camIntro);
  camera.position.set(axw * 0.55 + shx, 10.5 + shy + camZoom * 0.6 + swoop * 9, 12.5 + camZoom + swoop * 7);
  camera.lookAt(axw * 0.35, 1.0 - swoop * 0.5, -12 - swoop * 10);
  camera.rotateZ(bank);
  const fovT = 62 + fovKick + Math.max(0, G.speed - SPEED_BASE) * 0.02;
  if (Math.abs(camera.fov - fovT) > 0.01) { camera.fov += (fovT - camera.fov) * 0.12; camera.updateProjectionMatrix(); }
  starMat.opacity += (ZONE_STARS[zi] - starMat.opacity) * 0.05;
  warm.intensity = 26 + muzzleGlow * 46; muzzleGlow *= 0.8;
  const danger = G.mode === 'run' && G.soldiers > 0 && G.soldiers < 12;
  if (vigEl && !vigEl.classList.contains('doom')) {
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
      dummy.position.set(sx * (roadHalf + 0.55), 0.55, zPos);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postMesh.setMatrixAt(pi++, dummy.matrix);
    }
  }
  postMesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < NDASH; i++) {
    const zPos = -((i * DASH_GAP + scroll) % (NDASH * DASH_GAP)) + 6;
    dummy.position.set(0, 0.07, zPos);
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(i, dummy.matrix);
  }
  dashMesh.instanceMatrix.needsUpdate = true;

  /* gate shockwave */
  if (ringT < 0.55) {
    ringT += FD;
    const rk = ringT / 0.55;
    ring.position.x = axw;
    ring.scale.setScalar(1.2 + rk * 9);
    ringMat.opacity = Math.max(0, 0.75 * (1 - rk));
  } else if (G.shield > 0 && (G.mode === 'run' || G.mode === 'pick')) {
    ring.position.set(axw, 0.08, 0.35);
    ring.scale.setScalar(Math.max(1.3, squadRadius() * K * 0.85));
    ringMat.color.set('#f3ecdf');
    ringMat.opacity = 0.2 + Math.sin(t * 5) * 0.07;
  } else ringMat.opacity = 0;

  /* speed lines */
  {
    const target = clamp((G.speed - 220) / 160, 0, 0.45);
    speedLineMesh.material.opacity += (target - speedLineMesh.material.opacity) * 0.05;
    for (let i = 0; i < NSL; i++) {
      const sl = slSeed[i];
      const zPos = -(((sl.off + scroll * 2.4) % 120) - 10);
      dummy.position.set(sl.x, sl.h, zPos);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      speedLineMesh.setMatrixAt(i, dummy.matrix);
    }
    speedLineMesh.instanceMatrix.needsUpdate = true;
  }

  /* chevrons */
  for (let i = 0; i < NCHEV; i++) {
    const zPos = -((i * CHEV_GAP + scroll * 1.15) % (NCHEV * CHEV_GAP)) + 5;
    dummy.position.set(0, 0.065, zPos);
    dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    chevMesh.setMatrixAt(i, dummy.matrix);
  }
  chevMesh.instanceMatrix.needsUpdate = true;
  chevMesh.material.color.copy(curZone.dash);

  /* roadside props */
  let ri2 = 0, si = 0, ci = 0;
  const propLimit = Q.low ? 24 : Q.phone ? 32 : propSeed.length;
  for (let pi = 0; pi < propLimit; pi++) {
    const p = propSeed[pi];
    const span = PROP_RANGE;
    const zPos = -(((p.x > 0 ? 1 : -1) * 7 + p.ry * 31 + scroll) % span) - 20;
    dummy.position.set(p.x, p.kind === 0 ? p.s * 0.5 : p.kind === 1 ? p.s * 1.8 : p.s * 0.85, zPos);
    dummy.rotation.set(0, p.ry + (p.kind === 2 ? t * 0.15 : 0), p.kind === 0 ? p.ry * 0.3 : 0);
    dummy.scale.set(p.s, p.kind === 2 ? p.s * 1.7 : p.s, p.s);
    dummy.updateMatrix();
    if (p.kind === 0 && ri2 < NROCK) rockMesh.setMatrixAt(ri2++, dummy.matrix);
    if (p.kind === 1 && si < NSPIRE) spireMesh.setMatrixAt(si++, dummy.matrix);
    if (p.kind === 2 && ci < NCRY) crysMesh.setMatrixAt(ci++, dummy.matrix);
  }
  rockMesh.count = ri2; rockMesh.instanceMatrix.needsUpdate = true;
  spireMesh.count = si; spireMesh.instanceMatrix.needsUpdate = true;
  crysMesh.count = ci; crysMesh.instanceMatrix.needsUpdate = true;

  const spanL = 150;
  const treeN = Q.low ? 12 : Q.phone ? 20 : NTREE;
  const grassN = Q.low || Q.phone ? 0 : NGRASS;
  const lampN = Q.low ? 8 : Q.phone ? 12 : NLAMP;
  const ruinN = Q.low ? 6 : Q.phone ? 10 : NRUIN;
  for (let i = 0; i < treeN; i++) {
    const p = treeSeed[i];
    const zPos = -(((p.off + scroll) % spanL));
    const x = p.side * (roadHalf + p.spread);
    dummy.position.set(x, 0.55 * p.s, zPos);
    dummy.rotation.set(0, p.ry, 0);
    dummy.scale.set(p.s, p.s, p.s);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, (0.55 + 1.55) * p.s, zPos);
    dummy.scale.set(p.s, p.s * 1.05, p.s);
    dummy.updateMatrix();
    crownMesh.setMatrixAt(i, dummy.matrix);
  }
  trunkMesh.count = treeN;
  crownMesh.count = treeN;
  trunkMesh.instanceMatrix.needsUpdate = true;
  crownMesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < grassN; i++) {
    const p = grassSeed[i];
    const zPos = -(((p.off + scroll * 1.05) % spanL));
    dummy.position.set(p.side * (roadHalf + 0.55 + p.spread), 0.22 * p.s, zPos);
    dummy.rotation.set(0, p.ry, 0);
    dummy.scale.set(p.s, p.s, p.s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(i, dummy.matrix);
  }
  grassMesh.count = grassN;
  grassMesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < lampN; i++) {
    const side = i % 2 ? 1 : -1;
    const zPos = -(((i * 7.5 + scroll) % (NLAMP * 7.5)));
    const x = side * (roadHalf + 1.25);
    dummy.position.set(x, 1.15, zPos);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lampPole.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 2.35, zPos);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    lampBulb.setMatrixAt(i, dummy.matrix);
  }
  lampPole.count = lampN;
  lampBulb.count = lampN;
  lampPole.instanceMatrix.needsUpdate = true;
  lampBulb.instanceMatrix.needsUpdate = true;
  lampBulb.material.color.set(z.sky).lerp(col3('#fff6d4'), 0.55);
  for (let i = 0; i < ruinN; i++) {
    const p = ruinSeed[i];
    const zPos = -(((p.off + scroll * 0.8) % 180));
    dummy.position.set(p.side * (ROADW * 0.5 + p.spread), p.h * 0.45, zPos);
    dummy.rotation.set(0.08, p.ry, p.side * 0.12);
    dummy.scale.set(p.s, p.h, p.s * 0.8);
    dummy.updateMatrix();
    ruinMesh.setMatrixAt(i, dummy.matrix);
  }
  ruinMesh.count = ruinN;
  ruinMesh.instanceMatrix.needsUpdate = true;

  /* ground patches */
  let pi2 = 0;
  const patchN = Q.low ? 12 : Q.phone ? 16 : patchSeed.length;
  for (const p of patchSeed) {
    if (pi2 >= patchN) break;
    const zPos = -(((p.x > 0 ? 1 : -1) * 11 + p.ry * 29 + scroll) % PROP_RANGE) - 20;
    dummy.position.set(p.x, 0.012, zPos);
    dummy.rotation.set(-Math.PI / 2, 0, p.ry);
    dummy.scale.set(p.s * 1.5, p.s, 1);
    dummy.updateMatrix();
    patchMesh.setMatrixAt(pi2++, dummy.matrix);
  }
  patchMesh.count = pi2; patchMesh.instanceMatrix.needsUpdate = true;

  /* shadows (filled across sections below) */
  let shI = 0;

  /* squad */
  const shown = Math.min(G.soldiers, visCap);
  if (G.mode === 'run' && squadNow.length === shown) soldierOffsets = squadNow;
  else if (soldierOffsets.length !== shown || G.mode !== 'run') soldierOffsets = formation(Math.max(1, shown));
  if (soldierBirth.length !== shown || paintedSkin !== G.skin) {
    const fresh = soldierBirth.length !== shown;
    const oldN = soldierBirth.length;
    if (fresh) {
      soldierBirth.length = shown;
      for (let i = oldN; i < shown; i++) soldierBirth[i] = t;
    }
    const sk = skinNow();
    const from = paintedSkin !== G.skin ? 0 : Math.max(0, oldN);
    for (let i = from; i < shown; i++) {
      tmpCol.set(i === 0 ? sk.lead : sk.body);
      if (i !== 0) tmpCol.offsetHSL(rnd(-0.02, 0.02), 0, rnd(-0.05, 0.06));
      soldierBody.setColorAt(i, tmpCol);
    }
    paintedSkin = G.skin;
    leaderFlag.material.color.set(sk.lead);
    if (soldierBody.instanceColor) soldierBody.instanceColor.needsUpdate = true;
  }
  const bobT = G.mode === 'run' ? t : t * 0.4;
  const liveBodies = bodyN >= shown && shown > 0 && (G.mode === 'run' || G.mode === 'dying');
  for (let i = 0; i < shown; i++) {
    const o = soldierOffsets[i] || soldierOffsets[0] || { x: 0, y: 0 };
    const px = liveBodies ? bodyX[i] : o.x;
    const py = liveBodies ? bodyY[i] : o.y;
    const bob = Math.abs(Math.sin(bobT * 9 + i * 1.7)) * 0.16;
    const bx = axw + px * K, bz = 0.6 + py * K;
    const born = Math.min(1, (t - (soldierBirth[i] || 0)) * 5 + 0.25);
    const bulk = i === 0 ? 1 : 0.74 + (bodyPh[i] % 1) * 0.48;
    const lead = i === 0;
    dummy.position.set(bx, bob + (1 - born) * 0.35, bz);
    dummy.rotation.set(
      Math.sin(bobT * 8 + i) * 0.07,
      liveBodies ? clamp(bodyVX[i] * 0.008, -0.45, 0.45) : 0,
      Math.sin(bobT * 9 + i * 1.7) * 0.1);
    dummy.scale.setScalar((lead ? 1.65 : 1.3 * bulk) * born);
    dummy.updateMatrix();
    soldierBody.setMatrixAt(i, dummy.matrix);
    if (lead) {
      leaderFlag.position.set(bx, 1.15 + bob, bz + 0.05);
      leaderFlag.rotation.set(0, 0, Math.sin(bobT * 6) * 0.25);
      leaderFlag.visible = born > 0.4 && G.mode !== 'menu';
    }
    if (i < 16) {
      dummy.position.set(bx + 0.16 * (lead ? 1.15 : 1), 0.48 + bob, bz - 0.62);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.05, 0.05, 0.12 + muzzleGlow * 0.7);
      dummy.updateMatrix();
      muzzleMesh.setMatrixAt(i, dummy.matrix);
    }
    if (shI < MAXSH && (!Q.low && !Q.phone || i === 0)) {
      dummy.position.set(bx, 0.06, bz);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      if (Q.low || Q.phone) {
        const blob = Math.max(1.3, halfPxCache * K * 1.15);
        dummy.scale.set(blob, blob * 0.62, 1);
      } else dummy.scale.set(lead ? 0.78 : 0.5, lead ? 0.42 : 0.3, 1);
      dummy.updateMatrix();
      shadowMesh.setMatrixAt(shI++, dummy.matrix);
    }
  }
  soldierBody.count = shown;
  muzzleMesh.count = muzzleGlow > 0.4 ? Math.min(shown, 16) : 0;
  soldierBody.instanceMatrix.needsUpdate = true;
  muzzleMesh.instanceMatrix.needsUpdate = true;
  if (soldierBody.instanceColor) soldierBody.instanceColor.needsUpdate = true;
  muzzleMesh.material.color.copy(tmpCol.set(WT[G.tier].col));

  /* enemies: per-kind instanced meshes + eyes + shadows */
  const kCount = { runner: 0, normal: 0, brute: 0, split: 0, gold: 0, leaper: 0, boss: 0 };
  let ei = 0;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const zP = wz(e.wy);
    if (zP > 14) { e.label.style.display = 'none'; if (e.aura) e.aura.visible = false; continue; }
    const d = EDEF[e.kind] || EDEF.normal;
    let s = e.r * K * (e.boss ? 1.7 : 1.8) * Math.max(e.boss ? 0.45 : 0, e.pop) * (e.boss ? 1 : (e.attacking ? 1 + Math.sin(t * 14) * 0.08 : 1));
    if (e.boss) s = Math.max(1.35, Math.min(1.85, s));
    if (s < 0.01) s = 0.01;
    if (e.roar) s *= e.boss ? 1 + e.roar * 0.2 : 1 + e.roar * 0.28 * Math.sin(t * 26);
    e._s = s;
    const hop = ((e.kind === 'runner' || e.kind === 'leaper') ? Math.abs(Math.sin(t * (e.kind === 'leaper' ? 14 : 11) + e.x)) * (e.kind === 'leaper' ? 0.55 : 0.3) : Math.abs(Math.sin(t * 6 + e.x)) * 0.1) * s;
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
      if (e.aura) {
        const ring = Math.max(e.boss ? 3.4 : 0.35, s * (e.boss ? 2.4 : 2.5));
        e.aura.position.set(wx(e.x), 0.07, zP);
        e.aura.scale.setScalar(ring + Math.sin(t * 5) * 0.08);
        e.aura.visible = zP < 20 && zP > -96;
      }
      if (shI < MAXSH && (e.boss || (!Q.low && !Q.phone))) {
        const sh = 1 / (1 + hop * 0.45);
        const fw = Math.max(0.4, s * (e.boss ? 2.4 : 1.25)) * sh;
        const fd = Math.max(0.28, s * (e.boss ? 1.5 : 0.8)) * sh;
        dummy.position.set(wx(e.x) + fw * 0.1, 0.06, zP);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(fw, fd, 1);
        dummy.updateMatrix();
        shadowMesh.setMatrixAt(shI++, dummy.matrix);
      }
    }
    const labelY = e.boss ? Math.min(3.3, s * 2.15 + 0.45) : s * d.labelY + 0.4;
    setLabel(e.label, wx(e.x), labelY, zP, String(Math.ceil(e.hp)));
    if (e.attacking) e.label.style.color = '#ffb0a0';
    else e.label.style.color = '';
  }
  /* rival mobs */
  let mu = 0;
  for (const m of mobs) {
    if (m.dead) continue;
    const zP0 = wz(m.wy);
    if (zP0 > 14 || zP0 < -110) { m.label.style.display = 'none'; continue; }
    const v = mobVisible(m);
    const base = m.hitT > 0 ? '#ffffff' : (m.clash ? '#ff7a6a' : '#e8485a');
    for (let i = 0; i < v && mu < MOBU_MAX; i++) {
      const u = m.units[i];
      const hop = Math.abs(Math.sin(t * 11 + u.ph)) * 0.18;
      const lunge = m.clash ? Math.sin(t * 22 + u.ph) * 0.12 : 0;
      dummy.position.set(wx(m.x + u.ox), hop, wz(m.wy + u.oy) + lunge);
      dummy.rotation.set(m.clash ? 0.35 : 0.1, Math.sin(t * 3 + u.ph) * 0.2, 0);
      dummy.scale.setScalar(0.85 * Math.max(0.05, m.pop));
      dummy.updateMatrix();
      mobUnitMesh.setMatrixAt(mu, dummy.matrix);
      mobUnitMesh.setColorAt(mu, tmpCol.set(base).offsetHSL(0, 0, ((u.ph % 1) - 0.5) * 0.12));
      mu++;
      if (ei < MAXE && i < 60) {
        const es = 0.85 * Math.max(0.05, m.pop);
        dummy.position.set(wx(m.x + u.ox), hop + es * EDEF.runner.eyeY, wz(m.wy + u.oy) + lunge + es * EDEF.runner.eyeZ);
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(es * EDEF.runner.eyeS);
        dummy.updateMatrix();
        eyeMesh.setMatrixAt(ei, dummy.matrix);
        eyeMesh.setColorAt(ei, tmpCol.set(m.clash ? '#ffffff' : '#ffcf6a'));
        ei++;
      }
    }
    if (shI < MAXSH) {
      dummy.position.set(wx(m.x), 0.055, zP0);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(m.hw * K * 2.3, m.hd * K * 2.6 + 0.8, 1);
      dummy.updateMatrix();
      shadowMesh.setMatrixAt(shI++, dummy.matrix);
    }
    setLabel(m.label, wx(m.x), 2.0, wz(m.wy - m.hd), fmtNum(m.count));
    m.label.classList.toggle('big', m.count > G.soldiers);
    m.label.classList.toggle('band', m.band);
  }
  mobUnitMesh.count = mu;
  mobUnitMesh.instanceMatrix.needsUpdate = true;
  if (mobUnitMesh.instanceColor) mobUnitMesh.instanceColor.needsUpdate = true;

  /* enemy corpses: fling back + shrink, then publish instance counts */
  for (let i = deadEnemies.length - 1; i >= 0; i--) {
    const dE = deadEnemies[i];
    dE.t += FD;
    if (dE.t > (dE.kind === 'boss' ? 1.05 : 0.62)) { deadEnemies.splice(i, 1); continue; }
    const kd = EDEF[dE.kind] || EDEF.normal;
    const km2 = kindMesh[dE.kind] || kindMesh.normal;
    if (kCount[dE.kind] >= kd.cap) continue;
    const ki = kCount[dE.kind]++;
    dE.x += dE.vx * FD; dE.wy += dE.vwy * FD;
    dE.y += dE.vy * FD; dE.vy -= 11 * FD;
    dummy.position.set(wx(dE.x), Math.max(0.05, dE.y), wz(dE.wy));
    dummy.rotation.set(dE.spin * dE.t * 2.4, 0, dE.spin * dE.t);
    dummy.scale.setScalar(Math.max(0.01, dE.s * (1 - dE.t * 1.4)));
    dummy.updateMatrix();
    km2.setMatrixAt(ki, dummy.matrix);
    km2.setColorAt(ki, tmpCol.set(dE.col || '#8a5a42'));
  }
  for (const k in kindMesh) {
    kindMesh[k].count = kCount[k];
    kindMesh[k].instanceMatrix.needsUpdate = true;
    if (kindMesh[k].instanceColor) kindMesh[k].instanceColor.needsUpdate = true;
  }

  /* soldier corpses */
  let di2 = 0;
  for (let i = deadSoldiers.length - 1; i >= 0; i--) {
    const p = deadSoldiers[i];
    p.t += FD;
    if (p.t > (p.doom ? 1.35 : 0.8)) { deadSoldiers.splice(i, 1); continue; }
    p.x += p.vx * FD; p.wy += p.vwy * FD;
    p.y += p.vy * FD; p.vy -= (p.off ? 18 : 9.5) * FD;
    if (!p.off && p.y < 0.1) { p.y = 0.1; p.vy *= -0.3; }
    dummy.position.set(wx(p.x), p.y, wz(p.wy));
    dummy.rotation.set(p.spin * p.t, p.spin * p.t * 0.6, 0);
    const life = p.doom ? 1.35 : 0.8;
    dummy.scale.setScalar(Math.max(0.05, 1.05 * (1 - p.t / life)));
    dummy.updateMatrix();
    if (di2 >= MAXDEAD) continue;
    deadSoldierMesh.setMatrixAt(di2, dummy.matrix);
    deadSoldierMesh.setColorAt(di2, tmpCol.set(p.doom ? '#c46a3a' : '#3c342c'));
    di2++;
  }
  deadSoldierMesh.count = di2;
  deadSoldierMesh.instanceMatrix.needsUpdate = true;
  if (deadSoldierMesh.instanceColor) deadSoldierMesh.instanceColor.needsUpdate = true;

  eyeMesh.count = ei; eyeMesh.instanceMatrix.needsUpdate = true;
  if (eyeMesh.instanceColor) eyeMesh.instanceColor.needsUpdate = true;

  /* gates — fade out as they reach the squad so a full-width panel
     doesn't plaster the camera on the frame you walk through it */
  const gp = 0.32 + Math.sin(t * 4) * 0.14;
  for (const g of gates) {
    const zP = wz(g.wy);
    const fade = clamp((-zP - 0.6) / 3.2, 0, 1) * g.pop;
    g.grp.position.z = zP;
    g.grp.position.y = -(1 - g.pop) * 5.4;
    g.grp.visible = zP < 14 && fade > 0.03;
    if (g.punch) { g.punch = Math.max(0, g.punch - FD * 3.6); g.grp.scale.setScalar(1 + g.punch * 0.1); }
    else g.grp.scale.setScalar(1);
    if (g.grp.visible) layoutGate(g);
    const panelA = (g.passed ? 0.22 : 1) * fade;
    for (const m of g.meshes) m.material.opacity = panelA;
    if (g.frames) for (const f of g.frames) f.material.opacity = (g.passed ? 0.08 : gp) * fade;
    if (g.postMesh) g.postMesh.material.opacity = fade;
    if (g.baseMesh) g.baseMesh.visible = fade > 0.2;
  }

  /* walls */
  for (const w of walls) {
    const zP = wz(w.wy);
    if (w.dead) {
      const k = Math.min(1, w.deadT / 0.75);
      w.mesh.visible = zP < 14;
      w.mesh.scale.set(w.wx, Math.max(0.05, 1 - k * 0.9), 1 + k * 0.5);
      w.mesh.rotation.x = k * 0.4;
      w.mesh.position.set(w.cxW, 0, zP);
      continue;
    }
    w.mesh.visible = zP < 14;
    w.mesh.scale.set(w.wx, 1, 1);
    w.mesh.rotation.x = 0;
    w.mesh.position.set(w.cxW, -(1 - w.pop) * 3.6, zP);
    setLabel(w.label, w.cxW, 4.4, zP, String(Math.ceil(w.hp)));
    if (!Q.low && zP < 14 && shI < MAXSH) {
      dummy.position.set(w.cxW, 0.06, zP);
      dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(Math.max(0.5, w.wx * 0.92), 0.38, 1);
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
      if (h.grp.children[0]) h.grp.children[0].scale.x = Math.max(0.25, (roadHalf * 2 + 0.5) / (ROADW + 1.4));
    } else if (h.kind === 'meteor') {
      if (h.dead) {
        h.rock.visible = h.warn.visible = false;
        h.ring.material.opacity = Math.max(0, 0.6 - h.deadT * 1.4);
      } else if (h.armed) {
        const f = clamp(1 - h.tImpact / 1.15, 0, 1);
        h.rock.visible = h.warn.visible = true;
        h.rock.position.set(wx(h.x), 30 * (1 - f) + 0.4, 0);
        h.rock.rotation.x = t * 7; h.rock.rotation.y = t * 9;
        h.ring.material.opacity = 0.3 + f * 0.5 + Math.sin(t * 12) * 0.08;
        h.ring.scale.setScalar(h.r * K * (0.9 + Math.sin(t * 12) * 0.08));
      } else {
        h.ring.material.opacity = 0.25 + Math.sin(t * 6) * 0.1;
        h.ring.scale.setScalar(h.r * K);
      }
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
      b.hitT = Math.max(0, b.hitT - FD);
      b.grp.rotation.z = Math.sin(b.hitT * 36) * b.hitT * 0.8;
    } else b.grp.rotation.z = 0;
    setLabel(b.label, wx(b.x), 2.6, zP, String(Math.ceil(b.hp)));
    if (!Q.low && zP < 14 && shI < MAXSH) {
      dummy.position.set(wx(b.x) + 0.1, 0.055, zP - 0.05);
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

  /* coins */
  let coinI = 0;
  for (const c of coins) {
    const zP = wz(c.wy);
    if (zP > 6 || zP < -85) continue;
    const lift = c.fly !== undefined && c.fly > 0 ? Math.sin(Math.min(1, c.fly * 3) * Math.PI) * 1.6 + 0.6 : 0;
    dummy.position.set(wx(c.x), 1.05 + lift + Math.sin(t * 3.2 + c.spin) * 0.12, zP);
    dummy.rotation.set(0, t * 3.4 + c.spin, 0);
    const sc = 1.25 + Math.min(0.75, Math.max(0, -zP) * 0.025);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    if (coinI < MAXCOIN) coinMesh.setMatrixAt(coinI++, dummy.matrix);
  }
  coinMesh.count = coinI;
  coinMesh.instanceMatrix.needsUpdate = true;

  /* bullets */
  let bi = 0;
  for (const b of bullets) {
    const zP = wz(b.wy);
    if (zP > 14) continue;
    dummy.position.set(wx(b.x), 0.8, zP);
    dummy.rotation.set(0, Math.atan2(b.vx, -b.vwy), 0);
    const pulse = 1 + (b.pulse || 0) * 0.85;
    dummy.scale.set((b.wid || 1) * pulse, (b.wid || 1) * pulse, (b.len || 1) * (1 + (b.pulse || 0) * 0.35));
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

  /* enemy projectiles */
  let ebi = 0;
  for (const p of ebullets) {
    const zP = wz(p.wy);
    if (zP > 14) continue;
    dummy.position.set(wx(p.x), 0.9, zP);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1 + Math.sin(t * 12 + p.t * 9) * 0.15);
    dummy.updateMatrix();
    if (ebi < MAXEB) {
      ebulletMesh.setMatrixAt(ebi, dummy.matrix);
      ebulletMesh.setColorAt(ebi, tmpCol.set(p.col));
      ebi += 1;
    }
  }
  ebulletMesh.count = ebi;
  ebulletMesh.instanceMatrix.needsUpdate = true;
  if (ebulletMesh.instanceColor) ebulletMesh.instanceColor.needsUpdate = true;

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

  /* personal best line */
  {
    const zB = wz(G.best * 40);
    const show = G.best > 0 && (G.mode === 'run' || G.mode === 'dying' || G.mode === 'pick' || G.mode === 'paused') && zB < 14 && zB > -110;
    bestGrp.visible = show;
    if (show) {
      const u = bestGrp.userData, w = roadHalf * 2;
      bestGrp.position.set(0, 0, zB);
      u.strip.scale.x = w; u.banner.scale.x = w;
      u.pL.position.x = -roadHalf - 0.2; u.pR.position.x = roadHalf + 0.2;
      setLabel(bestLabel, 0, 4.3, zB, 'BEST ' + G.best + 'm');
    } else bestLabel.style.display = 'none';
  }
  if (bossBar) {
    let bo = null;
    if (G.mode === 'run' || G.mode === 'pick' || G.mode === 'paused')
      for (const e of enemies) if (e.boss && e.hp > 0 && e.wy - G.camY < 1150 && (!bo || e.wy < bo.wy)) bo = e;
    bossBar.classList.toggle('on', !!bo);
    if (bo) {
      if (bossName) bossName.textContent = bo.shooter ? 'GUNNER BOSS' : 'BRUTE BOSS';
      if (bossFill) bossFill.style.width = (100 * bo.hp / bo.maxhp).toFixed(1) + '%';
    }
  }
  if (comboEl) {
    const on = G.killChain >= 5 && G.mode === 'run';
    comboEl.style.opacity = on ? '1' : '0';
    if (on) {
      comboEl.textContent = '×' + G.killChain + ' COMBO';
      comboEl.style.fontSize = (15 + Math.min(9, G.killChain / 6)) + 'px';
      comboEl.style.color = G.killChain >= 30 ? '#ff8d6a' : '#ffd75d';
    }
  }

  /* HUD: the army number rolls toward the real count, green up / red down */
  if (hudArmy) {
    if (shownArmy !== G.soldiers) {
      if (shownArmy >= 0) {
        hudArmy.classList.remove('pop'); requestAnimationFrame(() => hudArmy.classList.add('pop'));
        armyFlash = G.soldiers > shownArmy ? 1 : -1; armyFlashT = 0.35;
      }
      shownArmy = G.soldiers;
    }
    if (G.mode === 'menu') armyRoll = G.soldiers;
    armyRoll += (G.soldiers - armyRoll) * Math.min(1, FD * 12);
    if (Math.abs(G.soldiers - armyRoll) < 0.6) armyRoll = G.soldiers;
    hudArmy.textContent = fmtNum(Math.round(armyRoll));
    armyFlashT = Math.max(0, armyFlashT - FD);
    hudArmy.style.color = armyFlashT > 0 ? (armyFlash > 0 ? '#7dff9b' : '#ff6b5d') : '';
  }
  if (shownTier !== G.tier) {
    shownTier = G.tier;
    hudWeapon.innerHTML = icon('gun') + WT[G.tier].name;
    hudWeapon.style.color = WT[G.tier].col;
  }
  hudDist.textContent = Math.floor(G.dist) + 'm';
  if (hudCoins) {
    if (shownCoins !== G.coins) {
      if (shownCoins >= 0) { hudCoins.classList.remove('pop'); requestAnimationFrame(() => hudCoins.classList.add('pop')); }
      shownCoins = G.coins;
    }
    hudCoins.innerHTML = COIN + fmtNum(G.coins);
  }
  hudLevel.textContent = 'LV ' + G.level;
  if (lvlFill) lvlFill.style.width = ((G.dist % 150) / 150 * 100).toFixed(1) + '%';
  if (hudSkills) {
    const sl = G.mode === 'run' || G.mode === 'pick' || G.mode === 'paused' ? skillLine() : '';
    if (sl !== shownSkills) { shownSkills = sl; hudSkills.innerHTML = sl; }
  }
  if (formLabel) {
    formLabel.textContent = G.form > 0.34 ? 'WIDE' : G.form < -0.34 ? 'COLUMN' : 'SQUARE';
    formLabel.style.color = edgeDanger > 0.2 ? '#e25a32' : '#f3ecdf';
  }
  if (formFill) formFill.style.left = ((G.form + 1) * 0.5 * 86) + 'px';
  if (btnCol && btnWide) {
    const live = G.mode === 'run';
    btnCol.style.visibility = live ? 'visible' : 'hidden';
    btnWide.style.visibility = live ? 'visible' : 'hidden';
    btnCol.classList.toggle('on', G.form < -0.34);
    btnWide.classList.toggle('on', G.form > 0.34);
  }
  if (pauseBtn) pauseBtn.style.display = G.mode === 'run' ? 'block' : 'none';
  const formHud = document.getElementById('hudForm');
  if (formHud) formHud.style.opacity = (G.mode === 'run' || G.mode === 'pick') ? '1' : '0';
  hintEl.style.opacity = hintT > 0 && G.mode === 'run' ? '0.9' : '0';
  labelsEl.style.visibility = G.mode === 'pick' ? 'hidden' : 'visible';
  floatsEl.style.visibility = G.mode === 'pick' ? 'hidden' : 'visible';

  renderer.render(scene, camera);
}

/* test hook: ?debug exposes state so headless playtests can drive the run */
if (/[?&]debug\b/.test(location.search)) {
  window.__mob = {
    G, SIM, META, update, startGame, gameOver, chooseSkill, transformCount, gateMid, revive, spawnMob, hurtMob, spawnBoss,
    get gates() { return gates; }, get enemies() { return enemies; }, get walls() { return walls; },
    get hazards() { return hazards; }, get barrels() { return barrels; }, get coins() { return coins; },
    get road() { return road; }, get W() { return W; }, get H() { return H; }, get mobs() { return mobs; },
    setAim(x, f) { aimX = clampAim(x); if (f !== undefined) aimForm = f; },
    sfx, coinLadder, get audioOut() { return { AC, MASTER }; }, sawX, squadRadius, bodies() { return Array.from(bodyX.slice(0, bodyN)); },
  };
}
scene.traverse(o => { if (o.isInstancedMesh || o.isPoints) o.frustumCulled = false; });
resize();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
