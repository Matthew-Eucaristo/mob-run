# MOB RUN

The game from those fake mobile ads — for real, in 3D. A crowd-runner × multiplier-gates shooter built with Three.js: steer your army left/right, pick the best gates (+N, ×N, −N, ÷N, gun upgrades, sealed **?** mystery gates), shoot barrels and prisoner cages for loot and recruits, and survive mobs, walls, hazards and bosses across 5 zones.

**In a run**
- **Enemy mobs** march in with a count. Shoot them down on approach, then whatever is left trades 1:1 with your squad on contact. They scale with distance, your army and your firepower, so every run ends eventually.
- **War bands** every ~350m: a road-wide mob sized to your army. Build up, get tested, build up again.
- **Bosses**: brutes, gunners that lob fireballs, and splitters that burst into three brutes.
- **Zones** each have their own weather and favourite hazard: pits in Toxic Mire, lava and meteors in Ember Ridge, saws on the Salt Flats, chokepoints in Deep Run.
- Guns unlock along the run; **close calls** (a saw or meteor that only just misses) pay coins; every level-up offers a pick of three stacking skills.

**Between runs**
- **Armory**: permanent upgrades (bigger starting squad, starting gun, body armor, magnet, lucky golden gates, coin value, and FIREPOWER, which keeps going) plus squad colors. The results screen offers the cheapest affordable upgrade as a one-tap buy.
- **Missions and ranks**: three missions at a time, paid the moment you finish them and harder each time; every three missions promotes you a rank (+5% coins each).
- **Daily gift** with a 7-day streak, a **personal-best finish line** on the road, a coin-priced revive with a moment of grace, a chart of your last runs, lifetime records, and a SHARE button that makes an image of the run.

**Controls**: one thumb on phones (swipe sideways to steer, up for a column, down to spread wide). On desktop the squad follows the mouse, the wheel stretches the formation, and arrows/WASD also work. **II**, P or Esc pauses (pause has settings and END RUN); the game also pauses itself when you switch apps.

**Settings**: sound effects, music, vibration, screen shake, and language. The game speaks Bahasa Indonesia on Indonesian devices and English elsewhere.

Play: **https://mob-run.pages.dev** — or run locally: serve the folder (`python3 -m http.server 8787` → http://localhost:8787) and open `index.html`. It installs as a PWA and works offline. The 2D fallback is at `classic.html` (also live at `mob-run.pages.dev/classic`).

Testing hook: open `index.html?debug` and the page exposes `window.__mob` (state, `update`, `draw`, `startGame`, spawners, ...) so a headless browser can drive and fast-forward runs.

Assets: fonts are Lilita One and Nunito (SIL Open Font License 1.1, licences in `fonts/`). Icons (`icons.js`), sounds and music are generated in code; there are no image or audio files besides the app icons.
