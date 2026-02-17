# GitHub Deployment Guide

Last reviewed: 2026-02-17

This guide documents the current GitHub-hosted deployment modes and required Firebase/Stripe integrations.

## 1. Deployment Modes

### 1.1 `WorldExplorer` repository (this repo)

- Repository: `https://github.com/RRG314/WorldExplorer.git`
- Active branch for GitHub Pages rollout: `codex/github-pages-compat`
- Publish model: GitHub Actions deploys `public/` as the Pages artifact
- Workflow file: `.github/workflows/deploy-pages-public.yml`

GitHub Pages settings:

1. `Settings -> Pages`
2. `Build and deployment -> Source: GitHub Actions`
3. Use the `Deploy GitHub Pages (public)` workflow run status as deploy confirmation

### 1.2 `WorldExplorer3D` mirror repository (branch-root mode)

- Repository: `https://github.com/RRG314/WorldExplorer3D.git`
- Branch model for root hosting: branch root (`/`) contains runnable site files
- Pages source can remain branch-root based, or use existing Pages workflow that uploads `path: .`

Use this mode when you want a branch that runs directly from repository root with no `public/` prefix.

## 2. Firebase + Stripe Requirements (Both Modes)

Static hosting can be GitHub Pages, but auth/billing still depend on Firebase/Stripe:

1. Firebase Auth authorized domains must include your Pages host:
   - `rrg314.github.io`
2. Frontend Firebase config must load (`window.WORLD_EXPLORER_FIREBASE`).
3. Cloud Functions must be deployed from the latest branch code:
   - `createCheckoutSession`
   - `createPortalSession`
   - `stripeWebhook`
4. Stripe webhook destination remains:
   - `https://us-central1-worldexplorer3d-d9b83.cloudfunctions.net/stripeWebhook`

## 3. Required One-Time Command After Billing Changes

Run from this repository after function changes:

```bash
cd "/Users/stevenreid/Documents/New project/WorldExplorer3D-rdt-engine"
git checkout codex/github-pages-compat
firebase use worldexplorer3d-d9b83
firebase deploy --only functions
```

## 4. Cache/Path Troubleshooting

### Symptom

Console shows 404s for stale paths like:

- `/WorldExplorer/js/app-entry.js?v=54`
- `/WorldExplorer/js/*.js`

### Cause

Browser cached older loader paths while the app moved to `/app/js/`.

### Mitigation now in repo

Compatibility bridge files in `public/js/`:

- `bootstrap.js`
- `app-entry.js`
- `modules/manifest.js`
- `modules/script-loader.js`

These bridge stale cache paths to `/app/js/` until user cache is refreshed.

### Client-side recovery

1. Hard refresh (`Cmd+Shift+R`)
2. If needed, clear site data for `rrg314.github.io`

## 5. Validation Checklist

After each GitHub deploy:

1. Landing page loads updated hero copy/image.
2. `/app/` loads with no 404 module errors.
3. Auth/account button visible on title screen only; hidden during gameplay.
4. `/account/` loads and checkout redirect works.
5. Legal pages and `Back to Home` links resolve under repo subpath.
