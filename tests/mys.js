const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html?debug');
  await p.waitForTimeout(600);
  // find a mystery gate by fast-forwarding, then show it on screen
  const r = await p.evaluate(() => {
    const M = window.__mob; M.startGame(); M.SIM.on = true;
    for (let i = 0; i < 60 * 300; i++) {
      if (M.G.mode === 'pick') M.chooseSkill('dmg');
      if (M.G.mode !== 'run') { M.G.mode = 'run'; M.G.soldiers = 200; }
      M.update(1 / 60);
      if (M.G.soldiers < 50) M.G.soldiers = 200;
      const g = M.gates.find(g => !g.passed && g.panels.some(pp => pp.t === 'mys') && g.wy - M.G.camY < 520 && g.wy - M.G.camY > 300);
      if (g) { M.SIM.on = false; const side = g.panels.findIndex(pp => pp.t === 'mys'); const mid = M.gateMid(g); M.setAim(side === 0 ? (M.road.x0 + mid) / 2 : (mid + M.road.x1) / 2, -0.6); return { at: Math.floor(M.G.dist), res: g.panels[side].res }; }
    }
    M.SIM.on = false; return null;
  });
  assert(r, 'a mystery gate appears (' + JSON.stringify(r) + ')');
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'mys1.png' });
  await p.waitForTimeout(2600);
  await p.screenshot({ path: 'mys2.png' });
  // splitter boss splits on death
  const sp = await p.evaluate(() => {
    const M = window.__mob; M.SIM.on = true;
    M.G.level = 4;
    const n0 = M.enemies.filter(e => !e._dead).length;
    let bo = null;
    for (let k = 0; k < 30 && !bo; k++) { M.G.level = 4; M.spawnBoss(M.G.camY + 600); const last = M.enemies.filter(e => e.boss).pop(); if (last.splitter) bo = last; else last.hp = 0; M.update(1 / 60); }
    if (!bo) { M.SIM.on = false; return 'no splitter'; }
    bo.hp = 1; bo.introduced = true;
    M.hurt ? 0 : 0;
    let spawned = 0;
    const arr = M.enemies, push0 = arr.push;
    arr.push = function (...xs) { for (const x of xs) if (x.kind === 'brute') spawned++; return push0.apply(this, xs); };
    bo.wy = M.G.camY + 300;
    for (let i = 0; i < 120 && !bo._dead; i++) M.update(1 / 60);
    arr.push = push0;
    const before = 0, after = spawned;
    M.SIM.on = false;
    return { dead: !!bo._dead, before, after };
  });
  assert(sp && sp.dead && sp.after >= sp.before + 2, 'splitter boss splits into brutes ' + JSON.stringify(sp));
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})();
