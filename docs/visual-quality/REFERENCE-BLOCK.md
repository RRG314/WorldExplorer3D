# Reference block — completed local visual pass

Owner request: make one finished, representative street block using the current game, then use its reusable construction rules as the quality standard. Preserve progress locally; no push or deployment.

Baseline: `5b34dcfb32eceff77725118ff7537333d889fe78` (runtime `e7fd1f59`). Existing saved builds and player data remain intact. This work supersedes neither their acceptance receipts nor the external release requirements.

## Finite acceptance

1. Real street surfaces and continuous, legible frontage: inspect actual Baltimore paving, intersections, entrances and street furniture. Correct demonstrated presentation defects within the existing ground/road owners.
2. Reusable close architecture: fitted ground-floor surrounds, convincing window depth and surface response, cohesive trim/canopies and purposeful detail. No invented mapped businesses or new door/collision authority.
3. Playable visual acceptance: actual world day/night/weather captures, walking, driving, entry/exit, phone viewport and bounded frame/resource checks. Component images aid iteration but cannot substitute for the integrated world.

Completion requires inspected images showing a visible improvement and passing relevant behavior checks. A count of modules or a passing source test alone is insufficient. Any remaining limitation must be recorded explicitly.

## Evidence

- Baseline storefront component: prescribed skill client completed; image inspected. Repetitive blue/gray windows, no apparent interior depth, thin fascia and a plain pavement edge.
- The runtime already has asphalt textures and an environment map. Check the live published material path before changing either; adding duplicate rendering owners is unnecessary.

## Implementation

The shared façade renderer now gives windows view-dependent room depth, recessed frames, varied blinds and retail shelving. Glass has a separate roughness response; wall grain affects the normal without another texture fetch. Near and merged-mid rendering share the opening layout, color space, room variation and nighttime illumination. One uniform, updated by the existing night-lighting owner, controls the window lighting; it adds no light objects or draw calls.

Nearby exteriors receive fitted sills/lintels, ground-level stone courses, door surrounds, deeper shop bays and pitched awnings. Existing mapped names remain the only source of commercial sign text. No new entrance or interaction authority was introduced.

The authored Calvert Street block adds five slatted benches, five planted containers and three seating lights. Full-footprint pavement checks, road-contact exclusion, entrance clearance and the existing collision query constrain placement. Its four instanced furniture batches and three lamp heads reuse existing resource, vegetation and fixed-light-pool ownership. These are game decorations, not surveyed Baltimore street furniture. Asphalt and paving have finer, restrained surface detail. The shorter seating lights use 18% of the tall-road-light output, avoiding the initially overexposed paving.

The actual driving review reproduced clustered pauses. CPU samples attributed much of the stalled time to garbage collection. Allocation sampling then exposed repeated exhaustive shop-to-building searches across the entire city. Commerce now uses the existing indexed batch association once per supplied building snapshot, preserving exact building/door choices and existing associations. A regression compares its result to exhaustive association, bounds footprint reads and verifies that a removed building does not survive the next publication. No cross-world cache or gameplay-policy change was introduced.

## Verification ledger

