# World Explorer 3D

[![Runtime Verify](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml/badge.svg)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml)
[![Deploy GitHub Pages (public)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/deploy-pages-public.yml/badge.svg)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/deploy-pages-public.yml)
[![License: Source Available](https://img.shields.io/badge/license-source--available-lightgrey)](LICENSE)

World Explorer 3D is a browser-based 3D geospatial exploration game built around real-world map data. The runtime renders roads, buildings, land use, water, and place context from OpenStreetMap-derived sources and layers that into a playable 3D world.

This repository is the full project source. The current branch, `steven/continuous-world-root-repair`, is focused on making Earth loading, traversal, and continuous-world streaming behave more like a stable game runtime instead of a fragile map-data demo.

## Who This Project Is For

This repository is useful for:

- players and testers who want to try the current build
- contributors who want to report issues or improve docs
- artists, designers, and researchers who want to understand the project
- developers working on runtime, data, UI, backend, or deployment

If you want the quickest path:

1. Read [QUICKSTART.md](QUICKSTART.md) to run the project locally.
2. Read [USER_GUIDE.md](USER_GUIDE.md) to understand the in-game systems.
3. Read [CONTRIBUTING.md](CONTRIBUTING.md) if you want to help.

## Branch Status

- Canonical runtime source: `app/*`
- Canonical landing/account sources: `index.html`, `account/index.html`
- Hosting/runtime mirror: `public/*`
- Current branch validation and open regressions live in [docs/BRANCH_STATUS.md](docs/BRANCH_STATUS.md)
- Current known runtime problems live in [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
- GitHub Pages deployment notes, including manual branch deployment, live in [GITHUB_DEPLOYMENT.md](GITHUB_DEPLOYMENT.md)

## Core Capabilities

- Launch from preset cities or custom coordinates.
- Use geolocation (`Use My Location`) in title and globe-selector flows.
- Explore Earth in driving, walking, drone, and boat modes.
- Switch between Earth, Moon, Space, and Ocean destination modes.
- Render a continuous Earth world from streamed roads, buildings, water, and land-use features.
- Use one shared travel-mode and spawn-safety path so mode switching and custom launches resolve to valid positions.
- Support on-demand building entry with mapped interiors where available and generated interiors as fallback.
- Provide large-map and minimap navigation with runtime controls designed for gameplay, not just inspection.
- Support optional backend-connected account, moderation, and multiplayer features when Firebase services are configured.

## Quick Start

```bash
git clone https://github.com/RRG314/WorldExplorer3D.git
cd WorldExplorer3D
npm install
cd functions && npm install && cd ..
npm run sync:public
python3 -m http.server --directory public 4173
```

Open:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/app/`

If you plan to run Playwright-based runtime checks locally, install the browser once:

```bash
npx playwright install chromium
```

## Validation

```bash
npm run sync:public
npm run verify:mirror
npm run test:performance-stability
npm run test:drive-camera-smoothness
npm run test:city-reload-cycle
npm run test:boat-smoke
npm run release:verify
```

Use [TESTING.md](TESTING.md) for the test catalog and [docs/BRANCH_STATUS.md](docs/BRANCH_STATUS.md) for the latest branch snapshot.

## Documentation

- [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)
- [QUICKSTART.md](QUICKSTART.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [TECHNICAL_DOCS.md](TECHNICAL_DOCS.md)
- [TESTING.md](TESTING.md)
- [docs/BRANCH_STATUS.md](docs/BRANCH_STATUS.md)
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md)

## Repository Structure (Top-Level)

- `app/` - canonical gameplay runtime source
- `public/` - hosting mirror output
- `functions/` - Firebase backend functions
- `scripts/` - Playwright and validation harnesses
- `tests/` - rules and security tests
- `assets/` - project media
- `docs/` - branch status and supporting design references

## OpenStreetMap Data and Attribution

This project uses OpenStreetMap data and services in multiple runtime paths.

- [DATA_SOURCES.md](DATA_SOURCES.md)
- [ATTRIBUTION.md](ATTRIBUTION.md)
- [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)

Required attribution string used by this project:

- `© OpenStreetMap contributors`

## Live Site

- Primary site: [worldexplorer3d.io](https://worldexplorer3d.io)
- Repository: [RRG314/WorldExplorer3D](https://github.com/RRG314/WorldExplorer3D)

## License

This repository is source-available under the custom terms in [LICENSE](LICENSE). It is not an OSI open-source license.
