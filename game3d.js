/* MOB RUN 3D — the game from those ads, in Three.js.
   Chase-camera crowd runner: steer, stretch the squad, pick gates, shoot mobs. */
import * as THREE from './vendor/three.module.min.js';
import { icon, drawIcon } from './icons.js';
/* older Android WebViews / iOS < 16 lack canvas roundRect, which the gates, badges and
   signs are drawn with: fall back to a plain rounded path */
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rr = Math.max(0, Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2));
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
    return this;
  };
}
const COIN = '<span class="coin"></span>';
/* language: Bahasa Indonesia for Indonesian devices, English otherwise; switchable in SETTINGS */
const LANG = (() => {
  try { const v = localStorage.getItem('mobrun_lang'); if (v === 'en' || v === 'id') return v; } catch (e) { }
  return /^(id|in)\b/i.test(navigator.language || '') ? 'id' : 'en';
})();
const L = (en, id) => (LANG === 'id' ? id : en);
document.documentElement.lang = LANG;
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
if (muteBtn) muteBtn.innerHTML = icon('gear');
const upGrid = document.getElementById('upGrid');
const toastEl = document.getElementById('toast');
const comboEl = document.getElementById('combo');
const bestInEl = document.getElementById('bestIn');
const bossBar = document.getElementById('bossBar');
const bossName = document.getElementById('bossName');
const bossFill = document.getElementById('bossFill');
const pauseOv = document.getElementById('pauseOverlay');
{
  const tt = document.getElementById('tut');
  if (tt) tt.innerHTML = `<div class="hand">${icon('hand')}</div><b>${window.matchMedia('(pointer: coarse)').matches ? L('SWIPE TO STEER', 'GESER UNTUK BELOK') : L('MOVE THE MOUSE TO STEER', 'GERAKKAN MOUSE UNTUK BELOK')}</b>`;
}
const pauseBtn = document.getElementById('pauseBtn');
if (pauseBtn) pauseBtn.innerHTML = icon('pause');
if (pauseBtn) pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); setPause(true); });
if (pauseOv) pauseOv.addEventListener('pointerdown', (e) => {
  e.stopPropagation(); e.preventDefault(); audio();
  const id = e.target.closest && e.target.closest('button') && e.target.closest('button').id;
  if (id === 'pauseSet') { renderSettings(); if (setOv) setOv.style.display = 'flex'; return; }
  if (id === 'pauseQuit') {
    /* quitting still banks the run: coins, distance bonus, missions */
    pauseOv.style.display = 'none';
    G.quit = true;
    G.cause = 'YOU CALLED IT';
    gameOver();
    return;
  }
  setPause(false);
});

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
  if (G.mode === 'menu') { G.armyX = LW / 2; aimX = LW / 2; }
  const keysEl = document.querySelector('#startOverlay .keys');
  if (keysEl) keysEl.textContent = document.body.classList.contains('touch')
    ? L('one thumb · swipe sideways to steer · up for a column, down to spread', 'satu jempol · swipe ke samping untuk belok · atas barisan, bawah melebar')
    : L('mouse or arrows to steer · scroll or up/down to stretch · P pause · M mute', 'mouse atau panah untuk belok · scroll atau atas/bawah untuk formasi · P jeda · M senyap');
}
window.addEventListener('resize', resize);

/* ---------------- audio ----------------
   Everything goes through one bus: a compressor glues the mix and keeps a
   busy fight from clipping, and a short synthetic room adds a tail to the
   big moments. Noise comes from one shared buffer. */
let AC = null, muted = false, musicOff = false, vibOff = false, shakeOff = false, BUS = null, VERB = null, NOISE = null, MASTER = null;
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
  if (AC && AC.state === 'suspended') AC.resume().catch(() => { });
  if (AC) musicStart();
}
/* oscillator voice: pitch glide, attack, exponential decay, optional reverb send */
function voice(f, d, type, v, slide, opt) {
  if (!AC || !BUS || (opt && opt.mus ? musicOff : muted)) return;
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
  if (!AC || !BUS || (opt && opt.mus ? musicOff : muted)) return;
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
  src.loop = d > 0.9;
  src.start(t, Math.random() * Math.max(0, 0.98 - d)); src.stop(t + d + 0.02);
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
  click: () => { voice(1250, 0.03, 'sine', 0.05, 900); hiss(0.018, 0.03, 'highpass', 4000); },
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
  { bg: '#2c3a72', ground: '#1d2a52', road: '#3e4c84', post: '#6a7fc4', dash: '#a9bcff', sky: 0xc4d0ff },
  { bg: '#1b3a1a', ground: '#14301a', road: '#38552a', post: '#8fd13a', dash: '#c8f55a', sky: 0xc6ff9a },
  { bg: '#4a1f12', ground: '#2e1209', road: '#6b3420', post: '#ff7a3d', dash: '#ffb36b', sky: 0xffb98a },
  { bg: '#8d8270', ground: '#6e6455', road: '#ada38b', post: '#efe5cf', dash: '#fff7e6', sky: 0xfff0d4 },
  { bg: '#0d3340', ground: '#0a2530', road: '#1e5468', post: '#3fb6d8', dash: '#7fe6ff', sky: 0xa8f0ff },
];
const ZONE_NAMES = L(['NIGHTFALL', 'TOXIC MIRE', 'EMBER RIDGE', 'SALT FLATS', 'DEEP RUN'], ['MALAM TIBA', 'RAWA RACUN', 'BUKIT BARA', 'PADANG GARAM', 'ARUS DALAM']);
const colCache = {};
const col3 = (hex) => colCache[hex] || (colCache[hex] = new THREE.Color(hex));
const curZone = { bg: new THREE.Color(ZONES[0].bg), ground: new THREE.Color(ZONES[0].ground), road: new THREE.Color(ZONES[0].road), post: new THREE.Color(ZONES[0].post), dash: new THREE.Color(ZONES[0].dash) };

/* ---------------- weapon tiers ---------------- */
const WT = [
  { name: 'PISTOL', dmg: 1, rate: 0.24, spread: 1, col: '#ffe97d', tl: 1.0 },
  { name: 'SMG', dmg: 1, rate: 0.15, spread: 1, col: '#7de8ff', tl: 1.25 },
  { name: 'RIFLE', dmg: 2, rate: 0.13, spread: 2, col: '#a8ffb0', tl: 1.5 },
  { name: 'SHOTGUN', dmg: 3, rate: 0.19, spread: 3, col: '#ff9d5d', tl: 0.8, tw: 1.5 },
  { name: 'MINIGUN', dmg: 2, rate: 0.065, spread: 3, col: '#f0c14a', tl: 2.1 },
  { name: 'ANNIHILATOR', dmg: 5, rate: 0.11, spread: 3, col: '#ff5a4a', tl: 2.4, tw: 1.35 },
];

/* ---------------- state ---------------- */
const G = {
  mode: 'menu',
  camY: 0, speed: 162,
  armyX: 0, soldiers: 10,
  kills: 0, dist: 0, level: 1,   peak: 10, best: 0,
  coins: 0, coinsRun: 0, skin: 'recruit', owned: { recruit: true },
  tier: 0, upDmg: 0, upRate: 0, upSpread: 0,
  streak: 0, killChain: 0, killChainT: 0, mileIdx: 0,
  shake: 0, slow: 0,
  form: 0, shield: 0, overT: 0, skillPicks: 0,
  skills: {},
  coinsPicked: 0, coinsPickedVal: 0, bonusTotal: 0, gunUps: 0, missionCoins: 0, coinFrac: 0, bonusPaid: 0,
  rescued: 0, grace: 0, steered: false,
  time: 0, cause: '', mobsBeaten: 0, bossKills: 0, wallsBroken: 0, gateStreakBest: 0,
};
const SKILLS = [
  { id: 'pierce', name: 'PIERCE', icon: 'arrow', col: '#4aa3ff', desc: L('Bullets punch through one more monster.', 'Peluru tembus satu monster lagi.'), max: 3 },
  { id: 'split', name: 'FAN FIRE', icon: 'fan', col: '#4aa3ff', desc: L('One more pellet in every shot.', 'Tambah satu peluru di tiap tembakan.'), max: 3 },
  { id: 'rate', name: 'TRIGGER', icon: 'bolt', col: '#ff9f1c', desc: L('Everybody shoots faster.', 'Semua menembak lebih cepat.'), max: 4 },
  { id: 'dmg', name: 'HOLLOW POINT', icon: 'bullet', col: '#ff4d5e', desc: L('+1 damage on every bullet.', '+1 damage di setiap peluru.'), max: 5 },
  { id: 'rally', name: 'RALLY', icon: 'flag', col: '#5bd44a', desc: L('Level-ups bring more recruits.', 'Naik level dapat lebih banyak rekrutan.'), max: 3 },
  { id: 'shield', name: 'WARD', icon: 'shield', col: '#7a8cff', desc: L('Shrug off the next hit. Stacks.', 'Tahan satu serangan berikutnya. Bisa ditumpuk.'), max: 3 },
  { id: 'magnet', name: 'MAGNET', icon: 'magnet', col: '#ff4d5e', desc: L('Coins and loot fly to you.', 'Koin dan hadiah terbang ke arahmu.'), max: 2 },
  { id: 'bulwark', name: 'BULWARK', icon: 'wall', col: '#8b6cff', desc: L('Lava, saws and walls bite less.', 'Lava, gergaji, dan tembok tak terlalu sakit.'), max: 3 },
  { id: 'chain', name: 'CHAIN', icon: 'chain', col: '#ff9f1c', desc: L('Kills zap the monsters next door.', 'Monster yang mati menyetrum tetangganya.'), max: 2 },
  { id: 'crit', name: 'CRIT', icon: 'star', col: '#ffb400', desc: L('Some shots hit double.', 'Sebagian tembakan berdamage ganda.'), max: 3 },
  { id: 'steady', name: 'ANCHOR', icon: 'anchor', col: '#4aa3ff', desc: L('Fewer soldiers slip off the edge.', 'Lebih sedikit prajurit jatuh dari tepi.'), max: 2 },
  { id: 'overdrive', name: 'OVERDRIVE', icon: 'chevrons', col: '#ff9f1c', desc: L('Good gates spin up your guns for a bit.', 'Gerbang bagus bikin senjata ngebut sebentar.'), max: 2 },
  { id: 'greed', name: 'GREED', icon: 'bag', col: '#ffb400', desc: L('Coins are worth 25% more.', 'Koin bernilai 25% lebih.'), max: 3 },
  { id: 'fortune', name: 'FORTUNE', icon: 'sparkle', col: '#ffb400', desc: L('Bigger distance payout at the end.', 'Bonus jarak di akhir lebih besar.'), max: 2 },
  { id: 'execution', name: 'EXECUTION', icon: 'skull', col: '#ff4d5e', desc: L('Bosses take way more damage.', 'Bos menerima damage jauh lebih besar.'), max: 3 },
  { id: 'iron', name: 'IRON', icon: 'shield', col: '#8b6cff', desc: L('Lose fewer soldiers to everything.', 'Kehilangan lebih sedikit prajurit.'), max: 3 },
  { id: 'focus', name: 'FOCUS', icon: 'crosshair', col: '#ff4d5e', desc: L('Tighter, deadlier volleys.', 'Tembakan lebih rapat dan mematikan.'), max: 3 },
  { id: 'warcry', name: 'WARCRY', icon: 'megaphone', col: '#5bd44a', desc: L('Good gates bring extra recruits.', 'Gerbang bagus menambah rekrutan.'), max: 3 },
  { id: 'scavenge', name: 'SCAVENGE', icon: 'bag', col: '#ffb400', desc: L('Monsters drop coins sometimes.', 'Monster kadang menjatuhkan koin.'), max: 3 },
  { id: 'laststand', name: 'LAST STAND', icon: 'heart', col: '#ff4d5e', desc: L('Under 18 soldiers? Hit harder.', 'Di bawah 18 prajurit? Pukul lebih keras.'), max: 2 },
  { id: 'quickstep', name: 'QUICKSTEP', icon: 'chevrons', col: '#5bd44a', desc: L('Switch formation faster.', 'Ganti formasi lebih cepat.'), max: 2 },
  { id: 'hoard', name: 'HOARD', icon: 'magnet', col: '#ffb400', desc: L('Grab coins from farther out.', 'Ambil koin dari lebih jauh.'), max: 2 },
];
const SKINS = [
  { id: 'recruit', name: 'RECRUIT', price: 0, body: '#3d7bff', lead: '#ffd75d' },
  { id: 'vanguard', name: 'VANGUARD', price: 150, body: '#1fc8f5', lead: '#f4fbff', hat: L('Beret', 'Baret') },
  { id: 'ember', name: 'EMBER', price: 400, body: '#ff5418', lead: '#ffd27a', hat: L('Flame crest', 'Jambul api') },
  { id: 'toxic', name: 'TOXIC', price: 900, body: '#22dd60', lead: '#e8ff8a', hat: L('Gas mask', 'Masker gas') },
  { id: 'royal', name: 'OXBLOOD', price: 1600, body: '#a82c26', lead: '#f2d48a', hat: L('Plume', 'Bulu jambul') },
  { id: 'void', name: 'ASH', price: 3000, body: '#4a453c', lead: '#f4efe4', hat: L('Headband', 'Ikat kepala') },
  { id: 'camo', name: 'JUNGLE', price: 5000, body: '#5f8a3a', lead: '#e6d38a', hat: L('Bush hat', 'Topi rimba') },
  { id: 'neon', name: 'NEON', price: 8000, body: '#ff3df2', lead: '#3dfff0', hat: L('Visor + cans', 'Visor + headset') },
  { id: 'gold', name: 'GOLDEN', price: 15000, body: '#ffb81a', lead: '#fff6d0', hat: L('Crown', 'Mahkota') },
];
/* ---------------- meta progression (persists between runs) ----------------
   Upgrades make the next run go further, missions give a reason to try a
   different route, and the daily gift brings people back. */
