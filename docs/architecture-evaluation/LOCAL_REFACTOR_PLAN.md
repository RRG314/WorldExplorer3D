# Local implementation plan

The owner requested planning and implementation for local testing only. No branch, report, candidate or runtime change from this work is to be pushed to GitHub or deployed. Remote inspection on September 27 confirmed the architecture branch is absent and the architecture report directory is absent from stable/main. Local Git commits remain local history.

## Architecture

Keep the browser, Three renderer, Firebase authority, provider normalization, publication identities, existing spatial indexes and established Worker result contracts. Use one implementation for each numerical or domain rule. Expose existing data through explicit inputs; retain composition adapters where they select the active runtime.

## Implementation sequence and acceptance

1. Promote the measured sorted profile lookup for compiler-owned transport models. Preserve the general legacy sampler for arbitrary/external profiles, duplicate-knot interpolation and endpoint behavior. Require exact captured-data parity and structure/vehicle regressions.
2. Reduce temporary objects in decal clipping, a measured compiler CPU/allocation hotspot. Reuse call-local numeric scratch arrays while preserving clipping tolerance, winding, triangle order and interpolated heights. Require full vertex parity with the previous implementation, thin-face/seam tests and a matched replay; keep only if measured beneficial.
3. Extract geographic feature selection into an engine-neutral location-parameter module. Existing runtime exports remain adapters, preserving sorting, spread policy and caller behavior. Require translated-location and ordering tests.
4. Add boundary type checks using the existing request/provenance authority and the new numerical/location interfaces. No broad file conversion, runtime validator replacement or TypeScript bundle overhead.
5. Expose active renderer ownership in diagnostics while retaining the existing main-renderer field for compatibility. Test Earth, Ocean, Space, missing owners and shared renderer identity.
6. Retain the already verified service-generation, frontage and menu fixes. Do not replace the functioning Capture index or introduce asynchronous wheel contacts. Preserve asset and backend authority.
7. Run targeted regression and real-data replay checks once per relevant change. Then run normal-clock local Earth traversal/return/auxiliary-environment checks, inspect screenshots, build one local candidate and expose its URL for owner testing. Compare component gains separately from whole-world performance; no false total-FPS claim.

## Decisions that are part of the plan

Rust/Wasm and WebGPU remain experiments, not runtime dependencies. Additional compiler Workers require measured end-to-end input ownership, cancellation and publication benefit; moving a large mutable pipeline wholesale is not an approved shortcut. Shared memory is not justified. Stable night-light pooling stays experimental until equivalent visual output and GPU cost are measured. Complete transitive review of the broad coupling inventory remains separate from these bounded implementation gates; the counts do not justify changing every module.

## Evidence ledger

Implementation and verification results are appended here. Source-level checks, numeric parity, browser interaction, visual review and live-service verification are distinct. A local candidate does not authorize a production release.

### Implemented

- Numeric profile authority lives in `structure-semantics/profile-sampling.js`. Only compiler-owned models use the sorted search. General inputs retain the previous interpolation behavior, and height reconciliation remains live.
- Decal clipping uses call-local numeric scratch arrays; published geometry and clipping tolerances are preserved.
- Geographic selection takes an explicit location in `earth-core/location-selection.js`; existing world callers use a compatibility adapter.
- Strict boundary checks cover requests, coordinate frames, provenance, geographic selection and numeric queries. Runtime validation remains in JavaScript.
- Diagnostics expose active/main/Ocean/Space renderer ownership without breaking the legacy main-renderer field. Shared renderer objects are read once.
- Integrated visual inspection found retained Earth selection and civic overlays in Ocean. Committed Earth departure now clears transient presentation and releases the selection callback. The retained Earth simulation is preserved. Rejected transitions do not clear it; returning does not resurrect an obsolete action.

### Measured results

| Component | Previous median | Promoted median | Correctness evidence |
| --- | ---: | ---: | --- |
| Profile lookup, 187,580 queries | 8.1 ms | 5.3 ms | All queries identical, maximum error zero |
| Decal clipping, 5,184 queries per round | 45.6 ms | 43.7 ms | Zero full-vertex mismatches; SF/Monaco golden hashes unchanged |

Both use five warm-up rounds and 30 rotated measurement rounds in Chrome on the same Mac. The clipping gain is small and should not be described as a major loading improvement. Scratch-object removal is established by source; an allocation-byte reduction has not been measured for this promoted implementation. These numbers do not establish a whole-game FPS improvement.

The integrated daylight Baltimore run loaded 25,000+ buildings, exercised walking and driving, switched Ocean → Earth → Space, and returned to Main Menu with no JavaScript page exceptions. First playable was 80.5 seconds; walking samples were about 44 FPS, driving about 39 FPS, and Ocean/Space about 60 FPS. Those are observations, not a matched before/after comparison. Walking encountered a building after 8.9 world units; driving covered 154.1 units. Screenshots were inspected and led to the overlay repair above.

The portable-data visual proof renders 139 building identities, 59 roads and 308 projected marking triangles with finite terrain. It is diagnostic geometry, not replacement game artwork.

### Acceptance

- Strict boundary type command passed, including eight negative contract examples.
- Five local refactor regression tests passed. Related road/profile/bridge/tunnel and projection golden-output checks passed.
- Source syntax, imports, entry graphs and existing authority checks passed.
- Prescribed browser-client checks passed for the portable rendered geometry and committed/rejected overlay transitions; screenshots inspected.
- Follow-up normal-clock Ocean → Earth → Space → Main Menu journey passed with no page exceptions. Active renderer owners were Ocean, main and Space respectively; menu owner was null. Screenshots inspected. Temporary verification credentials were revoked after each completed journey.

The delivered candidate is local and staging-configured. Production and GitHub are unchanged. Mobile performance, broad destination coverage and whole-load before/after gains are not established by these checks. The larger compiler Worker migration and complete transitive coupling review remain deferred research, not completed work.
