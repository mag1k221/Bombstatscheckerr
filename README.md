# Boomsquad Stats

Paste an AlbionBB battle link + a .txt with your squad's names → summed kills, deaths, K/D and comp.

- `index.html`, `app.js`, `style.css` – the site
- `api/battle.js` – Vercel serverless function that reads the official Albion Online API (Europe)
- `dev-server.mjs` – local preview: `node dev-server.mjs`, then open http://localhost:3000

Deploy: push this folder to GitHub → vercel.com → Add New → Project → Import the repo → Deploy (no settings needed).