const UPGRADES = [
  { id: 'army', name: L('BIGGER SQUAD', 'PASUKAN BESAR'), icon: 'flag', col: '#5bd44a', max: 15, desc: L('Soldiers at the start', 'Prajurit di awal run'), val: (l) => String(10 + l * 6), cost: (l) => Math.round(110 * Math.pow(1.35, l)) },
  { id: 'gun', name: L('STARTING GUN', 'SENJATA AWAL'), icon: 'gun', col: '#ff4d5e', max: 3, desc: L('Weapon at the start', 'Senjata di awal run'), val: (l) => ['PISTOL', 'SMG', 'RIFLE', 'SHOTGUN'][l], cost: (l) => [450, 1700, 4500][l] },
  { id: 'armor', name: L('BODY ARMOR', 'BAJU ZIRAH'), icon: 'shield', col: '#8b6cff', max: 8, desc: L('Fewer soldiers lost to every hit', 'Lebih sedikit prajurit hilang tiap kena'), val: (l) => l ? '-' + l * 5 + '%' : L('none', 'belum ada'), cost: (l) => Math.round(240 * Math.pow(1.45, l)) },
  { id: 'magnet', name: 'MAGNET', icon: 'magnet', col: '#ff7ab8', max: 4, desc: L('Coins fly to you from farther away', 'Koin tertarik dari lebih jauh'), val: (l) => l ? 'x' + (1 + l * 0.5).toFixed(1) : L('off', 'mati'), cost: (l) => Math.round(280 * Math.pow(1.7, l)) },
  { id: 'lucky', name: L('LUCKY GATES', 'GERBANG HOKI'), icon: 'sparkle', col: '#ffb400', max: 5, desc: L('Chance of a golden gate, good on both sides', 'Peluang gerbang emas, untung di dua sisi'), val: (l) => l ? l * 6 + '%' : L('none', 'belum ada'), cost: (l) => Math.round(350 * Math.pow(1.6, l)) },
  { id: 'fire', name: L('FIREPOWER', 'DAYA TEMBAK'), icon: 'bullet', col: '#ff6b3d', max: 50, desc: L('Every bullet hits harder. Keeps going', 'Setiap peluru makin sakit. Tanpa batas'), val: (l) => l ? '+' + l * 4 + '%' : L('normal', 'biasa'), cost: (l) => Math.round(300 * Math.pow(1.12, l)) },
  { id: 'coin', name: L('COIN VALUE', 'NILAI KOIN'), icon: 'star', col: '#ff9f1c', max: 8, desc: L('Every coin is worth more', 'Setiap koin bernilai lebih'), val: (l) => l ? '+' + l * 15 + '%' : L('normal', 'biasa'), cost: (l) => Math.round(220 * Math.pow(1.5, l)) },
];
const MISSION_ICON = { dist: 'run', army: 'flag', mobs: 'skull', boss: 'crown', coins: 'star', walls: 'wall', gun: 'gun', streak: 'bolt', rescue: 'lock' };
const MISSION_DEFS = {
  dist: { steps: [300, 500, 800, 1200, 1600, 2200, 3000, 4000], text: (n) => L(`Run ${n}m in one run`, `Lari ${n}m dalam satu run`) },
  army: { steps: [100, 250, 600, 1500, 4000, 10000, 20000], text: (n) => L(`Grow your army to ${n}`, `Kumpulkan ${n} pasukan`) },
  mobs: { steps: [2, 4, 6, 9, 13, 18], text: (n) => L(`Beat ${n} enemy mobs in one run`, `Kalahkan ${n} gerombolan musuh dalam satu run`) },
  boss: { steps: [1, 2, 3, 5, 7, 10], text: (n) => L(`Defeat ${n} boss${n > 1 ? 'es' : ''} in one run`, `Kalahkan ${n} bos dalam satu run`) },
  coins: { steps: [40, 90, 160, 260, 400, 600], text: (n) => L(`Grab ${n} coins in one run`, `Ambil ${n} koin dalam satu run`) },
  walls: { steps: [2, 4, 7, 10, 15], text: (n) => L(`Break ${n} walls in one run`, `Hancurkan ${n} tembok dalam satu run`) },
  rescue: { steps: [10, 30, 80, 200, 500, 1200], text: (n) => L(`Free ${n} prisoners in one run`, `Bebaskan ${n} tawanan dalam satu run`) },
  gun: { steps: [1, 2, 3, 4, 5], text: (n) => L(`Upgrade your gun ${n} time${n > 1 ? 's' : ''} in one run`, `Upgrade senjata ${n}x dalam satu run`) },
  streak: { steps: [4, 6, 8, 11, 15], text: (n) => L(`Take ${n} good gates in a row`, `Lewati ${n} gerbang bagus berturut-turut`) },
};
const META = {
  up: { army: 0, gun: 0, armor: 0, coin: 0, magnet: 0, lucky: 0, fire: 0 },
  mlv: {}, missions: [], done: 0, seenMob: false, seen: {}, hist: [],
  life: { kills: 0, bosses: 0, mobs: 0, coins: 0, peak: 0, freed: 0, meters: 0 },
  daily: { last: '', streak: 0 },
  runs: 0,
};
/* rank: every 3 missions done promotes you; each rank pays out and adds +5% coins */
const RANKS = L(['RECRUIT', 'PRIVATE', 'CORPORAL', 'SERGEANT', 'LIEUTENANT', 'CAPTAIN', 'MAJOR', 'COLONEL', 'GENERAL', 'WARLORD'],
  ['REKRUT', 'PRAJURIT', 'KOPRAL', 'SERSAN', 'LETNAN', 'KAPTEN', 'MAYOR', 'KOLONEL', 'JENDERAL', 'PANGLIMA']);
function rankOf(done) { return Math.min(RANKS.length - 1, Math.floor(done / 3)); }
function rankReward(r) { return 150 + r * 100; }
function missionGoal(m) { const d = MISSION_DEFS[m.type]; return d.steps[Math.min(d.steps.length - 1, META.mlv[m.type] || 0)]; }
function missionReward(m) { return 80 + (META.mlv[m.type] || 0) * 60; }
function missionValue(type) {
  if (type === 'dist') return Math.floor(G.dist);
  if (type === 'army') return G.peak;
  if (type === 'mobs') return G.mobsBeaten;
  if (type === 'boss') return G.bossKills;
  if (type === 'coins') return G.coinsPicked;
  if (type === 'walls') return G.wallsBroken;
  if (type === 'rescue') return G.rescued;
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
    /* no "reach 100" right after a 20,000 run: start near half the player's record */
    const rec = t === 'army' ? META.life.peak : t === 'dist' ? G.best : 0;
    if (rec) {
      const st = MISSION_DEFS[t].steps;
      let lv = META.mlv[t] || 0;
      while (lv < st.length - 1 && st[lv] < rec * 0.5) lv++;
      META.mlv[t] = lv;
    }
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
        missionToast(L('You made ', 'Kamu naik jadi ') + RANKS[rk] + '!', rr, L('RANK UP', 'NAIK PANGKAT'));
        setTimeout(() => { sfx.fanfare(); vib([30, 50, 30, 50, 90]); }, 2700);
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
  return { streak, coins: 60 * Math.min(7, streak) + (streak >= 7 ? 200 : 0) };
}
const SPEED_BASE = 162;
const SPEED_CAP = 288;
const MILES = [100, 250, 500, 1000, 2000, 4000];

let gates = [], enemies = [], walls = [], pickups = [], barrels = [], hazards = [], cages = [];
let bullets = [], parts = [], floats = [], rewards = [], ebullets = [], coins = [], mobs = [];
let firstMob = false, nextBand = 320, nextWall = 170, skillDelay = 0, pendingZone = null;
let nextY = 400, bossCounter = 0, gatesSpawned = 0, gateSeq = 0, sinceGate = 0;
let fireAcc = 0, drainAcc = 0, shootSfxAcc = 0, fallAcc = 0, edgeWarn = 0;
let hintT = 0, zoneIdx = -1, fovKick = 0, muzzleGlow = 0, distMark = 0, revived = false, lastLevel = 1;
let shownTier = -1, shownSkills = null;
let bossIntro = false, deathT = 0, shownCoins = -1, shownArmy = -1, armyRoll = 10, armyFlash = 0, armyFlashT = 0;
const fmtNum = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K' : String(n);
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
    if (!G.steered && G.mode === 'run') onFirstSteer();
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
cv.addEventListener('pointerdown', (e) => {
  try { cv.setPointerCapture(e.pointerId); } catch (err) { }
  press(e.clientX, e.clientY);
});
cv.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && !dragging && G.mode === 'run') {
    const f = clamp((e.clientX / Math.max(1, W) - 0.18) / 0.64, 0, 1);
    const nx = clampAim(road.x0 + f * (road.x1 - road.x0));
    if (Math.abs(nx - aimX) > 2) { aimX = nx; if (!G.steered) onFirstSteer(); }
    return;
  }
  move(e.clientX, e.clientY);
});
cv.addEventListener('wheel', (e) => {
  if (G.mode !== 'run') return;
  e.preventDefault();
  aimForm = clamp(aimForm + clamp(e.deltaY, -100, 100) * 0.005, -1, 1);
}, { passive: false });
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);
window.addEventListener('pointerup', release);
window.addEventListener('blur', release);
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
/* the formation chip is a button too: square -> column -> wide -> square */
const formChip = document.getElementById('hudForm');
if (formChip) formChip.addEventListener('pointerdown', (e) => snapForm(G.form < -0.34 ? 1 : G.form > 0.34 ? 0 : -1, e));
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
/* every button press: a soft click and a tiny buzz, so the UI feels physical */
document.addEventListener('pointerdown', (e) => {
  if (!(e.target.closest && e.target.closest('button, .skillCard, .upCard, .skinCard, .setRow'))) return;
  audio(); sfx.click(); vib(8);
}, true);
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
  else if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && setOv && setOv.style.display === 'flex') setOv.style.display = 'none';
  else if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && shopOv && shopOv.style.display === 'flex') closeShop();
  else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') setPause(G.mode === 'run');
  else if (e.key === ' ' || e.key === 'Enter') {
    if ((shopOv && shopOv.style.display === 'flex') || (setOv && setOv.style.display === 'flex') || G.mode === 'pick') return;
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

/* asphalt: a light-grey grain/crack/patch texture, tinted by the zone colour and
   scrolled with the run so the ground visibly rushes past */
const roadTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 170 + Math.floor(Math.random() * 85);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) {                       // darker repair patches
    g.fillStyle = '#b4b4b4';
    g.beginPath(); g.roundRect(Math.random() * 200, Math.random() * 480, 30 + Math.random() * 50, 18 + Math.random() * 40, 6); g.fill();
  }
  g.globalAlpha = 0.55; g.strokeStyle = '#9a9a9a'; g.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) {                       // hairline cracks
    let x = Math.random() * 256, y = Math.random() * 512;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 22; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 22);
  t.anisotropy = Q.phone ? 2 : 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const roadMat = new THREE.MeshLambertMaterial({ color: ZONES[0].road, map: roadTex });
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

/* weather: every zone has its own air. Particles live in a box around the
   camera, scroll with the road and drift with the zone's wind. */
const NMOTES = Q.low ? 60 : Q.phone ? 130 : 240;
const WEATHER = [
  { col: '#f2f6ff', size: 0.38, op: 0.85, vx: 0, vy: -1.3, wob: 0.6, add: false },    // nightfall: snow
  { col: '#b4ff8a', size: 0.42, op: 0.7, vx: 0, vy: 0.55, wob: 0.9, add: true },       // toxic: spores
  { col: '#ffd06a', size: 0.36, op: 1, vx: 0.3, vy: 2.6, wob: 0.5, add: true },     // ember: embers
  { col: '#fff1d6', size: 0.44, op: 0.55, vx: 3.8, vy: -0.15, wob: 0.3, add: false },   // salt: blowing dust
  { col: '#bff2ff', size: 0.46, op: 0.65, vx: 0, vy: 0.9, wob: 0.7, add: true },        // deep run: bubbles
];
const wx0 = { col: new THREE.Color(WEATHER[0].col), size: WEATHER[0].size, op: WEATHER[0].op, vx: WEATHER[0].vx, vy: WEATHER[0].vy, wob: WEATHER[0].wob };
const moteGeo = new THREE.BufferGeometry();
const moteSeed = new Float32Array(NMOTES);
{
  const mp = new Float32Array(NMOTES * 3);
  for (let i = 0; i < NMOTES; i++) {
    mp[i * 3] = rnd(-18, 18); mp[i * 3 + 1] = rnd(0.2, 9); mp[i * 3 + 2] = rnd(-45, 10);
    moteSeed[i] = rnd(0, 6.28);
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
}
const moteMat = new THREE.PointsMaterial({ map: dotTex, size: 0.26, color: 0xe8f0ff, transparent: true, opacity: 0.7, depthWrite: false });
const motes = new THREE.Points(moteGeo, moteMat);
scene.add(motes);
function stepWeather(dt, zi, scrollV, t) {
  const w = WEATHER[zi % WEATHER.length];
  const k = Math.min(1, dt * 0.8);
  wx0.col.lerp(tmpCol.set(w.col), k);
  wx0.size += (w.size - wx0.size) * k; wx0.op += (w.op - wx0.op) * k;
  wx0.vx += (w.vx - wx0.vx) * k; wx0.vy += (w.vy - wx0.vy) * k; wx0.wob += (w.wob - wx0.wob) * k;
  moteMat.color.copy(wx0.col); moteMat.size = wx0.size; moteMat.opacity = wx0.op;
  const blend = w.add ? THREE.AdditiveBlending : THREE.NormalBlending;
  if (moteMat.blending !== blend) { moteMat.blending = blend; moteMat.needsUpdate = true; }
  const a = moteGeo.attributes.position.array;
  for (let i = 0; i < NMOTES; i++) {
    const o = i * 3, sd = moteSeed[i];
    a[o] += (wx0.vx + Math.sin(t * 1.3 + sd) * wx0.wob) * dt;
    a[o + 1] += (wx0.vy * (0.7 + (sd % 1) * 0.6)) * dt;
    a[o + 2] += scrollV * dt + Math.cos(t * 1.1 + sd) * wx0.wob * 0.3 * dt;
    if (a[o + 2] > 10) { a[o + 2] -= 55; a[o] = rnd(-18, 18); }
    if (a[o + 1] > 9.5) a[o + 1] = 0.2; else if (a[o + 1] < 0.1) a[o + 1] = 9.4;
    if (a[o] > 24) a[o] = -24; else if (a[o] < -24) a[o] = 24;
  }
  moteGeo.attributes.position.needsUpdate = true;
}

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
/* geometry detail per quality tier: at phone size the extra segments are invisible but cost
   thousands of triangles once a crowd of 90 soldiers and a mob are on screen */
const LOD = Q.low ? 0.55 : Q.phone ? 0.72 : 1;
let LODK = 1;   /* extra squeeze for crowd units seen mostly from afar */
const CAP = (r, l, s) => new THREE.CapsuleGeometry(r, l, Math.max(2, Math.round((s || 3) * LOD * LODK)), Math.max(5, Math.round((s ? 10 : 8) * LOD * LODK)));
const SPH = (r, s) => new THREE.SphereGeometry(r, Math.max(5, Math.round((s || 10) * LOD * LODK)), Math.max(4, Math.round((s || 10) * LOD * LODK)));
const CONE = (r, h) => new THREE.ConeGeometry(r, h, 6);
const BOX = (a, b, c) => new THREE.BoxGeometry(a, b, c);

/* --- squad soldier: armored runner, one draw call --- */
const soldierGeo = mergeParts([
  { geo: BOX(0.11, 0.07, 0.14), m: M4(-0.07, 0.035, 0.02), c: '#141822' },
  { geo: BOX(0.11, 0.07, 0.14), m: M4(0.07, 0.035, 0.02), c: '#141822' },
  { geo: BOX(0.09, 0.16, 0.09), m: M4(-0.07, 0.14, 0), c: '#4c4f5c' },
  { geo: BOX(0.09, 0.16, 0.09), m: M4(0.07, 0.14, 0), c: '#4c4f5c' },
  { geo: BOX(0.28, 0.07, 0.16), m: M4(0, 0.24, 0), c: '#1a2233' },
  { geo: BOX(0.07, 0.045, 0.04), m: M4(0, 0.24, -0.09), c: '#ffd75d' },
  { geo: CAP(0.15, 0.26), m: M4(0, 0.48, 0), c: '#ffffff' },
  { geo: BOX(0.18, 0.2, 0.05), m: M4(0, 0.5, -0.11), c: '#c4c8d2' },
  { geo: BOX(0.06, 0.07, 0.03), m: M4(0, 0.52, -0.145), c: '#ffd75d' },
  { geo: SPH(0.09, 7), m: M4(-0.2, 0.6, 0, 0, 0, 0, 1.15, 0.7, 0.9), c: '#e2e4ea' },
  { geo: SPH(0.09, 7), m: M4(0.2, 0.6, 0, 0, 0, 0, 1.15, 0.7, 0.9), c: '#e2e4ea' },
  { geo: BOX(0.07, 0.16, 0.07), m: M4(-0.2, 0.4, -0.02), c: '#f2f2f2' },
  { geo: BOX(0.07, 0.16, 0.07), m: M4(0.18, 0.42, -0.06), c: '#f2f2f2' },
  { geo: BOX(0.18, 0.22, 0.1), m: M4(0, 0.48, 0.15), c: '#8a8e9c' },
  { geo: BOX(0.07, 0.1, 0.035), m: M4(0, 0.64, 0.18), c: '#ffffff' },
  { geo: SPH(0.145, 8), m: M4(0, 0.76, 0, 0, 0, 0, 1, 0.78, 1.02), c: '#ffffff' },
  { geo: BOX(0.19, 0.055, 0.05), m: M4(0, 0.72, -0.125), c: '#2a2d3a' },
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
/* --- headgear: each squad color wears something of its own, drawn with the same matrices --- */
const CYL = (r1, r2, h, n) => new THREE.CylinderGeometry(r1, r2, h, n || 10);
const HATS = {
  vanguard: () => mergeParts([
    { geo: CYL(0.17, 0.15, 0.06, 12), m: M4(0.03, 0.88, 0.01, 0, 0, -0.32), c: '#1fc8f5' },
    { geo: SPH(0.03, 5), m: M4(0.07, 0.92, 0.0), c: '#f4fbff' },
  ]),
  ember: () => mergeParts([
    { geo: CONE(0.07, 0.24), m: M4(0, 0.98, 0.0), c: '#ffd27a' },
    { geo: CONE(0.06, 0.2), m: M4(0, 0.95, 0.09, -0.5, 0, 0), c: '#ff9a2a' },
    { geo: CONE(0.06, 0.2), m: M4(0, 0.95, -0.09, 0.5, 0, 0), c: '#ff5418' },
  ]),
  toxic: () => mergeParts([
    { geo: CYL(0.07, 0.08, 0.1, 10), m: M4(0, 0.7, -0.17, Math.PI / 2, 0, 0), c: '#2a2d3a' },
    { geo: CYL(0.05, 0.05, 0.03, 10), m: M4(0, 0.7, -0.23, Math.PI / 2, 0, 0), c: '#8aff5a' },
    { geo: SPH(0.045, 6), m: M4(-0.06, 0.79, -0.12), c: '#e8ff8a' },
    { geo: SPH(0.045, 6), m: M4(0.06, 0.79, -0.12), c: '#e8ff8a' },
  ]),
  royal: () => mergeParts([
    { geo: SPH(0.06, 7), m: M4(0, 1.0, 0.06, 0.6, 0, 0, 0.7, 2.4, 0.8), c: '#f2d48a' },
    { geo: SPH(0.05, 7), m: M4(0, 0.97, 0.1, 0.9, 0, 0, 0.6, 2.0, 0.7), c: '#d8403a' },
  ]),
  void: () => mergeParts([
    { geo: CYL(0.152, 0.152, 0.05, 14), m: M4(0, 0.8, 0), c: '#f4efe4' },
    { geo: BOX(0.03, 0.03, 0.2), m: M4(0.04, 0.78, 0.22, 0.5, 0.25, 0), c: '#f4efe4' },
    { geo: BOX(0.03, 0.03, 0.18), m: M4(-0.04, 0.76, 0.21, 0.7, -0.25, 0), c: '#f4efe4' },
  ]),
  camo: () => mergeParts([
    { geo: CYL(0.25, 0.25, 0.025, 14), m: M4(0, 0.84, 0), c: '#7a6a3a' },
    { geo: CYL(0.13, 0.15, 0.11, 12), m: M4(0, 0.9, 0), c: '#8a7a45' },
    { geo: CYL(0.152, 0.152, 0.025, 12), m: M4(0, 0.86, 0), c: '#3f5a25' },
  ]),
  neon: () => mergeParts([
    { geo: BOX(0.24, 0.05, 0.05), m: M4(0, 0.77, -0.13), c: '#3dfff0' },
    { geo: CYL(0.05, 0.05, 0.05, 10), m: M4(-0.16, 0.76, 0, 0, 0, Math.PI / 2), c: '#1a1530' },
    { geo: CYL(0.05, 0.05, 0.05, 10), m: M4(0.16, 0.76, 0, 0, 0, Math.PI / 2), c: '#1a1530' },
    { geo: BOX(0.3, 0.025, 0.03), m: M4(0, 0.9, 0), c: '#ff3df2' },
  ]),
  gold: () => mergeParts([
    { geo: CYL(0.13, 0.12, 0.08, 12), m: M4(0, 0.89, 0), c: '#ffd84a' },
    ...[0, 1, 2, 3, 4].map((k) => ({ geo: CONE(0.03, 0.09), m: M4(Math.cos(k * 1.2566) * 0.11, 0.97, Math.sin(k * 1.2566) * 0.11), c: '#ffe98a' })),
    { geo: SPH(0.025, 5), m: M4(0, 0.89, -0.125), c: '#ff4d5e' },
  ]),
};
const hatGeoCache = {};
const hatMesh = new THREE.InstancedMesh(new THREE.BufferGeometry(),
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 }), MAXS);
hatMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
hatMesh.count = 0;
scene.add(hatMesh);
let hatFor = '';
function setHat(id) {
  if (hatFor === id) return;
  hatFor = id;
  if (!HATS[id]) { hatMesh.visible = false; return; }
  hatMesh.geometry = hatGeoCache[id] || (hatGeoCache[id] = HATS[id]());
  hatMesh.visible = true;
}
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
const FACE = {
  runner: [1.05, 0.3, 0.55], normal: [1.55, 0.45, 0.9], brute: [1.8, 0.62, 1.2], split: [1.55, 0.45, 0.95],
  gold: [1.5, 0.45, 0.9], leaper: [1.15, 0.32, 0.7], boss: [2.55, 0.75, 1.7],
};
function enemyGeo(kind) {
  const HORN = '#2a1018';
  const parts = [];
  /* a grumpy mouth with three fangs, sitting just under the eyes */
  const F = FACE[kind] || FACE.normal;
  const mY = F[0] - 0.36 * F[2], mZ = F[1] - 0.02;
  parts.push({ geo: BOX(0.44 * F[2], 0.12 * F[2], 0.08), m: M4(0, mY, mZ, 0, 0, 0), c: '#2a0f1a' });
  for (const k of [-1, 0, 1])
    parts.push({ geo: CONE(0.05 * F[2], 0.12 * F[2]), m: M4(k * 0.13 * F[2], mY + 0.01 * F[2], mZ + 0.05, Math.PI, 0, 0), c: '#fff6e0' });
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
LODK = 0.6;
const mobUnitGeo = enemyGeo('runner');
LODK = 1;
const mobUnitMesh = new THREE.InstancedMesh(mobUnitGeo,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, emissive: 0x3a0a06, emissiveIntensity: 0.6 }), MOBU_MAX);
mobUnitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(mobUnitMesh);
const MAXE = 320;
const ES = Q.low ? [5, 4, 4, 3] : Q.phone ? [7, 5, 5, 4] : [10, 8, 8, 6];
const eyeGeo = mergeParts([
  { geo: new THREE.SphereGeometry(0.15, ES[0], ES[1]), m: M4(-0.15, 0, 0, 0, 0, 0, 1, 1, 0.55), c: '#ffffff' },
  { geo: new THREE.SphereGeometry(0.15, ES[0], ES[1]), m: M4(0.15, 0, 0, 0, 0, 0, 1, 1, 0.55), c: '#ffffff' },
  { geo: new THREE.SphereGeometry(0.07, ES[2], ES[3]), m: M4(-0.13, -0.02, 0.07, 0, 0, 0, 1, 1, 0.5), c: '#1b1430' },
  { geo: new THREE.SphereGeometry(0.07, ES[2], ES[3]), m: M4(0.13, -0.02, 0.07, 0, 0, 0, 1, 1, 0.5), c: '#1b1430' },
  { geo: BOX(0.24, 0.06, 0.06), m: M4(-0.15, 0.14, 0.06, 0, 0, -0.42), c: '#1b1430' },
  { geo: BOX(0.24, 0.06, 0.06), m: M4(0.15, 0.14, 0.06, 0, 0, 0.42), c: '#1b1430' },
]);
const eyeMesh = new THREE.InstancedMesh(eyeGeo,
  new THREE.MeshBasicMaterial({ vertexColors: true }), MAXE);
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
  new THREE.BoxGeometry(0.12, 0.12, 0.78),
  new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXB);
bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(bulletMesh);
const MAXEB = 30;
const ebulletMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.3, 12, 10),
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
  mys: { bg: 'rgba(120,70,210,0.85)', edge: '#dcc4ff' },
};
function gateLabel(p) {
  if (p.t === 'add') return '+' + p.v;
  if (p.t === 'sub') return '-' + p.v;
  if (p.t === 'mul') return '×' + p.v;
  if (p.t === 'gun') return 'GUN UP';
  if (p.t === 'mys') return '?';
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
const gatePostGeo = new THREE.BoxGeometry(0.28, 5.2, 0.28);
const gateBaseGeo = new THREE.BoxGeometry(1, 0.18, 0.5);
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
  const post = new THREE.Mesh(gatePostGeo,
    new THREE.MeshLambertMaterial({ color: g.moving ? 0x7de8ff : 0xdfe9ff, transparent: true }));
  grp.add(post); g.postMesh = post;
  const base = new THREE.Mesh(gateBaseGeo,
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
function removeGate(g) {
  if (!g.grp) return;
  scene.remove(g.grp);
  /* panel canvases and materials are per gate; geometries are shared, leave them */
  for (const m of [...(g.meshes || []), ...(g.frames || []), g.postMesh, g.baseMesh]) {
    if (!m) continue;
    if (m.material.map) m.material.map.dispose();
    m.material.dispose();
  }
  g.grp = null;
}

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
/* sawblade: a toothed steel disc standing upright, facing the player, so it
   reads as a saw from the chase cam instead of a flat ellipse on the road */
const sawGeo = (() => {
  const shape = new THREE.Shape();
  const teeth = 14, R = 1, r = 0.8;
  for (let k = 0; k < teeth; k++) {
    const a0 = (k / teeth) * Math.PI * 2, a1 = ((k + 0.62) / teeth) * Math.PI * 2, a2 = ((k + 1) / teeth) * Math.PI * 2;
    const f = k === 0 ? 'moveTo' : 'lineTo';
    shape[f](Math.cos(a0) * r, Math.sin(a0) * r);
    shape.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
    shape.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.16, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  blade.translate(0, 0, -0.04);
  return mergeParts([
    { geo: blade, m: M4(0, 0, 0), c: '#dfe6f2' },
    { geo: new THREE.CylinderGeometry(0.62, 0.62, 0.1, 24), m: M4(0, 0, 0, Math.PI / 2, 0, 0), c: '#9aa6bd' },
    { geo: new THREE.CylinderGeometry(0.3, 0.3, 0.16, 16), m: M4(0, 0, 0, Math.PI / 2, 0, 0), c: '#ff4d5e' },
  ]);
})();
const sawRimGeo = new THREE.TorusGeometry(0.62, 0.05, 6, 24);
/* rail with black and yellow hazard stripes */
const stripeTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1430'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#ffcc33';
  for (let x = -32; x < 160; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, 32); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(10, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const sawTrackGeo = new THREE.BoxGeometry(ROADW + 1.4, 0.1, 0.55);
const sawTrackMat = new THREE.MeshLambertMaterial({ map: stripeTex });
const sawMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6, emissive: 0x222833, emissiveIntensity: 0.6 });
const sawRimMat = new THREE.MeshBasicMaterial({ color: 0xff4d5e });

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
  /* each zone leans on its own hazard: pits in Toxic Mire, lava in Ember Ridge,
     saws on the Salt Flats, chokepoints in Deep Run */
  const sig = [null, 0.86, 0.12, 0.4, 0.62][Math.max(0, zoneIdx) % 5];
  if (G.dist < 150 && roll > 0.62) roll = Math.random() * 0.62;
  if (sig !== null && chance(0.45)) roll = sig;
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
    disc.scale.setScalar(1.35);
    const rim = new THREE.Mesh(sawRimGeo, sawRimMat);
    rim.scale.setScalar(1.35); rim.position.z = 0.09;
    blade.add(disc, rim);
    blade.position.y = 0.95;
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
  } else if (G.dist > 180) {
    /* hole in the asphalt — anyone standing on it drops */
    const wpx = (road.x1 - road.x0) * rnd(0.28, 0.55);
    const len = rnd(78, 140);
    const x = rnd(road.x0 + wpx / 2 + 10, road.x1 - wpx / 2 - 10);
    const h = { kind: 'gap', x, w: wpx, wy: wy + len * 0.5, len, drain: 7 + Math.floor(d / 2), pop: 0 };
    const grp = new THREE.Group();
    const hole = new THREE.Mesh(lavaGeo, new THREE.MeshBasicMaterial({ color: 0x070910, transparent: true, opacity: 0.92, depthWrite: false }));
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.05;
    hole.scale.set(wpx * K, len * K, 1);
    const lipTex = stripeTex.clone(); lipTex.needsUpdate = true; lipTex.repeat.set(4, 4); h.ownTex = lipTex;
    const lip = new THREE.Mesh(lavaGeo, new THREE.MeshBasicMaterial({ map: lipTex, transparent: true, opacity: 0.95, depthWrite: false }));
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
let squadLabel = null, squadNumEl = null, squadShownN = -1;
function mkLabel(cls) {
  const d = document.createElement('div');
  d.className = 'lb' + (cls ? ' ' + cls : '');
  labelsEl.appendChild(d);
  return d;
}
squadLabel = mkLabel('squad');
squadNumEl = document.createElement('b');
squadLabel.appendChild(squadNumEl);
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
  if (busy >= 2) { const old = floats.find((f) => f.t < 0.45 && Math.abs(f.x - x) < 140 && Math.abs(f.wy - wy) < 90); if (old) { old.el.remove(); floats.splice(floats.indexOf(old), 1); busy--; } }
  hh += Math.min(busy, 2) * 1.2;
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
    coins.push({ x, wy: wy + i * Math.max(30, 1.3 / K), spin: i * 0.5 });
  }
}

function schedule() {
  const heat = clamp((G.dist - 220) / 1900, 0, 1);
  while (nextY < G.camY + LH * 3.2) {
    const roll = Math.random();
    const gateP = 0.46 - heat * 0.06 + clamp(1 - G.dist / 300, 0, 1) * 0.14;
    const packP = gateP + 0.2;
    const barrelP = packP + 0.1;
    const hordeP = barrelP + heat * 0.1;
    const hazP = hordeP + 0.08 + heat * 0.09;
    const mobP = G.dist > 60 ? 0.13 + heat * 0.1 : 0;
    if (G.dist > nextBand) { nextBand += Math.max(170, 350 - Math.max(0, G.dist - 900) * 0.2); spawnMob(nextY, 1, true); nextY += rnd(640, 900) - heat * 210; continue; }
    if (G.dist > nextWall) { nextWall += rnd(260, 340); spawnWall(nextY); nextY += rnd(560, 760) - heat * 150; continue; }
    /* early rules go by where the event lands (the schedule runs ~65m ahead), not where you are */
    const at = nextY / 40;
    /* the first rival mob is tough enough to reach you: the first real crowd-on-crowd clash */
    if (at > 75 && !firstMob) { firstMob = true; const fm = spawnMob(nextY, 1.5); fm.tough = true; fm.maxHp = fm.hp; sinceGate++; }
    else if (at < 100 && gatesSpawned < 3) { spawnGate(nextY); sinceGate = 0; }
    /* first minute: a gate every other beat, so there is always a choice coming */
    else if (at < 260 && sinceGate >= 1) { spawnGate(nextY); sinceGate = 0; }
    else if (at < 260) { if (roll > 0.7 && at > 120) spawnMob(nextY); else if (chance(0.5)) spawnBarrels(nextY); else spawnPack(nextY); sinceGate++; }
    else if (roll > 1 - mobP) spawnMob(nextY);
    else if (roll < gateP) spawnGate(nextY);
    else if (roll < packP) spawnPack(nextY);
    else if (roll < barrelP) { if (G.dist > 70 && chance(0.35)) spawnCage(nextY); else spawnBarrels(nextY); }
    else if (roll < hordeP && G.dist > 220) spawnHorde(nextY);
    else if (roll < hazP && G.dist > 200) spawnHazard(nextY);
    else if (G.dist > 120) spawnWall(nextY);
    else spawnGate(nextY);
    if (chance(0.12)) spawnPickup(nextY + rnd(-150, 150));
    if (gatesSpawned <= 3 || chance(0.7)) spawnCoinLine(nextY + rnd(70, 200));
    if (G.dist > 380 && chance((0.08 + heat * 0.1) * (zoneIdx % 5 === 2 ? 2 : 1))) spawnMeteor(nextY + rnd(-120, 240));
    /* something every few seconds: tighter early, when the player has the least going on */
    const early = clamp(1 - G.dist / 400, 0, 1);
    const step = rnd(600, 860) - heat * 200 - early * 150;
    /* later on, a long stretch gets a little something halfway: a few runners or barrels to shoot */
    if (G.dist > 400 && step > 640 && chance(0.55)) { if (chance(0.6)) spawnPack(nextY + step * 0.5); else spawnBarrels(nextY + step * 0.5); }
    nextY += step;
    bossCounter += 1;
    if (bossCounter >= (G.dist < 450 ? 10 : 6)) { bossCounter = 0; spawnBoss(nextY + 140); nextY += 900; }
  }
}

