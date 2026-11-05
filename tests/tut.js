const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:8787/index.html?debug');
  await p.waitForTimeout(700);
  await p.tap('#playBtn');
  await p.waitForTimeout(1500);
  assert(await p.evaluate(() => document.getElementById('tut').classList.contains('on')), 'hand shows on a first run');
  await p.screenshot({ path: 'tut.png' });
  const cdp = await ctx.newCDPSession(p);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', 150, 600);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', 150 + i * 15, 601); await p.waitForTimeout(30); }
  await touch('touchEnd');
  await p.waitForTimeout(400);
  const st = await p.evaluate(() => ({ on: document.getElementById('tut').classList.contains('on'), hint: document.getElementById('hint').textContent }));
  assert(!st.on, 'hand hides after the first swipe');
  assert(/column/.test(st.hint), 'formation tip follows: ' + st.hint);
  await b.close();
})();
