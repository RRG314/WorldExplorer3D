# World Explorer 3D

[![Runtime Verify](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml/badge.svg)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml)
[![Deploy GitHub Pages (public)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/deploy-pages-public.yml/badge.svg)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/deploy-pages-public.yml)
[![License: Source Available](https://img.shields.io/badge/license-source--available-lightgrey)](LICENSE)

World Explorer 3D is a browser-based 3D geospatial exploration application built around real-world map data, including OpenStreetMap-derived roads, buildings, land-use, water, and place context.

It is an interactive exploration app, not a flat map viewer and not a routing/navigation replacement. The focus is immersive place exploration across Earth, Moon, Space, and Ocean destination modes.

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

## Current Status

- Active and usable, with ongoing iteration.
- Canonical runtime source: `app/*`.
- Canonical landing/account sources: `index.html`, `account/index.html`.
- Hosting/runtime mirror: `public/*` (`public/app/*`, `public/index.html`, `public/account/index.html`).
- Includes geolocation launch flow and Ocean mode in the current branch.
- Core play, traversal modes, and the large map remain free; donations are optional recognition/support only.

## What It Does

- Launch from preset cities or custom coordinates.
- Use geolocation (`Use My Location`) in title and globe selector flows.
- Explore in 3D with driving, walking, drone, and rocket traversal.
- Enter boat travel intentionally near valid larger water bodies on Earth, with shoreline-aware prompts, smoother wave-based hull motion, sea-state cycling, shoreline docking on exit, and automatic boat entry when you intentionally target open water from the map or globe-selector custom launch flow.
- Route walk/drive/drone mode changes through one shared travel-mode controller so keyboard and UI transitions stay in sync.
- Keep traversal switches and custom/geolocation launches on safe ground: valid positions stay put, invalid positions resolve to the nearest safe road or ground spawn based on the active mode.
- Switch destinations (Earth, Moon, Space, Ocean) from title and in-game menus.
- Render map-informed world context (roads/buildings/land-use/water) for Earth scenes.
- Match Earth lighting to the explored location with real-world sun angle, sunrise/sunset transitions, moon phase, and night-sky visibility based on the current coordinates and current date/time.
- Match Earth weather to the explored location with live local condition, temperature, cloud cover, wind context, clearer HUD state, and lightweight local sky/atmosphere adjustments based on the current coordinates.
- Keep manual environment overrides available so players can temporarily force clear/cloudy/rain/snow/fog/storm presentation without losing the live location-aware baseline.
- Apply layered shared surface rules so precise local OSM surface evidence wins first, sparse desert fallback stays localized, coastal cities do not turn into all-sand, and polar regions still resolve to snow/frozen water.
- Add procedural sidewalks and urban corridor treatment so dense cities read as roads + sidewalks + urban ground instead of random grass, while parks and mapped green areas remain green. The current pass keeps that lightweight with one shared sidewalk batch, tapered intersection joins, and reduced redundant building-apron ground in urban road corridors.
- Keep boat travel performance-safe by detecting valid water from loaded water polygons/waterways, preserving more context in harbors/coasts/lakes, reducing shoreline detail more aggressively only when truly offshore, and avoiding a separate disconnected ocean minigame path.
- Add OSM-driven vegetation so forests, woods, parks, tree rows, and individual mapped trees make Earth scenes feel less empty without turning every tile into high-detail foliage.
- Use roads for drive routing and keep walking/navigation aligned to the core road-and-ground traversal network while the separate foot/cycle/rail rollout is paused for cleanup.
- Use one shared building-entry system for exploration and real-estate destinations: `E` enters supported buildings on demand, OSM indoor data is used when available, and enclosed generated interiors are used as the fallback when it is not.
- Show an enterable-buildings section in the large-map legend; it scans nearby supported buildings on demand and lists mapped/generated/listing-backed interiors that can actually be entered.
- Open an isolated contributor editor session from the in-world editor toggle, capture a location/building/destination, draft place/building/interior/photo contributions, preview them privately, submit them as `pending`, and let approved contributions appear later as public world/map markers without directly editing the live world.
- Route contributor submissions through protected backend functions so signed-in users can submit safely, admins can review from a private moderation page, and the live world only changes after approval.
- Provide minimap/large-map overlays and runtime controls for exploration, with `M` for the large map.
- Add performance-conscious rooftop HVAC/detail and broader building color variation so dense cities read less flat/repetitive.
- Support multiplayer/social/account features when backend services are configured.

## Why Mapping/OSM Users May Care

- Uses OSM ecosystem data in a browser-native 3D interaction model.
- Demonstrates one practical path from OSM feature data to interactive WebGL world exploration.
- Keeps data attribution visible in both runtime UI and repository docs.

## Screenshots

![Earth city traversal](assets/landing/gameplay/drive-baltimore.png)
![Space destination mode](assets/landing/gameplay/fly-in-space.png)
![Ocean destination mode](assets/screenshots/ocean-mode-great-barrier-reef.png)

## OpenStreetMap Data and Attribution

This project uses OpenStreetMap data and services in multiple runtime paths. Attribution and data usage notes are documented here:

- [DATA_SOURCES.md](DATA_SOURCES.md)
- [ATTRIBUTION.md](ATTRIBUTION.md)
- [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)

Required attribution string used by this project:

- `© OpenStreetMap contributors`

## Live and Local Usage

- Primary site: [worldexplorer3d.io](https://worldexplorer3d.io)
- Repository target: [RRG314/WorldExplorer3D](https://github.com/RRG314/WorldExplorer3D)

Local run:

```bash
npm install
cd functions && npm install && cd ..
npm run sync:public
python3 -m http.server --directory public 4173
```

Open:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/app/`

## Test and Release Verification

```bash
npm run sync:public
npm run verify:mirror
npm run test
npm run test:world-matrix
npm run release:verify
```

`npm run sync:public` also mirrors the repository `CNAME` file into `public/CNAME`, so the published Pages artifact keeps the `worldexplorer3d.io` custom domain attached to the current build.

Targeted feature smoke:

```bash
npm run test:osm-smoke
npm run test:world-matrix
npm run test:boat-smoke
```

`npm run test:osm-smoke` now also checks Monaco water visibility plus shared polar/desert/beach surface behavior, including Hollywood staying non-sand and a loaded Santa Monica beach polygon classifying as localized sand.
`npm run test:runtime` and `npm run test:world-matrix` now also verify location-based astronomical sky state, live weather readiness, manual weather override cycling, local weather-deck activation, and multi-time-zone / multi-location environment behavior.

## How To Help

You do not need to be a programmer to contribute.

Useful contributions include:

- bug reports with exact steps, location, and mode
- loading/performance notes from real gameplay
- screenshots or short videos of broken behavior
- clearer setup instructions or wording fixes
- map/data accuracy notes for real places

If you do want to code, start with [CONTRIBUTING.md](CONTRIBUTING.md) and [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md).

Editor workflow note:

- The contributor editor stays isolated from normal play.
- Signed-in contributor submissions now go through the backend moderation pipeline instead of direct browser-side Firestore writes.
- Drafts and pending submissions are private to the contributor/admin who created or reviews them.
- Supported edit types now include `Place Info`, `Artifact Marker`, `Building Note`, `Interior Seed`, and `Photo Contribution`.
- Building and interior-oriented edits reuse the same capture flow as real building entry and real-estate destinations, so contributors can stage changes against actual footprints instead of detached editor-only targets.
- Approved submissions load as a separate contribution layer near the active area and can be toggled from the large-map legend.
- Admin moderation now has a dedicated account-side page at `/account/moderation.html`, with plain-language review cards, preview links, approve/reject actions, and optional email alerts when new submissions arrive.

## Repository Structure (Top-Level)

- `app/` - Canonical browser runtime source (edit here first)
- `public/` - Hosting output roots, including `public/app/` runtime mirror
- `functions/` - Firebase backend functions (auth/social/billing/runtime support)
- `scripts/` - Verification and release gate scripts
- `tests/` - Rules/runtime tests
- `assets/` - Landing and documentation media assets
- `docs/` - Research and technical reference material

## Documentation Map

- [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)
- [QUICKSTART.md](QUICKSTART.md)
- [USER_GUIDE.md](USER_GUIDE.md)
- [TECHNICAL_DOCS.md](TECHNICAL_DOCS.md)
- [docs/MAPCOMPLETE_ADAPTATION_REPORT.md](docs/MAPCOMPLETE_ADAPTATION_REPORT.md)
- [GITHUB_DEPLOYMENT.md](GITHUB_DEPLOYMENT.md)
- [LIMITATIONS.md](LIMITATIONS.md)

Good starting points by audience:

- New contributor: [CONTRIBUTING.md](CONTRIBUTING.md)
- Non-technical contributor: [USER_GUIDE.md](USER_GUIDE.md)
- Developer: [ARCHITECTURE.md](ARCHITECTURE.md)
- Release or QA review: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)

OSM ecosystem materials:

- [OSM_ECOSYSTEM_METADATA.md](OSM_ECOSYSTEM_METADATA.md)
- [OSM_WIKI_ENTRY_DRAFT.md](OSM_WIKI_ENTRY_DRAFT.md)
- [docs/MAPCOMPLETE_ADAPTATION_REPORT.md](docs/MAPCOMPLETE_ADAPTATION_REPORT.md)

## Limitations and Non-Goals

See [LIMITATIONS.md](LIMITATIONS.md) for current caveats, including:

- upstream data/service variability (Overpass/geocoding/tile/network)
- browser/device WebGL performance differences
- experimental destination modes (especially Ocean)
- backend-dependent features and deployment prerequisites

## License

This repository is source-available under the custom terms in [LICENSE](LICENSE). It is not an OSI open-source license.

## Contributing

Contribution workflow and validation requirements are documented in [CONTRIBUTING.md](CONTRIBUTING.md).
