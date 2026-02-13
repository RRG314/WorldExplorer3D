# Quick Start

## 1. Run Locally

### Option A: Python (recommended)

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

### Option B: Node

```bash
npx http-server -p 8000
```

Open `http://localhost:8000`.

### Option C: VS Code Live Server

1. Install Live Server extension.
2. Open this folder.
3. Start Live Server from `index.html`.

## 2. Deploy to GitHub Pages

1. Push your branch.
2. In GitHub: `Settings > Pages`.
3. Set source to `Deploy from a branch`.
4. Select the target branch and `/ (root)`.
5. Save and wait for deployment.

## 3. First 60 Seconds

1. Open the app and pick a city.
2. Start in Free Roam mode.
3. Drive with `WASD` or arrow keys.
4. Press `F` for walk mode.
5. Press `6` for drone mode.
6. Press `M` for large map.

## 4. Essential Controls

| Key | Action |
| --- | --- |
| `WASD` / `Arrow Keys` | Move/steer |
| `Space` | Handbrake |
| `Ctrl` | Boost |
| `F` | Walk mode toggle |
| `6` | Drone mode toggle |
| `C` | Camera cycle |
| `M` | Large map |
| `Esc` | Pause |

## 5. Troubleshooting

### Black or blank view

- Use Chrome, Edge, or Firefox with WebGL enabled.
- Hard refresh (`Ctrl+Shift+R` or `Cmd+Shift+R`).
- Check browser console for script/network errors.

### Missing map/city geometry

- Wait for OSM and terrain fetches to complete.
- Retry with a different city to compare.
- Confirm internet connectivity and Overpass availability.

### Inconsistent assets after updates

- Clear browser cache.
- Verify cache-bust values in `index.html`, `js/modules/manifest.js`, and `js/app-entry.js` are aligned.

## 6. Where to Go Next

- Usage details: `USER_GUIDE.md`
- Engineering details: `TECHNICAL_DOCS.md`
- Known gaps: `KNOWN_ISSUES.md`
- Contributing process: `CONTRIBUTING.md`
