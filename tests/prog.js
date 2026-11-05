// Headless balance sim: a "decent player" bot drives N runs with fixed dt.
const { chromium } = require('playwright');
(async () => {
  const runs = +process.argv[2] || 12;
  const skill = process.argv[3] || 'good'; // good | sloppy
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 420, height: 860 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
  await p.addInitScript(() => { if (!sessionStorage.getItem('x')) { localStorage.clear(); sessionStorage.setItem('x','1'); } });
  await p.goto('http://localhost:8787/index.html?debug&q=low');
  await p.waitForTimeout(800);
  const res = await p.evaluate(async ({ runs, skill }) => {
    const M = window.__mob; M.SIM.on = true;
    const out = [];
    for (let r = 0; r < runs; r++) {
      M.startGame();
      let steps = 0; const trace = [];
      let reviveUsed = false; const mobLog = []; const hist = [];
      while (steps < 60 * 60 * 9) {
        if (M.G.mode === 'pick') {
          const cards = document.querySelectorAll('.skillCard');
          const ids = window.__lastSkillIds || null;
          cards[Math.floor(Math.random()*cards.length)].dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
          if (M.G.mode === 'pick') M.G.mode = 'run';
        }
        if (M.G.mode === 'dying') { M.gameOver(); }
        if (M.G.mode === 'over') break;
        // --- bot brain
        const G = M.G, road = M.road;
        const cx = (road.x0 + road.x1) / 2;
        let target = cx;
        let best = null;
        for (const g of M.gates) {
          if (g.passed) continue;
          const d = g.wy - G.camY;
          if (d < 0 || d > 900) continue;
          if (!best || g.wy < best.wy) best = g;
        }
        if (best) {
          const mid = M.gateMid(best);
          const val = (pn) => pn.t === 'gun' ? G.soldiers * 1.25 + 5 : M.transformCount(G.soldiers, pn);
          const L = val(best.panels[0]), R = val(best.panels[1]);
          const pickLeft = skill !== 'good' ? (Math.random() < 0.7 ? L >= R : L < R) : L >= R;
          target = pickLeft ? (road.x0 + mid) / 2 : (mid + road.x1) / 2;
          if (best._botPick === undefined) best._botPick = pickLeft;
          target = best._botPick ? (road.x0 + mid) / 2 : (mid + road.x1) / 2;
        }
        for (const h of M.hazards) {
          if (h._see === undefined) h._see = skill !== 'human' || Math.random() < 0.65;
          if (!h._see) continue;
          const d = h.wy - G.camY;
          if (d < -((h.len||0)/2) - 20 || d > 500 + (h.len||0)/2) continue;
          if (h.kind === 'choke') target = h.gapX;
          if (h.kind === 'lava' || h.kind === 'gap') {
            const freeL = (h.x - h.w/2) - road.x0, freeR = road.x1 - (h.x + h.w/2);
            target = freeL > freeR ? (road.x0 + h.x - h.w/2) / 2 : (h.x + h.w/2 + road.x1) / 2;
          }
          if (h.kind === 'saw' && d < 260 && d > -40) { const sx = M.sawX(h); target = sx > cx ? road.x0 + 60 : road.x1 - 60; }
          if (h.kind === 'meteor' && h.armed && !h.dead && Math.abs(d) < 200) target = h.x > cx ? road.x0 + 60 : road.x1 - 60;
        }
        for (const w of M.walls) {
          const d = w.wy - G.camY;
          if (w.dead || d < 0 || d > 400) continue;
          const fullWidth = (w.x1 - w.x0) > (road.x1 - road.x0) * 0.9;
          if (!fullWidth) { const fl = w.x0 - road.x0, fr = road.x1 - w.x1; target = fl > fr ? (road.x0 + w.x0)/2 : (w.x1 + road.x1)/2; }
        }
        if (skill !== 'good') target += Math.sin(steps * 0.03) * 60;
        // narrow formation if road is narrow or dodging
        const roadW = road.x1 - road.x0;
        M.setAim(target, roadW < 300 ? -0.6 : -0.2);
        const before = G.soldiers;
        M.update(1 / 60);
        if (G.soldiers !== before) { hist.push(Math.floor(G.dist)+':'+before+'>'+G.soldiers+'('+(G.cause||'').slice(0,6)+')'); if (hist.length > 12) hist.shift(); }
        for (const m of M.mobs) if (m.clash && !m._rec) { m._rec = 1; mobLog.push([Math.floor(G.dist), m.start, m.clashN, G.soldiers]); }
        steps++;
        if (steps % 900 === 0) trace.push(Math.floor(G.dist) + 'm:' + G.soldiers);
      }
      /* spend like a player: cheapest affordable upgrade first, until broke */
      const bought = [];
      for (let guard = 0; guard < 20; guard++) {
        let pick = null;
        for (const u of M.UPGRADES) { const l = M.META.up[u.id] || 0; if (l >= u.max) continue; const c = u.cost(l); if (c <= M.G.coins && (!pick || c < pick.c)) pick = { u, l, c }; }
        if (!pick) break;
        M.G.coins -= pick.c; M.META.up[pick.u.id] = pick.l + 1; bought.push(pick.u.id);
      }
      out.push({ bank: M.G.coins, bought: bought.join(','), ups: JSON.stringify(M.META.up), dist: Math.floor(M.G.dist), peak: M.G.peak, kills: M.G.kills, lvl: M.G.level, coinsRun: M.G.coinsRun, cause: M.G.cause || '?', mobs: M.G.mobsBeaten, boss: M.G.bossKills, secs: (steps/60).toFixed(0), trace: trace.join(' '), hist: hist.join(' '), mobLog: mobLog.map(a=>a.join('/')).join(' ') });
    }
    return out;
  }, { runs, skill });
  for (const r of res) console.log(JSON.stringify(r));
  const ds = res.map(r => r.dist).sort((a,b)=>a-b);
  console.log('median dist', ds[Math.floor(ds.length/2)], 'min', ds[0], 'max', ds[ds.length-1]);
  console.log('avg secs', (res.reduce((a,r)=>a+ +r.secs,0)/res.length).toFixed(0), 'avg coins', (res.reduce((a,r)=>a+r.coinsRun,0)/res.length).toFixed(0));
  console.log(errs.join('\n'));
  await b.close();
})();
