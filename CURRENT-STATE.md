# Current development and release state

Updated October 12, 2026. **5.5.0 is deployed to production.**
Release: https://github.com/RRG314/WorldExplorer3D/releases/tag/v5.5.0
Public project page: https://rrg314.github.io/WorldExplorer3D/

## Current release

- Production: https://worldexplorer3d.io/app/
- Build: `5.5.0+d8775a392c42.88e67f97c00bb4c2.production`
- Product source: `d8775a392c4246b2552842c37f40508bd664d4c5`
- Firebase project: `worldexplorer3d-d9b83`; live version `1036aacf01a2b97d`.
- Local dist contains the production package. Its game files match the verified
  staging package; only the three reviewed Firebase configuration assets differ.
- The custom-domain and Firebase-hosted build/asset manifests match local bytes.
- The owner reports that the preview works and repeatedly requested publication.
  This is an owner-directed release with disclosed limitations, not a complete
  automated release certification. See
  `docs/release-review/2026-10-08/OWNER-RELEASE-DECISION.md`.

All 2,183 source tests and the source chain pass. GitHub code/package and secret
checks pass. Current immutable regional arrival/recovery, all 29 packaged-world
checks and the three-stage save/rollback roundtrip pass. The captured mixed-provider
passage regression has zero discontinuities across 495 connections. Final normal
packaged world retains 49,023 buildings and 18,952 roads without runtime errors.

The final broad matrix was interrupted during city-switch verification and remains
explicitly incomplete. Prior performance failures and the unverified named-phone,
new-player and complete ordinary-hosted acceptance are not relabeled as passing.
The new Firebase preview hostname triggered Chrome's Dangerous site warning;
that warning was not bypassed. The established custom domain opened normally and
live search worked before promotion. After promotion, ordinary Chrome opened
5.5, returned place-search results, displayed loading progress and entered the
Light Street world with live weather and no captured browser errors. Day/night
controls worked and both scenes were visually inspected. This does not certify
the separate sign-in/shared-voyage or physical-device acceptance classes.

Four saved packages are retained: unique 0e4, previous production 1532, compatible
37a fallback, and the verified d877 staging package. Superseded generated e5 and
4413 packages were pruned only after complete payload/hash and pushed-ancestry
verification; their manifests and receipts remain. Source/history/player data and
the owner's ordinary Chrome remain intact.

## Working checkout

Use `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`,
branch `steven/visual-quality`. Do not edit the older Documents/Developer checkouts.
Run heavy tasks sequentially on this observed 8 GiB Mac and close only owned
browsers/servers. Production deployment evidence is under
`output/release-evidence/current/production-deployment.json` and
`production-promotion.json`; acceptance gaps remain in their own receipts.

## October 12 resource residency cleanup — local verification

The current local changes retire the hidden furnished research vessel after
successful sub admission, release the Ocean scene/renderer on recovery, and
release the previous Earth city's geometry and provider caches only after
accepted marine entry. Failed admissions retain their prior presentation.
The saved land selection/pose and current marine evidence retain their owners.
Returning to land rebuilds it through the existing Earth session authority.

The actual land/ocean/land check restored all 49,080 buildings, 18,952 roads,
49 terrain tiles and the exact location/pose. Underwater counts were zero, with
renderer geometries reduced from 1,043 to 60 and textures from 197 to 35. The
combined verifier then stopped at an ambiguous canvas selector, now corrected;
that partial run is not a complete gate pass. Evidence is in
`output/production-readiness-20261012/resource-lifecycle-checked/report.json`.

The final ocean-only source check passes three real deck/sub/deck cycles, preserves
ship/sub identities, retires the hidden vessel and inactive renderer, releases
marine leases at the menu, and retains 60,299,964 / 60,867,748 / 61,636,692 JS heap
bytes after explicit collection. The earlier inventory comparison removed
164,394,722 estimated actively leased template bytes without removing assets.
These are resource/retention measurements, not measured GPU memory or frame-time
acceptance. Final recovered-deck and underwater screenshots were inspected.
The green loading-ground patch is now retired on successful surface arrival.

The named Ocean fixture allowance now reflects its licensed submarine, corals
and parent hull, replacing the obsolete procedural-scene ceiling. This is not a
limit on geographic exploration or activities. Frame-time budgets remain intact.
Compressed regional imagery has a 4 MiB/128-tile reuse cache that retires with its
last owner; decoded bitmaps close after composition. Regional building assembly
uses exclusive typed storage with exact attribute/index equivalence, preserving
footprints, facades and all road/bridge/tunnel geometry. Regional edge sorting
and coordinate frames are reused; terrain sampling avoids per-vertex metadata
allocation. Background terrain/water work yields between rendered frames and
stops when superseded. Temporary water-mask canvases retire on success and abort.
Portal shaders now reuse identical programs without changing tunnel openings.
The actual GPU terrain/pavement lifecycle fixture passes after this change.

The habitat audit found a real instance-buffer leak invisible to Three's geometry
counter: actual WebGL buffer counts grew 38/53/68/83, leaving 64 after retirement.
Explicit InstancedMesh disposal fixes both cloned corals and base habitat meshes:
the same check is now 38/38/38/38, leaving only the fixture seabed's four buffers.
Both receipts and the inspected licensed-coral image are retained under
`output/production-readiness-20261012/habitat-buffers-{before,final}`.

The source continuous-ocean browser journey passes all ten cases, including
region retirement, provider outage, reload, swimming/reboarding and recovery.
Nine tiles remain resident across repeated 9 km traversal setups; renderer
geometry remains at 33 and textures at 30–33. This uses controlled depth responses;
it is not global bathymetry fidelity or an elapsed-time circumnavigation claim.
Evidence: `output/production-readiness-20261012/ocean-stream-final/report.json`.

The latest unprofiled 90-second flight averages 49.98 FPS with p99 50 ms, but
still has 13 frames over 100 ms and two over 250 ms (worst 483.4 ms). Walk/drive
windows have no frames over 100 ms but do not meet the FPS/heap release ceilings.
This diagnostic is not a performance pass. CPU/allocation profiles and each
failed comparison remain intact; no threshold was relaxed. The final full source chain
passes all 2,524 tests after the instance-buffer correction, plus dependency,
ownership, type, runtime-name, inventory and sensitivity checks.

The local immutable resource-reviewed package is
`5.6.0+69d5632b30b8.2ac1eef14bf650b1.staging`. Seven of nine selected gates pass:
full land/ocean/land and three sub/recovery cycles, marine habitat, continuous
ocean, terrain shaders, packaged world, artifact integrity and release contracts.
The aquarium and museum complete their functional journeys but fail performance
acceptance. Aquarium reentry includes 666.7/566.7 ms pauses as temporary city
construction data is collected. These failures remain recorded.

A subsequent terrain material refresh fix reuses private read-only mixtures
instead of allocating two arrays at every vertex. Exact normalized-byte and
float parity, including writable public return isolation, passes. The source
Aquarium journey then passes all 54 checks, including three measured 10-second
views at about 60 FPS with no frames over 50 ms. Raw heap is 1.027–1.055 GB.
This source diagnostic requires confirmation in the next immutable package;
it does not override the previous package's failure or certify outdoor travel.
Evidence: `output/production-readiness-20261012/aquarium-reuse/report.json`.

The owner's latest request prioritizes complete research-vessel, starship and
street-to-aquarium player journeys plus frontend/backend review. Only observed
gameplay defects should change gameplay; harness failures must remain distinct.
Public README, Pages and release imagery must show the current build with plain
player-facing descriptions. The current hosted production and fallbacks remain
untouched. The first backend sweep accidentally used the preserved production
`dist`; its local protection correctly refused access. The sweep was stopped,
its owned processes retired, and must run with an explicit staging package.
No GitHub push or production deployment has occurred.

## October 12 aquarium audit and venue separation

The owner explicitly requires distinct museum and aquarium buildings/experiences.
Museum content now has an enforced venue type at association, layout, fixture and
runtime boundaries. Authored floor interaction/recovery uses physical elevations.
Facade doors and entry share semantic/headroom eligibility: bridge structures,
roof pieces and thin fragments no longer receive building interiors.

Actual pinned Overture data revealed a coverage defect: all three Pier 3 aquarium
outline components were discarded because one triangular child part existed.
Parent suppression now checks actual accepted child union coverage, with bounded
work and conservative retention. The exact public input is a regression fixture.
The source game confirms all three sections now render. Their inferred heights
and generic exteriors are not approved aquarium architecture.

The complete source chain passes **2,492 component tests across 465 files**, zero
skips/TODOs. The final source museum/coverage browser journey passes **32 checks**:
ordinary museum entry, all displays, failed-display retry, Journal reload, phone
maps, run/jump, two reentries, restored exterior/camera, zero page/GPU errors,
restored aquarium coverage and rejected bridge/fragment entry. Images inspected.
Evidence: `output/interior-expansion/aquarium-coverage-regression/`.

