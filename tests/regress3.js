// Regression tests for the third review's findings.
const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html?debug');
  await p.waitForTimeout(700);

  // 1. END RUN pushes a new history entry instead of replacing the last one
  await p.click('#playBtn'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const M = window.__mob; M.G.cause = 'TEST'; M.G.soldiers = 0; M.beginDeath(); });
  await p.waitForFunction(() => document.getElementById('overOverlay').style.display === 'flex');
  const h1 = await p.evaluate(() => window.__mob.META.hist.length);
  await p.waitForTimeout(1000);
  await p.click('#againBtn'); await p.waitForTimeout(1200);
  await p.click('#pauseBtn'); await p.waitForTimeout(200);
  await p.click('#pauseQuit'); await p.waitForTimeout(400);
  const h2 = await p.evaluate(() => window.__mob.META.hist.length);
  assert(h2 === h1 + 1, 'END RUN adds its own history entry (' + h1 + ' -> ' + h2 + ')');
  assert(await p.evaluate(() => getComputedStyle(document.getElementById('reviveBtn')).display) === 'none', 'no revive after END RUN');

  // 2. language row only outside a run
  await p.click('#againBtn'); await p.waitForTimeout(800);
  await p.click('#pauseBtn'); await p.waitForTimeout(200);
  await p.click('#pauseSet'); await p.waitForTimeout(200);
  assert((await p.$$('.setRow[data-k="lang"]')).length === 0, 'no language switch while a run is paused');
  await p.click('#setClose'); await p.click('#resumeBtn'); await p.waitForTimeout(200);

  // 5. the level-up beat does not survive a death + revive
  const r5 = await p.evaluate(async () => {
    const M = window.__mob; M.SIM.on = true;
    while (M.G.dist < 149) M.update(1 / 60), M.G.mode === 'pick' && M.chooseSkill('dmg');
    for (let i = 0; i < 90 && M.G.level < 2; i++) M.update(1 / 60);
    M.G.cause = 'TEST'; M.G.soldiers = 0; M.beginDeath(); M.gameOver();
    M.G.coins = 9999; M.revive();
    for (let i = 0; i < 60; i++) M.update(1 / 60);
    M.SIM.on = false;
    return M.G.mode;
  });
  assert(r5 === 'run', 'no skill picker pops up after a revive (' + r5 + ')');

  // 3. geometry count stays flat once every kind of object has been drawn once
  const r3 = await p.evaluate(() => {
    const M = window.__mob; M.SIM.on = true; const g = [];
    for (let pass = 0; pass < 6; pass++) {
      M.startGame();
      for (let i = 0; i < 60 * 120; i++) { if (M.G.mode === 'pick') M.chooseSkill('dmg'); if (M.G.mode !== 'run') { M.G.mode = 'run'; M.G.soldiers = 400; } M.update(1 / 60); M.G.soldiers = Math.max(M.G.soldiers, 200); if (i % 30 === 0) M.draw(performance.now() + i * 16); }
      g.push(M.rmem.geometries);
    }
    M.SIM.on = false;
    return g;
  });
  assert(r3[5] - r3[2] <= 6, 'after warm-up, more long runs add no geometry (' + r3.join(' / ') + ')');
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})();
