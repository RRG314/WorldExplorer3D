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
- Ten files under `docs/architecture-consolidation/`: first-pass system/feature/authority inventory, ordered work and honest evidence. `CURRENT-STATE.md` and `progress.md` record the local checkpoint; three older system/architecture indexes now identify their historical scope and link the current review.

## Remaining risk

Full source chain passes **2,547 tests in 470 files**, with dependency/ownership/boundary/name/inventory/sensitivity checks. The ordinary local driving run loads and moves but is **incomplete/failed** on App Check and provider errors. Its screenshot is retained, including pavement detail requiring matched-data review. No current full-game performance improvement, immutable candidate acceptance, physical-device acceptance or broad account/capture workflow certification is claimed.
