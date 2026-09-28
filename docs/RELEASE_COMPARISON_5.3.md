# What changed for 5.3

This comparison uses both the last published GitHub release,
**A World Worth Making Your Own** (`v5.2.0-world-update`), and the source of the
previously deployed 5.2 game (`db62593`). The live source includes camera and
building corrections made after that release; those are not counted as new
5.3 features.

The comparison covers code, assets, backend handlers, indexes and verification
changes. Test fixtures and documentation account for part of the repository
difference; changed-file and test counts are not feature counts.

| Area | Last released baseline | 5.3 release | Remaining limits |
| --- | --- | --- | --- |
| Ship layout | Three-deck Solis Reach with fixed room arrangements | Circular circulation, shared room/door/collision layout, 25 rooms and controlled pod departure | Some utility fittings still use simpler custom geometry |
| Research | Sample collection, cargo and analysis actions | Physical bench placement, spectral/thermal measurements and fabrication through the existing inventory | Experiment and recipe variety is limited |
| Shared expeditions | Shared voyage state | Authoritative research mutations, conserved materials and rejection of stale revisions | Frontend and compatible research handler are deployed |
| Space information | Solar-System inspection and destination travel | Selection and information beyond the Solar System, supported star travel and observer-dependent sky | Catalog coverage is bounded; distant surfaces are reconstructions |
| Space rendering | Existing planetary and destination scenes | Revised planet/moon imagery, gas-giant atmosphere detail, spatial galaxies and nebula line repairs | No claim of measured terrain on poorly observed worlds |
| Buildings | Mapped footprints and varied facades | Whole window bays, consistent floor margins and aligned near-distance detail | Incomplete mapped geometry still limits accuracy |
| Streets and water | Mapped roads, pavement and regional water | Connected sidewalks/crossings, terrain-aligned paving, roadside clearance and water overlap repair | Complex bridge/tunnel approaches need further review |
| Landscapes | Land-cover-driven ground | Regional imagery/elevation refinements and stronger rock, dry-ground, snow and ice treatment | Coverage and resolution vary by location |
| Photo contributions | Manual exterior contributions and review | Building-aligned room plans, interior photos, revisions, phone continuity and approved interior entry | Automatic reconstruction is not the public workflow |
| Rooms and controls | Multiplayer rooms and touch controls | Admission/presence/vehicle recovery, focus restoration and fewer competing prompts | Physical-phone review is still outstanding |
| Runtime cost | Existing batching and cleanup | More shared assets, static batching, spatial lookup/culling and fewer repeated updates | No universal FPS, loading-time or memory improvement is claimed |
| Account cleanup | Cleanup queries could silently skip failures | Required query indexes and failure reporting that preserves retryability | Deployment must retain required indexes and permissions |
| Verification | Mixed historical and current tests | Explicit source/component/browser/backend scopes, fixture provenance and artifact identities | Software rendering does not establish hardware performance |

## September 28 update relative to the already-live 5.3 game

The new runtime source is `2839df5d`, following deployed `bbe65022`.
The runtime/backend diff covers 70 files, with 1,806 insertions and 475 deletions;
additional repository changes include tests, scripts and architecture studies.
Those studies are not all runtime features.

The shipped changes reduce terrain-sampling allocation, index mapped-water
queries, overlap road compilation behind terrain readiness, size building
buffers in advance, reduce pavement-worker retention and bound lighting shader
variants. They also repair safe-ground recovery and server action cooldowns.
Mapped building, road and terrain coverage was preserved in matched checks.

In individual M1 dense-city measurements, first play improved from about
59 seconds to 48–50 seconds and the road-ready renderer footprint fell from
3,912 to 3,224 MiB. These are measured milestones, not universal budgets.
The formal desktop performance gate still fails ground FPS, transient heap
and aircraft activation. Repeated-session native memory and physical-phone
performance remain follow-up work.

## Evidence and interpretation

The exact candidate passed 56 functional/source/package/browser gates and all
13 isolated backend stages. A fresh weekly-city test joined two authenticated
clients to Chicago through the normal UI, loaded both worlds and checked shared
presence. Production integrity and authentication boundaries were verified
separately. Live browsing showed public rooms and the current weekly city;
a signed-in two-player production session was not performed.

[Published-release comparison](https://github.com/RRG314/WorldExplorer3D/compare/v5.2.0-world-update...2839df5d6bbed9f8dfa4b89e379ba2e026cab438)
· [Previous-live comparison](https://github.com/RRG314/WorldExplorer3D/compare/bbe6502228e369fe2a15dc6a177f5d83948584c3...2839df5d6bbed9f8dfa4b89e379ba2e026cab438)
· [Release status](RELEASE_INTEGRATION_STATUS.md)
