# Save and progression contract — P06 in progress

October 2, 2026. This is a source-backed boundary inventory and implementation record, not a claim of full account synchronization. No player data was migrated by the audit or tests; browser tests use disposable profiles.

| State | Current owner and boundary | Required behavior / evidence |
| --- | --- | --- |
| Journal, discovery claims, Field Guide, Explorer and character progression, companions | `app/js/discovery/profile-store.js`; IndexedDB `world-explorer-discovery`, fixed `local-explorer` profile | Browser/device scoped, including when signed in. Discovery claim, event, guide and reward writes are one transaction. Stable claims and story event IDs deduplicate. Actual IndexedDB concurrent/reload/backup replay checks pass. |
| Memory fallback / explicitly injected memory store | Same module, memory implementation | Session only, no reload promise. Stable-key validation and updater semantics now match IndexedDB. Do not claim this is a durable save. |
| Tool, tutorial and companion profile preferences | Discovery runtime and companion runtime through profile store | Updates must derive from the latest profile inside the write transaction; never write a previously fetched whole profile over newer rewards. Repaired in this slice. Updater callbacks must be synchronous. Whole-profile import/rollback remain explicit operations. |
| Account discovery receipts | `js/discovery-api.js`, `functions/discovery.js`, discovery runtime hydration | Authenticated UID owns server claims/items. Server claim transaction uses a hash of the stable claim ID. Non-admin submissions are `server-receipt`, not independently validated tradeable items. Local receipt application is not a full Journal backup. Server account isolation and retry behavior still require dedicated testing. |
| Backpack | `app/js/player/backpack-store.js` | Browser localStorage v2, legacy migration backup and event/catalog deduplication. Separate from account receipts and full Journal. Existing component checks remain; cross-store crash recovery has not been certified. |
| Interstellar expedition | `app/js/expedition/store.js` | Local expedition record and backup, current schema validation and archive. Separate local owner, not automatically cross-device. |
| Building / world edits | `app/js/block-builder/local-store.js`, `app/js/editable-world/local-store.js` | Local storage is separate from shared/server authority. Publishing or joining does not imply all local drafts are account-backed. Existing recovery checks do not certify every cross-device transition. |

## Repair completed in this slice

A preference writer could fetch a profile, await other work, then save that stale profile after a discovery transaction had awarded progress. It would overwrite the new progress even though the discovery's event/claim remained saved, preventing a replay from recovering the lost reward. All discovery/companion preference writers now use synchronous transactional profile updaters. Independent tutorial entries merge against current state; companion encounter writes merge by identity and timestamp against the current stored encounters. Tool-save failures are caught instead of becoming unhandled promise rejections.

Validation: 1,616 registered component tests passed, no failed/skipped/TODO. Following the final encounter merge, focused save/starter/character checks and source verification passed. Real browser IndexedDB test used two tabs with simultaneous duplicate claims and preference writes: 20 records, 20 tutorial entries, selected tool and rewards survived reload. Backup import and claim replay did not add rewards. Legacy character migration retained its backup and reopening did not repeat migration. No page exceptions. Prescribed-client storage fixture and actual-source Space regression passed; screenshots inspected.

## Remaining P06 gates, in order

1. Account-scoped durable receipt outbox: current `syncTrustedReceipt` catches failure and logs “deferred” but has no durable retry record. Bind pending work to its initiating UID; sign-out/account switching must not upload another account's pending work. Guest progress should remain local unless an explicit, clearly described transfer policy is implemented.
2. Paginated hydration: current `listExplorerDiscoveries` limits responses to 250 with no cursor. Define stable ordering/cursors and restart/retry semantics; test more than 250 records without omissions or duplicate local rewards.
3. Receipt integrity: validate returned claim/catalog/owner association before changing local authority; account hydration must not imply full Journal/character synchronization or invent collection semantics for observation-only records.
4. Cross-store reconciliation: interrupted Journal-to-backpack and companion reward flows, unavailable/quota-limited storage, corrupt/old backups and explicit rollback. Preserve original backups and stable reward identities.
5. Authenticated two-account/two-device and offline/reconnect tests in a controlled environment; distinguish these from component mocks and local browser IndexedDB tests. Extend the save-status UI only to statuses the actual owners can prove.

P06 is not complete. Do not advance to P07 on the basis of the local transaction fix alone. No production or backend deployment was performed.
