// Monkey test: random taps, swipes, keys and visible-button presses across every screen.
// Fails on page errors, NaN state, or a mode that stays stuck with no way out.
const { chromium } = require('playwright');
(async () => {
  const secs = +process.argv[2] || 90;
  const seedPhone = process.argv[3] !== 'desktop';
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext(seedPhone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await p.addInitScript(() => localStorage.setItem('mobrun_save', JSON.stringify({ bank: 3000 })));
  await p.goto('http://localhost:8787/index.html?debug');
  await p.waitForTimeout(800);
  const W = seedPhone ? 390 : 1280, H = seedPhone ? 844 : 800;
  const modes = {}; let lastMode = '', sameFor = 0, actions = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) {
    const r = Math.random();
    try {
      if (r < 0.35) {
        const btns = await p.$$('button:visible:not([data-k="lang"]), .tap:visible');
        if (btns.length) await btns[Math.floor(Math.random() * btns.length)].dispatchEvent('pointerdown');
      } else if (r < 0.6) {
        const x = Math.random() * W, y = Math.random() * H;
        await p.mouse.move(x, y); await p.mouse.down();
        await p.mouse.move(x + (Math.random() - 0.5) * 300, y + (Math.random() - 0.5) * 300, { steps: 4 });
        await p.mouse.up();
      } else if (r < 0.8) {
        const k = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'Escape', 'p', 'm', '1', '2', '3'][Math.floor(Math.random() * 12)];
        await p.keyboard.press(k);
      } else if (r < 0.88) {
        await p.evaluate(() => { const G = window.__mob.G; if (G.mode === 'run' && Math.random() < 0.3) G.soldiers = 0, G.mode = 'dying'; });
      } else if (r < 0.92) {
        await p.evaluate(() => { window.dispatchEvent(new Event('blur')); });
      } else {
        await p.evaluate(() => { const M = window.__mob; if (M.G.mode === 'run') { M.SIM.on = true; for (let i = 0; i < 600 && M.G.mode === 'run'; i++) M.update(1 / 60); M.SIM.on = false; } });
      }
    } catch (e) { errs.push('driver ' + e.message.split('\n')[0]); }
    actions++;
    const st = await p.evaluate(() => { if (!window.__mob) return { m: 'loading', bad: false }; const G = window.__mob.G; return { m: G.mode, bad: [G.soldiers, G.dist, G.camY, G.coins, G.armyX].some(v => !Number.isFinite(v)) || G.coins < 0 }; });
    modes[st.m] = (modes[st.m] || 0) + 1;
    if (st.bad) errs.push('bad numeric state in mode ' + st.m);
    if (st.m === lastMode && st.m === 'dying') sameFor++; else sameFor = 0;
    if (sameFor > 20) errs.push('stuck in dying');
    lastMode = st.m;
    await p.waitForTimeout(60);
  }
  const labels = await p.evaluate(() => document.querySelectorAll('#labels .lb').length);
  console.log('actions', actions, 'modes', JSON.stringify(modes), 'labels in DOM', labels);
  console.log(errs.length ? [...new Set(errs)].join('\n') : 'no errors');
  await b.close();
})();
