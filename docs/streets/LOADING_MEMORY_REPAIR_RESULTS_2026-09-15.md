# Loading and memory repair results

15 September 2026. Local street-system branch only. **Partial repair; overall performance remains unacceptable.** No production deployment or research changes.

## Implemented

- Replaced one collision bucket array per spatial cell with one contiguous typed buffer. Source triangle order, contact heights, terrain-layer selection and clipping remain unchanged in the regression cases. Source geometry is retained, not removed to lower counts.
- Made the initial terrain-support index and final road-contact construction cooperative and cancellable. A superseded build disposes staged resources and cannot publish partial roads.
- Removed typed-array-to-ordinary-array conversions for carriageway tiles. Released road construction arrays after independent render buffers exist, before building the final contact index. Publication vertex and triangle counts are preserved separately.
- Added a tolerance-aware early rejection for terrain supports that cannot overlap a projected triangle, avoiding unnecessary clipping and intermediate objects.
- Exposed the already recorded per-system gameplay startup timings in the visible performance report.

## Verification

Final sequential CPU command: `node scripts/verification/streets.mjs`, log `/tmp/memory-repair-regression.log`: **259 tests passed**, six hill fixtures passed, and three pinned regional layout replays plus the source gate passed. These are not whole-city visual certification.

Projection output hashes match the pre-change algorithm for sampled captured San Francisco and Monaco road triangles. An additional isolated comparison of 20,000 seeded cases over small/large triangles and distant coordinates found identical output. Negative-coordinate contacts, stacked surfaces, terrain modes, disposal, cancellation and a 10,000-cell layout are covered by targeted tests.

A sequential isolated Node comparison with 150,000 disjoint spatial cells and forced GC measured:

| Component measurement | Prior buckets | Contiguous buckets |
| --- | ---: | ---: |
| Heap delta | 42.30 MB | 11.13 MB |
| ArrayBuffer delta | 4.20 MB | 5.40 MB |
| Construction time | 186.6 ms | 161.1 ms |
| 150,000 point queries | 41.8 ms | 48.5 ms |
| Sum of returned heights | 450,000 | 450,000 |

This is approximately 30 MB less retained memory for that component workload. Timing is a single sample, with mixed query/build results, not an app-wide speed claim. It does not measure graphics memory or predict total browser savings.

## Actual application results

Only one owned world ran at a time; no test suite ran concurrently with it. Other user browser activity remained untouched and was consuming substantial CPU. That affects comparability but does not excuse the application's failing results.

**Monaco, after bucket/staging changes and before clipping optimization:** 104.171-second startup; 9,417 buildings; the same 143,626 local sidewalk triangles as the previous capture. Road/walk contact buckets each reported one allocation. Walking and rendered street/building content were inspected. Heap estimate 1.762 GB does not demonstrate an overall memory improvement. Evidence: [startup](audit-2026-09-13/monaco-compact-contact-startup.json), [street view](audit-2026-09-13/monaco-compact-contact-street.png).

**San Francisco, final code:** 197.132-second startup; 15,554 road records and 23,861 building records. Building, vegetation, land-use, urban-surface and linear-feature geometry byte totals matched the earlier saved capture. Local pavement still had 171,315 triangles. Road geometry differed by 448 bytes, so this is not a claim that all regional geometry is byte-identical. The previously recorded San Francisco run also predates frontage pruning and is not a controlled A/B reference for this turn alone.

Final SF startup heap estimate was 1.116 GB; subsequent flight estimate was 1.689 GB. The aircraft was confirmed airborne at x=-4674.78, y=141.52, z=754.14, speed 68.96, with the pavement coverage window advanced. The recent flight window had p95 83.3 ms, p99 150 ms and maximum 1,483.3 ms. **Flight performance failed.** Walking worked; the street view was inspected. Evidence: [startup](audit-2026-09-13/sf-compact-contact-startup.json), [flight](audit-2026-09-13/sf-compact-contact-flight.json), [street view](audit-2026-09-13/sf-compact-contact-street.png).

The SF trace showed temporary heap growth above 2.4 GB during road compilation, followed by a fall to roughly 1.1 GB while construction continued. That supports transient allocation pressure; it does not prove every retained-object lifetime is correct. Legacy browser heap readings are not isolated tab/process memory measurements.

Final SF transport construction took 67.89 seconds, including 39.08 seconds for carriageways and 2.62 seconds for road contacts. Gameplay startup included 10.96 seconds for Explorer and 2.61 seconds for Living World. First drawing took 3.55 seconds. These nested timings must not be double-counted.

## Remaining work

The principal architectural cost is still region-wide detailed construction and retention. These changes reduce waste without redesigning world content or height ownership. They do not implement bounded residency across roads, buildings, vegetation and collision, nor reconcile every unaccounted loading interval. That broader change requires shared cell ownership, staged publication and eviction, a coarse distant representation, travel-aware prefetch, and lifecycle verification. Reducing source/building coverage or merely hiding distant meshes is not an acceptable substitute.

Flight stalls remain in simulation, presentation and rendering. Per-system maxima identify where a stall was observed but do not distinguish every expensive calculation from garbage collection or host scheduling. Do not claim that collision buckets explain all stalls or that the latest code is faster overall.

All owned browser worlds were returned to Main Menu and closed. The existing local preview remains available on port 4192. No unknown helper or user browser process was killed. The complete loading/memory repair is not signed off.
