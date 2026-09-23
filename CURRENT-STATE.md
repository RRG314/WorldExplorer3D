# Current release work

Updated September 23, 2026. Verify the receipts below before making release
claims. Historical notes are leads, not current evidence or instructions.

## Work and identities

Work only in `/Users/stevenreid/Developer/WorldExplorer3D-release-integration`,
branch `steven/post-5.2-release-integration`, draft PR #87 into `stable`.
Read `git status` and `git rev-parse HEAD` for current source. Do not edit the
older Documents checkout. Do not merge or promote production frontend yet.

Latest checked production Hosting:
`5.2.0+db62593ba377.6342cddaba06fc68.production`.
Hosted staging verified at 16:20 UTC:
`5.3.0+44ad9368fd9e.a120b7ab5ef75a5a.staging`.
Its asset digest matches the local package; production Hosting is unchanged.
Re-read hosted manifests; a browser query parameter is not build identity.

Current detailed ledger (ignored generated evidence, updated independently of
source commits): `output/release-integration/test-confidence-2026-09-23/`.
Start with `latest-summary.json`, `OPEN-FINDINGS.md`, and recorded run receipts.
CI run source identities and artifact hashes must not be relabeled for later
commits. `AUDIT-HISTORY.md` and dated progress entries preserve past work only.

## Confirmed product repairs

- Mobile vehicle-prompt shells pass input through; their buttons stay interactive.
- Terrain portal/pavement shader composition preserves uniforms and texture
  ownership; an actual GPU before/after fixture reproduces the repaired defect.
- Core frame work stays suspended while title launch imports the selected world.
  Held-import packaged browser checks show no default-world presentation/render.
- A closed large map no longer paints or fetches 49 default-city tiles during
  zoom-control setup. The actual painter/cache/UI regression fails old code and
  passes the fix, including open/zoom/close/reopen. Packaged recheck is pending.
- Profile creation, subscription updates and trial admission use transactions;
  concurrent room counts and paid plans cannot be overwritten by stale reads.
  Four focused concurrency cases fail the old implementation and pass the repair.

Earlier source repairs remove movement-loop diagnostic sorting, bound generated
planet resources to two recent worlds, detach the previous planet on transitions,
and add capture-email retry. Runtime graph inspection found no verification
modules or duplicate module identities; source bytes are not RAM or FPS evidence.

## Backend and services

The authorized backend/index reconciliation found 78/78 Functions ACTIVE and all
required indexes READY, with no missing browser handlers. Capture worker invoke
access is restricted to its dedicated service account.

On September 23, the five account-related Functions were repaired and deployed
to staging and production (production completed 16:04:53 UTC), preserving all
existing parameters/secrets. Read-back confirms ACTIVE; production HTTP auth and
signature guards pass. No production frontend Hosting or restrictive rules changed.

The live Stripe endpoint was missing customer.subscription.updated. That event
was added at 15:35 UTC while preserving endpoint/API version/other events/secrets;
read-back confirms the repair. Live prices/products are active. No charge was made.
Staging's existing Stripe key and signing secret are empty. Signed emulator HTTP
checks cover billing persistence, but no real hosted checkout is accepted.

## What tests establish

The original 1,222 cases were Node component/source tests, not player journeys.
Twelve omitted component files and room-profile emulator cases were restored.
Current source/component checks execute 1,306 cases in 271 files, with no skips,
TODOs, duplicate files or unassigned tests. A cleanup mutation survives four text
checks but fails an actual Three.js lifecycle check. This is one demonstrated
sensitivity difference, not a quality score for every test.

Full backend run 35885471966 on 2400785b passes all 13 isolated-emulator stages,
including actual HTTP trial concurrency/signed billing and independent browser
room admission, lease/handoff, chat and replicated movement. Chat evidence uses
normal low-quality Settings and one foreground-rendering world at a time; it is
not simultaneous-rendering, default-quality, live billing or performance acceptance.
The earlier chat receipt starting from placeholder 0,0 is invalid movement proof.

The 50 non-performance candidate gates on 6f72f233 completed 43/50. Their seven
failures remain failures: smoke, assembled-worlds, equipment, analytics, terrain
boundary, connected journey, mobile load. Other-source passing rechecks do not
convert that run into a complete passing matrix. Follow the current ledger for
new repaired/affected checks and exact source identities.

Confirmed test-harness issues include third-party-frame storage seeding, expired
brief tutorial hints, stale moving-vehicle observations and missing staging-only
App Check setup. Fixes preserve real input/state assertions and graphics errors.
Mobile load now records provider failures and final-world state before cleanup;
its mapped-world assertions remain. Functional runs retain raw timings without
claiming performance. The required physical performance gate additionally runs
normal/GPS journeys against the unchanged, single declared M1 load budget.
Conflicting script-local38/40-second cloud thresholds are retired, not relabeled
as historical passes. Touch emulation is not physical iPhone performance.

Virtual-Mac graphics failures include allocation errors/context loss and shader
errors with empty compiler logs. Linux Manhattan and seven-city fallback passes
narrow the investigation; they do not certify hardware performance. Graphics
errors invalidate acceptance and are never ignored to obtain a passing result.

## Remaining release acceptance and resources

Complete current candidate/backend artifact evidence, clean sustained physical
M1 performance, and the owner phone walkthrough remain required. A 6f72 physical
attempt stopped after 10.5 seconds for 338 MiB swap growth; all owned processes
were closed. That is an interrupted check, not an app FPS failure or a pass.
The Mac remains under warning memory pressure. Keep ordinary Chrome open.

Run one bounded local workload at a time. Do not blindly restart heavy work after
a resource stop. Preserve source/history, user data, live rollback and current dist;
keep at most four recognized saved candidates. Roughly 13 GiB remains free.

Temporary staging App Check credentials are private, outside the package. The
active registration, GitHub secret and private local file must be revoked/removed
only after all current remote consumers finish. Inspect the lifecycle receipt in
`output/release-integration/live-checks/remote-appcheck-lifecycle.json` first.

Production preparation must retain complete current staging evidence, replace only
three Firebase configuration assets, prove all other asset bytes identical, and
require real owner acceptance. Promotion pins an immutable Hosting version and
cannot skip finalization. See `docs/TEST-AND-RELEASE-EVIDENCE.md`. Never manufacture
approval files, reuse interrupted receipts as passes, or silently bypass a gate.
Experimental GPU reconstruction remains unprovisioned and claim-gated; manual
capture placement is available. No live payment or email journey is claimed from
emulator results.
