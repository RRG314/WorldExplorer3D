# Change ledger

Source implementation commit: `a028e65e` (C1–C3 and regression runners). A transient Git index-write timeout interrupted the first commit attempt; the successful commit was inspected and contains all 13 intended source/test files. No index lock, history or source was deleted.

Baseline `64bab776`; local rollback ref `steven/consolidation-baseline-20261013`. No deployment, push, save migration, provider-policy change, geometry rewrite or asset deletion.

## C1 — Protected requests retain their initiating account

Affected files: `js/function-api.js`, `js/economy-api.js`, `js/property-api.js`; characterized in `tests/account-request-lifetime-current.test.mjs` and existing `tests/request-reliability.test.mjs`.

The actual pre-change modules accepted identity changes during token/App Check acquisition, routing fallback and successful response delivery. Wallet/property API builders discarded their caller's captured account policy. The common transport now captures the initiating UID for every protected request, rejects stale work before dispatch/fallback and prevents a late old-account success from being delivered as current. Wallet/property builders forward `expectedUserId` as transport options, never as server-trusted body data.

Preserved: request/receipt IDs, payload shape, ordinary success, public App Check calls, deadline/cancellation, no automatic replay after uncertain writes, and server authority. After dispatch a stale successful response remains an uncertain outcome; it is not reported as a proven rollback/refund. No persistent record is edited by this change.

## C2 — One wallet projection; account-bound subscriptions

Affected files: `app/js/economy/wallet-snapshot.js`, `connected-wallet-authority.js`, `app/js/real-estate/connected-property-authority.js`.

One pure projection now owns currency-v2 display and legacy scaling. The property fallback subscription remains for callers without a shared wallet and uses the same projection. Current UID/disposal guards fence snapshots, error callbacks, subscriptions and command admission; disposal still unsubscribes after an account changes.

Preserved: starting balance, valid legacy/current balances, subscription UI shape, server-owned mutations, personal local economy and property operations. No extra state manager or account store. Scope does not certify all async local service effects or every room/account subscription; those remain explicitly tracked.

Combined C1/C2 evidence: **17 new actual-module cases**; pre-change 3 passed / 14 failed. After change, these and existing request/server-commerce/property/client-commerce tests pass **56/56**. Native Chrome actual-ESM fixture passes three interaction/reconnect scenarios with controlled SDK/HTTP boundaries and no page errors. It is not live Firebase acceptance.

## C3 — Remove transport cycle without changing road surfaces

Affected files: `app/js/world/compiler/tunnel-envelope.js`, `tunnel-obstruction-limits.js`, `transport-surface-model.js`, `tests/tunnel-boundary-authority-current.test.mjs`.

Moved the existing `tunnelObstructionMaximumY` body unchanged into the lower-level envelope owner. Surface compilation imports it directly. The old obstruction module reexports the same function for compatibility. No station, grade, roof thickness, overlap tolerance, clearance, road width, mesh, portal or collision rule changed.

Before boundary/structure characterization passed. After **42/42** focused tests pass; the new adapter identity test proves both exports share one function. The fresh graph drops from one three-module static cycle to zero. Hidden runtime context cycles remain possible.

## Audit and verification maintenance

- `scripts/architecture-evaluation/system-review.mjs`: reuse existing inventory with explicit output destination and optional tooling root; include account support modules/untracked new source, event/subscription and persistence-call sites. Historical audit output is preserved. Static data-flow signals are not a leak/dead-code proof.
- `scripts/verification/current-contract-list.mjs`: register the two new regression files in the existing maintained suite.
- `scripts/verification/account-request-lifetime-current.mjs`: bounded native Chrome fixture, actual ESM imports, controlled SDK/HTTP, disposable state, owned cleanup, stored failures and explicit evidence tier.
- Ten files under `docs/architecture-consolidation/`: first-pass system/feature/authority inventory, ordered work and honest evidence. local operator notes (not published) and `progress.md` record the local checkpoint; three older system/architecture indexes now identify their historical scope and link the current review.

## C1–C3 checkpoint risk (historical; follow-ups below)

Full source chain passes **2,547 tests in 470 files**, with dependency/ownership/boundary/name/inventory/sensitivity checks. The ordinary local driving run loads and moves but is **incomplete/failed** on App Check and provider errors. Its screenshot is retained, including pavement detail requiring matched-data review. No current full-game performance improvement, immutable candidate acceptance, physical-device acceptance or broad account/capture workflow certification is claimed.


## C5 — Durable connected commerce recovery

