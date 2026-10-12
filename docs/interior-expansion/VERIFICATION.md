# Museum verification

October 12, 2026; local mutable source in the architecture-evaluation worktree.
No production publication or immutable-candidate certification is claimed.

## Component evidence

`node --test tests/museum-content-current.test.mjs tests/interior-layout-current.test.mjs`:
**22 passed** (11 museum checks and 11 existing layout checks). Covers:

- Stable mapped identity plus bidirectional footprint comparison; wrong wing,
  unsupported building part, uncertain rights and capture/access precedence.
- Connected entrance hall and two galleries inside the actual concave outline;
  equivalent entry/room relationships under rotation; tiny/low buildings reject.
- Pinned original/output bytes, local static GLBs, two source ingestion paths,
  no arbitrary embedded URLs, input/output/triangle/texture limits.
- Bounded runtime downloads including malformed, oversized and stalled responses.
- Late model completion after departure, failed loading/retry, idempotent Journal
  identity and save projections that cannot award money or field observations.
- Instanced architectural finishes leave body-height door passages clear.
  Gallery-only texture cleanup also handles late image completion.
- Indoor lighting restores prior outdoor visibility while retaining current
  sky intensity/color; it does not restore stale time-of-day settings.
- The sealed gallery excludes outdoor layers and restores the exact previous
  camera mask, without changing outdoor mesh visibility or collision.

The wider earlier focused batch passed 57 tests, including Backpack migration,
curated assets and environmental provider lease behavior. Those are different
boundaries from this museum walkthrough.

## Actual-game evidence

`output/interior-expansion/finished-gallery/report.json`: **18 passed**, no page
errors. Enters the actual Overture Peale building through its published inferred
entrance using normal DOM controls and the existing fixed-step runtime. Walks
both galleries, reads/turns three licensed displays, saves Journal entries,
opens desktop/390×844/844×390 maps, returns to the exact saved exterior pose and
reenters twice. The prescribed game-action client runs within the same owned
browser. Screenshots of entry, all three displays and both map sizes inspected.

`output/interior-expansion/gallery-resilience/report.json`: the extended journey
also deliberately fails the coral request once, uses the displayed retry button,
then completes the same visit. Final extended run: **26 passed**, zero page/GPU
errors; two reentries each retain 48 unique gallery geometries, three leased
furniture instances and three local lights. All museum leases are zero on final
exit. Phone exhibit inspection keeps the actual object visible above the panel.
The final extension also passes running/jumping and same-floor landing on both
reentries, final HUD suppression and explicit GPU console collection. Its
desktop, portrait and landscape screenshots were inspected.

These are controlled keyboard/timing tests in desktop Chrome. Phone viewports
are not a real Android/iPhone test; short stable resource counts are not a
sustained memory or frame-time budget certification. The gallery’s three lights
include two bounded 512-pixel spotlight shadow maps.

## Measured entry and frames

`node scripts/verification/attested-source-check.mjs scripts/verification/museum-current.mjs --performance --faults --reload`
passed **65 checks** in the combined source run. In addition to the missing-asset
retry and two reentries, all three Journal notes survived a complete page reload,
and entry/exit restored the outside camera and lighting. Zero page/GPU errors.
The subsequent verifier now uses the shipped entry list and public model-cache
snapshot so it can validate bundled artifacts without importing private source.

Physical M1/8 GiB Mac mini; installed Chrome with the verified Apple M1 renderer;
1280×800; three 10-second real-RAF turning windows with ordinary keyboard events.
No fixed-step timing or heap cap inside these windows. Browser-input response is
not physical keyboard/touch latency. Cold means a fresh browser page, not a
power-cycled GPU driver. Existing budgets were retained.

| Entry | Key to controllable frame | Exhibits/furniture settled | Average FPS | p99 frame | Worst frame |
| --- | ---: | ---: | ---: | ---: | ---: |
| First | 171 ms | 1,174 ms | 59.5 | 16.8 ms | 99.9 ms |
| Repeat 1 | 119 ms | 223 ms | 60.0 | 16.8 ms | 16.8 ms |
| Repeat 2 | 114 ms | 233 ms | 59.9 | 16.8 ms | 33.3 ms |

Those windows pass the existing activation, frame/hitch, heap, draw/triangle,
program and geometry/texture limits. They do not certify sustained city travel.
Measured input-to-simulation samples: 5.8–33.4 ms. Uncollected whole-page heap:
644/663/675 MB; two gallery cycles retain identical local geometry/furniture/light
counts and release all museum leases. Heap growth is not a measured GPU-VRAM
estimate or a proof of indefinite flat memory. Resource bytes and long tasks
(including entry/upload work outside the frame windows) are retained in
`output/interior-expansion/gallery-performance/report.json`.

The initial measurement failed: first entry took 4.7 seconds and the renderer
drew 4.5 million outside-city triangles against new indoor lights. The sealed
gallery's camera layer now isolates those render passes without unloading the
city or changing its culling owner. The profiled repair identifies shader and
texture work rather than a blocked network lookup. Old failed receipts are kept
alongside the passing receipt. Final screenshots were inspected.

## Diagnosed failures retained

The first entry fixture targeted an inner building anchor rather than the
published exterior approach. A later route targeted a room center now occupied
by a real enlarged plinth; the route was corrected around the obstacle, leaving
collision intact. The prescribed-client selector initially also matched the
minimap canvas; it now explicitly excludes that canvas.

A genuine exit defect reused the cached interior ground sample after restoring
the exterior actor. Clearing that contact cache on entry/exit fixed the height
shift; the actual exit comparison now matches the owner’s saved outside pose.
Native panel HUD suppression initially missed initialization of the common
screen-layout service; the museum now initializes that existing singleton.

## Release boundary

Runtime dependency and state-ownership checks pass after explicit review of the
new development dependencies and the gallery's use of the shared layout owner.
The four previously missing prepared public marine images are now present and
their build identity is recorded. The full source chain passes, including **2,486
component tests** and source/dependency/ownership/type/name/inventory/sensitivity
checks. The corrected fish journey passes 12 checks after observing one population
replacement and then eight swimming fish of stable identity. The older diagnostic release sweep passed 80/93 gates; its
remaining failures, whole-release performance, new immutable package, rollback,
backend promotion, ordinary hosted acceptance and physical-device gaps remain
in `docs/release-review/2026-10-12/READINESS.md`. Museum passage alone does not
resolve those release requirements.
