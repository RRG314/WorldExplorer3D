# Firebase Release Workflow

Last reviewed: 2026-07-12

This is the production-safe release path for the workspace at:

`/Users/stevenreid/Documents/WorldExplorer3D-live-fix-workspace`

Current production Hosting project:

- Firebase project: `worldexplorer3d-d9b83`
- Live site baseline: `https://worldexplorer3d.io`

Current staging Hosting project:

- Firebase project: `we3d-staging-20260712`
- Staging site: `https://we3d-staging-20260712.web.app`

## 1. Deployment rule

Use one repo and one working workspace for release fixes.

- Do release work here first.
- Do not deploy straight from an unrelated experimental worktree.
- Do not treat GitHub Pages as the production source of truth for `worldexplorer3d.io`.

## 2. Safe release model

Production should move in two steps:

1. Deploy a Firebase Hosting preview channel on the staging Firebase project.
2. After staging verification passes, deploy the approved git ref to the production Firebase project.

## 3. Important limitation

Firebase Hosting preview URLs on the same project talk to the real backend resources for that project. That means:

- preview channels are good for visual QA, runtime debugging, and normal app-flow testing
- preview channels are not the right place for destructive auth/data experiments if you need total isolation

This workspace now has that separate staging Firebase project:

- staging: `we3d-staging-20260712`
- production: `worldexplorer3d-d9b83`

That prevents normal preview testing from using the production Firebase project by default.

## 4. Local commands

Sync and verify the deploy mirror:

```bash
npm run firebase:config:production
npm run sync:public
npm run verify:mirror
```

Apply staging Firebase config and deploy a preview channel:

```bash
npm run firebase:config:staging
npm run preview:deploy -- monaco-drone-fix
```

Apply production Firebase config before any production-targeted local deploy:

```bash
npm run firebase:config:production
```

Optional preview expiration override:

```bash
npm run preview:deploy -- monaco-drone-fix --expires 3d
```

## 5. GitHub workflow shape

This repo now includes:

- `.github/workflows/firebase-hosting-preview.yml`
  - deploys a PR preview channel
  - targets the staging Firebase project
  - uses channel name `pr-<pull_request_number>`
- `.github/workflows/firebase-hosting-production.yml`
  - manual only
  - deploys an explicitly chosen git ref to production Hosting

## 6. Required GitHub secret

Add this repository secret before using the Firebase workflows:

- `FIREBASE_SERVICE_ACCOUNT_WE3D_STAGING_20260712`
- `FIREBASE_SERVICE_ACCOUNT_WORLDEXPLORER3D_D9B83`

## 7. Release gate

Before any production deploy:

1. `npm run release:verify`
2. manual city/ocean/earth/moon/space checks
3. staging preview URL tested first
4. Firebase config switched back to production before prod deploy
5. preview URL tested in normal Chrome, not only a clean fallback profile
6. any user-data-touching features reviewed for staging-vs-production safety
7. Playwright visual verification artifacts captured

## 8. Best next upgrade

For exact browser crash diagnosis and better bug reports, add:

1. Sentry JavaScript error reporting with source maps
2. Sentry Session Replay for startup/crash flows
3. Playwright trace capture against the preview URL

That is the next step once the release path itself is no longer ambiguous.