/* two significant digits past 100: +3400 reads at a glance, +3409 does not */
function niceNum(v) {
  if (v < 100) return Math.round(v);
  const m = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / m) * m;
}
function spawnGate(wy) {
  const d = G.level;
  const S = Math.max(10, G.soldiers);
  /* adds grow with the army only up to twice par, so a lead is earned, not compounded */
  const SA = Math.min(S, Math.max(10, par(G.dist) * 2));
  /* add values track the army a bit so +N never feels worthless; red gates
     take a share of the army — a wrong pick stings but is rarely lethal early */
  const addBase = ri(8, 16) + d * 5 + Math.round(SA * rnd(0.12, 0.22));
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
  /* close calls: two good options that need a second of maths, and the odd
     "least bad" pair where both sides cost you */
  const flip = (x, y) => (chance(0.5) ? [x, y] : [y, x]);
  const near2 = Math.max(6, Math.round(SA * rnd(0.85, 1.2)) + ri(2, 9));
  styles.push(flip({ t: 'add', v: near2 }, { t: 'mul', v: 2 }), flip({ t: 'add', v: near2 }, { t: 'mul', v: 2 }));
  styles.push(flip({ t: 'add', v: Math.max(10, Math.round(SA * rnd(1.7, 2.3))) }, { t: 'mul', v: 3 }));
  if (G.dist > 300) styles.push(flip({ t: 'sub', v: Math.max(4, Math.round(S * rnd(0.4, 0.6))) }, { t: 'div', v: 2 }));
  /* mystery: a sealed panel next to a known one. Decided now, revealed on the way through */
  if (G.dist > 120 && chance(0.14)) {
    const r = Math.random();
    const res = r < 0.28 ? { t: 'add', v: Math.round(addBase * 1.8) } : r < 0.48 ? { t: 'mul', v: 2 } : r < 0.6 ? { t: 'mul', v: 3 }
      : r < 0.85 ? { t: 'sub', v: Math.max(4, Math.round(S * rnd(0.4, 0.6))) } : { t: 'div', v: 2 };
    const safe = { t: 'add', v: addBase };
    styles.length = 0;
    styles.push(chance(0.5) ? [{ t: 'mys', res }, safe] : [safe, { t: 'mys', res }]);
  }
  if (chance(0.06)) styles.push([{ t: 'mul', v: 5 }, { t: 'sub', v: late ? Math.round(S * rnd(0.9, 1.3)) : bigSub }]);
  if (chance(0.05)) styles.push([{ t: 'mul', v: 4 }, { t: 'div', v: 2 }]);
  const lucky = gatesSpawned >= 2 && gatesSpawned !== 3 && chance((META.up.lucky || 0) * 0.06);
  const trap = chance(0.5) ? [{ t: 'sub', v: Math.max(5, Math.round(S * 0.5)) }, { t: 'add', v: addBase + 6 }] : [{ t: 'add', v: addBase + 6 }, { t: 'sub', v: Math.max(5, Math.round(S * 0.5)) }];
  const pair = gatesSpawned < 2 ? [{ t: 'add', v: addBase }, { t: 'mul', v: 2 }]
    : gatesSpawned === 3 ? trap
    : lucky ? (chance(0.5) ? [{ t: 'mul', v: 3 }, { t: 'add', v: addBase * 2 }] : [{ t: 'add', v: addBase * 2 }, { t: 'mul', v: 3 }])
    : styles[ri(0, styles.length - 1)];
  /* way above par, a x3/x4/x5 would make the rest of the run a formality: soften it */
  const rich = G.soldiers > par(G.dist) * 2.5;
  for (const pn of pair) {
    if (pn.t === 'mys' && pn.res.t === 'mul' && rich) pn.res = { t: 'mul', v: 2 };
    if (pn.t === 'mul' && rich && pn.v > 2) pn.v = 2;
    if (pn.t === 'add' || pn.t === 'sub') pn.v = niceNum(pn.v);
    if (pn.t === 'mys' && (pn.res.t === 'add' || pn.res.t === 'sub')) pn.res.v = niceNum(pn.res.v);
  }
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

/* Threat curve. Rival mobs are sized from PAR: the army a fair player has at
   this distance. Your own army only adds a small share, so every good gate
   pick is a buffer you keep, and every bad one leaves you short. Par keeps
   climbing, so every run still ends. */
function par(d) { return 20 + 6500 * Math.pow(Math.max(0, d) / 1000, 2.3); }
function threatBase(d) { return 6 * Math.pow(1.00205, d); }
function threatRatio(d) {
  const t = clamp(d / 2000, 0, 1);
  return 0.3 + 0.5 * t * t * (3 - 2 * t);
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
  const P = par(d), S = G.soldiers;
  let n = band
    ? Math.max(threatBase(d) * 2, (P * (0.55 + 0.5 * clamp((d - 300) / 1300, 0, 1)) + S * 0.2) * rnd(0.9, 1.1))
    : Math.max(threatBase(d), P * threatRatio(d) + S * 0.12) * rnd(0.8, 1.15) * (scale || 1);
  /* never a flat wall of arithmetic: a band stays just under the army cap, so a
     full army can always win the clash. The late game is about rebuilding in time
     for the next one, which comes sooner the further you get */
  n = Math.min(n, band ? ARMY_CAP * 0.95 : ARMY_CAP * 0.6);
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
  /* one banner at a time: if something else is being announced, the band's own label does the job */
  if (band && performance.now() > bannerUntil) bannerFlash(L('WAR BAND AHEAD', 'PASUKAN PERANG!'), '#ff5d6a');
  if (!META.seenMob) { META.seenMob = true; showHint(L('RED MOB AHEAD · shoot it down, then outnumber it on contact', 'GEROMBOLAN MERAH · tembak dulu, lalu kalahkan jumlahnya'), 4.5); }
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
  floatText(m.x, m.wy, m.band ? L('WAR BAND BROKEN!', 'PASUKAN HANCUR!') : how === 'shot' ? L('MOB DOWN!', 'TUMBANG!') : L('CRUSHED!', 'DIGILAS!'), '#ffd75d', m.band ? 32 : how === 'shot' ? 26 : 30, 3.4);
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
  /* the first mob of a run is a lesson in clashing: it can't be shot away entirely */
  if (m.tough && !m.clash) { const now = G.time; const bud = Math.min(m.maxHp * 0.12, (m.bud ?? m.maxHp * 0.05) + (now - (m.budT ?? now)) * m.maxHp * 0.12); m.budT = now; dmg = Math.min(dmg, bud); m.bud = bud - dmg; }
  m.hp -= dmg;
  const c = Math.max(0, Math.ceil(m.hp / m.uh));
  if (c < m.count) { G.kills += m.count - c; m.count = c; if (!(m.hitCD > 0)) { m.hitT = 0.06; m.hitCD = 0.2; } }
  if (m.hp <= 0) killMob(m, 'shot');
}

const bossAuraGeo = new THREE.RingGeometry(0.85, 1, 36);
/* variant silhouettes: gunners carry shoulder cannons, splitters glow with three cores */
const cannonGeo = mergeParts([
  { geo: new THREE.CylinderGeometry(0.24, 0.28, 1.25, 12), m: M4(0, 0, 0.3, Math.PI / 2, 0, 0), c: '#7a7494' },
  { geo: new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12), m: M4(0, 0, 0.92, Math.PI / 2, 0, 0), c: '#ffcf3d' },
  { geo: new THREE.CylinderGeometry(0.31, 0.31, 0.1, 12), m: M4(0, 0, 0.0, Math.PI / 2, 0, 0), c: '#ffcf3d' },
  { geo: BOX(0.5, 0.42, 0.55), m: M4(0, -0.08, -0.2), c: '#4a4466' },
]);
const cannonMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5, emissive: 0x331a00, emissiveIntensity: 0.5 });
const coreMat = new THREE.MeshBasicMaterial({ color: 0xd8a8ff });
const coreGeo = SPH(0.17, 10);
function bossBits(boss) {
  const g = new THREE.Group();
  if (boss.shooter) {
    for (const sx of [-1, 1]) { const c = new THREE.Mesh(cannonGeo, cannonMat); c.position.set(sx * 1.0, 2.45, 0.1); g.add(c); }
  } else if (boss.splitter) {
    for (const [x, y] of [[0, 1.35], [-0.38, 1.85], [0.38, 1.85]]) {
      const c = new THREE.Mesh(coreGeo, coreMat); c.position.set(x, y, 0.78); g.add(c);
    }
  } else return null;
  g.visible = false;   /* shown once the draw loop has placed it */
  scene.add(g);
  return g;
}
function dropBossBits(e) { if (e.aura) scene.remove(e.aura); if (e.acc) scene.remove(e.acc); }
function bossTitle(e) { return e.shooter ? L('GUNNER BOSS', 'BOS PENEMBAK') : e.splitter ? L('SPLITTER BOSS', 'BOS PEMBELAH') : L('BRUTE BOSS', 'BOS RAKSASA'); }
function spawnBoss(wy) {
  bossIntro = true;   /* whichever boss comes first is the intro: never two in a row */
  const d = G.level;
  /* as tough as a rival mob of about a quarter of par: the same per-unit health that tracks your guns */
  const early = clamp(0.45 + G.dist / 600, 0.45, 1);
  const hp = Math.round((42 + d * 46 + unitHp(G.dist) * (par(G.dist) * 0.28 + G.soldiers * 0.06)) * early);
  const bx = (road.x0 + road.x1) / 2 + rnd(-60, 60);
    const boss = mkEnemy('boss', bx, wy, hp);
  boss.roar = 1;
  boss.pop = 0.55;
  /* variant: a gunner boss lobs burning orbs */
  if (d >= 2 && chance(0.45)) { boss.shooter = true; boss.col = '#d8762a'; boss.fireT = 1.1; }
  else if (d >= 3 && chance(0.45)) { boss.splitter = true; boss.col = '#8a3ad8'; }
  const aura = new THREE.Mesh(bossAuraGeo, new THREE.MeshBasicMaterial({
    color: boss.shooter ? 0xe2b657 : 0xff5d3d, transparent: true, opacity: 0.72,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  aura.rotation.x = -Math.PI / 2;
  scene.add(aura);
  boss.aura = aura;
  boss.acc = bossBits(boss);
  enemies.push(boss);
  if (d >= 3 && chance(0.5)) {
    enemies.push(mkEnemy('normal', clamp(bx - 60, road.x0 + 16, road.x1 - 16), wy + 40, Math.round(10 + d * 4)));
    enemies.push(mkEnemy('normal', clamp(bx + 60, road.x0 + 16, road.x1 - 16), wy + 40, Math.round(10 + d * 4)));
  }
}

function spawnBarrels(wy) {
  const d = G.level;
  const n = ri(1, 3);
  const kinds = ['weapon', 'heal', 'heal', 'bomb', 'gold', 'gold', 'upgrade'];
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

/* --- prisoner cages: shoot the lock off and the prisoners join the squad.
   Run into one unbroken and only half of them make it out. --- */
const cageBarGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6);
const cagePlateGeo = new THREE.CylinderGeometry(1.2, 1.25, 0.18, 14);
const cageBarMat = new THREE.MeshStandardMaterial({ color: 0xb8c2d8, metalness: 0.6, roughness: 0.35 });
const cagePlateMat = new THREE.MeshStandardMaterial({ color: 0x3a3060, roughness: 0.6 });
const prisonerMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xc8d0e8, roughness: 0.7 });
function spawnCage(wy) {
  const d = G.level;
  const n = Math.max(6, Math.round(G.soldiers * rnd(0.18, 0.32))) + d * 2;
  const hp = Math.round((22 + d * 12) * rnd(0.9, 1.2) * Math.pow(Math.max(1, firepower()), 0.4));
  const x = rnd(road.x0 + 46, road.x1 - 46);
  const grp = new THREE.Group();
  const base = new THREE.Mesh(cagePlateGeo, cagePlateMat); base.position.y = 0.09;
  const top = new THREE.Mesh(cagePlateGeo, cagePlateMat); top.position.y = 2.1; top.scale.setScalar(0.96);
  grp.add(base, top);
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2;
    const bar = new THREE.Mesh(cageBarGeo, cageBarMat);
    bar.position.set(Math.cos(a) * 1.08, 1.1, Math.sin(a) * 1.08);
    grp.add(bar);
  }
  const lock = makeSprite('lock', '#ffcc33'); lock.position.set(0, 2.7, 0.3); lock.scale.set(1.1, 1.1, 1);
  grp.add(lock);
  const prisoners = [];
  for (let k = 0; k < Math.min(5, n); k++) {
    const m = new THREE.Mesh(soldierGeo, prisonerMat);
    const a = (k / 5) * Math.PI * 2 + 0.4;
    m.position.set(Math.cos(a) * 0.5, 0.18, Math.sin(a) * 0.45);
    m.rotation.y = Math.PI;
    m.scale.setScalar(1.15);
    grp.add(m); prisoners.push(m);
  }
  grp.position.set(wx(x), 0, wz(wy));
  scene.add(grp);
  cages.push({ x, wy, hp, maxhp: hp, n, grp, prisoners, lock, label: mkLabel('cage'), pop: 0, hitT: 0, dead: false });
}
function hitCage(c, dmg) {
  if (c.dead) return;
  c.hp -= dmg;
  c.hitT = 0.22;
  if (c.hp <= 0) breakCage(c, false);
}
function breakCage(c, rammed) {
  if (c.dead) return;
  c.dead = true;
  const freed = rammed ? Math.ceil(c.n / 2) : c.n;
  G.rescued += freed;
  addSoldiers(G.soldiers + freed);
  scene.remove(c.grp);
  c.label.remove();
  floatText(c.x, c.wy, (rammed ? '+' + freed + L(' (half got out)', ' (separuh lolos)') : '+' + freed + L(' FREED!', ' BEBAS!')), rammed ? '#ffb089' : '#7ee081', rammed ? 20 : 28, 3);
  const col = skinNow().body;
  for (let k = 0; k < 22 && parts.length < MAXP - 4; k++)
    parts.push({ x: c.x + rnd(-20, 20), wy: c.wy + rnd(-10, 10), h: rnd(0.4, 1.8), vx: (G.armyX - c.x) * rnd(0.8, 1.6), vwy: (G.camY - c.wy) * rnd(0.8, 1.4),
      vh: rnd(2, 4), t: 0, life: rnd(0.5, 0.8), color: k % 3 ? col : '#ffcc33' });
  for (let k = 0; k < 10 && parts.length < MAXP - 4; k++) parts.push(mkPart(c.x, c.wy, '#b8c2d8'));
  (rammed ? sfx.good : sfx.great)();
  G.shake = Math.max(G.shake, 5); vib(25);
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

/* past the army cap, extra recruits aren't wasted: they turn into coins,
   and every ~2000 of overflow sharpens the guns, so big gates still pay */
const ARMY_CAP = 20000;
function overflow(extra) {
  /* logarithmic: a x3 gate at the cap is worth a little more than a +500, not 20x more */
  const coinsN = Math.min(14, Math.max(1, Math.round(Math.log2(1 + extra / 500) * 2)));
  for (let i = 0; i < coinsN && coins.length < MAXCOIN; i++)
    coins.push({ x: G.armyX + rnd(-40, 40), wy: G.camY + 40 + rnd(-10, 20), spin: rnd(0, 6), fly: 0.1 + i * 0.03 });
  const dmg = extra >= 20000 ? 2 : extra >= 3000 ? 1 : 0;
  G.upDmg += dmg;
  const txt = dmg ? L('MAX ARMY! GUN DMG +', 'PASUKAN PENUH! DAMAGE +') + dmg : L('MAX ARMY!', 'PASUKAN PENUH!');
  if (G.time - (G.overflowMsgT || -9) > 1.2) { G.overflowMsgT = G.time; floatText(G.armyX, G.camY + 66, txt, '#ffcc33', 24, 4.6); }
}
function addSoldiers(n) {
  const prevPeak = G.peak;
  n = Math.round(n);
  if (n > ARMY_CAP && G.mode === 'run') { const extra = n - Math.max(G.soldiers, ARMY_CAP); if (extra > 0) overflow(extra); }
  G.soldiers = clamp(n, 0, ARMY_CAP);
  G.peak = Math.max(G.peak, G.soldiers);
  while (G.mileIdx < MILES.length && G.peak >= MILES[G.mileIdx]) {
    if (MILES[G.mileIdx] > prevPeak) {
      floatText(G.armyX, G.camY, L('ARMY ', 'PASUKAN ') + MILES[G.mileIdx] + '!', '#ffd75d', 34, 4);
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
  if (p.t === 'mys') return transformCount(count, p.res);
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
  let left = 0, counted = 0, seam = 0;
  /* the middle post: soldiers who run straight into it don't make it through */
  const SEAM = 13;
  if (bodyN > 1) {
    counted = bodyN;
    for (let i = 0; i < bodyN; i++) { const x = G.armyX + bodyX[i]; if (x < mid) left++; if (Math.abs(x - mid) < SEAM) seam++; }
  } else {
    const offs = formation(shown);
    counted = offs.length;
    for (const o of offs) { const x = G.armyX + o.x; if (x < mid) left++; if (Math.abs(x - mid) < SEAM) seam++; }
  }
  let lFrac = left / counted, rFrac = 1 - lFrac;
  /* a few stragglers on the other side follow the crowd: aiming at a panel gets you that panel */
  if (lFrac < 0.2) { lFrac = 0; rFrac = 1; }
  else if (rFrac < 0.2) { rFrac = 0; lFrac = 1; }
  const lp = g.panels[0], rp = g.panels[1];
  /* only a squad that straddles the gate pays for the post */
  const postLoss = lFrac > 0 && rFrac > 0 && G.dist > 60 ? Math.min(army - 1, Math.round(army * seam / counted)) : 0;
  const thru = army - postLoss;
  if (postLoss > 0) {
    floatText(mid, G.camY + 20, '-' + fmtNum(postLoss) + L(' POST!', ' TIANG!'), '#ff6b6b', 20, 3.2);
    for (let k = 0; k < 8 && parts.length < MAXP - 2; k++) parts.push(mkPart(mid + rnd(-6, 6), G.camY + 8, '#dfe9ff'));
    sfx.hurt(); vib(30);
  }
  let nl = transformCount(thru * lFrac, lp);
  let nr = transformCount(thru * rFrac, rp);
  let gunUp = false;
  if (lp.t === 'gun' && lFrac > 0) gunUp = true;
  if (rp.t === 'gun' && rFrac > 0) gunUp = true;
  let after = Math.max(0, Math.round(nl + nr));
  /* the first stretch is a tutorial: a wrong gate hurts but never ends the run */
  if (G.dist < 250 && after < 5) after = Math.min(army, 5);
  const delta = after - army;
  if (after < army) G.cause = postLoss > army * 0.5 ? 'CLIPPED A GATE POST' : 'A BAD GATE';
  addSoldiers(after);
  const split = lFrac > 0.08 && rFrac > 0.08;
  const good = gunUp || delta >= 0;
  if (good) G.streak += 1; else G.streak = 0;
  G.gateStreakBest = Math.max(G.gateStreakBest, G.streak);
  if (G.streak >= 3 && good) floatText(G.armyX, G.camY + 60, G.streak + L(' IN A ROW!', ' BERUNTUN!'), '#7dff9b', 18, 4.4);
  if (gunUp) weaponUp();
  if (good && G.skills.overdrive) G.overT = 2.4 + G.skills.overdrive * 0.8;
  if (good && G.skills.warcry) {
    const extra = 4 * G.skills.warcry;
    addSoldiers(G.soldiers + extra);
    floatText(G.armyX, G.camY + 28, 'WARCRY +' + extra, '#f3ecdf', 20, 3);
  }
  for (const [pp, fr, side] of [[lp, lFrac, 0], [rp, rFrac, 1]]) {
    if (pp.t !== 'mys' || fr <= 0) continue;
    const good = pp.res.t === 'add' || pp.res.t === 'mul';
    floatText(G.armyX, G.camY + 70, L('MYSTERY ', 'MISTERI ') + gateLabel(pp.res) + (good ? '!' : '...'), good ? '#c8a8ff' : '#ff8d98', 28, 4.8);
    if (g.meshes && g.meshes[side]) { const mat = g.meshes[side].material, old = mat.map; mat.map = panelTex({ ...pp.res, gold: false }); mat.needsUpdate = true; if (old) old.dispose(); }
    (good ? sfx.fanfare : sfx.bad)();
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
  if (G.grace > 0) return;
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
  bannerUntil = performance.now() + 1700;
  /* one message at a time in the middle of the screen */
  if (toastEl && toastEl.classList.contains('on')) toastEl.classList.add('hush');
}
let bannerT = null;
/* the first time each hazard shows up, say what to do about it, once ever */
function tutorialHint(kind) {
  if (META.seen[kind]) return;
  const touch = document.body.classList.contains('touch');
  const T = {
    choke: touch ? L('CHOKEPOINT! Swipe up to squeeze into a column', 'CELAH SEMPIT! Swipe ke atas jadi barisan') : L('CHOKEPOINT! Hold ↑ to squeeze into a column', 'CELAH SEMPIT! Tahan ↑ jadi barisan'),
    saw: L('SAW BLADE! Time it and steer around', 'GERGAJI! Atur waktu dan hindari'),
    lava: L('LAVA! Keep the squad on the dark side', 'LAVA! Jaga pasukan di sisi yang gelap'),
    gap: L('PIT! Steer around the hole', 'LUBANG! Belok menghindari lubang'),
    meteor: L('METEOR! Get out of the red circle', 'METEOR! Keluar dari lingkaran merah'),
    wall: L('WALL! Shoot it down or go around the gap', 'TEMBOK! Tembak atau lewati celahnya'),
    band: L('WAR BAND! As big as your army. Shoot it down first', 'PASUKAN PERANG! Sebesar pasukanmu. Tembak duluan'),
  };
  if (!T[kind]) return;
  META.seen[kind] = true;
  showHint(T[kind], 3.6);
  saveSave();
}
/* first runs: an animated hand shows the swipe until the player steers once,
   then the formation tip takes over */
const tutEl = document.getElementById('tut');
function onFirstSteer() {
  G.steered = true;
  if (META.runs <= 3) {
    const touch = document.body.classList.contains('touch');
    showHint(touch ? L('Nice! Swipe up for a column, down to spread wide', 'Mantap! Swipe atas jadi barisan, bawah melebar') : L('Nice! Scroll or ↑ ↓ to squeeze or spread the squad', 'Mantap! Scroll atau ↑ ↓ untuk merapat/melebar'), 3.2);
  }
}
function showHint(text, secs) {
  if (!hintEl) return;
  hintEl.textContent = text;
  hintT = secs;
}
/* skill reward: a hazard that only just missed */
function closeCall(x, wy) {
  G.closeCalls = (G.closeCalls || 0) + 1;
  const n = 3 + Math.min(5, G.closeCalls);
  for (let i = 0; i < n && coins.length < MAXCOIN; i++)
    coins.push({ x: x + rnd(-20, 20), wy: G.camY + 30 + rnd(-10, 10), spin: rnd(0, 6), fly: 0.12 + i * 0.04 });
  floatText(G.armyX, G.camY + 50, L('CLOSE CALL!', 'NYARIS!'), '#7de8ff', 26, 4.2);
  voice(1600, 0.08, 'triangle', 0.05, 2400); voice(2400, 0.1, 'sine', 0.035, 0, { at: 0.06 });
  hitstop(0.06);
}
function hitstop(t) { G.slow = Math.max(G.slow, t); }
/* a little coin flies from the pickup to the HUD counter; pooled DOM, capped */
const flyPool = [];
let flyNext = 0;
function coinToHud(x, wy) {
  if (!hudCoins || flyPool.length >= 10 && performance.now() < flyNext) return;
  flyNext = performance.now() + 45;
  const [sx, sy, zz] = project(wx(x), 1.1, wz(wy));
  if (zz > 1) return;
  const r = hudCoins.getBoundingClientRect();
  let el = flyPool.find((f) => !f.busy);
  if (!el) {
    if (flyPool.length >= 10) return;
    const d = document.createElement('span');
    d.className = 'coin flycoin';
    document.body.appendChild(d);
    el = { d, busy: false };
    flyPool.push(el);
  }
  el.busy = true;
  const d = el.d;
  d.style.transition = 'none';
  d.style.transform = `translate(${sx}px,${sy}px) scale(1.2)`;
  d.style.opacity = '1';
  void d.offsetWidth;
  d.style.transition = 'transform .42s cubic-bezier(.5,0,.75,.4), opacity .42s ease-in';
  d.style.transform = `translate(${r.left + 14}px,${r.top + r.height / 2}px) scale(.7)`;
  setTimeout(() => {
    d.style.opacity = '0'; el.busy = false;
    hudCoins.classList.remove('pop'); void hudCoins.offsetWidth; hudCoins.classList.add('pop');
  }, 420);
}
function vib(ms) { if (vibOff) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }
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
  const calm = G.mode !== 'run';
  const s16 = step % 16, bar = Math.floor(step / 16) % 4;
  const key = ZONE_KEY[Math.max(0, zoneIdx) % ZONE_KEY.length];
  const ch = CHORDS[bar];
  const o = { at, mus: true };
  /* drums */
  /* boss on screen: double-time kick and a growl under the bass */
  const bossy = !calm && musicHeat >= 1.5;
  if (!calm && (s16 % 4 === 0 || (bossy && s16 % 2 === 0))) { voice(150, 0.11, 'sine', 0.16, 42, o); }
  if (bossy && s16 % 4 === 2) voice(hz(key + ch[0] - 36), STEP * 1.8, 'sawtooth', 0.03, 0, o);
  if (!calm && (s16 === 4 || s16 === 12)) hiss(0.09, 0.05, 'bandpass', 1800, 900, 0.9, o);
  if (!calm && s16 % 2 === 1) hiss(0.025, G.soldiers > 120 ? 0.018 : 0.011, 'highpass', 7000, 0, 0.7, o);
  /* bass: root of the bar's chord, sidestepping on the off-beats */
  const b = BASSLINE[s16];
  if (b !== null) {
    const f = hz(key + ch[0] + b - 24);
    voice(f, STEP * 1.6, 'triangle', calm ? 0.045 : 0.075, 0, o);
    if (!calm) voice(f, STEP * 1.2, 'sawtooth', 0.012, 0, o);
  }
  /* chord stab on the "and" of beat 2 and 4 */
  if (s16 === 6 || s16 === 14) for (const n of ch) voice(hz(key + n + 12), 0.16, 'triangle', 0.016, 0, { at, attack: 0.012, mus: true });
  /* tension arpeggio */
  if (!calm && musicHeat > 0.5) {
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
    if (musicOff || document.hidden) { musNext = AC.currentTime + 0.06; return; }
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

/* gun tiers unlock along the run (about every 220 m past your starting gun), so the
   arsenal grows across the whole run instead of maxing out in the first minute */
function tierCap() { return Math.min(WT.length - 1, (META.up.gun || 0) + 1 + Math.floor(G.dist / 220)); }
function weaponUp() {
  G.gunUps += 1;
  if (G.tier < tierCap()) {
    G.tier += 1;
    floatText(G.armyX, G.camY, WT[G.tier].name + '!', WT[G.tier].col, 28, 4);
    sfx.great();
  } else { G.upDmg += 1; floatText(G.armyX, G.camY, L('GUN DMG +1', 'DAMAGE SENJATA +1'), '#ffd75d', 24, 4); sfx.power(); }
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
    vx: rnd(-55, 55), vwy: e.boss ? G.speed + rnd(60, 110) : rnd(25, 65), y: e.boss ? 1.2 : 0.4, vy: rnd(3.2, 6) * (e.boss ? 1.35 : 1), spin: rnd(-7, 7) });
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
  G.soldiers = 10 + META.up.army * 6; G.kills = 0; G.dist = 0; G.level = 1; G.peak = G.soldiers;
  G.tier = META.up.gun; G.upDmg = 0; G.upRate = 0; G.upSpread = 0;
  G.streak = 0; G.killChain = 0; G.killChainT = 0; G.mileIdx = 0;
  G.shake = 0; G.slow = 0;
  G.shield = 0; G.overT = 0; G.skillPicks = 0; G.skills = {};
  armyRoll = G.soldiers;
  G.coinsRun = 0; G.coinsPicked = 0; G.coinsPickedVal = 0; G.bonusTotal = 0; G.gunUps = 0; G.rescued = 0; G.grace = 0; G.closeCalls = 0; G.lifeBanked = null; G.quit = false; G.overflowMsgT = -9; G.steered = false; G.missionCoins = 0; G.coinFrac = 0; G.bonusPaid = 0; G.time = 0; G.cause = ''; G.mobsBeaten = 0; G.bossKills = 0; G.wallsBroken = 0; G.gateStreakBest = 0;
  clearWorld();
  nextY = LH * 0.55; skillDelay = 0; pendingZone = null; crowdS = 1; firstMob = false; nextBand = 320; nextWall = 170; bossCounter = 0; gatesSpawned = 0; sinceGate = 0; fireAcc = 0; drainAcc = 0; fallAcc = 0;
  hintT = 0; zoneIdx = -1;
  if (hintEl) hintEl.textContent = document.body.classList.contains('touch') ? 'swipe sideways to steer · up for a column · down to spread wide' : '← → steer · ↑ column · ↓ spread wide'; distMark = 0; revived = false; lastLevel = 1; bossIntro = false; deathT = 0;
  startOv.style.display = 'none'; overOv.style.display = 'none'; overOv.classList.remove('on');
  if (vigEl) { vigEl.classList.remove('doom'); vigEl.style.opacity = '0'; }
  if (skillOv) skillOv.style.display = 'none';
  if (shopOv) shopOv.style.display = 'none';
  if (setOv) setOv.style.display = 'none';
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
  /* one tidy row: the four strongest picks, then a +N for the rest */
  const got = SKILLS.filter((sk) => sk.id !== 'shield' && G.skills[sk.id]).sort((a, b) => G.skills[b.id] - G.skills[a.id]);
  for (const sk of got.slice(0, 4)) { const n = G.skills[sk.id]; h += `<span style="color:${sk.col}">${icon(sk.icon)}${n > 1 ? '<b>' + n + '</b>' : ''}</span>`; }
  if (got.length > 4) h += `<span class="more">+${got.length - 4}</span>`;
  if (G.overT > 0.15) h += `<span style="color:#ffcc33;border-color:#ffcc33">${icon('chevrons')}</span>`;
  return h;
}
function offerSkills() {
  if (!skillOv || !skillCards) return;
  const pool = SKILLS.filter(s => (G.skills[s.id] || 0) < s.max);
  if (!pool.length) return;
  const bag = pool.slice();
  const picks = [];
  /* every offer has at least one way to shoot harder, so a level-up never feels like a tax form */
  const FIGHT = ['pierce', 'split', 'rate', 'dmg', 'crit', 'chain'];
  const fight = bag.filter((s) => FIGHT.includes(s.id));
  if (fight.length) { const f = fight[ri(0, fight.length - 1)]; picks.push(f); bag.splice(bag.indexOf(f), 1); }
  while (picks.length < 3 && bag.length) picks.push(bag.splice(ri(0, bag.length - 1), 1)[0]);
  /* shuffle so the fight card is not always first */
  for (let i = picks.length - 1; i > 0; i--) { const j = ri(0, i); [picks[i], picks[j]] = [picks[j], picks[i]]; }
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
      `<em class="${st ? 'up' : ''}">${st ? 'LV ' + (st + 1) : L('NEW', 'BARU')}</em><kbd>${picks.indexOf(s) + 1}</kbd>`;
    btn.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      chooseSkill(s.id);
    });
    skillCards.appendChild(btn);
  }
  const head = document.getElementById('skillHead');
  if (head) head.textContent = L('LEVEL ', 'NAIK KE LEVEL ') + G.level + '!';
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
  for (const e of enemies) { e.label.remove(); dropBossBits(e); }
  for (const b of barrels) { scene.remove(b.grp); b.label.remove(); }
  for (const c of cages) { scene.remove(c.grp); c.label.remove(); }
  cages = [];
  for (const p of pickups) scene.remove(p.mesh);
  for (const r of rewards) scene.remove(r.mesh);
  for (const h of hazards) scene.remove(h.grp);
  for (const m of mobs) m.label.remove();
  for (const f of floats) f.el.remove();
  gates = []; enemies = []; walls = []; pickups = []; barrels = []; hazards = [];
  bullets = []; parts = []; floats = []; rewards = []; ebullets = []; coins = []; mobs = [];
  deadEnemies.length = 0; deadSoldiers.length = 0; scorches.length = 0;
  labelsEl.innerHTML = ''; floatsEl.innerHTML = '';
  labelsEl.appendChild(bestLabel); labelsEl.appendChild(squadLabel);
}

