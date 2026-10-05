/* MOB RUN — a "Last War ad" style gate-runner. Canvas, no deps. */
(() => {
'use strict';

const cv = document.getElementById('game');
const cx = cv.getContext('2d');
const startOv = document.getElementById('startOverlay');
const overOv = document.getElementById('overOverlay');
const overStats = document.getElementById('overStats');
const muteBtn = document.getElementById('muteBtn');
const bestLine = document.getElementById('bestLine');

let W = 0, H = 0, DPR = 1;
const road = { x0: 0, x1: 0 };
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  road.x0 = W * 0.08; road.x1 = W * 0.92;
}
window.addEventListener('resize', resize);
resize();

/* ---------------- audio ---------------- */
let AC = null, muted = false;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type, vol, slideTo) {
  const ac = audio(); if (!ac || muted) return;
  const t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + dur);
}
function noise(dur, vol) {
  const ac = audio(); if (!ac || muted) return;
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(); s.buffer = buf;
  const g = ac.createGain(); g.gain.value = vol;
  s.connect(g); g.connect(ac.destination); s.start();
}
const sfx = {
  shoot: () => tone(880 + Math.random() * 220, 0.05, 'square', 0.02),
  good: () => { tone(620, 0.09, 'sine', 0.09); setTimeout(() => tone(930, 0.12, 'sine', 0.09), 60); },
  great:() => { tone(520, 0.09, 'sine', 0.1); setTimeout(() => tone(780, 0.09, 'sine', 0.1), 55); setTimeout(() => tone(1170, 0.16, 'sine', 0.11), 110); },
  bad:  () => tone(160, 0.25, 'sawtooth', 0.1, 90),
  kill: () => tone(340 + Math.random() * 120, 0.06, 'triangle', 0.045, 120),
  hurt: () => tone(120, 0.12, 'sawtooth', 0.07, 70),
  boss: () => { tone(90, 0.5, 'sawtooth', 0.12, 45); noise(0.35, 0.12); },
  power:() => { tone(500, 0.08, 'square', 0.08); setTimeout(() => tone(1000, 0.14, 'square', 0.08), 70); },
  boom: () => { noise(0.5, 0.22); tone(70, 0.4, 'sine', 0.15, 35); },
  barrel:() => { noise(0.15, 0.1); tone(300, 0.12, 'triangle', 0.08, 80); },
};
muteBtn.addEventListener('click', (e) => { e.stopPropagation(); muted = !muted; muteBtn.textContent = muted ? '🔇' : '🔊'; });

/* ---------------- palettes (zone shifts per level) ---------------- */
const ZONES = [
  { bg:'#0e1526', road:'#1a2440', edge:'#2c3f63', dash:'#243252', side:'#101a33' },  // night
  { bg:'#0f1f10', road:'#1d3319', edge:'#35572b', dash:'#284722', side:'#142812' },  // toxic green
  { bg:'#241209', road:'#3d2214', edge:'#5f3a28', dash:'#492d1e', side:'#301a0d' },  // ember
  { bg:'#1c0f24', road:'#301a3d', edge:'#4f2b5f', dash:'#3c2249', side:'#271430' },  // void purple
  { bg:'#0a1c22', road:'#143240', edge:'#235063', dash:'#1c4052', side:'#0f2833' },  // deep teal
];
const ZONE_NAMES = ['NIGHTFALL', 'TOXIC FLATS', 'EMBER RIDGE', 'VOID ZONE', 'DEEP RUN'];

/* ---------------- weapon tiers ---------------- */
const WT = [
  { name:'PISTOL',  dmg:1, rate:0.24, spread:1, col:'#ffe97d' },
  { name:'SMG',     dmg:1, rate:0.15, spread:1, col:'#7de8ff' },
  { name:'RIFLE',   dmg:2, rate:0.13, spread:2, col:'#a8ffb0' },
  { name:'SHOTGUN', dmg:3, rate:0.19, spread:3, col:'#ff9d5d' },
  { name:'MINIGUN', dmg:2, rate:0.065,spread:3, col:'#ff6bd8' },
  { name:'ANNIHILATOR', dmg:5, rate:0.11, spread:3, col:'#ff4040' },
];

/* ---------------- state ---------------- */
const G = {
  mode: 'menu',
  camY: 0, speed: 150,
  armyX: 0, soldiers: 10,
  kills: 0, dist: 0, level: 1, peak: 10, best: 0,
  tier: 0, upDmg: 0, upRate: 0,          // weapon tier + minor upgrades
  streak: 0, killChain: 0, killChainT: 0, mileIdx: 0,
  shake: 0, slow: 0,
};
const MILES = [100, 250, 500, 1000, 2000, 4000];
const ANCHOR_FRAC = 0.74;
const anchorY = () => H * ANCHOR_FRAC;
const wy2sy = (wy) => anchorY() - (wy - G.camY);

let gates = [], enemies = [], walls = [], pickups = [], barrels = [];
let bullets = [], parts = [], floats = [], rewards = [];
let nextY = 400, bossCounter = 0, gatesSpawned = 0;
let fireAcc = 0, drainAcc = 0, shootSfxAcc = 0;
let hintT = 0, zoneIdx = -1;

const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const chance = (p) => Math.random() < p;

