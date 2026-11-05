const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8787/index.html?debug');
  await p.waitForTimeout(600);
  await p.click('#muteBtn'); await p.waitForTimeout(150);
  const tog = await p.$$eval('.tog', els => els.map(e => e.classList.contains('on')));
  assert(tog[3] === false, 'reduced-motion device starts with screen shake off ' + JSON.stringify(tog));
  await b.close();
})();
