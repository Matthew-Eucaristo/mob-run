# MOB RUN

*More of us, fewer of them.* A 3D crowd runner built with Three.js. Steer your squad through the right gates (+N, ×N, −N, ÷N, gun upgrades, sealed **?** mystery gates), shoot barrels and prisoner cages for loot and recruits, and outnumber whatever is waiting down the road across five zones.

**In a run**
- **Gates are the game.** Aim at a panel and the whole squad takes it; straddle the middle post and the soldiers who run into it are lost. Some pairs are obvious, some are close calls (+N vs ×2), and some only ask which loss hurts less.
- **Rival mobs** are sized from distance, not from your army, so every good pick is a lead you keep. Shoot them down on approach; whatever is left trades 1:1 on contact. The first mob of every run always reaches you.
- **War bands** come every ~350m, then closer together past 900m. A full army always wins the clash, but has to rebuild before the next one.
- **Past the 20,000 cap** a third of the surplus banks into reserves that march back in after a clash, and big overflows sharpen your guns.
- **Bosses** are three recurring rivals with something to say: MURGO THE WALL, AUNTIE BOOM (hair up, throws fireballs) and THE GRUBB BROTHERS (hit one, meet the others). Each one enters mid-screen, holds its distance and closes in; kill it in time or it stomps through your squad.
- **Zones** each have a palette, weather, a favourite hazard and one set-piece per visit: the Prison Convoy in Nightfall, Sinkholes in Toxic Mire, a Meteor Shower in Ember Ridge, the Saw Gauntlet on the Salt Flats and The Squeeze in Deep Run.
- Guns unlock along the run; **close calls** pay coins; every level-up offers three stacking skills from a set of thirteen (SKEWER, HAIR TRIGGER, ZAPPER, GIANT SLAYER, BACKS TO THE WALL, ...).

**Between runs**
- **Armory**: RECRUITER (more soldiers from every green gate), a starting gun, body armor, magnet, lucky golden gates, coin value, and FIREPOWER, which keeps going. Nine squad colors, each with its own headgear, shown as 3D portraits. The results screen offers a one-tap upgrade.
- **Missions and ranks**: three missions at a time, starting near your record, paid the moment you finish them; every three promote you a rank.
- **Daily gift** with a 7-day streak, a **personal-best finish line** on the road, a coin-priced revive, a labelled chart of your last runs, lifetime records, and a SHARE button that makes an image of the run.

**Controls**: one thumb on phones (swipe sideways to steer, up for a column, down to spread wide; the FORMATION chip also cycles it). On desktop the squad follows the mouse, the wheel stretches the formation, and arrows/WASD also work. **II**, P or Esc pauses; the game also pauses itself when you switch apps.

**Settings**: sound effects, music, vibration, screen shake, and language. The game speaks Bahasa Indonesia on Indonesian devices and English elsewhere.

Play: **https://mob-run.pages.dev** — or run locally: serve the folder (`python3 -m http.server 8787` → http://localhost:8787) and open `index.html`. It installs as a PWA and works offline. The 2D fallback is at `classic.html` (also live at `mob-run.pages.dev/classic`).

**Tests**: browser tests live in `tests/` (see `tests/README.md`); `cd tests && ./run-all.sh` runs the pass/fail set against a local server. `index.html?debug` exposes `window.__mob` (state, `update`, `draw`, `startGame`, spawners, ...) so a headless browser can drive and fast-forward runs.

Assets: fonts are Lilita One and Nunito (SIL Open Font License 1.1, licences in `fonts/`). Icons (`icons.js`), sounds and music (a 16-bar song per zone key) are generated in code; there are no image or audio files besides the app icons and the link preview.