function missionHTML(showNew) {
  let h = '';
  const live = G.mode !== 'menu';
  for (const m of META.missions) {
    const goal = missionGoal(m);
    const val = Math.min(goal, m.done ? goal : (live ? missionValue(m.type) : 0));
    const pct = Math.round((val / goal) * 100);
    const sub = live ? (m.done ? L('Done!', 'Selesai!') + nextTxt(m) : fmtNum(val) + ' / ' + fmtNum(goal)) : '';
    h += `<div class="ms${m.done ? ' done' : ''}"><div class="mi">${icon(m.done ? 'check' : MISSION_ICON[m.type])}</div>` +
      `<div class="mt">${showNew && m.isNew ? '<span class="nw">' + L('NEW', 'BARU') + '</span>' : ''}${MISSION_DEFS[m.type].text(goal)}` +
      (sub ? `<span class="pg">${sub}</span>` : '') +
      (live && !m.done ? `<div class="bar"><i style="width:0" data-w="${pct}%"></i></div>` : '') +
      `</div><div class="rw">+${missionReward(m)}${COIN}</div></div>`;
  }
  return h ? '<h3>' + L('MISSIONS', 'MISI') + '</h3>' + h : '';
}
function nextTxt(m) {
  const d = MISSION_DEFS[m.type], l = (META.mlv[m.type] || 0) + 1;
  return l < d.steps.length ? L(' Next up: ', ' Berikutnya: ') + d.text(d.steps[l]).toLowerCase() : '';
}
const CAUSE_ID = {
  'A BAD GATE': 'GERBANG YANG SALAH', 'CLIPPED A GATE POST': 'MENABRAK TIANG GERBANG', 'FELL OFF THE ROAD': 'JATUH DARI JALAN', 'BOSS FIREBALL': 'BOLA API BOS',
  'OUTNUMBERED BY A MOB': 'KALAH JUMLAH DARI GEROMBOLAN', 'METEOR STRIKE': 'TERTIMPA METEOR', 'FELL IN A PIT': 'JATUH KE LUBANG',
  'BURNED IN LAVA': 'TERBAKAR LAVA', 'CRUSHED IN A CHOKEPOINT': 'TERJEPIT DI CELAH', 'SHREDDED BY A SAW': 'TERCINCANG GERGAJI',
  'CRUSHED BY A BOSS': 'DIHANCURKAN BOS', 'OVERRUN BY MONSTERS': 'DIKEROYOK MONSTER', 'SMASHED INTO A WALL': 'MENABRAK TEMBOK',
  'YOU CALLED IT': 'KAMU MENGAKHIRINYA',
};
function causeText(c) { if (!c) return L('WIPED OUT', 'KALAH'); return LANG === 'id' ? (CAUSE_ID[c] || c) : c; }
function reviveCost() { return Math.max(30, Math.round(G.dist / 8)); }
function gameOver() {
  /* the results screen lists missions itself: drop any toast still queued */
  toastQ.length = 0; clearTimeout(toastT); if (toastEl) toastEl.classList.remove('on', 'hush');
  if (G.mode === 'over') return;
  G.mode = 'over';
  overAt = performance.now();
  const d = Math.floor(G.dist);
  const prevBest = G.best;
  const isBest = d > G.best;
  if (isBest) G.best = d;
  const bonus = Math.floor(((G.dist - G.bonusPaid) / 20) * (1 + 0.75 * (G.skills.fortune || 0)) * coinMult());
  G.bonusPaid = G.dist;
  G.coins += bonus;
  G.coinsRun += bonus;
  G.bonusTotal += bonus;
  if (overCause) overCause.textContent = causeText(G.cause);
  const overH = overOv.querySelector('h1');
  if (overH) overH.textContent = G.cause === 'YOU CALLED IT' ? L('RUN OVER', 'RUN SELESAI') : L('WIPED OUT', 'KALAH!');
  const gap = prevBest - d;
  const sub = isBest && d > 0 ? `<span class="stamp">${L('NEW BEST!', 'REKOR BARU!')}</span>`
    : gap <= 120 ? `<b class="close">${L(`So close! ${gap}m short of your best`, `Dikit lagi! Kurang ${gap}m dari rekor`)}</b>`
    : `<span class="chip">${icon('crown')}${L('best', 'rekor')} ${G.best}m</span>`;
  const earned = G.coinsRun + G.missionCoins;
  {
    const LB = META.life, prev = G.lifeBanked || { kills: 0, bosses: 0, mobs: 0, coins: 0, freed: 0, meters: 0 };
    const now = { kills: G.kills, bosses: G.bossKills, mobs: G.mobsBeaten, coins: earned, freed: G.rescued, meters: d };
    for (const k in now) LB[k] += Math.max(0, now[k] - prev[k]);
    LB.peak = Math.max(LB.peak, G.peak);
    G.lifeBanked = now;
  }
  if (!revived || META.hist.length === 0) META.hist.push(d); else META.hist[META.hist.length - 1] = d;
  while (META.hist.length > 10) META.hist.shift();
  const hmax = Math.max(1, ...META.hist);
  /* last runs, labelled: this run and the best one carry their distance */
  const short = (v) => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v + 'm';
  const topK = META.hist.lastIndexOf(hmax);
  const histHTML = META.hist.length > 1 ? `<div class="hist">${META.hist.map((v, k) => {
    const now = k === META.hist.length - 1, top = !now && k === topK;
    return `<i class="${now ? 'now' : top ? 'top' : ''}" style="height:${Math.max(8, Math.round(100 * v / hmax))}%">${now || top ? '<b>' + short(v) + '</b>' : ''}</i>`;
  }).join('')}</div><div class="histCap">${L('LAST ' + META.hist.length + ' RUNS', META.hist.length + ' RUN TERAKHIR')}</div>` : '';
  overStats.innerHTML =
    `<div id="overDist">0m</div>${sub}` +
    `<div class="runline"><span class="chip">${icon('flag')}${fmtNum(G.peak)} ${L('peak', 'puncak')}</span>` +
    `<span class="chip">${icon('skull')}${G.mobsBeaten} ${G.mobsBeaten === 1 ? L('mob', 'gerombolan') : L('mobs', 'gerombolan')}</span><span class="chip">${icon('crown')}${G.bossKills} ${G.bossKills === 1 ? L('boss', 'bos') : L('bosses', 'bos')}</span></div>` + histHTML +
    `<div class="earn">+<span id="earnN">0</span>${COIN}<small>${G.coinsPickedVal} ${L('picked up', 'dipungut')} · ${G.bonusTotal} ${L('distance bonus', 'bonus jarak')}${G.missionCoins ? ' · ' + G.missionCoins + ' ' + L('from missions', 'dari misi') : ''}</small></div>`;
  if (overMissions) {
    overMissions.innerHTML = missionHTML(false);
    setTimeout(() => { for (const b of overMissions.querySelectorAll('.bar i')) b.style.width = b.dataset.w; }, 450);
  }
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
    const ease = 1 - Math.pow(1 - k, 3);
    if (el) el.textContent = Math.floor(d * ease) + 'm';
    const en = document.getElementById('earnN');
    if (en) en.textContent = Math.floor(earned * ease);
    if (k < 1 && G.mode === 'over') requestAnimationFrame(tick);
    else if (isBest && d > 0 && G.mode === 'over') { sfx.fanfare(); vib([40, 60, 40, 60, 120]); confetti(90); }
  };
  requestAnimationFrame(tick);
  if (reviveBtn) {
    const c = reviveCost();
    reviveBtn.style.display = revived || G.quit ? 'none' : '';
    reviveBtn.disabled = G.coins < c;
    reviveBtn.innerHTML = `${icon('heart')}<span class="stack">${L('REVIVE', 'HIDUP LAGI')}<small>${c} ${L('coins', 'koin')}</small></span>`;
  }
  refreshBadges();
  renderQuickBuy();
  shareBlob = null;
  if (shareBtn) shareBtn.classList.toggle('brag', isBest && d > 0);
  setTimeout(() => { if (G.mode === 'over') shareCard().then((b) => { shareBlob = b; }); }, 1200);
  if (META.runs >= 3 || (isBest && META.runs >= 2)) maybeOfferInstall(); else if (installCard) installCard.style.display = 'none';
  vib(30);
}
function beginDeath() {
  if (G.mode === 'dying' || G.mode === 'over') return;
  G.mode = 'dying';
  deathT = 0.78;
  skillDelay = 0;
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
  for (const e of enemies) { e.label.remove(); dropBossBits(e); }
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
  G.grace = 1.8;
  bannerFlash(L('GET READY!', 'SIAP-SIAP!'), '#7ee081');
  floatText(G.armyX, G.camY + 20, L('SECOND WIND!', 'BANGKIT LAGI!'), '#e2b657', 30, 4);
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
/* share card: a 4:5 branded image of the run, shared as a file where the
   platform allows it, downloaded otherwise */
let shareBlob = null;
function shareCard() {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d');
  const bg = g.createRadialGradient(540, 420, 80, 540, 600, 900);
  bg.addColorStop(0, '#4a3a80'); bg.addColorStop(1, '#1b1430');
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const word = (t, x, y, size, fill, rot) => {
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    g.font = `${size}px "Lilita One", sans-serif`;
    g.lineWidth = size * 0.2; g.strokeStyle = INK;
    g.strokeText(t, 0, size * 0.07); g.strokeText(t, 0, 0);
    g.fillStyle = fill; g.fillText(t, 0, 0);
    g.restore();
  };
  word('MOB', 540, 210, 190, '#ffcc33', -0.06);
  word('RUN', 590, 380, 190, '#ffffff', -0.06);
  const d = Math.floor(G.dist);
  word(d + 'm', 540, 650, 230, '#ffffff', 0);
  if (d >= G.best && d > 0) word(L('NEW BEST!', 'REKOR BARU!'), 540, 820, 90, '#ffcc33', -0.04);
  else word(L('best ', 'rekor ') + G.best + 'm', 540, 820, 70, '#b9a9d4', 0);
  word(L('peak army ', 'pasukan ') + fmtNum(G.peak) + '  ·  ' + G.mobsBeaten + L(' mobs', ' gerombolan'), 540, 935, 58, '#7ee081', 0);
  const cols = ['#4aa3ff', '#5ee0ff', '#4aa3ff', '#7ab8ff', '#4aa3ff', '#5ee0ff', '#4aa3ff'];
  for (let k = 0; k < 7; k++) drawIcon(g, 'run', 180 + k * 120, 1095, 120, cols[k]);
  g.font = '44px Nunito, sans-serif'; g.fillStyle = '#b9a9d4';
  g.fillText(location.host || 'mob-run.pages.dev', 540, 1260);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
if (shareBtn) shareBtn.addEventListener('pointerdown', async (e) => {
  e.stopPropagation(); e.preventDefault();
  const d = Math.floor(G.dist);
  const text = L(`I ran ${d}m in MOB RUN with a peak army of ${G.peak}. Beat that:`, `Aku lari ${d}m di MOB RUN dengan pasukan ${G.peak}. Coba kalahkan:`);
  const url = location.origin + location.pathname.replace(/index\.html$/, '');
  const done = () => { shareBtn.innerHTML = icon('check'); setTimeout(() => { shareBtn.innerHTML = icon('share'); }, 1500); };
  try {
    const blob = shareBlob || await shareCard();
    const file = blob && new File([blob], `mobrun-${d}m.png`, { type: 'image/png' });
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'MOB RUN', text: text + ' ' + url });
        return;
      }
      if (navigator.share) { await navigator.share({ title: 'MOB RUN', text, url }); return; }
    } catch (err) { if (err && err.name === 'AbortError') return; }
    if (blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `mobrun-${d}m.png`; a.target = "_blank"; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    try { await navigator.clipboard.writeText(text + ' ' + url); } catch (err) { }
    done();
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
    /* suggest what changes the next run most: a better starting gun, then firepower,
       then the cheapest of the rest */
    const w = u.id === 'gun' ? 0.35 : u.id === 'fire' ? 0.6 : 1;
    if (c <= G.coins && (!pick || c * w < pick.c * pick.w)) pick = { u, l, c, w };
  }
  return pick;
}
function renderQuickBuy() {
  if (!quickBuy) return;
  const b = bestBuy();
  quickBuy.classList.toggle('on', !!b);
  if (b) quickBuy.innerHTML = `${icon(b.u.icon)}<span class="stack">${b.u.name} → ${b.u.val(b.l + 1)}<small>${L('upgrade for', 'upgrade seharga')} ${b.c} ${L('coins', 'koin')}</small></span>`;
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
function saveSettings() {
  try { localStorage.setItem('mobrun_settings', JSON.stringify({ sfx: !muted, music: !musicOff, vib: !vibOff, shake: !shakeOff })); } catch (e) { }
}
function toggleMute() {
  const off = !(muted && musicOff);
  muted = off; musicOff = off;
  saveSettings(); renderSettings();
}
const setOv = document.getElementById('settingsOverlay');
function renderSettings() {
  if (!setOv) return;
  const rows = [['sfx', 'sound', L('SOUND EFFECTS', 'EFEK SUARA'), !muted], ['music', 'music', L('MUSIC', 'MUSIK'), !musicOff], ['vib', 'phone', L('VIBRATION', 'GETARAN'), !vibOff], ['shake', 'crosshair', L('SCREEN SHAKE', 'GUNCANGAN LAYAR'), !shakeOff]];
  const rec = document.getElementById('records');
  if (rec) {
    const LF = META.life;
    const row = (ic, k, v) => `<div class="recRow"><i>${icon(ic)}</i><span>${k}</span><b>${v}</b></div>`;
    rec.innerHTML = '<h3>' + L('YOUR RECORDS', 'REKORMU') + '</h3>' + row('run', L('Runs', 'Jumlah run'), META.runs) + row('crown', L('Best distance', 'Jarak terjauh'), G.best + 'm') +
      row('flag', L('Biggest army', 'Pasukan terbesar'), fmtNum(LF.peak)) + row('skull', L('Monsters beaten', 'Monster dikalahkan'), fmtNum(LF.kills)) +
      row('crown', L('Bosses beaten', 'Bos dikalahkan'), LF.bosses) + row('lock', L('Prisoners freed', 'Tawanan dibebaskan'), fmtNum(LF.freed)) +
      row('star', L('Coins earned', 'Koin terkumpul'), fmtNum(LF.coins)) + row('run', L('Total distance', 'Total jarak'), fmtNum(LF.meters) + 'm');
  }
  const list = document.getElementById('setList');
  if (list) list.innerHTML = rows.map(([id, ic, name, on]) =>
    `<button type="button" class="setRow" data-k="${id}"><i>${icon(ic)}</i><b>${name}</b><span class="tog${on ? ' on' : ''}"><u></u></span></button>`).join('') +
    (G.mode === 'menu' || G.mode === 'over'
      ? `<button type="button" class="setRow" data-k="lang"><i>${icon('share')}</i><b>${L('LANGUAGE', 'BAHASA')}</b><span class="langTag">${LANG === 'id' ? 'INDONESIA' : 'ENGLISH'}</span></button>` : '');
}
if (setOv) {
  setOv.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    const row = e.target.closest && e.target.closest('.setRow');
    if (row) {
      const k = row.dataset.k;
      if (k === 'sfx') muted = !muted;
      if (k === 'music') musicOff = !musicOff;
      if (k === 'vib') { vibOff = !vibOff; vib(30); }
      if (k === 'shake') shakeOff = !shakeOff;
      if (k === 'lang' && (G.mode === 'menu' || G.mode === 'over')) {
        try { localStorage.setItem('mobrun_lang', LANG === 'id' ? 'en' : 'id'); } catch (err) { }
        saveSave(); location.reload(); return;
      }
      audio(); if (!muted) sfx.power();
      saveSettings(); renderSettings();
      return;
    }
    if (e.target.closest && e.target.closest('#setClose')) setOv.style.display = 'none';
  });
}
if (muteBtn) muteBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); audio(); renderSettings(); if (setOv) setOv.style.display = 'flex'; });
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
  confetti(50);
});
let toastT = null;
const toastQ = [];
function missionToast(text, reward, title) {
  toastQ.push({ text, reward, title });
  if (toastQ.length === 1) showToast();
}
let bannerUntil = 0;
function toastBlocked() {
  if (G.mode !== 'run') return false;
  if (performance.now() < bannerUntil || hintT > 0) return true;
  return gates.some((g) => !g.passed && g.wy > G.camY && g.wy - G.camY < 560);
}
function showToast() {
  if (!toastEl || !toastQ.length) return;
  const q = toastQ[0];
  if (toastBlocked() && (q.wait = (q.wait || 0) + 1) < 16) { setTimeout(showToast, 400); return; }
  toastEl.innerHTML = `<div class="chip">${icon(q.title ? 'crown' : 'check')}</div><div><b>${q.title || L('MISSION DONE', 'MISI SELESAI')}</b>${q.text} · +${q.reward}${COIN}</div>`;
  toastEl.classList.toggle('rank', !!q.title);
  toastEl.classList.add('on');
  sfx.great(); vib(25);
  clearTimeout(toastT);
  toastT = setTimeout(() => {
    toastEl.classList.remove('on', 'hush');
    setTimeout(() => { toastQ.shift(); showToast(); }, 380);
  }, 2300);
}
/* confetti for the big wins: plain DOM pieces on a fixed layer, cleaned up when they land */
function confetti(n) {
  const cols = ['#ffcc33', '#5bd44a', '#4aa3ff', '#ff4d5e', '#ff7ab8', '#fff4dc'];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  document.body.appendChild(layer);
  for (let i = 0; i < (n || 70); i++) {
    const c = document.createElement('i');
    const x = Math.random() * 100, dx = (Math.random() - 0.5) * 30, rot = (Math.random() - 0.5) * 900;
    c.style.cssText = `left:${x}vw;background:${cols[i % cols.length]};width:${6 + Math.random() * 6}px;height:${8 + Math.random() * 8}px;` +
      `animation-duration:${1.6 + Math.random() * 1.4}s;animation-delay:${Math.random() * 0.35}s;--dx:${dx}vw;--rot:${rot}deg;`;
    layer.appendChild(c);
  }
  setTimeout(() => layer.remove(), 3600);
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
  if (bestLine) bestLine.innerHTML = `<span class="chip">${icon('crown')}${G.best ? L('best ', 'rekor ') + G.best + 'm' : L('no best yet', 'belum ada rekor')}</span>` +
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
    `<span class="nx">${maxed ? L('top rank', 'pangkat tertinggi') : L('next: ', 'berikutnya: ') + RANKS[rk + 1]}</span>`;
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
    if (on) { const dd = dailyAmount(); dailyBtn.innerHTML = `${icon('gift')}<span class="stack">${L('FREE GIFT', 'HADIAH GRATIS')} +${dd.coins}<small>${L('day', 'hari')} ${dd.streak} ${L('of', 'dari')} 7</small></span>`; }
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
      if (s && s.life && typeof s.life === 'object') for (const k in META.life) META.life[k] = Math.max(0, +s.life[k] || 0);
      if (s && Array.isArray(s.hist)) META.hist = s.hist.filter((v) => typeof v === 'number').slice(-10);
      if (s && typeof s.runs === 'number') META.runs = s.runs | 0;
      if (s && s.seenMob) META.seenMob = true;
      if (s && s.seen && typeof s.seen === 'object') for (const k in s.seen) META.seen[k] = !!s.seen[k];
    }
    const legacy = parseInt(localStorage.getItem('mobrun_best') || '0', 10) || 0;
    if (legacy > G.best) G.best = legacy;
  } catch (e) { }
  try {
    const st = JSON.parse(localStorage.getItem('mobrun_settings') || 'null');
    if (st) { muted = st.sfx === false; musicOff = st.music === false; vibOff = st.vib === false; shakeOff = st.shake === false; }
    else if (localStorage.getItem('mobrun_mute') === '1') { muted = true; musicOff = true; }
    /* players who asked their device for less motion start with screen shake off */
    if (!st && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) shakeOff = true;
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
      up: META.up, mlv: META.mlv, done: META.done, runs: META.runs, daily: META.daily, seenMob: META.seenMob, seen: META.seen, hist: META.hist, life: META.life,
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
      if (u.max > 15) pips = `<em class="lv">LV ${l}</em>`;
      else for (let k = 0; k < u.max; k++) pips += `<u class="${k < l ? 'f' : ''}"></u>`;
      card.style.setProperty('--uc', u.col);
      card.innerHTML = `<i>${icon(u.icon)}</i><div class="mid"><b>${u.name}</b><span>${u.desc}<br><b class="v">${u.val(l)}</b>${maxed ? '' : ' → <b class="v nx">' + u.val(l + 1) + '</b>'}</span><div class="pips">${pips}</div></div>` +
        `<div class="price">${maxed ? 'MAX' : cost + COIN}</div>`;
      card.addEventListener('click', (ev) => {
        /* click, not pointerdown: a swipe that starts on a card scrolls the list instead of buying */
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
    const act = on ? L('ON', 'DIPAKAI') : owned ? L('USE', 'PAKAI') : sk.price + COIN;
    card.innerHTML = `<i style="color:${sk.body}">${icon('run')}</i><b>${sk.name}</b><small>${sk.hat || L('Standard kit', 'Seragam biasa')}</small><span>${act}</span>`;
    card.addEventListener('click', (ev) => {
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
    if (installHint) installHint.textContent = L('Keep MOB RUN on your home screen. It opens full screen, like an app.', 'Simpan MOB RUN di layar utama. Terbuka layar penuh seperti aplikasi.');
    if (installBtn) installBtn.style.display = '';
  } else if (ios) {
    if (installHint) installHint.textContent = L('On iPhone: tap Share, then Add to Home Screen.', 'Di iPhone: ketuk Bagikan, lalu Tambah ke Layar Utama.');
    if (installBtn) installBtn.style.display = 'none';
  } else if (coarse) {
    if (installHint) installHint.textContent = L('Open the browser menu and choose Install app, or Add to Home Screen.', 'Buka menu browser, pilih Instal aplikasi atau Tambah ke Layar Utama.');
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
  /* a boss shrugs off shots until it makes its entrance: the fight happens up close, not on the horizon */
  if (e.boss && !e.introduced) return;
  if (e.boss && G.skills.execution) dmg *= 1 + G.skills.execution * 0.4;
  /* a boss soaks at most about a fifth of its health a second, so even a monster squad
     gets a few seconds of showdown instead of a pop on the horizon */
  if (e.boss && !e.attacking) { const bud = e.budget ?? e.maxhp * 0.25; dmg = Math.min(dmg, Math.max(0, bud)); e.budget = bud - dmg; }
  e.hp -= dmg;
  /* flash in short pulses so a monster under constant fire keeps its color */
  if (!(e.hitCD > 0)) { e.hitT = 0.07; e.hitCD = 0.22; }
  if (!e.boss) e.wy += Math.min(7, dmg * 0.18);
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
      sfx.boss(); sfx.fanfare(); G.shake = 14; G.slow = 0.45; vib([70, 40, 120]); G.bossKills += 1;
      /* a splitter bursts into three brutes that each carry a quarter of its health */
      if (e.splitter) {
        for (let k = -1; k <= 1; k++) {
          const b2 = mkEnemy('brute', clamp(e.x + k * 55, road.x0 + 20, road.x1 - 20), e.wy + 20 + Math.abs(k) * 20, Math.round(e.maxhp * 0.25));
          b2.col = '#a45ae8'; b2.pop = 0.4; b2.roar = 1;
          enemies.push(b2);
        }
        floatText(e.x, e.wy + 40, L('IT SPLIT!', 'DIA PECAH!'), '#c8a8ff', 30, 4.2);
      }
      const reward = 25 + G.level * 10;
      floatText(e.x, e.wy, L('BOSS DOWN +', 'BOS TUMBANG +') + reward, '#ffd75d', 30, 4);
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
  floatText(w.cx, w.wy, L('WALL BROKEN', 'TEMBOK HANCUR'), '#b7c6e8', 24, 3);
  w.label.style.display = 'none';
}

function takePickup(kind, x) {
  sfx.power();
  if (kind === 'rate') { G.upRate += 0.02; floatText(x, G.camY, L('FIRE RATE +', 'TEMBAK CEPAT +'), '#7de8ff', 21, 3.5); }
  if (kind === 'dmg') { G.upDmg += 1; floatText(x, G.camY, 'DAMAGE +1', '#ffd75d', 21, 3.5); }
  if (kind === 'spread') { G.upSpread = Math.min(3, G.upSpread + 1); floatText(x, G.camY, 'SPREAD +1', '#7dff9b', 21, 3.5); }
  if (kind === 'heal') { addSoldiers(G.soldiers + 15); floatText(x, G.camY, L('+15 SOLDIERS', '+15 PRAJURIT'), '#7dff9b', 21, 3.5); }
  if (kind === 'ward') { G.shield = Math.min(5, G.shield + 1); floatText(x, G.camY, 'WARD +1', '#f3ecdf', 21, 3.5); }
  if (kind === 'gold') { const g = ri(10, 24); addSoldiers(G.soldiers + g); floatText(x, G.camY, '+' + g + L(' GOLD', ' EMAS'), '#ffd75d', 21, 3.5); }
  if (kind === 'weapon') weaponUp();
  if (kind === 'upgrade') { G.upRate += 0.015; G.upDmg += 1; floatText(x, G.camY, 'OVERCLOCK!', '#7de8ff', 23, 3.5); }
  for (let i = 0; i < 12; i++) parts.push(mkPart(x, G.camY + 10, '#7de8ff'));
}

/* Past what we can draw, a bigger army shows as bigger, burlier soldiers in a
   looser crowd, so 2,000 never looks like 200. Purely visual: the width still
   stays inside the road, so nobody falls off for it. */
let crowdS = 1;
function crowdTarget() {
  const S = G.soldiers;
  if (S <= visCap) return 1;
  return 1 + 0.42 * clamp(Math.log(S / visCap) / Math.log(20000 / visCap), 0, 1);
}
function formation(n) {
  /* Width tracks the asphalt. A centered wide line fills the road;
     steering past the edge, or a narrower road later, drops soldiers. */
  n = Math.max(1, n | 0);
  const wide = (G.form + 1) * 0.5;
  const roadW = Math.max(120, road.x1 - road.x0);
  /* the default square is about a third of the road, so it fits one gate panel;
     only a deliberate WIDE spread straddles both */
  const span = roadW * (0.12 + 0.72 * Math.pow(wide, 1.8));
  const spY = (8 + (1 - wide) * 10) * Math.max(0.7, Math.min(1, roadW / 480)) * crowdS;
  const aspect = Math.pow(2.6, G.form);
  let cols = Math.round(Math.sqrt(n) * aspect);
  cols = clamp(cols, 1, Math.min(n, wide > 0.72 ? 16 : 36));
  const body = n - 1;
  const rows = Math.max(1, Math.ceil(Math.max(1, body) / cols));
  /* small squads stay a tight knot; only big ones fill the road */
  const spX = cols <= 1 ? 0 : Math.min(span / (cols - 1), (22 + wide * 24) * crowdS);
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
  /* ease toward the new size in steps, so the formation is not rebuilt every frame */
  const ct = crowdTarget();
  if (Math.abs(ct - crowdS) > 0.02) crowdS += Math.sign(ct - crowdS) * Math.min(Math.abs(ct - crowdS), 0.02);
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
      const ri0 = i === 0 ? 8 : (4.2 + (bodyPh[i] % 1) * 2.4) * crowdS;
      for (let j = i + 1; j < n; j++) {
        let dx = bodyX[j] - bodyX[i];
        let dy = bodyY[j] - bodyY[i];
        const rj = j === 0 ? 8 : (4.2 + (bodyPh[j] % 1) * 2.4) * crowdS;
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
  const key = shown + ':' + G.form.toFixed(2) + ':' + ((road.x1 - road.x0) | 0) + ':' + crowdS.toFixed(2);
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
  if (G.grace > 0) G.grace -= dt;
  syncRoad();
  const keyX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const keyY = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (keyX) { aimX = clampAim(aimX + keyX * latMax() * dt); if (!G.steered) onFirstSteer(); }
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
      floatText(G.armyX, G.camY + 8, L('FALL', 'JATUH'), '#ff5d6a', 20, 2.4);
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
    floatText(G.armyX, G.camY + 40, L('NEW BEST!', 'REKOR BARU!'), '#ffd75d', 40, 4.6);
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
    floatText(G.armyX, G.camY + 30, L('LEVEL UP +', 'NAIK LEVEL +') + bonus, '#e2b657', 26, 3.8);
    wantSkill = true;
  }
  G.shake = Math.max(0, G.shake - dt * 22);
  fovKick = Math.max(0, fovKick - dt * 14);

  /* zone transition banner */
  const zi = (G.level - 1) % ZONES.length;
  if (zi !== zoneIdx) {
    zoneIdx = zi;
    tintProps();
    /* the zones loop every five levels; later laps say so */
    const lap = Math.floor((G.level - 1) / ZONES.length);
    const zoneName = ZONE_NAMES[zi] + (lap ? ' ' + ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][Math.min(7, lap - 1)] : '');
    /* zones turn over on a level-up: hold the name until the skill pick is out of the way */
    if (G.dist > 5) { if (wantSkill) pendingZone = [zoneName, lap ? '#ffcc33' : '']; else bannerFlash(zoneName, lap ? '#ffcc33' : ''); }
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
  const dmgPerBullet = (wt.dmg + G.upDmg) * Math.max(1, Math.ceil(G.soldiers / Math.max(1, shooters))) * stand * (1 + (META.up.fire || 0) * 0.04);
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
    for (const c of cages) {
      if (c.dead) continue;
      const dy = c.wy - muzzleWy;
      if (dy < -60 || dy > 1400) continue;
      const d = Math.hypot(c.x - mx, dy) * 0.8;
      if (d < best) { best = d; tgt = { x: c.x, wy: c.wy }; }
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
    if (!hit) for (const c of cages) {
      if (c.dead) continue;
      const dx = b.x - c.x, dy = b.wy - c.wy;
      if (dx * dx + dy * dy < 30 * 30) { hitCage(c, b.dmg); hit = true; break; }
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
    if (parts.length < MAXP - 4 && Math.random() < 0.6)
      parts.push({ x: p.x + rnd(-5, 5), wy: p.wy + rnd(-4, 8), h: 1 + rnd(-0.2, 0.2), vx: rnd(-10, 10), vwy: rnd(10, 30), vh: rnd(0.3, 1.2), t: 0, life: rnd(0.2, 0.4), color: Math.random() < 0.5 ? '#ff7a2a' : '#ffd06a' });
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
    if (e._dead) { e.label.remove(); dropBossBits(e); enemies.splice(i, 1); continue; }
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
    /* roar eases back to rest; letting it run negative shrank bosses to nothing */
    if (e.roar > 0) e.roar = Math.max(0, e.roar - dt * 1.4);
    /* boss entrance: name card, roar, a jolt, the moment it comes into view */
    if (e.boss && !e.introduced && e.wy - G.camY < 540) {
      e.introduced = true; e.roar = 1; e.fightT = 0; e.budget = 0;
      bannerFlash(bossTitle(e) + '!', '#ff5d4a');
      sfx.boss(); G.shake = Math.max(G.shake, 9); fovKick = Math.max(fovKick, 6); vib(60);
    }
    /* the showdown: once in view the boss keeps its distance, then closes in.
       Kill it in time or it wades into the squad */
    if (e.boss && e.introduced && e.hp > 0) {
      e.fightT += dt;
      e.budget = Math.min(e.maxhp * 0.22, (e.budget ?? 0) + e.maxhp * 0.22 * dt);
      /* after a short stomp through the squad it lumbers past and falls behind */
      const hold = Math.max(0, 500 - e.fightT * 75);
      if (e.fightT < 8.2 && e.wy - G.camY < hold) e.wy = G.camY + hold;
    }
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
    if (e.wy < G.camY - 320) { e.label.remove(); dropBossBits(e); enemies.splice(i, 1); continue; }
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
    if (m.band && !m.hinted && ahead < 760) { m.hinted = true; tutorialHint('band'); }
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
    if (m.clash && G.grace > 0) m.tick = 0;
    if (m.clash) {
      m.wy = G.camY + m.hd + sr * 0.35;
      m.x += (G.armyX - m.x) * Math.min(1, dt * 4);
      m.tick += dt;
      while (m.tick >= 0.05 && m.count > 0 && G.soldiers > 0 && G.grace <= 0) {
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
      if (h.deadT > 0.6) { scene.remove(h.grp); if (h.ownTex) h.ownTex.dispose(); hazards.splice(i, 1); }
      continue;
    }
    if (h.wy < G.camY - (h.len || 0) / 2 - 240) { scene.remove(h.grp); if (h.ownTex) h.ownTex.dispose(); hazards.splice(i, 1); continue; }
    if (h.wy - G.camY > 1500 || h.wy < G.camY - 200) continue;
    if (!h.hinted && h.wy - (h.len || 0) / 2 - G.camY < 720) { h.hinted = true; tutorialHint(h.kind); }
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
          if (dd >= h.r + sr && dd < h.r + sr * 2.2) closeCall(h.x, h.wy);
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
    if (h.kind === 'saw') {
      const dSaw = Math.hypot(sawX(h) - G.armyX, h.wy - G.camY) - (h.r + sr * 0.75);
      if (dSaw < 0) h.hit = true;
      if (Math.abs(h.wy - G.camY) < 40) h.near = Math.min(h.near === undefined ? 1e9 : h.near, dSaw);
      if (!h.paid && h.wy < G.camY - 40) { h.paid = true; if (!h.hit && h.near < 34) closeCall(sawX(h), h.wy); }
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
    if (g.announce && g.wy - G.camY < 900) { g.announce = false; bannerFlash(L('GOLDEN GATE', 'GERBANG EMAS'), '#ffd75d'); tone(1320, 0.1, 'sine', 0.05); }
    if (!g.passed && G.camY >= g.wy) { g.passed = true; applyGate(g); }
    if (g.wy < G.camY - 200) { removeGate(g); gates.splice(i, 1); }
  }

  /* walls */
  for (let i = walls.length - 1; i >= 0; i--) {
    const w = walls[i];
    if (!w.dead && !w.hinted && w.wy - G.camY < 720) { w.hinted = true; tutorialHint('wall'); }
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
      G.coinFrac += (1 + (G.skills.greed || 0) * 0.25) * coinMult();
      const gain = Math.floor(G.coinFrac);
      G.coinFrac -= gain;
      G.coins += gain; G.coinsRun += gain; G.coinsPicked += 1; G.coinsPickedVal += gain; touchSave();
      coinLadder();
      coinToHud(c.x, c.wy);
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

  /* cages: ram one and half the prisoners get out; leave it behind and they stay */
  for (let i = cages.length - 1; i >= 0; i--) {
    const c = cages[i];
    c.pop = Math.min(1, c.pop + dt * 4);
    if (c.hitT > 0) c.hitT -= dt;
    if (!c.dead && Math.abs(c.wy - G.camY) < 26 && Math.abs(c.x - G.armyX) < sr * 0.6 + 30) breakCage(c, true);
    if (c.dead || c.wy < G.camY - 200) { if (!c.dead) { scene.remove(c.grp); c.label.remove(); } cages.splice(i, 1); }
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
    if (enemies[i]._dead) { enemies[i].label.remove(); dropBossBits(enemies[i]); enemies.splice(i, 1); }
  }
  checkMissions();
  /* level up: a beat of slow motion and a ring before the cards come up */
  if (wantSkill && G.mode === 'run') { skillDelay = 0.55; hitstop(0.5); ringT = 0; ringMat.color.set('#ffcc33'); sfx.fanfare(); }
  if (skillDelay > 0) { skillDelay -= dt; if (skillDelay <= 0 && G.mode === 'run') offerSkills(); }
  else if (pendingZone && G.mode === 'run') { bannerFlash(pendingZone[0], pendingZone[1]); pendingZone = null; }
}

/* ---------------- draw ---------------- */
const dummy = new THREE.Object3D();
const tmpCol = new THREE.Color();
/* wrap into [0, L) for any sign; scenery z = wrapZ(base + scroll, L) - L + near grows as you run */
const wrapZ = (v, L) => ((v % L) + L) % L;
let soldierOffsets = [];
let soldierBirth = [];

let lastDraw = performance.now(), camIntro = 0, deathCam = 0;
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
  stepWeather(FD, zi, (G.mode === 'run' ? G.speed : G.mode === 'menu' ? 70 : 0) * K, t);
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
  const shk = shakeOff ? 0 : G.shake;
  const shx = (Math.random() - 0.5) * shk * 0.02;
  const shy = (Math.random() - 0.5) * shk * 0.02;
  const camZoom = Math.max(0, squadRadius() * K - 1.2) * 0.55;
  /* run start: the camera swoops down from a high wide shot into the chase cam */
  if (camIntro > 0) camIntro = Math.max(0, camIntro - FD / 0.9);
  const swoop = camIntro * camIntro * (3 - 2 * camIntro);
  /* dying: ease the camera in on the squad as it falls apart */
  const doomK = G.mode === 'dying' ? clamp(1 - deathT / 0.78, 0, 1) : G.mode === 'over' ? 1 : 0;
  deathCam += (doomK - deathCam) * Math.min(1, FD * 6);
  const push = deathCam * deathCam * (3 - 2 * deathCam);
  camera.position.set(axw * 0.55 + shx, 10.5 + shy + camZoom * 0.6 + swoop * 9 - push * 4.2, 12.5 + camZoom + swoop * 7 - push * 5.5);
  camera.lookAt(axw * 0.35, 1.0 - swoop * 0.5, -12 - swoop * 10);
  camera.rotateZ(bank);
  /* wide screens see too much empty roadside at 62deg: tighten so the road fills the frame */
  const baseFov = W / H > 1.25 ? 50 : 62;
  const fovT = baseFov + (shakeOff ? 0 : fovKick) + Math.max(0, G.speed - SPEED_BASE) * 0.02;
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
  roadTex.offset.y = (scroll / 300) * 22 % 1;
  let pi = 0;
  for (let i = 0; i < NPOST; i++) {
    const zPos = wrapZ(i * POST_GAP + scroll, NPOST * POST_GAP) - NPOST * POST_GAP + 8;
    for (const sx of [-1, 1]) {
      dummy.position.set(sx * (roadHalf + 0.55), 0.55, zPos);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postMesh.setMatrixAt(pi++, dummy.matrix);
    }
  }
  postMesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < NDASH; i++) {
    const zPos = wrapZ(i * DASH_GAP + scroll, NDASH * DASH_GAP) - NDASH * DASH_GAP + 6;
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
      const zPos = wrapZ(sl.off + scroll * 2.4, 120) - 110;
      dummy.position.set(sl.x, sl.h, zPos);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      speedLineMesh.setMatrixAt(i, dummy.matrix);
    }
    speedLineMesh.instanceMatrix.needsUpdate = true;
  }

  /* chevrons */
  for (let i = 0; i < NCHEV; i++) {
    const zPos = wrapZ(i * CHEV_GAP + scroll, NCHEV * CHEV_GAP) - NCHEV * CHEV_GAP + 5;
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
    const zPos = wrapZ((p.x > 0 ? 1 : -1) * 7 + p.ry * 31 + scroll, span) - span - 20;
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
    const zPos = wrapZ(p.off + scroll, spanL) - spanL;
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
    const zPos = wrapZ(p.off + scroll, spanL) - spanL;
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
    const zPos = wrapZ(i * 7.5 + scroll, NLAMP * 7.5) - NLAMP * 7.5;
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
    const zPos = wrapZ(p.off + scroll, 180) - 180;
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
    const zPos = wrapZ((p.x > 0 ? 1 : -1) * 11 + p.ry * 29 + scroll, PROP_RANGE) - PROP_RANGE - 20;
    dummy.position.set(p.x, 0.012, zPos);
    dummy.rotation.set(-Math.PI / 2, 0, p.ry);
    dummy.scale.set(p.s * 1.5, p.s, 1);
    dummy.updateMatrix();
    patchMesh.setMatrixAt(pi2++, dummy.matrix);
  }
  patchMesh.count = pi2; patchMesh.instanceMatrix.needsUpdate = true;

  /* shadows (filled across sections below) */
  let shI = 0;

  /* the army count rides above the crowd, the way every crowd runner shows it */
  if (G.mode === 'run' || G.mode === 'pick' || G.mode === 'paused' || G.mode === 'dying') {
    const n = Math.round(G.soldiers);
    if (n !== squadShownN) {
      squadNumEl.textContent = fmtNum(n);
      if (Math.abs(n - squadShownN) >= Math.max(3, squadShownN * 0.04)) { squadNumEl.classList.remove('pop'); void squadNumEl.offsetWidth; squadNumEl.classList.add('pop'); }
      squadLabel.classList.toggle('low', n < 10);
      squadShownN = n;
    }
    setLabel(squadLabel, axw, 2.5 + (crowdS - 1) * 1.6, 0.9);
  } else squadLabel.style.display = 'none';
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
    dummy.scale.setScalar((lead ? 1.65 * Math.max(1, crowdS * 0.92) : 1.3 * bulk * crowdS) * born);
    dummy.updateMatrix();
    soldierBody.setMatrixAt(i, dummy.matrix);
    if (i < MAXS) hatMesh.setMatrixAt(i, dummy.matrix);
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
  soldierBody.visible = !(G.grace > 0 && G.mode === 'run' && Math.floor(t * 12) % 2 === 1);
  setHat(G.skin);
  hatMesh.count = shown;
  if (hatFor && HATS[hatFor]) hatMesh.visible = soldierBody.visible;
  hatMesh.instanceMatrix.needsUpdate = true;
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
    if (zP > 14) { e.label.style.display = 'none'; if (e.aura) e.aura.visible = false; if (e.acc) e.acc.visible = false; continue; }
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
      if (e.acc) {
        e.acc.visible = true;
        e.acc.position.set(wx(e.x), hop, zP);
        e.acc.rotation.set(e.attacking ? 0.35 : 0, Math.sin(t * 2.2 + e.x) * 0.14, 0);
        e.acc.scale.setScalar(s);
        if (e.splitter) for (let k = 0; k < e.acc.children.length; k++) e.acc.children[k].scale.setScalar(1 + Math.sin(t * 6 + k * 2) * 0.18);
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
    const labelY = e.boss ? s * 3.05 + 0.3 : s * d.labelY + 0.4;
    setLabel(e.label, wx(e.x), labelY, zP, fmtNum(Math.ceil(e.hp)));
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
    const base = m.hitT > 0 ? '#ffb0b0' : (m.clash ? '#ff7a6a' : '#e8485a');
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
      if (ei < MAXE && i < (Q.phone ? 30 : 60)) {
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
      h.blade.rotation.z = -(t * 12 + h.phase);
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

  /* cages */
  for (const c of cages) {
    const zP = wz(c.wy);
    c.grp.visible = zP < 14;
    c.grp.position.set(wx(c.x) + (c.hitT > 0 ? Math.sin(c.hitT * 60) * c.hitT * 0.5 : 0), -(1 - c.pop) * 2.4, zP);
    for (let k = 0; k < c.prisoners.length; k++) {
      const pm = c.prisoners[k];
      pm.position.y = 0.18 + Math.abs(Math.sin(t * 7 + k * 1.3)) * 0.22;
      pm.rotation.z = Math.sin(t * 5 + k) * 0.12;
    }
    c.lock.material.rotation = Math.sin(t * 3) * 0.15;
    setLabel(c.label, wx(c.x), 3.6, zP, '+' + c.n);
    c.label.style.setProperty('--hp', Math.max(0, 100 * c.hp / c.maxhp).toFixed(0) + '%');
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
    /* a coin in flight turns its face to you instead of flashing edge-on */
    const flying = c.fly !== undefined;
    dummy.rotation.set(0, flying ? Math.sin(t * 9 + c.spin) * 0.35 : t * 3.4 + c.spin, 0);
    const sc = (flying ? 1.12 : 1) * 1.25 + Math.min(0.3, Math.max(0, -zP) * 0.012);
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
    /* fireballs: bigger, pulsing hot, with a ground shadow so you can judge the dodge */
    const pulse = Math.sin(t * 14 + p.t * 9);
    dummy.position.set(wx(p.x), 1.0, zP);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1 + pulse * 0.15);
    dummy.updateMatrix();
    if (ebi < MAXEB) {
      ebulletMesh.setMatrixAt(ebi, dummy.matrix);
      ebulletMesh.setColorAt(ebi, tmpCol.set('#ff6a1a').lerp(col3('#fff1a8'), 0.35 + pulse * 0.3));
      ebi += 1;
    }
    if (shI < MAXSH) {
      dummy.position.set(wx(p.x), 0.06, zP);
      dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1.1, 0.8, 1);
      dummy.updateMatrix();
      shadowMesh.setMatrixAt(shI++, dummy.matrix);
    }
  }
  shadowMesh.count = shI; shadowMesh.instanceMatrix.needsUpdate = true;
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
      for (const e of enemies) if (e.boss && e.introduced && e.hp > 0 && (!bo || e.wy < bo.wy)) bo = e;
    bossBar.classList.toggle('on', !!bo);
    if (bo) {
      if (bossName) bossName.textContent = bossTitle(bo);
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
  /* closing in on the record: count it down */
  if (bestInEl) {
    const left = Math.ceil(G.best - G.dist);
    const on = (G.mode === 'run' || G.mode === 'paused') && G.best > 0 && left > 0 && left <= 150;
    bestInEl.classList.toggle('on', on);
    if (on) bestInEl.textContent = L('BEST IN ', 'REKOR ') + left + 'm';
  }
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
    formLabel.textContent = G.form > 0.34 ? L('WIDE', 'MELEBAR') : G.form < -0.34 ? L('COLUMN', 'BARISAN') : L('SQUARE', 'KOTAK');
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
  if (formHud) { const on = G.mode === 'run' || G.mode === 'pick'; formHud.style.opacity = on ? '1' : '0'; formHud.style.pointerEvents = on ? 'auto' : 'none'; }
  hintEl.style.opacity = hintT > 0 && G.mode === 'run' ? '0.9' : '0';
  if (tutEl) tutEl.classList.toggle('on', G.mode === 'run' && !G.steered && META.runs <= 3 && G.time > 0.6 && G.time < 14);
  labelsEl.style.visibility = G.mode === 'pick' ? 'hidden' : 'visible';
  floatsEl.style.visibility = G.mode === 'pick' ? 'hidden' : 'visible';

  if (!SIM.noRender) renderer.render(scene, camera);
}

/* test hook: ?debug exposes state so headless playtests can drive the run */
if (/[?&]debug\b/.test(location.search)) {
  window.__mob = {
    G, SIM, META, UPGRADES, beginDeath, update, draw, shareCard, scrollProbe() { const m = new THREE.Matrix4(); dashMesh.getMatrixAt(3, m); const dz = m.elements[14]; trunkMesh.getMatrixAt(2, m); const tz = m.elements[14]; const g = gates.find((q) => q.grp); return { dash: +dz.toFixed(2), tree: +tz.toFixed(2), gate: g ? +g.grp.position.z.toFixed(2) : null }; }, addEnemy(kind, x, wy, hp) { const e = mkEnemy(kind, x, wy, hp); enemies.push(e); return e; }, get rinfo() { return renderer.info.render; }, get rmem() { return renderer.info.memory; }, geoLive() { const m = new Map(); scene.traverse((o) => { if (o.geometry) m.set(o.geometry.uuid, (o.geometry.type || '') + ':' + (o.geometry.attributes.position ? o.geometry.attributes.position.count : 0)); }); return [...m.values()]; }, geoStats() { const out = []; scene.traverse((o) => { if (!o.isMesh || !o.visible) return; const g = o.geometry; const tri = (g.index ? g.index.count : g.attributes.position.count) / 3; const n = o.isInstancedMesh ? o.count : 1; if (tri * n > 2000) out.push([o.name || g.type, Math.round(tri), n, Math.round(tri * n)]); }); return out.sort((a, b) => b[3] - a[3]); }, startGame, gameOver, chooseSkill, transformCount, gateMid, revive, spawnMob, hurtMob, spawnBoss, spawnHazard, spawnWall, spawnMeteor, spawnBarrels, spawnCage, get cages() { return cages; },
    get gates() { return gates; }, get enemies() { return enemies; }, get walls() { return walls; },
    get hazards() { return hazards; }, get barrels() { return barrels; }, get coins() { return coins; },
    get road() { return road; }, get W() { return W; }, get H() { return H; }, get mobs() { return mobs; },
    setAim(x, f) { aimX = clampAim(x); if (f !== undefined) aimForm = f; },
    sfx, coinLadder, get audioOut() { return { AC, MASTER }; }, sawX, squadRadius, bodies() { return Array.from(bodyX.slice(0, bodyN)); },
  };
}
scene.traverse(o => { if (o.isInstancedMesh || o.isPoints) o.frustumCulled = false; });
if (LANG === 'id') {
  const setT = (sel, txt) => { const el = document.querySelector(sel); if (el) el.firstChild ? (el.firstChild.nodeValue = txt) : (el.textContent = txt); };
  setT('.ribbon', 'BESARKAN PASUKAN · HANCURKAN SEMUA');
  setT('#playBtn', 'MAIN');
  setT('#shopBtn', 'GUDANG');
  setT('#shopBtnOver', 'GUDANG');
  setT('#againBtn', 'MAIN LAGI');
  setT('#skillOverlay .sub', 'Pilih satu. Bisa ditumpuk.');
  setT('#shopOverlay .head', 'GUDANG');
  setT('#shopClose', 'KEMBALI');
  setT('#settingsOverlay .head', 'PENGATURAN');
  setT('#setClose', 'SELESAI');
  setT('#pauseOverlay .head', 'JEDA');
  setT('#resumeBtn', 'LANJUT');
  setT('#pauseSet', 'PENGATURAN');
  setT('#pauseQuit', 'AKHIRI RUN');
  setT('#installCard b', 'PASANG MOB RUN DI LAYAR UTAMA');
  setT('#installBtn', 'PASANG');
  setT('#installNo', 'NANTI SAJA');
  setT('#hudForm .t', 'FORMASI');
  const heads = document.querySelectorAll('#shopOverlay .shopHead');
  if (heads[0]) heads[0].textContent = 'UPGRADE';
  if (heads[1]) heads[1].textContent = 'WARNA PASUKAN';
}
document.body.classList.remove('loading');
resize();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
