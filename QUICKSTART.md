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

1. Open the app and pick a city (or use Custom search).
2. Choose launch mode: `Earth`, `Moon`, or `Space`.
3. Start in Free Roam mode.
4. Drive with `WASD` or arrow keys.
5. Press `F` for walk mode.
6. Press `6` for drone mode.
7. Press `M` for large map.
8. Click the `🌸` memory button and place a pin/flower memory note.

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

Space-flight specific:

| Key | Action |
| --- | --- |
| `Arrow Keys` | Rocket steering (yaw/pitch) |
| `Space` | Thrust / boost |
| `Shift` | Brake / decelerate |

Memory marker action:

| Action | Result |
| --- | --- |
| `🌸` memory button (above controls) | Open persistent memory composer |
| Click memory marker -> `Remove Marker` | Erase pin / pull flower |
| Memory composer -> `Delete All` | Remove all local memory markers |

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
- Verify cache-bust values are aligned across `index.html`, `js/bootstrap.js`, `js/modules/manifest.js`, and `js/app-entry.js`.
- Current freeze snapshot cache-bust target is `v=28`.

### Memory markers not persisting

- Ensure browser local storage is enabled for this site.
- Avoid strict private/incognito settings that block storage.
- Confirm marker placement is not showing a storage warning in the composer.

## 6. Where to Go Next

- Usage details: `USER_GUIDE.md`
- Engineering details: `TECHNICAL_DOCS.md`
- Known gaps: `KNOWN_ISSUES.md`
- Contributing process: `CONTRIBUTING.md`
