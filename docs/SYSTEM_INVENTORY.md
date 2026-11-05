# System guide

Use this map to find the main feature owners. Public availability and limitations
are described in the [release notes](../RELEASE_NOTES_5.7.0.md) and
[known issues](../KNOWN_ISSUES.md).

| Area | Source |
| --- | --- |
| Start, globe and product navigation | `app/js/ui/` |
| Careers, assignments and field studies | `app/js/campaign/` |
| Journal, discoveries and equipment | `app/js/discovery/`, `app/js/player/` |
| Character, vehicles and progression | `app/js/character/`, `app/js/engine/` |
| Terrain, roads and buildings | `app/js/terrain/`, `app/js/world/` |
| Interiors and property | `app/js/interiors/`, `app/js/real-estate/` |
| Ocean and marine activities | `app/js/ocean/` |
| Space and planetary exploration | `app/js/space/`, `app/js/astronomy/` |
| Aircraft and maritime travel | `app/js/transport/` |
| Racing and custom tracks | `app/js/racing/`, `services/racing/` |
| Multiplayer rooms and shared building | `app/js/multiplayer/` |
| Capture and contributions | `app/js/reality-capture/`, `account/` |
| Account and private journey services | `js/`, `functions/` |
| Native Portal apps and widgets | `android/`, `apple/`, `portal/` |

A system has one authoritative state owner even when several screens present
it. A feature should use that owner's commands, lifecycle and persistence rather
than introducing a parallel implementation. The [architecture overview](ARCHITECTURE_MAP.md)
explains the shared boundaries.
