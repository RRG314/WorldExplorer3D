# Current development and release state

Updated October 25, 2026. Use the latest sections below for current identities;
dated sections further down retain historical evidence. The owner has authorized
necessary production/protected-source work; do not ask again for that scope.

## October 25 mobile vehicle controls — candidate in verification

The owner reports successful Motorola startup after Play version 4, then difficult
car steering. The candidate separates horizontal progressive steering from car
pedals, reduces mobile steering authority at road speeds, and introduces explicit
opt-in calibrated screen-relative tilt for cars, aircraft and spacecraft through
the existing action reader. Optional car tilt speed uses service braking; flight
keeps independent speed buttons. Motion stays on-device. Sensor freshness,
permission cancellation and input-context lifecycle are owned; there is no new
scheduler or position writer. Touch, keyboard and controller fallbacks remain.
A guarded input-frame refresh now restores mobile controls after readiness and
suspends them at blocking overlays. World/admission/save/native contracts stay intact.

Focused control tests and actual source-browser car checks are recorded under
`output/research/mobile-vehicle-controls-2026-10-25/`. Initial test-harness failures
and local App Check errors are retained. These do not qualify a release, live
backend or physical sensor feel; frozen/staging verification is still pending.

## October 25 Android startup crash — version 4 internal test released

The owner reported the Play-installed app repeatedly stopping on a Motorola g
play (approximately 2026). The unchanged version 3 launcher reproduced a native
startup exception on an owned Android 15/API35 emulator: Browser Helper calls
`ManageDataLauncherActivity.addSiteSettingsShortcut` on connected launch, but
that component was missing from the manifest. Both enable/disable paths require
the component. This happens before the game or browser origin validation.

The repair declares that private activity and its canonical site-settings URL
using the existing Browser Helper. Package ID, permissions, minimum/target SDK,
browser security checks, upload key, web release and player data are preserved.
Version code 4 / `5.6.1-test.4` is built and signed. Build/lint and four focused
release-bytecode emulator phases passed: cold browser handoff, offline recovery,
retry and relaunch. The browser phases reach Chrome's first-run screen; they do
not qualify web gameplay, fullscreen association or the owner's physical phone.

The initial diagnostic device setup failed because AVD directories differed.
Its next attempt captured the real crash but incorrectly exited success because
`rg` was unavailable inside a shell conditional. That result is explicitly not
accepted as a pass. The replacement Node checker rejects the retained real crash
and a silent return home, and requires phase-specific foreground/UI evidence.
Three focused checker regressions are registered in the normal component suite.
The initial PR inventory failure (missing registration) is retained too.

Native candidate source is `1e644245ba11df70059954c2f6a92134a35128b7`, build
40162826077. Signed AAB SHA-256 is
`8f8595385fa25821449341ec83adfc4c2715fc258bf540ece8e4f1da2e203a55`.
The owner enabled the extension's file URL setting. The unchanged signed bundle
was rehashed, uploaded, accepted and published October 25 at 9:09 AM Eastern to
internal track `4701521177239633849`, release 4. Console confirms Active and
Available to internal testers; code 3 is excluded, supported-device counts are
unchanged, and the existing tester selection and opt-in link are preserved:
https://play.google.com/apps/internaltest/4701521177239633849 . Google advises
that the update usually appears within an hour, occasionally longer. Update to
`5.6.1-test.4`; do not reinstall broken code 3 or use the upload-key APK as a Play
update. The owner confirms October 25 that Play version 4 updated successfully and the game now opens on their Motorola. Their next report concerns difficult touch car steering; this confirms startup, not all-mode phone performance.

Closed Alpha's code 3 pause became effective. The exact same code 4 bundle was
added from the library, with code 3 excluded. Its rollout and track resumption
were submitted together. Google now confirms Changes in review for four changes:
code 4, resumption, the saved selected-location full description and eight actual
gameplay phone screenshots. The prepared, hash-verified screenshot set replaces
the two menu images and covers Monaco, Baltimore, Las Vegas, aircraft, driving,
research vessel, submarine, spaceflight and Mars. Existing icon/feature-graphic
AI labels are preserved; the real gameplay images are not labelled AI-generated.
This is submitted closed testing, not Google approval or public Android release.
PR130 passed all required checks and merged normally using the repository's
required squash method as `8e33229d96dac0ebb1c119b93fb0eeda32c0cf92`; its tree
equals the reviewed head. All four post-merge workflows also passed. No new native
build or repeat game sweep was run for the upload or documentation updates.
See [the focused repair record](docs/verification/2026-10-25-ANDROID-LAUNCH-CRASH.md)
and `output/research/android-launch-crash-2026-10-25/play-version-4-delivery.json`
for the latest receipt. Earlier failed and blocked evidence remains in that folder.
No game-wide sweep, web/backend redeployment or new signing key is needed.