/* ---------------- input ---------------- */
let dragging = false, lastPX = 0, keyDir = 0;
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
  else if (e.key === ' ' || e.key === 'Enter') press();
});
document.addEventListener('keyup', e => {
  if ((e.key === 'ArrowLeft' && keyDir === -1) || (e.key === 'ArrowRight' && keyDir === 1)) keyDir = 0;
});

/* ---------------- spawning ---------------- */
function schedule() {
  while (nextY < G.camY + H * 1.7) {
    const roll = Math.random();
    if (roll < 0.42) spawnGate(nextY);
    else if (roll < 0.68) spawnPack(nextY);
    else if (roll < 0.78) spawnBarrels(nextY);
    else if (roll < 0.88) spawnHorde(nextY);
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
  const moving = gatesSpawned > 3 && chance(0.22)
    ? { amp: rnd(30, 70), speed: rnd(0.0016, 0.0032), phase: rnd(0, 6) } : null;
  gates.push({ wy, passed: false, moving, mid: (road.x0 + road.x1) / 2,
    panels: [{ ...pair[0], side: 0 }, { ...pair[1], side: 1 }] });
}

function mkEnemy(kind, x, wy, hp) {
  const d = G.level;
  const base = { x, wy, maxhp: hp, attacking: false, boss: false, kind };
  if (kind === 'runner') return { ...base, hp, r: rnd(8, 10), drift: rnd(22, 34), col: '#ff6b5d', drain: 1 };
  if (kind === 'brute')  return { ...base, hp, r: rnd(22, 27), drift: rnd(2, 5), col: '#a32233', drain: 2 };
  if (kind === 'split')  return { ...base, hp, r: rnd(14, 16), drift: rnd(8, 14), col: '#c96bff', drain: 1 };
  if (kind === 'gold')   return { ...base, hp, r: rnd(13, 15), drift: rnd(6, 10), col: '#ffd75d', drain: 1 };
  if (kind === 'boss')   return { ...base, hp, r: 34, drift: 4, col: '#c93a2e', drain: 2, boss: true };
  return { ...base, hp, r: rnd(11, 15), drift: rnd(6, 16), col: '#e8485a', drain: 1 };
}

function spawnPack(wy) {
  const d = G.level;
  const cxp = rnd(road.x0 + 40, road.x1 - 40);
  const roll = Math.random();
  if (roll < 0.28 && d >= 1) {           // swarm of runners
    const n = ri(4, 7) + Math.min(d, 3);
    for (let i = 0; i < n; i++)
      enemies.push(mkEnemy('runner', clamp(cxp + rnd(-80, 80), road.x0 + 12, road.x1 - 12),
        wy + rnd(-80, 80), Math.round((4 + d * 2) * rnd(0.8, 1.3))));
  } else if (roll < 0.45 && d >= 2) {    // brute escorted
    enemies.push(mkEnemy('brute', cxp, wy, Math.round((40 + d * 26) * rnd(0.9, 1.2))));
    for (let i = 0; i < ri(1, 2); i++)
      enemies.push(mkEnemy('normal', clamp(cxp + rnd(-50, 50), road.x0 + 16, road.x1 - 16),
        wy + rnd(-50, 50), Math.round((7 + d * 4) * rnd(0.8, 1.3))));
  } else if (roll < 0.58 && d >= 2) {    // splitter nest
    for (let i = 0; i < ri(2, 3); i++)
      enemies.push(mkEnemy('split', clamp(cxp + rnd(-60, 60), road.x0 + 16, road.x1 - 16),
        wy + rnd(-60, 60), Math.round((14 + d * 5) * rnd(0.9, 1.3))));
  } else {                               // normal pack
    const n = ri(2, 4) + Math.min(Math.floor(d * 0.7), 3);
    for (let i = 0; i < n; i++)
      enemies.push(mkEnemy('normal', clamp(cxp + rnd(-70, 70), road.x0 + 16, road.x1 - 16),
        wy + rnd(-60, 60), Math.round((7 + d * 4) * rnd(0.8, 1.4))));
  }
  if (chance(0.05)) enemies.push(mkEnemy('gold', rnd(road.x0 + 30, road.x1 - 30), wy, Math.round(30 + d * 18)));
}

function spawnHorde(wy) {
  const d = G.level;
  const n = ri(10, 14) + Math.min(d, 6);
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
  const hp = Math.round((26 + d * 24) * rnd(0.85, 1.2));
  walls.push({ wy, hp, maxhp: hp, dead: false });
}

function spawnBoss(wy) {
  const d = G.level;
  const hp = Math.round(45 + d * 55);
  const bx = (road.x0 + road.x1) / 2 + rnd(-60, 60);
  enemies.push(mkEnemy('boss', bx, wy, hp));
  if (d >= 3 && chance(0.5)) {
    enemies.push(mkEnemy('normal', clamp(bx - 60, road.x0 + 16, road.x1 - 16), wy + 40, Math.round(10 + d * 4)));
    enemies.push(mkEnemy('normal', clamp(bx + 60, road.x0 + 16, road.x1 - 16), wy + 40, Math.round(10 + d * 4)));
  }
}

/* GENTONG — numbered barrels you shoot for loot */
function spawnBarrels(wy) {
  const d = G.level;
  const n = ri(1, 3);
  const kinds = ['weapon', 'heal', 'bomb', 'gold', 'upgrade'];
  for (let i = 0; i < n; i++) {
    const kind = kinds[ri(0, kinds.length - 1)];
    barrels.push({
      x: rnd(road.x0 + 34, road.x1 - 34), wy: wy + i * rnd(40, 90) + rnd(-20, 20),
      hp: Math.round((10 + d * 7) * rnd(0.85, 1.2)), maxhp: 0, kind,
    });
  }
  for (const b of barrels) if (!b.maxhp) b.maxhp = b.hp;
}

function spawnPickup(wy) {
  const kinds = ['rate', 'dmg', 'spread', 'heal'];
  pickups.push({ x: rnd(road.x0 + 30, road.x1 - 30), wy, kind: kinds[ri(0, kinds.length - 1)], taken: false });
}

/* ---------------- combat helpers ---------------- */
function squadRadius() { return clamp(14 + G.soldiers * 0.30, 20, 64); }

function addSoldiers(n) {
  const prevPeak = G.peak;
  G.soldiers = clamp(Math.round(n), 0, 9999);
  G.peak = Math.max(G.peak, G.soldiers);
  while (G.mileIdx < MILES.length && G.peak >= MILES[G.mileIdx]) {
    if (MILES[G.mileIdx] > prevPeak) {
      floatText(G.armyX, anchorY() - 110, 'ARMY ' + MILES[G.mileIdx] + '!', '#ffd75d', 36);
      sfx.great(); G.shake = Math.max(G.shake, 8);
    }
    G.mileIdx += 1;
  }
  if (G.soldiers <= 0) gameOver();
}

function gateLabel(p) {
  if (p.t === 'add') return '+' + p.v;
  if (p.t === 'sub') return '-' + p.v;
  if (p.t === 'mul') return '×' + p.v;
  if (p.t === 'gun') return '🔫UP';
  return '÷' + p.v;
}
function gateGood(p) { return p.t === 'add' || p.t === 'mul' || p.t === 'gun'; }
function gateMid(g) {
  if (!g.moving) return g.mid;
  return g.mid + Math.sin(performance.now() * g.moving.speed + g.moving.phase) * g.moving.amp;
}

function applyGate(g) {
  const p = (G.armyX < gateMid(g)) ? g.panels[0] : g.panels[1];
  let delta = 0, gunUp = false;
  if (p.t === 'gun') { gunUp = true; }
  else if (p.t === 'add') delta = p.v;
  else if (p.t === 'sub') delta = -p.v;
  else if (p.t === 'mul') delta = G.soldiers * (p.v - 1);
  else delta = Math.ceil(G.soldiers / p.v) - G.soldiers;
  if (G.soldiers + delta < 1) delta = 1 - G.soldiers;
  addSoldiers(G.soldiers + delta);
  const good = gunUp || delta >= 0;
  if (good) { G.streak += 1; } else { G.streak = 0; }
  if (gunUp) { weaponUp(); }
  const lab = gunUp ? 'WEAPON UP!' : ((delta >= 0 ? '+' : '') + delta);
  floats.push({ x: G.armyX, y: anchorY() - 70, vy: -60, t: 0, life: 1.0,
    text: (!gunUp && (p.t === 'mul' || p.t === 'div') ? gateLabel(p) + ' → ' : '') + lab,
    color: good ? (p.t === 'mul' || gunUp ? '#ffd75d' : '#7dff9b') : '#ff5d6a',
    size: p.t === 'mul' || gunUp ? 34 : 26 });
  if (G.streak >= 3) floats.push({ x: G.armyX, y: anchorY() - 120, vy: -50, t: 0, life: 1.0,
    text: 'STREAK ×' + G.streak, color: '#7de8ff', size: 20 });
  if (good) (p.t === 'mul' && p.v >= 3 || gunUp ? sfx.great : sfx.good)();
  else sfx.bad();
  G.shake = p.t === 'mul' ? 7 : 4;
  for (let i = 0; i < 18; i++) parts.push(mkPart(G.armyX + rnd(-30, 30), anchorY() + rnd(-30, 0),
    good ? '#7dff9b' : '#ff5d6a'));
}

function weaponUp() {
  if (G.tier < WT.length - 1) {
    G.tier += 1;
    floatText(G.armyX, anchorY() - 100, WT[G.tier].name + '!', WT[G.tier].col, 30);
    sfx.great();
  } else { G.upDmg += 2; floatText(G.armyX, anchorY() - 100, 'DMG +2', '#ffd75d', 26); }
}

function mkPart(x, y, color) {
  const a = rnd(0, Math.PI * 2), s = rnd(60, 260);
  return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: 0, life: rnd(0.3, 0.7), color, r: rnd(2, 5) };
}
function floatText(x, y, text, color, size) {
  floats.push({ x, y, vy: -55, t: 0, life: 0.9, text, color, size: size || 18 });
}

