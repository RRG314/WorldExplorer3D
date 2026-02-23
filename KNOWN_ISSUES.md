# Known Issues

Last reviewed: 2026-02-23

Current risks and follow-up items for this branch.

## High Priority

### 1. Runtime Config Migration (Firebase Functions)

Functions still rely on `functions.config()` for Stripe values.

Required:

- migrate to Firebase Params/Secret Manager

### 2. Node Runtime Upgrade

Cloud Functions are still on Node 20 in this repository.

Required:

- upgrade to Node 22
- re-test Stripe webhook and account endpoints

### 3. Dual Runtime Maintenance

Two runtime code paths are maintained (`public/app/js/*` and root `js/*`).

Risk:

- future gameplay/input edits may drift between paths.

Mitigation:

- keep mirrored changes and run smoke tests on both hosting modes.

## Medium Priority

### 4. GitHub Pages Cache Drift

Users may retain stale module paths after deploys.

Mitigation:

- hard refresh guidance in docs
- keep compatibility checks in smoke test routine

### 5. Stripe Mode Mismatch

Test/live key or price mismatches can break checkout.

Mitigation:

- verify runtime config before deploy
- inspect function logs after billing tests

### 6. Firestore TTL Latency

TTL cleanup is background and not immediate.

Mitigation:

- rely on client-side stale filtering for presence/chat UX
- treat TTL as cost-control cleanup, not real-time state control

## Low Priority

### 7. UI polish backlog

- additional mobile layout polish for account/social panels
- optional tooltips for room-rule editing and invite flows

### 8. Ops automation

- add automated smoke checks for account + multiplayer flows after deploy
