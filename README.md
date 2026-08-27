# World Explorer 3D

[![Runtime Verify](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml/badge.svg?branch=stable)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml)
[![Secret Scan](https://github.com/RRG314/WorldExplorer3D/actions/workflows/secret-scan.yml/badge.svg?branch=stable)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/secret-scan.yml)
[![GitHub Pages](https://github.com/RRG314/WorldExplorer3D/actions/workflows/deploy-pages-public.yml/badge.svg?branch=stable)](https://rrg314.github.io/WorldExplorer3D/)
[![Release](https://img.shields.io/github/v/release/RRG314/WorldExplorer3D?sort=semver)](https://github.com/RRG314/WorldExplorer3D/releases/latest)
[![License: Source Available](https://img.shields.io/badge/license-source--available-lightgrey)](LICENSE)

World Explorer 3D is a browser-based geospatial exploration game. Choose a
place on the globe, enter coordinates, or use a preset destination, then
explore on foot, by road, over water, through the air, or beyond Earth.

**[Play World Explorer 3D](https://worldexplorer3d.io/app/)**

![Expanded New York world viewed from the air](assets/landing/gameplay/showcase/new-york-expanded-aerial.webp)

*New York viewed from the air in World Explorer 3D.*

## Overview

World Explorer 3D turns real-world map context into bounded, playable 3D
locations in the browser. A selected location combines available terrain,
roads, buildings, water, land cover, and places with game systems for walking,
vehicles, field exploration, fishing, building, and multiplayer rooms. Separate
Ocean, Moon, Mars, solar-system, and deep-space environments extend play beyond
the active Earth location.

The game supports solo exploration and location-bound multiplayer. Player
progress connects the Backpack, Journal, Field Guide, activities, Expeditions,
specialties, companions, and seasonal surveys. The World Editor is the shared
home for reviewed overlays and persistent local or room Blocks.

World Explorer uses attributed public and licensed sources where their coverage
allows, and keeps mapped, observed, modeled, reference, and game-generated
content distinct. It is an exploration game—not a navigation, wildlife-presence,
surveying, or safety tool.

## Version 5.1

World Explorer 3D 5.1 makes the Explorer, Journal, Field Guide, and Backpack one
connected record of what you do across the sandbox. It also expands regional
field play beyond Baltimore while keeping every lead honest about what the game
does and does not know.

Highlights include:

- Walking, driving, drone, plane, boat, underwater, rover, astronaut, and
  spacecraft traversal.
- A unified World Editor with persistent local and multiplayer Blocks.
- A dedicated Journal for Fieldwork, Games, Making, Travel, Community, and
  Companions, connected to one Explorer profile.
- A shared Backpack, Field Today activities, Expeditions, Field Guide, life
  lists, specialties, companions, and seasonal surveys.
- Eleven regional Field Guide packs covering 180 attainable entries across
  plants, animals, birds, insects and arachnids, freshwater fish, and marine
  fish. Every built-in Earth destination resolves to an appropriate pack.
- Searchable current-region and World Guide views, grouped unidentified
  entries, and downloadable Journal backup and restore.
- Field leads shared by normal walking and optional Live GPS play. Field leads
  are game opportunities and do not claim a real animal is physically present.
- Shore, boat, and underwater fishing connected to the same Journal and Field
  Guide records.
- Bounded multiplayer rooms with presence, chat, shared building, activities,
  and persistent vehicle ownership.
- Keyboard, touch, browser-zoom, focus, contrast, larger-text, and reduced-motion
  support.

Version 5.1 does not claim complete worldwide ecology, universal detailed
interiors, survey-grade terrain, or identical data quality at every location.
See [Known Issues](KNOWN_ISSUES.md) for current limits.

## Explore the world

| Baltimore waterfront | Monaco coast |
| :--: | :--: |
| ![Baltimore Inner Harbor and surrounding city](assets/landing/gameplay/showcase/baltimore-waterfront-skyline.webp) | ![Monaco's mapped streets, buildings, hills, and coast](assets/landing/gameplay/showcase/monaco-coast-aerial.webp) |
| **Harbor, roads, and city context** | **Dense development along the Mediterranean** |

| San Francisco Bay | Tokyo |
| :--: | :--: |
| ![San Francisco skyline and bay](assets/landing/gameplay/showcase/san-francisco-bay-skyline.webp) | ![Shinjuku and the surrounding Tokyo city world](assets/landing/gameplay/showcase/tokyo-shinjuku-aerial.webp) |
| **A city shaped by land and water** | **Local detail inside a large urban region** |

Bridges, elevated roads, ramps, tunnels, streets, shorelines, and terrain are
part of play rather than static scenery. Available detail depends on source
coverage and the selected location.

## Multiplayer and building

Multiplayer uses bounded rooms rather than one continuous MMO world. A room
shares one location, player presence, chat, activities, persistent vehicles,
and player-built Blocks. Private rooms use invite codes; public rooms can be
found by city.

Blocks now live inside the World Editor so building and reviewed overlays no
longer compete as separate editing systems. Existing supported local and room
blocks are retained through the migration.

## Data and accuracy

Earth scenes use OpenStreetMap-derived geometry and other attributed public
datasets. Coverage, freshness, height information, and provider availability
vary. World Explorer uses clearly labeled fallbacks when information is
missing, but it is not a navigation tool or a source of survey-grade data.

- [Data sources](DATA_SOURCES.md)
- [Attribution](ATTRIBUTION.md)
- [Known issues](KNOWN_ISSUES.md)
- [Acknowledgements](ACKNOWLEDGEMENTS.md)

Required map attribution: `© OpenStreetMap contributors`

## Run locally

Requirements: Node.js 22+, Java 21, and a browser with WebGL support.

```bash
git clone https://github.com/RRG314/WorldExplorer3D.git
cd WorldExplorer3D
npm install
npm run build:hosting -- --firebase-env staging
python3 -m http.server --directory dist 4173
```

Open `http://127.0.0.1:4173/app/`.

Core exploration can run without production credentials. Account,
multiplayer, moderation, and other backend-dependent features require an
authorized environment. Secrets are not included in the repository.

## Project documents

- [Release notes](RELEASE_NOTES_5.1.0.md)
- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [System inventory](docs/SYSTEM_INVENTORY.md)
- [Architecture](docs/ARCHITECTURE_MAP.md)
- [Controls](CONTROLS_REFERENCE.md)
- [DeFlock Hunt](docs/DEFLOCK_MODE.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

This repository is source-available under the custom terms in [LICENSE](LICENSE).
It is not licensed as OSI open-source software. Third-party data and assets
remain subject to their respective licenses.