Aquarium research/design/status is in `docs/aquarium-expansion/`. The current
local branch now has a distinct Pavilion/Blacktip Reef route, optimized licensed
animated animals, physical lift cores, Journal observations and floor maps.
Shared authored construction supplies slabs, explicit wall thickness and clear
framed openings for museums too. The central curved aquarium window now uses
published 27 ft / 4 ft dimensions with four adjacent flat panes. Other geometry
and the limited route remain estimated, not a complete institutional replica.

The owner rejected the first underside surface appearance despite functional
passes. Water now uses actual virtual-camera projections and mesh-basis normals,
with scene-depth ray reprojection where supported and a camera-aligned fallback.
The clipped tank edge retains transparent coverage, preventing the outdoor
background leaking as a bright seam. Twelve above/below/rolled marker cases and
the background-independence pixel check pass; five renderer views inspected.
Water remains a bounded planar approximation, not exact acrylic/fluid optics.

Final source chain: **2,512 tests pass**, no skips/TODOs; all dependency, ownership,
type, runtime and test-inventory gates pass. Final actual aquarium source journey:
**33 checks pass**, including failed asset/retry, all three notes, both phone map
orientations, real lifts, walking/run/jump, underside mouse look, exact exterior
return, reentry and released assets; zero page/GPU errors. Final museum lighting
regression: **28 checks pass**, entry and all three display images inspected.
Earlier reload evidence is kept separately. These are source/renderer/gameplay
checks, not immutable release, physical-device or fresh performance acceptance.

The actual aquarium route exposed exterior building collision inside authored
rooms and a lower-wall tolerance reaching an upper floor. Both are repaired in
shared contained-interior physics and vertical bounds, retaining legacy partial
interiors. Venue lighting owns indoor camera/light layers and excludes outdoor
PMREM while occupied; exit restores the latest outdoor environment. See
`docs/aquarium-expansion/VERIFICATION.md` for current evidence and real remaining
art/architecture scope: sparse habitat, blank Pavilion surroundings, upper
institutional programme, final visual-showcase acceptance. No production/GitHub
changes; preserve dist and all saved candidates.
The previous immutable museum diagnostic finished eight passes/six failures.
Outdoor performance and ocean resource ceilings remain genuine release failures;
corrected source helpers/inventory do not retroactively pass the older package.
No production deployment, GitHub push, asset substitution or player-data change.
Preserve dist and all previously retained candidates.

## October 12 local museum implementation

The owner included museums in the next release and asked for finished architecture
and source-supported room layouts. The local Peale-associated visit now uses a
front hall with two adjoining galleries informed by the museum's public guide.
Dimensions/finishes are estimated and the limited ground-floor scope is labeled.
Timber flooring, joinery, ceiling fixtures, bounded indoor lighting, licensed
furniture and Smithsonian/Met exhibits replace the initial bare room slice.
Existing entry, Walk, compiled collision, asset leases and Journal remain owners.

The complete source chain passes, including **2,486 component tests**, types,
ownership, dependencies and test inventory/sensitivity. The extended museum
source journey passes **65 checks**, including missing-display retry, all exhibits,
Journal persistence across full reload, phone panels/maps, run/jump, exact exterior
return, reentry, release and zero page/GPU errors. Images inspected. Two reentries
retain 48 unique museum geometries, three furnishings and three lights; museum
leases return to zero. The sealed gallery now uses a scoped camera layer, avoiding
the outside city's render/shader work and restoring its exact view on exit.
Three bounded M1 hardware frame windows pass existing budgets at 59.5–60 FPS;
entry measures 114–171 ms. This is mutable-source evidence, not complete release
performance or physical-phone certification. Eleven museum and 11 layout component
checks pass. The corrected fish journey passes 12 checks with all eight observed
fish swimming after the arrival population replacement. Missing vessel captures
are supplied with actual per-image build identities. Broader candidate, backend,
save/fallback and hosted gates remain open. See `docs/interior-expansion/VERIFICATION.md`
and the October 12 release ledger. Production still d877; no push or deployment.

## October 11 current continuation — ocean streaming and save safety

### Latest: regional detail and ship movement repair

The current review delivery is documented in
`docs/design/POST-RELEASE-STREAMING-DELIVERY.md`. All **2,471 source tests** and the
complete source chain pass. The furnished research-vessel browser check passes
20 cases, including real Space jump/landing and shared mouse look, all 55 route
connections, smooth stair camera, maps, swimming and disposal. The full Earth
source journey passes arrival/return, moving imagery, provider failure/recovery,
streaming toggle and regional buffer disposal.

The existing preview now serves **31ab54c**:
https://we3d-staging-20260712--ship-review-1011-pb8x1l4l.web.app/
(expires October 18 evening, America/New_York).
Immutable package: `output/hosting-validation/streaming-reviewed`, build
`5.5.0+31ab54cd264b.113b39b42da96b2a.staging`. All eight selected packaged gates
pass, including remote Earth arrival, ship traversal through all 25 rooms,
marine journeys and artifact integrity. The separate 11-case ocean/actual
fallback roundtrip passes against the same package. Ordinary hosted Chrome
passes running, mouse look, jump/landing away from the ladder, galley,
bridge/chart and desktop/phone-width map, with no captured page or HTTP errors.
Source/component, controlled-provider and live-service evidence are separated
in the delivery ledger. Phone-width testing is not physical-device testing.

Production remains d877; no GitHub push or production deployment. The earlier
same-payload `streaming-ready` validation package was retired after full hash
verification; its manifests/receipt remain. Preserve production dist, all four
saved packages, previous `research-ready`, and the current `streaming-reviewed`.
Worldwide physical transport streaming and the larger roadmap are not claimed
complete; their current limits are explicit in the delivery review.

### Previous preview: research vessel interior

The working ship now has an enclosed wet lab, galley, mess, dry lab, quarters,
briefing room and wheelhouse, connected by actual internal stairs. Deck-level
map tabs show the player and walking route. Stations reuse the existing Journal,
Field Guide, Backpack/condition and voyage authorities. The licensed source hull
is retained beside a reproducibly adapted walkable model. No production deploy.

Full source chain: **2,459 tests pass** after the offshore geocoder repair.
Furnished browser fixtures pass **11 + 18**
checks, including all 55 connections, galley consumption/reload, map input lock,
swimming/reboarding and complete disposal. The expanded full-app journey passes
16 checks: survey/rewards, each room action, real chart, desktop/phone ship map,
and surface save/reload returning to the same vessel. The final immutable package
`5.5.0+fcb8c70305f1.83820089a4eff4ba.staging` passes seven selected gates and the
11-case continuous-ocean/real-fallback roundtrip. Gameplay provider responses are
controlled; whole-release acceptance remains separate. The review preview is
https://we3d-staging-20260712--ship-review-1011-pb8x1l4l.web.app/ (October 18 expiry).
The final hosted Chrome journey passes five cases, including live weather and
HTTP 200 responses from reverse-place, marine and weather gateways, with no page
errors or failed requests. Staging's exact preview hostname is now registered for
ordinary AppCheck. Staging `getPlaceLookup` version 4 fixes expected unmapped ocean
addresses; existing cloud configuration is unchanged. Production still needs this
backend repair in the eventual approved release. Five focused controller-cleanup
tests and a real-browser listener-close probe also pass. Whole-release acceptance
and the broader roadmap remain open; this is a ship/ocean review build.
Evidence and limitations: `docs/design/RESEARCH-VESSEL-INTERIOR-DELIVERY.md`.

Ocean code is checkpointed at `b145ab83` / `4821c59b`. Its prior immutable
`ocean-482` passed 11 continuous-ocean/fallback checks; its manifests and retirement
receipt are retained under the current delivery evidence.
This supersedes the older note below that continuous ocean implementation itself
was still open. Whole-release acceptance and the broader facility/creative/career
roadmap remain separate and incomplete. Preserve dist and the four saved packages.

Continuous personal open-ocean travel is implemented locally, with a player toggle,
geographic tiles, origin rebasing, bounded residency, truthful provider outage
behavior and the original parent-vessel recovery. The old location dive and shared
crew modes retain their own admission. Scenery uses stable tile identities and
known depth; regional licensed wildlife waits for a valid streamed water volume.

The audit also corrected native v2 saves replacing the released v1 key. New v2
and v3 records use their own keys; existing records are retained and readable.
Weather/place caches are bounded, obsolete consumers cancel, and failed weather
shows a terminal state plus an explicitly labeled UTC fallback clock.

`docs/design/OCEAN-STREAMING-DELIVERY.md` holds the implementation and evidence
ledger. Mutable-source browser7 passes 10 checks; retained diver/local-entry
journeys pass 13/26 checks. These use controlled provider responses, alongside
separate two-point live GEBCO evidence. Packaging/fallback and whole-release
acceptance are still in progress. No deployment; dist and retained packages intact.

