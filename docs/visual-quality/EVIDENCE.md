# Visual quality verification

September 28, 2026. Local implementation on `steven/visual-quality`; production
unchanged. This is not a release approval or completion of the full visual plan.

## Implemented

- Quality settings preserve active exposure and authored car materials. Manual
  sky presets supply the visual state consumed by weather.
- Terrain slope blending conserves weights across refreshes. Bare ground and
  missing vegetation no longer imply dunes. Dark photographic shadows have
  reduced authority; mineral and snow materials ignore obsolete green vertex tint.
- Ship equipment retains emissive strength, console housings and cables.
  Furniture preserves imported transforms, physical height and wall contact.
  Shared licensed bulkhead/carpet maps and corrected light intensities improve
  material consistency. Pending furnishings and surface maps respect disposal.
- The distorted navigation console was rejected after source/runtime comparison
  and removed from the runtime catalog/package. Stations use the approved
  LuddePudde instrument module. Interaction and collision authority are retained.
- Sketchfab vegetation uses denoises trees, fern and grass, plus lev26's bush.
  Tree LODs retain trunk origins and share identical texture allocations.
  Source licenses, hashes and conversion records are recorded with the assets.
- Model URLs carry content revisions. Hosting builds reject stale revisions.
- Near/mid facade openings filter by pixel footprint, fading subpixel windows to
  their coverage instead of aliasing; mapped footprints and bay counts are unchanged.
- Remote walking players use the existing licensed character and animation
  controller. Mode changes and departure cancel/release character instances.
  Room membership, network poses and interpolation remain with multiplayer.

## Current checks

| Evidence | Result and scope |
| --- | --- |
| Targeted components | 32 passed: presentation, biome, atmosphere, asset integrity/budgets, revision hashes, vegetation and remote-character cancellation |
| Terrain shader fixture | Rendered rock/sand/forest/snow; black imagery and obsolete green tint assertions passed; screenshots inspected |
| Vegetation fixture | Five families loaded; near and LOD views inspected; shared-map LOD view used seven textures and six draw calls |
| Space browser sweep | 97 checks passed before the final wall-module substitution; destinations and ship images inspected; two reboard/release cycles returned to the same resource footprint |
| Final ship-only sweep | Nine checks passed after wall-module substitution, including 25 room captures, crew, furnishings, camera modes, exit and retention; screenshots inspected |
| Ship research | Specimen placement, measurement, fabrication and pod launch passed earlier in this implementation |
| Public multiplayer | Two-client isolated-service browser journey passed |
| Weekly room | After the avatar change, two authenticated clients joined the same public Chicago room/world; membership and curated remote character verified; no browser errors; member screenshot inspected |
| Remote-character browser fixture | Four vehicle/return and leave/rejoin cycles, animation present, stable 17 geometries/two textures, no graphics errors; screenshots inspected |
| Facade checks | Six layout/texture components passed; actual near and merged-mid shaders passed four building styles, color parity and eight-attribute budget; three distance views inspected |
| Final city check | London loaded and walked after the facade change without browser/graphics/local-asset errors; screenshot inspected |
| Final terrain holdouts | Canyon and Iowa loaded and walked without page/graphics/local-asset errors; images inspected, remaining appearance limits below |

Evidence is under `output/visual-quality/` and `output/verification/`. These
ignored captures are local test artifacts, not shipped content. Source tests,
controlled rendering fixtures, full-world browser journeys and live services
are different evidence levels. Emulator passes do not certify live signed-in
production behavior or physical phone performance.

The first remote-character fixture failed because its test selected the name
sprite after child order changed on a mode switch. The fixture now selects the
character by identity; the corrected four-cycle run passed. Earlier failed
captures are retained, not counted as successful evidence.

## Visual findings and remaining acceptance

The twelve-location initial functional matrix included a subsequently rejected
image-color recovery experiment. It is historical evidence, not the final build.
That experiment softened cliffs and was removed. A stronger rock mip bias was
also rejected; the current distance bias is 1.5 levels.

Sahara's gray-green rock color was present in the aerial source, with correct
mineral weights. Iowa's field color likewise comes from imagery rather than a
concrete material override. These observations do not make either landscape
visually complete. Close agricultural detail, canyon repetition and regional
vegetation still require work. The Amazon sample uses generic broadleaf trees,
not a validated tropical family. Some utility-room furnishings remain basic;
repeated wall instruments improve consistency but do not finish room variety.
Other-world rendering retains approximations and some simple satellite surfaces.
Remote vehicle/drone/space proxies remain primitive; only walkers were replaced.
Remote character customization is not transmitted by the current room protocol.

The shared presentation-owner consolidation, regional asset coverage, broader regional facade
review, compressed-texture pilot and matched whole-game performance measurements
remain open. No claim of improved whole-game FPS, peak memory, startup time or
production readiness follows from these checks. The previously failed release
performance thresholds remain unchanged. Physical phone verification is pending.