## October 24 selected-location defaults and community safety — released

The owner's accepted foundation is implemented: selected-location Earth play is
labelled as the default; new ocean voyages also default to the selected dive
site. Extended Earth scenery and continuous ocean voyages are separate explicit
Settings choices. Existing explicit preferences and v1/v2/v3 saved voyages retain
their contracts. Settings owns the ocean preference before its lazy runtime loads;
failed persistence keeps the previous mode. Ground transport remains finite to
the selected source, and rooms share a selected origin.

Community rules require explicit per-account acceptance before room admission,
chat and capture/contribution/overlay publication. Existing Auth, App Check,
room transactions and Firestore rules enforce the boundary. Persistent private
player blocks use the existing social/session owner to filter old/new chat and
invitations, with an accessible Unblock list. Shared physical world changes stay
consistent. Invitations no longer try to read a recipient's private inbox.
Account removal cleans up consent and incoming/outgoing block references.

Eight focused components, five actual Firestore rule cases and the controlled
real-browser consent/admission/chat/block/reload/unblock/invite/weekly journey
passed. Desktop/mobile-layout Settings checks passed, including choosing ocean
streaming before ocean initialization and retaining it after reload. Two targeted
existing voyage save cases passed. The final browser run had zero page/console
errors. Earlier failures remain retained. No repeated city or full release sweep,
physical-phone, live authentication or higher-concurrency acceptance is implied.
See [the implementation and verification record](docs/verification/2026-10-24-LOCATION-DEFAULT-COMMUNITY.md).

Google saved the completed 16-type Data safety handling/purpose declarations.
The owner explicitly authorized Analytics Data Processing Terms; the account UI
confirms acceptance on October 24. Free pricing was verified. Closed Alpha uses
only the existing one-owner World Explorer tester list and the feedback mailbox;
no unrelated list was selected or invitations sent. Gameplay screenshot upload
still requires the browser extension's file URL permission. No Google review,
Android phone acceptance or genuine 12-person/14-day test period is claimed.

Protected PR127 merged as `2e32273f2d5e46cbf39f26559e0e1ecb7da42a3d`; required
checks, security scans and all four post-merge workflows passed. Its head and
merge trees match. Production serves
`5.6.1+59d6712db577.c1507cbdad82b91e.production`, Hosting `3b6cffd49531a588`,
asset manifest SHA-256 `3a7c24b45fbdd7e4c218ed00c7bac23c5564c4c5218f3fdbb51621e4936b2e3a`.
Staging serves `5.6.1+59d6712db577.8d8d82cdc6d2dde4.staging`, Hosting `34c246395d413c68`.
Both compile `59d6712db57791defd268fcb8cac0e2cc098a3a7`; the pair differs only
in the expected three Firebase configuration files. All 43 changed production
files matched served bytes; 738 preceding delivered files are unchanged.

Nine existing Functions are updated in each project. Their configuration/IAM,
the other 75 Functions, Auth, project IAM and Hosting configuration were preserved.
The additive blockedPlayers.uid index was READY before updated deleteAccount.
Two disposable staging guests passed actual HTTPS Auth/rules/admission, private
block writes/read denial and normal account deletion, including incoming blocks,
consent and membership cleanup. The weekly room/owner survived; both guest
accounts and their temporary tokens were removed. No email journey was repeated.

The final account-transition review reproduced retained private social rows
before new-account snapshots. The existing global subscription cleanup now clears
friends, recent players, invites and owned rooms with their account. A ninth
focused test proves clearing before block readiness, rejection of late old-account
callbacks and acceptance of the new account's rows. This frontend-only follow-up
preserves the qualified backend/rule/native inputs; see the verification record
for its delivery scope. The exact final frontend identity and activation status
are recorded in `output/research/location-default-play-2026-10-24/account-production-web-activated.json`;
that follow-up does not change the qualified Function, rule or native inputs.
Its opened social panel also uses the existing interface theme variables for
background, text and summary, correcting inherited light text on a light card.
See the final source/UI-theme receipt for that small presentation follow-up.

