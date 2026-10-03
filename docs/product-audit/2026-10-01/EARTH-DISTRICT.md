# P16 · Inner Harbor district acceptance

October 3, 2026. Development source on `steven/visual-quality`; production unchanged.

## Fresh baseline

Actual source browser loaded Baltimore (39.2904, −76.6122), including 25,518 building records, 69 water areas, existing curated skyline and reviewed USS Constellation. Captures at normal walking camera height covered arrival, Saint Paul Place and the west Inner Harbor promenade in live night and controlled daytime. These are actual loaded map/provider data, not a component scene. The initial `initialEarthWorldReady` flag preceded the loading overlay's dismissal; the final harness waits for both.

Observed problems: generic repeated building facades; dark night ground; sparse promenade detail; all seven catalogue vessel classes generated from just three selected facility anchors, including a huge cargo vessel at the museum waterfront; berthed vessels lifted above their authored waterline; the reviewed historic ship shown as a low hull, cabin and bare poles. The district did not offer a coherent short authored walk through these existing features.

## Implemented slice

- Facility semantics now constrain generated vessel roles. A generic pier can offer a runabout/workboat, a marina a sailboat, a ferry facility a ferry. Cargo requires exact mapped port geometry. Explicitly restricted facilities cannot spawn these public activities. Missing suitable facilities omit the vessel instead of borrowing an unrelated anchor. The catalogue itself remains available for legitimate contexts.
- Automatic placement no longer invents synthetic open water when a large mapped launch cannot fit. Existing mapped-water hull clearance checks remain. Berthed/ambient roots now place their authored waterline at the water surface, preserving submerged draft.
- The existing reviewed Constellation hull/identity gains an original, bounded three-mast rig with yards, furled canvas, stays, shrouds, bowsprit and hull-following rails. Hull/ground collision authority and OSM footprint stay unchanged. Rigid pieces batch by material; one line buffer holds rigging. Existing world teardown owns all resources.
- A featured three-stop west-promenade walk uses the existing Activities start/navigation/completion system. Stable route IDs, district/environment eligibility and ground/water/building checks exclude invalid endpoints and blocked intermediate segments. It is a game route, not museum-entry guidance. Its roughly 150 m route is deliberately finite.

## Reference and rights

The [museum's own Constellation page](https://historicships.org/explore/uss-constellation), read October 3, identifies the 1854 sail-only sloop-of-war at Pier 1. Factual identity is used; no museum text, photos, textures or models are copied. The rig is an interpretive original procedural model, not a measured reconstruction. The existing reviewed footprint retains OpenStreetMap/ODbL provenance from `reviewed-mapped-vessels.js`.

## Verification

Five focused contracts pass: visitor-pier role eligibility, cargo/restricted-facility rules, bounded rotated-hull rig/batching, stable authored route and invalid/intermediate blocked-route rejection. Source checks pass. All **1,741 registered tests** pass. The actual-world browser loads provider-backed Baltimore, stages inspection/start poses, selects the authored route through the real Activities UI and walks both legs using keyboard movement (about 46 seconds). It records one local completion with no page exceptions. Desktop/phone images are inspected. The phone test exposed an unreachable detail/result column; the mobile panel now scrolls with a sticky Close header, and selecting an activity brings its details into view. The walking route tube was also lowered/narrowed after the first screenshot showed it crossing the camera.

The prescribed game client exercises and captures the actual museum-rig builder in an isolated reviewed-footprint fixture; the screenshot and state are inspected. Its ship plus water uses 8 draws/2,078 triangles. This is an isolated content measurement, not a whole-city performance certificate. The full-world acceptance separately confirms the rig in its actual location and the generated fleet reduced from seven unsuitable classes to three eligible vessels.

Artifacts: `output/verification/product-plan/earth-district-before/`, `earth-district-day-before/`, `earth-district/`, `harbor-rig-client/`, and phase16-earth logs. Live night/day baseline is retained. Phone is browser emulation, not a physical device. Completion evidence verifies the existing local activity count/UI; independent Journal failure/retry and cross-mode lifecycle review remain P17. The waterfront implementation slice is complete; P16 as a whole remains open.

## Remaining P16 requirements

This waterfront slice does **not** finish the broader district art requirement. Street materials/frontages, appropriate promenade vegetation/furniture, readable night presentation, enterable-space review and district transport continuity still need their own actual-world acceptance. Public cameras C01–C03 are separately complete; C04 breadth/multi-view and C05 release remain open. Do not label P16 complete solely because this route or the camera player passes.
