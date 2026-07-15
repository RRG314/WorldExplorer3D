# GitHub Pages Deployment Guide

Last reviewed: 2026-03-13

Guide for publishing the static GitHub Pages mirror while keeping backend dependencies explicit.

Important: this is not the production release path for `https://worldexplorer3d.io`.
Production Hosting for the live site is tracked in `FIREBASE_RELEASE_WORKFLOW.md`, `STAGING_FIREBASE_SETUP.md`, and `LIVE_DEPLOYMENT_BASELINE.md`.

## 1. Deployment Model

This repository uses GitHub Actions Pages deployment (`deploy-pages-public.yml`) and uploads `./public` as the published artifact.

Default trigger target:

- push to `main`
- manual `workflow_dispatch`

## 2. What Gets Published

Pages artifact root is `public/`:

- landing page: `public/index.html`
- app runtime: `public/app/index.html`
- account: `public/account/index.html`

## 3. Source/Mirror Rule

Canonical app code lives in `app/*`.
Canonical landing/account code lives in `index.html` and `account/index.html`.

Before release, mirror and verify:

```bash
npm run sync:public
npm run verify:mirror
npm run release:verify
```

## 4. Backend Dependencies Still Required

GitHub Pages only serves static assets. The following services still need to be deployed/configured where used:

- Firebase Auth
- Firestore
- Cloud Functions
- Stripe webhook/function path (if billing features enabled)

Pages-origin requirements:

- Cloud Functions CORS allowlist should include your Pages origin.
- Firebase Auth authorized domains should include your Pages origin.
- Optional override for non-standard backend origin: `WORLD_EXPLORER_FUNCTIONS_ORIGIN`.

## 5. Typical Pages Release Sequence

1. Run local release checks.
2. Push branch and open PR.
3. Merge to `main`.
4. Verify both workflows are green:
   - `Runtime Verify`
   - `Deploy GitHub Pages (public)`
5. Smoke test the published Pages mirror.

## 6. Cache Troubleshooting

If stale JS/assets appear after deploy:

1. hard refresh (`Cmd+Shift+R` / `Ctrl+F5`)
2. clear site data for the Pages domain
3. reopen and retest