## October 11 latest local continuation — licensed wildlife and journey Journal

The ocean lifecycle now owns three licensed animated common dolphins in conservative
California Current / northwest Atlantic game ranges, gated by admitted open water,
geographic depth and actual sampled water volume. They swim near the surface,
avoid obstacles and release their leases/skeletons on departure. Wildlife watch
records an in-view, stationary, unobstructed encounter through the existing Journal;
it never claims a live sighting or awards invented survey evidence/currency.

The Journal audit found a separate coherence defect: its return action treated
all coordinates as Earth, and ocean-first players could not open the Earth-owned
reader. Ocean and planetary sessions now share one read-only Journal/Guide shell
with filters, saved details, failed-read retry, pause and environment cancellation.
Earth's reader cannot overwrite that shell in the background. A saved marine
observation carries a validated voyage; returning uses existing vessel/sub custody.
Unsupported planetary returns are unavailable instead of loading Earth roads.
Earth returns restore the actor/environment through the existing menu authority
before selecting the saved location. No new inventory/profile persistence owner.

**Full verify:pr: 2,417 tests pass.** Actual licensed model / ocean-game acceptance
at `output/roadmap-20261011/ocean-journal-final/report.json`: **20 passed**, zero
page/GPU errors. Covers independent rigs, animation/pause, four region resource
cycles, research deck/cradle deployment, real IndexedDB observation, phone layout,
actual Backpack → Journal → saved voyage → sub movement → vessel recovery.
The provider's 180 m depth and observation pose are controlled test inputs, not
live ecology or uncoached-play evidence. Screenshots were inspected.

`output/roadmap-20261011/journey-journal/report.json`: **15 passed** actual DOM/CSS
checks with controlled storage/returns, including filters, retry, late reads,
repeated open/close, environment cancellation and phone bounds. The first game
Journal attempt used the wrong test menu (Explore instead of Backpack); that
failure is retained, and only the test route changed. Initial duplicate asset
cache import and test-inventory failures were fixed before the passing source run.
Source receipt: `/tmp/we3d-journal-full-source.log`.

Disk safety: removed npm's downloaded-package cache and an inactive cached
Playwright CLI, preserving installed dependencies and the active Firebase CLI.
Two old generated GC traces were losslessly compressed with decompressed SHA-256
verification; their receipt is `output/architecture-evaluation/current-travel-1007/trace-compression-20261011.json`.
The marine verifier refused to start below its 3 GiB gate, then ran after measured
headroom was restored; its running resource stop remained enabled. All owned
browsers/servers closed. The owner's Chrome, saves, source history, dist and four
retained packages are intact. No production or GitHub changes.

The full roadmap is still open: continuous ocean streaming, whales/deep squid,
broader licensed fauna/seasonal evidence, geographic creative persistence,
terrain/farms, remaining careers/CERN, visual realism and compatible release
roundtrip. Current ocean scenery is finite and its distant water remains basic.
This tested addition is not a production-release certification.

## October 11 previous local continuation — nearby street publication priority

Actual Earth-return inspection exposed delayed pavement publication, not new
evidence that the already repaired sidewalk polygons should be redesigned. The
first controlled arrival filled its nearby frontage after a 67-second rebuild.
The follow-up measured an additional architectural conflict: detail waited on
the city overview's whole source/preparation task. Nearby work now interrupts
that worker, retains accepted atlas cells, rejects late replies and resumes only
unfinished cells. Roads, bridges, tunnels and sidewalk geometry rules are unchanged.
Phase durations now distinguish source, terrain, cell, mesh, path and contact work.

Full `verify:pr`: **2,405 tests pass**. `street-priority-final/report.json` passes
**11** bounded native-worker/Three/browser checks, including held preparation,
held cell work, return travel, render/contact parity, all **344** overview cells,
disposal and captured Monaco/San Francisco hill scenes. Images were inspected;
there were no page/GPU errors. Two old verification pages also used a retired
road export; they now use the current compiler and local Three runtime.

The full-city follow-up was deliberately stopped when free disk fell below
1 GiB under memory pressure. It is **not passing** and was not rerun. The owned
browser was closed; free disk recovered to about 4.2 GiB. Its earlier captured
initial arrival had matching actor/pavement focus at the origin, 49,023 buildings
and 18,952 roads. This does not certify full-city latency or memory. That verifier
now requires 8 GiB free before starting and closes its own browser below 1.5 GiB.
The prior failed canvas-selector run is also retained as failed evidence.

Evidence: `output/roadmap-20261010/street-arrival-review/`,
`street-arrival-phases/`, `output/roadmap-20261011/street-priority-final/`;
source receipt `/tmp/we3d-street-priority-full-source.log`. Worldwide creative
storage, terrain/farms, expanded oceans/fauna, remaining careers and compatible
release fallback are still open. Production, dist, four retained packages and
player data remain unchanged.

## October 10 previous local continuation — creative room and environment isolation

Creative tools now use the room's declared coordinate frame. Solo building
removals restore visually on room entry and return on exit. Earth edits cannot
mutate a Moon/Ocean visit; room blocks detach outside their frame and return with
the same room identity. Geographic blocks use the existing polar/date-line frame.
Late saves retain their original room, rejected previews use the latest accepted
room data, and the lazy builder drains only the latest queued room and its rows.
Room permission updates refresh mapped-building controls.

Full source chain: **2,401 tests pass**. `creative-room-isolation-final/browser.json`
passes **23** actual builder DOM/Three/storage checks in a controlled scene,
including delayed runtime loading. Shared responses are controlled; live cloud
room acceptance remains separate. `lunar-creative-scope-regression/report.json`
passes **15** actual-game checks through ship/Moon/ship/Earth with the optical
method, deliberate save/ascent failures, no GPU/page errors, and the known external
Overpass CORS error recorded separately. Images were inspected. The Earth arrival
capture is not general street-layout/visual certification; allow the ordinary
publication stages to settle before diagnosing its pavement appearance.

No room is automatically created during travel. Existing save formats are retained.
This does not implement chunked worldwide creative storage, terrain/farms or
multi-body room storage. Those finite roadmap gates and release fallback remain
open. Production, dist, the four retained packages and player data are unchanged.

## October 10 previous local continuation — creative save preservation

Both existing creative stores now protect unreadable, unsupported, lossy and
oversize records, preserve original recovery copies, reject stale writers and
treat the primary write as the commit point. The builder provides recovery-file
downloads. Legacy geographic blocks retain their position and remove by saved
identity after reload. Reset building edits now resets that authority only;
blocks use their separate Clear action, in solo play and shared rooms. This
removes the former partial two-store reset rather than claiming atomic writes
across independent stores.

`creative-scoped-reset/browser.json` passes 15 browser checks using actual builder
DOM, Three rendering/collision and browser storage in a controlled scene, including
failed reset/retry and legacy deletion/reload. Room-reset scope has a component
check; no new live shared-service acceptance is claimed. The full source chain
passes **2,384 tests**. Images were inspected. This is preservation work, not
worldwide creative storage, terrain editing or farming completion. Continue those
finite gates. Production, dist, retained packages and player data are unchanged.

## October 10 previous local continuation — Moon fieldwork and homecoming

H10–H12 now have local implementation: physical ship briefing/preparation, saved
observation or sample method, two native LROC surface sites, actual Backpack
specimens for collection, partial same-pod recovery, ship analysis, Earth return
and a saved home display. Instrument power has a 20-minute game budget and a
visible return reserve; pause/offline time does not drain it, failed writes stop
measurements for explicit retry, and a new ship sortie supplies a fresh charge.
It is instrument power, not a physiological oxygen simulation.

Final `lunar-resource-authority/report.json`: 15 controlled actual-game checks.
Final `lunar-home-resource-report/report.json`: seven WebGL/DOM/storage checks in
a controlled room using the exported actual Moon report. Source chain: 2,375 tests
pass. Native terrain support now matches rendered triangles; independent regional
imagery compiles without a base map. GPU shader lifecycle checks preserve tunnel
openings and pavement. Final Earth image has ground and no stale landing prompt.

An earlier Earth run functionally passed but had shader errors and invisible
ground; it is rejected visual evidence. An initial battery test incorrectly wrote
read-only pause state; its corrected rerun uses the real pause authority. External
Overpass CORS failure remains separately recorded. Actor/flight setup and battery
time are controlled/accelerated; this is not a complete uncoached campaign,
physical-device or release certification. Moon station/rock art is still basic.
Full roadmap, worldwide ocean/creative streaming, terrain/farms, remaining careers,
licensed fauna, realism and compatible release fallback remain open. Production,
dist and retained packages are unchanged.

## October 10 previous local continuation — first licensed swimming fish

