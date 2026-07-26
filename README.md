# World Explorer 3D

[![Runtime Verify](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml/badge.svg?branch=main)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml)
[![Secret Scan](https://github.com/RRG314/WorldExplorer3D/actions/workflows/secret-scan.yml/badge.svg?branch=main)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/secret-scan.yml)
[![GitHub Pages](https://github.com/RRG314/WorldExplorer3D/actions/workflows/deploy-pages-public.yml/badge.svg?branch=main)](https://rrg314.github.io/WorldExplorer3D/)
[![Release](https://img.shields.io/github/v/release/RRG314/WorldExplorer3D?sort=semver)](https://github.com/RRG314/WorldExplorer3D/releases/latest)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

World Explorer 3D is a browser-based geospatial exploration game built around real-world map context. Pick a preset city, use the interactive globe, or enter coordinates, then explore by walking, driving, flying, boating, or changing worlds entirely.

**[Launch World Explorer 3D](https://worldexplorer3d.io/app/)**

## Version 4.0

Version 4.0 turns the refactored explorer into an open-source world platform. It adds an authoritative multiplayer foundation, contributor-facing gameplay contracts, stronger persistence and security boundaries, and a release-tested runtime spanning Earth, ocean, Moon, Mars, and space.

Highlights:

- Map-informed Earth scenes with roads, buildings, terrain, land use, vegetation, water, bridges, tunnels, and selected landmarks.
- Preset cities, geolocation, coordinate entry, and an interactive globe for choosing locations worldwide.
- Live Earth views for observed satellites, earthquakes, aircraft, current weather, community street imagery, modeled marine conditions, and NOAA water-level/tide coverage.
- Walk, drive, drone, plane, boat, underwater, rover, astronaut, and rocket traversal.
- In-session Earth, Moon, Mars, ocean, and space transitions without a page reload.
- A navigable solar system with planets, moons, asteroid and Kuiper belts, spacecraft, and inner/full system maps.
- Deep-space destinations including catalog-backed star systems, nebulae, galaxies, and black-hole encounters.
- Enterable buildings using mapped indoor geometry where available and footprint-aware generated interiors elsewhere.
- Multiplayer rooms, social/account features, world and game editors, a 200-piece block builder, fishing, and leaderboards.
- Responsive touch controls for current iPhone and Android layouts.
- Provider health, freshness, cache, quality, datum, and fallback labels that distinguish observations, models, predictions, and reference-only data.
- Apache-2.0 project licensing, contributor governance, self-hosting guidance, and explicit third-party asset/data notices.

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
npm run build:hosting -- --firebase-env staging
python3 -m http.server --directory dist 4173
```

Open `http://127.0.0.1:4173/app/`.

Core exploration can run locally without production credentials. Account, multiplayer, moderation, and other backend-dependent features require an authorized environment and are not configured by public repository secrets.

## Verify a Change

```bash
npm run build:hosting -- --firebase-env staging
npm run verify:hosting
npm run audit:reachability
npm run runtime:verify
npm run release:verify
```

`runtime:verify` is the fast pull-request gate. The full release gate additionally covers Firestore rules, mobile controls, editor/multiplayer surfaces, planetary round trips, world-provider fallbacks, ocean/biome behavior, and the global location matrix.

## Repository Layout

- `app/` - canonical browser runtime
- `dist/` - ignored, generated hosting artifact
- `functions/` - authorized backend functions
- `scripts/` - verification and release tooling
- `tests/` - security and runtime test fixtures
- `assets/` - landing and documentation media
- `github-pages/` - static project explainer for GitHub Pages

Edit canonical source only. `npm run build:hosting` creates a fresh, content-hashed hosting artifact; generated `dist/` files are never edited or committed.
`npm run audit:reachability` rejects hosted JavaScript or CSS that is no longer reachable from a declared page/runtime entrypoint.

## Project Documents

- [Changelog](CHANGELOG.md)
- [Release runbook](RELEASE_RUNBOOK.md)
- [Roadmap](ROADMAP.md)
- [Controls](CONTROLS_REFERENCE.md)
- [Contributing](CONTRIBUTING.md)
- [Governance](GOVERNANCE.md)
- [Community conduct](CODE_OF_CONDUCT.md)
- [Support](SUPPORT.md)
- [Security policy](SECURITY.md)
- [Local MMO stack](SELF_HOSTING.md)
- [Gameplay extension guide](CONTENT_EXTENSION_GUIDE.md)
- [MMO architecture](MMO_ARCHITECTURE.md)

## License

Original project code and documentation are open source under the
[Apache License 2.0](LICENSE). Third-party data, assets, and hosted services are
not relicensed; review [third-party notices](THIRD_PARTY_NOTICES.md),
[data licensing](DATA_LICENSES.md), [media licensing](MEDIA_LICENSE.md), and
[trademark guidance](TRADEMARKS.md) before redistributing a build.
