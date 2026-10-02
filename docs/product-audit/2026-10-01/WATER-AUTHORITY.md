# P07 — water authority integration, in progress

October 2, 2026. These repairs use the current source and actual browser findings; they do not certify the entire ocean expansion.

## Repaired in this continuation

- CPU wave components and generated GLSL previously used different spatial and temporal multipliers. They now agree numerically across 81 combinations of location, time and water profile.
- The active boat patch now uses the same modeled-wave profile, speed, amplitudes and spatial scale as buoyancy and water queries. Removed separate geometric amplitude/scale multipliers from that patch; optical foam and highlights remain presentation controls. Model height/period remain source evidence, not a claim that the visual transfer function is measured wave geometry.
- Surface queries retain the wave normal. Queries without an explicit boat candidate locate actual mapped water, including small non-navigable lakes and exposed rivers; island holes and buried waterways are excluded. Missing coverage cannot produce a numeric waterline through the public height query. Boat access remains separate from water coverage.
- Delayed marine responses can no longer change a different selected place, relabel its cache, or start obsolete station requests. Location changes immediately clear old evidence; invalid/null coordinates do not become 0,0. Marine wave guidance is not applied to inland lakes.
- Actual direct-Ocean-to-boat testing exposed missing Earth-only dependencies: the terrain-height function and water material registration, plus the Earth-only coordinate conversion used by the return dive. The bounded ocean handoff now has an explicit surface datum and the boat imports its material owner directly.
- Actual Ocean → surface boat → Ocean round-trip testing now retains the geographic origin. Screenshot review exposed a second transition defect: the Pacific surface retained the previous terrestrial map origin. Both ordinary Earth loads and the accepted marine handoff now use a validated coordinate-origin commit. The handoff creates its bounded ocean surface rather than selecting leftover terrestrial water polygons.

- Extended settled-camera review found repeated offshore spawn corrections: shoreline distance relied on an Earth-only polygon helper. It now uses the canonical water-body boundary query, including island-hole clearance. The actual browser verifies stationary horizontal continuity and the boat remaining in the camera frustum after settling; the inspected frame shows the boat correctly.

## Evidence and limits

Component equation/provenance/race tests, real WebGL shader fixture and actual-source ocean entry/controls/maps/provider-outage/surface-boat checks are recorded in `output/verification/product-plan` and `output/verification/ocean-plan`. The controlled water fixture passed the prescribed game client; shader/state and images were inspected. This is not physical-device or multiplayer certification.

P07 is still open. Remaining integration includes the standalone underwater renderer versus Earth surface clock/datum, rendered wake displacement versus contact samples, non-boat mapped-water material profiles, a complete depth/current/coverage sample shared by immersion/fishing, and boundary checks at shore/deck/head/sub transitions. Station tide values remain evidence only until their datum and spatial validity can be transformed safely. Unknown bottom/current data must remain unknown. Do not add tide offsets or universal ocean currents merely to fill fields.

P08–P12 swimming, automatic equipment, moving research-ship deck, persistent sub recovery and the marine outing require those remaining contracts. The visible boat remains the existing runabout; the underwater art and ecology remain below the requested target. These repairs are necessary stability and coherence work, not the new research ship or finished marine content pack.
