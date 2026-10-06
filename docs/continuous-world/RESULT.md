# Coverage restoration and continuous-world audit

October 6, 2026. Local work on `steven/visual-quality`. Production and the hosted preview have not been updated by this work.

Building coverage was being reduced before rendering: the nearby selection stopped at 26,000 buildings, and regional selection discarded footprints through sampling and per-tile quotas. Those losses are corrected. Device quality can still change rendering detail; it no longer scales down the nearby building-count ceiling or requests a regional zoom without buildings.

## What is implemented

- Regional selection targets 95% of eligible received footprints and includes every source-identified major building. Independent counters distinguish missing source tiles, invalid geometry, selection limits and rendered coverage. Degenerate simplified polygons fall back to valid building massing.
- Nearby buildings use a fixed 96,000-feature safety ceiling. Baltimore retains 48,294 of 48,834 requested buildings (98.9%); London retains 35,053 of 38,296 (91.5%). Both regional checks reach 95%, with all requested source tiles and all identified majors. These are measured city results, not a worldwide coverage guarantee.
- Complete regional at-grade road linework remains visible. Nearby physical road detail follows the traveller, with at most 16 additional resident regions and one active compilation job. Retiring a region removes its mesh and road contact together; revisiting rebuilds both.
- Building instance buffers, road-mask textures and retired terrain sources have explicit cleanup. Terrain queries cannot silently start downloads. Request and cache ceilings include pending work; direct terrain-image requests now have deadlines and stale-callback protection.
- Land-use classification distinguishes protected-area purpose from actual forest or wetland cover. Terrain and vegetation use the same cover selection, including holes and clearings. The physical-cover index retains large forests without copying their references into thousands of grid cells.
- Scene/map/interior/property/marine coordinate conversions share one authority, including longitude wrapping and the existing polar projection.

## What remains incomplete

**Continuous worldwide travel is not implemented yet.** The outer source region, detailed terrain and initial neighbourhood remain tied to the starting location. Calling the full location loader while moving would reset gameplay. Changing the coordinate origin alone would misinterpret saved and multiplayer positions. The current boundary stays until those owners can transition together.

Worldwide public GIS expansion and convincing distant forest/national-park scenery also remain open. Existing Maryland GIS is preserved. A park boundary does not establish tree cover, and the current park visuals are not final visual acceptance.

Regional Shortbread samples in both tested cities contain no mapped heights. Existing nearby/landmark sources remain, but rendering every source-identified major footprint does not certify that every real-world landmark has its correct identity and height. Authoritative enrichment remains necessary. Full visual road linework likewise does not certify every physical road, bridge or route; physical source selection still has its existing 20,000-way ceiling.

Flight stalls remain in both tested cities: the latest Baltimore run reaches 700 ms, and London has roughly one-second garbage-collection pauses. An instrumented run captured about 1.08 seconds starting collection and 1.11 seconds completing it, including a 0.67-second array-buffer sweep. Heap usage dropped from 1.57 GB to 478 MB. The regional construction storage repair preserves geometry and improves explicit ownership but did not remove this pause. No coverage reduction, forced collection or relaxed stall threshold is used to claim a pass.

## Remaining implementation sequence

1. Move regional decoding and geometry compilation into bounded cell jobs, keeping large temporary construction graphs off the main thread. Preserve source identities and complete visible coverage. Prove dense-city pauses improve with ordinary, uninstrumented flight.
2. Publish moving terrain, buildings, roads and collision data together. Keep usable overlap until replacements are ready; cancel obsolete jobs and retire every associated resource and index. Do not reuse full-game reset during travel.
3. Add atomic coordinate-frame transitions for actors, cameras, velocities and persistent geographic records. Verify existing saves and shared rooms before enabling travel across origins, the date line or polar frames.
4. Expand registered public GIS adapters and source-backed ecology, preserving licences, dates, extents and data gaps. Validate real park, forest, wetland, farm, coast and city scenes.
5. Accept the assembled path only after long outward/return journeys, reversal, provider failure, save/reload and environment exits demonstrate bounded CPU/GPU memory and pending work.

The implementation and test receipts are recorded in [IMPLEMENTATION.md](IMPLEMENTATION.md). A component test, an actual city journey and complete worldwide acceptance are separate evidence levels.

## Tested local build

`5.4.0+6997244021b8.b31eb0f15519dcbc.staging` is preserved in the local `dist` directory. Its artifact bytes verify. The current source passes 1,984 regression tests and supporting source checks. Packaged Baltimore/London coverage and exit cleanup, the mapped-road eviction/return test, and the prescribed driving browser check pass. The latest Baltimore sustained-flight check fails; London sustained-flight failure remains unresolved. This build is not cleared for production.
