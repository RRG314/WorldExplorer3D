# Current development and release state

Updated October 23, 2026 for gameplay QA and 5.6.1 security maintenance. The live build manifest at
https://worldexplorer3d.io/build-manifest.json and the GitHub release are the
production identity authorities; check them before starting new release work.
The owner has explicitly authorized production, protected stable, both active
development branches and the release. Do not ask again.

## October 23 authorized coordinated production release (in progress)

The owner now explicitly authorizes deployment once the app's features work.
This supersedes the prior no-production/push boundary for the coordinated
release. Preserve protected GitHub checks, existing data/configuration, all
rollback bytes and evidence. Do not ask again for already-authorized steps.

Start from clean28a4ff64. Production remains security a82ff0ab until the current
loading/coverage gaps and scoped backend prerequisites are resolved. The active
execution ledger is `output/research/production-release-2026-10-23/PLAN.md`.
The cold-start profile retains the complete Baltimore world; its far pavement
owner compiled all6,009cells in about33seconds. Initial coverage can overlap
vertical terrain preparation after building constraints and structure semantics
are final; path/contact publication must still await the normal final handoff.
Focused ownership/geometry equivalence tests accompany that repair. Earlier
valid gameplay, room, save and24-hour mail evidence stays retained; no broad
historical sweep is authorized or required merely by verification edits.

The first compiled overlap pilot retained all6,009cells, the exact covered area,
49,080buildings and18,951roads, but first playable87.27s still failed60s.
Touch input/native60FPS, checkpoint/flower replay and trial success/failure
passed in that same world. Paint's expanded phone palette was blocked by the
minimap; its bounded, scrollable overlay now sits above the map and below the
main menu. Loading coverage now acknowledges bounded32cell/32ms worker batches;
normal gameplay retains single-cell scheduling. Actual-worker tests compare
every mask byte/order/count with single-cell output; cancellation rejects late
batches. The next compiled pilot must measure this change before promotion.
Evidence: `output/research/production-release-2026-10-23/pilot/` and focused
`batched-coverage-contracts.log` / `batched-cancellation.log`. No production change.

## October 23 practical gameplay QA authority

Use `docs/verification/GAMEPLAY-QA.md` and the resumable `qa:gameplay:plan` /
`qa:gameplay:report` commands for routine gameplay checks. Do not restart the
historical full release matrix for unrelated edits. Detailed current results:
`docs/verification/2026-10-23-GAMEPLAY-QA.md`; operational receipts and retained
failures: `output/research/gameplay-qa-2026-10-23/`.

Fresh Moon/Mars entry no longer depends on first loading Earth. Runtime fix
`a674b568a395` is active on existing staging as
`5.6.1+a674b568a395.e9acda64f8514624.staging`, Hosting `b26fd8f4ca5e3d66`.
Production remains the security build below. The staging package is
`output/hosting-validation/gameplay-qa-20261023-staging`; no production features,
backend, rules, Auth or player data were changed by this QA task.

Desktop street gameplay measured 45.8 FPS; desktop touch proxy and ocean 60 FPS.
Mobile proxy cold startup was 90.6 seconds against the existing 60-second target
and remains a failed receipt. Physical phones/Safari and fresh protected-service
attestation remain unqualified. This is not blanket mobile/production sign-off.
The next separate performance work is cold-start profiling and the affected
loading-path improvement, followed by that case and physical-device checks.

The unchanged default QA command retains completed work and the known failure
without opening another world. Retained source/evidence reviews distinguish
actual hosted gameplay, controlled browser components and earlier unchanged
multiplayer/email journeys. Four package slots remain: the redundant isolated
security staging pair is recoverable from
`output/hosting-validation/superseded-manifests/gameplay-qa-security-pair-20261023/recovery.json`.
Preserve its security production basis, the multiplayer basis, current dist and
all released rollback packages.

## October 23 security authority and current production

The owner's security instruction authorizes necessary security fixes and their
protected activation, superseding the earlier local-only restriction for this
scope. Production now serves security build
`5.6.1+a82ff0abef27.b225efbf098a35bb.production`, source
`a82ff0abef278e20f78b82cdeba24a97decec3f1`, Hosting version
`34fff00d671d0a0b`. Released source `233a5a7f...` and its previous Hosting
version `d4516200e86c480f` are retained recovery anchors. Protected PRs 104, 114,
115 and 116 contain runtime/scanning/preview hardening, visit-only private provider
keys and the capture-worker runtime refresh. No unreleased architecture, tester or multiplayer feature was promoted to
production; backend Functions, Auth, rules and player data remain unchanged.

