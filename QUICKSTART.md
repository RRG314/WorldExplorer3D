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

## 4. RDT vs Baseline Benchmark (2-Minute Workflow)

1. In the title screen, open `Settings`.
2. In `⚡ Performance Benchmark`, choose a mode:
   - `RDT Optimized`
   - `Baseline (No RDT Budgeting)`
3. Optional: check `Show live benchmark overlay in-game` (default is OFF).
4. Click `Apply + Reload World`.
5. Click `Copy Snapshot` and paste the JSON into your notes.
6. Overlay placement: debug sits between speed/mode HUD; benchmark sits between mode HUD/Main Menu.
7. Compare:
   - `lastLoad.loadMs`
   - `lastLoad.phases.fetchOverpass`
   - `renderer.calls`
   - `renderer.triangles`
   - `fps` / `frameMs`
   - `lastLoad.overpassSource` (`network` vs `memory-cache`)

Reference test (Baltimore, 2026-02-14):

- Baseline network load: `5551 ms`
- RDT network load: `4669 ms`
- RDT repeat load with memory cache: `2202-2246 ms` (`fetchOverpass: 0 ms`)

## 5. Essential Controls

| Key | Action |
| --- | --- |
| `WASD` / `Arrow Keys` | Move/steer |
| `Space` | Handbrake |
| `Ctrl` | Boost |
| `F` | Walk mode toggle |
| `6` | Drone mode toggle |
| `C` | Camera cycle |
| `M` | Large map |
| `B` | Block build mode toggle |
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

Block builder action:

| Action | Result |
| --- | --- |
| Press `B` | Toggle build mode |
| Click (build mode on) | Place brick block |
| Shift+Click (build mode on) | Remove targeted block |
| `🎮 Game Mode` -> `🧹 Clear Blocks` | Remove all build blocks for current location (including saved blocks) |
| Block cap | Up to `100` total blocks can be stored for now |

## 6. Troubleshooting

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
- Current freeze snapshot cache-bust target is `v=50`.

### Memory markers not persisting

- Ensure browser local storage is enabled for this site.
- Avoid strict private/incognito settings that block storage.
- Confirm marker placement is not showing a storage warning in the composer.

## 7. Where to Go Next

- Usage details: `USER_GUIDE.md`
- Engineering details: `TECHNICAL_DOCS.md`
- Known gaps: `KNOWN_ISSUES.md`
- Contributing process: `CONTRIBUTING.md`
