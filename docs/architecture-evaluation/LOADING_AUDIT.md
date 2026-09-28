# Earth loading audit — September 27, 2026

Local branch: `steven/architecture-evaluation`. These changes are not deployed. Timings below come from hardware-accelerated Chrome on the physical M1 Mac, with live provider requests. They are observations, not a cold-load percentile or a production-readiness certificate.

## Original bottlenecks

The main cost is constructing the world, rather than opening the application. The measured document/runtime startup took about 1.5–2.3 seconds in the initial comparisons. Gameplay then waited for a fixed 14 km regional world containing 18,759 roads and 25,507 buildings.

1. **Regional publication is one blocking transaction.** Terrain, source normalization, road/building construction, terrain grading, transport meshes, contact indexes and gameplay publication all finish before entry. A distant region can therefore delay a player starting on foot. Simply removing the readiness checks would allow unsupported roads and incomplete collision data.
2. **Transport construction repeats geometry work.** Straight source road edges were subdivided every 32 world units, unioned, triangulated, then partitioned again against terrain. Constant-width cuts supplied no additional road shape or terrain information. The previous pipeline also repeated height queries and turn polygons; earlier local repairs addressed those separately.
3. **Independent building downloads started late.** Building source acquisition followed road, land-use and furniture construction even though those steps did not supply its request parameters. Publication must remain ordered; acquisition need not.
4. **Furniture placement scanned unrelated structures.** Every proposed fixture checked all bridge/tunnel segments. A cell index can reject unrelated structures before exact projection and clearance checks.
5. **Provider and terrain latency remain variable.** The optional exact Overpass supplement consumed about nine seconds before failure in these runs. Regional terrain added a separate 10.2-second wait in one run and no remaining wait in others. The exact supplement supplies real information when available; disabling it would change data coverage.

The phase named `fetchFixedRegionalContext` includes waiting elsewhere in the orchestration. Provider start/settle events are the appropriate evidence for the actual request duration. Do not add overlapping phase times together or attribute all elapsed time to the network.

## Implemented changes

- `284a2417`: constant-width straight road edges remain whole until tile/terrain partitioning. Original curve points, placement offsets, joins, variable-width transitions and building constraints remain. Rendering and sidewalk subtraction consume the same segments.
- `7456b7ce`: begin the existing Overture building request after settlement selection, overlapping terrain/road preparation. The existing publication pass consumes that single request. Metadata, fallback policy, provider accounting and cancellation remain with their existing owners. Rejection is observed immediately, including on superseded loads.
- `b9d07ab0`: index bridge/tunnel exclusion envelopes for furniture placement, retaining exact clearance checks and a bounded-index fallback for exceptionally broad segments. Index bounds now include the source width so an interior wide section cannot fall outside the index when endpoint/midpoint samples happen to be narrow.

No road/building budgets, region radius, source priorities, resolution or feature switches were reduced.

## Measurements and limitations

| Artifact | First playable | Carriageway compilation | All transport compilation | Extra regional ground wait |
| --- | ---: | ---: | ---: | ---: |
| `ada8e51e`, preceding accepted local build | 71.492 s | 15.599 s | 34.695 s | 0 s |
| `284a2417`, source-edge change | 79.582 s | 12.478 s | 31.779 s | 10.235 s |
| `7456b7ce`, building acquisition overlap | 68.112 s | 12.373 s | 31.313 s | 0 s |
| `b9d07ab0`, indexed structure exclusions | 64.451 s | 11.739 s | 29.900 s | 0 s |

In the final physical-city run, furniture construction fell from 3.312 seconds to 0.297 seconds. The complete load was 7.041 seconds (9.8%) faster than the preceding accepted build. Live-provider samples vary; this is not a guaranteed percentile improvement.

The slower intermediate total is retained deliberately: a faster compiler does not guarantee a faster live-provider load. Building acquisition started earlier in the overlap run, but its completion callback also depended on main-thread availability; no isolated two-second acquisition saving is claimed.

The captured-centerline replay reduced road triangles from 2,800,534 to 2,111,108 and mesh compilation from 12.058 to 8.508 seconds. This replay did not capture resolved building-width profiles and used a synthetic height function: it is component evidence, not exact whole-city geometry parity. Coverage-area difference was approximately 0.53 parts per million due to the changed clipping subdivision; no bitwise-identity claim is made.

A separate seeded furniture comparison covered 6,000 road segments, including 1,500 structure segments, and 800 placement/reservation queries. Placements were identical; query time changed from 598 to 35 ms, with index construction increasing from 11.3 to 12.5 ms. This is not an application loading-time measurement.

Larger road construction tiles were rejected: 256- and 512-unit tiles produced more terrain-partition triangles and took longer than 128-unit tiles. The compiler tile size is unchanged.

## Verification before staged publication