Both managed Node22 probes reported 22.23.4 and were deleted; all original 80
production and 84 staging Function resources were preserved. Main staging now
serves its existing feature build plus the same three-file private-key fix:
`5.6.1+2b0c1a892345.8300f082fe3d1282.staging`, Hosting version
`48506cb8e8154c41`. The former staging package remains byte-for-byte recoverable.
The private staging capture job now pins security image digest
`7fa30a943f988f22128b154e8339402af5b21cb4471ee1f53dd4ebf44c8e5092`;
its original worker/Meshroom files, UID, processing settings and IAM were
preserved. Container/Blender export checks passed; no GPU capture was executed.
Details, limitations and failed evidence are local operational records under
`output/research/security-response-2026-10-23/`. Use its final readiness and
`output/release-review/security-candidate.json`; older release/local-only statements
below describe their dated checkpoints.

Local Node is 22.23.4; default Python is 3.14.9 with pip 26.2.2 and updated CA
trust. The installed desktop app separately bundles Node 24.21.0; its official
updater reported busy twice, so vendor patch/backport status remains unverified.
Do not replace signed application binaries manually. The credential-only staging
preview retained automated CAPTCHA errors; this response did not relax App Check
or establish ordinary CAPTCHA acceptance. Do not repeat prior world/multiplayer
or email journeys for these unchanged source paths. No compromise was confirmed
by the scoped checks; they are not a whole-device forensic examination.

Four current package slots are retained. The earlier browser/tester production
and former multiplayer staging candidates are fully recoverable from verified basis/overlay
archives; their pointers contain recovery instructions. Every dependent archive
was reverified. Preserve the multiplayer production basis, current `dist`, and
all released rollback packages. Do not deploy an older feature candidate without
bringing in these security fixes. The Godot work and broader roadmap are outside
this security response.

## Workspace and branch authority

Work in `/Users/stevenreid/.codex/worktrees/architecture-evaluation/WorldExplorer3D-live-deployed-20260320`,
branch `steven/visual-quality`. The Documents checkout and the old AGENTS path
are stale. `stable` is the default release branch; there is no `main` branch.
Use protected PR merges and preserve both active development branches without
force pushes. The package pointer is `output/release-review/current-final-candidate.json`.

## Owner-directed testing scope

The owner stopped the repeated broad matrix on October 19. Do not restart the
106/107-gate sweep or 42-minute native sequence for an unchanged game package.
The exact owned process tree was stopped and its receipts archived. The obsolete
local full-sweep automation is disabled. Preserve failed/interrupted results.
See `docs/release-review/2026-10-19/TARGETED-RELEASE-PLAN.md`.

Verification-only changes had invalidated every gate despite 756 identical game
assets. The explicit targeted release decision now distinguishes executed checks
from reviewed retained evidence and binds source, artifact and evidence hashes.
It does not claim the full matrix passed. Original full-matrix commands remain
available for separately justified broad regression work.

## Repairs and completed focused evidence

- Packed navigation facts remove roughly 282,000 additional node/segment objects
  while preserving exact coordinates, feature identities, costs and access rules.
- Street publication leases, bounded caches, stale-job rejection and actor-owned
  ground queries preserve accepted coverage and release superseded resources.
- Heavy full-city diagnostic polling was guarded during loading; the former
  per-frame readiness poll itself added hundreds of seconds to some tests.
- Dense pavement corner probes now reject polygons outside their exact bounds
  before the unchanged ring/hole predicate. 57 focused geometry checks passed.
- Current packaged Tokyo fallback passed all geometry, contact and coverage
  assertions. Same 93,175 buildings, 18,265 roads and 5,845 pavement cells; street
  preparation 193,476 ms → 108,005 ms, complete journey 331,601 ms → 243,727 ms.
- Current Kennedy recovery passed in about 61 seconds: controlled elevation
  request failure, mapped approach, entry, four tour stations and exit.
- Ordinary canonical-staging Chrome loaded the complete Baltimore world and
  accepted normal walking input with no JavaScript errors. No debug attestation.
- Current backend and all four save/fallback stages passed before the containment
  change. Backend, save, account and mobile inputs are unchanged and retained
  with an explicit delta review. No additional physical-phone review is claimed.

The original 499 candidate completed 105/107 gates; e8 completed 88 with 83 passes
before interruption. Native timing passed on 499 and varied on later identical
assets under host pressure. Preserve both outcomes and the published device
performance limitation. HYCOM and ArcGIS availability failures remain recorded;
missing provider observations must stay unavailable rather than invented.

## Promotion procedure and recovery

Use the hash-bound targeted review for this maintenance release. A documentation
or release-script fix does not require replaying worlds whose delivered bytes
remain identical; record the exact package equivalence instead. GitHub required
checks and exact staging-to-production asset equivalence still apply.

