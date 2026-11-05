// Regression tests for the review findings.
const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 420, height: 860 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html?debug');
  await p.waitForTimeout(800);

  // 1. a boss alone in contact drains the army (fightT 7: the showdown has closed in)
  const r1 = await p.evaluate(() => {
    const M = window.__mob; M.SIM.on = true; M.startGame();
    for (let i = 0; i < 60; i++) M.update(1 / 60); M.spawnBoss(M.G.camY + 300);
    for (const e of M.enemies) if (!e.boss) e.hp = 0;
    const bo = M.enemies.find(e => e.boss);
    bo.hp = bo.maxhp = 1e9; bo.drift = 0; bo.x = M.G.armyX;
    M.G.soldiers = 400;
    const s0 = M.G.soldiers;
    let lost = 0;
    for (let i = 0; i < 120; i++) { bo.introduced = true; bo.fightT = 7; bo.wy = M.G.camY + 5; bo.x = M.G.armyX; const a = M.G.soldiers; M.update(1 / 60); if (M.G.soldiers < a && M.G.cause === 'CRUSHED BY A BOSS') lost += a - M.G.soldiers; if (M.G.mode === 'pick') M.chooseSkill('dmg'); }
    return [s0, s0 - lost, M.G.cause];
  });
  assert(r1[1] < r1[0], 'a lone boss in contact hurts the squad ' + r1.join(' '));

  // 3. mob kills counted once
  const r3 = await p.evaluate(() => {
    const M = window.__mob; M.startGame(); M.G.soldiers = 50;
    const m = M.spawnMob(M.G.camY + 600); const n = m.count; const k0 = M.G.kills;
    M.hurtMob(m, m.hp + 1);
    return [n, M.G.kills - k0];
  });
  assert(r3[0] === r3[1], 'mob kills counted once (' + r3.join(' vs ') + ')');

  // 4. upgrades don't pre-complete missions
  const r4 = await p.evaluate(() => {
    const M = window.__mob; M.META.up.gun = 3; M.META.up.army = 10;
    M.META.missions = [{ type: 'gun', done: false }, { type: 'army', done: false }, { type: 'dist', done: false }];
    M.META.mlv.gun = 0; M.META.mlv.army = 0;
    M.startGame(); M.update(1 / 60);
    const r = M.META.missions.filter(m => m.done).map(m => m.type);
    M.META.up.gun = 0; M.META.up.army = 0;
    return r;
  });
  assert(r4.length === 0, 'starting upgrades do not complete missions on frame 1 (' + r4 + ')');

  // 2. revive doesn't pay the next tier of missions with the old run's stats
  const r2 = await p.evaluate(() => {
    const M = window.__mob;
    M.META.missions = [{ type: 'dist', done: false }, { type: 'coins', done: false }, { type: 'mobs', done: false }];
    M.META.mlv = {};
    M.startGame();
    M.G.camY = 1300 * 40; M.G.coinsPicked = 300; M.G.mobsBeaten = 20; M.update(1 / 60);
    const paid1 = M.G.missionCoins;
    M.G.mode = 'dying'; M.gameOver();
    M.G.coins = 5000; M.revive();
    for (let i = 0; i < 30; i++) M.update(1 / 60);
    const paid2 = M.G.missionCoins;
    const mlv = JSON.stringify(M.META.mlv);
    M.G.mode = 'dying'; M.gameOver();
    return [paid1, paid2, mlv];
  });
  assert(r2[0] > 0 && r2[1] === r2[0], 'revive does not re-pay missions (' + r2.join(' / ') + ')');

  // 6. revive grace: nothing can hurt the squad for a moment after a revive
  const r6 = await p.evaluate(() => {
    const M = window.__mob; M.SIM.on = true;
    M.startGame(); for (let i = 0; i < 30; i++) M.update(1 / 60);
    M.G.mode = 'dying'; M.gameOver(); M.G.coins = 9999; M.revive();
    const s0 = M.G.soldiers;
    const m = M.spawnMob(M.G.camY + 30, 3);
    m.x = M.G.armyX;
    for (let i = 0; i < 60; i++) M.update(1 / 60);
    const during = M.G.soldiers;
    for (let i = 0; i < 120; i++) M.update(1 / 60);
    M.SIM.on = false;
    return [s0, during, M.G.soldiers];
  });
  assert(r6[1] >= r6[0] && r6[2] < r6[1] + 1000, 'revive grace protects for ~1.8s then ends (' + r6.join(' -> ') + ')');
  await p.evaluate(() => { const M = window.__mob; M.G.mode = 'dying'; M.gameOver(); });

  // 5. Enter with the armory open does not start a run
  await p.evaluate(() => { const M = window.__mob; M.SIM.on = false; });
  await p.waitForFunction(() => document.getElementById('overOverlay').style.display === 'flex');
  await p.waitForTimeout(1000);
  await p.click('#shopBtnOver');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  assert(await p.evaluate(() => window.__mob.G.mode) === 'over', 'Enter in the armory does not start a new run');
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})();
