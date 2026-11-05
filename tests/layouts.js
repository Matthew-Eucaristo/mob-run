const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const sizes = [['land', 844, 390, true], ['small', 360, 640, true], ['desk', 1280, 800, false]];
  for (const [tag, w, h, touch] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log(tag, 'PAGEERR', e.message));
    await p.addInitScript(() => localStorage.setItem('mobrun_save', JSON.stringify({ bank: 260, best: 640, up: { army: 3, coin: 1 } })));
    await p.goto('http://localhost:8787/index.html?debug');
    await p.waitForTimeout(900);
    await p.screenshot({ path: `L_${tag}_menu.png` });
    await p.evaluate(() => { const M = window.__mob; M.startGame(); });
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const g = window.__mob.G; g.cause = 'SHREDDED BY A SAW'; g.soldiers = 0; g.mode = 'dying'; });
    await p.waitForFunction(() => document.getElementById('overOverlay').style.display === 'flex');
    await p.waitForTimeout(1100);
    await p.screenshot({ path: `L_${tag}_over.png` });
    // check the key buttons are on screen without scrolling
    const vis = await p.evaluate(() => ['againBtn', 'reviveBtn'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return id + ':' + (r.bottom <= innerHeight && r.top >= 0 ? 'in' : 'OUT(' + Math.round(r.top) + ')'); }).join(' '));
    console.log(tag, vis);
    await ctx.close();
  }
  await b.close();
})();
