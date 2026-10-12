# Aquarium verification ledger

October 12, 2026. **Aquarium runtime not yet implemented or verified.**
Source inspection, downloaded public metadata and paper designs do not prove playability.

## Evidence obtained

- Read the owner brief and current source owners listed in SOURCE-AUDIT.md.
- Corrected the Oregon/Baltimore map mismatch against both institutions' pages.
- Inspected National Aquarium visitor/accessibility sources, including rendered
  Pavilion G, Blue Wonders 1 and M diagrams. Images remain local research only.
- Obtained OSM relation, constituent-way and entrance metadata through the public
  API; compound identity still needs an actual loaded-world correspondence test.
- Acquired two original animated CC BY candidate animals through ordinary Sketchfab
  downloads. Actual renderer review is recorded below; neither is shipped content.
- Checked repository revisions, dependency versions and available license text
  for all five supplied software candidates. None was installed or copied.

## Required runtime evidence

| Scenario | Expected observation | Evidence needed |
|---|---|---|
| Ordinary entry | Correct public door; wrong wing/ticket roof cannot receive aquarium | Full-game approach and interaction, source identities recorded |
| Complete route | All designed public spaces connected; level names match destination | Continuous keyboard walkthrough, touch route and map screenshots |
| Movement | No wall/tank penetration, floor fallthrough, stair bounce or stuck jump | Collision edge probes plus real controls/camera walkthrough |
| Habitats | One population per tank across all views, visible animation and species bounds | Same-instance tracking, active animation, full-body containment |
| Reading | Three real actions; no camera/player drift; compact consistent panel | Desktop, portrait/landscape and keyboard focus checks |
| Persistence | Stable study notes, no duplicate reward, preserved prior saves | Exit/reentry/full reload and failed-write recovery |
| Loading failure | Playable shell and exit; honest unavailable state and retry | 503, timeout, malformed model, exit while loading, late-result disposal |
| Residency | Active/adjacent rooms only; bounded live assets, no repeated-load slope | Five route cycles; leases, textures, geometry, heap and task counts |
| Performance | Existing desktop and mobile-proxy budgets unchanged | Real RAF samples on identified hardware, not fixed-step timing |
| Regression | Museums, captures/homes, ocean, buildings/roads/bridges/tunnels preserved | Focused source/browser checks and final release gates |

Record entry-to-playable, assets-ready, median/p95/p99/worst frame time, hitch count,
draws/triangles, texture and geometry source/resident bytes, live instance counts,
simulation milliseconds and transferred bytes. Label forced-failure and cold/warm
runs separately. Physical-phone heat, memory and background resume remain a
separate test requiring a real device. Browser viewport emulation does not pass it.

## Visual acceptance

Inspect arrival, lobby, each circulation junction, each floor transition, overlook,
underwater window and all study views. Reject bare walls/floors/ceilings, floor
seams, repetitive tiling at implausible scale, blank backs of signs, flat unlit
animals, obstructed glass, accidental black silhouettes, incomplete furniture,
camera clipping, low-quality substitute animals or unexplained dead ends.

Every delivered room must have actual source and screenshot references. A future
institutional presentation requires a coherent ordinary-player run of the same
build, not a separate staged renderer or screenshots hiding broken areas.

## Museum separation and shared floor correction — implemented locally

Museum content now declares `venueType: museum`. Resolver, mapped association,
fixtures and asset lifecycle reject aquarium/untyped content. Shared authored
floor sampling and interaction height use the actual floor elevation; generated
floors retain uniform spacing. Elevator choices use provided floor names.
Regression cases exercise cross-venue injection, unwanted asset/light/camera
side effects, unequal viewing levels, invalid levels and generated compatibility.
All 37 focused museum, authored-layout, floor, Earth and ship traversal component
checks pass. The full source browser museum regression passes 30 checks, including
failed-display retry, all exhibits, Journal reload, maps at both phone orientations,
run/jump, exact exterior return, two reentries and zero page/GPU errors. Screenshots
were inspected in `output/interior-expansion/venue-separation/`.
This is an architectural safeguard, not a finished aquarium scene.

## Acquired animal renderer review

`scripts/verification/aquarium-assets-current.mjs` passes both original pinned
Sketchfab models in the actual r128 GLTF loader. The prescribed game-client
choreography advances the authored animations and changes the visible poses;
no page/GPU errors were captured. Front/back/side/animated images were inspected.
This is isolated model evidence, not aquarium gameplay or physical-phone evidence.

The initial turtle capture was empty because the existing review fixture used
unskinned rest bounds: approximately 1 cm instead of the posed 1.36 m extent,
with a different center. Corrected the camera using sampled posed vertices and
r128's `boneTransform`, retaining original rig/animation data. The failed report
and image remain in the review folder. This prevents an incorrect asset rejection
and exposes the same normalization/frustum issue that the habitat integration
must handle. The 24 samples are not a formal maximum animation-envelope proof.

The turtle has detailed surface textures and a usable articulated silhouette.
The shark is visibly simpler, with painted gills and limited mouth detail. Its
animation works, but it is not approved as a close-up realism reference. Neither
model is registered or presented as shipped aquarium content. Output:
`output/aquarium-expansion/asset-review/`.

## Building publication and admission repair

The actual pinned provider input reproduces the loss of all three Pier 3 outline
components when only one triangular building part is present. A bounded polygon
difference now checks accepted child coverage before the existing suppression
authority may remove a parent. Tests cover missing/invalid/out-of-window parts,
overlap double-counting, gaps, complete unions and the real Baltimore fixture.
Entry and facade-door publication share the same exclusion/headroom authority.
Bridges, roofs and the thin fragment are rejected; real occupied wings and
existing photographed-home entry remain eligible. Input geometry is not mutated.

The complete source chain passes: 2,492 component tests across 465 files, no skips
or TODOs; dependency, syntax/import identity, ownership, boundary types, runtime
names, inventory and sensitivity checks pass. The final combined full-game
regression is tracked separately; this is not a whole-release pass.

The restored exterior diagnostic image was visually inspected. The three sections
are present, but they still use inferred heights and generic exterior finishes.
It is a geometry-recovery diagnostic, explicitly **not** an approved aquarium
reconstruction or promotional capture. Authored institutional architecture, glass
roof structure, public entrance, compound identity and habitat delivery remain open.

Final combined source browser run: **32 checks pass**, no page/GPU errors. The
ordinary museum journey covers entry, all exhibits, unavailable/retry, Journal
reload, phone maps, running/jumping, two reentries, exact exterior return and
camera/light restoration. The actual loaded world contains all three retained
aquarium outline components and denies bridge/thin-fragment interior admission.
Latest entrance, phone-map and diagnostic exterior images were inspected.
Evidence: `output/interior-expansion/aquarium-coverage-regression/report.json`.
This is source-only verification, not aquarium gameplay or a new release.
