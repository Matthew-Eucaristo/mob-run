const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8787/index.html?debug');
  await p.waitForTimeout(600);
  await p.click('#playBtn'); await p.waitForTimeout(1000);
  await p.evaluate(() => { const M = window.__mob; M.G.cause = 'TEST'; M.G.soldiers = 0; M.beginDeath(); });
  await p.waitForFunction(() => document.getElementById('overOverlay').style.display === 'flex');
  await p.waitForTimeout(1600);
  const url0 = p.url();
  await p.click('#shareBtn');
  await p.waitForTimeout(1500);
  assert(p.url() === url0 && await p.evaluate(() => !!window.__mob && window.__mob.G.mode === 'over'), 'sharing never navigates the game page away');
  await b.close();
})();
