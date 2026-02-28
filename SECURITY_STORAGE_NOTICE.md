# Security and Storage Notice

Last reviewed: 2026-02-28

This document summarizes current storage and security behavior for auth, optional donations, and user-generated data.

## 1. Auth and Identity

- Authentication is handled by Firebase Auth.
- Supported providers: Google and Email/Password.
- ID tokens are used to authorize checkout/portal/function calls.

## 2. Donation and Payment Data

- Stripe secret keys and webhook secrets are server-side only.
- Frontend does not store Stripe secret credentials.
- Payment card data is handled by Stripe Checkout/Portal; it is not stored in this repository or in Firestore.

## 3. Firestore Data

### `users/{uid}`

Stores:

- plan state (`free|supporter|pro`, with optional legacy `trial` values)
- donation references (`stripeCustomerId`, `stripeSubscriptionId`)
- entitlement flags
- room quota counters

Rules:

- user can read/write only their own document.
- client cannot directly write protected billing/admin entitlement fields.

### `flowerLeaderboard/{entryId}`

- publicly readable leaderboard entries
- authenticated create
- update/delete disabled by rules

## 4. Browser Local Storage

Current runtime uses browser storage for some local features/settings:

- optional Firebase config fallback (`worldExplorer3D.firebaseConfig`)
- challenge local fallback leaderboard
- memory markers
- build blocks
- some UI/perf toggles

Treat browser-stored user data as local-device data, not guaranteed cloud backup.

## 5. Recommended Operational Controls

- Rotate Stripe keys/secrets immediately if exposed.
- Keep Firebase project IAM limited to necessary admins.
- Monitor function logs for auth and webhook failures.
- Use HTTPS-only hosting endpoints.

## 6. Current Security Debt

- Functions runtime config now uses Firebase params/env keys (`WE3D_*`) instead of legacy `functions.config()`.
- Node 20 runtime deprecation requires scheduled upgrade.

## 7. User-Facing Disclosure Guidance

Suggested privacy copy:

> World Explorer uses Firebase Authentication and Firestore for account and multiplayer state. Optional donations are processed by Stripe. Card details are handled by Stripe and are not stored by World Explorer.
