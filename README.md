# World Explorer 3D

[![Runtime Verify](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml/badge.svg?branch=main)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml)
[![Version](https://img.shields.io/badge/version-3.0.0-41b9a5)](CHANGELOG.md)
[![License: Source Available](https://img.shields.io/badge/license-source--available-lightgrey)](LICENSE)

World Explorer 3D is a browser-based geospatial exploration game built around real-world map context. Pick a preset city, use the interactive globe, or enter coordinates, then explore by walking, driving, flying, boating, or changing worlds entirely.

**[Launch World Explorer 3D](https://worldexplorer3d.io/app/)**

## Version 3.0

Version 3.0 is a major runtime and feature release. It replaces the earlier monolithic application structure with smaller, ownership-focused systems and expands the experience across Earth, water, the Moon, Mars, the solar system, and deep space.

Highlights:

- Map-informed Earth scenes with roads, buildings, terrain, land use, vegetation, water, bridges, tunnels, and selected landmarks.
- Preset cities, geolocation, coordinate entry, and an interactive globe for choosing locations worldwide.
- Walk, drive, drone, plane, boat, underwater, rover, astronaut, and rocket traversal.
- Optional continuous Earth streaming for longer trips, with quality and distance budgets for ground and aerial play.
- In-session Earth, Moon, Mars, ocean, and space transitions without a page reload.
- A navigable solar system with planets, moons, asteroid and Kuiper belts, spacecraft, and inner/full system maps.
- Deep-space destinations including catalog-backed star systems, nebulae, galaxies, and black-hole encounters.
- Enterable buildings using mapped indoor geometry where available and footprint-aware generated interiors elsewhere.
- Multiplayer rooms, social/account features, world and game editors, a 200-piece block builder, fishing, and leaderboards.
- Responsive touch controls for current iPhone and Android layouts.

## Screenshots

![Driving through Baltimore](assets/landing/gameplay/drive-baltimore.png)
![Exploring Monaco by drone](assets/landing/gameplay/drone-monaco.png)
![Space flight](assets/landing/gameplay/fly-in-space.png)

## Data and Accuracy

Earth scenes use OpenStreetMap-derived geometry and other attributed public datasets. Source coverage, freshness, height data, and provider availability vary by location. The runtime uses bounded fallbacks when data is missing, but it does not claim survey-grade accuracy and is not a replacement for navigation or GIS software.

- [Data sources](DATA_SOURCES.md)
- [Attribution](ATTRIBUTION.md)
- [Known issues and limitations](KNOWN_ISSUES.md)
- [Acknowledgements](ACKNOWLEDGEMENTS.md)

Required attribution: `© OpenStreetMap contributors`

## Run Locally

Requirements: Node.js 22+, Java 21, and a browser with WebGL support.

```bash
git clone https://github.com/RRG314/WorldExplorer3D.git
cd WorldExplorer3D
npm install
npm run sync:public
python3 -m http.server --directory public 4173
```

Open `http://127.0.0.1:4173/app/`.

Core exploration can run locally without production credentials. Account, multiplayer, moderation, and other backend-dependent features require an authorized environment and are not configured by public repository secrets.

## Verify a Change

```bash
npm run sync:public
npm run verify:mirror
npm run release:verify
```

The release gate covers syntax and module integrity, mirror parity, Firestore rules, local-data safety, mobile controls, editor/multiplayer surfaces, building and block contracts, planetary round trips, world-provider fallbacks, ocean/biome behavior, and a global location matrix.

## Repository Layout

- `app/` - canonical browser runtime
- `public/` - generated hosting mirror
- `functions/` - authorized backend functions
- `scripts/` - verification and release tooling
- `tests/` - security and runtime test fixtures
- `assets/` - landing and documentation media
- `github-pages/` - static project explainer for GitHub Pages

Edit canonical files first, then run `npm run sync:public`. Do not edit the mirrored `public/app/` runtime independently.

## Project Documents

- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Controls](CONTROLS_REFERENCE.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

This repository is source-available under the custom terms in [LICENSE](LICENSE). It is not licensed as OSI open-source software. Third-party data and assets remain subject to their respective licenses.
