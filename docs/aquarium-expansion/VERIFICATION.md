# Aquarium verification ledger

Updated October 13, 2026. **Local implementation; final showcase/release acceptance remains open.**
The dated sections below preserve earlier evidence. Source, isolated renderer,
ordinary gameplay and release checks are distinct.

## October 13 request continuation

Working branch resolved from CURRENT-STATE.md: architecture-evaluation worktree,
`steven/visual-quality`; initial HEAD `283646e04e2cd654a25a700b659700ba79427be3`.
Existing exterior/waterfront/transport edits are separate work and are not
attributed to this continuation. No production artifact was rebuilt/deployed.

**Fresh component result:** 50/50 pass, no skips, failures or TODOs:

```sh
node --test --test-concurrency=1 tests/aquarium-content-current.test.mjs tests/museum-content-current.test.mjs tests/interior-layout-current.test.mjs tests/interior-stair-authority-current.test.mjs tests/interior-exterior-colliders-current.test.mjs
```

Receipt: `output/aquarium-expansion/2026-10-13-request/components.tap`.
New cases verify reusable species routes under a translated coordinate frame,
finite/evidenced/bounded population input, one unchanged population across both
viewing floors, disabled off-floor/paused animation, low-quality decorative
reduction with both educational species preserved, unchanged event IDs plus
source/confidence metadata, and malformed-animation lease cleanup followed by
successful retry. Existing full-cycle containment, late loads, offline retry,
disposal, geometry, lifts, doors, museum separation and imported-byte checks pass.
An initial test assertion compared two references to the same edited fixture;
it was corrected to compare the pose before the edit. It was not a game failure.

The first broad `verify:pr` attempt stopped at duplicate import identities for
the existing `building-provenance-model.js` owner, introduced by a new exterior
policy's unversioned import. Aligned that single specifier with the existing
`v=1` identity; no provenance/geographic rule changed. The next source chain
reached 2,579 tests, with 2,577 passing and two VM-fixture failures: stripped
imports omitted `publishWaterfrontWalls` / `clearEngineeredWaterfront`. Updated
those existing fixtures to supply the **actual** functions and assert the actual
waterfront owner is retired on reset. No no-op substitute or gameplay change.
Twenty focused memory/owned-browser/waterfront/exterior checks now pass.
Receipts: `source-chain.log`, `source-chain-final.log`, `lifecycle-fixtures.tap`
in this request's output folder. These failed full-chain attempts remain failures;
the final full-chain outcome is recorded separately below.

**Browser run:** the first emulator command failed before browser launch because
the shell chose macOS's Java placeholder. Diagnosed the installed OpenJDK 21 path
from existing project verification notes. The corrected run uses explicit local
staging emulators and the existing prescribed game-client choreography; its
result must be recorded below before any current browser pass is claimed.

### Fresh browser result: functional checks pass; performance gate fails

Machine-readable source/feature/check links and hashes of four inspected images
are saved in [the scoped verification summary](evidence/2026-10-13-verification.json).

`output/aquarium-expansion/2026-10-13-request/browser/report.json` records
**36 functional checks passed**, zero page/GPU errors, including the actual
geographic door/footprint admission, connected upper/lower rooms, real E/lift
controls, three saved notes, 503 retry, pause/pose preservation, map widths
390/844, running/jumping, exact exterior/camera restoration, five admissions,
one four-animal/two-water-target habitat each time and zero aquarium/coral leases
after exit. Final cycles 3/4/5 retain **756 geometries / 176 textures** each;
renderer counts alone do not establish all CPU/GPU memory is leak-free.

The combined run is **FAILED**, not a desktop performance or complete-acceptance
pass. It asserts the Pavilion hitch failure after all functional checks. Natural
heap, renderer and all three RAF windows are retained in the report even though
later assertion calls stop at that first failed budget. The environment is the
physical M1/8 GiB Mac mini with native Chrome/Metal graphics and explicitly local
staging emulators, not ordinary hosted App Check/service certification.
Another task started a headed browser during this window, after our initial
process check. Its process was observed afterward and preserved. These sampled
numbers therefore include uncontrolled background activity and cannot isolate
aquarium cost or certify single-workload performance; the recorded failure is
still retained, not waived. Do not infer a cause for the hitch from this alone.

