# MOB RUN tests

Browser tests driven by Playwright. They load the game with `index.html?debug`, which exposes `window.__mob` (state, `update`, spawners, ...) so a script can play, fast-forward and inspect runs.

## Setup

```bash
npm install --no-save playwright && npx playwright install chromium
```

Serve the game from the repo root in another terminal:

```bash
python3 -m http.server 8787
```

## Run

```bash
cd tests && ./run-all.sh
```

Each script prints `ok:` / `FAIL:` lines and `no page errors` at the end; `run-all.sh` exits non-zero if anything failed.

| Script | What it checks |
| --- | --- |
| `e2e.js` | Phone flow: daily gift, armory purchase, touch steering, pause, death, results lockout, quick-buy, revive cost and grace, run again, save persistence |
| `regress.js`, `regress3.js` | Bugs found in code reviews (boss contact damage, mission double pay, kill counts, history, language reload, geometry leaks, level-up beat after revive) |
| `settings.js`, `rmotion.js` | Settings toggles persist; reduced-motion devices start without screen shake |
| `i18n.js` | Indonesian locale end to end, language switch |
| `pausemenu.js`, `tut.js`, `mouse.js` | Pause menu (settings, END RUN), swipe tutorial, desktop mouse steering |
| `close.js`, `mys.js`, `records.js`, `bestin.js` | Close calls, mystery gates and splitter boss, lifetime records, BEST IN countdown |
| `sharenav.js`, `offline.js`, `layouts.js` | Share never navigates away, PWA works offline, key buttons fit on small/landscape/desktop screens |
| `monkey.js [secs] [phone/desktop]` | Random taps, swipes, keys, blur and fast-forwards; fails on page errors, NaN state or stuck modes |
| `sim.js [runs] [good/sloppy]` | Balance: a bot plays full runs, prints distance, duration and cause of death |
| `prog.js [runs] human` | Long-term economy: a bot plays many runs and buys upgrades with what it earns |

`sim.js` and `prog.js` are measurements rather than pass/fail tests; they take a few minutes.