- Road/sidewalk/frontage/terrain checks: 180 passed after the source-edge change, including exact straight-road footprint, turn equivalence and retained narrowing/transition checks.
- Furniture checks include junction clearance, obstacle rejection, occupancy reservation, coordinate scale, cell boundaries, broad structures and width peaks between samples.
- Physical Chrome journeys on the source-edge, acquisition-overlap and indexed-furniture builds completed walking, driving, a short controlled flight and return to Main Menu. All retained 18,759 roads and 25,507 buildings; no browser errors or failed local resources were recorded. Screenshots were inspected. The final run also reported 240/240 regional context tiles, 16/16 water tiles, no missing elevation tiles and no unowned terrain cells. The existing aerial ring retained 141,554 generalized buildings in addition to the detailed district; those are separate counts.
- Final runtime candidate `b9d07ab0` passed 1,427 component checks (zero failures/skips) and the prescribed packaged-Moon movement/pause/title-auth check. Its screenshots were inspected. Earlier acquisition-overlap evidence contained 1,425 checks; the extra two cover the structure index and variable-width bounds.

Local machine-readable evidence is under `output/architecture-evaluation/loading-source-edges/`, `loading-overlap/`, `loading-indexed/`, and `output/verification/`. Consult each report's candidate identity. These paths are local evidence, not shipped application assets.

## Staged road publication implemented

The road-detail gate is now split. The starting neighborhood receives exact road geometry and contact data before entry. Complete terrain grading, bridges, tunnels, buildings and source coverage still publish initially. A worker then builds the remaining at-grade road regions, prioritized around the actor. The compiler still uses the same 128-unit cells; 1,024-unit regions are publication units, not a change in source resolution.

Distant roads remain visible through a terrain coverage layer until their exact geometry, contact index and markings commit together. Ground travel waits at an unfinished region; boats and aircraft safely above the terrain do not wait for road detail. Cancellation terminates the worker and rejects stale publication. Once all regions finish, the temporary coverage layer stops sampling without recompiling shaders.

Local implementation commits: `d98bd053`, `0fa99e48`, `8b5c0161`. The first prototype failed because the renderer rejected transferred typed arrays. A real renderer/contact test caught and now covers that boundary. A later comparison exposed additional rendering cost from the temporary coverage layer remaining enabled; it is disabled after completion. Neither failed prototype is treated as accepted evidence.

### Physical-browser comparison

The same Baltimore route and live providers were checked in hardware-accelerated Chrome on the M1, under night conditions. These are individual observations, not statistically established percentiles.

| Measure | Previous build `b9d07ab0` | Staged build `8b5c0161` |
| --- | ---: | ---: |
| First playable | 64.382 s | 56.339 s |
| Initial transport construction | 30.781 s | 21.687 s |
| Initial carriageway construction | 11.609 s | 6.368 s |
| Stationary walking during initial observation | 44.4 FPS | 39.5 FPS |
| Stationary driving | 41.7 FPS | 41.3 FPS |
| Moving driving | 42.7 FPS | 42.3 FPS |
| Controlled flight | 36.5 FPS | 36.8 FPS |

Entry improved by 8.043 seconds (12.5%) in this comparison. All 555 regions completed around 72.35 seconds from navigation, approximately 16 seconds after entry. Background work has a temporary cost: walking averaged lower FPS during refinement, with a worst sampled frame of 183 ms. Completed-world driving and flight were in the prior build's range; no general frame-rate improvement is claimed. Regional ownership also produces more render batches (1,134 road/marking/skirt meshes versus 777 previously).

The completed city retained 18,759 roads and 25,507 detailed buildings. All 11,246 at-grade junction checks found published contact within the compiler's rounding tolerance; there were zero coverage gaps, invalid triangles or downward-facing triangles. All 260 sampled worker heights matched the main terrain authority exactly. Fixture-level staged versus full compilation has an identical canonical triangle hash, including region-boundary contacts. The fixture is not a whole-city bitwise comparison.

Walking, driving, a controlled flight beyond the initial exact neighborhood, full regional completion and Main Menu return passed without browser or local-resource errors. Gameplay screenshots were inspected. Evidence: `output/architecture-evaluation/loading-staged-coverage/report.json`; same-night comparison: `loading-staged-night-baseline/report.json`. The preceding repaired run entered in 59.582 seconds, illustrating live-load variation.

The current component suite passed 1,435 checks with no failures or skips, including worker preparation cancellation, cancellation during asynchronous publication, contact readiness, transferred geometry and independent terrain shader layers. Component checks do not establish browser or service behavior.

A separate real-browser cancellation run returned to Main Menu while 470 regions were pending. After three seconds, the detail controller, preparation callback, roads, road meshes and readiness notice were all absent; no stale publication or browser/resource error was recorded. That run entered in 54.672 seconds. Evidence: `output/architecture-evaluation/loading-staged-cancel/report.json`.

The prescribed packaged-Moon controls, pause/resume and title-auth smoke check also passed on `8b5c0161`; its gameplay screenshot was inspected. This is separate from Earth performance and does not certify the full app.

### Limits

This completes the staged road-detail portion of the loading plan. Initial terrain/structure preparation, building construction and variable provider waits still cost time. The optional Overpass supplement took about nine seconds in these runs; it remains enabled to preserve available data. This is not an instant-loading architecture, an all-location guarantee, or completion of the separate rendering and production-release gates. Physical-phone acceptance and the existing FPS/program budgets remain open. Nothing was pushed or deployed.


## Memory follow-up

See [Memory and loading measurements](MEMORY_AND_LOADING.md) for shared vegetation geometry, compact traversal storage and verified old-world cleanup. The additional unprofiled Baltimore entry was 55.545 s; the major measured gain in this pass is memory, not a substantial further load-time reduction.