/* ---------------- game flow ---------------- */
function startGame() {
  G.mode = 'run'; G.camY = 0; G.speed = 150;
  G.armyX = W / 2; G.soldiers = 10; G.kills = 0; G.dist = 0; G.level = 1; G.peak = 10;
  G.tier = 0; G.upDmg = 0; G.upRate = 0;
  G.streak = 0; G.killChain = 0; G.killChainT = 0; G.mileIdx = 0;
  G.shake = 0; G.slow = 0;
  gates = []; enemies = []; walls = []; pickups = []; barrels = [];
  bullets = []; parts = []; floats = []; rewards = [];
  nextY = H * 0.9; bossCounter = 0; gatesSpawned = 0; fireAcc = 0; drainAcc = 0; hintT = 4; zoneIdx = -1;
  startOv.style.display = 'none'; overOv.style.display = 'none';
}

function gameOver() {
  G.mode = 'over';
  const d = Math.floor(G.dist);
  const isBest = d > G.best;
  if (isBest) { G.best = d; try { localStorage.setItem('mobrun_best', String(d)); } catch (e) {} }
  overStats.innerHTML =
    `${isBest ? '<b style="color:#ffd75d">NEW BEST!</b><br>' : ''}` +
    `Distance <b>${d}m</b> · Kills <b>${G.kills}</b><br>` +
    `Biggest army <b>${G.peak}</b> · Level <b>${G.level}</b> · Best <b>${G.best}m</b>`;
  overOv.style.display = 'flex';
  sfx.boss();
}

