# MOB RUN

The game from those fake mobile ads — for real, in 3D. A crowd-runner × multiplier-gates shooter built with Three.js: steer your army left/right, pick the best gates (+N, ×N, −N, ÷N, gun upgrades), shoot barrels for loot, and survive mobs, walls and bosses across 5 zones.

Play: **https://mob-run.pages.dev** — or run locally: serve the folder (`python3 -m http.server 8787` → http://localhost:8787) and open `index.html`. The 2D fallback is at `classic.html` (also live at `mob-run.pages.dev/classic`).

## Deploy — Cloudflare Pages

Static site, no build step. Live at `https://mob-run.pages.dev` (project `mob-run`). Two ways:

### A) Git-connected (auto deploy on push)
1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick this repo.
2. Settings:
   - **Framework preset:** None
   - **Root directory:** `/` (repo root)
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
3. Every push to `main` deploys automatically.

### B) Direct upload (wrangler)
```sh
npx wrangler pages deploy . --project-name mob-run
```
First run creates the project; it then serves at `mob-run.pages.dev`.
