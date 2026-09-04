# World Explorer 3D

[![Runtime Verify](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml/badge.svg?branch=stable)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/runtime-verify.yml)
[![Secret Scan](https://github.com/RRG314/WorldExplorer3D/actions/workflows/secret-scan.yml/badge.svg?branch=stable)](https://github.com/RRG314/WorldExplorer3D/actions/workflows/secret-scan.yml)
[![GitHub Pages](https://github.com/RRG314/WorldExplorer3D/actions/workflows/deploy-pages-public.yml/badge.svg?branch=stable)](https://rrg314.github.io/WorldExplorer3D/)
[![Release](https://img.shields.io/github/v/release/RRG314/WorldExplorer3D?sort=semver)](https://github.com/RRG314/WorldExplorer3D/releases/latest)
[![License: Source Available](https://img.shields.io/badge/license-source--available-lightgrey)](LICENSE)

World Explorer 3D is a browser-based world sandbox built around real places.
Choose a location, step into the world, and explore by land, water, air, or
space.

<p align="center">
  <a href="https://worldexplorer3d.io/app/"><strong>Play World Explorer 3D</strong></a>
  · <a href="CONTROLS_REFERENCE.md">Controls</a>
  · <a href="RELEASE_NOTES_5.2.0.md">What’s new</a>
  · <a href="ROADMAP.md">Roadmap</a>
</p>

![Walking beside USS Constellation in Baltimore's Inner Harbor](assets/readme/baltimore-harbor.webp)

*Baltimore’s Inner Harbor, with the mapped USS Constellation identified as a
sloop-of-war museum ship.*

## A world you can play in

Select a city, landmark, airport, harbor, or coordinates and enter a bounded 3D
world shaped by available terrain, roads, buildings, water, land cover, and
places. Walk the streets, cross bridges and rooftops, enter mapped or eligible
generated interiors, drive, fly, sail, fish, survey habitats, build, or meet
other players in a room tied to that location.

The same Explorer connects your Backpack, quick slots, Journal, Field Guide,
activities, Expeditions, specialties, companions, property, and seasonal
surveys. Quick Build places persistent Blocks directly in the current world,
including shared builds inside multiplayer rooms.

| Water and shore | Flight |
| :--: | :--: |
| ![Shore fishing beside Baltimore's Inner Harbor](assets/readme/baltimore-shore-fishing-mobile.webp) | ![Personal aircraft at BWI](assets/readme/bwi-personal-plane.webp) |
| **Fish from shore, pilot boats, dive, and explore ports** | **Use a personal aircraft or board aircraft at mapped airports** |

| Deep space | Explorer progression |
| :--: | :--: |
| ![Wayfinder approach to Sagittarius A star](assets/readme/space-wayfinder-sagittarius.webp) | ![Field Today in My Explorer](assets/readme/explorer-today.webp) |
| **Fly manually or use optional Wayfinder assistance** | **Choose an activity and carry the result into one Explorer record** |

![A playable container cargo ship underway near Rotterdam](assets/readme/rotterdam-cargo-ship.webp)

*A playable cargo ship underway near Rotterdam, with the shoreline kept in the
active world.*

## What you can do

- Explore on foot, by car, drone, plane, helicopter, boat, ship, rover,
  astronaut, or spacecraft, or use optional Live GPS play while walking.
- Drive vehicle families with distinct vehicle handling, visible condition, and
  enterable responder vehicles.
- Visit supported mapped airports to board aircraft, choose pilot or passenger
  travel, search for destinations, or take a local sightseeing flight.
- Search for places by familiar names, including cities, landmarks, airports,
  and other expected location searches.
- Use configurable Backpack quick slots for field tools, fishing gear,
  equipment, and ranged actions.
- Photograph, inspect, survey, identify, fish, follow tracks and signs, and
  record finds in the Journal and Field Guide.
- Explore eleven regional Field Guide packs with 180 attainable entries across
  the built-in Earth destinations.
- Care for companions, build trust and levels, and travel with eligible
  domestic, bird, and livestock companions.
- Enter persistent multiplayer rooms with presence, chat, activities, shared
  Blocks, and room vehicles.
- Use Quick Build to place persistent Blocks in local play or a multiplayer
  room.
- Leave Earth for the Moon, planets, the solar system, and selected deep-space
  destinations, with manual flight always available.
- Try Interstellar Expeditions in Alpha: live aboard Solis Reach, work with its
  crew, respond to voyage events, and fly Pathfinder to supported planetary
  sites and back.
- Claim a first virtual property, list or purchase available properties with
  Explorer Credits, and connect planetary samples to the same Backpack, cargo,
  and mapped-business exchange loop.

## Version 5.2

Version 5.2 extends the 5.1 sandbox with the Interstellar Expeditions Alpha,
connected virtual property and Explorer Credits, a clearer gameplay menu, and
faster cleanup when moving between worlds. The established 5.1 Earth,
Ocean, vehicle, flight, fieldwork, Backpack, Journal, and multiplayer paths
remain part of the release.

Interstellar Expeditions are intentionally labeled Alpha. They provide a
connected playable journey and saved progression, while ship art, crew motion,
mission variety, audio, and planetary detail continue to grow.

Read the full [5.2 release notes](RELEASE_NOTES_5.2.0.md) and the current
[known issues](KNOWN_ISSUES.md).

## Multiplayer and building

Multiplayer uses bounded rooms rather than one continuous MMO world. A room
shares one location, player presence, chat, activities, persistent vehicles,
and player-built Blocks. Private rooms use invite codes; public rooms can be
found by city.

Quick Build is the single player-facing Blocks workspace. Existing supported
local and room Blocks remain on the same persistence path, with one owner for
placement, permissions, saving, and recovery.

## World data and accuracy

Earth scenes use OpenStreetMap-derived geometry and other attributed public or
licensed sources. Coverage, freshness, height information, and provider
availability vary by location. Mapped, observed, modeled, reference, and
game-created content stay visibly distinct.

World Explorer 3D is a game. It is not a navigation, appraisal, surveying,
wildlife-presence, or safety service.

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

Keyboard and touch controls support browser zoom, visible focus, higher
contrast, larger text, and reduced motion.

Core exploration can run without production credentials. Accounts,
multiplayer, moderation, and other online features require an authorized
environment. Secrets are not included in the repository.

## Project guide

- [Release notes](RELEASE_NOTES_5.2.0.md)
- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [System inventory](docs/SYSTEM_INVENTORY.md)
- [Architecture](docs/ARCHITECTURE_MAP.md)
- [Controls](CONTROLS_REFERENCE.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

Copyright © 2026 Steven Reid / World Explorer 3D. All Rights Reserved.

This repository is publicly viewable under the custom source-available terms
in [LICENSE](LICENSE). It is not licensed as OSI open-source software, and
attribution alone does not grant permission to copy, redistribute, publish,
host, or create derivative works. Third-party data, software, and assets remain
subject to their respective terms in [ATTRIBUTION.md](ATTRIBUTION.md) and
[ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md).