try { G.best = parseInt(localStorage.getItem('mobrun_best') || '0', 10) || 0; } catch (e) {}
if (bestLine) bestLine.textContent = G.best ? `BEST RUN: ${G.best}m` : '';

/* ---------------- update ---------------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (G.mode !== 'run') { draw(); return; }
  if (G.slow > 0) { G.slow -= dt; dt *= 0.35; }
  update(dt);
  draw();
}
requestAnimationFrame(frame);

function update(dt) {
  hintT = Math.max(0, hintT - dt);
  if (keyDir) { G.armyX += keyDir * W * 1.1 * dt; clampArmy(); }
  if (G.killChainT > 0) { G.killChainT -= dt; if (G.killChainT <= 0) G.killChain = 0; }

  G.speed = 150 + Math.min(G.level * 14, 90);
  G.camY += G.speed * dt;
  G.dist = G.camY / 40;
  G.level = 1 + Math.floor(G.dist / 120);
  G.shake = Math.max(0, G.shake - dt * 22);

  /* zone transition banner */
  const zi = (G.level - 1) % ZONES.length;
  if (zi !== zoneIdx) {
    zoneIdx = zi;
    if (G.dist > 5) floatText(W / 2, H * 0.3, ZONE_NAMES[zi], '#9fb4d8', 30);
  }

  schedule();

  /* squad firing */
  const wt = WT[G.tier];
  const shooters = Math.min(G.soldiers, 60);
  const dmgPerBullet = (wt.dmg + G.upDmg) * Math.max(1, Math.ceil(G.soldiers / shooters));
  const rate = Math.max(0.05, wt.rate - G.upRate);
  fireAcc += dt;
  const interval = rate / Math.max(1, shooters * 0.09);
  while (fireAcc >= interval) {
    fireAcc -= interval;
    const offs = formation(shooters);
    const o = offs[ri(0, offs.length - 1)];
    const mx = G.armyX + o.x, my = anchorY() - 24;
    let tvx = 0, tvy = -760, tgt = null, best = 640;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const ey = wy2sy(e.wy);
      if (ey > my + 10 || ey < -80) continue;
      const d = Math.hypot(e.x - mx, ey - my);
      if (d < best) { best = d; tgt = { x: e.x, y: ey }; }
    }
    for (const b of barrels) {
      const by = wy2sy(b.wy);
      if (by > my + 10 || by < -80) continue;
      const d = Math.hypot(b.x - mx, by - my) * 0.85;  // slight preference: loot!
      if (d < best) { best = d; tgt = { x: b.x, y: by }; }
    }
    for (const w of walls) {
      if (w.dead) continue;
      const wy = wy2sy(w.wy);
      if (wy > my + 10 || wy < -60) continue;
      const d = Math.abs(wy - my) + Math.abs(W / 2 - mx) * 0.5;
      if (d < best) { best = d; tgt = { x: mx, y: wy }; }
    }
    if (tgt) {
      const dx = tgt.x - mx, dy = tgt.y - my, len = Math.hypot(dx, dy) || 1;
      tvx = (dx / len) * 760; tvy = (dy / len) * 760;
    }
    for (let s = 0; s < wt.spread; s++) {
      const jit = (s - (wt.spread - 1) / 2) * 0.10 + rnd(-0.03, 0.03);
      const cs = Math.cos(jit), sn = Math.sin(jit);
      bullets.push({ x: mx, y: my, vx: tvx * cs - tvy * sn, vy: tvx * sn + tvy * cs,
        dmg: dmgPerBullet, col: wt.col });
    }
    shootSfxAcc += 1;
    if (shootSfxAcc % 4 === 0) sfx.shoot();
  }
  if (bullets.length > 500) bullets.splice(0, bullets.length - 500);

  /* bullets */
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -20 || b.x < -20 || b.x > W + 20 || b.y > H + 20) { bullets.splice(i, 1); continue; }
    let hit = false;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const ey = wy2sy(e.wy);
      if (ey > anchorY() + 40 || ey < -90) continue;
      const dx = b.x - e.x, dy = b.y - ey;
      if (dx * dx + dy * dy < (e.r + 6) * (e.r + 6)) { hurt(e, b.dmg); hit = true; break; }
    }
    if (!hit) for (const bar of barrels) {
      const by = wy2sy(bar.wy);
      if (by > anchorY() + 40 || by < -90) continue;
      const dx = b.x - bar.x, dy = b.y - by;
      if (dx * dx + dy * dy < 20 * 20) { hitBarrel(bar, b.dmg); hit = true; break; }
    }
    if (!hit) for (const w of walls) {
      if (w.dead) continue;
      const wy = wy2sy(w.wy);
      if (Math.abs(b.y - wy) < 16 && b.x > road.x0 && b.x < road.x1) {
        w.hp -= b.dmg; hit = true;
        if (w.hp <= 0) killWall(w);
        break;
      }
    }
    if (hit) bullets.splice(i, 1);
  }

  /* enemies */
  const sr = squadRadius();
  drainAcc += dt;
  const drainTick = 0.30;
  let doDrain = drainAcc >= drainTick;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e._dead) { enemies.splice(i, 1); continue; }
    e.wy -= e.drift * dt;
    const ey = wy2sy(e.wy);
    if (ey > H + 60) { enemies.splice(i, 1); continue; }
    const touching = ey > anchorY() - sr - e.r && Math.abs(e.x - G.armyX) < sr + e.r;
    e.attacking = touching;
    if (touching && doDrain) {
      addSoldiers(G.soldiers - e.drain);
      parts.push(mkPart(e.x, anchorY() - 10, '#5db2ff'));
      if (Math.random() < 0.3) sfx.hurt();
      hurt(e, G.soldiers * 0.35 + 4);
    }
  }
  if (doDrain) drainAcc = 0;

  /* gates */
  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i];
    if (!g.passed && G.camY >= g.wy) { g.passed = true; applyGate(g); }
    if (wy2sy(g.wy) > H + 80) gates.splice(i, 1);
  }

  /* walls */
  for (let i = walls.length - 1; i >= 0; i--) {
    const w = walls[i];
    if (w.dead) { walls.splice(i, 1); continue; }
    const wy = wy2sy(w.wy);
    if (wy > anchorY() - sr) {
      if (doDrain) { addSoldiers(G.soldiers - 2); G.shake = 5; }
      w.hp -= G.soldiers * 5 * dt;
      if (w.hp <= 0) killWall(w);
    }
    if (wy > H + 60) walls.splice(i, 1);
  }

  /* pickups (world + barrel rewards homing in) */
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const py = wy2sy(p.wy);
    if (Math.abs(py - anchorY()) < sr + 10 && Math.abs(p.x - G.armyX) < sr + 12) {
      takePickup(p.kind, p.x); pickups.splice(i, 1); continue;
    }
    if (py > H + 40) pickups.splice(i, 1);
  }
  for (let i = rewards.length - 1; i >= 0; i--) {
    const r = rewards[i];
    r.t += dt * 2.2;
    const k = Math.min(1, r.t);
    r.x += (G.armyX - r.x) * k * 0.25;
    r.y += (anchorY() - r.y) * k * 0.25;
    if (k >= 1 || Math.hypot(G.armyX - r.x, anchorY() - r.y) < 24) {
      takePickup(r.kind, G.armyX); rewards.splice(i, 1);
    }
  }

  /* particles & floats */
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.t += dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t > p.life) parts.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; f.y += f.vy * dt;
    if (f.t > f.life) floats.splice(i, 1);
  }

  /* remove dead enemies */
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i]._dead) enemies.splice(i, 1);
}

