# Current release work

Updated September 23, 2026. This is the integration branch's starting point.
Recheck Git, artifact identities, execution receipts, and cloud state before
making release claims. Historical notes are leads, not current proof.

## Source and deployed state

- Work here: `/Users/stevenreid/Developer/WorldExplorer3D-release-integration`.
  Branch: `steven/post-5.2-release-integration`; draft PR #87 targets `stable`.
  Do not edit the older Documents checkout.
- Last live Hosting read at 15:22 UTC: production is
  `5.2.0+db62593ba377.6342cddaba06fc68.production`; staging is
  `5.3.0+a54d03456814.6fcbfc0f54adbfef.staging`.
  Staging includes the verified mobile vehicle-prompt fix. Production Hosting
  and rules are unchanged. Hosted manifests and prompt CSS match local bytes.
- Backend/index read at 15:22 UTC: 78/78 Functions ACTIVE, no missing
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

CI 35880746836 passes 1,300 cases across 269 files on 6f72f233, with zero
failures, skipped cases, or TODOs. This is component/source evidence only.
The physical-performance script checks actual M1 hardware, rejects CI/software
rendering, and records host/renderer/browser authority. GPU errors invalidate
acceptance. The remote workflow has no cloud substitute for physical performance.

Current product repairs (latest product commit 4937d8c9):
- Vehicle-prompt shells pass pointer input through; action buttons stay interactive.
- Terrain portal hooks preserve pavement composition and stable uniform/texture
  ownership. An actual GPU before/after fixture reproduces and verifies the repair.
- Core frame systems stay suspended while asynchronous title launch imports the
  requested world. Kernel tests pass; a held-import packaged browser check is pending.

Current verification repairs preserve child-process ownership and timeouts, retain
strict GPU/network error checks, re-observe moving vehicles instead of chasing stale
positions, and isolate independent analytics cold starts. Test counts are never a
substitute for functional, service, graphics or physical-device evidence.

Remote state at 15:41 UTC (recheck job receipts):
- 35880072088 on 4937d8c9: six targeted terrain/launch/world gates still running.
- 35880778523, 35880785979, 35880789896 on 6f72f233: all 50 non-performance
  candidate gates split across three isolated runners; still running.
- 35880793340 on 6f72f233: FAIL, 12/13 backend stages. Multiplayer shared-vehicle
  admission/renewal/handoff passes. Room chat failed during second-client startup
  with a Metal GPU allocation error. Separate browser-process ownership is being
  checked; no graphics error is ignored or relabeled as passing.
- Earlier 35870819087 passed 13/13 on 2196eb25, before subsequent product repairs.
  It remains historical evidence, not current complete backend acceptance.

Physical performance attempt on 6f72f233 was stopped by the resource guard after
10.5 seconds for 338 MiB swap growth. All owned processes were closed; ordinary
Chrome remains open. No sustained clean performance result exists. Do not repeat
heavy local work until host conditions change. The phone walkthrough is deferred.

Live billing inspection found the endpoint omitted customer.subscription.updated,
although the deployed handler supports it. That event was added at 15:35 UTC,
preserving the endpoint, existing event list, API version and secrets. Read-back
confirms it is enabled. Both live price/product configurations are active. Signed
HTTP/emulator entitlement checks are being added; no payment has been charged and
no live checkout journey is claimed.

Follow `output/release-integration/test-confidence-2026-09-23/AUDIT.md` and
`latest-summary.json` for exact receipts and unresolved findings. Historical notes
are not current proof. Temporary staging App Check credentials must be removed
after all active candidate consumers finish. Hosted staging remains a54d0345;
local dist is 6f72f233. Production frontend Hosting and rules are unchanged.

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
