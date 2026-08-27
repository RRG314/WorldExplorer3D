# World Explorer 3D Roadmap

Last updated: 2026-08-27.

Version 5.0 is the current approved release. The roadmap below separates its
shipped regional scope from later expansion work.

## Version 5.0

Version 5.0 focuses on making existing systems work as one game while adding a
regional field-exploration and progression loop.

| Area | Current 5.0 status | Remaining release work |
| --- | --- | --- |
| World loading and traversal | Released in 5.0 | Continue reviewed location coverage |
| Roads, bridges, tunnels, terrain, and buildings | Implemented for the supported bounded-world model | Continue expanding reviewed location coverage after 5.0 |
| Interiors | Mapped detail where available plus generated multi-floor fallback | More mapped connector and accessibility coverage later |
| Mobile controls and camera | Reported direction, follow-camera, loading, selector, prompt, and speed issues corrected and approved | Broaden physical-device coverage |
| Backpack and player state | Shared schema, v1→v2 migration, backup, and rollback released | Continue representative migration monitoring |
| Field exploration | Shared walking/Live GPS activities, Journal, Field Guide, life lists, specialties, companions, and recurring programs released | Broaden physical-device Live GPS coverage |
| Baltimore ecology | Versioned 60-taxon regional pack implemented | Independent scientific review and later regional expansion |
| Fishing | Shore, boat, and underwater records use one authority | Expand reviewed fish and waterbody coverage later |
| Multiplayer | Bounded rooms, presence, chat, activities, Blocks, overlays, and persistent vehicles released | Larger-room testing later |
| World Editor and Blocks | Integrated into one editor with local/room persistence | Hybrid terrain/building material editing remains later work |
| Accessibility | Keyboard, focus, zoom, touch targets, text, contrast, motion, and live-status baseline implemented | Broader assistive-technology and physical-device review |
| Public presentation | Player-facing landing copy, release notes, system inventory, architecture, and screenshots updated | Maintain with each release |

The planned 5.0 feature implementation and owner acceptance are complete.

## 5.0 release boundary

Completed for 5.0:

1. Published the final 5.0 staging build.
2. Completed desktop and mobile gameplay review.
3. Approved the exact candidate for `v5.0.0` release.

## Phase B: regional expansion

In the 5.1 candidate:

- A single regional-pack registry now covers all 15 built-in Earth
  destinations with 11 packs and 180 total taxa. The 120 newly added taxa are
  integrated with walking, Live GPS, field activities, the Journal, Field
  Guide, life lists, and recurring progression.
- Each new pack retains taxonomy, habitat, season, regional-source, licensing,
  attribution, localization, sensitive-species, version, migration, and
  rollback metadata.
- The expansion remains a reviewed regional field-guide slice. Independent
  domain review is still required before the new packs are promoted from
  candidate status.

After the 5.1 candidate:

- Promote more creatures from reference presentation to higher-quality,
  correctly scaled animated models with mobile LODs.
- Add independently reviewed packs beyond the built-in destination regions.
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