function hurt(e, dmg) {
  e.hp -= dmg;
  if (e.hp <= 0) {
    e.hp = 0; e._dead = true;
    const ey = wy2sy(e.wy);
    for (let i = 0; i < (e.boss ? 40 : 9); i++) parts.push(mkPart(e.x, ey, e.boss ? '#ff9d5d' : e.col));
    G.kills += 1;
    G.killChain += 1; G.killChainT = 1.4;
    if (G.killChain === 8 || G.killChain === 15 || G.killChain === 25)
      floatText(e.x, ey - 40, 'RAMPAGE ×' + G.killChain, '#ff6bd8', 28);
    if (e.boss) {
      sfx.boss(); G.shake = 14; G.slow = 0.45;
      const reward = 25 + G.level * 10;
      floatText(e.x, ey - 30, 'BOSS DOWN +' + reward, '#ffd75d', 30);
      addSoldiers(G.soldiers + reward);
      for (let i = 0; i < 30; i++) parts.push(mkPart(e.x + rnd(-40, 40), ey + rnd(-40, 40), '#ffd75d'));
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
        floatText(e.x, ey - 20, '+' + g + ' JACKPOT', '#ffd75d', 22);
      }
      if (chance(0.06)) pickups.push({ x: e.x, wy: e.wy, kind: 'heal', taken: false });
      if (Math.random() < 0.2) floatText(e.x, ey - 14, '+1', '#ffd75d', 15);
    }
  }
}

