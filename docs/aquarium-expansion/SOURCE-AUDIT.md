# Aquarium integration audit

Updated October 13, 2026. Current working source: `steven/visual-quality` in the
architecture-evaluation worktree, confirmed by CURRENT-STATE.md. Initial museum checkpoint
`f86c16513b95`. This is an implementation ledger, not a release certification.

## October 13 continuation

The attached brief was read in a different, unrelated math checkout. Read-only
discovery found older Documents and Developer checkouts; CURRENT-STATE.md in
the newer worktree explicitly resolves current repository/branch authority.
No older checkout was edited. Existing uncommitted waterfront, exterior and
transport repairs were preserved; they are separate work with their own ledger.

Re-read the actual aquarium content, layout, construction, optics, runtime,
native panel and verifier alongside the existing interior expansion and reality
capture records. Admission remains in `building-entry.js` / `interiors.js`; shell
and collision remain in the shared compiler. Source IDs plus footprint plus
mapped door remain required. A partial tank configuration was already present,
so this continuation extends it rather than building another aquarium engine.

`aquarium-content.js` now contains a reusable habitat record with scientific
species identity, source IDs, geographic building, viewing floors, model IDs,
bounded game populations, placement/geometry confidence and Journal policy.
`aquarium-habitat.js` is a pure authoring/motion helper; it owns no renderer,
RAF, player state, assets or publication. `aquarium-runtime.js` remains the single
population/clock/disposal owner. Existing static `aquariumSwimPose` callers remain
compatible. The existing content record version advances while event IDs remain
stable, preserving saved observations.

Fresh public GitHub and OSM metadata is pinned in
[source-refresh evidence](evidence/2026-10-13-source-refresh.json). All five
candidate heads and the Pier 3/Pier 4 revisions match the earlier review. The
entrance node still has only `entrance=yes`; no main/member/exit role is implied.
No sufficiently licensed exact interior asset has been established.

Additional inspected owners: `world/featured-arrivals.js` and the existing
featured-landmark data retain discovery/search responsibility; a new duplicate
POI registry is unnecessary. `poi/semantic-authority.js` does not authorize
named-venue geometry. `assets/model-asset-runtime.js` retains bounded downloads,
rig clones, shared templates and explicit instance retirement. Native aquarium
UI reuses `screen-layout.js` and the existing gallery style tokens. Journal
events use `discovery/profile-store.js`; no wild Field Guide or mission reward
is issued. `functions/community-reality-capture.js` retains explicit property
permission, private access, review and publication gates. No Firebase rules,
cloud data, credentials or production package were changed by this continuation.

The table and findings below document the original audit; missing capabilities
there are superseded only by the implementation and current verification above
and in [VERIFICATION](VERIFICATION.md).

## Corrections to the supplied brief

