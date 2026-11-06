// Late-run features: every zone set-piece shows up on a long run, and reserves bank the
// surplus past the army cap and march it back in after a loss.
const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html?debug&lang=en');
  await p.evaluate(() => localStorage.setItem('mobrun_lang', 'en'));
  await p.reload(); await p.waitForTimeout(800);

  // 1. set-pieces: one per zone visit, announced with a two-line banner
  const pieces = await p.evaluate(() => {
    const M = window.__mob, G = M.G; M.SIM.on = true; M.SIM.noRender = true; M.startGame();
    const zb = document.getElementById('zoneBanner'); const seen = new Set();
    for (let i = 0; i < 60 * 400 && G.dist < 900; i++) {
      if (G.mode === 'pick') M.chooseSkill('dmg');
      if (G.mode !== 'run') G.mode = 'run';
      G.soldiers = Math.max(G.soldiers, 3000);
      M.update(1 / 60);
      const m = /^(PRISON CONVOY|SINKHOLES|METEOR SHOWER|SAW GAUNTLET|THE SQUEEZE)!/.exec(zb.textContent);
      if (m && zb.querySelector('small')) seen.add(m[1]);
    }
    M.SIM.on = false; M.SIM.noRender = false;
    return [...seen];
  });
  assert(pieces.length === 5, 'all five zone set-pieces appear by 900m (' + pieces.join(', ') + ')');

  // 2. reserves: overflow past the cap banks a third, then refills the army after a loss
  const r = await p.evaluate(() => {
    const M = window.__mob, G = M.G; M.SIM.on = true; M.startGame();
    for (let i = 0; i < 30; i++) M.update(1 / 60);
    for (const g of M.gates) { g.passed = true; g.wy = -1e6; }
    for (const e of M.enemies) e.hp = 0; for (const m of M.mobs) m.dead = true;
    M.addSoldiers(20000); M.addSoldiers(29000);
    const banked = G.reserve;
    G.soldiers = 5000;
    for (let i = 0; i < 120; i++) M.update(1 / 60);
    M.SIM.on = false;
    return { banked, after: G.soldiers, left: G.reserve };
  });
  assert(r.banked > 2000 && r.banked <= 6000, 'surplus past the cap banks into reserves (' + r.banked + ')');
  assert(r.after > 5000 && r.left < r.banked, 'reserves march back in after a loss (' + r.after + ', ' + r.left + ' left)');
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})();