| Ten-second window | Average FPS | p95 / p99 ms | Worst frame ms | JS heap bytes | Draw calls / triangles | Hitch result |
|---|---:|---:|---:|---:|---:|---|
| Pavilion | 57.01 | 16.8 / 33.4 | 150.0 | 850,434,864 | 646 / 422,333 | FAIL: one >100 ms frame; 5.99/min against 1/min budget |
| Lower reef | 57.71 | 16.8 / 33.4 | 50.1 | 864,806,004 | 264 / 381,275 | Window passes |
| Reentry | 59.50 | 16.7 / 16.8 | 33.4 | 884,041,564 | 158 / 236,433 | Window passes |

Entry-to-published playable shell was **722.48 ms**, including test interaction
settling/polling. The report's `assetsReadyMs: 767.84` was recorded when the first,
deliberately failed attempt settled; it is **not successful asset-ready latency**.
This reporting error is corrected in the verifier to separate initial-attempt
settling from all-assets-ready. Do not reinterpret or overwrite the failed receipt.
ResourceTiming recorded 244 same-origin entries / 3,710,131 transferred bytes /
3,636,931 encoded bytes; cache hits and retained browser entries limit this scope.
Shared idle aquarium/coral templates report 38,855,821 estimated resource bytes
and zero live leases; this is neither actual GPU allocation nor whole-world memory.
Simulation-exclusive CPU cost, successful cold asset timing, full browser reload
and physical-phone behaviour remain unmeasured in this run.

The extended runner's first loaded revision also called the browser-close helper
with the wrong argument shape, producing a shutdown TypeError after writing the
performance failure receipt. The call is corrected to the existing helper's
BrowserServer API. Process inspection confirmed no owned headless browser remained;
the other task's headed browser and ordinary owner Chrome were preserved. No whole
game rerun is used to erase the hitch result. No source geometry/budget was changed
to satisfy this harness.

Screenshots were visually inspected: exterior-entry, reef-overlook, underwater-window
and portrait visitor-map. Entry and dry viewing routes are visible, but the upper
habitat remains dark/sparse with a largely blank atrium; it still fails the prior
visual-showcase bar. This is functional evidence, not exact architecture approval.

The extended existing aquarium runner records admission-to-shell and assets-ready
latencies, same-origin ResourceTiming transfer totals, three actual ten-second
RAF windows and five admissions through normal E/lift/exit actions. A synthetic
503 tests animal recovery. Phone viewports are layout proxies only. Natural
heap/resource readings are retained; no forced collection or budget relaxation.
Simulation-exclusive CPU cost and actual GPU allocation are still unmeasured.

Historical receipts below apply only to their recorded source/package. In
particular the October 12 source run's 54 checks and 58–60 FPS windows are not
current measurements. Later packaged/ordinary walkthroughs contain their own
heap/frame-pacing failures. Those failures remain open even if a new bounded
window succeeds.

### Final source-chain result

`npm run verify:pr` **PASS** after the diagnosed fixture/import/scope corrections:
**2,593 tests**, no failures/skips/TODOs, plus dependencies, syntax/module identity,
context ownership, boundary types, runtime names, inventory and sensitivity.
Receipt: `output/aquarium-expansion/2026-10-13-request/source-chain-registered.log`.
Five existing new exterior/waterfront/building-domain/vessel test files lacked an
execution scope; registered them in the existing component suite rather than
leaving them excluded. The preceding 2,580-case successful component run still
failed its inventory gate and remains recorded in `source-chain-complete.log`.

This source result includes other preserved worktree changes. This continuation's
small compatibility fixes are: the exterior-policy import URL, the actual-function
VM fixture bindings, and the existing test-registry entries. It does not attribute
that other work's exterior geometry or terrain implementation to this task.
No subsequent runtime edits followed this passing source chain. Documentation
updates below do not turn the failed browser performance run into a pass.

### Acceptance against the attached brief

| Criterion | Current evidence and status |
|---|---|
| Mapped association | PASS for the reviewed Pier 3 provider/footprint/door; main/member door role remains unresolved |
| Sources and licenses | Documented independent assets and factual references; exact institutional imagery/plan reproduction remains rights-blocked |
| Two connected playable spaces | PASS within the six-room, three-floor interpretive route |
| Animated habitat | Existing rig/motion owner retained; component motion/containment and actual GLB loader checks pass; not a real census |
| Three educational interactions | PASS; all three existing Journal studies saved |
| Standard movement and UI | PASS for E, lifts, run/jump, pause, return and two map viewports in this scoped journey |
| Repeated entry/exit | PASS across five admissions; late-load/lease disposal also covered by components |
| Player persistence | Journal notes restored on reentry; fresh complete browser reload/save-rollback not tested here |
| Missing assets | PASS for injected 503 + retry; component late/malformed cases pass |
| Performance recorded | Recorded; Pavilion hitch FAIL. Background workload prevents isolated cost/certification |
| Desktop integration pass | Functional checks pass; combined performance/cleanup run FAILED |
| No unrelated regressions | Full source chain passes 2,593 checks; full release/browser regression remains separate |
| Physical phone | UNVERIFIED; map viewport emulation only |
| Architectural accuracy | MAPPED topology, selected published dimensions, INFERRED geometry, REPRESENTATIVE animal/reef art; exact reconstruction NOT ACCEPTED |

