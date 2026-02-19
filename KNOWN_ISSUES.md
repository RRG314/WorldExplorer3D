# Known Issues

Last reviewed: 2026-02-19

This file tracks active risks and required follow-up work.

## High Priority

### 1. Firebase Runtime Config Deprecation (March 2026)

Current functions use `functions.config().stripe.*`.

Risk:

- Deploys depending on runtime config commands will fail when service is shut down.

Required fix:

- migrate Stripe settings to Firebase Params/Secret Manager.

### 2. Cloud Functions Node 20 Deprecation

Cloud warnings indicate Node 20 lifecycle end is approaching.

Required fix:

- upgrade Functions runtime to Node 22 and validate dependencies.

### 3. Dual Runtime Copies in Repository

Active deployed runtime is under `public/app/`, while legacy root runtime files remain.

Risk:

- edits can accidentally be made to wrong path.

Required fix:

- either archive/remove legacy root runtime or add stricter guardrails and CI checks.

## Medium Priority

### 4. Paint Challenge Cloud Leaderboard Rule Coverage

Current runtime supports both flower and paint leaderboard data paths.
Firestore rules currently define explicit create permissions for `flowerLeaderboard`.

Risk:

- Paint leaderboard cloud writes can fail policy checks and silently fall back to
  local leaderboard behavior for some users.

Mitigation:

- add explicit Firestore rule coverage for paint leaderboard collection path
- verify with emulator + production rules test

### 5. Stripe Mode Drift (Test vs Live)

Operational issue observed repeatedly during setup.

Risk:

- mixed key/price/webhook modes cause checkout failure.

Mitigation:

- keep explicit mode-specific setup checklists in docs
- verify `firebase functions:config:get` values before billing tests

### 6. Safe Browsing Reputation Flags

A browser dangerous-site warning was observed on hosted URL in prior testing.

Risk:

- user trust and signup conversion impact.

Mitigation:

- verify Search Console/Safe Browsing status
- use custom domain and security review workflow

### 7. Cloud Sync Feature Completeness

Entitlement includes cloud sync flags, but full gameplay memory/block sync behavior is still primarily local-storage based.

Risk:

- perceived mismatch between plan messaging and implementation depth.

Mitigation:

- define and ship explicit Firestore sync scope for Supporter/Pro saves.

## Low Priority

### 8. Auth UX Polishing

Float auth panel behavior is functional, but additional polish can improve UX:

- loading states and field-level validation styling
- stronger inline provider-status messaging

### 9. Function Generation and Dependency Upgrades

Current deployment remains 1st gen functions.

Potential improvement:

- evaluate 2nd gen migration and dependency modernization after config/runtime migration.

### 10. Browser Cache Path Drift on GitHub Pages

Observed issue:

- Some clients request stale legacy module paths (for example `/WorldExplorer/js/app-entry.js`) after deployment changes.

Mitigation:

- compatibility bridge files under `public/js/` now forward stale loader paths to current `/app/js/` runtime
- users may still need hard refresh/site-data clear on first visit after major deploy transitions

## Reporting Checklist

When filing issues include:

1. URL and route (`/`, `/app/`, `/account/`)
2. signed-in or signed-out state
3. exact error text
4. function log excerpt if backend-related
5. reproduction steps and browser/device