Only six reviewed Functions may change: commitExplorerCommerceAction,
getEnvironmentalData,getPlaceLookup,createRealityCaptureDraft,
saveRealityCaptureHybridPreview,submitRealityCaptureHybrid. Preserve the other 74
and every configured value. No rule, account or database-data change is included.

The modern-save fallback is b21b7f12fdfab0f2adf82eca01faefb55ae64748; retain both
staging/production packages. The original released 551 package remains in the
road-continuity-hotfix worktree. Its duplicate was removed only after all bytes
were reverified and the four migration stages had passed.

One heavy process at a time on this 8 GiB Mac. Preserve current dist, distinct
fallbacks, source/history, player data, ordinary Chrome and unrelated emulators.
At most four saved candidates. Never print raw cloud configuration or credentials.
Detailed current execution/deployment records belong under ignored
`output/release-review` and `output/release-evidence`, not in public release notes.

## Local architecture work (October 20, 2026)

The browser command-ownership cleanup continues locally on `steven/visual-quality`.
Activity starts, map travel, Earth-session restoration and explicit recovery use existing
transport/session owners. Journal and room arrivals retain the world publication
owner; current details and bounded evidence are in
`docs/architecture-evaluation/2026-10-19-BROWSER-FOUNDATION-IMPLEMENTATION.md`.
The owner has authorized continuing across local checkpoints without asking
for confirmation. This does not authorize pushing, deployment, release-branch
changes, broad historical acceptance sweeps or starting the Godot port.
Production remains released 5.6.1 at source
`233a5a7f813fef97da3d75a76eb87996321fda2f`.

The October 20 owner instruction now requires completing the remaining browser
cleanup through deployment-candidate readiness without pausing at checkpoints.
The concrete endpoint and nonduplicative verification policy are
`docs/architecture-evaluation/2026-10-20-BROWSER-COMPLETION.md`. This supersedes
older per-commit stopping points. The Godot consumer and actual deployment remain
outside the run.


The defined October 20 browser completion is implemented and locally reviewed.
See the completion document for final source/package identities, retained and
executed evidence, metadata-only wrapper exception and rollout requirements.
Local pointer: `output/release-review/browser-cleanup-candidate.json`; preserve
the existing released-candidate pointer and all rollback packages. Tester signup
adds one new Function plus two TTL policies and reuses the deployed Resend sender.
This additive owner-requested scope does not authorize changing the existing 80
Functions, their values or rules. No deployment or Godot work occurred.

## Tester email follow-up (October 21, 2026)

The owner requested a complete application/approval/invitation/reply flow. The
local implementation now replaces the initial interest-only scope with four
additive Functions, two composite indexes and six tester TTL policies. Existing
80 Functions, their configured values, account/game rules and player data remain
outside this change. Read
`docs/architecture-evaluation/2026-10-21-TESTER-EMAIL.md` for the owner workflow,
verification evidence and concrete activation requirements. The earlier browser
candidate/readiness pointer is retained as historical evidence; it does not
cover the new mail/admin changes. No production email, DNS change, push or
deployment occurred in this follow-up.

## October 22 tester verification scope

The owner requested a real end-to-end email/signup test and matching, simple UI.
Use isolated `we3d-staging-20260712` plus the connected owner Gmail inbox. This
authorizes the additive staging test setup needed for that journey, preserving
production, existing Functions/configuration, DNS, rules, release branches and
player data. Restrict staging sends/receiving to the owner test addresses and
mark emails [TEST]. See the October 22 section of the tester email document and
`output/research/tester-live-e2e-2026-10-22/` for current evidence. Do not describe
the local simulated preview as real delivery or the staging test as production
release approval.

## Completed October 22 tester verification

Tester confirmation links now last 24 hours, with cleanup scheduled after 48
hours; email, public form, popup and privacy wording agree. The actual hosted
staging journey completed through owner approval, invitation, acceptance, manual
reply forwarding and withdrawal. All six system-message types were received and
read in Gmail Inbox. Full admin mobile header overflow was fixed. See the final
October 22 section of `docs/architecture-evaluation/2026-10-21-TESTER-EMAIL.md` for
precise evidence, retained failures, test-attestation limitations and cleanup.

