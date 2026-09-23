# Current release work

Updated September 23, 2026. This is the integration branch's starting point.
Recheck Git, artifact identities, execution receipts, and cloud state before
making release claims. Historical notes are leads, not current proof.

## Source and deployed state

- Work here: `/Users/stevenreid/Developer/WorldExplorer3D-release-integration`.
  Branch: `steven/post-5.2-release-integration`; draft PR #87 targets `stable`.
  Do not edit the older Documents checkout.
- Last live Hosting read at 14:13 UTC: production is
  `5.2.0+db62593ba377.6342cddaba06fc68.production`; staging is
  `5.3.0+a54d03456814.6fcbfc0f54adbfef.staging`.
  Staging includes the verified mobile vehicle-prompt fix. Production Hosting
  and rules are unchanged. Hosted manifests and prompt CSS match local bytes.
- Backend/index read at 13:20–13:21 UTC: 78/78 Functions ACTIVE, no missing
  browser handlers, all required index definitions READY. Worker invocation
  is restricted to its dedicated service account. The authorized backend
  reconciliation is complete; this does not establish frontend acceptance.
- Source repairs remove movement-loop diagnostic sorting, bound generated
  planetary resources to two recent worlds, detach the prior planet on
  transitions, and add the capture-email retry route. The runtime import graph
  has no verification modules or duplicate module identities. Diagnostics are
  on-demand inspection; adaptive quality and player Memories are runtime features.

## Current verification findings

The original 1,222 cases were Node component/source checks, not browser journeys.
Twelve omitted component files and the room-profile emulator tests were added
to their execution paths. A real facade cleanup check catches a retained-object
mutation that four source-text checks missed. Executed-case reports and test
inventory now distinguish scope and reject unassigned/skipped/TODO tests.

CI 35871852823 passes 1,292 cases across 266 files on a54d0345, with zero
failures, skipped cases, or TODOs. This is component/source evidence only.
The physical-performance script now checks the actual M1 Mac mini hardware,
rejects CI/software rendering, and records host/renderer/browser authority. GPU console errors also invalidate
performance acceptance even when no JavaScript exception occurs.
The remote workflow's obsolete duplicate functional list and cloud "full"
physical-release path were removed. Remote results remain functional evidence.

Fresh backend testing exposed a phone vehicle prompt intercepting world taps.
The CSS shell now passes pointer input through while its action buttons remain
interactive. Four pointer cases plus 35 existing layout cases pass; packaged
smoke 35869188628 passes on 7c7716bd with screenshots inspected. The 2196eb25
package has an identical complete asset manifest to 7c7716bd. The Linux backend
rerun passed 12/13 stages but hit a screenshot deadline on SwiftShader before
vehicle handoff; it remains a failed/incomplete run.

Remote verification on 2196eb25 (all packaged asset bytes match a54d0345):
- 35870313727: all 49 candidate gates except physical performance, macos-14;
  still running, with graphics failures in Golden Gate fallback and Monaco
  actor checks. This is not a passing candidate matrix.
- 35870819087: PASS, all 13 backend stages. Includes two independent clients,
  room create/join, shared state, vehicle lease renewal/release/handoff, property
  purchase, and chat-close-to-driving recovery. Remote functional scope only.

Follow
`output/release-integration/test-confidence-2026-09-23/AUDIT.md` for their actual
outcomes, artifact identities, failures, and temporary credential cleanup.
Earlier regional/city/planetary results retain their own source/artifact scope;
never relabel them as a current complete matrix or device performance proof.

A subsequent source audit reproduced a separate terrain shader lifecycle bug:
refreshing/clearing tunnel openings replaced the pavement hook installed afterward.
The repair installs the portal hook once, updates a stable uniform, reuses same-size
textures, and disposes replaced textures. Two runtime component cases and a five-step
GPU pixel fixture cover refresh, clear, grow, and cached-program reuse. The original
shader visibly loses pavement in the same fixture; the repaired version preserves it.
The new `terrain-shaders` candidate gate retains this check. This product change is
not yet hosted and is not yet established as the cause of the remote GPU failures.

## Release path and remaining acceptance

Release preparation requires complete current staging evidence before converting
only Firebase configuration to production. It verifies all other asset bytes,
source identity, and final owner acceptance. Production preview/promotion cannot
skip finalization; promotion pins the reviewed immutable Hosting version.
See `docs/TEST-AND-RELEASE-EVIDENCE.md`. Never manufacture approval/evidence files.

Full current candidate/backend acceptance, clean sustained physical-device
performance, and the deferred owner phone walkthrough remain outstanding until
supported by receipts. Experimental GPU reconstruction is unprovisioned and
claim-gated; public capture uses manual placement. No live payment or email
journey has been claimed from emulator checks.

## Useful commands and operating constraints

- `npm run verify:pr`: source/tooling syntax and coherence, component checks,
  inventory and the isolated cleanup sensitivity experiment.
- `node scripts/audit-runtime-startup.mjs`: module reachability/source bytes,
  not measured RAM or FPS.
- `node scripts/verification/performance-host.mjs`: host eligibility only.
- `scripts/verification/`: separate test programs, not game entrypoints.
- `progress.md`, `docs/audits/`, and dated `output/` folders: historical evidence
  at their stated times, not overriding instructions.

Keep ordinary Chrome open. Run one bounded local workload at a time on this
8 GiB Mac; avoid performance measurements under memory/CPU pressure. Preserve
source/history, user data and the live rollback, with at most four recognized
saved candidates. Temporary staging App Check registration/secret/file must be
removed after the remote functional checks. Frontend Hosting/rule rollout still
requires coordinated acceptance; backend deployment is not its substitute.
