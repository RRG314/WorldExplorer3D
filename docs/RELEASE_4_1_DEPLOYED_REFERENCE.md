# World Explorer 3D 4.1 Deployed Reference

## Purpose

This record identifies the production build used to compare 4.1 behavior. It
is not a visual-quality approval and it is not a release candidate.

Captured at `2026-07-25T18:40:56Z` with one browser session at a time. No
production state, backend data, account data, or deployment was changed.

## Production identity

Both production origins returned the same manifest bytes:

- `https://worldexplorer3d.io/build-manifest.json`
- `https://worldexplorer3d-d9b83.web.app/build-manifest.json`

| Field | Value |
|---|---|
| product | `worldexplorer3d` |
| version | `4.0.0` |
| build ID | `4.0.0+7c7e95e269af.cf3ff47b27d84319.production` |
| commit | `7c7e95e269af7f7d4e9fbaf824bcfc108f1fb0f7` |
| commit time | `2026-07-23T21:38:59-04:00` |
| source dirty | `false` |
| environment | `production` |
| Firebase project | `worldexplorer3d-d9b83` |
| file count | `554` |
| manifest SHA-256 | `69ee25a35c24cd361e34f142d0588e50003ddee3269292522a5e4e301f7447b1` |

The manifest uses `Cache-Control: no-store`. The custom domain and Firebase
origin returned the same ETag and payload.

## Observed journeys

### Title and destination selector

Status: **observed**

- `https://worldexplorer3d.io/app/` reached the title/destination selector with
  no captured console or page error.
- Baltimore was selected at `39.290400, -76.612200`.
- The selector exposed Earth, Moon, Mars, Space, and Ocean destinations.
- Search, manual coordinates, nearby locations, My Places, Live Earth,
  missions, multiplayer, account entry, controls, settings, theme, and
  fullscreen entry points were present.
- The selected-place text explicitly identified the nearby list as
  OpenStreetMap-derived.

### Title to Baltimore Earth

Status: **behavior completed; visual failed**

- The production UI completed the Baltimore Earth transition and reached
  walking gameplay on East Fayette Street.
- Roads, buildings, the player, HUD, minimap, weather, and controls rendered.
- The captured frame is not acceptable: a large building mass occupies or
  blocks the street corridor immediately beside the player and overwhelms the
  camera.
- This is the release-blocking road/building occupancy fixture. It must be
  fixed through the canonical surface and occupancy contracts, not through a
  Baltimore-specific exclusion.

The title capture SHA-256 was
`51aa0c99d8a2ac45607a1387244ee8d8cf2e9c01864937d679f197cb7c39e710`.
The Baltimore capture SHA-256 was
`ced220bd9b8d3bd527d99c1556ce569a74c331d3d46ca476ba26a471de881de4`.
Bulky browser artifacts are deliberately not committed.

## Supported journey inventory

The following existing product journeys remain parity requirements. An entry
point or earlier test is evidence of intended support, not proof that the
journey currently meets 4.1 quality:

| Journey | 4.1 evidence owner |
|---|---|
| Title, search, coordinates, nearby, My Places to Earth | browser journey and visual fixture |
| Earth walk, drive, drone, and plane | `Traveler` contract plus production-hardware journey |
| Earth water entry, boat, submarine, and Earth return | destination/traveler lifecycle journey |
| Earth, Moon, Mars, Space, and return | destination-session lifecycle journey |
| Ocean destination and return | destination-session lifecycle journey |
| Live Earth and provider degradation | source-adapter contract plus browser journey |
| Missions, activities, interiors, editor, and maps | product-parity inventory and browser journey |
| Sign-in, saves, multiplayer, chat, moderation, and rooms | port contract, emulator test, and browser journey |
| Desktop, touch, mobile layouts, and gamepad | input-port contract and device journey |
| Hosting preview, production smoke, rollback, and manifest | release-operations gate |

These journeys are recertified only after their owning recovery phase is
implemented. Phase 0 does not run the complete live matrix, mutate account
state, or turn production into a test environment.

## Reference rules

1. Production 4.0 is a behavior and data-compatibility reference, not the 4.1
   architecture.
2. A working control or transition does not override a broken rendered frame.
3. 4.1 must not reproduce the road/building overlap, split initial/streamed
   world ownership, or Overture-backed ordinary-vector fallback.
4. Later evidence must name the exact commit, manifest, coordinates, journey,
   hardware/browser path, and visual decision.