Current candidate pointer: `output/release-review/tester-program-candidate.json`.
Verified production candidate source `1481e55b5334`, build
`5.6.1+1481e55b5334.7bbed4d5befaf6c4.production`; staging differs only in its three
Firebase project config files. Subsequent documentation-only commits do not
change those verified inputs. Temporary admin/debug credentials and owned test
browsers were cleaned up; the test application is withdrawn, test build details
cleared and temporary Resend webhook disabled. Existing 80 staging Function
configurations were verified unchanged. Production still runs released source
`233a5a7f813fef97da3d75a76eb87996321fda2f`, has no tester Functions and was not
deployed. The implementation/testing endpoint is complete; coordinated protected
production activation is the next separately authorized action.

## October 22 multiplayer follow-up

Owner requested personal rooms, the public weekly room and a safe geographic
streaming boundary. Local implementation and focused evidence are in
`docs/architecture-evaluation/2026-10-22-MULTIPLAYER-READINESS.md`. Weekly admission
now uses the existing server owner/transaction, UTC canonical city facts and a
32-player ceiling with guest access and no personal quota charge. Each Earth room
stays at one selected origin; detail streams within it, and selecting another
origin releases the room before solo replacement. This is a finite selected-area
source, not global multiplayer streaming. Room world preparation precedes
subscriptions/connected status, leases renew without wrong-world poses, and seed
ownership is restored on leave. Existing actor/admission rules remain in force.

Two actual clients passed personal public create/join/chat/walking/reconnect and
travel cleanup; the full current weekly city passed signed-out guest entry,
walking and leave. Current isolated backend rules/admission and focused lifecycle
cases passed. No 32-client performance/load acceptance is claimed. Optional local
weather/marine/reverse services were unavailable and are recorded separately.
Failed test setups and their diagnoses are retained; no broad release sweep was
restarted. Multiplayer adds a scoped change to existing joinRoom plus one room-
creation rule; this supersedes the prior mail-only no-existing-Function-change
scope for that one Function. Preserve other Functions/configuration/data.
Production and staging were not changed in this follow-up. Coordinated protected
backend/rules/frontend activation remains separate from local candidate readiness.

Multiplayer code commits: `f85edbc0dca1` and guest copy `c337d144261e`.
Final local build: `5.6.1+c337d144261e.4f05c779ef91aac2.production` under
`output/hosting-validation/multiplayer-20261022-production-ready`.
Pointer: `output/release-review/multiplayer-candidate.json`. Packaged UI/module
smoke passed at 320/390/1100 pixels. Earlier tester staging and first multiplayer
packages have complete, hash-verified basis/overlay recovery records under
`output/hosting-validation/superseded-manifests/`; current dist, tester production
and all released rollback packages remain preserved. Final docs do not change
verified acceptance inputs. Local endpoint complete; coordinated hosted activation
and protected production promotion remain separate, with no 32-client load claim.

## October 23 staging multiplayer activation

The owner's go-ahead continued into dedicated staging activation and bounded
hosted verification. Read
`docs/architecture-evaluation/2026-10-23-MULTIPLAYER-STAGING.md` before further
release work. Staging now runs build
`5.6.1+459272d8b13b.78676db82e5509eb.staging`, paired with the preserved multiplayer
production candidate (762 identical delivered files, three expected Firebase
config differences). Only existing joinRoom source, the reviewed weekly-prefix
creation rule and Hosting changed. Existing other 83 staging Function resources,
joinRoom configuration/secrets/IAM and all other live rule text were preserved.

Actual hosted private create/join, two full client worlds, chat, walking and
public discovery completed. Weekly guest entry initially exposed disabled
Anonymous auth. Staging now enables that one provider switch; full GET comparison
proves all other Auth fields unchanged. Production also currently has Anonymous
disabled and must enable it during the coordinated release. Weekly guest UI then
loaded the real canonical city; its later strict decimal assertion failed on
normal longitude rounding. Actual policy tolerance accepts the observed value;
the failed receipt stays failed. The remaining two-guest SDK/admission/lease/
ownership/leave checks passed without another city replay. Earlier full local
weekly guest walking/leave remains retained, not relabelled as new hosted work.

Some automated browser contexts received App Check exchange 403 and protected
lookup/environment/exterior requests 401 despite matching staging provider key
and allowed canonical domain. No debug attestation or policy relaxation was used;
normal CAPTCHA acceptance is not established by this run. Keep that observation
separate from completed room functionality and review it for production.

Final preservation audit passed: all 80 production Functions, Auth, rule release
and Hosting remain unchanged at released source 233a5a7f. Five disposable staging
accounts and their own data/memberships were cleaned up; the system weekly room
is retained with zero membership documents. Source unchanged; no broad suite,
city replay for the float assertion, email replay, push or production deployment.
Current readiness pointer remains `output/release-review/multiplayer-candidate.json`
with the newer hash-bound staging decision. Production promotion is still the
protected, coordinated release boundary, including the tester activation needs.