Google registered the existing package and public signing certificate. Closed
Alpha uses only the one-owner World Explorer list, feedback mailbox and unchanged
signed Android code 3, with 177 countries/regions selected. Store wording and all
15 closed-release/declaration changes were submitted; Google shows Changes in review. The existing two
accurate compiled UI screenshots are retained; eight prepared gameplay replacements
still require extension file URL permission. This does not qualify a physical
phone or complete Google's genuine 12-person/14-day closed-testing requirement.

The dense-city San Francisco initial/retry failure recorded in the feasibility
assessment remains separate and is not repaired by switching defaults. No claim
of complete worldwide interactive streaming, device performance or Google policy
approval is made. Original dist, rollback bases, uploads, assets, history and all
failed evidence remain; superseded packages have byte-verified recovery overlays.

## October 24 world-mode feasibility assessment

Current source supports selected-location Earth gameplay with optional moving
scenery; physical transport still has a finite selected-area source. Personal
and weekly rooms share one selected origin. Separate ocean streaming has its
own bounded tile/frame/save contract. Preserve these modes and existing features;
do not classify scenery extension as complete worldwide interactive Earth.

The recommended browser foundation remains selected locations. Seven focused
cross-module model scenarios passed; live manifests still identify b48. No game
code/defaults, world data, services or deployment changed, and no full-city or
historical release tests were repeated. The October 14 fallback followed a
recorded road-contact/recovery failure; that repaired historical defect is not
asserted current. The recent San Francisco initial/retry failures occurred in
fresh sessions with optional Earth scenery off and remain a separate loading
fault requiring diagnosis.

See [the feasibility assessment](docs/architecture-evaluation/2026-10-24-WORLD-MODE-FEASIBILITY.md)
for current source evidence and the finite three-area route/return, complete
physical/interactive publication, origin/save/peer agreement and whole-resource
acceptance needed before any wider ground-streaming claim. Keep the location
option and current session/scheduling/actor/lease authorities.

## October 24 Play edition — web released; Android v3 internal test active

The public name is **World Explorer 3D** in the saved Play listing, native label
and browser install manifest, including the short name. The package remains
`io.worldexplorer3d.app`. Google's temporary unreviewed label is controlled by
its first-review process; do not create a duplicate app or promise immediate removal.

Production is `5.6.1+b48f27561a9c.b114089627016e66.production`, Hosting
`513b12b8f2df377c`, asset manifest SHA-256
`7569d8248c765142919d3003e2399872620356be1eba9989fa18fba46537887f`.
Staging is `5.6.1+b48f27561a9c.414b57dc65f2c2f5.staging`, Hosting
`81cd842af05a2be9`, asset manifest SHA-256
`3c5221d45844b654759e5e51c40e72197291b1139ef17862d6bb9980c7d988f3`.
Both compile source `b48f27561a9c751405e0b2b4437391c23763dd8b`.
Protected PR125 merged as `0bb18f3e1108de89237070f542448a62294337c1`;
head/merge trees match, required checks and all four post-merge workflows passed.

The Play edition marks launcher/deep-link URLs through existing Android Browser
Helper hooks. Its browser presentation context persists through navigation,
reloads and same-origin new-tab links; denied storage retains the marker in URLs.
It hides purchase offers and rejects checkout/upgrade-capable Stripe portal calls
before network access. Entitlements and receipt reads remain available; ordinary
web commerce retains its protected API. This context grants no account benefits.
The Account Center mobile grid now fits the viewport, the public mobile footer
exposes Account, and every account/capture billing reader uses one module identity.

Six focused distribution tests, context ownership and unresolved-name checks
passed. Source-browser navigation and controlled account layout passed; revealing
static protected panels was layout inspection, not sign-in evidence. Compiled
globe/room options and the signed-out account gate passed. Initial CI module-version
failure, stale menu/precondition errors, genuine mobile overflow reproduction and
local CAPTCHA/Firestore failures remain retained. No new live auth/App Check or
physical-device qualification is claimed. Staging/production differ only in the
expected three Firebase config files; 741 preceding assets are byte-identical.
World data, coverage, transport admission, Hosting configuration, Functions, rules
and player records were preserved. Exact changed served bytes were verified.

