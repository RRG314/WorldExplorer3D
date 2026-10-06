# Coverage restoration and continuous-world audit

October 6, 2026. Local work on `steven/visual-quality`. The test preview is updated; production remains unchanged.

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

Historical flight failures before the current worker checkpoint: the latest Baltimore run reaches 700 ms, and London has roughly one-second garbage-collection pauses. An instrumented run captured about 1.08 seconds starting collection and 1.11 seconds completing it, including a 0.67-second array-buffer sweep. Heap usage dropped from 1.57 GB to 478 MB. The regional construction storage repair preserves geometry and improves explicit ownership but did not remove this pause. No coverage reduction, forced collection or relaxed stall threshold is used to claim a pass.

## Remaining implementation sequence

1. Move regional decoding and geometry compilation into bounded cell jobs, keeping large temporary construction graphs off the main thread. Preserve source identities and complete visible coverage. Prove dense-city pauses improve with ordinary, uninstrumented flight.
2. Publish moving terrain, buildings, roads and collision data together. Keep usable overlap until replacements are ready; cancel obsolete jobs and retire every associated resource and index. Do not reuse full-game reset during travel.
3. Add atomic coordinate-frame transitions for actors, cameras, velocities and persistent geographic records. Verify existing saves and shared rooms before enabling travel across origins, the date line or polar frames.
4. Expand registered public GIS adapters and source-backed ecology, preserving licences, dates, extents and data gaps. Validate real park, forest, wetland, farm, coast and city scenes.
5. Accept the assembled path only after long outward/return journeys, reversal, provider failure, save/reload and environment exits demonstrate bounded CPU/GPU memory and pending work.

The implementation and test receipts are recorded in [IMPLEMENTATION.md](IMPLEMENTATION.md). A component test, an actual city journey and complete worldwide acceptance are separate evidence levels.

## Current test checkpoint

The clean local artifact is `5.4.0+abb8e8a9274a.0218ea3cefb3aa7c.staging` in `dist`: 610 byte-verified files, 186 runtime bundles and 84 accepted-ground files. Full runtime regression at 27924374 passes 1,997 contracts and supporting gates; the final markup-only repair passes source validation and actual desktop/phone-viewport map tests. [Test preview](https://we3d-staging-20260712--visual-review-1005-e5075bnu.web.app) is published after its required packaged smoke passed; hosted manifests match the local bytes. [Testing notes](TEST-BUILD.md) identify what is verified and what remains unfinished. A normal in-app browser (no debug App Check token) loads Baltimore and live weather with no error-console entries. The automated hosted client received 403/401 resource errors and stopped after its first burst; that failed receipt is preserved. Exact Overpass transport timed out in the normal browser and used the existing generalized fallback, so this does not certify exact bridges or routes.

Regional building and road construction now share one bounded worker. Road pixels match the previous renderer, source bytes remain owned by the cache, cancellation/deadline/error/fallback paths close cleanly, and repeated WebGL retirement returns to baseline. Nearby straight-wall building geometry matches every tested original attribute byte. POI visibility uses one immutable classification table and still follows each current layer toggle. The map search field now uses the existing accessible hidden-label style instead of exposing that label as a grid column.

The latest ordinary London 90-second flight still fails: 40.77 FPS with a 216.6/400.1 ms cluster near 83 seconds. Coverage/source/shader/exit checks pass: 758,110/798,010 regional buildings (95%), all 1,319 identified majors and 400/400 source tiles; exit heap 45.46 MB. Regional roads include 141,168 source fragments in 9.87 MB. Nearby coverage remains 35,053/38,296 (91.5%). These data are from 27924374; the following commit changes only the search-label markup and its verifier.

Baltimore retains 48,294/48,834 nearby (98.9%) and 384,814/405,067 regional (95%), all 1,489 identified majors and 240/240 tiles. Actual mapped-road eviction/return passes with 39 evictions, 9–12 moving residents and identical support on return. The clean final abb8e8a9 performance repeat passes: 90 seconds, 46.35 FPS, p95/p99 33.4 ms, maximum 66.6 ms and no frames over 100 ms; exit heap 44.41 MB. The earlier overlapping run remains a failed/confounded receipt. Prescribed driving and map-toggle controls pass with no browser errors, and screenshots were opened.

**This is a coverage/ownership test checkpoint. Worldwide continuous travel, expanded GIS/ecology and final performance/release acceptance are not complete.** Production remains unchanged.
