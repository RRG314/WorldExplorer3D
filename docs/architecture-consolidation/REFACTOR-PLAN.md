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

## Subsequent high-risk work (separate measured slices)

1. Characterize lost commerce acknowledgments through the actual model/server receipt boundary; the caller currently collapses unknown outcomes to unavailable and allocates a new ID on a new attempt. Design durable account-bound recovery with reload/duplicate-effect tests before changing storage.
2. Profile and remove full capture-index validation from active travel without missing in-place building edits; compare ordinary route frames and unchanged coverage.
3. Stage regional GPU uploads/shaders before atomic handoff; cancellation must retain the old complete region and release rejected work.
4. Trace remaining shared-context writers by semantic owner (actor, camera, environment), migrating only demonstrated conflicts.
5. Finish adversarial account/room/capture subscription and permission tests in emulator/browser; include logout, reconnect and stale completion.
6. Complete broad preservation matrix on one immutable candidate and physical-device classes. No claim of repository-wide verification before these close.

No deletion or wholesale rewrite is justified by the present evidence. Untraced callers or failed parity stop the affected slice, not independent review.
