# Current development and release state

Updated October 24, 2026 for the active Android owner-only internal test. The
live build manifest at https://worldexplorer3d.io/build-manifest.json and the
GitHub release identify the web release. The owner has authorized necessary
production/protected-source work; do not ask again for that existing scope.

## October 24 Android internal test — available; wider release incomplete

The existing Google Play app (4972969608428854795), package
`io.worldexplorer3d.app`, now has **version code 2 / 5.6.1-test.2 published on the
active internal track** 4701521177239633849. Only the fresh World Explorer list
with the signed-in owner account is selected; the unrelated RGE256 list remains
unselected. Code 1 is excluded. The owner-eligible invitation was verified at
https://play.google.com/apps/internaltest/4701521177239633849 . Accept invite was
left to the owner. Google currently displays `io.worldexplorer3d.app (unreviewed)`.
There is no public Android production rollout or broad tester mailing.

The signed AAB was rehashed against its signing receipt before actual Console
upload and accepted: SHA-256
`ce0cb18a6bf4e80a7ef59bca452e9fa29f19de127aec14bb2334a29511e15780`.
Android 10/API29 minimum and API36 target remain unchanged. Build/lint
40053369082 and official v3 signature verification remain valid; no native
rebuild was performed for this continuation. Signed artifacts and durable-key
instructions remain under `docs/android/TEST-RELEASE.md` and
`output/research/android-testing-2026-10-23/build-65949abc/`. This is a Trusted
Web Activity of the existing game, not the Godot version.

The owner unlocked the Mac and approved the previously presented IARC terms.
The initial owner questionnaire was retained and corrected against actual
source. The new questionnaire was saved October 24 at 8:32 AM; Console shows
IARC Completed. Ratings: ESRB Teen, PEGI16, USK16, generic/Russia16+, Brazil14+,
South Korea15+, TaiwanPG12, AustraliaPG and Saudi Arabia18. No global all-ages
claim. Human violence, rare medical-drug use/reference, digital purchases,
interaction and location sharing are disclosed. Unsupported war setting and
user-blocking answers were removed. Reporting/moderation and optional private
invited rooms remain disclosed. These ratings do not mean Google app review
has passed. The final target-audience form has not been submitted.

Free download, Game/Adventure, HTTPS public contact/privacy and No ads,
government, health or financial features remain saved. Advertising ID is now
saved as No, consistent with native manifest/dependencies. The store text,
512x512 app icon and 1024x500 feature graphic are saved as a draft. Required
real app screenshots remain outstanding; old browser proxies were not relabeled
as physical-phone evidence. The 16-category Data safety/security/deletion draft
is preserved; exact per-type handling/purposes and provider/analytics sharing
review remain incomplete and unsubmitted. Cookieless limited measurement is
not a complete analytics opt-out. Do not mark all analytics automatically optional.

A dedicated empty reviewer account has been created with complimentary,
non-expiring Pro access, normal user permissions and no Stripe customer/admin
privileges. Normal email/password sign-in and own-profile read passed. This is
live-service evidence, not Android UI or App Check qualification. Credentials
are owner-only outside the repository and have NOT been shared with Google;
a specific owner approval question remains pending. English reviewer instructions
are prepared. Google blocks the audience questionnaire until reviewer access
is completed; do not falsely declare all app features unrestricted.

Concrete pre-closed/public work:
- Resolve the existing Stripe checkout for digital Pro room/feature benefits
  against Play payment policy. These benefits are not pure tips. A consumption-only
  Android experience can preserve web commerce and existing account benefits;
  Play billing/approved programs are alternatives, not implemented or presumed.
- Add effective user blocking through existing social/session owners. Chat has
  reports, profanity/contact restrictions and rate limits, but no player block.
  Verify explicit pre-UGC terms acceptance across guest/public chat and other
  uploads; capture permission/version records are not proof of global chat consent.
- Finish accurate app-access/audience/Data safety forms and genuine screenshots.
- Obtain actual Play-installed phone checks: fullscreen/cold launch, touch and
  rotation, offline/retry, resume, auth/App Check, selected-place loading,
  retained progress and personal/weekly rooms. No phone or emulator was tested.
- Run the account's required 12 genuine continuously opted-in closed testers for
  14 days, then apply for Google's production access. Internal testing does not
  satisfy or bypass that requirement.

## October 24 Live GPS disclosure — released

Source inspection confirmed that GPS-follow moves the walker while rooms
publish its world pose and geographic origin. The existing consent dialog now
explains that this can reveal the player's real location and offers solo mode
as the choice for avoiding room sharing. The privacy page also explains that
pausing GPS does not erase a previously shared position. GPS/room behavior,
ownership, assets and admission were not changed.

Production is `5.6.1+e80d473f17b2.83fbf9c53fbab14e.production`, compiled source
`e80d473f17b2e0026a6604fb2e08219a0b960bf4`, Hosting `d41966c1156b4857`, asset
manifest SHA-256 `8dbb5aacd3fdd96dcb8313f8b3f163e25467ca99e8c9c90ab6c798f10f8ef86a`.
Staging is `5.6.1+e80d473f17b2.e012705ec7c75a6f.staging`, Hosting
`897f8b887a942370`. Protected PR123 merged as
`537a0fa23520b254835f364b004286d109143ff5`; head/merge trees match. Required PR
checks, CodeQL, secret scanning and all post-merge workflows passed.

