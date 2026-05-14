# Mindustry Web Port

Plays Mindustry v157.4 in the browser via [CheerpJ](https://cheerpj.com) — no install, no account.

**Save data** is stored locally in each visitor's browser (IndexedDB). Every person who opens the page has their own completely separate save.

---

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Source** and set it to **Deploy from a branch → `main` → `/ (root)`**.
3. Your game will be live at `https://<your-username>.github.io/<repo-name>/`.

That's it — no build step, no server.

---

## How it works

| Piece | What it does |
|---|---|
| `index.html` | Loading screen + CheerpJ launcher |
| `sw.js` | Service worker: downloads the 85 MB JAR from GitHub Releases on first visit, caches it in the browser so every subsequent load is instant |
| CheerpJ 4.3 | Runs the Mindustry desktop JAR as WebAssembly/JS inside the browser, maps OpenGL → WebGL, maps file I/O → IndexedDB |

### Per-user saves
CheerpJ automatically backs Mindustry's virtual home directory (`~/.local/share/Mindustry/`) with the browser's IndexedDB. Each browser is completely isolated — no backend or accounts needed.

---

## Notes

- **First load** downloads ~85 MB. After that the JAR is cached and loads in seconds.
- **Recommended browsers:** Chrome / Edge (best WebGL + WebAssembly support). Firefox works but may be slower.
- CheerpJ runs the unmodified desktop JAR. If Mindustry's LWJGL native layer has any compatibility gap in a specific browser version you may see a black screen — open the browser console for details.
- Mindustry is open-source (GPL-3.0): https://github.com/Anuken/Mindustry
