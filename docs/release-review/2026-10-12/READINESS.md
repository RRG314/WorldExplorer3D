# October 12 release readiness

The owner accepted the October 11 preview's appearance and asked to finish
production preparation. This ledger records the current checks; it is not a
production deployment receipt or a declaration that the entire roadmap is done.

## Baseline

- Checkout: `steven/visual-quality`, initial source `bb227354`.
- Live production: `5.5.0+d8775a392c42.88e67f97c00bb4c2.production`.
- Review package: `5.5.0+31ab54cd264b.113b39b42da96b2a.staging`, retained under
  `output/hosting-validation/streaming-reviewed`.
- Fresh safe cloud inventory: all 80 functions ACTIVE in each project.
  `getPlaceLookup` is v4 in staging and v1 in production; the ocean-address
  repair still needs coordinated production promotion.
- Production dist, four saved fallbacks, the earlier research candidate, current
  review package, source history and player data are preserved.

## Execution sequence

1. Audit and execute the complete candidate scope, distinguishing obsolete test
   assumptions from actual gameplay failures. Repair failures with regression
   coverage, without relaxing functional assertions or performance thresholds.
2. Validate backend/security and the actual retained-save upgrade/fallback path.
3. Complete ordinary hosted startup, search, sign-in, shared-voyage and recovery
   acceptance; public-data rights and endpoint attribution remain separate.
4. Bind final source, package and evidence identities. Refresh release-facing
   descriptions/captures only for the final package and disclose real limits.

## Findings and evidence

The first candidate attempt failed before retrying the deliberately rejected
world because `city-switch-lifecycle.mjs` called `getComputedStyle` on the removed
`explorationModeMsg` element. The game had correctly returned to the location
menu. The check now requires the actual retry button to be both visible and
enabled, alongside the original world cleanup, provider retirement and error
message assertions. No game behavior was changed for this test correction.

The corrected complete city-switch journey passes all 11 assertions: initial
failure/retry, invalid admission preservation, lower-quality reload, custom to
preset location, Hollywood, return, held-key suppression, saved places, frame
heartbeat, GPU health and resource/error checks. Baltimore retains 49,023
buildings and 18,952 roads at each Baltimore checkpoint. Measured JavaScript heap
is 580 MiB initially and 585 MiB on return; these checkpoints do not prove a
whole-session memory bound. Evidence:
`output/production-readiness-20261012/city-switch/report.json`.

The diagnostic 93-gate candidate sweep completed: **80 passed, 13 failed** against
the unchanged review game bytes with the corrected verifier. Failures were
runtime diagnostics, product save, planetary research, public claims, artifact
world, urban equipment, analytics lifecycle, environments, Painttown, performance,
connected journey, artifact integrity and release identity. Any final source-input identity check
must account for that verifier change through a newly built final package;
old manifests will not be relabeled as matching new inputs.

## Scope that must stay explicit

The review build adds moving Earth scenery, not worldwide physical road,
bridge/tunnel, building collision or interaction streaming. The larger geographic
cell/rebasing expansion remains unfinished. The current capability description
and setting already state this limitation. Do not call those systems complete
because the scenery-arrival checks pass.

Named physical phone and independent new-player acceptance remain unverified
under the previously documented owner release decision. A desktop viewport is
not replacement evidence. Ordinary hosted operation, source/data rights, backend
security, save recovery and final artifact integrity remain mandatory checks.

## Current repairs awaiting final verification

- Regional merged building colors use normalized bytes (same vertex coverage and
  shader values within half of one 8-bit step) to reduce actual scene geometry
  allocation. The old artifact exceeded the 400 MiB Earth ceiling by 283,394
  bytes. The fix has not yet been measured in the complete scene.
- Save fixtures now await the existing Backpack writer lease. Planetary photo
  verification uses the actual three-dimensional distance. Neither repair
  changes gameplay progression or weakens its acceptance criteria.
- The public gallery validator opens and verifies all galleries, including
  disclosure panels. Updated marine captures and their inventory remain pending.
- Candidate coverage now explicitly includes campaign branches, lunar methods
  and the local possessions/editing/facility lifecycle checks omitted by the
  previous default selection. This is expanded coverage, not completed evidence.
- An ordinary hosted UI journey was added for sign-in, private-room crew travel
  and personal recovery, with narrowly scoped disposable-account cleanup. It
  still needs execution without debug attestation or provider interception.
- The retained October 11 preview, not released Backpack v2, is the intended
  current-progress fallback. Save verification now includes the actual released
  build first, followed by candidate, compatible fallback and candidate return,
  with home storage/workspace, wallet and campaign fields checked explicitly.
- HYCOM NCSS needed a provider-wide concurrent-request reservation. The repair
  and tests are prepared; live backend verification and promotion remain pending.

The source is prepared as a **5.6.0 minor candidate**. The diagnostic sweep still
uses the prior immutable 5.5 preview. Version/fingerprint differences from that
sweep are expected and do not certify the future 5.6 package. No new production
or GitHub publication has occurred.


The full equipment gate then found a real migration race: the first v3 save
reported source v2 and zero removed duplicate rewards even when its retained
backup was v1 with two copies of the same reward. Item identity itself was
correct. A pre-lock load normalized the legacy state but failed to retain the
migration metadata for the asynchronous first equipment projection. The save
owner now retains that metadata without adopting a generation from the old key.
Regression coverage exercises the real equipment projection after delayed lock
acquisition for both v1 and v2. The existing packaged equipment assertion remains
unchanged; source and browser verification of this repair are still pending.


