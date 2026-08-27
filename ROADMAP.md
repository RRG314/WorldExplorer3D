# World Explorer 3D Roadmap

Last updated: 2026-08-26.

Production remains on version 4.3.1. Version 5.0 is in staging preparation and
will not replace production until desktop and mobile testing is approved.

## Version 5.0

Version 5.0 focuses on making existing systems work as one game while adding a
regional field-exploration and progression loop.

| Area | Current 5.0 status | Remaining release work |
| --- | --- | --- |
| World loading and traversal | Implemented | Final staging regression review |
| Roads, bridges, tunnels, terrain, and buildings | Implemented for the supported bounded-world model | Continue expanding reviewed location coverage after 5.0 |
| Interiors | Mapped detail where available plus generated multi-floor fallback | More mapped connector and accessibility coverage later |
| Mobile controls and camera | Reported direction, follow-camera, loading, selector, prompt, and speed issues corrected | Hands-on testing on the new staging link |
| Backpack and player state | Shared schema, v1→v2 migration, backup, and rollback implemented | Confirm migration with representative existing player data |
| Field exploration | Shared walking/Live GPS activities, Journal, Field Guide, life lists, specialties, companions, and recurring programs implemented | Physical-device Live GPS review |
| Baltimore ecology | Versioned 60-taxon regional pack implemented | Independent scientific review and later regional expansion |
| Fishing | Shore, boat, and underwater records use one authority | Expand reviewed fish and waterbody coverage later |
| Multiplayer | Bounded rooms, presence, chat, activities, Blocks, overlays, and persistent vehicles implemented | Fresh two-client staging review and larger-room testing later |
| World Editor and Blocks | Integrated into one editor with local/room persistence | Hybrid terrain/building material editing remains later work |
| Accessibility | Keyboard, focus, zoom, touch targets, text, contrast, motion, and live-status baseline implemented | Broader assistive-technology and physical-device review |
| Public presentation | Player-facing landing copy, release notes, system inventory, and architecture updated | Final screenshot and release-page review |

The planned 5.0 feature implementation is complete. Production remains on 4.3.1
until the 5.0 staging build has been reviewed on desktop and mobile and approved
for release.

## 5.0 release gate

Before production:

1. Publish the final 5.0 staging build.
2. Complete desktop and mobile gameplay review.
3. Release the exact approved build as `v5.0.0`.

## Phase B: regional expansion

After 5.0:

- Add independently reviewed ecology packs for more regions.
- Promote more creatures from reference presentation to higher-quality,
  correctly scaled animated models with mobile LODs.
- Expand reviewed terrain, bathymetry, fish, interiors, and water access.
- Broaden Live GPS device, accessibility, privacy, battery, and thermal review.
- Add larger multiplayer capacity tests and fuller moderation workflows.
- Extend the integrated editor with bounded terrain and building-material tools
  without creating a second competing building system.

## Phase C: worldwide depth

Longer-term work includes:

- A repeatable licensed ecology-pack publication process for worldwide growth.
- More complete regional geology, habitats, insects, fish, and seasonal detail.
- Wider high-quality terrain and structure coverage.
- Mature creator publishing, discovery, moderation, and community tools.
- Additional cooperative activities and non-punitive long-term progression.

Worldwide completeness will not be claimed from regional packs or provider
fallbacks. Missing mapped or scientific data must remain visibly unknown rather
than being invented.
