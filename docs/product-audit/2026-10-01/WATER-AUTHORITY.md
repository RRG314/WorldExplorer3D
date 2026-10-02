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

## October 2 continued implementation

- Wave profiles now belong to the water body, with one representative fetch and one modeled-wave input. Mapped areas, rivers and the boat patch use that same profile and spatial scale; entering Boat Mode no longer changes the mapped surface's amplitude. Artistic foam/optical micro-normals remain distinct from geometric height.
- CPU contact samples now include the boat patch's bow/stern displacement, with the same trough bound. Numeric regression compares the GLSL reference expression to the CPU evaluator over positions and headings. Contact normals include the wake slope.
- Reallocated the existing 128×128 patch grid: metre-scale vertices cover the central 64 m, while outer vertices reach the horizon. The former uniform horizon grid could not represent the wave/contact field below a small boat. No additional vertex budget.
- Standalone Ocean now renders a surface and uses that same sampled surface for the sub's upper bound, camera boundary and simulated depth. Ocean/surface transfer retains wave phase across the changed coordinate origin. Geographic bathymetry and compressed/procedural gameplay bottom remain distinct fields.
- Water samples carry volume identity, datum, units, wave time, qualified depth and current evidence. Unknown bottom/current remains null. Current vectors require coastal/open-ocean coverage, valid modeled evidence, a known flow-to convention and a valid time within three hours; they are not yet used as a universal force.
- Marine requests now follow the active Ocean launch site instead of a retained Earth menu selection. Temporary boat water is bounded and cannot remain the query authority after leaving the boat.
- Shore fishing resolves small non-navigable mapped ponds, island banks and exposed streams independently of vessel eligibility. Buried water and vertical mismatches remain ineligible. Fish presentation no longer invents water height from the boat when coverage is absent.
- The full Earth backup walkthrough exposed a regression in the preceding shoreline edit: a buffered footprint query referred to an undefined candidate. Corrected it to use the actual area; the mapped-vessel startup path has a dedicated regression and now completes in the actual Earth application.

Evidence: actual Earth backup/reload/Undo and phone layout; actual Ocean eleven-case browser journey, inspected settled-boat and upper-water-boundary screenshots; numerical body-profile/wake/phase/current/immersion tests; prescribed shader client with inspected CPU markers. These qualify the implemented development boundaries. They do not certify a finished underwater art pack, real tides, physical-phone performance, swimming or moving ship decks. P08/P09 still must exercise these samples through actual character and attachment controllers. The remaining higher-level boundary acceptance is tracked in those phases rather than treating a pure sample helper as completed swimming.
