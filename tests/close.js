const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html?debug');
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const M = window.__mob; M.startGame(); M.SIM.on = true;
    for (let i = 0; i < 30; i++) M.update(1 / 60);
    const run = (gap) => {
      for (const h of M.hazards) h.wy = -1e6;
      M.update(1 / 60);
      const orig = Math.random; let first = true; Math.random = () => { if (first) { first = false; return 0.4; } return orig(); };
      M.spawnHazard(M.G.camY + 300); Math.random = orig;
      const h = M.hazards[M.hazards.length - 1];
      const sr = M.squadRadius();
      h.amp = 0; h.mid = M.G.armyX + h.r + sr * 0.75 + gap;
      M.setAim(M.G.armyX);
      const c0 = M.G.closeCalls || 0, s0 = M.G.soldiers;
      for (let i = 0; i < 200; i++) M.update(1 / 60);
      return { kind: h.kind, calls: (M.G.closeCalls || 0) - c0 };
    };
    const near = run(15), far = run(160), hit = run(-40);
    M.SIM.on = false;
    return { near, far, hit };
  });
  assert(r.near.kind === 'saw' && r.near.calls === 1, 'a saw passing just wide pays a close call ' + JSON.stringify(r.near));
  assert(r.far.calls === 0, 'a saw far away pays nothing ' + JSON.stringify(r.far));
  assert(r.hit.calls === 0, 'a saw that hits pays nothing ' + JSON.stringify(r.hit));
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})();
