# Bounded consolidation sequence

## C1 — Account identity at the protected-request boundary

Evidence: `js/function-api.js` checks an optional caller UID only once before the first request. Wallet/property callers omit it; their cached authorities can outlive account changes. Health already supplies its UID. A successful old-account reply can reach a new session, and a safe-routing fallback can dispatch after an account switch.

Canonical owner: existing protected Function transport owns request identity, cancellation and outcome uncertainty. Connected domain owners supply their captured account. Server transactions remain the only account-data writer. Preserve payloads, receipt IDs, non-replay policy and schemas. Characterize changes during token acquisition, App Check, routing fallback and response-body delivery; check ordinary success, guest/public calls, errors and deadlines. Rollback: revert C1 source/test commit; no migration.

## C2 — Wallet projection and connected subscription lifetime

Wallet and property fallback duplicate currency-v2 projection/legacy conversion. Keep one pure projection owner and retain the fallback subscription for callers without a shared wallet. Both account-bound owners must ignore stale snapshots/errors and reject stale commands; closing an authority must not cancel or replay an already committed server mutation. Test shared and standalone paths, legacy wallets, account switches, dispose and reconnect. No server or schema change.

## C3 — Transport dependency direction

Fresh graph cycle: structure semantics → transport surface compiler → tunnel obstruction limits → structure semantics. The compiler only needs the scalar obstruction-bound query, while the obstruction builder needs completed surface sampling. Move the pure query to the existing lower-level tunnel envelope module; keep the old export as a compatibility adapter. Preserve all heights, roof limits, road surfaces, portals and caller identities. Characterize query boundaries and run actual bridge/tunnel/compiler regressions plus source graph and browser driving. No geometry redesign.

## C4 — Review and checkpoint

Run focused tests before/after each slice; run the full source chain once integrated. Execute a bounded real-browser driving journey and account-race browser fixture, inspect state/images and errors. Record full-runtime performance as unverified unless matching measured runs establish it. Update every required audit document with explicit evidence levels. Commit a clean local checkpoint; no deployment or deletion.

## C5 — Durable purchase and service recovery — verified locally

Implemented in `a64f92b2`. Persist account-bound command before dispatch; preserve
receipt identity across reload/midnight; store delivery with its receipt marker;
retain original service target. Native browser, actual transaction modules and
HTTP/emulator concurrency tests pass. Existing global unowned service entries
are preserved, awaiting authenticated legacy reconciliation. No guessed UID.

## C6 — Measured mapped-water readback repair — verified locally

Implemented in `940caf4c`. Original rasterization plus transferable bitmap and
owned worker preserves every pixel. A different canvas hint failed parity and
was rejected. Native Chrome measurements improve this mechanism's frame stalls;
whole-world performance is not certified. Worker failure/cancellation retain
fallback and old complete scenery. No geometry or coverage changes.

## C7 — Backend/permission preservation — verified on emulators

Implemented in `016ab873`. Commerce retry/account/cross-day/refund checks are now
part of the fifteen-stage gate. All fifteen stages pass across two explicit
isolated runs, including actual two-world vehicle/control/chat/property/shared
expedition journeys. No security policy or production records changed. Ordinary
hosted App Check remains a separate acceptance class.

## C8 — Delayed service targets and durable companion care — verified locally

Implemented in `2313152b`. Every reply retains its original target, care applies
to the latest persisted companion, and XP accepts an explicit recipient. Failed
save leaves a funded service pending; duplicate award receipts do not add XP.
Seven actual-module cases and four native IndexedDB/browser cases pass; the full
source chain passes 2,575 tests. The final immutable-world run is recorded in
VERIFICATION, with its exact result and build identity.

## Final checkpoint requirements

- Reconcile the complete discovered module census, action preservation matrix,
  authorities, incomplete feature dispositions and evidence with final source.
- Validate a separate immutable package; preserve production dist and the four
  rollback packages. Hash rather than infer artifact preservation.
- Record actual source/browser/backend outcomes and unresolved classes. Commit
  source and authoritative documentation locally; do not push or deploy.

## Remaining product and release dependencies

These are bounded unresolved work, not completed functionality or indefinite
new phases. The consolidation brief permits explicit disposition; it does not
permit risky implementation without established parity.

| Priority | Work / authority | Required next evidence and stop boundary |
| --- | --- | --- |
| P1 | Capture index validation (`rdt-building-index.js`) | Prior profile attributes 57 ms of a 116.7 ms frame to `matches`. Preserve in-place footprint/identity edits. Introduce explicit publication/mutation revision only after all real writers are traced; compare a matched route and exact nearest ordering. Array-identity caching alone is invalid. Aircraft colliders use a separate list and do not justify an index change. |
| P1 | Regional GPU preparation (`terrain/far-field.js`) | Pinned Three.js 0.128 lacks `compileAsync`. Measure bounded texture/geometry/shader preparation before atomic handoff; cancel/release rejected work while retaining the old region. No blanket prewarm or renderer upgrade without baseline parity. |
| P1 | Historical commerce (`economy` + server receipts) | Unowned old global records cannot safely be assigned to the current account. Authenticated reconciliation must prove receipt ownership and effect state before import/refund. Preserve bytes until then. |
| P1 | Hosted/physical release acceptance | Use existing authorized staging attestation or explicitly approved temporary credentials; then ordinary account/capture/privacy and travel acceptance on one candidate. Named Android/iPhone/GPS/AR require real hardware. Emulator results do not close these gates. |
| P2 | Remaining context writers | Census includes direct and known injected writers. Trace each proposed migration by lifetime/units; only migrate reproduced conflicts. No broad ECS conversion or camera/actor rewrite. |
| P2 | Venue and full-world performance | Aquarium/museum functional routes remain, but heap/entry and frame/transfer budgets need matched fresh measurement. Preserve failed receipts; no threshold relaxation. |
| P2 | Gameplay/content breadth | Worldwide detailed roads, full CERN/careers/farming, new ocean species/spearfishing, and additional venue floors need their own complete supported journeys, licensed assets and budgets. Existing bounded features remain available. |

No deletion or wholesale rewrite is justified by the present evidence. Untraced
callers or failed parity stop the affected slice, not independent review.
