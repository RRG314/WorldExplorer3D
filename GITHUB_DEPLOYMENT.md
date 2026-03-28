# GitHub Deployment Guide

Last reviewed: 2026-03-28

Guide for publishing World Explorer 3D with GitHub Pages while keeping backend dependencies explicit.

## 1. Deployment Model

This repository uses GitHub Actions Pages deployment (`deploy-pages-public.yml`) and uploads `./public` as the published artifact.

Default trigger target:

- push to `main`
- manual `workflow_dispatch`

Continuous-world branch note:

- this repository can be deployed manually from `steven/continuous-world-root-repair` with `workflow_dispatch`
- automatic push deployment remains `main` only, which keeps branch work from replacing the live site by accident

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

## 5. Typical Release Sequence

1. Run local release checks.
2. Push branch and open PR.
3. Merge to `main`.
4. Verify both workflows are green:
   - `Runtime Verify`
   - `Deploy GitHub Pages (public)`
5. Smoke test published site.

## 6. Deploying This Branch Intentionally

If you want to publish the continuous-world branch itself:

1. Confirm `public/*` is current:
   - `npm run sync:public`
   - `npm run verify:mirror`
2. Push `steven/continuous-world-root-repair`.
3. In GitHub Actions, run `Deploy GitHub Pages (public)` with `workflow_dispatch` from that branch.

Important:

- this publishes the branch's `public/` artifact to the same Pages site
- it should be treated as an intentional preview/replacement deploy, not a safe background preview
- a later deploy from `main` will replace it again

## 7. Cache Troubleshooting

If stale JS/assets appear after deploy:

1. hard refresh (`Cmd+Shift+R` / `Ctrl+F5`)
2. clear site data for the Pages domain
3. reopen and retest
