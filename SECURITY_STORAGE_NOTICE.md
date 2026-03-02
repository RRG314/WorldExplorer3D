# Security and Storage Notice

Last reviewed: 2026-03-02

Security and data-storage behavior for auth, multiplayer, and optional donation systems.

## 1. Authentication and Identity

- Identity is managed by Firebase Authentication.
- Supported providers: Email/Password and Google.
- ID tokens authorize protected Cloud Functions API calls.

## 2. Billing and Payment Data

- Stripe card/payment data is handled by Stripe-hosted pages.
- Card data is not stored in this repository or Firestore.
- Server-side Stripe keys/secrets are provided through function runtime env (`WE3D_*`).

## 3. Firestore Data Ownership

### User data (`users/{uid}`)

Contains account profile, room quota counters, plan metadata, and optional Stripe references.

Rules:

- users can read/write their own user document and user-owned subcollections
- protected billing/admin behavior is controlled by server + rules constraints

### Room data (`rooms/{roomId}`)

Contains room config and room subcollections for presence/chat/artifacts/blocks/claims/state.

Rules enforce:

- private room access by membership
- public room read visibility
- owner/mod role-based write boundaries

## 4. Local Browser Storage

Known keys in active flows:

- `worldExplorer3D.tutorialState.v1`
- `worldExplorer3D.globeSelector.savedFavorites`
- `worldExplorer3D.firebaseConfig` (optional override)

Local storage is device-local convenience state, not guaranteed cloud backup.

## 5. TTL and Data Retention

TTL-managed (`expiresAt`) collection groups:

- players
- chat
- chatState
- incomingInvites
- recentPlayers
- activityFeed
- artifacts

TTL is asynchronous cleanup and should not be treated as realtime synchronization.

## 6. Recommended Operational Controls

- rotate Stripe credentials immediately if exposure is suspected
- restrict Firebase project admin IAM access
- monitor function logs for auth and webhook failures
- keep HTTPS-only production endpoints

## 7. Current Security Debt

- Functions runtime upgrade to Node 22 is still pending.
- Public/private data safety depends on continued rules deployment discipline.

## 8. User-Facing Disclosure Template

Suggested privacy text:

> World Explorer uses Firebase Authentication and Firestore for account and multiplayer data. Optional donations are processed by Stripe. Card details are handled by Stripe and are not stored by World Explorer.

