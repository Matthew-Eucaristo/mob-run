// Loads once online (service worker installs + precaches), then reloads with the network cut.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html');
  await p.evaluate(async () => { await navigator.serviceWorker.ready; });
  await p.waitForTimeout(1500);
  const cached = await p.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys[0]);
    return { name: keys[0], urls: (await c.keys()).map(r => new URL(r.url).pathname) };
  });
  console.log('cache', cached.name, cached.urls.join(' '));
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForTimeout(2500);
  const st = await p.evaluate(() => ({
    fontOk: document.fonts.check('20px "Lilita One"'),
    logo: !!document.querySelector('.logo'),
    play: getComputedStyle(document.getElementById('playBtn')).display !== 'none',
    canvas: !!document.getElementById('game'),
  }));
  console.log('offline', JSON.stringify(st));
  await p.click('#playBtn');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'offline.png' });
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