Northern Australian coastal encounters can now use the reviewed Microsoft
barramundi model (CC0): textured, normal-mapped geometry with authored tail motion,
real catalogue size and regional/water/depth eligibility. It is 2.75 MB / 3,864
triangles with shared model resources and three individuals per population.
Loading, cancellation, region retirement and failed assets are covered; an
unavailable licensed model is not replaced by a generic stand-in.

The final marine journey passes 28 actual-game checks, including four region
visits with the same renderer resource counts on return and zero released-region
asset leases. Full source chain: 2,356 tests pass. Images and scope are in the
coherence ledger. Other fish remain generated visuals; whales, dolphins, deep
squid, global ocean streaming, terrain/farms and remaining careers are not done.
Continue H10–H12's real Sol/Moon journey and the remaining finite gates. Production,
dist and all four retained packages remain unchanged.

## October 10 previous local continuation — mission and water custody

Space scans now cancel when eligibility changes; old callbacks cannot award a
new mission. Resuming an earlier mission is explicit. Corrupt/future mission
saves and stale writers are protected. The scan visual stays on the planet
instead of expanding into an obscuring wireframe. The Proxima thermal journey
passes five actual-game checks through the physical Analysis Lab; this is not
H10–H12 completion.

Coastal water context now survives deployment, save, recovery and redeployment,
and drives the underwater population and wave profile. Geographic depth retains
its sample origin: moving the vessel requires fresh depth rather than reusing
the previous location's value. The final marine journey passes 26 actual-game
checks, including moved-vessel outage recovery and successful retry. Full source
chain passes 2,352 tests. Receipts and scope are in the coherence/delivery ledgers.

Production, dist and four retained packages remain unchanged. Continue licensed
fauna visual integration and the remaining finite gates; the full roadmap is
not complete. A compatible possession-v3/voyage-v2 fallback is still required.

## October 10 previous local continuation — ecology and native ocean depth

Marine fish authority v3 now uses coarse reviewed geographic ranges and explicit
water-column/habitat rules. Fish stay within the shared water volume and avoid
terrain/hulls; region rebuilds replace the population and dispose shared assets
once. The final reef/region journey passes 15 controlled actual-game checks,
including four region visits with a 47-geometry / 41-texture plateau.

New geographic voyages use saved format-2 metre-scale depths. Version-1 voyages
and the authored Coral Shelf preserve their layout. Submarine hull terrain checks
reject rising ground without snapping upward. Native depth/custody acceptance
passes 23 actual-game checks, including deep controls, diver refusal, outage,
reload, recovery and redeployment of the same vessel/sub/profile. Source chain:
2,343 passing tests. Exact receipts, earlier verifier failures and limits are in
`docs/design/WORLD-COHERENCE-DELIVERY.md`.

This remains a bounded ocean outing, with coarse depth data, generic fish visuals,
no completed global ocean streaming, seasonal ecology or pressure simulation.
Creative terrain/farming, H10–H12, broader careers/CERN and realism remain open.
The compatible fallback must preserve both possession v3 and voyage format 2.
Production, local dist and four retained packages are unchanged. Continue the
mission lifecycle audit and remaining gates; do not call the full roadmap done.

## October 10 previous continuation — coherent marine and saved worlds

The owner’s expanded marine/creative/farming requirements are integrated in
`docs/design/WORLD-COHERENCE-DELIVERY.md`. Vessel entry and motion share hull-fit
admission; deployed equipment follows vessel capability. Research scuba uses a
40 m game-depth profile. The same-sub reboarding/drive/recovery journey passes
13 actual-game checks; the final northern coastal investigation passes 14.
Creative storage passes seven browser checks including capacity, stale writers,
failed writes and reload; no existing area is silently pruned. These are local,
controlled-provider checks, not global-ocean or release certification.

The final source chain passes 2,331 tests and the new 1,008-file unresolved-name
gate. It caught a missing building-ground area helper; the existing geometry
owner now supplies it. The first final chain caught a duplicate query-version
import, corrected before the passing rerun. Production and retained artifacts
remain unchanged. Next: regional ecology/placement, the documented geographic
depth mismatch, continuous ocean and remaining career/creative/realism gates.

## October 10 previous continuation — coastal investigation

H07–H09 now implement physical geometry sonar, three eligible diver choices,
partial recovery, normal same-submarine return, supported wet-lab interpretation,
Diver / Coastal Explorer badges, repeatable Coastal watch and home-desk display.
The case, northern reef and rock journeys pass 12, 14 and 13 controlled actual-game
checks respectively. Home display passes seven DOM/WebGL/storage cases; habitat
lifecycle passes seven. Phone images exposed and verified a corrected portrait
camera offset and compact, resource-first diver controls. These are local checks,
not a physical-phone or complete release certification.

The authored seabed now uses the same geographic study frame as its reef objects,
including alternate launches. Survey scuba reuses the existing water controller;
ordinary swimming rules are preserved. No additional scene or storage owner was
introduced. The final write/boarding-race repair has model evidence after those
world runs. Full detail and exact receipts are in the delivery ledger.

Continue with H10–H12, the remaining careers/mining/CERN, repeatable/GPS/connected
work, fleet/realism and release/media gates. The compatible possession fallback
and actual candidate/fallback roundtrip remain release prerequisites. Production,
local dist and the four retained packages are unchanged.

## October 10 previous local continuation — Harbor and Coastal Departure

H02 now grants the licensed BMW's slate body finish once, with a separate
observed-driving distinction. H06 uses the licensed OSU RCRV educational model,
actual working-deck/stair collision, a science-van lab, a loaded submarine cradle
and a correctly placed water-return ladder. The older procedural research visual
and invisible flat deck are removed. Both chart choices complete through the
existing Journal/voyage owners, including saving/reloading, failed-write retry,
a dated bundled-depth fallback and recovery to the same ship/submarine.

The primary full-game coastal journey passes twelve checks; the northern route
passes seven including real boat-controller stepping; the final coastal DOM,
IndexedDB and prescribed-client check passes five. Eleven vessel and eleven diver
browser checks also pass. Harbor's finish has six controlled browser/storage
checks and its city journey has seventeen. Images were inspected; these are
local/controlled source checks, not physical-device or production certification.
The full source chain passes 2,308 tests plus identity, ownership, boundary type,
inventory and sensitivity checks. The final session-only UI disclosure has its
subsequent five-case browser/client pass.
Exact receipts and limits: `docs/design/EXPLORER-CAREER-DELIVERY.md`, ignored
`output/roadmap-20261010/`. The live build and all four retained packages remain
unchanged. No frontend build, GitHub push or deployment was made for this work.

The full roadmap remains open beyond H09: H10–H12, broader specialist/mining/CERN
campaigns, repeatable/GPS/connected work, the remaining fleet, realism gates and
release/media acceptance. The compatible v3 possession/commerce/workspace
fallback and actual candidate/fallback roundtrip are still release prerequisites.
No unfinished later mission buttons have been added.

## October 8 public gallery and local visual work

PR 98 is merged to stable `33edf9ad5074fbaf0f7298396f180c37a0bf9735`.
The README, 5.5 release notes and GitHub Pages use the refreshed released-build
gallery, with public Play/release/WebGL/license badges. All twelve served Pages
images match the reviewed hashes; live README/release text and Pages HTML match
source. Six desktop/tablet/phone layout checks and all GitHub workflows pass.
The root landing-page refresh is committed but has not been deployed to Firebase.
The production game remains the d877 build identified above.

Local visual work is on `steven/visual-quality`: display output and nighttime
readability, the author's white E34 finish, and the licensed Atlantic Explorer
submarine. The submarine retains its author materials, uses an 8.6 MB bundled
asset, and has cancellable shared-model leases and measured vertical clearance.
Its 38 focused component checks, prescribed model-view client, eleven controlled
Ocean browser cases, source syntax, ownership and boundary types pass. Front and
rear model views were inspected; the rear also has glazing, and actual camera
coordinates confirm the correct following side. This is local evidence, not a
full release or live-provider acceptance. The retained surface boat owns one
legitimate docked-model lease after underwater teardown.

The licensed research-vessel and sailing-boat candidates are retained for further
integration. Replacement research-deck navigation, other fleet/ship asset work,
and the final video/media package remain unfinished. Do not describe the twelve
released-build gallery images as proof that those unreleased upgrades are live.

## October 9 analytics and first-session work — local

The audience audit led to readiness/foreground gameplay measurement, explicit
launch outcomes and duration, first-action/five-minute milestones, bounded
campaign handoff and tab-scoped owner-test marking. An optional guided Baltimore
walk and Return to last place use the existing tutorial, location save and Journal.
Completed tutorial steps no longer wait for the ambient-notification cooldown.
Landing copy now explains the browser sandbox and device/loading expectations;
the gallery continues to show the released 5.5 game.

