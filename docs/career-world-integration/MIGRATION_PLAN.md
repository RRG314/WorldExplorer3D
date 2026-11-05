# Migration and rollback plan

This plan is conditional on owner architecture approval. No focus database, account migration, starter re-grant or production navigation migration is implemented in the review.

## Smallest additive change

If C is approved, store optional versioned guidance metadata in the existing profile via `saveProfile(current => …)`. Distinguish `startingInterestId` (optional historical preference), `activeFocusId` (nullable/current ranking preference), and guide preference/definition version. Reference the existing catalog; do not copy it into a new persistent registry. Active experience/mission remains in its existing domain. Fields are proposed names, not committed schema.

Legacy profile with no metadata means no focus, not “unknown class” or forced creation. Do not infer permanent choice from old XP or activity. Validate known IDs for execution; preserve unsupported future metadata for recovery. Existing source normalizers retain unknown fields; verify older readers before relying on this for compatibility. If a reader cannot preserve new data safely, bump the supported export envelope and reject before writing, following current media-backup precedent.

## Migration cases and gates

| Case | Required behavior |
| --- | --- |
| New guest | Original profile/character path; no account required, no second Backpack |
| Existing guest | Original character, items, claims, photos, companions, homes and course state remain; optional focus only |
| Existing signed-in player | UID-scoped online receipts/wallet/vehicles remain; local Journal scope explained |
| New account in used browser | Do not delete or silently assign existing shared local Journal. Explicit owner-facing scope/recovery; no automatic merge/upload |
| Legacy pre-character profile | Existing conservative character migration + original backup; no invented career completions |
| Completed course/lesson | Offer review/next, no forced replay or duplicate starter reward |
| Active mission/voyage/room | Preserve current task, pod/ship/return reserve/world frame and membership; focus cannot cancel it |
| Concurrent tab | Latest-profile functional update or domain expected revision; no stale whole-profile overwrite |
| Unknown future domain/version | Preserve bytes, refuse unsupported execution/import before mutation |
| Quota/storage denied | Explain session-only/unsaved state, preserve known good record and existing backup/export |
| Import/export | Roundtrip original media pixels, event/claim IDs, item custody and unknown fields; no histories silently combined |
| Rollback | Revert presentation/feature flag without resetting progression. New metadata may remain inert; retain migration snapshots |
| Account switch during await | Current UID/session checked before and after async; late response cannot update another account |
| Device/platform | Web/native consumers accept same serializable intent; no DOM-specific domain schema |

Prototype D exercises representative legacy data, future keys, a canonical item, backup and character rollback through the original memory store. It does not replace actual IndexedDB/quota/two-tab/export acceptance of the new metadata after implementation. Existing real Documentary/Botany media histories remain separate accepted evidence; do not manufacture a combined “fully completed” player.

## Refactor/rollout sequence

Add pure derivation and compatibility tests → add optional metadata and explicit actions → replace overlapping guidance views incrementally → wire existing lessons/entries → source/affected runtime checks → immutable staging candidate → exact hosted artifact/affected user journeys → owner review/release gates. No production deployment as part of this assignment. Keep old routes/IDs as aliases until a reviewed migration map exists.

Do not rewrite storage, share local Journal by account automatically, change wallet rules or replace room authority during a presentation release. Full cloud Journal sync and cooperative reward authority are separate scoped projects. Rollback builds, histories, assets and failed evidence remain protected.
