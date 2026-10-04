# Planned persistence repair boundary

Package 5 is in progress locally. The transactional account-condition outbox is implemented and its eight real-browser regression cases pass. Journal version 5 and inventory scaling are now implemented locally, with source/component and disposable-browser evidence below; the assembled-world Journal/Backpack/reload journey and prescribed driving client also pass. Nothing in this document is a production receipt.

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

## Browser regression drafts

`journal-history.mjs` and `condition-tabs.mjs` have run against the current baseline and fail as expected. Journal storage is still version 4. The real two-tab test proves that disposing the older .9 tab overwrites a newer .4 durable intent. Their retained reports are `journal-history-before/` and `condition-tabs-before/` under `output/verification/architecture-polish/`. These failures are evidence of remaining work, not implementation completion. The first creates version-4 storage in a disposable profile before importing the current store. The second uses actual same-origin tabs/storage and controlled transport through the actual pure server mutation authority; it is a separate class from SDK/emulator acceptance.

The outbox owner should expose initialization and local-durability completion promises (`whenInitialized`, `whenDurable`) without making queue acceptance depend on a network reply. `dispose` must stop subscriptions/timers/adoption without rewriting or erasing the shared durable row. Already accepted local work continues to its storage commit. A successful idempotent replay must deliver `onConfirmed` when there is no newer pending intent. `connected-player-state` must guard success and error callbacks by current account and reconcile recovered condition state.

Keep all Journal rows intact in the v5 migration. Order metadata uses separate records, and transactions must include the derived store wherever items/events/guide entries or their receipt disposition change. Imported and rolled-back outbox rows need to rebuild disposition atomically. Use maps for import claim/instance matching and stable insertion-order indexes in the Backpack projection; preserve same-instance precedence even when multiple entries already share an event.

A related established-inventory risk needs bounded handling: the equipment UI currently rebuilds the full snapshot and all carried-item DOM even when its panel is closed. The direct equipped-definition hot-path repair is verified separately in package 4. During persistence integration, keep closed-panel updates limited to equipped state and use bounded presentation for open inventory contents. Do not truncate stored items.

## Transaction and rollback details to preserve

Keep `JOURNAL_STORES` as the original authoritative backup collections. Import and rollback transactions additionally include `journalOrder`, but backup/export payloads do not copy derived rows. Rebuild derived rows from the restored originals and preserved outbox rows atomically. Receipt disposition must preserve duplicate/orphan outbox semantics; item acknowledgment takes precedence over device-only classification. Indexed flags must use valid IndexedDB keys (strings/numbers, not booleans).

Version 5 creates a release compatibility requirement: the current production code explicitly opens version 4 and cannot open an upgraded database. Merely restoring old Hosting bytes would not restore save access. Before any migration reaches production, provide and verify a compatible rollback build or staged compatibility rollout. Preserve the current production artifact; do not silently relabel it migration-compatible. All development migration tests use disposable browser profiles and cannot modify existing player data. This remains part of package 6's release decision.


## Transactional condition checkpoint

`condition-outbox.js` owns one row per account in a separate IndexedDB database. Read/write transactions always start from the current shared row, preserve uncertain operations and only acknowledge a matching command. Dispatch uses a Web Lock where available; backend revision/idempotency still protects the no-lock fallback. Disposal never writes a snapshot. Accepted storage work finishes without adopting results into a switched account. The connected feed waits for storage initialization and guards success, errors and recovered confirmations by account identity.

Legacy pending/uncertain work imports once before its unchanged old key is removed. A later restored old key cannot replace a migrated row. Denied/quota storage retains work in memory and emits a visible storage warning; it is explicitly non-durable. An actual eight-case browser run (`condition-tabs-transaction-expanded/`) passes older-tab disposal, lost acknowledgments, dispatch-time tab closure, account switching, legacy recovery, no-Web-Locks concurrent idempotency, quota failure and denied storage, with zero page errors. Transport in this fixture executes the actual server mutation function but is controlled; it is not an SDK/emulator or hosted receipt.

Both the condition migration and planned Journal upgrade require a migration-compatible rollback strategy before production. An old frontend does not understand the new outbox. A local source checkpoint is not authorization to promote storage changes to production.


## Journal and established inventory implementation

Version 5 stores separate `journalOrder` metadata and preserves original records, including unknown fields. Recent lists visit only requested originals. Receipt status uses index counts; dispatch chooses the earliest eligible `nextAttemptAt`, then stable ID, up to 25 rows. This deliberate ready-order change prevents newer eligible rows being hidden behind arbitrary primary-key order; numeric eligibility is unchanged. Retry patches cannot alter owner or item identity. Every indexed writer, import and rollback aborts on synchronous write failures, so originals and indexes cannot commit separately.

Bootstrap retains all items and reads claim/guide identities without copying full event or guide payloads. Stable indexed Backpack membership preserves original insertion precedence, same-instance priority and event aliases. The equipment view reads compact summaries while closed, shows pages of 48 while open and retains keyboard focus across updates. All inventory rows remain available.

Frequent equipment updates write a small controls record tied to the current complete Backpack save generation. Replaced inventories reject older supplements. Full Journal projections preserve ammunition from the latest equipment state. Failed writes return failure and the active game reports unsaved Backpack changes. A full inventory remains intact; this is not a truncated save or cloud backup. Rollback compatibility must include the new controls supplement as well as the condition outbox and Journal database version.

Real IndexedDB `journal-history-indexed/` passes at 0, 1k, 10k and 50k records, retaining exact originals through upgrade/import/rollback. At 50k, three seven-row lists loaded exactly 21 originals (22.5 ms), bootstrap took 262 ms, and two actual Backpack projections took 244 ms. Migration took 5.88 seconds. `journal-transactions-indexed/` passes twelve cases, including receipt owner/duplicate/orphan counts, bounded dispatch, eight injected write failures with exact transaction rollback and simultaneous profile preference edits preserving rewards. These are disposable local profiles, not modifications to user data.

The real equipment component with 50,008 items passes paging, category, keyboard focus and phone-viewport checks. The expanded controls run persists 541 bytes per equipment update and proves ammunition survives reload without replacing the full inventory. The full PR chain passes 1,844 contracts. Actual assembled-world and prescribed movement checks are tracked separately in IMPLEMENTATION.md; these measurements do not close remaining P4 hitch or release gates.