The analytics lifecycle gate failed before entering the game because its isolated
pre-game publisher fixture imported an intentionally omitted private source URL
from the immutable package. The fixture now serves only its two source modules
under a dedicated verification namespace, and labels that component scope. All
five actual destination/consent journeys continue to use the selected artifact;
no missing production resource is intercepted or silently replaced. Unrun fix.

## Owner scope extension: museum interiors

The owner explicitly chose **Include museums in this release** on October 12
after supplying `WorldExplorer3D_Museum_Interior_Codex_Master_Prompt.md`. The
current diagnostic sweep remains baseline evidence only. A complete licensed
interior slice, importer, geographic registry, lifecycle/security checks and
regression measurements must precede the new final package. Publication remains
separate. Work and evidence are tracked in `docs/interior-expansion/`.

The isolated game-choice layout fixture left the real bootstrap overlay visible
after removing all startup scripts. It now retains the bootstrap controller and
signals readiness normally; the focused hub layout check passes. This does not
certify the entire Painttown gate.

The fish diagnostic now reproduces a whole-population replacement during its
two-second observation: eight entities before and after, zero surviving UUIDs,
active frame heartbeat, no pause and no resource errors. The verifier now starts
a new bounded observation only across that replacement; stationary surviving
fish still fail. No fish runtime changes were made for this test error. The
corrected journey passes all 12 checks: all eight surviving fish move, and normal Earth return/disposal and resource checks pass.

Normal hosted marine capture completed with visible controls and real keyboard
walking through galley, chart, sub cradle and helm, then sub deployment and
swimming. Seven captures record their exact 31ab source build. The local public
inventory uses the five reviewed vessel captures and retains earlier images with
per-image source identity. Final 5.6 capture/acceptance remains separate. The four
missing file references have been supplied; source verification is pending.

Museum frame testing found a real rendering defect: enclosed rooms still drew
the outside city and compiled it against indoor spotlights. A scoped camera
layer now renders the sealed gallery, preserving outdoor state and restoring the
exact camera mask on exit. The initial measured view fell from 4.5 million to
about 82,000 triangles. A profiled source run passes all existing desktop frame,
resource and activation limits across three 10-second windows. Final combined
failure/reload checks and the complete final release matrix remain separate.

## Aquarium scope and latest local checks

The owner requested aquarium integration and explicitly required museum and
aquarium architecture to remain distinct. Research, candidate asset acquisition
and plans are recorded in `docs/aquarium-expansion/`; the aquarium interior is
not implemented. Local venue separation, authored floor elevations, bridge/roof
entry eligibility and actual incomplete building-part coverage are repaired.
The complete source chain passes 2,492 cases; the combined source museum/coverage
journey passes 32 cases, with inspected images and zero page/GPU errors.

The 14-gate f86 museum-reviewed diagnostic finished eight passes/six failures.
Passes: product-save, planetary research, public claims, urban equipment, analytics
lifecycle, environments, Painttown and connected journey. Failures: museum helper,
runtime ocean resource ceilings, public-gallery inventory, sustained performance,
artifact integrity and release identity. The source helper/inventory were repaired;
source changed after that artifact was built. Retain the actual failed receipts.
Ocean memory and outdoor performance still require repair and full candidate
revalidation. No new production or GitHub publication occurred.


## Ocean residency and regional construction audit

The current source removes hidden world resources only after successful marine
admission. A failed dive retains the departure ship, and failed licensed surface
arrival retains the previous presentation. A successful return to Earth restores
49,080 buildings, 18,952 roads, 49 terrain tiles and the exact saved pose. Repeated
deck/sub/deck cycles release the inactive renderer and model leases; no player
save or source assets are deleted. See CURRENT-STATE.md for exact receipts.

A real GPU leak was found in habitat replacement. Disposing geometry alone did
not release InstancedMesh matrix/color buffers. Actual WebGL instrumentation
showed 15 extra buffers after each rebuild; explicit mesh disposal now leaves
38 buffers at every occupied checkpoint and four fixture seabed buffers after
retirement. The source continuous-ocean browser check passes ten travel, outage,
resume, diver and recovery cases. Its geography uses controlled provider data.
The refreshed Ocean scene budget is a measured licensed-asset regression baseline,
not a geographic limit; previous frame-time and retention acceptance remain.

Regional construction now avoids boxed building buffers, repeated seam sorting,
per-vertex ground records and coordinate closure allocations. Identical portal
shaders reuse their program; background terrain/water slices leave paint
opportunities, cancel stale work and retire temporary mask canvases. Exact
geometry/tint/water equivalence and the actual GPU portal lifecycle are checked.
Building, road, bridge and tunnel coverage rules remain unchanged.

The unprofiled travel diagnostic still fails performance acceptance: 49.98 FPS,
p99 50 ms, worst 483.4 ms, 13 frames over 100 ms and two over 250 ms in the
90-second flight. The walk/drive windows avoid those stalls but fail FPS/heap
ceilings. This is not a complete immutable release matrix or production sign-off.
All production bytes and retained fallback packages remain preserved.

Final source validation after the GPU disposal repair: `verify:pr` passes all
2,524 tests with zero skips/TODOs, and the complete surrounding source chain.
Log: `/tmp/we3d-resource-final-source-complete.log`.

## Player journeys and public release review

Owner requests ordinary sailing/steering, ship rooms, diving/recovery, starship
travel/return and exterior aquarium entry, plus frontend/backend verification.
The nine-gate 69d5632b package sweep passes seven gates; both venues complete
functional journeys but fail performance. The latest terrain mixture reuse
source check passes all 54 aquarium checks with no >50 ms frames in three
10-second windows. Package confirmation and outdoor performance remain open.
The first backend sweep used the wrong (preserved production) dist. Its
environment guard refused access; this is an invocation failure, not a gameplay
regression. Rerun with an explicit staging package.