The vertical slice is therefore **not complete under the brief's full acceptance
criteria**. The performance stop condition blocks further expansion. Separate
rights/hardware dependencies also block exact institutional reconstruction and
phone certification. No additional aquarium was published.

## Current construction/water correction

- The owner rejected the earlier water appearance after functional tests passed.
  `final-sealed-visitor-current` is therefore not visual acceptance. The latest
  repair corrects ripple projection and clipped optical boundary coverage.
- Focused components cover published window dimensions, supported observations,
  four flat panes, collision/slab agreement, physical lift cores, clear framed
  doors, museum separation, water distance/absorption, exact disposal and renderer
  state restoration after injected optical-pass failure.
- `output/aquarium-expansion/water-projection-final/` passes five views through
  actual engine postprocessing, including SMAA/bloom. GPU readback confirms
  24-bit depth and half-float color on this Chrome/WebGL 2 host. Twelve physical
  reflected-marker cases cover above/below, camera roll and both depth/fallback
  shader paths. Changing the scene background between magenta and green produces
  **zero pixel difference** at the closed underwater wall contact. Animation,
  pause and override-material protection pass; zero page/GPU errors. Screenshots
  inspected. This fixture is not geographic gameplay or performance evidence.
- `output/aquarium-expansion/water-final-game-current/` passes **33 checks** after
  the final seam repair: ordinary entry, keyboard movement, real lift controls,
  actual mouse look at the underside, missing-animal retry, three saved notes,
  portrait/landscape maps, run/jump, complete return, exit/reentry, released model
  leases and exactly two active water color targets. Zero page/GPU errors;
  latest underwater and route images inspected. Live weather was unavailable
  during this controlled venue check; no provider-success claim is made.
- `output/interior-expansion/final-display-lighting-current/` passes **28 museum
  checks**, with all three displays and entry images inspected after the final
  targeted-light correction. Earlier reload verification remains separately
  recorded in `shared-construction-current` / `final-venue-lighting-current`.
- Final `npm run verify:pr` passes **2,512 tests**, no skips/TODOs, plus dependency,
  syntax/import, ownership, boundary-type, runtime-name, inventory and sensitivity
  checks. Log: `output/aquarium-expansion/source-final.log`.
- No immutable package, physical phone, new performance certification or
  production/GitHub change is included in this local correction.

The current artwork still fails the complete-showcase bar: sparse reef habitat,
blank geographic surroundings through Pavilion glazing, unmodeled upper atrium
and limited public programme. Thin distant joints still need final antialiasing/
detail review. Water is a bounded real-time optical approximation, not fluid
simulation or a measured reconstruction of the tank. These are real remaining
limitations; successful functional tests do not close them.

### Diagnosed failures retained

- `complete-route-current`: another geographic building part crossed the authored
  corridor. Contained interiors now use their own published obstacles.
- `contained-route-current`: an approximate outdoor wall-height tolerance leaked
  lower walls into the upper floor. Authored colliders use precise bounds.
- `route-height-current`: the test's straight waypoint cut a wall corner. The
  runner follows the actual corridor; collision geometry was not weakened.
- `route-complete-reviewed`: map/elevator interaction ranges overlapped. The map
  now has a separate visible station outside the elevator landing.
- `override-pass-diagnostic`: the normal/depth pass replaced water color targets.
  The optical adapter excludes those override passes; framebuffer hashes prove
  the fix, without disabling global postprocessing.
- `water-edge-diagnostic`: changing the clear color reproduced the bright tank
  seam. Transparent coverage in enclosed optical passes removes that leakage;
  the final background-independence pixel check is recorded above.
- `depth-optics-diagnostic`: the first shader revision had a conflicting local
  variable name. The GPU compile error was fixed before renderer/game acceptance.
- `composer-depth-diagnostic`: the isolated direct renderer hid the composer's
  lower depth precision. Rendering with the real pipeline exposed the conflict.
  `composer-color-diagnostic` separated linear-color banding from depth issues.

These earlier diagnostic runs are not relabeled as successful complete visits.

## Earlier audit evidence (before the local integration above)

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

## Earlier acquired-animal renderer review

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
