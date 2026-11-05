# MOB RUN

The game from those fake mobile ads — for real, in 3D. A crowd-runner × multiplier-gates shooter built with Three.js: steer your army left/right, pick the best gates (+N, ×N, −N, ÷N, gun upgrades), shoot barrels for loot, and survive mobs, walls and bosses across 5 zones.

- **Enemy mobs** march in with a count. Shoot them down on approach, then whatever is left trades 1:1 with your squad on contact. They scale with distance, your army and your firepower, so every run ends eventually.
- **Armory**: coins buy permanent upgrades (bigger starting squad, starting gun, body armor, coin value) and skins.
- **Missions**: three at a time, they pay out the moment you finish them and get harder each time.
- **Daily gift** with a 7-day streak, a **personal-best finish line** on the road, and a coin-priced revive.
- Pause with the **II** button, P or Esc; the game also pauses itself when you switch apps.

Play: **https://mob-run.pages.dev** — or run locally: serve the folder (`python3 -m http.server 8787` → http://localhost:8787) and open `index.html`. The 2D fallback is at `classic.html` (also live at `mob-run.pages.dev/classic`).

Testing hook: open `index.html?debug` and the page exposes `window.__mob` (state, `update`, `startGame`, ...) so a headless browser can drive and fast-forward runs.
