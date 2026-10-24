# October 23 coordinated browser release

Production is live at https://worldexplorer3d.io/app/ with build
`5.6.1+18c99008241a.80b42d96ae618efc.production`, compiled source
`18c99008241a86cc9f1cf855f792702ecefb6f91`, Hosting version
`f89779954d69534e`. Protected PR117 merged as
`0d58d98941e48d8197c821119596a2e5c7a99b39`. Its approved head
`962c8c0914d795be9684cb2b856506b25a8e2fc8` contains the identical shipped app and
Functions inputs plus verification registration/parser/provenance corrections.
The retained compiled artifact is deliberate; no city was replayed for those
verification-only changes. Required PR checks, CodeQL and stable checks passed.

The release completes the browser ownership cleanup, safe starting-area
readiness, the dismissible new-app tester invitation and email workflow, and
personal/canonical weekly rooms. It preserves assets, geographic exploration,
Backpack, Journal, save formats, coverage and the released security fixes. It
does not start the Godot port. Transport detail uses a finite selected-area
source, and each multiplayer room retains one selected origin.

## Executed and retained acceptance

| Area | Evidence and scope |
| --- | --- |
| Changed loading/publication | Focused lifecycle, cancellation, terrain/contact, worker and geometry checks; all 6,009 original mask hashes/order/area match. Compiled one-session mobile checks all passed, including complete regional coverage and worker retirement after Moon return. |
| Gameplay/performance | Actual touch walking/look, driving, rotation/input release and Paint palette checks passed. Native Mac mobile-layout proxy 52.61 FPS, p95/p99 33.4 ms, max 50.1 ms during background coverage. Earlier actual desktop45.8FPS and ocean60FPS are retained. First playable 62.854 s, including 15.980 s required-data wait and 42.909 s post-data preparation. The60s target remains missed. |
| Production rooms | A signed-out guest entered the actual Nürburgring weekly world, with1,427 buildings and 5,727 roads, walked 3.64 world units through native keyboard input and published valid poses, then left through the UI. Weekly room WMX8DA remained. Two normal accounts created/joined/left a private personal room through the packaged SDK, preserving owner/quota. This adds no second production city replay or32-client load claim. Prior full two-client UI/chat/discovery/reconnect evidence is retained. |
| Production email | One owner-only application through ordinary Chrome and real App Check; actual 24-hour email confirmation, pending review, authenticated approval without sending, preview without sending, explicit invitation, real acceptance, manual Gmail reply through Resend's signed webhook, and withdrawal. Six system messages were read in Gmail Inbox with SPF/DKIM/DMARC passing. The invitation used Inbox Promotions; other messages used Updates. No all-provider or Primary-tab claim. |
| Normal services | Fresh ordinary staging lookup and weather HTTP200; production Chrome displayed Bergen's forecast and Cloud Function logs confirmed fresh HTTP200. No debug attestation or weaker policy. |
| Other current features | Retain reviewed actual desktop controls/camera/map/pause, activities and creation, ship/deck/sub/scuba/recovery, lunar/Mars/space journeys, interior admission, native IndexedDB/reload/cross-tab/migration/backup failures, and controlled GPS/AR lifecycle/fallback evidence. Controlled activity end positions/timers and sensor inputs do not certify competitive routes, remote leaderboards or physical sensors. |

The ten-check hash-bound targeted decision passed. It explicitly does not claim
the historical full matrix passed. The initial source guard, stale facade string
assertion, missing test registrations and incomplete HTML extraction were fixed
without changing the measured delivered game bytes. The facade test now checks
actual material claims, shared textures and shader contract. HTML evidence uses
a pinned dev-only parser.157 newly registered focused cases passed; the required
component inventory and cleanup sensitivity check passed. Separate emulator
fixtures retain their explicit command and required isolated environment.

## Activation and preservation

Production now has 84 Functions: four additive tester Functions and a source-only
update to existing joinRoom. All 79 unrelated original Function resources,
joinRoom configuration/IAM, and project IAM matched their private pre-release
snapshots. All 84 staging Function resources were preserved. Both new tester
indexes are READY and all six TTL policies ACTIVE. The only Auth change is
Anonymous sign-in; the only rule change reserves the weekly room prefix.
Hosting preserved all prior configuration and added three tester rewrites.

Resend's production signed webhook and its scoped Secret Manager binding are
active. Existing webhook records were preserved; no DNS change or newsletter
audience was introduced. The owner-only application is withdrawn, temporary
build details restored to blank, and the disposable admin and three room test
accounts/private room retired. Consent/mail audit evidence stays private.
No actual new-app download is advertised. The owner reviews applicants at
https://worldexplorer3d.io/account/admin.html?view=testers and adds real build
access details when available; approval is separate from sending invitations.

## Practical limits and recovery

Physical phones, Safari, thermal/battery behavior, hardware controllers and
higher multiplayer concurrency remain unqualified. The Mac touch proxy is not
a phone performance certificate. The first 60 s cold-start target remains missed,
although safe-start and frame floors passed. CelesTrak was unavailable on this
network in both the normal browser and direct provider check; the requested
endpoint matches the provider's [documented GP API](https://celestrak.org/NORAD/documentation/gp-data-formats.php). Its unavailable state stays
visible, and no orbital observation is invented. Other live services remain
provider-dependent. An initial Codex in-app-browser production signup had an
App Check network error; the unchanged normal Chrome path passed. Production
provider keys/domains matched and enforcement was never relaxed.

Current dist, released rollback packages and both raw archive bases remain.
Superseded pilot packages are byte-for-byte recoverable from verified
basis/overlay records. The final staging/production pair occupies the other two
candidate slots. Only regenerable, already-uploaded gzip bytes were retired.
Owned test browsers used the existing cleanup helper; ordinary Chrome and its
existing tabs, the unrelated emulator, assets/history and player data were kept.

The immediate prior Hosting anchor is `34fff00d671d0a0b` at security source
`a82ff0abef27`; released source `233a5a7f...`/Hosting `d4516200e86c480f` also
remains. Private original joinRoom source ZIP, configuration, Auth/rule/Hosting
and IAM snapshots are retained. Additive mail records/Functions must be
preserved during recovery so already-issued confirmation/management links can
continue working. Reverting a game package does not justify erasing consent,
disabling active guest accounts or replacing unrelated configuration.

Operational receipts, failures, screenshots, hashes and recovery records are
under `output/research/production-release-2026-10-23/`; the targeted decision is
`output/release-evidence/current/coordinated-20261023/release-decision.json`.
This completed rollout supersedes older local-only/staging-only checkpoint
statuses. Future work should target an actual changed feature or missing device
qualification; do not restart the old 106/107-gate or 42-minute sweeps.