The controlled ten-check first-session/save/return journey passes against staging
services. Real Firebase SDK request formation passes with a local collector,
including failure before gameplay initialization. Desktop/touch-sized tutorial
controller and six public-page layouts pass. Two prescribed keyboard runs reach
walking but retain external Overpass CORS errors and stop after their first burst;
these are degraded provider runs, not clean end-to-end passes. Screenshots were
inspected. The final source chain passes all 2,207 tests, module ownership,
boundary types, inventory and sensitivity checks. Limited analytics clears the
bounded campaign cache; its regression check passes.

The production GA property now has two gameplay key events (once per session,
no monetary value), six event dimensions and a millisecond launch-duration
metric. The existing internal-traffic filter remains in Testing. The saved
Exclude marked tests comparison retains unmarked historical traffic; new marked
traffic exclusion still needs post-release verification. Search Console's
URL-prefix property exists but is unverified; its public verification tag is
prepared in the local homepage. GA ingestion, Search Console verification and a
complete seven-day return cohort require the frontend release and subsequent
observation. Do not infer improved retention from registration alone.

The broader source review also aligned the local submarine import with the shared
asset-loader module version and registered its previously omitted component test.
Production/dist and four release packages are unchanged. No promotional posts or
finished video exports were produced. Private audit data and the small promotion
kit are under ignored `output/analytics-review-20261009/`; only the public event
contract belongs in `docs/analytics/README.md`.

## October 9 Explorer career plan and First Bearings — local

`docs/design/EXPLORER-CAREER-PLAN.md` specifies twelve authored missions, three
optional careers, useful homes, coastal/planetary chapters, GPS/live-data variants,
rewards, save/authority rules and finite acceptance gates. The plan preserves
free exploration and existing progress. Later chapters are planned, not shipped.

The first opening chapter is implemented in Today, Journal and Profile. Explicit
acceptance selects a region; a new committed field record advances it; reviewing
that exact record grants one personal badge and Journal completion receipt in a
single transaction. No extra currency, reward store or always-open overlay was
added. Indexed retrieval retains the result beyond the recent Journal page;
backup validation rejects missing evidence/receipts. Newer campaign state is
preserved without downgrade. Missing fresh field leads suppress the start offer.

The full source chain passes 2,218 tests. Fifteen focused cases and fifteen actual
IndexedDB transaction cases pass, including failed saves, concurrent completion
and backup restore. The controlled world journey passes thirteen checks, including
historical-record review and reload. Visual inspection corrected the phone
completion-button grid placement. The final direct badge shortcut and full
thirteen-check journey pass with no captured page errors or failed local resources.
These are controlled desktop/phone-width checks, not an uncoached player study
or physical-phone acceptance.
The prescribed keyboard run reaches walking but stops after one burst on the
existing external Overpass CORS failure; this remains degraded provider evidence.
Production/dist and the four retained release packages remain unchanged.

## October 10 — Harbor Run and realism architecture, local

The next personal career job now supports choosing an admitted Baltimore road
route, loading a licensed physical field case from a stopped car, driving its
ordered gates, stopping to unload and retaining one Harbor Driver badge/receipt.
Surface and clearance admission use existing road/terrain/collision owners.
The job adds no currency, timer, duplicate road geometry or always-open HUD.
Live GPS pauses the virtual job; interrupted travel retains cargo and requires
resuming the last confirmed route point. Failed writes pause automatic retries.
Stale UI reads resolve against current storage; deliberate backup restores still
recover the older job and physical case. Scene/collider/model leases are released.

The controlled world journey passes 16 checks, including the first chapter,
delivery, badge, reload, building/undo, room, property and Flower Sprint. It uses
keyboard input initially and explicit actor-stepping for full route coverage;
it is not a complete manual drive. Nineteen actual IndexedDB cases and the final
eight-case DOM/GLTF runtime check pass, including concurrent unload, injected
save/read failures, deliberate restore and teardown. Coverage remains 49,023 buildings
and 18,952 roads. Desktop/phone-width images were inspected. The separate
prescribed world keyboard client retains its external Overpass CORS failure;
it reached walking and one captured burst, not a clean live-provider pass.

`docs/design/WORLD-REALISM-ARCHITECTURE.md` defines five finite visual gates:
calibration, common materials/lighting, a complete street plus streamed neighbor,
marine/space integration, and measured quality/streaming tiers. It records actual
material/resource evidence and current primary-source research. No claim of
spare GPU memory, universal hyperrealism or completed art work follows from it.
The first implemented correction centralizes display color across all renderer
constructors, repairing missing Space output and the ineffective legacy AR setting.
Scene lighting, tone mapping/exposure and the existing composer output pass are
preserved. Twenty-eight direct/auxiliary and 24 direct/composer pixel comparisons
pass. Actual Space scene and day/night/storm player-asset images were inspected;
the prescribed asset-fixture client completes both movement bursts without errors.
These are bounded rendering checks, not physical AR-device acceptance.

The final source chain passes 2,234 tests, dependency/module ownership, boundary
types, inventory and sensitivity checks after the recovery refinements.

H03/H04, the proposed additional H02 cosmetic/mastery reward, later chapters,
research vessel/fleet/ship replacements, full visual gates and final media remain
open. There are no placeholder mission/reward buttons for them. Full-step
acceptance and evidence limits are in `docs/design/EXPLORER-CAREER-DELIVERY.md`.
On October 10 production still matches the local d877 manifest; explicit project
`worldexplorer3d-d9b83` reports 80 Functions. Production, dist, player data and the
four retained builds are unchanged. Evidence is under ignored
`output/harbor-realism-20261009/`; no push or deployment occurred.

## Historical preparation records

The dated records below describe earlier candidates and checks. Statements that
production or publication was pending are historical; the current release above
is authoritative.

## October 8 regional-arrival repair

The owner reports empty scenery after flying to 39.4347, -76.6912. Source tracing
found that the far terrain/building region was created around the starting point
and never followed the active Earth actor. The working change replaces that one
regional publication as travel advances; the original detailed district stays
owned by its existing location systems. Settings can retain the fixed view.
Failed or incomplete provider data must keep the last complete publication.
Regional facade colors now use the existing building exterior catalog; supported
low residential roof metadata can produce a batched gabled silhouette.

Controlled installed-Chrome checks reproduce 371 nearby regional instances before
arrival and 751 after replacement, with all 48,296 original detailed buildings
retained and 18 terrain-group children before/after return. The corrected failed
provider test verifies that the previous group remains published. Recovery and return pass with 187/187 old instance batches disposed and exactly
38,804,284 regional buffer bytes restored. Four prescribed keyboard-flight bursts
pass across a refresh boundary with no errors. The final source chain passes
2,158 tests. The same journey passes on the clean immutable package, including menu choices
before lazy Earth startup and preference restoration after reload. All 29 normal
packaged-world checks pass, and both hosted manifests match local bytes. The new
preview is deployed. Ordinary hosted Chrome could not be rechecked because the
Mac was locked; its earlier startup result below belongs to 016537ce.
One release-wrapper run incorrectly selected that older dist and was stopped.
The repository journey now rejects packages without the scenery scheduler.
An additional prescribed downtown startup exceeded its 180-second wait before
flight; its owned browser needed forced cleanup. The successful regional-flight
run uses the owner-reported starting point and less frequent, cheaper readiness
inspection. That does not certify the downtown startup timeout as resolved.

This extends regional scenery, not detailed streets, interiors, activities or
unrestricted worldwide simulation. Public capability/limitation text says so.

## Build identities

### October 8 sidewalk ownership correction

The owner's Light Street report was reproduced in the current source scene.
The shared pavement compiler now reconciles mapped pedestrian paths with inferred
roadside sidewalks, preserves mapped plazas and their materials, and stops
building adjacency from authorizing unsupported 24-metre infill. Mapped-area
walking contact uses the existing pavement index. The final fallback capture
retains the baseline 18,912 roads, 44,090 buildings and 426 road meshes. The
road-width inference experiment was removed; no transport width/profile change
is part of the repair. Generalized road widths and terrain material detail remain
approximate. See `docs/streets/SIDEWALK-OWNERSHIP-2026-10-08.md` for the evidence
ledger, rejected experiments and the deliberate correction of older tests.

The complete source chain passes 2,170 tests, dependencies, ownership, types,
inventory and sensitivity. Captured Baltimore/Monaco/San Francisco pavement
packaging checks pass with zero area beyond rounding allowances; all six hill
quality cases pass. Both prescribed movement bursts pass with no reported game
or provider errors, and images were inspected. One earlier run completed its
actions but its Node process retained service connections after browser cleanup;
the isolated verifier now explicitly exits after successful browser closure.
The final run completed normally. Baltimore bridge checks pass (742 joins, zero
discontinuities); the Monaco entrance-to-exit tunnel drive passes all six checks,
with images inspected. The immutable package reproduces the repaired fallback
scene with identical coverage and no runtime errors; its compiler cache is
6,915,376 bytes. All 29 normal packaged-world checks pass with zero discontinuities
across 741 joins. The preview is deployed and both hosted manifests match local
bytes. Ordinary hosted Chrome could not be rerun because the Mac is locked.
Production remains unchanged; full release acceptance remains open.