function hitBarrel(bar, dmg) {
  bar.hp -= dmg;
  if (bar.hp <= 0 && !bar._dead) {
    bar._dead = true;
    const by = wy2sy(bar.wy);
    sfx.barrel(); G.shake = Math.max(G.shake, 4);
    for (let i = 0; i < 16; i++) parts.push(mkPart(bar.x, by, barCol(bar.kind)));
    if (bar.kind === 'bomb') {
      sfx.boom(); G.shake = 12;
      for (const e of enemies) {
        const ey = wy2sy(e.wy);
        if (ey > -60 && ey < H) hurt(e, 60);
      }
      for (let i = 0; i < 30; i++) parts.push(mkPart(bar.x + rnd(-60, 60), by + rnd(-40, 40), '#ff9d5d'));
      floatText(bar.x, by - 20, 'BOOM', '#ff9d5d', 28);
    } else {
      rewards.push({ x: bar.x, y: by, t: 0, kind: bar.kind });
      floatText(bar.x, by - 24, 'LOOT!', '#7de8ff', 18);
    }
    for (let i = barrels.length - 1; i >= 0; i--) if (barrels[i]._dead) barrels.splice(i, 1);
  }
}

function barCol(kind) {
  return { weapon: '#ff9d5d', heal: '#7dff9b', bomb: '#ff5d6a', gold: '#ffd75d', upgrade: '#7de8ff' }[kind] || '#fff';
}

function killWall(w) {
  w.dead = true; sfx.power(); G.shake = 8;
  const wy = wy2sy(w.wy);
  for (let i = 0; i < 26; i++) parts.push(mkPart(rnd(road.x0, road.x1), wy, '#b7c6e8'));
  floatText(W / 2, wy - 30, 'WALL BROKEN', '#b7c6e8', 24);
}

function takePickup(kind, x) {
  sfx.power();
  if (kind === 'rate') { G.upRate += 0.02; floatText(x, anchorY() - 50, 'FIRE RATE +', '#7de8ff', 22); }
  if (kind === 'dmg') { G.upDmg += 1; floatText(x, anchorY() - 50, 'DAMAGE +1', '#ffd75d', 22); }
  if (kind === 'spread') { G.upDmg += 1; floatText(x, anchorY() - 50, 'POWER +1', '#7dff9b', 22); }
  if (kind === 'heal') { addSoldiers(G.soldiers + 15); floatText(x, anchorY() - 50, '+15 SOLDIERS', '#7dff9b', 22); }
  if (kind === 'gold') { const g = ri(10, 24); addSoldiers(G.soldiers + g); floatText(x, anchorY() - 50, '+' + g + ' GOLD', '#ffd75d', 22); }
  if (kind === 'weapon') { weaponUp(); }
  if (kind === 'upgrade') { G.upRate += 0.015; G.upDmg += 1; floatText(x, anchorY() - 50, 'OVERCLOCK!', '#7de8ff', 24); }
  for (let i = 0; i < 12; i++) parts.push(mkPart(x, anchorY(), '#7de8ff'));
}

/* ---------------- formation ---------------- */
function formation(n) {
  const out = [];
  const cols = Math.ceil(Math.sqrt(n));
  const sp = 13;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    out.push({ x: (c - (cols - 1) / 2) * sp + Math.sin(i * 7.3) * 4, y: (r - cols / 2) * sp + Math.cos(i * 3.1) * 4 });
  }
  return out;
}

