# Earth loading audit — September 27, 2026

Local branch: `steven/architecture-evaluation`. These changes are not deployed. Timings below come from hardware-accelerated Chrome on the physical M1 Mac, with live provider requests. They are observations, not a cold-load percentile or a production-readiness certificate.

## Why loading is slow

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

## Verification

- Road/sidewalk/frontage/terrain checks: 180 passed after the source-edge change, including exact straight-road footprint, turn equivalence and retained narrowing/transition checks.
- Furniture checks include junction clearance, obstacle rejection, occupancy reservation, coordinate scale, cell boundaries, broad structures and width peaks between samples.
- Physical Chrome journeys on the source-edge, acquisition-overlap and indexed-furniture builds completed walking, driving, a short controlled flight and return to Main Menu. All retained 18,759 roads and 25,507 buildings; no browser errors or failed local resources were recorded. Screenshots were inspected. The final run also reported 240/240 regional context tiles, 16/16 water tiles, no missing elevation tiles and no unowned terrain cells. The existing aerial ring retained 141,554 generalized buildings in addition to the detailed district; those are separate counts.
- Final runtime candidate `b9d07ab0` passed 1,427 component checks (zero failures/skips) and the prescribed packaged-Moon movement/pause/title-auth check. Its screenshots were inspected. Earlier acquisition-overlap evidence contained 1,425 checks; the extra two cover the structure index and variable-width bounds.

Local machine-readable evidence is under `output/architecture-evaluation/loading-source-edges/`, `loading-overlap/`, `loading-indexed/`, and `output/verification/`. Consult each report's candidate identity. These paths are local evidence, not shipped application assets.

## Remaining architecture work

The current full-region gate is still the dominant limitation. A substantial reduction requires separate readiness contracts for the player's collision-safe neighborhood, visible regional context and detailed distant geometry. Those products must share source identity, coordinates, terrain revisions and cancellation; completed regions must publish atomically, with fast travel waiting for the destination's required products. Distant work can then be scheduled by actual need without dropping it.

Before implementing that change, capture near/distant construction costs and provider dependencies separately. Do not replace the current gate with a radius reduction or a timer. Verify ground/bridge/tunnel seams, flight across publication boundaries, immediate travel, cancellation and world release. Worker transfer or a Rust port alone does not remove redundant work or shorten the total CPU dependency chain. Persistent compiled caches also require complete source/terrain/compiler revision keys and bounded eviction before they are safe.

These loading measurements do not close the existing frame-rate/shader-program budget failures or constitute multiplayer/release certification. Live time/weather differed between runs, so their gameplay FPS is not used to claim a rendering improvement.
