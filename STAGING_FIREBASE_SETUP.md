# Staging Firebase Setup

Last reviewed: 2026-07-12

This repository now has a separate staging Firebase project for safe preview testing:

- staging project: `we3d-staging-20260712`
- staging Hosting site: `https://we3d-staging-20260712.web.app`
- staging web app id: `1:524178734996:web:f59acbc9014f0e26f51981`

Production remains:

- production project: `worldexplorer3d-d9b83`
- production live site: `https://worldexplorer3d.io`

## 1. Config switching

Apply staging Firebase web config:

```bash
npm run firebase:config:staging
```

Apply production Firebase web config:

```bash
npm run firebase:config:production
```

The config writer updates:

- `js/firebase-project-config.js`
- `public/js/firebase-project-config.js`
- `public/__/firebase/init.json`
- `public/__/firebase/init.js`

## 2. GitHub Actions secrets

Add these repository secrets:

- `FIREBASE_SERVICE_ACCOUNT_WE3D_STAGING_20260712`
- `FIREBASE_SERVICE_ACCOUNT_WORLDEXPLORER3D_D9B83`

The staging secret is for preview channels.
The production secret is for manual production deploys only.

## 3. Still needed in the staging Firebase console

The project exists, but some product setup may still be needed before full account/multiplayer QA:

1. Authentication
   - enable Email/Password
   - enable Google
   - optionally enable Anonymous auth
2. Firestore
   - create the default database
   - deploy rules and indexes
3. Functions
   - set staging runtime config / secrets for any required endpoints
   - deploy functions if account, multiplayer, moderation, or billing testing needs them
4. Authorized domains
   - add `we3d-staging-20260712.web.app`
   - add `we3d-staging-20260712.firebaseapp.com`

## 4. Preview workflow target

PR previews should now target the staging project, not production.

Manual production deploys should use the approved git ref only after staging verification passes.