| Surface | Current identity |
| --- | --- |
| Production | `5.4.0+1532bdfbb5c1.319d215f60318297.production` |
| Hosted preview and local dist | `5.5.0+e5dadb078ee4.921fdb6e4e4a7a21.staging` |
| Hosted candidate source | `e5dadb078ee4de769afa630a93eb924fc30308a4` |

Current sidewalk package evidence is under `output/verification/sidewalk-packaged`.
Build manifest SHA256: `017063cf545625da52e895bd15820dba2ab47e30233dd0846e3c4d9af3c2db9d`.
Asset manifest SHA256: `017ed7c05821768c5d7c5cdf34ae00214bb7ea5793d7019d546886e150d93939`.
Preview channel `visual-review-1005` is renewed through October 15. The previous
4413d5d9 package was preserved before building; only the verified superseded
016537ce generated package was pruned, with its manifests and receipt retained.

Previous regional-arrival evidence (not a rerun on the sidewalk package):

The 4413d5d9 regional-arrival package passes all 29 normal packaged-world checks
with no browser errors, zero discontinuities across 741 joins, and retained
coverage of 49,023 buildings, 18,952 roads, 111 land-use areas and 49 terrain tiles.
The source chain passes 2,158 tests and checks. Its added packaged regional journey
passes arrival, return, failed-provider retention, recovery, GPU retirement, and
menu/reload settings persistence. Both hosted manifests match local bytes.
Production remains unchanged. Build manifest SHA256:
`f2c34c23177d244806348dfa106c76fab912f06d01e45305c8c6500afad25a79`.
Asset manifest SHA256:
`1c98a8dd4ce34249cec3265f5c636190caaa751ac29c85ec0c58607234c0e4fd`.
The preview channel is `visual-review-1005` on `we3d-staging-20260712`, renewed
through October 15. Evidence is under `output/verification/regional-scenery-journey`
(package and hosted receipt), `regional-scenery-source-evidence` (earlier source),
and `regional-flight-actions-checked` (prescribed flight inputs). The final ordinary
Chrome check could not run because the Mac was locked. No successful ordinary
Chrome startup or gameplay is claimed for 4413d5d9.

`release-scope --require-ready` rejects production promotion: current full
candidate/backend execution evidence is absent and external acceptance receipts
are pending or tied to older artifacts. No guard was bypassed, no physical-device
result was invented, and stable/Pages/v5.5.0 remain unpromoted. The previously
failing broad release gates still require a complete matching run and review.

The current dist, compatible 37a fallback, production and unique 0e snapshot must
be preserved. Old generated packages were removed only after pushed ancestry and
payload verification, with manifests, receipts and test evidence retained. The
owner-tested 4dd2 runtime was byte-identical to the earlier 135/316 preview.

The owner has limited the final feature addition to loading presentation. Source
now has a pipeline-driven progress bar, a longer-load note, twelve browsable
feature/tutorial cards, reduced-motion behavior and friendly startup recovery.
The initial source suite passed 2,141 tests. Desktop and 360px phone layouts,
all card widths, keyboard/modal focus, short-screen scrolling and actual bootstrap
failure/reload pass. A prescribed real Baltimore launch records monotonic 3–99%
progress and automatic card rotation across 71.6 seconds, then hides the overlay
and passes both driving bursts. No game errors; optional external Overpass CORS
errors are retained separately. Images were inspected. The final phone-sized launch also passes, showing road, flight and ocean cards before play; its 27.5-second result is browser emulation, not a physical-phone measurement. All final source checks pass 2,141 tests. The dfa29bb immutable preview passed its 29-check preflight and is hosted. The owner subsequently rejected the large rounded card. A compact bottom panel now uses the real app theme, Inter/Orbitron, blue accents and small corners, with concise activity headings. All five component browser groups and 16 focused loading/lifecycle checks pass. The fixture includes the real theme/fonts; reviewed images fit desktop, phone and short landscape. The prescribed actual launch also passes: 88.3 seconds, monotonic 3–99% progress, six cards, overlay dismissal, both driving bursts and no runtime errors. Optional Overpass CORS is retained separately. Images were inspected. The replacement 7099ad4c preview passes all 29 packaged-world checks and is hosted. Both manifests match local bytes; production remains unchanged. The PR and v5.5.0 draft release are updated, including loading tips and immutable public image/document links.
This is loading-UI evidence, not a performance or full-release acceptance claim.

An ordinary Chrome launch on dfa29bb rejected Baltimore transport publication
with a terrain-snapshot parity error after provider fallback, with an adaptive
budget of 3,471 roads. A same-coordinate controlled source diagnostic with
Overpass unavailable loaded successfully, with zero differences across 258
terrain probes and 19,168 roads. Different adaptive workloads prevent treating
this as either a reproduced defect or a proven test-only issue. No road or terrain
patch was made from that result. Preserve prior repairs and evidence; compare the
exact build, browser, settings, provider responses and budget before revisiting
runtime authority. This remains separate from loading-presentation acceptance.

The owner now reports a blank Chrome page before entering the world. Ordinary
Chrome on this Mac opened 7099ad4c twice; normal unsigned search and Baltimore
entry completed, so the device-specific cause is not yet identified. A controlled
Chrome test reproduced a concrete startup gap: blocking only bootstrap.js left
no visible menu, progress or retry action. Initial loading markup now lives in
HTML, independent of the module graph; critical-script errors and boot failures
show recovery, slow startup offers reload, and readiness hands off without hiding
a direct world load. Bootstrap waits for shell controls before binding runtime UI.
Six lifecycle regressions and ten existing checks pass, along with four Chrome
failure/slow/disabled-JavaScript groups and all five themed layout/control groups.
The prescribed source journey confirms visible startup → menu → world loading →
play, monotonic progress and both movement bursts, with no runtime or browser
errors. Screenshots were inspected. The full source chain passes 2,147 tests;
all four failure/slow/disabled-JavaScript groups also pass against the immutable
package. Its 29-check world preflight passes, and the replacement preview is
hosted with independently matched manifest bytes. Final ordinary Chrome startup
reaches the globe and menu without warnings/errors. PR 96 and v5.5.0 remain drafts.
This fixes the reproduced failure behavior; it does not establish the owner's
exact cause or resolve the separate terrain/performance gates.

Current startup evidence: `output/verification/chrome-startup-55` (before, source,
packaged and hosted identities), `chrome-startup-gameplay-55` (prescribed real
startup/menu/world/driving), and `loading-startup-recovery-55` (themed layouts).
The 016537ce package is now retained; 7099 was pruned after payload/hash and
pushed-ancestry verification. Earlier, the superseded dfa generated package was
pruned only after hash and pushed-ancestry verification, retaining its manifests
and receipts. No player data, source/history or ordinary Chrome profile was removed.

## Completed verification and repairs

The frozen 4dd2 source chain passes **2,109 tests**, dependency/source/ownership/type
checks, inventory and sensitivity checks. Its GitHub PR and secret scanning pass.
Additional repairs described below pass the full source checks; their updated
immutable package and release checks remain pending.
The targeted dependency audits report no known vulnerabilities.

The owner's road/secondary-sidewalk correction is being verified locally.
Depressed engineered approaches no longer pull down neighboring street terrain;
missing interior crossings in generalized map data share a surface elevation.
Mapped paved footways now join the detailed pavement owner, while park paths,
trails, structures and explicit unpaved surfaces retain their intended coverage.
Fallback paved paths use the same concrete pattern and scale during loading.
Retaining wall tops now respect an overlying road/bridge, with the visible and
collision geometry sharing that boundary. Compiled structure collisions use a
0.02 world-unit vertical margin instead of the approximate-building 0.45 margin.

The complete source suite passes **2,134 tests**, inventory and sensitivity after
the wall/material additions. The focused wall/tunnel/collision and
pavement/publication/ownership checks also pass. Manhattan keyboard driving passes both ways
across West 33rd Street and the West 35th Street bridge, plus the lower tunnel
exit. Actual walking on a formerly coarse generic footway passes with detailed
pavement contact and no duplicate ribbon contact. Images were inspected. Earlier
failed runs are preserved; the first bridge drive uncovered the retaining-wall
collision defect. Both prescribed Baltimore movement bursts pass after configuring
the verifier's live staging services; images were inspected, with no game errors.
Optional external Overpass CORS failures are recorded separately. This diagnostic
used a longer readiness wait after the original 90-second cold-start failure;
that failure remains open, not converted into a loading/performance pass. The final Manhattan material capture completed without page errors and all
three images were inspected. Near pavement took 23.35 seconds to build and
30.3 seconds from the arrival capture to acceptance, following an earlier
41-second build. These variable source diagnostics do not establish release
loading/performance acceptance. The first updated package (`00c56b56`) failed its world preflight before any
preview deployment: 28 checks passed, but nine Baltimore joins had height gaps.
A diagnostic identified auxiliary terrain stations replacing exact junction
stations by 4.9–5.0 mm, which made a feasible 8.5% grade appear infeasible. Exact
transport stations now take priority over nearby ordinary/obstruction samples.
The regression failed before the repair; all 22 focused tests now pass. Actual
Baltimore movement then passes with zero discontinuities across 741 joins,
49,023 buildings, 18,952 roads and no game errors. Both screenshots were inspected.
The complete source chain now passes 2,134 tests. The replacement 61cc package passes its normal 29-check preflight and is hosted; neither failed run was relabeled passing.