Android **version code 3 / 5.6.1-test.3** was uploaded, validated and published
October 24 at 4:36 PM to active internal track **4701521177239633849**.
Only the fresh World Explorer list with **one owner account** remains selected;
the unrelated two-user RGE256 list remains unselected. Code 2 is excluded from
this release. The owner-eligible opt-in URL remains
https://play.google.com/apps/internaltest/4701521177239633849 . Invitation
acceptance/installation remains the owner's action. There is no public Android
rollout, broad mailing or physical-phone acceptance.

The signed v3 AAB was rehashed before actual upload: SHA-256
`dfca113d6a2322679e1092e8b5c68831ca62f05982dc0d14e9830c0f9b98c651`.
Native build/lint 40129219761 and official package signature verification passed.
Native source is `3c02db8335d26bc0e56e494363439444846f2506`; the subsequent b48
billing-import correction leaves native inputs unchanged. Minimum API29 and target
API36 remain unchanged. The existing durable upload key was reused. This is the
existing browser game in a Trusted Web Activity, not a Godot version.

The corrected IARC questionnaire is Completed: ESRB Teen, PEGI16, USK16,
generic/Russia16+, Brazil14+, South Korea15+, TaiwanPG12, AustraliaPG and Saudi
Arabia18. Human violence, rare field medicine, interaction and location sharing
are disclosed; unsupported war and blocking claims were removed. Target audience
is saved as 16–17 and 18 and over. These ratings are not an app-review pass.
Free pricing, Game/Adventure, public contact/privacy and No ads/advertising ID,
government, health or financial features remain saved.

A private empty normal reviewer account with complimentary nonexpiring Pro access
passed normal password sign-in and its own-profile read. Access/instructions are
saved with Google, without partner/device-feedback sharing. It needs no trial,
purchase or OTP; credentials remain owner-only outside the repository. This is
live-service evidence, not Android UI/App Check acceptance.

The store listing is saved and marked Ready to send for review. The app icon and
feature graphic are declared AI-assisted; screenshots are actual unedited gameplay.
The gameplay pack's latest Console upload state is recorded in
`output/research/play-gameplay-screenshots-2026-10-24/selection.json` and the
operational receipt. Do not treat prepared files as an uploaded listing.
Data safety retains the 16-category/security/deletion draft; exact per-type
handling/purposes and provider/analytics sharing remain incomplete and unsubmitted.
Cookieless limited measurement is not a full analytics opt-out or proof all
analytics is optional.

Concrete remaining pre-closed/public work:
- Add effective player blocking through existing social/session owners and verify
  explicit pre-UGC terms acceptance across guest/public chat and uploads. Reporting
  exists; it is not persistent blocking. Preserve account-deletion cleanup.
- Finish accurate per-type Data safety purposes/handling and provider-sharing
  review. The Play consumption-only implementation is not Google policy approval.
- Complete gameplay screenshot upload if the operational receipt still says pending.
- Obtain Play-installed phone checks: fullscreen/cold launch, touch/rotation,
  offline/retry, resume, auth/App Check, selected-place loading, retained progress
  and personal/weekly rooms. Mac touch layouts are not physical-device evidence.
- Run 12 genuine continuously opted-in closed testers for 14 days, then apply for
  production access. Internal testing does not satisfy that requirement.

Evidence and failed attempts: `output/research/play-completion-2026-10-24/` and
`output/research/play-gameplay-screenshots-2026-10-24/`. Gameplay photography uses
the compiled b48 staging app through actual controls, with no pose setters or
provider fixtures. Dense-city and provider failures are retained and are not
performance passes. No historical full-city/release test sweep was restarted.
Owned capture browsers were closed with the existing cleanup helper. Disk reserve
interruptions are recorded. Identical assets in four retained packages, the
original dist, runtime assets and duplicate screenshot evidence now share APFS
copy-on-write storage; every affected byte was rehashed. No build, asset, history,
player data or evidence path was deleted. Preserve all recovery bases/overlays.

Use the canonical architecture-evaluation worktree below. Original shared Git
metadata in Documents remains iCloud-dataless; do not reset/delete/replace it.
The original local HEAD remains 91bc5c37. Normal GitHub API commits and the tiny
metadata-only snapshot under the Android evidence folder preserve source history.
No original .git pointer change, force update or whole-project source copy occurred.
Documentation-only follow-ups do not require new Android/web builds.

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