Only `app/index.html` and `legal/privacy.html` changed in the packaged assets;
all other 773 assets retain their previous bytes. The staging/production pair
differs only in the expected three Firebase configuration files. Two compiled
consent/cancel checks at desktop and mobile-layout sizes passed, screenshots
were inspected, both controls were reachable, Cancel left GPS off, and no
world was loaded. Local App Check CAPTCHA errors were retained: this provides
no new sign-in or physical-device qualification. Live HTTPS and exact served
bytes were verified in both environments. No repeated city/gameplay sweep.
Hosting configuration, Functions, rules, Auth configuration and existing player
records were preserved; the one dedicated reviewer account/profile is the only
new account record. Prior Digital Asset Links proof is retained and its
association asset is byte-identical.

Evidence and failed attempts: `output/research/android-testing-2026-10-23/`,
including `2026-10-24-console/`, `2026-10-24-disclosure/`, `play-upload-v2.json`
and the current `console-progress.json`. Previously released DD production and
new tested staging have complete byte-verified basis/overlay recovery archives.
Four raw package slots remain. Preserve the original final-production basis,
multiplayer/security bases, current production, dist, signing keys and rollback
anchors. The old failed version `22076af685d820ba` remains forbidden to activate.

Use the canonical architecture-evaluation worktree below. Original shared Git
metadata in Documents remains iCloud-dataless; do not reset/delete/replace it.
The original local HEAD remains 91bc5c37. Source was committed via authenticated
normal GitHub API and verified against the small metadata-only Git snapshot in
the ignored Android evidence folder. No whole-project source copy, force update,
original .git pointer change or history rewrite occurred. Subsequent documentation
commits do not require new Android or website builds.

The dated sections below retain earlier release/verification history; the
October 24 sections above supersede their identities and setup status.

## October 23 coordinated production release — complete

Production now serves `5.6.1+18c99008241a.80b42d96ae618efc.production`, compiled
source `18c99008241a86cc9f1cf855f792702ecefb6f91`, Hosting `f89779954d69534e`.
Protected PR117 merged as `0d58d98941e48d8197c821119596a2e5c7a99b39` from approved
head `962c8c0914d795be9684cb2b856506b25a8e2fc8`. Later verification-only changes
leave shipped app/Functions inputs unchanged; the measured final game assets
remain byte-identical. Required PR checks, CodeQL and stable checks passed.

Read `docs/verification/2026-10-23-PRODUCTION-RELEASE.md` for executed/retained
acceptance, limits and recovery. The ten-check targeted decision passed, without
claiming the historical full matrix. Current mobile loading/control/performance,
Moon return and exact complete6,009-cell coverage passed in one compiled city
session. First playable 62.854 s still misses 60 s target; post-data 42.909 s and
native mobile-layout 52.61 FPS passed current floors. Physical phones/Safari,
thermal behavior and higher concurrency remain unqualified.

Actual production weekly guest entry loaded Nürburgring, published native
walking poses and left through the UI. Two normal accounts created/joined/left
a private personal room through the packaged SDK; earlier full two-client
UI/chat evidence is retained. Production normal Chrome completed real tester
signup→24-hour confirmation→admin approval/preview/send→acceptance→manual reply
forwarding→withdrawal. Six messages reached owner Gmail Inbox with SPF/DKIM/DMARC
passing. Temporary build settings are blank again; disposable admin/room test
accounts and private room were cleaned up. No new app download is advertised.
Owner portal: https://worldexplorer3d.io/account/admin.html?view=testers .

Production has 84 Functions. Four tester Functions and source-only joinRoom are
active, both tester indexes READY and six TTL policies ACTIVE. Anonymous auth
and the single weekly-prefix rule are active. All 79 unrelated original
Functions, joinRoom configuration/IAM, other Auth fields, project IAM and all 84
staging Functions matched snapshots. Hosting retained prior configuration plus
three tester rewrites. Existing Resend webhooks and DNS were preserved; the new
production signed receiver is enabled with scoped secret access.

Normal hosted lookup/weather acceptance has fresh HTTP200 proof; production
Chrome showed Bergen's real forecast without console errors. A Codex in-app
browser signup had an attestation network error; unchanged ordinary Chrome
passed. No protection was relaxed. CelesTrak was unavailable on this network;
that status remains honest. No physical-device or all-provider guarantee.

Evidence/failures: `output/research/production-release-2026-10-23/`. Preserve
current dist, both raw archive bases, final paired packages and all rollback
anchors. Superseded pilots are byte-verified basis/overlay archives; only owned,
regenerable uploaded gzip bytes were removed. Prior production Hosting
`34fff00d671d0a0b` and released `d4516200e86c480f` remain. Recovery must retain
additive tester pages/services for already-issued links and private consent.

The sections below retain dated checkpoint history. The newest Android section above takes precedence for production identity and
deployment status; this completed-release section retains its acceptance evidence. The
browser release endpoint is complete; Godot and later architecture/visual
packages have not begun. Use the resumable current QA plan/report and justify
any new execution by actual source/feature changes. Do not restart old sweeps.

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

## October 23 security checkpoint (prior production)

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