The first complete candidate matrix on the previous `1033fb88` package finished
61 passes and 30 failures. Twenty-one later checks stopped before gameplay when
a disposable staging test credential expired. Those results are preserved under
`output/release-evidence/history/candidate-1033-20261007`; they are not passes for
this candidate. The private wrapper now renews and cleans up its staging identities.

Real geometry queries identified three Monaco junctions removed by tunnel
excavation. Full surface-carriageway roof constraints now participate in the
existing graph/grade solver. The source Monaco check reports zero junction gaps
and zero discontinuities across 1,216 sampled joins. Real keyboard tunnel
approach, bore and exit pass six checks. Terrain and retaining edges still need
visual polish; functional passage is not final art acceptance.

On the retained previous package, corrected marine research (eight cases),
habitat (seven cases), real Earth/ship/lift/exit and prescribed Moon movement/pause
checks pass. Screenshots were inspected. A prescribed Monaco source run recorded
external Overpass and imagery CORS failures; it is retained as failed evidence.
The public Pages layout passes desktop and phone-width overflow/image checks.

The aircraft client now permits gateway startup within a 20-second envelope;
the IPv4 upstream has one absolute nine-second deadline through connection and
body delivery. Focused provider tests pass. Staging `getAircraftStates` version 6
is ACTIVE. Production now has aircraft version 5, place lookup version 1 and
environmental data version 1 ACTIVE. All 11 existing deployment parameters are
preserved. A downloaded-source audit then found the other 77 Functions still
used older packages. All 77 are now updated, and all 80 deployed source archives
match the 36 tracked backend code/configuration files. The protected endpoints reject
missing App Check with 401, and a live bounded aircraft query returned 200 in
1,005 ms. The public frontend remains on 5.4. Firestore now admits the tested ocean
presence values; Storage rules are unchanged. Actual production protocol tests
pass for marine authority, condition-save retry/legacy compatibility, discovery
receipts and account isolation. All three temporary accounts and owned fixture
documents were removed and their absence verified. Two deployment IAM lookup
errors were reconciled against live ACTIVE versions and matching permissions;
no permission change or whole-rollout retry was needed.

The current preview was deployed after its packaged-world preflight passed all
29 checks with no browser errors or failed local resources. Hosted manifests
confirm the preview identity above and unchanged production. The rollback
verifier now streams large Git blobs and awaits the visible Start control.
Large-asset corruption regression and all 160 reviewed file pairs pass.

## Remaining release work

Staging alignment is complete: all 80 Functions are ACTIVE, their downloaded
archives match all 36 tracked backend files, and the current preview origin is
allowed. The other ten parameters and all existing origins are preserved. Shared
expedition, environmental data and condition-save preflights each return 204 with
the exact preview origin. The temporary parameter file was removed. The complete ordinary hosted journey remains necessary; source equality and CORS are not that acceptance.
An ordinary hosted Chrome probe signed in successfully but live search failed
with 401. A separate read-only probe observed reCAPTCHA requests returning 200
and the actual App Check token exchange returning 403, `App attestation failed`.
Project/app/site-key alignment and browser-key API permissions were checked;
the cause of the rejected attestation is not established. Debug-attested browser
checks are not ordinary-browser acceptance. No protection was disabled. The
temporary test account and owned records were deleted and absence verified. Subsequently, the owner’s ordinary installed Chrome (without debug attestation) successfully searched Baltimore on the 61cc preview and displayed three real place results. That unsigned search is verified; the prior automation attestation failure and remaining ordinary journeys are not reclassified.

Live providers passed on the identical `316` game payload. Seven sustained
movement windows completed: five fail the hitch limits, with worst observed
walking/drive frames of 583.2/366.6 ms. The cleanup sequence was stopped after six
reported reload cycles when disk availability fell to 541 MiB; remaining cleanup
and mobile checks are incomplete. Obsolete private heap captures and inactive
test-browser data were then removed at the owner's request, recovering about
3.8 GiB; pruning old staging packages recovered additional space. Compact
diagnostic reports and analysis scripts were preserved. No threshold was relaxed.

The packaged save upgrade → fallback write → candidate return journey
passed on the current 4dd2 package, retaining 64 seeded items, existing and new records, equipment controls
and unrelated pending account data. No browser errors or failed local requests
were recorded.
The current 4dd2 backend matrix passes all three gates: the general backend
suite (14 stages), place authority, and shared marine. The latter passes all
12 two-client journey cases and three rules cases. Two verifier races were
corrected: temporary network backpressure and waiting for the server's stopped
pose before recording a study. Runtime ownership rules are unchanged.
The owner reports the current preview works on Android. This is a smoke check,
not measured device/thermal or iOS acceptance. The full frozen 91-gate candidate
run completed: **83 passes and eight failures**. Reports and its log are preserved
in `output/release-evidence/history/candidate-4dd2-20261008`. All 12 reload cycles
completed, and retention, cleanup, coverage, transfer, storage and phone-size
regression checks pass. Desktop frame timing and mode activation fail.

The other failed gates are resource ceilings, normal/fallback Manhattan road
coverage, actor-proxy teardown, optional-provider CORS classification, Logan
recorded-fixture delivery and an expected Ocean request cancellation. Local
verifier fixes have focused tests passing. The complete urban sandbox rerun now
passes all 15 checks, including vehicle/equipment and police/medical recovery.
The other repaired browser gates still need reruns.
The actual Manhattan gap was caused by terrain-only portal placement cutting
through a protected overhead road. The local model now preserves feasible road
roof intervals without changing driving grades. Twenty-four targeted tunnel
tests pass; the actual source scene has zero junction gaps, and keyboard driving
passes both directions across the repaired junction. Images were inspected.
Surrounding terrain and street detail remain visually rough. This is not final
art or a new packaged-candidate acceptance.

Renderer and portal allocation experiments are separate from the shipped build.
The uniform-cache draft preserved pixels/uploads but increased allocations in
the actual four-window movement comparison, so it was rejected and remains
unapplied. The portal fast path preserves exact geometry in 600 randomized
comparisons and reduces synthetic allocations. It is now local, with ten focused
geometry tests passing; actual gameplay performance still needs remeasurement. The current save roundtrip and public weather/marine rights,
deployed-source and packaged-attribution review pass. Ordinary hosted, named
physical-device and uncoached-player acceptance remain unverified. The old resource baseline covers 25,529 Baltimore
buildings; restored coverage retains 49,023. No coverage was removed. A separately captured current Earth baseline retains
49,748 buildings and 375,726,562 geometry bytes, versus 25,529 buildings and
232,692,742 bytes in the old declared baseline. The documented Earth ceilings
are now 400 MiB of source geometry, 60,000 buildings and 12,000 structures.
Other resource, timing, retention and coverage limits remain unchanged; the
new policy still needs a fresh browser gate and is not a physical-phone claim.

