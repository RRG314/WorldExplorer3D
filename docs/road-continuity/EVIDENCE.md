# Earth travel continuity repair — October 14, 2026

The owner rejects reloads or Main Menu prompts as a travel mechanic, requests a
production correction, and permits a location-based fallback if genuine continuous
Earth travel is not ready. Preserve ongoing 5.6 work and saved progress.

## Verified baseline

- Live production manifest: `5.5.0+d8775a392c42.88e67f97c00bb4c2.production`.
- Established ship-review preview: `5.6.0+10daf049a2a7.82abc92b87951707.staging`.
- Local 5.6 source starts at `87b302cb`; production `dist` preserved.
- The transport runtime, worker, compiler and publication code are byte-identical
  between production source d8775a39 and current local source.
- Regional scenery moves an outer terrain/building/water window. Detailed road
  sources and structures belong to a fixed selected-location domain. This is not
  complete worldwide driving streaming. Consolidation does not change that fact.
- Source-confirmed failure path: any moving region compile/publication failure
  terminates the worker; subsequent frames never retry. The recovery button
  reloads the Earth world, and the notice suggests Main Menu. Readiness blocks
  simulation on missing contact. Removing the safety gate alone is not a repair.

## Reproduction

- First remote production browser probe entered the loading transition too early:
  gameStarted preceded published roads. The test recorded zero origin roads and
  an undefined generation. Its failed assertion is a harness defect, not evidence
  of a gameplay reload. Fixed the runner to await published road readiness; kept
  the report under `output/road-continuity/baseline/`.
- Actual production probe reproduced `Missing road contact in region 11:1` after
  arrivals at 2.5/4.5/6.5/8.5/10.5 km east. Same failure reproduced in current 5.6
  source. At x12157.6798/z1464.8472, Middleborough Road is an engineered approach
  retained by the pinned contact owner. Its contact height is -0.5307; the moving
  packet stops 2.813 m away because it excludes the pinned approach. The old
  junction assertion ignored the pinned owner. No bridge/tunnel geometry change
  is needed. Source capture includes the exact involved provider roads.
- Fixed source passed eleven east/west/return arrivals, 69 regional evictions,
  one deliberately interrupted real worker with local compiler recovery, bounded
  residency (<=16 moving regions), and 122.8 m of prescribed keyboard movement on
  distant South Marlyn Avenue. World generation stayed 1; no page errors.
  Keyboard setup selected another segment of the named road; the packaged check
  now selects the precise failing junction. Arrival tests are not continuous
  21 km keyboard driving. Reports/screenshots retained under source-fixed.
- 28 focused checks and the complete source chain passed before the additional
  fixed-location preference change. New/default or unavailable storage uses the
  fixed view; explicit saved scenery on/off remains respected. This follows the
  owner's requested fallback and does not pretend scenery is worldwide driving.
- The repair validates both real surface owners at the original precision limit;
  an overhead bridge or genuinely missing surface still fails. Failed road jobs
  restore only their compiler, retain accepted meshes/contact and retry twice
  with backoff. Manual retry remains local. No location/menu/save reload.
- Production 5.5.1 deployed from isolated source 012e5c85. All 2,186 source checks and structural chain, all 29 staged package world checks, all eleven packaged and live road arrivals passed. The matching 5.6 source and preview correction is published; see the integration receipt below. Existing known release limitations
  and provider warnings are not reclassified by these scoped passes.

## Plan and acceptance

1. Reproduce road travel failure using the actual game publication, inspect the
   offending region and preserve failure evidence.
2. Repair the publication/recovery owner; no world reload and no missing physical
   road accepted as success. Keep bridge/tunnel surfaces and original location.
3. Test failures, cancellation, resident bounds, outward/return travel and keyboard
   movement. Distinguish controlled arrival tests from continuous route driving.
4. Prepare an isolated production hotfix from its actual source; preserve all
   unrelated 5.6 changes. Verify artifact identity, scope and rollback before
   deploying. Carry the same repair into development.


## Physical quality follow-up kept separate

The exact Middleborough/South Marlyn junction is no longer falsely rejected by
regional publication. Its existing terrain/engineered join still shows a vertical
edge; the 54 m keyboard approach did not establish successful crossing. Neither
its geometry nor the grade solver was changed in this urgent reload hotfix. This
is a concrete follow-up, not a passing worldwide drivability claim.


## Completed 5.6 integration — October 14

- Published stable source received the same runtime fix through PR #101, merge
  `6e2c8300d7e650b4fb5a7d283cd6fd316ed48eae`. All required GitHub checks passed
  before the normal protected merge. The active visual-quality and
  post-5.2-release-integration branches both received history-preserving merge
  `6cf5cf29c69e99469b83448753ed0c9e4cacb136` by one atomic fast-forward push.
  There is no separate remote main branch. No force push or source reset occurred.
- The exact published 5.6 package is
  `5.6.0+5faa0d9b5eeb.feff82860c144189.staging`; its asset manifest SHA-256 is
  `a4663a53b12c5d62f7f873c8bb1039acbdfc1a8f5aa38cb2274bdde02da0422d`.
  All 2,531 source tests and structural checks pass. The immutable package passes
  all eleven controlled arrivals, 69 evictions, one interrupted real worker and
  local recovery, with generation 1 throughout, at most 16 moving regions, no
  road error/reload prompt or page errors. This is the road-recovery scope, not a
  new complete-world, hosted backend, device or worldwide travel certification.
  Provider/App Check warnings remain in the actual local-package report.
- The established preview was updated in the staging project only:
  https://we3d-staging-20260712--ship-review-1011-pb8x1l4l.web.app/app/
  Remote build and asset manifests match the tested local bytes. Production
  remains the separately verified 5.5.1 package; no 5.6 package was promoted.
- Evidence is in the attached road-continuity-hotfix worktree under
  `output/road-continuity/packaged-56/` and `preview-56-deployed.json`. Its
  `dist` preserves 5.5.1 production, and both tested staging packages remain in
  `output/hosting-validation/`. The original architecture-evaluation `dist` and
  the ongoing venue/consolidation candidate remain untouched.
- Ongoing local venue work was merged with the published repair at `027336a7`.
  Its entire tree is byte-identical to pre-merge local `ebc0c2a8`: no museum,
  aquarium, harbor, launch-site or consolidation work was lost or released by
  this synchronization. A date-only documentation conflict was resolved.
- The physical terrain join described above is still open. Its exact-junction
  keyboard check moved 54.2 m but did not establish crossing the vertical edge.