`map.aquarium.org` belongs to the **Oregon Coast Aquarium**, confirmed by its
[own map page](https://aquarium.org/map/). It must never supply Baltimore geometry.
The [National Aquarium visitor guide](https://aqua.org/assets/documents/National-Aquarium-Guide-Map.pdf)
and [accessibility guide](https://aqua.org/assets/documents/National-Aquarium-Accessibility-Guide.pdf)
establish public circulation, not construction dimensions. The Matterport link
on the [virtual-tour page](https://aqua.org/explore/virtual-tour) is a viewer, not
permission to extract its mesh or imagery. No viewer extraction is authorized.

## Existing owners inspected

| Responsibility | Existing implementation | Reuse or concrete gap |
|---|---|---|
| Geographic identity and exterior doors | `building-entry.js`, mapped building provenance | Preserve source IDs and footprint matching. Aquarium relation/parts require a reviewed composition; proximity or a same-name ticket kiosk cannot authorize entry. |
| Admitted interior selection | `interiors.js`, `interiors/runtime.js`, `content-resolver.js` | Preserve captures, private access and mapped-room precedence. Gallery resolver presently fits only representative museum rooms. |
| Metric shell, collision, stairs | `functions/interior-layout.mjs`, `interiors/authored-geometry.js`, `scene-builder.js` | One compiler already generates visible walls, doors, floor cuts and ramp collision. No second collision scene. Missing explicit glass/open balustrade boundaries and floor-spanning habitat voids. |
| Floor movement | `floor-model.js`, `elevator-authority.js`, `vertical-boundary.js`, `runtime.js` | Repaired interaction/surface fallback to use actual authored elevations. Existing elevator route still rebuilds generated floors and cannot safely stand in for authored aquarium circulation; implement that separately before multi-floor publication. |
| Museum content and reading UI | `content-contract.js`, `gallery-runtime.js`, `gallery-ui.js` | Reuse admission, asset leases, pause, native dialog and Journal. Single-floor map, sculpture rotation and specimen plinth assumptions must become content capabilities, not duplicated aquarium UI. |
| Marine visuals | `ocean/fish-visual.js`, `cetacean-life.js`, model asset runtime | Existing licensed rig/animation and bounded leases are reusable. Ocean habitat coordinates, depth admission and fishing population must not be repurposed as tank occupancy. |
| Habitat/world ownership | `ocean/habitat.js`, `habitat-plan.js`, `fish-life.js`, `fishing/population-authority.js` | Tank volumes are local authored geometry, not oceans. One aquarium habitat instance must serve all its viewing floors. Do not start ocean mode inside a building. |
| Learning and saves | `discoveryProfileStore`, gallery Journal events | Stable educational study events, not wild sightings or repeated mission/currency rewards. Existing export/reload and failure preservation apply. |
| Model preparation | `model-asset-catalog.js`, `model-asset-runtime.js`, `bounded-model-download.js`, offline importers | Local, versioned GLBs with independent asset rights, hashes, budgets, orientation and original author credit. No live Sketchfab dependency. |
| Real captures and permissions | `reality-capture/*`, `functions/community-reality-capture.js` | Preserve the existing representation/admission authority. Public aquarium facts do not make a capture public; no new Firebase publication shortcut. |

## Current verification findings

The previous museum source run passed 65 checks and 2,486 component tests.
The first immutable museum attempt failed locating its entry through a newly
changed test helper; it is not a museum pass. The helper assumed a nearest-eight result/top-level bounds; it now uses the public
entry resolver and the corrected mutable-source journey passes 30 checks. This
does not reclassify the prior immutable failure as a pass. The current ocean diagnostic also exceeds
its existing texture/geometry budgets. Neither failure is waived for aquarium work.

## Product details missing from the prompt, now required

1. A full visit has arrival, orientation, recognizable public circulation, a
   coherent observation task, saved learning and an obvious return route.
2. Every room has a finish schedule: floor, skirting, wall, ceiling, structural
   trim, luminaires, signs, doors, railings and relevant furniture. Bare boxes
   cannot pass visual acceptance merely because three buttons work.
3. Each door and vertical connection identifies its actual destination; an
   unavailable wing never leads into an empty procedural copy.
4. Habitats have containment, species scale, swim clearance, pause behavior,
   viewing glass and local water optics. Animal count is a game population,
   never a claim about the institution's current collection.
5. Readable paths and labels remain available in dark galleries. Avoid glare,
   opaque glass, camera collisions, rapid stair bob and fullscreen text overlays.
6. Public amenities serve orientation and believable space. No fake ticket
   purchase, real donation transaction, institutional endorsement or staff access.
7. Every interactable has a successful action, empty/failure state, retry/cancel
   behavior and persisted-result policy. Decorative props are not misleading buttons.
8. Evidence and readiness are per room/asset/interaction, with museum and aquarium
   held to the same standard. A playable section does not certify the entire venue.
9. Institutional review, access requests and sponsorship intentions belong in
   project records only. The game presents exploration, learning and source credits.
10. Museums and aquariums must retain separate architectural profiles, materials,
    content and activities. Reuse technical owners, never the same building or
    the same room layout with different props. This is an explicit owner requirement.

## Sequence

Pin public evidence and geometry → acquire/review lawful assets → extend shared
layout/content capabilities → build the entrance-to-reef route → verify movement,
visuals, recovery and budgets → expand only through equally complete rooms → run
whole-release compatibility. Preserve the museum checkpoint and current production.
