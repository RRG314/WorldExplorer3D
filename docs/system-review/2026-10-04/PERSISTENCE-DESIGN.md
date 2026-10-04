# Planned persistence repair boundary

This is implementation preparation for package 5. No storage migration or condition-outbox redesign described here has shipped or been implemented by this document.

## Journal query authority

Keep original Journal records unchanged. A separate derived `journalOrder` store is preferable to adding reserved metadata properties to imported records: backups currently preserve unknown fields, and stripping a new reserved property could discard someone else's data.

Proposed database version 5 adds one derived metadata record per item, event and field-guide entry, keyed by `[collection, id]`, with a compound ordering index `[collection, descendingTime, id]`. Store negative finite numeric timestamps (fallback zero) so a forward cursor returns recent entries first and keeps primary-key ascending order for equal timestamps, matching existing IndexedDB stable ties. Missing/malformed timestamps remain visible as oldest entries; do not drop them because a native timestamp index omitted them. Memory fallback should use the same deterministic ordering.

Bounded list methods read only requested metadata entries and fetch their original rows in the same readonly transaction. Character migration reads the profile first and reads full history only when a real legacy migration is needed. Runtime bootstrap needs all Backpack items, claimed IDs and observed catalog IDs; it does not need every full event/guide payload or a second JSON clone of IndexedDB's already-cloned result.

Receipt status can use derived item disposition metadata (`acknowledged` with owner, `queued`, `device`) plus outbox owner/status indexes. Preserve existing semantics for duplicate/orphan outbox rows, acknowledged items with a still-pending row, owner separation and guest records. A bounded pending-receipt index must preserve the current numeric readiness comparison. Do not count rows belonging to a different account as that account's pending receipts.

Every writer, trusted receipt, import, rollback and migration must update derived indexes atomically with authoritative rows. Import/rollback rebuild indexes from the restored original data and outbox. Indexes are neither a second save authority nor exported user data. Backups retain all existing records and unknown fields. Version validation must support the new exported version and continue rejecting unsupported future versions.

Replace quadratic import matching with ID maps. Replace Backpack source-event scans with indexed lookup while preserving same-instance priority, canonical event merging, aliases, consumed items and deterministic first-existing resolution. Existing code can contain multiple same-event rows after an explicit instance update; tests must cover that case rather than assuming impossible input. The Journal remains the durable source for collected items if localStorage cannot hold the Backpack projection; no history truncation.

## Account condition outbox

The remaining demonstrated risk is multiple tabs overwriting one localStorage snapshot of pending/uncertain work. A shared transactional IndexedDB outbox per account is a candidate design: enqueue replaces only pending intent in transaction order, preserves any uncertain dispatched operation and its idempotency key, and dispatch acknowledges only the matching operation. A cross-tab Web Lock serializes dispatch; the backend's revision/idempotency rules remain authoritative. Storage unavailability must show non-durable state, not claim a save. Legacy localStorage work requires an explicit recoverable migration.

This design is not final until fixtures prove queue/dispatch/disposal races, lost acknowledgment, tab closure, offline reentry, account switching and denied storage. Successful replay may return a newer server state; adopt that confirmed condition only when no newer local intent exists. Guard both snapshot success and error callbacks by current account identity. Do not add a general multiplayer authority engine.

## Required tests

- Actual IndexedDB history at 0, 1k, 10k and 50k records; count visited/loaded rows for bounded lists and execute the real Backpack projection.
- Upgrade a real version-4 database, including missing/string/equal timestamps and unknown record fields; compare exports, claims and rewards before/after.
- Import replacement, rollback, malformed backup, transaction failure, quota/denied storage and two simultaneous profile writers.
- Guest/account A/account B receipt boundaries; duplicates, orphans and lost acknowledgments.
- Two actual browser tabs sharing storage, asynchronous condition mutations, uncertain dispatch during closure and recovery with no erased newer intent.

No source-only assertion or empty-profile benchmark closes this package.
