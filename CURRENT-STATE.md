# Current release work

Updated September 23, 2026. This is the integration branch's starting point.
Recheck Git, artifact identities, execution receipts, and cloud state before
making release claims. Historical notes are leads, not current proof.

## Source and deployed state

- Work here: `/Users/stevenreid/Developer/WorldExplorer3D-release-integration`.
  Branch: `steven/post-5.2-release-integration`; draft PR #87 targets `stable`.
  Do not edit the older Documents checkout.
- Last live Hosting read at 13:17 UTC: production is
  `5.2.0+db62593ba377.6342cddaba06fc68.production`; staging is
  `5.3.0+9b3d35b56c2a.327bb975810a64af.staging`.
  The later mobile vehicle-prompt fix is not yet deployed. Production rules
  are unchanged. Check the hosted manifests for subsequent deployment receipts.
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

CI 35870266758 passes 1,289 cases on 2196eb25. Subsequent verification-only host
guard tests add three cases; use the current CI report for the final total.
The physical-performance script now checks the actual M1 Mac mini hardware,
rejects CI/software rendering, and records host/renderer/browser authority.
The remote workflow's obsolete duplicate functional list and cloud "full"
physical-release path were removed. Remote results remain functional evidence.

Fresh backend testing exposed a phone vehicle prompt intercepting world taps.
The CSS shell now passes pointer input through while its action buttons remain
interactive. Four pointer cases plus 35 existing layout cases pass; packaged
smoke 35869188628 passes on 7c7716bd with screenshots inspected. The 2196eb25
package has an identical complete asset manifest to 7c7716bd. The Linux backend
rerun passed 12/13 stages but hit a screenshot deadline on SwiftShader before
vehicle handoff; it remains a failed/incomplete run.

Current remote verification requests on 2196eb25:
- 35870313727: all 49 candidate gates except physical performance, macos-14.
- 35870819087: the complete backend gate, macos-14, unchanged assertions.

These are requests, not passing receipts. Follow
`output/release-integration/test-confidence-2026-09-23/AUDIT.md` for their actual
outcomes, artifact identities, failures, and temporary credential cleanup.
Earlier regional/city/planetary results retain their own source/artifact scope;
never relabel them as a current complete matrix or device performance proof.

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