- Prescribed web-game client: storefront component action bursts and screenshots inspected repeatedly, including correction of the sign/fascia overlap. The before/after component uses identical geometry, camera and lighting. It is not the assembled world.
- Actual source world: Calvert Street, Light Street and harbor views inspected. All five planted trees appear after correcting the planter's self-collision exclusion. Day/night/rain and phone-viewport captures are retained.
- Actual near/merged-mid shaders: four building cases compile, remain within eight vertex attributes, match their window colors by day and night, and return to the same daylight pixels. Window illumination adds zero draw calls.
- Focused behavior: 52 façade/pavement/vegetation/reference checks passed, followed by 35 lighting/publication/reference checks.
- First broad PR run exposed test adapters assuming exactly one lighting import and 128-pixel canvas data. The adapters now represent the module dependencies and requested canvas dimensions correctly. Assertions were retained; a day/night/planet uniform regression was added.
- First integrated entrance/exit run entered the real building but the exit setup used an absent `floorY` field. The test now uses the authoritative `floorBaseY`; no interior gameplay code was changed for that test failure.
- Full final PR command `npm run verify:pr`: exit 0, **1,913 tests passed, zero failed**, including source, ownership, dependency, boundary-type, inventory and test-sensitivity checks. The later verifier-only route correction does not change runtime or contract-test behavior.
- The first post-allocation-repair sample had no frames over 100 ms, but its screenshot exposed the test driver's extrapolated route crossing a landscaped island. The final verifier follows the actual South Calvert Street polyline and asserts road contact for every sampled driving position. No road geometry was changed to accommodate the test.
- **Final source journey**: `output/verification/reference-block/final-carriageway/report.json`, `ok: true`, no page/shader errors. Actual keyboard entry into the mapped Capital One building and exit succeed; all ten fixtures, three lamps, thirteen colliders and five planted trees remain present. Fixture collision and the clear walking lane pass.

| Final 30-second sample | Average FPS | p99 | Worst frame | Frames >100 ms | Distance |
| --- | ---: | ---: | ---: | ---: | ---: |
| Walking | 46.24 | 33.4 ms | 33.5 ms | 0 | 73.8 world units |
| Driving | 43.72 | 33.4 ms | 33.5 ms | 0 | 130.5 world units |

All 263 driving samples have mapped road support. Existing FPS and hitch budgets were not relaxed. Input is ordinary keyboard control during the measured windows; inspection teleports are setup only. The short samples verify this block, not indefinite stall freedom or performance in every mode. Instrumented CPU/heap runs remain diagnostic evidence and are not counted as acceptance.

Evidence is preserved under `output/verification/reference-block/`: failed `acceptance-final`, instrumented `stall-diagnostic` / `allocation-diagnostic`, post-repair `allocation-repair`, and the final `final-carriageway`. The shader report is `output/verification/building-facade-shaders/report.json`. The prescribed client images/state are in `output/verification/product-plan/storefront-street-client/`.

Separate close-view inspection in `furniture-inspection/` shows the real bench, paving contact, door clearance, planting and the lower-output seating light from a fixed pose in day/night/rain mode. All three images were opened and inspected; no page/shader errors occurred. This capture-only run is not another performance test. Across the three final integrated views the observed maxima were 1,077 draw calls, 3,339,102 triangles, 67 shader programs, 2,173 geometries and 220 textures, below the existing desktop limits. These snapshots are not a sustained retention test.

Quick image references (local artifacts):

- [Actual block by day](../../output/verification/reference-block/final-carriageway/calvert-block.png)
- [Actual bench and frontage](../../output/verification/reference-block/furniture-inspection/furniture-day.png)
- [Same bench and frontage at night](../../output/verification/reference-block/furniture-inspection/furniture-night.png)
- [Actual verified driving](../../output/verification/reference-block/final-carriageway/drive-after.png)
- [Before: controlled storefront fixture](../../output/verification/reference-block/before/component.png)
- [After: same controlled fixture](../../output/verification/product-plan/storefront-street-client/shot-1.png)

The exact accepted runtime fingerprint is `18e135ddd85176e816031e5a42c5bc598ff67ec97fcb656daf28923710d07524`. The runtime remained unchanged across the final PR, client and corrected integrated checks. Logs and images are local evidence, not shipped game content.

## Scope and remaining quality work

This pass improves the shared street-level visual construction and one actual block. It does not replace all Earth buildings with artist-authored meshes, reskin the NPC family, redesign generated interiors, or revise the ocean/space scenes. Broad city composition and reference-grade art still require further location/asset work. Existing street widths, terrain, intersections and crossing evidence remain authoritative; unverified real-world road classifications were not rewritten to make screenshots more attractive.

This is local source verification. The preserved architecture candidate and its receipts remain intact; they do not automatically certify these new visual changes for production. No deployment or player-data migration is part of this pass.
