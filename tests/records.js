const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html?debug');
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const M = window.__mob; M.SIM.on = true; M.startGame();
    for (let i = 0; i < 60 * 40; i++) { if (M.G.mode === 'pick') M.chooseSkill('dmg'); if (M.G.mode !== 'run') break; M.update(1 / 60); }
    const k1 = M.G.kills;
    M.G.mode = 'dying'; M.gameOver();
    const a = { ...M.META.life };
    M.G.coins = 9999; M.revive();
    for (let i = 0; i < 60 * 5; i++) { if (M.G.mode === 'pick') M.chooseSkill('dmg'); if (M.G.mode !== 'run') break; M.update(1 / 60); }
    const k2 = M.G.kills;
    M.G.mode = 'dying'; M.gameOver();
    const bb = { ...M.META.life };
    M.SIM.on = false;
    return { k1, k2, a, bb, saved: JSON.parse(localStorage.getItem('mobrun_save')).life };
  });
  assert(r.a.kills === r.k1, 'kills banked once at first death ' + r.a.kills + '/' + r.k1);
  assert(r.bb.kills === r.k2, 'revive adds only the new stretch ' + r.bb.kills + '/' + r.k2);
  assert(r.saved && r.saved.kills === r.k2, 'lifetime records saved');
  await p.reload(); await p.waitForTimeout(600);
  await p.click('#muteBtn'); await p.waitForTimeout(200);
  const rows = await p.$$eval('.recRow', els => els.length);
  assert(rows === 8, 'records panel shows 8 rows');
  await p.screenshot({ path: 'records.png' });
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})();