PR [96](https://github.com/RRG314/WorldExplorer3D/pull/96) and release `v5.5.0` are
drafts. Stable, public Pages and production have not been promoted. The updated
preview is available at `https://we3d-staging-20260712--visual-review-1005-e5075bnu.web.app`.
The supporting production provider rollout is complete; frontend promotion is pending.

The licensed replacement research vessel, broader ocean wildlife/activities,
spearfishing and worldwide streaming are **not implemented by this release**.
Earth remains bounded and location based. See [known issues](KNOWN_ISSUES.md),
[release preparation](docs/release-review/2026-10-07/RELEASE-PREPARATION.md), and
[release identities](docs/RELEASE_SOURCE_OF_TRUTH.md). Earlier investigations remain
in Git history, their dated evidence folders and `progress.md`.

Private cloud configuration and credentials remain outside the repository under
`~/Library/Application Support/WorldExplorer3D/verification-private`. Never print
raw configuration or credential files, and never attach them to release material.

Four provider-cache field policies were applied without changing the 11 existing
composite indexes or 19 unrelated field policies. Both expiration policies are ACTIVE as of 22:06 UTC. Only generated provider
caches are affected. The exact live 5.4 frontend was independently matched by
Hosting version and both manifest bytes; its preserved `release-54-1532` channel
now expires November 6 at 22:26:58 UTC. This exact-live copy is separate from the
reviewed save-compatible 37a fallback.

Chrome startup repair: complete source verification passes 2,147 tests plus dependency, ownership, type, inventory and sensitivity checks. Packaging and preview verification follow.


## October 10 — Three Views and recovery checkpoint, local

The photography branch now captures the actual rendered city, enforces three
visible/distinct viewpoints, offers honest observation-only play, and saves one
album/badge/receipt. It includes bounded image storage, export/delete, backup
validation and a personal home-display implementation. Images are separate from
ordinary profile metadata in the existing IndexedDB v5 database. Character
migration rollback now preserves later campaign progress; failed primary-home
selection leaves the previous saved home intact.

Full source verification passes **2,243 tests** and the source/ownership/type/
inventory/sensitivity chain. Twenty-four actual IndexedDB cases, fifteen
controlled city cases and twelve WebGL/DOM camera-home cases pass. Actual city
images and desktop/phone layouts were inspected. The prescribed action client
passes with composed browser screenshots; its generic delayed canvas screenshot
read a cleared drawing buffer, which was a verification-method issue. Home
placement/cleanup is component evidence, not a full furnished-home ownership and
return journey. The source, storage and component refinements follow the city run.

The full campaign is **not finished**. H02 cosmetic/mastery, H04 arrangements,
H05 starter homes and later ocean/space/GPS/co-op phases remain open, followed by
the realism delivery gates. The housing audit found separate unchecked local
home/Backpack item writes; resolve that ownership/recovery problem before H05
storage acceptance. City capture also shows that landmark semantics and generic
facades still need the R2 visual/data treatment; a higher-resolution texture alone
will not correct them. See `docs/design/EXPLORER-CAREER-DELIVERY.md` for bounded
acceptance and the remaining work. No deployment or public release change.

## October 10 — research introductions, home custody and CERN reuse

First Bearings now saves an optional research method and starts the matching
available field lead/tool from its existing Today panel. Wrong-method records
cannot complete the assignment. Observation research continues into regional
survey goals without a mandatory specimen collection. The obsolete center-screen
exploration popup was removed after it obscured the desktop/phone mission choices.
This is the introductory chapter; the complete mining, scientific and other
career campaigns are specified in `docs/design/RESEARCH-CAREERS-AND-CERN.md` and
remain unfinished.

Home contents and carried possessions now use a single v3 local save transaction,
with an exclusive page writer, failed-write recovery, custody-aware Journal
projection and retained legacy files. Four real browser custody/lock/reload checks
and the 50,008-item Backpack presentation check pass. An additional source guard
prevents replacing a read-only inventory. Local home/wallet economic transactions,
connected storage and the complete H05 furnished-home/return journey still need
work. Released v2 fallback artifacts retain a separate older save branch: they
are **not compatible current-progress fallbacks** for v3. Prepare and verify a v3
fallback before releasing this migration; never delete the retained old saves.

The final controlled research/photo/build/return journey passes 16 checks without
page errors or failed local resources. An earlier return load timed out; the
isolated return probe and the later full journey passed, but the initial timeout
remains an unresolved loading/performance observation. The prescribed keyboard
client reached walking and captured its first burst, then correctly failed on
external Overpass CORS errors. It is degraded-provider evidence, not a clean
release pass. Desktop/phone images and the keyboard image were inspected.

The owner's existing `lhc game` / Collision Lab project was inspected in place,
without modifying its source or notebooks. Ten direct reuse checks verify its
numerical exercises, all 100,000 recorded events, reproducible analysis receipts
and all 18 detector files. The actual source browser opened tunnel/apparatus/CMS
views and fit the phone layout. Those four alternative scene groups are not a
connected walkable facility. CERN still needs site layout, circulation/collision,
asset upgrades, station interactions and integration with World Explorer's
renderer and Journal. No new playable CERN/mining button or duplicate engine was
added. Detailed scope/evidence: `docs/design/EXPLORER-CAREER-DELIVERY.md` and ignored
`output/production-readiness-20261010/`.

Production identity and 80 live Functions were checked read-only this turn.
Production, dist, retained packages and owner saves remain unchanged. This local
work does not close the campaign, visual-quality or release gates.

The final source chain after the possession replacement guard passes **2,260
tests**, zero failed, plus dependencies/source/ownership/boundary types and test
inventory/sensitivity. The world journey precedes that final denied-write guard;
its explicit preservation regression is included in this final chain.

## October 10 — personal workspace chapters and local transaction safety

Continue in the architecture-evaluation worktree on `steven/visual-quality`.
The local H04 Maker and H05 personal-home flow now works through the existing
Today panel, mapped building entry, room, Backpack, Journal and badge owners.
It includes one personal starter workspace, two licensed Poly Haven furniture
models, placement/rotation/undo with reachable circulation, a real saved record
at the desk, reusable design export/import, storage, a return destination and
leave/return completion. H01 admits a practice workspace so Maker can be the
first branch. The room's existing generic shell is still basic; this is not a
completed whole-interior art pass or a real/shared property grant.

Local wallet, stock, inventory and property purchase/sale now commit together
in the v3 possession record, retaining legacy wallet data and rejecting corrupt
or stale writers. Failed vehicle-upgrade writes cannot install an unpaid upgrade.
Local services reserve a target-specific funded receipt before effects and retain
uncertain receipts for retry. Connected transactions retain their server owners;
these local passes do not certify all connected economic flows.

The audit fixed Three r128-incompatible object removal across presentation
cleanup, cancelled/invalid player-car asset leases, low furniture incorrectly
being treated as walkable roofs, route updates reverting to building centers,
and address-object crashes in the navigation HUD. Property dependencies now enter
the new home runtime at startup without pulling account modules into ordinary
Explorer imports. Existing roof and ship walking remain covered.

Final `verify:pr` passes **2,288 tests**, zero failed, plus dependency/source,
module ownership, boundary types, inventory and sensitivity checks. Actual
IndexedDB verification passes 27 cases; workspace and photo/home display browser
checks pass 6 and 12 respectively, including the prescribed action clients. Four
possession/lock/recovery checks also pass. The final city run passes **21 checks**,
including actual keyboard contact against the desk, storage roundtrip, both new
badges, leaving/returning and layout/badge persistence after reload, plus earlier
field/Build/room/property/Flower paths. No captured page errors or failed local
resources. Actor placement is deliberate setup, not a fully walked or uncoached
route. Desktop and phone-width images were inspected. The city run precedes only
the cancelled/invalid-car lease repair, whose failure-path test and final full
source chain follow it.

Evidence: ignored `output/career-finish-20261010/`; final city `world-home-verified`,
workspace `workspace-collision-final`, photo display `camera-final`, Journal
`journal-final`, source `verify-pr-release-checkpoint.log`. Failed and interrupted
receipts remain separate, with causes/fixes in the delivery ledger. All owned
browsers and servers are closed after their checks. Retained builds, source/history,
owner player data and Collision Lab source are preserved; no deployment occurred.

The complete roadmap is still open: H02's promised finish/handling distinction,
H06–H12 and the research-vessel upgrade, expanded research/mining/CERN play,
repeatable/connected/GPS work, full realism and final release/media acceptance.
Before any release, prepare and prove a fallback preserving commerce, workspace
and visit fields as well as all v3 custody; a prior v3 build is not automatically
compatible. The earlier unexplained return-load timeout and external Overpass
CORS observation remain release observations, despite the later bounded passes.
See `docs/design/EXPLORER-CAREER-DELIVERY.md` for precise scope and evidence.


## October 11 local facility and navigation checkpoint

Active checkout remains the architecture-evaluation worktree, branch
`steven/visual-quality`; do not edit the older Documents checkout. The new
[facility ledger](docs/design/FACILITIES-AND-NAVIGATION-DELIVERY.md) extends the
world-coherence roadmap without closing unfinished stages. It documents licensed
mapped fencing with shared collision and bounded disposal, retained gates/access
paths/multipolygons, airport transfer failure handling, a vessel overview camera
fix, the interactive navigation proposal and fresh marine development images.

`verify:pr` passes **2,436 tests**, zero failures, and every source/ownership/type/
inventory/sensitivity gate. **40 bounded browser checks** pass across the actual
world-loader integration (controlled facility map), fence asset/collision, airport
dialog/navigation prototype and landing display. The actual deck → helm → cradle
→ submarine → diver capture has no page/graphics errors; its four images are
reviewed and labeled unreleased. All owned browser test processes and servers are
closed. Receipt scope and failed attempts remain in ignored
`output/facilities-20261011/`; no complete-airport or global-coverage claim.

Production checked at start: `5.5.0+d8775a392c42.88e67f97c00bb4c2.production`;
80 Functions ACTIVE. No push or deployment. OSM/Overpass returned 429/406 during
real-site attempts, which were stopped. Full terminal/cabin journeys, port
gangways/berths/artwork, real launch sites, navigation adoption, the remaining
roadmap and release/fallback acceptance are still open. Preserve current dist,
saved candidates, player state, original source and Git history.
