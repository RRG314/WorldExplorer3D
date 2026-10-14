# Architecture consolidation — October 13, 2026

The local consolidation includes implemented, tested repairs through C8 and a
repository-wide inventory with explicit dispositions. **This is not a claim that
every gameplay feature or release gate is complete.** Production remains 5.5;
these changes have not been pushed or deployed. Source, history, player data,
production dist and rollback packages are preserved.

## VERIFIED COMPLETE

- Protected requests, wallet/property subscriptions and fallback dispatch retain
  their initiating account. Actual-module failure cases and native-browser
  account-switch/reconnect cases pass.
- Connected purchases/services now retain durable account-bound intent and the
  same server receipt through lost responses, reload and midnight. Backpack
  delivery and its marker commit together. Authenticated emulator concurrency,
  account separation and refund tests pass; native browser locks/reload/two-tab
  checks pass.
- Delayed services retain their original vehicle/vessel/companion. Care updates
  the latest saved row; XP goes to the treated companion, survives reload and is
  not duplicated. Failed saves leave service recovery pending. Seven focused
  actual-module cases and four native IndexedDB/browser checks pass.
- The water-mask readback worker preserves all 16,777,216 mask bytes. Matching
  native Chrome mechanism tests improved maximum frames from
  116.7/66.1/66.7 ms to 50.0/16.7/17.2 ms; background construction takes longer.
  This is a measured local mechanism improvement, not whole-world smoothness.
- All 2,575 source tests and structural checks pass. All fifteen backend stages
  pass across two isolated selected runs, including actual two-world shared
  objects/vehicle handoff, room chat/input restoration, property/network recovery
  and shared expedition recovery. The final immutable-world care/profile/reload check also passes five steps
  with no page errors or failed local assets; see [VERIFICATION](VERIFICATION.md).

Evidence and exact modified files: [change ledger](CHANGE-LEDGER.md),
[verification record](VERIFICATION.md),
[service target tests](../../tests/poi-service-target-current.test.mjs),
[HTTP commerce checks](../../scripts/verification/commerce-backend-current.mjs).

## IMPLEMENTED BUT UNVERIFIED

Supported product routes remain inventoried in the [system inventory](SYSTEM-INVENTORY.md)
and forty action/operation groups in the [preservation matrix](FEATURE-PRESERVATION-MATRIX.md).
The census is not a manual line-by-line review or exhaustive acceptance of every
catalog item. Ordinary hosted multi-account/private-capture flows, complete
sustained-world/venue performance and named-device/GPS/AR/assistive-technology
acceptance remain unverified on this candidate. Emulator or controlled browser
results do not close those classes.

## PARTIAL OR BROKEN

Traveling scenery extends beyond the selected Earth district, but detailed
road/collision/interior/activity gameplay remains district-bound. Venues,
careers, marine wildlife and cross-device progress retain the limits in
[INCOMPLETE-FEATURES](INCOMPLETE-FEATURES.md). Full-world frame/transfer and venue
heap/entry failures remain unresolved. Historical service records without trusted
account attribution are preserved; automatic reconciliation is not safe yet.

## CONSOLIDATED

Critical boundaries now have named owners: protected-request identity, shared
wallet projection, durable pending-commerce intent, Backpack receipt delivery,
stable companion-care recipient and water readback lifetime. The unchanged tunnel
roof query lives under the existing envelope owner with a compatible reexport;
the resolved static import cycle is removed. See [AUTHORITY-MAP](AUTHORITY-MAP.md).
The remaining direct/injected shared-context writers are tracked, not claimed to
be fully consolidated. No wholesale rewrite, world thinning or geometry redesign.

## DEFERRED

Capture-index revision ownership, bounded regional GPU preparation, remaining
actor/camera/environment writer migrations and broader venue/content work have
specific authority and acceptance dependencies in [REFACTOR-PLAN](REFACTOR-PLAN.md).
Array-identity-only capture caching would miss supported in-place edits and was
not applied. Three.js 0.128 has no `compileAsync`; an unmeasured renderer upgrade
or prewarm is not a completed repair. Unsupported deletion candidates, old save
readers and rollback artifacts remain protected by the [cleanup decisions](DUPLICATION-AND-DEAD-CODE.md).

## BLOCKED

Ordinary hosted verification needs a valid existing staging App Check context;
a temporary staging credential was requested but not created without approval.
The assignment brief explicitly stops affected changes requiring “new credentials
… not already authorized.” Physical-device acceptance also requires actual
named hardware. Local emulator and independent source/browser work proceeded.
Production deployment is outside this consolidation assignment; no security
restriction or release failure was bypassed.

## REGRESSIONS

No component regression was observed in the passing source chain, and the
completed backend/browser journeys retain their scoped behavior. Production
manifest preservation and final package integrity are separate checks in
VERIFICATION. Absence of every gameplay/performance regression is not established.
The original App Check/provider driving failure, existing performance failures,
and diagnosed verification-runner mistakes remain in the evidence ledger.
No failing assertion or budget was weakened to obtain a pass.

## NEXT ACTIONS

1. For release, finish ordinary hosted/account/capture acceptance with authorized
   attestation and named physical devices. Release the commerce frontend/backend
   changes together; the deployed older backend lacks the next-day recovery fix.
2. Give capture edits an explicit revision authority before removing the full
   validation scan; measure GPU preparation/cancellation before changing scenery
   publication. Repeat matched routes and exact coverage/retention checks.
3. Reconcile historical unowned service receipts only after authenticated ownership
   and effect state are proven. Preserve old bytes until then.

Continue from the preserved local commits and [baseline](BASELINE.md). These are
concrete remaining dependencies; they have not been relabeled completed work.
