# Account journey sync — required by owner November 5

The owner requires the same experience across devices. Sign-in must preserve the complete personal journey, not only an account garage and individual online receipts. This supersedes the earlier R&D exclusion of Journal cloud sync.

New anonymous players upgrading to a new email or Google account must link credentials to the existing Firebase identity, preserving already-owned server assets. Signing into an existing account remains a separate account switch with explicit device-history association. Follow Firebase's [anonymous-account conversion guidance](https://firebase.google.com/docs/auth/web/anonymous-auth#convert-an-anonymous-account-to-a-permanent-account). Do not treat an anonymous current user as an already completed Google sign-in.

## Ownership and publication

The original IndexedDB Journal, local Backpack/commerce/housing envelope, and original domain saves remain the active gameplay authorities. Sync transports a versioned private snapshot of those owners; it does not create another quest database, wallet, character model, trusted leaderboard result or entitlement. Server-owned garage, shared deeds, settlements and receipts keep their existing separate authorities.

Use one protected `syncExplorerJourney` endpoint with revoked-token authentication, App Check, explicit UID fencing and bounded requests. Private GCS objects contain one-MiB chunks; a Firestore document beneath the authenticated user's account publishes a completed manifest atomically. No public download URLs or Firebase bearer download tokens. Existing deny-by-default Storage rules stay intact. The last complete save and one previous complete save remain available. Uploads cannot replace the head until all chunks, lengths, SHA-256 and envelope shape pass. Account deletion must remove these objects too.

Snapshots include Journal events, inventory/Guide, companions, character/career preferences and records, original photographs/media, personal Backpack/housing/wallet, original supported mission/voyage/tutorial/return-place and created-route/world-edit saves. Use an explicit key allowlist, never a localStorage dump. Authentication tokens, payment state, provider credentials, shared room leases and renderer caches are excluded. Unsupported versions preserve the current save and offer recovery instead of normalization that drops data.

## Device association and conflicts

- Guests remain local and can export backups. A shared browser's existing history is never automatically assigned to a newly signed-in account.
- A truly empty device can restore the account save. Existing local history requires a deliberate choice. Keep a durable recovery archive through the original Journal store before replacing either local history or an account head.
- Pin UID and operation generation across every asynchronous step. Sign-out/account switches cancel publication and require reassociation; stale responses cannot hydrate or upload another account's history.
- Use a base revision, not last-write-wins. If another device changed the cloud while local work changed, show both save summaries and choose which continues; retain the displaced copy. Never merge linked inventories, events and currency independently.
- Restore validates all constituent owners first, archives the prior snapshot, and records an interrupted-restore recovery marker. Existing transactional Journal import and Backpack compare-and-swap perform writes. Finish by reloading the original owners. A failed restore cannot be called saved or resume gameplay over a mixed snapshot.
- Debounce committed-save notifications outside gameplay frames; coalesce one upload at a time. Show `Saved to your account`, `Saved on this device · sync pending`, `Choose a save` or a truthful failure. Offline/unload interruptions leave the device copy and pending work intact. No menu XP or repeated grants.

## Finite acceptance

1. Shared format/protocol contracts: bounds, version/owner validation, immutable chunks, missing/corrupt chunks, idempotent retry, concurrent revisions, stale UID, private reads and account deletion.
2. Original-store archive/restore contracts: genuine old Journal + media, local house/wallet/inventory, domain state, storage denied and interrupted restore recovery.
3. Two isolated device contexts against the explicit staging backend: choose/associate a real local journey, upload, restore on the second context, preserve career/achievements/home/car choices/media, then produce and resolve a real concurrent-save conflict. Offline/ambiguous retry and account switch must preserve both copies. Dispose only created test accounts/objects/debug credentials.
4. Updated Your journey save status, first-entry association/conflict UI, desktop/touch visual review, required release checks and exact staging artifact. No production/GitHub publication until the combined release is ready.