Characterization reproduced lost buy/service acknowledgments and absent durable
reservation. Server characterization also failed next-day receipt replay and
command/receipt identity binding. New account-bound journal saves the request
before dispatch; the existing possessions Web Lock plus a same-page guard
prevents parallel charges. Shop and service recovery retain the original ID,
store, day and target. Backpack delivery and the receipt marker commit together;
ordinary saves retain that marker, so recovery does not resurrect consumed items.
The server returns the original item identity on duplicate receipts and checks
that immutable command fields match, including across midnight.

Files: `economy/connected-commerce-recovery.js`, connected wallet,
`player/backpack-store.js`, commerce model/runtime, `functions/economy-authority.js`.
No balances or existing save keys are deleted. New account-specific shop state
and pending journal are additive. Old global service records lacked trustworthy
account attribution; those bytes remain untouched, not automatically applied to
the currently signed-in account. Retrospective recovery of those legacy records
still requires an authenticated server lookup/migration decision.

Verification: 56 focused tests pass; native Chrome uses actual client/server
modules with controlled Firebase boundaries, real localStorage/Web Locks,
reload and two tabs. Four browser checks pass; image/state inspected, no page
errors. Full source chain passes 2,559 tests. This is not live Firebase commerce
acceptance. The frontend and backend changes must be released together; the
existing production backend cannot recover an old-day receipt. Evidence:
`output/architecture-consolidation/2026-10-13/commerce-*` and
`source-chain-recovery.log`.


## C6 — Preserve water-mask pixels while moving readback off the render thread

Measured the existing 4096² canvas mask in native headed Chrome. A CPU canvas
hint was rejected: 23,248 bytes and 3,104 threshold classifications changed.
An asynchronous bitmap followed by worker extraction preserved all 16,777,216
bytes. Production implementation keeps the original GPU canvas rasterization;
only its bitmap readback/red-channel conversion runs in a disposable worker.
Worker failure or missing support retains the existing cooperative path. All
completion/error/timeout/cancellation paths retire owned worker/bitmap resources;
no scene ownership or geometry handoff changed. The worker has a hashed runtime
entry in the existing Hosting packager.

Actual implementation comparison: baseline maximum frames 116.7/66.1/66.7 ms;
candidate 50.0/16.7/17.2 ms. Candidate total construction 234–373 ms versus
125–282 ms baseline: this trades background latency for responsive frames.
These are matched mechanism measurements, not whole-world performance acceptance.
Seventeen focused ownership/readback tests pass; full source chain passes.
The actual browser worker preserves every pixel; preview inspected. Evidence:
`water-mask-implemented-profile/report.json`, `water-mask-component.tap`,
`source-chain-water.log`. Rejected experiments remain under the same dated output
folder. No experimental canvas hint was applied to game source.


## C7 — Make commerce HTTP concurrency part of the backend gate

Added `scripts/verification/commerce-backend-current.mjs` to the existing isolated
backend sequence and updated the exact stage inventory from 14 to 15. This runs
actual emulator transactions and authentication, including two requests for one
receipt, a different account trying to sell/refund goods, next-day replay, and
concurrent refunds. It never targets production accounts. Eleven selected backend
stages pass; no permission/rule changes were needed. Initial Java PATH failure
was diagnosed by locating the existing JDK, not by altering app code or tests.

## C8 — Keep delayed services and care bound to their original target

The actual runtime functions reproduced six failing cases: replacement car,
vessel or companion receiving the first delayed service response; care XP going
to a newly selected companion; failed save reported as success; and missing care
still awarding progress. The original target is now checked for every receipt,
not only recovery. Companion care updates the latest persisted row atomically,
and XP accepts an explicit recipient while retaining the active-companion default
for other callers. Already-applied receipts return their idempotent result;
failed XP saves leave the funded service pending for recovery.

Affected callers: urban POI services and the ordinary Profile care control.
`tests/poi-service-target-current.test.mjs` executes the actual runtime functions
and owner; seven cases pass, including concurrent selection/progression. The full
source chain passes 2,575 tests. A native Chrome/IndexedDB integration fixture
passes four delayed-save/reload/replay/failure checks; image and text inspected,
no page errors. `companion-service-target-current.mjs` and
`consolidation-gameplay-current.mjs` retain explicit evidence scope; the latter is
the separate immutable full-world preservation runner. No control, geometry or
stored companion identity changed. No old data was deleted.

## Final preservation and handoff

C8 source is committed in `2313152b`; the consolidated audit and corrected
full-world runner are committed in `8c4a8f1b`. A separate immutable package from
that clean commit passes all five full-world care/reload/layout checks, packaging
integrity and the final 2,575-test source chain. Root and Functions production
dependency audits report zero advisories. Full evidence, failures and remaining
release limits are retained in VERIFICATION. Only two hash-verified superseded
local validation payloads were removed; their manifests/receipts and source
remain. No production, GitHub, player data, geometry or renderer-version change.
