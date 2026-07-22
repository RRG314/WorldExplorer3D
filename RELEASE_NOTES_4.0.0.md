# World Explorer 3D 4.0.0

World Explorer 3D 4.0 is the open-source world-platform release. It combines the refactored geospatial explorer with an authoritative multiplayer foundation, reusable gameplay contracts, contributor documentation, and a single release-tested runtime for Earth, ocean, Moon, Mars, and space.

## Highlights

- Explore detailed OSM-backed locations or use optional tiled continuous travel with explicit source, surface, and streaming ownership.
- Walk, drive, fly, use a drone, operate boats and submarines, traverse planetary surfaces, and return between environments without reloading the page.
- Run authoritative multiplayer rooms with validated commands, interest management, persistence, reconnect recovery, progression, missions, combat, vehicles, world edits, and leaderboards.
- Create activities and worlds through the editor and 200-piece block builder while preserving compatible browser and legacy room data.
- Use the consolidated globe hub for locations, destinations, missions, multiplayer, library entries, settings, and provenance-aware Live Earth tools.
- Inspect observed aircraft, satellites, earthquakes, weather, community street imagery, modeled marine conditions, and supported NOAA station data with freshness and provider labels.
- Self-host and contribute under Apache-2.0 with documented governance, security, data licensing, media licensing, extension contracts, and local MMO setup.

## Compatibility And Safety

- Existing browser records and legacy multiplayer rooms use additive normalization and recovery paths rather than destructive migrations.
- Firestore rules protect private rooms, quotas, presence, shared blocks, chat, invitations, scores, and user-owned records.
- Production credentials, service-account keys, payment secrets, provider credentials, and administrative access are not included in the public repository.
- Third-party data, media, models, APIs, and trademarks retain their original terms and are not relicensed by Apache-2.0.

## Verification

The release candidate is validated as one exact commit. The gate covers dependency and export checks, hosting artifact identity, source reachability, open-source distribution, Firestore rules and persistence, multiplayer contracts and load, browser gameplay, mobile controls, editors, block building, environment lifecycle, planetary launches and returns, Earth surface contracts, provider fallbacks, and representative global visual matrices.

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md), [DATA_SOURCES.md](DATA_SOURCES.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [SELF_HOSTING.md](SELF_HOSTING.md) before deployment or redistribution.
