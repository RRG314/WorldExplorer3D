# What changed for 5.3

This comparison uses both the last published GitHub release,
**A World Worth Making Your Own** (`v5.2.0-world-update`), and the source of the
currently deployed 5.2 game (`db62593`). The live source includes camera and
building corrections made after that release; those are not counted as new
5.3 features.

The comparison covers code, assets, backend handlers, indexes and verification
changes. Test fixtures and documentation account for part of the repository
difference; changed-file and test counts are not feature counts.

| Area | Last released baseline | 5.3 candidate | Remaining limits |
| --- | --- | --- | --- |
| Ship layout | Three-deck Solis Reach with fixed room arrangements | Circular circulation, shared room/door/collision layout, 25 rooms and controlled pod departure | Some utility fittings still use simpler custom geometry |
| Research | Sample collection, cargo and analysis actions | Physical bench placement, spectral/thermal measurements and fabrication through the existing inventory | Experiment and recipe variety is limited |
| Shared expeditions | Shared voyage state | Authoritative research mutations, conserved materials and rejection of stale revisions | Latest research handler must accompany frontend promotion |
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

## Evidence and interpretation

The current component/source PR check passes after repairing two inconsistent
module imports. Recent browser checks exercised the 61 supported space
destinations, all 25 ship rooms, camera modes, star/course selection, specimen
research and pod departure. The shared-research check used two authenticated
players against isolated backend services. The final ship screenshots were
reviewed after the last geometry and furniture changes.

These are functional and visual results, not a new matched performance benchmark.
Phone responsiveness, sustained hardware performance and final production
promotion remain separate acceptance items.

[Published-release comparison](https://github.com/RRG314/WorldExplorer3D/compare/v5.2.0-world-update...steven/post-5.2-release-integration)
· [Live-source comparison](https://github.com/RRG314/WorldExplorer3D/compare/db62593ba377e276e5079c78238fa3a83e501c93...steven/post-5.2-release-integration)
· [Release status](RELEASE_INTEGRATION_STATUS.md)