/* ---------------- draw ---------------- */
function draw() {
  if (G.mode === 'menu') G.armyX = W / 2;
  const z = ZONES[Math.max(0, zoneIdx)];
  const shx = (Math.random() - 0.5) * G.shake, shy = (Math.random() - 0.5) * G.shake;
  cx.save(); cx.translate(shx, shy);

  cx.fillStyle = z.bg; cx.fillRect(-10, -10, W + 20, H + 20);
  cx.fillStyle = z.road; cx.fillRect(road.x0, -10, road.x1 - road.x0, H + 20);
  cx.strokeStyle = z.edge; cx.lineWidth = 3;
  cx.beginPath(); cx.moveTo(road.x0, 0); cx.lineTo(road.x0, H); cx.moveTo(road.x1, 0); cx.lineTo(road.x1, H); cx.stroke();
  cx.strokeStyle = z.dash; cx.lineWidth = 4; cx.setLineDash([26, 30]);
  cx.lineDashOffset = -(G.camY % 56);
  cx.beginPath(); cx.moveTo(W / 2, -10); cx.lineTo(W / 2, H + 10); cx.stroke();
  cx.setLineDash([]);
  cx.fillStyle = z.side;
  for (let y = -(G.camY % 90); y < H; y += 90) { cx.fillRect(road.x0 - 14, y, 8, 40); cx.fillRect(road.x1 + 6, y, 8, 40); }

  /* gates */
  for (const g of gates) {
    const y = wy2sy(g.wy);
    if (y < -70 || y > H + 70) continue;
    const mid = gateMid(g);
    const pa = { x0: road.x0, x1: mid }, pb = { x0: mid, x1: road.x1 };
    const ps = [pa, pb];
    for (let pi = 0; pi < 2; pi++) {
      const p = g.panels[pi], b = ps[pi];
      const good = gateGood(p);
      const col = p.t === 'mul' ? '#ffd75d' : good ? (p.t === 'gun' ? '#7de8ff' : '#7dff9b') : '#ff5d6a';
      cx.fillStyle = p.t === 'mul' ? 'rgba(255,215,93,.20)' : good ? (p.t === 'gun' ? 'rgba(125,232,255,.18)' : 'rgba(125,255,155,.16)') : 'rgba(255,93,106,.16)';
      cx.fillRect(b.x0 + 2, y - 26, b.x1 - b.x0 - 4, 52);
      cx.strokeStyle = col; cx.lineWidth = 2; cx.strokeRect(b.x0 + 2, y - 26, b.x1 - b.x0 - 4, 52);
      cx.fillStyle = col;
      cx.font = `900 ${p.t === 'gun' ? 20 : 26}px -apple-system, sans-serif`;
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(gateLabel(p), (b.x0 + b.x1) / 2, y);
    }
    if (g.moving) {
      cx.fillStyle = 'rgba(255,255,255,.5)';
      cx.beginPath(); cx.moveTo(mid - 6, y - 34); cx.lineTo(mid + 6, y - 34); cx.lineTo(mid, y - 28); cx.closePath(); cx.fill();
    }
  }

  /* barrels (gentong!) */
  for (const b of barrels) {
    const y = wy2sy(b.wy);
    if (y < -50 || y > H + 50) continue;
    const c = barCol(b.kind);
    cx.fillStyle = '#2c2418';
    roundRect(b.x - 15, y - 18, 30, 36, 6); cx.fill();
    cx.fillStyle = c;
    roundRect(b.x - 15, y - 18, 30, 10, 5); cx.fill();
    cx.fillRect(b.x - 15, y - 4, 30, 5);
    cx.strokeStyle = c; cx.lineWidth = 2;
    roundRect(b.x - 15, y - 18, 30, 36, 6); cx.stroke();
    cx.fillStyle = '#fff'; cx.font = '900 14px -apple-system, sans-serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.strokeStyle = 'rgba(0,0,0,.6)'; cx.lineWidth = 3;
    cx.strokeText(Math.ceil(b.hp), b.x, y + 6);
    cx.fillText(Math.ceil(b.hp), b.x, y + 6);
    cx.font = '11px sans-serif';
    cx.fillText({ weapon: '🔫', heal: '➕', bomb: '💣', gold: '💰', upgrade: '⚡' }[b.kind] || '?', b.x, y - 26);
  }

  /* walls */
  for (const w of walls) {
    if (w.dead) continue;
    const y = wy2sy(w.wy);
    if (y < -60 || y > H + 60) continue;
    cx.fillStyle = '#3a4a72'; cx.fillRect(road.x0, y - 14, road.x1 - road.x0, 28);
    cx.fillStyle = '#232f52';
    for (let x = road.x0; x < road.x1; x += 26) cx.fillRect(x + 2, y - 14, 20, 12), cx.fillRect(x + 12, y - 1, 20, 12);
    cx.fillStyle = '#fff'; cx.font = '900 18px -apple-system, sans-serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(Math.ceil(w.hp), W / 2, y - 24);
    hpBar(W / 2 - 60, y - 34, 120, 6, w.hp / w.maxhp, '#7de8ff');
  }

  /* pickups */
  for (const p of pickups) {
    const y = wy2sy(p.wy);
    if (y < -40 || y > H + 40) continue;
    const col = { rate: '#7de8ff', dmg: '#ffd75d', spread: '#7dff9b', heal: '#7dff9b' }[p.kind];
    const lab = { rate: '⚡', dmg: '💥', spread: '🔫', heal: '➕' }[p.kind];
    cx.fillStyle = col; cx.beginPath(); cx.arc(p.x, y, 15, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#0e1526'; cx.font = '14px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(lab, p.x, y + 1);
  }

  /* homing rewards */
  for (const r of rewards) {
    cx.fillStyle = barCol(r.kind);
    cx.beginPath(); cx.arc(r.x, r.y, 8, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.stroke();
  }

  /* enemies */
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const y = wy2sy(e.wy);
    if (y < -90 || y > H + 80) continue;
    cx.fillStyle = e.col;
    cx.beginPath(); cx.arc(e.x, y, e.r, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = 'rgba(0,0,0,.25)'; cx.beginPath(); cx.arc(e.x, y + e.r * 0.25, e.r * 0.75, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#fff';
    cx.beginPath(); cx.arc(e.x - e.r * 0.32, y - e.r * 0.22, e.r * 0.16, 0, Math.PI * 2); cx.arc(e.x + e.r * 0.32, y - e.r * 0.22, e.r * 0.16, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#0e1526';
    cx.beginPath(); cx.arc(e.x - e.r * 0.30, y - e.r * 0.22, e.r * 0.07, 0, Math.PI * 2); cx.arc(e.x + e.r * 0.34, y - e.r * 0.22, e.r * 0.07, 0, Math.PI * 2); cx.fill();
    if (e.kind === 'split') { cx.fillStyle = 'rgba(255,255,255,.35)'; cx.beginPath(); cx.arc(e.x, y, e.r * 0.45, 0, Math.PI * 2); cx.fill(); }
    cx.fillStyle = e.kind === 'gold' ? '#5d4a00' : '#fff';
    cx.font = `900 ${e.boss ? 20 : 15}px -apple-system, sans-serif`;
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.strokeStyle = 'rgba(0,0,0,.6)'; cx.lineWidth = 3;
    cx.strokeText(Math.ceil(e.hp), e.x, y - e.r - 12);
    cx.fillText(Math.ceil(e.hp), e.x, y - e.r - 12);
    hpBar(e.x - e.r, y - e.r - 7, e.r * 2, 4, e.hp / e.maxhp, e.boss ? '#ff9d5d' : e.col);
    if (e.attacking) { cx.fillStyle = '#ff5d6a'; cx.font = '900 13px sans-serif'; cx.fillText('!', e.x, y - e.r - 26); }
  }

  /* bullets */
  for (const b of bullets) {
    cx.fillStyle = b.col || '#ffe97d';
    cx.fillRect(b.x - 1.5, b.y - 7, 3, 9);
  }

  /* squad */
  const vis = Math.min(G.soldiers, 90);
  const offs = formation(vis);
  const wob = performance.now() / 140;
  for (let i = 0; i < vis; i++) {
    const o = offs[i];
    const x = G.armyX + o.x + Math.sin(wob + i) * 1.5;
    const y = anchorY() + o.y + Math.cos(wob * 1.3 + i * 2) * 1.5;
    cx.fillStyle = '#5db2ff';
    cx.beginPath(); cx.arc(x, y, 6, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#2e6fd8'; cx.fillRect(x - 1.5, y - 13, 3, 9);
    cx.fillStyle = '#dff0ff'; cx.beginPath(); cx.arc(x, y - 2, 2.4, 0, Math.PI * 2); cx.fill();
  }
  if (G.soldiers > 90) {
    cx.fillStyle = '#5db2ff'; cx.font = '900 15px -apple-system, sans-serif';
    cx.textAlign = 'center';
    cx.fillText('+' + (G.soldiers - 90), G.armyX, anchorY() + squadRadius() + 14);
  }

  for (const p of parts) {
    cx.globalAlpha = 1 - p.t / p.life;
    cx.fillStyle = p.color;
    cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2); cx.fill();
  }
  cx.globalAlpha = 1;

  for (const f of floats) {
    cx.globalAlpha = clamp(1 - f.t / f.life, 0, 1);
    cx.fillStyle = f.color; cx.font = `900 ${f.size}px -apple-system, sans-serif`;
    cx.textAlign = 'center'; cx.strokeStyle = 'rgba(0,0,0,.55)'; cx.lineWidth = 4;
    cx.strokeText(f.text, f.x, f.y); cx.fillText(f.text, f.x, f.y);
  }
  cx.globalAlpha = 1;

  /* HUD */
  cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
  cx.fillStyle = 'rgba(10,15,30,.55)';
  roundRect(10, 8, 158, 78, 10); cx.fill();
  cx.fillStyle = '#9fb4d8'; cx.font = '700 11px -apple-system, sans-serif';
  cx.fillText('ARMY', 22, 28);
  cx.fillStyle = G.soldiers < 10 ? '#ff5d6a' : '#7dff9b';
  cx.font = '900 28px -apple-system, sans-serif';
  cx.fillText(G.soldiers, 22, 57);
  cx.fillStyle = WT[G.tier].col; cx.font = '800 11px -apple-system, sans-serif';
  cx.fillText('🔫 ' + WT[G.tier].name + (G.upDmg ? ' +' + G.upDmg : ''), 22, 76);

  cx.textAlign = 'right';
  cx.fillStyle = 'rgba(10,15,30,.55)';
  roundRect(W - 168, 8, 158, 78, 10); cx.fill();
  cx.fillStyle = '#9fb4d8'; cx.font = '700 11px -apple-system, sans-serif';
  cx.fillText('DIST · KILLS', W - 22, 28);
  cx.fillStyle = '#eaf2ff'; cx.font = '900 20px -apple-system, sans-serif';
  cx.fillText(`${Math.floor(G.dist)}m · ${G.kills}`, W - 22, 56);
  if (G.streak >= 2) {
    cx.fillStyle = '#7de8ff'; cx.font = '800 12px -apple-system, sans-serif';
    cx.fillText('STREAK ×' + G.streak, W - 22, 74);
  }

  cx.fillStyle = '#62779e'; cx.font = '700 12px -apple-system, sans-serif'; cx.textAlign = 'center';
  cx.fillText('LV ' + G.level + ' · ' + ZONE_NAMES[Math.max(0, zoneIdx)], W / 2, 20);

  if (hintT > 0 && G.mode === 'run') {
    cx.globalAlpha = Math.min(1, hintT);
    cx.fillStyle = '#eaf2ff'; cx.font = '800 18px -apple-system, sans-serif'; cx.textAlign = 'center';
    cx.fillText('◀ drag to move ▶', W / 2, H * 0.55);
    cx.globalAlpha = 1;
  }

  cx.restore();
}

function hpBar(x, y, w, h, frac, color) {
  frac = clamp(frac, 0, 1);
  cx.fillStyle = 'rgba(0,0,0,.5)'; cx.fillRect(x - 1, y - 1, w + 2, h + 2);
  cx.fillStyle = color; cx.fillRect(x, y, w * frac, h);
}
function roundRect(x, y, w, h, r) {
  cx.beginPath();
  cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r);
  cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
}

})();
